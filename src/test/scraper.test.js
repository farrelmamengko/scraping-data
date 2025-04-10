require('dotenv').config();
const { scrapePrakualifikasi } = require('../scrapers/prakualifikasi');
const { scrapePelelangan } = require('../scrapers/pelelangan');
const { exportToCsv } = require('../utils/csvExporter');
const fs = require('fs');
const path = require('path');

/**
 * Fungsi utama untuk menjalankan pengujian
 */
async function runTests() {
  console.log('====== MEMULAI PENGUJIAN SCRAPER ======');
  
  try {
    // Uji scraper Undangan Prakualifikasi
    console.log('\n== Pengujian Scraper Undangan Prakualifikasi ==');
    try {
      const prakualifikasiData = await scrapePrakualifikasi();
      console.log(`✅ Scraper Prakualifikasi berhasil mendapatkan ${prakualifikasiData.length} data`);
      
      if (prakualifikasiData.length > 0) {
        console.log('Contoh data Prakualifikasi:');
        console.log(JSON.stringify(prakualifikasiData[0], null, 2));
      }
    } catch (error) {
      console.error(`❌ Pengujian Scraper Prakualifikasi gagal: ${error.message}`);
    }
    
    // Uji scraper Pelelangan Umum
    console.log('\n== Pengujian Scraper Pelelangan Umum ==');
    try {
      const pelelanganData = await scrapePelelangan();
      console.log(`✅ Scraper Pelelangan berhasil mendapatkan ${pelelanganData.length} data`);
      
      if (pelelanganData.length > 0) {
        console.log('Contoh data Pelelangan:');
        console.log(JSON.stringify(pelelanganData[0], null, 2));
      }
    } catch (error) {
      console.error(`❌ Pengujian Scraper Pelelangan gagal: ${error.message}`);
    }
    
    // Uji ekspor CSV
    console.log('\n== Pengujian Ekspor CSV ==');
    try {
      const testData = [
        {
          id: 'TEST-001',
          tanggal: '2025-04-10',
          judul: 'Test Tender',
          kkks: 'Test KKKS',
          bidangUsaha: 'Test Bidang',
          batasWaktu: '2025-05-10',
          url: 'https://example.com',
          attachmentUrl: '/download/example',
          attachmentName: 'example.pdf'
        }
      ];
      
      const headers = [
        { id: 'id', title: 'ID' },
        { id: 'tanggal', title: 'Tanggal' },
        { id: 'judul', title: 'Judul' },
        { id: 'kkks', title: 'KKKS' },
        { id: 'bidangUsaha', title: 'Bidang Usaha' },
        { id: 'batasWaktu', title: 'Batas Waktu' },
        { id: 'url', title: 'URL' },
        { id: 'attachmentUrl', title: 'Attachment URL' },
        { id: 'attachmentName', title: 'Attachment Name' }
      ];
      
      const csvPath = await exportToCsv(testData, 'test_export', headers);
      
      if (fs.existsSync(csvPath)) {
        console.log(`✅ Ekspor CSV berhasil: ${csvPath}`);
        // Bersihkan file pengujian setelah selesai
        fs.unlinkSync(csvPath);
      } else {
        console.error('❌ Pengujian Ekspor CSV gagal: File tidak ditemukan');
      }
    } catch (error) {
      console.error(`❌ Pengujian Ekspor CSV gagal: ${error.message}`);
    }
    
    console.log('\n====== PENGUJIAN SELESAI ======');
  } catch (error) {
    console.error(`Terjadi kesalahan saat pengujian: ${error.message}`);
  }
}

// Jalankan pengujian jika file ini dijalankan langsung
if (require.main === module) {
  runTests();
}

module.exports = {
  runTests
}; 