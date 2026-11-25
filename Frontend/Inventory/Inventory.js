// ===== Inventory.js =====
// Needs /main/data.js (for the database connection).
// Saves to the "inventory_items" table in Supabase.
// Stock in / stock out are also written to "inventory_transactions"
// (create it once with inventory_upgrade.sql).
//
// Tip: "await" means "wait here until the database answers".

var items = [];            // all the inventory items
var stockFilter = "all";   // "all", "in", "low" or "out"
var limit = 60;            // how many rows to show
var editingId = null;      // null means we are adding a NEW item
var moveType = "in";       // "in" or "out" (for the stock popup)
var loadError = "";        // filled when the database could not be read
var upgradeNeeded = false; // true when selling_price / history are not in the database yet
var firstRender = true;    // true until the table has shown rows once (used for the row animation)


// ----- Lists you can change -----
var STAFF_LIST = ["AJ Marasigan", "Alex Aguila", "Ashley Alcantara", "Khitz Marasigan", "Paulo Inocencio", "Shiela Mae Marasigan"];
var IN_TYPES = ["Purchase / Restock", "Customer Return", "Other Stock In"];
var OUT_TYPES = ["Repair / Parts Installation", "Accessories / Direct Sale", "Other Stock Out"];


// ===== Small helper functions =====

function byId(id) {
  return document.getElementById(id);
}

// Stops strange characters from breaking the HTML
function escapeText(text) {
  if (text == null) { text = ""; }
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Text for a table cell: a dash when empty
function cell(text) {
  if (text == null || text === "") { return "<span class='dash'>—</span>"; }
  return escapeText(text);
}

// Shows a number as money, example: ₱1,500.00
function money(number) {
  return "₱" + Number(number || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// 0 in stock = "out", at or below the reorder level = "low", otherwise "in"
function stockStatus(item) {
  if (item.stock <= 0) { return "out"; }
  if (item.stock <= item.reorder) { return "low"; }
  return "in";
}

function statusLabel(status) {
  if (status == "in") { return "In stock"; }
  if (status == "low") { return "Low stock"; }
  return "Out of stock";
}

function findItem(id) {
  for (var i = 0; i < items.length; i++) {
    if (items[i].id == id) { return items[i]; }
  }
  return null;
}

// A list of the different values in one column (example: all the categories)
function uniqueValues(fieldName) {
  var result = [];
  for (var i = 0; i < items.length; i++) {
    var value = items[i][fieldName];
    if (value && result.indexOf(value) == -1) { result.push(value); }
  }
  result.sort();
  return result;
}

// The name saved as "Processed by" (the display name from the account menu)
function currentUserName() {
  try { return localStorage.getItem("display-name") || "Admin"; }
  catch (error) { return "Admin"; }
}

// A small message at the bottom of the page
function toast(message) {
  var box = byId("toast");
  if (!box) {
    box = document.createElement("div");
    box.id = "toast";
    box.className = "toast";
    document.body.appendChild(box);
  }
  box.textContent = message;
  box.classList.add("show");
  clearTimeout(box._timer);
  box._timer = setTimeout(function () { box.classList.remove("show"); }, 4000);
}


// ===== Saving and loading (Supabase table: inventory_items) =====

async function getItems() {
  var result = await db.from("inventory_items").select("*").limit(5000);
  if (result.error) {
    console.error(result.error.message);
    loadError = result.error.message;
    return [];
  }
  loadError = "";
  result.data.sort(function (a, b) { return a.sku.localeCompare(b.sku); });

  // the selling_price column is new: tell the user if the database does not have it yet
  upgradeNeeded = (result.data.length > 0 && !("selling_price" in result.data[0]));
  return result.data;
}

// Adds a new item, or updates it when item.id exists.
// Returns an error message, or null when it worked.
async function saveItemToDatabase(item) {
  var fields = {
    sku: item.sku,
    category: item.category,
    brand: item.brand,
    description: item.description,
    supplier: item.supplier,
    reorder: item.reorder,
    unit_cost: item.unit_cost,
    selling_price: item.selling_price,
    active: item.active
  };
  if (!item.id) { fields.stock = 0; }               // stock only changes with Stock in / Stock out

  var result = await writeItem(item.id, fields);

  // the database has no selling_price column yet: save everything else
  if (result.error && result.error.message.indexOf("selling_price") != -1) {
    delete fields.selling_price;
    upgradeNeeded = true;
    result = await writeItem(item.id, fields);
  }

  if (result.error) { return result.error.message; }
  return null;
}

function writeItem(id, fields) {
  if (id) { return db.from("inventory_items").update(fields).eq("id", id); }
  return db.from("inventory_items").insert(fields);
}

// Adds (+) or removes (-) stock. Returns an error message, or null when it worked.
async function changeStock(id, amount) {
  var item = findItem(id);
  var newStock = item.stock + amount;
  if (newStock < 0) { newStock = 0; }                 // never go below zero

  var result = await db.from("inventory_items").update({ stock: newStock }).eq("id", id);
  if (result.error) { return result.error.message; }
  item.stock = newStock;
  return null;
}

// Writes one line in the stock history. Returns an error message, or null when it worked.
async function logTransaction(record) {
  var result = await db.from("inventory_transactions").insert(record);
  if (result.error) { return result.error.message; }
  return null;
}

// Permanently removes an item.
// Returns an error message, or null when it worked.
async function deleteItemFromDatabase(id) {
  var result = await db.from("inventory_items").delete().eq("id", id);
  if (result.error) { return result.error.message; }
  return null;
}


// ===== Load everything and fill the filters =====
async function loadItems() {
  items = await getItems();
  fillFilter("fCategory", "All Categories", uniqueValues("category"));
  fillFilter("fBrand", "All Brands", uniqueValues("brand"));
  draw();
}

// Fills a drop-down list, and keeps the choice you already made
function fillFilter(id, firstText, values) {
  var select = byId(id);
  var oldChoice = select.value;

  var html = "<option>" + firstText + "</option>";
  var stillThere = (oldChoice == firstText);
  for (var i = 0; i < values.length; i++) {
    html += "<option>" + escapeText(values[i]) + "</option>";
    if (values[i] == oldChoice) { stillThere = true; }
  }

  select.innerHTML = html;
  if (stillThere) { select.value = oldChoice; }
}

// Returns only the items that match the search and the filters
function getFiltered() {
  var searchText = byId("searchInput").value.toLowerCase().trim();
  var category = byId("fCategory").value;
  var brand = byId("fBrand").value;

  var result = [];
  for (var i = 0; i < items.length; i++) {
    var item = items[i];

    if (category != "All Categories" && item.category != category) { continue; }
    if (brand != "All Brands" && item.brand != brand) { continue; }
    if (stockFilter != "all" && stockStatus(item) != stockFilter) { continue; }

    var allText = item.sku + " " + item.category + " " + item.brand + " " + item.description + " " + item.supplier;
    if (allText.toLowerCase().indexOf(searchText) == -1) { continue; }

    result.push(item);
  }
  return result;
}


// ===== Draw the page =====

// Builds the HTML of ONE table row.
// position = the row number, used to stagger the first-load animation.
function makeRow(item, position) {
  var status = stockStatus(item);
  var inactive = (item.active == false);

  var statusHtml = "<span class='pill pill-" + status + "'>" + statusLabel(status) + "</span>";
  if (inactive) { statusHtml += " <span class='pill pill-off'>Inactive</span>"; }

  var toggleText = inactive ? "Activate" : "Deactivate";

  return "<tr" + (inactive ? " class='off'" : "") + " data-id='" + item.id + "' style='--i:" + Math.min(position, 15) + "'>" +
    "<td class='sku'>" + escapeText(item.sku) + "</td>" +
    "<td>" + cell(item.category) + "</td>" +
    "<td>" + cell(item.brand) + "</td>" +
    "<td class='desc'>" + cell(item.description) + "</td>" +
    "<td>" + cell(item.supplier) + "</td>" +
    "<td class='num'><b>" + item.stock + "</b></td>" +
    "<td class='num'>" + item.reorder + "</td>" +
    "<td class='num'>" + money(item.unit_cost) + "</td>" +
    "<td class='num'>" + money(item.selling_price) + "</td>" +
    "<td>" + statusHtml + "</td>" +
    "<td class='acts'>" +
      "<button class='link' data-act='edit'>Edit</button>" +
      "<button class='link gray' data-act='toggle'>" + toggleText + "</button>" +
      "<button class='link red' data-act='delete'>Delete</button>" +
    "</td></tr>";
}

function draw() {
  drawStats();

  var list = getFiltered();
  var shown = list.slice(0, limit);          // only the first 60 (or more after "Show more")

  // Rows only slide in the first time they appear, not while searching or auto-refreshing
  var animateNow = (firstRender && shown.length > 0 && loadError == "");
  byId("itemRows").classList.toggle("animate-rows", animateNow);

  var html = "";
  for (var i = 0; i < shown.length; i++) {
    html += makeRow(shown[i], i);
  }
  if (loadError != "") {
    html = "<tr><td colspan='11' class='empty'>Could not load items: " + escapeText(loadError) + "</td></tr>";
  } else if (html == "") {
    html = "<tr><td colspan='11' class='empty'>No items match your filters.</td></tr>";
  }

  byId("itemRows").innerHTML = html;
  byId("countText").textContent = "Showing " + shown.length + " of " + list.length + " inventory items";
  byId("moreBtn").hidden = (list.length <= limit);
  byId("dbNote").hidden = !upgradeNeeded;

  if (animateNow) { firstRender = false; }
}

// The five boxes at the top (every item is counted)
function drawStats() {
  var active = 0, inCount = 0, lowCount = 0, outCount = 0;

  for (var i = 0; i < items.length; i++) {
    if (items[i].active != false) { active++; }
    var status = stockStatus(items[i]);
    if (status == "in") { inCount++; }
    if (status == "low") { lowCount++; }
    if (status == "out") { outCount++; }
  }

  byId("invTotal").textContent = items.length.toLocaleString();
  byId("invActive").textContent = active.toLocaleString();
  byId("invIn").textContent = inCount.toLocaleString();
  byId("invLow").textContent = lowCount.toLocaleString();
  byId("invOut").textContent = outCount.toLocaleString();

  // highlight the box that matches the stock filter, and keep the drop-down in step
  byId("fStock").value = stockFilter;
  var boxes = document.querySelectorAll(".stat-box[data-stock]");
  for (var b = 0; b < boxes.length; b++) {
    boxes[b].classList.toggle("on", boxes[b].dataset.stock == stockFilter);
  }
}


// ===== Clicks =====

// Click one of the stock boxes (Total / In stock / Low stock / Out of stock)
document.querySelector(".stats-row").onclick = function (event) {
  var box = event.target.closest(".stat-box[data-stock]");
  if (box) {
    stockFilter = box.dataset.stock;
    limit = 60;
    draw();
  }
};

// Keyboard: Enter or Space on a stock box works like a click
document.querySelector(".stats-row").onkeydown = function (event) {
  if (event.key != "Enter" && event.key != " ") { return; }
  var box = event.target.closest(".stat-box[data-stock]");
  if (box) { event.preventDefault(); box.click(); }
};

// Click a button on a table row
byId("itemRows").onclick = async function (event) {
  var button = event.target.closest("button");
  if (button == null || !button.dataset.act) { return; }

  var id = button.closest("tr").dataset.id;
  var item = findItem(id);
  var action = button.dataset.act;

  if (action == "edit") {
    openItem(item);
  }
  if (action == "toggle") {
    item.active = !item.active;                 // switch between active and inactive
    var saveError = await saveItemToDatabase(item);
    if (saveError) { toast("Could not update: " + saveError); }
    loadItems();
  }
  if (action == "delete") {
    var sure = confirm("Delete " + item.sku + " (" + item.description + ")? This cannot be undone.");
    if (!sure) { return; }

    var error = await deleteItemFromDatabase(id);
    if (error) {
      alert("Could not delete: " + error);
      return;
    }
    loadItems();
  }
};

byId("moreBtn").onclick = function () {
  limit = limit + 60;
  draw();
};

// When a filter changes, start from the first 60 again
function filtersChanged() {
  limit = 60;
  draw();
}
byId("fCategory").onchange = filtersChanged;
byId("fBrand").onchange = filtersChanged;
byId("fStock").onchange = function () { stockFilter = byId("fStock").value; filtersChanged(); };
byId("searchInput").oninput = filtersChanged;
byId("searchBtn").onclick = filtersChanged;


// ===== Add / edit item popup =====
function optionList(values) {
  var html = "";
  for (var i = 0; i < values.length; i++) {
    html += "<option value=\"" + escapeText(values[i]) + "\">";
  }
  return html;
}

// item = the item to edit, or null to add a new one
function openItem(item) {
  if (item) { editingId = item.id; }
  else { editingId = null; }

  if (item) {
    byId("itemTitle").textContent = "Edit Inventory Item";
    byId("iSku").value = item.sku;
    byId("iDesc").value = item.description || "";
    byId("iCategory").value = item.category || "";
    byId("iBrand").value = item.brand || "";
    byId("iSupplier").value = item.supplier || "";
    byId("iReorder").value = item.reorder;
    byId("iCost").value = item.unit_cost;
    byId("iPrice").value = item.selling_price || 0;
  } else {
    byId("itemTitle").textContent = "Add Inventory Item";
    byId("iSku").value = "";
    byId("iDesc").value = "";
    byId("iCategory").value = "";
    byId("iBrand").value = "";
    byId("iSupplier").value = "";
    byId("iReorder").value = 0;
    byId("iCost").value = 0;
    byId("iPrice").value = 0;
  }
  byId("itemErr").textContent = "";

  byId("catList").innerHTML = optionList(uniqueValues("category"));
  byId("brandList").innerHTML = optionList(uniqueValues("brand"));
  byId("itemDlg").showModal();
}

byId("addBtn").onclick = function () { openItem(null); };
byId("cancelItem").onclick = function () { byId("itemDlg").close(); };
byId("xItem").onclick = function () { byId("itemDlg").close(); };

byId("saveItem").onclick = async function () {
  // 1. read what was typed
  var item = {
    id: editingId,
    sku: byId("iSku").value.trim().toUpperCase(),
    description: byId("iDesc").value.trim(),
    category: byId("iCategory").value.trim(),
    brand: byId("iBrand").value.trim(),
    supplier: byId("iSupplier").value.trim(),
    reorder: parseInt(byId("iReorder").value) || 0,
    unit_cost: Number(byId("iCost").value) || 0,
    selling_price: Number(byId("iPrice").value) || 0,
    active: true
  };
  if (item.reorder < 0) { item.reorder = 0; }

  // 2. check the important boxes
  if (item.sku == "" || item.description == "") {
    byId("itemErr").textContent = "Please enter the SKU and the description.";
    return;
  }

  // 3. make sure the SKU is not used by another item
  for (var i = 0; i < items.length; i++) {
    if (items[i].sku == item.sku && items[i].id != editingId) {
      byId("itemErr").textContent = "That SKU already exists.";
      return;
    }
  }

  // when editing, keep the item active or inactive like before
  if (editingId) { item.active = findItem(editingId).active; }

  // 4. save it
  var error = await saveItemToDatabase(item);
  if (error) {
    byId("itemErr").textContent = "Could not save: " + error;
    return;
  }
  byId("itemDlg").close();
  toast(editingId ? "Item updated." : "Item added.");
  loadItems();
};


// ===== Stock in / stock out popup =====

// Fills the "Inventory item" list with the active items that match the search box
function fillMoveItems() {
  var wanted = byId("mSearch").value.toLowerCase().trim();
  var select = byId("mItem");
  var oldChoice = select.value;

  var html = "<option value=''>Select SKU / Part / Description</option>";
  var stillThere = false;
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (it.active == false) { continue; }

    var label = it.sku + " — " + (it.category || "") + " — " + (it.brand ? it.brand + " | " : "") + (it.description || "") + " — Stock: " + it.stock;
    if (wanted != "" && label.toLowerCase().indexOf(wanted) == -1) { continue; }

    html += "<option value='" + it.id + "'>" + escapeText(label) + "</option>";
    if (String(it.id) == oldChoice) { stillThere = true; }
  }

  select.innerHTML = html;
  if (stillThere) { select.value = oldChoice; }
  showMoveInfo();
}

// Shows the available stock of the chosen item
function showMoveInfo() {
  var item = findItem(byId("mItem").value);
  if (item) { byId("mAvail").textContent = item.stock + " in stock"; }
  else { byId("mAvail").textContent = "Select a part above"; }
}

function selectOptions(firstText, list) {
  var html = "<option value=''>" + firstText + "</option>";
  for (var i = 0; i < list.length; i++) {
    html += "<option>" + escapeText(list[i]) + "</option>";
  }
  return html;
}

function openMove(type) {
  moveType = type;
  var isIn = (type == "in");

  byId("moveTitle").textContent = isIn ? "Stock In" : "Stock Out";
  byId("moveSub").textContent = isIn
    ? "Choose the inventory item, enter the quantity received, and assign the responsible staff member."
    : "Choose the inventory item, enter the quantity released, and assign the staff who released it.";
  byId("mType").textContent = isIn ? "Manual Stock In" : "Manual Stock Out";
  byId("lblQty").textContent = isIn ? "QUANTITY RECEIVED *" : "QUANTITY RELEASED *";
  byId("lblStaff").textContent = isIn ? "RECEIVED BY *" : "RELEASED BY *";
  byId("saveMove").textContent = isIn ? "Receive Stock" : "Release Stock";
  byId("saveMove").className = isIn ? "btn btn-green" : "btn btn-dark";

  byId("mTrans").innerHTML = selectOptions("Select Transaction Type", isIn ? IN_TYPES : OUT_TYPES);
  byId("mStaff").innerHTML = selectOptions("Select Staff", STAFF_LIST);

  byId("mSearch").value = "";
  byId("mQty").value = "";
  byId("mCost").value = "";
  byId("mRef").value = "";
  byId("mRemarks").value = "";
  byId("mBy").textContent = currentUserName();
  byId("moveErr").textContent = "";

  byId("mItem").value = "";
  fillMoveItems();
  byId("moveDlg").showModal();
}

byId("mSearch").oninput = fillMoveItems;
byId("mItem").onchange = showMoveInfo;

byId("inBtn").onclick = function () { openMove("in"); };
byId("outBtn").onclick = function () { openMove("out"); };
byId("cancelMove").onclick = function () { byId("moveDlg").close(); };
byId("xMove").onclick = function () { byId("moveDlg").close(); };

byId("saveMove").onclick = async function () {
  var item = findItem(byId("mItem").value);
  var quantity = parseInt(byId("mQty").value) || 0;
  var transType = byId("mTrans").value;
  var staff = byId("mStaff").value;
  var costText = byId("mCost").value.trim();

  if (item == null) { byId("moveErr").textContent = "Pick an inventory item from the list."; return; }
  if (quantity < 1) { byId("moveErr").textContent = "Quantity must be at least 1."; return; }
  if (transType == "") { byId("moveErr").textContent = "Select the transaction type."; return; }
  if (staff == "") { byId("moveErr").textContent = (moveType == "in" ? "Select who received the stock." : "Select who released the stock."); return; }
  if (moveType == "out" && quantity > item.stock) {
    byId("moveErr").textContent = "Only " + item.stock + " in stock.";
    return;
  }

  // 1. change the stock
  var amount = (moveType == "in") ? quantity : -quantity;
  var error = await changeStock(item.id, amount);
  if (error) { byId("moveErr").textContent = "Could not save: " + error; return; }

  // 2. write it in the stock history
  var logError = await logTransaction({
    item_id: item.id,
    type: moveType,
    quantity: quantity,
    transaction_type: transType,
    reference_no: byId("mRef").value.trim(),
    remarks: byId("mRemarks").value.trim(),
    staff: staff,
    unit_cost: (costText == "") ? null : Number(costText),
    processed_by: currentUserName()
  });

  byId("moveDlg").close();
  draw();

  var verb = (moveType == "in") ? "Stock received: " : "Stock released: ";
  if (logError) { toast(verb + quantity + " × " + item.sku + ". The history could not be saved (run inventory_upgrade.sql)."); }
  else { toast(verb + quantity + " × " + item.sku + "."); }
};


// ===== Start =====
loadItems();
autoRefresh(loadItems);