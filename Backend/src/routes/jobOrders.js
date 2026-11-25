const router = require('express').Router();
const H = require('../utils/helpers');
const { STATUS_LIST, SERVICE_LIST } = require('../config/constants');
const { supabase, HttpError, asyncHandler, must, clean } = H;

const SELECT = '*, customers(id, name, customer_code, contact, address, location)';

function decorate(j) {
  const c = j.customers;
  const { customers, ...rest } = j;
  return {
    ...rest,
    job_code: H.jobCode(j.id),
    customer_name: c ? c.name : null,
    customer_code: c ? H.customerCode(c) : null,
    customer_contact: c ? c.contact : null,
    customer_address: c ? c.address : null,
    aging: H.agingOf(j)
  };
}

// Finds a customer by name (case-insensitive) or creates one
async function findOrCreateCustomer({ name, contact, address }) {
  const { data: found } = must(await supabase.from('customers').select('id, contact, address')
    .ilike('name', H.escapeLike(name)).order('id').limit(1));

  if (found.length) {
    // fill in missing details only
    const patch = {};
    if (contact && !found[0].contact) patch.contact = contact;
    if (address && !found[0].address) patch.address = address;
    if (Object.keys(patch).length) must(await supabase.from('customers').update(patch).eq('id', found[0].id));
    return found[0].id;
  }

  const { data } = must(await supabase.from('customers')
    .insert({ name, type: 'Individual', contact, address, status: 'Active' }).select('id').single());
  return data.id;
}

// GET /api/job-orders/stats
router.get('/stats', asyncHandler(async (req, res) => {
  const jobs = await H.fetchAll(() => supabase.from('job_orders').select('id, status, status_started').order('id'));
  const s = { total: jobs.length, open: 0, normal: 0, aging: 0, critical: 0 };
  for (const j of jobs) {
    const a = H.agingOf(j);
    if (a) { s.open++; s[a.level]++; }
  }
  res.json(s);
}));

// GET /api/job-orders?search=&status=&page=&limit=
router.get('/', asyncHandler(async (req, res) => {
  const { page, limit, from, to } = H.parsePaging(req.query, 50, 300);
  let query = supabase.from('job_orders').select(SELECT, { count: 'exact' }).order('id', { ascending: false }).range(from, to);

  if (req.query.status && req.query.status !== 'All Statuses') query = query.eq('status', req.query.status);

  const q = H.searchSafe(req.query.search);
  if (q) {
    const parts = [`device.ilike.%${q}%`, `serial.ilike.%${q}%`];
    const digits = q.match(/^(?:jo-?)?0*(\d+)$/i);
    if (digits) parts.push(`id.eq.${digits[1]}`);

    const { data: custs } = must(await supabase.from('customers').select('id')
      .or(`name.ilike.%${q}%,customer_code.ilike.%${q}%`).limit(500));
    if (custs.length) parts.push(`customer_id.in.(${custs.map((c) => c.id).join(',')})`);

    query = query.or(parts.join(','));
  }

  const { data, count } = must(await query);
  res.json({ data: data.map(decorate), total: count, page, limit });
}));

// GET /api/job-orders/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const id = H.parseId(req.params.id);
  const { data } = must(await supabase.from('job_orders').select(SELECT).eq('id', id).maybeSingle());
  if (!data) throw new HttpError(404, 'Job order not found.');

  const { data: pays } = must(await supabase.from('payments').select('amount').eq('job_order_no', H.jobCode(id)));
  const paid = pays.reduce((sum, p) => sum + Number(p.amount), 0);

  res.json({ ...decorate(data), paid, balance: Math.max(Number(data.amount || 0) - paid, 0) });
}));

// POST /api/job-orders
// { customerName, contact, address, device, serial, service, issue, status, amount, receivedBy, formData }
router.post('/', asyncHandler(async (req, res) => {
  const b = req.body;
  const customerName = clean(b.customerName);
  const device = clean(b.device);
  if (!customerName || !device) throw new HttpError(400, 'Please enter the customer name and the device.');

  const status = b.status || 'For Checking';
  if (!STATUS_LIST.includes(status)) throw new HttpError(400, 'Unknown status.');
  const service = clean(b.service) || 'Other';
  if (!SERVICE_LIST.includes(service)) throw new HttpError(400, 'Unknown service.');
  const amount = b.amount === undefined || b.amount === '' ? 0 : H.toNumber(b.amount, 'Estimated cost');

  const customerId = await findOrCreateCustomer({
    name: customerName, contact: clean(b.contact), address: clean(b.address)
  });

  const { data } = must(await supabase.from('job_orders').insert({
    customer_id: customerId,
    device,
    serial: clean(b.serial),
    service,
    issue: clean(b.issue),
    status,
    amount,
    received_by: clean(b.receivedBy) || req.user.name,
    form_data: b.formData && typeof b.formData === 'object' ? b.formData : {}
  }).select(SELECT).single());

  res.status(201).json(decorate(data));
}));

// PATCH /api/job-orders/:id/status  { status, repairRemarks?, formData? }
router.patch('/:id/status', asyncHandler(async (req, res) => {
  const id = H.parseId(req.params.id);
  const status = req.body.status;
  if (!STATUS_LIST.includes(status)) throw new HttpError(400, 'Unknown status.');

  const { data: current } = must(await supabase.from('job_orders').select('status, form_data').eq('id', id).maybeSingle());
  if (!current) throw new HttpError(404, 'Job order not found.');

  const patch = {};
  // only restart the "status started" clock when the status really changes
  if (current.status !== status) { patch.status = status; patch.status_started = new Date().toISOString(); }

  if (req.body.formData || req.body.repairRemarks !== undefined) {
    patch.form_data = { ...(current.form_data || {}), ...(req.body.formData || {}) };
    if (req.body.repairRemarks !== undefined) patch.form_data.repair = clean(req.body.repairRemarks);
  }
  if (Object.keys(patch).length === 0) return res.json({ ok: true, changed: false });

  const { data } = must(await supabase.from('job_orders').update(patch).eq('id', id).select(SELECT).single());
  res.json(decorate(data));
}));

// PUT /api/job-orders/:id/form  { formData }  (paper form answers: checklists, remarks, ...)
router.put('/:id/form', asyncHandler(async (req, res) => {
  const id = H.parseId(req.params.id);
  if (!req.body.formData || typeof req.body.formData !== 'object') throw new HttpError(400, 'formData is required.');
  const { data } = must(await supabase.from('job_orders').update({ form_data: req.body.formData })
    .eq('id', id).select(SELECT).maybeSingle());
  if (!data) throw new HttpError(404, 'Job order not found.');
  res.json(decorate(data));
}));

// PUT /api/job-orders/:id  (edit details)
router.put('/:id', asyncHandler(async (req, res) => {
  const id = H.parseId(req.params.id);
  const b = req.body;
  const patch = {};
  if (b.device !== undefined) { patch.device = clean(b.device); if (!patch.device) throw new HttpError(400, 'Device is required.'); }
  if (b.serial !== undefined) patch.serial = clean(b.serial);
  if (b.issue !== undefined) patch.issue = clean(b.issue);
  if (b.service !== undefined) {
    if (!SERVICE_LIST.includes(b.service)) throw new HttpError(400, 'Unknown service.');
    patch.service = b.service;
  }
  if (b.amount !== undefined) patch.amount = H.toNumber(b.amount, 'Estimated cost');
  if (Object.keys(patch).length === 0) throw new HttpError(400, 'Nothing to update.');

  const { data } = must(await supabase.from('job_orders').update(patch).eq('id', id).select(SELECT).maybeSingle());
  if (!data) throw new HttpError(404, 'Job order not found.');
  res.json(decorate(data));
}));

module.exports = router;
