/* Boomi Resources -- sign-in gate (loaded in <head> of every page, after config.js).
 * The page stays hidden until there is a valid Supabase session. It uses the same session that online.js uses for
 * live mode ("br_online_session"), so one sign-in unlocks both. Sessions are refreshed with the refresh token;
 * a failed refresh shows the sign-in screen again. Public sign-up is disabled on the project.
 * Note: this is a front-end gate for a static demo; the live Boomi calls are separately protected by the edge function. */
(function () {
  "use strict";
  var C = window.BR_CONFIG || {}, KEY = "br_online_session";
  var root = document.documentElement;
  root.classList.add("br-locked");
  var css = document.createElement("style");
  css.textContent =
    "html.br-locked body > *:not(#br-gate){visibility:hidden!important}" +
    "#br-gate{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;" +
    "background:linear-gradient(160deg,#0f2a3f 0%,#173f5f 55%,#c8771e 160%);font-family:'IBM Plex Sans',system-ui,sans-serif;padding:16px}" +
    "#br-gate .card{width:min(380px,100%);background:#fff;border-radius:14px;padding:26px 24px;box-shadow:0 24px 60px rgba(0,0,0,.35);border-top:5px solid #f0a020}" +
    "#br-gate h1{margin:0 0 4px;font-size:21px;color:#0f2a3f}#br-gate p{margin:0 0 16px;color:#5b6773;font-size:13.5px;line-height:1.45}" +
    "#br-gate label{display:block;font-size:12px;font-weight:600;color:#33414d;margin:10px 0 4px}" +
    "#br-gate input{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #cfd6dc;border-radius:8px;font:inherit;font-size:14px;background:#fff!important;color:#14212b!important;color-scheme:light}" +
    "#br-gate input:focus{outline:2px solid #f0a020;outline-offset:1px;border-color:#f0a020}" +
    "#br-gate button{width:100%;margin-top:16px;padding:11px;border:0;border-radius:8px;background:#173f5f;color:#fff;font:inherit;font-weight:600;cursor:pointer}" +
    "#br-gate button:disabled{opacity:.6}#br-gate .err{color:#b42318;font-size:13px;min-height:18px;margin-top:8px}" +
    "#br-gate .foot{margin-top:14px;font-size:11.5px;color:#8a96a1;text-align:center}";
  (document.head || root).appendChild(css);

  function load() { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; } }
  function save(s) { try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch (e) {} }
  function keep(j, prev) {
    save({ access: j.access_token, refresh: j.refresh_token, email: (j.user && j.user.email) || (prev && prev.email),
      expiresAt: Date.now() + (j.expires_in || 3600) * 1000, refreshBy: Date.now() });
  }
  function authPost(path, body) {
    return fetch(C.supabaseUrl + "/auth/v1/" + path, { method: "POST", headers: { apikey: C.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify(body) }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); });
  }
  function unlock() { root.classList.remove("br-locked"); var g = document.getElementById("br-gate"); if (g) g.remove(); }

  function showGate() {
    var mount = function () {
      if (document.getElementById("br-gate")) return;
      var g = document.createElement("div");
      g.id = "br-gate";
      g.innerHTML = '<form class="card" autocomplete="on"><h1>Boomi Resources</h1>' +
        '<p>Sign in to open the mine-operations demo. Demo accounts only; ask your Boomi SE for access.</p>' +
        '<label for="brg-email">Email</label><input id="brg-email" type="email" autocomplete="username" required>' +
        '<label for="brg-pw">Password</label><input id="brg-pw" type="password" autocomplete="current-password" required>' +
        '<button type="submit">Sign in</button><div class="err" role="alert"></div>' +
        '<div class="foot">Secured by Supabase Auth · synthetic demo data</div></form>';
      document.body.appendChild(g);
      var f = g.querySelector("form"), btn = g.querySelector("button"), err = g.querySelector(".err");
      setTimeout(function () { g.querySelector("#brg-email").focus(); }, 30);
      f.addEventListener("submit", function (e) {
        e.preventDefault(); err.textContent = ""; btn.disabled = true; btn.textContent = "Signing in…";
        authPost("token?grant_type=password", { email: g.querySelector("#brg-email").value.trim(), password: g.querySelector("#brg-pw").value })
          .then(function (r) {
            if (!r.ok) { err.textContent = (r.j && (r.j.msg || r.j.error_description || r.j.message)) || "Sign-in failed"; btn.disabled = false; btn.textContent = "Sign in"; return; }
            keep(r.j); location.reload();   // reload so online.js starts in live mode with the new session
          })
          .catch(function () { err.textContent = "Could not reach Supabase. Check your connection."; btn.disabled = false; btn.textContent = "Sign in"; });
      });
    };
    if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);
  }

  var s = load();
  if (!C.supabaseUrl || !C.anonKey) { console.warn("auth-gate: BR_CONFIG missing"); showGate(); return; }
  if (!s || !s.refresh || (s.refreshBy && s.refreshBy < Date.now() - 7 * 864e5)) { save(null); showGate(); return; }
  if (s.expiresAt - Date.now() > 60000) { unlock(); return; }
  authPost("token?grant_type=refresh_token", { refresh_token: s.refresh })
    .then(function (r) { if (r.ok) { keep(r.j, s); unlock(); } else { save(null); showGate(); } })
    .catch(function () { showGate(); });
})();
