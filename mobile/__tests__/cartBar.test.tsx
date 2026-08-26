import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}) },
}));

const cart = { lines: [] as any[], count: 0 };
jest.mock('../src/store/CartContext', () => ({ useCart: () => cart }));
jest.mock('../src/store/AuthContext', () => ({
  useAuth: () => ({ config: { shop: { name: 'VIA Barber House' }, contact: { whatsapp: '961' } } }),
}));
jest.mock('../src/store/DialogContext', () => ({ useDialog: () => ({ alert: jest.fn() }) }));

import { ThemeProvider } from '../src/store/ThemeContext';
import { CartBar } from '../src/components/CartBar';

const render = async () => {
  let tree: any;
  await act(async () => {
    tree = renderer.create(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}
      >
        <ThemeProvider>
          <CartBar />
        </ThemeProvider>
      </SafeAreaProvider>,
    );
  });
  return JSON.stringify(tree.toJSON());
};

it('draws nothing while the basket is empty', async () => {
  cart.lines = [];
  cart.count = 0;
  expect(JSON.parse(await render()).children).toBeNull();
});

it('counts items, not money, and offers Finished', async () => {
  cart.lines = [{ product: { name: 'Pomade', priceHidden: true }, qty: 3 }];
  cart.count = 3;
  const json = await render();
  expect(json).toContain('3');
  expect(json).toContain('items');
  expect(json).toContain('Finished');
  expect(json).not.toContain('$');
});

it('says item, singular, for one', async () => {
  cart.lines = [{ product: { name: 'Pomade' }, qty: 1 }];
  cart.count = 1;
  const json = await render();
  expect(json).toContain('"1"');
  expect(json).toContain('item');
  // both the visible label and the spoken one
  expect(json).not.toContain('items');
});
