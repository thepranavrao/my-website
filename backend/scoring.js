function norm(s) {
  return String(s || '').trim().toLowerCase().split(/\s+/).filter(Boolean).join(' ');
}

function grade(qtype, answer, given) {
  given = given || {};

  if (qtype === 'mcq') {
    const ok = given.index === answer.index;
    return [ok ? 1 : 0, 1, { answer: answer.index, explain: answer.explain }];
  }

  if (qtype === 'fib') {
    const val = norm(given.text);
    const ok = answer.accept.some((a) => norm(a) === val) && val !== '';
    return [ok ? 1 : 0, 1, { answer: answer.accept, explain: answer.explain }];
  }

  if (qtype === 'mtf') {
    const pairs = answer.pairs;
    const mp = given.map || {};
    const earned = pairs.filter((p) => mp[p.left] === p.right).length;
    return [earned, pairs.length, { pairs, explain: answer.explain }];
  }

  if (qtype === 'caseStudy') {
    const subs = answer.subs;
    const picks = given.subs || [];
    const earned = subs.filter((s, i) => i < picks.length && picks[i] === s.index).length;
    return [earned, subs.length, { subs, explain: answer.explain || '' }];
  }

  if (qtype === 'simulation') {
    const opts = answer.options;
    const i = given.index;
    const ok = typeof i === 'number' && i >= 0 && i < opts.length &&
      (opts[i].verdict === 'recommended' || opts[i].verdict === 'also-correct');
    return [ok ? 1 : 0, 1, { options: opts, explain: answer.explain }];
  }

  return [0, 1, {}];
}

module.exports = { grade };
