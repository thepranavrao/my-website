/* POSH Compass — Node/Express backend.
 * Run from the project root: node backend/server.js   (or npm start)
 * Then open http://localhost:8000
 *
 * Serves the existing static frontend AND a JSON API under /api:
 *   auth (token) · attempts · server-side grading · certificates · live dashboard.
 * Storage: SQLite via the built-in node:sqlite module (backend/poshcompass.db).
 */
const path = require('path');
const express = require('express');

const db = require('./db');
const { hashPw, verifyPw, makeToken, readToken } = require('./auth');
const { grade } = require('./scoring');
const { MODULE_ORDER } = require('./questionsSeed');
const { seed, certCode, PASS_MARK } = require('./seed');

const ROOT = path.join(__dirname, '..');

seed(db);

function nowIso() {
  return new Date().toISOString();
}

function log(actorId, action, entity, meta = {}) {
  db.prepare('INSERT INTO audit_log (actor_id, action, entity, meta, ts) VALUES (?, ?, ?, ?, ?)')
    .run(actorId, action, entity, JSON.stringify(meta), nowIso());
}

function formatTs(iso) {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleString('en-US', { month: 'short' });
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month}, ${hh}:${mm}`;
}

function currentUser(req, res, next) {
  const auth = req.headers.authorization || '';
  if (!auth.toLowerCase().startsWith('bearer ')) {
    return res.status(401).json({ detail: 'Not authenticated' });
  }
  const payload = readToken(auth.slice(7));
  if (!payload) return res.status(401).json({ detail: 'Invalid or expired token' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
  if (!user) return res.status(401).json({ detail: 'User not found' });
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ detail: 'Admin only' });
  next();
}

function orderedQuestions() {
  const qs = db.prepare('SELECT * FROM questions').all();
  const order = {};
  MODULE_ORDER.forEach((m, i) => { order[m] = i; });
  return qs.sort((a, b) => {
    const oa = order[a.mod_id] ?? 99, ob = order[b.mod_id] ?? 99;
    return oa !== ob ? oa - ob : a.order_idx - b.order_idx;
  });
}

const app = express();
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'posh-compass', passMark: PASS_MARK });
});

// ---- auth ----
app.post('/api/auth/register', (req, res) => {
  const { orgName, name, email, password, department } = req.body || {};
  const emailLower = String(email || '').toLowerCase();
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(emailLower)) {
    return res.status(409).json({ detail: 'An account with that email already exists' });
  }

  const orgId = Number(
    db.prepare('INSERT INTO organisations (name, plan_tier, created_at) VALUES (?, ?, ?)')
      .run(orgName, '1-30', nowIso()).lastInsertRowid
  );
  const userId = Number(
    db.prepare(`INSERT INTO users (org_id, name, email, password_hash, role, department)
                VALUES (?, ?, ?, ?, 'admin', ?)`)
      .run(orgId, name, emailLower, hashPw(password), department || 'HR').lastInsertRowid
  );

  log(userId, 'register_org', 'organisation', { org: orgName });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  res.json({ token: makeToken(user.id), role: user.role, name: user.name });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').toLowerCase());
  if (!user || !verifyPw(password, user.password_hash)) {
    return res.status(401).json({ detail: 'Invalid email or password' });
  }
  log(user.id, 'login', 'user');
  res.json({ token: makeToken(user.id), role: user.role, name: user.name });
});

app.get('/api/me', currentUser, (req, res) => {
  const org = db.prepare('SELECT * FROM organisations WHERE id = ?').get(req.user.org_id);
  res.json({
    id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role,
    department: req.user.department, org: org ? org.name : '—',
  });
});

// ---- assessment lifecycle ----
app.post('/api/attempts', currentUser, (req, res) => {
  const attemptId = Number(
    db.prepare('INSERT INTO attempts (user_id, score, passed, started_at) VALUES (?, 0, 0, ?)')
      .run(req.user.id, nowIso()).lastInsertRowid
  );
  log(req.user.id, 'attempt_started', 'attempt', { attempt_id: attemptId });

  const items = orderedQuestions().map((q) => ({
    qid: q.id, type: q.qtype, modId: q.mod_id, modNo: q.mod_no,
    modTitle: q.mod_title, modSub: q.mod_sub, q: JSON.parse(q.payload),
  }));
  res.json({ attemptId, items });
});

app.post('/api/attempts/:id/answer', currentUser, (req, res) => {
  const attemptId = Number(req.params.id);
  const attempt = db.prepare('SELECT * FROM attempts WHERE id = ?').get(attemptId);
  if (!attempt || attempt.user_id !== req.user.id) {
    return res.status(404).json({ detail: 'Attempt not found' });
  }
  if (attempt.finished_at) return res.status(409).json({ detail: 'Attempt already finished' });

  const { questionId, given } = req.body || {};
  const q = db.prepare('SELECT * FROM questions WHERE id = ?').get(questionId);
  if (!q) return res.status(404).json({ detail: 'Question not found' });

  const [earned, mx, reveal] = grade(q.qtype, JSON.parse(q.answer), given);
  const existing = db.prepare('SELECT * FROM answers WHERE attempt_id = ? AND question_id = ?')
    .get(attemptId, q.id);
  if (existing) {
    db.prepare('UPDATE answers SET given = ?, earned = ?, max = ?, correct = ? WHERE id = ?')
      .run(JSON.stringify(given), earned, mx, earned === mx ? 1 : 0, existing.id);
  } else {
    db.prepare(`INSERT INTO answers (attempt_id, question_id, given, earned, max, correct)
                VALUES (?, ?, ?, ?, ?, ?)`)
      .run(attemptId, q.id, JSON.stringify(given), earned, mx, earned === mx ? 1 : 0);
  }
  log(req.user.id, 'answer_submitted', 'question', { attempt_id: attemptId, question_id: q.id, earned, max: mx });
  res.json({ earned, max: mx, reveal });
});

app.post('/api/attempts/:id/finish', currentUser, (req, res) => {
  const attemptId = Number(req.params.id);
  const attempt = db.prepare('SELECT * FROM attempts WHERE id = ?').get(attemptId);
  if (!attempt || attempt.user_id !== req.user.id) {
    return res.status(404).json({ detail: 'Attempt not found' });
  }

  const rows = db.prepare('SELECT * FROM answers WHERE attempt_id = ?').all(attemptId);
  const earned = rows.reduce((s, r) => s + r.earned, 0);
  const mx = rows.reduce((s, r) => s + r.max, 0);
  const pct = mx ? Math.round((earned / mx) * 100) : 0;
  const passed = pct >= PASS_MARK;
  db.prepare('UPDATE attempts SET score = ?, passed = ?, finished_at = ? WHERE id = ?')
    .run(pct, passed ? 1 : 0, nowIso(), attemptId);

  const qmap = {};
  db.prepare('SELECT * FROM questions').all().forEach((q) => { qmap[q.id] = q; });
  const agg = {};
  for (const r of rows) {
    const q = qmap[r.question_id];
    if (!q) continue;
    const a = agg[q.mod_id] || (agg[q.mod_id] = { title: q.mod_title, e: 0, m: 0 });
    a.e += r.earned; a.m += r.max;
  }
  const byModule = MODULE_ORDER.filter((m) => agg[m]).map((m) => ({
    title: agg[m].title,
    pct: agg[m].m ? Math.round((agg[m].e / agg[m].m) * 100) : 0,
  }));

  let cert = null;
  if (passed) {
    cert = certCode();
    db.prepare('INSERT INTO certificates (user_id, attempt_id, code, score, issued_at) VALUES (?, ?, ?, ?, ?)')
      .run(req.user.id, attemptId, cert, pct, nowIso());
    log(req.user.id, 'certificate_issued', 'certificate', { code: cert, score: pct });
  }
  log(req.user.id, 'attempt_finished', 'attempt', { attempt_id: attemptId, score: pct, passed });

  const org = db.prepare('SELECT * FROM organisations WHERE id = ?').get(req.user.org_id);
  res.json({
    score: pct, passed, points: earned, max: mx, questions: rows.length,
    certCode: cert, byModule,
    learner: { name: req.user.name, org: org ? org.name : '—', department: req.user.department },
  });
});

app.get('/api/verify/:code', (req, res) => {
  const cert = db.prepare('SELECT * FROM certificates WHERE code = ?').get(req.params.code);
  if (!cert) return res.status(404).json({ detail: 'Certificate not found' });
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(cert.user_id);
  const org = u ? db.prepare('SELECT * FROM organisations WHERE id = ?').get(u.org_id) : null;
  res.json({
    valid: true, code: cert.code, name: u ? u.name : '—', org: org ? org.name : '—',
    score: cert.score, issued: cert.issued_at.slice(0, 10),
  });
});

// ---- admin dashboard ----
app.get('/api/admin/stats', currentUser, requireAdmin, (req, res) => {
  const orgId = req.user.org_id;
  const users = db.prepare('SELECT * FROM users WHERE org_id = ?').all(orgId);
  const userIds = users.map((u) => u.id);
  const enrolled = users.length;

  const finished = userIds.length
    ? db.prepare(`SELECT * FROM attempts WHERE user_id IN (${userIds.map(() => '?').join(',')}) AND finished_at IS NOT NULL`)
        .all(...userIds)
    : [];

  const best = {};
  for (const a of finished) {
    if (!best[a.user_id] || a.score > best[a.user_id].score) best[a.user_id] = a;
  }
  const completed = Object.keys(best).length;
  const avgScore = completed ? Math.round(Object.values(best).reduce((s, a) => s + a.score, 0) / completed) : 0;
  const certified = Object.values(best).filter((a) => a.passed).length;

  const dept = {};
  for (const u of users) {
    const d = dept[u.department] || (dept[u.department] = { users: 0, scoreSum: 0, done: 0 });
    d.users += 1;
    if (best[u.id]) { d.scoreSum += best[u.id].score; d.done += 1; }
  }
  const byDept = Object.keys(dept).sort().map((k) => ({
    name: k,
    completion: dept[k].users ? Math.round((dept[k].done / dept[k].users) * 100) : 0,
    avg: dept[k].done ? Math.round(dept[k].scoreSum / dept[k].done) : 0,
  }));

  const preVals = users.filter((u) => u.baseline_score != null && best[u.id]).map((u) => u.baseline_score);
  const postVals = users.filter((u) => u.baseline_score != null && best[u.id]).map((u) => best[u.id].score);
  const pre = preVals.length ? Math.round(preVals.reduce((a, b) => a + b, 0) / preVals.length) : 0;
  const post = postVals.length ? Math.round(postVals.reduce((a, b) => a + b, 0) / postVals.length) : avgScore;

  const orgCompliance = enrolled ? Math.round((certified / enrolled) * 100) : 0;

  const recent = userIds.length
    ? db.prepare(`SELECT * FROM audit_log WHERE actor_id IN (${userIds.map(() => '?').join(',')})
                  AND action IN ('attempt_finished','certificate_issued') ORDER BY ts DESC LIMIT 6`)
        .all(...userIds)
    : [];
  const umap = {};
  users.forEach((u) => { umap[u.id] = u; });
  const feed = recent.map((r) => {
    const meta = JSON.parse(r.meta);
    const who = umap[r.actor_id];
    return {
      user: who ? who.name : '—',
      action: r.action === 'attempt_finished' ? 'Assessment completed' : 'Certificate issued',
      score: meta.score ?? '',
      ts: formatTs(r.ts),
    };
  });

  const org = db.prepare('SELECT * FROM organisations WHERE id = ?').get(orgId);
  res.json({
    org: org ? org.name : '—', enrolled,
    completion: enrolled ? Math.round((completed / enrolled) * 100) : 0,
    avgScore, certified, orgCompliance, byDept, preAvg: pre, postAvg: post,
    improvement: Math.max(post - pre, 0), feed,
  });
});

// ---- static frontend ----
app.use(express.static(ROOT, { extensions: ['html'] }));
app.use((req, res) => res.status(404).json({ detail: 'Not found' }));

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`POSH Compass (Node) running on http://localhost:${PORT}`);
});
