/**
 * LogoImage.js
 * Optimized transparent-logo loader.
 * - Built-in logo already contains alpha, so it bypasses canvas entirely.
 * - Remote/custom logos are processed at most once per URL and cached in-memory.
 * - Pixel work is scheduled outside the critical route/render path when possible.
 */
import { useEffect, useState } from 'react';

const RAW_SRC = '/fancy-network-logo.webp';
const processedLogoCache = new Map([[RAW_SRC, RAW_SRC]]);
const pendingLogoCache = new Map();

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
    if (data[i + 3] > 0 && data[i] < 30 && data[i + 1] < 30 && data[i + 2] < 30) darkCorners++;
  }

  // Transparent/non-black corners mean there is no black background to remove.
  // Returning the original URL avoids an unnecessary PNG encode + huge data URL.
  if (darkCorners < 2) return imgEl.src;

  const width = canvas.width;
  const height = canvas.height;
  const visited = new Uint8Array(width * height);
  // Integer indices are much cheaper than allocating [x, y] arrays for every pixel.
  const stack = [];
  const pushIndex = (idx) => {
    if (idx < 0 || idx >= width * height || visited[idx]) return;
    const i = idx * 4;
    if (data[i] < threshold && data[i + 1] < threshold && data[i + 2] < threshold) {
      visited[idx] = 1;
      stack.push(idx);
    }
  };

  pushIndex(0);
  pushIndex(width - 1);
  pushIndex((height - 1) * width);
  pushIndex(width * height - 1);

  while (stack.length) {
    const idx = stack.pop();
    const x = idx % width;
    const i = idx * 4;
    data[i + 3] = 0;
    if (x > 0) pushIndex(idx - 1);
    if (x + 1 < width) pushIndex(idx + 1);
    if (idx >= width) pushIndex(idx - width);
    if (idx + width < width * height) pushIndex(idx + width);
  }

  for (let j = 0; j < data.length; j += 4) {
    if (data[j] < 20 && data[j + 1] < 20 && data[j + 2] < 20) {
      data[j + 3] = 0;
      continue;
    }
    if (data[j + 3] === 255) {
      const brightness = (data[j] + data[j + 1] + data[j + 2]) / 3;
      if (brightness < threshold * 2) data[j + 3] = Math.round((brightness / (threshold * 2)) * 255);
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

function schedulePixelWork(task) {
  if (typeof window === 'undefined') return () => {};
  if ('requestIdleCallback' in window) {
    const id = window.requestIdleCallback(task, { timeout: 700 });
    return () => window.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(task, 0);
  return () => window.clearTimeout(id);
}

function processLogo(rawSrc) {
  if (!rawSrc || rawSrc === RAW_SRC) return Promise.resolve(RAW_SRC);
  if (processedLogoCache.has(rawSrc)) return Promise.resolve(processedLogoCache.get(rawSrc));
  if (pendingLogoCache.has(rawSrc)) return pendingLogoCache.get(rawSrc);

  const promise = new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      schedulePixelWork(() => {
        let result = rawSrc;
        try { result = removeBlackBg(img); } catch {}
        processedLogoCache.set(rawSrc, result);
        resolve(result);
      });
    };
    img.onerror = () => {
      processedLogoCache.set(rawSrc, rawSrc);
      resolve(rawSrc);
    };
    img.src = rawSrc;
  }).finally(() => pendingLogoCache.delete(rawSrc));

  pendingLogoCache.set(rawSrc, promise);
  return promise;
}

export function useTransparentLogo(rawSrc = RAW_SRC) {
  const normalized = rawSrc || RAW_SRC;
  const cached = processedLogoCache.get(normalized);
  const [src, setSrc] = useState(cached || normalized);
  const [ready, setReady] = useState(Boolean(cached) || normalized === RAW_SRC);

  useEffect(() => {
    let active = true;
    const immediate = processedLogoCache.get(normalized);
    if (immediate) {
      setSrc(immediate);
      setReady(true);
      return () => { active = false; };
    }

    // Show the supplied URL immediately. If it needs black-background cleanup,
    // processing happens in idle time and swaps in the cached result afterwards.
    setSrc(normalized);
    setReady(true);
    processLogo(normalized).then(result => {
      if (!active) return;
      setSrc(result);
      updateFavicon(result);
    });
    return () => { active = false; };
  }, [normalized]);

  return { src, ready };
}

export function updateFavicon(value) {
  if (typeof document === 'undefined' || !value) return;
  let link = document.querySelector('link[rel~="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  if (value.startsWith('data:image/png')) link.type = 'image/png';
  link.href = value;
}

export default function LogoImage({ src: srcProp = RAW_SRC, style = {}, className = '', alt = 'Logo', ...rest }) {
  const { src, ready } = useTransparentLogo(srcProp || RAW_SRC);
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      decoding="async"
      style={{
        background: 'transparent',
        ...style,
        opacity: ready ? 1 : 0,
        transition: 'opacity 0.18s ease',
      }}
      {...rest}
    />
  );
}
