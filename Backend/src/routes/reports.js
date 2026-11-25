const router = require('express').Router();
const H = require('../utils/helpers');
const { supabase, HttpError, asyncHandler, jobCode } = H;

// ?range=all|today|week|month   or   ?from=YYYY-MM-DD&to=YYYY-MM-DD
function resolvePeriod(q) {
  const today = H.todayPH();
  let from = '', to = '', range = q.range || 'all';

  if (range === 'today') { from = to = today; }
  else if (range === 'week') { from = H.daysAgo(today, 6); to = today; }
  else if (range === 'month') { from = today.slice(0, 8) + '01'; to = today; }
  else if (q.from || q.to) {
    range = 'custom';
    from = q.from || ''; to = q.to || '';
    if ((from && !H.isDate(from)) || (to && !H.isDate(to))) throw new HttpError(400, 'Dates must look like YYYY-MM-DD.');
    if (from && to && from > to) throw new HttpError(400, 'The FROM date must be before the TO date.');
  } else { range = 'all'; }

  return { range, from, to };
}

const inPeriod = (day, p) => !((p.from && day < p.from) || (p.to && day > p.to));

async function buildReport(query) {
  const period = resolvePeriod(query);

  const [jobs, payments] = await Promise.all([
    H.fetchAll(() => supabase.from('job_orders').select('id, status, amount, date_received').order('id')),
    H.fetchAll(() => supabase.from('payments').select('job_order_no, amount, paid_date').order('id'))
  ]);

  // total ever paid per job order (payments are linked by job order number)
  const paidByJob = {};
  let collected = 0;
  for (const p of payments) {
    const id = H.jobIdFromText(p.job_order_no);
    paidByJob[id] = (paidByJob[id] || 0) + Number(p.amount);
    if (inPeriod(String(p.paid_date).slice(0, 10), period)) collected += Number(p.amount);
  }

  const rows = [];
  const statusCounts = {};
  let serviceValue = 0, paidOnJobs = 0, balance = 0;

  for (const j of jobs) {
    if (!inPeriod(H.toPHDate(j.date_received), period)) continue;
    const price = Number(j.amount) || 0;
    const paid = paidByJob[j.id] || 0;
    serviceValue += price;
    paidOnJobs += paid;
    balance += Math.max(price - paid, 0);

    const status = j.status || 'NO STATUS';
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    rows.push({ job_order: jobCode(j.id), status, date_received: H.toPHDate(j.date_received), service_value: price, paid, balance: Math.max(price - paid, 0) });
  }

  return {
    period,
    summary: { orders: rows.length, serviceValue, collected, paidOnJobs, balance },
    statusSummary: Object.entries(statusCounts).map(([status, count]) => ({ status, count })),
    rows
  };
}

// GET /api/reports/summary
router.get('/summary', asyncHandler(async (req, res) => {
  const { rows, ...rest } = await buildReport(req.query);
  res.json(rest);
}));

// GET /api/reports/export.csv  (opens in Excel)
router.get('/export.csv', asyncHandler(async (req, res) => {
  const { rows } = await buildReport(req.query);
  const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const lines = ['Job Order,Status,Date Received,Service Value,Paid,Balance'];
  for (const r of rows) lines.push([q(r.job_order), q(r.status), q(r.date_received), r.service_value, r.paid, r.balance].join(','));

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="report-${H.todayPH()}.csv"`);
  res.send('\uFEFF' + lines.join('\n'));
}));

module.exports = router;
