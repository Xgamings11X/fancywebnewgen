import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import FancyNav, { PlayerAvatar } from '../components/FancyNav';
import FancyFooter from '../components/FancyFooter';
import Icon from '../components/Icon';

const LoginModal = dynamic(() => import('../components/LoginModal'), { ssr: false });

function safeUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch { return ''; }
}

function skinUrl(entry, fullBody = false) {
  if (entry?.uuid) return `https://crafatar.com/renders/${fullBody ? 'body' : 'head'}/${entry.uuid}?overlay`;
  const username = String(entry?.username || 'steve').replace(/^\./, '');
  return `https://minotar.net/${fullBody ? 'body' : 'helm'}/${encodeURIComponent(username)}/${fullBody ? 120 : 64}.png`;
}

function valueLabel(type, entry) {
  return type === 'voter'
    ? `${Number(entry.value || 0).toLocaleString('id-ID')} vote`
    : `Rp ${Number(entry.value || 0).toLocaleString('id-ID')}`;
}

function Podium({ entries, type }) {
  const top = entries.slice(0, 3);
  if (!top.length) return null;
  const arranged = [top[1], top[0], top[2]].filter(Boolean);
  return (
    <div className="leaderboard-podium" aria-label="Tiga peringkat teratas">
      {arranged.map(entry => (
        <article key={entry.rank} className={`leaderboard-podium-card place-${entry.rank}`}>
          <span className="leaderboard-place"><Icon name={entry.rank === 1 ? 'trophy' : 'star'} size={12}/> {entry.rank === 1 ? 'JUARA 1' : `JUARA ${entry.rank}`}</span>
          <img src={skinUrl(entry, true)} alt={`Skin ${entry.username}`} loading="lazy" decoding="async"/>
          <div>
            <strong>{entry.username}</strong>
            <small>{valueLabel(type, entry)}</small>
          </div>
        </article>
      ))}
    </div>
  );
}

function RankingBoard({ title, eyebrow, type, entries, emptyText }) {
  return (
    <section className="leaderboard-board" data-kind={type}>
      <header>
        <span className="leaderboard-board-icon"><Icon name={type === 'voter' ? 'star' : 'cart-shopping'} size={20}/></span>
        <div><small>{eyebrow}</small><h2>{title}</h2></div>
      </header>
      {entries.length ? (
        <>
          <Podium entries={entries} type={type}/>
          <div className="leaderboard-list">
            {entries.slice(3).map(entry => (
              <article key={`${type}-${entry.rank}`} className="leaderboard-list-row">
                <b>{entry.rank}</b>
                <PlayerAvatar uuid={entry.uuid} username={entry.username} size={38}/>
                <div><strong>{entry.username}</strong><small>{type === 'donor' ? `${entry.purchases || 0} transaksi sukses` : 'MinecraftMP voter'}</small></div>
                <span>{valueLabel(type, entry)}</span>
              </article>
            ))}
          </div>
        </>
      ) : (
        <div className="leaderboard-empty"><Icon name="trophy" size={28}/><strong>Belum ada peringkat</strong><p>{emptyText}</p></div>
      )}
    </section>
  );
}

export async function getServerSideProps() {
  try {
    const { SettingsAsync } = await import('../lib/redis.js');
    return { props: { settings: await SettingsAsync.get() } };
  } catch { return { props: { settings: {} } }; }
}

export default function LeaderboardPage({ settings = {} }) {
  const [player, setPlayer] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [data, setData] = useState({ voters: [], donors: [], voterConfigured: true, voterError: '', updatedAt: '' });
  const [loading, setLoading] = useState(true);
  const serverName = settings.server_name || 'Fancy Network';
  const voteUrl = safeUrl(settings.vote_url || process.env.NEXT_PUBLIC_VOTE_URL);
  const discordUrl = safeUrl(settings.discord_url || process.env.NEXT_PUBLIC_DISCORD_URL);
  const whatsappUrl = safeUrl(settings.whatsapp_url || process.env.NEXT_PUBLIC_WHATSAPP_URL);

  useEffect(() => {
    try { setPlayer(JSON.parse(localStorage.getItem('mc_player') || 'null')); } catch {}
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/leaderboard?limit=10', { headers: { Accept: 'application/json' } });
      const result = await response.json();
      if (result.success) setData(result);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  const updatedLabel = useMemo(() => data.updatedAt ? new Date(data.updatedAt).toLocaleString('id-ID', { dateStyle:'medium', timeStyle:'short' }) : '-', [data.updatedAt]);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method:'POST', credentials:'include' }).catch(() => {});
    localStorage.removeItem('mc_player'); localStorage.removeItem('mc_token'); setPlayer(null);
  }, []);

  return (
    <>
      <Head>
        <title>Leaderboard | {serverName}</title>
        <meta name="description" content={`Lihat Top Voter MinecraftMP dan Top Donatur ${serverName}.`}/>
        <meta property="og:title" content={`Leaderboard | ${serverName}`}/>
        <meta property="og:description" content="Peringkat voter MinecraftMP dan player dengan total pembelian tertinggi."/>
        <meta property="og:type" content="website"/>
        <meta property="og:url" content={`${process.env.NEXT_PUBLIC_BASE_URL || 'https://fancynet.my.id'}/leaderboard`}/>
        {settings.logo_url && <meta property="og:image" content={settings.logo_url}/>}
      </Head>
      <div className="public-shell fancy-public-theme leaderboard-page">
        <FancyNav player={player} onLoginClick={() => setShowLogin(true)} onLogout={logout} settings={settings}/>
        <main>
          <header className="leaderboard-hero">
            <div className="leaderboard-hero-grid" aria-hidden="true"/>
            <div className="leaderboard-hero-copy">
              <span className="public-eyebrow">COMMUNITY RANKING</span>
              <h1 className="font-space">Pemain terbaik,<br/><strong>dukungan nyata.</strong></h1>
              <p>Satu halaman untuk melihat voter MinecraftMP paling aktif dan player dengan total pembelian produk tertinggi.</p>
              <div className="leaderboard-actions">
                {voteUrl && <a href={voteUrl} target="_blank" rel="noopener noreferrer" className="leaderboard-primary-action"><Icon name="star" size={16}/> VOTE DI MINECRAFTMP</a>}
                <button type="button" onClick={load} disabled={loading}><Icon name="rotate" size={15} spin={loading}/> {loading ? 'MEMUAT' : 'PERBARUI'}</button>
              </div>
              <small className="leaderboard-updated">Pembaruan terakhir: {updatedLabel}</small>
            </div>
            <div className="leaderboard-hero-stat">
              <span><Icon name="trophy" size={22}/></span>
              <div><strong>2</strong><small>LEADERBOARD AKTIF</small></div>
            </div>
          </header>

          <div className="leaderboard-wrap">
            <div className="leaderboard-grid">
              <RankingBoard type="voter" eyebrow="MINECRAFTMP" title="Top Voter" entries={data.voters || []} emptyText={data.voterConfigured ? (data.voterError || 'Belum ada vote pada periode ini.') : 'Isi LEADERBOARD_ENDPOINT untuk menampilkan data voter.'}/>
              <RankingBoard type="donor" eyebrow="TRANSAKSI PRODUK" title="Top Donatur" entries={data.donors || []} emptyText="Belum ada transaksi produk yang berhasil."/>
            </div>

            <section className="leaderboard-contact">
              <div><span className="public-eyebrow">BUTUH BANTUAN?</span><h2>Hubungi tim lewat Discord atau WhatsApp.</h2><p>Ticket website sudah tidak digunakan agar semua bantuan terpusat dan lebih cepat ditangani.</p></div>
              <div>
                {discordUrl && <a href={discordUrl} target="_blank" rel="noopener noreferrer"><Icon name="discord" size={17}/> Discord</a>}
                {whatsappUrl && <a href={whatsappUrl} target="_blank" rel="noopener noreferrer"><Icon name="whatsapp" size={17}/> WhatsApp</a>}
              </div>
            </section>
          </div>
        </main>
        <FancyFooter serverName={serverName} settings={settings}/>
      </div>
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} onSuccess={next => { setPlayer(next); setShowLogin(false); }}/>}
    </>
  );
}
