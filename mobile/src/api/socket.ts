import { io, Socket } from 'socket.io-client';
import { API_URL } from '../config';
import { auth } from './client';

let socket: Socket | null = null;

export function connectSocket(): Socket | null {
  if (!auth.access) return null;
  if (socket?.connected) return socket;

  socket?.close();
  socket = io(API_URL, {
    transports: ['websocket'],
    auth: { token: auth.access },
    reconnectionDelay: 1200,
    reconnectionDelayMax: 8000,
  });

  /* The access token expires long before the socket would give up. When the
     handshake is rejected, re-arm with whatever token the API client holds
     now (it refreshes on its own schedule) and try again. */
  socket.on('connect_error', (err) => {
    if (err.message === 'unauthorized') {
      setTimeout(() => {
        if (socket && auth.access) {
          socket.auth = { token: auth.access };
          socket.connect();
        }
      }, 2000);
    }
  });

  return socket;
}

export const getSocket = () => socket;

export function disconnectSocket() {
  socket?.close();
  socket = null;
}
