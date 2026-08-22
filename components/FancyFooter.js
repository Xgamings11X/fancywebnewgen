import Link from 'next/link';
import Icon from './Icon';
import LogoImage from './LogoImage';

function safeUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

export default function FancyFooter({ serverName = 'Fancy Network', discordUrl = '', settings = {} }) {
  const year = new Date().getFullYear();
  const s = settings || {};
  const javaIp = s.server_ip || 'play.fancynet.my.id';
  const bedrockIp = s.bedrock_ip || javaIp;
  const bedrockPort = String(s.bedrock_port || '19026');
  const resolvedDiscord = safeUrl(s.discord_url || discordUrl || process.env.NEXT_PUBLIC_DISCORD_URL);
  const resolvedWhatsApp = safeUrl(s.whatsapp_url || process.env.NEXT_PUBLIC_WHATSAPP_URL);

  const socials = [
    { href: resolvedDiscord, label: 'Discord', icon: 'discord' },
    { href: resolvedWhatsApp, label: 'WhatsApp', icon: 'whatsapp' },
    { href: safeUrl(s.instagram_url || process.env.NEXT_PUBLIC_INSTAGRAM_URL), label: 'Instagram', icon: 'instagram' },
    { href: safeUrl(s.tiktok_url || process.env.NEXT_PUBLIC_TIKTOK_URL), label: 'TikTok', icon: 'tiktok' },
    { href: safeUrl(s.youtube_url || process.env.NEXT_PUBLIC_YOUTUBE_URL), label: 'YouTube', icon: 'youtube' },
  ].filter(item => item.href);

  return (
    <footer className="public-footer public-footer-fancy">
      <div className="public-footer-top">
        <div className="public-footer-brand-block">
          <div className="public-footer-logo-row">
            <span className="public-footer-logo">{s.logo_url ? <img src={s.logo_url} alt="" width={64} height={64} loading="lazy" decoding="async" /> : <LogoImage alt="" loading="lazy" />}</span>
            <div><strong>{serverName}</strong><small>Survival Economy · Java &amp; Bedrock</small></div>
          </div>
          <p>Server Minecraft Indonesia dengan progression semi-RPG, ekonomi aktif, transaksi otomatis, dan komunitas yang terhubung lewat Discord.</p>
          {socials.length > 0 && (
            <div className="public-footer-socials">
              {socials.map(item => (
                <a key={item.label} href={item.href} target="_blank" rel="noopener noreferrer" aria-label={item.label} title={item.label}>
                  <Icon name={item.icon} size={17} />
                </a>
              ))}
            </div>
          )}
        </div>

        <div className="public-footer-server-card">
          <span className="public-footer-card-label"><Icon name="server" size={15} /> ALAMAT SERVER</span>
          <div><span>Java IP</span><code>{javaIp}</code></div>
          <div><span>Bedrock IP</span><code>{bedrockIp}</code></div>
          <div><span>Bedrock Port</span><code>{bedrockPort}</code></div>
        </div>

        <div className="public-footer-links-grid">
          <div className="public-footer-column">
            <strong>Navigasi</strong>
            <Link href="/">Home</Link>
            <Link href="/store">Store</Link>
            <Link href="/leaderboard">Leaderboard</Link>
            {safeUrl(s.vote_url || process.env.NEXT_PUBLIC_VOTE_URL) && <a href={safeUrl(s.vote_url || process.env.NEXT_PUBLIC_VOTE_URL)} target="_blank" rel="noopener noreferrer">Vote MinecraftMP</a>}
          </div>
          <div className="public-footer-column">
            <strong>Bantuan</strong>
            {resolvedDiscord && <a href={resolvedDiscord} target="_blank" rel="noopener noreferrer">Discord community</a>}
            {resolvedWhatsApp && <a href={resolvedWhatsApp} target="_blank" rel="noopener noreferrer">WhatsApp admin</a>}
            <span>Bantuan dipusatkan melalui Discord dan WhatsApp.</span>
          </div>
        </div>
      </div>

      <div className="public-footer-cta">
        <div>
          <span>SIAP MULAI?</span>
          <h2>Masuk ke server atau lihat produk yang tersedia.</h2>
        </div>
        <div className="public-footer-cta-actions">
          <Link href="/store" className="public-footer-primary-action">BUKA STORE <Icon name="arrow-right" size={15} /></Link>
          <Link href="/leaderboard" className="public-footer-secondary-action">LIHAT LEADERBOARD <Icon name="trophy" size={15} /></Link>
        </div>
      </div>

      <div className="public-footer-bottom">
        <span>© {year} {serverName}. Semua hak dilindungi.</span>
        <span>Minecraft adalah merek dagang Mojang Studios. Tidak berafiliasi dengan Mojang atau Microsoft.</span>
      </div>
    </footer>
  );
}
