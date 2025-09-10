import React, { useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Link } from 'react-router-dom';
import { COFFEE_PRODUCTS, CoffeeProduct } from '@/data/products';
import { useCart } from '@/components/CartProvider';

const CATEGORIES: { key: CoffeeProduct['category']; label: string; color: string; icon: string }[] = [
  { key: 'Blend', label: 'Coffee Subscriptions', color: '#FDE6D3', icon: '🛒' },
  { key: 'Espresso', label: 'Espresso Coffee', color: '#1F2937', icon: '⚡' },
  { key: 'Filter', label: 'Filter Coffee', color: '#EAB8B0', icon: '🪄' },
  { key: 'Single Origin', label: 'Single Origin', color: '#F4A261', icon: '🌍' },
  { key: 'Decaf', label: 'Decaf Coffee', color: '#60A5FA', icon: '🌙' },
  { key: 'Limited', label: 'Limited Release', color: '#A78BFA', icon: '⭐' },
];

type SortKey = 'popular' | 'priceLow' | 'priceHigh' | 'rating';

const BuyCoffee: React.FC = () => {
  const { toast } = useToast();
  const { add } = useCart();
  const [sortBy, setSortBy] = useState<SortKey>('popular');
  const [activeCategory, setActiveCategory] = useState<CoffeeProduct['category'] | 'All'>('All');

  const filtered = useMemo(() => {
    const list = activeCategory === 'All' ? COFFEE_PRODUCTS : COFFEE_PRODUCTS.filter(p => p.category === activeCategory);
    switch (sortBy) {
      case 'priceLow':
        return [...list].sort((a, b) => a.priceFrom - b.priceFrom);
      case 'priceHigh':
        return [...list].sort((a, b) => b.priceFrom - a.priceFrom);
      case 'rating':
        return [...list].sort((a, b) => b.rating - a.rating);
      default:
        return list; // popular is pre-ordered
    }
  }, [sortBy, activeCategory]);

  const handleAdd = (product: CoffeeProduct) => {
    add({ id: product.id, name: product.name, price: product.priceFrom, image: product.image }, 1);
    toast({
      title: 'Added to bag',
      description: `${product.name} — £${product.priceFrom.toFixed(2)}+`,
    });
  };

  return (
    <Layout>
      <div className="bg-[#F4EFE9]">
        <div className="container mx-auto px-4 py-8">
          {/* Breadcrumb */}
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/">Home</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Buy Coffee</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Title */}
          <div className="text-center mt-6 mb-8">
            <h1 className="text-5xl md:text-6xl font-playfair font-bold text-[#3a2f2a]">Speciality Coffee</h1>
            <p className="mt-3 text-lg text-[#514640] max-w-2xl mx-auto">
              Freshly roasted beans for espresso and filter. Ethically sourced, seasonally curated.
            </p>
          </div>

          {/* Category quick links */}
          <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10 mb-10">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => setActiveCategory(c.key)}
                className={`flex flex-col items-center focus:outline-none`}>
                <div
                  className="w-20 h-20 rounded-full grid place-items-center shadow-md"
                  style={{ backgroundColor: c.color }}
                  aria-hidden
                >
                  <span className={`text-2xl ${c.key === 'Espresso' ? 'text-white' : 'text-[#3a2f2a]'}`}>{c.icon}</span>
                </div>
                <span className={`mt-3 text-center text-sm md:text-base ${activeCategory === c.key ? 'font-semibold text-[#3a2f2a]' : 'text-[#514640]'}`}>
                  {c.label}
                </span>
              </button>
            ))}
          </div>

          {/* Toolbar */}
          <div className="flex items-center justify-between mb-6">
            <p className="text-[#514640]">{filtered.length} Products</p>
            <div className="flex items-center gap-3">
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
                <SelectTrigger className="w-44 bg-white border-[#514640]/20 text-[#514640]">
                  <SelectValue placeholder="Filter & Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="popular">Popular</SelectItem>
                  <SelectItem value="priceLow">Price: Low to High</SelectItem>
                  <SelectItem value="priceHigh">Price: High to Low</SelectItem>
                  <SelectItem value="rating">Rating</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filtered.map((p) => (
              <Card key={p.id} className="overflow-hidden bg-white border-[#514640]/10">
                <div className="px-4 pt-4">
                  <AspectRatio ratio={16 / 9}>
                    <img
                      src={p.image}
                      alt={p.name}
                      className="w-full h-full object-cover rounded-md"
                      loading="lazy"
                    />
                  </AspectRatio>
                </div>
                <CardContent className="pb-6">
                  <div className="flex items-start justify-between gap-4 mt-4">
                    <div>
                      <h3 className="text-xl font-semibold text-[#3a2f2a]">{p.name}</h3>
                      <p className="text-[#6b5f59] mt-1">{p.notes}</p>
                    </div>
                    <div className="text-right whitespace-nowrap text-[#3a2f2a]">
                      <span className="text-sm text-[#6b5f59]">from</span>
                      <div className="text-lg font-semibold">£{p.priceFrom.toFixed(2)}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="text-sm text-[#6b5f59]">★ {p.rating.toFixed(1)} ({p.reviews.toLocaleString()})</div>
                    <button
                      onClick={() => handleAdd(p)}
                      className="px-4 py-2 rounded-full bg-[#E3833B] text-white text-sm font-semibold hover:bg-[#d97706] transition-colors"
                    >
                      Add to Bag
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default BuyCoffee;
