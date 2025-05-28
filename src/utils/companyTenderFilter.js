const { Pool } = require('pg');

// Konfigurasi pool koneksi PostgreSQL menggunakan variabel lingkungan
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'db', // Default ke 'db' untuk Docker
    database: process.env.DB_NAME || 'skk_tender',
    password: process.env.DB_PASSWORD || 'postgres123',
    port: parseInt(process.env.DB_PORT) || 5432, // Default ke 5432 untuk Docker
});

/**
 * Mengambil dan memfilter tender berdasarkan array keyword.
 * Tender akan cocok jika salah satu keyword ditemukan.
 * @param {string[]} keywords Array kata kunci untuk memfilter tender.
 * @returns {Promise<Array<Object>>} Promise yang resolve dengan array data tender yang difilter.
 */
async function getFilteredTendersByKeywords(keywords) { // Nama fungsi diubah
    if (!keywords || !Array.isArray(keywords) || keywords.length === 0 || keywords.every(k => k.trim() === '')) {
        console.log("Array keywords tidak boleh kosong atau hanya berisi string kosong.");
        return []; // Kembalikan array kosong
    }

    const params = [];
    let keywordConditions = [];
    let paramCounter = 1;

    for (const keyword of keywords) {
        if (keyword && keyword.trim() !== '') {
            const currentKeywordParam = `$${paramCounter}`;
            // Escape special regex characters in the keyword and add word boundaries
            const escapedKeyword = keyword.trim().replace(/[.*+?^${}()|[\].\\]/g, '\\$&');
            const regexPattern = `\\y${escapedKeyword}\\y`; 
            params.push(regexPattern);
            keywordConditions.push(`(
                judul ~* ${currentKeywordParam} OR
                deskripsi ~* ${currentKeywordParam} OR
                bidangUsaha ~* ${currentKeywordParam} OR
                kkks ~* ${currentKeywordParam} OR
                golonganUsaha ~* ${currentKeywordParam} OR
                jenisPengadaan ~* ${currentKeywordParam}
            )`);
            paramCounter++;
        }
    }

    if (keywordConditions.length === 0) {
        console.log("Tidak ada keyword valid yang diberikan setelah pembersihan.");
        return []; // Kembalikan array kosong
    }

    const whereString = `WHERE ${keywordConditions.join(' OR ')}`;

    const query = `
        SELECT 
            p.id,
            p.judul,
            p.deskripsi,
            p.tanggal,
            p.kkks,
            p.golonganUsaha,
            p.jenisPengadaan,
            p.bidangUsaha,
            p.batasWaktu,
            p.url,
            p.tipe_tender,
            p.createdAt,
            json_agg(json_build_object(
                'id', a.id,
                'attachment_id', a.attachment_id,
                'attachment_name', a.attachment_name,
                'attachment_url', a.attachment_url
            )) FILTER (WHERE a.id IS NOT NULL) as attachments
        FROM procurement_list p
        LEFT JOIN attachments a ON p.id = a.tender_id
        ${whereString}
        GROUP BY p.id
        ORDER BY p.createdAt DESC
    `;
    // Tidak menggunakan LIMIT atau OFFSET untuk saat ini, tampilkan semua yang cocok

    try {
        console.log(`Mencari tender dengan salah satu keyword: "${keywords.join(', ')}"...`);
        const { rows } = await pool.query(query, params);

        if (rows.length === 0) {
            console.log("Tidak ada tender yang cocok dengan keyword tersebut.");
            return []; // Kembalikan array kosong
        } else {
            console.log(`Ditemukan ${rows.length} tender.`); // Log jumlah saja
            const mappedTenders = rows.map(row => ({
                id: row.id,
                judul: row.judul,
                deskripsi: row.deskripsi,
                tanggal: row.tanggal,
                kkks: row.kkks,
                golonganUsaha: row.golonganusaha,
                jenisPengadaan: row.jenispengadaan,
                bidangUsaha: row.bidangusaha,
                batasWaktu: row.bataswaktu,
                url: row.url,
                tipeTender: row.tipe_tender,
                createdAt: row.createdat,
                attachments: row.attachments || []
            }));
            return mappedTenders; // Kembalikan data yang sudah di-map
        }
    } catch (error) {
        console.error("Error saat mengambil data tender:", error);
        return []; // Kembalikan array kosong jika ada error
    } 
    // Hapus finally block dan pool.end()
}

module.exports = { getFilteredTendersByKeywords }; // Ekspor fungsi baru

// Hapus contoh penggunaan langsung (IIFE)
// (async () => {
// ...
// })(); 