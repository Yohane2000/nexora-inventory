import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Nexora Inventory",
    short_name: "Nexora",
    description:
      "Application intelligente de gestion des stocks et des inventaires.",

    start_url: "/",
    scope: "/",

    display: "standalone",
    orientation: "portrait",

    background_color: "#F5F7FB",
    theme_color: "#1D4ED8",

    lang: "fr",

    categories: ["business", "productivity"],

    prefer_related_applications: false,

    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}