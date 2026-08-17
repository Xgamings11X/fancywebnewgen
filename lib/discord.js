import DISCORD_EMOJIS from './discord-emojis.js';

/**
 * lib/discord.js — v3.0 (Bagian 3/4 — Final)
 *
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  DUAL-CHANNEL DISCORD WEBHOOK SYSTEM                        ║
 * ║                                                              ║
 * ║  ENV di .env.local:                                         ║
 * ║  DISCORD_WEBHOOK_ADMIN   → semua status + PDF invoice       ║
 * ║  DISCORD_WEBHOOK_PLAYER  → hanya Success, tanpa PDF         ║
 * ║  DISCORD_WEBHOOK_REPORT  → tiket support (tidak berubah)    ║
 * ║                                                              ║
 * ║  Skin Head API:                                             ║
 * ║  Java    → https://minotar.net/helm/<username>/64           ║
 * ║  Bedrock → https://api.geysermc.org/v2/skin/<xuid>/face     ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Install: npm install pdfkit
 */

// ─────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────

const idr = (v) => `Rp ${Number(v || 0).toLocaleString('id-ID')}`;

/**
 * Konfigurasi per status — warna sidebar embed dipilih agar
 * kontras dan profesional:
 *  Success   → Hijau   #57F287  (Discord green, paling mencolok)
 *  Pending   → Kuning  #FEE75C  (Discord yellow, perhatian)
 *  Failed    → Merah   #ED4245  (Discord red, bahaya)
 *  Cancelled → Abu     #95A5A6  (netral, tidak aktif)
 *  Expired   → Ungu    #9B59B6  (waktu habis, gelap elegan)
 */
const STATUS_CONFIG = {
  success:    { color: 0x57F287, label: 'LUNAS',       labelId: 'Transaksi Berhasil',   dot: DISCORD_EMOJIS.DONE },
  settlement: { color: 0x57F287, label: 'LUNAS',       labelId: 'Transaksi Berhasil',   dot: DISCORD_EMOJIS.DONE },
  capture:    { color: 0x57F287, label: 'LUNAS',       labelId: 'Transaksi Berhasil',   dot: DISCORD_EMOJIS.CEKLIS },
  paid:       { color: 0x57F287, label: 'LUNAS',       labelId: 'Transaksi Berhasil',   dot: DISCORD_EMOJIS.CHECK },
  pending:    { color: 0xFEE75C, label: 'MENUNGGU',    labelId: 'Menunggu Pembayaran',  dot: DISCORD_EMOJIS.LOADING },
  failed:     { color: 0xED4245, label: 'GAGAL',       labelId: 'Transaksi Gagal',      dot: DISCORD_EMOJIS.WARN },
  deny:       { color: 0xED4245, label: 'DITOLAK',     labelId: 'Transaksi Ditolak',    dot: DISCORD_EMOJIS.WARNING },
  cancelled:  { color: 0x95A5A6, label: 'DIBATALKAN',  labelId: 'Transaksi Dibatalkan', dot: DISCORD_EMOJIS.OFFLINE },
  cancel:     { color: 0x95A5A6, label: 'DIBATALKAN',  labelId: 'Transaksi Dibatalkan', dot: DISCORD_EMOJIS.OFFLINE },
  expired:    { color: 0x9B59B6, label: 'KADALUARSA',  labelId: 'Transaksi Kadaluarsa', dot: DISCORD_EMOJIS.MAINTENANCE },
  expire:     { color: 0x9B59B6, label: 'KADALUARSA',  labelId: 'Transaksi Kadaluarsa', dot: DISCORD_EMOJIS.MAINTENANCE },
};

const SUCCESS_STATUSES = new Set(['success', 'settlement', 'capture', 'paid']);

function getPaymentEmoji(method) {
  const value = String(method || '').toLowerCase();
  if (value.includes('dana')) return DISCORD_EMOJIS.PAY_DANA;
  if (value.includes('ovo')) return DISCORD_EMOJIS.PAY_OVO;
  if (value.includes('gopay') || value.includes('go-pay')) return DISCORD_EMOJIS.PAY_GOPAY;
  if (value.includes('qris') || value.includes('qr')) return DISCORD_EMOJIS.PAY_QRIS;
  if (value.includes('bank') || value.includes('bca') || value.includes('bni') || value.includes('bri') || value.includes('mandiri') || value.includes('permata')) return DISCORD_EMOJIS.PAY_BANK;
  if (value.includes('paypal')) return DISCORD_EMOJIS.PAY_BENEFITS;
  return DISCORD_EMOJIS.PAY_MONEY;
}

// ─────────────────────────────────────────────────────────────────
// SKIN HEAD HELPER
// ─────────────────────────────────────────────────────────────────

function getSkinHeadUrl(order) {
  const username = order.player_username || 'Steve';
  const platform = order.player_platform || 'java';

  if (platform === 'bedrock') {
    if (order.player_uuid) {
      return `https://api.geysermc.org/v2/skin/${order.player_uuid}/face`;
    }
    const bedrockName = username.startsWith('.') ? username.slice(1) : username;
    return `https://minotar.net/helm/${encodeURIComponent(bedrockName)}/64`;
  }

  return `https://minotar.net/helm/${encodeURIComponent(username)}/64`;
}

// ─────────────────────────────────────────────────────────────────
// WEBHOOK SENDERS
// ─────────────────────────────────────────────────────────────────

async function sendEmbed(url, payload) {
  if (!url?.startsWith('http')) {
    console.warn('[discord] webhook URL kosong/tidak valid');
    return;
  }
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      console.error(`[discord] embed error ${r.status}:`, txt.slice(0, 300));
    }
  } catch (e) {
    console.error('[discord] sendEmbed:', e.message);
  }
}

async function sendFile(url, filename, buffer, mimeType, embedPayload) {
  if (!url?.startsWith('http')) return;
  try {
    const formData = new FormData();
    formData.append('payload_json', JSON.stringify(embedPayload));
    formData.append('files[0]', new Blob([buffer], { type: mimeType }), filename);
    const r = await fetch(url, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(25_000),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      console.error(`[discord] file error ${r.status}:`, txt.slice(0, 300));
    }
  } catch (e) {
    console.error('[discord] sendFile:', e.message);
  }
}

// ─────────────────────────────────────────────────────────────────
// EMBED BUILDERS
// ─────────────────────────────────────────────────────────────────

/**
 * buildPremiumEmbed — embed Player channel (Success only)
 *
 * Desain mengacu pada screenshot testimoni:
 * • Head skin sebagai thumbnail kanan
 * • Author bar dengan nama player
 * • Username (player) & Discord ditampilkan terpisah
 * • TRX ID monospace
 * • Tidak ada info teknis internal
 */
function buildPremiumEmbed(order, cfg) {
  const skinUrl = getSkinHeadUrl(order);

  const formatDate = (iso) =>
    iso
      ? new Date(iso).toLocaleString('id-ID', {
          day: '2-digit', month: 'long', year: 'numeric',
          hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
        }) + ' WIB'
      : '-';

  const fields = [
    { name: `${DISCORD_EMOJIS.MINECRAFT} **USERNAME**`, value: `\`${order.player_username || '-'}\``, inline: true },
    { name: `${DISCORD_EMOJIS.CS} **DISCORD**`, value: `\`${order.discord_username || '-'}\``, inline: true },
    { name: `${DISCORD_EMOJIS.BUY} **PRODUK**`, value: String(order.product_name || '-'), inline: false },

    { name: '**TRX ID**',   value: `\`#${order.order_id}\``,                    inline: true },
    { name: `${getPaymentEmoji(order.payment_method)} **METODE**`, value: String(order.payment_method || 'QRIS').toUpperCase(), inline: true },

    { name: `${DISCORD_EMOJIS.MONEY} **HARGA**`, value: idr(order.amount), inline: true },
    { name: '**TANGGAL**',  value: formatDate(order.created_at),               inline: true },

    { name: '**STATUS**',   value: `${cfg.dot} **${cfg.label}**`,              inline: false },
  ];

  // Diskon (jika ada)
  if (order.discount_amount > 0) {
    fields.push({
      name: '**DISKON**',
      value: `-${idr(order.discount_amount)}  ·  kode: \`${order.redeem_code}\``,
      inline: false,
    });
  }

  return {
    author: {
      name: `${cfg.labelId}  ·  fancynet.my.id`,
      icon_url: skinUrl,
    },
    title: null,
    color: cfg.color,
    thumbnail: { url: skinUrl },
    description: `## ${cfg.dot}  ${cfg.labelId}\n${DISCORD_EMOJIS.RKPANAH} Terima kasih sudah melakukan transaksi di **Fancy Network**.\n${DISCORD_EMOJIS.CHECK} Pesanan kamu telah diproses dan tercatat sebagai transaksi resmi fancynet.my.id.`,
    fields,
    timestamp: new Date().toISOString(),
    footer: {
      text: 'fancynet.my.id  •  Trusted Transaction',
    },
  };
}

/**
 * buildAdminEmbed — embed Admin channel (semua status)
 *
 * Menambahkan info teknis internal:
 * UUID, rank, platform, reward_trigger, plugin status
 */
function buildAdminEmbed(order, cfg) {
  const skinUrl = getSkinHeadUrl(order);

  const formatDate = (iso) =>
    iso
      ? new Date(iso).toLocaleString('id-ID', {
          day: '2-digit', month: 'long', year: 'numeric',
          hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
        }) + ' WIB'
      : '-';

  let deliveryVal = `${DISCORD_EMOJIS.LOADING} Belum Diproses`;
  if (order.plugin_notified)    deliveryVal = `${DISCORD_EMOJIS.DONE} Terkirim`;
  else if (order.plugin_queued) deliveryVal = `${DISCORD_EMOJIS.LOADING} Antrian`;
  else if (SUCCESS_STATUSES.has(order.payment_status)) deliveryVal = `${DISCORD_EMOJIS.WARNING} Pending`;

  const fields = [
    { name: `${DISCORD_EMOJIS.MINECRAFT} **USERNAME**`, value: `\`${order.player_username || '-'}\``, inline: true },
    { name: `${DISCORD_EMOJIS.CS} **DISCORD**`, value: `\`${order.discord_username || '-'}\``, inline: true },
    { name: `${DISCORD_EMOJIS.BUY} **PRODUK**`, value: String(order.product_name || '-'), inline: false },

    { name: '**TRX ID**',   value: `\`#${order.order_id}\``,                    inline: true },
    { name: `${getPaymentEmoji(order.payment_method)} **METODE**`, value: String(order.payment_method || 'QRIS').toUpperCase(), inline: true },
    { name: `${DISCORD_EMOJIS.MONEY} **HARGA**`, value: idr(order.amount), inline: true },

    { name: '**TANGGAL**',  value: formatDate(order.created_at),               inline: true },
    { name: '**STATUS**',   value: `${cfg.dot} **${cfg.label}**`,              inline: true },
    { name: '**DELIVERY**', value: deliveryVal,                                inline: true },

    { name: '**PLATFORM**', value: (order.player_platform || 'java').toUpperCase(), inline: true },
    { name: '**RANK**',     value: String(order.player_rank || 'default'),     inline: true },
    { name: '**TRIGGER**',  value: `\`${order.reward_trigger || '-'}\``,       inline: true },
  ];

  if (order.player_uuid) {
    fields.push({
      name: '**UUID**',
      value: `\`${order.player_uuid}\``,
      inline: false,
    });
  }

  if (order.discount_amount > 0) {
    fields.push({
      name: '**DISKON**',
      value: `-${idr(order.discount_amount)}  ·  kode: \`${order.redeem_code}\``,
      inline: false,
    });
  }

  return {
    author: {
      name: `[ADMIN]  ${cfg.labelId}  ·  Order #${order.order_id}`,
      icon_url: skinUrl,
    },
    color: cfg.color,
    thumbnail: { url: skinUrl },
    description: `## ${DISCORD_EMOJIS.STAFF} ${cfg.dot}  ${cfg.labelId}\n${DISCORD_EMOJIS.MINECRAFT} **Username:** \`${order.player_username || '-'}\`  ·  ${DISCORD_EMOJIS.CS} **Discord:** \`${order.discord_username || '-'}\``,
    fields,
    timestamp: new Date().toISOString(),
    footer: {
      text: 'fancynet.my.id  •  Admin Log System',
    },
  };
}

// ─────────────────────────────────────────────────────────────────
// PDF INVOICE GENERATOR
// ─────────────────────────────────────────────────────────────────

async function generateInvoicePdf(order) {
  let PDFDocument;
  try {
    const mod = await import('pdfkit');
    PDFDocument = mod.default || mod;
  } catch {
    throw new Error('pdfkit belum diinstall. Jalankan: npm install pdfkit');
  }

  // ── Ambil settings (nama server + logo) — sama seperti invoice-pdf API ──
  let serverName = 'Fancy Network';
  let sName      = 'NETWORK';
  let logoBuffer = null;
  try {
    const { SettingsAsync } = await import('./redis.js');
    const s = await SettingsAsync.get();
    if (s?.server_name) {
      serverName = s.server_name;
      sName      = serverName.replace(/fancy/gi, '').trim() || 'NETWORK';
    }
    if (s?.logo_url) {
      try {
        const r = await fetch(s.logo_url, { signal: AbortSignal.timeout(8000) });
        if (r.ok) logoBuffer = Buffer.from(await r.arrayBuffer());
      } catch (e) {
        console.warn('[discord/pdf] gagal ambil logo:', e.message);
      }
    }
  } catch (e) {
    console.warn('[discord/pdf] gagal ambil settings:', e.message);
  }

  const idrFmt       = (v) => `Rp ${Number(v || 0).toLocaleString('id-ID')}`;
  const subtotal     = (order.amount || 0) + (order.discount_amount || 0);
  const discount     = order.discount_amount || 0;
  const total        = order.amount || 0;
  const statusLbl    = STATUS_CONFIG[order.payment_status]?.label ||
                       (order.payment_status || '').toUpperCase();
  const customerName = order.discord_username || order.player_username || '-';

  const formatDate = (iso) =>
    iso
      ? new Date(iso).toLocaleString('id-ID', {
          day: '2-digit', month: 'long', year: 'numeric',
          hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
        }) + ' WIB'
      : '-';

  const statusRgb = {
    success: [34, 197, 94],  settlement: [34, 197, 94],  capture: [34, 197, 94],  paid: [34, 197, 94],
    pending: [245, 158, 11],
    failed:  [239, 68, 68],  deny:       [239, 68, 68],
    cancelled:[107,114,128], cancel:     [107, 114, 128],
    expired: [107, 114, 128],expire:     [107, 114, 128],
  };
  const [sr, sg, sb] = statusRgb[order.payment_status] || [107, 114, 128];

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4', margin: 50,
      info: { Title: `Invoice #${order.order_id}`, Author: `${serverName} Store` },
    });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W      = doc.page.width - 100;
    const LEFT   = 50;
    const RIGHT  = doc.page.width - 50;
    const ORANGE = '#FF6B00';   // sama dengan invoice-pdf/[orderId].js
    const GRAY   = '#888888';
    const BLACK  = '#111111';
    const LINE   = '#EEEEEE';

    // ── Header — identik dengan invoice-pdf/[orderId].js ──
    if (logoBuffer) {
      try {
        doc.image(logoBuffer, LEFT, 45, { width: 44, height: 44, fit: [44, 44] });
        doc.fontSize(18).fillColor(ORANGE).font('Helvetica-Bold').text('FANCY', LEFT + 54, 50, { continued: true })
           .fillColor(BLACK).text(' ' + sName.toUpperCase());
        doc.fontSize(10).fillColor(GRAY).font('Helvetica').text(serverName, LEFT + 54, 74);
      } catch {
        doc.fontSize(22).fillColor(ORANGE).font('Helvetica-Bold').text('FANCY', LEFT, 50, { continued: true })
           .fillColor(BLACK).text(' ' + sName.toUpperCase());
        doc.fontSize(10).fillColor(GRAY).font('Helvetica').text(serverName, LEFT, 78);
      }
    } else {
      doc.fontSize(22).fillColor(ORANGE).font('Helvetica-Bold').text('FANCY', LEFT, 50, { continued: true })
         .fillColor(BLACK).text(' ' + sName.toUpperCase());
      doc.fontSize(10).fillColor(GRAY).font('Helvetica').text(serverName, LEFT, 78);
    }

    doc.fontSize(24).fillColor(BLACK).font('Helvetica-Bold').text('INVOICE', RIGHT - 120, 50, { width: 120, align: 'right' });
    doc.fontSize(11).fillColor(GRAY).font('Helvetica').text(`#${order.order_id}`, RIGHT - 200, 82, { width: 200, align: 'right' });

    const bW = 110, bH = 22, bX = RIGHT - bW, bY = 95;
    doc.roundedRect(bX, bY, bW, bH, 4)
       .fillAndStroke(`rgb(${sr},${sg},${sb})`, `rgb(${sr},${sg},${sb})`);
    doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica-Bold')
       .text(statusLbl, bX, bY + 6, { width: bW, align: 'center' });
    doc.fillColor(GRAY).fontSize(9).font('Helvetica')
       .text(formatDate(order.created_at), RIGHT - 200, 123, { width: 200, align: 'right' });

    let y = 140;
    doc.moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(1.5).strokeColor(ORANGE).stroke();
    y += 18;

    const col1X = LEFT, col2X = LEFT + W / 2 + 10;

    // Ditagih kepada
    doc.fontSize(8).fillColor(ORANGE).font('Helvetica-Bold')
       .text('DITAGIH KEPADA', col1X, y, { characterSpacing: 1 });
    y += 14;
    doc.fontSize(12).fillColor(BLACK).font('Helvetica-Bold').text(customerName, col1X, y);
    y += 16;
    doc.fontSize(10).fillColor(GRAY).font('Helvetica').text(`Minecraft: ${order.player_username || '-'}`, col1X, y);
    y += 14;
    if (order.player_rank && order.player_rank !== 'default') {
      doc.fontSize(10).fillColor(GRAY).font('Helvetica').text(`Rank: ${order.player_rank}`, col1X, y);
      y += 14;
    }

    let ry = 158;
    doc.fontSize(8).fillColor(ORANGE).font('Helvetica-Bold')
       .text('DETAIL TRANSAKSI', col2X, ry, { characterSpacing: 1 });
    ry += 14;
    const details = [
      ['Tanggal',  formatDate(order.created_at)],
      ['Metode',   (order.payment_method || 'QRIS').toUpperCase()],
      ['Order ID', order.order_id],
      ...(order.redeem_code ? [['Kode Redeem', order.redeem_code]] : []),
    ];
    for (const [lbl, val] of details) {
      const valW = RIGHT - col2X - 85;
      doc.fontSize(9).fillColor(GRAY).font('Helvetica').text(lbl, col2X, ry, { width: 80 });
      doc.fontSize(9).fillColor(BLACK).font('Helvetica-Bold').text(val, col2X + 85, ry, { width: valW });
      const lines = Math.ceil(doc.widthOfString(val, { font: 'Helvetica-Bold', size: 9 }) / valW) || 1;
      ry += Math.max(13, lines * 12 + 1);
    }

    y = Math.max(y, ry) + 20;

    // Tabel produk
    doc.rect(LEFT, y, W, 24).fillColor('#F9F9F9').fill();
    doc.moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(1).strokeColor('#DDDDDD').stroke();
    doc.moveTo(LEFT, y + 24).lineTo(RIGHT, y + 24).strokeColor('#DDDDDD').stroke();
    const col = { desc: LEFT + 8, cat: LEFT + W * 0.55, price: RIGHT - 8 };
    doc.fontSize(8).fillColor(GRAY).font('Helvetica-Bold')
       .text('DESKRIPSI PRODUK', col.desc, y + 8)
       .text('KATEGORI', col.cat, y + 8)
       .text('HARGA', col.price, y + 8, { align: 'right' });
    y += 24;

    const rowH = 32;
    doc.rect(LEFT, y, W, rowH).fillColor('#FFFFFF').fill();
    doc.moveTo(LEFT, y + rowH).lineTo(RIGHT, y + rowH).lineWidth(0.5).strokeColor(LINE).stroke();
    doc.fontSize(11).fillColor(BLACK).font('Helvetica-Bold')
       .text(order.product_name || '-', col.desc, y + 11, { width: W * 0.5 });
    const catLabel = order.category_name || 'Produk';
    const catW = Math.min(catLabel.length * 7 + 16, 100);
    doc.roundedRect(col.cat, y + 7, catW, 18, 3).fillColor('#FFF3E8').fill();
    doc.fontSize(9).fillColor(ORANGE).font('Helvetica-Bold')
       .text(catLabel, col.cat + 4, y + 11, { width: catW - 8, align: 'center' });
    doc.fontSize(11).fillColor(BLACK).font('Helvetica-Bold')
       .text(idrFmt(subtotal), LEFT, y + 11, { width: W - 8, align: 'right' });
    y += rowH;

    if (discount > 0) {
      doc.rect(LEFT, y, W, 40).fillColor('#F0FDF4').fill();
      doc.moveTo(LEFT, y + 40).lineTo(RIGHT, y + 40).lineWidth(0.5).strokeColor(LINE).stroke();
      doc.fontSize(11).fillColor('#22A85A').font('Helvetica-Bold')
         .text('Diskon Kode Redeem', col.desc, y + 8, { width: W * 0.5 });
      doc.fontSize(9).fillColor(GRAY).font('Helvetica')
         .text(`Kode: ${order.redeem_code}`, col.desc, y + 22, { width: W * 0.5 });
      const dW = 50;
      doc.roundedRect(col.cat, y + 10, dW, 18, 3).fillColor('#DCFCE7').fill();
      doc.fontSize(9).fillColor('#22A85A').font('Helvetica-Bold')
         .text('Diskon', col.cat + 2, y + 14, { width: dW - 4, align: 'center' });
      doc.fontSize(11).fillColor('#22A85A').font('Helvetica-Bold')
         .text(`-${idrFmt(discount)}`, LEFT, y + 14, { width: W - 8, align: 'right' });
      y += 40;
    }
    y += 12;

    // Summary
    const sumX = LEFT + W * 0.55, sumW = W * 0.45;
    const rows = [
      ['Subtotal', idrFmt(order.amount || 0), BLACK],
      ...(discount > 0 ? [['Diskon Redeem', `-${idrFmt(discount)}`, '#22A85A']] : []),
    ];
    for (const [lbl, val, color] of rows) {
      doc.fontSize(10).fillColor(GRAY).font('Helvetica').text(lbl, sumX, y, { width: sumW * 0.6 });
      doc.fontSize(10).fillColor(color).font('Helvetica').text(val, sumX + sumW * 0.6, y, { width: sumW * 0.4, align: 'right' });
      y += 16;
    }
    doc.moveTo(sumX, y).lineTo(RIGHT, y).lineWidth(1.5).strokeColor(BLACK).stroke();
    y += 8;
    doc.fontSize(14).fillColor(BLACK).font('Helvetica-Bold').text('Total Pembayaran', sumX, y);
    doc.fontSize(14).fillColor(ORANGE).font('Helvetica-Bold')
       .text(idrFmt(total), sumX, y, { width: sumW, align: 'right' });
    y += 28;

    if (SUCCESS_STATUSES.has(order.payment_status)) {
      const chipColor = order.plugin_notified ? '#22A85A' : '#F59E0B';
      const chipBg    = order.plugin_notified ? '#F0FDF4' : '#FFFBEB';
      const chipText  = order.plugin_notified
        ? '✓ Item telah dikirim ke server Minecraft'
        : '⏳ Menunggu pengiriman item ke server';
      doc.roundedRect(LEFT, y, 280, 22, 4).fillColor(chipBg).fill();
      doc.fontSize(9).fillColor(chipColor).font('Helvetica-Bold')
         .text(chipText, LEFT + 8, y + 6, { width: 264 });
      y += 30;
    }

    doc.moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(0.5).strokeColor(LINE).stroke();
    y += 10;
    doc.fontSize(8).fillColor(GRAY).font('Helvetica')
       .text(`Dokumen ini digenerate otomatis oleh ${serverName} Store · Simpan sebagai bukti pembayaran resmi.`, LEFT, y, { width: W, align: 'center' });

    doc.end();
  });
}

// ─────────────────────────────────────────────────────────────────
// MAIN EXPORT: webhookTransaction
// ─────────────────────────────────────────────────────────────────

/**
 * Routing:
 *
 *  ADMIN (DISCORD_WEBHOOK_ADMIN)
 *    → Semua status + embed mendalam + PDF invoice
 *
 *  PLAYER (DISCORD_WEBHOOK_PLAYER)
 *    → Hanya Success + embed premium + tanpa PDF
 */
export async function webhookTransaction(order) {
  const adminUrl  = process.env.DISCORD_WEBHOOK_ADMIN || process.env.DISCORD_WEBHOOK_TX;
  const playerUrl = process.env.DISCORD_WEBHOOK_PLAYER;

  const s   = order.payment_status || 'pending';
  const cfg = STATUS_CONFIG[s] || {
    color: 0xf97316, label: s.toUpperCase(), labelId: 'Update Transaksi', dot: DISCORD_EMOJIS.ATTENTION,
  };

  const isSuccess = SUCCESS_STATUSES.has(s);

  // ── 1. ADMIN — semua status, dengan PDF ───────────────────────
  if (adminUrl) {
    const adminEmbed = buildAdminEmbed(order, cfg);
    const adminContent = `${DISCORD_EMOJIS.STAFF} ${cfg.dot} **[${cfg.label}]**  ·  \`${order.player_username}\`  ·  Discord: \`${order.discord_username || '-'}\`  ·  Order: \`${order.order_id}\``;

    // Generate & kirim PDF
    let pdfBuffer = null;
    try {
      pdfBuffer = await generateInvoicePdf(order);
    } catch (e) {
      console.error('[discord] Gagal generate PDF:', e.message);
    }

    if (pdfBuffer) {
      await sendFile(adminUrl, `invoice-${order.order_id}.pdf`, pdfBuffer, 'application/pdf', {
        content: adminContent,
        embeds: [adminEmbed],
      });
    } else {
      await sendEmbed(adminUrl, {
        content: adminContent,
        embeds: [adminEmbed],
      });
    }
  } else {
    console.warn('[discord] DISCORD_WEBHOOK_ADMIN tidak di-set');
  }

  // ── 2. PLAYER — hanya Success, tanpa PDF ─────────────────────
  if (isSuccess && playerUrl) {
    const playerEmbed   = buildPremiumEmbed(order, cfg);
    const customerName  = order.discord_username || order.player_username || '-';
    const playerContent = `${DISCORD_EMOJIS.BUY} Hei **${customerName}**! ${DISCORD_EMOJIS.DONE} Transaksi kamu berhasil diproses oleh **Fancy Network**.`;

    await sendEmbed(playerUrl, {
      content: playerContent,
      embeds: [playerEmbed],
    });
  }
}

// ─────────────────────────────────────────────────────────────────
// WEBHOOK: TIKET BARU
// ─────────────────────────────────────────────────────────────────

export async function webhookReport(ticket) {
  const url = process.env.DISCORD_WEBHOOK_REPORT;
  if (!url) return;
  const types = {
    banding: '⚖️ Aju Banding', bug: '🐛 Report Bug',
    report_player: '🚨 Report Pemain', lainnya: '📝 Lainnya',
  };
  await sendEmbed(url, {
    content: `${DISCORD_EMOJIS.ATTENTION} Tiket baru: \`${ticket.ticket_id}\` dari **${ticket.player_username}**`,
    embeds: [{
      title: `${DISCORD_EMOJIS.CS} ${types[ticket.type] || ticket.type} — Tiket Baru`,
      color: 0xf97316,
      fields: [
        { name: `${DISCORD_EMOJIS.RKPANAH} Ticket ID`, value: `\`${ticket.ticket_id}\``,                  inline: true },
        { name: `${DISCORD_EMOJIS.MINECRAFT} Player`,    value: String(ticket.player_username),              inline: true },
        { name: `${DISCORD_EMOJIS.EXCLAMATION} Subjek`,    value: String(ticket.subject),                      inline: false },
        { name: `${DISCORD_EMOJIS.CS} Deskripsi`, value: String(ticket.description || '').slice(0, 500), inline: false },
        ...(ticket.target_player ? [{ name: '🎯 Target', value: ticket.target_player, inline: true }] : []),
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'fancynet.my.id Support' },
    }],
  });
}

// ─────────────────────────────────────────────────────────────────
// WEBHOOK: ARSIP TIKET
// ─────────────────────────────────────────────────────────────────

export async function webhookTicketArchive(ticket) {
  const url = process.env.DISCORD_WEBHOOK_REPORT;
  if (!url) return;
  const types  = { banding: 'Aju Banding', bug: 'Report Bug', report_player: 'Report Pemain', lainnya: 'Lainnya' };
  const colors = { resolved: 0x2ecc71, rejected: 0xe74c3c, expired: 0x95a5a6 };
  const lines  = [
    `===== ARSIP TIKET: ${ticket.ticket_id} =====`,
    `Tipe    : ${types[ticket.type] || ticket.type}`,
    `Player  : ${ticket.player_username}`,
    `Subjek  : ${ticket.subject}`,
    `Status  : ${ticket.status}`,
    `Dibuat  : ${ticket.created_at}`,
    `Update  : ${ticket.updated_at}`,
    ticket.target_player ? `Target  : ${ticket.target_player}` : null,
    ticket.admin_notes   ? `Catatan : ${ticket.admin_notes}`   : null,
    '', '===== PERCAKAPAN =====',
    ...(ticket.messages || []).map((m) => {
      const time = m.created_at ? new Date(m.created_at).toLocaleString('id-ID') : '';
      return `[${time}] ${m.sender_type === 'admin' ? '[ADMIN]' : '[PLAYER]'} ${m.sender}: ${m.text}`;
    }),
    '', '===== SELESAI =====',
  ].filter(Boolean).join('\n');

  await sendFile(url, `${ticket.ticket_id}.txt`, Buffer.from(lines, 'utf-8'), 'text/plain; charset=utf-8', {
    content: `${DISCORD_EMOJIS.DONE} Arsip tiket \`${ticket.ticket_id}\` (${ticket.player_username}) — Status: **${ticket.status}**`,
    embeds: [{
      title: `${DISCORD_EMOJIS.FIXED} Arsip: ${ticket.ticket_id}`,
      color: colors[ticket.status] || 0x95a5a6,
      fields: [
        { name: '👤 Player', value: ticket.player_username,               inline: true },
        { name: '📋 Subjek', value: ticket.subject,                       inline: true },
        { name: '📊 Status', value: ticket.status,                        inline: true },
        { name: '💬 Pesan',  value: String((ticket.messages || []).length), inline: true },
        { name: '📅 Dibuat', value: ticket.created_at?.slice(0, 10) || '-', inline: true },
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'fancynet.my.id Support — Auto Cleanup' },
    }],
  });
}

// ─────────────────────────────────────────────────────────────────
// WEBHOOK: CLEANUP LOG TRANSAKSI (Admin only)
// ─────────────────────────────────────────────────────────────────

export async function webhookOrderArchive(orders) {
  const url = process.env.DISCORD_WEBHOOK_ADMIN || process.env.DISCORD_WEBHOOK_TX;
  if (!url) return;

  const successCount = orders.filter((o) => SUCCESS_STATUSES.has(o.payment_status)).length;
  const failCount    = orders.filter((o) =>
    ['failed', 'expired', 'expire', 'cancelled', 'cancel', 'deny'].includes(o.payment_status)
  ).length;

  const lines = [
    'Fancynet Store — Arsip Log Transaksi',
    `Tanggal cleanup: ${new Date().toISOString()}`,
    `Total: ${orders.length} transaksi`, '',
    ...orders.map((o) => [
      `Order   : ${o.order_id}`,
      `Player  : ${o.player_username}`,
      `Discord : ${o.discord_username || '-'}`,
      `Produk  : ${o.product_name}`,
      `Total   : Rp ${Number(o.amount || 0).toLocaleString('id-ID')}`,
      `Status  : ${o.payment_status}`,
      `Plugin  : ${o.plugin_notified ? 'Terkirim' : o.plugin_queued ? 'Antri' : 'Gagal'}`,
      `Tanggal : ${o.created_at?.slice(0, 19) || '-'}`,
      '---',
    ].join('\n')),
  ];

  const filename = `orders-cleanup-${new Date().toISOString().slice(0, 10)}.txt`;
  await sendFile(url, filename, Buffer.from(lines.join('\n'), 'utf-8'), 'text/plain', {
    content: `${DISCORD_EMOJIS.STAFF} **[ADMIN] Cleanup Log Transaksi** — ${orders.length} order diarsipkan`,
    embeds: [{
      title: `${DISCORD_EMOJIS.STAFF} Arsip Log Transaksi — Auto Cleanup`,
      color: 0xf97316,
      fields: [
        { name: '📊 Total',        value: String(orders.length), inline: true },
        { name: `${DISCORD_EMOJIS.DONE} Sukses/Lunas`, value: String(successCount),  inline: true },
        { name: `${DISCORD_EMOJIS.WARN} Gagal/Expired`,value: String(failCount),     inline: true },
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'Fancynet Store — Auto Cleanup System' },
    }],
  });
}
