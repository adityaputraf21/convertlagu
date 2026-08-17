# Deploy ke Railway

Railway itu simpel banget buat deploy — connect GitHub, Railway auto-detect `Dockerfile` kita, langsung jalan. Gak perlu install Docker lokal (beda dari Cloudflare Containers), gak perlu setup VM manual (beda dari Oracle Cloud).

## Soal biaya (penting, biar gak kaget)

Railway di 2026 **bukan gratis selamanya**, tapi cukup terjangkau buat project kayak gini:

- **Trial**: $5 kredit gratis, berlaku 30 hari, **gak perlu kartu kredit**
- Setelah trial habis: **Free plan** $1 kredit/bulan (sangat terbatas, 0.5GB RAM) atau **Hobby plan** $5/bulan (lebih lega, cukup buat pemakaian normal)
- App Node.js ringan kayak ini biasanya cuma habis **$0.30–0.50/bulan** kalau jalan terus 24/7 — jadi kredit trial $5 bisa tahan berminggu-minggu, bahkan sebulan lebih tergantung seberapa sering dipakai

Kalau udah lewat trial dan mau tetap online, tinggal upgrade ke Hobby ($5/bulan) — gak perlu setup ulang dari nol, tinggal masukin kartu di dashboard.

## 1. Push project ke GitHub

Kalau belum pernah:
```bash
cd roblox-audio-converter
git init
git add .
git commit -m "Initial commit"
```
Bikin repo baru di https://github.com/new (boleh Private), lalu:
```bash
git remote add origin https://github.com/username-kamu/nama-repo.git
git branch -M main
git push -u origin main
```

## 2. Daftar Railway

https://railway.app → **Login with GitHub** (paling gampang, langsung ke-connect)

## 3. Deploy dari GitHub repo

1. Dashboard Railway → **New Project** → **Deploy from GitHub repo**
2. Pilih repo yang tadi di-push
3. Railway otomatis detect `Dockerfile` dan `railway.json` yang udah ada di project ini, langsung mulai build

Build pertama agak lama (beberapa menit — install Node, ffmpeg, yt-dlp dari `Dockerfile`), abis itu lebih cepat kalau ada update.

## 4. Generate domain publik

1. Klik service yang baru di-deploy → tab **Settings** → **Networking**
2. Klik **Generate Domain**
3. Railway kasih URL kayak `https://nama-app-production.up.railway.app` — otomatis HTTPS, gak perlu setup manual

## 5. Set environment variables

1. Klik service → tab **Variables**
2. Klik **New Variable**, isi satu-satu (samain kayak `.env.example`):
   ```
   JWT_SECRET=<generate string acak panjang>
   APP_URL=https://nama-app-production.up.railway.app
   DISCORD_CLIENT_ID=<punya kamu>
   DISCORD_CLIENT_SECRET=<punya kamu>
   DISCORD_REDIRECT_URI=https://nama-app-production.up.railway.app/api/auth/discord/callback
   ROBLOX_API_KEY=<punya kamu>
   MIDTRANS_SERVER_KEY=<opsional>
   MIDTRANS_CLIENT_KEY=<opsional>
   ```
   (Railway otomatis inject `PORT`, gak perlu diisi manual — app kita udah baca `process.env.PORT`)
3. Railway otomatis redeploy tiap kali variable diubah

## 6. Update Discord Developer Portal

1. https://discord.com/developers/applications → app kamu → **OAuth2**
2. **Add Redirect**:
   ```
   https://nama-app-production.up.railway.app/api/auth/discord/callback
   ```
3. Save Changes

## 7. Tambahin persistent storage (Volume) — biar data user gak ilang tiap redeploy

1. Klik service → tab **Settings** → scroll ke **Volumes** → **New Volume**
2. Mount path: `/app/data`
3. Bikin volume kedua buat file sementara hasil convert:
   - Mount path: `/app/tmp`

Tanpa ini, folder `data/` (akun user, history upload) bakal ke-reset tiap kali kamu redeploy kodenya.

## 8. (Opsional) Set webhook Midtrans

```
https://nama-app-production.up.railway.app/api/payment/webhook
```
Isi di dashboard Midtrans → Settings → Configuration → Payment Notification URL.

## 9. Buka dan test

Buka domain Railway kamu → **Login with Discord** → coba convert & upload.

---

## Kenapa hasil convert-nya sekarang seharusnya bagus (gak ngebass lagi)

Dockerfile project ini install `ffmpeg` lewat `apt-get`, dan gue udah **konfirmasi langsung** package itu punya dukungan `librubberband` bawaan (time-stretch berkualitas tinggi, beda dari `atempo` biasa yang bisa ninggalin artifact/distorsi di speed tinggi). Jadi begitu di-deploy ke Railway, app-nya otomatis pakai rubberband tanpa perlu setup tambahan apa-apa — sama kayak yang udah kamu confirm jalan bagus di komputer lokal kamu.

## Update kode nanti

```bash
git add .
git commit -m "update fitur X"
git push
```
Railway otomatis detect push baru dan redeploy sendiri.

## Maintenance

- **Logs**: dashboard Railway → service → tab **Deployments** → klik deployment aktif → lihat log realtime
- **Restart**: tab **Deployments** → titik tiga di deployment aktif → **Restart**
- **Cek pemakaian kredit**: dashboard → **Usage** (biar tau kapan trial bakal habis)
