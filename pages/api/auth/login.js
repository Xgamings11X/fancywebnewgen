import { verifyMinecraftPlayer, generatePlayerToken } from '../../../lib/auth.js';
import { serialize } from 'cookie';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { username, platform } = req.body || {};
  if (!username?.trim()) return res.status(400).json({ success:false, message:'Username harus diisi' });
  try {
    const result = await verifyMinecraftPlayer(username.trim(), platform==='bedrock'?'bedrock':'java');
    if (!result.success) return res.status(401).json({ success:false, message: result.message });
    const token = generatePlayerToken(result.player);
    res.setHeader('Set-Cookie', serialize('token', token, {
      httpOnly:true, secure: process.env.NODE_ENV==='production',
      sameSite:'lax', maxAge:60*60*24*7, path:'/',
    }));
    return res.json({ success:true, player: result.player, token });
  } catch(e) {
    return res.status(500).json({ success:false, message: e.message });
  }
}
