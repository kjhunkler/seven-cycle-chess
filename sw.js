const CACHE = "fruit-wars-v2";
const ASSETS = ["./", "index.html", "orchard.html", "signal.html", "online.html", "lobby.js", "lobby-config.js", "editions.css",
  "manifest.webmanifest", "icon-192.png", "icon-512.png"].map(path => new URL(path, self.registration.scope).href);

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
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
      const response = await fetch(event.request);
      if (response.ok) await cache.put(url.href, response.clone());
      return response;
    } catch {
      return (await cache.match(url.href)) || Response.error();
    }
  })());
});
