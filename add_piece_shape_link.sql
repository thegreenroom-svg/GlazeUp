-- ═══════════════════════════════════════════════════════════
-- LINK CUSTOMER PIECES TO THE STOCK SHAPE THEY WERE PAINTED ON
--
-- pottery_pieces already links to customers (customer_id) and has a
-- free-text piece_type ('mug', 'bowl', ...). It does NOT link to
-- bisque_shapes — the real catalogue, which already carries a photo,
-- supplier and price per shape. Without this, "which customers have
-- bought/painted this stock item" can only be answered loosely, by
-- matching text.
--
-- This is the real fix for that question. Not photo matching:
-- blank, unpainted stock of the same mould is genuinely
-- indistinguishable by photo — every mug of a shape looks like every
-- other mug of that shape until someone paints it. A hash would
-- "match" any one to any other, which is a false answer dressed up
-- as a clever one. This link is unambiguous andpermanently correct instead.
--
-- Safe to run more than once.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE pottery_pieces ADD COLUMN IF NOT EXISTS bisque_shape_id UUID REFERENCES bisque_shapes(id);
CREATE INDEX IF NOT EXISTS idx_pieces_bisque_shape ON pottery_pieces(bisque_shape_id);

-- The query this unlocks, once staff start selecting a shape at
-- booking time — every customer who has ever painted a given stock
-- item, with what they paid outstanding and when:
--
-- SELECT c.name, c.email, p.created_at, p.outstanding_balance
-- FROM pottery_pieces p
-- JOIN customers c ON c.id = p.customer_id
-- WHERE p.bisque_shape_id = '<the shape's id from bisque_shapes>'
-- ORDER BY p.created_at DESC;
