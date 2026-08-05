import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Product } from '../types';

const KEY = 'faderoom.cart';

export interface CartLine {
  product: Product;
  qty: number;
}

interface CartContextValue {
  lines: CartLine[];
  count: number;
  subtotal: number;
  add: (product: Product, qty?: number) => { ok: boolean; message: string };
  setQty: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  qtyOf: (productId: string) => number;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw) setLines(JSON.parse(raw));
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(KEY, JSON.stringify(lines)).catch(() => {});
  }, [lines, loaded]);

  /* Stock is checked again by the server at checkout — this is only so the
     UI can't offer a quantity the shelf plainly doesn't have. */
  const add = useCallback((product: Product, qty = 1) => {
    if (product.stock <= 0) return { ok: false, message: 'That one is sold out' };

    let message = `${product.name} added`;
    let ok = true;

    setLines((current) => {
      const existing = current.find((l) => l.product.id === product.id);
      const have = existing?.qty ?? 0;
      const want = Math.min(have + qty, product.stock);
      if (want === have) {
        ok = false;
        message = `Only ${product.stock} in stock — already in your cart`;
        return current;
      }
      return existing
        ? current.map((l) => (l.product.id === product.id ? { ...l, qty: want } : l))
        : [...current, { product, qty: want }];
    });

    return { ok, message };
  }, []);

  const setQty = useCallback((productId: string, qty: number) => {
    setLines((current) => {
      const line = current.find((l) => l.product.id === productId);
      if (!line) return current;
      const next = Math.max(0, Math.min(qty, line.product.stock));
      if (next === 0) return current.filter((l) => l.product.id !== productId);
      return current.map((l) => (l.product.id === productId ? { ...l, qty: next } : l));
    });
  }, []);

  const value = useMemo<CartContextValue>(() => {
    const count = lines.reduce((t, l) => t + l.qty, 0);
    const subtotal = lines.reduce((t, l) => t + l.product.price * l.qty, 0);
    return {
      lines,
      count,
      subtotal,
      add,
      setQty,
      remove: (id) => setLines((c) => c.filter((l) => l.product.id !== id)),
      clear: () => setLines([]),
      qtyOf: (id) => lines.find((l) => l.product.id === id)?.qty ?? 0,
    };
  }, [lines, add, setQty]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
