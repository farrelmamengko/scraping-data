require('dotenv').config();
const { scrapePrakualifikasi } = require('./scrapers/prakualifikasi');
const { scrapePelelangan } = require('./scrapers/pelelangan');
const { exportToCsv } = require('./utils/csvExporter');

async function main() {
  try {
    console.log('Memulai scraping data CIVD SKK Migas...');
    
    // Scrape data Undangan Prakualifikasi
    console.log('Mengambil data Undangan Prakualifikasi...');
    const prakualifikasiData = await scrapePrakualifikasi();
    console.log(`Berhasil mengambil ${prakualifikasiData.length} data Undangan Prakualifikasi`);
    
    // Scrape data Pelelangan Umum
    console.log('Mengambil data Pelelangan Umum...');
    const pelelanganData = await scrapePelelangan();
    console.log(`Berhasil mengambil ${pelelanganData.length} data Pelelangan Umum`);
    
    // Definisikan header untuk CSV
    const csvHeaders = [
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
    
    // Ekspor data ke CSV
    console.log('Menyimpan data ke file CSV...');
    
    // Simpan data Undangan Prakualifikasi
    if (prakualifikasiData.length > 0) {
      const prakualifikasiCsvPath = await exportToCsv(
        prakualifikasiData,
        'undangan_prakualifikasi',
        csvHeaders
      );
      console.log(`Data Undangan Prakualifikasi berhasil disimpan ke ${prakualifikasiCsvPath}`);
    } else {
      console.log('Tidak ada data Undangan Prakualifikasi untuk disimpan');
    }
    
    // Simpan data Pelelangan Umum
    if (pelelanganData.length > 0) {
      const pelelanganCsvPath = await exportToCsv(
        pelelanganData,
        'pelelangan_umum',
        csvHeaders
      );
      console.log(`Data Pelelangan Umum berhasil disimpan ke ${pelelanganCsvPath}`);
    } else {
      console.log('Tidak ada data Pelelangan Umum untuk disimpan');
    }
    
    // Tampilkan hasil
    console.log('Data Undangan Prakualifikasi:');
    console.log(JSON.stringify(prakualifikasiData, null, 2));
    
    console.log('Data Pelelangan Umum:');
    console.log(JSON.stringify(pelelanganData, null, 2));
    
  } catch (error) {
    console.error('Terjadi kesalahan:', error.message);
  }
}

main(); 