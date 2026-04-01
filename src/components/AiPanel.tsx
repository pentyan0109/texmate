"use client";
import { useState, useEffect } from "react";

type Provider = "anthropic" | "openai" | "gemini";
type Action   = "explain" | "fix" | "generate" | "translate";

const PROVIDERS: { id: Provider; label: string; color: string }[] = [
  { id: "anthropic", label: "Claude",  color: "bg-orange-700" },
  { id: "openai",    label: "GPT-4o",  color: "bg-green-700"  },
  { id: "gemini",    label: "Gemini",  color: "bg-blue-700"   },
];

const ACTIONS: { id: Action; label: string; group: "assist" | "translate" }[] = [
  { id: "explain",   label: "ログを説明", group: "assist"    },
  { id: "fix",       label: "修正を提案", group: "assist"    },
  { id: "generate",  label: "LaTeX生成",  group: "assist"    },
  { id: "translate", label: "翻訳",       group: "translate" },
];

const LANGUAGES: { id: string; label: string; flag: string }[] = [
  { id: "ja",    label: "日本語",          flag: "🇯🇵" },
  { id: "en-us", label: "English (US)",    flag: "🇺🇸" },
  { id: "en-gb", label: "English (UK)",    flag: "🇬🇧" },
  { id: "de",    label: "Deutsch",         flag: "🇩🇪" },
  { id: "fr",    label: "Français",        flag: "🇫🇷" },
  { id: "zh",    label: "中文（简体）",    flag: "🇨🇳" },
];

function storageKey(p: Provider) { return `texmate_${p}_key`; }

interface Props {
  code: string;
  log: string;
  onInsert: (snippet: string) => void;
  onOpenSettings: () => void;
}

export default function AiPanel({ code, log, onInsert, onOpenSettings }: Props) {
  const [provider, setProvider]   = useState<Provider>("anthropic");
  const [hasKey, setHasKey]       = useState(false);
  const [action, setAction]       = useState<Action>("explain");
  const [genPrompt, setGenPrompt] = useState("");
  const [srcLang, setSrcLang]     = useState("ja");
  const [tgtLang, setTgtLang]     = useState("en-us");
  const [result, setResult]       = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");

  useEffect(() => {
    const saved  = localStorage.getItem("texmate_active_provider") as Provider | null;
    const first  = (["anthropic", "openai", "gemini"] as Provider[]).find(
      (p) => !!localStorage.getItem(storageKey(p))
    );
    const active = saved ?? first ?? "anthropic";
    setProvider(active);
    setHasKey(!!localStorage.getItem(storageKey(active)));
  }, []);

  function switchProvider(p: Provider) {
    setProvider(p);
    setHasKey(!!localStorage.getItem(storageKey(p)));
    localStorage.setItem("texmate_active_provider", p);
    setResult("");
    setError("");
  }

  // Prevent src === tgt
  function changeSrc(v: string) {
    setSrcLang(v);
    if (v === tgtLang) setTgtLang(LANGUAGES.find((l) => l.id !== v)!.id);
  }
  function changeTgt(v: string) {
    setTgtLang(v);
    if (v === srcLang) setSrcLang(LANGUAGES.find((l) => l.id !== v)!.id);
  }

  const canRun = hasKey && (
    action === "explain" ||
    action === "fix"     ||
    (action === "generate"  && genPrompt.trim()) ||
    (action === "translate" && code.trim())
  );

  async function run() {
    const apiKey = localStorage.getItem(storageKey(provider));
    if (!apiKey) return;
    setLoading(true);
    setResult("");
    setError("");

    const body: Record<string, string> = { action };
    if (action === "explain")   { body.log = log; }
    if (action === "fix")       { body.code = code; body.log = log; }
    if (action === "generate")  { body.prompt = genPrompt; }
    if (action === "translate") { body.code = code; body.srcLang = srcLang; body.tgtLang = tgtLang; }

    const res = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-provider": provider, "x-api-key": apiKey },
      body: JSON.stringify(body),
    });
    const data = await res.json() as { result?: string; error?: string };
    setLoading(false);
    if (res.ok && data.result) {
      setResult(data.result);
    } else {
      setError(data.error ?? "エラーが発生しました");
    }
  }

  function extractCode(text: string): string | null {
    const m = text.match(/```(?:latex)?\n([\s\S]*?)```/);
    return m ? m[1].trim() : null;
  }

  const providerInfo = PROVIDERS.find((p) => p.id === provider)!;
  const srcFlag = LANGUAGES.find((l) => l.id === srcLang)?.flag ?? "";
  const tgtFlag = LANGUAGES.find((l) => l.id === tgtLang)?.flag ?? "";

  return (
    <div className="shrink-0 h-60 border-t border-gray-700 bg-gray-900 flex flex-col overflow-hidden">

      {/* Row 1: Provider tabs */}
      <div className="flex items-center gap-1 px-3 pt-1.5 pb-1 border-b border-gray-700/50 shrink-0">
        <span className="text-xs font-bold text-purple-400 mr-1">✦ AI</span>
        {PROVIDERS.map((p) => {
          const hasK = !!localStorage.getItem(storageKey(p.id));
          return (
            <button key={p.id} onClick={() => switchProvider(p.id)}
              className={`text-xs px-2 py-0.5 rounded transition-colors ${
                provider === p.id ? `${p.color} text-white` : "bg-gray-700 text-gray-400 hover:bg-gray-600"
              }`}
            >
              {p.label}{!hasK && " ⚠"}
            </button>
          );
        })}
        <div className="flex-1" />
        {!hasKey && (
          <button onClick={onOpenSettings} className="text-xs text-yellow-400 hover:text-yellow-300">
            APIキーを設定 →
          </button>
        )}
      </div>

      {/* Row 2: Action tabs + run button */}
      <div className="flex items-center gap-1 px-3 py-1 border-b border-gray-700 shrink-0">
        {ACTIONS.map((a) => (
          <button key={a.id} onClick={() => setAction(a.id)}
            className={`text-xs px-2 py-0.5 rounded ${
              action === a.id
                ? (a.group === "translate" ? "bg-teal-700 text-white" : "bg-purple-700 text-white")
                : "bg-gray-700 text-gray-400 hover:bg-gray-600"
            }`}
          >
            {a.label}
          </button>
        ))}

        {/* Inline language selectors when translate is active */}
        {action === "translate" && (
          <div className="flex items-center gap-1 ml-1">
            <select value={srcLang} onChange={(e) => changeSrc(e.target.value)}
              className="text-xs bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-white focus:outline-none focus:border-teal-500"
            >
              {LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>{l.flag} {l.label}</option>
              ))}
            </select>
            <span className="text-gray-500 text-xs">→</span>
            <select value={tgtLang} onChange={(e) => changeTgt(e.target.value)}
              className="text-xs bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-white focus:outline-none focus:border-teal-500"
            >
              {LANGUAGES.filter((l) => l.id !== srcLang).map((l) => (
                <option key={l.id} value={l.id}>{l.flag} {l.label}</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex-1" />
        <button onClick={run} disabled={loading || !canRun}
          className={`text-xs px-3 py-0.5 rounded text-white font-bold disabled:opacity-40 hover:opacity-90 ${providerInfo.color}`}
        >
          {loading ? "実行中..." : "▶ 実行"}
        </button>
      </div>

      {/* Translate info */}
      {action === "translate" && (
        <div className="px-3 py-1 bg-teal-900/20 border-b border-gray-700/50 shrink-0">
          <span className="text-xs text-teal-400">
            {srcFlag} → {tgtFlag}　LaTeXコマンドを保持しながらテキストを翻訳します
          </span>
        </div>
      )}

      {/* Generate prompt */}
      {action === "generate" && (
        <div className="px-3 py-1.5 border-b border-gray-700 shrink-0">
          <input value={genPrompt} onChange={(e) => setGenPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && run()}
            placeholder="生成したいLaTeXの内容を説明（例：3×3 identity matrix, Gaussian integral）"
            className="w-full text-xs bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
          />
        </div>
      )}

      {/* Result area */}
      <div className="flex-1 overflow-auto px-3 py-2">
        {error && (
          <div className="text-xs text-red-400 bg-red-900/30 rounded px-2 py-1">{error}</div>
        )}
        {result && (
          <div className="space-y-2">
            <pre className="text-xs text-gray-200 whitespace-pre-wrap font-mono leading-relaxed">{result}</pre>
            {(action === "generate" || action === "translate") && extractCode(result) && (
              <button
                onClick={() => { const c = extractCode(result); if (c) onInsert(c); }}
                className="text-xs bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded text-white"
              >
                エディタに挿入
              </button>
            )}
          </div>
        )}
        {!result && !error && !loading && (
          <div className="text-xs text-gray-600 text-center mt-3">
            {hasKey ? "アクションを選択して ▶ 実行" : `${providerInfo.label} の APIキーを設定してください`}
          </div>
        )}
      </div>
    </div>
  );
}
