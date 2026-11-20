// ===== Reports.js =====
// Needs /main/data.js (database connection called "db").
// Reads the job orders table and the "payments" table (see Payments/payments.sql).
//
// IMPORTANT: change these names so they match YOUR job orders table in Supabase.
var JOB_TABLE = "job_orders";        // table name
var JOB_NUMBER = "id";               // the job order number column (must match payments.job_order_no)
var JOB_STATUS = "status";           // the status column (example: FOR CHECKING)
var JOB_DATE = "date_received";      // the date the job order was received
var JOB_PRICE = "price";             // the service price column

var jobs = [];          // all job orders
var payments = [];      // all payments
var fromDate = "";      // "" means no start limit
var toDate = "";        // "" means no end limit
var rangeName = "all";  // all, today, week, month or custom
var shownJobs = [];     // the job orders inside the period (used by the Excel download)


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

// Is this date inside the chosen period? Only the first 10 letters (YYYY-MM-DD) are used.
function inPeriod(dateText) {
  var day = String(dateText || "").slice(0, 10);
  if (fromDate != "" && day < fromDate) { return false; }
  if (toDate != "" && day > toDate) { return false; }
  return true;
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
  byId("repErr").textContent = "";
  jobs = await getAllRows(JOB_TABLE);
  payments = await getAllRows("payments");
  draw();
}


// ===== Calculate and draw =====

function draw() {
  // 1. total paid for every job order (all payments, any date)
  var paidByJob = {};
  for (var i = 0; i < payments.length; i++) {
    var key = String(payments[i].job_order_no).trim();
    if (paidByJob[key] == null) { paidByJob[key] = 0; }
    paidByJob[key] = paidByJob[key] + Number(payments[i].amount);
  }

  // 2. money collected inside the period (uses the payment date)
  var collected = 0;
  for (var p = 0; p < payments.length; p++) {
    if (inPeriod(payments[p].paid_date)) { collected = collected + Number(payments[p].amount); }
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
    if (!inPeriod(job[JOB_DATE])) { continue; }
    shownJobs.push(job);

    var price = Number(job[JOB_PRICE]) || 0;
    var paid = paidByJob[String(job[JOB_NUMBER]).trim()] || 0;
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

  var statusHtml = "";
  for (var s = 0; s < statusNames.length; s++) {
    statusHtml += "<div class='rep-line'><span>" + escapeText(String(statusNames[s]).toUpperCase()) + "</span><b>" + statusCounts[s] + "</b></div>";
  }
  if (statusHtml == "") { statusHtml = "<p class='small-text'>No job orders in this period.</p>"; }
  byId("statusList").innerHTML = statusHtml;

  byId("moneyList").innerHTML =
    "<div class='rep-line'><span>Service Value</span><b>" + money(serviceValue) + "</b></div>" +
    "<div class='rep-line'><span>Collected in Period</span><b>" + money(collected) + "</b></div>" +
    "<div class='rep-line'><span>Currently Paid on Selected JOs</span><b>" + money(paidOnJobs) + "</b></div>" +
    "<div class='rep-line'><span>Outstanding Balance</span><b>" + money(balance) + "</b></div>";

  drawPeriod();
}

// The title text and the selected filter button
function drawPeriod() {
  var names = { all: "All Time", today: "Today", week: "Last 7 Days", month: "This Month" };
  var text = names[rangeName];
  if (rangeName == "custom") { text = (fromDate || "Start") + " to " + (toDate || "Today"); }
  byId("periodText").textContent = "Reporting Period: " + text;

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

  if (rangeName == "all") { fromDate = ""; toDate = ""; }
  if (rangeName == "today") { fromDate = today; toDate = today; }
  if (rangeName == "week") { fromDate = daysAgo(today, 6); toDate = today; }
  if (rangeName == "month") { fromDate = today.slice(0, 8) + "01"; toDate = today; }

  byId("fromDate").value = fromDate;
  byId("toDate").value = toDate;
  draw();
};

byId("applyBtn").onclick = function () {
  fromDate = byId("fromDate").value;
  toDate = byId("toDate").value;
  if (fromDate != "" && toDate != "" && fromDate > toDate) {
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
  // total paid per job order
  var paidByJob = {};
  for (var i = 0; i < payments.length; i++) {
    var key = String(payments[i].job_order_no).trim();
    if (paidByJob[key] == null) { paidByJob[key] = 0; }
    paidByJob[key] = paidByJob[key] + Number(payments[i].amount);
  }

  var lines = ["Job Order,Status,Date Received,Service Value,Paid,Balance"];
  for (var j = 0; j < shownJobs.length; j++) {
    var job = shownJobs[j];
    var price = Number(job[JOB_PRICE]) || 0;
    var paid = paidByJob[String(job[JOB_NUMBER]).trim()] || 0;
    var balance = Math.max(price - paid, 0);
    lines.push([
      csvCell(job[JOB_NUMBER]), csvCell(job[JOB_STATUS]), csvCell(String(job[JOB_DATE] || "").slice(0, 10)),
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