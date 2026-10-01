// Service worker minimal, sans cache : il sert uniquement à rendre l'application installable
// (Chrome / Edge exigent un service worker). Toutes les requêtes passent par le réseau, comme sans lui.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* réseau direct : pas de cache */ });
