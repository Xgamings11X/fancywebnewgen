/**
 * lib/plugin.js — FancyNetworkAPI Bridge (HTTP only)
 *
 * Endpoint plugin yang dipakai website:
 *   GET  /api/ping                    → health check
 *   POST /api/transaction             → eksekusi 1 transaksi
 *   POST /api/products                → batch transaksi
 *   POST /api/check-player            → cek player + rank (juga bisa GET ?name=)
 *   GET  /api/player?name=<player>    → info lengkap player dari player.yml
 *
 * Field wajib POST /api/transaction:
 *   { transaction_id, player_name, player_uuid, product_id, amount, status, timestamp }
 *   ⚠️  Plugin expect "transaction_id" — bukan "order_id"
 */

function pluginUrl() { return (process.env.PLUGIN_HTTP_URL || '').replace(/\/$/, ''); }
function serverKey() { return process.env.PLUGIN_SERVER_KEY || ''; }

async function http(path, options = {}) {
  const base = pluginUrl();
  if (!base) throw new Error('PLUGIN_HTTP_URL belum diset di .env.local');

  const url = `${base}${path}`;
  const body = options.body;

  console.log(`[plugin] ${options.method || 'GET'} ${url}`, body ? JSON.parse(body) : '');

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Server-Key': serverKey(),
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(8000),
  });

  const txt = await res.text().catch(() => '');
  console.log(`[plugin] response ${res.status}:`, txt.slice(0, 300));

  if (!res.ok) {
    throw new Error(`Plugin HTTP ${res.status}: ${txt}`);
  }

  try { return JSON.parse(txt); } catch { return { raw: txt }; }
}

/** GET /api/ping → { status: "ok", ... } */
export async function pingPlugin() {
  try   { const d = await http('/api/ping'); return { ok: true, ...d }; }
  catch (e) { return { ok: false, error: e.message }; }
}

/**
 * POST /api/check-player  { username }
 * → { exists: true, username: "Steve", rank: "vipplus" }
 */
export async function checkPlayer(username) {
  try {
    const data = await http('/api/check-player', {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
    return { ok: true, ...data };
  } catch (e) {
    // Fallback ke GET
    try {
      const base = pluginUrl();
      if (!base) return { ok: false, error: 'PLUGIN_HTTP_URL belum diset' };
      const res = await fetch(
        `${base}/api/check-player?name=${encodeURIComponent(username)}`,
        { headers: { 'X-Server-Key': serverKey() }, signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const data = await res.json();
      return { ok: true, ...data };
    } catch (e2) {
      return { ok: false, error: e2.message };
    }
  }
}



/**
 * POST /api/transaction — eksekusi 1 transaksi
 * ⚠️  Field: transaction_id (bukan order_id!)
 * Body: { transaction_id, player_name, player_uuid, product_id, amount, status, timestamp }
 * → { success, queued, message }
 */
export async function notifyTransaction(payload) {
  // Pastikan field yang dikirim adalah transaction_id
  if (payload.order_id && !payload.transaction_id) {
    console.warn('[plugin] ⚠️  notifyTransaction dipanggil dengan order_id — otomatis dikonversi ke transaction_id');
    payload = { ...payload, transaction_id: payload.order_id };
    delete payload.order_id;
  }
  try {
    const data = await http('/api/transaction', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return { ok: true, ...data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}


