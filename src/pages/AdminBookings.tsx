import React, { useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type Booking = {
  id: string;
  status: 'confirmed' | 'cancelled' | string;
  source?: string;
  createdAt: string;
  venue: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  partySize: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  specialRequests?: string | null;
};

type BookingResponse = { total: number; items: Booking[] };

function toDateTime(b: Booking) {
  // Interpret date/time in local timezone
  const [y, m, d] = b.date.split('-').map(Number);
  const [hh, mm] = b.time.split(':').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
}

const fetchBookings = async (): Promise<BookingResponse> => {
  const r = await fetch('/api/bookings');
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || `Failed to load bookings (${r.status})`);
  }
  return r.json();
};

const StatCard: React.FC<{ title: string; value: string | number; sub?: string }> = ({ title, value, sub }) => (
  <Card className="p-5 bg-white border-[#514640]/10 shadow-sm">
    <div className="text-sm text-[#514640]/70">{title}</div>
    <div className="text-2xl font-bold text-[#514640] mt-1">{value}</div>
    {sub ? <div className="text-xs text-[#514640]/60 mt-1">{sub}</div> : null}
  </Card>
);

const AdminBookings: React.FC = () => {
  const { data, isLoading, error, refetch, isFetching } = useQuery({ queryKey: ['bookings'], queryFn: fetchBookings });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'confirmed' | 'cancelled'>('all');
  const [minParty, setMinParty] = useState('');

  const items = data?.items || [];

  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);

  const stats = useMemo(() => {
    const total = items.length;
    const today = items.filter((b) => b.date === todayKey).length;
    const upcoming = items.filter((b) => toDateTime(b) >= now).length;
    return { total, today, upcoming };
  }, [items, todayKey, now]);

  const filtered = useMemo(() => {
    return items
      .filter((b) => (status === 'all' ? true : b.status === status))
      .filter((b) => (minParty ? b.partySize >= Number(minParty) : true))
      .filter((b) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          b.id.toLowerCase().includes(q) ||
          b.name.toLowerCase().includes(q) ||
          (b.email || '').toLowerCase().includes(q) ||
          (b.phone || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => toDateTime(a).getTime() - toDateTime(b).getTime());
  }, [items, status, minParty, search]);

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[#514640]">Bookings Dashboard</h1>
            <p className="text-[#514640]/70 mt-1">All reservations created by the voice agent</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <StatCard title="Total Bookings" value={stats.total} />
          <StatCard title="Today" value={stats.today} />
          <StatCard title="Upcoming" value={stats.upcoming} />
        </div>

        <Card className="mt-6 p-4 bg-white border-[#514640]/10 shadow-sm">
          <div className="flex flex-col md:flex-row gap-3 md:items-center">
            <div className="flex-1">
              <Input placeholder="Search name, email, phone, booking ID" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="flex gap-3">
              <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Input type="number" min={1} placeholder="Min party" value={minParty} onChange={(e) => setMinParty(e.target.value)} className="w-[120px]" />
            </div>
          </div>
        </Card>

        <Card className="mt-6 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">Date</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Guest</TableHead>
                <TableHead>Party</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Requests</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Booking ID</TableHead>
                <TableHead className="text-right">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-[#514640]/70">Loading…</TableCell>
                </TableRow>
              )}
              {error && !isLoading && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-red-600">{String((error as any)?.message || error)}</TableCell>
                </TableRow>
              )}
              {!isLoading && !error && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-[#514640]/70">No bookings found</TableCell>
                </TableRow>
              )}
              {filtered.map((b) => (
                <TableRow key={b.id} className="hover:bg-[#F4EFE9]/40">
                  <TableCell className="font-medium">{new Date(b.date).toLocaleDateString('en-GB', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</TableCell>
                  <TableCell>{b.time}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{b.name}</span>
                      <div className="mt-1">
                        <Badge variant="secondary" className="capitalize">{b.status}</Badge>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{b.partySize}</TableCell>
                  <TableCell className="text-sm">
                    <div className="flex flex-col gap-0.5">
                      {b.email && <span>{b.email}</span>}
                      {b.phone && <span>{b.phone}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[280px] truncate" title={b.specialRequests || ''}>
                    {b.specialRequests || '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{b.source || 'voice'}</Badge>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs bg-[#F4EFE9] px-2 py-1 rounded">{b.id}</code>
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {new Date(b.createdAt).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </Layout>
  );
};

export default AdminBookings;

