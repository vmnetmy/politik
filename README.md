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

## Pelan tempat duduk Dewan Rakyat

Kedudukan pada visual interaktif dijana daripada `SeatingDR.pdf`, bertarikh 13 Julai 2026, dan disimpan dalam `public/data/seating.json`. Koordinat asal PDF dikekalkan sebagai `sourceX/sourceY` untuk membuktikan padanan kawasan dan wakil. Koordinat paparan `x/y` diseragamkan kepada dua grid lurus 5 × 10 yang simetri serta enam lengkok sepusat dengan 30 kedudukan setiap lengkok.

Kesemua 280 kod tempat duduk fizikal (`A1-A28`, `B1-B22`, `C1-C60`, `D1-D60`, `E1-E60`, `F1-F22` dan `G1-G28`) dipaparkan sebagai kad segi empat tepat. Sebanyak 220 kad dipadankan dengan kawasan dan wakil daripada PDF, manakala 60 kad tanpa wakil kekal kelihatan dengan kodnya dan tidak diberikan identiti rekaan. Pada skrin kecil, pelan boleh ditatal secara mendatar supaya kod tidak dikecilkan sehingga sukar dibaca.

Sebanyak 220 kerusi mempunyai label kawasan dalam PDF. `P.100 Pandan` dan `P.118 Setiawangsa` tidak berlabel dalam sumber dan dipaparkan sebagai rekod tanpa koordinat, tanpa mereka-reka lokasi.

Visual boleh bertukar antara identiti PRU-15 dengan kedudukan semasa, menggunakan data keahlian bertarikh kuat kuasa yang sama seperti seluruh dashboard. Interaksi pemilihan, penapisan dan peralihan susun atur menggunakan Motion for React melalui import `motion/react`.

Komponen pelan telah diasingkan dalam `src/components/seating/`, komponen identiti dalam `src/components/identity/`, logik keadaan dalam `src/data/hooks/useParliament.ts`, dan kontrak data dalam `src/data/types/seating.ts`. Penanda menggunakan satu hentian Tab dengan navigasi kekunci anak panah supaya pengguna papan kekunci tidak perlu melalui 220 kawalan satu demi satu.

### Jana dan sahkan koordinat PDF

Pasang kebergantungan Python, kemudian jana semula `seating.json`:

```bash
python3 -m pip install -r requirements.txt
npm run data:seating
```

Pengekstrak membaca lapisan teks JasperReports dalam PDF, memadankan nama kawasan dengan 222 rekod pilihan raya, mengesahkan koordinat berada dalam `1190 × 842`, dan mensyaratkan gabungan kerusi dipetakan serta tidak dipetakan meliputi kesemua 222 kerusi tepat sekali. Cap jari SHA-256 PDF turut dikunci kerana pemetaan kod fizikal A1-G28 datang daripada lapisan raster sumber; PDF baharu perlu disemak sebelum koordinat dan kod dijana semula. Kegagalan atau perubahan senyap pada format PDF menyebabkan proses tamat dengan ralat.

Untuk memastikan fail yang diterbitkan masih sepadan tepat dengan PDF:

```bash
npm run data:seating:check
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

Pengekstrak mengesahkan bahawa output mengandungi 222 kerusi dan 945 calon. Catatan isu sumber disertakan dalam metadata JSON dan dipaparkan melalui “Nota data” pada dashboard.
