// Shared helpers for portal + staff pages
(function () {
  const C = window.APP_CONFIG;
  const configured = C && !C.SUPABASE_URL.includes("YOUR-PROJECT") && !C.SUPABASE_ANON_KEY.includes("YOUR-");
  window.CONFIGURED = configured;
  window.sb = configured && window.supabase
    ? window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true }
      })
    : null;

  window.$ = (s, r = document) => r.querySelector(s);
  window.$$ = (s, r = document) => [...r.querySelectorAll(s)];

  window.esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // newline → <br>, URLs → links (after escaping)
  window.rich = (v) => esc(v)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .replace(/\n/g, "<br>");

  window.DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  window.fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-PH",
    { month: "short", day: "numeric", year: "numeric" }) : "";
  window.fmtDateTime = (d) => d ? new Date(d).toLocaleString("en-PH",
    { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";
  window.fmtTime = (d) => d ? new Date(d).toLocaleTimeString("en-PH",
    { hour: "numeric", minute: "2-digit" }) : "";
  window.timeAgo = (d) => {
    const s = (Date.now() - new Date(d)) / 1000;
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s / 60) + " min ago";
    if (s < 86400) return Math.floor(s / 3600) + " hr ago";
    if (s < 604800) return Math.floor(s / 86400) + " day(s) ago";
    return fmtDate(d);
  };

  // "09171234567" → "09171234567@babakshc.app"; emails pass through
  window.toLoginEmail = (id) => {
    id = String(id || "").trim().toLowerCase();
    if (id.includes("@")) return id;
    let digits = id.replace(/\D/g, "");
    if (digits.startsWith("63")) digits = "0" + digits.slice(2);
    if (digits.length === 10 && digits.startsWith("9")) digits = "0" + digits;
    return digits + "@" + C.PHONE_EMAIL_DOMAIN;
  };
  window.isPhoneLogin = (id) => !String(id || "").includes("@");

  window.toast = (msg, type = "ok") => {
    let t = $("#toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
    t.textContent = msg;
    t.className = "show " + type;
    clearTimeout(t._h);
    t._h = setTimeout(() => (t.className = ""), 3200);
  };

  window.friendlyError = (e) => {
    const m = (e && (e.message || e.error_description)) || String(e);
    if (/Invalid login/i.test(m)) return "Wrong mobile number/email or password.";
    if (/already registered/i.test(m)) return "That mobile number/email already has an account. Please log in.";
    if (/Email not confirmed/i.test(m)) return "Account not yet confirmed. Please contact the health center.";
    if (/Password should be/i.test(m)) return "Password must be at least 6 characters.";
    if (/Failed to fetch|NetworkError/i.test(m)) return "No internet connection. Please try again.";
    return m;
  };

  window.STATUS_LABEL = {
    pending: "Waiting for doctor", accepted: "Accepted",
    completed: "Completed", cancelled: "Cancelled"
  };

  window.modal = (html, onMount) => {
    const wrap = document.createElement("div");
    wrap.className = "modal-wrap";
    wrap.innerHTML = `<div class="modal" role="dialog"><button class="modal-x" aria-label="Close">✕</button>${html}</div>`;
    document.body.appendChild(wrap);
    const close = () => { wrap.remove(); if (wrap._onClose) wrap._onClose(); };
    wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
    $(".modal-x", wrap).onclick = close;
    wrap.close = close;
    if (onMount) onMount(wrap);
    return wrap;
  };

  // Register service worker (PWA install / offline shell)
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();
