/* ===================================================================
   POSH Compass — tiny API client.
   If the FastAPI backend is reachable, the app runs in ONLINE mode
   (real auth, server-side grading, saved attempts). If not (e.g. the
   page was opened directly as a file://), API.online stays false and
   the frontend falls back to the self-contained offline demo.
   =================================================================== */
const API = {
  base: '/api',
  token: localStorage.getItem('pc_token') || null,
  online: false,

  async init() {
    try {
      const r = await fetch(this.base + '/health', { cache: 'no-store' });
      this.online = r.ok;
    } catch (_) {
      this.online = false;
    }
    return this.online;
  },

  setToken(t) { this.token = t; localStorage.setItem('pc_token', t); },
  clearToken() { this.token = null; localStorage.removeItem('pc_token'); },
  get loggedIn() { return !!this.token; },

  async req(path, opts = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (this.token) headers.Authorization = 'Bearer ' + this.token;
    const r = await fetch(this.base + path, Object.assign({}, opts, { headers }));
    if (r.status === 401) { this.clearToken(); }
    if (!r.ok) {
      let detail = r.statusText;
      try { detail = (await r.json()).detail || detail; } catch (_) {}
      throw new Error(detail);
    }
    return r.status === 204 ? null : r.json();
  },
  get(p) { return this.req(p); },
  post(p, body) { return this.req(p, { method: 'POST', body: JSON.stringify(body || {}) }); }
};
