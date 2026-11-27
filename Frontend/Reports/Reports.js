// ===== Reports.js =====
// Needs /main/data.js (database connection called "db").
// Reads the job orders table and the "payments" table (see Payments/payments.sql).

var JOB_TABLE = "job_orders";   // table name
var JOB_NUMBER = "id";          // the job order number column
var JOB_STATUS = "status";      // the status column (example: For Checking)

var jobs = [];          // all job orders
var payments = [];      // all payments
var fromDay = "";       // "" means no start limit  (renamed: data.js already has a function called toDate)
var toDay = "";         // "" means no end limit
var rangeName = "all";  // all, today, week, month or custom
var shownJobs = [];     // the job orders inside the period (used by the Excel download)
var firstRender = true; // true until the lists have shown data once (used for the line animation)


// ===== Small helper functions =====

function byId(id) {
  return document.getElementById(id);
}

function escapeText(text) {
  if (text == null) { text = ""; }
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function money(number) {
  return "₱" + Number(number || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Today's date in the Philippines, example: 2026-11-14
function todayPH() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

// Moves a date (YYYY-MM-DD) back by some days
function daysAgo(dateText, days) {
  var d = new Date(dateText + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// Turns a date or a timestamp into a plain Philippine day, example: 2026-11-14
// Returns "" when there is no date.
function dayOf(value) {
  if (!value) { return ""; }
  var text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) { return text; }   // already a plain date
  var d = new Date(text);
  if (isNaN(d.getTime())) { return ""; }
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

// FIX: some job orders have an empty date_received, so we use the next best date
// (same idea as getJobOrders in data.js)
function jobDay(job) {
  return dayOf(job.date_received || job.created_at || job.status_started);
}

// FIX: the job order table saves the price in "amount" (older versions may use "price")
function jobPrice(job) {
  return Number(job.amount) || Number(job.price) || 0;
}

// FIX: payments save "JO-00012" but the job order id is 12.
// This turns both into the same key (12) so they can be matched.
function jobKey(value) {
  var digits = String(value == null ? "" : value).replace(/\D/g, "").replace(/^0+/, "");
  if (digits != "") { return digits; }
  return String(value == null ? "" : value).trim().toUpperCase();
}

// Job order number as shown in the Excel file, example: JO-00012
function jobLabel(job) {
  return "JO-" + String(job[JOB_NUMBER]).padStart(5, "0");
}

// Is this day inside the chosen period?
function inPeriod(day) {
  if (fromDay != "" && (day == "" || day < fromDay)) { return false; }
  if (toDay != "" && (day == "" || day > toDay)) { return false; }
  return true;
}

// Total paid for every job order (all payments, any date)
function totalPaidByJob() {
  var paidByJob = {};
  for (var i = 0; i < payments.length; i++) {
    var key = jobKey(payments[i].job_order_no);
    if (paidByJob[key] == null) { paidByJob[key] = 0; }
    paidByJob[key] = paidByJob[key] + Number(payments[i].amount);
  }
  return paidByJob;
}


// ===== Loading from Supabase =====

// Supabase gives only 1000 rows at a time, so we ask again until we have everything
async function getAllRows(tableName) {
  var all = [];
  var start = 0;

  while (true) {
    var result = await db.from(tableName).select("*").range(start, start + 999);
    if (result.error) {
      console.error(result.error.message);
      byId("repErr").textContent = "Could not load " + tableName + ": " + result.error.message;
      break;
    }
    all = all.concat(result.data);
    if (result.data.length < 1000) { break; }
    start = start + 1000;
  }
  return all;
}

async function loadReports() {
  if (db === null) {
    byId("repErr").textContent = "Not connected to the database.";
    return;
  }

  byId("repErr").textContent = "";
  jobs = await getAllRows(JOB_TABLE);
  payments = await getAllRows("payments");
  draw();
}


// ===== Calculate and draw =====

function draw() {
  // 1. total paid for every job order (all payments, any date)
  var paidByJob = totalPaidByJob();

  // 2. money collected inside the period (uses the payment date)
  var collected = 0;
  for (var p = 0; p < payments.length; p++) {
    if (inPeriod(dayOf(payments[p].paid_date))) { collected = collected + Number(payments[p].amount); }
  }

  // 3. job orders received inside the period
  shownJobs = [];
  var serviceValue = 0;
  var paidOnJobs = 0;
  var balance = 0;
  var statusNames = [];
  var statusCounts = [];

  for (var j = 0; j < jobs.length; j++) {
    var job = jobs[j];
    if (!inPeriod(jobDay(job))) { continue; }
    shownJobs.push(job);

    var price = jobPrice(job);
    var paid = paidByJob[jobKey(job[JOB_NUMBER])] || 0;
    serviceValue = serviceValue + price;
    paidOnJobs = paidOnJobs + paid;
    if (price > paid) { balance = balance + (price - paid); }

    // count the status
    var status = job[JOB_STATUS] || "NO STATUS";
    var place = statusNames.indexOf(status);
    if (place == -1) {
      statusNames.push(status);
      statusCounts.push(1);
    } else {
      statusCounts[place] = statusCounts[place] + 1;
    }
  }

  // 4. show the numbers
  byId("sOrders").textContent = shownJobs.length.toLocaleString("en-US");
  byId("sValue").textContent = money(serviceValue);
  byId("sCollected").textContent = money(collected);
  byId("sBalance").textContent = money(balance);

  // The lines only slide in the first time they appear, not on filter clicks or auto-refresh
  var animateNow = (firstRender && shownJobs.length > 0);
  byId("statusList").classList.toggle("animate-lines", animateNow);
  byId("moneyList").classList.toggle("animate-lines", animateNow);

  var statusHtml = "";
  for (var s = 0; s < statusNames.length; s++) {
    statusHtml += "<div class='rep-line' style='--i:" + Math.min(s, 10) + "'><span>" + escapeText(String(statusNames[s]).toUpperCase()) + "</span><b>" + statusCounts[s] + "</b></div>";
  }
  if (statusHtml == "") { statusHtml = "<p class='small-text'>No job orders in this period.</p>"; }
  byId("statusList").innerHTML = statusHtml;

  byId("moneyList").innerHTML =
    "<div class='rep-line' style='--i:0'><span>Service Value</span><b>" + money(serviceValue) + "</b></div>" +
    "<div class='rep-line' style='--i:1'><span>Collected in Period</span><b>" + money(collected) + "</b></div>" +
    "<div class='rep-line' style='--i:2'><span>Currently Paid on Selected JOs</span><b>" + money(paidOnJobs) + "</b></div>" +
    "<div class='rep-line' style='--i:3'><span>Outstanding Balance</span><b>" + money(balance) + "</b></div>";

  if (animateNow) { firstRender = false; }

  drawPeriod();
}

// The title text and the selected filter button
function drawPeriod() {
  var names = { all: "All Time", today: "Today", week: "Last 7 Days", month: "This Month" };
  var text = names[rangeName];
  if (rangeName == "custom") { text = (fromDay || "Start") + " to " + (toDay || "Today"); }
  if (byId("periodText") != null) {
    byId("periodText").textContent = "Reporting Period: " + text;
  }

  var buttons = byId("rangeChips").querySelectorAll("button");
  for (var i = 0; i < buttons.length; i++) {
    if (buttons[i].dataset.range == rangeName) { buttons[i].classList.add("on"); }
    else { buttons[i].classList.remove("on"); }
  }
}


// ===== Filter buttons =====

byId("rangeChips").onclick = function (event) {
  var button = event.target.closest("button");
  if (button == null) { return; }

  var today = todayPH();
  rangeName = button.dataset.range;

  if (rangeName == "all") { fromDay = ""; toDay = ""; }
  if (rangeName == "today") { fromDay = today; toDay = today; }
  if (rangeName == "week") { fromDay = daysAgo(today, 6); toDay = today; }
  if (rangeName == "month") { fromDay = today.slice(0, 8) + "01"; toDay = today; }

  byId("fromDate").value = fromDay;
  byId("toDate").value = toDay;
  byId("repErr").textContent = "";
  draw();
};

byId("applyBtn").onclick = function () {
  fromDay = byId("fromDate").value;
  toDay = byId("toDate").value;
  if (fromDay != "" && toDay != "" && fromDay > toDay) {
    byId("repErr").textContent = "The FROM date must be before the TO date.";
    return;
  }
  byId("repErr").textContent = "";
  rangeName = "custom";
  draw();
};


// ===== Download Excel (a CSV file, Excel opens it) =====

// Puts quotes around a value so commas do not break the columns
function csvCell(value) {
  if (value == null) { value = ""; }
  return "\"" + String(value).replace(/"/g, "\"\"") + "\"";
}

byId("excelBtn").onclick = function () {
  var paidByJob = totalPaidByJob();

  var lines = ["Job Order,Status,Date Received,Service Value,Paid,Balance"];
  for (var j = 0; j < shownJobs.length; j++) {
    var job = shownJobs[j];
    var price = jobPrice(job);
    var paid = paidByJob[jobKey(job[JOB_NUMBER])] || 0;
    var balance = Math.max(price - paid, 0);
    lines.push([
      csvCell(jobLabel(job)), csvCell(job[JOB_STATUS]), csvCell(jobDay(job)),
      price, paid, balance
    ].join(","));
  }

  var file = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  var link = document.createElement("a");
  link.href = URL.createObjectURL(file);
  link.download = "report-" + todayPH() + ".csv";
  link.click();
};


// ===== Start =====
loadReports();
autoRefresh(loadReports);