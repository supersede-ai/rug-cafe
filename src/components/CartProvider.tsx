import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as Cart from '@/lib/cart';

type CartContextValue = {
  items: Cart.CartItem[];
  count: number;
  total: number;
  add: (i: Omit<Cart.CartItem, 'qty'>, qty?: number) => void;
  update: (id: string, qty: number) => void;
  remove: (id: string) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    // Subscribe to cart updates
    const unsub = Cart.subscribe(() => setTick((n) => n + 1));
    // Trigger initial render with any LS state
    setTick((n) => n + 1);
    return () => unsub();
  }, []);

  const value = useMemo<CartContextValue>(() => ({
    items: Cart.getItems(),
    count: Cart.count(),
    total: Cart.total(),
    add: Cart.add,
    update: Cart.update,
    remove: Cart.remove,
    clear: Cart.clear,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [tick]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}

