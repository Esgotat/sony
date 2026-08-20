
const FB_URL = 'https://openuniversity-df24f-default-rtdb.firebaseio.com';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).json({});
  }

  const q = req.query || {};

  try {
    if (q.file) {
      const safe = String(q.file).replace(/[^a-zA-Z0-9_-]/g, '');
      const path = '/files/' + safe + '.json';

      if (req.method === 'GET') {
        const r = await fetch(FB_URL + path, { cache: 'no-store' });
        if (!r.ok) {
          return res.status(404).json({ ok: false });
        }
        const data = await r.json();
        return res.status(200).json(data || {});
      }

      if (req.method === 'POST' || req.method === 'PUT') {
        const r = await fetch(FB_URL + path, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req.body || {})
        });
        return res.status(200).json({ ok: r.ok, status: r.status });
      }

      return res.status(405).json({ ok: false });
    }

    if (req.method === 'GET') {
      const r = await fetch(FB_URL + '/state.json', { cache: 'no-store' });
      if (!r.ok) {
        return res.status(502).json({ ok: false, error: 'Firebase GET ' + r.status });
      }
      const data = await r.json();
      return res.status(200).json(data || {});
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      const r = await fetch(FB_URL + '/state.json', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body || {})
      });
      return res.status(200).json({ ok: r.ok, status: r.status });
    }

    return res.status(405).json({ ok: false });

  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
}