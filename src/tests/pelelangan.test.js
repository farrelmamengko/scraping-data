const { scrapePelelangan } = require('../scrapers/pelelangan'); // Sesuaikan path jika perlu
const fs = require('fs');
const path = require('path');
const { insertProcurementData, closeDb, getDb } = require('../utils/database');

// Fungsi untuk mengonversi data JSON ke CSV (sama seperti di procurementList.test.js)
function convertToCsv(data) {
  if (!data || data.length === 0) {
    return '';
  }
  const headers = Object.keys(data[0]);
  const csvRows = [];
  csvRows.push(headers.join(','));
  for (const row of data) {
    const values = headers.map(header => {
      const value = row[header] === undefined || row[header] === null ? '' : row[header];
      const escaped = ('' + value).replace(/"/g, '\"');
      return `"${escaped}"`;
    });
    csvRows.push(values.join(','));
  }
  return csvRows.join('\n');
}

async function testPelelangan() {
  let data = [];
  try {
    getDb(); // Inisialisasi DB

    console.log('Memulai test scraping pelelangan umum...');
    data = await scrapePelelangan(); // Panggil fungsi scrapePelelangan
    console.log('Data pelelangan yang berhasil diambil:', data.length, ' item');

    if (data && data.length > 0) {
      // Simpan ke CSV (Opsional, bisa dihapus jika tidak perlu file CSV terpisah)
      const csvData = convertToCsv(data);
      const outputDir = path.join(__dirname, '../../output');
      const filePath = path.join(outputDir, 'pelelanganUmum.csv'); // Nama file CSV berbeda

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      fs.writeFileSync(filePath, csvData);
      console.log(`Data pelelangan berhasil disimpan ke ${filePath}`);

      // Masukkan data ke database SQLite dengan tipe 'Pelelangan Umum'
      insertProcurementData(data, 'Pelelangan Umum');

    } else {
      console.log('Tidak ada data pelelangan untuk disimpan.');
    }

  } catch (error) {
    console.error('Error saat test pelelangan:', error);
  } finally {
    // Tutup koneksi setelah beberapa saat
    setTimeout(closeDb, 1500);
  }
}

testPelelangan(); 