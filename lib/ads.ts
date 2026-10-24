// Google AdSense. Nothing loads until NEXT_PUBLIC_ADSENSE_CLIENT is set.
export const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT || "";
export const AD_SLOTS: Record<string, string> = {
  landing: process.env.NEXT_PUBLIC_ADSENSE_SLOT_LANDING || "",
  guides: process.env.NEXT_PUBLIC_ADSENSE_SLOT_GUIDES || "",
  library: process.env.NEXT_PUBLIC_ADSENSE_SLOT_LIBRARY || "",
};
export const adsEnabled = (place: string) => !!(ADSENSE_CLIENT && AD_SLOTS[place]);

declare global {
  interface Window { adsbygoogle?: unknown[] }
}

export function loadAdsScript() {
  if (!ADSENSE_CLIENT || document.getElementById("adsbygoogle-js") || document.querySelector("script[src*=\"adsbygoogle.js\"]")) return;
  const s = document.createElement("script");
  s.id = "adsbygoogle-js";
  s.async = true;
  s.crossOrigin = "anonymous";
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
  document.head.appendChild(s);
}

// Fills `el` with one responsive ad unit for the given place.
export function fillAd(el: HTMLElement, place: string) {
  if (!adsEnabled(place) || el.dataset.filled) return;
  loadAdsScript();
  el.dataset.filled = "1";
  el.innerHTML = `<span class="ad-label">Advertisement</span><ins class="adsbygoogle" style="display:block" data-ad-client="${ADSENSE_CLIENT}" data-ad-slot="${AD_SLOTS[place]}" data-ad-format="auto" data-full-width-responsive="true"></ins>`;
  try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch {}
}
