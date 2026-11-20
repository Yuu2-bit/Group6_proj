// ===== Customers.js =====
// Needs /main/data.js. This page only SHOWS customers.
// New customers are created from the Job Order page.

var allCustomers = [];


async function loadCustomers() {
  allCustomers = await getCustomers();
  showCustomers();
}

function showCustomers() {
  var text = document.getElementById("search-input").value.toLowerCase().trim();
  var matches = [];

  for (var i = 0; i < allCustomers.length; i++) {
    var c = allCustomers[i];
    var everything = (customerCode(c) + " " + c.name + " " + (c.contact || "") + " " + (c.location || "")).toLowerCase();
    if (everything.indexOf(text) > -1) { matches.push(c); }
  }

  var shown = matches.slice(0, 200);      // show the first 200 matches
  var rows = "";

  for (var n = 0; n < shown.length; n++) {
    var cu = shown[n];
    var badgeClass = (cu.status == "Inactive") ? "badge pending" : "badge done";

    rows += "<tr>" +
      "<td class='bold-text'>" + safe(customerCode(cu)) + "</td>" +
      "<td><div class='bold-text'>" + safe(cu.name) + "</div><div class='small-text'>" + safe(cu.type) + "</div></td>" +
      "<td>" + safe(cu.contact) + "</td>" +
      "<td>" + safe(cu.location) + "</td>" +
      "<td><span class='" + badgeClass + "'>" + safe(cu.status) + "</span></td>" +
      "<td><a class='view-link' onclick='viewCustomer(" + cu.id + ")'>View</a></td>" +
      "</tr>";
  }

  if (shown.length == 0) {
    rows = "<tr><td colspan='6' class='empty'>No customers found.</td></tr>";
  }

  document.getElementById("customer-list").innerHTML = rows;
  document.getElementById("count-text").innerHTML = "Showing " + shown.length.toLocaleString() + " of " + allCustomers.length.toLocaleString() + " customers";
}

// Search while typing
document.getElementById("search-input").onkeyup = showCustomers;


// ----- View button: shows the customer and their repair history -----
async function viewCustomer(id) {
  var c = null;
  for (var i = 0; i < allCustomers.length; i++) {
    if (allCustomers[i].id == id) { c = allCustomers[i]; }
  }
  if (c == null) { return; }

  var jobs = await getJobOrders();
  var history = "";
  var count = 0;
  for (var n = 0; n < jobs.length; n++) {
    if (jobs[n].customer_id == id) {
      history += "\n" + jobCode(jobs[n]) + " - " + jobs[n].device + " - " + jobs[n].status;
      count++;
    }
  }
  if (count == 0) { history = "\nNo repairs yet."; }

  alert(customerCode(c) + "\n" + c.name + " (" + c.type + ")\nContact: " + (c.contact || "—") +
        "\nLocation: " + (c.location || "—") + "\n\nRepair history (" + count + "):" + history);
}


// ----- Start -----
showDemoNotice();
loadCustomers();
autoRefresh(loadCustomers);