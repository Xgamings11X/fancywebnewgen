import net from 'net';
import { SettingsAsync } from '../../../lib/redis.js';

function numberValue(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function isPrivateHostname(hostname) {
  const normalized = hostname.toLowerCase();
  if (normalized === 'localhost' || normalized.endsWith('.local')) return true;
  if (!net.isIP(normalized)) return false;
  if (normalized === '::1') return true;
  if (normalized.startsWith('10.') || normalized.startsWith('127.') || normalized.startsWith('169.254.') || normalized.startsWith('192.168.')) return true;
  const match = normalized.match(/^172\.(\d+)\./);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

function validateStatusUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('invalid_protocol');
  if (url.username || url.password || isPrivateHostname(url.hostname)) throw new Error('blocked_host');
  return url.toString();
}

function normalizeStatus(data) {
  if (!data || typeof data !== 'object') return { online:false, players:0, maxPlayers:0, version:'' };

  const online = data.online === true || data.status === 'online' || data.status === true;
  const players = numberValue(data.players?.online ?? data.players ?? data.onlinePlayers ?? data.player_count);
  const maxPlayers = numberValue(data.players?.max ?? data.maxPlayers ?? data.max ?? data.max_players);
  const versionValue = data.version?.name_clean ?? data.version?.name ?? data.version ?? data.software ?? '';
  const version = typeof versionValue === 'string' || typeof versionValue === 'number'
    ? String(versionValue).slice(0, 80)
    : '';

  return { online, players, maxPlayers, version };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error:'Method Not Allowed' });
  }

  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');

  try {
    const settings = await SettingsAsync.get();
    const configuredUrl = process.env.MC_STATUS_URL || settings.mc_status_url;
    if (!configuredUrl) {
      return res.status(200).json({ online:false, players:0, maxPlayers:0, version:'', reason:'not_configured' });
    }

    const url = validateStatusUrl(configuredUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6500);

    try {
      const response = await fetch(url, {
        signal:controller.signal,
        headers:{ Accept:'application/json', 'User-Agent':'FancyNetwork/2.0' },
        redirect:'error',
      });
      if (!response.ok) throw new Error(`upstream_${response.status}`);
      const data = await response.json();
      return res.status(200).json(normalizeStatus(data));
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    const reason = error?.name === 'AbortError' ? 'timeout' : 'unavailable';
    return res.status(200).json({ online:false, players:0, maxPlayers:0, version:'', reason });
  }
}
