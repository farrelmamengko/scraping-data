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

## Utilitas Terkait

*   **`src/utils/database.js`**: Menyediakan fungsi `insertProcurementData` yang digunakan oleh kedua scraper untuk berinteraksi dengan database SQLite (`database.db`).
*   **`src/utils/helpers.js`**: Menyediakan fungsi `removeDuplicates`. 