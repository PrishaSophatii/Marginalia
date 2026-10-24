import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";
import { GUIDES } from "@/lib/guides";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE.url}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE.url}/guides`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    ...GUIDES.map((g) => ({ url: `${SITE.url}/guides/${g.slug}`, lastModified: new Date(g.date), changeFrequency: "monthly" as const, priority: 0.7 })),
    { url: `${SITE.url}/about`, lastModified: now, changeFrequency: "yearly", priority: 0.4 },
    { url: `${SITE.url}/login`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE.url}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE.url}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];
}
