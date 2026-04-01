"use client";
import { useState } from "react";

interface Props {
  onInsert: (snippet: string) => void;
}

type Tab = "math" | "symbol" | "env" | "pkg";

type Item = { label: string; snippet: string; title?: string };

const MATH: Item[] = [
  { label: "\\frac",     snippet: "\\frac{}{}" },
  { label: "\\sqrt",     snippet: "\\sqrt{}" },
  { label: "\\sum",      snippet: "\\sum_{i=1}^{n}" },
  { label: "\\int",      snippet: "\\int_{a}^{b}" },
  { label: "\\lim",      snippet: "\\lim_{x \\to 0}" },
  { label: "\\prod",     snippet: "\\prod_{i=1}^{n}" },
  { label: "x^{}",       snippet: "x^{}" },
  { label: "x_{}",       snippet: "x_{}" },
  { label: "\\partial",  snippet: "\\partial" },
  { label: "\\nabla",    snippet: "\\nabla" },
  { label: "\\binom",    snippet: "\\binom{n}{k}" },
  { label: "\\overline", snippet: "\\overline{}" },
  { label: "\\vec",      snippet: "\\vec{}" },
  { label: "\\hat",      snippet: "\\hat{}" },
  { label: "\\bar",      snippet: "\\bar{}" },
  { label: "\\tilde",    snippet: "\\tilde{}" },
  { label: "pmatrix",    snippet: "\\begin{pmatrix}\n  a & b \\\\\n  c & d\n\\end{pmatrix}" },
  { label: "bmatrix",    snippet: "\\begin{bmatrix}\n  a & b \\\\\n  c & d\n\\end{bmatrix}" },
  { label: "aligned",    snippet: "\\begin{aligned}\n  f(x) &= x^2 \\\\\n       &= x \\cdot x\n\\end{aligned}" },
  { label: "cases",      snippet: "\\begin{cases}\n  1 & \\text{if } x > 0 \\\\\n  0 & \\text{otherwise}\n\\end{cases}" },
  { label: "\\text{}",   snippet: "\\text{}" },
  { label: "\\mathbf",   snippet: "\\mathbf{}" },
  { label: "\\mathbb",   snippet: "\\mathbb{}" },
];

const SYMBOLS: Item[] = [
  // Greek lower
  { label: "α", snippet: "\\alpha" },
  { label: "β", snippet: "\\beta" },
  { label: "γ", snippet: "\\gamma" },
  { label: "δ", snippet: "\\delta" },
  { label: "ε", snippet: "\\epsilon" },
  { label: "ζ", snippet: "\\zeta" },
  { label: "η", snippet: "\\eta" },
  { label: "θ", snippet: "\\theta" },
  { label: "λ", snippet: "\\lambda" },
  { label: "μ", snippet: "\\mu" },
  { label: "ν", snippet: "\\nu" },
  { label: "ξ", snippet: "\\xi" },
  { label: "π", snippet: "\\pi" },
  { label: "ρ", snippet: "\\rho" },
  { label: "σ", snippet: "\\sigma" },
  { label: "τ", snippet: "\\tau" },
  { label: "φ", snippet: "\\phi" },
  { label: "χ", snippet: "\\chi" },
  { label: "ψ", snippet: "\\psi" },
  { label: "ω", snippet: "\\omega" },
  // Greek upper
  { label: "Γ", snippet: "\\Gamma" },
  { label: "Δ", snippet: "\\Delta" },
  { label: "Λ", snippet: "\\Lambda" },
  { label: "Σ", snippet: "\\Sigma" },
  { label: "Ω", snippet: "\\Omega" },
  { label: "Π", snippet: "\\Pi" },
  { label: "Φ", snippet: "\\Phi" },
  { label: "Ψ", snippet: "\\Psi" },
  // Arrows
  { label: "→", snippet: "\\to",            title: "\\to" },
  { label: "←", snippet: "\\leftarrow",     title: "\\leftarrow" },
  { label: "⇒", snippet: "\\Rightarrow",    title: "\\Rightarrow" },
  { label: "⇐", snippet: "\\Leftarrow",     title: "\\Leftarrow" },
  { label: "⇔", snippet: "\\Leftrightarrow",title: "\\Leftrightarrow" },
  { label: "↑", snippet: "\\uparrow",       title: "\\uparrow" },
  { label: "↓", snippet: "\\downarrow",     title: "\\downarrow" },
  { label: "↦", snippet: "\\mapsto",        title: "\\mapsto" },
  { label: "↪", snippet: "\\hookrightarrow",title: "\\hookrightarrow" },
  // Operators
  { label: "≤", snippet: "\\leq" },
  { label: "≥", snippet: "\\geq" },
  { label: "≠", snippet: "\\neq" },
  { label: "≈", snippet: "\\approx" },
  { label: "≡", snippet: "\\equiv" },
  { label: "∼", snippet: "\\sim" },
  { label: "∞", snippet: "\\infty" },
  { label: "±", snippet: "\\pm" },
  { label: "∓", snippet: "\\mp" },
  { label: "×", snippet: "\\times" },
  { label: "÷", snippet: "\\div" },
  { label: "·", snippet: "\\cdot" },
  { label: "∈", snippet: "\\in" },
  { label: "∉", snippet: "\\notin" },
  { label: "⊂", snippet: "\\subset" },
  { label: "⊃", snippet: "\\supset" },
  { label: "∪", snippet: "\\cup" },
  { label: "∩", snippet: "\\cap" },
  { label: "∀", snippet: "\\forall" },
  { label: "∃", snippet: "\\exists" },
  { label: "¬", snippet: "\\neg" },
  { label: "∧", snippet: "\\wedge" },
  { label: "∨", snippet: "\\vee" },
  { label: "∅", snippet: "\\emptyset" },
  { label: "…", snippet: "\\ldots" },
  { label: "⋯", snippet: "\\cdots" },
];

const ENVS: Item[] = [
  { label: "equation",   snippet: "\\begin{equation}\n  \n\\end{equation}" },
  { label: "equation*",  snippet: "\\begin{equation*}\n  \n\\end{equation*}" },
  { label: "align",      snippet: "\\begin{align}\n  f(x) &= x^2 \\\\\n  g(x) &= x^3\n\\end{align}" },
  { label: "align*",     snippet: "\\begin{align*}\n  f(x) &= x^2 \\\\\n  g(x) &= x^3\n\\end{align*}" },
  { label: "itemize",    snippet: "\\begin{itemize}\n  \\item 項目1\n  \\item 項目2\n\\end{itemize}" },
  { label: "enumerate",  snippet: "\\begin{enumerate}\n  \\item 項目1\n  \\item 項目2\n\\end{enumerate}" },
  { label: "table",      snippet: "\\begin{table}[h]\n  \\centering\n  \\begin{tabular}{|c|c|c|}\n    \\hline\n    A & B & C \\\\\n    \\hline\n    1 & 2 & 3 \\\\\n    \\hline\n  \\end{tabular}\n  \\caption{表}\n  \\label{tab:label}\n\\end{table}" },
  { label: "figure",     snippet: "\\begin{figure}[h]\n  \\centering\n  \\includegraphics[width=0.8\\linewidth]{filename}\n  \\caption{キャプション}\n  \\label{fig:label}\n\\end{figure}" },
  { label: "theorem",    snippet: "\\begin{theorem}\n  \n\\end{theorem}" },
  { label: "lemma",      snippet: "\\begin{lemma}\n  \n\\end{lemma}" },
  { label: "proof",      snippet: "\\begin{proof}\n  \n\\end{proof}" },
  { label: "abstract",   snippet: "\\begin{abstract}\n\n\\end{abstract}" },
  { label: "verbatim",   snippet: "\\begin{verbatim}\n\n\\end{verbatim}" },
  { label: "lstlisting", snippet: "\\begin{lstlisting}[language=Python]\n\n\\end{lstlisting}" },
  { label: "minipage",   snippet: "\\begin{minipage}{0.5\\linewidth}\n\n\\end{minipage}" },
  { label: "\\section",  snippet: "\\section{}" },
  { label: "\\subsection", snippet: "\\subsection{}" },
  { label: "\\textbf",   snippet: "\\textbf{}" },
  { label: "\\textit",   snippet: "\\textit{}" },
  { label: "\\underline",snippet: "\\underline{}" },
  { label: "\\footnote", snippet: "\\footnote{}" },
  { label: "\\cite",     snippet: "\\cite{}" },
  { label: "\\ref",      snippet: "\\ref{}" },
  { label: "\\label",    snippet: "\\label{}" },
];

const PKGS: Item[] = [
  { label: "amsmath",     snippet: "\\usepackage{amsmath}",                              title: "数式拡張" },
  { label: "amssymb",     snippet: "\\usepackage{amssymb}",                              title: "数学記号" },
  { label: "graphicx",    snippet: "\\usepackage{graphicx}",                             title: "画像挿入" },
  { label: "hyperref",    snippet: "\\usepackage[hidelinks]{hyperref}",                  title: "ハイパーリンク" },
  { label: "geometry",    snippet: "\\usepackage[margin=25mm]{geometry}",                title: "余白設定" },
  { label: "listings",    snippet: "\\usepackage{listings}\n\\usepackage{xcolor}",        title: "ソースコード" },
  { label: "tikz",        snippet: "\\usepackage{tikz}",                                 title: "図形描画" },
  { label: "pgfplots",    snippet: "\\usepackage{pgfplots}\n\\pgfplotsset{compat=1.18}", title: "グラフ" },
  { label: "booktabs",    snippet: "\\usepackage{booktabs}",                             title: "キレイな表" },
  { label: "caption",     snippet: "\\usepackage[font=small]{caption}",                  title: "キャプション" },
  { label: "subcaption",  snippet: "\\usepackage{subcaption}",                           title: "サブ図" },
  { label: "siunitx",     snippet: "\\usepackage{siunitx}",                              title: "SI単位" },
  { label: "mhchem",      snippet: "\\usepackage[version=4]{mhchem}",                    title: "化学式" },
  { label: "algorithm2e", snippet: "\\usepackage[ruled,vlined]{algorithm2e}",            title: "アルゴリズム" },
  { label: "biblatex",    snippet: "\\usepackage[backend=biber,style=numeric]{biblatex}\n\\addbibresource{refs.bib}", title: "参考文献" },
  { label: "natbib",      snippet: "\\usepackage[numbers]{natbib}",                      title: "参考文献(natbib)" },
  { label: "tcolorbox",   snippet: "\\usepackage{tcolorbox}",                            title: "カラーボックス" },
  { label: "cleveref",    snippet: "\\usepackage{cleveref}",                             title: "賢い参照" },
  { label: "microtype",   snippet: "\\usepackage{microtype}",                            title: "タイポグラフィ改善" },
  { label: "luatexja-preset", snippet: "\\usepackage[noto]{luatexja-preset}",           title: "日本語フォントプリセット" },
];

const TABS: { id: Tab; label: string; items: Item[] }[] = [
  { id: "math",   label: "数式",       items: MATH },
  { id: "symbol", label: "記号",       items: SYMBOLS },
  { id: "env",    label: "環境・コマンド", items: ENVS },
  { id: "pkg",    label: "パッケージ", items: PKGS },
];

export default function SymbolToolbar({ onInsert }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("math");
  const [open, setOpen] = useState(true);

  const items = TABS.find((t) => t.id === activeTab)?.items ?? [];

  return (
    <div className="shrink-0 border-b border-gray-700 bg-gray-850 bg-gray-800">
      {/* Tab bar */}
      <div className="flex items-center border-b border-gray-700">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => { setActiveTab(t.id); if (!open) setOpen(true); }}
            className={`text-xs px-3 py-1.5 border-r border-gray-700 hover:bg-gray-700 ${
              activeTab === t.id && open ? "bg-gray-700 text-white border-t-2 border-t-blue-400" : "text-gray-400"
            }`}
          >
            {t.label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => setOpen(!open)}
          className="text-xs text-gray-500 hover:text-gray-300 px-3 py-1.5"
          title={open ? "閉じる" : "開く"}
        >
          {open ? "▲" : "▼"}
        </button>
      </div>

      {/* Button grid */}
      {open && (
        <div className="h-16 overflow-y-auto flex flex-wrap gap-1 p-2">
          {items.map((item, i) => (
            <button
              key={i}
              onClick={() => onInsert(item.snippet)}
              title={item.title ?? item.snippet}
              className="text-xs bg-gray-700 hover:bg-gray-600 border border-gray-600 px-1.5 py-0.5 rounded font-mono text-gray-200 cursor-pointer whitespace-nowrap"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
