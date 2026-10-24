
(() => {
"use strict";

const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "").slice(0, 16) : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const fmtDate = (t) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

/* ---------------- skins ---------------- */
const SKINS = [
  { k: "aurora", n: "Aurora" },
  { k: "botanical", n: "Botanical" },
  { k: "terracotta", n: "Terracotta" },
  { k: "lamplight", n: "Lamplight" },
];
function applySkin(k) {
  if (!SKINS.some((x) => x.k === k)) k = "aurora";
  document.documentElement.setAttribute("data-skin", k);
  document.querySelectorAll("button[data-skin]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.skin === k)));
}
const skinsHTML = (compact) => `<div class="skins ${compact ? "compact" : ""}" role="group" aria-label="Theme">${SKINS.map((x) => `<button type="button" data-skin="${x.k}" aria-pressed="${S.skin === x.k}" title="${x.n} theme"><i class="sw-${x.k}"></i><span>${x.n}</span></button>`).join("")}</div>`;
document.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-skin]");
  if (!b) return;
  S.skin = b.dataset.skin; lsSet("marginalia.skin", S.skin); applySkin(S.skin);
  if (S.view === "reader") setTimeout(() => schedulePins(), 60);
});
const S = {
  skin: lsGet("marginalia.skin") === "studio" ? "terracotta" : (lsGet("marginalia.skin") || "aurora"),
  store: null, storageNote: "",
  papers: [], activity: { days: [] },
  filter: "all", query: "",
  folders: [], folder: lsGet("marginalia.folder") || "all",
  expanded: new Set((lsGet("marginalia.expanded") || "").split(",").filter(Boolean)),
  creating: null, renamingFolder: null, confirmFolderDel: false, moving: null, mode: "read",
  importing: null,
  paper: null, blocks: [], starts: [], fullText: "", marks: [], activeMark: null, noteFilter: "all",
  highlights: [], activeId: null, pending: null,
  renaming: null, confirmDelete: null, confirmDeleteHl: false,
  askErr: "", busy: false,
};
applySkin(S.skin);

/* ---------------- storage ---------------- */
function localStore() {
  const K = "marginalia.v1";
  let data = null;
  try { data = JSON.parse(lsGet(K)); } catch {}
  data = data || { papers: {}, content: {}, hl: {}, activity: { days: [] } };
  data.folders ||= {};
  const save = () => {
    try { localStorage.setItem(K, JSON.stringify(data)); }
    catch { toast("This browser is out of room to save more. Remove a paper to free space."); }
  };
  return {
    kind: "local",
    async listPapers() { return Object.values(data.papers); },
    async getContent(pid) { return data.content[pid] || []; },
    async putPaper(meta, blocks) { data.papers[meta.id] = meta; data.content[meta.id] = blocks; save(); },
    async patchPaper(pid, patch) { if (data.papers[pid]) Object.assign(data.papers[pid], patch); save(); },
    async deletePaper(pid) { delete data.papers[pid]; delete data.content[pid]; delete data.hl[pid]; save(); },
    async listHighlights(pid) { return Object.values(data.hl[pid] || {}); },
    async putHighlight(pid, h) { (data.hl[pid] ||= {})[h.id] = h; save(); },
    async deleteHighlight(pid, hid) { if (data.hl[pid]) delete data.hl[pid][hid]; save(); },
    async getActivity() { return data.activity; },
    async listFolders() { return Object.values(data.folders); },
    async putFolder(f) { data.folders[f.id] = f; save(); },
    async patchFolder(id, patch) { if (data.folders[id]) Object.assign(data.folders[id], patch); save(); },
    async deleteFolder(id) { delete data.folders[id]; save(); },
    async putActivity(a) { data.activity = a; save(); },
  };
}

// db documents arrive frozen; work on our own copies so the page can update them
const own = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
function dbStore(db, userId) {
  const base = `data/users/${userId}`;
  const paperDoc = (pid) => db.doc(`${base}/paper_${pid}`);
  const chunkDoc = (pid, i) => db.doc(`${base}/paper_${pid}/content/c${i}`);
  const hlCol = (pid) => db.collection(`${base}/paper_${pid}/highlights`);
  return {
    kind: "db",
    async listPapers() {
      const snap = await db.collection(base).get();
      return snap.docs.map((d) => own(d.data())).filter((d) => d && d.kind === "paper");
    },
    async getContent(pid) {
      const meta = own((await paperDoc(pid).get()).data()) || {};
      const n = meta.chunks || 0;
      const parts = await Promise.all(Array.from({ length: n }, (_, i) => chunkDoc(pid, i).get()));
      return parts.flatMap((p) => (own(p.data()) || {}).blocks || []);
    },
    async putPaper(meta, blocks) {
      const chunks = [];
      let cur = [], size = 0;
      for (const b of blocks) {
        const s = b.x.length * 1.2 + 40;
        if (size + s > 150000 && cur.length) { chunks.push(cur); cur = []; size = 0; }
        cur.push(b); size += s;
      }
      if (cur.length) chunks.push(cur);
      for (let i = 0; i < chunks.length; i++) await chunkDoc(meta.id, i).set({ blocks: chunks[i] });
      await paperDoc(meta.id).set({ ...meta, kind: "paper", chunks: chunks.length });
    },
    async patchPaper(pid, patch) { await paperDoc(pid).update(patch); },
    async deletePaper(pid) {
      const meta = own((await paperDoc(pid).get()).data()) || {};
      const hs = await hlCol(pid).get();
      await Promise.all(hs.docs.map((d) => hlCol(pid).doc(d.id).delete()));
      for (let i = 0; i < (meta.chunks || 0); i++) await chunkDoc(pid, i).delete();
      await paperDoc(pid).delete();
    },
    async listHighlights(pid) { return (await hlCol(pid).get()).docs.map((d) => own(d.data())).filter(Boolean); },
    async putHighlight(pid, h) { await hlCol(pid).doc(h.id).set(h); },
    async deleteHighlight(pid, hid) { await hlCol(pid).doc(hid).delete(); },
    async getActivity() { return own((await db.doc(`${base}/activity`).get()).data()) || { days: [] }; },
    async listFolders() {
      const snap = await db.collection(base).get();
      return snap.docs.map((d) => own(d.data())).filter((d) => d && d.kind === "folder");
    },
    async putFolder(f) { await db.doc(`${base}/folder_${f.id}`).set({ ...f, kind: "folder" }); },
    async patchFolder(id, patch) { await db.doc(`${base}/folder_${id}`).update(patch); },
    async deleteFolder(id) { await db.doc(`${base}/folder_${id}`).delete(); },
    async putActivity(a) { await db.doc(`${base}/activity`).set({ ...a, kind: "activity" }); },
  };
}

async function safe(fn, msg) {
  try { return await fn(); }
  catch (e) { console.error(e); toast(msg || "Couldn't save that change. Check your connection and try again."); return undefined; }
}

let assetsCap = null, sampleCap;
const idb = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open("marginalia", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("pdfs");
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction("pdfs", mode); const r = fn(t.objectStore("pdfs")); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); }); };
  return {
    put: (k, v) => tx("readwrite", (st) => st.put(v, k)).catch(() => {}),
    get: (k) => tx("readonly", (st) => st.get(k)).catch(() => null),
    del: (k) => tx("readwrite", (st) => st.delete(k)).catch(() => {}),
  };
})();
async function initStorage() {
  let db = null, user = null;
  if (window.claude && typeof window.claude.use === "function") {
    try { [db, user] = await Promise.all([window.claude.use("db"), window.claude.use("user")]); } catch {}
    window.claude.use("assets").then((a) => { assetsCap = a; }).catch(() => {});
  }
  let id = null;
  if (db && user) { try { id = await user.id(); } catch {} }
  if (db && id) {
    S.store = dbStore(db, id);
  } else {
    S.store = localStore();
    S.storageNote = "Your library is saved in this browser only. Sign in to keep it everywhere.";
  }
  const [papers, activity, folders] = await Promise.all([
    safe(() => S.store.listPapers(), "Couldn't load your library. Reload the page to try again."),
    safe(() => S.store.getActivity(), " "),
    safe(() => S.store.listFolders(), " "),
  ]);
  S.papers = papers || [];
  S.folders = folders || [];
  if (!["all", "unfiled"].includes(S.folder) && !S.folders.some((f) => f.id === S.folder)) S.folder = "all";
  S.activity = activity || { days: [] };
}

async function recordActivity() {
  const k = dayKey();
  const days = S.activity.days || [];
  if (days.includes(k)) return;
  S.activity = { days: [...days, k].slice(-90) };
  await safe(() => S.store.putActivity(S.activity), " ");
}

/* ---------------- toast ---------------- */
let toastT;
function toast(msg, action) {
  if (!msg || !msg.trim()) return;
  let el = $(".toast");
  if (!el) { el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
  el.textContent = msg;
  if (action) {
    const b = document.createElement("button");
    b.className = "toast-act"; b.textContent = action.label;
    b.onclick = () => { el.remove(); action.run(); };
    el.appendChild(b);
  }
  clearTimeout(toastT);
  toastT = setTimeout(() => el.remove(), action ? 6500 : 4200);
}

/* ---------------- tiny markdown ---------------- */
function inlineMd(s) {
  return s
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/(^|\W)_([^_\n]+)_(?=\W|$)/g, "$1<em>$2</em>");
}
// answers sometimes arrive with HTML entities already in them; turn them back into characters first
const unent = (s) => String(s || "").replace(/&(#39|#x27|apos|#34|quot|lt|gt|nbsp|amp);/g, (m, k) => ({ "#39": "'", "#x27": "'", apos: "'", "#34": '"', quot: '"', lt: "<", gt: ">", nbsp: " ", amp: "&" }[k]));
function md(src) {
  const lines = esc(unent(src)).split("\n");
  let out = "", list = null, para = [], code = null;
  const flushPara = () => { if (para.length) { out += `<p>${inlineMd(para.join(" "))}</p>`; para = []; } };
  const flushList = () => { if (list) { out += `<${list.t}>${list.items.map((i) => `<li>${inlineMd(i)}</li>`).join("")}</${list.t}>`; list = null; } };
  for (const line of lines) {
    if (code !== null) {
      if (/^```/.test(line)) { out += `<pre><code>${code.join("\n")}</code></pre>`; code = null; } else code.push(line);
      continue;
    }
    if (/^```/.test(line)) { flushPara(); flushList(); code = []; continue; }
    let m;
    if ((m = line.match(/^\s*[-*•]\s+(.*)/))) { flushPara(); if (!list || list.t !== "ul") { flushList(); list = { t: "ul", items: [] }; } list.items.push(m[1]); continue; }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) { flushPara(); if (!list || list.t !== "ol") { flushList(); list = { t: "ol", items: [] }; } list.items.push(m[1]); continue; }
    if ((m = line.match(/^#{1,6}\s+(.*)/))) { flushPara(); flushList(); out += `<h4>${inlineMd(m[1])}</h4>`; continue; }
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if (list && /^\s{2,}/.test(line)) { list.items[list.items.length - 1] += " " + line.trim(); continue; }
    flushList(); para.push(line.trim());
  }
  if (code !== null) out += `<pre><code>${code.join("\n")}</code></pre>`;
  flushPara(); flushList();
  return out;
}

/* ---------------- text -> blocks ---------------- */
const NAMED_HEAD = /^(abstract|introduction|related work|background|preliminaries|methods?|methodology|approach|experiments?|experimental setup|evaluation|results|discussion|conclusions?|summary|future work|references|bibliography|acknowledg(e)?ments?|appendix|limitations)[.:]?$/i;
const NUM_HEAD = /^((\d{1,2}(\.\d{1,2}){0,3}\.?)|([IVX]{1,5}\.)|([A-H](\.\d{1,2}){1,3}\.?))\s+[A-Z][^]{1,90}$/;

function blocksFromPlainText(text, title) {
  const paras = text.replace(/\r/g, "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const blocks = [];
  if (title) blocks.push({ t: "t", x: title, p: 0 });
  paras.forEach((p, idx) => {
    const lines = p.split("\n").map((l) => l.trim()).filter(Boolean);
    let x = "";
    for (const l of lines) {
      if (!x) x = l;
      else if (/[a-z]-$/.test(x) && /^[a-z]/.test(l)) x = x.slice(0, -1) + l;
      else x += " " + l;
    }
    x = x.normalize("NFKC");
    const shortNoStop = x.length < 90 && !/[.,;:!?)]$/.test(x);
    if (!title && idx === 0 && x.length < 220) blocks.push({ t: "t", x, p: 0 });
    else if (NAMED_HEAD.test(x) || (shortNoStop && (NUM_HEAD.test(x) || lines.length === 1 && x.split(" ").length <= 8))) blocks.push({ t: "h", x, p: 0 });
    else blocks.push({ t: "p", x, p: 0 });
  });
  return blocks;
}

let pdfReady = null;
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src; s.onload = res; s.onerror = () => rej(new Error("Couldn't load the PDF reader. Check your connection and try again."));
    document.head.appendChild(s);
  });
}
// Designed PDFs (Canva-style books and slides) often describe a font without giving it a name, and
// pdf.js then drops every word set in that font. Give those fonts a name by rewriting
// "/Type /FontDescriptor" in place with a same-length "/FontName /…" entry, so no byte offsets move.
function fixPdfBytes(u8) {
  const enc = (t) => Uint8Array.from(t, (c) => c.charCodeAt(0));
  const pats = [[enc("/Type /FontDescriptor"), enc("/FontName /Type3Fonts")], [enc("/Type/FontDescriptor"), enc("/FontName/Type3Fonts")]];
  const fontName = enc("/FontName");
  let fixed = 0;
  const at = (i, pat) => { for (let k = 0; k < pat.length; k++) if (u8[i + k] !== pat[k]) return false; return true; };
  for (let i = 0; i < u8.length - 24; i++) {
    if (u8[i] !== 47 || u8[i + 1] !== 84) continue; // "/T"
    for (const [pat, rep] of pats) {
      if (!at(i, pat)) continue;
      // look through this descriptor (up to its closing ">>") for an existing name
      let j = i + pat.length, has = false;
      for (; j < Math.min(u8.length - 1, i + 2000); j++) {
        if (u8[j] === 62 && u8[j + 1] === 62) break;
        if (u8[j] === 47 && at(j, fontName)) { has = true; break; }
      }
      let k = i - 1;
      for (; k > Math.max(0, i - 2000); k--) {
        if (u8[k] === 60 && u8[k - 1] === 60) break;
        if (u8[k] === 47 && at(k, fontName)) { has = true; break; }
      }
      if (!has) { u8.set(rep, i); fixed++; }
      break;
    }
  }
  return fixed;
}
// Some designed PDFs (Canva-style books and slides) use fonts with no name. pdf.js gives up on those
// fonts, which drops all of their text, so we load the worker with that one check relaxed.
async function loadWorker() {
  try {
    const res = await fetch(PDFJS_WORKER);
    if (!res.ok) throw new Error(res.status);
    let src = await res.text();
    src = src.replace(/if\(!\((\w+) instanceof (\w+)\.Name\)\)throw new \w+\.FormatError\("invalid font name"\);/, 'if(!($1 instanceof $2.Name))$1=$2.Name.get("UnnamedFont");');
    const s = document.createElement("script");
    s.textContent = src;
    document.head.appendChild(s);
    if (!window.pdfjsWorker) throw new Error("worker didn't start");
  } catch (e) {
    console.warn("Falling back to the plain PDF worker", e);
    await loadScript(PDFJS_WORKER);
  }
}
function loadPdfJs() {
  if (!pdfReady) {
    pdfReady = (async () => {
      await loadScript(PDFJS);
      await loadWorker(); // defines window.pdfjsWorker so parsing runs on the page itself
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    })().catch((e) => { pdfReady = null; throw e; });
  }
  return pdfReady;
}

const median = (arr) => { if (!arr.length) return 0; const a = [...arr].sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };

async function parsePdf(buf, onProgress) {
  await loadPdfJs();
  const doc = await window.pdfjsLib.getDocument({ data: buf }).promise;
  let info = {};
  try { info = (await doc.getMetadata()).info || {}; } catch {}
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    pages.push({ p, lines: readingOrder(toLines(tc.items, p), page.getViewport({ scale: 1 }).width) });
    page.cleanup();
    onProgress(p / doc.numPages);
  }
  const blocks = linesToBlocks(pages, info);
  try { await doc.destroy(); } catch {}
  return { blocks, numPages: pages.length };
}

// Papers in two columns are stored in reading order already. Designed single-column pages
// (books, slides) often draw headings after their text, so those are re-sorted top to bottom.
function readingOrder(lines, pageW) {
  if (lines.length < 3) return lines;
  const rightCol = lines.filter((l) => l.x0 > pageW * 0.45 && l.x1 - l.x0 < pageW * 0.5 && l.text.length > 25).length;
  const leftCol = lines.filter((l) => l.x1 < pageW * 0.55 && l.text.length > 25).length;
  if (rightCol > lines.length * 0.2 && leftCol > lines.length * 0.2) return lines;
  return [...lines].sort((a, b) => (Math.abs(a.y - b.y) > Math.min(a.h, b.h) * 0.5 ? b.y - a.y : a.x0 - b.x0));
}
function toLines(items, p) {
  const lines = [];
  let cur = null;
  const push = () => { if (cur && cur.text.trim()) lines.push(cur); cur = null; };
  for (const it of items) {
    if (!("str" in it)) continue;
    const [a, b, , d, x, y] = it.transform;
    if (Math.abs(b) > 0.01 && it.str) continue; // rotated text such as arXiv side stamps
    const h = Math.abs(d) || it.height || 10;
    const s = it.str;
    if (s) {
      const sameLine = cur && Math.abs(y - cur.y) <= 0.5 * Math.max(h, cur.h) && x >= cur.x1 - Math.max(h, cur.h) * 1.5 && x - cur.x1 < Math.max(h, cur.h) * 6;
      if (sameLine) {
        if (x - cur.x1 > h * 0.12 && !/\s$/.test(cur.text) && !/^\s/.test(s)) cur.text += " ";
        cur.text += s;
        cur.x1 = Math.max(cur.x1, x + (it.width || 0));
        if (h > cur.h && s.trim().length > 1) { cur.h = h; cur.y = y; }
      } else {
        push();
        cur = { y, x0: x, x1: x + (it.width || 0), h, text: s, p };
      }
    }
    if (it.hasEOL) push();
  }
  push();
  return lines.map((l) => {
    // designed books draw list bullets with odd glyphs that come through as control characters
    const raw = l.text.normalize("NFKC");
    const bullet = /^\s*[\x00-\x08\x0B-\x1F\x7F\uE000-\uF8FF•●▪◦■□➢➤►✓✔]/.test(raw);
    let text = raw.replace(/[\x00-\x08\x0B-\x1F\x7F\uE000-\uF8FF]/g, " ").replace(/^\s*[•●▪◦■□➢➤►✓✔]\s*/, "").replace(/\s+/g, " ").trim();
    // letter-spaced display text ("m a d e  w i t h") reads better closed up
    text = text.replace(/(^|\s)((?:[\p{L}\p{N}] ){3,}[\p{L}\p{N}])(?=\s|$)/gu, (m0, pre, run) => pre + run.replace(/ /g, ""));
    return { ...l, text, bullet };
  }).filter((l) => l.text);
}

function linesToBlocks(pages, info) {
  const all = pages.flatMap((pg) => pg.lines);
  // drop page numbers and running headers/footers repeated across pages
  const counts = new Map();
  for (const pg of pages) for (const t of new Set(pg.lines.map((l) => l.text.replace(/\d+/g, "#")))) counts.set(t, (counts.get(t) || 0) + 1);
  const repeatMin = Math.max(3, Math.ceil(pages.length * 0.4));
  const isNoise = (l) => /^\d{1,4}$/.test(l.text) || (pages.length >= 4 && l.text.length < 120 && counts.get(l.text.replace(/\d+/g, "#")) >= repeatMin);

  const hs = [];
  for (const l of all) for (let i = 0; i < Math.min(l.text.length, 200); i += 10) hs.push(Math.round(l.h * 10) / 10);
  const body = median(hs) || 10;
  const bodyLines = all.filter((l) => Math.abs(l.h - body) < body * 0.12);
  const widths = bodyLines.map((l) => l.x1 - l.x0);
  const typW = median(widths.filter((w) => w > median(widths) * 0.6)) || 300;
  const gaps = [];
  for (let i = 1; i < bodyLines.length; i++) {
    const g = bodyLines[i - 1].y - bodyLines[i].y;
    if (bodyLines[i - 1].p === bodyLines[i].p && g > 0 && g < body * 3) gaps.push(g);
  }
  const lineGap = median(gaps) || body * 1.2;

  const blocks = [];
  // title: the largest text near the top of page 1
  let titleLines = new Set();
  const first = (pages[0] || { lines: [] }).lines.filter((l) => !isNoise(l));
  const maxH = Math.max(0, ...first.slice(0, 40).map((l) => l.h));
  let title = "";
  if (maxH > body * 1.25) {
    const tl = first.filter((l) => l.h >= maxH * 0.92).slice(0, 4);
    tl.forEach((l) => titleLines.add(l));
    title = tl.map((l) => l.text).join(" ");
  }
  const metaTitle = String(info.Title || "").trim();
  if (!title && metaTitle.length > 8 && !/\.(pdf|dvi|docx?|tex)$|^untitled|^microsoft word/i.test(metaTitle)) title = metaTitle;
  if (title) blocks.push({ t: "t", x: title, p: 1 });

  let para = null, prev = null;
  const flush = () => { if (para && para.x.trim()) blocks.push(para); para = null; };
  for (const pg of pages) {
    for (const l of pg.lines) {
      if (titleLines.has(l) || isNoise(l)) continue;
      const big = l.h > body * 1.15 && l.text.length < 140 && /[A-Za-z]{3}/.test(l.text);
      const short = (l.x1 - l.x0) < typW * 0.85;
      const head = (big && !/[.,;]$/.test(l.text)) || NAMED_HEAD.test(l.text) || (NUM_HEAD.test(l.text) && short && l.text.length < 80 && !/[.,;:]$/.test(l.text) && l.h >= body * 0.95);
      if (head) {
        flush();
        const last = blocks[blocks.length - 1];
        if (last && last.t === "h" && prev && prev.p === l.p && prev.y - l.y < l.h * 1.8 && /^(\d+(\.\d+)*\.?|[IVX]+\.)$/.test(last.x)) last.x += " " + l.text;
        else blocks.push({ t: "h", x: l.text, p: l.p });
        prev = l;
        continue;
      }
      let newPara = !para;
      if (para && prev) {
        const samePage = prev.p === l.p;
        const g = prev.y - l.y;
        const prevShort = (prev.x1 - prev.x0) < typW * 0.8 && /[.!?:)\]"”]$/.test(prev.text);
        const gapBig = samePage && g > lineGap * 1.55 && g < lineGap * 12;
        const sizeShift = Math.abs(l.h - prev.h) > body * 0.2;
        const indent = samePage && g > 0 && g < lineGap * 1.5 && l.x0 - prev.x0 > body * 0.8 && l.x0 - prev.x0 < body * 4 && /[.!?:]$/.test(prev.text);
        newPara = prevShort || gapBig || sizeShift || indent || l.bullet;
        // a lowercase start after an unfinished sentence is the same paragraph (column or page break)
        if (newPara && !prevShort && !l.bullet && /^[a-z(]/.test(l.text) && !/[.!?:]$/.test(para.x) && Math.abs(l.h - prev.h) < body * 0.25) newPara = false;
      }
      if (newPara) { flush(); para = { t: "p", x: (l.bullet ? "• " : "") + l.text, p: l.p }; }
      else if (/[A-Za-z]-$/.test(para.x) && /^[a-z]/.test(l.text)) para.x = para.x.slice(0, -1) + l.text;
      else para.x += " " + l.text;
      prev = l;
    }
  }
  flush();
  return blocks;
}

/* ---------------- sample paper ---------------- */
const SAMPLE = {
  title: "How to Read a Research Paper Without Getting Lost (sample)",
  text: `Abstract

Research papers are written for specialists, so even strong readers can stall on a dense paragraph. This short sample explains a reading routine that keeps momentum: skim first, read with questions, and leave yourself notes you can return to. It is included so you can try highlighting and asking questions before adding your own papers.

1 Introduction

A typical paper compresses months of work into a few pages. Authors assume you know the field's vocabulary, its standard datasets, and the results they are building on. When one of those assumptions does not hold for you, a single sentence can block the rest of the section. The goal of a reading routine is not to understand every line on the first try, but to know which lines matter and to come back to them with the right question.

2 The three-pass approach

A widely taught method, described by S. Keshav in "How to Read a Paper" (2007), splits reading into three passes. The first pass takes a few minutes: read the title, abstract, introduction, section headings, and conclusion, and glance at the figures. After it you should be able to say what kind of paper this is, what problem it addresses, and what it claims.

The second pass reads the body with care but skips proofs and dense derivations. Mark terms you do not know and references you may want to read. Figures deserve attention here, because a good figure often states the main result more plainly than the text does.

The third pass is for papers you need to understand deeply, for example because you will build on them or review them. You try to re-derive the work in your own head, questioning each assumption, and you note what the authors left out.

3 Asking good questions of a passage

Most confusion comes from one of four sources: an undefined term, a symbol introduced earlier, a claim whose evidence lives in another section, or a step in an argument that the authors treat as obvious. Naming which of these is happening makes the question sharper. "What does this mean?" is a fine start; "Which earlier result does this step rely on?" usually gets a more useful answer.

When you ask about a highlighted passage, keep the question attached to it. Coming back a week later, you will see the passage, your question, and the answer together, which is far easier than finding a note in a separate document.

4 Keeping notes that last

Notes are most useful when they are short and tied to the text. Write what you understood in your own words, and write down what you still do not understand. Unanswered questions are a record of where the paper was hard, and they are often exactly what to ask a colleague, an advisor, or an assistant.

5 Conclusion

Reading papers well is a skill built through repetition. A routine of skimming, questioning, and annotating turns a wall of text into a set of manageable pieces. Try it here: select any sentence in this sample and ask what it means.

References

S. Keshav. How to Read a Paper. ACM SIGCOMM Computer Communication Review, 37(3), 2007.`,
};

/* ---------------- library ---------------- */
function paperStatus(p) {
  if (p.finished || (p.progress || 0) >= 0.96) return "done";
  if ((p.progress || 0) > 0.02 || p.lastOpenedAt) return "reading";
  return "unread";
}
const STATUS_LABEL = { unread: "Unread", reading: "Reading", done: "Finished" };

function weekDays() {
  const now = new Date();
  const dow = (now.getDay() + 6) % 7; // Monday = 0
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now); d.setDate(now.getDate() - dow + i);
    return { k: dayKey(d), l: "MTWTFSS"[i], today: i === dow };
  });
}

function renderLibrary() {
  S.view = "library";
  const papers = [...S.papers].sort((a, b) => (b.lastOpenedAt || b.addedAt || 0) - (a.lastOpenedAt || a.addedAt || 0));
  const totalQ = papers.reduce((n, p) => n + (p.qCount || 0), 0);
  const totalH = papers.reduce((n, p) => n + (p.hlCount || 0), 0);
  const days = new Set(S.activity.days || []);
  const wk = weekDays();
  const wkOn = wk.filter((d) => days.has(d.k)).length;
  const q = S.query.trim().toLowerCase();
  const scope = S.folder === "all" || S.folder === "unfiled" ? papersIn(S.folder) : q ? papersIn(S.folder) : papers.filter((p) => p.folderId === S.folder);
  const shown = scope.filter((p) => (S.filter === "all" || paperStatus(p) === S.filter) && (!q || (p.title || "").toLowerCase().includes(q)))
    .sort((a, b) => (b.lastOpenedAt || b.addedAt || 0) - (a.lastOpenedAt || a.addedAt || 0));
  const curF = S.folders.find((f) => f.id === S.folder);
  const subs = curF ? childrenOf(curF.id) : [];

  const imp = S.importing;
  $("#app").innerHTML = `
  <div class="view library">
    <div class="lib-wrap">
      <header class="lib-head">
        <div class="brand">
          <h1>Margin<b>alia</b></h1>
          <p>Your reading room for research papers. Highlight a passage, ask Claude about it, and find the answer pinned there next time.</p>
        </div>
        <div class="skin-pick"><span class="mono">Theme</span>${skinsHTML(false)}${hostBarHTML()}</div>
      </header>

      <section class="stats" aria-label="Reading stats">
        <div class="stat"><span class="n">${papers.length}</span><span class="l mono">Papers</span></div>
        <div class="stat"><span class="n">${totalH}</span><span class="l mono">Passages marked</span></div>
        <div class="stat"><span class="n">${totalQ}</span><span class="l mono">Questions asked</span></div>
        <div class="stat weekstat"><span class="l mono">${wkOn ? `Read on ${plural(wkOn, "day")} this week` : "This week"}</span>
          <div class="week">${wk.map((d) => `<i class="${days.has(d.k) ? "on" : ""} ${d.today ? "today" : ""}" title="${d.k}">${d.l}</i>`).join("")}</div>
        </div>
      </section>

      <div class="lib-body">
      ${treeHTML()}
      <div style="display:grid;gap:22px;min-width:0">
      <div class="add-row">
        <div class="drop" id="drop">
          ${imp ? `
            <div class="importing"><span>${esc(imp.label)}</span><div class="bar"><i style="width:${Math.round(imp.pct * 100)}%"></i></div></div>
          ` : `
            <div class="t"><strong>Add a paper${curF ? ` to ${esc(curF.name)}` : ""}</strong><span>Drop a PDF here, choose one from your device, or paste the text.</span></div>
            <div class="acts">
              <button class="btn primary" id="pick-pdf">Choose PDF</button>
              <button class="btn" id="paste-open">Paste text</button>
            </div>`}
        </div>
      </div>
      ${S.storageNote ? `<p class="notice">${esc(S.storageNote)}</p>` : ""}
      ${window.marginaliaHost && !window.marginaliaHost.hasKey() ? `<p class="notice key-notice">To ask Claude about what you read, add your Anthropic API key in <a href="/app/settings">Settings</a>. Highlights and notes work without one.</p>` : ""}

      <section style="display:grid;gap:16px">
        ${folderHeadHTML(curF)}
        <div class="shelf-head">
          <h2>${curF ? "" : S.folder === "unfiled" ? "Not in a collection" : "All papers"}</h2>
          <div class="filters">
            ${["all", "reading", "unread", "done"].map((f) => `<button class="chip" data-f="${f}" aria-pressed="${S.filter === f}">${f === "all" ? "All" : STATUS_LABEL[f]}</button>`).join("")}
            <input class="search" id="lib-search" type="search" placeholder="Search titles" value="${esc(S.query)}" aria-label="Search titles">
          </div>
        </div>
        ${papers.length === 0 ? `
          <div class="empty-shelf">
            <h3>Your shelf is empty</h3>
            <p>Add your first paper above. Want to see how it works first? Open the sample, select any sentence, and ask a question about it.</p>
            <button class="btn" id="add-sample">Open the sample paper</button>
            <div class="how">
              <div><b>Highlight</b><span>Select any part of the text while you read.</span></div>
              <div><b>Ask</b><span>Claude explains it using the passage and the paper around it.</span></div>
              <div><b>Return</b><span>Click the highlight later to see your questions and keep asking.</span></div>
            </div>
          </div>` : `
          ${subs.length && !q ? `<div class="ftiles">${subs.map((f) => `<button class="ftile" data-folder="${f.id}" data-drop-folder="${f.id}">${FOLDER_SVG}<span><b>${esc(f.name)}</b><small>${plural(papersIn(f.id).length, "paper")}${childrenOf(f.id).length ? " · " + plural(childrenOf(f.id).length, "folder") : ""}</small></span></button>`).join("")}</div>` : ""}
          ${shown.length ? `<div class="shelf">${shown.map(cardHTML).join("")}</div>` : `<p class="notice">${curF ? (subs.length ? "No papers directly in this folder yet. Add one above, or drag a paper onto a folder." : "This folder is empty. Add a paper above, or move one here with Move on any paper.") : "No papers match this filter."}</p>`}`}
      </section>
      <div class="lib-ad" id="lib-ad"></div>
      </div>
      </div>
    </div>
  </div>`;
  bindLibrary();
  const ad = document.getElementById("lib-ad");
  if (ad && window.marginaliaHost && window.marginaliaHost.mountAd) window.marginaliaHost.mountAd(ad, "library");
}

function hostBarHTML() {
  const h = window.marginaliaHost;
  if (!h) return "";
  return `<div class="host-bar"><span>${esc(h.email || "")}</span><a href="/app/settings">Settings</a><a href="/" >Home</a><button type="button" class="link-btn" id="host-signout">Sign out</button></div>`;
}
document.addEventListener("click", (e) => { if (e.target.closest && e.target.closest("#host-signout") && window.marginaliaHost) window.marginaliaHost.signOut(); });
const FOLDER_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 6.5A2.5 2.5 0 0 1 5.5 4h3.6c.6 0 1.2.2 1.6.7L12 6h6.5A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/></svg>`;
const LIB_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 4h4v16H4zM10 4h4v16h-4zM16.2 4.6l3.8-1 3.6 15.4-3.9 1z" transform="scale(.92) translate(1 1)"/></svg>`;
const childrenOf = (pid) => S.folders.filter((f) => (f.parentId || null) === pid).sort((a, b) => a.name.localeCompare(b.name));
function descendants(id) { const out = [id]; for (const c of childrenOf(id)) out.push(...descendants(c.id)); return out; }
function folderPath(id) {
  const parts = []; let f = S.folders.find((x) => x.id === id), guard = 0;
  while (f && guard++ < 64) { parts.unshift(f); f = S.folders.find((x) => x.id === f.parentId); }
  return parts;
}
function papersIn(id) {
  if (id === "all") return S.papers;
  if (id === "unfiled") return S.papers.filter((p) => !p.folderId || !S.folders.some((f) => f.id === p.folderId));
  const set = new Set(descendants(id));
  return S.papers.filter((p) => set.has(p.folderId));
}
function currentFolderId() { return S.folders.some((f) => f.id === S.folder) ? S.folder : null; }
function setFolder(id) {
  S.folder = id; lsSet("marginalia.folder", id);
  folderPath(id).forEach((f) => S.expanded.add(f.id));
  S.renamingFolder = null; S.confirmFolderDel = false; S.moving = null;
  renderLibrary();
}
const saveExpanded = () => lsSet("marginalia.expanded", [...S.expanded].join(","));
function newFolderForm(parent, depth) {
  return `<form class="new-folder" data-parent="${parent}" style="--d:${depth}"><input id="new-folder-input" placeholder="${parent === "root" ? "Collection name, e.g. Neuroscience" : "Subfolder name"}" maxlength="80" aria-label="Folder name" autocomplete="off"></form>`;
}
function treeHTML() {
  const node = (f, depth) => {
    const kids = childrenOf(f.id);
    const open = S.expanded.has(f.id);
    return `<li>
      <div class="tnode ${S.folder === f.id ? "on" : ""}" style="--d:${depth}" data-drop-folder="${f.id}">
        ${kids.length ? `<button class="twist" data-twist="${f.id}" aria-expanded="${open}" aria-label="${open ? "Collapse" : "Expand"} ${esc(f.name)}">${open ? "▾" : "▸"}</button>` : `<span class="twist"></span>`}
        <button class="tname" data-folder="${f.id}">${FOLDER_SVG}<span>${esc(f.name)}</span><small>${papersIn(f.id).length}</small></button>
      </div>
      ${S.creating === f.id ? newFolderForm(f.id, depth + 1) : ""}
      ${kids.length && open ? `<ul>${kids.map((k) => node(k, depth + 1)).join("")}</ul>` : ""}
    </li>`;
  };
  const unfiled = papersIn("unfiled").length;
  return `<nav class="tree" aria-label="Collections">
    <div class="tree-head"><span class="mono">Collections</span><button type="button" data-newfolder="root">+ New</button></div>
    <ul>
      <li><div class="tnode ${S.folder === "all" ? "on" : ""}"><span class="twist"></span><button class="tname" data-folder="all">${LIB_SVG}<span>All papers</span><small>${S.papers.length}</small></button></div></li>
      ${childrenOf(null).map((f) => node(f, 0)).join("")}
      ${S.creating === "root" ? `<li>${newFolderForm("root", 0)}</li>` : ""}
      ${S.folders.length && unfiled ? `<li><div class="tnode ${S.folder === "unfiled" ? "on" : ""}" data-drop-folder=""><span class="twist"></span><button class="tname" data-folder="unfiled"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 3"/></svg><span>Not in a collection</span><small>${unfiled}</small></button></div></li>` : ""}
    </ul>
    ${!S.folders.length ? `<p class="notice" style="font-size:12.5px">Make a collection like “Neuroscience”, then add subfolders inside it.</p>` : ""}
  </nav>`;
}
function folderHeadHTML(f) {
  if (!f) return "";
  const path = folderPath(f.id);
  const parent = path.length > 1 ? path[path.length - 2] : null;
  return `<div class="folder-head">
    <div class="crumbs"><button data-folder="all">All papers</button>${path.slice(0, -1).map((x) => `<span>/</span><button data-folder="${x.id}">${esc(x.name)}</button>`).join("")}</div>
    ${S.renamingFolder === f.id ? `<form id="folder-rename-form"><input class="folder-rename" id="folder-rename" value="${esc(f.name)}" maxlength="80" aria-label="Folder name"></form>`
      : `<h2 style="margin:0;font-family:var(--font-display);font-weight:var(--display-weight);font-size:32px;line-height:1.1;overflow-wrap:anywhere">${esc(f.name)}</h2>`}
    <div class="folder-acts">
      ${S.confirmFolderDel ? `<span style="font-size:13px">Delete “${esc(f.name)}”? Its papers and subfolders move to ${parent ? `“${esc(parent.name)}”` : "your library"}.</span><button class="btn small" data-folder-del-yes>Delete folder</button><button class="btn ghost small" data-folder-del-no>Keep</button>`
        : `<button class="btn small" data-newfolder="${f.id}">+ Subfolder</button><button class="btn ghost small" data-folder-rename>Rename</button><button class="btn ghost small" data-folder-del>Delete folder</button>`}
    </div>
  </div>`;
}
function folderOptions(selected) {
  const out = [`<option value="">Not in a collection</option>`];
  const walk = (pid, depth) => childrenOf(pid).forEach((f) => { out.push(`<option value="${f.id}" ${f.id === selected ? "selected" : ""}>${"  ".repeat(depth)}${depth ? "└ " : ""}${esc(f.name)}</option>`); walk(f.id, depth + 1); });
  walk(null, 0);
  return out.join("");
}
async function moveTo(pid, folderId) {
  const p = S.papers.find((x) => x.id === pid);
  if (!p) return;
  p.folderId = folderId || null; S.moving = null;
  renderLibrary();
  const f = S.folders.find((x) => x.id === folderId);
  toast(f ? `Moved to ${f.name}` : "Moved out of collections");
  await safe(() => S.store.patchPaper(pid, { folderId: p.folderId }));
}
async function createFolder(name, parent) {
  const f = { id: uid(), name: name.slice(0, 80), parentId: parent === "root" ? null : parent, createdAt: Date.now() };
  S.folders.push(f);
  if (f.parentId) S.expanded.add(f.parentId);
  saveExpanded();
  S.creating = null;
  setFolder(f.id);
  await safe(() => S.store.putFolder(f), "Couldn't save that folder. Try again.");
}
async function deleteFolder(f) {
  const parentId = f.parentId || null;
  const kids = childrenOf(f.id), ps = S.papers.filter((p) => p.folderId === f.id);
  kids.forEach((k) => { k.parentId = parentId; });
  ps.forEach((p) => { p.folderId = parentId; });
  S.folders = S.folders.filter((x) => x.id !== f.id);
  S.confirmFolderDel = false;
  setFolder(parentId || "all");
  toast(`Deleted “${f.name}”`);
  await safe(async () => {
    await Promise.all([...kids.map((k) => S.store.patchFolder(k.id, { parentId })), ...ps.map((p) => S.store.patchPaper(p.id, { folderId: parentId }))]);
    await S.store.deleteFolder(f.id);
  });
}

function cardHTML(p) {
  const st = paperStatus(p);
  const pct = Math.round(Math.min(1, p.progress || 0) * 100);
  const src = p.source === "pdf" ? `PDF · ${plural(p.pages || 1, "page")}` : p.source === "sample" ? "Sample" : "Pasted text";
  const renaming = S.renaming === p.id;
  const confirming = S.confirmDelete === p.id;
  const fp = p.folderId ? folderPath(p.folderId) : [];
  return `<article class="card ${st === "done" ? "done" : ""}" data-id="${p.id}" draggable="true">
    ${renaming ? `<form class="rename-form"><input class="rename" id="rename-${p.id}" value="${esc(p.title)}" aria-label="Paper title"></form>` : `
    <div class="top"><button class="open" data-open="${p.id}">
      <span class="kind mono">${esc(src)}</span>
      <h3>${esc(p.title || "Untitled paper")}</h3>
    </button><span class="ring" style="--p:${pct}" data-v="${pct}%" aria-label="${pct}% read"></span></div>`}
    <div class="meta"><span class="pill ${st}">${STATUS_LABEL[st]}</span><span>${plural(p.qCount || 0, "question")}</span>${fp.length && S.folder !== p.folderId ? `<span title="${esc(fp.map((x) => x.name).join(" / "))}">in ${esc(fp[fp.length - 1].name)}</span>` : ""}</div>
    ${S.moving === p.id ? `<select data-move-sel="${p.id}" aria-label="Move to folder">${folderOptions(p.folderId)}</select>` : ""}
    <div class="foot">
      <span style="font-size:12px;color:var(--card-mute)">${p.lastOpenedAt ? "Opened " + fmtDate(p.lastOpenedAt) : "Added " + fmtDate(p.addedAt)}</span>
      <span class="tools">
        ${confirming ? `<span style="font-size:12.5px">Remove for good?</span><button class="danger" data-del-yes="${p.id}">Remove</button><button data-del-no>Keep</button>` : `
        <button data-rename="${p.id}">Rename</button>
        <button data-move="${p.id}">${S.moving === p.id ? "Cancel move" : "Move"}</button>
        <button data-finish="${p.id}">${st === "done" ? "Mark unfinished" : "Mark finished"}</button>
        <button class="danger" data-del="${p.id}">Remove</button>`}
      </span>
    </div>
  </article>`;
}

function bindLibrary() {
  const app = $("#app");
  app.querySelectorAll("[data-folder]").forEach((b) => b.onclick = () => setFolder(b.dataset.folder));
  app.querySelectorAll("[data-twist]").forEach((b) => b.onclick = () => { const id = b.dataset.twist; S.expanded.has(id) ? S.expanded.delete(id) : S.expanded.add(id); saveExpanded(); renderLibrary(); });
  app.querySelectorAll("[data-newfolder]").forEach((b) => b.onclick = () => {
    S.creating = b.dataset.newfolder;
    if (S.creating !== "root") S.expanded.add(S.creating);
    renderLibrary(); $("#new-folder-input")?.focus();
  });
  const nf = app.querySelector(".new-folder");
  if (nf) {
    const input = nf.querySelector("input");
    let done = false;
    const finish = (save) => { if (done) return; done = true; const name = input.value.trim(); if (save && name) createFolder(name, nf.dataset.parent); else { S.creating = null; renderLibrary(); } };
    nf.onsubmit = (e) => { e.preventDefault(); finish(true); };
    input.onkeydown = (e) => { if (e.key === "Escape") finish(false); };
    input.onblur = () => finish(true);
  }
  const fr = $("[data-folder-rename]"); if (fr) fr.onclick = () => { S.renamingFolder = S.folder; renderLibrary(); const i = $("#folder-rename"); i.focus(); i.select(); };
  const frf = $("#folder-rename-form");
  if (frf) {
    const input = $("#folder-rename"); let done = false;
    const finish = async (save) => {
      if (done) return; done = true;
      const f = S.folders.find((x) => x.id === S.renamingFolder); S.renamingFolder = null;
      const name = input.value.trim();
      if (save && f && name && name !== f.name) { f.name = name.slice(0, 80); renderLibrary(); await safe(() => S.store.patchFolder(f.id, { name: f.name })); }
      else renderLibrary();
    };
    frf.onsubmit = (e) => { e.preventDefault(); finish(true); };
    input.onkeydown = (e) => { if (e.key === "Escape") finish(false); };
    input.onblur = () => finish(true);
  }
  const fd = $("[data-folder-del]"); if (fd) fd.onclick = () => { S.confirmFolderDel = true; renderLibrary(); };
  const fdn = $("[data-folder-del-no]"); if (fdn) fdn.onclick = () => { S.confirmFolderDel = false; renderLibrary(); };
  const fdy = $("[data-folder-del-yes]"); if (fdy) fdy.onclick = () => { const f = S.folders.find((x) => x.id === S.folder); if (f) deleteFolder(f); };
  app.querySelectorAll("[data-move]").forEach((b) => b.onclick = () => { S.moving = S.moving === b.dataset.move ? null : b.dataset.move; renderLibrary(); $(`[data-move-sel="${S.moving}"]`)?.focus(); });
  app.querySelectorAll("[data-move-sel]").forEach((sel) => sel.onchange = () => moveTo(sel.dataset.moveSel, sel.value));
  // drag a paper card onto a folder
  app.querySelectorAll(".card[draggable]").forEach((c) => {
    c.ondragstart = (e) => { e.dataTransfer.setData("text/x-paper", c.dataset.id); e.dataTransfer.effectAllowed = "move"; c.classList.add("dragging"); };
    c.ondragend = () => c.classList.remove("dragging");
  });
  app.querySelectorAll("[data-drop-folder]").forEach((t) => {
    t.ondragover = (e) => { if ([...e.dataTransfer.types].includes("text/x-paper")) { e.preventDefault(); t.classList.add("drop-target"); } };
    t.ondragleave = () => t.classList.remove("drop-target");
    t.ondrop = (e) => { const pid = e.dataTransfer.getData("text/x-paper"); t.classList.remove("drop-target"); if (pid) { e.preventDefault(); e.stopPropagation(); moveTo(pid, t.dataset.dropFolder || null); } };
  });
  app.querySelectorAll("[data-f]").forEach((b) => b.onclick = () => { S.filter = b.dataset.f; renderLibrary(); });
  const search = $("#lib-search");
  if (search) search.oninput = () => { S.query = search.value; const pos = search.selectionStart; renderLibrary(); const s2 = $("#lib-search"); s2.focus(); s2.setSelectionRange(pos, pos); };
  const pick = $("#pick-pdf"); if (pick) pick.onclick = () => $("#file-input").click();
  const po = $("#paste-open"); if (po) po.onclick = openPasteDialog;
  const as = $("#add-sample"); if (as) as.onclick = addSample;
  app.querySelectorAll("[data-open]").forEach((b) => b.onclick = () => openPaper(b.dataset.open));
  app.querySelectorAll("[data-rename]").forEach((b) => b.onclick = () => { S.renaming = b.dataset.rename; renderLibrary(); const i = $(`#rename-${S.renaming}`); i.focus(); i.select(); });
  app.querySelectorAll(".rename-form").forEach((f) => {
    const input = f.querySelector("input");
    const done = async () => {
      if (!S.renaming) return;
      const id = S.renaming; S.renaming = null;
      const title = input.value.trim();
      const p = S.papers.find((x) => x.id === id);
      if (p && title && title !== p.title) { p.title = title; await safe(() => S.store.patchPaper(id, { title })); }
      renderLibrary();
    };
    f.onsubmit = (e) => { e.preventDefault(); done(); };
    input.onblur = done;
    input.onkeydown = (e) => { if (e.key === "Escape") { S.renaming = null; renderLibrary(); } };
  });
  app.querySelectorAll("[data-finish]").forEach((b) => b.onclick = async () => {
    const p = S.papers.find((x) => x.id === b.dataset.finish);
    const finished = paperStatus(p) !== "done";
    p.finished = finished; if (!finished && p.progress >= 0.96) p.progress = 0.9;
    renderLibrary();
    await safe(() => S.store.patchPaper(p.id, { finished, progress: p.progress || 0 }));
  });
  app.querySelectorAll("[data-del]").forEach((b) => b.onclick = () => { S.confirmDelete = b.dataset.del; renderLibrary(); });
  app.querySelectorAll("[data-del-no]").forEach((b) => b.onclick = () => { S.confirmDelete = null; renderLibrary(); });
  app.querySelectorAll("[data-del-yes]").forEach((b) => b.onclick = async () => {
    const id = b.dataset.delYes; S.confirmDelete = null;
    const p = S.papers.find((x) => x.id === id);
    S.papers = S.papers.filter((x) => x.id !== id);
    renderLibrary();
    await safe(() => S.store.deletePaper(id), "Couldn't remove that paper. Try again.");
    idb.del(id);
    if (p && p.pdfAssetId && assetsCap) assetsCap.delete(p.pdfAssetId).catch(() => {});
    toast("Removed from your library");
  });
  const drop = $("#drop");
  if (drop && !S.importing) {
    drop.ondragover = (e) => { if (![...e.dataTransfer.types].includes("Files")) return; e.preventDefault(); drop.classList.add("over"); };
    drop.ondragleave = () => drop.classList.remove("over");
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove("over"); const f = e.dataTransfer.files[0]; if (f) importFile(f); };
  }
}

$("#file-input").onchange = (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) importFile(f); };

function setImport(label, pct) {
  S.importing = label ? { label, pct } : null;
  if (S.view !== "library") return;
  const bar = $(".importing .bar i"), lab = $(".importing span");
  if (S.importing && bar && lab) { bar.style.width = Math.round(pct * 100) + "%"; lab.textContent = label; }
  else renderLibrary();
}

async function importFile(file) {
  if (!/pdf/i.test(file.type) && !/\.pdf$/i.test(file.name)) { toast("That file isn't a PDF. For other formats, use Paste text."); return; }
  if (S.importing) return;
  setImport(`Reading ${file.name}`, 0.02);
  try {
    const buf = await file.arrayBuffer();
    const fixedFonts = fixPdfBytes(new Uint8Array(buf));
    const pdfBlob = new Blob([buf.slice(0)], { type: "application/pdf" });
    const uploadFile = fixedFonts ? new File([pdfBlob], file.name, { type: "application/pdf" }) : file;
    const { blocks, numPages } = await parsePdf(new Uint8Array(buf.slice(0)), (pct) => setImport(`Reading ${file.name}`, 0.05 + pct * 0.8));
    const words = blocks.reduce((n, b) => n + b.x.split(/\s+/).length, 0);
    if (words < 40) throw new Error("This PDF has almost no selectable text, so it may be a scanned image. Paste the text instead.");
    if (blocks[0]?.t !== "t") blocks.unshift({ t: "t", x: file.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " "), p: 1 });
    const meta = { id: uid(), title: blocks[0].x.slice(0, 240), source: "pdf", pages: numPages, words, addedAt: Date.now(), progress: 0, hlCount: 0, qCount: 0, folderId: currentFolderId() };
    await idb.put(meta.id, pdfBlob);
    setImport("Saving to your library", 0.9);
    if (assetsCap && file.size < 49.5 * 1024 * 1024) {
      try { const up = await assetsCap.upload(uploadFile, { type: "application/pdf" }); meta.pdfAssetId = up.id; meta.pdfUrl = up.url; } catch (e) { console.warn("PDF original not stored", e); }
    }
    await S.store.putPaper(meta, blocks);
    S.papers.push(meta);
    setImport(null);
    toast(`Added “${meta.title.slice(0, 60)}”`);
    openPaper(meta.id);
  } catch (e) {
    console.error(e);
    setImport(null);
    toast(e && e.message && !/^\w+Exception/.test(e.name || "") && e.message.length < 200 ? e.message : "Couldn't read that PDF. Try another file, or paste the text instead.");
  }
}

async function addPlainPaper(title, text, source) {
  const blocks = blocksFromPlainText(text, title);
  if (!blocks.length) { toast("Paste some text first."); return; }
  const words = blocks.reduce((n, b) => n + b.x.split(/\s+/).length, 0);
  const meta = { id: uid(), title: (title || blocks[0].x).slice(0, 240), source, words, addedAt: Date.now(), progress: 0, hlCount: 0, qCount: 0, folderId: currentFolderId() };
  const ok = await safe(async () => { await S.store.putPaper(meta, blocks); return true; }, "Couldn't save that paper. Try again.");
  if (!ok) return;
  S.papers.push(meta);
  openPaper(meta.id);
}
function addSample() { addPlainPaper(SAMPLE.title, SAMPLE.text, "sample"); }

function openPasteDialog() {
  const ov = document.createElement("div");
  ov.className = "overlay";
  ov.innerHTML = `<form class="dialog" id="paste-form">
    <h2>Paste a paper</h2>
    <label>Title<input id="paste-title" placeholder="e.g. Attention Is All You Need" autocomplete="off"></label>
    <label>Text<textarea id="paste-text" placeholder="Paste the paper's text. Leave a blank line between paragraphs."></textarea></label>
    <div class="row"><button type="button" class="btn ghost" id="paste-cancel">Cancel</button><button class="btn primary">Add to library</button></div>
  </form>`;
  document.body.appendChild(ov);
  $("#paste-title").focus();
  const close = () => ov.remove();
  $("#paste-cancel").onclick = close;
  ov.onclick = (e) => { if (e.target === ov) close(); };
  ov.onkeydown = (e) => { if (e.key === "Escape") close(); };
  $("#paste-form").onsubmit = (e) => {
    e.preventDefault();
    const text = $("#paste-text").value.trim();
    if (text.split(/\s+/).length < 20) { toast("Paste a bit more text so there is something to read."); return; }
    const title = $("#paste-title").value.trim();
    close();
    addPlainPaper(title, text, "text");
  };
}

/* ---------------- reader ---------------- */
let scrollSaveT, readerAbort = null;

async function openPaper(id) {
  const meta = S.papers.find((p) => p.id === id);
  if (!meta) return;
  S.view = "reader";
  S.paper = meta; S.activeId = null; S.pending = null; S.askErr = ""; S.confirmDeleteHl = false; S.mode = "read";
  $("#app").innerHTML = `<div class="loading">Opening “${esc(meta.title.slice(0, 80))}”…</div>`;
  const [blocks, hls] = await Promise.all([
    safe(() => S.store.getContent(id), "Couldn't open that paper. Try again."),
    safe(() => S.store.listHighlights(id), " "),
  ]);
  if (!blocks) { renderLibrary(); return; }
  S.blocks = blocks;
  S.starts = [];
  let off = 0;
  for (const b of blocks) { S.starts.push(off); off += b.x.length + 2; }
  S.fullText = blocks.map((b) => b.x).join("\n\n");
  S.marks = (hls || []).filter((h) => h && h.kind === "mark").map((m) => ({ ...m, note: m.note || "", color: m.color || "yellow", saved: true }));
  S.activeMark = null;
  const loaded = (hls || []).filter((h) => h && h.kind !== "mark").map((h) => ({ ...h, thread: (h.thread || []).filter((e) => e && e.a), saved: true }));
  S.highlights = loaded.filter(asked);
  const empty = loaded.filter((h) => !asked(h));
  if (empty.length) Promise.all(empty.map((h) => S.store.deleteHighlight(id, h.id))).then(() => syncCounts()).catch(() => {});
  bookAnchor = S.starts[meta.lastBlock || 0] || 0;
  renderReader();
  if (lsGet("marginalia.view") === "book") setMode("book");
  meta.lastOpenedAt = Date.now();
  safe(() => S.store.patchPaper(id, { lastOpenedAt: meta.lastOpenedAt }), " ");
  recordActivity();
}

function blockHTML(i) {
  const b = S.blocks[i];
  const s0 = S.starts[i], e0 = s0 + b.x.length;
  const hs = shownHl().filter((h) => h.start != null && h.start < e0 && h.end > s0);
  const ms = S.marks.filter((m) => m.start != null && m.start < e0 && m.end > s0);
  let inner;
  if (!hs.length && !ms.length) inner = esc(b.x);
  else {
    const cuts = new Set([0, b.x.length]);
    [...hs, ...ms].forEach((h) => { cuts.add(Math.max(0, h.start - s0)); cuts.add(Math.min(b.x.length, h.end - s0)); });
    const pts = [...cuts].sort((a, c) => a - c);
    inner = "";
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], c = pts[k + 1];
      let seg = esc(b.x.slice(a, c));
      const cover = hs.filter((h) => h.start - s0 <= a && h.end - s0 >= c);
      if (cover.length) {
        const h = cover.find((x) => x.id === S.activeId) || cover.sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0))[0];
        seg = `<mark class="hl ${h.thread.length ? "q" : ""} ${h.id === S.activeId ? "on" : ""}" data-h="${h.id}">${seg}</mark>`;
      }
      const mc = ms.filter((m) => m.start - s0 <= a && m.end - s0 >= c);
      if (mc.length) {
        const m = mc.find((x) => x.id === S.activeMark) || mc.sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0))[0];
        seg = `<span class="um um-${m.color} ${m.id === S.activeMark ? "on" : ""}" data-m="${m.id}">${seg}</span>`;
      }
      inner += seg;
    }
  }
  const tag = b.t === "t" ? "h1" : b.t === "h" ? "h2" : "p";
  const cls = b.t === "t" ? "ptitle" : b.t === "h" ? "sec" : "";
  return `<${tag} class="blk ${cls}" data-i="${i}">${inner}</${tag}>`;
}

const asked = (h) => h.thread.some((e) => e.a && !e.error && !e.pending);
const shownHl = () => S.highlights.filter((h) => asked(h) || h.id === S.activeId || h.asking);
const normMap = (str) => {
  let out = ""; const map = [];
  for (let i = 0; i < str.length; i++) {
    const c = str[i].normalize("NFKC").toLowerCase();
    for (const ch of c) if (/[\p{L}\p{N}]/u.test(ch)) { out += ch; map.push(i); }
  }
  return { out, map };
};
let fullNorm = null, fullNormFor = null;
function findInFull(quote) {
  if (fullNormFor !== S.fullText) { fullNorm = normMap(S.fullText); fullNormFor = S.fullText; }
  const q = normMap(quote).out;
  if (q.length < 3) return null;
  let i = fullNorm.out.indexOf(q), len = q.length;
  if (i < 0 && q.length > 40) { i = fullNorm.out.indexOf(q.slice(0, 40)); len = Math.min(q.length, fullNorm.out.length - i); }
  if (i < 0) return null;
  return { start: fullNorm.map[i], end: fullNorm.map[Math.min(i + len, fullNorm.map.length) - 1] + 1 };
}
function pageOfOffset(pos) {
  if (pos == null) return null;
  let pg = null;
  for (let i = 0; i < S.blocks.length && S.starts[i] <= pos; i++) if (S.blocks[i].p) pg = S.blocks[i].p;
  return pg || 1;
}
function pageStart(pg) { const i = S.blocks.findIndex((b) => b.p === pg); return i >= 0 ? S.starts[i] : 0; }
function pageText(pg) {
  const t = S.blocks.filter((b) => b.p && Math.abs(b.p - pg) <= 1).map((b) => b.x).join("\n\n");
  return t.slice(0, 12000) || S.fullText.slice(0, 6000);
}
function rectsFromRange(range, pageEl) {
  const pb = pageEl.getBoundingClientRect();
  const raw = [...range.getClientRects()]
    .filter((r) => r.width > 1 && r.height > 1 && r.top >= pb.top - 2 && r.bottom <= pb.bottom + 2 && r.width < pb.width * 0.98)
    .map((r) => ({ l: r.left, r: r.right, t: r.top, b: r.bottom }))
    .sort((a, b) => (a.t + a.b) - (b.t + b.b) || a.l - b.l);
  // join the pieces of each printed line into one even band, so a sentence highlights as one solid strip
  const lines = [];
  for (const r of raw) {
    const mid = (r.t + r.b) / 2, h = r.b - r.t;
    const line = lines.find((L) => Math.abs((L.t + L.b) / 2 - mid) < Math.max(3, Math.min(L.b - L.t, h) * 0.5) && r.l <= L.r + Math.max(24, h * 2.5) && r.r >= L.l - Math.max(24, h * 2.5));
    if (line) { line.l = Math.min(line.l, r.l); line.r = Math.max(line.r, r.r); line.t = Math.min(line.t, r.t); line.b = Math.max(line.b, r.b); }
    else lines.push({ ...r });
  }
  return lines.slice(0, 200).map((L) => {
    const pad = (L.b - L.t) * 0.12;
    return [(L.l - pb.left - 1) / pb.width, (L.t - pad - pb.top) / pb.height, (L.r - L.l + 2) / pb.width, (L.b - L.t + 2 * pad) / pb.height].map((v) => +v.toFixed(4));
  });
}
function locateInLayer(tl, quote) {
  const walker = document.createTreeWalker(tl, NodeFilter.SHOW_TEXT);
  let n, out = ""; const map = [];
  while ((n = walker.nextNode())) {
    const t = n.nodeValue;
    for (let i = 0; i < t.length; i++) {
      for (const ch of t[i].normalize("NFKC").toLowerCase()) if (/[\p{L}\p{N}]/u.test(ch)) { out += ch; map.push([n, i]); }
    }
  }
  const full = normMap(quote).out;
  const q = full.slice(0, 300);
  if (q.length < 3) return null;
  const i = out.indexOf(q);
  if (i < 0) return null;
  // extend past the first 300 characters for as long as the page keeps matching
  let len = q.length;
  while (len < full.length && i + len < out.length && out[i + len] === full[len]) len++;
  const a = map[i], b = map[i + len - 1];
  const r = document.createRange();
  r.setStart(a[0], a[1]); r.setEnd(b[0], b[1] + 1);
  return r;
}
const PIN_SVG = `<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M3 2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H8.4L5 14.6V12H3a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/></svg>`;
function renderPdfMarks() {
  if (S.mode !== "pdf") return;
  document.querySelectorAll("#pdf-view .pdf-page").forEach((pageEl) => {
    const n = +pageEl.dataset.n, tl = pageEl.querySelector(".textLayer");
    let layer = pageEl.querySelector(".hl-layer");
    if (!layer) { layer = document.createElement("div"); layer.className = "hl-layer"; pageEl.appendChild(layer); }
    let html = "", lastTop = -1;
    const items = [];
    for (const h of S.highlights) {
      if (!(asked(h) || h.id === S.activeId || h.asking)) continue;
      if (h.page == null) {
        // asked in Reading view: find the same words on this page
        const pg = pageOfOffset(h.start);
        if (!tl || pg == null || Math.abs(pg - n) > 1) continue;
        const r = locateInLayer(tl, h.quote);
        if (!r) continue;
        h.page = n; h.rects = rectsFromRange(r, pageEl);
      }
      if (h.page !== n) continue;
      if (!h.rects || !h.rects.length) {
        const r = tl && locateInLayer(tl, h.quote);
        if (!r) continue;
        h.rects = rectsFromRange(r, pageEl);
      }
      items.push(h);
    }
    items.sort((a, b) => a.rects[0][1] - b.rects[0][1]);
    for (const h of items) {
      const on = h.id === S.activeId;
      const cnt = h.thread.filter((e) => e.a && !e.error && !e.pending).length;
      if (on) html += h.rects.map(([x, y, w, hh]) => `<i class="hl-rect" style="left:${x * 100}%;top:${y * 100}%;width:${w * 100}%;height:${hh * 100}%"></i>`).join("");
      if (cnt || h.asking) {
        const top = Math.max(h.rects[0][1] * pageEl.clientHeight - 3, lastTop + 30); lastTop = top;
        html += `<button class="pin ppin ${on ? "on" : ""}" data-pin="${h.id}" style="top:${top}px" title="${cnt ? plural(cnt, "question") + " on this text" : "Asking Claude…"}" aria-label="Open notes">${PIN_SVG}${cnt || "…"}</button>`;
      }
    }
    html += pdfUserMarks(pageEl, n, tl);
    layer.innerHTML = html;
  });
}
function pdfUserMarks(pageEl, n, tl) {
  let html = "", lastTop = -100;
  const items = [];
  for (const m of S.marks) {
    if (m.page == null) {
      const pg = m.start != null ? pageOfOffset(m.start) : null;
      if (!tl || pg == null || Math.abs(pg - n) > 1) continue;
      const r = locateInLayer(tl, m.quote);
      if (!r) continue;
      m.page = n; m.rects = rectsFromRange(r, pageEl);
    }
    if (m.page !== n) continue;
    if (!m.rects || !m.rects.length) {
      const r = tl && locateInLayer(tl, m.quote);
      if (!r) continue;
      m.rects = rectsFromRange(r, pageEl);
    }
    items.push(m);
  }
  items.sort((a, b) => a.rects[0][1] - b.rects[0][1]);
  for (const m of items) {
    html += m.rects.map(([x, y, w, hh]) => `<i class="um-rect um-${m.color} ${m.id === S.activeMark ? "on" : ""}" style="left:${x * 100}%;top:${y * 100}%;width:${w * 100}%;height:${hh * 100}%"></i>`).join("");
    const top = Math.max(m.rects[0][1] * pageEl.clientHeight - 3, lastTop + 26); lastTop = top;
    html += `<button class="pin npin ppin-l ${m.id === S.activeMark ? "on" : ""}" data-mark="${m.id}" style="top:${top}px" title="${m.note.trim() ? "Your note" : "Your highlight"}" aria-label="${m.note.trim() ? "Open your note" : "Open your highlight"}">${m.note.trim() ? NOTE_SVG : HL_SVG}</button>`;
  }
  return html;
}
const NOTE_SVG = `<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M11.3 1.3a1 1 0 0 1 1.4 0l2 2a1 1 0 0 1 0 1.4L6 13.4 2 14l.6-4 8.7-8.7z"/></svg>`;
const HL_SVG = `<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M2 13h12v2H2zM9.6 1.4l3 3L7 10H4V7z"/></svg>`;
const markById = (id) => S.marks.find((m) => m.id === id);
function renderNotePins(body) {
  let layer = $("#npins", body);
  if (!layer) { layer = document.createElement("div"); layer.id = "npins"; layer.className = "npins"; body.appendChild(layer); }
  const items = [];
  for (const m of S.marks) {
    if (!m.note.trim()) continue;
    const el = body.querySelector(`.um[data-m="${m.id}"]`);
    if (el) items.push({ m, top: el.offsetTop });
  }
  items.sort((a, b) => a.top - b.top);
  let last = -100;
  layer.innerHTML = items.map(({ m, top }) => {
    const t = Math.max(top - 1, last + 28); last = t;
    return `<button class="pin npin ${m.id === S.activeMark ? "on" : ""}" style="top:${t}px" data-mark="${m.id}" title="Your note" aria-label="Open your note">${NOTE_SVG}</button>`;
  }).join("");
}

function renderPins() {
  renderPdfMarks();
  const body = $("#body-text");
  if (!body) return;
  if (S.mode === "book") { renderBookPins(); return; }
  renderNotePins(body);
  let layer = $("#pins", body);
  if (!layer) { layer = document.createElement("div"); layer.id = "pins"; layer.className = "pins"; layer.setAttribute("aria-label", "Notes"); body.appendChild(layer); }
  const items = [];
  for (const h of S.highlights) {
    const n = h.thread.filter((e) => e.a && !e.error && !e.pending).length;
    if (!n && !h.asking) continue;
    const m = body.querySelector(`mark.hl[data-h="${h.id}"]`);
    if (!m) continue;
    items.push({ h, n, top: m.offsetTop });
  }
  items.sort((a, b) => a.top - b.top);
  let last = -100;
  layer.innerHTML = items.map(({ h, n, top }) => {
    const t = Math.max(top - 1, last + 30); last = t;
    return `<button class="pin ${h.id === S.activeId ? "on" : ""}" style="top:${t}px" data-pin="${h.id}" title="${n ? plural(n, "question") + " on this passage" : "Asking Claude…"}" aria-label="Open notes: ${n ? plural(n, "question") : "asking"}"><svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M3 2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H8.4L5 14.6V12H3a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/></svg>${n || "…"}</button>`;
  }).join("");
}
let pinRaf = 0;
const schedulePins = () => { if (!pinRaf) pinRaf = requestAnimationFrame(() => { pinRaf = 0; renderPins(); }); };
window.addEventListener("resize", schedulePins);
document.fonts && document.fonts.ready.then(() => { schedulePins(); if (S.mode === "book") layoutBook(bookAnchor); });

function renderBody() {
  let html = "", lastP = null;
  const canView = !!S.paper.pdfUrl;
  S.blocks.forEach((b, i) => {
    if (S.paper.source === "pdf" && b.p && b.p !== lastP && i > 0 && b.p > 1) {
      html += `<div class="pg" aria-hidden="true">Page ${b.p}</div>`;
    }
    if (b.p) lastP = b.p;
    html += blockHTML(i);
  });
  return html;
}

function rerenderBlocksFor(h) {
  if (!h) return;
  S.blocks.forEach((b, i) => {
    const s0 = S.starts[i], e0 = s0 + b.x.length;
    if (h.start < e0 && h.end > s0) {
      const el = document.querySelector(`.blk[data-i="${i}"]`);
      if (el) el.outerHTML = blockHTML(i);
    }
  });
  schedulePins();
}
function refreshAllMarks() {
  const body = $("#body-text");
  if (body) body.innerHTML = renderBody();
  schedulePins();
}

function renderReader() {
  const p = S.paper;
  $("#app").innerHTML = `
  <div class="view reader">
    <div class="topbar">
      <span style="display:flex;gap:6px"><button class="btn ghost small" id="back" aria-label="Back to library">← <span class="lbl">Library</span></button><button class="btn ghost small lib-toggle" id="lib-toggle" aria-label="Show papers">☰</button></span>
      <div class="ttl"><strong>${esc(p.title)}</strong><span id="prog-label">${Math.round((p.progress || 0) * 100)}% read</span></div>
      <div class="right">
        <div class="viewseg" role="group" aria-label="View"><button data-mode="read" aria-pressed="${S.mode === "read"}">Read<span class="long">ing</span></button><button data-mode="book" aria-pressed="${S.mode === "book"}">Book</button>${p.source === "pdf" ? `<button data-mode="pdf" aria-pressed="${S.mode === "pdf"}"><span class="long">Original </span>PDF</button>` : ""}</div>
        ${skinsHTML(true)}
        <button class="btn small notes-toggle" id="notes-toggle">Notes <span id="notes-count">${S.highlights.filter(asked).length}</span></button>
      </div>
      <div class="progress"><i id="prog-bar" style="width:${Math.round((p.progress || 0) * 100)}%"></i></div>
    </div>
    <nav class="rside" id="rside" aria-label="Your papers">${sideHTML()}</nav>
    <div class="reader-scroll" id="reader-scroll">
      <div class="sheet-wrap">
        <article class="sheet">
          <div class="hint"><i></i><span>Select a word, sentence or passage to highlight it, write your own note, or ask Claude about it.</span></div>
          <div class="book-clip" id="book-clip"><div class="body-text" id="body-text">${renderBody()}</div></div>
          <div class="book-pins" id="book-pins"></div>
          <button class="corner prev" id="corner-prev" aria-label="Previous page" tabindex="-1"></button>
          <button class="corner next" id="corner-next" aria-label="Next page" tabindex="-1"></button>
        </article>
        <button class="book-nav prev" id="book-prev" aria-label="Previous page"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <button class="book-nav next" id="book-next" aria-label="Next page"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <div class="book-folio" id="book-folio" aria-live="polite"></div>
      </div>
      <div class="pdf-view" id="pdf-view"></div>
    </div>
    <aside class="panel" id="panel" aria-label="Notes"><div class="panel-inner" id="panel-inner"></div></aside>
  </div>`;
  renderPanel();
  bindReader();
  renderPins();
  // restore position
  const sc = $("#reader-scroll");
  if (p.lastBlock) {
    const el = document.querySelector(`.blk[data-i="${p.lastBlock}"]`);
    if (el) sc.scrollTop = el.offsetTop - 80;
  }
}

function sideHTML() {
  const papers = [...S.papers].sort((a, b) => (b.lastOpenedAt || b.addedAt || 0) - (a.lastOpenedAt || a.addedAt || 0));
  const totalQ = papers.reduce((n, p) => n + (p.qCount || 0), 0);
  const wk = weekDays(), days = new Set(S.activity.days || []);
  return `
    <div class="side-brand">Margin<b>alia</b></div>
    <div class="mini-stats"><div><b>${papers.length}</b><small>Papers</small></div><div><b>${totalQ}</b><small>Asked</small></div><div><b>${wk.filter((d) => days.has(d.k)).length}</b><small>Days</small></div></div>
    <div class="side-label mono"><span>Library</span><button id="side-add">Add paper</button></div>
    ${papers.map((p) => {
      const pct = Math.round(Math.min(1, p.progress || 0) * 100);
      const st = paperStatus(p);
      return `<button class="lib-mini ${S.paper && p.id === S.paper.id ? "on" : ""}" data-side-open="${p.id}"><span class="ring" style="--p:${pct}" data-v="${pct}"></span><span><b>${esc(p.title || "Untitled paper")}</b><small>${STATUS_LABEL[st]}${p.qCount ? " · " + plural(p.qCount, "question") : ""}</small></span></button>`;
    }).join("")}`;
}

function hlById(id) { return S.highlights.find((h) => h.id === id); }

function renderPanel() {
  const inner = $("#panel-inner");
  if (!inner) return;
  $("#notes-count") && ($("#notes-count").textContent = S.highlights.filter(asked).length + S.marks.length);
  const h = S.activeId && hlById(S.activeId);
  const mk = !h && S.activeMark && markById(S.activeMark);
  if (mk) { inner.innerHTML = markPanelHTML(mk); bindMarkPanel(mk); return; }
  if (!h) {
    const posKey = (x) => (x.start != null ? x.start : x.page != null ? pageStart(x.page) : 0);
    const all = [
      ...S.highlights.filter(asked).map((x) => ({ x, t: "q" })),
      ...S.marks.map((x) => ({ x, t: "m" })),
    ].sort((a, b) => posKey(a.x) - posKey(b.x));
    const f = S.noteFilter;
    const list = all.filter((it) => f === "all" || (f === "q" ? it.t === "q" : it.t === "m"));
    const nq = all.filter((it) => it.t === "q").length, nm = all.length - nq;
    inner.innerHTML = `
      <div class="panel-head"><h2>Your notes</h2><button class="btn small close-sheet" data-close>Back to paper ✕</button></div>
      ${all.length ? `<div class="note-filter" role="group" aria-label="Show">
        <button data-nf="all" aria-pressed="${f === "all"}">All ${all.length}</button><button data-nf="q" aria-pressed="${f === "q"}">Asked Claude ${nq}</button><button data-nf="m" aria-pressed="${f === "m"}">Highlights &amp; notes ${nm}</button></div>` : ""}
      ${list.length ? `<div class="note-list">${list.map(({ x, t }) => t === "q" ? `
        <button class="note-item" data-goto="${x.id}">
          <q>${esc(x.quote)}</q>
          <small>${plural(x.thread.filter((e) => e.a && !e.error).length, "question")} · ${fmtDate(x.createdAt)}</small>
        </button>` : `
        <button class="note-item mine" data-goto-mark="${x.id}">
          <q class="uq uq-${x.color}">${esc(x.quote)}</q>
          ${x.note.trim() ? `<span class="mynote">${esc(x.note.trim().slice(0, 220))}</span>` : ""}
          <small>${x.note.trim() ? "Your note" : "Highlight"} · ${fmtDate(x.createdAt)}</small>
        </button>`).join("")}</div>` : all.length ? `<p class="notes-empty">Nothing here yet.</p>` : `
        <div class="notes-empty">
          <p>Nothing saved in this paper yet.</p>
          <ol>
            <li>Select a word, a sentence or a whole paragraph.</li>
            <li>Pick a colour to highlight it, or Add note to write your own thoughts.</li>
            <li>Or ask Claude about it. The answer is saved on that passage, with a note icon beside it.</li>
          </ol>
        </div>`}`;
  } else {
    inner.innerHTML = `
      <div class="panel-head">
        <button class="btn ghost small" data-allnotes>← All notes</button>
        <button class="btn small close-sheet" data-close>Back to paper ✕</button>
      </div>
      <blockquote class="quote">${esc(h.quote)}</blockquote>
      <div class="thread" id="thread">${h.thread.map((e, k) => qaHTML(e, k)).join("") || `<p class="notes-empty" style="margin:0">Ask your first question about this passage below.</p>`}</div>
      <form class="composer" id="composer">
        <div class="quick">${QUICK.map((q) => `<button type="button" data-quick="${esc(q.q)}">${esc(q.l)}</button>`).join("")}</div>
        <textarea id="composer-input" placeholder="${h.thread.length ? "Ask a follow-up…" : "Ask about this passage…"}" aria-label="Your question"></textarea>
        ${S.askErr ? `<p class="err" role="alert">${esc(S.askErr)}</p>` : ""}
        <div class="row"><span>Enter to send · Shift+Enter for a new line</span><button class="btn primary small" id="send" ${h.asking ? "disabled" : ""}>${h.asking ? "Waiting for answer…" : "Ask Claude"}</button></div>
      </form>
      <div class="panel-tools">
        ${S.confirmDeleteHl ? `<div class="confirm"><span>Delete this passage's questions and answers?</span><button class="btn small" data-hl-del-yes>Delete</button><button class="btn ghost small" data-hl-del-no>Keep</button></div>`
          : `${asked(h) ? `<button class="link-btn" data-hl-del>Delete these notes</button>` : "<span></span>"}<button class="link-btn" data-jump>Show in paper</button>`}
      </div>`;
  }
  bindPanel();
}

function qaHTML(e, k) {
  let body;
  if (e.error) body = `${e.a ? `<div class="answer">${md(e.a)}</div>` : ""}<div class="ask-err" role="alert"><p>${esc(e.error)}</p><div class="row2"><button class="btn small" data-retry="${k}">Try again</button><button class="btn ghost small" data-discard="${k}">Remove question</button></div></div>`;
  else if (e.pending && !e.a) body = `<div class="ask-wait"><span class="thinking">Claude is reading the passage</span><div class="row2"><small class="elapsed" data-since="${e.started || Date.now()}">Just asked</small><button class="btn ghost small" data-stop="${k}">Stop</button></div></div>`;
  else body = `<div class="answer">${md(e.a)}</div>${e.pending ? `<div class="row2" style="margin-top:6px"><button class="btn ghost small" data-stop="${k}">Stop</button></div>` : ""}`;
  return `<div class="qa" data-k="${k}">
    <div class="q"><span>${esc(e.q)}</span><span class="when">${e.at ? fmtDate(e.at) : ""}</span></div>
    ${body}
  </div>`;
}
setInterval(() => {
  document.querySelectorAll(".elapsed[data-since]").forEach((el) => {
    const s = Math.round((Date.now() - +el.dataset.since) / 1000);
    el.textContent = s < 3 ? "Just asked" : s < 12 ? `${s}s` : `${s}s · answers can take up to a minute${s > 40 ? ". If a permission box from Claude is open, allow it." : ""}`;
  });
}, 1000);

const QUICK = [
  { l: "Explain simply", q: "Explain this passage in plain language, as if I'm new to the field." },
  { l: "Define the terms", q: "Define the technical terms and symbols used in this passage." },
  { l: "Why it matters", q: "Why does this matter for the paper's main argument?" },
  { l: "Give an example", q: "Give me a concrete example that illustrates this." },
];

function openPanelSheet() {
  const was = $(".reader")?.classList.contains("notes-open");
  $("#panel")?.classList.add("open"); $(".reader")?.classList.add("notes-open");
  if (!was) setTimeout(schedulePins, 320);
}
function closePanelSheet() {
  $("#panel")?.classList.remove("open"); $(".reader")?.classList.remove("notes-open");
  if (S.activeId) setActive(null);
  if (S.activeMark) { const pm = markById(S.activeMark); S.activeMark = null; if (pm) rerenderBlocksFor(pm); renderPanel(); }
  setTimeout(schedulePins, 320);
}

function bindPanel() {
  const inner = $("#panel-inner");
  inner.querySelectorAll("[data-close]").forEach((b) => b.onclick = closePanelSheet);
  inner.querySelectorAll("[data-goto]").forEach((b) => b.onclick = () => { setActive(b.dataset.goto); jumpTo(b.dataset.goto); });
  inner.querySelectorAll("[data-goto-mark]").forEach((b) => b.onclick = () => { openMark(b.dataset.gotoMark); jumpTo(b.dataset.gotoMark); });
  inner.querySelectorAll("[data-nf]").forEach((b) => b.onclick = () => { S.noteFilter = b.dataset.nf; renderPanel(); });
  const all = inner.querySelector("[data-allnotes]"); if (all) all.onclick = () => setActive(null);
  inner.querySelectorAll("[data-quick]").forEach((b) => b.onclick = () => askActive(b.dataset.quick));
  const jump = inner.querySelector("[data-jump]"); if (jump) jump.onclick = () => jumpTo(S.activeId);
  const del = inner.querySelector("[data-hl-del]"); if (del) del.onclick = () => { S.confirmDeleteHl = true; renderPanel(); };
  const no = inner.querySelector("[data-hl-del-no]"); if (no) no.onclick = () => { S.confirmDeleteHl = false; renderPanel(); };
  const yes = inner.querySelector("[data-hl-del-yes]");
  if (yes) yes.onclick = async () => {
    const h = hlById(S.activeId);
    S.highlights = S.highlights.filter((x) => x !== h);
    S.activeId = null; S.confirmDeleteHl = false;
    rerenderBlocksFor(h); renderPanel();
    await safe(() => S.store.deleteHighlight(S.paper.id, h.id));
    syncCounts();
  };
  inner.querySelectorAll("[data-stop]").forEach((b) => b.onclick = () => { const h = hlById(S.activeId); const e = h && h.thread[+b.dataset.stop]; if (e && e.ctrl) e.ctrl.abort(); });
  inner.querySelectorAll("[data-retry]").forEach((b) => b.onclick = () => askActive(null, +b.dataset.retry));
  inner.querySelectorAll("[data-discard]").forEach((b) => b.onclick = () => { const h = hlById(S.activeId); if (!h) return; h.thread.splice(+b.dataset.discard, 1); renderPanel(); schedulePins(); });
  const form = $("#composer");
  if (form) {
    const ta = $("#composer-input");
    form.onsubmit = (e) => { e.preventDefault(); const q = ta.value.trim(); if (q) askActive(q); };
    ta.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } };
  }
}

function setActive(id) {
  if (S.activeMark) { const pm = markById(S.activeMark); S.activeMark = null; if (pm) rerenderBlocksFor(pm); schedulePins(); }
  const prev = hlById(S.activeId);
  S.activeId = id; S.askErr = ""; S.confirmDeleteHl = false;
  if (prev && prev.id !== id && !prev.asking && !asked(prev)) {
    S.highlights = S.highlights.filter((x) => x !== prev);
    if (prev.saved) safe(() => S.store.deleteHighlight(S.paper.id, prev.id), " ");
  }
  if (prev) rerenderBlocksFor(prev);
  if (id) { rerenderBlocksFor(hlById(id)); openPanelSheet(); }
  renderPanel();
  const th = $("#panel"); if (th) th.scrollTop = 0;
}

function jumpTo(id) {
  if (S.mode === "pdf") {
    const h = hlById(id) || markById(id), pg = h && (h.page ?? pageOfOffset(h.start));
    const el = document.querySelector(`#pdf-view .pdf-page[data-n="${pg}"]`);
    if (el) $("#reader-scroll").scrollTo({ top: el.offsetTop + (h.rects ? h.rects[0][1] * el.clientHeight : 0) - 140, behavior: "smooth" });
    return;
  }
  const sel = `mark.hl[data-h="${id}"], .um[data-m="${id}"]`;
  const el = document.querySelector(sel);
  if (!el) return;
  if (S.mode === "book") {
    const col = colOf(el);
    if (col != null) goSpread(Math.floor(col / B.per));
    document.querySelectorAll(sel).forEach((m) => { m.classList.remove("flash"); void m.offsetWidth; m.classList.add("flash"); });
    if (matchMedia("(max-width: 860px)").matches) { $("#panel")?.classList.remove("open"); $(".reader")?.classList.remove("notes-open"); }
    return;
  }
  el.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  document.querySelectorAll(sel).forEach((m) => { m.classList.remove("flash"); void m.offsetWidth; m.classList.add("flash"); });
  if (matchMedia("(max-width: 860px)").matches) { $("#panel")?.classList.remove("open"); $(".reader")?.classList.remove("notes-open"); }
}

function bindReader() {
  $("#back").onclick = () => leaveReader();
  document.querySelectorAll("[data-mode]").forEach((b) => b.onclick = () => setMode(b.dataset.mode));
  $("#lib-toggle").onclick = () => $("#rside").classList.toggle("open");
  $("#side-add").onclick = () => { $("#file-input").click(); leaveReader(); };
  document.querySelectorAll("[data-side-open]").forEach((b) => b.onclick = async () => {
    const id = b.dataset.sideOpen;
    if (S.paper && id === S.paper.id) { $("#rside").classList.remove("open"); return; }
    if (readerAbort) readerAbort.abort();
    hidePop();
    flushProgress();
    openPaper(id);
  });
  $("#notes-toggle").onclick = () => { $("#panel").classList.contains("open") ? closePanelSheet() : openPanelSheet(); };
  const sc = $("#reader-scroll");
  sc.addEventListener("scroll", onReaderScroll, { passive: true });
  sc.addEventListener("scroll", () => { if (S.pending) positionPop(); }, { passive: true });
  const body = $("#body-text");
  body.addEventListener("click", (e) => {
    const pin = e.target.closest("[data-pin]");
    if (pin) { hidePop(); setActive(pin.dataset.pin); return; }
    const pgBtn = e.target.closest("[data-page]");
    if (pgBtn) { viewPage(+pgBtn.dataset.page); return; }
    const mp = e.target.closest("[data-mark]");
    if (mp) { hidePop(); openMark(mp.dataset.mark); return; }
    const sel = getSelection();
    if (sel && !sel.isCollapsed) return;
    const um = e.target.closest(".um");
    if (um) { hidePop(); openMark(um.dataset.m); }
  });
  body.addEventListener("mouseup", () => setTimeout(checkSelection, 0));
  const pv = $("#pdf-view");
  pv.addEventListener("mouseup", () => setTimeout(checkSelection, 0));
  pv.addEventListener("click", (e) => {
    const pin = e.target.closest("[data-pin]");
    if (pin) { hidePop(); setActive(pin.dataset.pin); }
    const mp = e.target.closest("[data-mark]");
    if (mp) { hidePop(); openMark(mp.dataset.mark); }
  });
  body.addEventListener("keyup", (e) => { if (e.shiftKey) checkSelection(); });
  $("#book-prev").onclick = () => flip(-1);
  $("#book-next").onclick = () => flip(1);
  $("#corner-prev").onclick = () => flip(-1);
  $("#corner-next").onclick = () => flip(1);
  $("#book-pins").addEventListener("click", (e) => { const pin = e.target.closest("[data-pin]"); if (pin) { hidePop(); setActive(pin.dataset.pin); } const mp = e.target.closest("[data-mark]"); if (mp) { hidePop(); openMark(mp.dataset.mark); } });
  const sheet = $(".sheet");
  let tx = null;
  sheet.addEventListener("touchstart", (e) => { if (S.mode === "book" && e.touches.length === 1) tx = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() }; }, { passive: true });
  sheet.addEventListener("touchend", (e) => {
    if (!tx || S.mode !== "book") return;
    const t = e.changedTouches[0], dx = t.clientX - tx.x, dy = t.clientY - tx.y, dt = Date.now() - tx.t; tx = null;
    const sel = getSelection();
    if (Math.abs(dx) > 50 && Math.abs(dx) > 2 * Math.abs(dy) && dt < 600 && (!sel || sel.isCollapsed)) flip(dx < 0 ? 1 : -1);
  }, { passive: true });
  if (bookResize) { bookResize.disconnect(); bookResize.observe(sc); }
}

let selT;
document.addEventListener("selectionchange", () => {
  if (S.view !== "reader") return;
  clearTimeout(selT);
  selT = setTimeout(checkSelection, matchMedia("(pointer: coarse)").matches ? 450 : 700);
});
document.addEventListener("mousedown", (e) => {
  const pop = $("#pop");
  if (pop && !pop.contains(e.target) && !e.target.closest("#body-text") && !e.target.closest("#pdf-view")) hidePop();
});
document.addEventListener("keydown", (e) => {
  if (S.view === "reader" && S.mode === "book" && !e.target.closest?.("input, textarea, [contenteditable], .overlay, .pop")) {
    const k = e.key;
    if (k === "ArrowRight" || k === "PageDown" || (k === " " && !e.shiftKey)) { e.preventDefault(); flip(1); return; }
    if (k === "ArrowLeft" || k === "PageUp" || (k === " " && e.shiftKey)) { e.preventDefault(); flip(-1); return; }
  }
  if (e.key !== "Escape") return;
  if ($("#pop")) { hidePop(); return; }
  if (S.view === "reader" && $(".reader.notes-open") && !e.target.closest?.(".overlay")) closePanelSheet();
});

function blkFrom(node, offset) {
  // returns [blockEl, node, offset] normalized into a text block
  let el = node.nodeType === 1 ? node : node.parentElement;
  let blk = el && el.closest(".blk");
  if (blk) return { blk, node, offset };
  // selection boundary sits on a container or a page marker: move to the nearest block
  let start = node.nodeType === 1 && node.childNodes[offset] ? node.childNodes[offset] : el;
  while (start && !(start.classList && start.classList.contains("blk"))) {
    const next = start.nextElementSibling;
    if (next) start = next;
    else start = start.parentElement && start.parentElement.id !== "body-text" ? start.parentElement.nextElementSibling : null;
  }
  if (!start) return null;
  return { blk: start, node: start, offset: 0 };
}
function posOf(node, offset) {
  const r = blkFrom(node, offset);
  if (!r) return null;
  const i = +r.blk.dataset.i;
  const range = document.createRange();
  range.setStart(r.blk, 0);
  try { range.setEnd(r.node, r.offset); } catch { return null; }
  return S.starts[i] + range.toString().length;
}

function checkPdfSelection() {
  const pop = $("#pop");
  const sel = getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { if (S.pending && !(pop && pop.matches(":hover"))) hidePop(); return; }
  const r = sel.getRangeAt(0);
  const startEl = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
  const pageEl = startEl && startEl.closest(".pdf-page");
  if (!pageEl || !$("#pdf-view").contains(pageEl)) return;
  const quote = sel.toString().replace(/\s+/g, " ").trim();
  if (quote.length < 2) return;
  const rects = rectsFromRange(r, pageEl);
  S.pending = { pdf: true, page: +pageEl.dataset.n, quote, rects };
  S.pendingRange = r.cloneRange();
  showPop();
}

function checkSelection() {
  if (S.view !== "reader") return;
  const pop = $("#pop");
  if (pop && pop.contains(document.activeElement)) return;
  if (S.mode === "pdf") { checkPdfSelection(); return; }
  const sel = getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { if (S.pending && !(pop && pop.matches(":hover"))) hidePop(); return; }
  const r = sel.getRangeAt(0);
  const body = $("#body-text");
  if (!body || !body.contains(r.commonAncestorContainer)) return;
  let a = posOf(r.startContainer, r.startOffset), b = posOf(r.endContainer, r.endOffset);
  if (a == null || b == null) return;
  if (b < a) [a, b] = [b, a];
  const raw = S.fullText.slice(a, b);
  const lead = raw.length - raw.trimStart().length;
  const trail = raw.length - raw.trimEnd().length;
  a += lead; b -= trail;
  // snap partial words to whole words
  const wc = /[\p{L}\p{N}_'’-]/u;
  while (a > 0 && wc.test(S.fullText[a - 1]) && wc.test(S.fullText[a])) a--;
  while (b < S.fullText.length && wc.test(S.fullText[b]) && wc.test(S.fullText[b - 1])) b++;
  if (b - a < 2) return;
  S.pending = { start: a, end: b, quote: S.fullText.slice(a, b).replace(/\n\n/g, "\n"), rect: r.getBoundingClientRect() };
  S.pendingRange = r.cloneRange();
  showPop();
}

function showPop() {
  let pop = $("#pop");
  if (!pop) {
    pop = document.createElement("div");
    pop.id = "pop"; pop.className = "pop"; pop.setAttribute("role", "dialog"); pop.setAttribute("aria-label", "Ask about the selection");
    pop.innerHTML = `
      <div class="mk-row"><span class="mk-label">Highlight</span>${COLORS.map((c) => `<button type="button" class="swatch" data-color="${c.k}" title="${c.n} highlight" aria-label="Highlight in ${c.n.toLowerCase()}"></button>`).join("")}<button type="button" class="mk-erase" data-erase hidden title="Remove the highlight from the selected text">${ERASE_SVG}<span>Unhighlight</span></button><button type="button" class="mk-note" data-note>${NOTE_SVG}<span>Add note</span></button></div>
      <div class="mk-sep"><span>or ask Claude</span></div>
      <div class="quick">${QUICK.map((q) => `<button type="button" data-q="${esc(q.q)}">${esc(q.l)}</button>`).join("")}</div>
      <form id="pop-form"><input id="pop-input" placeholder="Ask your own question…" autocomplete="off" aria-label="Your question"><button class="btn primary small">Ask</button></form>
      <div class="foot"><span id="pop-len"></span></div>`;
    document.body.appendChild(pop);
    pop.querySelectorAll("[data-q]").forEach((b) => b.onclick = () => createFromPending(b.dataset.q));
    pop.querySelectorAll("[data-color]").forEach((b) => b.onclick = () => createMark(b.dataset.color, false));
    pop.querySelector("[data-note]").onclick = () => createMark(null, true);
    pop.querySelector("[data-erase]").onclick = () => eraseSelection();
    $("#pop-form").onsubmit = (e) => { e.preventDefault(); const q = $("#pop-input").value.trim(); createFromPending(q || QUICK[0].q); };
    pop.addEventListener("mousedown", (e) => { if (e.target.tagName !== "INPUT") e.preventDefault(); });
  }
  const words = S.pending.quote.split(/\s+/).filter(Boolean).length;
  const er = pop.querySelector("[data-erase]"); if (er) er.hidden = !marksUnder(S.pending).length;
  $("#pop-len").textContent = `${plural(words, "word")} selected`;
  positionPop();
}
function positionPop() {
  const pop = $("#pop");
  if (!pop || !S.pendingRange) return;
  if (matchMedia("(max-width: 560px)").matches) { pop.style.left = ""; pop.style.top = ""; return; }
  const rects = S.pendingRange.getClientRects();
  const last = rects[rects.length - 1] || S.pendingRange.getBoundingClientRect();
  const w = pop.offsetWidth, h = pop.offsetHeight;
  let left = Math.min(Math.max(16, last.right - w / 2), innerWidth - w - 16);
  let top = last.bottom + 10;
  if (top + h > innerHeight - 16) { const first = rects[0] || last; top = Math.max(16, first.top - h - 10); }
  pop.style.left = left + "px"; pop.style.top = top + "px";
}
function hidePop() {
  $("#pop")?.remove();
  S.pending = null; S.pendingRange = null;
}

/* ---------------- your own highlights and notes ---------------- */
const COLORS = [
  { k: "yellow", n: "Yellow" },
  { k: "green", n: "Green" },
  { k: "blue", n: "Blue" },
  { k: "pink", n: "Pink" },
];
function markClean(m) {
  return { id: m.id, kind: "mark", start: m.start ?? null, end: m.end ?? null, page: m.page ?? null, rects: m.rects || null, quote: m.quote, createdAt: m.createdAt, color: m.color, note: m.note || "" };
}
function saveMark(m, paper = S.paper) {
  if (!paper) return Promise.resolve();
  return safe(() => S.store.putHighlight(paper.id, markClean(m)), "Couldn't save your highlight. Try again.");
}
const ERASE_SVG = `<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M9.2 1.6a1.5 1.5 0 0 1 2.1 0l3.1 3.1a1.5 1.5 0 0 1 0 2.1L8.2 13H14v1.5H5.6L1.6 10.5a1.5 1.5 0 0 1 0-2.1zM4.4 8.6 2.7 10.3l2.9 2.9h1.2l1.4-1.4z"/></svg>`;
function pendingRange(pd) {
  if (!pd) return null;
  if (!pd.pdf) return { start: pd.start, end: pd.end };
  const loc = findInFull(pd.quote);
  return loc ? { start: loc.start, end: loc.end } : null;
}
function marksUnder(pd) {
  const r = pendingRange(pd);
  return S.marks.filter((m) => {
    if (r && m.start != null) return m.start < r.end && m.end > r.start;
    if (pd.pdf && m.page === pd.page && m.rects && pd.rects) {
      return m.rects.some(([x, y, w, h]) => pd.rects.some(([x2, y2, w2, h2]) => x < x2 + w2 && x2 < x + w && y < y2 + h2 && y2 < y + h));
    }
    return false;
  });
}
function trimPiece(a, b) {
  while (a < b && /\s/.test(S.fullText[a])) a++;
  while (b > a && /\s/.test(S.fullText[b - 1])) b--;
  return b - a >= 2 ? [a, b] : null;
}
async function eraseSelection() {
  const pd = S.pending;
  if (!pd) return;
  const hit = marksUnder(pd);
  hidePop();
  getSelection()?.removeAllRanges();
  if (!hit.length) return;
  const r = pendingRange(pd);
  const paper = S.paper;
  const before = hit.map((m) => ({ ...m, rects: m.rects ? m.rects.map((x) => [...x]) : null }));
  const added = [];
  for (const m of hit) {
    S.marks = S.marks.filter((x) => x !== m);
    if (S.activeMark === m.id) S.activeMark = null;
    let keep = [];
    if (r && m.start != null) {
      const left = m.start < r.start ? trimPiece(m.start, r.start) : null;
      const right = r.end < m.end ? trimPiece(r.end, m.end) : null;
      keep = [left, right].filter(Boolean);
    }
    keep.forEach(([a, b], k) => {
      const piece = { ...m, id: k === 0 ? m.id : uid(), start: a, end: b, page: null, rects: null, quote: S.fullText.slice(a, b).replace(/\n\n/g, "\n").slice(0, 4000), note: k === 0 ? m.note : "" };
      S.marks.push(piece); added.push(piece);
    });
    rerenderBlocksFor(m);
  }
  for (const m of hit) if (!added.some((x) => x.id === m.id)) safe(() => S.store.deleteHighlight(paper.id, m.id), " ");
  for (const m of added) saveMark(m, paper);
  schedulePins(); renderPanel();
  toast(hit.length > 1 ? "Highlights removed" : "Highlight removed", { label: "Undo", run: () => {
    if (S.paper !== paper) return;
    for (const m of added) { S.marks = S.marks.filter((x) => x.id !== m.id); if (!before.some((b) => b.id === m.id)) safe(() => S.store.deleteHighlight(paper.id, m.id), " "); }
    for (const m of before) { S.marks.push(m); saveMark(m, paper); rerenderBlocksFor(m); }
    schedulePins(); renderPanel();
  } });
}
function removeMarkNow(m) {
  const paper = S.paper;
  clearTimeout(markSaveT);
  S.marks = S.marks.filter((x) => x !== m);
  if (S.activeMark === m.id) S.activeMark = null;
  S.confirmDeleteHl = false;
  rerenderBlocksFor(m); schedulePins(); renderPanel();
  safe(() => S.store.deleteHighlight(paper.id, m.id), "Couldn't remove the highlight. Try again.");
  toast("Highlight removed", { label: "Undo", run: () => {
    if (S.paper !== paper) return;
    S.marks.push(m); saveMark(m, paper); rerenderBlocksFor(m); schedulePins(); renderPanel();
  } });
}

function createMark(color, withNote) {
  const pd = S.pending;
  if (!pd) return;
  hidePop();
  getSelection()?.removeAllRanges();
  let m;
  if (pd.pdf) {
    m = S.marks.find((x) => x.page === pd.page && x.quote === pd.quote);
    if (!m) {
      const loc = findInFull(pd.quote);
      m = { id: uid(), kind: "mark", start: loc ? loc.start : null, end: loc ? loc.end : null, page: pd.page, rects: pd.rects, quote: pd.quote.slice(0, 4000), createdAt: Date.now(), color: color || "yellow", note: "" };
      S.marks.push(m);
    }
  } else {
    m = S.marks.find((x) => x.start === pd.start && x.end === pd.end);
    if (!m) {
      m = { id: uid(), kind: "mark", start: pd.start, end: pd.end, page: null, rects: null, quote: pd.quote.slice(0, 4000), createdAt: Date.now(), color: color || "yellow", note: "" };
      S.marks.push(m);
    }
  }
  const isNew = !m.saved;
  const prevColor = m.color;
  if (color) m.color = color;
  m.saved = true;
  saveMark(m);
  rerenderBlocksFor(m);
  schedulePins();
  if (withNote) openMark(m.id, true);
  else {
    if (!S.activeId && !S.activeMark) renderPanel();
    toast("Highlighted", { label: "Undo", run: () => {
      if (!S.marks.includes(m)) return;
      if (isNew) { S.marks = S.marks.filter((x) => x !== m); safe(() => S.store.deleteHighlight(S.paper.id, m.id), " "); }
      else { m.color = prevColor; saveMark(m); }
      rerenderBlocksFor(m); schedulePins(); renderPanel();
    } });
  }
}
function openMark(id, focusNote) {
  const m = markById(id);
  if (!m) return;
  if (S.activeId) setActive(null);
  const prev = S.activeMark && markById(S.activeMark);
  S.activeMark = id; S.confirmDeleteHl = false;
  if (prev && prev !== m) rerenderBlocksFor(prev);
  rerenderBlocksFor(m);
  openPanelSheet();
  renderPanel();
  schedulePins();
  const th = $("#panel"); if (th) th.scrollTop = 0;
  if (focusNote) setTimeout(() => $("#mark-note")?.focus(), 60);
}
function markPanelHTML(m) {
  return `
    <div class="panel-head">
      <button class="btn ghost small" data-allnotes>← All notes</button>
      <button class="btn small close-sheet" data-close>Back to paper ✕</button>
    </div>
    <blockquote class="quote uq uq-${m.color}" id="mark-quote">${esc(m.quote)}</blockquote>
    <div class="mk-colors" role="group" aria-label="Highlight colour"><span>Colour</span>${COLORS.map((c) => `<button type="button" class="swatch" data-set-color="${c.k}" aria-pressed="${m.color === c.k}" title="${c.n}" aria-label="${c.n}"></button>`).join("")}</div>
    <label class="mk-notebox"><span>Your note</span>
      <textarea id="mark-note" placeholder="Write your own thoughts, a summary, or a reminder about this passage…">${esc(m.note)}</textarea>
    </label>
    <small class="mk-saved" id="mark-saved">${m.note ? "Saved" : "Notes save as you type"}</small>
    <div class="panel-tools">
      ${S.confirmDeleteHl ? `<div class="confirm"><span>Remove this highlight${m.note ? " and your note" : ""}?</span><button class="btn small" data-mark-del-yes>Remove</button><button class="btn ghost small" data-mark-del-no>Keep</button></div>`
        : `<button class="link-btn" data-mark-del>Remove highlight${m.note.trim() ? " and note" : ""}</button><button class="link-btn" data-mark-ask>Ask Claude about this</button><button class="link-btn" data-mark-jump>Show in paper</button>`}
    </div>`;
}
let markSaveT = null;
function bindMarkPanel(m) {
  const inner = $("#panel-inner");
  inner.querySelectorAll("[data-close]").forEach((b) => b.onclick = closePanelSheet);
  inner.querySelector("[data-allnotes]").onclick = () => { S.activeMark = null; rerenderBlocksFor(m); schedulePins(); renderPanel(); };
  inner.querySelectorAll("[data-set-color]").forEach((b) => b.onclick = () => {
    m.color = b.dataset.setColor;
    inner.querySelectorAll("[data-set-color]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    $("#mark-quote").className = `quote uq uq-${m.color}`;
    rerenderBlocksFor(m); schedulePins();
    saveMark(m);
  });
  const ta = $("#mark-note"), saved = $("#mark-saved");
  ta.oninput = () => {
    const had = !!m.note.trim();
    m.note = ta.value;
    if (had !== !!m.note.trim()) schedulePins();
    saved.textContent = "Saving…";
    clearTimeout(markSaveT);
    const paper = S.paper;
    markSaveT = setTimeout(async () => { await saveMark(m, paper); if ($("#mark-saved") && S.activeMark === m.id) $("#mark-saved").textContent = "Saved"; }, 600);
  };
  ta.onblur = () => { if (markSaveT) { clearTimeout(markSaveT); markSaveT = null; saveMark(m); if ($("#mark-saved")) $("#mark-saved").textContent = "Saved"; } };
  const del = inner.querySelector("[data-mark-del]"); if (del) del.onclick = () => removeMarkNow(m);
  const no = inner.querySelector("[data-mark-del-no]"); if (no) no.onclick = () => { S.confirmDeleteHl = false; renderPanel(); };
  const yes = inner.querySelector("[data-mark-del-yes]");
  if (yes) yes.onclick = () => removeMarkNow(m);
  const ask = inner.querySelector("[data-mark-ask]");
  if (ask) ask.onclick = () => {
    S.activeMark = null; rerenderBlocksFor(m);
    S.pending = m.start != null ? { start: m.start, end: m.end, quote: m.quote } : { pdf: true, page: m.page, quote: m.quote, rects: m.rects };
    createFromPending(null);
  };
  const jump = inner.querySelector("[data-mark-jump]"); if (jump) jump.onclick = () => jumpTo(m.id);
}

async function createFromPending(question) {
  const pd = S.pending;
  if (!pd) return;
  hidePop();
  getSelection()?.removeAllRanges();
  // reuse an existing highlight covering exactly this text
  let h;
  if (pd.pdf) {
    h = S.highlights.find((x) => x.page === pd.page && x.quote === pd.quote);
    if (!h) {
      const loc = findInFull(pd.quote);
      h = { id: uid(), start: loc ? loc.start : null, end: loc ? loc.end : null, page: pd.page, rects: pd.rects, quote: pd.quote.slice(0, 4000), createdAt: Date.now(), thread: [], saved: false };
      S.highlights.push(h);
    }
  } else {
    h = S.highlights.find((x) => x.start === pd.start && x.end === pd.end);
    if (!h) {
      h = { id: uid(), start: pd.start, end: pd.end, quote: pd.quote.slice(0, 4000), createdAt: Date.now(), thread: [], saved: false };
      S.highlights.push(h);
    }
  }
  setActive(h.id);
  if (question) askActive(question);
  else setTimeout(() => $("#composer-input")?.focus(), 50);
}

async function saveHighlight(h, paper = S.paper) {
  if (!paper) return;
  const clean = { id: h.id, start: h.start ?? null, end: h.end ?? null, page: h.page ?? null, rects: h.rects || null, quote: h.quote, createdAt: h.createdAt, thread: h.thread.filter((e) => e.a && !e.pending && !e.error).map((e) => ({ q: e.q, a: e.a, at: e.at })) };
  const ok = await safe(async () => { await S.store.putHighlight(paper.id, clean); return true; }, "Got the answer, but couldn't save it. It will be saved with your next question.");
  if (ok) h.saved = true;
  if (paper === S.paper) syncCounts();
  else {
    // answer arrived after leaving this paper: update its counts directly
    paper.qCount = (paper.qCount || 0) + 1;
    if (!h.counted) paper.hlCount = (paper.hlCount || 0) + (h.thread.filter((e) => e.a && !e.error).length === 1 ? 1 : 0);
    safe(() => S.store.patchPaper(paper.id, { qCount: paper.qCount, hlCount: paper.hlCount }), " ");
  }
}
function syncCounts() {
  const p = S.paper;
  if (!p) return;
  const hlCount = S.highlights.filter(asked).length;
  const qCount = S.highlights.reduce((n, h) => n + h.thread.filter((e) => e.a && !e.pending && !e.error).length, 0);
  if (p.hlCount === hlCount && p.qCount === qCount) return;
  p.hlCount = hlCount; p.qCount = qCount;
  const askedEl = document.querySelectorAll(".mini-stats b")[1];
  if (askedEl) askedEl.textContent = S.papers.reduce((n, x) => n + (x.qCount || 0), 0);
  safe(() => S.store.patchPaper(p.id, { hlCount, qCount }), " ");
}

/* ---------------- asking Claude ---------------- */
function contextAround(start, end, span = 4000) {
  const a = Math.max(0, start - span), b = Math.min(S.fullText.length, end + span);
  return (a > 0 ? "…" : "") + S.fullText.slice(a, b) + (b < S.fullText.length ? "…" : "");
}
function sectionAt(pos) {
  let head = "";
  for (let i = 0; i < S.blocks.length && S.starts[i] <= pos; i++) if (S.blocks[i].t === "h") head = S.blocks[i].x;
  return head;
}
function searchPaper(query) {
  const text = S.fullText, low = text.toLowerCase();
  const q = String(query || "").toLowerCase().trim();
  if (!q) return { results: [] };
  let hits = [];
  let i = low.indexOf(q);
  while (i !== -1 && hits.length < 5) { hits.push(i); i = low.indexOf(q, i + q.length + 400); }
  if (!hits.length) {
    const terms = q.split(/\W+/).filter((t) => t.length > 3).sort((a, b) => b.length - a.length);
    for (const t of terms) { let j = low.indexOf(t); while (j !== -1 && hits.length < 5) { hits.push(j); j = low.indexOf(t, j + 600); } if (hits.length) break; }
  }
  return { results: hits.map((h) => ({ section: sectionAt(h) || "(opening)", excerpt: text.slice(Math.max(0, h - 350), h + 450) })) };
}

function buildMessages(h, upto) {
  const p = S.paper;
  const opening = S.fullText.slice(0, 3500);
  const intro = `You are a friendly expert explaining a research paper to a smart reader who is new to the field. They highlighted a passage and asked about it. Talk to them like a good tutor sitting next to them, not like a textbook.

How to answer:
- Open with one or two sentences that say what the passage means in everyday words. No preamble, no "The plain-language version:" label, no restating the question.
- Then explain *why* it is true, using concrete, real-world things the reader can picture (for example, for EEG: chewing, blinking, deep sleep). Name specific causes, not abstract categories.
- Whenever it helps, give a small worked example with made-up but realistic numbers or a mini scenario, and walk through what happens under different choices. Introduce a technical term only inside the example where it is needed, with its meaning in a few words in brackets, e.g. "high sensitivity (few missed seizures)". Do NOT write a separate glossary or "Key terms" section.
- Use short bullet lists for the causes and for the example's cases; keep everything else as short paragraphs. Bold a phrase only when it is the label of a bullet.
- Finish with one short paragraph on why this matters for what the authors do in this paper (their method or choice), if the context supports it.
- Ground the answer in the paper. If something is defined elsewhere and not shown, say what it most likely means. If the paper doesn't say, say so and give general background, labelled as such.
- Plain Markdown only (bullets, bold, inline code). No headings. Aim for about 200 to 300 words unless the reader asks for more or less. Follow-up questions get direct, shorter answers in the same style.

`;
  const ctx = `Paper title: ${p.title}

Opening of the paper (title, authors, abstract):
"""
${opening}
"""

Section the passage is in: ${sectionAt(h.start != null ? h.start : pageStart(h.page)) || "(opening)"}

Text around the highlighted passage:
"""
${h.start != null ? contextAround(h.start, h.end) : pageText(h.page)}
"""

Highlighted passage:
"""
${h.quote}
"""`;
  const introAll = intro + ctx;
  const done = h.thread.slice(0, upto).filter((e) => e.a && !e.error && !e.pending);
  const msgs = [];
  done.forEach((e, k) => {
    msgs.push({ role: "user", content: k === 0 ? `${introAll}\n\nQuestion: ${e.q}` : e.q });
    msgs.push({ role: "assistant", content: e.a || "(no answer)" });
  });
  const q = h.thread[upto].q;
  msgs.push({ role: "user", content: done.length ? q : `${introAll}\n\nQuestion: ${q}` });
  return msgs;
}

const SEARCH_TOOL = {
  name: "search_paper",
  description: "Search the full text of the paper the reader is reading. Returns up to 5 excerpts with the section each appears in. Use it to find where a term, symbol, acronym, figure, table or earlier result is defined or discussed.",
  inputSchema: { type: "object", properties: { query: { type: "string", description: "A word or short phrase to look for, e.g. 'ablation' or 'Table 2'" } }, required: ["query"] },
  execute: (input) => searchPaper(input.query),
};

const ERR_TEXT = {
  no_sample: "Asking Claude needs your Anthropic API key. Add it in Settings (top of your library), then try again.",
  no_api_key: "Asking Claude needs your Anthropic API key. Add it in Settings (top of your library), then try again.",
  invalid_api_key: "Anthropic didn't accept your API key. Check it in Settings, then try again.",
  insufficient_credit: "Your Anthropic account is out of credit. Add credit at console.anthropic.com, then try again.",
  overloaded: "Claude is busy right now. Try again in a minute.",
  network_error: "Couldn't reach Anthropic. Check your connection and try again.",
  empty_completion: "Claude sent back an empty answer. Try again, or rephrase the question.",
  not_granted: "Claude isn't allowed to answer here. Check your API key in Settings.",
  not_declared: "Asking Claude isn't switched on for this page.",
  rate_limited: "Too many questions in a short time. Wait a moment, then ask again.",
  session_expired: "Your sign-in expired. Reload the page and ask again.",
  sampling_disabled: "Asking Claude is turned off for your account or organization.",
  capability_disabled: "Asking Claude is turned off for your account or organization.",
  prompt_too_large: "This conversation got too long to send. Start a new highlight on the same passage and ask there.",
  refused: "Claude declined to answer that question.",
};

let sampleReady = null;
function getSample() {
  if (!sampleReady) sampleReady = (window.claude && typeof window.claude.use === "function") ? window.claude.use("sample").catch(() => null) : Promise.resolve(null);
  return sampleReady;
}
getSample().then((x) => { sampleCap = x; });

async function askActive(question, retryK) {
  const h = hlById(S.activeId);
  if (!h || h.asking) return;
  const paper = S.paper;
  let entry;
  if (retryK != null && h.thread[retryK]) { entry = h.thread[retryK]; entry.error = null; entry.a = ""; entry.at = Date.now(); }
  else { if (!question) return; entry = { q: question, a: "", at: Date.now() }; h.thread.push(entry); }
  entry.pending = true; entry.started = Date.now();
  const ctrl = new AbortController();
  entry.ctrl = ctrl; readerAbort = ctrl; h.asking = true;
  rerenderBlocksFor(h);
  if (S.activeId === h.id) renderPanel();
  const k = () => h.thread.indexOf(entry);
  document.querySelector(`#thread .qa[data-k="${k()}"]`)?.scrollIntoView({ block: "nearest" });
  let raf = 0;
  const paint = () => {
    raf = 0;
    if (S.activeId !== h.id) return;
    const qa = document.querySelector(`#thread .qa[data-k="${k()}"]`);
    if (!qa) return;
    let el = qa.querySelector(".answer");
    if (!el) { qa.querySelector(".ask-wait")?.remove(); el = document.createElement("div"); el.className = "answer"; qa.appendChild(el); }
    el.innerHTML = md(entry.a);
  };
  try {
    const cap = sampleCap || await getSample();
    if (!cap) throw { code: "no_sample" };
    if (typeof cap !== "function") throw { code: "no_sample", message: "sample is " + typeof cap };
    const onText = ({ text }) => { entry.a = text; if (!raf) raf = requestAnimationFrame(paint); };
    const turns = buildMessages(h, k());
    let res;
    try {
      res = await cap(turns, { onText, signal: ctrl.signal, cache: false });
    } catch (e1) {
      // unexpected failure shape: try once more as a single plain prompt
      if (!e1 || !e1.code || e1.code === "invalid_request" || e1.code === "transform_error" || e1.code === "upstream_error") {
        console.warn("First ask failed, retrying as one prompt", e1);
        entry.a = "";
        const flat = turns.map((t) => (t.role === "assistant" ? "Your earlier answer:\n" : "") + t.content).join("\n\n---\n\n");
        res = await cap(flat, { onText, signal: ctrl.signal });
      } else throw e1;
    }
    entry.a = res.text || entry.a;
    if (res.truncated) entry.a += "\n\n*(The answer was cut off. Ask Claude to continue.)*";
    if (!entry.a.trim()) throw { code: "empty_completion" };
    delete entry.pending;
    await saveHighlight(h, paper);
    recordActivity();
  } catch (e) {
    console.error("Ask failed", e);
    delete entry.pending;
    entry.a = (e && e.text) || "";
    entry.error = e && e.code === "cancelled" ? "Stopped. Try again when you're ready."
      : (e && ERR_TEXT[e.code]) || `Couldn't get an answer. Try again in a moment. Details: ${String((e && (e.code || e.name)) || "error")}${e && e.message ? " – " + String(e.message).slice(0, 160) : ""}`;
  } finally {
    delete entry.ctrl;
    h.asking = false;
    if (readerAbort === ctrl) readerAbort = null;
    if (S.view === "reader" && S.paper) {
      rerenderBlocksFor(h);
      if (S.activeId === h.id) renderPanel(); else renderPanelIfList();
    }
  }
}
function renderPanelIfList() { if (!S.activeId) renderPanel(); }

/* ---------------- progress ---------------- */
let pdfDocCache2 = null, pdfObserver = null, readScrollTop = 0;
const pdfResize = typeof ResizeObserver === "function" ? new ResizeObserver(() => {
  document.querySelectorAll("#pdf-view .pdf-page[data-bw]").forEach((el) => el.style.setProperty("--scale-factor", el.clientWidth / +el.dataset.bw));
  renderPdfMarks();
}) : null;
async function getPdfDoc(p) {
  if (pdfDocCache2 && pdfDocCache2.id === p.id) return pdfDocCache2.doc;
  await loadPdfJs();
  let doc = null;
  const blob = await idb.get(p.id);
  if (blob) { const u8 = new Uint8Array(await blob.arrayBuffer()); fixPdfBytes(u8); doc = await window.pdfjsLib.getDocument({ data: u8 }).promise; }
  else if (p.pdfUrl) doc = await window.pdfjsLib.getDocument({ url: p.pdfUrl }).promise;
  if (doc) pdfDocCache2 = { id: p.id, doc };
  return doc;
}
/* ---------------- book view ---------------- */
const B = { per: 2, pw: 400, ph: 600, pad: 44, padv: 48, spread: 0, spreads: 1, cols: 1 };
let bookAnchor = 0, flipping = false;
const bookResize = typeof ResizeObserver === "function" ? new ResizeObserver(() => {
  if (S.mode !== "book" || flipping) return;
  clearTimeout(bookResize.t);
  bookResize.t = setTimeout(() => layoutBook(bookAnchor), 120);
}) : null;
const bookStep = () => B.pw + 2 * B.pad;

function layoutBook(anchor) {
  const sc = $("#reader-scroll"), sheet = $(".sheet"), flow = $("#body-text");
  if (!sc || !sheet || !flow) return;
  const W = sc.clientWidth, H = sc.clientHeight;
  const narrow = W < 820;
  B.per = narrow ? 1 : 2;
  B.pad = narrow ? 22 : (W < 1100 ? 34 : 46);
  B.padv = narrow ? 26 : 44;
  const fs = narrow ? 16.5 : (W < 1100 ? 16.5 : 17.5);
  const chrome = narrow ? 68 : 58;              // folio + paddings (and nav row on phones)
  const pageH = Math.max(320, H - chrome);
  const maxPageW = narrow ? W - 20 : (W - 150) / 2;
  const idealW = narrow ? maxPageW : Math.min(pageH / 1.38, 600);
  const pageW = Math.max(240, Math.min(maxPageW, idealW));
  B.pw = Math.floor(pageW - 2 * B.pad);
  B.ph = Math.floor(pageH - 2 * B.padv);
  sheet.style.setProperty("--pw", B.pw + "px");
  sheet.style.setProperty("--ph", B.ph + "px");
  sheet.style.setProperty("--pad", B.pad + "px");
  sheet.style.setProperty("--padv", B.padv + "px");
  sheet.style.setProperty("--pages", B.per);
  sheet.style.setProperty("--bfs", fs + "px");
  sheet.classList.toggle("two", B.per === 2);
  $(".sheet-wrap").style.setProperty("--pages", B.per);
  $(".sheet-wrap").style.setProperty("--pw", B.pw + "px");
  $(".sheet-wrap").style.setProperty("--pad", B.pad + "px");
  flow.style.transform = "none";
  const blks = flow.querySelectorAll(".blk");
  const last = blks[blks.length - 1];
  const fr = flow.getBoundingClientRect();
  let lastRight = 0;
  if (last) for (const r of last.getClientRects()) lastRight = Math.max(lastRight, r.right - fr.left);
  B.cols = Math.max(1, Math.ceil((lastRight - 2) / bookStep()));
  B.spreads = Math.max(1, Math.ceil(B.cols / B.per));
  let target = 0;
  if (anchor != null) {
    const col = colOfOffset(anchor);
    if (col != null) target = Math.floor(col / B.per);
  }
  goSpread(target, false, true);
}
function blockOfOffset(off) {
  let i = 0;
  while (i + 1 < S.starts.length && S.starts[i + 1] <= off) i++;
  return i;
}
function colOfOffset(off) {
  const i = blockOfOffset(off);
  const el = document.querySelector(`#body-text .blk[data-i="${i}"]`);
  if (!el) return null;
  let left = off - S.starts[i];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (left < node.length) {
      const r = document.createRange();
      r.setStart(node, left); r.setEnd(node, Math.min(node.length, left + 1));
      const rect = r.getClientRects()[0];
      if (!rect) break;
      const fr = $("#body-text").getBoundingClientRect();
      return Math.max(0, Math.floor((rect.left - fr.left + 2) / bookStep()));
    }
    left -= node.length;
  }
  return colOf(el);
}
function visibleOffset() {
  // text offset of the first character on the current page(s)
  const clip = $("#book-clip");
  if (!clip || S.mode !== "book") return null;
  const cr = clip.getBoundingClientRect();
  if (document.caretRangeFromPoint) {
    for (let y = cr.top + 6; y < cr.top + 120; y += 12) {
      const r = document.caretRangeFromPoint(cr.left + 3, y);
      if (r && $("#body-text").contains(r.startContainer)) { const o = posOf(r.startContainer, r.startOffset); if (o != null) return o; }
    }
  }
  const b = firstVisibleBlock();
  return b == null ? null : S.starts[b];
}
function colOf(el) {
  const flow = $("#body-text");
  if (!flow || !el) return null;
  const fr = flow.getBoundingClientRect();
  const r = el.getClientRects()[0] || el.getBoundingClientRect();
  return Math.max(0, Math.floor((r.left - fr.left + 2) / bookStep()));
}
function firstVisibleBlock() {
  const clip = $("#book-clip"), flow = $("#body-text");
  if (!clip || !flow || S.mode !== "book") return null;
  const cr = clip.getBoundingClientRect();
  for (const el of flow.querySelectorAll(".blk")) {
    for (const r of el.getClientRects()) if (r.right > cr.left + 1 && r.left < cr.right - 1 && r.width) return +el.dataset.i;
  }
  return null;
}
const bookPct = () => (B.spreads <= 1 ? 1 : B.spread / (B.spreads - 1));
function goSpread(n, quiet, keepAnchor) {
  const flow = $("#body-text");
  if (!flow) return;
  B.spread = Math.max(0, Math.min(B.spreads - 1, n));
  flow.style.transform = `translateX(${-B.spread * B.per * bookStep()}px)`;
  const first = B.spread * B.per + 1, lastPage = Math.min(B.cols, first + B.per - 1);
  $("#book-folio").textContent = `${first === lastPage ? `Page ${first}` : `Pages ${first}–${lastPage}`} of ${B.cols}`;
  for (const id of ["#book-prev", "#corner-prev"]) $(id).disabled = B.spread === 0;
  for (const id of ["#book-next", "#corner-next"]) $(id).disabled = B.spread >= B.spreads - 1;
  if (quiet) return;
  if (!keepAnchor) { const fv = visibleOffset(); if (fv != null) bookAnchor = fv; }
  const pct = bookPct(), p = S.paper;
  $("#prog-bar").style.width = Math.round(pct * 100) + "%";
  $("#prog-label").textContent = Math.round(Math.max(pct, p.progress || 0) * 100) + "% read";
  clearTimeout(scrollSaveT);
  scrollSaveT = setTimeout(() => saveProgress(pct), 1200);
  renderBookPins();
}
function resetBook() {
  const flow = $("#body-text");
  if (flow) flow.style.transform = "";
  document.querySelectorAll(".leaf, .leaf-cover").forEach((x) => x.remove());
  flipping = false;
  const bp = $("#book-pins"); if (bp) bp.innerHTML = "";
}
function pageFace(col, cls) {
  const face = document.createElement("div");
  face.className = "face " + cls;
  const flow = $("#body-text");
  if (col >= 0 && col < B.cols) {
    const c = flow.cloneNode(true);
    c.removeAttribute("id");
    c.querySelector("#pins")?.remove();
    c.querySelectorAll("mark.on").forEach((m) => m.classList.remove("on"));
    c.style.left = (B.pad - col * bookStep()) + "px";
    c.setAttribute("aria-hidden", "true");
    face.appendChild(c);
  }
  return face;
}
function flip(dir) {
  if (S.mode !== "book" || flipping) return;
  const target = B.spread + dir;
  if (target < 0 || target >= B.spreads) return;
  hidePop();
  getSelection()?.removeAllRanges();
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { goSpread(target); return; }
  flipping = true;
  const sheet = $(".sheet"), s = B.spread, per = B.per;
  $("#book-pins").innerHTML = "";
  const leaf = document.createElement("div");
  let cover = null, after = null;
  if (per === 2) {
    const side = dir > 0 ? "r" : "l";
    leaf.className = "leaf " + side;
    leaf.append(pageFace(dir > 0 ? 2 * s + 1 : 2 * s, "front"), pageFace(dir > 0 ? 2 * s + 2 : 2 * s - 1, "back"));
    cover = document.createElement("div");
    cover.className = "leaf-cover " + (dir > 0 ? "l" : "r");
    cover.appendChild(pageFace(dir > 0 ? 2 * s : 2 * s + 1, "front"));
    goSpread(target, true);
  } else if (dir > 0) {
    leaf.className = "leaf full";
    leaf.append(pageFace(s, "front"), pageFace(-1, "back"));
    goSpread(target, true);
  } else {
    leaf.className = "leaf full back-in";
    leaf.append(pageFace(s - 1, "front"), pageFace(-1, "back"));
    after = () => goSpread(target, true);
  }
  if (cover) sheet.appendChild(cover);
  sheet.appendChild(leaf);
  let done = false;
  const finish = () => {
    if (done) return; done = true;
    if (after) after();
    leaf.remove(); cover?.remove();
    flipping = false;
    goSpread(target);
  };
  leaf.addEventListener("transitionend", (e) => { if (e.target === leaf) finish(); });
  setTimeout(finish, 1200);
  requestAnimationFrame(() => requestAnimationFrame(() => leaf.classList.add("go")));
}
function renderBookPins() {
  const layer = $("#book-pins"), clip = $("#book-clip"), body = $("#body-text"), sheet = $(".sheet");
  if (!layer || !clip || !body || S.mode !== "book" || flipping) return;
  const cr = clip.getBoundingClientRect(), sr = sheet.getBoundingClientRect();
  const mid = sr.left + sr.width / 2;
  const items = [];
  for (const h of S.highlights) {
    const n = h.thread.filter((e) => e.a && !e.error && !e.pending).length;
    if (!n && !h.asking) continue;
    let rect = null;
    for (const m of body.querySelectorAll(`mark.hl[data-h="${h.id}"]`)) {
      for (const r of m.getClientRects()) if (r.width && r.left >= cr.left - 1 && r.right <= cr.right + 1) { rect = r; break; }
      if (rect) break;
    }
    if (!rect) continue;
    const left = B.per === 2 && rect.left + rect.width / 2 < mid;
    items.push({ h, n, left, top: rect.top - sr.top });
  }
  items.sort((a, b) => a.top - b.top);
  layer.classList.toggle("compact", B.pad < 40);
  const notes = [];
  for (const m of S.marks) {
    if (!m.note.trim()) continue;
    let rect = null;
    for (const el of body.querySelectorAll(`.um[data-m="${m.id}"]`)) {
      for (const r of el.getClientRects()) if (r.width && r.left >= cr.left - 1 && r.right <= cr.right + 1) { rect = r; break; }
      if (rect) break;
    }
    if (rect) notes.push({ m, left: B.per === 2 && rect.left + rect.width / 2 < mid, top: rect.top - sr.top });
  }
  notes.sort((a, b) => a.top - b.top);
  const nTop = { true: -100, false: -100 };
  const noteHTML = notes.map(({ m, left, top }) => {
    const t = Math.max(top - 2, nTop[left] + 26); nTop[left] = t;
    const x = B.per === 1 ? B.pad / 2 - 10 : left ? B.pad + B.pw + B.pad / 2 - 10 : 2 * B.pad + B.pw + B.pad / 2 - 10;
    return `<button class="pin npin ${m.id === S.activeMark ? "on" : ""}" style="top:${t}px;left:${x}px" data-mark="${m.id}" title="Your note" aria-label="Open your note">${NOTE_SVG}</button>`;
  }).join("");
  const lastTop = { true: -100, false: -100 };
  layer.innerHTML = items.map(({ h, n, left, top }) => {
    const t = Math.max(top - 2, lastTop[left] + 26); lastTop[left] = t;
    const off = B.pad < 40 ? Math.max(1, B.pad / 2 - 9) : B.pad / 2 - 17;
    const pos = left ? `left:${off}px` : `left:auto;right:${off}px`;
    return `<button class="pin ${h.id === S.activeId ? "on" : ""}" style="top:${t}px;${pos}" data-pin="${h.id}" title="${n ? plural(n, "question") + " on this passage" : "Asking Claude…"}" aria-label="Open notes: ${n ? plural(n, "question") : "asking"}"><svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M3 2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H8.4L5 14.6V12H3a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/></svg>${n || "…"}</button>`;
  }).join("") + noteHTML;
}

async function setMode(mode) {
  const reader = $(".reader"), p = S.paper;
  if (!reader || !p || S.mode === mode) return;
  const sc = $("#reader-scroll");
  const prev = S.mode;
  const anchor = prev === "book" ? visibleOffset() : prev === "read" ? S.starts[topBlockIndex()] : null;
  if (prev === "read") readScrollTop = sc.scrollTop;
  if (prev === "book" && anchor != null) bookAnchor = anchor;
  hidePop();
  S.mode = mode;
  if (mode !== "pdf") lsSet("marginalia.view", mode);
  reader.classList.toggle("pdf-mode", mode === "pdf");
  reader.classList.toggle("book-mode", mode === "book");
  document.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
  if (prev === "book") resetBook();
  if (mode === "read") {
    const el = anchor != null && document.querySelector(`#body-text .blk[data-i="${blockOfOffset(anchor)}"]`);
    if (el && prev === "book") sc.scrollTop = el.offsetTop - 60; else sc.scrollTop = readScrollTop;
    schedulePins(); return;
  }
  if (mode === "book") { sc.scrollTop = 0; layoutBook(anchor != null ? anchor : bookAnchor); return; }
  sc.scrollTop = 0;
  const view = $("#pdf-view");
  view.innerHTML = `<p class="pdf-note">Loading the original PDF…</p>`;
  try {
    const doc = await getPdfDoc(p);
    if (S.mode !== "pdf" || S.paper !== p) return;
    if (!doc) { view.innerHTML = `<p class="pdf-note">The original file wasn't kept for this paper because it was added before this feature existed. Remove it and add the PDF again to see the original here.</p>`; return; }
    const sizes = [];
    for (let n = 1; n <= doc.numPages; n++) { const vp = (await doc.getPage(n)).getViewport({ scale: 1 }); sizes.push([vp.width, vp.height]); }
    if (S.mode !== "pdf" || S.paper !== p) return;
    view.innerHTML = `<p class="pdf-note">Select any text on these pages to highlight it, add a note, or ask Claude. Icons on the left mark your notes; icons on the right mark what you've asked.</p>` +
      sizes.map(([w, h], i) => `<div class="pdf-page" data-n="${i + 1}" style="aspect-ratio:${w} / ${h}"><span class="pn">${i + 1} / ${sizes.length}</span></div>`).join("");
    if (pdfObserver) pdfObserver.disconnect();
    pdfObserver = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (!en.isIntersecting || en.target.dataset.done) return;
      en.target.dataset.done = "1";
      renderPdfPage(doc, en.target);
    }), { root: sc, rootMargin: "800px 0px" });
    view.querySelectorAll(".pdf-page").forEach((el) => pdfObserver.observe(el));
    if (pdfResize) { pdfResize.disconnect(); pdfResize.observe(view); }
  } catch (e) {
    console.error(e);
    view.innerHTML = `<p class="pdf-note">Couldn't open the original PDF. ${esc((e && e.message) || "")}</p>`;
  }
}
async function renderPdfPage(doc, el) {
  try {
    const page = await doc.getPage(+el.dataset.n);
    const base = page.getViewport({ scale: 1 });
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssScale = el.clientWidth / base.width;
    el.dataset.bw = base.width;
    el.style.setProperty("--scale-factor", cssScale);
    const vp = page.getViewport({ scale: cssScale * dpr });
    const cv = document.createElement("canvas");
    cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height);
    await page.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
    el.prepend(cv);
    const tl = document.createElement("div");
    tl.className = "textLayer";
    el.appendChild(tl);
    const tc = await page.getTextContent();
    await window.pdfjsLib.renderTextLayer({ textContentSource: tc, container: tl, viewport: page.getViewport({ scale: cssScale }), textDivs: [] }).promise;
    renderPdfMarks();
  } catch (e) { console.error(e); el.dataset.done = ""; }
}

function onReaderScroll() {
  if (S.mode !== "read") return;
  const sc = $("#reader-scroll");
  if (!sc) return;
  const max = sc.scrollHeight - sc.clientHeight;
  const pct = max > 0 ? Math.min(1, sc.scrollTop / max) : 1;
  const p = S.paper;
  $("#prog-bar").style.width = Math.round(pct * 100) + "%";
  $("#prog-label").textContent = Math.round(Math.max(pct, p.progress || 0) * 100) + "% read";
  clearTimeout(scrollSaveT);
  scrollSaveT = setTimeout(() => saveProgress(pct), 1500);
}
function topBlockIndex() {
  if (S.mode === "book") return firstVisibleBlock() ?? 0;
  const sc = $("#reader-scroll");
  if (!sc) return 0;
  const y = sc.scrollTop + 100;
  let idx = 0;
  for (const el of document.querySelectorAll("#body-text .blk")) { if (el.offsetTop > y) break; idx = +el.dataset.i; }
  return idx;
}
async function saveProgress(pct) {
  const p = S.paper;
  if (!p || S.view !== "reader") return;
  const progress = Math.max(p.progress || 0, pct);
  const lastBlock = topBlockIndex();
  if (progress === p.progress && lastBlock === p.lastBlock) return;
  p.progress = progress; p.lastBlock = lastBlock;
  await safe(() => S.store.patchPaper(p.id, { progress, lastBlock }), " ");
}
function flushProgress() {
  // fire-and-forget: navigation never waits on a save
  const sc = $("#reader-scroll");
  if (!sc) return;
  clearTimeout(scrollSaveT);
  if (S.mode === "book") { saveProgress(bookPct()).catch(() => {}); return; }
  if (S.mode === "pdf") return;
  const max = sc.scrollHeight - sc.clientHeight;
  saveProgress(max > 0 ? sc.scrollTop / max : 1).catch(() => {});
}
function leaveReader() {
  if (readerAbort) readerAbort.abort();
  hidePop();
  flushProgress();
  S.paper = null; S.highlights = []; S.blocks = []; S.marks = []; S.activeMark = null;
  renderLibrary();
}

/* ---------------- original PDF page ---------------- */
let pdfDocCache = null;
async function viewPage(n) {
  const p = S.paper;
  if (!p || !p.pdfUrl) return;
  const ov = document.createElement("div");
  ov.className = "overlay";
  ov.innerHTML = `<div class="dialog page-dialog" role="dialog" aria-label="Original page">
    <div class="row"><strong id="pg-label">Page ${n}</strong><span style="display:flex;gap:8px">
      <button class="btn small" id="pg-prev">Previous</button><button class="btn small" id="pg-next">Next</button><button class="btn ghost small" id="pg-close">Close</button></span></div>
    <div class="canvas-wrap"><p class="loading" id="pg-loading" style="height:200px">Loading the original page…</p><canvas id="pg-canvas"></canvas></div>
  </div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  $("#pg-close").onclick = close;
  ov.onclick = (e) => { if (e.target === ov) close(); };
  ov.onkeydown = (e) => { if (e.key === "Escape") close(); };
  $("#pg-close").focus();
  let cur = n;
  const draw = async () => {
    try {
      await loadPdfJs();
      if (!pdfDocCache || pdfDocCache.id !== p.id) pdfDocCache = { id: p.id, doc: await window.pdfjsLib.getDocument({ url: p.pdfUrl }).promise };
      const doc = pdfDocCache.doc;
      cur = Math.min(Math.max(1, cur), doc.numPages);
      $("#pg-label").textContent = `Page ${cur} of ${doc.numPages}`;
      const page = await doc.getPage(cur);
      const wrap = ov.querySelector(".canvas-wrap");
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(2.5, (wrap.clientWidth || 800) / base.width) * (window.devicePixelRatio || 1);
      const vp = page.getViewport({ scale });
      const cv = $("#pg-canvas");
      cv.width = vp.width; cv.height = vp.height;
      cv.style.width = vp.width / (window.devicePixelRatio || 1) + "px";
      await page.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
      $("#pg-loading")?.remove();
    } catch (e) {
      console.error(e);
      const l = $("#pg-loading"); if (l) l.textContent = "Couldn't load the original PDF.";
    }
  };
  $("#pg-prev").onclick = () => { cur--; draw(); };
  $("#pg-next").onclick = () => { cur++; draw(); };
  draw();
}

/* ---------------- boot ---------------- */
(async () => {
  await initStorage();
  renderLibrary();
})();
})();
