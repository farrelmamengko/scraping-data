const fs = require('fs');
const path = require('path');

/**
 * Menghapus duplikat dari array data tender
 * @param {Array} data Array data tender
 * @returns {Array} Array data tender tanpa duplikat
 */
function removeDuplicates(data) {
  const uniqueTenders = {};
  
  data.forEach(tender => {
    const key = tender.judul?.trim() || '';
    if (key && (!uniqueTenders[key] || Object.values(tender).filter(Boolean).length > Object.values(uniqueTenders[key]).filter(Boolean).length)) {
      uniqueTenders[key] = tender;
    }
  });
  
  return Object.values(uniqueTenders);
}

/**
 * Menyimpan data ke file JSON untuk debugging
 * @param {Array} data Data yang akan disimpan
 * @param {string} filename Nama file tanpa ekstensi
 */
function saveJsonDebug(data, filename) {
  const debugDir = path.join(__dirname, '..', 'debug');
  if (!fs.existsSync(debugDir)) {
    fs.mkdirSync(debugDir, { recursive: true });
  }
  
  const filePath = path.join(debugDir, `${filename}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`Data debug disimpan ke ${filePath}`);
}

module.exports = {
  removeDuplicates,
  saveJsonDebug
}; 