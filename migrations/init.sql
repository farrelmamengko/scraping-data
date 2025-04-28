-- Buat tabel procurement_list
CREATE TABLE IF NOT EXISTS procurement_list (
    id TEXT PRIMARY KEY,
    judul TEXT,
    deskripsi TEXT,
    tanggal TEXT,
    kkks TEXT,
    golonganUsaha TEXT,
    jenisPengadaan TEXT,
    bidangUsaha TEXT,
    batasWaktu TEXT,
    url TEXT,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    tipe_tender TEXT
);

-- Buat tabel attachments
CREATE TABLE IF NOT EXISTS attachments (
    id SERIAL PRIMARY KEY,
    tender_id TEXT REFERENCES procurement_list(id) ON DELETE CASCADE,
    attachment_id TEXT,
    attachment_name TEXT,
    attachment_url TEXT
);

-- Buat index untuk mempercepat pencarian
CREATE INDEX IF NOT EXISTS idx_tender_id ON attachments(tender_id);
CREATE INDEX IF NOT EXISTS idx_tipe_tender ON procurement_list(tipe_tender);
CREATE INDEX IF NOT EXISTS idx_batas_waktu ON procurement_list(batasWaktu);
CREATE INDEX IF NOT EXISTS idx_created_at ON procurement_list(createdAt); 