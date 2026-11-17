import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Storyman — Your story studio",
  description:
    "From a meaningful idea to a story worth sharing. Your personal AI story and video production studio.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
