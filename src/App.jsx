import { useState, useEffect, useCallback } from "react";
import {
  PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Area, AreaChart, BarChart, Bar, Legend,
} from "recharts";
import {
  fetchGastos, insertGasto, deleteGasto, deleteGastosPessoaMes,
  fetchLimites, saveLimites,
  fetchWishlist, insertWishlistItem, updateWishlistComprado, deleteWishlistItem,
  fetchPoupanca, insertPoupanca, deletePoupanca,
} from "./supabase";

// ── CONSTANTS ─────────────────────────────────────────────────────────────────

const DEFAULT_LIMITES = { gi: 1000, art: 1000 };

const CATEGORIAS_COLORS = {
  "Alimentação": "#f97316", "Transporte": "#eab308", "Lazer": "#22c55e",
  "Saúde": "#ef4444", "Compras": "#ec4899", "Beleza": "#a855f7", "Outros": "#94a3b8",
};

const MESES = [
  "Março/2026","Abril/2026","Maio/2026","Junho/2026","Julho/2026","Agosto/2026",
  "Setembro/2026","Outubro/2026","Novembro/2026","Dezembro/2026",
];

const NIVEIS_DESEJO = [
  { key: "urgente",    label: "🔴 Urgente",     color: "#ef4444", bg: "#fef2f2", border: "#fecaca" },
  { key: "preciso",    label: "🟠 Preciso",      color: "#f97316", bg: "#fff7ed", border: "#fed7aa" },
  { key: "quero_muito",label: "🟣 Quero muito",  color: "#8b5cf6", bg: "#f5f3ff", border: "#ddd6fe" },
  { key: "quero",      label: "🔵 Quero",        color: "#3b82f6", bg: "#eff6ff", border: "#bfdbfe" },
  { key: "seria_legal",label: "⚪ Seria legal",  color: "#64748b", bg: "#f8fafc", border: "#e2e8f0" },
];

const NIVEL_MAP = Object.fromEntries(NIVEIS_DESEJO.map(n => [n.key, n]));

const emptyDados = () => Object.fromEntries(MESES.map(m => [m, { gi: [], art: [] }]));
const soma = arr => arr.reduce((s, i) => s + Number(i.valor), 0);
const categoriasPie = gastos => {
  const map = {};
  gastos.forEach(g => { map[g.cat] = (map[g.cat] || 0) + Number(g.valor); });
  return Object.entries(map).map(([name, value]) => ({ name, value }));
};

// ── RESPONSIVE HOOK ───────────────────────────────────────────────────────────

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return isMobile;
}

// ── GLOBAL STYLES ─────────────────────────────────────────────────────────────

const GLOBAL_CSS = `
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  * { box-sizing: border-box; }
  body { margin: 0; }
  input, select, textarea { font-family: 'DM Sans', sans-serif; }
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 99px; }
`;

// ── BASE COMPONENTS ───────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"100vh", gap:16, fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ width:40, height:40, borderRadius:"50%", border:"3px solid #e2e8f0", borderTopColor:"#6366f1", animation:"spin 0.8s linear infinite" }} />
      <div style={{ fontSize:14, color:"#94a3b8", fontWeight:600 }}>Carregando dados...</div>
    </div>
  );
}

function ErrorBanner({ message, onRetry }) {
  return (
    <div style={{ background:"#fef2f2", border:"1.5px solid #fecaca", borderRadius:12, padding:"14px 18px", marginBottom:20, display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ fontSize:13, color:"#ef4444", fontWeight:600 }}>⚠️ {message}</div>
      {onRetry && <button onClick={onRetry} style={{ background:"#ef4444", color:"#fff", border:"none", borderRadius:8, padding:"6px 14px", fontSize:12, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" }}>Tentar novamente</button>}
    </div>
  );
}

function ConfirmModal({ message, onConfirm, onCancel, loading }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.5)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ background:"#fff", borderRadius:16, padding:28, maxWidth:340, width:"100%", boxShadow:"0 20px 60px rgba(0,0,0,0.18)", fontFamily:"'DM Sans',sans-serif" }}>
        <div style={{ fontSize:22, marginBottom:10 }}>🗑️</div>
        <div style={{ fontWeight:700, fontSize:15, color:"#0f172a", marginBottom:8 }}>Confirmar exclusão</div>
        <div style={{ fontSize:13, color:"#64748b", marginBottom:22, lineHeight:1.5 }}>{message}</div>
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={onCancel} disabled={loading} style={{ flex:1, padding:10, borderRadius:9, border:"1.5px solid #e2e8f0", background:"#fff", color:"#64748b", fontWeight:600, cursor:"pointer", fontSize:13 }}>Cancelar</button>
          <button onClick={onConfirm} disabled={loading} style={{ flex:1, padding:10, borderRadius:9, border:"none", background:"#ef4444", color:"#fff", fontWeight:700, cursor:"pointer", fontSize:13, opacity:loading?0.6:1 }}>
            {loading ? "Apagando..." : "Apagar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SaldoBar({ gasto, limite }) {
  const pct = Math.min((gasto / limite) * 100, 100);
  const cor = pct > 90 ? "#ef4444" : pct > 70 ? "#f97316" : "#22c55e";
  const saldo = limite - gasto;
  return (
    <div style={{ width:"100%" }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
        <span style={{ fontSize:11, color:"#64748b", fontWeight:600 }}>R$ {gasto} / R$ {limite}</span>
        <span style={{ fontSize:11, fontWeight:700, color:saldo < 0 ? "#ef4444" : cor }}>
          {saldo < 0 ? `Excedido R$ ${Math.abs(saldo)}` : `Saldo: R$ ${saldo}`}
        </span>
      </div>
      <div style={{ height:6, borderRadius:99, background:"#e2e8f0", overflow:"hidden" }}>
        <div style={{ height:"100%", width:`${pct}%`, background:cor, borderRadius:99, transition:"width 0.6s ease" }} />
      </div>
    </div>
  );
}

// ── INPUT STYLES ──────────────────────────────────────────────────────────────

const inp = { border:"1.5px solid #e2e8f0", borderRadius:8, padding:"9px 12px", fontSize:13, outline:"none", width:"100%", fontFamily:"'DM Sans',sans-serif", background:"#f8fafc", color:"#0f172a" };

// ── NAV TAB BAR ───────────────────────────────────────────────────────────────

function NavBar({ aba, setAba }) {
  const tabs = [
    { id:"gastos",   icon:"💰", label:"Gastos"  },
    { id:"wishlist", icon:"✨", label:"Wishlist" },
    { id:"poupanca", icon:"🐷", label:"Poupança" },
  ];
  return (
    <div style={{ background:"#fff", borderBottom:"1.5px solid #e2e8f0", position:"sticky", top:0, zIndex:100, fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ maxWidth:960, margin:"0 auto", padding:"0 16px", display:"flex", alignItems:"center", gap:4 }}>
        <div style={{ fontSize:13, fontWeight:800, color:"#6366f1", paddingRight:12, borderRight:"1.5px solid #e2e8f0", marginRight:8, whiteSpace:"nowrap", padding:"14px 12px 14px 0" }}>
          Mesada do Casal
        </div>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setAba(t.id)} style={{
            padding:"14px 16px", border:"none", background:"none", cursor:"pointer",
            fontSize:13, fontWeight:700, fontFamily:"'DM Sans',sans-serif",
            color: aba === t.id ? "#6366f1" : "#64748b",
            borderBottom: aba === t.id ? "2.5px solid #6366f1" : "2.5px solid transparent",
            transition:"all 0.15s", display:"flex", alignItems:"center", gap:6, whiteSpace:"nowrap",
          }}>
            <span>{t.icon}</span><span>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── GASTOS PAGE ───────────────────────────────────────────────────────────────

function DonutChart({ data, total, label, color }) {
  const empty = total === 0;
  const displayData = empty ? [{ name:"vazio", value:1 }] : data;
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8 }}>
      <div style={{ position:"relative", width:130, height:130 }}>
        <PieChart width={130} height={130}>
          <Pie data={displayData} cx={60} cy={60} innerRadius={40} outerRadius={60} dataKey="value" startAngle={90} endAngle={-270} strokeWidth={0}>
            {displayData.map((entry, i) => (
              <Cell key={i} fill={empty ? "#e2e8f0" : (CATEGORIAS_COLORS[entry.name] || "#94a3b8")} />
            ))}
          </Pie>
        </PieChart>
        <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", textAlign:"center" }}>
          <div style={{ fontSize:16, fontWeight:800, color:"#0f172a" }}>
            {total >= 1000 ? `R$${(total/1000).toFixed(1)}K` : `R$${total}`}
          </div>
          <div style={{ fontSize:9, color:"#94a3b8", fontWeight:600, letterSpacing:1 }}>GASTO</div>
        </div>
      </div>
      <div style={{ fontSize:12, fontWeight:700, color, letterSpacing:0.5 }}>{label}</div>
      <div style={{ display:"flex", flexWrap:"wrap", gap:4, justifyContent:"center", maxWidth:150 }}>
        {data.map((d,i) => (
          <div key={i} style={{ display:"flex", alignItems:"center", gap:3 }}>
            <div style={{ width:7, height:7, borderRadius:2, background:CATEGORIAS_COLORS[d.name] || "#94a3b8" }} />
            <span style={{ fontSize:10, color:"#64748b" }}>{d.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MesCard({ mes, data, limites, onClick }) {
  const gastoGi = soma(data.gi), gastoArt = soma(data.art);
  const vazio = gastoGi === 0 && gastoArt === 0;
  return (
    <div onClick={onClick} style={{ background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:14, padding:"16px 18px", cursor:"pointer", transition:"all 0.18s", boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow="0 4px 18px rgba(99,102,241,0.13)"; e.currentTarget.style.borderColor="#818cf8"; e.currentTarget.style.transform="translateY(-2px)"; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow="0 1px 4px rgba(0,0,0,0.04)"; e.currentTarget.style.borderColor="#e2e8f0"; e.currentTarget.style.transform="translateY(0)"; }}
    >
      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10 }}>
        <div style={{ width:8, height:8, borderRadius:"50%", background:vazio?"#e2e8f0":"#6366f1" }} />
        <span style={{ fontWeight:700, fontSize:13, color:"#0f172a" }}>{mes}</span>
      </div>
      {vazio ? (
        <div style={{ fontSize:12, color:"#cbd5e1", textAlign:"center", padding:"8px 0" }}>Sem registros</div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          <div><div style={{ fontSize:11, color:"#3b82f6", fontWeight:700, marginBottom:3 }}>💙 Gi</div><SaldoBar gasto={gastoGi} limite={limites.gi} /></div>
          <div><div style={{ fontSize:11, color:"#8b5cf6", fontWeight:700, marginBottom:3 }}>💜 Art</div><SaldoBar gasto={gastoArt} limite={limites.art} /></div>
        </div>
      )}
    </div>
  );
}

function AddGastoForm({ onAdd, onClose, loading }) {
  const [pessoa, setPessoa] = useState("gi");
  const [desc, setDesc] = useState("");
  const [valor, setValor] = useState("");
  const [cat, setCat] = useState("Alimentação");
  const [data, setData] = useState("");
  const handle = () => { if (!desc || !valor) return; onAdd({ pessoa, desc, valor: parseFloat(valor), cat, data }); };
  return (
    <div style={{ background:"#fff", borderRadius:16, padding:20, display:"flex", flexDirection:"column", gap:12, border:"1.5px solid #e2e8f0" }}>
      <div style={{ fontWeight:800, fontSize:15, color:"#0f172a" }}>+ Novo Gasto</div>
      <div style={{ display:"flex", gap:8 }}>
        {["gi","art"].map(p => (
          <button key={p} onClick={() => setPessoa(p)} style={{ flex:1, padding:"8px", borderRadius:8, border:"1.5px solid", borderColor:pessoa===p?(p==="gi"?"#3b82f6":"#8b5cf6"):"#e2e8f0", background:pessoa===p?(p==="gi"?"#eff6ff":"#f5f3ff"):"#fff", color:pessoa===p?(p==="gi"?"#3b82f6":"#8b5cf6"):"#94a3b8", fontWeight:700, fontSize:13, cursor:"pointer" }}>
            {p==="gi"?"💙 Gi":"💜 Art"}
          </button>
        ))}
      </div>
      <input style={inp} placeholder="Descrição" value={desc} onChange={e => setDesc(e.target.value)} />
      <div style={{ display:"flex", gap:8 }}>
        <input style={{ ...inp, flex:1 }} placeholder="Valor (R$)" type="number" value={valor} onChange={e => setValor(e.target.value)} />
        <input style={{ ...inp, flex:1 }} placeholder="Data (dd/mm)" value={data} onChange={e => setData(e.target.value)} />
      </div>
      <select style={inp} value={cat} onChange={e => setCat(e.target.value)}>
        {Object.keys(CATEGORIAS_COLORS).map(c => <option key={c}>{c}</option>)}
      </select>
      <div style={{ display:"flex", gap:8 }}>
        <button onClick={onClose} disabled={loading} style={{ flex:1, padding:10, borderRadius:8, border:"1.5px solid #e2e8f0", background:"#fff", color:"#64748b", fontWeight:600, cursor:"pointer" }}>Cancelar</button>
        <button onClick={handle} disabled={loading} style={{ flex:2, padding:10, borderRadius:8, border:"none", background:"linear-gradient(135deg,#6366f1,#8b5cf6)", color:"#fff", fontWeight:700, cursor:"pointer", opacity:loading?0.7:1 }}>
          {loading?"Salvando...":"Salvar gasto"}
        </button>
      </div>
    </div>
  );
}

function GastoItem({ gasto: g, onDelete }) {
  const [hov, setHov] = useState(false);
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ background:"#fff", borderRadius:10, padding:"12px 14px", display:"flex", justifyContent:"space-between", alignItems:"center", border:"1.5px solid", borderColor:hov?"#fecaca":"#e2e8f0", transition:"border-color 0.15s" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, minWidth:0 }}>
        <div style={{ width:10, height:10, borderRadius:3, background:CATEGORIAS_COLORS[g.cat]||"#94a3b8", flexShrink:0 }} />
        <div style={{ minWidth:0 }}>
          <div style={{ fontWeight:600, fontSize:13, color:"#0f172a", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{g.desc}</div>
          <div style={{ fontSize:11, color:"#94a3b8" }}>{g.cat}{g.data?` · ${g.data}`:""}</div>
        </div>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
        <div style={{ fontWeight:700, fontSize:14, color:"#0f172a" }}>R$ {g.valor}</div>
        <button onClick={onDelete} style={{ background:hov?"#fef2f2":"transparent", border:hov?"1.5px solid #fecaca":"1.5px solid transparent", color:hov?"#ef4444":"#cbd5e1", borderRadius:7, width:28, height:28, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", fontSize:13, transition:"all 0.15s", padding:0 }}>✕</button>
      </div>
    </div>
  );
}

function EditLimitesModal({ limites, onSave, onClose, loading }) {
  const [gi, setGi] = useState(String(limites.gi));
  const [art, setArt] = useState(String(limites.art));
  const handle = () => {
    const novoGi = parseFloat(gi), novoArt = parseFloat(art);
    if (!novoGi || !novoArt || novoGi <= 0 || novoArt <= 0) return;
    onSave({ gi: novoGi, art: novoArt });
  };
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.5)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ background:"#fff", borderRadius:20, padding:28, maxWidth:380, width:"100%", boxShadow:"0 20px 60px rgba(0,0,0,0.18)", fontFamily:"'DM Sans',sans-serif" }}>
        <div style={{ fontSize:22, marginBottom:6 }}>✏️</div>
        <div style={{ fontWeight:800, fontSize:17, color:"#0f172a", marginBottom:4 }}>Editar limites de mesada</div>
        <div style={{ fontSize:13, color:"#94a3b8", marginBottom:24 }}>Limite individual por mês.</div>
        <div style={{ display:"flex", flexDirection:"column", gap:14, marginBottom:24 }}>
          {[{key:"gi",label:"💙 Gi",val:gi,set:setGi,color:"#3b82f6",bg:"#eff6ff"},{key:"art",label:"💜 Art",val:art,set:setArt,color:"#8b5cf6",bg:"#f5f3ff"}].map(p => (
            <div key={p.key} style={{ background:p.bg, borderRadius:12, padding:"14px 16px", border:`1.5px solid ${p.color}22` }}>
              <div style={{ fontSize:13, fontWeight:700, color:p.color, marginBottom:8 }}>{p.label}</div>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:14, fontWeight:700, color:"#64748b" }}>R$</span>
                <input style={{ ...inp, textAlign:"right", borderColor:p.color+"55" }} type="number" min="1" value={p.val} onChange={e => p.set(e.target.value)} />
              </div>
            </div>
          ))}
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={onClose} disabled={loading} style={{ flex:1, padding:11, borderRadius:10, border:"1.5px solid #e2e8f0", background:"#fff", color:"#64748b", fontWeight:600, cursor:"pointer", fontSize:13 }}>Cancelar</button>
          <button onClick={handle} disabled={loading} style={{ flex:2, padding:11, borderRadius:10, border:"none", background:"linear-gradient(135deg,#6366f1,#8b5cf6)", color:"#fff", fontWeight:700, cursor:"pointer", fontSize:13, opacity:loading?0.6:1 }}>
            {loading?"Salvando...":"Salvar limites"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetalhesMes({ mes, data, limites, onBack, onAdd, onDeleteItem, onDeleteAll }) {
  const [showForm, setShowForm] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const isMobile = useIsMobile();
  const gastoGi = soma(data.gi), gastoArt = soma(data.art);

  const handleConfirm = async () => {
    setActionLoading(true);
    try {
      if (confirm.type === "item") await onDeleteItem(mes, confirm.pessoa, confirm.id);
      if (confirm.type === "all") await onDeleteAll(mes, confirm.pessoa);
    } finally { setActionLoading(false); setConfirm(null); }
  };

  return (
    <div style={{ minHeight:"100vh", background:"#f8fafc", fontFamily:"'DM Sans',sans-serif" }}>
      {confirm && <ConfirmModal message={confirm.type==="all"?`Apagar todos os gastos de ${confirm.pessoa==="gi"?"Gi":"Art"} em ${mes}?`:`Apagar "${confirm.desc}"?`} onConfirm={handleConfirm} onCancel={() => setConfirm(null)} loading={actionLoading} />}
      <div style={{ maxWidth:720, margin:"0 auto", padding: isMobile ? "20px 14px" : "32px 20px" }}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:"#6366f1", fontWeight:700, cursor:"pointer", fontSize:14, marginBottom:20, display:"flex", alignItems:"center", gap:6, padding:0 }}>← Voltar ao painel</button>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:12 }}>
          <h2 style={{ margin:0, fontSize: isMobile ? 22 : 26, fontWeight:800, color:"#0f172a" }}>{mes}</h2>
          <button onClick={() => setShowForm(!showForm)} style={{ background:"linear-gradient(135deg,#6366f1,#8b5cf6)", color:"#fff", border:"none", borderRadius:10, padding:"10px 16px", fontWeight:700, cursor:"pointer", fontSize:13 }}>+ Adicionar gasto</button>
        </div>
        {showForm && <div style={{ marginBottom:20 }}><AddGastoForm onAdd={(g) => onAdd(mes, g, () => setShowForm(false))} onClose={() => setShowForm(false)} /></div>}
        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:14, marginBottom:24 }}>
          {[{key:"gi",label:"💙 Gi",gasto:gastoGi,color:"#3b82f6",bg:"#eff6ff"},{key:"art",label:"💜 Art",gasto:gastoArt,color:"#8b5cf6",bg:"#f5f3ff"}].map(p => (
            <div key={p.key} style={{ background:p.bg, borderRadius:14, padding:18, border:`1.5px solid ${p.color}22` }}>
              <div style={{ fontSize:14, fontWeight:700, color:p.color, marginBottom:2 }}>{p.label}</div>
              <div style={{ fontSize:11, color:"#94a3b8", marginBottom:6 }}>Limite: R$ {limites[p.key]}</div>
              <div style={{ fontSize:26, fontWeight:800, color:"#0f172a", marginBottom:8 }}>R$ {p.gasto}</div>
              <SaldoBar gasto={p.gasto} limite={limites[p.key]} />
            </div>
          ))}
        </div>
        {["gi","art"].map(pessoa => (
          <div key={pessoa} style={{ marginBottom:24 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
              <div style={{ fontSize:14, fontWeight:800, color:pessoa==="gi"?"#3b82f6":"#8b5cf6" }}>{pessoa==="gi"?"💙 Gastos da Gi":"💜 Gastos do Art"}</div>
              {data[pessoa].length > 0 && (
                <button onClick={() => setConfirm({type:"all",pessoa})} style={{ background:"#fef2f2", border:"1.5px solid #fecaca", color:"#ef4444", borderRadius:8, padding:"5px 10px", fontSize:12, fontWeight:700, cursor:"pointer" }}>🗑️ Apagar todos</button>
              )}
            </div>
            {data[pessoa].length === 0 ? (
              <div style={{ textAlign:"center", color:"#cbd5e1", fontSize:13, padding:"20px 0" }}>Nenhum gasto registrado</div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {data[pessoa].map(g => <GastoItem key={g.id} gasto={g} onDelete={() => setConfirm({type:"item",pessoa,id:g.id,desc:g.desc})} />)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function GastosPage({ dados, limites, loading, saving, error, onLoadAll, onAdd, onDeleteItem, onDeleteAll, onSaveLimites }) {
  const [mesSel, setMesSel] = useState(null);
  const [showEditLimites, setShowEditLimites] = useState(false);
  const [filtroGi, setFiltroGi] = useState("Todos");
  const [filtroArt, setFiltroArt] = useState("Todos");
  const isMobile = useIsMobile();

  if (loading) return <Spinner />;

  if (mesSel) {
    return (
      <DetalhesMes mes={mesSel} data={dados[mesSel]} limites={limites}
        onBack={() => setMesSel(null)} onAdd={onAdd}
        onDeleteItem={onDeleteItem} onDeleteAll={onDeleteAll} />
    );
  }

  const lineData = MESES.slice(0, 6).map(m => ({ mes: m.split("/")[0], gi: soma(dados[m].gi), art: soma(dados[m].art) }));
  const mesesComDados = MESES.filter(m => soma(dados[m].gi) > 0 || soma(dados[m].art) > 0);
  const gastosGiF = filtroGi === "Todos" ? MESES.flatMap(m => dados[m].gi) : dados[filtroGi]?.gi || [];
  const gastosArtF = filtroArt === "Todos" ? MESES.flatMap(m => dados[m].art) : dados[filtroArt]?.art || [];
  const totalGi = soma(gastosGiF), totalArt = soma(gastosArtF);
  const pieGi = categoriasPie(gastosGiF), pieArt = categoriasPie(gastosArtF);

  const selStyle = (color, bg, border) => ({ fontSize:11, fontWeight:600, color, background:bg, border:`1.5px solid ${border}`, borderRadius:7, padding:"3px 6px", cursor:"pointer", outline:"none", fontFamily:"'DM Sans',sans-serif" });

  return (
    <div style={{ maxWidth:960, margin:"0 auto", padding: isMobile ? "20px 14px" : "32px 24px", fontFamily:"'DM Sans',sans-serif" }}>
      {error && <ErrorBanner message={error} onRetry={onLoadAll} />}
      {showEditLimites && <EditLimitesModal limites={limites} onSave={(l) => { onSaveLimites(l); setShowEditLimites(false); }} onClose={() => setShowEditLimites(false)} loading={saving} />}

      {/* Header */}
      <div style={{ marginBottom:28, display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12 }}>
        <div>
          <h1 style={{ margin:0, fontSize: isMobile ? 24 : 30, fontWeight:800, color:"#0f172a" }}>💰 Controle de Gastos</h1>
          <div style={{ fontSize:13, color:"#94a3b8", marginTop:4 }}>💙 Gi: R$ {limites.gi} · 💜 Art: R$ {limites.art}</div>
        </div>
        <button onClick={() => setShowEditLimites(true)} style={{ background:"#fff", border:"1.5px solid #e2e8f0", color:"#6366f1", borderRadius:10, padding:"9px 14px", fontWeight:700, cursor:"pointer", fontSize:13, display:"flex", alignItems:"center", gap:6, boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>✏️ Editar limites</button>
      </div>

      {/* Charts */}
      <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1.6fr 1fr 1fr", gap:16, marginBottom:28 }}>
        <div style={{ background:"#fff", borderRadius:16, padding:"18px 18px 14px", border:"1.5px solid #e2e8f0", boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
          <div style={{ fontSize:11, fontWeight:700, color:"#64748b", letterSpacing:1, marginBottom:4 }}>EVOLUÇÃO DOS GASTOS</div>
          <div style={{ display:"flex", gap:14, marginBottom:10 }}>
            {[["#3b82f6","Gi"],["#8b5cf6","Art"]].map(([c,l]) => (
              <div key={l} style={{ display:"flex", alignItems:"center", gap:5, fontSize:12 }}>
                <div style={{ width:10, height:3, borderRadius:99, background:c }} /><span style={{ color:"#64748b" }}>{l}</span>
              </div>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={isMobile ? 140 : 160}>
            <AreaChart data={lineData} margin={{ top:5, right:5, left:-25, bottom:0 }}>
              <defs>
                <linearGradient id="gi" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient>
                <linearGradient id="art" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.15} /><stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} /></linearGradient>
              </defs>
              <XAxis dataKey="mes" tick={{ fontSize:10, fill:"#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize:9, fill:"#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => v > 0 ? `R$${v}` : ""} />
              <Tooltip formatter={(v,n) => [`R$ ${v}`, n==="gi"?"Gi":"Art"]} contentStyle={{ borderRadius:8, border:"1px solid #e2e8f0", fontSize:12 }} />
              <Area type="monotone" dataKey="gi" stroke="#3b82f6" strokeWidth={2} fill="url(#gi)" dot={{ r:3, fill:"#3b82f6", strokeWidth:0 }} />
              <Area type="monotone" dataKey="art" stroke="#8b5cf6" strokeWidth={2} fill="url(#art)" dot={{ r:3, fill:"#8b5cf6", strokeWidth:0 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {[
          { title:"GASTOS DA GI", filtro:filtroGi, setFiltro:setFiltroGi, pie:pieGi, total:totalGi, label:"💙 Gi", color:"#3b82f6", selC:"#6366f1", selBg:"#f0f0ff", selBr:"#c7d2fe" },
          { title:"GASTOS DO ART", filtro:filtroArt, setFiltro:setFiltroArt, pie:pieArt, total:totalArt, label:"💜 Art", color:"#8b5cf6", selC:"#8b5cf6", selBg:"#f5f3ff", selBr:"#ddd6fe" },
        ].map(d => (
          <div key={d.title} style={{ background:"#fff", borderRadius:16, padding:18, border:"1.5px solid #e2e8f0", display:"flex", flexDirection:"column", alignItems:"center", boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
            <div style={{ width:"100%", display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <div style={{ fontSize:11, fontWeight:700, color:"#64748b", letterSpacing:1 }}>{d.title}</div>
              <select value={d.filtro} onChange={e => d.setFiltro(e.target.value)} style={selStyle(d.selC, d.selBg, d.selBr)}>
                <option value="Todos">Todos</option>
                {mesesComDados.map(m => <option key={m} value={m}>{m.split("/")[0]}</option>)}
              </select>
            </div>
            <DonutChart data={d.pie} total={d.total} label={d.label} color={d.color} />
          </div>
        ))}
      </div>

      {/* Meses grid */}
      <div>
        <div style={{ fontSize:11, fontWeight:700, letterSpacing:1, color:"#64748b", textTransform:"uppercase", marginBottom:12 }}>Meses · clique para ver detalhes</div>
        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fill, minmax(180px,1fr))", gap:12 }}>
          {MESES.map(m => <MesCard key={m} mes={m} data={dados[m]} limites={limites} onClick={() => setMesSel(m)} />)}
        </div>
      </div>
    </div>
  );
}

// ── WISHLIST PAGE ─────────────────────────────────────────────────────────────

function AddWishlistForm({ onAdd, onClose, loading }) {
  const [pessoa, setPessoa] = useState("gi");
  const [nome, setNome] = useState("");
  const [link, setLink] = useState("");
  const [valor, setValor] = useState("");
  const [mes, setMes] = useState("");
  const [nivel, setNivel] = useState("quero");

  const handle = () => {
    if (!nome || !valor) return;
    onAdd({ pessoa, nome, link, valor: parseFloat(valor), mes_planejado: mes, nivel_desejo: nivel });
  };

  return (
    <div style={{ background:"#fff", borderRadius:16, padding:20, display:"flex", flexDirection:"column", gap:12, border:"1.5px solid #e2e8f0", animation:"fadeIn 0.2s ease" }}>
      <div style={{ fontWeight:800, fontSize:15, color:"#0f172a" }}>✨ Novo item na Wishlist</div>
      <div style={{ display:"flex", gap:8 }}>
        {["gi","art"].map(p => (
          <button key={p} onClick={() => setPessoa(p)} style={{ flex:1, padding:"8px", borderRadius:8, border:"1.5px solid", borderColor:pessoa===p?(p==="gi"?"#3b82f6":"#8b5cf6"):"#e2e8f0", background:pessoa===p?(p==="gi"?"#eff6ff":"#f5f3ff"):"#fff", color:pessoa===p?(p==="gi"?"#3b82f6":"#8b5cf6"):"#94a3b8", fontWeight:700, fontSize:13, cursor:"pointer" }}>
            {p==="gi"?"💙 Gi":"💜 Art"}
          </button>
        ))}
      </div>
      <input style={inp} placeholder="Nome do item *" value={nome} onChange={e => setNome(e.target.value)} />
      <input style={inp} placeholder="Link (Shopee, Amazon...)" value={link} onChange={e => setLink(e.target.value)} />
      <div style={{ display:"flex", gap:8 }}>
        <input style={{ ...inp, flex:1 }} placeholder="Valor (R$) *" type="number" value={valor} onChange={e => setValor(e.target.value)} />
        <select style={{ ...inp, flex:1 }} value={mes} onChange={e => setMes(e.target.value)}>
          <option value="">Mês planejado</option>
          {MESES.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div>
        <div style={{ fontSize:12, fontWeight:700, color:"#64748b", marginBottom:6 }}>Nível de desejo</div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
          {NIVEIS_DESEJO.map(n => (
            <button key={n.key} onClick={() => setNivel(n.key)} style={{ padding:"5px 10px", borderRadius:20, border:`1.5px solid ${nivel===n.key ? n.color : "#e2e8f0"}`, background:nivel===n.key ? n.bg : "#fff", color:nivel===n.key ? n.color : "#94a3b8", fontWeight:nivel===n.key?700:500, fontSize:12, cursor:"pointer", transition:"all 0.15s" }}>
              {n.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display:"flex", gap:8 }}>
        <button onClick={onClose} disabled={loading} style={{ flex:1, padding:10, borderRadius:8, border:"1.5px solid #e2e8f0", background:"#fff", color:"#64748b", fontWeight:600, cursor:"pointer" }}>Cancelar</button>
        <button onClick={handle} disabled={loading} style={{ flex:2, padding:10, borderRadius:8, border:"none", background:"linear-gradient(135deg,#6366f1,#8b5cf6)", color:"#fff", fontWeight:700, cursor:"pointer", opacity:loading?0.7:1 }}>
          {loading?"Salvando...":"Adicionar à wishlist"}
        </button>
      </div>
    </div>
  );
}

function WishlistItem({ item, onToggle, onDelete }) {
  const [hov, setHov] = useState(false);
  const nivel = NIVEL_MAP[item.nivel_desejo] || NIVEL_MAP["quero"];
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ background:"#fff", borderRadius:12, padding:"14px 16px", border:`1.5px solid ${hov?"#c7d2fe":"#e2e8f0"}`, transition:"all 0.15s", opacity:item.comprado?0.6:1 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10 }}>
        <div style={{ display:"flex", gap:10, flex:1, minWidth:0 }}>
          <button onClick={() => onToggle(!item.comprado)} style={{ marginTop:2, width:20, height:20, borderRadius:6, border:`2px solid ${item.comprado?"#22c55e":"#cbd5e1"}`, background:item.comprado?"#22c55e":"#fff", cursor:"pointer", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", padding:0, transition:"all 0.15s" }}>
            {item.comprado && <span style={{ color:"#fff", fontSize:11, fontWeight:800 }}>✓</span>}
          </button>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
              <span style={{ fontWeight:700, fontSize:14, color:"#0f172a", textDecoration:item.comprado?"line-through":"none" }}>{item.nome}</span>
              <span style={{ fontSize:11, fontWeight:700, color:nivel.color, background:nivel.bg, border:`1px solid ${nivel.border}`, borderRadius:20, padding:"1px 8px" }}>{nivel.label}</span>
            </div>
            <div style={{ display:"flex", gap:10, marginTop:4, flexWrap:"wrap" }}>
              <span style={{ fontSize:13, fontWeight:700, color:"#6366f1" }}>R$ {Number(item.valor).toFixed(2)}</span>
              {item.mes_planejado && <span style={{ fontSize:12, color:"#94a3b8" }}>📅 {item.mes_planejado}</span>}
              {item.link && (
                <a href={item.link} target="_blank" rel="noopener noreferrer" style={{ fontSize:12, color:"#3b82f6", textDecoration:"none", display:"flex", alignItems:"center", gap:3 }}>🔗 Ver item</a>
              )}
            </div>
          </div>
        </div>
        <button onClick={onDelete} style={{ background:hov?"#fef2f2":"transparent", border:hov?"1.5px solid #fecaca":"1.5px solid transparent", color:hov?"#ef4444":"#cbd5e1", borderRadius:7, width:28, height:28, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", fontSize:13, transition:"all 0.15s", padding:0, flexShrink:0 }}>✕</button>
      </div>
    </div>
  );
}

function WishlistPage({ wishlist, onAdd, onToggle, onDelete, error }) {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [filtroPessoa, setFiltroPessoa] = useState("todos");
  const [filtroNivel, setFiltroNivel] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("pendente");
  const isMobile = useIsMobile();

  const handleAdd = async (dados) => {
    setSaving(true);
    try { await onAdd(dados); setShowForm(false); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setSaving(true);
    try { await onDelete(confirm.id); }
    finally { setSaving(false); setConfirm(null); }
  };

  const filtrado = wishlist.filter(item => {
    if (filtroPessoa !== "todos" && item.pessoa !== filtroPessoa) return false;
    if (filtroNivel !== "todos" && item.nivel_desejo !== filtroNivel) return false;
    if (filtroStatus === "pendente" && item.comprado) return false;
    if (filtroStatus === "comprado" && !item.comprado) return false;
    return true;
  });

  const totalWishlist = filtrado.filter(i => !i.comprado).reduce((s, i) => s + Number(i.valor), 0);
  const giTotal = wishlist.filter(i => !i.comprado && i.pessoa==="gi").reduce((s,i) => s + Number(i.valor), 0);
  const artTotal = wishlist.filter(i => !i.comprado && i.pessoa==="art").reduce((s,i) => s + Number(i.valor), 0);

  return (
    <div style={{ maxWidth:960, margin:"0 auto", padding: isMobile ? "20px 14px" : "32px 24px", fontFamily:"'DM Sans',sans-serif" }}>
      {confirm && <ConfirmModal message={`Remover "${confirm.nome}" da wishlist?`} onConfirm={handleDelete} onCancel={() => setConfirm(null)} loading={saving} />}

      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12, marginBottom:24 }}>
        <div>
          <h1 style={{ margin:0, fontSize: isMobile ? 24 : 30, fontWeight:800, color:"#0f172a" }}>✨ Wishlist do Casal</h1>
          <div style={{ fontSize:13, color:"#94a3b8", marginTop:4 }}>Itens que vocês querem comprar</div>
        </div>
        <button onClick={() => setShowForm(!showForm)} style={{ background:"linear-gradient(135deg,#6366f1,#8b5cf6)", color:"#fff", border:"none", borderRadius:10, padding:"10px 16px", fontWeight:700, cursor:"pointer", fontSize:13 }}>+ Adicionar item</button>
      </div>

      {/* Resumo */}
      <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr", gap:12, marginBottom:24 }}>
        {[
          { label:"💙 Desejado pela Gi", valor:giTotal, color:"#3b82f6", bg:"#eff6ff" },
          { label:"💜 Desejado pelo Art", valor:artTotal, color:"#8b5cf6", bg:"#f5f3ff" },
          { label:"✨ Total pendente", valor:totalWishlist, color:"#6366f1", bg:"#eef2ff" },
        ].map((c, i) => (
          <div key={i} style={{ background:c.bg, borderRadius:14, padding:"16px 18px", border:`1.5px solid ${c.color}22` }}>
            <div style={{ fontSize:11, fontWeight:700, color:c.color, marginBottom:4 }}>{c.label}</div>
            <div style={{ fontSize:22, fontWeight:800, color:"#0f172a" }}>R$ {c.valor.toFixed(2)}</div>
          </div>
        ))}
      </div>

      {showForm && <div style={{ marginBottom:20 }}><AddWishlistForm onAdd={handleAdd} onClose={() => setShowForm(false)} loading={saving} /></div>}

      {/* Filtros */}
      <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
        <select value={filtroPessoa} onChange={e => setFiltroPessoa(e.target.value)} style={{ ...inp, width:"auto", fontSize:12, padding:"6px 10px" }}>
          <option value="todos">👥 Todos</option>
          <option value="gi">💙 Gi</option>
          <option value="art">💜 Art</option>
        </select>
        <select value={filtroNivel} onChange={e => setFiltroNivel(e.target.value)} style={{ ...inp, width:"auto", fontSize:12, padding:"6px 10px" }}>
          <option value="todos">Todos os níveis</option>
          {NIVEIS_DESEJO.map(n => <option key={n.key} value={n.key}>{n.label}</option>)}
        </select>
        <div style={{ display:"flex", gap:6 }}>
          {[["pendente","Pendentes"],["comprado","Comprados"],["todos","Todos"]].map(([val,lab]) => (
            <button key={val} onClick={() => setFiltroStatus(val)} style={{ padding:"6px 12px", borderRadius:20, border:`1.5px solid ${filtroStatus===val?"#6366f1":"#e2e8f0"}`, background:filtroStatus===val?"#eef2ff":"#fff", color:filtroStatus===val?"#6366f1":"#64748b", fontWeight:filtroStatus===val?700:500, fontSize:12, cursor:"pointer" }}>
              {lab}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {filtrado.length === 0 ? (
        <div style={{ textAlign:"center", padding:"48px 0", color:"#cbd5e1" }}>
          <div style={{ fontSize:48, marginBottom:12 }}>✨</div>
          <div style={{ fontSize:14, fontWeight:600 }}>Nenhum item encontrado</div>
          <div style={{ fontSize:12, marginTop:4 }}>Adicione itens à wishlist para começar!</div>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {filtrado.map(item => (
            <WishlistItem key={item.id} item={item}
              onToggle={(c) => onToggle(item.id, c)}
              onDelete={() => setConfirm({ id: item.id, nome: item.nome })} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── POUPANÇA PAGE ─────────────────────────────────────────────────────────────

function AddPoupancaForm({ onAdd, onClose, loading }) {
  const [pessoa, setPessoa] = useState("gi");
  const [mes, setMes] = useState(MESES[0]);
  const [valor, setValor] = useState("");
  const [desc, setDesc] = useState("");
  const handle = () => {
    if (!valor || !mes) return;
    onAdd({ pessoa, mes, valor: parseFloat(valor), descricao: desc });
  };
  return (
    <div style={{ background:"#fff", borderRadius:16, padding:20, display:"flex", flexDirection:"column", gap:12, border:"1.5px solid #e2e8f0", animation:"fadeIn 0.2s ease" }}>
      <div style={{ fontWeight:800, fontSize:15, color:"#0f172a" }}>🐷 Guardar na poupança</div>
      <div style={{ display:"flex", gap:8 }}>
        {["gi","art"].map(p => (
          <button key={p} onClick={() => setPessoa(p)} style={{ flex:1, padding:"8px", borderRadius:8, border:"1.5px solid", borderColor:pessoa===p?(p==="gi"?"#3b82f6":"#8b5cf6"):"#e2e8f0", background:pessoa===p?(p==="gi"?"#eff6ff":"#f5f3ff"):"#fff", color:pessoa===p?(p==="gi"?"#3b82f6":"#8b5cf6"):"#94a3b8", fontWeight:700, fontSize:13, cursor:"pointer" }}>
            {p==="gi"?"💙 Gi":"💜 Art"}
          </button>
        ))}
      </div>
      <select style={inp} value={mes} onChange={e => setMes(e.target.value)}>
        {MESES.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <input style={inp} placeholder="Valor (R$) *" type="number" value={valor} onChange={e => setValor(e.target.value)} />
      <input style={inp} placeholder="Para que está guardando? (ex: viagem, TV...)" value={desc} onChange={e => setDesc(e.target.value)} />
      <div style={{ display:"flex", gap:8 }}>
        <button onClick={onClose} disabled={loading} style={{ flex:1, padding:10, borderRadius:8, border:"1.5px solid #e2e8f0", background:"#fff", color:"#64748b", fontWeight:600, cursor:"pointer" }}>Cancelar</button>
        <button onClick={handle} disabled={loading} style={{ flex:2, padding:10, borderRadius:8, border:"none", background:"linear-gradient(135deg,#22c55e,#16a34a)", color:"#fff", fontWeight:700, cursor:"pointer", opacity:loading?0.7:1 }}>
          {loading?"Salvando...":"Guardar valor"}
        </button>
      </div>
    </div>
  );
}

function PoupancaPage({ poupanca, onAdd, onDelete, error }) {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const isMobile = useIsMobile();

  const handleAdd = async (dados) => {
    setSaving(true);
    try { await onAdd(dados); setShowForm(false); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setSaving(true);
    try { await onDelete(confirm.id); }
    finally { setSaving(false); setConfirm(null); }
  };

  const totalGi = poupanca.filter(p => p.pessoa==="gi").reduce((s,p) => s + Number(p.valor), 0);
  const totalArt = poupanca.filter(p => p.pessoa==="art").reduce((s,p) => s + Number(p.valor), 0);
  const totalGeral = totalGi + totalArt;

  // Gráfico: acumulado mês a mês
  const chartData = MESES.map(mes => {
    const gi = poupanca.filter(p => p.pessoa==="gi" && p.mes===mes).reduce((s,p) => s + Number(p.valor), 0);
    const art = poupanca.filter(p => p.pessoa==="art" && p.mes===mes).reduce((s,p) => s + Number(p.valor), 0);
    return { mes: mes.split("/")[0], gi, art };
  });

  // Acumulado
  let accGi = 0, accArt = 0;
  const chartAcc = chartData.map(d => {
    accGi += d.gi; accArt += d.art;
    return { mes: d.mes, gi: accGi, art: accArt, total: accGi + accArt };
  });

  // Agrupar por mês para exibição
  const porMes = MESES.map(mes => ({
    mes,
    itens: poupanca.filter(p => p.mes === mes),
  })).filter(g => g.itens.length > 0);

  return (
    <div style={{ maxWidth:960, margin:"0 auto", padding: isMobile ? "20px 14px" : "32px 24px", fontFamily:"'DM Sans',sans-serif" }}>
      {confirm && <ConfirmModal message={`Remover este registro de poupança?`} onConfirm={handleDelete} onCancel={() => setConfirm(null)} loading={saving} />}

      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12, marginBottom:24 }}>
        <div>
          <h1 style={{ margin:0, fontSize: isMobile ? 24 : 30, fontWeight:800, color:"#0f172a" }}>🐷 Poupança do Casal</h1>
          <div style={{ fontSize:13, color:"#94a3b8", marginTop:4 }}>Valores guardados mês a mês</div>
        </div>
        <button onClick={() => setShowForm(!showForm)} style={{ background:"linear-gradient(135deg,#22c55e,#16a34a)", color:"#fff", border:"none", borderRadius:10, padding:"10px 16px", fontWeight:700, cursor:"pointer", fontSize:13 }}>+ Guardar valor</button>
      </div>

      {/* Cards de total */}
      <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap:12, marginBottom:24 }}>
        {[
          { label:"💙 Poupança da Gi", valor:totalGi, color:"#3b82f6", bg:"#eff6ff", emoji:"💙" },
          { label:"💜 Poupança do Art", valor:totalArt, color:"#8b5cf6", bg:"#f5f3ff", emoji:"💜" },
          { label:"🐷 Total guardado", valor:totalGeral, color:"#16a34a", bg:"#f0fdf4", emoji:"🐷" },
        ].map((c,i) => (
          <div key={i} style={{ background:c.bg, borderRadius:14, padding:"18px 20px", border:`1.5px solid ${c.color}22` }}>
            <div style={{ fontSize:11, fontWeight:700, color:c.color, marginBottom:4 }}>{c.label}</div>
            <div style={{ fontSize:28, fontWeight:800, color:"#0f172a" }}>R$ {c.valor.toFixed(2)}</div>
          </div>
        ))}
      </div>

      {showForm && <div style={{ marginBottom:20 }}><AddPoupancaForm onAdd={handleAdd} onClose={() => setShowForm(false)} loading={saving} /></div>}

      {/* Gráficos */}
      {poupanca.length > 0 && (
        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:16, marginBottom:28 }}>
          {/* Guardado por mês */}
          <div style={{ background:"#fff", borderRadius:16, padding:"18px 18px 12px", border:"1.5px solid #e2e8f0", boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#64748b", letterSpacing:1, marginBottom:12 }}>GUARDADO POR MÊS</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData.filter(d => d.gi > 0 || d.art > 0)} margin={{ top:5, right:5, left:-20, bottom:0 }}>
                <XAxis dataKey="mes" tick={{ fontSize:10, fill:"#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize:9, fill:"#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => `R$${v}`} />
                <Tooltip formatter={(v,n) => [`R$ ${v}`, n==="gi"?"Gi":"Art"]} contentStyle={{ borderRadius:8, border:"1px solid #e2e8f0", fontSize:12 }} />
                <Legend formatter={v => v==="gi"?"💙 Gi":"💜 Art"} />
                <Bar dataKey="gi" fill="#3b82f6" radius={[4,4,0,0]} />
                <Bar dataKey="art" fill="#8b5cf6" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {/* Acumulado */}
          <div style={{ background:"#fff", borderRadius:16, padding:"18px 18px 12px", border:"1.5px solid #e2e8f0", boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#64748b", letterSpacing:1, marginBottom:12 }}>ACUMULADO TOTAL</div>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={chartAcc.filter(d => d.total > 0)} margin={{ top:5, right:5, left:-20, bottom:0 }}>
                <defs>
                  <linearGradient id="accTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="mes" tick={{ fontSize:10, fill:"#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize:9, fill:"#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => `R$${v}`} />
                <Tooltip formatter={(v) => [`R$ ${v}`, "Total guardado"]} contentStyle={{ borderRadius:8, border:"1px solid #e2e8f0", fontSize:12 }} />
                <Area type="monotone" dataKey="total" stroke="#22c55e" strokeWidth={2.5} fill="url(#accTotal)" dot={{ r:4, fill:"#22c55e", strokeWidth:0 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Lista por mês */}
      {porMes.length === 0 ? (
        <div style={{ textAlign:"center", padding:"48px 0", color:"#cbd5e1" }}>
          <div style={{ fontSize:48, marginBottom:12 }}>🐷</div>
          <div style={{ fontSize:14, fontWeight:600 }}>Nenhum valor guardado ainda</div>
          <div style={{ fontSize:12, marginTop:4 }}>Comece guardando parte da sua mesada!</div>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          {porMes.map(({ mes, itens }) => {
            const totalMesGi = itens.filter(i=>i.pessoa==="gi").reduce((s,i)=>s+Number(i.valor),0);
            const totalMesArt = itens.filter(i=>i.pessoa==="art").reduce((s,i)=>s+Number(i.valor),0);
            return (
              <div key={mes}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                  <div style={{ fontSize:13, fontWeight:800, color:"#0f172a" }}>{mes}</div>
                  <div style={{ display:"flex", gap:12, fontSize:12, color:"#64748b" }}>
                    {totalMesGi > 0 && <span style={{ color:"#3b82f6", fontWeight:700 }}>💙 R$ {totalMesGi.toFixed(2)}</span>}
                    {totalMesArt > 0 && <span style={{ color:"#8b5cf6", fontWeight:700 }}>💜 R$ {totalMesArt.toFixed(2)}</span>}
                  </div>
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {itens.map(item => (
                    <div key={item.id} style={{ background:"#fff", borderRadius:10, padding:"12px 14px", border:"1.5px solid #e2e8f0", display:"flex", justifyContent:"space-between", alignItems:"center", gap:10 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10, flex:1, minWidth:0 }}>
                        <div style={{ width:10, height:10, borderRadius:"50%", background:item.pessoa==="gi"?"#3b82f6":"#8b5cf6", flexShrink:0 }} />
                        <div style={{ minWidth:0 }}>
                          <div style={{ fontWeight:600, fontSize:13, color:"#0f172a" }}>
                            {item.pessoa==="gi"?"💙 Gi":"💜 Art"}
                            {item.descricao ? ` · ${item.descricao}` : ""}
                          </div>
                          <div style={{ fontSize:11, color:"#94a3b8" }}>{new Date(item.created_at).toLocaleDateString("pt-BR")}</div>
                        </div>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
                        <div style={{ fontWeight:700, fontSize:14, color:"#22c55e" }}>+R$ {Number(item.valor).toFixed(2)}</div>
                        <button onClick={() => setConfirm({ id: item.id })} style={{ background:"transparent", border:"1.5px solid transparent", color:"#cbd5e1", borderRadius:7, width:28, height:28, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", fontSize:13, padding:0, transition:"all 0.15s" }}
                          onMouseEnter={e => { e.currentTarget.style.background="#fef2f2"; e.currentTarget.style.borderColor="#fecaca"; e.currentTarget.style.color="#ef4444"; }}
                          onMouseLeave={e => { e.currentTarget.style.background="transparent"; e.currentTarget.style.borderColor="transparent"; e.currentTarget.style.color="#cbd5e1"; }}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────

export default function App() {
  const [aba, setAba] = useState("gastos");
  const [dados, setDados] = useState(emptyDados());
  const [limites, setLimites] = useState(DEFAULT_LIMITES);
  const [wishlist, setWishlist] = useState([]);
  const [poupanca, setPoupanca] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [gastos, lims, wl, poups] = await Promise.all([
        fetchGastos(MESES), fetchLimites(), fetchWishlist(), fetchPoupanca(),
      ]);
      setDados(gastos);
      setLimites(lims);
      setWishlist(wl);
      setPoupanca(poups);
    } catch {
      setError("Não foi possível conectar ao banco de dados.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Gastos
  const addGasto = async (mes, { pessoa, desc, valor, cat, data }, onSuccess) => {
    setSaving(true);
    try {
      const novo = await insertGasto({ mes, pessoa, desc, valor, cat, data });
      setDados(prev => ({ ...prev, [mes]: { ...prev[mes], [pessoa]: [...prev[mes][pessoa], novo] } }));
      onSuccess?.();
    } catch { setError("Erro ao salvar gasto."); }
    finally { setSaving(false); }
  };

  const handleDeleteItem = async (mes, pessoa, id) => {
    await deleteGasto(id);
    setDados(prev => ({ ...prev, [mes]: { ...prev[mes], [pessoa]: prev[mes][pessoa].filter(g => g.id !== id) } }));
  };

  const handleDeleteAll = async (mes, pessoa) => {
    await deleteGastosPessoaMes(mes, pessoa);
    setDados(prev => ({ ...prev, [mes]: { ...prev[mes], [pessoa]: [] } }));
  };

  const handleSaveLimites = async (novos) => {
    setSaving(true);
    try { await saveLimites(novos); setLimites(novos); }
    catch { setError("Erro ao salvar limites."); }
    finally { setSaving(false); }
  };

  // ── Wishlist
  const addWishlistItem = async (dados) => {
    const novo = await insertWishlistItem(dados);
    setWishlist(prev => [novo, ...prev]);
  };

  const toggleWishlistItem = async (id, comprado) => {
    await updateWishlistComprado(id, comprado);
    setWishlist(prev => prev.map(i => i.id === id ? { ...i, comprado } : i));
  };

  const removeWishlistItem = async (id) => {
    await deleteWishlistItem(id);
    setWishlist(prev => prev.filter(i => i.id !== id));
  };

  // ── Poupança
  const addPoupanca = async (dados) => {
    const novo = await insertPoupanca(dados);
    setPoupanca(prev => [...prev, novo]);
  };

  const removePoupanca = async (id) => {
    await deletePoupanca(id);
    setPoupanca(prev => prev.filter(p => p.id !== id));
  };

  if (loading) return <Spinner />;

  return (
    <div style={{ minHeight:"100vh", background:"#f8fafc", fontFamily:"'DM Sans',sans-serif" }}>
      <style>{GLOBAL_CSS}</style>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <NavBar aba={aba} setAba={setAba} />
      {aba === "gastos" && (
        <GastosPage dados={dados} limites={limites} loading={false} saving={saving} error={error}
          onLoadAll={() => { setError(null); loadAll(); }}
          onAdd={addGasto} onDeleteItem={handleDeleteItem} onDeleteAll={handleDeleteAll}
          onSaveLimites={handleSaveLimites} />
      )}
      {aba === "wishlist" && (
        <WishlistPage wishlist={wishlist} error={error}
          onAdd={addWishlistItem} onToggle={toggleWishlistItem} onDelete={removeWishlistItem} />
      )}
      {aba === "poupanca" && (
        <PoupancaPage poupanca={poupanca} error={error}
          onAdd={addPoupanca} onDelete={removePoupanca} />
      )}
    </div>
  );
}
