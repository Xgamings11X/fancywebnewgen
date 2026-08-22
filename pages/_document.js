import { Html, Head, Main, NextScript } from 'next/document';

/**
 * Dokumen global untuk resource hint avatar/payment dan font publik.
 * Di layar kecil font sistem diprioritaskan supaya stylesheet eksternal tidak
 * memblokir first paint; font brand tetap dimuat pada tablet/desktop.
 */
export default function Document() {
  return (
    <Html lang="id">
      <Head>
        {/* DNS prefetch untuk domain yang tidak perlu koneksi awal */}
        <link rel="preconnect" href="https://fonts.googleapis.com" media="(min-width: 721px)" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" media="(min-width: 721px)" />
        <link rel="dns-prefetch" href="https://app.sandbox.midtrans.com" />
        <link rel="dns-prefetch" href="https://app.midtrans.com" />
        <link rel="dns-prefetch" href="https://crafatar.com" />
        <link rel="dns-prefetch" href="https://minotar.net" />

        {/* Font brand tidak menghalangi render mobile yang paling sensitif. */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&family=Oxanium:wght@400;500;600;700;800&display=swap"
          media="(min-width: 721px)"
        />

        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />

        {/* PWA & SEO */}
        <meta name="theme-color" content="#06130e" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
