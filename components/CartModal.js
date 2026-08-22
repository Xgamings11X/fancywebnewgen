/**
 * components/CartModal.js
 *
 * Modal checkout. Alurnya:
 *  1. Pemain isi Username Discord (wajib, untuk klaim role) + kode redeem (opsional)
 *  2. Opsional: pilih gift lalu verifikasi penerima langsung ke plugin.
 *  3. Klik "Bayar" → Midtrans Core membuat transaksi QRIS-only.
 *  4. Invoice menampilkan QR, lalu status diperbarui otomatis setelah pembayaran.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import toast from 'react-hot-toast';
import Icon from './Icon';

const idr = v => `Rp ${Number(v || 0).toLocaleString('id-ID')}`;

export default function CartModal({ product, player, onClose }) {
  const router = useRouter();
  const dialogRef = useRef(null);
  const discordRef = useRef(null);
  const previousFocusRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const loadingRef = useRef(false);
  onCloseRef.current = onClose;

  const [discordUsername, setDiscordUsername] = useState('');
  const [redeemCode,      setRedeemCode]       = useState('');
  const [applying,        setApplying]         = useState(false);
  const [applied,         setApplied]          = useState(null); // { code, discountAmount, finalPrice }
  const [codeError,       setCodeError]        = useState('');
  const [loading,         setLoading]          = useState(false);
  const [error,           setError]            = useState('');
  const [isGift,          setIsGift]           = useState(false);
  const [giftUsername,    setGiftUsername]     = useState('');
  const [giftPlatform,    setGiftPlatform]     = useState('java');
  const [giftPlayer,      setGiftPlayer]       = useState(null);
  const [giftChecking,    setGiftChecking]     = useState(false);

  const finalPrice = applied?.finalPrice ?? product.price;
  const discount    = applied?.discountAmount ?? 0;
  loadingRef.current = loading;

  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => discordRef.current?.focus(), 60);

    const handleKeyDown = event => {
      if (event.key === 'Escape' && !loadingRef.current) {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll('button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus?.();
    };
  }, []);

  const handleApplyCode = async () => {
    if (!redeemCode.trim()) return;
    setApplying(true); setCodeError(''); setApplied(null);
    try {
      const res  = await fetch('/api/orders/apply-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: redeemCode.trim(), productId: product.id, price: product.price }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setApplied({ code: data.code, discountAmount: data.discountAmount, finalPrice: data.finalPrice });
        toast.success('Kode redeem berhasil dipakai!');
      } else {
        setCodeError(data.message || 'Kode tidak valid');
      }
    } catch {
      setCodeError('Gagal memeriksa kode. Coba lagi.');
    }
    setApplying(false);
  };

  const handleCheckout = async (e) => {
    e.preventDefault();
    if (!discordUsername.trim()) { setError('Username Discord wajib diisi'); return; }
    if (isGift && !giftPlayer) { setError('Periksa dan konfirmasi player penerima terlebih dahulu'); return; }
    setLoading(true); setError('');

    try {
      const res  = await fetch('/api/orders/create-core', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          productId:        product.id,
          discord_username: discordUsername.trim(),
          redeemCode:       applied?.code || undefined,
          is_gift:          isGift,
          gift_username:    isGift ? giftPlayer?.username : undefined,
          gift_platform:    isGift ? giftPlatform : undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.message || 'Gagal membuat order. Coba lagi.');
        setLoading(false);
        return;
      }

      const { orderId } = data;

      router.push(`/invoice/${orderId}`);
      return;

    } catch (e2) {
      setError(e2.message || 'Terjadi kesalahan. Coba lagi.');
      setLoading(false);
      return;
    }
    setLoading(false);
  };

  const checkGiftPlayer = async () => {
    if (!giftUsername.trim()) return;
    setGiftChecking(true); setGiftPlayer(null); setError('');
    try {
      const response = await fetch('/api/plugin/check-player', {
        method:'POST', credentials:'include', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ username:giftUsername.trim(), platform:giftPlatform }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Player tidak ditemukan');
      if (String(result.player.username).toLowerCase() === String(player?.username || '').toLowerCase()) throw new Error('Pilih player lain sebagai penerima gift');
      setGiftPlayer(result.player);
      toast.success(`Penerima ${result.player.displayName || result.player.username} terverifikasi`);
    } catch (checkError) { setError(checkError.message || 'Gagal memeriksa player'); }
    setGiftChecking(false);
  };

  return (
    <div className="fn-modal-overlay" role="presentation" onClick={e => { if (e.target === e.currentTarget && !loading) onClose(); }}>
      <div ref={dialogRef} className="fn-modal" role="dialog" aria-modal="true" aria-labelledby="checkout-title">

        {/* Top accent bar */}
        <div className="cart-modal-topbar"/>

        <div className="cart-modal-body">

          {/* Header */}
          <div className="cart-modal-head">
            <div>
              <h2 id="checkout-title" className="font-space cart-modal-title">Checkout</h2>
              <p className="cart-modal-subtitle">Selesaikan pembelian kamu</p>
            </div>
            <button type="button" onClick={onClose} disabled={loading} className="cart-modal-close" aria-label="Tutup checkout">
              <Icon name="xmark" size={14}/>
            </button>
          </div>

          {/* Product summary */}
          <div className="cart-summary">
            <Icon name="cart-shopping" size={18} color="var(--primary)"/>
            <div className="cart-summary-info">
              <p className="cart-summary-name">{product.name}</p>
              {player && <p className="cart-summary-for">untuk {isGift && giftPlayer ? (giftPlayer.displayName || giftPlayer.username) : (player.displayName || player.username)}</p>}
            </div>
            <div className="cart-summary-price-wrap">
              {discount > 0 && (
                <p className="cart-summary-old-price">{idr(product.price)}</p>
              )}
              <p className="cart-summary-price">{idr(finalPrice)}</p>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="cart-error">
              <Icon name="circle-exclamation" size={13} color="#e74c3c" className="cart-error-icon"/>
              <p className="cart-error-text">{error}</p>
            </div>
          )}

          <form onSubmit={handleCheckout}>
            <div className="cart-gift-box">
              <button type="button" className={`cart-gift-toggle${isGift ? ' active' : ''}`} onClick={()=>{setIsGift(v=>!v);setGiftPlayer(null);setError('');}} disabled={loading}>
                <span><Icon name="gift" size={16}/></span>
                <div><strong>Gift untuk player lain</strong><small>Produk akan dikirim ke akun Minecraft penerima.</small></div>
                <i aria-hidden="true"/>
              </button>
              {isGift && (
                <div className="cart-gift-fields">
                  <div className="cart-platform-switch">
                    {['java','bedrock'].map(platform=><button key={platform} type="button" className={giftPlatform===platform?'active':''} onClick={()=>{setGiftPlatform(platform);setGiftPlayer(null);}}>{platform === 'java' ? 'Java Edition' : 'Bedrock Edition'}</button>)}
                  </div>
                  <div className="cart-code-row">
                    <input className="fn-input cart-code-input" value={giftUsername} onChange={e=>{setGiftUsername(e.target.value);setGiftPlayer(null);}} placeholder={giftPlatform==='bedrock'?'Nickname Bedrock':'Username Java'} maxLength={32} disabled={loading||giftChecking}/>
                    <button type="button" className="btn-primary-fn cart-apply-btn" onClick={checkGiftPlayer} disabled={!giftUsername.trim()||giftChecking||loading}>{giftChecking?<span className="fn-spinner fn-spinner-sm"/>:'Periksa'}</button>
                  </div>
                  {giftPlayer && <div className="cart-gift-verified"><Icon name="circle-check" size={14}/><span><strong>{giftPlayer.displayName || giftPlayer.username}</strong><small>{giftPlatform === 'java' ? 'Java Edition' : 'Bedrock Edition'} · {giftPlayer.rank || 'default'}</small></span></div>}
                </div>
              )}
            </div>
            {/* Discord username */}
            <div className="cart-field">
              <label className="cart-field-label">
                <Icon name="discord" size={12} className="cart-field-icon"/>
                Username Discord
              </label>
              <input ref={discordRef} type="text" value={discordUsername} onChange={e => setDiscordUsername(e.target.value)}
                placeholder="contoh: nama.discord"
                className="fn-input" maxLength={40} autoComplete="off" required disabled={loading}/>
              <p className="cart-field-hint">Dipakai untuk klaim role di Discord server</p>
            </div>

            {/* Redeem code */}
            <div className="cart-field tight">
              <label className="cart-field-label">
                <Icon name="ticket" size={12} className="cart-field-icon"/>
                Kode Redeem (opsional)
              </label>
              <div className="cart-code-row">
                <input type="text" value={redeemCode}
                  onChange={e => { setRedeemCode(e.target.value); setApplied(null); setCodeError(''); }}
                  placeholder="Masukkan kode" className="fn-input cart-code-input" disabled={loading || applying}/>
                <button type="button" onClick={handleApplyCode} disabled={loading || applying || !redeemCode.trim() || !!applied}
                  className="btn-primary-fn cart-apply-btn">
                  {applying ? <span className="fn-spinner fn-spinner-sm"/> : (applied ? 'Terpakai' : 'Terapkan')}
                </button>
              </div>
              {codeError && <p className="cart-code-error">{codeError}</p>}
              {applied && <p className="cart-code-success">Diskon {idr(applied.discountAmount)} berhasil diterapkan</p>}
            </div>

            {/* Info strip */}
            <div className="cart-info-strip">
              <Icon name="lock" size={13} color="var(--primary)" className="cart-info-icon"/>
              <span>Pembayaran aman melalui QRIS Midtrans. Kode QR akan langsung tersedia di halaman invoice.</span>
            </div>

            <button type="submit" className="btn-primary-fn cart-submit-btn" disabled={loading || !discordUsername.trim() || (isGift && !giftPlayer)}>
              {loading
                ? <><span className="fn-spinner fn-spinner-sm"/> Memproses...</>
                : <><Icon name="lock" size={13} className="fn-icon-mr"/> Bayar {idr(finalPrice)}</>
              }
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
