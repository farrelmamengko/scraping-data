#!/usr/bin/env python3
import os
import sys
import logging
import configparser

# Tambahkan direktori root proyek ke sys.path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(os.path.join(project_root, 'logs', 'app.log'), mode='a')
    ]
)

# Pastikan direktori logs ada
os.makedirs(os.path.join(project_root, 'logs'), exist_ok=True)

# Pastikan direktori config ada
config_dir = os.path.join(project_root, 'config')
os.makedirs(config_dir, exist_ok=True)

# Periksa apakah file config.ini ada, jika tidak, buat file default
config_path = os.path.join(config_dir, 'config.ini')
if not os.path.exists(config_path):
    print(f"Creating default config file at {config_path}")
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
else:
    print(f"Using existing config file at {config_path}")
    
    # Verifikasi bahwa file konfigurasi memiliki bagian [scraper]
    config = configparser.ConfigParser()
    config.read(config_path)
    if 'scraper' not in config:
        print(f"Section [scraper] not found in {config_path}, creating new config file")
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

# Pastikan direktori data ada
os.makedirs(os.path.join(project_root, 'data'), exist_ok=True)
os.makedirs(os.path.join(project_root, 'data', 'attachments'), exist_ok=True)

# Import app setelah semua setup selesai
from app import app

if __name__ == '__main__':
    # Jalankan aplikasi Flask
    print("Starting CIVD SKK Migas Web App...")
    print("Access the web interface at http://localhost:5000")
    app.run(host='0.0.0.0', port=5000, debug=True) 