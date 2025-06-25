const express = require('express');
const redis = require('redis');
const db = require('./db');

const app = express();
const port = 5555;

const redisClient = redis.createClient({
    url: 'redis://localhost:6379'
});

redisClient.on('connect', () => console.log('Terhubung ke Redis!'));
redisClient.on('error', (err) => console.error('Redis Client Error', err));

// Connect to redis
async function connectRedis() {
    await redisClient.connect();
}
connectRedis();

// Objek untuk melacak promise yang sedang dalam "flight" (single flight)
const processingRequests = {};

// Helper untuk mencatat waktu
function recordTime(start, label) {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1_000_000; // Konversi nanodetik ke milidetik
    console.log(`${label} selesai dalam ${durationMs.toFixed(2)} ms`);
    return durationMs;
}

app.get('/anime-optimize/:id', async (req, res) => {
    const animeId = req.params.id;
    const cacheKey = `anime:${animeId}`;
    // const mutexKey = `mutex:anime:${animeId}`; // Kunci mutex untuk single flight
    const requestStartTime = process.hrtime.bigint(); 
    console.log("Process untuk anime ID: ", animeId);

    try {
        // -- check redis
        const cacheData = await redisClient.get(cacheKey);
        if (cacheData) {
            console.log(`[${animeId}] Mengambil dari Redis Cache (Thundering Herd ditangani)`);
            recordTime(requestStartTime, `[Optimized-${animeId}] Total Request (DB fetch)`);
            return res.json(JSON.parse(cacheData));
        }

        // -- cache miss: cek apakah ada request lain yang sama (Thundering Herd Prevention)
        if (processingRequests[animeId]) {
            console.log(`[${animeId}] Menunggu request lain selesai (Thundering Herd)`);
            // Tunggu hingga promise yang sedang berjalan selesai
            const animeData = await processingRequests[animeId];
            console.log(`[${animeId}] Mendapatkan data dari request yang sudah selesai`);
            recordTime(requestStartTime, `[Optimized-${animeId}] Total Request (DB fetch)`);
            return res.json(animeData);
        }

        // -- tidak ada dalam cache tidak ada proses yang tersedia -> ambil dari DB langsung
        console.log(`[${animeId}] Cache Miss, mengambil dari PostgreSQL`);
         // Buat promise untuk mengambil data dari DB dan simpan di processingRequests
        const dbFetchPromise = (async () => {
            try {
                // Simulasi delay untuk query database
                await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 100)); // 100-600ms delay

                const { rows } = await db.query('SELECT * FROM anime_list WHERE id = $1', [animeId]);
                if (rows.length > 0) {
                    const animeData = rows[0];
                    // Simpan ke Redis Cache (dengan TTL misalnya 60 detik)
                    await redisClient.setEx(cacheKey, 60, JSON.stringify(animeData));
                    console.log(`[${animeId}] Data disimpan ke Redis Cache.`);
                    return animeData;
                } else {
                    return null;
                }
            } finally {
                // Setelah selesai, hapus promise dari processingRequests
                delete processingRequests[animeId];
            }
        })();
        
        // Simpan promise ini agar request lain bisa menunggunya
        processingRequests[animeId] = dbFetchPromise;

        const anime = await dbFetchPromise;

        if (anime) {
            recordTime(requestStartTime, `[Optimized-${animeId}] Total Request (DB fetch)`);
            res.json(anime);
        } else {
            res.status(404).send('anime tidak ditemukan.');
        }
    } catch (error) {
        console.log(error);
        // Pastikan untuk membersihkan processingRequests jika terjadi error
        delete processingRequests[animeId];
        res.status(500).send('Terjadi kesalahan server.');
    }
})

app.get('/anime-unoptimized/:id', async (req, res) => {
    const animeId = req.params.id;
    const requestStartTime = process.hrtime.bigint(); // Mulai hitung waktu untuk request ini

    console.log(`[Unoptimized] Request untuk produk ID: ${animeId}`);

    try {
        // langsung hit database
        const dbFetchStartTime = process.hrtime.bigint(); // Waktu mulai fetch dari DB
        // Simulasi delay untuk query database
        await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 100)); // 100-600ms delay

        const { rows } = await db.query('SELECT * FROM anime_list WHERE id = $1', [animeId]);
        recordTime(dbFetchStartTime, `[Unoptimized-${animeId}] Database Fetch`); // Waktu selesai fetch dari DB

        if (rows.length > 0) {
            recordTime(requestStartTime, `[Unoptimized-${animeId}] Total Request`);
            res.json(rows[0]);
        } else {
            res.status(404).send('Anime tidak ditemukan.');
        }
    } catch (err) {
        console.error(`[Unoptimized] Error mengambil anime ${animeId}:`, err);
        res.status(500).send('Terjadi kesalahan server.');
    }
});

app.listen(port, () => {
    console.log(`Server berjalan di http://localhost:${port}`);
    console.log('Uji dengan:');
    console.log(`  ab -n 100 -c 50 http://localhost:${port}/anime/1`);
    console.log(`  (atau buka http://localhost:${port}/anime/1 di banyak tab browser sekaligus)`);
});