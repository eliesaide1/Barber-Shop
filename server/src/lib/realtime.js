/* Thin wrapper over the Socket.IO server so routes can emit without importing
   the io instance directly (and so emitting is a no-op in tests). */

let io = null;

export function bindRealtime(server) {
  io = server;
}

export const rooms = {
  user: (id) => `user:${id}`,
  artist: (id) => `artist:${id}`,
  role: (role) => `role:${role}`,
  /* Everyone with a CMS seat: artists and admins. */
  staff: () => 'staff',
};

export function emitTo(room, event, payload) {
  if (!io) return;
  io.to(room).emit(event, payload);
}

export function emitToRooms(roomList, event, payload) {
  if (!io || !roomList.length) return;
  io.to(roomList).emit(event, payload);
}

export function broadcast(event, payload) {
  if (!io) return;
  io.emit(event, payload);
}

export function connectedCount(room) {
  if (!io) return 0;
  return io.sockets.adapter.rooms.get(room)?.size ?? 0;
}
