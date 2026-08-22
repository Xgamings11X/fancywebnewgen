import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import toast from 'react-hot-toast';
import FancyNav, { PlayerAvatar } from '../components/FancyNav';
import FancyFooter from '../components/FancyFooter';
import LogoImage, { useTransparentLogo } from '../components/LogoImage';
import Icon from '../components/Icon';

const LoginModal = dynamic(() => import('../components/LoginModal'), { ssr: false });

const FEATURES = [
  { id:'anticheat', icon:'shield-halved', tone:'green', title:'Proteksi Anti-Cheat', desc:'Proteksi berlapis dan moderasi aktif menjaga permainan tetap adil tanpa mengganggu pemain normal.' },
  { id:'community', icon:'users', tone:'blue', title:'Komunitas Aktif', desc:'Temukan teman baru, party, guild, dan bantuan cepat dari komunitas Indonesia yang ramah.' },
  { id:'latency', icon:'bolt', tone:'green', title:'Performa Stabil', desc:'Konfigurasi server dan jaringan dioptimalkan untuk TPS stabil serta latensi yang nyaman.' },
  { id:'reward', icon:'trophy', tone:'blue', title:'Event & Reward', desc:'Daily reward, event komunitas, dan hadiah rutin membuat progres bermain selalu terasa menarik.' },
];

const SOCIAL_CHANNELS = [
  { key:'vote', field:'vote_url', fallback:'https://minecraft-mp.com/', icon:'star', label:'Vote', cls:'is-vote' },
  { key:'discord', field:'discord_url', fallback:'https://discord.com/', icon:'discord', label:'Discord', cls:'is-discord' },
  { key:'whatsapp', field:'whatsapp_url', fallback:'https://www.whatsapp.com/', icon:'whatsapp', label:'WhatsApp', cls:'is-whatsapp' },
  { key:'tiktok', field:'tiktok_url', fallback:'https://www.tiktok.com/', icon:'tiktok', label:'TikTok', cls:'is-tiktok' },
  { key:'instagram', field:'instagram_url', fallback:'https://www.instagram.com/', icon:'instagram', label:'Instagram', cls:'is-instagram' },
  { key:'youtube', field:'youtube_url', fallback:'https://www.youtube.com/', icon:'youtube', label:'YouTube', cls:'is-youtube' },
];

const GAMEPLAY_TAGS = ['Skills', 'Landclaim', 'Quest', 'Crates', 'Levels', 'Reward', 'Clans'];
const FEEDBACK_OPTIONS = [
  { value:1, icon:'face-frown', label:'Sangat buruk' },
  { value:2, icon:'face-concerned', label:'Kurang baik' },
  { value:3, icon:'face-meh', label:'Cukup' },
  { value:4, icon:'face-smile', label:'Baik' },
  { value:5, icon:'face-grin', label:'Sangat baik' },
];
const FEEDBACK_PLACEHOLDERS = Array.from({ length:5 }, (_, index) => ({
  id:`feedback-placeholder-${index + 1}`,
  username:'Steve',
  avatarUsername:'Steve',
  uuid:'c06f89064c8a49119c29ea1dbd1aab82',
  rating:0,
  text:'Menunggu feedback',
  placeholder:true,
}));

const SAFE_PROTOCOLS = new Set(['http:', 'https:']);

function safeExternalUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return SAFE_PROTOCOLS.has(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

async function writeClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('Clipboard tidak tersedia');
}

export async function getServerSideProps() {
  try {
    const { SettingsAsync } = await import('../lib/redis.js');
    const storedSettings = await SettingsAsync.get();
    const runtimeSocials = {
      discord_url: process.env.NEXT_PUBLIC_DISCORD_URL || '',
      vote_url: process.env.NEXT_PUBLIC_VOTE_URL || '',
      whatsapp_url: process.env.NEXT_PUBLIC_WHATSAPP_URL || '',
      instagram_url: process.env.NEXT_PUBLIC_INSTAGRAM_URL || '',
      tiktok_url: process.env.NEXT_PUBLIC_TIKTOK_URL || '',
      youtube_url: process.env.NEXT_PUBLIC_YOUTUBE_URL || '',
    };

    for (const key of Object.keys(runtimeSocials)) {
      if (storedSettings?.[key]) runtimeSocials[key] = storedSettings[key];
    }

    return { props: { settings: { ...storedSettings, ...runtimeSocials } } };
  } catch {
    return {
      props: {
        settings: {
          discord_url: process.env.NEXT_PUBLIC_DISCORD_URL || '',
          vote_url: process.env.NEXT_PUBLIC_VOTE_URL || '',
          whatsapp_url: process.env.NEXT_PUBLIC_WHATSAPP_URL || '',
          instagram_url: process.env.NEXT_PUBLIC_INSTAGRAM_URL || '',
          tiktok_url: process.env.NEXT_PUBLIC_TIKTOK_URL || '',
          youtube_url: process.env.NEXT_PUBLIC_YOUTUBE_URL || '',
        },
      },
    };
  }
}

export default function HomePage({ settings }) {
  const s = useMemo(() => settings || {}, [settings]);
  const serverName = s.server_name || 'Fancy Network';
  const javaIp = s.server_ip || 'play.fancynet.my.id';
  const bedrockIp = s.bedrock_ip || javaIp;
  const bedrockPort = String(s.bedrock_port || '19026');
  const heroTitle = s.hero_title || `Mainkan petualangan terbaikmu di ${serverName}`;
  const heroSubtitle = s.hero_subtitle || s.server_description || 'Server Minecraft Indonesia dengan Economy, RPG, komunitas aktif, dan progres yang selalu menarik.';
  const { src: logoSrc } = useTransparentLogo();

  const [player, setPlayer] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [copied, setCopied] = useState('');
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackItems, setFeedbackItems] = useState([]);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [status, setStatus] = useState({ loading:true, online:false, players:0, maxPlayers:0, version:'' });
  const copiedTimerRef = useRef(null);
  const pendingFeedbackRef = useRef(0);

  const loadStatus = useCallback(async (signal) => {
    try {
      const response = await fetch('/api/server/status', {
        signal,
        credentials:'same-origin',
        headers:{ Accept:'application/json' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setStatus({
        loading:false,
        online:data.online === true,
        players:Number(data.players) || 0,
        maxPlayers:Number(data.maxPlayers) || 0,
        version:typeof data.version === 'string' ? data.version : '',
      });
    } catch (error) {
      if (error?.name === 'AbortError') return;
      setStatus(current => ({ ...current, loading:false, online:false }));
    }
  }, []);

  const loadFeedback = useCallback(async (signal) => {
    try {
      const response = await fetch('/api/feedback', {
        signal,
        credentials:'same-origin',
        headers:{ Accept:'application/json' },
      });
      if (!response.ok) return;
      const data = await response.json();
      if (data?.success && Array.isArray(data.feedback)) {
        setFeedbackItems(data.feedback);
      }
    } catch (error) {
      if (error?.name !== 'AbortError') console.error('Gagal memuat feedback:', error);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    try {
      const cached = localStorage.getItem('mc_player');
      if (cached) setPlayer(JSON.parse(cached));
      localStorage.removeItem('fancy_feedback_rating');
    } catch {
      localStorage.removeItem('mc_player');
    }

    let token = '';
    try { token = localStorage.getItem('mc_token') || ''; } catch {}
    fetch('/api/auth/me', {
      credentials:'include',
      signal:controller.signal,
      headers:token ? { Authorization:`Bearer ${token}` } : undefined,
    })
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (!active) return;
        if (data?.success && data.player) {
          setPlayer(data.player);
          localStorage.setItem('mc_player', JSON.stringify(data.player));
        } else {
          setPlayer(null);
          localStorage.removeItem('mc_player');
          localStorage.removeItem('mc_token');
        }
      })
      .catch(() => {});

    loadStatus(controller.signal);
    loadFeedback(controller.signal);
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') loadStatus();
    }, 45_000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') loadStatus();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      active = false;
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (copiedTimerRef.current) window.clearTimeout(copiedTimerRef.current);
    };
  }, [loadFeedback, loadStatus]);

  useEffect(() => {
    if (!player) {
      setFeedbackRating(0);
      return;
    }
    const playerName = String(player.displayName || player.username || '').replace(/^\./, '').toLowerCase();
    const ownFeedback = feedbackItems.find(item => String(item.username || '').toLowerCase() === playerName);
    setFeedbackRating(ownFeedback?.rating || 0);
  }, [feedbackItems, player]);

  const copyAddress = useCallback(async (text, label) => {
    try {
      await writeClipboard(text);
      setCopied(label);
      toast.success(`${label} berhasil disalin`);
      if (copiedTimerRef.current) window.clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = window.setTimeout(() => setCopied(''), 2200);
    } catch {
      toast.error(`Gagal menyalin ${label}. Salin secara manual: ${text}`);
    }
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/logout', { method:'POST', credentials:'include' });
      if (!response.ok) throw new Error('Logout gagal');
      toast.success('Berhasil keluar');
    } catch {
      toast.error('Sesi lokal dibersihkan, tetapi server tidak dapat dihubungi');
    } finally {
      setPlayer(null);
      setFeedbackRating(0);
      localStorage.removeItem('mc_player');
      localStorage.removeItem('mc_token');
    }
  }, []);

  const submitFeedbackRating = useCallback(async (value, nextPlayer) => {
    if (!nextPlayer || feedbackSubmitting) return;
    setFeedbackSubmitting(true);
    setFeedbackRating(value);
    try {
      let token = '';
      try { token = localStorage.getItem('mc_token') || ''; } catch {}
      const response = await fetch('/api/feedback', {
        method:'POST',
        credentials:'include',
        headers:{
          'Content-Type':'application/json',
          Accept:'application/json',
          ...(token ? { Authorization:`Bearer ${token}` } : {}),
        },
        body:JSON.stringify({ rating:value }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        setPlayer(null);
        setShowLogin(true);
        throw new Error('Sesi berakhir. Silakan login kembali.');
      }
      if (!response.ok || !data?.feedback) throw new Error(data?.message || 'Feedback gagal dikirim');

      setFeedbackItems(current => [
        data.feedback,
        ...current.filter(item => String(item.username).toLowerCase() !== String(data.feedback.username).toLowerCase()),
      ].slice(0, 10));
      toast.success('Terima kasih atas penilaianmu');
    } catch (error) {
      toast.error(error?.message || 'Feedback gagal dikirim');
    } finally {
      setFeedbackSubmitting(false);
    }
  }, [feedbackSubmitting]);

  const handleLoginSuccess = useCallback((nextPlayer) => {
    setPlayer(nextPlayer);
    try { localStorage.setItem('mc_player', JSON.stringify(nextPlayer)); } catch {}
    setShowLogin(false);
    const pendingRating = pendingFeedbackRef.current;
    pendingFeedbackRef.current = 0;
    if (pendingRating) submitFeedbackRating(pendingRating, nextPlayer);
  }, [submitFeedbackRating]);

  const handleFeedbackRating = useCallback((value) => {
    if (!player) {
      pendingFeedbackRef.current = value;
      toast('Login Minecraft dulu untuk memberi feedback');
      setShowLogin(true);
      return;
    }
    submitFeedbackRating(value, player);
  }, [player, submitFeedbackRating]);

  const socialChannels = useMemo(() => SOCIAL_CHANNELS.map(item => ({
    ...item,
    href:safeExternalUrl(s[item.field] || item.fallback),
  })), [s]);
  const discordSocial = socialChannels.find(item => item.key === 'discord');

  const famousApplyUrl = safeExternalUrl(
    process.env.NEXT_PUBLIC_FAMOUS_APPLY_URL || s.famous_apply_url || s.discord_url || process.env.NEXT_PUBLIC_DISCORD_URL
  );

  const playerCount = status.online ? status.players : Number(s.players_online) || 0;
  const maxPlayers = status.maxPlayers || 0;
  const population = maxPlayers > 0 ? Math.min(100, Math.round((playerCount / maxPlayers) * 100)) : 0;
  const statusText = status.loading ? 'Memeriksa server' : status.online ? 'Server online' : 'Server offline';
  const heroTitleParts = heroTitle.includes(serverName) ? heroTitle.split(serverName) : null;
  const tickerFeedbackItems = useMemo(() => {
    const source = feedbackItems.length >= FEEDBACK_PLACEHOLDERS.length
      ? feedbackItems
      : [...feedbackItems, ...FEEDBACK_PLACEHOLDERS.slice(0, FEEDBACK_PLACEHOLDERS.length - feedbackItems.length)];
    return source.slice(0, 10);
  }, [feedbackItems]);

  const endpointCards = [
    { key:'java', label:'Java Edition IP', value:javaIp, icon:'computer', copy:javaIp },
    { key:'bedrock-ip', label:'Bedrock Edition IP', value:bedrockIp, icon:'mobile', copy:bedrockIp },
    { key:'bedrock-port', label:'Bedrock Port', value:bedrockPort, icon:'network-wired', copy:bedrockPort },
  ];

  return (
    <>
      <Head>
        <title>{`${serverName} | Minecraft Server Indonesia`}</title>
        <meta name="description" content={s.server_description || `${serverName} — Minecraft Server Indonesia Java & Bedrock. Bergabung di ${javaIp}.`}/>
        <meta property="og:type" content="website"/>
        <meta property="og:site_name" content={serverName}/>
        <meta property="og:title" content={`${serverName} | Minecraft Server Indonesia`}/>
        <meta property="og:description" content={s.server_description || `Main bersama komunitas ${serverName}. Java & Bedrock tersedia.`}/>
        <meta property="og:url" content={process.env.NEXT_PUBLIC_BASE_URL || 'https://fancynet.my.id'}/>
        {s.logo_url && <meta property="og:image" content={s.logo_url}/>} 
        <meta name="twitter:card" content={s.logo_url ? 'summary_large_image' : 'summary'}/>
        <meta name="twitter:title" content={`${serverName} | Minecraft Server Indonesia`}/>
        <meta name="twitter:description" content={s.server_description || `Main bersama komunitas ${serverName}.`}/>
        {s.logo_url && <meta name="twitter:image" content={s.logo_url}/>} 
        <link rel="icon" type="image/png" href={s.logo_url || logoSrc || '/favicon.png'}/>
      </Head>

      <div className="public-shell fancy-public-theme home-page">
        <FancyNav player={player} onLoginClick={() => setShowLogin(true)} onLogout={handleLogout} settings={s}/>

        <main className="landing-page landing-fancy-page">
        <header className="fn-home-hero fn-home-hero-v9">
          <div className="fn-home-ambient" aria-hidden="true"/>
          <div className="fn-fancy-backdrop" aria-hidden="true">
            <div className="fn-fancy-backdrop-logo" style={{ position:'absolute', contain:'layout paint' }}>
              {s.logo_url ? <img src={s.logo_url} alt="" width={64} height={64} loading="lazy" decoding="async" fetchPriority="low"/> : <LogoImage alt="" loading="lazy" fetchPriority="low"/>}
            </div>
            <span className="fn-pixel fn-pixel-a"/><span className="fn-pixel fn-pixel-b"/>
            <span className="fn-pixel fn-pixel-c"/><span className="fn-pixel fn-pixel-d"/>
            <span className="fn-pixel fn-pixel-e"/><span className="fn-pixel fn-pixel-f"/>
          </div>

          <div className="fn-status-rail anim-hero-up anim-d1">
            <div className="fn-status-primary">
              <span className={`fn-live-dot ${status.loading ? 'is-checking' : status.online ? 'is-online' : 'is-offline'}`}/>
              <strong>{statusText}</strong>
              {status.version && <span>{status.version}</span>}
            </div>
            <div className="fn-status-meta">
              <span><Icon name="users" size={14}/><b>{playerCount}</b> online</span>
              <span><Icon name="computer" size={14}/> Java</span>
              <span><Icon name="mobile" size={14}/> Bedrock</span>
              <span><Icon name="bolt" size={14}/> 24/7</span>
            </div>
          </div>

          <div className="fn-hero-stage">
            <section className="fn-hero-story anim-hero anim-d2">
              <div className="fn-hero-kicker"><span>FANCY NETWORK</span><i/> ECONOMY • SEMI RPG</div>
              <h1 className="font-space fn-hero-title">
                {heroTitleParts ? <>{heroTitleParts[0]}<span className="fn-title-brand">{serverName}</span>{heroTitleParts.slice(1).join(serverName)}</> : heroTitle}
              </h1>
              <p className="fn-hero-subtitle">{heroSubtitle}</p>

              <div className="fn-mode-chips" aria-label="Mode unggulan">
                <span><Icon name="trophy" size={14}/> Rank</span>
                <span><Icon name="gavel" size={14}/> Weapon</span>
                <span><Icon name="arrow-trend-up" size={14}/> SellWand</span>
                <span><Icon name="star" size={14}/> Custom Enchant</span>
              </div>

              <div className="fn-hero-actions">
                <button type="button" className="fn-cta-primary" onClick={() => copyAddress(javaIp, 'IP Java')}>
                  <Icon name={copied === 'IP Java' ? 'circle-check' : 'copy'} size={17}/>
                  <span>{copied === 'IP Java' ? 'IP tersalin' : 'Salin IP Server'}</span>
                </button>
                <Link href="/store" className="fn-cta-secondary">
                  Jelajahi Store <Icon name="arrow-right" size={16}/>
                </Link>
              </div>
            </section>

            <aside className="fn-connect-panel anim-hero anim-d3" aria-label="Panel koneksi Fancy Network">
              <div className="fn-connect-topbar">
                <div className="fn-connect-brand">
                  <div className="fn-connect-logo">
                    {s.logo_url ? <img src={s.logo_url} alt="" width={64} height={64} decoding="async" fetchPriority="high"/> : <LogoImage alt="" fetchPriority="high"/>}
                  </div>
                  <div><small>CONNECT TO</small><strong>{serverName}</strong></div>
                </div>
                <span className={`fn-server-state ${status.loading ? 'is-checking' : status.online ? 'is-online' : 'is-offline'}`}>
                  {status.loading ? 'CHECKING' : status.online ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>

              <div className="fn-population-card">
                <div><small>LIVE POPULATION</small><strong>{playerCount}{maxPlayers ? ` / ${maxPlayers}` : ''}</strong></div>
                <div className="fn-population-gauge"><span style={{ width:`${population}%` }}/></div>
              </div>

              <div className="fn-connect-list">
                {endpointCards.map(item => (
                  <button key={item.key} type="button" className="fn-connect-row" onClick={() => copyAddress(item.copy, item.label)}>
                    <span className="fn-connect-row-icon"><Icon name={item.icon} size={17}/></span>
                    <span><small>{item.label}</small><strong>{item.value}</strong></span>
                    <Icon name={copied === item.label ? 'circle-check' : 'copy'} size={16}/>
                  </button>
                ))}
              </div>
              <p className="fn-connect-note"><Icon name="circle-info" size={13}/> Klik alamat untuk menyalin otomatis</p>
            </aside>
          </div>

          <div className="fn-hero-dock anim-hero-up anim-d4">
            <button type="button" className="fn-dock-item is-primary" onClick={() => copyAddress(javaIp, 'IP Java')}>
              <span className="fn-dock-icon"><Icon name="gamepad" size={18}/></span>
              <span><small>MULAI BERMAIN</small><strong>Copy IP & masuk server</strong></span>
              <Icon name="arrow-right" size={15}/>
            </button>
            <Link href="/store" className="fn-dock-item">
              <span className="fn-dock-icon"><Icon name="cart-shopping" size={18}/></span>
              <span><small>MARKETPLACE</small><strong>Rank, kit & utility</strong></span>
              <Icon name="arrow-right" size={15}/>
            </Link>
            <Link href="/leaderboard" className="fn-dock-item">
              <span className="fn-dock-icon"><Icon name="trophy" size={18}/></span>
              <span><small>COMMUNITY RANKING</small><strong>Top voter & donatur</strong></span>
              <Icon name="arrow-right" size={15}/>
            </Link>
            {discordSocial ? (
              <a href={discordSocial.href} target="_blank" rel="noopener noreferrer" className="fn-dock-item">
                <span className="fn-dock-icon"><Icon name="discord" size={18}/></span>
                <span><small>COMMUNITY</small><strong>Gabung Discord</strong></span>
                <Icon name="arrow-up-right-from-square" size={14}/>
              </a>
            ) : (
              <div className="fn-dock-item is-static">
                <span className="fn-dock-icon"><Icon name="users" size={18}/></span>
                <span><small>COMMUNITY</small><strong>Komunitas Indonesia</strong></span>
              </div>
            )}
          </div>

        </header>

        <section id="community-links" className="landing-section landing-social-hub" aria-label="Media sosial Fancy Network">
          <div className="landing-social-hub-grid">
            {socialChannels.map(item => (
              <a key={item.key} href={item.href} target="_blank" rel="noopener noreferrer" className={`landing-social-hub-card ${item.cls}`}>
                <Icon name={item.icon} size={19}/>
                <strong>{item.label}</strong>
              </a>
            ))}
          </div>
        </section>

        <section className="landing-section landing-world-story" aria-label="Tentang gameplay Fancy Network">
          <article className="landing-world-story-primary">
            <span className="landing-section-label">PENGALAMAN BERMAIN</span>
            <h2 className="font-space">Survival Economy<br/><strong>Semi RPG.</strong></h2>
            <p>Server ini dilengkapi berbagai sistem yang membuat progres bermain terasa lebih hidup dan terarah. Mulai dari skills, leveling, quest, dan crate, semuanya dirancang untuk menghadirkan perjalanan panjang yang tidak monoton—baik untuk pemain santai maupun pemain yang menyukai progres dan persaingan kompetitif.</p>
            <div className="landing-gameplay-tags" aria-label="Fitur gameplay">
              {GAMEPLAY_TAGS.map((tag, index) => <span key={tag} className={index % 2 ? 'tone-lime' : 'tone-green'}>{tag}</span>)}
            </div>
          </article>

          <article className="landing-world-story-about">
            <span className="landing-section-label">TENTANG SERVER</span>
            <h2 className="font-space">Tentang<br/><strong>{serverName}.</strong></h2>
            <p>{serverName} dibangun untuk menghadirkan pengalaman bermain yang nyaman dan berkualitas—tempat bagi pemain yang ingin menikmati Minecraft dengan progres seru, ekonomi aktif, dan suasana komunitas yang lebih hidup.</p>
            <p>Server terus dikembangkan dengan fitur menarik, sistem stabil, serta pembaruan berkala. Mulai dari membangun base, menjelajahi dunia, bermain bersama teman, hingga mengejar item langka, setiap pemain memiliki perjalanan yang berkesan.</p>
          </article>
        </section>

        <section className="landing-section landing-features">
          <div className="landing-section-heading" data-anim="fade-up">
            <span>ALASAN UNTUK BERGABUNG</span>
            <h2 className="font-space">Dibangun untuk pengalaman bermain yang lebih serius</h2>
            <p>Bukan sekadar tempat bermain. Setiap sistem dirancang agar progres, komunitas, dan kompetisi tetap seimbang.</p>
          </div>

          <div className="landing-feature-grid">
            {FEATURES.map((feature, index) => (
              <article key={feature.id} className={`landing-feature-card tone-${feature.tone}`} data-anim="fade-up" data-delay={String(index + 1)}>
                <div className="landing-feature-number">0{index + 1}</div>
                <div className="landing-feature-icon"><Icon name={feature.icon} size={22}/></div>
                <h3 className="font-space">{feature.title}</h3>
                <p>{feature.desc}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section landing-famous-program" data-anim="fade-up">
          <div className="landing-famous-copy">
            <span className="landing-section-label">CREATOR PROGRAM</span>
            <h2 className="font-space">Rank Famous untuk kreator yang ikut membesarkan komunitas.</h2>
            <p>Program ini ditujukan untuk kreator YouTube dan TikTok yang konsisten membuat konten positif. Benefitnya bukan sekadar badge, tetapi identitas khusus, exposure, serta kesempatan kolaborasi bersama server.</p>
            <div className="landing-famous-benefits">
              <span><Icon name="star" size={15}/> Tag dan role kreator</span>
              <span><Icon name="users" size={15}/> Exposure komunitas</span>
              <span><Icon name="trophy" size={15}/> Kolaborasi event</span>
            </div>
            <div className="landing-creator-actions">
              {famousApplyUrl ? (
                <a href={famousApplyUrl} target="_blank" rel="noopener noreferrer" className="landing-primary-action">
                  Daftar Rank Famous <Icon name="arrow-right" size={16}/>
                </a>
              ) : null}
              {famousApplyUrl && <a href={famousApplyUrl} target="_blank" rel="noopener noreferrer" className="landing-text-link">Lihat persyaratan</a>}
            </div>
          </div>

          <aside className="landing-famous-card" aria-label="Persyaratan Rank Famous">
            <div className="landing-famous-rank-head">
              <span><Icon name="star" size={22}/></span>
              <div><small>EXCLUSIVE CREATOR RANK</small><strong>FAMOUS</strong></div>
            </div>
            <ul>
              {[
                `Membuat konten ${serverName} secara rutin`,
                'Audiens aktif dan organik',
                'Konten positif serta mematuhi peraturan',
                'Tidak memiliki masalah aktif dengan komunitas lain',
              ].map(item => (
                <li key={item}><Icon name="circle-check" size={16}/><span>{item}</span></li>
              ))}
            </ul>
          </aside>
        </section>

        <section className="landing-section landing-feedback" aria-labelledby="feedback-title">
          <div className="landing-feedback-ticker" aria-label="Feedback pemain terbaru" aria-live="polite">
            <div
              className="landing-feedback-ticker-track"
              style={{ '--feedback-ticker-duration':`${Math.max(20, tickerFeedbackItems.length * 3.2)}s` }}
            >
              {[...tickerFeedbackItems, ...tickerFeedbackItems].map((item, index) => (
                <article
                  key={`${item.id}-${index}`}
                  className={`landing-feedback-ticker-item${item.placeholder ? ' is-placeholder' : ''}`}
                  aria-hidden={index >= tickerFeedbackItems.length ? 'true' : undefined}
                >
                  <PlayerAvatar uuid={item.uuid} username={item.avatarUsername} size={34}/>
                  <strong>{item.username}</strong>
                  <span>{item.text || `${item.rating}/5`}</span>
                  <i aria-hidden="true"/>
                </article>
              ))}
            </div>
          </div>

          <div className="landing-feedback-heading">
            <span className="landing-section-label">FEEDBACK</span>
            <h2 id="feedback-title" className="font-space">Bagaimana pengalamanmu?</h2>
            <p>Pilih ekspresi yang paling sesuai. Nama dan skin Minecraft akan digunakan setelah login.</p>
            <div className="landing-feedback-options" role="group" aria-label="Pilih penilaian pengalaman">
              {FEEDBACK_OPTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  className={feedbackRating === option.value ? 'is-active' : ''}
                  aria-label={option.label}
                  aria-pressed={feedbackRating === option.value}
                  title={option.label}
                  disabled={feedbackSubmitting}
                  onClick={() => handleFeedbackRating(option.value)}
                >
                  <Icon name={feedbackSubmitting && feedbackRating === option.value ? 'spinner' : option.icon} size={29} spin={feedbackSubmitting && feedbackRating === option.value}/>
                </button>
              ))}
            </div>
            <strong className="landing-feedback-caption">
              {feedbackSubmitting ? 'Mengirim penilaian...' : feedbackRating ? FEEDBACK_OPTIONS[feedbackRating - 1].label : 'Beri penilaian'}
            </strong>
          </div>
        </section>
        </main>

        <FancyFooter serverName={serverName} discordUrl={safeExternalUrl(s.discord_url)} settings={s} />
      </div>
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} onSuccess={handleLoginSuccess}/>} 
    </>
  );
}
