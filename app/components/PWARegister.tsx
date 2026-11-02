"use client";

import { useEffect } from "react";

export default function PWARegister() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    let refreshing = false;

    const handleControllerChange = () => {
      if (refreshing) return;

      refreshing = true;

      window.location.reload();
    };

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      handleControllerChange
    );

    async function registerServiceWorker() {
      try {
        const registration =
          await navigator.serviceWorker.register("/sw.js", {
            scope: "/",
            updateViaCache: "none",
          });

        console.info(
          "Nexora Inventory : Service Worker enregistré."
        );

        await registration.update();

        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;

          if (!worker) return;

          worker.addEventListener("statechange", () => {
            if (
              worker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              console.info(
                "Nexora Inventory : mise à jour prête."
              );
            }
          });
        });
      } catch (error) {
        console.error(
          "Erreur Service Worker :",
          error
        );
      }
    }

    void registerServiceWorker();

    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        handleControllerChange
      );
    };
  }, []);

  return null;
}