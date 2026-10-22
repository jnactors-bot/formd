// Motor de FORMD: planificador por tiempo, sustitución por zonas, carga híbrida, relleno del cuerpo.
// Sin DOM ni red: se prueba en Node (web/test/engine.test.mjs).
import { CATALOG } from './catalog.js';

export const TIMES = [15, 30, 45, 60, 90];
export const BY_CODE = new Map(CATALOG.exercises.map((e) => [e.code, e]));
export const REGION_BY_CODE = new Map(CATALOG.regions.map((r) => [r.code, r]));

// ---------- Equipamiento ----------
export const EQUIPMENT_PRESETS = {
  gym: CATALOG.equipment.map((e) => e.code).filter((c) => c !== 'pool'), // la piscina no es de gimnasio: se marca a mano
  dumbbells: ['dumbbell', 'bodyweight', 'kettlebell'],
  bodyweight: ['bodyweight'],
  bands: ['bodyweight', 'bands'], // casa con bandas elásticas
};

// Máquinas específicas (prensa, hack, pantorrilla…). Los guardados antiguos con «machine» se migran en app.js (equipV).
export const MACHINE_FAMILY = new Set(CATALOG.machineFamily ?? []);
/** ¿Hay este equipo? El peso corporal siempre está. */
export const hasEquip = (avail, code) => code === 'bodyweight' || avail.has(code);
const asSet = (a) => (a instanceof Set ? a : new Set(a));

// ---------- Constantes de tiempo (segundos) ----------
const WORK_S = 40; // tiempo bajo tensión + preparación de una serie
const TRANSITION_S = 60; // cambiar de máquina / ajustar peso

// ---------- Plantillas de sesión ----------
// Cada slot lista ejercicios por orden de preferencia; gana el primero con equipo disponible.
// Al final de cada lista hay versiones SIN máquina (peso corporal, mancuernas, bandas) y, si aun así no hay
// nada, pickExercise cae al ejercicio de peso corporal más parecido: nunca queda un hueco.
const L = {
  pressFlat: ['bench_press_barbell', 'db_bench_press', 'smith_bench_press', 'machine_chest_press', 'cable_chest_press', 'floor_press_db', 'kb_floor_press', 'band_chest_press', 'suspension_pushup', 'pushup', 'wide_pushup'],
  pressIncl: ['incline_db_press', 'incline_bench_barbell', 'incline_smith_press', 'incline_machine_press', 'cable_fly_low_to_high', 'incline_db_fly', 'feet_elevated_pushup', 'chest_dips', 'incline_pushup', 'wide_pushup'],
  pressOver: ['db_shoulder_press', 'overhead_press_barbell', 'machine_shoulder_press', 'smith_shoulder_press', 'arnold_press', 'kb_press', 'band_shoulder_press', 'kb_thruster', 'closegrip_pushup', 'feet_elevated_pushup'],
  delts: ['lateral_raise_db', 'cable_lateral_raise', 'seated_lateral_raise', 'band_lateral_raise', 'band_upright_row', 'scaption', 'upright_row_db', 'upright_row_barbell', 'front_raise_db', 'incline_pushup'],
  triceps: ['overhead_triceps_ext_cable', 'triceps_pushdown_cable', 'rope_pushdown', 'skullcrusher_ez', 'ez_triceps_ext', 'db_overhead_ext', 'lying_db_ext', 'machine_triceps_ext', 'dip_machine', 'db_kickback', 'band_overhead_ext', 'band_skullcrusher', 'bench_dips', 'tricep_dips', 'closegrip_pushup', 'body_tricep_press'],
  chestIso: ['cable_fly_high_to_low', 'pec_deck', 'db_fly', 'band_chest_fly', 'chest_dips', 'decline_db_press', 'decline_machine_press', 'med_ball_chest_pass', 'wide_pushup', 'incline_pushup', 'pushup'],
  vPull: ['pullup', 'lat_pulldown_wide', 'chinup', 'lat_pulldown_neutral', 'vbar_pulldown', 'lat_pulldown_underhand', 'band_assisted_pullup', 'wide_pullup', 'neutral_pullup', 'inverted_row', 'suspension_row'],
  hPull: ['barbell_row', 'seated_cable_row', 'chest_supported_row', 'tbar_row', 'db_row_one_arm', 'db_row_two', 'incline_db_row', 'smith_row', 'one_arm_cable_row', 'machine_iso_row', 'kb_row', 'reverse_grip_row', 'suspension_row', 'bodyweight_mid_row', 'inverted_row'],
  pull3: ['db_row_one_arm', 'chest_supported_row', 'lat_pulldown_neutral', 'straight_arm_pulldown', 'one_arm_pulldown', 'rope_straight_arm', 'kb_row', 'db_row_two', 'suspension_row', 'inverted_row', 'scapular_pullup', 'hyperextension_45', 'floor_back_extension'],
  rear: ['face_pull', 'rear_delt_fly_db', 'reverse_pec_deck', 'cable_rear_delt_fly', 'band_pull_apart', 'band_rear_fly', 'band_external_rotation', 'lying_rear_delt', 'floor_back_extension', 'hyperextension_45'],
  biceps: ['incline_db_curl', 'barbell_curl', 'db_curl_alternating', 'cable_curl', 'ez_curl', 'preacher_curl', 'machine_curl', 'concentration_curl', 'spider_curl', 'high_cable_curl', 'chinup', 'band_assisted_pullup'],
  biceps2: ['hammer_curl', 'preacher_curl', 'rope_hammer_curl', 'cross_body_hammer', 'zottman_curl', 'db_shrug', 'barbell_shrug', 'cable_shrug', 'machine_shrug', 'reverse_curl', 'wrist_curl', 'barbell_wrist_curl'],
  squat: ['back_squat', 'smith_squat', 'leg_press', 'goblet_squat', 'hack_squat', 'front_squat', 'db_squat', 'kb_front_squat', 'db_box_squat', 'band_squat', 'bodyweight_squat'],
  hinge: ['romanian_deadlift', 'hip_thrust_barbell', 'db_rdl', 'smith_rdl', 'kb_single_leg_rdl', 'good_morning', 'barbell_glute_bridge', 'cable_pull_through', 'back_extension', 'glute_bridge', 'single_leg_bridge', 'band_glute_bridge'],
  lunge: ['leg_press', 'bulgarian_split_squat', 'walking_lunge_db', 'step_up_db', 'hack_squat', 'db_lunge', 'db_split_squat', 'smith_split_squat', 'barbell_lunge', 'db_rear_lunge', 'bw_walking_lunge', 'bw_step_up', 'jump_squat'],
  curl: ['lying_leg_curl', 'seated_leg_curl', 'standing_leg_curl', 'swiss_leg_curl', 'slider_leg_curl', 'band_leg_curl', 'natural_ghr', 'single_leg_bridge', 'glute_bridge'],
  quadIso: ['leg_extension', 'narrow_hack_squat', 'narrow_leg_press', 'lying_machine_squat', 'db_squat', 'jump_squat', 'bodyweight_squat'],
  calf1: ['standing_calf_raise', 'seated_calf_raise', 'leg_press_calf', 'smith_calf_raise', 'calf_press_machine', 'barbell_calf_raise', 'db_calf_raise', 'single_leg_calf_step', 'bw_calf_raise'],
  calf2: ['seated_calf_raise', 'leg_press_calf', 'calf_press_machine', 'seated_db_calf', 'donkey_calf_raise', 'rocking_calf_raise', 'band_calf_raise', 'db_calf_raise', 'single_leg_calf_step', 'bw_calf_raise', 'ankle_hops'],
  core: ['cable_crunch', 'hanging_leg_raise', 'dead_bug', 'russian_twist', 'machine_crunch', 'reverse_crunch', 'crunch', 'plank'],
  core2: ['plank', 'dead_bug', 'cable_crunch', 'hanging_knee_raise', 'reverse_crunch', 'crunch', 'side_plank'],
};
const SLOTS = {
  push: [
    { role: 'compound', pick: L.pressFlat },
    { role: 'compound', pick: L.pressIncl },
    { role: 'compound', pick: L.pressOver },
    { role: 'accessory', pick: L.delts },
    { role: 'accessory', pick: L.triceps },
    { role: 'accessory', pick: L.chestIso },
  ],
  pull: [
    { role: 'compound', pick: L.vPull },
    { role: 'compound', pick: L.hPull },
    { role: 'compound', pick: L.pull3 },
    { role: 'accessory', pick: L.rear },
    { role: 'accessory', pick: L.biceps },
    { role: 'accessory', pick: L.biceps2 },
  ],
  legs: [
    { role: 'compound', pick: L.squat },
    { role: 'compound', pick: L.hinge },
    { role: 'compound', pick: L.lunge },
    { role: 'accessory', pick: L.curl },
    { role: 'accessory', pick: L.calf1 },
    { role: 'accessory', pick: L.quadIso },
    { role: 'accessory', pick: L.calf2 },
    { role: 'accessory', pick: L.core },
  ],
  // Híbrido: sesiones de fuerza más cortas y generales.
  upper: [
    { role: 'compound', pick: L.pressFlat },
    { role: 'compound', pick: L.vPull },
    { role: 'compound', pick: L.pressOver },
    { role: 'compound', pick: L.hPull },
    { role: 'accessory', pick: L.triceps },
    { role: 'accessory', pick: L.biceps },
  ],
  lower: [
    { role: 'compound', pick: L.squat },
    { role: 'compound', pick: L.hinge },
    { role: 'compound', pick: L.lunge },
    { role: 'accessory', pick: L.curl },
    { role: 'accessory', pick: L.calf1 },
    { role: 'accessory', pick: L.calf2 },
    { role: 'accessory', pick: L.core2 },
  ],
};

// Correr sigue primero. La natación entra solo si el usuario marcó «pool» (si no, se salta); va antes de correr al aire libre
// (que no pide equipo) para que quien SÍ marcó piscina y no tiene cinta caiga en natación y no en la calle.
const CARDIO_EASY = ['treadmill_run_easy', 'bike_steady', 'rower_steady', 'elliptical_steady', 'stair_climber', 'treadmill_walk', 'incline_walk', 'swim_steady', 'outdoor_run'];
const CARDIO_HARD = ['treadmill_intervals', 'bike_hiit', 'rower_intervals', 'elliptical_intervals', 'stair_intervals', 'treadmill_sprints', 'swim_intervals', 'jump_rope', 'mountain_climbers', 'star_jumps', 'high_knees', 'tuck_jumps'];

// Cuatro modos; cada uno se apoya en la rotación y el catálogo de uno base.
export const MODES = ['muscle', 'strength', 'hybrid', 'fatloss'];
export const MODE_BASE = { muscle: 'muscle', strength: 'muscle', hybrid: 'hybrid', fatloss: 'hybrid' };
export const baseMode = (mode) => MODE_BASE[mode] ?? 'muscle';
// Fuerza: pocas repeticiones, descansos largos. Bajar grasa: más repeticiones y descansos cortos, con cardio.
const MODE_TUNE = { strength: { repMin: 3, repMax: 6, rest: [180, 120], maxSets: 5, compoundOnly: true, rir: 2 }, fatloss: { repMin: 10, repMax: 15, rest: [45, 40], maxSets: 3, rir: 2 } };
export const MUSCLE_ROTATION = ['push', 'pull', 'legs'];
// Orden pensado para las piernas: piernas → cardio suave (sin impacto) → HIIT (ya con 48 h de descanso) → superior → piernas.
export const HYBRID_ROTATION = ['upper', 'lower', 'cardio_easy', 'cardio_interval'];
const HARD = new Set(['lower', 'cardio_interval', 'legs']);
// Cardio que carga fuerte las piernas (impacto): cuenta como día de piernas para el descanso.
const LEG_IMPACT = new Set(['treadmill_intervals', 'treadmill_sprints', 'jump_rope', 'tuck_jumps', 'star_jumps', 'high_knees', 'stair_intervals']);
const LOW_IMPACT_HIIT = ['bike_hiit', 'rower_intervals', 'elliptical_intervals', 'swim_intervals'];
const LEG_ZONES = ['quads', 'hamstrings', 'glutes'];

/** Tipo de sesión real. Las registradas a mano ('manual') se deducen de lo que se hizo, para que cuenten en la rotación y el descanso. */
export function effectiveSplit(s, mode) {
  if (s.split && s.split !== 'manual') return s.split;
  let hard = false, easy = false, leg = 0, up = 0;
  for (const x of s.series ?? []) {
    const ex = BY_CODE.get(x.ejercicio_code);
    if (!ex) continue;
    if (ex.kind === 'cardio') { if (CARDIO_HARD.includes(ex.code)) hard = true; else easy = true; continue; }
    for (const [r, w] of Object.entries(ex.weights)) { if (LEG_ZONES.includes(r) || r === 'calves') leg += w; else up += w; }
  }
  if (hard) return 'cardio_interval';
  if (easy && !leg && !up) return 'cardio_easy';
  if (!leg && !up) return null;
  const lower = leg >= up;
  return baseMode(mode ?? s.modo) === 'hybrid' ? (lower ? 'lower' : 'upper') : (lower ? 'legs' : 'push');
}

/** Última vez que las piernas recibieron una carga fuerte (fuerza de piernas o cardio de impacto). */
export function legLastMs(history) {
  let last = -Infinity;
  for (const s of history) {
    const ms = sessionMs(s);
    for (const x of s.series ?? []) {
      const ex = BY_CODE.get(x.ejercicio_code);
      if (!ex) continue;
      const loads = ex.kind === 'cardio' ? LEG_IMPACT.has(ex.code) : LEG_ZONES.some((r) => (ex.weights[r] ?? 0) >= 0.7);
      if (loads && ms > last) last = ms;
    }
  }
  return last;
}
export const legHours = (history, now) => (now - legLastMs(history)) / 36e5;

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
  const avail = asSet(available);
  const base = baseMode(mode);
  for (const code of slot.pick) {
    const ex = BY_CODE.get(code);
    if (!ex || used.has(code)) continue;
    if (!hasEquip(avail, ex.equipment)) continue;
    if (!ex.modes.includes(base)) continue;
    return ex;
  }
  // Respaldo: el ejercicio de peso corporal más parecido al preferido del slot (nunca deja un hueco).
  const ref = BY_CODE.get(slot.pick[0]);
  if (!ref) return null;
  let best = null, bestScore = 0;
  for (const e of CATALOG.exercises) {
    if (used.has(e.code) || e.kind !== ref.kind || !e.bodyweight || !e.modes.includes(base) || !hasEquip(avail, e.equipment)) continue;
    const sc = regionSimilarity(ref, e);
    if (sc > bestScore) { best = e; bestScore = sc; }
  }
  return bestScore >= 0.3 ? best : null;
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
  const order = baseMode(mode) === 'hybrid' ? HYBRID_ROTATION : MUSCLE_ROTATION;
  const done = [...history].filter((s) => s.modo === mode).map((s) => ({ s, sp: effectiveSplit(s, mode) })).filter((x) => x.sp && order.includes(x.sp));
  done.sort((a, b) => String(b.s.fecha).localeCompare(String(a.s.fecha)));
  if (!done.length) return order[0];
  return order[(order.indexOf(done[0].sp) + 1) % order.length];
}

export function hoursSince(fecha, now) {
  return (now - new Date(fecha).getTime()) / 36e5;
}

export function hybridWarnings(history, split, now = Date.now()) {
  const warnings = [];
  const week = history.filter((s) => baseMode(s.modo) === 'hybrid' && hoursSince(s.fecha, now) <= 24 * 7);
  const last = [...history].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))[0];
  const lastSp = last ? effectiveSplit(last) : null;
  if (last && HARD.has(lastSp) && HARD.has(split) && hoursSince(last.fecha, now) < 24) {
    warnings.push({ key: 'recovery' });
  }
  if (last && lastSp && hoursSince(last.fecha, now) < 6 && split !== lastSp) {
    const strength = ['upper', 'lower'];
    if ((strength.includes(lastSp) && !strength.includes(split)) || (!strength.includes(lastSp) && strength.includes(split))) {
      warnings.push({ key: 'interference' });
    }
  }
  const hard = week.filter((s) => HARD.has(effectiveSplit(s))).length;
  if (hard >= 3 && HARD.has(split)) warnings.push({ key: 'recovery' });
  if (split === 'cardio_interval' && legHours(history, now) < 48) warnings.push({ key: 'legs' });
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
    if (HARD.has(effectiveSplit(s))) hard++;
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
  const warnings = baseMode(mode) === 'hybrid' ? hybridWarnings(history, chosen, now) : [];

  blocks.push({ type: 'warmup', minutes: warmup, seconds: warmup * 60 });

  if (chosen === 'cardio_easy' || chosen === 'cardio_interval') {
    const fat = mode === 'fatloss';
    // Bajar de peso: caminata inclinada primero (sostenible y de bajo impacto). Híbrido: carrera suave primero.
    const easy = fat ? ['incline_walk', ...CARDIO_EASY.filter((c) => c !== 'incline_walk')] : CARDIO_EASY;
    const legsTired = legHours(history, now) < 48;
    // Si las piernas aún están cargadas (<48 h), el HIIT va en bici, remo o elíptica (sin impacto) en vez de correr.
    const hard = legsTired ? [...LOW_IMPACT_HIIT, ...CARDIO_HARD.filter((c) => !LOW_IMPACT_HIIT.includes(c))] : CARDIO_HARD;
    const list = chosen === 'cardio_easy' ? easy : hard;
    const ex = list.map((c) => BY_CODE.get(c)).find((e) => e && hasEquip(avail, e.equipment));
    if (ex) {
      const interval = chosen === 'cardio_interval';
      // Híbrido: 60 s fuerte + 90 s suave (base de velocidad). Bajar de peso: 30 s fuerte + 60 s suave (más corto y llevadero).
      const work = fat ? 30 : 60, easyS = fat ? 60 : 90;
      // El HIIT no es largo: como mucho 6 rondas (híbrido) u 8 (bajar de peso), más calentar y enfriar. El cardio suave tope 45 min.
      const maxRounds = fat ? 8 : 6;
      const total = interval ? Math.min(budget, 480 + maxRounds * (work + easyS)) : Math.min(budget, 45 * 60);
      const main = total >= 900 ? total - 480 : total; // calentar 5′ y enfriar 3′ van dentro del tiempo
      const rounds = interval ? Math.min(maxRounds, Math.max(3, Math.floor(main / (work + easyS)))) : 0;
      const dur = interval ? (total >= 900 ? 480 : 0) + rounds * (work + easyS) : total;
      blocks.push({
        type: 'exercise', code: ex.code, kind: 'cardio', sets: 1, restS: 0, rir: null,
        durationS: dur, protocol: interval ? { workS: work, easyS, rounds } : null,
        seconds: dur, role: 'cardio', why: [interval ? 'recovery' : 'interference'],
      });
      // Si sobra tiempo, se completa con otro tipo de ejercicio (core y, con mucho tiempo, brazos/espalda alta) en vez de alargar el cardio.
      let left = budget - dur;
      if (left >= 600) {
        const extra = [{ role: 'accessory', pick: L.core }, { role: 'accessory', pick: L.core2 }];
        if (left >= 1500) extra.push({ role: 'accessory', pick: L.rear }, { role: 'accessory', pick: L.biceps }, { role: 'accessory', pick: L.triceps });
        const usedX = new Set(), trial = [];
        for (const slot of extra) {
          const x = pickExercise(slot, avail, usedX, mode);
          if (!x) continue;
          const sec = exerciseSeconds(3, 45, 'strength');
          if (sec > left) continue;
          usedX.add(x.code); trial.push({ ex: x, slot, sets: 3, rest: 45, sec }); left -= sec;
        }
        if (trial.length) { blocks.push(...toBlocks(trial, MODE_TUNE[mode])); why.add('proximity'); }
      }
      why.add(interval ? 'recovery' : 'interference');
    }
  } else {
    const tune = MODE_TUNE[mode];
    const slots = (SLOTS[chosen] ?? SLOTS.push).filter((sl) => !tune?.compoundOnly || sl.role === 'compound');
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
      ...(tune ? [{ compound: tune.rest[0], accessory: tune.rest[1], maxSets: tune.maxSets }] : []),
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
        const sets = Math.min(tune?.compoundOnly ? 5 : ex.sets, t.maxSets, tune?.compoundOnly ? 5 : compound ? 4 : 3);
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
        blocks.push(...toBlocks(trial, tune));
        break;
      }
      if (t === tight[tight.length - 1] && trial.length) blocks.push(...toBlocks(trial, tune));
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

function toBlocks(trial, tune) {
  return trial.map(({ ex, slot, sets, rest, sec }, i) => ({
    type: 'exercise',
    code: ex.code,
    kind: ex.kind,
    sets,
    repMin: tune ? tune.repMin : ex.repMin,
    repMax: tune ? tune.repMax : ex.repMax,
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

const primaryZones = (e) => Object.entries(e.weights).filter(([, w]) => w >= 0.7).map(([r]) => r);

/**
 * Hasta `limit` (6) alternativas que trabajan la(s) misma(s) zona(s) principal(es), por afinidad de zonas.
 * Primero las que usan equipo que el usuario tiene (el peso corporal siempre cuenta); si faltan, se completan con
 * opciones que necesitan otro equipo, marcadas con `needs` (código del equipo). El equipo `blocked` (máquina ocupada)
 * se excluye por completo. Devuelve [] solo si de verdad no existe ninguna alternativa en el catálogo.
 */
export function suggestSubstitutes({ current, available, blocked = new Set(), doneToday = new Set(), minutesLeft = 30, history = [], limit = 6 }) {
  const cur = typeof current === 'string' ? BY_CODE.get(current) : current;
  const avail = asSet(available);
  const blockedSet = blocked instanceof Set ? blocked : new Set(blocked);
  blockedSet.delete('bodyweight');
  if (cur.kind === 'cardio') return cardioAlternatives({ cur, avail, blockedSet, doneToday, limit: Math.max(limit, 7) });
  const prim = primaryZones(cur);
  const isBlocked = (e) => blockedSet.has(e.equipment) && !(e.equipment === 'machine' && e.pattern !== cur.pattern);
  const compatKind = (e) => e.kind === cur.kind || (cur.kind === 'timed' && e.kind === 'strength') || (cur.kind === 'strength' && e.kind === 'timed' && (e.weights.abs_upper >= 0.7 || e.weights.abs_lower >= 0.7));
  const base = CATALOG.exercises.filter((e) =>
    e.code !== cur.code && compatKind(e) && !isBlocked(e) && !doneToday.has(e.code) &&
    e.modes.some((m) => cur.modes.includes(m)));
  const share = (min) => base.filter((e) => prim.some((r) => (e.weights[r] ?? 0) >= min));
  let pool = share(0.7);
  if (pool.length < 4) pool = share(0.5);
  const time = minutesLeft >= 10 ? 1 : 0.5;
  const scored = pool.map((e) => {
    const ok = hasEquip(avail, e.equipment);
    const pref = setsOfExercise(history, e.code).length ? 1 : 0;
    const score = 0.5 * regionSimilarity(cur, e) + 0.25 * patternScore(cur, e) + 0.1 * loadScore(e) + 0.1 * time + 0.05 * pref;
    return { exercise: e, score, reason: reasonFor(cur, e), needs: ok ? null : e.equipment };
  }).sort((a, b) => b.score - a.score);
  const have = scored.filter((x) => !x.needs && x.score >= 0.45);
  const picked = [];
  const take = (x) => { if (x && picked.length < limit && !picked.includes(x)) picked.push(x); };
  // 1) las 4 mejores con tu equipo; 2) siempre una o dos de peso corporal; 3) el resto con tu equipo; 4) las que necesitan otro equipo.
  have.slice(0, Math.max(1, limit - 2)).forEach(take);
  have.filter((x) => x.exercise.bodyweight).slice(0, 2).forEach(take);
  have.forEach(take);
  if (picked.length < limit) {
    const rest = scored.filter((x) => x.needs && x.score >= 0.45);
    // distintos equipos primero, para que el usuario vea opciones variadas
    const seen = new Set();
    rest.filter((x) => (seen.has(x.needs) ? false : seen.add(x.needs))).forEach(take);
    rest.forEach(take);
  }
  if (!picked.length && scored.length) {
    const weak = scored.filter((x) => !x.needs)[0] ?? scored[0];
    picked.push({ ...weak, weak: true });
  }
  picked.sort((a, b) => (a.needs ? 1 : 0) - (b.needs ? 1 : 0) || b.score - a.score);
  return picked;
}

// Orden de preferencia de las alternativas de cardio (correr primero, luego natación, bici, remo…), por tipo.
const CARDIO_ALT_EASY = ['treadmill_run_easy', 'outdoor_run', 'swim_steady', 'bike_steady', 'rower_steady', 'elliptical_steady', 'stair_climber', 'incline_walk', 'treadmill_walk'];
const CARDIO_ALT_HARD = ['treadmill_intervals', 'swim_intervals', 'bike_hiit', 'rower_intervals', 'elliptical_intervals', 'stair_intervals', 'treadmill_sprints', 'jump_rope', 'mountain_climbers', 'star_jumps', 'high_knees', 'tuck_jumps'];
const NO_IMPACT = new Set(['swim_steady', 'swim_intervals', 'bike_steady', 'bike_hiit', 'rower_steady', 'rower_intervals', 'elliptical_steady', 'elliptical_intervals', 'incline_walk', 'treadmill_walk']);

/** Todas las alternativas de cardio del mismo tipo (suave con suave, intervalos con intervalos), sin filtrar por equipo: las que no tiene llevan `needs`. */
function cardioAlternatives({ cur, avail, blockedSet, doneToday, limit }) {
  const order = cur.pattern === 'cardio_interval' ? CARDIO_ALT_HARD : CARDIO_ALT_EASY;
  const list = order.map((c) => BY_CODE.get(c)).filter((e) => e && e.code !== cur.code && e.pattern === cur.pattern && !blockedSet.has(e.equipment) && !doneToday.has(e.code));
  return list.slice(0, limit).map((e, i) => ({
    exercise: e, score: 1 - i * 0.01,
    reason: NO_IMPACT.has(e.code) ? { es: 'Sin impacto en las piernas', en: 'No leg impact' } : { es: 'Mismo tipo de cardio', en: 'Same kind of cardio' },
    needs: hasEquip(avail, e.equipment) ? null : e.equipment,
  }));
}

/** Sustituye un bloque de ejercicio por otro ejercicio. En cardio mantiene la duración y recalcula el protocolo (intervalos ⇄ suave). */
export function substituteBlock(b, from, to, { lastKg = 0, mode } = {}) {
  if (to.kind === 'cardio' && b.kind === 'cardio') {
    const interval = to.pattern === 'cardio_interval';
    let dur = b.durationS || to.durationS || 1200;
    let protocol = null;
    if (interval) {
      dur = Math.min(dur, 1800);
      const fat = mode === 'fatloss';
      const workS = b.protocol?.workS ?? (fat ? 30 : 60), easyS = b.protocol?.easyS ?? (fat ? 60 : 90);
      const main = dur >= 900 ? dur - 480 : dur;
      protocol = { workS, easyS, rounds: Math.max(2, Math.floor(main / (workS + easyS))) };
    }
    const { suggestKg, repMin, repMax, ...rest } = b;
    return { ...rest, code: to.code, kind: 'cardio', durationS: dur, seconds: dur, protocol, why: [interval ? 'recovery' : 'interference'], fromCode: from.code };
  }
  return { ...b, code: to.code, kind: to.kind, repMin: to.repMin ?? b.repMin, repMax: to.repMax ?? b.repMax, durationS: to.durationS ?? b.durationS, fromCode: from.code, suggestKg: suggestedWeightKg(from, to, lastKg) || undefined };
}

/** Plan nuevo con el bloque i reemplazado; recalcula el tiempo planeado. */
export function replaceBlock(plan, i, block) {
  const blocks = plan.blocks.slice();
  const old = blocks[i];
  blocks[i] = block;
  return { ...plan, blocks, plannedSeconds: (plan.plannedSeconds ?? 0) + (block.seconds || 0) - (old?.seconds || 0) };
}

/** Mueve el ejercicio i una posición (dir −1 sube, +1 baja). No toca calentamiento ni vuelta a la calma. Devuelve una copia. */
export function moveBlock(blocks, i, dir) {
  const out = blocks.slice();
  const d = dir > 0 ? 1 : dir < 0 ? -1 : 0;
  const j = i + d;
  if (!d || !out[i] || !out[j] || out[i].type !== 'exercise' || out[j].type !== 'exercise') return out;
  [out[i], out[j]] = [out[j], out[i]];
  // «droppable» (el que se quita si falta tiempo) siempre es el último ejercicio.
  if (out.some((b) => b.droppable)) {
    const last = out.map((b, k) => (b.type === 'exercise' ? k : -1)).filter((k) => k >= 0).pop();
    for (let k = 0; k < out.length; k++) if (out[k].type === 'exercise' && Boolean(out[k].droppable) !== (k === last)) out[k] = { ...out[k], droppable: k === last };
  }
  return out;
}

function reasonFor(cur, e) {
  if (e.pattern === cur.pattern) return { es: 'Mismo patrón de movimiento', en: 'Same movement pattern' };
  if (e.bodyweight) return { es: 'Sin equipo; agrega peso si te queda fácil', en: 'No equipment; add load if it feels easy' };
  return { es: 'Trabaja las mismas zonas', en: 'Works the same zones' };
}

export function suggestedWeightKg(cur, sub, lastKg) {
  if (!lastKg) return 0;
  if (sub.bodyweight || sub.equipment === 'bands' || sub.equipment === 'suspension' || sub.equipment === 'swiss_ball') return 0;
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
const WEEK_TARGET = { muscle: 6, strength: 4, hybrid: 4, fatloss: 5 };

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
      // El cardio de impacto (HIIT corriendo, saltos) también carga las piernas.
      if (ex.kind === 'cardio' && LEG_IMPACT.has(ex.code)) for (const r of [...LEG_ZONES, 'calves']) if ((last.get(r) ?? -Infinity) < ms) last.set(r, ms);
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
    const last = [...history].filter((s) => HARD.has(effectiveSplit(s))).sort((a, b) => sessionMs(b) - sessionMs(a))[0];
    const h = last ? (now - sessionMs(last)) / 36e5 : Infinity;
    const hl = legHours(history, now);
    if (hl < 48) return { score: 0.35, tired: [{ region: 'quads', hours: Math.max(0, Math.round(hl)) }] };
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

export function rotationFor(mode) { return baseMode(mode) === 'hybrid' ? HYBRID_ROTATION : MUSCLE_ROTATION; }

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
    if (lastAny && HARD.has(effectiveSplit(lastAny)) && HARD.has(split) && (now - sessionMs(lastAny)) / 36e5 < 24) score -= 0.25;
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

// =====================================================================================
// Descanso adaptable: estándar 2 min; el usuario lo sube/baja en pantalla y puede cambiar la base.
// =====================================================================================
export const REST_STANDARD_S = 120;
export const REST_ADJ_MAX = 180;
export const REST_OPTIONS = [60, 90, 120, 150, 180, 240];
export const clampRestAdj = (v) => Math.max(-REST_ADJ_MAX, Math.min(REST_ADJ_MAX, Math.round(v)));

/** Descanso efectivo (s) tras una serie: base (override de Perfil o el del plan) × recorte de sesión + ajuste del ejercicio. */
export function effectiveRest(block, settings = {}, mul = 1, code = block.code) {
  const ov = Number(settings.restOverride);
  const useOv = block.kind === 'strength' && ov > 0;
  const base = useOv ? ov * mul : (block.restS ?? 60);
  const adj = clampRestAdj(settings.restAdj?.[code] ?? 0);
  return Math.max(15, Math.min(900, Math.round(base + adj)));
}

/** Suma `delta` al ajuste de un ejercicio y devuelve un restAdj nuevo (0 = sin ajuste, se elimina). */
export function bumpRestAdj(restAdj = {}, code, delta) {
  const next = { ...restAdj };
  const v = clampRestAdj((next[code] ?? 0) + delta);
  if (v === 0) delete next[code]; else next[code] = v;
  return next;
}

/** Segundos del plan con los descansos reales (para el aviso «vas atrasado/adelantado»). */
export function plannedSecondsWith(plan, settings = {}, mul = 1) {
  let extra = 0;
  for (const b of plan.blocks) {
    if (b.type !== 'exercise' || b.kind !== 'strength') continue;
    extra += (effectiveRest(b, settings, mul) - b.restS) * Math.max(0, b.sets - 1);
  }
  return Math.max(0, plan.plannedSeconds + extra);
}

// =====================================================================================
// Progreso: agregados por día, periodo, grupo muscular y ejercicio (todo puro).
// =====================================================================================
const dayOf = (s) => String(s.fecha).slice(0, 10);

/** Series efectivas por zona de un día concreto (YYYY-MM-DD). */
export function regionSetsByDay(history, dateStr) {
  const out = {};
  for (const s of history) {
    if (dayOf(s) !== dateStr) continue;
    for (const x of s.series ?? []) {
      const ex = BY_CODE.get(x.ejercicio_code);
      if (!ex || ex.kind === 'cardio') continue;
      for (const [r, w] of Object.entries(ex.weights)) out[r] = (out[r] ?? 0) + w;
    }
  }
  return out;
}

const sessionReps = (s) => (s.series ?? []).reduce((a, x) => a + (x.reps || 0), 0);
const sessionVol = (s) => (s.volumen_kg != null ? s.volumen_kg : sessionVolumeKg(s.series ?? []));

/**
 * Barras por periodo. '7d' = 7 días; '4w' = 4 semanas (lunes a domingo); '3m' = 13 semanas.
 * Cada barra: { key, from, to, duration (min), volume (kg), reps, sessions }.
 */
export function periodBuckets(history, period, now = Date.now()) {
  const today = localDate(now);
  const buckets = [];
  if (period === '7d') {
    for (let i = 6; i >= 0; i--) { const d = addDays(today, -i); buckets.push({ key: d, from: d, to: d }); }
  } else {
    const n = period === '3m' ? 13 : 4;
    const mon = mondayOf(today);
    for (let i = n - 1; i >= 0; i--) { const f = addDays(mon, -7 * i); buckets.push({ key: f, from: f, to: addDays(f, 6) }); }
  }
  for (const b of buckets) {
    b.duration = 0; b.volume = 0; b.reps = 0; b.sessions = 0;
    for (const s of history) {
      const d = dayOf(s);
      if (d < b.from || d > b.to) continue;
      b.duration += Math.round((s.segundos_real || 0) / 60);
      b.volume += sessionVol(s);
      b.reps += sessionReps(s);
      b.sessions++;
    }
  }
  return buckets;
}

export const PERIOD_DAYS = { '7d': 7, '4w': 28, '3m': 91 };
export const MUSCLE_GROUPS = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'abs'];
const GROUP_OF = Object.fromEntries(CATALOG.regions.map((r) => [r.code, r.muscle]));

/** Series por grupo muscular en los últimos `days` días (principal = 1, secundario fuerte = 0,5). */
export function setsByMuscleGroup(history, days, now = Date.now()) {
  const from = addDays(localDate(now), -(days - 1));
  const out = Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, 0]));
  for (const s of history) {
    if (dayOf(s) < from) continue;
    for (const x of s.series ?? []) {
      const ex = BY_CODE.get(x.ejercicio_code);
      if (!ex || ex.kind === 'cardio') continue;
      const best = {};
      for (const [r, w] of Object.entries(ex.weights)) { const g = GROUP_OF[r]; if (g in out) best[g] = Math.max(best[g] ?? 0, w); }
      for (const [g, w] of Object.entries(best)) out[g] += w >= 0.7 ? 1 : w >= 0.4 ? 0.5 : 0;
    }
  }
  return out;
}

/** Los `n` ejercicios de fuerza más frecuentes: sesiones, series, mejor serie (e1RM) y última fecha. */
export function topExercises(history, n = 5) {
  const map = new Map();
  for (const s of history) {
    const seen = new Set();
    for (const x of s.series ?? []) {
      const ex = BY_CODE.get(x.ejercicio_code);
      if (!ex || ex.kind !== 'strength') continue;
      const m = map.get(x.ejercicio_code) ?? { code: x.ejercicio_code, sessions: 0, sets: 0, best: null, bestE: 0, last: '' };
      m.sets++;
      if (!seen.has(x.ejercicio_code)) { m.sessions++; seen.add(x.ejercicio_code); }
      if (x.reps > 0) { const e = e1rm(x.peso_kg || 0, x.reps); if (e > m.bestE) { m.bestE = e; m.best = { peso_kg: x.peso_kg || 0, reps: x.reps }; } }
      if (String(s.fecha) > m.last) m.last = String(s.fecha);
      map.set(x.ejercicio_code, m);
    }
  }
  return [...map.values()].sort((a, b) => b.sessions - a.sessions || b.sets - a.sets || b.bestE - a.bestE).slice(0, n);
}

/** Resumen compacto de una sesión: [{ code, name, sets }] en orden de aparición. */
export function sessionExerciseCounts(series = []) {
  const m = new Map();
  for (const x of series) {
    const k = x.ejercicio_code || x.ejercicio;
    const r = m.get(k) ?? { code: x.ejercicio_code, name: x.ejercicio, sets: 0 };
    r.sets++; m.set(k, r);
  }
  return [...m.values()];
}
