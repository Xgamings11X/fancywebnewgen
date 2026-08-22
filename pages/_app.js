import '../styles/globals.css';
import '../styles/fancy-network.css';
import { useEffect, useMemo } from 'react';
import { Toaster } from 'react-hot-toast';
import Router from 'next/router';

function safeBackgroundUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  const candidate = value.trim();
  if (/[\\'"<>\r\n]/.test(candidate)) return '';
  if (/^\/[A-Za-z0-9_./%-]+$/.test(candidate)) return candidate;
  try {
    const url = new URL(candidate);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

/**
 * Scroll-reveal observer — dibuat SEKALI untuk seluruh siklus hidup app.
 * PERF FIX: versi sebelumnya membuat IntersectionObserver baru + querySelectorAll
 * ulang di SETIAP render React (useEffect tanpa dependency array), yang berarti
 * observer menumpuk dan DOM di-scan ulang terus-menerus tanpa alasan yang valid.
 * Sekarang: 1 IntersectionObserver dipakai seumur hidup app, dan MutationObserver
 * menangkap elemen [data-anim] baru yang dirender belakangan (mis. dari fetch async)
 * tanpa perlu rebuild observer dari nol.
 */
function createScrollRevealObserver() {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        el.classList.add('anim-visible');
        io.unobserve(el);
        // will-change hanya aktif selama transisi berlangsung, lalu dilepas.
        // Mencegah elemen yang sudah selesai animasi tetap "menempel" di compositor
        // layer GPU selamanya — penting untuk halaman panjang dengan banyak section.
        el.style.willChange = 'opacity, transform';
        const clearWillChange = () => { el.style.willChange = 'auto'; };
        el.addEventListener('transitionend', clearWillChange, { once: true });
        setTimeout(clearWillChange, 1200); // fallback jika transitionend tak terpicu
      });
    },
    { threshold: 0.08, rootMargin: '0px 0px -30px 0px' }
  );

  const observeAll = (root) => {
    root.querySelectorAll('[data-anim]:not(.anim-visible)').forEach((el) => io.observe(el));
  };
  observeAll(document);

  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        if (node.matches?.('[data-anim]')) io.observe(node);
        node.querySelectorAll?.('[data-anim]:not(.anim-visible)').forEach((el) => io.observe(el));
      });
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });

  return () => { io.disconnect(); mo.disconnect(); };
}

export default function App({ Component, pageProps }) {
  // Public pages already receive settings through SSR. Reusing those props avoids
  // a duplicate /api/store/settings request + state update on every first load.
  const { bgDesktop, bgMobile } = useMemo(() => {
    const pageSettings = pageProps?.settings || {};
    return {
      bgDesktop: safeBackgroundUrl(pageSettings.bg_desktop),
      bgMobile: safeBackgroundUrl(pageSettings.bg_mobile),
    };
  }, [pageProps?.settings]);

  // ── One-time setup: page-transition overlay, route progress bar, scroll-reveal observer ──
  // Dependency array kosong = dibuat sekali untuk seluruh app, BUKAN per render/per route.
  useEffect(() => {
    const bar = document.createElement('div');
    bar.id = 'scroll-progress';
    document.body.appendChild(bar);

    // Lightweight GPU-only route wipe. It preserves the page-change animation
    // without translating/fading the entire multi-screen React tree.
    const overlay = document.createElement('div');
    overlay.id = 'page-transition-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    document.body.appendChild(overlay);

    let routePending = false;
    let routeResetTimer = 0;
    let overlayResetTimer = 0;
    let routeDoneTimer = 0;
    let routeStartedAt = 0;
    const onRouteStart = (_url, { shallow } = {}) => {
      // Query-only updates (for example Store category filters) keep the current
      // page mounted, so they must feel like an instant UI state change.
      if (shallow) return;
      routePending = true;
      routeStartedAt = window.performance.now();
      window.clearTimeout(routeResetTimer);
      window.clearTimeout(overlayResetTimer);
      window.clearTimeout(routeDoneTimer);
      overlay.classList.remove('finishing');
      // The overlay has already been mounted since app startup, so the base state
      // is committed. Starting immediately avoids the two-frame dead zone that
      // made fast, prefetched routes appear to snap instead of transition.
      overlay.classList.add('transitioning');
      bar.classList.add('is-routing');
      bar.style.transform = 'scaleX(.22)';
    };
    const finishRoute = () => {
      bar.style.transform = 'scaleX(1)';
      overlay.classList.remove('transitioning');
      overlay.classList.add('finishing');
      overlayResetTimer = window.setTimeout(() => {
        overlay.classList.remove('finishing');
      }, 230);
      routeResetTimer = window.setTimeout(() => {
        routePending = false;
        bar.classList.remove('is-routing');
        bar.style.transform = 'scaleX(0)';
      }, 110);
    };
    const onRouteDone = () => {
      if (!routePending) return;
      // Keep the wipe visible long enough to read as one intentional motion.
      // Without this floor, a prefetched route could complete within a frame and
      // the overlay would flash or disappear before its entrance was painted.
      const elapsed = window.performance.now() - routeStartedAt;
      const remaining = Math.max(0, 130 - elapsed);
      window.clearTimeout(routeDoneTimer);
      routeDoneTimer = window.setTimeout(finishRoute, remaining);
    };

    Router.events.on('routeChangeStart', onRouteStart);
    Router.events.on('routeChangeComplete', onRouteDone);
    Router.events.on('routeChangeError', onRouteDone);
    const cleanupObserver = createScrollRevealObserver();

    // First paint hero entrance (tidak ada routeChangeComplete saat initial load)
    const initialTimer = setTimeout(() => document.body.classList.add('page-loaded'), 80);

    return () => {
      Router.events.off('routeChangeStart', onRouteStart);
      Router.events.off('routeChangeComplete', onRouteDone);
      Router.events.off('routeChangeError', onRouteDone);
      window.clearTimeout(routeResetTimer);
      window.clearTimeout(overlayResetTimer);
      window.clearTimeout(routeDoneTimer);
      cleanupObserver();
      clearTimeout(initialTimer);
      bar.remove();
      overlay.remove();
    };
  }, []);

  // Route transitions are handled by a short-lived compositor-only overlay above.

  return (
    <>
      {(bgDesktop || bgMobile) && (
        <style>{`
          body::before {
            background-image: url('${bgDesktop || bgMobile}') !important;
          }
          ${bgMobile ? `
          @media (max-width: 768px) {
            body::before {
              background-image: url('${bgMobile}') !important;
              background-position: center center !important;
            }
          }` : ''}
        `}</style>
      )}
      <Component {...pageProps} />
      <Toaster
        position="bottom-center"
        toastOptions={{
          style: {
            background: '#ffffff',
            color: '#101114',
            border: '1px solid #dce2ea',
            borderRadius: '14px',
            boxShadow: '0 16px 40px rgba(16,17,20,0.14)',
            fontFamily: '"Plus Jakarta Sans", sans-serif',
            fontSize: 13,
            fontWeight: 700,
            padding: '12px 16px',
          },
          success: { iconTheme: { primary: '#16a34a', secondary: '#ffffff' } },
          error:   { iconTheme: { primary: '#e03131', secondary: '#ffffff' } },
        }}
      />
    </>
  );
}
