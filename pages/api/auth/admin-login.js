import { verifyAdmin, generateAdminToken } from '../../../lib/auth.js';
import { serialize } from 'cookie';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ success:false, message:'Username dan password wajib diisi' });
  try {
    const result = await verifyAdmin(username, password);
    if (!result.success) return res.status(401).json({ success:false, message: result.message });
    const token = generateAdminToken(result.admin);
    res.setHeader('Set-Cookie', serialize('admin_token', token, {
      httpOnly:true, secure: process.env.NODE_ENV==='production',
      sameSite:'lax', maxAge:60*60*24, path:'/',
    }));
    return res.json({ success:true, token, admin: result.admin });
  } catch(e) {
    return res.status(500).json({ success:false, message: e.message });
  }
}
