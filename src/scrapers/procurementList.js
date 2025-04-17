const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs');
const { PATHS } = require('../utils/config');
const { removeDuplicates } = require('../utils/helpers');
const { insertProcurementData, getExistingTenderIds } = require('../utils/database');
const { downloadPdfsWithPlaywright } = require('./downloadPDFsPlaywright');

const BASE_URL = 'https://civd.skkmigas.go.id';

/**
 * Ekstrak data procurement dari HTML menggunakan Cheerio
 */
function extractProcurementFromHtml($) {
  const procurementData = [];
  
  // Cari semua card procurement
  $('.card').each((i, element) => {
    try {
      const card = $(element);
      const cardBody = card.find('.card-body');
      if (!cardBody.length) return; // Lewati jika tidak ada body
      
      // Ekstrak judul
      const title = cardBody.find('h5.card-title').text().trim();
      
      // Ekstrak KKKS
      const kkks = cardBody.find('small.card-subtitle strong i').text().trim();
      
      // Ekstrak tanggal dan batas waktu
      let tanggal = '';
      let batasWaktu = '';
      const dateText = cardBody.find('small.card-subtitle').text();
      const dateMatch = dateText.match(/Tayang hingga\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i);
      if (dateMatch && dateMatch[1]) {
        tanggal = dateMatch[1].trim();
        batasWaktu = dateMatch[1].trim();
      }

      // --- Ambil Deskripsi ---
      // Targetkan p.card-text pertama setelah h5.card-title
      const deskripsi = cardBody.find('h5.card-title').nextAll('p.card-text').first().text().trim();
      // -----------------------

      // --- Ambil Golongan, Jenis, dan Bidang Usaha ---
      let golonganUsaha = '';
      let jenisPengadaan = '';
      let bidangUsahaFinal = '';
      const tipeDiv = cardBody.find('div.tipe, p.tipe'); // Cari div atau p dengan kelas tipe
      let combinedText = '';
      tipeDiv.find('span.field').each((idx, el) => {
          combinedText += $(el).text().trim() + ' | '; // Gabungkan teks dari semua span field
      });
      combinedText = combinedText.replace(/\|\s*$/, '').trim(); // Hapus pemisah terakhir

      // Parsing teks gabungan
      const parts = combinedText.split('|').map(part => part.trim());
      parts.forEach(part => {
          if (part.toLowerCase().startsWith('golongan usaha')) {
              golonganUsaha = part.replace(/Golongan Usaha\s*:\s*/i, '').trim();
          } else if (part.toLowerCase().startsWith('jenis pengadaan')) {
              jenisPengadaan = part.replace(/Jenis Pengadaan\s*:\s*/i, '').trim();
          } else if (part.toLowerCase().startsWith('bidang usaha')) {
              // Kumpulkan semua bagian bidang usaha jika terpisah
              bidangUsahaFinal += (bidangUsahaFinal ? '; ' : '') + part.replace(/Bidang Usaha\s*:\s*/i, '').trim();
          } else if (!golonganUsaha && !jenisPengadaan && !bidangUsahaFinal && part) {
              // Fallback jika formatnya berbeda, anggap bagian pertama non-label adalah bidang usaha
              bidangUsahaFinal = part;
          } else if (part) {
              // Tambahkan ke bidang usaha jika tidak cocok dengan yang lain dan tidak kosong
               bidangUsahaFinal += (bidangUsahaFinal ? '; ' : '') + part;
          }
      });
      // ---------------------------------------------
      
      // Kumpulkan SEMUA attachment
      const attachments = [];
      cardBody.find('a.download-btn').each((idx, link) => {
        const fileId = $(link).attr('data-file-id');
        const filePath = $(link).attr('data-url');
        const fileName = $(link).attr('data-doc-name') || $(link).attr('data-name') || '';

        if (fileId && fileName && filePath && !filePath.startsWith('javascript:')) {
          const cleanPath = filePath.split(';')[0]; 
          const constructedUrl = `${cleanPath}?id=${fileId}`;
          attachments.push({
            id: fileId,
            name: fileName,
            url: constructedUrl // Simpan URL asli per attachment jika perlu
          });
        }
      });

      // Hanya proses jika ada attachment valid
      if (attachments.length > 0) {
        const firstAttachment = attachments[0]; // Ambil attachment pertama untuk data utama
        const procurement = {
          // Gunakan ID attachment pertama sebagai ID utama tender (untuk DB)
          id: firstAttachment.id, 
          judul: title,
          deskripsi: deskripsi,
          golonganUsaha: golonganUsaha,
          jenisPengadaan: jenisPengadaan,
          bidangUsaha: bidangUsahaFinal,
          tanggal: tanggal,
          kkks: kkks,
          batasWaktu: batasWaktu,
          // Info attachment pertama (untuk kompatibilitas DB saat ini)
          url: firstAttachment.id, // Atau bisa juga firstAttachment.url jika lebih relevan
          attachmentUrl: firstAttachment.url, 
          attachmentName: firstAttachment.name,
          // Array berisi SEMUA attachment untuk diteruskan ke downloader
          allAttachments: attachments 
        };
        procurementData.push(procurement);
      } else {
         console.warn(`[Procurement Extractor] Tidak ada attachment valid ditemukan untuk: ${title}`);
      }
      
    } catch (err) {
      console.error('[Procurement Extractor] Error parsing card:', err.message, $(element).html());
    }
  });
  
  return procurementData;
}

/**
 * Mengambil data procurement menggunakan API endpoint dan MENGUNDUH attachment SETELAH semua data terkumpul.
 */
async function scrapeProcurementList() {
  console.log('[Procurement] Memulai scraping data...');

  try {
    // Ambil ID tender yang sudah ada di database SEBELUM memulai loop
    const existingIdsSet = await getExistingTenderIds();

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    };
    
    let allData = [];
    let currentPage = 1;
    let hasMoreData = true;
    const MAX_PAGES = 50;

    while (hasMoreData && currentPage <= MAX_PAGES) {
      try {
        console.log(`[Procurement] Mengambil data halaman ${currentPage}...`);
        const response = await axios.get(
          `${BASE_URL}/ajax/search/tnd.jwebs?type=1&d-1789-p=${currentPage}`,
          { headers }
        );
        
        const $ = cheerio.load(response.data);
        const pageData = extractProcurementFromHtml($);
        
        // Filter pageData untuk hanya menyertakan data baru
        const newData = pageData.filter(tender => !existingIdsSet.has(tender.id));

        if (newData.length > 0) {
          // Log jumlah data BARU yang ditemukan
          console.log(`[Procurement] Ditemukan ${newData.length} data BARU di halaman ${currentPage} (dari total ${pageData.length} di halaman ini).`);
          allData = allData.concat(newData); // Hanya tambahkan data baru ke allData
          currentPage++;
        } else {
          console.log(`[Procurement] Tidak ada data BARU di halaman ${currentPage} (dari total ${pageData.length} di halaman ini). Mungkin akhir data baru atau halaman lama.`);
          // Cek apakah masih ada tombol next (jika ada data lama di halaman berikutnya)
          // Cek link pagination untuk 'next'
          const nextPageLink = $('div.pagelinks a[title="Next"].uibutton');
          if (nextPageLink.length === 0 || nextPageLink.hasClass('disable')) {
              hasMoreData = false;
              console.log(`[Procurement] Tombol 'Next' tidak ditemukan atau disabled di halaman ${currentPage}. Menghentikan scraping.`);
          } else {
              console.log(`[Procurement] Masih ada halaman berikutnya, lanjut mencari data baru...`);
              currentPage++; // Tetap lanjut ke halaman berikutnya meskipun halaman ini kosong dari data baru
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 2500));
        
      } catch (error) {
        if (error.response && error.response.status === 404) {
             console.log(`[Procurement] Halaman ${currentPage} tidak ditemukan (404), menganggap akhir data.`);
             hasMoreData = false;
        } else {
            console.error(`[Procurement] Error saat mengambil/memproses halaman ${currentPage}:`, error.message);
            hasMoreData = false;
        }
      }
    }

    if (currentPage > MAX_PAGES) {
        console.warn(`[Procurement] Mencapai batas maksimum halaman (${MAX_PAGES}). Berhenti.`);
    }

    const uniqueProcurement = removeDuplicates(allData);
    console.log(`[Procurement] Total data unik BARU yang berhasil dikumpulkan: ${uniqueProcurement.length}`);

    if (uniqueProcurement.length > 0) {
        console.log('[Procurement] Menyimpan semua data unik BARU ke database...');
        await insertProcurementData(uniqueProcurement, 'Prakualifikasi');
        console.log('[Procurement] Semua data unik berhasil disimpan ke database.');

        // Panggil Playwright untuk mengunduh PDF setelah data disimpan
        console.log('[Procurement] Memulai pengunduhan PDF dengan Playwright...');
        try {
             await downloadPdfsWithPlaywright(uniqueProcurement);
             console.log('[Procurement] Proses pengunduhan PDF dengan Playwright selesai.');
        } catch (playwrightError) {
            console.error('[Procurement] Terjadi error saat menjalankan pengunduhan Playwright:', playwrightError);
        }

    } else {
        console.log('[Procurement] Tidak ada data unik BARU untuk disimpan atau diunduh.');
    }

    return uniqueProcurement;

  } catch (error) {
    console.error('[Procurement] Error utama saat scraping procurement list:', error.message);
  }
}

module.exports = {
  scrapeProcurementList
};

(async () => {
    try {
        await scrapeProcurementList();
    } catch (error) {
        console.error("Gagal menjalankan scraper Prakualifikasi:", error);
        process.exit(1);
    }
})(); 