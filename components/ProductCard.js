const idr = value => `Rp ${Number(value || 0).toLocaleString('id-ID')}`;

const AUTO_PRESENTATION = [
  { match: ['rank', 'vip', 'mvp', 'lord', 'king', 'queen', 'hero', 'famous'], label: 'Rank' },
  { match: ['weapon', 'sword', 'pedang', 'axe', 'kapak', 'bow', 'senjata'], label: 'Weapon' },
  { match: ['crate', 'key', 'kunci', 'gacha'], label: 'Crate Key' },
  { match: ['kit', 'bundle', 'paket'], label: 'Kit' },
  { match: ['skill', 'aura', 'boost', 'booster', 'xp'], label: 'Booster' },
  { match: ['wand', 'sell', 'shop', 'money', 'coin'], label: 'Utility' },
  { match: ['claim', 'protection', 'shield'], label: 'Protection' },
];

function parseFeatures(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
  } catch {
    return value.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
  }
}

function resolvePresentation(product) {
  const haystack = [
    product.category_slug,
    product.category_name,
    product.name,
    product.description,
  ].filter(Boolean).join(' ').toLowerCase();

  const found = AUTO_PRESENTATION.find(item => item.match.some(keyword => haystack.includes(keyword)));
  return found || { label: product.category_name || 'Item' };
}


const BADGE_COLOR_MAP = {
  // Legacy admin data may still say "orange". On public cards it now resolves
  // to the emerald brand accent so an old value cannot leak the previous theme.
  orange: { rgb: '134, 245, 173', text: '#b9ffd0' },
  red:    { rgb: '255, 91, 111', text: '#ff8799' },
  purple: { rgb: '177, 115, 255', text: '#c99cff' },
  blue:   { rgb: '79, 173, 255', text: '#8acaff' },
  green:  { rgb: '126, 242, 160', text: '#a8ffbd' },
  yellow: { rgb: '217, 255, 113', text: '#e8ffad' },
};

function resolveBadgeColor(value) {
  const key = String(value || 'green').trim().toLowerCase();
  return BADGE_COLOR_MAP[key] || BADGE_COLOR_MAP.green;
}

export default function ProductCard({ product = {}, index = 0, onBuy }) {
  const price = Math.max(0, Number(product.price) || 0);
  const originalPrice = Math.max(0, Number(product.original_price) || 0);
  const discount = originalPrice > price ? Math.min(99, Math.round((1 - price / originalPrice) * 100)) : 0;
  const features = parseFeatures(product.features);
  const presentation = resolvePresentation(product);
  const imageUrl = typeof product.image_url === 'string' && /^https?:\/\//i.test(product.image_url.trim())
    ? product.image_url.trim()
    : '';
  const badge = String(product.badge || '').trim();
  const badgeColor = resolveBadgeColor(product.badge_color);
  const platform = String(product.platform || product.edition || 'Java & Bedrock');
  const productId = product.id ?? `${product.name || 'product'}-${index}`;

  return (
    <article className="store-product-card no-icon-card">
      <div className={`store-product-media ${imageUrl ? 'has-image' : 'text-only'}`}>
        {badge && (
          <div
            className="store-product-badge-star"
            aria-label={`Badge ${badge}`}
            title={`${badge} · ${product.badge_color || 'green'}`}
            style={{
              '--badge-rgb': badgeColor.rgb,
              '--badge-text': badgeColor.text,
            }}
          >
            <span className="store-product-badge-star-shape" aria-hidden="true" />
            <strong>{badge}</strong>
          </div>
        )}
        <div className="store-product-media-top">
          <span className="store-product-category">{product.category_name || presentation.label}</span>
          <span className="store-product-platform">{platform}</span>
        </div>

        <div className="store-product-visual">
          {imageUrl ? (
            <img src={imageUrl} alt={product.name || 'Produk Minecraft'} loading="lazy" decoding="async" />
          ) : (
            <div className="store-product-wordmark" aria-hidden="true">
              <span>{presentation.label}</span>
              <strong>{product.name || 'Fancy Item'}</strong>
              <small>FANCY NETWORK</small>
            </div>
          )}
        </div>

        <div className="store-product-media-badges">
          {discount > 0 && <span className="discount">Hemat {discount}%</span>}
        </div>
      </div>

      <div className="store-product-content">
        <div className="store-product-heading">
          <div>
            <span className="store-product-kicker">{presentation.label}</span>
            <h3>{product.name || 'Produk Tanpa Nama'}</h3>
          </div>
          {Number(product.purchase_limit) > 0 && (
            <span className="store-product-limit">Maks. {Number(product.purchase_limit)}</span>
          )}
        </div>

        <p className="store-product-description">
          {product.description || 'Produk premium dikirim otomatis ke akun Minecraft setelah pembayaran berhasil.'}
        </p>

        <div className="store-product-benefits">
          <div className="store-product-benefits-head">
            <strong>Benefit</strong>
            <span>{features.length || 'Detail checkout'}</span>
          </div>

          {features.length > 0 ? (
            <ul tabIndex={features.length > 4 ? 0 : undefined} aria-label={`Daftar benefit ${product.name || 'produk'}`}>
              {features.map((feature, featureIndex) => (
                <li key={`${productId}-${featureIndex}`}>{feature}</li>
              ))}
            </ul>
          ) : (
            <p className="store-product-empty-benefit">Detail lengkap tersedia saat checkout.</p>
          )}

        </div>
      </div>

      <div className="store-product-footer">
        <div className="store-product-price">
          <span>Mulai dari</span>
          {discount > 0 && <del>{idr(originalPrice)}</del>}
          <strong>{idr(price)}</strong>
        </div>
        <button type="button" onClick={() => onBuy?.(product)} className="store-product-buy">Beli sekarang</button>
      </div>
    </article>
  );
}
