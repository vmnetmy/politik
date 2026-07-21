const allianceImageModules = import.meta.glob("../../../Gabungan/*.png", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const partyImageModules = import.meta.glob("../../../Parties/*.png", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const allianceImage = (filename: string) => allianceImageModules[`../../../Gabungan/${filename}`];
const partyImage = (filename: string) => partyImageModules[`../../../Parties/${filename}`];

export const ALLIANCE_IMAGES: Record<string, string | undefined> = {
  PH: allianceImage("01-pakatan-harapan.png"),
  PN: allianceImage("02-perikatan-nasional.png"),
  BN: allianceImage("03-barisan-nasional.png"),
  PEJUANG: allianceImage("04-gerakan-tanah-air-gta.png"),
  PUTRA: allianceImage("04-gerakan-tanah-air-gta.png"),
  GTA: allianceImage("04-gerakan-tanah-air-gta.png"),
  "LAIN-LAIN": allianceImage("05-bebas.png"),
  BEBAS: allianceImage("05-bebas.png"),
};

export const PARTY_IMAGES: Record<string, string | undefined> = {
  UMNO: partyImage("01-umno.png"),
  PAS: partyImage("02-pas.png"),
  PKR: partyImage("03-pkr.png"),
  DAP: partyImage("04-dap.png"),
  AMANAH: partyImage("05-amanah.png"),
  BERSATU: partyImage("06-bersatu.png"),
  PEJUANG: partyImage("07-pejuang.png"),
  WARISAN: partyImage("08-warisan.png"),
  MUDA: partyImage("09-muda.png"),
  GERAKAN: partyImage("10-gerakan.png"),
  MCA: partyImage("11-mca.png"),
  MIC: partyImage("12-mic.png"),
  PBM: partyImage("13-parti-bangsa-malaysia-pbm.png"),
  PRM: partyImage("14-parti-rakyat-malaysia-prm.png"),
  PCM: partyImage("15-parti-cinta-malaysia-pcm.png"),
  PBS: partyImage("16-parti-bersatu-sabah-pbs.png"),
  STARSABAH: partyImage("17-star-sabah.png"),
  STAR: partyImage("17-star-sabah.png"),
  SAPP: partyImage("18-sapp.png"),
  PBB: partyImage("19-parti-pesaka-bumiputera-bersatu-pbb.png"),
  SUPP: partyImage("20-sarawak-united-peoples-party-supp.png"),
  PBK: partyImage("21-parti-bumi-kenyalang-pbk.png"),
  KDM: partyImage("23-parti-kesejahteraan-demokratik-masyarakat-kdm.png"),
  PSB: partyImage("24-parti-sarawak-bersatu-psb.png"),
  PWN: partyImage("25-parti-wawasan-negara.png"),
  "PARTI WAWASAN NEGARA": partyImage("25-parti-wawasan-negara.png"),
  BEBAS: allianceImage("05-bebas.png"),
};

export function identityCode(name: string, explicitShortName?: string) {
  const inferred = explicitShortName || name.match(/\(([^)]+)\)\s*$/)?.[1] || name;
  const upper = inferred.trim().toUpperCase();
  if (upper === "PAS-DHPP") return "PAS";
  if (upper === "BERSATU-BERSEKUTU") return "BERSATU";
  if (upper === "KERUSI KOSONG") return "KOSONG";
  return upper;
}

export function compactIdentityLabel(code: string) {
  if (code.length <= 12) return code;
  return code.split(/[^A-Z0-9]+/).filter(Boolean).map((word) => word[0]).join("").slice(0, 8) || code.slice(0, 8);
}
