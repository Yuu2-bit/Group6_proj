// ===== Payments.js =====
// Needs /main/data.js (for the database connection called "db").
// Saves to the "payments" table in Supabase (run payments.sql first).
//
// Tip: "await" means "wait here until the database answers".

var payments = [];     // the payments of the date we are viewing


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


// ===== Saving and loading (Supabase table: payments) =====

// Gets the payments of ONE date
async function getPayments(date) {
  var result = await db.from("payments").select("*").eq("paid_date", date);
  if (result.error) {
    console.error(result.error.message);
    return [];
  }
  return result.data;
}

// Adds a new payment. Returns an error message, or null when it worked.
async function savePaymentToDatabase(payment) {
  var result = await db.from("payments").insert(payment);
  if (result.error) { return result.error.message; }
  return null;
}


// ===== Load and draw the page =====

async function loadPayments() {
  var date = byId("payDate").value;
  payments = await getPayments(date);
  byId("dateNote").textContent = "Showing payments received on " + date + " (Asia/Manila).";
  draw();
}

function draw() {
  var total = 0;       // all money collected
  var cash = 0;        // only the cash
  var jobs = [];       // the different job orders that were paid
  var html = "";

  // go through every payment one by one
  for (var i = 0; i < payments.length; i++) {
    var p = payments[i];
    var amount = Number(p.amount);

    total = total + amount;
    if (p.method == "Cash") { cash = cash + amount; }
    if (jobs.indexOf(p.job_order_no) == -1) { jobs.push(p.job_order_no); }

    // one table row for this payment
    html += "<tr>" +
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
    html = "<tr><td colspan='7' class='pay-empty'>No payments for the selected date.</td></tr>";
  }

  byId("payBody").innerHTML = html;
  byId("sTotal").textContent = money(total);
  byId("sCount").textContent = payments.length;
  byId("sCash").textContent = money(cash);
  byId("sJobs").textContent = jobs.length;
  byId("recCount").textContent = payments.length + " payment(s)";
}


// ===== Date buttons =====

byId("viewBtn").onclick = function () {
  loadPayments();
};

byId("payDate").onchange = function () {
  loadPayments();
};

byId("todayBtn").onclick = function () {
  byId("payDate").value = todayPH();
  loadPayments();
};


// ===== Record payment popup =====

byId("addPay").onclick = function () {
  // clear all the boxes
  byId("pJob").value = "";
  byId("pCustomer").value = "";
  byId("pAmount").value = 0;
  byId("pMethod").value = "Cash";
  byId("pDate").value = byId("payDate").value;
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
  loadPayments();
};


// ===== Start =====
byId("payDate").value = todayPH();
loadPayments();
autoRefresh(loadPayments);