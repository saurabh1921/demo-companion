/* Boomi Resorts - shared shell: top menu, Supabase sign-in gate, theme + mobile-view toggles, live-only API client.
   Every call goes to the Supabase Edge Function "connected-resort", which holds the Boomi + Agent Studio credentials.
   There is no mock fallback: if a call fails, the page shows the error.
   Usage on a page:  <body data-page="front-desk"> ... <script src="br.js"></script>  then  BR.ready(function () { ... });  */
(function () {
  "use strict";
  var CFG = {
    supabaseUrl: "https://kifvmxtmjmhorfmvfsgq.supabase.co",
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpZnZteHRtam1ob3JmbXZmc2dxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxMTgyOTYsImV4cCI6MjEwNzY5NDI5Nn0.XrPM5YKD_gMlqckKVqMOeYpIR61JOb8MWuw6zAoM908",
    functionUrl: "https://kifvmxtmjmhorfmvfsgq.supabase.co/functions/v1/connected-resort"
  };
  /* Each page is one persona's view of the resort. The persona strip under the menu makes "who am I right now" obvious. */
  var PAGES = [
    { id: "hub", href: "index.html", label: "Overview", persona: { name: "Isabel Reyes", role: "Resort Operations Manager", initials: "IR", color: "#033d58",
      does: "Watches every property, guest journey and Boomi integration from one place.", sees: "Live health of the Boomi processes and the Agent Studio concierge" } },
    { id: "front-desk", href: "front-desk.html", label: "Front desk", persona: { name: "Maya Santos", role: "Front Desk Agent", initials: "MS", color: "#0b8fb3",
      does: "Checks guests in and out, updates housekeeping and looks up folios.", sees: "Check-in, check-out and room-status orchestrations running on Boomi" } },
    { id: "concierge", href: "concierge.html", label: "Concierge", persona: { name: "Liam Carter", role: "Guest Concierge", initials: "LC", color: "#8a5a17",
      does: "Answers guest requests with the AI concierge agent.", sees: "Agent Studio agent calling Boomi data products in real time" } },
    { id: "data-flow", href: "data-flow.html", label: "Data flow", persona: { name: "Priya Nair", role: "Integration Architect", initials: "PN", color: "#6b4bb8",
      does: "Traces how four source systems become three governed data products.", sees: "Boomi Data Hub survivorship, FX normalisation and the live data product APIs" } },
    { id: "guest-app", href: "guest-app.html", label: "Guest app", persona: { name: "Hotel guest", role: "Guest · mobile app", initials: "G", color: "#1f8a5b",
      does: "Checks in from the phone, sees the bill and chats with the concierge.", sees: "Self-service journeys powered by the same Boomi APIs" } }
  ];
  var ENDPOINTS = {
    guest: "/api/v1/resort/guest/full-picture", folio: "/api/v1/resort/folio/consolidated", receivables: "/api/v1/resort/receivables",
    checkin: "/api/v1/resort/checkin", checkout: "/api/v1/resort/checkout", roomstatus: "/api/v1/resort/room-status"
  };
  var KEY = "br_session", THEME = "br_theme";
  var params = new URLSearchParams(location.search), EMBED = params.get("embed") === "1";
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }
  };
  var session = null; try { session = JSON.parse(store.get(KEY) || "null"); } catch (e) {}
  var readyFns = [], isReady = false;

  /* ---------- theme (before paint) ---------- */
  var savedTheme = store.get(THEME);
  if (savedTheme) document.documentElement.setAttribute("data-theme", savedTheme);
  function currentTheme() {
    var t = document.documentElement.getAttribute("data-theme");
    if (t) return t;
    return window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  /* ---------- helpers ---------- */
  var BR = window.BR = { config: CFG, pages: PAGES, embed: EMBED };
  BR.$ = function (s, r) { return (r || document).querySelector(s); };
  BR.esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  BR.money = function (n, cur) {
    if (n == null || n === "" || isNaN(Number(n))) return "–";
    try { return new Intl.NumberFormat(undefined, { style: "currency", currency: cur || "USD", maximumFractionDigits: 2 }).format(Number(n)); }
    catch (e) { return (cur ? cur + " " : "") + Number(n).toFixed(2); }
  };
  BR.json = function (o) { return BR.esc(JSON.stringify(o, null, 2)); };
  BR.toast = function (html, kind, ms) {
    var t = document.createElement("div"); t.className = "br-toast " + (kind || ""); t.innerHTML = html; document.body.appendChild(t);
    t.onclick = function () { t.remove(); }; setTimeout(function () { t.remove(); }, ms || 6000); return t;
  };
  BR.pill = function (text, kind) { return '<span class="pill ' + (kind || "") + '">' + BR.esc(text) + "</span>"; };
  BR.statusKind = function (s) {
    s = String(s || "").toUpperCase();
    if (/FAIL|ERROR|DECLIN|DOWN|REJECT/.test(s)) return "bad";
    if (/PARTIAL|WARN|PENDING|REVIEW|NOT_READY|FALLBACK|HOLD/.test(s)) return "warn";
    if (/OK|SUCCESS|COMPLETE|CHECKED|CLEAN|INSPECTED|CONFIRM|DONE|LIVE/.test(s)) return "good";
    return "";
  };
  BR.rawDetails = function (obj, label) {
    return '<details class="raw"><summary>' + BR.esc(label || "Raw Boomi response") + '</summary><pre class="json">' + BR.json(obj) + "</pre></details>";
  };

  /* ---------- auth ---------- */
  function authPost(path, body) {
    return fetch(CFG.supabaseUrl + "/auth/v1/" + path, { method: "POST", headers: { apikey: CFG.anonKey, "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); });
  }
  function keep(j) {
    session = { access: j.access_token, refresh: j.refresh_token, email: (j.user && j.user.email) || (session && session.email), expiresAt: Date.now() + (j.expires_in || 3600) * 1000 };
    store.set(KEY, JSON.stringify(session));
  }
  function signOut() { session = null; store.set(KEY, null); location.reload(); }
  BR.token = function () {
    if (!session) return Promise.resolve(null);
    if (session.expiresAt - Date.now() > 60000) return Promise.resolve(session.access);
    return authPost("token?grant_type=refresh_token", { refresh_token: session.refresh }).then(function (r) {
      if (!r.ok) { session = null; store.set(KEY, null); return null; }
      keep(r.j); return session.access;
    }).catch(function () { return session && session.access; });
  };
  BR.user = function () { return session && session.email; };
  function headers(extra) {
    return BR.token().then(function (t) {
      if (!t) { gate(); throw new Error("Please sign in."); }
      return Object.assign({ apikey: CFG.anonKey, Authorization: "Bearer " + t }, extra || {});
    });
  }
  function fail(r) {
    if (r.status === 401) { session = null; store.set(KEY, null); gate(); }
    return r.text().then(function (txt) {
      var msg = "HTTP " + r.status;
      try { var j = JSON.parse(txt); msg = (j.error || j.message || msg) + (j.detail ? " – " + j.detail : ""); } catch (e) { if (txt) msg += " – " + txt.slice(0, 200); }
      var err = new Error(msg); err.status = r.status; throw err;
    });
  }

  /* ---------- live API ---------- */
  /* BR.call("guest", {guest_name:"Elena Vance"}) -> Promise<{data, ms}>. Rejects on any failure (no mock data). */
  /* Boomi runtimes can be cold after idle (edge function gives up after ~40 s): retry an "unavailable" answer once. */
  BR.call = function (kind, payload) {
    return callOnce(kind, payload).catch(function (e) {
      if (/unavailable|did not answer|timed? ?out/i.test(e.message || "")) return callOnce(kind, payload);
      throw e;
    });
  };
  function callOnce(kind, payload) {
    var path = ENDPOINTS[kind]; if (!path) return Promise.reject(new Error("Unknown endpoint " + kind));
    var t0 = performance.now();
    return headers({ "Content-Type": "application/json" }).then(function (h) {
      return fetch(CFG.functionUrl + path, { method: "POST", headers: h, body: JSON.stringify(payload || {}) });
    }).then(function (r) {
      if (!r.ok) return fail(r);
      return r.json().then(function (d) {
        if (d && d._unavailable) throw new Error("Boomi unavailable: " + (d._fallbackReason || "no response"));
        return { data: d, ms: Math.round(performance.now() - t0) };
      });
    });
  }
  BR.health = function () {
    return headers().then(function (h) { return fetch(CFG.functionUrl + "/health", { headers: h }); })
      .then(function (r) { return r.ok ? r.json() : fail(r); });
  };
  BR.reset = function () {
    return headers({ "Content-Type": "application/json" }).then(function (h) { return fetch(CFG.functionUrl + "/api/reset", { method: "POST", headers: h, body: "{}" }); })
      .then(function (r) { return r.ok ? r.json() : fail(r); });
  };
  /* BR.chat(message, sessionId, onEvent(evt, obj), signal) -> Promise resolved when the stream ends.
     Events: mode, start{session_id}, progress_notification{content}, delta{content}, message{content}, error{content|message}. */
  BR.chat = function (message, sessionId, onEvent, signal) {
    return headers({ "Content-Type": "application/json" }).then(function (h) {
      return fetch(CFG.functionUrl + "/api/chat", { method: "POST", headers: h, body: JSON.stringify({ message: message, session_id: sessionId || null }), signal: signal });
    }).then(function (r) {
      if (!r.ok) return fail(r);
      var reader = r.body.getReader(), dec = new TextDecoder(), buf = "";
      function pump() {
        return reader.read().then(function (x) {
          if (x.done) return;
          buf += dec.decode(x.value, { stream: true }).replace(/\r\n/g, "\n");
          var cut;
          while ((cut = buf.indexOf("\n\n")) !== -1) {
            var block = buf.slice(0, cut), evt = "", data = ""; buf = buf.slice(cut + 2);
            block.split("\n").forEach(function (l) { if (l.indexOf("event:") === 0) evt = l.slice(6).trim(); else if (l.indexOf("data:") === 0) data += l.slice(5).trim(); });
            if (!evt || !data || data === "null") continue;
            var obj; try { obj = JSON.parse(data); } catch (e) { continue; }
            if (evt === "mode" && obj.mode && obj.mode !== "live") { onEvent("error", { content: "Agent Studio unavailable" + (obj.reason ? " (" + obj.reason + ")" : "") }); continue; }
            onEvent(evt, obj);
          }
          return pump();
        });
      }
      return pump();
    });
  };

  /* ---------- shell UI ---------- */
  var LOGO = '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="var(--brand)"/><path d="M6 19c3 0 3-2.5 6-2.5S15 19 18 19s3-2.5 6-2.5 2 1 2 1" fill="none" stroke="var(--brand-ink)" stroke-width="2.2" stroke-linecap="round"/><path d="M6 24c3 0 3-2.5 6-2.5S15 24 18 24s3-2.5 6-2.5 2 1 2 1" fill="none" stroke="var(--brand-ink)" stroke-width="2.2" stroke-linecap="round" opacity=".55"/><circle cx="21.5" cy="10.5" r="3.5" fill="var(--sand)"/></svg>';
  var ICONS = {
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>'
  };
  function shell() {
    if (EMBED) document.documentElement.classList.add("br-embed");
    var page = document.body.getAttribute("data-page") || "";
    var top = document.createElement("header"); top.className = "br-top";
    top.innerHTML = '<div class="in">' +
      '<button class="br-icon br-burger" type="button" id="brBurger" aria-label="Menu">' + ICONS.menu + "</button>" +
      '<a class="br-brand" href="index.html' + (EMBED ? "?embed=1" : "") + '">' + LOGO + "<span>Boomi Resorts<small>Guest operations</small></span></a>" +
      '<nav class="br-nav" id="brNav">' + PAGES.map(function (p) {
        return '<a href="' + p.href + (EMBED ? "?embed=1" : "") + '"' + (p.id === page ? ' class="on" aria-current="page"' : "") + ' title="' + BR.esc(p.persona.role) + '">' +
          '<span class="av" style="background:' + p.persona.color + '">' + BR.esc(p.persona.initials) + "</span>" + BR.esc(p.label) + "</a>";
      }).join("") + "</nav>" +
      '<div class="br-tools">' +
      '<button class="br-icon br-device" type="button" id="brDevice" title="Mobile view" aria-label="Mobile view" aria-pressed="false">' + ICONS.phone + "</button>" +
      '<button class="br-icon" type="button" id="brTheme" title="Light / dark" aria-label="Toggle light or dark mode"></button>' +
      '<div class="br-user" id="brUser"></div></div></div>';
    document.body.insertBefore(top, document.body.firstChild);
    var me = PAGES.filter(function (p) { return p.id === page; })[0];
    if (me) {
      var strip = document.createElement("section"); strip.className = "br-persona"; strip.id = "brPersona";
      top.insertAdjacentElement("afterend", strip);
      BR.setPersona(me.persona);
      var onScroll = function () { strip.classList.toggle("compact", window.scrollY > 40); };
      window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
    }
    var nav = BR.$("#brNav");
    BR.$("#brBurger").onclick = function (e) { e.stopPropagation(); nav.classList.toggle("open"); };
    document.addEventListener("click", function () { nav.classList.remove("open"); });
    var themeBtn = BR.$("#brTheme");
    function paintTheme() { themeBtn.innerHTML = currentTheme() === "dark" ? ICONS.sun : ICONS.moon; }
    themeBtn.onclick = function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next); store.set(THEME, next); paintTheme();
      var f = BR.$(".br-phone iframe"); if (f && f.contentDocument) f.contentDocument.documentElement.setAttribute("data-theme", next);
    };
    paintTheme();
    BR.$("#brDevice").onclick = openPhone;
    paintUser();
  }
  /* Show / update the "you are" persona strip. Pages may call it (e.g. guest app when the guest changes):
     BR.setPersona({ name, role, initials, color, does, sees, extra })  - extra = optional short HTML-safe text chips array. */
  BR.setPersona = function (p) {
    var el = BR.$("#brPersona"); if (!el || !p) return;
    var cur = el._p || {}; p = Object.assign({}, cur, p); el._p = p;
    el.style.setProperty("--pc", p.color || "var(--brand)");
    el.innerHTML = '<div class="in"><span class="pav">' + BR.esc(p.initials || "?") + "</span>" +
      '<div class="pt"><div class="pl">You are viewing as</div><div class="pn">' + BR.esc(p.name) + ' <span class="pr">' + BR.esc(p.role) + "</span></div>" +
      '<div class="pd">' + BR.esc(p.does || "") + "</div></div>" +
      (p.sees ? '<div class="ps"><span class="pl">Powered by</span>' + BR.esc(p.sees) + "</div>" : "") +
      ((p.extra || []).length ? '<div class="px">' + p.extra.map(function (x) { return '<span class="pill">' + BR.esc(x) + "</span>"; }).join("") + "</div>" : "") + "</div>";
  };
  function openPhone() {
    var btn = BR.$("#brDevice"); btn.setAttribute("aria-pressed", "true");
    var o = document.createElement("div"); o.className = "br-phone";
    var url = location.pathname + "?" + (function () { var p = new URLSearchParams(location.search); p.set("embed", "1"); return p.toString(); })() + location.hash;
    o.innerHTML = '<button class="btn close" type="button">Close mobile view ✕</button><div class="frame"><iframe title="Mobile view" src="' + BR.esc(url) + '"></iframe></div>';
    document.body.appendChild(o); document.documentElement.classList.add("br-phone-open");
    function close() { o.remove(); document.documentElement.classList.remove("br-phone-open"); btn.setAttribute("aria-pressed", "false"); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    o.querySelector(".close").onclick = close; o.onclick = function (e) { if (e.target === o) close(); };
    document.addEventListener("keydown", onKey);
  }
  function paintUser() {
    var box = BR.$("#brUser"); if (!box) return;
    if (!session) { box.innerHTML = ""; return; }
    box.innerHTML = '<button class="br-chip" type="button" id="brChip" title="Signed in – live Boomi"><span class="dot"></span><span class="nm">' + BR.esc((session.email || "").split("@")[0]) + "</span> ▾</button>" +
      '<div class="br-menu" id="brMenu"><div class="meta">Signed in as ' + BR.esc(session.email) + "<br>Live calls to Boomi via the Supabase edge function.</div>" +
      '<button type="button" id="brReset">↺ Reset demo guests</button><button type="button" id="brOut">Sign out</button></div>';
    var menu = BR.$("#brMenu");
    BR.$("#brChip").onclick = function (e) { e.stopPropagation(); menu.classList.toggle("open"); };
    document.addEventListener("click", function () { menu.classList.remove("open"); });
    BR.$("#brOut").onclick = signOut;
    BR.$("#brReset").onclick = function () {
      var t = BR.toast('<span class="spin"></span> Resetting demo guests on Boomi (5–60 s)…', "", 90000);
      BR.reset().then(function (j) {
        t.remove();
        BR.toast("<b>" + (j.reset ? "Demo reset ✓" : "Reset incomplete") + "</b><br>" + (j.results || []).map(function (x) {
          return BR.esc(x.guest) + " → " + BR.esc(x.room || x.status) + (x.ok ? " ✓" : " ⚠ " + BR.esc(x.detail || x.status));
        }).join("<br>"), j.reset ? "good" : "bad", 12000);
      }).catch(function (e) { t.remove(); BR.toast("<b>Reset failed</b><br>" + BR.esc(e.message), "bad", 10000); });
    };
  }
  function gate() {
    if (BR.$(".br-gate")) return;
    document.body.classList.add("br-locked");
    var g = document.createElement("div"); g.className = "br-gate";
    g.innerHTML = '<form autocomplete="on"><div class="logo">' + LOGO + "<span>Boomi Resorts</span></div>" +
      '<p class="muted small">Sign in to run the live Boomi processes and the Agent Studio concierge.</p>' +
      '<div class="field"><label for="brEmail">Email</label><input class="input" id="brEmail" type="email" autocomplete="username" required></div>' +
      '<div class="field"><label for="brPw">Password</label><input class="input" id="brPw" type="password" autocomplete="current-password" required></div>' +
      '<div class="err" id="brErr"></div><button class="btn pri" type="submit" id="brGo">Sign in</button></form>';
    document.body.appendChild(g);
    setTimeout(function () { var e = BR.$("#brEmail"); if (e) e.focus(); }, 30);
    g.querySelector("form").onsubmit = function (e) {
      e.preventDefault(); var err = BR.$("#brErr"), go = BR.$("#brGo"); err.textContent = ""; go.disabled = true; go.innerHTML = '<span class="spin"></span>';
      authPost("token?grant_type=password", { email: BR.$("#brEmail").value.trim(), password: BR.$("#brPw").value }).then(function (r) {
        if (!r.ok) { err.textContent = (r.j && (r.j.msg || r.j.error_description || r.j.error)) || "Sign-in failed"; go.disabled = false; go.textContent = "Sign in"; return; }
        keep(r.j); g.remove(); document.body.classList.remove("br-locked"); paintUser(); fireReady();
      }).catch(function () { err.textContent = "Could not reach Supabase."; go.disabled = false; go.textContent = "Sign in"; });
    };
  }
  function fireReady() { if (isReady) return; isReady = true; readyFns.forEach(function (f) { try { f(); } catch (e) { console.error(e); } }); }
  /* Run page code once a user is signed in. */
  BR.ready = function (fn) { if (isReady) fn(); else readyFns.push(fn); };

  function boot() {
    shell();
    BR.token().then(function (t) { if (t) { paintUser(); fireReady(); } else gate(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
