// Demostraciones animadas de los ejercicios con la misma figura anatómica.
// La figura es de frente o de espalda, así que el movimiento es una vista simplificada: brazos y piernas se mueven
// con cinemática (rotación en las articulaciones, acortamiento cuando el hueso apunta al espectador) y cada zona
// muscular se enciende según qué tanto trabaja ese ejercicio, al ritmo de la repetición.
import { ensureDefs, getBody } from './bodymap.js';

const RAD = Math.PI / 180;
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const lerp = (a, b, s) => a + (b - a) * s;
const f1 = (n) => Math.round(n * 100) / 100;

// ---------- Patrones de movimiento ----------
// Convención (lado "a" = izquierda de la pantalla): ángulos horarios positivos; el lado "b" se refleja solo.
//   abd = abertura del hombro (0 = brazo abajo, 90 = horizontal, 165 = arriba)
//   elb = giro del antebrazo respecto al brazo (positivo = hacia arriba/afuera, negativo = hacia el cuerpo)
//   fU/fF = acortamiento del brazo/antebrazo cuando apunta hacia el espectador
// s va de 0 (posición inicial) a 1 (máxima contracción).
export const MOVES = {
  press: { view: 'front', pose: (s) => ({ abd: lerp(78, 34, s), elb: lerp(100, 6, s), fU: lerp(1, 0.34, s), fF: lerp(1, 0.34, s) }) },
  fly: { view: 'front', pose: (s) => ({ abd: lerp(80, 26, s), elb: 12, fU: lerp(1, 0.55, s), fF: lerp(1, 0.55, s) }) },
  ohpress: { view: 'front', pose: (s) => ({ abd: lerp(80, 160, s), elb: lerp(95, 6, s) }) },
  lateral: { view: 'front', pose: (s) => ({ abd: lerp(6, 92, s), elb: -8 }) },
  reardelt: { view: 'back', pose: (s) => ({ abd: lerp(10, 90, s), elb: lerp(-4, 0, s) }) },
  facepull: { view: 'back', pose: (s) => ({ abd: lerp(24, 86, s), elb: lerp(8, 98, s), fU: lerp(0.7, 1, s), fF: lerp(0.7, 1, s) }) },
  triceps: { view: 'front', pose: (s) => ({ abd: 4, elb: lerp(-150, -4, s) }) },
  curl: { view: 'front', pose: (s) => ({ abd: lerp(6, 14, s), elb: lerp(-3, -152, s), fF: lerp(1, 0.82, s) }) },
  pulldown: { view: 'back', pose: (s) => ({ abd: lerp(165, 46, s), elb: lerp(6, 112, s) }), lift: (s) => -0.0 * s },
  row: { view: 'back', pose: (s) => ({ abd: lerp(26, 42, s), elb: lerp(8, 96, s), fU: lerp(0.62, 1, s), fF: lerp(0.62, 1, s) }) },
  shrug: { view: 'back', pose: (s) => ({ abd: 4, elb: -4 }), up: (s) => -0.022 * s },
  squat: { view: 'front', pose: (s) => ({ abd: lerp(6, 34, s), elb: lerp(-4, 14, s), fU: lerp(1, 0.74, s), fF: lerp(1, 0.74, s) }), squat: (s) => s },
  hinge: { view: 'back', pose: (s) => ({ abd: 4, elb: -4 }), lean: (s) => lerp(1, 0.8, s) },
  bridge: { view: 'back', pose: (s) => ({ abd: 4, elb: -4 }), up: (s) => -0.018 * s },
  legext: { view: 'front', pose: (s) => ({ abd: 6, elb: -6 }), shank: (s) => lerp(1, 0.5, s) },
  legcurl: { view: 'back', pose: (s) => ({ abd: 6, elb: -6 }), shank: (s) => lerp(1, 0.5, s) },
  calf: { view: 'back', pose: () => ({ abd: 6, elb: -6 }), up: (s) => -0.026 * s, calf: true },
  adduct: { view: 'front', pose: () => ({ abd: 6, elb: -6 }), legOpen: (s) => lerp(22, 3, s) },
  abduct: { view: 'front', pose: () => ({ abd: 6, elb: -6 }), legOpen: (s) => lerp(3, 22, s) },
  legraise: { view: 'front', pose: (s) => ({ abd: lerp(165, 160, s), elb: 4 }), thigh: (s) => lerp(1, 0.4, s), shankF: (s) => lerp(1, 0.7, s) },
  crunch: { view: 'front', pose: (s) => ({ abd: lerp(20, 14, s), elb: lerp(-20, -110, s) }), lean: (s) => lerp(1, 0.92, s) },
  run: { view: 'front', pose: () => ({ abd: 10, elb: -80 }), run: true },
  jump: { view: 'front', pose: () => ({ abd: 14, elb: -60 }), bounce: true },
  pulse: { view: 'front', pose: () => ({ abd: 6, elb: -6 }) },
};

/** Qué movimiento mostrar para un ejercicio del catálogo. */
export function moveKey(ex) {
  const c = ex.code;
  if (c === 'face_pull') return 'facepull';
  if (c === 'wrist_curl') return 'pulse';
  if (c === 'hanging_leg_raise') return 'legraise';
  if (c === 'jump_rope') return 'jump';
  if (c === 'db_shrug') return 'shrug';
  if (c === 'straight_arm_pulldown') return 'pulldown';
  if (c === 'back_extension') return 'hinge';
  const m = {
    horizontal_push: 'press', incline_push: 'press', decline_push: 'press', fly: 'fly', vertical_push: 'ohpress',
    lateral_raise: 'lateral', rear_delt: 'reardelt', triceps_ext: 'triceps', vertical_pull: 'pulldown', horizontal_pull: 'row',
    curl: 'curl', shrug: 'shrug', squat: 'squat', lunge: 'squat', hinge: 'hinge', hip_extension: 'bridge', leg_ext: 'legext',
    leg_curl: 'legcurl', calf: 'calf', adduction: 'adduct', abduction: 'abduct', core_flexion: 'crunch',
    cardio_steady: 'run', cardio_interval: 'run',
  };
  return m[ex.pattern] ?? 'pulse';
}

export const defaultView = (key) => MOVES[key]?.view ?? 'front';

// ---------- Consejos por movimiento ----------
export const CUES = {
  press: { es: ['Escápulas atrás y pecho arriba.', 'Baja controlado, 2–3 s.', 'Empuja sin bloquear de golpe los codos.'], en: ['Shoulder blades back, chest up.', 'Lower under control, 2–3 s.', 'Press without snapping the elbows.'] },
  fly: { es: ['Codos ligeramente flexionados.', 'Abre hasta sentir estiramiento, sin dolor.', 'Junta los brazos apretando el pecho.'], en: ['Keep a soft bend in the elbows.', 'Open until you feel a stretch, pain-free.', 'Bring the arms together squeezing the chest.'] },
  ohpress: { es: ['Abdomen firme, costillas abajo.', 'Empuja la carga sobre la cabeza.', 'Baja a la altura de los hombros.'], en: ['Brace your abs, ribs down.', 'Press the load overhead.', 'Lower to shoulder height.'] },
  lateral: { es: ['Sube hasta la altura de los hombros.', 'Sin balancear el cuerpo.', 'Baja lento, sin soltar la tensión.'], en: ['Raise to shoulder height.', 'Do not swing the body.', 'Lower slowly, keep tension.'] },
  reardelt: { es: ['Tronco inclinado y firme.', 'Abre los brazos hacia los lados.', 'Piensa en llevar los codos atrás.'], en: ['Hinge forward and stay braced.', 'Open the arms out to the sides.', 'Think of driving elbows back.'] },
  facepull: { es: ['Tira hacia la cara, codos altos.', 'Junta las escápulas al final.', 'Vuelve lento.'], en: ['Pull toward the face, elbows high.', 'Squeeze the shoulder blades at the end.', 'Return slowly.'] },
  triceps: { es: ['Codos pegados al cuerpo.', 'Extiende hasta casi bloquear.', 'Sube controlado.'], en: ['Keep elbows pinned to your sides.', 'Extend until almost locked.', 'Return under control.'] },
  curl: { es: ['Codos pegados al cuerpo.', 'Sube sin balancear.', 'Baja en 2–3 s hasta casi estirar.'], en: ['Keep elbows pinned to your sides.', 'Curl without swinging.', 'Lower in 2–3 s to nearly straight.'] },
  pulldown: { es: ['Pecho arriba, hombros abajo.', 'Lleva los codos hacia las costillas.', 'Vuelve arriba con control.'], en: ['Chest up, shoulders down.', 'Drive elbows toward your ribs.', 'Return up with control.'] },
  row: { es: ['Espalda recta, abdomen firme.', 'Lleva los codos atrás, junta escápulas.', 'Vuelve lento, sin encorvarte.'], en: ['Flat back, abs braced.', 'Drive elbows back, squeeze shoulder blades.', 'Return slowly without rounding.'] },
  shrug: { es: ['Sube los hombros hacia las orejas.', 'Pausa arriba un segundo.', 'Baja controlado, sin girar.'], en: ['Lift shoulders toward the ears.', 'Pause at the top for a second.', 'Lower under control, no rolling.'] },
  squat: { es: ['Pies al ancho de hombros.', 'Rodillas siguen la línea de los pies.', 'Baja controlado y sube empujando el piso.'], en: ['Feet shoulder-width.', 'Knees track over the feet.', 'Lower under control and drive up through the floor.'] },
  hinge: { es: ['Lleva la cadera hacia atrás.', 'Espalda neutra, la carga cerca del cuerpo.', 'Sube apretando glúteos.'], en: ['Push the hips back.', 'Neutral spine, load close to the body.', 'Stand up squeezing the glutes.'] },
  bridge: { es: ['Sube la cadera apretando glúteos.', 'No arquees la espalda baja.', 'Pausa arriba, baja controlado.'], en: ['Drive the hips up squeezing glutes.', 'Do not over-arch the low back.', 'Pause at the top, lower under control.'] },
  legext: { es: ['Extiende sin bloquear de golpe.', 'Aprieta el cuádriceps arriba.', 'Baja lento.'], en: ['Extend without snapping the knee.', 'Squeeze the quad at the top.', 'Lower slowly.'] },
  legcurl: { es: ['Cadera pegada al apoyo.', 'Lleva el talón hacia el glúteo.', 'Vuelve lento.'], en: ['Hips stay on the pad.', 'Bring heels toward the glutes.', 'Return slowly.'] },
  calf: { es: ['Sube lo más alto que puedas.', 'Pausa arriba un segundo.', 'Baja hasta sentir el estiramiento.'], en: ['Rise as high as you can.', 'Pause at the top for a second.', 'Lower until you feel a stretch.'] },
  adduct: { es: ['Junta las piernas sin impulso.', 'Controla la vuelta.'], en: ['Bring the legs together without momentum.', 'Control the return.'] },
  abduct: { es: ['Abre las piernas sin impulso.', 'Controla la vuelta.'], en: ['Open the legs without momentum.', 'Control the return.'] },
  legraise: { es: ['Sube las rodillas hacia el pecho.', 'Sin balancearte.', 'Baja lento.'], en: ['Raise the knees toward the chest.', 'Do not swing.', 'Lower slowly.'] },
  crunch: { es: ['Enrolla el torso, no tires del cuello.', 'Exhala al subir.', 'Baja controlado.'], en: ['Curl the torso, do not pull the neck.', 'Exhale on the way up.', 'Lower under control.'] },
  run: { es: ['Postura alta y relajada.', 'Pasos cortos y rápidos.', 'Respira de forma constante.'], en: ['Tall, relaxed posture.', 'Short, quick steps.', 'Breathe steadily.'] },
  jump: { es: ['Salta con las puntas de los pies.', 'Muñecas hacen el giro, no los hombros.', 'Ritmo constante.'], en: ['Jump on the balls of the feet.', 'Wrists turn the rope, not the shoulders.', 'Keep a steady rhythm.'] },
  pulse: { es: ['Mantén el abdomen firme.', 'Respira sin contener el aire.', 'Calidad antes que cantidad.'], en: ['Keep your abs braced.', 'Breathe, do not hold your breath.', 'Quality over quantity.'] },
};

// ---------- Geometría ----------
function scaleAbout(p, u, f) {
  // Escala f a lo largo del eje u (vector unitario) manteniendo fijo el punto p.
  const k = f - 1;
  const a = 1 + k * u[0] * u[0], b = k * u[0] * u[1], d = 1 + k * u[1] * u[1];
  const e = p[0] - (a * p[0] + b * p[1]);
  const g = p[1] - (b * p[0] + d * p[1]);
  return `matrix(${f1(a)} ${f1(b)} ${f1(b)} ${f1(d)} ${f1(e)} ${f1(g)})`;
}
const unit = (a, b) => { const d = dist(a, b) || 1; return [(b[0] - a[0]) / d, (b[1] - a[1]) / d]; };
const rot = (deg, p) => `rotate(${f1(deg)} ${f1(p[0])} ${f1(p[1])})`;

// Cinemática inversa de 2 huesos: cadera movida hacia abajo, tobillo fijo. Devuelve giros del muslo y de la pierna.
function ikLeg(H, K, A, dy, fT, fS, outSign) {
  const Lt = dist(H, K) * fT, Ls = dist(K, A) * fS;
  const Hp = [H[0], H[1] + dy];
  const d = Math.min(dist(Hp, A), Lt + Ls - 0.5);
  const a = (Lt * Lt - Ls * Ls + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, Lt * Lt - a * a));
  const ux = (A[0] - Hp[0]) / dist(Hp, A), uy = (A[1] - Hp[1]) / dist(Hp, A);
  const base = [Hp[0] + ux * a, Hp[1] + uy * a];
  // perpendicular que apunta hacia afuera (alejándose del eje del cuerpo)
  let px = -uy, py = ux;
  if (px * outSign < 0) { px = -px; py = -py; }
  const Kp = [base[0] + px * h, base[1] + py * h];
  const restT = Math.atan2(K[1] - H[1], K[0] - H[0]);
  const restS = Math.atan2(A[1] - K[1], A[0] - K[0]);
  const rotT = (Math.atan2(Kp[1] - Hp[1], Kp[0] - Hp[0]) - restT) / RAD;
  const rotSabs = (Math.atan2(A[1] - Kp[1], A[0] - Kp[0]) - restS) / RAD;
  return { rotT, rotS: rotSabs - rotT };
}

// ---------- Montaje ----------
/**
 * Dibuja la figura animada dentro de `container` y devuelve { stop() }.
 * @param {HTMLElement} container
 * @param {{sex:'male'|'female', view:'front'|'back', exercise:object, key:string, accent?:string, reduced?:boolean}} o
 */
export function mountDemo(container, o) {
  const BODY = getBody();
  if (!BODY) return { stop() {} };
  const sex = o.sex === 'female' ? 'female' : 'male';
  ensureDefs(sex);
  const d = BODY[sex][o.view];
  const rig = d.rig;
  const P = rig.piv;
  const H = rig.H;
  const move = MOVES[o.key] ?? MOVES.pulse;
  const w = o.exercise.weights;
  const hasRig = Object.keys(rig.bones).length > 0;
  if (!hasRig) return { stop() {} };

  // piezas de cada hueso y zonas que le tocan
  const boneOf = {};
  for (const [b, list] of Object.entries(rig.bones)) for (const i of list) boneOf[i] = b;
  const k = sex[0] + o.view[0];
  const own = (bone) => {
    const list = rig.bones[bone] ?? [];
    const base = list.map((i) => `<use href="#p${k}${i}" class="k${d.paths[i][0]}"/>`).join('');
    const hi = [];
    for (const [code, z] of Object.entries(d.zones)) {
      const mine = z.p.filter((i) => boneOf[i] === bone);
      if (!mine.length) continue;
      const clip = z.c ? ` clip-path="url(#c${k}-${code})"` : '';
      hi.push(`<g class="z" data-region="${code}" style="opacity:0"${clip}>${mine.map((i) => `<use href="#p${k}${i}"/>`).join('')}</g>`);
    }
    return `<g class="own" data-own="${bone}">${base}${hi.join('')}</g>`;
  };

  const arm = (side) => `<g data-g="uarm${side}">${own('uarm' + side)}<g data-g="farm${side}">${own('farm' + side)}</g></g>`;
  const leg = (side) => `<g data-g="thigh${side}">${own('thigh' + side)}<g data-g="shank${side}">${own('shank' + side)}</g></g>`;
  const svg = `<svg class="body demo-fig" viewBox="${d.vb.join(' ')}" role="img" aria-label="${o.exercise.es}" style="--accent:${o.accent ?? '#C6FF3D'}">
    ${leg('a')}${leg('b')}
    <g data-g="up"><g data-g="torso">${own('torso')}</g>${arm('a')}${arm('b')}<g data-g="cap">${own('cap')}</g><g data-g="head">${own('head')}</g></g>
  </svg>`;
  container.innerHTML = svg;
  const root = container.querySelector('svg');
  const G = (name) => root.querySelector(`[data-g="${name}"]`);
  const OWN = (bone) => root.querySelector(`[data-own="${bone}"]`);
  const zones = [...root.querySelectorAll('.z')];
  const zoneInt = zones.map((el) => { const wv = w[el.dataset.region] ?? 0; return wv >= 0.25 ? wv * wv : 0; });

  const S = { a: P.Sa, b: P.Sb }, E = { a: P.Ea, b: P.Eb }, HE = { a: P.HEa, b: P.HEb };
  const Hh = { a: P.Ha, b: P.Hb }, Kk = { a: P.Ka, b: P.Kb }, Aa = { a: P.Aa, b: P.Ab };
  const hipMid = [(P.Ha[0] + P.Hb[0]) / 2, P.Ha[1]], neckMid = [(P.Na[0] + P.Nb[0]) / 2, P.Na[1]];

  function pose(s, t) {
    const m = move.pose(s);
    const abd = m.abd, elb = m.elb, fU = m.fU ?? 1, fF = m.fF ?? 1;
    let up = [0, 0];
    let torsoF = 1;
    if (move.up) up[1] += move.up(s) * H;
    if (move.lean) torsoF = move.lean(s);
    // hinge/crunch: el torso se acorta y lo de arriba baja con él
    const tAxis = unit(hipMid, neckMid);
    const dTorso = [(torsoF - 1) * (neckMid[0] - hipMid[0]), (torsoF - 1) * (neckMid[1] - hipMid[1])];
    up[0] += dTorso[0]; up[1] += dTorso[1];
    let sq = move.squat ? move.squat(s) : 0;
    let run = null;
    if (move.run) run = Math.sin(t * Math.PI * 2 * 2);
    let bounce = 0;
    if (move.bounce) bounce = -Math.abs(Math.sin(t * Math.PI * 2 * 2)) * 0.03 * H;
    const dyUp = sq * 0.115 * H + bounce;
    up[1] += dyUp;
    if (move.calf) up[1] += 0; // el talón sube: ver más abajo

    G('up').setAttribute('transform', `translate(${f1(up[0])} ${f1(up[1])})`);
    OWN('torso').setAttribute('transform', scaleAbout(hipMid, tAxis, torsoF));

    for (const side of ['a', 'b']) {
      const sg = side === 'a' ? 1 : -1;
      let aAbd = abd, aElb = elb, aF = fU, aFF = fF;
      if (run) { const ph = side === 'a' ? run : -run; aAbd = 18 + 26 * ph; aElb = -75 - 25 * ph; }
      G('uarm' + side).setAttribute('transform', rot(sg * aAbd, S[side]));
      OWN('uarm' + side).setAttribute('transform', scaleAbout(S[side], unit(S[side], E[side]), aF));
      const dE = [(aF - 1) * (E[side][0] - S[side][0]), (aF - 1) * (E[side][1] - S[side][1])];
      G('farm' + side).setAttribute('transform', `translate(${f1(dE[0])} ${f1(dE[1])}) ${rot(sg * aElb, E[side])}`);
      OWN('farm' + side).setAttribute('transform', scaleAbout(E[side], unit(E[side], HE[side]), aFF));

      // piernas
      let fT = 1, fS = 1, rT = 0, rS = 0, dyLeg = 0;
      const out = side === 'a' ? -1 : 1;
      if (move.squat) {
        fT = lerp(1, 0.76, sq); fS = lerp(1, 0.88, sq); dyLeg = dyUp;
        const r = ikLeg(Hh[side], Kk[side], Aa[side], dyLeg, fT, fS, out);
        rT = r.rotT; rS = r.rotS;
      } else if (move.legOpen) {
        const a = move.legOpen(s); rT = sg * a; rS = -sg * a * 0.9;
      } else if (move.shank) {
        fS = move.shank(s);
      } else if (move.thigh) {
        fT = move.thigh(s); fS = move.shankF(s);
      } else if (run) {
        const ph = side === 'a' ? run : -run;
        fT = ph > 0 ? lerp(1, 0.55, ph) : 1; fS = ph > 0 ? lerp(1, 0.75, ph) : 1;
      } else if (move.calf) {
        fS = 1 - (0.026 * s * H) / dist(Kk[side], Aa[side]);
        dyLeg = 0;
      }
      const hipDy = move.squat ? dyLeg : 0;
      G('thigh' + side).setAttribute('transform', `translate(0 ${f1(hipDy)}) ${rot(rT, Hh[side])}`);
      OWN('thigh' + side).setAttribute('transform', scaleAbout(Hh[side], unit(Hh[side], Kk[side]), fT));
      const dK = [(fT - 1) * (Kk[side][0] - Hh[side][0]), (fT - 1) * (Kk[side][1] - Hh[side][1])];
      G('shank' + side).setAttribute('transform', `translate(${f1(dK[0])} ${f1(dK[1])}) ${rot(rS, Kk[side])}`);
      OWN('shank' + side).setAttribute('transform', scaleAbout(Kk[side], unit(Kk[side], Aa[side]), fS));
    }
  }

  // Intensidad de cada zona: parte de un brillo bajo (para ver qué músculo es) y sube con la contracción.
  function light(act) {
    zones.forEach((el, i) => {
      const it = zoneInt[i];
      el.style.opacity = it > 0 ? f1(0.16 + 0.84 * Math.min(1, it * (0.25 + 0.75 * act))) : 0;
    });
  }

  const PERIOD = move.run || move.bounce ? 1400 : 3600;
  let raf = 0, t0 = performance.now(), stopped = false;
  const still = Boolean(o.reduced);
  function frame(now) {
    if (stopped || !container.isConnected) { stopped = true; return; }
    const t = ((now - t0) % PERIOD) / PERIOD;
    // 0–0.42 contracción (sube), 0.42–0.5 pausa arriba, 0.5–1 vuelta lenta
    let s;
    if (move.run || move.bounce) s = 0.5 - 0.5 * Math.cos(t * Math.PI * 2);
    else if (t < 0.42) { const x = t / 0.42; s = x * x * (3 - 2 * x); }
    else if (t < 0.5) s = 1;
    else { const x = (t - 0.5) / 0.5; s = 1 - x * x * (3 - 2 * x); }
    pose(s, t);
    light(move.run || move.bounce ? 0.7 : s);
    raf = requestAnimationFrame(frame);
  }
  if (o.at != null) { pose(o.at, 0.25); light(o.at); }
  else if (still) { pose(1, 0); light(1); } else raf = requestAnimationFrame(frame);
  return { stop() { stopped = true; cancelAnimationFrame(raf); } };
}
