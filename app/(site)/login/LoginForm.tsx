"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function LoginForm() {
  const params = useSearchParams();
  const [mode, setMode] = useState<"login" | "signup" | "reset">(params.get("mode") === "signup" ? "signup" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(
    params.get("error") ? { ok: false, text: "That sign-in link didn't work or has expired. Try again." } : null,
  );
  const next = (() => {
    const n = params.get("next") || "/app";
    return n.startsWith("/") && !n.startsWith("//") ? n : "/app";
  })();
  const callback = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const sb = supabaseBrowser();
    try {
      if (mode === "signup") {
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: callback() } });
        if (error) throw error;
        if (data.session) window.location.href = next;
        else setMsg({ ok: true, text: `We sent a confirmation link to ${email}. Open it to finish signing up.` });
      } else if (mode === "login") {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.href = next;
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?next=/app/settings` });
        if (error) throw error;
        setMsg({ ok: true, text: `If ${email} has an account, a reset link is on its way.` });
      }
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Something went wrong. Try again." });
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    const { error } = await supabaseBrowser().auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback() } });
    if (error) {
      setMsg({ ok: false, text: error.message });
      setBusy(false);
    }
  }

  const title = mode === "signup" ? "Create your free account" : mode === "login" ? "Welcome back" : "Reset your password";
  return (
    <section className="wrap auth">
      <h1 style={{ fontSize: "2rem", marginTop: 0 }}>{title}</h1>
      <div className="card">
        {msg && <p className={`msg ${msg.ok ? "ok" : "bad"}`} role="status">{msg.text}</p>}
        {mode !== "reset" && (
          <>
            <button type="button" className="btn block" onClick={google} disabled={busy}>Continue with Google</button>
            <p className="or">or with email</p>
          </>
        )}
        <form onSubmit={submit}>
          <label className="field">
            <span>Email</span>
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {mode !== "reset" && (
            <label className="field">
              <span>Password{mode === "signup" ? " (at least 8 characters)" : ""}</span>
              <input type="password" required minLength={mode === "signup" ? 8 : undefined} autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
          )}
          <button className="btn primary block" disabled={busy}>
            {busy ? "One moment…" : mode === "signup" ? "Sign up" : mode === "login" ? "Log in" : "Send reset link"}
          </button>
        </form>
        <p className="switch">
          {mode === "login" && (<>New here? <button className="link-btn" onClick={() => setMode("signup")}>Create an account</button> · <button className="link-btn" onClick={() => setMode("reset")}>Forgot password?</button></>)}
          {mode === "signup" && (<>Already have an account? <button className="link-btn" onClick={() => setMode("login")}>Log in</button></>)}
          {mode === "reset" && (<button className="link-btn" onClick={() => setMode("login")}>Back to log in</button>)}
        </p>
      </div>
      <p className="switch" style={{ color: "var(--muted)" }}>By continuing you agree to the <a href="/terms">Terms</a> and <a href="/privacy">Privacy policy</a>.</p>
    </section>
  );
}
