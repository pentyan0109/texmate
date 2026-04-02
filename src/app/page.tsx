"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import ProjectSidebar from "@/components/ProjectSidebar";
import ApiKeyModal from "@/components/ApiKeyModal";
import VersionHistoryModal from "@/components/VersionHistoryModal";
import ShortcutsModal from "@/components/ShortcutsModal";
import GithubModal from "@/components/GithubModal";
import OutlinePanel from "@/components/OutlinePanel";
import GlobalSearch from "@/components/GlobalSearch";
import type { EditorHandle, EditorError } from "@/components/Editor";

const Editor      = dynamic(() => import("@/components/Editor"),      { ssr: false });
const SymbolToolbar = dynamic(() => import("@/components/SymbolToolbar"), { ssr: false });
const AiPanel     = dynamic(() => import("@/components/AiPanel"),     { ssr: false });
const PdfViewer   = dynamic(() => import("@/components/PdfViewer"),   { ssr: false });

interface Project { name: string; updatedAt: string }

const ENGINES = [
  { id: "lualatex", label: "LuaLaTeX (推奨)" },
  { id: "uplatex",  label: "upLaTeX" },
  { id: "platex",   label: "pLaTeX" },
  { id: "xelatex",  label: "XeLaTeX" },
  { id: "pdflatex", label: "pdfLaTeX" },
];

// Parse LaTeX compile log for error line numbers
function parseLogErrors(log: string): EditorError[] {
  const errors: EditorError[] = [];
  const lines = log.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("!")) {
      const msg = line.slice(1).trim();
      let lineNum = 0;
      for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
        const m = lines[j].match(/^l\.(\d+)/);
        if (m) { lineNum = parseInt(m[1]); break; }
      }
      if (lineNum > 0) errors.push({ line: lineNum, message: msg, severity: "error" });
    }
    const warnMatch = line.match(/[Ww]arning:.*on input line (\d+)/);
    if (warnMatch) errors.push({ line: parseInt(warnMatch[1]), message: line.trim(), severity: "warning" });
  }
  return errors;
}

type SideTab = "projects" | "outline";
type Modal = "settings" | "history" | "shortcuts" | "github" | "search" | null;

export default function Home() {
  const [projects, setProjects]             = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<string | null>(null);
  const [currentFile, setCurrentFile]       = useState<string>("main.tex");
  const [files, setFiles]                   = useState<string[]>([]);
  const [code, setCode]                     = useState<string>("");
  const [engine, setEngine]                 = useState("lualatex");
  const [compiling, setCompiling]           = useState(false);
  const [log, setLog]                       = useState<string>("");
  const [logErrors, setLogErrors]           = useState<EditorError[]>([]);
  const [pdfUrl, setPdfUrl]                 = useState<string | null>(null);
  const [saving, setSaving]                 = useState(false);
  const [autoSaveLabel, setAutoSaveLabel]   = useState<string>("");
  const [showLog, setShowLog]               = useState(false);
  const [sidebarOpen, setSidebarOpen]       = useState(true);
  const [sideTab, setSideTab]               = useState<SideTab>("projects");
  const [lineNumbers, setLineNumbers]       = useState(false);
  const [bibtex, setBibtex]                 = useState(false);
  const [showAiPanel, setShowAiPanel]       = useState(false);
  const [modal, setModal]                   = useState<Modal>(null);
  const [showNewFile, setShowNewFile]       = useState(false);
  const [newFileName, setNewFileName]       = useState("");
  const [wordCount, setWordCount]           = useState(0);
  // Collab
  const [collabEnabled, setCollabEnabled]   = useState(false);
  const [collabUsers, setCollabUsers]       = useState<string[]>([]);

  const editorRef     = useRef<EditorHandle>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Word/char count ──────────────────────────────────────────────────
  useEffect(() => {
    const stripped = code
      .replace(/\\[a-zA-Z]+\{[^}]*\}/g, " ")
      .replace(/\\[a-zA-Z]+/g, " ")
      .replace(/[{}$%&^_~\\]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    setWordCount(stripped ? stripped.split(/\s+/).length : 0);
  }, [code]);

  // ── Data fetching ────────────────────────────────────────────────────
  const fetchProjects = useCallback(async () => {
    const res = await fetch("/api/projects");
    setProjects(await res.json());
  }, []);
  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const saveSnapshot = useCallback(async (project: string, file: string, content: string) => {
    await fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project, file, content }),
    });
  }, []);

  const saveFile = useCallback(async (proj?: string, file?: string, content?: string) => {
    const p = proj ?? currentProject;
    const f = file ?? currentFile;
    const c = content ?? code;
    if (!p) return;
    setSaving(true);
    await fetch("/api/files", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project: p, file: f, content: c }),
    });
    await saveSnapshot(p, f, c);
    setSaving(false);
  }, [currentProject, currentFile, code, saveSnapshot]);

  // Auto-save 3s debounce
  const triggerAutoSave = useCallback((proj: string, file: string, content: string) => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setAutoSaveLabel("編集中...");
    autoSaveTimer.current = setTimeout(async () => {
      await fetch("/api/files", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project: proj, file, content }),
      });
      setAutoSaveLabel("自動保存済み");
      setTimeout(() => setAutoSaveLabel(""), 2000);
    }, 3000);
  }, []);

  const handleCodeChange = useCallback((v: string) => {
    setCode(v);
    if (currentProject) triggerAutoSave(currentProject, currentFile, v);
  }, [currentProject, currentFile, triggerAutoSave]);

  const loadFile = useCallback(async (project: string, file: string) => {
    setCurrentFile(file);
    const res = await fetch(`/api/files?project=${encodeURIComponent(project)}&file=${encodeURIComponent(file)}`);
    const data = await res.json();
    setCode(data.content || "");
    setLogErrors([]);
  }, []);

  const loadProject = useCallback(async (name: string) => {
    setCurrentProject(name);
    setPdfUrl(null); setLog(""); setLogErrors([]);
    const res = await fetch(`/api/files?project=${encodeURIComponent(name)}`);
    const data = await res.json();
    const fileList: string[] = data.files || ["main.tex"];
    setFiles(fileList);
    loadFile(name, fileList.includes("main.tex") ? "main.tex" : fileList[0]);
  }, [loadFile]);

  const refreshFiles = useCallback(async (project: string) => {
    const res = await fetch(`/api/files?project=${encodeURIComponent(project)}`);
    const data = await res.json();
    setFiles(data.files || []);
  }, []);

  // ── Compile ───────────────────────────────────────────────────────────
  const compile = useCallback(async () => {
    if (!currentProject) return;
    await saveFile();
    setCompiling(true); setLog("コンパイル中..."); setLogErrors([]); setPdfUrl(null);
    const res = await fetch("/api/compile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project: currentProject, file: currentFile, engine, lineNumbers, bibtex }),
    });
    const data = await res.json();
    const logText = data.log || "";
    setLog(logText);
    setCompiling(false);
    const errors = parseLogErrors(logText);
    setLogErrors(errors);
    if (data.pdfFile) {
      setPdfUrl(`/api/pdf?project=${encodeURIComponent(currentProject)}&file=${encodeURIComponent(data.pdfFile)}&t=${Date.now()}`);
    } else {
      setShowLog(true);
    }
  }, [currentProject, currentFile, engine, lineNumbers, bibtex, saveFile]);

  // ── File management ───────────────────────────────────────────────────
  async function createNewFile() {
    if (!currentProject || !newFileName.trim()) return;
    const name = newFileName.trim().includes(".") ? newFileName.trim() : newFileName.trim() + ".tex";
    const res = await fetch("/api/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project: currentProject, file: name }),
    });
    if (res.ok) {
      setNewFileName(""); setShowNewFile(false);
      await refreshFiles(currentProject);
      loadFile(currentProject, name);
    } else {
      const d = await res.json();
      alert(d.error || "作成に失敗しました");
    }
  }

  async function deleteCurrentFile() {
    if (!currentProject || currentFile === "main.tex") { alert("main.tex は削除できません"); return; }
    if (!confirm(`「${currentFile}」を削除しますか？`)) return;
    await fetch("/api/files", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project: currentProject, file: currentFile }),
    });
    await refreshFiles(currentProject);
    loadFile(currentProject, "main.tex");
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "s")           { e.preventDefault(); saveFile(); }
      if (e.ctrlKey && e.key === "Enter")       { e.preventDefault(); compile(); }
      if (e.ctrlKey && e.shiftKey && e.key === "F") { e.preventDefault(); setModal("search"); }
      if (e.key === "?" && !["INPUT","TEXTAREA"].includes((e.target as HTMLElement).tagName)) {
        setModal("shortcuts");
      }
      if (e.key === "Escape") setModal(null);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [saveFile, compile]);

  // ── SyncTeX: PDF click → editor jump ─────────────────────────────────
  function handleSyncClick(line: number, _srcFile: string) {
    editorRef.current?.jumpToLine(line);
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-gray-900 text-gray-100">
      {/* Header */}
      <header className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 border-b border-gray-700 shrink-0 flex-wrap">
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-gray-400 hover:text-white text-lg px-1" title="サイドバー">☰</button>
        <span className="font-bold text-blue-400 text-base">TexMate</span>
        <button onClick={() => setModal("settings")} className="text-gray-500 hover:text-gray-300 text-sm px-1" title="設定">⚙</button>
        <button onClick={() => setModal("shortcuts")} className="text-gray-600 hover:text-gray-400 text-xs px-1" title="ショートカット一覧 (?)">?</button>
        <div className="flex-1" />

        {currentProject && (
          <>
            <span className="text-xs text-gray-600 hidden lg:inline">{currentProject}/{currentFile}</span>
            {wordCount > 0 && (
              <span className="text-xs text-gray-600 hidden md:inline" title="LaTeXコマンド除去後の単語数">
                {wordCount.toLocaleString()} 語
              </span>
            )}
            {autoSaveLabel && (
              <span className={`text-xs ${autoSaveLabel === "自動保存済み" ? "text-green-400" : "text-gray-500"}`}>
                {autoSaveLabel}
              </span>
            )}

            <select value={engine} onChange={(e) => setEngine(e.target.value)}
              className="text-xs bg-gray-700 border border-gray-600 rounded px-1.5 py-1 text-white focus:outline-none">
              {ENGINES.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
            </select>

            <button onClick={() => saveFile()} disabled={saving}
              className="text-xs bg-gray-600 hover:bg-gray-500 px-2 py-1 rounded text-white disabled:opacity-50" title="Ctrl+S">
              {saving ? "保存中..." : "保存"}
            </button>

            <button onClick={() => setModal("history")}
              className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded border border-gray-600 text-gray-300" title="バージョン履歴">
              ⏱
            </button>

            <button onClick={() => setModal("search")}
              className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded border border-gray-600 text-gray-300" title="グローバル検索 Ctrl+Shift+F">
              🔍
            </button>

            <button onClick={() => setModal("github")}
              className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded border border-gray-600 text-gray-300" title="GitHub 同期">
              ⎇
            </button>

            {/* ZIP export */}
            <a
              href={`/api/export?project=${encodeURIComponent(currentProject)}`}
              download
              className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded border border-gray-600 text-gray-300"
              title="プロジェクトをZIPでダウンロード"
            >
              ZIP
            </a>

            <button onClick={() => setLineNumbers(!lineNumbers)}
              className={`text-xs px-2 py-1 rounded border transition-colors ${lineNumbers ? "bg-indigo-600 border-indigo-500 text-white" : "bg-gray-700 border-gray-600 text-gray-400 hover:text-white"}`}
              title="PDF行番号">
              # 行番号
            </button>

            <button onClick={() => setBibtex(!bibtex)}
              className={`text-xs px-2 py-1 rounded border transition-colors ${bibtex ? "bg-amber-700 border-amber-600 text-white" : "bg-gray-700 border-gray-600 text-gray-400 hover:text-white"}`}
              title="BibTeX/biber">
              BibTeX
            </button>

            <button
              onClick={() => setCollabEnabled(!collabEnabled)}
              className={`text-xs px-2 py-1 rounded border transition-colors ${collabEnabled ? "bg-cyan-700 border-cyan-600 text-white" : "bg-gray-700 border-gray-600 text-gray-400 hover:text-white"}`}
              title="共同編集モード (Yjs)"
            >
              {collabEnabled ? `👥 ${collabUsers.length}人` : "👥 共同編集"}
            </button>

            <button onClick={() => setShowAiPanel(!showAiPanel)}
              className={`text-xs px-2 py-1 rounded border transition-colors ${showAiPanel ? "bg-purple-600 border-purple-500 text-white" : "bg-gray-700 border-gray-600 text-gray-400 hover:text-white"}`}>
              ✦ AI
            </button>

            <button onClick={compile} disabled={compiling}
              className="text-xs bg-green-600 hover:bg-green-500 px-3 py-1 rounded text-white font-bold disabled:opacity-50" title="Ctrl+Enter">
              {compiling ? "コンパイル中..." : "▶ コンパイル"}
            </button>
          </>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        {sidebarOpen && (
          <div className="w-56 shrink-0 flex flex-col border-r border-gray-700">
            {/* Side tab buttons */}
            {currentProject && (
              <div className="flex border-b border-gray-700 shrink-0">
                <button onClick={() => setSideTab("projects")}
                  className={`flex-1 text-xs py-1.5 ${sideTab === "projects" ? "bg-gray-700 text-white border-t-2 border-t-blue-500" : "text-gray-500 hover:bg-gray-700"}`}>
                  プロジェクト
                </button>
                <button onClick={() => setSideTab("outline")}
                  className={`flex-1 text-xs py-1.5 ${sideTab === "outline" ? "bg-gray-700 text-white border-t-2 border-t-blue-500" : "text-gray-500 hover:bg-gray-700"}`}>
                  アウトライン
                </button>
              </div>
            )}
            {sideTab === "outline" && currentProject ? (
              <OutlinePanel code={code} onJump={(line) => editorRef.current?.jumpToLine(line)} />
            ) : (
              <ProjectSidebar
                projects={projects}
                currentProject={currentProject}
                onSelect={loadProject}
                onRefresh={fetchProjects}
                onInsertSnippet={(s) => editorRef.current?.insertSnippet(s)}
              />
            )}
          </div>
        )}

        {!currentProject ? (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <div className="text-4xl mb-4">📄</div>
              <div className="text-xl mb-2">TexMate へようこそ</div>
              <div className="text-sm mb-1">左のサイドバーからプロジェクトを作成してください</div>
              <div className="text-xs text-gray-600">? キーでショートカット一覧</div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col flex-1 overflow-hidden">
            <SymbolToolbar onInsert={(s) => editorRef.current?.insertSnippet(s)} />

            <div className="flex flex-1 overflow-hidden">
              {/* Editor column */}
              <div className="flex flex-col flex-1 overflow-hidden">
                {/* File tabs */}
                <div className="flex items-center bg-gray-800 border-b border-gray-700 shrink-0">
                  <div className="flex flex-1 overflow-x-auto">
                    {files.map((f) => (
                      <button key={f} onClick={() => loadFile(currentProject, f)}
                        className={`text-xs px-3 py-2 border-r border-gray-700 hover:bg-gray-700 whitespace-nowrap ${
                          currentFile === f ? "bg-gray-900 text-white border-t-2 border-t-blue-500" : "text-gray-400"
                        }`}>
                        {f}
                      </button>
                    ))}
                  </div>
                  {showNewFile ? (
                    <div className="flex items-center gap-1 px-2">
                      <input autoFocus value={newFileName} onChange={(e) => setNewFileName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") createNewFile(); if (e.key === "Escape") { setShowNewFile(false); setNewFileName(""); } }}
                        placeholder="file.tex" className="text-xs bg-gray-700 border border-gray-600 rounded px-2 py-1 w-28 text-white focus:outline-none" />
                      <button onClick={createNewFile} className="text-xs text-green-400">✓</button>
                      <button onClick={() => { setShowNewFile(false); setNewFileName(""); }} className="text-xs text-gray-500">✕</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 px-2">
                      <button onClick={() => setShowNewFile(true)} className="text-xs text-gray-500 hover:text-gray-300 px-1" title="新規ファイル">＋</button>
                      {currentFile !== "main.tex" && (
                        <button onClick={deleteCurrentFile} className="text-xs text-red-500 hover:text-red-400 px-1" title="削除">🗑</button>
                      )}
                    </div>
                  )}
                </div>

                {/* Editor */}
                <div className={`overflow-hidden ${showAiPanel ? "flex-[2]" : "flex-1"}`}>
                  {collabEnabled ? (
                    // Lazy-load collaborative editor
                    <CollabEditorWrapper
                      roomId={`${currentProject}:${currentFile}`}
                      initialValue={code}
                      onChange={handleCodeChange}
                      onAwarenessChange={setCollabUsers}
                      editorRef={editorRef}
                    />
                  ) : (
                    <Editor ref={editorRef} value={code} onChange={handleCodeChange} errors={logErrors} />
                  )}
                </div>

                {showAiPanel && (
                  <AiPanel code={code} log={log}
                    onInsert={(s) => editorRef.current?.insertSnippet(s)}
                    onOpenSettings={() => setModal("settings")} />
                )}
              </div>

              {/* PDF panel */}
              <div className="flex-1 border-l border-gray-700 flex flex-col overflow-hidden">
                {/* PDF toolbar row */}
                <div className="px-3 py-1.5 text-xs border-b border-gray-700 flex justify-between items-center shrink-0 bg-gray-900">
                  <span className={`font-bold ${pdfUrl ? "text-green-400" : "text-gray-500"}`}>PDF</span>
                  <div className="flex items-center gap-2">
                    {logErrors.filter((e) => e.severity === "error").length > 0 && (
                      <span className="text-red-400 text-xs">
                        ⚠ {logErrors.filter((e) => e.severity === "error").length} エラー
                      </span>
                    )}
                    <button onClick={() => setShowLog(!showLog)}
                      className={`text-xs px-2 py-0.5 rounded ${showLog ? "bg-yellow-600 text-white" : "bg-gray-700 text-gray-400 hover:bg-gray-600"}`}>
                      ログ
                    </button>
                    {pdfUrl && (
                      <a href={`${pdfUrl}&download=1&name=${encodeURIComponent(currentProject + ".pdf")}`} download
                        className="text-xs bg-blue-600 hover:bg-blue-500 px-2 py-0.5 rounded text-white">
                        DL
                      </a>
                    )}
                  </div>
                </div>

                {/* Log panel */}
                {showLog && (
                  <div className="h-44 shrink-0 border-b border-gray-700 overflow-hidden flex flex-col bg-gray-950">
                    <div className="flex-1 overflow-auto font-mono text-xs">
                      {log ? (
                        <table className="w-full border-collapse">
                          <tbody>
                            {log.split("\n").map((line, i) => {
                              const lm = line.match(/^l\.(\d+)/);
                              const errLine = lm ? parseInt(lm[1]) : null;
                              return (
                                <tr key={i} className={`hover:bg-gray-800 ${errLine ? "cursor-pointer" : ""}`}
                                  onClick={() => errLine && editorRef.current?.jumpToLine(errLine)}>
                                  <td className="select-none text-right text-gray-600 pr-2 pl-1 py-0.5 border-r border-gray-700 w-10 align-top">{i + 1}</td>
                                  <td className={`pl-2 pr-1 py-0.5 whitespace-pre-wrap break-all align-top ${
                                    line.match(/^!|error/i) ? "text-red-400" :
                                    line.match(/warning/i) ? "text-yellow-400" :
                                    line.match(/^Output written/) ? "text-green-400" :
                                    errLine ? "text-blue-400 underline" : "text-gray-300"
                                  }`}>{line || " "}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      ) : (
                        <div className="p-3 text-gray-600">（ログなし）</div>
                      )}
                    </div>
                  </div>
                )}

                {/* PDF viewer (PDF.js) */}
                <PdfViewer
                  pdfUrl={pdfUrl}
                  compiling={compiling}
                  project={currentProject}
                  file={currentFile}
                  onSyncClick={handleSyncClick}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {modal === "settings" && <ApiKeyModal onClose={() => setModal(null)} />}
      {modal === "history" && currentProject && (
        <VersionHistoryModal project={currentProject} file={currentFile} currentContent={code}
          onRestore={(c) => { setCode(c); saveFile(currentProject, currentFile, c); }}
          onClose={() => setModal(null)} />
      )}
      {modal === "shortcuts" && <ShortcutsModal onClose={() => setModal(null)} />}
      {modal === "github" && currentProject && (
        <GithubModal project={currentProject}
          onRefreshFiles={() => currentProject && refreshFiles(currentProject)}
          onClose={() => setModal(null)} />
      )}
      {modal === "search" && currentProject && (
        <GlobalSearch project={currentProject}
          onJump={async (file, line) => {
            await loadFile(currentProject, file);
            setTimeout(() => editorRef.current?.jumpToLine(line), 300);
          }}
          onClose={() => setModal(null)} />
      )}
    </div>
  );
}

// Thin wrapper to lazy-load CollabEditor (Yjs needs browser APIs)
import type { EditorHandle as EH } from "@/components/Editor";
interface CollabWrapperProps {
  roomId: string;
  initialValue: string;
  onChange: (v: string) => void;
  onAwarenessChange: (users: string[]) => void;
  editorRef: React.RefObject<EH | null>;
}
const CollabEditorDynamic = dynamic(() => import("@/components/CollabEditor"), { ssr: false });

function CollabEditorWrapper({ roomId, initialValue, onChange, onAwarenessChange, editorRef }: CollabWrapperProps) {
  return (
    <CollabEditorDynamic
      ref={editorRef as React.Ref<import("@/components/CollabEditor").CollabHandle>}
      roomId={roomId}
      initialValue={initialValue}
      onChange={onChange}
      onAwarenessChange={onAwarenessChange}
    />
  );
}
