const express = require('express');
const path = require('path');
const { getDb, closeDb } = require('./src/utils/database'); // Sesuaikan path jika perlu

const app = express();
const port = 3000;

// Setup EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware (jika diperlukan di masa mendatang)
app.use(express.static(path.join(__dirname, 'public'))); // Untuk file statis seperti CSS/JS eksternal

// Route utama untuk menampilkan tender
app.get('/', (req, res) => {
  const db = getDb();
  const sql = 'SELECT id, judul, tanggal, batasWaktu, kkks, bidangUsaha, url, attachmentUrl, attachmentName, tipe_tender FROM procurement_list ORDER BY createdAt DESC';

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

    // Pisahkan data berdasarkan tipe tender
    const prakualifikasiTenders = allRows.filter(row => row.tipe_tender === 'Prakualifikasi');
    const pelelanganTenders = allRows.filter(row => row.tipe_tender === 'Pelelangan Umum');

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
    const sql = 'SELECT id, judul, createdAt, tipe_tender, batasWaktu FROM procurement_list ORDER BY createdAt DESC'; // Ambil juga batasWaktu

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

        // Hitung statistik (pindahkan ke sini agar selalu terhitung)
        const totalTenders = allRows ? allRows.length : 0;
        const totalPrakualifikasi = allRows ? allRows.filter(row => row.tipe_tender === 'Prakualifikasi').length : 0;
        const totalPelelangan = allRows ? allRows.filter(row => row.tipe_tender === 'Pelelangan Umum').length : 0;
        const latestTenders = allRows ? allRows.slice(0, 5) : [];

        // Data yang akan dikirim ke view dashboard
        const dashboardData = {
            totalTenders: totalTenders,
            totalPrakualifikasi: totalPrakualifikasi,
            totalPelelangan: totalPelelangan,
            latestTenders: latestTenders,
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