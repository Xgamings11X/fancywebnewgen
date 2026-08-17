import { CategoriesAsync, ProductsAsync } from '../../../lib/redis.js';
import { verifyToken } from '../../../lib/auth.js';
import { parse } from 'cookie';

function auth(req) {
  const t = parse(req.headers.cookie||'').admin_token || req.headers.authorization?.replace('Bearer ','');
  return verifyToken(t)?.type === 'admin';
}

export default async function handler(req, res) {
  if (!auth(req)) return res.status(401).json({ error:'Unauthorized' });
  try {
    if (req.method === 'GET') {
      const [allCats, allProds] = await Promise.all([CategoriesAsync.all(), ProductsAsync.all()]);
      const cats = allCats
        .sort((a,b) => (a.sort_order||0)-(b.sort_order||0))
        .map(c => ({
          ...c,
          product_count: allProds.filter(p => p.category_id===c.id && p.is_active).length,
        }));
      return res.json({ success:true, categories: cats });
    }

    if (req.method === 'POST') {
      const { name, icon, color, description, sort_order } = req.body;
      if (!name) return res.status(400).json({ success:false, message:'Nama wajib diisi' });
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'-'+Date.now();
      const newC = await CategoriesAsync.add({ name, slug, icon:icon||'📦', color:color||'orange',
        description:description||'', sort_order:parseInt(sort_order)||0 });
      return res.status(201).json({ success:true, id: newC.id });
    }

    if (req.method === 'PUT') {
      const { id, ...patch } = req.body;
      if (!id) return res.status(400).json({ success:false });
      await CategoriesAsync.update(id, patch);
      return res.json({ success:true });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      const allProds = await ProductsAsync.all();
      const count = allProds.filter(p => p.category_id===parseInt(id) && p.is_active).length;
      if (count > 0) return res.status(400).json({ success:false, message:`Ada ${count} produk aktif, pindahkan dulu.` });
      await CategoriesAsync.remove(id);
      return res.json({ success:true });
    }

    if (req.method === 'PATCH') {
      const { action, ids } = req.body;
      if (action === 'reorder') {
        if (!Array.isArray(ids)) return res.status(400).json({ success:false });
        const all = await CategoriesAsync.all();
        const idMap = Object.fromEntries(all.map(c => [String(c.id), c]));
        const reordered = ids.map((cid, idx) => ({ ...idMap[String(cid)], sort_order: idx + 1 }));
        const idsSet = new Set(ids.map(String));
        const rest = all.filter(c => !idsSet.has(String(c.id)));
        await CategoriesAsync.save([...reordered, ...rest]);
        return res.json({ success:true });
      }
      return res.status(400).json({ success:false, message:'Unknown action' });
    }

    return res.status(405).end();
  } catch(e) {
    return res.status(500).json({ success:false, message: e.message });
  }
}
