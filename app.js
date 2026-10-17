// FORMD · interfaz. Una sola página, sin dependencias. Todo el estado vive en store.js.
// Principios: una acción principal por pantalla, poco texto, movimiento con resorte (0,3–0,5 s),
// respuesta al toque (no al soltar), vibración suave y regreso disponible en todas las pantallas.
import { CATALOG } from './catalog.js';
import {
  BY_CODE, EQUIPMENT_PRESETS, MODES, baseMode, EVIDENCE, EVIDENCE_TITLE, FACTS, TIMES, addSetToFill, adaptiveHint, csvFromHistory,
  e1rm, extraExercise, hybridWarnings, isPR, lastPerformance, makePlan, nextSplit, plannedUnits, regionSetsLastDays,
  sessionVolumeKg, shortenPlan, shortenRests, suggestSubstitutes, suggestedWeightKg, weeklyLoad,
  DEFAULT_WEEK, addDays, buildWeek, calendarEvents, dateMs, dayIdx, localDate, needsSoftReturn, nextPlannedDay, planRange, rankSplits, suggestToday,
} from './engine.js';
import { applyFill, bodySVG, loadBody } from './bodymap.js';
import { CUES, moveKey } from './anim.js';
import { exRemote } from './exmap.js';
import { cooldownFor, warmupFor, warmupRemote } from './warmup.js';
import { DICT, getLang, setLang, t } from './i18n.js';
import { accountMode, api, canSync, centralUrl, exportBackup, googleClientId, load, personalMode, save, scriptUrl, sync } from './store.js';

const LB = 2.2046226218;
let S = load();
setLang(S.settings.lang);

const TAB_ORDER = ['home', 'history', 'profile'];
const ui = {
  screen: null, tab: 'home', minutes: 45, plan: null, view: 'front', histTab: 'date', histEx: null,
  modal: null, toast: '', hintDismissed: -1, summary: null, syncing: false, dir: 'fwd',
  onbStep: S.settings.mode ? (S.settings.sex ? 3 : 2) : 1, pickMode: S.settings.mode ?? 'muscle', prevFill: null, popKey: null, rating: 0, splitOverride: null, calMonth: null, calSel: null,
  adminPending: null, admin: null,
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
const todayStr = () => localDate(Date.now());
const agendaArgs = () => ({ mode: S.settings.mode, history: S.history, skips: S.skips ?? [], week: S.settings.week ?? DEFAULT_WEEK, now: Date.now(), available: available() });
const DAY_LETTERS = { es: ['L', 'M', 'X', 'J', 'V', 'S', 'D'], en: ['M', 'T', 'W', 'T', 'F', 'S', 'S'] };
const dayLetter = (i) => DAY_LETTERS[lang()][i];
const fmtDate = (str, opts) => new Date(dateMs(str)).toLocaleDateString(lang() === 'en' ? 'en' : 'es', opts);
const splitName = (split) => t('splitShort.' + split);
const primaryRegionsOf = (ex) => Object.entries(ex.weights).filter(([, w]) => w >= 0.7).map(([r]) => r);

const ICON = {
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 11v6M12 7.5v.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11l8-7 8 7v9H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  history: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  profile: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h3v14H8zM13 5h3v14h-3z" fill="currentColor"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  chev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
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
  if (centralUrl() && googleClientId() && !S.account && !S.settings.guest) return 'login';
  if (S.account && !S.account.consent) return 'consent';
  if (S.account && S.account.consent && S.account.datosOk === false) return 'datos';
  if (S.account && S.account.estado && S.account.estado !== 'Aprobado') return 'pending';
  if (!S.settings.onboarded) return ui.onbStep === 4 ? 'week' : ui.onbStep === 3 ? 'equip' : ui.onbStep === 2 ? 'sex' : 'welcome';
  if (ui.screen === 'summary' && ui.summary) return 'summary';
  if (ui.screen === 'session' && S.active) return 'session';
  if (ui.screen === 'plan' && ui.plan) return 'plan';
  if (ui.screen === 'calendar') return 'calendar';
  return 'tabs';
}
const DEEP = new Set(['equip', 'sex', 'week', 'plan', 'session', 'calendar']);

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
  if (r === 'week') { ui.onbStep = 3; ui.dir = 'back'; render(); return; }
  if (r === 'calendar') { go('tabs', 'home', 'back'); return; }
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

function viewLogin() {
  return `<main class="pad col stagger">
    <div class="row between">${logo()}<span></span></div>
    <div class="grow"></div>
    <h1 class="hero">${t('login.title')}</h1>
    <p class="mut">${t('login.sub')}</p>
    <div id="gsi" class="gsi" aria-label="${t('account.signIn')}"></div>
    ${ui.loginMsg ? `<div class="warn">${esc(ui.loginMsg)}</div>` : ''}
    <div class="grow"></div>
    <button class="link" data-a="guest">${t('login.guest')}</button>
    <p class="mut xs center">${t('login.guestNote')}</p>
  </main>`;
}

function viewConsent() {
  return `<main class="pad col stagger">
    <div class="row between">${logo()}<button class="link tiny" data-a="declineTerms">${t('consent.decline')}</button></div>
    <h1 class="hero">${t('consent.title')}</h1>
    <ul class="bullets"><li>${t('consent.item1')}</li><li>${t('consent.item2')}</li><li>${t('consent.item3')}</li></ul>
    <a class="link" href="privacidad.html" target="_blank" rel="noopener">${t('consent.policy')}</a>
    <div class="grow"></div>
    <div class="mut xs center">${esc(S.account?.email ?? '')}</div>
    <button class="cta" data-a="acceptTerms">${t('consent.accept')}</button>
  </main>`;
}

function viewDatos() {
  const d = S.account?.datos ?? {};
  const f = (id, label, type, val, extra = '') => `<label class="fld"><span class="mut xs">${label}</span><input id="d-${id}" type="${type}" value="${esc(val ?? '')}" ${extra}></label>`;
  return `<main class="pad col datos">
    <div class="row between">${logo()}<span></span></div>
    <h1 class="hero">${t('datos.title')}</h1>
    <div class="row gap">${f('nombres', t('datos.nombres'), 'text', d.nombres, 'autocomplete="given-name"')}${f('apellidos', t('datos.apellidos'), 'text', d.apellidos, 'autocomplete="family-name"')}</div>
    ${f('nacimiento', t('datos.nacimiento'), 'date', d.nacimiento)}
    <div class="row gap">${f('peso', t('datos.peso'), 'number', d.peso_kg, 'inputmode="decimal" step="0.1" min="25" max="400"')}${f('talla', t('datos.talla'), 'number', d.talla_cm, 'inputmode="numeric" min="100" max="250"')}</div>
    ${f('celular', t('datos.celular'), 'tel', d.celular, 'autocomplete="tel" inputmode="tel"')}
    <div class="grow"></div>
    <button class="cta" data-a="saveDatos">${t('common.continue')}</button>
    <button class="link" data-a="declineTerms">${t('datos.signOut')}</button>
  </main>`;
}

function viewPending() {
  const blocked = S.account?.estado === 'Bloqueado';
  return `<main class="pad col center-col">
    ${logo()}
    <h1 class="hero">${t(blocked ? 'pending.blockedTitle' : 'pending.title')}</h1>
    <p class="mut">${t(blocked ? 'pending.blockedSub' : 'pending.sub')}</p>
    <div class="mut xs">${esc(S.account?.email ?? '')}</div>
    <button class="cta" data-a="refreshAccount">${t('pending.retry')}</button>
    <button class="link" data-a="declineTerms">${t('datos.signOut')}</button>
  </main>`;
}

function viewWelcome() {
  const card = (id) => `<button class="mode ${ui.pickMode === id ? 'on' : ''}" data-a="pickMode" data-v="${id}" role="radio" aria-checked="${ui.pickMode === id}">
      <span class="mode-t">${t('mode.' + id)}</span><span class="mode-d">${t('mode.' + id + 'Short')}</span><i class="dot"></i></button>`;
  return `<main class="pad col stagger">
    <div class="row between">${logo()}<span class="mut sm">1 / 3</span></div>
    <h1 class="hero">${t('welcome.title')}</h1>
    <div class="col gap" role="radiogroup">${card('muscle')}${card('strength')}${card('hybrid')}${card('fatloss')}</div>
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
    <div class="row between">${backBtn()}<span class="mut sm">3 / 4</span></div>
    <h1 class="hero">${t('equip.title2')}</h1>
    <div class="col gap">${presetButtons()}</div>
    <div class="card row between"><span>${t('equip.units')}</span>${unitToggle()}</div>
    <details class="more"><summary>${t('equip.customize')}</summary><div class="col mt">${equipChecks()}</div></details>
    <div class="grow"></div>
    <button class="cta" data-a="confirmEquip">${t('common.continue')}</button>
  </main>`;
}

function weekFields() {
  const w = S.settings.week ?? DEFAULT_WEEK;
  const stepRow = (f, label) => `<div class="stepline"><span>${label}</span><div class="row gap"><button class="step-btn sm" data-a="weekStep" data-f="${f}" data-d="-1" aria-label="−">−</button><b class="stepnum">${w[f]}</b><button class="step-btn sm" data-a="weekStep" data-f="${f}" data-d="1" aria-label="+">+</button></div></div>`;
  return `<div class="label">${t('week.days')}</div>
    <div class="days7" role="group">${[0, 1, 2, 3, 4, 5, 6].map((i) => `<button class="daychip ${w.days.includes(i) ? 'on' : ''}" data-a="toggleDay" data-v="${i}" aria-pressed="${w.days.includes(i)}">${dayLetter(i)}</button>`).join('')}</div>
    <div class="col gap">${stepRow('min', t('week.min'))}${stepRow('max', t('week.max'))}</div>`;
}

function viewWeek() {
  return `<main class="pad col stagger">
    <div class="row between">${backBtn()}<span class="mut sm">4 / 4</span></div>
    <h1 class="hero">${t('week.title')}</h1>
    <div class="col">${weekFields()}</div>
    <p class="mut xs">${t('week.note')}</p>
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

function weekBar(wk) {
  const mark = (d) => (d.state === 'done' ? '✓' : d.state === 'missed' ? '✕' : '');
  return `<button class="weekbar" data-a="openCalendar" aria-label="${t('cal.title')}">${wk.days.map((d) =>
    `<span class="wd ${d.state} ${d.isToday ? 'td' : ''}"><i>${dayLetter(d.idx)}</i><b>${mark(d)}</b></span>`).join('')}</button>`;
}

function viewHome() {
  const mode = S.settings.mode;
  const args = agendaArgs();
  const sug = suggestToday(args);
  const split = ui.splitOverride ?? sug.split;
  const wk = buildWeek(args);
  const chosen = sug.rank.find((r) => r.split === split) ?? sug;
  const todaySkip = (S.skips ?? []).find((x) => x.date === todayStr());
  const next = todaySkip ? nextPlannedDay(args) : null;
  const resume = S.active ? `<button class="card accent-b resume" data-a="resume"><b>${t('home.resumeBtn')}</b><span class="mut xs">${esc(splitTitleEs(S.active.split))} · ${mmss((Date.now() - S.active.startedAt) / 1000)}</span></button>` : '';
  let note = '';
  if (todaySkip) note = `<div class="mut sm">${t('skip.today')}${next ? ' · ' + t('skip.movedTo', { split: splitName(next.split), day: fmtDate(next.date, { weekday: 'long' }) }) : ''}</div>`;
  else if (sug.restAdvised && !ui.splitOverride) note = `<div class="warn">${t('home.restAdvised')}</div>`;
  else if (chosen.tired?.length) note = `<div class="warn">${t('home.tired', { z: regionShort(chosen.tired[0].region), h: chosen.tired[0].hours })}</div>`;
  else if (baseMode(mode) === 'hybrid') { const w = hybridWarnings(S.history, split)[0]; if (w) note = `<div class="warn">${t('warn.' + w.key)}</div>`; }
  const soft = needsSoftReturn(S.history, Date.now()) ? `<span class="pill">${t('home.softReturn')}</span>` : '';
  return `<main class="pad col stagger">
    <div class="row between">${logo()}${syncBadge()}</div>
    ${resume}
    ${S.account && ui.expired ? `<button class="adminnote" data-a="reconnect"><span>${t('account.reconnect')}</span></button>` : ''}
    ${isAdmin() && ui.adminPending > 0 ? `<button class="adminnote" data-a="openAdmin"><span class="bubble">${ui.adminPending}</span><span>${ui.adminPending === 1 ? t('admin.homeOne') : t('admin.homeMany', { n: ui.adminPending })}</span><span class="chev">${ICON.chev}</span></button>` : ''}
    <div>${weekBar(wk)}<div class="mut xs center weeksum">${t('week.summary', { done: wk.doneDays, min: wk.min })}${wk.shortfall ? ' · ' + t('week.short', { n: wk.shortfall }) : ''}</div></div>
    <div class="grow-sm"></div>
    <div><div class="row between"><div class="kicker">${t('mode.' + mode).toUpperCase()}</div><button class="link tiny" data-a="openSplits">${t('home.change')}</button></div>
      <h1 class="hero">${splitName(split)}</h1>${note}${soft}</div>
    <div class="row gap times" role="group" aria-label="${t('home.howMuchTime')}">${TIMES.map((m) => `<button class="chip ${ui.minutes === m ? 'on' : ''}" data-a="minutes" data-v="${m}" aria-pressed="${ui.minutes === m}">${m}</button>`).join('')}</div>
    <div class="grow"></div>
    <button class="cta" data-a="makePlan">${t('home.generate', { min: ui.minutes })}</button>
    <button class="link skipbtn" data-a="${todaySkip ? 'unskipToday' : 'skipToday'}">${todaySkip ? t('skip.undo') : t('skip.btn')}</button>
  </main>${nav()}`;
}

// Enlace de Google Calendar con la sesión ya rellena (sin permisos ni servidor: un toque y listo).
function gcalLink(date, split) {
  const [hh, mm] = (remindCfg().time || '18:00').split(':');
  const start = date.replace(/-/g, '') + 'T' + hh + mm + '00';
  const endMs = new Date(dateMs(date, Number(hh)) + (ui.minutes || 45) * 60000 + Number(mm) * 60000);
  const end = `${endMs.getFullYear()}${pad(endMs.getMonth() + 1)}${pad(endMs.getDate())}T${pad(endMs.getHours())}${pad(endMs.getMinutes())}00`;
  const q = new URLSearchParams({ action: 'TEMPLATE', text: '💪 ' + splitName(split), dates: `${start}/${end}`, details: 'FORMD' });
  return 'https://calendar.google.com/calendar/render?' + q.toString();
}

function viewCalendar() {
  const args = agendaArgs();
  const today = todayStr();
  const month = ui.calMonth ?? today.slice(0, 7);
  const [y, m] = month.split('-').map(Number);
  const first = `${month}-01`;
  const offset = dayIdx(dateMs(first));
  const dim = new Date(y, m, 0).getDate();
  const plan = planRange({ ...args, from: today, n: 35 });
  const doneBy = new Map();
  for (const x of S.history) { const d = String(x.fecha).slice(0, 10); doneBy.set(d, [...(doneBy.get(d) ?? []), x]); }
  const skipBy = new Map((S.skips ?? []).map((x) => [x.date, x]));
  const stateOf = (d) => (doneBy.has(d) ? 'done' : skipBy.has(d) ? 'missed' : plan[d] ? (plan[d].extra ? 'extra' : 'planned') : '');
  const sel = ui.calSel ?? today;
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push('<span class="cell void"></span>');
  for (let d = 1; d <= dim; d++) {
    const date = `${month}-${pad(d)}`;
    const st = stateOf(date);
    cells.push(`<button class="cell ${st} ${date === today ? 'td' : ''} ${date === sel ? 'sel' : ''}" data-a="calSel" data-v="${date}" aria-label="${fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}"><span>${d}</span><i></i></button>`);
  }
  const mt = fmtDate(first, { month: 'long', year: 'numeric' });
  const monthTitle = mt.charAt(0).toUpperCase() + mt.slice(1);
  // detalle del día elegido
  const done = doneBy.get(sel) ?? [];
  const sk = skipBy.get(sel);
  let detail = `<div class="mut">${t('cal.free')}</div>`;
  if (done.length) detail = done.map((x) => `<div class="row between"><b>${esc(splitName(x.split) || x.titulo)}</b><span class="mut sm">${Math.round((x.segundos_real || 0) / 60)} ${t('common.min')}</span></div>`).join('');
  else if (sk) detail = `<div class="row between"><b>${t('cal.missed')}</b><span class="mut sm">${t('skip.' + sk.reason)}</span></div>`;
  else if (plan[sel]) detail = `<div class="row between"><b>${splitName(plan[sel].split)}</b><span class="mut sm">${plan[sel].extra ? t('week.extra') : t('cal.planned')}</span></div>`;
  const gcal = plan[sel] && !done.length && (!S.account || remindCfg().cal) ? `<a class="link gcal" href="${gcalLink(sel, plan[sel].split)}" target="_blank" rel="noopener">${t('cal.addGoogle')}</a>` : '';
  const canSkip = sel <= today && !done.length && !sk;
  const actions = `<div class="row gap">${canSkip ? `<button class="seg grow" data-a="skipDate" data-v="${sel}">${t('skip.btn')}</button>` : ''}${sk ? `<button class="seg grow" data-a="unskipDate" data-v="${sel}">${t('skip.undo')}</button>` : ''}${sel === today && !done.length ? `<button class="seg grow on" data-a="trainToday">${t('cal.train')}</button>` : ''}</div>`;
  const wk = buildWeek(args);
  return `<main class="pad col stagger">
    <div class="row between">${backBtn()}<b class="caltitle">${t('cal.title')}</b><span class="spacer44"></span></div>
    <div class="row between monthnav"><button class="icon-btn" data-a="calPrev" aria-label="‹">${ICON.back}</button><b class="monthname">${esc(monthTitle)}</b><button class="icon-btn" data-a="calNext" aria-label="›">${ICON.chev}</button></div>
    <div class="calwrap"><div class="calhead">${[0, 1, 2, 3, 4, 5, 6].map((i) => `<span>${dayLetter(i)}</span>`).join('')}</div><div class="calgrid">${cells.join('')}</div></div>
    <div class="card daycard"><div class="label">${esc(fmtDate(sel, { weekday: 'long', day: 'numeric', month: 'long' }))}</div>${detail}${gcal}</div>
    ${actions}
    <div class="row between calfoot"><span class="mut sm">${t('week.summary', { done: wk.doneDays, min: wk.min })}</span><button class="link" data-a="openWeekCfg">${t('week.adjust')}</button></div>
  </main>`;
}

function blockRow(b) {
  if (b.type === 'warmup') return `<div class="row between mini mut"><span>${t('plan.warmup')}</span><span>${b.minutes} ${t('common.min')}</span></div>`;
  if (b.type === 'cooldown') return `<div class="row between mini mut"><span>${t('plan.cooldown')}</span><span>${b.minutes} ${t('common.min')}</span></div>`;
  const ex = BY_CODE.get(b.code);
  const right = b.kind === 'cardio' ? (b.protocol ? `${b.protocol.rounds} × ${b.protocol.workS + b.protocol.easyS}s` : `${Math.round(b.durationS / 60)} ${t('common.min')}`)
    : b.kind === 'timed' ? `${b.sets} × ${b.durationS}s` : `${b.sets} × ${b.repMin}–${b.repMax}`;
  return `<button class="row between item" data-a="demo" data-v="${b.code}" aria-label="${t('demo.watch')}: ${esc(exName(ex))}"><div class="grow left"><b>${esc(exName(ex))}</b></div><span class="mut num-s">${right}</span><span class="playdot">${ICON.play}</span></button>`;
}

function viewPlan() {
  const p = ui.plan;
  const n = p.blocks.filter((b) => b.type === 'exercise').length;
  return `<main class="pad col stagger">
    <div class="row between">${backBtn()}<button class="link" data-a="why">${t('plan.whyBtn')}</button></div>
    <div><div class="kicker">${t('mode.' + p.mode).toUpperCase()}</div><h1 class="hero">${t('splitShort.' + p.split)}</h1>
      <div class="mut sm">${p.minutes} ${t('common.min')} · ${t('plan.exercises', { n })}</div></div>
    ${(p.tired ?? []).length ? `<div class="warn">${t('home.tired', { z: regionShort(p.tired[0].region), h: p.tired[0].hours })}<button class="link tiny" data-a="openSplits">${t('home.change')}</button></div>` : (p.warnings ?? []).slice(0, 1).map((w) => `<div class="warn">${t('warn.' + w.key)}</div>`).join('')}
    ${p.soft ? `<span class="pill">${t('home.softReturn')}</span>` : ''}
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
    <button class="body-wrap" data-a="flipView" aria-label="${view === 'front' ? t('session.back') : t('session.front')}">${bodySVG(view, shown, bodyOpts({ now: new Set(primary) }))}</button>
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
  else if (b.type === 'warmup') body = viewWarmup(a, b, false);
  else if (b.type === 'cooldown') body = viewWarmup(a, b, true);
  else if (b.type === 'exercise' && a.introCode !== b.code) body = viewIntro(b);
  else if (b.kind === 'strength') body = viewStrength(a, b);
  else body = viewTimed(a, b);
  const showBody = b.type === 'exercise' && a.introCode === b.code && !(a.restEnd && Date.now() < a.restEnd);
  return `<main class="pad col stagger">${head}${banner}${body}${showBody ? bodyCard(a, b.code) : ''}</main>`;
}

function demoMedia(code) {
  const img = (i, cls) => `<img ${cls} src="ex/${code}_${i}.jpg" data-rem="${exRemote(code, i)}" onerror="if(this.dataset.rem){this.src=this.dataset.rem;delete this.dataset.rem}" alt="" decoding="async">`;
  return `<div class="vid" aria-hidden="true">${img(0, '')}${img(1, 'class="b"')}</div>`;
}

function viewIntro(b) {
  const ex = BY_CODE.get(b.code);
  const cues = (CUES[moveKey(ex)] ?? CUES.pulse)[lang()].slice(0, 3);
  const meta = b.kind === 'strength' ? `${b.sets} × ${b.repMin}–${b.repMax}` : b.kind === 'cardio' ? `${Math.round(b.durationS / 60)} ${t('common.min')}` : `${b.sets} × ${b.durationS} s`;
  return `<div class="col grow">
    <div><div class="kicker">${meta}</div><h1 class="ex">${esc(exName(ex))}</h1></div>
    ${demoMedia(b.code)}
    <ul class="bullets cues">${cues.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
    <button class="cta" data-a="introDone">${t('demo.ready')}</button>
  </div>`;
}

function warmMoves(a, b, cd) { return cd ? cooldownFor() : warmupFor(a.split || a.plan?.split, b.minutes); }

function viewWarmup(a, b, cd) {
  const list = warmMoves(a, b, cd);
  const i = Math.min(a.warmIdx || 0, list.length - 1);
  const w = list[i];
  if (!a.warmT0) a.warmT0 = Date.now();
  const left = Math.max(0, w.secs - Math.floor((Date.now() - a.warmT0) / 1000));
  const img = (n, cls) => `<img ${cls} src="ex/w_${w.key}_${n}.jpg" data-rem="${warmupRemote(w, n)}" onerror="if(this.dataset.rem){this.src=this.dataset.rem;delete this.dataset.rem}" alt="" decoding="async">`;
  const dots = list.map((_, k) => `<i class="${k < i ? 'on' : k === i ? 'cur' : ''}"></i>`).join('');
  const last = i === list.length - 1;
  return `<div class="col grow warm">
    <div><div class="kicker">${b.minutes} ${t('common.min')} · ${t('warm.of', { n: i + 1, total: list.length })}</div><h1 class="ex">${cd ? t('plan.cooldown') : t('plan.warmup')}</h1></div>
    <div class="vid" aria-hidden="true">${img(0, '')}${img(1, 'class="b"')}</div>
    <div class="warm-name">${esc(w[lang()])}</div>
    <p class="mut sm warm-cue">${esc(w.cue[lang()])}</p>
    <div class="warm-t num-s" data-tick="warm">${mmss(left)}</div>
    <div class="warm-dots">${dots}</div>
    <button class="cta" data-a="warmNext">${last ? (cd ? t('session.cooldownDone') : t('warm.last')) : t('warm.next')}</button>
    <button class="link" data-a="${cd ? 'finishSession' : 'nextBlock'}">${cd ? t('warm.skipCd') : t('warm.skip')}</button>
  </div>`;
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
    <div class="row between top"><h1 class="ex">${esc(exName(ex))}</h1><div class="row"><button class="icon-btn" data-a="demo" data-v="${b.code}" aria-label="${t('demo.watch')}">${ICON.play}</button><button class="icon-btn" data-a="evidence" data-v="${(b.why ?? [])[0] ?? 'proximity'}" aria-label="${t('session.evidence')}">${ICON.info}</button></div></div>
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
    <div class="row gap center"><h1 class="ex">${esc(exName(ex))}</h1><button class="icon-btn" data-a="demo" data-v="${b.code}" aria-label="${t('demo.watch')}">${ICON.play}</button></div>
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
  return `<details class="card sess"><summary><div class="row between"><div class="grow"><b>${esc(s.titulo)}</b>
    <div class="mut xs">${esc(String(s.fecha).slice(5, 10))} · ${Math.round((s.segundos_real || 0) / 60)} ${t('common.min')} · ${fmtW(s.volumen_kg || 0)}${s.prs ? ' · 🏆' + s.prs : ''}</div></div>
    <button class="icon-btn trash" data-a="delSession" data-v="${esc(s.id)}" aria-label="${t('history.delete')}">${ICON.trash}</button></div></summary>
    <ul class="list">${det}</ul></details>`;
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
    ${hist.length ? `<div class="row gap histfoot"><button class="link" data-a="exportCsv">${t('history.export')}</button><button class="link bad" data-a="clearHistory">${t('history.clear')}</button></div>` : ''}</main>${nav()}`;
}

// ---------- Perfil ----------
const remindCfg = () => ({ app: false, cal: false, time: '18:00', ...(S.settings.remind ?? {}) });

function viewProfile() {
  const connected = canSync(S);
  const rowSheet = (a, label, extra = '') => `<button class="rowitem" data-a="${a}"><span>${label}</span><span class="row gap">${extra}<span class="chev">${ICON.chev}</span></span></button>`;
  const r = remindCfg();
  return `<main class="pad col stagger compact"><h1>${t('profile.title')}</h1>
    <div class="col list">
      <div class="rowitem"><span>${t('profile.mode')}</span><div class="row gap"><select class="seg selmode" data-a="changeModeSel" aria-label="${t('profile.mode')}">${MODES.map((m) => `<option value="${m}" ${S.settings.mode === m ? 'selected' : ''}>${t('mode.' + m)}</option>`).join('')}</select></div></div>
      <div class="rowitem"><span>${t('profile.sex')}</span><div class="row gap">${['male', 'female'].map((x) => `<button class="seg ${(S.settings.sex ?? 'male') === x ? 'on' : ''}" data-a="setSex" data-v="${x}">${t('sex.' + x)}</button>`).join('')}</div></div>
      <div class="rowitem"><span>${t('profile.unit')}</span>${unitToggle()}</div>
      <div class="rowitem"><span>${t('profile.lang')}</span><div class="row gap">${['es', 'en'].map((l) => `<button class="seg ${lang() === l ? 'on' : ''}" data-a="setLang" data-v="${l}">${l.toUpperCase()}</button>`).join('')}</div></div>
      ${rowSheet('openWeekCfg', t('profile.week'), `<span class="mut sm">${(S.settings.week ?? DEFAULT_WEEK).min}–${(S.settings.week ?? DEFAULT_WEEK).max}</span>`)}
      ${rowSheet('openRemind', t('profile.remind'), `<span class="${r.app || r.cal ? 'dot-ok' : 'dot-off'}"></span>`)}
      ${rowSheet('openEquipSheet', t('profile.equip'))}
      ${S.account ? rowSheet('openAccount', t('profile.account'), `<span class="mut xs acct">${esc(S.account.email)}</span>`) : (centralUrl() && googleClientId() ? rowSheet('toLogin', t('account.signIn')) : '')}
      ${isAdmin() ? rowSheet('openAdmin', t('admin.row'), ui.adminPending > 0 ? `<span class="bubble">${ui.adminPending}</span>` : '') : ''}
      ${S.account ? '' : rowSheet('openSheetsSheet', 'Google Sheets', `<span class="${connected ? 'dot-ok' : 'dot-off'}"></span>`)}
    </div>
    <div class="row gap"><button class="link" data-a="backup">${t('profile.backup')}</button><button class="link bad" data-a="resetAll">${t('profile.reset')}</button></div>
    <p class="mut xs center credit">Anatomía: OpenStax / T. Kebert · CC BY-SA 4.0</p>
  </main>${nav()}`;
}

// ---------- Administración de accesos (solo la ve quien el servidor reconoce como admin) ----------
const isAdmin = () => Boolean(S.account?.admin) && (!S.account.estado || S.account.estado === 'Aprobado');
const ADMIN_TABS = [['Pendiente', 'admin.tabP'], ['Aprobado', 'admin.tabA'], ['Bloqueado', 'admin.tabB']];
const adminState = () => (ui.admin ??= { list: null, tab: 'Pendiente', busy: null, loading: false, anim: true, pick: false });
const adminCount = (st) => (adminState().list ?? []).filter((u) => u.estado === st).length;

async function adminLoad(quiet) {
  if (!isAdmin() || !navigator.onLine) return;
  const a = adminState();
  if (a.loading) return;
  a.loading = true;
  if (!quiet) render();
  try {
    const r = await api(S, 'admin_listar');
    a.list = r.usuarios ?? [];
    ui.adminPending = adminCount('Pendiente');
    if (a.pick) { a.pick = false; a.tab = ui.adminPending > 0 ? 'Pendiente' : adminCount('Aprobado') ? 'Aprobado' : 'Pendiente'; }
    a.anim = true;
  } catch (e) {
    if (!quiet) toast(e.auth === false ? t('account.expired') : t('admin.fail', { m: e.message }));
  } finally {
    a.loading = false; render();
  }
}

function adminHTML() {
  const a = adminState();
  const rows = (a.list ?? []).filter((u) => u.estado === a.tab);
  const anim = a.anim; a.anim = false;
  const sexo = (x) => (x === 'male' || x === 'female' ? t('sex.' + x) : '');
  const modo = (x) => (x === 'muscle' || x === 'hybrid' ? t('mode.' + x) : '');
  const card = (u) => {
    const nombre = [u.nombres, u.apellidos].filter(Boolean).join(' ');
    const fisico = [u.edad != null ? u.edad : '', sexo(u.sexo), u.peso_kg ? u.peso_kg + ' kg' : '', u.talla_cm ? u.talla_cm + ' cm' : ''].filter((x) => x !== '').join(' · ');
    const dis = a.busy ? 'disabled' : '';
    const ok = `<button class="seg on grow" data-a="adminSet" data-e="${esc(u.email)}" data-v="Aprobado" ${dis}>${t('admin.approve')}</button>`;
    const no = `<button class="seg bad grow" data-a="adminSet" data-e="${esc(u.email)}" data-v="Bloqueado" ${dis}>${t('admin.block')}</button>`;
    return `<div class="ucard${anim ? ' in' : ''}${a.busy === u.email ? ' busy' : ''}">
      <div class="row between"><b>${esc(nombre || t('admin.noData'))}</b><span class="mut xs">${u.creado ? t('admin.since', { d: fmtDate(u.creado.slice(0, 10), { day: 'numeric', month: 'short' }) }) : ''}</span></div>
      <div class="mut xs brk">${esc(u.email)}${u.celular ? ' · ' + esc(u.celular) : ''}</div>
      ${fisico || modo(u.modo) ? `<div class="xs">${esc(fisico)}${modo(u.modo) ? (fisico ? ' · ' : '') + '<span class="acc">' + modo(u.modo) + '</span>' : ''}</div>` : ''}
      <div class="row gap">${u.estado === 'Pendiente' ? ok + no : u.estado === 'Aprobado' ? no : ok}</div></div>`;
  };
  return `<div class="row between"><h2>${t('admin.title')}</h2><button class="link" data-a="adminRefresh">${a.loading ? '<span class="spin">⟳</span> ' : ''}${t('admin.refresh')}</button></div>
    <div class="row gap">${ADMIN_TABS.map(([k, key]) => `<button class="seg grow admtab ${a.tab === k ? 'on' : ''}" data-a="adminTab" data-v="${k}">${t(key)} ${adminCount(k)}</button>`).join('')}</div>
    <div class="adminlist col">${a.list == null ? `<p class="mut center">${t('admin.loading')}</p>` : rows.length ? rows.map(card).join('') : `<p class="mut center">${t('admin.empty')}</p>`}</div>`;
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
  } else if (m.type === 'demo') {
    const ex = BY_CODE.get(m.code);
    const cues = (CUES[moveKey(ex)] ?? CUES.pulse)[lang()];
    inner = `<div class="row between"><h2>${esc(exName(ex))}</h2></div>
      ${demoMedia(m.code)}
      <ul class="bullets cues">${cues.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>`;
  } else if (m.type === 'account') {
    inner = `<h2>${t('account.title')}</h2><p class="mut">${esc(S.account?.email ?? '')}</p>
      <button class="seg" data-a="exportAccount">${t('account.export')}</button>
      <button class="seg" data-a="signOut">${t('account.signOut')}</button>
      <button class="link bad" data-a="deleteAccount">${t('account.delete')}</button>`;
  } else if (m.type === 'admin') {
    inner = adminHTML();
  } else if (m.type === 'skip') {
    inner = `<h2>${t('skip.title')}</h2><div class="reasons">${['work', 'tired', 'sick', 'travel', 'other'].map((k) => `<button class="seg" data-a="skipReason" data-v="${k}">${t('skip.' + k)}</button>`).join('')}</div>`;
  } else if (m.type === 'splits') {
    const rank = suggestToday(agendaArgs()).rank;
    inner = `<h2>${t('splits.title')}</h2>${rank.map((r, i) => `<button class="opt ${i === 0 ? 'best' : ''}" data-a="pickSplit" data-v="${r.split}"><div class="row between"><b>${splitName(r.split)}</b><span class="pill ${r.readiness >= 1 ? 'lv-A' : 'lv-B'}">${r.readiness >= 1 ? t('splits.ready') : t('splits.tired')}</span></div>${r.tired.length ? `<div class="mut xs">${esc(regionShort(r.tired[0].region))} · ${r.tired[0].hours} h</div>` : ''}</button>`).join('')}`;
  } else if (m.type === 'weekcfg') {
    inner = `<h2>${t('week.title')}</h2><div class="col">${weekFields()}</div><p class="mut xs">${t('week.note')}</p>`;
  } else if (m.type === 'equipsheet') {
    inner = `<h2>${t('profile.equip')}</h2><div class="row gap wrap">${presetButtons()}</div><div class="col mt">${equipChecks()}</div>`;
  } else if (m.type === 'sheetssheet') {
    inner = `<h2>Google Sheets · ${canSync(S) ? t('profile.connected') : t('profile.notConnected')}</h2><p class="mut xs">${t('profile.connectNote')}</p>
      ${scriptUrl() ? `<label><span class="mut xs">${t('profile.code')}</span><input id="f-code" type="password" autocomplete="off" value="${esc(S.settings.code)}"></label><button class="seg on" data-a="connect">${t('profile.test')}</button>` : `<div class="warn">${t('profile.noUrl')}</div>`}
      ${S.lastSync ? `<div class="mut xs">${t('profile.lastSync', { d: S.lastSync.slice(0, 16).replace('T', ' ') })}</div>` : ''}`;
  } else if (m.type === 'remind') {
    const r = remindCfg();
    inner = `<h2>${t('remind.title')}</h2>
      <label class="check"><span>${t('remind.app')}</span><input type="checkbox" data-a="toggleRemindApp" ${r.app ? 'checked' : ''}></label>
      <p class="mut xs">${t('remind.appNote')}</p>
      <label class="check"><span>${t('remind.cal')}</span><input type="checkbox" data-a="toggleRemindCal" ${r.cal ? 'checked' : ''} ${personalMode(S) || S.account ? "" : "disabled"}></label>
      <p class="mut xs">${personalMode(S) ? t('remind.calNote') : S.account ? t('remind.calAccount') : t('remind.needSheets')}</p>
      <label><span class="mut xs">${t('remind.time')}</span><input id="f-time" type="time" value="${esc(r.time)}" data-a="setRemindTime"></label>
      ${personalMode(S) ? `<button class="seg" data-a="calNow">${t('remind.now')}</button>` : ''}`;
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
  const showClose = ['demo', 'account', 'sub', 'evidence', 'why', 'splits', 'weekcfg', 'equipsheet', 'sheetssheet', 'remind', 'skip', 'admin'].includes(m.type);
  const adm = m.type === 'admin';
  const still = adm && m.shown ? ' still' : '';
  if (adm) m.shown = true;
  return `<div class="overlay${still}" data-a="closeModal"><div class="sheet${adm ? ' adminsheet' : ''}${still}"${adm ? ' data-a="keep"' : ''} role="dialog" aria-modal="true"><i class="grab"></i>${inner}
    ${showClose ? `<button class="link" data-a="closeModal">${m.type === 'sub' ? t('sub.wait') : t('common.close')}</button>` : ''}</div></div>`;
}

// ---------- Render ----------
function render() {
  setLang(S.settings.lang);
  const r = route();
  const views = { login: viewLogin, consent: viewConsent, datos: viewDatos, pending: viewPending, welcome: viewWelcome, sex: viewSex, equip: viewEquip, week: viewWeek, calendar: viewCalendar, plan: viewPlan, session: viewSession, summary: viewSummary };
  let html;
  if (r === 'tabs') html = ui.tab === 'history' ? viewHistory() : ui.tab === 'profile' ? viewProfile() : viewHome();
  else html = views[r]();
  const key = r + (r === 'tabs' ? ui.tab : '') + (r === 'welcome' || r === 'equip' ? '' : '');
  const changed = render.key !== key;
  const deeper = changed && DEEP.has(r) && ui.dir === 'fwd';
  const y = window.scrollY;
  const ly = $app.querySelector('.adminlist')?.scrollTop ?? 0;
  $app.innerHTML = html + modalHTML() + (ui.toast ? `<div class="toast" role="status">${esc(ui.toast)}</div>` : '');
  const main = $app.querySelector('main');
  if (main && $app.querySelector('.nav')) main.classList.add('has-nav');
  if (main && changed) main.classList.add(ui.dir === 'back' ? 'enter-back' : 'enter-fwd');
  else if (main) main.classList.add('still');
  if (changed && deeper) history.pushState({ r }, '');
  if (!changed) window.scrollTo(0, y);
  const al = $app.querySelector('.adminlist');
  if (al && ly) al.scrollTop = ly;
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
  if (r === 'login') setTimeout(mountGoogleButton, 0);
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
  demo(el) {
    const ex = BY_CODE.get(el.dataset.v);
    openModal({ type: 'demo', code: ex.code });
  },
  introDone() { S.active.introCode = S.active.plan.blocks[S.active.idx].code; persist(); render(); },
  guest() { S.settings.guest = true; persist(); render(); },
  toLogin() { S.settings.guest = false; ui.loginMsg = ''; persist(); render(); },
  declineTerms() { signOutLocal(true); },
  async saveDatos() {
    const v = (id) => document.getElementById('d-' + id)?.value.trim() ?? '';
    const datos = { nombres: v('nombres'), apellidos: v('apellidos'), nacimiento: v('nacimiento'), peso_kg: Number(v('peso').replace(',', '.')), talla_cm: Number(v('talla')), celular: v('celular') };
    S.account.datos = datos; // conserva lo escrito si falla
    const err = validarDatos(datos);
    if (err) return toast(t(err));
    try {
      const r = await api(S, 'datos_guardar', { datos });
      S.account.datosOk = true; S.account.datos = r.datos ?? datos; S.account.estado = r.estado ?? S.account.estado;
      persist(); render(); window.scrollTo(0, 0);
      if (!S.account.estado || S.account.estado === 'Aprobado') afterConsent();
    } catch (e) { toast(e.approval === false ? t('datos.fail') : (e.message || t('datos.fail'))); }
  },
  reconnect() { ui.expired = false; render(); ensureToken().then((ok) => { if (ok) refreshAccount(); else { ui.expired = true; render(); toast(t('account.expired')); } }); },
  async refreshAccount() {
    const before = S.account?.estado;
    await refreshAccount();
    if (S.account?.estado === before && route() === 'pending') toast(t('pending.same'));
  },
  async acceptTerms() {
    try {
      await api(S, 'consentir', { version: S.account.terminos ?? '2026-11' });
      S.account.consent = true; persist(); render();
      await afterConsent();
    } catch (e) { toast(t('login.failed')); }
  },
  openAccount() { openModal({ type: 'account' }); },
  keep() {},
  openAdmin() { const a = adminState(); a.pick = true; a.anim = true; openModal({ type: 'admin' }); adminLoad(false); },
  adminTab(el) { const a = adminState(); a.tab = el.dataset.v; a.anim = true; render(); },
  adminRefresh() { adminLoad(false); },
  async adminSet(el) {
    const a = adminState();
    if (a.busy) return;
    const email = el.dataset.e, estado = el.dataset.v;
    a.busy = email; render();
    try {
      const r = await api(S, 'admin_estado', { email, estado });
      const u = (a.list ?? []).find((x) => x.email === r.email);
      if (u) u.estado = r.estado;
      ui.adminPending = adminCount('Pendiente');
      a.busy = null;
      toast(t(r.estado === 'Aprobado' ? 'admin.okA' : 'admin.okB') + ' · ' + (u ? [u.nombres, u.apellidos].filter(Boolean).join(' ') || u.email : r.email));
    } catch (e) {
      a.busy = null;
      toast(e.auth === false ? t('account.expired') : t('admin.fail', { m: e.message }));
    }
  },
  signOut() { ui.modal = null; ask(t('account.signOutAsk'), () => signOutLocal(true)); },
  async exportAccount() {
    try {
      const data = await api(S, 'cuenta_exportar');
      download('formd-mis-datos.json', JSON.stringify(data, null, 2), 'application/json');
    } catch (e) { toast(t('sync.fail', { m: e.message })); }
  },
  deleteAccount() {
    ui.modal = null;
    ask(t('account.deleteAsk'), async () => {
      try {
        await api(S, 'cuenta_borrar');
        signOutLocal(true);
        toast(t('account.deleted'));
      } catch (e) { toast(t('sync.fail', { m: e.message })); }
    });
  },
  confirmEquip() { ui.onbStep = 4; ui.dir = 'fwd'; persist(); render(); },
  finishOnboarding() { S.settings.onboarded = true; S.settings.weekSet = true; persist(); history.replaceState({}, ''); go('tabs', 'home'); touchAgenda(); },
  openCalendar() { ui.calMonth = null; ui.calSel = todayStr(); go('calendar'); },
  calPrev() { const [y, m] = (ui.calMonth ?? todayStr().slice(0, 7)).split('-').map(Number); const d = new Date(y, m - 2, 1); ui.calMonth = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; render(); },
  calNext() { const [y, m] = (ui.calMonth ?? todayStr().slice(0, 7)).split('-').map(Number); const d = new Date(y, m, 1); ui.calMonth = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; render(); },
  calSel(el) { ui.calSel = el.dataset.v; buzz(8); render(); },
  trainToday() { go('tabs', 'home', 'back'); },
  openSplits() { openModal({ type: 'splits' }); },
  pickSplit(el) { ui.splitOverride = el.dataset.v; ui.modal = null; render(); },
  skipToday() { openModal({ type: 'skip', date: todayStr() }); },
  skipDate(el) { openModal({ type: 'skip', date: el.dataset.v }); },
  skipReason(el) {
    const date = ui.modal?.date ?? todayStr();
    S.skips = (S.skips ?? []).filter((x) => x.date !== date);
    S.skips.push({ date, reason: el.dataset.v, ts: Date.now() });
    S.deletedDays = (S.deletedDays ?? []).filter((d) => d !== date);
    ui.modal = null; ui.splitOverride = null; persist(); render(); touchAgenda(); bgSync();
    const next = nextPlannedDay(agendaArgs());
    toast(next ? t('skip.done', { split: splitName(next.split), day: fmtDate(next.date, { weekday: 'long' }) }) : t('skip.none'));
  },
  unskipToday() { A.unskipDate({ dataset: { v: todayStr() } }); },
  unskipDate(el) {
    const date = el.dataset.v;
    S.skips = (S.skips ?? []).filter((x) => x.date !== date);
    if (canSync(S)) S.deletedDays = [...new Set([...(S.deletedDays ?? []), date])];
    persist(); render(); touchAgenda(); bgSync();
  },
  openWeekCfg() { openModal({ type: 'weekcfg' }); },
  openRemind() { openModal({ type: 'remind' }); },
  openEquipSheet() { openModal({ type: 'equipsheet' }); },
  openSheetsSheet() { openModal({ type: 'sheetssheet' }); },
  toggleDay(el) {
    const w = { ...(S.settings.week ?? DEFAULT_WEEK) };
    const i = Number(el.dataset.v);
    const set = new Set(w.days);
    set.has(i) ? set.delete(i) : set.add(i);
    if (set.size === 0) return toast(t('week.atLeast'));
    w.days = [...set].sort();
    w.min = Math.min(w.min, w.days.length); w.max = Math.max(w.min, Math.min(w.max, 7));
    S.settings.week = w; persist(); render(); touchAgenda();
  },
  weekStep(el) {
    const w = { ...(S.settings.week ?? DEFAULT_WEEK) };
    const f = el.dataset.f;
    w[f] = Math.max(1, Math.min(7, w[f] + Number(el.dataset.d)));
    if (f === 'min' && w.min > w.max) w.max = w.min;
    if (f === 'max' && w.max < w.min) w.min = w.max;
    S.settings.week = w; persist(); render(); touchAgenda();
  },
  toggleRemindApp(el) {
    const r = remindCfg();
    if (el.checked) {
      if (!('Notification' in window)) { el.checked = false; return toast(t('remind.denied')); }
      Notification.requestPermission().then((perm) => {
        r.app = perm === 'granted';
        S.settings.remind = r; persist(); render(); touchAgenda();
        if (perm !== 'granted') toast(t('remind.denied'));
      });
    } else { r.app = false; S.settings.remind = r; persist(); render(); touchAgenda(); }
  },
  toggleRemindCal(el) { const r = remindCfg(); r.cal = el.checked; S.settings.remind = r; persist(); render(); touchAgenda(); if (r.cal && personalMode(S)) calNow(true); else if (r.cal) toast(t('remind.calOn')); },
  setRemindTime(el) { const r = remindCfg(); r.time = el.value || '18:00'; S.settings.remind = r; persist(); touchAgenda(); },
  calNow() { calNow(true); },
  clearHistory() {
    ask(t('history.clearAsk'), () => {
      if (canSync(S)) S.deleted = [...new Set([...S.deleted, ...S.history.map((x) => x.id)])];
      S.history = []; S.pending = [];
      persist(); render(); touchAgenda(); bgSync();
      toast(t('history.cleared'));
    });
  },
  tab(el) { setTab(el.dataset.v); },
  minutes(el) { ui.minutes = Number(el.dataset.v); render(); },
  makePlan() {
    const sug = suggestToday(agendaArgs());
    const split = ui.splitOverride ?? sug.split;
    ui.plan = makePlan({ mode: S.settings.mode, minutes: ui.minutes, available: available(), history: S.history, split, soft: needsSoftReturn(S.history, Date.now()) });
    ui.plan.tired = (sug.rank.find((r) => r.split === split)?.tired) ?? [];
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
  warmNext() {
    const a = S.active, b = a.plan.blocks[a.idx];
    const cd = b.type === 'cooldown';
    const n = warmMoves(a, b, cd).length;
    if ((a.warmIdx || 0) + 1 >= n) { a.warmIdx = 0; a.warmT0 = 0; return cd ? finishSession() : advanceBlock(); }
    a.warmIdx = (a.warmIdx || 0) + 1; a.warmT0 = Date.now(); persist(); render();
  },
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
  plus15() { const a = S.active; a.restEnd += 15000; a.restTotal += 15; restTimer(a.restEnd - Date.now()); persist(); render(); },
  skipRest() { S.active.restEnd = null; restTimer(0); persist(); render(); },
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
      persist(); render(); bgSync(); touchAgenda();
    });
  },
  exportCsv() { download('formd-historial.csv', csvFromHistory(S.history), 'text/csv'); },
  backup() { download('formd-copia.json', exportBackup(S), 'application/json'); },
  doSync() { doSync(true); },
  connect() { S.settings.code = document.getElementById('f-code')?.value.trim() ?? ''; persist(); doSync(true); },
  changeModeSel(el) { const m = el.value; if (m === S.settings.mode) return; ask(t('profile.changeModeAsk'), () => { S.settings.mode = m; persist(); render(); }); },
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

// ---------- Aviso de fin de descanso (vibra y avisa aunque la app esté en segundo plano o el reloj reciba la notificación) ----------
let restWorker = null;
function restTimer(ms) {
  try {
    if (!restWorker) {
      const url = URL.createObjectURL(new Blob(["let t;onmessage=(e)=>{clearTimeout(t);if(e.data>0)t=setTimeout(()=>postMessage(1),e.data)}"], { type: 'text/javascript' }));
      restWorker = new Worker(url);
      restWorker.onmessage = () => restFinished();
    }
    restWorker.postMessage(ms);
  } catch { /* sin worker: queda el contador normal */ }
}

function restFinished() {
  const a = S.active;
  if (!a || !a.restEnd || Date.now() < a.restEnd - 400) return;
  a.restEnd = null;
  beep(990, 300); buzz([300, 120, 300, 120, 600]);
  const b = a.plan.blocks[a.idx];
  if (document.hidden && b?.type === 'exercise' && 'Notification' in window && Notification.permission === 'granted') {
    const ex = BY_CODE.get(b.code);
    const body = `${exName(ex)} · ${t('session.set', { n: a.setNo, total: b.sets })}`;
    navigator.serviceWorker?.ready.then((reg) => reg.showNotification(t('rest.done'), { body, icon: 'icon-192.png', tag: 'formd-rest', renotify: true, vibrate: [300, 120, 300, 120, 600] })).catch(() => {});
  }
  persist(); render();
}

// Pide el permiso de avisos una sola vez, en el primer descanso (con un toque del usuario).
function askRestNotif() {
  if (S.settings.restNotifAsked || !('Notification' in window) || Notification.permission !== 'default') return;
  S.settings.restNotifAsked = true; persist();
  try { Notification.requestPermission(); } catch { /* sin permiso */ }
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
  if (a.restEnd) { restTimer(a.restEnd - Date.now()); askRestNotif(); } else restTimer(0);
  persist(); render();
}

function advanceBlock() {
  const a = S.active;
  a.idx += 1; a.warmIdx = 0; a.warmT0 = 0; a.setNo = 1; a.restEnd = null; a.timer = null; a.cardioSecs = 0;
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
  S.active = null; ui.summary = null; ui.plan = null; ui.screen = null; ui.tab = 'history'; ui.splitOverride = null;
  persist(); render(); window.scrollTo(0, 0); bgSync(); touchAgenda();
}

// ---------- Sincronización ----------
async function doSync(show) {
  if (!canSync(S) || ui.syncing) return;
  ui.syncing = true; render();
  try {
    if (!(await ensureToken())) throw Object.assign(new Error('auth'), { auth: false });
    await sync(S);
    persist();
    if (show) toast(t('sync.ok'));
  } catch (e) {
    if (e.auth === false && S.account) { ui.expired = true; toast(t('account.expired')); }
    else if (e.approval === false && S.account) { S.account.estado = e.estado; persist(); render(); }
    else if (e.consent === false) { S.account.consent = false; persist(); render(); }
    else if (e.auth === false) { S.settings.code = ''; persist(); toast(t('sync.badCode')); }
    else toast(navigator.onLine ? t('sync.fail', { m: e.message }) : t('sync.offline'));
  } finally {
    ui.syncing = false; render();
  }
}
const bgSync = () => { if (canSync(S) && navigator.onLine) doSync(false); };

// ---------- Cuenta de Google (servidor central) ----------
function decodeJwt(token) {
  const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

let gisReady = false;
let tokenWaiters = [];
function initGoogle() {
  if (gisReady || !googleClientId() || !centralUrl()) return;
  if (!window.google?.accounts?.id) { setTimeout(initGoogle, 500); return; }
  gisReady = true;
  window.google.accounts.id.initialize({
    client_id: googleClientId(), callback: onCredential, auto_select: true, cancel_on_tap_outside: false, use_fedcm_for_prompt: true,
  });
  if (route() === 'login') mountGoogleButton();
}

function mountGoogleButton() {
  const el = document.getElementById('gsi');
  if (!el || !gisReady) return;
  window.google.accounts.id.renderButton(el, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', width: Math.min(320, el.clientWidth || 320), locale: lang() });
}

function validarDatos(d) {
  if (!d.nombres || !d.apellidos || !d.nacimiento || !d.celular || !d.peso_kg || !d.talla_cm) return 'datos.required';
  const b = new Date(d.nacimiento + 'T00:00:00'), now = new Date();
  if (isNaN(b)) return 'datos.required';
  let age = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) age--;
  if (age < 14 || age > 110) return 'datos.age';
  if (!(d.peso_kg >= 25 && d.peso_kg <= 400)) return 'datos.pesoErr';
  if (!(d.talla_cm >= 100 && d.talla_cm <= 250)) return 'datos.tallaErr';
  if (d.celular.replace(/\D/g, '').length < 7) return 'datos.celularErr';
  return null;
}

// Pregunta al servidor el estado de la cuenta (aprobación) y si ya dejó sus datos.
async function refreshAccount() {
  if (!accountMode(S) || !S.account.consent) return;
  try {
    const r = await api(S, 'entrar');
    S.account.estado = r.estado; S.account.datosOk = Boolean(r.datos_completos); S.account.datos = r.datos ?? S.account.datos;
    S.account.admin = Boolean(r.admin);
    applyServerProfile(r.perfil);
    persist(); render();
    if (isAdmin()) adminLoad(true);
    if (S.account.datosOk && (!S.account.estado || S.account.estado === 'Aprobado')) doSync(false);
  } catch (e) {
    if (e.auth === false) return;
    toast(navigator.onLine ? t('login.failed') : t('login.offline'));
  }
}

async function onCredential(resp) {
  try {
    const p = decodeJwt(resp.credential);
    const email = String(p.email).toLowerCase();
    // Si entra otra cuenta en este mismo celular, no se mezclan datos.
    if (S.lastEmail && S.lastEmail !== email) wipeLocalData();
    S.account = { email, name: p.name ?? '', token: resp.credential, exp: p.exp, consent: S.account?.email === email ? S.account.consent : false, terminos: S.account?.terminos };
    S.lastEmail = email; ui.loginMsg = ''; ui.expired = false;
    for (const w of tokenWaiters.splice(0)) w(true);
    persist();
    if (S.account.consent && S.account.exp) { render(); await refreshAccount(); return; }
    const r = await api({ ...S, account: { ...S.account, consent: true } }, 'entrar');
    S.account.consent = Boolean(r.consentimiento); S.account.terminos = r.terminos;
    S.account.estado = r.estado; S.account.datosOk = Boolean(r.datos_completos); S.account.datos = r.datos;
    S.account.admin = Boolean(r.admin);
    applyServerProfile(r.perfil);
    persist(); render(); window.scrollTo(0, 0);
    if (S.account.consent && S.account.datosOk && (!S.account.estado || S.account.estado === 'Aprobado')) afterConsent();
  } catch (e) {
    ui.loginMsg = navigator.onLine ? t('login.failed') : t('login.offline'); render();
  }
}

function applyServerProfile(p) {
  if (!p || !p.modo) return;
  S.settings.mode = p.modo; S.settings.sex = p.sexo ?? S.settings.sex; S.settings.unit = p.unidad ?? S.settings.unit;
  if (p.idioma) { S.settings.lang = p.idioma; setLang(p.idioma); }
  if (p.semana) S.settings.week = p.semana;
  if (p.avisos) S.settings.remind = { ...remindCfg(), app: Boolean(p.avisos.app), cal: Boolean(p.avisos.cal), time: p.avisos.hora ?? remindCfg().time };
  S.settings.onboarded = true; S.settings.weekSet = true; ui.onbStep = 4;
}

async function afterConsent() {
  // Sube el perfil elegido en este celular (si es una cuenta nueva) y trae el historial.
  try { await doSync(false); } catch { /* se reintenta luego */ }
  touchAgenda();
}

// Renueva el token en silencio (dura 1 hora). Si no se puede, se pide entrar de nuevo.
async function ensureToken() {
  if (!accountMode(S)) return true;
  if (S.account.token && S.account.exp * 1000 > Date.now() + 120000) return true;
  for (let i = 0; i < 20 && !gisReady; i++) await new Promise((r) => setTimeout(r, 250)); // espera a que cargue Google
  if (!gisReady) { ui.expired = true; return false; }
  const ok = new Promise((res) => { tokenWaiters.push(res); setTimeout(() => res(false), 8000); });
  try { window.google.accounts.id.prompt(); } catch { ui.expired = true; return false; }
  const done = await ok;
  if (!done) { ui.expired = true; render(); }
  return done;
}

function wipeLocalData() {
  S.history = []; S.pending = []; S.deleted = []; S.skips = []; S.deletedDays = []; S.active = null;
  ui.plan = null; ui.summary = null; ui.screen = null;
}

function signOutLocal(toLogin) {
  const keep = { lang: S.settings.lang, unit: S.settings.unit };
  try { window.google?.accounts?.id?.disableAutoSelect(); } catch { /* sin GIS */ }
  wipeLocalData();
  S.account = null; S.lastEmail = null;
  S.settings = { ...load().settings, ...keep, guest: false };
  S.settings.mode = null; S.settings.onboarded = false; ui.onbStep = 1; ui.modal = null;
  persist(); render();
  if (toLogin) setTimeout(mountGoogleButton, 100);
}

// ---------- Avisos y Google Calendar ----------
const swPlan = () => {
  const plan = planRange({ ...agendaArgs(), from: todayStr(), n: 7 });
  return Object.fromEntries(Object.entries(plan).filter(([, v]) => !v.extra).map(([d, v]) => [d, splitName(v.split)]));
};

async function writeSwCfg() {
  try {
    const r = remindCfg();
    const cfg = { app: r.app, time: r.time, plan: swPlan(), done: S.history.map((x) => String(x.fecha).slice(0, 10)), skips: (S.skips ?? []).map((x) => x.date), lang: lang() };
    const c = await caches.open('formd-cfg');
    await c.put('cfg.json', new Response(JSON.stringify(cfg), { headers: { 'content-type': 'application/json' } }));
    const reg = await navigator.serviceWorker?.ready;
    if (r.app && reg?.periodicSync) await reg.periodicSync.register('formd-reminder', { minInterval: 3600 * 1000 }).catch(() => {});
  } catch { /* sin caché o sin service worker */ }
}

// Aviso cuando la app está abierta (el aviso en segundo plano lo intenta el service worker, sin garantía).
async function maybeNotify() {
  const r = remindCfg();
  if (!r.app || !('Notification' in window) || Notification.permission !== 'granted') return;
  const today = todayStr();
  const now = new Date();
  const [h, m] = r.time.split(':').map(Number);
  if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return;
  const plan = swPlan();
  if (!plan[today] || S.history.some((x) => String(x.fecha).startsWith(today)) || (S.skips ?? []).some((x) => x.date === today)) return;
  try { if (localStorage.getItem('formd.notified') === today) return; localStorage.setItem('formd.notified', today); } catch { /* sin almacenamiento */ }
  const reg = await navigator.serviceWorker?.ready;
  const body = t('remind.body', { split: plan[today] });
  if (reg?.showNotification) reg.showNotification('FORMD', { body, icon: 'icon-192.png', tag: 'formd-today' });
  else new Notification('FORMD', { body });
}

let calTimer;
async function calNow(show) {
  const r = remindCfg();
  if (!personalMode(S)) { if (show) toast(t('remind.needSheets')); return; }
  try {
    const eventos = calendarEvents({ ...agendaArgs(), time: r.time, minutes: ui.minutes || 45, title: (sp) => DICT[S.settings.lang]['splitShort.' + sp] });
    const today = todayStr();
    await api(S, 'cal_sync', { eventos, desde: today, hasta: addDays(today, 6) });
    if (show) toast(t('remind.sent'));
  } catch (e) {
    if (show) toast(t('sync.fail', { m: e.message }));
  }
}

// Cada cambio en la agenda actualiza el aviso de la app y el calendario (con una pequeña espera).
function touchAgenda() {
  clearTimeout(calTimer);
  calTimer = setTimeout(() => {
    writeSwCfg();
    maybeNotify();
    if (remindCfg().cal && personalMode(S)) calNow(false);
  }, 1500);
}
setInterval(maybeNotify, 60000);

// ---------- Eventos ----------
// Respuesta al tocar (no al soltar): vibración suave inmediata en cualquier botón.
$app.addEventListener('pointerdown', (e) => { if (e.target.closest('button,[data-a]')) buzz(8); }, { passive: true });
$app.addEventListener('change', (e) => { const el = e.target.closest?.('select[data-a]'); if (el && A[el.dataset.a]) A[el.dataset.a](el); });
$app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-a]');
  if (!el || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'time'))) return;
  if (el.dataset.v !== undefined) ui.popKey = `${el.dataset.a}|${el.dataset.v}`;
  A[el.dataset.a]?.(el, e);
});
$app.addEventListener('change', (e) => {
  const el = e.target.closest('[data-a]');
  if (el && (el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'time')) A[el.dataset.a]?.(el, e);
});

// Reloj: actualiza cronómetros sin volver a dibujar toda la pantalla.
setInterval(() => {
  const a = S.active;
  if (!a || route() !== 'session') return;
  const el = $app.querySelector('[data-tick="elapsed"]');
  if (el) el.textContent = mmss(elapsedS(a));
  const wt = $app.querySelector('[data-tick="warm"]');
  if (wt && a.warmT0) {
    const b = a.plan.blocks[a.idx];
    const w = warmMoves(a, b, b.type === 'cooldown')[Math.min(a.warmIdx || 0, 9)];
    const l = w ? Math.max(0, w.secs - Math.floor((Date.now() - a.warmT0) / 1000)) : 0;
    if (wt.textContent !== mmss(l)) { wt.textContent = mmss(l); if (l === 0) { beep(880, 200); buzz(150); } }
  }
  if (a.restEnd) {
    const left = Math.ceil((a.restEnd - Date.now()) / 1000);
    if (left <= 0) { restFinished(); return; }
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

// Animación de marca: solo la primera vez que se abre la app.
function splashOnce() {
  try { if (sessionStorage.getItem('formd.splash') === '1') return; sessionStorage.setItem('formd.splash', '1'); } catch { /* sin almacenamiento */ }
  const el = document.createElement('div');
  el.className = 'splash';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<div class="splash-word">' + [...'FORMD'].map((c, i) => `<i data-c="${c}" style="--i:${i}"${c === 'D' ? ' class="ac"' : ''}></i>`).join('') + '</div><div class="splash-line"></div>';
  document.body.append(el);
  setTimeout(() => el.classList.add('out'), reduced() ? 600 : 2600);
  setTimeout(() => el.remove(), reduced() ? 900 : 3400);
}

render();
splashOnce();
bgSync();
loadBody().then((ok) => ok && render());
touchAgenda();
initGoogle();
if (accountMode(S) && S.account.consent && navigator.onLine) {
  // Al abrir la app: renueva la sesión sin pedir nada (si Google ya la conoce) y trae estado, datos y rol de administrador.
  (async () => { if (await ensureToken()) refreshAccount(); })();
} else if (isAdmin()) adminLoad(true);
