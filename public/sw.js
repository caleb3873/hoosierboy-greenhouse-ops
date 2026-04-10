// Service Worker for Push Notifications — Hoosier Boy Greenhouse Ops
// No caching strategy — CRA handles that separately.

self.addEventListener("push", (event) => {
  let data = { title: "HB Ops", body: "New notification", url: "/", tag: "default" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    // fallback to text
    if (event.data) data.body = event.data.text();
  }

  const options = {
    body: data.body,
    tag: data.tag || "default",
    icon: "/favicon-192.png",
    badge: "/favicon-192.png",
    data: { url: data.url || "/" },
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // Focus existing window if open
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      // Otherwise open new window
      return clients.openWindow(url);
    })
  );
});
