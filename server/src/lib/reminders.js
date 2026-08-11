import { Appointment } from '../models/Appointment.js';
import { notify, whenLabel, timeLabel } from './notify.js';
import { env } from '../config/env.js';

/**
 * Appointment reminders.
 *
 * The one notification in the shop that nothing triggers. Every other message
 * here is the tail of a request somebody made — a booking answered, an order
 * moved on. A reminder is owed because time passed, and nothing passes time
 * except a clock, so this is the only piece that has to go and look.
 *
 * It is also the notification worth the most. A client who forgets is a chair
 * that earns nothing for forty-five minutes, and unlike an empty slot nobody
 * booked, it was already paid for in turned-away work.
 *
 * ── Why a sweep, and not a timer per booking ─────────────────────────────────
 *
 * A `setTimeout` at confirmation time would be simpler and would be wrong at the
 * first restart: every pending timer dies with the process, silently, and the
 * reminders they owed are never sent and never missed by anybody watching. A
 * sweep holds no state between runs, so a restart costs nothing.
 *
 * ── Why it can safely run twice ──────────────────────────────────────────────
 *
 * The record of what has been sent lives on the booking, and each reminder is
 * *claimed* with a guarded update before it goes out. Two instances sweeping the
 * same second, a run that overlaps the previous one, a manual invocation from a
 * console: the loser's update matches nothing and it sends nothing. Sending a
 * client the same reminder three times is the sort of bug that gets an app
 * muted, and it is much easier to prevent than to notice.
 */

/** `in 2 hours`, `tomorrow` — how a lead time reads to a person. */
export function leadPhrase(minutes) {
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return days === 1 ? 'tomorrow' : `in ${days} days`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? 'in an hour' : `in ${hours} hours`;
  }
  return `in ${minutes} minutes`;
}

/**
 * Which lead times have already gone past for a booking starting at `startsAt`.
 *
 * Called when a booking is confirmed, to write them off as already handled: a
 * cut accepted an hour before it starts must not be announced as happening
 * "tomorrow". Without this the sweep would find a day-ahead reminder whose
 * trigger is long past and fire it immediately, which reads as a bug to the
 * client and is one.
 */
export const lapsedLeads = (startsAt, now = Date.now()) =>
  env.reminderLeads.filter((lead) => startsAt.getTime() - lead * 60_000 <= now);

/**
 * Sends every reminder that has fallen due.
 *
 * `now` is a parameter so this can be tested against a clock the test controls,
 * rather than by waiting.
 */
export async function sweepReminders(now = new Date()) {
  const leads = env.reminderLeads;
  if (!leads.length) return { sent: 0, appointments: 0 };

  const horizon = new Date(now.getTime() + Math.max(...leads) * 60_000);

  /* Only bookings that are confirmed and still ahead of us. A booking already
     under way needs no reminding, and a cancelled or declined one must never
     produce one — being reminded of an appointment you called off is worse than
     silence. */
  const upcoming = await Appointment.find({
    status: 'confirmed',
    startsAt: { $gt: now, $lte: horizon },
    remindersSent: { $not: { $size: leads.length } },
  })
    .populate('artist', 'displayName chair')
    .limit(500);

  let sent = 0;
  for (const appointment of upcoming) {
    const due = leads.filter(
      (lead) =>
        !appointment.remindersSent.includes(lead) &&
        now.getTime() >= appointment.startsAt.getTime() - lead * 60_000,
    );
    if (!due.length) continue;

    /* Several can fall due at once after downtime. They are all marked, but only
       the most urgent is sent — telling somebody their cut is tomorrow and then
       immediately that it is in two hours is two messages that contradict each
       other, and the second is the only one they need. */
    const urgent = Math.min(...due);

    /* The claim. Whoever wins this update owns the send; anybody else sweeping
       the same booking gets null back and moves on. */
    const claimed = await Appointment.findOneAndUpdate(
      { _id: appointment._id, status: 'confirmed', remindersSent: { $ne: urgent } },
      { $addToSet: { remindersSent: { $each: due } } },
    );
    if (!claimed) continue;

    const artistName = appointment.artist?.displayName ?? 'your artist';
    const chair = appointment.artist?.chair;
    await notify(appointment.user, {
      title:
        urgent >= 1440
          ? `You're in the chair ${leadPhrase(urgent)}`
          : `Your cut is ${leadPhrase(urgent)}`,
      body:
        `${timeLabel(appointment.startsAt)} with ${artistName}` +
        `${chair ? ` · ${chair}` : ''} · ${appointment.serviceName}, ` +
        `${appointment.durationMin} minutes.`,
      kind: 'booking',
      data: { screen: 'Appointments' },
    });
    sent += 1;
  }

  return { sent, appointments: upcoming.length };
}

let timer = null;

/** Starts the sweep. Returns a stop function for shutdown. */
export function startReminders() {
  if (timer) return stopReminders;
  if (!env.reminderLeads.length) {
    console.warn('[reminders] REMINDER_LEAD_MINUTES is empty — no reminders will be sent');
    return stopReminders;
  }

  const run = async () => {
    try {
      const { sent } = await sweepReminders();
      if (sent) console.log(`[reminders] sent ${sent}`);
    } catch (err) {
      /* Never let a bad sweep take the process down — the next one is minutes
         away and the claim guard means nothing was half-done. */
      console.error('[reminders] sweep failed:', err.message);
    }
  };

  /* Once now, so a restart catches anything that fell due while it was down. */
  run();
  timer = setInterval(run, env.reminderSweepMs);
  console.log(
    `[reminders] every ${Math.round(env.reminderSweepMs / 60_000)} min · ` +
      `leads ${env.reminderLeads.map(leadPhrase).join(', ')}`,
  );
  return stopReminders;
}

export function stopReminders() {
  if (timer) clearInterval(timer);
  timer = null;
}
