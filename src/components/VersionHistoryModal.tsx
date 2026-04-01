"use client";
import { useState, useEffect } from "react";

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

export default function VersionHistoryModal({ project, file, currentContent, onRestore, onClose }: Props) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [selected, setSelected] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/history?project=${encodeURIComponent(project)}&file=${encodeURIComponent(file)}`)
      .then((r) => r.json())
      .then((d) => {
        setSnapshots(d.snapshots ?? []);
        setLoading(false);
      });
  }, [project, file]);

  function formatTimestamp(ts: string) {
    // Format: 2026-04-01T10-00-00 → 2026/04/01 10:00:00
    return ts
      .replace(/T/, " ")
      .replace(/-(\d\d)-(\d\d)$/, ":$1:$2");
  }

  function diffPreview(a: string, b: string): { added: number; removed: number } {
    const aLines = new Set(a.split("\n"));
    const bLines = new Set(b.split("\n"));
    let added = 0; let removed = 0;
    for (const l of b.split("\n")) if (!aLines.has(l)) added++;
    for (const l of a.split("\n")) if (!bLines.has(l)) removed++;
    return { added, removed };
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-gray-800 border border-gray-600 rounded-lg w-[700px] max-h-[80vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <div>
            <span className="font-bold text-white">バージョン履歴</span>
            <span className="text-xs text-gray-400 ml-2">{file}</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg">✕</button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Snapshot list */}
          <div className="w-52 border-r border-gray-700 overflow-y-auto shrink-0">
            {loading ? (
              <div className="p-4 text-xs text-gray-500">読み込み中...</div>
            ) : snapshots.length === 0 ? (
              <div className="p-4 text-xs text-gray-500">
                保存時に自動的にスナップショットが作成されます。
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
                  <div className="text-xs text-gray-400">編集中の状態</div>
                </div>
                {snapshots.map((s) => {
                  const diff = diffPreview(s.content, currentContent);
                  return (
                    <div
                      key={s.snapshot}
                      className={`px-3 py-2 cursor-pointer hover:bg-gray-700 border-b border-gray-700/50 ${
                        selected?.snapshot === s.snapshot ? "bg-gray-700 border-l-2 border-blue-500" : ""
                      }`}
                      onClick={() => setSelected(s)}
                    >
                      <div className="text-xs text-gray-200">{formatTimestamp(s.timestamp)}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        <span className="text-green-400">+{diff.added}</span>
                        {" / "}
                        <span className="text-red-400">-{diff.removed}</span>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {/* Preview */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-700 flex items-center justify-between shrink-0">
              <span className="text-xs text-gray-400">
                {selected ? formatTimestamp(selected.timestamp) : "現在の状態"}
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
            <div className="flex-1 overflow-auto">
              <pre className="text-xs text-gray-300 font-mono p-3 leading-relaxed whitespace-pre-wrap">
                {selected ? selected.content : currentContent}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
