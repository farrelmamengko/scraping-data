const { scrapeProcurementList } = require('../scrapers/procurementList');
const fs = require('fs');
const path = require('path');
const { insertProcurementData, closeDb, getDb, initializeDb } = require('../utils/database'); // Impor fungsi database

// Fungsi untuk mengonversi data JSON ke CSV
function convertToCsv(data) {
  if (!data || data.length === 0) {
    return '';
  }

  const headers = Object.keys(data[0]);
  const csvRows = [];

  // Tambahkan baris header
  csvRows.push(headers.join(','));

  // Tambahkan baris data
  for (const row of data) {
    const values = headers.map(header => {
      // Pastikan nilai tidak undefined atau null sebelum mengganti quotes
      const value = row[header] === undefined || row[header] === null ? '' : row[header];
      const escaped = ('' + value).replace(/"/g, '\"'); // Escape double quotes
      return `"${escaped}"`; // Enclose in double quotes
    });
    csvRows.push(values.join(','));
  }

  return csvRows.join('\n');
}

async function testProcurementList() {
  let data = []; // Definisikan data di scope yang lebih luas
  try {
    // Inisialisasi DB di awal
    getDb(); // Ini akan memanggil initializeDb jika db belum ada

    console.log('Memulai test scraping procurement list...');
    data = await scrapeProcurementList();
    console.log('Data yang berhasil diambil:', data.length, ' item'); // Tampilkan jumlah data

    if (data && data.length > 0) {
      // Simpan ke CSV
      const csvData = convertToCsv(data);
      const outputDir = path.join(__dirname, '../../output'); // Tentukan direktori output
      const filePath = path.join(outputDir, 'procurementList.csv'); // Nama file CSV

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      fs.writeFileSync(filePath, csvData);
      console.log(`Data berhasil disimpan ke ${filePath}`);

      // Masukkan data ke database SQLite dengan tipe 'Prakualifikasi'
      insertProcurementData(data, 'Prakualifikasi');

    } else {
      console.log('Tidak ada data untuk disimpan.');
    }

  } catch (error) {
    console.error('Error saat test:', error);
  } finally {
    // Selalu tutup koneksi database di akhir
    // Beri sedikit waktu agar operasi insert selesai sebelum menutup
    setTimeout(closeDb, 1500); // Tambah sedikit waktu tunggu
  }
}

testProcurementList(); 