import logging
import os
import sys
from datetime import datetime
from scraper.civd_scraper import CIVDScraper

# Konfigurasi logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(f'scraper_test_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log')
    ]
)

logger = logging.getLogger(__name__)

def main():
    """Fungsi utama untuk menjalankan pengujian scraper"""
    logger.info("Starting scraper test")
    
    # Inisialisasi scraper
    scraper = CIVDScraper()
    
    # Jalankan scraper
    logger.info("Running scraper")
    results = scraper.run_scraper()
    
    # Tampilkan hasil
    if results:
        prakualifikasi_count = len(results.get('prakualifikasi', []))
        pelelangan_count = len(results.get('pelelangan', []))
        
        logger.info(f"Scraping completed. Found {prakualifikasi_count} prakualifikasi items and {pelelangan_count} pelelangan items")
        
        # Tampilkan beberapa item pertama untuk verifikasi
        if prakualifikasi_count > 0:
            logger.info("Sample prakualifikasi items:")
            for i, item in enumerate(results['prakualifikasi'][:3]):
                logger.info(f"Item {i+1}: {item.get('title', 'No title')} - {item.get('date', 'No date')}")
        
        if pelelangan_count > 0:
            logger.info("Sample pelelangan items:")
            for i, item in enumerate(results['pelelangan'][:3]):
                logger.info(f"Item {i+1}: {item.get('title', 'No title')} - {item.get('date', 'No date')}")
    else:
        logger.warning("No results returned from scraper")
    
    logger.info("Scraper test completed")

if __name__ == "__main__":
    main() 