import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import FancyNav, { PlayerAvatar } from '../components/FancyNav';
import FancyFooter from '../components/FancyFooter';
import Icon from '../components/Icon';

const LoginModal = dynamic(() => import('../components/LoginModal'), { ssr: false });

const UUID_RE = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
const STEVE_UUID = 'c06f89064c8a49119c29ea1dbd1aab82';
const PLACEHOLDER_NAME = String(process.env.NEXT_PUBLIC_LEADERBOARD_PLACEHOLDER_NAME || 'Steve').trim().slice(0, 24) || 'Steve';
const PLACEHOLDER_ENTRIES = Array.from({ length: 10 }, (_, index) => ({
  rank: index + 1,
  username: PLACEHOLDER_NAME,
  value: 0,
  purchases: 0,
  placeholder: true,
}));

function safeUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch { return ''; }
}

function playerUuid(entry) {
  const uuid = String(entry?.uuid || '').replace(/-/g, '');
  return UUID_RE.test(uuid) ? uuid : STEVE_UUID;
}

function bodyRenderUrl(uuid) {
  return `https://crafatar.com/renders/body/${uuid}?overlay&scale=8&default=MHF_Steve`;
}

function MinecraftBody({ entry }) {
  const preferredUuid = playerUuid(entry);
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [preferredUuid]);

  return (
    <img
      src={bodyRenderUrl(failed ? STEVE_UUID : preferredUuid)}
      alt={`Karakter Minecraft ${entry.username}`}
      loading={entry.rank === 1 ? 'eager' : 'lazy'}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => {
        if (preferredUuid !== STEVE_UUID) setFailed(true);
      }}
    />
  );
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
          <MinecraftBody entry={entry}/>
          <div>
            <strong>{entry.username}</strong>
            <small>{valueLabel(type, entry)}</small>
          </div>
        </article>
      ))}
    </div>
  );
}

function RankingBoard({ title, eyebrow, type, entries, emptyText, periodLabel, isPlaceholder, liveCount }) {
  return (
    <section className="leaderboard-board" data-kind={type}>
      <header>
        <span className="leaderboard-board-icon"><Icon name={type === 'voter' ? 'star' : 'cart-shopping'} size={20}/></span>
        <div className="leaderboard-board-title"><small>{eyebrow}</small><h2>{title}</h2></div>
        <span className="leaderboard-period"><Icon name="clock" size={14}/><span><small>PERIODE</small><strong>{periodLabel}</strong></span></span>
        <span className="leaderboard-board-summary"><strong>{liveCount}</strong><small>{isPlaceholder ? 'DATA AKTIF' : 'PERINGKAT'}</small></span>
      </header>
      {isPlaceholder && <div className="leaderboard-placeholder-note"><Icon name="circle-info" size={14}/><span><strong>Menunggu data leaderboard</strong><small>{emptyText} Posisi Steve akan otomatis diganti ketika data pertama tersedia.</small></span></div>}
      <Podium entries={entries} type={type}/>
      <div className="leaderboard-list">
        {entries.slice(3).map(entry => (
          <article key={`${type}-${entry.rank}`} className={`leaderboard-list-row${entry.placeholder ? ' is-placeholder' : ''}`}>
            <b>{entry.rank}</b>
            <PlayerAvatar
              uuid={playerUuid(entry)}
              username={playerUuid(entry) === STEVE_UUID ? 'Steve' : entry.username}
              size={38}
            />
            <div><strong>{entry.username}</strong><small>{entry.placeholder ? 'Menunggu data pemain' : type === 'donor' ? `${entry.purchases || 0} transaksi sukses` : 'MinecraftMP voter'}</small></div>
            <span>{valueLabel(type, entry)}</span>
          </article>
        ))}
      </div>
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
  const [activeBoard, setActiveBoard] = useState('voter');
  const [data, setData] = useState({ voters: [], donors: [], voterConfigured: true, voterError: '', updatedAt: '' });
  const [loading, setLoading] = useState(true);
  const serverName = settings.server_name || 'Fancy Network';
  const voteUrl = safeUrl(settings.vote_url || process.env.NEXT_PUBLIC_VOTE_URL);

  useEffect(() => {
    const controller = new AbortController();
    let token = '';
    try {
      setPlayer(JSON.parse(localStorage.getItem('mc_player') || 'null'));
      token = localStorage.getItem('mc_token') || '';
    } catch {}
    fetch('/api/auth/me', {
      credentials:'include',
      signal:controller.signal,
      headers:token ? { Authorization:`Bearer ${token}` } : undefined,
    })
      .then(response => response.ok ? response.json() : null)
      .then(result => {
        if (result?.success && result.player) {
          setPlayer(result.player);
          localStorage.setItem('mc_player', JSON.stringify(result.player));
        } else {
          setPlayer(null);
          localStorage.removeItem('mc_player');
          localStorage.removeItem('mc_token');
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const options = { headers: { Accept: 'application/json' } };
      const request = async scope => {
        const response = await fetch(`/api/leaderboard?scope=${scope}&limit=10`, options);
        return response.ok ? response.json() : {};
      };
      const [voterRequest, donorRequest] = await Promise.allSettled([
        request('voter'),
        request('donor'),
      ]);
      const voterResult = voterRequest.status === 'fulfilled' ? voterRequest.value : {};
      const donorResult = donorRequest.status === 'fulfilled' ? donorRequest.value : {};
      setData(previous => ({
        ...previous,
        ...(voterResult.success ? voterResult : {}),
        ...(donorResult.success ? donorResult : {}),
      }));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  const updatedLabel = useMemo(() => data.updatedAt ? new Date(data.updatedAt).toLocaleString('id-ID', { dateStyle:'medium', timeStyle:'short' }) : '-', [data.updatedAt]);
  const boards = useMemo(() => ({
    voter: {
      eyebrow: 'MINECRAFTMP',
      title: 'Top Voter',
      icon: 'star',
      description: 'Player dengan vote MinecraftMP terbanyak.',
      periodLabel: 'Bulan berjalan',
      liveCount: (data.voters || []).length,
      isPlaceholder: !(data.voters || []).length,
      entries: (data.voters || []).length ? data.voters : PLACEHOLDER_ENTRIES,
      emptyText: data.voterConfigured ? (data.voterError || 'Belum ada vote pada periode ini.') : 'Isi LEADERBOARD_ENDPOINT untuk menampilkan data voter.',
    },
    donor: {
      eyebrow: 'TRANSAKSI PRODUK',
      title: 'Top Donatur',
      icon: 'cart-shopping',
      description: 'Player dengan total pembelian produk tertinggi.',
      periodLabel: 'Sepanjang waktu',
      liveCount: (data.donors || []).length,
      isPlaceholder: !(data.donors || []).length,
      entries: (data.donors || []).length ? data.donors : PLACEHOLDER_ENTRIES,
      emptyText: 'Belum ada transaksi produk yang berhasil.',
    },
  }), [data]);
  const selectedBoard = boards[activeBoard];

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
              <p>Pilih kategori untuk melihat voter MinecraftMP paling aktif atau player dengan total pembelian produk tertinggi.</p>
              <div className="leaderboard-actions">
                {voteUrl && <a href={voteUrl} target="_blank" rel="noopener noreferrer" className="leaderboard-primary-action"><Icon name="star" size={16}/> VOTE DI MINECRAFTMP</a>}
                <button type="button" onClick={load} disabled={loading}><Icon name="rotate" size={15} spin={loading}/> {loading ? 'MEMUAT' : 'PERBARUI'}</button>
              </div>
              <small className="leaderboard-updated">Pembaruan Top Voter: {updatedLabel} · siklus 24 jam</small>
            </div>
            <div className="leaderboard-hero-stat">
              <span><Icon name="trophy" size={22}/></span>
              <div><strong>2</strong><small>LEADERBOARD AKTIF</small></div>
            </div>
          </header>

          <div className="leaderboard-wrap">
            <div className="leaderboard-category-tabs" role="tablist" aria-label="Kategori leaderboard">
              {Object.entries(boards).map(([key, board]) => {
                const active = activeBoard === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    aria-controls="leaderboard-selected-board"
                    className={active ? 'active' : ''}
                    onClick={() => setActiveBoard(key)}
                  >
                    <span><Icon name={board.icon} size={19}/></span>
                    <div><strong>{board.title}</strong><small>{board.description}</small></div>
                    <b>{board.liveCount}</b>
                  </button>
                );
              })}
            </div>

            <div className="leaderboard-grid">
              <div id="leaderboard-selected-board" role="tabpanel" aria-label={selectedBoard.title}>
                <RankingBoard
                  type={activeBoard}
                  eyebrow={selectedBoard.eyebrow}
                  title={selectedBoard.title}
                  entries={selectedBoard.entries}
                  emptyText={selectedBoard.emptyText}
                  periodLabel={selectedBoard.periodLabel}
                  isPlaceholder={selectedBoard.isPlaceholder}
                  liveCount={selectedBoard.liveCount}
                />
              </div>
            </div>
          </div>
        </main>
        <FancyFooter serverName={serverName} settings={settings}/>
      </div>
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} onSuccess={next => { setPlayer(next); setShowLogin(false); }}/>}
    </>
  );
}
