/**
 * pages/api/orders/create-core.js
 *
 * Endpoint checkout QRIS-only via Midtrans Core API (non-popup, non-Snap).
 *
 * Charge ke Midtrans dilakukan oleh chargeCoreTransaction() di lib/midtrans.js
 * (memakai library resmi `midtrans-client`, struktur switch-case per metode).
 *
 * POST body:
 *   productId        {string}  — ID produk
 *   discord_username {string}  — wajib
 *   redeemCode       {string?} — opsional
 *
 * Response (success):
 *   { success, orderId, paymentMethod, paymentInfo, finalPrice, discountAmount }
 *
 *   paymentInfo: { qrImageUrl, qrString }
 */

import { ProductsAsync, OrdersAsync, RedeemCodesAsync } from '../../../lib/redis.js';
import {
  chargeCoreTransaction,
  extractPaymentInfo,
  PAYMENT_METHOD_CONFIG,
} from '../../../lib/midtrans.js';
import { verifyMinecraftPlayer, verifyToken } from '../../../lib/auth.js';
import { webhookTransaction } from '../../../lib/discord.js';
import { parse } from 'cookie';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Auth
  const t    = parse(req.headers.cookie || '').token || req.headers.authorization?.replace('Bearer ', '');
  const user = verifyToken(t);
  if (!user || user.type !== 'player')
    return res.status(401).json({ success: false, message: 'Login terlebih dahulu' });

  const { productId, redeemCode, discord_username, is_gift, gift_username, gift_platform } = req.body || {};
  const paymentMethod = 'gopay_qris';

  if (!productId)
    return res.status(400).json({ success: false, message: 'productId diperlukan' });
  if (!discord_username?.trim())
    return res.status(400).json({ success: false, message: 'Username Discord wajib diisi untuk klaim role' });
  if (!PAYMENT_METHOD_CONFIG[paymentMethod])
    return res.status(500).json({ success: false, message: 'QRIS belum dikonfigurasi' });

  try {
    // ── Validasi produk ──────────────────────────────────────────────────
    const product = await ProductsAsync.byId(productId);
    if (!product || !product.is_active)
      return res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });
    if (!product.reward_trigger?.trim())
      return res.status(400).json({ success: false, message: 'Produk belum dikonfigurasi (reward_trigger kosong). Hubungi admin.' });

    let recipient = {
      username: user.username,
      uuid: user.uuid || null,
      rank: user.rank || 'default',
      platform: user.platform === 'bedrock' ? 'bedrock' : 'java',
    };
    const isGift = is_gift === true;
    if (isGift) {
      const targetName = String(gift_username || '').trim();
      const targetPlatform = gift_platform === 'bedrock' ? 'bedrock' : 'java';
      if (!targetName) return res.status(400).json({ success:false, message:'Username penerima wajib diisi' });
      const verified = await verifyMinecraftPlayer(targetName, targetPlatform);
      if (!verified.success) return res.status(400).json({ success:false, message:verified.message });
      if (String(verified.player.username).toLowerCase() === String(user.username).toLowerCase()) {
        return res.status(400).json({ success:false, message:'Pilih player lain sebagai penerima gift' });
      }
      recipient = verified.player;
    }

    // ── Cek batas pembelian untuk player penerima ───────────────────────
    if (product.purchase_limit > 0) {
      const count = await OrdersAsync.purchaseCount(
        recipient.username, product.id,
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
      buyer_username:   user.username,
      buyer_uuid:       user.uuid || null,
      buyer_platform:   user.platform || 'java',
      player_username:  recipient.username,
      player_uuid:      recipient.uuid || null,
      player_rank:      recipient.rank || null,
      player_platform:  recipient.platform || 'java',
      is_gift:          isGift,
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
      payment_method:   'QRIS',
      plugin_notified:  false,
      plugin_queued:    false,
      expired_at:       expiredAt,
    });

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
      payment_info: paymentInfo,
    });

    try {
      const newOrder = await OrdersAsync.byId(orderId);
      await webhookTransaction(newOrder);
    } catch (e) {
      console.error('[create-core] Discord pending error:', e.message);
    }

    // Redeem code increment
    if (usedCode) await RedeemCodesAsync.increment(usedCode);

    return res.json({
      success:         true,
      orderId,
      paymentMethod,
      paymentInfo,         // { vaNumber?, qrUrl?, deeplinkUrl?, billKey?, billCode? }
      finalPrice,
      discountAmount,
    });

  } catch (e) {
    console.error('[create-core]', e.message);
    return res.status(500).json({ success: false, message: e.message });
  }
}
