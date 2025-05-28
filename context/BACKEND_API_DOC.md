# Dokumentasi Backend API Sistem Scraping Tender

Dokumen ini menjelaskan endpoint API yang tersedia dalam sistem scraping tender SKK Migas, yang diatur dalam `server.js`.

## 1. Informasi Umum

*   **Framework**: Express.js
*   **Bahasa**: JavaScript (Node.js)
*   **File Utama**: `server.js`
*   **Port Default**: `3000` (dapat diubah melalui variabel lingkungan `PORT`)
*   **View Engine**: EJS

## 2. Konfigurasi Server dan Middleware

*   **View Engine**: EJS disetel sebagai view engine.
*   **Middleware Parsing Body**:
    *   `express.json()`: Untuk mem-parsing body permintaan JSON.
    *   `express.urlencoded({ extended: true })`: Untuk mem-parsing body permintaan URL-encoded.
*   **Static Files**:
    *   `/local-pdfs`: Menyajikan file statis dari direktori `downloaded_pdfs` (berisi file PDF tender yang diunduh).
    *   `/`: Menyajikan file statis dari direktori `public` (misalnya, CSS, gambar, JavaScript sisi klien).
*   **Inisialisasi Database**: Fungsi `initializeDb()` dari `src/utils/database.js` dipanggil saat server dimulai untuk memastikan database dan tabel siap.

## 3. Endpoint API

Berikut adalah detail untuk setiap endpoint API:

### 3.1. Halaman Utama (Daftar Tender)

*   **Endpoint**: `GET /`
*   **Deskripsi**: Menampilkan halaman utama yang berisi daftar semua tender, baik Prakualifikasi maupun Pelelangan Umum, dengan opsi filter dan paginasi.
*   **Parameter Query (Opsional)**:
    *   `page` (Integer): Nomor halaman untuk paginasi (default: `1`).
    *   `keyword` (String): Kata kunci untuk pencarian pada judul, deskripsi, bidang usaha, KKKS, dll.
    *   `status` (String): Filter status tender. Nilai yang mungkin:
        *   `'active'`: Tender yang belum melewati batas waktu.
        *   `'expired'`: Tender yang sudah melewati batas waktu.
    *   `type` (String): Filter jenis tender. Nilai yang mungkin:
        *   `'Prakualifikasi'`
        *   `'Pelelangan Umum'`
        *   Jika kosong atau tidak ada, kedua jenis akan ditampilkan.
*   **Respons**:
    *   Merender view `views/tenders.ejs`.
    *   **Data yang Dikirim ke View**:
        *   `prakualifikasiTenders`: Array objek tender Prakualifikasi yang sudah diproses.
        *   `pelelanganTenders`: Array objek tender Pelelangan Umum yang sudah diproses.
        *   Setiap objek tender dalam array di atas memiliki properti tambahan:
            *   `isNew` (Boolean): `true` jika tender dipublikasikan dalam 24 jam terakhir.
            *   `isExpired` (Boolean): `true` jika batas waktu tender sudah lewat.
            *   `attachments`: Array objek attachment, dengan `localPdfPath` jika PDF tersedia secara lokal.
        *   `currentPage`: Nomor halaman saat ini.
        *   `totalPagesPrak`: Total halaman untuk tender Prakualifikasi.
        *   `totalPagesPelelangan` (atau `totalPagesPel`): Total halaman untuk tender Pelelangan Umum.
        *   `keyword`, `status`, `type`: Nilai filter yang sedang aktif.
        *   `totalResultsPrak`: Jumlah total tender Prakualifikasi yang ditemukan.
        *   `totalResultsPel`: Jumlah total tender Pelelangan Umum yang ditemukan.
*   **Logika Utama & Fungsi Pendukung**:
    *   `getTendersWithAttachments()` (dari `src/utils/database.js`): Mengambil data tender dari database dengan paginasi dan filter.
    *   `addLocalPdfPath()` (helper di `server.js`): Menambahkan path lokal ke file PDF jika ada.
    *   `checkIsNew()` (helper di `server.js`): Mengecek apakah tender baru.
    *   `checkIsExpired()` (helper di `server.js`): Mengecek apakah tender sudah kedaluwarsa.

### 3.2. Halaman Dashboard

*   **Endpoint**: `GET /dashboard`
*   **Deskripsi**: Menampilkan halaman dashboard dengan ringkasan statistik, daftar tender terbaru, dan kalender deadline tender.
*   **Parameter Query**: Tidak ada.
*   **Respons**:
    *   Merender view `views/dashboard.ejs`.
    *   **Data yang Dikirim ke View**:
        *   `latestTenders`: Array objek tender terbaru (limit 5) yang sudah diproses (`isNew`, `isExpired`).
        *   `calendarEvents`: Array objek untuk FullCalendar, berisi deadline tender.
        *   `totalTenders`: Jumlah total semua tender.
        *   `totalPrakualifikasi`: Jumlah total tender Prakualifikasi.
        *   `totalPelelangan`: Jumlah total tender Pelelangan Umum.
*   **Logika Utama & Fungsi Pendukung**:
    *   `getTendersWithAttachments()` (dari `src/utils/database.js`): Mengambil data tender.
    *   `checkIsNew()`, `checkIsExpired()` (helper di `server.js`).

### 3.3. Halaman Tender Khusus Perusahaan

*   **Endpoint**: `GET /tender-khusus`
*   **Deskripsi**: Menampilkan halaman yang berisi daftar tender yang sudah difilter secara otomatis berdasarkan daftar kata kunci minat perusahaan yang telah ditentukan sebelumnya di server.
*   **Parameter Query (Opsional)**:
    *   `page` (Integer): Nomor halaman untuk paginasi hasil (default: `1`). (Paginasi mungkin perlu implementasi lebih lanjut jika jumlah hasil sangat besar).
*   **Respons**:
    *   Merender view `views/tender-khusus.ejs`.
    *   **Data yang Dikirim ke View**:
        *   `tenders`: Array objek tender yang cocok dengan kata kunci perusahaan, sudah diproses (`isNew`, `isExpired`, `localPdfPath`).
        *   `currentPage`: Nomor halaman saat ini.
        *   `totalPages`: Total halaman untuk hasil yang difilter.
        *   `totalResults`: Jumlah total tender yang cocok sebelum paginasi.
        *   `errorMessage`: Pesan error jika terjadi masalah atau tidak ada kata kunci yang dikonfigurasi.
        *   `searchPerformed`: Selalu `true` karena filter otomatis.
*   **Logika Utama & Fungsi Pendukung**:
    *   `predefinedCompanyKeywords` (Array String, didefinisikan di `server.js`): Daftar kata kunci tetap yang digunakan untuk filter.
    *   `getFilteredTendersByKeywords()` (dari `src/utils/companyTenderFilter.js`): Mengambil dan memfilter tender dari database berdasarkan array kata kunci.
    *   `addLocalPdfPath()`, `checkIsNew()`, `checkIsExpired()` (helper di `server.js`).

### 3.4. Menjalankan Scraper Prakualifikasi

*   **Endpoint**: `POST /run-scraper`
*   **Deskripsi**: Memicu eksekusi skrip scraper untuk tender jenis Prakualifikasi (`src/scrapers/procurementList.js`).
*   **Parameter Request Body**: Tidak ada.
*   **Respons**:
    *   **Sukses (200 OK)**: JSON object `{ "message": "Scraper procurementList.js berhasil dijalankan. Periksa log server untuk detail. Proses mungkin berjalan di latar belakang." }`
    *   **Error (500 Internal Server Error)**: JSON object `{ "message": "Terjadi kesalahan saat menjalankan scraper procurementList.js." }`
*   **Logika Utama & Fungsi Pendukung**:
    *   `runScraperScript()` (helper di `server.js`): Menjalankan skrip scraper menggunakan `child_process.exec`.

### 3.5. Menjalankan Scraper Pelelangan Umum

*   **Endpoint**: `POST /run-scraper-pelelangan`
*   **Deskripsi**: Memicu eksekusi skrip scraper untuk tender jenis Pelelangan Umum (`src/scrapers/pelelangan.js`).
*   **Parameter Request Body**: Tidak ada.
*   **Respons**:
    *   **Sukses (200 OK)**: JSON object `{ "message": "Scraper pelelangan.js berhasil dijalankan. Periksa log server untuk detail. Proses mungkin berjalan di latar belakang." }`
    *   **Error (500 Internal Server Error)**: JSON object `{ "message": "Terjadi kesalahan saat menjalankan scraper pelelangan.js." }`
*   **Logika Utama & Fungsi Pendukung**:
    *   `runScraperScript()` (helper di `server.js`): Menjalankan skrip scraper menggunakan `child_process.exec`.

## 4. Fungsi Helper Utama di `server.js`

*   **`checkIsNew(createdAt)`**: Menerima tanggal `createdAt`, mengembalikan `true` jika tender dibuat dalam 24 jam terakhir.
*   **`checkIsExpired(batasWaktu)`**: Menerima string `batasWaktu` (mis. "DD Mon YYYY"), mengembalikan `true` jika tanggal hari ini sudah melewati `batasWaktu`.
*   **`normalizeFilename(name)`**: Menerima nama file, mengembalikan versi yang dinormalisasi (lowercase, spasi diganti underscore, karakter non-alfanumerik dihapus) untuk pencocokan file PDF.
*   **`addLocalPdfPath(tender)`**: Menerima objek tender, memodifikasi array `tender.attachments` untuk menambahkan properti `localPdfPath` jika file PDF terkait ditemukan di direktori `downloaded_pdfs`. Mencoba mencocokkan dengan nama asli dan nama yang dinormalisasi.
*   **`runScraperScript(scriptPath, res)`**: Menerima path ke skrip scraper dan objek respons Express. Menjalankan skrip Node.js di `src/scrapers/` menggunakan `child_process.exec` dan mengirimkan respons JSON yang sesuai.

## 5. Error Handling

*   Sebagian besar rute utama yang merender halaman memiliki blok `try...catch` untuk menangkap error. Jika terjadi error, server akan merespons dengan status 500 dan pesan "Internal Server Error". Detail error akan dicetak di konsol server.
*   Rute untuk menjalankan scraper juga menangani error dari `child_process.exec` dan merespons dengan status 500 jika eksekusi skrip gagal. 