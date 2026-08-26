import { Linking } from 'react-native';
import { absoluteUrl } from '../config';
import type { Artist, Product, ShopConfig } from '../types';

/**
 * Opening a WhatsApp conversation.
 *
 * The one WhatsApp path with no rules attached: the client is starting the
 * conversation, which is the case Meta imposes nothing on. No template, no
 * approval, no credentials — a link.
 */

/**
 * `wa.me` rather than the `whatsapp://` scheme.
 *
 * It opens the app when installed and a web page when not, and needs no
 * `queries` entry in the Android manifest to be usable — which the custom
 * scheme does, on Android 11 and up.
 */
export async function openWhatsApp(number: string, message?: string): Promise<boolean> {
  const text = message ? `?text=${encodeURIComponent(message)}` : '';
  try {
    await Linking.openURL(`https://wa.me/${number}${text}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Who to ask about a product.
 *
 * Its owner is the artist whose shelf it sits on, and they are the person who
 * knows what it costs. The house label has no owner, and an artist who has not
 * published a number hands the conversation to the shop rather than
 * dead-ending. Null when there is nobody at all — in which case there is no
 * button to draw.
 */
export function contactForProduct(
  product: Pick<Product, 'owner'>,
  config: ShopConfig | null,
): { number: string; name: string } | null {
  const owner = product.owner as (Artist & { whatsappNumber?: string | null }) | null;
  if (owner?.whatsappNumber) {
    return { number: owner.whatsappNumber, name: owner.displayName.split(' ')[0] };
  }
  if (config?.contact?.whatsapp) {
    return { number: config.contact.whatsapp, name: config.shop.name };
  }
  return null;
}

/**
 * The message a price enquiry opens with.
 *
 * Carries what the shop needs in order to answer without a second exchange:
 * which product, whose shelf, and the size — "how much is the pomade" is a
 * question somebody then has to ask three more questions about.
 */
export function priceEnquiry(
  product: Pick<Product, 'name' | 'brand' | 'size'>,
  config: ShopConfig | null,
): string {
  const described = [product.name, product.size].filter(Boolean).join(' · ');
  const template = config?.contact?.priceEnquiry ?? 'Hi, how much is {product}?';
  return template.replaceAll('{product}', described);
}

/**
 * The basket, as a message the shop can answer.
 *
 * Addressed to the shop rather than to each product's owner: a basket can hold
 * two artists' shelves, and splitting it would open two conversations for one
 * order and leave the client to explain themselves twice.
 *
 * No total, and no per-item price. Prices are not published to the app at all —
 * `forViewer` deletes them server-side rather than blanking them — so there is
 * no figure here to put in the text. Inventing one from a stale cache would be
 * worse than asking. The shop quotes, in the conversation, which is the whole
 * point of quoting rather than listing.
 *
 * Each line carries a link to the product's photograph, so whoever answers can
 * see what was meant without going and looking it up.
 */
export function basketEnquiry(
  lines: { product: Pick<Product, 'name' | 'brand' | 'size' | 'images'>; qty: number }[],
  config: ShopConfig | null,
): string {
  const items = lines.map(({ product, qty }) => {
    const described = [product.brand, product.name, product.size].filter(Boolean).join(' · ');
    const link = absoluteUrl(product.images?.[0]);
    return `• ${qty} × ${described}${link ? `\n  ${link}` : ''}`;
  });

  const shop = config?.shop?.name ?? 'the shop';
  return [
    `Hi ${shop}, I'd like to order:`,
    '',
    ...items,
    '',
    'Could you confirm the total and when I can collect it?',
  ].join('\n');
}

/** The shop's own number — who a basket goes to. Null when none is published. */
export function shopWhatsApp(config: ShopConfig | null): string | null {
  return config?.contact?.whatsapp ?? null;
}
