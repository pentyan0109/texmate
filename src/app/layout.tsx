import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TexMate - 日本語LaTeXエディタ",
  description: "日本語LaTeX PDF生成システム",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="bg-gray-900 text-gray-100 h-screen overflow-hidden">
        {children}
      </body>
    </html>
  );
}
