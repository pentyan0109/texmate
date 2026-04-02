"use client";
import { useState, useEffect, useRef } from "react";

interface Match {
  file: string;
  line: number;
  text: string;
  column: number;
}

interface Props {
  project: string;
  onJump: (file: string, line: number) => void;
  onClose: () => void;
}

export default function GlobalSearch({ project, onJump, onClose }: Props) {
  const [query, setQuery]         = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [matches, setMatches]     = useState<Match[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (!query.trim()) { setMatches([]); return; }
    const timer = setTimeout(search, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, caseSensitive]);

  async function search() {
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    const cs = caseSensitive ? "&cs=1" : "";
    const res = await fetch(`/api/search?project=${encodeURIComponent(project)}&q=${encodeURIComponent(query)}${cs}`);
    const data = await res.json() as { matches?: Match[]; error?: string };
    setLoading(false);
    if (data.error) { setError(data.error); return; }
    setMatches(data.matches ?? []);
  }

  // Group by file
  const byFile: Record<string, Match[]> = {};
  for (const m of matches) {
    if (!byFile[m.file]) byFile[m.file] = [];
    byFile[m.file].push(m);
  }

  function highlight(text: string, q: string) {
    if (!q) return text;
    const idx = caseSensitive ? text.indexOf(q) : text.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-yellow-500 text-black">{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/60" onClick={onClose}>
      <div
        className="bg-gray-800 border border-gray-600 rounded-lg w-[640px] max-h-[70vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700">
          <span className="text-gray-400">🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") onClose(); if (e.key === "Enter") search(); }}
            placeholder={`「${project}」内を検索...`}
            className="flex-1 bg-transparent text-white text-sm focus:outline-none placeholder-gray-600"
          />
          <button
            onClick={() => setCaseSensitive(!caseSensitive)}
            className={`text-xs px-2 py-0.5 rounded border ${caseSensitive ? "bg-blue-700 border-blue-600 text-white" : "border-gray-600 text-gray-500 hover:bg-gray-700"}`}
            title="大文字/小文字を区別"
          >
            Aa
          </button>
          <span className="text-xs text-gray-600">
            {loading ? "検索中..." : matches.length > 0 ? `${matches.length} 件` : ""}
          </span>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">✕</button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="px-4 py-2 text-xs text-red-400">{error}</div>
          )}
          {!query.trim() && (
            <div className="px-4 py-8 text-xs text-gray-600 text-center">検索ワードを入力してください</div>
          )}
          {query.trim() && matches.length === 0 && !loading && (
            <div className="px-4 py-8 text-xs text-gray-600 text-center">一致なし</div>
          )}
          {Object.entries(byFile).map(([file, fileMatches]) => (
            <div key={file}>
              <div className="px-3 py-1.5 bg-gray-750 bg-gray-900/60 border-y border-gray-700/50 sticky top-0">
                <span className="text-xs font-bold text-blue-400">{file}</span>
                <span className="text-xs text-gray-600 ml-2">{fileMatches.length} 件</span>
              </div>
              {fileMatches.map((m, i) => (
                <button
                  key={i}
                  className="w-full text-left px-4 py-1.5 hover:bg-gray-700 flex items-baseline gap-3"
                  onClick={() => { onJump(m.file, m.line); onClose(); }}
                >
                  <span className="text-xs text-gray-600 font-mono w-8 shrink-0 text-right">{m.line}</span>
                  <span className="text-xs text-gray-300 font-mono truncate">
                    {highlight(m.text, query)}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
