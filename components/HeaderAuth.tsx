"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

// Checked in the browser so the public pages can stay static (fast, and cached for search engines).
export default function HeaderAuth() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    supabaseBrowser().auth.getSession().then(({ data }) => setSignedIn(!!data.session)).catch(() => {});
  }, []);
  if (signedIn) return <a href="/app" className="btn primary">Open library</a>;
  return (
    <>
      <Link href="/login">Log in</Link>
      <Link href="/login?mode=signup" className="btn primary">Sign up free</Link>
    </>
  );
}
