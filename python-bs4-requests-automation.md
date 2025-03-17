# Python dengan BeautifulSoup dan Requests + Otomatisasi untuk Web Scraping

## Pengantar

Dokumen ini menjelaskan implementasi sistem web scraping menggunakan Python, BeautifulSoup, dan Requests, ditambah dengan komponen otomatisasi untuk melakukan scraping data secara terjadwal dari situs web SKK Migas. Sistem ini dirancang untuk mengekstrak informasi pengadaan dan tender secara real-time dan memberikan notifikasi saat terdapat informasi baru.

## Komponen Utama

### 1. Python

Python adalah bahasa pemrograman tingkat tinggi yang menjadi fondasi sistem scraping:
- Versi yang direkomendasikan: Python 3.8+
- Mendukung banyak library untuk scraping, penjadwalan, dan pemrosesan data
- Multiplatform (Windows, Linux, macOS)

### 2. BeautifulSoup

BeautifulSoup adalah library Python untuk mengekstrak data dari file HTML dan XML:
- Versi yang direkomendasikan: BeautifulSoup4
- Memungkinkan navigasi, pencarian, dan manipulasi struktur HTML
- Mendukung beberapa parser (html.parser, lxml, html5lib)

```python
from bs4 import BeautifulSoup

# Membuat objek BeautifulSoup
soup = BeautifulSoup(html_content, 'html.parser')

# Menemukan elemen berdasarkan tag dan atribut
tender_items = soup.find_all('div', class_='tender-item')

# Mengekstrak informasi dari setiap elemen
for item in tender_items:
    title = item.find('h2').text.strip()
    date = item.find('span', class_='date').text.strip()
    description = item.find('p', class_='description').text.strip()
```

### 3. Requests

Requests adalah library HTTP untuk Python yang menyederhanakan proses pengiriman HTTP request:
- Mendukung berbagai metode HTTP (GET, POST, dll)
- Menangani cookies, session, dan headers
- Mendukung autentikasi, proxy, dan timeout

```python
import requests

# Melakukan HTTP GET request
response = requests.get('https://skkmigas.go.id/pengadaan')

# Memeriksa status response
if response.status_code == 200:
    # Menggunakan konten response
    html_content = response.text
else:
    print(f"Error: {response.status_code}")
```

### 4. Komponen Otomatisasi

#### 4.1 Schedule

Schedule adalah library Python yang menyediakan API sederhana untuk penjadwalan:
- Dapat mengatur jadwal berdasarkan interval waktu atau waktu tertentu
- Lightweight tanpa dependensi eksternal
- Ideal untuk aplikasi scraping sederhana hingga menengah

```python
import schedule
import time

def job():
    print("Menjalankan scraping...")
    # Kode scraping di sini

# Menjadwalkan scraping setiap 3 jam
schedule.every(3).hours.do(job)

# Menjadwalkan pada waktu tertentu setiap hari
schedule.every().day.at("10:00").do(job)

# Loop untuk menjalankan jadwal
while True:
    schedule.run_pending()
    time.sleep(60)  # Cek setiap menit
```

#### 4.2 APScheduler (Advanced Python Scheduler)

APScheduler adalah library penjadwalan yang lebih canggih:
- Mendukung berbagai jenis penjadwal (background, blocking, asyncio)
- Dapat menyimpan jadwal di database
- Mendukung timezone dan fitur lanjutan lainnya

```python
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
import atexit

scheduler = BackgroundScheduler()
scheduler.add_job(
    func=job,
    trigger=IntervalTrigger(hours=3),
    id='scraping_job',
    name='Scrape SKK Migas website every 3 hours',
    replace_existing=True
)
scheduler.start()

# Pastikan scheduler berhenti saat program keluar
atexit.register(lambda: scheduler.shutdown())
```

## Implementasi Sistem Scraping

### 1. Struktur Proyek

```
skk_migas_scraper/
│
├── config/
│   ├── config.ini       # Konfigurasi aplikasi
│   └── logging.ini      # Konfigurasi logging
│
├── data/
│   ├── attachments/     # Folder untuk menyimpan lampiran
│   └── cache/           # Cache data untuk perbandingan
│
├── db/
│   ├── models.py        # Model database
│   └── database.py      # Koneksi dan operasi database
│
├── scraper/
│   ├── parser.py        # Kode untuk parsing HTML
│   └── downloader.py    # Kode untuk download attachment
│
├── utils/
│   ├── notification.py  # Sistem notifikasi
│   └── helper.py        # Fungsi-fungsi pembantu
│
├── main.py              # Entry point aplikasi
├── scheduler.py         # Logika penjadwalan
└── requirements.txt     # Dependensi aplikasi
```

### 2. Implementasi Utama

#### 2.1 Konfigurasi (config.ini)

```ini
[scraper]
base_url = https://skkmigas.go.id
search_url = https://skkmigas.go.id/halaman-pencarian
user_agent = Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36

[scheduler]
interval_hours = 3
start_hour = 7
end_hour = 23

[database]
type = sqlite
path = data/skkmigas.db

[notification]
enabled = true
email = user@example.com
smtp_server = smtp.gmail.com
smtp_port = 587
```

#### 2.2 Fungsi Scraping Utama (scraper/parser.py)

```python
import requests
from bs4 import BeautifulSoup
import logging
from db.models import Tender, Attachment
from utils.helper import clean_text, parse_date

logger = logging.getLogger(__name__)

class SKKMigasScraper:
    def __init__(self, config):
        self.config = config
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': config['scraper']['user_agent']
        })
        
    def scrape_tender_list(self):
        """Scrape daftar tender dari halaman pencarian"""
        url = self.config['scraper']['search_url']
        logger.info(f"Scraping tender list from {url}")
        
        try:
            response = self.session.get(url)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.text, 'html.parser')
            tender_items = soup.find_all('div', class_='tender-item')  # Sesuaikan dengan struktur HTML
            
            results = []
            for item in tender_items:
                # Ekstrak data dasar
                title = clean_text(item.find('h2').text)
                detail_url = item.find('a')['href']
                if not detail_url.startswith('http'):
                    detail_url = self.config['scraper']['base_url'] + detail_url
                
                # Tambahkan ke hasil
                results.append({
                    'title': title,
                    'detail_url': detail_url
                })
                
            logger.info(f"Found {len(results)} tender items")
            return results
            
        except Exception as e:
            logger.error(f"Error scraping tender list: {str(e)}")
            return []
    
    def scrape_tender_detail(self, detail_url):
        """Scrape detail tender dari halaman detail"""
        logger.info(f"Scraping tender detail from {detail_url}")
        
        try:
            response = self.session.get(detail_url)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Ekstrak data detail
            title = clean_text(soup.find('h1').text)
            content_div = soup.find('div', class_='content')  # Sesuaikan dengan struktur HTML
            
            # Ekstrak informasi spesifik
            doc_number = self._extract_doc_number(content_div)
            pub_date = self._extract_date(content_div)
            description = self._extract_description(content_div)
            
            # Ekstrak attachment
            attachments = self._extract_attachments(content_div)
            
            return {
                'title': title,
                'doc_number': doc_number,
                'pub_date': pub_date,
                'description': description,
                'url': detail_url,
                'attachments': attachments
            }
            
        except Exception as e:
            logger.error(f"Error scraping tender detail: {str(e)}")
            return None
    
    def _extract_doc_number(self, content_div):
        """Ekstrak nomor dokumen dari konten"""
        # Implementasi ekstraksi nomor dokumen
        pass
    
    def _extract_date(self, content_div):
        """Ekstrak tanggal dari konten"""
        # Implementasi ekstraksi tanggal
        pass
    
    def _extract_description(self, content_div):
        """Ekstrak deskripsi dari konten"""
        # Implementasi ekstraksi deskripsi
        pass
    
    def _extract_attachments(self, content_div):
        """Ekstrak lampiran dari konten"""
        attachments = []
        attachment_links = content_div.find_all('a', class_='attachment')  # Sesuaikan
        
        for link in attachment_links:
            url = link['href']
            if not url.startswith('http'):
                url = self.config['scraper']['base_url'] + url
                
            name = clean_text(link.text)
            
            attachments.append({
                'name': name,
                'url': url
            })
            
        return attachments
```

#### 2.3 Database Model (db/models.py)

```python
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean, create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
import datetime

Base = declarative_base()

class Tender(Base):
    __tablename__ = 'tenders'
    
    id = Column(Integer, primary_key=True)
    title = Column(String(255), nullable=False)
    doc_number = Column(String(100))
    pub_date = Column(DateTime)
    description = Column(Text)
    url = Column(String(255), unique=True)
    content_hash = Column(String(64))  # Hash untuk deteksi perubahan
    created_at = Column(DateTime, default=datetime.datetime.now)
    updated_at = Column(DateTime, default=datetime.datetime.now, onupdate=datetime.datetime.now)
    
    attachments = relationship("Attachment", back_populates="tender")
    changes = relationship("ChangeLog", back_populates="tender")
    
    def __repr__(self):
        return f"<Tender(title='{self.title}', doc_number='{self.doc_number}')>"

class Attachment(Base):
    __tablename__ = 'attachments'
    
    id = Column(Integer, primary_key=True)
    tender_id = Column(Integer, ForeignKey('tenders.id'))
    name = Column(String(255))
    url = Column(String(255))
    local_path = Column(String(255))
    downloaded = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.now)
    
    tender = relationship("Tender", back_populates="attachments")
    
    def __repr__(self):
        return f"<Attachment(name='{self.name}')>"

class ChangeLog(Base):
    __tablename__ = 'change_logs'
    
    id = Column(Integer, primary_key=True)
    tender_id = Column(Integer, ForeignKey('tenders.id'))
    change_type = Column(String(20))  # 'new', 'updated', 'deleted'
    change_details = Column(Text)
    notified = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.now)
    
    tender = relationship("Tender", back_populates="changes")
    
    def __repr__(self):
        return f"<ChangeLog(change_type='{self.change_type}', tender_id={self.tender_id})>"
```

#### 2.4 Scheduler (scheduler.py)

```python
import schedule
import time
import logging
import configparser
from datetime import datetime
from scraper.parser import SKKMigasScraper
from db.database import DatabaseManager
from utils.notification import NotificationManager
from utils.helper import calculate_content_hash

logger = logging.getLogger(__name__)

class ScraperScheduler:
    def __init__(self, config_path='config/config.ini'):
        self.config = configparser.ConfigParser()
        self.config.read(config_path)
        
        self.db_manager = DatabaseManager(self.config)
        self.scraper = SKKMigasScraper(self.config)
        self.notifier = NotificationManager(self.config)
        
        self.interval_hours = self.config.getint('scheduler', 'interval_hours')
        
    def setup_schedule(self):
        """Setup the scraping schedule"""
        logger.info(f"Setting up schedule to run every {self.interval_hours} hours")
        
        # Run immediately first time
        self.scrape_job()
        
        # Then schedule for regular runs
        schedule.every(self.interval_hours).hours.do(self.scrape_job)
        
    def scrape_job(self):
        """Main scraping job"""
        start_time = datetime.now()
        logger.info(f"Starting scrape job at {start_time}")
        
        try:
            # Step 1: Get tender list
            tender_list = self.scraper.scrape_tender_list()
            
            # Step 2: Process each tender
            for tender_item in tender_list:
                self.process_tender(tender_item)
                
            # Step 3: Send notifications for changes
            self.send_notifications()
            
            # Complete
            end_time = datetime.now()
            duration = (end_time - start_time).total_seconds()
            logger.info(f"Scrape job completed in {duration} seconds")
            
        except Exception as e:
            logger.error(f"Error in scrape job: {str(e)}")
    
    def process_tender(self, tender_item):
        """Process a single tender item"""
        # Get detail
        detail = self.scraper.scrape_tender_detail(tender_item['detail_url'])
        if not detail:
            return
            
        # Calculate hash for change detection
        content_hash = calculate_content_hash(detail)
        
        # Check if tender exists in database
        existing_tender = self.db_manager.get_tender_by_url(detail['url'])
        
        if existing_tender:
            # Check for changes
            if existing_tender.content_hash != content_hash:
                # Update tender
                self.db_manager.update_tender(existing_tender.id, detail, content_hash)
                # Log change
                self.db_manager.log_change(existing_tender.id, 'updated', 'Content updated')
        else:
            # Create new tender
            tender_id = self.db_manager.create_tender(detail, content_hash)
            # Log new tender
            self.db_manager.log_change(tender_id, 'new', 'New tender added')
    
    def send_notifications(self):
        """Send notifications for changes"""
        # Get unnotified changes
        changes = self.db_manager.get_unnotified_changes()
        
        if changes:
            logger.info(f"Sending notifications for {len(changes)} changes")
            self.notifier.send_changes_notification(changes)
            
            # Mark as notified
            for change in changes:
                self.db_manager.mark_change_as_notified(change.id)
    
    def run(self):
        """Run the scheduler"""
        self.setup_schedule()
        
        logger.info("Scheduler running. Press Ctrl+C to exit")
        try:
            while True:
                schedule.run_pending()
                time.sleep(60)  # Check every minute
        except KeyboardInterrupt:
            logger.info("Scheduler stopped by user")
```

#### 2.5 Entry Point (main.py)

```python
#!/usr/bin/env python3
import argparse
import logging
import logging.config
import configparser
import os

from scheduler import ScraperScheduler
from db.database import DatabaseManager

def setup_logging():
    """Setup logging configuration"""
    os.makedirs('logs', exist_ok=True)
    
    logging.config.fileConfig('config/logging.ini')
    logger = logging.getLogger(__name__)
    logger.info("Logging setup complete")
    return logger

def parse_arguments():
    """Parse command line arguments"""
    parser = argparse.ArgumentParser(description='SKK Migas Tender Scraper')
    parser.add_argument('--config', default='config/config.ini', help='Path to config file')
    parser.add_argument('--init-db', action='store_true', help='Initialize database')
    parser.add_argument('--run-once', action='store_true', help='Run scraper once and exit')
    
    return parser.parse_args()

def main():
    """Main entry point"""
    # Setup logging
    logger = setup_logging()
    
    # Parse arguments
    args = parse_arguments()
    
    # Load configuration
    config = configparser.ConfigParser()
    config.read(args.config)
    
    # Initialize database if requested
    if args.init_db:
        logger.info("Initializing database")
        db_manager = DatabaseManager(config)
        db_manager.init_db()
        logger.info("Database initialized successfully")
        
    # Run scraper once if requested
    if args.run_once:
        logger.info("Running scraper once")
        scheduler = ScraperScheduler(args.config)
        scheduler.scrape_job()
        logger.info("Single scrape job completed")
    else:
        # Run scheduler
        logger.info("Starting scheduler")
        scheduler = ScraperScheduler(args.config)
        scheduler.run()

if __name__ == "__main__":
    main()
```

## Menggunakan Sistem

### 1. Instalasi

```bash
# Clone repository (jika menggunakan git)
git clone https://github.com/yourusername/skk-migas-scraper.git
cd skk-migas-scraper

# Buat virtual environment
python -m venv venv
source venv/bin/activate  # Di Windows: venv\Scripts\activate

# Install dependensi
pip install -r requirements.txt
```

### 2. Konfigurasi

Edit file `config/config.ini` sesuai kebutuhan:
- Interval scraping
- Konfigurasi email untuk notifikasi
- Path database
- URL target

### 3. Inisialisasi Database

```bash
python main.py --init-db
```

### 4. Menjalankan Scraper

#### Menjalankan Sekali

```bash
python main.py --run-once
```

#### Menjalankan sebagai Service

```bash
python main.py
```

Untuk menjalankan di background pada Linux:
```bash
nohup python main.py > /dev/null 2>&1 &
```

### 5. Deployment dengan Docker (Opsional)

```dockerfile
FROM python:3.9-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "main.py"]
```

Build dan jalankan Docker container:
```bash
docker build -t skk-migas-scraper .
docker run -d --name skk-scraper skk-migas-scraper
```

## Solusi Masalah Umum

### 1. Deteksi Anti-Scraping

Jika situs menerapkan anti-scraping:
- Tambahkan delay antara requests
- Rotasi User-Agent
- Implementasi proxy rotation

```python
# Menambahkan delay
import time
time.sleep(random.uniform(2, 5))  # Delay acak antara 2-5 detik

# Rotasi User-Agent
user_agents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
    # Tambahkan lebih banyak
]
headers = {'User-Agent': random.choice(user_agents)}
```

### 2. Perubahan Struktur HTML

Jika struktur HTML situs berubah:
- Implementasi sistem logging yang baik
- Buat fungsi parser modular
- Pertimbangkan teknik scraping yang lebih robust (XPath/CSS selectors)

### 3. Error Handling

Implementasi try-except untuk menangani berbagai error:
- Koneksi jaringan
- Struktur HTML yang tidak ditemukan
- Timeout

```python
try:
    # Kode scraping
except requests.exceptions.RequestException as e:
    logger.error(f"Request error: {str(e)}")
except AttributeError as e:
    logger.error(f"Parsing error: {str(e)}")
except Exception as e:
    logger.error(f"Unexpected error: {str(e)}")
```

## Kesimpulan

Kombinasi Python dengan BeautifulSoup, Requests, dan komponen otomatisasi merupakan solusi yang tangguh untuk scraping informasi tender dari situs SKK Migas. Dengan mengikuti praktik terbaik yang dijelaskan dalam dokumen ini, Anda dapat membangun sistem scraping yang handal, real-time, dan otomatis yang memberikan notifikasi ketika informasi baru tersedia.

Solusi ini menawarkan:
- Fleksibilitas dalam konfigurasi dan penjadwalan
- Kemampuan deteksi perubahan real-time
- Sistem notifikasi terintegrasi
- Penyimpanan data terstruktur
- Kemudahan dalam pemeliharaan dan pengembangan lebih lanjut
