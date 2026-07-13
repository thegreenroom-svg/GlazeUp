-- Read-only check — what demo data already exists?
SELECT booking_code, customer_name, created_at
FROM bookings
WHERE booking_code LIKE 'demo-booking-%'
ORDER BY booking_code;

SELECT batch_code, label, status, created_at
FROM kiln_sessions
WHERE batch_code LIKE 'KILN-DEMO-%';

SELECT booking_id, COUNT(*) as piece_count, status
FROM pottery_pieces
WHERE booking_id LIKE 'demo-booking-%'
GROUP BY booking_id, status
ORDER BY booking_id;
