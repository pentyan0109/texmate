"use client";
import { useState, useEffect, useRef } from "react";

interface Project {
  name: string;
  updatedAt: string;
}

interface Props {
  projects: Project[];
  currentProject: string | null;
  onSelect: (name: string) => void;
  onRefresh: () => void;
  onInsertSnippet?: (snippet: string) => void;
}

const TEMPLATES = [
  { id: "basic", label: "基本" },
  { id: "article", label: "論文" },
  { id: "report", label: "レポート" },
  { id: "beamer", label: "スライド" },
];

export default function ProjectSidebar({ projects, currentProject, onSelect, onRefresh, onInsertSnippet }: Props) {
  const [newName, setNewName] = useState("");
  const [template, setTemplate] = useState("basic");
  const [creating, setCreating] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!currentProject) { setImages([]); return; }
    fetch(`/api/upload?project=${encodeURIComponent(currentProject)}`)
      .then((r) => r.json())
      .then((d) => setImages(d.images || []));
  }, [currentProject]);

  async function createProject() {
    if (!newName.trim()) return;
    setCreating(true);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), template }),
    });
    setCreating(false);
    if (res.ok) {
      setNewName("");
      setShowNew(false);
      onRefresh();
    } else {
      const data = await res.json();
      alert(data.error || "作成に失敗しました");
    }
  }

  async function deleteProject(name: string) {
    if (!confirm(`「${name}」を削除しますか？`)) return;
    await fetch("/api/projects", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    onRefresh();
  }

  async function uploadImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !currentProject) return;
    setUploading(true);
    const form = new FormData();
    form.append("project", currentProject);
    form.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: form });
    setUploading(false);
    e.target.value = "";
    if (res.ok) {
      const data = await res.json();
      setImages((prev) => [...prev.filter((i) => i !== data.filename), data.filename]);
    } else {
      const data = await res.json();
      alert(data.error || "アップロード失敗");
    }
  }

  function insertImage(filename: string) {
    const name = filename.replace(/\.[^.]+$/, ""); // strip extension for \includegraphics
    onInsertSnippet?.(`\\begin{figure}[h]\n  \\centering\n  \\includegraphics[width=0.8\\linewidth]{${name}}\n  \\caption{キャプション}\n  \\label{fig:${name}}\n\\end{figure}`);
  }

  return (
    <div className="flex flex-col h-full bg-gray-800 border-r border-gray-700">
      {/* New project form */}
      <div className="p-3 border-b border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-bold text-blue-400">プロジェクト</span>
          <button
            onClick={() => setShowNew(!showNew)}
            className="text-xs bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded text-white"
          >
            ＋ 新規
          </button>
        </div>
        {showNew && (
          <div className="space-y-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createProject()}
              placeholder="プロジェクト名"
              className="w-full text-sm bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />
            <select
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              className="w-full text-sm bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white focus:outline-none focus:border-blue-500"
            >
              {TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
            <button
              onClick={createProject}
              disabled={creating}
              className="w-full text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 px-2 py-1 rounded text-white"
            >
              {creating ? "作成中..." : "作成"}
            </button>
          </div>
        )}
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-y-auto">
        {projects.length === 0 ? (
          <div className="p-3 text-xs text-gray-500 text-center">
            プロジェクトがありません
          </div>
        ) : (
          projects.map((p) => (
            <div
              key={p.name}
              className={`group flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-700 ${
                currentProject === p.name ? "bg-gray-700 border-l-2 border-blue-500" : ""
              }`}
              onClick={() => onSelect(p.name)}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white truncate">{p.name}</div>
                <div className="text-xs text-gray-500">
                  {new Date(p.updatedAt).toLocaleDateString("ja-JP")}
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); deleteProject(p.name); }}
                className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 ml-1 text-xs px-1"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>

      {/* Image panel - shown when a project is open */}
      {currentProject && (
        <div className="border-t border-gray-700 shrink-0">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-xs font-bold text-purple-400">図・画像</span>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="text-xs bg-purple-700 hover:bg-purple-600 disabled:bg-gray-600 px-2 py-0.5 rounded text-white"
            >
              {uploading ? "..." : "＋ 追加"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.pdf,.eps"
              className="hidden"
              onChange={uploadImage}
            />
          </div>
          <div className="max-h-40 overflow-y-auto px-2 pb-2 space-y-1">
            {images.length === 0 ? (
              <div className="text-xs text-gray-600 text-center py-2">画像なし</div>
            ) : (
              images.map((img) => (
                <div
                  key={img}
                  className="group flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-700 cursor-pointer"
                  onClick={() => insertImage(img)}
                  title="クリックでエディタに挿入"
                >
                  <span className="text-purple-300 text-xs">🖼</span>
                  <span className="text-xs text-gray-300 truncate flex-1">{img}</span>
                  <span className="opacity-0 group-hover:opacity-100 text-xs text-gray-500">挿入</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
