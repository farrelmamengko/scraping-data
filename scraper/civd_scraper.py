import requests
from bs4 import BeautifulSoup
import logging
import configparser
import os
import random
import time
from datetime import datetime
from .utils import random_delay, clean_text, save_to_csv
import re
import json
import csv
import urllib.parse
import tempfile
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException, ElementClickInterceptedException
import traceback

logger = logging.getLogger(__name__)

class CIVDScraper:
    def __init__(self, config_path=None):
        # Load configuration
        self.config = configparser.ConfigParser()
        
        # Jika config_path tidak diberikan, cari di beberapa lokasi umum
        if config_path is None:
            # Cari di direktori saat ini
            if os.path.exists('config/config.ini'):
                config_path = 'config/config.ini'
            # Cari di direktori utama proyek
            elif os.path.exists(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'config/config.ini')):
                config_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'config/config.ini')
            else:
                # Buat file konfigurasi default jika tidak ditemukan
                config_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'config')
                os.makedirs(config_dir, exist_ok=True)
                config_path = os.path.join(config_dir, 'config.ini')
                
                with open(config_path, 'w') as f:
                    f.write("""[scraper]
base_url = https://civd.skkmigas.go.id
user_agent = Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36
delay_min = 2
delay_max = 5

[scheduler]
interval_hours = 3
start_hour = 8
end_hour = 20

[output]
format = csv
path = data/
""")
                logger.info(f"Created default config file at {config_path}")
        
        # Baca file konfigurasi
        logger.info(f"Reading config from {config_path}")
        self.config.read(config_path)
        
        # Verifikasi bahwa bagian [scraper] ada
        if 'scraper' not in self.config:
            logger.error(f"Section [scraper] not found in {config_path}")
            # Buat file konfigurasi baru dengan bagian yang benar
            with open(config_path, 'w') as f:
                f.write("""[scraper]
base_url = https://civd.skkmigas.go.id
user_agent = Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36
delay_min = 2
delay_max = 5

[scheduler]
interval_hours = 3
start_hour = 8
end_hour = 20

[output]
format = csv
path = data/
""")
            logger.info(f"Created new config file at {config_path}")
            # Baca ulang file konfigurasi
            self.config.read(config_path)
        
        # Setup base properties
        self.base_url = self.config['scraper']['base_url']
        self.user_agent = self.config['scraper']['user_agent']
        self.delay_min = float(self.config['scraper']['delay_min'])
        self.delay_max = float(self.config['scraper']['delay_max'])
        
        # Setup session
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': self.user_agent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5'
        })
        
        # Initialize session
        self.session_valid = False
        
        self.data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data')
        os.makedirs(self.data_dir, exist_ok=True)
    
    def set_data_dir(self, data_dir):
        """Set the data directory for saving files"""
        self.data_dir = data_dir
        os.makedirs(self.data_dir, exist_ok=True)
        logger.info(f"Data directory set to {self.data_dir}")
    
    def initialize_session(self):
        """Initialize session with the website"""
        try:
            logger.info("Initializing session with CIVD website...")
            response = self.session.get(self.base_url)
            response.raise_for_status()
            
            # Save HTML for inspection
            with open('main_page.html', 'w', encoding='utf-8') as f:
                f.write(response.text)
            logger.info("Saved HTML to main_page.html for inspection")
            
            # Check if we got a jsessionid
            if 'jsessionid' in response.url:
                logger.info(f"Session established: {response.url}")
                self.session_valid = True
                return True
            else:
                logger.warning("No session ID found in response URL")
                return False
                
        except Exception as e:
            logger.error(f"Failed to initialize session: {str(e)}")
            return False
    
    def _add_delay(self):
        """Add random delay to avoid being blocked"""
        delay = random.uniform(2, 5)
        time.sleep(delay)

    def _save_to_csv(self, data, file_prefix):
        """Save data to CSV file"""
        if not data:
            logger.warning(f"No data to save for {file_prefix}")
            return None
            
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = os.path.join(self.data_dir, f"{file_prefix}_{timestamp}.csv")
        
        fieldnames = data[0].keys()
        
        with open(filename, 'w', newline='', encoding='utf-8') as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(data)
            
        logger.info(f"Data saved to {filename}")
        return filename

    def _extract_tender_items(self, html_content, section_id=None):
        """Extract tender items from HTML content"""
        soup = BeautifulSoup(html_content, 'html.parser')
        
        tender_items = []
        
        # Jika section_id diberikan, coba cari section tersebut
        if section_id:
            section = soup.find(id=section_id)
            if not section:
                logger.warning(f"Section with id '{section_id}' not found")
                
                # Jika tidak menemukan section dengan ID, coba cari semua card di seluruh HTML
                cards = soup.find_all('div', class_='card')
                if cards:
                    logger.info(f"Found {len(cards)} cards in the entire HTML")
                    for card in cards:
                        item = self._extract_card_data(card)
                        if item:
                            tender_items.append(item)
                    return tender_items
                else:
                    return []
            else:
                # Simpan section HTML untuk inspeksi
                section_filename = f"{section_id}_section.html"
                with open(section_filename, "w", encoding="utf-8") as f:
                    f.write(str(section))
                logger.info(f"Saved {section_id} section HTML to {section_filename} for inspection")
                
                # Cari semua card di dalam section
                cards = section.find_all('div', class_='card')
                if cards:
                    logger.info(f"Found {len(cards)} cards in section {section_id}")
                    for card in cards:
                        item = self._extract_card_data(card)
                        if item:
                            tender_items.append(item)
                    return tender_items
        else:
            # Jika tidak ada section_id, cari semua card di seluruh HTML
            cards = soup.find_all('div', class_='card')
            if cards:
                logger.info(f"Found {len(cards)} cards in the entire HTML")
                for card in cards:
                    item = self._extract_card_data(card)
                    if item:
                        tender_items.append(item)
                return tender_items
        
        # Jika tidak menemukan card, coba pendekatan lain
        if not tender_items:
            logger.info("No cards found, trying alternative approaches")
            
            # Coba cari div dengan class col-6 atau col-md-6 (biasanya berisi item tender)
            cols = soup.find_all('div', class_=lambda x: x and ('col-6' in x or 'col-md-6' in x))
            if cols:
                logger.info(f"Found {len(cols)} column divs")
                for col in cols:
                    # Cek apakah col berisi card
                    card = col.find('div', class_='card')
                    if card:
                        item = self._extract_card_data(card)
                        if item:
                            tender_items.append(item)
            
            # Jika masih tidak menemukan, cari berdasarkan struktur
            if not tender_items:
                # Cari semua div yang memiliki border atau margin-bottom yang menunjukkan item terpisah
                divs = soup.find_all('div', style=lambda x: x and ('border' in x or 'margin-bottom' in x))
                if divs:
                    logger.info(f"Found {len(divs)} divs with border or margin")
                    for div in divs:
                        item = self._extract_div_data(div)
                        if item:
                            tender_items.append(item)
        
        logger.info(f"Extracted {len(tender_items)} tender items")
        return tender_items
        
    def _extract_card_data(self, card):
        """Extract data from a card element"""
        try:
            # Cari card-body jika ada
            card_body = card.find('div', class_='card-body')
            if card_body:
                card = card_body
                
            # Cari judul tender
            title_elem = card.find('h5', class_='card-title')
            title = title_elem.get_text(strip=True) if title_elem else None
            
            # Cari subtitle yang berisi informasi tanggal dan perusahaan
            subtitle_elem = card.find('small', class_='card-subtitle')
            subtitle_text = subtitle_elem.get_text(strip=True) if subtitle_elem else ""
            
            # Ekstrak tanggal dari subtitle
            date_match = re.search(r'Tayang hingga\s+(\d+\s+\w+\s+\d{4})', subtitle_text)
            date = date_match.group(1) if date_match else "No Date"
            
            # Ekstrak perusahaan dari subtitle
            company_match = re.search(r'Oleh\s+(.*?)$', subtitle_text)
            company = company_match.group(1) if company_match else "SKK Migas"
            company = re.sub(r'<[^>]+>', '', company)  # Hapus tag HTML
            
            # Cari deskripsi
            desc_elem = card.find('p', class_='card-text')
            description = desc_elem.get_text(strip=True) if desc_elem else ""
            
            # Cari informasi tambahan
            info_elem = card.find('p', class_='tipe')
            info_dict = {}
            
            if info_elem:
                # Ekstrak semua span dengan label dan nilai
                spans = info_elem.find_all('span')
                for span in spans:
                    span_text = span.get_text(strip=True)
                    if span_text:
                        # Coba ekstrak label dan nilai
                        label_match = re.search(r'<b>(.*?)</b>:\s*(.*)', str(span))
                        if label_match:
                            label = label_match.group(1).strip()
                            value = label_match.group(2).strip()
                            info_dict[label] = value
                        else:
                            # Jika tidak ada format label:nilai, gunakan teks lengkap
                            clean_text = re.sub(r'<[^>]+>', '', span_text).strip()
                            if clean_text:
                                info_dict[f"Info {len(info_dict) + 1}"] = clean_text
            
            # Cari link attachment jika ada
            attachments = []
            
            # Cari tombol "Lebih lanjut" yang terlihat di screenshot
            lebih_lanjut_buttons = card.find_all('a', class_='lebih-lanjut')
            if not lebih_lanjut_buttons:
                lebih_lanjut_buttons = card.find_all('a', string=lambda s: s and 'Lebih lanjut' in s)
            if not lebih_lanjut_buttons:
                lebih_lanjut_buttons = card.find_all('button', string=lambda s: s and 'Lebih lanjut' in s)
            
            # Cari link attachment langsung
            attachment_links = card.find_all('a', class_='attachment')
            if not attachment_links:
                attachment_links = card.find_all('a', string=lambda s: s and 'Attachment' in s)
            
            # Tambahkan semua link attachment yang ditemukan
            for link in attachment_links:
                href = link.get('href', '')
                if href and ('download' in href or 'attachment' in href or '.pdf' in href):
                    file_id = None
                    file_name = "attachment.pdf"
                    
                    # Coba ekstrak file ID dan nama file dari URL
                    if 'fileId=' in href:
                        file_id = href.split('fileId=')[1].split('&')[0] if '&' in href.split('fileId=')[1] else href.split('fileId=')[1]
                    elif '/download/' in href:
                        parts = href.split('/download/')[1].split('/')
                        if len(parts) >= 2:
                            file_id = parts[1]
                    
                    if 'fileName=' in href:
                        file_name = href.split('fileName=')[1].split('&')[0] if '&' in href.split('fileName=')[1] else href.split('fileName=')[1]
                    elif href.endswith('.pdf'):
                        file_name = href.split('/')[-1]
                    
                    # Pastikan URL lengkap
                    if not href.startswith('http'):
                        href = f"{self.base_url}{href}" if href.startswith('/') else f"{self.base_url}/{href}"
                    
                    attachments.append({
                        'url': href,
                        'name': file_name,
                        'file_id': file_id
                    })
            
            # Jika tidak ada attachment langsung, cari link download-file-blob
            if not attachments:
                attachment_elems = card.find_all('a', class_='download-file-blob')
                
                for attachment_elem in attachment_elems:
                    if 'data-url' in attachment_elem.attrs:
                        attachment_url = attachment_elem['data-url']
                        attachment_id = attachment_elem.get('data-file-id')
                        attachment_name = attachment_elem.get('data-name', 'attachment.pdf')
                        
                        if attachment_url and attachment_id:
                            if not attachment_url.startswith('http'):
                                attachment_url = f"{self.base_url}{attachment_url}?fileId={attachment_id}&fileName={attachment_name}"
                            else:
                                attachment_url = f"{attachment_url}?fileId={attachment_id}&fileName={attachment_name}"
                            
                            attachments.append({
                                'url': attachment_url,
                                'name': attachment_name,
                                'file_id': attachment_id
                            })
            
            # Format deskripsi dan informasi tambahan dengan baik
            full_description = description
            
            # Tambahkan informasi tambahan ke deskripsi
            if info_dict:
                for key, value in info_dict.items():
                    full_description += f"\n{key}: {value}"
            
            # Buat item tender
            tender_item = {
                'title': title,
                'date': date,
                'company': company,
                'description': full_description,
                'attachments': attachments
            }
            
            # Tambahkan URL attachment utama jika ada
            if attachments:
                tender_item['attachment_url'] = attachments[0]['url']
                tender_item['attachment_name'] = attachments[0]['name']
                tender_item['attachment_id'] = attachments[0]['file_id']
            
            return tender_item
        except Exception as e:
            logger.error(f"Error extracting card data: {str(e)}")
            return None

    def _extract_api_data(self, html_content):
        """Extract API data from HTML content"""
        try:
            # Cari semua script tags
            soup = BeautifulSoup(html_content, 'html.parser')
            scripts = soup.find_all('script')
            
            api_data = []
            
            # Cari URL API atau data JSON dalam script
            for script in scripts:
                script_text = script.string
                if not script_text:
                    continue
                
                # Cari URL API
                api_urls = re.findall(r'url\s*:\s*[\'"]([^\'"]*api[^\'"]*)[\'"]', script_text)
                if api_urls:
                    logger.info(f"Found potential API URL: {api_urls[0]}")
                    
                    # Coba akses API
                    try:
                        api_url = api_urls[0]
                        if not api_url.startswith('http'):
                            api_url = self.base_url + api_url
                        
                        api_response = self.session.get(api_url)
                        if api_response.status_code == 200:
                            try:
                                json_data = api_response.json()
                                if isinstance(json_data, list) and len(json_data) > 0:
                                    return json_data
                                elif isinstance(json_data, dict) and 'data' in json_data:
                                    return json_data['data']
                            except:
                                pass
                    except:
                        pass
                
                # Cari data JSON langsung dalam script
                json_data_matches = re.findall(r'var\s+(\w+)\s*=\s*(\[.*?\]);', script_text, re.DOTALL)
                for var_name, json_str in json_data_matches:
                    if 'tender' in var_name.lower() or 'item' in var_name.lower() or 'data' in var_name.lower():
                        try:
                            data = json.loads(json_str)
                            if isinstance(data, list) and len(data) > 0:
                                logger.info(f"Found JSON data in script: {var_name}")
                                return data
                        except:
                            pass
            
            return api_data
        except Exception as e:
            logger.error(f"Error extracting API data: {str(e)}")
            return []

    def scrape_undangan_prakualifikasi(self):
        """Scrape Undangan Prakualifikasi page"""
        if not self.session_valid and not self.initialize_session():
            logger.error("Cannot scrape without valid session")
            return []
            
        # Tambahkan delay untuk menghindari deteksi sebagai bot
        self._add_delay()
        
        all_tender_items = []
        
        # Gunakan endpoint API yang ditemukan dalam analisis JavaScript
        try:
            logger.info("Attempting to use API endpoint for Undangan Prakualifikasi data")
            api_url = f"{self.base_url}/ajax/search/tnd.jwebs"
            
            # Tentukan jumlah halaman maksimum yang akan di-scrape
            max_pages = 10
            
            for page in range(1, max_pages + 1):
                logger.info(f"Scraping Undangan Prakualifikasi page {page}")
                
                # Parameter yang benar untuk pagination adalah 'd-1789-p', bukan 'page'
                payload = {
                    "type": "1",  # Type 1 untuk Undangan Prakualifikasi berdasarkan kode JS
                    "keyword": "",
                    "startDate": "",
                    "endDate": "",
                    "page": "1",  # Selalu 1 karena parameter ini tidak digunakan untuk pagination
                    "d-1789-p": str(page)  # Parameter yang benar untuk pagination
                }
                
                # Tambahkan delay antara request untuk menghindari rate limiting
                if page > 1:
                    time.sleep(random.uniform(2, 5))
                
                response = self.session.post(api_url, data=payload)
                
                if response.status_code == 200:
                    logger.info(f"Successfully received response from API endpoint for page {page}")
                    
                    # Simpan respons API untuk inspeksi (untuk semua halaman)
                    response_file = f'prakualifikasi_api_response_page{page}.html'
                    with open(response_file, 'w', encoding='utf-8') as f:
                        f.write(response.text)
                    logger.info(f"Saved API response to {response_file} for inspection")
                    
                    # Coba ekstrak item tender dari respons API
                    tender_items = self._extract_tender_items(response.text, "tnd1Result")
                    
                    # Jika tidak menemukan dengan ID tnd1Result, coba tanpa ID
                    if not tender_items:
                        logger.info(f"No items found with ID 'tnd1Result', trying without specific ID")
                        tender_items = self._extract_tender_items(response.text)
                    
                    if tender_items:
                        logger.info(f"Successfully extracted {len(tender_items)} tender items from API response for page {page}")
                        
                        # Tambahkan informasi halaman ke setiap item
                        for item in tender_items:
                            item['page'] = page
                        
                        all_tender_items.extend(tender_items)
                        
                        # Jika jumlah item kurang dari yang diharapkan, mungkin ini adalah halaman terakhir
                        if len(tender_items) < 6:  # Biasanya ada 6 item per halaman
                            logger.info(f"Found less than 6 items on page {page}, assuming this is the last page")
                            break
                    else:
                        logger.warning(f"No tender items found in API response for page {page}, stopping pagination")
                        break
                else:
                    logger.warning(f"API request failed with status code: {response.status_code} for page {page}")
                    break
                
                # Tambahkan delay antara request paginasi
                time.sleep(random.uniform(1, 3))
            
            if all_tender_items:
                logger.info(f"Successfully extracted a total of {len(all_tender_items)} tender items from all pages")
                return all_tender_items
            else:
                logger.warning("No tender items found in any page, trying fallback method")
        except Exception as e:
            logger.error(f"Error using API endpoint: {str(e)}")
            logger.error(traceback.format_exc())
        
        # Fallback ke metode tradisional jika API gagal
        try:
            logger.info("Falling back to traditional page scraping for Undangan Prakualifikasi")
            
            # Gunakan Selenium untuk menangani paginasi JavaScript
            logger.info("Using Selenium to handle JavaScript pagination")
            
            # Setup Chrome options
            chrome_options = Options()
            chrome_options.add_argument("--headless")
            chrome_options.add_argument("--no-sandbox")
            chrome_options.add_argument("--disable-dev-shm-usage")
            chrome_options.add_argument(f"user-agent={self.user_agent}")
            
            # Inisialisasi driver
            service = Service(ChromeDriverManager().install())
            driver = webdriver.Chrome(service=service, options=chrome_options)
            
            try:
                # Buka halaman utama
                driver.get(f"{self.base_url}/index.jwebs#invitation")
                logger.info("Opened main page with Selenium")
                
                # Tunggu hingga konten dimuat
                WebDriverWait(driver, 10).until(
                    EC.presence_of_element_located((By.ID, "invitation"))
                )
                
                # Scrape halaman pertama
                logger.info("Scraping first page with Selenium")
                page_source = driver.page_source
                tender_items = self._extract_tender_items(page_source, "invitation")
                if tender_items:
                    all_tender_items.extend(tender_items)
                    logger.info(f"Extracted {len(tender_items)} items from first page with Selenium")
                else:
                    logger.warning("No items found on first page with Selenium")
                
                # Cari tombol paginasi
                pagination_elements = driver.find_elements(By.CSS_SELECTOR, ".pagination .page-item")
                
                if len(pagination_elements) > 2:  # Ada tombol paginasi (selain Previous dan Next)
                    # Tentukan jumlah halaman
                    page_numbers = []
                    for elem in pagination_elements:
                        page_text = elem.text.strip()
                        if page_text.isdigit():
                            page_numbers.append(int(page_text))
                    
                    if page_numbers:
                        max_page = max(page_numbers)
                        logger.info(f"Found {max_page} pages of pagination")
                        
                        # Scrape halaman 2 sampai max_page
                        for page in range(2, max_page + 1):
                            logger.info(f"Clicking pagination button for page {page}")
                            
                            try:
                                # Cari dan klik tombol halaman
                                page_button = driver.find_element(By.XPATH, f"//ul[contains(@class, 'pagination')]//a[text()='{page}']")
                                driver.execute_script("arguments[0].click();", page_button)
                                
                                # Tunggu konten dimuat
                                time.sleep(3)
                                
                                # Scrape halaman
                                logger.info(f"Scraping page {page} with Selenium")
                                page_source = driver.page_source
                                tender_items = self._extract_tender_items(page_source, "invitation")
                                if tender_items:
                                    logger.info(f"Extracted {len(tender_items)} items from page {page} with Selenium")
                                    all_tender_items.extend(tender_items)
                                else:
                                    logger.warning(f"No tender items found on page {page}")
                                    break
                                
                                # Tambahkan delay antara halaman
                                time.sleep(random.uniform(1, 3))
                            except Exception as e:
                                logger.error(f"Error clicking pagination button for page {page}: {str(e)}")
                                break
                else:
                    logger.warning("No pagination elements found")
                
                if all_tender_items:
                    logger.info(f"Successfully extracted a total of {len(all_tender_items)} tender items with Selenium")
                    return all_tender_items
                else:
                    logger.warning("No tender data available at this time")
                    return []
            finally:
                # Tutup driver
                driver.quit()
                logger.info("Closed Selenium driver")
        except Exception as e:
            logger.error(f"Error scraping Undangan Prakualifikasi page: {str(e)}")
            logger.error(traceback.format_exc())
            return []

    def scrape_pelelangan_umum(self):
        """Scrape Pelelangan Umum page"""
        if not self.session_valid and not self.initialize_session():
            logger.error("Cannot scrape without valid session")
            return []
            
        # Tambahkan delay untuk menghindari deteksi sebagai bot
        self._add_delay()
        
        all_tender_items = []
        
        # Gunakan endpoint API yang ditemukan dalam analisis JavaScript
        try:
            logger.info("Attempting to use API endpoint for Pelelangan Umum data")
            api_url = f"{self.base_url}/ajax/search/tnd.jwebs"
            
            # Tentukan jumlah halaman maksimum yang akan di-scrape
            max_pages = 10
            
            for page in range(1, max_pages + 1):
                logger.info(f"Scraping Pelelangan Umum page {page}")
                
                # Parameter yang benar untuk pagination adalah 'd-1789-p', bukan 'page'
                payload = {
                    "type": "2",  # Type 2 untuk Pelelangan Umum berdasarkan kode JS
                    "keyword": "",
                    "startDate": "",
                    "endDate": "",
                    "page": "1",  # Selalu 1 karena parameter ini tidak digunakan untuk pagination
                    "d-1789-p": str(page)  # Parameter yang benar untuk pagination
                }
                
                # Tambahkan delay antara request untuk menghindari rate limiting
                if page > 1:
                    time.sleep(random.uniform(2, 5))
                
                response = self.session.post(api_url, data=payload)
                
                if response.status_code == 200:
                    logger.info(f"Successfully received response from API endpoint for page {page}")
                    
                    # Simpan respons API untuk inspeksi (hanya untuk halaman pertama)
                    if page == 1:
                        with open('pelelangan_api_response.html', 'w', encoding='utf-8') as f:
                            f.write(response.text)
                        logger.info("Saved API response to pelelangan_api_response.html for inspection")
                    
                    # Coba ekstrak item tender dari respons API
                    tender_items = self._extract_tender_items(response.text, "tnd2Result")
                    
                    # Jika tidak menemukan dengan ID tnd2Result, coba tanpa ID
                    if not tender_items:
                        logger.info(f"No items found with ID 'tnd2Result', trying without specific ID")
                        tender_items = self._extract_tender_items(response.text)
                    
                    if tender_items:
                        logger.info(f"Successfully extracted {len(tender_items)} tender items from API response for page {page}")
                        
                        # Tambahkan informasi halaman ke setiap item
                        for item in tender_items:
                            item['page'] = page
                        
                        all_tender_items.extend(tender_items)
                        
                        # Jika jumlah item kurang dari yang diharapkan, mungkin ini adalah halaman terakhir
                        if len(tender_items) < 10:  # Biasanya ada 10 item per halaman
                            logger.info(f"Found less than 10 items on page {page}, assuming this is the last page")
                            break
                    else:
                        logger.warning(f"No tender items found in API response for page {page}, stopping pagination")
                        break
                else:
                    logger.warning(f"API request failed with status code: {response.status_code} for page {page}")
                    break
                
                # Tambahkan delay antara request paginasi
                time.sleep(random.uniform(1, 3))
            
            if all_tender_items:
                logger.info(f"Successfully extracted a total of {len(all_tender_items)} tender items from API")
                return all_tender_items
            else:
                logger.warning("No tender items found in API response, trying fallback method")
        except Exception as e:
            logger.error(f"Error using API endpoint: {str(e)}")
        
        # Fallback ke metode tradisional dengan Selenium jika API gagal
        try:
            logger.info("Falling back to Selenium for Pelelangan Umum scraping")
            
            # Setup Chrome options
            chrome_options = Options()
            chrome_options.add_argument("--headless")
            chrome_options.add_argument("--disable-gpu")
            chrome_options.add_argument("--no-sandbox")
            chrome_options.add_argument("--disable-dev-shm-usage")
            chrome_options.add_argument(f"user-agent={self.user_agent}")
            
            driver = None
            try:
                # Gunakan webdriver-manager untuk mengelola driver Chrome
                service = Service(ChromeDriverManager().install())
                driver = webdriver.Chrome(service=service, options=chrome_options)
                
                # Akses halaman utama
                driver.get(f"{self.base_url}/index.jwebs#bid")
                logger.info("Accessed main page with Selenium")
                
                # Tunggu hingga konten dimuat
                WebDriverWait(driver, 10).until(
                    EC.presence_of_element_located((By.ID, "bid"))
                )
                
                # Scrape halaman pertama
                page_source = driver.page_source
                page_tender_items = self._extract_tender_items(page_source, "bid")
                
                if page_tender_items:
                    logger.info(f"Successfully extracted {len(page_tender_items)} tender items from first page")
                    all_tender_items.extend(page_tender_items)
                
                # Coba klik tombol next untuk halaman berikutnya
                page_count = 1
                while page_count < max_pages:
                    try:
                        # Cari tombol next
                        next_button = WebDriverWait(driver, 5).until(
                            EC.element_to_be_clickable((By.XPATH, "//a[contains(@class, 'page-link') and contains(text(), 'Next')]"))
                        )
                        
                        # Klik tombol next
                        next_button.click()
                        logger.info(f"Clicked next button for page {page_count + 1}")
                        
                        # Tunggu hingga konten dimuat
                        time.sleep(3)
                        
                        # Scrape halaman berikutnya
                        page_source = driver.page_source
                        page_tender_items = self._extract_tender_items(page_source, "bid")
                        
                        if page_tender_items:
                            logger.info(f"Successfully extracted {len(page_tender_items)} tender items from page {page_count + 1}")
                            all_tender_items.extend(page_tender_items)
                        else:
                            logger.warning(f"No tender items found on page {page_count + 1}")
                            break
                        
                        page_count += 1
                    except (TimeoutException, NoSuchElementException, ElementClickInterceptedException) as e:
                        logger.info(f"No more pages available or error clicking next button: {str(e)}")
                        break
                
                if all_tender_items:
                    logger.info(f"Successfully extracted a total of {len(all_tender_items)} tender items with Selenium")
                    return all_tender_items
                else:
                    logger.warning("No tender data available at this time")
                    return []
            finally:
                if driver:
                    driver.quit()
                    logger.info("Selenium driver closed")
        except Exception as e:
            logger.error(f"Error scraping Pelelangan Umum page with Selenium: {str(e)}")
            return []

    def analyze_javascript(self):
        """Analyze JavaScript to find API endpoints"""
        if not self.session_valid and not self.initialize_session():
            logger.error("Cannot analyze JavaScript without valid session")
            return False
        
        logger.info("Analyzing JavaScript to find API endpoints")
        
        try:
            # Akses halaman utama
            response = self.session.get(self.base_url)
            response.raise_for_status()
            
            # Parse HTML
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Cari semua script tags
            scripts = soup.find_all('script')
            
            # Simpan semua script tags ke file
            with open("script_tags.js", "w", encoding="utf-8") as f:
                for script in scripts:
                    if script.string:
                        f.write(f"// Script tag\n{script.string}\n\n")
            
            logger.info(f"Saved {len(scripts)} script tags to script_tags.js")
            
            # Cari semua script src
            script_srcs = []
            for script in scripts:
                if 'src' in script.attrs:
                    script_srcs.append(script['src'])
            
            # Simpan semua script src ke file
            with open("script_srcs.txt", "w", encoding="utf-8") as f:
                for src in script_srcs:
                    f.write(f"{src}\n")
            
            logger.info(f"Saved {len(script_srcs)} script sources to script_srcs.txt")
            
            # Cari AJAX calls dalam script
            ajax_calls = []
            for script in scripts:
                if script.string:
                    # Cari $.ajax, fetch, atau XMLHttpRequest
                    ajax_matches = re.findall(r'(?:(?:\$\.ajax)|(?:fetch)|(?:XMLHttpRequest)).*?url\s*:\s*[\'"]([^\'"]*)[\'"]', script.string, re.DOTALL)
                    ajax_calls.extend(ajax_matches)
            
            # Simpan semua AJAX calls ke file
            with open("ajax_calls.js", "w", encoding="utf-8") as f:
                for call in ajax_calls:
                    f.write(f"{call}\n")
            
            logger.info(f"Saved {len(ajax_calls)} AJAX calls to ajax_calls.js")
            
            # Coba akses halaman Undangan Prakualifikasi dan Pelelangan Umum
            # untuk analisis lebih lanjut
            self._add_delay()
            invitation_response = self.session.get(f"{self.base_url}/index.jwebs#invitation")
            
            self._add_delay()
            bid_response = self.session.get(f"{self.base_url}/index.jwebs#bid")
            
            # Cari semua XHR requests yang mungkin terjadi saat halaman dimuat
            invitation_soup = BeautifulSoup(invitation_response.text, 'html.parser')
            bid_soup = BeautifulSoup(bid_response.text, 'html.parser')
            
            # Cari semua script yang mungkin berisi data atau API calls
            invitation_scripts = invitation_soup.find_all('script')
            bid_scripts = bid_soup.find_all('script')
            
            # Simpan semua script dari halaman Undangan Prakualifikasi
            with open("invitation_scripts.js", "w", encoding="utf-8") as f:
                for script in invitation_scripts:
                    if script.string:
                        f.write(f"// Invitation script\n{script.string}\n\n")
            
            # Simpan semua script dari halaman Pelelangan Umum
            with open("bid_scripts.js", "w", encoding="utf-8") as f:
                for script in bid_scripts:
                    if script.string:
                        f.write(f"// Bid script\n{script.string}\n\n")
            
            logger.info("JavaScript analysis completed")
            return True
            
        except Exception as e:
            logger.error(f"Error analyzing JavaScript: {str(e)}")
            return False

    def run_scraper(self, download_attachments=False):
        """Run the scraper to collect data from both sections"""
        if not self.session_valid and not self.initialize_session():
            logger.error("Cannot run scraper without valid session")
            return None
            
        results = {
            'prakualifikasi': [],
            'pelelangan': []
        }
        
        # Scrape Undangan Prakualifikasi
        logger.info("Scraping Undangan Prakualifikasi section")
        prakualifikasi_items = self.scrape_undangan_prakualifikasi()
        
        if prakualifikasi_items:
            logger.info(f"Found {len(prakualifikasi_items)} Undangan Prakualifikasi items")
            
            # Simpan ke CSV
            csv_file = self._save_to_csv(prakualifikasi_items, 'prakualifikasi')
            logger.info(f"Saved Undangan Prakualifikasi data to {csv_file}")
            
            # Download attachments jika diminta
            if download_attachments:
                logger.info("Downloading attachments for Undangan Prakualifikasi")
                for item in prakualifikasi_items:
                    if 'attachments' in item and item['attachments']:
                        try:
                            attachments = item['attachments']
                            if isinstance(attachments, str):
                                try:
                                    attachments = json.loads(attachments)
                                except:
                                    logger.warning(f"Failed to parse attachments JSON: {attachments}")
                                    continue
                                    
                            if isinstance(attachments, list):
                                for attachment in attachments:
                                    if isinstance(attachment, dict) and 'url' in attachment:
                                        self.download_attachment(attachment['url'], self.data_dir, 'prakualifikasi')
                                        # Tambahkan delay antara download
                                        time.sleep(random.uniform(1, 3))
                        except Exception as e:
                            logger.error(f"Error downloading attachment: {str(e)}")
            
            results['prakualifikasi'] = prakualifikasi_items
        else:
            logger.warning("No Undangan Prakualifikasi data found")
        
        # Tambahkan delay antara scraping sections
        time.sleep(random.uniform(3, 5))
        
        # Scrape Pelelangan Umum
        logger.info("Scraping Pelelangan Umum section")
        pelelangan_items = self.scrape_pelelangan_umum()
        
        if pelelangan_items:
            logger.info(f"Found {len(pelelangan_items)} Pelelangan Umum items")
            
            # Simpan ke CSV
            csv_file = self._save_to_csv(pelelangan_items, 'pelelangan_umum')
            logger.info(f"Saved Pelelangan Umum data to {csv_file}")
            
            # Download attachments jika diminta
            if download_attachments:
                logger.info("Downloading attachments for Pelelangan Umum")
                for item in pelelangan_items:
                    if 'attachments' in item and item['attachments']:
                        try:
                            attachments = item['attachments']
                            if isinstance(attachments, str):
                                try:
                                    attachments = json.loads(attachments)
                                except:
                                    logger.warning(f"Failed to parse attachments JSON: {attachments}")
                                    continue
                                    
                            if isinstance(attachments, list):
                                for attachment in attachments:
                                    if isinstance(attachment, dict) and 'url' in attachment:
                                        self.download_attachment(attachment['url'], self.data_dir, 'pelelangan')
                                        # Tambahkan delay antara download
                                        time.sleep(random.uniform(1, 3))
                        except Exception as e:
                            logger.error(f"Error downloading attachment: {str(e)}")
            
            results['pelelangan'] = pelelangan_items
        else:
            logger.warning("No Pelelangan Umum data found")
        
        # Simpan hasil gabungan ke file JSON untuk referensi
        try:
            with open(os.path.join(self.data_dir, f"scraper_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"), 'w', encoding='utf-8') as f:
                json.dump(results, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error(f"Error saving results to JSON: {str(e)}")
        
        return results
        
    def download_attachment(self, url, output_dir, category):
        """Download attachment from URL"""
        if not url:
            logger.warning("Empty URL provided for attachment download")
            return False
            
        if not self.session_valid and not self.initialize_session():
            logger.error("Failed to initialize session for attachment download")
            return False
            
        try:
            # Extract filename from URL
            if 'fileName=' in url:
                filename = url.split('fileName=')[-1]
            elif '/' in url:
                filename = url.split('/')[-1]
            else:
                filename = f"attachment_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
                
            filename = urllib.parse.unquote(filename).replace('%20', '_')
            
            # Create attachments directory if it doesn't exist
            attachments_dir = os.path.join(output_dir, 'attachments', category)
            os.makedirs(attachments_dir, exist_ok=True)
            
            output_path = os.path.join(attachments_dir, filename)
            
            # Cek apakah file sudah ada
            if os.path.exists(output_path):
                logger.info(f"File already exists: {output_path}")
                return output_path
            
            # Extract file ID from URL
            file_id = None
            if 'fileId=' in url:
                file_id = url.split('fileId=')[1].split('&')[0] if '&' in url.split('fileId=')[1] else url.split('fileId=')[1]
            elif '/download/' in url and '/' in url.split('/download/')[1]:
                parts = url.split('/download/')[1].split('/')
                if len(parts) >= 2:
                    file_id = parts[1]
                    if '?' in file_id:
                        file_id = file_id.split('?')[0]
            
            if not file_id:
                # Coba ekstrak file ID dari nama file
                if filename and filename.isdigit():
                    file_id = filename
                else:
                    logger.warning(f"Could not extract file ID from URL: {url}")
                    # Tetap lanjutkan, mungkin URL sudah lengkap
            
            # Try different URL formats
            urls_to_try = [
                url,  # Original URL
                f"{self.base_url}/download/prakualifikasi/{file_id}/{filename}" if file_id else None,  # Format seen in browser
                f"{self.base_url}/download/pelelangan/{file_id}/{filename}" if file_id else None,  # Format for pelelangan
                f"{self.base_url}/download/tnd/ann.jwebs?fileId={file_id}&fileName={filename}" if file_id else None,  # URL with fileId and fileName
                f"{self.base_url}/download/tnd/ann.jwebs?fileId={file_id}" if file_id else None,  # URL with just fileId
                f"{self.base_url}/download/file?id={file_id}" if file_id else None,  # Alternative URL format
                f"{self.base_url}/download/attachment?id={file_id}" if file_id else None,  # Another alternative
                f"{self.base_url}/download/blob?id={file_id}" if file_id else None,  # Another format
                f"{self.base_url}/download/file/blob?id={file_id}" if file_id else None  # Yet another format
            ]
            
            # Filter out None values
            urls_to_try = [u for u in urls_to_try if u]
            
            # Tambahkan URL dari format yang terlihat di screenshot
            if file_id:
                # Format URL yang terlihat di screenshot untuk berbagai jenis dokumen
                for doc_type in ['prakualifikasi', 'pelelangan', 'tender', 'pengumuman', 'hasil']:
                    urls_to_try.append(f"{self.base_url}/download/{doc_type}/{file_id}/{filename}")
            
            success = False
            for try_url in urls_to_try:
                if not try_url:
                    continue
                    
                try:
                    logger.info(f"Trying to download from: {try_url}")
                    
                    # Add comprehensive headers to mimic browser behavior
                    headers = {
                        'Referer': f"{self.base_url}/index.jwebs",
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
                        'Connection': 'keep-alive',
                        'Sec-Fetch-Dest': 'document',
                        'Sec-Fetch-Mode': 'navigate',
                        'Sec-Fetch-Site': 'same-origin',
                        'Sec-Fetch-User': '?1',
                        'Upgrade-Insecure-Requests': '1',
                        'User-Agent': self.user_agent
                    }
                    
                    # Ensure cookies are sent with the request
                    cookies = self.session.cookies.get_dict()
                    logger.info(f"Using cookies: {cookies}")
                    
                    # Download file with a longer timeout
                    response = self.session.get(try_url, headers=headers, stream=True, timeout=60, allow_redirects=True)
                    
                    # Log response details for debugging
                    logger.info(f"Response status: {response.status_code}, Content-Type: {response.headers.get('Content-Type', 'unknown')}, Content-Length: {response.headers.get('Content-Length', 'unknown')}")
                    
                    # Check if response is valid
                    if response.status_code == 200:
                        content_length = int(response.headers.get('Content-Length', 0))
                        content_type = response.headers.get('Content-Type', '')
                        
                        # Check if it's likely a PDF or valid file
                        is_valid_content = (
                            ('application/pdf' in content_type) or 
                            ('application/octet-stream' in content_type) or 
                            (content_length > 10000 and content_length != 1384)  # Avoid error pages
                        )
                        
                        if is_valid_content:
                            # Save file
                            filepath = os.path.join(attachments_dir, filename)
                            with open(filepath, 'wb') as f:
                                for chunk in response.iter_content(chunk_size=8192):
                                    if chunk:
                                        f.write(chunk)
                                        
                            logger.info(f"Attachment saved to {filepath}")
                            success = True
                            break
                        else:
                            logger.warning(f"Invalid content from {try_url}: Type={content_type}, Length={content_length}")
                            # Save the response content for inspection
                            error_path = os.path.join(self.data_dir, f"error_response_{file_id if file_id else 'unknown'}.html")
                            with open(error_path, 'wb') as f:
                                f.write(response.content)
                            logger.info(f"Saved error response to {error_path}")
                    else:
                        logger.warning(f"Invalid response from {try_url}: Status {response.status_code}")
                except Exception as e:
                    logger.warning(f"Failed to download from {try_url}: {str(e)}")
                    
            if not success:
                logger.warning(f"Failed to download attachment with regular methods, trying Selenium")
                return self.download_attachment_with_selenium(url, output_dir, category, filename)
                
            return True
        except Exception as e:
            logger.error(f"Error downloading attachment: {str(e)}")
            return False

    def download_attachment_with_selenium(self, url, output_dir, category, filename=None):
        """Download attachment using Selenium as a fallback method"""
        if not filename and 'fileName=' in url:
            filename = url.split('fileName=')[-1]
        elif not filename and '/' in url:
            filename = url.split('/')[-1]
        
        if not filename:
            filename = f"attachment_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        
        filename = urllib.parse.unquote(filename).replace('%20', '_')
        
        # Create attachments directory if it doesn't exist
        attachments_dir = os.path.join(output_dir, 'attachments', category)
        os.makedirs(attachments_dir, exist_ok=True)
        
        # Setup Chrome options
        chrome_options = Options()
        chrome_options.add_argument("--headless")
        chrome_options.add_argument("--disable-gpu")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument(f"user-agent={self.user_agent}")
        
        # Set download preferences
        temp_dir = tempfile.mkdtemp()
        prefs = {
            "download.default_directory": temp_dir,
            "download.prompt_for_download": False,
            "download.directory_upgrade": True,
            "plugins.always_open_pdf_externally": True
        }
        chrome_options.add_experimental_option("prefs", prefs)
        
        driver = None
        try:
            logger.info(f"Selenium: Starting Chrome to download {url}")
            # Gunakan webdriver-manager untuk mengelola driver Chrome
            service = Service(ChromeDriverManager().install())
            driver = webdriver.Chrome(service=service, options=chrome_options)
            
            # First, visit the main page to get cookies
            driver.get(self.base_url)
            logger.info(f"Selenium: Visited main page: {self.base_url}")
            time.sleep(3)  # Wait for page to load
            
            # Coba login jika ada form login
            try:
                username_field = driver.find_element(By.ID, "username")
                password_field = driver.find_element(By.ID, "password")
                login_button = driver.find_element(By.CSS_SELECTOR, "button[type='submit']")
                
                if username_field and password_field and login_button:
                    logger.info("Selenium: Found login form, attempting to login")
                    username_field.send_keys(self.config['scraper'].get('username', ''))
                    password_field.send_keys(self.config['scraper'].get('password', ''))
                    login_button.click()
                    time.sleep(3)  # Wait for login to complete
            except Exception as e:
                logger.info(f"Selenium: No login form found or login failed: {str(e)}")
            
            # Ekstrak file_id dari URL jika ada
            file_id = None
            if 'fileId=' in url:
                file_id = url.split('fileId=')[1].split('&')[0] if '&' in url.split('fileId=')[1] else url.split('fileId=')[1]
            elif '/download/' in url and '/' in url.split('/download/')[1]:
                parts = url.split('/download/')[1].split('/')
                if len(parts) >= 2:
                    file_id = parts[1]
                    if '?' in file_id:
                        file_id = file_id.split('?')[0]
            
            # Jika kita memiliki file_id, coba akses halaman detail tender terlebih dahulu
            if file_id:
                try:
                    # Coba akses halaman detail tender
                    detail_url = f"{self.base_url}/detail/{file_id}"
                    logger.info(f"Selenium: Trying to access detail page: {detail_url}")
                    driver.get(detail_url)
                    time.sleep(5)  # Wait for page to load
                    
                    # Cari tombol "Lebih lanjut" dan klik
                    lebih_lanjut_buttons = driver.find_elements(By.XPATH, "//a[contains(text(), 'Lebih lanjut')]")
                    if not lebih_lanjut_buttons:
                        lebih_lanjut_buttons = driver.find_elements(By.XPATH, "//button[contains(text(), 'Lebih lanjut')]")
                    
                    if lebih_lanjut_buttons:
                        logger.info(f"Selenium: Found {len(lebih_lanjut_buttons)} 'Lebih lanjut' buttons")
                        for button in lebih_lanjut_buttons:
                            try:
                                logger.info("Selenium: Clicking 'Lebih lanjut' button")
                                button.click()
                                time.sleep(3)
                                break
                            except Exception as e:
                                logger.warning(f"Selenium: Error clicking 'Lebih lanjut' button: {str(e)}")
                    
                    # Cari link attachment dan klik
                    attachment_links = driver.find_elements(By.XPATH, "//a[contains(text(), 'Attachment')]")
                    if attachment_links:
                        logger.info(f"Selenium: Found {len(attachment_links)} attachment links")
                        for link in attachment_links:
                            try:
                                href = link.get_attribute("href")
                                logger.info(f"Selenium: Clicking attachment link with href: {href}")
                                link.click()
                                time.sleep(5)
                                break
                            except Exception as e:
                                logger.warning(f"Selenium: Error clicking attachment link: {str(e)}")
                except Exception as e:
                    logger.warning(f"Selenium: Error accessing detail page: {str(e)}")
            
            # Now try to download the file directly
            logger.info(f"Selenium: Attempting to download: {url}")
            driver.get(url)
            time.sleep(5)  # Wait for download to start
            
            # Check if we're on a download page or a 404 page
            if "404" in driver.title or "Not Found" in driver.page_source:
                logger.warning(f"Selenium: 404 page encountered for {url}")
                
                # Try to find and click any download links on the page
                logger.info("Selenium: Trying download strategy 1")
                download_links = driver.find_elements(By.CSS_SELECTOR, "a[href*='download']")
                logger.info(f"Selenium: Found {len(download_links)} potential download links")
                
                for link in download_links:
                    try:
                        href = link.get_attribute("href")
                        text = link.text
                        logger.info(f"Selenium: Clicking download link - Text: {text}, Href: {href}")
                        link.click()
                        time.sleep(3)
                        break
                    except Exception as e:
                        logger.warning(f"Selenium: Error clicking download link: {str(e)}")
            
            # Jika tidak ada link download, coba cari tombol "Lebih lanjut"
            if len(download_links) == 0:
                logger.info("Selenium: Trying to find 'Lebih lanjut' buttons")
                lebih_lanjut_buttons = driver.find_elements(By.XPATH, "//button[contains(text(), 'Lebih lanjut')]")
                if not lebih_lanjut_buttons:
                    lebih_lanjut_buttons = driver.find_elements(By.XPATH, "//a[contains(text(), 'Lebih lanjut')]")
                
                logger.info(f"Selenium: Found {len(lebih_lanjut_buttons)} 'Lebih lanjut' buttons")
                
                for button in lebih_lanjut_buttons:
                    try:
                        logger.info(f"Selenium: Clicking 'Lebih lanjut' button")
                        button.click()
                        time.sleep(3)
                        
                        # Setelah klik, cari link download lagi
                        download_links = driver.find_elements(By.CSS_SELECTOR, "a[href*='download']")
                        attachment_links = driver.find_elements(By.XPATH, "//a[contains(text(), 'Attachment')]")
                        all_links = download_links + attachment_links
                        
                        logger.info(f"Selenium: Found {len(all_links)} download/attachment links after clicking 'Lebih lanjut'")
                        
                        for link in all_links:
                            try:
                                href = link.get_attribute("href")
                                text = link.text
                                logger.info(f"Selenium: Clicking link - Text: {text}, Href: {href}")
                                link.click()
                                time.sleep(3)
                                break
                            except Exception as e:
                                logger.warning(f"Selenium: Error clicking link: {str(e)}")
                        
                        break
                    except Exception as e:
                        logger.warning(f"Selenium: Error clicking 'Lebih lanjut' button: {str(e)}")
            
            # Wait for download to complete
            time.sleep(10)
            
            # Check if file was downloaded
            downloaded_files = os.listdir(temp_dir)
            logger.info(f"Selenium: Files in download directory: {downloaded_files}")
            
            if downloaded_files:
                # Move the first downloaded file to the attachments directory
                downloaded_file = os.path.join(temp_dir, downloaded_files[0])
                target_file = os.path.join(attachments_dir, filename)
                
                with open(downloaded_file, 'rb') as src, open(target_file, 'wb') as dst:
                    dst.write(src.read())
                    
                logger.info(f"Selenium: Successfully downloaded file to {target_file}")
                return True
            else:
                logger.warning("Selenium: No files were downloaded")
                
                # Coba ambil konten halaman jika mungkin berisi PDF inline
                try:
                    page_source = driver.page_source
                    if 'application/pdf' in page_source or '<embed' in page_source or '<iframe' in page_source:
                        logger.info("Selenium: Page might contain inline PDF, trying to extract")
                        
                        # Coba cari iframe atau embed yang berisi PDF
                        pdf_elements = driver.find_elements(By.XPATH, "//iframe[contains(@src, '.pdf')] | //embed[contains(@src, '.pdf')]")
                        
                        if pdf_elements:
                            for elem in pdf_elements:
                                pdf_url = elem.get_attribute("src")
                                if pdf_url:
                                    logger.info(f"Selenium: Found PDF URL in iframe/embed: {pdf_url}")
                                    
                                    # Download PDF dari URL yang ditemukan
                                    try:
                                        pdf_response = self.session.get(pdf_url, headers=headers, stream=True, timeout=30)
                                        if pdf_response.status_code == 200 and ('application/pdf' in pdf_response.headers.get('Content-Type', '')):
                                            target_file = os.path.join(attachments_dir, filename)
                                            with open(target_file, 'wb') as f:
                                                for chunk in pdf_response.iter_content(chunk_size=8192):
                                                    if chunk:
                                                        f.write(chunk)
                                            logger.info(f"Selenium: Successfully downloaded inline PDF to {target_file}")
                                            return True
                                    except Exception as e:
                                        logger.warning(f"Selenium: Error downloading inline PDF: {str(e)}")
                except Exception as e:
                    logger.warning(f"Selenium: Error checking for inline PDF: {str(e)}")
                
                return False
                
        except Exception as e:
            logger.error(f"Selenium: Error downloading file: {str(e)}")
            return False
        finally:
            if driver:
                driver.quit()
            
            # Clean up temp directory
            try:
                import shutil
                shutil.rmtree(temp_dir)
            except Exception as e:
                logger.warning(f"Selenium: Error cleaning up temp directory: {str(e)}") 