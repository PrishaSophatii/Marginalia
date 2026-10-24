import Link from "next/link";

export default function NotFound() {
  return (
    <section className="wrap narrow prose" style={{ padding: "60px 20px" }}>
      <h1>Page not found</h1>
      <p>That page doesn&apos;t exist. <Link href="/">Go to the home page</Link> or <Link href="/guides">read a guide</Link>.</p>
    </section>
  );
}
