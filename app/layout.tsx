import type { Metadata, Viewport } from "next";
import { SITE } from "@/lib/site";
import { ADSENSE_CLIENT } from "@/lib/ads";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name}: ${SITE.tagline}`, template: `%s · ${SITE.name}` },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: [
    "AI PDF reader", "read research papers with AI", "explain research paper", "AI study tool",
    "textbook reader", "highlight and annotate PDF", "Claude PDF", "paper summarizer",
  ],
  openGraph: { type: "website", siteName: SITE.name, url: SITE.url, title: SITE.name, description: SITE.description },
  twitter: { card: "summary_large_image", title: SITE.name, description: SITE.description },
  alternates: { canonical: "/" },
  verification: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION } : undefined,
  // Lets AdSense confirm the site belongs to your account during review.
  other: process.env.NEXT_PUBLIC_ADSENSE_CLIENT ? { "google-adsense-account": process.env.NEXT_PUBLIC_ADSENSE_CLIENT } : undefined,
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6efe6" },
    { media: "(prefers-color-scheme: dark)", color: "#1d1714" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {ADSENSE_CLIENT && (
          <script async crossOrigin="anonymous" src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`} />
        )}
      </head>
      <body>{children}</body>
    </html>
  );
}
