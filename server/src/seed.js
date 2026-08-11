/**
 * Seeds a working shop: an admin, four artists with logins, the service menu,
 * the marketplace catalogue, a lookbook and a demo client with a part-filled
 * loyalty card. Safe to re-run — it wipes the collections it owns first.
 *
 *   npm run seed
 */
import { connectDb, disconnectDb } from './config/db.js';
import { User } from './models/User.js';
import { Artist } from './models/Artist.js';
import { Service } from './models/Service.js';
import { Product } from './models/Product.js';
import { Style } from './models/Style.js';
import { Loyalty } from './models/Loyalty.js';
import { Appointment } from './models/Appointment.js';
import { Order } from './models/Order.js';
import { CheckIn } from './models/CheckIn.js';
import { Notification } from './models/Notification.js';
import { ShopSettings, getSettings } from './models/ShopSettings.js';
import { env } from './config/env.js';

const PASSWORD = 'password1';

const ARTISTS = [
  {
    displayName: 'Karim Nasr',
    email: 'karim@faderoom.app',
    specialty: 'Skin fades · beard sculpt',
    chair: 'Chair 1',
    rating: 4.9,
    reviewsCount: 214,
    priceFrom: 25,
    gapMin: 5,
    whatsapp: '+961 70 111 000',
    daysOff: [0],
    bio: 'Twelve years on the clippers. Known for a fade you cannot find the line on.',
  },
  {
    displayName: 'Rami Chalhoub',
    email: 'rami@faderoom.app',
    specialty: 'Classic scissor cuts',
    chair: 'Chair 2',
    rating: 4.8,
    reviewsCount: 168,
    priceFrom: 22,
    gapMin: 10,
    whatsapp: '+961 71 222 000',
    daysOff: [0, 1],
    bio: 'Scissor-over-comb specialist. Ask him about growing a cut out properly.',
  },
  {
    displayName: 'Jad Semaan',
    email: 'jad@faderoom.app',
    specialty: 'Textured crops · design',
    chair: 'Chair 3',
    rating: 4.7,
    reviewsCount: 96,
    priceFrom: 20,
    gapMin: 0,
    whatsapp: '',
    daysOff: [2],
    bio: 'Freehand designs and curly work.',
  },
  {
    displayName: 'Tony Feghali',
    email: 'tony@faderoom.app',
    specialty: 'Hot towel shave · beard',
    chair: 'Chair 4',
    rating: 5.0,
    reviewsCount: 73,
    priceFrom: 18,
    gapMin: 15,
    whatsapp: '+961 3 444 000',
    daysOff: [0],
    bio: 'Straight razor, hot towel, and a beard trim that grows out clean.',
  },
];

const SERVICES = [
  { name: 'Haircut', durationMin: 45, price: 25, description: 'Consultation, cut, wash & style' },
  { name: 'Beard trim', durationMin: 20, price: 12, description: 'Shape up, line, oil finish' },
  { name: 'Haircut + Beard', durationMin: 60, price: 32, description: 'Full grooming session' },
  { name: 'Hot towel shave', durationMin: 40, price: 20, description: 'Straight razor, hot towel, balm' },
  { name: 'Kids cut', durationMin: 30, price: 15, description: 'Under 12 · patient & quick' },
  { name: 'Line up / edge', durationMin: 15, price: 10, description: 'Clean edges between visits' },
];

/* Owner is an index into ARTISTS, or null for the house label. */
const PRODUCTS = [
  { name: 'Matte Clay Pomade', brand: 'FadeRoom Label', category: 'Hair', price: 18, compareAtPrice: 22, size: '100 ml', owner: 0, icon: '🧴', rating: 4.8, reviewsCount: 64, stock: 14, tag: 'BESTSELLER', featured: true,
    description: 'Strong hold, zero shine. Reactivates with water so you can reshape it any time during the day.',
    howToUse: 'Warm a fingertip between dry palms, work through towel-dried hair, shape with your fingers.' },
  { name: 'Sea Salt Texture Spray', brand: 'Nasr Shelf', category: 'Hair', price: 16, size: '150 ml', owner: 0, icon: '🌊', rating: 4.6, reviewsCount: 41, stock: 22,
    description: 'Adds grit and volume to a soft or fine top. The trick behind most of the textured crops in the lookbook.',
    howToUse: 'Spray on damp hair, scrunch, then rough-dry with your hands.' },
  { name: 'Cedar & Tonka Beard Oil', brand: 'Tony’s Bench', category: 'Beard', price: 14, size: '30 ml', owner: 3, icon: '🧔', rating: 4.9, reviewsCount: 88, stock: 9, tag: 'ARTIST PICK',
    description: 'Jojoba and argan base. Stops the itch in the first two weeks of growing a beard out.',
    howToUse: 'Three drops into your palm, work down to the skin, comb through.' },
  { name: 'Shea Beard Balm', brand: 'Tony’s Bench', category: 'Beard', price: 15, size: '60 ml', owner: 3, icon: '🧈', rating: 4.7, reviewsCount: 35, stock: 11,
    description: 'Heavier than the oil — for shaping a longer beard and taming the flyaways along the jaw.',
    howToUse: 'Scrape a thumbnail, melt between palms, press through from the cheeks down.' },
  { name: 'Carbon Steel Straight Razor', brand: 'Feghali Tools', category: 'Shave', price: 48, size: 'Full size', owner: 3, icon: '🪒', rating: 5.0, reviewsCount: 27, stock: 3, tag: 'PRO',
    description: 'The razor Tony uses on the hot towel shave. Carbon steel takes a keener edge than stainless and holds it longer.',
    howToUse: 'Strop before every shave, dry it fully after, oil the blade monthly.' },
  { name: 'Hot Towel Shave Kit', brand: 'FadeRoom Label', category: 'Shave', price: 34, compareAtPrice: 40, size: '5 pieces', owner: 3, icon: '🧖', rating: 4.9, reviewsCount: 52, stock: 6, tag: 'BUNDLE', featured: true,
    description: 'Pre-shave oil, cream, badger brush, alum block and balm — the chair-side ritual, boxed for home.',
    howToUse: 'Hot towel two minutes, oil, then cream with the brush in small circles.' },
  { name: 'Pre-Shave Oil', brand: 'FadeRoom Label', category: 'Shave', price: 12, size: '50 ml', owner: null, icon: '💧', rating: 4.5, reviewsCount: 19, stock: 0,
    description: 'A thin protective layer so the blade glides instead of dragging. The difference between a close shave and a rash.',
    howToUse: 'A few drops on damp skin before your cream.' },
  { name: 'Alcohol-Free Aftershave Balm', brand: 'FadeRoom Label', category: 'Aftercare', price: 13, size: '100 ml', owner: null, icon: '🌿', rating: 4.8, reviewsCount: 73, stock: 18,
    description: 'Calms without the sting. Aloe and witch hazel, no alcohol, no fragrance.',
    howToUse: 'Pat on straight after the razor while the skin is still damp.' },
  { name: 'Scalp Tonic', brand: 'Jad’s Shelf', category: 'Aftercare', price: 19, size: '120 ml', owner: 2, icon: '🧪', rating: 4.4, reviewsCount: 22, stock: 7,
    description: 'Menthol and rosemary. For flaking between cuts, or just a cold hit after a summer fade.',
    howToUse: 'Part the hair, apply to the scalp, massage in. Leave it — no rinse.' },
  { name: 'Fade Brush', brand: 'Chalhoub Kit', category: 'Tools', price: 9, size: 'Soft bristle', owner: 1, icon: '🖌️', rating: 4.5, reviewsCount: 31, stock: 25,
    description: 'Sweeps clippings off the neck and out of a fresh fade without dragging the line.',
    howToUse: 'Brush downward and out. Wash it weekly with soap.' },
  { name: 'Carbon Cutting Comb', brand: 'Chalhoub Kit', category: 'Tools', price: 6, size: '19 cm', owner: 1, icon: '💇', rating: 4.7, reviewsCount: 44, stock: 30,
    description: 'Antistatic and heat resistant. Fine teeth for the line up, wide for the top.',
    howToUse: 'The one comb worth owning if you only own one.' },
  { name: 'Clipper Blade Oil', brand: 'Nasr Shelf', category: 'Tools', price: 7, size: '60 ml', owner: 0, icon: '⚙️', rating: 4.8, reviewsCount: 29, stock: 16,
    description: 'Keeps a home trimmer cutting like it did out of the box. Blunt blades pull — this is why yours does.',
    howToUse: 'Three drops across the blade, run it ten seconds, wipe the excess.' },
];

const STYLES = [
  { title: 'Mid Skin Fade', category: 'Fades', durationMin: 45, price: 25, artist: 0 },
  { title: 'Textured Crop', category: 'Textured', durationMin: 45, price: 25, artist: 2 },
  { title: 'Classic Side Part', category: 'Classic', durationMin: 40, price: 22, artist: 1 },
  { title: 'Beard Sculpt', category: 'Beard', durationMin: 20, price: 12, artist: 3 },
  { title: 'Buzz + Line Up', category: 'Fades', durationMin: 25, price: 18, artist: 0 },
  { title: 'Pompadour', category: 'Classic', durationMin: 50, price: 28, artist: 1 },
  { title: 'Curly Taper', category: 'Textured', durationMin: 45, price: 26, artist: 2 },
  { title: 'Hard Part Design', category: 'Design', durationMin: 55, price: 30, artist: 2 },
];

/* `visitFrequencyWeeks` against a `lastCheckInAt` is what marks a client
   overdue in the artist's book — Hadi is deliberately well past his. */
const CLIENTS = [
  { name: 'Elie Saide', email: 'elie@faderoom.app', phone: '+961 70 123 456', dateOfBirth: '1994-03-21', visitFrequencyWeeks: 3, stamps: 3, totalCheckIns: 13 },
  { name: 'Marc Aoun', email: 'marc@faderoom.app', phone: '+961 71 200 100', dateOfBirth: '1988-11-02', visitFrequencyWeeks: 4, stamps: 1, totalCheckIns: 6 },
  { name: 'Hadi Zgheib', email: 'hadi@faderoom.app', phone: '+961 76 331 220', dateOfBirth: '2001-06-14', visitFrequencyWeeks: 2, stamps: 4, totalCheckIns: 22 },
  { name: 'Nour Rahme', email: 'nour@faderoom.app', phone: '+961 3 887 445', dateOfBirth: '1979-01-30', visitFrequencyWeeks: 6, stamps: 0, totalCheckIns: 0 },
];

async function makeUser({ name, email, phone, role }) {
  const user = new User({ name, email, phone: phone || '', role });
  await user.setPassword(PASSWORD);
  await user.save();
  return user;
}

/** Next occurrence of `hour` that isn't in the past and isn't a day off. */
function upcoming(hour, daysAhead, daysOff = []) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, 30, 0, 0);
  let guard = 0;
  while ((d.getTime() < Date.now() || daysOff.includes(d.getDay())) && guard < 14) {
    d.setDate(d.getDate() + 1);
    guard += 1;
  }
  return d;
}

async function seed() {
  await connectDb();
  console.log('Clearing…');
  await Promise.all(
    [User, Artist, Service, Product, Style, Loyalty, Appointment, Order, CheckIn, Notification, ShopSettings].map(
      (m) => m.deleteMany({}),
    ),
  );

  console.log('Admin…');
  const admin = await makeUser({
    name: 'Shop Admin',
    email: 'admin@faderoom.app',
    phone: '+961 1 567 890',
    role: 'admin',
  });

  console.log('Artists…');
  const artists = [];
  for (const a of ARTISTS) {
    const user = await makeUser({ name: a.displayName, email: a.email, role: 'artist' });
    artists.push(
      await Artist.create({
        user: user._id,
        displayName: a.displayName,
        specialty: a.specialty,
        bio: a.bio,
        chair: a.chair,
        rating: a.rating,
        reviewsCount: a.reviewsCount,
        priceFrom: a.priceFrom,
        /* Left to each artist, so a fresh shop shows the setting doing something
           rather than every chair running on the same rhythm. */
        gapMin: a.gapMin,
        /* Jad leaves his empty, so the fallback to the shop number is visible. */
        whatsapp: a.whatsapp,
        daysOff: a.daysOff,
      }),
    );
  }

  console.log('Services…');
  const services = await Service.insertMany(SERVICES.map((s) => ({ ...s, artist: null })));

  console.log('Products…');
  await Product.insertMany(
    PRODUCTS.map((p) => ({
      ...p,
      owner: p.owner === null ? null : artists[p.owner]._id,
      status: 'published',
      createdBy: admin._id,
    })),
  );

  console.log('Lookbook…');
  await Style.insertMany(
    STYLES.map((s) => ({ ...s, artist: artists[s.artist]._id, status: 'published' })),
  );

  console.log('Clients…');
  const clients = [];
  for (const c of CLIENTS) {
    const user = await makeUser({ name: c.name, email: c.email, phone: c.phone, role: 'client' });
    user.dateOfBirth = c.dateOfBirth;
    user.visitFrequencyWeeks = c.visitFrequencyWeeks;
    user.preferences = {
      clipperGuard: '#2 sides, scissor top',
      beard: 'Line up, keep length',
      part: 'Natural left',
      notes: c.name === 'Elie Saide' ? 'Sensitive skin — no alcohol aftershave.' : '',
      preferredArtist: artists[0]._id,
    };
    await user.save();

    await Loyalty.create({
      user: user._id,
      totalCheckIns: c.totalCheckIns,
      stamps: Array.from({ length: c.stamps }, (_, i) => ({
        at: new Date(Date.now() - (c.stamps - i) * 13 * 86_400_000),
        artist: artists[i % artists.length]._id,
      })),
      /* Backdated so the cooldown never blocks the very first demo check-in. */
      lastCheckInAt: c.stamps ? new Date(Date.now() - 13 * 86_400_000) : null,
    });

    clients.push(user);
  }

  console.log('Appointments…');
  const haircut = services.find((s) => s.name === 'Haircut');
  await Appointment.create({
    user: clients[0]._id,
    artist: artists[0]._id,
    service: haircut._id,
    serviceName: haircut.name,
    startsAt: upcoming(16, 0, artists[0].daysOff),
    durationMin: haircut.durationMin,
    price: haircut.price,
    status: 'confirmed',
    notes: '#2 on the sides, keep the top long',
  });

  const shave = services.find((s) => s.name === 'Hot towel shave');
  await Appointment.create({
    user: clients[2]._id,
    artist: artists[3]._id,
    service: shave._id,
    serviceName: shave.name,
    startsAt: upcoming(12, 1, artists[3].daysOff),
    durationMin: shave.durationMin,
    price: shave.price,
    status: 'confirmed',
  });

  /* Two clients asking Karim for the same time, so a fresh clone opens on the
     decision the whole booking flow is built around: neither holds the chair,
     and accepting one closes the other out. */
  const contested = upcoming(17, 0, artists[0].daysOff);
  for (const [index, notes] of [
    [1, 'Hair and beard, please — going out straight after'],
    [3, 'Just a tidy-up on the sides'],
  ]) {
    await Appointment.create({
      user: clients[index]._id,
      artist: artists[0]._id,
      service: haircut._id,
      serviceName: haircut.name,
      startsAt: contested,
      durationMin: haircut.durationMin,
      price: haircut.price,
      status: 'pending',
      notes,
    });
  }

  /* The shop's own settings, so a fresh clone has a loyalty card rather than
     whatever a first CMS visit happens to create. */
  console.log('Shop settings…');
  const settings = await getSettings();
  settings.loyalty.goal = env.loyaltyGoal;
  settings.loyalty.freeCutValue = env.freeCutValue;
  await settings.save();

  console.log('Welcome message…');
  await Notification.create({
    title: 'The FadeRoom shop is open',
    body: 'Every product our artists use at the chair is now in the app. Free pickup, or delivery inside Beirut.',
    audience: 'clients',
    createdBy: admin._id,
    createdByName: admin.name,
  });

  console.log(`
Seeded.

  Admin   admin@faderoom.app   / ${PASSWORD}
  Artist  karim@faderoom.app   / ${PASSWORD}   (also rami@, jad@, tony@)
  Client  elie@faderoom.app    / ${PASSWORD}   (also marc@, hadi@, nour@)

  ${artists.length} artists · ${services.length} services · ${PRODUCTS.length} products · ${STYLES.length} looks
  Loyalty: every ${settings.loyalty.goal} visits earns a free cut worth $${settings.loyalty.freeCutValue}
  (edit that in the back office under Settings — artists are never shown which bookings are free)
`);

  await disconnectDb();
}

seed().catch(async (err) => {
  console.error(err);
  await disconnectDb();
  process.exit(1);
});
