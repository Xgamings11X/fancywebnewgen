/**
 * /api/admin/test-webhook — Test kirim Discord webhook ke Admin DAN Player
 *
 * FIXES (v3):
 *  - v1: Hanya memanggil webhookTransaction() → silent-fail (error tidak di-throw)
 *  - v2: Direct fetch ke Discord Admin URL saja
 *  - v3 (sekarang): Tes KEDUA channel (Admin + Player) secara paralel,
 *    laporkan status masing-masing secara terpisah agar admin tahu channel mana
 *    yang bermasalah.
 */
import { verifyToken } from '../../../lib/auth.js';
import { parse }       from 'cookie';
import DISCORD_EMOJIS   from '../../../lib/discord-emojis.js';

function auth(req) {
  const t = parse(req.headers.cookie || '').admin_token
    || req.headers.authorization?.replace('Bearer ', '');
  return verifyToken(t)?.type === 'admin';
}

/** Kirim satu embed test ke Discord webhook URL tertentu */
async function pingWebhook(url, channelLabel) {
  if (!url) return { ok: false, skipped: true, message: `${channelLabel}: env var tidak di-set` };

  const payload = {
    embeds: [{
      color: channelLabel === 'Admin' ? 0xf97316 : 0x57f287,
      title: `${DISCORD_EMOJIS.CHECK} Test Webhook — ${channelLabel}`,
      description: `${DISCORD_EMOJIS.ONLINE} Koneksi ke channel **${channelLabel}** berhasil terhubung dan siap menerima notifikasi.`,
      fields: [
        { name: '𝗖𝗛𝗔𝗡𝗡𝗘𝗟',  value: `\`${channelLabel}\``,         inline: true },
        { name: '𝗦𝗧𝗔𝗧𝗨𝗦',    value: '`TEST — OK`',               inline: true },
        { name: '𝗧𝗥𝗫 𝗜𝗗',   value: `\`TEST-${Date.now()}\``,    inline: true },
        { name: `${DISCORD_EMOJIS.MINECRAFT} 𝗣𝗟𝗔𝗬𝗘𝗥`, value: '`TestPlayer`',               inline: true },
        { name: `${DISCORD_EMOJIS.BUY} 𝗣𝗥𝗢𝗗𝗨𝗞`, value: '`VIP Package (TEST)`',       inline: true },
        { name: `${DISCORD_EMOJIS.MONEY} 𝗛𝗔𝗥𝗚𝗔`, value: '`Rp 50.000`',                inline: true },
      ],
      footer: { text: `Fancy Network Admin Panel · ${channelLabel} Channel` },
      timestamp: new Date().toISOString(),
    }],
  };

  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
      signal:  AbortSignal.timeout(10_000),
    });

    if (res.ok) {
      return {
        ok:      true,
        message: `${channelLabel}: Berhasil dikirim (HTTP ${res.status})`,
        status:  res.status,
      };
    }

    let detail = '';
    try { detail = await res.text(); } catch {}
    return {
      ok:      false,
      message: `${channelLabel}: Discord menolak (HTTP ${res.status}) — ${detail.slice(0, 200) || 'no body'}`,
      status:  res.status,
    };

  } catch (e) {
    const isTimeout = e.name === 'TimeoutError' || e.name === 'AbortError';
    return {
      ok:      false,
      message: isTimeout
        ? `${channelLabel}: Timeout >10 detik. Periksa koneksi server.`
        : `${channelLabel}: Error — ${e.message}`,
    };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!auth(req))            return res.status(401).json({ error: 'Unauthorized' });

  const adminUrl  = process.env.DISCORD_WEBHOOK_ADMIN  || process.env.DISCORD_WEBHOOK_TX;
  const playerUrl = process.env.DISCORD_WEBHOOK_PLAYER;

  if (!adminUrl && !playerUrl) {
    return res.status(400).json({
      success: false,
      message: 'Tidak ada webhook yang dikonfigurasi. Set DISCORD_WEBHOOK_ADMIN dan/atau DISCORD_WEBHOOK_PLAYER di environment variables.',
    });
  }

  // Tes kedua channel secara paralel
  const [adminResult, playerResult] = await Promise.all([
    pingWebhook(adminUrl,  'Admin'),
    pingWebhook(playerUrl, 'Player'),
  ]);

  const allOk = (adminResult.ok || adminResult.skipped) &&
                (playerResult.ok || playerResult.skipped);

  // Buat summary message
  const lines = [];
  if (!adminResult.skipped)  lines.push(adminResult.message);
  if (!playerResult.skipped) lines.push(playerResult.message);
  if (playerResult.skipped)  lines.push('Player channel: tidak dikonfigurasi (DISCORD_WEBHOOK_PLAYER kosong)');

  return res.status(allOk ? 200 : 502).json({
    success: allOk,
    message: lines.join('\n'),
    details: {
      admin:  adminResult,
      player: playerResult,
    },
  });
}
