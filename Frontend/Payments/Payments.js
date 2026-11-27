// ===== Payments.js =====
// Needs /main/data.js (for the database connection called "db").
// Saves to the "payments" table in Supabase (run payments.sql first).
//
// Tip: "await" means "wait here until the database answers".

var payments = [];       // the payments we are viewing (one date, or all)
var firstRender = true;  // true until the table has shown rows once (used for the row animation)
var showAll = false;     // true when the "View All" button was pressed


// ===== Small helper functions =====

function byId(id) {
  return document.getElementById(id);
}

// Stops strange characters from breaking the HTML
function escapeText(text) {
  if (text == null) { text = ""; }
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Shows a number as money, example: ₱1,500.00
function money(number) {
  return "₱" + Number(number || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Today's date in the Philippines, example: 2026-11-14
function todayPH() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

// Adds one day to a "YYYY-MM-DD" text, example: 2026-11-30 -> 2026-12-01
function nextDay(dateText) {
  var parts = dateText.split("-");
  var d = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]) + 1));
  return d.toISOString().slice(0, 10);
}

// Shows paid_date as a plain date, whether the column is "date" or "timestamptz"
function showPaidDate(value) {
  if (!value) { return ""; }
  var text = String(value);
  if (text.length <= 10) { return text; }
  var d = new Date(text);
  if (isNaN(d.getTime())) { return text.slice(0, 10); }
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}


// ===== Saving and loading (Supabase table: payments) =====

// Gets the payments of ONE date, or ALL payments when date is empty.
// The range (start of the day up to the start of the next day, Philippine time)
// works for both a "date" column and a "timestamptz" column.
async function getPaymentsByDate(date) {
  var query = db.from("payments").select("*");

  if (date) {
    var start = date + "T00:00:00+08:00";
    var end = nextDay(date) + "T00:00:00+08:00";
    query = query.gte("paid_date", start).lt("paid_date", end);
  }

  var result = await query
    .order("paid_date", { ascending: false })
    .limit(1000);

  if (result.error) {
    console.error(result.error.message);
    byId("dateNote").textContent = "Error loading payments: " + result.error.message;
    return null; // null = failed (so we do not hide the error message)
  }
  return result.data || [];
}

// Adds a new payment. Returns an error message, or null when it worked.
async function savePaymentToDatabase(payment) {
  var result = await db.from("payments").insert(payment);
  if (result.error) { return result.error.message; }
  return null;
}


// ===== Load and draw the page =====

async function loadPayments() {
  if (db === null) {
    byId("dateNote").textContent = "Not connected to the database.";
    return;
  }

  var date = byId("payDate").value;
  var rows = await getPaymentsByDate(showAll ? "" : date);

  if (rows === null) {
    // keep the error message on the page and show an empty table
    payments = [];
    draw();
    return;
  }

  payments = rows;

  if (showAll) {
    byId("dateNote").textContent = "Showing ALL payments (latest first, up to 1000).";
  } else {
    byId("dateNote").textContent = "Showing payments received on " + date + " (Asia/Manila).";
  }

  draw();
}

function draw() {
  var total = 0;       // all money collected
  var cash = 0;        // only the cash
  var jobs = [];       // the different job orders that were paid
  var html = "";

  // Rows only slide in the first time they appear, not on every auto-refresh
  byId("payBody").classList.toggle("animate-rows", firstRender && payments.length > 0);

  // go through every payment one by one
  for (var i = 0; i < payments.length; i++) {
    var p = payments[i];
    var amount = Number(p.amount);

    total = total + amount;
    if (p.method == "Cash") { cash = cash + amount; }
    if (jobs.indexOf(p.job_order_no) == -1) { jobs.push(p.job_order_no); }

    // one table row for this payment (--i staggers the first-load animation)
    html += "<tr style='--i:" + Math.min(i, 15) + "'>" +
      "<td>" + escapeText(showPaidDate(p.paid_date)) + "</td>" +
      "<td>" + escapeText(p.job_order_no) + "</td>" +
      "<td>" + escapeText(p.customer) + "</td>" +
      "<td>" + escapeText(p.method) + "</td>" +
      "<td>" + escapeText(p.reference_no) + "</td>" +
      "<td>" + escapeText(p.received_by) + "</td>" +
      "<td>" + escapeText(p.notes) + "</td>" +
      "<td class='r'>" + money(amount) + "</td>" +
      "</tr>";
  }

  if (html == "") {
    html = "<tr><td colspan='8' class='pay-empty'>No payments found.</td></tr>";
  }

  byId("payBody").innerHTML = html;
  byId("sTotal").textContent = money(total);
  byId("sCount").textContent = payments.length;
  byId("sCash").textContent = money(cash);
  byId("sJobs").textContent = jobs.length;
  byId("recCount").textContent = payments.length + " payment(s)";

  if (payments.length > 0) { firstRender = false; }
}


// ===== Date buttons =====

byId("viewBtn").onclick = function () {
  showAll = false;
  loadPayments();
};

byId("payDate").onchange = function () {
  showAll = false;
  loadPayments();
};

byId("todayBtn").onclick = function () {
  showAll = false;
  byId("payDate").value = todayPH();
  loadPayments();
};

byId("allBtn").onclick = function () {
  showAll = true;
  loadPayments();
};


// ===== Record payment popup =====

byId("addPay").onclick = function () {
  // clear all the boxes
  byId("pJob").value = "";
  byId("pCustomer").value = "";
  byId("pAmount").value = 0;
  byId("pMethod").value = "Cash";
  byId("pDate").value = byId("payDate").value || todayPH();
  byId("pRef").value = "";
  byId("pStaff").value = "Admin";
  byId("pNotes").value = "";
  byId("payErr").textContent = "";

  byId("payDlg").showModal();
};

byId("cancelPay").onclick = function () { byId("payDlg").close(); };
byId("xPay").onclick = function () { byId("payDlg").close(); };

byId("savePay").onclick = async function () {
  // 1. read what was typed
  var payment = {
    job_order_no: byId("pJob").value.trim(),
    customer: byId("pCustomer").value.trim(),
    amount: Number(byId("pAmount").value) || 0,
    method: byId("pMethod").value,
    reference_no: byId("pRef").value.trim(),
    paid_date: byId("pDate").value,
    received_by: byId("pStaff").value.trim(),
    notes: byId("pNotes").value.trim()
  };

  // 2. check the important boxes
  if (payment.job_order_no == "") {
    byId("payErr").textContent = "Please enter the job order number.";
    return;
  }
  if (payment.amount <= 0) {
    byId("payErr").textContent = "Amount must be more than 0.";
    return;
  }
  if (payment.paid_date == "") {
    byId("payErr").textContent = "Please pick the payment date.";
    return;
  }

  // 3. save it
  var error = await savePaymentToDatabase(payment);
  if (error) {
    byId("payErr").textContent = "Could not save: " + error;
    return;
  }

  // 4. close the popup and show the date we just saved
  byId("payDlg").close();
  byId("payDate").value = payment.paid_date;
  showAll = false;
  loadPayments();
};


// ===== Start =====
byId("payDate").value = todayPH();
loadPayments();
autoRefresh(loadPayments);