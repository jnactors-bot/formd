// Red primero, caché de respaldo: las actualizaciones llegan y la app abre sin conexión en el gimnasio.
const CACHE = "formd-v28";
const SHELL = ["./", "index.html", "styles.css", "app.js", "engine.js", "store.js", "i18n.js", "bodymap.js", "bodydata.js", "anim.js", "exmap.js", "warmup.js", "privacidad.html", "terminos.html", "creditos.html", "catalog.js", "config.js", "manifest.webmanifest", "icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    // no-cache: revalida siempre, para no mezclar archivos nuevos con otros viejos guardados por el navegador.
    fetch(e.request, { cache: "no-cache" })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("index.html")))
  );
});

// ---------- Avisos en segundo plano (intento: solo Chrome en Android con la app instalada) ----------
async function readCfg() {
  try { const c = await caches.open("formd-cfg"); const r = await c.match("cfg.json"); return r ? await r.json() : null; } catch (_) { return null; }
}

function localDate(d) {
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

async function remindIfDue() {
  const cfg = await readCfg();
  if (!cfg || !cfg.app) return;
  const now = new Date();
  const today = localDate(now);
  const [h, m] = String(cfg.time || "18:00").split(":").map(Number);
  if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return;
  const split = cfg.plan && cfg.plan[today];
  if (!split || (cfg.done || []).indexOf(today) >= 0 || (cfg.skips || []).indexOf(today) >= 0) return;
  if (cfg.shown === today) return;
  cfg.shown = today;
  const c = await caches.open("formd-cfg");
  await c.put("cfg.json", new Response(JSON.stringify(cfg), { headers: { "content-type": "application/json" } }));
  await self.registration.showNotification("FORMD", { body: (cfg.lang === "en" ? "Today: " : "Hoy toca ") + split + ".", icon: "icon-192.png", tag: "formd-today" });
}

self.addEventListener("periodicsync", (e) => {
  if (e.tag === "formd-reminder") e.waitUntil(remindIfDue());
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window" }).then((cs) => (cs.length ? cs[0].focus() : self.clients.openWindow("./"))));
});
