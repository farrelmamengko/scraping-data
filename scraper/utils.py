import logging
import os
import random
import re
import csv
from datetime import datetime

def setup_logging():
    """Setup logging configuration"""
    # Create logs directory if it doesn't exist
    os.makedirs('logs', exist_ok=True)
    
    # Configure logging
    log_file = os.path.join('logs', f'scraper_{datetime.now().strftime("%Y%m%d")}.log')
    
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler(log_file),
            logging.StreamHandler()
        ]
    )
    
    # Create logger
    logger = logging.getLogger('scraper')
    
    return logger

def random_delay(min_seconds=2, max_seconds=5):
    """Generate a random delay between min and max seconds"""
    return random.uniform(min_seconds, max_seconds)

def clean_text(text):
    """Clean text by removing extra whitespace and normalizing"""
    if not text:
        return ""
    
    # Replace multiple whitespace with a single space
    text = re.sub(r'\s+', ' ', text)
    
    # Remove leading/trailing whitespace
    text = text.strip()
    
    return text

def save_to_csv(data, filename, output_dir='data'):
    """Save data to CSV file"""
    if not data:
        return None
    
    # Create output directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)
    
    # Full path to output file
    file_path = os.path.join(output_dir, filename)
    
    # Get fieldnames from first item
    fieldnames = data[0].keys()
    
    # Write data to CSV
    with open(file_path, 'w', newline='', encoding='utf-8') as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(data)
    
    return file_path 