import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// Sends the signed-in reader to a short-lived link for one of their own original PDFs.
// Storage policies only allow a user to sign files in their own folder.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return new NextResponse("Sign in to open this file.", { status: 401 });
  const key = path.map(decodeURIComponent).join("/");
  if (key.split("/")[0] !== auth.user.id || key.includes("..")) return new NextResponse("Not found", { status: 404 });
  const { data, error } = await sb.storage.from("pdfs").createSignedUrl(key, 60 * 60);
  if (error || !data) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "private, no-store" } });
}
