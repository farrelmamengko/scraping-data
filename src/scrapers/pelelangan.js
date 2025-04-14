const axios = require('axios');
const cheerio = require('cheerio');
// const { PATHS, getScraperApiUrl } = require('../utils/config'); // Tidak digunakan lagi
// const { scrapWithPuppeteer, scrapMultiPageWithPuppeteer } = require('../utils/puppeteerScraper'); // Dihapus
// const puppeteer = require('puppeteer'); // Tidak digunakan di versi ini
const { removeDuplicates } = require('../utils/helpers');
const qs = require('qs'); // Import library qs untuk format form data
const { insertProcurementData } = require('../utils/database'); // Import insertProcurementData
// Hapus import PaginationHandler
// const PaginationHandler = require('../utils/paginationHandler');

/**
 * Ekstrak data pelelangan dari HTML (response AJAX)
 * @param {cheerio.Root} $ - Objek Cheerio Root dari HTML halaman
 * @returns {Array<Object>} - Array objek data pelelangan
 */
function extractPelelanganFromHtml($) {
  const pelelanganData = [];

  // **Ubah Selector:** Langsung cari .card atau .col-6 .card
  // Coba selector yang lebih spesifik dulu, fallback ke .card jika tidak ketemu
  let cardSelector = '.col-6 .card';
  if ($(cardSelector).length === 0) {
      console.log("Selector '.col-6 .card' tidak ditemukan, mencoba '.card'...");
      cardSelector = '.card';
  }
  if ($(cardSelector).length === 0) {
      console.log("Selector '.card' juga tidak ditemukan. Tidak dapat mengekstrak data.");
      return pelelanganData; // Kembalikan array kosong jika tidak ada card
  }

  $(cardSelector).each((i, element) => {
    try {
      const card = $(element);
      // Jika selector adalah .col-6 .card, card sudah benar.
      // Jika selector adalah .card, card sudah benar.
      const cardBody = card.find('.card-body');
      if (!cardBody.length) {
         console.warn("Card body tidak ditemukan untuk elemen:", i);
         return; // Lanjut ke card berikutnya jika tidak ada body
      }

      // Verifikasi jenis tender (bisa diaktifkan jika perlu filter ketat)
      const cardTypeElement = cardBody.find('small.card-subtitle span').first();
      const cardType = cardTypeElement.text().trim();
       // Log jenis tender untuk debug
      // console.log("Jenis Tender Ditemukan:", cardType);
      if (cardType && !cardType.includes('Pelelangan Umum')) {
         // console.log('Skipping non-Pelelangan Umum card:', cardType);
         // return; // Skip jika bukan Pelelangan Umum
      }

      const titleElement = cardBody.find('h5.card-title a');
      // Jika tidak ada link di judul, ambil teks H5 langsung
      const title = titleElement.length ? titleElement.text().trim() : cardBody.find('h5.card-title').text().trim();
      const detailUrlPath = titleElement.length ? titleElement.attr('href') : null;

      const urlParts = detailUrlPath ? detailUrlPath.split('/') : [];
      const potentialId = urlParts.length > 0 && urlParts[urlParts.length - 1].length > 10 ? urlParts[urlParts.length - 1] : null;

      const kkks = cardBody.find('small.card-subtitle strong i').text().trim();

      let tanggal = '';
      let batasWaktu = '';
      const dateText = cardBody.find('small.card-subtitle').text();
      const dateMatch = dateText.match(/Tayang hingga\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i);
      if (dateMatch && dateMatch[1]) {
        tanggal = dateMatch[1].trim();
        batasWaktu = dateMatch[1].trim();
      }

      let bidangUsahaText = '';
      // Perbaiki cara mengambil bidang usaha, gabungkan semua teks dari span.field
      cardBody.find('.tipe span.field').each((idx, el) => {
        const fullText = $(el).text().trim();
        // Hapus label "Bidang Usaha : " hanya jika ada di awal
        const usahaText = fullText.replace(/^Bidang Usaha\s*:\s*/, '').trim();
        if (usahaText) {
          bidangUsahaText += usahaText + (usahaText.endsWith(';') ? ' ' : '; '); // Tambah semicolon jika belum ada
        }
      });
      const bidangUsaha = bidangUsahaText.replace(/;\s*$/,'').trim(); // Hapus semicolon terakhir

      const attachmentLink = cardBody.find('a.download-btn');
      let attachments = [];
      attachmentLink.each((idx, link) => {
          const attachUrl = $(link).attr('href');
          // Ambil nama dari data-name jika ada, fallback ke teks link
          const attachName = $(link).attr('data-name') || $(link).text().replace(/<i[^>]*><\/i>\s*/, '').trim();
          if(attachUrl && attachName) {
              attachments.push({ url: attachUrl, name: attachName });
          }
      });

      const attachmentUrl = attachments.length > 0 ? attachments[0].url : null;
      const attachmentName = attachments.length > 0 ? attachments[0].name : null;

      // Ambil ID dari data-file-id attachment pertama jika ID dari URL tidak ada
      let finalId = potentialId;
      if (!finalId && attachments.length > 0) {
          const firstAttachLink = cardBody.find('a.download-btn').first();
          finalId = firstAttachLink.attr('data-file-id') || null;
      }

      const pelelangan = {
        id: finalId, // Gunakan finalId
        judul: title,
        tanggal: tanggal,
        kkks: kkks,
        bidangUsaha: bidangUsaha,
        batasWaktu: batasWaktu,
        url: finalId, // URL bisa diisi ID atau link detail jika ada
        attachmentUrl: attachmentUrl,
        attachmentName: attachmentName
      };

      if (pelelangan.id) {
         pelelanganData.push(pelelangan);
      } else {
          console.warn("Gagal mendapatkan ID untuk card:", title);
      }

    } catch (err) {
      console.error('Error parsing card pelelangan:', err.message, $(element).html());
    }
  });

  console.log(`Berhasil parse ${pelelanganData.length} item pelelangan dari HTML response.`);
  return pelelanganData;
}

/**
 * Mengambil data pelelangan umum menggunakan request POST AJAX
 */
async function scrapePelelangan() {
  const url = 'https://civd.skkmigas.go.id/ajax/search/tnd.jwebs'; // URL AJAX target
  console.log(`Memulai scraping pelelangan umum dari AJAX: ${url}`);

  // Data form yang akan dikirim
  const formData = {
    type: 2, // Type 2 untuk Pelelangan Umum
    keyword: ''
  };

  try {
    const response = await axios.post(url,
      qs.stringify(formData), // Format data sebagai x-www-form-urlencoded
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36', // User agent generik
          'Accept': '*/*', // Terima semua tipe response
          'X-Requested-With': 'XMLHttpRequest' // Tandai sebagai request AJAX
          // 'Cookie': '...' // Tambahkan jika diperlukan setelah testing
        }
      }
    );

    // **DEBUG: Cetak response HTML mentah (bisa dihapus setelah OK)**
    // console.log('--- Response HTML dari AJAX ---');
    // console.log(response.data);
    // console.log('--- Akhir Response HTML ---');

    // Pastikan response adalah string (HTML)
    if (typeof response.data !== 'string') {
        console.error('Response data is not a string (HTML). Received:', typeof response.data);
        return [];
    }

    const $ = cheerio.load(response.data);
    const allPelelanganData = extractPelelanganFromHtml($);

    // Hapus duplikat
    const uniquePelelangan = removeDuplicates(allPelelanganData, 'id');
    console.log(`Total data pelelangan unik yang berhasil dikumpulkan: ${uniquePelelangan.length}`);

    // Simpan data ke database
    if (uniquePelelangan.length > 0) {
        console.log('Menyimpan data Pelelangan Umum ke database...');
        insertProcurementData(uniquePelelangan, 'Pelelangan Umum');
        console.log('Perintah penyimpanan data Pelelangan Umum dikirim.');
    }

    return uniquePelelangan;

  } catch (error) {
    console.error(`Error saat scraping pelelangan AJAX dari ${url}:`, error.message);
    if (error.response) {
      console.error('Status Code:', error.response.status);
      // console.error('Response Data:', error.response.data); // Hati-hati jika response besar
    }
    throw error;
  }
}

// Hapus fungsi scrapePelelanganWithPuppeteer karena tidak dipakai lagi
// async function scrapePelelanganWithPuppeteer() { ... }

module.exports = {
    scrapePelelangan,
    extractPelelanganFromHtml
};

// Panggil fungsi untuk menjalankannya saat script dieksekusi langsung
scrapePelelangan(); 