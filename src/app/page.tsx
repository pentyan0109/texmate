"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import ProjectSidebar from "@/components/ProjectSidebar";
import ApiKeyModal from "@/components/ApiKeyModal";
import VersionHistoryModal from "@/components/VersionHistoryModal";
import type { EditorHandle, EditorError } from "@/components/Editor";

const Editor = dynamic(() => import("@/components/Editor"), { ssr: false });
const SymbolToolbar = dynamic(() => import("@/components/SymbolToolbar"), { ssr: false });
const AiPanel = dynamic(() => import("@/components/AiPanel"), { ssr: false });

interface Project {
  name: string;
  updatedAt: string;
}

const ENGINES = [
  { id: "lualatex", label: "LuaLaTeX (推奨)" },
  { id: "uplatex",  label: "upLaTeX" },
  { id: "platex",   label: "pLaTeX" },
  { id: "xelatex",  label: "XeLaTeX" },
  { id: "pdflatex", label: "pdfLaTeX" },
];

// Parse LaTeX log for errors/warnings with line numbers
function parseLogErrors(log: string): EditorError[] {
  const errors: EditorError[] = [];
  const lines = log.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // LaTeX errors: "! ..." followed by "l.NN ..."
    if (line.startsWith("!")) {
      const msg = line.slice(1).trim();
      // Look ahead for line number
      let lineNum = 0;
      for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
        const m = lines[j].match(/^l\.(\d+)/);
        if (m) { lineNum = parseInt(m[1]); break; }
      }
      if (lineNum > 0) {
        errors.push({ line: lineNum, message: msg, severity: "error" });
      }
    }
    // Warnings with line numbers: "Package xxx Warning: ... on input line NN."
    const warnMatch = line.match(/[Ww]arning:.*on input line (\d+)/);
    if (warnMatch) {
      errors.push({ line: parseInt(warnMatch[1]), message: line.trim(), severity: "warning" });
    }
  }
  return errors;
}

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
  const [lineNumbers, setLineNumbers]       = useState(false);
  const [bibtex, setBibtex]                 = useState(false);
  const [showSettings, setShowSettings]     = useState(false);
  const [showAiPanel, setShowAiPanel]       = useState(false);
  const [showHistory, setShowHistory]       = useState(false);
  const [showNewFile, setShowNewFile]       = useState(false);
  const [newFileName, setNewFileName]       = useState("");

  const editorRef     = useRef<EditorHandle>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchProjects = useCallback(async () => {
    const res = await fetch("/api/projects");
    const data = await res.json();
    setProjects(data);
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const saveSnapshot = useCallback(async (project: string, file: string, content: string) => {
    await fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project, file, content }),
    });
  }, []);

  const saveFile = useCallback(async (proj?: string, file?: string, content?: string, silent = false) => {
    const p = proj ?? currentProject;
    const f = file ?? currentFile;
    const c = content ?? code;
    if (!p) return;
    if (!silent) setSaving(true);
    await fetch("/api/files", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project: p, file: f, content: c }),
    });
    // Save snapshot on each explicit save
    if (!silent) {
      await saveSnapshot(p, f, c);
    }
    if (!silent) setSaving(false);
  }, [currentProject, currentFile, code, saveSnapshot]);

  // Auto-save: 3 seconds after last edit
  const triggerAutoSave = useCallback((proj: string, file: string, content: string) => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      await fetch("/api/files", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project: proj, file, content }),
      });
      setAutoSaveLabel("自動保存済み");
      setTimeout(() => setAutoSaveLabel(""), 2000);
    }, 3000);
    setAutoSaveLabel("編集中...");
  }, []);

  const handleCodeChange = useCallback((newCode: string) => {
    setCode(newCode);
    if (currentProject) {
      triggerAutoSave(currentProject, currentFile, newCode);
    }
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
    setPdfUrl(null);
    setLog("");
    setLogErrors([]);
    const res = await fetch(`/api/files?project=${encodeURIComponent(name)}`);
    const data = await res.json();
    const fileList: string[] = data.files || ["main.tex"];
    setFiles(fileList);
    const mainFile = fileList.includes("main.tex") ? "main.tex" : fileList[0];
    loadFile(name, mainFile);
  }, [loadFile]);

  const refreshFiles = useCallback(async (project: string) => {
    const res = await fetch(`/api/files?project=${encodeURIComponent(project)}`);
    const data = await res.json();
    setFiles(data.files || []);
  }, []);

  const compile = useCallback(async () => {
    if (!currentProject) return;
    await saveFile();
    setCompiling(true);
    setLog("コンパイル中...");
    setLogErrors([]);
    setPdfUrl(null);

    const res = await fetch("/api/compile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project: currentProject, file: currentFile, engine, lineNumbers, bibtex }),
    });
    const data = await res.json();
    const logText = data.log || "";
    setLog(logText);
    setCompiling(false);

    // Parse errors and show inline markers
    const errors = parseLogErrors(logText);
    setLogErrors(errors);

    if (data.pdfFile) {
      setPdfUrl(`/api/pdf?project=${encodeURIComponent(currentProject)}&file=${encodeURIComponent(data.pdfFile)}&t=${Date.now()}`);
    } else {
      setShowLog(true); // auto-open log on failure
    }
  }, [currentProject, currentFile, engine, lineNumbers, bibtex, saveFile]);

  // New file creation
  async function createNewFile() {
    if (!currentProject || !newFileName.trim()) return;
    const name = newFileName.trim().includes(".") ? newFileName.trim() : newFileName.trim() + ".tex";
    const res = await fetch("/api/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project: currentProject, file: name }),
    });
    if (res.ok) {
      setNewFileName("");
      setShowNewFile(false);
      await refreshFiles(currentProject);
      loadFile(currentProject, name);
    } else {
      const d = await res.json();
      alert(d.error || "作成に失敗しました");
    }
  }

  // Delete current file
  async function deleteCurrentFile() {
    if (!currentProject || !currentFile) return;
    if (currentFile === "main.tex") { alert("main.tex は削除できません"); return; }
    if (!confirm(`「${currentFile}」を削除しますか？`)) return;
    await fetch("/api/files", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project: currentProject, file: currentFile }),
    });
    await refreshFiles(currentProject);
    loadFile(currentProject, "main.tex");
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "s") { e.preventDefault(); saveFile(); }
      if (e.ctrlKey && e.key === "Enter") { e.preventDefault(); compile(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saveFile, compile]);

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-gray-100">
      {/* Header */}
      <header className="flex items-center gap-2 px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0 flex-wrap">
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-gray-400 hover:text-white text-lg" title="サイドバー">
          ☰
        </button>
        <span className="font-bold text-blue-400 text-lg">TexMate</span>
        <button onClick={() => setShowSettings(true)} className="text-gray-500 hover:text-gray-300 text-sm" title="設定 / API キー">
          ⚙
        </button>
        <span className="text-gray-600 text-sm hidden sm:inline">日本語LaTeXエディタ</span>

        <div className="flex-1" />

        {currentProject && (
          <>
            <span className="text-xs text-gray-500 hidden md:inline">{currentProject} / {currentFile}</span>
            {autoSaveLabel && (
              <span className={`text-xs ${autoSaveLabel === "自動保存済み" ? "text-green-400" : "text-gray-500"}`}>
                {autoSaveLabel}
              </span>
            )}

            <select
              value={engine}
              onChange={(e) => setEngine(e.target.value)}
              className="text-xs bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white focus:outline-none focus:border-blue-500"
            >
              {ENGINES.map((e) => (
                <option key={e.id} value={e.id}>{e.label}</option>
              ))}
            </select>

            <button
              onClick={() => saveFile()}
              disabled={saving}
              className="text-xs bg-gray-600 hover:bg-gray-500 px-3 py-1 rounded text-white disabled:opacity-50"
              title="Ctrl+S"
            >
              {saving ? "保存中..." : "保存"}
            </button>

            <button
              onClick={() => setShowHistory(true)}
              className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded border border-gray-600 text-gray-300"
              title="バージョン履歴"
            >
              ⏱ 履歴
            </button>

            <button
              onClick={() => setLineNumbers(!lineNumbers)}
              className={`text-xs px-3 py-1 rounded border transition-colors ${
                lineNumbers ? "bg-indigo-600 border-indigo-500 text-white" : "bg-gray-700 border-gray-600 text-gray-400 hover:text-white"
              }`}
              title="PDF行番号 ON/OFF"
            >
              # 行番号
            </button>

            <button
              onClick={() => setBibtex(!bibtex)}
              className={`text-xs px-3 py-1 rounded border transition-colors ${
                bibtex ? "bg-amber-700 border-amber-600 text-white" : "bg-gray-700 border-gray-600 text-gray-400 hover:text-white"
              }`}
              title="BibTeX/biber による参考文献コンパイル"
            >
              BibTeX
            </button>

            <button
              onClick={() => setShowAiPanel(!showAiPanel)}
              className={`text-xs px-3 py-1 rounded border transition-colors ${
                showAiPanel ? "bg-purple-600 border-purple-500 text-white" : "bg-gray-700 border-gray-600 text-gray-400 hover:text-white"
              }`}
              title="AI アシスト"
            >
              ✦ AI
            </button>

            <button
              onClick={compile}
              disabled={compiling}
              className="text-xs bg-green-600 hover:bg-green-500 px-3 py-1 rounded text-white font-bold disabled:opacity-50"
              title="Ctrl+Enter"
            >
              {compiling ? "コンパイル中..." : "▶ コンパイル"}
            </button>
          </>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        {sidebarOpen && (
          <div className="w-56 shrink-0 flex flex-col">
            <ProjectSidebar
              projects={projects}
              currentProject={currentProject}
              onSelect={loadProject}
              onRefresh={fetchProjects}
              onInsertSnippet={(snippet) => editorRef.current?.insertSnippet(snippet)}
            />
          </div>
        )}

        {/* Main area */}
        {!currentProject ? (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <div className="text-4xl mb-4">📄</div>
              <div className="text-xl mb-2">TexMate へようこそ</div>
              <div className="text-sm">左のサイドバーからプロジェクトを作成してください</div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Symbol toolbar */}
            <SymbolToolbar onInsert={(s) => editorRef.current?.insertSnippet(s)} />

            <div className="flex flex-1 overflow-hidden">
              {/* Editor column */}
              <div className="flex flex-col flex-1 overflow-hidden">
                {/* File tabs + new file button */}
                <div className="flex items-center bg-gray-800 border-b border-gray-700 shrink-0">
                  <div className="flex flex-1 overflow-x-auto">
                    {files.map((f) => (
                      <button
                        key={f}
                        onClick={() => loadFile(currentProject, f)}
                        className={`text-xs px-4 py-2 border-r border-gray-700 hover:bg-gray-700 whitespace-nowrap ${
                          currentFile === f ? "bg-gray-900 text-white border-t-2 border-t-blue-500" : "text-gray-400"
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                  {/* New file button */}
                  {showNewFile ? (
                    <div className="flex items-center gap-1 px-2">
                      <input
                        autoFocus
                        value={newFileName}
                        onChange={(e) => setNewFileName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") createNewFile();
                          if (e.key === "Escape") { setShowNewFile(false); setNewFileName(""); }
                        }}
                        placeholder="filename.tex"
                        className="text-xs bg-gray-700 border border-gray-600 rounded px-2 py-1 w-32 text-white focus:outline-none focus:border-blue-500"
                      />
                      <button onClick={createNewFile} className="text-xs text-green-400 hover:text-green-300">✓</button>
                      <button onClick={() => { setShowNewFile(false); setNewFileName(""); }} className="text-xs text-gray-500 hover:text-gray-300">✕</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 px-2">
                      <button
                        onClick={() => setShowNewFile(true)}
                        className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1"
                        title="新規ファイル"
                      >
                        ＋
                      </button>
                      {currentFile !== "main.tex" && (
                        <button
                          onClick={deleteCurrentFile}
                          className="text-xs text-red-500 hover:text-red-400 px-1 py-1"
                          title="このファイルを削除"
                        >
                          🗑
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Monaco editor */}
                <div className={`overflow-hidden ${showAiPanel ? "flex-[2]" : "flex-1"}`}>
                  <Editor
                    ref={editorRef}
                    value={code}
                    onChange={handleCodeChange}
                    errors={logErrors}
                  />
                </div>

                {/* AI panel */}
                {showAiPanel && (
                  <AiPanel
                    code={code}
                    log={log}
                    onInsert={(s) => editorRef.current?.insertSnippet(s)}
                    onOpenSettings={() => setShowSettings(true)}
                  />
                )}
              </div>

              {/* PDF Viewer */}
              <div className="flex-1 bg-gray-950 border-l border-gray-700 flex flex-col overflow-hidden">
                <div className="px-3 py-2 text-xs border-b border-gray-700 flex justify-between items-center shrink-0">
                  <span className={`font-bold ${pdfUrl ? "text-green-400" : "text-gray-500"}`}>PDF プレビュー</span>
                  <div className="flex items-center gap-2">
                    {logErrors.filter((e) => e.severity === "error").length > 0 && (
                      <span className="text-xs text-red-400">
                        ⚠ {logErrors.filter((e) => e.severity === "error").length} エラー
                      </span>
                    )}
                    <button
                      onClick={() => setShowLog(!showLog)}
                      className={`text-xs px-2 py-0.5 rounded ${showLog ? "bg-yellow-600 text-white" : "bg-gray-700 text-gray-400 hover:bg-gray-600"}`}
                    >
                      ログ
                    </button>
                    {pdfUrl && (
                      <a
                        href={`${pdfUrl}&download=1&name=${encodeURIComponent(currentProject + ".pdf")}`}
                        download
                        className="text-xs bg-blue-600 hover:bg-blue-500 px-2 py-0.5 rounded text-white"
                      >
                        DL
                      </a>
                    )}
                  </div>
                </div>

                {/* Log panel */}
                {showLog && (
                  <div className="h-48 shrink-0 border-b border-gray-700 flex flex-col overflow-hidden bg-gray-950">
                    <div className="flex-1 overflow-auto font-mono text-xs">
                      {log ? (
                        <table className="w-full border-collapse">
                          <tbody>
                            {log.split("\n").map((line, i) => {
                              const lineMatch = line.match(/^l\.(\d+)/);
                              const errorLine = lineMatch ? parseInt(lineMatch[1]) : null;
                              const isClickable = !!errorLine;
                              return (
                                <tr
                                  key={i}
                                  className={`hover:bg-gray-800 ${isClickable ? "cursor-pointer" : ""}`}
                                  onClick={() => { if (errorLine) editorRef.current?.jumpToLine(errorLine); }}
                                  title={isClickable ? `行 ${errorLine} にジャンプ` : undefined}
                                >
                                  <td className="select-none text-right text-gray-600 pr-3 pl-2 py-0.5 border-r border-gray-700 w-10 shrink-0 align-top">
                                    {i + 1}
                                  </td>
                                  <td className={`pl-3 pr-2 py-0.5 whitespace-pre-wrap break-all align-top ${
                                    line.match(/^!/) || line.match(/error/i)  ? "text-red-400" :
                                    line.match(/warning/i)                    ? "text-yellow-400" :
                                    line.match(/^Output written/)             ? "text-green-400" :
                                    isClickable                               ? "text-blue-400 underline" :
                                    "text-gray-300"
                                  }`}>
                                    {line || " "}
                                  </td>
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

                {/* PDF content */}
                <div className="flex-1 overflow-hidden relative">
                  {compiling ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-950">
                      <div className="text-center text-gray-400">
                        <div className="text-2xl mb-3 animate-spin">⚙</div>
                        <div className="text-sm">コンパイル中...</div>
                        {bibtex && <div className="text-xs text-gray-500 mt-1">BibTeX実行中...</div>}
                      </div>
                    </div>
                  ) : pdfUrl ? (
                    <iframe src={pdfUrl} className="w-full h-full" title="PDF Preview" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-950">
                      <div className="text-center text-gray-600">
                        <div className="text-5xl mb-4">📄</div>
                        <div className="text-sm mb-1">PDF プレビュー</div>
                        <div className="text-xs text-gray-700">Ctrl+Enter でコンパイル</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showSettings && <ApiKeyModal onClose={() => setShowSettings(false)} />}
      {showHistory && currentProject && (
        <VersionHistoryModal
          project={currentProject}
          file={currentFile}
          currentContent={code}
          onRestore={(content) => {
            setCode(content);
            saveFile(currentProject, currentFile, content);
          }}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
}
