/**
 * pages/api/orders/invoice-pdf/[orderId].js
 * Generate invoice sebagai PDF (PDFKit) untuk di-download user dari halaman invoice.
 * Logo mengikuti settings.logo_url (sama seperti navbar/favicon), fallback ke teks "FANCY NETWORK".
 */
import { OrdersAsync, SettingsAsync } from '../../../../lib/redis.js';

const STATUS_LABEL = {
  success:'LUNAS', settlement:'LUNAS', capture:'LUNAS', paid:'LUNAS',
  pending:'MENUNGGU', failed:'GAGAL', cancelled:'DIBATALKAN', cancel:'DIBATALKAN',
  expired:'KADALUARSA', expire:'KADALUARSA', deny:'DITOLAK',
};
const STATUS_COLORS = {
  success:[34,197,94], settlement:[34,197,94], capture:[34,197,94], paid:[34,197,94],
  pending:[245,158,11],
  failed:[239,68,68], deny:[239,68,68],
  cancelled:[107,114,128], cancel:[107,114,128],
  expired:[107,114,128], expire:[107,114,128],
};

export default async function handler(req, res) {
  const { orderId } = req.query;

  let order, settings;
  try {
    [order, settings] = await Promise.all([
      OrdersAsync.byId(orderId),
      SettingsAsync.get(),
    ]);
  } catch (e) {
    return res.status(500).json({ success:false, message:e.message });
  }
  if (!order) return res.status(404).json({ success:false, message:'Order tidak ditemukan' });

  let PDFDocument;
  try {
    const mod = await import('pdfkit');
    PDFDocument = mod.default || mod;
  } catch {
    return res.status(500).json({ success:false, message:'pdfkit belum diinstall' });
  }

  const s          = settings || {};
  const serverName = s.server_name || 'Fancy Network';
  const sName      = (serverName||'NETWORK').replace(/fancy/gi,'').trim()||'NETWORK';

  const idrFmt     = v => `Rp ${Number(v||0).toLocaleString('id-ID')}`;
  const subtotal   = (order.amount||0) + (order.discount_amount||0);
  const discount   = order.discount_amount||0;
  const total      = order.amount||0;
  const statusLbl  = STATUS_LABEL[order.payment_status] || (order.payment_status||'').toUpperCase();
  const formatDate = iso => iso ? new Date(iso).toLocaleString('id-ID',{day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}) + ' WIB' : '-';
  const [sr,sg,sb] = STATUS_COLORS[order.payment_status] || [107,114,128];

  // ── Coba ambil logo dari settings.logo_url ────────────────────
  let logoBuffer = null;
  if (s.logo_url) {
    try {
      const r = await fetch(s.logo_url, { signal: AbortSignal.timeout(8000) });
      if (r.ok) logoBuffer = Buffer.from(await r.arrayBuffer());
    } catch (e) {
      console.error('[invoice-pdf] gagal ambil logo:', e.message);
    }
  }

  const doc    = new PDFDocument({ size:'A4', margin:50, info:{ Title:`Invoice #${order.order_id}`, Author:`${serverName} Store` } });
  const chunks = [];
  doc.on('data', c => chunks.push(c));
  doc.on('error', e => { if (!res.headersSent) res.status(500).end(); });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="invoice-${order.order_id}.pdf"`);

  doc.on('end', () => res.end(Buffer.concat(chunks)));

  const W      = doc.page.width - 100;
  const LEFT   = 50;
  const RIGHT  = doc.page.width - 50;
  const ORANGE = '#FF6B00';
  const GRAY   = '#888888';
  const BLACK  = '#111111';
  const LINE   = '#EEEEEE';

  // ── Header ──────────────────────────────────────────────────
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, LEFT, 45, { width:44, height:44, fit:[44,44] });
      doc.fontSize(18).fillColor(ORANGE).font('Helvetica-Bold').text('FANCY', LEFT+54, 50, { continued:true })
         .fillColor(BLACK).text(' '+sName.toUpperCase());
      doc.fontSize(10).fillColor(GRAY).font('Helvetica').text(serverName, LEFT+54, 74);
    } catch {
      doc.fontSize(22).fillColor(ORANGE).font('Helvetica-Bold').text('FANCY', LEFT, 50, { continued:true })
         .fillColor(BLACK).text(' '+sName.toUpperCase());
      doc.fontSize(10).fillColor(GRAY).font('Helvetica').text(serverName, LEFT, 78);
    }
  } else {
    doc.fontSize(22).fillColor(ORANGE).font('Helvetica-Bold').text('FANCY', LEFT, 50, { continued:true })
       .fillColor(BLACK).text(' '+sName.toUpperCase());
    doc.fontSize(10).fillColor(GRAY).font('Helvetica').text(serverName, LEFT, 78);
  }

  doc.fontSize(24).fillColor(BLACK).font('Helvetica-Bold').text('INVOICE', RIGHT-120, 50, { width:120, align:'right' });
  doc.fontSize(11).fillColor(GRAY).font('Helvetica').text(`#${order.order_id}`, RIGHT-200, 82, { width:200, align:'right' });

  const badgeW = 110, badgeH = 22, badgeX = RIGHT - badgeW, badgeY = 95;
  doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 4).fillAndStroke(`rgb(${sr},${sg},${sb})`, `rgb(${sr},${sg},${sb})`);
  doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica-Bold')
     .text(statusLbl, badgeX, badgeY+6, { width:badgeW, align:'center' });

  doc.fillColor(GRAY).fontSize(9).font('Helvetica')
     .text(formatDate(order.created_at), RIGHT-200, 123, { width:200, align:'right' });

  let y = 140;
  doc.moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(1.5).strokeColor(ORANGE).stroke();
  y += 18;

  // ── Info Grid ───────────────────────────────────────────────
  const col1X = LEFT, col2X = LEFT + W/2 + 10;

  doc.fontSize(8).fillColor(ORANGE).font('Helvetica-Bold')
     .text('DITAGIH KEPADA', col1X, y, { characterSpacing:1 });
  y += 14;
  doc.fontSize(12).fillColor(BLACK).font('Helvetica-Bold').text(order.player_username||'-', col1X, y);
  y += 16;
  if (order.discord_username) {
    doc.fontSize(10).fillColor(GRAY).font('Helvetica').text(`Discord: ${order.discord_username}`, col1X, y);
    y += 14;
  }
  if (order.player_rank && order.player_rank !== 'default') {
    doc.fontSize(10).fillColor(GRAY).font('Helvetica').text(`Rank: ${order.player_rank}`, col1X, y);
    y += 14;
  }

  let ry = 158;
  doc.fontSize(8).fillColor(ORANGE).font('Helvetica-Bold')
     .text('DETAIL TRANSAKSI', col2X, ry, { characterSpacing:1 });
  ry += 14;
  const details = [
    ['Tanggal',  formatDate(order.created_at)],
    ['Metode',   order.payment_method||'QRIS'],
    ['Order ID', order.order_id],
    ...(order.redeem_code ? [['Kode Redeem', order.redeem_code]] : []),
  ];
  for (const [lbl, val] of details) {
    const valW = RIGHT - col2X - 85;
    doc.fontSize(9).fillColor(GRAY).font('Helvetica').text(lbl, col2X, ry, { width:80 });
    doc.fontSize(9).fillColor(BLACK).font('Helvetica-Bold').text(val, col2X+85, ry, { width: valW });
    const lines = Math.ceil(doc.widthOfString(val, { font:'Helvetica-Bold', size:9 }) / valW) || 1;
    ry += Math.max(13, lines*12 + 1);
  }

  y = Math.max(y, ry) + 20;

  // ── Tabel Produk ────────────────────────────────────────────
  doc.rect(LEFT, y, W, 24).fillColor('#F9F9F9').fill();
  doc.moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(1).strokeColor('#DDDDDD').stroke();
  doc.moveTo(LEFT, y+24).lineTo(RIGHT, y+24).strokeColor('#DDDDDD').stroke();

  const col = { desc:LEFT+8, cat:LEFT+W*0.55, price:RIGHT-8 };
  doc.fontSize(8).fillColor(GRAY).font('Helvetica-Bold')
     .text('DESKRIPSI PRODUK', col.desc, y+8)
     .text('KATEGORI', col.cat, y+8)
     .text('HARGA', col.price, y+8, { align:'right' });
  y += 24;

  const rowH = 32;
  doc.rect(LEFT, y, W, rowH).fillColor('#FFFFFF').fill();
  doc.moveTo(LEFT, y+rowH).lineTo(RIGHT, y+rowH).lineWidth(0.5).strokeColor(LINE).stroke();

  doc.fontSize(11).fillColor(BLACK).font('Helvetica-Bold').text(order.product_name||'-', col.desc, y+11, { width:W*0.5 });

  const catLabel = order.category_name||'Produk';
  const catW = Math.min(catLabel.length*7+16, 100);
  doc.roundedRect(col.cat, y+7, catW, 18, 3).fillColor('#FFF3E8').fill();
  doc.fontSize(9).fillColor(ORANGE).font('Helvetica-Bold').text(catLabel, col.cat+4, y+11, { width:catW-8, align:'center' });

  doc.fontSize(11).fillColor(BLACK).font('Helvetica-Bold')
     .text(idrFmt(subtotal), LEFT, y+11, { width:W-8, align:'right' });
  y += rowH;

  if (discount > 0) {
    doc.rect(LEFT, y, W, 40).fillColor('#F0FDF4').fill();
    doc.moveTo(LEFT, y+40).lineTo(RIGHT, y+40).lineWidth(0.5).strokeColor(LINE).stroke();
    doc.fontSize(11).fillColor('#22A85A').font('Helvetica-Bold').text('Diskon Kode Redeem', col.desc, y+8, { width:W*0.5 });
    doc.fontSize(9).fillColor(GRAY).font('Helvetica').text(`Kode: ${order.redeem_code}`, col.desc, y+22, { width:W*0.5 });
    const dW = 50;
    doc.roundedRect(col.cat, y+10, dW, 18, 3).fillColor('#DCFCE7').fill();
    doc.fontSize(9).fillColor('#22A85A').font('Helvetica-Bold').text('Diskon', col.cat+2, y+14, { width:dW-4, align:'center' });
    doc.fontSize(11).fillColor('#22A85A').font('Helvetica-Bold')
       .text(`-${idrFmt(discount)}`, LEFT, y+14, { width:W-8, align:'right' });
    y += 40;
  }
  y += 12;

  // ── Summary ─────────────────────────────────────────────────
  const sumX = LEFT + W*0.55, sumW = W*0.45;
  const rows = [
    ['Subtotal',              idrFmt(order.amount||0), BLACK],
    ...(discount>0 ? [['Diskon Redeem', `-${idrFmt(discount)}`, '#22A85A']] : []),
  ];
  for (const [lbl,val,color] of rows) {
    doc.fontSize(10).fillColor(GRAY).font('Helvetica').text(lbl, sumX, y, { width:sumW*0.6 });
    doc.fontSize(10).fillColor(color).font('Helvetica').text(val, sumX+sumW*0.6, y, { width:sumW*0.4, align:'right' });
    y += 16;
  }

  doc.moveTo(sumX, y).lineTo(RIGHT, y).lineWidth(1.5).strokeColor(BLACK).stroke();
  y += 8;
  doc.fontSize(14).fillColor(BLACK).font('Helvetica-Bold').text('Total Pembayaran', sumX, y);
  doc.fontSize(14).fillColor(ORANGE).font('Helvetica-Bold').text(idrFmt(total), sumX, y, { width:sumW, align:'right' });
  y += 28;

  // ── Status delivered ────────────────────────────────────────
  if (['success','settlement','capture','paid'].includes(order.payment_status)) {
    const chipColor = order.plugin_notified ? '#22A85A' : '#F59E0B';
    const chipBg    = order.plugin_notified ? '#F0FDF4' : '#FFFBEB';
    const chipText  = order.plugin_notified ? 'Item telah dikirim ke server Minecraft' : 'Menunggu pengiriman item ke server';
    doc.roundedRect(LEFT, y, 280, 22, 4).fillColor(chipBg).fill();
    doc.fontSize(9).fillColor(chipColor).font('Helvetica-Bold').text(chipText, LEFT+8, y+6, { width:264 });
    y += 30;
  }

  // ── Footer ──────────────────────────────────────────────────
  doc.moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(0.5).strokeColor(LINE).stroke();
  y += 10;
  doc.fontSize(8).fillColor(GRAY).font('Helvetica')
     .text(`Dokumen ini digenerate otomatis oleh ${serverName} Store \u00b7 Simpan sebagai bukti pembayaran resmi.`, LEFT, y, { width:W, align:'center' });

  doc.end();
}
