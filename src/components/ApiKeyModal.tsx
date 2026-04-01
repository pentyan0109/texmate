"use client";
import { useState, useEffect } from "react";

type Provider = "anthropic" | "openai" | "gemini";

const PROVIDERS: { id: Provider; label: string; placeholder: string; color: string }[] = [
  { id: "anthropic", label: "Anthropic (Claude)",  placeholder: "sk-ant-...",   color: "text-orange-400" },
  { id: "openai",    label: "OpenAI (GPT-4o)",      placeholder: "sk-...",       color: "text-green-400"  },
  { id: "gemini",    label: "Google (Gemini)",       placeholder: "AIza...",      color: "text-blue-400"   },
];

function storageKey(p: Provider) { return `texmate_${p}_key`; }

export default function ApiKeyModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab]           = useState<Provider>("anthropic");
  const [keys, setKeys]         = useState<Record<Provider, string>>({ anthropic: "", openai: "", gemini: "" });
  const [show, setShow]         = useState(false);
  const [testing, setTesting]   = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    setKeys({
      anthropic: localStorage.getItem(storageKey("anthropic")) ?? "",
      openai:    localStorage.getItem(storageKey("openai"))    ?? "",
      gemini:    localStorage.getItem(storageKey("gemini"))    ?? "",
    });
  }, []);

  // Reset test result when switching tabs
  function switchTab(p: Provider) { setTab(p); setTestResult(null); setShow(false); }

  const currentKey = keys[tab];

  async function testKey() {
    setTesting(true);
    setTestResult(null);
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-provider": tab, "x-api-key": currentKey },
      body: JSON.stringify({ action: "explain", log: "test" }),
    });
    setTesting(false);
    if (res.ok) {
      setTestResult({ ok: true, msg: "接続成功！" });
    } else {
      const d = await res.json().catch(() => ({})) as { error?: string };
      setTestResult({ ok: false, msg: d.error ?? `エラー (${res.status})` });
    }
  }

  function save() {
    localStorage.setItem(storageKey(tab), currentKey.trim());
    onClose();
  }

  function remove() {
    localStorage.removeItem(storageKey(tab));
    setKeys((k) => ({ ...k, [tab]: "" }));
    setTestResult(null);
  }

  const info = PROVIDERS.find((p) => p.id === tab)!;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-gray-800 border border-gray-600 rounded-lg w-full max-w-lg shadow-xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-base font-bold text-white">API キー設定</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg">✕</button>
        </div>

        {/* Provider tabs */}
        <div className="flex border-b border-gray-700 px-6">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              onClick={() => switchTab(p.id)}
              className={`text-xs px-3 py-2 border-b-2 transition-colors ${
                tab === p.id
                  ? `border-blue-500 ${p.color} font-bold`
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              {p.label}
              {localStorage.getItem(storageKey(p.id)) && (
                <span className="ml-1 text-green-500">●</span>
              )}
            </button>
          ))}
        </div>

        <div className="px-6 py-4 space-y-3">
          <p className="text-xs text-gray-400">
            {tab === "anthropic" && <>Anthropic Console (<span className="text-orange-300">console.anthropic.com</span>) で取得した API キーを入力してください。</>}
            {tab === "openai"    && <>OpenAI Platform (<span className="text-green-300">platform.openai.com</span>) で取得した API キーを入力してください。</>}
            {tab === "gemini"    && <>Google AI Studio (<span className="text-blue-300">aistudio.google.com</span>) で取得した API キーを入力してください。</>}
            {" "}キーはブラウザの localStorage にのみ保存されます。
          </p>

          <div className="flex gap-2">
            <input
              type={show ? "text" : "password"}
              value={currentKey}
              onChange={(e) => setKeys((k) => ({ ...k, [tab]: e.target.value }))}
              placeholder={info.placeholder}
              className="flex-1 text-sm bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono"
            />
            <button
              onClick={() => setShow(!show)}
              className="text-xs bg-gray-700 hover:bg-gray-600 border border-gray-600 px-3 rounded text-gray-300"
            >
              {show ? "隠す" : "表示"}
            </button>
          </div>

          {testResult && (
            <div className={`text-xs px-3 py-2 rounded ${testResult.ok ? "bg-green-900 text-green-300" : "bg-red-900 text-red-300"}`}>
              {testResult.msg}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={testKey}
              disabled={!currentKey.trim() || testing}
              className="text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-40 border border-gray-600 px-3 py-1.5 rounded text-white"
            >
              {testing ? "テスト中..." : "接続テスト"}
            </button>
            <div className="flex-1" />
            <button onClick={remove} className="text-xs text-red-400 hover:text-red-300 px-3 py-1.5">削除</button>
            <button
              onClick={save}
              disabled={!currentKey.trim()}
              className="text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-40 px-4 py-1.5 rounded text-white font-bold"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
