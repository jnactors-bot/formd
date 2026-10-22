// Guía de cardio paso a paso: convierte un bloque de cardio en tramos con tiempo, velocidad, inclinación y sensación (RPE).
// Módulo puro (sin DOM): app.js solo dibuja los pasos. Las velocidades son rangos orientativos para cinta: manda la
// sensación (prueba del habla). Estructura basada en los planes habituales (calentar caminando, alternar trote/caminata,
// enfriar) y en el esquema progresivo «Couch to 5K».

export const LEVELS = ['beginner', 'mid', 'adv'];

// Rangos en km/h por nivel.
const SPEEDS = {
  beginner: { walk: [5, 6], run: [6.5, 8], hard: [9, 10], rec: [5, 6], brisk: [5.5, 6.5], incl: [4.5, 5.5] },
  mid: { walk: [5.5, 6.5], run: [8, 10], hard: [11, 13], rec: [6, 7], brisk: [6, 7], incl: [5.5, 6.5] },
  adv: { walk: [6, 7], run: [10, 12], hard: [13, 16], rec: [7, 8], brisk: [6.5, 7.5], incl: [6, 7] },
};
const INCLINE = { flat: '1 %', incl: '6–10 %', inclBeg: '4–6 %', brisk: '8–10 %' };

// Progresión de principiante (como Couch to 5K): cada sesión de carrera completada sube un escalón.
// [segundos de trote, segundos de caminata]; null = carrera continua.
export const BEGINNER_STAGES = [[60, 90], [90, 90], [120, 60], [180, 60], [300, 60], null];

const TXT = {
  warm: { es: 'Caminar para calentar', en: 'Walk to warm up', rpe: 2, cue: { es: 'Muy fácil. Sube la velocidad poco a poco.', en: 'Very easy. Build the speed gradually.' } },
  jog: { es: 'Trotar suave', en: 'Easy jog', rpe: 4, cue: { es: 'Podrías hablar frases completas. Si te falta aire, baja la velocidad.', en: 'You could speak full sentences. If you run out of breath, slow down.' } },
  walk: { es: 'Caminar', en: 'Walk', rpe: 2, cue: { es: 'Recupera el aire sin parar.', en: 'Recover your breath without stopping.' } },
  run: { es: 'Correr suave', en: 'Easy run', rpe: 4, cue: { es: 'Ritmo cómodo: hablas frases cortas. No es una carrera.', en: 'Comfortable pace: you can speak short sentences. It is not a race.' } },
  hard: { es: 'Correr fuerte', en: 'Run hard', rpe: 8, cue: { es: 'Rápido pero controlado. Solo podrías decir palabras sueltas.', en: 'Fast but controlled. You could only say single words.' } },
  hardwalk: { es: 'Caminar rápido en subida', en: 'Fast uphill walk', rpe: 8, cue: { es: 'Sube la inclinación y camina fuerte sin correr, sin agarrarte.', en: 'Raise the incline and walk hard without running, no holding on.' } },
  rec: { es: 'Recuperar', en: 'Recover', rpe: 2, cue: { es: 'Camina o trota muy suave hasta respirar normal.', en: 'Walk or jog very easy until your breathing settles.' } },
  cool: { es: 'Caminar para enfriar', en: 'Walk to cool down', rpe: 2, cue: { es: 'Baja la velocidad poco a poco hasta que baje el pulso.', en: 'Slow down gradually until your heart rate drops.' } },
  incline: { es: 'Caminar rápido en subida', en: 'Brisk incline walk', rpe: 5, cue: { es: 'Esfuerzo moderado y constante, sin agarrarte de los pasamanos.', en: 'Steady moderate effort, without holding the rails.' } },
  steady: { es: 'Ritmo constante', en: 'Steady pace', rpe: 4, cue: { es: 'Esfuerzo moderado y constante: podrías conversar con alguien.', en: 'Steady moderate effort: you could hold a conversation.' } },
};

const NON_TREADMILL = {
  bike_steady: { es: 'Cadencia 80–100 rpm, resistencia media.', en: 'Cadence 80–100 rpm, medium resistance.' },
  bike_hiit: { es: 'Fuerte: sube la resistencia y pedalea a tope.', en: 'Hard: raise resistance and pedal flat out.' },
  rower_steady: { es: '18–24 paladas por minuto, piernas primero.', en: '18–24 strokes per minute, legs first.' },
  rower_intervals: { es: 'Fuerte: 28–32 paladas por minuto con empuje de piernas.', en: 'Hard: 28–32 strokes per minute with leg drive.' },
  elliptical_steady: { es: 'Resistencia media, postura erguida.', en: 'Medium resistance, upright posture.' },
  elliptical_intervals: { es: 'Fuerte: más resistencia y velocidad.', en: 'Hard: more resistance and speed.' },
  stair_climber: { es: 'Paso constante, sin apoyarte en las barras.', en: 'Steady steps, without leaning on the bars.' },
  stair_intervals: { es: 'Fuerte: sube el ritmo de los escalones.', en: 'Hard: speed up the steps.' },
};

const TREADMILL = new Set(['treadmill_run_easy', 'treadmill_intervals', 'treadmill_sprints', 'incline_walk', 'treadmill_walk', 'outdoor_run']);
const RUN_CODES = new Set(['treadmill_run_easy', 'outdoor_run']);
const SWIM_CODES = new Set(['swim_steady', 'swim_intervals']);
export const isSwimCode = (code) => SWIM_CODES.has(code);

// Natación (piscina): sin velocidad ni inclinación; manda la sensación (hablar frases cortas entre largos).
const SWIM = {
  warm: { name: { es: 'Nada suave para calentar', en: 'Swim easy to warm up' }, cue: { es: 'Estilo cómodo, sin prisa.', en: 'Comfortable stroke, no rush.' } },
  steady: { name: { es: 'Nada continuo, respiración tranquila', en: 'Swim steady, relaxed breathing' }, cue: { es: 'Entre largos podrías decir frases cortas.', en: 'Between lengths you could say short sentences.' } },
  hard: { name: { es: 'Nada fuerte', en: 'Swim hard' }, cue: { es: 'Fuerte pero con técnica. Entre largos solo palabras sueltas.', en: 'Hard but with good technique. Single words between lengths.' } },
  rec: { name: { es: 'Descansa en el borde o nada muy suave', en: 'Rest at the wall or swim very easy' }, cue: { es: 'Respira hasta poder hablar frases.', en: 'Breathe until you can speak sentences.' } },
  cool: { name: { es: 'Nada suave para enfriar', en: 'Swim easy to cool down' }, cue: { es: 'Muy suave hasta que baje el pulso.', en: 'Very easy until your heart rate drops.' } },
};
export const isRunCode = (code) => RUN_CODES.has(code);

const seg = (kind, s, extra = {}) => ({ kind, s: Math.max(10, Math.round(s)), rpe: TXT[kind].rpe, ...extra });

// Tramos de un bloque de cardio. opts: {level, mode ('hybrid'|'fatloss'|'muscle'|'strength'), stage (0–5, solo principiante)}.
export function cardioSegments(code, totalS, protocol, opts = {}) {
  const lv = LEVELS.includes(opts.level) ? opts.level : 'beginner';
  const mode = opts.mode ?? 'hybrid';
  const stage = Math.max(0, Math.min(BEGINNER_STAGES.length - 1, opts.stage ?? 0));
  const T = Math.max(60, totalS);
  const warm = T >= 900 ? 300 : T >= 420 ? 180 : 0;
  const cool = T >= 900 ? 180 : T >= 420 ? 120 : 0;
  const main = T - warm - cool;
  const out = [];
  if (warm) out.push(seg('warm', warm, { speed: 'walk', incline: 'flat' }));
  if (protocol) {
    const cyc = protocol.workS + protocol.easyS;
    const rounds = Math.max(2, Math.floor(main / cyc));
    const walkHard = !SWIM_CODES.has(code) && lv === 'beginner' && (mode === 'fatloss' || code === 'treadmill_intervals' && mode !== 'hybrid');
    for (let i = 0; i < rounds; i++) {
      out.push(walkHard ? seg('hardwalk', protocol.workS, { speed: 'brisk', incline: 'brisk', round: i + 1, rounds }) : seg('hard', protocol.workS, { speed: 'hard', incline: 'flat', round: i + 1, rounds }));
      out.push(seg('rec', protocol.easyS, { speed: 'rec', incline: 'flat', round: i + 1, rounds }));
    }
  } else if (code === 'incline_walk') {
    out.push(seg('incline', main, { speed: 'incl', incline: lv === 'beginner' ? 'inclBeg' : 'incl' }));
  } else if (code === 'treadmill_walk') {
    out.push(seg('steady', main, { speed: 'walk', incline: 'flat' }));
  } else if (RUN_CODES.has(code) && lv === 'beginner') {
    const st = BEGINNER_STAGES[stage];
    if (!st) out.push(seg('run', main, { speed: 'run', incline: 'flat' }));
    else {
      const n = Math.max(1, Math.floor(main / (st[0] + st[1])));
      for (let i = 0; i < n; i++) {
        out.push(seg('jog', st[0], { speed: 'run', incline: 'flat' }));
        out.push(seg('walk', st[1], { speed: 'walk', incline: 'flat' }));
      }
    }
  } else if (RUN_CODES.has(code)) {
    out.push(seg('run', main, { speed: 'run', incline: 'flat' }));
  } else {
    out.push(seg('steady', main, { speed: null }));
  }
  if (cool) out.push(seg('cool', cool, { speed: 'walk', incline: 'flat' }));
  const sum = out.reduce((n, x) => n + x.s, 0);
  if (sum !== T && out.length) out[out.length - 1].s = Math.max(10, out[out.length - 1].s + (T - sum));
  if (SWIM_CODES.has(code)) for (const x of out) { x.speed = null; x.incline = null; }
  return out;
}

// Tramo que corresponde al segundo transcurrido el.
export function segmentAt(segs, el) {
  let t0 = 0;
  for (let i = 0; i < segs.length; i++) {
    const t1 = t0 + segs[i].s;
    if (el < t1) return { i, seg: segs[i], next: segs[i + 1] ?? null, left: Math.ceil(t1 - el), total: segs.length };
    t0 = t1;
  }
  const last = segs.length - 1;
  return { i: last, seg: segs[last], next: null, left: 0, total: segs.length, done: true };
}

const fmtKmh = (r, L) => `${String(r[0]).replace('.', L === 'en' ? '.' : ',')}–${String(r[1]).replace('.', L === 'en' ? '.' : ',')} km/h`;

// Texto de un tramo: nombre, velocidad objetivo, inclinación y sensación.
export function describe(code, sg, level = 'beginner', lang = 'es') {
  const L = lang === 'en' ? 'en' : 'es';
  const lv = LEVELS.includes(level) ? level : 'beginner';
  const tx = TXT[sg.kind];
  const treadmill = TREADMILL.has(code);
  const swim = SWIM_CODES.has(code) && SWIM[sg.kind];
  const speed = treadmill && sg.speed ? fmtKmh(SPEEDS[lv][sg.speed], L) : '';
  const incline = treadmill && sg.incline ? `${L === 'en' ? 'Incline' : 'Inclinación'} ${INCLINE[sg.incline]}` : '';
  let name = tx[L];
  let cue = tx.cue[L];
  if (!treadmill) {
    if (sg.kind === 'warm') name = L === 'en' ? 'Warm up easy' : 'Calentar suave';
    if (sg.kind === 'cool') name = L === 'en' ? 'Cool down easy' : 'Enfriar suave';
    if (sg.kind === 'rec') cue = L === 'en' ? 'Go very easy until your breathing settles.' : 'Muy suave hasta que se normalice la respiración.';
    if (NON_TREADMILL[code] && ['steady', 'run', 'jog', 'hard'].includes(sg.kind)) cue = NON_TREADMILL[code][L];
  }
  if (swim) { name = swim.name[L]; cue = swim.cue[L]; }
  return { name, speed, incline, rpe: `${L === 'en' ? 'Effort' : 'Esfuerzo'} ${sg.rpe}/10`, cue };
}

export const LEVEL_NAME = {
  beginner: { es: 'Principiante', en: 'Beginner' },
  mid: { es: 'Intermedio', en: 'Intermediate' },
  adv: { es: 'Avanzado', en: 'Advanced' },
};

// Agrupa los tramos en pasos legibles: «8 veces: trotar 1′ + caminar 1′30″», con su rango de tramos.
export function steps(segs) {
  const out = [];
  for (let i = 0; i < segs.length;) {
    const a = segs[i], b = segs[i + 1];
    const pair = b && ((a.kind === 'jog' && b.kind === 'walk') || (a.kind === 'hard' && b.kind === 'rec') || (a.kind === 'hardwalk' && b.kind === 'rec'));
    if (pair) {
      let n = 0, j = i;
      while (segs[j] && segs[j + 1] && segs[j].kind === a.kind && segs[j + 1].kind === b.kind && segs[j].s === a.s && segs[j + 1].s === b.s) { n++; j += 2; }
      if (n >= 2) { out.push({ from: i, to: j - 1, repeat: n, parts: [a, b] }); i = j; continue; }
    }
    out.push({ from: i, to: i, repeat: 1, parts: [a] }); i++;
  }
  return out.map((st, k) => ({ ...st, n: k + 1 }));
}

export const fmtDur = (s) => (s % 60 === 0 ? `${s / 60}′` : s < 60 ? `${s}″` : `${Math.floor(s / 60)}′${String(s % 60).padStart(2, '0')}″`);

// Nota breve del porqué de la prescripción según el modo (honesta con la evidencia).
export function modeNote(code, mode, level, lang = 'es') {
  const L = lang === 'en' ? 'en' : 'es';
  if (mode === 'fatloss') return L === 'en' ? 'Fat loss: what counts most is total weekly effort and your calorie balance. This is sustainable cardio that spares your joints.' : 'Bajar de peso: lo que más cuenta es el esfuerzo total de la semana y tu balance de calorías. Cardio sostenible y que cuida tus articulaciones.';
  if (mode === 'strength' || mode === 'muscle') return L === 'en' ? 'Short and easy so it does not get in the way of your lifting. Better on a different day than legs.' : 'Corto y suave para no estorbar tus pesas. Mejor en un día distinto al de piernas.';
  if (level === 'beginner' && RUN_CODES.has(code)) return L === 'en' ? 'Hybrid: you build running step by step. Each run session moves you one step up.' : 'Híbrido: vas construyendo la carrera por escalones. Cada sesión de carrera te sube un escalón.';
  return L === 'en' ? 'Hybrid: easy aerobic base work to run longer, while keeping your strength.' : 'Híbrido: base aeróbica suave para correr más tiempo sin perder fuerza.';
}
