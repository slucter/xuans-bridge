# TRAE Project Notes

Ringkasan arsitektur dan pola implementasi proyek `stream-ops` untuk kesinambungan pengembangan dengan gaya yang sama.

## Gambaran Umum
- Framework: `Next.js 14 (App Router)` dengan `TypeScript` dan `TailwindCSS`.
- Database lokal: `SQLite` via `better-sqlite3` (file di `data/stream-ops.db`).
- Autentikasi: `JWT` disimpan sebagai cookie `auth_token` (HTTP-only, `sameSite=lax`).
- Peran pengguna: `superuser` dan `publisher` (role disimpan di tabel `users`).
- Integrasi eksternal: `Lixstream API` untuk file/video, posting `Telegram`, upload thumbnail via `ImgBB` atau Cloudinary.
- Pola UI: halaman dashboard modular dan komponen client-side yang memanggil API route.

## Stack & Konfigurasi
- `package.json` scripts: `dev`, `build`, `start`, `lint`, `reset-db`, `add-superuser`.
- `tsconfig.json`: alias `@/*` ke root, `moduleResolution: bundler`, `strict: true`.
- `tailwind.config.ts`: scan `./app`, `./components`, `./pages`; extend warna `primary`.
- `vercel.json`: `buildCommand`, `devCommand`, regions `sin1`.

## Autentikasi
- File utama: `lib/auth.ts`.
- `createToken(user)`: membuat JWT (`expiresIn: 7d`).
- `setAuthCookie(response, token)`: set cookie `auth_token` (HTTP-only, secure di production).
- `verifyToken(token)`: decode JWT dan validasi; return objek user minimal `{id, username, email?, role?}`.
- API routes umum membaca cookie `auth_token` dari `NextRequest.cookies` lalu memanggil `verifyToken`.
- `app/api/auth/login`: validasi `username/password` (bcrypt), set cookie, kembalikan user.
- `app/api/auth/me`: membaca cookie, verifikasi, ambil user dari DB (pastikan role terbaru).
- `app/api/auth/logout`: hapus cookie.

## Model Data (SQLite)
Ditangani di `lib/db.ts` dengan migrasi defensif (cek kolom via `PRAGMA table_info` dan `ALTER TABLE` bila perlu):
- `users(id, username, password, email, role, created_at)`
- `folders(id, user_id, name, parent_id, lixstream_dir_id, folder_share_link, created_at)`
- `videos(id, user_id, folder_id, name, lixstream_file_id, lixstream_upload_id, file_share_link, file_embed_link, thumbnail_url, thumbnail_s3_url, upload_status, created_at)`
- `posts(id, user_id, title, video_ids(json string), telegram_posted, x_posted, telegram_message_id, x_tweet_id, created_at)`
- `settings(key, value, updated_at)`
- `video_shares(id, video_id(text), lixstream_file_id, shared_by_user_id, shared_to_user_id, created_at)`
- `folder_shares(id, folder_id, lixstream_dir_id, shared_by_user_id, shared_to_user_id, created_at)`
- `deleted_videos(id, lixstream_file_id UNIQUE, deleted_by_user_id, deleted_at)`

Indeks dibuat untuk kolom yang sering di-query (lihat `db.exec` pada block indeks).

## Settings & Environment
- `lib/settings.ts`: utilitas `getSetting(key, envFallbackKey?)`, `setSetting`, `getAllSettings`.
- Pada API `settings` (`app/api/settings/route.ts`), superuser dapat `GET` semua setting (dengan fallback ke env) dan `PUT` untuk update DB settings.
- Env kunci (lihat `DEPLOYMENT.md`/`README.md`):
  - `JWT_SECRET`
  - `LIXSTREAM_API_URL` (default: `https://api.luxsioab.com/pub/api`)
  - `LIXSTREAM_API_KEY`
  - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_ID`, `TELEGRAM_CHANNEL_NAME`
  - `IMGBB_API_KEY` atau `CLOUDINARY_UPLOAD_URL` + `CLOUDINARY_UPLOAD_PRESET` (opsional)

## Integrasi Lixstream
- File: `lib/lixstream.ts`.
- `createUploadTask(name, dirId?)`: minta upload task (mengembalikan URL unggah dan `id`).
- `confirmUpload(uploadId, result)`: callback untuk konfirmasi sukses/gagal, mengembalikan `file_share_link`, `file_embed_link`, `thumbnail_url`, dan `dir_share_link`.
- `createFolder(name, parentId?)`: buat folder dan kembalikan `dir_id`.
- `remoteUpload(url, name, dirId?)`: buat tugas upload remote; body menyertakan `dir_id` hanya jika tersedia.
- `getAllFilesFromLixstream()`: paginate untuk tarik semua file; tiap file memiliki `code` (identifier), `share_link`, `embed_link`, `thumbnail`, dan opsional `dir_id`.

### Pola Pemetaan
- `dir_id` dari Lixstream dipetakan ke `folders.lixstream_dir_id` lokal.
- Saat superuser melihat video, data digabungkan dari Lixstream + lokal, lalu difilter untuk root/specific folder.
- Jika `dir_id` tidak cocok dengan folder lokal, UI menampilkan peringatan (log pada server). Tidak otomatis membuat folder baru.

## API Routes (Pola Umum)
- Semua route memverifikasi `auth_token`; superuser memiliki akses luas.
- Folders: `app/api/folders/*`
  - `GET`: daftar folder (nested) + info root videos count.
  - `POST (create)`: buat folder di Lixstream, simpan di lokal (lihat file terkait).
  - `DELETE`: hapus folder beserta share dan video terkait (dengan aturan ketat superuser/publisher).
  - Share folder: `app/api/shares/folder` untuk share ke publisher.
- Videos: `app/api/videos/*`
  - `GET`: superuser melihat gabungan Lixstream + lokal; publisher melihat miliknya + yang di-share.
  - `POST`: alur upload lokal (minta upload task, simpan status `uploading`).
  - `PUT`: konfirmasi upload (`confirmUpload`), update info video + `folder_share_link` jika ada.
  - Delete: `app/api/videos/delete` dengan logika khusus superuser/publisher dan penandaan pada `deleted_videos`.
  - Remote: `app/api/videos/remote/route.ts` untuk upload dari URL.
- Posts: `app/api/posts/*`
  - `POST`: simpan post berisi judul dan daftar `video_ids`, opsi kirim ke Telegram.
  - `GET list`: daftar posting user.
  - `GET preview`: ambil nama channel telegram untuk preview.
- Sync: `app/api/sync/route.ts`
  - Sinkron antara lokal dengan Lixstream: deteksi video hilang/dihapus, update `upload_status`, hapus lokal jika tidak ada di remote (kecuali status `uploading`). Folder tidak dihapus otomatis.
- Users & Profile:
  - `app/api/users`: daftar user (superuser), update role/password.
  - `app/api/profile/update`: ubah email/password user sendiri dengan verifikasi password saat ganti.

## UI & Struktur Halaman
- Layout dashboard: `app/dashboard/layout.tsx` mengautentikasi via `/api/auth/me` dan membungkus halaman dengan `components/DashboardLayout.tsx`.
- Routing dashboard (App Router):
  - Redirect default ke `/dashboard/folders` (`app/dashboard/page.tsx`).
  - Halaman: `/dashboard/folders`, `/dashboard/videos`, `/dashboard/post`, `/dashboard/profile`, `/dashboard/master` (opsi superuser).
- Komponen utama:
  - `FolderList.tsx`: menampilkan nested folders, membuat/menghapus, memilih folder.
  - `VideoList.tsx`: menampilkan video (gabungan atau milik sendiri), refresh, hapus.
  - `VideoUpload.tsx` + `UploadModal.tsx`: upload lokal batch, alur `createUploadTask` → unggah → `confirmUpload`.
  - `RemoteUpload.tsx`: upload dari URL ke folder (opsional root), status per item.
  - `PostForm.tsx`: pilih beberapa video dan buat post, opsi kirim Telegram.
  - `ProfilePage.tsx`: update email/password.
  - `RoleManagementPage.tsx`: (superuser) kelola user, settings, dan integrasi.

## Pola & Konvensi Kode
- Alias import: gunakan `@/path` untuk referensi dari root.
- Validasi request: cek cookie, `verifyToken`, kemudian peran pengguna.
- DB access: `better-sqlite3` sinkron, gunakan `prepare(...).get/all/run`.
- Migrasi ringan: cek kolom via `PRAGMA` lalu `ALTER TABLE` jika belum ada; log keberhasilan/gagal.
- Penamaan:
  - `lixstream_dir_id` untuk folder, `lixstream_file_id` untuk video.
  - Status upload di `videos.upload_status`: `pending | uploading | completed | failed`.
- Error handling: kembalikan `NextResponse.json({ error }, { status })`; log detail untuk debugging.
- Penggunaan env vs settings: `getSetting` mencoba DB dahulu, fallback ke `process.env`.

## Alur Upload
- Lokal: buat upload task → unggah file ke URL dari Lixstream → `confirmUpload(id, result)` → simpan link share/embed/thumbnail → update status.
- Remote: kirim `url` dan `name` (opsional `dir_id`) → pantau status di UI, simpan hasil saat sukses.
- Thumbnail: `lib/s3-upload.ts` menyediakan upload ke ImgBB atau Cloudinary (opsional).

## Sync Perilaku & Filtering
- Superuser: gabungkan Lixstream + lokal (hindari duplikasi dengan set `lixstream_file_id`).
- Root vs folder: root berarti `dir_id` kosong atau `videos.folder_id IS NULL`.
- `deleted_videos`: berfungsi sebagai filter agar file Lixstream yang dihapus tidak ikut ditampilkan.
- Folder tidak dihapus otomatis oleh sync (penghapusan manual oleh user).

## Deployment & Docker
- `Dockerfile` multi-stage: `deps` (build deps SQLite), `builder` (build Next), `runner` (standalone output). Runtime menambah `sqlite-libs`, `server.js` dari Next `standalone`.
- `docker-compose.yml` & `docker-compose.prod.yml` tersedia untuk dev/production.
- Vercel: disarankan set env; atau gunakan platform yang mendukung persistent storage untuk tetap pakai SQLite.

## Cara Menambah Fitur Dengan Pola Yang Sama
- API Route baru:
  - Buat file di `app/api/<feature>/route.ts`.
  - Selalu validasi `auth_token` dan peran.
  - Gunakan akses DB via `lib/db.ts` dan utilitas yang ada.
  - Jika butuh konfigurasi, simpan di `settings` melalui API Settings.
- Halaman/Komponen baru:
  - Tambah halaman di `app/dashboard/<page>/page.tsx` dan hubungkan dari `DashboardLayout`.
  - Komponen client gunakan `axios` dan memanfaatkan endpoint API.
  - Pertahankan styling `Tailwind` dan pola state (loading, error, refresh).
- Skema DB:
  - Tambahkan kolom/tabel di `lib/db.ts` dengan migrasi defensif (cek `PRAGMA` sebelum `ALTER TABLE`).
  - Tambahkan indeks untuk query yang sering digunakan.
- Integrasi eksternal:
  - Bungkus API di `lib/<service>.ts` dengan fungsi bernama jelas.
  - Tangani error dari `.response.data` bila tersedia.

## Checklist Praktis
- Pastikan `auth_token` dicek dan role sesuai.
- Gunakan `getSetting` untuk API keys, fallback ke env jika perlu.
- Hindari duplikasi data Lixstream (gunakan set `lixstream_file_id`).
- Tulis log informatif untuk debugging (contoh di videos/sync routes).
- Root folder: konsisten menggunakan `null` untuk `folder_id` lokal dan kosong `dir_id` di remote.
- Jangan hapus folder via sync; penghapusan manual melalui endpoint khusus.

## Perintah Cepat
- Dev: `npm run dev` lalu buka `http://localhost:3000`.
- Build: `npm run build` → `npm run start`.
- DB reset: `npm run reset-db`.
- Tambah superuser: `npm run add-superuser`.

---
Dokumen ini jadi pedoman agar pengembangan lanjut tetap konsisten dengan implementasi yang ada. Jika kamu ingin menambah fitur, ikuti bagian "Cara Menambah Fitur" dan gunakan utilitas serta pola yang sudah tersedia.