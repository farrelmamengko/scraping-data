const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const path = require('path');

// Konfigurasi PostgreSQL
const pool = new Pool({
    user: 'postgres',
    host: 'db',
    database: 'skk_tender',
    password: 'postgres123',
    port: 5432,
});

// Buka database SQLite
const db = new sqlite3.Database(path.join(__dirname, '../../database.db'));

async function migrateData() {
    try {
        // 1. Migrasi data procurement_list
        console.log('Memulai migrasi procurement_list...');
        const tenders = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM procurement_list', [], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });

        for (const tender of tenders) {
            await pool.query(
                `INSERT INTO procurement_list (
                    id, judul, deskripsi, tanggal, kkks, golonganUsaha, 
                    jenisPengadaan, bidangUsaha, batasWaktu, url, tipe_tender
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                ON CONFLICT (id) DO NOTHING`,
                [
                    tender.id, tender.judul, tender.deskripsi, tender.tanggal,
                    tender.kkks, tender.golonganUsaha, tender.jenisPengadaan,
                    tender.bidangUsaha, tender.batasWaktu, tender.url, tender.tipe_tender
                ]
            );
        }
        console.log(`${tenders.length} tender berhasil dimigrasi`);

        // 2. Migrasi data attachments
        console.log('Memulai migrasi attachments...');
        const attachments = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM attachments', [], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });

        for (const attachment of attachments) {
            await pool.query(
                `INSERT INTO attachments (
                    tender_id, attachment_id, attachment_name, attachment_url
                ) VALUES ($1, $2, $3, $4)`,
                [
                    attachment.tender_id, attachment.attachment_id,
                    attachment.attachment_name, attachment.attachment_url
                ]
            );
        }
        console.log(`${attachments.length} attachment berhasil dimigrasi`);

        console.log('Migrasi selesai!');
    } catch (error) {
        console.error('Error selama migrasi:', error);
    } finally {
        // Tutup koneksi
        db.close();
        await pool.end();
    }
}

// Jalankan migrasi
migrateData(); 