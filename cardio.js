// Guía de cardio: convierte un bloque de cardio en tramos con tiempo, velocidad/ritmo y sensación (RPE), para que nadie
// tenga que adivinar a qué paso ir. Módulo puro (sin DOM): app.js solo dibuja el tramo que toca.
// Las velocidades son rangos orientativos para cinta; manda la sensación (prueba del habla), no el número.

export const LEVELS = ['beginner', 'mid', 'adv'];

// Rangos en km/h por nivel: caminar, trote suave (run), tramo fuerte (hard) y recuperación (rec).
const SPEEDS = {
  beginner: { walk: [5, 6], run: [6.5, 8], hard: [9, 10], rec: [5, 6] },
  mid: { walk: [5.5, 6.5], run: [8, 10], hard: [11, 13], rec: [6, 7] },
  adv: { walk: [6, 7], run: [10, 12], hard: [13, 16], rec: [7, 8] },
};

const TXT = {
  warm: { es: 'Calentar caminando', en: 'Warm up walking', rpe: 2, cue: { es: 'Muy fácil. Sube la velocidad poco a poco.', en: 'Very easy. Build the speed gradually.' } },
  jog: { es: 'Trote suave', en: 'Easy jog', rpe: 4, cue: { es: 'Podrías hablar frases completas. Si te falta aire, baja la velocidad.', en: 'You could speak full sentences. If you run out of breath, slow down.' } },
  walk: { es: 'Caminar', en: 'Walk', rpe: 2, cue: { es: 'Recupera el aire sin parar.', en: 'Recover your breath without stopping.' } },
  run: { es: 'Carrera suave', en: 'Easy run', rpe: 4, cue: { es: 'Ritmo cómodo: hablas frases cortas. No es una carrera.', en: 'Comfortable pace: you can speak short sentences. It is not a race.' } },
  hard: { es: 'Fuerte', en: 'Hard', rpe: 8, cue: { es: 'Rápido pero controlado. Solo podrías decir palabras sueltas.', en: 'Fast but controlled. You could only say single words.' } },
  rec: { es: 'Recupera', en: 'Recover', rpe: 2, cue: { es: 'Camina o trota muy suave hasta respirar normal.', en: 'Walk or jog very easy until your breathing settles.' } },
  cool: { es: 'Enfriar caminando', en: 'Cool down walking', rpe: 2, cue: { es: 'Baja la velocidad poco a poco hasta que baje el pulso.', en: 'Slow down gradually until your heart rate drops.' } },
  incline: { es: 'Caminata inclinada', en: 'Incline walk', rpe: 4, cue: { es: 'Sube la inclinación al 5–8 %. No te agarres de los pasamanos.', en: 'Raise the incline to 5–8%. Do not hold the rails.' } },
  steady: { es: 'Ritmo constante', en: 'Steady pace', rpe: 4, cue: { es: 'Esfuerzo moderado y constante: podrías conversar con alguien.', en: 'Steady moderate effort: you could hold a conversation.' } },
};

const NON_TREADMILL = {
  bike_steady: { cue: { es: 'Cadencia 80–100 rpm, resistencia media.', en: 'Cadence 80–100 rpm, medium resistance.' } },
  bike_hiit: { cue: { es: 'Fuerte: sube la resistencia y pedalea a tope.', en: 'Hard: raise resistance and pedal flat out.' } },
  rower_steady: { cue: { es: '18–24 paladas por minuto, piernas primero.', en: '18–24 strokes per minute, legs first.' } },
  rower_intervals: { cue: { es: 'Fuerte: 28–32 paladas por minuto con empuje de piernas.', en: 'Hard: 28–32 strokes per minute with leg drive.' } },
  elliptical_steady: { cue: { es: 'Resistencia media, postura erguida.', en: 'Medium resistance, upright posture.' } },
  elliptical_intervals: { cue: { es: 'Fuerte: más resistencia y velocidad.', en: 'Hard: more resistance and speed.' } },
  stair_climber: { cue: { es: 'Paso constante, sin apoyarte en las barras.', en: 'Steady steps, without leaning on the bars.' } },
  stair_intervals: { cue: { es: 'Fuerte: sube el ritmo de los escalones.', en: 'Hard: speed up the steps.' } },
};

const TREADMILL = new Set(['treadmill_run_easy', 'treadmill_intervals', 'treadmill_sprints', 'incline_walk', 'treadmill_walk', 'outdoor_run']);

const seg = (kind, s, lv, extra = {}) => ({ kind, s: Math.max(10, Math.round(s)), rpe: TXT[kind]?.rpe ?? 4, ...extra });

// Devuelve los tramos de un bloque de cardio. total = segundos del bloque; protocol = {workS, easyS, rounds} si es por intervalos.
export function cardioSegments(code, totalS, protocol, level = 'beginner') {
  const lv = LEVELS.includes(level) ? level : 'beginner';
  const interval = Boolean(protocol);
  const out = [];
  const T = Math.max(60, totalS);
  const warm = T >= 900 ? 300 : T >= 420 ? 180 : 0;
  const cool = T >= 900 ? 180 : T >= 420 ? 120 : 0;
  if (warm) out.push(seg('warm', warm, lv, { speed: 'walk' }));
  const main = T - warm - cool;
  if (interval) {
    const cyc = protocol.workS + protocol.easyS;
    const rounds = Math.max(2, Math.floor(main / cyc));
    for (let i = 0; i < rounds; i++) {
      out.push(seg('hard', protocol.workS, lv, { speed: 'hard', round: i + 1, rounds }));
      out.push(seg('rec', protocol.easyS, lv, { speed: 'rec', round: i + 1, rounds }));
    }
  } else if (code === 'incline_walk') {
    out.push(seg('incline', main, lv, { speed: 'walk' }));
  } else if (code === 'treadmill_walk') {
    out.push(seg('steady', main, lv, { speed: 'walk' }));
  } else if ((code === 'treadmill_run_easy' || code === 'outdoor_run') && lv === 'beginner') {
    // Principiante: alterna trote y caminata (2 min + 1 min) en vez de correr seguido.
    let left = main;
    while (left > 0) {
      const j = Math.min(120, left); out.push(seg('jog', j, lv, { speed: 'run' })); left -= j;
      if (left <= 0) break;
      const w = Math.min(60, left); out.push(seg('walk', w, lv, { speed: 'walk' })); left -= w;
    }
  } else if (code === 'treadmill_run_easy' || code === 'outdoor_run') {
    out.push(seg('run', main, lv, { speed: 'run' }));
  } else {
    out.push(seg('steady', main, lv, { speed: null }));
  }
  if (cool) out.push(seg('cool', cool, lv, { speed: 'walk' }));
  // Une tramos contiguos iguales y ajusta el total exacto al último tramo.
  const sum = out.reduce((n, x) => n + x.s, 0);
  if (sum !== T && out.length) out[out.length - 1].s = Math.max(10, out[out.length - 1].s + (T - sum));
  return out;
}

// Tramo que corresponde al segundo transcurrido el, con el siguiente y el tiempo restante del tramo.
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

const fmtKmh = (r, lang) => `${String(r[0]).replace('.', lang === 'en' ? '.' : ',')}–${String(r[1]).replace('.', lang === 'en' ? '.' : ',')} km/h`;

// Texto de un tramo: nombre, velocidad objetivo y sensación.
export function describe(code, seg, level = 'beginner', lang = 'es') {
  const L = lang === 'en' ? 'en' : 'es';
  const lv = LEVELS.includes(level) ? level : 'beginner';
  const tx = TXT[seg.kind];
  const treadmill = TREADMILL.has(code);
  const speed = treadmill && seg.speed ? fmtKmh(SPEEDS[lv][seg.speed], L) : '';
  let cue = tx.cue[L];
  if (!treadmill && NON_TREADMILL[code] && ['steady', 'run', 'jog', 'hard'].includes(seg.kind)) cue = NON_TREADMILL[code].cue[L];
  let name = tx[L];
  if (!treadmill && (seg.kind === 'warm' || seg.kind === 'cool')) name = seg.kind === 'warm' ? (L === 'en' ? 'Warm up easy' : 'Calentar suave') : (L === 'en' ? 'Cool down easy' : 'Enfriar suave');
  if (!treadmill && seg.kind === 'rec') cue = L === 'en' ? 'Go very easy until your breathing settles.' : 'Muy suave hasta que se normalice la respiración.';
  const rpeWord = L === 'en' ? 'Effort' : 'Esfuerzo';
  return { name, speed, rpe: `${rpeWord} ${seg.rpe}/10`, cue };
}

export const LEVEL_NAME = {
  beginner: { es: 'Principiante', en: 'Beginner' },
  mid: { es: 'Intermedio', en: 'Intermediate' },
  adv: { es: 'Avanzado', en: 'Advanced' },
};

// Resumen en una línea de cómo es la sesión, p. ej. «Calentar 5′ · 6 × (trote 2′ + caminar 1′) · Enfriar 3′».
export function outline(segs, lang = 'es') {
  const L = lang === 'en' ? 'en' : 'es';
  const m = (s) => `${Math.round(s / 60)}′`;
  const w = segs.find((x) => x.kind === 'warm'), c = segs.find((x) => x.kind === 'cool');
  const parts = [];
  if (w) parts.push(`${L === 'en' ? 'Warm-up' : 'Calentar'} ${m(w.s)}`);
  const hard = segs.filter((x) => x.kind === 'hard');
  const jog = segs.filter((x) => x.kind === 'jog');
  if (hard.length) parts.push(`${hard.length} × (${hard[0].s}s ${L === 'en' ? 'hard' : 'fuerte'} + ${segs.find((x) => x.kind === 'rec').s}s ${L === 'en' ? 'easy' : 'suave'})`);
  else if (jog.length) parts.push(`${jog.length} × (${L === 'en' ? 'jog' : 'trote'} 2′ + ${L === 'en' ? 'walk' : 'caminar'} 1′)`);
  else {
    const mid = segs.filter((x) => !['warm', 'cool'].includes(x.kind)).reduce((n, x) => n + x.s, 0);
    parts.push(`${m(mid)} ${L === 'en' ? 'steady' : 'constante'}`);
  }
  if (c) parts.push(`${L === 'en' ? 'Cool-down' : 'Enfriar'} ${m(c.s)}`);
  return parts.join(' · ');
}
