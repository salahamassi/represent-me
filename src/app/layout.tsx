import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter, JetBrains_Mono, Reem_Kufi, Amiri } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";

// Existing UI fonts — used by the rest of the app via shadcn tokens.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// War Room v2 typography stack. Bound to CSS variables that the
// `--font-wr-*` tokens in globals.css read from. Loading them at the
// layout root means every War Room surface (and any other surface that
// opts in via `font-wr-ui` / `font-ar-display` / etc.) gets the right
// glyphs without per-component imports.
//
// `display: 'swap'` keeps the first paint readable while the webfont
// loads — important for the Arabic display headlines which are the
// War Room's identity but also the heaviest typefaces.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});
const reemKufi = Reem_Kufi({
  variable: "--font-reem-kufi",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});
const amiri = Amiri({
  variable: "--font-amiri",
  subsets: ["arabic", "latin"],
  weight: ["400", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Represent Me — Agent Dashboard",
  description: "AI agents working to improve your online technical presence",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${jetbrainsMono.variable} ${reemKufi.variable} ${amiri.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <Sidebar />
        <main className="ml-[260px] min-h-screen p-8">{children}</main>
      </body>
    </html>
  );
}
