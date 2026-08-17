import { ProductsAsync, CategoriesAsync } from '../../../lib/redis.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  try {
    const [categories, allProds] = await Promise.all([
      CategoriesAsync.active(),
      ProductsAsync.active(),
    ]);
    categories.sort((a,b) => (a.sort_order||0)-(b.sort_order||0));
    allProds.sort((a,b)   => (a.sort_order||0)-(b.sort_order||0));

    // Build category map untuk O(1) lookup
    const catMap = Object.fromEntries(categories.map(c => [c.id, c]));
    const products = allProds.map(p => {
      const cat = catMap[p.category_id];
      return { ...p, category_name:cat?.name||null, category_slug:cat?.slug||null, category_icon:cat?.icon||null };
    });

    res.setHeader('Cache-Control', 'no-store');
    return res.json({ success:true, products, categories });
  } catch(e) {
    return res.status(500).json({ success:false, message:e.message });
  }
}
