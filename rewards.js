// Premios derivados 100 % del historial: funciones puras, sin estado propio.
import { localDate, dayIdx, addDays, mondayOf } from './engine.js';

const DEFAULT_GOAL = 3;
export const MINUTES_GOAL = 150;
const MAX_SHIELDS = 2;
const SHIELD_EVERY = 4;

const goalOf = (week) => {
  const m = Number(week?.min);
  return Number.isFinite(m) && m > 0 ? Math.floor(m) : DEFAULT_GOAL;
};

function parseMs(fecha) {
  if (typeof fecha !== 'string') return NaN;
  const s = /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? `${fecha}T12:00` : fecha;
  return Date.parse(s);
}

export function activeMinutes(session) {
  const real = Number(session?.segundos_real);
  let m = Number.isFinite(real) && real > 0 ? Math.round(real / 60) : Number(session?.minutos_plan);
  if (!Number.isFinite(m) || m < 0) m = 0;
  return Math.min(180, Math.round(m));
}

// Sesiones válidas ordenadas + agrupación por semana (lunes). No muta la entrada.
function prepare(history, week, now) {
  const goal = goalOf(week);
  const list = [];
  for (const s of Array.isArray(history) ? history : []) {
    if (!s || typeof s !== 'object') continue;
    const ms = parseMs(s.fecha);
    if (!Number.isFinite(ms)) continue;
    const day = localDate(ms);
    list.push({ s, ms, day, wk: mondayOf(day), min: activeMinutes(s) });
  }
  list.sort((a, b) => a.ms - b.ms);
  const curWk = mondayOf(localDate(Number.isFinite(now) ? now : Date.now()));
  const weeks = new Map();
  const valid = [];
  for (const it of list) {
    if (it.wk > curWk) continue; // sesiones "del futuro" no cuentan
    valid.push(it);
    let w = weeks.get(it.wk);
    if (!w) { w = { wk: it.wk, days: new Set(), sessions: 0, minutes: 0, metDate: null, minDate: null }; weeks.set(it.wk, w); }
    w.sessions++;
    w.minutes += it.min;
    w.days.add(it.day);
    if (!w.metDate && w.days.size >= goal) w.metDate = it.day;
    if (!w.minDate && w.minutes >= MINUTES_GOAL) w.minDate = it.day;
  }
  return { goal, valid, weeks, curWk };
}

function streakCore(P, now) {
  const { goal, valid, weeks, curWk } = P;
  const out = { weeks: 0, best: 0, shields: 0, atRisk: false, milestones: {}, metWeeks: 0 };
  if (!valid.length) return out;
  let run = 0, consec = 0, shields = 0, best = 0, metWeeks = 0;
  const milestones = {};
  for (let wk = valid[0].wk, guard = 0; wk <= curWk && guard < 3000; wk = addDays(wk, 7), guard++) {
    const w = weeks.get(wk);
    const met = !!w && w.days.size >= goal;
    if (met) {
      metWeeks++;
      run++;
      consec++;
      if (run > best) best = run;
      if (!(run in milestones)) milestones[run] = w.metDate;
      if (consec % SHIELD_EVERY === 0) shields = Math.min(MAX_SHIELDS, shields + 1);
    } else if (wk < curWk) {
      if (shields > 0) shields--; // perdona la semana: ni suma ni rompe
      else { run = 0; consec = 0; }
    }
  }
  const cur = weeks.get(curWk);
  const days = cur ? cur.days.size : 0;
  const t = Number.isFinite(now) ? now : Date.now();
  const missing = Math.max(0, goal - days);
  const daysLeft = 7 - dayIdx(t);
  Object.assign(out, { weeks: run, best, shields, metWeeks, milestones });
  out.atRisk = missing > 0 && daysLeft <= missing + 1;
  return out;
}

export function weekStats(history, week, now) {
  const P = prepare(history, week, now);
  const w = P.weeks.get(P.curWk);
  const days = [false, false, false, false, false, false, false];
  if (w) for (const d of w.days) days[dayIdx(new Date(`${d}T12:00`).getTime())] = true;
  const sessions = w ? w.days.size : 0;
  return { sessions, goal: P.goal, minutes: w ? w.minutes : 0, minutesGoal: MINUTES_GOAL, days, done: sessions >= P.goal };
}

export function streak(history, week, now) {
  const { weeks, best, shields, atRisk } = streakCore(prepare(history, week, now), now);
  return { weeks, best, shields, atRisk };
}

export function xp(history, week) {
  return xpOf(prepare(history, week, P0now(history)));
}
// Para xp() no hay "now": se incluyen todas las sesiones válidas.
function P0now(history) {
  let max = 0;
  for (const s of Array.isArray(history) ? history : []) { const ms = parseMs(s?.fecha); if (ms > max) max = ms; }
  return max || Date.now();
}
function xpParts(P) {
  let sessions = 0, minutes = 0, prs = 0, goal = 0;
  for (const it of P.valid) {
    sessions += 10;
    minutes += Math.min(60, it.min);
    const p = Number(it.s.prs);
    if (Number.isFinite(p) && p > 0) prs += 5 * Math.floor(p);
  }
  for (const w of P.weeks.values()) if (w.days.size >= P.goal) goal += 20;
  return { session: sessions, minutes, pr: prs, goal };
}
const xpOf = (P) => { const x = xpParts(P); return x.session + x.minutes + x.pr + x.goal; };

export const LEVELS = [
  { n: 1, xp: 0, name: { es: 'Inicio', en: 'Start' } },
  { n: 2, xp: 100, name: { es: 'Constante', en: 'Steady' } },
  { n: 3, xp: 250, name: { es: 'Firme', en: 'Firm' } },
  { n: 4, xp: 500, name: { es: 'Sólido', en: 'Solid' } },
  { n: 5, xp: 900, name: { es: 'Fuerte', en: 'Strong' } },
  { n: 6, xp: 1400, name: { es: 'Disciplinado', en: 'Disciplined' } },
  { n: 7, xp: 2000, name: { es: 'Veterano', en: 'Veteran' } },
  { n: 8, xp: 2800, name: { es: 'Experto', en: 'Expert' } },
  { n: 9, xp: 3800, name: { es: 'Maestro', en: 'Master' } },
  { n: 10, xp: 5000, name: { es: 'Élite', en: 'Elite' } },
];

export function level(xpTotal) {
  const x = Number.isFinite(xpTotal) && xpTotal > 0 ? Math.floor(xpTotal) : 0;
  let i = 0;
  while (i + 1 < LEVELS.length && x >= LEVELS[i + 1].xp) i++;
  const cur = LEVELS[i], nxt = LEVELS[i + 1];
  return {
    n: cur.n, name: cur.name, xp: x, floor: cur.xp, next: nxt ? nxt.xp : null,
    progress: nxt ? (x - cur.xp) / (nxt.xp - cur.xp) : 1,
  };
}

// ---- insignias -------------------------------------------------------------
const isCardio = (s) => String(s?.split ?? '').startsWith('cardio');
const isStrength = (s) => !isCardio(s) && (['muscle', 'strength', 'hybrid', 'fatloss'].includes(s?.modo) || !!s?.split);
const nth = (arr, n) => (arr.length >= n ? arr[n - 1].day : null);

function cumulative(valid, key, target) {
  let acc = 0;
  for (const it of valid) { acc += key(it); if (acc >= target) return it.day; }
  return null;
}

const sessionsBadge = (id, icon, n, es, en) => ({
  id, icon, name: { es: `${n} sesiones`, en: `${n} sessions` },
  desc: { es, en }, test: (c) => nth(c.valid, n),
});
const streakBadge = (n, icon) => ({
  id: `streak_${n}`, icon, name: { es: `Racha de ${n} semanas`, en: `${n}-week streak` },
  desc: { es: `Cumple tu meta ${n} semanas seguidas`, en: `Hit your weekly goal ${n} weeks in a row` },
  test: (c) => {
    let best = null;
    for (const [k, d] of Object.entries(c.streak.milestones)) if (Number(k) >= n && (best === null || d < best)) best = d;
    return best;
  },
});

export const BADGES = [
  { id: 'first_session', icon: '🌱', name: { es: 'Primer paso', en: 'First step' },
    desc: { es: 'Completa tu primera sesión', en: 'Complete your first session' }, test: (c) => nth(c.valid, 1) },
  { id: 'three_week', icon: '🔥', name: { es: 'Semana intensa', en: 'Big week' },
    desc: { es: '3 sesiones en una misma semana', en: '3 sessions in one week' },
    test: (c) => { let d = null; for (const w of c.weeks.values()) { const x = [...w.days].sort()[2]; if (x && (d === null || x < d)) d = x; } return d; } },
  { id: 'first_goal', icon: '🎯', name: { es: 'Meta cumplida', en: 'Goal met' },
    desc: { es: 'Cumple tu meta semanal por primera vez', en: 'Hit your weekly goal for the first time' },
    test: (c) => c.streak.metDates[0] ?? null },
  streakBadge(2, '🔗'), streakBadge(4, '⛓️'), streakBadge(8, '🏅'), streakBadge(12, '🏆'),
  { id: 'week_150min', icon: '⏱️', name: { es: '150 minutos', en: '150 minutes' },
    desc: { es: '150 min activos en una semana', en: '150 active minutes in one week' },
    test: (c) => { let d = null; for (const w of c.weeks.values()) if (w.minDate && (d === null || w.minDate < d)) d = w.minDate; return d; } },
  sessionsBadge('sessions_10', '🥉', 10, 'Completa 10 sesiones', 'Complete 10 sessions'),
  sessionsBadge('sessions_25', '🥈', 25, 'Completa 25 sesiones', 'Complete 25 sessions'),
  sessionsBadge('sessions_50', '🥇', 50, 'Completa 50 sesiones', 'Complete 50 sessions'),
  sessionsBadge('sessions_100', '💯', 100, 'Completa 100 sesiones', 'Complete 100 sessions'),
  { id: 'minutes_300', icon: '⌛', name: { es: '300 minutos', en: '300 minutes' },
    desc: { es: '300 minutos activos acumulados', en: '300 total active minutes' }, test: (c) => cumulative(c.valid, (i) => i.min, 300) },
  { id: 'minutes_1000', icon: '⏳', name: { es: '1000 minutos', en: '1000 minutes' },
    desc: { es: '1000 minutos activos acumulados', en: '1000 total active minutes' }, test: (c) => cumulative(c.valid, (i) => i.min, 1000) },
  { id: 'cardio_20', icon: '🫀', name: { es: 'Cardio continuo', en: 'Steady cardio' },
    desc: { es: '20 min continuos de cardio', en: '20 continuous cardio minutes' },
    test: (c) => c.valid.find((i) => (i.s.series ?? []).some((x) => Number(x?.duracion_s) >= 1200))?.day ?? null },
  { id: 'strength_5', icon: '🏋️', name: { es: 'Fuerza ×5', en: 'Strength ×5' },
    desc: { es: '5 sesiones de fuerza', en: '5 strength sessions' }, test: (c) => nth(c.valid.filter((i) => isStrength(i.s)), 5) },
  { id: 'comeback', icon: '↩️', name: { es: 'Regreso', en: 'Comeback' },
    desc: { es: 'Vuelve tras 7 días o más sin entrenar', en: 'Return after 7+ days off' },
    test: (c) => {
      for (let i = 1; i < c.valid.length; i++) {
        const a = c.valid[i - 1], b = c.valid[i];
        if (Math.round((new Date(`${b.day}T12:00`) - new Date(`${a.day}T12:00`)) / 864e5) >= 7) return b.day;
      }
      return null;
    } },
  { id: 'first_pr', icon: '⭐', name: { es: 'Primer récord', en: 'First PR' },
    desc: { es: 'Logra tu primer récord personal', en: 'Set your first personal record' },
    test: (c) => c.valid.find((i) => Number(i.s.prs) > 0)?.day ?? null },
];

function context(history, week, now) {
  const P = prepare(history, week, now);
  const st = streakCore(P, now);
  st.metDates = [...P.weeks.values()].filter((w) => w.metDate).map((w) => w.metDate).sort();
  return { ...P, streak: st };
}

function badgesOf(ctx) {
  return BADGES.map((b) => {
    let date = null;
    try { date = b.test(ctx) || null; } catch { date = null; }
    return { id: b.id, icon: b.icon, name: b.name, desc: b.desc, earned: !!date, date };
  });
}

export function badges(history, week, now) {
  return badgesOf(context(history, week, now));
}

export function sessionReward(historyBefore, session, week, now) {
  const before = Array.isArray(historyBefore) ? historyBefore : [];
  const after = [...before, session];
  const Pb = prepare(before, week, now), Pa = prepare(after, week, now);
  const xb = xpOf(Pb), xa = xpOf(Pa);
  const parts = xpParts(Pa), partsB = xpParts(Pb);
  const xpBreakdown = [
    { key: 'session', xp: parts.session - partsB.session },
    { key: 'minutes', xp: parts.minutes - partsB.minutes },
    { key: 'pr', xp: parts.pr - partsB.pr },
    { key: 'goal', xp: parts.goal - partsB.goal },
  ].filter((r) => r.xp > 0);
  const levelBefore = level(xb), levelAfter = level(xa);
  const weekBefore = weekStats(before, week, now), weekAfter = weekStats(after, week, now);
  const ctxB = context(before, week, now), ctxA = context(after, week, now);
  const had = new Set(badgesOf(ctxB).filter((b) => b.earned).map((b) => b.id));
  const newBadges = badgesOf(ctxA).filter((b) => b.earned && !had.has(b.id));
  return {
    xpGained: xa - xb, xpBreakdown, levelBefore, levelAfter, leveledUp: levelAfter.n > levelBefore.n,
    newBadges, weekBefore, weekAfter, goalJustMet: weekAfter.done && !weekBefore.done,
    streakAfter: (({ weeks, best, shields, atRisk }) => ({ weeks, best, shields, atRisk }))(ctxA.streak),
  };
}
