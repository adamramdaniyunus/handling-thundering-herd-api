# Thundering Herd Prevention Example (Node.js, Express, Redis, PostgreSQL)

Aplikasi contoh ini mendemonstrasikan masalah "Thundering Herd" dalam sistem backend dan salah satu pendekatan efektif untuk mencegahnya menggunakan Redis sebagai cache dan mekanisme "Single Flight" (atau "Mutex Key").

## Apa itu "Thundering Herd"?

"Thundering Herd" adalah masalah performa yang terjadi ketika sejumlah besar proses atau thread secara bersamaan menunggu suatu sumber daya atau peristiwa, dan ketika sumber daya/peristiwa tersebut tersedia, mereka semua berebut untuk mengaksesnya. Dalam konteks aplikasi web dengan cache, ini sering terjadi saat item cache kadaluwarsa atau tidak ada, menyebabkan banyak request membanjiri database atau layanan backend secara bersamaan, sehingga membebani sistem dan menurunkan performa.

## Tujuan Proyek Ini

* Memvisualisasikan masalah "Thundering Herd" dengan simulasi request konkuren.
* Mendemonstrasikan cara kerja cache (Redis) untuk mengurangi beban database.
* Mengimplementasikan mekanisme "Single Flight" untuk mencegah "Thundering Herd" saat cache kosong atau kadaluarsa.
* Membandingkan performa antara endpoint yang dioptimasi dan yang tidak dioptimasi menggunakan pengukuran waktu respons.

## Teknologi yang Digunakan

* **Node.js & Express.js**: Kerangka kerja backend untuk membangun API.
* **PostgreSQL**: Database relasional utama sebagai sumber data.
* **Redis**: Digunakan sebagai:
    * **Cache**: Untuk menyimpan data yang sering diakses.
    * **Mekanisme Single Flight**: Untuk memastikan hanya satu request yang hit database saat cache miss, sementara yang lain menunggu hasilnya.
* **`pg`**: Node.js driver untuk PostgreSQL.
* **`redis`**: Node.js client untuk Redis.
* **`ab` (ApacheBench)**: Alat command-line untuk melakukan load testing sederhana.

## Fitur Utama

* **Endpoint Optimasi (`/anime-optimized/:id`)**:
    * Menggunakan Redis sebagai cache L1.
    * Mengimplementasikan "Single Flight": Ketika cache miss, hanya satu request yang diizinkan untuk mengambil data dari PostgreSQL, dan hasilnya dibagikan ke semua request lain yang menunggu.
    * Mengukur waktu respons total dan waktu fetch database.
* **Endpoint Non-Optimasi (`/anime-unoptimized/:id`)**:
    * Langsung hit PostgreSQL untuk setiap request.
    * Tidak ada cache atau penanganan thundering herd.
    * Mengukur waktu respons total dan waktu fetch database.

## Struktur Proyek
* thundering-herd-example/
  * ├── node_modules/
  * ├── package.json
  * ├── package-lock.json
  * ├── index.js             # Aplikasi Express.js utama & logika caching
  * └── db.js                # Konfigurasi dan helper PostgreSQL

## Persiapan & Instalasi

### Prerequisites

* Node.js (v20 atau lebih baru) terinstal.
* PostgreSQL terinstal dan berjalan.
* Redis terinstal dan berjalan. (Anda bisa menggunakan Docker: `docker run --name my-redis -p 6379:6379 -d redis/redis-stack-server`)

### Langkah Instalasi

1.  **Clone repositori:**
    ```bash
    git clone https://github.com/adamramdaniyunus/handling-thundering-herd-api.git
    cd handling-thundering-herd-api
    ```
2.  **Instal dependensi Node.js:**
    ```bash
    npm install
    ```
3.  **Konfigurasi PostgreSQL:**
    * Buka file `db.js`.
    * Ganti placeholder (`your_pg_user`, `your_pg_db`, `your_pg_password`) dengan kredensial PostgreSQL Anda.
    * Pastikan database Anda sudah ada atau akan dibuat otomatis saat aplikasi dijalankan.
    ```javascript
    // db.js
    const { Pool } = require('pg');

    const pool = new Pool({
        user: 'your_pg_user',
        host: 'localhost',
        database: 'your_pg_db',
        password: 'your_pg_password',
        port: 5432,
    });
    // ... (sisa kode db.js)
    ```

## Cara Menjalankan Aplikasi

1.  **Jalankan aplikasi Node.js:**
    ```bash
    node index.js
    ```
    Server akan berjalan di `http://localhost:5555`. Anda akan melihat log yang menunjukkan koneksi ke Redis dan inisialisasi database.

## Percobaan & Pengujian Performa

Kita akan menggunakan `ab` (ApacheBench) untuk mensimulasikan beban.

### 1. Uji Endpoint Non-Optimasi (`/anime-unoptimized/:id`)

* **Deskripsi**: Setiap request akan langsung hit database.
* **Tujuan**: Menunjukkan beban tinggi pada database tanpa optimasi.
* **Jalankan Load Test**:
    ```bash
    ab -n 100 -c 50 http://localhost:5555/anime-unoptimized/1
    ```
* **Amati Log**:
    Anda akan melihat banyak log `[Unoptimized-1] Database Fetch selesai dalam XXX.XX ms` dan `[Unoptimized-1] Total Request selesai dalam YYY.YY ms`. Waktu `Total Request` akan sangat dekat dengan `Database Fetch`, menunjukkan bahwa setiap request membebani DB.

### 2. Uji Endpoint Optimasi (`/anime-optimized/:id`)

* **Deskripsi**: Menggunakan Redis cache dan penanganan "Single Flight" untuk thundering herd.
* **Tujuan**: Mendemonstrasikan pengurangan beban database dan peningkatan performa.
* **Langkah-langkah**:
    1.  **Bersihkan Cache Redis (Penting!)**: Sebelum setiap pengujian, pastikan cache untuk produk ID 1 kosong untuk mensimulasikan "cache miss" awal.
        ```bash
        redis-cli DEL anime:1
        ```
    2.  **Jalankan Load Test (dengan jumlah request lebih besar)**:
        ```bash
        ab -n 10000 -c 500 http://localhost:5555/anime-optimized/1
        ```
* **Amati Log**:
    * **Satu-satunya** log `[Optimized-1] Cache Miss, mengambil dari PostgreSQL` akan muncul, diikuti dengan `[Optimized-1] Database Fetch selesai dalam XXX.XX ms` (waktu yang relatif lama, sama seperti `Unoptimized`). Ini adalah biaya awal untuk mengisi cache.
    * **Beberapa** log `[Optimized-1] Menunggu request lain selesai (Thundering Herd)` akan muncul, diikuti dengan `[Optimized-1] Total Request (Waited for Thundering Herd) selesai dalam YYY.YY ms`. Waktu ini akan lebih cepat dari `Database Fetch` dan menunjukkan request yang menunggu tanpa membebani DB.
    * **Sebagian besar** dari 10.000 request akan mencatat `[Optimized-1] Mengambil dari Redis Cache` dan `[Optimized-1] Total Request (Cache Hit) selesai dalam Z.ZZ ms`. Waktu ini akan sangat cepat (biasanya 1-5 ms).

### Perbandingan Hasil

* Pada **Endpoint Non-Optimasi**, setiap request, bahkan untuk data yang sama, akan hit database, menyebabkan latensi yang lebih tinggi dan beban yang signifikan pada database seiring dengan meningkatnya konkurensi.
* Pada **Endpoint Optimasi**, hanya **satu** request yang akan hit database saat cache kosong. Semua request konkuren lainnya akan menunggu hasil dari request tersebut atau dilayani langsung dari cache Redis yang sangat cepat. Ini mengurangi beban database secara drastis dan meningkatkan throughput serta mengurangi latensi rata-rata secara keseluruhan.

---
