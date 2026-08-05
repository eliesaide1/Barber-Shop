import mongoose from 'mongoose';

/* Multi-document transactions need a replica set or a sharded cluster. A
   plain `mongod` — which is what the Windows installer sets up by default —
   rejects them. Rather than making a replica set a hard requirement, we detect
   support once and fall back to compensation (undo what already succeeded)
   when it isn't there. */
let supported = null;

export async function transactionsSupported() {
  if (supported !== null) return supported;
  try {
    const info = await mongoose.connection.db.admin().command({ hello: 1 });
    supported = Boolean(info.setName) || info.msg === 'isdbgrid';
  } catch {
    supported = false;
  }
  if (!supported) {
    console.warn(
      '[db] standalone MongoDB detected — running without transactions.\n' +
        '     Stock changes are rolled back by compensation instead. To get real\n' +
        '     transactions, start mongod with --replSet rs0 and rs.initiate().',
    );
  }
  return supported;
}

/**
 * Runs `work` inside a transaction when the server supports one.
 *
 * @param {(session: import('mongoose').ClientSession | null) => Promise<any>} work
 * @param {() => Promise<void>} compensate Undo partial effects when there is no transaction.
 */
export async function atomically(work, compensate) {
  if (await transactionsSupported()) {
    const session = await mongoose.startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        result = await work(session);
      });
      return result;
    } finally {
      await session.endSession();
    }
  }

  try {
    return await work(null);
  } catch (err) {
    if (compensate) {
      try {
        await compensate();
      } catch (undoErr) {
        console.error('[db] compensation failed — stock may be off:', undoErr);
      }
    }
    throw err;
  }
}
