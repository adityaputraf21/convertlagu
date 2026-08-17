# Deploy 24/7 Gratis ke Oracle Cloud

Oracle Cloud Free Tier ngasih VM gratis **selamanya** (bukan trial) — sampai 4 CPU core + 24GB RAM (ARM Ampere), cukup buat app ini + convert audio.

## 1. Bikin akun Oracle Cloud

1. Buka https://signup.cloud.oracle.com
2. Isi data, pilih **Home Region** — pilih yang deket (Singapore/Tokyo/Mumbai biasanya paling deket ke Indonesia dan availability-nya lumayan)
3. Perlu kartu kredit/debit buat verifikasi identitas, tapi **selama kamu pilih resource yang "Always Free"**, gak akan ditagih
4. Tunggu email konfirmasi, biasanya beberapa menit sampai beberapa jam

## 2. Bikin VM (Compute Instance)

1. Login ke Oracle Cloud Console → menu **Compute** → **Instances** → **Create Instance**
2. **Name**: bebas, misal `audio-converter-vm`
3. **Image and shape**:
   - Klik **Change Image** → pilih **Ubuntu 22.04** (atau versi terbaru yang tersedia)
   - Klik **Change Shape** → pilih **Ampere** → `VM.Standard.A1.Flex` → set **2 OCPU, 12GB RAM** (masih dalam batas Always Free, sisa buat VM lain kalau mau)
4. **Networking**: biarin default (VCN baru otomatis dibuatin)
5. **Add SSH keys**: pilih **Generate a key pair for me**, lalu **download private key** — ini buat login nanti, simpan baik-baik
6. Klik **Create**, tunggu status jadi **Running** (beberapa menit)
7. Catat **Public IP Address** yang muncul di detail instance

> Kalau muncul error "Out of capacity" pas create — ini masalah umum, availability ARM shape di Oracle suka penuh. Coba ganti region, atau coba lagi beberapa jam/hari kemudian.

## 3. Buka Port di Firewall Oracle

Default Oracle nutup semua port kecuali SSH (22). Buka port 80/443 (dan 3000 buat testing):

1. Di halaman instance, klik nama **VCN** di bagian Networking → klik **Subnet** → klik **Default Security List**
2. **Add Ingress Rules**:
   - Source CIDR: `0.0.0.0/0`, Destination Port: `80` (HTTP)
   - Source CIDR: `0.0.0.0/0`, Destination Port: `443` (HTTPS)
   - Source CIDR: `0.0.0.0/0`, Destination Port: `3000` (buat testing langsung tanpa domain)
3. Save

## 4. Login ke VM via SSH

Di komputer kamu (Windows pakai PowerShell/Terminal, atau pakai PuTTY):

```bash
chmod 400 path/to/private-key.key
ssh -i path/to/private-key.key ubuntu@<PUBLIC_IP_VM>
```

## 5. Install Docker di VM

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-v2
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
# logout lalu login ssh lagi biar grup docker kepakai
exit
```

Login ulang, lalu cek:
```bash
ssh -i path/to/private-key.key ubuntu@<PUBLIC_IP_VM>
docker --version
```

## 6. Upload project ke VM

Dari **komputer lokal kamu** (bukan di dalam VM), pakai `scp`:

```bash
scp -i path/to/private-key.key -r roblox-audio-converter ubuntu@<PUBLIC_IP_VM>:~/
```

Atau kalau lebih gampang, push project ke GitHub (repo private juga bisa) lalu `git clone` di VM-nya.

## 7. Setup `.env` di VM

```bash
cd ~/roblox-audio-converter
cp .env.example .env
nano .env
```

Isi minimal:
```
JWT_SECRET=<generate random string panjang, mis. pakai: openssl rand -hex 32>
APP_URL=http://<PUBLIC_IP_VM>:3000   # nanti diganti ke domain kalau udah setup HTTPS
ROBLOX_API_KEY=<punya kamu>
MIDTRANS_SERVER_KEY=<punya kamu>
MIDTRANS_CLIENT_KEY=<punya kamu>
```
Simpan (`Ctrl+O`, Enter, `Ctrl+X` di nano).

## 8. Build & jalankan

```bash
docker compose up -d --build
```

Cek jalan:
```bash
docker compose ps
docker compose logs -f
```

Buka browser: `http://<PUBLIC_IP_VM>:3000` — harusnya keluar halaman login.

## 9. Biar auto-restart kalau VM reboot

`docker-compose.yml` udah ada `restart: unless-stopped`, jadi container otomatis nyala lagi kalau Docker daemon restart atau VM reboot. Docker sendiri udah di-`enable` di langkah 5, jadi otomatis start pas VM boot.

## 10. (Opsional tapi direkomendasikan) Pasang domain + HTTPS gratis

Tanpa HTTPS, browser bakal warning dan beberapa fitur (kayak clipboard paste) mungkin dibatasi. Cara termudah pakai **Caddy** (reverse proxy otomatis HTTPS):

```bash
sudo apt install -y caddy
```

Edit `/etc/caddy/Caddyfile`:
```
yourdomain.com {
    reverse_proxy localhost:3000
}
```

Arahkan DNS domain kamu (A record) ke Public IP VM, lalu:
```bash
sudo systemctl restart caddy
```

Caddy otomatis ngurus sertifikat HTTPS dari Let's Encrypt. Update `APP_URL` di `.env` jadi `https://yourdomain.com` dan restart container (`docker compose restart`).

Kalau belum punya domain, bisa pake domain gratis dari Cloudflare's registrar (kalau udah beli) atau layanan kayak DuckDNS (`yourname.duckdns.org`) buat testing.

## Maintenance sehari-hari

```bash
# lihat log realtime
docker compose logs -f

# restart app
docker compose restart

# update kode (setelah git pull / scp file baru)
docker compose up -d --build

# stop
docker compose down
```

## Catatan biaya

Selama tetap pakai shape **Always Free** (`VM.Standard.A1.Flex` dengan total ≤4 OCPU + 24GB RAM across semua instance, dan gak nambah resource lain kayak block storage besar/load balancer berbayar), ini **gratis selamanya**, bukan trial. Oracle emang kadang ngirim reminder soal billing tapi kalau resource kamu masih dalam batas Always Free gak akan ada charge.
