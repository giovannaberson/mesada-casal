import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── GASTOS ────────────────────────────────────────────────────────────────────

export async function fetchGastos(meses) {
  const { data, error } = await supabase
    .from("gastos")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;

  const resultado = Object.fromEntries(meses.map(m => [m, { gi: [], art: [] }]));
  for (const row of data) {
    if (resultado[row.mes]) {
      resultado[row.mes][row.pessoa].push({
        id: row.id, desc: row.desc, valor: row.valor, cat: row.cat, data: row.data_str,
      });
    }
  }
  return resultado;
}

export async function insertGasto({ mes, pessoa, desc, valor, cat, data }) {
  const { data: rows, error } = await supabase
    .from("gastos")
    .insert([{ mes, pessoa, desc, valor, cat, data_str: data }])
    .select().single();
  if (error) throw error;
  return { id: rows.id, desc: rows.desc, valor: rows.valor, cat: rows.cat, data: rows.data_str };
}

export async function deleteGasto(id) {
  const { error } = await supabase.from("gastos").delete().eq("id", id);
  if (error) throw error;
}

export async function deleteGastosPessoaMes(mes, pessoa) {
  const { error } = await supabase.from("gastos").delete().eq("mes", mes).eq("pessoa", pessoa);
  if (error) throw error;
}

// ── LIMITES ───────────────────────────────────────────────────────────────────

export async function fetchLimites() {
  const { data, error } = await supabase
    .from("config").select("value").eq("key", "limites").single();
  if (error && error.code === "PGRST116") return { gi: 1000, art: 1000 };
  if (error) throw error;
  return data.value;
}

export async function saveLimites(limites) {
  const { error } = await supabase
    .from("config").upsert({ key: "limites", value: limites }, { onConflict: "key" });
  if (error) throw error;
}

// ── WISHLIST ──────────────────────────────────────────────────────────────────

export async function fetchWishlist() {
  const { data, error } = await supabase
    .from("wishlist").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function insertWishlistItem({ pessoa, nome, link, valor, mes_planejado, nivel_desejo }) {
  const { data, error } = await supabase
    .from("wishlist")
    .insert([{ pessoa, nome, link: link || null, valor, mes_planejado: mes_planejado || null, nivel_desejo }])
    .select().single();
  if (error) throw error;
  return data;
}

export async function updateWishlistComprado(id, comprado) {
  const { error } = await supabase.from("wishlist").update({ comprado }).eq("id", id);
  if (error) throw error;
}

export async function deleteWishlistItem(id) {
  const { error } = await supabase.from("wishlist").delete().eq("id", id);
  if (error) throw error;
}

// ── POUPANÇA ──────────────────────────────────────────────────────────────────

export async function fetchPoupanca() {
  const { data, error } = await supabase
    .from("poupanca").select("*").order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function insertPoupanca({ pessoa, mes, valor, descricao }) {
  const { data, error } = await supabase
    .from("poupanca")
    .insert([{ pessoa, mes, valor, descricao: descricao || null }])
    .select().single();
  if (error) throw error;
  return data;
}

export async function deletePoupanca(id) {
  const { error } = await supabase.from("poupanca").delete().eq("id", id);
  if (error) throw error;
}
