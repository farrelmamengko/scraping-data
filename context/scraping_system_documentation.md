# Dokumentasi Sistem Scraping CIVD SKK Migas

## Daftar Isi
1. [Pendahuluan](#pendahuluan)
2. [Arsitektur Sistem](#arsitektur-sistem)
3. [Komponen Utama](#komponen-utama)
4. [Alur Kerja Scraping](#alur-kerja-scraping)
5. [Strategi Navigasi Halaman](#strategi-navigasi-halaman)
6. [Penanganan Data Duplikat](#penanganan-data-duplikat)
7. [Output dan Format Data](#output-dan-format-data)
8. [Keterbatasan dan Solusi](#keterbatasan-dan-solusi)
9. [Pengembangan Lebih Lanjut](#pengembangan-lebih-lanjut)

## Pendahuluan

Sistem scraping CIVD SKK Migas dikembangkan untuk mengotomatisasi pengambilan data tender dari situs web CIVD SKK Migas. Sistem ini memiliki kapabilitas untuk mengekstrak informasi dari dua jenis tender utama:

1. **Undangan Prakualifikasi** - tender yang masih dalam tahap prakualifikasi
2. **Pelelangan Umum** - tender yang sudah masuk tahap pelelangan

Sistem ini menggunakan pendekatan otomatisasi browser dengan Puppeteer untuk mengakses dan mengekstrak data dari situs yang menggunakan AJAX dan JavaScript dinamis.

## Arsitektur Sistem

Sistem scraping ini dibangun dengan arsitektur modular, yang terdiri dari beberapa komponen utama:

```
├── src/
│   ├── index.js                  # Entry point aplikasi
│   ├── config/                   # Konfigurasi dan konstanta
│   ├── scrapers/                 # Implementasi scraper spesifik
│   │   ├── prakualifikasi.js     # Scraper untuk Undangan Prakualifikasi
│   │   └── pelelangan.js         # Scraper untuk Pelelangan Umum
│   └── utils/                    # Utilitas pendukung
│       └── csvExporter.js        # Fungsi ekspor data ke CSV
└── output/                       # Folder output hasil scraping
    ├── undangan_prakualifikasi_*.csv
    └── pelelangan_umum_*.csv
```

## Komponen Utama

### 1. Modul Scraper (scrapers/)

Implementasi inti dari logika scraping yang terdiri dari:

- **prakualifikasi.js**: Modul untuk mengekstrak data Undangan Prakualifikasi dari bagian #invitation
- **pelelangan.js**: Modul untuk mengekstrak data Pelelangan Umum dari bagian #bid

Kedua modul ini mengimplementasikan strategi scraping yang sama dengan penyesuaian untuk masing-masing jenis tender.

### 2. Utilitas (utils/)

- **csvExporter.js**: Modul untuk mengkonversi data hasil scraping ke format CSV dengan timestamp

### 3. Entry Point (index.js)

Menjalankan proses scraping secara keseluruhan dengan urutan:
1. Mengekstrak data Undangan Prakualifikasi
2. Mengekstrak data Pelelangan Umum
3. Menyimpan data ke file CSV

## Alur Kerja Scraping

Proses scraping mengikuti alur kerja berikut:

1. **Inisialisasi Browser**
   - Menjalankan instance browser Puppeteer (headless/non-headless)
   - Mengatur user agent dan viewport

2. **Navigasi ke URL Target**
   - Mengakses halaman utama CIVD SKK Migas
   - Menunggu konten sepenuhnya dimuat

3. **Deteksi Total Data**
   - Analisis elemen untuk mendeteksi jumlah total data (misalnya "77 Data")
   - Perhitungan jumlah halaman berdasarkan jumlah data per halaman

4. **Ekstraksi Data Halaman Pertama**
   - Scroll ke bagian relevan (#invitation atau #bid)
   - Mengekstrak data tender dari card-card yang ditampilkan
   - Menyimpan data ke array hasil

5. **Navigasi Halaman Berikutnya**
   - Implementasi multi-strategi untuk navigasi halaman
   - Pendekatan direct AJAX URL sebagai metode utama
   - Metode fallback jika navigasi utama gagal

6. **Penanganan Data Duplikat**
   - Memfilter tender duplikat berdasarkan judul dan ID
   - Menyimpan hanya data tender unik dengan informasi lengkap

7. **Penanganan Error dan Retry**
   - Implementasi mekanisme retry untuk penanganan kesalahan
   - Batas percobaan ulang untuk mencegah loop tak terbatas

8. **Ekspor Hasil**
   - Menyimpan data ke file CSV dengan format dan header yang ditentukan
   - Menambahkan timestamp ke nama file untuk melacak waktu ekstraksi

## Strategi Navigasi Halaman

Sistem mengimplementasikan beberapa strategi untuk navigasi halaman, dengan prioritas sebagai berikut:

### 1. Direct AJAX URL (Metode Utama)

```javascript
const ajaxUrl = `https://civd.skkmigas.go.id/ajax/search/tnd.jwebs?type=1&keyword=&d-1789-p=${pageNum}`;
await page.goto(ajaxUrl);
```

Mengakses langsung URL AJAX dengan format parameter `d-1789-p=X` yang mengontrol paginasi. Metode ini paling efektif untuk navigasi konsisten.

### 2. Klik Tombol Langsung

```javascript
// Coba klik tombol dengan class 'uibutton ajax' berdasarkan title
const titleSelectors = [
  `a.uibutton.ajax[title="Ke Halaman ${pageNum}"]`,
  `a[title="Ke Halaman ${pageNum}"]`,
  `a[title="Page ${pageNum}"]`,
];

for (const selector of titleSelectors) {
  const button = document.querySelector(selector);
  if (button) {
    button.click();
    return true;
  }
}
```

Mencoba klik langsung pada tombol pagination menggunakan selector CSS berbasis title atau teks tombol.

### 3. Evaluasi JavaScript

```javascript
await page.evaluate((pageNum) => {
  // Mencari tombol halaman berdasarkan teks konten
  const pageLinks = [...document.querySelectorAll('.pagination a, .page-link')];
  const targetLink = pageLinks.find(link => link.textContent.trim() === String(pageNum));
  
  if (targetLink) {
    targetLink.click();
    return true;
  }
  return false;
});
```

Menggunakan JavaScript di browser untuk menemukan dan mengklik tombol halaman berdasarkan teks konten.

### 4. Pendekatan Multi-URL

```javascript
const possibleUrls = [
  `${baseUrl}?page=${pageNum}#invitation`,
  `${baseUrl}?hal=${pageNum}#invitation`,
  `${baseUrl}?p=${pageNum}#invitation`,
  `${baseUrl}search/tnd.jwebs?d-1789-p=${pageNum}`,
  `${baseUrl}ajax/search/tnd.jwebs?type=1&keyword=&d-1789-p=${pageNum}`
];

for (const url of possibleUrls) {
  // coba navigasi ke URL
}
```

Mencoba berbagai format URL untuk menangani berbagai kemungkinan parameter yang digunakan oleh situs.

### 5. Fetch API Fallback

```javascript
// Mencoba fetch API sebagai fallback
const fetchResult = await page.evaluate(async () => {
  try {
    // Coba berbagai kemungkinan endpoint
    const endpoints = [
      '/ajax/search/tnd.jwebs?type=1&keyword=&d-1789-e=1', // e=1 biasanya untuk export all
      '/search/tnd.jwebs?d-1789-e=1&type=1',
      '/ajax/search/tnd.jwebs?type=1&d-1789-o=1&d-1789-p=1&d-1789-s=100' // s=100 untuk 100 item per halaman
    ];
    
    for (const endpoint of endpoints) {
      const response = await fetch(endpoint);
      if (response.ok) {
        const text = await response.text();
        // Proses dan ekstrak data dari response
        return { success: true, data: text };
      }
    }
  } catch (error) {
    return { success: false, error: error.toString() };
  }
});
```

Mencoba fetch API langsung untuk mendapatkan semua data sekaligus jika strategi navigasi halaman gagal.

## Penanganan Data Duplikat

Sistem mengimplementasikan mekanisme deteksi duplikat yang ditingkatkan:

```javascript
// Object untuk melacak tender yang sudah dikumpulkan, dengan struktur ID/judul sebagai key
const processedTenders = {};

// Filter tender yang belum diproses atau yang memiliki informasi lebih lengkap
const newTenders = pageData.filter(tender => {
  const id = tender.id || '';
  const title = tender.judul || '';
  const key = id || title;
  
  // Jika tender belum ada, tambahkan
  if (!processedTenders[key]) {
    processedTenders[key] = tender;
    return true;
  }
  
  // Jika tender sudah ada tapi data baru lebih lengkap, update dan skip
  const existingTender = processedTenders[key];
  if (isTenderMoreComplete(tender, existingTender)) {
    processedTenders[key] = tender;
    return false; // Skip karena kita sudah update yang ada
  }
  
  return false; // Skip karena sudah ada dan tidak lebih lengkap
});

// Fungsi untuk memeriksa kelengkapan data tender
function isTenderMoreComplete(newTender, existingTender) {
  // Hitung jumlah field yang terisi (tidak null, undefined, atau string kosong)
  const countFilledFields = (tender) => {
    return Object.values(tender).filter(val => val !== null && val !== undefined && val !== '').length;
  };
  
  return countFilledFields(newTender) > countFilledFields(existingTender);
}
```

Dengan pendekatan ini, sistem tidak hanya menghindari duplikasi tetapi juga memastikan data yang disimpan adalah yang paling lengkap.

## Output dan Format Data

Sistem menghasilkan file CSV dengan format nama:
- `undangan_prakualifikasi_YYYYMMDD_HHMMSS.csv`
- `pelelangan_umum_YYYYMMDD_HHMMSS.csv`

Format data yang diekstrak untuk setiap tender:

| Field | Deskripsi |
|-------|-----------|
| ID | Identifier tender (biasanya kosong) |
| Tanggal | Tanggal publikasi tender |
| Judul | Judul tender |
| KKKS | Kontraktor Kontrak Kerja Sama yang mempublikasikan tender |
| Bidang Usaha | Bidang usaha yang relevan dengan tender |
| Batas Waktu | Deadline tender |
| URL | URL internal tender (ID) |
| Attachment URL | URL attachment tender |
| Attachment Name | Nama file attachment tender |

## Keterbatasan dan Solusi

### 1. Sistem AJAX Kompleks

**Keterbatasan**: Situs menggunakan sistem AJAX yang kompleks untuk navigasi pagination yang memerlukan interaksi pengguna.

**Solusi**: Implementasi direct AJAX URL (`d-1789-p=X`) yang merupakan parameter paginasi internal. Pendekatan ini lebih stabil daripada klik UI.

### 2. State Management

**Keterbatasan**: State halaman aktif tidak selalu diperbarui saat menggunakan navigasi URL langsung.

**Solusi**: Implementasi verifikasi konten setelah navigasi dan sistem multi-strategi sebagai fallback.

### 3. Struktur Data Bervariasi

**Keterbatasan**: Data tender memiliki format berbeda di berbagai bagian halaman dan antar halaman.

**Solusi**: Implementasi algoritma ekstraksi multi-strategi yang mencoba berbagai selector dan struktur data.

### 4. Rendering JavaScript

**Keterbatasan**: Beberapa bagian situs menggunakan rendering JavaScript yang kompleks.

**Solusi**: Menggunakan Puppeteer dengan wait time yang cukup dan deteksi aktif konten yang sudah dimuat.

### 5. Rate Limiting dan Deteksi Bot

**Keterbatasan**: Situs mungkin menerapkan rate limiting atau deteksi bot untuk mencegah scraping.

**Solusi**: Implementasi delay antar request dan rotasi user agent untuk mencegah deteksi.

## Pengembangan Lebih Lanjut

Untuk pengembangan lebih lanjut, beberapa pendekatan yang bisa diterapkan:

### 1. Optimasi Performa dengan Concurrent Scraping

Implementasi scraping konkuren dengan menggunakan multiple browser instance atau tab untuk mengakses beberapa halaman secara bersamaan, meningkatkan kecepatan ekstraksi data.

### 2. API Reverse Engineering Penuh

Analisis mendalam terhadap request network untuk mengidentifikasi semua endpoint API langsung yang tersedia. Ini dapat memberikan akses yang lebih efisien ke data.

### 3. Sistem Caching dan Differential Update

Implementasi sistem caching untuk menyimpan hasil sebelumnya dan hanya mengupdate data baru. Ini mengurangi beban pada situs dan meningkatkan efisiensi.

### 4. Integrasi Database

Menyimpan data hasil scraping ke database untuk analisis dan kueri yang lebih kompleks, dibandingkan dengan hanya menggunakan file CSV.

### 5. Machine Learning untuk Adaptasi Struktur

Menggunakan machine learning untuk secara otomatis beradaptasi dengan perubahan struktur situs. Model dapat dilatih untuk mengenali pola dan struktur data meskipun tampilan visual berubah.

### 6. Monitoring dan Alerting

Implementasi sistem monitoring untuk mendeteksi perubahan struktur situs dan memberi peringatan saat scraper perlu diperbarui. 