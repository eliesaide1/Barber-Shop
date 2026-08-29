/**
 * The two ways a time is written in the artist portal.
 *
 * Pulled out of the schedule when requests moved to their own tab, so both
 * screens read a booking the same way — the day's agenda and the request that
 * became it should never disagree about what "17:40" means.
 */

/** 24-hour, because a chair's day is read at a glance and am/pm is noise. */
export const time = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

export const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
