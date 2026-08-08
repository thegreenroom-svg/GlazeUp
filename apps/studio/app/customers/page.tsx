'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { motion } from 'framer-motion';
import { Users, Mail, Phone, MapPin } from 'lucide-react';

interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  total_bookings: number;
  total_spent: number;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = useSupabaseClient();

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      // Get bookings and extract unique customers
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/bookings`, {
        headers: {
          'Authorization': `Bearer ${token || ''}`,
        },
      });

      if (response.ok) {
        const bookings = await response.json();
        
        // Group by customer and create customer list
        const customerMap = new Map<string, Customer>();
        
        bookings.forEach((booking: any) => {
          const customerId = booking.customer_id || booking.id;
          if (!customerMap.has(customerId)) {
            customerMap.set(customerId, {
              id: customerId,
              name: booking.customer_name || 'Unknown',
              email: booking.customer_email || 'Not provided',
              phone: booking.customer_phone || 'Not provided',
              address: booking.customer_address || 'Not provided',
              total_bookings: 0,
              total_spent: 0,
            });
          }
          const customer = customerMap.get(customerId)!;
          customer.total_bookings += 1;
          customer.total_spent += booking.total_price || 0;
        });

        setCustomers(Array.from(customerMap.values()));
      } else {
        setError('Failed to fetch customers');
      }
    } catch (err) {
      setError('Error loading customers');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2rem' }}>
        <Users size={32} color="#0066cc" />
        <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold' }}>Customers</h1>
      </div>

      {error && <div style={{ padding: '1rem', backgroundColor: '#fee', color: '#c33', borderRadius: '4px', marginBottom: '1rem' }}>{error}</div>}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <p>Loading customers...</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
          {customers.length === 0 ? (
            <p style={{ color: '#666' }}>No customers yet.</p>
          ) : (
            customers.map((customer) => (
              <motion.div
                key={customer.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                style={{
                  padding: '1.5rem',
                  backgroundColor: 'white',
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)')}
                onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}
              >
                <h3 style={{ fontWeight: 'bold', fontSize: '1.125rem', marginBottom: '1rem' }}>{customer.name}</h3>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', color: '#666', fontSize: '0.875rem' }}>
                  <Mail size={16} />
                  <span>{customer.email}</span>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', color: '#666', fontSize: '0.875rem' }}>
                  <Phone size={16} />
                  <span>{customer.phone}</span>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: '#666', fontSize: '0.875rem' }}>
                  <MapPin size={16} />
                  <span>{customer.address}</span>
                </div>

                <div style={{ paddingTop: '1rem', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ color: '#999', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Bookings</p>
                    <p style={{ fontWeight: 'bold', fontSize: '1.25rem' }}>{customer.total_bookings}</p>
                  </div>
                  <div>
                    <p style={{ color: '#999', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Total Spent</p>
                    <p style={{ fontWeight: 'bold', fontSize: '1.25rem' }}>£{customer.total_spent.toFixed(2)}</p>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      )}
    </motion.div>
  );
}
