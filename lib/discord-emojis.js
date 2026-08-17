/**
 * Custom Discord emoji Fancy Network.
 *
 * File ini memakai ES module agar kompatibel dengan source Next.js project.
 * Gunakan hanya di payload Discord webhook/bot; string ini tidak dirender
 * sebagai emoji di halaman web biasa.
 */
const DISCORD_EMOJIS = Object.freeze({
  // Status Server
  ONLINE:      '<a:on:1519596454933565601>',
  OFFLINE:     '<a:off:1519596457894740068>',
  MAINTENANCE: '<a:mt:1519596447421431929>',

  // Aksi / Feedback
  CHECK:   '<a:checkk:1519703292655960074>',
  DONE:    '<a:ceklis:1519599440699199539>',
  CEKLIS:  '<a:check:1519599444218220574>',
  WARNING: '<a:warning:1519700307850956941>',
  WARN:    '<a:warn6:1519600052308414506>',
  LOADING: '<a:load:1519596445345513503>',

  // Navigasi
  ARROW:   '<a:arrow:1519700305342894271>',
  RKPANAH: '<a:rkpanah:1519700298539602040>',

  // Branding
  MINECRAFT:   '<a:Minecraft:1514521457860939796>',
  CRAFT:       '<a:arrow:1519700305342894271>',
  STAFF:       '<a:uh_stafflogo:1514524013643305060>',
  ATTENTION:   '<a:AttentionAnimated:1514521916281589780>',
  EXCLAMATION: '<a:rolereact_exclamation:1514526767149219880>',
  ROLES:       '<a:SE_roles:1514825647539621919>',
  MONEY:       '<a:money_tower:1514920403523600534>',
  FIXED:       '<a:mt:1519596447421431929>',

  // Payment
  PAY_MONEY:    '<:money:1519954941924479008>',
  PAY_DANA:     '<:FS_Dana:1514522119663390801>',
  PAY_OVO:      '<:Ls_ovo:1514522052344680538>',
  PAY_GOPAY:    '<:GS_gopay:1514522097060417598>',
  PAY_BENEFITS: '<:paypal:1519954937893884055>',
  PAY_BANK:     '<:bank:1519954939772928111>',
  PAY_QRIS:     '<:qris:1519955580809248839>',

  BUY: '<a:buy:1519986111940788305>',
  DEV: '<a:devv:1519986107801145454>',
  CS:  '<a:cs:1519986109914808370>',

  // Alias lama agar kode bot yang sudah memakai lowercase tetap kompatibel.
  buy:  '<a:buy:1519986111940788305>',
  devv: '<a:devv:1519986107801145454>',
  cs:   '<a:cs:1519986109914808370>',
});

export default DISCORD_EMOJIS;
export { DISCORD_EMOJIS };
