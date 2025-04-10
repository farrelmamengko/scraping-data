const axios = require('axios');
const cheerio = require('cheerio');
const { PATHS, getScraperApiUrl } = require('../utils/config');
const { scrapWithPuppeteer } = require('../utils/puppeteerScraper');

/**
 * Mengambil data daftar pengadaan dari CIVD SKK Migas
 */
async function scrapeProcurementList() {
  try {
    const url = getScraperApiUrl(PATHS.PROCUREMENT_LIST);
    const response = await axios.get(url);
    const html = response.data;
    
    // Parse HTML dengan cheerio
    const $ = cheerio.load(html);
    
    // Array untuk menyimpan hasil
    const procurementData = [];
    
    // Cari data daftar pengadaan
    // Berdasarkan struktur HTML sebenarnya dari website
    let procurementCards = $('#proclist .card');
    
    procurementCards.each((index, element) => {
      const card = $(element);
      const cardBody = card.find('.card-body');
      
      // Ekstrak data dari card
      try {
        const procurement = {
          id: '', // ID tidak selalu tersedia di HTML
          judul: cardBody.find('h5.card-title').text().trim(),
          tanggal: cardBody.find('small.card-subtitle').text().split('Tayang hingga')[1].split(',')[0].trim(),
          kkks: cardBody.find('small.card-subtitle strong i').text().trim(),
          url: cardBody.find('a.download-btn').attr('data-file-id') || null,
          attachmentUrl: cardBody.find('a.download-btn').attr('data-url') || null,
          attachmentName: cardBody.find('a.download-btn').attr('data-name') || null
        };
        
        procurementData.push(procurement);
      } catch (err) {
        console.log('Error parsing card:', err.message);
      }
    });
    
    return procurementData;
  } catch (error) {
    console.error('Error saat scraping daftar pengadaan dengan Axios:', error.message);
    console.log('Mencoba dengan Puppeteer...');
    return scrapeProcurementListWithPuppeteer();
  }
}

/**
 * Mengambil data daftar pengadaan dengan Puppeteer
 */
async function scrapeProcurementListWithPuppeteer() {
  try {
    return await scrapWithPuppeteer(PATHS.PROCUREMENT_LIST, () => {
      // Fungsi ini dijalankan di dalam konteks browser
      const procurementData = [];
      
      // Cari cards data daftar pengadaan
      const procurementCards = document.querySelectorAll('#proclist .card');
      
      procurementCards.forEach(card => {
        const cardBody = card.querySelector('.card-body');
        
        try {
          // Ekstrak informasi dari card
          const title = cardBody.querySelector('h5.card-title').textContent.trim();
          const subtitle = cardBody.querySelector('small.card-subtitle').textContent;
          const dateMatch = subtitle.match(/Tayang hingga\s+([^,]+)/);
          const date = dateMatch ? dateMatch[1].trim() : '';
          const kkks = cardBody.querySelector('small.card-subtitle strong i').textContent.trim();
          
          // Attachment info
          const downloadLink = cardBody.querySelector('a.download-btn');
          const fileId = downloadLink ? downloadLink.getAttribute('data-file-id') : null;
          const fileUrl = downloadLink ? downloadLink.getAttribute('data-url') : null;
          const fileName = downloadLink ? downloadLink.getAttribute('data-name') : null;
          
          const procurement = {
            id: '',
            judul: title,
            tanggal: date,
            kkks: kkks,
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
    });
  } catch (error) {
    console.error('Error saat scraping daftar pengadaan dengan Puppeteer:', error.message);
    throw error;
  }
}

module.exports = {
  scrapeProcurementList
}; 