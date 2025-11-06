# Xuans Bridge - Stream Platform Bridge

Aplikasi Next.js untuk mengelola video upload ke berbagai platform streaming dengan fitur auto posting ke Telegram dan platform sosial media lainnya.

## Fitur

- 🔐 Authentication (Login)
- 📁 Folder Management dengan nested folders
- 📹 Video Upload (Local & Remote) dengan integrasi Lixstream API
- 📋 List Video dengan thumbnail
- 📱 Auto Posting ke Telegram Channel
- 💾 SQLite Database untuk data lokal
- 👥 Role Management (Superuser & Publisher)
- 🔗 Video & Folder Sharing
- 📱 Responsive Mobile Design

## Setup

1. Install dependencies:
```bash
npm install
```

2. Setup environment variables:
```bash
cp .env.example .env.local
```

Edit `.env.local` dan isi dengan konfigurasi yang sesuai.

3. Run development server:
```bash
npm run dev
```

4. Buka browser di `http://localhost:3000`

## Default Login

- Username: `admin`
- Password: `admin123`

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run reset-db` - Reset database (hapus semua data kecuali users)
- `npm run add-superuser` - Tambah superuser baru

## Environment Variables

Lihat `.env.example` untuk daftar lengkap environment variables yang diperlukan.

**Catatan:** Untuk production, semua API keys bisa di-set melalui Settings page di aplikasi (superuser), tidak perlu environment variables.

### Lixstream API
- `LIXSTREAM_API_KEY` - API Key dari Lixstream
- `LIXSTREAM_API_URL` - Base URL API Lixstream

### Authentication
- `JWT_SECRET` - Secret untuk JWT token (ubah di production!)

### Telegram (untuk auto posting)
- `TELEGRAM_BOT_TOKEN` - Token bot Telegram
- `TELEGRAM_CHANNEL_ID` - ID channel Telegram
- `TELEGRAM_CHANNEL_NAME` - Nama channel Telegram

## Struktur Database

Database SQLite akan otomatis dibuat di `data/stream-ops.db` saat pertama kali aplikasi dijalankan.

Tables:
- `users` - Data pengguna dengan role (superuser/publisher)
- `folders` - Folder untuk organisasi video (nested structure)
- `videos` - Data video yang diupload
- `posts` - Data posting ke social media
- `settings` - Konfigurasi aplikasi (API keys, dll)
- `video_shares` - Sharing video ke publisher
- `folder_shares` - Sharing folder ke publisher
- `deleted_videos` - Daftar video yang sudah dihapus (untuk filter)

## Deployment

### ⚠️ Catatan Penting untuk Vercel

Project ini menggunakan **SQLite file-based** yang **TIDAK kompatibel** dengan Vercel karena serverless functions yang stateless.

**Solusi:**
1. **Railway** atau **Render** (Recommended) - Mendukung persistent storage
2. **Vercel + Supabase** - Migrate ke PostgreSQL
3. **Vercel + Vercel Postgres** - Menggunakan database Vercel

Lihat `DEPLOYMENT.md` untuk panduan lengkap deployment.

## Teknologi

- Next.js 14 (App Router)
- TypeScript
- SQLite (better-sqlite3)
- Tailwind CSS
- Axios
- JWT untuk authentication
- Lucide React untuk icons

## Catatan

- Database file (`*.db`) tidak di-commit ke Git (sudah di-ignore)
- Environment variables tidak di-commit (sudah di-ignore)
- Pastikan setup environment variables sebelum deploy
- Untuk production, semua API keys bisa di-set melalui Settings page di aplikasi (superuser)
