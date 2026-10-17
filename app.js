import { list, insert, update, remove, clearAll, isSupabase, MODE, CURRENCY } from "./data.js";
import { hasPassword, setupPassword, checkPassword, resetPassword, isAuthed, setAuthed, logout } from "./auth.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

let currentView = "home";
let txType = "out";
let debtDir = "owe";

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.add("hidden"), 2200);
}

function money(n) {
  const v = Number(n || 0);
  return CURRENCY + v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

// ---------- Auth flow ----------
async function initAuth() {
  const overlay = $("#authOverlay");
  if (!hasPassword()) {
    $("#authSetup").classList.remove("hidden");
    $("#authLogin").classList.add("hidden");
  } else {
    $("#authSetup").classList.add("hidden");
    $("#authLogin").classList.remove("hidden");
  }
  if (isAuthed()) {
    overlay.classList.add("hidden");
    $("#app").classList.remove("hidden");
    return true;
  }
  overlay.classList.remove("hidden");
  $("#app").classList.add("hidden");
  return false;
}

$("#setupBtn").addEventListener("click", async () => {
  const a = $("#setupPw").value, b = $("#setupPw2").value;
  const msg = $("#authMsg");
  if (!a || a.length < 3) { msg.textContent = "Password too short (min 3)."; return; }
  if (a !== b) { msg.textContent = "Passwords don't match."; return; }
  await setupPassword(a);
  setAuthed();
  msg.textContent = "";
  await initAuth();
  render();
});

$("#loginBtn").addEventListener("click", async () => {
  const pw = $("#loginPw").value;
  const msg = $("#authMsg");
  if (await checkPassword(pw)) {
    setAuthed();
    msg.textContent = "";
    await initAuth();
    render();
  } else {
    msg.textContent = "Wrong password.";
  }
});
$("#loginPw").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#loginBtn").click(); });

$("#forgotBtn").addEventListener("click", () => {
  if (confirm("Reset password? Your data stays, only the password is cleared.")) {
    resetPassword();
    location.reload();
  }
});

$("#lockBtn").addEventListener("click", () => {
  logout();
  location.reload();
});

// ---------- Navigation ----------
$$(".nav-btn").forEach((b) => {
  b.addEventListener("click", () => {
    currentView = b.dataset.view;
    $$(".nav-btn").forEach((x) => x.classList.toggle("active", x === b));
    render();
  });
});

// ---------- Render dispatcher ----------
async function render() {
  const c = $("#viewContainer");
  c.innerHTML = `<div class="empty">Loading…</div>`;
  try {
    if (currentView === "home") await renderHome(c);
    else if (currentView === "add") renderAdd(c);
    else if (currentView === "owe") await renderOwe(c);
    else if (currentView === "txns") await renderTxns(c);
    else if (currentView === "more") await renderMore(c);
  } catch (e) {
    console.error(e);
    c.innerHTML = `<div class="empty">Error: ${e.message || e}</div>`;
  }
}

// ---------- Home ----------
async function renderHome(c) {
  const txs = await list("transactions");
  let income = 0, expense = 0;
  txs.forEach((t) => {
    if (t.type === "in") income += Number(t.amount);
    else expense += Number(t.amount);
  });
  const balance = income - expense;

  // monthly expense for budget
  const now = new Date();
  const ym = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
  let monthExpense = 0;
  txs.forEach((t) => {
    if (t.type === "out" && (t.tdate || t.created_at || "").slice(0, 7) === ym) monthExpense += Number(t.amount);
  });
  const budget = sget("budget", 0);

  // recent
  const recent = txs.slice(0, 8);
  const recentHtml = recent.length
    ? recent.map((t) => `
      <div class="item">
        <div class="left">
          <div class="title">${escapeHtml(t.category || (t.type === "in" ? "Income" : "Expense"))}</div>
          <div class="sub">${escapeHtml(t.note || "")} · ${fmtDate(t.tdate || t.created_at)}</div>
        </div>
        <div class="amt ${t.type === "in" ? "pos" : "neg"}">${t.type === "in" ? "+" : "-"}${money(t.amount)}</div>
        <div class="actions">
          <button data-del-tx="${t.id}" title="Delete">🗑️</button>
        </div>
      </div>`).join("")
    : `<div class="empty">No transactions yet. Tap ➕ to add.</div>`;

  const budgetHtml = budget > 0 ? `
    <div class="card-block">
      <div class="section-title" style="margin-top:0">Monthly budget</div>
      <div class="sub">${money(monthExpense)} / ${money(budget)} spent this month</div>
      <div class="progress"><div style="width:${Math.min(100, Math.round((monthExpense / budget) * 100))}%;background:${monthExpense > budget ? "var(--danger)" : "var(--ink)"}"></div></div>
      ${monthExpense > budget ? `<div class="msg" style="display:block">Over budget by ${money(monthExpense - budget)}!</div>` : ""}
    </div>` : "";

  // goals (merged into Home in v2.1)
  const goalsHtml = await goalsSectionHtml();

  // reminders due soon / overdue
  const reminders = await list("reminders");
  const today = new Date().toISOString().slice(0, 10);
  const dueSoon = reminders.filter((r) => !r.done && r.due_date && r.due_date <= today).slice(0, 5);
  const dueNext = reminders.filter((r) => !r.done && r.due_date && r.due_date > today).slice(0, 3);
  const remHtml = (dueSoon.length || dueNext.length) ? `
    <div class="card-block">
      <div class="section-title" style="margin-top:0">🔔 Bills &amp; reminders</div>
      ${dueSoon.length ? dueSoon.map((r) => `
        <div class="item reminder-item">
          <div class="left">
            <div class="title">${escapeHtml(r.title)} ${r.recurring ? "🔁" : ""}</div>
            <div class="sub">${r.due_date < today ? "overdue" : "due today"}${r.amount ? " · " + money(r.amount) : ""}</div>
          </div>
          <button class="btn small" data-rmd="${r.id}">paid? ✅</button>
        </div>`).join("") : ""}
      ${dueNext.length ? `<div class="sub" style="margin:6px 0">${dueNext.map((r) => `${escapeHtml(r.title)} → ${r.due_date}`).join(" · ")}</div>` : ""}
    </div>` : "";

  c.innerHTML = `
    <div class="balance-card">
      <div class="label">Cash in hand</div>
      <div class="amount">${money(balance)}</div>
    </div>
    ${budgetHtml}
    ${remHtml}
    ${goalsHtml}
    <div class="stat-grid">
      <div class="stat"><div class="label">Total in</div><div class="value pos">${money(income)}</div></div>
      <div class="stat"><div class="label">Total out</div><div class="value neg">${money(expense)}</div></div>
    </div>

    <div class="section-title">Where it goes</div>
    <div class="card-block">
      <div class="chart-wrap"><canvas id="pieChart" width="560" height="320"></canvas></div>
      <div class="sub" style="margin-top:6px">this month, by category</div>
    </div>

    <div class="section-title">Last 7 days</div>
    <div class="card-block">
      <div class="chart-wrap"><canvas id="barChart" width="560" height="260"></canvas></div>
    </div>

    <div class="section-title">Cash count (verify)</div>
    <div class="card-block cash-count">
      ${cashCountHtml()}
    </div>

    <div class="section-title">Recent</div>
    <div class="list">${recentHtml}</div>
  `;

  // cash count logic
  setupCashCount(c, balance);
  // goals handlers
  bindGoals(c);
  // charts
  drawPie(c.querySelector("#pieChart"), txs, ym);
  drawBars(c.querySelector("#barChart"), txs);
  // reminder done handlers
  c.querySelectorAll("[data-rmd]").forEach((b) => {
    b.addEventListener("click", async () => {
      await doneReminder(b.dataset.rmd);
      render();
    });
  });
  // delete handlers
  c.querySelectorAll("[data-del-tx]").forEach((b) => {
    b.addEventListener("click", async () => {
      if (!confirm("Delete this transaction?")) return;
      await remove("transactions", b.dataset.delTx);
      toast("Deleted");
      render();
    });
  });
}

const DENOMS = [500, 200, 100, 50, 20, 10, 5, 2, 1];
function cashCountHtml() {
  return `<table>
    ${DENOMS.map((d) => `
      <tr>
        <td>₹${d}</td>
        <td><input type="number" min="0" data-denom="${d}" placeholder="0" /></td>
        <td class="sub">= ₹<span data-sub="${d}">0</span></td>
      </tr>`).join("")}
    <tr><td colspan="3" class="total">Total counted: <span id="cashTotal">₹0</span></td></tr>
  </table>`;
}
function setupCashCount(c, balance) {
  const inputs = c.querySelectorAll("[data-denom]");
  const totalEl = c.querySelector("#cashTotal");
  function recalc() {
    let total = 0;
    inputs.forEach((inp) => {
      const d = Number(inp.dataset.denom);
      const n = Number(inp.value || 0);
      const sub = d * n;
      total += sub;
      const s = c.querySelector(`[data-sub="${d}"]`);
      if (s) s.textContent = sub.toLocaleString("en-IN");
    });
    totalEl.textContent = money(total);
    // color hint
    totalEl.style.color = (total === balance) ? "var(--ink)" : "var(--danger)";
  }
  inputs.forEach((inp) => inp.addEventListener("input", recalc));
}

// ---------- Charts (plain canvas, no libs) ----------
const PALETTE = ["#ff5fa2", "#5bc0eb", "#9b5de5", "#ff8c42", "#1a7f37", "#ffd93d", "#1a1a2e", "#b8ff57"];

function drawPie(canvas, txs, ym) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const byCat = {};
  txs.forEach((t) => {
    if (t.type !== "out") return;
    const d = (t.tdate || t.created_at || "").slice(0, 7);
    if (ym && d !== ym) return;
    const cat = t.category || "Other";
    byCat[cat] = (byCat[cat] || 0) + Number(t.amount);
  });
  const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, e) => s + e[1], 0);

  if (!total) {
    ctx.fillStyle = "#5a5a7a";
    ctx.font = "600 22px 'Baloo 2', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("no spending this month yet", W / 2, H / 2);
    return;
  }

  const cx = 110, cy = H / 2, r = 100;
  let angle = -Math.PI / 2;
  entries.forEach(([cat, val], i) => {
    const frac = val / total;
    const a2 = angle + frac * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, angle, a2);
    ctx.closePath();
    ctx.fillStyle = PALETTE[i % PALETTE.length];
    ctx.fill();
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth = 3;
    ctx.stroke();
    angle = a2;
  });
  // donut hole
  ctx.beginPath();
  ctx.arc(cx, cy, 48, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.strokeStyle = "#1a1a2e";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = "#1a1a2e";
  ctx.font = "800 20px 'Baloo 2', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("₹" + Math.round(total).toLocaleString("en-IN"), cx, cy + 6);

  // legend
  let ly = 30;
  ctx.textAlign = "left";
  entries.slice(0, 6).forEach(([cat, val], i) => {
    ctx.fillStyle = PALETTE[i % PALETTE.length];
    ctx.fillRect(250, ly - 12, 16, 16);
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth = 2;
    ctx.strokeRect(250, ly - 12, 16, 16);
    ctx.fillStyle = "#1a1a2e";
    ctx.font = "700 16px 'Baloo 2', sans-serif";
    const pct = Math.round((val / total) * 100);
    ctx.fillText(`${cat} · ${pct}%`, 276, ly + 2);
    ly += 26;
  });
}

function drawBars(canvas, txs) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  const inByDay = Object.fromEntries(days.map((d) => [d, 0]));
  const outByDay = Object.fromEntries(days.map((d) => [d, 0]));
  txs.forEach((t) => {
    const d = (t.tdate || t.created_at || "").slice(0, 10);
    if (!(d in inByDay)) return;
    if (t.type === "in") inByDay[d] += Number(t.amount);
    else outByDay[d] += Number(t.amount);
  });
  const max = Math.max(1, ...Object.values(inByDay), ...Object.values(outByDay));
  const base = H - 30, top = 16, plotH = base - top;
  const slot = W / 7;
  const barW = slot * 0.28;

  ctx.font = "700 14px 'Baloo 2', sans-serif";
  ctx.textAlign = "center";
  days.forEach((d, i) => {
    const x = i * slot + slot / 2;
    const hIn = (inByDay[d] / max) * plotH;
    const hOut = (outByDay[d] / max) * plotH;
    // in bar
    ctx.fillStyle = "#1a7f37";
    ctx.fillRect(x - barW - 3, base - hIn, barW, hIn);
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth = 2;
    ctx.strokeRect(x - barW - 3, base - hIn, barW, hIn);
    // out bar
    ctx.fillStyle = "#ff5fa2";
    ctx.fillRect(x + 3, base - hOut, barW, hOut);
    ctx.strokeRect(x + 3, base - hOut, barW, hOut);
    // label
    ctx.fillStyle = "#5a5a7a";
    const label = d.slice(5).replace("-", "/");
    ctx.fillText(label, x, H - 8);
  });
  // baseline
  ctx.strokeStyle = "#1a1a2e";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, base);
  ctx.lineTo(W, base);
  ctx.stroke();
}

// ---------- Reminders ----------
async function doneReminder(id) {
  const r = (await list("reminders")).find((x) => x.id === id);
  if (!r) return;
  if (r.recurring) {
    // roll forward one month
    const d = new Date(r.due_date + "T00:00:00");
    d.setMonth(d.getMonth() + 1);
    await update("reminders", id, { done: false, due_date: d.toISOString().slice(0, 10) });
    toast("Marked paid, next one scheduled");
  } else {
    await update("reminders", id, { done: true });
    toast("Done!");
  }
}

// ---------- Add ----------
function renderAdd(c) {
  const splitHtml = txType === "out" ? `
      <div class="form-group">
        <label><input id="splitToggle" type="checkbox" /> Split this expense among friends</label>
      </div>
      <div id="splitBox" class="hidden">
        <div class="form-group"><label>Number of people (including you)</label><input id="splitN" type="number" min="2" value="2" /></div>
        <div class="form-group"><label>Friends' names (comma separated, optional)</label><input id="splitNames" type="text" placeholder="Rahul, Priya" /></div>
      </div>` : "";

  c.innerHTML = `
    <div class="card-block">
      <div class="toggle-row">
        <button data-t="out" class="${txType === "out" ? "active" : ""}">💸 Spent (out)</button>
        <button data-t="in" class="${txType === "in" ? "active" : ""}">💰 Received (in)</button>
      </div>
      <div class="form-group">
        <label>Amount (₹)</label>
        <input id="txAmount" type="number" min="0" step="0.01" placeholder="0" />
      </div>
      <div class="form-group">
        <label>Category</label>
        <select id="txCat">
          ${txType === "in"
            ? `<option>Pocket money</option><option>Gift</option><option>Found</option><option>Other income</option>`
            : `<option>Food</option><option>Snacks</option><option>Transport</option><option>Recharge</option><option>Entertainment</option><option>Stationery</option><option>Other</option>`}
        </select>
      </div>
      <div class="form-group">
        <label>Note (optional)</label>
        <input id="txNote" type="text" placeholder="e.g. samosa with friends" />
      </div>
      <div class="form-group">
        <label>Tags (comma, optional)</label>
        <input id="txTags" type="text" placeholder="food, friends" />
      </div>
      <div class="form-group">
        <label>Date</label>
        <input id="txDate" type="date" value="${new Date().toISOString().slice(0,10)}" />
      </div>
      ${splitHtml}
      <button id="saveTx" class="btn primary">Save</button>
    </div>
  `;
  c.querySelectorAll("[data-t]").forEach((b) => {
    b.addEventListener("click", () => { txType = b.dataset.t; renderAdd(c); });
  });
  const splitToggle = $("#splitToggle");
  if (splitToggle) {
    splitToggle.addEventListener("change", () => {
      $("#splitBox").classList.toggle("hidden", !splitToggle.checked);
    });
  }
  $("#saveTx").addEventListener("click", async () => {
    const amt = Number($("#txAmount").value);
    if (!amt || amt <= 0) { toast("Enter a valid amount"); return; }
    const note = $("#txNote").value.trim();
    const split = txType === "out" && splitToggle && splitToggle.checked;
    let myShare = amt;
    if (split) {
      const n = Math.max(2, Number($("#splitN").value) || 2);
      myShare = amt / n;
      const names = ($("#splitNames").value || "").split(",").map((s) => s.trim()).filter(Boolean);
      // record full cash expense
      await insert("transactions", {
        type: "out",
        amount: amt,
        category: $("#txCat").value,
        note: note + ` (split among ${n})`,
        tags: $("#txTags").value.trim(),
        tdate: $("#txDate").value,
      });
      // create debts for everyone else's share (named where given, generic otherwise)
      const others = n - 1;
      const share = amt / n;
      for (let i = 0; i < others; i++) {
        const person = names[i] || `Person ${i + 1}`;
        await insert("debts", { person, amount: share, direction: "owed", note: "split: " + (note || "expense"), settled: false });
      }
      toast(`Saved! Your share ${money(myShare)}. ${others} debt${others === 1 ? "" : "s"} created.`);
    } else {
      await insert("transactions", {
        type: txType,
        amount: amt,
        category: $("#txCat").value,
        note: note,
        tags: $("#txTags").value.trim(),
        tdate: $("#txDate").value,
      });
      toast("Saved!");
    }
    // pocket-money → goal auto-save pipeline
    await syncAutoGoals();
    $("#txAmount").value = "";
    $("#txNote").value = "";
    const tg = $("#txTags"); if (tg) tg.value = "";
    currentView = "home";
    $$(".nav-btn").forEach((x) => x.classList.toggle("active", x.dataset.view === "home"));
    render();
  });
}

// ---------- Goals (merged into Home in v2.1) ----------
const AUTOSAVE_KEY = "autosave";
function autosaveSettings() {
  const a = sget("autosave", { enabled: true, pct: 20, goal_id: null });
  if (typeof a.pct !== "number" || isNaN(a.pct)) a.pct = 20;
  if (typeof a.enabled !== "boolean") a.enabled = true;
  return a;
}

function goalCardHtml(g) {
  const pct = Math.min(100, Math.round((Number(g.saved) / Number(g.target)) * 100));
  const done = Number(g.saved) >= Number(g.target);
  const r = Number(g.interest_rate || 0);
  let proj = "";
  if (r > 0 && Number(g.saved) > 0) {
    const after12 = Number(g.saved) * Math.pow(1 + r / 100, 12);
    proj = `<div class="sub">📈 at ${r}%/month → ${money(after12)} in 12 months</div>`;
  }
  const bits = [money(g.saved) + " / " + money(g.target)];
  if (r > 0) bits.push(r + "%/mo");
  if (g.deadline) bits.push("due " + fmtDate(g.deadline));
  return `
  <div class="card-block goal-block">
    <div class="item" style="background:none;padding:0">
      <div class="left">
        <div class="title">${g.emoji ? escapeHtml(g.emoji) + " " : ""}${escapeHtml(g.name)} ${done ? "✅" : ""}</div>
        <div class="sub">${bits.join(" · ")}</div>
      </div>
      <div class="actions">
        <button data-addgoal="${g.id}" title="Add savings">➕</button>
        <button data-delgoal="${g.id}" title="Delete">🗑️</button>
      </div>
    </div>
    <div class="progress"><div style="width:${pct}%"></div></div>
    <div class="sub" style="margin-top:4px">${pct}%${proj}</div>
  </div>`;
}

async function goalsSectionHtml() {
  const goals = await list("goals");
  const listHtml = goals.length
    ? goals.map(goalCardHtml).join("")
    : `<div class="empty">No goals yet. Create one below.</div>`;

  const as = autosaveSettings();
  const goalOptions = goals
    .map((g) => `<option value="${g.id}" ${g.id === as.goal_id ? "selected" : ""}>${escapeHtml(g.name)}</option>`)
    .join("");

  return `
    <div class="section-title">🎯 Goals</div>
    <div class="card-block">
      <div class="section-title" style="margin-top:0">New goal</div>
      <div class="form-group"><label>Name</label><input id="gName" placeholder="e.g. New cycle" /></div>
      <div class="row">
        <div class="form-group"><label>Target (₹)</label><input id="gTarget" type="number" min="1" placeholder="5000" /></div>
        <div class="form-group"><label>Emoji (opt)</label><input id="gEmoji" maxlength="4" placeholder="🚲" /></div>
      </div>
      <div class="row">
        <div class="form-group"><label>Interest (%/mo, opt)</label><input id="gRate" type="number" min="0" step="0.1" placeholder="0" /></div>
        <div class="form-group"><label>Deadline (opt)</label><input id="gDeadline" type="date" /></div>
      </div>
      <button id="saveGoal" class="btn primary">Create goal</button>
    </div>
    <div class="card-block">
      <div class="section-title" style="margin-top:0">💸 Pocket-money auto-save</div>
      <div class="form-group"><label><input id="asEnabled" type="checkbox" ${as.enabled ? "checked" : ""} /> auto-save part of every pocket money into a goal</label></div>
      <div class="row">
        <div class="form-group"><label>% of pocket money</label><input id="asPct" type="number" min="0" max="100" value="${as.pct}" /></div>
        <div class="form-group"><label>Goal</label><select id="asGoal"><option value="">first unfinished goal</option>${goalOptions}</select></div>
      </div>
      <button id="saveAs" class="btn primary">Save auto-save</button>
      <p class="muted small">Each pocket-money drop auto-moves this % into the goal. Real cash still moves by hand — the app tracks it.</p>
    </div>
    ${listHtml}`;
}

function bindGoals(c) {
  const saveGoal = c.querySelector("#saveGoal");
  if (saveGoal) {
    saveGoal.addEventListener("click", async () => {
      const name = c.querySelector("#gName").value.trim();
      const target = Number(c.querySelector("#gTarget").value);
      const rate = Number(c.querySelector("#gRate").value) || 0;
      if (!name) { toast("Enter a name"); return; }
      if (!target || target <= 0) { toast("Enter target"); return; }
      await insert("goals", {
        name,
        target,
        saved: 0,
        interest_rate: rate,
        emoji: c.querySelector("#gEmoji").value.trim() || null,
        deadline: c.querySelector("#gDeadline").value || null,
      });
      toast("Goal created!");
      render();
    });
  }
  c.querySelectorAll("[data-addgoal]").forEach((b) => {
    b.addEventListener("click", async () => {
      const id = b.dataset.addgoal;
      const amtStr = prompt("Add how much to this goal? (₹)");
      const amt = Number(amtStr);
      if (!amt || amt <= 0) return;
      const g = (await list("goals")).find((x) => x.id === id);
      if (!g) return;
      await update("goals", id, { saved: Number(g.saved) + amt });
      toast("Added to goal!");
      render();
    });
  });
  c.querySelectorAll("[data-delgoal]").forEach((b) => {
    b.addEventListener("click", async () => {
      if (!confirm("Delete this goal?")) return;
      await remove("goals", b.dataset.delgoal);
      toast("Deleted");
      render();
    });
  });
  const saveAs = c.querySelector("#saveAs");
  if (saveAs) {
    saveAs.addEventListener("click", () => {
      sset("autosave", {
        enabled: c.querySelector("#asEnabled").checked,
        pct: Number(c.querySelector("#asPct").value) || 0,
        goal_id: c.querySelector("#asGoal").value || null,
      });
      toast("Auto-save saved");
      syncAutoGoals().then(() => render());
    });
  }
}

// ---------- Pocket-money → goal auto-save pipeline ----------
async function syncAutoGoals() {
  const as = autosaveSettings();
  if (!as.enabled) return;
  const pct = Number(as.pct) || 0;
  if (pct <= 0) return;
  const goals = await list("goals");
  if (!goals.length) return;
  const doneIds = sget("autosave_done", []);
  const txs = await list("transactions");
  const pending = txs.filter(
    (t) => t.type === "in" && (t.category || "").toLowerCase() === "pocket money" && !doneIds.includes(t.id)
  );
  if (!pending.length) return;
  const target = goals.find((g) => g.id === as.goal_id) || goals.find((g) => Number(g.saved) < Number(g.target)) || goals[0];
  let moved = 0;
  for (const t of pending) {
    const amt = (Number(t.amount) * pct) / 100;
    if (amt > 0) {
      moved += amt;
      target.saved = Number(target.saved) + amt;
      await update("goals", target.id, { saved: target.saved });
    }
    doneIds.push(t.id);
  }
  sset("autosave_done", doneIds.slice(-1000));
  toast(`Auto-saved ${money(moved)} to "${target.name}" 🎯`);
}

// ---------- Owe ----------
async function renderOwe(c) {
  const debts = await list("debts");
  const open = debts.filter((d) => !d.settled);
  const settled = debts.filter((d) => d.settled);

  // summary
  let iOwe = 0, owedToMe = 0;
  open.forEach((d) => {
    if (d.direction === "owe") iOwe += Number(d.amount);
    else owedToMe += Number(d.amount);
  });

  const renderDebt = (d) => `
    <div class="item">
      <div class="left">
        <div class="title">${escapeHtml(d.person)} ${d.settled ? "✅" : ""}</div>
        <div class="sub">${d.direction === "owe" ? "I owe" : "Owes me"} · ${escapeHtml(d.note || "")}</div>
      </div>
      <div class="amt ${d.direction === "owe" ? "neg" : "pos"}">${money(d.amount)}</div>
      <div class="actions">
        ${!d.settled ? `<button data-settle="${d.id}" title="Settle">✅</button>` : ""}
        <button data-deld="${d.id}" title="Delete">🗑️</button>
      </div>
    </div>`;

  c.innerHTML = `
    <div class="stat-grid">
      <div class="stat"><div class="label">I owe</div><div class="value neg">${money(iOwe)}</div></div>
      <div class="stat"><div class="label">Owed to me</div><div class="value pos">${money(owedToMe)}</div></div>
    </div>

    <div class="card-block">
      <div class="section-title" style="margin-top:0">New entry</div>
      <div class="toggle-row">
        <button data-d="owe" class="${debtDir === "owe" ? "active" : ""}">I owe them</button>
        <button data-d="owed" class="${debtDir === "owed" ? "active" : ""}">They owe me</button>
      </div>
      <div class="form-group"><label>Person</label><input id="dPerson" placeholder="e.g. Rahul" /></div>
      <div class="form-group"><label>Amount (₹)</label><input id="dAmount" type="number" min="0" step="0.01" /></div>
      <div class="form-group"><label>Note</label><input id="dNote" placeholder="e.g. lunch split" /></div>
      <button id="saveDebt" class="btn primary">Save</button>
    </div>

    <div class="section-title">Open</div>
    <div class="list">${open.length ? open.map(renderDebt).join("") : `<div class="empty">Nothing open.</div>`}</div>

    ${settled.length ? `<div class="section-title">Settled</div><div class="list">${settled.map(renderDebt).join("")}</div>` : ""}
  `;

  c.querySelectorAll("[data-d]").forEach((b) => {
    b.addEventListener("click", () => { debtDir = b.dataset.d; renderOwe(c); });
  });
  $("#saveDebt").addEventListener("click", async () => {
    const person = $("#dPerson").value.trim();
    const amt = Number($("#dAmount").value);
    if (!person) { toast("Enter person"); return; }
    if (!amt || amt <= 0) { toast("Enter amount"); return; }
    await insert("debts", { person, amount: amt, direction: debtDir, note: $("#dNote").value.trim(), settled: false });
    toast("Saved!");
    render();
  });
  c.querySelectorAll("[data-settle]").forEach((b) => {
    b.addEventListener("click", async () => {
      await update("debts", b.dataset.settle, { settled: true });
      toast("Settled!");
      render();
    });
  });
  c.querySelectorAll("[data-deld]").forEach((b) => {
    b.addEventListener("click", async () => {
      if (!confirm("Delete?")) return;
      await remove("debts", b.dataset.deld);
      toast("Deleted");
      render();
    });
  });
}

// ---------- More ----------
async function renderTxns(c) {
  const txs = await list("transactions");
  const search = (window._txSearch || "");
  const catFilter = (window._txCat || "all");
  const filtered = txs.filter((t) => {
    const q = search.toLowerCase();
    const matchQ = !q || (t.note || "").toLowerCase().includes(q) || (t.category || "").toLowerCase().includes(q) || (t.tags || "").toLowerCase().includes(q);
    const matchCat = catFilter === "all" || t.category === catFilter;
    return matchQ && matchCat;
  });

  const cats = [...new Set(txs.map((t) => t.category).filter(Boolean))];

  const listHtml = filtered.length
    ? filtered.map((t) => `
      <div class="item">
        <div class="left">
          <div class="title">${escapeHtml(t.category || (t.type === "in" ? "Income" : "Expense"))} ${t.tags ? t.tags.split(",").map((x) => `<span class="tag">${escapeHtml(x.trim())}</span>`).join("") : ""}</div>
          <div class="sub">${escapeHtml(t.note || "")} · ${fmtDate(t.tdate || t.created_at)}</div>
        </div>
        <div class="amt ${t.type === "in" ? "pos" : "neg"}">${t.type === "in" ? "+" : "-"}${money(t.amount)}</div>
        <div class="actions">
          <button data-del-tx="${t.id}" title="Delete">🗑️</button>
        </div>
      </div>`).join("")
    : `<div class="empty">No matching transactions.</div>`;

  c.innerHTML = `
    <div class="card-block">
      <div class="section-title" style="margin-top:0">All transactions</div>
      <div class="search-bar">
        <input id="txSearch" type="text" placeholder="search note/category/tag" value="${escapeHtml(search)}" />
        <select id="txCatFilter">
          <option value="all">all categories</option>
          ${cats.map((ct) => `<option value="${escapeHtml(ct)}" ${ct === catFilter ? "selected" : ""}>${escapeHtml(ct)}</option>`).join("")}
        </select>
      </div>
      <div class="sub">${filtered.length} of ${txs.length}</div>
    </div>
    <div class="list">${listHtml}</div>
  `;

  $("#txSearch").addEventListener("input", (e) => { window._txSearch = e.target.value; renderTxns(c); });
  $("#txCatFilter").addEventListener("change", (e) => { window._txCat = e.target.value; renderTxns(c); });
  c.querySelectorAll("[data-del-tx]").forEach((b) => {
    b.addEventListener("click", async () => {
      if (!confirm("Delete this transaction?")) return;
      await remove("transactions", b.dataset.delTx);
      toast("Deleted");
      render();
    });
  });
}

async function renderMore(c) {
  const budget = sget("budget", 0);
  const rec = sget("recurring", { amount: 0, day: 1, lastRun: "" });
  const reminders = await list("reminders");
  const remList = reminders.length
    ? reminders.map((r) => `
      <div class="item reminder-item ${r.done ? "opacity-60" : ""}">
        <div class="left">
          <div class="title">${escapeHtml(r.title)} ${r.recurring ? "🔁" : ""} ${r.done ? "✅" : ""}</div>
          <div class="sub">due ${r.due_date}${r.amount ? " · " + money(r.amount) : ""}</div>
        </div>
        <div class="actions">
          ${!r.done ? `<button data-remd="${r.id}" title="Mark done">✅</button>` : ""}
          <button data-remdel="${r.id}" title="Delete">🗑️</button>
        </div>
      </div>`).join("")
    : `<div class="empty">No reminders.</div>`;

  c.innerHTML = `
    <div class="card-block">
      <div class="section-title" style="margin-top:0">Mode</div>
      <p class="muted small">Storage: ${MODE === "supabase" ? "Supabase (cloud)" : "Local (demo, this device only)"}</p>
    </div>

    <div class="card-block">
      <div class="section-title" style="margin-top:0">Monthly budget (₹)</div>
      <div class="form-group"><input id="budgetInput" type="number" min="0" value="${budget}" placeholder="0 = off" /></div>
      <button id="saveBudget" class="btn primary">Save budget</button>
    </div>

    <div class="card-block">
      <div class="section-title" style="margin-top:0">Recurring pocket money</div>
      <div class="form-group"><label>Amount (₹)</label><input id="recAmt" type="number" min="0" value="${rec.amount || 0}" /></div>
      <div class="form-group"><label>Day of month</label><input id="recDay" type="number" min="1" max="28" value="${rec.day || 1}" /></div>
      <button id="saveRec" class="btn primary">Save recurring</button>
      <p class="muted small">Auto-adds income on/after that day each month.</p>
    </div>

    <div class="card-block">
      <div class="section-title" style="margin-top:0">Bills &amp; reminders</div>
      <div class="row">
        <div class="form-group"><label>What</label><input id="rTitle" placeholder="e.g. bus pass" /></div>
        <div class="form-group"><label>₹ (opt)</label><input id="rAmt" type="number" min="0" placeholder="0" /></div>
      </div>
      <div class="form-group"><label>Due date</label><input id="rDate" type="date" value="${new Date().toISOString().slice(0, 10)}" /></div>
      <div class="form-group"><label><input id="rRecur" type="checkbox" /> repeats monthly</label></div>
      <button id="saveRem" class="btn primary">Add reminder</button>
      <div class="list" style="margin-top:10px">${remList}</div>
    </div>

    <div class="card-block">
      <div class="section-title" style="margin-top:0">Change password</div>
      <div class="form-group"><input id="newPw" type="password" placeholder="New password" /></div>
      <button id="changePw" class="btn primary">Change</button>
    </div>

    <div class="card-block">
      <div class="section-title" style="margin-top:0">Data</div>
      <button id="exportJsonBtn" class="btn ghost block">Export JSON</button>
      <button id="exportCsvBtn" class="btn ghost block">Export CSV</button>
      <button id="clearBtn" class="btn danger block">Clear all data</button>
    </div>

    <div class="card-block">
      <div class="section-title" style="margin-top:0">Stats</div>
      <div id="statsBox" class="muted small">Loading…</div>
    </div>

    <p class="muted small" style="text-align:center;margin-top:20px">
      MahMoney · client-side auth · not secure. Don't store real money info you can't lose.
    </p>
  `;

  $("#saveBudget").addEventListener("click", () => {
    const v = Number($("#budgetInput").value) || 0;
    sset("budget", v);
    toast("Budget saved");
    render();
  });

  $("#saveRec").addEventListener("click", () => {
    const r = { amount: Number($("#recAmt").value) || 0, day: Number($("#recDay").value) || 1, lastRun: sget("recurring", {}).lastRun || "" };
    sset("recurring", r);
    toast("Recurring saved");
  });

  $("#saveRem").addEventListener("click", async () => {
    const title = $("#rTitle").value.trim();
    if (!title) { toast("Enter what it is"); return; }
    await insert("reminders", {
      title,
      amount: Number($("#rAmt").value) || null,
      due_date: $("#rDate").value,
      recurring: $("#rRecur").checked,
      done: false,
    });
    toast("Reminder added");
    render();
  });
  c.querySelectorAll("[data-remd]").forEach((b) => {
    b.addEventListener("click", async () => {
      await doneReminder(b.dataset.remd);
      render();
    });
  });
  c.querySelectorAll("[data-remdel]").forEach((b) => {
    b.addEventListener("click", async () => {
      if (!confirm("Delete this reminder?")) return;
      await remove("reminders", b.dataset.remdel);
      toast("Deleted");
      render();
    });
  });

  $("#changePw").addEventListener("click", async () => {
    const pw = $("#newPw").value;
    if (!pw || pw.length < 3) { toast("Too short"); return; }
    await setupPassword(pw);
    toast("Password changed. Locking…");
    setTimeout(() => { logout(); location.reload(); }, 1200);
  });

  $("#exportJsonBtn").addEventListener("click", async () => {
    const data = {
      transactions: await list("transactions"),
      goals: await list("goals"),
      debts: await list("debts"),
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "mahmoney-export.json"; a.click();
    URL.revokeObjectURL(url);
    toast("Exported");
  });

  $("#exportCsvBtn").addEventListener("click", async () => {
    const txs = await list("transactions");
    const header = "date,type,amount,category,note,tags";
    const rows = txs.map((t) => [
      t.tdate || (t.created_at || "").slice(0, 10),
      t.type,
      t.amount,
      (t.category || "").replace(/,/g, " "),
      (t.note || "").replace(/,/g, " "),
      (t.tags || "").replace(/,/g, "; "),
    ].join(","));
    const csv = [header, ...rows].join("\\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "mahmoney-transactions.csv"; a.click();
    URL.revokeObjectURL(url);
    toast("CSV exported");
  });

  $("#clearBtn").addEventListener("click", async () => {
    if (!confirm("Delete ALL data? This cannot be undone.")) return;
    await clearAll();
    toast("Cleared");
    render();
  });

  // stats
  loadStats();
}

async function loadStats() {
  const txs = await list("transactions");
  const byCat = {};
  txs.filter((t) => t.type === "out").forEach((t) => {
    const k = t.category || "Other";
    byCat[k] = (byCat[k] || 0) + Number(t.amount);
  });
  const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, e) => s + e[1], 0) || 1;
  const box = $("#statsBox");
  if (!entries.length) { box.innerHTML = "No spending yet."; return; }
  box.innerHTML = entries.map(([k, v]) => {
    const pct = Math.round((v / total) * 100);
    return `<div style="margin:6px 0">
      <div style="display:flex;justify-content:space-between;font-size:13px"><span>${escapeHtml(k)}</span><span>${money(v)} (${pct}%)</span></div>
      <div class="progress"><div style="width:${pct}%"></div></div>
    </div>`;
  }).join("");
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- Settings helpers ----------
const SKEY = "mahmoney_set_";
function sget(key, def = null) {
  try { const v = localStorage.getItem(SKEY + key); return v === null ? def : JSON.parse(v); }
  catch { return def; }
}
function sset(key, val) { localStorage.setItem(SKEY + key, JSON.stringify(val)); }

// ---------- Recurring pocket money ----------
async function runRecurring() {
  const r = sget("recurring", { amount: 0, day: 1, lastRun: "" });
  if (!r || !r.amount || r.amount <= 0) return;
  const now = new Date();
  const ym = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
  if (r.lastRun === ym) return;
  if (now.getDate() < (r.day || 1)) return;
  try {
    await insert("transactions", {
      type: "in",
      amount: r.amount,
      category: "Pocket money",
      note: "Auto monthly pocket money",
      tdate: now.toISOString().slice(0, 10),
    });
    r.lastRun = ym;
    sset("recurring", r);
    toast("Pocket money added (auto)!");
  } catch (e) { console.error(e); }
}

// ---------- Init ----------
(async function init() {
  $("#modeBadge").textContent = MODE === "supabase" ? "☁️ Cloud" : "📱 Local";
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
  const ok = await initAuth();
  if (ok) {
    await runRecurring();
    await syncAutoGoals();
    render();
  }
})();
