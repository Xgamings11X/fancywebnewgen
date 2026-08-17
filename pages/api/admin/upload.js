/**
 * pages/api/admin/upload.js
 * 
 * Vercel-compatible: tidak butuh Cloudinary, S3, atau storage eksternal.
 * Gambar disimpan sebagai base64 dataURL → langsung dipakai sebagai src di <img>.
 * Data tersimpan di Redis bareng produk/kategori.
 *
 * Request body (JSON):
 *   filename  {string}  — nama file asli
 *   type      {string}  — MIME type, misal "image/png"
 *   data      {string}  — base64 dataURL, misal "data:image/png;base64,..."
 *
 * Response:
 *   { success: true, url: "data:image/png;base64,..." }
 *   { success: false, message: "..." }
 */

import { verifyToken } from '../../../lib/auth.js';
import { parse }       from 'cookie';

export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
};

// Auth
function auth(req) {
  const t = parse(req.headers.cookie || '').admin_token
          || req.headers.authorization?.replace('Bearer ', '');
  return verifyToken(t)?.type === 'admin';
}

// Allowed MIME types
const ALLOWED = {
  'image/jpeg': 'jpg',
  'image/jpg':  'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'image/gif':  'gif',
};

export default async function handler(req, res) {
  if (!auth(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { type, data } = req.body || {};

    if (!ALLOWED[type]) {
      return res.status(400).json({ success: false, message: 'Format tidak didukung. Gunakan JPG, PNG, WEBP, atau GIF.' });
    }

    if (!data || !data.startsWith('data:')) {
      return res.status(400).json({ success: false, message: 'Data gambar tidak valid.' });
    }

    // Cek ukuran file (max 8MB setelah decode — untuk background image)
    const dataOnly = data.replace(/^data:image\/\w+;base64,/, '');
    const sizeBytes = Buffer.byteLength(dataOnly, 'base64');
    if (sizeBytes > 8 * 1024 * 1024) {
      return res.status(400).json({ success: false, message: 'Ukuran file maksimal 8MB.' });
    }

    // Pastikan format dataURL benar
    const cleanData = data.startsWith(`data:${type};base64,`)
      ? data
      : `data:${type};base64,${dataOnly}`;

    // Return dataURL langsung — tidak perlu storage eksternal
    // Di Vercel, ini disimpan di Redis bareng data produk/kategori
    return res.json({ success: true, url: cleanData, provider: 'base64' });

  } catch (e) {
    console.error('[upload]', e);
    return res.status(500).json({ success: false, message: e.message });
  }
}
