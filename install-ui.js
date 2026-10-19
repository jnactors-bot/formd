// Pasos e ilustraciones SVG de «Pon FORMD en tu inicio» (puro: recibe la función t de i18n).
const LIME = 'var(--ac)', INK = '#f4f4f0', DIM = '#5c5c58', LINE = '#2a2a2a', PANEL = '#0f0f0f';

const ring = (x, y, w, h, r = 10) =>
  `<rect class="hl" x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/><rect class="hl pulse" x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/>`;
const svg = (inner) => `<svg class="ill" viewBox="0 0 300 172" role="img" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
const txt = (x, y, s, o = {}) => `<text x="${x}" y="${y}" font-size="${o.size ?? 12}" fill="${o.fill ?? INK}" text-anchor="${o.anchor ?? 'start'}" font-weight="${o.w ?? 500}">${s}</text>`;
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// Ícono Compartir de iOS: cuadrado abierto arriba con flecha hacia arriba.
const shareIcon = (cx, cy, color = INK, k = 1) =>
  `<g fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" transform="translate(${cx} ${cy}) scale(${k})">
    <path d="M-6 -2h-3a2 2 0 0 0 -2 2v13a2 2 0 0 0 2 2h18a2 2 0 0 0 2 -2v-13a2 2 0 0 0 -2 -2h-3"/>
    <path d="M0 -17v20M-6 -11l6 -6 6 6"/></g>`;
const dots3 = (cx, cy, color = INK) => `<g fill="${color}"><circle cx="${cx - 7}" cy="${cy}" r="2.2"/><circle cx="${cx}" cy="${cy}" r="2.2"/><circle cx="${cx + 7}" cy="${cy}" r="2.2"/></g>`;
const kebab = (cx, cy, color = INK) => `<g fill="${color}"><circle cx="${cx}" cy="${cy - 7}" r="2.2"/><circle cx="${cx}" cy="${cy}" r="2.2"/><circle cx="${cx}" cy="${cy + 7}" r="2.2"/></g>`;
const plusSq = (x, y, color = INK) => `<g fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round"><rect x="${x}" y="${y}" width="18" height="18" rx="4"/><path d="M${x + 9} ${y + 5}v8M${x + 5} ${y + 9}h8"/></g>`;
const appIcon = (x, y, s) => `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${s * 0.23}" fill="#000" stroke="${LIME}" stroke-width="1.6"/>${txt(x + s / 2, y + s / 2 + 4, 'F', { size: s * 0.42, fill: 'var(--ac)', anchor: 'middle', w: 800 })}`;
const rowBox = (y, h = 36) => `<rect x="22" y="${y}" width="256" height="${h}" rx="10" fill="#161616" stroke="${LINE}"/>`;

// Barra inferior de Safari con Compartir al centro.
const iosShare = () => svg(`
  <rect x="14" y="6" width="272" height="98" rx="14" fill="${PANEL}" stroke="${LINE}"/>
  ${txt(150, 50, 'FORMD', { size: 22, anchor: 'middle', w: 800, fill: 'var(--ac)' })}
  <rect x="70" y="66" width="160" height="6" rx="3" fill="#222"/><rect x="95" y="80" width="110" height="6" rx="3" fill="#1b1b1b"/>
  <rect x="0" y="116" width="300" height="56" fill="#080808" stroke="${LINE}"/>
  <g fill="none" stroke="${DIM}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M44 134l-7 8 7 8"/><path d="M92 134l7 8-7 8"/>
    <path d="M196 133h18a2 2 0 0 1 2 2v14h-22v-14a2 2 0 0 1 2 -2z M205 133v17"/>
    <rect x="252" y="134" width="16" height="16" rx="3"/></g>
  ${shareIcon(150, 144, LIME)}
  ${ring(122, 120, 56, 48, 14)}`);

// Hoja de compartir: «Añadir a pantalla de inicio» resaltada.
const iosAdd = (t) => svg(`
  ${rowBox(10)}${txt(40, 33, esc(t('inst.l.copy')), { fill: '#9a9a95' })}
  ${rowBox(60)}${plusSq(36, 69, LIME)}${txt(66, 83, esc(t('inst.l.addHome')), { w: 700 })}
  ${rowBox(110)}${txt(40, 133, esc(t('inst.l.markup')), { fill: '#9a9a95' })}
  ${ring(18, 56, 264, 44, 12)}`);

// Pantalla final: «Añadir» arriba a la derecha.
const iosConfirm = (t) => svg(`
  <rect x="10" y="6" width="280" height="160" rx="16" fill="${PANEL}" stroke="${LINE}"/>
  ${txt(26, 34, esc(t('inst.l.cancel')), { fill: '#9a9a95', size: 12 })}
  ${txt(150, 34, esc(t('inst.l.addTitle')), { anchor: 'middle', size: 12, w: 700 })}
  ${txt(268, 34, esc(t('inst.l.add')), { anchor: 'end', size: 13, w: 800, fill: 'var(--ac)' })}
  <line x1="10" y1="48" x2="290" y2="48" stroke="${LINE}"/>
  ${appIcon(28, 66, 52)}
  <rect x="96" y="70" width="170" height="44" rx="10" fill="#161616" stroke="${LINE}"/>
  ${txt(110, 98, 'FORMD', { size: 15, w: 700 })}
  <rect x="28" y="130" width="238" height="6" rx="3" fill="#222"/>
  ${ring(222, 14, 62, 30, 10)}`);

// Menú genérico de lista (iOS compartir / Android ⋮): fila 2 resaltada.
const menu = (labels, hi, opts = {}) => {
  const y0 = opts.y0 ?? 22, h = opts.h ?? 38, gap = 6, x = opts.x ?? 40, w = opts.w ?? 220;
  return labels.map((l, i) => {
    const y = y0 + i * (h + gap);
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#161616" stroke="${LINE}"/>${txt(x + 16, y + 24, esc(l), { fill: i === hi ? INK : '#9a9a95', w: i === hi ? 700 : 500 })}`;
  }).join('') + ring(x - 4, y0 + hi * (h + gap) - 4, w + 8, h + 8, 13);
};

const iosSafari = (t) => svg(`
  <rect x="0" y="10" width="300" height="162" rx="18" fill="${PANEL}" stroke="${LINE}"/>
  ${txt(20, 36, esc(t('inst.l.openIn')), { size: 11, fill: '#7d7d78' })}
  ${menu([t('inst.l.copyLink'), t('inst.l.openSafari'), t('inst.l.share')], 1, { y0: 50, x: 20, w: 260, h: 34 })}
  `);

const andMenu = (t) => svg(`
  <rect x="10" y="6" width="280" height="40" rx="20" fill="${PANEL}" stroke="${LINE}"/>
  ${txt(34, 31, 'formd', { fill: '#9a9a95', size: 12 })}
  ${kebab(268, 26, LIME)}
  ${ring(250, 10, 32, 32, 16)}
  <path d="M258 60l8 -8 8 8" fill="none" stroke="${LIME}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity=".0"/>
  <rect x="60" y="64" width="230" height="100" rx="14" fill="#0b0b0b" stroke="${LINE}" opacity=".55"/>
  ${txt(80, 92, esc(t('inst.l.newTab')), { fill: '#555' })}${txt(80, 124, esc(t('inst.l.share')), { fill: '#555' })}`);

const andInstall = (t) => svg(`
  <rect x="62" y="6" width="226" height="48" rx="12" fill="#0b0b0b" stroke="${LINE}" opacity=".5"/>
  ${txt(80, 36, esc(t('inst.l.newTab')), { fill: '#555' })}
  <rect x="62" y="62" width="226" height="48" rx="12" fill="#161616" stroke="${LINE}"/>
  <g fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="76" y="76" width="18" height="20" rx="4"/><path d="M85 80v8m-4 -3l4 4 4 -4"/></g>
  ${txt(104, 92, esc(t('inst.l.installApp')), { w: 700 })}
  <rect x="62" y="118" width="226" height="48" rx="12" fill="#0b0b0b" stroke="${LINE}" opacity=".5"/>
  ${txt(80, 148, esc(t('inst.l.share')), { fill: '#555' })}
  ${ring(58, 58, 234, 56, 14)}`);

const andConfirm = (t) => svg(`
  <rect x="30" y="10" width="240" height="152" rx="22" fill="${PANEL}" stroke="${LINE}"/>
  ${appIcon(50, 28, 44)}
  ${txt(106, 48, esc(t('inst.l.installApp')), { w: 700, size: 14 })}
  ${txt(106, 68, 'FORMD', { fill: '#9a9a95', size: 12 })}
  ${txt(168, 138, esc(t('inst.l.cancel')), { anchor: 'end', fill: '#9a9a95' })}
  <rect x="184" y="116" width="72" height="34" rx="17" fill="var(--ac)"/>
  ${txt(220, 138, esc(t('inst.l.install')), { anchor: 'middle', fill: '#000', w: 800, size: 13 })}
  ${ring(178, 110, 84, 46, 23)}`);

const andChromeOpen = (t) => svg(`
  <rect x="10" y="6" width="280" height="40" rx="20" fill="${PANEL}" stroke="${LINE}"/>
  ${txt(34, 31, 'formd', { fill: '#9a9a95', size: 12 })}${kebab(268, 26, INK)}
  ${menu([t('inst.l.newTab'), t('inst.l.openChrome'), t('inst.l.share')], 1, { y0: 58, x: 40, w: 220, h: 32 })}`);

export function installSteps(platform, t) {
  const S = (k, svgStr) => ({ title: t('inst.' + k), hint: t('inst.' + k + 'H'), svg: svgStr });
  const ios = [S('ios1', iosShare()), S('ios2', iosAdd(t)), S('ios3', iosConfirm(t))];
  const and = [S('and1', andMenu(t)), S('and2', andInstall(t)), S('and3', andConfirm(t))];
  if (platform === 'ios-safari') return ios;
  if (platform === 'ios-other') return [S('safari', iosSafari(t)), ...ios];
  if (platform === 'android-chrome') return and;
  if (platform === 'android-other') return [S('chrome', andChromeOpen(t)), ...and];
  return [];
}
