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
 * Ekstrak data procurement dari HTML menggunakan Cheerio (https://cheerio.js.org/)
 * 
 */
function formatDate(dateStr) {
    if (!dateStr) return '';
    // Jika sudah format YYYY-MM-DD, langsung return
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    // Jika format Indonesia (02 Mei 2025), konversi manual
    const bulan = {
        'januari': '01', 'februari': '02', 'maret': '03', 'april': '04', 'mei': '05', 'juni': '06',
        'juli': '07', 'agustus': '08', 'september': '09', 'oktober': '10', 'november': '11', 'desember': '12'
    };
    const parts = dateStr.toLowerCase().split(' ');
    if (parts.length === 3 && bulan[parts[1]]) {
        return `${parts[2]}-${bulan[parts[1]]}-${parts[0].padStart(2, '0')}`;
    }
    // Jika format JS Date string, parse dan ubah ke YYYY-MM-DD
    const dateObj = new Date(dateStr);
    if (!isNaN(dateObj)) {
        const yyyy = dateObj.getFullYear();
        const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
        const dd = String(dateObj.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }
    // Fallback: return string asli
    return dateStr;
}

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
        // Tanggal hari ini langsung format YYYY-MM-DD
        const today = new Date();
        tanggal = today.toISOString().slice(0, 10); // YYYY-MM-DD
        batasWaktu = formatDate(dateMatch[1].trim());
      }

      // --- Ambil Deskripsi ---
      // Targetkan p.card-text pertama setelah h5.card-title
      const deskripsi = cardBody.find('h5.card-title').nextAll('p.card-text').first().text().trim();
      // -----------------------

      // --- Ambil Golongan, Jenis, dan Bidang Usaha dari p.tipe ---
      let golonganUsaha = '';
      let jenisPengadaan = '';
      let bidangUsahaFinal = '';
      const tipeElement = cardBody.find('p.tipe').first(); // Target p.tipe
      
      if (tipeElement.length) {
        tipeElement.find('span').each((idx, spanEl) => {
          const span = $(spanEl);
          // Cari tag <b> di dalam span untuk label
          const boldText = span.find('b').text().trim(); 
          if (boldText.toLowerCase().startsWith('golongan usaha')) {
            // Ambil teks setelah tag <b> dan ": "
            golonganUsaha = span.text().replace(/Golongan Usaha\s*:\s*/i, '').trim();
          } else if (boldText.toLowerCase().startsWith('jenis pengadaan')) {
            // Ambil teks setelah tag <b> dan ": "
            jenisPengadaan = span.text().replace(/Jenis Pengadaan\s*:\s*/i, '').trim();
          } else if (boldText.toLowerCase().startsWith('bidang usaha')) {
            // Kumpulkan semua bagian bidang usaha
            const bidangText = span.text().replace(/Bidang Usaha\s*:\s*/i, '').trim();
            bidangUsahaFinal += (bidangUsahaFinal ? '; ' : '') + bidangText;
          }
        });
        
        // Fallback jika bidangUsahaFinal masih kosong (coba span.field)
        if (!bidangUsahaFinal) {
            tipeElement.find('span.field').each((idx, spanEl) => {
                 const spanText = $(spanEl).text().trim();
                 if (!spanText.toLowerCase().startsWith('golongan usaha') && !spanText.toLowerCase().startsWith('jenis pengadaan')) {
                      bidangUsahaFinal += (bidangUsahaFinal ? '; ' : '') + spanText;
                 }
            });
        }
      } else {
          // console.warn(`[Procurement Extractor] Elemen p.tipe tidak ditemukan untuk: ${title}`); // Optional: log jika elemen tidak ada
      }
      // --------------------------------------------------------
      
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
    const MAX_RETRIES = 3;
    const DELAY = 5000; // 5 detik delay

    while (hasMoreData && currentPage <= MAX_PAGES) {
      let retries = 0;
      let success = false;

      while (retries < MAX_RETRIES && !success) {
        try {
          console.log(`[Procurement] Mengambil data halaman ${currentPage} (percobaan ke-${retries + 1})...`);
          
          const response = await axios.get(
            `${BASE_URL}/ajax/search/tnd.jwebs?type=1&d-1789-p=${currentPage}`,
            { 
              headers,
              timeout: 30000 // 30 detik timeout
            }
          );
          
          const $ = cheerio.load(response.data);
          const pageData = extractProcurementFromHtml($);
          
          // Filter pageData untuk hanya menyertakan data baru
          const newData = pageData.filter(tender => !existingIdsSet.has(tender.id));

          if (pageData.length > 0) {
            console.log(`[Procurement] Ditemukan ${newData.length} data BARU di halaman ${currentPage} (dari total ${pageData.length} di halaman ini).`);
            allData = allData.concat(newData);
            success = true;
            currentPage++;
          } else {
            console.log(`[Procurement] Tidak ada data di halaman ${currentPage}. Menghentikan scraping.`);
            hasMoreData = false;
            break;
          }
          
          // Tunggu sebelum request berikutnya
          await new Promise(resolve => setTimeout(resolve, DELAY));
          
        } catch (error) {
          console.error(`[Procurement] Error pada halaman ${currentPage} (percobaan ke-${retries + 1}):`, error.message);
          retries++;
          
          if (retries >= MAX_RETRIES) {
            console.error(`[Procurement] Gagal setelah ${MAX_RETRIES} percobaan pada halaman ${currentPage}`);
            // Jangan langsung berhenti, coba lanjut ke halaman berikutnya
            currentPage++;
          }
          
          // Tunggu lebih lama sebelum retry
          await new Promise(resolve => setTimeout(resolve, DELAY * 2));
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