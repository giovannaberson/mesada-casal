import { createClient } from "@supabase/supabase-js";

// ─── Cole aqui as suas credenciais do Supabase ───────────────────────────────
// Veja o README.md para saber onde encontrar esses valores
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
// ─────────────────────────────────────────────────────────────────────────────

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── GASTOS ────────────────────────────────────────────────────────────────────

/**
 * Busca todos os gastos do banco e os transforma no formato que o app usa:
 * { "Março/2026": { gi: [...], art: [...] }, ... }
 */
export async function fetchGastos(meses) {
  const { data, error } = await supabase
    .from("gastos")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw error;

  // Monta estrutura com todos os meses zerados
  const resultado = Object.fromEntries(meses.map(m => [m, { gi: [], art: [] }]));

  for (const row of data) {
    if (resultado[row.mes]) {
      resultado[row.mes][row.pessoa].push({
        id: row.id,
        desc: row.desc,
        valor: row.valor,
        cat: row.cat,
        data: row.data_str,
      });
    }
  }

  return resultado;
}

/**
 * Insere um novo gasto e retorna o objeto com o id gerado pelo banco
 */
export async function insertGasto({ mes, pessoa, desc, valor, cat, data }) {
  const { data: rows, error } = await supabase
    .from("gastos")
    .insert([{ mes, pessoa, desc, valor, cat, data_str: data }])
    .select()
    .single();

  if (error) throw error;
  return { id: rows.id, desc: rows.desc, valor: rows.valor, cat: rows.cat, data: rows.data_str };
}

/**
 * Remove um gasto pelo id
 */
export async function deleteGasto(id) {
  const { error } = await supabase.from("gastos").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Remove todos os gastos de uma pessoa em um mês
 */
export async function deleteGastosPessoaMes(mes, pessoa) {
  const { error } = await supabase
    .from("gastos")
    .delete()
    .eq("mes", mes)
    .eq("pessoa", pessoa);
  if (error) throw error;
}

// ── LIMITES ───────────────────────────────────────────────────────────────────

/**
 * Busca os limites salvos (retorna { gi: 1000, art: 1000 } se não existir)
 */
export async function fetchLimites() {
  const { data, error } = await supabase
    .from("config")
    .select("value")
    .eq("key", "limites")
    .single();

  if (error && error.code === "PGRST116") {
    // Linha ainda não existe — retorna padrão
    return { gi: 1000, art: 1000 };
  }
  if (error) throw error;
  return data.value;
}

/**
 * Salva (upsert) os limites
 */
export async function saveLimites(limites) {
  const { error } = await supabase
    .from("config")
    .upsert({ key: "limites", value: limites }, { onConflict: "key" });
  if (error) throw error;
}
