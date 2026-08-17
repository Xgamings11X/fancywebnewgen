/**
 * components/ImageUpload.js
 * Upload gambar reusable — klik ATAU drag & drop.
 *
 * FIX drag & drop:
 *  - Pakai counter (dragCounter) bukan boolean, supaya child elements
 *    tidak trigger onDragLeave palsu saat mouse masih di dalam zona.
 *  - pointer-events: none pada semua child supaya event selalu landing
 *    di elemen drop zone, bukan di child-nya.
 *  - onDragEnter + onDragLeave pakai counter agar akurat.
 *
 * Props:
 *   value       {string}   URL saat ini (preview)
 *   onChange    {fn}       dipanggil dengan URL baru setelah upload
 *   label       {string}   label di atas komponen
 *   hint        {string}   teks kecil di bawah
 *   previewSize {number}   ukuran preview px (default 80)
 *   accept      {string}   MIME types diterima
 *   maxMB       {number}   batas ukuran MB (default 2)
 *   adminToken  {string}   token admin
 */
import { useRef, useState, useCallback } from 'react';
import Icon from './Icon';

export default function ImageUpload({
  value       = '',
  onChange,
  label       = 'Gambar',
  hint        = 'JPG, PNG, WEBP, GIF · Maks 2MB',
  previewSize = 80,
  accept      = 'image/jpeg,image/png,image/webp,image/gif',
  maxMB       = 2,
  adminToken  = '',
}) {
  const inputRef       = useRef(null);
  const dragCounter    = useRef(0);          // ← kunci fix "stuck"
  const [loading,  setLoading]  = useState(false);
  const [drag,     setDrag]     = useState(false);
  const [error,    setError]    = useState('');

  // ─── Upload ke API ────────────────────────────────────────────
  const uploadFile = useCallback(async (file) => {
    setError('');
    if (!file) return;

    const allowed = ['image/jpeg','image/jpg','image/png','image/webp','image/gif'];
    if (!allowed.includes(file.type)) {
      setError('Format tidak didukung. Gunakan JPG, PNG, WEBP, atau GIF.');
      return;
    }
    if (file.size > maxMB * 1024 * 1024) {
      setError(`Ukuran file maksimal ${maxMB}MB.`);
      return;
    }

    setLoading(true);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const headers = { 'Content-Type': 'application/json' };
      if (adminToken) headers['Authorization'] = `Bearer ${adminToken}`;

      const res  = await fetch('/api/admin/upload', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          filename: file.name.replace(/\.[^.]+$/, ''),
          type:     file.type,
          data:     base64,
        }),
      });
      const json = await res.json();
      if (json.success && json.url) {
        onChange?.(json.url);
      } else {
        setError(json.message || 'Upload gagal.');
      }
    } catch (e) {
      setError('Gagal mengunggah: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [maxMB, adminToken, onChange]);

  // ─── File input ───────────────────────────────────────────────
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = '';
  };

  // ─── Drag & drop handlers (counter trick) ─────────────────────
  // dragCounter naik saat masuk elemen/child, turun saat keluar.
  // Hanya set drag=false saat counter kembali ke 0 (benar-benar keluar).
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (dragCounter.current === 1) setDrag(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) setDrag(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();   // wajib agar onDrop bisa terpicu
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setDrag(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    setError('');
    onChange?.('');
  };

  // ─── Styles ───────────────────────────────────────────────────
  const zoneStyle = {
    border:     `2px dashed ${drag ? 'var(--primary)' : error ? '#e74c3c' : 'rgba(255,255,255,0.12)'}`,
    borderRadius: 10,
    padding:    '12px 14px',
    display:    'flex',
    alignItems: 'center',
    gap:        14,
    background: drag ? 'rgba(255,107,0,0.08)' : 'rgba(255,255,255,0.02)',
    cursor:     loading ? 'default' : 'pointer',
    transition: 'border-color 0.15s, background 0.15s',
    userSelect: 'none',
    position:   'relative',
  };

  // pointer-events: none pada semua child agar event drag selalu
  // tertangkap oleh elemen zona (parent), bukan child-nya.
  const childStyle = { pointerEvents: 'none' };

  const previewStyle = {
    width:    previewSize,
    height:   previewSize,
    minWidth: previewSize,
    objectFit:'contain',
    borderRadius: 8,
    border:   '1px solid rgba(255,107,0,0.2)',
    background:'#16161e',
    ...childStyle,
  };

  const placeholderStyle = {
    width:    previewSize,
    height:   previewSize,
    minWidth: previewSize,
    borderRadius: 8,
    border:   '1px solid rgba(255,255,255,0.08)',
    background:'#16161e',
    display:  'flex',
    alignItems:'center',
    justifyContent:'center',
    flexDirection:'column',
    gap:      4,
    color:    'var(--text-muted)',
    fontSize: 11,
    ...childStyle,
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      {label && (
        <label style={{ fontSize:12, fontWeight:600, color:'var(--text-muted)', letterSpacing:'0.04em' }}>
          {label}
        </label>
      )}

      {/* Drop zone */}
      <div
        style={zoneStyle}
        onClick={() => !loading && inputRef.current?.click()}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Preview / placeholder — pointer-events: none agar tidak nyerap drag event */}
        {value ? (
          <img src={value} alt="preview" style={previewStyle} onError={e=>{e.target.style.opacity=0.3;}}/>
        ) : (
          <div style={placeholderStyle}>
            <Icon name="image" size={22} color="rgba(255,107,0,0.35)"/>
            <span style={{fontSize:10}}>No image</span>
          </div>
        )}

        {/* Info — pointer-events: none */}
        <div style={{flex:1, display:'flex', flexDirection:'column', gap:6, ...childStyle}}>
          {loading ? (
            <span style={{fontSize:13, color:'var(--primary)', display:'flex', alignItems:'center', gap:6}}>
              <Icon name="spinner" size={14} spin style={{marginRight:6}}/> Mengunggah...
            </span>
          ) : drag ? (
            <span style={{fontSize:14, color:'var(--primary)', fontWeight:700}}>
              <Icon name="cloud-arrow-up" size={14} style={{marginRight:8}}/>Lepaskan untuk upload
            </span>
          ) : (
            <>
              <span style={{fontSize:13, color:'#fff', fontWeight:600}}>
                <Icon name="upload" size={14} style={{marginRight:6, color:'var(--primary)'}}/>
                {value ? 'Ganti Gambar' : 'Upload Gambar'}
              </span>
              <span style={{fontSize:11, color:'var(--text-muted)'}}>Klik atau drag &amp; drop file di sini</span>
              <span style={{fontSize:10, color:'rgba(255,255,255,0.2)'}}>{hint}</span>
            </>
          )}

          {/* URL manual — pointer-events harus aktif kembali untuk input */}
          {!loading && !drag && (
            <div style={{display:'flex', gap:6, alignItems:'center', marginTop:2, pointerEvents:'auto'}}>
              <input
                type="text"
                placeholder="Atau tempel URL langsung..."
                value={value}
                onClick={e => e.stopPropagation()}
                onChange={e => { setError(''); onChange?.(e.target.value); }}
                className="admin-input"
                style={{fontSize:11, padding:'4px 8px', flex:1}}
              />
              {value && (
                <button
                  type="button"
                  onClick={handleClear}
                  style={{background:'none', border:'none', color:'#e74c3c', cursor:'pointer', fontSize:14, padding:'0 4px', pointerEvents:'auto'}}
                  title="Hapus gambar"
                >
                  <Icon name="xmark" size={13}/>
                </button>
              )}
            </div>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleFileChange}
          style={{display:'none'}}
        />
      </div>

      {error && (
        <span style={{fontSize:11, color:'#e74c3c', display:'flex', alignItems:'center', gap:5}}>
          <Icon name="triangle-exclamation" size={13} style={{marginRight:6}}/> {error}
        </span>
      )}
    </div>
  );
}
