# Dokumentasi Logika UI Aplikasi Web Tender

Dokumen ini menjelaskan logika antarmuka pengguna (UI) dari aplikasi web Express.js yang menampilkan data tender hasil scraping.

## 1. Halaman Utama (`/`)

*   **Akses**: `http://localhost:3000/`
*   **File Backend**: `server.js` (route `app.get('/')`)
*   **File Frontend**: `views/tenders.ejs`
*   **Fungsi Utama**:
    *   Menampilkan daftar tender yang dibagi menjadi dua bagian: "Undangan Prakualifikasi" dan "Pelelangan Umum".
    *   Menyertakan Panel Pencarian untuk memfilter data tender.
    *   Menampilkan data tender dalam format kartu (`.tender-card`).
    *   Mengimplementasikan pagination terpisah untuk setiap jenis tender jika jumlah data melebihi batas per halaman (6 item).
    *   Menyediakan tombol "Detail" pada setiap kartu untuk membuka modal popup.
    *   Menyediakan tombol/link untuk mengunduh PDF attachment jika tersedia secara lokal.

## 2. Halaman Dashboard (`/dashboard`)

*   **Akses**: `http://localhost:3000/dashboard`
*   **File Backend**: `server.js` (route `app.get('/dashboard')`)
*   **File Frontend**: `views/dashboard.ejs`
*   **Fungsi Utama**:
    *   Menampilkan ringkasan statistik jumlah tender (Total, Prakualifikasi, Pelelangan Umum) dalam kartu statistik (`.stat-card`).
    *   Menampilkan kalender interaktif (menggunakan FullCalendar) yang menandai tanggal **batas waktu** tender.
    *   Menampilkan daftar 5 tender **terbaru** yang ditambahkan ke database (`.latest-tenders-list`), lengkap dengan label status ("New", "Expired") jika relevan.
    *   Menyediakan link untuk kembali ke Halaman Utama.

## 3. Komponen UI Utama

### a. Panel Pencarian (di Halaman Utama)

*   **File Frontend**: `views/tenders.ejs` (Form HTML di dalam `.search-panel`)
*   **File Backend**: `server.js` (di dalam route `app.get('/')`)
*   **Logika**:
    *   Form menggunakan metode `GET` untuk mengirim parameter pencarian ke route `/`.
    *   **Filter**:
        *   `keyword`: Mencari teks di kolom `judul`, `deskripsi`, `bidangUsaha`, `kkks`, `golonganUsaha`, dan `jenisPengadaan` (menggunakan `LIKE %...%`).
        *   `type`: Memfilter berdasarkan `tipe_tender` ('Prakualifikasi' atau 'Pelelangan Umum').
        *   `status`: Memfilter berdasarkan apakah tender 'active' (batas waktu >= hari ini) atau 'expired' (batas waktu < hari ini). Logika perbandingan tanggal dilakukan di backend (JavaScript) setelah data diambil dari database PostgreSQL.
    *   Backend (`server.js`) membaca `req.query` (keyword, type, status) dan membangun filter secara dinamis.
    *   Nilai filter yang dipilih dipertahankan di form setelah pencarian.
    *   Menampilkan ringkasan hasil pencarian (jika ada filter aktif) di atas daftar tender.
    *   Tombol "Reset" mengarahkan kembali ke `/` tanpa parameter query.

### b. Kartu Tender (di Halaman Utama & Dashboard)

*   **File Frontend**: `views/tenders.ejs`, `views/dashboard.ejs`
*   **Logika Tampilan**:
    *   Menampilkan informasi dasar: Judul, Tanggal Tayang (tanggal scraping), Batas Waktu, KKKS, Bidang Usaha, Deskripsi, Golongan Usaha, Jenis Pengadaan.
    *   **Label Status**:
        *   **"New"**: Ditampilkan jika tender ditambahkan ke database dalam 24 jam terakhir. Logika pengecekan (`checkIsNew`) ada di `server.js`, menambahkan flag `isNew` ke data tender. Ditampilkan jika `tender.isNew === true`.
        *   **"Expired"**: Ditampilkan jika `batasWaktu` tender sudah lewat (lebih kecil atau sama dengan tanggal hari ini). Logika pengecekan (`checkIsExpired`) ada di `server.js`, menambahkan flag `isExpired` ke data tender. Ditampilkan jika `tender.isExpired === true`.
    *   **Tombol Aksi (di Halaman Utama)**:
        *   "Detail": Membuka Modal Detail. Tombol ini membawa atribut `data-deskripsi` dan `data-bidang-usaha` (serta data lainnya) untuk digunakan oleh modal.
        *   Link PDF: Menampilkan nama file attachment (dari tabel `attachments`) dan mengarah ke URL `/local-pdfs/:filename` jika file PDF yang sesuai ditemukan di direktori lokal (`src/download pdf/`). Logika pengambilan data attachment dan pengecekan file lokal (`addLocalPdfPath`) dilakukan di `server.js`. Tombol menjadi non-aktif atau tidak ditampilkan jika PDF tidak ditemukan lokal.

### c. Pagination (di Halaman Utama)

*   **File Backend**: `server.js` (di dalam route `app.get('/')`)
*   **File Frontend**: `views/tenders.ejs`
*   **Logika**:
    *   Diterapkan secara terpisah untuk bagian Prakualifikasi dan Pelelangan Umum.
    *   Backend menghitung jumlah total halaman (`totalPagesPrak`, `totalPagesPel`) berdasarkan jumlah data yang relevan (setelah filtering) dan `itemsPerPage`.
    *   Backend melakukan slicing data (`.slice(startIndex, ...)`) untuk mendapatkan data halaman yang sedang aktif.
    *   Frontend merender kontrol pagination menggunakan EJS, menampilkan nomor halaman, tombol "prev"/"next", dan "..." jika halaman terlalu banyak.
    *   Semua link pagination menyertakan parameter query pencarian yang sedang aktif (`keyword`, `type`, `status`) untuk mempertahankan state filter saat berpindah halaman.

### d. Modal Detail (di Halaman Utama)

*   **File Frontend**: `views/tenders.ejs` (Struktur HTML modal dan script JS di bagian bawah)
*   **Logika**:
    *   Modal disembunyikan secara default (CSS `display: none`).
    *   Tombol "Detail" pada kartu tender memiliki atribut `data-*` yang menyimpan informasi detail tender.
    *   Script JavaScript menggunakan *event delegation* untuk menangkap klik pada tombol "Detail".
    *   Saat diklik, script membaca `data-*` dari tombol yang diklik (termasuk `data-deskripsi` dan `data-bidang-usaha`), mengisi konten modal (judul, tanggal, batas, kkks, **deskripsi**, **bidang usaha**, golongan usaha, jenis pengadaan, dll.), dan menampilkan modal (mengubah `display` menjadi `flex`). Deskripsi singkat ditampilkan di elemen `<p id="modalDeskripsi">` dan Bidang Usaha ditampilkan di elemen `<p id="modalBidang">`.
    *   Tombol close (`&times;`) dan klik di luar area konten modal akan menyembunyikan modal kembali.

### e. Kalender Deadline (di Dashboard)

*   **File Frontend**: `views/dashboard.ejs` (Menggunakan library FullCalendar)
*   **File Backend**: `server.js` (di dalam route `app.get('/dashboard')`)
*   **Logika**:
    *   Backend mengambil semua data tender, memformat kolom `batasWaktu` menjadi format `YYYY-MM-DD` yang dibutuhkan FullCalendar, dan membuat array `calendarEvents`.
    *   Array `calendarEvents` (berisi `{title: 'Deadline: ...', start: 'YYYY-MM-DD'}`) dikirim ke frontend.
    *   JavaScript di frontend menginisialisasi FullCalendar dengan data `calendarEvents` tersebut.

## 4. Styling dan Interaktivitas

*   **Styling**: Sebagian besar gaya (CSS) didefinisikan di dalam tag `<style>` pada masing-masing file EJS (`tenders.ejs`, `dashboard.ejs`). Termasuk layout, warna, font, gaya kartu, label, modal, dan pagination.
*   **Interaktivitas**:
    *   Modal Detail: Ditangani oleh JavaScript vanilla yang disematkan di `views/tenders.ejs`.
    *   Kalender: Ditangani oleh library FullCalendar yang diinisialisasi oleh JavaScript di `views/dashboard.ejs`.
    *   Pencarian & Pagination: Menggunakan form HTML standar dan link `<a>` yang memuat ulang halaman dengan parameter query string.

## 5. Alur Data Backend ke Frontend

1.  Request masuk ke route Express (`/` atau `/dashboard`).
2.  Handler route di `server.js` mengambil data dari database PostgreSQL menggunakan utility di `src/utils/database.js`.
3.  Data mentah dari database diproses:
    *   Path PDF lokal ditambahkan (`addLocalPdfPath`), menggunakan data nama file dari `attachments` dan mengecek keberadaan file di `src/download pdf/`.
    *   Flag status ditambahkan (`checkIsExpired`, `checkIsNew`).
    *   Data difilter berdasarkan parameter pencarian (khusus route `/`).
    *   Data di-slice untuk pagination (khusus route `/`).
    *   Data disiapkan untuk kalender (khusus route `/dashboard`).
4.  Objek data yang sudah diproses (misalnya `viewData` atau `dashboardData`), yang kini mungkin menyertakan array attachments per tender, dilewatkan ke fungsi `res.render('nama_template', objek_data)`.
5.  Engine EJS merender file template (`.ejs`) dengan mengganti variabel EJS (`<%= ... %>`) dan menjalankan logika EJS (`<% ... %>`) menggunakan data yang diterima dari backend.
6.  HTML hasil render dikirim sebagai respons ke browser klien. 