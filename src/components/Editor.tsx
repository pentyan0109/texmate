"use client";
import dynamic from "next/dynamic";
import { useRef, useImperativeHandle, forwardRef } from "react";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
}

export interface EditorHandle {
  insertSnippet: (snippet: string) => void;
}

const Editor = forwardRef<EditorHandle, EditorProps>(function Editor({ value, onChange }, ref) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null);

  useImperativeHandle(ref, () => ({
    insertSnippet(snippet: string) {
      const editor = editorRef.current;
      if (!editor) return;
      const selection = editor.getSelection();
      editor.executeEdits("insert-snippet", [{
        range: selection,
        text: snippet,
        forceMoveMarkers: true,
      }]);
      editor.focus();
    },
  }));

  return (
    <MonacoEditor
      height="100%"
      language="latex"
      theme="vs-dark"
      value={value}
      onChange={(v) => onChange(v ?? "")}
      onMount={(editor) => {
        editorRef.current = editor;
      }}
      options={{
        fontSize: 14,
        minimap: { enabled: true },
        wordWrap: "on",
        lineNumbers: "on",
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
        fontLigatures: true,
      }}
    />
  );
});

export default Editor;
