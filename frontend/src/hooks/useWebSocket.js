import { useEffect, useRef, useState, useCallback } from 'react';

export default function useWebSocket(onMessage) {
  const wsRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const reconnectTimeout = useRef(null);
  const onMessageRef = useRef(onMessage);
  const backoffMs = useRef(2000);
  const pingInterval = useRef(null);
  const tokenRefreshInterval = useRef(null);
  const mountedRef = useRef(true);

  // Keep callback ref fresh without triggering reconnect
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  // Auto-refresh access token every 20 minutes (before 30min expiry)
  useEffect(() => {
    async function refreshToken() {
      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) return;
      try {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${refreshToken}`
          }
        });
        if (res.ok) {
          const data = await res.json();
          localStorage.setItem('token', data.access_token);
          if (data.refresh_token) {
            localStorage.setItem('refreshToken', data.refresh_token);
          }
          console.log('Token auto-refreshed');
        }
      } catch (e) {
        console.error('Token refresh failed:', e);
      }
    }

    // Refresh every 20 minutes
    tokenRefreshInterval.current = setInterval(refreshToken, 20 * 60 * 1000);
    return () => clearInterval(tokenRefreshInterval.current);
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    function connect() {
      if (!mountedRef.current) return;

      const token = localStorage.getItem('token');
      if (!token) return;

      // Cleanup previous connection
      if (wsRef.current) {
        try { wsRef.current.close(); } catch (e) {}
        wsRef.current = null;
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = import.meta.env.VITE_WS_URL || `${protocol}//${window.location.host}`;
      const wsUrl = `${wsHost}/ws?token=${token}`;

      try {
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          if (!mountedRef.current) return;
          setConnected(true);
          backoffMs.current = 2000;
          console.log('WebSocket connected');

          // Send keepalive ping every 20 seconds to prevent load balancer idle timeout
          clearInterval(pingInterval.current);
          pingInterval.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              try {
                ws.send('pong');
              } catch (e) {}
            }
          }, 20000);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            // Respond to server ping immediately
            if (data.type === 'ping') {
              try { ws.send('pong'); } catch (e) {}
              return;
            }
            onMessageRef.current?.(data);
          } catch (e) {
            console.error('WS parse error:', e);
          }
        };

        ws.onclose = (event) => {
          if (!mountedRef.current) return;
          setConnected(false);
          clearInterval(pingInterval.current);

          // If closed with auth error (4001), try to refresh token first
          if (event.code === 4001) {
            console.log('WS auth failed, refreshing token...');
            refreshAndReconnect();
            return;
          }

          const delay = backoffMs.current;
          backoffMs.current = Math.min(backoffMs.current * 1.5, 30000);
          console.log(`WS closed (code=${event.code}), reconnecting in ${delay}ms`);
          reconnectTimeout.current = setTimeout(connect, delay);
        };

        ws.onerror = () => {
          // onclose will fire after this
        };

        wsRef.current = ws;
      } catch (e) {
        console.error('WS connect error:', e);
        const delay = backoffMs.current;
        backoffMs.current = Math.min(backoffMs.current * 1.5, 30000);
        reconnectTimeout.current = setTimeout(connect, delay);
      }
    }

    async function refreshAndReconnect() {
      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) {
        // No refresh token — redirect to login
        window.location.href = '/login';
        return;
      }
      try {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${refreshToken}`
          }
        });
        if (res.ok) {
          const data = await res.json();
          localStorage.setItem('token', data.access_token);
          if (data.refresh_token) {
            localStorage.setItem('refreshToken', data.refresh_token);
          }
          console.log('Token refreshed, reconnecting WS...');
          backoffMs.current = 1000;
          reconnectTimeout.current = setTimeout(connect, 1000);
        } else {
          // Refresh failed — try again in 10s before giving up
          reconnectTimeout.current = setTimeout(connect, 10000);
        }
      } catch (e) {
        reconnectTimeout.current = setTimeout(connect, 10000);
      }
    }

    // Reconnect when tab becomes visible (user switched back)
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          console.log('Tab visible, WS not connected — reconnecting');
          clearTimeout(reconnectTimeout.current);
          connect();
        }
      }
    }

    // Reconnect on network recovery
    function handleOnline() {
      console.log('Network back online, reconnecting WS');
      clearTimeout(reconnectTimeout.current);
      setTimeout(connect, 1000);
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    connect();

    return () => {
      mountedRef.current = false;
      clearInterval(pingInterval.current);
      clearInterval(tokenRefreshInterval.current);
      clearTimeout(reconnectTimeout.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      if (wsRef.current) {
        try { wsRef.current.close(); } catch (e) {}
      }
    };
  }, []);

  return { connected, ws: wsRef.current };
}
