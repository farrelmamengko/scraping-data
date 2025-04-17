# Scraper Tender SKK Migas (dengan Download PDF)

Proyek ini berisi sekumpulan scraper Node.js untuk mengambil data tender dari situs CIVD SKK Migas dan aplikasi web sederhana untuk menampilkannya. Scraper juga dilengkapi dengan kemampuan untuk mengunduh attachment PDF terkait menggunakan Playwright.

## Fitur

*   Scraping data Undangan Prakualifikasi.
*   Scraping data Pelelangan Umum melalui endpoint AJAX.
*   **Scraping Efisien**: Hanya mengambil dan memproses data tender **baru** yang belum ada di database.
*   Menyimpan data hasil scraping ke database SQLite (`database.db`).
*   **Mengunduh attachment PDF** yang terkait dengan tender Prakualifikasi dan Pelelangan Umum menggunakan otomatisasi browser Playwright.
*   Menangani paginasi saat mengunduh PDF.
*   Melewati unduhan PDF jika file dengan nama yang sama sudah ada.
*   Aplikasi web Express.js sederhana untuk menampilkan data tender dari database.
*   Menyajikan PDF yang telah diunduh melalui aplikasi web.

## Instalasi

1.  **Clone Repository:**
    ```bash
    git clone <url-repository-anda>
    cd <nama-folder-proyek>
    ```
2.  **Install Dependencies:**
    ```bash
    npm install
    ```
3.  **Install Browser Playwright:** Playwright memerlukan browser terpisah untuk otomatisasi. Jalankan perintah berikut untuk mengunduhnya:
    ```bash
    npx playwright install
    ```
    *(Ini mungkin memerlukan waktu beberapa saat tergantung koneksi internet Anda)*
4.  **(Opsional) Setup Database:** Database SQLite (`database.db`) akan dibuat secara otomatis saat scraper atau server dijalankan pertama kali jika belum ada.

## Penggunaan

1.  **Menjalankan Scraper (termasuk Download PDF):**
    *   Untuk Undangan Prakualifikasi:
        ```bash
        node src/scrapers/procurementList.js
        ```
    *   Untuk Pelelangan Umum:
        ```bash
        node src/scrapers/pelelangan.js
        ```
    *Catatan:* Menjalankan salah satu scraper di atas akan mengambil data tender *dan* secara otomatis memicu proses pengunduhan PDF menggunakan Playwright setelah data disimpan.

2.  **Menjalankan Aplikasi Web Server:**
    ```bash
    node server.js
    ```
    Aplikasi akan berjalan di `http://localhost:3000` (default).

## Struktur Folder

*   `src/scrapers/`: Berisi script scraper (`procurementList.js`, `pelelangan.js`) dan utilitas pengunduhan PDF (`downloadPDFsPlaywright.js`).
*   `src/utils/`: Berisi utilitas pembantu seperti koneksi database (`database.js`) dan penghapusan duplikat (`helpers.js`).
*   `src/download pdf/`: **Direktori tempat file PDF yang berhasil diunduh disimpan.**
*   `views/`: Berisi template EJS untuk aplikasi web (`tenders.ejs`, `dashboard.ejs`).
*   `public/`: Berisi file statis (CSS, JS client-side) untuk aplikasi web.
*   `database.db`: File database SQLite.
*   `server.js`: Script utama untuk menjalankan server aplikasi web Express.
*   `.env`: File untuk menyimpan variabel lingkungan (jika ada, saat ini tidak digunakan secara aktif oleh fungsi inti).
*   `package.json`, `package-lock.json`: File manajemen dependensi Node.js.

## 1. Ikhtisar Proyek

Proyek ini adalah aplikasi Node.js yang dirancang untuk:

1.  **Mengambil (scrape)** data pengadaan tender secara otomatis dari situs web Centralized Integrated Vendor Database (CIVD) SKK Migas.
2.  Mengambil dua jenis tender utama: **Undangan Prakualifikasi** dan **Pelelangan Umum**.
3.  **Menyimpan** data yang telah di-scrape ke dalam database SQLite lokal.
4.  **Menyajikan** data tersebut melalui **antarmuka web (webapp)** yang interaktif, menampilkan daftar tender dengan pagination, detail tender dalam modal popup, dan sebuah dashboard ringkasan.

## 2. Fitur Utama

*   **Scraping Otomatis**: Mengambil data dari sumber web yang relevan.
*   **Dua Jenis Tender**: Mendukung pengambilan data Prakualifikasi dan Pelelangan Umum.
*   **Penyimpanan Database**: Menggunakan SQLite untuk persistensi data yang efisien.
*   **Web Interface**: Menampilkan data melalui server web Express dengan template EJS.
*   **Tampilan Kartu Tender**: Menyajikan data tender dalam format kartu yang informatif dan visual.
*   **Pagination**: Membagi daftar tender yang panjang menjadi beberapa halaman (6 item per halaman) untuk kemudahan navigasi.
*   **Modal Detail**: Menampilkan detail ringkas tender dalam jendela popup saat tombol "Detail" diklik.
*   **Dashboard Ringkasan**: Halaman terpisah (`/dashboard`) yang menampilkan:
    *   Statistik jumlah total tender, jumlah per jenis.
    *   Daftar 5 tender terbaru yang ditambahkan.
    *   Kalender interaktif yang menandai tanggal **batas waktu (deadline)** tender.
*   **Pemisahan Kode**: Struktur folder yang terorganisir untuk scrapers, utilitas, views, dan tes.
*   **Tanggal Scraping sebagai Tanggal Tayang**: Kolom "Tanggal Tayang" di database dan UI diisi dengan tanggal saat data tersebut berhasil di-scrape.

## 3. Arsitektur & Komponen

Sistem ini terdiri dari beberapa komponen utama:

*   **Scrapers (`src/scrapers/`)**: Bertugas mengambil data.
    *   `procurementList.js`: Untuk Undangan Prakualifikasi.
    *   `pelelangan.js`: Untuk Pelelangan Umum.
*   **Database Utility (`src/utils/database.js`)**: Mengelola koneksi dan operasi database SQLite (`database.db`). Menyediakan fungsi `insertProcurementData` dan `getExistingTenderIds`.
*   **Helper Utility (`src/utils/helpers.js`)**: Berisi fungsi pendukung (misalnya, `removeDuplicates`).
*   **Server (`server.js`)**: Server web Express yang menangani request, mengambil data dari database, dan merender halaman.
*   **Views (`views/`)**: File template EJS untuk antarmuka pengguna.
    *   `tenders.ejs`: Halaman utama menampilkan daftar tender (dengan kartu dan pagination).
    *   `dashboard.ejs`: Halaman dashboard dengan ringkasan, kalender, dan tender terbaru.
*   **Database File (`database.db`)**: File SQLite tempat data tender disimpan.
*   **Tests (`src/tests/`)**: Berisi file untuk pengujian fungsi scraper (implementasi tes saat ini mungkin perlu diperbarui).

## 4. Pengaturan & Instalasi

1.  **Prasyarat**: Pastikan Anda memiliki Node.js dan npm (atau yarn) terinstal di sistem Anda.
2.  **Clone Repository**: Dapatkan kode proyek ini.
3.  **Instal Dependensi**: Buka terminal di direktori root proyek dan jalankan:
    ```bash
    npm install
    ```
    Ini akan menginstal library yang diperlukan seperti `express`, `axios`, `cheerio`, `sqlite3`, `ejs`, dll.
4.  **Inisialisasi Database**: Database (`database.db`) dan tabel (`procurement_list`) akan dibuat secara otomatis saat server atau scraper pertama kali dijalankan (melalui `initializeDb` di `database.js`).

## 5. Menjalankan Aplikasi

### a. Menjalankan Scrapers (Untuk Mengisi/Memperbarui Database)

**Penting:** Jalankan scraper satu per satu dan pastikan tidak ada aplikasi lain (seperti DB Browser) yang mengunci file `database.db`.

1.  **Jalankan Scraper Prakualifikasi:**
    ```bash
    node src/scrapers/procurementList.js
    ```
2.  **Jalankan Scraper Pelelangan Umum:**
    ```bash
    node src/scrapers/pelelangan.js
    ```

Menjalankan scraper akan mengambil data terbaru dari CIVD dan menyimpannya ke `database.db`. Kolom `tanggal` akan diisi dengan waktu scraping saat ini.

### b. Menjalankan Web Server (Untuk Melihat Data)

1.  Jalankan server Express:
    ```bash
    node server.js
    ```
2.  Buka browser Anda dan akses:
    *   **Daftar Tender Utama**: `http://localhost:3000/`
    *   **Dashboard**: `http://localhost:3000/dashboard`

## 6. Detail Fungsi & Fitur

*   **Halaman Utama (`/`)**: Menampilkan daftar tender Prakualifikasi dan Pelelangan Umum dalam section terpisah. Setiap section menggunakan layout kartu dan memiliki kontrol pagination di bawahnya jika data melebihi 6 item. Mengklik tombol "Detail" pada kartu akan membuka modal popup.
*   **Halaman Dashboard (`/dashboard`)**: Menampilkan ringkasan jumlah tender, daftar 5 tender terbaru, dan kalender interaktif yang menandai tanggal deadline (`batasWaktu`) tender.
*   **Modal Detail**: Popup yang muncul saat tombol "Detail" diklik, menampilkan informasi ringkas tender (judul, tanggal tayang (scraping), batas waktu, KKKS, bidang usaha, attachment).
*   **Kalender Deadline**: Kalender di dashboard menggunakan `batasWaktu` tender untuk menandai tanggal penting.

## 7. Catatan & Potensi Pengembangan

*   **Database Locking**: Jika Anda mendapatkan error `SQLITE_BUSY`, pastikan tidak ada proses lain yang mengakses `database.db`.
*   **Update Data**: Scraper saat ini dirancang untuk **hanya menambahkan data baru**. Data lama di database (misalnya, perubahan batas waktu pada tender yang sudah ada) **tidak akan diperbarui** oleh proses scraping. Jika diperlukan pembaruan data lama, strategi lain seperti menghapus data lama sebelum scraping atau implementasi logika UPDATE perlu dipertimbangkan.
*   **Filter Kata Kunci**: Fitur selanjutnya bisa berupa penambahan filter berdasarkan kata kunci di halaman utama atau dashboard untuk menampilkan tender yang relevan dengan bidang usaha tertentu.
*   **Deskripsi Detail**: Modal saat ini menampilkan bidang usaha sebagai deskripsi. Untuk menampilkan deskripsi pekerjaan yang sangat panjang seperti di situs aslinya, scraper perlu dimodifikasi untuk mengambil teks tersebut dan skema database perlu disesuaikan.
*   **Penjadwalan Otomatis**: Gunakan `node-cron` atau penjadwal sistem operasi untuk menjalankan scraper secara berkala.
*   **Error Handling & Logging**: Tingkatkan penanganan error dan standarisasi format log untuk pemantauan yang lebih baik.
*   **Pemisahan CSS/JS**: Pindahkan kode CSS dan JavaScript dari file EJS ke file statis terpisah di folder `public/` untuk organisasi yang lebih baik.

## Instalasi

1. Clone repository ini
2. Install dependencies:
   ```
   npm install
   ```
3. Buat file `.env` di root project dengan isi sebagai berikut:
   ```
   TARGET_URL=https://civd.skkmigas.go.id/index.jwebs
   ```

## Penggunaan

Jalankan aplikasi dengan perintah:

```
npm start
```
atau
```
node src/index.js
```

Ini akan mengambil data tender (Undangan Prakualifikasi dan Pelelangan Umum) dari website CIVD SKK Migas dan menampilkannya dalam format JSON dan juga menyimpannya dalam file CSV di direktori `output`.

### Output CSV

Aplikasi akan menghasilkan file CSV di direktori `output` dengan format nama sebagai berikut:
- `undangan_prakualifikasi_YYYYMMDD_HHMMSS.csv` - Untuk data Undangan Prakualifikasi
- `pelelangan_umum_YYYYMMDD_HHMMSS.csv` - Untuk data Pelelangan Umum

## Pendekatan Scraping

Scraper ini menggunakan beberapa pendekatan untuk mengambil data dari situs CIVD SKK Migas:

1. **Puppeteer Browser Automation**:
   - Menjalankan browser headless atau non-headless untuk mengakses situs
   - Navigasi otomatis ke section yang relevan di halaman
   - Ekstraksi data dari elemen HTML dengan selectors spesifik

2. **Navigasi Pagination**:
   - Mendeteksi jumlah halaman dari UI pagination
   - Menggunakan beberapa strategi navigasi:
     - Klik langsung pada tombol halaman dengan JavaScript
     - Navigasi URL langsung dengan parameter halaman
     - Force reload dengan parameter URL yang berbeda

3. **Pencegahan Data Duplikat**:
   - Tracking judul tender yang sudah diproses
   - Filter data berdasarkan judul

4. **Retry Logic**:
   - Retry otomatis saat navigasi gagal
   - Mencoba pendekatan alternatif untuk memuat halaman

## Keterbatasan yang Ditemui

Meskipun scraper ini berhasil mengekstrak data, ada beberapa keterbatasan yang ditemui:

1. **Sistem AJAX Kompleks**:
   - Situs menggunakan sistem AJAX yang kompleks untuk navigasi pagination
   - Tombol pagination memerlukan interaksi pengguna yang sulit disimulasikan sepenuhnya

2. **State Management**:
   - Situs menyimpan state di frontend yang hilang saat menggunakan navigasi URL langsung
   - Indikator halaman aktif tidak selalu update saat mengakses URL dengan parameter halaman

3. **Konten Terbatas**:
   - Meskipun UI menunjukkan beberapa halaman, saat ini situs mungkin hanya memiliki beberapa tender aktif
   - Setelah mencoba berbagai pendekatan, hanya 6 tender prakualifikasi dan 2 tender pelelangan yang ditemukan

4. **Rendering JavaScript**:
   - Beberapa bagian situs menggunakan rendering JavaScript yang kompleks
   - Konten mungkin dimuat secara dinamis berdasarkan interaksi pengguna

## Pengembangan Lebih Lanjut

Untuk pengembangan lebih lanjut, beberapa pendekatan yang bisa dicoba:

1. **Browser Automation dengan Event Recording**:
   - Merekam dan memutar ulang interaksi pengguna yang lebih kompleks
   - Menggunakan event listeners untuk mendeteksi perubahan DOM

2. **API Reverse Engineering**:
   - Mencoba menemukan endpoint API langsung yang digunakan situs
   - Menganalisis request network saat navigasi halaman

3. **Web Socket Monitoring**:
   - Memantau komunikasi websocket jika situs menggunakannya
   - Meniru request websocket untuk mendapatkan data

4. **Menggunakan Service Scraping Khusus**:
   - Layanan seperti ScraperAPI, Bright Data, atau Browserless mungkin lebih efektif untuk situs kompleks ini

## Kustomisasi

Jika struktur website berubah, Anda dapat menyesuaikan selectors HTML di file-file berikut:
- `src/scrapers/prakualifikasi.js` - Untuk scraper Undangan Prakualifikasi
- `src/scrapers/pelelangan.js` - Untuk scraper Pelelangan Umum

## Dependensi Utama

- Puppeteer: Browser automation
- CSV Writer: Ekspor data ke CSV
- Dotenv: Manajemen environment variable

## License

ISC 