import { RedeemCodesAsync } from '../../../lib/redis.js';
import { verifyToken } from '../../../lib/auth.js';
import { parse } from 'cookie';

function auth(req) {
  const t = parse(req.headers.cookie||'').admin_token || req.headers.authorization?.replace('Bearer ','');
  return verifyToken(t)?.type === 'admin';
}

export default async function handler(req, res) {
  if (!auth(req)) return res.status(401).json({ error:'Unauthorized' });
  try {
    if (req.method === 'GET') {
      const codes = await RedeemCodesAsync.all();
      return res.json({ success:true, codes });
    }
    if (req.method === 'POST') {
      const { code, discount_type, discount_value, max_uses, product_id, min_price, expires_at } = req.body;
      if (!code || !discount_value) return res.status(400).json({ success:false, message:'Code dan nilai diskon wajib' });
      await RedeemCodesAsync.add({ code: code.toUpperCase().trim(), discount_type:discount_type||'percent',
        discount_value:parseInt(discount_value), max_uses:parseInt(max_uses)||1,
        product_id:product_id||null, min_price:parseInt(min_price)||0, expires_at:expires_at||null,
        is_active:true });
      return res.status(201).json({ success:true });
    }
    if (req.method === 'DELETE') {
      const { id } = req.query;
      await RedeemCodesAsync.removeById(parseInt(id));
      return res.json({ success:true });
    }
    return res.status(405).end();
  } catch(e) {
    return res.status(500).json({ success:false, message: e.message });
  }
}
