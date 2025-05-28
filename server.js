const express = require('express');
const path = require('path');
const { getTendersWithAttachments, initializeDb } = require('./src/utils/database');
const fs = require('fs');
const { sanitizeFilename } = require('./src/utils/helpers');
const { exec } = require('child_process');
const { getFilteredTendersByKeywords } = require('./src/utils/companyTenderFilter');

const app = express();
const port = process.env.PORT || 3000;

// Set EJS sebagai view engine
app.set('view engine', 'ejs');

// Middleware untuk parsing body
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use('/local-pdfs', express.static(path.join(__dirname, 'downloaded_pdfs')));
app.use(express.static('public'));

// Inisialisasi database saat server start
initializeDb().catch(console.error);

// Helper function untuk mengecek apakah tender baru (24 jam terakhir)
function checkIsNew(createdAt) {
    const now = new Date();
    const tenderDate = new Date(createdAt);
    const diffHours = (now - tenderDate) / (1000 * 60 * 60);
    return diffHours <= 24;
}

// Helper function untuk mengecek apakah tender sudah expired
function checkIsExpired(batasWaktu) {
    if (!batasWaktu) return false;
    const today = new Date();
    const parts = batasWaktu.split(' ');
    const months = {'Jan':0,'Feb':1,'Mar':2,'Apr':3,'May':4,'Jun':5,
                   'Jul':6,'Aug':7,'Sep':8,'Oct':9,'Nov':10,'Dec':11};
    const batasDate = new Date(parts[2], months[parts[1]], parts[0]);
    return today > batasDate;
}

function normalizeFilename(name) {
    return name
        .replace(/[\s.()]+/g, '_') // Ganti spasi, titik, tanda kurung dengan underscore
        .replace(/[^a-zA-Z0-9_]+/g, '') // Hapus karakter selain huruf, angka, underscore
        .replace(/_+/g, '_')     // Gabungkan underscore berlebih
        .toLowerCase();
}

function addLocalPdfPath(tender) {
    if (tender.attachments) {
        const pdfDir = path.join(__dirname, 'downloaded_pdfs');
        let pdfFiles = [];
        try {
            pdfFiles = fs.readdirSync(pdfDir);
        } catch (e) {
            pdfFiles = [];
        }
        tender.attachments = tender.attachments.map(attachment => {
            // Cek nama asli dulu
            const fileName = attachment.attachment_name;
            const localPath = path.join(pdfDir, fileName);
            if (fs.existsSync(localPath)) {
                attachment.localPdfPath = `/local-pdfs/${fileName}`;
                return attachment;
            }
            // Jika tidak ketemu, baru pakai normalisasi
            const dbName = normalizeFilename(fileName);
            const found = pdfFiles.find(file => normalizeFilename(file) === dbName);
            attachment.localPdfPath = found ? `/local-pdfs/${found}` : null;
            return attachment;
        });
    }
            return tender; 
        }

// Fungsi helper untuk menjalankan skrip scraper
function runScraperScript(scriptPath, res) {
    // Path ke node interpreter di dalam container mungkin perlu disesuaikan
    // atau pastikan node ada di PATH environment container.
    const command = `node ${scriptPath}`;

    exec(command, { cwd: path.join(__dirname, 'src/scrapers') }, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error executing ${scriptPath}:`, error);
            console.error(`Stderr from ${scriptPath}:`, stderr);
            // Jangan kirim error detail ke klien untuk keamanan
            return res.status(500).json({ message: `Terjadi kesalahan saat menjalankan scraper ${path.basename(scriptPath)}.` });
        }
        console.log(`Stdout from ${scriptPath}:`, stdout);
        if (stderr) { // Log stderr meskipun tidak dianggap error oleh exec
            console.warn(`Stderr (non-error) from ${scriptPath}:`, stderr);
        }
        res.json({ message: `Scraper ${path.basename(scriptPath)} berhasil dijalankan. Periksa log server untuk detail. Proses mungkin berjalan di latar belakang.` });
    });
}

// Route untuk halaman utama
app.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const keyword = req.query.keyword || null;
        const status = req.query.status || null;
        const type = req.query.type || null;

        let prakualifikasiTenders = [], pelelanganTenders = [], totalPagesPrak = 0, totalPagesPelelangan = 0;

        if (!type || type === '') {
            // Jika "Semua", ambil kedua tipe tender
            const resultPrak = await getTendersWithAttachments({
                page,
                limit: 6,
                type: 'Prakualifikasi',
                keyword,
                status
            });
            prakualifikasiTenders = resultPrak.tenders;
            totalPagesPrak = resultPrak.totalPages;

            const resultPel = await getTendersWithAttachments({
                page,
                limit: 6,
                type: 'Pelelangan Umum',
                keyword,
                status
            });
            pelelanganTenders = resultPel.tenders;
            totalPagesPelelangan = resultPel.totalPages;
        } else if (type === 'Prakualifikasi') {
            const resultPrak = await getTendersWithAttachments({
                page,
                limit: 6,
                type: 'Prakualifikasi',
                keyword,
                status
            });
            prakualifikasiTenders = resultPrak.tenders;
            totalPagesPrak = resultPrak.totalPages;
        } else if (type === 'Pelelangan Umum') {
            const resultPel = await getTendersWithAttachments({
                page,
                limit: 6,
                type: 'Pelelangan Umum',
                keyword,
                status
            });
            pelelanganTenders = resultPel.tenders;
            totalPagesPelelangan = resultPel.totalPages;
        }

        // Proses tender
        const processedPrakualifikasiTenders = prakualifikasiTenders.map(tender => {
            tender = addLocalPdfPath(tender);
            tender.isNew = checkIsNew(tender.createdAt);
            tender.isExpired = checkIsExpired(tender.batasWaktu);
            return tender;
        });
        const processedPelelanganTenders = pelelanganTenders.map(tender => {
            tender = addLocalPdfPath(tender);
            tender.isNew = checkIsNew(tender.createdAt);
            tender.isExpired = checkIsExpired(tender.batasWaktu);
            return tender;
        });

        res.render('tenders', {
            prakualifikasiTenders: processedPrakualifikasiTenders,
            pelelanganTenders: processedPelelanganTenders,
            currentPage: page,
            totalPagesPrak,
            totalPagesPelelangan,
            totalPagesPel: totalPagesPelelangan,
            keyword,
            status,
            type,
            totalResultsPrak: processedPrakualifikasiTenders.length,
            totalResultsPel: processedPelelanganTenders.length
        });
    } catch (error) {
        console.error('Error fetching tenders:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Route untuk dashboard
app.get('/dashboard', async (req, res) => {
    try {
        // Ambil statistik dan data terbaru
        const { tenders: latestTenders } = await getTendersWithAttachments({
            limit: 5
        });

        // Proses tender terbaru
        const processedLatestTenders = latestTenders.map(tender => {
            tender.isNew = checkIsNew(tender.createdAt);
            tender.isExpired = checkIsExpired(tender.batasWaktu);
            return tender;
        });

        // Ambil semua tender untuk kalender dan statistik
        const { tenders: allTenders } = await getTendersWithAttachments({
            limit: 1000
        });

        // Hitung total
        const totalTenders = allTenders.length;
        const totalPrakualifikasi = allTenders.filter(t => t.tipe_tender === 'Prakualifikasi').length;
        const totalPelelangan = allTenders.filter(t => t.tipe_tender === 'Pelelangan Umum').length;

        // Format data untuk kalender
        const calendarEvents = allTenders
            .filter(tender => tender.batasWaktu && /^\d{4}-\d{2}-\d{2}$/.test(tender.batasWaktu)) // hanya yang punya deadline valid
            .map(tender => ({
                title: `Deadline: ${tender.judul}`,
                start: tender.batasWaktu,
                url: `/tender/${tender.id}`
            }));

        // Render dashboard
        res.render('dashboard', {
            latestTenders: processedLatestTenders,
            calendarEvents,
            totalTenders,
            totalPrakualifikasi,
            totalPelelangan
        });
    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Route untuk tender khusus berdasarkan KKKS (dan sekarang keywords)
app.get('/tender-khusus', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1; // Pagination masih bisa relevan

        // DAFTAR KATA KUNCI PERUSAHAAN YANG SUDAH DITENTUKAN
        // Ganti array ini dengan daftar kata kunci yang Anda inginkan
        const predefinedCompanyKeywords = ["Seismik", "Formasi", "Reservoir Simulation", "Reservoir Modeling", "G&G", "Geoteknik", "Geofisika"]; 

        let tenders = [];
        let totalPages = 0;
        let errorMessage = null;
        let filteredResults = []; // Inisialisasi di sini

        if (predefinedCompanyKeywords && predefinedCompanyKeywords.length > 0) {
            // filteredResults dideklarasikan di atas dan diisi di sini
            filteredResults = await getFilteredTendersByKeywords(predefinedCompanyKeywords);
            
            tenders = filteredResults.map(tender => {
                tender = addLocalPdfPath(tender); 
                tender.isNew = checkIsNew(tender.createdAt);
                tender.isExpired = checkIsExpired(tender.batasWaktu);
                return tender;
            });
            // Untuk pagination sederhana, jika ada hasil, anggap 1 halaman, atau implementasi pagination penuh jika perlu
            totalPages = tenders.length > 0 ? Math.ceil(tenders.length / (req.query.limit || 10)) : 0; 
            // Jika menggunakan pagination, Anda perlu memotong array 'tenders' sesuai 'page' dan 'limit'
            // Contoh: const limit = parseInt(req.query.limit) || 10;
            // const offset = (page - 1) * limit;
            // tenders = tenders.slice(offset, offset + limit);
        } else {
            errorMessage = 'Tidak ada kata kunci perusahaan yang ditentukan di konfigurasi server.';
        }

        res.render('tender-khusus', {
            tenders: tenders, // Kirim data tender yang sudah dipaginasi jika diimplementasikan
            currentPage: page,
            totalPages: totalPages,
            // companyKeywords: predefinedCompanyKeywords.join(', '), // Bisa dikirim untuk info
            totalResults: tenders.length, // Gunakan tenders.length karena ini yang dikirim ke view
            errorMessage,
            searchPerformed: true, // Dianggap selalu search karena otomatis
            // Hapus variabel query yang tidak lagi digunakan sebagai input utama jika form dihilangkan
            // keyword: null,
            // status: null,
            // type: null,
            // kkks: null,
            // companyKeywordsRaw: predefinedCompanyKeywords.join(', ') // Jika masih mau ditampilkan
        });
    } catch (error) {
        console.error('Error fetching tender khusus:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Route untuk menjalankan scraper procurementList.js
app.post('/run-scraper', (req, res) => {
    console.log('Menerima permintaan untuk menjalankan scraper Prakualifikasi (procurementList.js)');
    runScraperScript('procurementList.js', res);
});

// Route untuk menjalankan scraper pelelangan.js
app.post('/run-scraper-pelelangan', (req, res) => {
    console.log('Menerima permintaan untuk menjalankan scraper Pelelangan Umum (pelelangan.js)');
    runScraperScript('pelelangan.js', res);
});

// Start server
app.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`);
}); 