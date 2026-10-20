import React from 'react';
import { X, HelpCircle, AlertTriangle, ShieldCheck, Calculator } from 'lucide-react';
import { RiskAnalysis } from '../types/hydrology';

interface RiskExplanationModalProps {
  isOpen: boolean;
  onClose: () => void;
  risk: RiskAnalysis;
  year: number;
  subBasin: string;
}

export const RiskExplanationModal: React.FC<RiskExplanationModalProps> = ({
  isOpen,
  onClose,
  risk,
  year,
  subBasin,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-cyan-800/60 rounded-2xl max-w-2xl w-full p-6 text-slate-200 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-950/80 rounded-lg text-cyan-400 border border-cyan-800/40">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-lg text-white">Neden Bu Risk Skoru ({risk.score} / 100)?</h3>
              <p className="text-xs text-slate-400">
                {subBasin} Havzası · {year} Sezonu Su Yetersizliği Olasılık Analizi
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-5 space-y-5 text-sm">
          {/* Summary Box */}
          <div
            className={`p-4 rounded-xl border flex items-start gap-3 ${
              risk.category === 'Yüksek'
                ? 'bg-rose-950/30 border-rose-800/50 text-rose-200'
                : risk.category === 'Orta'
                ? 'bg-amber-950/30 border-amber-800/50 text-amber-200'
                : 'bg-emerald-950/30 border-emerald-800/50 text-emerald-200'
            }`}
          >
            {risk.category === 'Yüksek' ? (
              <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0 text-rose-400" />
            ) : (
              <ShieldCheck className="w-5 h-5 mt-0.5 shrink-0 text-emerald-400" />
            )}
            <div>
              <div className="font-medium">
                {risk.category} Risk Seviyesi ({risk.score} / 100)
              </div>
              <p className="text-xs mt-1 leading-relaxed opacity-90">
                Bu skor, {year} sezonu için tahmin edilen toplam giriş hacminin ({risk.totalSeasonVolumeP50} hm³),
                tarihsel 9 yıllık giriş serisinin (2018–2026) kümülatif olasılık dağılımındaki (CDF) yerine göre hesaplanmıştır.
              </p>
            </div>
          </div>

          {/* Formül & Adımlar */}
          <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3 font-mono text-xs">
            <div className="text-cyan-400 font-semibold text-sm font-sans flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4" /> Matematiksel Formülasyon
            </div>
            <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800 text-slate-300">
              <code>V_tahmin = V_gözlenen(kesime_kadar) + V_model(kesimden_sonra, P50)</code>
              <br />
              <code>Risk = 100 × (1 - F(V_tahmin))</code>
            </div>
            <div className="grid grid-cols-2 gap-3 text-slate-300 pt-1">
              <div>
                <span className="text-slate-500">Kesime Kadar Gerçekleşen:</span>{' '}
                <strong className="text-cyan-300">{risk.currentObservedCutoffVolume} hm³</strong>
              </div>
              <div>
                <span className="text-slate-500">Kesim Sonrası Model (P50):</span>{' '}
                <strong className="text-cyan-300">{risk.forecastVolumeP50} hm³</strong>
              </div>
              <div>
                <span className="text-slate-500">Sezon Toplamı (P50):</span>{' '}
                <strong className="text-emerald-300">{risk.totalSeasonVolumeP50} hm³</strong>
              </div>
              <div>
                <span className="text-slate-500">Olasılık Aralığı (P10 - P90):</span>{' '}
                <strong className="text-amber-300">{risk.totalSeasonVolumeP10} – {risk.totalSeasonVolumeP90} hm³</strong>
              </div>
              <div>
                <span className="text-slate-500">Tarihsel Medyan (P50):</span>{' '}
                <strong className="text-slate-200">{risk.medianVolume} hm³</strong>
              </div>
              <div>
                <span className="text-slate-500">Tarihsel Kurak Eşik (P25):</span>{' '}
                <strong className="text-rose-300">{risk.p25Volume} hm³</strong>
              </div>
            </div>
          </div>

          {/* Monte Carlo Analizi */}
          <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800 space-y-2">
            <div className="text-sm font-semibold text-white flex items-center justify-between">
              <span>Monte Carlo Kuraklık Riski Analizi</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/40">
                1,000 Simülasyon
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Modelin tahmin belirsizliği (P10–P90 log-oran kalıntı dağılımı) üzerinden 1,000 rassal Monte Carlo iterasyonu
              koşturulmuştur. Sezon toplam girişinin tarihsel en kurak %25 eşiğinin ({risk.p25Volume} hm³) altında kalma olasılığı:
            </p>
            <div className="flex items-center gap-3 pt-1">
              <div className="flex-1 bg-slate-800 h-3 rounded-full overflow-hidden">
                <div
                  className={`h-full ${
                    risk.probLessThanP25 > 50
                      ? 'bg-rose-500'
                      : risk.probLessThanP25 > 25
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(2, risk.probLessThanP25))}%` }}
                />
              </div>
              <span className="text-xs font-bold text-white shrink-0 font-mono">
                P(V &lt; P25) = %{risk.probLessThanP25}
              </span>
            </div>
          </div>

          {/* Tarihsel Sezon Hacimleri Tablosu */}
          <div>
            <div className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">
              Tarihsel 9 Yıllık Giriş Hacmi Dağılımı ({subBasin})
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-center text-xs">
              {risk.historicalVolumes.map((h) => (
                <div
                  key={h.year}
                  className={`p-2 rounded-lg border ${
                    h.year === year
                      ? 'bg-cyan-950/70 border-cyan-500 text-cyan-200 font-bold'
                      : 'bg-slate-950/40 border-slate-800 text-slate-300'
                  }`}
                >
                  <div className="text-[10px] text-slate-400">{h.year}</div>
                  <div className="font-mono text-xs mt-0.5">{h.volumeHm3} hm³</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium transition"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};
