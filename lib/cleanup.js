/**
 * lib/cleanup.js — Lazy cleanup tiket
 *
 * Dipanggil di background setiap kali admin fetch tiket.
 * Tidak blocking (fire-and-forget) jadi tidak memperlambat response.
 *
 * Strategi:
 *   • resolved/rejected + closed_at > 2 menit  → arsip + hapus
 *   • closed_at belum di-set                    → set sekarang (mulai grace period)
 *   • tidak aktif > 5 hari                      → arsip + hapus
 */
import { TicketsAsync }         from './redis.js';
import { webhookTicketArchive } from './discord.js';
import { archiveDiscordTicketChannel } from './discord-ticket.js';

const FIVE_DAYS_MS   = 5 * 24 * 60 * 60 * 1000;
const TWO_MINUTES_MS = 2 * 60 * 1000;

// Throttle: jangan jalankan lebih dari sekali per 30 detik
let lastRunAt = 0;

export async function runCleanup() {
  const now = Date.now();
  if (now - lastRunAt < 30_000) return; // throttle
  lastRunAt = now;

  try {
    const tickets = await TicketsAsync.all();

    for (const ticket of tickets) {
      const isClosedStatus = ['resolved','rejected','expired'].includes(ticket.status);
      const closedMs       = ticket.closed_at ? new Date(ticket.closed_at).getTime() : null;
      const updatedMs      = new Date(ticket.updated_at || ticket.created_at).getTime();
      const inactiveMs     = now - updatedMs;

      if (isClosedStatus && closedMs && (now - closedMs) >= TWO_MINUTES_MS) {
        // Sudah lewat grace period → arsip & hapus
        const fresh = await TicketsAsync.byId(ticket.ticket_id);
        if (fresh) {
          await webhookTicketArchive(fresh).catch(()=>{});
          await archiveDiscordTicketChannel(fresh).catch(()=>{});
        }
        await TicketsAsync.delete(ticket.ticket_id);

      } else if (isClosedStatus && !closedMs) {
        // Baru pertama kali ketemu → mulai grace period
        await TicketsAsync.update(ticket.ticket_id, { closed_at: new Date().toISOString() });

      } else if (!isClosedStatus && inactiveMs >= FIVE_DAYS_MS) {
        // Tidak aktif > 5 hari
        await TicketsAsync.update(ticket.ticket_id, { status:'expired', closed_at: new Date().toISOString() });
        const fresh = await TicketsAsync.byId(ticket.ticket_id);
        if (fresh) {
          await webhookTicketArchive(fresh).catch(()=>{});
          await archiveDiscordTicketChannel(fresh).catch(()=>{});
        }
        await TicketsAsync.delete(ticket.ticket_id);
      }
    }
  } catch (e) {
    console.error('[cleanup] error:', e.message);
  }
}
