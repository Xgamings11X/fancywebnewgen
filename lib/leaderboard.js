import { OrdersAsync } from './redis.js';

const SUCCESS_STATUSES = new Set(['success', 'paid', 'settlement', 'capture']);

function cleanName(value) {
  return String(value || '').trim().slice(0, 32);
}

function cleanUuid(value) {
  const raw = String(value || '').replace(/-/g, '').toLowerCase();
  return /^[0-9a-f]{32}$/.test(raw) ? raw : '';
}

function numericValue(value) {
  const number = Number(String(value ?? 0).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(number) ? number : 0;
}

function candidateRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const key of ['players', 'entries', 'leaderboard', 'results', 'data', 'items']) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      const nested = candidateRows(value);
      if (nested.length) return nested;
    }
  }
  return [];
}

function normalizeVoter(row, index) {
  const username = cleanName(row?.username || row?.player_name || row?.player || row?.name || row?.displayName);
  if (!username) return null;
  return {
    rank: Number(row?.rank || row?.position) || index + 1,
    username,
    uuid: cleanUuid(row?.uuid || row?.player_uuid),
    value: numericValue(row?.votes ?? row?.vote_count ?? row?.score ?? row?.value ?? row?.amount),
  };
}

export async function getTopVoters(limit = 10) {
  const pluginBase = String(process.env.PLUGIN_HTTP_URL || '').trim().replace(/\/$/, '');
  const endpoint = String(process.env.LEADERBOARD_ENDPOINT || (pluginBase ? `${pluginBase}/api/leaderboard` : '')).trim();
  if (!endpoint) return { entries: [], configured: false, error: '' };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);
  try {
    const url = new URL(endpoint);
    url.searchParams.set('board', process.env.LEADERBOARD_BOARD_VOTES || 'votes');
    url.searchParams.set('limit', String(limit));
    const headers = { Accept: 'application/json' };
    const apiKey = process.env.PLUGIN_SERVER_KEY || process.env.LEADERBOARD_API_KEY;
    if (apiKey) headers['X-Server-Key'] = apiKey;

    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const entries = candidateRows(payload)
      .map(normalizeVoter)
      .filter(Boolean)
      .sort((a, b) => b.value - a.value)
      .slice(0, limit)
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
    return { entries, configured: true, error: '' };
  } catch (error) {
    return {
      entries: [],
      configured: true,
      error: error?.name === 'AbortError' ? 'Endpoint voter melewati batas waktu' : 'Data voter belum dapat dimuat',
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getTopDonors(limit = 10) {
  const orders = await OrdersAsync.all();
  const donors = new Map();

  for (const order of orders) {
    if (!SUCCESS_STATUSES.has(String(order?.payment_status || '').toLowerCase())) continue;
    const username = cleanName(order?.buyer_username || order?.player_username);
    if (!username) continue;
    const key = username.toLowerCase();
    const current = donors.get(key) || {
      username,
      uuid: cleanUuid(order?.buyer_uuid || (!order?.is_gift && order?.player_uuid)),
      value: 0,
      purchases: 0,
      latestPurchaseAt: '',
    };
    current.value += Math.max(0, numericValue(order?.amount));
    current.purchases += 1;
    if (!current.uuid) current.uuid = cleanUuid(order?.buyer_uuid || (!order?.is_gift && order?.player_uuid));
    if (String(order?.created_at || '') > current.latestPurchaseAt) current.latestPurchaseAt = order.created_at;
    donors.set(key, current);
  }

  return [...donors.values()]
    .sort((a, b) => b.value - a.value || b.purchases - a.purchases || a.username.localeCompare(b.username))
    .slice(0, limit)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export async function getLeaderboard(limit = 10) {
  const safeLimit = Math.min(25, Math.max(3, Number(limit) || 10));
  const [voterResult, donors] = await Promise.all([getTopVoters(safeLimit), getTopDonors(safeLimit)]);
  return {
    voters: voterResult.entries,
    donors,
    voterConfigured: voterResult.configured,
    voterError: voterResult.error,
    updatedAt: new Date().toISOString(),
  };
}
