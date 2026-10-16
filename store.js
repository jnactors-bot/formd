// Estado persistente (localStorage) y sincronización con Google Sheets vía Apps Script.
// La app funciona 100 % sin conexión: lo pendiente se envía cuando vuelve la red.
import { EQUIPMENT_PRESETS } from './engine.js';

const KEY = 'formd.v1';

export const defaults = () => ({
  settings: {
    mode: null, // se elige una sola vez; solo se cambia desde Perfil
    unit: 'kg',
    lang: (navigator.language || 'es').toLowerCase().startsWith('en') ? 'en' : 'es',
    equipment: EQUIPMENT_PRESETS.gym,
    restDefault: 90,
    onboarded: false,
    code: '',
  },
  history: [],
  active: null,
  pending: [], // ids de sesiones por enviar
  deleted: [], // ids borrados por enviar
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
export const canSync = (state) => Boolean(scriptUrl() && state.settings.code);

export async function api(state, action, extra = {}) {
  // text/plain evita la consulta previa (CORS) que Apps Script no responde.
  const res = await fetch(scriptUrl(), {
    method: 'POST',
    headers: { 'content-type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token: state.settings.code, action, ...extra }),
  });
  const data = await res.json().catch(() => ({}));
  if (data.auth === false) throw Object.assign(new Error('auth'), { auth: false });
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
    perfil: { modo: state.settings.mode, unidad: state.settings.unit, idioma: state.settings.lang, descanso_s: state.settings.restDefault, equipo: state.settings.equipment },
  });
  state.lastSync = new Date().toISOString();
  return { sent, added };
}
