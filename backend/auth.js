const crypto = require('crypto');

const SECRET = process.env.POSH_SECRET || 'dev-secret-change-me';
const PBKDF2_ITERATIONS = 200_000;
const KEY_LEN = 32;

function hashPw(pw) {
  const salt = crypto.randomBytes(16);
  const dk = crypto.pbkdf2Sync(pw, salt, PBKDF2_ITERATIONS, KEY_LEN, 'sha256');
  return `${salt.toString('hex')}$${dk.toString('hex')}`;
}

function verifyPw(pw, stored) {
  try {
    const [saltHex, dkHex] = stored.split('$');
    const dk = crypto.pbkdf2Sync(pw, Buffer.from(saltHex, 'hex'), PBKDF2_ITERATIONS, KEY_LEN, 'sha256');
    return crypto.timingSafeEqual(dk, Buffer.from(dkHex, 'hex'));
  } catch {
    return false;
  }
}

function makeToken(uid, ttlSeconds = 86_400 * 7) {
  const head = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ sub: uid, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString('base64url');
  const seg = `${head}.${body}`;
  const sig = crypto.createHmac('sha256', SECRET).update(seg).digest('base64url');
  return `${seg}.${sig}`;
}

function readToken(token) {
  try {
    const [head, body, sig] = token.split('.');
    const expect = crypto.createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(sig))) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

module.exports = { hashPw, verifyPw, makeToken, readToken };
