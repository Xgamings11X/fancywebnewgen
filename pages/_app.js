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

  // ── One-time setup: page-transition overlay, scroll progress bar, scroll-reveal observer ──
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

    let scrollFrame = 0;
    let routePending = false;
    let routeResetTimer = 0;
    let overlayResetTimer = 0;
    let overlayFrame = 0;
    let lastScale = -1;

    const updateScrollBar = () => {
      scrollFrame = 0;
      if (routePending) return;
      const total = document.documentElement.scrollHeight - window.innerHeight;
      const pct = total > 0 ? Math.min(1, Math.max(0, window.scrollY / total)) : 0;
      if (Math.abs(pct - lastScale) < 0.0015) return;
      lastScale = pct;
      bar.style.transform = `scaleX(${pct})`;
    };
    const onScroll = () => {
      if (!scrollFrame) scrollFrame = window.requestAnimationFrame(updateScrollBar);
    };
    const onRouteStart = () => {
      routePending = true;
      window.clearTimeout(routeResetTimer);
      window.clearTimeout(overlayResetTimer);
      if (overlayFrame) window.cancelAnimationFrame(overlayFrame);
      overlay.classList.remove('finishing');
      // Two rAFs guarantee the off-screen base state is committed without a
      // synchronous layout read/forced reflow. Route changes are infrequent,
      // but this keeps the transition clean even on slower mobile CPUs.
      overlayFrame = window.requestAnimationFrame(() => {
        overlayFrame = window.requestAnimationFrame(() => {
          overlay.classList.add('transitioning');
          overlayFrame = 0;
        });
      });
      bar.classList.add('is-routing');
      bar.style.transform = 'scaleX(.22)';
    };
    const onRouteDone = () => {
      // A prefetched route can finish before the two-rAF entrance starts. Cancel
      // that pending frame so it cannot re-add .transitioning after completion.
      if (overlayFrame) {
        window.cancelAnimationFrame(overlayFrame);
        overlayFrame = 0;
      }
      bar.style.transform = 'scaleX(1)';
      overlay.classList.remove('transitioning');
      overlay.classList.add('finishing');
      overlayResetTimer = window.setTimeout(() => {
        overlay.classList.remove('finishing');
      }, 230);
      routeResetTimer = window.setTimeout(() => {
        routePending = false;
        bar.classList.remove('is-routing');
        lastScale = -1;
        updateScrollBar();
      }, 110);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    Router.events.on('routeChangeStart', onRouteStart);
    Router.events.on('routeChangeComplete', onRouteDone);
    Router.events.on('routeChangeError', onRouteDone);
    updateScrollBar();

    const cleanupObserver = createScrollRevealObserver();

    // First paint hero entrance (tidak ada routeChangeComplete saat initial load)
    const initialTimer = setTimeout(() => document.body.classList.add('page-loaded'), 80);

    return () => {
      window.removeEventListener('scroll', onScroll);
      Router.events.off('routeChangeStart', onRouteStart);
      Router.events.off('routeChangeComplete', onRouteDone);
      Router.events.off('routeChangeError', onRouteDone);
      if (scrollFrame) window.cancelAnimationFrame(scrollFrame);
      if (overlayFrame) window.cancelAnimationFrame(overlayFrame);
      window.clearTimeout(routeResetTimer);
      window.clearTimeout(overlayResetTimer);
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
