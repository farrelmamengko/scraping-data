const express = require('express');
const path = require('path');
const fs = require('fs'); // Tambahkan fs
const { getDb, closeDb } = require('./src/utils/database'); // Sesuaikan path jika perlu
const { sanitizeFilename } = require('./src/utils/helpers'); // Import sanitizeFilename

const app = express();
const port = 3000;

// --- Fungsi Bantuan Baru untuk Cek Batas Waktu ---
// Mengubah "DD Mon YYYY" menjadi objek Date
function parseBatasWaktu(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split(' ');
    if (parts.length !== 3) return null;
    const day = parseInt(parts[0], 10);
    const monthMap = {
        'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
        'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
    };
    const month = monthMap[parts[1]];
    const year = parseInt(parts[2], 10);
    if (isNaN(day) || month === undefined || isNaN(year)) return null;
    // Set ke awal hari untuk perbandingan yang konsisten
    const date = new Date(year, month, day);
    date.setHours(0, 0, 0, 0);
    return date;
}

// Mengecek apakah tanggal batas waktu sudah lewat
function checkIsExpired(batasWaktuStr) {
    const deadlineDate = parseBatasWaktu(batasWaktuStr);
    if (!deadlineDate) {
        return false; // Jika format tanggal tidak valid, anggap belum expired
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set ke awal hari ini

    return deadlineDate < today; // Jika deadline < hari ini, maka sudah expired
}
// --- Akhir Fungsi Bantuan ---

// --- Fungsi Bantuan Baru untuk Cek Apakah Baru ---
function checkIsNew(createdAtStr) {
    if (!createdAtStr) return false;
    try {
        const createdAtDate = new Date(createdAtStr);
        const now = new Date();
        const timeDifference = now.getTime() - createdAtDate.getTime();
        const hoursDifference = timeDifference / (1000 * 60 * 60);
        return hoursDifference < 24; // Kurang dari 24 jam
    } catch (e) {
        console.error("Error parsing createdAt date:", createdAtStr, e);
        return false; // Jika error parsing, anggap tidak baru
    }
}
// --- Akhir Fungsi Bantuan ---

// --- Direktori PDF Lokal ---
const localPdfDir = path.join(__dirname, 'src', 'download pdf');
console.log("Mengecek direktori PDF lokal:", localPdfDir);
if (!fs.existsSync(localPdfDir)) {
    console.warn("PERINGATAN: Direktori PDF lokal tidak ditemukan. Buat secara manual atau jalankan scraper.");
}
// --------------------------

// Setup EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware (jika diperlukan di masa mendatang)
app.use(express.static(path.join(__dirname, 'public'))); // Untuk file statis seperti CSS/JS eksternal

// --- Route Baru untuk Menyajikan PDF Lokal ---
app.get('/local-pdfs/:filename', (req, res) => {
  const filename = req.params.filename;
  // --- Log Debugging Ditambahkan ---
  console.log(`[PDF Route] Request diterima untuk: ${filename}`);
  console.log(`[PDF Route] Decoded filename: ${decodeURIComponent(filename)}`);
  // --------------------------------

  // Validasi sederhana: hanya izinkan .pdf dan cegah path traversal
  if (!filename.endsWith('.pdf') || filename.includes('..')) {
    return res.status(400).send('Nama file tidak valid.');
  }

  const filePath = path.join(localPdfDir, filename);

  // Cek apakah file ada sebelum mengirim
  fs.access(filePath, fs.constants.R_OK, (err) => {
    if (err) {
      console.error(`[PDF Route] Error akses file PDF: ${filePath}`, err);
      return res.status(404).send('File PDF tidak ditemukan.');
    }
    // --- Log Debugging Ditambahkan ---
    console.log(`[PDF Route] File ditemukan: ${filePath}. Mencoba mengirim...`);
    // --------------------------------
    // Kirim file
    // Set header Content-Type secara eksplisit
    res.setHeader('Content-Type', 'application/pdf');
    res.sendFile(filePath, (errSend) => {
        if(errSend) {
            console.error(`Error mengirim file PDF: ${filePath}`, errSend);
            // Jangan kirim respons lagi jika header sudah terkirim
            if (!res.headersSent) {
                 res.status(500).send('Gagal mengirim file PDF.');
            }
        } else {
            // Tambahkan log sukses
            console.log(`[PDF Route] Berhasil mengirim file PDF: ${filePath}`);
        }
    });
  });
});
// -------------------------------------------

// Route utama untuk menampilkan tender
app.get('/', (req, res) => {
  const db = getDb();
  
  // Parameter pencarian
  const keyword = req.query.keyword || '';
  const type = req.query.type || '';
  const status = req.query.status || '';
  
  // Basis SQL query
  let sql = 'SELECT id, judul, tanggal, batasWaktu, kkks, bidangUsaha, url, attachmentUrl, attachmentName, tipe_tender, createdAt FROM procurement_list';
  const sqlParams = [];
  
  // Menambahkan kondisi WHERE berdasarkan parameter pencarian
  const conditions = [];
  
  if (keyword) {
    conditions.push('(judul LIKE ? OR bidangUsaha LIKE ? OR kkks LIKE ?)');
    const searchPattern = `%${keyword}%`;
    sqlParams.push(searchPattern, searchPattern, searchPattern);
  }
  
  if (type) {
    conditions.push('tipe_tender = ?');
    sqlParams.push(type);
  }
  
  if (status === 'expired' || status === 'active') {
    // Menggunakan fungsi SQLite untuk parsing tanggal
    const today = new Date().toISOString().split('T')[0]; // Format YYYY-MM-DD
    
    if (status === 'expired') {
      conditions.push('date(substr(batasWaktu, 8, 4) || "-" || CASE substr(batasWaktu, 4, 3) WHEN "Jan" THEN "01" WHEN "Feb" THEN "02" WHEN "Mar" THEN "03" WHEN "Apr" THEN "04" WHEN "May" THEN "05" WHEN "Jun" THEN "06" WHEN "Jul" THEN "07" WHEN "Aug" THEN "08" WHEN "Sep" THEN "09" WHEN "Oct" THEN "10" WHEN "Nov" THEN "11" WHEN "Dec" THEN "12" END || "-" || substr(batasWaktu, 1, 2)) < ?');
    } else { // active
      conditions.push('date(substr(batasWaktu, 8, 4) || "-" || CASE substr(batasWaktu, 4, 3) WHEN "Jan" THEN "01" WHEN "Feb" THEN "02" WHEN "Mar" THEN "03" WHEN "Apr" THEN "04" WHEN "May" THEN "05" WHEN "Jun" THEN "06" WHEN "Jul" THEN "07" WHEN "Aug" THEN "08" WHEN "Sep" THEN "09" WHEN "Oct" THEN "10" WHEN "Nov" THEN "11" WHEN "Dec" THEN "12" END || "-" || substr(batasWaktu, 1, 2)) >= ?');
    }
    sqlParams.push(today);
  }
  
  // Gabungkan kondisi jika ada
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  
  // Pengurutan tetap sama
  sql += ' ORDER BY createdAt DESC';

  // Pagination setup
  const currentPage = parseInt(req.query.page || '1', 10);
  const itemsPerPage = 6;
  const startIndex = (currentPage - 1) * itemsPerPage;

  db.all(sql, sqlParams, (err, allRows) => {
    if (err) {
      console.error("Error fetching data:", err.message);
      res.status(500).send("Error mengambil data dari database");
      return;
    }

    // --- Tambahkan flag isExpired dan isNew ---
    const processTenders = (rows) => {
      return rows.map(tender => {
        tender.isExpired = checkIsExpired(tender.batasWaktu);
        tender.isNew = checkIsNew(tender.createdAt);
        if (tender.isNew) {
             console.log(`[Check New] Tender "${tender.judul}" (Created: ${tender.createdAt}) terdeteksi BARU.`);
        } else {
             const createdDate = new Date(tender.createdAt);
             const hoursAgo = (new Date().getTime() - createdDate.getTime()) / (1000 * 60 * 60);
             if (hoursAgo < 48) {
                 console.log(`[Check New] Tender "${tender.judul}" (Created: ${tender.createdAt}, ${hoursAgo.toFixed(1)} jam lalu) TIDAK terdeteksi baru.`);
             }
        }
        return tender;
      });
    };

    // --- Modifikasi Data Tender untuk Menyertakan Path PDF Lokal --- 
    const addLocalPdfPath = (tender) => {
        // Gunakan sanitizeFilename dari helpers
        const pdfFilename = sanitizeFilename(tender.attachmentName);
        
        if (pdfFilename) {
            // --- Logika Pengecekan File Baru ---
            try {
                const filesInDir = fs.readdirSync(localPdfDir);
                const fileExists = filesInDir.includes(pdfFilename);
                console.log(`[PDF Check Dir /] Mengecek file: ${pdfFilename} di ${localPdfDir}. Hasil readdirSync.includes: ${fileExists}`);
                if (fileExists) {
                    const potentialPath = path.join(localPdfDir, pdfFilename);
                    return { ...tender, localPdfPath: `/local-pdfs/${encodeURIComponent(pdfFilename)}` };
                }
            } catch (readdirError) {
                console.error(`[PDF Check Dir /] Error membaca direktori ${localPdfDir}:`, readdirError);
            }
            // ----------------------------------
        }
        // Fallback (jika perlu, tapi kita fokus pada pengecekan utama dulu)
        // const fallbackFilename = `attachment_${tender.id}.pdf`; 
        // const fallbackPath = path.join(localPdfDir, fallbackFilename);
        // if (tender.id && fs.existsSync(fallbackPath)) { ... }
        
        // Jika tidak ditemukan dengan metode baru, kembalikan tender asli
        console.log(`[PDF Check Dir /] File TIDAK DITEMUKAN untuk attachmentName: ${tender.attachmentName} (sanitized: ${pdfFilename})`);
        return tender;
    };

    const allRowsWithPdf = allRows.map(addLocalPdfPath);
    const allRowsProcessed = processTenders(allRowsWithPdf);
    // --- Akhir Modifikasi Data Tender ---

    // Pisahkan data berdasarkan tipe tender (setelah diproses)
    const prakualifikasiTenders = allRowsProcessed.filter(row => row.tipe_tender === 'Prakualifikasi');
    const pelelanganTenders = allRowsProcessed.filter(row => row.tipe_tender === 'Pelelangan Umum');

    // Hitung total halaman untuk masing-masing tipe
    const totalPagesPrak = Math.ceil(prakualifikasiTenders.length / itemsPerPage);
    const totalPagesPel = Math.ceil(pelelanganTenders.length / itemsPerPage);

    // Ambil data untuk halaman saat ini
    const paginatedPrakTenders = prakualifikasiTenders.slice(startIndex, startIndex + itemsPerPage);
    const paginatedPelTenders = pelelanganTenders.slice(startIndex, startIndex + itemsPerPage);

    // Data yang akan dikirim ke view, termasuk parameter pencarian
    const viewData = {
      prakualifikasiTenders: paginatedPrakTenders,
      pelelanganTenders: paginatedPelTenders,
      currentPage: currentPage,
      totalPagesPrak: totalPagesPrak,
      totalPagesPel: totalPagesPel,
      // Parameter pencarian untuk disimpan di form
      keyword: keyword,
      type: type,
      status: status,
      totalResultsPrak: prakualifikasiTenders.length,
      totalResultsPel: pelelanganTenders.length
    };

    // Debug: Log data sebelum render
    console.log(`Pencarian dengan keyword: '${keyword}', type: '${type}', status: '${status}' menghasilkan ${prakualifikasiTenders.length + pelelanganTenders.length} tender`);

    // Render template dengan data yang sudah dipaginasi dan info pagination
    res.render('tenders', viewData);
  });
});

// Route untuk Dashboard
app.get('/dashboard', (req, res) => {
    const db = getDb();
    const sql = 'SELECT id, judul, createdAt, tipe_tender, batasWaktu, attachmentName FROM procurement_list ORDER BY createdAt DESC';

    db.all(sql, [], (err, allRows) => {
        // Log 1: Cek Error Database
        if (err) {
            console.error("!!! Error fetching data for dashboard:", err.message);
            res.status(500).send("Error mengambil data untuk dashboard");
            return;
        }
        // Log 2: Cek Jumlah Data Mentah
        console.log(`>>> Jumlah baris data mentah dari DB: ${allRows ? allRows.length : 'null atau undefined'}`);
        if (!allRows || allRows.length === 0) {
           console.log(">>> Tidak ada data di database untuk diproses.");
           // Tetap lanjutkan untuk merender dashboard kosong
        }

        // Fungsi bantu untuk parsing tanggal "DD Mon YYYY" ke "YYYY-MM-DD"
        function parseDateString(dateStr) {
            if (!dateStr) return null;
            const parts = dateStr.split(' ');
            if (parts.length !== 3) return null;
            const day = parts[0].padStart(2, '0');
            const monthMap = {
                'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06',
                'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
            };
            const month = monthMap[parts[1]];
            const year = parts[2];
            if (!month || !year) return null;
            return `${year}-${month}-${day}`;
        }

        // Buat data event untuk kalender
        const rawCalendarEvents = allRows ? allRows.map(row => {
            const deadlineDate = parseDateString(row.batasWaktu);
            // Log 3: Cek Hasil Parsing Tanggal Per Baris (opsional, bisa sangat banyak)
            // console.log(`   - Parsing '${row.batasWaktu}' -> ${deadlineDate}`); 
            if (!deadlineDate) return null;
            return {
                title: `Deadline: ${row.judul.substring(0, 25)}...`, // Judul dipendekkan sedikit
                start: deadlineDate,
            };
        }) : [];
        
        // Log 4: Cek Event Mentah Sebelum Filter
        console.log(`>>> Event mentah sebelum filter: ${rawCalendarEvents.length} item`);
        
        const calendarEvents = rawCalendarEvents.filter(event => event !== null);
        
        // Log 5: Cek Event Setelah Filter
        console.log(`>>> Event setelah filter (valid): ${calendarEvents.length} item`);

        // --- Modifikasi Data Tender untuk Menyertakan Path PDF Lokal (Gunakan sanitizeFilename) --- 
        const addLocalPdfPath = (tender) => {
            // Gunakan sanitizeFilename dari helpers
            const pdfFilename = sanitizeFilename(tender.attachmentName);
            
            if (pdfFilename) {
                // --- Logika Pengecekan File Baru ---
                 try {
                    const filesInDir = fs.readdirSync(localPdfDir);
                    const fileExists = filesInDir.includes(pdfFilename);
                    console.log(`[PDF Check Dir Dashboard] Mengecek file: ${pdfFilename} di ${localPdfDir}. Hasil readdirSync.includes: ${fileExists}`);
                    if (fileExists) {
                        const potentialPath = path.join(localPdfDir, pdfFilename);
                        return { ...tender, localPdfPath: `/local-pdfs/${encodeURIComponent(pdfFilename)}` };
                    }
                } catch (readdirError) {
                    console.error(`[PDF Check Dir Dashboard] Error membaca direktori ${localPdfDir}:`, readdirError);
                }
                // ----------------------------------
            }
            // Fallback (jika perlu)
            // const fallbackFilename = `attachment_${tender.id}.pdf`; ...

            console.log(`[PDF Check Dir Dashboard] File TIDAK DITEMUKAN untuk attachmentName: ${tender.attachmentName} (sanitized: ${pdfFilename})`);
            return tender;
        };
        // -------------------------------------------------------------------------

        // Proses semua data untuk statistik dan ambil 5 terbaru yang sudah diproses
         const allRowsProcessedDashboard = allRows ? allRows.map(addLocalPdfPath) : [];
        const latestTendersProcessed = allRowsProcessedDashboard.slice(0, 5);
        // --- Akhir Modifikasi Data Tender untuk Dashboard ---

        // Hitung statistik
        const totalTenders = allRows ? allRows.length : 0;
        const totalPrakualifikasi = allRows ? allRows.filter(row => row.tipe_tender === 'Prakualifikasi').length : 0;
        const totalPelelangan = allRows ? allRows.filter(row => row.tipe_tender === 'Pelelangan Umum').length : 0;

        // Data yang akan dikirim ke view dashboard
        const dashboardData = {
            totalTenders: totalTenders,
            totalPrakualifikasi: totalPrakualifikasi,
            totalPelelangan: totalPelelangan,
            latestTenders: latestTendersProcessed, 
            calendarEvents: calendarEvents 
        };

        // Log 6: Cek Data Final Sebelum Render
        console.log(">>> Data final dikirim ke view dashboard:", dashboardData);
        res.render('dashboard', dashboardData); 
    });
});

// Jalankan server
const server = app.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`);
  // Inisialisasi DB saat server start
  getDb();
});

// Menangani penutupan server dengan baik
process.on('SIGINT', () => {
  console.log('\nMenerima SIGINT. Menutup server dan koneksi database...');
  server.close(() => {
    console.log('Server ditutup.');
    closeDb();
    process.exit(0);
  });
}); 