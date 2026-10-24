"use client";
import { useEffect, useState } from "react";
import Anthropic from "@anthropic-ai/sdk";
import { MODELS, getKey, getModel, setKey, setModel } from "@/lib/keys";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function SettingsForm({ email }: { email: string }) {
  const [key, setKeyText] = useState("");
  const [saved, setSaved] = useState(false);
  const [model, setModelState] = useState<string>(MODELS[0].id);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState("");

  useEffect(() => {
    const k = getKey();
    setKeyText(k);
    setSaved(!!k);
    setModelState(getModel());
  }, []);

  function save(e: React.FormEvent) {
    e.preventDefault();
    const k = key.trim();
    if (k && !k.startsWith("sk-ant-")) {
      setMsg({ ok: false, text: "Anthropic keys start with sk-ant-. Check you copied the whole key." });
      return;
    }
    setKey(k);
    setSaved(!!k);
    setMsg({ ok: true, text: k ? "Saved in this browser." : "Key removed from this browser." });
  }

  async function test() {
    const k = key.trim();
    if (!k) return;
    setBusy(true);
    setMsg(null);
    try {
      const client = new Anthropic({ apiKey: k, dangerouslyAllowBrowser: true, maxRetries: 0 });
      await client.models.list({ limit: 1 });
      setMsg({ ok: true, text: "Your key works." });
    } catch (e) {
      const status = e instanceof Anthropic.APIError ? e.status : undefined;
      setMsg({ ok: false, text: status === 401 ? "Anthropic didn't accept this key." : "Couldn't check the key right now. Try again in a moment." });
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabaseBrowser().auth.updateUser({ password: pw });
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: "Password updated." });
    if (!error) setPw("");
  }

  return (
    <section className="wrap auth" style={{ maxWidth: 560 }}>
      <p><a href="/app">← Back to your library</a></p>
      <h1 style={{ fontSize: "2rem", marginTop: 0 }}>Settings</h1>
      {msg && <p className={`msg ${msg.ok ? "ok" : "bad"}`} role="status">{msg.text}</p>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Your Anthropic API key</h3>
        <p style={{ color: "var(--muted)", fontSize: ".93rem" }}>
          Questions go from this browser straight to Anthropic, billed to your key. The key is stored only in this browser and never sent to our servers.
          Get one at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com</a>.
        </p>
        <form onSubmit={save}>
          <label className="field">
            <span>API key {saved && "· saved"}</span>
            <input type="password" autoComplete="off" spellCheck={false} placeholder="sk-ant-…" value={key} onChange={(e) => setKeyText(e.target.value)} />
          </label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn primary">Save</button>
            <button type="button" className="btn" onClick={test} disabled={busy || !key.trim()}>{busy ? "Checking…" : "Test key"}</button>
            {saved && <button type="button" className="btn" onClick={() => { setKeyText(""); setKey(""); setSaved(false); setMsg({ ok: true, text: "Key removed from this browser." }); }}>Remove</button>}
          </div>
        </form>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h3 style={{ marginTop: 0 }}>Model</h3>
        <div className="models">
          {MODELS.map((m) => (
            <label key={m.id}>
              <input type="radio" name="model" checked={model === m.id} onChange={() => { setModel(m.id); setModelState(m.id); }} />
              <span><b>{m.label}</b><small>{m.note}</small></span>
            </label>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h3 style={{ marginTop: 0 }}>Account</h3>
        <p style={{ color: "var(--muted)", fontSize: ".93rem" }}>Signed in as {email}.</p>
        <form onSubmit={changePassword}>
          <label className="field">
            <span>New password</span>
            <input type="password" minLength={8} required autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </label>
          <button className="btn">Change password</button>
        </form>
      </div>
    </section>
  );
}
