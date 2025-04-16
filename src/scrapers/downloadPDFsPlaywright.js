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
 * Mengunduh PDF untuk daftar tender yang diberikan menggunakan Playwright,
 * dengan menangani paginasi.
 * @param {Array<{id: string, attachmentName: string}>} allTenders - Array SEMUA objek tender dengan id dan nama attachment.
 */
async function downloadPdfsWithPlaywright(allTenders) { 
  if (!allTenders || allTenders.length === 0) {
    console.log("[Playwright Downloader] Tidak ada tender yang diberikan untuk diunduh.");
    return;
  }

  // Buat salinan yang bisa dimodifikasi untuk melacak tender yang belum diunduh
  const tendersToDownload = [...allTenders]; 
  console.log(`[Playwright Downloader] Jumlah total tender yang perlu dicek: ${tendersToDownload.length}`);

  let browser = null; 
  let successCount = 0;
  let failCount = 0; // Untuk tender yang tombolnya tidak ditemukan di SEMUA halaman
  let notFoundThisPageCount = 0; // Untuk tender yang tidak ditemukan di halaman spesifik (sementara)

  try {
    // 1. Setup Playwright
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

    // 3. Loop Paginasi
    let currentPageNum = 1;
    while (tendersToDownload.length > 0) { 
      console.log(`\n[Playwright Downloader] Memproses Halaman ${currentPageNum}... Tender tersisa: ${tendersToDownload.length}`);
      notFoundThisPageCount = 0; // Reset counter untuk halaman ini
      const tendersFoundOnPage = [];

      // Cari dan proses tender yang ADA di halaman saat ini
      for (let i = tendersToDownload.length - 1; i >= 0; i--) {
        const tender = tendersToDownload[i];
        const downloadSelector = `a.download-btn[data-file-id="${tender.id}"]`;
        let elementVisible = false;

        try {
          // Cek keberadaan dan visibilitas tombol dengan timeout singkat
          const downloadElement = page.locator(downloadSelector).first(); 
          elementVisible = await downloadElement.isVisible({ timeout: 2000 }); // Timeout lebih pendek untuk scan cepat

          if (elementVisible) {
            console.log(`  -> Ditemukan tombol untuk ID: ${tender.id} (${tender.attachmentName}) di Halaman ${currentPageNum}`);
            tendersFoundOnPage.push(tender);
            tendersToDownload.splice(i, 1); // Hapus dari daftar tunggu utama
          }
          // Jika tidak visible, biarkan di daftar tunggu untuk halaman berikutnya

        } catch (error) {
          // Abaikan error timeout/tidak ditemukan saat scanning, akan ditangani nanti
           if (!error.message.includes('Timeout') && !error.message.includes('failed to find element')) {
               console.error(`   [Playwright Downloader] Error tak terduga saat mencari ID ${tender.id}: ${error.message.split('\n')[0]}`);
           }
        }
      }
      
      // Unduh semua tender yang ditemukan di halaman ini
      if(tendersFoundOnPage.length > 0){
          console.log(`  [Playwright Downloader] Mengunduh ${tendersFoundOnPage.length} PDF yang ditemukan di Halaman ${currentPageNum}...`);
          for(const tender of tendersFoundOnPage){
              const downloadSelector = `a.download-btn[data-file-id="${tender.id}"]`;
               try {
                   const downloadElement = page.locator(downloadSelector).first();
                   const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
                   await downloadElement.click();
                   const download = await downloadPromise;
                   const sanitizedFilename = sanitizeFilename(tender.attachmentName);
                   const savePath = path.join(downloadPath, sanitizedFilename);
                   await download.saveAs(savePath);
                   console.log(`    ✅ Berhasil disimpan: ${sanitizedFilename}`);
                   successCount++;
                   // Opsional: cek ukuran
                   // const stats = fs.statSync(savePath);
                   // if (stats.size < 1000) console.warn(...);
               } catch (downloadError) {
                   console.error(`    ❌ Gagal mengunduh ID ${tender.id} (${tender.attachmentName}) setelah tombol diklik: ${downloadError.message.split('\n')[0]}`);
                   failCount++; // Hitung sebagai gagal jika error setelah klik
               } finally {
                   await new Promise(resolve => setTimeout(resolve, 1500)); // Delay antar unduhan
               }
          }
      } else {
          console.log(`  [Playwright Downloader] Tidak ada tender dari daftar tunggu yang ditemukan di Halaman ${currentPageNum}.`);
      }

      // 4. Pindah ke Halaman Berikutnya
      if (tendersToDownload.length === 0) {
        console.log("[Playwright Downloader] Semua tender dalam daftar tunggu telah diproses.");
        break; // Keluar loop utama jika daftar tunggu kosong
      }

      // Selector Tombol Next yang lebih spesifik lagi (berdasarkan ID container)
      const nextButtonSelector = '#tnd1Result div.pagelinks a[title="Next"].uibutton'; 
      const nextButton = page.locator(nextButtonSelector);

      if (!(await nextButton.isVisible({timeout: 5000}))) {
          console.warn(`[Playwright Downloader] Tombol 'Next' (${nextButtonSelector}) tidak ditemukan. Menghentikan paginasi.`);
          break;
      }
      
      const isDisabled = await nextButton.evaluate(node => node.classList.contains('uibutton') && node.classList.contains('disable'));

      if (isDisabled) {
        console.log("[Playwright Downloader] Tombol 'Next' disabled. Mencapai halaman terakhir.");
        break; // Keluar loop jika tombol Next disabled
      } else {
        console.log("[Playwright Downloader] Mengklik tombol 'Next'...");
        await nextButton.click();
        console.log("[Playwright Downloader] Menunggu halaman berikutnya dimuat...");
        await page.waitForLoadState('networkidle', { timeout: 90000 }); // Tunggu jaringan tenang lagi
        
        // Tambahan: Tunggu hingga container paginasi benar-benar terlihat
        try {
            await page.waitForSelector('#tnd1Result div.pagelinks', { state: 'visible', timeout: 10000 });
            console.log("[Playwright Downloader] Kontainer paginasi halaman baru terlihat.");
        } catch (waitError) {
            console.warn("[Playwright Downloader] Kontainer paginasi tidak muncul setelah klik 'Next'. Menghentikan.");
            break; // Keluar jika kontainer tidak muncul
        }
        currentPageNum++;
      }
    } // Akhir loop while

    // Hitung tender yang tersisa di daftar tunggu sebagai gagal ditemukan
    if(tendersToDownload.length > 0){
        console.warn(`\n[Playwright Downloader] ${tendersToDownload.length} tender tidak ditemukan di halaman manapun:`);
        tendersToDownload.forEach(t => console.warn(`  - ID: ${t.id}, Nama: ${t.attachmentName}`));
        failCount += tendersToDownload.length;
    }

    console.log(`\n[Playwright Downloader] Ringkasan Unduhan Akhir: ${successCount} berhasil, ${failCount} gagal/tidak ditemukan.`);

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

// Ekspor fungsi
module.exports = {
    downloadPdfsWithPlaywright
}; 