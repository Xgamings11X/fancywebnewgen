/**
 * components/Icon.js — Pengganti FontAwesome dengan inline SVG murni
 *
 * Semua ikon adalah stroke-based (Lucide-style, viewBox 0 0 24 24, strokeWidth=2),
 * kecuali brand icons (Discord, WhatsApp, Instagram, TikTok, YouTube) yang fill-based.
 *
 * Penggunaan:
 *   <Icon name="arrow-right" />
 *   <Icon name="spinner" size={20} spin />
 *   <Icon name="gear" size={14} color="var(--primary)" style={{marginRight:6}} />
 */

// ── SVG path data (stroke-based kecuali brand) ────────────────────
// Setiap entry bisa berupa:
//   string  → satu <path d="...">
//   array   → multiple child elements (rendered as-is)
//   null    → dirender khusus di renderIcon()

const PATHS = {
  // ── Arrows & Navigation ─────────────────────────────────────────
  'arrow-right':   'M5 12h14M12 5l7 7-7 7',
  'arrow-left':    'M19 12H5M12 19l-7-7 7-7',
  'arrow-up':      'M12 19V5M5 12l7-7 7 7',
  'chevron-right': 'M9 18l6-6-6-6',
  'chevron-left':  'M15 18l-6-6 6-6',
  'chevron-up':    'M18 15l-6-6-6 6',
  'chevron-down':  'M6 9l6 6 6-6',
  'angles-right':  'M13 17l5-5-5-5M6 17l5-5-5-5',
  'angles-left':   'M11 17l-5-5 5-5M18 17l-5-5 5-5',

  // ── Hamburger / Menu ────────────────────────────────────────────
  'bars':          'M3 12h18M3 6h18M3 18h18',
  'search':        ['<circle cx="11" cy="11" r="8"/>',
                    '<line x1="21" y1="21" x2="16.65" y2="16.65"/>'],

  // ── Actions ─────────────────────────────────────────────────────
  'plus':         'M12 5v14M5 12h14',
  'xmark':        'M18 6L6 18M6 6l12 12',
  'pen':          ['<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>',
                   '<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>'],
  'trash':        'M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6',
  'copy':         ['<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>',
                   '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'],
  'floppy-disk':  ['<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>',
                   '<polyline points="17 21 17 13 7 13 7 21"/>',
                   '<polyline points="7 3 7 8 15 8"/>'],
  'paper-plane':  ['<line x1="22" y1="2" x2="11" y2="13"/>',
                   '<polygon points="22 2 15 22 11 13 2 9 22 2"/>'],
  'rotate':       ['<polyline points="23 4 23 10 17 10"/>',
                   '<path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>'],
  'gear':         ['<circle cx="12" cy="12" r="3"/>',
                   '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'],
  'link':         ['<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>',
                   '<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'],
  'broom':        ['<path d="M3 21l7-7"/>',
                   '<path d="M10.93 6.34L7 10.27a1 1 0 0 0 0 1.42l5.31 5.31a1 1 0 0 0 1.41 0l3.94-3.93"/>',
                   '<path d="M18.36 3.64l2 2a2 2 0 0 1 0 2.83L17.12 11.7"/>',
                   '<line x1="14.12" y1="3.64" x2="14.82" y2="4.35"/>'],

  // ── Status & Feedback ────────────────────────────────────────────
  'circle-check':       ['<circle cx="12" cy="12" r="10"/>',
                          '<path d="M9 12l2 2 4-4"/>'],
  'circle-xmark':       ['<circle cx="12" cy="12" r="10"/>',
                          '<line x1="15" y1="9" x2="9" y2="15"/>',
                          '<line x1="9" y1="9" x2="15" y2="15"/>'],
  'circle-exclamation': ['<circle cx="12" cy="12" r="10"/>',
                          '<line x1="12" y1="8" x2="12" y2="12"/>',
                          '<line x1="12" y1="16" x2="12.01" y2="16"/>'],
  'clock':        ['<circle cx="12" cy="12" r="10"/>',
                   '<polyline points="12 6 12 12 16 14"/>'],
  'plus-circle':  ['<circle cx="12" cy="12" r="10"/>',
                   '<line x1="12" y1="8" x2="12" y2="16"/>',
                   '<line x1="8" y1="12" x2="16" y2="12"/>'],
  // spinner rendered dynamically in renderIcon
  'spinner':      null,
  // small dot (online indicator) rendered dynamically
  'circle':       null,

  // ── Content & UI ────────────────────────────────────────────────
  'star':         ['<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'],
  'flag':         ['<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>',
                   '<line x1="4" y1="22" x2="4" y2="15"/>'],
  'ticket':       ['<path d="M15 5v2M15 11v2M15 17v2M5 5h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V7a2 2 0 0 1 2-2z"/>'],
  'receipt':      ['<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z"/>',
                   '<line x1="7" y1="9" x2="17" y2="9"/>',
                   '<line x1="7" y1="13" x2="17" y2="13"/>',
                   '<line x1="7" y1="17" x2="13" y2="17"/>'],
  'inbox':        ['<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>',
                   '<path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6L18.55 5.11A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>'],
  'folder-open':  ['<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>'],
  'box-open':     ['<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>',
                   '<polyline points="3.27 6.96 12 12.01 20.73 6.96"/>',
                   '<line x1="12" y1="22.08" x2="12" y2="12"/>'],
  'image':        ['<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>',
                   '<circle cx="8.5" cy="8.5" r="1.5"/>',
                   '<polyline points="21 15 16 10 5 21"/>'],
  'cloud-arrow-up': ['<path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"/>',
                      '<polyline points="8 17 12 13 16 17"/>',
                      '<line x1="12" y1="13" x2="12" y2="22"/>'],
  'upload':       ['<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
                   '<polyline points="17 8 12 3 7 8"/>',
                   '<line x1="12" y1="3" x2="12" y2="15"/>'],
  'triangle-exclamation': ['<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>',
                            '<line x1="12" y1="9" x2="12" y2="13"/>',
                            '<line x1="12" y1="17" x2="12.01" y2="17"/>'],
  'cart-shopping': ['<circle cx="9" cy="21" r="1"/>',
                     '<circle cx="20" cy="21" r="1"/>',
                     '<path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>'],
  'circle-info':  ['<circle cx="12" cy="12" r="10"/>',
                   '<line x1="12" y1="16" x2="12" y2="12"/>',
                   '<line x1="12" y1="8" x2="12.01" y2="8"/>'],
  'mug':          ['<path d="M17 8h1a4 4 0 0 1 0 8h-1"/>',
                   '<path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/>',
                   '<line x1="6" y1="2" x2="6" y2="4"/>',
                   '<line x1="10" y1="2" x2="10" y2="4"/>',
                   '<line x1="14" y1="2" x2="14" y2="4"/>'],
  'server':       ['<rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>',
                   '<rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>',
                   '<line x1="6" y1="6" x2="6.01" y2="6"/>',
                   '<line x1="6" y1="18" x2="6.01" y2="18"/>'],
  'computer':     ['<rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>',
                   '<line x1="8" y1="21" x2="16" y2="21"/>',
                   '<line x1="12" y1="17" x2="12" y2="21"/>'],
  'mobile':       ['<rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>',
                   '<line x1="12" y1="18" x2="12.01" y2="18"/>'],
  'chart-line':   ['<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>',
                   '<polyline points="17 6 23 6 23 12"/>'],
  'lock':         ['<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>',
                   '<path d="M7 11V7a5 5 0 0 1 10 0v4"/>'],
  'eye':          ['<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>',
                   '<circle cx="12" cy="12" r="3"/>'],
  'eye-slash':    ['<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>',
                   '<path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>',
                   '<path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/>',
                   '<line x1="1" y1="1" x2="23" y2="23"/>'],
  'right-to-bracket':   ['<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>',
                          '<polyline points="10 17 15 12 10 7"/>',
                          '<line x1="15" y1="12" x2="3" y2="12"/>'],
  'right-from-bracket': ['<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>',
                          '<polyline points="16 17 21 12 16 7"/>',
                          '<line x1="21" y1="12" x2="9" y2="12"/>'],
  'check':        'M20 6L9 17l-5-5',
  'ban':          ['<circle cx="12" cy="12" r="10"/>',
                   '<line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>'],
  'credit-card':  ['<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>',
                   '<line x1="1" y1="10" x2="23" y2="10"/>'],
  'gift':         ['<rect x="3" y="8" width="18" height="13" rx="2"/>',
                   '<path d="M12 8v13M3 12h18M7.5 8C5 8 4 6.8 4 5.5S5 3 6.5 3C9 3 12 8 12 8M16.5 8C19 8 20 6.8 20 5.5S19 3 17.5 3C15 3 12 8 12 8"/>'],
  'file-pdf':     ['<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>',
                   '<polyline points="14 2 14 8 20 8"/>',
                   '<path d="M12 18v-6"/>',
                   '<path d="m9 15 3 3 3-3"/>'],
  'gamepad':      ['<rect x="2" y="6" width="20" height="12" rx="6"/>',
                   '<line x1="6" y1="12" x2="10" y2="12"/>',
                   '<line x1="8" y1="10" x2="8" y2="14"/>',
                   '<line x1="15" y1="13" x2="15.01" y2="13"/>',
                   '<line x1="18" y1="11" x2="18.01" y2="11"/>'],
  'cube':         ['<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>',
                   '<polyline points="3.27 6.96 12 12.01 20.73 6.96"/>',
                   '<line x1="12" y1="22.08" x2="12" y2="12"/>'],
  'hourglass-half': ['<path d="M5 22h14"/>',
                   '<path d="M5 2h14"/>',
                   '<path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/>',
                   '<path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>'],
  'list-check':   ['<line x1="10" y1="9" x2="21" y2="9"/>',
                   '<line x1="10" y1="15" x2="21" y2="15"/>',
                   '<path d="M4 9l1 1 2-2"/>',
                   '<path d="M4 15l1 1 2-2"/>'],
  'comments':      ['<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>', '<line x1="9" y1="10" x2="9.01" y2="10"/>', '<line x1="12" y1="10" x2="12.01" y2="10"/>', '<line x1="15" y1="10" x2="15.01" y2="10"/>'],
  'comment-dots': ['<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
                   '<line x1="9" y1="10" x2="9.01" y2="10"/>',
                   '<line x1="12" y1="10" x2="12.01" y2="10"/>',
                   '<line x1="15" y1="10" x2="15.01" y2="10"/>'],
  'shield-halved': ['<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'],
  'bolt':         ['<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>'],
  'trophy':       ['<line x1="12" y1="17" x2="12" y2="22"/>',
                   '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>',
                   '<path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>',
                   '<line x1="8" y1="22" x2="16" y2="22"/>',
                   '<path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/>'],
  'users':        ['<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>',
                   '<circle cx="9" cy="7" r="4"/>',
                   '<path d="M23 21v-2a4 4 0 0 0-3-3.87"/>',
                   '<path d="M16 3.13a4 4 0 0 1 0 7.75"/>'],
  'gavel':        ['<path d="M14.5 2.5l7 7"/>',
                   '<path d="M7.5 9.5l7 7"/>',
                   '<path d="M16 4l-4 4M8 12l-4 4"/>',
                   '<line x1="3" y1="21" x2="9" y2="15"/>'],
  'user-xmark':   ['<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>',
                   '<circle cx="9" cy="7" r="4"/>',
                   '<line x1="17" y1="8" x2="23" y2="14"/>',
                   '<line x1="23" y1="8" x2="17" y2="14"/>'],
  'bug':          ['<rect x="8" y="6" width="8" height="14" rx="4"/>',
                   '<path d="M19 7l-3 2M5 7l3 2"/>',
                   '<path d="M19 12h2M3 12h2"/>',
                   '<path d="M19 17l-3-2M5 17l3-2"/>'],
  'network-wired': ['<rect x="3" y="3" width="7" height="5" rx="1"/>',
                    '<rect x="14" y="3" width="7" height="5" rx="1"/>',
                    '<rect x="8" y="16" width="8" height="5" rx="1"/>',
                    '<path d="M6.5 8v3h11V8"/>',
                    '<line x1="12" y1="11" x2="12" y2="16"/>'],

  // ── Brand Icons (fill-based) ─────────────────────────────────────
  'discord':  null, // rendered in renderIcon
  'whatsapp': null, // rendered in renderIcon
  'instagram': null, // rendered in renderIcon
  'tiktok':   null, // rendered in renderIcon
  'youtube':  null, // rendered in renderIcon
};

/**
 * Renders compound or special-case icons that can't be represented as a simple path list.
 */
function renderIcon(name, color) {
  switch (name) {
    case 'spinner':
      return (
        <circle
          cx="12" cy="12" r="9"
          fill="none"
          stroke={color || 'currentColor'}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="42 15"
        />
      );
    case 'circle':
      return <circle cx="12" cy="12" r="5" fill={color || 'currentColor'} stroke="none"/>;

    // ── Brand icons — pure SVG, fill-based ────────────────────────
    case 'discord':
      return (
        <path fill={color || 'currentColor'} stroke="none" d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
      );
    case 'whatsapp':
      return (
        <path fill={color || 'currentColor'} stroke="none" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
      );
    case 'tiktok':
      return (
        <path fill={color || 'currentColor'} stroke="none" d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.28 6.28 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.95a8.2 8.2 0 0 0 4.8 1.54V7.07a4.85 4.85 0 0 1-1.03-.38z"/>
      );
    case 'instagram':
      return (
        <path fill={color || 'currentColor'} stroke="none" d="M7.75 2h8.5A5.76 5.76 0 0 1 22 7.75v8.5A5.76 5.76 0 0 1 16.25 22h-8.5A5.76 5.76 0 0 1 2 16.25v-8.5A5.76 5.76 0 0 1 7.75 2zm0 2A3.75 3.75 0 0 0 4 7.75v8.5A3.75 3.75 0 0 0 7.75 20h8.5A3.75 3.75 0 0 0 20 16.25v-8.5A3.75 3.75 0 0 0 16.25 4h-8.5zM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm5.25-3.1a1.17 1.17 0 1 1 0 2.34 1.17 1.17 0 0 1 0-2.34z"/>
      );
    case 'youtube':
      return (
        <path fill={color || 'currentColor'} stroke="none" d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/>
      );
    default:
      return null;
  }
}

/**
 * Icon Component
 * @param {string}  name       - icon name (tanpa prefix 'fa-')
 * @param {number}  [size=16]  - lebar & tinggi dalam px
 * @param {string}  [color]    - warna; default 'currentColor'
 * @param {boolean} [spin]     - aktifkan animasi spin (untuk spinner/rotate)
 * @param {object}  [style]    - style tambahan pada elemen SVG
 * @param {string}  [className]- class tambahan
 */
export default function Icon({ name, size = 16, color, spin = false, style, className }) {
  const paths = PATHS[name];
  const isBrand = ['discord','whatsapp','instagram','tiktok','youtube'].includes(name);
  const isCircle = name === 'circle';

  const svgStyle = {
    display: 'inline-block',
    verticalAlign: 'middle',
    flexShrink: 0,
    ...(spin ? { animation: 'spin 0.7s linear infinite' } : {}),
    ...style,
  };

  // Brand icons & special icons: fill-based, no stroke
  if (isBrand || name === 'spinner' || name === 'circle') {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size} height={size}
        fill={isCircle ? (color || 'currentColor') : 'none'}
        aria-hidden="true"
        style={svgStyle}
        className={className}
      >
        {renderIcon(name, color)}
      </svg>
    );
  }

  // Compound icons (array of element strings)
  if (Array.isArray(paths)) {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size} height={size}
        fill="none"
        stroke={color || 'currentColor'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={svgStyle}
        className={className}
        dangerouslySetInnerHTML={{ __html: paths.join('') }}
      />
    );
  }

  // Single path string
  if (typeof paths === 'string') {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size} height={size}
        fill="none"
        stroke={color || 'currentColor'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={svgStyle}
        className={className}
      >
        <path d={paths}/>
      </svg>
    );
  }

  // Fallback for unknown icon names
  return null;
}
