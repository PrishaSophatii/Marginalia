import { ImageResponse } from "next/og";
import { SITE } from "@/lib/site";

export const alt = `${SITE.name}: ${SITE.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OG() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 90, background: "#f6efe6", color: "#2a211c" }}>
        <div style={{ fontSize: 44, color: "#b5532f", fontWeight: 700 }}>Marginalia</div>
        <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.1, marginTop: 24, maxWidth: 980 }}>Read research papers with a tutor in the margin.</div>
        <div style={{ fontSize: 32, marginTop: 30, color: "#6e5f55" }}>Highlight any passage. Ask Claude. Keep the answer.</div>
      </div>
    ),
    size,
  );
}
