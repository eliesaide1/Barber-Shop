export type Role = 'client' | 'artist' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  /** A calendar date, `YYYY-MM-DD`. Empty until the client has given it. */
  dateOfBirth: string;
  /** Weeks between cuts, as the client describes their own habit. */
  visitFrequencyWeeks: number | null;
  role: Role;
  initials: string;
  /** Only broadcasts and WhatsApp can be silenced — see the note on the server model. */
  notifications?: { broadcasts: boolean; whatsapp: boolean };
  preferences: {
    clipperGuard?: string;
    beard?: string;
    part?: string;
    notes?: string;
    preferredArtist?: string | null;
  };
}

export interface Artist {
  id: string;
  displayName: string;
  specialty: string;
  bio: string;
  chair: string;
  rating: number;
  reviewsCount: number;
  priceFrom: number;
  /** Turnaround between clients, in minutes — the artist's own setting. */
  gapMin: number;
  /** Dialled form of their own WhatsApp number, or null when they have not given one. */
  whatsappNumber: string | null;
  daysOff: number[];
  workingHours: { start: string; end: string };
  active: boolean;
}

export interface Service {
  id: string;
  name: string;
  description: string;
  durationMin: number;
  price: number;
}

export interface Product {
  id: string;
  name: string;
  brand: string;
  category: string;
  /**
   * Absent when the shop lists this one on request — the number is never sent,
   * so there is nothing to render and nothing to read out of the response.
   */
  price?: number;
  compareAtPrice?: number | null;
  /** Ask on WhatsApp instead. Such a product cannot be added to a cart. */
  priceHidden: boolean;
  size: string;
  description: string;
  howToUse: string;
  icon: string;
  images: string[];
  stock: number;
  rating: number;
  reviewsCount: number;
  tag: string;
  owner: Pick<Artist, 'id' | 'displayName' | 'specialty' | 'rating' | 'chair'> | null;
  inStock: boolean;
  /* The public catalogue only ever returns 'published'; the artist's own
     shelf (/products/manage/list) returns every state. */
  status: 'draft' | 'pending' | 'published' | 'archived';
}

export interface OrderItem {
  product: string;
  name: string;
  price: number;
  qty: number;
  icon: string;
  image: string;
}

export type Fulfilment = 'pickup' | 'delivery';
export type OrderStatus = 'ready' | 'collected' | 'packing' | 'out' | 'delivered' | 'cancelled';

export interface Order {
  id: string;
  items: OrderItem[];
  subtotal: number;
  fee: number;
  total: number;
  fulfilment: Fulfilment;
  address: { name: string; phone: string; line: string; note?: string } | null;
  payment: 'cash' | 'card';
  code: string;
  status: OrderStatus;
  withAppointment: boolean;
  isOpen: boolean;
  createdAt: string;
}

/**
 * `pending` is a *request*: it holds no slot, and the artist has yet to say
 * yes and how long they will give it. `declined` is that answer coming back no.
 */
export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'declined'
  | 'noshow';

export interface Appointment {
  id: string;
  artist: Pick<Artist, 'id' | 'displayName' | 'chair' | 'specialty' | 'rating'>;
  serviceName: string;
  startsAt: string;
  /** The time the client asked for — differs from startsAt when the artist moved it. */
  requestedStartsAt?: string | null;
  /** The service's estimate while pending; the artist's own length once confirmed. */
  durationMin: number;
  price: number;
  status: AppointmentStatus;
  notes: string;
  free: boolean;
  rewardCode: string | null;
  declineReason?: string;
  respondedAt?: string | null;
}

export interface Reward {
  code: string;
  earnedAt: string;
  status: 'available' | 'reserved' | 'redeemed';
  redeemedAt: string | null;
  /** How it was come by — earned over five visits, or given as a birthday gift. */
  kind?: 'loyalty' | 'birthday';
  /** What it is, when it is not the standard free cut. */
  label?: string;
  value?: number | null;
  /** Null for a reward that was earned: that was paid for and does not lapse. */
  expiresAt?: string | null;
}

export interface LoyaltyCard {
  stamps: number;
  goal: number;
  totalCheckIns: number;
  lastCheckInAt: string | null;
  history: { at: string; artist: string }[];
  rewards: Reward[];
  freeCutValue: number;
}

/** What raised a notification — drives its icon and where tapping it goes. */
export type NotificationKind = 'message' | 'booking' | 'order' | 'loyalty';

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  kind: NotificationKind;
  image?: string;
  sentAt: string;
  read: boolean;
  createdByName: string;
  /** Where it points, e.g. `{ screen: 'Appointments' }`. */
  data?: { screen?: string; id?: string } & Record<string, unknown>;
}

export interface Slot {
  time: string;
  startsAt: string;
  /** Nothing confirmed is in the way. Requests do not make a slot unavailable. */
  available: boolean;
  /** How many people have already asked for it — you would be joining a queue. */
  requested: number;
}

export interface ShopConfig {
  loyaltyGoal: number;
  freeCutValue: number;
  deliveryFee: number;
  freeDeliveryOver: number;
  checkinWindowMs: number;
  /** How many booking requests one client may have waiting at once. */
  maxOpenRequests: number;
  shop: { name: string; area: string; phone: string; hours: string };
  /** The "message us" button. A null number means it does not appear. */
  contact: { whatsapp: string | null; greeting: string; priceEnquiry: string };
}

/* ---------------- artist portal ---------------- */

/** An appointment as the artist's agenda returns it — client is populated. */
export interface AgendaEntry {
  id: string;
  user: { id: string; name: string; phone?: string; preferences?: User['preferences'] } | null;
  artist: { id: string; displayName: string; chair: string } | null;
  serviceName: string;
  startsAt: string;
  /** The time the client asked for — differs from startsAt when the artist moved it. */
  requestedStartsAt?: string | null;
  durationMin: number;
  price: number;
  status: AppointmentStatus;
  notes: string;
  free: boolean;
  rewardCode: string | null;
  declineReason?: string;
}

/** What `POST /appointments/:id/confirm` answers with. */
export interface ConfirmResult {
  appointment: AgendaEntry;
  /** Other requests for the same time that this decision closed out. */
  declined: number;
}

export interface CheckInEvent {
  _id?: string;
  id?: string;
  userName: string;
  kind: 'stamp' | 'earned' | 'redeemed';
  stampNumber: number | null;
  code: string | null;
  at: string;
}

export interface ClientBookEntry {
  user: {
    _id?: string;
    id?: string;
    name: string;
    email: string;
    phone?: string;
    dateOfBirth?: string;
    visitFrequencyWeeks?: number | null;
  };
  stamps: number;
  goal: number;
  totalCheckIns: number;
  lastCheckInAt: string | null;
  /** When they are next due, from their own stated habit. Null if unknown. */
  dueAt: string | null;
  overdue: boolean;
  owedRewards: number;
}

export interface CheckInToken {
  token: string;
  code: string;
  expiresInMs: number;
  windowMs: number;
}

export interface RewardLookup {
  reward: Reward;
  client: { id: string; name: string };
  value: number;
}

/** An order as the staff board returns it — user is populated. */
export interface ManagedOrder extends Omit<Order, 'address'> {
  user: { id: string; name: string; email: string; phone?: string } | null;
  address: Order['address'];
}

export type StyleCategory = 'Fades' | 'Classic' | 'Textured' | 'Beard' | 'Design';

export interface StyleLook {
  id: string;
  title: string;
  category: StyleCategory;
  durationMin: number;
  price: number;
  images: string[];
  artist: { id: string; displayName: string; rating?: number } | null;
  status: 'pending' | 'published' | 'rejected';
  saved?: boolean;
  createdAt: string;
}
