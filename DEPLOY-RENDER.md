# Deploy Simpel ke Render (gak perlu VM, SSH, atau install apa-apa manual)

Ini cara paling gampang buat naikin app ini online — beda sama Oracle Cloud yang perlu ngurus VM sendiri. Render yang urus servernya, kamu tinggal connect repo dan klik deploy.

**Trade-off**: tier gratisnya "tidur" kalau gak diakses 15 menit — request pertama abis itu lambat ~30-60 detik buat "bangun". Kalau ini gak masalah, lanjut aja. Kalau butuh yang selalu nyala tanpa jeda, upgrade ke plan Starter ($7/bulan) — tinggal ganti satu baris di pengaturan, gak perlu setup ulang dari nol.

## 1. Push project ke GitHub

Kalau belum pernah pakai Git:

1. Install Git: https://git-scm.com/downloads
2. Buka Command Prompt di folder project:
   ```bash
   cd C:\Projects\roblox-audio-converter
   git init
   git add .
   git commit -m "Initial commit"
   ```
3. Bikin repo baru di https://github.com/new — kasih nama bebas, **pilih Private** kalau gak mau publik (Render tetep bisa akses repo private kok)
4. Ikutin instruksi GitHub buat push (biasanya muncul otomatis setelah bikin repo):
   ```bash
   git remote add origin https://github.com/username-kamu/nama-repo.git
   git branch -M main
   git push -u origin main
   ```

> `.env` **gak** ikut ke-push (udah di-exclude lewat `.gitignore`) — aman, credential kamu gak bocor ke GitHub.

## 2. Daftar Render

1. Buka https://render.com → **Get Started** → daftar pakai akun GitHub (paling gampang, langsung ke-connect)

## 3. Deploy pakai Blueprint (otomatis, paling cepat)

Project ini udah ada file `render.yaml` yang isinya konfigurasi lengkap, jadi Render bisa auto-setup:

1. Di dashboard Render, klik **New** → **Blueprint**
2. Pilih repo GitHub yang tadi di-push
3. Render otomatis baca `render.yaml` dan nunjukkin preview service yang bakal dibuat
4. Klik **Apply**

Render bakal mulai build pakai `Dockerfile` yang udah ada (otomatis install Node, ffmpeg, yt-dlp — sama kayak di lokal).

## 4. Isi environment variables

Beberapa env var ditandain `sync: false` di `render.yaml`, artinya perlu diisi manual (biar credential gak nyangkut di file yang mungkin ke-share):

1. Di dashboard Render → pilih service `roblox-audio-converter` → tab **Environment**
2. Isi:
   - `DISCORD_CLIENT_ID` — dari Discord Developer Portal
   - `DISCORD_CLIENT_SECRET` — dari Discord Developer Portal
   - `ROBLOX_API_KEY` — dari Roblox Open Cloud
   - `MIDTRANS_SERVER_KEY` / `MIDTRANS_CLIENT_KEY` — opsional
   - `APP_URL` dan `DISCORD_REDIRECT_URI` — **isi setelah langkah 5**, karena butuh tau URL Render dulu
3. `JWT_SECRET` udah otomatis di-generate random sama Render (`generateValue: true`), gak perlu diisi manual

## 5. Ambil URL dari Render

Setelah deploy selesai (bisa dicek progressnya di tab **Logs**), Render kasih URL otomatis kayak:
```
https://roblox-audio-converter-xxxx.onrender.com
```
Copy URL ini.

## 6. Update Discord Developer Portal

1. https://discord.com/developers/applications → app kamu → **OAuth2**
2. **Add Redirect**:
   ```
   https://roblox-audio-converter-xxxx.onrender.com/api/auth/discord/callback
   ```
   (pakai URL asli dari Render kamu)
3. **Save Changes**

## 7. Lengkapi env var yang tadi ditunda

Balik ke Render → Environment → isi:
```
APP_URL=https://roblox-audio-converter-xxxx.onrender.com
DISCORD_REDIRECT_URI=https://roblox-audio-converter-xxxx.onrender.com/api/auth/discord/callback
```
Save — Render otomatis redeploy dengan env var baru.

## 8. (Opsional) Set webhook Midtrans

Kalau pakai fitur Premium: https://dashboard.midtrans.com → Settings → Configuration → **Payment Notification URL**:
```
https://roblox-audio-converter-xxxx.onrender.com/api/payment/webhook
```

## 9. Selesai — buka dan test

Buka URL Render kamu di browser → klik **Login with Discord** → harusnya langsung jalan.

---

## Kalau mau custom domain (misal `converter.punyakamu.com`)

1. Render dashboard → service kamu → tab **Settings** → **Custom Domains** → **Add Custom Domain**
2. Ikutin instruksi buat nambahin CNAME record di DNS domain kamu
3. Render otomatis urus HTTPS-nya
4. Update `APP_URL` dan `DISCORD_REDIRECT_URI` di Environment pakai domain baru, plus update redirect di Discord Developer Portal juga

## Update kode nanti

Setelah setup awal, tiap kali mau update kode:
```bash
git add .
git commit -m "update fitur X"
git push
```
Render otomatis detect push baru dan redeploy sendiri — gak perlu masuk-masuk server lagi.

## Kalau mau hilangin jeda "bangun tidur" (upgrade ke Starter)

1. Render dashboard → service → **Settings** → **Instance Type** → pilih **Starter** ($7/bulan)
2. Sekalian bisa aktifin **persistent disk** di sini biar data user (`data/*.json`) gak ke-reset tiap redeploy — tambahin disk lewat tab **Disks**, mount ke `/app/data`

---

### Kenapa ini lebih simpel dari Oracle Cloud?

| | Oracle Cloud | Render |
|---|---|---|
| Bikin & kelola VM | Manual | Gak perlu |
| Install Docker | Manual via SSH | Otomatis |
| Setup HTTPS | Manual (Caddy) | Otomatis |
| Beli/setup domain | Wajib dari awal | Opsional, ada subdomain gratis |
| Update kode | `git pull` + `docker compose up` manual di server | `git push`, auto-deploy |
| Biaya | Gratis (tapi ribet) | Gratis dengan sleep, atau $7/bulan tanpa sleep |
