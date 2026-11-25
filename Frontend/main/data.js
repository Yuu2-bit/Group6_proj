var SUPABASE_URL = "https://qdqljodxhvxllldqzhof.supabase.co";
var SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkcWxqb2R4aHZ4bGxsZHF6aG9mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUzNzEwNjgsImV4cCI6MjExMDk0NzA2OH0.F4yoASDJ-UidPTTxWnSSlkecEpw9Dmni2CYPKpLhyfg";

var db = null;
var dbError = "";

if (SUPABASE_URL == "" || SUPABASE_KEY == "") {
  dbError = "The Supabase URL or key is empty at the top of /main/data.js.";
} else if (!window.supabase) {
  dbError = "The Supabase library did not load (check your internet connection or ad blocker).";
} else {
  try { db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY); }
  catch (error) { dbError = error.message; }
}
if (dbError != "") { console.error("data.js: " + dbError); }

var STATUS_LIST = ["For Checking", "In Repair", "Parts Available", "For Releasing Good", "Released", "Cancelled"];
var SERVICE_LIST = ["Screen Repair", "Battery Replacement", "Laptop Repair", "Water Damage Fix", "Charging Port Repair", "Other"];


function showDemoNotice() {
  if (db != null || document.getElementById("db-notice")) { return; }
  var bar = document.createElement("div");
  bar.id = "db-notice";
  bar.textContent = "Not connected to the database. " + dbError;
  bar.style.cssText = "position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:200;max-width:90vw;" +
    "padding:10px 16px;border-radius:8px;border:1px solid #2f4268;background:#1a2842;color:#e8eef9;" +
    "font:500 13px Inter,Arial,sans-serif;text-align:center;";
  document.body.appendChild(bar);
}
window.addEventListener("DOMContentLoaded", showDemoNotice);


// ===== Small helper functions =====

function safe(text) {
  if (text == null || text == "") { return "—"; }
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function padNumber(n, size) { return String(n).padStart(size, "0"); }

function customerCode(c) {
  if (c.customer_code) { return c.customer_code; }
  return "CUST-" + padNumber(c.id, 6);
}

function jobCode(j) { return "JO-" + padNumber(j.id, 5); }

function isOpen(j) { return j.status != "Released" && j.status != "Cancelled"; }

// Returns a valid Date, or null when the text is empty or not a date
function toDate(dateText) {
  if (!dateText) { return null; }
  var d = new Date(dateText);
  return isNaN(d.getTime()) ? null : d;
}

function daysSince(dateText) {
  var d = toDate(dateText);
  if (d == null) { return 0; }
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function formatDate(dateText) {
  var d = toDate(dateText);
  if (d == null) { return "—"; }
  return padNumber(d.getMonth() + 1, 2) + "/" + padNumber(d.getDate(), 2) + "/" + d.getFullYear();
}

function formatDateTime(dateText) {
  var d = toDate(dateText);
  if (d == null) { return "—"; }
  return d.toLocaleString("en-US", {
    month: "2-digit", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
  });
}

// How long a job has been in its current status
function getAging(j) {
  if (!isOpen(j)) { return null; }
  var days = daysSince(j.status_started || j.date_received);
  var level = "normal";
  if (days >= 8) { level = "critical"; }
  else if (days >= 4) { level = "aging"; }
  var word = (days == 1) ? " day" : " days";
  return { days: days, level: level, text: days + word + " · " + level.toUpperCase() };
}


// ===== Database functions =====

async function getCustomers() {
  if (db == null) { return []; }
  var r = await db.from("customers").select("*").limit(5000);
  if (r.error) { console.error(r.error.message); return []; }
  r.data.sort(function (a, b) { return (a.name || "").localeCompare(b.name || ""); });
  return r.data;
}

// Job orders, newest first, each one including its customer's name and code
async function getJobOrders() {
  if (db == null) { return []; }
  var r = await db.from("job_orders").select("*, customers(id, name, customer_code)").limit(5000);
  if (r.error) { console.error(r.error.message); return []; }

  for (var i = 0; i < r.data.length; i++) {
    var job = r.data[i];
    // some tables call the date created_at: use whichever one exists
    job.date_received = job.date_received || job.created_at || job.status_started || null;
    job.status_started = job.status_started || job.date_received;
    job.customer_name = job.customers ? job.customers.name : "—";
    job.customer_code = job.customers ? customerCode(job.customers) : "—";
  }
  r.data.sort(function (a, b) { return b.id - a.id; });
  return r.data;
}

// Saves a new job order. If the customer is new, the customer is saved too.
// Returns an error message, or null when everything worked.
async function addJobOrder(info) {
  if (db == null) { return dbError; }
  var customers = await getCustomers();
  var customerId = null;
  var existing = null;
  for (var i = 0; i < customers.length; i++) {
    if ((customers[i].name || "").toLowerCase() == info.customerName.toLowerCase()) {
      customerId = customers[i].id;
      existing = customers[i];
    }
  }

  if (customerId == null) {
    var newCustomer = { name: info.customerName, type: "Individual", contact: info.contact, status: "Active" };
    if (info.address) { newCustomer.address = info.address; }
    var r1 = await db.from("customers").insert(newCustomer).select().single();
    if (r1.error) { return r1.error.message; }
    customerId = r1.data.id;
  } else if (info.address && existing && !existing.address) {
    // fill in the address of an existing customer if it was empty (ignore errors)
    await db.from("customers").update({ address: info.address }).eq("id", customerId);
  }

  var now = new Date().toISOString();
  var r2 = await db.from("job_orders").insert({
    customer_id: customerId,
    device: info.device,
    serial: info.serial,
    service: info.service,
    issue: info.issue,
    status: info.status,
    amount: info.amount,
    date_received: now,
    status_started: now
  });
  if (r2.error) { return r2.error.message; }
  return null;
}

async function updateJobStatus(id, status) {
  if (db == null) { return dbError; }
  var r = await db.from("job_orders").update({ status: status, status_started: new Date().toISOString() }).eq("id", id);
  if (r.error) { return r.error.message; }
  return null;
}


// ===== Auto update =====
function autoRefresh(fn) {
  window.addEventListener("focus", fn);
  setInterval(fn, 10000);
}