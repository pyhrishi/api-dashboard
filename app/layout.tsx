import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ToastProvider } from "@/components/Toast";
import { SignalsWidget } from "@/components/SignalsWidget";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "zinbit by Zintlr",
  description: "The world's most advanced B2B data enrichment API platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans bg-neutral-100 text-neutral-900 min-h-screen flex flex-col`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <ToastProvider>
            <main className="flex-grow">
              {children}
            </main>
            <SignalsWidget />
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
