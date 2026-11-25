var allCustomers = [];
var firstRender = true;
var viewingCustomerId = null;
var viewingJobCount = null;

async function loadCustomers() {
    try {
        allCustomers = await getCustomers();

        if (!Array.isArray(allCustomers)) {
            allCustomers = [];
        }

        showCustomers();

    } catch (error) {
        console.error("Error loading customers:", error);

        document.getElementById("customer-list").innerHTML =
            "<tr><td colspan='6' class='empty'>Unable to load customers.</td></tr>";

        document.getElementById("count-text").textContent =
            "Unable to load customers";
    }
}

function showCustomers() {
    var searchInput = document.getElementById("search-input");
    var customerList = document.getElementById("customer-list");
    var countText = document.getElementById("count-text");

    if (!searchInput || !customerList || !countText) {
        return;
    }

    var text = searchInput.value.toLowerCase().trim();
    var matches = [];

    for (var i = 0; i < allCustomers.length; i++) {
        var c = allCustomers[i];

        var everything = (
            customerCode(c) + " " +
            (c.name || "") + " " +
            (c.contact || "") + " " +
            (c.location || "")
        ).toLowerCase();

        if (everything.indexOf(text) > -1) {
            matches.push(c);
        }
    }

    var shown = matches.slice(0, 200);
    var rows = "";

    // Only cascade the rows on the first render, not while searching or auto-refreshing
    customerList.classList.toggle("animate-rows", firstRender && shown.length > 0);

    for (var n = 0; n < shown.length; n++) {
        var cu = shown[n];

        var badgeClass = (cu.status == "Inactive")
            ? "badge pending"
            : "badge done";

        rows += "<tr style='--i:" + Math.min(n, 15) + "'>" +
            "<td class='bold-text'>" + safe(customerCode(cu)) + "</td>" +
            "<td><div class='bold-text'>" + safe(cu.name || "") + "</div>" +
            "<div class='small-text'>" + safe(cu.type || "") + "</div></td>" +
            "<td>" + safe(cu.contact || "") + "</td>" +
            "<td>" + safe(cu.location || "") + "</td>" +
            "<td><span class='" + badgeClass + "'>" + safe(cu.status || "") + "</span></td>" +
            "<td><a class='view-link' data-id='" + safe(String(cu.id)) + "' onclick='viewCustomer(this.dataset.id)'>View</a></td>" +
            "</tr>";
    }

    if (shown.length == 0) {
        rows = "<tr><td colspan='6' class='empty'>No customers found.</td></tr>";
    }

    customerList.innerHTML = rows;

    countText.textContent =
        "Showing " + shown.length.toLocaleString() +
        " of " + allCustomers.length.toLocaleString() +
        " customers";

    if (shown.length > 0) {
        firstRender = false;
    }
}

var searchInput = document.getElementById("search-input");

if (searchInput) {
    searchInput.addEventListener("input", showCustomers);
}

async function viewCustomer(id) {
    var c = null;

    for (var i = 0; i < allCustomers.length; i++) {
        if (String(allCustomers[i].id) == String(id)) {
            c = allCustomers[i];
            break;
        }
    }

    if (c == null) {
        return;
    }

    // Remember which customer is open (used by the Delete button)
    viewingCustomerId = c.id;
    viewingJobCount = null;

    document.getElementById("view-id").textContent = customerCode(c);
    document.getElementById("view-name").textContent = c.name || "—";
    document.getElementById("view-type").textContent = c.type || "—";
    document.getElementById("view-contact").textContent = c.contact || "—";
    document.getElementById("view-location").textContent = c.location || "—";
    document.getElementById("view-status").textContent = c.status || "—";

    var modal = document.getElementById("customerModal");
    var historyBox = document.getElementById("view-history");
    var historyCount = document.getElementById("history-count");

    modal.style.display = "flex";

    historyBox.innerHTML =
        "<tr><td colspan='3' class='empty'>Loading repair history...</td></tr>";

    historyCount.textContent = "Loading...";

    try {
        var jobs = await getJobOrders();

        if (!Array.isArray(jobs)) {
            jobs = [];
        }

        var history = [];

        for (var n = 0; n < jobs.length; n++) {
            if (String(jobs[n].customer_id) == String(id)) {
                history.push(jobs[n]);
            }
        }

        // Only update if this customer's popup is still open
        if (String(viewingCustomerId) == String(id)) {
            viewingJobCount = history.length;
        }

        if (history.length == 0) {
            historyBox.innerHTML =
                "<tr><td colspan='3' class='empty'>No repairs yet.</td></tr>";

            historyCount.textContent = "0 repairs";
            return;
        }

        var rows = "";

        for (var j = 0; j < history.length; j++) {
            var job = history[j];

            rows += "<tr>" +
                "<td class='bold-text'>" + safe(jobCode(job)) + "</td>" +
                "<td>" + safe(job.device || "No device specified") + "</td>" +
                "<td><span class='badge " +
                (job.status == "Completed" ? "done" : "pending") +
                "'>" + safe(job.status || "No status") + "</span></td>" +
                "</tr>";
        }

        historyBox.innerHTML = rows;
        historyCount.textContent =
            history.length + (history.length == 1 ? " repair" : " repairs");

    } catch (error) {
        console.error("Error loading repair history:", error);

        historyBox.innerHTML =
            "<tr><td colspan='3' class='empty'>Unable to load repair history.</td></tr>";

        historyCount.textContent = "Unavailable";
    }
}

async function deleteCurrentCustomer() {
    if (viewingCustomerId === null) {
        return;
    }

    if (viewingJobCount === null) {
        alert("Repair history is still loading. Please try again in a moment.");
        return;
    }

    var name = document.getElementById("view-name").textContent;
    var message = 'Delete customer "' + name + '"?';

    if (viewingJobCount > 0) {
        message += "\n\nThis customer has " + viewingJobCount +
            (viewingJobCount == 1 ? " job order" : " job orders") +
            ". They will be deleted too.";
    }

    message += "\n\nThis cannot be undone.";

    if (!confirm(message)) {
        return;
    }

    var error = await deleteCustomer(viewingCustomerId, viewingJobCount > 0);

    if (error) {
        alert("Unable to delete customer: " + error);
        return;
    }

    closeCustomerModal();

    await loadCustomers();
}

function closeCustomerModal() {
    document.getElementById("customerModal").style.display = "none";

    viewingCustomerId = null;
    viewingJobCount = null;
}

var customerModal = document.getElementById("customerModal");

if (customerModal) {
    customerModal.addEventListener("click", function(event) {
        if (event.target === customerModal) {
            closeCustomerModal();
        }
    });
}

document.addEventListener("keydown", function(event) {
    if (event.key === "Escape") {
        closeCustomerModal();
    }
});

showDemoNotice();
loadCustomers();
autoRefresh(loadCustomers);