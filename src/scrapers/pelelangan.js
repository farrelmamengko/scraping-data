const axios = require('axios');
const cheerio = require('cheerio');
const { PATHS, getScraperApiUrl } = require('../utils/config');
const { scrapWithPuppeteer } = require('../utils/puppeteerScraper');

/**
 * Mengambil data pelelangan umum dari CIVD SKK Migas
 */
async function scrapePelelangan() {
  try {
    const url = getScraperApiUrl(PATHS.PELELANGAN);
    const response = await axios.get(url);
    const html = response.data;
    
    // Parse HTML dengan cheerio
    const $ = cheerio.load(html);
    
    // Array untuk menyimpan hasil
    const pelelanganData = [];
    
    // Cari data pelelangan di section #bid
    let pelelanganCards = $('#bid .card');
    
    pelelanganCards.each((index, element) => {
      const card = $(element);
      const cardBody = card.find('.card-body');
      
      // Ekstrak data dari card
      try {
        // Verifikasi bahwa ini adalah card Pelelangan Umum
        const cardType = cardBody.find('small.card-subtitle span').text().trim();
        if (!cardType.includes('Pelelangan Umum')) {
          return; // Skip jika bukan Pelelangan Umum
        }
        
        const pelelangan = {
          id: '', // ID tidak selalu tersedia di HTML
          judul: cardBody.find('h5.card-title').text().trim(),
          tanggal: cardBody.find('small.card-subtitle').text().split('Tayang hingga')[1]?.split(',')[0].trim() || '',
          kkks: cardBody.find('small.card-subtitle strong i').text().trim(),
          bidangUsaha: cardBody.find('.tipe .field').text().trim(),
          batasWaktu: cardBody.find('small.card-subtitle').text().split('Tayang hingga')[1]?.split(',')[0].trim() || '',
          url: cardBody.find('a.download-btn').attr('data-file-id') || null,
          attachmentUrl: cardBody.find('a.download-btn').attr('data-url') || null,
          attachmentName: cardBody.find('a.download-btn').attr('data-name') || null
        };
        
        pelelanganData.push(pelelangan);
      } catch (err) {
        console.log('Error parsing card:', err.message);
      }
    });
    
    return pelelanganData;
  } catch (error) {
    console.error('Error saat scraping pelelangan dengan Axios:', error.message);
    console.log('Mencoba dengan Puppeteer...');
    return scrapePelelanganWithPuppeteer();
  }
}

/**
 * Mengambil data pelelangan umum dengan Puppeteer
 */
async function scrapePelelanganWithPuppeteer() {
  try {
    return await scrapWithPuppeteer(PATHS.PELELANGAN, () => {
      // Fungsi ini dijalankan di dalam konteks browser
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
    });
  } catch (error) {
    console.error('Error saat scraping pelelangan dengan Puppeteer:', error.message);
    throw error;
  }
}

module.exports = {
  scrapePelelangan
}; 