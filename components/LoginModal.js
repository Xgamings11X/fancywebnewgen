import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import Icon from './Icon';

const UUID_RE = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

function PlayerHeadPreview({ uuid, username, size = 80 }) {
  const validUuid = uuid && UUID_RE.test(uuid);
  const name = username || 'steve';
  const fallback = `https://minotar.net/helm/${encodeURIComponent(name.replace(/^\./, ''))}/${size * 2}`;
  const preferred = validUuid ? `https://crafatar.com/renders/head/${uuid}?size=${size * 2}&overlay` : fallback;
  const [src, setSrc] = useState(preferred);

  useEffect(() => setSrc(preferred), [preferred]);

  return (
    <img
      src={src}
      alt={`Avatar ${name}`}
      width={size}
      height={size}
      className="login-head-preview"
      referrerPolicy="no-referrer"
      onError={() => setSrc(fallback)}
    />
  );
}

export default function LoginModal({ onClose, onSuccess, product }) {
  const [platform, setPlatform] = useState('java');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const successTimerRef = useRef(null);
  const dialogRef = useRef(null);
  const usernameRef = useRef(null);
  const previousFocusRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const modalStateRef = useRef({ loading: false, preview: null });
  onCloseRef.current = onClose;
  modalStateRef.current = { loading, preview };

  const isBedrock = platform === 'bedrock';
  const cleanUsername = username.trim().replace(/^\.+/, '');
  const finalUsername = isBedrock ? `.${cleanUsername}` : cleanUsername;

  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => usernameRef.current?.focus(), 50);

    const handleKeyDown = event => {
      if (event.key === 'Escape' && !modalStateRef.current.preview && !modalStateRef.current.loading) {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const items = [...dialogRef.current.querySelectorAll(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      window.clearTimeout(timer);
      if (successTimerRef.current) window.clearTimeout(successTimerRef.current);
      previousFocusRef.current?.focus?.();
    };
  }, []);

  const changePlatform = nextPlatform => {
    if (loading) return;
    setPlatform(nextPlatform);
    setError('');
    setUsername('');
    window.setTimeout(() => usernameRef.current?.focus(), 0);
  };

  const handleSubmit = async event => {
    event.preventDefault();
    if (!cleanUsername || loading) return;

    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ username: finalUsername, platform }),
        credentials: 'include',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success || !data.player) {
        throw new Error(data.message || 'Username tidak ditemukan di server.');
      }

      setPreview(data.player);
      if (data.token) {
        try { localStorage.setItem('mc_token', data.token); } catch {}
      }
      successTimerRef.current = window.setTimeout(() => {
        toast.success(`Selamat datang, ${data.player.displayName || data.player.username}!`);
        onSuccess?.(data.player);
      }, 900);
    } catch (submitError) {
      setError(submitError?.message || 'Tidak dapat terhubung ke server. Coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fn-modal-overlay"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget && !preview && !loading) onClose?.();
      }}
    >
      <div
        ref={dialogRef}
        className="login-modal-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-modal-title"
        aria-describedby="login-modal-description"
      >
        <aside className="login-modal-aside">
          <span className="login-modal-aside-label">FANCY ACCOUNT</span>
          <h2>Masuk sekali, gunakan di seluruh website.</h2>
          <p>Login memakai akun Minecraft yang sudah pernah masuk ke server. Tidak membutuhkan password Minecraft.</p>
          <ul>
            <li><Icon name="circle-check" size={16} /> Beli rank dan item</li>
            <li><Icon name="circle-check" size={16} /> Buat serta balas ticket</li>
            <li><Icon name="circle-check" size={16} /> Java dan Bedrock didukung</li>
          </ul>
          {product && (
            <div className="login-modal-product">
              <span>Produk pilihan</span>
              <strong>{product.name}</strong>
            </div>
          )}
        </aside>

        <section className="login-modal-panel">
          {preview ? (
            <div className="login-success-wrap" aria-live="polite">
              <span className="login-success-icon"><Icon name="circle-check" size={24} /></span>
              <PlayerHeadPreview uuid={preview.uuid} username={preview.username} size={92} />
              <span className="login-success-kicker">LOGIN BERHASIL</span>
              <h2 id="login-modal-title">{preview.displayName || preview.username}</h2>
              <p id="login-modal-description">Akun sedang dihubungkan ke website.</p>
              {preview.rank && preview.rank !== 'default' && <strong className="login-success-rank">{String(preview.rank).toUpperCase()}</strong>}
            </div>
          ) : (
            <>
              <div className="login-modal-head">
                <div>
                  <span className="login-modal-kicker">AKUN PEMAIN</span>
                  <h2 id="login-modal-title">{product ? 'Login untuk melanjutkan pembelian' : 'Masuk ke website'}</h2>
                  <p id="login-modal-description">Pilih edisi Minecraft lalu masukkan username yang tercatat di server.</p>
                </div>
                <button type="button" onClick={onClose} className="login-modal-close" disabled={loading} aria-label="Tutup modal login">
                  <Icon name="xmark" size={17} />
                </button>
              </div>

              <div className="login-platform-grid" role="tablist" aria-label="Pilih platform Minecraft">
                <button
                  type="button"
                  role="tab"
                  aria-selected={platform === 'java'}
                  disabled={loading}
                  className={`login-platform-card${platform === 'java' ? ' active' : ''}`}
                  onClick={() => changePlatform('java')}
                >
                  <span><Icon name="mug" size={20} /></span>
                  <div><strong>Java Edition</strong><small>Username tanpa titik</small></div>
                  <Icon name="circle-check" size={16} className="login-platform-check" />
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={platform === 'bedrock'}
                  disabled={loading}
                  className={`login-platform-card${platform === 'bedrock' ? ' active' : ''}`}
                  onClick={() => changePlatform('bedrock')}
                >
                  <span><Icon name="mobile" size={20} /></span>
                  <div><strong>Bedrock Edition</strong><small>Prefix titik otomatis</small></div>
                  <Icon name="circle-check" size={16} className="login-platform-check" />
                </button>
              </div>

              {error && (
                <div className="login-error" role="alert">
                  <Icon name="circle-exclamation" size={16} />
                  <p>{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="login-form">
                <label htmlFor="minecraft-username">{isBedrock ? 'Nickname Bedrock' : 'Username Java'}</label>
                <div className="login-input-shell">
                  <Icon name={isBedrock ? 'mobile' : 'mug'} size={18} />
                  {isBedrock && <span className="login-input-prefix">.</span>}
                  <input
                    ref={usernameRef}
                    id="minecraft-username"
                    type="text"
                    value={username}
                    onChange={event => setUsername(event.target.value.replace(/^\.+/, ''))}
                    placeholder={isBedrock ? 'NicknameBedrock' : 'UsernameJava'}
                    maxLength={20}
                    autoComplete="username"
                    disabled={loading}
                    required
                  />
                </div>
                <p className="login-field-help">
                  {isBedrock && cleanUsername
                    ? <>Nama yang dicek di server: <strong>.{cleanUsername}</strong></>
                    : 'Akun harus sudah pernah join ke server minimal satu kali.'}
                </p>

                <button type="submit" className="login-submit-button" disabled={loading || !cleanUsername}>
                  {loading ? <><Icon name="spinner" size={16} spin /> Memeriksa akun...</> : <><Icon name="right-to-bracket" size={16} /> Masuk</>}
                </button>
              </form>

              <div className="login-security-note">
                <Icon name="shield-halved" size={16} />
                Website hanya memverifikasi data player melalui plugin server dan tidak meminta password Minecraft.
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
