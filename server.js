const express = require('express');
const path = require('path');
const { getDb, closeDb } = require('./src/utils/database'); // Sesuaikan path jika perlu

const app = express();
const port = 3000;

// Setup EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware (jika diperlukan di masa mendatang)
// app.use(express.static(path.join(__dirname, 'public'))); // Untuk file statis seperti CSS/JS eksternal

// Route utama untuk menampilkan tender
app.get('/', (req, res) => {
  const db = getDb();
  // Ambil semua kolom termasuk tipe_tender
  const sql = "SELECT id, judul, tanggal, kkks, bidangUsaha, batasWaktu, url, attachmentUrl, attachmentName, tipe_tender FROM procurement_list ORDER BY createdAt DESC";

  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error("Error fetching data:", err.message);
      res.status(500).send("Terjadi kesalahan saat mengambil data tender.");
      return;
    }

    // Pisahkan data berdasarkan tipe_tender
    const prakualifikasiTenders = rows.filter(tender => tender.tipe_tender === 'Prakualifikasi');
    const pelelanganTenders = rows.filter(tender => tender.tipe_tender === 'Pelelangan Umum');

    // Render halaman EJS dengan data yang sudah dipisah
    res.render('tenders', {
        prakualifikasiTenders: prakualifikasiTenders,
        pelelanganTenders: pelelanganTenders
    });
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