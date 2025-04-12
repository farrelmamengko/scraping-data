# CIVD SKK Migas Scraper

Aplikasi untuk scraping data tender (Undangan Prakualifikasi dan Pelelangan Umum) dari website CIVD SKK Migas.

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