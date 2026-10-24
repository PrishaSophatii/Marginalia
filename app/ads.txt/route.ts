import { ADSENSE_CLIENT } from "@/lib/ads";

// ads.txt tells ad buyers which AdSense account may sell ads on this site.
export function GET() {
  const pub = ADSENSE_CLIENT.replace(/^ca-/, "");
  const body = pub ? `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n` : "";
  return new Response(body, { headers: { "Content-Type": "text/plain" } });
}
