import { verifyToken } from '../../../lib/auth.js';
import { parse } from 'cookie';

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const t = parse(req.headers.cookie || '').token
    || req.headers.authorization?.replace('Bearer ', '');
  const user = verifyToken(t);
  if (!user || user.type !== 'player') {
    return res.status(401).json({ success: false, message: 'Sesi tidak valid' });
  }
  return res.json({ success: true, player: user });
}
