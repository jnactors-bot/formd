// Estado persistente (localStorage) y sincronización con Google Sheets vía Apps Script.
// La app funciona 100 % sin conexión: lo pendiente se envía cuando vuelve la red.
import { EQUIPMENT_PRESETS } from './engine.js';

const KEY = 'formd.v1';

export const defaults = () => ({
  settings: {
    mode: null, // se elige una sola vez; solo se cambia desde Perfil
    sex: null, // 'male' | 'female'; se pregunta al empezar
    unit: 'kg',
    lang: (navigator.language || 'es').toLowerCase().startsWith('en') ? 'en' : 'es',
    equipment: EQUIPMENT_PRESETS.gym,
    restDefault: 90,
    restOverride: null, // null = el descanso que trae el plan; o segundos (estándar de 2 min = 120)
    restAdj: {}, // ajuste acumulado por ejercicio (s, máx ±180)
    onboarded: false,
    weekSet: false,
    week: { days: [0, 1, 2, 3, 4], min: 3, max: 4 }, // metas semanales: días disponibles, mínimo y máximo
    remind: { app: false, cal: false, time: '18:00' },
    code: '',
  },
  history: [],
  active: null,
  pending: [], // ids de sesiones por enviar
  deleted: [], // ids borrados por enviar
  account: null, // { email, name, token, exp, consent } cuando se entra con Google (servidor central)
  lastEmail: null, // para no mezclar datos de dos cuentas en el mismo celular
  skips: [], // días en los que no se pudo entrenar: { date, reason, ts }
  deletedDays: [], // fechas de días perdidos quitados, por enviar
  lastSync: null,
});

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = defaults();
      const saved = JSON.parse(raw);
      return { ...d, ...saved, settings: { ...d.settings, ...(saved.settings ?? {}) } };
    }
  } catch {
    // sin almacenamiento o datos dañados: se parte de cero
  }
  return defaults();
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function exportBackup(state) {
  return JSON.stringify({ app: 'formd', version: 1, history: state.history, settings: { ...state.settings, code: '' } }, null, 2);
}

// ---------- Sincronización ----------
export const scriptUrl = () => (typeof window !== 'undefined' && window.SCRIPT_URL) || '';
export const centralUrl = () => (typeof window !== 'undefined' && window.CENTRAL_URL) || '';
export const googleClientId = () => (typeof window !== 'undefined' && window.GOOGLE_CLIENT_ID) || '';
export const accountMode = (state) => Boolean(state.account?.email && centralUrl());
export const personalMode = (state) => !state.account && Boolean(scriptUrl() && state.settings.code);
// Con cuenta de Google solo se sincroniza si ya aceptó los términos.
export const canSync = (state) => (state.account ? Boolean(state.account.consent && centralUrl() && (!state.account.estado || state.account.estado === 'Aprobado')) : personalMode(state));

export async function api(state, action, extra = {}) {
  const central = accountMode(state);
  // Con sesión propia del servidor (180 días) no se depende de la hora de duración del token de Google.
  if (central && !state.account.sess && (!state.account.token || (state.account.exp && state.account.exp * 1000 < Date.now() + 30000))) throw Object.assign(new Error('auth'), { auth: false });
  // text/plain evita la consulta previa (CORS) que Apps Script no responde.
  const res = await fetch(central ? centralUrl() : scriptUrl(), {
    method: 'POST',
    headers: { 'content-type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(central ? (state.account.sess ? { sess: state.account.sess, action, ...extra } : { idToken: state.account.token, action, ...extra }) : { token: state.settings.code, action, ...extra }),
  });
  const data = await res.json().catch(() => ({}));
  if (data.auth === false) throw Object.assign(new Error('auth'), { auth: false });
  if (data.aprobacion === false) throw Object.assign(new Error('approval'), { approval: false, estado: data.estado });
  if (data.consentimiento === false && action !== 'entrar') throw Object.assign(new Error('consent'), { consent: false });
  if (!res.ok || data.error) throw new Error(data.error || 'Error ' + res.status);
  return data;
}

// Llamadas al servidor central SIN sesión (inicio de sesión con correo + código).
export async function publicCall(action, extra = {}) {
  const res = await fetch(centralUrl(), { method: 'POST', headers: { 'content-type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, ...extra }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || 'Error ' + res.status);
  return data;
}

function toRemote(s) {
  return {
    id: s.id, fecha: s.fecha, modo: s.modo, titulo: s.titulo, minutos_plan: s.minutos_plan,
    segundos_real: s.segundos_real, volumen_kg: s.volumen_kg, prs: s.prs, valoracion: s.valoracion,
    comentario: s.comentario, series: s.series,
  };
}

/** Envía lo pendiente y trae lo que haya en el Sheets. Devuelve un resumen o lanza si falla. */
export async function sync(state) {
  if (!canSync(state)) return { skipped: true };
  let sent = 0;
  for (const id of [...state.deleted]) {
    await api(state, 'sesion_borrar', { id });
    state.deleted = state.deleted.filter((x) => x !== id);
  }
  for (const id of [...state.pending]) {
    const s = state.history.find((h) => h.id === id);
    if (!s) { state.pending = state.pending.filter((x) => x !== id); continue; }
    await api(state, 'sesion_guardar', { sesion: toRemote(s) });
    state.pending = state.pending.filter((x) => x !== id);
    sent++;
  }
  // Días perdidos: se borran los quitados, se envían todos (idempotente) y se mezclan los del Sheets.
  for (const d of [...(state.deletedDays ?? [])]) {
    await api(state, 'dia_borrar', { fecha: d });
    state.deletedDays = state.deletedDays.filter((x) => x !== d);
  }
  await api(state, 'dias_guardar', { dias: (state.skips ?? []).map((x) => ({ fecha: x.date, tipo: 'no_pude', motivo: x.reason })) });
  const haveDay = new Set((state.skips ?? []).map((x) => x.date));
  for (const r of (await api(state, 'dias_listar')).dias) {
    if (!haveDay.has(r.fecha)) (state.skips = state.skips ?? []).push({ date: r.fecha, reason: r.motivo || 'other', ts: 0 });
  }
  const remote = (await api(state, 'historial_listar', { limite: 1000 })).sesiones;
  let added = 0;
  const have = new Set(state.history.map((h) => h.id));
  const gone = new Set(state.deleted);
  for (const r of remote) {
    if (have.has(r.id) || gone.has(r.id)) continue;
    state.history.push({
      id: r.id, fecha: r.fecha, modo: r.modo, titulo: r.titulo, minutos_plan: r.minutos_plan,
      segundos_real: r.segundos_real, volumen_kg: r.volumen_kg, prs: r.prs, valoracion: r.valoracion,
      comentario: r.comentario, series: r.series, split: undefined,
    });
    added++;
  }
  state.history.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  await api(state, 'perfil_guardar', {
    perfil: { modo: state.settings.mode, sexo: state.settings.sex, unidad: state.settings.unit, idioma: state.settings.lang, descanso_s: state.settings.restOverride || state.settings.restDefault, equipo: state.settings.equipment, semana: state.settings.week, avisos: { app: state.settings.remind?.app, cal: state.settings.remind?.cal, hora: state.settings.remind?.time } },
  });
  state.lastSync = new Date().toISOString();
  return { sent, added };
}
