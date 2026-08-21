/**
 * lib/storage.js — File-based JSON storage (no database)
 * Semua data disimpan di folder /data/*.json
 * Thread-safe via atomic write (temp file → rename)
 */
import fs   from 'fs';
import path from 'path';

// Prioritas DATA_DIR:
// 1. ENV DATA_DIR (set manual di .env.local / Pterodactyl Variables)
// 2. /home/container/data  → Pterodactyl default home
// 3. /app/data             → VPS Docker / pm2 umum
// 4. /tmp/data             → Vercel / serverless (read-only filesystem)
// 5. ./data                → development lokal
function resolveDataDir() {
  if (process.env.DATA_DIR) return path.resolve(process.env.DATA_DIR);
  // Pterodactyl: home directory biasanya /home/container
  if (fs.existsSync('/home/container')) return '/home/container/data';
  // VPS: jika project jalan di /app
  if (fs.existsSync('/app') && !process.env.VERCEL) return '/app/data';
  // Vercel / serverless: filesystem read-only kecuali /tmp
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) return '/tmp/data';
  // Local development: keep mutable data OUTSIDE the Next.js project so
  // file writes do not trigger Fast Refresh / full reload loops.
  if (process.env.NODE_ENV === 'development') return path.resolve(process.cwd(), '..', 'fancy-network-runtime-data');
  // Production fallback: bundled data directory.
  return path.resolve(process.cwd(), 'data');
}
const DATA_DIR = resolveDataDir();

// Pastikan folder data ada
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Default data untuk setiap file
const DEFAULTS = {
  'settings.json': {
    server_name: 'Fancy Network',
    server_ip: 'play.fancynet.my.id',
    bedrock_ip: 'play.fancynet.my.id',
    bedrock_port: '19026',
    server_description: 'Fancy Network — Server Minecraft Indonesia dengan fitur Economy, RPG, dan Keep Inventory. Mendukung Java & Bedrock versi 1.20+. Bergabung sekarang di play.fancynet.my.id (Port Bedrock: 19026)',
    discord_url: '', vote_url: '', tiktok_url: '', youtube_url: '', whatsapp_url: '',
    hero_title: 'Selamat Datang di Fancy Network',
    hero_subtitle: 'Economy Semi RPG — Rank, Weapon, SellWand & lebih banyak!',
    famous_apply_url: '',
    announcement: '',
    logo_text: 'Fancy Network', logo_icon: '⚔️', logo_url: '',
    bg_desktop: '', bg_mobile: '',
    footer_text: '© 2024 Fancy Network. All rights reserved.',
    mc_status_url: 'https://api.mcsrvstat.us/3/play.fancynet.my.id:19026',
    plugin_http_url: '', plugin_server_key: '',
    webhook_transaction_url: '', webhook_report_url: '',
  },
  'categories.json': [
    { id:1, name:'Rank',       slug:'rank',       icon:'👑', color:'green',  description:'Rank eksklusif',       sort_order:1, is_active:true },
    { id:2, name:'Weapon',     slug:'weapon',     icon:'⚔️', color:'red',    description:'Senjata powerful',     sort_order:2, is_active:true },
    { id:3, name:'SellWand',   slug:'sellwand',   icon:'🪄', color:'green',  description:'Jual item otomatis',   sort_order:3, is_active:true },
    { id:4, name:'AuraSkills', slug:'auraskills', icon:'✨', color:'purple', description:'Boost skill RPG',      sort_order:4, is_active:true },
    { id:5, name:'Crate Key',  slug:'crate-key',  icon:'🗝️', color:'yellow', description:'Kunci crate langka',  sort_order:5, is_active:true },
    { id:6, name:'Kit',        slug:'kit',        icon:'🎒', color:'blue',   description:'Starter kit lengkap', sort_order:6, is_active:true },
  ],
  'products.json':  [],
  'orders.json':    [],
  'redeem_codes.json': [],
  'support_tickets.json': [],
};

/** Baca file JSON, return default jika belum ada */
export function readData(filename) {
  const filepath = path.join(DATA_DIR, filename);
  try {
    if (!fs.existsSync(filepath)) {
      const def = DEFAULTS[filename];
      try { writeData(filename, def); } catch {} // best-effort seed
      return structuredClone ? structuredClone(def) : JSON.parse(JSON.stringify(def));
    }
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch (e) {
    console.error(`[storage] readData ${filename}:`, e.message);
    return DEFAULTS[filename] ?? {};
  }
}

/** Tulis file JSON secara atomic (temp → rename) */
export function writeData(filename, data) {
  const filepath = path.join(DATA_DIR, filename);
  const tmp      = filepath + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, filepath);
  } catch (e) {
    console.error(`[storage] writeData ${filename}:`, e.message);
    throw e;
  }
}

// ── Helpers per entitas ──────────────────────────────────────

export const Settings = {
  get:    ()      => readData('settings.json'),
  set:    (patch) => { const s = Settings.get(); writeData('settings.json', { ...s, ...patch }); },
  getKey: (key, fallback='') => Settings.get()[key] ?? fallback,
};

export const Categories = {
  all:    ()     => readData('categories.json'),
  active: ()     => Categories.all().filter(c => c.is_active === true || c.is_active === 1),
  byId:   (id)   => Categories.all().find(c => c.id === parseInt(id)),
  save:   (cats) => writeData('categories.json', cats),
  nextId: ()     => { const all = Categories.all(); return all.length ? Math.max(...all.map(c=>c.id))+1 : 1; },

  add(cat) {
    const cats = Categories.all();
    const newCat = { ...cat, id: Categories.nextId(), is_active: true, created_at: new Date().toISOString() };
    cats.push(newCat);
    Categories.save(cats);
    return newCat;
  },
  update(id, patch) {
    const cats = Categories.all().map(c => c.id===parseInt(id) ? { ...c, ...patch } : c);
    Categories.save(cats);
  },
  remove(id) {
    Categories.save(Categories.all().filter(c => c.id !== parseInt(id)));
  },
};

export const Products = {
  all:    ()   => readData('products.json'),
  active: ()   => Products.all().filter(p => p.is_active === true || p.is_active === 1),
  byId:   (id) => Products.all().find(p => p.id === parseInt(id)),
  save:   (ps) => writeData('products.json', ps),
  nextId: ()   => { const all = Products.all(); return all.length ? Math.max(...all.map(p=>p.id))+1 : 1; },

  add(prod) {
    const prods = Products.all();
    const slug  = prod.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') + '-' + Date.now();
    const newP  = { ...prod, id: Products.nextId(), slug, is_active: true, created_at: new Date().toISOString() };
    prods.push(newP);
    Products.save(prods);
    return newP;
  },
  update(id, patch) {
    const prods = Products.all().map(p => p.id===parseInt(id) ? { ...p, ...patch, updated_at: new Date().toISOString() } : p);
    Products.save(prods);
  },
  remove(id) {
    Products.save(Products.all().filter(p => p.id !== parseInt(id)));
  },
};

export const Orders = {
  all:     ()      => readData('orders.json'),
  byId:    (oid)   => Orders.all().find(o => o.order_id === oid),
  save:    (ords)  => writeData('orders.json', ords),

  add(order) {
    const orders = Orders.all();
    orders.push({ ...order, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    Orders.save(orders);
  },
  update(order_id, patch) {
    const orders = Orders.all().map(o => o.order_id===order_id
      ? { ...o, ...patch, updated_at: new Date().toISOString() }
      : o
    );
    Orders.save(orders);
  },

  // Berapa kali player beli produk tertentu
  purchaseCount(username, productId, scope='per_product', categoryId=null) {
    const ords = Orders.all().filter(o => o.payment_status==='success' && o.player_username===username);
    if (scope === 'per_product')  return ords.filter(o => o.product_id===parseInt(productId)).length;
    if (scope === 'per_category') return ords.filter(o => o.category_id===parseInt(categoryId)).length;
    return ords.length;
  },
};

export const RedeemCodes = {
  all:   ()    => readData('redeem_codes.json'),
  byCode:(c)   => RedeemCodes.all().find(r => r.code.toUpperCase()===c.toUpperCase()),
  save:  (rcs) => writeData('redeem_codes.json', rcs),
  nextId:()    => { const a = RedeemCodes.all(); return a.length ? Math.max(...a.map(r=>r.id))+1 : 1; },

  add(rc) {
    const all = RedeemCodes.all();
    all.push({ ...rc, id: RedeemCodes.nextId(), used_count:0, created_at: new Date().toISOString() });
    RedeemCodes.save(all);
  },
  increment(code) {
    RedeemCodes.save(RedeemCodes.all().map(r =>
      r.code.toUpperCase()===code.toUpperCase() ? { ...r, used_count:(r.used_count||0)+1 } : r
    ));
  },
};

export const Tickets = {
  all:    ()    => readData('support_tickets.json'),
  byId:   (tid) => Tickets.all().find(t => t.ticket_id===tid),
  save:   (ts)  => writeData('support_tickets.json', ts),

  add(ticket) {
    const all = Tickets.all();
    const now = new Date().toISOString();
    
    // Perbaikan Bug: Memasukkan pesan pertama jika dikirim dari API handler
    const initialMessages = Array.isArray(ticket.messages) ? ticket.messages : [];
    const formattedMessages = initialMessages.map(msg => ({
      ...msg,
      created_at: msg.created_at || now
    }));

    all.push({ 
      ...ticket, 
      status: 'open', 
      messages: formattedMessages, 
      created_at: now, 
      updated_at: now 
    });
    Tickets.save(all);
  },
  update(ticket_id, patch) {
    Tickets.save(Tickets.all().map(t => t.ticket_id===ticket_id
      ? { ...t, ...patch, updated_at: new Date().toISOString() }
      : t
    ));
  },
  addMessage(ticket_id, message) {
    const all = Tickets.all().map(t => {
      if (t.ticket_id !== ticket_id) return t;
      const msgs = Array.isArray(t.messages) ? t.messages : [];
      return { ...t, messages: [...msgs, { ...message, created_at: new Date().toISOString() }], updated_at: new Date().toISOString() };
    });
    Tickets.save(all);
  },
  byPlayer: (username) => Tickets.all().filter(t => t.player_username===username),
  countToday: (username) => {
    const cutoff = new Date(Date.now() - 86400000).toISOString();
    return Tickets.all().filter(t => t.player_username===username && t.created_at>cutoff).length;
  },
};
