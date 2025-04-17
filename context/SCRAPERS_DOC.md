# Dokumentasi Scrapers Tender SKK Migas

Dokumen ini menjelaskan detail teknis dari dua scraper utama yang digunakan dalam sistem ini.

## 1. Scraper Undangan Prakualifikasi

*   **File**: `src/scrapers/procurementList.js`
*   **Tujuan**: Mengambil data Undangan Prakualifikasi.
*   **Sumber**: Halaman web statis `/procurement` di situs CIVD SKK Migas, yang menampilkan tender dalam bentuk kartu.
*   **Metode Scraping**: 
    *   **Mengambil ID yang Ada**: Sebelum memulai, scraper memanggil `getExistingTenderIds` dari `database.js` untuk mendapatkan Set ID tender yang sudah ada di database.
    *   Menggunakan `axios` untuk mengirim request GET ke URL endpoint AJAX (`/ajax/search/tnd.jwebs?type=1&d-1789-p=...`).
    *   Melakukan iterasi request GET untuk setiap nomor halaman (`d-1789-p=1`, `d-1789-p=2`, dst.) hingga tidak ada data *baru* lagi yang ditemukan dan tidak ada halaman berikutnya, atau batas maksimum halaman tercapai.
    *   Menggunakan `cheerio` untuk mem-parsing konten HTML dari setiap halaman.
    *   Mengekstrak detail tender (ID, judul, dll.) dari struktur HTML kartu tender.
    *   **Memfilter Data Baru**: Data yang diekstrak dari setiap halaman difilter. Hanya tender dengan ID yang **tidak** ada dalam Set ID yang ada yang akan diproses lebih lanjut. Scraper akan tetap melanjutkan ke halaman berikutnya (jika ada) meskipun halaman saat ini tidak mengandung data baru.
*   **Penanganan Data**: 
    *   Mengumpulkan **hanya data baru** dari semua halaman ke dalam satu array.
*   **Penyimpanan ke Database**: 
    *   Mengimpor fungsi `insertProcurementData` dari `src/utils/database.js`.
    *   Memanggil `insertProcurementData(uniqueNewData, 'Prakualifikasi')` setelah **semua data baru unik** terkumpul.
    *   Fungsi `insertProcurementData` menggunakan perintah SQL `INSERT OR IGNORE INTO procurement_list ...` untuk memasukkan data ke database, secara otomatis mengisi kolom `tipe_tender` dengan `'Prakualifikasi'`. Data dengan ID yang sama yang sudah ada di database akan diabaikan.
*   **Eksekusi Langsung**: Terdapat pemanggilan fungsi `scrapeProcurementList();` di akhir file, sehingga scraper ini dapat dijalankan langsung dari terminal menggunakan `node src/scrapers/procurementList.js`.

## 2. Scraper Pelelangan Umum

*   **File**: `src/scrapers/pelelangan.js`
*   **Tujuan**: Mengambil data Pelelangan Umum.
*   **Sumber**: Endpoint AJAX internal `https://civd.skkmigas.go.id/ajax/search/tnd.jwebs`.
*   **Metode Scraping**: 
    *   **Mengambil ID yang Ada**: Sebelum memulai, scraper memanggil `getExistingTenderIds` dari `database.js` untuk mendapatkan Set ID tender yang sudah ada di database.
    *   Menggunakan `axios` untuk mengirim request `POST` ke endpoint AJAX (`/ajax/search/tnd.jwebs`). Endpoint ini menangani paginasi secara internal berdasarkan parameter request, namun scraper saat ini melakukan iterasi halaman dengan parameter berbeda (`d-1789-p=X` untuk type 1, `d-4486-p=X` untuk type 2 jika AJAX mendukungnya, atau logika POST tunggal seperti sekarang). *Catatan: Logika saat ini untuk pelelangan hanya melakukan satu POST dan mengandalkan response AJAX untuk semua data, lalu memfilter data baru.*
    *   Mengirimkan data form (`application/x-www-form-urlencoded`) dengan parameter yang sesuai (`type=2`, `keyword=''`).
    *   Memasukkan header `X-Requested-With: XMLHttpRequest` untuk meniru request AJAX.
    *   Menggunakan `cheerio` untuk mem-parsing respons HTML *snippet* yang dikembalikan oleh endpoint AJAX.
    *   Mengekstrak detail tender dari struktur HTML yang dikembalikan.
    *   **Memfilter Data Baru**: Data yang diekstrak dari respons difilter. Hanya tender dengan ID yang **tidak** ada dalam Set ID yang ada yang akan diproses lebih lanjut.
*   **Penanganan Data**: 
    *   Mengumpulkan **hanya data baru** dari hasil parsing HTML.
*   **Penyimpanan ke Database**: 
    *   Mengimpor fungsi `insertProcurementData` dari `src/utils/database.js`.
    *   Memanggil `insertProcurementData(uniqueNewData, 'Pelelangan Umum')` setelah **data baru unik** terkumpul.
    *   Fungsi `insertProcurementData` menggunakan perintah SQL `INSERT OR IGNORE INTO procurement_list ...` untuk memasukkan data ke database, secara otomatis mengisi kolom `tipe_tender` dengan `'Pelelangan Umum'`. Data dengan ID yang sama yang sudah ada di database akan diabaikan.
*   **Eksekusi Langsung**: Terdapat pemanggilan fungsi `scrapePelelangan();` di akhir file, sehingga scraper ini dapat dijalankan langsung dari terminal menggunakan `node src/scrapers/pelelangan.js`.

## 3. Utilitas Pengunduhan PDF (Playwright)

*   **File**: `src/scrapers/downloadPDFsPlaywright.js`
*   **Tujuan**: Mengunduh file PDF attachment untuk tender yang telah di-scrape.
*   **Metode**: 
    *   Fungsi `downloadPdfsWithPlaywright` menerima array objek tender (minimal berisi `id` dan `attachmentName`) sebagai argumen.
    *   Menggunakan `playwright` (khususnya `chromium`) untuk meluncurkan browser secara *headless*.
    *   Menavigasi ke halaman utama CIVD (`https://civd.skkmigas.go.id/index.jwebs`).
    *   **Menangani Paginasi:** Melakukan loop melalui halaman-halaman hasil tender:
        *   Memindai halaman *saat ini* untuk menemukan link unduhan (`a.download-btn[data-file-id="..."]`) yang cocok dengan ID tender yang masih ada dalam daftar tunggu.
        *   Untuk setiap link yang ditemukan dan terlihat:
            *   Memeriksa apakah file dengan nama yang sama (setelah disanitasi) sudah ada di direktori `src/download pdf/` menggunakan `fs.existsSync()`.
            *   Jika file **belum ada**, Playwright menunggu event `download` dan mengklik link untuk memicu unduhan, lalu menyimpan file ke `src/download pdf/`.
            *   Jika file **sudah ada**, unduhan dilewati untuk ID tersebut.
            *   Tender yang telah diproses (baik diunduh maupun dilewati) dihapus dari daftar tunggu.
        *   Setelah memindai halaman, mencari tombol "Next" (`#tnd1Result div.pagelinks a[title="Next"].uibutton`).
        *   Jika tombol "Next" ditemukan dan **tidak** memiliki kelas `disable`, Playwright mengkliknya dan menunggu halaman berikutnya dimuat (`networkidle` dan `waitForSelector` untuk kontainer paginasi).
        *   Jika tombol "Next" tidak ditemukan atau memiliki kelas `disable`, loop paginasi berhenti.
    *   Melaporkan ringkasan jumlah file yang berhasil disimpan, dilewati (karena sudah ada), dan gagal/tidak ditemukan.
*   **Integrasi**: 
    *   Fungsi `downloadPdfsWithPlaywright` diekspor dari file ini.
    *   Fungsi ini diimpor dan dipanggil oleh `procurementList.js` *setelah* **data tender baru** berhasil disimpan ke database. Hanya data tender baru unik (array objek) yang diteruskan sebagai argumen ke fungsi ini. `pelelangan.js` saat ini tidak memanggilnya secara terpisah (diasumsikan pemanggilan dari `procurementList.js` sudah cukup, atau perlu pemanggilan terpisah jika diinginkan).
*   **Dependensi**: `playwright`, `fs`, `path`. Perlu menjalankan `npx playwright install` setelah `npm install` untuk mengunduh browser.

## 4. Utilitas Terkait

*   **`src/utils/database.js`**: Menyediakan fungsi (`getDb`, `closeDb`, `insertProcurementData`, `getExistingTenderIds`) yang digunakan oleh scraper utama untuk berinteraksi dengan database SQLite.
*   **`src/utils/helpers.js`**: Menyediakan fungsi `removeDuplicates` yang digunakan oleh scraper utama.
*   **`src/download pdf/`**: Direktori tempat file PDF yang berhasil diunduh oleh `downloadPDFsPlaywright.js` disimpan. 