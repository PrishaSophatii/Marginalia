import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import AdSlot from "@/components/AdSlot";
import { GUIDES, guideBySlug } from "@/lib/guides";
import { SITE } from "@/lib/site";

type Props = { params: Promise<{ slug: string }> };

export const generateStaticParams = () => GUIDES.map((g) => ({ slug: g.slug }));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const g = guideBySlug((await params).slug);
  if (!g) return {};
  return {
    title: g.title,
    description: g.description,
    alternates: { canonical: `/guides/${g.slug}` },
    openGraph: { type: "article", title: g.title, description: g.description, publishedTime: g.date },
  };
}

export default async function GuidePage({ params }: Props) {
  const g = guideBySlug((await params).slug);
  if (!g) notFound();
  const ld = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: g.title,
    description: g.description,
    datePublished: g.date,
    author: { "@type": "Organization", name: SITE.name },
    publisher: { "@type": "Organization", name: SITE.name },
    mainEntityOfPage: `${SITE.url}/guides/${g.slug}`,
  };
  const mid = Math.ceil(g.body.length / 2);
  return (
    <article className="wrap narrow prose">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <p className="meta" style={{ marginTop: 40 }}><Link href="/guides">Guides</Link> · {new Date(g.date).toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric" })}</p>
      <h1>{g.title}</h1>
      {g.body.map((s, i) => (
        <section key={i}>
          {i === mid && <AdSlot place="guides" />}
          {s.h && <h2>{s.h}</h2>}
          {s.p?.map((t, j) => <p key={j}>{t}</p>)}
          {s.list && <ul>{s.list.map((t, j) => <li key={j}>{t}</li>)}</ul>}
        </section>
      ))}
      <div className="card" style={{ marginTop: 40 }}>
        <h3>Try it on your own reading</h3>
        <p>Upload a paper or textbook, highlight what you don&apos;t follow, and ask Claude to explain it. Free to use with your own API key.</p>
        <p style={{ marginTop: 14 }}><Link href="/login?mode=signup" className="btn primary">Start reading free</Link></p>
      </div>
    </article>
  );
}
