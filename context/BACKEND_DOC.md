# Dokumentasi Backend (server.js)

## 1. Arsitektur Umum
Backend aplikasi ini dibangun dengan **Express.js** dan berfungsi sebagai server web utama yang:
- Meng-handle request HTTP dari browser
- Mengambil data dari database PostgreSQL melalui utility (`src/utils/database.js`)
- Memproses dan menyiapkan data untuk view (EJS)
- Merender halaman utama (`/`) dan dashboard (`/dashboard`)
- Menyajikan file statis dan PDF attachment

## 2. Route Utama

### a. Halaman Utama (`/`)
- **Method:** GET
- **Fungsi:**
  - Mengambil data tender Prakualifikasi dan Pelelangan Umum
  - Mendukung filter pencarian (keyword, type, status)
  - Melakukan filter status (active/expired) di backend (JS)
  - Menyiapkan data untuk pagination
  - Menambahkan flag status (isNew, isExpired) dan path PDF lokal
  - Merender view `tenders.ejs` dengan data yang sudah diproses

### b. Dashboard (`/dashboard`)
- **Method:** GET
- **Fungsi:**
  - Mengambil 5 tender terbaru
  - Mengambil semua tender untuk statistik dan kalender
  - Menghitung total tender, total Prakualifikasi, total Pelelangan
  - Membuat event kalender dari batasWaktu tender (format YYYY-MM-DD)
  - Merender view `dashboard.ejs` dengan data statistik, kalender, dan tender terbaru

## 3. Fungsi Utility Backend

### a. `checkIsNew(createdAt)`
- **Deskripsi:** Mengecek apakah tender baru (ditambahkan < 24 jam)
- **Parameter:** `createdAt` (string tanggal ISO)
- **Return:** `true` jika baru, `false` jika tidak

### b. `checkIsExpired(batasWaktu)`
- **Deskripsi:** Mengecek apakah tender sudah melewati batas waktu
- **Parameter:** `batasWaktu` (string, format "DD Mon YYYY" atau "DD MMMM YYYY")
- **Return:** `true` jika expired, `false` jika masih aktif

### c. `addLocalPdfPath(tender)`
- **Deskripsi:** Menambahkan properti `localPdfPath` pada setiap attachment tender jika file PDF tersedia di folder lokal
- **Parameter:** `tender` (objek tender)
- **Return:** tender dengan attachment yang sudah diupdate path-nya

## 4. Alur Data Request ke View
1. User mengakses route (`/` atau `/dashboard`)
2. Backend mengambil data dari database via utility (`getTendersWithAttachments`)
3. Data difilter dan diproses (status, path PDF, flag baru/expired)
4. Data disiapkan untuk pagination/statistik/kalender
5. Data dikirim ke view EJS untuk dirender menjadi HTML
6. HTML dikirim ke browser user

## 5. Dependensi Utility & Database
- Semua query database dilakukan via utility di `src/utils/database.js`
- Tidak ada query SQL langsung di server.js
- Utility lain: helpers.js (sanitizeFilename, dsb)

## 6. Contoh Alur Request
### a. Halaman Utama
- User akses `/` → server.js ambil data tender → filter & proses → render `tenders.ejs`

### b. Dashboard
- User akses `/dashboard` → server.js ambil data tender → hitung statistik & event kalender → render `dashboard.ejs`

## 7. Tips Pengembangan
- Tambahkan route baru dengan pola serupa (ambil data → proses → render view)
- Untuk fitur baru, buat utility di `src/utils/` jika perlu query/logic khusus
- Selalu tambahkan pengujian untuk fungsi utama
- Hindari perubahan besar pada arsitektur jika fitur utama sudah stabil
- Dokumentasikan setiap fungsi baru di context agar mudah dipahami tim 