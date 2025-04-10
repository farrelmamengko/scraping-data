const puppeteer = require('puppeteer');
const { SCRAPER_API_KEY } = require('./config');

/**
 * Melakukan scraping menggunakan Puppeteer
 * @param {string} url - URL yang akan di-scrape
 * @param {Function} extractionFunction - Fungsi yang akan dijalankan di halaman untuk mengekstrak data
 * @returns {Promise<any>} - Data yang diekstrak
 */
async function scrapWithPuppeteer(url, extractionFunction) {
  let browser;
  
  try {
    // Gunakan ScraperAPI sebagai proxy jika perlu
    const proxyUrl = `http://proxy-server.scraperapi.com:8001?api_key=${SCRAPER_API_KEY}`;
    
    browser = await puppeteer.launch({
      headless: true,
      args: [
        `--proxy-server=${proxyUrl}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--window-size=1920,1080'
      ]
    });
    
    const page = await browser.newPage();
    
    // Set viewport dan user agent
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // Setel timeout
    await page.setDefaultNavigationTimeout(60000);
    
    // Navigasi ke URL
    await page.goto(url, { waitUntil: 'networkidle2' });
    
    // Tunggu halaman dimuat sepenuhnya
    await page.waitForSelector('body');
    
    // Scroll ke target section berdasarkan URL fragment
    if (url.includes('#')) {
      const sectionId = url.split('#')[1];
      await page.evaluate((id) => {
        const element = document.getElementById(id);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, sectionId);
      
      // Tunggu sebentar setelah scroll menggunakan setTimeout
      await page.evaluate(() => {
        return new Promise(resolve => setTimeout(resolve, 2000));
      });
    }
    
    // Ambil screenshot untuk debugging jika perlu
    // await page.screenshot({ path: `screenshot-${new Date().getTime()}.png` });
    
    // Scroll halaman untuk memastikan semua konten dimuat
    await autoScroll(page);
    
    // Ekstrak data menggunakan fungsi yang diberikan
    const data = await page.evaluate(extractionFunction);
    
    return data;
  } catch (error) {
    console.error('Error with Puppeteer scraping:', error.message);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Auto scroll ke bawah sampai halaman selesai untuk memastikan semua content dimuat
 * @param {Page} page - Instance puppeteer Page
 */
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 100;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        
        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
  
  // Tunggu sebentar setelah scroll selesai menggunakan setTimeout
  await page.evaluate(() => {
    return new Promise(resolve => setTimeout(resolve, 1000));
  });
}

module.exports = {
  scrapWithPuppeteer
}; 