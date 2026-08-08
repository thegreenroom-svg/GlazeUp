'use client';

import { useEffect, useState } from 'react';
import { useSession, useSupabaseClient } from '@supabase/auth-helpers-react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Image as ImageIcon, Archive, Zap, AlertCircle, Filter } from 'lucide-react';
import Link from 'next/link';

interface Piece {
  id: string;
  piece_name: string;
  item_type: string;
  status: string;
  created_at: string;
  collected_at: string;
  piece_photos: any[];
  piece_designs: any;
}

export default function CollectionPage() {
  const session = useSession();
  const supabase = useSupabaseClient();
  const router = useRouter();

  const [pieces, setPieces] = useState<Piece[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    if (!session) {
      router.push('/auth/login');
      return;
    }

    const loadPieces = async () => {
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

        // Get pieces
        let query = supabase
          .from('ceramic_pieces')
          .select('*, piece_photos(*), piece_designs(*)')
          .eq('customer_id', customerData.id)
          .order('created_at', { ascending: false });

        if (filter !== 'all') {
          query = query.eq('status', filter);
        }

        const { data } = await query;
        setPieces(data || []);
      } catch (err) {
        console.error('Error loading collection:', err);
      } finally {
        setLoading(false);
      }
    };

    loadPieces();
  }, [session, supabase, router, filter]);

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      'created': 'Created',
      'painted': 'Painted',
      'drying': 'Drying',
      'glazing': 'Glazing',
      'kiln_queue': 'In Queue',
      'firing': 'Firing',
      'quality_check': 'Quality Check',
      'ready_for_collection': 'Ready',
      'collected': 'Collected',
      'archived': 'Archived'
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: string) => {
    if (status === 'collected') return 'status-collected';
    if (status === 'ready_for_collection') return 'status-ready';
    if (status === 'firing') return 'status-firing';
    if (status === 'kiln_queue') return 'status-kiln_queue';
    if (status === 'painted') return 'status-painted';
    return 'status-created';
  };

  const statuses = [
    { value: 'all', label: 'All Pieces' },
    { value: 'painted', label: 'Painted' },
    { value: 'firing', label: 'Firing' },
    { value: 'ready_for_collection', label: 'Ready' },
    { value: 'collected', label: 'Collected' }
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="mb-4">My Collection</h1>
        <p className="text-charcoal/60 mb-6">
          Your permanent digital gallery of handmade pottery
        </p>

        <div className="flex gap-2 flex-wrap">
          {statuses.map((status) => (
            <button
              key={status.value}
              onClick={() => setFilter(status.value)}
              className={`btn ${
                filter === status.value ? 'btn-primary' : 'btn-secondary'
              }`}
            >
              <Filter className="w-4 h-4 mr-1" />
              {status.label}
            </button>
          ))}
        </div>
      </motion.div>

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block w-12 h-12 border-4 border-sand border-t-clay rounded-full animate-spin"></div>
        </div>
      ) : pieces.length > 0 ? (
        <div className="grid md:grid-cols-3 gap-6">
          {pieces.map((piece, i) => (
            <motion.div
              key={piece.id}
              className="card-photo group cursor-pointer"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              layoutId={piece.id}
            >
              {/* Photo */}
              {piece.piece_photos && piece.piece_photos.length > 0 ? (
                <div className="relative overflow-hidden h-48 bg-sand/20">
                  <img
                    src={piece.piece_photos[0].photo_url}
                    alt={piece.piece_name || piece.item_type}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                    <a
                      href={piece.piece_photos[0].photo_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cream text-sm font-semibold hover:underline"
                    >
                      View Full
                    </a>
                  </div>
                </div>
              ) : (
                <div className="h-48 bg-gradient-to-br from-sand to-clay/20 flex items-center justify-center">
                  <ImageIcon className="w-12 h-12 text-clay/30" />
                </div>
              )}

              {/* Details */}
              <div className="p-4">
                <div className="mb-3">
                  <h3 className="font-bold text-lg">
                    {piece.piece_name || piece.item_type || 'Untitled Piece'}
                  </h3>
                  <p className="text-sm text-charcoal/60">
                    {new Date(piece.created_at).toLocaleDateString()}
                  </p>
                </div>

                {/* Status Badge */}
                <div className="flex items-center gap-2 mb-4">
                  <span className={`status-dot ${getStatusColor(piece.status)}`}></span>
                  <span className="text-sm font-medium text-charcoal/70">
                    {getStatusLabel(piece.status)}
                  </span>
                </div>

                {/* Actions */}
                <div className="space-y-2">
                  <Link
                    href={`/pieces/${piece.id}`}
                    className="block text-center py-2 rounded-lg bg-clay/10 text-clay hover:bg-clay/20 transition-colors font-semibold text-sm"
                  >
                    View Details
                  </Link>

                  {piece.status === 'ready_for_collection' && (
                    <button className="w-full py-2 rounded-lg bg-green-100 text-green-900 hover:bg-green-200 transition-colors font-semibold text-sm">
                      Mark as Collected
                    </button>
                  )}

                  {piece.status === 'collected' && (
                    <button className="w-full py-2 rounded-lg bg-gray-100 text-gray-900 hover:bg-gray-200 transition-colors font-semibold text-sm flex items-center justify-center gap-2">
                      <Archive className="w-4 h-4" />
                      Archive
                    </button>
                  )}
                </div>
              </div>

              {/* Fire badge if in kiln */}
              {['kiln_queue', 'firing'].includes(piece.status) && (
                <div className="absolute top-3 right-3 bg-orange-500 text-white p-2 rounded-full shadow-lg">
                  <Zap className="w-4 h-4" />
                </div>
              )}
            </motion.div>
          ))}
        </div>
      ) : (
        <motion.div
          className="card text-center py-16"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <ImageIcon className="w-16 h-16 text-clay/20 mx-auto mb-4" />
          <h3 className="mb-2">No Pieces Yet</h3>
          <p className="text-charcoal/60 mb-6">
            {filter === 'all'
              ? "Your collection is empty. Book a session to create your first piece."
              : `No ${filter} pieces in your collection.`}
          </p>
          {filter === 'all' && (
            <Link href="/studios" className="btn btn-primary">
              Book Your First Session
            </Link>
          )}
        </motion.div>
      )}
    </div>
  );
}
