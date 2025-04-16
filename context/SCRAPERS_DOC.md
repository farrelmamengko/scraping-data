# Dokumentasi Scrapers Tender SKK Migas

Dokumen ini menjelaskan detail teknis dari dua scraper utama yang digunakan dalam sistem ini.

## 1. Scraper Undangan Prakualifikasi

*   **File**: `src/scrapers/procurementList.js`
*   **Tujuan**: Mengambil data Undangan Prakualifikasi.
*   **Sumber**: Halaman web statis `/procurement` di situs CIVD SKK Migas, yang menampilkan tender dalam bentuk kartu.
*   **Metode Scraping**: 
    *   Menggunakan `axios` untuk mengirim request GET ke URL halaman. Karena kontennya statis per halaman, tidak diperlukan Puppeteer atau simulasi browser yang kompleks.
    *   Melakukan iterasi request GET untuk setiap nomor halaman (`?page=1`, `?page=2`, dst.) hingga tidak ada data lagi yang ditemukan atau batas maksimum halaman tercapai.
    *   Menggunakan `cheerio` untuk mem-parsing konten HTML dari setiap halaman.
    *   Mengekstrak detail tender (ID, judul, tanggal, batas waktu, KKKS, bidang usaha, link URL, detail attachment) dari struktur HTML kartu tender.
*   **Penanganan Data**: 
    *   Mengumpulkan data dari semua halaman ke dalam satu array.
    *   Menggunakan fungsi `removeDuplicates` (dari `src/utils/helpers.js`) untuk memastikan data unik berdasarkan ID.
*   **Penyimpanan ke Database**: 
    *   Mengimpor fungsi `insertProcurementData` dari `src/utils/database.js`.
    *   Memanggil `insertProcurementData(uniqueData, 'Prakualifikasi')` setelah semua data unik terkumpul.
    *   Fungsi `insertProcurementData` menggunakan perintah SQL `INSERT OR IGNORE INTO procurement_list ...` untuk memasukkan data ke database, secara otomatis mengisi kolom `tipe_tender` dengan `'Prakualifikasi'`. Data dengan ID yang sama yang sudah ada di database akan diabaikan.
*   **Eksekusi Langsung**: Terdapat pemanggilan fungsi `scrapeProcurementList();` di akhir file, sehingga scraper ini dapat dijalankan langsung dari terminal menggunakan `node src/scrapers/procurementList.js`.

## 2. Scraper Pelelangan Umum

*   **File**: `src/scrapers/pelelangan.js`
*   **Tujuan**: Mengambil data Pelelangan Umum.
*   **Sumber**: Endpoint AJAX internal `https://civd.skkmigas.go.id/ajax/search/tnd.jwebs`.
*   **Metode Scraping**: 
    *   Menggunakan `axios` untuk mengirim request `POST` tunggal ke endpoint AJAX.
    *   Mengirimkan data form (`application/x-www-form-urlencoded`) dengan parameter `type=2` (menandakan Pelelangan Umum) dan `keyword=''`.
    *   Memasukkan header `X-Requested-With: XMLHttpRequest` untuk meniru request AJAX.
    *   Menggunakan `cheerio` untuk mem-parsing respons HTML *snippet* yang dikembalikan oleh endpoint AJAX (respons ini berisi daftar tender dalam format HTML, bukan JSON murni).
    *   Mengekstrak detail tender dari struktur HTML yang dikembalikan.
*   **Penanganan Data**: 
    *   Mengumpulkan data dari hasil parsing HTML.
    *   Menggunakan fungsi `removeDuplicates` (dari `src/utils/helpers.js`) untuk memastikan data unik berdasarkan ID.
*   **Penyimpanan ke Database**: 
    *   Mengimpor fungsi `insertProcurementData` dari `src/utils/database.js`.
    *   Memanggil `insertProcurementData(uniqueData, 'Pelelangan Umum')` setelah data unik terkumpul.
    *   Fungsi `insertProcurementData` menggunakan perintah SQL `INSERT OR IGNORE INTO procurement_list ...` untuk memasukkan data ke database, secara otomatis mengisi kolom `tipe_tender` dengan `'Pelelangan Umum'`. Data dengan ID yang sama yang sudah ada di database akan diabaikan.
*   **Eksekusi Langsung**: Terdapat pemanggilan fungsi `scrapePelelangan();` di akhir file, sehingga scraper ini dapat dijalankan langsung dari terminal menggunakan `node src/scrapers/pelelangan.js`.

## 3. Utilitas Pengunduhan PDF (Playwright)

*   **File**: `src/scrapers/downloadPDFsPlaywright.js`
*   **Tujuan**: Mengunduh file PDF attachment untuk tender yang telah di-scrape.
*   **Metode**: 
    *   Fungsi `downloadPdfsWithPlaywright` menerima array objek tender (minimal berisi `id` dan `attachmentName`) sebagai argumen.
    *   Menggunakan `playwright` (khususnya `chromium`) untuk meluncurkan browser secara *headless*.
    *   Menavigasi ke halaman utama CIVD (`https://civd.skkmigas.go.id/index.jwebs`).
    *   Untuk setiap objek tender yang diterima:
        *   Mencari elemen link `<a>` di halaman yang memiliki kelas `.download-btn` dan atribut `data-file-id` yang cocok dengan `tender.id`.
        *   Jika elemen ditemukan dan terlihat, Playwright akan menunggu event `download` dan kemudian mengklik elemen tersebut untuk memicu unduhan.
        *   File yang diunduh disimpan ke direktori `src/download pdf/` menggunakan nama file yang diambil dari `tender.attachmentName` (setelah disanitasi).
        *   Menangani kasus di mana link tidak ditemukan atau tidak terlihat (misalnya, karena tender ada di halaman lain/paginasi, atau sudah tidak ada).
*   **Integrasi**: 
    *   Fungsi `downloadPdfsWithPlaywright` diekspor dari file ini.
    *   Fungsi ini diimpor dan dipanggil oleh `procurementList.js` dan `pelelangan.js` *setelah* data tender mereka berhasil disimpan ke database. Data tender unik (array objek) diteruskan sebagai argumen ke fungsi ini.
*   **Dependensi**: `playwright`, `fs`, `path`. Perlu menjalankan `npx playwright install` setelah `npm install` untuk mengunduh browser.

## 4. Utilitas Terkait

*   **`src/utils/database.js`**: Menyediakan fungsi `getDb`, `closeDb`, dan `insertProcurementData` yang digunakan oleh scraper untuk berinteraksi dengan database SQLite (`database.db`).
*   **`src/utils/helpers.js`**: Menyediakan fungsi `removeDuplicates`. 
*   **`src/download pdf/`**: Direktori tempat file PDF yang berhasil diunduh oleh `downloadPDFsPlaywright.js` disimpan. 