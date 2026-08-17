// lib/snapClient.js
//
// Helper CLIENT-SIDE untuk memuat Midtrans Snap.js dan membuka popup
// pembayaran resmi Midtrans. Jangan diimpor dari kode server (API routes,
// getServerSideProps) — ini hanya berjalan di browser.
//
// Env yang dipakai (harus NEXT_PUBLIC_ karena dibaca di browser):
//   NEXT_PUBLIC_MIDTRANS_CLIENT_KEY
//   NEXT_PUBLIC_MIDTRANS_ENV = 'sandbox' | 'production'

let snapLoadingPromise = null;

export function loadMidtransSnap() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('loadMidtransSnap hanya bisa dipanggil di browser'));
  }
  if (window.snap) return Promise.resolve(window.snap);
  if (snapLoadingPromise) return snapLoadingPromise;

  const isProd     = process.env.NEXT_PUBLIC_MIDTRANS_ENV === 'production';
  const src        = isProd
    ? 'https://app.midtrans.com/snap/snap.js'
    : 'https://app.sandbox.midtrans.com/snap/snap.js';
  const clientKey  = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY || '';

  snapLoadingPromise = new Promise((resolve, reject) => {
    // PENTING: selalu buang tag <script> lama (kalau ada) sebelum bikin yang baru.
    // Browser cuma fire event 'load'/'error' SEKALI per elemen script — kalau
    // attempt sebelumnya gagal (mis. koneksi putus-putus) dan kita reuse tag
    // yang sama, listener baru di bawah ini tidak akan pernah terpanggil sama
    // sekali sehingga promise menggantung selamanya (retry jadi macet diam-diam,
    // tanpa error apapun). Dengan selalu mulai dari tag baru, setiap retry punya
    // kesempatan fresh untuk berhasil/gagal dengan jelas.
    const existing = document.querySelector('script[data-midtrans-snap]');
    if (existing) existing.remove();

    const script = document.createElement('script');
    script.src = src;
    script.setAttribute('data-client-key', clientKey);
    script.setAttribute('data-midtrans-snap', '1');
    script.async = true;

    const timeoutId = setTimeout(() => {
      script.remove();
      snapLoadingPromise = null;
      reject(new Error('Gagal memuat Midtrans Snap (timeout). Cek koneksi internet kamu lalu coba lagi.'));
    }, 15000);

    script.onload = () => {
      clearTimeout(timeoutId);
      if (!window.snap) {
        script.remove();
        snapLoadingPromise = null;
        reject(new Error('Gagal memuat Midtrans Snap. Coba lagi.'));
        return;
      }
      resolve(window.snap);
    };
    script.onerror = () => {
      clearTimeout(timeoutId);
      script.remove();
      snapLoadingPromise = null;
      reject(new Error('Gagal memuat Midtrans Snap. Cek koneksi internet kamu.'));
    };
    document.head.appendChild(script);
  });

  return snapLoadingPromise;
}

/**
 * Membuka popup pembayaran Midtrans Snap (BUKAN redirect, bukan
 * custom payment-method selector — popup resmi bawaan Midtrans yang
 * sudah berisi semua metode: QRIS, GoPay, ShopeePay, VA Bank, dll).
 */
export async function openSnapPopup(snapToken, callbacks = {}) {
  if (!snapToken) throw new Error('Snap token tidak tersedia');
  const snap = await loadMidtransSnap();
  if (!snap || typeof snap.pay !== 'function') {
    throw new Error('Midtrans Snap belum siap. Coba lagi.');
  }
  snap.pay(snapToken, callbacks);
}
