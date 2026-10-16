// Cuerpo humano realista por zonas (frente y espalda, hombre o mujer).
// Ilustración muscular: OpenStax / Tomáš Kebert, Wikimedia Commons, CC BY-SA 4.0 (adaptada).
// Las figuras se cargan bajo demanda (bodydata.js pesa ~320 KB); mientras tanto se dibuja un espacio vacío.
let BODY = null;
let loading = null;
const injected = new Set();

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
  let out = '';
  for (const view of ['front', 'back']) {
    const d = BODY[sex][view];
    d.paths.forEach((p, i) => {
      out += `<path id="p${sex[0]}${view[0]}${i}" d="${p[1]}" vector-effect="non-scaling-stroke"/>`;
    });
    for (const [code, z] of Object.entries(d.zones)) {
      if (z.c) out += `<clipPath id="c${sex[0]}${view[0]}-${code}"><path d="${z.c}"/></clipPath>`;
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
const opacityOf = (v) => (v >= 0.06 ? (0.22 + 0.78 * Math.min(1, v)).toFixed(2) : '0');

/**
 * @param {'front'|'back'} view
 * @param {Record<string, number>} fill  zona → 0..1
 * @param {{sex?: 'male'|'female', accent?: string, label?: string, now?: Set<string>}} opts
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
  d.paths.forEach((p, i) => { base += `<use href="#p${k}${i}" class="k${p[0]}"/>`; });
  let hi = '';
  for (const [code, z] of Object.entries(d.zones)) {
    const clip = z.c ? ` clip-path="url(#c${k}-${code})"` : '';
    const uses = z.p.map((i) => `<use href="#p${k}${i}"/>`).join('');
    const isNow = opts.now?.has?.(code);
    const op = isNow ? Math.max(Number(opacityOf(fill[code] ?? 0)), 0.14) : opacityOf(fill[code] ?? 0);
    hi += `<g class="z${isNow ? ' now' : ''}" data-region="${code}" style="opacity:${op}"${clip}>${uses}</g>`;
  }
  const [x, y, w, h] = d.vb;
  return `<svg class="body" viewBox="${x} ${y} ${w} ${h}" role="img" aria-label="${label}" style="--accent:${accent}">
    <g class="base">${base}</g><g class="hi">${hi}</g></svg>`;
}

/** Actualiza la intensidad de cada zona en un SVG ya dibujado (la transición CSS anima el cambio). */
export function applyFill(root, fill) {
  for (const el of root.querySelectorAll('.z[data-region]')) {
    const op = Number(opacityOf(fill[el.dataset.region] ?? 0));
    el.style.opacity = el.classList.contains('now') ? Math.max(op, 0.14) : op;
  }
}
