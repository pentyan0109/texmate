"use client";

const SHORTCUTS = [
  { key: "Ctrl + Enter",  desc: "コンパイル" },
  { key: "Ctrl + S",      desc: "保存（+ スナップショット）" },
  { key: "Ctrl + Z",      desc: "元に戻す（Monaco）" },
  { key: "Ctrl + Y",      desc: "やり直し（Monaco）" },
  { key: "Ctrl + /",      desc: "行コメント切り替え" },
  { key: "Ctrl + F",      desc: "エディタ内検索" },
  { key: "Ctrl + H",      desc: "エディタ内置換" },
  { key: "Ctrl + G",      desc: "行番号ジャンプ（Monaco）" },
  { key: "Ctrl + Shift+F","desc": "グローバル検索（TexMate）" },
  { key: "Alt + ↑/↓",    desc: "行を上/下に移動（Monaco）" },
  { key: "Alt + Shift + F","desc": "フォーマット（Monaco）" },
  { key: "F1",            desc: "コマンドパレット（Monaco）" },
  { key: "Escape",        desc: "モーダルを閉じる" },
];

const TIPS = [
  "\\コマンド 入力時に LaTeX 補完候補が表示されます",
  "ログパネルの l.NN 行をクリックするとエラー行にジャンプします",
  "カスタムタブで自作スニペットを登録できます",
  "保存のたびにバージョン履歴スナップショットが自動作成されます",
  "自動保存は最後の編集から 3 秒後に実行されます",
  "BibTeX ボタンを ON にすると bibtex/biber を自動実行します",
  "PDF ビューアで Ctrl + クリック → エディタ該当行（SyncTeX）",
];

interface Props { onClose: () => void }

export default function ShortcutsModal({ onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-gray-800 border border-gray-600 rounded-lg w-[560px] max-h-[80vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <span className="font-bold text-white">キーボードショートカット</span>
          <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <table className="w-full text-sm">
            <tbody>
              {SHORTCUTS.map((s, i) => (
                <tr key={i} className="border-b border-gray-700/50">
                  <td className="py-1.5 pr-4 whitespace-nowrap">
                    <kbd className="bg-gray-700 border border-gray-600 rounded px-2 py-0.5 font-mono text-xs text-white">
                      {s.key}
                    </kbd>
                  </td>
                  <td className="py-1.5 text-gray-300">{s.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div>
            <div className="text-xs font-bold text-gray-400 mb-2">Tips</div>
            <ul className="space-y-1">
              {TIPS.map((t, i) => (
                <li key={i} className="text-xs text-gray-500 flex gap-2">
                  <span className="text-blue-500 shrink-0">•</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="px-4 py-2 border-t border-gray-700 text-center">
          <button onClick={onClose} className="text-xs text-gray-500 hover:text-gray-300">閉じる (Esc)</button>
        </div>
      </div>
    </div>
  );
}
