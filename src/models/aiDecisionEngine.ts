import {
  HydrologyRecord,
  SubBasin,
  ModelType,
  ScenarioParams,
  DailyForecast,
  ModelMetrics,
  RiskAnalysis,
  DecisionCardData,
  HistoricalYearVolume,
} from '../types/hydrology';

// Matrix inversion using Gauss-Jordan with partial pivoting
function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = A.length;
  const M: number[][] = A.map((row, i) => [...row, b[i]]);

  for (let i = 0; i < n; i++) {
    // Find pivot
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) {
        maxRow = k;
      }
    }
    // Swap
    const temp = M[i];
    M[i] = M[maxRow];
    M[maxRow] = temp;

    const pivot = M[i][i];
    if (Math.abs(pivot) < 1e-12) {
      // Near singular, add tiny ridge
      M[i][i] = 1e-6;
    }

    const scale = M[i][i];
    for (let j = i; j <= n; j++) {
      M[i][j] /= scale;
    }

    for (let k = 0; k < n; k++) {
      if (k !== i) {
        const factor = M[k][i];
        for (let j = i; j <= n; j++) {
          M[k][j] -= factor * M[i][j];
        }
      }
    }
  }

  return M.map((row) => row[n]);
}

// Deterministic Mulberry32 seeded random number generator (Fix #6)
function createSeededRandom(seed: number = 42) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t >>> 0) / 4294967296;
  };
}

interface RidgeModel {
  weights: number[];
  means: number[];
  stds: number[];
}

interface DecisionStump {
  featureIdx: number;
  threshold: number;
  leftVal: number;
  rightVal: number;
}

interface BoostedModel {
  baseValue: number;
  learningRate: number;
  stumps: DecisionStump[];
}

interface Sample {
  features: number[]; // [SWE, SCA, T_last7, Q_last7, cutoffIdx, T_clim_target, horizon]
  target: number; // Gozlenen_Girdi_m3s
  year: number;
}

// Fit Ridge Regression with L2 regularization lambda = 1.0
function trainRidge(samples: Sample[], lambda: number = 1.0): RidgeModel {
  if (samples.length === 0) {
    return { weights: [0], means: [0], stds: [1] };
  }

  const d = samples[0].features.length;
  const means: number[] = new Array(d).fill(0);
  const stds: number[] = new Array(d).fill(0);

  // Compute means
  for (const s of samples) {
    for (let j = 0; j < d; j++) {
      means[j] += s.features[j];
    }
  }
  for (let j = 0; j < d; j++) {
    means[j] /= samples.length;
  }

  // Compute stds
  for (const s of samples) {
    for (let j = 0; j < d; j++) {
      stds[j] += (s.features[j] - means[j]) ** 2;
    }
  }
  for (let j = 0; j < d; j++) {
    stds[j] = Math.sqrt(stds[j] / samples.length);
    if (stds[j] < 1e-6) stds[j] = 1.0;
  }

  // Normal equations: (Z^T Z + lambda I) w = Z^T y
  // Include intercept term as index d
  const p = d + 1;
  const ZTZ: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  const ZTy: number[] = new Array(p).fill(0);

  for (const s of samples) {
    const z = s.features.map((val, j) => (val - means[j]) / stds[j]);
    z.push(1.0); // bias

    for (let r = 0; r < p; r++) {
      ZTy[r] += z[r] * s.target;
      for (let c = 0; c < p; c++) {
        ZTZ[r][c] += z[r] * z[c];
      }
    }
  }

  // Add L2 penalty (do not penalize intercept)
  for (let j = 0; j < d; j++) {
    ZTZ[j][j] += lambda;
  }

  const weights = solveLinearSystem(ZTZ, ZTy);
  return { weights, means, stds };
}

function predictRidge(model: RidgeModel, features: number[]): number {
  let val = model.weights[model.weights.length - 1]; // intercept
  for (let j = 0; j < features.length; j++) {
    const z = (features[j] - model.means[j]) / model.stds[j];
    val += model.weights[j] * z;
  }
  return Math.max(0.1, val);
}

// Fit Gradient-Boosted Decision Stumps (50 trees, eta = 0.1)
function trainBoosted(samples: Sample[], numTrees = 50, learningRate = 0.1): BoostedModel {
  if (samples.length === 0) {
    return { baseValue: 0, learningRate, stumps: [] };
  }

  const n = samples.length;
  const d = samples[0].features.length;

  // Base value = target mean
  let sumY = 0;
  for (const s of samples) sumY += s.target;
  const baseValue = sumY / n;

  const currentPreds = new Float64Array(n).fill(baseValue);
  const stumps: DecisionStump[] = [];

  for (let t = 0; t < numTrees; t++) {
    const residuals = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      residuals[i] = samples[i].target - currentPreds[i];
    }

    let bestFeature = 0;
    let bestThreshold = 0;
    let bestLeftVal = 0;
    let bestRightVal = 0;
    let bestLoss = Infinity;

    // Search for best feature and split
    for (let j = 0; j < d; j++) {
      // Sample 15 candidate split thresholds across the feature range
      let minF = Infinity;
      let maxF = -Infinity;
      for (let i = 0; i < n; i++) {
        const val = samples[i].features[j];
        if (val < minF) minF = val;
        if (val > maxF) maxF = val;
      }

      if (maxF <= minF) continue;

      const step = (maxF - minF) / 16;
      for (let s = 1; s <= 15; s++) {
        const thresh = minF + s * step;

        let leftCount = 0;
        let rightCount = 0;
        let leftSum = 0;
        let rightSum = 0;

        for (let i = 0; i < n; i++) {
          if (samples[i].features[j] <= thresh) {
            leftCount++;
            leftSum += residuals[i];
          } else {
            rightCount++;
            rightSum += residuals[i];
          }
        }

        if (leftCount === 0 || rightCount === 0) continue;

        const leftMean = leftSum / leftCount;
        const rightMean = rightSum / rightCount;

        let loss = 0;
        for (let i = 0; i < n; i++) {
          const pred = samples[i].features[j] <= thresh ? leftMean : rightMean;
          loss += (residuals[i] - pred) ** 2;
        }

        if (loss < bestLoss) {
          bestLoss = loss;
          bestFeature = j;
          bestThreshold = thresh;
          bestLeftVal = leftMean;
          bestRightVal = rightMean;
        }
      }
    }

    const stump: DecisionStump = {
      featureIdx: bestFeature,
      threshold: bestThreshold,
      leftVal: bestLeftVal,
      rightVal: bestRightVal,
    };
    stumps.push(stump);

    // Update current predictions
    for (let i = 0; i < n; i++) {
      const inc = samples[i].features[stump.featureIdx] <= stump.threshold ? stump.leftVal : stump.rightVal;
      currentPreds[i] += learningRate * inc;
    }
  }

  return { baseValue, learningRate, stumps };
}

function predictBoosted(model: BoostedModel, features: number[]): number {
  let val = model.baseValue;
  for (const stump of model.stumps) {
    const inc = features[stump.featureIdx] <= stump.threshold ? stump.leftVal : stump.rightVal;
    val += model.learningRate * inc;
  }
  return Math.max(0.1, val);
}

// Percentile helper
function getPercentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  const weight = idx - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Main AI Engine for Hydrological Forecast & Decision Support
 */
export function runHydrologyDecisionEngine(
  allRecords: HydrologyRecord[],
  selectedBasin: SubBasin,
  selectedYear: number,
  cutoffDateStr: string,
  modelType: ModelType,
  scenarioParams: ScenarioParams
): {
  dailyForecasts: DailyForecast[];
  modelMetrics: ModelMetrics;
  riskAnalysis: RiskAnalysis;
  decisionCard: DecisionCardData;
  historicalYearVolumes: HistoricalYearVolume[];
} {
  // Filter by selected basin and sort chronologically
  const basinRecords = allRecords
    .filter((r) => r.Alt_Havza === selectedBasin)
    .sort((a, b) => a.Tarih.localeCompare(b.Tarih));

  // Group by year
  const recordsByYear = new Map<number, HydrologyRecord[]>();
  for (const r of basinRecords) {
    if (!recordsByYear.has(r.Yil)) {
      recordsByYear.set(r.Yil, []);
    }
    recordsByYear.get(r.Yil)!.push(r);
  }

  const years = Array.from(recordsByYear.keys()).sort((a, b) => a - b);
  const trainYears = years.filter((y) => y !== selectedYear);

  // Selected year series
  const currentYearRecords = recordsByYear.get(selectedYear) || [];
  if (currentYearRecords.length === 0) {
    throw new Error(`${selectedYear} yılı için veri bulunamadı.`);
  }

  // Find cutoff index
  let cutoffIdx = currentYearRecords.findIndex((r) => r.Tarih === cutoffDateStr);
  if (cutoffIdx === -1) {
    // If not exact match, find closest or default to approx middle (~45 for April 15)
    cutoffIdx = currentYearRecords.findIndex((r) => r.Tarih >= cutoffDateStr);
    if (cutoffIdx === -1) cutoffIdx = Math.min(45, currentYearRecords.length - 1);
  }

  // Compute Climatological daily average temperatures across train years (other 8 years)
  const numDaysInSeason = currentYearRecords.length;
  const climTempByDay = new Array(numDaysInSeason).fill(0);
  for (let d = 0; d < numDaysInSeason; d++) {
    let tSum = 0;
    let tCount = 0;
    for (const y of trainYears) {
      const yRecs = recordsByYear.get(y);
      if (yRecs && yRecs[d]) {
        tSum += yRecs[d].Sicaklik_Ort_C;
        tCount++;
      }
    }
    climTempByDay[d] = tCount > 0 ? tSum / tCount : 15;
  }

  // Feature builder helper (Fix #1: Only features known at cutoff + target day's climatological temperature)
  const extractFeaturesForDay = (
    yearRecs: HydrologyRecord[],
    cutI: number,
    targetDayI: number,
    climatologyByDay: number[]
  ): number[] => {
    const cutRec = yearRecs[cutI];

    // Last 7 days averages up to cutoff
    const start7 = Math.max(0, cutI - 6);
    let sumT7 = 0;
    let sumQ7 = 0;
    const count7 = cutI - start7 + 1;
    for (let k = start7; k <= cutI; k++) {
      sumT7 += yearRecs[k].Sicaklik_Ort_C;
      sumQ7 += yearRecs[k].Gozlenen_Girdi_m3s;
    }
    const tLast7 = sumT7 / count7;
    const qLast7 = sumQ7 / count7;
    const horizon = targetDayI - cutI;
    const targetDayClimTemp = climatologyByDay[targetDayI] ?? 15;

    return [
      cutRec.Kar_Su_Esd_SWE_mm,
      cutRec.Kar_Ortusu_km2,
      tLast7,
      qLast7,
      cutI,
      targetDayClimTemp,
      horizon,
    ];
  };

  // Build training dataset from trainYears
  const trainSamples: Sample[] = [];
  const candidateCutoffs = [cutoffIdx];
  // Add nearby offsets for data augmentation if cutoff is within range
  for (const offset of [-8, -4, 4, 8]) {
    const c = cutoffIdx + offset;
    if (c >= 10 && c <= numDaysInSeason - 10 && !candidateCutoffs.includes(c)) {
      candidateCutoffs.push(c);
    }
  }

  for (const y of trainYears) {
    const yRecs = recordsByYear.get(y);
    if (!yRecs || yRecs.length < numDaysInSeason) continue;

    for (const cIdx of candidateCutoffs) {
      for (let t = cIdx + 1; t < yRecs.length; t++) {
        const feats = extractFeaturesForDay(yRecs, cIdx, t, climTempByDay);
        trainSamples.push({
          features: feats,
          target: yRecs[t].Gozlenen_Girdi_m3s,
          year: y,
        });
      }
    }
  }

  // Fit selected model on all training years
  let predictFn: (features: number[]) => number;
  if (modelType === 'ridge') {
    const ridgeModel = trainRidge(trainSamples, 1.0);
    predictFn = (f) => predictRidge(ridgeModel, f);
  } else {
    const boostedModel = trainBoosted(trainSamples, 50, 0.1);
    predictFn = (f) => predictBoosted(boostedModel, f);
  }

  // Leave-One-Year-Out (LOYO) Validation on trainYears
  const loyoResidualRatios: number[] = [];
  const loyoAbsoluteErrors: number[] = [];
  let loyoSumSqErr = 0;
  let loyoSumSqTot = 0;
  let loyoTotalObs = 0;
  let loyoObsMean = 0;

  for (const s of trainSamples) {
    if (candidateCutoffs.includes(cutoffIdx)) {
      loyoObsMean += s.target;
      loyoTotalObs++;
    }
  }
  loyoObsMean = loyoTotalObs > 0 ? loyoObsMean / loyoTotalObs : 100;

  for (const testY of trainYears) {
    const foldTrainSamples = trainSamples.filter((s) => s.year !== testY);
    const testSamples = trainSamples.filter((s) => s.year === testY && s.features[4] === cutoffIdx);

    if (testSamples.length === 0) continue;

    let foldPredict: (f: number[]) => number;
    if (modelType === 'ridge') {
      const foldModel = trainRidge(foldTrainSamples, 1.0);
      foldPredict = (f) => predictRidge(foldModel, f);
    } else {
      const foldModel = trainBoosted(foldTrainSamples, 40, 0.1);
      foldPredict = (f) => predictBoosted(foldModel, f);
    }

    for (const ts of testSamples) {
      const pred = foldPredict(ts.features);
      const actual = ts.target;
      const ae = Math.abs(actual - pred);
      loyoAbsoluteErrors.push(ae);
      loyoSumSqErr += (actual - pred) ** 2;
      loyoSumSqTot += (actual - loyoObsMean) ** 2;

      // Log-ratio residual: ln(y_true / y_pred)
      const ratio = Math.log(Math.max(0.05, actual) / Math.max(0.05, pred));
      loyoResidualRatios.push(ratio);
    }
  }

  const loyoMae =
    loyoAbsoluteErrors.length > 0
      ? Number((loyoAbsoluteErrors.reduce((a, b) => a + b, 0) / loyoAbsoluteErrors.length).toFixed(2))
      : null;
  const loyoR2 =
    loyoSumSqTot > 0 && loyoAbsoluteErrors.length > 0
      ? Number(Math.max(-0.5, Math.min(0.99, 1 - loyoSumSqErr / loyoSumSqTot)).toFixed(3))
      : null;

  // Compute empirical quantiles for probabilistic bands
  const q10 = getPercentile(loyoResidualRatios, 10);
  const q25 = getPercentile(loyoResidualRatios, 25);
  const q50 = getPercentile(loyoResidualRatios, 50);
  const q75 = getPercentile(loyoResidualRatios, 75);
  const q90 = getPercentile(loyoResidualRatios, 90);

  // Print LOYO results to console as required by delivery instructions
  console.log('================================================================');
  console.log('🌊 KEBAN-HAZAR HİDROLOJİK KARAR DESTEK PLATFORMU · AI MOTORU');
  console.log(`Seçili Alt Havza: ${selectedBasin}`);
  console.log(`Test Yılı: ${selectedYear} (Eğitime katılmadı - OOS)`);
  console.log(`Model Türü: ${modelType === 'ridge' ? 'Lineer Ridge (L2 λ=1.0)' : 'Gradient-Boosted Decision Stumps (50 Ağaç)'}`);
  console.log(`Tahmin Kesim Tarihi: ${cutoffDateStr} (İndeks: ${cutoffIdx})`);
  console.log(`LOYO Cross-Validation MAE: ${loyoMae !== null ? `${loyoMae} m³/s` : 'Yetersiz Veri'}`);
  console.log(`LOYO Cross-Validation R²: ${loyoR2 !== null ? loyoR2 : 'Yetersiz Veri'}`);
  console.log(`Empirik Kalıntı Log-Oran Kuantilleri (q10, q50, q90): [${q10.toFixed(3)}, ${q50.toFixed(3)}, ${q90.toFixed(3)}]`);
  console.log('================================================================');

  // Generate Daily Forecasts for currentYearRecords
  const dailyForecasts: DailyForecast[] = [];

  for (let i = 0; i < currentYearRecords.length; i++) {
    const rec = currentYearRecords[i];
    const isAfter = i > cutoffIdx;
    const horizon = isAfter ? i - cutoffIdx : 0;

    let p10 = rec.Gozlenen_Girdi_m3s;
    let p25 = rec.Gozlenen_Girdi_m3s;
    let p50 = rec.Gozlenen_Girdi_m3s;
    let p75 = rec.Gozlenen_Girdi_m3s;
    let p90 = rec.Gozlenen_Girdi_m3s;

    if (isAfter) {
      const feats = extractFeaturesForDay(currentYearRecords, cutoffIdx, i, climTempByDay);
      const rawPred = predictFn(feats);

      // Probabilistic multiplier based on empirical LOYO quantiles
      p50 = Math.max(0.1, rawPred * Math.exp(q50));
      p10 = Math.max(0.1, rawPred * Math.exp(q10));
      p90 = Math.max(p50, rawPred * Math.exp(q90));
      p25 = Math.max(p10, rawPred * Math.exp(q25));
      p75 = Math.min(p90, Math.max(p50, rawPred * Math.exp(q75)));

      // Smooth transition right after cutoff
      if (horizon === 1) {
        const lastObs = currentYearRecords[cutoffIdx].Gozlenen_Girdi_m3s;
        p50 = 0.5 * lastObs + 0.5 * p50;
      }

      // Enforce strict p10 <= p25 <= p50 <= p75 <= p90 ordering (Fix #4)
      p10 = Math.min(p10, p50);
      p90 = Math.max(p90, p50);
      p25 = Math.min(p50, Math.max(p10, p25));
      p75 = Math.max(p50, Math.min(p90, p75));
    }

    // Baseline pumping energy
    const baselineMWh = rec.Uluova_Pompaj_Enerji_MWh;

    dailyForecasts.push({
      date: rec.Tarih,
      dayIndex: i,
      horizon,
      observedFlow: rec.Gozlenen_Girdi_m3s,
      isAfterCutoff: isAfter,
      p10: Number(p10.toFixed(2)),
      p25: Number(p25.toFixed(2)),
      p50: Number(p50.toFixed(2)),
      p75: Number(p75.toFixed(2)),
      p90: Number(p90.toFixed(2)),
      srmFlow: Number(rec.Fiziksel_SRM_Akis_m3s.toFixed(2)),
      sweMm: Number(rec.Kar_Su_Esd_SWE_mm.toFixed(1)),
      snowCoverKm2: Number(rec.Kar_Ortusu_km2.toFixed(1)),
      tempC: Number(rec.Sicaklik_Ort_C.toFixed(1)),
      precipMm: Number(rec.Yagis_mm.toFixed(1)),
      baselineEnergyMWh: Number(baselineMWh.toFixed(1)),
      recommendedEnergyMWh: Number(baselineMWh.toFixed(1)), // default to baseline before cutoff (Fix #3)
    });
  }

  // Historical Seasonal Inflow Volumes (hm3) for all 9 years
  const historicalYearVolumes: HistoricalYearVolume[] = [];
  for (const y of years) {
    const yRecs = recordsByYear.get(y) || [];
    let totM3s = 0;
    let peakF = 0;
    let peakD = '';
    for (const r of yRecs) {
      totM3s += r.Gozlenen_Girdi_m3s;
      if (r.Gozlenen_Girdi_m3s > peakF) {
        peakF = r.Gozlenen_Girdi_m3s;
        peakD = r.Tarih;
      }
    }
    const volHm3 = Number((totM3s * 0.0864).toFixed(1));
    historicalYearVolumes.push({
      year: y,
      volumeHm3: volHm3,
      peakFlow: Number(peakF.toFixed(1)),
      peakDate: peakD,
    });
  }

  // Selected Year Volumes:
  // V_obs (until cutoff) + V_pred (after cutoff)
  let volObsCutM3s = 0;
  for (let i = 0; i <= cutoffIdx; i++) {
    volObsCutM3s += dailyForecasts[i].observedFlow || 0;
  }
  const currentObservedCutoffVolume = volObsCutM3s * 0.0864;

  let volPredP50M3s = 0;
  let volPredP10M3s = 0;
  let volPredP90M3s = 0;
  for (let i = cutoffIdx + 1; i < dailyForecasts.length; i++) {
    volPredP50M3s += dailyForecasts[i].p50;
    volPredP10M3s += dailyForecasts[i].p10;
    volPredP90M3s += dailyForecasts[i].p90;
  }

  const forecastVolumeP50 = volPredP50M3s * 0.0864;
  const totalSeasonVolumeP50 = currentObservedCutoffVolume + forecastVolumeP50;
  const totalSeasonVolumeP10 = currentObservedCutoffVolume + volPredP10M3s * 0.0864;
  const totalSeasonVolumeP90 = currentObservedCutoffVolume + volPredP90M3s * 0.0864;

  // Historical volume statistics: EXCLUDE selected year (Fix #2: reference is strictly other 8 years)
  const refHistVolValues = historicalYearVolumes
    .filter((h) => h.year !== selectedYear)
    .map((h) => h.volumeHm3)
    .sort((a, b) => a - b);
  const p25Volume = getPercentile(refHistVolValues, 25);
  const medianVolume = getPercentile(refHistVolValues, 50);

  // Empirical CDF F(V_P50) computed against other 8 reference training years (Fix #2)
  let empiricalCdf = 0;
  if (totalSeasonVolumeP50 <= refHistVolValues[0]) {
    empiricalCdf = 0.05;
  } else if (totalSeasonVolumeP50 >= refHistVolValues[refHistVolValues.length - 1]) {
    empiricalCdf = 0.95;
  } else {
    for (let k = 0; k < refHistVolValues.length - 1; k++) {
      if (totalSeasonVolumeP50 >= refHistVolValues[k] && totalSeasonVolumeP50 <= refHistVolValues[k + 1]) {
        const frac =
          (totalSeasonVolumeP50 - refHistVolValues[k]) / (refHistVolValues[k + 1] - refHistVolValues[k]);
        empiricalCdf = (k + 0.5 + frac) / refHistVolValues.length;
        break;
      }
    }
  }

  // Risk Score = 100 * (1 - F(V_P50))
  let riskScore = Math.round(100 * (1 - empiricalCdf));
  riskScore = Math.max(0, Math.min(100, riskScore));

  // Monte Carlo simulation with seeded PRNG (Fix #6)
  const rng = createSeededRandom(42 + selectedYear * 1000 + cutoffIdx);
  const mcIterations = 1000;
  let lessThanP25Count = 0;
  for (let s = 0; s < mcIterations; s++) {
    // Standard normal via Box-Muller with deterministic seeded random
    const u1 = rng();
    const u2 = rng();
    const z = Math.sqrt(-2.0 * Math.log(Math.max(1e-9, u1))) * Math.cos(2.0 * Math.PI * u2);

    let drawVolume: number;
    if (z < 0) {
      drawVolume =
        totalSeasonVolumeP50 + (z / 1.282) * (totalSeasonVolumeP50 - totalSeasonVolumeP10);
    } else {
      drawVolume =
        totalSeasonVolumeP50 + (z / 1.282) * (totalSeasonVolumeP90 - totalSeasonVolumeP50);
    }

    if (drawVolume < p25Volume) {
      lessThanP25Count++;
    }
  }
  const probLessThanP25 = Math.round((lessThanP25Count / mcIterations) * 100);

  // Risk Category and Color
  let riskCategory: 'Düşük' | 'Orta' | 'Yüksek' = 'Düşük';
  let riskColor = '#10B981'; // green
  if (riskScore >= 67) {
    riskCategory = 'Yüksek';
    riskColor = '#EF4444'; // red
  } else if (riskScore >= 34) {
    riskCategory = 'Orta';
    riskColor = '#F59E0B'; // amber
  }

  const riskAnalysis: RiskAnalysis = {
    score: riskScore,
    category: riskCategory,
    color: riskColor,
    historicalVolumes: historicalYearVolumes,
    p25Volume: Number(p25Volume.toFixed(1)),
    medianVolume: Number(medianVolume.toFixed(1)),
    currentObservedCutoffVolume: Number(currentObservedCutoffVolume.toFixed(1)),
    forecastVolumeP50: Number(forecastVolumeP50.toFixed(1)),
    totalSeasonVolumeP50: Number(totalSeasonVolumeP50.toFixed(1)),
    totalSeasonVolumeP10: Number(totalSeasonVolumeP10.toFixed(1)),
    totalSeasonVolumeP90: Number(totalSeasonVolumeP90.toFixed(1)),
    probLessThanP25,
    empiricalCdfPercentile: Math.round(empiricalCdf * 100),
  };

  // Compute recommended pumping energy for each day using Scenario Parameters
  // Fix #3: Only reduce energy AFTER cutoff (dayIndex > cutoffIdx); before cutoff recommendedEnergyMWh = baselineEnergyMWh
  const riskWeight = riskCategory === 'Yüksek' ? 1.0 : riskCategory === 'Orta' ? 0.8 : 0.6;
  const reductionFactor = 1 - (scenarioParams.avoidableOverirrigationPct / 100) * riskWeight;

  for (let i = 0; i < dailyForecasts.length; i++) {
    const df = dailyForecasts[i];
    if (i <= cutoffIdx) {
      df.recommendedEnergyMWh = df.baselineEnergyMWh;
    } else {
      df.recommendedEnergyMWh = Number(Math.max(0, df.baselineEnergyMWh * reductionFactor).toFixed(1));
    }
  }

  // Model Confidence Indicator: P90 - P10 width relative to P50
  const avgP50 = dailyForecasts.slice(cutoffIdx + 1).reduce((sum, d) => sum + d.p50, 0) / Math.max(1, dailyForecasts.length - 1 - cutoffIdx);
  const avgBandWidth = dailyForecasts.slice(cutoffIdx + 1).reduce((sum, d) => sum + (d.p90 - d.p10), 0) / Math.max(1, dailyForecasts.length - 1 - cutoffIdx);
  const relSpread = avgP50 > 0 ? avgBandWidth / avgP50 : 0.5;

  let confidence: 'Düşük' | 'Orta' | 'Yüksek' = 'Orta';
  if (relSpread < 0.4) confidence = 'Yüksek';
  else if (relSpread > 0.8) confidence = 'Düşük';

  // Rule-based + Model Decision Card Recommendations (Fix #5: derive night % from scenarioParams)
  let summaryPoints: string[] = [];
  let recommendedActionShort = '';
  const baseNightPct = scenarioParams.nightShiftableLoadPct;
  const highNightPct = Math.min(100, Math.max(baseNightPct, Math.round(baseNightPct * 1.25)));
  const midNightPct = Math.min(100, Math.max(baseNightPct, Math.round(baseNightPct * 1.1)));

  if (riskCategory === 'Yüksek') {
    recommendedActionShort = 'Kritik Tasarruf ve Gece Kaydırma';
    summaryPoints = [
      'Kar erimesi pik debisi öncesi rezervuar/havuz depolamasını önceliklendirin; su tutma kapasitesini maksimuma çıkarın.',
      'Sulama birliği su tahsis kotalarını kademeli olarak %15–20 oranında kısıtlayın, yerçekimi ile beslenen kanalları tam kapasiteye alın.',
      `Tüm pompaj operasyonunu zorunlu olarak gece tarifesine (22:00–06:00) kaydırın (%${highNightPct} hedef); gündüz pik saatlerde sulama motorlarını devreden çıkarın.`,
    ];
  } else if (riskCategory === 'Orta') {
    recommendedActionShort = 'Dinamik Talep ve Gece Öncelikli Pompaj';
    summaryPoints = [
      'Sulamayı günlük sıcaklık ve buharlaşma talebine göre dinamik programlayın; gereksiz ön-sulama takvimini askıya alın.',
      'Kar erimesi pik akış günlerinde mansaptaki yerçekimi sulama kanallarını ilk tercih olarak devreye alın.',
      `Pompaj yükünün en az %${midNightPct}’ini gece ucuz tarifeli saat dilimine (22:00–06:00) planlayarak şebeke maliyetini optimize edin.`,
    ];
  } else {
    recommendedActionShort = 'Mevcut Takvim Korunmalı, Gece Optimizasyonu';
    summaryPoints = [
      'Kar erimesi su eşdeğeri ve giriş hacmi sezon normallerinde seyretmektedir; genel tahsis planı ve takvim korunabilir.',
      `Yalnızca gece elektrik tarifesi (%${baseNightPct} kaydırma) optimizasyonunu uygulayarak birim su pompalama maliyetini düşürün.`,
      'Mayıs sonundaki olası ani erime piklerine karşı derivasyon kapaklarını kontrol altında tutun.',
    ];
  }

  // 14-day schedule table from cutoff date (Fix #5: derive window note from scenarioParams)
  const fourteenDayPlan: DecisionCardData['fourteenDayPlan'] = [];
  const planStart = cutoffIdx;
  const planEnd = Math.min(currentYearRecords.length, cutoffIdx + 14);

  for (let i = planStart; i < planEnd; i++) {
    const f = dailyForecasts[i];
    const isPeak = f.p50 > 80;
    let windowNote = `22:00–06:00 (Gece %${baseNightPct})`;
    let gravityShare = '%35 Yerçekimi';
    let irrigationStatus = 'Normal';

    if (riskCategory === 'Yüksek') {
      windowNote = `22:00–06:00 (Gece %${highNightPct})`;
      gravityShare = isPeak ? '%60 Yerçekimi (Öncelikli)' : '%45 Yerçekimi';
      irrigationStatus = 'Kısıtlı Kotada';
    } else if (riskCategory === 'Orta') {
      windowNote = `22:00–06:00 (Gece %${midNightPct})`;
      gravityShare = isPeak ? '%50 Yerçekimi' : '%35 Yerçekimi';
      irrigationStatus = isPeak ? 'Pik Debi / Depolama' : 'Dinamik Talep';
    } else {
      windowNote = `22:00–06:00 (Gece %${baseNightPct})`;
      gravityShare = '%30 Yerçekimi';
      irrigationStatus = 'Standart Plan';
    }

    fourteenDayPlan.push({
      date: f.date,
      flowP50: f.p50,
      irrigationStatus,
      windowNote,
      plannedMWh: f.recommendedEnergyMWh,
      gravityShare,
    });
  }

  const decisionCard: DecisionCardData = {
    riskCategory,
    confidence,
    summaryPoints,
    recommendedActionShort,
    fourteenDayPlan,
  };

  return {
    dailyForecasts,
    modelMetrics: {
      loyoMae,
      loyoR2,
      trainYears,
      testYear: selectedYear,
      subBasin: selectedBasin,
      modelType,
      samplesCount: trainSamples.length,
    },
    riskAnalysis,
    decisionCard,
    historicalYearVolumes,
  };
}

/**
 * Calculates counterfactual energy, CO2 and financial savings live counters
 * Fix #3: Tasarruf ve maliyet farkı yalnızca kesim tarihinden sonraki günler için (dayIndex > cutoffIdx) hesaplanır.
 */
export function calculateCounterfactualSavings(
  dailyForecasts: DailyForecast[],
  scenarioParams: ScenarioParams,
  untilDayIndex: number = 121,
  cutoffIdx?: number
): {
  totalBaselineMWh: number;
  totalRecommendedMWh: number;
  savingsMWh: number;
  savingsGWh: number;
  preventedCO2Tons: number;
  costSavingsTL: number;
  baselineCostTL: number;
  recommendedCostTL: number;
  cumulativeDays: {
    date: string;
    dayIndex: number;
    cumBaselineGWh: number;
    cumRecommendedGWh: number;
    cumSavingsGWh: number;
    cumCO2Tons: number;
    cumCostSavingsTL: number;
  }[];
} {
  let totalBaselineMWh = 0;
  let totalRecommendedMWh = 0;
  let baselineCostTL = 0;
  let recommendedCostTL = 0;

  const nightShare = scenarioParams.nightShiftableLoadPct / 100;
  const dayShare = 1 - nightShare;

  const cumulativeDays = [];
  let cumBaseMWh = 0;
  let cumRecMWh = 0;
  let cumBaseCostTL = 0;
  let cumRecCostTL = 0;

  const maxIdx = Math.min(untilDayIndex, dailyForecasts.length - 1);

  // Determine actual cutoff index from dailyForecasts if not explicitly passed
  const resolvedCutoffIdx =
    cutoffIdx !== undefined
      ? cutoffIdx
      : (() => {
          const firstAfter = dailyForecasts.findIndex((d) => d.isAfterCutoff);
          return firstAfter > 0 ? firstAfter - 1 : 0;
        })();

  for (let i = 0; i <= maxIdx; i++) {
    const d = dailyForecasts[i];
    const bMWh = d.baselineEnergyMWh;
    const isAfter = i > resolvedCutoffIdx;

    // Prior to cutoff: recommendedEnergyMWh = baselineEnergyMWh (no savings, standard daytime operation)
    const rMWh = isAfter ? d.recommendedEnergyMWh : bMWh;

    totalBaselineMWh += bMWh;
    totalRecommendedMWh += rMWh;

    cumBaseMWh += bMWh;
    cumRecMWh += rMWh;

    const dayBaseCost = bMWh * scenarioParams.dayTariffTL;
    baselineCostTL += dayBaseCost;
    cumBaseCostTL += dayBaseCost;

    if (isAfter) {
      const dayRecCost =
        rMWh * (nightShare * scenarioParams.nightTariffTL + dayShare * scenarioParams.dayTariffTL);
      recommendedCostTL += dayRecCost;
      cumRecCostTL += dayRecCost;
    } else {
      // Prior to cutoff: no night shifting, no savings
      recommendedCostTL += dayBaseCost;
      cumRecCostTL += dayBaseCost;
    }

    const cumSavingsMWh = cumBaseMWh - cumRecMWh;
    const cumCO2 = cumSavingsMWh * scenarioParams.emissionFactor;
    const cumCostDiff = cumBaseCostTL - cumRecCostTL;

    cumulativeDays.push({
      date: d.date,
      dayIndex: i,
      cumBaselineGWh: Number((cumBaseMWh / 1000).toFixed(3)),
      cumRecommendedGWh: Number((cumRecMWh / 1000).toFixed(3)),
      cumSavingsGWh: Number((cumSavingsMWh / 1000).toFixed(3)),
      cumCO2Tons: Number(cumCO2.toFixed(1)),
      cumCostSavingsTL: Number(cumCostDiff.toFixed(0)),
    });
  }

  const savingsMWh = totalBaselineMWh - totalRecommendedMWh;
  const savingsGWh = savingsMWh / 1000;
  const preventedCO2Tons = savingsMWh * scenarioParams.emissionFactor;
  const costSavingsTL = baselineCostTL - recommendedCostTL;

  return {
    totalBaselineMWh: Number(totalBaselineMWh.toFixed(1)),
    totalRecommendedMWh: Number(totalRecommendedMWh.toFixed(1)),
    savingsMWh: Number(savingsMWh.toFixed(1)),
    savingsGWh: Number(savingsGWh.toFixed(3)),
    preventedCO2Tons: Number(preventedCO2Tons.toFixed(1)),
    costSavingsTL: Number(costSavingsTL.toFixed(0)),
    baselineCostTL: Number(baselineCostTL.toFixed(0)),
    recommendedCostTL: Number(recommendedCostTL.toFixed(0)),
    cumulativeDays,
  };
}

/**
 * Calculates risk trajectory as cutoff date advances every 5 days (G3 Early warning stability)
 */
export function calculateRiskTrajectory(
  allRecords: HydrologyRecord[],
  basin: SubBasin,
  year: number,
  modelType: ModelType,
  scenarioParams: ScenarioParams
): { dateStr: string; dayIndex: number; score: number; category: string }[] {
  const basinRecords = allRecords.filter((r) => r.Alt_Havza === basin && r.Yil === year);
  if (basinRecords.length === 0) return [];

  const points: { dateStr: string; dayIndex: number; score: number; category: string }[] = [];

  // Every 5 days from day 10 to day 115
  for (let d = 10; d < basinRecords.length - 5; d += 5) {
    const cutDate = basinRecords[d].Tarih;
    try {
      const res = runHydrologyDecisionEngine(
        allRecords,
        basin,
        year,
        cutDate,
        modelType,
        scenarioParams
      );
      points.push({
        dateStr: cutDate,
        dayIndex: d,
        score: res.riskAnalysis.score,
        category: res.riskAnalysis.category,
      });
    } catch {
      // Ignore boundary issues
    }
  }

  return points;
}
