// ===== Dashboard.js =====
// Reads the job orders and customers and fills in the dashboard.
// It refreshes by itself, so new job orders show up here automatically.
// (Do not add main.js to this page.)

var dashJobs = [];


// Pill color for each status
function badgeFor(status) {
  if (status == "Released") { return "badge done"; }
  if (status == "For Checking" || status == "Cancelled") { return "badge pending"; }
  return "badge progress";
}


async function loadDashboard() {
  dashJobs = await getJobOrders();
  var customers = await getCustomers();

  var weekAgo = Date.now() - 7 * 86400000;
  var thisWeek = 0, open = 0, critical = 0, revenue = 0, newCustomers = 0;

  for (var i = 0; i < dashJobs.length; i++) {
    var j = dashJobs[i];
    if (new Date(j.date_received).getTime() > weekAgo) { thisWeek++; }
    if (j.status == "Released") { revenue += Number(j.amount || 0); }

    var age = getAging(j);
    if (age) {
      open++;
      if (age.level == "critical") { critical++; }
    }
  }

  for (var n = 0; n < customers.length; n++) {
    if (new Date(customers[n].created_at).getTime() > weekAgo) { newCustomers++; }
  }

  document.getElementById("stat-bookings").innerHTML = dashJobs.length.toLocaleString();
  document.getElementById("stat-bookings-note").innerHTML = thisWeek + " new this week";
  document.getElementById("stat-pending").innerHTML = open.toLocaleString();
  document.getElementById("stat-pending-note").innerHTML = critical + " need attention";
  document.getElementById("stat-customers").innerHTML = customers.length.toLocaleString();
  document.getElementById("stat-customers-note").innerHTML = "+" + newCustomers + " new this week";
  document.getElementById("stat-revenue").innerHTML = "₱" + revenue.toLocaleString();

  showRecent();
  showServices();
}


// ----- Recent bookings table (the 5 newest) -----
function showRecent() {
  var rows = "";
  var count = 0;

  for (var i = 0; i < dashJobs.length && count < 5; i++) {
    var j = dashJobs[i];
    rows += "<tr>" +
      "<td>" + safe(j.customer_name) + "</td>" +
      "<td>" + safe(j.service || j.device) + "</td>" +
      "<td>" + formatDate(j.date_received) + "</td>" +
      "<td><span class='" + badgeFor(j.status) + "'>" + safe(j.status) + "</span></td>" +
      "</tr>";
    count++;
  }

  if (count == 0) {
    rows = "<tr><td colspan='4'>No bookings found.</td></tr>";
  }
  document.getElementById("recent-list").innerHTML = rows;
}

// ----- Popular services bars -----
function showServices() {
  var counts = {};
  for (var i = 0; i < dashJobs.length; i++) {
    var name = dashJobs[i].service || "Other";
    counts[name] = (counts[name] || 0) + 1;
  }

  // turn the counts into a list and sort it (biggest first)
  var list = [];
  for (var key in counts) { list.push({ name: key, count: counts[key] }); }
  list.sort(function (a, b) { return b.count - a.count; });

  var html = "";
  for (var n = 0; n < list.length && n < 4; n++) {
    var percent = Math.round(list[n].count / dashJobs.length * 100);
    html += "<div class='service-item'>" +
      "<div class='service-top'><span>" + safe(list[n].name) + "</span><span>" + percent + "%</span></div>" +
      "<div class='bar-back'><div class='bar-fill' style='width: " + percent + "%'></div></div>" +
      "</div>";
  }

  if (html == "") { html = "<p class='small-text'>No job orders yet.</p>"; }
  document.getElementById("services-list").innerHTML = html;
}


// ----- Start -----
loadDashboard();
autoRefresh(loadDashboard);


// ----- Extra auto-update (new job orders show up without reloading) -----
// loadDashboard() is called by all of these. The guard stops two
// refreshes from running at the same time.
var dashLoading = false;

function refreshDashboard() {
  if (dashLoading) { return; }
  dashLoading = true;
  loadDashboard().then(function () { dashLoading = false; },
                       function () { dashLoading = false; });
}

// 1) Instant update: the Job Order page sends a message after it saves
//    (see the two lines to add in Joborder.js).
if ("BroadcastChannel" in window) {
  new BroadcastChannel("repair-shop-updates").onmessage = refreshDashboard;
}
window.addEventListener("storage", function (e) {
  if (e.key == "repair-shop-updated") { refreshDashboard(); }
});

// 2) Update when you switch back to this tab.
document.addEventListener("visibilitychange", function () {
  if (!document.hidden) { refreshDashboard(); }
});

// 3) Safety net: check again every 15 seconds while the tab is open.
setInterval(function () {
  if (!document.hidden) { refreshDashboard(); }
}, 15000);