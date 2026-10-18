// Cuerpo humano realista por zonas (frente y espalda, hombre o mujer).
// Ilustración muscular: OpenStax / Tomáš Kebert, Wikimedia Commons, CC BY-SA 4.0 (adaptada).
// Las figuras se cargan bajo demanda (bodydata.js pesa ~320 KB); mientras tanto se dibuja un espacio vacío.
let BODY = null;
let loading = null;
const injected = new Set();
let gradsDone = false;

// Degradados y desenfoque compartidos: dan volumen a cada músculo (luz arriba-izquierda, sombra abajo-derecha).
function ensureGrads() {
  if (gradsDone) return '';
  gradsDone = true;
  // Sombreado cilíndrico por pieza (borde oscuro, luz al centro-izquierda): redondea cada músculo sin filtros pesados.
  const cyl = (id, s) => `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2=".25">${s.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;
  return cyl('bgm', [[0, '#b3aea3'], [.22, '#e2ded6'], [.45, '#fbfaf7'], [.7, '#dcd8ce'], [1, '#9a958a']])
    + cyl('bgt', [[0, '#cbc7bd'], [.3, '#f3f1ec'], [.55, '#fdfcf9'], [1, '#b2ada2']])
    + cyl('bgf', [[0, '#a09b90'], [.35, '#d7d3c9'], [.6, '#e6e2da'], [1, '#7d786d']])
    + cyl('bgs', [[0, '#a29d92'], [.3, '#e3dfd6'], [.5, '#f4f1eb'], [1, '#8d887d']])
    + '<filter id="bgblur" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="3"/></filter>';
}

export function loadBody() {
  if (BODY) return Promise.resolve(true);
  loading = loading ?? import('./bodydata.js').then((m) => { BODY = m.BODY; return true; }).catch(() => false);
  return loading;
}
export const bodyReady = () => Boolean(BODY);
export const getBody = () => BODY;

// Definiciones compartidas (una sola vez por sexo y vista): rutas y recortes de cada zona.
export function ensureDefs(sex) {
  if (injected.has(sex) || !BODY) return;
  injected.add(sex);
  let out = ensureGrads();
  for (const view of ['front', 'back']) {
    const d = BODY[sex][view];
    d.paths.forEach((p, i) => {
      out += `<path id="p${sex[0]}${view[0]}${i}" d="${p[1]}" vector-effect="non-scaling-stroke"/>`;
    });
    for (const [code, z] of Object.entries(d.zones)) {
      // Máscara con borde suave (en vez de un recorte recto): el color sigue la forma del músculo y se desvanece en el límite de la zona.
      if (z.c) out += `<mask id="c${sex[0]}${view[0]}-${code}" maskUnits="userSpaceOnUse" x="-200" y="-200" width="2400" height="2400"><path d="${z.c}" fill="#fff" filter="url(#bgblur)"/></mask>`;
    }
  }
  const host = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  host.setAttribute('width', '0');
  host.setAttribute('height', '0');
  host.setAttribute('aria-hidden', 'true');
  host.style.position = 'absolute';
  host.innerHTML = `<defs>${out}</defs>`;
  document.body.prepend(host);
}

export const REGIONS_FRONT = ['chest_clavicular', 'chest_sternal', 'chest_costal', 'delt_anterior', 'delt_lateral', 'biceps_long', 'biceps_short', 'brachialis', 'forearms', 'abs_upper', 'abs_lower', 'obliques', 'quads', 'adductors', 'calves'];
export const REGIONS_BACK = ['traps_upper', 'traps_mid', 'rhomboids', 'lats', 'lower_back', 'delt_posterior', 'triceps_long', 'triceps_lateral', 'triceps_medial', 'forearms', 'glutes', 'hamstrings', 'calves'];

export function viewOfRegion(code) {
  if (REGIONS_FRONT.includes(code) && !REGIONS_BACK.includes(code)) return 'front';
  if (REGIONS_BACK.includes(code) && !REGIONS_FRONT.includes(code)) return 'back';
  return 'front';
}

// Intensidad real: lo poco trabajado casi no se ve; lo muy trabajado brilla. Evita que parezca que todo se trabajó.
const opacityOf = (v) => (v >= 0.06 ? (0.2 + 0.62 * Math.min(1, v)).toFixed(2) : '0');
// Un músculo real puede abarcar varias regiones (p. ej. el pectoral): si cualquiera se trabaja, se pinta el músculo COMPLETO
// (capa base al 60 % de la intensidad máxima) y encima la región concreta, con borde suave.
const GROUPS = [
  ['chest_clavicular', 'chest_sternal', 'chest_costal'], ['delt_anterior', 'delt_lateral'], ['biceps_long', 'biceps_short', 'brachialis'],
  ['abs_upper', 'abs_lower'], ['traps_upper', 'traps_mid', 'rhomboids'], ['triceps_long', 'triceps_lateral', 'triceps_medial'],
];
const groupOp = (members, fill) => {
  const op = Number(opacityOf(Math.max(0, ...members.map((m) => fill[m] ?? 0))));
  return op ? (op * 0.6).toFixed(2) : '0';
};
const neckCache = new Map();
function isNeck(d, i) {
  const key = d.paths[i][1];
  if (!neckCache.has(key)) {
    const n = key.match(/-?[\d.]+/g).map(Number);
    let maxY = -1e9, minX = 1e9, maxX = -1e9;
    for (let j = 0; j < n.length - 1; j += 2) { minX = Math.min(minX, n[j]); maxX = Math.max(maxX, n[j]); maxY = Math.max(maxY, n[j + 1]); }
    const [x, y, w, h] = d.vb;
    neckCache.set(key, maxY < y + 0.2 * h && maxX - minX < 0.2 * w && Math.abs((minX + maxX) / 2 - (x + w / 2)) < 0.14 * w);
  }
  return neckCache.get(key);
}
const SIZES = { sm: 'sm', md: 'md', lg: 'lg' };

/**
 * @param {'front'|'back'} view
 * @param {Record<string, number>} fill  zona → 0..1
 * @param {{sex?: 'male'|'female', accent?: string, label?: string, now?: Set<string>, size?: 'sm'|'md'|'lg', glow?: boolean}} opts
 * size: sm (miniaturas, sin resplandor) · md (tarjeta, por defecto) · lg (resumen, frente y espalda grandes). Añade la clase sz-* para que el CSS dimensione.
 */
export function bodySVG(view, fill = {}, opts = {}) {
  const sex = opts.sex === 'female' ? 'female' : 'male';
  const label = opts.label ?? (view === 'back' ? 'Cuerpo, vista de espalda' : 'Cuerpo, vista frontal');
  if (!BODY) return `<svg class="body" viewBox="0 0 100 200" role="img" aria-label="${label}"></svg>`;
  ensureDefs(sex);
  const d = BODY[sex][view];
  const k = sex[0] + view[0];
  const accent = opts.accent ?? '#C6FF3D';
  let base = '';
  let lines = '';
  d.paths.forEach((p, i) => {
    const u = `<use href="#p${k}${i}" class="k${p[0]}"/>`;
    if (p[0] === 4) lines += u; else base += u; // los trazos de separación muscular van encima del color
  });
  let hi = '';
  for (const [code, z] of Object.entries(d.zones)) {
    const clip = z.c ? ` mask="url(#c${k}-${code})"` : '';
    const uses = z.p.map((i) => `<use href="#p${k}${i}"/>`).join('');
    const isNow = opts.now?.has?.(code);
    const op = isNow ? Math.max(Number(opacityOf(fill[code] ?? 0)), 0.14) : opacityOf(fill[code] ?? 0);
    hi += `<g class="z${isNow ? ' now' : ''}" data-region="${code}" data-on="${Number(op) > 0 ? 1 : 0}" style="opacity:${op}"${clip}>${uses}</g>`;
  }
  const [x, y, w, h] = d.vb;
  let grp = '';
  for (const members of GROUPS) {
    const ms = members.filter((m) => d.zones[m]);
    if (ms.length < 2) continue;
    let idx = [...new Set(ms.flatMap((m) => d.zones[m].p))];
    if (ms.includes('chest_clavicular')) idx = idx.filter((i) => !isNeck(d, i)); // el cuello no es pectoral
    const op = groupOp(ms, fill);
    grp += `<g class="zg" data-members="${ms.join(' ')}" data-on="${Number(op) > 0 ? 1 : 0}" style="opacity:${op}">${idx.map((i) => `<use href="#p${k}${i}"/>`).join('')}</g>`;
  }
  const size = SIZES[opts.size] ?? 'md';
  const glow = opts.glow ?? size !== 'sm';
  return `<svg class="body sz-${size}${glow ? ' glow' : ''}" viewBox="${x} ${y} ${w} ${h}" role="img" aria-label="${label}" style="--accent:${accent}">
    <g class="base">${base}</g><g class="hi">${grp}${hi}</g><g class="ln">${lines}</g></svg>`;
}

/** Actualiza la intensidad de cada zona en un SVG ya dibujado (la transición CSS anima el cambio). */
export function applyFill(root, fill) {
  for (const el of root.querySelectorAll('.zg[data-members]')) {
    const op = Number(groupOp(el.dataset.members.split(' '), fill));
    el.dataset.on = op > 0 ? '1' : '0';
    el.style.opacity = op;
  }
  for (const el of root.querySelectorAll('.z[data-region]')) {
    const op = Number(opacityOf(fill[el.dataset.region] ?? 0));
    const v = el.classList.contains('now') ? Math.max(op, 0.14) : op;
    el.dataset.on = v > 0 ? '1' : '0';
    el.style.opacity = v;
  }
}
