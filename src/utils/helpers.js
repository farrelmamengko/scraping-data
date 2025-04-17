const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');

/**
 * Menghapus duplikat dari array data tender
 * Prioritaskan ID sebagai kunci unik jika ada dan valid.
 * @param {Array} data Array data tender
 * @returns {Array} Array data tender tanpa duplikat
 */
function removeDuplicates(data) {
  const uniqueTenders = {};

  data.forEach(tender => {
    // Gunakan ID jika ada dan valid sebagai kunci utama
    const key = tender.id && typeof tender.id === 'string' && tender.id.trim() !== ''
                ? tender.id.trim()
                : tender.judul?.trim() || ''; // Fallback ke judul jika ID tidak ada/valid

    if (key && (!uniqueTenders[key] || Object.values(tender).filter(Boolean).length > Object.values(uniqueTenders[key]).filter(Boolean).length)) {
      uniqueTenders[key] = tender;
    }
  });

  return Object.values(uniqueTenders);
}

/**
 * Membersihkan nama file agar aman digunakan dalam sistem file.
 * Mengganti karakter tidak valid dengan '-', spasi dengan '_', dan menghapus
 * karakter non-alphanumeric lainnya (kecuali ., _, -).
 * @param {string | null | undefined} filename Nama file asli.
 * @returns {string} Nama file yang sudah disanitasi.
 */
function sanitizeFilename(filename) {
    if (!filename) return `downloaded_file_${Date.now()}.pdf`;

    // Simpan ekstensi asli (misal .pdf)
    const extensionMatch = filename.match(/\.[^.]+$/);
    const extension = extensionMatch ? extensionMatch[0] : '';
    let baseName = extension ? filename.substring(0, filename.length - extension.length) : filename;

    // 1. Ganti karakter tidak valid dengan '-'
    baseName = baseName.replace(/[\\/?:*"<>|]/g, '-');
    // 2. Ganti spasi dengan '_'
    baseName = baseName.replace(/\s+/g, '_');
    // 3. Ganti beberapa titik berurutan dengan satu titik
    baseName = baseName.replace(/\.{2,}/g, '.');
    // 4. Hapus titik atau garis bawah atau tanda hubung di AKHIR basename
    baseName = baseName.replace(/[._-]+$/g, '');
    // 5. Hapus SEMUA karakter lain kecuali huruf, angka, _, ., -
    baseName = baseName.replace(/[^a-zA-Z0-9_.-]/g, '');

    // Pastikan basename tidak kosong setelah sanitasi
    if (!baseName) {
        baseName = `sanitized_file_${Date.now()}`;
    }

    // Gabungkan kembali basename dengan ekstensi
    return baseName + extension;
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
  saveJsonDebug,
  sanitizeFilename
}; 