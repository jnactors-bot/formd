// Cuerpo por zonas (frente y espalda). Cada zona del catálogo se pinta según su relleno 0–1.
// Formas: [x, y, ancho, alto, radio]; `mirror` repite la forma del otro lado del cuerpo.
const VB_W = 200;
const mx = (x, w) => VB_W - x - w;

const FRONT = {
  chest_clavicular: { shapes: [[71, 62, 27, 10, 5]], mirror: true },
  chest_sternal: { shapes: [[70, 74, 28, 12, 5]], mirror: true },
  chest_costal: { shapes: [[72, 88, 26, 10, 5]], mirror: true },
  delt_anterior: { shapes: [[52, 62, 20, 20, 10]], mirror: true },
  delt_lateral: { shapes: [[40, 66, 12, 26, 6]], mirror: true },
  biceps_long: { shapes: [[40, 94, 7, 26, 3]], mirror: true },
  biceps_short: { shapes: [[47, 94, 7, 26, 3]], mirror: true },
  brachialis: { shapes: [[41, 121, 12, 10, 4]], mirror: true },
  forearms: { shapes: [[36, 134, 16, 44, 7]], mirror: true },
  abs_upper: { shapes: [[86, 100, 28, 22, 5]], mirror: false },
  abs_lower: { shapes: [[86, 124, 28, 22, 5]], mirror: false },
  obliques: { shapes: [[72, 102, 12, 40, 5]], mirror: true },
  quads: { shapes: [[68, 158, 22, 86, 9]], mirror: true },
  adductors: { shapes: [[91, 162, 8, 66, 4]], mirror: true },
  calves: { shapes: [[72, 252, 20, 70, 9]], mirror: true },
};

const BACK = {
  traps_upper: { shapes: [[84, 50, 32, 14, 6]], mirror: false },
  rhomboids: { shapes: [[82, 66, 36, 16, 5]], mirror: false },
  traps_mid: { shapes: [[85, 84, 30, 24, 5]], mirror: false },
  delt_posterior: { shapes: [[52, 62, 20, 20, 10]], mirror: true },
  lats: { shapes: [[68, 90, 18, 44, 8]], mirror: true },
  lower_back: { shapes: [[88, 136, 24, 20, 5]], mirror: false },
  triceps_long: { shapes: [[40, 92, 7, 28, 3]], mirror: true },
  triceps_lateral: { shapes: [[47, 92, 7, 28, 3]], mirror: true },
  triceps_medial: { shapes: [[42, 121, 10, 11, 4]], mirror: true },
  forearms: { shapes: [[36, 134, 16, 44, 7]], mirror: true },
  glutes: { shapes: [[72, 152, 26, 28, 10]], mirror: true },
  hamstrings: { shapes: [[70, 184, 28, 62, 9]], mirror: true },
  calves: { shapes: [[72, 252, 24, 70, 9]], mirror: true },
};

// Silueta de fondo (cabeza, torso, brazos, piernas).
const SILHOUETTE = [
  '<circle cx="100" cy="30" r="16"/>',
  '<rect x="92" y="44" width="16" height="12" rx="4"/>',
  '<rect x="66" y="56" width="68" height="96" rx="14"/>',
  '<rect x="34" y="62" width="22" height="118" rx="11"/>',
  '<rect x="144" y="62" width="22" height="118" rx="11"/>',
  '<rect x="66" y="148" width="68" height="30" rx="12"/>',
  '<rect x="66" y="156" width="32" height="170" rx="14"/>',
  '<rect x="102" y="156" width="32" height="170" rx="14"/>',
];

export const REGIONS_FRONT = Object.keys(FRONT);
export const REGIONS_BACK = Object.keys(BACK);

export function viewOfRegion(code) {
  if (code in FRONT && !(code in BACK)) return 'front';
  if (code in BACK && !(code in FRONT)) return 'back';
  return 'front';
}

function rect([x, y, w, h, r], attrs) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ${attrs}/>`;
}

/**
 * @param {'front'|'back'} view
 * @param {Record<string, number>} fill  zona → 0..1
 * @param {{accent?: string, interactive?: boolean, label?: string}} opts
 */
export function bodySVG(view, fill = {}, opts = {}) {
  const defs = view === 'back' ? BACK : FRONT;
  const accent = opts.accent ?? '#C6FF3D';
  const parts = [];
  for (const [code, def] of Object.entries(defs)) {
    const v = Math.max(0, Math.min(1, fill[code] ?? 0));
    const color = v > 0 ? accent : '#34342f';
    const opacity = v > 0 ? (0.25 + 0.75 * v).toFixed(2) : '1';
    const attrs = `fill="${color}" fill-opacity="${opacity}" stroke="#0A0A0A" stroke-width="1.5" data-region="${code}" ${opts.interactive ? 'tabindex="0" role="button"' : ''}`;
    for (const s of def.shapes) {
      parts.push(rect(s, attrs));
      if (def.mirror) parts.push(rect([mx(s[0], s[2]), s[1], s[2], s[3], s[4]], attrs));
    }
  }
  const label = opts.label ?? (view === 'back' ? 'Cuerpo, vista de espalda' : 'Cuerpo, vista frontal');
  return `<svg class="body" viewBox="0 0 200 340" role="img" aria-label="${label}">
    <g fill="#1d1d1b" stroke="#2a2a27" stroke-width="1.5">${SILHOUETTE.join('')}</g>
    <g>${parts.join('')}</g>
  </svg>`;
}
