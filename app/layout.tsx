import type { Metadata } from "next";
import { Header, Footer } from "@/components/shell";
import { siteUrl } from "@/lib/catalog";
import "./globals.css";
import { AccountProvider } from "@/components/account/provider";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "DubbingNow - AI Dubbing Online, Dub Videos in Any Language",
  description:
    "AI dubbing for clear, single-speaker videos and audio. Translate into 12 languages, choose a cloned or preset voice, and preview your dub online.",
  openGraph: { type: "website", siteName: "DubbingNow", locale: "en_US" },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <AccountProvider>
          <Header />
          <main id="main">{children}</main>
          <Footer />
        </AccountProvider>
      </body>
    </html>
  );
}
