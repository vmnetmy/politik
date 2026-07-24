# Menambah edisi PRU

Setiap PRU ialah snapshot bebas. Jangan salin perubahan `Semasa`, ID pencalonan atau data saluran daripada edisi lain.

## Kontrak identiti

- `electionId`: namespace edisi, contohnya `pru-14`.
- `termId`: penggal Dewan Rakyat yang terhasil, contohnya `dr-14`.
- `contestId`: `{electionId}:{kodParlimen}`.
- `candidacyId`: `{contestId}:{nomborCalon}` dan unik bagi satu pencalonan.
- `personId`: identiti orang merentas edisi dalam `public/data/reference/persons.json`.
- `boundaryVersion`: versi sempadan yang digunakan oleh keputusan itu.

Nama orang bukan primary key. Satu `personId` boleh mempunyai banyak `candidacyId`; keputusan, parti dan gabungan ketika pilihan raya kekal pada rekod pencalonan masing-masing.

Pengekstrak cuba memadankan `canonicalName` dan `aliases` dalam registry orang. Jika nama sama mewakili lebih daripada seorang atau ejaan telah berubah, tambah padanan eksplisit pada `public/data/reference/person-matches.json`; jangan paksa nama menjadi primary key.

## Struktur fail

```text
public/data/
├── elections/
│   ├── index.json
│   ├── pru-14/
│   │   ├── election.json
│   │   ├── changes.json
│   │   ├── affiliations.json
│   │   ├── candidate-changes.json
│   │   └── manifest.json
│   └── pru-15/
└── reference/
    ├── persons.json
    ├── parties.json
    └── alliances.json
```

Fail pilihan seperti `seating.json`, `scoresheets/`, `voter-age.json` dan `geography.json` hanya diwajibkan apabila capability berkaitan diaktifkan.

## Langkah penerbitan PRU baharu

1. Tambah metadata edisi pada `src/elections.ts` dan `public/data/elections/index.json` dengan nilai yang sama.
2. Pastikan hanya satu edisi mempunyai `isCurrentTerm: true`. Tukar edisi terdahulu kepada `false` apabila penggal baharu bermula.
3. Jana `election.json` dengan schema `schemas/election.schema.json`; pastikan semua kerusi, pencalonan dan orang mempunyai ID stabil. PRU-14 dibina daripada arkib keputusan dan calon SPR, dengan statistik serta parti komponen daripada Malaysian Election Corpus:

   ```bash
   npm run data:federal-elections
   ```
4. Tambah fail perubahan kosong berformat versi 2 dengan `electionId`; fail keahlian turut memerlukan `termId`.
5. Hidupkan capability hanya selepas datasetnya diterbitkan dan disahkan.
6. Jana semula `public/data/reference/persons.json` dengan semua fail pilihan raya sebagai input.
7. Jana manifest, kemudian jalankan lint, unit test, ujian Python, build dan ujian browser.

Lapisan `changes.json` dan `affiliations.json` hanya digunakan oleh edisi yang ditanda sebagai penggal aktif. Paparan PRU terdahulu sentiasa menggunakan keputusan serta identiti ketika pilihan raya, bukan kedudukan semasa.
