from flask import Flask, render_template, request, redirect, url_for, flash, send_file, abort, jsonify
import pandas as pd
import os
import glob
from datetime import datetime, timedelta
import json
import sys
import logging
from io import BytesIO
import urllib.parse
import threading
import traceback
import time

# Tambahkan path ke direktori utama proyek
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

logger = logging.getLogger(__name__)

# Inisialisasi aplikasi Flask
app = Flask(__name__)
app.secret_key = 'civd_scraper_secret_key'

# Variabel global untuk status refresh dan cache data
is_refreshing = False
last_refresh_time = None
cached_prakualifikasi_data = []
cached_pelelangan_data = []
cache_timestamp = None

# Import scraper hanya ketika diperlukan, bukan saat startup
scraper = None

def get_scraper():
    """Lazy loading untuk scraper - hanya inisialisasi ketika diperlukan"""
    global scraper
    if scraper is None:
        try:
            # Import scraper hanya ketika diperlukan
            from scraper.civd_scraper import CIVDScraper
            
            # Inisialisasi scraper dengan path konfigurasi eksplisit
            config_path = os.path.join(project_root, 'config', 'config.ini')
            scraper = CIVDScraper(config_path=config_path)
            logger.info(f"Scraper initialized with config from {config_path}")
        except Exception as e:
            logger.error(f"Error initializing scraper: {str(e)}")
            logger.error(traceback.format_exc())
            # Buat scraper dengan konfigurasi default
            from scraper.civd_scraper import CIVDScraper
            scraper = CIVDScraper()
            logger.info("Scraper initialized with default config")
    return scraper

def get_cached_data(force_reload=False):
    """Get cached data or load from CSV files"""
    global cached_prakualifikasi_data, cached_pelelangan_data, cache_timestamp
    
    # Jika data sudah di-cache dan tidak dipaksa reload, gunakan cache
    if not force_reload and cache_timestamp and cached_prakualifikasi_data and cached_pelelangan_data:
        # Periksa apakah cache masih valid (kurang dari 5 menit)
        if datetime.now() - cache_timestamp < timedelta(minutes=5):
            logger.info("Using cached data (less than 5 minutes old)")
            return cached_prakualifikasi_data, cached_pelelangan_data
    
    logger.info("Loading data from CSV files")
    prakualifikasi_data = []
    pelelangan_data = []
    
    # Cari semua file CSV dan gabungkan datanya
    for file_type in ['prakualifikasi', 'pelelangan_umum']:
        pattern = os.path.join(project_root, 'data', f"{file_type}_*.csv")
        files = sorted(glob.glob(pattern), reverse=True)
        
        # Log semua file yang ditemukan
        logger.info(f"Found {len(files)} {file_type} CSV files: {[os.path.basename(f) for f in files]}")
        
        # Ambil maksimal 10 file terbaru untuk menghindari duplikasi data lama
        files = files[:10] if len(files) > 10 else files
        
        combined_data = []
        unique_identifiers = set()  # Untuk mencegah duplikasi berdasarkan judul saja
        
        if files:
            for file in files:
                try:
                    logger.info(f"Processing file: {os.path.basename(file)}")
                    df = pd.read_csv(file)
                    # Pastikan kolom yang diperlukan ada
                    if 'title' not in df.columns:
                        logger.warning(f"File {file} tidak memiliki kolom 'title', melewati file ini")
                        continue
                        
                    # Tambahkan kolom date jika tidak ada
                    if 'date' not in df.columns and 'scraped_at' in df.columns:
                        df['date'] = df['scraped_at']
                    
                    records = df.to_dict('records')
                    logger.info(f"File {os.path.basename(file)} contains {len(records)} records")
                    
                    # Tambahkan hanya data yang belum ada (berdasarkan judul saja)
                    added_from_file = 0
                    for record in records:
                        title = record.get('title', '')
                        
                        # Gunakan judul sebagai identifier unik
                        if title and title not in unique_identifiers:
                            unique_identifiers.add(title)
                            combined_data.append(record)
                            added_from_file += 1
                    
                    logger.info(f"Added {added_from_file} unique records from {os.path.basename(file)}")
                            
                except Exception as e:
                    logger.error(f"Error loading data from CSV {file}: {str(e)}")
            
            logger.info(f"Loaded {len(combined_data)} unique {file_type} items from {len(files)} files")
            
            if file_type == 'prakualifikasi':
                prakualifikasi_data = combined_data
            else:
                pelelangan_data = combined_data
    
    # Update cache
    cached_prakualifikasi_data = prakualifikasi_data
    cached_pelelangan_data = pelelangan_data
    cache_timestamp = datetime.now()
    
    return prakualifikasi_data, pelelangan_data

def background_refresh(download_attachments=True):
    """Background refresh function"""
    global is_refreshing, last_refresh_time
    
    if is_refreshing:
        logger.info("Refresh already in progress, skipping")
        return
    
    is_refreshing = True
    start_time = time.time()
    
    try:
        # Dapatkan instance scraper
        scraper_instance = get_scraper()
        
        if not scraper_instance.session_valid:
            scraper_instance.initialize_session()
        
        results = scraper_instance.run_scraper(download_attachments=download_attachments)
        last_refresh_time = datetime.now()
        
        # Reload cache setelah refresh
        get_cached_data(force_reload=True)
        
        elapsed_time = time.time() - start_time
        logger.info(f"Background refresh completed in {elapsed_time:.2f} seconds")
    except Exception as e:
        logger.error(f"Error in background refresh: {str(e)}")
        logger.error(traceback.format_exc())
    finally:
        is_refreshing = False

@app.route('/')
@app.route('/page/<int:page>')
def index(page=1):
    """Main page with pagination"""
    # Gunakan data yang sudah ada di cache, jangan unduh ulang
    prakualifikasi_data, pelelangan_data = get_cached_data()
    
    # Jika tidak ada data sama sekali, mulai refresh di background
    if not prakualifikasi_data and not pelelangan_data and not is_refreshing:
        thread = threading.Thread(target=background_refresh, args=(False,))
        thread.daemon = True
        thread.start()
        flash("Memuat data untuk pertama kali, ini mungkin memerlukan waktu beberapa saat", "info")
    
    # Pagination untuk kedua jenis tender secara terpisah
    per_page = 6  # Jumlah item per halaman (diubah menjadi 6)
    
    # Urutkan data berdasarkan tanggal (terbaru dulu)
    prakualifikasi_data.sort(key=lambda x: x.get('date', ''), reverse=True)
    pelelangan_data.sort(key=lambda x: x.get('date', ''), reverse=True)
    
    # Hitung total halaman untuk masing-masing jenis tender
    total_prakualifikasi = len(prakualifikasi_data)
    total_pelelangan = len(pelelangan_data)
    
    total_pages_prakualifikasi = (total_prakualifikasi + per_page - 1) // per_page  # Pembulatan ke atas
    total_pages_pelelangan = (total_pelelangan + per_page - 1) // per_page  # Pembulatan ke atas
    
    # Pastikan halaman yang diminta valid
    if page < 1:
        page = 1
    elif page > max(total_pages_prakualifikasi, total_pages_pelelangan) and max(total_pages_prakualifikasi, total_pages_pelelangan) > 0:
        page = max(total_pages_prakualifikasi, total_pages_pelelangan)
    
    # Potong data sesuai halaman yang diminta
    start_idx_prakualifikasi = (page - 1) * per_page
    end_idx_prakualifikasi = min(start_idx_prakualifikasi + per_page, total_prakualifikasi)
    
    start_idx_pelelangan = (page - 1) * per_page
    end_idx_pelelangan = min(start_idx_pelelangan + per_page, total_pelelangan)
    
    current_prakualifikasi_items = prakualifikasi_data[start_idx_prakualifikasi:end_idx_prakualifikasi] if start_idx_prakualifikasi < total_prakualifikasi else []
    current_pelelangan_items = pelelangan_data[start_idx_pelelangan:end_idx_pelelangan] if start_idx_pelelangan < total_pelelangan else []
    
    # Tambahkan informasi jenis tender
    for item in current_prakualifikasi_items:
        item['type'] = 'prakualifikasi'
    
    for item in current_pelelangan_items:
        item['type'] = 'pelelangan'
    
    return render_template(
        'simple_tender.html',
        prakualifikasi=current_prakualifikasi_items,
        pelelangan=current_pelelangan_items,
        page=page,
        total_pages_prakualifikasi=total_pages_prakualifikasi,
        total_pages_pelelangan=total_pages_pelelangan,
        total_prakualifikasi=total_prakualifikasi,
        total_pelelangan=total_pelelangan,
        per_page=per_page,
        now=datetime.now(),
        is_refreshing=is_refreshing,
        last_refresh_time=last_refresh_time
    )

@app.route('/files')
def files_list():
    """Halaman yang menampilkan daftar file hasil scraping"""
    # Dapatkan semua file CSV di folder data
    csv_files = []
    for file_type in ['prakualifikasi', 'pelelangan_umum']:
        pattern = os.path.join(project_root, 'data', f"{file_type}_*.csv")
        files = glob.glob(pattern)
        for file in files:
            filename = os.path.basename(file)
            # Ekstrak timestamp dari nama file
            try:
                date_str = filename.split('_')[1].split('.')[0]
                date_obj = datetime.strptime(date_str, '%Y%m%d_%H%M%S')
                formatted_date = date_obj.strftime('%d %B %Y %H:%M:%S')
            except:
                formatted_date = "Unknown date"
            
            csv_files.append({
                'path': file,
                'filename': filename,
                'type': file_type,
                'date': formatted_date
            })
    
    # Urutkan file berdasarkan tanggal terbaru
    csv_files.sort(key=lambda x: x['filename'], reverse=True)
    
    return render_template('index.html', files=csv_files, is_refreshing=is_refreshing, last_refresh_time=last_refresh_time)

@app.route('/simple')
def simple_tender():
    """Halaman sederhana yang menampilkan daftar tender"""
    prakualifikasi_data, pelelangan_data = get_cached_data()
    
    all_tenders = []
    
    # Tambahkan informasi jenis tender
    for record in prakualifikasi_data:
        record_copy = record.copy()
        record_copy['type'] = 'prakualifikasi'
        all_tenders.append(record_copy)
    
    for record in pelelangan_data:
        record_copy = record.copy()
        record_copy['type'] = 'pelelangan_umum'
        all_tenders.append(record_copy)
    
    # Urutkan tender berdasarkan tanggal (jika ada)
    all_tenders.sort(key=lambda x: x.get('scraped_at', ''), reverse=True)
    
    return render_template('simple_tender.html', tenders=all_tenders, is_refreshing=is_refreshing, last_refresh_time=last_refresh_time)

@app.route('/view/<path:file_path>')
def view_file(file_path):
    """Menampilkan isi file CSV"""
    # Pastikan file berada di folder data
    full_path = os.path.join(project_root, 'data', os.path.basename(file_path))
    if not os.path.exists(full_path) or not full_path.endswith('.csv'):
        return redirect(url_for('index'))
    
    try:
        # Baca file CSV
        df = pd.read_csv(full_path)
        
        # Konversi DataFrame ke list of dicts untuk template
        records = df.to_dict('records')
        
        # Dapatkan nama kolom
        columns = df.columns.tolist()
        
        # Dapatkan tipe file (prakualifikasi atau pelelangan_umum)
        file_type = "Undangan Prakualifikasi" if "prakualifikasi" in os.path.basename(full_path) else "Pelelangan Umum"
        
        return render_template('view.html', 
                              records=records, 
                              columns=columns, 
                              file_path=file_path,
                              file_name=os.path.basename(full_path),
                              file_type=file_type,
                              is_refreshing=is_refreshing,
                              last_refresh_time=last_refresh_time)
    except Exception as e:
        error_message = f"Error membaca file: {str(e)}"
        return render_template('error.html', error=error_message)

@app.route('/api/data')
def api_data():
    """API endpoint untuk mendapatkan data tender terbaru"""
    file_type = request.args.get('type', 'all')
    
    prakualifikasi_data, pelelangan_data = get_cached_data()
    
    if file_type == 'all':
        return jsonify({
            'prakualifikasi': prakualifikasi_data,
            'pelelangan': pelelangan_data
        })
    elif file_type == 'prakualifikasi':
        return jsonify(prakualifikasi_data)
    elif file_type == 'pelelangan_umum':
        return jsonify(pelelangan_data)
    else:
        return jsonify([])

@app.route('/dashboard')
def dashboard():
    """Dashboard untuk visualisasi data tender"""
    return render_template('dashboard.html', is_refreshing=is_refreshing, last_refresh_time=last_refresh_time)

@app.route('/download/<path:filename>')
def download_pdf(filename):
    """Download PDF file"""
    try:
        # Ambil parameter dari query string
        category = request.args.get('category')
        file_id = request.args.get('file_id')
        file_name = request.args.get('file_name')
        
        # Decode filename jika perlu
        decoded_file_name = urllib.parse.unquote(filename)
        
        # Log informasi untuk debugging
        logger.info(f"Attempting to download PDF: {decoded_file_name}, category: {category}, file_id: {file_id}, file_name: {file_name}")
        
        # Coba cari file di kedua direktori attachments
        for possible_category in ['prakualifikasi', 'pelelangan']:
            if category and possible_category != category:
                continue  # Skip jika kategori tidak cocok
                
            attachments_dir = os.path.join(project_root, 'data', 'attachments', possible_category)
            if os.path.exists(attachments_dir):
                # Cari file dengan nama yang mirip
                for file in os.listdir(attachments_dir):
                    if decoded_file_name.replace(' ', '_') in file:
                        file_path = os.path.join(attachments_dir, file)
                        logger.info(f"Found existing PDF file: {file_path}")
                        
                        # Kirim file ke client
                        return send_file(
                            file_path,
                            mimetype='application/pdf',
                            as_attachment=True,
                            download_name=decoded_file_name
                        )
        
        # Jika file tidak ditemukan, coba download dengan scraper
        scraper_instance = get_scraper()
        if not scraper_instance.session_valid:
            scraper_instance.initialize_session()
        
        # Coba download dengan scraper untuk kedua kategori
        for possible_category in ['prakualifikasi', 'pelelangan']:
            if category and possible_category != category:
                continue  # Skip jika kategori tidak cocok
                
            if scraper_instance.download_attachment(filename, project_root, possible_category):
                # Cek lagi apakah file sudah ada di direktori attachments
                attachments_dir = os.path.join(project_root, 'data', 'attachments', possible_category)
                for file in os.listdir(attachments_dir):
                    if decoded_file_name.replace(' ', '_') in file:
                        file_path = os.path.join(attachments_dir, file)
                        logger.info(f"Found PDF file after download: {file_path}")
                        
                        # Kirim file ke client
                        return send_file(
                            file_path,
                            mimetype='application/pdf',
                            as_attachment=True,
                            download_name=decoded_file_name
                        )
        
        # Jika semua metode gagal, tanyakan kepada pengguna apakah ingin mencoba dengan Selenium
        return render_template('download_failed.html', 
                              filename=decoded_file_name,
                              error="File tidak dapat diunduh dengan metode standar")
    except Exception as e:
        logger.error(f"Error in download_pdf: {str(e)}")
        return render_template('download_failed.html', 
                              filename=decoded_file_name,
                              error=str(e))

@app.route('/download_with_selenium/<path:filename>')
def download_with_selenium(filename):
    """Download file using Selenium as a last resort"""
    try:
        # Decode filename jika perlu
        decoded_file_name = urllib.parse.unquote(filename)
        
        # Log informasi untuk debugging
        logger.info(f"Attempting to download PDF with Selenium: {decoded_file_name}")
        
        # Dapatkan instance scraper
        scraper_instance = get_scraper()
        if not scraper_instance.session_valid:
            scraper_instance.initialize_session()
        
        # Buat URL untuk download dari website CIVD
        base_url = scraper_instance.base_url
        
        # Coba download dengan Selenium untuk kedua kategori
        for category in ['prakualifikasi', 'pelelangan']:
            selenium_url = f"{base_url}/download/{category}/{decoded_file_name}"
            
            # Jalankan Selenium di thread terpisah untuk tidak memblokir aplikasi
            def selenium_download_thread():
                try:
                    scraper_instance.download_attachment_with_selenium(selenium_url, project_root, category, decoded_file_name)
                    logger.info("Selenium download completed")
                except Exception as e:
                    logger.error(f"Error in Selenium download: {str(e)}")
            
            thread = threading.Thread(target=selenium_download_thread)
            thread.daemon = True
            thread.start()
            
            flash("Pengunduhan dengan Selenium dimulai di latar belakang. File akan tersedia setelah proses selesai.", "info")
            return redirect(url_for('index'))
    except Exception as e:
        logger.error(f"Error in download_with_selenium: {str(e)}")
        return render_template('download_failed.html', 
                              filename=decoded_file_name,
                              error=f"Error Selenium: {str(e)}")

@app.route('/refresh')
def refresh_data():
    """Refresh data from the website"""
    global is_refreshing
    
    if is_refreshing:
        flash("Proses refresh sedang berjalan, mohon tunggu", "info")
        return redirect(url_for('index'))
    
    try:
        # Jalankan refresh di thread terpisah
        download_attachments = request.args.get('download_attachments', 'false').lower() == 'true'
        thread = threading.Thread(target=background_refresh, args=(download_attachments,))
        thread.daemon = True
        thread.start()
        
        flash("Pembaruan data dimulai di latar belakang", "success")
    except Exception as e:
        logger.error(f"Error starting refresh: {str(e)}")
        flash(f"Error starting refresh: {str(e)}", "error")
    
    return redirect(url_for('index'))

@app.route('/api/tenders')
def api_tenders():
    """API endpoint for tender data"""
    prakualifikasi_data, pelelangan_data = get_cached_data()
    
    return jsonify({
        'prakualifikasi': prakualifikasi_data,
        'pelelangan': pelelangan_data,
        'timestamp': datetime.now().isoformat(),
        'is_refreshing': is_refreshing,
        'last_refresh_time': last_refresh_time.isoformat() if last_refresh_time else None
    })

@app.route('/api/status')
def api_status():
    """API endpoint for refresh status"""
    return jsonify({
        'is_refreshing': is_refreshing,
        'last_refresh_time': last_refresh_time.isoformat() if last_refresh_time else None,
        'cache_timestamp': cache_timestamp.isoformat() if cache_timestamp else None
    })

@app.template_filter('to_json')
def to_json(value):
    return json.dumps(value)

if __name__ == '__main__':
    # Preload data cache before starting server
    get_cached_data()
    app.run(host='0.0.0.0', port=5000, debug=True) 