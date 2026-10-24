// The reader's own Anthropic API key and model choice. They stay in this browser and are
// sent only to api.anthropic.com, never to this site's servers.
export const KEY_STORE = "marginalia.apiKey";
export const MODEL_STORE = "marginalia.model";

export const MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5", note: "Best explanations. Costs the most per question." },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", note: "Nearly as good, and cheaper." },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", note: "Fastest and cheapest, for quick definitions." },
] as const;
export const DEFAULT_MODEL = MODELS[0].id;

const read = (k: string) => {
  try { return localStorage.getItem(k) || ""; } catch { return ""; }
};
const write = (k: string, v: string) => {
  try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {}
};

export const getKey = () => read(KEY_STORE).trim();
export const setKey = (v: string) => write(KEY_STORE, v.trim());
export const getModel = () => {
  const m = read(MODEL_STORE);
  return MODELS.some((x) => x.id === m) ? m : DEFAULT_MODEL;
};
export const setModel = (v: string) => write(MODEL_STORE, v);
