/**
 * /api/cron/cleanup — Pembersihan tiket otomatis
 *
 * Dipanggil oleh:
 *   1. Vercel Cron (vercel.json)
 *   2. Admin panel (tombol manual, pakai admin_token cookie)
 *
 * Aturan:
 *   • resolved / rejected  → arsip + hapus setelah 2 menit (admin bisa batalkan)
 *   • tidak aktif > 5 hari → arsip + hapus otomatis
 */
import { TicketsAsync, OrdersAsync } from '../../../lib/redis.js';
import { webhookTicketArchive } from '../../../lib/discord.js';
import { verifyToken }          from '../../../lib/auth.js';
import { parse }                from 'cookie';

const FIVE_DAYS_MS   = 5 * 24 * 60 * 60 * 1000;
const TWO_MINUTES_MS = 2 * 60 * 1000;

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
    const now     = Date.now();
    const tickets = await TicketsAsync.all();
    const archived = [];
    const skipped  = [];

    for (const ticket of tickets) {
      const updatedMs      = new Date(ticket.updated_at || ticket.created_at).getTime();
      const closedMs       = ticket.closed_at ? new Date(ticket.closed_at).getTime() : null;
      const isClosedStatus = ticket.status === 'resolved' || ticket.status === 'rejected' || ticket.status === 'expired';
      const inactiveMs     = now - updatedMs;

      let shouldArchive = false;
      let reason        = '';

      if (isClosedStatus && closedMs) {
        const waitedMs = now - closedMs;
        if (waitedMs >= TWO_MINUTES_MS) {
          shouldArchive = true;
          reason = `status=${ticket.status}, closed ${Math.round(waitedMs / 1000)}s ago`;
        } else {
          // Masih dalam grace period
          const secsLeft = Math.ceil((TWO_MINUTES_MS - waitedMs) / 1000);
          skipped.push({ id: ticket.ticket_id, reason: `grace period, ${secsLeft}s tersisa` });
          continue;
        }
      } else if (isClosedStatus && !closedMs) {
        // Pertama kali cleanup melihat tiket ini closed — mulai grace period
        await TicketsAsync.update(ticket.ticket_id, { closed_at: new Date().toISOString() });
        skipped.push({ id: ticket.ticket_id, reason: 'grace period dimulai sekarang' });
        continue;
      } else if (!isClosedStatus && inactiveMs >= FIVE_DAYS_MS) {
        // Tidak aktif > 5 hari
        await TicketsAsync.update(ticket.ticket_id, { status: 'expired', closed_at: new Date().toISOString() });
        shouldArchive = true;
        reason = `tidak aktif ${Math.round(inactiveMs / 86400000)} hari`;
      }

      if (shouldArchive) {
        const fresh = await TicketsAsync.byId(ticket.ticket_id);
        if (fresh) {
          await webhookTicketArchive(fresh).catch(e =>
            console.error('[cleanup] archive webhook error:', e.message));
        }
        await TicketsAsync.delete(ticket.ticket_id);
        archived.push({ id: ticket.ticket_id, reason });
      }
    }

    // Expire order pending > 1 hari
  let expiredOrders = 0;
  try {
    const { expireStaleOrders } = await import('./cleanup.js');
    expiredOrders = await expireStaleOrders();
  } catch (e) { console.error('[cleanup] expireStaleOrders:', e.message); }

  return res.json({ success: true, expiredOrders, archived, skipped, total: tickets.length,
      message: `Dibersihkan: ${archived.length} tiket, Ditunda: ${skipped.length} tiket` });
  } catch (e) {
    console.error('[cleanup] error:', e.message);
    return res.status(500).json({ success: false, message: e.message });
  }
}


// ── Auto-expire order pending > 1 hari ──────────────────────────
// Dipanggil dari handler cleanup yang sama (sudah ada di vercel.json)
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
