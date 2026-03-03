import { useState, useEffect } from "react";
import { PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";
import {
  fetchGastos,
  insertGasto,
  deleteGasto,
  deleteGastosPessoaMes,
  fetchLimites,
  saveLimites,
} from "./supabase";

const DEFAULT_LIMITES = { gi: 1000, art: 1000 };

const CATEGORIAS_COLORS = {
  "Alimentação": "#f97316",
  "Transporte": "#eab308",
  "Lazer": "#22c55e",
  "Saúde": "#ef4444",
  "Compras": "#ec4899",
  "Beleza": "#a855f7",
  "Outros": "#94a3b8",
};

const MESES = [
  "Março/2026", "Abril/2026", "Maio/2026", "Junho/2026",
  "Julho/2026", "Agosto/2026", "Setembro/2026", "Outubro/2026",
  "Novembro/2026", "Dezembro/2026",
];

const emptyDados = () => Object.fromEntries(MESES.map(m => [m, { gi: [], art: [] }]));

function soma(arr) {
  return arr.reduce((s, i) => s + i.valor, 0);
}

function categoriasPie(gastos) {
  const map = {};
  gastos.forEach(g => { map[g.cat] = (map[g.cat] || 0) + g.valor; });
  return Object.entries(map).map(([name, value]) => ({ name, value }));
}

// ── UI COMPONENTS ─────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: 16, fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{
        width: 40, height: 40, borderRadius: "50%",
        border: "3px solid #e2e8f0", borderTopColor: "#6366f1",
        animation: "spin 0.8s linear infinite",
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ fontSize: 14, color: "#94a3b8", fontWeight: 600 }}>Carregando dados...</div>
    </div>
  );
}

function ErrorBanner({ message, onRetry }) {
  return (
    <div style={{ background: "#fef2f2", border: "1.5px solid #fecaca", borderRadius: 12, padding: "14px 18px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ fontSize: 13, color: "#ef4444", fontWeight: 600 }}>⚠️ {message}</div>
      {onRetry && (
        <button onClick={onRetry} style={{ background: "#ef4444", color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
          Tentar novamente
        </button>
      )}
    </div>
  );
}

function DonutChart({ data, total, label, color }) {
  const empty = total === 0;
  const displayData = empty ? [{ name: "vazio", value: 1 }] : data;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <div style={{ position: "relative", width: 140, height: 140 }}>
        <PieChart width={140} height={140}>
          <Pie data={displayData} cx={65} cy={65} innerRadius={45} outerRadius={65} dataKey="value" startAngle={90} endAngle={-270} strokeWidth={0}>
            {displayData.map((entry, i) => (
              <Cell key={i} fill={empty ? "#e2e8f0" : (CATEGORIAS_COLORS[entry.name] || "#94a3b8")} />
            ))}
          </Pie>
        </PieChart>
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", fontFamily: "'DM Sans', sans-serif" }}>
            R${total >= 1000 ? (total / 1000).toFixed(1) + "K" : total}
          </div>
          <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, letterSpacing: 1 }}>GASTO</div>
        </div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color, letterSpacing: 0.5 }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "center", maxWidth: 160 }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <div style={{ width: 7, height: 7, borderRadius: 2, background: CATEGORIAS_COLORS[d.name] || "#94a3b8" }} />
            <span style={{ fontSize: 10, color: "#64748b" }}>{d.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SaldoBar({ gasto, limite }) {
  const pct = Math.min((gasto / limite) * 100, 100);
  const cor = pct > 90 ? "#ef4444" : pct > 70 ? "#f97316" : "#22c55e";
  const saldo = limite - gasto;
  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>R$ {gasto} / R$ {limite}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: saldo < 0 ? "#ef4444" : cor }}>
          {saldo < 0 ? `Excedido R$ ${Math.abs(saldo)}` : `Saldo: R$ ${saldo}`}
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 99, background: "#e2e8f0", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: cor, borderRadius: 99, transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
}

function MesCard({ mes, data, limites, onClick }) {
  const gastoGi = soma(data.gi);
  const gastoArt = soma(data.art);
  const vazioMes = gastoGi === 0 && gastoArt === 0;
  return (
    <div onClick={onClick} style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 14, padding: "16px 18px", cursor: "pointer", transition: "all 0.18s", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 18px rgba(99,102,241,0.13)"; e.currentTarget.style.borderColor = "#818cf8"; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.04)"; e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.transform = "translateY(0)"; }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: vazioMes ? "#e2e8f0" : "#6366f1" }} />
        <span style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", fontFamily: "'DM Sans', sans-serif" }}>{mes}</span>
      </div>
      {vazioMes ? (
        <div style={{ fontSize: 12, color: "#cbd5e1", textAlign: "center", padding: "8px 0" }}>Sem registros</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div><div style={{ fontSize: 11, color: "#3b82f6", fontWeight: 700, marginBottom: 3 }}>💙 Gi</div><SaldoBar gasto={gastoGi} limite={limites.gi} /></div>
          <div><div style={{ fontSize: 11, color: "#8b5cf6", fontWeight: 700, marginBottom: 3 }}>💜 Art</div><SaldoBar gasto={gastoArt} limite={limites.art} /></div>
        </div>
      )}
    </div>
  );
}

function ConfirmModal({ message, onConfirm, onCancel, loading }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 28, maxWidth: 340, width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,0.18)", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ fontSize: 22, marginBottom: 10 }}>🗑️</div>
        <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a", marginBottom: 8 }}>Confirmar exclusão</div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 22, lineHeight: 1.5 }}>{message}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} disabled={loading} style={{ flex: 1, padding: "10px", borderRadius: 9, border: "1.5px solid #e2e8f0", background: "#fff", color: "#64748b", fontWeight: 600, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>Cancelar</button>
          <button onClick={onConfirm} disabled={loading} style={{ flex: 1, padding: "10px", borderRadius: 9, border: "none", background: "#ef4444", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif", opacity: loading ? 0.6 : 1 }}>
            {loading ? "Apagando..." : "Apagar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditLimitesModal({ limites, onSave, onClose, loading }) {
  const [gi, setGi] = useState(String(limites.gi));
  const [art, setArt] = useState(String(limites.art));
  const handle = () => {
    const novoGi = parseFloat(gi);
    const novoArt = parseFloat(art);
    if (!novoGi || !novoArt || novoGi <= 0 || novoArt <= 0) return;
    onSave({ gi: novoGi, art: novoArt });
  };
  const inp = { border: "1.5px solid #e2e8f0", borderRadius: 9, padding: "10px 12px", fontSize: 15, fontWeight: 700, outline: "none", fontFamily: "'DM Sans', sans-serif", background: "#fff", boxSizing: "border-box", width: "100%", textAlign: "right", color: "#0f172a" };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: 28, maxWidth: 380, width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,0.18)", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ fontSize: 22, marginBottom: 6 }}>✏️</div>
        <div style={{ fontWeight: 800, fontSize: 17, color: "#0f172a", marginBottom: 4 }}>Editar limites de mesada</div>
        <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 24 }}>Defina o limite individual de cada pessoa por mês.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 24 }}>
          {[{ key: "gi", label: "💙 Gi", val: gi, set: setGi, color: "#3b82f6", bg: "#eff6ff" }, { key: "art", label: "💜 Art", val: art, set: setArt, color: "#8b5cf6", bg: "#f5f3ff" }].map(p => (
            <div key={p.key} style={{ background: p.bg, borderRadius: 12, padding: "14px 16px", border: `1.5px solid ${p.color}22` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: p.color, marginBottom: 8 }}>{p.label}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#64748b" }}>R$</span>
                <input style={{ ...inp, borderColor: p.color + "55" }} type="number" min="1" value={p.val} onChange={e => p.set(e.target.value)} onFocus={e => e.target.select()} />
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} disabled={loading} style={{ flex: 1, padding: "11px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#fff", color: "#64748b", fontWeight: 600, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>Cancelar</button>
          <button onClick={handle} disabled={loading} style={{ flex: 2, padding: "11px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif", opacity: loading ? 0.6 : 1 }}>
            {loading ? "Salvando..." : "Salvar limites"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddGastoForm({ onAdd, onClose, loading }) {
  const [pessoa, setPessoa] = useState("gi");
  const [desc, setDesc] = useState("");
  const [valor, setValor] = useState("");
  const [cat, setCat] = useState("Alimentação");
  const [data, setData] = useState("");
  const handle = () => {
    if (!desc || !valor) return;
    onAdd({ pessoa, desc, valor: parseFloat(valor), cat, data });
  };
  const inp = { border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 13, outline: "none", width: "100%", fontFamily: "'DM Sans', sans-serif", background: "#f8fafc", boxSizing: "border-box" };
  return (
    <div style={{ background: "#fff", borderRadius: 16, padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontWeight: 800, fontSize: 16, color: "#0f172a", fontFamily: "'DM Sans', sans-serif" }}>+ Novo Gasto</div>
      <div style={{ display: "flex", gap: 8 }}>
        {["gi", "art"].map(p => (
          <button key={p} onClick={() => setPessoa(p)} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1.5px solid", borderColor: pessoa === p ? (p === "gi" ? "#3b82f6" : "#8b5cf6") : "#e2e8f0", background: pessoa === p ? (p === "gi" ? "#eff6ff" : "#f5f3ff") : "#fff", color: pessoa === p ? (p === "gi" ? "#3b82f6" : "#8b5cf6") : "#94a3b8", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
            {p === "gi" ? "💙 Gi" : "💜 Art"}
          </button>
        ))}
      </div>
      <input style={inp} placeholder="Descrição" value={desc} onChange={e => setDesc(e.target.value)} />
      <div style={{ display: "flex", gap: 8 }}>
        <input style={{ ...inp, width: "50%" }} placeholder="Valor (R$)" type="number" value={valor} onChange={e => setValor(e.target.value)} />
        <input style={{ ...inp, width: "50%" }} placeholder="Data (dd/mm)" value={data} onChange={e => setData(e.target.value)} />
      </div>
      <select style={inp} value={cat} onChange={e => setCat(e.target.value)}>
        {Object.keys(CATEGORIAS_COLORS).map(c => <option key={c}>{c}</option>)}
      </select>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onClose} disabled={loading} style={{ flex: 1, padding: 10, borderRadius: 8, border: "1.5px solid #e2e8f0", background: "#fff", color: "#64748b", fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Cancelar</button>
        <button onClick={handle} disabled={loading} style={{ flex: 2, padding: 10, borderRadius: 8, border: "none", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", opacity: loading ? 0.7 : 1 }}>
          {loading ? "Salvando..." : "Salvar gasto"}
        </button>
      </div>
    </div>
  );
}

function GastoItem({ gasto: g, onDelete }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ background: "#fff", borderRadius: 10, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", border: "1.5px solid", borderColor: hovered ? "#fecaca" : "#e2e8f0", transition: "border-color 0.15s" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 10, height: 10, borderRadius: 3, background: CATEGORIAS_COLORS[g.cat] || "#94a3b8", flexShrink: 0 }} />
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: "#0f172a" }}>{g.desc}</div>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>{g.cat}{g.data ? ` · ${g.data}` : ""}</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>R$ {g.valor}</div>
        <button onClick={onDelete} style={{ background: hovered ? "#fef2f2" : "transparent", border: hovered ? "1.5px solid #fecaca" : "1.5px solid transparent", color: hovered ? "#ef4444" : "#cbd5e1", borderRadius: 7, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 13, transition: "all 0.15s", padding: 0 }}>✕</button>
      </div>
    </div>
  );
}

// ── DETAILS PAGE ──────────────────────────────────────────────────────────────

function DetalhesMes({ mes, data, limites, onBack, onAdd, onDeleteItem, onDeleteAll }) {
  const [showForm, setShowForm] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const gastoGi = soma(data.gi);
  const gastoArt = soma(data.art);

  const handleConfirm = async () => {
    setActionLoading(true);
    try {
      if (confirm.type === "item") await onDeleteItem(mes, confirm.pessoa, confirm.id);
      if (confirm.type === "all") await onDeleteAll(mes, confirm.pessoa);
    } finally {
      setActionLoading(false);
      setConfirm(null);
    }
  };

  const confirmMsg = confirm?.type === "all"
    ? `Apagar todos os gastos de ${confirm.pessoa === "gi" ? "Gi" : "Art"} em ${mes}?`
    : `Apagar "${confirm?.desc}"?`;

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "'DM Sans', sans-serif" }}>
      {confirm && <ConfirmModal message={confirmMsg} onConfirm={handleConfirm} onCancel={() => setConfirm(null)} loading={actionLoading} />}
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: "#6366f1", fontWeight: 700, cursor: "pointer", fontSize: 14, marginBottom: 20, display: "flex", alignItems: "center", gap: 6, padding: 0 }}>← Voltar ao painel</button>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: "#0f172a" }}>{mes}</h2>
          <button onClick={() => setShowForm(!showForm)} style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontWeight: 700, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>+ Adicionar gasto</button>
        </div>
        {showForm && <div style={{ marginBottom: 20 }}><AddGastoForm onAdd={(g) => onAdd(mes, g, () => setShowForm(false))} onClose={() => setShowForm(false)} /></div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }}>
          {[{ key: "gi", label: "💙 Gi", gasto: gastoGi, color: "#3b82f6", bg: "#eff6ff" }, { key: "art", label: "💜 Art", gasto: gastoArt, color: "#8b5cf6", bg: "#f5f3ff" }].map(p => (
            <div key={p.key} style={{ background: p.bg, borderRadius: 14, padding: 20, border: `1.5px solid ${p.color}22` }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: p.color, marginBottom: 4 }}>{p.label}</div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>Limite: R$ {limites[p.key]}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#0f172a", marginBottom: 6 }}>R$ {p.gasto}</div>
              <SaldoBar gasto={p.gasto} limite={limites[p.key]} />
            </div>
          ))}
        </div>
        {["gi", "art"].map(pessoa => (
          <div key={pessoa} style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: pessoa === "gi" ? "#3b82f6" : "#8b5cf6" }}>{pessoa === "gi" ? "💙 Gastos da Gi" : "💜 Gastos do Art"}</div>
              {data[pessoa].length > 0 && (
                <button onClick={() => setConfirm({ type: "all", pessoa })} style={{ background: "#fef2f2", border: "1.5px solid #fecaca", color: "#ef4444", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", gap: 5 }}>🗑️ Apagar todos</button>
              )}
            </div>
            {data[pessoa].length === 0 ? (
              <div style={{ textAlign: "center", color: "#cbd5e1", fontSize: 13, padding: "20px 0" }}>Nenhum gasto registrado</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {data[pessoa].map((g) => (
                  <GastoItem key={g.id} gasto={g} onDelete={() => setConfirm({ type: "item", pessoa, id: g.id, desc: g.desc })} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────

export default function App() {
  const [dados, setDados] = useState(emptyDados());
  const [limites, setLimites] = useState(DEFAULT_LIMITES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [mesSelecionado, setMesSelecionado] = useState(null);
  const [showEditLimites, setShowEditLimites] = useState(false);
  const [filtroDonutGi, setFiltroDonutGi] = useState("Todos");
  const [filtroDonutArt, setFiltroDonutArt] = useState("Todos");

  // ── Carrega dados do Supabase na inicialização
  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [gastos, lims] = await Promise.all([fetchGastos(MESES), fetchLimites()]);
      setDados(gastos);
      setLimites(lims);
    } catch (e) {
      setError("Não foi possível conectar ao banco de dados. Verifique as credenciais do Supabase.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  // ── Adicionar gasto
  const addGasto = async (mes, { pessoa, desc, valor, cat, data }, onSuccess) => {
    setSaving(true);
    try {
      const novo = await insertGasto({ mes, pessoa, desc, valor, cat, data });
      setDados(prev => ({
        ...prev,
        [mes]: { ...prev[mes], [pessoa]: [...prev[mes][pessoa], novo] },
      }));
      onSuccess?.();
    } catch {
      setError("Erro ao salvar gasto. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  // ── Apagar gasto individual
  const handleDeleteItem = async (mes, pessoa, id) => {
    await deleteGasto(id);
    setDados(prev => ({
      ...prev,
      [mes]: { ...prev[mes], [pessoa]: prev[mes][pessoa].filter(g => g.id !== id) },
    }));
  };

  // ── Apagar todos os gastos de uma pessoa num mês
  const handleDeleteAll = async (mes, pessoa) => {
    await deleteGastosPessoaMes(mes, pessoa);
    setDados(prev => ({ ...prev, [mes]: { ...prev[mes], [pessoa]: [] } }));
  };

  // ── Salvar limites
  const handleSaveLimites = async (novos) => {
    setSaving(true);
    try {
      await saveLimites(novos);
      setLimites(novos);
      setShowEditLimites(false);
    } catch {
      setError("Erro ao salvar limites. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner />;

  if (mesSelecionado) {
    return (
      <DetalhesMes
        mes={mesSelecionado}
        data={dados[mesSelecionado]}
        limites={limites}
        onBack={() => setMesSelecionado(null)}
        onAdd={addGasto}
        onDeleteItem={handleDeleteItem}
        onDeleteAll={handleDeleteAll}
      />
    );
  }

  const lineData = MESES.slice(0, 6).map(m => ({
    mes: m.split("/")[0],
    gi: soma(dados[m].gi),
    art: soma(dados[m].art),
  }));

  const mesesComDados = MESES.filter(m => soma(dados[m].gi) > 0 || soma(dados[m].art) > 0);
  const gastosGiFiltrados = filtroDonutGi === "Todos" ? MESES.flatMap(m => dados[m].gi) : dados[filtroDonutGi]?.gi || [];
  const gastosArtFiltrados = filtroDonutArt === "Todos" ? MESES.flatMap(m => dados[m].art) : dados[filtroDonutArt]?.art || [];
  const totalGi = soma(gastosGiFiltrados);
  const totalArt = soma(gastosArtFiltrados);
  const pieGi = categoriasPie(gastosGiFiltrados);
  const pieArt = categoriasPie(gastosArtFiltrados);

  const selectStyle = (color, bg, border) => ({ fontSize: 11, fontWeight: 600, color, background: bg, border: `1.5px solid ${border}`, borderRadius: 7, padding: "3px 6px", cursor: "pointer", outline: "none", fontFamily: "'DM Sans', sans-serif" });

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      {showEditLimites && <EditLimitesModal limites={limites} onSave={handleSaveLimites} onClose={() => setShowEditLimites(false)} loading={saving} />}

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "36px 24px" }}>

        {error && <ErrorBanner message={error} onRetry={() => { setError(null); loadAll(); }} />}

        {/* Header */}
        <div style={{ marginBottom: 32, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, color: "#6366f1", textTransform: "uppercase", marginBottom: 6 }}>Mesada do Casal</div>
            <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800, color: "#0f172a" }}>💰 Controle de Gastos</h1>
            <div style={{ fontSize: 14, color: "#94a3b8", marginTop: 4 }}>
              💙 Gi: R$ {limites.gi} · 💜 Art: R$ {limites.art} · Clique em um mês para ver os detalhes
            </div>
          </div>
          <button onClick={() => setShowEditLimites(true)} style={{ marginTop: 8, background: "#fff", border: "1.5px solid #e2e8f0", color: "#6366f1", borderRadius: 10, padding: "9px 16px", fontWeight: 700, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#818cf8"; e.currentTarget.style.boxShadow = "0 4px 14px rgba(99,102,241,0.15)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.04)"; }}
          >✏️ Editar limites</button>
        </div>

        {/* Charts */}
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr", gap: 20, marginBottom: 32 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: "20px 20px 16px", border: "1.5px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", letterSpacing: 1, marginBottom: 4 }}>EVOLUÇÃO DOS GASTOS</div>
            <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
              {[["#3b82f6", "Gi"], ["#8b5cf6", "Art"]].map(([c, l]) => (
                <div key={l} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
                  <div style={{ width: 10, height: 3, borderRadius: 99, background: c }} /><span style={{ color: "#64748b" }}>{l}</span>
                </div>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={lineData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="gi" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient>
                  <linearGradient id="art" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.15} /><stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} /></linearGradient>
                </defs>
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => v > 0 ? `R$${v}` : ""} />
                <Tooltip formatter={(v, n) => [`R$ ${v}`, n === "gi" ? "Gi" : "Art"]} contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
                <Area type="monotone" dataKey="gi" stroke="#3b82f6" strokeWidth={2} fill="url(#gi)" dot={{ r: 4, fill: "#3b82f6", strokeWidth: 0 }} />
                <Area type="monotone" dataKey="art" stroke="#8b5cf6" strokeWidth={2} fill="url(#art)" dot={{ r: 4, fill: "#8b5cf6", strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {[
            { title: "GASTOS DA GI", filtro: filtroDonutGi, setFiltro: setFiltroDonutGi, pie: pieGi, total: totalGi, label: "💙 Gi", color: "#3b82f6", selColor: "#6366f1", selBg: "#f0f0ff", selBorder: "#c7d2fe" },
            { title: "GASTOS DO ART", filtro: filtroDonutArt, setFiltro: setFiltroDonutArt, pie: pieArt, total: totalArt, label: "💜 Art", color: "#8b5cf6", selColor: "#8b5cf6", selBg: "#f5f3ff", selBorder: "#ddd6fe" },
          ].map(d => (
            <div key={d.title} style={{ background: "#fff", borderRadius: 16, padding: 20, border: "1.5px solid #e2e8f0", display: "flex", flexDirection: "column", alignItems: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
              <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", letterSpacing: 1 }}>{d.title}</div>
                <select value={d.filtro} onChange={e => d.setFiltro(e.target.value)} style={selectStyle(d.selColor, d.selBg, d.selBorder)}>
                  <option value="Todos">Todos</option>
                  {mesesComDados.map(m => <option key={m} value={m}>{m.split("/")[0]}</option>)}
                </select>
              </div>
              <DonutChart data={d.pie} total={d.total} label={d.label} color={d.color} />
            </div>
          ))}
        </div>

        {/* Meses */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: "#64748b", textTransform: "uppercase", marginBottom: 14 }}>Meses · clique para ver detalhes</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14 }}>
            {MESES.map(m => <MesCard key={m} mes={m} data={dados[m]} limites={limites} onClick={() => setMesSelecionado(m)} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
