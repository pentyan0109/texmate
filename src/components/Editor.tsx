"use client";
import dynamic from "next/dynamic";
import { useRef, useImperativeHandle, forwardRef, useEffect } from "react";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  errors?: EditorError[];
}

export interface EditorError {
  line: number;
  message: string;
  severity: "error" | "warning";
}

export interface EditorHandle {
  insertSnippet: (snippet: string) => void;
  jumpToLine: (line: number) => void;
  getValue: () => string;
}

// Comprehensive LaTeX command completions
const LATEX_COMPLETIONS = [
  // Document structure
  "documentclass", "usepackage", "begin", "end", "maketitle", "tableofcontents",
  "section", "subsection", "subsubsection", "paragraph", "subparagraph",
  "chapter", "part", "appendix", "label", "ref", "cite", "bibliography",
  // Text formatting
  "textbf", "textit", "texttt", "textsc", "textsf", "underline", "emph",
  "tiny", "scriptsize", "footnotesize", "small", "normalsize", "large",
  "Large", "LARGE", "huge", "Huge",
  // Math
  "frac", "sqrt", "sum", "prod", "int", "oint", "iint", "iiint",
  "lim", "inf", "sup", "max", "min", "det", "ln", "log", "exp",
  "sin", "cos", "tan", "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh",
  "alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta",
  "iota", "kappa", "lambda", "mu", "nu", "xi", "pi", "rho", "sigma",
  "tau", "upsilon", "phi", "chi", "psi", "omega",
  "Gamma", "Delta", "Theta", "Lambda", "Xi", "Pi", "Sigma", "Upsilon",
  "Phi", "Psi", "Omega",
  "vec", "hat", "bar", "dot", "ddot", "tilde", "overline", "underline",
  "overbrace", "underbrace", "overleftarrow", "overrightarrow",
  "left", "right", "cdot", "times", "div", "pm", "mp", "leq", "geq",
  "neq", "approx", "equiv", "sim", "simeq", "cong", "propto",
  "in", "notin", "subset", "supset", "subseteq", "supseteq", "cup", "cap",
  "infty", "partial", "nabla", "forall", "exists", "nexists",
  "mathbb", "mathbf", "mathcal", "mathfrak", "mathit", "mathrm", "mathsf",
  "text", "operatorname",
  // Environments
  "equation", "align", "gather", "multline", "split", "cases",
  "matrix", "pmatrix", "bmatrix", "vmatrix", "Vmatrix", "Bmatrix",
  "itemize", "enumerate", "description",
  "figure", "table", "tabular", "array",
  "theorem", "lemma", "proof", "corollary", "definition", "remark",
  "abstract", "titlepage",
  // References & bibliography
  "bibitem", "bibliographystyle", "addbibresource", "printbibliography",
  "footnote", "footnotemark", "footnotetext",
  "hyperref", "href", "url",
  // Graphics
  "includegraphics", "caption", "centering", "linewidth", "textwidth",
  // Spacing
  "vspace", "hspace", "vfill", "hfill", "newline", "linebreak", "pagebreak",
  "newpage", "clearpage", "noindent", "indent",
  // Misc
  "today", "LaTeX", "TeX", "ldots", "cdots", "vdots", "ddots",
  "quad", "qquad", ",", ":", ";", "!", " ",
];

const Editor = forwardRef<EditorHandle, EditorProps>(function Editor({ value, onChange, errors }, ref) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const monacoRef = useRef<any>(null);

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
    jumpToLine(line: number) {
      const editor = editorRef.current;
      if (!editor) return;
      editor.revealLineInCenter(line);
      editor.setPosition({ lineNumber: line, column: 1 });
      editor.focus();
    },
    getValue() {
      return editorRef.current?.getValue() ?? "";
    },
  }));

  // Update Monaco markers when errors change
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const model = editor.getModel();
    if (!model) return;

    if (!errors || errors.length === 0) {
      monaco.editor.setModelMarkers(model, "latex-errors", []);
      return;
    }

    const markers = errors.map((e) => ({
      severity: e.severity === "error"
        ? monaco.MarkerSeverity.Error
        : monaco.MarkerSeverity.Warning,
      message: e.message,
      startLineNumber: e.line,
      startColumn: 1,
      endLineNumber: e.line,
      endColumn: 999,
    }));
    monaco.editor.setModelMarkers(model, "latex-errors", markers);
  }, [errors]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleEditorMount(editor: any, monaco: any) {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Register LaTeX completion provider
    monaco.languages.registerCompletionItemProvider("latex", {
      triggerCharacters: ["\\", "{"],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provideCompletionItems(model: any, position: any) {
        const wordInfo = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: wordInfo.startColumn,
          endColumn: wordInfo.endColumn,
        };

        // Check if preceded by backslash
        const linePrefix = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });

        if (!linePrefix.endsWith("\\") && !linePrefix.match(/\\[a-zA-Z]*$/)) {
          return { suggestions: [] };
        }

        const suggestions = LATEX_COMPLETIONS.map((cmd) => ({
          label: `\\${cmd}`,
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: cmd,
          range,
          detail: "LaTeX command",
        }));

        return { suggestions };
      },
    });
  }

  return (
    <MonacoEditor
      height="100%"
      language="latex"
      theme="vs-dark"
      value={value}
      onChange={(v) => onChange(v ?? "")}
      onMount={handleEditorMount}
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
        suggestOnTriggerCharacters: true,
        quickSuggestions: { other: true, comments: false, strings: false },
      }}
    />
  );
});

export default Editor;
