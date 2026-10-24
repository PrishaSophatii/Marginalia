import Link from "next/link";

export const metadata = {
  title: "About",
  description: "Why Marginalia exists: a calmer way to read hard papers and books with an AI tutor that explains, and remembers, every passage you ask about.",
  alternates: { canonical: "/about" },
};

export default function About() {
  return (
    <section className="wrap narrow prose">
      <h1 style={{ marginTop: 48 }}>About Marginalia</h1>
      <p>
        Marginalia started as a personal tool for reading research papers. The hardest part of a paper is rarely the whole thing;
        it&apos;s one sentence, one equation or one figure that you can&apos;t get past. Searching for it breaks your focus, and the
        explanation you find is gone the next time you open the paper.
      </p>
      <p>
        So Marginalia keeps the explanation where the question was: in the margin. Highlight a passage, ask Claude about it, and the
        answer becomes part of your copy of the paper, along with your own highlights and notes.
      </p>
      <h2>How it&apos;s built</h2>
      <p>
        Your library is stored in your account so it follows you between devices. Questions are sent from your browser directly to
        Anthropic with your own API key, which keeps Marginalia free and means we never see your key or your conversations with Claude.
      </p>
      <p>Marginalia isn&apos;t affiliated with or endorsed by Anthropic. Claude is a product of Anthropic.</p>
      <p><Link href="/login?mode=signup" className="btn primary">Start reading free</Link></p>
    </section>
  );
}
