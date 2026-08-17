import { TicketsAsync } from './redis.js';
import DISCORD_EMOJIS from './discord-emojis.js';

const API_BASE = 'https://discord.com/api/v10';
const VIEW_CHANNEL = 1024n;
const SEND_MESSAGES = 2048n;
const READ_MESSAGE_HISTORY = 65536n;
const CHANNEL_ACCESS = String(VIEW_CHANNEL | SEND_MESSAGES | READ_MESSAGE_HISTORY);
const CHANNEL_VIEW_DENY = String(VIEW_CHANNEL);
const DISCORD_ID_RE = /^\d{17,20}$/;
const STATUS_LABELS = {
  open: 'Menunggu',
  in_review: 'Sedang ditinjau',
  resolved: 'Selesai',
  rejected: 'Ditolak',
  expired: 'Kedaluwarsa',
};

let cachedBotUser = null;
const syncLocks = new Map();
const lastSyncAt = new Map();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function config() {
  return {
    token: process.env.DISCORD_BOT_TOKEN || '',
    guildId: process.env.DISCORD_GUILD_ID || '',
    parentId: process.env.DISCORD_TICKET_CATEGORY_ID || process.env.DISCORD_TICKET_PARENT_ID || '',
    archiveParentId: process.env.DISCORD_TICKET_ARCHIVE_CATEGORY_ID || '',
    supportRoleId: process.env.DISCORD_SUPPORT_ROLE_ID || '',
    publicBaseUrl: process.env.NEXT_PUBLIC_BASE_URL || '',
    deleteOnCleanup: String(process.env.DISCORD_TICKET_DELETE_ON_CLEANUP || '').toLowerCase() === 'true',
  };
}

export function hasDiscordTicketBridge() {
  const cfg = config();
  return Boolean(cfg.token && cfg.guildId && cfg.parentId);
}

function trimText(value, max = 1800) {
  const text = String(value || '').replace(/\u0000/g, '').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function channelSafe(value) {
  return String(value || 'ticket')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 72) || 'ticket';
}

function ticketChannelName(ticket, status = ticket.status || 'open') {
  const prefix = ['resolved', 'rejected', 'expired'].includes(status) ? 'closed' : 'ticket';
  return `${prefix}-${channelSafe(ticket.ticket_id)}`.slice(0, 100);
}

function isValidDiscordId(value) {
  return DISCORD_ID_RE.test(String(value || '').trim());
}

async function discordRequest(path, options = {}, retry = true) {
  const cfg = config();
  if (!cfg.token) throw new Error('DISCORD_BOT_TOKEN belum dikonfigurasi');

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${cfg.token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    signal: options.signal || AbortSignal.timeout(12_000),
  });

  if (response.status === 429 && retry) {
    const rate = await response.json().catch(() => ({}));
    const waitMs = Math.min(5000, Math.max(500, Number(rate.retry_after || 1) * 1000));
    await sleep(waitMs);
    return discordRequest(path, options, false);
  }

  const body = response.status === 204 ? null : await response.json().catch(async () => ({
    message: await response.text().catch(() => ''),
  }));

  if (!response.ok) {
    throw new Error(`Discord API ${response.status}: ${body?.message || 'request gagal'}`);
  }
  return body;
}

async function getBotUser() {
  if (cachedBotUser) return cachedBotUser;
  cachedBotUser = await discordRequest('/users/@me', { method: 'GET' });
  return cachedBotUser;
}

function buildPermissionOverwrites(ticket, botUserId) {
  const cfg = config();
  const overwrites = [];
  const hasSupportRole = isValidDiscordId(cfg.supportRoleId);
  const hasPlayer = isValidDiscordId(ticket.discord_user_id);

  // Ticket selalu privat. Tanpa role support, hanya administrator guild dan bot yang dapat melihat.
  overwrites.push({ id: cfg.guildId, type: 0, deny: CHANNEL_VIEW_DENY, allow: '0' });
  if (hasSupportRole) {
    overwrites.push({ id: cfg.supportRoleId, type: 0, allow: CHANNEL_ACCESS, deny: '0' });
  }
  if (hasPlayer) {
    overwrites.push({ id: String(ticket.discord_user_id), type: 1, allow: CHANNEL_ACCESS, deny: '0' });
  }
  if (isValidDiscordId(botUserId)) {
    overwrites.push({ id: String(botUserId), type: 1, allow: CHANNEL_ACCESS, deny: '0' });
  }
  return overwrites;
}

function ticketTypeLabel(type) {
  return {
    banding: 'Aju Banding',
    bug: 'Report Bug',
    report_player: 'Report Pemain',
    lainnya: 'Lainnya',
  }[type] || 'Support';
}

function ticketUrl(ticketId) {
  const base = config().publicBaseUrl.replace(/\/$/, '');
  return base ? `${base}/support?ticket=${encodeURIComponent(ticketId)}` : '';
}

export async function createDiscordTicketChannel(ticket) {
  if (!hasDiscordTicketBridge()) return null;

  try {
    const cfg = config();
    const bot = await getBotUser();
    const permissionOverwrites = buildPermissionOverwrites(ticket, bot?.id);
    const topicParts = [
      `Web Ticket: ${ticket.ticket_id}`,
      `Player: ${ticket.player_username}`,
      `Type: ${ticketTypeLabel(ticket.type)}`,
      ticketUrl(ticket.ticket_id),
    ].filter(Boolean);

    const channel = await discordRequest(`/guilds/${cfg.guildId}/channels`, {
      method: 'POST',
      body: JSON.stringify({
        name: ticketChannelName(ticket),
        type: 0,
        parent_id: cfg.parentId,
        topic: trimText(topicParts.join(' | '), 1024),
        permission_overwrites: permissionOverwrites,
      }),
    });

    const evidence = ticket.evidence_url ? `\n**Bukti:** ${trimText(ticket.evidence_url, 500)}` : '';
    const target = ticket.target_player ? `\n**Target:** ${trimText(ticket.target_player, 80)}` : '';
    const playerAccess = isValidDiscordId(ticket.discord_user_id)
      ? `\n**Discord player:** <@${ticket.discord_user_id}> — dapat membalas langsung di channel ini.`
      : '\n**Discord player:** tidak ditautkan; player tetap menerima balasan lewat web.';

    const message = await discordRequest(`/channels/${channel.id}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        content: `${DISCORD_EMOJIS.ATTENTION} **Ticket baru dari website**${isValidDiscordId(cfg.supportRoleId) ? ` · <@&${cfg.supportRoleId}>` : ''}${isValidDiscordId(ticket.discord_user_id) ? ` · <@${ticket.discord_user_id}>` : ''}`,
        embeds: [{
          title: `${DISCORD_EMOJIS.CS} ${ticketTypeLabel(ticket.type)} · ${ticket.ticket_id}`,
          color: 0xf97316,
          description: `**${trimText(ticket.subject, 200)}**\n\n${trimText(ticket.description, 1200)}${target}${evidence}${playerAccess}`,
          fields: [
            { name: 'Minecraft', value: `\`${trimText(ticket.player_username, 80)}\``, inline: true },
            { name: 'Status', value: STATUS_LABELS[ticket.status] || 'Menunggu', inline: true },
            { name: 'Sumber', value: ticketUrl(ticket.ticket_id) || 'Website Support', inline: false },
          ],
          timestamp: new Date().toISOString(),
          footer: { text: 'Balas di channel ini untuk mengirim jawaban ke chat web.' },
        }],
        allowed_mentions: {
          parse: [],
          users: isValidDiscordId(ticket.discord_user_id) ? [String(ticket.discord_user_id)] : [],
          roles: isValidDiscordId(cfg.supportRoleId) ? [String(cfg.supportRoleId)] : [],
        },
      }),
    });

    return {
      discord_channel_id: channel.id,
      discord_guild_id: cfg.guildId,
      discord_initial_message_id: message?.id || null,
      discord_last_message_id: message?.id || null,
      discord_bridge_status: 'connected',
    };
  } catch (error) {
    console.error('[discord-ticket] create channel:', error.message);
    return { discord_bridge_status: 'error', discord_bridge_error: trimText(error.message, 300) };
  }
}

export async function sendTicketMessageToDiscord(ticket, message) {
  if (!ticket?.discord_channel_id || !hasDiscordTicketBridge()) return null;

  try {
    const isPlayer = message.sender_type === 'player';
    const source = message.source === 'discord' ? 'Discord' : 'Web';
    const label = isPlayer ? `Player · ${message.sender}` : `Admin · ${message.sender || 'Admin'}`;
    const icon = isPlayer ? DISCORD_EMOJIS.MINECRAFT : DISCORD_EMOJIS.STAFF;
    const reply = await discordRequest(`/channels/${ticket.discord_channel_id}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        content: `${icon} **${trimText(label, 120)}** · ${source}\n${trimText(message.text, 1800)}`,
        allowed_mentions: { parse: [] },
      }),
    });
    return reply?.id || null;
  } catch (error) {
    console.error('[discord-ticket] relay message:', error.message);
    return null;
  }
}

function commandStatus(content) {
  const command = String(content || '').trim().toLowerCase().split(/\s+/)[0];
  if (['!close', '!resolve', '!selesai'].includes(command)) return 'resolved';
  if (['!reject', '!tolak'].includes(command)) return 'rejected';
  if (['!reopen', '!open', '!buka'].includes(command)) return 'in_review';
  return '';
}

function messageText(message) {
  const content = String(message.content || '').trim();
  const attachments = Array.isArray(message.attachments)
    ? message.attachments.map(item => item?.url).filter(Boolean)
    : [];
  return trimText([content, ...attachments].filter(Boolean).join('\n'), 3000);
}

export async function syncDiscordTicket(ticketOrId, { force = false } = {}) {
  const ticketId = typeof ticketOrId === 'string' ? ticketOrId : ticketOrId?.ticket_id;
  if (!ticketId) return null;

  const current = typeof ticketOrId === 'string' ? await TicketsAsync.byId(ticketId) : ticketOrId;
  if (!current?.discord_channel_id || !hasDiscordTicketBridge()) return current;

  const now = Date.now();
  if (!force && now - (lastSyncAt.get(ticketId) || 0) < 4500) return current;
  if (syncLocks.has(ticketId)) return syncLocks.get(ticketId);

  const work = (async () => {
    try {
      lastSyncAt.set(ticketId, Date.now());
      const after = current.discord_last_message_id ? `?after=${encodeURIComponent(current.discord_last_message_id)}&limit=50` : '?limit=50';
      const messages = await discordRequest(`/channels/${current.discord_channel_id}/messages${after}`, { method: 'GET' });
      const ordered = Array.isArray(messages) ? [...messages].sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : 1) : [];
      if (!ordered.length) return current;

      const known = new Set((current.messages || []).map(item => item.discord_message_id).filter(Boolean));
      let newestId = current.discord_last_message_id || null;
      let statusPatch = '';

      for (const discordMessage of ordered) {
        newestId = discordMessage.id;
        if (known.has(discordMessage.id) || discordMessage.author?.bot || discordMessage.webhook_id) continue;

        const isPlayer = isValidDiscordId(current.discord_user_id)
          && String(discordMessage.author?.id) === String(current.discord_user_id);
        const nextStatus = isPlayer ? '' : commandStatus(discordMessage.content);
        if (nextStatus) {
          statusPatch = nextStatus;
          continue;
        }

        const text = messageText(discordMessage);
        if (!text) continue;

        await TicketsAsync.addMessage(ticketId, {
          id: `dc-${discordMessage.id}`,
          sender: discordMessage.member?.nick || discordMessage.author?.global_name || discordMessage.author?.username || (isPlayer ? current.player_username : 'Discord Staff'),
          sender_type: isPlayer ? 'player' : 'admin',
          text,
          source: 'discord',
          discord_message_id: discordMessage.id,
          created_at: discordMessage.timestamp || new Date().toISOString(),
        });
      }

      const patch = { discord_last_message_id: newestId, discord_bridge_status: 'connected', discord_bridge_error: null };
      if (statusPatch) {
        patch.status = statusPatch;
        patch.closed_at = ['resolved', 'rejected'].includes(statusPatch) ? new Date().toISOString() : null;
      }
      await TicketsAsync.update(ticketId, patch);
      return await TicketsAsync.byId(ticketId);
    } catch (error) {
      console.error('[discord-ticket] sync:', error.message);
      await TicketsAsync.update(ticketId, {
        discord_bridge_status: 'error',
        discord_bridge_error: trimText(error.message, 300),
      }).catch(() => {});
      return await TicketsAsync.byId(ticketId);
    } finally {
      syncLocks.delete(ticketId);
    }
  })();

  syncLocks.set(ticketId, work);
  return work;
}

export async function updateDiscordTicketStatus(ticket, status) {
  if (!ticket?.discord_channel_id || !hasDiscordTicketBridge()) return;
  try {
    const cfg = config();
    await discordRequest(`/channels/${ticket.discord_channel_id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: ticketChannelName(ticket, status),
        parent_id: ['resolved', 'rejected', 'expired'].includes(status) && cfg.archiveParentId
          ? cfg.archiveParentId
          : undefined,
        topic: trimText(`Web Ticket: ${ticket.ticket_id} | Player: ${ticket.player_username} | Status: ${STATUS_LABELS[status] || status} | ${ticketUrl(ticket.ticket_id)}`, 1024),
      }),
    });
    await discordRequest(`/channels/${ticket.discord_channel_id}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        content: `${DISCORD_EMOJIS.CHECK} Status ticket diubah menjadi **${STATUS_LABELS[status] || status}**.`,
        allowed_mentions: { parse: [] },
      }),
    });
  } catch (error) {
    console.error('[discord-ticket] update status:', error.message);
  }
}

export async function archiveDiscordTicketChannel(ticket) {
  if (!ticket?.discord_channel_id || !hasDiscordTicketBridge()) return;
  const cfg = config();
  try {
    if (cfg.deleteOnCleanup) {
      await discordRequest(`/channels/${ticket.discord_channel_id}`, { method: 'DELETE' });
      return;
    }
    await discordRequest(`/channels/${ticket.discord_channel_id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: ticketChannelName(ticket, ticket.status || 'resolved'),
        parent_id: cfg.archiveParentId || undefined,
        topic: trimText(`Arsip Web Ticket: ${ticket.ticket_id} | Player: ${ticket.player_username} | Status: ${ticket.status}`, 1024),
      }),
    });
  } catch (error) {
    console.error('[discord-ticket] archive channel:', error.message);
  }
}

export { isValidDiscordId };
