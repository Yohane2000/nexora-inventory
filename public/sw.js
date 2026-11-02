const CACHE_NAME = "nexora-inventory-v2";

const APP_ASSETS = [
"/",
"/produits",
"/mouvements",
"/rapports",
"/parametres",
"/icons/icon-192.png",
"/icons/icon-512.png",
];

// INSTALLATION
self.addEventListener("install", (event) => {
event.waitUntil(
caches.open(CACHE_NAME).then(async (cache) => {
await cache.addAll([
"/icons/icon-192.png",
"/icons/icon-512.png",
]);
})
);

self.skipWaiting();
});

// ACTIVATION
self.addEventListener("activate", (event) => {
event.waitUntil(
caches.keys().then(async (keys) => {
await Promise.all(
keys
.filter((key) => key !== CACHE_NAME)
.map((key) => caches.delete(key))
);


  await self.clients.claim();
})


);
});

// GESTION DES REQUÊTES
self.addEventListener("fetch", (event) => {
const request = event.request;

if (request.method !== "GET") return;

const url = new URL(request.url);

if (url.origin !== self.location.origin) return;

// Pages HTML
if (request.mode === "navigate") {
event.respondWith(
fetch(request)
.then(async (response) => {
if (response.ok) {
const cache = await caches.open(CACHE_NAME);
await cache.put(request, response.clone());
}


      return response;
    })
    .catch(async () => {
      const cache = await caches.open(CACHE_NAME);

      const cachedPage = await cache.match(request);

      if (cachedPage) return cachedPage;

      const cachedHome = await cache.match("/");

      if (cachedHome) return cachedHome;

      return new Response(
        "Nexora Inventory : page indisponible hors connexion.",
        {
          status: 503,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
          },
        }
      );
    })
);

return;


}

// Ressources statiques
if (
url.pathname.startsWith("/_next/static/") ||
url.pathname.startsWith("/icons/")
) {
event.respondWith(
caches.match(request).then(async (cached) => {
if (cached) return cached;


    try {
      const response = await fetch(request);

      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }

      return response;
    } catch {
      return Response.error();
    }
  })
);


}
});
