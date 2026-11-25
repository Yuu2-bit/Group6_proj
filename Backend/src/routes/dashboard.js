const router = require('express').Router();
const H = require('../utils/helpers');
const { supabase, asyncHandler } = H;

// GET /api/dashboard
router.get('/', asyncHandler(async (req, res) => {
  const weekAgo = Date.now() - 7 * 86400000;

  const [jobs, customers] = await Promise.all([
    H.fetchAll(() => supabase.from('job_orders').select('id, service, device, status, status_started, amount, date_received, customers(name)').order('id', { ascending: false })),
    H.fetchAll(() => supabase.from('customers').select('id, created_at').order('id'))
  ]);

  let thisWeek = 0, open = 0, critical = 0, revenue = 0;
  const serviceCounts = {};

  for (const j of jobs) {
    if (new Date(j.date_received).getTime() > weekAgo) thisWeek++;
    if (j.status === 'Released') revenue += Number(j.amount || 0);
    const a = H.agingOf(j);
    if (a) { open++; if (a.level === 'critical') critical++; }
    const name = j.service || 'Other';
    serviceCounts[name] = (serviceCounts[name] || 0) + 1;
  }

  const newCustomers = customers.filter((c) => new Date(c.created_at).getTime() > weekAgo).length;

  const popularServices = Object.entries(serviceCounts)
    .map(([name, count]) => ({ name, count, percent: Math.round((count / jobs.length) * 100) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  res.json({
    totalBookings: jobs.length,
    newBookingsThisWeek: thisWeek,
    pendingRepairs: open,
    needAttention: critical,
    customers: customers.length,
    newCustomersThisWeek: newCustomers,
    revenue,
    recentBookings: jobs.slice(0, 5).map((j) => ({
      job_code: H.jobCode(j.id),
      customer_name: j.customers ? j.customers.name : '—',
      service: j.service || j.device,
      date_received: j.date_received,
      status: j.status
    })),
    popularServices
  });
}));

module.exports = router;
