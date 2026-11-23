
(function () {

    var links = document.querySelectorAll(".menu-link");

    function clean(path) {
        return path.replace(/\/+$/, "").toLowerCase();
    }

    var here = clean(location.pathname);
    var match = null;

    for (var i = 0; i < links.length; i++) {
        var path = clean(new URL(links[i].getAttribute("href"), location.href).pathname);

        if (path === here) {
            match = links[i];
        }
    }

    if (match) {
        for (var j = 0; j < links.length; j++) {
            var on = links[j] === match;

            links[j].classList.toggle("active", on);

            if (on) {
                links[j].setAttribute("aria-current", "page");
            } else {
                links[j].removeAttribute("aria-current");
            }
        }
    }

})();


(function () {

    var reduce = window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function parseValue(text) {
        var m = /^(\D*?)(-?\d[\d,]*(?:\.\d+)?)(\D*)$/.exec(String(text).trim());

        if (!m) {
            return null;
        }

        var dec = m[2].indexOf(".") >= 0 ?
            m[2].split(".")[1].length : 0;

        return {
            prefix: m[1],
            suffix: m[3],
            num: parseFloat(m[2].replace(/,/g, "")),
            dec: dec
        };
    }

    function format(p, v) {
        return p.prefix + v.toLocaleString(undefined, {
            minimumFractionDigits: p.dec,
            maximumFractionDigits: p.dec
        }) + p.suffix;
    }

    function show(el, p, v) {
        el._written = format(p, v);
        el.textContent = el._written;
    }

    function animate(el, p, from) {
        cancelAnimationFrame(el._raf);

        var to = p.num;
        var start = null;
        var duration = 700;

        show(el, p, from);

        function step(ts) {
            if (start === null) {
                start = ts;
            }

            var t = Math.min((ts - start) / duration, 1);
            var v = from + (to - from) * (1 - Math.pow(1 - t, 3));

            if (p.dec === 0) {
                v = Math.round(v);
            }

            el._shown = v;
            show(el, p, v);

            if (t < 1) {
                el._raf = requestAnimationFrame(step);
            }
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

            if (text === el._written) {
                return;
            }

            var p = parseValue(text);

            if (!p || p.num === el._target) {
                return;
            }

            var from = el._shown;
            el._target = p.num;

            if (reduce || p.num === from) {
                el._shown = p.num;
                return;
            }

            animate(el, p, from);

        }).observe(el, {
            childList: true,
            characterData: true,
            subtree: true
        });
    }

    var numbers = document.querySelectorAll(".big-number");

    for (var i = 0; i < numbers.length; i++) {
        watch(numbers[i]);
    }

})();


(function () {

    var box = document.querySelector(".welcome-box");
    var bar = document.querySelector(".sidebar");

    if (!box || !bar) {
        return;
    }

    var script = document.currentScript;
    var scriptURL = script ? script.src : location.href;

    var LOGIN_PAGE = new URL("../Login.html", scriptURL).href;
    var NAME_KEY = "display-name";

    async function accountLogout() {

        try {
            if (window.db && window.db.auth) {
                var result = await window.db.auth.signOut();

                if (result && result.error) {
                    console.error("Logout error:", result.error);
                    alert("Logout failed. Please try again.");
                    return;
                }
            }

        } catch (e) {
            console.error("Logout error:", e);
            alert("Unable to log out. Please try again.");
            return;
        }

        try {
            sessionStorage.clear();
            localStorage.removeItem(NAME_KEY);
        } catch (e) {
            console.error("Storage error:", e);
        }

        window.location.href = LOGIN_PAGE;
    }

    async function accountChangePassword(currentPassword, newPassword) {
        return "Changing the password is not connected to your login yet.";
    }

    function checkName(text) {
        text = String(text || "").trim();

        if (text === "") {
            return "Please type a display name.";
        }

        if (text.length > 30) {
            return "Keep it under 30 letters.";
        }

        return "";
    }

    function checkPassword(current, next, again) {

        if (current === "" || next === "" || again === "") {
            return "Please fill in all three boxes.";
        }

        if (next.length < 6) {
            return "The new password needs at least 6 characters.";
        }

        if (next !== again) {
            return "The new passwords do not match.";
        }

        if (next === current) {
            return "The new password must be different from the current one.";
        }

        return "";
    }

    var defaultName = "";
    var nameEls = document.querySelectorAll(".welcome-box .bold-text");

    if (nameEls.length) {
        defaultName = nameEls[0].textContent;
    }

    function getName() {
        try {
            return localStorage.getItem(NAME_KEY) || defaultName;
        } catch (e) {
            return defaultName;
        }
    }

    var menu = document.createElement("div");

    menu.className = "acct-menu";
    menu.id = "acct-menu";
    menu.hidden = true;
    menu.setAttribute("role", "menu");

    menu.innerHTML =

        "<div class='acct-head'>" +
            "<span class='acct-pic'></span>" +
            "<div>" +
                "<div class='acct-name'></div>" +
                "<div class='acct-sub'>Signed in</div>" +
            "</div>" +
        "</div>" +

        "<div class='acct-view' data-view='main'>" +
            "<button type='button' class='acct-item' data-go='name'>Edit display name</button>" +
            "<button type='button' class='acct-item' data-go='pass'>Change password</button>" +
            "<button type='button' class='acct-item danger' data-act='logout'>Log out</button>" +
        "</div>" +

        "<div class='acct-view' data-view='name' hidden>" +
            "<label class='acct-label' for='acct-name-input'>Display name</label>" +
            "<input type='text' id='acct-name-input' class='acct-input' maxlength='30' autocomplete='off'>" +
            "<p class='acct-msg' role='alert'></p>" +
            "<div class='acct-btns'>" +
                "<button type='button' class='acct-btn' data-go='main'>Back</button>" +
                "<button type='button' class='acct-btn primary' data-act='savename'>Save</button>" +
            "</div>" +
        "</div>" +

        "<div class='acct-view' data-view='pass' hidden>" +
            "<label class='acct-label' for='acct-cur'>Current password</label>" +
            "<input type='password' id='acct-cur' class='acct-input' autocomplete='current-password'>" +
            "<label class='acct-label' for='acct-new'>New password</label>" +
            "<input type='password' id='acct-new' class='acct-input' autocomplete='new-password'>" +
            "<label class='acct-label' for='acct-again'>Confirm new password</label>" +
            "<input type='password' id='acct-again' class='acct-input' autocomplete='new-password'>" +
            "<p class='acct-msg' role='alert'></p>" +
            "<div class='acct-btns'>" +
                "<button type='button' class='acct-btn' data-go='main'>Back</button>" +
                "<button type='button' class='acct-btn primary' data-act='savepass'>Save password</button>" +
            "</div>" +
        "</div>";

    bar.appendChild(menu);

    function showName() {

        var name = getName();

        for (var i = 0; i < nameEls.length; i++) {
            nameEls[i].textContent = name;
        }

        var inMenu = menu.querySelector(".acct-name");

        if (inMenu) {
            inMenu.textContent = name;
        }
    }

    showName();

    function show(view) {

        var views = menu.querySelectorAll(".acct-view");

        for (var i = 0; i < views.length; i++) {
            views[i].hidden = (views[i].dataset.view !== view);
        }

        var msgs = menu.querySelectorAll(".acct-msg");

        for (var m = 0; m < msgs.length; m++) {
            msgs[m].textContent = "";
            msgs[m].classList.remove("ok");
        }

        var first = null;

        if (view === "name") {
            first = document.getElementById("acct-name-input");
            first.value = getName();
        }

        if (view === "pass") {
            first = document.getElementById("acct-cur");
        }

        if (first) {
            first.focus();

            if (first.select && view === "name") {
                first.select();
            }
        }
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

        for (var i = 0; i < fields.length; i++) {
            fields[i].value = "";
        }
    }

    function say(view, text, good) {

        var msg = menu.querySelector(
            "[data-view='" + view + "'] .acct-msg"
        );

        msg.textContent = text;
        msg.classList.toggle("ok", !!good);
    }

    box.setAttribute("role", "button");
    box.setAttribute("tabindex", "0");
    box.setAttribute("aria-haspopup", "menu");
    box.setAttribute("aria-expanded", "false");
    box.setAttribute("title", "Account");

    function toggle() {

        if (menu.hidden) {
            openMenu();
        } else {
            closeMenu();
        }
    }

    box.addEventListener("click", toggle);

    box.addEventListener("keydown", function (e) {

        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
        }

    });

    document.addEventListener("click", function (e) {

        if (
            !menu.hidden &&
            !menu.contains(e.target) &&
            !box.contains(e.target)
        ) {
            closeMenu();
        }

    });

    document.addEventListener("keydown", function (e) {

        if (e.key === "Escape" && !menu.hidden) {
            closeMenu();
            box.focus();
        }

    });

    menu.addEventListener("keydown", function (e) {

        if (e.key !== "Enter" || e.target.tagName !== "INPUT") {
            return;
        }

        var view = e.target.closest(".acct-view").dataset.view;

        var button = menu.querySelector(
            "[data-view='" + view + "'] .primary"
        );

        if (button) {
            button.click();
        }

    });

    menu.addEventListener("click", async function (e) {

        var btn = e.target.closest("button");

        if (!btn) {
            return;
        }

        if (btn.dataset.go) {
            show(btn.dataset.go);
            return;
        }

        if (btn.dataset.act === "logout") {

            btn.disabled = true;
            btn.textContent = "Logging out...";

            await accountLogout();

            return;
        }

        if (btn.dataset.act === "savename") {

            var input = document.getElementById("acct-name-input");
            var problem = checkName(input.value);

            if (problem) {
                say("name", problem, false);
                return;
            }

            try {
                localStorage.setItem(NAME_KEY, input.value.trim());
            } catch (err) {}

            showName();
            say("name", "Saved.", true);

            return;
        }

        if (btn.dataset.act === "savepass") {

            var cur = document.getElementById("acct-cur").value;
            var next = document.getElementById("acct-new").value;
            var again = document.getElementById("acct-again").value;

            var bad = checkPassword(cur, next, again);

            if (bad) {
                say("pass", bad, false);
                return;
            }

            btn.disabled = true;

            var error = null;

            try {
                error = await accountChangePassword(cur, next);
            } catch (err) {
                error = err && err.message ?
                    err.message : "Something went wrong.";
            }

            btn.disabled = false;

            if (error) {
                say("pass", error, false);
                return;
            }

            say("pass", "Password updated.", true);

            setTimeout(closeMenu, 1200);
        }

    });

})();
