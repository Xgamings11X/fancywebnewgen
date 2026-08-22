# 🗡️ Minecraft Store — Next.js

Store website untuk server Minecraft dengan payment Midtrans, plugin integration, admin panel, dan leaderboard.

---

## 🚀 Cara Setup

### 1. Install dependencies
```bash
corepack enable
pnpm install --frozen-lockfile
```

### 2. Buat file environment
```bash
cp .env.example .env.local
# Edit .env.local sesuai kebutuhan
```

### 3. Jalankan
```bash
# Development
pnpm run dev

# Production
pnpm run build && pnpm start
```

Port mengikuti environment `PORT` (default Next.js: `3000`). Contoh:

```bash
PORT=25580 pnpm start
```

---

## 📁 Data Storage

Kode otomatis mendeteksi lokasi folder data:

| Environment | Path Data Otomatis |
|-------------|-------------------|
| Pterodactyl | `/home/container/data` |
| VPS / Docker (`/app` ada) | `/app/data` |
| Development lokal | `./data` |
| Override manual | Set `DATA_DIR` di `.env.local` |

---

## 🌐 Menghubungkan Domain + Port ke Pterodactyl

### Opsi A: Pakai Subdomain + Cloudflare + Nginx (Recommended)

> Cocok untuk VPS yang juga running Pterodactyl Panel

**Langkah-langkah:**

1. **Arahkan domain ke IP VPS** di Cloudflare DNS:
   ```
   Type : A
   Name : store          (→ store.domainmu.com)
   Value: IP_VPS_KAMU
   Proxy: ON (orange cloud)
   ```

2. **Install Nginx** di VPS:
   ```bash
   apt install nginx certbot python3-certbot-nginx -y
   ```

3. **Buat config Nginx** `/etc/nginx/sites-available/mcstore`:
   ```nginx
   server {
       listen 80;
       server_name store.domainmu.com;

       location / {
           proxy_pass http://localhost:PORT_WEBSITEMU;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

4. **Aktifkan dan pasang SSL:**
   ```bash
   ln -s /etc/nginx/sites-available/mcstore /etc/nginx/sites-enabled/
   nginx -t && systemctl reload nginx
   certbot --nginx -d store.domainmu.com
   ```

5. **Update `.env.local`:**
   ```env
   NEXT_PUBLIC_BASE_URL=https://store.domainmu.com
   ```

---

### Opsi B: Pterodactyl Egg — Port Langsung (Tanpa Domain)

Jika hosting di Pterodactyl dan hanya pakai IP:port:

1. Di panel Pterodactyl → **Server** → **Network** → pastikan port website (misal `3000`) sudah di-allocate
2. Set di `.env.local`:
   ```env
   NEXT_PUBLIC_BASE_URL=http://IP_NODE:PORT_ALLOCATED
   ```
3. Di **Startup** → **Environment Variables**, tambah:
   ```
   DATA_DIR = /home/container/data
   ```

---

### Opsi C: Pterodactyl + Domain via Node Port Allocation

Pterodactyl bisa assign subdomain otomatis via Wings jika panel kamu sudah setup FQDN:

1. Di Pterodactyl Panel → **Nodes** → pilih node → cek **FQDN** (misal: `node1.hostingku.com`)
2. Port yang di-allocate ke server (misal `25580`) bisa diakses via `node1.hostingku.com:25580`
3. Kalau mau tanpa port (port 80/443), tetap butuh Nginx reverse proxy di server node tersebut

---

### Menjalankan di Pterodactyl (Generic Egg)

Gunakan **Generic: Node.js** egg atau buat custom egg dengan:

```
# Startup command
pnpm run build && pnpm start

# Environment variables yang perlu diset di panel:
NODE_ENV=production
PORT=3000               ← port yang di-allocate
DATA_DIR=/home/container/data
JWT_SECRET=xxx
ADMIN_USERNAME=admin
ADMIN_PASSWORD=xxx
MIDTRANS_SERVER_KEY=xxx
MIDTRANS_CLIENT_KEY=xxx
NEXT_PUBLIC_MIDTRANS_CLIENT_KEY=xxx
NEXT_PUBLIC_MIDTRANS_ENV=sandbox
NEXT_PUBLIC_BASE_URL=http://IP_NODE:PORT
```

> ⚠️ Di Pterodactyl, file `.env.local` tidak disimpan permanen saat reinstall. Selalu gunakan **Environment Variables** di panel Pterodactyl, bukan `.env.local`.

---

## ⚙️ Admin Panel

Akses: `http://domainmu.com/admin`

Tab yang tersedia:
- **Dashboard** — statistik order
- **Produk** — kelola item store  
- **Kategori** — kelola kategori
- **Redeem Code** — buat & kelola kode diskon
- **Log Transaksi** — history pembayaran
- **Leaderboard** — Top Voter MinecraftMP dan Top Donatur dari transaksi sukses
- **Pengaturan** — ubah nama server, logo, social media, dll (otomatis refresh web setelah simpan)

---

## 🖼️ Logo

- Upload logo ke Imgur atau Discord CDN
- Salin URL gambar (PNG/WebP dengan background transparan direkomendasikan)
- Masukkan URL di **Admin Panel → Pengaturan → URL Logo**
- Simpan → website otomatis refresh dan favicon ikut berubah


---

## 🏆 Leaderboard dan bantuan

Halaman `/leaderboard` menampilkan dua peringkat dalam satu halaman:

- **Top Voter** dari endpoint leaderboard plugin/MinecraftMP. Request dilakukan server-side dengan `PLUGIN_SERVER_KEY`.
- **Top Donatur** yang dihitung otomatis dari total order berstatus sukses.

Sistem ticket website sudah dihapus. Tombol bantuan sekarang langsung mengarah ke Discord atau WhatsApp dari pengaturan admin/env.
