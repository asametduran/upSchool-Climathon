import React, { useEffect, useState, useMemo } from 'react';
import { Play, Pause, RotateCcw, Zap, Leaf, Coins, AlertCircle } from 'lucide-react';
import { DailyForecast, ScenarioParams } from '../types/hydrology';
import { calculateCounterfactualSavings } from '../models/aiDecisionEngine';
import { PlotlyChart } from './PlotlyChart';

interface CounterfactualTickerProps {
  dailyForecasts: DailyForecast[];
  scenarioParams: ScenarioParams;
  cutoffDateStr: string;
}

export const CounterfactualTicker: React.FC<CounterfactualTickerProps> = ({
  dailyForecasts,
  scenarioParams,
  cutoffDateStr,
}) => {
  const [currentDayIndex, setCurrentDayIndex] = useState<number>(dailyForecasts.length - 1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 5 | 20>(5);

  const totalDays = dailyForecasts.length;

  // Reset or adjust index if dataset changes
  useEffect(() => {
    setCurrentDayIndex(dailyForecasts.length - 1);
    setIsPlaying(false);
  }, [dailyForecasts]);

  // Animation interval
  useEffect(() => {
    if (!isPlaying) return;

    const intervalMs = playbackSpeed === 20 ? 30 : playbackSpeed === 5 ? 100 : 350;

    const timer = setInterval(() => {
      setCurrentDayIndex((prev) => {
        if (prev >= totalDays - 1) {
          setIsPlaying(false);
          return totalDays - 1;
        }
        return prev + 1;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, playbackSpeed, totalDays]);

  // Compute live cumulative savings up to currentDayIndex
  const savings = useMemo(() => {
    return calculateCounterfactualSavings(dailyForecasts, scenarioParams, currentDayIndex);
  }, [dailyForecasts, scenarioParams, currentDayIndex]);

  const currentDateStr = dailyForecasts[currentDayIndex]?.date || '2021-06-30';

  // Format Turkish Lira nicely
  const formatTL = (val: number) => {
    return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(val);
  };

  // Plotly G5: Baseline vs Recommended Cumulative Lines
  const chartData = useMemo(() => {
    const dates = savings.cumulativeDays.map((d) => d.date);
    const baselineGWh = savings.cumulativeDays.map((d) => d.cumBaselineGWh);
    const recGWh = savings.cumulativeDays.map((d) => d.cumRecommendedGWh);
    const savingsGWh = savings.cumulativeDays.map((d) => d.cumSavingsGWh);

    return [
      {
        x: dates,
        y: baselineGWh,
        type: 'scatter',
        mode: 'lines',
        name: 'Baseline (Mevcut Takvim)',
        line: { color: '#64748B', width: 2, dash: 'dot' },
        hovertemplate: '%{x}<br>Baseline: %{y:.2f} GWh<extra></extra>',
      },
      {
        x: dates,
        y: recGWh,
        type: 'scatter',
        mode: 'lines',
        name: 'Öneri (Dinamik + Gece)',
        line: { color: '#06B6D4', width: 2.5 },
        fill: 'tonexty',
        fillcolor: 'rgba(6, 182, 212, 0.1)',
        hovertemplate: '%{x}<br>Öneri: %{y:.2f} GWh<extra></extra>',
      },
      {
        x: dates,
        y: savingsGWh,
        type: 'scatter',
        mode: 'lines',
        name: 'Net Tasarruf (GWh)',
        line: { color: '#10B981', width: 2 },
        yaxis: 'y2',
        hovertemplate: '%{x}<br>Tasarruf: %{y:.2f} GWh<extra></extra>',
      },
    ];
  }, [savings.cumulativeDays]);

  const chartLayout = useMemo(() => {
    return {
      autosize: true,
      margin: { t: 25, r: 45, b: 35, l: 45 },
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
        title: { text: 'Kümülatif Tüketim (GWh)', font: { color: '#94A3B8', size: 10 } },
        gridcolor: '#1E293B',
        tickfont: { color: '#64748B', size: 10 },
      },
      yaxis2: {
        title: { text: 'Tasarruf (GWh)', font: { color: '#10B981', size: 10 } },
        overlaying: 'y',
        side: 'right',
        tickfont: { color: '#10B981', size: 10 },
        showgrid: false,
      },
      hovermode: 'x unified',
    };
  }, []);

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
      {/* Header & Simulation Player */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-white text-base">
              Canlı Senaryo Tasarruf Sayacı &amp; Kümülatif Etki (G5)
            </h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-cyan-950 text-cyan-300 border border-cyan-800/40">
              Counterfactual Simülasyon
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Mevcut takvime dayalı sulama pompajı (Baseline) ile dinamik model önerisinin karşılaştırması
          </p>
        </div>

        {/* Player Controls */}
        <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-800 p-1.5 rounded-xl">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`p-2 rounded-lg font-medium text-xs flex items-center gap-1.5 transition ${
              isPlaying
                ? 'bg-amber-500 hover:bg-amber-600 text-slate-950'
                : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
            }`}
            title={isPlaying ? 'Durdur' : 'Oynat'}
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
            <span>{isPlaying ? 'Duraklat' : 'Oynat'}</span>
          </button>

          <button
            onClick={() => {
              setIsPlaying(false);
              setCurrentDayIndex(0);
            }}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
            title="Başa Dön (1 Mart)"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Speed Buttons */}
          <div className="flex items-center border-l border-slate-800 pl-1.5 text-[11px] text-slate-400">
            {([1, 5, 20] as const).map((spd) => (
              <button
                key={spd}
                onClick={() => setPlaybackSpeed(spd)}
                className={`px-2 py-1 rounded-md transition ${
                  playbackSpeed === spd
                    ? 'bg-slate-800 text-cyan-400 font-bold'
                    : 'hover:text-slate-200'
                }`}
              >
                {spd}×
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Progress Slider & Date */}
      <div className="space-y-1.5 bg-slate-950/50 p-3 rounded-xl border border-slate-800/60">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">Simülasyon Günü:</span>
          <span className="font-mono font-bold text-cyan-300">
            {currentDateStr} (Gün {currentDayIndex + 1} / {totalDays})
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={totalDays - 1}
          value={currentDayIndex}
          onChange={(e) => {
            setIsPlaying(false);
            setCurrentDayIndex(parseInt(e.target.value, 10));
          }}
          className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
        />
        <div className="flex justify-between text-[10px] text-slate-500 font-mono">
          <span>01 Mart</span>
          <span>
            {(() => {
              const parts = cutoffDateStr?.split('-');
              if (parts && parts.length === 3) {
                const monthNum = parseInt(parts[1], 10);
                const dayNum = parseInt(parts[2], 10);
                const months = ['', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
                return `${dayNum} ${months[monthNum] || parts[1]} (Kesim)`;
              }
              return `${cutoffDateStr} (Kesim)`;
            })()}
          </span>
          <span>30 Haziran</span>
        </div>
      </div>

      {/* 3 Animated Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Elektrik Tasarrufu */}
        <div className="p-4 rounded-xl bg-slate-950/80 border border-cyan-900/40 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Elektrik Tasarrufu</span>
            <div className="p-1.5 rounded-lg bg-cyan-950/80 text-cyan-400 border border-cyan-800/40">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-white tracking-tight">
              {savings.savingsGWh.toFixed(2)}
            </span>
            <span className="text-xs font-semibold text-cyan-400">GWh</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {savings.savingsMWh.toLocaleString('tr-TR')} MWh ({savings.totalBaselineMWh > 0 ? ((savings.savingsMWh / savings.totalBaselineMWh) * 100).toFixed(1) : 0}% tasarruf)
          </div>
          <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full blur-xl pointer-events-none" />
        </div>

        {/* Önlenen Karbon */}
        <div className="p-4 rounded-xl bg-slate-950/80 border border-emerald-900/40 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Önlenen CO₂ Salımı</span>
            <div className="p-1.5 rounded-lg bg-emerald-950/80 text-emerald-400 border border-emerald-800/40">
              <Leaf className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-white tracking-tight">
              {savings.preventedCO2Tons.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
            </span>
            <span className="text-xs font-semibold text-emerald-400">Ton CO₂</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {scenarioParams.emissionFactorTCO2PerMWh ?? scenarioParams.emissionFactor} tCO₂/MWh şebeke emisyon faktörüyle
          </div>
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl pointer-events-none" />
        </div>

        {/* Maliyet Kazancı */}
        <div className="p-4 rounded-xl bg-slate-950/80 border border-amber-900/40 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Net Maliyet Kazancı</span>
            <div className="p-1.5 rounded-lg bg-amber-950/80 text-amber-400 border border-amber-800/40">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono text-amber-300 tracking-tight">
              ₺{formatTL(savings.costSavingsTL)}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Gece tarifesi farkı + aşırı sulama engeli
          </div>
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-xl pointer-events-none" />
        </div>
      </div>

      {/* G5 Cumulative Chart */}
      <div className="h-64 w-full bg-slate-950/60 rounded-xl border border-slate-800/80 p-2">
        <PlotlyChart data={chartData} layout={chartLayout} />
      </div>

      {/* Fixed Required Disclaimer Banner */}
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-950/90 border border-slate-800/80 rounded-xl text-[11px] text-slate-400">
        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
        <span>
          <strong>Yasal Not:</strong> Senaryo tabanlı tahmindir; sahada ölçülmüş tasarruf değildir.
          Tarife ve emisyon parametreleri kullanıcı varsayımıdır.
        </span>
      </div>
    </div>
  );
};
