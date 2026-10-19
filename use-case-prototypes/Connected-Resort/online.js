/* Connected Resort -- online layer (GitHub Pages + Supabase Edge Function).
 *
 * Loaded after common.js on every page. It replaces the local demo server:
 *   - Supabase email/password sign-in (public sign-up is disabled on the project)
 *   - CR.product / CR.health call the edge function with the user's token
 *   - not signed in, or Boomi slow/unavailable -> the page replays the
 *     recorded live results embedded in mock-bundle.js, and says so
 *   - "Reset demo" checks the three demo guests back in (live)
 * No Boomi credential ever reaches the browser; config.js holds only the
 * public project URL and anon key.
 */
(function () {
  "use strict";
  var C = window.CR_CONFIG || {}, KEY = "cr_online_session", mem = null;

  function load() { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return mem; } }
  function save(s) { mem = s; try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch (e) {} }
  var session = load();
  if (session && session.refreshBy && session.refreshBy < Date.now() - 7 * 864e5) { session = null; save(null); }

  function authPost(path, body) {
    return fetch(C.supabaseUrl + "/auth/v1/" + path, { method: "POST", headers: { apikey: C.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify(body) }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); });
  }
  function keep(j) {
    session = { access: j.access_token, refresh: j.refresh_token, email: (j.user && j.user.email) || (session && session.email),
      expiresAt: Date.now() + (j.expires_in || 3600) * 1000, refreshBy: Date.now() };
    save(session);
  }
  /* A valid access token, refreshing it when it is about to expire. */
  function token() {
    if (!session) return Promise.resolve(null);
    if (session.expiresAt - Date.now() > 60000) return Promise.resolve(session.access);
    return authPost("token?grant_type=refresh_token", { refresh_token: session.refresh }).then(function (r) {
      if (!r.ok) { session = null; save(null); return null; }
      keep(r.j); return session.access;
    }).catch(function () { return session && session.access; });
  }

  CR.online = true;
  CR.live = function () { return !!session; };
  CR.apiUrl = function (path) { return C.functionUrl + path; };
  CR.authHeaders = function (h) {
    var o = Object.assign({ apikey: C.anonKey }, h || {});
    if (session) o.Authorization = "Bearer " + session.access;
    return o;
  };
  /* index.html's chat calls fetch() directly; make sure its token is fresh first. */
  var nativeFetch = window.fetch.bind(window);
  window.fetch = function (url, opts) {
    if (typeof url === "string" && url.indexOf(C.functionUrl) === 0 && session) {
      return token().then(function (t) {
        opts = opts || {}; opts.headers = Object.assign({}, opts.headers || {}, t ? { Authorization: "Bearer " + t } : {});
        return nativeFetch(url, opts);
      });
    }
    return nativeFetch(url, opts);
  };

  function replay(kind, payload, reason, t0) {
    var d = CR.embedded(kind, payload);
    d._fallbackReason = reason;
    return { data: d, ms: Math.round(performance.now() - t0) };
  }
  CR.product = function (kind, payload) {
    var t0 = performance.now();
    if (!session) return Promise.resolve(replay(kind, payload, "not signed in - sign in for live Boomi", t0));
    return token().then(function (t) {
      if (!t) return replay(kind, payload, "session expired - sign in again", t0);
      return fetch(CR.apiUrl(CR.ENDPOINTS[kind].facade), { method: "POST", headers: CR.authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload) }).then(function (r) {
        if (r.status === 401) { session = null; save(null); paint(); return replay(kind, payload, "session expired - sign in again", t0); }
        return r.json().then(function (d) {
          if (d && d._unavailable) return replay(kind, payload, d._fallbackReason || "Boomi unavailable", t0);
          return { data: d, ms: Math.round(performance.now() - t0) };
        });
      });
    }).catch(function (e) { return replay(kind, payload, "edge function unreachable (" + (e && e.message || e) + ")", t0); });
  };
  CR.health = function () {
    if (!session) return Promise.resolve(null);
    return token().then(function (t) {
      return t ? fetch(CR.apiUrl("/health"), { headers: CR.authHeaders() }).then(function (r) { return r.ok ? r.json() : null; }) : null;
    }).catch(function () { return null; });
  };

  /* ------------------------------------------------------------ UI */
  var css = document.createElement("style");
  css.textContent =
    ".cr-auth{display:inline-flex;align-items:center;gap:6px;position:relative}" +
    ".cr-auth .who{font:600 11.5px var(--sans,system-ui);letter-spacing:.03em;text-transform:uppercase;padding:3px 9px;border-radius:999px;" +
    "border:1px solid var(--good,#2e9e6a);color:var(--good,#2e9e6a);background:var(--good-soft,transparent);white-space:nowrap;cursor:pointer}" +
    ".cr-menu{position:absolute;right:0;top:calc(100% + 8px);min-width:230px;background:var(--panel,#162130);color:var(--ink,#e6edf3);" +
    "border:1px solid var(--line,#2a3a4d);border-radius:10px;box-shadow:0 12px 30px rgba(0,0,0,.35);padding:8px;z-index:60;display:none}" +
    ".cr-menu.open{display:block}.cr-menu button{display:block;width:100%;text-align:left;background:none;border:0;color:inherit;" +
    "font:13px var(--sans,system-ui);padding:8px 10px;border-radius:7px;cursor:pointer}.cr-menu button:hover{background:rgba(127,127,127,.15)}" +
    ".cr-menu .meta{font:12px var(--sans,system-ui);color:var(--muted,#8b98a8);padding:4px 10px 8px;border-bottom:1px solid var(--line,#2a3a4d);margin-bottom:6px}" +
    ".cr-ovl{position:fixed;inset:0;background:rgba(5,10,18,.6);display:flex;align-items:center;justify-content:center;z-index:80;padding:16px}" +
    ".cr-dlg{width:100%;max-width:380px;background:var(--panel,#162130);color:var(--ink,#e6edf3);border:1px solid var(--line,#2a3a4d);" +
    "border-radius:14px;padding:22px;box-shadow:0 20px 50px rgba(0,0,0,.45);font-family:var(--sans,system-ui)}" +
    ".cr-dlg h3{margin:0 0 4px;font:600 20px var(--serif,Georgia)}.cr-dlg p{margin:0 0 14px;color:var(--muted,#8b98a8);font-size:13.5px;line-height:1.45}" +
    ".cr-dlg label{display:block;font-size:12px;color:var(--muted,#8b98a8);margin:10px 0 4px}" +
    ".cr-dlg input{width:100%;box-sizing:border-box;padding:9px 11px;border-radius:8px;border:1px solid var(--line,#2a3a4d);" +
    "background:var(--bg,#0d1520);color:inherit;font:14px var(--sans,system-ui)}" +
    ".cr-dlg .row{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}" +
    ".cr-dlg .row button{padding:8px 14px;border-radius:8px;font:600 13.5px var(--sans,system-ui);cursor:pointer;border:1px solid var(--line,#2a3a4d);background:none;color:inherit}" +
    ".cr-dlg .row button.pri{background:var(--accent,#3aa8c9);border-color:var(--accent,#3aa8c9);color:var(--accent-ink,#06181c)}" +
    ".cr-dlg .err{color:var(--bad,#e5675b);font-size:13px;min-height:18px;margin-top:8px}" +
    ".cr-toast{position:fixed;right:16px;bottom:16px;max-width:420px;background:var(--panel,#162130);color:var(--ink,#e6edf3);" +
    "border:1px solid var(--line,#2a3a4d);border-left:4px solid var(--accent,#3aa8c9);border-radius:10px;padding:12px 14px;z-index:90;" +
    "font:13px/1.45 var(--sans,system-ui);box-shadow:0 12px 30px rgba(0,0,0,.35)}";
  document.head.appendChild(css);

  var wrap = document.createElement("span");
  wrap.className = "cr-auth";
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function toast(html, ms) {
    var t = document.createElement("div"); t.className = "cr-toast"; t.innerHTML = html; document.body.appendChild(t);
    if (ms) setTimeout(function () { t.remove(); }, ms);
    t.addEventListener("click", function () { t.remove(); });
    return t;
  }
  function paint() {
    if (!session) {
      wrap.innerHTML = '<button class="iconbtn" type="button" id="crSignIn" title="Sign in to drive the live Boomi processes and agent">Sign in for live</button>';
      wrap.querySelector("#crSignIn").onclick = openLogin;
      return;
    }
    wrap.innerHTML = '<span class="who" id="crWho" title="Signed in - live Boomi">● live · ' + esc((session.email || "").split("@")[0]) + " ▾</span>" +
      '<div class="cr-menu" id="crMenu"><div class="meta">Signed in as ' + esc(session.email) + "<br>Calls go to Boomi through the Supabase edge function.</div>" +
      '<button type="button" id="crReset">↺ Reset demo (check the 3 guests back in)</button>' +
      '<button type="button" id="crOut">Sign out</button></div>';
    var menu = wrap.querySelector("#crMenu");
    wrap.querySelector("#crWho").onclick = function (e) { e.stopPropagation(); menu.classList.toggle("open"); };
    document.addEventListener("click", function () { menu.classList.remove("open"); });
    wrap.querySelector("#crOut").onclick = function () { session = null; save(null); location.reload(); };
    wrap.querySelector("#crReset").onclick = resetDemo;
  }
  function openLogin() {
    var o = document.createElement("div"); o.className = "cr-ovl";
    o.innerHTML = '<form class="cr-dlg" autocomplete="on"><h3>Sign in for the live demo</h3>' +
      "<p>Signed in, every check-in, check-out, data product and agent question runs on the live Boomi processes, Data Hub and Agent Studio. " +
      "Without signing in the pages replay recorded results.</p>" +
      '<label for="crEmail">Email</label><input id="crEmail" type="email" autocomplete="username" required>' +
      '<label for="crPw">Password</label><input id="crPw" type="password" autocomplete="current-password" required>' +
      '<div class="err" id="crErr"></div><div class="row"><button type="button" id="crCancel">Cancel</button>' +
      '<button type="submit" class="pri" id="crGo">Sign in</button></div></form>';
    document.body.appendChild(o);
    var f = o.querySelector("form"), err = o.querySelector("#crErr");
    o.querySelector("#crEmail").focus();
    o.querySelector("#crCancel").onclick = function () { o.remove(); };
    o.addEventListener("click", function (e) { if (e.target === o) o.remove(); });
    f.onsubmit = function (e) {
      e.preventDefault(); err.textContent = ""; o.querySelector("#crGo").disabled = true;
      authPost("token?grant_type=password", { email: o.querySelector("#crEmail").value.trim(), password: o.querySelector("#crPw").value })
        .then(function (r) {
          if (!r.ok) { err.textContent = (r.j && (r.j.msg || r.j.error_description)) || "Sign-in failed"; o.querySelector("#crGo").disabled = false; return; }
          keep(r.j); location.reload();
        }).catch(function () { err.textContent = "Could not reach Supabase. Check your connection."; o.querySelector("#crGo").disabled = false; });
    };
  }
  function resetDemo() {
    var t = toast("<strong>Resetting the demo…</strong><br>Checking Elena, Marcus, Sophia and Wei Chen back in on the live Boomi process (5-60 s).");
    token().then(function (tk) {
      return fetch(CR.apiUrl("/api/reset"), { method: "POST", headers: CR.authHeaders({ "Content-Type": "application/json", Authorization: "Bearer " + tk }), body: "{}" });
    }).then(function (r) { return r.json(); }).then(function (j) {
      t.remove();
      toast("<strong>" + (j.reset ? "Demo reset ✓" : "Reset incomplete") + "</strong><br>" +
        (j.results || []).map(function (x) { return esc(x.guest) + " → " + esc(x.room || x.status) + (x.ok ? " ✓" : " ⚠ " + esc(x.detail || x.status)); }).join("<br>") +
        "<br><span style='opacity:.7'>" + Math.round((j.latencyMs || 0) / 1000) + " s</span>", 12000);
    }).catch(function (e) { t.remove(); toast("<strong>Reset failed</strong><br>" + esc(e.message || e), 10000); });
  }

  function mount() {
    var slot = document.getElementById("crAuthSlot");   /* app-style pages (guest app, concierge desk) */
    if (slot) { slot.appendChild(wrap); paint(); return; }
    var nav = document.querySelector(".topbar nav");
    if (!nav) return;
    var theme = nav.querySelector("#theme");
    nav.insertBefore(wrap, theme || null);
    paint();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
