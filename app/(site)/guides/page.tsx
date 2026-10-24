import Link from "next/link";
import AdSlot from "@/components/AdSlot";
import { GUIDES } from "@/lib/guides";

export const metadata = {
  title: "Guides to reading papers and textbooks",
  description: "Practical guides to reading research papers, understanding equations, studying textbooks with AI and annotating PDFs.",
  alternates: { canonical: "/guides" },
};

export default function Guides() {
  return (
    <section className="wrap narrow prose">
      <h1 style={{ marginTop: 48 }}>Guides</h1>
      <p className="meta">How to read, understand and remember what you study.</p>
      <ul className="guide-list">
        {GUIDES.map((g) => (
          <li key={g.slug} className="card">
            <Link href={`/guides/${g.slug}`}><h3>{g.title}</h3><p>{g.description}</p></Link>
          </li>
        ))}
      </ul>
      <AdSlot place="guides" />
    </section>
  );
}
