import React, { useState, useEffect, useCallback } from "react";
import {
  Rocket, Target, Check, X, AlertTriangle, Trophy, Radio, Plus, Trash2,
  ChevronRight, Landmark, Lock, Loader2,
} from "lucide-react";
import { db, ref, onValue, set as fbSet } from "./firebase";

const TECH_COST = 70;
const MISSILE_COST = 30;
const SHIELD_COST = 30;
const ECOLOGY_COST = 25;
const ECOLOGY_BONUS = 0.05;
const CAPITAL_INCOME = 10;
const CITY_INCOME = 5;
const START_GOLD = 100;

const uid = () => Math.random().toString(36).slice(2, 9);

async function hashPassword(pw) {
  const enc = new TextEncoder().encode(pw.trim());
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function freshCountry(name, capitalName, cityNames, passwordHash) {
  return {
    id: uid(),
    name,
    passwordHash,
    gold: START_GOLD,
    techResearched: false,
    techReadyRound: null,
    missiles: 0,
    ecologyLevel: 0,
    eliminated: false,
    cities: [
      { name: capitalName, capital: true, alive: true, shielded: false },
      ...cityNames.map((n) => ({ name: n, capital: false, alive: true, shielded: false })),
    ],
  };
}

function countryIncome(country) {
  const base = country.cities.reduce(
    (sum, c) => (c.alive ? sum + (c.capital ? CAPITAL_INCOME : CITY_INCOME) : sum),
    0
  );
  return Math.round(base * (1 + ECOLOGY_BONUS * country.ecologyLevel));
}

function aliveCities(country) {
  return country.cities.filter((c) => c.alive);
}

function canBuildMissiles(country, round) {
  return country.techResearched && country.techReadyRound !== null && round >= country.techReadyRound;
}

const emptyState = { round: 1, countries: [], log: [], started: false, ended: false, gmPasswordHash: null };

// ============================================================================
// FIREBASE-BACKED STATE (real-time, синхронно на всех устройствах)
// ============================================================================
function useGameState() {
  const [state, setState] = useState(emptyState);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const stateRef = ref(db, "gameState");
    const unsub = onValue(
      stateRef,
      (snap) => {
        const val = snap.val();
        setState(val || emptyState);
        setLoaded(true);
      },
      () => setLoaded(true)
    );
    return () => unsub();
  }, []);

  const saveState = useCallback((next) => {
    fbSet(ref(db, "gameState"), next);
  }, []);

  return [state, saveState, loaded];
}

function useRoundOrders(round) {
  const [orders, setOrders] = useState({});
  useEffect(() => {
    const ordersRef = ref(db, `orders/${round}`);
    const unsub = onValue(ordersRef, (snap) => setOrders(snap.val() || {}));
    return () => unsub();
  }, [round]);
  return orders;
}

function useMyOrder(round, countryId) {
  const [order, setOrder] = useState(null);
  useEffect(() => {
    if (!countryId) return;
    const orderRef = ref(db, `orders/${round}/${countryId}`);
    const unsub = onValue(orderRef, (snap) => setOrder(snap.val() || null));
    return () => unsub();
  }, [round, countryId]);
  return order;
}

function saveOrder(round, countryId, order) {
  fbSet(ref(db, `orders/${round}/${countryId}`), order);
}

function resetGame() {
  fbSet(ref(db, "gameState"), null);
  fbSet(ref(db, "orders"), null);
  try {
    Object.keys(sessionStorage).forEach((k) => {
      if (k.startsWith("mg_")) sessionStorage.removeItem(k);
    });
  } catch {}
}

// ============================================================================
// ERROR BOUNDARY (чтобы вместо белого экрана было видно, что сломалось)
// ============================================================================
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("App crashed:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <Shell>
          <Header title="Что-то сломалось" subtitle="Ошибка в приложении — текст ниже поможет её найти" />
          <Panel className="p-5">
            <pre className="mono text-xs text-[#D1453A] whitespace-pre-wrap break-words">
              {String(this.state.error && (this.state.error.stack || this.state.error.message || this.state.error))}
            </pre>
            <button onClick={() => window.location.reload()} className="btn-ghost mt-4">
              Перезагрузить страницу
            </button>
          </Panel>
        </Shell>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}

// ============================================================================
// ROOT
// ============================================================================
function AppInner() {
  const [role, setRole] = useState(null);
  const [state, saveState, loaded] = useGameState();

  const fullReset = useCallback(() => {
    resetGame();
    setRole(null);
  }, []);

  if (!loaded) {
    return (
      <Shell>
        <div className="flex items-center gap-3 text-[#8A93A0] justify-center py-24">
          <Loader2 className="animate-spin" size={20} />
          <span className="tracking-wide uppercase text-sm">Связь со штабом…</span>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {!role && <RoleSelect onSelect={setRole} />}
      {role === "gm" && <GmView state={state} saveState={saveState} onBack={() => setRole(null)} onFullReset={fullReset} />}
      {role === "player" && <PlayerView state={state} onBack={() => setRole(null)} />}
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div
      className="min-h-full w-full"
      style={{
        background: "radial-gradient(1200px 600px at 50% -10%, #1b2128 0%, #101317 55%, #0c0e11 100%)",
        color: "#ECEEEF",
        fontFamily: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
      }}
    >
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.25} }
        .blinker { animation: blink 1.6s ease-in-out infinite; }
        .mono { font-family: 'JetBrains Mono','Courier New',monospace; }
        .input { background:#101317;border:1px solid #2A3138;border-radius:8px;padding:10px 12px;font-size:14px;color:#ECEEEF; outline:none; width:100%; }
        .input:focus { border-color:#E8A33D; }
        .btn-amber { background:#E8A33D;color:#171200;font-weight:700;text-transform:uppercase;letter-spacing:.05em;font-size:13px;padding:10px 18px;border-radius:8px;border:none;cursor:pointer; }
        .btn-amber:disabled { opacity:.4;cursor:not-allowed; }
        .btn-ghost { border:1px solid #2A3138; color:#ECEEEF; font-size:13px; padding:9px 16px; border-radius:8px;background:transparent;cursor:pointer; }
        .btn-ghost:disabled { opacity:.3;cursor:not-allowed; }
        .select { background:#101317;border:1px solid #2A3138;border-radius:8px;padding:9px 10px;font-size:13px;color:#ECEEEF;cursor:pointer; }
      `}</style>
      <div className="max-w-5xl mx-auto px-4 py-8 sm:px-8 sm:py-10">{children}</div>
    </div>
  );
}

function Header({ title, subtitle, onBack }) {
  return (
    <div className="flex items-start justify-between mb-8 border-b border-[#2A3138] pb-5">
      <div>
        <div className="flex items-center gap-2 text-[#E8A33D] text-xs tracking-[0.25em] uppercase mb-1 mono">
          <Radio size={13} className="blinker" /> Мировое господство · Штаб
        </div>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight uppercase">{title}</h1>
        {subtitle && <p className="text-[#8A93A0] mt-1 text-sm">{subtitle}</p>}
      </div>
      {onBack && (
        <button onClick={onBack} className="text-xs uppercase tracking-wide text-[#8A93A0] hover:text-[#ECEEEF] border border-[#2A3138] rounded-md px-3 py-2 transition">
          Выйти
        </button>
      )}
    </div>
  );
}

function Panel({ children, className = "" }) {
  return (
    <div className={`rounded-xl border border-[#2A3138] bg-[#171B1F] shadow-[0_1px_0_rgba(255,255,255,0.03)_inset] ${className}`}>
      {children}
    </div>
  );
}

// ============================================================================
// PASSWORD GATE (переиспользуемый)
// ============================================================================
function PasswordGate({ title, subtitle, expectedHash, onSuccess, onBack, sessionKey }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const submit = async () => {
    if (!pw) return;
    setChecking(true);
    const h = await hashPassword(pw);
    if (h === expectedHash) {
      try { sessionStorage.setItem(sessionKey, "1"); } catch {}
      onSuccess();
    } else {
      setError("Неверный пароль");
    }
    setChecking(false);
  };

  return (
    <div>
      <Header title={title} subtitle={subtitle} onBack={onBack} />
      <Panel className="p-6 max-w-sm mx-auto text-center">
        <Lock className="mx-auto text-[#E8A33D] mb-4" size={28} />
        <input
          type="password"
          value={pw}
          onChange={(e) => { setPw(e.target.value); setError(""); }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Пароль"
          className="input text-center mb-3"
          autoFocus
        />
        {error && <div className="text-[#D1453A] text-xs mb-3">{error}</div>}
        <button onClick={submit} disabled={checking || !pw} className="btn-amber w-full">
          {checking ? "Проверка…" : "Войти"}
        </button>
      </Panel>
    </div>
  );
}

function useUnlocked(sessionKey) {
  const [unlocked] = useState(() => {
    try { return sessionStorage.getItem(sessionKey) === "1"; } catch { return false; }
  });
  return unlocked;
}

// ============================================================================
// ROLE SELECT
// ============================================================================
function RoleSelect({ onSelect }) {
  return (
    <div>
      <Header title="Мировое господство" subtitle="Выберите, как вы заходите в игру" />
      <div className="grid sm:grid-cols-2 gap-5">
        <button onClick={() => onSelect("gm")} className="text-left p-6 rounded-xl border border-[#2A3138] bg-[#171B1F] hover:border-[#E8A33D] transition group">
          <Landmark className="text-[#E8A33D] mb-4" size={28} />
          <div className="text-lg font-bold uppercase tracking-wide">Я ведущий</div>
          <p className="text-[#8A93A0] text-sm mt-2">Настройка стран, приём приказов, разрешение раундов.</p>
          <div className="flex items-center gap-1 text-[#E8A33D] text-xs uppercase tracking-wide mt-4 opacity-0 group-hover:opacity-100 transition">
            Открыть штаб <ChevronRight size={14} />
          </div>
        </button>
        <button onClick={() => onSelect("player")} className="text-left p-6 rounded-xl border border-[#2A3138] bg-[#171B1F] hover:border-[#5FA05B] transition group">
          <Target className="text-[#5FA05B] mb-4" size={28} />
          <div className="text-lg font-bold uppercase tracking-wide">Я играю за страну</div>
          <p className="text-[#8A93A0] text-sm mt-2">Выберите свою страну и отправьте приказ на раунд.</p>
          <div className="flex items-center gap-1 text-[#5FA05B] text-xs uppercase tracking-wide mt-4 opacity-0 group-hover:opacity-100 transition">
            Отправить приказ <ChevronRight size={14} />
          </div>
        </button>
      </div>
    </div>
  );
}

function DangerZone({ onReset }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const canConfirm = text.trim().toUpperCase() === "СТЕРЕТЬ";

  return (
    <Panel className="p-5 mt-10 border-[#D1453A]">
      <div className="flex items-center gap-2 text-[#D1453A] font-bold uppercase mb-2 text-sm">
        <AlertTriangle size={16} /> Опасная зона
      </div>
      <p className="text-xs text-[#8A93A0] mb-4">
        Полностью завершает игру и безвозвратно удаляет все данные: пароли, страны, ресурсы и все приказы.
        Все участники увидят чистую, ещё не созданную игру.
      </p>
      {!open ? (
        <button onClick={() => setOpen(true)} className="btn-ghost border-[#D1453A] text-[#D1453A]">
          <Trash2 size={14} className="inline mr-1.5 -mt-0.5" /> Завершить игру и очистить все данные
        </button>
      ) : (
        <div className="space-y-3 max-w-sm">
          <p className="text-xs">
            Чтобы подтвердить, введите слово <b className="text-[#D1453A]">СТЕРЕТЬ</b>
          </p>
          <input value={text} onChange={(e) => setText(e.target.value)} className="input" placeholder="СТЕРЕТЬ" />
          <div className="flex gap-2">
            <button onClick={() => { setOpen(false); setText(""); }} className="btn-ghost">Отмена</button>
            <button
              disabled={!canConfirm}
              onClick={onReset}
              className="bg-[#D1453A] text-white font-bold uppercase tracking-wide text-xs px-4 py-2.5 rounded-lg disabled:opacity-30"
            >
              Подтвердить удаление
            </button>
          </div>
        </div>
      )}
    </Panel>
  );
}

// ============================================================================
// GM VIEW (с паролем на комнату)
// ============================================================================
function GmView({ state, saveState, onBack, onFullReset }) {
  const alreadyUnlocked = useUnlocked("mg_gm_unlocked");
  const [unlocked, setUnlocked] = useState(alreadyUnlocked);

  if (!state.gmPasswordHash) {
    return <GmCreateRoom saveState={saveState} onBack={onBack} />;
  }

  if (!unlocked) {
    return (
      <PasswordGate
        title="Комната ведущего"
        subtitle="Введите пароль ведущего"
        expectedHash={state.gmPasswordHash}
        onSuccess={() => setUnlocked(true)}
        onBack={onBack}
        sessionKey="mg_gm_unlocked"
      />
    );
  }

  if (!state.started) {
    return <GmSetup state={state} saveState={saveState} onBack={onBack} onFullReset={onFullReset} />;
  }
  return <GmDashboard state={state} saveState={saveState} onBack={onBack} onFullReset={onFullReset} />;
}

function GmCreateRoom({ saveState, onBack }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (pw.length < 4) return setError("Минимум 4 символа");
    if (pw !== pw2) return setError("Пароли не совпадают");
    setSaving(true);
    const hash = await hashPassword(pw);
    saveState({ ...emptyState, gmPasswordHash: hash });
    try { sessionStorage.setItem("mg_gm_unlocked", "1"); } catch {}
    setSaving(false);
  };

  return (
    <div>
      <Header title="Создание комнаты" subtitle="Придумайте пароль ведущего — он понадобится, чтобы зайти в штаб с другого устройства" onBack={onBack} />
      <Panel className="p-6 max-w-sm mx-auto">
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Пароль ведущего" className="input mb-3" />
        <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Повторите пароль" className="input mb-3" />
        {error && <div className="text-[#D1453A] text-xs mb-3">{error}</div>}
        <button onClick={create} disabled={saving} className="btn-amber w-full">Создать комнату</button>
      </Panel>
    </div>
  );
}

function GmSetup({ state, saveState, onBack, onFullReset }) {
  const [name, setName] = useState("");
  const [capital, setCapital] = useState("");
  const [c2, setC2] = useState("");
  const [c3, setC3] = useState("");
  const [c4, setC4] = useState("");
  const [pw, setPw] = useState("");

  const addCountry = async () => {
    if (!name.trim() || !capital.trim() || !c2.trim() || !c3.trim() || !c4.trim() || pw.length < 4) return;
    const hash = await hashPassword(pw);
    const country = freshCountry(name.trim(), capital.trim(), [c2.trim(), c3.trim(), c4.trim()], hash);
    saveState({ ...state, countries: [...state.countries, country] });
    setName(""); setCapital(""); setC2(""); setC3(""); setC4(""); setPw("");
  };

  const removeCountry = (id) => saveState({ ...state, countries: state.countries.filter((c) => c.id !== id) });

  const startGame = () => {
    saveState({ ...state, started: true, round: 1, log: [{ round: 0, text: "Игра началась. Приём приказов на раунд 1." }] });
  };

  const canAdd = name.trim() && capital.trim() && c2.trim() && c3.trim() && c4.trim() && pw.length >= 4;

  return (
    <div>
      <Header title="Штаб · Настройка" subtitle="Добавьте страны и придумайте пароль для каждой" onBack={onBack} />

      <Panel className="p-5 mb-6">
        <div className="text-sm uppercase tracking-wide text-[#8A93A0] mb-4">Новая страна</div>
        <div className="grid sm:grid-cols-5 gap-3 mb-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Название страны" className="input" />
          <input value={capital} onChange={(e) => setCapital(e.target.value)} placeholder="Столица ★" className="input" />
          <input value={c2} onChange={(e) => setC2(e.target.value)} placeholder="Город 2" className="input" />
          <input value={c3} onChange={(e) => setC3(e.target.value)} placeholder="Город 3" className="input" />
          <input value={c4} onChange={(e) => setC4(e.target.value)} placeholder="Город 4" className="input" />
        </div>
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Пароль страны (мин. 4 символа) — сообщите его игрокам лично" className="input mb-3 sm:max-w-sm" />
        <button onClick={addCountry} disabled={!canAdd} className="btn-amber inline-flex items-center gap-2">
          <Plus size={16} /> Добавить страну
        </button>
      </Panel>

      {state.countries.length > 0 && (
        <Panel className="p-5 mb-6">
          <div className="text-sm uppercase tracking-wide text-[#8A93A0] mb-4">Страны ({state.countries.length})</div>
          <div className="space-y-2">
            {state.countries.map((c) => (
              <div key={c.id} className="flex items-center justify-between bg-[#101317] border border-[#2A3138] rounded-lg px-4 py-3">
                <div>
                  <div className="font-bold">{c.name}</div>
                  <div className="text-xs text-[#8A93A0] mono mt-0.5">
                    {c.cities.map((ci) => (ci.capital ? `★${ci.name}` : ci.name)).join(" · ")}
                  </div>
                </div>
                <button onClick={() => removeCountry(c.id)} className="text-[#D1453A] hover:opacity-70">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <p className="text-xs text-[#8A93A0] mt-3">
            Пароли не хранятся в открытом виде и не показываются здесь — запишите их себе отдельно (например в заметки), когда придумываете.
          </p>
        </Panel>
      )}

      <button onClick={startGame} disabled={state.countries.length < 2} className="btn-amber disabled:opacity-30 w-full py-4 text-base flex items-center justify-center gap-2">
        Начать игру ({state.countries.length} стран) <ChevronRight size={18} />
      </button>
      {state.countries.length < 2 && <p className="text-center text-xs text-[#8A93A0] mt-2">Добавьте минимум 2 страны</p>}

      <DangerZone onReset={onFullReset} />
    </div>
  );
}

function GmDashboard({ state, saveState, onBack, onFullReset }) {
  const orders = useRoundOrders(state.round);
  const [armed, setArmed] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [showScores, setShowScores] = useState(false);

  const activeCountries = state.countries.filter((c) => !c.eliminated);
  const submittedCount = Object.keys(orders).length;

  const resolveRound = () => {
    setResolving(true);
    const round = state.round;
    const countries = state.countries.map((c) => ({ ...c, cities: c.cities.map((ci) => ({ ...ci })) }));
    const log = [];

    for (const c of countries) {
      if (c.eliminated) continue;
      const income = countryIncome(c);
      c.gold += income;
      log.push(`💰 ${c.name}: доход ${income} золота (казна: ${c.gold})`);
    }

    for (const c of countries) {
      if (c.eliminated) continue;
      const order = orders[c.id];
      if (!order) continue;
      let spend = 0;
      if (order.buyTech && !c.techResearched) spend += TECH_COST;
      const missileEligible = canBuildMissiles(c, round);
      const missileQty = missileEligible ? order.buyMissiles || 0 : 0;
      spend += missileQty * MISSILE_COST;
      const validShields = (order.buyShields || []).filter((name) => {
        const city = c.cities.find((ci) => ci.name === name);
        return city && city.alive && !city.shielded;
      });
      spend += validShields.length * SHIELD_COST;
      const ecoQty = order.buyEcology || 0;
      spend += ecoQty * ECOLOGY_COST;

      if (spend > c.gold) { log.push(`⚠️ ${c.name}: приказ превышал бюджет`); continue; }
      c.gold -= spend;
      if (order.buyTech && !c.techResearched) {
        c.techResearched = true;
        c.techReadyRound = round + 1;
        log.push(`⚛️ ${c.name} запускает ядерную программу`);
      }
      if (missileQty > 0) { c.missiles += missileQty; log.push(`🚀 ${c.name} строит ракеты: +${missileQty}`); }
      for (const name of validShields) {
        const city = c.cities.find((ci) => ci.name === name);
        city.shielded = true;
      }
      if (ecoQty > 0) { c.ecologyLevel += ecoQty; log.push(`🌱 ${c.name} экология: +${ecoQty}`); }
    }

    const flatLaunches = [];
    for (const c of countries) {
      const order = orders[c.id];
      if (!order || c.eliminated) continue;
      const seen = new Set();
      for (const l of order.launches || []) {
        const key = l.targetCountryId + "::" + l.targetCity;
        if (seen.has(key)) continue;
        seen.add(key);
        if (c.missiles > 0) { c.missiles -= 1; flatLaunches.push({ attackerId: c.id, ...l }); }
      }
    }
    for (const l of flatLaunches) {
      const target = countries.find((c) => c.id === l.targetCountryId);
      if (!target || target.eliminated) continue;
      const city = target.cities.find((ci) => ci.name === l.targetCity);
      if (!city || !city.alive) continue;
      if (city.shielded) { city.shielded = false; log.push(`🛡️💥 Щит города ${city.name} (${target.name}) сбит`); }
      else { city.alive = false; log.push(`💥 Город ${city.name} (${target.name}) уничтожен!`); }
    }

    for (const c of countries) {
      if (!c.eliminated && c.cities.every((ci) => !ci.alive)) { c.eliminated = true; log.push(`☠️ ${c.name} выбывает из игры!`); }
    }

    const remaining = countries.filter((c) => !c.eliminated);
    let ended = state.ended;
    if (remaining.length === 1 && countries.length > 1) { log.push(`🏆 ЯДЕРНАЯ ПОБЕДА: ${remaining[0].name}!`); ended = true; }

    saveState({ ...state, countries, round: round + 1, log: [...state.log, ...log.map((text) => ({ round, text }))], ended });
    setResolving(false);
    setArmed(false);
  };

  return (
    <div>
      <Header title={`Раунд ${state.round}`} subtitle={`Приказы: ${submittedCount} / ${activeCountries.length}`} onBack={onBack} />

      {state.ended && (
        <Panel className="p-5 mb-6 border-[#E8A33D]">
          <div className="flex items-center gap-2 text-[#E8A33D] font-bold uppercase mb-2"><Trophy size={18} /> Игра окончена</div>
        </Panel>
      )}

      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        {state.countries.map((c) => {
          const order = orders[c.id];
          return (
            <Panel key={c.id} className={`p-4 ${c.eliminated ? "opacity-40" : ""}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="font-bold uppercase tracking-wide">{c.name}</div>
                {c.eliminated ? (
                  <span className="text-xs text-[#D1453A] uppercase mono">выбыла</span>
                ) : order ? (
                  <span className="text-xs text-[#5FA05B] uppercase flex items-center gap-1 mono"><Check size={12} /> получен</span>
                ) : (
                  <span className="text-xs text-[#8A93A0] uppercase mono">ждём</span>
                )}
              </div>
              <div className="text-xs text-[#8A93A0] mono grid grid-cols-2 gap-y-1">
                <span>Золото: {c.gold}</span>
                <span>Ракеты: {c.missiles}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {c.cities.map((ci) => (
                  <span key={ci.name} className={`text-[11px] px-2 py-1 rounded-full border mono ${
                    !ci.alive ? "border-[#D1453A] text-[#D1453A] line-through" :
                    ci.shielded ? "border-[#5FA05B] text-[#5FA05B]" : "border-[#2A3138] text-[#ECEEEF]"
                  }`}>
                    {ci.capital ? "★" : ""}{ci.name}
                  </span>
                ))}
              </div>
            </Panel>
          );
        })}
      </div>

      {!state.ended && (
        <Panel className="p-5 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="font-bold uppercase tracking-wide flex items-center gap-2">
              <AlertTriangle size={16} className="text-[#E8A33D]" /> Раунд {state.round}
            </div>
            <div className="flex items-center gap-3">
              {!armed ? (
                <button onClick={() => setArmed(true)} className="btn-ghost">Подготовить</button>
              ) : (
                <>
                  <button onClick={() => setArmed(false)} className="btn-ghost">Отмена</button>
                  <button onClick={resolveRound} disabled={resolving} className="bg-[#D1453A] text-white font-bold uppercase tracking-wide text-sm px-6 py-3 rounded-lg flex items-center gap-2 disabled:opacity-50">
                    <Rocket size={16} /> Разрешить раунд
                  </button>
                </>
              )}
            </div>
          </div>
        </Panel>
      )}

      <button onClick={() => setShowScores((s) => !s)} className="btn-ghost mb-4 flex items-center gap-2">
        <Trophy size={14} /> {showScores ? "Скрыть" : "Показать"} очки
      </button>
      {showScores && <ScoreTable countries={state.countries} />}

      <DangerZone onReset={onFullReset} />
    </div>
  );
}

function ScoreTable({ countries }) {
  const scored = countries
    .map((c) => {
      const normalAlive = c.cities.filter((ci) => ci.alive && !ci.capital).length;
      const capitalAlive = c.cities.some((ci) => ci.alive && ci.capital);
      const score = c.gold + normalAlive * 15 + (capitalAlive ? 30 : 0) + c.missiles * 5;
      return { ...c, score };
    })
    .sort((a, b) => b.score - a.score);
  return (
    <Panel className="p-5 mb-6">
      <div className="text-sm uppercase tracking-wide text-[#8A93A0] mb-3">Таблица очков</div>
      <div className="space-y-2">
        {scored.map((c) => (
          <div key={c.id} className="flex items-center justify-between bg-[#101317] border border-[#2A3138] rounded-lg px-4 py-2.5">
            <span className="font-bold">{c.name}</span>
            <span className="mono font-bold text-[#E8A33D]">{c.score}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ============================================================================
// PLAYER VIEW (с паролем на страну)
// ============================================================================
function PlayerView({ state, onBack }) {
  const [countryId, setCountryId] = useState(null);
  const [unlocked, setUnlocked] = useState(false);

  if (!state.started) {
    return (
      <div>
        <Header title="Игра ещё не началась" onBack={onBack} />
        <p className="text-[#8A93A0]">Дождитесь, пока ведущий запустит партию</p>
      </div>
    );
  }

  if (!countryId) {
    return (
      <div>
        <Header title="Выберите страну" onBack={onBack} />
        <div className="grid sm:grid-cols-2 gap-4">
          {state.countries.map((c) => (
            <button
              key={c.id}
              disabled={c.eliminated}
              onClick={() => {
                setCountryId(c.id);
                let already = false;
                try { already = sessionStorage.getItem(`mg_country_${c.id}`) === "1"; } catch {}
                setUnlocked(already);
              }}
              className="text-left p-5 rounded-xl border border-[#2A3138] bg-[#171B1F] hover:border-[#5FA05B] transition disabled:opacity-30"
            >
              <div className="font-bold uppercase tracking-wide">{c.name}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const country = state.countries.find((c) => c.id === countryId);

  if (!unlocked) {
    return (
      <PasswordGate
        title={country.name}
        subtitle="Введите пароль, который вам сообщил ведущий"
        expectedHash={country.passwordHash}
        onSuccess={() => setUnlocked(true)}
        onBack={() => setCountryId(null)}
        sessionKey={`mg_country_${country.id}`}
      />
    );
  }

  return <OrderForm state={state} countryId={countryId} onBack={() => setCountryId(null)} />;
}

function OrderForm({ state, countryId, onBack }) {
  const country = state.countries.find((c) => c.id === countryId);
  const existingOrder = useMyOrder(state.round, countryId);
  const [buyTech, setBuyTech] = useState(false);
  const [buyMissiles, setBuyMissiles] = useState(0);
  const [buyShields, setBuyShields] = useState([]);
  const [buyEcology, setBuyEcology] = useState(0);
  const [launches, setLaunches] = useState([]);
  const [launchTargetCountry, setLaunchTargetCountry] = useState("");
  const [launchTargetCity, setLaunchTargetCity] = useState("");

  if (!country) return null;
  const submitted = !!existingOrder;

  const income = countryIncome(country);
  const available = country.gold + income;
  const missileEligible = canBuildMissiles(country, state.round);
  const totalMissilesAvailable = country.missiles + (missileEligible ? buyMissiles : 0);

  const cost =
    (buyTech && !country.techResearched ? TECH_COST : 0) +
    (missileEligible ? buyMissiles * MISSILE_COST : 0) +
    buyShields.length * SHIELD_COST +
    buyEcology * ECOLOGY_COST;

  const overBudget = cost > available;
  const overLaunches = launches.length > totalMissilesAvailable;

  const targetCountries = state.countries.filter((c) => c.id !== countryId && !c.eliminated);
  const targetCities = launchTargetCountry
    ? aliveCities(state.countries.find((c) => c.id === launchTargetCountry) || { cities: [] })
    : [];

  const toggleShield = (name) => setBuyShields((s) => (s.includes(name) ? s.filter((n) => n !== name) : [...s, name]));

  const addLaunch = () => {
    if (!launchTargetCountry || !launchTargetCity) return;
    const dup = launches.some((l) => l.targetCountryId === launchTargetCountry && l.targetCity === launchTargetCity);
    if (dup || launches.length >= totalMissilesAvailable) return;
    setLaunches((l) => [...l, { targetCountryId: launchTargetCountry, targetCity: launchTargetCity }]);
    setLaunchTargetCity("");
  };

  const removeLaunch = (idx) => setLaunches((l) => l.filter((_, i) => i !== idx));

  const submit = () => {
    if (overBudget || overLaunches) return;
    saveOrder(state.round, countryId, {
      countryId,
      buyTech: buyTech && !country.techResearched,
      buyMissiles: missileEligible ? buyMissiles : 0,
      buyShields,
      buyEcology,
      launches,
      submittedAt: Date.now(),
    });
  };

  return (
    <div>
      <Header title={country.name} subtitle={`Раунд ${state.round} · Приказ`} onBack={onBack} />

      <Panel className="p-5 mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mono text-sm">
          <div><div className="text-[#8A93A0] text-xs uppercase mb-1">Казна</div>{country.gold}</div>
          <div><div className="text-[#8A93A0] text-xs uppercase mb-1">+ доход</div>+{income}</div>
          <div><div className="text-[#8A93A0] text-xs uppercase mb-1">Ракеты</div>{country.missiles}</div>
          <div><div className="text-[#8A93A0] text-xs uppercase mb-1">Экология</div>+{country.ecologyLevel * 5}%</div>
        </div>
      </Panel>

      {submitted ? (
        <Panel className="p-6 mb-6 border-[#5FA05B] text-center">
          <Check className="mx-auto text-[#5FA05B] mb-2" size={28} />
          <div className="font-bold uppercase tracking-wide">Приказ отправлен</div>
        </Panel>
      ) : (
        <>
          <Panel className="p-5 mb-6">
            <div className="text-sm uppercase tracking-wide text-[#8A93A0] mb-4">Покупки</div>
            <div className="space-y-3">
              <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${country.techResearched ? "opacity-40" : buyTech ? "border-[#E8A33D]" : "border-[#2A3138]"}`}>
                <input type="checkbox" disabled={country.techResearched} checked={buyTech} onChange={(e) => setBuyTech(e.target.checked)} />
                <div className="text-sm">Ядерная технология — {TECH_COST} золота</div>
              </label>
              <div className="p-3 rounded-lg border border-[#2A3138]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm">Ракеты {!missileEligible && "(нет технологии)"}</span>
                  <NumberStepper value={buyMissiles} setValue={setBuyMissiles} disabled={!missileEligible} />
                </div>
                <div className="text-xs text-[#8A93A0]">{MISSILE_COST} золота за штуку</div>
              </div>
              <div className="p-3 rounded-lg border border-[#2A3138]">
                <div className="text-sm mb-2">Щиты — {SHIELD_COST} золота</div>
                <div className="flex flex-wrap gap-2">
                  {aliveCities(country).map((ci) => (
                    <button key={ci.name} onClick={() => toggleShield(ci.name)} className={`text-xs px-3 py-1.5 rounded-full border ${buyShields.includes(ci.name) ? "border-[#5FA05B] bg-[#5FA05B22]" : "border-[#2A3138]"}`}>
                      {ci.name}
                    </button>
                  ))}
                </div>
              </div>
              <div className="p-3 rounded-lg border border-[#2A3138]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm">Экология (+5% доход за уровень)</span>
                  <NumberStepper value={buyEcology} setValue={setBuyEcology} />
                </div>
                <div className="text-xs text-[#8A93A0]">{ECOLOGY_COST} золота за уровень</div>
              </div>
            </div>
          </Panel>

          <Panel className="p-5 mb-6">
            <div className="text-sm uppercase tracking-wide text-[#8A93A0] mb-3">Пуск ракет</div>
            <p className="text-xs text-[#8A93A0] mb-3">Доступно: {totalMissilesAvailable} ракет</p>
            <div className="flex flex-wrap gap-2 mb-3">
              <select value={launchTargetCountry} onChange={(e) => { setLaunchTargetCountry(e.target.value); setLaunchTargetCity(""); }} className="select">
                <option value="">Страна…</option>
                {targetCountries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select value={launchTargetCity} onChange={(e) => setLaunchTargetCity(e.target.value)} disabled={!launchTargetCountry} className="select">
                <option value="">Город…</option>
                {targetCities.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
              <button onClick={addLaunch} disabled={!launchTargetCity} className="btn-ghost">Добавить</button>
            </div>
            <div className="space-y-1">
              {launches.map((l, i) => {
                const tc = state.countries.find((c) => c.id === l.targetCountryId);
                return (
                  <div key={i} className="flex items-center justify-between bg-[#101317] border border-[#2A3138] rounded-lg px-3 py-2 text-xs">
                    <span>{tc?.name} — {l.targetCity}</span>
                    <button onClick={() => removeLaunch(i)} className="text-[#D1453A]"><X size={14} /></button>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel className="p-5 flex items-center justify-between flex-wrap gap-4">
            <div className={`text-sm ${overBudget ? "text-[#D1453A]" : ""}`}>Стоимость: {cost} / {available} доступно</div>
            <button onClick={submit} disabled={overBudget || overLaunches} className="bg-[#5FA05B] text-[#0C1A0C] font-bold uppercase tracking-wide text-sm px-6 py-3 rounded-lg flex items-center gap-2 disabled:opacity-30">
              <Check size={16} /> Отправить
            </button>
          </Panel>
        </>
      )}
    </div>
  );
}

function NumberStepper({ value, setValue, disabled }) {
  return (
    <div className="flex items-center gap-2">
      <button disabled={disabled} onClick={() => setValue(Math.max(0, value - 1))} className="w-7 h-7 border border-[#2A3138] rounded text-sm disabled:opacity-30">−</button>
      <span className="w-4 text-center text-sm">{value}</span>
      <button disabled={disabled} onClick={() => setValue(value + 1)} className="w-7 h-7 border border-[#2A3138] rounded text-sm disabled:opacity-30">+</button>
    </div>
  );
}

