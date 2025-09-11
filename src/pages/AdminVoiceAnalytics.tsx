import React from 'react';
import Layout from '@/components/Layout';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Line, LineChart, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import { Button } from '@/components/ui/button';

type Metrics = {
  range: { from: string; to: string; days: number };
  totals: {
    sessions: number;
    sessions_with_basket: number;
    sessions_with_booking: number;
    basket_adds: number;
    basket_items: number;
    bookings: number;
    avg_rating: number | null;
    median_connection_ms: number;
    median_first_response_ms: number;
    median_total_duration_s: number;
    error_rate: number;
  };
  daily: Array<{
    day: string;
    sessions: number;
    basket_sessions: number;
    booking_sessions: number;
    basket_adds: number;
    basket_items: number;
    bookings: number;
    avg_rating: number | null;
  }>;
  by_device: Array<{ device_type: string; sessions: number }>;
  by_browser: Array<{ browser: string; sessions: number }>;
};

async function fetchMetrics(days: number): Promise<Metrics> {
  const res = await fetch(`/api/voice/metrics?days=${days}`);
  if (!res.ok) throw new Error(`Failed metrics: ${res.status}`);
  return res.json();
}

const StatCard: React.FC<{ title: string; value: string | number; sub?: string }>
  = ({ title, value, sub }) => (
  <Card className="p-5 bg-white border-[#514640]/10 shadow-sm">
    <div className="text-sm text-[#514640]/70">{title}</div>
    <div className="text-2xl font-bold text-[#514640] mt-1">{value}</div>
    {sub ? <div className="text-xs text-[#514640]/60 mt-1">{sub}</div> : null}
  </Card>
);

const AdminVoiceAnalytics: React.FC = () => {
  const [days, setDays] = React.useState(14);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['voice-metrics', days],
    queryFn: () => fetchMetrics(days),
  });

  const t = data?.totals;
  const conversionBasket = t && t.sessions ? `${Math.round((t.sessions_with_basket / t.sessions) * 100)}%` : '—';
  const conversionBooking = t && t.sessions ? `${Math.round((t.sessions_with_booking / t.sessions) * 100)}%` : '—';
  const errorRate = t ? `${Math.round((t.error_rate || 0) * 100)}%` : '—';

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[#514640]">Voice Analytics</h1>
            <p className="text-[#514640]/70 mt-1">Sessions, conversions, latency and reliability</p>
          </div>
          <div className="flex gap-2 items-center">
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="border rounded px-2 py-1 text-sm">
              <option value={7}>7d</option>
              <option value={14}>14d</option>
              <option value={30}>30d</option>
            </select>
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? 'Refreshing…' : 'Refresh'}
            </Button>
            <Button onClick={async () => {
              try {
                const res = await fetch(`/api/voice/sessions?days=${days}&format=csv`);
                if (!res.ok) throw new Error(`Export failed: ${res.status}`);
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                const d = new Date();
                a.download = `voice_sessions_${d.toISOString().slice(0,10)}_${days}d.csv`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
              } catch (e) {
                console.error(e);
                alert(String((e as any)?.message || e));
              }
            }}>Export CSV</Button>
          </div>
        </div>

        {error && (
          <Card className="p-4 mt-4 text-red-600">{String((error as any)?.message || error)}</Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
          <StatCard title="Sessions" value={t?.sessions ?? '—'} />
          <StatCard title="Basket Sessions" value={t?.sessions_with_basket ?? '—'} sub={`Conv: ${conversionBasket}`} />
          <StatCard title="Booking Sessions" value={t?.sessions_with_booking ?? '—'} sub={`Conv: ${conversionBooking}`} />
          <StatCard title="Avg Rating" value={t?.avg_rating ?? '—'} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
          <StatCard title="Basket Adds" value={t?.basket_adds ?? '—'} sub={`Items: ${t?.basket_items ?? '—'}`} />
          <StatCard title="Bookings" value={t?.bookings ?? '—'} />
          <StatCard title="Median Connect" value={(t?.median_connection_ms ?? 0) + ' ms'} />
          <StatCard title="Error Rate" value={errorRate} />
        </div>

        <Card className="mt-6 p-4 bg-white border-[#514640]/10 shadow-sm">
          <div className="text-sm font-semibold text-[#514640] mb-2">Daily Sessions</div>
          <ChartContainer
            config={{ sessions: { label: 'Sessions', color: '#E3833B' }, basket_sessions: { label: 'Basket', color: '#00897B' }, booking_sessions: { label: 'Booking', color: '#6A5ACD' } }}
            className="w-full h-[320px]"
          >
            <LineChart data={data?.daily || []} margin={{ left: 16, right: 16, top: 12, bottom: 12 }}>
              <CartesianGrid strokeDasharray="4 4" />
              <XAxis dataKey="day" tickMargin={8} />
              <YAxis allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Legend />
              <Line type="monotone" dataKey="sessions" stroke="#E3833B" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="basket_sessions" stroke="#00897B" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="booking_sessions" stroke="#6A5ACD" strokeWidth={2} dot={false} />
            </LineChart>
          </ChartContainer>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <Card className="p-4">
            <div className="text-sm font-semibold text-[#514640] mb-2">Devices</div>
            <ul className="text-sm text-[#514640]">
              {(data?.by_device || []).map((d) => (
                <li key={d.device_type} className="flex justify-between py-1 border-b border-transparent hover:border-[#514640]/10">
                  <span className="capitalize">{d.device_type}</span>
                  <span className="font-mono">{d.sessions}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-4">
            <div className="text-sm font-semibold text-[#514640] mb-2">Browsers</div>
            <ul className="text-sm text-[#514640]">
              {(data?.by_browser || []).map((d) => (
                <li key={d.browser} className="flex justify-between py-1 border-b border-transparent hover:border-[#514640]/10">
                  <span className="capitalize">{d.browser}</span>
                  <span className="font-mono">{d.sessions}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default AdminVoiceAnalytics;
