import { SITE } from "@/lib/site";

export const metadata = { title: "Privacy policy", description: `How ${SITE.name} handles your account, library and API key.`, alternates: { canonical: "/privacy" } };

export default function Privacy() {
  return (
    <section className="wrap narrow prose">
      <h1 style={{ marginTop: 48 }}>Privacy policy</h1>
      <p className="meta">Last updated October 24, 2026</p>
      <h2>What we store</h2>
      <ul>
        <li><b>Account:</b> your email address and a hashed password, or your Google account identity if you sign in with Google.</li>
        <li><b>Library:</b> the text extracted from PDFs you upload, the original PDF files, your folders, highlights, notes, saved answers and reading activity. These are visible only to your account.</li>
      </ul>
      <h2>Your Anthropic API key</h2>
      <p>
        Your API key is stored only in your browser&apos;s local storage. When you ask a question, your browser sends the question,
        the highlighted passage and nearby text directly to Anthropic&apos;s API. These requests do not pass through our servers,
        and Anthropic&apos;s own privacy policy applies to them.
      </p>
      <h2>Advertising and cookies</h2>
      <p>
        We use Google AdSense to show ads on public pages and in the library. Google and its partners use cookies to serve ads based on
        your visits to this and other websites. You can opt out of personalised advertising at{" "}
        <a href="https://adssettings.google.com" target="_blank" rel="noreferrer">adssettings.google.com</a>. We also use essential
        cookies to keep you signed in.
      </p>
      <h2>Deleting your data</h2>
      <p>
        Deleting a paper in your library removes its text, highlights and original file. To delete your whole account, email us from the
        address you signed up with and we&apos;ll remove the account and everything in it.
      </p>
      <h2>Contact</h2>
      <p>Questions about privacy can be sent to the contact address listed on this site.</p>
    </section>
  );
}
