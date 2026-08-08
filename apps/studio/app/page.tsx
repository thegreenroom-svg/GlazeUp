'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useSession, useSupabaseClient } from '@supabase/auth-helpers-react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Calendar,
  Users,
  Palette,
  Zap,
  Clock,
  AlertCircle,
  CheckCircle
} from 'lucide-react';

interface Booking {
  id: string;
  scheduled_at: string;
  party_size: number;
  status: string;
  customers: { display_name: string } | null;
  total_amount: number;
}

interface StudioStats {
  totalBookings: number;
  checkedInToday: number;
  piecesInKiln: number;
  readyForCollection: number;
}

export default function Dashboard() {
  const session = useSession();
  const supabase = useSupabaseClient();
  const router = useRouter();

  const [studio, setStudio] = useState<any>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [stats, setStats] = useState<StudioStats>({
    totalBookings: 0,
    checkedInToday: 0,
    piecesInKiln: 0,
    readyForCollection: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) {
      router.push('/auth/login');
      return;
    }

    const loadData = async () => {
      try {
        // Get user's studio
        const { data: userData } = await supabase
          .from('users')
          .select('studio_id, role')
          .eq('auth_id', session.user.id)
          .single();

        if (!userData) {
          router.push('/auth/onboarding');
          return;
        }

        // Get studio details
        const { data: studioData } = await supabase
          .from('studios')
          .select('*')
          .eq('id', userData.studio_id)
          .single();

        setStudio(studioData);

        // Get today's bookings
        const today = new Date().toISOString().split('T')[0];
        const tomorrow = new Date(Date.now() + 86400000)
          .toISOString()
          .split('T')[0];

        const { data: bookingsData } = await supabase
          .from('bookings')
          .select('*, customers(display_name)')
          .eq('studio_id', userData.studio_id)
          .gte('scheduled_at', today)
          .lt('scheduled_at', tomorrow)
          .order('scheduled_at', { ascending: true });

        setBookings(bookingsData || []);

        // Get stats
        const { count: totalBookings } = await supabase
          .from('bookings')
          .select('*', { count: 'exact', head: true })
          .eq('studio_id', userData.studio_id)
          .gte('scheduled_at', today)
          .lt('scheduled_at', tomorrow);

        const { count: checkedIn } = await supabase
          .from('bookings')
          .select('*', { count: 'exact', head: true })
          .eq('studio_id', userData.studio_id)
          .eq('status', 'checked-in')
          .gte('scheduled_at', today)
          .lt('scheduled_at', tomorrow);

        const { count: inKiln } = await supabase
          .from('ceramic_pieces')
          .select('*', { count: 'exact', head: true })
          .eq('studio_id', userData.studio_id)
          .in('status', ['kiln_queue', 'firing']);

        const { count: ready } = await supabase
          .from('ceramic_pieces')
          .select('*', { count: 'exact', head: true })
          .eq('studio_id', userData.studio_id)
          .eq('status', 'ready_for_collection');

        setStats({
          totalBookings: totalBookings || 0,
          checkedInToday: checkedIn || 0,
          piecesInKiln: inKiln || 0,
          readyForCollection: ready || 0
        });
      } catch (err) {
        console.error('Error loading dashboard:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();

    // Subscribe to real-time updates
    const bookingChannel = supabase
      .channel('bookings')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setBookings((prev) => [...prev, payload.new as Booking]);
          } else if (payload.eventType === 'UPDATE') {
            setBookings((prev) =>
              prev.map((b) => (b.id === payload.new.id ? (payload.new as Booking) : b))
            );
          }
        }
      )
      .subscribe();

    return () => {
      bookingChannel.unsubscribe();
    };
  }, [session, supabase, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin"></div>
          <p className="mt-4 text-gray-600">Loading studio dashboard...</p>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      icon: <Calendar className="w-6 h-6" />,
      label: 'Today\'s Bookings',
      value: stats.totalBookings,
      color: 'bg-blue-100 text-blue-900'
    },
    {
      icon: <Users className="w-6 h-6" />,
      label: 'Checked In',
      value: stats.checkedInToday,
      color: 'bg-green-100 text-green-900'
    },
    {
      icon: <Zap className="w-6 h-6" />,
      label: 'In Kiln',
      value: stats.piecesInKiln,
      color: 'bg-orange-100 text-orange-900'
    },
    {
      icon: <CheckCircle className="w-6 h-6" />,
      label: 'Ready for Collection',
      value: stats.readyForCollection,
      color: 'bg-purple-100 text-purple-900'
    }
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="mb-2">{studio?.name} - Studio Dashboard</h1>
        <p className="text-gray-600">
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric'
          })}
        </p>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid md:grid-cols-4 gap-6 mb-8">
        {statCards.map((stat, i) => (
          <motion.div
            key={i}
            className={`card ${stat.color}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium opacity-80">{stat.label}</p>
                <p className="text-3xl font-bold mt-1">{stat.value}</p>
              </div>
              {stat.icon}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <motion.a
          href="/bookings"
          className="card cursor-pointer hover:shadow-lg"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <div className="flex items-center gap-4">
            <div className="bg-blue-100 p-3 rounded-lg">
              <Calendar className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h4>Manage Bookings</h4>
              <p className="text-sm text-gray-600">Check in customers, allocate tables</p>
            </div>
          </div>
        </motion.a>

        <motion.a
          href="/pieces"
          className="card cursor-pointer hover:shadow-lg"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <div className="flex items-center gap-4">
            <div className="bg-purple-100 p-3 rounded-lg">
              <Palette className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h4>Track Pieces</h4>
              <p className="text-sm text-gray-600">Photo matching & lifecycle</p>
            </div>
          </div>
        </motion.a>

        <motion.a
          href="/kiln"
          className="card cursor-pointer hover:shadow-lg"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <div className="flex items-center gap-4">
            <div className="bg-orange-100 p-3 rounded-lg">
              <Zap className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <h4>Kiln Workflow</h4>
              <p className="text-sm text-gray-600">Manage batches & firing</p>
            </div>
          </div>
        </motion.a>
      </div>

      {/* Today's Bookings */}
      <motion.div
        className="card"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
      >
        <h3 className="mb-6">Today's Bookings</h3>

        {bookings.length > 0 ? (
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Customer</th>
                  <th>Party Size</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((booking) => (
                  <tr key={booking.id}>
                    <td>
                      <span className="font-medium">
                        {new Date(booking.scheduled_at).toLocaleTimeString('en-US', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </td>
                    <td>{booking.customers?.display_name || 'Unknown'}</td>
                    <td>{booking.party_size} people</td>
                    <td>
                      <span
                        className={`badge ${
                          booking.status === 'checked-in'
                            ? 'badge-success'
                            : booking.status === 'completed'
                            ? 'badge-primary'
                            : 'badge-secondary'
                        }`}
                      >
                        {booking.status}
                      </span>
                    </td>
                    <td>${booking.total_amount?.toFixed(2) || '0.00'}</td>
                    <td>
                      <a
                        href={`/bookings/${booking.id}`}
                        className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                      >
                        View
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <Calendar className="w-12 h-12 mx-auto opacity-30 mb-2" />
            <p>No bookings scheduled for today</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
