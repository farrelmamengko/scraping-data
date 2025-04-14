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
  const createTableSql = `
    CREATE TABLE IF NOT EXISTS procurement_list (
      id TEXT PRIMARY KEY,
      judul TEXT,
      tanggal TEXT,
      kkks TEXT,
      bidangUsaha TEXT,
      batasWaktu TEXT,
      url TEXT,
      attachmentUrl TEXT,
      attachmentName TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `;
  dbInstance.run(createTableSql, (err) => {
    if (err) {
      console.error('Error creating table:', err.message);
    } else {
      console.log('Table procurement_list checked/created successfully.');
      addColumnIfNotExists(dbInstance, 'procurement_list', 'tipe_tender', 'TEXT');
    }
  });
}

function insertProcurementData(data, tenderType) {
  if (!data || data.length === 0) {
    console.log('No data provided to insert.');
    return;
  }
  if (!tenderType) {
    console.error('Error: Tender type is required for insertion.');
    return;
  }

  const dbInstance = getDb();
  const placeholders = data.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
  const sql = `INSERT OR IGNORE INTO procurement_list (id, judul, tanggal, kkks, bidangUsaha, batasWaktu, url, attachmentUrl, attachmentName, tipe_tender) VALUES ${placeholders}`;

  const values = [];
  data.forEach(item => {
    values.push(
      item.id,
      item.judul,
      item.tanggal,
      item.kkks,
      item.bidangUsaha,
      item.batasWaktu,
      item.url,
      item.attachmentUrl,
      item.attachmentName,
      tenderType
    );
  });

  dbInstance.run(sql, values, function(err) {
    if (err) {
      return console.error('Error inserting data:', err.message);
    }
    console.log(`[${tenderType}] Successfully inserted/ignored ${data.length} rows. Rows affected: ${this.changes}`);
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
  closeDb
}; 