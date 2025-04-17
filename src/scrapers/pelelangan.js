const axios = require('axios');
const cheerio = require('cheerio');
// const { PATHS, getScraperApiUrl } = require('../utils/config'); // Tidak digunakan lagi
// const { scrapWithPuppeteer, scrapMultiPageWithPuppeteer } = require('../utils/puppeteerScraper'); // Dihapus
// const puppeteer = require('puppeteer'); // Tidak digunakan di versi ini
const { removeDuplicates } = require('../utils/helpers'); // Hanya removeDuplicates
const qs = require('qs'); // Import library qs untuk format form data
const { insertProcurementData, getExistingTenderIds } = require('../utils/database'); // Import insertProcurementData dan getExistingTenderIds
const { downloadPdfsWithPlaywright } = require('./downloadPDFsPlaywright'); // Import Playwright downloader
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

      const kkks = cardBody.find('small.card-subtitle strong i').text().trim();

      let tanggal = '';
      let batasWaktu = '';
      const dateText = cardBody.find('small.card-subtitle').text();
      const dateMatch = dateText.match(/Tayang hingga\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i);
      if (dateMatch && dateMatch[1]) {
        tanggal = dateMatch[1].trim();
        batasWaktu = dateMatch[1].trim();
      }

      // --- Ambil Deskripsi --- 
      // Targetkan p.card-text pertama setelah small.card-subtitle
      const deskripsi = cardBody.find('small.card-subtitle').nextAll('p.card-text').first().text().trim();
      // -----------------------

      // --- Ambil Golongan, Jenis, dan Bidang Usaha ---
      let golonganUsaha = '';
      let jenisPengadaan = '';
      let bidangUsahaFinal = '';
      const tipeDiv = cardBody.find('div.tipe, p.tipe');
      let combinedText = '';
      tipeDiv.find('span.field').each((idx, el) => {
          combinedText += $(el).text().trim() + ' | ';
      });
      combinedText = combinedText.replace(/\|\s*$/, '').trim();

      const parts = combinedText.split('|').map(part => part.trim());
      parts.forEach(part => {
          if (part.toLowerCase().startsWith('golongan usaha')) {
              golonganUsaha = part.replace(/Golongan Usaha\s*:\s*/i, '').trim();
          } else if (part.toLowerCase().startsWith('jenis pengadaan')) {
              jenisPengadaan = part.replace(/Jenis Pengadaan\s*:\s*/i, '').trim();
          } else if (part.toLowerCase().startsWith('bidang usaha')) {
              bidangUsahaFinal += (bidangUsahaFinal ? '; ' : '') + part.replace(/Bidang Usaha\s*:\s*/i, '').trim();
          } else if (!golonganUsaha && !jenisPengadaan && !bidangUsahaFinal && part) {
              bidangUsahaFinal = part;
          } else if (part) {
               bidangUsahaFinal += (bidangUsahaFinal ? '; ' : '') + part;
          }
      });
      // ---------------------------------------------

      // Kumpulkan SEMUA attachment
      const attachments = [];
      cardBody.find('a.download-btn').each((idx, link) => {
          const attachUrl = $(link).attr('data-url') || $(link).attr('href');
          // Prioritaskan data-doc-name, lalu data-name, baru teks link
          const attachName = $(link).attr('data-doc-name') || $(link).attr('data-name') || $(link).text().replace(/<i[^>]*><\/i>\s*/, '').trim(); 
          const attachId = $(link).attr('data-file-id');

          if(attachId && attachUrl && attachName && !attachUrl.startsWith('javascript:')) {
              const cleanPath = attachUrl.split(';')[0];
              const constructedUrl = `${cleanPath}?id=${attachId}`; // Bangun URL lengkap jika perlu
              attachments.push({
                  id: attachId,
                  name: attachName,
                  url: constructedUrl // Simpan URL asli
              });
          }
      });
      
      // Gunakan ID dari attachment pertama sebagai ID utama tender
      if (attachments.length > 0) {
          const firstAttachment = attachments[0];
          const pelelangan = {
            id: firstAttachment.id, // ID utama dari attachment pertama
            judul: title,
            deskripsi: deskripsi,
            golonganUsaha: golonganUsaha,
            jenisPengadaan: jenisPengadaan,
            bidangUsaha: bidangUsahaFinal,
            tanggal: tanggal,
            kkks: kkks,
            batasWaktu: batasWaktu,
            url: firstAttachment.id, // Atau URL detail jika ada
            // Info attachment pertama (untuk DB)
            attachmentUrl: firstAttachment.url, 
            attachmentName: firstAttachment.name,
            // Array semua attachment
            allAttachments: attachments
          };
          pelelanganData.push(pelelangan);
      } else {
          // Jika tidak ada attachment, jangan tambahkan data (atau tangani sesuai kebutuhan)
          console.warn(`[Pelelangan Extractor] Tidak ada attachment valid ditemukan untuk: ${title}`);
      }

    } catch (err) {
      console.error('[Pelelangan Extractor] Error parsing card pelelangan:', err.message, $(element).html());
    }
  });

  console.log(`[Pelelangan Extractor] Berhasil parse ${pelelanganData.length} item pelelangan dari HTML response.`);
  return pelelanganData;
}

/**
 * Mengambil data pelelangan umum menggunakan request POST AJAX
 */
async function scrapePelelangan() {
  console.log('[Pelelangan] Memulai scraping data...');
  
  try {
    // Ambil ID tender yang sudah ada di database SEBELUM memulai loop
    const existingIdsSet = await getExistingTenderIds();
    
    const url = 'https://civd.skkmigas.go.id/ajax/search/tnd.jwebs'; // URL AJAX target
    console.log(`Memulai scraping pelelangan umum dari AJAX: ${url}`);

    // Data form yang akan dikirim
    const formData = {
      type: 2, // Type 2 untuk Pelelangan Umum
      keyword: ''
    };

    const response = await axios.post(url,
      qs.stringify(formData), // Format data sebagai x-www-form-urlencoded
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36', // User agent generik
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
    const pageData = extractPelelanganFromHtml($);
    
    // Filter pageData untuk hanya menyertakan data baru
    const newData = pageData.filter(tender => !existingIdsSet.has(tender.id));

    // Langsung proses newData
    if (newData.length > 0) {
      console.log(`[Pelelangan] Ditemukan ${newData.length} data BARU.`);
      
      // Hapus duplikat dari newData (meskipun seharusnya sudah unik jika ID berbeda)
      const uniquePelelangan = removeDuplicates(newData);
      console.log(`[Pelelangan] Total data unik BARU yang akan diproses: ${uniquePelelangan.length}`);

      if (uniquePelelangan.length > 0) {
        console.log('[Pelelangan] Menyimpan data unik BARU ke database...');
        await insertProcurementData(uniquePelelangan, 'Pelelangan Umum');
        console.log('[Pelelangan] Data unik BARU berhasil disimpan ke database.');
        
        // --- Tambahkan Pemanggilan Download PDF --- 
        console.log('[Pelelangan] Memulai pengunduhan PDF dengan Playwright untuk data Pelelangan...');
        try {
             // uniquePelelangan berisi data baru yang memiliki allAttachments
             await downloadPdfsWithPlaywright(uniquePelelangan);
             console.log('[Pelelangan] Proses pengunduhan PDF dengan Playwright selesai.');
        } catch (playwrightError) {
            console.error('[Pelelangan] Terjadi error saat menjalankan pengunduhan Playwright:', playwrightError);
        }
        // -------------------------------------------

      } else {
         // Ini seharusnya tidak terjadi jika newData.length > 0, tapi sebagai pengaman
         console.log('[Pelelangan] Tidak ada data unik BARU setelah removeDuplicates (seharusnya tidak terjadi).');
      }

    } else {
      console.log(`[Pelelangan] Tidak ada data BARU yang ditemukan dalam respons AJAX.`);
    }
    
    // Hapus delay yang tidak perlu setelah proses
    // await new Promise(resolve => setTimeout(resolve, 2500));

    // Hapus pemrosesan uniquePelelangan di luar blok if
    // const uniquePelelangan = removeDuplicates(allData); ...
    
    // Kembalikan newData atau array kosong
    return newData; 

  } catch (error) { // OUTER catch
    // Gunakan variabel url yang didefinisikan di scope luar
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
(async () => {
    try {
        await scrapePelelangan();
    } catch (error) {
        console.error("Gagal menjalankan scraper Pelelangan Umum:", error);
        process.exit(1); // Keluar dengan kode error
    }
})(); // Ubah menjadi IIFE async 