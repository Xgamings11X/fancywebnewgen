import { parse } from 'cookie';
import { verifyMinecraftPlayer, verifyToken } from '../../../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success:false, message:'Method tidak diizinkan' });
  const token = parse(req.headers.cookie || '').token || req.headers.authorization?.replace('Bearer ', '');
  const user = verifyToken(token);
  if (!user || user.type !== 'player') return res.status(401).json({ success:false, message:'Login terlebih dahulu' });

  const username = String(req.body?.username || '').trim();
  const platform = req.body?.platform === 'bedrock' ? 'bedrock' : 'java';
  if (!username) return res.status(400).json({ success:false, message:'Username penerima wajib diisi' });
  if (username.length > 32) return res.status(400).json({ success:false, message:'Username penerima terlalu panjang' });

  try {
    const result = await verifyMinecraftPlayer(username, platform);
    if (!result.success) return res.status(404).json(result);
    return res.status(200).json({ success:true, player:result.player });
  } catch (error) {
    return res.status(500).json({ success:false, message:'Gagal memeriksa player penerima' });
  }
}
