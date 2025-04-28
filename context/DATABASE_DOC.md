# Dokumentasi Database Sistem Scraping Tender

Dokumen ini menjelaskan struktur dan penggunaan database **PostgreSQL** yang menjadi inti penyimpanan data dalam sistem scraping tender SKK Migas.

## 1. Informasi Umum

*   **Tipe Database**: PostgreSQL
*   **Nama Database**: `skk_tender`
*   **Pengelolaan**: Koneksi dan operasi dasar dikelola oleh skrip `src/utils/database.js`.
*   **Konfigurasi**: Lihat file `docker-compose.yml` atau environment variable untuk detail koneksi.

## 2. Inisialisasi Database

*   Database serta tabel utama (`procurement_list` dan `attachments`) akan dibuat secara otomatis jika belum ada saat server dijalankan.
*   Proses inisialisasi ditangani oleh fungsi `initializeDb` dalam `src/utils/database.js`.
*   Fungsi ini juga memastikan kolom baru ditambahkan ke tabel jika belum ada (untuk kompatibilitas mundur).

## 3. Tabel Utama: `procurement_list`

Tabel ini menyimpan semua data tender yang berhasil di-scrape.

### Skema Tabel

| Nama Kolom      | Tipe Data   | Deskripsi                                                                                                |
| :-------------- | :---------- | :------------------------------------------------------------------------------------------------------- |
| `id`            | `TEXT`      | Identifier unik untuk setiap tender. **PRIMARY KEY**.                                                    |
| `judul`         | `TEXT`      | Judul atau nama tender.                                                                                 |
| `deskripsi`     | `TEXT`      | Deskripsi singkat tender.                                                                               |
| `tanggal`       | `TEXT`      | Tanggal saat data tender di-scrape dan dimasukkan ke database. Format: "DD Mon YYYY".                  |
| `kkks`          | `TEXT`      | Nama Kontraktor Kontrak Kerja Sama (KKKS) yang terkait dengan tender.                                   |
| `golonganUsaha` | `TEXT`      | Golongan usaha yang disyaratkan.                                                                        |
| `jenisPengadaan`| `TEXT`      | Jenis pengadaan.                                                                                        |
| `bidangUsaha`   | `TEXT`      | Deskripsi bidang usaha atau klasifikasi tender.                                                         |
| `batasWaktu`    | `TEXT`      | Tanggal batas waktu (deadline) tender. Format: "DD Mon YYYY".                                          |
| `url`           | `TEXT`      | ID tender yang digunakan sebagai referensi unik.                                                        |
| `createdAt`     | `TIMESTAMP` | Timestamp otomatis saat baris data pertama kali dimasukkan ke database.                                 |
| `tipe_tender`   | `TEXT`      | Jenis tender, diisi dengan **'Prakualifikasi'** atau **'Pelelangan Umum'**.                             |

### Logika Penyimpanan Data

*   Data dimasukkan ke tabel ini menggunakan fungsi `insertProcurementData` dari `src/utils/database.js`, yang juga menangani penyimpanan ke tabel `attachments` dalam satu transaksi.
*   Fungsi ini menggunakan perintah SQL `ON CONFLICT (id) DO NOTHING`.
*   Kolom `tanggal` diisi dengan tanggal saat scraping dilakukan.
*   Kolom `tipe_tender` diisi secara otomatis ('Prakualifikasi' atau 'Pelelangan Umum') tergantung pada scraper mana yang memanggil fungsi.
*   Sebelum memasukkan data baru, fungsi ini akan menghapus semua entri yang terkait dengan `tender_id` yang sama dari tabel `attachments` untuk memastikan data attachment selalu terbaru.

## 4. Tabel Attachment: `attachments`

Tabel ini menyimpan informasi detail mengenai setiap file attachment yang terkait dengan sebuah tender. Satu tender bisa memiliki banyak attachment.

### Skema Tabel

| Nama Kolom        | Tipe Data | Deskripsi                                                                  |
| :---------------- | :-------- | :------------------------------------------------------------------------- |
| `id`              | `SERIAL`  | Identifier unik untuk setiap baris attachment. **PRIMARY KEY**.             |
| `tender_id`       | `TEXT`    | ID tender dari tabel `procurement_list` yang menjadi induk attachment ini. |
| `attachment_id`   | `TEXT`    | ID unik file attachment dari sumber (CIVD).                               |
| `attachment_name` | `TEXT`    | Nama file attachment seperti yang tertera di sumber.                      |
| `attachment_url`  | `TEXT`    | URL (relatif atau absolut) untuk mengunduh attachment dari sumber.         |

### Logika Penyimpanan Data

*   Data dimasukkan ke tabel ini sebagai bagian dari pemanggilan `insertProcurementData` setelah data tender utama berhasil dimasukkan (atau diabaikan) ke `procurement_list`.
*   Untuk setiap tender baru yang diproses, `insertProcurementData` akan:
    1.  Menghapus semua baris di tabel `attachments` yang memiliki `tender_id` sama dengan `id` tender yang sedang diproses.
    2.  Memasukkan baris baru untuk **setiap** item dalam array `allAttachments` yang ada pada objek data tender.

## 5. Utilitas Terkait (`src/utils/database.js`)

*   **`getDb()`**: Fungsi untuk mendapatkan instance koneksi database PostgreSQL.
*   **`initializeDb()`**: Membuat tabel `procurement_list` (dengan kolom-kolom terbaru) dan tabel `attachments` jika belum ada. Menangani migrasi kolom dasar.
*   **`insertProcurementData(data, tenderType)`**: Fungsi utama untuk memasukkan array data tender. Menggunakan transaksi untuk memastikan konsistensi antara tabel `procurement_list` dan `attachments`. Menyimpan data utama ke `procurement_list` (`ON CONFLICT DO NOTHING`), menghapus attachment lama, dan memasukkan semua attachment baru dari array `allAttachments` ke tabel `attachments`. Mengisi `tipe_tender` secara otomatis.
*   **`getExistingTenderIds()`**: Fungsi untuk mengambil Set berisi semua `id` tender yang sudah ada di tabel `procurement_list`. Digunakan oleh scraper untuk memfilter data baru.
*   **`closeDb()`**: Fungsi untuk menutup koneksi database (jika diperlukan).
