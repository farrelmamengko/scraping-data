# Dokumentasi Database Sistem Scraping Tender

Dokumen ini menjelaskan struktur dan penggunaan database SQLite yang menjadi inti penyimpanan data dalam sistem scraping tender SKK Migas.

## 1. Informasi Umum

*   **Tipe Database**: SQLite 3
*   **Nama File**: `database.db`
*   **Lokasi File**: Direktori root proyek.
*   **Pengelolaan**: Koneksi dan operasi dasar dikelola oleh skrip `src/utils/database.js`.

## 2. Inisialisasi Database

*   Database serta tabel utama (`procurement_list` dan `attachments`) akan dibuat secara otomatis jika belum ada saat server atau scraper pertama kali dijalankan.
*   Proses inisialisasi ditangani oleh fungsi `initializeDb` dalam `src/utils/database.js`.
*   Fungsi ini juga memastikan kolom `tipe_tender` dan kolom-kolom baru lainnya ditambahkan ke tabel `procurement_list` jika belum ada (untuk kompatibilitas mundur).

## 3. Tabel Utama: `procurement_list`

Tabel ini menyimpan semua data tender yang berhasil di-scrape.

### Skema Tabel

| Nama Kolom      | Tipe Data   | Deskripsi                                                                                                | Keterangan Tambahan                  |
| :-------------- | :---------- | :------------------------------------------------------------------------------------------------------- | :----------------------------------- |
| `id`            | `TEXT`      | Identifier unik untuk setiap tender. Digunakan sebagai **PRIMARY KEY**.                                 | Diambil dari `fileId` atau ID unik lain dari sumber. |
| `judul`         | `TEXT`      | Judul atau nama tender.                                                                                 |                                      |
| `deskripsi`     | `TEXT`      | Deskripsi singkat tender.                                                                               | Kolom baru.                           |
| `tanggal`       | `TEXT`      | Tanggal saat data tender di-scrape dan dimasukkan ke database.                                          | Format: "DD Mon YYYY" (misal: "19 Apr 2025"). Diatur oleh `insertProcurementData`. |
| `kkks`          | `TEXT`      | Nama Kontraktor Kontrak Kerja Sama (KKKS) yang terkait dengan tender.                                |                                      |
| `golonganUsaha` | `TEXT`      | Golongan usaha yang disyaratkan (misal: Usaha Kecil, Menengah, Besar).                                  | Kolom baru.                           |
| `jenisPengadaan`| `TEXT`      | Jenis pengadaan (misal: Jasa Konsultansi, Barang, Pekerjaan Konstruksi).                                  | Kolom baru.                           |
| `bidangUsaha`   | `TEXT`      | Deskripsi bidang usaha atau klasifikasi tender.                                                         |                                      |
| `batasWaktu`    | `TEXT`      | Tanggal batas waktu (deadline) tender.                                                                    | Format: "DD Mon YYYY". Diambil dari sumber. |
| `url`           | `TEXT`      | ID tender yang digunakan sebagai referensi unik.                                                          | Diisi dengan `id` atau `fileId` dari sumber. |
| `createdAt`     | `DATETIME`  | Timestamp otomatis saat baris data pertama kali dimasukkan ke database.                                 | `DEFAULT CURRENT_TIMESTAMP`          |
| `tipe_tender`   | `TEXT`      | Jenis tender, diisi dengan **'Prakualifikasi'** atau **'Pelelangan Umum'**.                              | Diatur oleh `insertProcurementData`. |

### Logika Penyimpanan Data

*   Data dimasukkan ke tabel ini menggunakan fungsi `insertProcurementData` dari `src/utils/database.js`, yang juga menangani penyimpanan ke tabel `attachments` dalam satu transaksi.
*   Fungsi ini menggunakan perintah SQL `INSERT OR IGNORE INTO procurement_list ...`.
*   **`INSERT OR IGNORE`**: Artinya, jika sebuah baris data baru memiliki `id` yang sama dengan baris yang sudah ada di tabel, baris baru tersebut akan **diabaikan** dan tidak dimasukkan. Data lama **tidak akan diperbarui**.
*   Kolom `tanggal` diisi dengan tanggal saat scraping dilakukan.
*   Kolom `tipe_tender` diisi secara otomatis ('Prakualifikasi' atau 'Pelelangan Umum') tergantung pada scraper mana yang memanggil fungsi.
*   Sebelum memasukkan data baru, fungsi ini akan menghapus semua entri yang terkait dengan `tender_id` yang sama dari tabel `attachments` untuk memastikan data attachment selalu terbaru.

## 4. Tabel Attachment: `attachments`

Tabel ini menyimpan informasi detail mengenai setiap file attachment yang terkait dengan sebuah tender. Satu tender bisa memiliki banyak attachment.

### Skema Tabel

| Nama Kolom        | Tipe Data | Deskripsi                                                                  | Keterangan Tambahan                                       |
| :---------------- | :-------- | :------------------------------------------------------------------------- | :-------------------------------------------------------- |
| `id`              | `INTEGER` | Identifier unik untuk setiap baris attachment. **PRIMARY KEY AUTOINCREMENT**. | Internal database.                                        |
| `tender_id`       | `TEXT`    | ID tender dari tabel `procurement_list` yang menjadi induk attachment ini. | Foreign Key ke `procurement_list(id)` ON DELETE CASCADE. |
| `attachment_id`   | `TEXT`    | ID unik file attachment dari sumber (CIVD). Digunakan oleh Playwright.    | Diambil dari `data-file-id` pada link download.           |
| `attachment_name` | `TEXT`    | Nama file attachment seperti yang tertera di sumber.                       |                                                           |
| `attachment_url`  | `TEXT`    | URL (relatif atau absolut) untuk mengunduh attachment dari sumber.        |                                                           |

### Logika Penyimpanan Data

*   Data dimasukkan ke tabel ini sebagai bagian dari pemanggilan `insertProcurementData` setelah data tender utama berhasil dimasukkan (atau diabaikan) ke `procurement_list`.
*   Untuk setiap tender baru yang diproses, `insertProcurementData` akan:
    1.  Menghapus semua baris di tabel `attachments` yang memiliki `tender_id` sama dengan `id` tender yang sedang diproses.
    2.  Memasukkan baris baru untuk **setiap** item dalam array `allAttachments` yang ada pada objek data tender.

## 5. Utilitas Terkait (`src/utils/database.js`)

*   **`getDb()`**: Fungsi untuk mendapatkan instance koneksi database (membuat koneksi baru jika belum ada).
*   **`initializeDb()`**: Membuat tabel `procurement_list` (dengan kolom-kolom terbaru) dan tabel `attachments` jika belum ada. Menangani migrasi kolom dasar.
*   **`insertProcurementData(data, tenderType)`**: Fungsi utama untuk memasukkan array data tender. Menggunakan transaksi untuk memastikan konsistensi antara tabel `procurement_list` dan `attachments`. Menyimpan data utama ke `procurement_list` (`INSERT OR IGNORE`), menghapus attachment lama, dan memasukkan semua attachment baru dari array `allAttachments` ke tabel `attachments`. Mengisi `tipe_tender` secara otomatis.
*   **`getExistingTenderIds()`**: Fungsi untuk mengambil Set berisi semua `id` tender yang sudah ada di tabel `procurement_list`. Digunakan oleh scraper untuk memfilter data baru.
*   **`closeDb()`**: Fungsi untuk menutup koneksi database (saat ini mungkin belum digunakan secara aktif di alur utama).
