// FORMD · interfaz. Una sola página, sin dependencias. Todo el estado vive en store.js.
// Principios: una acción principal por pantalla, poco texto, movimiento con resorte (0,3–0,5 s),
// respuesta al toque (no al soltar), vibración suave y regreso disponible en todas las pantallas.
import { CATALOG } from './catalog.js';
import {
  BY_CODE, EQUIPMENT_PRESETS, EVIDENCE, EVIDENCE_TITLE, FACTS, TIMES, addSetToFill, adaptiveHint, csvFromHistory,
  e1rm, extraExercise, hybridWarnings, isPR, lastPerformance, makePlan, nextSplit, plannedUnits, regionSetsLastDays,
  sessionVolumeKg, shortenPlan, shortenRests, suggestSubstitutes, suggestedWeightKg, weeklyLoad,
} from './engine.js';
import { applyFill, bodySVG, loadBody } from './bodymap.js';
import { DICT, getLang, setLang, t } from './i18n.js';
import { canSync, exportBackup, load, save, scriptUrl, sync } from './store.js';

const LB = 2.2046226218;
let S = load();
setLang(S.settings.lang);

const TAB_ORDER = ['home', 'history', 'profile'];
const ui = {
  screen: null, tab: 'home', minutes: 45, plan: null, view: 'front', histTab: 'date', histEx: null,
  modal: null, toast: '', hintDismissed: -1, summary: null, syncing: false, dir: 'fwd',
  onbStep: S.settings.mode ? (S.settings.sex ? 3 : 2) : 1, pickMode: S.settings.mode ?? 'muscle', prevFill: null, popKey: null, rating: 0,
};

const $app = document.getElementById('app');

// ---------- Utilidades ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lang = () => getLang();
const exName = (ex) => (lang() === 'en' ? ex.en : ex.es);
const regionName = (code) => { const r = CATALOG.regions.find((x) => x.code === code); return r ? (lang() === 'en' ? r.en : r.es) : code; };
const regionShort = (code) => regionName(code).replace(/\s*\(.*\)/, '');
const equipName = (c) => { const e = CATALOG.equipment.find((x) => x.code === c); return e ? (lang() === 'en' ? e.en : e.es) : c; };
const unit = () => S.settings.unit;
const toDisp = (kg) => Math.round((unit() === 'kg' ? kg : kg * LB) * 10) / 10;
const toKg = (v) => (unit() === 'kg' ? v : v / LB);
const fmtW = (kg) => `${toDisp(kg)} ${unit()}`;
const mmss = (sec) => { sec = Math.max(0, Math.round(sec)); return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`; };
const pad = (n) => String(n).padStart(2, '0');
const localISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const persist = () => { if (!save(S)) toast(lang() === 'en' ? 'Storage full or blocked' : 'Almacenamiento lleno o bloqueado'); };
const splitTitleEs = (split) => DICT.es['splitShort.' + split] ?? split;
const available = () => new Set(S.settings.equipment);
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
// Sin historial, el peso arranca en un valor típico de principiante para no empezar desde 0.
const startKg = (ex) => {
  const base = ex.bodyweight ? 0 : ex.equipment === 'barbell' ? 20 : ex.equipment === 'dumbbell' || ex.equipment === 'kettlebell' ? 8 : 20;
  return S.settings.sex === 'female' ? Math.round(base * 0.6 / 2.5) * 2.5 : base;
};
const primaryRegionsOf = (ex) => Object.entries(ex.weights).filter(([, w]) => w >= 0.7).map(([r]) => r);

const ICON = {
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 11v6M12 7.5v.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11l8-7 8 7v9H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  history: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  profile: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  swap: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h11l-3-3M17 17H6l3 3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

function toast(msg) {
  ui.toast = msg;
  render();
  clearTimeout(toast.h);
  toast.h = setTimeout(() => { ui.toast = ''; render(); }, 2600);
}

// ---------- Sonido y vibración ----------
let audio;
function beep(freq = 880, ms = 160) {
  try {
    audio = audio ?? new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.frequency.value = freq; g.gain.value = 0.07;
    o.connect(g); g.connect(audio.destination);
    o.start(); o.stop(audio.currentTime + ms / 1000);
  } catch { /* sin audio */ }
}
const buzz = (p) => { try { navigator.vibrate?.(p); } catch { /* sin vibración */ } };

let wake;
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator && !wake) wake = await navigator.wakeLock.request('screen');
    if (!on && wake) { await wake.release(); wake = null; }
  } catch { wake = null; }
}

// ---------- Rutas ----------
function route() {
  if (!S.settings.onboarded) return ui.onbStep === 3 ? 'equip' : ui.onbStep === 2 ? 'sex' : 'welcome';
  if (ui.screen === 'summary' && ui.summary) return 'summary';
  if (ui.screen === 'session' && S.active) return 'session';
  if (ui.screen === 'plan' && ui.plan) return 'plan';
  return 'tabs';
}
const DEEP = new Set(['equip', 'sex', 'plan', 'session']);

function go(screen, tab, dir = 'fwd') {
  ui.screen = screen; ui.dir = dir;
  if (tab) ui.tab = tab;
  render();
  window.scrollTo(0, 0);
}

// Botón "atrás" de Android/navegador y flechas de la app comparten la misma lógica.
function handleBack() {
  if (ui.modal) return closeModal();
  const r = route();
  if (r === 'equip') { ui.onbStep = 2; ui.dir = 'back'; render(); return; }
  if (r === 'sex') { ui.onbStep = 1; ui.dir = 'back'; render(); return; }
  if (r === 'plan') { ui.plan = null; go('tabs', 'home', 'back'); return; }
  if (r === 'session') { openModal({ type: 'leave' }); history.pushState({ d: 1 }, ''); return; }
  if (r === 'summary') { history.pushState({ d: 1 }, ''); return; }
  if (r === 'tabs' && ui.tab !== 'home') { setTab('home'); }
}
window.addEventListener('popstate', handleBack);

// ---------- Vistas ----------
const logo = () => `<div class="logo">FORM<span>D</span></div>`;
const backBtn = (extra = '') => `<button class="icon-btn" data-a="back" aria-label="${t('common.back')}">${ICON.back}</button>${extra}`;

function viewWelcome() {
  const card = (id) => `<button class="mode ${ui.pickMode === id ? 'on' : ''}" data-a="pickMode" data-v="${id}" role="radio" aria-checked="${ui.pickMode === id}">
      <span class="mode-t">${t('mode.' + id)}</span><span class="mode-d">${t('mode.' + id + 'Short')}</span><i class="dot"></i></button>`;
  return `<main class="pad col stagger">
    <div class="row between">${logo()}<span class="mut sm">1 / 3</span></div>
    <h1 class="hero">${t('welcome.title')}</h1>
    <div class="col gap" role="radiogroup">${card('muscle')}${card('hybrid')}</div>
    <div class="grow"></div>
    <p class="mut xs center">${t('welcome.once')}</p>
    <button class="cta" data-a="confirmMode">${t('common.continue')}</button>
  </main>`;
}

function viewSex() {
  const pick = ui.pickSex ?? S.settings.sex ?? 'male';
  const all = Object.fromEntries([...REG_ALL].map((r) => [r, 0.75]));
  const card = (id) => `<button class="sexcard ${pick === id ? 'on' : ''}" data-a="pickSex" data-v="${id}" role="radio" aria-checked="${pick === id}">
      <div class="sexfig">${bodySVG('front', pick === id ? all : {}, { sex: id })}</div><span>${t('sex.' + id)}</span></button>`;
  return `<main class="pad col stagger">
    <div class="row between">${backBtn()}<span class="mut sm">2 / 3</span></div>
    <h1 class="hero">${t('sex.title')}</h1>
    <div class="row gap sexrow" role="radiogroup">${card('male')}${card('female')}</div>
    <p class="mut xs center">${t('sex.note')}</p>
    <button class="cta" data-a="confirmSex">${t('common.continue')}</button>
  </main>`;
}

const REG_ALL = ['chest_clavicular', 'chest_sternal', 'chest_costal', 'delt_anterior', 'delt_lateral', 'biceps_long', 'biceps_short', 'brachialis', 'forearms', 'abs_upper', 'abs_lower', 'obliques', 'quads', 'adductors', 'calves'];

function equipChecks() {
  return CATALOG.equipment.map((e) => {
    const on = S.settings.equipment.includes(e.code);
    return `<label class="check"><span>${esc(lang() === 'en' ? e.en : e.es)}</span>
      <input type="checkbox" data-a="toggleEquip" data-v="${e.code}" ${on ? 'checked' : ''}></label>`;
  }).join('');
}

function presetButtons() {
  const same = (arr) => arr.length === S.settings.equipment.length && arr.every((c) => S.settings.equipment.includes(c));
  return ['gym', 'dumbbells', 'bodyweight'].map((p) =>
    `<button class="seg ${same(EQUIPMENT_PRESETS[p]) ? 'on' : ''}" data-a="preset" data-v="${p}">${t('equip.' + p)}</button>`).join('');
}

const bodyOpts = (extra = {}) => ({ sex: S.settings.sex ?? 'male', ...extra });
const unitToggle = () => `<div class="row gap">${['kg', 'lb'].map((u) => `<button class="seg ${unit() === u ? 'on' : ''}" data-a="setUnit" data-v="${u}">${u}</button>`).join('')}</div>`;

function viewEquip() {
  return `<main class="pad col stagger">
    <div class="row between">${backBtn()}<span class="mut sm">3 / 3</span></div>
    <h1 class="hero">${t('equip.title2')}</h1>
    <div class="col gap">${presetButtons()}</div>
    <div class="card row between"><span>${t('equip.units')}</span>${unitToggle()}</div>
    <details class="more"><summary>${t('equip.customize')}</summary><div class="col mt">${equipChecks()}</div></details>
    <div class="grow"></div>
    <button class="cta" data-a="finishOnboarding">${t('equip.start')}</button>
  </main>`;
}

function nav() {
  const item = (id, key) => `<button class="navb ${ui.tab === id ? 'on' : ''}" data-a="tab" data-v="${id}" aria-current="${ui.tab === id}">${ICON[id]}<span>${t(key)}</span></button>`;
  return `<nav class="nav">${item('home', 'nav.today')}${item('history', 'nav.history')}${item('profile', 'nav.profile')}</nav>`;
}

function syncBadge() {
  if (!canSync(S)) return '';
  if (ui.syncing) return `<span class="spin">⟳</span>`;
  return S.pending.length || S.deleted.length ? `<span class="dot-warn" title="${t('history.offline')}"></span>` : `<span class="dot-ok" title="${t('sync.ok')}"></span>`;
}

function viewHome() {
  const mode = S.settings.mode;
  const split = nextSplit(mode, S.history);
  const warnings = mode === 'hybrid' ? hybridWarnings(S.history, split) : [];
  const load = weeklyLoad(S.history);
  const resume = S.active ? `<button class="card accent-b resume" data-a="resume"><b>${t('home.resumeBtn')}</b><span class="mut xs">${esc(splitTitleEs(S.active.split))} · ${mmss((Date.now() - S.active.startedAt) / 1000)}</span></button>` : '';
  const week = mode === 'hybrid' && load.sessions ? `<div class="mut sm">${load.sessions} ${t('home.weekSessions')} · ${load.cardioMin} ${t('common.min')} cardio</div>` : '';
  return `<main class="pad col stagger">
    <div class="row between">${logo()}${syncBadge()}</div>
    ${resume}
    <div class="grow-sm"></div>
    <div><div class="kicker">${t('mode.' + mode).toUpperCase()}</div>
      <h1 class="hero">${t('splitShort.' + split)}</h1>${week}</div>
    ${warnings.slice(0, 1).map((w) => `<div class="warn">${t('warn.' + w.key)}</div>`).join('')}
    <div class="row gap times" role="group" aria-label="${t('home.howMuchTime')}">${TIMES.map((m) => `<button class="chip ${ui.minutes === m ? 'on' : ''}" data-a="minutes" data-v="${m}" aria-pressed="${ui.minutes === m}">${m}</button>`).join('')}</div>
    <div class="mut xs center">${t('common.minutes')}</div>
    <div class="grow"></div>
    <button class="cta" data-a="makePlan">${t('home.generate', { min: ui.minutes })}</button>
  </main>${nav()}`;
}

function blockRow(b) {
  if (b.type === 'warmup') return `<div class="row between mini mut"><span>${t('plan.warmup')}</span><span>${b.minutes} ${t('common.min')}</span></div>`;
  if (b.type === 'cooldown') return `<div class="row between mini mut"><span>${t('plan.cooldown')}</span><span>${b.minutes} ${t('common.min')}</span></div>`;
  const ex = BY_CODE.get(b.code);
  const right = b.kind === 'cardio' ? (b.protocol ? `${b.protocol.rounds} × ${b.protocol.workS + b.protocol.easyS}s` : `${Math.round(b.durationS / 60)} ${t('common.min')}`)
    : b.kind === 'timed' ? `${b.sets} × ${b.durationS}s` : `${b.sets} × ${b.repMin}–${b.repMax}`;
  return `<div class="row between item"><div class="grow"><b>${esc(exName(ex))}</b></div><span class="mut num-s">${right}</span></div>`;
}

function viewPlan() {
  const p = ui.plan;
  const n = p.blocks.filter((b) => b.type === 'exercise').length;
  return `<main class="pad col stagger">
    <div class="row between">${backBtn()}<button class="link" data-a="why">${t('plan.whyBtn')}</button></div>
    <div><div class="kicker">${t('mode.' + p.mode).toUpperCase()}</div><h1 class="hero">${t('splitShort.' + p.split)}</h1>
      <div class="mut sm">${p.minutes} ${t('common.min')} · ${t('plan.exercises', { n })}</div></div>
    ${(p.warnings ?? []).slice(0, 1).map((w) => `<div class="warn">${t('warn.' + w.key)}</div>`).join('')}
    <div class="col list-plan">${p.blocks.map(blockRow).join('')}</div>
    <button class="cta" data-a="startSession">${t('plan.start')}</button>
  </main>`;
}

// ---------- Sesión activa ----------
function totals(a) {
  const exs = a.plan.blocks.filter((b) => b.type === 'exercise' && (b.kind === 'strength' || b.kind === 'timed'));
  return { totalSets: exs.reduce((n, b) => n + b.sets, 0), done: a.sets.length };
}
const elapsedS = (a) => (Date.now() - a.startedAt) / 1000;

function bodyCard(a, code) {
  const ex = code ? BY_CODE.get(code) : null;
  const primary = ex ? primaryRegionsOf(ex).slice(0, 3) : [];
  const shown = ui.prevFill ?? a.fill;
  const view = ui.view;
  return `<div class="body-card row gap">
    <button class="body-wrap" data-a="flipView" aria-label="${view === 'front' ? t('session.back') : t('session.front')}">${bodySVG(view, shown, bodyOpts())}</button>
    <div class="grow zones">${primary.map((r) => {
      const pct = Math.round((shown[r] ?? 0) * 100);
      return `<div class="zone"><span>${esc(regionShort(r))}</span><div class="track"><u data-r="${r}" style="width:${pct}%"></u></div><b data-rp="${r}">${pct}%</b></div>`;
    }).join('')}</div>
  </div>`;
}

function viewSession() {
  const a = S.active;
  const b = a.plan.blocks[a.idx];
  const { totalSets, done } = totals(a);
  const exBlocks = a.plan.blocks.filter((x) => x.type === 'exercise');
  const exNo = Math.max(1, a.plan.blocks.slice(0, a.idx + 1).filter((x) => x.type === 'exercise').length);
  const hint = adaptiveHint({ plan: a.plan, completedSets: done, totalSets, elapsedS: elapsedS(a) });
  const head = `<div class="row between">${backBtn()}<span class="mut sm num-s">${b.type === 'exercise' ? t('session.exShort', { n: exNo, total: exBlocks.length }) : ''}</span>
      <span class="mut sm num-s" data-tick="elapsed">${mmss(elapsedS(a))}</span></div>
    <div class="bar"><i style="width:${Math.min(100, Math.round((a.idx / a.plan.blocks.length) * 100))}%"></i></div>`;
  const banner = hint && done !== ui.hintDismissed
    ? `<div class="warn">${t('adapt.' + hint)}<div class="row gap mt">${hint === 'behind'
      ? `<button class="seg" data-a="shortenRests">${t('adapt.shortenRests')}</button><button class="seg" data-a="dropLast">${t('adapt.dropLast')}</button>`
      : `<button class="seg" data-a="addExtra">${t('adapt.addExtra')}</button>`}
      <button class="link" data-a="dismissHint">${t('adapt.dismiss')}</button></div></div>` : '';
  let body;
  if (a.restEnd && Date.now() < a.restEnd) body = viewRest(a);
  else if (b.type === 'warmup') body = simpleBlock(t('plan.warmup'), t('session.warmupDone'), 'nextBlock', b.minutes);
  else if (b.type === 'cooldown') body = simpleBlock(t('plan.cooldown'), t('session.cooldownDone'), 'finishSession', b.minutes);
  else if (b.kind === 'strength') body = viewStrength(a, b);
  else body = viewTimed(a, b);
  const showBody = b.type === 'exercise' && !(a.restEnd && Date.now() < a.restEnd);
  return `<main class="pad col stagger">${head}${banner}${body}${showBody ? bodyCard(a, b.code) : ''}</main>`;
}

function simpleBlock(title, cta, action, minutes) {
  return `<div class="col grow center-col"><div class="kicker">${minutes} ${t('common.min')}</div><h1 class="hero">${title}</h1><div class="grow"></div>
    <button class="cta" data-a="${action}">${cta}</button></div>`;
}

function viewRest(a) {
  const left = Math.max(0, Math.ceil((a.restEnd - Date.now()) / 1000));
  const total = a.restTotal || left || 1;
  const C = 2 * Math.PI * 54;
  const b = a.plan.blocks[a.idx];
  const ex = BY_CODE.get(b.code);
  return `<div class="col grow center-col">
    <div class="ring-wrap"><svg class="ring" viewBox="0 0 120 120" aria-hidden="true"><circle class="ring-bg" r="54" cx="60" cy="60"/>
      <circle class="ring-fg" id="ring" r="54" cx="60" cy="60" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - left / total)).toFixed(1)}"/></svg>
      <div class="ring-num" data-tick="rest">${mmss(left)}</div></div>
    <div class="mut">${esc(exName(ex))}</div>
    <div class="row gap"><button class="seg" data-a="plus15">${t('session.plus15')}</button><button class="seg" data-a="skipRest">${t('session.restSkip')}</button></div>
    <div class="grow"></div></div>`;
}

function stepper(id, value, step, label, suffix) {
  return `<div class="stepper"><button class="step-btn" data-a="step" data-f="${id}" data-d="-1" data-step="${step}" aria-label="−">−</button>
    <label><span class="mut xs">${label}</span><div class="step-val"><input id="${id}" type="number" inputmode="decimal" step="${step}" min="0" value="${value}"><em>${suffix}</em></div></label>
    <button class="step-btn" data-a="step" data-f="${id}" data-d="1" data-step="${step}" aria-label="+">+</button></div>`;
}

function viewStrength(a, b) {
  const ex = BY_CODE.get(b.code);
  const last = lastPerformance(S.history, b.code);
  const prefillKg = b.suggestKg ?? last?.peso_kg ?? startKg(ex);
  const weight = prefillKg ? toDisp(prefillKg) : 0;
  const reps = last?.reps ?? b.repMin;
  return `<div class="col grow">
    <div class="row between top"><h1 class="ex">${esc(exName(ex))}</h1><button class="icon-btn" data-a="evidence" data-v="${(b.why ?? [])[0] ?? 'proximity'}" aria-label="${t('session.evidence')}">${ICON.info}</button></div>
    <div class="row gap"><span class="pill acc-pill">${t('session.set', { n: a.setNo, total: b.sets })}</span><span class="pill">${b.repMin}–${b.repMax} ${t('common.reps')}</span>
      ${last ? `<span class="mut xs grow right">${t('session.previous')} ${fmtW(last.peso_kg)} × ${last.reps}</span>` : ''}</div>
    ${stepper('f-w', weight, unit() === 'kg' ? 2.5 : 5, unit().toUpperCase(), unit())}
    ${stepper('f-r', reps, 1, t('session.reps').toUpperCase(), '')}
    <input id="f-n" class="note" type="text" maxlength="200" placeholder="${t('session.addNote')}" hidden>
    <input id="f-rir" type="hidden" value="${b.rir}">
    <div class="row gap"><button class="seg grow" data-a="busy">${ICON.swap}<span>${t('session.change')}</span></button><button class="link" data-a="toggleNote">${t('session.addNote')}</button></div>
    <button class="cta" data-a="completeSet">${t('session.complete')}</button>
  </div>`;
}

function viewTimed(a, b) {
  const ex = BY_CODE.get(b.code);
  const tm = a.timer;
  const running = tm && tm.running;
  const el = tm ? (tm.accum + (running ? Date.now() - tm.t0 : 0)) / 1000 : 0;
  let phase = '';
  if (b.protocol && running) {
    const cyc = b.protocol.workS + b.protocol.easyS;
    const work = el % cyc < b.protocol.workS;
    const round = Math.min(b.protocol.rounds, Math.floor(el / cyc) + 1);
    phase = `<div class="phase ${work ? 'hard' : 'easy'}" data-tick="phase">${work ? t('session.work') : t('session.easy')} · ${round}/${b.protocol.rounds}</div>`;
  }
  const isCardio = b.kind === 'cardio';
  return `<div class="col grow center-col">
    <h1 class="ex">${esc(exName(ex))}</h1>
    <div class="mut">${isCardio ? Math.round(b.durationS / 60) + ' ' + t('common.min') : t('session.set', { n: a.setNo, total: b.sets }) + ' · ' + b.durationS + ' s'}</div>
    <div class="big" data-tick="stopwatch">${mmss(el)}</div>${phase}
    <button class="cta" data-a="${running ? 'timerStop' : 'timerStart'}">${running ? t('session.stop') : t('session.start')}</button>
    ${isCardio ? `<label class="dist"><span class="mut xs">${t('session.distance')}</span><input id="f-d" type="number" inputmode="decimal" step="0.1" min="0"></label>
      <button class="seg" data-a="endBlock">${t('session.endBlock')}</button>` : `<button class="link" data-a="skipExercise">${t('common.skip')}</button>`}
  </div>`;
}

// ---------- Resumen ----------
function viewSummary() {
  const sm = ui.summary;
  const fact = EVIDENCE[FACTS[Math.floor(Date.now() / 864e5) % FACTS.length]];
  const short = sm.short.slice(0, 3).map((r) => `<span class="pill">${esc(regionName(r))}</span>`).join('');
  return `<main class="pad col stagger">
    <div><div class="kicker">${t('summary.title').toUpperCase()}</div><h1 class="hero">${t('summary.good')}</h1></div>
    <div class="stats3">
      <div><b data-count="${toDisp(sm.volume)}">${toDisp(sm.volume)}</b><span>${unit()}</span></div>
      <div><b data-count="${sm.sets}">${sm.sets}</b><span>${t('common.sets')}</span></div>
      <div><b data-count="${Math.round(sm.seconds / 60)}">${Math.round(sm.seconds / 60)}</b><span>${t('common.min')}</span></div>
    </div>
    ${sm.prs ? `<div class="pr-badge">🏆 ${sm.prs} PR</div>` : ''}
    <div class="row gap center bodies">${bodySVG('front', sm.fill, bodyOpts({ label: t('session.front') }))}${bodySVG('back', sm.fill, bodyOpts({ label: t('session.back') }))}</div>
    ${short ? `<div class="row gap wrap"><span class="mut xs">${t('summary.fell')}</span>${short}</div>` : ''}
    <div class="row gap stars" role="group" aria-label="${t('summary.rateShort')}">${[1, 2, 3, 4, 5].map((n) => `<button class="star ${ui.rating >= n ? 'on' : ''}" data-a="rate" data-v="${n}" aria-label="${n}">★</button>`).join('')}</div>
    <details class="more"><summary>${t('summary.fact')}</summary><p class="mt">${esc(fact[lang()])}</p><p class="mut xs mt">${t('evidence.level', { l: fact.level })} · ${t('evidence.noCite')}</p></details>
    <div class="grow"></div>
    <button class="cta" data-a="saveSummary">${t('summary.save')}</button>
  </main>`;
}

// ---------- Historial ----------
function chartSVG(points) {
  if (points.length < 2) return `<div class="mut sm">${t('history.noData')}</div>`;
  const W = 300, H = 110, pd = 10;
  const ys = points.map((p) => p.y);
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const sx = (i) => pd + (i * (W - pd * 2)) / (points.length - 1);
  const sy = (y) => H - pd - ((y - lo) / Math.max(1e-9, hi - lo || 1)) * (H - pd * 2);
  const path = points.map((p, i) => `${sx(i).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${t('history.progress')}">
    <polyline class="draw" pathLength="1" points="${path}" fill="none" stroke="var(--ac)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    ${points.map((p, i) => `<circle cx="${sx(i).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="3.5" fill="var(--ac)"/>`).join('')}
  </svg><div class="row between mut xs"><span>${fmtW(lo)}</span><span>${fmtW(hi)}</span></div>`;
}

function sessionCard(s) {
  const det = (s.series ?? []).map((x) => {
    const ex = BY_CODE.get(x.ejercicio_code);
    const label = ex ? exName(ex) : x.ejercicio;
    const body = ex && ex.kind !== 'strength' ? `${mmss(x.duracion_s || 0)}${x.distancia_m ? ' · ' + (x.distancia_m / 1000).toFixed(1) + ' km' : ''}` : `${fmtW(x.peso_kg || 0)} × ${x.reps}`;
    return `<li><span>${esc(label)}</span><span class="num-s">${body}${x.es_pr ? ' 🏆' : ''}</span></li>`;
  }).join('');
  return `<details class="card sess"><summary><div class="row between"><b>${esc(s.titulo)}</b><span class="mut sm">${esc(String(s.fecha).slice(5, 10))}</span></div>
    <div class="mut xs">${Math.round((s.segundos_real || 0) / 60)} ${t('common.min')} · ${fmtW(s.volumen_kg || 0)}${s.prs ? ' · 🏆' + s.prs : ''}</div></summary>
    <ul class="list">${det}</ul>
    <button class="link bad" data-a="delSession" data-v="${esc(s.id)}">${t('history.delete')}</button></details>`;
}

function viewHistory() {
  const tabs = ['date', 'muscle', 'exercise'].map((id) => `<button class="seg ${ui.histTab === id ? 'on' : ''}" data-a="histTab" data-v="${id}">${t('history.by' + id[0].toUpperCase() + id.slice(1))}</button>`).join('');
  let body = '';
  const hist = [...S.history].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  if (!hist.length) body = `<div class="empty"><div class="empty-ic">${ICON.history}</div><p class="mut">${t('history.empty')}</p></div>`;
  else if (ui.histTab === 'date') body = hist.map(sessionCard).join('');
  else if (ui.histTab === 'muscle') {
    const sets = regionSetsLastDays(S.history, 7);
    const fill = Object.fromEntries(Object.entries(sets).map(([r, v]) => [r, Math.min(1, v / 10)]));
    const rows = Object.entries(sets).sort((a, b) => b[1] - a[1]).slice(0, 6);
    body = `<div class="row gap center bodies">${bodySVG('front', fill, bodyOpts())}${bodySVG('back', fill, bodyOpts())}</div>
      <div class="col zones">${rows.map(([r, v]) => `<div class="zone"><span>${esc(regionShort(r))}</span><div class="track"><u style="width:${Math.round(Math.min(1, v / 10) * 100)}%"></u></div><b>${v.toFixed(1)}</b></div>`).join('')}</div>`;
  } else {
    const done = [...new Set(S.history.flatMap((s) => (s.series ?? []).map((x) => x.ejercicio_code)))].filter((c) => BY_CODE.has(c));
    const cur = ui.histEx && done.includes(ui.histEx) ? ui.histEx : done[0];
    const pts = [];
    if (cur) {
      for (const s of [...S.history].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))) {
        const mine = (s.series ?? []).filter((x) => x.ejercicio_code === cur && x.reps > 0);
        if (mine.length) pts.push({ y: Math.max(...mine.map((x) => e1rm(x.peso_kg || 0, x.reps))) });
      }
    }
    const cardio = cur && BY_CODE.get(cur).kind !== 'strength';
    body = `<select data-a="histEx" aria-label="${t('history.pickExercise')}">${done.map((c) => `<option value="${c}" ${c === cur ? 'selected' : ''}>${esc(exName(BY_CODE.get(c)))}</option>`).join('')}</select>
      <div class="card">${cardio ? `<div class="mut">${t('history.noData')}</div>` : chartSVG(pts.map((p) => ({ y: toDisp(p.y) })))}</div>`;
  }
  return `<main class="pad col stagger"><div class="row between"><h1>${t('history.title')}</h1>
    ${canSync(S) ? `<button class="icon-btn" data-a="doSync" aria-label="${t('history.sync')}">${ui.syncing ? '<span class="spin">⟳</span>' : '⟳'}</button>` : ''}</div>
    <div class="row gap scroll-x">${tabs}</div>${body}
    ${hist.length ? `<button class="link" data-a="exportCsv">${t('history.export')}</button>` : ''}</main>${nav()}`;
}

// ---------- Perfil ----------
function viewProfile() {
  const connected = canSync(S);
  return `<main class="pad col stagger compact"><h1>${t('profile.title')}</h1>
    <div class="card col"><span class="mut xs">${t('profile.mode')}</span>
      <div class="row gap">${['muscle', 'hybrid'].map((m) => `<button class="seg grow ${S.settings.mode === m ? 'on' : ''}" data-a="changeMode" data-v="${m}">${t('mode.' + m)}</button>`).join('')}</div></div>
    <div class="card row between"><span>${t('profile.sex')}</span><div class="row gap">${['male', 'female'].map((x) => `<button class="seg ${(S.settings.sex ?? 'male') === x ? 'on' : ''}" data-a="setSex" data-v="${x}">${t('sex.' + x)}</button>`).join('')}</div></div>
    <div class="card row between"><span>${t('profile.unit')}</span>${unitToggle()}</div>
    <div class="card row between"><span>${t('profile.lang')}</span><div class="row gap">${['es', 'en'].map((l) => `<button class="seg ${lang() === l ? 'on' : ''}" data-a="setLang" data-v="${l}">${l.toUpperCase()}</button>`).join('')}</div></div>
    <details class="card more"><summary>${t('profile.equip')}</summary><div class="row gap mt wrap">${presetButtons()}</div><div class="col mt">${equipChecks()}</div></details>
    <details class="card more"><summary>Google Sheets <span class="${connected ? 'dot-ok' : 'dot-off'}"></span></summary>
      ${scriptUrl() ? `<label class="mt"><span class="mut xs">${t('profile.code')}</span><input id="f-code" type="password" autocomplete="off" value="${esc(S.settings.code)}"></label>
        <button class="seg mt" data-a="connect">${t('profile.test')}</button>` : `<div class="warn mt">${t('profile.noUrl')}</div>`}
      ${S.lastSync ? `<div class="mut xs mt">${t('profile.lastSync', { d: S.lastSync.slice(0, 16).replace('T', ' ') })}</div>` : ''}</details>
    <div class="row gap"><button class="link" data-a="backup">${t('profile.backup')}</button><button class="link bad" data-a="resetAll">${t('profile.reset')}</button></div>
    <p class="mut xs center credit">Anatomía: OpenStax / T. Kebert · CC BY-SA 4.0</p>
  </main>${nav()}`;
}

// ---------- Modales ----------
function openModal(m) { ui.modal = m; render(); }
function closeModal() {
  if (!ui.modal) return;
  const ov = $app.querySelector('.overlay');
  if (ov && !reduced()) {
    ov.classList.add('out');
    setTimeout(() => { ui.modal = null; render(); }, 220);
  } else { ui.modal = null; render(); }
}
function ask(text, onYes) { openModal({ type: 'ask', text, onYes }); }

function modalHTML() {
  const m = ui.modal;
  if (!m) return '';
  let inner = '';
  if (m.type === 'evidence') {
    const e = EVIDENCE[m.key];
    inner = `<div class="kicker">${t('evidence.level', { l: e.level })} · ${t('evidence.' + e.level)}</div><h2>${EVIDENCE_TITLE[m.key][lang()]}</h2>
      <p>${esc(e[lang()])}</p><p class="mut xs">${t('evidence.noCite')}</p>`;
  } else if (m.type === 'why') {
    inner = `<h2>${t('plan.whyTitle')}</h2><div class="col">${ui.plan.why.map((k) => `<button class="opt" data-a="evidence" data-v="${k}"><div class="row between"><b>${EVIDENCE_TITLE[k][lang()]}</b><span class="pill lv-${EVIDENCE[k].level}">${EVIDENCE[k].level}</span></div></button>`).join('')}</div>`;
  } else if (m.type === 'leave') {
    inner = `<h2>${t('session.leaveTitle')}</h2><p class="mut">${t('session.leaveBody')}</p>
      <div class="row gap"><button class="seg grow" data-a="closeModal">${t('session.keep')}</button><button class="seg grow bad" data-a="leaveSession">${t('session.leave')}</button></div>`;
  } else if (m.type === 'ask') {
    inner = `<p>${esc(m.text)}</p><div class="row gap"><button class="seg grow" data-a="closeModal">${t('ask.no')}</button><button class="seg grow on" data-a="askYes">${t('ask.yes')}</button></div>`;
  } else if (m.type === 'sub') {
    const cur = BY_CODE.get(m.from);
    const last = lastPerformance(S.history, m.from);
    inner = `<h2>${t('sub.title')}</h2>
      ${m.list.length ? m.list.map((s, i) => {
        const w = suggestedWeightKg(cur, s.exercise, last?.peso_kg);
        return `<button class="opt ${i === 0 ? 'best' : ''}" data-a="useSub" data-v="${s.exercise.code}">
          <div class="row between"><b>${esc(exName(s.exercise))}</b>${i === 0 && !s.weak ? `<span class="acc xs">${t('sub.best')}</span>` : ''}</div>
          <div class="mut xs">${equipName(s.exercise.equipment)}${w ? ' · ' + fmtW(w) : ''}</div></button>`;
      }).join('') : `<p>${t('sub.none')}</p>`}`;
  }
  const showClose = m.type === 'sub' || m.type === 'evidence' || m.type === 'why';
  return `<div class="overlay" data-a="closeModal"><div class="sheet" role="dialog" aria-modal="true"><i class="grab"></i>${inner}
    ${showClose ? `<button class="link" data-a="closeModal">${m.type === 'sub' ? t('sub.wait') : t('common.close')}</button>` : ''}</div></div>`;
}

// ---------- Render ----------
function render() {
  setLang(S.settings.lang);
  const r = route();
  const views = { welcome: viewWelcome, sex: viewSex, equip: viewEquip, plan: viewPlan, session: viewSession, summary: viewSummary };
  let html;
  if (r === 'tabs') html = ui.tab === 'history' ? viewHistory() : ui.tab === 'profile' ? viewProfile() : viewHome();
  else html = views[r]();
  const key = r + (r === 'tabs' ? ui.tab : '') + (r === 'welcome' || r === 'equip' ? '' : '');
  const changed = render.key !== key;
  const deeper = changed && DEEP.has(r) && ui.dir === 'fwd';
  const y = window.scrollY;
  $app.innerHTML = html + modalHTML() + (ui.toast ? `<div class="toast" role="status">${esc(ui.toast)}</div>` : '');
  const main = $app.querySelector('main');
  if (main && $app.querySelector('.nav')) main.classList.add('has-nav');
  if (main && changed) main.classList.add(ui.dir === 'back' ? 'enter-back' : 'enter-fwd');
  else if (main) main.classList.add('still');
  if (changed && deeper) history.pushState({ r }, '');
  if (!changed) window.scrollTo(0, y);
  render.key = key;
  ui.dir = 'fwd';
  postRender(r, changed);
  keepAwake(r === 'session');
}

function postRender(r, changed) {
  // Resalta el botón recién tocado (rebote) aunque la pantalla se haya vuelto a dibujar.
  if (ui.popKey) {
    const [a, v] = ui.popKey.split('|');
    const el = $app.querySelector(`[data-a="${a}"]${v ? `[data-v="${v}"]` : ''}`);
    if (el && !reduced()) el.classList.add('pop');
    ui.popKey = null;
  }
  if (r === 'session' && ui.prevFill && S.active) {
    const a = S.active;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      $app.querySelectorAll('.body-wrap').forEach((w) => applyFill(w, a.fill));
      $app.querySelectorAll('.zone u[data-r]').forEach((u) => {
        const pct = Math.round((a.fill[u.dataset.r] ?? 0) * 100);
        u.style.width = pct + '%';
        const b = $app.querySelector(`[data-rp="${u.dataset.r}"]`);
        if (b) b.textContent = pct + '%';
      });
      ui.prevFill = null;
    }));
  }
  if (r === 'summary' && changed && !reduced()) countUp();
}

function countUp() {
  const els = [...$app.querySelectorAll('[data-count]')];
  const t0 = performance.now();
  const D = 800;
  const tick = (now) => {
    const k = Math.min(1, (now - t0) / D);
    const e = 1 - Math.pow(1 - k, 3);
    for (const el of els) {
      const v = Number(el.dataset.count);
      el.textContent = k >= 1 ? String(v) : String(Math.round(v * e * 10) / 10 % 1 === 0 ? Math.round(v * e) : Math.round(v * e * 10) / 10);
    }
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function setTab(id) {
  ui.dir = TAB_ORDER.indexOf(id) < TAB_ORDER.indexOf(ui.tab) ? 'back' : 'fwd';
  ui.tab = id; ui.screen = null; render(); window.scrollTo(0, 0);
}

// ---------- Acciones ----------
const A = {
  back() { history.length > 1 && history.state ? history.back() : handleBack(); },
  pickMode(el) { ui.pickMode = el.dataset.v; buzz(10); render(); },
  confirmMode() { S.settings.mode = ui.pickMode; ui.onbStep = S.settings.sex ? 3 : 2; ui.dir = 'fwd'; persist(); render(); },
  pickSex(el) { ui.pickSex = el.dataset.v; buzz(10); render(); },
  confirmSex() { S.settings.sex = ui.pickSex ?? S.settings.sex ?? 'male'; ui.onbStep = 3; ui.dir = 'fwd'; persist(); render(); },
  setSex(el) { S.settings.sex = el.dataset.v; persist(); render(); },
  setLang(el) { S.settings.lang = el.dataset.v; setLang(el.dataset.v); persist(); render(); },
  setUnit(el) { S.settings.unit = el.dataset.v; persist(); render(); },
  preset(el) { S.settings.equipment = [...EQUIPMENT_PRESETS[el.dataset.v]]; persist(); render(); },
  toggleEquip(el) {
    const set = new Set(S.settings.equipment);
    el.checked ? set.add(el.dataset.v) : set.delete(el.dataset.v);
    set.add('bodyweight'); // el peso corporal siempre está disponible
    S.settings.equipment = [...set]; persist(); render();
  },
  finishOnboarding() { S.settings.onboarded = true; persist(); history.replaceState({}, ''); go('tabs', 'home'); },
  tab(el) { setTab(el.dataset.v); },
  minutes(el) { ui.minutes = Number(el.dataset.v); render(); },
  makePlan() {
    ui.plan = makePlan({ mode: S.settings.mode, minutes: ui.minutes, available: available(), history: S.history });
    if (!ui.plan.blocks.some((b) => b.type === 'exercise')) return toast(lang() === 'en' ? 'No exercises with your gear' : 'Sin ejercicios con tu equipo');
    go('plan');
  },
  why() { openModal({ type: 'why' }); },
  startSession() {
    const p = ui.plan;
    S.active = {
      id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), mode: p.mode, split: p.split,
      fecha: localISO(), startedAt: Date.now(), plan: p, idx: 0, setNo: 1, sets: [], fill: {}, restEnd: null, restTotal: 0, timer: null,
    };
    persist(); go('session');
  },
  resume() { go('session'); },
  leaveSession() { ui.modal = null; ui.screen = null; ui.plan = null; render(); window.scrollTo(0, 0); },
  nextBlock() { advanceBlock(); },
  step(el) {
    const input = document.getElementById(el.dataset.f);
    if (!input) return;
    const step = Number(el.dataset.step) || 1;
    const next = Math.max(0, Math.round((Number(input.value || 0) + Number(el.dataset.d) * step) * 100) / 100);
    input.value = next;
    input.classList.remove('bump'); void input.offsetWidth; input.classList.add('bump');
  },
  toggleNote(el) {
    const n = document.getElementById('f-n');
    if (!n) return;
    n.hidden = !n.hidden;
    if (!n.hidden) n.focus();
  },
  completeSet() {
    const a = S.active, b = a.plan.blocks[a.idx];
    const w = Number(document.getElementById('f-w')?.value || 0);
    const reps = Number(document.getElementById('f-r')?.value || 0);
    const rir = document.getElementById('f-rir')?.value;
    if (!(reps > 0)) return toast(lang() === 'en' ? 'Enter the reps' : 'Escribe las repeticiones');
    const kg = Math.round(toKg(w) * 100) / 100;
    const pr = isPR(S.history, b.code, kg, reps) && !a.sets.some((x) => x.ejercicio_code === b.code && e1rm(x.peso_kg, x.reps) >= e1rm(kg, reps));
    recordSet(a, b, { peso_kg: kg, reps, rir: rir === '' ? null : Number(rir), nota: document.getElementById('f-n')?.value || '', es_pr: pr });
    if (pr) { toast(t('session.pr')); buzz([60, 40, 60, 40, 120]); }
  },
  plus15() { const a = S.active; a.restEnd += 15000; a.restTotal += 15; persist(); render(); },
  skipRest() { S.active.restEnd = null; persist(); render(); },
  timerStart() {
    const a = S.active; a.timer = { running: true, t0: Date.now(), accum: a.timer?.accum ?? 0, lastPhase: 'work' };
    beep(660, 120); persist(); render();
  },
  timerStop() {
    const a = S.active, b = a.plan.blocks[a.idx];
    const secs = Math.round((a.timer.accum + (Date.now() - a.timer.t0)) / 1000);
    a.timer = null;
    if (b.kind === 'cardio') { a.cardioSecs = secs; persist(); render(); return; }
    recordSet(a, b, { peso_kg: 0, reps: 0, duracion_s: secs, rir: null, nota: '', es_pr: false });
  },
  endBlock() {
    const a = S.active, b = a.plan.blocks[a.idx];
    let secs = a.cardioSecs ?? 0;
    if (a.timer) { secs += Math.round((a.timer.accum + (a.timer.running ? Date.now() - a.timer.t0 : 0)) / 1000); a.timer = null; }
    const km = Number(document.getElementById('f-d')?.value || 0);
    ui.prevFill = { ...a.fill };
    a.sets.push({ ejercicio_code: b.code, ejercicio: BY_CODE.get(b.code).es, serie: 1, peso_kg: 0, reps: 0, duracion_s: secs, distancia_m: Math.round(km * 1000), rir: null, nota: '', es_pr: false });
    a.fill = addSetToFill(a.fill, a.plan, b.code);
    a.cardioSecs = 0; advanceBlock();
  },
  skipExercise() { advanceBlock(); },
  busy() { openSub(); },
  useSub(el) {
    const a = S.active, b = a.plan.blocks[a.idx];
    const to = BY_CODE.get(el.dataset.v);
    const from = BY_CODE.get(b.code);
    const last = lastPerformance(S.history, b.code);
    a.plan.blocks[a.idx] = { ...b, code: to.code, kind: to.kind, repMin: to.repMin ?? b.repMin, repMax: to.repMax ?? b.repMax, durationS: to.durationS ?? b.durationS, fromCode: from.code, suggestKg: suggestedWeightKg(from, to, last?.peso_kg) || undefined };
    ui.modal = null; persist(); render();
  },
  closeModal(el, e) {
    // El fondo oscuro cierra el modal solo si el toque fue sobre él, no sobre el contenido.
    if (el.classList.contains('overlay') && e && e.target !== el) return;
    closeModal();
  },
  askYes() { const fn = ui.modal?.onYes; ui.modal = null; render(); fn?.(); },
  evidence(el) { ui.modal = { type: 'evidence', key: el.dataset.v }; render(); },
  flipView() { ui.view = ui.view === 'front' ? 'back' : 'front'; buzz(8); render(); },
  shortenRests() { S.active.plan = shortenRests(S.active.plan); ui.hintDismissed = S.active.sets.length; persist(); render(); },
  dropLast() {
    const a = S.active;
    const done = {};
    a.plan.blocks.forEach((b, i) => { if (i <= a.idx) done[i] = true; });
    a.plan = shortenPlan(a.plan, done); ui.hintDismissed = a.sets.length; persist(); render();
  },
  addExtra() {
    const a = S.active;
    const ex = extraExercise(a.plan, available(), a.mode);
    if (ex) a.plan.blocks.splice(a.plan.blocks.length - 1, 0, ex);
    ui.hintDismissed = a.sets.length; persist(); render();
  },
  dismissHint() { ui.hintDismissed = S.active.sets.length; render(); },
  finishSession() { finishSession(); },
  rate(el) { ui.rating = Number(el.dataset.v); buzz(12); render(); },
  saveSummary() { saveSummary(); },
  histTab(el) { ui.histTab = el.dataset.v; render(); },
  histEx(el) { ui.histEx = el.value; render(); },
  delSession(el) {
    const id = el.dataset.v;
    ask(t('history.deleteAsk'), () => {
      S.history = S.history.filter((s) => s.id !== id);
      S.pending = S.pending.filter((x) => x !== id);
      if (canSync(S)) S.deleted.push(id);
      persist(); render(); bgSync();
    });
  },
  exportCsv() { download('formd-historial.csv', csvFromHistory(S.history), 'text/csv'); },
  backup() { download('formd-copia.json', exportBackup(S), 'application/json'); },
  doSync() { doSync(true); },
  connect() { S.settings.code = document.getElementById('f-code')?.value.trim() ?? ''; persist(); doSync(true); },
  changeMode(el) {
    const m = el.dataset.v;
    if (m === S.settings.mode) return;
    ask(t('profile.changeModeAsk'), () => { S.settings.mode = m; persist(); render(); });
  },
  resetAll() {
    ask(t('profile.resetAsk'), () => {
      const lang0 = S.settings.lang;
      localStorage.removeItem('formd.v1');
      S = load(); S.settings.lang = lang0; ui.screen = null; ui.pickMode = 'muscle'; ui.onbStep = 1; persist(); render();
    });
  },
};

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function recordSet(a, b, extra) {
  const ex = BY_CODE.get(b.code);
  ui.prevFill = { ...a.fill };
  a.sets.push({ ejercicio_code: b.code, ejercicio: ex.es, serie: a.setNo, distancia_m: 0, duracion_s: 0, ...extra });
  a.fill = addSetToFill(a.fill, a.plan, b.code);
  buzz(35);
  if (a.setNo >= b.sets) {
    a.setNo = 1;
    a.idx += 1;
    const next = a.plan.blocks[a.idx];
    delete a.plan.blocks[a.idx - 1].suggestKg;
    if (next && next.type === 'exercise') { a.restTotal = Math.max(30, b.restS); a.restEnd = Date.now() + a.restTotal * 1000; }
    else a.restEnd = null;
  } else {
    a.setNo += 1; a.restTotal = b.restS; a.restEnd = Date.now() + b.restS * 1000;
  }
  persist(); render();
}

function advanceBlock() {
  const a = S.active;
  a.idx += 1; a.setNo = 1; a.restEnd = null; a.timer = null; a.cardioSecs = 0;
  if (a.idx >= a.plan.blocks.length) return finishSession();
  persist(); render(); window.scrollTo(0, 0);
}

function openSub() {
  const a = S.active, b = a.plan.blocks[a.idx];
  const cur = BY_CODE.get(b.code);
  const doneToday = new Set(a.sets.map((x) => x.ejercicio_code));
  const remaining = Math.max(0, a.plan.plannedSeconds - elapsedS(a)) / 60;
  const list = suggestSubstitutes({ current: cur, available: available(), blocked: new Set([cur.equipment]), doneToday, minutesLeft: remaining, history: S.history });
  openModal({ type: 'sub', from: cur.code, list });
}

function finishSession() {
  const a = S.active;
  const wanted = new Set();
  for (const b of a.plan.blocks) if (b.type === 'exercise') for (const r of primaryRegionsOf(BY_CODE.get(b.code))) wanted.add(r);
  ui.rating = 0;
  ui.summary = {
    volume: sessionVolumeKg(a.sets), sets: a.sets.length, seconds: Math.round(elapsedS(a)), planned: a.plan.plannedSeconds,
    prs: a.sets.filter((x) => x.es_pr).length, fill: a.fill, short: [...wanted].filter((r) => (a.fill[r] ?? 0) < 0.99),
  };
  buzz([40, 30, 80]);
  ui.screen = 'summary'; ui.dir = 'fwd'; render(); window.scrollTo(0, 0);
}

function saveSummary() {
  const a = S.active, sm = ui.summary;
  const rec = {
    id: a.id, fecha: a.fecha, modo: a.mode, split: a.split, titulo: splitTitleEs(a.split), minutos_plan: Math.round(a.plan.plannedSeconds / 60),
    segundos_real: sm.seconds, volumen_kg: sm.volume, prs: sm.prs, valoracion: ui.rating || 0, comentario: '', series: a.sets,
  };
  S.history.push(rec);
  if (canSync(S)) S.pending.push(rec.id);
  S.active = null; ui.summary = null; ui.plan = null; ui.screen = null; ui.tab = 'history';
  persist(); render(); window.scrollTo(0, 0); bgSync();
}

// ---------- Sincronización ----------
async function doSync(show) {
  if (!canSync(S) || ui.syncing) return;
  ui.syncing = true; render();
  try {
    await sync(S);
    persist();
    if (show) toast(t('sync.ok'));
  } catch (e) {
    if (e.auth === false) { S.settings.code = ''; persist(); toast(t('sync.badCode')); }
    else toast(navigator.onLine ? t('sync.fail', { m: e.message }) : t('sync.offline'));
  } finally {
    ui.syncing = false; render();
  }
}
const bgSync = () => { if (canSync(S) && navigator.onLine) doSync(false); };

// ---------- Eventos ----------
// Respuesta al tocar (no al soltar): vibración suave inmediata en cualquier botón.
$app.addEventListener('pointerdown', (e) => { if (e.target.closest('button,[data-a]')) buzz(8); }, { passive: true });
$app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-a]');
  if (!el || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && el.type === 'checkbox')) return;
  if (el.dataset.v !== undefined) ui.popKey = `${el.dataset.a}|${el.dataset.v}`;
  A[el.dataset.a]?.(el, e);
});
$app.addEventListener('change', (e) => {
  const el = e.target.closest('[data-a]');
  if (el && (el.tagName === 'SELECT' || el.type === 'checkbox')) A[el.dataset.a]?.(el, e);
});

// Reloj: actualiza cronómetros sin volver a dibujar toda la pantalla.
setInterval(() => {
  const a = S.active;
  if (!a || route() !== 'session') return;
  const el = $app.querySelector('[data-tick="elapsed"]');
  if (el) el.textContent = mmss(elapsedS(a));
  if (a.restEnd) {
    const left = Math.ceil((a.restEnd - Date.now()) / 1000);
    if (left <= 0) { a.restEnd = null; beep(990, 300); buzz([200, 100, 200]); persist(); render(); return; }
    const r = $app.querySelector('[data-tick="rest"]');
    if (r) r.textContent = mmss(left);
    const ring = document.getElementById('ring');
    if (ring) ring.style.strokeDashoffset = String(2 * Math.PI * 54 * (1 - left / (a.restTotal || left)));
    if (left <= 3) beep(520, 80);
  }
  if (a.timer?.running) {
    const b = a.plan.blocks[a.idx];
    const secs = (a.timer.accum + Date.now() - a.timer.t0) / 1000;
    const sw = $app.querySelector('[data-tick="stopwatch"]');
    if (sw) sw.textContent = mmss(secs);
    if (b.protocol) {
      const cyc = b.protocol.workS + b.protocol.easyS;
      const work = secs % cyc < b.protocol.workS;
      const phase = work ? 'work' : 'easy';
      if (phase !== a.timer.lastPhase) { a.timer.lastPhase = phase; beep(work ? 990 : 520, 250); buzz(work ? [150, 80, 150] : 120); render(); }
    } else if (b.kind === 'timed' && b.durationS && Math.abs(secs - b.durationS) < 0.6) {
      beep(880, 300); buzz([200, 100, 200]);
    }
  }
}, 1000);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

render();
bgSync();
loadBody().then((ok) => ok && render());
