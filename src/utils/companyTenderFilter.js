const { Pool } = require('pg');

// Konfigurasi pool koneksi PostgreSQL (asumsi konfigurasi sama dengan database.js)
// Sebaiknya ini di-refactor ke modul konfigurasi terpusat di masa mendatang
const pool = new Pool({
    user: 'postgres',
    host: 'localhost', // Sudah benar untuk eksekusi dari host
    database: 'skk_tender',
    password: 'postgres123', // Sudah sesuai dengan docker-compose.yml
    port: 5434, // Diubah dari 5432 menjadi 5434 sesuai port mapping
});

/**
 * Mengambil dan memfilter tender berdasarkan array keyword.
 * Tender akan cocok jika salah satu keyword ditemukan.
 * Hasilnya akan dicetak ke konsol.
 * @param {string[]} keywords Array kata kunci untuk memfilter tender.
 */
async function getAndPrintFilteredTenders(keywords) {
    if (!keywords || !Array.isArray(keywords) || keywords.length === 0 || keywords.every(k => k.trim() === '')) {
        console.log("Array keywords tidak boleh kosong atau hanya berisi string kosong.");
        return;
    }

    const params = [];
    let keywordConditions = [];
    let paramCounter = 1;

    for (const keyword of keywords) {
        if (keyword && keyword.trim() !== '') {
            const currentKeywordParam = `$${paramCounter}`;
            params.push(`%${keyword.trim()}%`);
            keywordConditions.push(`(
                judul ILIKE ${currentKeywordParam} OR
                deskripsi ILIKE ${currentKeywordParam} OR
                bidangUsaha ILIKE ${currentKeywordParam} OR
                kkks ILIKE ${currentKeywordParam} OR
                golonganUsaha ILIKE ${currentKeywordParam} OR
                jenisPengadaan ILIKE ${currentKeywordParam}
            )`);
            paramCounter++;
        }
    }

    if (keywordConditions.length === 0) {
        console.log("Tidak ada keyword valid yang diberikan setelah pembersihan.");
        return;
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
        } else {
            console.log(`Ditemukan ${rows.length} tender:`);
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
            console.log(JSON.stringify(mappedTenders, null, 2));
        }
    } catch (error) {
        console.error("Error saat mengambil data tender:", error);
    } finally {
        await pool.end(); 
    }
}

module.exports = { getAndPrintFilteredTenders };

// Contoh penggunaan (bisa di-uncomment untuk pengujian langsung)

(async () => {
    // const companyKeywords = [
    //     "JASA NON KONSTRUKSI/Jasa Geologi & Geofisika",
    //     "Jasa Interpretasi G&G",
    //     "Interpretasi Data Geologi Dan Geofisika",
    //     "Interpretasi Data Logging",
    //     "Interpretasi Data Seismik",
    //     "Penilaian Formasi",
    //     "Pemodelan Reservoir (Reservoir Modeling)",
    //     "Simulasi Reservoir (Reservoir Simulation)",
    //     "Jasa Survei G&G",
    //     "Pengolahan Data Seismik (Seismic Data Processing)",
    //     "Survei Geologi",
    //     "Survei Geofisika",
    //     "Survei Geoteknik",
    //     "Mud Logging"
    // ]; // Daftar panjang dikomentari untuk pengujian

    // const companyKeywords = ["Geologi"]; // Dikomentari untuk pengujian baru
    // const companyKeywords = ["Seismik"]; // Dikomentari untuk pengujian baru
    const companyKeywords = ["Seismik", "Formasi"]; // Diubah untuk menguji dengan keyword "Seismik" DAN "Formasi"
    
    await getAndPrintFilteredTenders(companyKeywords);
    
    // Contoh lain dengan keyword lebih sedikit
    // await getAndPrintFilteredTenders(["Survei Geologi", "Mud Logging"]);

    // Contoh dengan array kosong atau keyword tidak valid
    // await getAndPrintFilteredTenders([]);
    // await getAndPrintFilteredTenders([""]);
})(); 