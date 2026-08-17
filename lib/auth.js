/**
 * lib/auth.js — Player login via plugin player.yml (HTTP), no DB
 */
import jwt    from 'jsonwebtoken';
import { checkPlayer } from './plugin.js';

const SECRET = () => process.env.JWT_SECRET || 'fancy-secret-GANTI';

export async function verifyMinecraftPlayer(username, platform = 'java') {
  const name = platform === 'bedrock'
    ? (username.startsWith('.') ? username : `.${username}`)
    : username;

  const r = await checkPlayer(name);

  if (!r.ok) {
    // Plugin tidak tersedia — tolak login (tidak ada fallback DB lagi)
    return {
      success: false,
      message: r.error?.includes('PLUGIN_HTTP_URL')
        ? 'Plugin belum dikonfigurasi. Hubungi admin.'
        : `Tidak bisa terhubung ke server. Coba lagi. (${r.error})`,
    };
  }

  if (!r.exists) {
    return {
      success: false,
      message: `Player "${name.replace(/^\./, '')}" tidak ditemukan. Pastikan sudah pernah join ke server Fancy Network minimal sekali.`,
    };
  }

  return {
    success: true,
    player: {
      username:    r.username || name,
      displayName: (r.username || name).replace(/^\./, ''),
      uuid:        r.uuid   || null,
      rank:        r.rank   || 'default',
      isPremium:   r.premium || false,
      platform,
    },
  };
}

export function generatePlayerToken(p) {
  return jwt.sign(
    { username: p.username, displayName: p.displayName, uuid: p.uuid,
      rank: p.rank, isPremium: p.isPremium, platform: p.platform, type: 'player' },
    SECRET(), { expiresIn: '7d' }
  );
}
export function generateAdminToken(a) {
  return jwt.sign({ id: a.id, username: a.username, type: 'admin' }, SECRET(), { expiresIn: '1d' });
}
export function verifyToken(t) {
  try { return jwt.verify(t, SECRET()); } catch { return null; }
}
export async function verifyAdmin(username, password) {
  if (!username || !password) return { success: false, message: 'Isi username dan password' };
  if (username === (process.env.ADMIN_USERNAME || 'admin') &&
      password === (process.env.ADMIN_PASSWORD || ''))
    return { success: true, admin: { id: 0, username } };
  try {
    const bcrypt_ = await import('bcryptjs');
    // Cek di storage admins jika ada
    const { readData } = await import('./storage.js');
    const admins = readData('admins.json') || [];
    const found  = admins.find(a => a.username === username);
    if (found && await bcrypt_.default.compare(password, found.password))
      return { success: true, admin: { id: found.id, username } };
  } catch {}
  return { success: false, message: 'Username atau password salah' };
}
