# Setup Discord Ticket Bridge

## 1. Buat bot

Buat application dan bot melalui Discord Developer Portal. Simpan token bot secara rahasia.

## 2. Invite bot

Berikan permission:

- View Channels
- Manage Channels
- Send Messages
- Read Message History

Bot tidak membutuhkan Administrator bila permission kategori dan role diatur dengan benar.

## 3. Siapkan Discord

Buat:

- satu kategori untuk ticket aktif;
- satu role support/staff;
- kategori arsip opsional.

Aktifkan Developer Mode di Discord lalu salin ID guild, kategori, dan role.

## 4. Environment variables

```env
NEXT_PUBLIC_BASE_URL=https://domainmu.com
DISCORD_BOT_TOKEN=TOKEN_BOT
DISCORD_GUILD_ID=ID_GUILD
DISCORD_TICKET_CATEGORY_ID=ID_KATEGORI_TICKET
DISCORD_SUPPORT_ROLE_ID=ID_ROLE_STAFF
DISCORD_TICKET_ARCHIVE_CATEGORY_ID=ID_KATEGORI_ARSIP
DISCORD_TICKET_DELETE_ON_CLEANUP=false
```

Restart website setelah mengubah environment variable.

## 5. Cara kerja

- Ticket web membuat channel Discord privat otomatis.
- Role support diberi akses.
- Player diberi akses bila mengisi Discord User ID pada form web.
- Balasan web dikirim ke Discord.
- Balasan manusia di Discord masuk ke chat web.
- Balasan admin panel juga dikirim ke Discord.

## 6. Command staf

```text
!close / !resolve / !selesai
!reject / !tolak
!reopen / !open / !buka
```

Command status dari player diabaikan.

## 7. Troubleshooting

- `discord_bridge_status: error`: periksa token, ID kategori, permission bot, dan log server.
- Channel dibuat tetapi staff tidak melihatnya: pastikan `DISCORD_SUPPORT_ROLE_ID` benar dan role bot berada cukup tinggi.
- Emoji custom tidak muncul: bot harus berada di guild tempat emoji tersedia atau emoji harus dapat digunakan oleh bot.
- Player tidak dapat membuka channel: player harus mengisi Discord User ID numerik, bukan username Discord.
