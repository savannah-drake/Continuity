// Continuity service worker: shows refill/booking alerts and opens the right screen when tapped.
self.addEventListener("push", (event) => {
  let a = { title: "Continuity", body: "", url: "/" };
  try { a = { ...a, ...event.data.json() }; } catch { /* plain text */ }
  event.waitUntil(self.registration.showNotification(a.title, {
    body: a.body, icon: "/icon-192.png", badge: "/icon-192.png", data: { url: a.url }, tag: a.url,
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = tabs.find((t) => t.url.startsWith(self.location.origin));
    if (open) { await open.focus(); return open.navigate(url); }
    return self.clients.openWindow(url);
  })());
});
