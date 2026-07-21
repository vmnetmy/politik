# Nadi Rakyat — Dashboard PRU-15

Dashboard interaktif keputusan Pilihan Raya Umum Malaysia ke-15, dibina daripada `DATA & STATISTIK PRU-15.numbers` dalam repositori ini.

Panduan operasi produksi terdapat dalam [`docs/release-operations.md`](docs/release-operations.md), manakala peranan, kelulusan dan integriti penerbitan data diterangkan dalam [`docs/data-publishing.md`](docs/data-publishing.md).

## Jalankan secara tempatan

```bash
npm install
npm run dev
```

Buka alamat yang dipaparkan oleh Vite (biasanya `http://localhost:5173`).

## Struktur URL

- `/` dan `/pru` — dialihkan ke dataset semasa di `/pru/15`
- `/pru/15` — profil dan pintu masuk penerokaan PRU-15
- `/pru/15/pemenang` — direktori semua pemenang PRU-15 dengan carian dan tapisan profil
- `/pru/15/negeri` — ringkasan nasional dan senarai negeri
- `/pru/15/negeri/{stateName}` — analisis negeri, contohnya `/pru/15/negeri/pulau-pinang`
- `/pru/15/negeri/parlimen` — pelan tempat duduk interaktif dan direktori semua kerusi Parlimen
- `/pru/15/negeri/parlimen/{parliamentName}` — keputusan penuh, contohnya `/pru/15/negeri/parlimen/padang-besar`
- `/settings/data` — urus status kerusi Parlimen selepas PRU-15
- `/settings/data/keahlian` — urus parti dan gabungan semasa wakil rakyat secara bertarikh kuat kuasa
- `/settings/data/calon` — urus pembetulan metadata calon tanpa mengubah angka undi
- `/settings/data/parti` — urus katalog parti, gabungan lalai dan status aktif
- `/settings/data/gabungan` — urus katalog gabungan, singkatan dan warna dashboard

Nama negeri dan Parlimen menggunakan slug URL huruf kecil yang dipisahkan dengan tanda sempang. Untuk deployment statik, hos perlu menghalakan URL yang tidak sepadan dengan fail kembali ke `index.html` supaya pautan terus berfungsi.

## Keputusan PRU-15 dan kedudukan semasa

Keputusan PRU-15 kekal sebagai rekod sejarah yang tidak ditulis semula oleh perubahan katalog atau keahlian semasa. Status kerusi selepas pilihan raya direkodkan dalam `public/data/changes.json`; sejarah parti dan gabungan semasa wakil rakyat direkodkan secara berasingan dalam `public/data/affiliations.json`.

Tetapan dalam `/settings/data` disimpan pada pelayar semasa. Gunakan fungsi **Eksport JSON**, kemudian gantikan `public/data/changes.json` dengan fail tersebut untuk menerbitkan perubahan kepada pengguna lain. Fail perubahan boleh diimport semula melalui halaman tetapan.

Gunakan `/settings/data/keahlian` apabila wakil rakyat keluar parti, menyertai parti lain atau menjadi Bebas. Setiap rekod mempunyai tarikh kuat kuasa, ID parti/gabungan, nama snapshot, sebab dan sumber. Paparan awam kemudian menunjukkan identiti **PRU-15** bersebelahan identiti **Semasa**.

Pembetulan nama, gabungan, parti, jantina dan bangsa diurus secara berasingan dalam `/settings/data/calon`. Medan terkawal menggunakan carian combobox, manakala angka undi dan bahagian undi dikunci kepada rekod PRU-15. Untuk menerbitkan pembetulan calon, eksport JSON dan gantikan `public/data/candidate-changes.json`.

Katalog parti dan gabungan disimpan berasingan daripada rekod keputusan. Perubahan nama katalog digunakan untuk identiti semasa, manakala label pada keputusan PRU-15 hanya berubah melalui pembetulan calon yang eksplisit. Eksport katalog daripada halaman masing-masing ke `public/data/parties.json` dan `public/data/alliances.json` untuk deployment.

Paparan identiti menggunakan imej dalam folder `Parties/` dan `Gabungan/`. Nama teks dikekalkan dalam kawalan carian, tapisan dan penyuntingan; identiti tanpa imej padanan menggunakan lencana ringkas sebagai fallback.

## Helaian mata mengikut saluran

Arkib `sources/pru15/scoresheets/` mengandungi 56 PDF SPR 760 yang meliputi 56 daripada 222 kerusi. Sumber tidak diterbitkan terus kepada pelayar; setiap fail dijejaki dalam manifest sumber menggunakan SHA-256. Pengekstrak menjana indeks liputan, 10,136 rekod saluran, 2,255 kod daerah mengundi bercetak, 19 kumpulan undi awal tanpa kod sumber, serta 2,276 pusat mengundi.

Data diterbitkan secara malas melalui `public/data/scoresheets/P.XXX.json`. Halaman Parlimen hanya memuatkan fail kerusi yang sedang dilihat serta geografi guna semula dalam `public/data/polling-places.json`. Kerusi yang belum mempunyai PDF mengekalkan keputusan agregat dan menyatakan bahawa data terperinci belum tersedia.

Setiap baris mesti memenuhi `A = B + C + D`: kertas dalam peti sama dengan undi sah calon, undi ditolak dan kertas tidak dikembalikan. Jumlah baris turut mesti sama dengan baris `JUMLAH` dalam PDF. Nama calon dipetakan kepada ID stabil, bukan kedudukan dalam array.

Helaian mata SPR 760 ialah sumber muktamad bagi 56 kerusi yang diliputi. Setiap penjanaan menggantikan terus jumlah undi calon, undi sah, bahagian undi, turnout, pemenang dan majoriti dalam `public/data/election.json`. Tiada langkah semakan manual atau lapisan rekonsiliasi; `npm run data:scoresheets:check` memastikan agregat yang diterbitkan sentiasa sama dengan jumlah dalam PDF.

```bash
npm run data:scoresheets
npm run data:scoresheets:check
```

## Pelan tempat duduk Dewan Rakyat

Kedudukan pada visual interaktif dijana daripada `SeatingDR.pdf` dan `SeatingDR.svg`, bertarikh 13 Julai 2026, lalu disimpan dalam `public/data/seating.json`. Lapisan teks PDF memadankan kawasan dan wakil, manakala kod serta geometri fizikal A1-G28 mengikuti sistem koordinat asal `1190 × 842` dalam SVG. Koordinat paparan `x/y` tidak disusun semula kepada grid atau lengkok baharu; setiap kad kekal pada kedudukan sumbernya yang tepat. `sourceX/sourceY` mengekalkan titik padanan kawasan daripada PDF untuk jejak audit.

Kesemua 280 kod tempat duduk fizikal (`A1-A28`, `B1-B22`, `C1-C60`, `D1-D60`, `E1-E60`, `F1-F22` dan `G1-G28`) dipaparkan sebagai kad segi empat tepat. Sebanyak 220 kad dipadankan dengan kawasan dan wakil daripada PDF, manakala 60 kad tanpa wakil kekal kelihatan dengan kodnya dan tidak diberikan identiti rekaan. Pada skrin kecil, pelan boleh ditatal secara mendatar supaya kod tidak dikecilkan sehingga sukar dibaca.

Kanvas mengekalkan nisbah sumber `1190 × 842` dan saiz kad menyesuaikan diri mengikut lebar yang tersedia tanpa mengecilkan sasaran interaksi di bawah 24px. Panel butiran disusun di bawah kanvas pada viewport sederhana, manakala petunjuk gabungan berada di luar kawasan tatal supaya boleh membalut secara bebas pada semua saiz skrin.

Sebanyak 220 kerusi mempunyai label kawasan dalam PDF. `P.100 Pandan` dan `P.118 Setiawangsa` tidak berlabel dalam sumber dan dipaparkan sebagai rekod tanpa koordinat, tanpa mereka-reka lokasi.

Visual boleh bertukar antara identiti PRU-15 dengan kedudukan semasa, menggunakan data keahlian bertarikh kuat kuasa yang sama seperti seluruh dashboard. Interaksi pemilihan, penapisan dan peralihan susun atur menggunakan Motion for React melalui import `motion/react`.

Komponen pelan telah diasingkan dalam `src/components/seating/`, komponen identiti dalam `src/components/identity/`, logik keadaan dalam `src/data/hooks/useParliament.ts`, dan kontrak data dalam `src/data/types/seating.ts`. Penanda menggunakan satu hentian Tab dengan navigasi kekunci anak panah supaya pengguna papan kekunci tidak perlu melalui 220 kawalan satu demi satu.

### Jana dan sahkan koordinat sumber

Pasang kebergantungan Python, kemudian jana semula `seating.json`:

```bash
python3 -m pip install -r requirements.txt
npm run data:seating
```

Pengekstrak membaca lapisan teks JasperReports dalam PDF, memadankan nama kawasan dengan 222 rekod pilihan raya, mengesahkan koordinat berada dalam `1190 × 842`, dan mensyaratkan gabungan kerusi dipetakan serta tidak dipetakan meliputi kesemua 222 kerusi tepat sekali. Cap jari SHA-256 bagi PDF, SVG dan raster `SeatingDR-1.png` dikunci kerana ketiga-tiganya membentuk sumber pemetaan rasmi. Sebarang perubahan sumber perlu disemak sebelum koordinat dan kod dijana semula; perubahan senyap menyebabkan proses tamat dengan ralat.

Untuk memastikan fail yang diterbitkan masih sepadan tepat dengan semua sumber:

```bash
npm run data:seating:check
```

## Statistik umur pengundi

Halaman `/pru/15/pengundi/umur` menggunakan laporan SPR `STATISTIK PRU KE_15 UMUR BY_DUN.pdf`. Identiti kawasan disimpan sekali dalam `public/data/constituencies.json`: 16 negeri atau wilayah, 222 Parlimen dan 600 DUN dengan hubungan induk yang eksplisit. Statistik dalam `public/data/voter-age.json` hanya merujuk `stateId`, `parliamentCode` atau `dunId`, supaya nama dan kod tidak diulang atau dihardkod dalam komponen paparan.

Tiga belas rekod `N.00` bagi Kuala Lumpur, Putrajaya dan Labuan dikekalkan sebagai jumlah peringkat Parlimen dan tidak ditukar menjadi DUN rekaan. Pengekstrak mengesahkan setiap jumlah kumpulan umur, jumlah DUN kepada Parlimen, 222 Parlimen, 600 DUN serta cap jari SHA-256 sumber.

```bash
npm run data:voter-age
npm run data:voter-age:check
```

Pemeriksaan ini turut dijalankan dalam `.github/workflows/ci.yml` untuk setiap pull request dan perubahan pada `main`.

## Bina untuk produksi

```bash
npm run build
npm run preview
```

## Pemeriksaan kualiti

```bash
npm run lint
npm run test
npm run test:python
npm run data:seating:check
npm run data:voter-age:check
npm run data:scoresheets:check
npm run data:manifest:check
npm run build
```

`npm run test:e2e` dan `npm run lighthouse` memerlukan Chromium. Pipeline GitHub memasang pelayar tersebut, menguji paparan desktop dan mudah alih, membandingkan tangkapan skrin dengan baseline `main`, dan menguatkuasakan bajet Lighthouse. Jalankan `npm run data:manifest` selepas mengubah mana-mana fail data yang diterbitkan.

## Pipeline data

Fail Numbers asal dikekalkan tanpa perubahan. Dashboard membaca dataset ternormal dalam `public/data/election.json`.

Untuk menjana semula data, eksport fail Numbers kepada `.xlsx`, kemudian jalankan:

```bash
python3 -m pip install -r requirements.txt
python3 scripts/extract_data.py /path/to/pru15.xlsx public/data/election.json
```

Pengekstrak mengesahkan bahawa output mengandungi 222 kerusi dan 945 calon. Pembetulan sumber yang telah disahkan direkodkan secara eksplisit dalam pengekstrak supaya penjanaan semula menghasilkan angka yang sama.

Jumlah pemilih berdaftar P.201 Batang Lupar ditetapkan kepada 43,072 berdasarkan jumlah kawasan yang disahkan; peratus keluar mengundi dikira semula daripada 27,559 undi direkodkan.
