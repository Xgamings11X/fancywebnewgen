/**
 * lib/redis.js — Universal async storage (MySQL-first, file-fallback)
 *
 * Konfigurasi MySQL via env var (lihat lib/db.js):
 *   MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
 *
 * Jika env MySQL tidak diset, otomatis fallback ke file JSON lokal (storage.js).
 */
import { readData, writeData } from './storage.js';
import { getPool, hasDB, ensureTables } from './db.js';

// ── Generic KV helpers ───────────────────────────────────────────

async function dbGet(table, id, fallbackFile, defaultVal) {
  if (!hasDB()) return readData(fallbackFile) ?? defaultVal;
  await ensureTables();
  const pool = getPool();
  try {
    let row;
    if (table === 'settings') {
      const [rows] = await pool.query('SELECT `value` FROM settings WHERE `key` = ?', [id]);
      row = rows[0];
      if (!row) return defaultVal;
      return typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
    }
    // Generic: semua row dari tabel, kembalikan array objek
    const [rows] = await pool.query(`SELECT data FROM \`${table}\` ORDER BY created_at ASC`);
    return rows.map(r => typeof r.data === 'string' ? JSON.parse(r.data) : r.data);
  } catch (e) {
    console.error(`[db] get ${table}:`, e.message);
    return readData(fallbackFile) ?? defaultVal;
  }
}

// ── Settings ─────────────────────────────────────────────────────
export const SettingsAsync = {
  async get() {
    if (!hasDB()) return readData('settings.json') ?? {};
    await ensureTables();
    const pool = getPool();
    try {
      const [rows] = await pool.query('SELECT `key`, `value` FROM settings');
      if (rows.length === 0) return {};
      // Jika disimpan sebagai satu baris key='__all__'
      if (rows.length === 1 && rows[0].key === '__all__') {
        return typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
      }
      // Jika multi-key, gabungkan
      const obj = {};
      for (const r of rows) {
        obj[r.key] = typeof r.value === 'string' ? JSON.parse(r.value) : r.value;
      }
      return obj;
    } catch (e) {
      console.error('[db] settings.get:', e.message);
      return readData('settings.json') ?? {};
    }
  },

  async set(patch) {
    const s = await SettingsAsync.get();
    const merged = { ...s, ...patch };
    if (!hasDB()) { writeData('settings.json', merged); return; }
    await ensureTables();
    const pool = getPool();
    try {
      await pool.query(
        'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
        ['__all__', JSON.stringify(merged)]
      );
    } catch (e) {
      console.error('[db] settings.set:', e.message);
      writeData('settings.json', merged);
    }
  },

  async getKey(key, fallback = '') {
    return (await SettingsAsync.get())[key] ?? fallback;
  },
};

// ── Categories ───────────────────────────────────────────────────
export const CategoriesAsync = {
  async all() {
    if (!hasDB()) return readData('categories.json') ?? [];
    await ensureTables();
    const pool = getPool();
    try {
      const [rows] = await pool.query('SELECT id, data FROM categories ORDER BY id ASC');
      return rows.map(r => {
        const d = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
        return { ...d, id: r.id };
      });
    } catch (e) {
      console.error('[db] categories.all:', e.message);
      return readData('categories.json') ?? [];
    }
  },

  async save(cats) {
    // Tidak dipakai langsung — operasi individual lebih efisien
    // Disimpan hanya sebagai fallback via file
    writeData('categories.json', cats);
  },

  async active()   { return (await CategoriesAsync.all()).filter(c => c.is_active === true || c.is_active === 1); },
  async byId(id)   { return (await CategoriesAsync.all()).find(c => c.id === parseInt(id)); },

  async add(cat) {
    if (!hasDB()) {
      const cats = readData('categories.json') ?? [];
      const nextId = cats.length ? Math.max(...cats.map(c => c.id)) + 1 : 1;
      const newCat = { ...cat, id: nextId, is_active: true, created_at: new Date().toISOString() };
      cats.push(newCat);
      writeData('categories.json', cats);
      return newCat;
    }
    await ensureTables();
    const pool = getPool();
    const newCat = { ...cat, is_active: true, created_at: new Date().toISOString() };
    const [result] = await pool.query('INSERT INTO categories (data) VALUES (?)', [JSON.stringify(newCat)]);
    newCat.id = result.insertId;
    return newCat;
  },

  async update(id, patch) {
    if (!hasDB()) {
      const cats = (readData('categories.json') ?? []).map(c => c.id === parseInt(id) ? { ...c, ...patch } : c);
      writeData('categories.json', cats);
      return;
    }
    await ensureTables();
    const pool = getPool();
    const [rows] = await pool.query('SELECT data FROM categories WHERE id = ?', [parseInt(id)]);
    if (!rows[0]) return;
    const current = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
    await pool.query('UPDATE categories SET data = ? WHERE id = ?', [JSON.stringify({ ...current, ...patch }), parseInt(id)]);
  },

  async remove(id) {
    if (!hasDB()) {
      writeData('categories.json', (readData('categories.json') ?? []).filter(c => c.id !== parseInt(id)));
      return;
    }
    await ensureTables();
    await getPool().query('DELETE FROM categories WHERE id = ?', [parseInt(id)]);
  },
};

// ── Products ─────────────────────────────────────────────────────
export const ProductsAsync = {
  async all() {
    if (!hasDB()) return readData('products.json') ?? [];
    await ensureTables();
    const pool = getPool();
    try {
      const [rows] = await pool.query('SELECT id, data FROM products ORDER BY id ASC');
      return rows.map(r => {
        const d = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
        return { ...d, id: r.id };
      });
    } catch (e) {
      console.error('[db] products.all:', e.message);
      return readData('products.json') ?? [];
    }
  },

  async active()  { return (await ProductsAsync.all()).filter(p => p.is_active === true || p.is_active === 1); },
  async byId(id)  { return (await ProductsAsync.all()).find(p => p.id === parseInt(id)); },

  async add(prod) {
    if (!hasDB()) {
      const prods = readData('products.json') ?? [];
      const nextId = prods.length ? Math.max(...prods.map(p => p.id)) + 1 : 1;
      const slug = prod.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now();
      const newP = { ...prod, id: nextId, slug, is_active: true, created_at: new Date().toISOString() };
      prods.push(newP);
      writeData('products.json', prods);
      return newP;
    }
    await ensureTables();
    const pool = getPool();
    const slug = prod.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now();
    const newP = { ...prod, slug, is_active: true, created_at: new Date().toISOString() };
    const [result] = await pool.query('INSERT INTO products (data) VALUES (?)', [JSON.stringify(newP)]);
    newP.id = result.insertId;
    return newP;
  },

  async update(id, patch) {
    if (!hasDB()) {
      const prods = (readData('products.json') ?? []).map(p =>
        p.id === parseInt(id) ? { ...p, ...patch, updated_at: new Date().toISOString() } : p);
      writeData('products.json', prods);
      return;
    }
    await ensureTables();
    const pool = getPool();
    const [rows] = await pool.query('SELECT data FROM products WHERE id = ?', [parseInt(id)]);
    if (!rows[0]) return;
    const current = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
    await pool.query('UPDATE products SET data = ? WHERE id = ?',
      [JSON.stringify({ ...current, ...patch, updated_at: new Date().toISOString() }), parseInt(id)]);
  },

  async remove(id) {
    if (!hasDB()) {
      writeData('products.json', (readData('products.json') ?? []).filter(p => p.id !== parseInt(id)));
      return;
    }
    await ensureTables();
    await getPool().query('DELETE FROM products WHERE id = ?', [parseInt(id)]);
  },
};

// ── Orders ───────────────────────────────────────────────────────
export const OrdersAsync = {
  async all() {
    if (!hasDB()) return readData('orders.json') ?? [];
    await ensureTables();
    const pool = getPool();
    try {
      const [rows] = await pool.query('SELECT data FROM orders ORDER BY created_at DESC');
      return rows.map(r => typeof r.data === 'string' ? JSON.parse(r.data) : r.data);
    } catch (e) {
      console.error('[db] orders.all:', e.message);
      return readData('orders.json') ?? [];
    }
  },

  async byId(oid) {
    if (!hasDB()) return (readData('orders.json') ?? []).find(o => o.order_id === oid);
    await ensureTables();
    const pool = getPool();
    const [rows] = await pool.query('SELECT data FROM orders WHERE order_id = ?', [oid]);
    if (!rows[0]) return undefined;
    return typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
  },

  async add(order) {
    const newOrder = { ...order, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    if (!hasDB()) {
      const orders = readData('orders.json') ?? [];
      orders.push(newOrder);
      writeData('orders.json', orders);
      return;
    }
    await ensureTables();
    await getPool().query(
      'INSERT INTO orders (order_id, data) VALUES (?, ?)',
      [newOrder.order_id, JSON.stringify(newOrder)]
    );
  },

  async update(order_id, patch) {
    if (!hasDB()) {
      const orders = (readData('orders.json') ?? []).map(o =>
        o.order_id === order_id ? { ...o, ...patch, updated_at: new Date().toISOString() } : o);
      writeData('orders.json', orders);
      return;
    }
    await ensureTables();
    const pool = getPool();
    const [rows] = await pool.query('SELECT data FROM orders WHERE order_id = ?', [order_id]);
    if (!rows[0]) return;
    const current = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
    await pool.query('UPDATE orders SET data = ? WHERE order_id = ?',
      [JSON.stringify({ ...current, ...patch, updated_at: new Date().toISOString() }), order_id]);
  },

  async delete(order_id) {
    if (!hasDB()) {
      writeData('orders.json', (readData('orders.json') ?? []).filter(o => o.order_id !== order_id));
      return;
    }
    await ensureTables();
    await getPool().query('DELETE FROM orders WHERE order_id = ?', [order_id]);
  },

  async purchaseCount(username, productId, scope = 'per_product', categoryId = null) {
    const ords = (await OrdersAsync.all()).filter(o =>
      o.payment_status === 'success' && o.player_username === username);
    if (scope === 'per_product')  return ords.filter(o => o.product_id === parseInt(productId)).length;
    if (scope === 'per_category') return ords.filter(o => o.category_id === parseInt(categoryId)).length;
    return ords.length;
  },
};

// ── RedeemCodes ──────────────────────────────────────────────────
export const RedeemCodesAsync = {
  async all() {
    if (!hasDB()) return readData('redeem_codes.json') ?? [];
    await ensureTables();
    const pool = getPool();
    try {
      const [rows] = await pool.query('SELECT id, data FROM redeem_codes ORDER BY id ASC');
      return rows.map(r => {
        const d = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
        return { ...d, id: r.id };
      });
    } catch (e) {
      console.error('[db] redeem_codes.all:', e.message);
      return readData('redeem_codes.json') ?? [];
    }
  },

  async byCode(code) {
    if (!hasDB()) {
      return (readData('redeem_codes.json') ?? []).find(r => r.code.toUpperCase() === code.toUpperCase());
    }
    await ensureTables();
    const pool = getPool();
    const [rows] = await pool.query('SELECT id, data FROM redeem_codes WHERE UPPER(code) = ?', [code.toUpperCase()]);
    if (!rows[0]) return undefined;
    const d = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
    return { ...d, id: rows[0].id };
  },

  async add(rc) {
    const newRc = { ...rc, used_count: 0, created_at: new Date().toISOString() };
    if (!hasDB()) {
      const all = readData('redeem_codes.json') ?? [];
      const nextId = all.length ? Math.max(...all.map(r => r.id)) + 1 : 1;
      all.push({ ...newRc, id: nextId });
      writeData('redeem_codes.json', all);
      return;
    }
    await ensureTables();
    await getPool().query(
      'INSERT INTO redeem_codes (code, data) VALUES (?, ?)',
      [rc.code.toUpperCase(), JSON.stringify(newRc)]
    );
  },

  async increment(code) {
    if (!hasDB()) {
      const all = (readData('redeem_codes.json') ?? []).map(r =>
        r.code.toUpperCase() === code.toUpperCase() ? { ...r, used_count: (r.used_count || 0) + 1 } : r);
      writeData('redeem_codes.json', all);
      return;
    }
    await ensureTables();
    const pool = getPool();
    const [rows] = await pool.query('SELECT data FROM redeem_codes WHERE UPPER(code) = ?', [code.toUpperCase()]);
    if (!rows[0]) return;
    const d = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
    d.used_count = (d.used_count || 0) + 1;
    await pool.query('UPDATE redeem_codes SET data = ? WHERE UPPER(code) = ?', [JSON.stringify(d), code.toUpperCase()]);
  },
};

// ── Tickets ──────────────────────────────────────────────────────
export const TicketsAsync = {
  async all() {
    if (!hasDB()) return readData('support_tickets.json') ?? [];
    await ensureTables();
    const pool = getPool();
    try {
      const [rows] = await pool.query('SELECT data FROM tickets ORDER BY created_at DESC');
      return rows.map(r => typeof r.data === 'string' ? JSON.parse(r.data) : r.data);
    } catch (e) {
      console.error('[db] tickets.all:', e.message);
      return readData('support_tickets.json') ?? [];
    }
  },

  async byId(ticket_id) {
    if (!hasDB()) {
      return (readData('support_tickets.json') ?? []).find(t => t.ticket_id === ticket_id) || null;
    }
    await ensureTables();
    const pool = getPool();
    const [rows] = await pool.query('SELECT data FROM tickets WHERE ticket_id = ?', [ticket_id]);
    if (!rows[0]) return null;
    return typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
  },

  async add(ticket) {
    const newT = {
      ...ticket,
      status: 'open',
      messages: ticket.messages || [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (!hasDB()) {
      const all = readData('support_tickets.json') ?? [];
      all.push(newT);
      writeData('support_tickets.json', all);
      return newT;
    }
    await ensureTables();
    await getPool().query(
      'INSERT INTO tickets (ticket_id, data) VALUES (?, ?)',
      [newT.ticket_id, JSON.stringify(newT)]
    );
    return newT;
  },

  async update(ticket_id, patch) {
    if (!hasDB()) {
      const all = (readData('support_tickets.json') ?? []).map(t =>
        t.ticket_id === ticket_id ? { ...t, ...patch, updated_at: new Date().toISOString() } : t);
      writeData('support_tickets.json', all);
      return;
    }
    await ensureTables();
    const pool = getPool();
    const [rows] = await pool.query('SELECT data FROM tickets WHERE ticket_id = ?', [ticket_id]);
    if (!rows[0]) return null;
    const current = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
    const updated = { ...current, ...patch, updated_at: new Date().toISOString() };
    await pool.query('UPDATE tickets SET data = ? WHERE ticket_id = ?', [JSON.stringify(updated), ticket_id]);
    return updated;
  },

  async addMessage(ticket_id, message) {
    const msg = { ...message, created_at: message.created_at || new Date().toISOString() };
    if (!hasDB()) {
      let updated = null;
      const all = (readData('support_tickets.json') ?? []).map(t => {
        if (t.ticket_id !== ticket_id) return t;
        updated = { ...t, messages: [...(t.messages || []), msg], updated_at: new Date().toISOString() };
        return updated;
      });
      writeData('support_tickets.json', all);
      return updated;
    }
    await ensureTables();
    const pool = getPool();
    const [rows] = await pool.query('SELECT data FROM tickets WHERE ticket_id = ?', [ticket_id]);
    if (!rows[0]) return null;
    const current = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
    const updated = {
      ...current,
      messages: [...(current.messages || []), msg],
      updated_at: new Date().toISOString(),
    };
    await pool.query('UPDATE tickets SET data = ? WHERE ticket_id = ?', [JSON.stringify(updated), ticket_id]);
    return updated;
  },

  async delete(ticket_id) {
    if (!hasDB()) {
      writeData('support_tickets.json', (readData('support_tickets.json') ?? []).filter(t => t.ticket_id !== ticket_id));
      return;
    }
    await ensureTables();
    await getPool().query('DELETE FROM tickets WHERE ticket_id = ?', [ticket_id]);
  },

  async byPlayer(username) { return (await TicketsAsync.all()).filter(t => t.player_username === username); },

  async countToday(username) {
    const cutoff = new Date(Date.now() - 86400000).toISOString();
    return (await TicketsAsync.all()).filter(t => t.player_username === username && t.created_at > cutoff).length;
  },

  async getLastEventTime(ticket_id) {
    const tk = await TicketsAsync.byId(ticket_id);
    return tk ? new Date(tk.updated_at).getTime() : 0;
  },
};

// ── Backward-compat: hasRedis → hasDB (jaga kode lain yang masih pakai hasRedis) ───
export const hasRedis = hasDB;
