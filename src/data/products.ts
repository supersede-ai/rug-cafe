export type CoffeeCategory = 'Espresso' | 'Filter' | 'Single Origin' | 'Decaf' | 'Blend' | 'Limited';

export type CoffeeProduct = {
  id: string;
  name: string;
  image: string;
  priceFrom: number;
  notes: string;
  category: CoffeeCategory;
  rating: number;
  reviews: number;
};

// Central catalogue used by UI and voice tools
export const COFFEE_PRODUCTS: CoffeeProduct[] = [
  {
    id: 'resolute-blend',
    name: 'Resolute House Blend',
    image:
      'https://images.unsplash.com/photo-1512568400610-62da28bc8a13?q=80&w=1400&auto=format&fit=crop',
    priceFrom: 11.5,
    notes: 'Stone fruit, caramel, milk chocolate',
    category: 'Blend',
    rating: 4.8,
    reviews: 1787,
  },
  {
    id: 'kenya-nyanja',
    name: 'Kenya Nyanja (Single Origin)',
    image:
      'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?q=80&w=1400&auto=format&fit=crop',
    priceFrom: 13.7,
    notes: 'Pear, rhubarb, white grape',
    category: 'Single Origin',
    rating: 4.7,
    reviews: 964,
  },
  {
    id: 'la-huella-washed',
    name: 'La Huella Washed',
    image:
      'https://images.unsplash.com/photo-1459755486867-b55449bb39ff?q=80&w=1400&auto=format&fit=crop',
    priceFrom: 16.7,
    notes: 'Green apple, pear, lemonade',
    category: 'Filter',
    rating: 4.9,
    reviews: 1231,
  },
  {
    id: 'daybreak-espresso',
    name: 'Daybreak Espresso',
    image:
      'https://images.unsplash.com/photo-1517701604599-bb29b565090c?q=80&w=1400&auto=format&fit=crop',
    priceFrom: 12.9,
    notes: 'Nougat, red berries, cocoa',
    category: 'Espresso',
    rating: 4.6,
    reviews: 842,
  },
  {
    id: 'mountain-water-decaf',
    name: 'Mountain Water Decaf',
    image:
      'https://images.unsplash.com/photo-1529078155058-5d716f45d604?q=80&w=1400&auto=format&fit=crop',
    priceFrom: 11.9,
    notes: 'Chocolate, toffee, balanced',
    category: 'Decaf',
    rating: 4.5,
    reviews: 511,
  },
  {
    id: 'micro-lot-ethiopia',
    name: 'Ethiopia Aricha Microlot',
    image:
      'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?q=80&w=1400&auto=format&fit=crop',
    priceFrom: 18.5,
    notes: 'Bergamot, jasmine, peach',
    category: 'Limited',
    rating: 5,
    reviews: 203,
  },
];

export function findProduct(query: string): CoffeeProduct | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  // Direct id match
  const idMatch = COFFEE_PRODUCTS.find((p) => p.id.toLowerCase() === q);
  if (idMatch) return idMatch;
  // Name contains
  const nameMatch = COFFEE_PRODUCTS.find((p) => p.name.toLowerCase().includes(q));
  if (nameMatch) return nameMatch;
  // Simple alias heuristics
  const aliasMap: Record<string, string> = {
    blend: 'resolute-blend',
    resolute: 'resolute-blend',
    decaf: 'mountain-water-decaf',
    kenya: 'kenya-nyanja',
    huella: 'la-huella-washed',
    espresso: 'daybreak-espresso',
    microlot: 'micro-lot-ethiopia',
    ethiopia: 'micro-lot-ethiopia',
  };
  const aliased = aliasMap[q];
  if (aliased) return COFFEE_PRODUCTS.find((p) => p.id === aliased) || null;
  return null;
}

