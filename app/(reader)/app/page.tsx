import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import ReaderHost from "@/components/ReaderHost";

export const metadata: Metadata = { title: "Your library", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ReaderPage() {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  if (!data.user) redirect("/login?next=/app");
  return <ReaderHost userId={data.user.id} email={data.user.email || ""} />;
}
