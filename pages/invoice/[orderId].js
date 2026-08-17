/**
 * pages/invoice/[orderId].js
 * - Landing → tampilkan detail invoice + tombol bayar (popup Midtrans Snap)
 * - Autopay: kalau datang dari checkout (CartModal redirect ke ?autopay=1),
 *   popup Midtrans Snap otomatis terbuka begitu halaman ini selesai dimuat
 *   (lihat efek "Autopay" di bawah)
 * - Buka ulang popup Midtrans Snap saat klik "Bayar Sekarang" (manual retry)
 * - Download PDF
 * - Expired otomatis 1 hari (24 jam)
 * - Cancel jika user keluar halaman saat pending
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import toast from 'react-hot-toast';
import FancyNav from '../../components/FancyNav';
import LogoImage, { useTransparentLogo } from '../../components/LogoImage';
import LoginModal from '../../components/LoginModal';
import Icon from '../../components/Icon';

export async function getServerSideProps({ params }) {
  try {
    const { OrdersAsync, SettingsAsync } = await import('../../lib/redis.js');
    const [order, settings] = await Promise.all([
      OrdersAsync.byId(params.orderId),
      SettingsAsync.get(),
    ]);
    if (!order) return { notFound: true };
    return { props: { order, settings } };
  } catch (e) {
    console.error('[invoice/getSSP]', e.message);
    return { notFound: true };
  }
}

const idr = v => `Rp ${Number(v||0).toLocaleString('id-ID')}`;
const formatDate = iso => {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('id-ID', {
    day:'2-digit', month:'long', year:'numeric',
    hour:'2-digit', minute:'2-digit', timeZone:'Asia/Jakarta',
  }) + ' WIB';
};

const PAID_STATUSES   = ['success','paid'];
const FAILED_STATUSES = ['expire','cancel','cancelled','deny','failed','expired'];
const DONE_STATUSES   = [...PAID_STATUSES, ...FAILED_STATUSES];

const STATUS_CFG = {
  settlement: { label:'Pembayaran Berhasil',    icon:'circle-check',         color:'#2ecc71', bg:'rgba(46,204,113,0.08)',  border:'rgba(46,204,113,0.2)'  },
  capture:    { label:'Pembayaran Berhasil',    icon:'circle-check',         color:'#2ecc71', bg:'rgba(46,204,113,0.08)',  border:'rgba(46,204,113,0.2)'  },
  success:    { label:'Pembayaran Berhasil',    icon:'circle-check',         color:'#2ecc71', bg:'rgba(46,204,113,0.08)',  border:'rgba(46,204,113,0.2)'  },
  paid:       { label:'Pembayaran Berhasil',    icon:'circle-check',         color:'#2ecc71', bg:'rgba(46,204,113,0.08)',  border:'rgba(46,204,113,0.2)'  },
  pending:    { label:'Menunggu Pembayaran',    icon:'clock',                color:'#ffc800', bg:'rgba(255,200,0,0.08)',   border:'rgba(255,200,0,0.2)'   },
  expire:     { label:'Transaksi Kadaluarsa',   icon:'circle-xmark',         color:'#ff3b30', bg:'rgba(255,59,48,0.08)',   border:'rgba(255,59,48,0.2)'   },
  expired:    { label:'Transaksi Kadaluarsa',   icon:'circle-xmark',         color:'#ff3b30', bg:'rgba(255,59,48,0.08)',   border:'rgba(255,59,48,0.2)'   },
  cancel:     { label:'Transaksi Dibatalkan',   icon:'ban',                  color:'#888',    bg:'rgba(136,136,136,0.08)', border:'rgba(136,136,136,0.2)' },
  cancelled:  { label:'Transaksi Dibatalkan',   icon:'ban',                  color:'#888',    bg:'rgba(136,136,136,0.08)', border:'rgba(136,136,136,0.2)' },
  deny:       { label:'Pembayaran Ditolak',     icon:'triangle-exclamation', color:'#ff3b30', bg:'rgba(255,59,48,0.08)',   border:'rgba(255,59,48,0.2)'   },
  failed:     { label:'Pembayaran Gagal',       icon:'triangle-exclamation', color:'#ff3b30', bg:'rgba(255,59,48,0.08)',   border:'rgba(255,59,48,0.2)'   },
};

export default function InvoicePage({ order: initialOrder, settings }) {
  const router     = useRouter();
  const s          = settings || {};
  const serverName = s.server_name || 'Fancy Network';
  const logoUrl    = s.logo_url || '';
  const { src: logoSrc } = useTransparentLogo(logoUrl);

  const [player,      setPlayer]      = useState(null);
  const [showLogin,   setShowLogin]   = useState(false);
  const [copied,      setCopied]      = useState(false);
  const [liveOrder,   setLiveOrder]   = useState(initialOrder);
  const pollRef = useRef(null);
  const orderId = initialOrder.order_id;

  const statusKey = liveOrder?.payment_status || 'pending';
  const cfg       = STATUS_CFG[statusKey] || STATUS_CFG.pending;
  const isPaid    = PAID_STATUSES.includes(statusKey);
  const isDone    = DONE_STATUSES.includes(statusKey);
  const isPending = !isDone;

  // ── Auth ────────────────────────────────────────────────────────
  useEffect(() => {
    try { const r = localStorage.getItem('mc_player'); if(r) setPlayer(JSON.parse(r)); } catch {}
  }, []);
  const handleLogout = async () => {
    await fetch('/api/auth/logout',{method:'POST',credentials:'include'});
    setPlayer(null); localStorage.removeItem('mc_player'); localStorage.removeItem('mc_token');
  };
  const handleLoginSuccess = p => { setPlayer(p); localStorage.setItem('mc_player',JSON.stringify(p)); setShowLogin(false); };

  // ── Verifikasi langsung saat halaman dibuka (untuk return dari payment gateway) ──
  useEffect(() => {
    const checkNow = async () => {
      try {
        const res  = await fetch('/api/orders/verify/'+orderId, { credentials:'include' });
        const data = await res.json();
        if (data?.order) setLiveOrder(data.order);
      } catch {}
    };
    checkNow();
  }, [orderId]);

  // ── Polling status ──────────────────────────────────────────────
  useEffect(() => {
    if (isDone) return;
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const res  = await fetch('/api/orders/verify/'+orderId, { credentials:'include' });
        const data = await res.json();
        if (data?.order) {
          setLiveOrder(data.order);
          if (DONE_STATUSES.includes(data.order.payment_status) || attempts >= 60) {
            clearInterval(pollRef.current);
          }
        }
      } catch {}
    }, 3000);
    return () => clearInterval(pollRef.current);
  }, [isDone, orderId]);

  // ── Sudah bayar? (ref, supaya nilainya langsung sinkron tanpa nunggu
  // render — dipakai di bawah biar event yang lepas tembak (unload/route
  // change/popup close) tidak pernah salah anggap order ini "dibatalkan"
  // padahal user BARU SAJA selesai bayar) ──────────────────────────────
  const paidRef = useRef(isPaid);
  useEffect(() => { if (isPaid) paidRef.current = true; }, [isPaid]);

  // ── Cancel saat user navigasi keluar (DI DALAM web aja) ────────────
  // PENTING: sengaja TIDAK pakai `beforeunload`. Saat bayar pakai
  // Gopay/OVO/DANA/dll, Midtrans Snap redirect ke deep-link app
  // (mis. gopay://...) — browser mobile sering nganggep itu "mau
  // ninggalin halaman" dan nembak `beforeunload`, padahal user cuma
  // pindah app sebentar buat bayar, BUKAN nutup invoice-nya. Kalau
  // dipakai, order yang lagi diproses malah ke-cancel duluan sebelum
  // pembayarannya selesai. Jadi cancel cuma boleh kejadian kalau user
  // BENERAN pindah halaman di dalam web ini (klik "Kembali ke Store",
  // dsb) — itu satu-satunya sinyal yang bisa dipercaya.
  useEffect(() => {
    const onRoute = url => {
      if (!url.startsWith('/invoice/') && isPending && !paidRef.current) {
        fetch('/api/orders/cancel', {
          method:'POST', credentials:'include',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ orderId }),
        }).catch(()=>{});
      }
    };
    router.events.on('routeChangeStart', onRoute);
    return () => router.events.off('routeChangeStart', onRoute);
  }, [isPending, orderId, router.events]);

  // ── Buka popup Midtrans Snap ──────────────────────────────────────
  const [payingNow, setPayingNow] = useState(false);
  const openMidtransPopup = useCallback(async () => {
    const token = liveOrder?.midtrans_snap_token;
    if (!token) { toast.error('Token pembayaran tidak ditemukan. Hubungi admin.'); return; }
    setPayingNow(true);
    try {
      const { openSnapPopup } = await import('../../lib/snapClient');
      await openSnapPopup(token, {
        onSuccess: () => {
          // Tandai sudah bayar SEKARANG JUGA (sebelum apapun yang async),
          // lalu langsung tutup popup-nya sendiri — jangan nunggu Midtrans
          // nutup otomatis (animasi suksesnya bisa beberapa detik).
          paidRef.current = true;
          try { window.snap?.hide?.(); } catch {}
          toast.success('Pembayaran berhasil!');
          // Refresh status invoice di tempat — tidak perlu redirect, kita
          // memang sudah di halaman invoice-nya — supaya langsung berubah
          // jadi "Pembayaran Berhasil" tanpa nunggu polling 3 detik berikutnya.
          fetch('/api/orders/verify/'+orderId,{credentials:'include'})
            .then(r=>r.json()).then(d=>d?.order&&setLiveOrder(d.order)).catch(()=>{});
        },
        onPending: () => { toast('Selesaikan pembayaran kamu di popup.', { icon: '⏳' }); },
        onError:   () => { toast.error('Pembayaran gagal. Coba lagi.'); },
        // Popup ditutup (baik oleh user atau oleh Midtrans setelah sukses,
        // atau gara-gara balik dari app Gopay/OVO/dll). Kalau ternyata
        // sudah bayar (paidRef), jangan tampilkan apa-apa — jangan
        // dianggap "dibatalkan".
        onClose:   () => {},
      });
    } catch (e) {
      toast.error(e.message || 'Gagal membuka popup pembayaran.');
    }
    setPayingNow(false);
  }, [liveOrder?.midtrans_snap_token, orderId]);

  // ── Autopay: baru saja dibuat dari checkout (CartModal → ?autopay=1) ──
  // Halaman invoice (status: pending) sudah tampil duluan, BARU popup Midtrans
  // Snap dibuka di sini. Kalau popup gagal dimuat, user tetap aman di invoice
  // ini dan bisa klik "Bayar Sekarang" untuk coba lagi — tidak nyasar.
  const autopayTriggered = useRef(false);
  useEffect(() => {
    if (!router.isReady) return;
    if (autopayTriggered.current) return;
    if (router.query.autopay !== '1') return;
    if (!isPending || !liveOrder?.midtrans_snap_token) return;

    autopayTriggered.current = true;
    // Bersihkan ?autopay=1 dari URL supaya popup tidak kebuka ulang kalau
    // halaman ini di-refresh atau dibuka lagi lewat tombol back.
    router.replace(`/invoice/${initialOrder.order_id}`, undefined, { shallow: true });
    openMidtransPopup();
  }, [router.isReady, router.query.autopay, isPending, liveOrder?.midtrans_snap_token, openMidtransPopup, router, initialOrder.order_id]);

  // ── Download PDF ────────────────────────────────────────────────
  const handleDownloadPdf = async () => {
    try {
      const res = await fetch(`/api/orders/invoice-pdf/${liveOrder.order_id}`);
      if (!res.ok) throw new Error('Gagal generate PDF');
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `invoice-${liveOrder.order_id}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Gagal download invoice PDF: ' + e.message);
    }
  };

  // ── Copy order ID ───────────────────────────────────────────────
  const copyId = () => {
    navigator.clipboard?.writeText(initialOrder.order_id).catch(()=>{});
    setCopied(true); setTimeout(()=>setCopied(false), 2000);
  };

  const subtotal   = (liveOrder.amount||0) + (liveOrder.discount_amount||0);
  const discount   = liveOrder.discount_amount||0;
  const serviceFee = Math.round((liveOrder.amount||0)*0.025);
  const total      = (liveOrder.amount||0) + serviceFee;

  return (
    <>
      <Head>
        <title>Invoice #{initialOrder.order_id} | {serverName}</title>
        <meta name="robots" content="noindex,nofollow"/>
        <link rel="icon" type="image/png" href={s.logo_url || logoSrc || '/favicon.png'}/>
      </Head>

      <FancyNav player={player} onLoginClick={()=>setShowLogin(true)} onLogout={handleLogout} settings={settings}/>
      {showLogin && <LoginModal onClose={()=>setShowLogin(false)} onSuccess={handleLoginSuccess}/>}

      <main style={{paddingTop:120,paddingBottom:80,paddingLeft:24,paddingRight:24,display:'flex',flexDirection:'column',alignItems:'center'}}>

        {/* Status Banner */}
        <div style={{width:'100%',maxWidth:820,display:'flex',alignItems:'center',gap:16,background:cfg.bg,border:`1px solid ${cfg.border}`,borderRadius:14,padding:'16px 22px',marginBottom:16,flexWrap:'wrap'}}>
          <div style={{width:44,height:44,borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:20,background:cfg.bg,color:cfg.color,border:`1px solid ${cfg.border}`}}>
            <Icon name={cfg.icon} size={20} color={cfg.color}/>
          </div>
          <div style={{flex:1,minWidth:200}}>
            <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:16,color:'#fff'}}>{cfg.label}</div>
            <div style={{fontSize:13,color:'var(--text-muted)',marginTop:2}}>
              {isPaid    ? 'Item akan dikirim ke akun Minecraft kamu dalam beberapa saat.'
              : isPending ? 'Selesaikan pembayaran di payment gateway untuk melanjutkan.'
              :             'Transaksi ini tidak berhasil diselesaikan.'}
            </div>
          </div>
          {isPending && (
            <button onClick={openMidtransPopup} disabled={payingNow} style={{display:'inline-flex',alignItems:'center',gap:8,padding:'10px 20px',background:'linear-gradient(135deg,var(--primary),var(--primary-light))',color:'#fff',border:'none',borderRadius:10,fontSize:13,fontWeight:700,cursor:payingNow?'not-allowed':'pointer',whiteSpace:'nowrap',flexShrink:0,opacity:payingNow?0.7:1,boxShadow:'0 4px 16px rgba(255,107,0,0.3)'}}>
              {payingNow ? <span className="fn-spinner" style={{width:14,height:14,borderWidth:2}}/> : <Icon name="credit-card" size={14}/>}
              {'Bayar Sekarang'}
            </button>
          )}
        </div>


        {/* Invoice Card */}
        <div style={{width:'100%',maxWidth:820,background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:24,padding:40,backdropFilter:'blur(12px)',position:'relative',overflow:'hidden',boxShadow:'0 20px 50px rgba(0,0,0,0.5)'}}>
          <div style={{position:'absolute',top:0,left:0,width:'100%',height:4,background:'linear-gradient(90deg,var(--primary),var(--primary-light))',boxShadow:'0 2px 20px var(--primary-glow)'}}/>

          {/* Header */}
          <header data-anim="fade-up" data-delay="1" style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',borderBottom:'1px solid rgba(255,255,255,0.06)',paddingBottom:28,marginBottom:28,flexWrap:'wrap',gap:16}}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <LogoImage src={logoUrl||undefined} alt={serverName} style={{height:38,width:38,objectFit:'contain',filter:'drop-shadow(0 0 10px rgba(255,107,0,0.55))'}}/>
              <div>
                <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:20,letterSpacing:0.5}}>
                  <span style={{color:'var(--primary)'}}>FANCY</span>{' '}
                  <span>{serverName.replace(/fancy/gi,'').trim()||'NETWORK'}</span>
                </div>
                <div style={{fontSize:12,color:'var(--text-muted)',marginTop:1}}>Fancy Network</div>
              </div>
            </div>
            <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:8}}>
              <div style={{display:'inline-flex',alignItems:'center',gap:6,padding:'6px 14px',borderRadius:100,background:cfg.bg,border:`1px solid ${cfg.border}`,color:cfg.color,fontSize:12,fontWeight:700,textTransform:'uppercase',letterSpacing:1}}>
                <Icon name={cfg.icon} size={12} color={cfg.color}/> {cfg.label}
              </div>
              <button onClick={copyId} style={{fontFamily:'Space Grotesk,sans-serif',fontSize:14,fontWeight:700,color:'#fff',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,padding:'5px 12px',cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
                <Icon name={copied?'check':'copy'} size={11} style={{opacity:0.6}}/> #{initialOrder.order_id}
              </button>
            </div>
          </header>

          {/* Details grid */}
          <section data-anim="fade-up" data-delay="2" style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:28,marginBottom:32}}>
            <div>
              <h4 style={{fontSize:11,textTransform:'uppercase',letterSpacing:'1.2px',color:'var(--primary-light)',marginBottom:12,fontWeight:700}}>Ditagih Kepada</h4>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <img src={liveOrder.player_uuid?`https://crafatar.com/avatars/${liveOrder.player_uuid}?size=64&overlay`:`https://minotar.net/helm/${encodeURIComponent(liveOrder.player_username||'steve')}/64`} alt={liveOrder.player_username} style={{width:40,height:40,borderRadius:6,imageRendering:'pixelated',flexShrink:0,border:'1px solid rgba(255,255,255,0.08)'}} onError={e=>{e.target.src='https://minotar.net/helm/steve/64';}}/>
                <div>
                  <div style={{display:'inline-flex',alignItems:'center',gap:6,background:'rgba(255,255,255,0.04)',padding:'4px 10px',borderRadius:6,border:'1px solid rgba(255,255,255,0.06)',fontWeight:600,fontSize:14,color:'#fff'}}>
                    <Icon name="gamepad" size={11} color="var(--primary)"/> {liveOrder.player_username}
                  </div>
                  {liveOrder.discord_username && <div style={{fontSize:12,color:'var(--text-muted)',marginTop:3,display:'flex',alignItems:'center',gap:5}}><Icon name="discord" size={11} color="#5865F2"/> {liveOrder.discord_username}</div>}
                </div>
              </div>
            </div>
            <div>
              <h4 style={{fontSize:11,textTransform:'uppercase',letterSpacing:'1.2px',color:'var(--primary-light)',marginBottom:12,fontWeight:700}}>Rincian Transaksi</h4>
              <div style={{display:'grid',gridTemplateColumns:'auto 1fr',gap:'6px 12px',fontSize:13}}>
                <span style={{color:'var(--text-muted)'}}>Tanggal</span><span style={{fontWeight:500}}>{formatDate(liveOrder.created_at)}</span>
                <span style={{color:'var(--text-muted)'}}>Metode</span><span style={{fontWeight:500}}>{liveOrder.payment_method||'QRIS'}</span>
                <span style={{color:'var(--text-muted)'}}>ID Transaksi</span><span style={{fontFamily:'Space Grotesk,sans-serif',fontSize:12,fontWeight:500}}>{initialOrder.order_id}</span>
                {liveOrder.redeem_code && <><span style={{color:'var(--text-muted)'}}>Kode Redeem</span><span style={{color:'#2ecc71',fontWeight:500}}>{liveOrder.redeem_code}</span></>}
              </div>
            </div>
          </section>

          {/* Table */}
          <section data-anim="fade-up" data-delay="3" style={{width:'100%',overflowX:'auto',marginBottom:24}}>
            <table style={{width:'100%',borderCollapse:'collapse',textAlign:'left'}}>
              <thead>
                <tr>
                  {['Deskripsi Produk','Kategori','Harga'].map((h,i)=>(
                    <th key={h} style={{fontSize:11,textTransform:'uppercase',letterSpacing:'0.5px',color:'var(--text-muted)',padding:'10px 14px',borderBottom:'1px solid rgba(255,255,255,0.08)',fontWeight:700,textAlign:i===2?'right':'left'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{padding:'16px 14px',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:14,color:'#fff'}}>
                    <div style={{fontWeight:600}}>{liveOrder.product_name}</div>
                  </td>
                  <td style={{padding:'16px 14px',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:14,color:'#fff'}}>
                    <span style={{background:'rgba(255,107,0,0.1)',border:'1px solid rgba(255,107,0,0.18)',color:'var(--primary-light)',padding:'3px 10px',borderRadius:100,fontSize:11,fontWeight:600}}>{liveOrder.category_name||'Produk'}</span>
                  </td>
                  <td style={{padding:'16px 14px',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:14,color:'#fff',textAlign:'right',fontWeight:600}}>{idr(subtotal)}</td>
                </tr>
                {discount>0 && (
                  <tr>
                    <td style={{padding:'16px 14px',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:14,color:'#2ecc71'}}><div style={{fontWeight:600}}>Diskon Kode Redeem</div><div style={{fontSize:12,color:'var(--text-muted)',marginTop:3}}>Kode: {liveOrder.redeem_code}</div></td>
                    <td style={{padding:'16px 14px',borderBottom:'1px solid rgba(255,255,255,0.04)',textAlign:'right'}}><span style={{background:'rgba(46,204,113,0.1)',border:'1px solid rgba(46,204,113,0.2)',color:'#2ecc71',padding:'3px 10px',borderRadius:100,fontSize:11,fontWeight:600}}>Diskon</span></td>
                    <td style={{padding:'16px 14px',borderBottom:'1px solid rgba(255,255,255,0.04)',textAlign:'right',color:'#2ecc71',fontWeight:600}}>-{idr(discount)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          {/* Summary */}
          <section style={{display:'flex',justifyContent:'flex-end',marginBottom:24}}>
            <div style={{width:'100%',maxWidth:340,display:'flex',flexDirection:'column',gap:10}}>
              {[['Subtotal',idr(liveOrder.amount||0)],['Biaya Layanan (Gateway)',idr(serviceFee)]].map(([l,v])=>(
                <div key={l} style={{display:'flex',justifyContent:'space-between',fontSize:14,color:'var(--text-muted)'}}><span>{l}</span><span>{v}</span></div>
              ))}
              {discount>0 && <div style={{display:'flex',justifyContent:'space-between',fontSize:14,color:'#2ecc71'}}><span>Diskon Redeem</span><span>-{idr(discount)}</span></div>}
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',borderTop:'1px solid rgba(255,255,255,0.08)',paddingTop:14,marginTop:4,color:'#fff',fontWeight:700,fontSize:18}}>
                <span>Total Pembayaran</span>
                <span style={{color:'var(--primary-light)',fontFamily:'Space Grotesk,sans-serif'}}>{idr(total)}</span>
              </div>
            </div>
          </section>

          {/* Delivery */}
          {isPaid && (
            <div style={{marginBottom:24}}>
              <div style={{display:'inline-flex',alignItems:'center',gap:8,padding:'8px 16px',borderRadius:100,fontSize:13,fontWeight:600,...(liveOrder.plugin_notified?{background:'rgba(46,204,113,0.08)',border:'1px solid rgba(46,204,113,0.2)',color:'#2ecc71'}:{background:'rgba(255,200,0,0.08)',border:'1px solid rgba(255,200,0,0.2)',color:'#ffc800'})}}>
                <Icon name={liveOrder.plugin_notified?'cube':'hourglass-half'} size={14}/>
                {liveOrder.plugin_notified?'Item telah dikirim ke server Minecraft':'Menunggu pengiriman item ke server'}
              </div>
            </div>
          )}

          {/* Actions */}
          <footer style={{display:'flex',justifyContent:'space-between',alignItems:'center',borderTop:'1px solid rgba(255,255,255,0.06)',paddingTop:28,flexWrap:'wrap',gap:16}}>
            <Link href="/store" style={{color:'var(--text-muted)',textDecoration:'none',fontSize:13,fontWeight:600,display:'inline-flex',alignItems:'center',gap:8}}>
              <Icon name="arrow-left" size={13}/> Kembali ke Store
            </Link>
            <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
              {isPending && (
                <button onClick={openMidtransPopup} disabled={payingNow} className="btn-primary-fn" style={{display:'flex',alignItems:'center',gap:8,fontSize:13,fontWeight:600,opacity:payingNow?0.7:1,cursor:payingNow?'not-allowed':'pointer'}}>
                  {payingNow ? <span className="fn-spinner" style={{width:14,height:14,borderWidth:2}}/> : <Icon name="credit-card" size={13}/>}
                  {'Bayar Sekarang'}
                </button>
              )}
              <button onClick={handleDownloadPdf} className="btn-ghost-fn" style={{display:'flex',alignItems:'center',gap:8,fontSize:13,fontWeight:600}}>
                <Icon name="file-pdf" size={13}/> Download PDF
              </button>
              <button onClick={copyId} className="btn-ghost-fn" style={{display:'flex',alignItems:'center',gap:8,fontSize:13,fontWeight:600}}>
                <Icon name={copied?'check':'copy'} size={13}/>
                {copied?'Tersalin!':'Salin ID Order'}
              </button>
            </div>
          </footer>
        </div>

        <p style={{marginTop:24,fontSize:12,color:'var(--text-muted)',textAlign:'center',maxWidth:500}}>
          Simpan halaman ini sebagai bukti pembayaran. Jika item belum masuk dalam 5 menit, hubungi kami di{' '}
          <Link href="/support" style={{color:'var(--primary)',textDecoration:'none',fontWeight:600}}>Support</Link>.
        </p>
      </main>
    </>
  );
}
