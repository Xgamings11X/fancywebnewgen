import { ProductsAsync, CategoriesAsync } from '../../../lib/redis.js';
import { verifyToken } from '../../../lib/auth.js';
import { parse } from 'cookie';

function auth(req) {
  const t = parse(req.headers.cookie||'').admin_token || req.headers.authorization?.replace('Bearer ','');
  return verifyToken(t)?.type === 'admin';
}

/** Hitung original_price dari harga jual + persen diskon
 *  Jika discount=20%, original = price / 0.8 = price * 1.25
 */
function calcOriginalPrice(price, discountPercent) {
  if (!discountPercent || discountPercent <= 0 || discountPercent >= 100) return null;
  return Math.round(price / (1 - discountPercent / 100));
}

export default async function handler(req, res) {
  if (!auth(req)) return res.status(401).json({ error:'Unauthorized' });
  try {
    if (req.method === 'GET') {
      const [products, categories] = await Promise.all([ProductsAsync.all(), CategoriesAsync.all()]);
      const catMap = Object.fromEntries(categories.map(c=>[c.id,c]));
      return res.json({ success:true, products: products
        .sort((a,b) => (a.sort_order||0)-(b.sort_order||0))
        .map(p => ({
          ...p,
          category_name: catMap[p.category_id]?.name||null,
          category_slug: catMap[p.category_id]?.slug||null,
          category_icon: catMap[p.category_id]?.icon||null,
        }))});
    }

    if (req.method === 'POST') {
      const { name, category_id, description, price, discount_percent,
              image_url, badge, badge_color, reward_trigger,
              purchase_limit, limit_scope, sort_order, features } = req.body;
      if (!name || price===undefined || price==='')
        return res.status(400).json({ success:false, message:'Nama dan harga wajib diisi' });
      const priceInt = parseInt(price);
      const newP = await ProductsAsync.add({
        name, category_id: category_id ? parseInt(category_id) : null,
        description: description||null, price: priceInt,
        discount_percent: parseInt(discount_percent)||0,
        original_price: calcOriginalPrice(priceInt, parseInt(discount_percent)||0),
        image_url: image_url||null, badge: badge||null, badge_color: badge_color||'orange',
        reward_trigger: reward_trigger||null,
        purchase_limit: parseInt(purchase_limit)||0, limit_scope: limit_scope||'per_product',
        sort_order: parseInt(sort_order)||0,
        features: Array.isArray(features) ? features : [],
        is_active: true,
      });
      return res.status(201).json({ success:true, id:newP.id });
    }

    if (req.method === 'PUT') {
      const { id, ...patch } = req.body;
      if (!id) return res.status(400).json({ success:false, message:'ID diperlukan' });
      if (patch.price !== undefined) patch.price = parseInt(patch.price);
      if (patch.discount_percent !== undefined) {
        patch.discount_percent = parseInt(patch.discount_percent)||0;
        patch.original_price   = calcOriginalPrice(patch.price || 0, patch.discount_percent);
      }
      if (patch.category_id !== undefined)    patch.category_id    = patch.category_id ? parseInt(patch.category_id) : null;
      if (patch.features !== undefined)       patch.features       = Array.isArray(patch.features) ? patch.features : [];
      if (patch.purchase_limit !== undefined) patch.purchase_limit = parseInt(patch.purchase_limit)||0;
      if (patch.is_active !== undefined)      patch.is_active      = patch.is_active===true||patch.is_active===1||patch.is_active==='1';
      await ProductsAsync.update(id, patch);
      return res.json({ success:true });
    }

    if (req.method === 'DELETE') {
      const { id, permanent } = req.query;
      if (!id) return res.status(400).json({ success:false, message:'ID diperlukan' });
      if (permanent==='1') await ProductsAsync.remove(id);
      else await ProductsAsync.update(id, { is_active: false });
      return res.json({ success:true });
    }

    if (req.method === 'PATCH') {
      const { id, action, ids } = req.body;
      if (action === 'reorder') {
        if (!Array.isArray(ids)) return res.status(400).json({ success:false });
        // Save entire array in the new position order (fixes input-reset bug)
        const all = await ProductsAsync.all();
        const idMap = Object.fromEntries(all.map(p => [String(p.id), p]));
        const reordered = ids.map((pid, idx) => ({ ...idMap[String(pid)], sort_order: idx + 1 }));
        const idsSet = new Set(ids.map(String));
        const rest = all.filter(p => !idsSet.has(String(p.id)));
        await ProductsAsync.save([...reordered, ...rest]);
        return res.json({ success:true });
      }
      if (action === 'duplicate') {
        const p = await ProductsAsync.byId(id);
        if (!p) return res.status(404).json({ success:false });
        await ProductsAsync.add({ ...p, name:p.name+' (Copy)', is_active:false });
        return res.json({ success:true });
      }
      if (action === 'toggle') {
        const p = await ProductsAsync.byId(id);
        if (!p) return res.status(404).json({ success:false });
        await ProductsAsync.update(id, { is_active:!p.is_active });
        return res.json({ success:true });
      }
    }

    return res.status(405).end();
  } catch(e) {
    return res.status(500).json({ success:false, message:e.message });
  }
}
