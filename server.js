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
  // Validasi sederhana: hanya izinkan .pdf dan cegah path traversal
  if (!filename.endsWith('.pdf') || filename.includes('..')) {
    return res.status(400).send('Nama file tidak valid.');
  }

  const filePath = path.join(localPdfDir, filename);

  // Cek apakah file ada sebelum mengirim
  fs.access(filePath, fs.constants.R_OK, (err) => {
    if (err) {
      console.error(`Error akses file PDF: ${filePath}`, err);
      return res.status(404).send('File PDF tidak ditemukan.');
    }
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
            console.log(`[Server] Berhasil mengirim file PDF: ${filePath}`);
        }
    });
  });
});
// -------------------------------------------

// Route utama untuk menampilkan tender
app.get('/', (req, res) => {
  const db = getDb();
  // Ambil semua kolom yang relevan, termasuk batasWaktu
  const sql = 'SELECT id, judul, tanggal, batasWaktu, kkks, bidangUsaha, url, attachmentUrl, attachmentName, tipe_tender, createdAt FROM procurement_list ORDER BY createdAt DESC';

  // Pagination setup
  const currentPage = parseInt(req.query.page || '1', 10);
  const itemsPerPage = 6;
  const startIndex = (currentPage - 1) * itemsPerPage;
  // endIndex tidak perlu di SQL jika kita slice di aplikasi

  db.all(sql, [], (err, allRows) => {
    if (err) {
      console.error("Error fetching data:", err.message);
      res.status(500).send("Error mengambil data dari database");
      return;
    }

    // --- Modifikasi Data Tender untuk Menyertakan Path PDF Lokal --- 
    const addLocalPdfPath = (tender) => {
        // Gunakan sanitizeFilename dari helpers
        const pdfFilename = sanitizeFilename(tender.attachmentName);
        
        if (pdfFilename) {
            const potentialPath = path.join(localPdfDir, pdfFilename);
            if (fs.existsSync(potentialPath)) {
                return { ...tender, localPdfPath: `/local-pdfs/${encodeURIComponent(pdfFilename)}` };
            }
        }
        // Fallback: Coba cari berdasarkan ID (jika logika ini masih relevan)
        const fallbackFilename = `attachment_${tender.id}.pdf`; 
        const fallbackPath = path.join(localPdfDir, fallbackFilename);
        if (tender.id && fs.existsSync(fallbackPath)) {
             console.log(`[PDF Check /] File untuk ${tender.judul} tidak ditemukan dengan nama asli (${pdfFilename}), menggunakan fallback ID: ${fallbackFilename}`) 
             return { ...tender, localPdfPath: `/local-pdfs/${encodeURIComponent(fallbackFilename)}` };
        }
        
        return tender;
    };

    const allRowsWithPdf = allRows.map(addLocalPdfPath);
    // --- Akhir Modifikasi Data Tender ---

    // Pisahkan data berdasarkan tipe tender (setelah diproses)
    const prakualifikasiTenders = allRowsWithPdf.filter(row => row.tipe_tender === 'Prakualifikasi');
    const pelelanganTenders = allRowsWithPdf.filter(row => row.tipe_tender === 'Pelelangan Umum');

    // Hitung total halaman untuk masing-masing tipe
    const totalPagesPrak = Math.ceil(prakualifikasiTenders.length / itemsPerPage);
    const totalPagesPel = Math.ceil(pelelanganTenders.length / itemsPerPage);

    // Ambil data untuk halaman saat ini
    const paginatedPrakTenders = prakualifikasiTenders.slice(startIndex, startIndex + itemsPerPage);
    const paginatedPelTenders = pelelanganTenders.slice(startIndex, startIndex + itemsPerPage);

    // Data yang akan dikirim ke view
    const viewData = {
        prakualifikasiTenders: paginatedPrakTenders,
        pelelanganTenders: paginatedPelTenders,
        currentPage: currentPage,
        totalPagesPrak: totalPagesPrak,
        totalPagesPel: totalPagesPel
    };

    // Debug: Log data sebelum render
    console.log("Data dikirim ke view:", viewData);

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
                const potentialPath = path.join(localPdfDir, pdfFilename);
                if (fs.existsSync(potentialPath)) {
                    return { ...tender, localPdfPath: `/local-pdfs/${encodeURIComponent(pdfFilename)}` };
                }
            }
            // Fallback (jika masih relevan)
            const fallbackFilename = `attachment_${tender.id}.pdf`;
            const fallbackPath = path.join(localPdfDir, fallbackFilename);
             if (tender.id && fs.existsSync(fallbackPath)) {
                 console.log(`[PDF Check Dashboard] File untuk ${tender.judul} tidak ditemukan dengan nama asli (${pdfFilename}), menggunakan fallback ID: ${fallbackFilename}`) 
                 return { ...tender, localPdfPath: `/local-pdfs/${encodeURIComponent(fallbackFilename)}` };
            }
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