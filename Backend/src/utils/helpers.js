const supabase = require('../config/supabase');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Throws the Supabase error (handled by the error middleware), otherwise returns the result
function must(result) {
  if (result.error) throw result.error;
  return result;
}

const pad = (n, size) => String(n).padStart(size, '0');
const jobCode = (id) => 'JO-' + pad(id, 5);
const customerCode = (c) => c.customer_code || 'CUST-' + pad(c.id, 6);
const clean = (v) => String(v == null ? '' : v).trim();

const todayPH = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
const toPHDate = (v) => (v ? new Date(v).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) : '');
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(new Date(s + 'T00:00:00Z'));

function daysAgo(dateText, days) {
  const d = new Date(dateText + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// Removes characters that would break a PostgREST .or() filter
const searchSafe = (s) => clean(s).replace(/[,()%*\\]/g, ' ').replace(/\s+/g, ' ').trim();
// Escapes LIKE wildcards for exact, case-insensitive matches
const escapeLike = (s) => clean(s).replace(/[\\%_]/g, (m) => '\\' + m);

function parseId(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new HttpError(400, 'Invalid id.');
  return n;
}

function parsePaging(query, defaultLimit = 50, maxLimit = 200) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, from: (page - 1) * limit, to: page * limit - 1 };
}

function toNumber(value, label, { min = 0 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min) throw new HttpError(400, label + ' must be a number' + (min === 0 ? ' (0 or more).' : '.'));
  return n;
}

const isOpen = (j) => j.status !== 'Released' && j.status !== 'Cancelled';

// Same rules as the frontend: 0-3 normal, 4-7 aging, 8+ critical. Finished jobs have none.
function agingOf(job) {
  if (!isOpen(job)) return null;
  const days = Math.floor((Date.now() - new Date(job.status_started).getTime()) / 86400000);
  const level = days >= 8 ? 'critical' : days >= 4 ? 'aging' : 'normal';
  return { days, level };
}

// Supabase returns at most 1000 rows per request, so keep asking until we have everything
async function fetchAll(buildQuery) {
  let all = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery().range(from, from + 999);
    if (error) throw error;
    all = all.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

// "JO-00012", "jo-12" or "12" -> 12 (or null)
function jobIdFromText(text) {
  const m = clean(text).match(/(\d+)\s*$/);
  return m ? parseInt(m[1], 10) : null;
}

module.exports = {
  supabase, HttpError, asyncHandler, must, pad, jobCode, customerCode, clean, todayPH, toPHDate,
  isDate, daysAgo, searchSafe, escapeLike, parseId, parsePaging, toNumber, isOpen, agingOf,
  fetchAll, jobIdFromText
};
