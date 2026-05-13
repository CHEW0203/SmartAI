import type { Metadata } from "next";
import { GlobalStudyCapture } from "@/components/study-capture/GlobalStudyCapture";
import "./globals.css";

export const metadata: Metadata = {
  title: "SmartAI",
  description: "Self-learning assistant",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <GlobalStudyCapture />
      </body>
    </html>
  );
}
