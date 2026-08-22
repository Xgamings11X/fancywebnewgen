import { getLeaderboard } from '../../lib/leaderboard.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method tidak diizinkan' });
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
  try {
    const leaderboard = await getLeaderboard(req.query.limit);
    return res.status(200).json({ success: true, ...leaderboard });
  } catch (error) {
    console.error('[leaderboard]', error.message);
    return res.status(500).json({ success: false, message: 'Leaderboard belum dapat dimuat' });
  }
}
