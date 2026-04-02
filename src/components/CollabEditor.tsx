"use client";
import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import dynamic from "next/dynamic";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

export interface CollabHandle {
  insertSnippet: (snippet: string) => void;
  jumpToLine: (line: number) => void;
  getValue: () => string;
}

interface Props {
  roomId: string; // "project:file"
  initialValue: string;
  onChange: (value: string) => void;
  onAwarenessChange?: (users: string[]) => void;
}

// Yjs + y-websocket collaborative editor
// Loaded fully dynamically because Yjs uses browser APIs
const CollabEditor = forwardRef<CollabHandle, Props>(function CollabEditor(
  { roomId, initialValue, onChange, onAwarenessChange },
  ref
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef  = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const monacoRef  = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bindingRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const providerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ydocRef    = useRef<any>(null);

  useImperativeHandle(ref, () => ({
    insertSnippet(snippet: string) {
      const editor = editorRef.current;
      if (!editor) return;
      const selection = editor.getSelection();
      editor.executeEdits("insert-snippet", [{ range: selection, text: snippet, forceMoveMarkers: true }]);
      editor.focus();
    },
    jumpToLine(line: number) {
      const editor = editorRef.current;
      if (!editor) return;
      editor.revealLineInCenter(line);
      editor.setPosition({ lineNumber: line, column: 1 });
      editor.focus();
    },
    getValue() { return editorRef.current?.getValue() ?? ""; },
  }));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Dynamic imports to avoid SSR issues
      const Y      = await import("yjs");
      const { WebsocketProvider } = await import("y-websocket");
      const { MonacoBinding }     = await import("y-monaco");

      if (cancelled) return;

      // Cleanup previous session
      if (bindingRef.current) { bindingRef.current.destroy(); bindingRef.current = null; }
      if (providerRef.current) { providerRef.current.destroy(); providerRef.current = null; }
      if (ydocRef.current) { ydocRef.current.destroy(); ydocRef.current = null; }

      const ydoc = new Y.Doc() as InstanceType<typeof Y.Doc>;
      ydocRef.current = ydoc;

      const wsUrl = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/api/collab`;
      const provider = new WebsocketProvider(wsUrl, roomId, ydoc);
      providerRef.current = provider;

      // Set awareness user color
      const colors = ["#ff6b6b","#ffd93d","#6bcb77","#4d96ff","#c77dff"];
      const color = colors[Math.floor(Math.random() * colors.length)];
      provider.awareness.setLocalStateField("user", {
        name: `User-${Math.floor(Math.random() * 1000)}`,
        color,
      });

      // Awareness changes
      provider.awareness.on("change", () => {
        const users: string[] = [];
        provider.awareness.getStates().forEach((state) => {
          if (state.user?.name) users.push(state.user.name as string);
        });
        onAwarenessChange?.(users);
      });

      const yText = ydoc.getText("content");

      // If doc is empty (new connection), seed with initialValue
      provider.on("sync", (isSynced: boolean) => {
        if (isSynced && yText.toString() === "") {
          ydoc.transact(() => { yText.insert(0, initialValue); });
        }
      });

      // Bind to Monaco when editor is ready
      if (editorRef.current && monacoRef.current) {
        const monaco = monacoRef.current;
        const editor = editorRef.current;
        bindingRef.current = new MonacoBinding(
          yText,
          editor.getModel(),
          new Set([editor]),
          provider.awareness
        );
        // Propagate changes outward
        yText.observe(() => onChange(yText.toString()));
        void monaco; // suppress unused warning
      }
    })();

    return () => {
      cancelled = true;
      bindingRef.current?.destroy();
      providerRef.current?.destroy();
      ydocRef.current?.destroy();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleMount(editor: any, monaco: any) {
    editorRef.current  = editor;
    monacoRef.current  = monaco;
  }

  return (
    <MonacoEditor
      height="100%"
      language="latex"
      theme="vs-dark"
      defaultValue={initialValue}
      onMount={handleMount}
      options={{
        fontSize: 14,
        minimap: { enabled: true },
        wordWrap: "on",
        lineNumbers: "on",
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        fontFamily: "'Cascadia Code','Fira Code','Consolas',monospace",
        fontLigatures: true,
      }}
    />
  );
});

export default CollabEditor;
