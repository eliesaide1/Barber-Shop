import { basketEnquiry } from '../src/lib/whatsapp';

const config: any = { shop: { name: 'VIA Barber House' }, contact: { whatsapp: '96181427439' } };

const line = (name: string, qty: number, images: string[] = []) => ({
  product: { name, brand: 'VIA', size: '100ml', images },
  qty,
});

it('lists every line with its quantity', () => {
  const msg = basketEnquiry([line('Matte Pomade', 2), line('Beard Oil', 1)], config);
  expect(msg).toContain('2 × VIA · Matte Pomade · 100ml');
  expect(msg).toContain('1 × VIA · Beard Oil · 100ml');
  expect(msg).toContain('VIA Barber House');
});

it('names no price, because none was published to the app', () => {
  const msg = basketEnquiry([line('Matte Pomade', 3)], config);
  expect(msg).not.toMatch(/\$|total:\s*\d/i);
  expect(msg).toContain('confirm the total');
});

it('resolves an image path to a link the shop can open', () => {
  const msg = basketEnquiry([line('Matte Pomade', 1, ['/uploads/pomade.jpg'])], config);
  expect(msg).toMatch(/https?:\/\/.+\/uploads\/pomade\.jpg/);
});

it('omits the link for a product with no photograph', () => {
  const msg = basketEnquiry([line('Matte Pomade', 1)], config);
  expect(msg).not.toContain('http');
});
