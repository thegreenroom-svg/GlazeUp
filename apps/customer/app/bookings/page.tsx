'use client';

import { useEffect, useState } from 'react';
import { useSession, useSupabaseClient } from '@supabase/auth-helpers-react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Calendar, MapPin, Users, Clock, ChevronRight, AlertCircle } from 'lucide-react';
import Link from 'next/link';

interface Booking {
  id: string;
  scheduled_at: string;
  party_size: number;
  status: string;
  total_amount: number;
  studios: { name: string; city: string };
  ceramic_pieces: any[];
}

export default function BookingsPage() {
  const session = useSession();
  const supabase = useSupabaseClient();
  const router = useRouter();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [upcomingOnly, setUpcomingOnly] = useState(true);

  useEffect(() => {
    if (!session) {
      router.push('/auth/login');
      return;
    }

    const loadBookings = async () => {
      try {
        // Get user's customer record
        const { data: userData } = await supabase
          .from('users')
          .select('id')
          .eq('auth_id', session.user.id)
          .single();

        if (!userData) return;

        const { data: customerData } = await supabase
          .from('customers')
          .select('id')
          .eq('user_id', userData.id)
          .single();

        if (!customerData) return;

        // Get bookings
        let query = supabase
          .from('bookings')
          .select('*, studios(name, city), ceramic_pieces(*)')
          .eq('customer_id', customerData.id);

        if (upcomingOnly) {
          query = query.gte('scheduled_at', new Date().toISOString());
        }

        const { data } = await query.order('scheduled_at', { ascending: false });
        setBookings(data || []);
      } catch (err) {
        console.error('Error loading bookings:', err);
      } finally {
        setLoading(false);
      }
    };

    loadBookings();
  }, [session, supabase, router, upcomingOnly]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'badge-primary';
      case 'checked-in':
        return 'badge-success';
      case 'completed':
        return 'badge-secondary';
      case 'cancelled':
        return 'badge-danger';
      default:
        return 'badge-secondary';
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="mb-4">My Bookings</h1>
        
        <div className="flex gap-4 flex-wrap">
          <button
            onClick={() => setUpcomingOnly(true)}
            className={`btn ${upcomingOnly ? 'btn-primary' : 'btn-secondary'}`}
          >
            Upcoming
          </button>
          <button
            onClick={() => setUpcomingOnly(false)}
            className={`btn ${!upcomingOnly ? 'btn-primary' : 'btn-secondary'}`}
          >
            All Bookings
          </button>
          <Link href="/studios" className="btn btn-secondary ml-auto">
            Book New Session
          </Link>
        </div>
      </motion.div>

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block w-12 h-12 border-4 border-sand border-t-clay rounded-full animate-spin"></div>
        </div>
      ) : bookings.length > 0 ? (
        <div className="space-y-4">
          {bookings.map((booking, i) => (
            <motion.div
              key={booking.id}
              className="card cursor-pointer hover:shadow-soft-lg"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Link
                href={`/bookings/${booking.id}`}
                className="block"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-bold mb-1">
                      {booking.studios?.name || 'Studio'}
                    </h3>
                    <p className="text-sm text-charcoal/60 flex items-center gap-1">
                      <MapPin className="w-4 h-4" />
                      {booking.studios?.city}
                    </p>
                  </div>
                  <span className={`badge ${getStatusColor(booking.status)}`}>
                    {booking.status}
                  </span>
                </div>

                <div className="grid md:grid-cols-4 gap-4 mb-4 pb-4 border-b border-sand">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-clay" />
                    <div>
                      <p className="text-xs text-charcoal/60">Date</p>
                      <p className="font-semibold">
                        {new Date(booking.scheduled_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-clay" />
                    <div>
                      <p className="text-xs text-charcoal/60">Time</p>
                      <p className="font-semibold">
                        {new Date(booking.scheduled_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-clay" />
                    <div>
                      <p className="text-xs text-charcoal/60">Party Size</p>
                      <p className="font-semibold">{booking.party_size} people</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-charcoal/60">Amount</p>
                    <p className="font-semibold">
                      £{booking.total_amount?.toFixed(2) || '0.00'}
                    </p>
                  </div>
                </div>

                {booking.ceramic_pieces && booking.ceramic_pieces.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold mb-2">
                      Pieces ({booking.ceramic_pieces.length})
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      {booking.ceramic_pieces.slice(0, 3).map((piece) => (
                        <span
                          key={piece.id}
                          className={`badge ${
                            piece.status === 'collected' ? 'badge-success' :
                            piece.status === 'ready_for_collection' ? 'badge-warning' :
                            piece.status === 'firing' ? 'badge-primary' :
                            'badge-secondary'
                          }`}
                        >
                          {piece.piece_name || piece.item_type} ({piece.status})
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between mt-4 pt-4 border-t border-sand text-clay font-semibold">
                  <span>View Details</span>
                  <ChevronRight className="w-5 h-5" />
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      ) : (
        <motion.div
          className="card text-center py-12"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <AlertCircle className="w-12 h-12 text-clay/30 mx-auto mb-4" />
          <h3 className="mb-2">No Bookings Yet</h3>
          <p className="text-charcoal/60 mb-6">
            Ready to create something beautiful?
          </p>
          <Link href="/studios" className="btn btn-primary">
            Browse Studios
          </Link>
        </motion.div>
      )}
    </div>
  );
}
