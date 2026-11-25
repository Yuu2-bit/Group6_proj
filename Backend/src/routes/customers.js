const router = require('express').Router();
const H = require('../utils/helpers');
const { supabase, HttpError, asyncHandler, must, clean } = H;

const withCode = (c) => ({ ...c, customer_code: H.customerCode(c) });

function readCustomer(body, { partial = false } = {}) {
  const out = {};
  if (!partial || body.name !== undefined) {
    out.name = clean(body.name);
    if (!out.name) throw new HttpError(400, 'Customer name is required.');
  }
  for (const [key, col] of [['type', 'type'], ['contact', 'contact'], ['address', 'address'], ['location', 'location']]) {
    if (body[key] !== undefined) out[col] = clean(body[key]);
  }
  if (body.status !== undefined) {
    if (!['Active', 'Inactive'].includes(body.status)) throw new HttpError(400, 'Status must be Active or Inactive.');
    out.status = body.status;
  }
  return out;
}

// GET /api/customers?search=&status=&page=&limit=
router.get('/', asyncHandler(async (req, res) => {
  const { page, limit, from, to } = H.parsePaging(req.query, 50, 500);
  let query = supabase.from('customers').select('*', { count: 'exact' }).order('name').range(from, to);

  const q = H.searchSafe(req.query.search);
  if (q) {
    const parts = [`name.ilike.%${q}%`, `contact.ilike.%${q}%`, `location.ilike.%${q}%`, `customer_code.ilike.%${q}%`];
    const m = q.match(/^cust-?0*(\d+)$/i);
    if (m) parts.push(`id.eq.${m[1]}`);
    query = query.or(parts.join(','));
  }
  if (req.query.status) query = query.eq('status', req.query.status);

  const { data, count } = must(await query);
  res.json({ data: data.map(withCode), total: count, page, limit });
}));

// GET /api/customers/:id  (includes repair history)
router.get('/:id', asyncHandler(async (req, res) => {
  const id = H.parseId(req.params.id);
  const { data: customer } = must(await supabase.from('customers').select('*').eq('id', id).maybeSingle());
  if (!customer) throw new HttpError(404, 'Customer not found.');

  const { data: jobs } = must(await supabase
    .from('job_orders')
    .select('id, device, service, status, amount, date_received')
    .eq('customer_id', id)
    .order('id', { ascending: false }));

  res.json({
    ...withCode(customer),
    repairs: jobs.map((j) => ({ ...j, job_code: H.jobCode(j.id) }))
  });
}));

router.post('/', asyncHandler(async (req, res) => {
  const fields = readCustomer(req.body);
  if (!fields.type) fields.type = 'Individual';
  if (!fields.status) fields.status = 'Active';
  const { data } = must(await supabase.from('customers').insert(fields).select().single());
  res.status(201).json(withCode(data));
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const id = H.parseId(req.params.id);
  const fields = readCustomer(req.body, { partial: true });
  if (Object.keys(fields).length === 0) throw new HttpError(400, 'Nothing to update.');
  const { data } = must(await supabase.from('customers').update(fields).eq('id', id).select().maybeSingle());
  if (!data) throw new HttpError(404, 'Customer not found.');
  res.json(withCode(data));
}));

module.exports = router;
