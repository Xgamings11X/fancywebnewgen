// lib/midtrans.js
const isProd  = () => (process.env.MIDTRANS_ENV || process.env.NEXT_PUBLIC_MIDTRANS_ENV) === 'production';
const BASE    = () => isProd() ? 'https://app.midtrans.com' : 'https://app.sandbox.midtrans.com';
const API_BASE = () => isProd() ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com';
const AUTH    = () => 'Basic ' + Buffer.from((process.env.MIDTRANS_SERVER_KEY||'') + ':').toString('base64');

export async function createSnapTransaction({ orderId, amount, playerUsername, productName }) {
  const siteUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://fancynet.my.id';
  const res = await fetch(`${BASE()}/snap/v1/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: AUTH() },
    body: JSON.stringify({
      transaction_details: { order_id: orderId, gross_amount: amount },
      customer_details:    { first_name: playerUsername, email: `${playerUsername}@fancynet.my.id` },
      item_details: [{ id: orderId, price: amount, quantity: 1, name: productName.substring(0,50) }],
      enabled_payments: ['qris','gopay','bank_transfer','shopeepay'],
      expiry: { unit: 'hours', duration: 24 },
      callbacks: {
        finish:  `${siteUrl}/store?order=${orderId}&status=success`,
        error:   `${siteUrl}/store?order=${orderId}&status=error`,
        pending: `${siteUrl}/store?order=${orderId}&status=pending`,
      },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_messages?.join(', ') || 'Midtrans error');
  return { snapToken: data.token, redirectUrl: data.redirect_url };
}

export async function verifyWebhookSignature({ order_id, status_code, gross_amount, signature_key }) {
  const { createHash } = await import('crypto');
  const key  = process.env.MIDTRANS_SERVER_KEY || '';
  const hash = createHash('sha512').update(order_id+status_code+gross_amount+key).digest('hex');
  return hash === signature_key;
}

/**
 * Cek status transaksi langsung ke Midtrans Core API (GET /v2/{order_id}/status).
 * Dipakai sebagai FALLBACK polling di /api/orders/verify/[orderId] kalau
 * notifikasi webhook belum/gagal masuk. Response-nya berisi field yang sama
 * (order_id, status_code, gross_amount, signature_key, transaction_status, dst)
 * jadi bisa langsung diteruskan ke verifyWebhookSignature() / parseTransactionStatus().
 */
export async function getTransactionStatus(orderId) {
  const res  = await fetch(`${API_BASE()}/v2/${encodeURIComponent(orderId)}/status`, {
    headers: { Authorization: AUTH() },
  });
  const data = await res.json();
  // status_code 404 = transaksi belum/tidak ada di Midtrans, bukan error fatal
  if (!res.ok && data?.status_code !== '404') {
    throw new Error(data?.status_message || 'Gagal mengambil status transaksi Midtrans');
  }
  return data;
}

// ─────────────────────────────────────────────────────────────────
// CORE API — Direct Charge (non-Snap, dipakai create-core.js)
// ─────────────────────────────────────────────────────────────────
// Dipakai untuk checkout custom di mana user pilih metode pembayaran
// SENDIRI dari UI (bukan lewat popup Snap yang nampilin semua metode
// sekaligus). Charge langsung ke endpoint POST /v2/charge Midtrans,
// per payment_type berbeda-beda payload & response-nya.
//
// Catatan: Permata VA punya payment_type SENDIRI ('permata'), BUKAN
// bagian dari 'bank_transfer' seperti BNI/BRI/CIMB — ini konsisten
// dengan formatPaymentMethod() di atas yang juga men-special-case
// 'permata' terpisah dari 'bank_transfer'.

export const PAYMENT_METHOD_CONFIG = {
  gopay_qris: { label: 'QRIS',                          group: 'qris'     },
  gopay:      { label: 'GoPay',                          group: 'gopay'    },
  bni_va:     { label: 'BNI Virtual Account',            group: 'va', bank: 'bni'  },
  bri_va:     { label: 'BRI Virtual Account',            group: 'va', bank: 'bri'  },
  cimb_va:    { label: 'CIMB Niaga Virtual Account',     group: 'va', bank: 'cimb' },
  permata_va: { label: 'Permata Virtual Account',        group: 'permata'  },
  mandiri_va: { label: 'Mandiri Bill Payment',           group: 'echannel' },
};

export async function chargeCoreTransaction({ orderId, amount, playerUsername, productName, paymentMethod }) {
  const cfg = PAYMENT_METHOD_CONFIG[paymentMethod];
  if (!cfg) throw new Error(`Metode pembayaran tidak dikenali: ${paymentMethod}`);

  const base = {
    transaction_details: { order_id: orderId, gross_amount: amount },
    customer_details:    { first_name: playerUsername, email: `${playerUsername}@fancynet.my.id` },
    item_details: [{ id: orderId, price: amount, quantity: 1, name: (productName||'Item').substring(0,50) }],
  };

  let payload;
  switch (cfg.group) {
    case 'qris':
      payload = { ...base, payment_type: 'qris', qris: { acquirer: 'gopay' } };
      break;
    case 'gopay': {
      const siteUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://fancynet.my.id';
      payload = { ...base, payment_type: 'gopay',
        gopay: { enable_callback: true, callback_url: `${siteUrl}/invoice/${orderId}` } };
      break;
    }
    case 'va':
      payload = { ...base, payment_type: 'bank_transfer', bank_transfer: { bank: cfg.bank } };
      break;
    case 'permata':
      payload = { ...base, payment_type: 'permata' };
      break;
    case 'echannel':
      payload = { ...base, payment_type: 'echannel',
        echannel: { bill_info1: 'Pembayaran:', bill_info2: (productName||'Item').substring(0,30) } };
      break;
    default:
      throw new Error(`Konfigurasi metode pembayaran belum lengkap: ${paymentMethod}`);
  }

  const res  = await fetch(`${API_BASE()}/v2/charge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: AUTH() },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.status_message || data.error_messages?.join(', ') || 'Gagal charge transaksi Midtrans');
  return data;
}

/**
 * Ekstrak data pembayaran SPESIFIK dari raw response Midtrans, sesuai
 * metode yang dipilih — dipakai create-core.js untuk dikirim balik ke
 * frontend (QR image, nomor VA, deeplink, dst).
 */
export function extractPaymentInfo(coreData, paymentMethod) {
  const cfg     = PAYMENT_METHOD_CONFIG[paymentMethod];
  const actions = coreData?.actions || [];
  const findAction = name => actions.find(a => a.name === name)?.url || null;

  switch (cfg?.group) {
    case 'qris':
      return {
        qrImageUrl: findAction('generate-qr-code'),
        qrString:   coreData?.qr_string || null,
      };
    case 'gopay':
      return {
        qrImageUrl:  findAction('generate-qr-code'),
        qrString:    coreData?.qr_string || null,
        deeplinkUrl: findAction('deeplink-redirect'),
      };
    case 'va':
      return {
        vaNumber: coreData?.va_numbers?.[0]?.va_number || null,
        vaBank:   coreData?.va_numbers?.[0]?.bank || cfg.bank || null,
      };
    case 'permata':
      return {
        vaNumber: coreData?.permata_va_number || null,
        vaBank:   'permata',
      };
    case 'echannel':
      return {
        billKey:  coreData?.bill_key    || null,
        billCode: coreData?.biller_code || null,
      };
    default:
      return {};
  }
}

export function parseTransactionStatus({ transaction_status, fraud_status, payment_type }) {
  let status = 'pending';
  if (transaction_status === 'capture')    status = fraud_status==='accept' ? 'paid' : 'failed';
  else if (transaction_status === 'settlement') status = 'paid';
  else if (['cancel','deny','refund'].includes(transaction_status)) status = 'failed';
  else if (transaction_status === 'expire') status = 'expired';
  return { status, paymentType: payment_type };
}

// ─────────────────────────────────────────────────────────────────
// PAYMENT METHOD LABEL MAPPING
// ─────────────────────────────────────────────────────────────────
// Memetakan field mentah notifikasi Midtrans (payment_type, va_numbers,
// store, bank, dst.) menjadi label metode pembayaran yang rapi & spesifik.
//
// PENTING: fungsi ini HARUS hanya dipanggil oleh caller saat status
// transaksi sudah SUCCESS/SETTLEMENT (capture+accept atau settlement).
// Jangan dipanggil untuk status pending/deny/expire — di luar fungsi
// ini (lihat pages/api/orders/webhook.js) karena field seperti
// va_numbers/store bisa belum lengkap/berubah sebelum transaksi final.

const BANK_LABELS = {
  bca: 'BCA', bni: 'BNI', bri: 'BRI', mandiri: 'Mandiri',
  permata: 'Permata', cimb: 'CIMB Niaga', maybank: 'Maybank',
  bsi: 'BSI', danamon: 'Danamon', sahabat_sampoerna: 'Bank Sahabat Sampoerna',
};

const STORE_LABELS = { indomaret: 'Indomaret', alfamart: 'Alfamart' };

export function formatPaymentMethod(n = {}) {
  const type = n.payment_type;

  switch (type) {
    case 'bank_transfer': {
      // VA reguler: { va_numbers: [{ bank: 'bca', va_number: '...' }] }
      const bank = n.va_numbers?.[0]?.bank;
      return `Bank Transfer - ${BANK_LABELS[bank] || (bank ? bank.toUpperCase() : 'VA')}`;
    }
    case 'permata':
      // Permata VA punya struktur field berbeda (permata_va_number), bukan va_numbers[]
      return 'Bank Transfer - Permata';
    case 'echannel':
      // Mandiri Bill Payment
      return 'Bank Transfer - Mandiri (Bill Payment)';
    case 'cstore':
      return STORE_LABELS[n.store] || `Convenience Store - ${(n.store || '').toUpperCase()}`;
    case 'qris':
      return 'QRIS';
    case 'gopay':
      return 'GoPay';
    case 'shopeepay':
      return 'ShopeePay';
    case 'akulaku':
      return 'Akulaku PayLater';
    case 'kredivo':
      return 'Kredivo';
    case 'credit_card': {
      const bankLabel = n.bank ? ` (${BANK_LABELS[n.bank] || n.bank.toUpperCase()})` : '';
      return `Kartu Kredit/Debit${bankLabel}`;
    }
    default:
      return type ? type.replace(/_/g, ' ').toUpperCase() : 'Midtrans';
  }
}
