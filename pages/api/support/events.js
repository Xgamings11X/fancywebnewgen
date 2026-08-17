/**
 * pages/api/support/events.js — Server-Sent Events untuk realtime chat tiket
 *
 * Client connect via:
 *   new EventSource(`/api/support/events?ticket_id=TKT-xxxx`)
 *
 * Server akan push event setiap ada pesan baru atau status berubah.
 * Koneksi otomatis reconnect oleh browser setiap kali server kirim "event: reconnect".
 */
import { TicketsAsync } from '../../../lib/redis.js';
import { verifyToken } from '../../../lib/auth.js';
import { parse } from 'cookie';
import { syncDiscordTicket } from '../../../lib/discord-ticket.js';

export const config = {
  api: { bodyParser: false },
};

function getUser(req) {
  // EventSource same-origin mengirim cookie secara otomatis. Query token
  // dipertahankan hanya untuk kompatibilitas client lama.
  const cookies = parse(req.headers.cookie || '');
  const t = cookies.token || cookies.admin_token || req.query.token;
  return verifyToken(t);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const user = getUser(req);
  if (!user) return res.status(401).json({ success: false, message: 'Unauthorized' });

  const { ticket_id } = req.query;
  if (!ticket_id) return res.status(400).json({ success: false });

  // Cek akses tiket
  const ticket = await TicketsAsync.byId(ticket_id);
  if (!ticket) return res.status(404).json({ success: false });
  if (ticket.player_username !== user.username && user.type !== 'admin') {
    return res.status(403).json({ success: false });
  }

  // ── Setup SSE headers ────────────────────────────────────────────
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');  // penting untuk Nginx reverse proxy
  res.flushHeaders();

  // Kirim data awal langsung
  const sendTicket = (tk) => {
    try {
      res.write(`data: ${JSON.stringify({ ticket: tk })}\n\n`);
    } catch (_) {}
  };

  sendTicket(ticket);

  let lastMsgCount  = ticket.messages?.length || 0;
  let lastStatus    = ticket.status;
  let lastEventTime = await TicketsAsync.getLastEventTime(ticket_id);
  let lastDiscordSyncAt = 0;

  // ── Polling ke Redis setiap 1.5 detik ────────────────────────────
  const pollInterval = setInterval(async () => {
    try {
      // Discord REST disinkronkan maksimal sekali tiap ±5 detik agar tetap
      // realtime tanpa membanjiri rate limit API Discord.
      if (Date.now() - lastDiscordSyncAt >= 4500) {
        lastDiscordSyncAt = Date.now();
        await syncDiscordTicket(ticket_id);
      }

      const eventTime = await TicketsAsync.getLastEventTime(ticket_id);
      if (eventTime <= lastEventTime) return;

      const fresh = await TicketsAsync.byId(ticket_id);
      if (!fresh) return;

      const newMsgCount = fresh.messages?.length || 0;
      const newStatus = fresh.status;
      if (newMsgCount !== lastMsgCount || newStatus !== lastStatus || eventTime !== lastEventTime) {
        lastMsgCount = newMsgCount;
        lastStatus = newStatus;
        lastEventTime = eventTime;
        sendTicket(fresh);
      }
    } catch (_) {}
  }, 1500);

  // ── Heartbeat setiap 20 detik (cegah proxy timeout) ─────────────
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch (_) {}
  }, 20000);

  // ── Auto-reconnect setelah 55 detik (Vercel timeout 60s) ─────────
  const reconnectTimer = setTimeout(() => {
    try {
      res.write('event: reconnect\ndata: {}\n\n');
    } catch (_) {}
    cleanup();
  }, 55000);

  function cleanup() {
    clearInterval(pollInterval);
    clearInterval(heartbeat);
    clearTimeout(reconnectTimer);
    try { res.end(); } catch (_) {}
  }

  req.on('close',   cleanup);
  req.on('error',   cleanup);
  res.on('error',   cleanup);
}
