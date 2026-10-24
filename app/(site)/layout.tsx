import Link from "next/link";
import "./site.css";
import HeaderAuth from "@/components/HeaderAuth";
import { SITE } from "@/lib/site";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="site">
      <header className="top">
        <div className="wrap">
          <Link href="/" className="logo">Margin<span>alia</span></Link>
          <nav>
            <Link href="/guides" className="hide-sm">Guides</Link>
            <Link href="/about" className="hide-sm">About</Link>
            <HeaderAuth />
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <footer className="foot">
        <div className="wrap">
          <span>© {new Date().getFullYear()} {SITE.name}</span>
          <nav>
            <Link href="/guides">Guides</Link>
            <Link href="/about">About</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
