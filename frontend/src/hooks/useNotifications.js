import { useEffect, useRef, useCallback } from 'react';

export default function useNotifications() {
  const audioContextRef = useRef(null);
  const unlockedRef = useRef(false);

  // Unlock AudioContext after first user interaction
  useEffect(() => {
    const unlock = () => {
      if (!unlockedRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        // Play silent buffer to unlock
        const buffer = audioContextRef.current.createBuffer(1, 1, 22050);
        const source = audioContextRef.current.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContextRef.current.destination);
        source.start(0);
        unlockedRef.current = true;
      }
    };

    document.addEventListener('click', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    return () => {
      document.removeEventListener('click', unlock);
      document.removeEventListener('keydown', unlock);
    };
  }, []);

  const playSound = useCallback(() => {
    try {
      let ctx = audioContextRef.current;
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        audioContextRef.current = ctx;
      }

      // Resume if suspended (browser autoplay policy)
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      // WhatsApp-style notification: two short ascending tones
      const playTone = (freq, startTime, duration) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.4, startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      const now = ctx.currentTime;
      playTone(880, now, 0.12);         // First tone: A5
      playTone(1175, now + 0.15, 0.12); // Second tone: D6
    } catch (e) {
      console.log('Sound play failed:', e);
    }
  }, []);

  const showNotification = useCallback((title, body) => {
    playSound();

    // Update tab title
    const originalTitle = document.title;
    document.title = `💬 ${title}`;
    setTimeout(() => { document.title = originalTitle; }, 5000);

    // Browser notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body: body?.substring(0, 100),
        icon: '/favicon.ico',
        tag: 'chatflow-msg-' + Date.now(), // Unique tag so each message gets its own notification
      });
    }
  }, [playSound]);

  return { playSound, showNotification };
}
