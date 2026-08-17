/**
 * pages/api/orders/create-core.js
 *
 * Endpoint untuk Direct Checkout via Midtrans Core API (non-popup, non-Snap).
 * Dipanggil oleh components/CartModal.js setelah user memilih salah satu kartu
 * di components/PaymentMethodSelector.js (UI custom) lalu menekan tombol "Bayar".
 *
 * Charge ke Midtrans dilakukan oleh chargeCoreTransaction() di lib/midtrans.js
 * (memakai library resmi `midtrans-client`, struktur switch-case per metode).
 *
 * POST body:
 *   productId        {string}  — ID produk
 *   paymentMethod    {string}  — 'gopay_qris' | 'gopay' | 'bni_va' | 'bri_va' |
 *                                 'cimb_va' | 'permata_va' | 'mandiri_va'
 *   discord_username {string}  — wajib
 *   redeemCode       {string?} — opsional
 *
 * Response (success):
 *   { success, orderId, paymentMethod, paymentInfo, coreData, finalPrice, discountAmount }
 *
 *   paymentInfo berisi data SPESIFIK yang relevan untuk metode terpilih saja:
 *     - gopay_qris        → { qrImageUrl, qrString }
 *     - gopay              → { qrImageUrl, qrString, deeplinkUrl }
 *     - bni_va/bri_va/...  → { vaNumber, vaBank }
 *     - mandiri_va          → { billKey, billCode }
 */

import { ProductsAsync, OrdersAsync, RedeemCodesAsync } from '../../../lib/redis.js';
import {
  chargeCoreTransaction,
  extractPaymentInfo,
  PAYMENT_METHOD_CONFIG,
} from '../../../lib/midtrans.js';
import { verifyToken } from '../../../lib/auth.js';
import { webhookTransaction } from '../../../lib/discord.js';
import { parse } from 'cookie';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Auth
  const t    = parse(req.headers.cookie || '').token || req.headers.authorization?.replace('Bearer ', '');
  const user = verifyToken(t);
  if (!user || user.type !== 'player')
    return res.status(401).json({ success: false, message: 'Login terlebih dahulu' });

  const { productId, paymentMethod, redeemCode, discord_username } = req.body || {};

  if (!productId)
    return res.status(400).json({ success: false, message: 'productId diperlukan' });
  if (!discord_username?.trim())
    return res.status(400).json({ success: false, message: 'Username Discord wajib diisi untuk klaim role' });
  if (!paymentMethod || !PAYMENT_METHOD_CONFIG[paymentMethod])
    return res.status(400).json({ success: false, message: `Metode pembayaran tidak valid: ${paymentMethod}` });

  try {
    // ── Validasi produk ──────────────────────────────────────────────────
    const product = await ProductsAsync.byId(productId);
    if (!product || !product.is_active)
      return res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });
    if (!product.reward_trigger?.trim())
      return res.status(400).json({ success: false, message: 'Produk belum dikonfigurasi (reward_trigger kosong). Hubungi admin.' });

    // ── Cek batas pembelian ──────────────────────────────────────────────
    if (product.purchase_limit > 0) {
      const count = await OrdersAsync.purchaseCount(
        user.username, product.id,
        product.limit_scope || 'per_product', product.category_id
      );
      if (count >= product.purchase_limit)
        return res.status(400).json({ success: false, message: `Batas pembelian tercapai (max ${product.purchase_limit}x)` });
    }

    // ── Redeem code ──────────────────────────────────────────────────────
    let discountAmount = 0, finalPrice = product.price, usedCode = null;
    if (redeemCode) {
      const code = await RedeemCodesAsync.byCode(redeemCode);
      if (!code || !code.is_active)
        return res.status(400).json({ success: false, message: 'Kode tidak valid' });
      if (code.expires_at && new Date(code.expires_at) < new Date())
        return res.status(400).json({ success: false, message: 'Kode sudah kadaluarsa' });
      if (code.used_count >= code.max_uses)
        return res.status(400).json({ success: false, message: 'Kode sudah habis' });
      if (code.product_id && code.product_id !== product.id)
        return res.status(400).json({ success: false, message: 'Kode tidak berlaku untuk produk ini' });

      discountAmount = code.discount_type === 'percent'
        ? Math.floor(product.price * code.discount_value / 100)
        : code.discount_value;
      discountAmount = Math.min(discountAmount, product.price);
      finalPrice     = product.price - discountAmount;
      usedCode       = code.code;
    }

    // ── Buat order di DB ─────────────────────────────────────────────────
    const orderId   = `FN-${Date.now()}-${Math.random().toString(36).substring(2,6).toUpperCase()}`;
    const expiredAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    let categoryName = '';
    try {
      const { CategoriesAsync } = await import('../../../lib/redis.js');
      const cat = await CategoriesAsync.byId(product.category_id);
      categoryName = cat?.name || '';
    } catch {}

    await OrdersAsync.add({
      order_id:         orderId,
      player_username:  user.username,
      player_uuid:      user.uuid  || null,
      player_rank:      user.rank  || null,
      product_id:       product.id,
      category_id:      product.category_id,
      product_name:     product.name,
      category_name:    categoryName,
      reward_trigger:   product.reward_trigger || null,
      amount:           finalPrice,
      discount_amount:  discountAmount,
      redeem_code:      usedCode,
      discord_username: discord_username.trim(),
      payment_status:   'pending',
      payment_method:   paymentMethod,
      plugin_notified:  false,
      plugin_queued:    false,
      expired_at:       expiredAt,
    });

    // ── Discord webhook (pending) ────────────────────────────────────────
    try {
      const newOrder = await OrdersAsync.byId(orderId);
      await webhookTransaction(newOrder);
    } catch (e) {
      console.error('[create-core] Discord pending error:', e.message);
    }

    // ── Charge ke Midtrans Core API (switch-case per metode di lib/midtrans.js) ──
    const coreData = await chargeCoreTransaction({
      orderId,
      amount:        finalPrice,
      playerUsername: user.username,
      productName:   product.name,
      paymentMethod,
    });

    // Simpan transaction_id Midtrans + payment_info (VA/QR/deeplink) ke order
    const paymentInfo = extractPaymentInfo(coreData, paymentMethod);
    await OrdersAsync.update(orderId, {
      midtrans_transaction_id: coreData.transaction_id || orderId,
      payment_info: paymentInfo,   // { vaNumber?, qrUrl?, deeplinkUrl?, billKey?, billCode? }
    });

    // Redeem code increment
    if (usedCode) await RedeemCodesAsync.increment(usedCode);

    return res.json({
      success:         true,
      orderId,
      paymentMethod,
      paymentInfo,         // { vaNumber?, qrUrl?, deeplinkUrl?, billKey?, billCode? }
      coreData,            // raw response untuk kebutuhan debug / tambahan
      finalPrice,
      discountAmount,
    });

  } catch (e) {
    console.error('[create-core]', e.message);
    return res.status(500).json({ success: false, message: e.message });
  }
}
