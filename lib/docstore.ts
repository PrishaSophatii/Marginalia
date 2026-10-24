import type { SupabaseClient } from "@supabase/supabase-js";

// A small document store over the public.docs table with the same shape as the
// artifact runtime's db capability: db.doc(path).get/set/update/delete and
// db.collection(path).get/doc(id). Rows are keyed by (user_id, path); parent is the
// path minus its last segment, which is how a collection lists its documents.
type Data = Record<string, unknown>;

const parentOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf("/")));
const idOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const clone = <T,>(v: T): T => (v == null ? v : JSON.parse(JSON.stringify(v)));

export function docStore(sb: SupabaseClient, userId: string) {
  const table = () => sb.from("docs");
  const check = (r: { error: unknown }) => {
    if (r.error) throw r.error;
  };

  function doc(path: string) {
    return {
      id: idOf(path),
      path,
      async get() {
        const r = await table().select("data").eq("user_id", userId).eq("path", path).maybeSingle();
        check(r);
        const data = r.data ? (r.data.data as Data) : null;
        return { id: idOf(path), exists: !!data, data: () => clone(data) };
      },
      async set(data: Data) {
        check(await table().upsert({ user_id: userId, path, parent: parentOf(path), data: clone(data), updated_at: new Date().toISOString() }));
      },
      async update(patch: Data) {
        const cur = (await this.get()).data() || {};
        await this.set({ ...cur, ...patch });
      },
      async delete() {
        check(await table().delete().eq("user_id", userId).eq("path", path));
      },
    };
  }

  function collection(path: string) {
    return {
      path,
      doc: (id: string) => doc(`${path}/${id}`),
      async get() {
        const out: { id: string; data: () => Data }[] = [];
        for (let from = 0; ; from += 1000) {
          const r = await table().select("path,data").eq("user_id", userId).eq("parent", path).range(from, from + 999);
          check(r);
          const rows = r.data || [];
          rows.forEach((row) => out.push({ id: idOf(row.path as string), data: () => clone(row.data as Data) }));
          if (rows.length < 1000) break;
        }
        return { docs: out, size: out.length, empty: !out.length };
      },
    };
  }

  return { doc, collection };
}
