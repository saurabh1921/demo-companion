/* Connected Resort demo - shared helpers (theme, safe markdown, JSON highlight,
   data-product calls with an embedded fallback for file:// use). */
(function () {
  "use strict";
  var CR = window.CR = {};
  var M = function () { return window.CR_MOCK || {}; };
  CR.served = false;  /* online build: no local server. online.js adds the live API via the Supabase edge function */

  /* ---------- theme ---------- */
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  CR.initTheme = function (btn) {
    var saved = store("cr-theme");
    if (saved === "light" || saved === "dark") document.documentElement.setAttribute("data-theme", saved);
    function current() {
      var t = document.documentElement.getAttribute("data-theme");
      if (t) return t;
      return window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    function label() { if (btn) btn.textContent = current() === "dark" ? "Light mode" : "Dark mode"; }
    if (btn) btn.addEventListener("click", function () {
      var next = current() === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      store("cr-theme", next);
      label();
    });
    label();
  };

  /* ---------- escaping & markdown ---------- */
  CR.esc = function (s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  };
  function inline(s) {          /* s is already escaped */
    return s
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>")
      .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,;:!?]|$)/g, "$1<em>$2</em>");
  }
  /* Small, safe renderer: escape everything first, then add a fixed set of tags. */
  CR.md = function (src) {
    var lines = CR.esc(src || "").split("\n"), out = [], i = 0, list = null;
    function closeList() { if (list) { out.push("</" + list + ">"); list = null; } }
    while (i < lines.length) {
      var l = lines[i];
      if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
        closeList();
        var cells = function (r) { return r.trim().replace(/^\||\|$/g, "").split("|").map(function (c) { return c.trim(); }); };
        var head = cells(l), rows = [];
        i += 2;
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(cells(lines[i])); i++; }
        out.push("<table><thead><tr>" + head.map(function (h) { return "<th>" + inline(h) + "</th>"; }).join("") +
          "</tr></thead><tbody>" + rows.map(function (r) {
            return "<tr>" + r.map(function (c) { return "<td>" + inline(c) + "</td>"; }).join("") + "</tr>";
          }).join("") + "</tbody></table>");
        continue;
      }
      var h = /^(#{1,6})\s+(.*)$/.exec(l);
      var ul = /^(\s*)[-*]\s+(.*)$/.exec(l);
      var ol = /^\s*\d+[.)]\s+(.*)$/.exec(l);
      if (h) { closeList(); out.push("<h4>" + inline(h[2]) + "</h4>"); }
      else if (ul) {
        if (list !== "ul") { closeList(); out.push("<ul>"); list = "ul"; }
        out.push("<li" + (ul[1].length >= 2 ? ' style="margin-left:14px"' : "") + ">" + inline(ul[2]) + "</li>");
      }
      else if (ol) { if (list !== "ol") { closeList(); out.push("<ol>"); list = "ol"; } out.push("<li>" + inline(ol[1]) + "</li>"); }
      else if (!l.trim()) { closeList(); }
      else { closeList(); out.push("<p>" + inline(l) + "</p>"); }
      i++;
    }
    closeList();
    return out.join("");
  };

  /* ---------- JSON syntax highlight ---------- */
  CR.jsonHTML = function (obj) {
    var s = CR.esc(JSON.stringify(obj, null, 2));
    return s.replace(/(&quot;(?:\\.|[^&]|&(?!quot;))*?&quot;)(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
      function (m, str, colon, bool, num) {
        if (str) return colon ? '<span class="k">' + str + "</span>" + colon : '<span class="s">' + str + "</span>";
        if (bool) return '<span class="b">' + bool + "</span>";
        return '<span class="n">' + num + "</span>";
      });
  };

  /* ---------- money ---------- */
  CR.usd = function (n) { return n == null ? "-" : "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  CR.amt = function (n, ccy) {
    if (n == null) return "-";
    var dp = ccy === "JPY" ? 0 : 2;
    return ccy + " " + Number(n).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  };

  /* ---------- data products ---------- */
  CR.ENDPOINTS = {
    guest: { facade: "/api/v1/resort/guest/full-picture", wss: "/ws/simple/queryGuestfullpicture", process: "CR_P4_Guest_Full_Picture_API", tool: "get_guest_full_picture" },
    folio: { facade: "/api/v1/resort/folio/consolidated", wss: "/ws/simple/queryConsolidatedfolio", process: "CR_P2_Consolidated_Folio_API", tool: "get_consolidated_folio" },
    receivables: { facade: "/api/v1/resort/receivables", wss: "/ws/simple/queryResortreceivables", process: "CR_P3_Open_Receivables_API", tool: "get_open_receivables" },
    checkin: { facade: "/api/v1/resort/checkin", wss: "/ws/simple/createGuestcheckin", process: "CR_P5_Guest_CheckIn_Orchestration", tool: null },
    checkout: { facade: "/api/v1/resort/checkout", wss: "/ws/simple/createGuestcheckout", process: "CR_P6_Guest_CheckOut_Orchestration", tool: null },
    roomstatus: { facade: "/api/v1/resort/room-status", wss: "/ws/simple/updateRoomstatus", process: "CR_P7_Housekeeping_Room_Status", tool: null }
  };
  function flag(v) { return /^(true|1|yes|on)$/i.test(String(v == null ? "" : v).trim()) ? "true" : "false"; }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  CR.checkInStamp = function () {
    var d = new Date();
    return "CHK-" + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
  };
  function lower(s) { return String(s || "").trim().toLowerCase(); }
  CR.embedded = function (kind, p) {
    var m = M();
    var tag = function (o) { var c = JSON.parse(JSON.stringify(o)); c._servedBy = "embedded-mock"; c._latencyMs = 0; return c; };
    if (kind === "guest") {
      var n = lower(p.guest_name), r = lower(p.room);
      if (!n && !r) return { dataProduct: "guest_master", matched: false, error: "guest_name or room is required", _servedBy: "embedded-mock" };
      var key = n ? Object.keys(m.fullPicture || {}).find(function (k) { return lower(k).indexOf(n) >= 0; })
        : Object.keys(m.rooms || {}).find(function (k) { return lower(k).indexOf(r) >= 0; });
      if (key) return tag(n ? m.fullPicture[key] : m.rooms[key]);
      return { dataProduct: "guest_master", query: { guest_name: p.guest_name || "", room: p.room || "" }, matched: false, resultCount: 0, guests: [], message: "No guest matching '" + (p.guest_name || p.room) + "'", _servedBy: "embedded-mock" };
    }
    if (kind === "folio") {
      var q = lower(p.guest_id || p.guest_name);
      if (!q) return { dataProduct: "resort_folio_consolidated", matched: false, error: "guest_id is required", _servedBy: "embedded-mock" };
      var f = Object.keys(m.folio || {}).map(function (k) { return m.folio[k]; })
        .find(function (x) { return lower(x.guestId) === q.replace(/^loy[\s_-]*/, "loy-") || lower(x.guestName).indexOf(q) >= 0; });
      return f ? tag(f) : { dataProduct: "resort_folio_consolidated", query: { guest_id: p.guest_id }, matched: false, message: "No folio for guest '" + (p.guest_id || p.guest_name) + "'", _servedBy: "embedded-mock" };
    }
    if (kind === "checkin") {
      var gid = String(p.guest_id || "").trim().toUpperCase();
      var rej = function (e) { return { orchestration: "guest_check_in", status: "REJECTED", error: e, _servedBy: "embedded-mock", _latencyMs: 0 }; };
      if (!gid) return rej("guest_id is required");
      var t = (m.checkin || {})[gid + "|key:" + flag(p.simulate_key_system_down) + "|room:" + flag(p.simulate_room_not_ready)];
      if (!t) return rej("No governed guest profile for '" + p.guest_id + "' - route to front desk");
      var c = tag(t), ch = String(p.channel || "").toUpperCase();
      c.checkInId = CR.checkInStamp();
      c._traceSource = m.checkinTraceSource || "mock-bundle.js";
      if (/^(MOBILE_APP|KIOSK|FRONT_DESK)$/.test(ch)) c.channel = ch;
      (c.steps || []).forEach(function (st) { if (st.stage === "receive") st.detail = c.channel + " at " + (p.arrival_time || "15:05"); });
      return c;
    }
    if (kind === "checkout") {
      var cg = String(p.guest_id || "").trim().toUpperCase();
      var crej = function (e) { return { orchestration: "guest_check_out", status: "REJECTED", error: e, _servedBy: "embedded-mock", _latencyMs: 0 }; };
      if (!cg) return crej("guest_id is required");
      var ct = (m.checkout || {})[cg + "|confirm:" + flag(p.confirm_unlinked_charges) + "|declined:" + flag(p.simulate_payment_declined)];
      if (!ct) return crej("No governed guest profile for '" + p.guest_id + "' - route to front desk");
      var co = tag(ct), cch = String(p.channel || "").toUpperCase();
      co.checkOutId = "CHO-" + CR.checkInStamp().slice(4);
      co._traceSource = m.checkoutTraceSource || "mock-bundle.js";
      if (/^(MOBILE_APP|KIOSK|FRONT_DESK)$/.test(cch)) co.channel = cch;
      return co;
    }
    if (kind === "roomstatus") {
      var rr = lower(p.room), rs = String(p.status || "").trim().toUpperCase();
      var rrej = function (e) { return { orchestration: "room_status", status: "REJECTED", error: e, _servedBy: "embedded-mock", _latencyMs: 0 }; };
      if (!rr) return rrej("room is required");
      var rk = Object.keys(m.roomstatus || {}).find(function (k) { return lower(k) === rr + "|" + lower(rs); });
      if (!rk) {
        var known = Object.keys(m.roomstatus || {}).some(function (k) { return lower(k.split("|")[0]) === rr; });
        return rrej(known ? "Unknown housekeeping status '" + (p.status || "") + "' (expected CLEANING, CLEAN or INSPECTED)" : "Unknown room '" + p.room + "'");
      }
      var ro = tag(m.roomstatus[rk]);
      ro._traceSource = m.roomstatusTraceSource || "mock-bundle.js";
      if (p.attendant) ro.attendant = p.attendant;
      return ro;
    }
    var s = lower(p.subsidiary);
    if (!s) return { dataProduct: "open_receivables", matched: false, error: "subsidiary is required", _servedBy: "embedded-mock" };
    var codes = { ghir: "Grand Horizon", cbv: "Coral Bay" };
    var sub = codes[s] || Object.keys(m.receivables || {}).find(function (k) { return lower(k).indexOf(s) >= 0 || s.indexOf(lower(k)) >= 0; });
    return sub ? tag(m.receivables[sub]) : { dataProduct: "open_receivables", query: { subsidiary: p.subsidiary }, matched: false, message: "No subsidiary matching '" + p.subsidiary + "'. Known: Grand Horizon, Coral Bay", _servedBy: "embedded-mock" };
  };
  /* Returns {data, ms}. Via the local facade when served, else the embedded bundle. */
  CR.product = function (kind, payload) {
    var t0 = performance.now();
    if (!CR.served) return Promise.resolve({ data: CR.embedded(kind, payload), ms: Math.round(performance.now() - t0) });
    return fetch(CR.ENDPOINTS[kind].facade, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json(); })
      .then(function (d) { return { data: d, ms: Math.round(performance.now() - t0) }; })
      .catch(function () { return { data: CR.embedded(kind, payload), ms: Math.round(performance.now() - t0) }; });
  };
  CR.sources = function (guest) {
    var fb = function () { return (M().sources || {})[guest]; };
    if (!CR.served) return Promise.resolve(fb());
    return fetch("/api/mock/sources?guest=" + encodeURIComponent(guest)).then(function (r) { return r.json(); }).catch(fb);
  };
  CR.health = function () {
    if (!CR.served) return Promise.resolve(null);
    return fetch("/health").then(function (r) { return r.json(); }).catch(function () { return null; });
  };
  CR.badge = function (el, mode, text) {
    var live = mode === "live" || mode === "boomi-live";
    el.className = "badge " + (live ? "live" : "mock");
    el.innerHTML = '<span class="dot"></span>' + CR.esc(text);
  };
})();
