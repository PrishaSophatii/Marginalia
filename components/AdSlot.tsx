"use client";
import { useEffect, useRef } from "react";
import { adsEnabled, fillAd } from "@/lib/ads";

export default function AdSlot({ place }: { place: "landing" | "guides" | "library" }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) fillAd(ref.current, place);
  }, [place]);
  if (!adsEnabled(place)) return null;
  return <div ref={ref} className="ad-slot" />;
}
