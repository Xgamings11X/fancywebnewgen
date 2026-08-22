import { parse } from 'cookie';
import { verifyToken } from '../../lib/auth.js';
import { FeedbackAsync } from '../../lib/redis.js';

const MAX_LENGTH = 280;
const RATING_LABELS = ['Sangat buruk', 'Kurang baik', 'Cukup', 'Baik', 'Sangat baik'];

function publicFeedback(item) {
  return {
    id: item.id,
    username: String(item.displayName || item.username || 'Player').replace(/^\./, ''),
    avatarUsername: item.username || 'steve',
    uuid: item.uuid || null,
    platform: item.platform === 'bedrock' ? 'bedrock' : 'java',
    rating: Math.max(1, Math.min(5, Number(item.rating) || 5)),
    text: String(item.text || '').slice(0, MAX_LENGTH),
    updated_at: item.updated_at || item.created_at || null,
  };
}

function cleanText(value) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_LENGTH);
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const items = (await FeedbackAsync.all())
      .slice(0, 10)
      .filter(item => item.text)
      .map(publicFeedback);
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.json({ success: true, feedback: items });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ success: false, message: 'Metode tidak didukung' });
  }

  const cookieToken = parse(req.headers.cookie || '').token;
  const bearerToken = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const user = verifyToken(cookieToken || bearerToken);
  if (!user || user.type !== 'player') {
    return res.status(401).json({ success: false, message: 'Login Minecraft diperlukan' });
  }

  const rating = Number(req.body?.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ success: false, message: 'Pilih penilaian terlebih dahulu' });
  }
  const text = cleanText(req.body?.text) || RATING_LABELS[rating - 1];

  const saved = await FeedbackAsync.upsert({
    username: user.username,
    displayName: user.displayName || String(user.username).replace(/^\./, ''),
    uuid: user.uuid || null,
    platform: user.platform === 'bedrock' ? 'bedrock' : 'java',
    rating,
    text,
  });

  return res.status(200).json({ success: true, feedback: publicFeedback(saved) });
}
