// Lightweight cart store (no React dependency)
// Persists to localStorage and exposes subscribe/unsubscribe for UI updates.

export type CartItem = {
  id: string;
  name: string;
  price: number; // unit price (using priceFrom)
  image: string;
  qty: number;
};

type Listener = () => void;

const LS_KEY = 'rug_cart_v1';
let items: CartItem[] = [];
const listeners = new Set<Listener>();

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) items = JSON.parse(raw) || [];
  } catch {}
}

function save() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items));
  } catch {}
}

function notify() {
  for (const cb of [...listeners]) cb();
  // Also broadcast a window event for non-React integrations
  try {
    const detail = { items, count: count(), total: total() };
    window.dispatchEvent(new CustomEvent('rug:cart', { detail }));
  } catch {}
}

function ensureLoaded() {
  if (!items.length && typeof window !== 'undefined') load();
}

export function getItems(): CartItem[] {
  ensureLoaded();
  return [...items];
}

export function count() {
  ensureLoaded();
  return items.reduce((n, it) => n + it.qty, 0);
}

export function total() {
  ensureLoaded();
  return items.reduce((s, it) => s + it.qty * it.price, 0);
}

export function add(input: Omit<CartItem, 'qty'>, qty = 1) {
  ensureLoaded();
  const i = items.findIndex((it) => it.id === input.id);
  if (i >= 0) items[i].qty += qty;
  else items.push({ ...input, qty });
  save();
  notify();
}

export function update(id: string, qty: number) {
  ensureLoaded();
  const i = items.findIndex((it) => it.id === id);
  if (i >= 0) {
    items[i].qty = Math.max(0, qty);
    if (items[i].qty === 0) items.splice(i, 1);
    save();
    notify();
  }
}

export function remove(id: string) {
  ensureLoaded();
  const before = items.length;
  items = items.filter((it) => it.id !== id);
  if (items.length !== before) {
    save();
    notify();
  }
}

export function clear() {
  ensureLoaded();
  items = [];
  save();
  notify();
}

export function subscribe(cb: Listener) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

