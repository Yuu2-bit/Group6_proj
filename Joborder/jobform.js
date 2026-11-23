var SHOP = {
  name: "RYZENTECH IT SOLUTIONS",
  address: "Dr. T.M Alday St., Poblacion 4, San Jose, Batangas",
  phone: "0946-0816-700 / (043) 756-0236",
  logo: "/main/Logo.png"
};

var PAPER_W = 794;   // paper width in pixels (A4)

var TERMS = "I authorize Ryzentech IT Solutions to repair my device and understand that the company is not liable for data loss or consequential damages. Units must be claimed within 15 days, otherwise a ₱20/day storage fee applies; unclaimed units after 90 days may be disposed of. Services and installed parts are non-refundable. Warranty applies only to parts installed by Ryzentech and is void in cases of physical or water damage. LCD replacements have a 5-day replacement warranty and a 10-day service warranty. An official receipt is required for warranty claims and device release. No Receipt, No Release. Additional charges may apply for out-of-warranty repairs. By signing, I agree to these terms and conditions.";


// ----- The check lists on the paper ("@" = has a line to write on) -----
var SPECIFIC_LEFT = ["Screen/LCD okay", "Dead Pixels/Lines Display", "Touch Responsive", "Power Button Working", "Volume-Up Working", "Volume-Down Working", "Silent switch/ Home button", "Face ID/Fingerprint", "Front Cam/WEB Cam", "Back Camera", "Flash Working", "Bluetooth Working", "WiFi Working", "SIM Tray", "SIM/RAM/SSD Detected"];
var SPECIFIC_RIGHT = ["Signal Detected", "Battery Detected", "Sensor Working", "Earpiece Working", "Loudspeaker Working", "Microphone Working", "Vibration Working", "Hinges", "Keyboard Working", "Touchpad Working", "Fan Working", "USB Port Working", "HDMI Port Working", "LAN Port Working"];

var INCOMING = [
  { title: "Physical Condition Check",
    left: ["Dents", "Cracks", "Chip Corners", "@Missing parts -"],
    right: ["Previously opened", "Dusty unit", "Clean unit", "Discoloration"] },
  { title: "Power and Basic Function Check",
    left: ["Powers on normally", "No Power", "Intermittent Power", "Stuck on logo", "No display"],
    right: ["Backlight", "Charging Properly", "Battery Bloated", "Charging Port Loose", "Auto Restart"] },
  { title: "Specific Checks", left: SPECIFIC_LEFT, right: SPECIFIC_RIGHT }
];

var OUTGOING = [
  { title: "Service Verification",
    left: ["Issue Repaired", "Issues found", "Cosmetic Rechecked"],
    right: ["Unit Tested", "Unit Cleaned", "Unit Ready For Released"] },
  { title: "Power And Basic Function Check",
    left: ["Powers on Normally", "Boots Normally", "Charging Properly"],
    right: ["No Overheating", "No Abnormal Restart"] },
  { title: "Outgoing Checks",
    left: ["Screen/LCD Okay", "No Screen Flicker/Lines", "Touch Responsive", "Power Button Working", "Volume-Up Working", "Volume-Down Working", "Silent switch/Home button", "Face ID/Fingerprint", "Front Cam/WEB Cam", "Back Camera", "Flash Working", "Bluetooth Working", "WiFi Working", "SIM Tray", "SIM/RAM/SSD Detected"],
    right: ["Signal Detected", "Battery Detected", "Sensor Working", "Earpiece Working", "Loudspeaker Working", "Microphone Working", "Vibration Working", "Hinges", "Keyboard Working", "Touchpad Working", "Fan Working", "USB Port Tested", "HDMI Port Tested", "LAN Port Tested"] }
];


// ===== Small helpers =====

function pById(id) { return document.getElementById(id); }

function ppEsc(text) {
  if (text == null) { text = ""; }
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function todayText() {
  return new Date().toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

function joinText(a, b) {
  if (a && b) { return a + " – " + b; }
  return a || b || "";
}


// ===== The check lists inside the popups (real tick boxes you answer) =====

function formChecklist(prefix, sections) {
  function column(side, list, s) {
    var html = "";
    for (var i = 0; i < list.length; i++) {
      var key = prefix + s + side + i;
      var label = list[i], blank = (label.charAt(0) == "@");
      if (blank) { label = label.slice(1); }
      html += "<label class='fck'><input type='checkbox' data-ck='" + key + "'><span>" + ppEsc(label) + "</span>" +
        (blank ? "<input type='text' class='input fck-text' data-ct='" + key + "_text' placeholder='which parts?'>" : "") + "</label>";
    }
    return html;
  }

  var out = "";
  for (var s = 0; s < sections.length; s++) {
    out += "<div class='fck-sec'>" + ppEsc(sections[s].title) + "</div>" +
      "<div class='fck-cols'><div>" + column("L", sections[s].left, s) + "</div><div>" + column("R", sections[s].right, s) + "</div></div>";
  }
  return out;
}

// reads every tick and text box inside one popup area
function readChecks(boxId, ticks, texts) {
  var box = pById(boxId);
  if (!box) { return; }
  var cks = box.querySelectorAll("input[data-ck]");
  for (var i = 0; i < cks.length; i++) { ticks[cks[i].dataset.ck] = cks[i].checked; }
  var cts = box.querySelectorAll("input[data-ct]");
  for (var j = 0; j < cts.length; j++) { texts[cts[j].dataset.ct] = cts[j].value.trim(); }
}

// puts saved answers back into one popup area
function writeChecks(boxId, ticks, texts) {
  var box = pById(boxId);
  if (!box) { return; }
  var cks = box.querySelectorAll("input[data-ck]");
  for (var i = 0; i < cks.length; i++) { cks[i].checked = !!(ticks && ticks[cks[i].dataset.ck]); }
  var cts = box.querySelectorAll("input[data-ct]");
  for (var j = 0; j < cts.length; j++) { cts[j].value = (texts && texts[cts[j].dataset.ct]) || ""; }
}

function buildChecklists() {
  if (pById("new-incoming")) { pById("new-incoming").innerHTML = formChecklist("in", INCOMING); }
  if (pById("view-outgoing")) { pById("view-outgoing").innerHTML = formChecklist("out", OUTGOING); }
}


// ===== Remembering the extra paper answers (per job order, in this browser) =====

function loadExtras(id) {
  try { return JSON.parse(localStorage.getItem("paper-form:" + id)) || {}; }
  catch (error) { return {}; }
}

function saveExtras(id, extras) {
  try { localStorage.setItem("paper-form:" + id, JSON.stringify(extras)); }
  catch (error) { /* storage is off, that is ok */ }
}


// ===== Building the paper (read-only) =====

// a printed line with the answer on it
function ppField(value, extraClass) {
  return "<span class='pp-line " + (extraClass || "") + "'>" + ppEsc(value) + "</span>";
}

// a tick box: filled when the answer was ticked
function ppCheck(d, key, label, round) {
  var blank = (label.charAt(0) == "@");
  if (blank) { label = label.slice(1); }
  var on = (d.ticks && d.ticks[key]) ? " on" : "";
  return "<div class='pp-ck" + (round ? " round" : "") + on + "'><i></i><span>" + ppEsc(label) + "</span>" +
    (blank ? ppField(d.texts && d.texts[key + "_text"], "grow") : "") + "</div>";
}

function ppSections(d, prefix, sections) {
  var html = "";
  for (var s = 0; s < sections.length; s++) {
    var sec = sections[s];
    var left = "", right = "";
    for (var a = 0; a < sec.left.length; a++) { left += ppCheck(d, prefix + s + "L" + a, sec.left[a], false); }
    for (var b = 0; b < sec.right.length; b++) { right += ppCheck(d, prefix + s + "R" + b, sec.right[b], false); }
    html += "<div class='pp-sec'>" + ppEsc(sec.title) + "</div>" +
            "<div class='pp-items'><div>" + left + "</div><div>" + right + "</div></div>";
  }
  return html;
}

// d = { no, name, address, contact, date, receivedby, model, serial, remarks, job, repair, ticks, texts }
function paperHtml(d) {
  return "<div class='paper' id='paper-sheet'>" +
    "<div class='pp-no'>No. " + ppEsc(d.no || "______") + "</div>" +

    "<div class='pp-head'><img src='" + SHOP.logo + "' alt=''>" +
      "<div><div class='pp-shop'>" + ppEsc(SHOP.name) + "</div>" +
      "<div class='pp-sub'>" + ppEsc(SHOP.address) + "</div>" +
      "<div class='pp-sub'>" + ppEsc(SHOP.phone) + "</div></div></div>" +

    "<div class='pp-bar'>JOB ORDER FORM</div>" +
    "<div class='pp-box'>" +
      "<div class='pp-col'>" +
        "<div class='pp-row'><span>NAME:</span>" + ppField(d.name) + "</div>" +
        "<div class='pp-row'><span>ADDRESS:</span>" + ppField(d.address) + "</div>" +
        "<div class='pp-row'><span>CONTACT NUMBER:</span>" + ppField(d.contact) + "</div>" +
      "</div>" +
      "<div class='pp-col'>" +
        "<div class='pp-row'><span>DATE:</span>" + ppField(d.date) + "</div>" +
        "<div class='pp-row'><span>RECEIVED BY:</span>" + ppField(d.receivedby) + "</div>" +
      "</div>" +
    "</div>" +

    "<div class='pp-bar'>UNIT INFORMATION</div>" +
    "<div class='pp-box'>" +
      "<div class='pp-col'>" +
        "<div class='pp-row'><span>MODEL NUMBER:</span>" + ppField(d.model) + "</div>" +
        "<div class='pp-row'><span>SERIAL NUMBER/IMEI NO.:</span>" + ppField(d.serial) + "</div>" +
      "</div>" +
      "<div class='pp-col'>" +
        "<div class='pp-acc'>" + ppCheck(d, "acc_charger", "CHARGER", true) + ppCheck(d, "acc_bag", "BAG", true) + ppCheck(d, "acc_other", "OTHER ACCS", true) + "</div>" +
        "<div class='pp-row'><span>REMARKS:</span>" + ppField(d.remarks) + "</div>" +
      "</div>" +
    "</div>" +

    "<div class='pp-wide'><div class='pp-lab'>JOB DESCRIPTION</div><div class='pp-val'>" + ppEsc(d.job) + "</div></div>" +
    "<div class='pp-wide'><div class='pp-lab'>REPAIR REMARKS</div><div class='pp-val'>" + ppEsc(d.repair) + "</div></div>" +

    "<div class='pp-qc'>" +
      "<div class='pp-qcol'><div class='pp-qtitle'>INCOMING QUALITY CHECK</div>" + ppSections(d, "in", INCOMING) + "</div>" +
      "<div class='pp-qcol'><div class='pp-qtitle'>OUTGOING QUALITY CHECK</div>" + ppSections(d, "out", OUTGOING) + "</div>" +
    "</div>" +

    "<div class='pp-auth'><h4>REPAIR AUTHORIZATION</h4><p>" + ppEsc(TERMS) + "</p></div>" +
    "<div class='pp-sign'><div class='pp-signname'>" + ppEsc(d.name) + "</div>CUSTOMER SIGNATURE OVER PRINTED NAME</div>" +
  "</div>";
}


// ===== The preview window (view only, download as PDF) =====

function ensurePaperOverlay() {
  if (pById("paper-overlay")) { return; }

  var box = document.createElement("div");
  box.className = "paper-overlay";
  box.id = "paper-overlay";
  box.innerHTML =
    "<div class='paper-bar'>" +
      "<h2>Job Order Form</h2>" +
      "<span class='small-text' id='paper-msg'></span>" +
      "<button class='btn btn-dark' id='paper-pdf'>Download PDF</button>" +
      "<button class='btn' id='paper-close'>Close</button>" +
    "</div>" +
    "<div class='paper-scroll' id='paper-scroll'><div class='paper-fit' id='paper-fit'><div class='paper-scale' id='paper-host'></div></div></div>";
  document.body.appendChild(box);

  pById("paper-close").onclick = closePaper;
  pById("paper-pdf").onclick = downloadPaperPdf;
  document.addEventListener("keydown", function (e) {
    if (e.key == "Escape" && box.classList.contains("show")) { closePaper(); }
  });
  window.addEventListener("resize", fitPaper);
}

// makes the paper fit small screens
function fitPaper() {
  var host = pById("paper-host"), fit = pById("paper-fit"), scroll = pById("paper-scroll");
  if (!host || !fit || !scroll) { return; }
  var s = Math.min(1, (scroll.clientWidth - 24) / PAPER_W);
  host.style.transform = "scale(" + s + ")";
  fit.style.width = (PAPER_W * s) + "px";
  fit.style.height = (host.offsetHeight * s) + "px";
}

function openPaper(data) {
  ensurePaperOverlay();
  var host = pById("paper-host");
  host.innerHTML = paperHtml(data);
  host.dataset.no = data.no || "";
  pById("paper-msg").textContent = "";
  pById("paper-overlay").classList.add("show");
  fitPaper();
}

function closePaper() {
  pById("paper-overlay").classList.remove("show");
}


// ===== New Job Order popup =====

// the paper answers typed in the New Job Order popup
function collectNewPaper() {
  var ticks = {}, texts = {};
  readChecks("new-incoming", ticks, texts);
  ticks.acc_charger = pById("acc-charger").checked;
  ticks.acc_bag = pById("acc-bag").checked;
  ticks.acc_other = pById("acc-other").checked;
  return {
    address: pById("new-address").value.trim(),
    contact: pById("new-contact").value.trim(),
    receivedby: pById("new-receivedby").value.trim(),
    remarks: pById("new-remarks").value.trim(),
    date: pById("new-date").value,
    ticks: ticks,
    texts: texts
  };
}

// called when the popup opens: start clean, date = today
function prepareNewPaper() {
  clearNewPaper();
}

function clearNewPaper() {
  var ids = ["new-address", "new-receivedby", "new-remarks"];
  for (var i = 0; i < ids.length; i++) { pById(ids[i]).value = ""; }
  pById("new-date").value = todayText();
  pById("acc-charger").checked = false;
  pById("acc-bag").checked = false;
  pById("acc-other").checked = false;
  writeChecks("new-incoming", {}, {});
}

// "Preview paper form" button (before saving)
function openPaperFromNew() {
  var a = collectNewPaper();
  var val = function (id) { return pById(id).value.trim(); };
  openPaper({
    no: "",
    name: val("new-customer"),
    address: a.address,
    contact: a.contact,
    date: a.date,
    receivedby: a.receivedby,
    model: val("new-device"),
    serial: val("new-serial"),
    remarks: a.remarks,
    job: joinText(pById("new-service").value, val("new-issue")),
    repair: "",
    ticks: a.ticks,
    texts: a.texts
  });
}

// the paper data of a saved job order (+ the extra answers kept for it)
function jobToPaperData(j, extras) {
  extras = extras || {};
  return {
    no: jobCode(j),
    name: j.customer_name || "",
    address: extras.address || j.address || "",
    contact: extras.contact || j.contact || j.contact_number || j.phone || "",
    date: formatDate(j.date_received),
    receivedby: extras.receivedby || "",
    model: j.device || "",
    serial: j.serial || "",
    remarks: extras.remarks || "",
    job: joinText(j.service, j.issue),
    repair: extras.repair || "",
    ticks: extras.ticks || {},
    texts: extras.texts || {}
  };
}

// fills a blank contact number / address from the customer's record
async function addCustomerDetails(data, j) {
  if (data.contact && data.address) { return; }
  try {
    var customers = await getCustomers();
    for (var i = 0; i < customers.length; i++) {
      if (customers[i].id == j.customer_id) {
        if (!data.contact) { data.contact = customers[i].contact || ""; }
        if (!data.address) { data.address = customers[i].address || ""; }
      }
    }
  } catch (error) { /* leave them blank */ }
}

// called by saveJobOrder() after the job order was saved:
// keeps the paper answers for the new job order and shows the paper
async function finishNewPaper(info, answers) {
  var found = null;
  var name = (info.customerName || "").toLowerCase(), device = (info.device || "").toLowerCase();
  for (var i = 0; i < allJobs.length; i++) {
    var j = allJobs[i];
    if ((j.customer_name || "").toLowerCase() == name && (j.device || "").toLowerCase() == device) {
      if (found == null || j.id > found.id) { found = j; }      // the newest one
    }
  }

  if (found) {
    saveExtras(found.id, answers);
    var data = jobToPaperData(found, answers);
    await addCustomerDetails(data, found);
    openPaper(data);
  } else {
    openPaper({
      no: "", name: info.customerName, address: answers.address, contact: answers.contact,
      date: answers.date, receivedby: answers.receivedby, model: info.device, serial: info.serial,
      remarks: answers.remarks, job: joinText(info.service, info.issue), repair: "",
      ticks: answers.ticks, texts: answers.texts
    });
  }
  clearNewPaper();
}


// ===== View popup =====

function findViewedJob() {
  for (var i = 0; i < allJobs.length; i++) {
    if (allJobs[i].id == viewingId) { return allJobs[i]; }
  }
  return null;
}

// called by openView(): show the saved repair remarks and outgoing checks
function fillViewPaper(j) {
  var extras = loadExtras(j.id);
  pById("view-repair").value = extras.repair || "";
  writeChecks("view-outgoing", extras.ticks, extras.texts);
}

// keeps what was answered in the View popup (also called by saveStatus())
function saveViewPaper() {
  var j = findViewedJob();
  if (j == null) { return; }

  var extras = loadExtras(j.id);
  extras.ticks = extras.ticks || {};
  extras.texts = extras.texts || {};
  readChecks("view-outgoing", extras.ticks, extras.texts);   // only touches the outgoing boxes
  extras.repair = pById("view-repair").value.trim();
  saveExtras(j.id, extras);
}

// "Paper form" button in the View popup
async function openPaperFromView() {
  var j = findViewedJob();
  if (j == null) { return; }
  saveViewPaper();
  var data = jobToPaperData(j, loadExtras(j.id));
  await addCustomerDetails(data, j);
  openPaper(data);
}


// ===== Download as PDF =====

function loadPdfTool(done) {
  if (window.html2pdf) { done(true); return; }
  var tag = document.createElement("script");
  tag.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
  tag.onload = function () { done(true); };
  tag.onerror = function () { done(false); };
  document.head.appendChild(tag);
}

function downloadPaperPdf() {
  var msg = pById("paper-msg");
  var no = pById("paper-host").dataset.no || "new";
  msg.textContent = "Making the PDF...";

  loadPdfTool(function (ok) {
    if (!ok || !window.html2pdf) {
      msg.textContent = "Could not load the PDF tool. Check your internet and try again.";
      return;
    }
    html2pdf().set({
      margin: 0,
      filename: "job-order-" + no + ".pdf",
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
    }).from(pById("paper-sheet")).save().then(function () {
      msg.textContent = "Downloaded.";
    }).catch(function () {
      msg.textContent = "The PDF failed. Please try again.";
    });
  });
}


// ===== Start =====
buildChecklists();
if (pById("new-date")) { pById("new-date").value = todayText(); }