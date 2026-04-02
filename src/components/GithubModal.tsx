"use client";
import { useState, useEffect } from "react";

interface Repo { name: string; branch: string; private: boolean }

interface Props {
  project: string;
  onRefreshFiles: () => void;
  onClose: () => void;
}

const TOKEN_KEY = "texmate_github_token";

export default function GithubModal({ project, onRefreshFiles, onClose }: Props) {
  const [token, setToken]         = useState("");
  const [showToken, setShowToken] = useState(false);
  const [repos, setRepos]         = useState<Repo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [branch, setBranch]       = useState("main");
  const [loading, setLoading]     = useState(false);
  const [msg, setMsg]             = useState("");
  const [msgType, setMsgType]     = useState<"ok" | "err">("ok");
  const [commitMsg, setCommitMsg] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem(TOKEN_KEY) ?? "";
    setToken(saved);
  }, []);

  function saveToken() {
    localStorage.setItem(TOKEN_KEY, token);
    setMsg("トークン保存済み");
    setMsgType("ok");
  }

  async function loadRepos() {
    if (!token) return;
    setLoading(true);
    setMsg("");
    const res = await fetch("/api/github?action=repos", {
      headers: { "x-github-token": token },
    });
    setLoading(false);
    if (res.ok) {
      const data = await res.json() as { repos: Repo[] };
      setRepos(data.repos ?? []);
    } else {
      setMsg("リポジトリ取得に失敗しました。トークンを確認してください。");
      setMsgType("err");
    }
  }

  async function doPush() {
    if (!selectedRepo) return;
    const [owner, repo] = selectedRepo.split("/");
    setLoading(true);
    setMsg("プッシュ中...");
    const res = await fetch("/api/github", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-github-token": token },
      body: JSON.stringify({
        action: "push",
        owner, repo, branch, project,
        message: commitMsg || `TexMate: update ${project}`,
      }),
    });
    const data = await res.json() as { ok?: boolean; files?: number; error?: string; sha?: string };
    setLoading(false);
    if (data.ok) {
      setMsg(`✓ ${data.files} ファイルをプッシュしました (${data.sha?.slice(0, 7)})`);
      setMsgType("ok");
    } else {
      setMsg(`エラー: ${data.error}`);
      setMsgType("err");
    }
  }

  async function doPull() {
    if (!selectedRepo) return;
    const [owner, repo] = selectedRepo.split("/");
    if (!confirm(`「${selectedRepo}」からプル（上書き）します。よろしいですか？`)) return;
    setLoading(true);
    setMsg("プル中...");
    const res = await fetch("/api/github", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-github-token": token },
      body: JSON.stringify({ action: "pull", owner, repo, branch, project }),
    });
    const data = await res.json() as { ok?: boolean; files?: number; error?: string };
    setLoading(false);
    if (data.ok) {
      setMsg(`✓ ${data.files} ファイルをプルしました`);
      setMsgType("ok");
      onRefreshFiles();
    } else {
      setMsg(`エラー: ${data.error}`);
      setMsgType("err");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-gray-800 border border-gray-600 rounded-lg w-[520px] max-h-[85vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <span className="font-bold text-white flex items-center gap-2">
            GitHub 同期
            <span className="text-xs text-gray-500 font-normal">— {project}</span>
          </span>
          <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Token */}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Personal Access Token (repo スコープ)</label>
            <div className="flex gap-2">
              <input
                type={showToken ? "text" : "password"}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="ghp_..."
                className="flex-1 text-sm bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={() => setShowToken(!showToken)}
                className="text-xs bg-gray-700 hover:bg-gray-600 px-2 rounded border border-gray-600 text-gray-400"
              >
                {showToken ? "隠す" : "表示"}
              </button>
              <button
                onClick={saveToken}
                className="text-xs bg-blue-600 hover:bg-blue-500 px-3 rounded text-white"
              >
                保存
              </button>
            </div>
            <p className="text-xs text-gray-600 mt-1">
              GitHub → Settings → Developer settings → Personal access tokens → repo スコープが必要
            </p>
          </div>

          {/* Load repos */}
          <div className="flex gap-2">
            <button
              onClick={loadRepos}
              disabled={!token || loading}
              className="text-xs bg-gray-600 hover:bg-gray-500 disabled:opacity-50 px-3 py-1 rounded text-white"
            >
              リポジトリ一覧を取得
            </button>
          </div>

          {/* Repo selector */}
          {repos.length > 0 && (
            <div>
              <label className="text-xs text-gray-400 mb-1 block">リポジトリ</label>
              <select
                value={selectedRepo}
                onChange={(e) => {
                  setSelectedRepo(e.target.value);
                  const r = repos.find((r) => r.name === e.target.value);
                  if (r) setBranch(r.branch);
                }}
                className="w-full text-sm bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white focus:outline-none focus:border-blue-500"
              >
                <option value="">選択してください</option>
                {repos.map((r) => (
                  <option key={r.name} value={r.name}>
                    {r.private ? "🔒 " : "🌐 "}{r.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Branch */}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">ブランチ</label>
            <input
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className="w-full text-sm bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Commit message (for push) */}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">コミットメッセージ（プッシュ時）</label>
            <input
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              placeholder={`TexMate: update ${project}`}
              className="w-full text-sm bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Status */}
          {msg && (
            <div className={`text-xs px-3 py-2 rounded ${msgType === "ok" ? "bg-green-900/40 text-green-300" : "bg-red-900/40 text-red-300"}`}>
              {msg}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-4 py-3 border-t border-gray-700">
          <button
            onClick={doPull}
            disabled={!selectedRepo || loading}
            className="flex-1 text-sm bg-amber-700 hover:bg-amber-600 disabled:opacity-50 py-2 rounded text-white font-bold"
          >
            {loading ? "処理中..." : "⬇ プル（取得）"}
          </button>
          <button
            onClick={doPush}
            disabled={!selectedRepo || loading}
            className="flex-1 text-sm bg-green-700 hover:bg-green-600 disabled:opacity-50 py-2 rounded text-white font-bold"
          >
            {loading ? "処理中..." : "⬆ プッシュ（送信）"}
          </button>
        </div>
      </div>
    </div>
  );
}
