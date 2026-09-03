import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "译林 2000 词闯关",
  description: "面向江苏初中生的音标朗读、单词拼写与错词复习互动学习系统。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
