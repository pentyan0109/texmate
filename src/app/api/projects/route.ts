import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const PROJECTS_DIR = path.join(process.cwd(), "projects");

function ensureProjectsDir() {
  if (!fs.existsSync(PROJECTS_DIR)) {
    fs.mkdirSync(PROJECTS_DIR, { recursive: true });
  }
}

export async function GET() {
  ensureProjectsDir();
  const entries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
  const projects = entries
    .filter((e) => e.isDirectory())
    .map((e) => {
      const stat = fs.statSync(path.join(PROJECTS_DIR, e.name));
      return { name: e.name, updatedAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  ensureProjectsDir();
  const { name, template } = await req.json();
  // Block only characters dangerous for file paths
  if (!name || name.trim() === "" || /[/\\:*?"<>|]|^\.|\.\./.test(name)) {
    return NextResponse.json({ error: "無効なプロジェクト名（/ \\ : * ? \" < > | は使用不可）" }, { status: 400 });
  }
  const projectDir = path.join(PROJECTS_DIR, name);
  if (fs.existsSync(projectDir)) {
    return NextResponse.json({ error: "同名のプロジェクトが存在します" }, { status: 409 });
  }
  fs.mkdirSync(projectDir, { recursive: true });

  const content = getTemplate(template || "basic", name);
  fs.writeFileSync(path.join(projectDir, "main.tex"), content, "utf-8");

  return NextResponse.json({ name, mainFile: "main.tex" });
}

export async function DELETE(req: NextRequest) {
  const { name } = await req.json();
  const projectDir = path.join(PROJECTS_DIR, name);
  if (!fs.existsSync(projectDir)) {
    return NextResponse.json({ error: "プロジェクトが見つかりません" }, { status: 404 });
  }
  fs.rmSync(projectDir, { recursive: true, force: true });
  return NextResponse.json({ ok: true });
}

function getTemplate(template: string, title: string): string {
  if (template === "article") {
    return `\\documentclass[a4paper,12pt]{ltjsarticle}
\\usepackage{luatexja}
\\usepackage{luatexja-fontspec}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage{hyperref}

\\title{${title}}
\\author{著者名}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{はじめに}
ここに本文を書きます。日本語が使えます。

\\section{数式の例}
インライン数式: $E = mc^2$

ディスプレイ数式:
\\begin{equation}
  \\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}
\\end{equation}

\\section{まとめ}
まとめを書きます。

\\end{document}
`;
  }
  if (template === "report") {
    return `\\documentclass[a4paper,12pt]{ltjsreport}
\\usepackage{luatexja}
\\usepackage{luatexja-fontspec}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage{hyperref}

\\title{${title}}
\\author{著者名}
\\date{\\today}

\\begin{document}
\\maketitle
\\tableofcontents

\\chapter{序論}
ここにレポートの序論を書きます。

\\chapter{本論}
\\section{第一節}
本論の内容を書きます。

\\chapter{結論}
結論を書きます。

\\end{document}
`;
  }
  if (template === "beamer") {
    return `\\documentclass{beamer}
\\usepackage{luatexja}
\\usepackage{luatexja-fontspec}
\\usetheme{Madrid}

\\title{${title}}
\\author{発表者名}
\\date{\\today}

\\begin{document}

\\begin{frame}
\\titlepage
\\end{frame}

\\begin{frame}{目次}
\\tableofcontents
\\end{frame}

\\section{はじめに}
\\begin{frame}{はじめに}
  \\begin{itemize}
    \\item 研究背景
    \\item 研究目的
    \\item 本発表の構成
  \\end{itemize}
\\end{frame}

\\section{手法}
\\begin{frame}{提案手法}
  提案手法の説明をここに書きます。
\\end{frame}

\\section{まとめ}
\\begin{frame}{まとめ}
  \\begin{block}{結論}
    研究のまとめを書きます。
  \\end{block}
\\end{frame}

\\end{document}
`;
  }
  if (template === "article-de") {
    return `\\documentclass[a4paper,12pt]{article}
\\usepackage[T1]{fontenc}
\\usepackage{lmodern}
\\usepackage[ngerman]{babel}
\\usepackage{microtype}
\\usepackage{amsmath,amssymb,amsthm}
\\usepackage{graphicx}
\\usepackage{booktabs}
\\usepackage[hidelinks]{hyperref}

\\title{${title}}
\\author{Autor}
\\date{\\today}

\\begin{document}
\\maketitle
\\begin{abstract}
  Hier steht die Zusammenfassung.
\\end{abstract}

\\section{Einleitung}
Hier beginnt die Einleitung.

\\section{Methoden}
Beschreibung der Methoden.

\\section{Ergebnisse}
\\begin{equation}
  \\int_{-\\infty}^{\\infty} e^{-x^2}\\, dx = \\sqrt{\\pi}
\\end{equation}

\\section{Fazit}
Zusammenfassung der Ergebnisse.

\\end{document}
`;
  }
  if (template === "article-fr") {
    return `\\documentclass[a4paper,12pt]{article}
\\usepackage[T1]{fontenc}
\\usepackage{lmodern}
\\usepackage[french]{babel}
\\usepackage{microtype}
\\usepackage{amsmath,amssymb,amsthm}
\\usepackage{graphicx}
\\usepackage{booktabs}
\\usepackage[hidelinks]{hyperref}

\\title{${title}}
\\author{Auteur}
\\date{\\today}

\\begin{document}
\\maketitle
\\begin{abstract}
  Résumé de l'article.
\\end{abstract}

\\section{Introduction}
Introduction ici.

\\section{Méthodes}
Description des méthodes.

\\section{Résultats}
\\begin{equation}
  \\int_{-\\infty}^{\\infty} e^{-x^2}\\, dx = \\sqrt{\\pi}
\\end{equation}

\\section{Conclusion}
Résumé des résultats.

\\end{document}
`;
  }
  if (template === "article-zh") {
    return `\\documentclass[a4paper,12pt]{ctexart}
\\usepackage{amsmath,amssymb,amsthm}
\\usepackage{graphicx}
\\usepackage{booktabs}
\\usepackage[hidelinks]{hyperref}

\\title{${title}}
\\author{作者}
\\date{\\today}

\\begin{document}
\\maketitle

\\begin{abstract}
在此处写摘要。
\\end{abstract}

\\section{引言}
在此处写引言。

\\section{方法}
描述研究方法。

\\section{结果}
\\begin{equation}
  \\int_{-\\infty}^{\\infty} e^{-x^2}\\, dx = \\sqrt{\\pi}
\\end{equation}

\\section{结论}
总结研究结论。

\\end{document}
`;
  }
  if (template === "article-en-gb") {
    return `\\documentclass[a4paper,12pt]{article}
\\usepackage[T1]{fontenc}
\\usepackage{lmodern}
\\usepackage[british]{babel}
\\usepackage{microtype}
\\usepackage{amsmath,amssymb,amsthm}
\\usepackage{graphicx}
\\usepackage{booktabs}
\\usepackage[hidelinks]{hyperref}

\\title{${title}}
\\author{Author Name}
\\date{\\today}

\\begin{document}
\\maketitle
\\begin{abstract}
  Write your abstract here.
\\end{abstract}

\\section{Introduction}
Write the introduction here.

\\section{Methodology}
Describe your methodology.

\\section{Results}
\\begin{equation}
  \\int_{-\\infty}^{\\infty} e^{-x^2}\\, dx = \\sqrt{\\pi}
\\end{equation}

\\section{Conclusion}
Summarise your findings.

\\end{document}
`;
  }
  if (template === "article-en") {
    return `\\documentclass[letterpaper,12pt]{article}
\\usepackage[T1]{fontenc}
\\usepackage{lmodern}
\\usepackage[american]{babel}
\\usepackage{microtype}
\\usepackage{amsmath,amssymb,amsthm}
\\usepackage{graphicx}
\\usepackage{booktabs}
\\usepackage[hidelinks]{hyperref}

\\title{${title}}
\\author{Author Name}
\\date{\\today}

\\begin{document}
\\maketitle
\\begin{abstract}
  Write your abstract here.
\\end{abstract}

\\section{Introduction}
Write the introduction here.

\\section{Methods}
Describe your methods.

\\section{Results}
Present your results.

\\begin{equation}
  \\int_{-\\infty}^{\\infty} e^{-x^2}\\, dx = \\sqrt{\\pi}
\\end{equation}

\\section{Conclusion}
Summarize your findings.

\\end{document}
`;
  }
  if (template === "report-en") {
    return `\\documentclass[letterpaper,12pt]{report}
\\usepackage[T1]{fontenc}
\\usepackage{lmodern}
\\usepackage[american]{babel}
\\usepackage{microtype}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage{booktabs}
\\usepackage[hidelinks]{hyperref}

\\title{${title}}
\\author{Author Name}
\\date{\\today}

\\begin{document}
\\maketitle
\\tableofcontents

\\chapter{Introduction}
Write the introduction here.

\\chapter{Background}
\\section{Related Work}
Describe related work.

\\chapter{Conclusion}
Summarize your findings.

\\end{document}
`;
  }
  if (template === "beamer-en") {
    return `\\documentclass{beamer}
\\usepackage[T1]{fontenc}
\\usepackage{lmodern}
\\usepackage[american]{babel}
\\usepackage{microtype}
\\usepackage{amsmath,amssymb}
\\usetheme{Madrid}
\\usecolortheme{default}

\\title{${title}}
\\author{Presenter Name}
\\institute{Institution}
\\date{\\today}

\\begin{document}

\\begin{frame}
  \\titlepage
\\end{frame}

\\begin{frame}{Outline}
  \\tableofcontents
\\end{frame}

\\section{Introduction}
\\begin{frame}{Introduction}
  \\begin{itemize}
    \\item Research background
    \\item Motivation
    \\item Contributions
  \\end{itemize}
\\end{frame}

\\section{Methods}
\\begin{frame}{Proposed Method}
  Describe your method here.
\\end{frame}

\\section{Conclusion}
\\begin{frame}{Conclusion}
  \\begin{block}{Summary}
    Write conclusions here.
  \\end{block}
\\end{frame}

\\end{document}
`;
  }

  // basic / default
  return `\\documentclass[a4paper,12pt]{ltjsarticle}
\\usepackage{luatexja}
\\usepackage{luatexja-fontspec}

\\title{${title}}
\\author{著者名}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{はじめに}
日本語のLaTeX文書です。

\\end{document}
`;
}
