# TexMate — 日本語 LaTeX エディタ

ブラウザで動く日本語対応 LaTeX エディタです。プロジェクト管理・編集・PDF コンパイルをワンストップで行えます。

![TexMate Screenshot](docs/screenshot.png)

## 機能

- **プロジェクト管理** — 作成・一覧・削除
- **テンプレート** — 基本 / 論文 (ltjsarticle) / レポート (ltjsreport) / スライド (beamer)
- **Monaco Editor** — LaTeX 構文ハイライト・行番号
- **エンジン選択** — LuaLaTeX / upLaTeX / pLaTeX / XeLaTeX / pdfLaTeX
- **ワンクリックコンパイル** — `Ctrl+Enter` でPDF生成
- **PDF プレビュー** — Overleafスタイルの左右分割表示
- **行番号PDF** — `# 行番号` トグルでPDFに行番号を付与
- **画像アップロード** — PNG/JPG をアップロードして `\includegraphics` を自動挿入

## 必要環境

- **Node.js** 18 以上
- **LaTeX ディストリビューション**（いずれか）
  - Windows: [MiKTeX](https://miktex.org/)
  - Linux/macOS: [TeX Live](https://tug.org/texlive/)

## セットアップ

```bash
git clone https://github.com/YOUR_USERNAME/texmate.git
cd texmate
npm install
```

### Windows (MiKTeX)

`.env.local` を作成（MiKTeX のパスを環境に合わせて変更）:

```env
LATEX_BIN_DIR=C:\Users\YOUR_NAME\AppData\Local\Programs\MiKTeX\miktex\bin\x64
```

### Linux / macOS (TeX Live)

```bash
# Ubuntu/Debian
sudo apt install texlive-luatex texlive-lang-japanese texlive-fonts-recommended

# .env.local
echo "LATEX_BIN_DIR=/usr/bin" > .env.local
```

## 起動

```bash
# 開発
npm run dev

# 本番
npm run build
npm start
```

ブラウザで http://localhost:3000 を開く。

## Docker

```bash
docker build -t texmate .
docker run -d -p 3000:3000 -v texmate-projects:/app/projects texmate
```

## 技術スタック

- [Next.js 15](https://nextjs.org/) (App Router)
- [Monaco Editor](https://microsoft.github.io/monaco-editor/)
- [Tailwind CSS](https://tailwindcss.com/)
- LuaLaTeX + [LuaTeX-ja](https://github.com/texjporg/luatexja)

## ライセンス

MIT
