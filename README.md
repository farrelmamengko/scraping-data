# CIVD SKK Migas Scraper

Aplikasi web scraper untuk mengambil data tender dari website CIVD SKK Migas (https://civd.skkmigas.go.id).

## Fitur

- Mengambil data tender dari bagian "Undangan Prakualifikasi" dan "Pelelangan Umum"
- Menampilkan data tender dalam format yang mudah dibaca
- Mengunduh file PDF lampiran tender
- Tombol "Lebih lanjut" untuk melihat file PDF tender
- API endpoint untuk mengakses data tender dalam format JSON
- Penjadwalan otomatis untuk mengambil data terbaru secara berkala

## Persyaratan

- Python 3.8+
- Paket Python yang diperlukan (lihat requirements.txt)

## Instalasi

1. Clone repository ini:
```
git clone https://github.com/yourusername/civd-scraper.git
cd civd-scraper
```

2. Buat virtual environment dan aktifkan:
```
python -m venv venv
source venv/bin/activate  # Linux/Mac
venv\Scripts\activate     # Windows
```

3. Install dependensi:
```
pip install -r requirements.txt
```

## Penggunaan

### Menjalankan Scraper

Untuk menjalankan scraper satu kali dan keluar:
```
python main.py --run-once
```

Untuk menjalankan scraper dengan penjadwalan otomatis (setiap 3 jam):
```
python main.py
```

Untuk mengunduh lampiran tender:
```
python main.py --run-once --download-attachments
```

### Menjalankan Aplikasi Web

Untuk menjalankan aplikasi web:
```
cd web
python run.py
```

Kemudian buka browser dan akses http://localhost:5000

## Struktur Aplikasi

- `main.py`: Script utama untuk menjalankan scraper
- `scraper/`: Modul scraper
  - `civd_scraper.py`: Implementasi scraper
  - `utils.py`: Fungsi utilitas untuk scraper
- `web/`: Aplikasi web
  - `app.py`: Aplikasi Flask
  - `run.py`: Script untuk menjalankan aplikasi web
  - `templates/`: Template HTML
  - `static/`: File statis (CSS, JS, gambar)
- `data/`: Direktori untuk menyimpan data hasil scraping
  - `attachments/`: Direktori untuk menyimpan file lampiran

## Fitur Baru: Akses File PDF

Aplikasi ini sekarang mendukung akses langsung ke file PDF tender. Fitur-fitur baru meliputi:

1. **Tombol "Lebih lanjut"**: Tombol ini sekarang mengarah langsung ke file PDF tender, sehingga pengguna dapat melihat detail tender secara lengkap.

2. **Download PDF**: Tombol tambahan untuk mengunduh file PDF tender.

3. **Perbaikan Download Attachment**: Fungsi download attachment telah diperbaiki untuk menangani berbagai format URL dan memastikan file PDF dapat diakses dengan benar.

## Troubleshooting

### Masalah Akses Website

Jika scraper tidak dapat mengakses website CIVD SKK Migas, pastikan:
- Koneksi internet Anda berfungsi dengan baik
- Website CIVD SKK Migas sedang online
- User-Agent yang digunakan valid (dapat diubah di config/config.ini)

### Masalah Download PDF

Jika file PDF tidak dapat diunduh:
- Pastikan session dengan website telah diinisialisasi dengan benar
- Coba refresh data dengan mengklik tombol "Refresh" di aplikasi web
- Periksa log untuk melihat error yang terjadi

## Lisensi

MIT License 