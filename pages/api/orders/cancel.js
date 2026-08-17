/**
 * /api/orders/cancel
 * Dipanggil ketika user meninggalkan halaman invoice saat status masih pending.
 * Order pending yang ditinggalkan → status = cancelled → masuk log webhook Discord.
 * 
 * Juga support navigator.sendBeacon (Content-Type: text/plain dengan JSON body).
 */

import { OrdersAsync }       from '../../../lib/redis.js';
import { webhookTransaction } from '../../../lib/discord.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    let body = req.body;
    // sendBeacon mengirim sebagai text/plain — parse manual
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }

    const { orderId } = body || {};
    if (!orderId) return res.status(400).json({ error: 'orderId required' });

    const order = await OrdersAsync.byId(orderId);
    if (!order) return res.status(404).json({ error: 'not found' });

    // Hanya cancel jika masih pending
    const CANCELABLE = ['pending'];
    if (!CANCELABLE.includes(order.payment_status)) {
      return res.json({ success: true, skipped: true, status: order.payment_status });
    }

    await OrdersAsync.update(orderId, {
      payment_status: 'cancelled',
      cancelled_at:   new Date().toISOString(),
      cancel_reason:  'User meninggalkan halaman invoice',
    });

    const updated = await OrdersAsync.byId(orderId);

    // Kirim ke Discord log
    try { await webhookTransaction(updated); } catch {}

    return res.json({ success: true });
  } catch (e) {
    console.error('[orders/cancel]', e.message);
    return res.status(500).json({ error: e.message });
  }
}
