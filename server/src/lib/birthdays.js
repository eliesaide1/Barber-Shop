import { User } from '../models/User.js';
import { getSettings, fillTokens } from '../models/ShopSettings.js';
import { notify } from './notify.js';
import { sendTemplate, whatsappConfigured } from './whatsapp.js';
import { grantBirthdayReward, dateLabel } from './rewards.js';
import { env } from '../config/env.js';

/**
 * Birthday greetings.
 *
 * The second thing in the shop that no request triggers — like reminders, it is
 * owed because a date came round. Same shape, for the same reasons: a sweep
 * rather than scheduled timers, and a mark on the record rather than memory in
 * the scheduler, so restarting costs nothing and running twice sends once.
 *
 * Two channels, and they are not equals. The in-app notification always goes —
 * it is ours, it needs nobody's approval, and it works. WhatsApp goes only when
 * Meta's side is configured, the client has opted in, and their number can be
 * made sense of. A greeting that reached the app but not WhatsApp is a success
 * with a footnote, not a failure.
 */

const SHOP_NAME = 'FadeRoom';

/** Today, in the shop's clock, as `{ year, month, day }`. */
export function shopToday(now = new Date(), timeZone = env.shopTimezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') };
}

const isLeapYear = (year) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/**
 * Does this birth date fall today?
 *
 * 29 February exists in one year out of four, and somebody born on it still has
 * a birthday in the other three. Greeting them on 28 February is the common
 * convention and, more to the point, greeting them never is plainly wrong.
 */
export function birthdayFallsToday(dateOfBirth, today) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth ?? '');
  if (!m) return false;

  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month === today.month && day === today.day) return true;

  return (
    month === 2 && day === 29 && today.month === 2 && today.day === 28 && !isLeapYear(today.year)
  );
}

/**
 * Greets everyone whose birthday is today and who has not been greeted this year.
 *
 * `now` is a parameter so this can be tested against a clock the test controls.
 */
export async function sweepBirthdays(now = new Date()) {
  const settings = await getSettings();
  const config = settings.birthday;
  if (!config.enabled) return { greeted: 0, whatsapp: 0, skipped: 'disabled' };

  const today = shopToday(now);
  /* Once a day, at the hour the shop chose. Before it, there is nothing to do;
     after it, a sweep that missed its slot still catches up, because the year
     mark is what actually prevents a second send. */
  if (today.hour < config.sendHour) return { greeted: 0, whatsapp: 0, skipped: 'too early' };

  const candidates = await User.find({
    role: 'client',
    active: true,
    dateOfBirth: { $ne: '' },
    birthdayGreetedYear: { $ne: today.year },
  }).select('name phone dateOfBirth notifications birthdayGreetedYear');

  let greeted = 0;
  let whatsapp = 0;
  let rewarded = 0;

  for (const user of candidates) {
    if (!birthdayFallsToday(user.dateOfBirth, today)) continue;

    /* The claim, before anything is sent. Whoever wins it owns the greeting;
       a second sweep, a second instance or a restart mid-run finds nothing. */
    const claimed = await User.findOneAndUpdate(
      { _id: user._id, birthdayGreetedYear: { $ne: today.year } },
      { $set: { birthdayGreetedYear: today.year } },
    );
    if (!claimed) continue;

    const firstName = user.name.split(' ')[0];

    /* Minted before anything is sent, so the claim code can go into the message
       itself. A greeting that mentions a gift the card does not have is worse
       than one that mentions no gift at all. */
    const reward = await grantBirthdayReward(user._id, config);
    if (reward) rewarded += 1;

    const tokens = {
      name: firstName,
      shop: SHOP_NAME,
      reward: reward?.code ?? '',
      expires: reward ? dateLabel(reward.expiresAt) : '',
    };

    /* Ours, and unconditional. */
    await notify(user._id, {
      title: fillTokens(config.inAppTitle, tokens) || 'Happy birthday!',
      body: fillTokens(config.inAppBody, tokens),
      kind: 'message',
      data: { screen: 'Loyalty' },
    });
    greeted += 1;

    /* Theirs, and conditional on all three of: Meta configured, this client
       opted in, and a number that can be dialled. */
    if (whatsappConfigured() && user.notifications?.whatsapp && config.templateName) {
      const res = await sendTemplate(user.phone, {
        name: config.templateName,
        language: config.templateLanguage,
        variables: config.variables.map((v) => fillTokens(v, tokens)),
      });
      if (res.ok) whatsapp += 1;
      else if (res.error) console.warn(`[birthdays] WhatsApp to ${firstName} failed: ${res.error}`);
    }
  }

  return { greeted, whatsapp, rewarded };
}

let timer = null;

/** Starts the sweep. Returns a stop function for shutdown. */
export function startBirthdays() {
  if (timer) return stopBirthdays;

  const run = async () => {
    try {
      const { greeted, whatsapp } = await sweepBirthdays();
      if (greeted) console.log(`[birthdays] greeted ${greeted} (${whatsapp} on WhatsApp)`);
    } catch (err) {
      console.error('[birthdays] sweep failed:', err.message);
    }
  };

  /* Hourly is plenty for something that happens once a day: it only has to
     notice that the shop's chosen hour has arrived, and the year mark makes a
     late or repeated run harmless. */
  run();
  timer = setInterval(run, env.birthdaySweepMs);
  return stopBirthdays;
}

export function stopBirthdays() {
  if (timer) clearInterval(timer);
  timer = null;
}
