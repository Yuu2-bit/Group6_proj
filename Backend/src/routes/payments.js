const router = require('express').Router();
const H = require('../utils/helpers');
const { PAYMENT_METHODS } = require('../config/constants');
const { supabase, HttpError, asyncHandler, must, clean } = H;

function summarize(rows) {
  const jobs = new Set();
  let total = 0, cash = 0;
  for (const p of rows) {
    const amount = Number(p.amount);
    total += amount;
    if (p.method === 'Cash') cash += amount;
    jobs.add(p.job_order_no);
  }
  return { total, cash, count: rows.length, jobsPaid: jobs.size };
}

// GET /api/payments?date=YYYY-MM-DD   (default: today, Philippine time)
//     /api/payments?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/', asyncHandler(async (req, res) => {
  let from = req.query.from, to = req.query.to;
  if (!from && !to) { from = to = req.query.date || H.todayPH(); }
  if ((from && !H.isDate(from)) || (to && !H.isDate(to))) throw new HttpError(400, 'Dates must look like YYYY-MM-DD.');

  const rows = await H.fetchAll(() => {
    let q = supabase.from('payments').select('*').order('id', { ascending: false });
    if (from) q = q.gte('paid_date', from);
    if (to) q = q.lte('paid_date', to);
    return q;
  });
  res.json({ from, to, data: rows, summary: summarize(rows) });
}));

// GET /api/payments/job/:jobId  -> all payments of one job order + balance
router.get('/job/:jobId', asyncHandler(async (req, res) => {
  const id = H.parseId(req.params.jobId);
  const { data: job } = must(await supabase.from('job_orders').select('id, amount').eq('id', id).maybeSingle());
  if (!job) throw new HttpError(404, 'Job order not found.');

  const { data } = must(await supabase.from('payments').select('*').eq('job_order_no', H.jobCode(id)).order('id'));
  const paid = data.reduce((s, p) => s + Number(p.amount), 0);
  res.json({ job_order_no: H.jobCode(id), price: Number(job.amount || 0), paid, balance: Math.max(Number(job.amount || 0) - paid, 0), data });
}));

// POST /api/payments
// { jobOrderNo, customer?, amount, method, referenceNo?, paidDate, receivedBy?, notes?, allowOverpayment? }
router.post('/', asyncHandler(async (req, res) => {
  const b = req.body;

  const jobId = H.jobIdFromText(b.jobOrderNo);
  if (!jobId) throw new HttpError(400, 'Please enter the job order number.');
  const amount = H.toNumber(b.amount, 'Amount');
  if (amount <= 0) throw new HttpError(400, 'Amount must be more than 0.');
  const method = b.method || 'Cash';
  if (!PAYMENT_METHODS.includes(method)) throw new HttpError(400, 'Unknown payment method.');
  const paidDate = b.paidDate || H.todayPH();
  if (!H.isDate(paidDate)) throw new HttpError(400, 'Please pick a valid payment date.');

  const { data: job } = must(await supabase.from('job_orders')
    .select('id, amount, customers(name)').eq('id', jobId).maybeSingle());
  if (!job) throw new HttpError(400, 'Job order ' + H.jobCode(jobId) + ' was not found.');

  const jobNo = H.jobCode(jobId);
  const { data: before } = must(await supabase.from('payments').select('amount').eq('job_order_no', jobNo));
  const alreadyPaid = before.reduce((s, p) => s + Number(p.amount), 0);
  const price = Number(job.amount || 0);

  if (!b.allowOverpayment && price > 0 && alreadyPaid + amount > price + 0.001) {
    throw new HttpError(400, 'This is more than the balance (₱' + Math.max(price - alreadyPaid, 0).toFixed(2) + '). Send allowOverpayment: true to save anyway.');
  }

  const { data } = must(await supabase.from('payments').insert({
    job_order_no: jobNo,
    customer: clean(b.customer) || (job.customers ? job.customers.name : ''),
    amount,
    method,
    reference_no: clean(b.referenceNo),
    paid_date: paidDate,
    received_by: clean(b.receivedBy) || req.user.name,
    notes: clean(b.notes)
  }).select().single());

  res.status(201).json({ ...data, balance: Math.max(price - alreadyPaid - amount, 0) });
}));

module.exports = router;
