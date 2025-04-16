# Dokumentasi Database Sistem Scraping Tender

Dokumen ini menjelaskan struktur dan penggunaan database SQLite yang menjadi inti penyimpanan data dalam sistem scraping tender SKK Migas.

## 1. Informasi Umum

*   **Tipe Database**: SQLite 3
*   **Nama File**: `database.db`
*   **Lokasi File**: Direktori root proyek.
*   **Pengelolaan**: Koneksi dan operasi dasar dikelola oleh skrip `src/utils/database.js`.

## 2. Inisialisasi Database

*   Database dan tabel utama (`procurement_list`) akan dibuat secara otomatis jika belum ada saat server atau scraper pertama kali dijalankan.
*   Proses inisialisasi ditangani oleh fungsi `initializeDb` dalam `src/utils/database.js`.
*   Fungsi ini juga memastikan kolom `tipe_tender` ditambahkan ke tabel jika belum ada (untuk kompatibilitas mundur).

## 3. Tabel Utama: `procurement_list`

Tabel ini menyimpan semua data tender yang berhasil di-scrape.

### Skema Tabel

| Nama Kolom      | Tipe Data   | Deskripsi                                                                                                | Keterangan Tambahan                  |
| :-------------- | :---------- | :------------------------------------------------------------------------------------------------------- | :----------------------------------- |
| `id`            | `TEXT`      | Identifier unik untuk setiap tender. Digunakan sebagai **PRIMARY KEY**.                                 | Diambil dari `fileId` atau ID unik lain dari sumber. |
| `judul`         | `TEXT`      | Judul atau nama tender.                                                                                 |                                      |
| `tanggal`       | `TEXT`      | Tanggal saat data tender di-scrape dan dimasukkan ke database.                                          | Format: "DD Mon YYYY" (misal: "19 Apr 2025"). Diatur oleh `insertProcurementData`. |
| `kkks`          | `TEXT`      | Nama Kontraktor Kontrak Kerja Sama (KKKS) yang terkait dengan tender.                                |                                      |
| `bidangUsaha`   | `TEXT`      | Deskripsi bidang usaha atau klasifikasi tender.                                                         |                                      |
| `batasWaktu`    | `TEXT`      | Tanggal batas waktu (deadline) tender.                                                                    | Format: "DD Mon YYYY". Diambil dari sumber. |
| `url`           | `TEXT`      | URL sumber atau ID yang bisa digunakan untuk membuat link detail (penggunaannya bisa bervariasi).          | Saat ini diisi dengan `id` atau `fileId`. |
| `attachmentUrl` | `TEXT`      | URL untuk mengunduh file attachment terkait tender (jika ada).                                         |                                      |
| `attachmentName`| `TEXT`      | Nama file attachment (jika ada).                                                                         |                                      |
| `createdAt`     | `DATETIME`  | Timestamp otomatis saat baris data pertama kali dimasukkan ke database.                                 | `DEFAULT CURRENT_TIMESTAMP`          |
| `tipe_tender`   | `TEXT`      | Jenis tender, diisi dengan **'Prakualifikasi'** atau **'Pelelangan Umum'**.                              | Diatur oleh `insertProcurementData`. |

### Logika Penyimpanan Data

*   Data dimasukkan ke tabel ini menggunakan fungsi `insertProcurementData` dari `src/utils/database.js`.
*   Fungsi ini menggunakan perintah SQL `INSERT OR IGNORE INTO procurement_list ...`.
*   **`INSERT OR IGNORE`**: Artinya, jika sebuah baris data baru memiliki `id` yang sama dengan baris yang sudah ada di tabel, baris baru tersebut akan **diabaikan** dan tidak dimasukkan. Data lama **tidak akan diperbarui**.
*   Kolom `tanggal` diisi dengan tanggal saat scraping dilakukan.
*   Kolom `tipe_tender` diisi secara otomatis ('Prakualifikasi' atau 'Pelelangan Umum') tergantung pada scraper mana yang memanggil fungsi.

## 4. Utilitas Terkait (`src/utils/database.js`)

*   **`getDb()`**: Fungsi untuk mendapatkan instance koneksi database (membuat koneksi baru jika belum ada).
*   **`initializeDb()`**: Membuat tabel `procurement_list` jika belum ada dan menambahkan kolom `tipe_tender`.
*   **`insertProcurementData(data, tenderType)`**: Fungsi utama untuk memasukkan array data tender ke dalam database dengan tipe tender yang ditentukan.
*   **`closeDb()`**: Fungsi untuk menutup koneksi database (saat ini mungkin belum digunakan secara aktif di alur utama).
