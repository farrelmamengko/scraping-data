const axios = require('axios');
const cheerio = require('cheerio');
const { PATHS, getScraperApiUrl } = require('../utils/config');
const { scrapWithPuppeteer, scrapMultiPageWithPuppeteer } = require('../utils/puppeteerScraper');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { mergeData, cleanFileName, saveToCSV, saveToCsv, saveJsonDebug, removeDuplicates } = require('../utils/helpers');
const PaginationHandler = require('../utils/paginationHandler');

/**
 * Scraper untuk Undangan Prakualifikasi CIVD SKK Migas
 * 
 * Menggunakan pendekatan Puppeteer untuk scraping dengan navigasi
 * halaman menggunakan paginasi.
 */

/**
 * Mendapatkan cookies yang valid menggunakan Puppeteer
 * @returns {Promise<string>} Cookie string yang bisa digunakan untuk request
 */
async function getValidCookies() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    await page.goto('https://civd.skkmigas.go.id/index.jwebs', { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    const cookies = await page.cookies();
    return cookies.map(c => `${c.name}=${c.value}`).join('; ');
  } finally {
    await browser.close();
  }
}

/**
 * Scrape data dengan menggunakan cookies yang valid
 * @param {string} cookieString Cookies yang valid
 * @param {number} pageNumber Nomor halaman
 * @returns {Promise<Array>} Data tender
 */
async function scrapeWithCookies(cookieString, pageNumber) {
  const url = `${PATHS.PRAKUALIFIKASI}?page=${pageNumber}`;
  
  try {
    const response = await axios.get(url, {
      headers: {
        'Cookie': cookieString,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 30000
    });

    if (response.status === 200) {
      console.log('Response HTML:', response.data);
      const $ = cheerio.load(response.data);
      return extractTendersFromHtml($);
    }
    return [];
  } catch (error) {
    console.error(`Error saat scraping halaman ${pageNumber}:`, error.message);
    return [];
  }
}

/**
 * Mengambil data undangan prakualifikasi menggunakan ScraperAPI dan Axios
 * Jika gagal, akan menggunakan Puppeteer sebagai fallback
 * 
 * @returns {Promise<Array>} Array berisi data tender
 */
async function scrapePrakualifikasi(maxPages = 14) {
  try {
    console.log('Memulai scraping undangan prakualifikasi...');
    
    // Dapatkan cookies yang valid
    console.log('Mendapatkan cookies yang valid...');
    const cookieString = await getValidCookies();
    
    let allTenderData = [];
    
    // Scrape menggunakan AJAX endpoint
    for (let page = 1; page <= maxPages; page++) {
      console.log(`Mengambil data dari halaman ${page}...`);
      const tenders = await scrapeWithAjax(cookieString, page);
      
      if (tenders.length > 0) {
        allTenderData = allTenderData.concat(tenders);
        console.log(`Berhasil mengekstrak ${tenders.length} data dari halaman ${page}`);
      } else {
        console.log(`Tidak ada data di halaman ${page}, berhenti scraping`);
        break;
      }
    }
    
    // Hapus duplikat dan return hasil
    const uniqueTenders = removeDuplicates(allTenderData);
    console.log(`Total data yang berhasil dikumpulkan: ${uniqueTenders.length}`);
    
    return uniqueTenders;
  } catch (error) {
    console.error('Error saat scraping prakualifikasi:', error.message);
    throw error;
  }
}

async function scrapeWithAjax(cookieString, pageNumber) {
  const url = 'https://civd.skkmigas.go.id/ajax/search/tnd.jwebs';
  
  try {
    const response = await axios.post(url, 
      `type=1&page=${pageNumber}`, // type 1 adalah untuk Prakualifikasi
      {
        headers: {
          'Cookie': cookieString,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        timeout: 30000
      }
    );

    if (response.status === 200) {
      console.log('Response HTML:', response.data);
      const $ = cheerio.load(response.data);
      return extractTendersFromHtml($);
    }
    return [];
  } catch (error) {
    console.error(`Error saat scraping halaman ${pageNumber}:`, error.message);
    return [];
  }
}

/**
 * Ekstrak data tender dari HTML menggunakan Cheerio
 * 
 * @param {CheerioAPI} $ Instance Cheerio 
 * @returns {Array} Array berisi data tender
 */
function extractTendersFromHtml($) {
  const tenders = [];
  
  // Cari semua card prakualifikasi
  $('#invitation .card').each((i, element) => {
    try {
      const card = $(element);
      const cardBody = card.find('.card-body');
      
        // Verifikasi bahwa ini adalah card Undangan Prakualifikasi
      const cardType = cardBody.find('.badge').text().trim();
        if (!cardType.includes('Undangan Prakualifikasi')) {
          return; // Skip jika bukan Undangan Prakualifikasi
        }
      
      // Ekstrak data tender
      const title = cardBody.find('h5').text().trim();
      const kkks = cardBody.find('strong i').text().trim();
      
      // Ekstrak tanggal dari text Tayang hingga
      let tanggal = '';
      let batasWaktu = '';
      const dateText = cardBody.find('small').text();
      const dateMatch = dateText.match(/Tayang hingga (\d+ [A-Za-z]+ \d+)/);
      if (dateMatch && dateMatch[1]) {
        tanggal = dateMatch[1].trim();
        batasWaktu = dateMatch[1].trim();
      }
      
      // Ekstrak bidang usaha
      const bidangUsaha = cardBody.find('.field').text().trim();
      
      // Ekstrak URL dan attachment
      const attachmentLink = cardBody.find('a.btn-secondary, a.download-btn');
      const fileId = attachmentLink.attr('data-file-id') || null;
      const fileUrl = attachmentLink.attr('data-url') || null;
      const fileName = attachmentLink.attr('data-name') || null;
        
        const tender = {
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
      
      tenders.push(tender);
      } catch (err) {
        console.log('Error parsing card:', err.message);
      }
    });
    
  return tenders;
}

/**
 * Ekstrak data tender dari tabel HTML (format AJAX)
 * 
 * @param {CheerioAPI} $ Instance Cheerio 
 * @returns {Array} Array berisi data tender
 */
function extractTendersFromTableHtml($) {
  const tenders = [];
  
  // Cari semua baris tabel
  $('table tbody tr').each((i, row) => {
    try {
      const cells = $(row).find('td');
      
      if (cells.length >= 5) {
        const tanggal = $(cells[1]).text().trim();
        const judul = $(cells[2]).text().trim();
        const kkks = $(cells[3]).text().trim();
        const bidangUsaha = $(cells[4]).text().trim();
        const batasWaktu = $(cells[5]).text().trim() || tanggal;
        
        let url = '';
        let attachmentUrl = '';
        let attachmentName = '';
        
        // Cek link pada judul
        const titleLink = $(cells[2]).find('a');
        if (titleLink.length) {
          url = titleLink.attr('href') || '';
        }
        
        // Cek link attachment
        const attachmentLink = $(cells[6]).find('a');
        if (attachmentLink.length) {
          attachmentUrl = attachmentLink.attr('href') || '';
          attachmentName = attachmentLink.text().trim() || '';
        }
        
        const tender = {
          id: '',
          judul: judul,
          tanggal: tanggal,
          kkks: kkks,
          bidangUsaha: bidangUsaha,
          batasWaktu: batasWaktu,
          url: url,
          attachmentUrl: attachmentUrl,
          attachmentName: attachmentName
        };
        
        tenders.push(tender);
      }
    } catch (error) {
      console.error(`Error saat parsing baris tabel: ${error.message}`);
    }
  });
  
  return tenders;
}

/**
 * Mengambil data undangan prakualifikasi dengan Puppeteer
 * Digunakan sebagai fallback jika ScraperAPI gagal
 */
async function scrapePrakualifikasiWithPuppeteer(maxPages = 14) {
  try {
    console.log('Menggunakan Puppeteer untuk scraping prakualifikasi dengan navigasi AJAX...');
    
    // Variabel untuk retry
    const maxRetries = 3;
    let currentRetry = 0;
    
    // Fungsi untuk menjalankan scraper dengan retry jika gagal
    const runWithRetry = async () => {
      try {
        // Buka browser baru
        const browser = await puppeteer.launch({
          headless: false, // Gunakan mode non-headless agar terlihat prosesnya
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--start-maximized'],
          defaultViewport: { width: 1366, height: 768 }
    });
    
    try {
          // Buka halaman baru
      const page = await browser.newPage();
      
          // Set timeout lebih panjang untuk halaman yang lambat
          page.setDefaultTimeout(60000);
          
          // Fungsi untuk delay
          const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
          
          // Set user agent
          await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36');
          
          // Navigasi ke halaman prakualifikasi
          console.log(`Navigasi ke halaman utama: https://civd.skkmigas.go.id/`);
          await page.goto('https://civd.skkmigas.go.id/', { waitUntil: 'networkidle2' });
          
          // Tunggu halaman sepenuhnya dimuat
          await page.waitForSelector('#invitation', { timeout: 30000 });
          console.log('Halaman utama berhasil dimuat');
          
          // Array untuk menyimpan semua data tender
          let allTenderData = [];
          
          // Ekstrak data dari halaman pertama
          console.log('Mengekstrak data dari halaman pertama...');
          let pageData = await page.evaluate(() => {
            const extractDataFromPage = () => {
      const tenderData = [];
      
              // Cari semua card prakualifikasi di halaman
              const cards = document.querySelectorAll('.card-body');
      
              cards.forEach(card => {
        try {
          // Verifikasi bahwa ini adalah card Undangan Prakualifikasi
                  const cardType = card.querySelector('.badge');
                  if (!cardType || !cardType.textContent.includes('Undangan Prakualifikasi')) {
            return; // Skip jika bukan Undangan Prakualifikasi
          }
          
                  // Ekstrak data tender
                  const title = card.querySelector('h5') ? card.querySelector('h5').textContent.trim() : '';
                  const kkksElement = card.querySelector('strong i');
                  const kkks = kkksElement ? kkksElement.textContent.trim() : '';
                  
                  // Ekstrak tanggal dari text Tayang hingga
                  let tanggal = '';
                  let batasWaktu = '';
                  const dateText = card.querySelector('small')?.textContent || '';
                  const dateMatch = dateText.match(/Tayang hingga (\d+ [A-Za-z]+ \d+)/);
                  if (dateMatch && dateMatch[1]) {
                    tanggal = dateMatch[1].trim();
                    batasWaktu = dateMatch[1].trim();
                  }
                  
                  // Ekstrak bidang usaha
                  const bidangUsahaElement = card.querySelector('.field');
                  const bidangUsaha = bidangUsahaElement ? bidangUsahaElement.textContent.trim() : '';
                  
                  // Ekstrak URL dan attachment
                  const attachmentLink = card.querySelector('a.btn-secondary, a.download-btn');
                  const attachmentUrl = attachmentLink ? attachmentLink.getAttribute('href') || attachmentLink.getAttribute('data-url') || '' : '';
                  const attachmentName = attachmentLink ? attachmentLink.getAttribute('data-name') || attachmentLink.textContent.trim() || '' : '';
                  const fileId = attachmentLink ? attachmentLink.getAttribute('data-file-id') || '' : '';
          
          const tender = {
            id: '',
            judul: title,
                    tanggal: tanggal,
            kkks: kkks,
            bidangUsaha: bidangUsaha,
                    batasWaktu: batasWaktu,
            url: fileId,
                    attachmentUrl: attachmentUrl,
                    attachmentName: attachmentName
          };
          
          tenderData.push(tender);
        } catch (err) {
          console.log('Error parsing card:', err.message);
        }
      });
      
      return tenderData;
      };
      
            return extractDataFromPage();
          });
          
          console.log(`Halaman 1: ditemukan ${pageData.length} data`);
          
          // Tambahkan data dari halaman pertama ke array hasil
          allTenderData = allTenderData.concat(pageData);
          
          // Cek berapa total halaman
          const totalPages = await page.evaluate(() => {
            const pagination = document.querySelector('.pagination');
            if (pagination) {
              const pageItems = pagination.querySelectorAll('li');
              if (pageItems.length > 2) {
                // Ambil nomor halaman terakhir (biasanya item kedua dari belakang)
                const lastPageItem = pageItems[pageItems.length - 2];
                const lastPageNum = parseInt(lastPageItem.textContent.trim());
                return lastPageNum || 14; // Default 14 jika tidak bisa diparse
              }
            }
            return 14; // Default 14 halaman
          });
          
          console.log(`Terdeteksi ${totalPages} halaman pagination`);
          
          // Batasi jumlah halaman yang akan di-scrape
          const pagesToScrape = Math.min(maxPages, totalPages);
          
          // Loop melalui halaman 2 sampai pagesToScrape
          for (let pageNum = 2; pageNum <= pagesToScrape; pageNum++) {
            console.log(`Memproses halaman ${pageNum}...`);
            
            try {
              // Coba klik tombol pagination halaman berikutnya
              const pageSelector = `.pagination li:nth-child(${pageNum + 1}) a`;
              
              // Verifikasi apakah link halaman ada
              const hasPageLink = await page.evaluate((sel) => {
                const link = document.querySelector(sel);
                return !!link;
              }, pageSelector);
              
              if (hasPageLink) {
                // Klik link halaman dan tunggu navigasi selesai
                console.log(`Mengklik tombol halaman ${pageNum}...`);
                
                // Coba click dengan navigation wait
                try {
                  await Promise.all([
                    page.click(pageSelector),
                    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 })
                  ]);
                } catch (clickError) {
                  // Jika gagal dengan click biasa, coba metode alternatif
                  console.log(`Error saat klik halaman ${pageNum}, mencoba metode alternatif: ${clickError.message}`);
                  
                  // Metode alternatif: evaluateHandle untuk klik
                  await page.evaluateHandle((sel) => {
                    const link = document.querySelector(sel);
                    if (link) link.click();
                  }, pageSelector);
                  
                  // Tunggu konten halaman dimuat
                  await sleep(3000);
                  await page.waitForSelector('#invitation', { timeout: 15000 });
                }
              } else {
                // Jika link tidak ditemukan, coba navigasi langsung ke URL
                console.log(`Link halaman ${pageNum} tidak ditemukan, mencoba navigasi URL langsung...`);
                
                const pageUrl = `https://civd.skkmigas.go.id/?page=${pageNum}#invitation`;
                await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 30000 });
              }
              
              // Verifikasi bahwa kita berada di halaman yang benar
              const currentPageNum = await page.evaluate(() => {
                const activePage = document.querySelector('.pagination .active');
                if (activePage) {
                  return parseInt(activePage.textContent.trim());
              }
              return null;
            });
            
              if (currentPageNum === pageNum) {
                console.log(`Berhasil navigasi ke halaman ${pageNum}`);
            } else {
                console.log(`Navigasi menghasilkan halaman ${currentPageNum || 'tidak diketahui'} bukan ${pageNum}`);
              }
              
              // Tunggu konten dimuat
              await sleep(2000);
              
              // Ekstrak data dari halaman saat ini
              const pageData = await page.evaluate(() => {
                const extractDataFromPage = () => {
                  const tenderData = [];
                  
                  // Cari semua card prakualifikasi di halaman
                  const cards = document.querySelectorAll('.card-body');
                  
                  cards.forEach(card => {
                    try {
                      // Verifikasi bahwa ini adalah card Undangan Prakualifikasi
                      const cardType = card.querySelector('.badge');
                      if (!cardType || !cardType.textContent.includes('Undangan Prakualifikasi')) {
                        return; // Skip jika bukan Undangan Prakualifikasi
                      }
                      
                      // Ekstrak data tender
                      const title = card.querySelector('h5') ? card.querySelector('h5').textContent.trim() : '';
                      const kkksElement = card.querySelector('strong i');
                      const kkks = kkksElement ? kkksElement.textContent.trim() : '';
                      
                      // Ekstrak tanggal dari text Tayang hingga
                      let tanggal = '';
                      let batasWaktu = '';
                      const dateText = card.querySelector('small')?.textContent || '';
                      const dateMatch = dateText.match(/Tayang hingga (\d+ [A-Za-z]+ \d+)/);
                      if (dateMatch && dateMatch[1]) {
                        tanggal = dateMatch[1].trim();
                        batasWaktu = dateMatch[1].trim();
                      }
                      
                      // Ekstrak bidang usaha
                      const bidangUsahaElement = card.querySelector('.field');
                      const bidangUsaha = bidangUsahaElement ? bidangUsahaElement.textContent.trim() : '';
                      
                      // Ekstrak URL dan attachment
                      const attachmentLink = card.querySelector('a.btn-secondary, a.download-btn');
                      const attachmentUrl = attachmentLink ? attachmentLink.getAttribute('href') || attachmentLink.getAttribute('data-url') || '' : '';
                      const attachmentName = attachmentLink ? attachmentLink.getAttribute('data-name') || attachmentLink.textContent.trim() || '' : '';
                      const fileId = attachmentLink ? attachmentLink.getAttribute('data-file-id') || '' : '';
                      
                      const tender = {
                        id: '',
                        judul: title,
                        tanggal: tanggal,
                        kkks: kkks,
                        bidangUsaha: bidangUsaha,
                        batasWaktu: batasWaktu,
                        url: fileId,
                        attachmentUrl: attachmentUrl,
                        attachmentName: attachmentName
                      };
                      
                      tenderData.push(tender);
                    } catch (err) {
                      console.log('Error parsing card:', err.message);
                    }
                  });
                  
                  return tenderData;
                };
                
                return extractDataFromPage();
              });
              
              console.log(`Halaman ${pageNum}: ditemukan ${pageData.length} data`);
              
              // Tambahkan data ke array hasil
              allTenderData = allTenderData.concat(pageData);
              
              // Jika tidak ada data pada halaman ini, mungkin sudah mencapai akhir
              if (pageData.length === 0) {
                console.log(`Tidak ditemukan data di halaman ${pageNum}, mencoba pendekatan alternatif...`);
                
                // Coba pendekatan AJAX untuk halaman ini
                try {
                  const ajaxUrl = `https://civd.skkmigas.go.id/ajax/search/tnd.jwebs?type=1&d-1789-p=${pageNum}`;
                  console.log(`Mengakses AJAX URL untuk halaman ${pageNum}: ${ajaxUrl}`);
                  
                  await page.goto(ajaxUrl, { waitUntil: 'networkidle2', timeout: 30000 });
                  await sleep(2000);
                  
                  // Ekstrak data dari respons AJAX (biasanya dalam format tabel)
                  const ajaxData = await page.evaluate(() => {
                    const tableData = [];
                    const rows = document.querySelectorAll('table tbody tr');
                    
                    rows.forEach(row => {
                      const cells = row.querySelectorAll('td');
                      if (cells.length >= 5) {
                        const tender = {
                          id: '',
                          tanggal: cells[1] ? cells[1].textContent.trim() : '',
                          judul: cells[2] ? cells[2].textContent.trim() : '',
                          kkks: cells[3] ? cells[3].textContent.trim() : '',
                          bidangUsaha: cells[4] ? cells[4].textContent.trim() : '',
                          batasWaktu: cells[5] ? cells[5].textContent.trim() : '',
                          url: '',
                          attachmentUrl: '',
                          attachmentName: ''
                        };
                        
                        // Cek link judul
                        if (cells[2]) {
                          const titleLink = cells[2].querySelector('a');
                          if (titleLink) {
                            tender.url = titleLink.getAttribute('href') || '';
                          }
                        }
                        
                        // Cek link attachment
                        if (cells[6]) {
                          const attachmentLink = cells[6].querySelector('a');
                          if (attachmentLink) {
                            tender.attachmentUrl = attachmentLink.getAttribute('href') || '';
                            tender.attachmentName = attachmentLink.textContent.trim() || '';
                          }
                        }
                        
                        tableData.push(tender);
                      }
                    });
                    
                    return tableData;
                  });
                  
                  console.log(`AJAX halaman ${pageNum}: ditemukan ${ajaxData.length} data`);
                  
                  // Tambahkan data AJAX ke array hasil
                  allTenderData = allTenderData.concat(ajaxData);
                  
                  // Kembali ke halaman utama untuk halaman berikutnya
                  await page.goto('https://civd.skkmigas.go.id/', { waitUntil: 'networkidle2', timeout: 30000 });
                  await page.waitForSelector('#invitation', { timeout: 30000 });
                } catch (ajaxError) {
                  console.log(`Error saat mengakses AJAX URL untuk halaman ${pageNum}: ${ajaxError.message}`);
                }
              }
            } catch (pageError) {
              console.log(`Error saat memproses halaman ${pageNum}: ${pageError.message}`);
              continue; // Lanjutkan ke halaman berikutnya meskipun ada error
            }
          }
          
          // Jika masih kurang dari 20 data, coba pendekatan batch dengan parameter s=100
          if (allTenderData.length < 20) {
            console.log(`Ditemukan ${allTenderData.length} data dari paginasi standar, mencoba pendekatan batch...`);
            
            try {
              const batchUrl = `https://civd.skkmigas.go.id/ajax/search/tnd.jwebs?type=1&d-1789-s=100`;
              console.log(`Navigasi ke batch URL: ${batchUrl}`);
              
              await page.goto(batchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
              await sleep(3000);
              
              // Ekstrak data dari halaman batch
              const batchData = await page.evaluate(() => {
                const tableData = [];
                const rows = document.querySelectorAll('table tbody tr');
                
                rows.forEach(row => {
                  const cells = row.querySelectorAll('td');
                  if (cells.length >= 5) {
                    const tender = {
                      id: '',
                      tanggal: cells[1] ? cells[1].textContent.trim() : '',
                      judul: cells[2] ? cells[2].textContent.trim() : '',
                      kkks: cells[3] ? cells[3].textContent.trim() : '',
                      bidangUsaha: cells[4] ? cells[4].textContent.trim() : '',
                      batasWaktu: cells[5] ? cells[5].textContent.trim() : '',
                      url: '',
                      attachmentUrl: '',
                      attachmentName: ''
                    };
                    
                    // Cek link judul
                    if (cells[2]) {
                      const titleLink = cells[2].querySelector('a');
                      if (titleLink) {
                        tender.url = titleLink.getAttribute('href') || '';
                      }
                    }
                    
                    // Cek link attachment
                    if (cells[6]) {
                      const attachmentLink = cells[6].querySelector('a');
                      if (attachmentLink) {
                        tender.attachmentUrl = attachmentLink.getAttribute('href') || '';
                        tender.attachmentName = attachmentLink.textContent.trim() || '';
                      }
                    }
                    
                    tableData.push(tender);
                  }
                });
                
                return tableData;
              });
              
              console.log(`Ditemukan ${batchData.length} data dari batch URL`);
              
              // Tambahkan data dari batch ke hasil total
              allTenderData = allTenderData.concat(batchData);
            } catch (error) {
              console.log(`Error saat mengakses batch URL: ${error.message}`);
            }
          }
          
          // Hapus duplikat berdasarkan judul
          console.log(`Total data tender sebelum penghapusan duplikat: ${allTenderData.length}`);
          const uniqueTenders = {};
          
          // Gunakan judul sebagai kunci untuk menghapus duplikat
          allTenderData.forEach(tender => {
            if (!tender.judul) return;
            
            const key = tender.judul.trim();
            
            if (!uniqueTenders[key] || 
                // Jika tender baru lebih lengkap, ganti yang lama
                Object.values(tender).filter(v => v && v.trim() !== '').length > 
                Object.values(uniqueTenders[key]).filter(v => v && v.trim() !== '').length) {
              uniqueTenders[key] = tender;
            }
          });
          
          // Konversi kembali ke array
          const finalTenderData = Object.values(uniqueTenders);
          
          console.log(`Total data tender setelah penghapusan duplikat: ${finalTenderData.length}`);
          
          // Debug: simpan data yang berhasil dikumpulkan
          saveJsonDebug(finalTenderData, 'prakualifikasi_puppeteer_data');
          
          // Tutup browser
          await browser.close();
          
          return finalTenderData;
        } catch (error) {
          console.error(`Error saat scraping: ${error.message}`);
          // Tutup browser sebelum melempar error
          await browser.close();
          throw error;
        }
      } catch (error) {
        console.error(`Error saat menjalankan browser: ${error.message}`);
        throw error;
      }
    };
    
    // Jalankan dengan retry jika gagal
    let tenderData = [];
    let success = false;
    
    while (!success && currentRetry < maxRetries) {
      try {
        console.log(`Percobaan #${currentRetry + 1}...`);
        tenderData = await runWithRetry();
        success = true;
      } catch (error) {
        currentRetry++;
        console.error(`Percobaan #${currentRetry} gagal: ${error.message}`);
        
        if (currentRetry < maxRetries) {
          console.log(`Mencoba lagi dalam 5 detik...`);
          await new Promise(resolve => setTimeout(resolve, 5000));
        } else {
          console.error(`Semua ${maxRetries} percobaan gagal.`);
          throw error;
        }
      }
    }
    
    return tenderData;
  } catch (error) {
    console.error(`Fatal error pada scraper prakualifikasi: ${error.message}`);
    throw error;
  }
}

/**
 * Mengambil data undangan prakualifikasi menggunakan PaginationHandler
 */
async function scrapePrakualifikasi() {
  try {
    console.log('Memulai scraping undangan prakualifikasi...');
    
    // Buat instance PaginationHandler
    const paginationHandler = new PaginationHandler(
      'https://civd.skkmigas.go.id/',
      'invitation'
    );
    
    // Scrape semua halaman
    const allTenderData = await paginationHandler.scrapeAllPages(extractTendersFromHtml);
    
    // Hapus duplikat dan return hasil
    const uniqueTenders = removeDuplicates(allTenderData);
    console.log(`Total data yang berhasil dikumpulkan: ${uniqueTenders.length}`);
    
    return uniqueTenders;
  } catch (error) {
    console.error('Error saat scraping prakualifikasi:', error.message);
    throw error;
  }
}

module.exports = {
  scrapePrakualifikasi,
  scrapePrakualifikasiWithPuppeteer
}; 