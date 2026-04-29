import { useEffect, useRef, useState } from 'react';

export default function useWebSocket(onMessage) {
  const wsRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const reconnectTimeout = useRef(null);
  const onMessageRef = useRef(onMessage);
  const backoffMs = useRef(3000);

  // Keep callback ref fresh without triggering reconnect
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    function connect() {
      const token = localStorage.getItem('token');
      if (!token) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      // In production, WS may need to connect directly to backend
      const wsHost = import.meta.env.VITE_WS_URL || `${protocol}//${window.location.host}`;
      const wsUrl = `${wsHost}/ws?token=${token}`;

      try {
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          setConnected(true);
          backoffMs.current = 3000; // Reset backoff on successful connection
          console.log('WebSocket connected');
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            onMessageRef.current?.(data);
          } catch (e) {
            console.error('WS parse error:', e);
          }
        };

        ws.onclose = () => {
          setConnected(false);
          const delay = backoffMs.current;
          backoffMs.current = Math.min(backoffMs.current * 2, 60000);
          reconnectTimeout.current = setTimeout(connect, delay);
        };

        ws.onerror = () => {
          ws.close();
        };

        wsRef.current = ws;
      } catch (e) {
        console.error('WS connect error:', e);
        const delay = backoffMs.current;
        backoffMs.current = Math.min(backoffMs.current * 2, 60000);
        reconnectTimeout.current = setTimeout(connect, delay);
      }
    }

    connect();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
    };
  }, []); // Connect once, never reconnect due to callback changes

  return { connected, ws: wsRef.current };
}
