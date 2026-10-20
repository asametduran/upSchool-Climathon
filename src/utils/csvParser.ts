import { HydrologyRecord, SubBasin } from '../types/hydrology';

export interface ParseResult {
  records: HydrologyRecord[];
  years: number[];
  basins: SubBasin[];
  error?: string;
}

const REQUIRED_HEADERS = [
  'Tarih',
  'Yil',
  'Ay',
  'Alt_Havza',
  'Kar_Ortusu_km2',
  'Sicaklik_Ort_C',
  'Kar_Su_Esd_SWE_mm',
  'Yagis_mm',
  'Fiziksel_SRM_Akis_m3s',
  'Gozlenen_Girdi_m3s',
  'Uluova_Pompaj_Enerji_MWh',
];

export function parseHydrologyCsv(csvText: string): ParseResult {
  if (!csvText || !csvText.trim()) {
    return { records: [], years: [], basins: [], error: 'CSV dosyası boş veya okunamadı.' };
  }

  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) {
    return { records: [], years: [], basins: [], error: 'CSV en az bir başlık satırı ve bir veri satırı içermelidir.' };
  }

  const headerLine = lines[0].trim();
  const headers = headerLine.split(',').map((h) => h.trim().replace(/^[\uFEFF"']|["']$/g, ''));

  // Validate headers
  const missingHeaders = REQUIRED_HEADERS.filter((req) => !headers.includes(req));
  if (missingHeaders.length > 0) {
    return {
      records: [],
      years: [],
      basins: [],
      error: `Geçersiz CSV şeması! Eksik sütunlar: ${missingHeaders.join(', ')}. Lütfen Keban-Hazar standart veri formatını kullanınız.`,
    };
  }

  const headerIdxMap: { [key: string]: number } = {};
  headers.forEach((h, idx) => {
    headerIdxMap[h] = idx;
  });

  const records: HydrologyRecord[] = [];
  const yearsSet = new Set<number>();
  const basinsSet = new Set<SubBasin>();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(',');
    if (parts.length < headers.length) continue;

    const tarih = parts[headerIdxMap['Tarih']].trim();
    const yil = parseInt(parts[headerIdxMap['Yil']], 10);
    const ay = parseInt(parts[headerIdxMap['Ay']], 10);
    const altHavzaRaw = parts[headerIdxMap['Alt_Havza']].trim();
    const altHavza: SubBasin = altHavzaRaw === 'Palu' ? 'Palu' : 'Uluova';

    const karOrtusu = parseFloat(parts[headerIdxMap['Kar_Ortusu_km2']]) || 0;
    const sicaklik = parseFloat(parts[headerIdxMap['Sicaklik_Ort_C']]) || 0;
    const swe = parseFloat(parts[headerIdxMap['Kar_Su_Esd_SWE_mm']]) || 0;
    const yagis = parseFloat(parts[headerIdxMap['Yagis_mm']]) || 0;
    const srm = parseFloat(parts[headerIdxMap['Fiziksel_SRM_Akis_m3s']]) || 0;
    const gozlenen = parseFloat(parts[headerIdxMap['Gozlenen_Girdi_m3s']]) || 0;
    const pompaj = parseFloat(parts[headerIdxMap['Uluova_Pompaj_Enerji_MWh']]) || 0;

    if (!isNaN(yil)) {
      yearsSet.add(yil);
      basinsSet.add(altHavza);
      records.push({
        Tarih: tarih,
        Yil: yil,
        Ay: ay,
        Alt_Havza: altHavza,
        Kar_Ortusu_km2: karOrtusu,
        Sicaklik_Ort_C: sicaklik,
        Kar_Su_Esd_SWE_mm: swe,
        Yagis_mm: yagis,
        Fiziksel_SRM_Akis_m3s: srm,
        Gozlenen_Girdi_m3s: gozlenen,
        Uluova_Pompaj_Enerji_MWh: pompaj,
      });
    }
  }

  const sortedYears = Array.from(yearsSet).sort((a, b) => a - b);
  const basins = Array.from(basinsSet);

  if (records.length === 0) {
    return { records: [], years: [], basins: [], error: 'CSV içerisinde geçerli hidrolojik veri satırı bulunamadı.' };
  }

  return {
    records,
    years: sortedYears,
    basins,
  };
}
