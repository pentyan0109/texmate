import { NextRequest, NextResponse } from "next/server";

// ── Provider dispatch ──────────────────────────────────────────────────────

async function callAnthropic(apiKey: string, system: string, user: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-4-6",
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(e.error?.message ?? `Anthropic ${res.status}`);
  }
  const d = await res.json() as { content?: { text: string }[] };
  return d.content?.[0]?.text ?? "";
}

async function callOpenAI(apiKey: string, system: string, user: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 4096,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(e.error?.message ?? `OpenAI ${res.status}`);
  }
  const d = await res.json() as { choices?: { message?: { content?: string } }[] };
  return d.choices?.[0]?.message?.content ?? "";
}

async function callGemini(apiKey: string, system: string, user: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: 4096 },
      }),
    }
  );
  if (!res.ok) {
    const e = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(e.error?.message ?? `Gemini ${res.status}`);
  }
  const d = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return d.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

// ── Language definitions ───────────────────────────────────────────────────

const LANG_NAMES: Record<string, string> = {
  ja:    "Japanese",
  "en-us": "American English",
  "en-gb": "British English",
  de:    "German",
  fr:    "French",
  zh:    "Simplified Chinese",
};

const TRANSLATE_RULES: Record<string, string> = {
  "en-us": "Use American English spelling and conventions (e.g., 'color', 'analyze', 'center').",
  "en-gb": "Use British English spelling and conventions (e.g., 'colour', 'analyse', 'centre').",
  de:      "Verwende korrektes Hochdeutsch mit akademischem Stil.",
  fr:      "Utilise un français académique standard.",
  zh:      "使用规范的简体中文，采用学术写作风格。",
  ja:      "自然で流暢な日本語学術文体を使用してください。",
};

function buildTranslateSystem(srcLang: string, tgtLang: string): string {
  const srcName = LANG_NAMES[srcLang] ?? srcLang;
  const tgtName = LANG_NAMES[tgtLang] ?? tgtLang;
  const rule    = TRANSLATE_RULES[tgtLang] ?? "";
  return (
    `You are an expert LaTeX editor and professional academic translator. ` +
    `Translate the provided LaTeX document from ${srcName} into ${tgtName}. ` +
    `Rules: ` +
    `(1) Preserve ALL LaTeX commands, environments, math, and document structure exactly — do NOT alter any \\commands, {}, [], or math expressions. ` +
    `(2) Only translate the natural-language text content. ` +
    `(3) ${rule} ` +
    `(4) Maintain academic register appropriate for the document type. ` +
    `Return ONLY the complete translated LaTeX source inside a \`\`\`latex code block.`
  );
}

// ── Static system prompts ──────────────────────────────────────────────────

const SYSTEM: Record<string, string> = {
  explain:
    "あなたはLaTeXの専門家です。提供されたコンパイルログを日本語で分析し、エラーや警告を分かりやすく説明してください。箇条書きで問題点と原因を示してください。",
  fix:
    "あなたはLaTeXの専門家です。提供されたLaTeXコードとエラーログを見て、具体的な修正案をコードブロック付きで日本語で提示してください。",
  generate:
    "You are an expert LaTeX author. Generate clean, compilable LaTeX code based on the description. Wrap the result in a ```latex ... ``` code block. Add comments for clarity.",
  tikz:
    "You are an expert in LaTeX TikZ/PGF graphics. Generate a complete, compilable TikZ figure based on the description. Use \\begin{tikzpicture}...\\end{tikzpicture}. Include necessary \\usepackage{tikz} and any TikZ library imports. Wrap the result in a ```latex ... ``` code block.",
  structure:
    "あなたは学術論文・LaTeX文書の専門家です。提供されたLaTeXコードを分析し、文書の構成を改善するための提案を日本語で行ってください。以下の観点で提案してください：\n1. セクション構成の整合性\n2. 不足している要素（abstract, 参考文献, 図, 表など）\n3. 文書クラスに適した構成\n4. 改善案のLaTeXコードスニペット",
  autocomplete:
    "You are a LaTeX expert. Complete the LaTeX code at the cursor position. The user provides surrounding code context. Return ONLY the completion text (what comes immediately after the cursor), no explanation. Keep it concise.",
};

// ── Route handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const provider = req.headers.get("x-provider") ?? "anthropic";
  const apiKey   = req.headers.get("x-api-key") ?? "";

  if (!apiKey) {
    return NextResponse.json({ error: "APIキーが設定されていません" }, { status: 401 });
  }

  const { action, log, code, prompt, srcLang, tgtLang, context, prefix } = await req.json() as {
    action: string;
    log?: string;
    code?: string;
    prompt?: string;
    srcLang?: string;
    tgtLang?: string;
    context?: string;
    prefix?: string;
  };

  let system = SYSTEM[action] ?? SYSTEM.explain;
  let userContent = "";

  if (action === "explain") {
    userContent = `コンパイルログ:\n\`\`\`\n${log ?? ""}\n\`\`\``;
  } else if (action === "fix") {
    userContent = `LaTeXコード:\n\`\`\`latex\n${code ?? ""}\n\`\`\`\n\nエラーログ:\n\`\`\`\n${log ?? ""}\n\`\`\``;
  } else if (action === "generate") {
    userContent = prompt ?? "";
  } else if (action === "tikz") {
    userContent = `Generate TikZ code for: ${prompt ?? ""}`;
  } else if (action === "structure") {
    userContent = `以下のLaTeXコードを分析して構成提案をしてください:\n\`\`\`latex\n${code ?? ""}\n\`\`\``;
  } else if (action === "translate") {
    system      = buildTranslateSystem(srcLang ?? "ja", tgtLang ?? "en-us");
    userContent = `\`\`\`latex\n${code ?? ""}\n\`\`\``;
  } else if (action === "autocomplete") {
    userContent = `Context (before cursor):\n\`\`\`latex\n${context ?? ""}\n\`\`\`\n\nComplete starting from: ${prefix ?? ""}`;
  }

  try {
    let result = "";
    if (provider === "openai")       result = await callOpenAI(apiKey, system, userContent);
    else if (provider === "gemini")  result = await callGemini(apiKey, system, userContent);
    else                             result = await callAnthropic(apiKey, system, userContent);
    return NextResponse.json({ result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "不明なエラー";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
