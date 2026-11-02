const CACHE_NAME = "nexora-inventory-v3";

const APP_ROUTES = [
  "/",
  "/produits",
  "/mouvements",
  "/rapports",
  "/parametres",
];

const APP_ICONS = [
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// INSTALLATION
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      await cache.addAll(APP_ICONS);

      // Préchargement des pages principales
      await Promise.allSettled(
        APP_ROUTES.map(async (route) => {
          const response = await fetch(route, {
            cache: "reload",
          });

          if (response.ok) {
            await cache.put(route, response);
          }
        })
      );

      await self.skipWaiting();
    })()
  );
});

// ACTIVATION
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();

      await Promise.all(
        keys
          .filter(
            (key) =>
              key.startsWith("nexora-inventory-") &&
              key !== CACHE_NAME
          )
          .map((key) => caches.delete(key))
      );

      await self.clients.claim();
    })()
  );
});

// GESTION DES REQUÊTES
self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  // NAVIGATION
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);

        try {
          const response = await fetch(request);

          if (response.ok) {
            await cache.put(url.pathname, response.clone());
          }

          return response;
        } catch {
          const cachedPage = await cache.match(url.pathname);

          if (cachedPage) return cachedPage;

          const cachedHome = await cache.match("/");

          if (cachedHome) return cachedHome;

          return new Response(
            `<!doctype html>
            <html lang="fr">
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width,initial-scale=1">
              <title>Nexora Inventory</title>
              <body style="font-family:system-ui;padding:2rem">
                <h1>Nexora Inventory</h1>
                <p>
                  Cette page n'a pas encore été mise en cache.
                  Reconnectez-vous et ouvrez-la une fois.
                </p>
              </body>
            </html>`,
            {
              status: 503,
              headers: {
                "Content-Type": "text/html; charset=utf-8",
              },
            }
          );
        }
      })()
    );

    return;
  }

  // RESSOURCES NEXT.JS ET ICÔNES
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/")
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);

        const cached = await cache.match(request);

        if (cached) return cached;

        try {
          const response = await fetch(request);

          if (response.ok) {
            await cache.put(request, response.clone());
          }

          return response;
        } catch {
          return Response.error();
        }
      })()
    );

    return;
  }

  // AUTRES RESSOURCES
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      try {
        const response = await fetch(request);

        if (response.ok) {
          await cache.put(request, response.clone());
        }

        return response;
      } catch {
        const cached = await cache.match(request);

        return cached || Response.error();
      }
    })()
  );
});