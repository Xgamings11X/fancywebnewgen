import { useCallback, useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import FancyNav from '../../components/FancyNav';
import FancyFooter from '../../components/FancyFooter';
import { useTransparentLogo, updateFavicon } from '../../components/LogoImage';
import toast from 'react-hot-toast';
import Icon from '../../components/Icon';

const LoginModal = dynamic(() => import('../../components/LoginModal'), { ssr: false });

export async function getServerSideProps() {
  try {
    const { SettingsAsync } = await import('../../lib/redis.js');
    return { props: { settings: await SettingsAsync.get() } };
  } catch {
    return { props: { settings: {} } };
  }
}

const TYPES = [
  { id: 'banding', icon: 'gavel', label: 'Aju Banding', desc: 'Ajukan peninjauan ulang hukuman atau keputusan staf.', accent: '#9ff7b5' },
  { id: 'bug', icon: 'bug', label: 'Report Bug', desc: 'Laporkan masalah teknis, error, duplikasi, atau exploit.', accent: '#64d8ff' },
  { id: 'report_player', icon: 'user-xmark', label: 'Report Pemain', desc: 'Laporkan pemain yang melanggar aturan server.', accent: '#d9ff71' },
  { id: 'lainnya', icon: 'comment-dots', label: 'Pertanyaan Lain', desc: 'Bantuan transaksi, akun, saran, atau pertanyaan umum.', accent: '#7ee7c2' },
];

const STATUS = {
  open: { label: 'Menunggu', className: 'waiting' },
  in_review: { label: 'Direview', className: 'review' },
  resolved: { label: 'Selesai', className: 'resolved' },
  rejected: { label: 'Ditolak', className: 'rejected' },
  expired: { label: 'Kedaluwarsa', className: 'expired' },
};

const DISCORD_ID_RE = /^\d{17,20}$/;
const fmt = value => value ? new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-';

export default function SupportPage({ settings }) {
  const router = useRouter();
  const s = settings || {};
  const serverName = s.server_name || 'Fancy Network';
  const { src: logoSrc } = useTransparentLogo();

  const [player, setPlayer] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [pendingType, setPendingType] = useState(null);
  const [view, setView] = useState('home');
  const [selType, setSelType] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ subject: '', description: '', target_player: '', evidence_url: '', discord_user_id: '' });
  const [activeTicket, setActiveTicket] = useState(null);
  const [newMsg, setNewMsg] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const [sseStatus, setSseStatus] = useState('connecting');
  const chatEndRef = useRef(null);
  const pollingRef = useRef(null);
  const activeTicketRef = useRef(null);

  const authHeaders = useCallback(() => {
    const headers = { 'Content-Type': 'application/json' };
    try {
      const token = localStorage.getItem('mc_token');
      if (token) headers.Authorization = `Bearer ${token}`;
    } catch {}
    return headers;
  }, []);

  const loadTickets = useCallback(async () => {
    setTicketsLoading(true);
    try {
      const response = await fetch('/api/support', { credentials: 'include', headers: authHeaders() });
      const data = await response.json();
      if (response.ok && data.success) setTickets(data.tickets || []);
      else if (response.status === 401) setPlayer(null);
    } catch {}
    setTicketsLoading(false);
  }, [authHeaders]);

  const loadTicketDetail = useCallback(async ticketId => {
    setLoadingChat(true);
    try {
      const response = await fetch(`/api/support?id=${encodeURIComponent(ticketId)}`, { credentials: 'include', headers: authHeaders() });
      const data = await response.json();
      if (response.ok && data.success) setActiveTicket(data.ticket);
      else toast.error(data.message || 'Gagal membuka ticket');
    } catch {
      toast.error('Tidak dapat memuat percakapan');
    }
    setLoadingChat(false);
  }, [authHeaders]);

  useEffect(() => {
    if (logoSrc) updateFavicon(logoSrc);
  }, [logoSrc]);

  useEffect(() => {
    const controller = new AbortController();
    try {
      const cached = localStorage.getItem('mc_player');
      if (cached) setPlayer(JSON.parse(cached));
    } catch {
      localStorage.removeItem('mc_player');
    }

    let token = '';
    try { token = localStorage.getItem('mc_token') || ''; } catch {}
    if (token) {
      fetch('/api/auth/me', { credentials: 'include', headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
        .then(response => response.ok ? response.json() : null)
        .then(async data => {
          if (data?.success && data.player) {
            setPlayer(data.player);
            localStorage.setItem('mc_player', JSON.stringify(data.player));
            await loadTickets();
            if (router.query.ticket) {
              setView('chat');
              await loadTicketDetail(String(router.query.ticket));
            } else if (router.query.view === 'tickets') {
              setView('tickets');
            }
          } else {
            setPlayer(null);
            localStorage.removeItem('mc_player');
            localStorage.removeItem('mc_token');
            if (router.query.view === 'tickets' || router.query.ticket) setView('tickets');
          }
        })
        .catch(() => {});
    } else if (router.query.view === 'tickets' || router.query.ticket) {
      setView('tickets');
    }
    return () => controller.abort();
  }, [loadTicketDetail, loadTickets, router.query.ticket, router.query.view]);

  useEffect(() => {
    activeTicketRef.current = activeTicket;
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [activeTicket]);

  useEffect(() => {
    if (view !== 'chat' || !activeTicket?.ticket_id) return undefined;
    let eventSource = null;
    let reconnectTimer = null;

    const connect = () => {
      const ticket = activeTicketRef.current;
      if (!ticket) return;
      // EventSource same-origin otomatis mengirim cookie sesi. Token tidak
      // diletakkan di query string agar tidak bocor ke log/CDN/referrer.
      const url = `/api/support/events?ticket_id=${encodeURIComponent(ticket.ticket_id)}`;
      eventSource = new EventSource(url, { withCredentials: true });
      setSseStatus('connecting');
      eventSource.onopen = () => setSseStatus('live');
      eventSource.onmessage = event => {
        try {
          const data = JSON.parse(event.data);
          if (data.ticket) setActiveTicket(data.ticket);
        } catch {}
      };
      eventSource.addEventListener('reconnect', () => {
        eventSource.close();
        reconnectTimer = window.setTimeout(connect, 700);
      });
      eventSource.onerror = () => {
        setSseStatus('polling');
        eventSource.close();
        if (pollingRef.current) window.clearInterval(pollingRef.current);
        pollingRef.current = window.setInterval(async () => {
          const current = activeTicketRef.current;
          if (!current) return;
          try {
            const response = await fetch(`/api/support?id=${encodeURIComponent(current.ticket_id)}`, { credentials: 'include', headers: authHeaders() });
            const data = await response.json();
            if (data.success && data.ticket) setActiveTicket(data.ticket);
          } catch {}
        }, 5000);
      };
    };

    connect();
    return () => {
      eventSource?.close();
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (pollingRef.current) window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    };
  }, [activeTicket?.ticket_id, authHeaders, view]);

  const handleLogout = async () => {
    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); } catch {}
    setPlayer(null);
    setTickets([]);
    setView('home');
    localStorage.removeItem('mc_player');
    localStorage.removeItem('mc_token');
    toast.success('Berhasil keluar');
  };

  const openTypeForm = id => {
    setSelType(id);
    setView('form');
    setForm({ subject: '', description: '', target_player: '', evidence_url: '', discord_user_id: '' });
  };

  const selectType = id => {
    if (!player) {
      setPendingType(id);
      setShowLogin(true);
      return;
    }
    openTypeForm(id);
  };

  const submitTicket = async event => {
    event.preventDefault();
    if (!player) return setShowLogin(true);
    if (form.discord_user_id && !DISCORD_ID_RE.test(form.discord_user_id.trim())) {
      return toast.error('Discord User ID harus berupa 17–20 digit angka');
    }

    setSending(true);
    try {
      const response = await fetch('/api/support', {
        method: 'POST', credentials: 'include', headers: authHeaders(),
        body: JSON.stringify({ type: selType, ...form }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Gagal membuat ticket');

      toast.success(data.discordLinked ? `Ticket ${data.ticketId} dibuat dan terhubung ke Discord` : `Ticket ${data.ticketId} berhasil dibuat`);
      setView('chat');
      await loadTicketDetail(data.ticketId);
      await loadTickets();
    } catch (error) {
      toast.error(error.message || 'Server error');
    }
    setSending(false);
  };

  const openChat = async ticket => {
    setActiveTicket(null);
    setView('chat');
    await loadTicketDetail(ticket.ticket_id);
  };

  const sendMessage = async () => {
    if (!newMsg.trim() || sendingMsg || !activeTicket) return;
    const text = newMsg.trim();
    const tempId = `temp-${Date.now()}`;
    setActiveTicket(current => current ? {
      ...current,
      messages: [...(current.messages || []), {
        id: tempId, sender: player.username, sender_type: 'player', text, source: 'web', created_at: new Date().toISOString(), _pending: true,
      }],
    } : current);
    setNewMsg('');
    setSendingMsg(true);

    try {
      const response = await fetch('/api/support', {
        method: 'PATCH', credentials: 'include', headers: authHeaders(),
        body: JSON.stringify({ ticket_id: activeTicket.ticket_id, text }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Gagal mengirim pesan');
      await loadTicketDetail(activeTicket.ticket_id);
      loadTickets();
    } catch (error) {
      setActiveTicket(current => current ? { ...current, messages: (current.messages || []).filter(message => message.id !== tempId) } : current);
      setNewMsg(text);
      toast.error(error.message || 'Gagal mengirim pesan');
    }
    setSendingMsg(false);
  };

  const typeInfo = TYPES.find(type => type.id === selType);
  const chatType = TYPES.find(type => type.id === activeTicket?.type) || TYPES[3];
  const chatStatus = STATUS[activeTicket?.status] || STATUS.open;
  const isClosed = ['resolved', 'rejected', 'expired'].includes(activeTicket?.status);

  return (
    <>
      <Head>
        <title>{`Support — ${serverName}`}</title>
        <meta name="description" content={`Support Center ${serverName}`} />
        <link rel="icon" type="image/png" href={s.logo_url || logoSrc || '/favicon.png'} />
      </Head>

      <div className="public-shell fancy-public-theme">
        <FancyNav player={player} onLoginClick={() => setShowLogin(true)} onLogout={handleLogout} settings={s} />

        <main className="support-redesign">
          <section className="support-page-hero">
            <div>
              <span className="support-page-kicker">SUPPORT CENTER</span>
              <h1>Support yang jelas,<br /><strong>tanpa kehilangan percakapan.</strong></h1>
              <p>Buat ticket dari website. Tim dapat menjawab melalui panel web atau channel Discord yang terbuka otomatis.</p>
            </div>
            <div className="support-flow-card">
              <div><span>1</span><p><strong>Buat ticket</strong><small>Pilih kategori dan jelaskan masalah.</small></p></div>
              <div><span>2</span><p><strong>Discord tersambung</strong><small>Channel support dibuat otomatis.</small></p></div>
              <div><span>3</span><p><strong>Balas dari mana saja</strong><small>Web dan Discord tersinkron.</small></p></div>
            </div>
          </section>

          <section className="support-workspace">
            <div className="support-main-tabs" role="tablist" aria-label="Menu support">
              <button type="button" role="tab" aria-selected={view === 'home' || view === 'form'} className={view === 'home' || view === 'form' ? 'active' : ''} onClick={() => setView('home')}>
                <span><Icon name="plus-circle" size={20} /></span><div><strong>Buat Ticket</strong><small>Kirim laporan atau pertanyaan baru</small></div>
              </button>
              <button type="button" role="tab" aria-selected={view === 'tickets' || view === 'chat'} className={view === 'tickets' || view === 'chat' ? 'active' : ''} onClick={() => { setView('tickets'); if (player) loadTickets(); }}>
                <span><Icon name="list-check" size={20} /></span><div><strong>Ticket Saya</strong><small>Lihat status dan percakapan</small></div>
                {tickets.length > 0 && <b>{tickets.length}</b>}
              </button>
            </div>

            {view === 'home' && (
              <div className="support-create-view">
                <div className="public-section-heading support-section-heading">
                  <span className="public-eyebrow">PILIH JENIS BANTUAN</span>
                  <h2>Apa yang bisa kami bantu?</h2>
                  <p>Pilih kategori paling sesuai agar ticket langsung diteruskan ke tim yang tepat.</p>
                </div>

                {!player && (
                  <button type="button" className="support-login-notice" onClick={() => setShowLogin(true)}>
                    <span><Icon name="lock" size={18} /></span>
                    <div><strong>Login diperlukan</strong><small>Masuk memakai username Minecraft sebelum membuat ticket.</small></div>
                    <Icon name="arrow-right" size={15} />
                  </button>
                )}

                <div className="support-type-grid-redesign">
                  {TYPES.map((type, index) => (
                    <button type="button" key={type.id} onClick={() => selectType(type.id)} style={{ '--ticket-accent': type.accent }} data-anim="fade-up" data-delay={String(index + 1)}>
                      <span className="support-type-icon"><Icon name={type.icon} size={21} /></span>
                      <div><strong>{type.label}</strong><p>{type.desc}</p></div>
                      <Icon name="arrow-right" size={16} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {view === 'form' && typeInfo && (
              <div className="support-form-layout">
                <form onSubmit={submitTicket} className="support-form-redesign">
                  <div className="support-form-head">
                    <button type="button" onClick={() => setView('home')}><Icon name="arrow-left" size={15} /> Kembali</button>
                    <span className="support-form-type" style={{ '--ticket-accent': typeInfo.accent }}><Icon name={typeInfo.icon} size={16} /> {typeInfo.label}</span>
                  </div>

                  {selType === 'report_player' && (
                    <label>Username pemain yang dilaporkan<input value={form.target_player} onChange={event => setForm(current => ({ ...current, target_player: event.target.value }))} placeholder="Nama player" maxLength={80} required /></label>
                  )}
                  <label>Subjek ticket<input value={form.subject} onChange={event => setForm(current => ({ ...current, subject: event.target.value }))} placeholder="Ringkasan masalah" maxLength={200} required /></label>
                  <label>Deskripsi lengkap<textarea value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} rows={7} placeholder="Jelaskan kronologi dan informasi penting..." maxLength={4000} required /></label>
                  <div className="support-form-two-columns">
                    <label>Link bukti <small>Opsional</small><input type="url" value={form.evidence_url} onChange={event => setForm(current => ({ ...current, evidence_url: event.target.value }))} placeholder="https://..." /></label>
                    <label>Discord User ID <small>Opsional</small><input inputMode="numeric" value={form.discord_user_id} onChange={event => setForm(current => ({ ...current, discord_user_id: event.target.value.replace(/\D/g, '').slice(0, 20) }))} placeholder="Contoh: 123456789012345678" /></label>
                  </div>

                  <div className="support-discord-explain">
                    <Icon name="discord" size={19} />
                    <div><strong>Ingin membalas langsung dari Discord?</strong><p>Masukkan Discord User ID agar bot memberikan akses ke channel ticket. Tanpa ID, balasan staf Discord tetap muncul di web.</p></div>
                  </div>

                  <button type="submit" className="support-submit-button" disabled={sending}>
                    {sending ? <><Icon name="spinner" size={16} spin /> Membuat ticket...</> : <>KIRIM TICKET <Icon name="arrow-right" size={16} /></>}
                  </button>
                </form>

                <aside className="support-form-side">
                  <span>LOGIN SEBAGAI</span>
                  <strong>{player?.displayName || player?.username}</strong>
                  <small>{player?.platform === 'bedrock' ? 'BEDROCK EDITION' : 'JAVA EDITION'}</small>
                  <hr />
                  <h3>Sebelum mengirim</h3>
                  <ul><li>Gunakan subjek yang jelas.</li><li>Sertakan bukti bila tersedia.</li><li>Jangan membuat ticket duplikat.</li><li>Tunggu balasan melalui web atau Discord.</li></ul>
                </aside>
              </div>
            )}

            {view === 'tickets' && (
              <div className="support-tickets-view">
                <div className="support-tickets-heading">
                  <div><span className="public-eyebrow">RIWAYAT SUPPORT</span><h2>Ticket Saya</h2><p>Klik ticket untuk membuka percakapan.</p></div>
                  <button type="button" onClick={() => setView('home')}><Icon name="plus" size={14} /> Ticket baru</button>
                </div>

                {!player ? (
                  <div className="support-empty-redesign"><span><Icon name="lock" size={26} /></span><h3>Login untuk melihat ticket</h3><p>Riwayat ticket terikat ke akun Minecraft kamu.</p><button type="button" onClick={() => setShowLogin(true)}>LOGIN</button></div>
                ) : ticketsLoading ? (
                  <div className="support-empty-redesign"><Icon name="spinner" size={28} spin /><p>Memuat ticket...</p></div>
                ) : tickets.length === 0 ? (
                  <div className="support-empty-redesign"><span><Icon name="inbox" size={26} /></span><h3>Belum ada ticket</h3><p>Masalah dan pertanyaan baru dapat dibuat dari menu Buat Ticket.</p><button type="button" onClick={() => setView('home')}>BUAT TICKET</button></div>
                ) : (
                  <div className="support-ticket-list-redesign">
                    {tickets.map(ticket => {
                      const type = TYPES.find(item => item.id === ticket.type) || TYPES[3];
                      const statusInfo = STATUS[ticket.status] || STATUS.open;
                      return (
                        <button type="button" key={ticket.ticket_id} onClick={() => openChat(ticket)} style={{ '--ticket-accent': type.accent }}>
                          <span className="support-ticket-list-icon"><Icon name={type.icon} size={20} /></span>
                          <div className="support-ticket-list-main"><strong>{ticket.subject}</strong><small><code>{ticket.ticket_id}</code> · {type.label} · {fmt(ticket.updated_at || ticket.created_at)}</small></div>
                          <div className="support-ticket-list-meta"><span className={`support-status ${statusInfo.className}`}>{statusInfo.label}</span><small><Icon name="comment-dots" size={12} /> {(ticket.messages || []).length}</small>{ticket.discord_channel_id && <small className="discord"><Icon name="discord" size={12} /> Sync</small>}</div>
                          <Icon name="chevron-right" size={16} />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {view === 'chat' && (
              <div className="support-chat-redesign">
                <header className="support-chat-redesign-head">
                  <button type="button" onClick={() => { setView('tickets'); loadTickets(); }}><Icon name="arrow-left" size={15} /> Kembali</button>
                  {activeTicket && (
                    <>
                      <span className="support-chat-ticket-icon" style={{ '--ticket-accent': chatType.accent }}><Icon name={chatType.icon} size={18} /></span>
                      <div><strong>{activeTicket.subject}</strong><small>{activeTicket.ticket_id} · {chatType.label}</small></div>
                      <span className={`support-status ${chatStatus.className}`}>{chatStatus.label}</span>
                      <span className={`support-sync-badge ${activeTicket.discord_channel_id ? 'connected' : 'web-only'}`}>
                        <Icon name={activeTicket.discord_channel_id ? 'discord' : 'comment-dots'} size={13} />
                        {activeTicket.discord_channel_id ? 'Discord connected' : 'Web only'}
                      </span>
                      <span className={`support-live-badge ${sseStatus}`}><i />{sseStatus === 'live' ? 'Live' : sseStatus === 'polling' ? 'Polling' : 'Connecting'}</span>
                    </>
                  )}
                </header>

                <div className="support-chat-body">
                  {loadingChat ? (
                    <div className="support-chat-loading"><Icon name="spinner" size={30} spin /><p>Memuat percakapan...</p></div>
                  ) : activeTicket && (
                    <>
                      <div className="support-chat-context">
                        <div><span>PLAYER</span><strong>{activeTicket.player_username}</strong></div>
                        <div><span>DIBUAT</span><strong>{fmt(activeTicket.created_at)}</strong></div>
                        <div><span>CHANNEL</span><strong>{activeTicket.discord_channel_id ? 'Web + Discord' : 'Website'}</strong></div>
                        {activeTicket.evidence_url && <a href={activeTicket.evidence_url} target="_blank" rel="noopener noreferrer"><Icon name="link" size={13} /> Buka bukti</a>}
                      </div>

                      <div className="support-messages-redesign">
                        {(activeTicket.messages || []).map((message, index) => {
                          const isAdmin = message.sender_type === 'admin';
                          return (
                            <div key={message.id || index} className={`support-message-row${isAdmin ? ' admin' : ''}`}>
                              <div className="support-message-meta"><strong>{isAdmin ? message.sender || 'Admin' : message.sender}</strong><span>{message.source === 'discord' ? <><Icon name="discord" size={11} /> Discord</> : 'Web'}</span></div>
                              <div className={`support-message-bubble${message._pending ? ' pending' : ''}`}><p>{message.text}</p></div>
                              <small>{message._pending ? 'Mengirim...' : fmt(message.created_at)}</small>
                            </div>
                          );
                        })}
                        <div ref={chatEndRef} />
                      </div>
                    </>
                  )}
                </div>

                <footer className="support-chat-composer">
                  {isClosed ? (
                    <div className="support-chat-closed"><Icon name="lock" size={15} /> Ticket telah ditutup dan tidak menerima pesan baru.</div>
                  ) : (
                    <>
                      <textarea value={newMsg} onChange={event => setNewMsg(event.target.value)} rows={3} maxLength={3000} placeholder="Tulis balasan..." onKeyDown={event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) sendMessage(); }} />
                      <button type="button" onClick={sendMessage} disabled={sendingMsg || !newMsg.trim()}>{sendingMsg ? <Icon name="spinner" size={16} spin /> : <><Icon name="paper-plane" size={16} /> KIRIM</>}</button>
                      <small>Ctrl/⌘ + Enter untuk mengirim · Balasan Discord akan muncul otomatis.</small>
                    </>
                  )}
                </footer>
              </div>
            )}
          </section>
        </main>

        <FancyFooter serverName={serverName} discordUrl={s.discord_url} settings={s} />
      </div>

      {showLogin && (
        <LoginModal onClose={() => { setShowLogin(false); setPendingType(null); }} onSuccess={nextPlayer => {
          setPlayer(nextPlayer);
          localStorage.setItem('mc_player', JSON.stringify(nextPlayer));
          setShowLogin(false);
          loadTickets();
          if (pendingType) {
            openTypeForm(pendingType);
            setPendingType(null);
          }
        }} />
      )}
    </>
  );
}
