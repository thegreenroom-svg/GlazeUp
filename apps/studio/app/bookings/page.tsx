'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useSession, useSupabaseClient } from '@supabase/auth-helpers-react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { motion as m } from 'framer-motion';
import {
  Calendar,
  Clock,
  Users,
  CheckCircle,
  AlertCircle,
  Phone,
  Mail,
  Plus,
  Search
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Booking {
  id: string;
  scheduled_at: string;
  party_size: number;
  status: string;
  total_amount: number;
  notes: string;
  customers: { 
    id: string;
    user_id: string;
    display_name: string;
    email: string;
    phone: string;
  };
  ceramic_pieces: any[];
}

export default function BookingsPage() {
  const session = useSession();
  const supabase = useSupabaseClient();
  const router = useRouter();

  const [studioId, setStudioId] = useState<string | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('confirmed');

  useEffect(() => {
    if (!session) {
      router.push('/auth/login');
      return;
    }

    const loadData = async () => {
      try {
        // Get studio ID
        const { data: userData } = await supabase
          .from('users')
          .select('studio_id')
          .eq('auth_id', session.user.id)
          .single();

        if (!userData?.studio_id) {
          router.push('/auth/onboarding');
          return;
        }

        setStudioId(userData.studio_id);

        // Get today's bookings
        const today = new Date().toISOString().split('T')[0];
        const { data } = await supabase
          .from('bookings')
          .select('*, customers(id, user_id, display_name, email, phone, users(*)), ceramic_pieces(*)')
          .eq('studio_id', userData.studio_id)
          .gte('scheduled_at', today)
          .order('scheduled_at', { ascending: true });

        setBookings(data || []);
      } catch (err) {
        console.error('Error loading bookings:', err);
        toast.error('Failed to load bookings');
      } finally {
        setLoading(false);
      }
    };

    loadData();

    // Subscribe to real-time updates
    if (studioId) {
      const channel = supabase
        .channel(`bookings-${studioId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'bookings', filter: `studio_id=eq.${studioId}` },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              setBookings((prev) => [...prev, payload.new as Booking].sort((a, b) =>
                new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
              ));
            } else if (payload.eventType === 'UPDATE') {
              setBookings((prev) =>
                prev.map((b) => (b.id === payload.new.id ? (payload.new as Booking) : b))
              );
            }
          }
        )
        .subscribe();

      return () => {
        channel.unsubscribe();
      };
    }
  }, [session, supabase, router, studioId]);

  const handleCheckIn = async (bookingId: string) => {
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'checked-in', checked_in_at: new Date().toISOString() })
        .eq('id', bookingId);

      if (error) throw error;
      toast.success('Customer checked in');
    } catch (err) {
      console.error('Check-in error:', err);
      toast.error('Failed to check in');
    }
  };

  const handleComplete = async (bookingId: string) => {
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'completed' })
        .eq('id', bookingId);

      if (error) throw error;
      toast.success('Booking completed');
    } catch (err) {
      console.error('Complete error:', err);
      toast.error('Failed to complete booking');
    }
  };

  const filteredBookings = bookings
    .filter((b) => b.status === selectedStatus)
    .filter(
      (b) =>
        !searchTerm ||
        b.customers?.display_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.customers?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.customers?.phone?.includes(searchTerm)
    );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'bg-blue-50 border-blue-200';
      case 'checked-in':
        return 'bg-green-50 border-green-200';
      case 'completed':
        return 'bg-gray-50 border-gray-200';
      case 'cancelled':
        return 'bg-red-50 border-red-200';
      default:
        return 'bg-white border-gray-200';
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="inline-block w-12 h-12 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1>Bookings Management</h1>
        <button className="btn btn-primary flex items-center gap-2">
          <Plus className="w-5 h-5" />
          New Booking
        </button>
      </div>

      {/* Filters */}
      <div className="mb-6 flex gap-4 flex-wrap items-center">
        <div className="relative flex-1 min-w-64">
          <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, email, or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 pr-4 py-2 rounded-lg border border-gray-300 w-full"
          />
        </div>

        <div className="flex gap-2">
          {['confirmed', 'checked-in', 'completed', 'cancelled'].map((status) => (
            <button
              key={status}
              onClick={() => setSelectedStatus(status)}
              className={`btn btn-sm ${selectedStatus === status ? 'btn-primary' : 'btn-secondary'}`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Bookings List */}
      {filteredBookings.length > 0 ? (
        <div className="space-y-4">
          {filteredBookings.map((booking, i) => (
            <motion.div
              key={booking.id}
              className={`card border-2 ${getStatusColor(booking.status)}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <div className="grid md:grid-cols-2 gap-6">
                {/* Left - Booking Info */}
                <div>
                  <div className="mb-4">
                    <h3 className="text-lg font-bold mb-1">
                      {booking.customers?.display_name || 'Unknown Customer'}
                    </h3>
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                      <Calendar className="w-4 h-4" />
                      {new Date(booking.scheduled_at).toLocaleDateString()}
                      {' • '}
                      <Clock className="w-4 h-4" />
                      {new Date(booking.scheduled_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-gray-500" />
                      <span>{booking.party_size} people</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-gray-500" />
                      <a href={`mailto:${booking.customers?.email}`} className="text-blue-600 hover:underline">
                        {booking.customers?.email}
                      </a>
                    </div>
                    {booking.customers?.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-gray-500" />
                        <a href={`tel:${booking.customers.phone}`} className="text-blue-600 hover:underline">
                          {booking.customers.phone}
                        </a>
                      </div>
                    )}
                  </div>

                  {booking.notes && (
                    <div className="mt-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                      <p className="text-sm text-yellow-900">
                        <strong>Notes:</strong> {booking.notes}
                      </p>
                    </div>
                  )}
                </div>

                {/* Right - Pieces & Actions */}
                <div className="flex flex-col justify-between">
                  {booking.ceramic_pieces && booking.ceramic_pieces.length > 0 ? (
                    <div className="mb-4">
                      <h4 className="font-semibold text-sm mb-2">Pieces This Session</h4>
                      <div className="space-y-1">
                        {booking.ceramic_pieces.map((piece) => (
                          <div key={piece.id} className="text-sm p-2 bg-gray-100 rounded">
                            <span className="font-medium">{piece.piece_name || piece.item_type}</span>
                            <span className="text-gray-600 ml-2">({piece.status})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="mb-4 p-2 bg-gray-100 rounded text-sm text-gray-600">
                      No pieces created yet
                    </div>
                  )}

                  <div className="flex gap-2 justify-end">
                    {booking.status === 'confirmed' && (
                      <button
                        onClick={() => handleCheckIn(booking.id)}
                        className="btn btn-primary text-sm flex items-center gap-2"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Check In
                      </button>
                    )}

                    {booking.status === 'checked-in' && (
                      <button
                        onClick={() => handleComplete(booking.id)}
                        className="btn btn-primary text-sm flex items-center gap-2"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Complete
                      </button>
                    )}

                    <a
                      href={`/bookings/${booking.id}`}
                      className="btn btn-secondary text-sm"
                    >
                      Details
                    </a>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="card text-center py-12">
          <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="mb-2">No Bookings</h3>
          <p className="text-gray-600">
            {searchTerm
              ? 'No bookings match your search'
              : 'No bookings for this status'}
          </p>
        </div>
      )}
    </div>
  );
}
