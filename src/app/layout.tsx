import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { LangProvider } from "@/lib/i18n";
import { TradingModeProvider } from "@/lib/tradingMode";
import AccessibilityBar from "@/components/AccessibilityBar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VTVents",
  description: "A play-money prediction market for Virginia Tech. Live campus info, plus Yes/No markets in Trading mode.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <LangProvider>
          <TradingModeProvider>
            <AccessibilityBar />
            {children}
          </TradingModeProvider>
        </LangProvider>
      </body>
    </html>
  );
}
