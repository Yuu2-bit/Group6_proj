const router = require('express').Router();
const H = require('../utils/helpers');
const { IN_TYPES, OUT_TYPES, STAFF_LIST } = require('../config/constants');
const { supabase, HttpError, asyncHandler, must, clean } = H;

// 0 = out, at or below reorder level = low, otherwise in
function stockStatus(item) {
  if (item.stock <= 0) return 'out';
  if (item.stock <= item.reorder) return 'low';
  return 'in';
}
const withStatus = (item) => ({ ...item, stock_status: stockStatus(item) });

const allItems = () => H.fetchAll(() => supabase.from('inventory_items').select('*').order('sku'));

function readItem(b) {
  const sku = clean(b.sku).toUpperCase();
  const description = clean(b.description);
  if (!sku || !description) throw new HttpError(400, 'Please enter the SKU and the description.');
  return {
    sku,
    description,
    category: clean(b.category),
    brand: clean(b.brand),
    supplier: clean(b.supplier),
    reorder: Math.floor(H.toNumber(b.reorder || 0, 'Reorder level')),
    unit_cost: H.toNumber(b.unitCost || 0, 'Unit cost'),
    selling_price: H.toNumber(b.sellingPrice || 0, 'Selling price')
    // stock is never edited here: only stock movements change it
  };
}

// GET /api/inventory/meta  -> filter lists + transaction types
router.get('/meta', asyncHandler(async (req, res) => {
  const items = await allItems();
  const uniq = (f) => [...new Set(items.map((i) => i[f]).filter(Boolean))].sort();
  res.json({ categories: uniq('category'), brands: uniq('brand'), inTypes: IN_TYPES, outTypes: OUT_TYPES, staff: STAFF_LIST });
}));

// GET /api/inventory/movements?itemId=&limit=
router.get('/movements', asyncHandler(async (req, res) => {
  const limit = Math.min(500, parseInt(req.query.limit, 10) || 100);
  let q = supabase.from('inventory_transactions').select('*, inventory_items(sku, description)')
    .order('id', { ascending: false }).limit(limit);
  if (req.query.itemId) q = q.eq('item_id', H.parseId(req.query.itemId));
  const { data } = must(await q);
  res.json({ data });
}));

// POST /api/inventory/movements
// { itemId, type: "in"|"out", quantity, transactionType, staff, referenceNo?, remarks?, unitCost? }
router.post('/movements', asyncHandler(async (req, res) => {
  const b = req.body;
  const itemId = H.parseId(b.itemId);
  const type = b.type;
  if (type !== 'in' && type !== 'out') throw new HttpError(400, 'type must be "in" or "out".');
  const quantity = parseInt(b.quantity, 10);
  if (!Number.isInteger(quantity) || quantity < 1) throw new HttpError(400, 'Quantity must be at least 1.');

  const allowed = type === 'in' ? IN_TYPES : OUT_TYPES;
  if (!allowed.includes(b.transactionType)) throw new HttpError(400, 'Select a valid transaction type.');
  const staff = clean(b.staff);
  if (!staff) throw new HttpError(400, type === 'in' ? 'Select who received the stock.' : 'Select who released the stock.');

  const unitCost = b.unitCost === undefined || b.unitCost === null || b.unitCost === '' ? null : H.toNumber(b.unitCost, 'Unit cost');

  // The database function locks the row, changes the stock and writes the history in ONE step,
  // so two people can never overwrite each other's stock count.
  const { data } = must(await supabase.rpc('apply_stock_movement', {
    p_item_id: itemId,
    p_type: type,
    p_quantity: quantity,
    p_transaction_type: b.transactionType,
    p_reference_no: clean(b.referenceNo),
    p_remarks: clean(b.remarks),
    p_staff: staff,
    p_unit_cost: unitCost,
    p_processed_by: req.user.name
  }));

  res.status(201).json(withStatus(data));
}));

// GET /api/inventory?search=&category=&brand=&stock=in|low|out&active=true|false&page=&limit=
router.get('/', asyncHandler(async (req, res) => {
  const items = await allItems();

  const stats = { total: items.length, active: 0, in: 0, low: 0, out: 0 };
  for (const i of items) {
    if (i.active !== false) stats.active++;
    stats[stockStatus(i)]++;
  }

  const search = clean(req.query.search).toLowerCase();
  const { category, brand, stock, active } = req.query;
  const list = items.filter((i) => {
    if (category && category !== 'All Categories' && i.category !== category) return false;
    if (brand && brand !== 'All Brands' && i.brand !== brand) return false;
    if (stock && stock !== 'all' && stockStatus(i) !== stock) return false;
    if (active === 'true' && i.active === false) return false;
    if (active === 'false' && i.active !== false) return false;
    if (search) {
      const text = [i.sku, i.category, i.brand, i.description, i.supplier].join(' ').toLowerCase();
      if (!text.includes(search)) return false;
    }
    return true;
  });

  const { page, limit, from } = H.parsePaging(req.query, 60, 500);
  res.json({ data: list.slice(from, from + limit).map(withStatus), total: list.length, page, limit, stats });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const { data } = must(await supabase.from('inventory_items').select('*').eq('id', H.parseId(req.params.id)).maybeSingle());
  if (!data) throw new HttpError(404, 'Inventory item not found.');
  res.json(withStatus(data));
}));

router.post('/', asyncHandler(async (req, res) => {
  const fields = { ...readItem(req.body), stock: 0, active: true };
  const { data } = must(await supabase.from('inventory_items').insert(fields).select().single());
  res.status(201).json(withStatus(data));
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const { data } = must(await supabase.from('inventory_items').update(readItem(req.body))
    .eq('id', H.parseId(req.params.id)).select().maybeSingle());
  if (!data) throw new HttpError(404, 'Inventory item not found.');
  res.json(withStatus(data));
}));

// PATCH /api/inventory/:id/active  { active: true|false }
router.patch('/:id/active', asyncHandler(async (req, res) => {
  if (typeof req.body.active !== 'boolean') throw new HttpError(400, 'active must be true or false.');
  const { data } = must(await supabase.from('inventory_items').update({ active: req.body.active })
    .eq('id', H.parseId(req.params.id)).select().maybeSingle());
  if (!data) throw new HttpError(404, 'Inventory item not found.');
  res.json(withStatus(data));
}));

// Items that already have stock history cannot be deleted (deactivate them instead)
router.delete('/:id', asyncHandler(async (req, res) => {
  const id = H.parseId(req.params.id);
  const { data } = must(await supabase.from('inventory_items').delete().eq('id', id).select('id'));
  if (!data.length) throw new HttpError(404, 'Inventory item not found.');
  res.json({ ok: true });
}));

module.exports = router;
