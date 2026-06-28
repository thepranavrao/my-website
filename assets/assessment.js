/* ===================================================================
   POSH Compass — assessment engine (dual-mode)
   ONLINE  : auth + server-supplied questions + server-side grading + saved
             attempts + issued certificate (FastAPI backend).
   OFFLINE : self-contained demo using assets/questions.js (file:// fallback).
   States: auth -> start -> quiz -> results (+ certificate)
   =================================================================== */

const root = document.getElementById('assess-root');

const state = {
  online: false,
  learner: { name: 'Priya Sharma', org: 'Department of Public Administration', dept: 'HR' },
  items: [],
  idx: 0,
  attemptId: null,
  checked: false
};

/* ---------- utils ---------- */
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
function shuffle(a) { const x = a.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[x[i], x[j]] = [x[j], x[i]]; } return x; }
const KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];

/* ---------- boot ---------- */
async function boot() {
  await API.init();
  state.online = API.online;
  if (state.online && !API.loggedIn) return renderAuth();
  if (state.online && API.loggedIn) {
    try {
      const me = await API.get('/me');
      state.learner = { name: me.name, org: me.org, dept: me.department, role: me.role };
      setUser(me.name, me.role === 'admin' ? 'Admin' : 'Learner');
    } catch (_) { return renderAuth(); }
  }
  renderStart();
}
function setUser(name, role) {
  const n = document.getElementById('userName'), a = document.getElementById('userAv'), r = document.getElementById('userRole');
  if (n) n.textContent = name;
  if (a) a.textContent = (name[0] || 'L').toUpperCase();
  if (r) r.textContent = role;
}

/* ============================================================
   AUTH (online only)
   ============================================================ */
function renderAuth(mode = 'login', msg = '') {
  const isLogin = mode === 'login';
  root.innerHTML = `
    <div class="assess-head">
      <h1>POSH Compass — ${isLogin ? 'Sign in' : 'Register Organisation'}</h1>
      <span class="knock">— Proof, not attendance</span>
    </div>
    <div class="assess-grid" style="grid-template-columns: 1fr 420px;">
      <div class="panel" style="padding:30px;">
        <div style="display:flex; gap:10px; margin-bottom:22px;">
          <button class="btn ${isLogin ? 'btn-orange' : 'btn-outline-green'}" onclick="renderAuth('login')">Login</button>
          <button class="btn ${!isLogin ? 'btn-orange' : 'btn-outline-green'}" onclick="renderAuth('register')">Register Organisation</button>
        </div>
        ${msg ? `<div class="feedback bad show" style="margin:0 0 16px;">${esc(msg)}</div>` : ''}
        ${!isLogin ? `
          <label class="flbl">Organisation name</label>
          <input id="aOrg" class="fib-input" placeholder="e.g. Acme Pvt Ltd" />
          <label class="flbl">Your name</label>
          <input id="aName" class="fib-input" placeholder="Full name" />
          <label class="flbl">Department</label>
          <input id="aDept" class="fib-input" value="HR" />` : ''}
        <label class="flbl">Email</label>
        <input id="aEmail" class="fib-input" type="email" placeholder="you@org.in" />
        <label class="flbl">Password</label>
        <input id="aPass" class="fib-input" type="password" placeholder="••••••••" onkeydown="if(event.key==='Enter')doAuth('${mode}')" />
        <button class="btn btn-orange btn-lg" style="margin-top:22px;" onclick="doAuth('${mode}')">${isLogin ? 'Sign in →' : 'Create account →'}</button>
      </div>
      <aside class="rail" style="align-self:start;">
        <h4>Try the demo</h4>
        <div class="rsub">A pre-loaded admin account with live dashboard data.</div>
        <div class="rbox" style="text-align:left;">
          <div style="font-size:13px; color:#bcd3c6;">Email</div>
          <div style="font-weight:700; margin-bottom:10px;">admin@demo.gov</div>
          <div style="font-size:13px; color:#bcd3c6;">Password</div>
          <div style="font-weight:700;">demo1234</div>
          <button class="btn btn-green" style="margin-top:16px; width:100%;" onclick="demoLogin()">Use demo account</button>
        </div>
        <p style="font-size:12.5px; color:#9fc0ae; margin-top:14px;">Or register a fresh organisation — you'll be its first admin.</p>
      </aside>
    </div>`;
}
function demoLogin() {
  document.getElementById('aEmail').value = 'admin@demo.gov';
  document.getElementById('aPass').value = 'demo1234';
  doAuth('login');
}
async function doAuth(mode) {
  const email = (document.getElementById('aEmail').value || '').trim();
  const password = document.getElementById('aPass').value || '';
  if (!email || !password) return renderAuth(mode, 'Email and password are required.');
  try {
    let res;
    if (mode === 'register') {
      const orgName = (document.getElementById('aOrg').value || '').trim();
      const name = (document.getElementById('aName').value || '').trim();
      const department = (document.getElementById('aDept').value || 'HR').trim();
      if (!orgName || !name) return renderAuth(mode, 'Organisation and your name are required.');
      res = await API.post('/auth/register', { orgName, name, email, password, department });
    } else {
      res = await API.post('/auth/login', { email, password });
    }
    API.setToken(res.token);
    await boot();
  } catch (e) {
    renderAuth(mode, e.message || 'Something went wrong.');
  }
}
function logout() { API.clearToken(); renderAuth(); }

/* ============================================================
   START
   ============================================================ */
function buildItemsOffline() {
  const items = [];
  MODULE_ORDER.forEach(modId => {
    const mod = QUESTION_BANK[modId];
    mod.questions.forEach(q => items.push({
      modId, modNo: mod.no, modTitle: mod.title, modSub: mod.sub, type: modId, q, result: null
    }));
  });
  return items;
}
function moduleMeta() {
  if (state.online) return null; // not needed
  return MODULE_ORDER.map(id => QUESTION_BANK[id]);
}

function renderStart() {
  const mods = state.online
    ? [
      { title: 'Multiple Choice', sub: 'What legally counts', n: 4, full: 200 },
      { title: 'Fill in the Blank', sub: 'Recall the detail', n: 4, full: 500 },
      { title: 'Match the Following', sub: 'Map the provisions', n: 2, full: 300 },
      { title: 'Case Studies', sub: 'Real judgement', n: 2, full: 108 },
      { title: 'Live Simulations', sub: 'Branching choices', n: 2, full: 100 }
    ]
    : moduleMeta().map(m => ({ title: m.title, sub: m.sub, n: m.questions.length, full: m.fullCount }));

  root.innerHTML = `
    <div class="assess-head">
      <h1>POSH Compass — Assessment</h1>
      <span class="knock">— Prove you understand</span>
      <div class="sub">A short, Act-aligned knowledge check across five formats. Score <b>≥80%</b> to earn your certificate.
        ${state.online ? `Signed in as <b>${esc(state.learner.name)}</b> · ${esc(state.learner.org)} <a href="#" onclick="logout();return false;" style="color:var(--orange); font-weight:600;">(log out)</a>` : 'Running in offline demo mode.'}</div>
    </div>

    <div class="assess-grid" style="grid-template-columns: 1fr 360px;">
      <div class="panel" style="padding:30px;">
        <div class="panel-title">Before you begin</div>
        <p style="color:var(--ink-soft); font-size:15px; line-height:1.6; margin-top:0;">
          ${state.online
            ? 'Every attempt, score and certificate is logged to your organisation\'s audit trail. Your details below will appear on the certificate.'
            : 'Enter your details — they will appear on your certificate of completion.'}
        </p>
        <label class="flbl">Full name</label>
        <input id="inName" class="fib-input" value="${esc(state.learner.name)}" />
        <label class="flbl">Organisation</label>
        <input id="inOrg" class="fib-input" value="${esc(state.learner.org)}" ${state.online ? 'readonly style="background:#f3f3ee;color:#777;"' : ''} />
        <label class="flbl">Department</label>
        <input id="inDept" class="fib-input" value="${esc(state.learner.dept || 'HR')}" />
        <button class="btn btn-orange btn-lg" style="margin-top:24px;" id="beginBtn" onclick="startQuiz()">Begin Assessment →</button>
      </div>

      <div class="rail" style="align-self:start;">
        <h4>What you'll be tested on</h4>
        <div class="rsub">Demo subset · full programme in brackets</div>
        <div style="text-align:left;">
          ${mods.map(m => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:11px 0; border-bottom:1px solid rgba(255,255,255,.12);">
              <div><b style="font-size:14.5px;">${m.title}</b><br><small style="color:#bcd3c6;">${m.sub}</small></div>
              <div style="text-align:right; color:var(--green-bright-2); font-weight:700;">${m.n}<br><small style="color:#9fc0ae; font-weight:400;">of ${m.full}</small></div>
            </div>`).join('')}
        </div>
      </div>
    </div>

    <div class="chips">
      <div class="chip"><div class="ci">✍️</div><div><b>Fill-in-the-blank</b><small>recall, not recognition</small></div></div>
      <div class="chip"><div class="ci">🔗</div><div><b>Match the following</b><small>map the provisions</small></div></div>
      <div class="chip"><div class="ci">☑️</div><div><b>Multiple choice</b><small>best answer</small></div></div>
      <div class="chip"><div class="ci">📚</div><div><b>Case studies</b><small>real judgement</small></div></div>
      <div class="chip"><div class="ci">🎭</div><div><b>Live simulations</b><small>branching choices</small></div></div>
    </div>`;
}

async function startQuiz() {
  state.learner.name = (document.getElementById('inName').value || 'Learner').trim();
  if (!state.online) state.learner.org = (document.getElementById('inOrg').value || '—').trim();
  state.learner.dept = (document.getElementById('inDept').value || '—').trim();
  setUser(state.learner.name, state.online ? (state.learner.role === 'admin' ? 'Admin' : 'Learner') : 'Learner');

  if (state.online) {
    const btn = document.getElementById('beginBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }
    try {
      const data = await API.post('/attempts', {});
      state.attemptId = data.attemptId;
      state.items = data.items.map(it => Object.assign({}, it, { result: null }));
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = 'Begin Assessment →'; }
      alert('Could not start attempt: ' + e.message);
      return;
    }
  } else {
    state.items = buildItemsOffline();
  }
  state.idx = 0;
  resetPicks();
  renderQuiz();
}

/* ============================================================
   QUIZ
   ============================================================ */
function moduleList() {
  // distinct modules in order, with progress
  const seen = [];
  state.items.forEach(i => { if (!seen.find(s => s.id === i.modId)) seen.push({ id: i.modId, no: i.modNo, title: i.modTitle, sub: i.modSub }); });
  return seen;
}
function moduleProgress(modId) {
  const its = state.items.filter(i => i.modId === modId);
  const done = its.filter(i => i.result !== null).length;
  return { done, total: its.length, pct: its.length ? Math.round(done / its.length * 100) : 0 };
}
function runningScore() {
  let earned = 0, max = 0;
  state.items.forEach(i => { if (i.result) { earned += i.result.earned; max += i.result.max; } });
  return { earned, max, pct: max ? Math.round(earned / max * 100) : 0 };
}

function renderQuiz() {
  const item = state.items[state.idx];
  state.checked = item.result !== null;
  const rs = runningScore();
  const answered = state.items.filter(i => i.result !== null).length;
  const overallPct = Math.round(answered / state.items.length * 100);

  root.innerHTML = `
    <div class="assess-head">
      <h1>POSH Compass — Assessment</h1>
      <span class="knock">— Knowledge that sticks</span>
      <div class="sub">Short, scenario-driven checks designed for how adults actually remember. Answer, check, and advance.</div>
    </div>

    <div class="assess-grid">
      <aside class="panel">
        <div class="panel-title">Core Modules</div>
        ${moduleList().map(m => {
          const p = moduleProgress(m.id);
          const isActive = item.modId === m.id;
          const isDone = p.done === p.total && p.total > 0;
          return `
          <div class="mod ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}">
            <div class="mbadge">${isDone ? '✓' : m.no}</div>
            <div class="mtxt">
              <b>${esc(m.title)}</b><small>${esc(m.sub)}</small>
              <span class="pct">${p.pct}%</span>
              <div class="bar"><i style="width:${p.pct}%"></i></div>
            </div>
          </div>`;
        }).join('')}
      </aside>

      <section class="qcard">
        ${renderHero(item, overallPct)}
        <div class="q-body" id="qbody">${renderBody(item)}</div>
        <div class="feedback" id="feedback"></div>
        <div class="q-nav">
          <span class="count">Question ${state.idx + 1} of ${state.items.length}</span>
          <div style="display:flex; gap:12px;">
            ${state.idx > 0 ? `<button class="btn btn-outline-green" onclick="goPrev()">← Back</button>` : ''}
            <button class="btn btn-orange" id="primaryBtn" onclick="primaryAction()">${item.result !== null ? nextLabel() : 'Check Answer'}</button>
          </div>
        </div>
      </section>

      <aside class="rail">
        <h4>On web &amp; mobile</h4>
        <div class="rsub">${state.online ? 'Saved to your audit trail.' : 'Self-paced. Offline demo.'}</div>
        <div class="rbox">
          <div class="score-circle">${rs.pct}%</div>
          <div style="font-size:12px; color:#bcd3c6;">running score</div>
          <div class="rbar"><i style="width:${overallPct}%"></i></div>
          <div id="answeredTxt" style="font-size:12px; color:#bcd3c6;">${answered} of ${state.items.length} answered</div>
          <hr style="border:none; border-top:1px solid rgba(255,255,255,.14); margin:16px 0;">
          <div class="cert-state" style="color:${rs.pct >= 80 ? 'var(--green-bright-2)' : 'var(--gold-light)'}">
            ${rs.pct >= 80 ? '✓ On track · Certified ≥ 80%' : 'Below 80% — keep going'}
          </div>
        </div>
      </aside>
    </div>

    <div class="chips">
      <div class="chip"><div class="ci">📘</div><div><b>Micro-lessons</b><small>2–4 min chunks</small></div></div>
      <div class="chip"><div class="ci">🎬</div><div><b>Scenarios</b><small>real choices</small></div></div>
      <div class="chip"><div class="ci">📚</div><div><b>Case stories</b><small>real-life inspired</small></div></div>
      <div class="chip"><div class="ci">🌿</div><div><b>Decision trees</b><small>what would you do?</small></div></div>
    </div>`;

  if (item.result !== null) lockAndReveal(item);
}

function nextLabel() { return state.idx === state.items.length - 1 ? 'See Results →' : 'Next →'; }

/* ---------- HERO ---------- */
function renderHero(item, overallPct) {
  const meta = `Module ${item.modNo} of 5 · ${item.modTitle}`;
  if (item.type === 'simulation') {
    const q = item.q;
    return `
      <div class="q-hero">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div class="meta" style="text-transform:uppercase; letter-spacing:1px;">Live Simulation</div>
          <div style="color:#bcd3c6; font-size:13px;">${esc(q.branch)}</div>
        </div>
        <h2 style="font-size:24px; margin-bottom:14px;">${esc(q.label)}</h2>
        <div class="sim-card" style="background:var(--green-900);">
          <div class="eye">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#cfe9d6" stroke-width="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>
          </div>
          <p>${esc(q.scenario)}</p>
        </div>
        <div class="q-progress"><i style="width:${overallPct}%"></i></div>
        <div class="foot">Choices branch the story — consequences shown in real time.</div>
      </div>`;
  }
  if (item.type === 'caseStudy') {
    return `
      <div class="q-hero">
        <div class="meta">${esc(meta)} <span class="qtype">CASE STUDY</span></div>
        <h2 style="font-size:22px;">Workplace Incident</h2>
        <div class="scenario">${esc(item.q.scenario)}</div>
        <div class="q-progress"><i style="width:${overallPct}%"></i></div>
        <div class="foot">Read the situation, then answer each question below.</div>
      </div>`;
  }
  const titles = { mcq: item.q.text, fib: 'Complete the statement', mtf: 'Match the following' };
  const chips = { mcq: 'MULTIPLE CHOICE', fib: 'FILL IN THE BLANK', mtf: 'MATCH THE FOLLOWING' };
  return `
    <div class="q-hero">
      <div class="meta">${esc(meta)} <span class="qtype">${chips[item.type]}</span></div>
      <h2>${esc(titles[item.type])}</h2>
      <div class="q-progress"><i style="width:${overallPct}%"></i></div>
      <div class="foot">Micro-lesson · auto-advances to the next check</div>
    </div>`;
}

/* ---------- BODY ---------- */
function renderBody(item) {
  switch (item.type) {
    case 'mcq': return bodyMCQ(item.q);
    case 'fib': return bodyFIB(item);
    case 'mtf': return bodyMTF(item);
    case 'caseStudy': return bodyCase(item);
    case 'simulation': return bodySim(item.q);
  }
  return '';
}
function bodyMCQ(q) {
  return `
    <div class="prompt">Quick Check · Choose the best answer</div>
    <div class="qtext">${esc(q.text)}</div>
    <div id="mcqOpts">
      ${q.options.map((o, i) => `
        <div class="opt" data-i="${i}" onclick="selMCQ(${i})">
          <div class="key">${KEYS[i]}</div><div class="otext">${esc(o)}</div>
        </div>`).join('')}
    </div>`;
}
function bodyFIB(item) {
  const q = item.q;
  return `
    <div class="prompt">Fill in the blank · Type the missing word</div>
    <div class="fib-sentence" style="margin-top:14px;">
      ${esc(q.before)} <input class="blank" id="fibInput" autocomplete="off" placeholder="?" /> ${esc(q.after)}
    </div>`;
}
function bodyMTF(item) {
  const q = item.q;
  const rights = shuffle(q.rights ? q.rights.slice() : q.pairs.map(p => p.right));
  return `
    <div class="prompt">Match the following</div>
    <div class="qtext" style="font-size:15px;">${esc(q.instruction)}</div>
    <div id="mtfRows">
      ${q.pairs.map((p, i) => `
        <div class="mtf-row" data-i="${i}">
          <div class="left"><b>${i + 1}.</b> ${esc(p.left)}</div>
          <select id="mtf${i}">
            <option value="">— select —</option>
            ${rights.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('')}
          </select>
        </div>`).join('')}
    </div>`;
}
function bodyCase(item) {
  const q = item.q;
  return `
    <div class="prompt">Case analysis · ${q.subs.length} questions</div>
    ${q.subs.map((s, si) => `
      <div class="case-sub" data-si="${si}">
        <div class="qtext">${si + 1}. ${esc(s.text)}</div>
        <div class="caseOpts">
          ${s.options.map((o, i) => `
            <div class="opt" data-si="${si}" data-i="${i}" onclick="selCase(${si},${i})">
              <div class="key">${KEYS[i]}</div><div class="otext">${esc(o)}</div>
            </div>`).join('')}
        </div>
      </div>`).join('')}`;
}
function bodySim(q) {
  return `
    <div class="prompt">${esc(q.question)}</div>
    <div id="simOpts" style="margin-top:14px;">
      ${q.options.map((o, i) => `
        <div class="opt" data-i="${i}" onclick="selSim(${i})">
          <div class="key"></div><div class="otext">${esc(o.text)}</div>
        </div>`).join('')}
    </div>
    <p style="color:var(--muted); font-size:13px; margin-top:8px;">Choices branch the story — learners see the consequences of each response in real time.</p>`;
}

/* ---------- selection ---------- */
let pick = { mcq: null, sim: null, case: {} };
function resetPicks() { pick = { mcq: null, sim: null, case: {} }; }
function selMCQ(i) { if (state.checked) return; pick.mcq = i; document.querySelectorAll('#mcqOpts .opt').forEach(el => el.classList.toggle('selected', +el.dataset.i === i)); }
function selSim(i) { if (state.checked) return; pick.sim = i; document.querySelectorAll('#simOpts .opt').forEach(el => el.classList.toggle('selected', +el.dataset.i === i)); }
function selCase(si, i) { if (state.checked) return; pick.case[si] = i; document.querySelectorAll(`.caseOpts .opt[data-si="${si}"]`).forEach(el => el.classList.toggle('selected', +el.dataset.i === i)); }

/* ---------- primary button ---------- */
async function primaryAction() {
  const item = state.items[state.idx];
  if (item.result === null) { await gradeCurrent(); }
  else if (state.idx === state.items.length - 1) { await goToResults(); }
  else { state.idx++; resetPicks(); renderQuiz(); }
}
function goPrev() { if (state.idx > 0) { state.idx--; resetPicks(); renderQuiz(); } }

/* ---------- collect the learner's answer from the DOM ---------- */
function buildGiven(item) {
  const q = item.q;
  if (item.type === 'mcq') {
    if (pick.mcq === null) return { ok: false, msg: 'Select an answer first.' };
    return { ok: true, value: { index: pick.mcq } };
  }
  if (item.type === 'fib') {
    const text = (document.getElementById('fibInput').value || '').trim();
    if (!text) return { ok: false, msg: 'Type your answer first.' };
    return { ok: true, value: { text } };
  }
  if (item.type === 'mtf') {
    const map = {};
    for (let i = 0; i < q.pairs.length; i++) {
      const v = document.getElementById('mtf' + i).value;
      if (!v) return { ok: false, msg: 'Match every item first.' };
      map[q.pairs[i].left] = v;
    }
    return { ok: true, value: { map } };
  }
  if (item.type === 'caseStudy') {
    const subs = [];
    for (let si = 0; si < q.subs.length; si++) {
      if (pick.case[si] === undefined) return { ok: false, msg: 'Answer every question in the case first.' };
      subs.push(pick.case[si]);
    }
    return { ok: true, value: { subs } };
  }
  if (item.type === 'simulation') {
    if (pick.sim === null) return { ok: false, msg: 'Choose how you would respond.' };
    return { ok: true, value: { index: pick.sim } };
  }
  return { ok: false, msg: 'Unsupported question.' };
}

/* ---------- offline grading (mirrors backend scoring.py) ---------- */
function localGrade(item, given) {
  const q = item.q;
  if (item.type === 'mcq') return { earned: given.index === q.answer ? 1 : 0, max: 1 };
  if (item.type === 'fib') { const v = norm(given.text); return { earned: q.answer.some(a => norm(a) === v) ? 1 : 0, max: 1 }; }
  if (item.type === 'mtf') { let e = 0; q.pairs.forEach(p => { if (given.map[p.left] === p.right) e++; }); return { earned: e, max: q.pairs.length }; }
  if (item.type === 'caseStudy') { let e = 0; q.subs.forEach((s, i) => { if (given.subs[i] === s.answer) e++; }); return { earned: e, max: q.subs.length }; }
  if (item.type === 'simulation') { const o = q.options[given.index]; return { earned: (o.verdict === 'recommended' || o.verdict === 'also-correct') ? 1 : 0, max: 1 }; }
  return { earned: 0, max: 1 };
}

/* ---------- apply server's reveal onto item.q so lockAndReveal works ---------- */
function patchReveal(item, reveal) {
  if (!reveal) return;
  const q = item.q;
  if (item.type === 'mcq') { q.answer = reveal.answer; q.explain = reveal.explain; }
  else if (item.type === 'fib') { q.answer = reveal.answer; q.explain = reveal.explain; }
  else if (item.type === 'mtf') { q.pairs = reveal.pairs; q.explain = reveal.explain; }
  else if (item.type === 'caseStudy') { reveal.subs.forEach((s, i) => { q.subs[i].answer = s.index; q.subs[i].explain = s.explain; }); q.explain = reveal.explain; }
  else if (item.type === 'simulation') { reveal.options.forEach((o, i) => { q.options[i].verdict = o.verdict; q.options[i].outcome = o.outcome; }); q.explain = reveal.explain; }
}

/* ---------- grade ---------- */
async function gradeCurrent() {
  const item = state.items[state.idx];
  const g = buildGiven(item);
  if (!g.ok) return flash(g.msg);

  let earned, max;
  if (state.online) {
    const btn = document.getElementById('primaryBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Checking…'; }
    try {
      const res = await API.post(`/attempts/${state.attemptId}/answer`, { questionId: item.qid, given: g.value });
      earned = res.earned; max = res.max; patchReveal(item, res.reveal);
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = 'Check Answer'; }
      return flash('Could not save answer: ' + e.message);
    }
  } else {
    const r = localGrade(item, g.value); earned = r.earned; max = r.max;
  }

  item.result = { earned, max };
  state.checked = true;
  lockAndReveal(item);
  showFeedback(buildFeedback(item, g.value, earned, max), earned === max);
  const btn = document.getElementById('primaryBtn');
  if (btn) { btn.disabled = false; btn.textContent = nextLabel(); }
  refreshSidePanels();
}

function buildFeedback(item, given, earned, max) {
  const q = item.q;
  if (item.type === 'mcq') return explainBlock(earned === 1, q.explain);
  if (item.type === 'fib') return explainBlock(earned === 1, q.explain + (earned ? '' : `<br><br><b style="display:inline">Accepted answer:</b> ${esc(q.answer[0])}`));
  if (item.type === 'mtf') return explainBlock(earned === max, `${earned} of ${max} matched correctly. ${q.explain}`);
  if (item.type === 'caseStudy') return explainBlock(earned === max, q.subs.map((s, si) => `<b style="display:inline">Q${si + 1}:</b> ${esc(s.explain)}`).join('<br><br>'));
  if (item.type === 'simulation') {
    const o = q.options[given.index];
    return explainBlock(earned === 1, `<b style="display:inline">Your choice:</b> ${esc(o.outcome)}<br><br>${esc(q.explain)}`);
  }
  return '';
}
function explainBlock(correct, html) { return `<b>${correct ? '✓ Correct' : '✕ Not quite'}</b>${html}`; }
function showFeedback(html, good) { const f = document.getElementById('feedback'); f.className = 'feedback show ' + (good ? 'good' : 'bad'); f.innerHTML = html; }
function flash(msg) {
  const f = document.getElementById('feedback');
  f.className = 'feedback bad show'; f.innerHTML = `<b>Hold on</b>${esc(msg)}`;
  setTimeout(() => { if (state.items[state.idx].result === null) f.classList.remove('show'); }, 1800);
}

/* ---------- reveal ---------- */
function lockAndReveal(item) {
  const q = item.q;
  if (item.type === 'mcq') {
    document.querySelectorAll('#mcqOpts .opt').forEach(el => {
      const i = +el.dataset.i;
      if (i === q.answer) el.classList.add('correct');
      if (pick.mcq === i && i !== q.answer) el.classList.add('wrong');
    });
  } else if (item.type === 'fib') {
    const inp = document.getElementById('fibInput');
    if (inp) { inp.disabled = true; const ok = item.result && item.result.earned === 1; inp.style.borderBottomColor = ok ? 'var(--green-bright)' : 'var(--risk-high)'; inp.style.background = ok ? '#f3faef' : '#fcefeb'; }
  } else if (item.type === 'mtf') {
    q.pairs.forEach((p, i) => {
      const sel = document.getElementById('mtf' + i), row = document.querySelector(`.mtf-row[data-i="${i}"]`);
      if (!sel) return;
      const ok = sel.value === p.right; sel.disabled = true; row.classList.add(ok ? 'ok' : 'no');
      if (!ok) { const hint = document.createElement('div'); hint.style.cssText = 'grid-column:1/-1; font-size:12.5px; color:var(--green-700); margin-top:-4px;'; hint.innerHTML = `↳ correct match: <b>${esc(p.right)}</b>`; row.appendChild(hint); }
    });
  } else if (item.type === 'caseStudy') {
    q.subs.forEach((s, si) => {
      document.querySelectorAll(`.caseOpts .opt[data-si="${si}"]`).forEach(el => {
        const i = +el.dataset.i;
        if (i === s.answer) el.classList.add('correct');
        if (pick.case[si] === i && i !== s.answer) el.classList.add('wrong');
      });
    });
  } else if (item.type === 'simulation') {
    document.querySelectorAll('#simOpts .opt').forEach(el => {
      const i = +el.dataset.i, opt = q.options[i], tag = document.createElement('div');
      if (opt.verdict === 'recommended') { el.classList.add('correct'); tag.className = 'tag rec'; tag.textContent = 'Recommended'; el.appendChild(tag); }
      else if (opt.verdict === 'also-correct') { el.classList.add('correct'); tag.className = 'tag also'; tag.textContent = 'Also correct'; el.appendChild(tag); }
      else if (pick.sim === i) { el.classList.add('wrong'); }
      const key = el.querySelector('.key');
      if (key) key.innerHTML = (opt.verdict === 'recommended' || opt.verdict === 'also-correct') ? '✓' : (pick.sim === i ? '✕' : '');
    });
  }
}

function refreshSidePanels() {
  const rs = runningScore();
  const answered = state.items.filter(i => i.result !== null).length;
  const overallPct = Math.round(answered / state.items.length * 100);
  document.querySelectorAll('.mod').forEach((el, idx) => {
    const m = moduleList()[idx]; if (!m) return;
    const p = moduleProgress(m.id);
    el.querySelector('.bar i').style.width = p.pct + '%';
    el.querySelector('.pct').textContent = p.pct + '%';
    if (p.done === p.total) { el.classList.add('done'); el.querySelector('.mbadge').textContent = '✓'; }
  });
  const circle = document.querySelector('.score-circle'); if (circle) circle.textContent = rs.pct + '%';
  const rbar = document.querySelector('.rbar i'); if (rbar) rbar.style.width = overallPct + '%';
  const at = document.getElementById('answeredTxt'); if (at) at.textContent = `${answered} of ${state.items.length} answered`;
  const cs = document.querySelector('.cert-state');
  if (cs) { cs.style.color = rs.pct >= 80 ? 'var(--green-bright-2)' : 'var(--gold-light)'; cs.textContent = rs.pct >= 80 ? '✓ On track · Certified ≥ 80%' : 'Below 80% — keep going'; }
}

/* ============================================================
   RESULTS
   ============================================================ */
async function goToResults() {
  if (state.online) {
    const btn = document.getElementById('primaryBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Scoring…'; }
    try {
      const fin = await API.post(`/attempts/${state.attemptId}/finish`, {});
      renderResults({
        pct: fin.score, passed: fin.passed, earned: fin.points, max: fin.max,
        questions: fin.questions, certCode: fin.certCode, byModule: fin.byModule,
        learner: fin.learner || state.learner
      });
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = 'See Results →'; }
      alert('Could not finish attempt: ' + e.message);
    }
  } else {
    const rs = runningScore();
    const seen = moduleList();
    const byModule = seen.map(m => {
      const its = state.items.filter(i => i.modId === m.id);
      let e = 0, x = 0; its.forEach(i => { e += i.result.earned; x += i.result.max; });
      return { title: m.title, pct: x ? Math.round(e / x * 100) : 0 };
    });
    renderResults({ pct: rs.pct, passed: rs.pct >= 80, earned: rs.earned, max: rs.max, questions: state.items.length, certCode: null, byModule, learner: state.learner });
  }
}

function renderResults(s) {
  const pass = s.passed;
  root.innerHTML = `
   <div class="results-wrap">
    <div class="result-hero">
      <div class="big">${s.pct}%</div>
      <div class="lbl">${s.earned} of ${s.max} points · ${s.questions} questions</div>
      <div class="verdict ${pass ? 'pass' : 'fail'}">${pass ? '✓ PASSED · Mastery ≥ 80%' : 'Not yet · Below 80% threshold'}</div>
    </div>
    <div class="result-stats">
      <div class="rs"><div class="v">${s.questions}</div><div class="k">Questions attempted</div></div>
      <div class="rs"><div class="v">${s.pct}%</div><div class="k">Final score</div></div>
      <div class="rs"><div class="v">${pass ? 'Yes' : 'No'}</div><div class="k">Certificate earned</div></div>
      <div class="rs"><div class="v">${state.online ? 'Saved' : 'Demo'}</div><div class="k">${state.online ? 'To audit trail' : 'Offline mode'}</div></div>
    </div>
    <div class="breakdown">
      <h3>Score by module</h3>
      ${s.byModule.map(b => `
        <div class="brow">
          <div class="bname">${esc(b.title)}</div>
          <div class="bbar"><i style="width:${b.pct}%; background:${b.pct >= 80 ? 'var(--green-bright)' : b.pct >= 50 ? 'var(--gold)' : 'var(--risk-high)'}"></i></div>
          <div class="bval">${b.pct}%</div>
        </div>`).join('')}
    </div>
    ${pass ? certificateHTML(s) : `
      <div class="breakdown" style="text-align:center;">
        <h3>Almost there</h3>
        <p style="color:var(--ink-soft); max-width:520px; margin:0 auto 18px;">You need ≥80% to earn the certificate. Review the modules where you scored lowest and retake — every attempt is logged.</p>
      </div>`}
    <div style="display:flex; gap:14px; justify-content:center; margin-top:30px; flex-wrap:wrap;">
      <button class="btn btn-orange btn-lg" onclick="restart()">↻ Retake Assessment</button>
      <a class="btn btn-green btn-lg" href="dashboard.html">View Admin Dashboard →</a>
      ${pass ? `<button class="btn btn-outline-green btn-lg" onclick="window.print()">🖨 Print Certificate</button>` : ''}
    </div>
   </div>`;
  window.scrollTo(0, 0);
}

function certificateHTML(s) {
  const code = s.certCode || ('PC-2026-' + String(Math.floor(1000 + Math.random() * 8999)));
  const L = s.learner || state.learner;
  return `
    <div class="certificate">
      <div class="inner">
        <span class="cert-dot tl"></span><span class="cert-dot tr"></span><span class="cert-dot bl"></span><span class="cert-dot br"></span>
        <div class="org">JIJIWISHA SOCIETY · POSH COMPASS</div>
        <div class="ctitle">Certificate of Completion</div>
        <div class="small">This is to certify that</div>
        <div class="cname">${esc(L.name)}</div>
        <div class="cbody">
          has successfully completed the POSH Awareness &amp; Prevention assessment,
          aligned to the Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act, 2013${L.org && L.org !== '—' ? ' — on behalf of ' + esc(L.org) : ''}.
        </div>
        <div class="cscore"><b>${s.pct}%</b><span>final score</span></div>
        <div class="passline">PASSED · MEETS ≥80% MASTERY THRESHOLD</div>
        <div class="sigs">
          <div class="sig">Manjary Upadhyay · Founder, Jijiwisha</div>
          <div class="sig">Certificate ID · ${esc(code)}</div>
        </div>
      </div>
    </div>`;
}

function restart() { resetPicks(); state.idx = 0; renderStart(); }

/* ---------- boot ---------- */
boot();
