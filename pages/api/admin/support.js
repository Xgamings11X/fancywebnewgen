import { TicketsAsync } from '../../../lib/redis.js';
import { runCleanup } from '../../../lib/cleanup.js';
import { verifyToken } from '../../../lib/auth.js';
import {
  sendTicketMessageToDiscord,
  syncDiscordTicket,
  updateDiscordTicketStatus,
} from '../../../lib/discord-ticket.js';
import { parse } from 'cookie';
import { randomBytes } from 'crypto';

const ALLOWED_STATUSES = new Set(['open', 'in_review', 'resolved', 'rejected']);

function auth(req) {
  const token = parse(req.headers.cookie || '').admin_token || req.headers.authorization?.replace('Bearer ', '');
  return verifyToken(token)?.type === 'admin';
}

function cleanText(value, max) {
  return String(value || '').replace(/\u0000/g, '').trim().slice(0, max);
}

export default async function handler(req, res) {
  if (!auth(req)) return res.status(401).json({ success: false, message: 'Unauthorized' });

  try {
    if (req.method === 'GET') {
      runCleanup().catch(() => {});
      const { status, type, page = 1, id } = req.query;
      if (id) {
        let ticket = await TicketsAsync.byId(String(id));
        if (!ticket) return res.status(404).json({ success: false, message: 'Tiket tidak ditemukan' });
        ticket = await syncDiscordTicket(ticket);
        return res.json({ success: true, ticket });
      }

      let tickets = (await TicketsAsync.all())
        .sort((a, b) => (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || ''));
      if (status && status !== 'all') tickets = tickets.filter(ticket => ticket.status === status);
      if (type && type !== 'all') tickets = tickets.filter(ticket => ticket.type === type);
      const total = tickets.length;
      const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
      tickets = tickets.slice((safePage - 1) * 25, safePage * 25);
      return res.json({ success: true, tickets, total });
    }

    if (req.method === 'PATCH') {
      const { id, status, admin_notes, admin_reply, message, cancel_cleanup } = req.body || {};
      const ticketId = cleanText(id, 80);
      if (!ticketId) return res.status(400).json({ success: false, message: 'ID tiket diperlukan' });

      let ticket = await TicketsAsync.byId(ticketId);
      if (!ticket) return res.status(404).json({ success: false, message: 'Tiket tidak ditemukan' });

      if (message !== undefined) {
        const text = cleanText(message, 3000);
        if (!text) return res.status(400).json({ success: false, message: 'Pesan tidak boleh kosong' });
        if (['resolved', 'rejected', 'expired'].includes(ticket.status)) {
          return res.status(400).json({ success: false, message: 'Buka kembali tiket sebelum membalas' });
        }

        const nextMessage = {
          id: randomBytes(4).toString('hex'),
          sender: 'Admin',
          sender_type: 'admin',
          text,
          source: 'web',
        };
        const discordMessageId = await sendTicketMessageToDiscord(ticket, nextMessage);
        await TicketsAsync.addMessage(ticketId, {
          ...nextMessage,
          discord_message_id: discordMessageId || null,
        });
        if (ticket.status === 'open') {
          await TicketsAsync.update(ticketId, { status: 'in_review' });
          ticket = await TicketsAsync.byId(ticketId);
          updateDiscordTicketStatus(ticket, 'in_review').catch(() => {});
        }
        return res.json({ success: true, discordRelayed: Boolean(discordMessageId) });
      }

      if (cancel_cleanup) {
        await TicketsAsync.update(ticketId, { closed_at: null, status: 'in_review' });
        ticket = await TicketsAsync.byId(ticketId);
        updateDiscordTicketStatus(ticket, 'in_review').catch(() => {});
        return res.json({ success: true, message: 'Grace period dibatalkan' });
      }

      const patch = {};
      if (status !== undefined) {
        if (!ALLOWED_STATUSES.has(status)) {
          return res.status(400).json({ success: false, message: 'Status tidak valid' });
        }
        patch.status = status;
        if (status === 'resolved' || status === 'rejected') {
          if (!ticket.closed_at) patch.closed_at = new Date().toISOString();
        } else {
          patch.closed_at = null;
        }
      }
      if (admin_notes !== undefined) patch.admin_notes = cleanText(admin_notes, 4000) || null;
      if (admin_reply !== undefined) {
        const reply = cleanText(admin_reply, 4000);
        patch.admin_reply = reply || null;
        patch.admin_replied_at = reply ? new Date().toISOString() : null;
      }

      const updated = await TicketsAsync.update(ticketId, patch);
      if (status !== undefined && updated) updateDiscordTicketStatus(updated, status).catch(() => {});
      return res.json({ success: true, ticket: updated });
    }

    res.setHeader('Allow', 'GET, PATCH');
    return res.status(405).json({ success: false, message: 'Method tidak diizinkan' });
  } catch (error) {
    console.error('[admin-support]', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server' });
  }
}
