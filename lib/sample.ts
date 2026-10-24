import Anthropic from "@anthropic-ai/sdk";
import { getKey, getModel } from "./keys";

type Turn = { role: "user" | "assistant"; content: string };
type Opts = { onText?: (p: { text: string }) => void; signal?: AbortSignal };
type Fail = { code: string; message?: string; text?: string };

const fail = (code: string, message?: string, text?: string): Fail => ({ code, message, text });

function toCode(e: unknown, signal?: AbortSignal): Fail {
  if (signal?.aborted || e instanceof Anthropic.APIUserAbortError) return fail("cancelled");
  if (e instanceof Anthropic.AuthenticationError) return fail("invalid_api_key");
  if (e instanceof Anthropic.PermissionDeniedError) return fail("not_granted", e.message);
  if (e instanceof Anthropic.RateLimitError) return fail("rate_limited");
  if (e instanceof Anthropic.APIConnectionError) return fail("network_error");
  if (e instanceof Anthropic.APIError) {
    const msg = String(e.message || "");
    if (/credit balance/i.test(msg)) return fail("insufficient_credit");
    if (/prompt is too long|too many tokens/i.test(msg)) return fail("prompt_too_large");
    if (e.status === 529 || /overloaded/i.test(msg)) return fail("overloaded");
    return fail(e.status === 400 ? "invalid_request" : "upstream_error", msg);
  }
  return fail("upstream_error", e instanceof Error ? e.message : String(e));
}

// Same contract as the artifact runtime's sample(): stream text through onText and
// resolve with { text, truncated }, or reject with { code, message }.
export async function sample(input: string | Turn[], opts: Opts = {}) {
  const apiKey = getKey();
  if (!apiKey) throw fail("no_api_key");
  const model = getModel();
  const messages: Turn[] = typeof input === "string" ? [{ role: "user", content: input }] : input;
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
  let text = "";
  try {
    const stream = client.messages.stream(
      {
        model,
        max_tokens: 16000,
        messages,
        ...(model.includes("haiku") ? {} : { thinking: { type: "adaptive" as const } }),
      },
      { signal: opts.signal },
    );
    stream.on("text", (delta) => {
      text += delta;
      opts.onText?.({ text });
    });
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") throw fail("refused", undefined, text);
    return { text, truncated: final.stop_reason === "max_tokens" };
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && !(e instanceof Error)) throw e;
    const f = toCode(e, opts.signal);
    f.text = text;
    throw f;
  }
}
