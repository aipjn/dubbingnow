import type { Metadata } from "next";
import { Header, Footer } from "@/components/shell";
import { siteUrl } from "@/lib/catalog";
import "./globals.css";
import { AccountProvider } from "@/components/account/provider";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "DubbingNow - AI Dubbing Online, Dub Videos in Any Language",
  description:
    "Dub clear narration into another language with one upload, with audio and video preview on the same page.",
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
