// =============== Babak SHC — Staff Dashboard ===============
const S = { user: null, profile: null, view: "dash", selConsult: null, cFilter: "open", qFilter: "unanswered" };
const C = window.APP_CONFIG;
const view = () => $("#view");
const STAFF = ["staff", "doctor", "admin"];

if (!window.CONFIGURED) {
  view().innerHTML = `<div class="card setup"><h2>⚙️ Setup needed</h2><p class="muted">Edit <code>js/config.js</code> first (see README.md).</p></div>`;
} else start();

async function start() {
  const { data } = await sb.auth.getSession();
  if (!data.session) return loginView();
  S.user = data.session.user;
  const { data: p } = await sb.from("profiles").select("*").eq("id", S.user.id).maybeSingle();
  S.profile = p;
  if (!p || !STAFF.includes(p.role)) {
    view().innerHTML = `<div class="card setup" style="text-align:center"><div style="font-size:44px">🔒</div>
      <h2>Staff only</h2><p class="muted" style="margin:8px 0 14px">Your account (${esc(p?.full_name || S.user.email)}) is a patient account.
      Ask the admin to give you a staff/doctor role.</p>
      <a class="btn" href="index.html">Go to Patient Portal</a> <button class="btn ghost" onclick="logout()">Log out</button></div>`;
    $("#side").classList.add("hidden");
    return;
  }
  $("#whoami").innerHTML = `<b style="color:#fff">${esc(p.full_name)}</b><br>${esc(p.role)}`;
  $("#usersBtn").classList.toggle("hidden", p.role !== "admin");
  $$("#side button[data-v]").forEach((b) => (b.onclick = () => go(b.dataset.v)));
  $("#logoutBtn").onclick = logout;
  $("#mNav").onchange = (e) => {
    const v = e.target.value;
    if (v === "portal") location.href = "index.html";
    else if (v === "logout") logout();
    else go(v);
  };
  sb.channel("staff-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "consultations" }, (pl) => {
      badges();
      if (pl.eventType === "INSERT") { toast("🩺 New consultation request!"); beep(); }
      if (S.view === "consults") consults(true);
      if (S.view === "dash") dash();
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "consult_messages" }, (pl) => {
      if (!pl.new.is_staff && !(S.view === "consults" && S.selConsult === pl.new.consultation_id)) {
        toast("💬 New message from a patient"); beep();
      }
    })
    .subscribe();
  // questions are not in realtime publication for anon safety — poll lightly
  setInterval(badges, 60000);
  badges();
  const h = location.hash.replace("#", "");
  go(["dash", "consults", "questions", "announcements", "schedule", "users"].includes(h) ? h : "dash");
}

window.logout = async () => { await sb.auth.signOut(); location.reload(); };

function beep() {
  try {
    const a = new (window.AudioContext || window.webkitAudioContext)();
    const o = a.createOscillator(), g = a.createGain();
    o.connect(g); g.connect(a.destination); o.frequency.value = 880; g.gain.value = 0.08;
    o.start(); o.stop(a.currentTime + 0.18);
  } catch (e) {}
}

async function badges() {
  const [c, q] = await Promise.all([
    sb.from("consultations").select("id", { count: "exact", head: true }).eq("status", "pending"),
    sb.from("questions").select("id", { count: "exact", head: true }).is("answer", null)
  ]);
  const set = (el, n) => { el.textContent = n || ""; el.classList.toggle("hidden", !n); };
  set($("#bC"), c.count); set($("#bQ"), q.count);
  return { pendingC: c.count || 0, pendingQ: q.count || 0 };
}

function go(v) {
  S.view = v;
  history.replaceState(null, "", "#" + v);
  $$("#side button[data-v]").forEach((b) => b.classList.toggle("on", b.dataset.v === v));
  $("#mNav").value = v;
  ({ dash, consults, questions, announcements, schedule, users })[v]();
}

function loginView() {
  $("#side").classList.add("hidden");
  view().innerHTML = `<div class="auth-box" style="margin-top:8vh">
    <div style="text-align:center;margin-bottom:14px"><img src="icons/logo.svg" width="64" alt="">
      <h2>Staff Login</h2><p class="small muted">Babak Super Health Center</p></div>
    <div class="card"><form id="lf">
      <label>Mobile number or email</label><input class="field" name="id" required autocomplete="username">
      <label>Password</label><input class="field" name="password" type="password" required autocomplete="current-password">
      <button class="btn block" style="margin-top:16px">Log in</button></form></div>
    <p class="small muted" style="text-align:center"><a href="index.html">← Back to Patient Portal</a></p></div>`;
  $("#lf").onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const { error } = await sb.auth.signInWithPassword({ email: toLoginEmail(f.id), password: f.password });
    if (error) return toast(friendlyError(error), "err");
    location.reload();
  };
}

// ------------------------------------------------------------ DASHBOARD
async function dash() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [st, b, todayC, ann] = await Promise.all([
    sb.from("center_status").select("*").eq("id", 1).single(),
    badges(),
    sb.from("consultations").select("id", { count: "exact", head: true }).gte("created_at", today.toISOString()),
    sb.from("announcements").select("id", { count: "exact", head: true }).eq("published", true)
  ]);
  if (S.view !== "dash") return;
  const s = st.data || { doctor_in: true, message: "" };
  view().innerHTML = `
    <div class="page-head"><h2>Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, ${esc(S.profile.full_name.split(" ")[0])}!</h2></div>
    <div class="stats">
      <div class="stat"><b>${b.pendingC}</b><span>Pending consultations</span></div>
      <div class="stat"><b>${b.pendingQ}</b><span>Unanswered questions</span></div>
      <div class="stat"><b>${todayC.count || 0}</b><span>Consult requests today</span></div>
      <div class="stat"><b>${ann.count || 0}</b><span>Live announcements</span></div>
    </div>
    <div class="card">
      <b>Doctor at the center today?</b>
      <p class="small muted" style="margin-bottom:10px">Patients see this at the top of the portal and app. Last updated ${timeAgo(s.updated_at)}.</p>
      <div class="toggle-big">
        <button class="in ${s.doctor_in ? "on" : ""}" data-v="1">🟢 Doctor is IN</button>
        <button class="out ${!s.doctor_in ? "on" : ""}" data-v="0">🔴 No doctor today</button>
      </div>
      <label>Message to patients (optional)</label>
      <input class="field" id="stMsg" value="${esc(s.message || "")}" placeholder="e.g. Doctor attending a seminar; back on Monday.">
      <button class="btn" id="stSave" style="margin-top:10px">Update status</button>
    </div>
    <div class="row wrap" style="gap:10px">
      <button class="btn light" onclick="go('consults')">🩺 Open consultations</button>
      <button class="btn light" onclick="go('questions')">💬 Answer questions</button>
      <button class="btn light" onclick="editAnn()">📢 Post announcement</button>
    </div>`;
  let doctorIn = s.doctor_in;
  $$(".toggle-big button").forEach((x) => (x.onclick = () => {
    doctorIn = x.dataset.v === "1";
    $$(".toggle-big button").forEach((y) => y.classList.toggle("on", y === x));
  }));
  $("#stSave").onclick = async () => {
    const { error } = await sb.from("center_status").update({
      doctor_in: doctorIn, message: $("#stMsg").value.trim(), updated_at: new Date().toISOString()
    }).eq("id", 1);
    if (error) return toast(friendlyError(error), "err");
    toast("Status updated — patients can see it now."); dash();
  };
}

// ------------------------------------------------------------ CONSULTATIONS
async function consults(keepSel) {
  let q = sb.from("consultations").select("*").order("created_at", { ascending: false }).limit(200);
  if (S.cFilter === "open") q = q.in("status", ["pending", "accepted"]);
  else if (S.cFilter !== "all") q = q.eq("status", S.cFilter);
  const { data, error } = await q;
  if (S.view !== "consults") return;
  if (error) return (view().innerHTML = `<div class="notice red">${esc(friendlyError(error))}</div>`);
  const firstRender = !$("#cList");
  if (firstRender) {
    view().innerHTML = `
      <div class="page-head"><h2>Online Consultations</h2>
        <select class="field" id="cFilter" style="width:auto">
          <option value="open">Open (pending + accepted)</option><option value="pending">Pending</option>
          <option value="accepted">Accepted</option><option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option><option value="all">All</option></select></div>
      <div class="split"><div class="list-pane" id="cList"></div><div id="cDetail"></div></div>`;
    $("#cFilter").value = S.cFilter;
    $("#cFilter").onchange = (e) => { S.cFilter = e.target.value; consults(true); };
  }
  $("#cList").innerHTML = data.length ? data.map((c) => `
    <div class="card consult ${S.selConsult === c.id ? "sel" : ""}" data-id="${c.id}">
      <div class="top"><div><h4>${esc(c.patient_name)}${c.age ? `, ${c.age}` : ""}${c.sex ? ` ${esc(c.sex[0])}` : ""}</h4>
        <div class="small muted">#${c.id} · ${timeAgo(c.created_at)}</div></div>
        <span class="chip st-${c.status}">${c.status}</span></div>
      <div class="small" style="margin-top:6px">${esc(c.concern.slice(0, 90))}${c.concern.length > 90 ? "…" : ""}</div>
    </div>`).join("") : `<div class="card empty">No consultations here.</div>`;
  $$("#cList .consult").forEach((el) => (el.onclick = () => openC(+el.dataset.id)));
  if (!keepSel || !S.selConsult) {
    if (innerWidth > 900 && data[0]) openC(data[0].id);
    else if (!S.selConsult) $("#cDetail").innerHTML = innerWidth > 900 ? `<div class="card empty">Select a consultation.</div>` : "";
  }
}

let chatCh = null;
async function openC(id) {
  S.selConsult = id;
  $$("#cList .consult").forEach((el) => el.classList.toggle("sel", +el.dataset.id === id));
  const { data: c } = await sb.from("consultations").select("*").eq("id", id).single();
  if (!c) return;
  const local = c.schedule_at ? new Date(new Date(c.schedule_at) - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
  const html = `
    <div class="card">
      <div class="top row" style="justify-content:space-between;align-items:flex-start">
        <div><h3>${esc(c.patient_name)}</h3>
        <div class="small muted">${[c.age && c.age + " yrs", c.sex, c.contact && "☎ " + esc(c.contact)].filter(Boolean).join(" · ")}</div></div>
        <span class="chip st-${c.status}">${STATUS_LABEL[c.status]}</span></div>
      <div class="card" style="background:#f7faf9;margin:12px 0 8px">
        <div class="small muted">Concern</div>${rich(c.concern)}
        ${c.symptoms_since ? `<div class="small muted" style="margin-top:6px">Since: ${esc(c.symptoms_since)}</div>` : ""}
        ${c.preferred_date || c.preferred_time ? `<div class="small muted">Preferred: ${c.preferred_date ? fmtDate(c.preferred_date + "T00:00") : ""} ${esc(c.preferred_time || "")}</div>` : ""}
      </div>
      <form id="cEdit">
        <div class="grid2">
          <div><label>Schedule (date & time)</label><input class="field" type="datetime-local" name="schedule_at" value="${local}"></div>
          <div><label>Video call link (Google Meet / Messenger)</label><input class="field" name="meeting_link" value="${esc(c.meeting_link || "")}" placeholder="https://meet.google.com/…"></div>
        </div>
        <label>Doctor's advice / notes (patient can see this)</label>
        <textarea class="field" name="doctor_notes">${esc(c.doctor_notes || "")}</textarea>
        <div class="row wrap" style="margin-top:12px">
          ${c.status === "pending" ? `<button class="btn" data-s="accepted">✔ Accept & save</button>` : `<button class="btn" data-s="">💾 Save</button>`}
          ${c.status !== "completed" ? `<button class="btn light" data-s="completed">✅ Mark completed</button>` : ""}
          ${c.status === "pending" ? `<button class="btn ghost" data-s="cancelled">Decline</button>` : ""}
          <button type="button" class="btn ghost" id="jitsi">🎥 Make free video link</button>
        </div>
      </form>
    </div>
    <div class="card">
      <b>Chat with patient</b>
      <div class="chat" style="height:420px">
        <div class="chat-log" id="log"></div>
        <form class="chat-send" id="sendF"><textarea class="field" placeholder="Reply to patient…" required></textarea><button class="btn">Send</button></form>
      </div>
    </div>`;

  let host;
  if (innerWidth <= 900) {
    host = modal(html);
  } else {
    $("#cDetail").innerHTML = html;
    host = $("#cDetail");
  }
  $("#jitsi", host).onclick = () => {
    $("[name=meeting_link]", host).value = "https://meet.jit.si/BabakSHC-" + c.id + "-" + Math.random().toString(36).slice(2, 8);
    toast("Link created — press Save to send it to the patient.");
  };
  let action = "";
  $$("#cEdit button[data-s]", host).forEach((b) => (b.onclick = () => (action = b.dataset.s)));
  $("#cEdit", host).onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const upd = {
      schedule_at: f.schedule_at ? new Date(f.schedule_at).toISOString() : null,
      meeting_link: f.meeting_link.trim() || null,
      doctor_notes: f.doctor_notes.trim() || null
    };
    if (action) upd.status = action;
    if (action === "accepted" || !c.doctor_id) { upd.doctor_id = S.user.id; upd.doctor_name = S.profile.full_name; }
    const { error } = await sb.from("consultations").update(upd).eq("id", c.id);
    if (error) return toast(friendlyError(error), "err");
    toast("Saved."); if (host.close) host.close();
    consults(true); openC(c.id);
  };

  // chat
  const log = $("#log", host);
  let msgs = [];
  const draw = () => {
    log.innerHTML = msgs.length ? msgs.map((m) => `<div class="bubble ${m.is_staff ? "me" : "them"}">
      <span class="n">${esc(m.sender_name)}</span>${rich(m.body)}<span class="t">${fmtDateTime(m.created_at)}</span></div>`).join("")
      : `<div class="empty small">No messages yet.</div>`;
    log.scrollTop = log.scrollHeight;
  };
  const { data: m } = await sb.from("consult_messages").select("*").eq("consultation_id", c.id).order("created_at");
  msgs = m || []; draw();
  if (chatCh) sb.removeChannel(chatCh);
  chatCh = sb.channel("schat-" + c.id + "-" + Date.now())
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "consult_messages", filter: "consultation_id=eq." + c.id },
      (p) => { if (!msgs.find((x) => x.id === p.new.id)) { msgs.push(p.new); draw(); } })
    .subscribe();
  const sf = $("#sendF", host), ta = $("textarea", sf);
  ta.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sf.requestSubmit(); } };
  sf.onsubmit = async (e) => {
    e.preventDefault();
    const body = ta.value.trim(); if (!body) return;
    ta.value = "";
    const prefix = S.profile.role === "doctor" && !/^dr\.?\s/i.test(S.profile.full_name) ? "Dr. " : "";
    const { data, error } = await sb.from("consult_messages").insert({
      consultation_id: c.id, sender_id: S.user.id, body, sender_name: prefix + S.profile.full_name
    }).select().single();
    if (error) { ta.value = body; return toast(friendlyError(error), "err"); }
    if (!msgs.find((x) => x.id === data.id)) { msgs.push(data); draw(); }
    if (c.status === "pending") {
      await sb.from("consultations").update({ status: "accepted", doctor_id: S.user.id, doctor_name: prefix + S.profile.full_name }).eq("id", c.id);
      c.status = "accepted"; consults(true);
    }
  };
}

// ------------------------------------------------------------ QUESTIONS
async function questions() {
  let q = sb.from("questions").select("*").order("created_at", { ascending: false }).limit(300);
  if (S.qFilter === "unanswered") q = q.is("answer", null);
  else if (S.qFilter === "answered") q = q.not("answer", "is", null);
  const { data } = await q;
  if (S.view !== "questions") return;
  view().innerHTML = `
    <div class="page-head"><h2>Patient Questions</h2>
      <select class="field" id="qf" style="width:auto"><option value="unanswered">Unanswered</option>
        <option value="answered">Answered</option><option value="all">All</option></select></div>
    ${(data || []).length ? data.map((x) => `
      <div class="card qa" data-id="${x.id}">
        <div class="q">❓ ${rich(x.question)}</div>
        <div class="small muted">${esc(x.asker_name)} · ${fmtDateTime(x.created_at)} ${x.user_id ? `<span class="chip blue">registered</span>` : ""}
          ${x.answer ? (x.is_public ? `<span class="chip">public</span>` : `<span class="chip gray">private</span>`) : ""}</div>
        <textarea class="field" style="margin-top:10px" placeholder="Type the answer…">${esc(x.answer || "")}</textarea>
        <div class="row wrap" style="margin-top:8px">
          <label class="check" style="margin:0"><input type="checkbox" class="pub" ${x.is_public ? "checked" : ""}> Show publicly (name hidden)</label>
          <span class="grow"></span>
          <button class="btn sm red del">Delete</button>
          <button class="btn sm save">${x.answer ? "Update answer" : "Send answer"}</button>
        </div>
      </div>`).join("") : `<div class="card empty"><span class="big">🎉</span>Nothing here.</div>`}`;
  $("#qf").value = S.qFilter;
  $("#qf").onchange = (e) => { S.qFilter = e.target.value; questions(); };
  $$(".qa").forEach((card) => {
    const id = +card.dataset.id;
    $(".save", card).onclick = async () => {
      const answer = $("textarea", card).value.trim();
      if (!answer) return toast("Type an answer first.", "err");
      const { error } = await sb.from("questions").update({
        answer, is_public: $(".pub", card).checked,
        answered_by: (S.profile.role === "doctor" && !/^dr\.?\s/i.test(S.profile.full_name) ? "Dr. " : "") + S.profile.full_name,
        answered_at: new Date().toISOString()
      }).eq("id", id);
      if (error) return toast(friendlyError(error), "err");
      toast("Answer saved."); badges(); questions();
    };
    $(".del", card).onclick = async () => {
      if (!confirm("Delete this question?")) return;
      await sb.from("questions").delete().eq("id", id); badges(); questions();
    };
  });
}

// ------------------------------------------------------------ ANNOUNCEMENTS
async function announcements() {
  const { data } = await sb.from("announcements").select("*")
    .order("pinned", { ascending: false }).order("created_at", { ascending: false });
  if (S.view !== "announcements") return;
  view().innerHTML = `
    <div class="page-head"><h2>Announcements</h2><button class="btn" onclick="editAnn()">＋ New</button></div>
    ${(data || []).map((a) => `
      <div class="card ann ${a.pinned ? "pinned" : ""}">
        <div class="meta">${a.pinned ? `<span class="chip gold">📌 Pinned</span>` : ""}<span class="chip">${esc(a.category)}</span>
          ${a.published ? "" : `<span class="chip gray">Hidden</span>`}<span class="small muted">${fmtDateTime(a.created_at)}</span>
          <span class="grow"></span>
          <button class="btn sm light" onclick='editAnn(${a.id})'>Edit</button>
          <button class="btn sm red" onclick='delAnn(${a.id})'>Delete</button></div>
        <h3>${esc(a.title)}</h3><div class="body">${rich(a.body)}</div>
      </div>`).join("") || `<div class="card empty">No announcements yet.</div>`}`;
}

window.editAnn = async (id) => {
  let a = { title: "", body: "", category: "General", pinned: false, published: true };
  if (id) a = (await sb.from("announcements").select("*").eq("id", id).single()).data;
  const cats = ["General", "Health Advisory", "Immunization", "Medical Mission", "Schedule Change", "Event"];
  modal(`<h3>${id ? "Edit" : "New"} Announcement</h3>
    <form id="af">
      <label>Title *</label><input class="field" name="title" required value="${esc(a.title)}">
      <label>Category</label><select class="field" name="category">${cats.map((c) => `<option ${a.category === c ? "selected" : ""}>${c}</option>`).join("")}</select>
      <label>Message *</label><textarea class="field" name="body" required style="min-height:160px">${esc(a.body)}</textarea>
      <label class="check"><input type="checkbox" name="pinned" ${a.pinned ? "checked" : ""}> 📌 Pin to top</label>
      <label class="check"><input type="checkbox" name="published" ${a.published ? "checked" : ""}> Visible to patients</label>
      <button class="btn block" style="margin-top:16px">${id ? "Save changes" : "Post announcement"}</button>
    </form>`, (w) => {
    $("#af", w).onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const row = { title: f.get("title").trim(), category: f.get("category"), body: f.get("body").trim(),
        pinned: f.has("pinned"), published: f.has("published") };
      const { error } = id ? await sb.from("announcements").update(row).eq("id", id)
        : await sb.from("announcements").insert({ ...row, created_by: S.user.id });
      if (error) return toast(friendlyError(error), "err");
      w.close(); toast(id ? "Saved." : "Posted! Patients can see it now.");
      if (S.view === "announcements") announcements(); else go("announcements");
    };
  });
};
window.delAnn = async (id) => {
  if (!confirm("Delete this announcement?")) return;
  await sb.from("announcements").delete().eq("id", id); announcements();
};

// ------------------------------------------------------------ SCHEDULE
async function schedule() {
  const { data } = await sb.from("schedules").select("*").order("day_of_week").order("time_text");
  if (S.view !== "schedule") return;
  const weekly = (data || []).filter((x) => !x.event_date);
  const special = (data || []).filter((x) => x.event_date).sort((a, b) => b.event_date.localeCompare(a.event_date));
  const row = (x) => `<tr><td><b>${x.event_date ? fmtDate(x.event_date + "T00:00") : DAYS[x.day_of_week]}</b></td>
    <td>${esc(x.time_text)}</td><td><b>${esc(x.title)}</b>${x.notes ? `<div class="small muted">${esc(x.notes)}</div>` : ""}</td>
    <td>${esc(x.staff)}</td><td style="white-space:nowrap"><button class="btn sm light" onclick="editSch(${x.id})">Edit</button>
    <button class="btn sm red" onclick="delSch(${x.id})">✕</button></td></tr>`;
  const head = `<tr><th>Day</th><th>Time</th><th>Service / Activity</th><th>Staff</th><th></th></tr>`;
  view().innerHTML = `
    <div class="page-head"><h2>Clinic Schedule</h2><button class="btn" onclick="editSch()">＋ Add</button></div>
    <div class="section-title">Weekly services</div>
    <table class="tbl">${head}${weekly.map(row).join("") || `<tr><td colspan="5" class="muted">None yet.</td></tr>`}</table>
    <div class="section-title">Special dates (medical missions, events)</div>
    <table class="tbl">${head}${special.map(row).join("") || `<tr><td colspan="5" class="muted">None yet.</td></tr>`}</table>`;
}

window.editSch = async (id) => {
  let x = { day_of_week: 1, event_date: null, time_text: "8:00 AM – 12:00 NN", title: "", staff: "", notes: "" };
  if (id) x = (await sb.from("schedules").select("*").eq("id", id).single()).data;
  const special = !!x.event_date;
  modal(`<h3>${id ? "Edit" : "Add"} Schedule</h3>
    <form id="sf">
      <div class="seg" style="margin-top:10px"><button type="button" data-k="w" class="${special ? "" : "on"}">Every week</button>
        <button type="button" data-k="s" class="${special ? "on" : ""}">Specific date</button></div>
      <div id="wBox" class="${special ? "hidden" : ""}"><label>Day</label><select class="field" name="day_of_week">
        ${DAYS.map((d, i) => `<option value="${i}" ${x.day_of_week === i ? "selected" : ""}>${d}</option>`).join("")}</select></div>
      <div id="sBox" class="${special ? "" : "hidden"}"><label>Date</label><input class="field" type="date" name="event_date" value="${esc(x.event_date || "")}"></div>
      <label>Time</label><input class="field" name="time_text" value="${esc(x.time_text)}" placeholder="8:00 AM – 12:00 NN">
      <label>Service / activity *</label><input class="field" name="title" required value="${esc(x.title)}" placeholder="e.g. Immunization">
      <label>Doctor / staff in charge</label><input class="field" name="staff" value="${esc(x.staff)}">
      <label>Notes</label><textarea class="field" name="notes" placeholder="e.g. Bring your baby book">${esc(x.notes)}</textarea>
      <button class="btn block" style="margin-top:16px">Save</button>
    </form>`, (w) => {
    let mode = special ? "s" : "w";
    $$(".seg button", w).forEach((b) => (b.onclick = () => {
      mode = b.dataset.k;
      $$(".seg button", w).forEach((y) => y.classList.toggle("on", y === b));
      $("#wBox", w).classList.toggle("hidden", mode !== "w");
      $("#sBox", w).classList.toggle("hidden", mode !== "s");
    }));
    $("#sf", w).onsubmit = async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      if (mode === "s" && !f.event_date) return toast("Pick a date.", "err");
      const row = { time_text: f.time_text, title: f.title.trim(), staff: f.staff, notes: f.notes,
        day_of_week: mode === "w" ? +f.day_of_week : null, event_date: mode === "s" ? f.event_date : null };
      const { error } = id ? await sb.from("schedules").update(row).eq("id", id) : await sb.from("schedules").insert(row);
      if (error) return toast(friendlyError(error), "err");
      w.close(); toast("Schedule saved."); schedule();
    };
  });
};
window.delSch = async (id) => {
  if (!confirm("Delete this schedule entry?")) return;
  await sb.from("schedules").delete().eq("id", id); schedule();
};

// ------------------------------------------------------------ USERS (admin only)
async function users() {
  if (S.profile.role !== "admin") return (view().innerHTML = `<div class="card empty">Admins only.</div>`);
  const { data } = await sb.from("profiles").select("*").order("created_at", { ascending: false }).limit(1000);
  if (S.view !== "users") return;
  const draw = (list) => `<table class="tbl"><tr><th>Name</th><th>Mobile</th><th>Barangay</th><th>Joined</th><th>Role</th></tr>
    ${list.map((u) => `<tr><td><b>${esc(u.full_name || "—")}</b></td><td>${esc(u.phone || "")}</td><td>${esc(u.barangay || "")}</td>
      <td class="small">${fmtDate(u.created_at)}</td>
      <td><select class="field role" data-id="${u.id}" style="padding:6px 8px;width:auto" ${u.id === S.user.id ? "disabled" : ""}>
        ${["patient", "staff", "doctor", "admin"].map((r) => `<option ${u.role === r ? "selected" : ""}>${r}</option>`).join("")}</select></td></tr>`).join("")}</table>`;
  view().innerHTML = `
    <div class="page-head"><h2>Users & Roles</h2><span class="muted small">${data.length} accounts</span></div>
    <p class="small muted" style="margin-bottom:10px">Give doctors the <b>doctor</b> role and nurses/midwives/BHWs the <b>staff</b> role.
    To reset a patient's password, use Supabase → Authentication → Users.</p>
    <div class="search"><input class="field" id="uS" placeholder="Search name, mobile or barangay…"></div>
    <div id="uT">${draw(data)}</div>`;
  const bind = () => $$(".role").forEach((s) => (s.onchange = async () => {
    const { error } = await sb.from("profiles").update({ role: s.value }).eq("id", s.dataset.id);
    if (error) return toast(friendlyError(error), "err");
    toast("Role updated.");
  }));
  bind();
  $("#uS").oninput = (e) => {
    const t = e.target.value.toLowerCase();
    $("#uT").innerHTML = draw(data.filter((u) => [u.full_name, u.phone, u.barangay].join(" ").toLowerCase().includes(t)));
    bind();
  };
}
