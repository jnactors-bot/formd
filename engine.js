// Motor de FORMD: planificador por tiempo, sustitución por zonas, carga híbrida, relleno del cuerpo.
// Sin DOM ni red: se prueba en Node (web/test/engine.test.mjs).
import { CATALOG } from './catalog.js';

export const TIMES = [15, 30, 45, 60, 90];
export const BY_CODE = new Map(CATALOG.exercises.map((e) => [e.code, e]));
export const REGION_BY_CODE = new Map(CATALOG.regions.map((r) => [r.code, r]));

// ---------- Equipamiento ----------
export const EQUIPMENT_PRESETS = {
  gym: CATALOG.equipment.map((e) => e.code),
  dumbbells: ['dumbbell', 'bodyweight', 'kettlebell'],
  bodyweight: ['bodyweight'],
};

// ---------- Constantes de tiempo (segundos) ----------
const WORK_S = 40; // tiempo bajo tensión + preparación de una serie
const TRANSITION_S = 60; // cambiar de máquina / ajustar peso

// ---------- Plantillas de sesión ----------
// Cada slot lista ejercicios por orden de preferencia; gana el primero con equipo disponible.
const SLOTS = {
  push: [
    { role: 'compound', pick: ['bench_press_barbell', 'db_bench_press', 'smith_bench_press', 'machine_chest_press', 'pushup'] },
    { role: 'compound', pick: ['incline_db_press', 'incline_bench_barbell', 'cable_fly_low_to_high', 'chest_dips'] },
    { role: 'compound', pick: ['db_shoulder_press', 'overhead_press_barbell', 'machine_shoulder_press'] },
    { role: 'accessory', pick: ['lateral_raise_db', 'cable_lateral_raise'] },
    { role: 'accessory', pick: ['overhead_triceps_ext_cable', 'triceps_pushdown_cable', 'skullcrusher_ez', 'bench_dips'] },
    { role: 'accessory', pick: ['cable_fly_high_to_low', 'pec_deck', 'chest_dips'] },
  ],
  pull: [
    { role: 'compound', pick: ['pullup', 'lat_pulldown_wide', 'chinup', 'lat_pulldown_neutral'] },
    { role: 'compound', pick: ['barbell_row', 'seated_cable_row', 'chest_supported_row', 'tbar_row', 'db_row_one_arm'] },
    { role: 'compound', pick: ['db_row_one_arm', 'chest_supported_row', 'lat_pulldown_neutral', 'straight_arm_pulldown'] },
    { role: 'accessory', pick: ['face_pull', 'rear_delt_fly_db'] },
    { role: 'accessory', pick: ['incline_db_curl', 'barbell_curl', 'db_curl_alternating', 'cable_curl'] },
    { role: 'accessory', pick: ['hammer_curl', 'preacher_curl', 'db_shrug'] },
  ],
  legs: [
    { role: 'compound', pick: ['back_squat', 'smith_squat', 'leg_press', 'goblet_squat', 'hack_squat'] },
    { role: 'compound', pick: ['romanian_deadlift', 'hip_thrust_barbell', 'back_extension', 'glute_bridge'] },
    { role: 'compound', pick: ['leg_press', 'bulgarian_split_squat', 'walking_lunge_db', 'step_up_db', 'hack_squat'] },
    { role: 'accessory', pick: ['lying_leg_curl', 'seated_leg_curl'] },
    { role: 'accessory', pick: ['leg_extension'] },
    { role: 'accessory', pick: ['standing_calf_raise', 'seated_calf_raise'] },
    { role: 'accessory', pick: ['cable_crunch', 'hanging_leg_raise', 'dead_bug', 'russian_twist'] },
  ],
  // Híbrido: sesiones de fuerza más cortas y generales.
  upper: [
    { role: 'compound', pick: ['bench_press_barbell', 'db_bench_press', 'machine_chest_press', 'pushup'] },
    { role: 'compound', pick: ['pullup', 'lat_pulldown_wide', 'db_row_one_arm', 'barbell_row'] },
    { role: 'compound', pick: ['db_shoulder_press', 'overhead_press_barbell', 'machine_shoulder_press'] },
    { role: 'compound', pick: ['seated_cable_row', 'db_row_one_arm', 'chest_supported_row'] },
    { role: 'accessory', pick: ['triceps_pushdown_cable', 'bench_dips'] },
    { role: 'accessory', pick: ['db_curl_alternating', 'cable_curl', 'barbell_curl'] },
  ],
  lower: [
    { role: 'compound', pick: ['back_squat', 'goblet_squat', 'leg_press', 'smith_squat'] },
    { role: 'compound', pick: ['romanian_deadlift', 'hip_thrust_barbell', 'glute_bridge'] },
    { role: 'compound', pick: ['bulgarian_split_squat', 'walking_lunge_db', 'step_up_db'] },
    { role: 'accessory', pick: ['lying_leg_curl', 'seated_leg_curl'] },
    { role: 'accessory', pick: ['standing_calf_raise', 'seated_calf_raise'] },
    { role: 'accessory', pick: ['plank', 'dead_bug', 'cable_crunch'] },
  ],
};

const CARDIO_EASY = ['treadmill_run_easy', 'bike_steady', 'rower_steady', 'outdoor_run', 'incline_walk'];
const CARDIO_HARD = ['treadmill_intervals', 'bike_hiit', 'rower_intervals', 'jump_rope'];

export const MUSCLE_ROTATION = ['push', 'pull', 'legs'];
export const HYBRID_ROTATION = ['upper', 'cardio_easy', 'lower', 'cardio_interval'];
const HARD = new Set(['lower', 'cardio_interval', 'legs']);

// ---------- Evidencia ----------
// Las citas se completan al curar cada ficha; hasta entonces la app muestra "cita por verificar".
export const EVIDENCE = {
  proximity: { level: 'A', es: 'Terminar cada serie con 1–3 repeticiones en reserva da una hipertrofia similar a llegar al fallo, con menos fatiga.', en: 'Finishing sets with 1–3 reps in reserve gives similar hypertrophy to training to failure, with less fatigue.' },
  rest: { level: 'B', es: 'En ejercicios pesados conviene descansar 2 min o más; en aislamiento, 60–90 s. Si falta tiempo se acortan los descansos antes que quitar series.', en: 'For heavy lifts rest 2+ min; for isolation, 60–90 s. When time is short, rests are shortened before sets are removed.' },
  reps: { level: 'A', es: 'Entre 5 y 30 repeticiones sirven para hipertrofia si el esfuerzo es cercano al fallo.', en: 'Anywhere from 5 to 30 reps works for hypertrophy if effort is close to failure.' },
  order: { level: 'B', es: 'Los ejercicios que más te importan van primero, cuando tienes más energía.', en: 'The lifts that matter most go first, while you have the most energy.' },
  frequency: { level: 'A', es: 'Entrenar cada grupo muscular al menos 2 veces por semana rinde mejor que 1 vez con el mismo volumen total.', en: 'Training each muscle group at least twice a week beats once a week at equal total volume.' },
  zones: { level: 'C', es: 'Variar ángulos (plano e inclinado) cubre distintas zonas del pecho. Los estudios EMG son pequeños y no coinciden del todo.', en: 'Varying angles (flat and incline) covers different chest zones. EMG studies are small and not fully consistent.' },
  interference: { level: 'B', es: 'Separar fuerza y carrera intensa por 6 h o más (idealmente otro día) reduce el efecto de interferencia.', en: 'Separating strength and hard running by 6+ h (ideally another day) reduces the interference effect.' },
  recovery: { level: 'B', es: 'Dos sesiones duras seguidas limitan la recuperación; alterna duro y suave.', en: 'Back-to-back hard sessions limit recovery; alternate hard and easy days.' },
};

export const EVIDENCE_TITLE = {
  proximity: { es: 'Cercanía al fallo', en: 'Proximity to failure' },
  rest: { es: 'Descanso', en: 'Rest' },
  reps: { es: 'Rango de reps', en: 'Rep range' },
  order: { es: 'Orden', en: 'Order' },
  frequency: { es: 'Frecuencia', en: 'Frequency' },
  zones: { es: 'Zonas del pecho', en: 'Chest zones' },
  interference: { es: 'Interferencia', en: 'Interference' },
  recovery: { es: 'Recuperación', en: 'Recovery' },
};

export const FACTS =['proximity', 'rest', 'reps', 'order', 'frequency', 'zones', 'interference', 'recovery'];

// ---------- Utilidades ----------
export function e1rm(weightKg, reps) {
  return weightKg > 0 ? weightKg * (1 + reps / 30) : reps;
}

export function setsOfExercise(history, code) {
  const out = [];
  for (const s of history) for (const x of s.series ?? []) if (x.ejercicio_code === code) out.push({ ...x, fecha: s.fecha });
  return out;
}

export function lastPerformance(history, code) {
  // Última sesión que incluyó el ejercicio: devuelve su mejor serie.
  const sorted = [...history].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  for (const s of sorted) {
    const mine = (s.series ?? []).filter((x) => x.ejercicio_code === code && x.reps > 0);
    if (mine.length) return mine.reduce((best, x) => (e1rm(x.peso_kg, x.reps) > e1rm(best.peso_kg, best.reps) ? x : best));
  }
  return null;
}

export function bestScore(history, code) {
  let best = 0;
  for (const x of setsOfExercise(history, code)) best = Math.max(best, e1rm(x.peso_kg, x.reps));
  return best;
}

export function isPR(history, code, weightKg, reps) {
  const best = bestScore(history, code);
  return best > 0 && e1rm(weightKg, reps) > best + 1e-9;
}

function pickExercise(slot, available, used, mode) {
  for (const code of slot.pick) {
    const ex = BY_CODE.get(code);
    if (!ex || used.has(code)) continue;
    if (!available.has(ex.equipment)) continue;
    if (!ex.modes.includes(mode)) continue;
    return ex;
  }
  return null;
}

function exerciseSeconds(sets, restS, kind, durationS) {
  if (kind !== 'strength') return durationS ?? 300;
  return sets * WORK_S + Math.max(0, sets - 1) * restS + TRANSITION_S;
}

export function warmupMinutes(minutes) {
  return minutes >= 60 ? 6 : minutes >= 45 ? 5 : minutes >= 30 ? 3 : 2;
}
export function cooldownMinutes(minutes) {
  return minutes >= 45 ? 4 : minutes >= 30 ? 3 : 1;
}

// ---------- Elección de sesión del día ----------
export function nextSplit(mode, history) {
  const order = mode === 'hybrid' ? HYBRID_ROTATION : MUSCLE_ROTATION;
  const last = [...history].filter((s) => s.modo === mode && s.split).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))[0];
  if (!last) return order[0];
  const i = order.indexOf(last.split);
  return order[(i + 1) % order.length];
}

export function hoursSince(fecha, now) {
  return (now - new Date(fecha).getTime()) / 36e5;
}

export function hybridWarnings(history, split, now = Date.now()) {
  const warnings = [];
  const week = history.filter((s) => s.modo === 'hybrid' && hoursSince(s.fecha, now) <= 24 * 7);
  const last = [...history].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))[0];
  if (last && HARD.has(last.split) && HARD.has(split) && hoursSince(last.fecha, now) < 24) {
    warnings.push({ key: 'recovery' });
  }
  if (last && last.split !== undefined && hoursSince(last.fecha, now) < 6 && split !== last.split) {
    const strength = ['upper', 'lower'];
    if ((strength.includes(last.split) && !strength.includes(split)) || (!strength.includes(last.split) && strength.includes(split))) {
      warnings.push({ key: 'interference' });
    }
  }
  const hard = week.filter((s) => HARD.has(s.split)).length;
  if (hard >= 3 && HARD.has(split)) warnings.push({ key: 'recovery' });
  return dedupe(warnings);
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((w) => (seen.has(w.key) ? false : seen.add(w.key)));
}

export function weeklyLoad(history, now = Date.now()) {
  const week = history.filter((s) => hoursSince(s.fecha, now) <= 24 * 7);
  let strengthKg = 0;
  let cardioMin = 0;
  let sessions = 0;
  let hard = 0;
  for (const s of week) {
    sessions++;
    strengthKg += s.volumen_kg || 0;
    for (const x of s.series ?? []) {
      const ex = BY_CODE.get(x.ejercicio_code);
      if (ex && ex.kind === 'cardio') cardioMin += (x.duracion_s || 0) / 60;
    }
    if (HARD.has(s.split)) hard++;
  }
  return { sessions, strengthKg: Math.round(strengthKg), cardioMin: Math.round(cardioMin), hard };
}

// ---------- Planificador ----------
export function makePlan({ mode, minutes, available, history = [], split, now = Date.now() }) {
  const avail = available instanceof Set ? available : new Set(available);
  const chosen = split ?? nextSplit(mode, history);
  const warmup = warmupMinutes(minutes);
  const cooldown = cooldownMinutes(minutes);
  const budget = Math.max(60, (minutes - warmup - cooldown) * 60);
  const blocks = [];
  const why = new Set(['proximity']);
  const warnings = mode === 'hybrid' ? hybridWarnings(history, chosen, now) : [];

  blocks.push({ type: 'warmup', minutes: warmup, seconds: warmup * 60 });

  if (chosen === 'cardio_easy' || chosen === 'cardio_interval') {
    const list = chosen === 'cardio_easy' ? CARDIO_EASY : CARDIO_HARD;
    const ex = list.map((c) => BY_CODE.get(c)).find((e) => e && avail.has(e.equipment));
    if (ex) {
      const total = budget;
      const interval = chosen === 'cardio_interval';
      const rounds = interval ? Math.max(3, Math.floor(total / 90)) : 0; // 30 s fuerte + 60 s suave
      blocks.push({
        type: 'exercise', code: ex.code, kind: 'cardio', sets: 1, restS: 0, rir: null,
        durationS: interval ? rounds * 90 : total, protocol: interval ? { workS: 30, easyS: 60, rounds } : null,
        seconds: interval ? rounds * 90 : total, role: 'cardio', why: [interval ? 'recovery' : 'interference'],
      });
      why.add(interval ? 'recovery' : 'interference');
    }
  } else {
    const slots = SLOTS[chosen] ?? SLOTS.push;
    const used = new Set();
    let spent = 0;
    const candidates = [];
    for (const slot of slots) {
      const ex = pickExercise(slot, avail, used, mode);
      if (ex) {
        used.add(ex.code);
        candidates.push({ slot, ex });
      }
    }
    // Primero se intenta con descansos completos; si no cabe, se acortan antes de quitar series.
    const tight = [
      { compound: 120, accessory: 75, maxSets: 4 },
      { compound: 90, accessory: 60, maxSets: 4 },
      { compound: 75, accessory: 45, maxSets: 3 },
      { compound: 60, accessory: 45, maxSets: 3 },
      { compound: 60, accessory: 30, maxSets: 2 },
    ];
    for (const t of tight) {
      const trial = [];
      spent = 0;
      for (const { slot, ex } of candidates) {
        const compound = slot.role === 'compound';
        const rest = compound ? t.compound : t.accessory;
        const sets = Math.min(ex.sets, t.maxSets, compound ? 4 : 3);
        const sec = exerciseSeconds(sets, rest, 'strength');
        if (spent + sec > budget) {
          // intenta con 2 series antes de saltarlo
          const alt = exerciseSeconds(2, rest, 'strength');
          if (spent + alt <= budget && trial.length > 0) {
            trial.push({ ex, slot, sets: 2, rest, sec: alt });
            spent += alt;
          }
          continue;
        }
        trial.push({ ex, slot, sets, rest, sec });
        spent += sec;
      }
      if (trial.length >= Math.min(candidates.length, minutes <= 15 ? 2 : minutes <= 30 ? 3 : 4)) {
        blocks.push(...toBlocks(trial));
        break;
      }
      if (t === tight[tight.length - 1] && trial.length) blocks.push(...toBlocks(trial));
    }
    if (blocks.length === 1 && candidates.length) {
      const { ex, slot } = candidates[0];
      blocks.push(...toBlocks([{ ex, slot, sets: 2, rest: 45, sec: exerciseSeconds(2, 45, 'strength') }]));
    }
    for (const b of blocks) for (const w of b.why ?? []) why.add(w);
    const exs = blocks.filter((b) => b.type === 'exercise');
    if (exs.length) exs[exs.length - 1].droppable = true;
  }

  blocks.push({ type: 'cooldown', minutes: cooldown, seconds: cooldown * 60 });
  const plannedSeconds = blocks.reduce((a, b) => a + (b.seconds || 0), 0);
  return { mode, split: chosen, minutes, plannedSeconds, blocks, why: [...why], warnings };
}

function toBlocks(trial) {
  return trial.map(({ ex, slot, sets, rest, sec }, i) => ({
    type: 'exercise',
    code: ex.code,
    kind: ex.kind,
    sets,
    repMin: ex.repMin,
    repMax: ex.repMax,
    restS: rest,
    rir: slot.role === 'compound' ? 2 : 1,
    durationS: ex.durationS,
    seconds: sec,
    role: slot.role,
    why: slot.role === 'compound' ? ['proximity', 'rest', i === 0 ? 'order' : 'reps'] : ['reps', 'proximity'].concat(ex.weights.chest_clavicular >= 0.7 ? ['zones'] : []),
  }));
}

// ---------- Adaptación en tiempo real ----------
export function adaptiveHint({ plan, completedSets, totalSets, elapsedS }) {
  if (!totalSets) return null;
  const progress = completedSets / totalSets;
  const expected = progress * plan.plannedSeconds;
  if (progress < 0.95 && elapsedS > expected + 300) return 'behind';
  if (progress >= 0.5 && progress < 1 && elapsedS < expected - 480) return 'ahead';
  return null;
}

export function shortenPlan(plan, doneByIndex = {}) {
  // Quita el último ejercicio marcado como descartable que aún no empezó.
  const blocks = plan.blocks.slice();
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    if (b.type === 'exercise' && b.droppable && !doneByIndex[i]) {
      blocks.splice(i, 1);
      const exs = blocks.map((x, j) => [x, j]).filter(([x, j]) => x.type === 'exercise' && !doneByIndex[j]);
      if (exs.length) exs[exs.length - 1][0].droppable = true;
      return { ...plan, blocks };
    }
  }
  return plan;
}

export function shortenRests(plan) {
  return { ...plan, blocks: plan.blocks.map((b) => (b.type === 'exercise' && b.kind === 'strength' ? { ...b, restS: Math.max(30, Math.round(b.restS * 0.75)) } : b)) };
}

export function extraExercise(plan, available, mode) {
  const used = new Set(plan.blocks.filter((b) => b.type === 'exercise').map((b) => b.code));
  const slots = SLOTS[plan.split] ?? [];
  for (const slot of slots.filter((s) => s.role === 'accessory')) {
    const ex = pickExercise(slot, available instanceof Set ? available : new Set(available), used, mode);
    if (ex) return { type: 'exercise', code: ex.code, kind: ex.kind, sets: 2, repMin: ex.repMin, repMax: ex.repMax, restS: 45, rir: 1, durationS: ex.durationS, seconds: exerciseSeconds(2, 45, 'strength'), role: 'accessory', why: ['reps'], extra: true };
  }
  return null;
}

// ---------- Sustitución ----------
export function regionSimilarity(a, b) {
  const keys = new Set([...Object.keys(a.weights), ...Object.keys(b.weights)]);
  let dot = 0, na = 0, nb = 0;
  for (const k of keys) {
    const x = a.weights[k] ?? 0, y = b.weights[k] ?? 0;
    dot += x * y; na += x * x; nb += y * y;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

const PATTERN_FAMILY = {
  horizontal_push: 'push', incline_push: 'push', decline_push: 'push', vertical_push: 'push',
  horizontal_pull: 'pull', vertical_pull: 'pull',
  squat: 'legs', lunge: 'legs', leg_ext: 'legs',
  hinge: 'hinge', hip_extension: 'hinge', leg_curl: 'hinge',
};

function patternScore(a, b) {
  if (a.pattern === b.pattern) return 1;
  const fa = PATTERN_FAMILY[a.pattern], fb = PATTERN_FAMILY[b.pattern];
  return fa && fa === fb ? 0.6 : 0.2;
}

function loadScore(e) {
  if (e.bodyweight) return 0.6;
  return 1;
}

export function suggestSubstitutes({ current, available, blocked = new Set(), doneToday = new Set(), minutesLeft = 30, history = [] }) {
  const cur = typeof current === 'string' ? BY_CODE.get(current) : current;
  const avail = available instanceof Set ? available : new Set(available);
  const pool = CATALOG.exercises.filter((e) =>
    e.code !== cur.code && e.kind === cur.kind &&
    avail.has(e.equipment) && !blocked.has(e.equipment) && !doneToday.has(e.code) &&
    Object.entries(e.weights).some(([r, w]) => w >= 0.7 && (cur.weights[r] ?? 0) > 0));
  const scored = pool.map((e) => {
    const time = minutesLeft >= 10 ? 1 : 0.5;
    const pref = setsOfExercise(history, e.code).length ? 1 : 0;
    const score = 0.45 * regionSimilarity(cur, e) + 0.25 * patternScore(cur, e) + 0.15 * loadScore(e) + 0.1 * time + 0.05 * pref;
    return { exercise: e, score, reason: reasonFor(cur, e) };
  });
  scored.sort((a, b) => b.score - a.score);
  const good = scored.filter((s) => s.score >= 0.6).slice(0, 3);
  return good.length ? good : scored.slice(0, 1).map((s) => ({ ...s, weak: true }));
}

function reasonFor(cur, e) {
  if (e.pattern === cur.pattern) return { es: 'Mismo patrón de movimiento', en: 'Same movement pattern' };
  if (e.bodyweight) return { es: 'Sin equipo; agrega peso si te queda fácil', en: 'No equipment; add load if it feels easy' };
  return { es: 'Trabaja las mismas zonas', en: 'Works the same zones' };
}

export function suggestedWeightKg(cur, sub, lastKg) {
  if (!lastKg) return 0;
  if (sub.bodyweight) return 0;
  const factor = sub.equipment === 'dumbbell' && cur.equipment !== 'dumbbell' ? 0.35
    : sub.equipment === 'smith' ? 0.9
    : sub.equipment === 'barbell' && cur.equipment === 'dumbbell' ? 2.5
    : 1;
  return Math.round(lastKg * factor * 2) / 2;
}

// ---------- Cuerpo por zonas ----------
// Cantidad "planeada" de cada zona en el plan: suma de peso × series.
export function plannedUnits(plan) {
  const units = {};
  for (const b of plan.blocks) {
    if (b.type !== 'exercise') continue;
    const ex = BY_CODE.get(b.code);
    for (const [r, w] of Object.entries(ex.weights)) units[r] = (units[r] ?? 0) + w * b.sets;
  }
  return units;
}

// Meta fija por zona: 3 series efectivas (peso × series) llenan la zona al 100 % en una sesión.
// Así el cuerpo muestra qué zonas quedaron cortas aunque el plan las toque poco.
export const ZONE_TARGET = 3;

export function addSetToFill(fill, plan, code) {
  const ex = BY_CODE.get(code);
  const next = { ...fill };
  for (const [r, w] of Object.entries(ex.weights)) {
    next[r] = Math.min(1, (next[r] ?? 0) + w / ZONE_TARGET);
  }
  return next;
}

export function fillFromSets(plan, sets) {
  let fill = {};
  for (const s of sets) fill = addSetToFill(fill, plan, s.ejercicio_code);
  return fill;
}

// Series efectivas por zona en los últimos días (para el panel "qué falta").
export function regionSetsLastDays(history, days = 7, now = Date.now()) {
  const out = {};
  for (const s of history) {
    if (hoursSince(s.fecha, now) > days * 24) continue;
    for (const x of s.series ?? []) {
      const ex = BY_CODE.get(x.ejercicio_code);
      if (!ex || ex.kind === 'cardio') continue;
      for (const [r, w] of Object.entries(ex.weights)) out[r] = (out[r] ?? 0) + w;
    }
  }
  return out;
}

export function sessionVolumeKg(series) {
  return Math.round(series.reduce((a, x) => a + (x.peso_kg || 0) * (x.reps || 0), 0));
}

export function csvFromHistory(history) {
  const head = ['fecha', 'modo', 'sesion', 'ejercicio', 'serie', 'peso_kg', 'reps', 'rir', 'duracion_s', 'distancia_m', 'pr', 'nota'];
  const esc = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return /[",\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s;
  };
  const rows = [head.join(',')];
  for (const s of history) for (const x of s.series ?? []) {
    rows.push([s.fecha, s.modo, s.titulo, x.ejercicio, x.serie, x.peso_kg, x.reps, x.rir ?? '', x.duracion_s ?? '', x.distancia_m ?? '', x.es_pr ? 1 : 0, x.nota ?? ''].map(esc).join(','));
  }
  return rows.join('\n');
}
