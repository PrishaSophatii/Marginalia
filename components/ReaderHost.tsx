"use client";
import { useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { docStore } from "@/lib/docstore";
import { sample } from "@/lib/sample";
import { getKey } from "@/lib/keys";
import { fillAd } from "@/lib/ads";
import fonts from "@/lib/fonts";

declare global {
  interface Window {
    claude?: { use: (name: string) => Promise<unknown> };
    marginaliaHost?: Record<string, unknown>;
  }
}

let started = false;

// Runs the reader (public/reader/reader.js, the same code as the Marginalia artifact) and gives
// it what the artifact runtime would: a document store, the signed-in user, file storage for
// original PDFs, and Claude through the reader's own API key.
export default function ReaderHost({ userId, email }: { userId: string; email: string }) {
  useEffect(() => {
    if (started) return;
    started = true;
    const sb = supabaseBrowser();
    const db = docStore(sb, userId);
    const bucket = () => sb.storage.from("pdfs");

    const assets = {
      async upload(file: Blob, opts: { type?: string } = {}) {
        const id = crypto.randomUUID().replace(/-/g, "");
        const path = `${userId}/${id}.pdf`;
        const r = await bucket().upload(path, file, { contentType: opts.type || "application/pdf", upsert: false });
        if (r.error) throw r.error;
        return { id, url: `/api/pdf/${path}` };
      },
      async delete(id: string) {
        await bucket().remove([`${userId}/${id}.pdf`]);
      },
    };

    const caps: Record<string, unknown> = {
      db,
      user: { id: async () => userId, email: async () => email },
      assets,
      sample,
    };
    window.claude = {
      use: async (name: string) => {
        if (!(name in caps)) throw { code: "not_declared" };
        return caps[name];
      },
    };
    window.marginaliaHost = {
      email,
      hasKey: () => !!getKey(),
      signOut: async () => {
        await sb.auth.signOut();
        window.location.href = "/";
      },
      mountAd: (el: HTMLElement, place: string) => fillAd(el, place),
    };

    const link = (href: string) => {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = href;
      document.head.appendChild(l);
    };
    link(fonts);
    link("/reader/reader.css");
    const s = document.createElement("script");
    s.src = "/reader/reader.js";
    document.body.appendChild(s);
  }, [userId, email]);

  return (
    <>
      <div id="app">
        <div className="loading">Opening your library…</div>
      </div>
      <input type="file" id="file-input" accept="application/pdf,.pdf" hidden />
    </>
  );
}
