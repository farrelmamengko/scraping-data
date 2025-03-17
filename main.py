#!/usr/bin/env python3
import argparse
import logging
import os
import time
import sys
from datetime import datetime
from scraper.civd_scraper import CIVDScraper
from scraper.utils import setup_logging

# Setup logging
logger = setup_logging()

def parse_arguments():
    """Parse command line arguments"""
    parser = argparse.ArgumentParser(description='CIVD SKK Migas Scraper')
    parser.add_argument('--run-once', action='store_true', help='Run the scraper once and exit')
    parser.add_argument('--analyze-js', action='store_true', help='Analyze JavaScript to find API endpoints')
    parser.add_argument('--download-attachments', action='store_true', help='Download tender attachments')
    parser.add_argument('--output-dir', type=str, default='data', help='Output directory for scraped data')
    return parser.parse_args()

def main():
    """Main function"""
    # Parse arguments
    args = parse_arguments()
    
    # Setup logging
    setup_logging()
    logger = logging.getLogger('scraper')
    
    print("Starting CIVD SKK Migas Scraper...")
    logger.info("Starting CIVD SKK Migas Scraper")
    
    # Create scraper instance
    print("Creating scraper instance...")
    scraper = CIVDScraper()
    
    # Set output directory
    output_dir = args.output_dir
    os.makedirs(output_dir, exist_ok=True)
    scraper.set_data_dir(output_dir)
    
    # Analyze JavaScript if requested
    if args.analyze_js:
        print("Analyzing JavaScript...")
        scraper.analyze_javascript()
        print("JavaScript analysis completed")
        return
        
    # Run scraper once if requested
    if args.run_once:
        print("Running scraper once...")
        logger.info("Running scraper once")
        
        # Initialize session
        if not scraper.initialize_session():
            logger.error("Failed to initialize session")
            return
            
        # Run scraper with download_attachments=True by default
        results = scraper.run_scraper(download_attachments=True)
        
        # Download attachments if requested (this is now redundant but kept for backward compatibility)
        if args.download_attachments and results:
            print("Downloading attachments...")
            logger.info("Downloading attachments")
            
            # Download attachments for Undangan Prakualifikasi
            if 'prakualifikasi' in results and results['prakualifikasi']:
                for item in results['prakualifikasi']:
                    if 'attachment_url' in item and item['attachment_url']:
                        scraper.download_attachment(item['attachment_url'], output_dir, 'prakualifikasi')
                        
            # Download attachments for Pelelangan Umum
            if 'pelelangan' in results and results['pelelangan']:
                for item in results['pelelangan']:
                    if 'attachment_url' in item and item['attachment_url']:
                        scraper.download_attachment(item['attachment_url'], output_dir, 'pelelangan')
                        
        print("Scraper run completed")
        return
        
    # Run scraper on schedule
    print("Running scraper on schedule (every 3 hours)...")
    logger.info("Running scraper on schedule (every 3 hours)")
    
    try:
        while True:
            # Initialize session
            if not scraper.initialize_session():
                logger.error("Failed to initialize session")
                time.sleep(60)  # Wait a minute before retrying
                continue
                
            # Run scraper with download_attachments=True by default
            results = scraper.run_scraper(download_attachments=True)
            
            # Download attachments if requested (this is now redundant but kept for backward compatibility)
            if args.download_attachments and results:
                print("Downloading attachments...")
                logger.info("Downloading attachments")
                
                # Download attachments for Undangan Prakualifikasi
                if 'prakualifikasi' in results and results['prakualifikasi']:
                    for item in results['prakualifikasi']:
                        if 'attachment_url' in item and item['attachment_url']:
                            scraper.download_attachment(item['attachment_url'], output_dir, 'prakualifikasi')
                            
                # Download attachments for Pelelangan Umum
                if 'pelelangan' in results and results['pelelangan']:
                    for item in results['pelelangan']:
                        if 'attachment_url' in item and item['attachment_url']:
                            scraper.download_attachment(item['attachment_url'], output_dir, 'pelelangan')
                            
            # Sleep for 3 hours
            print(f"Sleeping for 3 hours until {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            time.sleep(3 * 60 * 60)
    except KeyboardInterrupt:
        print("Scraper stopped by user")
        logger.info("Scraper stopped by user")
    except Exception as e:
        print(f"Error: {str(e)}")
        logger.error(f"Error: {str(e)}")
        
if __name__ == "__main__":
    main() 