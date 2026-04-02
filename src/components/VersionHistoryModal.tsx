"use client";
import { useState, useEffect } from "react";
import { diffLines } from "diff";

interface Snapshot {
  snapshot: string;
  timestamp: string;
  content: string;
}

interface Props {
  project: string;
  file: string;
  currentContent: string;
  onRestore: (content: string) => void;
  onClose: () => void;
}

function formatTimestamp(ts: string) {
  return ts.replace(/T/, " ").replace(/-(\d\d)-(\d\d)$/, ":$1:$2");
}

function DiffView({ oldText, newText }: { oldText: string; newText: string }) {
  const parts = diffLines(oldText, newText);
  let lineNum = 1;

  return (
    <div className="font-mono text-xs leading-relaxed overflow-auto h-full">
      <table className="w-full border-collapse">
        <tbody>
          {parts.map((part, pi) => {
            const lines = part.value.split("\n");
            if (lines[lines.length - 1] === "") lines.pop();
            return lines.map((line, li) => {
              const ln = lineNum++;
              const bg = part.added ? "bg-green-900/40 text-green-300"
                : part.removed ? "bg-red-900/40 text-red-300"
                : "text-gray-400";
              const prefix = part.added ? "+" : part.removed ? "−" : " ";
              return (
                <tr key={`${pi}-${li}`} className={bg}>
                  <td className="select-none w-8 text-right pr-2 pl-1 text-gray-600 border-r border-gray-700">
                    {!part.removed ? ln : ""}
                  </td>
                  <td className="pl-2 pr-1 whitespace-pre-wrap break-all">
                    <span className={part.added ? "text-green-500" : part.removed ? "text-red-500" : "text-gray-600"}>
                      {prefix}
                    </span>
                    {line}
                  </td>
                </tr>
              );
            });
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function VersionHistoryModal({ project, file, currentContent, onRestore, onClose }: Props) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [selected, setSelected]   = useState<Snapshot | null>(null);
  const [loading, setLoading]     = useState(true);
  const [viewMode, setViewMode]   = useState<"diff" | "full">("diff");

  useEffect(() => {
    fetch(`/api/history?project=${encodeURIComponent(project)}&file=${encodeURIComponent(file)}`)
      .then((r) => r.json())
      .then((d) => { setSnapshots(d.snapshots ?? []); setLoading(false); });
  }, [project, file]);

  // Compare selected snapshot vs current; or selected vs previous snapshot
  const compareBase = selected ? currentContent : currentContent;
  const compareTarget = selected ? selected.content : currentContent;

  const diffStats = (() => {
    if (!selected) return null;
    const parts = diffLines(selected.content, currentContent);
    let added = 0, removed = 0;
    for (const p of parts) {
      const n = (p.value.match(/\n/g) ?? []).length || 1;
      if (p.added) added += n;
      else if (p.removed) removed += n;
    }
    return { added, removed };
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-gray-800 border border-gray-600 rounded-lg w-[780px] max-h-[85vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <span className="font-bold text-white">バージョン履歴</span>
            <span className="text-xs text-gray-400">{file}</span>
            {selected && diffStats && (
              <span className="text-xs">
                <span className="text-green-400">+{diffStats.added}</span>
                <span className="text-gray-600 mx-1">/</span>
                <span className="text-red-400">−{diffStats.removed}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode(viewMode === "diff" ? "full" : "diff")}
              className={`text-xs px-2 py-0.5 rounded border ${
                viewMode === "diff"
                  ? "bg-indigo-700 border-indigo-600 text-white"
                  : "border-gray-600 text-gray-400 hover:bg-gray-700"
              }`}
            >
              差分表示
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-white ml-2">✕</button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Snapshot list */}
          <div className="w-52 border-r border-gray-700 overflow-y-auto shrink-0 flex flex-col">
            {loading ? (
              <div className="p-4 text-xs text-gray-500">読み込み中...</div>
            ) : snapshots.length === 0 ? (
              <div className="p-4 text-xs text-gray-500">
                Ctrl+S で保存するとスナップショットが作成されます。
              </div>
            ) : (
              <>
                {/* Current */}
                <div
                  className={`px-3 py-2 cursor-pointer hover:bg-gray-700 border-b border-gray-700 ${
                    !selected ? "bg-gray-700 border-l-2 border-blue-500" : ""
                  }`}
                  onClick={() => setSelected(null)}
                >
                  <div className="text-xs font-bold text-green-400">現在</div>
                  <div className="text-xs text-gray-500">編集中の状態</div>
                </div>
                {snapshots.map((s) => {
                  const parts = diffLines(s.content, currentContent);
                  let added = 0, removed = 0;
                  for (const p of parts) {
                    const n = (p.value.match(/\n/g) ?? []).length || 1;
                    if (p.added) added += n;
                    else if (p.removed) removed += n;
                  }
                  return (
                    <div
                      key={s.snapshot}
                      className={`px-3 py-2 cursor-pointer hover:bg-gray-700 border-b border-gray-700/50 ${
                        selected?.snapshot === s.snapshot ? "bg-gray-700 border-l-2 border-blue-500" : ""
                      }`}
                      onClick={() => setSelected(s)}
                    >
                      <div className="text-xs text-gray-200">{formatTimestamp(s.timestamp)}</div>
                      <div className="text-xs mt-0.5">
                        <span className="text-green-400">+{added}</span>
                        <span className="text-gray-600 mx-1">/</span>
                        <span className="text-red-400">−{removed}</span>
                        <span className="text-gray-600 ml-1">行</span>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-700 flex items-center justify-between shrink-0">
              <span className="text-xs text-gray-400">
                {selected
                  ? viewMode === "diff"
                    ? `差分: ${formatTimestamp(selected.timestamp)} → 現在`
                    : formatTimestamp(selected.timestamp)
                  : "現在の状態"}
              </span>
              {selected && (
                <button
                  onClick={() => { onRestore(selected.content); onClose(); }}
                  className="text-xs bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded text-white"
                >
                  このバージョンに復元
                </button>
              )}
            </div>

            <div className="flex-1 overflow-hidden">
              {selected && viewMode === "diff" ? (
                <DiffView oldText={selected.content} newText={currentContent} />
              ) : (
                <pre className="text-xs text-gray-300 font-mono p-3 leading-relaxed whitespace-pre-wrap overflow-auto h-full">
                  {selected ? selected.content : currentContent}
                </pre>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
