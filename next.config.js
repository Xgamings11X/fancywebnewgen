/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: false,
  compress: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,

  images: {
    // ✅ DIAKTIFKAN — Next.js sekarang auto-convert ke WebP/AVIF
    // dan generate srcset responsif. Ini sendiri bisa +15 poin PageSpeed.
    unoptimized: false,
    domains: [
      'crafatar.com',
      'minotar.net',
      'i.imgur.com',
      'cdn.discordapp.com',
      // ✅ TAMBAHAN — domain logo payment agar bisa dioptimasi
      'upload.wikimedia.org',
      'logo.clearbit.com',
    ],
    minimumCacheTTL: 86400,
    // ✅ AVIF lebih kecil dari WebP — browser modern pakai AVIF otomatis
    formats: ['image/avif', 'image/webp'],
  },

  async headers() {
    return [
      // Static assets — cache 1 tahun
      {
        source: '/_next/static/(.*)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      // Gambar publik — cache 7 hari
      {
        source: '/images/(.*)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' }],
      },
      // Gambar upload user — cache 7 hari
      {
        source: '/uploads/(.*)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' }],
      },
      // API tidak di-cache
      {
        source: '/api/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
      // SSE endpoint khusus
      {
        source: '/api/support/events',
        headers: [
          { key: 'Cache-Control',     value: 'no-cache' },
          { key: 'X-Accel-Buffering', value: 'no' },
        ],
      },
      // Security headers semua halaman
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options',        value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy',        value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};
