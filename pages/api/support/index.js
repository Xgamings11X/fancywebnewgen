import { TicketsAsync } from '../../../lib/redis.js';
import { verifyToken } from '../../../lib/auth.js';
import { webhookReport } from '../../../lib/discord.js';
import {
  createDiscordTicketChannel,
  isValidDiscordId,
  sendTicketMessageToDiscord,
  syncDiscordTicket,
} from '../../../lib/discord-ticket.js';
import { parse } from 'cookie';
import { randomBytes } from 'crypto';

const ALLOWED_TYPES = new Set(['banding', 'bug', 'report_player', 'lainnya']);
const CLOSED_STATUSES = new Set(['resolved', 'rejected', 'expired']);

function getUser(req) {
  const token = parse(req.headers.cookie || '').token || req.headers.authorization?.replace('Bearer ', '');
  return verifyToken(token);
}

function genTicketId(username) {
  const code = randomBytes(3).toString('hex').toUpperCase();
  const safe = (username || 'USER').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 12) || 'USER';
  return `${safe}-${code}`;
}

function cleanText(value, max) {
  return String(value || '').replace(/\u0000/g, '').trim().slice(0, max);
}

function safeEvidenceUrl(value) {
  const raw = cleanText(value, 1000);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function setAllow(res, methods) {
  res.setHeader('Allow', methods.join(', '));
}

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      const user = getUser(req);
      if (!user || user.type !== 'player') {
        return res.status(401).json({ success: false, message: 'Login terlebih dahulu' });
      }

      const { type, subject, description, target_player, evidence_url, discord_user_id } = req.body || {};
      const cleanSubject = cleanText(subject, 200);
      const cleanDescription = cleanText(description, 4000);
      const cleanTarget = cleanText(target_player, 80);
      const cleanDiscordId = cleanText(discord_user_id, 20);

      if (!ALLOWED_TYPES.has(type)) {
        return res.status(400).json({ success: false, message: 'Tipe tiket tidak valid' });
      }
      if (!cleanSubject || !cleanDescription) {
        return res.status(400).json({ success: false, message: 'Subjek dan deskripsi wajib diisi' });
      }
      if (type === 'report_player' && !cleanTarget) {
        return res.status(400).json({ success: false, message: 'Nama pemain yang dilaporkan wajib diisi' });
      }
      if (cleanDiscordId && !isValidDiscordId(cleanDiscordId)) {
        return res.status(400).json({ success: false, message: 'Discord User ID harus berupa 17–20 digit angka' });
      }
      if (evidence_url && !safeEvidenceUrl(evidence_url)) {
        return res.status(400).json({ success: false, message: 'Link bukti harus menggunakan http:// atau https://' });
      }
      if (await TicketsAsync.countToday(user.username) >= 3) {
        return res.status(429).json({ success: false, message: 'Maksimal 3 tiket per 24 jam' });
      }

      const ticketId = genTicketId(user.username);
      const createdAt = new Date().toISOString();
      const firstMsg = {
        id: randomBytes(4).toString('hex'),
        sender: user.username,
        sender_type: 'player',
        text: cleanDescription,
        source: 'web',
        created_at: createdAt,
      };
      const ticket = await TicketsAsync.add({
        ticket_id: ticketId,
        type,
        player_username: user.username,
        subject: cleanSubject,
        description: cleanDescription,
        target_player: cleanTarget || null,
        evidence_url: safeEvidenceUrl(evidence_url),
        discord_user_id: cleanDiscordId || null,
        discord_bridge_status: 'connecting',
        messages: [firstMsg],
      });

      const bridgePatch = await createDiscordTicketChannel(ticket);
      if (bridgePatch) await TicketsAsync.update(ticketId, bridgePatch);

      if (!bridgePatch?.discord_channel_id) {
        webhookReport(ticket).catch(() => {});
      }

      return res.status(201).json({
        success: true,
        ticketId,
        discordLinked: Boolean(bridgePatch?.discord_channel_id),
        discordPlayerLinked: Boolean(cleanDiscordId),
      });
    }

    if (req.method === 'GET') {
      const user = getUser(req);
      if (!user) return res.status(401).json({ success: false, message: 'Sesi tidak valid' });
      const { id } = req.query;

      if (id) {
        let ticket = await TicketsAsync.byId(String(id));
        if (!ticket) return res.status(404).json({ success: false, message: 'Tiket tidak ditemukan' });
        if (ticket.player_username !== user.username && user.type !== 'admin') {
          return res.status(403).json({ success: false, message: 'Tidak memiliki akses ke tiket ini' });
        }
        ticket = await syncDiscordTicket(ticket);
        return res.json({ success: true, ticket });
      }

      const tickets = (await TicketsAsync.byPlayer(user.username))
        .sort((a, b) => (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || ''));
      return res.json({ success: true, tickets });
    }

    if (req.method === 'PATCH') {
      const user = getUser(req);
      if (!user || user.type !== 'player') {
        return res.status(401).json({ success: false, message: 'Login terlebih dahulu' });
      }

      const ticketId = cleanText(req.body?.ticket_id, 80);
      const text = cleanText(req.body?.text, 3000);
      if (!ticketId || !text) return res.status(400).json({ success: false, message: 'Pesan tidak boleh kosong' });

      const ticket = await TicketsAsync.byId(ticketId);
      if (!ticket) return res.status(404).json({ success: false, message: 'Tiket tidak ditemukan' });
      if (ticket.player_username !== user.username) return res.status(403).json({ success: false, message: 'Akses ditolak' });
      if (CLOSED_STATUSES.has(ticket.status)) {
        return res.status(400).json({ success: false, message: 'Tiket sudah ditutup' });
      }

      const message = {
        id: randomBytes(4).toString('hex'),
        sender: user.username,
        sender_type: 'player',
        text,
        source: 'web',
      };
      const discordMessageId = await sendTicketMessageToDiscord(ticket, message);
      await TicketsAsync.addMessage(ticketId, {
        ...message,
        discord_message_id: discordMessageId || null,
      });
      return res.json({ success: true, discordRelayed: Boolean(discordMessageId) });
    }

    setAllow(res, ['GET', 'POST', 'PATCH']);
    return res.status(405).json({ success: false, message: 'Method tidak diizinkan' });
  } catch (error) {
    console.error('[support-api]', error);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server' });
  }
}
