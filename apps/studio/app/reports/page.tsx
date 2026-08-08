'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { motion } from 'framer-motion';
import { BarChart3, TrendingUp, Calendar } from 'lucide-react';

interface ReportData {
  total_revenue: number;
  total_bookings: number;
  average_booking_value: number;
  bookings_this_month: number;
  revenue_this_month: number;
  daily_revenue: { [key: string]: number };
}

export default function ReportsPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState('month');
  const supabase = useSupabaseClient();

  useEffect(() => {
    fetchReports();
  }, [timeRange]);

  const fetchReports = async () => {
    try {
      setLoading(true);
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/bookings`, {
        headers: {
          'Authorization': `Bearer ${token || ''}`,
        },
      });

      if (response.ok) {
        const bookings = await response.json();
        
        // Calculate report data
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        
        const totalRevenue = bookings.reduce((sum: number, b: any) => sum + (b.total_price || 0), 0);
        const thisMonthBookings = bookings.filter((b: any) => new Date(b.created_at) >= monthStart);
        const thisMonthRevenue = thisMonthBookings.reduce((sum: number, b: any) => sum + (b.total_price || 0), 0);

        // Group by date for daily revenue
        const dailyRevenue: { [key: string]: number } = {};
        bookings.forEach((b: any) => {
          const date = new Date(b.created_at).toLocaleDateString();
          dailyRevenue[date] = (dailyRevenue[date] || 0) + (b.total_price || 0);
        });

        setData({
          total_revenue: totalRevenue,
          total_bookings: bookings.length,
          average_booking_value: bookings.length > 0 ? totalRevenue / bookings.length : 0,
          bookings_this_month: thisMonthBookings.length,
          revenue_this_month: thisMonthRevenue,
          daily_revenue: dailyRevenue,
        });
      } else {
        setError('Failed to fetch reports');
      }
    } catch (err) {
      setError('Error loading reports');
    } finally {
      setLoading(false);
    }
  };

  const MetricCard = ({ icon: Icon, label, value, subtext }: { icon: any; label: string; value: string; subtext?: string }) => (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        padding: '1.5rem',
        backgroundColor: 'white',
        border: '1px solid #ddd',
        borderRadius: '8px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
        <Icon size={24} color="#0066cc" />
        <p style={{ color: '#666', fontSize: '0.875rem' }}>{label}</p>
      </div>
      <h3 style={{ fontSize: '1.75rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>{value}</h3>
      {subtext && <p style={{ color: '#999', fontSize: '0.75rem' }}>{subtext}</p>}
    </motion.div>
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold' }}>Reports</h1>
        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value)}
          style={{
            padding: '0.5rem 1rem',
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="year">This Year</option>
          <option value="all">All Time</option>
        </select>
      </div>

      {error && <div style={{ padding: '1rem', backgroundColor: '#fee', color: '#c33', borderRadius: '4px', marginBottom: '2rem' }}>{error}</div>}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <p>Generating reports...</p>
        </div>
      ) : data ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            <MetricCard icon={TrendingUp} label="Total Revenue" value={`£${data.total_revenue.toFixed(2)}`} />
            <MetricCard icon={BarChart3} label="Total Bookings" value={`${data.total_bookings}`} />
            <MetricCard icon={Calendar} label="Avg Booking Value" value={`£${data.average_booking_value.toFixed(2)}`} />
            <MetricCard
              icon={Calendar}
              label="This Month"
              value={`£${data.revenue_this_month.toFixed(2)}`}
              subtext={`${data.bookings_this_month} bookings`}
            />
          </div>

          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '1.5rem', border: '1px solid #ddd' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>Daily Revenue Breakdown</h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #ddd' }}>
                    <th style={{ textAlign: 'left', padding: '0.75rem', fontWeight: '600' }}>Date</th>
                    <th style={{ textAlign: 'right', padding: '0.75rem', fontWeight: '600' }}>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.daily_revenue)
                    .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
                    .slice(0, 10)
                    .map(([date, revenue]) => (
                      <tr key={date} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '0.75rem' }}>{date}</td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '500' }}>£{revenue.toFixed(2)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </motion.div>
  );
}
