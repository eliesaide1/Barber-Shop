export type Role = 'client' | 'artist' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  initials: string;
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
  price: number;
  compareAtPrice: number | null;
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

export interface Appointment {
  id: string;
  artist: Pick<Artist, 'id' | 'displayName' | 'chair' | 'specialty' | 'rating'>;
  serviceName: string;
  startsAt: string;
  durationMin: number;
  price: number;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'noshow';
  notes: string;
  free: boolean;
  rewardCode: string | null;
}

export interface Reward {
  code: string;
  earnedAt: string;
  status: 'available' | 'reserved' | 'redeemed';
  redeemedAt: string | null;
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

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  image?: string;
  sentAt: string;
  read: boolean;
  createdByName: string;
}

export interface Slot {
  time: string;
  startsAt: string;
  available: boolean;
}

export interface ShopConfig {
  loyaltyGoal: number;
  freeCutValue: number;
  deliveryFee: number;
  freeDeliveryOver: number;
  checkinWindowMs: number;
  shop: { name: string; area: string; phone: string; hours: string };
}

/* ---------------- artist portal ---------------- */

/** An appointment as the artist's agenda returns it — client is populated. */
export interface AgendaEntry {
  id: string;
  user: { id: string; name: string; phone?: string; preferences?: User['preferences'] } | null;
  artist: { id: string; displayName: string; chair: string } | null;
  serviceName: string;
  startsAt: string;
  durationMin: number;
  price: number;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'noshow';
  notes: string;
  free: boolean;
  rewardCode: string | null;
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
  user: { _id?: string; id?: string; name: string; email: string; phone?: string };
  stamps: number;
  goal: number;
  totalCheckIns: number;
  lastCheckInAt: string | null;
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
