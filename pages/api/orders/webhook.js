/**
 * /api/orders/webhook — Midtrans payment notification
 *
 * PENTING: webhookTransaction harus di-await sebelum res.json()
 * karena Vercel serverless terminate fungsi segera setelah response dikirim.
 * Fire-and-forget (.catch tanpa await) menyebabkan Discord request tidak selesai.
 */
import { OrdersAsync }                                  from '../../../lib/redis.js';
import { verifyWebhookSignature, parseTransactionStatus, formatPaymentMethod } from '../../../lib/midtrans.js';
import { notifyTransaction }                             from '../../../lib/plugin.js';
import { webhookTransaction }                            from '../../../lib/discord.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const n = req.body;

    // ── Verifikasi signature Midtrans ─────────────────────────────
    const sigValid = await verifyWebhookSignature(n);
    if (!sigValid) {
      console.error('[webhook] Signature tidak valid — order_id:', n.order_id,
        '| Pastikan MIDTRANS_SERVER_KEY di .env sudah benar');
      return res.status(403).json({ error: 'Invalid signature' });
    }

    const { status } = parseTransactionStatus(n);
    const finalStatus = status === 'paid' ? 'success' : status;

    // ── Cari order (Redis-first) ──────────────────────────────────
    const order = await OrdersAsync.byId(n.order_id);
    if (!order) {
      console.error('[webhook] Order tidak ditemukan:', n.order_id,
        '— Pastikan Redis sudah di-setup (UPSTASH_REDIS_REST_URL)');
      // Tetap return 200 ke Midtrans agar tidak retry terus
      return res.status(200).json({ status: 'order_not_found' });
    }

    // ── Update status order ───────────────────────────────────────
    // ATURAN KETAT: nama metode pembayaran spesifik (QRIS, GoPay,
    // Bank Transfer - BCA, dst.) HANYA boleh dihitung & disimpan saat
    // status transaksi SUCCESS/SETTLEMENT. Untuk pending/deny/expire,
    // payment_method TIDAK disentuh sama sekali.
    //
    // BUG LAMA: `order.payment_method ? {} : {...}` tidak pernah ke-trigger
    // karena payment_method di-set 'midtrans_snap' (truthy) sejak order dibuat
    // di pages/api/orders/create.js — akibatnya field ini tidak pernah ter-update
    // ke metode spesifik walau transaksi sudah sukses.
    const isSuccess    = finalStatus === 'success';
    const methodUpdate = isSuccess ? { payment_method: formatPaymentMethod(n) } : {};

    await OrdersAsync.update(n.order_id, {
      payment_status:          finalStatus,
      ...methodUpdate,
      midtrans_transaction_id: n.transaction_id,
      midtrans_raw:            JSON.stringify(n),
    });

    const updated = await OrdersAsync.byId(n.order_id);

    // ── Kirim ke Discord SEBELUM respond (bukan fire-and-forget) ──
    // await wajib di serverless — fungsi terminate setelah res.json()
    //
    // BUG FIX: Midtrans bisa memanggil webhook ini berkali-kali dengan status
    // yang SAMA — baik karena retry resmi (kalau respons kita lambat/gagal),
    // maupun notifikasi 'pending' yang muncul lagi saat VA/QRIS dibuat (status
    // 'pending' sudah dikirim SEKALI di create.js/create-core.js saat order
    // pertama kali dibuat). Tanpa guard ini, setiap panggilan ulang itu bikin
    // pesan Discord baru — itulah sumber notifikasi pending berulang.
    // Sekarang: Discord HANYA dinotifikasi kalau status benar-benar BERUBAH
    // dari sebelumnya (idempotent per status transition).
    const statusChanged = order.payment_status !== finalStatus;
    if (statusChanged) {
      try {
        await webhookTransaction(updated);
      } catch (e) {
        // Jangan block response meski Discord gagal
        console.error('[webhook] Discord TX error:', e.message);
      }
    } else {
      console.log(`[webhook] Status tidak berubah (${finalStatus}) untuk ${n.order_id} — Discord notif dilewati`);
    }

    // ── Notifikasi plugin Minecraft ───────────────────────────────
    if (finalStatus === 'success' && !order.plugin_notified) {
      try {
        // Username dikirim persis seperti disimpan:
        // Bedrock → ".Username" (dengan titik), Java → "Username" (tanpa titik)
        const r = await notifyTransaction({
          transaction_id: order.order_id,
          player_name:    order.player_username || '',
          product_id:     order.reward_trigger || String(order.product_id),
          amount:         order.amount,
          status:         'success',
          timestamp:      new Date().toISOString(),
        });
        if (!r.ok) {
          console.error('[webhook] Plugin reject:', r.error || JSON.stringify(r));
        }
        await OrdersAsync.update(n.order_id, {
          plugin_notified:  r.ok,
          plugin_queued:    r.queued || false,
          plugin_response:  JSON.stringify(r),
        });
      } catch (e) {
        console.error('[webhook] Plugin notify error:', e.message);
        await OrdersAsync.update(n.order_id, {
          plugin_notified: false,
          plugin_queued:   false,
          plugin_response: e.message,
        });
      }
    }

    return res.status(200).json({ status: 'ok' });

  } catch (e) {
    console.error('[webhook] Unhandled error:', e.message);
    // Return 200 ke Midtrans agar tidak retry — error sudah di-log
    return res.status(200).json({ status: 'error', message: e.message });
  }
}
