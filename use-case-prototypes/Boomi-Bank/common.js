/* Boomi Bank demo - shared helpers (theme, safe markdown, JSON highlight,
   data-product calls with an embedded fallback for file:// use). */
(function () {
  "use strict";
  var BB = window.BB = {};
  var M = function () { return window.BB_MOCK || {}; };
  BB.served = false;  /* online build: no local server. online.js adds the live API via the Supabase edge function */

  /* ---------- theme ---------- */
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  BB.store = store;
  BB.initTheme = function (btn) {
    var saved = store("bb-theme");
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
      store("bb-theme", next);
      label();
    });
    label();
  };
  /* served from demo/server.py: use the clean routes (/onboarding) instead of file names */
  BB.routes = function () { if (BB.served) document.querySelectorAll("a[data-route]").forEach(function (a) { a.href = a.dataset.route; }); };
  BB.routeTo = function (page) { return BB.served ? (page === "index" ? "/" : "/" + page) : page + ".html"; };

  /* ---------- escaping & markdown ---------- */
  BB.esc = function (s) {
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
  BB.md = function (src) {
    var lines = BB.esc(src || "").split("\n"), out = [], i = 0, list = null;
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

  /* ---------- JSON / XML syntax highlight ---------- */
  BB.jsonHTML = function (obj) {
    var s = BB.esc(JSON.stringify(obj, null, 2));
    return s.replace(/(&quot;(?:\\.|[^&]|&(?!quot;))*?&quot;)(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
      function (m, str, colon, bool, num) {
        if (str) return colon ? '<span class="k">' + str + "</span>" + colon : '<span class="s">' + str + "</span>";
        if (bool) return '<span class="b">' + bool + "</span>";
        return '<span class="n">' + num + "</span>";
      });
  };
  BB.parseMaybe = function (p) {
    if (typeof p !== "string") return p;
    var t = p.trim();
    if (t.charAt(0) === "{" || t.charAt(0) === "[") { try { return JSON.parse(t); } catch (e) { return p; } }
    return p;
  };
  function prettyXml(x) {
    var depth = 0;
    return String(x).replace(/>\s*</g, ">\n<").split("\n").map(function (tok) {
      tok = tok.trim();
      if (/^<\//.test(tok)) depth = Math.max(0, depth - 1);
      var line = new Array(depth + 1).join("  ") + tok;
      if (/^<[A-Za-z]/.test(tok) && !/<\//.test(tok) && !/\/>$/.test(tok)) depth++;
      return line;
    }).join("\n");
  }
  BB.xmlHTML = function (x) {
    return BB.esc(prettyXml(x)).replace(/(&quot;[^&]*&quot;)/g, '<span class="s">$1</span>')
      .replace(/(&lt;\/?)([\w:.-]+)/g, '$1<span class="k">$2</span>');
  };
  BB.payloadHTML = function (p) {
    p = BB.parseMaybe(p);
    if (p == null) return '<pre class="json sm">null</pre>';
    if (typeof p === "string") {
      var t = p.trim();
      return '<pre class="json sm">' + (t.charAt(0) === "<" ? t.split(/\n(?=<)/).map(BB.xmlHTML).join("\n\n") : BB.esc(p)) + "</pre>";
    }
    return '<pre class="json sm">' + BB.jsonHTML(p) + "</pre>";
  };

  /* ---------- money & dates ---------- */
  function fmt(n, dp) { return Number(n).toLocaleString("en-AU", { minimumFractionDigits: dp, maximumFractionDigits: dp }); }
  BB.aud = function (n) { return n == null || n === "" ? "-" : "AUD " + fmt(n, 2); };
  BB.dollars = function (n) { return n == null || n === "" ? "-" : (Number(n) < 0 ? "-$" : "$") + fmt(Math.abs(Number(n)), 2); };
  BB.amt = function (n, ccy) { return n == null ? "-" : (ccy || "AUD") + " " + fmt(n, 2); };
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  BB.parts = function (iso) { var m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?/.exec(String(iso || "")); return m ? { y: +m[1], mo: +m[2] - 1, d: +m[3], t: m[4] || "", mon: MON[+m[2] - 1] } : null; };
  BB.day = function (iso, yr) { var p = BB.parts(iso); return p ? p.d + " " + p.mon + (yr ? " " + p.y : "") : String(iso || "-"); };
  BB.when = function (iso) { var p = BB.parts(iso); return p ? p.d + " " + p.mon + " " + p.y + (p.t ? " · " + p.t : "") : String(iso || ""); };
  BB.splitRM = function (h) { var m = /^(.*?)\s*\((.*)\)\s*$/.exec(String(h || "")); return m ? { name: m[1], role: m[2] } : { name: String(h || ""), role: "" }; };
  BB.initials = function (n) { return String(n || "").split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w.charAt(0); }).join("").toUpperCase(); };
  BB.normCif = function (s) { var m = /^\s*(CIF)?[ -]*([0-9]{6})\s*$/i.exec(String(s || "")); return m ? "CIF-" + m[2] : String(s || "").trim(); };

  /* ---------- personas ---------- */
  BB.PEOPLE = {
    "CIF-100201": { cif: "CIF-100201", name: "Olivia Bennett", first: "Olivia", city: "Sydney", segment: "Private", her: "her", she: "she" },
    "CIF-100202": { cif: "CIF-100202", name: "Raj Patel", first: "Raj", city: "Melbourne", segment: "Premier", her: "his", she: "he" },
    "CIF-100203": { cif: "CIF-100203", name: "Jack Morrison", first: "Jack", city: "Perth", segment: "Everyday", her: "his", she: "he" },
    "CIF-100204": { cif: "CIF-100204", name: "Mia Nguyen", first: "Mia", city: "Brisbane", segment: "Everyday", her: "her", she: "she", app: "APP-55821" }
  };
  /* shared by customer-app.html and rm-desk.html */
  BB.persona = function (v) {
    if (v === undefined) return store("bb.persona");
    store("bb.persona", v);
  };

  /* ---------- data products ---------- */
  BB.ENDPOINTS = {
    c360: { facade: "/api/v1/bank/customer/360", wss: "/ws/simple/queryBbcustomer360", process: "BB_P2_Customer_360_API", tool: "get_customer_360", product: "customer_360" },
    positions: { facade: "/api/v1/bank/positions", wss: "/ws/simple/queryBbpositions", process: "BB_P3_Consolidated_Positions_API", tool: "get_consolidated_positions", product: "consolidated_positions" },
    alerts: { facade: "/api/v1/bank/alerts", wss: "/ws/simple/queryBbdataqualityalerts", process: "BB_P4_Data_Quality_Alerts_API", tool: "get_data_quality_alerts", product: "data_quality_alerts" },
    onboarding: { facade: "/api/v1/bank/onboarding", wss: "/ws/simple/createBbonboarding", process: "BB_P5_Digital_Onboarding_Orchestration", tool: null, product: "digital_onboarding" },
    payout: { facade: "/api/v1/bank/loan-payout", wss: "/ws/simple/createBbloanpayout", process: "BB_P6_Loan_Payout_Closure_Orchestration", tool: null, product: "loan_payout" },
    release: { facade: "/api/v1/bank/security-release", wss: "/ws/simple/updateBbsecurityrelease", process: "BB_P7_Security_Release_Status", tool: null, product: "security_release" }
  };
  function flag(v) { return /^(true|1|yes|on)$/i.test(String(v == null ? "" : v).trim()) ? "true" : "false"; }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  BB.stamp = function (prefix) {
    var d = new Date();
    return prefix + "-" + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
  };
  function lower(s) { return String(s || "").trim().toLowerCase(); }
  BB.embedded = function (kind, p) {
    var m = M();
    var tag = function (o) { var c = JSON.parse(JSON.stringify(o)); c._servedBy = "embedded-mock"; c._latencyMs = 0; c._fallbackReason = "opened as a file: embedded sample data"; return c; };
    var none = function (o) { o._servedBy = "embedded-mock"; o._latencyMs = 0; return o; };
    p = p || {};
    if (kind === "c360") {
      var cid = BB.normCif(p.customer_id), n = lower(p.customer_name);
      if (!cid && !n) return none({ dataProduct: "customer_360", matched: false, error: "customer_name or customer_id is required" });
      var key = /^CIF-/.test(cid) ? cid : Object.keys(m.c360 || {}).find(function (k) { return lower(((m.c360[k].customers || [])[0] || {}).legalName).indexOf(n || lower(cid)) >= 0; });
      if (key && (m.c360 || {})[key]) return tag(m.c360[key]);
      return none({ dataProduct: "customer_360", query: { customer_name: p.customer_name || "", customer_id: p.customer_id || "" }, matched: false, resultCount: 0, customers: [], message: "No customer matching '" + (p.customer_id || p.customer_name) + "'" });
    }
    if (kind === "positions") {
      var c = BB.normCif(p.customer_id);
      if (!c) return none({ matched: false, error: "customer_id is required (e.g. CIF-100201)" });
      if (!/^CIF-/.test(c)) { var hit = (m.customers || []).find(function (x) { return lower(x.legalName).indexOf(lower(c)) >= 0; }); if (hit) c = hit.customerId; }
      if ((m.positions || {})[c]) return tag(m.positions[c]);
      return none({ dataProduct: "consolidated_positions", query: { customer_id: c }, matched: false, message: "No accounts, loans or cards for customer '" + c + "'" });
    }
    if (kind === "alerts") {
      var s = lower(p.segment) || "all", sk = s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1);
      if ((m.alerts || {})[sk]) return tag(m.alerts[sk]);
      return none({ dataProduct: "data_quality_alerts", query: { segment: p.segment }, matched: false, message: "No customers in segment '" + p.segment + "'. Known: All, Everyday, Premier, Private" });
    }
    if (kind === "onboarding") {
      var app = String(p.application_id || "").trim().toUpperCase();
      var orej = function (e) { return none({ orchestration: "digital_onboarding", status: "REJECTED", error: e }); };
      if (!app) return orej("application_id is required");
      var t = (m.onboarding || {})[app + "|screen:" + flag(p.simulate_screening_down) + "|id:" + flag(p.simulate_id_mismatch)];
      if (!t) return orej("No application " + p.application_id + " - ask the customer to resubmit in the app");
      var o = tag(t); o.onboardingId = BB.stamp("ONB"); o._traceSource = m.onboardingTraceSource || "mock-bundle.js";
      return o;
    }
    if (kind === "payout") {
      var pc = BB.normCif(p.customer_id);
      var prej = function (e) { return none({ orchestration: "loan_payout", status: "REJECTED", error: e }); };
      if (!pc) return prej("customer_id is required");
      var pt = (m.payout || {})[pc + "|fail:" + flag(p.simulate_payment_failed)];
      if (!pt) return prej(pc === "CIF-100204" ? "Mia Nguyen has no active loan to pay out" : "No governed customer record for " + pc);
      var po = tag(pt); po.payoutId = BB.stamp("PAY"); po._traceSource = m.payoutTraceSource || "mock-bundle.js";
      return po;
    }
    if (kind === "release") {
      var sid = String(p.security_id || "").trim().toUpperCase(), st = String(p.status || "").trim().toUpperCase();
      var rt = (m.release || {})[sid + "|" + st];
      if (!rt) return none({ orchestration: "security_release", status: "REJECTED", error: "Unknown discharge status or security. Use LODGED, SETTLED or RELEASED for a registered security." });
      var ro = tag(rt); ro._traceSource = m.releaseTraceSource || "mock-bundle.js";
      return ro;
    }
    return none({ error: "unknown data product " + kind });
  };
  /* Returns {data, ms}. Via the local facade when served, else the embedded bundle. */
  BB.product = function (kind, payload) {
    var t0 = performance.now();
    if (!BB.served) return Promise.resolve({ data: BB.embedded(kind, payload), ms: Math.round(performance.now() - t0) });
    return fetch(BB.ENDPOINTS[kind].facade, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload || {}) })
      .then(function (r) { return r.json(); })
      .then(function (d) { return { data: d, ms: Math.round(performance.now() - t0) }; })
      .catch(function () { var d = BB.embedded(kind, payload); d._fallbackReason = "demo server unreachable: embedded sample data"; return { data: d, ms: Math.round(performance.now() - t0) }; });
  };
  BB.sources = function (customer) {
    var fb = function () { return (M().sources || {})[customer]; };
    if (!BB.served) return Promise.resolve(fb());
    return fetch("/api/mock/sources?customer=" + encodeURIComponent(customer)).then(function (r) { return r.json(); }).catch(fb);
  };
  BB.health = function () {
    if (!BB.served) return Promise.resolve(null);
    return fetch("/health").then(function (r) { return r.json(); }).catch(function () { return null; });
  };
  BB.isLive = function (d) { return !!d && d._servedBy === "boomi-live"; };
  BB.badge = function (el, mode, text, title) {
    var live = mode === "live" || mode === "boomi-live";
    el.className = "badge " + (live ? "live" : "mock");
    el.innerHTML = '<span class="dot"></span>' + BB.esc(text);
    if (title !== undefined) el.title = title;
  };
  /* live / replay badge for one response, with the fallback reason as tooltip and short suffix */
  BB.whyNot = function (d) {
    if (!d) return "sample data";
    var r = d._fallbackReason || d._servedBy || "sample data";
    if (/Data Hub|FAILED|answered/i.test(r)) return "Data Hub pending";
    if (/file/i.test(r)) return "file mode";
    if (/unreachable|HTTP|non-JSON/i.test(r)) return "Boomi offline";
    if (/DEMO_MODE/.test(r)) return "mock mode";
    return "fallback";
  };
  BB.srcBadge = function (d, liveText, replayText) {
    var live = BB.isLive(d);
    var why = live ? "Served live by Boomi" + (d._latencyMs != null ? " in " + d._latencyMs + " ms" : "") :
      (d && d._servedBy ? d._servedBy : "sample data") + (d && d._traceSource ? " · " + d._traceSource : "") + (d && d._fallbackReason ? " · " + d._fallbackReason : "");
    return '<span class="badge ' + (live ? "live" : "mock") + '" title="' + BB.esc(why) + '"><span class="dot"></span>' +
      BB.esc(live ? (liveText || "live") : (replayText || "replay") + " · " + BB.whyNot(d)) + "</span>";
  };
})();
