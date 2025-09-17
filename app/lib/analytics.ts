// This function sends an event to our beacon API.
export const trackEvent = (eventName: string, properties?: object) => {
  // Use navigator.sendBeacon if available for more reliable background sending
  if (navigator.sendBeacon) {
    const blob = new Blob([JSON.stringify({ event_name: eventName, properties })], {
      type: 'application/json; charset=UTF-8',
    });
    navigator.sendBeacon('/api/track-event', blob);
  } else {
    // Fallback to fetch for older browsers
    fetch('/api/track-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_name: eventName,
        properties,
      }),
      keepalive: true, // Helps ensure the request is sent even if the page is closing
    });
  }
};