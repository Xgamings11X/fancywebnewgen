import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import LogoImage from './LogoImage';
import Icon from './Icon';

const NAV_LINKS = [
  { href: '/', label: 'Home', icon: 'gamepad' },
  { href: '/store', label: 'Store', icon: 'cart-shopping' },
  { href: '/leaderboard', label: 'Leaderboard', icon: 'trophy' },
];

export default function FancyNav({ player, onLoginClick, onLogout, settings }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navRef = useRef(null);
  const router = useRouter();
  const s = settings || {};
  const logoUrl = s.logo_url || '';
  const serverName = s.server_name || 'Fancy Network';

  const isActive = href => href === '/'
    ? router.pathname === '/'
    : router.pathname === href || router.pathname.startsWith(`${href}/`);

  const menuOpenRef = useRef(false);
  menuOpenRef.current = menuOpen;

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    const handleKeyDown = event => {
      if (event.key === 'Escape' && menuOpenRef.current) closeMenu();
    };
    const handlePointerDown = event => {
      if (menuOpenRef.current && navRef.current && !navRef.current.contains(event.target)) closeMenu();
    };

    router.events.on('routeChangeStart', closeMenu);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown, { passive: true });

    // Next/Link already prefetches visible links in production. This idle pass also
    // warms the other main public route, so Home ↔ Store ↔ Support needs less work
    // exactly at click time. Skip it for data-saver / very slow connections.
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const canPrefetch = !connection?.saveData && !/2g/.test(connection?.effectiveType || '');
    let idleId = null;
    let timerId = null;
    const prefetchPublicRoutes = () => {
      if (!canPrefetch) return;
      for (const href of ['/', '/store', '/leaderboard']) {
        if (href !== router.pathname) router.prefetch(href).catch(() => {});
      }
    };
    if ('requestIdleCallback' in window) idleId = window.requestIdleCallback(prefetchPublicRoutes, { timeout: 1800 });
    else timerId = window.setTimeout(prefetchPublicRoutes, 700);

    return () => {
      router.events.off('routeChangeStart', closeMenu);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
      if (idleId != null) window.cancelIdleCallback?.(idleId);
      if (timerId != null) window.clearTimeout(timerId);
    };
  }, [closeMenu, router]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [menuOpen]);

  return (
    <nav ref={navRef} className="public-nav" aria-label="Navigasi utama">
      <Link href="/" prefetch className="public-nav-brand" aria-label={`${serverName} — Beranda`}>
        <span className="public-nav-logo">
          {logoUrl ? <img src={logoUrl} alt="" width={64} height={64} decoding="async" fetchPriority="high" /> : <LogoImage alt="" width={64} height={64} fetchPriority="high" />}
        </span>
        <span className="public-nav-brand-copy">
          <strong>{serverName}</strong>
          <small>Minecraft Network</small>
        </span>
      </Link>

      <ul className="public-nav-links">
        {NAV_LINKS.map(link => (
          <li key={link.href}>
            <Link
              href={link.href}
              prefetch
              aria-current={isActive(link.href) ? 'page' : undefined}
              className={`public-nav-link${isActive(link.href) ? ' active' : ''}`}
            >
              <Icon name={link.icon} size={15} />
              {link.label}
            </Link>
          </li>
        ))}
      </ul>

      <div className="public-nav-actions">
        {player ? (
          <div className="public-nav-player">
            <div className="public-nav-player-card" title={player.displayName || player.username}>
              <PlayerAvatar uuid={player.uuid} username={player.username} size={28} />
              <span>
                <strong>{player.displayName || player.username}</strong>
                <small>{player.rank && player.rank !== 'default' ? String(player.rank).toUpperCase() : 'PLAYER'}</small>
              </span>
            </div>
            <button type="button" onClick={onLogout} className="public-nav-icon-button" aria-label="Keluar dari akun">
              <Icon name="right-from-bracket" size={16} />
            </button>
          </div>
        ) : (
          <button type="button" onClick={onLoginClick} className="public-nav-login">
            <Icon name="right-to-bracket" size={15} />
            <span>Login</span>
          </button>
        )}

        <button
          type="button"
          className={`public-nav-menu-button${menuOpen ? ' active' : ''}`}
          onClick={() => setMenuOpen(open => !open)}
          aria-expanded={menuOpen}
          aria-controls="public-mobile-navigation"
          aria-label={menuOpen ? 'Tutup menu' : 'Buka menu'}
        >
          <Icon name={menuOpen ? 'xmark' : 'bars'} size={19} />
        </button>
      </div>

      {menuOpen && (
        <div id="public-mobile-navigation" className="public-mobile-menu">
          <div className="public-mobile-menu-links">
            {NAV_LINKS.map(link => (
              <Link
                key={link.href}
                href={link.href}
                prefetch
                onClick={() => setMenuOpen(false)}
                className={`public-mobile-link${isActive(link.href) ? ' active' : ''}`}
              >
                <span><Icon name={link.icon} size={18} /></span>
                <div>
                  <strong>{link.label}</strong>
                  <small>{link.href === '/' ? 'Informasi server' : link.href === '/store' ? 'Rank dan item premium' : 'Top voter dan donatur'}</small>
                </div>
                <Icon name="chevron-right" size={14} />
              </Link>
            ))}
          </div>

          {player ? (
            <button type="button" onClick={() => { setMenuOpen(false); onLogout?.(); }} className="public-mobile-account-button">
              <PlayerAvatar uuid={player.uuid} username={player.username} size={30} />
              <span><strong>{player.displayName || player.username}</strong><small>Keluar dari akun</small></span>
              <Icon name="right-from-bracket" size={16} />
            </button>
          ) : (
            <button type="button" onClick={() => { setMenuOpen(false); onLoginClick?.(); }} className="public-mobile-login-button">
              <Icon name="right-to-bracket" size={16} /> Login ke akun pemain
            </button>
          )}
        </div>
      )}
    </nav>
  );
}

const UUID_RE = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

export function PlayerAvatar({ uuid, username, size = 28 }) {
  const [hasFailed, setHasFailed] = useState(false);
  useEffect(() => setHasFailed(false), [uuid, username]);

  const validUuid = uuid && UUID_RE.test(uuid);
  const name = username || 'steve';
  const fallbackUrl = `https://minotar.net/helm/${encodeURIComponent(name.replace(/^\./, ''))}/${size * 2}`;
  const src = validUuid && !hasFailed
    ? `https://crafatar.com/renders/head/${uuid}?size=${size * 2}&overlay`
    : fallbackUrl;

  return (
    <img
      src={src}
      alt={`Avatar ${name}`}
      width={size}
      height={size}
      className="fn-player-avatar"
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setHasFailed(true)}
    />
  );
}
