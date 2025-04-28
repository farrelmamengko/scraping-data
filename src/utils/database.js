const { Pool } = require('pg');

// Konfigurasi pool koneksi PostgreSQL
const pool = new Pool({
    user: 'postgres',
    host: 'db',
    database: 'skk_tender',
    password: 'postgres123',
    
    port: 5432,
});

// Inisialisasi database dan tabel
async function initializeDb() {
    try {
        // Baca file SQL migrasi
        const fs = require('fs');
        const path = require('path');
        const initSQL = fs.readFileSync(path.join(__dirname, '../../migrations/init.sql'), 'utf8');
        
        // Jalankan migrasi
        await pool.query(initSQL);
        console.log('Database berhasil diinisialisasi');
    } catch (error) {
        console.error('Error saat inisialisasi database:', error);
        throw error;
    }
}

// Fungsi untuk mendapatkan koneksi database
async function getDb() {
    return pool;
}

// Fungsi untuk menutup koneksi database
async function closeDb() {
    await pool.end();
    }

// Fungsi untuk mengambil ID tender yang sudah ada
async function getExistingTenderIds() {
    const result = await pool.query('SELECT id FROM procurement_list');
    return new Set(result.rows.map(row => row.id));
}

// Fungsi untuk menyimpan data tender dan attachment
async function insertProcurementData(data, tenderType) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        for (const tender of data) {
            // Insert data tender
            await client.query(
                `INSERT INTO procurement_list (
                    id, judul, deskripsi, tanggal, kkks, golonganUsaha,
                    jenisPengadaan, bidangUsaha, batasWaktu, url, tipe_tender
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                ON CONFLICT (id) DO NOTHING`,
                [
                    tender.id, tender.judul, tender.deskripsi, tender.tanggal,
                    
                    tender.kkks, tender.golonganUsaha, tender.jenisPengadaan,
                    tender.bidangUsaha, tender.batasWaktu, tender.url, tenderType
                ]
            );

            // Hapus attachment lama jika ada
            await client.query('DELETE FROM attachments WHERE tender_id = $1', [tender.id]);

            // Insert attachment baru
            if (tender.allAttachments && tender.allAttachments.length > 0) {
                for (const attachment of tender.allAttachments) {
                    await client.query(
                        `INSERT INTO attachments (
                            tender_id, attachment_id, attachment_name, attachment_url
                        ) VALUES ($1, $2, $3, $4)`,
                        [
                            tender.id, attachment.id,
                            attachment.name, attachment.url
                        ]
                    );
                }
            }
        }

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error saat menyimpan data:', error);
        throw error;
    } finally {
        client.release();
                }
}

// Query helper untuk mendapatkan tender dengan attachment
async function getTendersWithAttachments(options = {}) {
    const {
        page = 1,
        limit = 10,
        type = null,
        keyword = null,
        status = null
    } = options;

    const offset = (page - 1) * limit;
    const params = [];
    let whereClause = [];
    let paramCounter = 1;

    if (type) {
        whereClause.push(`tipe_tender = $${paramCounter}`);
        params.push(type);
        paramCounter++;
    }

    if (keyword) {
        whereClause.push(`(
            judul ILIKE $${paramCounter} OR
            deskripsi ILIKE $${paramCounter} OR
            bidangUsaha ILIKE $${paramCounter} OR
            kkks ILIKE $${paramCounter} OR
            golonganUsaha ILIKE $${paramCounter} OR
            jenisPengadaan ILIKE $${paramCounter}
        )`);
        params.push(`%${keyword}%`);
        paramCounter++;
    }

    if (status === 'active') {
        whereClause.push(`batasWaktu::date >= CURRENT_DATE`);
    } else if (status === 'expired') {
        whereClause.push(`batasWaktu::date < CURRENT_DATE`);
    }

    const whereString = whereClause.length > 0 ? `WHERE ${whereClause.join(' AND ')}` : '';

    const query = `
        SELECT 
            p.*,
            json_agg(json_build_object(
                'id', a.id,
                'attachment_id', a.attachment_id,
                'attachment_name', a.attachment_name,
                'attachment_url', a.attachment_url
            )) as attachments
        FROM procurement_list p
        LEFT JOIN attachments a ON p.id = a.tender_id
        ${whereString}
        GROUP BY p.id
        ORDER BY p.createdAt DESC
        LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
    `;

    params.push(limit, offset);

    const countQuery = `
        SELECT COUNT(DISTINCT p.id) as total
        FROM procurement_list p
        ${whereString}
    `;

    const [results, countResult] = await Promise.all([
        pool.query(query, params),
        pool.query(countQuery, params.slice(0, -2))
    ]);

    // Map rows agar properti sesuai camelCase yang dibutuhkan oleh UI
    const mappedTenders = results.rows.map(row => ({
        ...row,
        batasWaktu: row.bataswaktu,
        bidangUsaha: row.bidangusaha,
        golonganUsaha: row.golonganusaha,
        jenisPengadaan: row.jenispengadaan,
        // Data attachments dari tabel attachments
        dbAttachments: row.attachments || []
    }));
    return {
        tenders: mappedTenders,
        total: parseInt(countResult.rows[0].total),
        totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limit)
    };
}

module.exports = {
    initializeDb,
  getDb,
    closeDb,
    getExistingTenderIds,
  insertProcurementData,
    getTendersWithAttachments
}; 