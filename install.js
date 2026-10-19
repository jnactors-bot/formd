// Instalar FORMD en la pantalla de inicio: detección de plataforma y reglas de la invitación (puro, sin DOM).
const DAY = 86400000;
export const ASK_COOLDOWN_DAYS = 14;

// 'ios-safari' | 'ios-other' | 'android-chrome' | 'android-other' | 'desktop'
export function platformOf(ua = '', maxTouchPoints = 0) {
  const u = String(ua);
  const ipad13 = /Macintosh/.test(u) && maxTouchPoints > 1; // iPadOS se hace pasar por Mac
  if (/iPhone|iPad|iPod/.test(u) || ipad13) {
    const other = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|DuckDuckGo|Instagram|FBAN|FBAV|FB_IAB|TikTok|musical_ly|BytedanceWebview|Snapchat|Line\/|LinkedInApp|Twitter|MicroMessenger|Pinterest/.test(u);
    // En los navegadores integrados (WebView) falta el token «Safari/».
    return !other && /Safari\//.test(u) ? 'ios-safari' : 'ios-other';
  }
  if (/Android/.test(u)) {
    const other = /EdgA|OPR\/|SamsungBrowser|Firefox|FBAN|FBAV|FB_IAB|Instagram|TikTok|musical_ly|Snapchat|; wv\)|Line\/|GSA\//.test(u);
    return !other && /Chrome\//.test(u) ? 'android-chrome' : 'android-other';
  }
  return 'desktop';
}

export const isIOS = (p) => p === 'ios-safari' || p === 'ios-other';
export const isAndroid = (p) => p === 'android-chrome' || p === 'android-other';

export function isStandalone(win) {
  try {
    if (win?.navigator?.standalone === true) return true;
    return Boolean(win?.matchMedia?.('(display-mode: standalone)')?.matches || win?.matchMedia?.('(display-mode: fullscreen)')?.matches);
  } catch { return false; }
}

// Guarda el evento de Chrome para ofrecer instalación con un toque. Devuelve el control.
export function captureInstallPrompt(win, onChange = () => {}) {
  let deferred = null;
  win.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; onChange(); });
  win.addEventListener('appinstalled', () => { deferred = null; onChange(true); });
  return {
    available: () => Boolean(deferred),
    async prompt() {
      if (!deferred) return 'unavailable';
      const e = deferred; deferred = null;
      try { await e.prompt(); const r = await e.userChoice; onChange(); return r?.outcome ?? 'dismissed'; } catch { onChange(); return 'dismissed'; }
    },
  };
}

// Estado de la invitación: { n: visitas a Hoy, at: fecha (ms) del último cierre/uso, fresh: recién aprobada }
export function askVisit(st) { const s = { n: 0, at: 0, fresh: false, ...(st ?? {}) }; s.n += 1; return s; }
export function askDismiss(st, now) { return { n: 0, fresh: false, ...(st ?? {}), fresh: false, at: now }; }
export function askFresh(st) { return { n: 0, at: 0, ...(st ?? {}), fresh: true }; }

export function shouldAsk(st, now, standalone, inSession = false) {
  if (standalone || inSession) return false;
  const s = { n: 0, at: 0, fresh: false, ...(st ?? {}) };
  if (s.at && now - s.at < ASK_COOLDOWN_DAYS * DAY) return false;
  return s.fresh || s.n >= 2;
}
