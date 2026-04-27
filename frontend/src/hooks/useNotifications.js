import { useEffect, useRef } from 'react';

// Notification sound (base64 encoded short beep)
const NOTIFICATION_SOUND = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2JkZaXl5eTjoeAeHFqZmRkaGx0fISLkJSXl5eUkIuGgHpzbWlmZWhscniAh42Sl5iYlpKNiIJ8dnBrZ2VmaW50e4KIjpOXmJeVko2Ig3x2cGtmZGVpbnR7goiOk5eYl5WRjYiCfHZwa2ZkZWluc3qBiI6TlpeXlZGMh4F7dXBqZWRlaW5zeYCHjZKWl5eVkYyHgXt1b2plZGVpbnR6gIeNkpaXl5WRjIeBe3VvamVkZWluc3p/h42SlpeXlZGMh4F7dW9qZWRlaW5zenCAh42SlpeXlZCMh4F7';

export default function useNotifications() {
  const audioRef = useRef(null);

  useEffect(() => {
    audioRef.current = new Audio(NOTIFICATION_SOUND);
    audioRef.current.volume = 0.5;

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const playSound = () => {
    try {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});
      }
    } catch (e) {}
  };

  const showNotification = (title, body) => {
    playSound();

    // Update tab title
    const originalTitle = document.title;
    document.title = `💬 ${title}`;
    setTimeout(() => { document.title = originalTitle; }, 5000);

    // Browser notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/favicon.ico' });
    }
  };

  return { playSound, showNotification };
}
