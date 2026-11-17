const CACHE = "fruit-wars-v36-ability-fixes";
const ASSETS = ["./", "index.html", "orchard.html", "signal.html", "match.html", "lobby.js", "public-lobby.js", "lobby-config.js", "editions.css", "board-ui.css", "board-ui.js", "controls.js", "production-cycle.js",
  "manifest.webmanifest", "icon-192.png", "icon-512.png"].map(path => new URL(path, self.registration.scope).href);

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(url => new Request(url, { cache: "reload" })))));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith("fruit-wars-") && key !== CACHE)
    .map(key => caches.delete(key)))));
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  url.search = "";
  if (event.request.method !== "GET" || !ASSETS.includes(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(new Request(event.request, { cache: "no-cache" }));
      if (response.ok) await cache.put(url.href, response.clone());
      return response;
    } catch {
      return (await cache.match(url.href)) || Response.error();
    }
  })());
});
