// =============== Babak SHC — Patient Portal ===============
const S = { user: null, profile: null, view: "home", day: new Date().getDay(), channel: null };
const C = window.APP_CONFIG;
const view = () => $("#view");
const isApp = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

$("#centerName").textContent = C.CENTER_NAME;
setTimeout(() => $("#splash").classList.add("gone"), 1300);

if (!window.CONFIGURED) {
  $("#nav").classList.add("hidden");
  view().innerHTML = `<div class="setup card">
    <h2>⚙️ Setup needed</h2>
    <p class="muted" style="margin:8px 0 12px">Open <code>js/config.js</code> and paste your Supabase
    <b>Project URL</b> and <b>anon public key</b> (Supabase → Project Settings → API).
    Then run <code>supabase/schema.sql</code> in the Supabase SQL Editor.</p>
    <p class="small muted">See README.md for the full step-by-step guide.</p></div>`;
} else {
  init();
}

async function init() {
  $$("#nav button").forEach((b) => (b.onclick = () => go(b.dataset.v)));
  const { data } = await sb.auth.getSession();
  await setUser(data.session?.user || null);
  sb.auth.onAuthStateChange(async (_e, session) => {
    const id = session?.user?.id || null;
    if (id !== (S.user?.id || null)) { await setUser(session?.user || null); render(); }
  });
  const hash = location.hash.replace("#", "");
  go(["home", "schedule", "consult", "ask", "me"].includes(hash) ? hash : "home");
  liveUpdates();
  startAutoRefresh(autoRefresh, 30);
}

async function setUser(user) {
  S.user = user;
  S.profile = null;
  if (user) {
    const { data } = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
    S.profile = data;
  }
  $("#staffLink").classList.toggle("hidden", !["staff", "doctor", "admin"].includes(S.profile?.role));
  refreshBadge();
}

function go(v) {
  S.view = v;
  history.replaceState(null, "", "#" + v);
  $$("#nav button").forEach((b) => b.classList.toggle("on", b.dataset.v === v));
  render();
  window.scrollTo(0, 0);
}

function render() {
  ({ home, schedule, consult, ask, me })[S.view]();
}

function liveUpdates() {
  sb.channel("public-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, () => S.view === "home" && home())
    .on("postgres_changes", { event: "*", schema: "public", table: "center_status" }, () => S.view === "home" && home())
    .on("postgres_changes", { event: "*", schema: "public", table: "consultations" }, () => {
      refreshBadge(); if (S.view === "consult") consult();
    })
    .subscribe();
}

async function refreshBadge() {
  const b = $("#consultBadge");
  if (!S.user) return b.classList.add("hidden");
  const { count } = await sb.from("consultations").select("id", { count: "exact", head: true })
    .eq("patient_id", S.user.id).eq("status", "accepted");
  b.textContent = count || "";
  b.classList.toggle("hidden", !count);
}

const loading = () => { if (!S._silent) view().innerHTML = `<div class="empty"><span class="big">⏳</span>Loading…</div>`; };

// Auto refresh: Home, Schedule, Consult refresh every 30 s and when the app is reopened.
// Questions refreshes only if nothing is typed; Account never (it's a form).
async function autoRefresh() {
  const v = S.view;
  if (v === "me") return;
  if (v === "ask" && [...$$("#view textarea, #view input")].some((el) => el.value.trim())) return;
  const y = window.scrollY;
  S._silent = true;
  try { await ({ home, schedule, consult, ask })[v](); } finally { S._silent = false; }
  refreshBadge();
  window.scrollTo(0, y);
}

// ------------------------------------------------------------ HOME
async function home() {
  if (S._lastView !== "home") loading();
  S._lastView = "home";
  const [st, an] = await Promise.all([
    sb.from("center_status").select("*").eq("id", 1).maybeSingle(),
    sb.from("announcements").select("*").eq("published", true)
      .order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(30)
  ]);
  if (S.view !== "home") return;
  const s = st.data || { doctor_in: true };
  const first = S.profile?.full_name?.split(" ")[0];
  view().innerHTML = `
    <div class="page-head"><h2>${first ? "Hello, " + esc(first) + "! 👋" : "Welcome! 👋"}</h2></div>
    <div class="status ${s.doctor_in ? "in" : "out"}">
      <span class="dot"></span>
      <div class="grow">
        <b>${s.doctor_in ? "A doctor is at the center today" : "No doctor at the center today"}</b>
        <span class="small">${s.message ? esc(s.message) : (s.doctor_in ? "Walk-in consultations are open." : "Please check back or request an online consultation.")}</span>
        ${s.updated_at ? `<div class="small muted">Updated ${timeAgo(s.updated_at)}</div>` : ""}
      </div>
    </div>
    <div class="tiles">
      <button class="tile" onclick="go('consult')"><span class="ic">🩺</span><b>Online Consult</b><span>Talk to our doctor</span></button>
      <button class="tile" onclick="go('schedule')"><span class="ic">📅</span><b>Schedule</b><span>Services by day</span></button>
      <button class="tile" onclick="go('ask')"><span class="ic">💬</span><b>Ask a Question</b><span>We'll answer you</span></button>
      ${!isApp && C.APK_URL
        ? `<a class="tile" href="${esc(C.APK_URL)}" style="text-decoration:none;color:inherit"><span class="ic">📲</span><b>Android App</b><span>Download & install</span></a>`
        : `<button class="tile" onclick="go('me')"><span class="ic">👤</span><b>My Account</b><span>${S.user ? "Profile & logout" : "Log in / Register"}</span></button>`}
    </div>
    <div class="section-title">📢 Announcements</div>
    ${(an.data || []).length ? an.data.map(annCard).join("") :
      `<div class="card empty"><span class="big">📭</span>No announcements yet.</div>`}
    ${C.CENTER_ADDRESS || C.CENTER_PHONE ? `<p class="small muted" style="text-align:center;margin-top:18px">
      📍 ${esc(C.CENTER_ADDRESS)}${C.CENTER_PHONE ? " · ☎ " + esc(C.CENTER_PHONE) : ""}</p>` : ""}`;
}

function annCard(a) {
  return `<div class="card ann ${a.pinned ? "pinned" : ""}">
    <div class="meta">
      ${a.pinned ? `<span class="chip gold">📌 Pinned</span>` : ""}
      <span class="chip">${esc(a.category)}</span>
      <span class="small muted">${timeAgo(a.created_at)}</span>
    </div>
    <h3>${esc(a.title)}</h3>
    <div class="body">${rich(a.body)}</div>
  </div>`;
}

// ------------------------------------------------------------ SCHEDULE
async function schedule() {
  S._lastView = "schedule";
  loading();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await sb.from("schedules").select("*").order("title");
  if (S.view !== "schedule") return;
  if (error) return (view().innerHTML = `<div class="card notice red">${esc(friendlyError(error))}</div>`);
  const weekly = data.filter((x) => x.day_of_week !== null && !x.event_date);
  const special = data.filter((x) => x.event_date && x.event_date >= today)
    .sort((a, b) => a.event_date.localeCompare(b.event_date));
  const todayIdx = new Date().getDay();

  const drawDay = () => {
    const items = weekly.filter((x) => x.day_of_week === S.day);
    $("#dayList").innerHTML = items.length ? items.map((x) => schedCard(x)).join("") :
      `<div class="card empty"><span class="big">🗓️</span>No regular services on ${DAYS[S.day]}.</div>`;
    $$(".day-tabs button").forEach((b) => b.classList.toggle("on", +b.dataset.d === S.day));
  };

  view().innerHTML = `
    <div class="page-head"><h2>Clinic Schedule</h2></div>
    <div class="day-tabs">${DAYS.map((d, i) =>
      `<button data-d="${i}" class="${i === todayIdx ? "today" : ""}">${d.slice(0, 3)}${i === todayIdx ? " •" : ""}</button>`).join("")}</div>
    <div id="dayList"></div>
    <div class="section-title">⭐ Special dates</div>
    ${special.length ? special.map((x) => schedCard(x, true)).join("") :
      `<div class="card empty small">No special activities scheduled.</div>`}`;
  $$(".day-tabs button").forEach((b) => (b.onclick = () => { S.day = +b.dataset.d; drawDay(); }));
  drawDay();
}

function schedCard(x, withDate) {
  return `<div class="card sched ${x.no_doctor ? "nodoc" : ""}">
    ${withDate ? `<div class="time">${fmtDate(x.event_date + "T00:00")}</div>` : ""}
    <div class="grow">
      <div class="row" style="justify-content:space-between;align-items:flex-start;gap:8px">
        <h4>${esc(x.title)}</h4>
        ${x.no_doctor ? `<span class="chip red" style="flex:none">🔴 Not Available</span>` : `<span class="chip" style="flex:none">🟢 Available</span>`}
      </div>
      ${x.staff ? `<div class="small muted">👩‍⚕️ ${esc(x.staff)}</div>` : ""}
      ${x.no_doctor && x.notes ? `<div class="remarks"><b>Remarks:</b> ${rich(x.notes)}</div>` : ""}
    </div></div>`;
}

// ------------------------------------------------------------ CONSULT
async function consult() {
  S._lastView = "consult";
  if (!S.user) {
    view().innerHTML = `
      <div class="page-head"><h2>Online Consultation</h2></div>
      <div class="card" style="text-align:center">
        <div style="font-size:46px">🩺</div>
        <h3 style="margin:6px 0">Talk to a doctor online</h3>
        <p class="muted small" style="margin-bottom:14px">Log in or create a free account to request an online consultation
        and chat with our doctors.</p>
        <button class="btn block" onclick="go('me')">Log in / Register</button>
      </div>
      <div class="notice red">🚨 <b>For emergencies</b> (difficulty breathing, chest pain, heavy bleeding, seizures),
      go directly to the nearest hospital or call <b>911</b>. Do not wait for an online reply.</div>`;
    return;
  }
  loading();
  const { data, error } = await sb.from("consultations").select("*")
    .eq("patient_id", S.user.id).order("created_at", { ascending: false });
  if (S.view !== "consult") return;
  if (error) return (view().innerHTML = `<div class="card notice red">${esc(friendlyError(error))}</div>`);
  view().innerHTML = `
    <div class="page-head"><h2>Online Consultation</h2>
      <button class="btn sm" onclick="newConsult()">＋ Request</button></div>
    <div class="notice red" style="margin-bottom:12px">🚨 For emergencies, go to the nearest hospital or call <b>911</b>.</div>
    ${data.length ? data.map((c) => `
      <div class="card consult" onclick="openConsult(${c.id})">
        <div class="top">
          <div><h4>${esc(c.concern.length > 70 ? c.concern.slice(0, 70) + "…" : c.concern)}</h4>
          <div class="small muted">Requested ${fmtDate(c.created_at)}${c.doctor_name ? " · " + esc(c.doctor_name) : ""}</div></div>
          <span class="chip st-${c.status}">${STATUS_LABEL[c.status]}</span>
        </div>
        ${c.doctor_available === true && c.status === "accepted" ? `<div style="margin-top:8px"><span class="chip">🟢 Doctor available</span></div>` : ""}
        ${c.doctor_available === false && ["pending", "accepted"].includes(c.status) ? `<div style="margin-top:8px"><span class="chip red">🔴 Doctor not available</span></div>` : ""}
      </div>`).join("") :
      `<div class="card empty"><span class="big">🩺</span>No consultations yet.<br>
       <button class="btn" style="margin-top:12px" onclick="newConsult()">Request a consultation</button></div>`}`;
}

function ageFrom(bd) {
  if (!bd) return "";
  const b = new Date(bd), n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--;
  return a;
}

window.newConsult = function () {
  const p = S.profile || {};
  modal(`
    <h3>Request Online Consultation</h3>
    <p class="small muted">A doctor will review your request and reply here.</p>
    <form id="cForm">
      <label>Patient name *</label>
      <input class="field" name="patient_name" required value="${esc(p.full_name || "")}">
      <div class="grid2">
        <div><label>Age</label><input class="field" name="age" type="number" min="0" max="130" value="${ageFrom(p.birthdate)}"></div>
        <div><label>Sex</label><select class="field" name="sex">
          <option value="">—</option>${["Male", "Female"].map((x) => `<option ${p.sex === x ? "selected" : ""}>${x}</option>`).join("")}
        </select></div>
      </div>
      <label>Contact number</label>
      <input class="field" name="contact" inputmode="tel" value="${esc(p.phone || "")}">
      <label>What is your concern? *</label>
      <textarea class="field" name="concern" required placeholder="Describe your symptoms or concern…"></textarea>
      <label>Since when?</label>
      <input class="field" name="symptoms_since" placeholder="e.g. 3 days ago">
      <label>Preferred date</label><input class="field" type="date" name="preferred_date" min="${new Date().toISOString().slice(0, 10)}">
      <label class="check"><input type="checkbox" required> I agree that my information will be used by Babak SHC staff for my consultation only.</label>
      <button class="btn block" style="margin-top:16px">Send Request</button>
    </form>`, (w) => {
    $("#cForm", w).onsubmit = async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      const btn = $("button.btn", e.target); btn.disabled = true; btn.textContent = "Sending…";
      const row = {
        patient_id: S.user.id, patient_name: f.patient_name.trim(),
        age: f.age ? +f.age : null, sex: f.sex || null, contact: f.contact || null,
        concern: f.concern.trim(), symptoms_since: f.symptoms_since || null,
        preferred_date: f.preferred_date || null
      };
      const { error } = await sb.from("consultations").insert(row);
      if (error) { btn.disabled = false; btn.textContent = "Send Request"; return toast(friendlyError(error), "err"); }
      w.close(); toast("Request sent! Please wait for the doctor's reply."); consult();
    };
  });
};

window.openConsult = async function (id) {
  const { data: c } = await sb.from("consultations").select("*").eq("id", id).single();
  if (!c) return;
  const canChat = ["pending", "accepted"].includes(c.status);
  const w = modal(`
    <h3>Consultation #${c.id}</h3>
    <div class="row wrap" style="margin:6px 0 10px"><span class="chip st-${c.status}">${STATUS_LABEL[c.status]}</span>
      ${c.doctor_name ? `<span class="small muted">👨‍⚕️ ${esc(c.doctor_name)}</span>` : ""}</div>
    <div class="card" style="background:#f7faf9">
      <div class="small muted">Your concern</div><div>${rich(c.concern)}</div>
      ${c.symptoms_since ? `<div class="small muted" style="margin-top:6px">Since: ${esc(c.symptoms_since)}</div>` : ""}
    </div>
    ${c.doctor_available === true ? `<div class="status in" style="padding:12px 14px"><span class="dot"></span><b style="font-size:15px">Doctor is available for your consultation</b></div>` : ""}
    ${c.doctor_available === false ? `<div class="status out" style="padding:12px 14px;align-items:flex-start"><span class="dot" style="margin-top:4px"></span><div><b style="font-size:15px">Doctor is not available</b>
      ${c.availability_remarks ? `<div class="small" style="margin-top:2px"><span style="font-weight:700">Remarks:</span> ${rich(c.availability_remarks)}</div>` : ""}</div></div>` : ""}
    ${c.doctor_notes ? `<div class="card"><div class="small muted">Doctor's advice</div><div>${rich(c.doctor_notes)}</div></div>` : ""}
    <div class="section-title" style="margin-top:8px">Messages</div>
    <div class="chat" style="height:min(46vh,420px)">
      <div class="chat-log" id="log"><div class="empty small">Loading…</div></div>
      ${canChat ? `<form class="chat-send" id="sendF"><textarea class="field" placeholder="Type a message…" required></textarea>
        <button class="btn">Send</button></form>` : `<p class="small muted" style="text-align:center;padding:8px">This consultation is closed.</p>`}
    </div>
    ${c.status === "pending" ? `<button class="btn ghost block" id="cancelC" style="margin-top:12px">Cancel request</button>` : ""}`);
  bindChat(w, c, false);
  const cc = $("#cancelC", w);
  if (cc) cc.onclick = async () => {
    if (!confirm("Cancel this consultation request?")) return;
    await sb.from("consultations").update({ status: "cancelled" }).eq("id", c.id);
    w.close(); consult();
  };
};

// Shared chat binding (also used logic-wise by admin)
async function bindChat(w, c) {
  const log = $("#log", w);
  const draw = (msgs) => {
    log.innerHTML = msgs.length ? msgs.map((m) => `
      <div class="bubble ${m.sender_id === S.user.id ? "me" : "them"}">
        ${m.sender_id !== S.user.id ? `<span class="n">${esc(m.sender_name || (m.is_staff ? "Doctor" : "Patient"))}</span>` : ""}
        ${rich(m.body)}<span class="t">${fmtDateTime(m.created_at)}</span></div>`).join("")
      : `<div class="empty small">No messages yet. You can add more details for the doctor here.</div>`;
    log.scrollTop = log.scrollHeight;
  };
  let msgs = [];
  const load = async () => {
    const { data } = await sb.from("consult_messages").select("*").eq("consultation_id", c.id).order("created_at");
    msgs = data || []; draw(msgs);
  };
  await load();
  const ch = sb.channel("chat-" + c.id + "-" + Date.now())
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "consult_messages", filter: "consultation_id=eq." + c.id },
      (p) => { if (!msgs.find((m) => m.id === p.new.id)) { msgs.push(p.new); draw(msgs); } })
    .subscribe();
  w._onClose = () => sb.removeChannel(ch);
  const f = $("#sendF", w);
  if (f) {
    const ta = $("textarea", f);
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && innerWidth > 700) { e.preventDefault(); f.requestSubmit(); } });
    f.onsubmit = async (e) => {
      e.preventDefault();
      const body = ta.value.trim(); if (!body) return;
      ta.value = "";
      const { data, error } = await sb.from("consult_messages").insert({
        consultation_id: c.id, sender_id: S.user.id, body,
        sender_name: S.profile?.full_name || "Patient"
      }).select().single();
      if (error) { ta.value = body; return toast(friendlyError(error), "err"); }
      if (!msgs.find((m) => m.id === data.id)) { msgs.push(data); draw(msgs); }
    };
  }
}

// ------------------------------------------------------------ QUESTIONS
async function ask() {
  S._lastView = "ask";
  loading();
  const pub = await sb.from("questions").select("*").eq("is_public", true).not("answer", "is", null)
    .order("answered_at", { ascending: false }).limit(100);
  const mine = S.user ? await sb.from("questions").select("*").eq("user_id", S.user.id)
    .order("created_at", { ascending: false }) : { data: [] };
  if (S.view !== "ask") return;
  const all = pub.data || [];
  view().innerHTML = `
    <div class="page-head"><h2>Questions</h2></div>
    <div class="card">
      <b>Have a health question?</b>
      <p class="small muted">Ask our health center staff. Answers may be shown publicly (without your name) to help others.</p>
      <form id="qForm">
        ${S.user ? "" : `<label>Your name (optional)</label><input class="field" name="asker_name" placeholder="Anonymous">`}
        <label>Your question *</label>
        <textarea class="field" name="question" required minlength="5" maxlength="2000" placeholder="e.g. What vaccines does my 6-month-old baby need?"></textarea>
        ${S.user ? "" : `<p class="small muted" style="margin-top:6px">Tip: log in to see the answer to your own question even if it's not posted publicly.</p>`}
        <button class="btn block" style="margin-top:12px">Send Question</button>
      </form>
    </div>
    ${(mine.data || []).length ? `<div class="section-title">My questions</div>${mine.data.map(qaCard).join("")}` : ""}
    <div class="section-title">Answered questions</div>
    <div class="search"><input class="field" id="qSearch" placeholder="Search answered questions…"></div>
    <div id="qList">${all.length ? all.map(qaCard).join("") : `<div class="card empty small">No answered questions yet.</div>`}</div>`;

  $("#qSearch").oninput = (e) => {
    const t = e.target.value.toLowerCase();
    const f = all.filter((q) => (q.question + " " + q.answer).toLowerCase().includes(t));
    $("#qList").innerHTML = f.length ? f.map(qaCard).join("") : `<div class="card empty small">No match.</div>`;
  };
  $("#qForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const btn = $("button", e.target); btn.disabled = true;
    const { error } = await sb.from("questions").insert({
      question: f.question.trim(),
      asker_name: S.user ? (S.profile?.full_name || "Patient") : (f.asker_name?.trim() || "Anonymous"),
      user_id: S.user?.id || null
    });
    btn.disabled = false;
    if (error) return toast(friendlyError(error), "err");
    toast("Question sent! Our staff will answer soon.");
    ask();
  };
}

function qaCard(q) {
  return `<div class="card qa">
    <div class="q">❓ ${rich(q.question)}</div>
    <div class="small muted">${q.user_id === S.user?.id ? "You" : esc(q.is_public ? "Patient" : q.asker_name)} · ${timeAgo(q.created_at)}</div>
    ${q.answer ? `<div class="a"><div class="by">✅ ${esc(q.answered_by || "Babak SHC")}</div>${rich(q.answer)}</div>`
      : `<div class="small" style="margin-top:6px"><span class="chip gold">Waiting for answer</span></div>`}
  </div>`;
}

// ------------------------------------------------------------ ACCOUNT
function me() {
  S._lastView = "me";
  if (!S.user) return authView("login");
  const p = S.profile || {};
  view().innerHTML = `
    <div class="page-head"><h2>My Account</h2></div>
    <div class="card row">
      <div style="width:54px;height:54px;border-radius:50%;background:var(--brand-l);display:grid;place-items:center;font-size:24px;font-weight:800;color:var(--brand-d)">
        ${esc((p.full_name || "?")[0].toUpperCase())}</div>
      <div class="grow"><b>${esc(p.full_name || "")}</b>
        <div class="small muted">${esc(S.user.email.endsWith("@" + C.PHONE_EMAIL_DOMAIN) ? S.user.email.split("@")[0] : S.user.email)}</div>
        ${p.role && p.role !== "patient" ? `<span class="chip blue">${esc(p.role)}</span>` : ""}</div>
    </div>
    <div class="card">
      <form id="pForm">
        <label>Full name</label><input class="field" name="full_name" value="${esc(p.full_name || "")}" required>
        <label>Mobile number</label><input class="field" name="phone" inputmode="tel" value="${esc(p.phone || "")}">
        <div class="grid2">
          <div><label>Birthdate</label><input class="field" type="date" name="birthdate" value="${esc(p.birthdate || "")}"></div>
          <div><label>Sex</label><select class="field" name="sex"><option value="">—</option>
            ${["Male", "Female"].map((x) => `<option ${p.sex === x ? "selected" : ""}>${x}</option>`).join("")}</select></div>
        </div>
        <label>Barangay / Purok</label><input class="field" name="barangay" value="${esc(p.barangay || "")}">
        <button class="btn block" style="margin-top:14px">Save Profile</button>
      </form>
    </div>
    ${["staff", "doctor", "admin"].includes(p.role) ? `<a class="btn light block" href="admin.html" style="margin-bottom:10px;text-decoration:none">🏥 Open Staff Dashboard</a>` : ""}
    ${!isApp && C.APK_URL ? `<a class="btn ghost block" href="${esc(C.APK_URL)}" style="margin-bottom:10px;text-decoration:none">📲 Download Android App</a>` : ""}
    <button class="btn red block" id="logout">Log out</button>`;
  $("#pForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    f.birthdate = f.birthdate || null;
    const { error } = await sb.from("profiles").update(f).eq("id", S.user.id);
    if (error) return toast(friendlyError(error), "err");
    Object.assign(S.profile, f); toast("Profile saved.");
  };
  $("#logout").onclick = async () => { await sb.auth.signOut(); await setUser(null); go("home"); };
}

function authView(mode) {
  view().innerHTML = `
    <div class="auth-box">
      <div style="text-align:center;margin:8px 0 16px"><img src="icons/logo.svg" width="64" alt="">
        <h2 style="margin-top:6px">${mode === "login" ? "Welcome back" : "Create your account"}</h2>
        <p class="small muted">${mode === "login" ? "Log in to consult with our doctors." : "Free for all Babak SHC patients."}</p></div>
      <div class="seg"><button class="${mode === "login" ? "on" : ""}" data-m="login">Log in</button>
        <button class="${mode === "register" ? "on" : ""}" data-m="register">Register</button></div>
      <div class="card">
        <form id="aForm">
          ${mode === "register" ? `
            <label>Full name *</label><input class="field" name="full_name" required placeholder="Juan Dela Cruz">
            <div class="grid2">
              <div><label>Birthdate</label><input class="field" type="date" name="birthdate"></div>
              <div><label>Sex</label><select class="field" name="sex"><option value="">—</option><option>Male</option><option>Female</option></select></div>
            </div>
            <label>Barangay / Purok</label><input class="field" name="barangay">` : ""}
          <label>Mobile number or email *</label>
          <input class="field" name="id" required placeholder="09XXXXXXXXX" autocomplete="username">
          <label>Password *</label>
          <input class="field" type="password" name="password" required minlength="6" autocomplete="${mode === "login" ? "current-password" : "new-password"}">
          <button class="btn block" style="margin-top:16px">${mode === "login" ? "Log in" : "Create account"}</button>
        </form>
      </div>
      ${mode === "login" ? `<p class="small muted" style="text-align:center">Forgot your password? Please ask the health center staff to reset it.</p>` : ""}
    </div>`;
  $$(".seg button").forEach((b) => (b.onclick = () => authView(b.dataset.m)));
  $("#aForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const email = toLoginEmail(f.id);
    if (isPhoneLogin(f.id) && !/^09\d{9}@/.test(email)) return toast("Enter a valid 11-digit mobile number (09XXXXXXXXX).", "err");
    const btn = $("button.btn", e.target); btn.disabled = true;
    let res;
    if (mode === "login") {
      res = await sb.auth.signInWithPassword({ email, password: f.password });
    } else {
      res = await sb.auth.signUp({
        email, password: f.password,
        options: { data: { full_name: f.full_name.trim(), birthdate: f.birthdate || "", sex: f.sex || "",
          barangay: f.barangay || "", phone: isPhoneLogin(f.id) ? email.split("@")[0] : "" } }
      });
      if (!res.error && !res.data.session) {
        btn.disabled = false;
        return toast("Account created, but email confirmation is ON in Supabase. Ask the admin to turn it off (see README).", "err");
      }
    }
    btn.disabled = false;
    if (res.error) return toast(friendlyError(res.error), "err");
    await setUser(res.data.user);
    toast(mode === "login" ? "Logged in!" : "Account created!");
    go(S._wantConsult ? "consult" : "home");
  };
}
