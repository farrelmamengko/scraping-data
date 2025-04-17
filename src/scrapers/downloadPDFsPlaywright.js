const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { sanitizeFilename } = require('../utils/helpers'); // Import dari helpers

// Direktori tujuan unduhan
const downloadPath = path.join(__dirname, '..', 'download pdf');

// Pastikan direktori unduhan ada
if (!fs.existsSync(downloadPath)) {
  fs.mkdirSync(downloadPath, { recursive: true });
  console.log(`[Playwright Downloader] Direktori unduhan dibuat: ${downloadPath}`);
}

/**
 * Mengunduh PDF untuk daftar tender yang diberikan menggunakan Playwright,
 * dengan menangani paginasi dan multiple attachment per tender.
 * @param {Array<Object>} allTenders - Array objek tender, diharapkan memiliki properti `allAttachments` [{id, name}, ...].
 */
async function downloadPdfsWithPlaywright(allTenders) { 
  if (!allTenders || allTenders.length === 0) {
    console.log("[Playwright Downloader] Tidak ada tender yang diberikan untuk diunduh.");
    return;
  }

  // Buat daftar semua attachment individual dari semua tender
  const allIndividualAttachments = [];
  allTenders.forEach(tender => {
      if (tender.allAttachments && tender.allAttachments.length > 0) {
          tender.allAttachments.forEach(attachment => {
              // Tambahkan info tender utama jika perlu (misal judul untuk logging)
              allIndividualAttachments.push({
                  tenderId: tender.id, // ID utama tender (dari attachment pertama)
                  tenderJudul: tender.judul,
                  attachmentId: attachment.id,
                  attachmentName: attachment.name
              });
          });
      } else {
          // Fallback jika allAttachments tidak ada (struktur data lama)
          // atau jika tender tidak punya attachment
          if (tender.id && tender.attachmentName) {
               console.warn(`[Playwright Downloader] Tender ${tender.judul || tender.id} menggunakan struktur lama atau tidak punya allAttachments. Mencoba attachment utama.`);
               allIndividualAttachments.push({
                   tenderId: tender.id,
                   tenderJudul: tender.judul,
                   attachmentId: tender.id, // Asumsi ID tender = ID attachment utama
                   attachmentName: tender.attachmentName
               });
          }
      }
  });

  if (allIndividualAttachments.length === 0) {
      console.log("[Playwright Downloader] Tidak ada attachment individual yang valid ditemukan dari data tender.");
      return;
  }

  console.log(`[Playwright Downloader] Jumlah total attachment individual yang perlu dicek: ${allIndividualAttachments.length}`);

  let browser = null; 
  let successCount = 0;
  let failCount = 0; // Untuk gagal unduh atau gagal ditemukan
  let skippedCount = 0; 

  // Buat Set untuk melacak attachment yang sudah diproses (diunduh/dilewati/gagal)
  const processedAttachmentIds = new Set();

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
    let attachmentsRemaining = allIndividualAttachments.length; // Counter sisa

    while (attachmentsRemaining > 0) { 
      console.log(`\n[Playwright Downloader] Memproses Halaman ${currentPageNum}... Attachment tersisa: ${attachmentsRemaining}`);
      const attachmentsFoundOnPage = [];

      // Cari semua attachment yang belum diproses di halaman saat ini
      for (const attachment of allIndividualAttachments) {
        // Lewati jika sudah diproses di halaman sebelumnya atau pada iterasi ini
        if (processedAttachmentIds.has(attachment.attachmentId)) continue;

        const downloadSelector = `a.download-btn[data-file-id="${attachment.attachmentId}"]`;
        let elementVisible = false;

        try {
          const downloadElement = page.locator(downloadSelector); // Tidak pakai .first()
          // Cek apakah *setidaknya satu* elemen dengan ID ini visible
          // Gunakan loop biasa untuk await di dalam some, atau pakai Promise.all
          const elements = await downloadElement.all();
          let isVisible = false;
          for (const el of elements) {
              if (await el.isVisible({ timeout: 1500 })) { // Timeout lebih pendek
                  isVisible = true;
                  break;
              }
          }
          elementVisible = isVisible;

          if (elementVisible) {
            console.log(`  -> Ditemukan tombol untuk Attachment ID: ${attachment.attachmentId} (${attachment.attachmentName}) di Halaman ${currentPageNum}`);
            // Tandai untuk diunduh di halaman ini
            attachmentsFoundOnPage.push(attachment);
            // Tandai sudah diproses agar tidak dicari lagi di halaman berikutnya
            processedAttachmentIds.add(attachment.attachmentId);
            attachmentsRemaining--; // Kurangi counter sisa
          }
          // Jika tidak visible, biarkan di daftar tunggu untuk halaman berikutnya

        } catch (error) {
          // Abaikan error timeout/tidak ditemukan saat scanning, akan ditangani nanti
           if (!error.message.includes('Timeout') && !error.message.includes('failed to find element')) {
               console.error(`   [Playwright Downloader] Error tak terduga saat mencari Attachment ID ${attachment.attachmentId}: ${error.message.split('\n')[0]}`);
           }
           // Jika tidak ditemukan/visible, biarkan untuk dicek di halaman berikutnya
        }
      } // Akhir loop pencarian attachment
      
      // Unduh semua attachment yang ditemukan di halaman ini
      if(attachmentsFoundOnPage.length > 0){
          console.log(`  [Playwright Downloader] Memproses ${attachmentsFoundOnPage.length} PDF yang ditemukan di Halaman ${currentPageNum}...`);
          for(const attachment of attachmentsFoundOnPage){
              const downloadSelector = `a.download-btn[data-file-id="${attachment.attachmentId}"]`;
               try {
                   // Target elemen pertama yang cocok (seharusnya hanya satu per ID unik di halaman aktif)
                   const downloadElement = page.locator(downloadSelector).first(); 
                   
                   // --- Pengecekan File Duplikat --- 
                   const sanitizedFilename = sanitizeFilename(attachment.attachmentName); // Gunakan nama attachment individual
                   const savePath = path.join(downloadPath, sanitizedFilename);
                   
                   if (fs.existsSync(savePath)) {
                       console.log(`    ⏭️ Dilewati (sudah ada): ${sanitizedFilename}`);
                       skippedCount++; 
                   } else {
                       // Unduh jika belum ada
                       console.log(`    [Playwright Downloader] Mengklik tombol untuk ${sanitizedFilename}...`);
                       const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
                       await downloadElement.click();
                       console.log(`    [Playwright Downloader] Menunggu unduhan internal...`);
                       const download = await downloadPromise;
                       
                       await download.saveAs(savePath);
                       console.log(`    ✅ Berhasil disimpan: ${sanitizedFilename}`);
                       successCount++; 
                       // Opsional: cek ukuran
                       const stats = fs.statSync(savePath);
                       if (stats.size < 1000) {
                           console.warn(`      ⚠️ Ukuran file ${sanitizedFilename} sangat kecil, mungkin halaman error?`);
                       }
                   }
                   // ----------------------------------

               } catch (downloadError) {
                   console.error(`    ❌ Gagal proses unduhan untuk Attachment ID ${attachment.attachmentId} (${attachment.attachmentName}) setelah tombol diklik: ${downloadError.message.split('\n')[0]}`);
                   failCount++; // Hitung sebagai gagal jika error setelah klik
                   // ID sudah ditandai sebagai processedAttachmentIds sebelumnya, jadi tidak perlu di sini
               } finally {
                   await new Promise(resolve => setTimeout(resolve, 1000)); // Perkecil delay antar unduhan
               }
          } // Akhir loop unduh per attachment
      } else {
          console.log(`  [Playwright Downloader] Tidak ada attachment BARU yang ditemukan di Halaman ${currentPageNum}.`);
      }

      // 4. Pindah ke Halaman Berikutnya
      if (attachmentsRemaining === 0) {
        console.log("[Playwright Downloader] Semua attachment dalam daftar tunggu telah diproses.");
        break; // Keluar loop utama jika daftar tunggu kosong
      }

      // Selector Tombol Next yang lebih spesifik lagi (berdasarkan ID container)
      const nextButtonSelector = '#tnd1Result div.pagelinks a[title="Next"].uibutton'; 
      const nextButton = page.locator(nextButtonSelector);

      // Periksa visibilitas tombol Next
      let nextButtonVisible = false;
      try {
          nextButtonVisible = await nextButton.isVisible({timeout: 5000});
      } catch (e) { /* Abaikan timeout */ }

      if (!nextButtonVisible) {
          console.warn(`[Playwright Downloader] Tombol 'Next' (${nextButtonSelector}) tidak ditemukan atau tidak visible. Menghentikan paginasi.`);
          break;
      }
      
      const isDisabled = await nextButton.evaluate(node => node.classList.contains('disable'));

      if (isDisabled) {
        console.log("[Playwright Downloader] Tombol 'Next' disabled. Mencapai halaman terakhir.");
        break; // Keluar loop jika tombol Next disabled
      } else {
        console.log("[Playwright Downloader] Mengklik tombol 'Next'...");
        await nextButton.click();
        console.log("[Playwright Downloader] Menunggu halaman berikutnya dimuat...");
        // Tunggu jaringan tenang dan pastikan kontainer paginasi muncul
        try {
            await page.waitForLoadState('networkidle', { timeout: 90000 }); 
            await page.waitForSelector('#tnd1Result div.pagelinks', { state: 'visible', timeout: 10000 });
            console.log("[Playwright Downloader] Kontainer paginasi halaman baru terlihat.");
            currentPageNum++;
            await new Promise(resolve => setTimeout(resolve, 500)); 
        } catch (waitError) {
            console.warn("[Playwright Downloader] Gagal memuat halaman berikutnya atau kontainer paginasi tidak muncul. Menghentikan.", waitError.message.split('\n')[0]);
            break; // Keluar jika gagal memuat halaman berikutnya
        }
      }
    } // Akhir loop while (paginasi)

    // Hitung attachment yang tersisa di daftar sebagai gagal ditemukan
    let notFoundCount = 0;
    allIndividualAttachments.forEach(attachment => {
        if (!processedAttachmentIds.has(attachment.attachmentId)) {
            console.warn(`  - Attachment Gagal Ditemukan: ID: ${attachment.attachmentId}, Nama: ${attachment.attachmentName} (dari Tender: ${attachment.tenderJudul || attachment.tenderId})`);
            notFoundCount++;
        }
    });
    failCount += notFoundCount; // Tambahkan yang tidak ditemukan ke total gagal

    console.log(`\n[Playwright Downloader] Ringkasan Unduhan Akhir: ${successCount} berhasil disimpan, ${skippedCount} dilewati (sudah ada), ${failCount} gagal/tidak ditemukan.`);

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