// ===== ui.js =====
// Small interface touches shared by the app pages.
// (The only login-related code is the "CONNECT TO YOUR LOGIN" block near the bottom.)
//   0) the nav link of the page you are on is highlighted automatically
//   1) the big stat numbers count up when new values arrive
//   2) click the picture in the nav to edit the display name, change the password or log out
(function () {

  // ----- 0) Highlight the nav link that matches this page -----
  // Works even if a page forgets to put class="active" on its link.
  (function () {
    var links = document.querySelectorAll(".menu-link");
    function clean(p) { return p.replace(/\/+$/, "").toLowerCase(); }
    var here = clean(location.pathname), match = null;
    for (var i = 0; i < links.length; i++) {
      var path = clean(new URL(links[i].getAttribute("href"), location.href).pathname);
      if (path === here) { match = links[i]; }
    }
    if (!match) { return; }                       // e.g. opened as a local file: keep the manual class
    for (var j = 0; j < links.length; j++) {
      var on = links[j] === match;
      links[j].classList.toggle("active", on);
      if (on) { links[j].setAttribute("aria-current", "page"); }
      else { links[j].removeAttribute("aria-current"); }
    }
  })();


  // ----- 1) Count-up for .big-number ----------------------------------
  // Dashboard.js writes the numbers; this just animates the change.
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // "₱12,500" -> { prefix: "₱", num: 12500, dec: 0, suffix: "" }
  function parseValue(text) {
    var m = /^(\D*?)(-?\d[\d,]*(?:\.\d+)?)(\D*)$/.exec(String(text).trim());
    if (!m) { return null; }
    var dec = m[2].indexOf(".") >= 0 ? m[2].split(".")[1].length : 0;
    return { prefix: m[1], suffix: m[3], num: parseFloat(m[2].replace(/,/g, "")), dec: dec };
  }

  function format(p, v) {
    return p.prefix + v.toLocaleString(undefined, { minimumFractionDigits: p.dec, maximumFractionDigits: p.dec }) + p.suffix;
  }

  function show(el, p, v) {
    el._written = format(p, v);   // remember our own write so we ignore it
    el.textContent = el._written;
  }

  function animate(el, p, from) {
    cancelAnimationFrame(el._raf);
    var to = p.num, start = null, duration = 700;
    show(el, p, from);            // start from the old number right away (no flash)

    function step(ts) {
      if (start === null) { start = ts; }
      var t = Math.min((ts - start) / duration, 1);
      var v = from + (to - from) * (1 - Math.pow(1 - t, 3));
      if (p.dec === 0) { v = Math.round(v); }
      el._shown = v;
      show(el, p, v);
      if (t < 1) { el._raf = requestAnimationFrame(step); }
    }
    el._raf = requestAnimationFrame(step);
  }

  function watch(el) {
    var first = parseValue(el.textContent);
    el._shown = first ? first.num : 0;
    el._target = el._shown;
    el._written = null;

    new MutationObserver(function () {
      var text = el.textContent;
      if (text === el._written) { return; }       // our own animation frame
      var p = parseValue(text);
      if (!p) { return; }                          // not a number, leave it
      if (p.num === el._target) { return; }        // same value again (auto refresh)
      var from = el._shown;
      el._target = p.num;
      if (reduce || p.num === from) { el._shown = p.num; return; }
      animate(el, p, from);
    }).observe(el, { childList: true, characterData: true, subtree: true });
  }

  var numbers = document.querySelectorAll(".big-number");
  for (var i = 0; i < numbers.length; i++) { watch(numbers[i]); }

})();


// ===== 2) Account menu: click the picture in the navigation ============
(function () {

  var box = document.querySelector(".welcome-box");
  var bar = document.querySelector(".sidebar");
  if (!box || !bar) { return; }

  var LOGIN_PAGE = "/Login.html";     // where "Log out" sends you
  var NAME_KEY = "display-name";            // where the display name is remembered (this browser)


  // ---------- CONNECT TO YOUR LOGIN ----------------------------------
  // Log out: forgets the login this browser remembers, then opens the login page.
  function accountLogout() {
    try { if (window.db && window.db.auth) { window.db.auth.signOut(); } } catch (e) { /* not used */ }
    try {
      sessionStorage.clear();
      var remove = [];
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key != NAME_KEY && key.indexOf("paper-form:") != 0) { remove.push(key); }
      }
      for (var j = 0; j < remove.length; j++) { localStorage.removeItem(remove[j]); }
    } catch (e) { /* storage is off, that is ok */ }
    window.location.href = LOGIN_PAGE;
  }

  // Change password: return an error message, or null when it worked.
  // This is the one place to connect to however your Login.js checks passwords.
  async function accountChangePassword(currentPassword, newPassword) {
    return "Changing the password is not connected to your login yet.";
  }
  // -------------------------------------------------------------------


  // ---------- checks (plain functions) ----------
  function checkName(text) {
    text = String(text || "").trim();
    if (text == "") { return "Please type a display name."; }
    if (text.length > 30) { return "Keep it under 30 letters."; }
    return "";
  }

  function checkPassword(current, next, again) {
    if (current == "" || next == "" || again == "") { return "Please fill in all three boxes."; }
    if (next.length < 6) { return "The new password needs at least 6 characters."; }
    if (next != again) { return "The new passwords do not match."; }
    if (next == current) { return "The new password must be different from the current one."; }
    return "";
  }


  // ---------- display name ----------
  var defaultName = "";
  var nameEls = document.querySelectorAll(".welcome-box .bold-text");
  if (nameEls.length) { defaultName = nameEls[0].textContent; }

  function getName() {
    try { return localStorage.getItem(NAME_KEY) || defaultName; } catch (e) { return defaultName; }
  }

  function showName() {
    var name = getName();
    for (var i = 0; i < nameEls.length; i++) { nameEls[i].textContent = name; }
    var inMenu = menu.querySelector(".acct-name");
    if (inMenu) { inMenu.textContent = name; }
  }


  // ---------- build the menu ----------
  var menu = document.createElement("div");
  menu.className = "acct-menu";
  menu.id = "acct-menu";
  menu.hidden = true;
  menu.setAttribute("role", "menu");
  menu.innerHTML =
    "<div class='acct-head'><span class='acct-pic'></span><div><div class='acct-name'></div><div class='acct-sub'>Signed in</div></div></div>" +

    "<div class='acct-view' data-view='main'>" +
      "<button type='button' class='acct-item' data-go='name'>Edit display name</button>" +
      "<button type='button' class='acct-item' data-go='pass'>Change password</button>" +
      "<button type='button' class='acct-item danger' data-act='logout'>Log out</button>" +
    "</div>" +

    "<div class='acct-view' data-view='name' hidden>" +
      "<label class='acct-label' for='acct-name-input'>Display name</label>" +
      "<input type='text' id='acct-name-input' class='acct-input' maxlength='30' autocomplete='off'>" +
      "<p class='acct-msg' role='alert'></p>" +
      "<div class='acct-btns'><button type='button' class='acct-btn' data-go='main'>Back</button><button type='button' class='acct-btn primary' data-act='savename'>Save</button></div>" +
    "</div>" +

    "<div class='acct-view' data-view='pass' hidden>" +
      "<label class='acct-label' for='acct-cur'>Current password</label>" +
      "<input type='password' id='acct-cur' class='acct-input' autocomplete='current-password'>" +
      "<label class='acct-label' for='acct-new'>New password</label>" +
      "<input type='password' id='acct-new' class='acct-input' autocomplete='new-password'>" +
      "<label class='acct-label' for='acct-again'>Confirm new password</label>" +
      "<input type='password' id='acct-again' class='acct-input' autocomplete='new-password'>" +
      "<p class='acct-msg' role='alert'></p>" +
      "<div class='acct-btns'><button type='button' class='acct-btn' data-go='main'>Back</button><button type='button' class='acct-btn primary' data-act='savepass'>Save password</button></div>" +
    "</div>";
  bar.appendChild(menu);
  showName();


  // ---------- open / close / switch screens ----------
  function show(view) {
    var views = menu.querySelectorAll(".acct-view");
    for (var i = 0; i < views.length; i++) { views[i].hidden = (views[i].dataset.view != view); }
    var msgs = menu.querySelectorAll(".acct-msg");
    for (var m = 0; m < msgs.length; m++) { msgs[m].textContent = ""; msgs[m].classList.remove("ok"); }

    var first = null;
    if (view == "name") { first = document.getElementById("acct-name-input"); first.value = getName(); }
    if (view == "pass") { first = document.getElementById("acct-cur"); }
    if (first) { first.focus(); if (first.select && view == "name") { first.select(); } }
  }

  function openMenu() {
    show("main");
    menu.hidden = false;
    box.setAttribute("aria-expanded", "true");
  }

  function closeMenu() {
    menu.hidden = true;
    box.setAttribute("aria-expanded", "false");
    var fields = menu.querySelectorAll("input[type=password]");
    for (var i = 0; i < fields.length; i++) { fields[i].value = ""; }
  }

  function say(view, text, good) {
    var msg = menu.querySelector("[data-view='" + view + "'] .acct-msg");
    msg.textContent = text;
    msg.classList.toggle("ok", !!good);
  }

  box.setAttribute("role", "button");
  box.setAttribute("tabindex", "0");
  box.setAttribute("aria-haspopup", "menu");
  box.setAttribute("aria-expanded", "false");
  box.setAttribute("title", "Account");

  function toggle() { if (menu.hidden) { openMenu(); } else { closeMenu(); } }
  box.addEventListener("click", toggle);
  box.addEventListener("keydown", function (e) {
    if (e.key == "Enter" || e.key == " ") { e.preventDefault(); toggle(); }
  });

  document.addEventListener("click", function (e) {
    if (!menu.hidden && !menu.contains(e.target) && !box.contains(e.target)) { closeMenu(); }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key == "Escape" && !menu.hidden) { closeMenu(); box.focus(); }
  });

  menu.addEventListener("keydown", function (e) {
    if (e.key != "Enter" || e.target.tagName != "INPUT") { return; }
    var view = e.target.closest(".acct-view").dataset.view;
    menu.querySelector("[data-view='" + view + "'] .primary").click();
  });


  // ---------- buttons inside the menu ----------
  menu.addEventListener("click", async function (e) {
    var btn = e.target.closest("button");
    if (!btn) { return; }

    if (btn.dataset.go) { show(btn.dataset.go); return; }

    if (btn.dataset.act == "logout") { accountLogout(); return; }

    if (btn.dataset.act == "savename") {
      var input = document.getElementById("acct-name-input");
      var problem = checkName(input.value);
      if (problem) { say("name", problem, false); return; }
      try { localStorage.setItem(NAME_KEY, input.value.trim()); } catch (err) { /* ok */ }
      showName();
      say("name", "Saved.", true);
      return;
    }

    if (btn.dataset.act == "savepass") {
      var cur = document.getElementById("acct-cur").value;
      var next = document.getElementById("acct-new").value;
      var again = document.getElementById("acct-again").value;
      var bad = checkPassword(cur, next, again);
      if (bad) { say("pass", bad, false); return; }

      btn.disabled = true;
      var error = null;
      try { error = await accountChangePassword(cur, next); }
      catch (err) { error = (err && err.message) ? err.message : "Something went wrong."; }
      btn.disabled = false;

      if (error) { say("pass", error, false); return; }
      say("pass", "Password updated.", true);
      setTimeout(closeMenu, 1200);
    }
  });

})();