const axios = require('axios');
const cheerio = require('cheerio');
const { PATHS } = require('../utils/config');
const { removeDuplicates } = require('../utils/helpers');
const { insertProcurementData } = require('../utils/database'); // Import insertProcurementData

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
      const fileUrl = attachmentLink.attr('data-url') || '';
      const fileName = attachmentLink.attr('data-name') || '';
      
      const procurement = {
        id: fileId,
        judul: title,
        tanggal: tanggal,
        kkks: kkks,
        bidangUsaha: bidangUsaha,
        batasWaktu: batasWaktu,
        url: fileId,
        attachmentUrl: fileUrl,
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
 * Mengambil data procurement menggunakan API endpoint
 */
async function scrapeProcurementList() {
  console.log('[DEBUG] Memasuki fungsi scrapeProcurementList'); // Log Debug 1
  try {
    console.log('Memulai scraping procurement list...');
    console.log('[DEBUG] Inisialisasi variabel...'); // Log Debug 2
    
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
    
    while (hasMoreData) {
      try {
        console.log(`Mengambil data halaman ${currentPage}...`);
        const response = await axios.get(
          `https://civd.skkmigas.go.id/ajax/search/tnd.jwebs?type=1&d-1789-p=${currentPage}`,
          { headers }
        );
        
        const $ = cheerio.load(response.data);
        const pageData = extractProcurementFromHtml($);
        
        if (pageData.length > 0) {
          allData = allData.concat(pageData);
          console.log(`Berhasil mendapatkan ${pageData.length} data dari halaman ${currentPage}`);
          currentPage++;
        } else {
          hasMoreData = false;
          console.log('Tidak ada data lagi, berhenti scraping');
        }
        
        // Tunggu sebentar sebelum request berikutnya
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.error(`Error saat mengambil halaman ${currentPage}:`, error.message);
        hasMoreData = false;
      }
    }
    
    // Hapus duplikat
    const uniqueProcurement = removeDuplicates(allData);
    console.log(`Total data yang berhasil dikumpulkan: ${uniqueProcurement.length}`);

    // Simpan data ke database menggunakan fungsi utilitas
    if (uniqueProcurement.length > 0) {
        console.log('Menyimpan data ke database...');
        insertProcurementData(uniqueProcurement, 'Prakualifikasi');
        console.log('Perintah penyimpanan data dikirim.'); // Log diubah karena insert async
    }

    return uniqueProcurement;
  } catch (error) {
    console.error('Error saat scraping procurement list:', error.message);
    throw error;
  }
}

module.exports = {
  scrapeProcurementList
};

// Panggil fungsi untuk menjalankannya saat script dieksekusi langsung
scrapeProcurementList(); 