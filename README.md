# Politik.my — Dashboard PRU-15

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
- `/prn` — direktori pilihan raya negeri terkini yang telah selesai bagi semua 13 negeri
- `/prn/{assemblyNumber}/{stateName}/` — komposisi Dewan dan keputusan semua DUN bagi satu acara, contohnya `/prn/16/johor/`
- `/prn/{assemblyNumber}/{stateName}/dun/{dunName}` — keputusan calon penuh satu DUN, contohnya `/prn/16/johor/dun/buloh-kasap`
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

Arkib `sources/pru15/scoresheets/` mengandungi 56 PDF SPR 760. Baki 166 kerusi dilengkapkan menggunakan pasangan dataset undi calon dan statistik saluran terbuka yang diarkibkan sebagai Parquet dalam `sources/electiondata-my/pru15/`. Kesemua 58 fail sumber dijejaki menggunakan SHA-256; dataset tambahan turut merekodkan tarikh akses dan lesen CC0.

Data terperinci kini meliputi kesemua 222 Parlimen dan diterbitkan secara malas melalui `public/data/scoresheets/P.XXX.json`. Halaman Parlimen hanya memuatkan fail kerusi yang sedang dilihat serta geografi guna semula dalam `public/data/polling-places.json`. Antara muka melabelkan dengan jelas 56 kerusi `SUMBER RASMI` dan 166 kerusi `DATA TERBUKA · CC0`.

Setiap baris mesti memenuhi `A = B + C + D`: kertas dalam peti sama dengan undi sah calon, undi ditolak dan kertas tidak dikembalikan. Jumlah baris turut mesti sama dengan baris `JUMLAH` dalam PDF. Nama calon dipetakan kepada ID stabil, bukan kedudukan dalam array.

Keutamaan sumber ditentukan mengikut kerusi: helaian mata SPR 760 sentiasa muktamad bagi 56 kerusi yang mempunyai PDF, manakala dataset saluran terbuka hanya digunakan bagi 166 kerusi tanpa PDF. Setiap penjanaan menggantikan terus jumlah undi calon, undi sah, bahagian undi, turnout, pemenang dan majoriti dalam `public/data/election.json` daripada sumber terperinci yang berkenaan. `npm run data:scoresheets:check` memastikan 222 fail terbitan, agregat, imbangan kertas undi dan manifest sumber sentiasa sepadan.

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

## Hierarki kawasan SPR

Penerokaan kawasan kini menggunakan satu rantaian identiti guna semula: `negeri → Parlimen → DUN → PDM → lokaliti`. `public/data/geography.json` menjana 7,748 PDM daripada snapshot Daftar Pemilih Induk 2022 dan menghubungkannya kepada 222 Parlimen serta 600 DUN dalam `constituencies.json`. Wilayah Persekutuan yang tiada DUN bergerak terus daripada Parlimen kepada PDM; aplikasi tidak mencipta DUN rekaan.

Pusat mengundi dan keputusan PDM dipaut melalui kod PDM yang sama dalam scoresheet. Lokaliti hanya diterbitkan apabila dokumen DPT rasmi SPR telah diarkibkan. Oleh sebab sumber DPT boleh bertarikh selepas PRU-15, setiap lokaliti membawa URL dan tarikh sumbernya sendiri dan tidak digunakan untuk mengubah keputusan sejarah.

```bash
npm run data:geography
npm run data:geography:check
```

## Pilihan raya negeri

Laluan `/prn` menerbitkan keputusan Dewan Undangan Negeri sebagai acara pilihan raya yang berasingan daripada PRU Parlimen. Dataset `public/data/state-elections.json` merangkumi acara terkini yang telah selesai bagi kesemua 13 negeri, 600 kerusi DUN dan 2,233 rekod calon. Laluan awam menggunakan bentuk `/prn/{negeri}/{tahun}/dun/{nama-dun}`.

Pengekstrak menggabungkan sumber rasmi SPR: keputusan Data Terbuka bagi PRU DUN berasingan, keputusan DUN Perlis/Perak/Pahang yang berlangsung serentak dengan PRU-15, keputusan tertangguh N.42 Tioman, serta Warta Kerajaan Persekutuan P.U. (B) 246 bagi Johor ke-16. Johor 2026 mempunyai 56 DUN dan 172 calon dengan komposisi BN 48 / PH 8. Negeri Sembilan kekal pada keputusan lengkap 2023 sehingga pilihan raya 1 Ogos 2026 selesai dan keputusan rasminya tersedia.

Warta P.U. (B) 246 menyediakan semua 56 Borang 16: 2,727,926 pemilih, 1,897,668 kertas undi dikeluarkan, 1,874,918 undi sah, 20,655 undi ditolak dan 2,095 kertas tidak dikembalikan. Turnout negeri dikira terus sebagai `B/A`, iaitu 69.56%. Pengekstrak mengesahkan bagi setiap DUN bahawa `B = undi sah + undi ditolak + tidak dikembalikan`, majoriti sepadan dengan dua calon teratas dan pemenang sepadan dengan Jadual Pertama. Semua kod serta nama DUN merujuk `constituencies.json`; komponen tidak menghardkod identiti kawasan.

```bash
npm run data:state-elections:fetch-johor
npm run data:state-elections:gazette
npm run data:state-elections
npm run data:state-elections:check
```

Perintah fetch mengarkibkan respons rasmi MySPR secara deterministik. Gunakan pilihan `--insecure` secara manual hanya jika trust store tempatan gagal mengesahkan sijil SPR; CI dan penerbitan biasa mesti mengekalkan pengesahan TLS.

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
