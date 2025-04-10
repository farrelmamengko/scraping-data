const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const fs = require('fs');
const path = require('path');

/**
 * Membuat direktori jika belum ada
 * @param {string} directory - Path direktori yang akan dibuat
 */
function ensureDirectoryExists(directory) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

/**
 * Menyimpan data ke file CSV
 * @param {Array} data - Array of objects yang akan disimpan ke CSV
 * @param {string} filename - Nama file CSV (tanpa ekstensi)
 * @param {Array} headers - Array of objects untuk header CSV [{id: 'fieldName', title: 'Field Title'}, ...]
 * @returns {Promise<string>} - Path file CSV yang telah dibuat
 */
async function exportToCsv(data, filename, headers) {
  // Buat direktori output jika belum ada
  const outputDir = path.join(__dirname, '../../output');
  ensureDirectoryExists(outputDir);
  
  // Tentukan path file CSV
  const outputPath = path.join(outputDir, `${filename}_${getFormattedDate()}.csv`);
  
  // Buat CSV writer
  const csvWriter = createCsvWriter({
    path: outputPath,
    header: headers
  });
  
  // Tulis data ke file CSV
  await csvWriter.writeRecords(data);
  
  console.log(`Data berhasil disimpan ke ${outputPath}`);
  
  return outputPath;
}

/**
 * Mendapatkan tanggal dan waktu saat ini dalam format yyyyMMdd_HHmmss
 * @returns {string} - Tanggal dan waktu dalam format yang diformat
 */
function getFormattedDate() {
  const now = new Date();
  
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}

module.exports = {
  exportToCsv
}; 