import { getLeaderboard, getTopDonors, getTopVoters } from '../../lib/leaderboard.js';

const VOTER_CACHE_SECONDS = Math.max(3600, Number(process.env.LEADERBOARD_VOTER_CACHE_SECONDS) || 86400);

function safeLimit(value) {
  return Math.min(25, Math.max(3, Number(value) || 10));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method tidak diizinkan' });
  try {
    const scope = String(req.query.scope || '').toLowerCase();
    const limit = safeLimit(req.query.limit);

    if (scope === 'voter') {
      const voter = await getTopVoters(limit);
      res.setHeader('Cache-Control', `public, s-maxage=${VOTER_CACHE_SECONDS}, stale-while-revalidate=3600`);
      return res.status(200).json({
        success: true,
        voters: voter.entries,
        voterConfigured: voter.configured,
        voterError: voter.error,
        updatedAt: new Date().toISOString(),
        refreshSeconds: VOTER_CACHE_SECONDS,
      });
    }

    if (scope === 'donor') {
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
      return res.status(200).json({ success: true, donors: await getTopDonors(limit) });
    }

    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
    const leaderboard = await getLeaderboard(req.query.limit);
    return res.status(200).json({ success: true, ...leaderboard });
  } catch (error) {
    console.error('[leaderboard]', error.message);
    return res.status(500).json({ success: false, message: 'Leaderboard belum dapat dimuat' });
  }
}
