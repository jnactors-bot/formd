// FORMD · interfaz. Una sola página, sin dependencias. Todo el estado vive en store.js.
import { CATALOG } from './catalog.js';
import {
  BY_CODE, EQUIPMENT_PRESETS, EVIDENCE, EVIDENCE_TITLE, FACTS, TIMES, ZONE_TARGET, addSetToFill, adaptiveHint, bestScore, csvFromHistory,
  e1rm, extraExercise, hybridWarnings, isPR, lastPerformance, makePlan, nextSplit, plannedUnits, regionSetsLastDays,
  sessionVolumeKg, setsOfExercise, shortenPlan, shortenRests, suggestSubstitutes, suggestedWeightKg, weeklyLoad,
} from './engine.js';
import { bodySVG, viewOfRegion } from './bodymap.js';
import { DICT, getLang, setLang, t } from './i18n.js';
import { api, canSync, exportBackup, load, save, scriptUrl, sync } from './store.js';

const LB = 2.2046226218;
let S = load();
setLang(S.settings.lang);

const ui = {
  screen: null, tab: 'home', minutes: 45, plan: null, view: 'front', histTab: 'date', histEx: null,
  modal: null, toast: '', hintDismissed: -1, summary: null, syncing: false, timerTick: 0,
};

const $app = document.getElementById('app');

// ---------- Utilidades ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lang = () => getLang();
const exName = (ex) => (lang() === 'en' ? ex.en : ex.es);
const regionName = (code) => { const r = CATALOG.regions.find((x) => x.code === code); return r ? (lang() === 'en' ? r.en : r.es) : code; };
const equipName = (c) => { const e = CATALOG.equipment.find((x) => x.code === c); return e ? (lang() === 'en' ? e.en : e.es) : c; };
const unit = () => S.settings.unit;
const toDisp = (kg) => Math.round((unit() === 'kg' ? kg : kg * LB) * 10) / 10;
const toKg = (v) => (unit() === 'kg' ? v : v / LB);
const fmtW = (kg) => `${toDisp(kg)} ${unit()}`;
const mmss = (sec) => { sec = Math.max(0, Math.round(sec)); return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`; };
const pad = (n) => String(n).padStart(2, '0');
const localISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const persist = () => { if (!save(S)) toast(lang() === 'en' ? 'Storage full or blocked' : 'Almacenamiento lleno o bloqueado'); };
const splitTitleEs = (split) => DICT.es['split.' + split] ?? split;
const available = () => new Set(S.settings.equipment);

function toast(msg) {
  ui.toast = msg;
  render();
  clearTimeout(toast.h);
  toast.h = setTimeout(() => { ui.toast = ''; render(); }, 3500);
}

// ---------- Sonido y vibración ----------
let audio;
function beep(freq = 880, ms = 180) {
  try {
    audio = audio ?? new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.frequency.value = freq; g.gain.value = 0.08;
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
  if (!S.settings.mode) return 'welcome';
  if (!S.settings.onboarded) return 'equip';
  if (ui.screen === 'summary' && ui.summary) return 'summary';
  if (ui.screen === 'session' && S.active) return 'session';
  if (ui.screen === 'plan' && ui.plan) return 'plan';
  return 'tabs';
}

function go(screen, tab) {
  ui.screen = screen;
  if (tab) ui.tab = tab;
  render();
  window.scrollTo(0, 0);
}

// ---------- Vistas ----------
function logo() {
  return `<div class="logo">FORM<span>D</span></div>`;
}

function viewWelcome() {
  const pick = ui.pickMode ?? 'muscle';
  const card = (id) => `<button class="mode ${pick === id ? 'on' : ''}" data-a="pickMode" data-v="${id}" role="radio" aria-checked="${pick === id}">
      <span class="mode-t">${pick === id ? '●' : '○'} ${t('mode.' + id)}</span><span class="mode-d">${t('mode.' + id + 'Desc')}</span></button>`;
  return `<main class="pad col">
    <div class="row between">${logo()}<span class="mut sm">${t('welcome.step', { n: 1, total: 3 })}</span></div>
    <h1>${t('welcome.title')}</h1>
    <p class="mut">${t('welcome.subtitle')}</p>
    <div class="col gap" role="radiogroup">${card('muscle')}${card('hybrid')}</div>
    <div class="grow"></div>
    <p class="mut sm center">${t('welcome.next')}</p>
    <button class="cta" data-a="confirmMode">${t('common.continue')}</button>
    <div class="row center gap sm">${langToggle()}</div>
  </main>`;
}

function langToggle() {
  return ['es', 'en'].map((l) => `<button class="link ${lang() === l ? 'on' : ''}" data-a="setLang" data-v="${l}">${l.toUpperCase()}</button>`).join(' · ');
}

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

function unitToggle() {
  return `<div class="row gap">${['kg', 'lb'].map((u) => `<button class="seg ${unit() === u ? 'on' : ''}" data-a="setUnit" data-v="${u}">${u}</button>`).join('')}</div>`;
}

function viewEquip() {
  return `<main class="pad col">
    <div class="row between">${logo()}<span class="mut sm">${t('welcome.step', { n: 2, total: 3 })}</span></div>
    <h1>${t('equip.title')}</h1><p class="mut">${t('equip.subtitle')}</p>
    <div class="row gap">${presetButtons()}</div>
    <div class="label">${t('equip.detail')}</div>
    <div class="col">${equipChecks()}</div>
    <div class="card row between"><span>${t('equip.units')}</span>${unitToggle()}</div>
    <button class="cta" data-a="finishOnboarding">${t('equip.start')}</button>
  </main>`;
}

function nav() {
  const item = (id, key, icon) => `<button class="navb ${ui.tab === id ? 'on' : ''}" data-a="tab" data-v="${id}" aria-current="${ui.tab === id}">${icon}<span>${t(key)}</span></button>`;
  const ic = {
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11l8-7 8 7v9H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    history: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    profile: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  };
  return `<nav class="nav">${item('home', 'nav.today', ic.home)}${item('history', 'nav.history', ic.history)}${item('profile', 'nav.profile', ic.profile)}</nav>`;
}

function warnHTML(plan) {
  return (plan.warnings ?? []).map((w) => `<div class="warn">${t('warn.' + w.key)}</div>`).join('');
}

function viewHome() {
  const mode = S.settings.mode;
  const split = nextSplit(mode, S.history);
  const warnings = mode === 'hybrid' ? hybridWarnings(S.history, split) : [];
  const load = weeklyLoad(S.history);
  const resume = S.active ? `<div class="card accent-b"><b>${t('home.resume')}</b><button class="cta sm-cta" data-a="resume">${t('home.resumeBtn')}</button></div>` : '';
  const hybridLoad = mode === 'hybrid' ? `<div class="card"><div class="label">${t('home.week')}</div><div class="row gap stats">
      <div><b>${load.sessions}</b><span>${t('home.weekSessions')}</span></div>
      <div><b>${load.cardioMin}</b><span>${t('home.weekCardio')}</span></div>
      <div><b>${Math.round(toDisp(load.strengthKg))}</b><span>${unit()} ${lang() === 'en' ? 'volume' : 'volumen'}</span></div></div></div>` : '';
  return `<main class="pad col">
    <div class="row between">${logo()}<span class="mut sm">${syncBadge()}</span></div>
    ${resume}
    <div><div class="kicker">${t('home.mode', { mode: t('mode.' + mode).toUpperCase() })}</div>
      <h1>${t('split.' + split)}</h1><p class="mut">${t('splitDesc.' + split)}</p></div>
    ${warnings.map((w) => `<div class="warn">${t('warn.' + w.key)}</div>`).join('')}
    ${hybridLoad}
    <div><div class="mut sm mb">${t('home.howMuchTime')}</div>
      <div class="row gap">${TIMES.map((m) => `<button class="chip ${ui.minutes === m ? 'on' : ''}" data-a="minutes" data-v="${m}" aria-pressed="${ui.minutes === m}">${m}</button>`).join('')}</div>
      <div class="mut xs">${t('common.minutes')}</div></div>
    <div class="grow"></div>
    <button class="cta" data-a="makePlan">${t('home.generate', { min: ui.minutes })}</button>
  </main>${nav()}`;
}

function syncBadge() {
  if (!canSync(S)) return '';
  if (ui.syncing) return '⟳';
  return S.pending.length || S.deleted.length ? `● ${t('history.offline')}` : `✓ ${t('sync.ok')}`;
}

function whyHTML(keys) {
  return keys.map((k) => `<button class="tag lv-${EVIDENCE[k].level}" data-a="evidence" data-v="${k}">${EVIDENCE_TITLE[k][lang()]} · ${EVIDENCE[k].level}</button>`).join(' ');
}

function blockLine(b, i, plan) {
  if (b.type === 'warmup') return `<div class="card sm"><b>${t('plan.warmup')}</b> · ${b.minutes} ${t('common.min')}<div class="mut xs">${t('warmup.text')}</div></div>`;
  if (b.type === 'cooldown') return `<div class="card sm"><b>${t('plan.cooldown')}</b> · ${b.minutes} ${t('common.min')}<div class="mut xs">${t('cooldown.text')}</div></div>`;
  const ex = BY_CODE.get(b.code);
  let detail;
  if (b.kind === 'cardio') {
    detail = b.protocol ? `${b.protocol.rounds} × (${b.protocol.workS}s ${t('session.work').toLowerCase()} + ${b.protocol.easyS}s ${t('session.easy').toLowerCase()})` : `${Math.round(b.durationS / 60)} ${t('common.min')}`;
  } else if (b.kind === 'timed') {
    detail = `${b.sets} × ${b.durationS}s · ${b.restS}s ${t('plan.rest')}`;
  } else {
    detail = `${b.sets} × ${b.repMin}–${b.repMax} · ${b.restS}s ${t('plan.rest')} · RIR ${b.rir}`;
  }
  return `<div class="card sm"><div class="row between"><b>${esc(exName(ex))}</b><span class="mut sm">${detail}</span></div>
    <div class="mut xs">${Object.entries(ex.weights).filter(([, w]) => w >= 0.7).map(([r]) => regionName(r)).join(' · ')}${b.droppable ? ` · ${t('plan.dropFirst')}` : ''}</div>
    <div class="mt">${whyHTML(b.why ?? [])}</div></div>`;
}

function viewPlan() {
  const p = ui.plan;
  return `<main class="pad col">
    <div class="row between"><button class="link" data-a="backHome">‹ ${t('common.back')}</button><span class="mut sm">${t('mode.' + p.mode)} · ${p.minutes} ${t('common.min')}</span></div>
    <h1>${t('split.' + p.split)}</h1>
    ${warnHTML(p)}
    <div class="card"><div class="label">${t('plan.why')}</div><div>${whyHTML(p.why)}</div></div>
    <div class="col gap">${p.blocks.map((b, i) => blockLine(b, i, p)).join('')}</div>
    <div class="mut sm center">${t('plan.total')}: ${Math.round(p.plannedSeconds / 60)} ${t('common.min')}</div>
    <button class="cta" data-a="startSession">${t('plan.start')}</button>
  </main>`;
}

// ---------- Sesión activa ----------
function totals(a) {
  const exs = a.plan.blocks.filter((b) => b.type === 'exercise' && b.kind === 'strength' || b.kind === 'timed');
  const totalSets = exs.reduce((n, b) => n + b.sets, 0);
  return { totalSets, done: a.sets.length };
}

function bodyCard(a, code) {
  const ex = code ? BY_CODE.get(code) : null;
  const planned = plannedUnits(a.plan);
  const regions = Object.keys(planned).sort((x, y) => (a.fill[y] ?? 0) - (a.fill[x] ?? 0) || planned[y] - planned[x]).slice(0, 6);
  const primary = ex ? Object.entries(ex.weights).filter(([, w]) => w >= 0.7).map(([r]) => r) : [];
  const view = ui.view;
  return `<div class="card row gap body-card">
    <div class="body-wrap">${bodySVG(view, a.fill)}
      <button class="link xs" data-a="flipView">${view === 'front' ? t('session.back') : t('session.front')} ↻</button></div>
    <div class="grow zones"><div class="mut xs mb">${t('session.bodyTitle')}</div>
      ${regions.map((r) => `<div class="zone ${primary.includes(r) ? 'now' : ''}"><span>${esc(regionName(r))}</span>
        <i style="--p:${Math.round((a.fill[r] ?? 0) * 100)}%"></i><b>${Math.round((a.fill[r] ?? 0) * 100)}%</b></div>`).join('')}</div>
  </div>`;
}

function elapsedS(a) { return (Date.now() - a.startedAt) / 1000; }

function viewSession() {
  const a = S.active;
  const b = a.plan.blocks[a.idx];
  const { totalSets, done } = totals(a);
  const exBlocks = a.plan.blocks.filter((x) => x.type === 'exercise');
  const exNo = Math.max(1, a.plan.blocks.slice(0, a.idx + 1).filter((x) => x.type === 'exercise').length);
  const hint = adaptiveHint({ plan: a.plan, completedSets: done, totalSets, elapsedS: elapsedS(a) });
  const head = `<div class="row between mut sm"><span><b class="acc">${t('mode.' + a.mode).toUpperCase()}</b>${b.type === 'exercise' ? ' · ' + t('session.exercise', { n: exNo, total: exBlocks.length }) : ''}</span>
      <span data-tick="elapsed">${t('session.elapsed', { t: mmss(elapsedS(a)), total: mmss(a.plan.plannedSeconds) })}</span></div>
    <div class="bar"><i style="width:${Math.min(100, Math.round(((a.idx) / a.plan.blocks.length) * 100))}%"></i></div>`;
  const banner = hint && done !== ui.hintDismissed
    ? `<div class="warn">${t('adapt.' + hint)}<div class="row gap mt">${hint === 'behind'
      ? `<button class="seg" data-a="shortenRests">${t('adapt.shortenRests')}</button><button class="seg" data-a="dropLast">${t('adapt.dropLast')}</button>`
      : `<button class="seg" data-a="addExtra">${t('adapt.addExtra')}</button>`}
      <button class="seg" data-a="dismissHint">${t('adapt.dismiss')}</button></div></div>` : '';
  let body = '';
  if (a.restEnd && Date.now() < a.restEnd) body = viewRest(a);
  else if (b.type === 'warmup') body = simpleBlock(t('plan.warmup'), t('warmup.text'), t('session.warmupDone'), 'nextBlock');
  else if (b.type === 'cooldown') body = simpleBlock(t('plan.cooldown'), t('cooldown.text'), t('session.cooldownDone'), 'finishSession');
  else if (b.kind === 'strength') body = viewStrength(a, b);
  else body = viewTimed(a, b);
  const fin = `<button class="link xs" data-a="finishAsk">${t('session.finish')}</button>`;
  return `<main class="pad col">${head}${banner}${body}${b.type === 'exercise' ? bodyCard(a, b.code) : ''}<div class="center">${fin}</div></main>`;
}

function simpleBlock(title, text, cta, action) {
  return `<div class="card col"><h2>${title}</h2><p class="mut">${text}</p><button class="cta" data-a="${action}">${cta}</button></div>`;
}

function viewRest(a) {
  const left = Math.ceil((a.restEnd - Date.now()) / 1000);
  const b = a.plan.blocks[a.idx];
  const ex = BY_CODE.get(b.code);
  return `<div class="card col center rest">
    <div class="mut">${t('session.restTitle')}</div>
    <div class="big" data-tick="rest">${mmss(left)}</div>
    <div class="mut sm">${t('session.next', { name: exName(ex) })}</div>
    <div class="row gap">${[30, 60, 90, 120].map((s) => `<button class="seg ${a.restTotal === s ? 'on' : ''}" data-a="setRest" data-v="${s}">${s}s</button>`).join('')}</div>
    <button class="seg" data-a="skipRest">${t('session.restSkip')}</button></div>`;
}

function viewStrength(a, b) {
  const ex = BY_CODE.get(b.code);
  const setNo = a.setNo;
  const last = lastPerformance(S.history, b.code);
  const prefillKg = b.suggestKg ?? last?.peso_kg;
  const weight = prefillKg ? toDisp(prefillKg) : '';
  const reps = last?.reps ?? b.repMin;
  const step = unit() === 'kg' ? 2.5 : 5;
  return `<div class="col">
    <div><div class="kicker">${Object.entries(ex.weights).filter(([, w]) => w >= 0.7).map(([r]) => regionName(r)).join(' · ').toUpperCase()} · ${t('session.set', { n: setNo, total: b.sets })}</div>
      <h1>${esc(exName(ex))}</h1><p class="mut">${t('session.target', { min: b.repMin, max: b.repMax, rir: b.rir })}${b.fromCode ? ' · ↔ ' + esc(exName(BY_CODE.get(b.fromCode))) : ''}</p></div>
    <div class="row gap">
      <div class="card grow"><div class="mut xs">${t('session.previous')}</div><div class="num">${last ? `${fmtW(last.peso_kg)} × ${last.reps}` : '—'}</div></div>
      <div class="card grow accent-b"><div class="mut xs">${t('session.today')}</div><div class="num acc" data-tick="todayview">${weight !== '' ? weight + ' ' + unit() : '—'}</div></div>
    </div>
    <div class="row gap">
      <label class="grow">${t('session.weight', { unit: unit() })}<input id="f-w" type="number" inputmode="decimal" step="${step}" min="0" value="${weight}"></label>
      <label class="grow">${t('session.reps')}<input id="f-r" type="number" inputmode="numeric" min="0" value="${reps}"></label>
      <label style="width:84px">${t('session.rir')}<input id="f-rir" type="number" inputmode="numeric" min="0" max="10" value="${b.rir}"></label>
    </div>
    <input id="f-n" type="text" maxlength="200" placeholder="${t('session.note')}">
    <button class="cta" data-a="completeSet">${t('session.complete')}</button>
    <div class="row gap">
      <button class="seg bad grow" data-a="busy">${t('session.busy')}</button>
      <button class="seg grow" data-a="noEquip">${t('session.noEquip')}</button></div>
    <div class="row gap"><button class="seg grow" data-a="evidence" data-v="${(b.why ?? [])[0] ?? 'proximity'}">${t('session.evidence')}</button>
      <button class="seg grow" data-a="skipExercise">${t('session.skipExercise')}</button></div>
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
    const inCyc = el % cyc;
    const work = inCyc < b.protocol.workS;
    const round = Math.min(b.protocol.rounds, Math.floor(el / cyc) + 1);
    phase = `<div class="phase ${work ? 'hard' : 'easy'}" data-tick="phase">${work ? t('session.work') : t('session.easy')} · ${t('session.round', { n: round, total: b.protocol.rounds })}</div>`;
  }
  const isCardio = b.kind === 'cardio';
  return `<div class="col">
    <div><div class="kicker">${isCardio ? t('kind.cardio').toUpperCase() : t('session.set', { n: a.setNo, total: b.sets }).toUpperCase()}</div>
      <h1>${esc(exName(ex))}</h1><p class="mut">${isCardio ? Math.round(b.durationS / 60) + ' ' + t('common.min') : b.durationS + ' s'}</p></div>
    <div class="card col center"><div class="mut">${t('session.timer')}</div><div class="big" data-tick="stopwatch">${mmss(el)}</div>${phase}
      <button class="cta" data-a="${running ? 'timerStop' : 'timerStart'}">${running ? t('session.stop') : t('session.start')}</button></div>
    ${isCardio ? `<label>${t('session.distance')}<input id="f-d" type="number" inputmode="decimal" step="0.1" min="0"></label>
      <button class="seg" data-a="endBlock">${t('session.endBlock')}</button>` : `<button class="seg" data-a="skipExercise">${t('session.skipExercise')}</button>`}
    <div class="row gap">${isCardio ? '' : `<button class="seg grow" data-a="busy">${t('session.busy')}</button>`}
      <button class="seg grow" data-a="evidence" data-v="${(b.why ?? [])[0] ?? 'proximity'}">${t('session.evidence')}</button></div>
  </div>`;
}

// ---------- Resumen ----------
function viewSummary() {
  const sm = ui.summary;
  const fact = EVIDENCE[FACTS[Math.floor(Date.now() / 864e5) % FACTS.length]];
  const short = sm.short.map((r) => regionName(r));
  return `<main class="pad col">
    <div><div class="kicker">${t('summary.title').toUpperCase()}</div><h1>${t('summary.good')}</h1></div>
    <div class="grid2">
      <div class="card"><div class="mut xs">${t('summary.volume')}</div><div class="num">${fmtW(sm.volume)}</div></div>
      <div class="card"><div class="mut xs">${t('summary.sets')}</div><div class="num">${sm.sets}</div></div>
      <div class="card"><div class="mut xs">${t('summary.time')}</div><div class="num">${Math.round(sm.seconds / 60)} ${t('common.min')}</div><div class="mut xs">${t('summary.planned', { m: Math.round(sm.planned / 60) })}</div></div>
      <div class="card ${sm.prs ? 'accent-b' : ''}"><div class="mut xs">${t('summary.prs')}</div><div class="num ${sm.prs ? 'acc' : ''}">${sm.prs}</div></div>
    </div>
    <div class="card"><div class="mut xs mb">${t('summary.body')}</div>
      <div class="row gap center">${bodySVG('front', sm.fill, { label: t('session.front') })}${bodySVG('back', sm.fill, { label: t('session.back') })}</div></div>
    <div class="card"><div class="label">${t('summary.short')}</div><div class="mut">${short.length ? esc(short.join(' · ')) : t('summary.noShort')}</div></div>
    <div class="card"><div class="label">${t('summary.fact')} · ${t('evidence.level', { l: fact.level })}</div><div>${esc(fact[lang()])}</div><div class="mut xs mt">${t('evidence.noCite')}</div></div>
    <div class="card"><div class="mut sm mb">${t('summary.rate')}</div>
      <div class="row gap">${[1, 2, 3, 4, 5].map((n) => `<button class="chip ${ui.rating === n ? 'on' : ''}" data-a="rate" data-v="${n}">${n}</button>`).join('')}</div>
      <input id="f-c" type="text" maxlength="300" class="mt" placeholder="${t('summary.comment')}"></div>
    <button class="cta" data-a="saveSummary">${t('summary.save')}</button>
  </main>`;
}

// ---------- Historial ----------
function chartSVG(points) {
  if (points.length < 2) return `<div class="mut sm">${t('history.noData')}</div>`;
  const W = 300, H = 110, pad = 10;
  const ys = points.map((p) => p.y);
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const sx = (i) => pad + (i * (W - pad * 2)) / (points.length - 1);
  const sy = (y) => H - pad - ((y - lo) / Math.max(1e-9, hi - lo || 1)) * (H - pad * 2);
  const path = points.map((p, i) => `${sx(i).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${t('history.progress')}">
    <polyline points="${path}" fill="none" stroke="var(--ac)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    ${points.map((p, i) => `<circle cx="${sx(i).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="3.5" fill="var(--ac)"/>`).join('')}
  </svg><div class="row between mut xs"><span>${fmtW(lo)}</span><span>${fmtW(hi)}</span></div>`;
}

function sessionCard(s) {
  const pend = S.pending.includes(s.id);
  const det = (s.series ?? []).map((x) => {
    const ex = BY_CODE.get(x.ejercicio_code);
    const label = ex ? exName(ex) : x.ejercicio;
    const body = ex && ex.kind !== 'strength' ? `${mmss(x.duracion_s || 0)}${x.distancia_m ? ' · ' + (x.distancia_m / 1000).toFixed(1) + ' km' : ''}` : `${fmtW(x.peso_kg || 0)} × ${x.reps}`;
    return `<li><span>${esc(label)} · #${x.serie}</span><span>${body}${x.es_pr ? ' 🏆' : ''}</span></li>`;
  }).join('');
  return `<details class="card sess"><summary><div class="row between"><b>${esc(s.titulo)}</b><span class="mut sm">${esc(String(s.fecha).slice(0, 10))}</span></div>
    <div class="mut xs">${Math.round((s.segundos_real || 0) / 60)} ${t('common.min')} · ${fmtW(s.volumen_kg || 0)} · ${s.prs || 0} PR${canSync(S) ? ' · ' + (pend ? t('history.offline') : t('history.synced')) : ''}</div></summary>
    <ul class="list">${det}</ul>
    <button class="link bad" data-a="delSession" data-v="${esc(s.id)}">${t('history.delete')}</button></details>`;
}

function viewHistory() {
  const tabs = ['date', 'muscle', 'exercise'].map((id) => `<button class="seg ${ui.histTab === id ? 'on' : ''}" data-a="histTab" data-v="${id}">${t('history.by' + id[0].toUpperCase() + id.slice(1))}</button>`).join('');
  let body = '';
  const hist = [...S.history].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  if (!hist.length) body = `<div class="card mut">${t('history.empty')}</div>`;
  else if (ui.histTab === 'date') body = hist.map(sessionCard).join('');
  else if (ui.histTab === 'muscle') {
    const sets = regionSetsLastDays(S.history, 7);
    const fill = Object.fromEntries(Object.entries(sets).map(([r, v]) => [r, Math.min(1, v / 10)]));
    const rows = Object.entries(sets).sort((a, b) => b[1] - a[1]);
    body = `<div class="card"><div class="mut xs mb">${t('history.week')}</div>
      <div class="row gap center">${bodySVG('front', fill)}${bodySVG('back', fill)}</div></div>
      <div class="card">${rows.map(([r, v]) => `<div class="zone"><span>${esc(regionName(r))}</span><i style="--p:${Math.round(Math.min(1, v / 10) * 100)}%"></i><b>${v.toFixed(1)}</b></div>`).join('')}</div>`;
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
    body = `<label>${t('history.pickExercise')}<select data-a="histEx">${done.map((c) => `<option value="${c}" ${c === cur ? 'selected' : ''}>${esc(exName(BY_CODE.get(c)))}</option>`).join('')}</select></label>
      <div class="card"><div class="mut xs mb">${t('history.progress')}</div>${cardio ? `<div class="mut">${t('history.noData')}</div>` : chartSVG(pts.map((p) => ({ y: toDisp(p.y) })))}</div>`;
  }
  return `<main class="pad col"><div class="row between"><h1>${t('history.title')}</h1>
    ${canSync(S) ? `<button class="seg" data-a="doSync">${ui.syncing ? '⟳' : t('history.sync')}</button>` : ''}</div>
    <div class="row gap">${tabs}</div>${body}
    ${hist.length ? `<button class="seg" data-a="exportCsv">${t('history.export')}</button>` : ''}</main>${nav()}`;
}

// ---------- Perfil ----------
function viewProfile() {
  const connected = canSync(S);
  return `<main class="pad col"><h1>${t('profile.title')}</h1>
    <div class="card"><div class="label">${t('profile.mode')}</div>
      <div class="row gap">${['muscle', 'hybrid'].map((m) => `<button class="seg grow ${S.settings.mode === m ? 'on' : ''}" data-a="changeMode" data-v="${m}">${t('mode.' + m)}</button>`).join('')}</div>
      <div class="mut xs mt">${t('profile.modeNote')}</div></div>
    <div class="card row between"><span>${t('profile.unit')}</span>${unitToggle()}</div>
    <div class="card row between"><span>${t('profile.lang')}</span><div class="row gap">${['es', 'en'].map((l) => `<button class="seg ${lang() === l ? 'on' : ''}" data-a="setLang" data-v="${l}">${l.toUpperCase()}</button>`).join('')}</div></div>
    <div class="card"><div class="label">${t('profile.equip')}</div><div class="row gap mb">${presetButtons()}</div><div class="col">${equipChecks()}</div></div>
    <div class="card"><div class="label">${t('profile.connect')} · ${connected ? t('profile.connected') : t('profile.notConnected')}</div>
      <div class="mut xs mb">${t('profile.connectNote')}</div>
      ${scriptUrl() ? `<label>${t('profile.code')}<input id="f-code" type="password" autocomplete="off" value="${esc(S.settings.code)}"></label>
        <button class="seg mt" data-a="connect">${t('profile.test')}</button>` : `<div class="warn">${t('profile.noUrl')}</div>`}
      ${S.lastSync ? `<div class="mut xs mt">${t('profile.lastSync', { d: S.lastSync.slice(0, 16).replace('T', ' ') })}</div>` : ''}</div>
    <div class="card"><div class="label">${t('profile.backup')}</div><button class="seg" data-a="backup">JSON</button></div>
    <button class="link bad" data-a="resetAll">${t('profile.reset')}</button>
  </main>${nav()}`;
}

// ---------- Modales ----------
function modalHTML() {
  const m = ui.modal;
  if (!m) return '';
  let inner = '';
  if (m.type === 'evidence') {
    const e = EVIDENCE[m.key];
    inner = `<h2>${EVIDENCE_TITLE[m.key][lang()]}</h2><div class="kicker">${t('evidence.title').toUpperCase()} · ${t('evidence.level', { l: e.level })}</div>
      <p class="mut sm">${t('evidence.' + e.level)}</p><p>${esc(e[lang()])}</p>
      <p class="mut xs">${t('evidence.noCite')}. ${t('evidence.note')}</p>`;
  } else if (m.type === 'sub') {
    const cur = BY_CODE.get(m.from);
    const last = lastPerformance(S.history, m.from);
    inner = `<h2>${m.noEquip ? t('sub.titleNoEquip') : t('sub.title')}</h2><p class="mut sm">${t('sub.subtitle')}</p>
      ${m.list.length ? m.list.map((s, i) => {
        const w = suggestedWeightKg(cur, s.exercise, last?.peso_kg);
        return `<button class="opt ${i === 0 ? 'best' : ''}" data-a="useSub" data-v="${s.exercise.code}">
          <div class="row between"><b>${esc(exName(s.exercise))}</b>${i === 0 && !s.weak ? `<span class="acc xs">${t('sub.best')}</span>` : ''}</div>
          <div class="mut xs">${esc(s.reason[lang()])} · ${equipName(s.exercise.equipment)}${w ? ' · ' + t('sub.suggest', { w: fmtW(w) }) : ''}</div>
          ${s.weak ? `<div class="mut xs">${t('sub.weak')}</div>` : ''}</button>`;
      }).join('') : `<p>${t('sub.none')}</p>`}`;
  }
  return `<div class="overlay" data-a="closeModal"><div class="sheet" role="dialog" aria-modal="true">${inner}
    <button class="seg mt" data-a="closeModal">${m.type === 'sub' ? t('sub.wait') : t('common.close')}</button></div></div>`;
}

// ---------- Render ----------
function render() {
  setLang(S.settings.lang);
  const r = route();
  const views = { welcome: viewWelcome, equip: viewEquip, plan: viewPlan, session: viewSession, summary: viewSummary };
  let html;
  if (r === 'tabs') html = ui.tab === 'history' ? viewHistory() : ui.tab === 'profile' ? viewProfile() : viewHome();
  else html = views[r]();
  const keepScroll = render.last === r + ui.tab;
  const y = window.scrollY;
  $app.innerHTML = html + modalHTML() + (ui.toast ? `<div class="toast" role="status">${esc(ui.toast)}</div>` : '');
  if (keepScroll) window.scrollTo(0, y);
  render.last = r + ui.tab;
  keepAwake(r === 'session');
}

// ---------- Acciones ----------
const A = {
  pickMode(el) { ui.pickMode = el.dataset.v; render(); },
  confirmMode() { S.settings.mode = ui.pickMode ?? 'muscle'; persist(); render(); },
  setLang(el) { S.settings.lang = el.dataset.v; setLang(el.dataset.v); persist(); render(); },
  setUnit(el) { S.settings.unit = el.dataset.v; persist(); render(); },
  preset(el) { S.settings.equipment = [...EQUIPMENT_PRESETS[el.dataset.v]]; persist(); render(); },
  toggleEquip(el) {
    const c = el.dataset.v;
    const set = new Set(S.settings.equipment);
    el.checked ? set.add(c) : set.delete(c);
    if (!set.has('bodyweight')) set.add('bodyweight'); // el peso corporal siempre está disponible
    S.settings.equipment = [...set]; persist(); render();
  },
  finishOnboarding() { S.settings.onboarded = true; persist(); go('tabs', 'home'); },
  tab(el) { ui.tab = el.dataset.v; ui.screen = null; render(); window.scrollTo(0, 0); },
  minutes(el) { ui.minutes = Number(el.dataset.v); render(); },
  makePlan() {
    ui.plan = makePlan({ mode: S.settings.mode, minutes: ui.minutes, available: available(), history: S.history });
    if (!ui.plan.blocks.some((b) => b.type === 'exercise')) return toast(lang() === 'en' ? 'No exercises with your equipment' : 'No hay ejercicios con tu equipo');
    go('plan');
  },
  backHome() { ui.plan = null; go('tabs', 'home'); },
  startSession() {
    const p = ui.plan;
    S.active = {
      id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), mode: p.mode, split: p.split,
      fecha: localISO(), startedAt: Date.now(), plan: p, idx: 0, setNo: 1, sets: [], fill: {}, restEnd: null, restTotal: 0, timer: null,
    };
    persist(); go('session');
  },
  resume() { go('session'); },
  nextBlock() { advanceBlock(); },
  completeSet() {
    const a = S.active, b = a.plan.blocks[a.idx];
    const w = Number(document.getElementById('f-w')?.value || 0);
    const reps = Number(document.getElementById('f-r')?.value || 0);
    const rir = document.getElementById('f-rir')?.value;
    if (!(reps > 0)) return toast(lang() === 'en' ? 'Enter the reps' : 'Escribe las repeticiones');
    const kg = Math.round(toKg(w) * 100) / 100;
    const pr = isPR(S.history, b.code, kg, reps) && !a.sets.some((x) => x.ejercicio_code === b.code && e1rm(x.peso_kg, x.reps) >= e1rm(kg, reps));
    recordSet(a, b, { peso_kg: kg, reps, rir: rir === '' ? null : Number(rir), nota: document.getElementById('f-n')?.value || '', es_pr: pr });
    if (pr) { toast(t('session.pr')); buzz([80, 60, 80]); }
  },
  setRest(el) { const a = S.active; a.restTotal = Number(el.dataset.v); a.restEnd = Date.now() + a.restTotal * 1000; persist(); render(); },
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
    a.sets.push({ ejercicio_code: b.code, ejercicio: BY_CODE.get(b.code).es, serie: 1, peso_kg: 0, reps: 0, duracion_s: secs, distancia_m: Math.round(km * 1000), rir: null, nota: '', es_pr: false });
    a.fill = addSetToFill(a.fill, a.plan, b.code);
    a.cardioSecs = 0; advanceBlock();
  },
  skipExercise() { advanceBlock(); },
  busy() { openSub(false); },
  noEquip() { openSub(true); },
  useSub(el) {
    const a = S.active, b = a.plan.blocks[a.idx];
    const to = BY_CODE.get(el.dataset.v);
    const from = BY_CODE.get(b.code);
    const last = lastPerformance(S.history, b.code);
    a.plan.blocks[a.idx] = { ...b, code: to.code, kind: to.kind, repMin: to.repMin ?? b.repMin, repMax: to.repMax ?? b.repMax, durationS: to.durationS ?? b.durationS, fromCode: from.code, suggestKg: suggestedWeightKg(from, to, last?.peso_kg) || undefined };
    ui.modal = null; persist(); render();
  },
  closeModal(el, e) {
    // El fondo oscuro cierra el modal solo si el clic fue sobre él, no sobre el contenido.
    if (el.classList.contains('overlay') && e && e.target !== el) return;
    ui.modal = null; render();
  },
  evidence(el) { ui.modal = { type: 'evidence', key: el.dataset.v }; render(); },
  flipView() { ui.view = ui.view === 'front' ? 'back' : 'front'; render(); },
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
    if (ex) { a.plan.blocks.splice(a.plan.blocks.length - 1, 0, ex); }
    ui.hintDismissed = a.sets.length; persist(); render();
  },
  dismissHint() { ui.hintDismissed = S.active.sets.length; render(); },
  finishAsk() { if (confirm(t('session.finishAsk'))) A.finishSession(); },
  finishSession() { finishSession(); },
  rate(el) { ui.rating = Number(el.dataset.v); render(); },
  saveSummary() { saveSummary(); },
  histTab(el) { ui.histTab = el.dataset.v; render(); },
  histEx(el) { ui.histEx = el.value; render(); },
  delSession(el) {
    if (!confirm(t('history.deleteAsk'))) return;
    const id = el.dataset.v;
    S.history = S.history.filter((s) => s.id !== id);
    S.pending = S.pending.filter((x) => x !== id);
    if (canSync(S)) S.deleted.push(id);
    persist(); render(); bgSync();
  },
  exportCsv() { download('formd-historial.csv', csvFromHistory(S.history), 'text/csv'); },
  backup() { download('formd-copia.json', exportBackup(S), 'application/json'); },
  doSync() { doSync(true); },
  connect() {
    S.settings.code = document.getElementById('f-code')?.value.trim() ?? '';
    persist(); doSync(true);
  },
  changeMode(el) {
    if (el.dataset.v === S.settings.mode) return;
    if (!confirm(t('profile.changeModeAsk'))) return;
    S.settings.mode = el.dataset.v; persist(); render();
  },
  resetAll() {
    if (!confirm(t('profile.resetAsk'))) return;
    const lang0 = S.settings.lang;
    localStorage.removeItem('formd.v1');
    S = load(); S.settings.lang = lang0; ui.screen = null; ui.pickMode = null; persist(); render();
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
  a.sets.push({ ejercicio_code: b.code, ejercicio: ex.es, serie: a.setNo, distancia_m: 0, duracion_s: 0, ...extra });
  a.fill = addSetToFill(a.fill, a.plan, b.code);
  buzz(40);
  const isLastSet = a.setNo >= b.sets;
  if (isLastSet) {
    a.setNo = 1;
    const nextIdx = a.idx + 1;
    const next = a.plan.blocks[nextIdx];
    a.idx = nextIdx;
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

function openSub(noEquip) {
  const a = S.active, b = a.plan.blocks[a.idx];
  const cur = BY_CODE.get(b.code);
  const doneToday = new Set(a.sets.map((x) => x.ejercicio_code));
  const remaining = Math.max(0, a.plan.plannedSeconds - elapsedS(a)) / 60;
  const list = suggestSubstitutes({ current: cur, available: available(), blocked: new Set([cur.equipment]), doneToday, minutesLeft: remaining, history: S.history });
  ui.modal = { type: 'sub', from: cur.code, list, noEquip };
  render();
}

function finishSession() {
  const a = S.active;
  const secs = Math.round(elapsedS(a));
  // Zonas que el plan quería trabajar de forma principal y quedaron por debajo de la meta.
  const wanted = new Set();
  for (const b of a.plan.blocks) if (b.type === 'exercise') for (const [r, w] of Object.entries(BY_CODE.get(b.code).weights)) if (w >= 0.7) wanted.add(r);
  const short = [...wanted].filter((r) => (a.fill[r] ?? 0) < 0.99);
  ui.rating = 0;
  ui.summary = {
    volume: sessionVolumeKg(a.sets), sets: a.sets.length, seconds: secs, planned: a.plan.plannedSeconds,
    prs: a.sets.filter((x) => x.es_pr).length, fill: a.fill, short,
  };
  ui.screen = 'summary'; render(); window.scrollTo(0, 0);
}

function saveSummary() {
  const a = S.active, sm = ui.summary;
  const rec = {
    id: a.id, fecha: a.fecha, modo: a.mode, split: a.split, titulo: splitTitleEs(a.split), minutos_plan: Math.round(a.plan.plannedSeconds / 60),
    segundos_real: sm.seconds, volumen_kg: sm.volume, prs: sm.prs, valoracion: ui.rating || 0,
    comentario: document.getElementById('f-c')?.value ?? '', series: a.sets,
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
$app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-a]');
  if (!el || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && el.type === 'checkbox')) return;
  A[el.dataset.a]?.(el, e);
});
$app.addEventListener('change', (e) => {
  const el = e.target.closest('[data-a]');
  if (el && (el.tagName === 'SELECT' || el.type === 'checkbox')) A[el.dataset.a]?.(el.tagName === 'SELECT' ? Object.assign(el, { value: el.value }) : el, e);
});
$app.addEventListener('input', (e) => {
  if (e.target.id === 'f-w') {
    const v = $app.querySelector('[data-tick="todayview"]');
    if (v) v.textContent = e.target.value ? `${e.target.value} ${unit()}` : '—';
  }
});
window.addEventListener('online', bgSync);

// Reloj: actualiza cronómetros sin volver a dibujar toda la pantalla.
setInterval(() => {
  const a = S.active;
  if (!a || route() !== 'session') return;
  const el = $app.querySelector('[data-tick="elapsed"]');
  if (el) el.textContent = t('session.elapsed', { t: mmss(elapsedS(a)), total: mmss(a.plan.plannedSeconds) });
  if (a.restEnd) {
    const left = Math.ceil((a.restEnd - Date.now()) / 1000);
    const r = $app.querySelector('[data-tick="rest"]');
    if (left <= 0) { a.restEnd = null; beep(990, 300); buzz([200, 100, 200]); persist(); render(); return; }
    if (r) r.textContent = mmss(left);
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
