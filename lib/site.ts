export const SITE = {
  name: "Marginalia",
  url: (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, ""),
  tagline: "Read research papers and books with an AI tutor in the margin",
  description:
    "Marginalia is a free AI reading companion for research papers, textbooks and PDFs. Highlight any passage, ask Claude to explain it, and keep every answer as a note beside the text.",
};
