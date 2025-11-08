# Docker Setup untuk Xuans Bridge

## Prerequisites

- Docker & Docker Compose terinstall
- File `.env.local` atau `.env` sudah dikonfigurasi

## Development Mode

### Menggunakan Docker Compose (Recommended)

```bash
# Start development server
docker-compose up

# Atau run di background
docker-compose up -d

# Stop container
docker-compose down

# View logs
docker-compose logs -f

# Rebuild container setelah perubahan Dockerfile
docker-compose up --build
```

Aplikasi akan berjalan di `http://localhost:3000`

### Menggunakan Dockerfile langsung

```bash
# Build image
docker build -f Dockerfile.dev -t xuans-bridge-dev .

# Run container
docker run -p 3000:3000 \
  -v $(pwd):/app \
  -v /app/node_modules \
  -v /app/.next \
  -v $(pwd)/data:/app/data \
  --env-file .env.local \
  xuans-bridge-dev
```

## Production Mode

### Menggunakan Docker Compose

```bash
# Build dan start production container
docker-compose -f docker-compose.prod.yml up -d

# Stop container
docker-compose -f docker-compose.prod.yml down

# View logs
docker-compose -f docker-compose.prod.yml logs -f

# Rebuild setelah perubahan
docker-compose -f docker-compose.prod.yml up -d --build
```

### Menggunakan Dockerfile langsung

```bash
# Build production image
docker build -t xuans-bridge .

# Run production container
docker run -d \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  --env-file .env \
  --name xuans-bridge \
  --restart unless-stopped \
  xuans-bridge
```

## Volume Persistence

Database SQLite akan disimpan di `./data/stream-ops.db` yang di-mount sebagai volume, sehingga data akan persist meskipun container di-restart atau di-rebuild.

## Environment Variables

Environment variables bisa di-set melalui:
1. File `.env.local` atau `.env` (akan di-load otomatis)
2. Langsung di `docker-compose.yml` atau `docker-compose.prod.yml`
3. Command line dengan flag `-e`

**Catatan:** Untuk production, semua API keys bisa di-set melalui Settings page di aplikasi (superuser), tidak perlu environment variables.

## Troubleshooting

### Port sudah digunakan
```bash
# Cek port yang digunakan
netstat -ano | findstr :3000  # Windows
lsof -i :3000                 # Mac/Linux

# Atau ubah port di docker-compose.yml
ports:
  - "3001:3000"  # Gunakan port 3001 di host
```

### Database tidak persist
Pastikan volume `./data` di-mount dengan benar:
```bash
# Cek volume
docker volume ls

# Cek mount point
docker inspect xuans-bridge-dev | grep Mounts -A 20
```

### Permission denied
```bash
# Fix permission untuk data directory
sudo chown -R $USER:$USER ./data
chmod -R 755 ./data
```

## Build untuk Production

```bash
# Build production image
docker build -t xuans-bridge:latest .

# Tag untuk registry (jika ingin push)
docker tag xuans-bridge:latest your-registry/xuans-bridge:latest

# Push ke registry
docker push your-registry/xuans-bridge:latest
```

## Deploy ke Server

1. **Copy files ke server:**
```bash
scp -r . user@server:/path/to/app
```

2. **SSH ke server:**
```bash
ssh user@server
cd /path/to/app
```

3. **Start dengan Docker Compose:**
```bash
docker-compose -f docker-compose.prod.yml up -d
```

4. **Setup reverse proxy (Nginx):**
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Health Check

Production container sudah include health check. Cek status:
```bash
docker ps  # Lihat STATUS column
docker inspect xuans-bridge | grep Health -A 10
```

