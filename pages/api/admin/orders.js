import { OrdersAsync } from '../../../lib/redis.js';
import { verifyToken } from '../../../lib/auth.js';
import { notifyTransaction } from '../../../lib/plugin.js';
import { webhookOrderArchive } from '../../../lib/discord.js';
import { parse } from 'cookie';

function auth(req) {
  const t = parse(req.headers.cookie||'').admin_token || req.headers.authorization?.replace('Bearer ','');
  return verifyToken(t)?.type === 'admin';
}

export default async function handler(req, res) {
  if (!auth(req)) return res.status(401).json({ error:'Unauthorized' });
  try {
    if (req.method === 'GET') {
      const { status, page=1, limit=50 } = req.query;
      let orders = (await OrdersAsync.all()).sort((a,b) => (b.created_at||'').localeCompare(a.created_at||''));
      if (status && status!=='all') orders = orders.filter(o => o.payment_status===status);
      const total = orders.length;
      const start = (parseInt(page)-1)*parseInt(limit);
      orders = orders.slice(start, start+parseInt(limit));

      const all    = await OrdersAsync.all();
      const stats  = {
        total:   all.length,
        success: all.filter(o=>o.payment_status==='success').length,
        pending: all.filter(o=>o.payment_status==='pending').length,
        failed:  all.filter(o=>['failed','expired'].includes(o.payment_status)).length,
        revenue: all.filter(o=>o.payment_status==='success').reduce((s,o)=>s+parseInt(o.amount||0),0),
      };
      return res.json({ success:true, orders, total, stats });
    }

    if (req.method === 'POST') {
      const { orderId, action } = req.body;

      if (action === 'delete_all') {
        const all = await OrdersAsync.all();
        if (all.length === 0) return res.json({ success:true, deleted:0, message:'Tidak ada order' });
        // Arsip ke Discord dulu
        try { await webhookOrderArchive(all); } catch(e) { console.error('[delete_all] archive error:', e.message); }
        // Hapus semua
        for (const o of all) await OrdersAsync.delete(o.order_id);
        return res.json({ success:true, deleted:all.length });
      }

      const order = await OrdersAsync.byId(orderId);
      if (!order) return res.status(404).json({ success:false, message:'Order tidak ditemukan' });

      if (action === 'retry_plugin') {
        const r = await notifyTransaction({
          transaction_id: order.order_id,
          player_name:    order.player_username || '',
          product_id:     order.reward_trigger || String(order.product_id),
          amount:         order.amount,
          status:         'success',
          timestamp:      new Date().toISOString(),
        });
        await OrdersAsync.update(orderId, { plugin_notified:r.ok, plugin_response:JSON.stringify(r) });
        return res.json({ success:r.ok, result:r });
      }
      if (action === 'update_status') {
        await OrdersAsync.update(orderId, { payment_status:req.body.status });
        return res.json({ success:true });
      }
    }
    return res.status(405).end();
  } catch(e) { return res.status(500).json({ success:false, message:e.message }); }
}
