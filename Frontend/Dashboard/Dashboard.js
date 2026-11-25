
var dashJobs = [];
var firstLoad = true;
var dashLoading = false;

document.body.classList.add("first-load");

setTimeout(function () {
    document.body.classList.remove("first-load");
    firstLoad = false;
}, 2000);


// STATISTICS

function setStat(id, value, prefix) {
    var el = document.getElementById(id);

    if (!el) {
        return;
    }

    prefix = prefix || "";

    var reduce = window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!firstLoad || reduce) {
        el.textContent = prefix + value.toLocaleString();
        return;
    }

    var start = null;
    var duration = 900;

    function step(t) {
        if (start === null) {
            start = t;
        }

        var p = Math.min((t - start) / duration, 1);

        if (p >= 1) {
            el.textContent = prefix + value.toLocaleString();
            return;
        }

        var eased = 1 - Math.pow(1 - p, 3);

        el.textContent =
            prefix + Math.round(value * eased).toLocaleString();

        requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
}


// STATUS BADGES

function badgeFor(status) {
    var value = String(status || "").trim().toLowerCase();

    if (value === "released") {
        return "badge done";
    }

    if (
        value === "for checking" ||
        value === "cancelled" ||
        value === "canceled"
    ) {
        return "badge pending";
    }

    return "badge progress";
}


// LOAD DASHBOARD

async function loadDashboard() {
    try {
        var results = await Promise.all([
            getJobOrders(),
            getCustomers(),
            getPayments()
        ]);

        dashJobs = Array.isArray(results[0]) ? results[0] : [];

        var customers = Array.isArray(results[1])
            ? results[1]
            : [];

        var payments = Array.isArray(results[2])
            ? results[2]
            : [];

        var weekAgo = Date.now() - (7 * 86400000);

        var thisWeek = 0;
        var open = 0;
        var critical = 0;
        var revenue = 0;
        var newCustomers = 0;

        // COUNT BOOKINGS AND PENDING REPAIRS

        for (var i = 0; i < dashJobs.length; i++) {
            var j = dashJobs[i];

            var status = String(j.status || "")
                .trim()
                .toLowerCase();

            if (
                j.date_received &&
                new Date(j.date_received).getTime() > weekAgo
            ) {
                thisWeek++;
            }

            if (
                status !== "released" &&
                status !== "cancelled" &&
                status !== "canceled"
            ) {
                open++;

                var startDate =
                    j.status_started ||
                    j.date_received ||
                    j.created_at;

                if (startDate) {
                    var startTime = new Date(startDate).getTime();

                    if (!isNaN(startTime)) {
                        var ageDays = Math.floor(
                            (Date.now() - startTime) / 86400000
                        );

                        if (ageDays >= 8) {
                            critical++;
                        }
                    }
                }
            }
        }

        // CALCULATE REVENUE FROM PAYMENTS

        for (var p = 0; p < payments.length; p++) {
            var paymentAmount = Number(payments[p].amount);

            if (isFinite(paymentAmount)) {
                revenue += paymentAmount;
            }
        }

        // COUNT NEW CUSTOMERS

        for (var n = 0; n < customers.length; n++) {
            if (
                customers[n].created_at &&
                new Date(customers[n].created_at).getTime() > weekAgo
            ) {
                newCustomers++;
            }
        }

        // UPDATE STATISTICS

        setStat("stat-bookings", dashJobs.length);

        document.getElementById("stat-bookings-note").textContent =
            thisWeek + " new this week";

        setStat("stat-pending", open);

        document.getElementById("stat-pending-note").textContent =
            critical + " need attention";

        setStat("stat-customers", customers.length);

        document.getElementById("stat-customers-note").textContent =
            "+" + newCustomers + " new this week";

        setStat("stat-revenue", revenue, "₱");

        // UPDATE DASHBOARD CONTENT

        showRecent();
        showServices();
        showCharts();

        console.log("Dashboard updated successfully.");
        console.log("Total payments:", payments.length);
        console.log("Total revenue:", revenue);
        console.log("Pending repairs:", open);
        console.log("Need attention:", critical);

    } catch (error) {
        console.error("Dashboard loading error:", error);
    }
}


// RECENT BOOKINGS

function showRecent() {
    var rows = "";
    var count = 0;

    for (var i = 0; i < dashJobs.length && count < 5; i++) {
        var j = dashJobs[i];

        rows += "<tr>" +
            "<td>" + safe(j.customer_name || "") + "</td>" +
            "<td>" + safe(j.service || j.device || "") + "</td>" +
            "<td>" + formatDate(j.date_received) + "</td>" +
            "<td><span class='" + badgeFor(j.status) + "'>" +
            safe(j.status || "") +
            "</span></td>" +
            "</tr>";

        count++;
    }

    if (count === 0) {
        rows = "<tr><td colspan='4'>No bookings found.</td></tr>";
    }

    document.getElementById("recent-list").innerHTML = rows;
}


// POPULAR SERVICES

function showServices() {
    var counts = {};

    for (var i = 0; i < dashJobs.length; i++) {
        var name = dashJobs[i].service || "Other";

        counts[name] = (counts[name] || 0) + 1;
    }

    var list = [];

    for (var key in counts) {
        list.push({
            name: key,
            count: counts[key]
        });
    }

    list.sort(function (a, b) {
        return b.count - a.count;
    });

    var html = "";

    for (var n = 0; n < list.length && n < 4; n++) {
        var percent = Math.round(
            list[n].count / dashJobs.length * 100
        );

        html += "<div class='service-item'>" +
            "<div class='service-top'>" +
            "<span>" + safe(list[n].name) + "</span>" +
            "<span>" + percent + "%</span>" +
            "</div>" +
            "<div class='bar-back'>" +
            "<div class='bar-fill' style='width:" + percent + "%'></div>" +
            "</div>" +
            "</div>";
    }

    if (html === "") {
        html = "<p class='small-text'>No job orders yet.</p>";
    }

    document.getElementById("services-list").innerHTML = html;
}


// CHARTS

function showCharts() {
    showWeekChart();
    showStatusChart();
}


// BOOKINGS THIS WEEK

function showWeekChart() {
    var days = [];
    var today = new Date();

    today.setHours(0, 0, 0, 0);

    for (var d = 6; d >= 0; d--) {
        var day = new Date(today);

        day.setDate(today.getDate() - d);

        days.push({
            key: day.toDateString(),
            label: day.toLocaleDateString("en-US", {
                weekday: "short"
            }),
            count: 0
        });
    }

    for (var i = 0; i < dashJobs.length; i++) {
        if (!dashJobs[i].date_received) {
            continue;
        }

        var key = new Date(
            dashJobs[i].date_received
        ).toDateString();

        for (var n = 0; n < days.length; n++) {
            if (days[n].key === key) {
                days[n].count++;
            }
        }
    }

    var max = 1;

    for (var m = 0; m < days.length; m++) {
        if (days[m].count > max) {
            max = days[m].count;
        }
    }

    var html = "";

    for (var k = 0; k < days.length; k++) {
        var height = Math.round(
            days[k].count / max * 130
        );

        html += "<div class='week-col'>" +
            "<span class='week-count'>" + days[k].count + "</span>" +
            "<div class='week-bar' style='height:" + height + "px'></div>" +
            "<span class='week-day'>" + days[k].label + "</span>" +
            "</div>";
    }

    document.getElementById("week-chart").innerHTML = html;
}


// STATUS BREAKDOWN

function showStatusChart() {
    var colors = [
        "#4f46e5",
        "#16a34a",
        "#f59e0b",
        "#ef4444",
        "#0ea5e9",
        "#a855f7",
        "#64748b"
    ];

    var counts = {};

    for (var i = 0; i < dashJobs.length; i++) {
        var status = dashJobs[i].status || "No status";

        counts[status] = (counts[status] || 0) + 1;
    }

    var list = [];

    for (var key in counts) {
        list.push({
            name: key,
            count: counts[key]
        });
    }

    list.sort(function (a, b) {
        return b.count - a.count;
    });

    var total = dashJobs.length;

    var donut = document.getElementById("status-donut");
    var legend = document.getElementById("status-legend");

    if (total === 0) {
        donut.style.background = "";
        legend.innerHTML =
            "<p class='small-text'>No job orders yet.</p>";
        return;
    }

    var stops = [];
    var html = "";
    var start = 0;

    for (var n = 0; n < list.length; n++) {
        var color = colors[n % colors.length];

        var end = start + (list[n].count / total * 100);

        stops.push(color + " " + start + "% " + end + "%");

        start = end;

        html += "<div class='legend-item'>" +
            "<span class='legend-dot' style='background:" + color + "'></span>" +
            "<span>" + safe(list[n].name) + "</span>" +
            "<span class='legend-count'>" + list[n].count + "</span>" +
            "</div>";
    }

    donut.style.background =
        "conic-gradient(" + stops.join(", ") + ")";

    legend.innerHTML = html;
}


// REFRESH DASHBOARD

function refreshDashboard() {
    if (dashLoading) {
        return;
    }

    dashLoading = true;

    loadDashboard()
        .finally(function () {
            dashLoading = false;
        });
}


// INITIAL LOAD

refreshDashboard();


// BROADCAST CHANNEL

if ("BroadcastChannel" in window) {
    var dashboardChannel =
        new BroadcastChannel("repair-shop-updates");

    dashboardChannel.onmessage = function () {
        refreshDashboard();
    };
}


// STORAGE UPDATE

window.addEventListener("storage", function (e) {
    if (e.key === "repair-shop-updated") {
        refreshDashboard();
    }
});


// UPDATE WHEN RETURNING TO DASHBOARD

document.addEventListener("visibilitychange", function () {
    if (!document.hidden) {
        refreshDashboard();
    }
});


// AUTOMATIC REFRESH EVERY 15 SECONDS

setInterval(function () {
    if (!document.hidden) {
        refreshDashboard();
    }
}, 15000);
