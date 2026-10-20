import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Droplets,
  Calendar,
  Layers,
  Cpu,
  Share2,
  Upload,
  Info,
  AlertTriangle,
  TrendingDown,
  Check,
  ChevronDown,
  ChevronUp,
  Activity,
  Sliders,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';

import { DEFAULT_CSV_TEXT } from './data/defaultCsv';
import { parseHydrologyCsv } from './utils/csvParser';
import {
  HydrologyRecord,
  SubBasin,
  ModelType,
  ScenarioParams,
  DailyForecast,
} from './types/hydrology';
import {
  runHydrologyDecisionEngine,
  calculateRiskTrajectory,
} from './models/aiDecisionEngine';
import { PlotlyChart } from './components/PlotlyChart';
import { CounterfactualTicker } from './components/CounterfactualTicker';
import { DecisionCard } from './components/DecisionCard';
import { RiskExplanationModal } from './components/RiskExplanationModal';
import { ModelNotesModal } from './components/ModelNotesModal';
import { CustomCsvUploadModal } from './components/CustomCsvUploadModal';

export default function App() {
  // Raw records loaded from default CSV or user custom CSV
  const [allRecords, setAllRecords] = useState<HydrologyRecord[]>(() => {
    const res = parseHydrologyCsv(DEFAULT_CSV_TEXT);
    return res.records;
  });
  const [isCustomLoaded, setIsCustomLoaded] = useState<boolean>(false);

  // User Interactive Controls (defaults: Uluova, 2021, 15 Nisan)
  const [selectedBasin, setSelectedBasin] = useState<SubBasin>('Uluova');
  const [selectedYear, setSelectedYear] = useState<number>(2021);
  const [cutoffIndex, setCutoffIndex] = useState<number>(45); // April 15 (day index 45 of 0..121)
  const [modelType, setModelType] = useState<ModelType>('ridge');
  const [showActualFlow, setShowActualFlow] = useState<boolean>(false);

  // Scenario parameters (§5)
  const [scenarioParams, setScenarioParams] = useState<ScenarioParams>({
    avoidableOverirrigationPct: 13,
    nightShiftableLoadPct: 60,
    dayTariffTL: 3200,
    nightTariffTL: 1900,
    emissionFactor: 0.45,
  });

  // UI Modals & Panels
  const [isRiskModalOpen, setIsRiskModalOpen] = useState<boolean>(false);
  const [isModelNotesOpen, setIsModelNotesOpen] = useState<boolean>(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [isScenarioPanelOpen, setIsScenarioPanelOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Toast notification timer
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 3500);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // Load state from URL hash on mount if present (§6 Share feature)
  useEffect(() => {
    if (window.location.hash && window.location.hash.length > 1) {
      try {
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        const basin = params.get('basin');
        const year = params.get('year');
        const cutIdx = params.get('cutoffIdx');
        const model = params.get('model');
        const overirr = params.get('overirr');
        const night = params.get('night');

        if (basin === 'Uluova' || basin === 'Palu') setSelectedBasin(basin);
        if (year) setSelectedYear(parseInt(year, 10));
        if (cutIdx) setCutoffIndex(parseInt(cutIdx, 10));
        if (model === 'ridge' || model === 'boosted') setModelType(model);
        if (overirr || night) {
          setScenarioParams((prev) => ({
            ...prev,
            avoidableOverirrigationPct: overirr ? parseFloat(overirr) : prev.avoidableOverirrigationPct,
            nightShiftableLoadPct: night ? parseFloat(night) : prev.nightShiftableLoadPct,
          }));
        }
      } catch (err) {
        console.warn('URL Hash restore failed:', err);
      }
    }
  }, []);

  // Filter current year records to map cutoffIndex to date string
  const currentYearRecords = useMemo(() => {
    return allRecords
      .filter((r) => r.Alt_Havza === selectedBasin && r.Yil === selectedYear)
      .sort((a, b) => a.Tarih.localeCompare(b.Tarih));
  }, [allRecords, selectedBasin, selectedYear]);

  // Total days in season (122 days)
  const numDays = currentYearRecords.length > 0 ? currentYearRecords.length : 122;
  const safeCutoffIndex = Math.min(Math.max(0, cutoffIndex), numDays - 1);
  const cutoffDateStr = currentYearRecords[safeCutoffIndex]?.Tarih || `${selectedYear}-04-15`;

  // Run AI Decision Engine (<300 ms response with pure TS matrix/tree boosting)
  const engineResult = useMemo(() => {
    if (currentYearRecords.length === 0) return null;
    return runHydrologyDecisionEngine(
      allRecords,
      selectedBasin,
      selectedYear,
      cutoffDateStr,
      modelType,
      scenarioParams
    );
  }, [allRecords, selectedBasin, selectedYear, cutoffDateStr, modelType, scenarioParams, currentYearRecords]);

  // Current conditions at cutoff date
  const cutoffRecord = currentYearRecords[safeCutoffIndex] || currentYearRecords[0];
  const maxBasinAreaKm2 = selectedBasin === 'Uluova' ? 2800 : 4200;
  const snowAreaPercent = cutoffRecord
    ? Math.min(100, Math.round((cutoffRecord.Kar_Ortusu_km2 / maxBasinAreaKm2) * 100))
    : 0;

  // G3 Risk Trajectory over 5-day intervals
  const riskTrajectory = useMemo(() => {
    return calculateRiskTrajectory(
      allRecords,
      selectedBasin,
      selectedYear,
      modelType,
      scenarioParams
    );
  }, [allRecords, selectedBasin, selectedYear, modelType, scenarioParams]);

  // Share handler: write to URL hash and copy link to clipboard
  const handleShare = useCallback(() => {
    const params = new URLSearchParams();
    params.set('basin', selectedBasin);
    params.set('year', selectedYear.toString());
    params.set('cutoffIdx', safeCutoffIndex.toString());
    params.set('model', modelType);
    params.set('overirr', scenarioParams.avoidableOverirrigationPct.toString());
    params.set('night', scenarioParams.nightShiftableLoadPct.toString());

    window.location.hash = params.toString();
    navigator.clipboard
      .writeText(window.location.href)
      .then(() => {
        setToastMessage('Bağlantı panoya kopyalandı! Mevcut filtre ve parametreler URL hash’ine kaydedildi.');
      })
      .catch(() => {
        setToastMessage('URL hash güncellendi: ' + window.location.hash);
      });
  }, [selectedBasin, selectedYear, safeCutoffIndex, modelType, scenarioParams]);

  // -------------------------------------------------------------
  // PLOTLY CHARTS CONFIGURATION
  // -------------------------------------------------------------

  // G1: Kar Erimesi vs. Olasılıksal Giriş Debisi
  const chartG1Data = useMemo(() => {
    if (!engineResult) return [];

    const forecasts = engineResult.dailyForecasts;
    const allDates = forecasts.map((d) => d.date);
    const sweValues = forecasts.map((d) => d.sweMm);
    const snowCoverValues = forecasts.map((d) => d.snowCoverKm2);
    const srmFlowValues = forecasts.map((d) => d.srmFlow);

    // Observed flow up to cutoff
    const observedUntilCutoff: (number | null)[] = forecasts.map((d, i) =>
      i <= safeCutoffIndex ? d.observedFlow || null : null
    );

    // Predicted P50, P10, P90, P25, P75 from cutoff onwards
    const predP50: (number | null)[] = forecasts.map((d, i) => (i >= safeCutoffIndex ? d.p50 : null));
    const predP10: (number | null)[] = forecasts.map((d, i) => (i >= safeCutoffIndex ? d.p10 : null));
    const predP90: (number | null)[] = forecasts.map((d, i) => (i >= safeCutoffIndex ? d.p90 : null));
    const predP25: (number | null)[] = forecasts.map((d, i) => (i >= safeCutoffIndex ? d.p25 : null));
    const predP75: (number | null)[] = forecasts.map((d, i) => (i >= safeCutoffIndex ? d.p75 : null));

    // Actual observed after cutoff (for verification)
    const actualAfterCutoff: (number | null)[] = forecasts.map((d, i) =>
      i >= safeCutoffIndex ? d.observedFlow || null : null
    );

    const traces: any[] = [
      // Sol Eksen: SWE Alan Grafiği
      {
        x: allDates,
        y: sweValues,
        name: 'Kar Su Eşd. (SWE, mm)',
        type: 'scatter',
        mode: 'lines',
        fill: 'tozeroy',
        fillcolor: 'rgba(56, 189, 248, 0.12)',
        line: { color: 'rgba(56, 189, 248, 0.45)', width: 1.5 },
        yaxis: 'y1',
        hovertemplate: '%{x}<br>SWE: %{y:.1f} mm<extra></extra>',
      },
      // Sol Eksen: Kar Örtüsü Çizgisi
      {
        x: allDates,
        y: snowCoverValues,
        name: 'Kar Örtüsü (km²)',
        type: 'scatter',
        mode: 'lines',
        line: { color: '#38BDF8', width: 2 },
        yaxis: 'y1',
        hovertemplate: '%{x}<br>Kar Örtüsü: %{y:.0f} km²<extra></extra>',
      },
      // Sağ Eksen: Fiziksel SRM Akış Referansı
      {
        x: allDates,
        y: srmFlowValues,
        name: 'Fiziksel SRM Akış Ref.',
        type: 'scatter',
        mode: 'lines',
        line: { color: '#64748B', width: 1.5, dash: 'dot' },
        yaxis: 'y2',
        hovertemplate: '%{x}<br>Fiziksel SRM: %{y:.1f} m³/s<extra></extra>',
      },
      // Sağ Eksen: P10-P90 Olasılık Bandı (Yarı saydam)
      {
        x: allDates,
        y: predP10,
        name: 'P10 Eşiği',
        type: 'scatter',
        mode: 'lines',
        line: { width: 0, color: 'transparent' },
        yaxis: 'y2',
        showlegend: false,
        hoverinfo: 'skip',
      },
      {
        x: allDates,
        y: predP90,
        name: 'P10–P90 Belirsizlik Bandı',
        type: 'scatter',
        mode: 'lines',
        fill: 'tonexty',
        fillcolor: 'rgba(245, 158, 11, 0.18)',
        line: { width: 0, color: 'transparent' },
        yaxis: 'y2',
        hovertemplate: '%{x}<br>P10–P90 Bandı<extra></extra>',
      },
      // Sağ Eksen: P25-P75 İç Bant (Daha koyu)
      {
        x: allDates,
        y: predP25,
        name: 'P25 Eşiği',
        type: 'scatter',
        mode: 'lines',
        line: { width: 0, color: 'transparent' },
        yaxis: 'y2',
        showlegend: false,
        hoverinfo: 'skip',
      },
      {
        x: allDates,
        y: predP75,
        name: 'P25–P75 İç Bant',
        type: 'scatter',
        mode: 'lines',
        fill: 'tonexty',
        fillcolor: 'rgba(245, 158, 11, 0.28)',
        line: { width: 0, color: 'transparent' },
        yaxis: 'y2',
        hovertemplate: '%{x}<br>P25–P75 İç Bandı<extra></extra>',
      },
      // Sağ Eksen: Gözlenen Debi (Kesim tarihine kadar)
      {
        x: allDates,
        y: observedUntilCutoff,
        name: 'Gözlenen Giriş (Kesime kadar)',
        type: 'scatter',
        mode: 'lines',
        line: { color: '#0EA5E9', width: 3 },
        yaxis: 'y2',
        hovertemplate: '%{x}<br>Gözlenen: %{y:.1f} m³/s<extra></extra>',
      },
      // Sağ Eksen: Tahmin P50 (Kesimden sonra)
      {
        x: allDates,
        y: predP50,
        name: 'Tahmin P50 (Medyan Debi)',
        type: 'scatter',
        mode: 'lines',
        line: { color: '#F59E0B', width: 3, dash: 'dash' },
        yaxis: 'y2',
        hovertemplate: '%{x}<br>Tahmin P50: %{y:.1f} m³/s<extra></extra>',
      },
    ];

    // Checkbox "Gerçekleşeni Göster"
    if (showActualFlow) {
      traces.push({
        x: allDates,
        y: actualAfterCutoff,
        name: 'Gerçekleşen Gözlem (Doğrulama)',
        type: 'scatter',
        mode: 'lines',
        line: { color: '#A855F7', width: 2, dash: 'dashdot' },
        yaxis: 'y2',
        opacity: 0.75,
        hovertemplate: '%{x}<br>Gerçekleşen: %{y:.1f} m³/s<extra></extra>',
      });
    }

    return traces;
  }, [engineResult, safeCutoffIndex, showActualFlow]);

  const chartG1Layout = useMemo(() => {
    return {
      autosize: true,
      margin: { t: 30, r: 60, b: 40, l: 60 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      showlegend: true,
      legend: {
        orientation: 'h',
        x: 0,
        y: 1.15,
        font: { color: '#94A3B8', size: 10 },
      },
      shapes: [
        // Dikey kesim çizgisi
        {
          type: 'line',
          x0: cutoffDateStr,
          x1: cutoffDateStr,
          y0: 0,
          y1: 1,
          yref: 'paper',
          line: { color: '#F43F5E', width: 2, dash: 'dot' },
        },
      ],
      annotations: [
        {
          x: cutoffDateStr,
          y: 0.95,
          yref: 'paper',
          text: `Tahmin Kesim: ${cutoffDateStr.substring(5)}`,
          showarrow: true,
          arrowhead: 2,
          arrowcolor: '#F43F5E',
          ax: -65,
          ay: -15,
          font: { color: '#FDA4AF', size: 10 },
          bgcolor: 'rgba(15, 23, 42, 0.85)',
          bordercolor: '#F43F5E',
          borderwidth: 1,
        },
      ],
      xaxis: {
        gridcolor: '#1E293B',
        tickfont: { color: '#64748B', size: 10 },
        showgrid: true,
      },
      yaxis: {
        title: { text: 'SWE (mm) & Kar Örtüsü (km²)', font: { color: '#38BDF8', size: 11 } },
        gridcolor: '#1E293B',
        tickfont: { color: '#38BDF8', size: 10 },
        side: 'left',
      },
      yaxis2: {
        title: { text: 'Debi Girişi (m³/s)', font: { color: '#F59E0B', size: 11 } },
        overlaying: 'y',
        side: 'right',
        tickfont: { color: '#F59E0B', size: 10 },
        showgrid: false,
      },
      hovermode: 'x unified',
    };
  }, [cutoffDateStr]);

  // G2: Pompa Enerji Yükü (Baseline vs Öneri + 7 Günlük Hareketli Ortalama)
  const chartG2Data = useMemo(() => {
    if (!engineResult) return [];

    const forecasts = engineResult.dailyForecasts;
    const dates = forecasts.map((d) => d.date);
    const baselineMWh = forecasts.map((d) => d.baselineEnergyMWh);
    const recommendedMWh = forecasts.map((d) => d.recommendedEnergyMWh);

    // 7-day moving average of recommended
    const ma7: (number | null)[] = [];
    for (let i = 0; i < forecasts.length; i++) {
      const start = Math.max(0, i - 6);
      let sum = 0;
      let cnt = 0;
      for (let k = start; k <= i; k++) {
        sum += forecasts[k].recommendedEnergyMWh;
        cnt++;
      }
      ma7.push(Number((sum / cnt).toFixed(1)));
    }

    return [
      {
        x: dates,
        y: baselineMWh,
        type: 'bar',
        name: 'Baseline Pompaj (Mevcut Takvim)',
        marker: { color: 'rgba(100, 116, 139, 0.45)' },
        hovertemplate: '%{x}<br>Baseline: %{y:.1f} MWh<extra></extra>',
      },
      {
        x: dates,
        y: recommendedMWh,
        type: 'scatter',
        mode: 'lines',
        name: 'Önerilen Planlı Yük',
        line: { color: '#06B6D4', width: 2.5 },
        hovertemplate: '%{x}<br>Öneri: %{y:.1f} MWh<extra></extra>',
      },
      {
        x: dates,
        y: ma7,
        type: 'scatter',
        mode: 'lines',
        name: '7 Günlük Hareketli Ort.',
        line: { color: '#10B981', width: 2, dash: 'dash' },
        hovertemplate: '%{x}<br>7G Ort: %{y:.1f} MWh<extra></extra>',
      },
    ];
  }, [engineResult]);

  const chartG2Layout = useMemo(() => {
    return {
      autosize: true,
      margin: { t: 25, r: 25, b: 35, l: 45 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      showlegend: true,
      legend: {
        orientation: 'h',
        x: 0,
        y: 1.15,
        font: { color: '#94A3B8', size: 10 },
      },
      xaxis: {
        gridcolor: '#1E293B',
        tickfont: { color: '#64748B', size: 10 },
        showgrid: true,
      },
      yaxis: {
        title: { text: 'Enerji (MWh/gün)', font: { color: '#94A3B8', size: 10 } },
        gridcolor: '#1E293B',
        tickfont: { color: '#64748B', size: 10 },
      },
      annotations: [
        {
          xref: 'paper',
          yref: 'paper',
          x: 0.98,
          y: 0.95,
          text: `Gece Tarifesi Penceresi: 22:00–06:00 (%${scenarioParams.nightShiftableLoadPct} Kaydırma)`,
          showarrow: false,
          font: { color: '#38BDF8', size: 9 },
          bgcolor: 'rgba(15, 23, 42, 0.8)',
          bordercolor: '#0284C7',
          borderwidth: 1,
        },
      ],
      hovermode: 'x unified',
      bargap: 0.2,
    };
  }, [scenarioParams.nightShiftableLoadPct]);

  // G3: Risk Zaman Çizelgesi (Erken Uyarı Kararlılığı)
  const chartG3Data = useMemo(() => {
    const dates = riskTrajectory.map((p) => p.dateStr);
    const scores = riskTrajectory.map((p) => p.score);

    return [
      {
        x: dates,
        y: scores,
        type: 'scatter',
        mode: 'lines+markers',
        name: 'Risk Skoru (0-100)',
        line: { color: '#F59E0B', width: 2.5 },
        marker: { size: 6, color: '#F59E0B' },
        hovertemplate: 'Kesim: %{x}<br>Risk Skoru: %{y}<extra></extra>',
      },
    ];
  }, [riskTrajectory]);

  const chartG3Layout = useMemo(() => {
    return {
      autosize: true,
      margin: { t: 25, r: 25, b: 35, l: 40 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      showlegend: false,
      shapes: [
        // Yeşil Düşük Risk Bölgesi (0-33)
        {
          type: 'rect',
          xref: 'paper',
          yref: 'y',
          x0: 0,
          x1: 1,
          y0: 0,
          y1: 33,
          fillcolor: 'rgba(16, 185, 129, 0.08)',
          line: { width: 0 },
        },
        // Sarı Orta Risk (34-66)
        {
          type: 'rect',
          xref: 'paper',
          yref: 'y',
          x0: 0,
          x1: 1,
          y0: 34,
          y1: 66,
          fillcolor: 'rgba(245, 158, 11, 0.08)',
          line: { width: 0 },
        },
        // Kırmızı Yüksek Risk (67-100)
        {
          type: 'rect',
          xref: 'paper',
          yref: 'y',
          x0: 0,
          x1: 1,
          y0: 67,
          y1: 100,
          fillcolor: 'rgba(239, 68, 68, 0.08)',
          line: { width: 0 },
        },
      ],
      xaxis: {
        gridcolor: '#1E293B',
        tickfont: { color: '#64748B', size: 9 },
      },
      yaxis: {
        range: [0, 100],
        title: { text: 'Risk (0-100)', font: { color: '#94A3B8', size: 10 } },
        gridcolor: '#1E293B',
        tickfont: { color: '#64748B', size: 9 },
      },
      hovermode: 'closest',
    };
  }, []);

  // G4: Yıllar Arası Karşılaştırma (9 Yılın Sezon Toplam Girişi hm³)
  const chartG4Data = useMemo(() => {
    if (!engineResult) return [];

    const hist = engineResult.historicalYearVolumes;
    const years = hist.map((h) => h.year.toString());
    const volumes = hist.map((h) => h.volumeHm3);
    const colors = hist.map((h) => (h.year === selectedYear ? '#06B6D4' : '#334155'));

    return [
      {
        x: years,
        y: volumes,
        type: 'bar',
        marker: { color: colors },
        text: volumes.map((v) => `${v} hm³`),
        textposition: 'auto',
        textfont: { size: 9, color: '#E2E8F0' },
        hovertemplate: '%{x} Sezonu: %{y:.1f} hm³<extra></extra>',
      },
    ];
  }, [engineResult, selectedYear]);

  const chartG4Layout = useMemo(() => {
    const p25 = engineResult?.riskAnalysis.p25Volume || 200;
    const med = engineResult?.riskAnalysis.medianVolume || 350;

    return {
      autosize: true,
      margin: { t: 25, r: 25, b: 35, l: 45 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      showlegend: false,
      xaxis: {
        gridcolor: '#1E293B',
        tickfont: { color: '#64748B', size: 10 },
      },
      yaxis: {
        title: { text: 'Sezon Giriş (hm³)', font: { color: '#94A3B8', size: 10 } },
        gridcolor: '#1E293B',
        tickfont: { color: '#64748B', size: 10 },
      },
      shapes: [
        // P25 Kurak Yıl Referansı
        {
          type: 'line',
          xref: 'paper',
          yref: 'y',
          x0: 0,
          x1: 1,
          y0: p25,
          y1: p25,
          line: { color: '#F43F5E', width: 1.5, dash: 'dot' },
        },
        // Medyan Referansı
        {
          type: 'line',
          xref: 'paper',
          yref: 'y',
          x0: 0,
          x1: 1,
          y0: med,
          y1: med,
          line: { color: '#10B981', width: 1.5, dash: 'dash' },
        },
      ],
      annotations: [
        {
          xref: 'paper',
          y: p25,
          x: 0.05,
          text: `Kurak Eşik P25: ${p25} hm³`,
          showarrow: false,
          font: { color: '#F43F5E', size: 9 },
          bgcolor: 'rgba(15, 23, 42, 0.8)',
        },
        {
          xref: 'paper',
          y: med,
          x: 0.95,
          text: `Medyan: ${med} hm³`,
          showarrow: false,
          font: { color: '#10B981', size: 9 },
          bgcolor: 'rgba(15, 23, 42, 0.8)',
        },
      ],
      bargap: 0.25,
    };
  }, [engineResult]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-cyan-900 border border-cyan-500/80 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 text-xs animate-in slide-in-from-bottom duration-200">
          <Check className="w-4 h-4 text-cyan-300 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* TOP NAVBAR & PERSISTENT DEMO DISCLAIMER */}
      <header className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 px-4 lg:px-6 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl text-slate-950 shadow-md shadow-cyan-500/20">
              <Droplets className="w-5 h-5 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-bold text-white tracking-tight">
                  Keban–Hazar Havzası Hidrolojik Karar Destek Platformu
                </h1>
                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-700/50">
                  Demo
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Mart–Haziran Kar Erimesi · Erken Uyarı &amp; Giriş Debisi Tahmini · Sulama Pompaj Optimizasyonu
              </p>
            </div>
          </div>

          {/* Persistent Synthetic Warning Badge (MANDATORY §1) */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-950/70 border border-rose-800 text-rose-300 text-[11px] font-medium shadow-xs">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-rose-400" />
            <span>Sentetik demo verisi – operasyonel karar için kullanılamaz</span>
          </div>

          {/* Action Header Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsModelNotesOpen(true)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700 text-xs flex items-center gap-1.5 transition"
            >
              <Info className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Model Notu &amp; Sınırlar</span>
            </button>

            <button
              onClick={() => setIsUploadModalOpen(true)}
              className={`px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition border ${
                isCustomLoaded
                  ? 'bg-cyan-950 text-cyan-300 border-cyan-700'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Kendi CSV'ni Yükle</span>
            </button>

            <button
              onClick={handleShare}
              className="px-2.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 shadow-md shadow-cyan-500/20 transition"
              title="Mevcut havza, yıl ve parametreleri URL hash'ine kaydet ve linki kopyala"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Paylaş</span>
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER: SIDEBAR + CONTENT */}
      <div className="max-w-7xl mx-auto w-full flex-1 px-4 lg:px-6 py-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* ========================================================================= */}
        {/* LEFT SIDEBAR CONTROLS (col-span-12 lg:col-span-4 xl:col-span-3) */}
        {/* ========================================================================= */}
        <aside className="lg:col-span-4 xl:col-span-3 space-y-4">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-cyan-400" />
                Havza &amp; Tahmin Kontrolleri
              </span>
              <span className="text-[10px] text-slate-500 font-mono">v2.4</span>
            </div>

            {/* 1. Alt Havza Segmented Button */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
                <span>Alt Havza:</span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {selectedBasin === 'Uluova' ? '2,800 km²' : '4,200 km²'}
                </span>
              </label>
              <div className="grid grid-cols-2 p-1 bg-slate-950 rounded-xl border border-slate-800">
                {(['Uluova', 'Palu'] as const).map((basin) => (
                  <button
                    key={basin}
                    onClick={() => setSelectedBasin(basin)}
                    className={`py-1.5 text-xs font-semibold rounded-lg transition ${
                      selectedBasin === basin
                        ? 'bg-cyan-500 text-slate-950 shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {basin}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Sezon (Yıl) Slider: 2018–2026 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-300">Sezon (Yıl):</span>
                <span className="font-mono font-bold text-cyan-300 text-sm bg-slate-950 px-2 py-0.5 rounded-md border border-slate-800">
                  {selectedYear} {selectedYear === 2021 && <span className="text-rose-400 text-[10px] ml-1">(Kurak)</span>}
                </span>
              </div>
              <input
                type="range"
                min={2018}
                max={2026}
                step={1}
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono px-0.5">
                <span>2018</span>
                <span>2021 (Demo)</span>
                <span>2026</span>
              </div>
            </div>

            {/* 3. Tahmin Kesim Tarihi Slider: 1 Mart – 30 Haziran */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-300 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                  Tahmin Kesim Tarihi:
                </span>
                <span className="font-mono font-bold text-amber-300 text-xs bg-slate-950 px-2 py-0.5 rounded-md border border-slate-800">
                  {cutoffDateStr}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={numDays - 1}
                step={1}
                value={safeCutoffIndex}
                onChange={(e) => setCutoffIndex(parseInt(e.target.value, 10))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>01 Mart</span>
                <span className="text-amber-400/80 font-medium">15 Nis (Varsayılan)</span>
                <span>30 Haz</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-tight pt-0.5">
                Model yalnızca bu tarihe kadar olan hidrolojiyi görür; sonrası saf tahmindir.
              </p>
            </div>

            {/* 4. Model Seçimi: Lineer | Boosted */}
            <div className="space-y-1.5 border-t border-slate-800/80 pt-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-300 flex items-center gap-1">
                  <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                  AI Karar Motoru:
                </span>
              </div>
              <div className="grid grid-cols-2 p-1 bg-slate-950 rounded-xl border border-slate-800 text-[11px]">
                <button
                  onClick={() => setModelType('ridge')}
                  className={`py-1.5 rounded-lg font-medium transition ${
                    modelType === 'ridge'
                      ? 'bg-slate-800 text-cyan-300 shadow-sm font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Lineer (Ridge L2)
                </button>
                <button
                  onClick={() => setModelType('boosted')}
                  className={`py-1.5 rounded-lg font-medium transition ${
                    modelType === 'boosted'
                      ? 'bg-slate-800 text-cyan-300 shadow-sm font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Boosted (Stumps)
                </button>
              </div>

              {/* LOYO Accuracy Metrics Badge (§4d) */}
              {engineResult && (
                <div className="p-2.5 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1 font-mono text-[11px]">
                  <div className="text-[10px] text-slate-400 uppercase font-sans font-semibold">
                    Leave-One-Year-Out (LOYO) Metrikleri:
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Çapraz Doğrulama MAE:</span>
                    <span className="text-cyan-300 font-bold">
                      {engineResult.modelMetrics.loyoMae !== null
                        ? `${engineResult.modelMetrics.loyoMae} m³/s`
                        : 'Yetersiz Veri'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Model Doğruluğu R²:</span>
                    <span className="text-emerald-300 font-bold">
                      {engineResult.modelMetrics.loyoR2 !== null
                        ? engineResult.modelMetrics.loyoR2
                        : 'Yetersiz Veri'}
                    </span>
                  </div>
                  <div className="text-[9px] text-slate-500 font-sans italic pt-0.5">
                    * {selectedYear} yılı eğitime katılmamıştır.
                  </div>
                </div>
              )}
            </div>

            {/* Checkbox "Gerçekleşeni Göster" */}
            <div className="pt-1">
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer p-2 rounded-lg bg-slate-950/50 hover:bg-slate-950 transition border border-slate-800">
                <input
                  type="checkbox"
                  checked={showActualFlow}
                  onChange={(e) => setShowActualFlow(e.target.checked)}
                  className="rounded-sm bg-slate-800 border-slate-700 text-cyan-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                />
                <span className="select-none">Gerçekleşeni Göster (Model Doğrulama)</span>
              </label>
            </div>

            {/* 5. Katlanabilir Panel: Senaryo Parametreleri (Counterfactual) */}
            <div className="border border-slate-800 rounded-xl overflow-hidden">
              <button
                onClick={() => setIsScenarioPanelOpen(!isScenarioPanelOpen)}
                className="w-full flex items-center justify-between p-3 bg-slate-950 text-xs font-semibold text-slate-300 hover:text-white transition"
              >
                <div className="flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Senaryo Parametreleri</span>
                </div>
                {isScenarioPanelOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {isScenarioPanelOpen && (
                <div className="p-3 bg-slate-950/80 space-y-3 text-xs border-t border-slate-800">
                  {/* Önlenebilir Aşırı Sulama Payı */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400">Aşırı Sulama Azaltımı:</span>
                      <span className="font-mono text-cyan-300 font-bold">
                        %{scenarioParams.avoidableOverirrigationPct}{' '}
                        <span className="text-[9px] text-slate-500 font-normal">(varsayım)</span>
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={25}
                      step={1}
                      value={scenarioParams.avoidableOverirrigationPct}
                      onChange={(e) =>
                        setScenarioParams((prev) => ({
                          ...prev,
                          avoidableOverirrigationPct: parseInt(e.target.value, 10),
                        }))
                      }
                      className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                    />
                  </div>

                  {/* Gece Tarifesi Kaydırılabilir Pay */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400">Gece Yük Kaydırma (22–06):</span>
                      <span className="font-mono text-cyan-300 font-bold">
                        %{scenarioParams.nightShiftableLoadPct}{' '}
                        <span className="text-[9px] text-slate-500 font-normal">(varsayım)</span>
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={scenarioParams.nightShiftableLoadPct}
                      onChange={(e) =>
                        setScenarioParams((prev) => ({
                          ...prev,
                          nightShiftableLoadPct: parseInt(e.target.value, 10),
                        }))
                      }
                      className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                    />
                  </div>

                  {/* Tarifeler */}
                  <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                    <div>
                      <label className="text-slate-400 block mb-0.5">Gündüz (TL/MWh):</label>
                      <input
                        type="number"
                        value={scenarioParams.dayTariffTL}
                        onChange={(e) =>
                          setScenarioParams((prev) => ({
                            ...prev,
                            dayTariffTL: parseFloat(e.target.value) || 0,
                          }))
                        }
                        className="w-full bg-slate-900 border border-slate-800 rounded-md px-2 py-1 text-slate-200 font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-0.5">Gece (TL/MWh):</label>
                      <input
                        type="number"
                        value={scenarioParams.nightTariffTL}
                        onChange={(e) =>
                          setScenarioParams((prev) => ({
                            ...prev,
                            nightTariffTL: parseFloat(e.target.value) || 0,
                          }))
                        }
                        className="w-full bg-slate-900 border border-slate-800 rounded-md px-2 py-1 text-slate-200 font-mono"
                      />
                    </div>
                  </div>

                  {/* Emisyon Faktörü */}
                  <div className="text-[11px] pt-1">
                    <label className="text-slate-400 block mb-0.5">
                      Şebeke Emisyon Faktörü (tCO₂/MWh):
                    </label>
                    <input
                      type="number"
                      step={0.01}
                      value={scenarioParams.emissionFactor}
                      onChange={(e) =>
                        setScenarioParams((prev) => ({
                          ...prev,
                          emissionFactor: parseFloat(e.target.value) || 0,
                        }))
                      }
                      className="w-full bg-slate-900 border border-slate-800 rounded-md px-2 py-1 text-slate-200 font-mono"
                    />
                    <span className="text-[9px] text-slate-500 italic block mt-0.5">
                      * Kaynak doğrulaması gereklidir (varsayım)
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* ========================================================================= */}
        {/* MAIN DISPLAY CONTENT (col-span-12 lg:col-span-8 xl:col-span-9) */}
        {/* ========================================================================= */}
        <main className="lg:col-span-8 xl:col-span-9 space-y-5">
          {/* 1. ÜST KPI ŞERİDİ (§2) */}
          {engineResult && (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
              {/* KPI 1: Mevcut SWE */}
              <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl relative overflow-hidden">
                <span className="text-[11px] font-medium text-slate-400">Mevcut SWE (Kar Su Eşd.)</span>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-2xl font-bold font-mono text-cyan-300">
                    {cutoffRecord?.Kar_Su_Esd_SWE_mm.toFixed(1)}
                  </span>
                  <span className="text-xs text-slate-400">mm</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                  {cutoffDateStr} tarihi itibarıyla
                </div>
              </div>

              {/* KPI 2: Kar Örtüsü */}
              <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl relative overflow-hidden">
                <span className="text-[11px] font-medium text-slate-400">Kar Örtüsü Alanı</span>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-2xl font-bold font-mono text-white">
                    {cutoffRecord?.Kar_Ortusu_km2.toFixed(0)}
                  </span>
                  <span className="text-xs text-cyan-400 font-semibold">(%{snowAreaPercent})</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Havza Alanı: {maxBasinAreaKm2.toLocaleString('tr-TR')} km²
                </div>
              </div>

              {/* KPI 3: Tahmini Sezon Toplam Girişi */}
              <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl relative overflow-hidden">
                <span className="text-[11px] font-medium text-slate-400">Sezon Toplam Girişi (P50)</span>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-2xl font-bold font-mono text-amber-300">
                    {engineResult.riskAnalysis.totalSeasonVolumeP50}
                  </span>
                  <span className="text-xs text-slate-400">hm³</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                  P10: {engineResult.riskAnalysis.totalSeasonVolumeP10} · P90: {engineResult.riskAnalysis.totalSeasonVolumeP90}
                </div>
              </div>

              {/* KPI 4: Su Yetersizliği Risk Skoru */}
              <div
                className={`p-3.5 rounded-2xl border transition relative overflow-hidden ${
                  engineResult.riskAnalysis.category === 'Yüksek'
                    ? 'bg-rose-950/40 border-rose-800/80'
                    : engineResult.riskAnalysis.category === 'Orta'
                    ? 'bg-amber-950/40 border-amber-800/80'
                    : 'bg-emerald-950/40 border-emerald-800/80'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-slate-300">Su Yetersizliği Riski</span>
                  <button
                    onClick={() => setIsRiskModalOpen(true)}
                    className="text-[10px] font-semibold text-cyan-400 hover:text-cyan-300 underline flex items-center gap-0.5"
                  >
                    Neden bu skor?
                  </button>
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span
                    className="text-2xl font-bold font-mono tracking-tight"
                    style={{ color: engineResult.riskAnalysis.color }}
                  >
                    {engineResult.riskAnalysis.score}
                  </span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-950/70 text-white">
                    {engineResult.riskAnalysis.category}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  P(V &lt; Tarihsel P25): %{engineResult.riskAnalysis.probLessThanP25}
                </div>
              </div>

              {/* KPI 5: Önerilen Aksiyon */}
              <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl col-span-2 sm:col-span-1 xl:col-span-1">
                <span className="text-[11px] font-medium text-slate-400">Önerilen Aksiyon</span>
                <div className="mt-1 font-semibold text-xs text-cyan-300 leading-snug">
                  {engineResult.decisionCard.recommendedActionShort}
                </div>
                <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                  <Activity className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span>Gece %{scenarioParams.nightShiftableLoadPct} Pompaj</span>
                </div>
              </div>
            </div>
          )}

          {/* 2. KARAR KARTI "Dinamik Sulama & Gece Tarifesi Pompaj Önerisi" (§4g) */}
          {engineResult && (
            <DecisionCard decision={engineResult.decisionCard} cutoffDateStr={cutoffDateStr} />
          )}

          {/* 3. G1: KAR ERİMESİ VS. OLASILIKSAL GİRİŞ DEBİSİ GRAFİĞİ (§3 G1) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-semibold text-white text-base">
                  G1 – Kar Erimesi vs. Olasılıksal Giriş Debisi
                </h3>
                <p className="text-xs text-slate-400">
                  Sol eksen: SWE &amp; Kar Örtüsü | Sağ eksen: Gözlenen akış, SRM referansı ve P10–P90 tahmin bandı
                </p>
              </div>

              <div className="flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1 text-slate-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block" />
                  <span>Kar Örtüsü</span>
                </div>
                <div className="flex items-center gap-1 text-slate-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
                  <span>Tahmin P50</span>
                </div>
                <div className="flex items-center gap-1 text-slate-400">
                  <span className="w-2.5 h-2.5 rounded-xs bg-amber-500/30 border border-amber-500 inline-block" />
                  <span>P10–P90 Bandı</span>
                </div>
              </div>
            </div>

            <div className="h-84 sm:h-96 w-full">
              <PlotlyChart data={chartG1Data} layout={chartG1Layout} />
            </div>
          </div>

          {/* 4. G2: POMPA ENERJİ YÜKÜ GRAFİĞİ (§3 G2) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-semibold text-white text-base">
                  G2 – Sulama Pompaj Enerji Yükü &amp; 7 Günlük Hareketli Ortalama
                </h3>
                <p className="text-xs text-slate-400">
                  Baseline (mevcut takvim) çubukları, önerilen planlı yük ve gece tarifesi optimizasyonu
                </p>
              </div>
            </div>

            <div className="h-64 sm:h-72 w-full">
              <PlotlyChart data={chartG2Data} layout={chartG2Layout} />
            </div>
          </div>

          {/* 5. G3 & G4 İKİLİ GRAFİK PANELİ (§3 G3 & G4) */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {/* G3: Risk Zaman Çizelgesi */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-2">
              <div className="border-b border-slate-800 pb-2">
                <h4 className="font-semibold text-white text-sm">
                  G3 – Erken Uyarı Risk Kararlılığı Çizelgesi
                </h4>
                <p className="text-[11px] text-slate-400">
                  Kesim tarihi 5 günde bir ilerletildiğinde risk skorunun evrimi
                </p>
              </div>
              <div className="h-56 w-full">
                <PlotlyChart data={chartG3Data} layout={chartG3Layout} />
              </div>
            </div>

            {/* G4: Yıllar Arası Karşılaştırma */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-2">
              <div className="border-b border-slate-800 pb-2">
                <h4 className="font-semibold text-white text-sm">
                  G4 – 9 Yıllık Tarihsel Sezon Giriş Karşılaştırması ({selectedBasin})
                </h4>
                <p className="text-[11px] text-slate-400">
                  Mart–Haziran toplam hacimleri (hm³), {selectedYear} seçili yıl vurgulu
                </p>
              </div>
              <div className="h-56 w-full">
                <PlotlyChart data={chartG4Data} layout={chartG4Layout} />
              </div>
            </div>
          </div>

          {/* 6. COUNTERFACTUAL BASELINE ETKİ HESABI & CANLI SAYAÇ (§5 G5) */}
          {engineResult && (
            <CounterfactualTicker
              dailyForecasts={engineResult.dailyForecasts}
              scenarioParams={scenarioParams}
              cutoffDateStr={cutoffDateStr}
            />
          )}
        </main>
      </div>

      {/* FOOTER */}
      <footer className="mt-8 border-t border-slate-800/80 bg-slate-950 py-4 px-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div>
            Keban–Hazar Havzası Hidrolojik Karar Destek Platformu · DSİ 9. Bölge &amp; Sulama Birlikleri Demo
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <span>Model: SRM + Ridge / Boosted</span>
            <span>•</span>
            <span>Sentetik Veri</span>
            <span>•</span>
            <button
              onClick={() => setIsModelNotesOpen(true)}
              className="text-cyan-400 hover:underline"
            >
              Model Notları
            </button>
          </div>
        </div>
      </footer>

      {/* MODALS */}
      {engineResult && (
        <RiskExplanationModal
          isOpen={isRiskModalOpen}
          onClose={() => setIsRiskModalOpen(false)}
          risk={engineResult.riskAnalysis}
          year={selectedYear}
          subBasin={selectedBasin}
        />
      )}

      <ModelNotesModal
        isOpen={isModelNotesOpen}
        onClose={() => setIsModelNotesOpen(false)}
      />

      <CustomCsvUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onSuccessUpload={(records) => {
          setAllRecords(records);
          setIsCustomLoaded(true);
          setIsUploadModalOpen(false);
          setToastMessage('Özel CSV yüklendi! Modeller yeni veriyle otomatik olarak güncellendi.');
        }}
        onResetDefault={() => {
          const res = parseHydrologyCsv(DEFAULT_CSV_TEXT);
          setAllRecords(res.records);
          setIsCustomLoaded(false);
          setToastMessage('Varsayılan Keban-Hazar sentetik verisine dönüldü.');
        }}
        isCustomLoaded={isCustomLoaded}
      />
    </div>
  );
}
