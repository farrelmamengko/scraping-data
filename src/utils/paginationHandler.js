const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

/**
 * Handler untuk menangani paginasi dengan berbagai strategi
 */
class PaginationHandler {
  constructor(baseUrl, path, options = {}) {
    this.baseUrl = baseUrl;
    this.path = path;
    this.options = {
      paginationSelector: options.paginationSelector || 'nav ul.pagination',
      pageItemSelector: options.pageItemSelector || 'li.page-item',
      activePageSelector: options.activePageSelector || 'li.page-item.active',
      nextPageSelector: options.nextPageSelector || 'li.page-item:last-child',
      maxPages: options.maxPages || 10,
      headers: options.headers || {}
    };
    this.cookieString = null;
  }

  /**
   * Mendapatkan cookies yang valid
   */
  async getValidCookies() {
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
      this.cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
      return this.cookieString;
    } finally {
      await browser.close();
    }
  }

  /**
   * Mencoba berbagai format URL untuk paginasi
   */
  getPossibleUrls(pageNumber) {
    return [
      `${this.baseUrl}?page=${pageNumber}#${this.path}`,
      `${this.baseUrl}index.jwebs?page=${pageNumber}#${this.path}`,
      `${this.baseUrl}?hal=${pageNumber}#${this.path}`,
      `${this.baseUrl}index.jwebs?hal=${pageNumber}#${this.path}`,
      `${this.baseUrl}?p=${pageNumber}#${this.path}`,
      `${this.baseUrl}index.jwebs?p=${pageNumber}#${this.path}`,
      `https://civd.skkmigas.go.id/ajax/search/tnd.jwebs?type=1&d-1789-p=${pageNumber}`
    ];
  }

  /**
   * Mencoba mengakses halaman dengan berbagai metode
   */
  async tryAccessPage(pageNumber) {
    // Coba dengan Axios dan cookies
    if (this.cookieString) {
      try {
        const url = this.getPossibleUrls(pageNumber)[0];
        const response = await axios.get(url, {
          headers: {
            'Cookie': this.cookieString,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          },
          timeout: 30000
        });

        if (response.status === 200) {
          return response.data;
        }
      } catch (error) {
        console.log(`Gagal mengakses halaman ${pageNumber} dengan Axios: ${error.message}`);
      }
    }

    // Coba dengan Puppeteer
    const browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
      
      // Coba semua URL yang mungkin
      for (const url of this.getPossibleUrls(pageNumber)) {
        try {
          console.log(`Mencoba mengakses: ${url}`);
          await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
          
          // Tunggu konten dimuat
          await page.waitForTimeout(2000);
          
          // Verifikasi konten
          const hasContent = await page.evaluate((path) => {
            const cards = document.querySelectorAll(`#${path} .card`);
            return cards.length > 0;
          }, this.path);

          if (hasContent) {
            return await page.content();
          }
        } catch (error) {
          console.log(`Gagal mengakses URL ${url}: ${error.message}`);
        }
      }
    } finally {
      await browser.close();
    }

    return null;
  }

  /**
   * Deteksi jumlah halaman maksimal
   */
  async detectMaxPages(page) {
    try {
      // Tunggu sampai elemen pagination muncul
      await page.waitForSelector(this.options.paginationSelector, { timeout: 10000 });
      
      // Ambil jumlah halaman dari pagination
      const maxPages = await page.evaluate((selectors) => {
        const pageItems = document.querySelectorAll(`${selectors.paginationSelector} ${selectors.pageItemSelector}`);
        let max = 1;
        
        pageItems.forEach(item => {
          const pageNum = parseInt(item.textContent);
          if (!isNaN(pageNum) && pageNum > max) {
            max = pageNum;
          }
        });
        
        return Math.min(max, selectors.maxPages);
      }, this.options);
      
      return maxPages;
    } catch (error) {
      console.error('Error saat mendeteksi jumlah halaman:', error.message);
      return 1; // Default ke 1 halaman jika gagal
    }
  }

  /**
   * Scrape semua halaman
   */
  async scrapeAllPages(extractorFunction) {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
      const page = await browser.newPage();
      
      // Set headers
      await page.setExtraHTTPHeaders(this.options.headers);
      
      // Navigasi ke halaman pertama
      const url = `${this.baseUrl}${this.path}`;
      console.log('Mengakses URL:', url);
      await page.goto(url, { waitUntil: 'networkidle0' });
      
      // Deteksi jumlah halaman
      const maxPages = await this.detectMaxPages(page);
      console.log('Jumlah halaman terdeteksi:', maxPages);
      
      let allData = [];
      
      // Scrape setiap halaman
      for (let currentPage = 1; currentPage <= maxPages; currentPage++) {
        console.log(`Scraping halaman ${currentPage}/${maxPages}...`);
        
        // Tunggu konten dimuat
        await page.waitForSelector('#procurement', { timeout: 10000 });
        
        // Ekstrak data dari halaman
        const content = await page.content();
        const $ = cheerio.load(content);
        const pageData = extractorFunction($);
        allData = allData.concat(pageData);
        
        // Klik tombol next jika bukan halaman terakhir
        if (currentPage < maxPages) {
          await page.click(this.options.nextPageSelector);
          await page.waitForTimeout(2000); // Tunggu transisi halaman
        }
      }
      
      return allData;
    } finally {
      await browser.close();
    }
  }
}

module.exports = PaginationHandler; 