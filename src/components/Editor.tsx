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

// ── LaTeX static linter ───────────────────────────────────────────────────
function lintLatex(code: string): EditorError[] {
  const errors: EditorError[] = [];
  const lines = code.split("\n");

  // Track \begin/\end stack
  const stack: { env: string; line: number }[] = [];
  const beginRe = /\\begin\{([^}]+)\}/g;
  const endRe   = /\\end\{([^}]+)\}/g;

  lines.forEach((rawLine, i) => {
    const lineNum = i + 1;
    const line = rawLine;

    // Check begin/end balance
    let m: RegExpExecArray | null;
    beginRe.lastIndex = 0;
    while ((m = beginRe.exec(line)) !== null) {
      stack.push({ env: m[1], line: lineNum });
    }
    endRe.lastIndex = 0;
    while ((m = endRe.exec(line)) !== null) {
      const env = m[1];
      if (stack.length === 0) {
        errors.push({ line: lineNum, message: `\\end{${env}} に対応する \\begin がありません`, severity: "error" });
      } else {
        const top = stack[stack.length - 1];
        if (top.env !== env) {
          errors.push({ line: lineNum, message: `\\end{${env}} が \\begin{${top.env}} (行${top.line}) と一致しません`, severity: "error" });
        } else {
          stack.pop();
        }
      }
    }

    // Unmatched $ (odd number of $ on a line that isn't a comment)
    const stripped = line.replace(/%.*/,"");
    const dollarCount = (stripped.match(/(?<!\\)\$/g) ?? []).length;
    if (dollarCount % 2 !== 0 && !stripped.includes("$$")) {
      errors.push({ line: lineNum, message: "$ の数が奇数です（閉じ忘れの可能性）", severity: "warning" });
    }

    // Unmatched braces { }
    let depth = 0;
    for (const ch of stripped) {
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
    }
    if (depth !== 0) {
      errors.push({ line: lineNum, message: `中括弧 { } が ${depth > 0 ? "閉じ" : "開き"}忘れの可能性`, severity: "warning" });
    }

    // Warn about \\ outside math/tabular
    if (stripped.match(/\\\\/) && !stripped.match(/\\begin|\\end|&/)) {
      // Only warn if not clearly in a known block context — just a hint
    }

    // Double-space typo hint: two spaces after period
    if (stripped.match(/\. {2,}[A-Z]/)) {
      errors.push({ line: lineNum, message: "ピリオド後の二重スペース（~またはスペース1つを推奨）", severity: "warning" });
    }

    // Warn about \usepackage after \begin{document}
    if (stripped.match(/\\usepackage/)) {
      const docStartIdx = lines.slice(0, i).findIndex((l) => l.includes("\\begin{document}"));
      if (docStartIdx >= 0) {
        errors.push({ line: lineNum, message: "\\usepackage は \\begin{document} の前に記述してください", severity: "error" });
      }
    }
  });

  // Remaining unclosed \begin
  for (const item of stack) {
    errors.push({ line: item.line, message: `\\begin{${item.env}} が閉じられていません`, severity: "error" });
  }

  return errors;
}

// ── LaTeX completion commands ─────────────────────────────────────────────
const LATEX_COMPLETIONS = [
  "documentclass","usepackage","begin","end","maketitle","tableofcontents",
  "section","subsection","subsubsection","paragraph","subparagraph",
  "chapter","part","appendix","label","ref","eqref","cite","bibliography",
  "frac","sqrt","sum","prod","int","oint","iint","iiint",
  "lim","inf","sup","max","min","det","ln","log","exp",
  "sin","cos","tan","arcsin","arccos","arctan","sinh","cosh","tanh",
  "alpha","beta","gamma","delta","epsilon","varepsilon","zeta","eta","theta","vartheta",
  "iota","kappa","lambda","mu","nu","xi","pi","varpi","rho","varrho","sigma","varsigma",
  "tau","upsilon","phi","varphi","chi","psi","omega",
  "Gamma","Delta","Theta","Lambda","Xi","Pi","Sigma","Upsilon","Phi","Psi","Omega",
  "vec","hat","bar","dot","ddot","tilde","overline","underline","widehat","widetilde",
  "overbrace","underbrace","overleftarrow","overrightarrow","overleftrightarrow",
  "left","right","bigl","bigr","Bigl","Bigr","biggl","biggr",
  "cdot","times","div","pm","mp","leq","geq","neq","approx","equiv","sim","simeq","cong","propto",
  "in","notin","subset","supset","subseteq","supseteq","cup","cap","setminus","emptyset",
  "infty","partial","nabla","forall","exists","nexists","neg","wedge","vee",
  "to","leftarrow","rightarrow","Rightarrow","Leftarrow","Leftrightarrow","mapsto",
  "hookrightarrow","hookleftarrow","uparrow","downarrow","updownarrow",
  "mathbb","mathbf","mathcal","mathfrak","mathit","mathrm","mathsf","mathtt",
  "text","operatorname","DeclareMathOperator",
  "textbf","textit","texttt","textsc","textsf","emph","underline",
  "tiny","scriptsize","footnotesize","small","normalsize","large","Large","LARGE","huge","Huge",
  "vspace","hspace","vfill","hfill","newline","linebreak","pagebreak","newpage","clearpage",
  "noindent","indent","centering","raggedright","raggedleft",
  "includegraphics","caption","subcaption",
  "footnote","footnotemark","footnotetext",
  "href","url","hyperref",
  "today","LaTeX","TeX","ldots","cdots","vdots","ddots",
  "quad","qquad",",",":",";"," ",
  "newcommand","renewcommand","newenvironment","renewenvironment",
  "setlength","addtolength","setcounter","addtocounter","stepcounter",
  "hline","cline","multicolumn","multirow",
  "bibitem","bibliographystyle","addbibresource","printbibliography",
  "input","include","includeonly",
  "color","textcolor","colorbox","fcolorbox",
  "tikzpicture","draw","node","path","fill","foreach",
];

const Editor = forwardRef<EditorHandle, EditorProps>(function Editor({ value, onChange, errors }, ref) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef  = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const monacoRef  = useRef<any>(null);
  const lintTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Apply compile-log errors as Monaco markers
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const model = editor.getModel();
    if (!model) return;

    if (!errors || errors.length === 0) {
      monaco.editor.setModelMarkers(model, "latex-compile", []);
      return;
    }

    const markers = errors.map((e) => ({
      severity: e.severity === "error" ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
      message: e.message,
      startLineNumber: e.line,
      startColumn: 1,
      endLineNumber: e.line,
      endColumn: 999,
    }));
    monaco.editor.setModelMarkers(model, "latex-compile", markers);
  }, [errors]);

  // Run static linter after each change (debounced 600ms)
  function runLinter(code: string) {
    if (lintTimer.current) clearTimeout(lintTimer.current);
    lintTimer.current = setTimeout(() => {
      const editor = editorRef.current;
      const monaco = monacoRef.current;
      if (!editor || !monaco) return;
      const model = editor.getModel();
      if (!model) return;
      const lintErrors = lintLatex(code);
      const markers = lintErrors.map((e) => ({
        severity: e.severity === "error" ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
        message: e.message,
        startLineNumber: e.line,
        startColumn: 1,
        endLineNumber: e.line,
        endColumn: 999,
      }));
      monaco.editor.setModelMarkers(model, "latex-lint", markers);
    }, 600);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleEditorMount(editor: any, monaco: any) {
    editorRef.current  = editor;
    monacoRef.current  = monaco;

    // Initial lint
    runLinter(editor.getValue());

    // Register LaTeX completion provider
    monaco.languages.registerCompletionItemProvider("latex", {
      triggerCharacters: ["\\", "{"],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provideCompletionItems(model: any, position: any) {
        const linePrefix = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });
        if (!linePrefix.match(/\\[a-zA-Z]*$/)) return { suggestions: [] };

        const wordInfo = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: wordInfo.startColumn,
          endColumn: wordInfo.endColumn,
        };

        const suggestions = LATEX_COMPLETIONS.map((cmd) => ({
          label: `\\${cmd}`,
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: cmd,
          range,
          detail: "LaTeX",
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
      onChange={(v) => {
        const val = v ?? "";
        onChange(val);
        runLinter(val);
      }}
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
