import { Server } from 'socket.io';
import { verifyAccessToken } from '../lib/tokens.js';
import { User } from '../models/User.js';
import { Artist } from '../models/Artist.js';
import { bindRealtime, rooms } from '../lib/realtime.js';
import { env } from '../config/env.js';

/**
 * Socket.IO gateway.
 *
 * A connection carrying an access token joins the rooms that describe who it
 * belongs to, and all fan-out is done by room rather than by tracking socket
 * ids.
 *
 * A connection without one is allowed, and joins nothing. That is the whole of
 * its privilege: it receives only what is broadcast to everybody — that the
 * catalogue moved, that the shop's settings were saved, that the interface
 * copy was rewritten — and none of those carry anything but an id and the fact
 * itself. Anything addressed to a person is sent to a room, and an anonymous
 * socket is in no rooms.
 *
 * It is allowed because the sign-in screen is a screen too. Rejecting it meant
 * the shop could rewrite the words on the front door and every phone sitting on
 * that door would keep showing the old ones until somebody backgrounded the app
 * — which reads, correctly, as the feature not working.
 */
export function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: env.corsOrigins, credentials: true },
    /* React Native's websocket is fine; polling is the fallback on flaky mobile data. */
    transports: ['websocket', 'polling'],
    pingTimeout: 25_000,
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    /* No token at all is a signed-out app, not a failed sign-in. */
    if (!token) {
      socket.data.user = null;
      socket.data.artist = null;
      return next();
    }

    try {
      const claims = verifyAccessToken(String(token));
      const user = await User.findById(claims.sub);
      if (!user || !user.active) return next(new Error('unauthorized'));

      socket.data.user = user;
      socket.data.artist =
        user.role === 'artist' ? await Artist.findOne({ user: user._id }) : null;
      return next();
      /* A token that is present and bad is still refused. Expired is the common
         case and the client re-arms and retries; treating it as anonymous would
         silently downgrade a signed-in app to a socket that hears nothing
         addressed to it, which is far harder to notice than a rejection. */
    } catch {
      return next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const { user, artist } = socket.data;

    if (!user) {
      /* Joins nothing, so it receives only io-wide broadcasts. */
      socket.emit('ready', { userId: null, role: null, artistId: null, serverTime: Date.now() });
      socket.on('ping:time', (ack) => {
        if (typeof ack === 'function') ack({ serverTime: Date.now() });
      });
      return;
    }

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
