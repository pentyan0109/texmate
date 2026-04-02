import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const PROJECTS_DIR = process.env.PROJECTS_DIR ?? path.join(process.cwd(), "projects");

// Helper: base64 encode/decode
function b64encode(str: string) { return Buffer.from(str, "utf-8").toString("base64"); }
function b64decode(b64: string) { return Buffer.from(b64, "base64").toString("utf-8"); }

// GitHub API base
const GH = "https://api.github.com";

async function ghFetch(token: string, url: string, options: RequestInit = {}) {
  return fetch(url, {
    ...options,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
}

// GET: list repos or get repo status
// ?action=repos  → list user's repos
// ?action=status&owner=X&repo=Y&project=Z  → compare project files vs repo
export async function GET(req: NextRequest) {
  const token = req.headers.get("x-github-token") ?? "";
  if (!token) return NextResponse.json({ error: "token required" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  if (action === "repos") {
    const res = await ghFetch(token, `${GH}/user/repos?per_page=100&sort=updated&type=all`);
    if (!res.ok) return NextResponse.json({ error: "GitHub API error" }, { status: res.status });
    const data = await res.json() as { full_name: string; default_branch: string; private: boolean }[];
    return NextResponse.json({ repos: data.map((r) => ({ name: r.full_name, branch: r.default_branch, private: r.private })) });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

// POST: push or pull
// body: { action: "push"|"pull", owner, repo, branch, project, message? }
export async function POST(req: NextRequest) {
  const token = req.headers.get("x-github-token") ?? "";
  if (!token) return NextResponse.json({ error: "token required" }, { status: 401 });

  const { action, owner, repo, branch, project, message } = await req.json() as {
    action: string; owner: string; repo: string;
    branch: string; project: string; message?: string;
  };

  const projectDir = path.join(PROJECTS_DIR, project);

  if (action === "push") {
    // Collect all .tex/.bib/.sty files
    const files: { path: string; content: string }[] = [];
    function collectFiles(dir: string, relBase: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith(".")) continue;
        const full = path.join(dir, entry.name);
        const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          collectFiles(full, rel);
        } else {
          const ext = path.extname(entry.name).toLowerCase();
          if ([".tex", ".bib", ".sty"].includes(ext)) {
            files.push({ path: rel, content: fs.readFileSync(full, "utf-8") });
          }
        }
      }
    }
    collectFiles(projectDir, "");

    // Get current tree SHA
    const refRes = await ghFetch(token, `${GH}/repos/${owner}/${repo}/git/refs/heads/${branch}`);
    let parentSha: string | null = null;
    let baseTreeSha: string | null = null;

    if (refRes.ok) {
      const refData = await refRes.json() as { object?: { sha: string } };
      parentSha = refData.object?.sha ?? null;
      if (parentSha) {
        const commitRes = await ghFetch(token, `${GH}/repos/${owner}/${repo}/git/commits/${parentSha}`);
        const commitData = await commitRes.json() as { tree?: { sha: string } };
        baseTreeSha = commitData.tree?.sha ?? null;
      }
    }

    // Create blobs
    const treeItems: { path: string; mode: string; type: string; sha: string }[] = [];
    for (const f of files) {
      const blobRes = await ghFetch(token, `${GH}/repos/${owner}/${repo}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({ content: b64encode(f.content), encoding: "base64" }),
      });
      if (!blobRes.ok) {
        const err = await blobRes.json() as { message?: string };
        return NextResponse.json({ error: `Blob creation failed: ${err.message}` }, { status: 500 });
      }
      const blobData = await blobRes.json() as { sha: string };
      treeItems.push({ path: f.path, mode: "100644", type: "blob", sha: blobData.sha });
    }

    // Create tree
    const treeBody: Record<string, unknown> = { tree: treeItems };
    if (baseTreeSha) treeBody.base_tree = baseTreeSha;
    const treeRes = await ghFetch(token, `${GH}/repos/${owner}/${repo}/git/trees`, {
      method: "POST",
      body: JSON.stringify(treeBody),
    });
    if (!treeRes.ok) return NextResponse.json({ error: "Tree creation failed" }, { status: 500 });
    const treeData = await treeRes.json() as { sha: string };

    // Create commit
    const commitBody: Record<string, unknown> = {
      message: message ?? `TexMate: update ${project}`,
      tree: treeData.sha,
    };
    if (parentSha) commitBody.parents = [parentSha];
    const commitRes = await ghFetch(token, `${GH}/repos/${owner}/${repo}/git/commits`, {
      method: "POST",
      body: JSON.stringify(commitBody),
    });
    if (!commitRes.ok) return NextResponse.json({ error: "Commit creation failed" }, { status: 500 });
    const commitData = await commitRes.json() as { sha: string };

    // Update or create ref
    if (refRes.ok) {
      await ghFetch(token, `${GH}/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
        method: "PATCH",
        body: JSON.stringify({ sha: commitData.sha }),
      });
    } else {
      await ghFetch(token, `${GH}/repos/${owner}/${repo}/git/refs`, {
        method: "POST",
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commitData.sha }),
      });
    }

    return NextResponse.json({ ok: true, sha: commitData.sha, files: files.length });
  }

  if (action === "pull") {
    // Get tree from GitHub
    const treeRes = await ghFetch(
      token,
      `${GH}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`
    );
    if (!treeRes.ok) return NextResponse.json({ error: "Cannot read repo tree" }, { status: 404 });
    const treeData = await treeRes.json() as { tree?: { path: string; type: string; sha: string }[] };

    const texFiles = (treeData.tree ?? []).filter(
      (f) => f.type === "blob" && [".tex", ".bib", ".sty"].some((e) => f.path.endsWith(e))
    );

    if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });

    let pulled = 0;
    for (const f of texFiles) {
      const blobRes = await ghFetch(token, `${GH}/repos/${owner}/${repo}/git/blobs/${f.sha}`);
      if (!blobRes.ok) continue;
      const blobData = await blobRes.json() as { content: string; encoding: string };
      const content = blobData.encoding === "base64" ? b64decode(blobData.content.replace(/\n/g, "")) : blobData.content;
      const destPath = path.join(projectDir, f.path);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.writeFileSync(destPath, content, "utf-8");
      pulled++;
    }

    return NextResponse.json({ ok: true, files: pulled });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
