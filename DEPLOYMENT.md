# Deployment Guide - Vercel

## ⚠️ Catatan Penting

Project ini saat ini menggunakan **SQLite file-based** yang **TIDAK kompatibel** dengan Vercel karena:
- Vercel menggunakan serverless functions yang stateless
- Filesystem di Vercel adalah read-only (kecuali `/tmp` yang ephemeral)
- Data akan hilang setiap kali function restart

## Solusi untuk Deploy ke Vercel

### Opsi 1: Menggunakan Vercel Postgres (Recommended untuk Vercel)

1. **Install Vercel Postgres:**
```bash
npm install @vercel/postgres
```

2. **Setup di Vercel Dashboard:**
   - Buka project di Vercel Dashboard
   - Go to Storage → Create Database → Postgres
   - Copy connection string

3. **Migrate dari SQLite ke PostgreSQL:**
   - Buat migration script untuk convert schema SQLite ke PostgreSQL
   - Migrate data existing (jika ada)

### Opsi 2: Menggunakan Supabase (Gratis & Mudah)

1. **Buat akun di [Supabase](https://supabase.com)**
2. **Buat project baru**
3. **Install Supabase client:**
```bash
npm install @supabase/supabase-js
```
4. **Update `lib/db.ts` untuk menggunakan Supabase**

### Opsi 3: Menggunakan PlanetScale (MySQL)

1. **Buat akun di [PlanetScale](https://planetscale.com)**
2. **Buat database baru**
3. **Install MySQL client:**
```bash
npm install mysql2
```
4. **Update `lib/db.ts` untuk menggunakan MySQL**

### Opsi 4: Menggunakan Railway / Render (Full Server) - ⭐ RECOMMENDED

Jika ingin tetap menggunakan SQLite tanpa migrate database, deploy ke:
- **Railway** - https://railway.app (mendukung persistent storage)
- **Render** - https://render.com (mendukung persistent storage)
- **DigitalOcean App Platform** - https://www.digitalocean.com/products/app-platform

**Keuntungan:**
- ✅ Tidak perlu migrate database
- ✅ Persistent storage untuk SQLite
- ✅ Auto-deploy dari GitHub
- ✅ Gratis untuk tier tertentu

## Konfigurasi Vercel (Jika menggunakan database eksternal)

### 1. Environment Variables

Set di Vercel Dashboard → Settings → Environment Variables:

```
JWT_SECRET=your-secret-key-change-in-production
LIXSTREAM_API_KEY=your-lixstream-api-key
LIXSTREAM_API_URL=https://api.luxsioab.com/pub/api
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
TELEGRAM_CHANNEL_ID=your-telegram-channel-id
TELEGRAM_CHANNEL_NAME=your-telegram-channel-name
```

**Catatan:** Untuk production, semua API keys sebaiknya di-set melalui Settings page di aplikasi (superuser), bukan environment variables.

### 2. Build Settings

Vercel akan otomatis detect Next.js project. Pastikan:
- **Framework Preset:** Next.js
- **Build Command:** `npm run build` (default)
- **Output Directory:** `.next` (default)
- **Install Command:** `npm install` (default)

### 3. Deploy

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Atau deploy production
vercel --prod
```

## Rekomendasi

Untuk project ini, saya **sangat merekomendasikan** menggunakan **Railway** atau **Render** karena:
1. ✅ Mendukung persistent storage (SQLite bisa digunakan langsung)
2. ✅ Lebih mudah setup (tidak perlu migrate database)
3. ✅ Gratis untuk tier tertentu
4. ✅ Auto-deploy dari GitHub
5. ✅ Tidak perlu perubahan code

Atau jika ingin tetap di Vercel, gunakan **Supabase** (gratis) sebagai database replacement.

