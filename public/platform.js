/*
 * platform.js — stands in for the claude.ai artifact runtime (window.claude.use)
 * so index.html runs unchanged on Netlify.
 *
 *   db         -> /api/results   (Netlify Function + Netlify Blobs), polled for updates
 *   user       -> a per-device id in localStorage; "owner" = signed in with the admin code
 *   downloads  -> a normal browser download
 *   sample     -> /api/read-image (only when ANTHROPIC_API_KEY is set on the site)
 *
 * Access: everyone enters the team code once per device. The admin code unlocks
 * delete, CSV export and "entering answers for another team member".
 */
(() => {
  const CODE_KEY = 'scp_code', DEVICE_KEY = 'scp_device', POLL_MS = 20000;

  const deviceId = (() => {
    let id = null;
    try { id = localStorage.getItem(DEVICE_KEY); } catch (e) {}
    if (!id) {
      id = 'd_' + (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).slice(2) + Date.now().toString(36));
      try { localStorage.setItem(DEVICE_KEY, id); } catch (e) {}
    }
    return id;
  })();

  let code = '';
  try { code = localStorage.getItem(CODE_KEY) || ''; } catch (e) {}
  let role = null, imageReading = false, cache = [];
  const subscribers = new Set();

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      ...opts,
      headers: { 'content-type': 'application/json', 'x-team-code': code, 'x-device-id': deviceId, ...(opts.headers || {}) },
    });
    if (res.status === 401) { const e = new Error('bad_code'); e.code = 'bad_code'; throw e; }
    if (!res.ok) { const e = new Error('http_' + res.status); e.code = res.status === 403 ? 'not_granted' : 'unavailable'; throw e; }
    return res.status === 204 ? null : res.json();
  }

  function snapshot() {
    return {
      metadata: { fromCache: false, hasPendingWrites: false },
      docs: cache.map(r => { const { id, ...data } = r; return { id, exists: true, data: () => data }; }),
      get size() { return cache.length; },
      get empty() { return !cache.length; },
    };
  }
  async function refresh() {
    const out = await api('/api/results');
    role = out.role; imageReading = !!out.imageReading; cache = out.results || [];
    const s = snapshot();
    subscribers.forEach(fn => { try { fn(s); } catch (e) { console.error(e); } });
    return out;
  }

  /* ---------- team code gate ---------- */
  const unlocked = new Promise(resolve => {
    const tryCode = async () => { try { await refresh(); resolve(); return true; } catch (e) { return false; } };
    const showGate = (failed) => {
      const el = document.createElement('div');
      el.id = 'scp-gate';
      el.innerHTML = `
        <style>
          #scp-gate{position:fixed;inset:0;z-index:50;background:var(--bg,#000);color:var(--ink,#fff);display:flex;align-items:center;justify-content:center;padding:24px}
          #scp-gate form{width:100%;max-width:360px;display:flex;flex-direction:column;gap:12px}
          #scp-gate h2{font-family:Archivo,sans-serif;font-weight:800;margin:0}
          #scp-gate input{font:inherit;font-size:18px;padding:13px 14px;border-radius:12px;border:1.5px solid var(--line,#333);background:var(--card,#111);color:inherit}
          #scp-gate button{font:inherit;font-weight:600;border:0;border-radius:14px;padding:14px;background:var(--accent,#1F44FF);color:#fff}
          #scp-gate .err{color:var(--pp,#FF5C3C);font-size:14px;min-height:1.2em}
          #scp-gate .s{color:var(--muted,#999);font-size:14px}
        </style>
        <form>
          <h2>The Send Cambodia</h2>
          <div class="s">បញ្ចូលលេខកូដក្រុម · Enter the team code</div>
          <input type="password" autocomplete="current-password" aria-label="Team code" required>
          <div class="err">${failed ? 'លេខកូដមិនត្រឹមត្រូវ · That code didn’t work' : ''}</div>
          <button type="submit">ចូល · Continue</button>
        </form>`;
      document.body.appendChild(el);
      const input = el.querySelector('input');
      setTimeout(() => input.focus(), 50);
      el.querySelector('form').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        code = input.value.trim();
        if (await tryCode()) { try { localStorage.setItem(CODE_KEY, code); } catch (e) {} el.remove(); }
        else { el.querySelector('.err').textContent = 'លេខកូដមិនត្រឹមត្រូវ · That code didn’t work'; input.select(); }
      });
    };
    const start = async () => { if (code && await tryCode()) return; showGate(!!code); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  });

  setInterval(() => { if (role && document.visibilityState === 'visible') refresh().catch(() => {}); }, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (role && document.visibilityState === 'visible') refresh().catch(() => {}); });

  /* ---------- capability namespaces ---------- */
  const db = {
    collection(path) {
      if (path !== 'results') throw new Error('Only the results collection exists here');
      return {
        doc: (id) => ({
          async set(data) { await api('/api/results?id=' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify(data) }); await refresh(); },
          async delete() { await api('/api/results?id=' + encodeURIComponent(id), { method: 'DELETE' }); await refresh(); },
        }),
        onSnapshot(next, error) {
          subscribers.add(next);
          if (role) setTimeout(() => next(snapshot()), 0);
          return () => subscribers.delete(next);
        },
      };
    },
  };
  const user = {
    id: async () => deviceId,
    isOwner: async () => role === 'admin',
    canEdit: async () => role === 'admin',
    can: async () => true,
    me: async () => ({ id: deviceId, name: '', email: null }),
    profiles: async (ids) => Object.fromEntries(ids.map(id => [id, { id, name: '', isMe: id === deviceId }])),
  };
  const downloads = {
    async save({ filename, data }) {
      const blob = data instanceof Blob ? data : new Blob([data], { type: filename.endsWith('.csv') ? 'text/csv;charset=utf-8' : 'application/octet-stream' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    },
  };
  const blobToBase64 = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(b); });
  const sample = Object.assign(async () => { const e = new Error('not supported'); e.code = 'not_granted'; throw e; }, {
    async limits() { return imageReading ? { images: { maxCount: 1, mediaTypes: ['image/png', 'image/jpeg', 'image/webp'] } } : {}; },
    async json(prompt, opts = {}) {
      const img = Array.isArray(opts.images) ? opts.images[0] : opts.images;
      if (!img) { const e = new Error('no image'); e.code = 'invalid_argument'; throw e; }
      const out = await api('/api/read-image', { method: 'POST', body: JSON.stringify({ prompt, mediaType: img.type || 'image/png', image: await blobToBase64(img) }) });
      return out.result;
    },
  });

  window.claude = {
    use: async (name) => {
      await unlocked;
      if (name === 'db') return db;
      if (name === 'user') return user;
      if (name === 'downloads') return downloads;
      if (name === 'sample') return sample;
      return null;
    },
  };
})();
