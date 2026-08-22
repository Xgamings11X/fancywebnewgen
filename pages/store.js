import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import FancyNav, { PlayerAvatar } from '../components/FancyNav';
import FancyFooter from '../components/FancyFooter';
import { useTransparentLogo } from '../components/LogoImage';
import ProductCard from '../components/ProductCard';
import Icon from '../components/Icon';
import toast from 'react-hot-toast';

const LoginModal = dynamic(() => import('../components/LoginModal'), { ssr: false });
const CartModal = dynamic(() => import('../components/CartModal'), { ssr: false });

const CATEGORY_PRESENTATION = [
  { match: ['rank', 'vip', 'mvp', 'famous'], icon: 'trophy', description: 'Rank dan benefit permanen' },
  { match: ['weapon', 'senjata', 'sword', 'pedang'], icon: 'gavel', description: 'Senjata dan item tempur' },
  { match: ['crate', 'key', 'kunci'], icon: 'ticket', description: 'Kunci crate dan hadiah' },
  { match: ['kit', 'bundle', 'paket'], icon: 'box-open', description: 'Paket item siap pakai' },
  { match: ['skill', 'aura', 'boost'], icon: 'bolt', description: 'Booster dan progression' },
  { match: ['wand', 'sell', 'utility'], icon: 'chart-line', description: 'Utility ekonomi pemain' },
];

function parseFeatures(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return value.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
  }
}

function categoryKey(category) {
  const slug = String(category?.slug || '').trim();
  if (slug) return slug.toLowerCase();
  return category?.id != null ? `category-${category.id}` : '';
}

function categoryPresentation(category) {
  const text = `${category?.slug || ''} ${category?.name || ''}`.toLowerCase();
  return CATEGORY_PRESENTATION.find(item => item.match.some(keyword => text.includes(keyword))) || {
    icon: 'cube',
    description: category?.description || 'Item dan benefit server',
  };
}

function enrichProducts(products, categories) {
  const byId = new Map((categories || []).map(category => [String(category.id), category]));
  return (products || []).map(product => {
    const category = byId.get(String(product.category_id));
    return {
      ...product,
      category_name: product.category_name || category?.name || null,
      category_slug: String(product.category_slug || categoryKey(category) || '').toLowerCase() || null,
      category_icon: product.category_icon || category?.icon || null,
    };
  });
}

export async function getServerSideProps() {
  try {
    const { SettingsAsync, ProductsAsync, CategoriesAsync } = await import('../lib/redis.js');
    const [settings, rawCategories, rawProducts] = await Promise.all([
      SettingsAsync.get(), CategoriesAsync.active(), ProductsAsync.active(),
    ]);
    const categories = [...rawCategories].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const products = enrichProducts(
      [...rawProducts].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
      categories,
    );
    return { props: { settings, categories, products } };
  } catch {
    return { props: { settings: {}, categories: [], products: [] } };
  }
}

export default function StorePage({ settings, categories: initialCategories, products: initialProducts }) {
  const router = useRouter();
  const s = settings || {};
  const serverName = s.server_name || 'Fancy Network';
  const { src: logoSrc } = useTransparentLogo();

  const [player, setPlayer] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [cartItem, setCartItem] = useState(null);
  const [pendingBuy, setPendingBuy] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState(initialProducts || []);
  const [categories, setCategories] = useState(initialCategories || []);
  const [catalogLoading, setCatalogLoading] = useState(false);

  const loadCatalog = useCallback(async signal => {
    setCatalogLoading(true);
    try {
      const response = await fetch('/api/store/products', { signal, headers: { Accept: 'application/json' } });
      const data = response.ok ? await response.json() : null;
      if (!data?.success) return;
      const nextCategories = Array.isArray(data.categories)
        ? [...data.categories].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
        : [];
      const nextProducts = Array.isArray(data.products)
        ? enrichProducts([...data.products].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)), nextCategories)
        : [];
      startTransition(() => {
        setCategories(nextCategories);
        setProducts(nextProducts);
      });
    } catch (error) {
      if (error?.name !== 'AbortError') toast.error('Katalog gagal diperbarui. Menampilkan data terakhir.');
    } finally {
      if (!signal?.aborted) setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const hasServerCatalog = (initialProducts?.length || 0) > 0 || (initialCategories?.length || 0) > 0;
    let idleId = null;
    let timerId = null;

    const refresh = () => {
      if (!controller.signal.aborted && document.visibilityState === 'visible') loadCatalog(controller.signal);
    };

    // SSR already delivered the catalog. Do not fetch + re-render it again during
    // the route's critical first frames. Refresh later in idle time instead.
    if (!hasServerCatalog) {
      refresh();
    } else {
      timerId = window.setTimeout(() => {
        if ('requestIdleCallback' in window) idleId = window.requestIdleCallback(refresh, { timeout: 2500 });
        else refresh();
      }, 3500);
    }

    return () => {
      controller.abort();
      if (idleId != null) window.cancelIdleCallback?.(idleId);
      if (timerId != null) window.clearTimeout(timerId);
    };
  }, [initialCategories, initialProducts, loadCatalog]);

  useEffect(() => {
    const controller = new AbortController();
    try {
      const cached = localStorage.getItem('mc_player');
      if (cached) setPlayer(JSON.parse(cached));
    } catch {
      localStorage.removeItem('mc_player');
    }

    let token = '';
    try { token = localStorage.getItem('mc_token') || ''; } catch {}
    if (token) {
      fetch('/api/auth/me', {
        credentials: 'include',
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      })
        .then(response => response.ok ? response.json() : null)
        .then(data => {
          if (data?.success && data.player) {
            setPlayer(data.player);
            localStorage.setItem('mc_player', JSON.stringify(data.player));
          } else {
            setPlayer(null);
            localStorage.removeItem('mc_player');
            localStorage.removeItem('mc_token');
          }
        })
        .catch(() => {});
    }

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!router.isReady) return;
    const { order, status, order_id: orderId, category } = router.query;
    if (orderId) {
      router.replace(`/invoice/${encodeURIComponent(String(orderId))}`);
      return;
    }
    if (order && status) {
      router.replace(`/invoice/${encodeURIComponent(String(order))}`);
      return;
    }
    if (typeof category === 'string' && category.trim()) setActiveTab(category.trim().toLowerCase());
  }, [router, router.isReady, router.query.category, router.query.order, router.query.order_id, router.query.status]);

  const validCategoryKeys = useMemo(() => new Set(categories.map(categoryKey).filter(Boolean)), [categories]);
  useEffect(() => {
    if (activeTab !== 'all' && !validCategoryKeys.has(activeTab)) setActiveTab('all');
  }, [activeTab, validCategoryKeys]);

  const handleLogout = async () => {
    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); } catch {}
    setPlayer(null);
    localStorage.removeItem('mc_player');
    localStorage.removeItem('mc_token');
    toast.success('Berhasil keluar');
  };

  const handleLoginSuccess = nextPlayer => {
    setPlayer(nextPlayer);
    localStorage.setItem('mc_player', JSON.stringify(nextPlayer));
    setShowLogin(false);
    if (pendingBuy) {
      setCartItem(pendingBuy);
      setShowCart(true);
      setPendingBuy(null);
    }
  };

  const handleBuy = product => {
    if (!player) {
      setPendingBuy(product);
      setShowLogin(true);
      return;
    }
    setCartItem(product);
    setShowCart(true);
  };

  const categoryItems = useMemo(() => [
    { id: 'all', name: 'Semua', icon: 'box-open', description: 'Seluruh produk tersedia' },
    ...categories.map(category => {
      const presentation = categoryPresentation(category);
      return {
        id: categoryKey(category),
        name: category.name || 'Kategori',
        icon: presentation.icon,
        description: category.description || presentation.description,
      };
    }).filter(item => item.id),
  ], [categories]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter(product => {
      if (activeTab !== 'all' && String(product.category_slug || '') !== activeTab) return false;
      if (!term) return true;
      return [
        product.name,
        product.description,
        product.category_name,
        ...parseFeatures(product.features),
      ].filter(Boolean).join(' ').toLowerCase().includes(term);
    });
  }, [activeTab, products, search]);

  const countFor = id => id === 'all'
    ? products.length
    : products.filter(product => String(product.category_slug || '') === id).length;

  const selectCategory = id => {
    setActiveTab(id);
    const nextQuery = { ...router.query };
    delete nextQuery.order;
    delete nextQuery.order_id;
    delete nextQuery.status;
    if (id === 'all') delete nextQuery.category;
    else nextQuery.category = id;
    router.replace({ pathname: '/store', query: nextQuery }, undefined, { shallow: true, scroll: false });
  };

  return (
    <>
      <Head>
        <title>{`Store — ${serverName}`}</title>
        <meta name="description" content={`Rank, item, dan benefit premium ${serverName}.`} />
        <link rel="icon" type="image/png" href={s.logo_url || logoSrc || '/favicon.png'} />
      </Head>

      <div className="public-shell fancy-public-theme">
        <FancyNav player={player} onLoginClick={() => setShowLogin(true)} onLogout={handleLogout} settings={s} />

        <main className="store-redesign store-fancy-page">
          <section className="store-page-hero">
            <div className="store-page-hero-copy">
              <span className="store-page-kicker">OFFICIAL STORE</span>
              <h1><strong>Store</strong> {serverName}</h1>
              <p>Pilih rank, kit, crate key, atau utility. Semua produk diproses otomatis setelah pembayaran berhasil.</p>
              <div className="store-trust-row">
                <span><Icon name="lock" size={14} /> Pembayaran aman</span>
                <span><Icon name="bolt" size={14} /> Proses otomatis</span>
                <span><Icon name="gamepad" size={14} /> Java &amp; Bedrock</span>
              </div>
            </div>

            <aside className="store-account-panel">
              {player ? (
                <>
                  <span className="store-account-label">PEMBELIAN UNTUK</span>
                  <div className="store-account-player">
                    <PlayerAvatar uuid={player.uuid} username={player.username} size={46} />
                    <div>
                      <strong>{player.displayName || player.username}</strong>
                      <small>{player.platform === 'bedrock' ? 'BEDROCK' : 'JAVA'} · {player.rank && player.rank !== 'default' ? String(player.rank).toUpperCase() : 'PLAYER'}</small>
                    </div>
                  </div>
                  <p>Pastikan akun ini benar sebelum checkout.</p>
                </>
              ) : (
                <>
                  <span className="store-account-icon"><Icon name="right-to-bracket" size={22} /></span>
                  <strong>Login sebelum membeli</strong>
                  <p>Gunakan username Minecraft yang sudah pernah join server.</p>
                  <button type="button" onClick={() => setShowLogin(true)}>LOGIN</button>
                </>
              )}
            </aside>
          </section>

          <section className="store-catalog-section">
            <div className="public-section-heading store-catalog-heading">
              <span className="public-eyebrow">KATALOG PRODUK</span>
              <h2>Pilih kategori, lalu temukan produkmu.</h2>
              <p>Ikon kategori dan produk dipilih otomatis berdasarkan nama. Kamu tidak perlu mengaturnya satu per satu.</p>
            </div>

            <div className="store-category-grid" role="tablist" aria-label="Kategori produk">
              {categoryItems.map(item => {
                const active = activeTab === item.id;
                return (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={active}
                    key={item.id}
                    className={`store-category-card${active ? ' active' : ''}`}
                    onClick={() => selectCategory(item.id)}
                  >
                    <span className="store-category-icon"><Icon name={item.icon} size={20} /></span>
                    <div><strong>{item.name}</strong><small>{item.description}</small></div>
                    <span className="store-category-count">{countFor(item.id)}</span>
                  </button>
                );
              })}
            </div>

            <div className="store-toolbar">
              <div className="store-search-field">
                <Icon name="search" size={17} />
                <input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Cari produk atau benefit..."
                  aria-label="Cari produk"
                />
                {search && <button type="button" onClick={() => setSearch('')} aria-label="Hapus pencarian"><Icon name="xmark" size={14} /></button>}
              </div>
              <div className="store-result-count">
                {catalogLoading && <Icon name="spinner" size={14} spin />}
                <strong>{filtered.length}</strong> produk ditemukan
              </div>
            </div>

            {filtered.length > 0 ? (
              <div className="store-products-grid">
                {filtered.map((product, index) => {
                  const productId = product.id ?? `${product.name || 'product'}-${index}`;
                  return (
                    <ProductCard
                      key={productId}
                      product={product}
                      index={index}
                      onBuy={handleBuy}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="store-empty-state">
                <span><Icon name="box-open" size={28} /></span>
                <h3>Produk tidak ditemukan</h3>
                <p>Coba kategori lain atau hapus kata pencarian.</p>
                <button type="button" onClick={() => { setSearch(''); selectCategory('all'); }}>Tampilkan semua</button>
              </div>
            )}
          </section>
        </main>

        <FancyFooter serverName={serverName} discordUrl={s.discord_url} settings={s} />
      </div>

      {showLogin && <LoginModal product={pendingBuy} onClose={() => { setShowLogin(false); setPendingBuy(null); }} onSuccess={handleLoginSuccess} />}
      {showCart && cartItem && <CartModal product={cartItem} player={player} onClose={() => { setShowCart(false); setCartItem(null); }} />}
    </>
  );
}
