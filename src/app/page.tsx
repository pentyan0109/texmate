"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import ProjectSidebar from "@/components/ProjectSidebar";

import type { EditorHandle } from "@/components/Editor";
const Editor = dynamic(() => import("@/components/Editor"), { ssr: false });

interface Project {
  name: string;
  updatedAt: string;
}

const ENGINES = [
  { id: "lualatex", label: "LuaLaTeX (推奨)" },
  { id: "uplatex", label: "upLaTeX" },
  { id: "platex", label: "pLaTeX" },
  { id: "xelatex", label: "XeLaTeX" },
  { id: "pdflatex", label: "pdfLaTeX" },
];

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<string | null>(null);
  const [currentFile, setCurrentFile] = useState<string>("main.tex");
  const [files, setFiles] = useState<string[]>([]);
  const [code, setCode] = useState<string>("");
  const [engine, setEngine] = useState("lualatex");
  const [compiling, setCompiling] = useState(false);
  const [log, setLog] = useState<string>("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [lineNumbers, setLineNumbers] = useState(false);
  const editorRef = useRef<EditorHandle>(null);

  const fetchProjects = useCallback(async () => {
    const res = await fetch("/api/projects");
    const data = await res.json();
    setProjects(data);
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const loadFile = useCallback(async (project: string, file: string) => {
    setCurrentFile(file);
    const res = await fetch(`/api/files?project=${encodeURIComponent(project)}&file=${encodeURIComponent(file)}`);
    const data = await res.json();
    setCode(data.content || "");
  }, []);

  const loadProject = useCallback(async (name: string) => {
    setCurrentProject(name);
    setPdfUrl(null);
    setLog("");
    const res = await fetch(`/api/files?project=${encodeURIComponent(name)}`);
    const data = await res.json();
    const fileList: string[] = data.files || ["main.tex"];
    setFiles(fileList);
    const mainFile = fileList.includes("main.tex") ? "main.tex" : fileList[0];
    loadFile(name, mainFile);
  }, [loadFile]);

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
    setSaving(false);
  }, [currentProject, currentFile, code]);

  const compile = useCallback(async () => {
    if (!currentProject) return;
    await saveFile();
    setCompiling(true);
    setLog("コンパイル中...");
    setPdfUrl(null);

    const res = await fetch("/api/compile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project: currentProject, file: currentFile, engine, lineNumbers }),
    });
    const data = await res.json();
    setLog(data.log || "");
    setCompiling(false);

    if (data.pdfFile) {
      setPdfUrl(`/api/pdf?project=${encodeURIComponent(currentProject)}&file=${encodeURIComponent(data.pdfFile)}&t=${Date.now()}`);
    }
  }, [currentProject, currentFile, engine, saveFile]);

  // Keyboard shortcut: Ctrl+S to save, Ctrl+Enter to compile
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
      <header className="flex items-center gap-3 px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="text-gray-400 hover:text-white text-lg"
          title="サイドバーを切り替え"
        >
          ☰
        </button>
        <span className="font-bold text-blue-400 text-lg">TexMate</span>
        <span className="text-gray-500 text-sm">日本語LaTeXエディタ</span>

        <div className="flex-1" />

        {currentProject && (
          <>
            <span className="text-xs text-gray-400">
              {currentProject} / {currentFile}
            </span>

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
              onClick={() => setLineNumbers(!lineNumbers)}
              className={`text-xs px-3 py-1 rounded border transition-colors ${
                lineNumbers
                  ? "bg-indigo-600 border-indigo-500 text-white"
                  : "bg-gray-700 border-gray-600 text-gray-400 hover:text-white"
              }`}
              title="PDF行番号 ON/OFF"
            >
              # 行番号
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
          <div className="flex flex-1 overflow-hidden">
            {/* File tabs + Editor */}
            <div className="flex flex-col flex-1 overflow-hidden">
              {/* File tabs */}
              {files.length > 1 && (
                <div className="flex bg-gray-800 border-b border-gray-700 shrink-0">
                  {files.map((f) => (
                    <button
                      key={f}
                      onClick={() => loadFile(currentProject, f)}
                      className={`text-xs px-4 py-2 border-r border-gray-700 hover:bg-gray-700 ${
                        currentFile === f ? "bg-gray-900 text-white border-t-2 border-t-blue-500" : "text-gray-400"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex-1 overflow-hidden">
                <Editor ref={editorRef} value={code} onChange={setCode} />
              </div>
            </div>

            {/* PDF Viewer - always visible like Overleaf */}
            <div className="flex-1 bg-gray-950 border-l border-gray-700 flex flex-col overflow-hidden">
              {/* PDF header */}
              <div className="px-3 py-2 text-xs border-b border-gray-700 flex justify-between items-center shrink-0">
                <span className={`font-bold ${pdfUrl ? "text-green-400" : "text-gray-500"}`}>
                  PDF プレビュー
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowLog(!showLog)}
                    className={`text-xs px-2 py-0.5 rounded ${showLog ? "bg-yellow-600 text-white" : "bg-gray-700 text-gray-400 hover:bg-gray-600"}`}
                  >
                    ログ
                  </button>
                  {pdfUrl && (
                    <a
                      href={pdfUrl ? `${pdfUrl}&download=1&name=${encodeURIComponent(currentProject + ".pdf")}` : "#"}
                      download
                      className="text-xs bg-blue-600 hover:bg-blue-500 px-2 py-0.5 rounded text-white"
                    >
                      DL
                    </a>
                  )}
                </div>
              </div>

              {/* Log panel (inline, above PDF) */}
              {showLog && (
                <div className="h-48 shrink-0 border-b border-gray-700 flex flex-col overflow-hidden bg-gray-950">
                  <div className="flex-1 overflow-auto font-mono text-xs">
                    {log ? (
                      <table className="w-full border-collapse">
                        <tbody>
                          {log.split("\n").map((line, i) => (
                            <tr key={i} className="hover:bg-gray-800">
                              <td className="select-none text-right text-gray-600 pr-3 pl-2 py-0.5 border-r border-gray-700 w-10 shrink-0 align-top">
                                {i + 1}
                              </td>
                              <td className={`pl-3 pr-2 py-0.5 whitespace-pre-wrap break-all align-top ${
                                line.match(/error|fatal/i) ? "text-red-400" :
                                line.match(/warning/i) ? "text-yellow-400" :
                                line.match(/^Output written/) ? "text-green-400" :
                                "text-gray-300"
                              }`}>
                                {line || " "}
                              </td>
                            </tr>
                          ))}
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
                    </div>
                  </div>
                ) : pdfUrl ? (
                  <iframe
                    src={pdfUrl}
                    className="w-full h-full"
                    title="PDF Preview"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-950">
                    <div className="text-center text-gray-600">
                      <div className="text-5xl mb-4">📄</div>
                      <div className="text-sm mb-1">PDF プレビュー</div>
                      <div className="text-xs text-gray-700">
                        Ctrl+Enter でコンパイル
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
