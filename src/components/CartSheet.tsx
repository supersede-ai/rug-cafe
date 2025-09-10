import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useCart } from '@/components/CartProvider';
import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';

const currency = (n: number) => `£${n.toFixed(2)}`;

const CartSheet: React.FC = () => {
  const { items, count, total, update, remove, clear } = useCart();

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          aria-label="Open shopping bag"
          className="relative border-2 border-[#514640] text-[#514640] px-3 py-2 rounded-full hover:bg-[#514640] hover:text-white transition-colors font-semibold flex items-center gap-2 text-sm whitespace-nowrap"
        >
          <ShoppingBag className="w-5 h-5" />
          <span>Bag</span>
          {count > 0 && (
            <span className="ml-1 inline-flex items-center justify-center rounded-full bg-[#E3833B] text-white text-[10px] w-5 h-5">
              {count}
            </span>
          )}
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="bg-white text-[#3a2f2a] w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-2xl">Your Bag</SheetTitle>
        </SheetHeader>
        <div className="mt-4 flex flex-col h-full">
          <div className="flex-1 overflow-auto divide-y divide-[#514640]/10">
            {items.length === 0 ? (
              <p className="text-[#514640]">Your bag is empty.</p>
            ) : (
              items.map((it) => (
                <div key={it.id} className="py-4 flex gap-4 items-center">
                  <img src={it.image} alt={it.name} className="w-20 h-20 object-cover rounded" />
                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold">{it.name}</p>
                        <p className="text-sm text-[#6b5f59]">{currency(it.price)}</p>
                      </div>
                      <button onClick={() => remove(it.id)} className="text-[#6b5f59] hover:text-red-600" aria-label={`Remove ${it.name}`}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="mt-2 inline-flex items-center gap-2">
                      <button aria-label="Decrease" className="p-1 rounded border border-[#514640]/30 hover:bg-[#F4EFE9]" onClick={() => update(it.id, Math.max(0, it.qty - 1))}>
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-8 text-center">{it.qty}</span>
                      <button aria-label="Increase" className="p-1 rounded border border-[#514640]/30 hover:bg-[#F4EFE9]" onClick={() => update(it.id, it.qty + 1)}>
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="pt-4 border-t border-[#514640]/10">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[#6b5f59]">Subtotal</span>
              <span className="font-semibold">{currency(total)}</span>
            </div>
            <div className="flex gap-2">
              <button
                className="flex-1 bg-[#E3833B] text-white py-3 rounded-full font-semibold hover:bg-[#d97706]"
                disabled={items.length === 0}
              >
                Checkout
              </button>
              <button
                className="px-4 py-3 rounded-full border border-[#514640]/30 text-[#514640] hover:bg-[#F4EFE9]"
                onClick={() => clear()}
                disabled={items.length === 0}
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default CartSheet;
