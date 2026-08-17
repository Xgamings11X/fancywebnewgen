/**
 * /api/orders/verify/[orderId] — status check + fallback polling
 *
 * Dipanggil dari pages/store.js & pages/invoice/[orderId].js untuk
 * menampilkan status order terkini. Kalau order masih "pending" di DB,
 * endpoint ini juga cek LANGSUNG ke Midtrans Core API (GET status) sebagai
 * fallback — berguna kalau notifikasi webhook Midtrans belum/gagal masuk
 * (mis. saat development lokal tanpa URL publik).
 *
 * Saat status berubah, hasil cek diteruskan ke /api/orders/webhook supaya
 * proses yang sama persis dijalankan: update DB, notifikasi Discord
 * (lib/discord.js), dan notifikasi plugin Minecraft.
 */
import { OrdersAsync } from '../../../../lib/redis.js';
import { getTransactionStatus } from '../../../../lib/midtrans.js';

const PAID_STATUSES = ['paid', 'success'];
const DONE_STATUSES = [...PAID_STATUSES, 'expire', 'expired', 'cancel', 'cancelled', 'failed'];

export default async function handler(req, res) {
  const { orderId } = req.query;
  let order = await OrdersAsync.byId(orderId);
  if (!order) return res.status(404).json({ error: 'Not found' });

  // Order sudah final (lunas/gagal/expired) — tidak perlu cek ulang ke Midtrans
  if (!DONE_STATUSES.includes(order.payment_status)) {
    try {
      const detail = await getTransactionStatus(orderId);
      // status_code 404 → transaksi belum pernah dibayar sama sekali di Midtrans, masih wajar untuk order baru
      if (detail && detail.transaction_status && detail.status_code !== '404') {
        // Teruskan payload Midtrans apa adanya ke handler webhook internal —
        // sudah mengandung signature_key yang valid sehingga lolos verifikasi,
        // dan handler webhook itu yang mengurus update DB + Discord + plugin.
        await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'https://fancynet.my.id'}/api/orders/webhook`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(detail),
        }).catch(() => {});

        order = await OrdersAsync.byId(orderId);
      }
    } catch (e) {
      console.error('[verify] Midtrans status check failed:', e.message);
    }
  }

  return res.json({ status: order.payment_status, order });
}
