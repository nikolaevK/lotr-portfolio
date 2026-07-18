// This app has no service worker. A previous app on this origin (localhost)
// registered one, and browsers keep requesting sw.js forever. Serving this
// self-destructing worker updates the stale registration and removes it.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", async () => {
  await self.registration.unregister();
  const clients = await self.clients.matchAll({ type: "window" });
  clients.forEach((c) => c.navigate(c.url));
});
