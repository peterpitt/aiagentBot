import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "一人公司頂級智囊團",
  description: "12 位 AI 顧問組成的智囊團，把你的點子跑成含程式碼與自動化交付的一人公司落地藍圖。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-Hant">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&family=Noto+Serif+TC:wght@600;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
