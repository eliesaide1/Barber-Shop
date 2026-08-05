import { Server } from 'socket.io';
import { verifyAccessToken } from '../lib/tokens.js';
import { User } from '../models/User.js';
import { Artist } from '../models/Artist.js';
import { bindRealtime, rooms } from '../lib/realtime.js';
import { env } from '../config/env.js';

/**
 * Socket.IO gateway.
 *
 * Every connection is authenticated with the same access token the REST API
 * uses — an unauthenticated socket is rejected outright, because every event
 * we push is addressed to somebody. On connect the socket joins the rooms that
 * describe who it belongs to, and all fan-out is done by room rather than by
 * tracking socket ids.
 */
export function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: env.corsOrigins, credentials: true },
    /* React Native's websocket is fine; polling is the fallback on flaky mobile data. */
    transports: ['websocket', 'polling'],
    pingTimeout: 25_000,
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) return next(new Error('unauthorized'));

      const claims = verifyAccessToken(String(token));
      const user = await User.findById(claims.sub);
      if (!user || !user.active) return next(new Error('unauthorized'));

      socket.data.user = user;
      socket.data.artist =
        user.role === 'artist' ? await Artist.findOne({ user: user._id }) : null;
      return next();
    } catch {
      return next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const { user, artist } = socket.data;

    socket.join(rooms.user(user._id));
    socket.join(rooms.role(user.role));
    if (artist) socket.join(rooms.artist(artist._id));
    /* One room for every CMS seat, so staff-wide events are a single emit. */
    if (['artist', 'admin'].includes(user.role)) socket.join(rooms.staff());

    socket.emit('ready', {
      userId: String(user._id),
      role: user.role,
      artistId: artist ? String(artist._id) : null,
      serverTime: Date.now(),
    });

    /* An admin watching one chair's activity in the CMS. */
    socket.on('watch:artist', (artistId) => {
      if (user.role !== 'admin') return;
      socket.join(rooms.artist(artistId));
    });
    socket.on('unwatch:artist', (artistId) => {
      socket.leave(rooms.artist(artistId));
    });

    /* Round-trip used by the app to show connection health and to keep the
       clock the rotating QR depends on honest. */
    socket.on('ping:time', (ack) => {
      if (typeof ack === 'function') ack({ serverTime: Date.now() });
    });

    socket.on('error', (err) => console.error('[socket]', user.email, err.message));
  });

  bindRealtime(io);
  return io;
}
