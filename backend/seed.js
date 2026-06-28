const crypto = require('crypto');
const { MODULES, BANK } = require('./questionsSeed');
const { hashPw } = require('./auth');

const PASS_MARK = 80;

function nowIso() {
  return new Date().toISOString();
}

function certCode() {
  return 'PC-2026-' + (1000 + crypto.randomInt(9000));
}

function seed(db) {
  const qCount = db.prepare('SELECT COUNT(*) AS c FROM questions').get().c;
  if (qCount === 0) {
    const insert = db.prepare(
      `INSERT INTO questions (mod_id, mod_no, mod_title, mod_sub, qtype, order_idx, payload, answer)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const mod of MODULES) {
      BANK[mod.id].forEach((item, i) => {
        insert.run(mod.id, mod.no, mod.title, mod.sub, mod.id, i,
          JSON.stringify(item.payload), JSON.stringify(item.answer));
      });
    }
  }

  const orgCount = db.prepare('SELECT COUNT(*) AS c FROM organisations').get().c;
  if (orgCount === 0) {
    seedDemoOrg(db);
  }
}

/** A pre-populated org so the dashboard shows real numbers on first load.
 * Demo admin login -> admin@demo.gov / demo1234 */
function seedDemoOrg(db) {
  const orgId = Number(
    db.prepare('INSERT INTO organisations (name, plan_tier, created_at) VALUES (?, ?, ?)')
      .run('Department of Public Administration', '201+', nowIso()).lastInsertRowid
  );

  db.prepare(
    `INSERT INTO users (org_id, name, email, password_hash, role, department, baseline_score)
     VALUES (?, 'Priya Sharma', 'admin@demo.gov', ?, 'admin', 'HR Office', 58)`
  ).run(orgId, hashPw('demo1234'));

  const demo = [
    ['Rohit Kumar', 'Revenue', 55, 96],
    ['Ananya Singh', 'Police', 60, 91],
    ['Meena Pillai', 'Health', 50, 88],
    ['Suresh V.', 'Education', 48, 80],
    ['Kavita Rao', 'PWD', 52, 72],
    ['Imran Khan', 'Transport', 45, 64],
    ['Neha Gupta', 'Revenue', 57, 92],
    ['Arjun Mehta', 'Police', 49, 84],
  ];

  const userInsert = db.prepare(
    `INSERT INTO users (org_id, name, email, password_hash, role, department, baseline_score)
     VALUES (?, ?, ?, ?, 'learner', ?, ?)`
  );
  const attemptInsert = db.prepare(
    `INSERT INTO attempts (user_id, score, passed, started_at, finished_at) VALUES (?, ?, ?, ?, ?)`
  );
  const auditInsert = db.prepare(
    `INSERT INTO audit_log (actor_id, action, entity, meta, ts) VALUES (?, 'attempt_finished', 'attempt', ?, ?)`
  );
  const certInsert = db.prepare(
    `INSERT INTO certificates (user_id, attempt_id, code, score, issued_at) VALUES (?, ?, ?, ?, ?)`
  );

  for (const [name, dept, pre, post] of demo) {
    const email = name.toLowerCase().replace(/\s+/g, '').replace(/\./g, '') + '@demo.gov';
    const userId = Number(userInsert.run(orgId, name, email, hashPw('demo1234'), dept, pre).lastInsertRowid);
    const passed = post >= PASS_MARK;
    const ts = nowIso();
    const attemptId = Number(attemptInsert.run(userId, post, passed ? 1 : 0, ts, ts).lastInsertRowid);
    auditInsert.run(userId, JSON.stringify({ attempt_id: attemptId, score: post, passed }), ts);
    if (passed) {
      certInsert.run(userId, attemptId, certCode(), post, ts);
    }
  }
}

module.exports = { seed, certCode, PASS_MARK };
