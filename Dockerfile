# Gunakan image Node.js LTS (Long Term Support) sebagai base
# Versi 'slim' lebih kecil, tapi mungkin memerlukan instalasi dependensi OS manual untuk Playwright
# Jika 'slim' bermasalah, coba ganti ke 'node:18' atau 'node:20'
FROM node:18-slim

# Set direktori kerja di dalam container
WORKDIR /app

# Salin file package.json dan package-lock.json (atau yarn.lock)
# Ini memanfaatkan cache Docker: layer ini hanya akan di-rebuild jika file ini berubah
COPY package*.json ./

# Install dependensi aplikasi
# Termasuk dependensi dev jika scraper atau build step memerlukannya di container
RUN npm install

# Install Playwright browsers dan dependensinya
# '--with-deps' mencoba menginstal dependensi OS yang dibutuhkan
# Jika gagal, mungkin perlu menambahkan 'RUN apt-get update && apt-get install -y ...' 
# dengan daftar dependensi spesifik untuk Playwright (lihat dokumentasi Playwright)
# atau menggunakan base image Playwright resmi (mcr.microsoft.com/playwright/...) 
RUN npx playwright install --with-deps chromium
# Hanya install chromium jika itu yang digunakan, atau hapus 'chromium' untuk install semua

# Salin sisa kode aplikasi ke direktori kerja
COPY . .

# Beri tahu Docker bahwa container akan listen di port 3000
EXPOSE 3000

# Ganti user ke root sebelum menjalankan CMD
# Ini seringkali membantu mengatasi masalah izin pada volume di Docker Desktop (Windows/macOS)
USER root

# Perintah default untuk menjalankan aplikasi (web server)
# Aplikasi akan mencari database.db dan src/download pdf/ di /app
CMD ["node", "server.js"] 