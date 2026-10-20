/**
 * Keban-Hazar Havzası Hidrolojik Karar Destek Platformu
 * Tip Tanımları
 */

export interface HydrologyRecord {
  Tarih: string; // YYYY-MM-DD
  Yil: number;
  Ay: number;
  Alt_Havza: 'Uluova' | 'Palu';
  Kar_Ortusu_km2: number;
  Sicaklik_Ort_C: number;
  Kar_Su_Esd_SWE_mm: number;
  Yagis_mm: number;
  Fiziksel_SRM_Akis_m3s: number;
  Gozlenen_Girdi_m3s: number;
  Uluova_Pompaj_Enerji_MWh: number;
}

export type SubBasin = 'Uluova' | 'Palu';
export type ModelType = 'ridge' | 'boosted';

export interface ScenarioParams {
  avoidableOverirrigationPct: number; // 0 - 25, default 13%
  nightShiftableLoadPct: number;      // 0 - 100, default 60%
  dayTariffTL: number;               // TL / MWh, default 3200
  nightTariffTL: number;             // TL / MWh, default 1900
  emissionFactor: number;            // tCO2 / MWh, default 0.45
}

export interface ModelMetrics {
  loyoMae: number;
  loyoR2: number;
  trainYears: number[];
  testYear: number;
  subBasin: SubBasin;
  modelType: ModelType;
  samplesCount: number;
}

export interface DailyForecast {
  date: string;
  dayIndex: number;
  horizon: number;
  observedFlow?: number;
  isAfterCutoff: boolean;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  srmFlow: number;
  sweMm: number;
  snowCoverKm2: number;
  tempC: number;
  precipMm: number;
  baselineEnergyMWh: number;
  recommendedEnergyMWh: number;
}

export interface HistoricalYearVolume {
  year: number;
  volumeHm3: number;
  peakFlow: number;
  peakDate: string;
}

export interface RiskAnalysis {
  score: number; // 0 - 100
  category: 'Düşük' | 'Orta' | 'Yüksek';
  color: string;
  historicalVolumes: HistoricalYearVolume[];
  p25Volume: number;
  medianVolume: number;
  currentObservedCutoffVolume: number;
  forecastVolumeP50: number;
  totalSeasonVolumeP50: number;
  totalSeasonVolumeP10: number;
  totalSeasonVolumeP90: number;
  probLessThanP25: number; // 0 - 100%
  empiricalCdfPercentile: number; // 0 - 100
}

export interface DecisionCardData {
  riskCategory: 'Düşük' | 'Orta' | 'Yüksek';
  confidence: 'Düşük' | 'Orta' | 'Yüksek';
  summaryPoints: string[];
  recommendedActionShort: string;
  fourteenDayPlan: {
    date: string;
    flowP50: number;
    irrigationStatus: string;
    windowNote: string;
    plannedMWh: number;
    gravityShare: string;
  }[];
}

export interface SimulationState {
  currentDayIndex: number; // 0..121
  isPlaying: boolean;
  speed: 1 | 5 | 20;
}
