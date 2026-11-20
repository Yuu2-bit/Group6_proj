// ===== Joborder.js =====
// Needs /main/data.js (it does the saving and loading).
// The paper form (preview + PDF) is handled by /Joborder/jobform.js.

var allJobs = [];          // every job order from the database
var viewingId = 0;         // the job order shown in the View popup


// ----- Fill the drop-down lists -----
function fillSelect(id, items, firstItem) {
  var html = "";
  if (firstItem) { html += "<option>" + firstItem + "</option>"; }
  for (var i = 0; i < items.length; i++) {
    html += "<option>" + items[i] + "</option>";
  }
  document.getElementById(id).innerHTML = html;
}

// STATUS_LIST and SERVICE_LIST come from /main/data.js.
// If something is wrong, say exactly what on the page (no need to open the Console).
var pageProblem = "";
if (typeof supabase == "undefined") {
  pageProblem = "The Supabase library did not load (check your internet connection or ad blocker).";
} else if (typeof STATUS_LIST == "undefined" || typeof SERVICE_LIST == "undefined") {
  pageProblem = "/main/data.js stopped with an error before it finished. Open the Console (F12) to see it.";
} else if (typeof db != "undefined" && db == null) {
  pageProblem = "Not connected to the database. " + (typeof dbError != "undefined" ? dbError : "");
}

if (typeof STATUS_LIST != "undefined" && typeof SERVICE_LIST != "undefined") {
  fillSelect("status-filter", STATUS_LIST, "All Statuses");
  fillSelect("new-status", STATUS_LIST);
  fillSelect("view-status", STATUS_LIST);
  fillSelect("new-service", SERVICE_LIST);
}
if (pageProblem != "") {
  console.error(pageProblem);
  document.getElementById("count-text").textContent = "Problem: " + pageProblem;
}


// ----- Colors for the status pills -----
function statusClass(status) {
  if (status == "Released" || status == "Parts Available") { return "badge st-green"; }
  if (status == "For Releasing Good" || status == "In Repair") { return "badge st-blue"; }
  return "badge st-gray";
}


// ----- Load everything from the database -----
async function loadJobs() {
  allJobs = await getJobOrders();
  showJobs();
}

// ----- Jobs that match the search box and status filter -----
function getFilteredJobs() {
  var text = document.getElementById("search-input").value.toLowerCase().trim();
  var status = document.getElementById("status-filter").value;
  var result = [];

  for (var i = 0; i < allJobs.length; i++) {
    var j = allJobs[i];
    var everything = (jobCode(j) + " " + j.customer_name + " " + j.customer_code + " " + j.device + " " + (j.serial || "")).toLowerCase();

    if (status != "All Statuses" && j.status != status) { continue; }
    if (everything.indexOf(text) == -1) { continue; }
    result.push(j);
  }
  return result;
}


// ----- Show the stat boxes and the table -----
function showJobs() {

  // 1. Stat boxes
  var open = 0, normal = 0, aging = 0, critical = 0;
  for (var i = 0; i < allJobs.length; i++) {
    var a = getAging(allJobs[i]);
    if (a) {
      open++;
      if (a.level == "normal") { normal++; }
      if (a.level == "aging") { aging++; }
      if (a.level == "critical") { critical++; }
    }
  }
  document.getElementById("stat-total").innerHTML = allJobs.length.toLocaleString();
  document.getElementById("stat-open").innerHTML = open;
  document.getElementById("stat-normal").innerHTML = normal;
  document.getElementById("stat-aging").innerHTML = aging;
  document.getElementById("stat-critical").innerHTML = critical;

  // 2. Table rows (the first 300 matches)
  var list = getFilteredJobs();
  var shown = list.slice(0, 300);
  var rows = "";

  for (var n = 0; n < shown.length; n++) {
    var j = shown[n];
    var age = getAging(j);
    var ageHtml = "—";
    if (age) { ageHtml = "<span class='badge age-" + age.level + "'>" + age.text + "</span>"; }

    rows += "<tr>" +
      "<td class='bold-text'>" + jobCode(j) + "</td>" +
      "<td><div class='bold-text'>" + safe(j.customer_name) + "</div><div class='small-text'>" + safe(j.customer_code) + "</div></td>" +
      "<td><div class='bold-text'>" + safe(j.device) + "</div><div class='small-text'>" + safe(j.serial) + "</div></td>" +
      "<td>" + formatDate(j.date_received) + "</td>" +
      "<td><span class='" + statusClass(j.status) + "'>" + safe(j.status) + "</span></td>" +
      "<td>" + formatDateTime(j.status_started) + "</td>" +
      "<td>" + ageHtml + "</td>" +
      "<td><button class='btn btn-small' onclick='openView(" + j.id + ")'>View</button></td>" +
      "</tr>";
  }

  if (shown.length == 0) {
    rows = "<tr><td colspan='8' class='empty'>No job orders found.</td></tr>";
  }

  document.getElementById("job-list").innerHTML = rows;
  document.getElementById("count-text").innerHTML = "Showing <b>" + shown.length.toLocaleString() + "</b> of <b>" + allJobs.length.toLocaleString() + "</b> Job Orders";
}

// Search while typing
document.getElementById("search-input").onkeyup = showJobs;
document.getElementById("status-filter").onchange = showJobs;


// ----- New Job Order popup -----
async function openNewForm() {

    var overlay = document.getElementById("new-overlay");

    // Open popup immediately
    overlay.style.display = "flex";

    document.getElementById("form-error").innerHTML = "";

    // paper form boxes start clean (jobform.js)
    if (typeof prepareNewPaper == "function") { prepareNewPaper(); }

    try {

        var customers = await getCustomers();

        var options = "";

        for (var i = 0; i < customers.length; i++) {

            options += "<option value='" +
                safe(customers[i].name) + "'>";

        }

        document.getElementById("customer-names").innerHTML = options;

    } catch (error) {

        console.error(error);

        var reason = (error && error.message) ? error.message : "";
        if (pageProblem != "") { reason = pageProblem; }
        document.getElementById("form-error").textContent =
            "Unable to load customer suggestions. " + reason;

    }

}

function closeNewForm() {
  document.getElementById("new-overlay").style.display = "none";
}

async function saveJobOrder() {
  var info = {
    customerName: document.getElementById("new-customer").value.trim(),
    contact: document.getElementById("new-contact").value.trim(),
    device: document.getElementById("new-device").value.trim(),
    serial: document.getElementById("new-serial").value.trim(),
    service: document.getElementById("new-service").value,
    issue: document.getElementById("new-issue").value.trim(),
    status: document.getElementById("new-status").value,
    amount: Number(document.getElementById("new-amount").value) || 0
  };

  if (info.customerName == "" || info.device == "") {
    document.getElementById("form-error").innerHTML = "Please enter the customer name and the device.";
    return;
  }

  // the extra answers for the paper form (address, accessories, check list...)
  var paperAnswers = null;
  if (typeof collectNewPaper == "function") { paperAnswers = collectNewPaper(); }

  var error = await addJobOrder(info);
  if (error) {
    document.getElementById("form-error").innerHTML = "Could not save: " + error;
    return;
  }

  // clear the form, close it, and refresh the table
  var boxes = ["new-customer", "new-contact", "new-device", "new-serial", "new-issue"];
  for (var i = 0; i < boxes.length; i++) { document.getElementById(boxes[i]).value = ""; }
  document.getElementById("new-amount").value = 0;
  closeNewForm();
  await loadJobs();

  // show the filled-in paper form so it can be downloaded as a PDF
  if (paperAnswers && typeof finishNewPaper == "function") { finishNewPaper(info, paperAnswers); }
}


// ----- View popup (see details and change the status) -----
function openView(id) {
  var j = null;
  for (var i = 0; i < allJobs.length; i++) {
    if (allJobs[i].id == id) { j = allJobs[i]; }
  }
  if (j == null) { return; }
  viewingId = id;

  var age = getAging(j);
  document.getElementById("view-title").innerHTML = jobCode(j);
  document.getElementById("view-details").innerHTML =
    "<div class='detail-row'><span>Customer</span><span>" + safe(j.customer_name) + "</span></div>" +
    "<div class='detail-row'><span>Device</span><span>" + safe(j.device) + "</span></div>" +
    "<div class='detail-row'><span>Serial / IMEI</span><span>" + safe(j.serial) + "</span></div>" +
    "<div class='detail-row'><span>Service</span><span>" + safe(j.service) + "</span></div>" +
    "<div class='detail-row'><span>Issue</span><span>" + safe(j.issue) + "</span></div>" +
    "<div class='detail-row'><span>Estimated cost</span><span>₱" + Number(j.amount || 0).toLocaleString() + "</span></div>" +
    "<div class='detail-row'><span>Aging</span><span>" + (age ? age.text : "—") + "</span></div>";

  document.getElementById("view-status").value = j.status;

  // repair remarks + outgoing check list for the paper form (jobform.js)
  if (typeof fillViewPaper == "function") { fillViewPaper(j); }

  document.getElementById("view-overlay").style.display = "flex";
}

function closeView() {
  document.getElementById("view-overlay").style.display = "none";
}

async function saveStatus() {
  var status = document.getElementById("view-status").value;

  // keep the repair remarks and outgoing check list too (jobform.js)
  if (typeof saveViewPaper == "function") { saveViewPaper(); }

  await updateJobStatus(viewingId, status);
  closeView();
  loadJobs();
}


// ----- Export the table to a CSV file (opens in Excel) -----
function csvQuote(text) {
  return '"' + String(text == null ? "" : text).replace(/"/g, '""') + '"';
}

function exportCsv() {
  var list = getFilteredJobs();
  var lines = ["Job Order,Customer,Device,Date Received,Status,Aging"];

  for (var i = 0; i < list.length; i++) {
    var j = list[i];
    var age = getAging(j);
    lines.push([jobCode(j), j.customer_name, j.device, formatDate(j.date_received), j.status, age ? age.text : ""].map(csvQuote).join(","));
  }

  var file = new Blob([lines.join("\n")], { type: "text/csv" });
  var link = document.createElement("a");
  link.href = URL.createObjectURL(file);
  link.download = "job-orders.csv";
  link.click();
}


// ----- Start -----
if (typeof showDemoNotice == "function") { showDemoNotice(); }
loadJobs();
autoRefresh(loadJobs);