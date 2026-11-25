
var allJobs = [];
var viewingId = 0;
var firstLoad = true;
var pageProblem = "";

document.body.classList.add("first-load");

setTimeout(function () {
    document.body.classList.remove("first-load");
    firstLoad = false;
}, 2000);

function setStat(id, value) {
    var el = document.getElementById(id);

    if (!el) {
        return;
    }

    var reduce = window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!firstLoad || reduce) {
        el.textContent = Number(value).toLocaleString();
        return;
    }

    var start = null;

    function step(t) {
        if (start === null) {
            start = t;
        }

        var p = Math.min((t - start) / 900, 1);

        if (p >= 1) {
            el.textContent = Number(value).toLocaleString();
            return;
        }

        el.textContent = Math.round(
            value * (1 - Math.pow(1 - p, 3))
        ).toLocaleString();

        requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
}

function fillSelect(id, items, firstItem) {
    var select = document.getElementById(id);

    if (!select) {
        return;
    }

    var html = "";

    if (firstItem) {
        html += "<option value='" + safe(firstItem) + "'>" +
            safe(firstItem) + "</option>";
    }

    for (var i = 0; i < items.length; i++) {
        html += "<option value='" + safe(items[i]) + "'>" +
            safe(items[i]) + "</option>";
    }

    select.innerHTML = html;
}

if (typeof supabase === "undefined") {
    pageProblem = "The Supabase library did not load. Check your internet connection.";
} else if (
    typeof STATUS_LIST === "undefined" ||
    typeof SERVICE_LIST === "undefined"
) {
    pageProblem = "/main/data.js did not load correctly.";
} else if (typeof db !== "undefined" && db === null) {
    pageProblem = "Not connected to the database. " +
        (typeof dbError !== "undefined" ? dbError : "");
}

if (
    typeof STATUS_LIST !== "undefined" &&
    typeof SERVICE_LIST !== "undefined"
) {
    fillSelect("status-filter", STATUS_LIST, "All Statuses");
    fillSelect("new-status", STATUS_LIST);
    fillSelect("view-status", STATUS_LIST);
    fillSelect("new-service", SERVICE_LIST);
}

if (pageProblem !== "") {
    console.error(pageProblem);

    var countText = document.getElementById("count-text");

    if (countText) {
        countText.textContent = "Problem: " + pageProblem;
    }
}

function statusClass(status) {
    if (status === "Released" || status === "Parts Available") {
        return "badge st-green";
    }

    if (status === "For Releasing Good" || status === "In Repair") {
        return "badge st-blue";
    }

    return "badge st-gray";
}

async function loadJobs() {
    try {
        var jobs = await getJobOrders();

        allJobs = Array.isArray(jobs) ? jobs : [];

        showJobs();
    } catch (error) {
        console.error("Unable to load job orders:", error);

        var countText = document.getElementById("count-text");

        if (countText) {
            countText.textContent = "Unable to load job orders: " +
                error.message;
        }
    }
}

function getFilteredJobs() {
    var searchInput = document.getElementById("search-input");
    var statusFilter = document.getElementById("status-filter");

    var text = searchInput
        ? searchInput.value.toLowerCase().trim()
        : "";

    var status = statusFilter
        ? statusFilter.value
        : "All Statuses";

    var result = [];

    for (var i = 0; i < allJobs.length; i++) {
        var j = allJobs[i];

        var everything = (
            jobCode(j) + " " +
            (j.customer_name || "") + " " +
            (j.customer_code || "") + " " +
            (j.device || "") + " " +
            (j.serial || "")
        ).toLowerCase();

        if (status !== "All Statuses" && j.status !== status) {
            continue;
        }

        if (everything.indexOf(text) === -1) {
            continue;
        }

        result.push(j);
    }

    return result;
}

function showJobs() {
    var open = 0;
    var normal = 0;
    var aging = 0;
    var critical = 0;

    for (var i = 0; i < allJobs.length; i++) {
        var a = getAging(allJobs[i]);

        if (a) {
            open++;

            if (a.level === "normal") {
                normal++;
            }

            if (a.level === "aging") {
                aging++;
            }

            if (a.level === "critical") {
                critical++;
            }
        }
    }

    setStat("stat-total", allJobs.length);
    setStat("stat-open", open);
    setStat("stat-normal", normal);
    setStat("stat-aging", aging);
    setStat("stat-critical", critical);

    var list = getFilteredJobs();
    var shown = list.slice(0, 300);
    var rows = "";

    for (var n = 0; n < shown.length; n++) {
        var j = shown[n];
        var age = getAging(j);
        var ageHtml = "—";

        if (age) {
            ageHtml = "<span class='badge age-" +
                safe(age.level) + "'>" +
                safe(age.text) +
                "</span>";
        }

        rows +=
            "<tr>" +
            "<td class='bold-text'>" +
            safe(jobCode(j)) +
            "</td>" +

            "<td>" +
            "<div class='bold-text'>" +
            safe(j.customer_name) +
            "</div>" +
            "<div class='small-text'>" +
            safe(j.customer_code) +
            "</div>" +
            "</td>" +

            "<td>" +
            "<div class='bold-text'>" +
            safe(j.device) +
            "</div>" +
            "<div class='small-text'>" +
            safe(j.serial) +
            "</div>" +
            "</td>" +

            "<td>" +
            formatDate(j.date_received || j.created_at) +
            "</td>" +

            "<td>" +
            "<span class='" + statusClass(j.status) + "'>" +
            safe(j.status) +
            "</span>" +
            "</td>" +

            "<td>" +
            formatDateTime(j.status_started) +
            "</td>" +

            "<td>" + ageHtml + "</td>" +

            "<td>" +
            "<button class='btn btn-small' onclick='openView(" +
            Number(j.id) +
            ")'>View</button>" +
            "</td>" +

            "</tr>";
    }

    if (shown.length === 0) {
        rows = "<tr><td colspan='8' class='empty'>" +
            "No job orders found.</td></tr>";
    }

    var jobList = document.getElementById("job-list");

    if (jobList) {
        jobList.innerHTML = rows;
    }

    var countText = document.getElementById("count-text");

    if (countText) {
        countText.innerHTML =
            "Showing <b>" +
            shown.length.toLocaleString() +
            "</b> of <b>" +
            allJobs.length.toLocaleString() +
            "</b> Job Orders";
    }
}

var searchInput = document.getElementById("search-input");
var statusFilter = document.getElementById("status-filter");

if (searchInput) {
    searchInput.oninput = showJobs;
}

if (statusFilter) {
    statusFilter.onchange = showJobs;
}

async function openNewForm() {
    var overlay = document.getElementById("new-overlay");

    if (!overlay) {
        return;
    }

    overlay.style.display = "flex";

    document.getElementById("form-error").textContent = "";

    if (typeof prepareNewPaper === "function") {
        prepareNewPaper();
    }

    try {
        var customers = await getCustomers();
        var options = "";

        for (var i = 0; i < customers.length; i++) {
            options += "<option value='" +
                safe(customers[i].name) + "'>";
        }

        document.getElementById("customer-names").innerHTML = options;

    } catch (error) {
        console.error("Unable to load customers:", error);

        var reason = error && error.message
            ? error.message
            : "Unknown error.";

        document.getElementById("form-error").textContent =
            "Unable to load customer suggestions. " + reason;
    }
}

function closeNewForm() {
    document.getElementById("new-overlay").style.display = "none";
}

async function saveJobOrder() {
    var errorElement = document.getElementById("form-error");

    errorElement.textContent = "";

    var info = {
        customerName: document.getElementById("new-customer").value.trim(),
        contact: document.getElementById("new-contact").value.trim(),
        address: document.getElementById("new-address").value.trim(),
        device: document.getElementById("new-device").value.trim(),
        serial: document.getElementById("new-serial").value.trim(),
        service: document.getElementById("new-service").value,
        issue: document.getElementById("new-issue").value.trim(),
        status: document.getElementById("new-status").value,
        amount: Number(document.getElementById("new-amount").value) || 0,
        date_received: new Date().toISOString()
    };

    if (info.customerName === "" || info.device === "") {
        errorElement.textContent =
            "Please enter the customer name and the device.";
        return;
    }

    var paperAnswers = null;

    if (typeof collectNewPaper === "function") {
        paperAnswers = collectNewPaper();
    }

    try {
        var error = await addJobOrder(info);

        if (error) {
            errorElement.textContent = "Could not save: " + error;
            return;
        }

        var boxes = [
            "new-customer",
            "new-contact",
            "new-device",
            "new-serial",
            "new-issue"
        ];

        for (var i = 0; i < boxes.length; i++) {
            document.getElementById(boxes[i]).value = "";
        }

        document.getElementById("new-amount").value = 0;

        closeNewForm();

        await loadJobs();

        if (
            paperAnswers &&
            typeof finishNewPaper === "function"
        ) {
            finishNewPaper(info, paperAnswers);
        }

    } catch (error) {
        console.error("Job order saving error:", error);

        errorElement.textContent =
            "Could not save: " +
            (error.message || "Please try again.");
    }
}

function openView(id) {
    var j = null;

    for (var i = 0; i < allJobs.length; i++) {
        if (allJobs[i].id == id) {
            j = allJobs[i];
            break;
        }
    }

    if (j === null) {
        return;
    }

    viewingId = id;

    var age = getAging(j);

    document.getElementById("view-title").textContent =
        jobCode(j);

    document.getElementById("view-details").innerHTML =
        "<div class='detail-row'><span>Customer</span><span>" +
        safe(j.customer_name) +
        "</span></div>" +

        "<div class='detail-row'><span>Device</span><span>" +
        safe(j.device) +
        "</span></div>" +

        "<div class='detail-row'><span>Serial / IMEI</span><span>" +
        safe(j.serial) +
        "</span></div>" +

        "<div class='detail-row'><span>Service</span><span>" +
        safe(j.service) +
        "</span></div>" +

        "<div class='detail-row'><span>Issue</span><span>" +
        safe(j.issue) +
        "</span></div>" +

        "<div class='detail-row'><span>Estimated cost</span><span>₱" +
        Number(j.amount || 0).toLocaleString() +
        "</span></div>" +

        "<div class='detail-row'><span>Date received</span><span>" +
        formatDate(j.date_received || j.created_at) +
        "</span></div>" +

        "<div class='detail-row'><span>Aging</span><span>" +
        (age ? safe(age.text) : "—") +
        "</span></div>";

    document.getElementById("view-status").value = j.status;

    if (typeof fillViewPaper === "function") {
        fillViewPaper(j);
    }

    document.getElementById("view-overlay").style.display = "flex";
}

function closeView() {
    document.getElementById("view-overlay").style.display = "none";
}

async function saveStatus() {
    var status = document.getElementById("view-status").value;

    try {
        if (typeof saveViewPaper === "function") {
            saveViewPaper();
        }

        var error = await updateJobStatus(viewingId, status);

        if (error) {
            alert("Unable to update status: " + error);
            return;
        }

        closeView();

        await loadJobs();

    } catch (error) {
        console.error("Status update error:", error);

        alert("Unable to update status: " + error.message);
    }
}

function csvQuote(text) {
    return '"' +
        String(text == null ? "" : text).replace(/"/g, '""') +
        '"';
}

function exportCsv() {
    var list = getFilteredJobs();

    var lines = [
        "Job Order,Customer,Device,Date Received,Status,Aging"
    ];

    for (var i = 0; i < list.length; i++) {
        var j = list[i];
        var age = getAging(j);

        lines.push([
            jobCode(j),
            j.customer_name,
            j.device,
            formatDate(j.date_received || j.created_at),
            j.status,
            age ? age.text : ""
        ].map(csvQuote).join(","));
    }

    var file = new Blob(
        [lines.join("\n")],
        { type: "text/csv;charset=utf-8;" }
    );

    var link = document.createElement("a");

    link.href = URL.createObjectURL(file);
    link.download = "job-orders.csv";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(link.href);
}

if (typeof showDemoNotice === "function") {
    showDemoNotice();
}

loadJobs();

if (typeof autoRefresh === "function") {
    autoRefresh(loadJobs);
}
