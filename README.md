# Audio → Roblox Converter

Web app buat convert link YouTube/Spotify jadi audio (atur speed & volume), lalu upload langsung ke Roblox sebagai Audio asset lewat Open Cloud API. Ada sistem akun, limit gratis 2x/hari, upgrade Premium (Midtrans), dan admin panel.

## Fitur

- 🎵 Convert dari YouTube & Spotify (Spotify di-resolve lewat pencarian YouTube, karena Spotify DRM-protected)
- 🎚️ Atur speed (0.5x–3x) & amplify volume (dB) sebelum convert
- ☁️ Auto-upload ke Roblox via Open Cloud Assets API
- 🔐 Login pakai **Discord OAuth** — gak ada password, user pertama login otomatis jadi admin
- 🆓 Free tier: **2x convert/hari**, reset otomatis tiap hari
- 💎 Premium: unlimited convert, bayar via Midtrans (bulanan/tahunan)
- 🛠️ Admin panel: kelola user, upgrade/downgrade manual, ban, lihat statistik revenue & pemakaian
- 🐳 Siap di-deploy 24/7 gratis pakai Docker + Oracle Cloud Free Tier (lihat `DEPLOY.md`)

## Yang perlu diinstall (buat run lokal)

1. **Node.js** 18+
2. **yt-dlp** — `pip install -U yt-dlp`
3. **ffmpeg** — Windows: https://ffmpeg.org/download.html (tambahin ke PATH) · Mac: `brew install ffmpeg` · Ubuntu: `sudo apt install ffmpeg`

> Kalau mau langsung jalan di server 24/7 tanpa install manual, pakai Docker — semua dependency (Node, yt-dlp, ffmpeg) udah di-bundle di `Dockerfile`. Lihat `DEPLOY.md`.

## Setup lokal (tanpa Docker)

```bash
npm install
cp .env.example .env
```

Edit `.env` — minimal isi:
```
JWT_SECRET=ganti-dengan-string-acak-panjang
DISCORD_CLIENT_ID=          # dari discord.com/developers/applications
DISCORD_CLIENT_SECRET=
DISCORD_REDIRECT_URI=http://localhost:3000/api/auth/discord/callback
ROBLOX_API_KEY=          # opsional, bisa diisi langsung dari UI browser juga
MIDTRANS_SERVER_KEY=     # opsional, tanpa ini fitur upgrade Premium gak aktif
MIDTRANS_CLIENT_KEY=
```

Jalankan:
```bash
npm start
```

Buka `http://localhost:3000` → otomatis diarahkan ke halaman login/register.

## Setup dengan Docker (rekomendasi buat production)

```bash
cp .env.example .env
# edit .env dulu
docker compose up -d --build
```

## Cara pakai

1. Buka app → klik **Login with Discord** → izinkan akses → otomatis masuk (yang login **pertama kali** jadi admin)
2. Isi **Open Cloud API Key** Roblox + User/Group ID di panel kanan dashboard
3. Pilih tab YouTube/Spotify → paste link → Search
4. Atur Speed/Amplify/Format sesuai kebutuhan
5. Klik **Convert & Upload ke Roblox**
6. Free tier dapet **2x convert/hari** — abis itu muncul ajakan upgrade Premium
7. **Admin panel** (`/admin.html`) buat kelola semua user: ubah tier manual, ban, lihat statistik

## Cara setup Discord OAuth (login)

1. Buka https://discord.com/developers/applications → **New Application** → kasih nama bebas
2. Ke tab **OAuth2** → catat **Client ID** dan **Client Secret**
3. Di bagian **Redirects**, klik **Add Redirect** dan isi persis:
   ```
   http://localhost:3000/api/auth/discord/callback
   ```
   (kalau udah deploy online, ganti `localhost:3000` dengan domain kamu)
4. Isi ke `.env`:
   ```
   DISCORD_CLIENT_ID=xxxxxxxxxxxx
   DISCORD_CLIENT_SECRET=xxxxxxxxxxxx
   DISCORD_REDIRECT_URI=http://localhost:3000/api/auth/discord/callback
   ```
5. Restart server — tombol "Login with Discord" langsung berfungsi

## Cara dapat Roblox Open Cloud API Key

1. https://create.roblox.com/dashboard/credentials → **Create API Key**
2. Tambahin permission **Assets API** → `asset:write`, scope ke User/Group ID kamu
3. Copy key-nya, paste di app (disimpan lokal di browser)

## Cara setup Midtrans (buat fitur pembayaran Premium)

1. Daftar gratis di https://dashboard.midtrans.com
2. Mode **Sandbox** dulu buat testing (gak ada uang beneran) — nanti tinggal ganti ke **Production** + `MIDTRANS_IS_PRODUCTION=true` kalau udah siap terima pembayaran asli
3. Ambil **Server Key** dan **Client Key** dari Settings → Access Keys
4. Isi ke `.env`:
   ```
   MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxx
   MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxxx
   ```
5. Set **Payment Notification URL** di dashboard Midtrans (Settings → Configuration) ke:
   ```
   https://domainkamu.com/api/payment/webhook
   ```
   Ini wajib biar status pembayaran otomatis update ke akun user (kalau app masih di localhost, webhook ini gak akan sampai — perlu domain publik yang bisa diakses Midtrans, minimal pakai Cloudflare Tunnel/ngrok buat testing)

## Struktur folder

```
server/
  index.js                  # entry point express
  routes/
    auth.js                  # login Discord OAuth + /me
    payment.js                 # checkout Midtrans + webhook
    admin.js                    # kelola user & stats (khusus admin)
    resolve.js                    # metadata YouTube/Spotify
    convert.js                     # download + ffmpeg processing (kena limit free tier)
    upload.js                       # push ke Roblox Open Cloud
  services/
    db.js                     # simple JSON-file database (users/usage/payments)
    auth.js                    # JWT issue/verify
    discord.js                   # Discord OAuth2 (authorize URL, token exchange, profile)
    payment.js                  # Midtrans Snap integration
    ytdlp.js, spotify.js, ffmpeg.js, robloxUpload.js
  middleware/
    auth.js                   # requireAuth, requireAdmin
    usageLimit.js               # enforce limit 2x/hari buat free tier
public/
  index.html, app.js, style.css     # dashboard utama
  login.html                          # tombol "Login with Discord"
  auth-callback.html                    # landing setelah OAuth redirect
  admin.html                          # panel admin
  auth-common.js, auth.css             # helper & style bersama
data/                          # dibuat otomatis — users.json, usage.json, payments.json
Dockerfile, docker-compose.yml   # buat deploy 24/7
DEPLOY.md                          # panduan lengkap deploy ke Oracle Cloud (gratis selamanya)
```

## Catatan penting

- **Hak cipta**: tool ini buat konten yang kamu punya hak pakai / lisensi jelas, atau testing pribadi. Upload musik berlisensi ke game publik bisa kena takedown/moderasi dari Roblox, dan berpotensi melanggar ToS platform sumbernya.
- **Audio asset Roblox** ada batas durasi (~7 menit) dan lolos moderasi otomatis dulu sebelum bisa dipakai.
- Database di app ini pakai **file JSON sederhana** (`data/*.json`) — cukup buat skala hobby/kecil. Kalau user udah ratusan+ dan butuh performa lebih, bisa upgrade ke database beneran (PostgreSQL/SQLite) nanti.
- Ganti `JWT_SECRET` di `.env` sebelum deploy ke publik — jangan pakai default.
- Limit free tier bisa diubah lewat `FREE_DAILY_LIMIT` di `.env` (default 2).

## Deploy 24/7

Pilih salah satu, tergantung prioritas kamu:

- **`DEPLOY-RENDER.md`** — paling simpel, connect GitHub lalu klik deploy, ada tier gratis (dengan sleep setelah idle)
- **`DEPLOY-RAILWAY.md`** — juga simpel (connect GitHub), gak ada sleep, trial $5 kredit ~30 hari lalu $5/bulan (Hobby plan) buat pemakaian rutin
- **`DEPLOY-CLOUDFLARE.md`** — pakai Cloudflare Containers, mulai $5/bulan, setup lebih teknis (perlu Docker lokal + Wrangler CLI) tapi cocok kalau kamu udah di ekosistem Cloudflare
- **`DEPLOY.md`** — Oracle Cloud Free Tier, gratis selamanya + 24/7 tanpa sleep, tapi setup paling ribet (kelola VM sendiri)
