/**
 * pages/api/admin/settings.js
 * GET  — ambil semua settings
 * PUT  — update settings (partial patch)
 * Auth: admin token wajib
 */
import { SettingsAsync } from '../../../lib/redis.js';
import { verifyToken }   from '../../../lib/auth.js';
import { parse }         from 'cookie';

function auth(req) {
  const t = parse(req.headers.cookie || '').admin_token || req.headers.authorization?.replace('Bearer ', '');
  return verifyToken(t)?.type === 'admin';
}

export default async function handler(req, res) {
  if (!auth(req)) return res.status(401).json({ error: 'Unauthorized' });

  try {
    if (req.method === 'GET') {
      const settings = await SettingsAsync.get();
      return res.json({ success: true, settings });
    }

    if (req.method === 'PUT') {
      const patch = req.body || {};
      // Hapus field sensitif yang tidak boleh di-overwrite dari sini
      delete patch.plugin_server_key;
      await SettingsAsync.set(patch);
      return res.json({ success: true });
    }

    return res.status(405).end();
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
}
