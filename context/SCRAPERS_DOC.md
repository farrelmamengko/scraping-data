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
    *   Mengekstrak detail tender (ID, judul, **deskripsi**, tanggal, batas waktu, KKKS, **golongan usaha**, **jenis pengadaan**, **bidang usaha**) dari struktur HTML kartu tender.
    *   Mengumpulkan detail **semua** attachment (ID, nama, URL) ke dalam array `allAttachments`.
    *   **Memfilter Data Baru**: Data yang diekstrak dari setiap halaman difilter. Hanya tender dengan ID yang **tidak** ada dalam Set ID yang ada yang akan diproses lebih lanjut. Scraper akan tetap melanjutkan ke halaman berikutnya (jika ada) meskipun halaman saat ini tidak mengandung data baru.
*   **Penanganan Data**: 
    *   Mengumpulkan **hanya data baru** dari semua halaman ke dalam satu array.
    *   (Fungsi `removeDuplicates` masih digunakan pada data baru yang dikumpulkan).
*   **Penyimpanan ke Database**: 
    *   Mengimpor fungsi `insertProcurementData` dari `src/utils/database.js`.
    *   Memanggil `insertProcurementData(uniqueNewData, 'Prakualifikasi')`.
    *   Fungsi `insertProcurementData` sekarang: 
        *   Menyimpan data tender utama (termasuk `deskripsi`, `golonganUsaha`, `jenisPengadaan`) ke tabel `procurement_list` (menggunakan `INSERT OR IGNORE`).
        *   Menghapus attachment lama untuk tender tersebut dari tabel `attachments`.
        *   Menyimpan **setiap** item dalam array `allAttachments` sebagai baris baru di tabel `attachments`, menghubungkannya via `tender_id`.
*   **Pemicu Download PDF**: Setelah berhasil menyimpan data baru, skrip ini memanggil `downloadPdfsWithPlaywright(uniqueNewData)` untuk mencoba mengunduh PDF yang terkait dengan data Prakualifikasi **baru** tersebut.
*   **Eksekusi Langsung**: Terdapat pemanggilan fungsi `scrapeProcurementList();` di akhir file, sehingga scraper ini dapat dijalankan langsung dari terminal menggunakan `node src/scrapers/procurementList.js`.

## 2. Scraper Pelelangan Umum

*   **File**: `src/scrapers/pelelangan.js`
*   **Tujuan**: Mengambil data Pelelangan Umum.
*   **Sumber**: Endpoint AJAX internal `https://civd.skkmigas.go.id/ajax/search/tnd.jwebs`.
*   **Metode Scraping**: 
    *   **Mengambil ID yang Ada**: Sebelum memulai, scraper memanggil `getExistingTenderIds` dari `database.js` untuk mendapatkan Set ID tender yang sudah ada di database.
    *   Menggunakan `axios` untuk mengirim request `POST` tunggal ke endpoint AJAX (`/ajax/search/tnd.jwebs`). Endpoint ini menangani paginasi secara internal berdasarkan parameter request, namun scraper saat ini melakukan iterasi halaman dengan parameter berbeda (`d-1789-p=X` untuk type 1, `d-4486-p=X` untuk type 2 jika AJAX mendukungnya, atau logika POST tunggal seperti sekarang). *Catatan: Logika saat ini untuk pelelangan hanya melakukan satu POST dan mengandalkan response AJAX untuk semua data, lalu memfilter data baru.*
    *   Mengirimkan data form (`application/x-www-form-urlencoded`) dengan parameter yang sesuai (`type=2`, `keyword=''`).
    *   Memasukkan header `X-Requested-With: XMLHttpRequest` untuk meniru request AJAX.
    *   Menggunakan `cheerio` untuk mem-parsing respons HTML *snippet* yang dikembalikan oleh endpoint AJAX.
    *   Mengekstrak detail tender (ID attachment pertama, judul, **deskripsi**, tanggal, batas waktu, KKKS, **golongan usaha**, **jenis pengadaan**, **bidang usaha**) dari struktur HTML yang dikembalikan.
    *   Mengumpulkan detail **semua** attachment (ID, nama, URL) ke dalam array `allAttachments`.
    *   **Memfilter Data Baru**: Data yang diekstrak dari respons difilter. Hanya tender dengan ID yang **tidak** ada dalam Set ID yang ada yang akan diproses lebih lanjut.
*   **Penanganan Data**: 
    *   Mengumpulkan **hanya data baru** dari hasil parsing HTML.
    *   (Fungsi `removeDuplicates` masih digunakan pada data baru yang dikumpulkan).
*   **Penyimpanan ke Database**: 
    *   Mengimpor fungsi `insertProcurementData` dari `src/utils/database.js`.
    *   Memanggil `insertProcurementData(uniqueNewData, 'Pelelangan Umum')`.
    *   Fungsi `insertProcurementData` (seperti dijelaskan di atas) menyimpan data utama ke `procurement_list` dan semua attachment ke tabel `attachments`.
*   **Pemicu Download PDF**: Setelah berhasil menyimpan data baru, skrip ini juga memanggil `downloadPdfsWithPlaywright(uniqueNewData)` untuk mencoba mengunduh PDF yang terkait dengan data Pelelangan Umum **baru** tersebut.
*   **Eksekusi Langsung**: Terdapat pemanggilan fungsi `scrapePelelangan();` di akhir file, sehingga scraper ini dapat dijalankan langsung dari terminal menggunakan `node src/scrapers/pelelangan.js`.

## 3. Utilitas Pengunduhan PDF (Playwright)

*   **File**: `src/scrapers/downloadPDFsPlaywright.js`
*   **Tujuan**: Mengunduh file PDF attachment untuk tender yang telah di-scrape.
*   **Metode**: 
    *   Fungsi `downloadPdfsWithPlaywright` menerima array objek tender. Fungsi ini sekarang mengharapkan objek tender memiliki properti `allAttachments` (array berisi `{id, name}`).
    *   Membuat daftar datar dari semua attachment individual.
    *   Menggunakan `playwright` (khususnya `chromium`) untuk meluncurkan browser secara *headless*.
    *   Menavigasi ke halaman utama CIVD (`https://civd.skkmigas.go.id/index.jwebs`).
    *   **Menangani Paginasi:** Melakukan loop melalui halaman-halaman hasil tender:
        *   Memindai halaman *saat ini* untuk menemukan link unduhan (`a.download-btn[data-file-id="..."]`) yang cocok dengan **ID attachment individual** yang belum diproses.
        *   Untuk setiap link yang ditemukan dan terlihat:
            *   Memeriksa apakah file dengan nama yang sama (berdasarkan **nama attachment individual** yang disanitasi) sudah ada di direktori `src/download pdf/` menggunakan `fs.existsSync()`.
            *   Jika file **belum ada**, Playwright menunggu event `download` dan mengklik link untuk memicu unduhan, lalu menyimpan file ke `src/download pdf/`.
            *   Jika file **sudah ada**, unduhan dilewati untuk ID tersebut.
            *   Attachment yang telah diproses ditandai.
        *   Setelah memindai halaman, mencari tombol "Next" (`#tnd1Result div.pagelinks a[title="Next"].uibutton`).
        *   Jika tombol "Next" ditemukan dan **tidak** memiliki kelas `disable`, Playwright mengkliknya dan menunggu halaman berikutnya dimuat (`networkidle` dan `waitForSelector` untuk kontainer paginasi).
        *   Jika tombol "Next" tidak ditemukan atau memiliki kelas `disable`, loop paginasi berhenti.
    *   Melaporkan ringkasan jumlah file yang berhasil disimpan, dilewati (karena sudah ada), dan gagal/tidak ditemukan.
*   **Integrasi**: 
    *   Fungsi `downloadPdfsWithPlaywright` diekspor dari file ini.
    *   Fungsi ini sekarang diimpor dan dipanggil oleh **kedua** scraper (`procurementList.js` dan `pelelangan.js`) *setelah* data tender **baru** mereka berhasil disimpan ke database. Hanya data tender baru (yang berisi `allAttachments`) yang diteruskan sebagai argumen.
*   **Dependensi**: `playwright`, `fs`, `path`. Perlu menjalankan `npx playwright install` setelah `npm install` untuk mengunduh browser.

## 4. Utilitas Terkait

*   **`src/utils/database.js`**: Menyediakan fungsi (`getDb`, `closeDb`, `insertProcurementData`, `getExistingTenderIds`, `initializeDb`) untuk berinteraksi dengan database SQLite. `initializeDb` sekarang membuat tabel `procurement_list` (dengan kolom baru) dan tabel `attachments`. `insertProcurementData` menangani penyimpanan ke kedua tabel menggunakan transaksi.
*   **`src/utils/helpers.js`**: Menyediakan fungsi `removeDuplicates` dan `sanitizeFilename`.
*   **`src/download pdf/`**: Direktori tempat file PDF yang berhasil diunduh oleh `downloadPDFsPlaywright.js` disimpan. 