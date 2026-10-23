/* Boomi Resources demo - shared helpers (theme, safe markdown, JSON highlight,
   data-product calls with an embedded fallback for file:// use). */
(function () {
  "use strict";
  var BR = window.BR = {};
  var M = function () { return window.BR_MOCK || {}; };
  BR.served = false;  /* online build: no local server. online.js adds the live API via the Supabase edge function */

  /* ---------- theme ---------- */
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  BR.store = store;
  BR.initTheme = function (btn) {
    var saved = store("br-theme");
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
      store("br-theme", next);
      label();
    });
    label();
  };
  /* served from demo/server.py: use the clean routes (/shift-start) instead of file names */
  BR.routes = function () { if (BR.served) document.querySelectorAll("a[data-route]").forEach(function (a) { a.href = a.dataset.route; }); };
  BR.routeTo = function (page) { return BR.served ? (page === "index" ? "/" : "/" + page) : page + ".html"; };

  /* ---------- escaping & markdown ---------- */
  BR.esc = function (s) {
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
  BR.md = function (src) {
    var lines = BR.esc(src || "").split("\n"), out = [], i = 0, list = null;
    function closeList() { if (list) { out.push("</" + list + ">"); list = null; } }
    while (i < lines.length) {
      var l = lines[i];
      if (/^\s*```/.test(l)) {
        closeList();
        var code = []; i++;
        while (i < lines.length && !/^\s*```/.test(lines[i])) { code.push(lines[i]); i++; }
        out.push("<pre>" + code.join("\n") + "</pre>"); i++;
        continue;
      }
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
      else { closeList(); out.push("<p>" + inline(l.replace(/\s{2,}$/, "")) + "</p>"); }
      i++;
    }
    closeList();
    return out.join("");
  };

  /* ---------- JSON / XML syntax highlight ---------- */
  BR.jsonHTML = function (obj) {
    var s = BR.esc(JSON.stringify(obj, null, 2));
    return s.replace(/(&quot;(?:\\.|[^&]|&(?!quot;))*?&quot;)(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
      function (m, str, colon, bool, num) {
        if (str) return colon ? '<span class="k">' + str + "</span>" + colon : '<span class="s">' + str + "</span>";
        if (bool) return '<span class="b">' + bool + "</span>";
        return '<span class="n">' + num + "</span>";
      });
  };
  BR.parseMaybe = function (p) {
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
  BR.xmlHTML = function (x) {
    return BR.esc(prettyXml(x)).replace(/(&quot;[^&]*&quot;)/g, '<span class="s">$1</span>')
      .replace(/(&lt;\/?)([\w:.-]+)/g, '$1<span class="k">$2</span>');
  };
  BR.payloadHTML = function (p) {
    p = BR.parseMaybe(p);
    if (p == null) return '<pre class="json sm">null</pre>';
    if (typeof p === "string") {
      var t = p.trim();
      return '<pre class="json sm">' + (t.charAt(0) === "<" ? t.split(/\n(?=<)/).map(BR.xmlHTML).join("\n\n") : BR.esc(p)) + "</pre>";
    }
    return '<pre class="json sm">' + BR.jsonHTML(p) + "</pre>";
  };

  /* ---------- numbers & dates ---------- */
  function fmt(n, dp) { return Number(n).toLocaleString("en-AU", { minimumFractionDigits: dp, maximumFractionDigits: dp }); }
  BR.fmt = fmt;
  BR.aud = function (n) { return n == null || n === "" ? "-" : "AUD " + fmt(n, 2); };
  BR.t = function (n) { return n == null || n === "" ? "-" : fmt(n, 1) + " t"; };
  BR.h = function (n) { return n == null || n === "" ? "-" : fmt(n, 1) + " h"; };
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  BR.parts = function (iso) { var m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?/.exec(String(iso || "")); return m ? { y: +m[1], mo: +m[2] - 1, d: +m[3], t: m[4] || "", mon: MON[+m[2] - 1] } : null; };
  BR.day = function (iso, yr) { var p = BR.parts(iso); return p ? p.d + " " + p.mon + (yr ? " " + p.y : "") : String(iso || "-"); };
  BR.when = function (iso) { var p = BR.parts(iso); return p ? p.d + " " + p.mon + " " + p.y + (p.t ? " · " + p.t : "") : String(iso || ""); };
  BR.initials = function (n) { return String(n || "").split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w.charAt(0); }).join("").toUpperCase(); };
  BR.normFleet = function (s) { var m = /^([A-Z]{2})-?(\d{2,4})$/.exec(String(s || "").toUpperCase().replace(/\s/g, "")); return m ? m[1] + "-" + m[2] : String(s || "").trim().toUpperCase(); };
  BR.normSerial = function (s) { return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); };
  /* status value -> safe CSS class for .st chips ("In Progress" -> In_Progress) */
  BR.stc = function (s) { return String(s || "").replace(/[^A-Za-z0-9]+/g, "_"); };
  BR.st = function (s, label) { return '<span class="st ' + BR.stc(s) + '">' + BR.esc(label || String(s || "-").replace(/_/g, " ")) + "</span>"; };
  BR.sysTag = function (s) { return '<span class="tag ' + BR.esc(s) + '">' + BR.esc(s) + "</span>"; };
  BR.SYSNAME = { SAP_PM: "SAP PM", FLEET_MGMT: "Dispatch", OEM_TELEMATICS: "OEM telematics", SERVICENOW: "ServiceNow", CREW_ROSTER: "Crew roster",
    INVENTORY: "Inventory", DATA_HUB: "Data Hub", BOOMI: "Boomi", ACCESS_CONTROL: "Access control", SAP_TIME: "SAP time (CATS)",
    OPERATOR_APP: "Operator tablet", PRODUCTION: "Short-interval control", MESSAGING: "Radio / SMS" };
  /* small inline haul-truck glyph (currentColor) */
  BR.truckSVG = function (cls) {
    var water = cls === "WATER_CART", shovel = cls === "EXCAVATOR";
    if (shovel) return '<svg viewBox="0 0 40 20" aria-hidden="true"><rect x="2" y="13" width="20" height="5" rx="2" fill="currentColor"/><rect x="6" y="6" width="11" height="7" rx="1" fill="currentColor" opacity=".8"/><path d="M17 8 L29 3 L37 9" stroke="currentColor" stroke-width="2.2" fill="none"/><path d="M33 9 h6 v5 h-6 z" fill="currentColor"/></svg>';
    return '<svg viewBox="0 0 40 20" aria-hidden="true">' + (water ? '<rect x="3" y="4" width="22" height="9" rx="4" fill="currentColor" opacity=".75"/>' :
      '<path d="M2 5 L26 5 L23 13 L4 13 Z" fill="currentColor" opacity=".75"/>') +
      '<rect x="26" y="6" width="9" height="7" rx="1.5" fill="currentColor"/><rect x="2" y="12.5" width="35" height="2.5" fill="currentColor"/>' +
      '<circle cx="9" cy="16.5" r="3" fill="currentColor"/><circle cx="31" cy="16.5" r="3" fill="currentColor"/></svg>';
  };

  /* ---------- operators, machines ---------- */
  BR.OPERATORS = {
    "RR-40211": { badge: "RR-40211", name: "Sam Taylor", first: "Sam", employer: "Boomi Resources", role: "Haul truck operator", note: "B crew · CAT 793F licence" },
    "RR-C7734": { badge: "RR-C7734", name: "Tom Walker", first: "Tom", employer: "Haulmax Contracting", role: "Haul truck operator (contractor)", note: "Contractor · induction expired", flag: true }
  };
  BR.MACHINES = {
    "HT-214": { fleetId: "HT-214", label: "HT-214", sub: "Cat 793F haul truck", serial: "CAT0793FKL1234" },
    "HT-221": { fleetId: "HT-221", label: "HT-221", sub: "Cat 793F haul truck · service overdue", serial: "CAT0793FKL1301" },
    "WC-03": { fleetId: "WC-03", label: "WC-03", sub: "Cat 777G water cart · unlinked telematics", serial: "CAT0777GWC0412" }
  };
  /* the supervisor desk's machine toggle remembers the choice (br.persona); the operator app keeps its own (br.operator) */
  BR.persona = function (v) { if (v === undefined) return store("br.persona"); store("br.persona", v); };
  BR.operator = function (v) { if (v === undefined) return store("br.operator"); store("br.operator", v); };

  /* ---------- data products ---------- */
  BR.ENDPOINTS = {
    e360: { facade: "/api/v1/mine/equipment/360", wss: "/ws/simple/queryBrequipment360", process: "BR_P2_Equipment_360_API", tool: "get_equipment_360", product: "equipment_360" },
    production: { facade: "/api/v1/mine/production", wss: "/ws/simple/queryBrproduction", process: "BR_P3_Production_Availability_API", tool: "get_production_availability", product: "production_availability" },
    alerts: { facade: "/api/v1/mine/alerts", wss: "/ws/simple/queryBralerts", process: "BR_P4_Maintenance_Alerts_API", tool: "get_maintenance_alerts", product: "maintenance_alerts" },
    shiftstart: { facade: "/api/v1/mine/shift-start", wss: "/ws/simple/createBrshiftstart", process: "BR_P5_Shift_Start_Orchestration", tool: null, product: "shift_start" },
    breakdown: { facade: "/api/v1/mine/breakdown", wss: "/ws/simple/createBrbreakdown", process: "BR_P6_Breakdown_Response_Orchestration", tool: null, product: "breakdown_response" },
    repair: { facade: "/api/v1/mine/repair-status", wss: "/ws/simple/updateBrrepairstatus", process: "BR_P7_Return_To_Service", tool: null, product: "return_to_service" },
    goldensync: { facade: "/api/v1/mine/golden-sync", wss: "/ws/simple/createBrgoldensync", process: "BR_P8_Golden_Record_Sync", tool: null, product: "golden_record_sync" }
  };
  function flag(v) { return /^(true|1|yes|on)$/i.test(String(v == null ? "" : v).trim()) ? "true" : "false"; }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  BR.stamp = function (prefix) {
    var d = new Date();
    return prefix + "-" + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
  };
  BR.embedded = function (kind, p) {
    var m = M();
    var tag = function (o) { var c = JSON.parse(JSON.stringify(o)); c._servedBy = "embedded-mock"; c._latencyMs = 0; c._fallbackReason = "opened as a file: embedded sample data"; return c; };
    var none = function (o) { o._servedBy = "embedded-mock"; o._latencyMs = 0; return o; };
    p = p || {};
    if (kind === "e360") {
      var id = String(p.fleet_id || "").trim(), name = String(p.asset_name || "").trim().toLowerCase();
      if (!id && !name) return none({ dataProduct: "equipment_360", matched: false, error: "fleet_id or asset_name is required" });
      var E = m.e360 || {}, key = null, f = BR.normFleet(id), sn = BR.normSerial(id);
      if (E[f]) key = f;
      else if (id) key = Object.keys(E).find(function (k) { var eq = ((E[k].equipment || [])[0] || {}).ids || {}; return eq.sapEquipmentNo === id || eq.cmdbCi === id.toUpperCase() || eq.oemSerial === sn; });
      else key = Object.keys(E).find(function (k) { return String(((E[k].equipment || [])[0] || {}).assetName || "").toLowerCase().indexOf(name) >= 0; });
      if (key) return tag(E[key]);
      return none({ dataProduct: "equipment_360", query: { fleet_id: id, asset_name: p.asset_name || "" }, matched: false, resultCount: 0, equipment: [], message: "No machine matching '" + (id || p.asset_name) + "'" });
    }
    if (kind === "production") {
      var w = String(p.fleet_id || "ALL").trim(), pk = !w || /^all$/i.test(w) ? "ALL" : BR.normFleet(w);
      if ((m.production || {})[pk]) return tag(m.production[pk]);
      return none({ dataProduct: "production_availability", query: { fleet_id: w }, matched: false, message: "No production record for '" + w + "' last shift. Trucks: HT-214, HT-209, HT-217, HT-221" });
    }
    if (kind === "alerts") {
      var s = String(p.scope || "ALL").trim(), ak = !s || /^all$/i.test(s) ? "ALL" : BR.normFleet(s);
      if ((m.alerts || {})[ak]) return tag(m.alerts[ak]);
      return tag(Object.assign({}, (m.alerts || {}).ALL || {}, { query: { scope: s }, machines: [], alerts: [], summary: { machines: 0, machinesWithAlerts: 0, alerts: 0, byType: {} } }));
    }
    if (kind === "shiftstart") {
      var b = String(p.badge_id || "").trim().toUpperCase();
      if (!b) return none({ orchestration: "shift_start", status: "REJECTED", error: "badge_id is required" });
      var t = (m.shiftstart || {})[b + "|fit:" + flag(p.simulate_fitness_fail) + "|pre:" + flag(p.simulate_prestart_fail)];
      if (!t) return none({ orchestration: "shift_start", status: "STOOD_DOWN", error: "Badge " + b + " is not on the Red Ridge roster" });
      var o = tag(t); o.shiftStartId = BR.stamp("SS"); o._traceSource = m.shiftstartTraceSource || "mock-bundle.js";
      return o;
    }
    if (kind === "breakdown") {
      var se = BR.normSerial(p.oem_serial);
      if (!se) return none({ orchestration: "breakdown_response", status: "REJECTED", error: "oem_serial is required" });
      var bt = (m.breakdown || {})[se + "|short:" + flag(p.simulate_parts_shortage)];
      if (!bt) return none({ orchestration: "breakdown_response", status: "REJECTED", error: "Telematics serial " + se + " is not linked to a machine in Data Hub - routed to the data steward" });
      var bo = tag(bt); if (bo.breakdownId) bo.breakdownId = BR.stamp("BD"); bo._traceSource = m.breakdownTraceSource || "mock-bundle.js";
      return bo;
    }
    if (kind === "repair") {
      var rt = (m.repair || {})[String(p.work_order || "").trim() + "|" + String(p.status || "").trim().toUpperCase()];
      if (!rt) return none({ orchestration: "return_to_service", status: "REJECTED", error: "Unknown repair status or work order. Use IN_REPAIR, TESTED or RELEASED for an open SAP work order." });
      var ro = tag(rt); ro._traceSource = m.repairTraceSource || "mock-bundle.js";
      return ro;
    }
    if (kind === "goldensync") {
      var tg = String(p.target || "ALL").trim().toUpperCase() || "ALL", all = (m.goldensync || {}).ALL;
      if (!all) return none({ orchestration: "golden_record_sync", status: "FAILED", error: "No recorded sync in mock-bundle.js" });
      var go = tag(all); go.syncId = BR.stamp("SYNC"); go._traceSource = m.goldensyncTraceSource || "mock-bundle.js";
      if (tg !== "ALL") {
        Object.keys(go.changes || {}).forEach(function (k) { if (k !== tg) { delete go.changes[k]; delete go.summary[k]; } });
        go.steps = (go.steps || []).filter(function (s) { return s.stage !== "sync" || s.system === tg; });
      }
      return go;
    }
    return none({ error: "unknown data product " + kind });
  };
  /* Returns {data, ms}. Via the local facade when served, else the embedded bundle. */
  BR.product = function (kind, payload) {
    var t0 = performance.now();
    if (!BR.served) return Promise.resolve({ data: BR.embedded(kind, payload), ms: Math.round(performance.now() - t0) });
    return fetch(BR.ENDPOINTS[kind].facade, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload || {}) })
      .then(function (r) { return r.json(); })
      .then(function (d) { return { data: d, ms: Math.round(performance.now() - t0) }; })
      .catch(function () { var d = BR.embedded(kind, payload); d._fallbackReason = "demo server unreachable: embedded sample data"; return { data: d, ms: Math.round(performance.now() - t0) }; });
  };
  BR.sources = function (machine) {
    var fb = function () { return (M().sources || {})[machine]; };
    if (!BR.served) return Promise.resolve(fb());
    return fetch("/api/mock/sources?machine=" + encodeURIComponent(machine)).then(function (r) { return r.json(); }).catch(fb);
  };
  BR.health = function () {
    if (!BR.served) return Promise.resolve(null);
    return fetch("/health").then(function (r) { return r.json(); }).catch(function () { return null; });
  };
  BR.isLive = function (d) { return !!d && d._servedBy === "boomi-live"; };
  BR.badge = function (el, mode, text, title) {
    var live = mode === "live" || mode === "boomi-live";
    el.className = "badge " + (live ? "live" : "mock");
    el.innerHTML = '<span class="dot"></span>' + BR.esc(text);
    if (title !== undefined) el.title = title;
  };
  /* live / replay badge for one response, with the fallback reason as tooltip and short suffix */
  BR.whyNot = function (d) {
    if (!d) return "sample data";
    var r = d._fallbackReason || d._servedBy || "sample data";
    if (/Data Hub|FAILED|answered/i.test(r)) return "Boomi error";
    if (/file/i.test(r)) return "file mode";
    if (/unreachable|HTTP|non-JSON/i.test(r)) return "Boomi offline";
    if (/DEMO_MODE/.test(r)) return "mock mode";
    return "fallback";
  };
  BR.srcBadge = function (d, liveText, replayText) {
    var live = BR.isLive(d);
    var why = live ? "Served live by Boomi" + (d._latencyMs != null ? " in " + d._latencyMs + " ms" : "") :
      (d && d._servedBy ? d._servedBy : "sample data") + (d && d._traceSource ? " · " + d._traceSource : "") + (d && d._fallbackReason ? " · " + d._fallbackReason : "");
    return '<span class="badge ' + (live ? "live" : "mock") + '" title="' + BR.esc(why) + '"><span class="dot"></span>' +
      BR.esc(live ? (liveText || "live") : (replayText || "replay") + " · " + BR.whyNot(d)) + "</span>";
  };

  /* ---------- assistant chat (index + supervisor desk share one implementation) ---------- */
  BR.chat = function (opt) {
    var log = opt.log, input = opt.input, send = opt.send, quick = opt.quick, sidEl = opt.sid, agentBadge = opt.agentBadge;
    var sessionId = null, busy = false, offlineCtx = {}, api = {};
    function scroll() { log.scrollTop = log.scrollHeight; }
    function clearEmpty() { var e = log.querySelector(".empty"); if (e) e.remove(); }
    function bubble(cls, text) {
      clearEmpty();
      var el = document.createElement("div");
      el.className = "msg " + cls;
      if (cls === "agent") el.innerHTML = '<div class="md">' + BR.md(text) + "</div>"; else el.textContent = text;
      log.appendChild(el); scroll(); return el;
    }
    function Turn() {
      clearEmpty();
      var trail = document.createElement("div"); trail.className = "trail"; log.appendChild(trail);
      var t = { trail: trail, bubble: null, text: "", done: false };
      t.step = function (txt) {
        trail.querySelectorAll(".step.on").forEach(function (s) { s.classList.remove("on"); });
        var s = document.createElement("span");
        s.className = "step on" + (/^Guardrail/.test(txt) ? " guard" : "");
        s.innerHTML = '<span class="d"></span>' + BR.esc(txt);
        trail.appendChild(s); scroll();
      };
      t.delta = function (txt) {
        if (!t.bubble) { t.bubble = bubble("agent", ""); t.bubble.classList.add("streaming"); }
        t.text += txt; t.bubble.innerHTML = '<div class="md">' + BR.md(t.text) + "</div>"; scroll();
      };
      t.message = function (txt) {
        if (t.bubble && !t.done) { t.bubble.classList.remove("streaming"); t.bubble.innerHTML = '<div class="md">' + BR.md(txt) + "</div>"; }
        else bubble("agent", txt);
        t.done = true; scroll();
      };
      t.finish = function () {
        trail.querySelectorAll(".step.on").forEach(function (s) { s.classList.remove("on"); });
        if (t.bubble) t.bubble.classList.remove("streaming");
      };
      return t;
    }
    function setBusy(b) { busy = b; send.disabled = b; input.disabled = b; if (quick) quick.querySelectorAll("button").forEach(function (x) { x.disabled = b; }); }
    function handle(t, evt, obj) {
      if (evt === "mode") {
        if (agentBadge) BR.badge(agentBadge, obj.mode, obj.mode === "live" ? "live agent" : "offline mode");
        if (obj.reason) t.step("Agent Studio unavailable (" + obj.reason + ") - offline assistant");
      } else if (evt === "start" && obj.session_id) {
        sessionId = obj.session_id; sidEl.textContent = sessionId.slice(0, 14) + "…";
      } else if (evt === "progress_notification") {
        if (obj.type !== "GENERATING_TITLE") t.step(obj.content || obj.type || "Working…");
      } else if (evt === "delta" && obj.content) {
        t.delta(obj.content);
      } else if (evt === "message" && obj.content) {
        t.message(obj.content);
      } else if (evt === "error") {
        bubble("error", obj.content || obj.message || "Agent error"); t.done = true;
      }
    }
    async function askServer(q, t) {
      var ctl = new AbortController(), timer = setTimeout(function () { ctl.abort(); }, 300000);
      try {
        var res = await fetch(BR.apiUrl("/api/chat"), { method: "POST", headers: BR.authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ message: q, session_id: sessionId }), signal: ctl.signal });
        if (res.status === 503 || res.status === 401) { await askOffline(q, t); return; }
        if (!res.ok) {
          var msg = "HTTP " + res.status;
          try { var j = await res.json(); msg = j.error + (j.detail ? " - " + j.detail : ""); } catch (e) {}
          bubble("error", msg); t.done = true; return;
        }
        var reader = res.body.getReader(), dec = new TextDecoder(), buf = "";
        while (true) {
          var r = await reader.read();
          if (r.done) break;
          buf += dec.decode(r.value, { stream: true }).replace(/\r\n/g, "\n");
          var cut;
          while ((cut = buf.indexOf("\n\n")) !== -1) {
            var block = buf.slice(0, cut); buf = buf.slice(cut + 2);
            var evt = "", data = "";
            block.split("\n").forEach(function (line) {
              if (line.indexOf("event:") === 0) evt = line.slice(6).trim();
              else if (line.indexOf("data:") === 0) data += line.slice(5).trim();
            });
            if (!evt || !data || data === "null") continue;
            var obj; try { obj = JSON.parse(data); } catch (e) { continue; }
            handle(t, evt, obj);
          }
        }
        if (!t.done) bubble("error", "The agent returned no message. Check the server console.");
      } finally { clearTimeout(timer); }
    }
    /* File mode: route to answers pre-computed by server.py into mock-bundle.js. */
    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    function offlineRoute(q) {
      var C = M().chat || {}, s = q.toLowerCase().trim();
      if (C[q]) return C[q];
      var hit = Object.keys(C).find(function (k) { return k.toLowerCase() === s; });
      if (hit) return C[hit];
      var mm = /\b(ht|ex|wc)[\s-]?(\d{2,4})\b/.exec(s), fid = mm ? mm[1].toUpperCase() + "-" + mm[2] : null;
      if (!fid && /water cart/.test(s)) fid = "WC-03";
      if (!fid && /excavator|shovel/.test(s)) fid = "EX-07";
      if (!fid && /\b(it|its|the truck|this machine|the machine|raise it|the request)\b/.test(s)) fid = offlineCtx.machine || opt.machine && opt.machine() || null;
      var withM = function (r) { return r ? Object.assign({ machine: fid }, r) : null; };
      if (/(bypass|override|defeat|disable|switch off|turn off|get around)\b.*(collision|cas\b|interlock|lock-?out|isolat|safety|alarm|proximity)/.test(s) ||
          /(collision avoidance|interlock|isolation|lock-?out).*(bypass|override|defeat|disable)/.test(s)) return withM(C["How do I bypass the collision avoidance on HT-214?"]);
      if (/drug|alcohol|breathalys|medical|medication|illness|sick|injur|fatigue|diagnos|mental health|health (assessment|condition|record|result)|(his|her|their) health/.test(s))
        return withM(C["What was Tom Walker's drug and alcohol test result?"]);
      if (/stood down|stand[- ]?down|sent home/.test(s)) return C["Why was Sam Taylor stood down?"];
      if (/approve|approval|spend|contract (fitter|crew|labour)|hire|expedit|requisition|raise/.test(s)) {
        var am = /(?:aud|\$)\s?(\d[\d,]*(?:\.\d+)?)/i.exec(q), amt = am ? parseFloat(am[1].replace(/,/g, "")) : (offlineCtx.spend || null);
        if (amt != null && amt <= (M().spendApprovalAUD || 20000)) return withM(C["Approve expedited parts freight for HT-214 at AUD 3,800"]);
        if (/\b(raise|submit|send|lodge|go ahead|yes)\b/.test(s) && !/\bcan\b|\?$/.test(s)) return withM(C["Raise the spend request for a contract fitter crew for HT-214 at AUD 24,500"]);
        if (amt != null) offlineCtx.spend = amt;
        return withM(C["Approve a contract fitter crew for HT-214 at AUD 24,500"]);
      }
      if (!fid && /alert|attention|exception|what needs|across the fleet|data.?quality/.test(s)) return C["What needs attention across the fleet?"];
      if (!fid && /downtime cost|cost us|production|tonnes|availability|last shift|lost/.test(s)) return C["What did downtime cost us last shift?"];
      if (fid) {
        var calls = M().supervisorCalls || {};
        if (fid === "HT-214" && /down|why|incident|cost|run it|today/.test(s)) return withM(C[calls["HT-214"]] || C["Why was HT-214 down last shift?"]);
        if (fid === "HT-221" && /ready line|back|when|going on|overdue|service/.test(s)) return withM(C[calls["HT-221"]] || C["What is the full picture for HT-221?"]);
        if (fid === "WC-03" && /hours|data|wrong|report/.test(s)) return withM(C[calls["WC-03"]] || C["What is the full picture for WC-03?"]);
        return withM(C["What is the full picture for " + fid + "?"] || C.help);
      }
      return C.help;
    }
    async function askOffline(q, t, why) {
      if (agentBadge) BR.badge(agentBadge, "mock", BR.live() ? "offline assistant" : "offline · sign in for the live assistant");
      if (!sessionId || sessionId.indexOf("offline-") !== 0) { sessionId = "offline-file-" + Math.random().toString(16).slice(2, 8); sidEl.textContent = sessionId; }
      var r = offlineRoute(q) || { steps: [], answer: "Sample data is not loaded (mock-bundle.js missing)." };
      if (!r.answer) r = { steps: [], answer: "I can answer from the governed operations data products: a machine's 360, last shift's production and downtime cost, and maintenance alerts." };
      if (why) t.step("Assistant service unavailable (" + why + ") - offline assistant");
      t.step("Understanding the request…");
      for (var i = 0; i < (r.steps || []).length; i++) { await sleep(450); t.step(r.steps[i]); }
      await sleep(350); t.step("Composing answer…");
      var toks = r.answer.match(/\S+\s*|\s+/g) || [];
      for (var k = 0; k < toks.length; k++) { t.delta(toks[k]); if (k % 2 === 0) await sleep(12); }
      t.message(r.answer);
      if (r.machine) offlineCtx.machine = r.machine;
    }
    api.ask = async function (q) {
      if (busy || !q || !q.trim()) return;
      bubble("user", q); input.value = ""; setBusy(true);
      var t = Turn();
      try {
        if (BR.live()) await askServer(q, t); else await askOffline(q, t);
      } catch (err) {
        if (BR.live() && err && err.name !== "AbortError" && !t.bubble && !t.done) {
          try { await askOffline(q, t, "network error"); } catch (e2) { bubble("error", "Request failed: " + e2.message); }
        } else bubble("error", err && err.name === "AbortError" ? "Timed out after 5 minutes. Press Reset and try again." : "Request failed: " + (err && err.message));
      } finally { t.finish(); setBusy(false); try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); } }
    };
    api.reset = function (emptyHTML) {
      sessionId = null; offlineCtx = {}; sidEl.textContent = "new";
      log.innerHTML = emptyHTML || '<div class="empty">New conversation. Pick a prompt above, or ask anything.</div>';
    };
    api.busy = function () { return busy; };
    return api;
  };
})();
