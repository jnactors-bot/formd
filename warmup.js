// Movimientos de calentamiento y vuelta a la calma. Fotos: free-exercise-db (Unlicense), copia local en ex/w_<key>_<0|1>.jpg.
const R = (folder) => folder;
export const WARMUPS = [
  { key: 'arm_circles', es: 'Círculos de brazos', en: 'Arm circles', secs: 30, group: 'shoulder', cue: { es: 'Brazos abiertos, círculos amplios; mitad hacia delante, mitad hacia atrás.', en: 'Arms out, big circles; half forward, half backward.' }, remote: R('Arm_Circles') },
  { key: 'shoulder_circles', es: 'Círculos de hombros', en: 'Shoulder circles', secs: 25, group: 'shoulder', cue: { es: 'Sube, lleva atrás y baja los hombros, lento y amplio.', en: 'Lift, roll back and drop the shoulders, slow and wide.' }, remote: R('Shoulder_Circles') },
  { key: 'torso_rot', es: 'Rotación de torso', en: 'Torso rotation', secs: 30, group: 'torso', cue: { es: 'Pies firmes, gira desde el torso y deja que la mirada acompañe.', en: 'Feet planted, rotate from the torso and let your gaze follow.' }, remote: R('Torso_Rotation') },
  { key: 'dyn_chest', es: 'Apertura dinámica de pecho', en: 'Dynamic chest opener', secs: 25, group: 'chest', cue: { es: 'Abre los brazos atrás juntando escápulas; vuelve y abraza.', en: 'Open arms back squeezing the shoulder blades; return and hug.' }, remote: R('Dynamic_Chest_Stretch') },
  { key: 'hip_circles', es: 'Círculos de cadera', en: 'Hip circles', secs: 30, group: 'hip', cue: { es: 'Manos en la cintura, círculos grandes de cadera, sin mover los pies.', en: 'Hands on waist, big hip circles, feet still.' }, remote: R('Standing_Hip_Circles') },
  { key: 'leg_swing', es: 'Balanceo de pierna', en: 'Leg swings', secs: 30, group: 'leg', cue: { es: 'Apóyate si hace falta y balancea la pierna adelante y atrás, controlado.', en: 'Hold on if needed and swing the leg forward and back, controlled.' }, remote: R('Front_Leg_Raises') },
  { key: 'worlds_greatest', es: 'Estocada con rotación', en: 'Lunge with rotation', secs: 40, group: 'hip', cue: { es: 'Estocada larga, baja el codo hacia el pie y abre el brazo al techo.', en: 'Long lunge, elbow toward the foot, then open the arm to the ceiling.' }, remote: R('Worlds_Greatest_Stretch') },
  { key: 'knees_chest', es: 'Rodillas al pecho', en: 'Knees to chest', secs: 25, group: 'hip', cue: { es: 'Tumbado, abraza una rodilla y alterna; espalda baja pegada al suelo.', en: 'Lying down, hug one knee and alternate; lower back on the floor.' }, remote: R('Hug_Knees_To_Chest') },
  { key: 'cat_camel', es: 'Gato-camello', en: 'Cat-camel', secs: 30, group: 'back', cue: { es: 'En cuatro apoyos, redondea y arquea la columna al ritmo de la respiración.', en: 'On all fours, round and arch the spine with your breathing.' }, remote: R('Cat_Stretch') },
  { key: 'glute_bridge', es: 'Puente de glúteo', en: 'Glute bridge', secs: 30, group: 'leg', cue: { es: 'Tumbado, sube la cadera apretando glúteos; baja lento.', en: 'Lying down, lift hips squeezing glutes; lower slowly.' }, remote: R('Pelvic_Tilt_Into_Bridge') },
  { key: 'inchworm', es: 'Gusano', en: 'Inchworm', secs: 35, group: 'upper', cue: { es: 'Camina con las manos hasta plancha y vuelve; piernas casi rectas.', en: 'Walk hands out to a plank and back; legs nearly straight.' }, remote: R('Inchworm') },
];

export const COOLDOWNS = [
  { key: 'cd_hamstring', es: 'Estirar isquiotibiales', en: 'Hamstring stretch', secs: 30, cue: { es: 'Pierna estirada hacia ti, espalda baja relajada; respira lento.', en: 'Straight leg toward you, lower back relaxed; breathe slowly.' }, remote: R('Hamstring_Stretch') },
  { key: 'cd_quad', es: 'Estirar cuádriceps', en: 'Quad stretch', secs: 30, cue: { es: 'Talón al glúteo, rodillas juntas y cadera hacia delante.', en: 'Heel to glute, knees together, hips forward.' }, remote: R('Standing_Elevated_Quad_Stretch') },
  { key: 'cd_chest', es: 'Estirar pecho y hombro', en: 'Chest and shoulder stretch', secs: 30, cue: { es: 'Brazo atrás a la altura del hombro y gira el pecho al lado contrario.', en: 'Arm back at shoulder height and turn the chest the other way.' }, remote: R('Chest_And_Front_Of_Shoulder_Stretch') },
];

const byKey = Object.fromEntries([...WARMUPS, ...COOLDOWNS].map((w) => [w.key, w]));
export const warmupRemote = (w, i) => `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/${w.remote}/${i}.jpg`;

const PLANS = {
  push: ['shoulder_circles', 'torso_rot', 'dyn_chest', 'inchworm', 'arm_circles'],
  upper: ['arm_circles', 'torso_rot', 'dyn_chest', 'inchworm', 'shoulder_circles'],
  pull: ['cat_camel', 'arm_circles', 'hip_circles', 'torso_rot', 'shoulder_circles'],
  legs: ['hip_circles', 'leg_swing', 'worlds_greatest', 'glute_bridge', 'knees_chest'],
  lower: ['hip_circles', 'leg_swing', 'worlds_greatest', 'glute_bridge', 'knees_chest'],
  cardio_easy: ['leg_swing', 'hip_circles', 'arm_circles', 'worlds_greatest', 'torso_rot'],
  cardio_interval: ['leg_swing', 'hip_circles', 'worlds_greatest', 'arm_circles', 'torso_rot'],
};

export function warmupFor(split, minutes) {
  const n = minutes >= 6 ? 5 : minutes >= 5 ? 4 : 3;
  return (PLANS[split] ?? PLANS.upper).slice(0, n).map((k) => byKey[k]);
}
export const cooldownFor = () => COOLDOWNS.slice();
