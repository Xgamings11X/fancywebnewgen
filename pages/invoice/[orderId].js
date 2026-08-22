import { useCallback, useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import toast from 'react-hot-toast';
import FancyNav, { PlayerAvatar } from '../../components/FancyNav';
import FancyFooter from '../../components/FancyFooter';
import LogoImage, { useTransparentLogo } from '../../components/LogoImage';
import Icon from '../../components/Icon';

const LoginModal = dynamic(() => import('../../components/LoginModal'), { ssr:false });
const PAID = new Set(['success','paid','settlement','capture']);
const FAILED = new Set(['expire','expired','cancel','cancelled','deny','failed']);

const STATUS = {
  success:{label:'Pembayaran berhasil',icon:'circle-check'}, paid:{label:'Pembayaran berhasil',icon:'circle-check'},
  settlement:{label:'Pembayaran berhasil',icon:'circle-check'}, capture:{label:'Pembayaran berhasil',icon:'circle-check'},
  pending:{label:'Menunggu pembayaran',icon:'clock'}, expire:{label:'Transaksi kedaluwarsa',icon:'circle-xmark'},
  expired:{label:'Transaksi kedaluwarsa',icon:'circle-xmark'}, cancel:{label:'Transaksi dibatalkan',icon:'ban'},
  cancelled:{label:'Transaksi dibatalkan',icon:'ban'}, deny:{label:'Pembayaran ditolak',icon:'triangle-exclamation'},
  failed:{label:'Pembayaran gagal',icon:'triangle-exclamation'},
};

const idr = value => `Rp ${Number(value || 0).toLocaleString('id-ID')}`;
const dateLabel = value => value ? `${new Date(value).toLocaleString('id-ID', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit', timeZone:'Asia/Jakarta' })} WIB` : '-';

function safeUrl(value) {
  if (!value) return '';
  try { const url = new URL(value); return ['http:','https:'].includes(url.protocol) ? url.toString() : ''; } catch { return ''; }
}

export async function getServerSideProps({ params }) {
  try {
    const { OrdersAsync, SettingsAsync } = await import('../../lib/redis.js');
    const [order, settings] = await Promise.all([OrdersAsync.byId(params.orderId), SettingsAsync.get()]);
    if (!order) return { notFound:true };
    return { props:{ order, settings } };
  } catch { return { notFound:true }; }
}

export default function InvoicePage({ order: initialOrder, settings = {} }) {
  const [order, setOrder] = useState(initialOrder);
  const [player, setPlayer] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [copied, setCopied] = useState(false);
  const [legacyPaying, setLegacyPaying] = useState(false);
  const pollRef = useRef(null);
  const paidRef = useRef(PAID.has(initialOrder.payment_status));
  const serverName = settings.server_name || 'Fancy Network';
  const { src:logoSrc } = useTransparentLogo(settings.logo_url || '');
  const statusKey = String(order.payment_status || 'pending').toLowerCase();
  const status = STATUS[statusKey] || STATUS.pending;
  const isPaid = PAID.has(statusKey);
  const isFailed = FAILED.has(statusKey);
  const isPending = !isPaid && !isFailed;
  const qrUrl = safeUrl(order.payment_info?.qrImageUrl);
  const discordUrl = safeUrl(settings.discord_url || process.env.NEXT_PUBLIC_DISCORD_URL);
  const whatsappUrl = safeUrl(settings.whatsapp_url || process.env.NEXT_PUBLIC_WHATSAPP_URL);
  const buyer = order.buyer_username || order.player_username;
  const buyerUuid = order.buyer_uuid || (!order.is_gift ? order.player_uuid : '');
  const subtotal = Number(order.amount || 0) + Number(order.discount_amount || 0);

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
  useEffect(() => { paidRef.current = isPaid || paidRef.current; }, [isPaid]);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/orders/verify/${initialOrder.order_id}`, { credentials:'include' });
      const result = await response.json();
      if (result?.order) setOrder(result.order);
    } catch {}
  }, [initialOrder.order_id]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!isPending) return undefined;
    let attempts = 0;
    pollRef.current = window.setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      attempts += 1;
      await refresh();
      if (attempts >= 60) window.clearInterval(pollRef.current);
    }, 5000);
    return () => window.clearInterval(pollRef.current);
  }, [isPending, refresh]);

  const copyId = useCallback(async () => {
    try { await navigator.clipboard.writeText(order.order_id); setCopied(true); window.setTimeout(()=>setCopied(false), 1800); }
    catch { toast.error('ID order tidak dapat disalin'); }
  }, [order.order_id]);

  const downloadPdf = useCallback(async () => {
    try {
      const response = await fetch(`/api/orders/invoice-pdf/${order.order_id}`);
      if (!response.ok) throw new Error('PDF belum dapat dibuat');
      const blobUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = blobUrl; anchor.download = `invoice-${order.order_id}.pdf`; anchor.click();
      URL.revokeObjectURL(blobUrl);
    } catch (error) { toast.error(error.message); }
  }, [order.order_id]);

  const openLegacySnap = useCallback(async () => {
    if (!order.midtrans_snap_token) return;
    setLegacyPaying(true);
    try {
      const { openSnapPopup } = await import('../../lib/snapClient');
      await openSnapPopup(order.midtrans_snap_token, { onSuccess:refresh, onPending:refresh, onError:()=>toast.error('Pembayaran gagal'), onClose:()=>{} });
    } catch (error) { toast.error(error.message || 'Gagal membuka pembayaran'); }
    setLegacyPaying(false);
  }, [order.midtrans_snap_token, refresh]);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout',{method:'POST',credentials:'include'}).catch(()=>{});
    localStorage.removeItem('mc_player'); localStorage.removeItem('mc_token'); setPlayer(null);
  }, []);

  return (
    <>
      <Head><title>Invoice #{order.order_id} | {serverName}</title><meta name="robots" content="noindex,nofollow"/><link rel="icon" href={settings.logo_url || logoSrc || '/favicon.png'}/></Head>
      <div className="public-shell fancy-public-theme invoice-page">
        <FancyNav player={player} onLoginClick={()=>setShowLogin(true)} onLogout={logout} settings={settings}/>
        <main className="invoice-wrap">
          <section className="invoice-status-banner" data-status={isPaid?'paid':isFailed?'failed':'pending'}>
            <span><Icon name={status.icon} size={21}/></span>
            <div><strong>{status.label}</strong><p>{isPaid ? `Produk ${order.is_gift ? 'gift ' : ''}sedang diproses untuk ${order.player_username}.` : isPending ? 'Pindai QRIS di bawah dan selesaikan pembayaran sebelum batas waktu.' : 'Transaksi ini tidak berhasil diselesaikan.'}</p></div>
            {isPending && <button type="button" onClick={refresh}><Icon name="rotate" size={14}/> Periksa status</button>}
          </section>

          <article className="invoice-card">
            <header className="invoice-header">
              <div className="invoice-brand"><span>{settings.logo_url ? <img src={settings.logo_url} alt=""/> : <LogoImage alt=""/>}</span><div><strong>{serverName}</strong><small>Official Store Invoice</small></div></div>
              <div className="invoice-id"><small>INVOICE</small><button type="button" onClick={copyId}><Icon name={copied?'check':'copy'} size={12}/> #{order.order_id}</button></div>
            </header>

            {isPending && qrUrl && (
              <section className="invoice-qris">
                <div><span className="public-eyebrow">PEMBAYARAN QRIS</span><h2>Pindai untuk membayar</h2><p>Buka aplikasi bank atau e-wallet yang mendukung QRIS. Nominal sudah terisi otomatis.</p><strong>{idr(order.amount)}</strong></div>
                <figure><img src={qrUrl} alt={`QRIS invoice ${order.order_id}`}/><figcaption>QRIS diproses aman oleh Midtrans</figcaption></figure>
              </section>
            )}
            {isPending && !qrUrl && order.midtrans_snap_token && (
              <section className="invoice-legacy-payment"><p>Order lama ini menggunakan popup QRIS Midtrans.</p><button type="button" onClick={openLegacySnap} disabled={legacyPaying}><Icon name="credit-card" size={14}/> {legacyPaying?'Membuka...':'Bayar dengan QRIS'}</button></section>
            )}

            <section className="invoice-people-grid">
              <div><small>PEMBELI</small><div className="invoice-player"><PlayerAvatar uuid={buyerUuid} username={buyer} size={42}/><span><strong>{buyer}</strong><em>{order.discord_username || 'Discord tidak dicantumkan'}</em></span></div></div>
              <div><small>{order.is_gift ? 'PENERIMA GIFT' : 'PENERIMA PRODUK'}</small><div className="invoice-player"><PlayerAvatar uuid={order.player_uuid} username={order.player_username} size={42}/><span><strong>{order.player_username}</strong><em>{String(order.player_platform || 'java').toUpperCase()} · {order.player_rank || 'default'}</em></span></div></div>
              <div className="invoice-meta"><small>RINCIAN TRANSAKSI</small><dl><div><dt>Tanggal</dt><dd>{dateLabel(order.created_at)}</dd></div><div><dt>Metode</dt><dd>QRIS</dd></div><div><dt>Status</dt><dd>{status.label}</dd></div></dl></div>
            </section>

            <section className="invoice-product">
              <div><small>PRODUK</small><strong>{order.product_name}</strong><span>{order.category_name || 'Produk Store'}</span></div>
              <b>{idr(subtotal)}</b>
            </section>
            <section className="invoice-total">
              {Number(order.discount_amount || 0) > 0 && <div><span>Diskon {order.redeem_code ? `(${order.redeem_code})` : ''}</span><strong>-{idr(order.discount_amount)}</strong></div>}
              <div className="grand-total"><span>Total pembayaran</span><strong>{idr(order.amount)}</strong></div>
            </section>

            {isPaid && <div className={`invoice-delivery ${order.plugin_notified?'delivered':'queued'}`}><Icon name={order.plugin_notified?'circle-check':'hourglass-half'} size={15}/>{order.plugin_notified?'Produk telah dikirim ke server Minecraft':'Pembayaran diterima, produk sedang masuk antrean pengiriman'}</div>}

            <footer className="invoice-actions">
              <Link href="/store"><Icon name="arrow-left" size={13}/> Kembali ke Store</Link>
              <div><button type="button" onClick={downloadPdf}><Icon name="file-pdf" size={14}/> Download PDF</button><button type="button" onClick={copyId}><Icon name={copied?'check':'copy'} size={14}/>{copied?'Tersalin':'Salin ID'}</button></div>
            </footer>
          </article>

          <section className="invoice-help"><p>Produk belum masuk setelah pembayaran? Hubungi tim dengan menyertakan ID order.</p><div>{discordUrl&&<a href={discordUrl} target="_blank" rel="noopener noreferrer"><Icon name="discord" size={15}/> Discord</a>}{whatsappUrl&&<a href={whatsappUrl} target="_blank" rel="noopener noreferrer"><Icon name="whatsapp" size={15}/> WhatsApp</a>}</div></section>
        </main>
        <FancyFooter serverName={serverName} settings={settings}/>
      </div>
      {showLogin && <LoginModal onClose={()=>setShowLogin(false)} onSuccess={next=>{setPlayer(next);setShowLogin(false);}}/>}
    </>
  );
}
