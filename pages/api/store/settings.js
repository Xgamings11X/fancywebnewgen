/**
 * pages/api/store/settings.js — PUBLIC read-only endpoint
 *
 * TUJUAN:
 *   _app.js butuh mengambil bg_desktop dan bg_mobile dari settings
 *   agar bisa menampilkan background dinamis di semua halaman.
 *
 *   Sebelumnya: fetch('/api/admin/settings') → 401 Unauthorized
 *   untuk semua user publik yang tidak punya admin_token.
 *   Ini muncul di console sebagai error merah dan membuang
 *   resource di main thread (Lighthouse: "Avoid excessive main-thread work").
 *
 *   Sekarang: endpoint ini return HANYA field yang aman untuk publik.
 *   Field sensitif (plugin_server_key, password, dsb) TIDAK pernah
 *   dikirim ke client.
 *
 * METHOD: GET only
 * AUTH:   Tidak perlu — ini data publik (background URL, nama server)
 */
import { SettingsAsync } from '../../../lib/redis.js';

// Field yang BOLEH dilihat publik
const PUBLIC_FIELDS = [
  'bg_desktop',
  'bg_mobile',
  'server_name',
  'server_ip',
  'bedrock_ip',
  'bedrock_port',
  'logo_url',
  'hero_title',
  'hero_subtitle',
  'famous_apply_url',
  'server_description',
  'discord_url',
  'vote_url',
  'whatsapp_url',
  'tiktok_url',
  'youtube_url',
  'players_online',
  'maintenance_mode',
];

export default async function handler(req, res) {
  // Hanya GET yang diizinkan
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Cache response 60 detik di browser & 300 detik di CDN/proxy
  // Mengurangi beban request berulang dari setiap page load
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');

  try {
    const allSettings = await SettingsAsync.get();

    // Filter: hanya kirim field publik yang aman
    const publicSettings = {};
    for (const key of PUBLIC_FIELDS) {
      if (allSettings[key] !== undefined) {
        publicSettings[key] = allSettings[key];
      }
    }

    return res.status(200).json({
      success: true,
      settings: publicSettings,
    });
  } catch (e) {
    // Gagal dengan empty settings — client dapat fallback ke default
    return res.status(200).json({
      success: true,
      settings: {},
    });
  }
}
