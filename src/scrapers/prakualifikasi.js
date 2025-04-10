const axios = require('axios');
const cheerio = require('cheerio');
const { PATHS, getScraperApiUrl } = require('../utils/config');
const { scrapWithPuppeteer } = require('../utils/puppeteerScraper');

/**
 * Mengambil data undangan prakualifikasi dari CIVD SKK Migas
 */
async function scrapePrakualifikasi() {
  try {
    const url = getScraperApiUrl(PATHS.PRAKUALIFIKASI);
    const response = await axios.get(url);
    const html = response.data;
    
    // Parse HTML dengan cheerio
    const $ = cheerio.load(html);
    
    // Array untuk menyimpan hasil
    const tenderData = [];
    
    // Cari data prakualifikasi di section #invitation
    let tenderCards = $('#invitation .card');
    
    tenderCards.each((index, element) => {
      const card = $(element);
      const cardBody = card.find('.card-body');
      
      // Ekstrak data dari card
      try {
        // Verifikasi bahwa ini adalah card Undangan Prakualifikasi
        const cardType = cardBody.find('small.card-subtitle span').text().trim();
        if (!cardType.includes('Undangan Prakualifikasi')) {
          return; // Skip jika bukan Undangan Prakualifikasi
        }
        
        const tender = {
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
        
        tenderData.push(tender);
      } catch (err) {
        console.log('Error parsing card:', err.message);
      }
    });
    
    return tenderData;
  } catch (error) {
    console.error('Error saat scraping prakualifikasi dengan Axios:', error.message);
    console.log('Mencoba dengan Puppeteer...');
    return scrapePrakualifikasiWithPuppeteer();
  }
}

/**
 * Mengambil data undangan prakualifikasi dengan Puppeteer
 */
async function scrapePrakualifikasiWithPuppeteer() {
  try {
    return await scrapWithPuppeteer(PATHS.PRAKUALIFIKASI, () => {
      // Fungsi ini dijalankan di dalam konteks browser
      const tenderData = [];
      
      // Cari cards data prakualifikasi
      const tenderCards = document.querySelectorAll('#invitation .card');
      
      tenderCards.forEach(card => {
        const cardBody = card.querySelector('.card-body');
        
        try {
          // Verifikasi bahwa ini adalah card Undangan Prakualifikasi
          const cardSubtitle = cardBody.querySelector('small.card-subtitle');
          const cardType = cardSubtitle.querySelector('span')?.textContent.trim() || '';
          if (!cardType.includes('Undangan Prakualifikasi')) {
            return; // Skip jika bukan Undangan Prakualifikasi
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
          
          const tender = {
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
          
          tenderData.push(tender);
        } catch (err) {
          console.log('Error parsing card:', err.message);
        }
      });
      
      return tenderData;
    });
  } catch (error) {
    console.error('Error saat scraping prakualifikasi dengan Puppeteer:', error.message);
    throw error;
  }
}

module.exports = {
  scrapePrakualifikasi
}; 