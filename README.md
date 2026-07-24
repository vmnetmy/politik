# Politik.my — Dashboard Pilihan Raya

Dashboard interaktif pilihan raya Malaysia dengan dataset berasingan mengikut edisi. PRU-14 dan PRU-15 kini diterbitkan sebagai snapshot sejarah yang bebas.

Panduan operasi produksi terdapat dalam [`docs/release-operations.md`](docs/release-operations.md), peranan dan integriti penerbitan data diterangkan dalam [`docs/data-publishing.md`](docs/data-publishing.md), dan kontrak penambahan PRU baharu berada dalam [`docs/election-editions.md`](docs/election-editions.md).

## Jalankan secara tempatan

```bash
npm install
npm run dev
```

Buka alamat yang dipaparkan oleh Vite (biasanya `http://localhost:5173`).

## Struktur URL

- `/` — dialihkan ke dataset semasa di `/pru/15`
- `/pru` — katalog semua edisi PRU yang diterbitkan
- `/pru/{number}` — profil edisi, contohnya `/pru/14` dan `/pru/15`
- `/pru/perbandingan?edisi=14,15` — perbandingan sejarah PRU dengan tapisan negeri, gabungan dan metrik tanpa menulis semula snapshot asal
- `/pru/{number}/pemenang` — direktori semua pemenang edisi dengan carian dan tapisan profil
- `/pru/{number}/negeri` — ringkasan nasional dan senarai negeri
- `/pru/{number}/negeri/{stateName}` — analisis negeri
- `/pru/{number}/negeri/parlimen` — direktori semua kerusi; pelan tempat duduk hanya muncul bagi edisi yang mempunyai capability tersebut
- `/pru/{number}/negeri/parlimen/{parliamentName}` — keputusan penuh, contohnya `/pru/14/negeri/parlimen/padang-besar`
- `/pru/{number}/pengundi` — ringkasan snapshot daftar pemilih bagi edisi tersebut
- `/pru/{number}/pengundi/kawasan` — drill-down Negeri → Parlimen → DUN → PDM
- `/prn` — direktori pilihan raya negeri terkini yang telah selesai bagi semua 13 negeri
- `/prn/{nombor-dewan}` — arkib keputusan mengikut nombor Dewan, termasuk PRN-14, PRN-15 dan PRN-16
- `/prn/{assemblyNumber}` — arkib acara negeri mengikut nombor Dewan, termasuk `/prn/14/`, `/prn/15/` dan `/prn/16/`
- `/prn/{assemblyNumber}/{stateName}/` — komposisi Dewan dan keputusan semua DUN bagi satu acara, contohnya `/prn/16/johor/`
- `/prn/{assemblyNumber}/{stateName}/peta` — peta mandat interaktif apabila sempadan rasmi tersedia, contohnya `/prn/15/negeri-sembilan/peta`
- `/prn/{assemblyNumber}/{stateName}/dun/{dunName}` — keputusan calon penuh satu DUN, contohnya `/prn/16/johor/dun/buloh-kasap`
- `/prn/perbandingan?edisi=14,15,16` — banding komposisi kerusi, turnout, pemilih dan calon merentas edisi
- `/prn/perbandingan/negeri/{stateName}` — perbandingan satu negeri, dengan edisi tidak berkenaan ditanda secara eksplisit
- `/prn/perbandingan/negeri/{stateName}/dun/{dunName}` — perbandingan sejarah satu DUN
- `/prn/perbandingan/parti/{partyName}` — prestasi tiket pada kertas undi merentas edisi
- `/prn/{assemblyNumber}/perbandingan?dengan={assemblyNumber}` — pintasan kepada URL perbandingan kanonik
- `/settings/data` — urus status kerusi Parlimen selepas PRU-15
- `/settings/data/keahlian` — urus parti dan gabungan semasa wakil rakyat secara bertarikh kuat kuasa
- `/settings/data/calon` — urus pembetulan metadata calon tanpa mengubah angka undi
- `/settings/data/parti` — urus katalog parti, gabungan lalai dan status aktif
- `/settings/data/gabungan` — urus katalog gabungan, singkatan dan warna dashboard

Nama negeri dan Parlimen menggunakan slug URL huruf kecil yang dipisahkan dengan tanda sempang. Untuk deployment statik, hos perlu menghalakan URL yang tidak sepadan dengan fail kembali ke `index.html` supaya pautan terus berfungsi.

## Edisi pilihan raya dan kedudukan semasa

Setiap keputusan kekal sebagai snapshot sejarah dan tidak ditulis semula oleh edisi lain. Data teras berada dalam `public/data/elections/pru-14/` dan `public/data/elections/pru-15/`; status kerusi dan keahlian selepas pilihan raya masing-masing berada dalam `changes.json` dan `affiliations.json` di namespace edisi tersebut. Katalog parti, gabungan dan identiti individu yang diguna merentas edisi berada dalam `public/data/reference/`.

PRU-14 mengandungi 222 kerusi, 687 calon dan 14,940,624 pemilih berdaftar. Angka undi datang daripada snapshot keputusan SPR, profil jantina daripada snapshot calon SPR, manakala statistik pemilih, parti komponen, gabungan ketika pilihan raya dan bangsa dipadankan daripada Malaysian Election Corpus. Pengekstrak mengekalkan angka SPR apabila sumber sokongan berbeza dan mengesahkan komposisi 113 PH, 79 BN, 18 GS, 11 lain-lain serta 1 USA.

```bash
npm run data:federal-elections
npm run data:federal-elections:check
```

Tetapan dalam `/settings/data?election=15` disimpan pada pelayar semasa menggunakan kunci yang diasingkan mengikut `electionId` atau `termId`. Gunakan fungsi **Eksport JSON**, kemudian gantikan fail sepadan dalam `public/data/elections/pru-15/` untuk menerbitkan perubahan. Import daripada edisi atau penggal lain akan ditolak.

Gunakan `/settings/data/keahlian` apabila wakil rakyat keluar parti, menyertai parti lain atau menjadi Bebas. Setiap rekod mempunyai tarikh kuat kuasa, ID parti/gabungan, nama snapshot, sebab dan sumber. Paparan awam kemudian menunjukkan identiti **PRU-15** bersebelahan identiti **Semasa**.

Pembetulan nama, gabungan, parti, jantina dan bangsa diurus secara berasingan dalam `/settings/data/calon`. Medan terkawal menggunakan carian combobox, manakala angka undi dan bahagian undi dikunci kepada rekod edisi. Untuk menerbitkan pembetulan calon, eksport JSON dan gantikan `candidate-changes.json` dalam namespace edisi.

Katalog parti dan gabungan disimpan berasingan daripada rekod keputusan. Perubahan nama katalog digunakan untuk identiti semasa, manakala label pada keputusan pilihan raya hanya berubah melalui pembetulan calon yang eksplisit. Eksport katalog daripada halaman masing-masing ke `public/data/reference/parties.json` dan `public/data/reference/alliances.json` untuk deployment.

Paparan identiti menggunakan imej dalam folder `Parties/` dan `Gabungan/`. Nama teks dikekalkan dalam kawalan carian, tapisan dan penyuntingan; identiti tanpa imej padanan menggunakan lencana ringkas sebagai fallback.

## Helaian mata mengikut saluran

Arkib `sources/pru15/scoresheets/` mengandungi 56 PDF SPR 760. Baki 166 kerusi dilengkapkan menggunakan pasangan dataset undi calon dan statistik saluran terbuka yang diarkibkan sebagai Parquet dalam `sources/electiondata-my/pru15/`. Kesemua 58 fail sumber dijejaki menggunakan SHA-256; dataset tambahan turut merekodkan tarikh akses dan lesen CC0.

Data terperinci kini meliputi kesemua 222 Parlimen dan diterbitkan secara malas melalui `public/data/elections/pru-15/scoresheets/P.XXX.json`. Halaman Parlimen hanya memuatkan fail kerusi yang sedang dilihat serta geografi guna semula dalam namespace PRU-15. Antara muka melabelkan dengan jelas 56 kerusi `SUMBER RASMI` dan 166 kerusi `DATA TERBUKA · CC0`.

Setiap baris mesti memenuhi `A = B + C + D`: kertas dalam peti sama dengan undi sah calon, undi ditolak dan kertas tidak dikembalikan. Jumlah baris turut mesti sama dengan baris `JUMLAH` dalam PDF. Nama calon dipetakan kepada ID stabil, bukan kedudukan dalam array.

Keutamaan sumber ditentukan mengikut kerusi: helaian mata SPR 760 sentiasa muktamad bagi 56 kerusi yang mempunyai PDF, manakala dataset saluran terbuka hanya digunakan bagi 166 kerusi tanpa PDF. Setiap penjanaan menggantikan terus jumlah undi calon, undi sah, bahagian undi, turnout, pemenang dan majoriti dalam `public/data/elections/pru-15/election.json` daripada sumber terperinci yang berkenaan. `npm run data:scoresheets:check` memastikan 222 fail terbitan, agregat, imbangan kertas undi dan manifest sumber sentiasa sepadan.

```bash
npm run data:scoresheets
npm run data:scoresheets:check
```

## Pelan tempat duduk Dewan Rakyat

Kedudukan pada visual interaktif dijana daripada `SeatingDR.pdf` dan `SeatingDR.svg`, bertarikh 13 Julai 2026, lalu disimpan dalam `public/data/elections/pru-15/seating.json`. Lapisan teks PDF memadankan kawasan dan wakil, manakala kod serta geometri fizikal A1-G28 mengikuti sistem koordinat asal `1190 × 842` dalam SVG. Koordinat paparan `x/y` tidak disusun semula kepada grid atau lengkok baharu; setiap kad kekal pada kedudukan sumbernya yang tepat. `sourceX/sourceY` mengekalkan titik padanan kawasan daripada PDF untuk jejak audit.

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

## Daftar pemilih PRU-14 dan PRU-15

Halaman `/pru/14/pengundi` dan `/pru/15/pengundi` menggunakan snapshot tahunan Daftar Pemilih Induk rasmi SPR bagi 2018 dan 2022. Halaman `/pengundi/kawasan` bagi setiap edisi menggunakan kontrak yang sama untuk 16 negeri atau wilayah, 222 Parlimen, DUN yang sah pada tahun tersebut dan semua PDM—tanpa menghardkod nama kawasan dalam komponen React.

Snapshot 2018 merekodkan 15,033,004 pemilih, 587 DUN dan 7,747 PDM. Snapshot 2022 merekodkan 21,290,400 pemilih, 600 DUN dan 7,748 PDM. Paparan membezakan angka snapshot tahunan ini daripada denominator keputusan pilihan raya pada hari mengundi; kedua-duanya tidak dicampurkan.

```bash
npm run data:voter-roll
npm run data:voter-roll:check
```

## Statistik umur pengundi

Halaman `/pru/15/pengundi/umur` menggunakan laporan SPR `STATISTIK PRU KE_15 UMUR BY_DUN.pdf`. Identiti kawasan disimpan sekali bagi edisi ini dalam `public/data/elections/pru-15/constituencies.json`: 16 negeri atau wilayah, 222 Parlimen dan 600 DUN dengan hubungan induk yang eksplisit. Statistik dalam `voter-age.json` hanya merujuk `stateId`, `parliamentCode` atau `dunId`, supaya nama dan kod tidak diulang atau dihardkod dalam komponen paparan.

## Bangsa pengundi

Halaman `/pru/15/pengundi/kaum` merekodkan status penerbitan sumber rasmi SPR. Manual MySPR menetapkan sembilan kategori `Bangsa`, tetapi katalog Pendaftaran Pemilih dan API dashboard SPR tidak menerbitkan bilangan agregat kategori tersebut. `voter-ethnicity.json` menyimpan taksonomi rasmi serta status `taxonomy-only`; `records` sengaja kekal kosong supaya aplikasi tidak menganggar bangsa daripada nama, lokasi atau data penduduk. Pemilih berdaftar dan pilihan kawasan pada halaman ini tetap datang daripada `voter-age.json` dan `constituencies.json` yang sama.

Tiga belas rekod `N.00` bagi Kuala Lumpur, Putrajaya dan Labuan dikekalkan sebagai jumlah peringkat Parlimen dan tidak ditukar menjadi DUN rekaan. Pengekstrak mengesahkan setiap jumlah kumpulan umur, jumlah DUN kepada Parlimen, 222 Parlimen, 600 DUN serta cap jari SHA-256 sumber.

```bash
npm run data:voter-age
npm run data:voter-age:check
```

## Hierarki kawasan SPR

Penerokaan kawasan kini menggunakan satu rantaian identiti guna semula: `negeri → Parlimen → DUN → PDM → lokaliti`. `public/data/elections/pru-15/geography.json` menjana 7,748 PDM daripada snapshot Daftar Pemilih Induk 2022 dan menghubungkannya kepada 222 Parlimen serta 600 DUN dalam `constituencies.json`. Wilayah Persekutuan yang tiada DUN bergerak terus daripada Parlimen kepada PDM; aplikasi tidak mencipta DUN rekaan.

Pusat mengundi dan keputusan PDM dipaut melalui kod PDM yang sama dalam scoresheet. Lokaliti hanya diterbitkan apabila dokumen DPT rasmi SPR telah diarkibkan. Oleh sebab sumber DPT boleh bertarikh selepas PRU-15, setiap lokaliti membawa URL dan tarikh sumbernya sendiri dan tidak digunakan untuk mengubah keputusan sejarah.

```bash
npm run data:geography
npm run data:geography:check
```

## Pilihan raya negeri

Laluan `/prn` menerbitkan keputusan Dewan Undangan Negeri sebagai acara pilihan raya yang berasingan daripada PRU Parlimen. Dataset `public/data/state-elections.json` mengekalkan acara terkini yang telah selesai bagi kesemua 13 negeri (600 kerusi DUN dan 2,233 rekod calon), arkib Dewan ke-14 bagi 11 negeri yang mengadakan pilihan raya serentak dengan PRU-14 (445 kerusi dan 1,394 calon), serta acara perantaraan yang telah diterbitkan seperti kesemua 56 keputusan Johor PRN-15 pada 12 Mac 2022. Jumlah pemilih PRN-14 datang daripada daftar pemilih SPR yang diwartakan pada 10 April 2018; acara arkib lain mengekalkan jumlah pemilih daripada dataset keputusan masing-masing. Laluan awam menggunakan bentuk `/prn/{nombor-dewan}/{negeri}/dun/{nama-dun}`.

Laluan `/prn/perbandingan` membandingkan nombor Dewan, bukannya menganggap semua negeri mengundi pada satu tarikh nasional. Pemilih boleh menukar metrik serta skop negeri, DUN atau tiket parti. Carta Chart.js menggunakan animasi semasa metrik berubah, kad ringkasan bermorph menggunakan Motion, dan sel tanpa acara kekal `Tidak berkenaan` supaya ketiadaan pilihan raya tidak disalah tafsir sebagai sifar.

Pengekstrak menggabungkan sumber rasmi SPR: keputusan Data Terbuka bagi PRU DUN berasingan, keputusan DUN Perlis/Perak/Pahang yang berlangsung serentak dengan PRU-15, keputusan tertangguh N.42 Tioman, serta Warta Kerajaan Persekutuan P.U. (B) 246 bagi Johor ke-16. Johor 2026 mempunyai 56 DUN dan 172 calon dengan komposisi BN 48 / PH 8. Negeri Sembilan kekal pada keputusan lengkap 2023 sehingga pilihan raya 1 Ogos 2026 selesai dan keputusan rasminya tersedia.

Warta P.U. (B) 246 menyediakan semua 56 Borang 16: 2,727,926 pemilih, 1,897,668 kertas undi dikeluarkan, 1,874,918 undi sah, 20,655 undi ditolak dan 2,095 kertas tidak dikembalikan. Turnout negeri dikira terus sebagai `B/A`, iaitu 69.56%. Pengekstrak mengesahkan bagi setiap DUN bahawa `B = undi sah + undi ditolak + tidak dikembalikan`, majoriti sepadan dengan dua calon teratas dan pemenang sepadan dengan Jadual Pertama. Semua kod serta nama DUN merujuk `constituencies.json`; komponen tidak menghardkod identiti kawasan.

### Peta PRN-15 Negeri Sembilan

Laluan `/prn/15/negeri-sembilan/peta` menggunakan 36 geometri DUN daripada dataset sempadan rasmi SPR. Arkib KMZ asal dikunci dengan SHA-256 di `sources/spr/boundaries/`; penjana mengekstrak lapisan DUN, menayangkan koordinat ke SVG responsif dan memadankan setiap `dunId` kepada keputusan PRN-15 secara satu-ke-satu.

Peta menyokong carian DUN, tapisan parti pemenang dan navigasi spatial dengan kekunci anak panah. Trackpad menggunakan `Ctrl/Command + tatal` untuk pinch zoom dan tatal dua jari untuk pan selepas dizum; skrin sentuh menyokong pinch dua jari serta drag. Kawalan pada kanvas menyediakan zum, reset dan skrin penuh—termasuk fallback skrin penuh untuk pelayar mudah alih yang tidak menyediakan Fullscreen API.

Pemilihan bergerak antara centroid menggunakan spring morph, manakala panel keputusan bertukar menggunakan peralihan bentuk yang menghormati `prefers-reduced-motion`. Dalam skrin penuh, butiran DUN dipaparkan sebagai panel terapung yang boleh diseret dalam batas kanvas dan kandungannya bermorph apabila kawasan baharu dipilih. Petunjuk diasingkan daripada kanvas supaya ia boleh membalut tanpa mengecilkan geometri.

```bash
npm run data:boundaries
npm run data:boundaries:check
```

### Atlas Pilihan Raya Nasional

Laluan `/peta` menyatukan PRU dan PRN dalam satu atlas berhierarki `Malaysia → negeri → Parlimen/DUN → PDM → lokaliti`. Penukar edisi dibina daripada registry PRU dan acara PRN yang diterbitkan. Selain mod `Pemenang`, `Majoriti` dan `Keluar mengundi`, Atlas menyediakan perbandingan `Bertukar tangan`, `Δ Majoriti`, `Δ Turnout` dan `Swing undi` terhadap edisi rujukan. Semua pilihan disimpan sebagai parameter URL `jenis`, `edisi`, `mod`, `banding`, `negeri`, `kerusi`, `dun`, `pdm` dan `lokaliti`, jadi paparan terperinci boleh dikongsi dan dipulihkan melalui sejarah pelayar.

Atlas menggunakan kesemua 222 geometri Parlimen dan 600 geometri DUN daripada arkib KMZ rasmi SPR. `scripts/extract_atlas_boundaries.py` mengekalkan identiti daripada `constituencies.json`, memudahkan koordinat secara deterministik dan menerbitkan indeks nasional ringan serta 16 chunk geometri negeri yang dimuatkan secara malas. `public/data/boundaries/registry.json` memetakan setiap edisi kepada versi sempadan, tarikh kuat kuasa dan status `exact` atau `compatible`; paparan menunjukkan amaran apabila hanya sempadan serasi tersedia.

Peta ditayangkan dengan `d3-geo` dan menyokong klik/tap, navigasi spatial papan kekunci, pinch trackpad atau skrin sentuh, pan, zum, reset dan skrin penuh. Dalam skrin penuh, panel keputusan boleh diseret. Carian utama meliputi negeri, kerusi, calon dan parti; carian hierarki selepas pemilihan kerusi meliputi DUN, PDM dan lokaliti. Jadual HTML boleh diisih menyediakan pandangan bukan visual yang setara.

```bash
npm run data:atlas
npm run data:atlas:check
```

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
npm run data:federal-elections:check
npm run data:manifest:check
npm run data:reconcile:check
npm run build
```

`npm run test:e2e` dan `npm run lighthouse` memerlukan Chromium. Pipeline GitHub memasang pelayar tersebut, menguji paparan desktop dan mudah alih, membandingkan tangkapan skrin dengan baseline `main`, dan menguatkuasakan bajet Lighthouse. Jalankan `npm run data:manifest` selepas mengubah mana-mana fail data yang diterbitkan.

## Pipeline data

Fail Numbers asal dikekalkan tanpa perubahan. Dashboard membaca dataset ternormal dalam `public/data/elections/{electionId}/election.json`.

Untuk menjana semula data, eksport fail Numbers kepada `.xlsx`, kemudian jalankan:

```bash
python3 -m pip install -r requirements.txt
python3 scripts/extract_data.py /path/to/pru15.xlsx public/data/elections/pru-15/election.json
```

Pengekstrak mengesahkan bahawa output mengandungi 222 kerusi dan 945 calon. Pembetulan sumber yang telah disahkan direkodkan secara eksplisit dalam pengekstrak supaya penjanaan semula menghasilkan angka yang sama.

Jumlah pemilih berdaftar P.201 Batang Lupar ditetapkan kepada 43,072 berdasarkan jumlah kawasan yang disahkan. Rekodnya membezakan 27,559 undi sah daripada 28,118 kertas undi dikeluarkan; peratus keluar mengundi dikira daripada angka kedua.
