import Link from "next/link";
import { ArrowUpRight, AudioLines, Globe2, Menu } from "lucide-react";
import { AccountNavigation } from "./account/navigation";
import { tools } from "@/lib/catalog";

export function Logo() {
  return (
    <Link className="logo" href="/" aria-label="DubbingNow home">
      <span className="logo-mark">
        <AudioLines size={23} strokeWidth={2.3} />
      </span>
      <span>
        dubbing<span className="logo-now">now</span>
        <span className="logo-dot">.</span>
      </span>
    </Link>
  );
}
export function Header() {
  return (
    <header className="header">
      <div className="container header-inner">
        <Logo />
        <nav className="desktop-nav" aria-label="Main navigation">
          <details className="nav-dropdown">
            <summary>
              Tools <span>⌄</span>
            </summary>
            <div className="nav-menu">
              {tools.map((tool) => (
                <Link key={tool.slug} href={`/${tool.slug}`}>
                  {tool.name}
                  <ArrowUpRight size={15} />
                </Link>
              ))}
            </div>
          </details>
          <Link href="/languages">Languages</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/how-to-dub-a-video">How it works</Link>
          <Link href="/blog">Blog</Link>
        </nav>
        <AccountNavigation />
        <Link className="nav-cta" href="/#dubbing-tool">
          Start dubbing <ArrowUpRight size={15} />
        </Link>
        <details className="mobile-nav">
          <summary aria-label="Open navigation">
            <Menu size={23} />
          </summary>
          <nav aria-label="Mobile navigation">
            {tools.map((tool) => (
              <Link key={tool.slug} href={`/${tool.slug}`}>
                {tool.name}
              </Link>
            ))}
            <Link href="/languages">Languages</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/how-to-dub-a-video">How it works</Link>
            <Link href="/blog">Blog</Link>
            <Link href="/account">My account</Link>
            <Link href="/login">Sign in</Link>
          </nav>
        </details>
      </div>
    </header>
  );
}
export function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-top">
        <div>
          <Logo />
          <p>
            Good stories deserve to be heard.
            <br />
            In every language.
          </p>
          <span className="footer-note">
            <Globe2 size={14} /> Made for a world of voices
          </span>
        </div>
        <div>
          <h3>Tools</h3>
          {tools.map((tool) => (
            <Link key={tool.slug} href={`/${tool.slug}`}>
              {tool.name}
            </Link>
          ))}
        </div>
        <div>
          <h3>Explore</h3>
          <Link href="/languages">Supported languages</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/how-to-dub-a-video">How to dub a video</Link>
          <Link href="/blog">Blog</Link>
        </div>
        <div>
          <h3>DubbingNow</h3>
          <Link href="/about">About us</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} DubbingNow</span>
        <span>One upload. A whole new audience.</span>
      </div>
    </footer>
  );
}
export function Breadcrumbs({
  items,
}: {
  items: { name: string; href?: string }[];
}) {
  return (
    <nav className="breadcrumbs container" aria-label="Breadcrumb">
      <Link href="/">DubbingNow</Link>
      {items.map((item, index) => (
        <span key={index}>
          <span className="breadcrumb-slash">/</span>
          {item.href ? (
            <Link href={item.href}>{item.name}</Link>
          ) : (
            <span aria-current="page">{item.name}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
