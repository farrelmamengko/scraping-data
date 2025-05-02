const express = require('express');
const path = require('path');
const { getTendersWithAttachments, initializeDb } = require('./src/utils/database');
const fs = require('fs');
const { sanitizeFilename } = require('./src/utils/helpers');

const app = express();
const port = 3000;

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

// Route untuk halaman utama
app.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const keyword = req.query.keyword || null;
        const status = req.query.status || null;

        // Ambil data tender Prakualifikasi
        const { tenders: prakualifikasiTenders, totalPages: totalPagesPrak } = await getTendersWithAttachments({
            page,
            limit: 6,
            type: 'Prakualifikasi',
            keyword
        });

        // Ambil data tender Pelelangan Umum
        const { tenders: pelelanganTenders, totalPages: totalPagesPelelangan } = await getTendersWithAttachments({
            page,
            limit: 6,
            type: 'Pelelangan Umum',
            keyword
        });

        // Fungsi filter status di JS
        function isExpired(batasWaktu) {
            if (!batasWaktu) return false;
            const parts = batasWaktu.split(' ');
            const months = {
                Jan: '01', Januari: '01',
                Feb: '02', Februari: '02',
                Mar: '03', Maret: '03',
                Apr: '04', April: '04',
                May: '05', Mei: '05',
                Jun: '06', Juni: '06',
                Jul: '07', Juli: '07',
                Aug: '08', Agustus: '08', Agu: '08',
                Sep: '09', September: '09',
                Oct: '10', Oktober: '10', Okt: '10',
                Nov: '11', November: '11',
                Dec: '12', Desember: '12', Des: '12'
            };
            if (parts.length === 3 && months[parts[1]]) {
                const dateStr = `${parts[2]}-${months[parts[1]]}-${parts[0].padStart(2, '0')}`;
                return new Date(dateStr) < new Date();
            }
            return false;
        }

        let prakualifikasiTendersFiltered = prakualifikasiTenders;
        let pelelanganTendersFiltered = pelelanganTenders;
        if (status === 'active') {
            prakualifikasiTendersFiltered = prakualifikasiTenders.filter(t => !isExpired(t.batasWaktu));
            pelelanganTendersFiltered = pelelanganTenders.filter(t => !isExpired(t.batasWaktu));
        } else if (status === 'expired') {
            prakualifikasiTendersFiltered = prakualifikasiTenders.filter(t => isExpired(t.batasWaktu));
            pelelanganTendersFiltered = pelelanganTenders.filter(t => isExpired(t.batasWaktu));
        }

        // Proses tender
        const processedPrakualifikasiTenders = prakualifikasiTendersFiltered.map(tender => {
            tender = addLocalPdfPath(tender);
            tender.isNew = checkIsNew(tender.createdAt);
            tender.isExpired = checkIsExpired(tender.batasWaktu);
            return tender;
        });
        const processedPelelanganTenders = pelelanganTendersFiltered.map(tender => {
            tender = addLocalPdfPath(tender);
            tender.isNew = checkIsNew(tender.createdAt);
            tender.isExpired = checkIsExpired(tender.batasWaktu);
            return tender;
        });

        // Render halaman dengan data yang benar
        res.render('tenders', {
            prakualifikasiTenders: processedPrakualifikasiTenders,
            pelelanganTenders: processedPelelanganTenders,
            currentPage: page,
            totalPagesPrak,
            totalPagesPelelangan,
            totalPagesPel: totalPagesPelelangan,
            keyword,
            status,
            totalResultsPrak: prakualifikasiTendersFiltered.length,
            totalResultsPel: pelelanganTendersFiltered.length
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

// Start server
app.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`);
}); 