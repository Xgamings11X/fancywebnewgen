import { pingPlugin } from '../../../lib/plugin.js';
import { verifyToken } from '../../../lib/auth.js';
import { parse } from 'cookie';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const t = parse(req.headers.cookie||'').admin_token || req.headers.authorization?.replace('Bearer ','');
  if (verifyToken(t)?.type !== 'admin') return res.status(401).json({ error:'Unauthorized' });
  return res.json(await pingPlugin());
}
