# Deploy ke Cloudflare Containers

Ini panduan buat naikin app ini ke **Cloudflare Containers** — produk baru Cloudflare yang bisa jalanin Docker image asli (termasuk `ffmpeg` dan `yt-dlp`) di jaringan edge mereka.

## Kenapa ini beda dari deploy biasa

Berbeda dari Render/Oracle yang jalanin app kita langsung, di Cloudflare kita butuh dua bagian:
1. **Worker** (`worker/index.js`) — script kecil JavaScript yang jadi "gerbang", nerima semua request dan nerusinnya ke Container
2. **Container** — app kita yang sebenarnya (Dockerfile yang udah ada), jalan di dalam sandbox Cloudflare

Kedua bagian ini udah gue siapin di project (`worker/index.js` + `wrangler.jsonc`), jadi kamu tinggal ikutin langkah deploy-nya.

## Yang perlu disiapin dulu

1. **Docker Desktop** — wajib jalan di komputer kamu saat deploy (Cloudflare build image-nya lewat Docker lokal kamu, baru di-push ke Cloudflare). Download: https://docs.docker.com/get-started/get-docker/
2. **Akun Cloudflare** — daftar gratis di https://dash.cloudflare.com/sign-up
3. **Workers Paid plan ($5/bulan)** — container billing itu masuk ke plan ini, gak ada di plan gratis murni. Upgrade di dashboard Cloudflare → Workers & Pages → Plans

## 1. Login ke Cloudflare lewat Wrangler

```bash
cd roblox-audio-converter
npx wrangler login
```
Browser bakal kebuka, klik **Allow**.

## 2. Set secrets (credential sensitif)

Jangan taruh secret di `wrangler.jsonc` (itu file config biasa, sering ke-commit ke Git). Pakai `wrangler secret put` — ini nyimpennya di Cloudflare, terenkripsi:

```bash
npx wrangler secret put JWT_SECRET
npx wrangler secret put DISCORD_CLIENT_ID
npx wrangler secret put DISCORD_CLIENT_SECRET
npx wrangler secret put DISCORD_REDIRECT_URI
npx wrangler secret put ROBLOX_API_KEY
npx wrangler secret put MIDTRANS_SERVER_KEY
npx wrangler secret put MIDTRANS_CLIENT_KEY
```
Tiap command bakal nanya value-nya, paste terus Enter.

> `DISCORD_REDIRECT_URI` isinya nanti diisi setelah tau URL Worker kamu (langkah 4) — sementara isi dulu placeholder apa aja, nanti kita update lagi di langkah 5.

## 3. Deploy

Pastikan **Docker Desktop lagi jalan**, lalu:

```bash
npm run cf:deploy
```

Ini bakal:
1. Build image dari `Dockerfile` (proses paling lama pertama kali, beberapa menit — nginstall Node, ffmpeg, yt-dlp)
2. Push image ke Cloudflare
3. Deploy Worker-nya

Kalau sukses, muncul URL kayak:
```
https://roblox-audio-converter.<subdomain-kamu>.workers.dev
```

## 4. Update Discord Developer Portal

1. https://discord.com/developers/applications → app kamu → **OAuth2**
2. **Add Redirect**:
   ```
   https://roblox-audio-converter.<subdomain-kamu>.workers.dev/api/auth/discord/callback
   ```
3. Save Changes

## 5. Update secret `DISCORD_REDIRECT_URI` dan `vars` di `wrangler.jsonc`

```bash
npx wrangler secret put DISCORD_REDIRECT_URI
# paste: https://roblox-audio-converter.<subdomain-kamu>.workers.dev/api/auth/discord/callback
```

Edit `wrangler.jsonc`, ganti `APP_URL` di bagian `vars` jadi URL asli kamu:
```jsonc
"vars": {
  "APP_URL": "https://roblox-audio-converter.<subdomain-kamu>.workers.dev",
  ...
}
```

Deploy ulang biar perubahan ke-apply:
```bash
npm run cf:deploy
```

## 6. (Opsional) Set webhook Midtrans

```
https://roblox-audio-converter.<subdomain-kamu>.workers.dev/api/payment/webhook
```
Isi di dashboard Midtrans → Settings → Configuration → Payment Notification URL.

## 7. Buka dan test

Buka URL Worker kamu → **Login with Discord** → harusnya jalan.

> **Cold start**: container "tidur" setelah 10 menit gak ada request (`sleepAfter: "10m"` di `worker/index.js`, bisa diubah). Request pertama setelah tidur bakal nunggu beberapa detik buat container nyala lagi — mirip Render free tier, cuma biasanya lebih cepat karena container Cloudflare pre-provisioned.

---

## Custom domain

1. Dashboard Cloudflare → Workers & Pages → pilih worker kamu → **Settings** → **Domains & Routes** → **Add Custom Domain**
2. Domain harus udah terdaftar DNS-nya di Cloudflare (kalau belum, tambahin dulu di **Websites**)
3. Update `APP_URL` di `wrangler.jsonc` dan `DISCORD_REDIRECT_URI` (via `wrangler secret put`) pakai domain baru, plus update redirect di Discord Developer Portal

## Local development (opsional, buat testing sebelum deploy)

```bash
cp .dev.vars.example .dev.vars
# edit .dev.vars, isi credential testing kamu
npm run cf:dev
```
Buka `http://localhost:8787` — Wrangler jalanin Worker + Container lokal pakai Docker kamu.

## Update kode nanti

```bash
npm run cf:deploy
```
Tiap ada perubahan kode (baik Worker maupun app di dalam Container), command ini yang dipakai buat push ulang.

## Catatan penting

- **Filesystem container gak permanen** — data user (`data/*.json`) bisa ke-reset kalau container di-redeploy atau instance-nya diganti. Buat kebutuhan serius, pertimbangkan migrasi database ke **Cloudflare D1** (SQLite managed, gratis di plan Workers) atau **R2** (object storage) — ini di luar scope setup awal ini, bilang aja kalau mau gue bantu migrasiin nanti.
- **Biaya**: minimal $5/bulan (Workers Standard plan) + biaya container per detik pemakaian (biasanya kecil buat traffic personal/kecil, tapi bukan gratis murni kayak Render free tier)
- Docker Desktop **wajib jalan di komputer kamu** tiap kali mau deploy (`npm run cf:deploy`) — beda dari Render yang build-nya di server mereka

## Ringkasan perbandingan sama opsi lain

| | Render | Cloudflare Containers |
|---|---|---|
| Biaya minimum | Gratis (dengan sleep) | ~$5/bulan + usage |
| Perlu Docker lokal | Tidak | **Ya, wajib tiap deploy** |
| Setup awal | Connect GitHub, klik deploy | Install Wrangler, tulis Worker, `wrangler secret put` satu-satu |
| Update kode | `git push`, auto-deploy | `npm run cf:deploy` manual |
| Data persisten | Bisa (upgrade plan + disk) | Perlu migrasi ke D1/R2 |
