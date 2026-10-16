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
export function makePlan({ mode, minutes, available, history = [], split, now = Date.now(), soft = false }) {
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
  if (soft) {
    // Vuelta suave: una serie menos por ejercicio (mínimo 2) y un poco más de reserva.
    for (const b of blocks) {
      if (b.type === 'exercise' && b.kind === 'strength') {
        b.sets = Math.max(2, b.sets - 1);
        b.rir = (b.rir ?? 1) + 1;
        b.seconds = exerciseSeconds(b.sets, b.restS, 'strength');
      }
    }
  }
  const plannedSeconds = blocks.reduce((a, b) => a + (b.seconds || 0), 0);
  return { mode, split: chosen, minutes, plannedSeconds, blocks, why: [...why], warnings, soft };
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
// Aporte real de una zona: crece con el cuadrado del peso, así las zonas principales (0,9–1)
// dominan y las secundarias (0,3–0,5) casi no se encienden. Evita que "se pinte todo el cuerpo".
export const effect = (w) => w * w;

export function plannedUnits(plan) {
  const units = {};
  for (const b of plan.blocks) {
    if (b.type !== 'exercise') continue;
    const ex = BY_CODE.get(b.code);
    for (const [r, w] of Object.entries(ex.weights)) units[r] = (units[r] ?? 0) + effect(w) * b.sets;
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
    next[r] = Math.min(1, (next[r] ?? 0) + effect(w) / ZONE_TARGET);
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

// =====================================================================================
// Agenda semanal adaptable: la semana es un conjunto de metas (días disponibles, mínimo y máximo),
// no un calendario fijo. Cada día se sugiere la sesión según qué zonas ya descansaron, cuáles van
// cortas esta semana y la rotación. Faltar un día no castiga: la sesión simplemente pasa al siguiente.
// =====================================================================================
const p2 = (n) => String(n).padStart(2, '0');
export const localDate = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
export const dateMs = (str, h = 12) => { const [y, m, d] = str.split('-').map(Number); return new Date(y, m - 1, d, h, 0, 0).getTime(); };
export const dayIdx = (ms) => (new Date(ms).getDay() + 6) % 7; // 0 = lunes … 6 = domingo
export const addDays = (str, n) => localDate(dateMs(str) + n * 864e5);
export const mondayOf = (str) => addDays(str, -dayIdx(dateMs(str)));
const sessionMs = (s) => new Date(s.fecha).getTime();

export const DEFAULT_WEEK = { days: [0, 1, 2, 3, 4], min: 3, max: 4 };
export const REST_HOURS = 48;
const WEEK_TARGET = { muscle: 6, hybrid: 4 };

const regionsCache = new Map();
/** Zonas principales (peso >= 0,7) de un tipo de sesión con el equipo disponible. */
export function splitRegions(split, mode, available) {
  const avail = available instanceof Set ? available : new Set(available);
  const key = `${mode}|${split}|${[...avail].sort().join(',')}`;
  if (regionsCache.has(key)) return regionsCache.get(key);
  const plan = makePlan({ mode, minutes: 60, available: avail, history: [], split, now: 0 });
  const out = new Set();
  for (const b of plan.blocks) {
    if (b.type !== 'exercise') continue;
    for (const [r, w] of Object.entries(BY_CODE.get(b.code).weights)) if (w >= 0.7) out.add(r);
  }
  regionsCache.set(key, out);
  return out;
}

/** Última vez que se trabajó cada zona (peso >= 0,5). */
export function zoneLast(history) {
  const last = new Map();
  for (const s of history) {
    const ms = sessionMs(s);
    for (const x of s.series ?? []) {
      const ex = BY_CODE.get(x.ejercicio_code);
      if (!ex) continue;
      for (const [r, w] of Object.entries(ex.weights)) if (w >= 0.5 && (last.get(r) ?? -Infinity) < ms) last.set(r, ms);
    }
  }
  return last;
}

/** Series efectivas por zona en los últimos 7 días. */
export function weekSets(history, now) {
  const out = {};
  for (const s of history) {
    if ((now - sessionMs(s)) / 36e5 > 24 * 7) continue;
    for (const x of s.series ?? []) {
      const ex = BY_CODE.get(x.ejercicio_code);
      if (!ex || ex.kind === 'cardio') continue;
      for (const [r, w] of Object.entries(ex.weights)) out[r] = (out[r] ?? 0) + effect(w);
    }
  }
  return out;
}

/** Qué tan descansada está la gente para una sesión: 1 = todo listo; <1 = zonas aún cansadas. */
export function readiness(split, mode, history, now, available) {
  if (split === 'cardio_easy') return { score: 1, tired: [] };
  if (split === 'cardio_interval') {
    const last = [...history].filter((s) => HARD.has(s.split)).sort((a, b) => sessionMs(b) - sessionMs(a))[0];
    const h = last ? (now - sessionMs(last)) / 36e5 : Infinity;
    return h < 24 ? { score: 0.4, tired: [{ region: 'cardio_system', hours: Math.round(h) }] } : { score: 1, tired: [] };
  }
  const regs = [...splitRegions(split, mode, available)].filter((r) => r !== 'cardio_system');
  if (!regs.length) return { score: 1, tired: [] };
  const last = zoneLast(history);
  const tired = [];
  let rested = 0;
  for (const r of regs) {
    const h = (now - (last.get(r) ?? -Infinity)) / 36e5;
    if (h >= REST_HOURS) rested++; else tired.push({ region: r, hours: Math.max(0, Math.round(h)) });
  }
  tired.sort((a, b) => a.hours - b.hours);
  return { score: rested / regs.length, tired };
}

export function rotationFor(mode) { return mode === 'hybrid' ? HYBRID_ROTATION : MUSCLE_ROTATION; }

/** Ordena los tipos de sesión de mejor a peor opción para entrenar ahora. */
export function rankSplits({ mode, history, now = Date.now(), available }) {
  const order = rotationFor(mode);
  const next = nextSplit(mode, history);
  const base = order.indexOf(next);
  const sets = weekSets(history, now);
  const target = WEEK_TARGET[mode] ?? 6;
  const lastAny = [...history].sort((a, b) => sessionMs(b) - sessionMs(a))[0];
  const rows = order.map((split, i) => {
    const r = readiness(split, mode, history, now, available);
    const regs = [...splitRegions(split, mode, available)].filter((x) => x !== 'cardio_system');
    const need = regs.length ? regs.reduce((a, x) => a + Math.max(0, 1 - (sets[x] ?? 0) / target), 0) / regs.length : 0.5;
    const dist = (i - base + order.length) % order.length;
    const seq = [1, 0.6, 0.35, 0.2][Math.min(dist, 3)];
    let score = 0.5 * r.score + 0.3 * need + 0.2 * seq;
    if (lastAny && HARD.has(lastAny.split) && HARD.has(split) && (now - sessionMs(lastAny)) / 36e5 < 24) score -= 0.25;
    return { split, score, readiness: r.score, tired: r.tired, need, order: i };
  });
  rows.sort((a, b) => b.score - a.score || a.order - b.order);
  return rows;
}

export function suggestToday(args) {
  const rank = rankSplits(args);
  return { ...rank[0], rank, restAdvised: rank[0].readiness < 0.5 };
}

export function daysSinceLast(history, now) {
  const last = [...history].sort((a, b) => sessionMs(b) - sessionMs(a))[0];
  return last ? Math.floor((now - sessionMs(last)) / 864e5) : Infinity;
}
export const needsSoftReturn = (history, now) => history.length > 0 && daysSinceLast(history, now) >= 6;

function virtualSession(split, mode, available, atMs) {
  const plan = makePlan({ mode, minutes: 45, available, history: [], split, now: atMs });
  const series = [];
  for (const b of plan.blocks) if (b.type === 'exercise') for (let i = 0; i < b.sets; i++) series.push({ ejercicio_code: b.code });
  return { fecha: new Date(atMs).toISOString().slice(0, 16), modo: mode, split, series, virtual: true };
}

/**
 * Proyecta el plan de los próximos `n` días a partir de `from` respetando días disponibles y el máximo
 * por semana (lunes a domingo). Cada día se sugiere según el estado de descanso simulado.
 * Devuelve un mapa fecha → { split, extra }. `done` indica cuántos días ya se entrenaron esa semana.
 */
export function planRange({ mode, history, skips = [], week, now, available, from, n }) {
  const w = week ?? DEFAULT_WEEK;
  const today = localDate(now);
  const start = from ?? today;
  const vhist = [...history];
  const skipSet = new Set(skips.map((s) => s.date));
  const doneDates = new Set(history.map((s) => String(s.fecha).slice(0, 10)));
  const counts = new Map(); // lunes -> días con entrenamiento (reales o planeados)
  const bump = (mon) => counts.set(mon, (counts.get(mon) ?? 0) + 1);
  // días ya entrenados en las semanas implicadas
  for (let i = -7; i < n + 7; i++) {
    const d = addDays(start, i);
    if (doneDates.has(d)) bump(mondayOf(d));
  }
  const out = {};
  for (let i = 0; i < n; i++) {
    const d = addDays(start, i);
    if (d < today) continue;
    if (doneDates.has(d)) continue;
    if (d === today && skipSet.has(d)) continue;
    const mon = mondayOf(d);
    const used = counts.get(mon) ?? 0;
    if (!w.days.includes(dayIdx(dateMs(d)))) continue;
    if (used >= w.max) continue;
    const at = d === today ? now : dateMs(d, 17);
    const top = rankSplits({ mode, history: vhist, now: at, available })[0];
    out[d] = { split: top.split, extra: used + 1 > w.min };
    bump(mon);
    vhist.push(virtualSession(top.split, mode, available, at));
  }
  return out;
}

/**
 * La semana (lunes a domingo) para la barra y el calendario: lo hecho, lo perdido, lo sugerido.
 * Estados: done · missed · today · planned · extra · free (sin plan) · off (día no disponible).
 */
export function buildWeek({ mode, history, skips = [], week, now = Date.now(), available }) {
  const w = week ?? DEFAULT_WEEK;
  const today = localDate(now);
  const mon = mondayOf(today);
  const plan = planRange({ mode, history, skips, week: w, now, available, from: today, n: 14 });
  const byDate = new Map();
  for (const s of history) {
    const d = String(s.fecha).slice(0, 10);
    byDate.set(d, [...(byDate.get(d) ?? []), s]);
  }
  const skipBy = new Map(skips.map((s) => [s.date, s]));
  const days = [];
  let doneDays = 0, plannedDays = 0;
  for (let i = 0; i < 7; i++) {
    const date = addDays(mon, i);
    const done = byDate.get(date) ?? [];
    const sk = skipBy.get(date);
    const avail = w.days.includes(i);
    let state;
    if (done.length) { state = 'done'; doneDays++; }
    else if (sk) state = 'missed';
    else if (plan[date]) { state = date === today ? 'today' : plan[date].extra ? 'extra' : 'planned'; plannedDays++; }
    else if (date < today) state = 'free';
    else state = avail ? 'free' : 'off';
    days.push({ date, idx: i, state, split: plan[date]?.split ?? done[0]?.split ?? null, sessions: done, skip: sk ?? null, avail, isToday: date === today });
  }
  const total = doneDays + days.filter((d) => d.state === 'today' || d.state === 'planned').length;
  const shortfall = Math.max(0, w.min - total);
  const spare = days.filter((d) => d.date >= today && d.state !== 'done' && d.state !== 'missed' && !plan[d.date] && !d.avail).map((d) => d.idx);
  return { days, doneDays, plannedDays, min: w.min, max: w.max, shortfall, spare, today };
}

/** Eventos para el calendario de Google: solo las sesiones sugeridas (no las extra) de los próximos 7 días. */
export function calendarEvents({ mode, history, skips, week, now, available, time = '18:00', minutes = 45, title }) {
  const plan = planRange({ mode, history, skips, week, now, available, from: localDate(now), n: 7 });
  return Object.entries(plan).filter(([, v]) => !v.extra).map(([date, v]) => ({
    clave: `formd-${date}`, fecha: date, hora: time, minutos: minutes, titulo: title ? title(v.split) : v.split, split: v.split,
  }));
}

/** Mensaje de a qué día pasa la sesión cuando hoy no se pudo entrenar. */
export function nextPlannedDay(args) {
  const today = localDate(args.now);
  const plan = planRange({ ...args, from: addDays(today, 1), n: 7 });
  const d = Object.keys(plan).sort()[0];
  return d ? { date: d, split: plan[d].split } : null;
}
