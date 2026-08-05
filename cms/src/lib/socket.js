import { io } from 'socket.io-client';
import { tokens } from './api.js';
import { API_BASE } from './config.js';

let socket = null;

export function connectSocket() {
  if (socket?.connected) return socket;
  socket?.close();

  const opts = {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    auth: { token: tokens.access },
  };

  /* No base means dev, where Vite proxies the websocket and same-origin is
     right. io() with an explicit undefined URL is not the same call, so branch
     rather than pass one through. */
  socket = API_BASE ? io(API_BASE, opts) : io(opts);

  /* The access token is short-lived. When the socket is rejected, take the
     current token (the API client refreshes it) and try again. */
  socket.on('connect_error', (err) => {
    if (err.message === 'unauthorized') {
      setTimeout(() => {
        if (socket) {
          socket.auth = { token: tokens.access };
          socket.connect();
        }
      }, 1500);
    }
  });

  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  socket?.close();
  socket = null;
}
