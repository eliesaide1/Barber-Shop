import { io, Socket } from 'socket.io-client';
import { API_URL } from '../config';
import { auth } from './client';

let socket: Socket | null = null;
/** Which session the live socket was opened with — null for anonymous. */
let socketToken: string | null = null;

/**
 * Connects, with a session when there is one and without when there is not.
 *
 * A signed-out app still has screens, and those screens still show words the
 * shop can rewrite. Refusing to connect meant the sign-in screen could never
 * hear that anything had changed — the server sends the shop's own changes to
 * everybody, and this was the end that was not listening.
 *
 * An anonymous socket is in no rooms, so it receives only those broadcasts.
 */
export function connectSocket(): Socket | null {
  /* Reconnected from scratch when the session changes, because the token is
     read at handshake time: a socket opened before signing in stays anonymous
     however valid the token becomes afterwards. */
  const token = auth.access ?? null;
  if (socket?.connected && socketToken === token) return socket;

  socket?.close();
  socketToken = token;
  socket = io(API_URL, {
    transports: ['websocket'],
    auth: token ? { token } : {},
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

  rebind(socket);
  return socket;
}

export const getSocket = () => socket;

/**
 * Subscribes for as long as you keep the returned function, across reconnects.
 *
 * `getSocket()?.on(...)` binds to whichever socket exists at that moment, and
 * signing in replaces it — the token is read at handshake time, so a new one
 * has to be opened. Anything long-lived that had bound to the old instance
 * then goes quiet with nothing to show for it. The providers above the
 * navigator are exactly that: mounted once, listening for the rest of the run.
 */
type Handler = (...args: any[]) => void;
const handlers = new Map<string, Set<Handler>>();

export function onSocketEvent(event: string, fn: Handler): () => void {
  const set = handlers.get(event) ?? new Set<Handler>();
  set.add(fn);
  handlers.set(event, set);
  socket?.on(event, fn);

  return () => {
    handlers.get(event)?.delete(fn);
    socket?.off(event, fn);
  };
}

/** Re-attaches every live subscription to a freshly opened socket. */
function rebind(next: Socket) {
  for (const [event, set] of handlers) {
    for (const fn of set) next.on(event, fn);
  }
}

export function disconnectSocket() {
  socket?.close();
  socket = null;
  socketToken = null;
}
