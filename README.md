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
   SCRAPER_API_KEY=your_scraper_api_key_here
   TARGET_URL=https://civd.skkmigas.go.id/index.jwebs
   ```
   Ganti `your_scraper_api_key_here` dengan API key dari [ScraperAPI](https://www.scraperapi.com/).

## Penggunaan

Jalankan aplikasi dengan perintah:

```
npm start
```

Ini akan mengambil data tender (Undangan Prakualifikasi dan Pelelangan Umum) dari website CIVD SKK Migas dan menampilkannya dalam format JSON dan juga menyimpannya dalam file CSV di direktori `output`.

### Output CSV

Aplikasi akan menghasilkan file CSV di direktori `output` dengan format nama sebagai berikut:
- `undangan_prakualifikasi_YYYYMMDD_HHMMSS.csv` - Untuk data Undangan Prakualifikasi
- `pelelangan_umum_YYYYMMDD_HHMMSS.csv` - Untuk data Pelelangan Umum

## Pengujian

Untuk menjalankan pengujian, gunakan perintah:

```
npm test
```

Ini akan menguji fungsi scraper dan ekspor CSV.

## Catatan Penting

- Aplikasi ini menggunakan ScraperAPI untuk mengatasi pembatasan scraping. Pastikan Anda memiliki API key yang valid dari [ScraperAPI](https://www.scraperapi.com/).
- Scraper telah dikonfigurasi untuk struktur HTML yang ada saat ini di website CIVD SKK Migas.
- Aplikasi ini menggunakan dua metode scraping: 
  1. Axios + Cheerio untuk scraping HTML statis
  2. Puppeteer sebagai fallback untuk menangani konten yang di-render menggunakan JavaScript
- Jika website mengalami perubahan desain, selectors HTML mungkin perlu diperbarui.

## Fitur Utama

- Scraping data Undangan Prakualifikasi dari section `#invitation`
- Scraping data Pelelangan Umum dari section `#bid`
- Ekspor data ke file CSV dengan timestamp
- Otomatis scrolling di halaman untuk memastikan semua konten dimuat
- Navigasi ke section yang relevan di halaman

## Kustomisasi

Jika struktur website berubah, Anda dapat menyesuaikan selectors HTML di file-file berikut:
- `src/scrapers/prakualifikasi.js` - Untuk scraper Undangan Prakualifikasi
- `src/scrapers/pelelangan.js` - Untuk scraper Pelelangan Umum

## License

ISC 