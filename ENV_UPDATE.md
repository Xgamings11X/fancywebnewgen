# Environment terbaru

Salin nilai yang sesuai ke `.env.local` atau Environment Variables hosting. Jangan commit key asli.

```env
NEXT_PUBLIC_BASE_URL=https://domainmu.com

PLUGIN_HTTP_URL=http://IP_SERVER_MINECRAFT:12025
PLUGIN_SERVER_KEY=isi-server-key-dari-config-plugin

MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxxxxxxxxxxxxxxxxx
MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxxxxxxxxxxxxxxxxxx
MIDTRANS_ENV=sandbox
NEXT_PUBLIC_MIDTRANS_ENV=sandbox

JWT_SECRET=ganti-dengan-random-hex-64-karakter
ADMIN_USERNAME=admin
ADMIN_PASSWORD=ganti-password-kuat

DISCORD_WEBHOOK_ADMIN=https://discord.com/api/webhooks/xxx/admin
DISCORD_WEBHOOK_PLAYER=https://discord.com/api/webhooks/xxx/player
DISCORD_WEBHOOK_TX=

NEXT_PUBLIC_DISCORD_URL=https://discord.gg/xxxxxx
NEXT_PUBLIC_WHATSAPP_URL=https://wa.me/628xxxxxxxxxx
NEXT_PUBLIC_VOTE_URL=https://minecraft-mp.com/server/xxxxx/vote/
NEXT_PUBLIC_INSTAGRAM_URL=https://instagram.com/servermu
NEXT_PUBLIC_TIKTOK_URL=https://tiktok.com/@servermu
NEXT_PUBLIC_YOUTUBE_URL=https://youtube.com/@servermu
NEXT_PUBLIC_FAMOUS_APPLY_URL=https://discord.gg/xxxxxx

# Opsional: kosongkan agar otomatis memakai PLUGIN_HTTP_URL/api/leaderboard
LEADERBOARD_ENDPOINT=
LEADERBOARD_BOARD_VOTES=votes
```

`PLUGIN_SERVER_KEY` juga mengamankan request Top Voter melalui header `X-Server-Key`. Variabel ticket Discord lama (`DISCORD_BOT_TOKEN`, `DISCORD_TICKET_*`, `DISCORD_SUPPORT_ROLE_ID`, dan `DISCORD_WEBHOOK_REPORT`) sudah tidak dipakai.
