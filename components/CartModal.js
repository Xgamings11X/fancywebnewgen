/**
 * components/CartModal.js
 *
 * Modal checkout. Alurnya:
 *  1. Pemain isi Username Discord (wajib, untuk klaim role) + kode redeem (opsional)
 *  2. Klik "Bayar Sekarang" → POST /api/orders/create → order dibuat (status: pending)
 *     dan snapToken-nya sudah ikut disimpan di order tsb.
 *  3. Langsung diarahkan ke /invoice/[orderId]?autopay=1 — popup pembayaran
 *     RESMI Midtrans (Snap.js) baru dibuka DI HALAMAN INVOICE itu
 *     (lihat pages/invoice/[orderId].js), bukan di sini.
 *
 *     Kenapa dipindah ke invoice dulu, bukan dibuka langsung di modal ini:
 *     order sudah pasti tersimpan & punya halaman permanen sebelum popup
 *     dibuka, jadi kalau Snap.js gagal dimuat (internet putus-putus / ad-blocker)
 *     pemain tidak "nyasar" — mereka tetap di halaman invoice (status: pending)
 *     dan tinggal klik "Bayar Sekarang" lagi di sana untuk retry, bukan
 *     kehilangan jejak order-nya di tengah modal checkout.
 *  4. Setelah pembayaran selesai di popup, halaman invoice yang sama otomatis
 *     berubah jadi status "success" (lewat verifikasi + polling), tanpa
 *     perlu redirect lagi.
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
    setLoading(true); setError('');

    try {
      const res  = await fetch('/api/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          productId:        product.id,
          discord_username: discordUsername.trim(),
          redeemCode:       applied?.code || undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.message || 'Gagal membuat order. Coba lagi.');
        setLoading(false);
        return;
      }

      const { orderId } = data;

      // Order sudah dibuat (status: pending) — arahkan ke halaman invoice dulu.
      // Popup Midtrans Snap akan otomatis terbuka DI SANA (lihat efek "autopay"
      // di pages/invoice/[orderId].js) begitu halamannya selesai dimuat.
      router.push(`/invoice/${orderId}?autopay=1`);
      return;

    } catch (e2) {
      setError(e2.message || 'Terjadi kesalahan. Coba lagi.');
      setLoading(false);
      return;
    }
    setLoading(false);
  };

  return (
    <div className="fn-modal-overlay" role="presentation" onClick={e => { if (e.target === e.currentTarget && !loading) onClose(); }}>
      <div ref={dialogRef} className="fn-modal animate-in" role="dialog" aria-modal="true" aria-labelledby="checkout-title">

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
              {player && <p className="cart-summary-for">untuk {player.displayName || player.username}</p>}
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
              <span>Pembayaran diproses lewat popup resmi Midtrans — QRIS, GoPay, ShopeePay, dan VA Bank tersedia langsung di dalamnya.</span>
            </div>

            <button type="submit" className="btn-primary-fn cart-submit-btn" disabled={loading || !discordUsername.trim()}>
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
