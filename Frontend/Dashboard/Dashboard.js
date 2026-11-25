// ===== Dashboard.js =====
// Reads the job orders and customers and fills in the dashboard.
// It refreshes by itself, so new job orders show up here automatically.
// (Do not add main.js to this page.)

var dashJobs = [];


// ----- Intro animation (first load only) -----
// "first-load" on <body> switches on the entrance animations in Dashboard.css.
// It is removed after 2 seconds so the 15-second auto-refresh does not replay them.
var firstLoad = true;
document.body.classList.add("first-load");
setTimeout(function () {
  document.body.classList.remove("first-load");
  firstLoad = false;
}, 2000);

// Sets a stat number. On first load it counts up from 0.
function setStat(id, value, prefix) {
  var el = document.getElementById(id);
  prefix = prefix || "";

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!firstLoad || reduce) {
    el.innerHTML = prefix + value.toLocaleString();
    return;
  }

  var start = null;
  var duration = 900;
  function step(t) {
    if (start === null) { start = t; }
    var p = Math.min((t - start) / duration, 1);
    if (p >= 1) {
      el.innerHTML = prefix + value.toLocaleString();
      return;
    }
    var eased = 1 - Math.pow(1 - p, 3);
    el.innerHTML = prefix + Math.round(value * eased).toLocaleString();
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}


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

  setStat("stat-bookings", dashJobs.length);
  document.getElementById("stat-bookings-note").innerHTML = thisWeek + " new this week";
  setStat("stat-pending", open);
  document.getElementById("stat-pending-note").innerHTML = critical + " need attention";
  setStat("stat-customers", customers.length);
  document.getElementById("stat-customers-note").innerHTML = "+" + newCustomers + " new this week";
  setStat("stat-revenue", revenue, "₱");

  showRecent();
  showServices();
  showCharts();
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


// ----- Two extra charts -----
function showCharts() {
  showWeekChart();
  showStatusChart();
}

// Bar chart: job orders received per day, last 7 days
function showWeekChart() {
  var days = [];
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  for (var d = 6; d >= 0; d--) {
    var day = new Date(today);
    day.setDate(today.getDate() - d);
    days.push({ key: day.toDateString(), label: day.toLocaleDateString("en-US", { weekday: "short" }), count: 0 });
  }

  for (var i = 0; i < dashJobs.length; i++) {
    if (!dashJobs[i].date_received) { continue; }
    var key = new Date(dashJobs[i].date_received).toDateString();
    for (var n = 0; n < days.length; n++) {
      if (days[n].key == key) { days[n].count++; }
    }
  }

  var max = 1;
  for (var m = 0; m < days.length; m++) {
    if (days[m].count > max) { max = days[m].count; }
  }

  var html = "";
  for (var k = 0; k < days.length; k++) {
    var height = Math.round(days[k].count / max * 130);
    html += "<div class='week-col'>" +
      "<span class='week-count'>" + days[k].count + "</span>" +
      "<div class='week-bar' style='height: " + height + "px'></div>" +
      "<span class='week-day'>" + days[k].label + "</span>" +
      "</div>";
  }
  document.getElementById("week-chart").innerHTML = html;
}

// Donut chart: job orders by status
function showStatusChart() {
  var colors = ["#4f46e5", "#16a34a", "#f59e0b", "#ef4444", "#0ea5e9", "#a855f7", "#64748b"];
  var counts = {};
  for (var i = 0; i < dashJobs.length; i++) {
    var s = dashJobs[i].status || "No status";
    counts[s] = (counts[s] || 0) + 1;
  }

  var list = [];
  for (var key in counts) { list.push({ name: key, count: counts[key] }); }
  list.sort(function (a, b) { return b.count - a.count; });

  var total = dashJobs.length;
  var donut = document.getElementById("status-donut");
  var legend = document.getElementById("status-legend");

  if (total == 0) {
    donut.style.background = "";
    legend.innerHTML = "<p class='small-text'>No job orders yet.</p>";
    return;
  }

  var stops = [];
  var html = "";
  var start = 0;
  for (var n = 0; n < list.length; n++) {
    var color = colors[n % colors.length];
    var end = start + list[n].count / total * 100;
    stops.push(color + " " + start + "% " + end + "%");
    start = end;

    html += "<div class='legend-item'>" +
      "<span class='legend-dot' style='background:" + color + "'></span>" +
      "<span>" + safe(list[n].name) + "</span>" +
      "<span class='legend-count'>" + list[n].count + "</span>" +
      "</div>";
  }

  donut.style.background = "conic-gradient(" + stops.join(", ") + ")";
  legend.innerHTML = html;
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