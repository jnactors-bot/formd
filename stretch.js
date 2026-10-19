// Vuelta a la calma según lo que trabajaste. Módulo puro (sin DOM). Fotos: free-exercise-db (Unlicense), copia local ex/w_st_<key>_<0|1>.jpg.
import { BY_CODE } from './engine.js';

const C = ['chest_clavicular', 'chest_sternal', 'chest_costal'];
const TRI = ['triceps_long', 'triceps_lateral', 'triceps_medial'];
const BIC = ['biceps_long', 'biceps_short', 'brachialis'];
// ord: orden de arriba hacia abajo. secs: tiempo total (si side, se reparte entre los dos lados).
const S = (key, ord, es, en, regions, secs, side, cue, remote) => ({ key, ord, es, en, regions, secs, side, cue, remote });

export const STRETCHES = [
  S('neck_side', 1, 'Cuello lateral', 'Side neck stretch', ['traps_upper'], 40, true,
    { es: 'Hombros abajo, inclina la oreja hacia el hombro; la mano solo apoya, sin tirar.', en: 'Shoulders down, tilt your ear toward the shoulder; hand just rests, no pulling.' }, 'Side_Neck_Stretch'),
  S('neck_flex', 1.5, 'Cuello y trapecio', 'Neck and upper trap', ['traps_upper', 'traps_mid'], 30, false,
    { es: 'Manos tras la cabeza, deja caer la barbilla al pecho sin forzar.', en: 'Hands behind the head, let the chin drop to the chest without forcing.' }, 'Chin_To_Chest_Stretch'),
  S('shoulder_cross', 2, 'Hombro cruzado', 'Cross-body shoulder', ['delt_posterior', 'delt_lateral'], 50, true,
    { es: 'Cruza el brazo por delante del pecho y acércalo con la otra mano.', en: 'Bring the arm across the chest and hold it in with the other hand.' }, 'Shoulder_Stretch'),
  S('chest', 3, 'Pecho y hombro', 'Chest and shoulder', [...C, 'delt_anterior'], 30, false,
    { es: 'Brazos atrás a la altura del hombro, abre el pecho y respira lento.', en: 'Arms back at shoulder height, open the chest and breathe slowly.' }, 'Chest_And_Front_Of_Shoulder_Stretch'),
  S('biceps', 4, 'Bíceps', 'Biceps stretch', [...BIC, 'chest_clavicular', 'delt_anterior'], 30, false,
    { es: 'Manos entrelazadas atrás, brazos estirados; sube las manos sin arquear la espalda.', en: 'Hands clasped behind, arms straight; lift them without arching the back.' }, 'Standing_Biceps_Stretch'),
  S('triceps', 5, 'Tríceps', 'Triceps stretch', [...TRI, 'lats'], 50, true,
    { es: 'Codo arriba y mano a la espalda; empuja suave el codo con la otra mano.', en: 'Elbow up, hand down your back; gently press the elbow with the other hand.' }, 'Triceps_Stretch'),
  S('forearm', 6, 'Antebrazos', 'Forearm stretch', ['forearms'], 30, false,
    { es: 'Manos apoyadas con dedos hacia las rodillas; lleva el peso atrás despacio.', en: 'Hands down, fingers toward the knees; shift your weight back slowly.' }, 'Kneeling_Forearm_Stretch'),
  S('upper_back', 7, 'Espalda alta', 'Upper back stretch', ['rhomboids', 'traps_mid'], 30, false,
    { es: 'Sentado, redondea la espalda alta hacia delante y deja caer la cabeza.', en: 'Seated, round the upper back forward and let the head drop.' }, 'Chair_Upper_Body_Stretch'),
  S('lat_side', 8, 'Dorsal lateral', 'Lat side stretch', ['lats', 'obliques'], 50, true,
    { es: 'Brazo arriba, inclínate hacia el lado contrario sin girar el torso.', en: 'Arm overhead, lean to the other side without twisting.' }, 'Chair_Lower_Back_Stretch'),
  S('childs', 8.5, 'Postura del niño', "Child's pose", ['lats', 'lower_back'], 30, false,
    { es: 'Siéntate sobre los talones y estira los brazos al frente; respira hacia la espalda.', en: 'Sit back on your heels and reach forward; breathe into your back.' }, 'Childs_Pose'),
  S('abs_up', 9, 'Abdomen alto', 'Overhead reach', ['abs_upper', 'abs_lower'], 30, false,
    { es: 'Brazos arriba, estírate largo y abre las costillas al inspirar.', en: 'Reach up long and open the ribs as you inhale.' }, 'Overhead_Stretch'),
  S('abs_side', 9.5, 'Oblicuos', 'Side bend', ['obliques', 'lats'], 50, true,
    { es: 'Brazo sobre la cabeza e inclínate de lado; caderas quietas.', en: 'Arm over your head and lean sideways; keep the hips still.' }, 'Standing_Lateral_Stretch'),
  S('cat', 10, 'Gato-camello', 'Cat stretch', ['lower_back', 'traps_mid', 'rhomboids'], 30, false,
    { es: 'En cuatro apoyos, redondea la espalda y suelta la cabeza; respira lento.', en: 'On all fours, round the back and drop the head; breathe slowly.' }, 'Cat_Stretch'),
  S('spinal_twist', 10.5, 'Giro de columna', 'Spinal twist', ['obliques', 'lower_back', 'rhomboids'], 50, true,
    { es: 'Sentado, gira el torso agarrando el respaldo o la rodilla; columna larga.', en: 'Seated, rotate the torso holding the chair or knee; keep the spine long.' }, 'Spinal_Stretch'),
  S('knees_chest', 10.8, 'Rodillas al pecho', 'Knees to chest', ['lower_back', 'glutes'], 30, false,
    { es: 'Tumbado, abraza las rodillas y relaja la espalda baja en el suelo.', en: 'Lying down, hug your knees and let the lower back relax on the floor.' }, 'Hug_Knees_To_Chest'),
  S('hip_flexor', 11, 'Flexores de cadera', 'Hip flexor stretch', ['hip_flexors', 'quads'], 50, true,
    { es: 'Rodilla atrás en el suelo, pelvis metida y cadera hacia delante.', en: 'Back knee down, tuck the pelvis and press the hips forward.' }, 'Kneeling_Hip_Flexor'),
  S('glute_fig4', 12, 'Glúteo y piriforme', 'Glute and piriformis', ['glutes'], 50, true,
    { es: 'Tumbado, tobillo sobre la rodilla contraria y atrae la pierna hacia el pecho.', en: 'Lying, ankle over the opposite knee; pull the leg toward the chest.' }, 'Ankle_On_The_Knee'),
  S('glute_knee', 12.5, 'Glúteo cruzado', 'Cross-body glute', ['glutes', 'lower_back'], 50, true,
    { es: 'Tumbado, lleva la rodilla cruzada hacia el lado contrario; hombros en el suelo.', en: 'Lying, draw the knee across the body; keep the shoulders down.' }, 'Knee_Across_The_Body'),
  S('straddle', 13, 'Aductores en V', 'Straddle stretch', ['adductors', 'hamstrings'], 30, false,
    { es: 'Piernas abiertas sentado, camina las manos al frente con la espalda larga.', en: 'Seated with legs wide, walk the hands forward keeping the back long.' }, 'The_Straddle'),
  S('quad_lying', 14, 'Cuádriceps', 'Quad stretch', ['quads'], 50, true,
    { es: 'Talón al glúteo, rodillas juntas y cadera hacia delante.', en: 'Heel to glute, knees together, hips forward.' }, 'Quad_Stretch'),
  S('quad_lunge', 14.5, 'Cuádriceps en estocada', 'Lunge quad stretch', ['quads', 'hip_flexors'], 50, true,
    { es: 'Pie de atrás apoyado en un banco, baja la cadera y mantén el torso erguido.', en: 'Back foot on a bench, sink the hips and keep the torso upright.' }, 'Standing_Elevated_Quad_Stretch'),
  S('hamstring', 15, 'Isquiotibiales', 'Hamstring stretch', ['hamstrings'], 50, true,
    { es: 'Tumbado, pierna estirada hacia ti con una banda o toalla; espalda baja relajada.', en: 'Lying, straight leg toward you with a band or towel; lower back relaxed.' }, 'Hamstring_Stretch'),
  S('ham_seated', 15.5, 'Isquios sentado', 'Seated hamstring', ['hamstrings', 'calves', 'lower_back'], 50, true,
    { es: 'Sentado, pierna estirada; inclínate desde la cadera hacia el pie.', en: 'Seated, one leg straight; hinge from the hips toward the foot.' }, 'Seated_Floor_Hamstring_Stretch'),
  S('calf_wall', 16, 'Pantorrillas', 'Calf stretch', ['calves'], 50, true,
    { es: 'Manos en la pared, pierna de atrás recta y talón pegado al suelo.', en: 'Hands on the wall, back leg straight and heel on the floor.' }, 'Calf_Stretch_Hands_Against_Wall'),
];

export const STRETCH_BY_KEY = new Map(STRETCHES.map((s) => [s.key, s]));
export const stretchRemote = (s, i) => `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/${s.remote}/${i}.jpg`;

// Evidencia (mismo formato que EVIDENCE de engine.js). Honesta: no promete prevenir agujetas.
export const STRETCH_EVIDENCE = {
  dose: { level: 'A', es: 'Para ganar movilidad, el estiramiento estático funciona: unos 30 s por músculo (hasta 2–4 repeticiones) y 90 s o más por grupo a la semana.', en: 'To gain mobility, static stretching works: about 30 s per muscle (up to 2–4 reps) and 90 s or more per muscle group each week.' },
  doms: { level: 'A', es: 'Estirar no previene de forma fiable las agujetas: la revisión Cochrane halló reducciones sin importancia clínica. Úsalo para relajarte y mantener el rango de movimiento.', en: 'Stretching does not reliably prevent soreness: the Cochrane review found clinically unimportant reductions. Use it to unwind and keep your range of motion.' },
  cooldown: { level: 'B', es: 'Una vuelta a la calma activa ayuda a bajar el pulso y relajarte, pero no hay evidencia de que prevenga lesiones ni acelere la recuperación.', en: 'An active cool-down helps settle your heart rate and relax, but there is no evidence it prevents injury or speeds recovery.' },
  muscles: { level: 'C', es: 'Elegimos los estiramientos según los músculos que trabajaste hoy (por series y peso de cada ejercicio). Es una regla práctica, no un protocolo validado.', en: 'Stretches are chosen from the muscles you trained today (by sets and each lift weighting). It is a practical rule, not a validated protocol.' },
};
export const STRETCH_EVIDENCE_TITLE = {
  dose: { es: 'Tiempo de sostén', en: 'Hold time' },
  doms: { es: 'Agujetas', en: 'Soreness' },
  cooldown: { es: 'Vuelta a la calma', en: 'Cool-down' },
  muscles: { es: 'Según tus músculos', en: 'Based on your muscles' },
};
export const STRETCH_FACTS = ['dose', 'doms', 'cooldown', 'muscles'];

const FALLBACK = ['chest', 'hamstring', 'quad_lunge', 'cat', 'calf_wall', 'shoulder_cross', 'glute_fig4'];

export function stretchCount(minutes) {
  const m = Math.round(Number(minutes) || 0);
  return m <= 2 ? 3 : m === 3 ? 4 : m === 4 ? 5 : m <= 6 ? 6 : 7;
}

// Carga por región: series hechas × peso del ejercicio. Sin series hechas, usa las del plan.
export function regionLoad(plan, sets) {
  const load = {};
  const add = (code, n) => {
    const ex = BY_CODE.get(code);
    if (!ex || ex.kind === 'cardio' || !ex.weights) return;
    for (const [r, w] of Object.entries(ex.weights)) load[r] = (load[r] || 0) + n * w;
  };
  const done = (sets ?? []).filter((x) => (x.reps || 0) > 0 || (x.duracion_s || 0) > 0);
  if (done.length) for (const x of done) add(x.ejercicio_code, 1);
  else for (const b of plan?.blocks ?? []) if (b.type === 'exercise') add(b.code, b.sets || 1);
  const hf = Math.max(load.quads || 0, (load.glutes || 0) * 0.8) * 0.5;
  if (hf > 0) load.hip_flexors = hf;
  return load;
}

export function cooldownFor(plan, sets, minutes) {
  const n = stretchCount(minutes ?? plan?.blocks?.find((b) => b.type === 'cooldown')?.minutes);
  const left = regionLoad(plan, sets);
  const chosen = [];
  const min = Math.max(...Object.values(left), 0) * 0.25;
  while (chosen.length < n) {
    let best = null, bestGain = 0;
    for (const s of STRETCHES) {
      if (chosen.includes(s)) continue;
      const gain = s.regions.reduce((a, r, i) => a + (left[r] || 0) * (i === 0 ? 1 : 0.5), 0);
      if (gain > bestGain + 1e-9 && gain >= (chosen.length < Math.min(n, 4) ? 0 : min)) { best = s; bestGain = gain; }
    }
    if (!best) break;
    chosen.push(best);
    best.regions.forEach((r, i) => { left[r] = i === 0 ? 0 : left[r] * 0.4; });
  }
  for (const k of FALLBACK) {
    if (chosen.length >= Math.min(n, 3)) break;
    const s = STRETCH_BY_KEY.get(k);
    if (!chosen.includes(s)) chosen.push(s);
  }
  return chosen.sort((a, b) => a.ord - b.ord);
}

// Etiqueta: región de mayor carga dentro del grupo principal del estiramiento (mismo prefijo que la primera).
export function targetRegion(s, load) {
  const pre = s.regions[0].split('_')[0];
  const own = s.regions.filter((r) => r.split('_')[0] === pre);
  return own.slice().sort((a, b) => (load[b] || 0) - (load[a] || 0))[0];
}
