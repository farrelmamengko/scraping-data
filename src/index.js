/**
 * Scraper utama untuk CIVD SKK Migas
 * 
 * Aplikasi ini melakukan scraping data dari situs CIVD SKK Migas untuk:
 * 1. Undangan Prakualifikasi
 * 2. Pelelangan Umum
 * 
 * Pendekatan scraping:
 * - Menggunakan Puppeteer untuk browser automation
 * - Menggunakan deteksi otomatis halaman dan pagination
 * - Memfilter data duplikat secara otomatis
 * - Menyimpan hasil ke file CSV
 * 
 * Keterbatasan yang ditemui:
 * - Situs menggunakan AJAX untuk navigasi halaman yang memerlukan interaksi pengguna
 * - Sistem pagination tidak bekerja dengan baik untuk otomatisasi
 * - Beberapa halaman mungkin memiliki konten dinamis yang sulit diakses
 * 
 * @author Developer
 * @version 1.0.0
 */

require('dotenv').config();
const { scrapePrakualifikasi } = require('./scrapers/prakualifikasi');
const pelelangan = require('./scrapers/pelelangan');

/**
 * Fungsi utama yang menjalankan proses scraping
 */
async function main() {
  try {
    console.log('Memulai proses scraping...');
    const data = await scrapePrakualifikasi();
    console.log(`Berhasil mengumpulkan ${data.length} data tender`);
    console.log('Data:', data);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Jalankan aplikasi
main(); 