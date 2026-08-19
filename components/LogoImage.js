/**
 * LogoImage.js
 *
 * PageSpeed optimization:
 * - /fancy-network-logo.webp already contains real alpha transparency, so it is
 *   rendered directly with ZERO canvas/pixel work on the critical path.
 * - Custom logo URLs keep the legacy "remove black background" behaviour.
 * - Custom processing is cached by URL and scheduled outside the first paint.
 */
import { useEffect, useState } from 'react';

const RAW_SRC = '/fancy-network-logo.webp';
const processedLogoCache = new Map();

function removeBlackBg(imgEl, threshold = 40) {
  const canvas = document.createElement('canvas');
  canvas.width = imgEl.naturalWidth;
  canvas.height = imgEl.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return imgEl.src;

  ctx.drawImage(imgEl, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const corners = [
    [0, 0], [canvas.width - 1, 0],
    [0, canvas.height - 1], [canvas.width - 1, canvas.height - 1],
  ];

  let darkCorners = 0;
  for (const [cx, cy] of corners) {
    const i = (cy * canvas.width + cx) * 4;
    if (data[i] < 30 && data[i + 1] < 30 && data[i + 2] < 30) darkCorners++;
  }

  // No black background detected: keep the original image URL. This avoids
  // generating a large base64 PNG for an image that needs no modification.
  if (darkCorners < 2) return imgEl.src;

  const visited = new Uint8Array(canvas.width * canvas.height);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
    const idx = y * canvas.width + x;
    if (visited[idx]) return;
    const i = idx * 4;
    if (data[i] < threshold && data[i + 1] < threshold && data[i + 2] < threshold) {
      visited[idx] = 1;
      stack.push(idx);
    }
  };

  for (const [cx, cy] of corners) push(cx, cy);

  while (stack.length) {
    const idx = stack.pop();
    const x = idx % canvas.width;
    const y = (idx / canvas.width) | 0;
    data[idx * 4 + 3] = 0;
    push(x - 1, y);
    push(x + 1, y);
    push(x, y - 1);
    push(x, y + 1);
  }

  for (let j = 0; j < data.length; j += 4) {
    if (data[j] < 20 && data[j + 1] < 20 && data[j + 2] < 20) data[j + 3] = 0;
  }

  for (let j = 0; j < data.length; j += 4) {
    if (data[j + 3] !== 255) continue;
    const brightness = (data[j] + data[j + 1] + data[j + 2]) / 3;
    if (brightness < threshold * 2) {
      data[j + 3] = Math.round((brightness / (threshold * 2)) * 255);
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

function scheduleIdle(callback) {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    const id = window.requestIdleCallback(callback, { timeout: 800 });
    return () => window.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(callback, 0);
  return () => window.clearTimeout(id);
}

export function useTransparentLogo(rawSrc = RAW_SRC) {
  const resolvedSrc = rawSrc || RAW_SRC;
  const isBundledTransparentLogo = resolvedSrc === RAW_SRC;
  const cached = processedLogoCache.get(resolvedSrc);
  const [src, setSrc] = useState(cached || resolvedSrc);
  const [ready, setReady] = useState(isBundledTransparentLogo || Boolean(cached));

  useEffect(() => {
    let disposed = false;
    let cancelIdle = () => {};

    if (resolvedSrc === RAW_SRC) {
      setSrc(RAW_SRC);
      setReady(true);
      return () => { disposed = true; };
    }

    const cachedSrc = processedLogoCache.get(resolvedSrc);
    if (cachedSrc) {
      setSrc(cachedSrc);
      setReady(true);
      return () => { disposed = true; };
    }

    setSrc(resolvedSrc);
    setReady(false);

    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      cancelIdle = scheduleIdle(() => {
        if (disposed) return;
        try {
          const processed = removeBlackBg(img);
          processedLogoCache.set(resolvedSrc, processed);
          setSrc(processed);
        } catch {
          setSrc(resolvedSrc);
        } finally {
          if (!disposed) setReady(true);
        }
      });
    };
    img.onerror = () => {
      if (!disposed) {
        setSrc(resolvedSrc);
        setReady(true);
      }
    };
    img.src = resolvedSrc;

    return () => {
      disposed = true;
      cancelIdle();
      img.onload = null;
      img.onerror = null;
    };
  }, [resolvedSrc]);

  return { src, ready };
}

export function updateFavicon(src) {
  if (typeof document === 'undefined' || !src) return;
  let link = document.querySelector('link[rel~="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = src;
}

export default function LogoImage({
  src: srcProp = RAW_SRC,
  style = {},
  className = '',
  alt = 'Logo',
  width = 64,
  height = 64,
  decoding = 'async',
  ...rest
}) {
  const { src, ready } = useTransparentLogo(srcProp || RAW_SRC);

  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      decoding={decoding}
      className={className}
      style={{
        background: 'transparent',
        transition: 'opacity 0.2s',
        ...style,
        opacity: ready ? (style.opacity ?? 1) : 0,
      }}
      {...rest}
    />
  );
}
