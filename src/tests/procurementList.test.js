const { scrapeProcurementList } = require('../scrapers/procurementList');
const fs = require('fs');
const path = require('path');

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
      const escaped = ('' + row[header]).replace(/"/g, '\"'); // Escape double quotes
      return `"${escaped}"`; // Enclose in double quotes
    });
    csvRows.push(values.join(','));
  }

  return csvRows.join('\n');
}

async function testProcurementList() {
  try {
    console.log('Memulai test scraping procurement list...');
    const data = await scrapeProcurementList();
    console.log('Data yang berhasil diambil:', data.length, ' item'); // Tampilkan jumlah data

    if (data && data.length > 0) {
      const csvData = convertToCsv(data);
      const outputDir = path.join(__dirname, '../../output'); // Tentukan direktori output
      const filePath = path.join(outputDir, 'procurementList.csv'); // Nama file CSV

      // Pastikan direktori output ada
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Tulis data CSV ke file
      fs.writeFileSync(filePath, csvData);
      console.log(`Data berhasil disimpan ke ${filePath}`);
    } else {
      console.log('Tidak ada data untuk disimpan ke CSV.');
    }

  } catch (error) {
    console.error('Error saat test:', error);
  }
}

testProcurementList(); 