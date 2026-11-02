"use client";

import { useEffect } from "react";

export default function PWARegister() {
useEffect(() => {
if (
process.env.NODE_ENV === "production" &&
"serviceWorker" in navigator
) {
navigator.serviceWorker
.register("/sw.js")
.then(() => {
console.log("Nexora Inventory : Service Worker activé.");
})
.catch((error) => {
console.error("Erreur Service Worker :", error);
});
}
}, []);

return null;
}
