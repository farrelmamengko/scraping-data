const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../../database.db');
let db;

function getDb() {
  if (!db) {
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err.message);
      } else {
        console.log('Connected to the SQLite database.');
        initializeDb();
      }
    });
  }
  return db;
}

function addColumnIfNotExists(dbInstance, tableName, columnName, columnType) {
  dbInstance.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
    if (err) {
      console.error(`Error checking table info for ${tableName}:`, err.message);
      return;
    }
    const columnExists = columns.some(col => col.name === columnName);
    if (!columnExists) {
      dbInstance.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`, (alterErr) => {
        if (alterErr) {
          console.error(`Error adding column ${columnName} to ${tableName}:`, alterErr.message);
        } else {
          console.log(`Column ${columnName} added to ${tableName}.`);
        }
      });
    } else {
      // console.log(`Column ${columnName} already exists in ${tableName}.`);
    }
  });
}

function initializeDb() {
  const dbInstance = getDb();
  const createProcurementTableSql = `
    CREATE TABLE IF NOT EXISTS procurement_list (
      id TEXT PRIMARY KEY,      -- ID dari attachment pertama
      judul TEXT,
      deskripsi TEXT,           -- Kolom baru
      golonganUsaha TEXT,       -- Kolom baru
      jenisPengadaan TEXT,      -- Kolom baru
      tanggal TEXT,             -- Tanggal scraping
      kkks TEXT,
      bidangUsaha TEXT,
      batasWaktu TEXT,
      url TEXT,                 -- Kolom ini mungkin bisa dihapus, isinya id attachment pertama
      attachmentUrl TEXT,       -- Kolom ini mungkin bisa dihapus, isinya url attachment pertama
      attachmentName TEXT,      -- Kolom ini mungkin bisa dihapus, isinya nama attachment pertama
      tipe_tender TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `;
  dbInstance.run(createProcurementTableSql, (err) => {
    if (err) {
      console.error('Error creating procurement_list table:', err.message);
    } else {
      console.log('Table procurement_list checked/created successfully.');
      // Jalankan pengecekan kolom (meskipun sudah didefinisikan di atas, 
      // ini berguna jika tabel sudah ada dari versi sebelumnya)
      addColumnIfNotExists(dbInstance, 'procurement_list', 'tipe_tender', 'TEXT');
      addColumnIfNotExists(dbInstance, 'procurement_list', 'deskripsi', 'TEXT');
      addColumnIfNotExists(dbInstance, 'procurement_list', 'golonganUsaha', 'TEXT');
      addColumnIfNotExists(dbInstance, 'procurement_list', 'jenisPengadaan', 'TEXT');
    }
  });

  // Buat tabel baru untuk attachments
  const createAttachmentsTableSql = `
    CREATE TABLE IF NOT EXISTS attachments (
        attachment_id TEXT PRIMARY KEY, -- ID unik attachment (dari data-file-id)
        tender_id TEXT NOT NULL,        -- Foreign key ke procurement_list.id
        attachment_name TEXT,           -- Nama file attachment
        attachment_url TEXT,            -- URL asli attachment (jika perlu)
        attachment_order INTEGER,       -- Urutan attachment (1, 2, ...)
        FOREIGN KEY (tender_id) REFERENCES procurement_list (id) ON DELETE CASCADE
    );
  `;
  dbInstance.run(createAttachmentsTableSql, (err) => {
     if (err) {
        console.error('Error creating attachments table:', err.message);
     } else {
        console.log('Table attachments checked/created successfully.');
        // Buat index untuk pencarian cepat berdasarkan tender_id
        dbInstance.run('CREATE INDEX IF NOT EXISTS idx_attachments_tender_id ON attachments (tender_id);');
     }
  });

}

async function insertProcurementData(data, tenderType) {
  if (!data || data.length === 0) {
    console.log('No data provided to insert.');
    return;
  }
  if (!tenderType) {
    console.error('Error: Tender type is required for insertion.');
    return;
  }

  const dbInstance = getDb();
  
  // Gunakan Promise untuk mengelola async/await dengan lebih baik dalam transaksi
  return new Promise((resolve, reject) => {
    dbInstance.serialize(() => { // Serialize untuk urutan
      // 1. Siapkan statements
      const stmtProcurement = dbInstance.prepare(`INSERT OR IGNORE INTO procurement_list (
        id, judul, tanggal, kkks, bidangUsaha, batasWaktu, url, attachmentUrl, attachmentName, tipe_tender, 
        deskripsi, golonganUsaha, jenisPengadaan
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`); // 13 kolom
      const stmtDeleteAttachments = dbInstance.prepare(`DELETE FROM attachments WHERE tender_id = ?`);
      const stmtInsertAttachment = dbInstance.prepare(`INSERT INTO attachments (
        attachment_id, tender_id, attachment_name, attachment_url, attachment_order
      ) VALUES (?, ?, ?, ?, ?)`);

      const today = new Date();
      const options = { day: 'numeric', month: 'short', year: 'numeric' };
      const formattedToday = today.toLocaleDateString('en-GB', options).replace(/ /g, ' ');

      let tenderInsertCount = 0;
      let attachmentInsertCount = 0;
      let hasError = false; // Flag untuk melacak error

      // Mulai Transaction
      dbInstance.run('BEGIN TRANSACTION', (beginErr) => {
          if (beginErr) {
              console.error('[DB Begin Tx] Error starting transaction:', beginErr.message);
              reject(beginErr);
              return;
          }

          // Proses setiap item data
          data.forEach(item => {
            if (hasError) return; // Stop jika sudah ada error

            const firstAttachment = item.allAttachments && item.allAttachments.length > 0 ? item.allAttachments[0] : { id: item.id, name: item.attachmentName, url: item.attachmentUrl };
            const tenderId = firstAttachment.id;

            if (!tenderId) {
                console.warn(`[DB Insert] Skipping tender due to missing ID: ${item.judul}`);
                return; 
            }
            const batasWaktuValue = item.batasWaktu || formattedToday;

            // Jalankan INSERT OR IGNORE untuk tender utama
            stmtProcurement.run(
              tenderId,
              item.judul,
              formattedToday,
              item.kkks,
              item.bidangUsaha,
              batasWaktuValue,
              tenderId,             // url (id attch pertama)
              firstAttachment.url,  // attachmentUrl (url attch pertama)
              firstAttachment.name, // attachmentName (nama attch pertama)
              tenderType,
              item.deskripsi || '',
              item.golonganUsaha || '',
              item.jenisPengadaan || ''
            , function(err) { 
                if (err) {
                    console.error('[DB Insert] Error inserting/ignoring tender:', tenderId, err.message);
                    hasError = true;
                } else if (this.changes > 0) {
                    tenderInsertCount++;
                }
            });
            if (hasError) return;

            // Hapus attachment lama
            stmtDeleteAttachments.run(tenderId, (err) => {
                if (err) {
                    console.error('[DB Delete Attach] Error deleting old attachments for tender:', tenderId, err.message);
                    hasError = true;
                }
            });
            if (hasError) return;

            // Masukkan semua attachment baru
            if (item.allAttachments && item.allAttachments.length > 0) {
              item.allAttachments.forEach((attachment, index) => {
                if (hasError) return;
                if (attachment.id) {
                  stmtInsertAttachment.run(
                    attachment.id,           // attachment_id
                    tenderId,                // tender_id
                    attachment.name || '',  // attachment_name
                    attachment.url || '',   // attachment_url
                    index + 1                // attachment_order (mulai dari 1)
                  , (err) => {
                      if (err) {
                          console.error('[DB Insert Attach] Error inserting attachment:', attachment.id, 'for tender', tenderId, err.message);
                          hasError = true;
                      } else {
                          attachmentInsertCount++;
                      }
                  });
                } else {
                    console.warn(`[DB Insert Attach] Skipping attachment due to missing ID for tender: ${tenderId}`);
                }
              });
            }
          }); // Akhir data.forEach

          // Finalisasi statements SEBELUM commit/rollback
          stmtProcurement.finalize();
          stmtDeleteAttachments.finalize();
          stmtInsertAttachment.finalize((finalizeErr) => {
              if (finalizeErr) {
                  console.error('[DB Finalize] Error finalizing statements:', finalizeErr.message);
                  hasError = true; // Tandai error jika finalisasi gagal
              }
              
              // Commit atau Rollback berdasarkan flag error
              if (hasError) {
                  console.warn('[DB] Rolling back transaction due to errors.');
                  dbInstance.run('ROLLBACK', (rollbackErr) => {
                      if (rollbackErr) {
                          console.error('[DB Rollback] Error rolling back transaction:', rollbackErr.message);
                      } else {
                          console.log('[DB] Transaction rolled back.');
                      }
                      reject(new Error('Database operation failed and transaction rolled back.')); // Reject promise
                  });
              } else {
                  dbInstance.run('COMMIT', (commitErr) => {
                       if (commitErr) {
                           console.error('[DB Commit] Error committing transaction:', commitErr.message);
                           reject(commitErr); // Reject promise on commit error
                       } else {
                           console.log(`[${tenderType}] Transaction committed successfully. New tenders inserted: ${tenderInsertCount}. Total attachments processed: ${attachmentInsertCount}`);
                           resolve(); // Resolve promise on success
                       }
                  });
              }
          });
      }); // Akhir BEGIN TRANSACTION callback
    }); // Akhir db.serialize
  }); // Akhir new Promise
}

/**
 * Mengambil semua ID tender yang sudah ada di database.
 * @returns {Promise<Set<string>>} Promise yang resolve dengan Set berisi ID tender yang ada.
 */
async function getExistingTenderIds() {
  return new Promise((resolve, reject) => {
    const dbInstance = getDb();
    const sql = 'SELECT id FROM procurement_list';
    dbInstance.all(sql, [], (err, rows) => {
      if (err) {
        console.error('Error fetching existing tender IDs:', err.message);
        reject(err);
      } else {
        const idSet = new Set(rows.map(row => row.id));
        console.log(`[DB] Ditemukan ${idSet.size} ID tender yang sudah ada.`);
        resolve(idSet);
      }
    });
  });
}

function closeDb() {
  if (db) {
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err.message);
      } else {
        console.log('Closed the database connection.');
        db = null; // Reset db variable
      }
    });
  }
}

module.exports = {
  getDb,
  initializeDb,
  insertProcurementData,
  closeDb,
  getExistingTenderIds
}; 