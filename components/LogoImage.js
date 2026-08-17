/**
 * LogoImage.js
 * Memuat gambar logo, lalu lewat canvas hapus background hitam
 * (threshold-based, semua pixel sangat gelap → transparan).
 * Hasilnya adalah PNG transparan yang dipakai di navbar, hero, dan favicon.
 */
import { useState, useEffect, useRef } from 'react';

// RAW_SRC dikosongkan — logo diambil dari settings.logo_url yang di-pass sebagai prop.
// Tidak ada URL hardcoded supaya gambar tidak hilang di device lain.
const RAW_SRC = '/fancy-network-logo.webp';

/**
 * Proses image → canvas → hapus px hitam → return dataURL PNG transparan
 * threshold: 0–255, pixel dengan R+G+B < threshold*3 dianggap hitam
 */
function removeBlackBg(imgEl, threshold = 40) {
  const canvas = document.createElement('canvas');
  canvas.width  = imgEl.naturalWidth;
  canvas.height = imgEl.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imgEl, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Cek apakah mayoritas sudut pixel adalah hitam (deteksi bg)
  const corners = [
    [0, 0], [canvas.width - 1, 0],
    [0, canvas.height - 1], [canvas.width - 1, canvas.height - 1],
  ];
  let darkCorners = 0;
  for (const [cx, cy] of corners) {
    const i = (cy * canvas.width + cx) * 4;
    if (data[i] < 30 && data[i+1] < 30 && data[i+2] < 30) darkCorners++;
  }

  // Jika background tidak hitam, kembalikan src asli tanpa proses
  if (darkCorners < 2) return canvas.toDataURL('image/png');

  // Flood-fill dari 4 sudut untuk temukan bg pixels → set alpha=0
  const visited = new Uint8Array(canvas.width * canvas.height);
  const stack   = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
    const idx = y * canvas.width + x;
    if (visited[idx]) return;
    const i = idx * 4;
    const r = data[i], g = data[i+1], b = data[i+2];
    if (r < threshold && g < threshold && b < threshold) {
      visited[idx] = 1;
      stack.push([x, y]);
    }
  };
  for (const [cx, cy] of corners) push(cx, cy);

  while (stack.length > 0) {
    const [x, y] = stack.pop();
    const i = (y * canvas.width + x) * 4;
    data[i+3] = 0; // transparent
    push(x-1, y); push(x+1, y); push(x, y-1); push(x, y+1);
  }

  // Juga hapus pixel sangat gelap yang bukan bg (isolated dark pixels)
  for (let j = 0; j < data.length; j += 4) {
    if (data[j] < 20 && data[j+1] < 20 && data[j+2] < 20) {
      data[j+3] = 0;
    }
  }

  // Smooth edge: pixel semi-gelap di tepi logo → semi-transparan
  for (let j = 0; j < data.length; j += 4) {
    if (data[j+3] === 255) {
      const brightness = (data[j] + data[j+1] + data[j+2]) / 3;
      if (brightness < threshold * 2) {
        data[j+3] = Math.round((brightness / (threshold * 2)) * 255);
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * Hook: returns { src, ready }
 * src = dataURL of processed transparent PNG (or fallback raw src)
 */
export function useTransparentLogo(rawSrc = RAW_SRC) {
  const [src,   setSrc]   = useState(null);
  const [ready, setReady] = useState(false);
  const imgRef = useRef(null);

  useEffect(() => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const dataUrl = removeBlackBg(img);
        setSrc(dataUrl);
        setReady(true);
        // Update favicon dinamis
        updateFavicon(dataUrl);
      } catch {
        setSrc(rawSrc);
        setReady(true);
      }
    };
    img.onerror = () => { setSrc(rawSrc); setReady(true); };
    img.src = rawSrc;
    imgRef.current = img;
  }, [rawSrc]);

  return { src: src || rawSrc, ready };
}

/** Ganti favicon halaman dengan dataURL PNG transparan */
export function updateFavicon(dataUrl) {
  if (typeof document === 'undefined') return;
  let link = document.querySelector('link[rel~="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.type = 'image/png';
  link.href = dataUrl;
}

/**
 * <LogoImage> — drop-in <img> dengan background sudah dihapus
 * Props:
 *   src  {string} — URL logo (dari settings.logo_url). Jika kosong, tidak dirender.
 */
export default function LogoImage({ src: srcProp = RAW_SRC, style = {}, className = '', alt = 'Logo', ...rest }) {
  const { src, ready } = useTransparentLogo(srcProp || RAW_SRC);
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={{
        background: 'transparent',
        ...style,
        opacity: ready ? 1 : 0,
        transition: 'opacity 0.3s',
      }}
      {...rest}
    />
  );
}
