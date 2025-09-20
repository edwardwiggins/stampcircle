// public/sw.js

// This event listener runs when a push notification is received
self.addEventListener('push', (event) => {
  const data = event.data.json(); // The data comes from our Edge Function
  
  const title = data.title || 'StampCircle';
  const options = {
    body: data.body,
    icon: '/icon-192x192.png', // Default icon for the notification
    badge: '/badge-72x72.png',  // A smaller badge icon
    data: {
      url: data.url, // URL to open when the notification is clicked
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// This event listener runs when the user clicks on the notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close(); // Close the notification

  // Open the URL that was passed in with the notification
  const urlToOpen = event.notification.data.url || '/';
  
  event.waitUntil(
    clients.openWindow(urlToOpen)
  );
});