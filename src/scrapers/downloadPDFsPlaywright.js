const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// Direktori tujuan unduhan
const downloadPath = path.join(__dirname, '..', 'download pdf');

// Pastikan direktori unduhan ada
if (!fs.existsSync(downloadPath)) {
  fs.mkdirSync(downloadPath, { recursive: true });
  console.log(`[Playwright Downloader] Direktori unduhan dibuat: ${downloadPath}`);
}

// Fungsi untuk membersihkan nama file
function sanitizeFilename(filename) {
    if (!filename) return `downloaded_file_${Date.now()}.pdf`;
    return filename.replace(/[\\/?:*"<>|]/g, '-').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_.-]/g, '');
}

/**
 * Mengunduh PDF untuk daftar tender yang diberikan menggunakan Playwright.
 * @param {Array<{id: string, attachmentName: string}>} tenders - Array objek tender dengan id dan nama attachment.
 */
async function downloadPdfsWithPlaywright(tenders) { // Terima tenders sebagai argumen
  if (!tenders || tenders.length === 0) {
    console.log("[Playwright Downloader] Tidak ada tender yang diberikan untuk diunduh.");
    return;
  }

  let browser = null; // Definisikan di luar try agar bisa diakses di finally
  try {
    // 1. Setup Playwright (dipindahkan dari luar loop)
    console.log('[Playwright Downloader] Memulai browser Playwright...');
    browser = await chromium.launch({
      headless: true
    });
    const context = await browser.newContext({
      acceptDownloads: true,
    });
    const page = await context.newPage();

    // 2. Navigasi ke halaman utama
    const targetUrl = 'https://civd.skkmigas.go.id/index.jwebs';
    console.log(`[Playwright Downloader] Navigasi ke ${targetUrl}...`);
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 90000 });
    console.log('[Playwright Downloader] Halaman utama berhasil dimuat.');

    // 3. Iterasi dan unduh
    console.log(`[Playwright Downloader] Memulai proses unduhan untuk ${tenders.length} file...`);
    let successCount = 0;
    let failCount = 0;

    for (const tender of tenders) {
      // Validasi data tender yang diterima
      if (!tender || !tender.id || !tender.attachmentName) { 
        console.warn('[Playwright Downloader] Data tender tidak lengkap, melewati:', tender);
        failCount++;
        continue;
      }

      console.log(`[Playwright Downloader] -> Mencari tombol unduh untuk ID: ${tender.id} (${tender.attachmentName})`);
      const downloadSelector = `a.download-btn[data-file-id="${tender.id}"]`;

      try {
        const downloadElement = await page.locator(downloadSelector).first();

        if (await downloadElement.isVisible({ timeout: 5000 })) { // Tambahkan timeout pendek untuk cek visibilitas
          console.log(`   [Playwright Downloader] Tombol ditemukan untuk ID ${tender.id}. Memulai proses unduhan...`);
          const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
          await downloadElement.click();

          console.log(`   [Playwright Downloader] Menunggu unduhan untuk ${tender.attachmentName}...`);
          const download = await downloadPromise;

          const sanitizedFilename = sanitizeFilename(tender.attachmentName);
          const savePath = path.join(downloadPath, sanitizedFilename);

          await download.saveAs(savePath);
          console.log(`✅ [Playwright Downloader] Berhasil disimpan: ${sanitizedFilename}`);
          successCount++;

          const stats = fs.statSync(savePath);
          console.log(`   [Playwright Downloader] Ukuran file: ${(stats.size / 1024).toFixed(2)} KB`);
          if (stats.size < 1000) {
            console.warn(`   ⚠️ [Playwright Downloader] Ukuran file ${sanitizedFilename} sangat kecil, mungkin halaman error?`);
          }
        } else {
          console.warn(`   ⚠️ [Playwright Downloader] Tombol unduh untuk ID ${tender.id} tidak ditemukan/terlihat.`);
          failCount++;
        }
      } catch (error) {
        if (error.message.includes('locator.isVisible: Timeout') || error.message.includes('locator.first: Error: failed to find element')) {
             console.warn(`   ⚠️ [Playwright Downloader] Tombol unduh untuk ID ${tender.id} tidak ditemukan/terlihat dalam batas waktu.`);
        } else {
            console.error(`❌ [Playwright Downloader] Gagal memproses unduhan untuk ID ${tender.id} (${tender.attachmentName}): ${error.message.split('\n')[0]}`); // Ringkas pesan error
        }
        failCount++;
      } finally {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }
    console.log(`\n[Playwright Downloader] Ringkasan Unduhan: ${successCount} berhasil, ${failCount} gagal/dilewati.`);

  } catch (error) {
    console.error("[Playwright Downloader] Terjadi error utama:", error);
  } finally {
    if (browser) {
      console.log('[Playwright Downloader] Menutup browser Playwright...');
      await browser.close();
    }
    console.log('[Playwright Downloader] Proses selesai.');
  }
}

// Ekspor fungsi agar bisa digunakan di script lain
module.exports = {
    downloadPdfsWithPlaywright
}; 