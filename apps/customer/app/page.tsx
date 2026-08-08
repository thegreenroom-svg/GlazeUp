'use client';

import { useEffect, useState } from 'react';
import { useSession, useSupabaseClient } from '@supabase/auth-helpers-react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Calendar, PaletteIcon, Award, Sparkles } from 'lucide-react';

export default function Home() {
  const session = useSession();
  const supabase = useSupabaseClient();
  const [studios, setStudios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch nearby/available studios
    const fetchStudios = async () => {
      try {
        const { data, error } = await supabase
          .from('studios')
          .select('*')
          .eq('is_active', true)
          .limit(12);
        
        if (error) throw error;
        setStudios(data || []);
      } catch (err) {
        console.error('Error fetching studios:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStudios();
  }, [supabase]);

  return (
    <div className="w-full">
      {/* Hero */}
      <section className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-20 left-10 w-72 h-72 bg-clay/20 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 right-10 w-72 h-72 bg-terracotta/20 rounded-full blur-3xl"></div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center max-w-4xl mx-auto"
        >
          <motion.div
            className="inline-block mb-6 px-4 py-2 rounded-full bg-clay/10 border border-clay/30"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            <span className="text-clay font-semibold text-sm uppercase tracking-wide">
              Welcome to GlazeUp
            </span>
          </motion.div>

          <h1 className="mb-6 leading-tight">
            Discover, Create & Collect
            <br />
            <span className="text-clay">Pottery That Matters</span>
          </h1>

          <p className="text-xl text-charcoal/70 mb-8 max-w-2xl mx-auto leading-relaxed">
            Book a session at your favourite studio, paint something beautiful, watch it transform through the kiln, and keep your digital memories forever.
          </p>

          <motion.div
            className="flex gap-4 justify-center flex-wrap"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            {session ? (
              <>
                <Link href="/bookings" className="btn btn-primary">
                  View My Bookings
                </Link>
                <Link href="/collection" className="btn btn-secondary">
                  My Collection
                </Link>
              </>
            ) : (
              <>
                <Link href="/auth/signup" className="btn btn-primary">
                  Get Started
                </Link>
                <Link href="/auth/login" className="btn btn-secondary">
                  Sign In
                </Link>
              </>
            )}
          </motion.div>
        </motion.div>
      </section>

      {/* Features */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-center mb-16">Your Pottery Journey</h2>

          <div className="grid md:grid-cols-4 gap-8">
            {[
              {
                icon: <Calendar className="w-8 h-8" />,
                title: 'Book',
                description: 'Reserve your studio time with ease'
              },
              {
                icon: <PaletteIcon className="w-8 h-8" />,
                title: 'Create',
                description: 'Paint and design your ceramic piece'
              },
              {
                icon: <Sparkles className="w-8 h-8" />,
                title: 'Transform',
                description: 'Watch it come to life in the kiln'
              },
              {
                icon: <Award className="w-8 h-8" />,
                title: 'Collect',
                description: 'Keep your memories, earn rewards'
              }
            ].map((step, i) => (
              <motion.div
                key={i}
                className="card text-center"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                viewport={{ once: true }}
              >
                <div className="text-clay mb-4 flex justify-center">
                  {step.icon}
                </div>
                <h4 className="mb-2">{step.title}</h4>
                <p className="text-sm text-charcoal/60">{step.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Studios Grid */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="mb-16">Explore Studios</h2>

          {loading ? (
            <div className="grid md:grid-cols-3 gap-8">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="card-photo animate-shimmer h-64" />
              ))}
            </div>
          ) : (
            <div className="grid md:grid-cols-3 gap-8">
              {studios.length > 0 ? (
                studios.map((studio, i) => (
                  <motion.div
                    key={studio.id}
                    className="card-photo cursor-pointer hover:shadow-soft-lg transition-all"
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    viewport={{ once: true }}
                  >
                    <div className="bg-gradient-to-br from-clay/20 to-terracotta/20 h-48 flex items-center justify-center">
                      <PaletteIcon className="w-16 h-16 text-clay/30" />
                    </div>
                    <div className="p-6">
                      <h3 className="text-xl font-bold mb-1">{studio.name}</h3>
                      <p className="text-sm text-charcoal/60 mb-4">
                        {studio.city}, {studio.country}
                      </p>
                      <Link
                        href={`/studios/${studio.id}`}
                        className="text-clay font-semibold hover:text-terracotta"
                      >
                        View Studio →
                      </Link>
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="col-span-3 text-center py-12">
                  <p className="text-charcoal/60">No studios available yet</p>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* CTA */}
      {!session && (
        <section className="py-20 px-4 bg-clay/10 rounded-3xl mx-4 mb-12">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="mb-4">Ready to Create?</h2>
            <p className="text-lg text-charcoal/70 mb-8">
              Join hundreds of potters discovering their creative journey with GlazeUp.
            </p>
            <Link href="/auth/signup" className="btn btn-primary">
              Start Now
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
