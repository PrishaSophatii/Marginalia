import Link from "next/link";
import AdSlot from "@/components/AdSlot";
import { SITE } from "@/lib/site";
import { FAQ } from "@/lib/faq";
import { GUIDES } from "@/lib/guides";

export const metadata = { alternates: { canonical: "/" } };

const FEATURES = [
  { t: "Ask about any passage", d: "Select a sentence, an equation or a whole paragraph and ask what it means. Claude answers with a worked example first, then the general idea." },
  { t: "Answers stay in the margin", d: "Every explanation is saved beside the text it explains, so the next time you open the paper your understanding is still there." },
  { t: "Highlight and write notes", d: "Mark passages in four colours and add your own written notes. Undo or erase any highlight in one click." },
  { t: "A real book view", d: "Read long PDFs as two-page spreads with an animated page turn, or switch to the original layout at any time." },
  { t: "Folders and progress", d: "Organise papers into folders, pick up where you left off, and see how much you've read each day." },
  { t: "Your key, your costs", d: "Bring your own Anthropic API key. There's no subscription, and the key never leaves your browser." },
];

export default function Home() {
  const ld = [
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: SITE.name,
      url: SITE.url,
      description: SITE.description,
      applicationCategory: "EducationalApplication",
      operatingSystem: "Any (web browser)",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
  ];
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <section className="wrap hero">
        <div>
          <h1>Read research papers with a tutor in the margin.</h1>
          <p className="lead">
            Marginalia is a free AI PDF reader for papers, textbooks and books. Highlight anything you don&apos;t follow,
            ask Claude to explain it, and keep every answer as a note right next to the text.
          </p>
          <div className="cta">
            <Link href="/login?mode=signup" className="btn primary">Start reading free</Link>
            <Link href="/guides/how-to-read-a-research-paper" className="btn">How to read a paper</Link>
          </div>
          <small>No subscription. Answers use your own Anthropic API key.</small>
        </div>
        <div className="mock" aria-hidden="true">
          <p>
            We find that <mark>the sensitivity of the classifier drops sharply when the two frequency bands overlap</mark>,
            which suggests the features are not independent.
          </p>
          <div className="note">
            <b>Why would overlap lower sensitivity?</b>
            Picture two radio stations on nearly the same frequency. When they overlap, you can&apos;t tell which song
            you&apos;re hearing, so you miss more of each. The classifier has the same problem: overlapping bands make two
            signals look alike, so it misses true cases more often.
          </div>
        </div>
      </section>

      <section className="wrap">
        <h2>Everything you need to understand what you read</h2>
        <div className="grid3">
          {FEATURES.map((f) => (
            <div className="card" key={f.t}>
              <h3>{f.t}</h3>
              <p>{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      <AdSlot place="landing" />

      <section className="wrap narrow">
        <h2>How it works</h2>
        <ol className="steps">
          <li><b>Create a free account</b> so your library follows you between devices.</li>
          <li><b>Add your Anthropic API key</b> in Settings. You can create one at console.anthropic.com in a couple of minutes.</li>
          <li><b>Upload a PDF.</b> Marginalia turns it into clean, readable text and keeps the original for side-by-side viewing.</li>
          <li><b>Select any passage and ask.</b> The answer streams in beside the text and is saved with your highlight.</li>
        </ol>

        <h2>Guides</h2>
        <ul className="guide-list">
          {GUIDES.slice(0, 3).map((g) => (
            <li key={g.slug} className="card">
              <Link href={`/guides/${g.slug}`}><h3>{g.title}</h3><p>{g.description}</p></Link>
            </li>
          ))}
        </ul>

        <h2>Questions</h2>
        {FAQ.map((f) => (
          <details key={f.q}>
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
        <p style={{ marginTop: 32 }}>
          <Link href="/login?mode=signup" className="btn primary">Start reading free</Link>
        </p>
      </section>
    </>
  );
}
