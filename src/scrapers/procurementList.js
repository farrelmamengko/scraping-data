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
      
      // Ekstrak ID dari URL attachment
      const attachmentLink = cardBody.find('a.download-btn');
      const fileId = attachmentLink.attr('data-file-id') || '';
      
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
      
      // Ekstrak dan format bidang usaha
      const bidangUsaha = cardBody.find('.tipe .field')
        .text()
        .replace(/Bidang Usaha\s*:\s*/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      
      // Ekstrak URL dan attachment
      const filePath = attachmentLink.attr('data-url') || '';
      const fileName = attachmentLink.attr('data-doc-name') || attachmentLink.attr('data-name') || '';
      
      // Buat attachmentUrl dengan menggabungkan path dan ID
      let constructedAttachmentUrl = null;
      if (fileId && filePath && !filePath.startsWith('javascript:')) {
        // Bersihkan path jika ada ;jsessionid (meskipun seharusnya tidak)
        const cleanPath = filePath.split(';')[0]; 
        constructedAttachmentUrl = `${cleanPath}?id=${fileId}`;
      }
      
      const procurement = {
        id: fileId,
        judul: title,
        tanggal: tanggal,
        kkks: kkks,
        bidangUsaha: bidangUsaha,
        batasWaktu: batasWaktu,
        url: fileId,
        attachmentUrl: constructedAttachmentUrl,
        attachmentName: fileName
      };
      
      procurementData.push(procurement);
    } catch (err) {
      console.log('Error parsing card:', err.message);
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