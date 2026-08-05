import { useEffect, useRef, useState } from 'react';
import { getSocket } from '../lib/socket.js';

/**
 * Subscribe to a Socket.IO event for the lifetime of a component.
 * The handler is kept in a ref so a new closure every render doesn't
 * re-subscribe on every render.
 */
export function useSocketEvent(event, handler) {
  const saved = useRef(handler);
  saved.current = handler;

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;
    const fn = (...args) => saved.current(...args);
    socket.on(event, fn);
    return () => socket.off(event, fn);
  }, [event]);
}

/** Live connection state, for the dot in the top bar. */
export function useConnection() {
  const [connected, setConnected] = useState(() => getSocket()?.connected ?? false);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    socket.on('connect', on);
    socket.on('disconnect', off);
    setConnected(socket.connected);
    return () => {
      socket.off('connect', on);
      socket.off('disconnect', off);
    };
  }, []);

  return connected;
}
