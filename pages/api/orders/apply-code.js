import { RedeemCodesAsync } from '../../../lib/redis.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { code, productId, price } = req.body || {};
  if (!code) return res.status(400).json({ success:false, message:'Kode tidak boleh kosong' });

  const c = await RedeemCodesAsync.byCode(code.trim());
  if (!c || !c.is_active)
    return res.status(404).json({ success:false, message:'Kode tidak valid atau sudah nonaktif' });
  if (c.expires_at && new Date(c.expires_at) < new Date())
    return res.status(400).json({ success:false, message:'Kode sudah kadaluarsa' });
  if ((c.used_count||0) >= c.max_uses)
    return res.status(400).json({ success:false, message:'Kode sudah habis digunakan' });
  if (c.product_id && c.product_id !== parseInt(productId))
    return res.status(400).json({ success:false, message:'Kode tidak berlaku untuk produk ini' });
  if (c.min_price && parseInt(price) < c.min_price)
    return res.status(400).json({ success:false, message:`Minimal pembelian Rp ${c.min_price.toLocaleString('id-ID')}` });

  const disc       = c.discount_type==='percent'
    ? Math.floor(parseInt(price)*c.discount_value/100)
    : c.discount_value;
  const finalPrice = Math.max(0, parseInt(price) - Math.min(disc, parseInt(price)));

  return res.json({ success:true, code:c.code, discountAmount:Math.min(disc,parseInt(price)), finalPrice });
}
