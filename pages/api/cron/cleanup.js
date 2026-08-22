/**
 * /api/cron/cleanup — Menandai order pending yang sudah kedaluwarsa.
 *
 * Dipanggil oleh:
 *   1. Vercel Cron (vercel.json)
 *   2. Admin panel (pakai admin_token cookie)
 */
import { verifyToken }          from '../../../lib/auth.js';
import { parse }                from 'cookie';

function isAuthorized(req) {
  // 1. Vercel Cron header
  if (req.headers['x-vercel-cron']) return true;
  // 2. CRON_SECRET Bearer token
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  // 3. Admin JWT (dari admin panel)
  const cookies = parse(req.headers.cookie || '');
  const t = cookies.admin_token || authHeader?.replace('Bearer ', '');
  const user = verifyToken(t);
  if (user?.type === 'admin') return true;
  // Jika CRON_SECRET tidak di-set, allow semua (dev mode)
  if (!cronSecret) return true;
  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const expiredOrders = await expireStaleOrders();
    return res.json({
      success: true,
      expiredOrders,
      message: expiredOrders > 0
        ? `${expiredOrders} transaksi pending ditandai kedaluwarsa`
        : 'Tidak ada transaksi pending yang kedaluwarsa',
    });
  } catch (e) {
    console.error('[cleanup] error:', e.message);
    return res.status(500).json({ success: false, message: e.message });
  }
}


// ── Auto-expire order pending > 1 hari ──────────────────────────
// Dipanggil dari handler cleanup yang sama (sudah terdaftar di vercel.json)
export async function expireStaleOrders() {
  const { OrdersAsync }        = await import('../../../lib/redis.js');
  const { webhookTransaction } = await import('../../../lib/discord.js');

  const all     = await OrdersAsync.all();
  const now     = Date.now();
  const expired = all.filter(o => {
    if (o.payment_status !== 'pending') return false;
    // Gunakan expired_at jika ada, fallback ke created_at + 24 jam
    const expiry = o.expired_at
      ? new Date(o.expired_at).getTime()
      : new Date(o.created_at).getTime() + 24*60*60*1000;
    return now > expiry;
  });

  let count = 0;
  for (const order of expired) {
    await OrdersAsync.update(order.order_id, {
      payment_status: 'expired',
      expired_at:     new Date().toISOString(),
    });
    const updated = await OrdersAsync.byId(order.order_id);
    try { await webhookTransaction(updated); } catch {}
    count++;
  }
  return count;
}
