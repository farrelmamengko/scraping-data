require('dotenv').config();

// Konfigurasi ScraperAPI
const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY;
const TARGET_URL = process.env.TARGET_URL;

// URL untuk ScraperAPI
function getScraperApiUrl(url) {
  return `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(url)}&render=true`;
}

// Path URL untuk halaman tertentu
const PATHS = {
  // Tambahkan fragment ID agar langsung mengarah ke section yang tepat
  PRAKUALIFIKASI: `${TARGET_URL}#invitation`,  // URL untuk Undangan Prakualifikasi
  PELELANGAN: `${TARGET_URL}#bid`              // URL untuk Pelelangan Umum
};

module.exports = {
  SCRAPER_API_KEY,
  TARGET_URL,
  PATHS,
  getScraperApiUrl
}; 