import { useEffect, useRef, useCallback } from 'react';

export default function useNotifications() {
  const audioContextRef = useRef(null);

  useEffect(() => {
    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const playSound = useCallback(() => {
    try {
      // Create AudioContext on demand (avoids autoplay restrictions)
      const ctx = new (window.AudioContext || window.webkitAudioContext)();

      // WhatsApp-style notification: two short tones
      const playTone = (freq, startTime, duration) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.3, startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      const now = ctx.currentTime;
      playTone(880, now, 0.15);        // First tone: A5
      playTone(1175, now + 0.18, 0.15); // Second tone: D6 (higher)
    } catch (e) {
      console.log('Sound play failed:', e);
    }
  }, []);

  const showNotification = useCallback((title, body) => {
    playSound();

    // Update tab title with blinking effect
    const originalTitle = document.title;
    document.title = `💬 ${title}`;
    setTimeout(() => { document.title = originalTitle; }, 5000);

    // Browser notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body: body?.substring(0, 100),
        icon: '/favicon.ico',
        tag: 'chatflow-msg', // Prevents stacking too many notifications
      });
    }
  }, [playSound]);

  return { playSound, showNotification };
}
