# Xuans Bridge - Stream Platform Bridge

Aplikasi Next.js untuk mengelola video upload ke berbagai platform streaming dengan fitur auto posting ke Telegram dan platform sosial media lainnya.

## Fitur

- 🔐 Authentication (Login)
- 📁 Folder Management
- 📹 Video Upload dengan integrasi Lixstream API
- 📋 List Video dengan thumbnail
- 📱 Auto Posting ke Telegram Channel dan X.com
- 💾 SQLite Database untuk data lokal
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

## Environment Variables

Lihat `.env.example` untuk daftar lengkap environment variables yang diperlukan.

### Lixstream API
- `LIXSTREAM_API_KEY` - API Key dari Lixstream
- `LIXSTREAM_API_URL` - Base URL API Lixstream

### Authentication
- `JWT_SECRET` - Secret untuk JWT token (ubah di production!)

### Telegram (untuk auto posting)
- `TELEGRAM_BOT_TOKEN` - Token bot Telegram
- `TELEGRAM_CHANNEL_ID` - ID channel Telegram

### X.com / Twitter (untuk auto posting)
- `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`

### Thumbnail Upload
Pilih salah satu:
- **ImgBB** (Gratis): Set `IMGBB_API_KEY`
- **Cloudinary** (Free tier): Set `CLOUDINARY_UPLOAD_URL` dan `CLOUDINARY_UPLOAD_PRESET`

## Struktur Database

Database SQLite akan otomatis dibuat di `data/stream-ops.db` saat pertama kali aplikasi dijalankan.

Tables:
- `users` - Data pengguna
- `folders` - Folder untuk organisasi video
- `videos` - Data video yang diupload
- `posts` - Data posting ke social media

## Teknologi

- Next.js 14 (App Router)
- TypeScript
- SQLite (better-sqlite3)
- Tailwind CSS
- Axios
- JWT untuk authentication

## Catatan

- Pastikan untuk mengubah `JWT_SECRET` di production
- Database SQLite disimpan di folder `data/`
- Thumbnail upload memerlukan konfigurasi ImgBB atau Cloudinary
