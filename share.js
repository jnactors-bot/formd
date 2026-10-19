// FORMD · tarjeta para compartir (Canvas 2D, sin dependencias). Genera un PNG de 1080 px de ancho fijo.
// session: { title, dateLabel?, stats: [{ label, value }], fill: {región: 0..1}, sex: 'male'|'female',
//            top?: [{ name, best }], footer?: string, tagline?: string }
// opts:    { format: 'story' (1080×1920) | 'post' (1080×1350) }
// Datos ya formateados por app.js (unidades kg/lb, idioma). No se incluye nombre, correo ni datos personales.
// Nota técnica: las redes NO ofrecen enlaces web para publicar una imagen; la vía correcta es la Web Share API con archivo
// (shareFile) y, si no existe, descargar el PNG. Facebook no tiene enlace de compartir para imágenes.

export const SHARE_URL = 'https://jnactors-bot.github.io/formd/';
const FORMATS = { story: [1080, 1920], post: [1080, 1350] };
const LIME = '#c6ff3d';

const img = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
const figCache = {};
// Figura raster (misma que bodymap.js): manifiesto + base + capas por grupo muscular.
function loadFigure(sex) {
  const pre = sex === 'female' ? 'f_' : '';
  figCache[sex] ??= fetch(`figura/${pre}manifest.json`).then((r) => (r.ok ? r.json() : Promise.reject(new Error('manifest'))))
    .then(async (m) => {
      const base = {};
      for (const v of ['front', 'back']) base[v] = await img(`figura/${m.base?.[v] ?? `${pre}base_${v}.webp`}`);
      const layers = { front: {}, back: {} }; // vista -> archivo -> { regs, img }
      for (const e of Object.values(m.regions)) {
        const f = e.layer;
        (layers[e.view][f] ??= { regs: [], img: null }).regs.push(e.region);
      }
      await Promise.all(['front', 'back'].flatMap((v) => Object.entries(layers[v]).map(async ([f, o]) => { o.img = await img('figura/' + f).catch(() => null); })));
      return { m, base, layers };
    }).catch(() => null);
  return figCache[sex];
}

// Misma curva de intensidad que bodymap.js: lo poco trabajado casi no se ve; lo muy trabajado brilla.
const opacityOf = (v) => (v >= 0.06 ? 0.2 + 0.62 * Math.min(1, v) : 0);

async function ensureFonts() {
  const fs = globalThis.document?.fonts;
  if (!fs?.load) return false;
  try { await Promise.all([fs.load('800 64px Unbounded'), fs.load('700 40px "DM Sans"'), fs.load('500 40px "DM Sans"')]); return true; } catch { return false; }
}

function fitText(ctx, text, maxW, font, size, min = 40) {
  let s = size;
  for (; s > min; s -= 4) { ctx.font = font(s); if (ctx.measureText(text).width <= maxW) break; }
  ctx.font = font(s);
  return s;
}

// Figura de reserva si fallan las imágenes: silueta simple con zonas trabajadas sin detalle.
function drawFallbackBody(ctx, cx, top, h) {
  const w = h * 0.42;
  ctx.save();
  ctx.fillStyle = '#26262a';
  ctx.beginPath(); ctx.arc(cx, top + h * 0.07, h * 0.06, 0, Math.PI * 2); ctx.fill();
  const rr = (x, y, ww, hh, r) => { ctx.beginPath(); ctx.roundRect(x, y, ww, hh, r); ctx.fill(); };
  rr(cx - w * 0.36, top + h * 0.15, w * 0.72, h * 0.34, w * 0.14);
  rr(cx - w * 0.62, top + h * 0.16, w * 0.2, h * 0.34, w * 0.1);
  rr(cx + w * 0.42, top + h * 0.16, w * 0.2, h * 0.34, w * 0.1);
  rr(cx - w * 0.34, top + h * 0.5, w * 0.3, h * 0.48, w * 0.12);
  rr(cx + w * 0.04, top + h * 0.5, w * 0.3, h * 0.48, w * 0.12);
  ctx.restore();
}

// Las imágenes base traen un fondo casi negro (no transparente): se dibuja en un lienzo aparte y se difuminan los bordes para fundirlo con el negro absoluto.
function drawFigure(ctx, F, view, fill, cx, top, h) {
  const [x, y, w, hh] = F.m.crop[view];
  const dw = Math.round(h * (w / hh));
  const off = document.createElement('canvas');
  off.width = dw; off.height = h;
  const o = off.getContext('2d');
  o.drawImage(F.base[view], x, y, w, hh, 0, 0, dw, h);
  for (const l of Object.values(F.layers[view])) {
    if (!l.img) continue;
    const op = opacityOf(Math.max(0, ...l.regs.map((r) => fill[r] ?? 0)));
    if (!op) continue;
    o.globalAlpha = op;
    o.drawImage(l.img, x, y, w, hh, 0, 0, dw, h);
  }
  o.globalAlpha = 1;
  o.globalCompositeOperation = 'destination-in';
  const feather = (horizontal) => {
    const len = horizontal ? dw : h, f = 0.1;
    const g = o.createLinearGradient(0, 0, horizontal ? dw : 0, horizontal ? 0 : h);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(f, '#000'); g.addColorStop(1 - f, '#000'); g.addColorStop(1, 'rgba(0,0,0,0)');
    o.fillStyle = g; o.fillRect(0, 0, dw, h);
    return len;
  };
  feather(true); feather(false);
  ctx.globalCompositeOperation = 'lighten'; // el fondo casi negro de la imagen no tapa el halo
  ctx.drawImage(off, Math.round(cx - dw / 2), top);
  ctx.globalCompositeOperation = 'source-over';
  return dw;
}

/** @returns {Promise<Blob>} PNG de la tarjeta. */
export async function renderShareCard(session, opts = {}) {
  const format = FORMATS[opts.format] ? opts.format : 'story';
  const [W, H] = FORMATS[format];
  const story = format === 'story';
  await ensureFonts();
  const DISP = (s, wt = 800) => `${wt} ${s}px Unbounded, system-ui, sans-serif`;
  const BODY = (s, wt = 500) => `${wt} ${s}px "DM Sans", system-ui, sans-serif`;
  const F = await loadFigure(session.sex === 'female' ? 'female' : 'male');

  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  // Halo lima muy sutil detrás del cuerpo.
  const gy = story ? 840 : 640;
  const g = ctx.createRadialGradient(W / 2, gy, 20, W / 2, gy, 640);
  g.addColorStop(0, 'rgba(198,255,61,.13)'); g.addColorStop(0.55, 'rgba(198,255,61,.04)'); g.addColorStop(1, 'rgba(198,255,61,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  ctx.textBaseline = 'alphabetic';
  // Wordmark
  const wmY = story ? 150 : 112;
  ctx.font = DISP(46); ctx.textAlign = 'left';
  const wmW = ctx.measureText('FORM').width + ctx.measureText('D').width;
  const wx = (W - wmW) / 2;
  ctx.fillStyle = '#fff'; ctx.fillText('FORM', wx, wmY);
  ctx.fillStyle = LIME; ctx.fillText('D', wx + ctx.measureText('FORM').width, wmY);

  // Título y fecha
  ctx.textAlign = 'center';
  const tY = story ? 330 : 250;
  ctx.fillStyle = '#fff';
  fitText(ctx, session.title, W - 160, (s) => DISP(s), story ? 112 : 96, 56);
  ctx.fillText(session.title, W / 2, tY);
  if (session.dateLabel) { ctx.font = BODY(36, 500); ctx.fillStyle = '#8c8c92'; ctx.fillText(session.dateLabel, W / 2, tY + 62); }

  // Cuerpo: frente y espalda lado a lado
  const figTop = story ? 440 : 330;
  const figH = story ? 740 : 640;
  if (F) {
    const gap = 40;
    const [, , fw, fh] = F.m.crop.front, [, , bw, bh] = F.m.crop.back;
    const wF = figH * fw / fh, wB = figH * bw / bh;
    const startX = (W - (wF + wB + gap)) / 2;
    drawFigure(ctx, F, 'front', session.fill ?? {}, startX + wF / 2, figTop, figH);
    drawFigure(ctx, F, 'back', session.fill ?? {}, startX + wF + gap + wB / 2, figTop, figH);
  } else {
    drawFallbackBody(ctx, W / 2 - 190, figTop, figH); drawFallbackBody(ctx, W / 2 + 190, figTop, figH);
  }

  // Estadísticas
  const sy = figTop + figH + (story ? 100 : 100);
  const stats = (session.stats ?? []).slice(0, 3);
  const colW = (W - 120) / Math.max(1, stats.length);
  stats.forEach((s, i) => {
    const cx = 60 + colW * (i + 0.5);
    ctx.fillStyle = '#9a9aa2'; ctx.font = BODY(34, 500); ctx.fillText(s.label, cx, sy);
    ctx.fillStyle = '#fff'; fitText(ctx, s.value, colW - 24, (z) => DISP(z, 800), story ? 52 : 48, 28);
    ctx.fillText(s.value, cx, sy + (story ? 80 : 72));
  });
  // Separadores finos entre estadísticas
  ctx.fillStyle = 'rgba(255,255,255,.12)';
  for (let i = 1; i < stats.length; i++) ctx.fillRect(60 + colW * i - 1, sy - 34, 2, story ? 110 : 100);

  // Ejercicios principales (solo formato Historia: hay espacio)
  let y = sy + 190;
  if (story && session.top?.length) {
    ctx.textAlign = 'left';
    for (const e of session.top.slice(0, 3)) {
      ctx.fillStyle = '#fff'; fitText(ctx, e.name, 620, (s) => BODY(s, 700), 38, 26); ctx.fillText(e.name, 90, y);
      ctx.textAlign = 'right'; ctx.fillStyle = LIME; ctx.font = BODY(36, 700); ctx.fillText(e.best ?? '', W - 90, y);
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fillRect(90, y + 24, W - 180, 2);
      y += 78;
    }
    ctx.textAlign = 'center';
  }

  // Pie
  ctx.textAlign = 'center';
  const fy = story ? H - 150 : H - 90;
  ctx.fillStyle = '#fff'; ctx.font = DISP(30, 700); ctx.fillText(session.tagline ?? 'Entrena con FORMD', W / 2, fy);
  ctx.fillStyle = LIME; ctx.font = BODY(30, 500); ctx.fillText(session.footer ?? SHARE_URL.replace('https://', ''), W / 2, fy + 48);

  return new Promise((ok, no) => cv.toBlob((b) => (b ? ok(b) : no(new Error('toBlob'))), 'image/png'));
}

export const canShareFiles = (file) => {
  try { return typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] }); } catch { return false; }
};

/** Abre la hoja de compartir del sistema (Instagram, WhatsApp, Facebook, TikTok…). Devuelve 'shared' | 'cancel' | 'unsupported'. */
export async function shareFile(blob, { filename, text, title }) {
  const file = new File([blob], filename, { type: 'image/png' });
  if (!canShareFiles(file)) return 'unsupported';
  try { await navigator.share({ files: [file], text, title }); return 'shared'; } catch (e) { return e?.name === 'AbortError' ? 'cancel' : 'unsupported'; }
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    try {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy'); ta.remove(); return ok;
    } catch { return false; }
  }
}

// Solo texto por WhatsApp (no admite imagen por enlace).
export const whatsappUrl = (text) => 'https://wa.me/?text=' + encodeURIComponent(text);
