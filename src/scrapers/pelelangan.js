const axios = require('axios');
const cheerio = require('cheerio');
const { PATHS, getScraperApiUrl } = require('../utils/config');
const { scrapWithPuppeteer, scrapMultiPageWithPuppeteer } = require('../utils/puppeteerScraper');
const puppeteer = require('puppeteer');
const { removeDuplicates } = require('../utils/helpers');
const PaginationHandler = require('../utils/paginationHandler');

/**
 * Ekstrak data pelelangan dari HTML menggunakan Cheerio
 */
function extractPelelanganFromHtml($) {
  const pelelanganData = [];
  
  // Cari semua card pelelangan
  $('#bid .card').each((i, element) => {
    try {
      const card = $(element);
      const cardBody = card.find('.card-body');
      
      // Verifikasi bahwa ini adalah card Pelelangan Umum
      const cardType = cardBody.find('small.card-subtitle span').text().trim();
      if (!cardType.includes('Pelelangan Umum')) {
        return; // Skip jika bukan Pelelangan Umum
      }
      
      // Ekstrak data pelelangan
      const title = cardBody.find('h5.card-title').text().trim();
      const kkks = cardBody.find('small.card-subtitle strong i').text().trim();
      
      // Ekstrak tanggal dari text Tayang hingga
      let tanggal = '';
      let batasWaktu = '';
      const dateText = cardBody.find('small.card-subtitle').text();
      const dateMatch = dateText.match(/Tayang hingga (\d+ [A-Za-z]+ \d+)/);
      if (dateMatch && dateMatch[1]) {
        tanggal = dateMatch[1].trim();
        batasWaktu = dateMatch[1].trim();
      }
      
      // Ekstrak bidang usaha
      const bidangUsaha = cardBody.find('.tipe .field').text().trim();
      
      // Ekstrak URL dan attachment
      const attachmentLink = cardBody.find('a.download-btn');
      const fileId = attachmentLink.attr('data-file-id') || null;
      const fileUrl = attachmentLink.attr('data-url') || null;
      const fileName = attachmentLink.attr('data-name') || null;
      
      const pelelangan = {
        id: '',
        judul: title,
        tanggal: tanggal,
        kkks: kkks,
        bidangUsaha: bidangUsaha,
        batasWaktu: batasWaktu,
        url: fileId,
        attachmentUrl: fileUrl,
        attachmentName: fileName
      };
      
      pelelanganData.push(pelelangan);
    } catch (err) {
      console.log('Error parsing card:', err.message);
    }
  });
  
  return pelelanganData;
}

/**
 * Mengambil data pelelangan umum menggunakan PaginationHandler
 */
async function scrapePelelangan() {
  try {
    console.log('Memulai scraping pelelangan umum...');
    
    // Buat instance PaginationHandler
    const paginationHandler = new PaginationHandler(
      'https://civd.skkmigas.go.id/',
      'bid'
    );
    
    // Scrape semua halaman
    const allPelelanganData = await paginationHandler.scrapeAllPages(extractPelelanganFromHtml);
    
    // Hapus duplikat dan return hasil
    const uniquePelelangan = removeDuplicates(allPelelanganData);
    console.log(`Total data yang berhasil dikumpulkan: ${uniquePelelangan.length}`);
    
    return uniquePelelangan;
  } catch (error) {
    console.error('Error saat scraping pelelangan:', error.message);
    throw error;
  }
}

/**
 * Mengambil data pelelangan umum dengan Puppeteer
 */
async function scrapePelelanganWithPuppeteer() {
  try {
    console.log('Menggunakan Puppeteer untuk scraping pelelangan dengan navigasi AJAX...');
    
    // Daftar pelelangan dari semua halaman
    const allPelelanganData = [];
    
    // Set untuk melacak judul pelelangan yang sudah dikumpulkan (untuk mencegah duplikasi)
    const processedTitles = new Set();
    
    // Ekstrak data dari halaman pertama dan deteksi total halaman
    console.log('Mengakses halaman awal...');
    let browser = await puppeteer.launch({
      headless: false, // false untuk debugging
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--window-size=1920,1080'
      ]
    });
    
    try {
      const page = await browser.newPage();
      
      // Set viewport dan user agent
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
      
      // Fungsi untuk menunggu dengan timeout
      const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
      
      // Fungsi ekstraksi data untuk satu halaman
      const extractPageData = () => {
      const pelelanganData = [];
      
      // Cari cards data pelelangan
      const pelelanganCards = document.querySelectorAll('#bid .card');
      
      pelelanganCards.forEach(card => {
        const cardBody = card.querySelector('.card-body');
        
        try {
          // Verifikasi bahwa ini adalah card Pelelangan Umum
          const cardSubtitle = cardBody.querySelector('small.card-subtitle');
          const cardType = cardSubtitle.querySelector('span')?.textContent.trim() || '';
          if (!cardType.includes('Pelelangan Umum')) {
            return; // Skip jika bukan Pelelangan Umum
          }
          
          // Ekstrak informasi dari card
          const title = cardBody.querySelector('h5.card-title').textContent.trim();
          const subtitle = cardBody.querySelector('small.card-subtitle').textContent;
          const dateMatch = subtitle.match(/Tayang hingga\s+([^,]+)/);
          const date = dateMatch ? dateMatch[1].trim() : '';
          const kkks = cardBody.querySelector('small.card-subtitle strong i').textContent.trim();
          
          // Mencari bidang usaha
          let bidangUsaha = '';
          const typeSpans = cardBody.querySelectorAll('.tipe span');
          typeSpans.forEach(span => {
            if (span.textContent.includes('Bidang Usaha')) {
              bidangUsaha = span.textContent.replace('Bidang Usaha', '').trim();
            }
          });
          
          // Attachment info
          const downloadLink = cardBody.querySelector('a.download-btn');
          const fileId = downloadLink ? downloadLink.getAttribute('data-file-id') : null;
          const fileUrl = downloadLink ? downloadLink.getAttribute('data-url') : null;
          const fileName = downloadLink ? downloadLink.getAttribute('data-name') : null;
          
          const pelelangan = {
            id: '',
            judul: title,
            tanggal: date,
            kkks: kkks,
            bidangUsaha: bidangUsaha,
            batasWaktu: date,
            url: fileId,
            attachmentUrl: fileUrl,
            attachmentName: fileName
          };
          
          pelelanganData.push(pelelangan);
        } catch (err) {
          console.log('Error parsing card:', err.message);
        }
      });
      
      return pelelanganData;
      };
      
      // Fungsi untuk memproses halaman saat ini
      const processCurrentPage = async () => {
        // Tunggu konten dimuat dan scroll ke bagian yang relevan
        await wait(2000);
        
        // Scroll ke section bid
        await page.evaluate(() => {
          const element = document.getElementById('bid');
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        });
        
        await wait(2000);
        
        // Ekstrak nomor halaman saat ini
        const currentPageNumber = await page.evaluate(() => {
          const activePageElement = document.querySelector('.pagination .active');
          if (activePageElement) {
            const pageText = activePageElement.innerText.trim();
            if (!isNaN(parseInt(pageText))) {
              return parseInt(pageText);
            }
          }
          return 1; // Default ke halaman 1 jika tidak ditemukan
        });
        
        console.log(`Memproses halaman pelelangan ${currentPageNumber}...`);
        
        // Ambil screenshot untuk debug
        try {
          await page.screenshot({ path: `screenshot-pelelangan-page-${currentPageNumber}.png` });
        } catch (err) {
          console.log(`Error saat mengambil screenshot: ${err.message}`);
        }
        
        // Ekstrak data dari halaman saat ini
        const pageData = await page.evaluate(extractPageData);
        
        if (pageData && pageData.length > 0) {
          console.log(`Ditemukan ${pageData.length} pelelangan di halaman ${currentPageNumber}`);
          
          // Filter pelelangan yang belum diproses untuk menghindari duplikasi
          const newPelelangan = pageData.filter(pelelangan => !processedTitles.has(pelelangan.judul));
          
          if (newPelelangan.length > 0) {
            console.log(`Menambahkan ${newPelelangan.length} pelelangan baru ke hasil`);
            
            // Tambahkan judul pelelangan ke set yang sudah diproses
            newPelelangan.forEach(pelelangan => processedTitles.add(pelelangan.judul));
            
            // Tambahkan pelelangan ke hasil
            allPelelanganData.push(...newPelelangan);
            return true; // Ada data baru ditemukan
          } else {
            console.log('Tidak ada pelelangan baru ditemukan di halaman ini');
            return false; // Tidak ada data baru, mungkin sudah mencapai akhir
          }
        } else {
          console.log(`Tidak ada data ditemukan di halaman ${currentPageNumber}`);
          return false; // Tidak ada data, mungkin halaman kosong
        }
      };
      
      // Fungsi untuk melakukan navigasi dengan metode force reload
      const navigateWithForceReload = async (pageNumber) => {
        const baseUrl = PATHS.PELELANGAN.split('#')[0];
        // Buat array dari kemungkinan URL yang bisa dicoba
        const possibleUrls = [
          `${baseUrl}?page=${pageNumber}#bid`,
          `${baseUrl}index.jwebs?page=${pageNumber}#bid`,
          `${baseUrl}?hal=${pageNumber}#bid`,
          `${baseUrl}index.jwebs?hal=${pageNumber}#bid`,
          `${baseUrl}?p=${pageNumber}#bid`,
          `${baseUrl}index.jwebs?p=${pageNumber}#bid`
        ];
        
        for (const url of possibleUrls) {
          console.log(`Mencoba akses URL: ${url}`);
          
          // Buka URL dengan waitUntil networkidle2 untuk memastikan semua request selesai
          await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
          
          // Tunggu konten dimuat
          await wait(5000);
          
          // Verifikasi jika konten sudah dimuat dengan benar
          const hasContent = await page.evaluate(() => {
            const pelelanganCards = document.querySelectorAll('#bid .card');
            return pelelanganCards.length > 0;
          });
          
          if (hasContent) {
            console.log(`Berhasil memuat konten dengan URL: ${url}`);
            
            // Verifikasi halaman yang sedang aktif
            const currentPage = await page.evaluate(() => {
              const activePageElement = document.querySelector('.pagination .active');
              if (activePageElement) {
                const pageText = activePageElement.innerText.trim();
                if (!isNaN(parseInt(pageText))) {
                  return parseInt(pageText);
                }
              }
              return null;
            });
            
            if (currentPage === pageNumber) {
              console.log(`Berhasil navigasi ke halaman ${pageNumber} dengan URL`);
              return true;
            } else {
              console.log(`Halaman aktif di UI adalah ${currentPage || 'tidak diketahui'}, bukan ${pageNumber} yang diharapkan`);
            }
          } else {
            console.log(`Tidak ada konten tender pada URL: ${url}`);
          }
        }
        
        console.log(`Gagal navigasi ke halaman ${pageNumber} dengan semua URL yang dicoba`);
        return false;
      };
      
      // Mengakses halaman utama
      console.log(`Navigasi ke ${PATHS.PELELANGAN}...`);
      await page.goto(PATHS.PELELANGAN, { waitUntil: 'networkidle2' });
      
      // Tunggu halaman dimuat sepenuhnya
      await page.waitForSelector('body');
      
      // Ekstrak jumlah halaman maksimum dari UI pagination
      const maxPagesFromUI = await page.evaluate(() => {
        const pageButtons = Array.from(document.querySelectorAll('.pagination .page-item a, a.uibutton.ajax'))
          .filter(btn => !isNaN(parseInt(btn.innerText.trim())))
          .map(btn => parseInt(btn.innerText.trim()));
        
        if (pageButtons.length > 0) {
          return Math.max(...pageButtons);
        }
        
        // Cek jika ada tombol Last (») dan title/data-page yang mungkin mengandung nomor halaman terakhir
        const lastButton = Array.from(document.querySelectorAll('.pagination .page-item a')).find(a => 
          a.innerText.trim() === '»' || a.innerText.trim() === '>>' || a.innerText.trim() === 'Last'
        );
        
        if (lastButton) {
          const dataPage = lastButton.getAttribute('data-page');
          const title = lastButton.getAttribute('title');
          
          if (dataPage && !isNaN(parseInt(dataPage))) {
            return parseInt(dataPage);
          }
          
          if (title) {
            const match = title.match(/[0-9]+/);
            if (match) {
              return parseInt(match[0]);
            }
          }
        }
        
        // Default to 10 pages jika tidak bisa menentukan
        return 10;
      });
      
      console.log(`Terdeteksi maksimum ${maxPagesFromUI} halaman dari UI`);
      
      // Mulai dengan memproses halaman pertama
      let foundNewData = await processCurrentPage();
      let maxPages = Math.min(maxPagesFromUI, 15); // Batasi maksimum 15 halaman
      
      // Proses halaman-halaman berikutnya dengan metode force reload
      for (let pageNum = 2; pageNum <= maxPages; pageNum++) {
        if (!foundNewData) {
          console.log('Tidak ada data baru ditemukan, berhenti scraping');
          break;
        }
        
        console.log(`Mencoba navigasi ke halaman ${pageNum} dengan metode force reload...`);
        const navigated = await navigateWithForceReload(pageNum);
        
        if (navigated) {
          foundNewData = await processCurrentPage();
        } else {
          console.log(`Gagal navigasi ke halaman ${pageNum}, mencoba halaman berikutnya`);
          // Teruskan mencoba ke halaman berikutnya
        }
      }
      
      // Alternatif pendekatan manual URL - mungkin ada pola URL sederhana yang bisa kita coba
      if (allPelelanganData.length <= 2) {
        console.log("Coba pendekatan alternatif dengan URL langsung tanpa parameter halaman");
        
        // Array kemungkinan path API yang mungkin digunakan
        const possibleApiPaths = [
          '/api/tender/list?type=pelelangan',
          '/api/tender/pelelangan',
          '/api/tender',
          '/api/bid',
          '/api/pelelangan'
        ];
        
        for (const apiPath of possibleApiPaths) {
          const url = `https://civd.skkmigas.go.id${apiPath}`;
          console.log(`Mencoba akses API langsung: ${url}`);
          
          try {
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 10000 });
            
            // Cek apakah response berisi data yang diharapkan (JSON)
            const responseData = await page.evaluate(() => {
              try {
                const text = document.body.innerText;
                return JSON.parse(text);
              } catch (e) {
                return null;
              }
            });
            
            if (responseData && (Array.isArray(responseData) || Array.isArray(responseData.data))) {
              console.log('Berhasil mendapatkan data dari API:', responseData);
              // Proses data API di sini jika diperlukan
              break;
            }
          } catch (err) {
            console.log(`Error saat mengakses ${url}: ${err.message}`);
          }
        }
      }
    } finally {
      await browser.close();
    }
    
    console.log(`Total pelelangan ditemukan dari semua halaman: ${allPelelanganData.length}`);
    return allPelelanganData;
  } catch (error) {
    console.error('Error saat scraping pelelangan dengan Puppeteer:', error.message);
    throw error;
  }
}

module.exports = {
  scrapePelelangan,
  scrapePelelanganWithPuppeteer
}; 