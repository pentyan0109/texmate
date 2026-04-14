"use client";
import { useEffect, useRef, useState, useCallback } from "react";

interface Props {
  pdfUrl: string | null;
  compiling: boolean;
  project: string;
  file: string;
  onSyncClick?: (line: number, srcFile: string) => void;
  syncTargetLine?: number | null; // editor → pdf highlight
}

export default function PdfViewer({ pdfUrl, compiling, project, file, onSyncClick, syncTargetLine }: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfDocRef   = useRef<any>(null);
  const renderingRef = useRef(false);

  const [numPages, setNumPages]   = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale]         = useState(1.4);
  const [loading, setLoading]     = useState(false);
  const [syncEnabled, setSyncEnabled] = useState(false);

  // Load PDF.js dynamically
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getLib = useCallback(async (): Promise<any> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfjsLib = await import("pdfjs-dist") as any;
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    }
    return pdfjsLib;
  }, []);

  const renderPage = useCallback(async (doc: unknown, pageNum: number, sc: number) => {
    if (renderingRef.current) return;
    renderingRef.current = true;
    const canvas = canvasRef.current;
    if (!canvas) { renderingRef.current = false; return; }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await (doc as any).getPage(pageNum);
    const viewport = page.getViewport({ scale: sc });
    canvas.width  = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) { renderingRef.current = false; return; }
    await page.render({ canvasContext: ctx, viewport }).promise;
    renderingRef.current = false;
  }, []);

  // Load PDF when URL changes
  useEffect(() => {
    if (!pdfUrl) { pdfDocRef.current = null; setNumPages(0); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const lib = await getLib();
        const doc = await lib.getDocument(pdfUrl).promise;
        if (cancelled) return;
        pdfDocRef.current = doc;
        setNumPages(doc.numPages);
        setCurrentPage(1);
        await renderPage(doc, 1, scale);
      } catch { /* ignore */ }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfUrl]);

  // Re-render on page/scale change
  useEffect(() => {
    if (!pdfDocRef.current) return;
    renderPage(pdfDocRef.current, currentPage, scale);
  }, [currentPage, scale, renderPage]);

  // Scroll to page when SyncTeX highlights it
  useEffect(() => {
    if (syncTargetLine == null || !syncEnabled) return;
    // This is triggered from outside — we just indicate visually on the canvas
    // (full SyncTeX overlay would require text layer, which is complex)
  }, [syncTargetLine, syncEnabled]);

  // Handle click on canvas → pdf2src SyncTeX lookup
  async function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!syncEnabled || !onSyncClick) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasX = (e.clientX - rect.left) * scaleX;
    const canvasY = (e.clientY - rect.top)  * scaleY;

    // Convert canvas coords to SyncTeX coords (pts * 65536)
    // PDF.js uses CSS pixels; synctex uses scaled points
    // Approximate: synctex h = x_pt * 65536, v = (pageHeight - y_pt) * 65536
    const pdfDoc = pdfDocRef.current;
    if (!pdfDoc) return;
    const page = await pdfDoc.getPage(currentPage);
    const viewport = page.getViewport({ scale });
    const pageHeightPt = viewport.height / scale * (72 / 72);
    const xPt = canvasX / scale;
    const yPt = pageHeightPt - canvasY / scale;
    const syncX = Math.round(xPt * 65536);
    const syncY = Math.round(yPt * 65536);

    try {
      const baseName = file.replace(/\.tex$/, "");
      const res = await fetch(
        `/api/synctex?project=${encodeURIComponent(project)}&file=${encodeURIComponent(baseName)}&action=pdf2src&page=${currentPage}&x=${syncX}&y=${syncY}`
      );
      if (res.ok) {
        const data = await res.json() as { line?: number; file?: string };
        if (data.line) onSyncClick(data.line, data.file ?? file);
      }
    } catch { /* ignore */ }
  }

  function goPage(delta: number) {
    setCurrentPage((p) => Math.max(1, Math.min(numPages, p + delta)));
  }

  if (compiling) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-950">
        <div className="text-center text-gray-400">
          <div className="text-2xl mb-3 animate-spin">⚙</div>
          <div className="text-sm">コンパイル中...</div>
        </div>
      </div>
    );
  }

  if (!pdfUrl) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-950">
        <div className="text-center text-gray-600">
          <div className="text-5xl mb-4">📄</div>
          <div className="text-sm mb-1">PDF プレビュー</div>
          <div className="text-xs text-gray-700">Ctrl+Enter でコンパイル</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-950">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-700 shrink-0 bg-gray-900">
        <button onClick={() => goPage(-1)} disabled={currentPage <= 1} className="text-gray-400 hover:text-white disabled:opacity-30 text-sm px-1">◀</button>
        <span className="text-xs text-gray-400">
          {currentPage} / {numPages}
        </span>
        <button onClick={() => goPage(1)} disabled={currentPage >= numPages} className="text-gray-400 hover:text-white disabled:opacity-30 text-sm px-1">▶</button>

        <div className="w-px h-4 bg-gray-700 mx-1" />

        <button onClick={() => setScale((s) => Math.max(0.5, +(s - 0.2).toFixed(1)))} className="text-xs text-gray-400 hover:text-white px-1">－</button>
        <span className="text-xs text-gray-400 w-10 text-center">{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale((s) => Math.min(4, +(s + 0.2).toFixed(1)))} className="text-xs text-gray-400 hover:text-white px-1">＋</button>
        <button onClick={() => setScale(1.4)} className="text-xs text-gray-600 hover:text-gray-400 px-1">リセット</button>

        <div className="w-px h-4 bg-gray-700 mx-1" />

        <button
          onClick={() => setSyncEnabled(!syncEnabled)}
          className={`text-xs px-2 py-0.5 rounded border transition-colors ${
            syncEnabled
              ? "bg-cyan-700 border-cyan-600 text-white"
              : "border-gray-600 text-gray-500 hover:bg-gray-700"
          }`}
          title="クリックでエディタ該当行へジャンプ (SyncTeX)"
        >
          SyncTeX
        </button>
        {loading && <span className="text-xs text-gray-500 animate-pulse">読込中...</span>}
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="flex-1 overflow-auto flex justify-center bg-gray-800 p-2">
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          className={`shadow-2xl ${syncEnabled ? "cursor-crosshair" : "cursor-default"}`}
          style={{ maxWidth: "100%", height: "auto", display: "block" }}
        />
      </div>
    </div>
  );
}
