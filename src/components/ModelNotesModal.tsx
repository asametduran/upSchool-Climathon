import React from 'react';
import { X, Info, FileCode, CheckCircle2, AlertOctagon } from 'lucide-react';

interface ModelNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ModelNotesModal: React.FC<ModelNotesModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 text-slate-200 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-950/80 rounded-lg text-blue-400 border border-blue-800/40">
              <Info className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-lg text-white">Model Metodolojisi, Kısıtlar ve Notlar</h3>
              <p className="text-xs text-slate-400">
                Hidroinformatik Modelleme ve Karar Destek Mimarisi
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

        <div className="mt-5 space-y-4 text-xs leading-relaxed text-slate-300">
          {/* Sentetik Veri Rozeti & Uyarısı */}
          <div className="p-3.5 bg-amber-950/30 border border-amber-800/50 rounded-xl flex items-start gap-3 text-amber-200">
            <AlertOctagon className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-sm block text-amber-100 font-semibold mb-1">
                Sentetik Demo Verisi Bildirimi
              </strong>
              Platformda kullanılan 2018–2026 günlük hidrolojik veri seti (kar örtüsü, sıcaklık, kar su eşdeğeri SWE, SRM akışı ve debiler), ERA5-Land reanalizleri, MODIS/Sentinel kar erimesi eğrileri ve DSİ hidrometri formatları baz alınarak <strong>sentetik olarak üretilmiştir</strong>. Operasyonel saha kararları için doğrudan kullanılamaz.
            </div>
          </div>

          {/* Model Notu: Lineer vs Boosted */}
          <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800 space-y-2">
            <h4 className="font-semibold text-white text-sm flex items-center gap-2">
              <FileCode className="w-4 h-4 text-cyan-400" />
              Tarayıcı İçi AI Karar Motoru &amp; XGBoost Notu
            </h4>
            <p>
              Bu platformda çalışan yapay zeka modelleri harici bir backend veya Python bağımlılığı olmadan, <strong>tamamen tarayıcıda (Client-side TypeScript)</strong> yürütülmektedir:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-400">
              <li>
                <strong className="text-slate-200">Lineer Ridge Regresyonu (L2, λ = 1.0):</strong> Gauss-Jordan ters matris eliminasyonuyla analitik çözülür; katsayılar aşırı uyumu (overfitting) engelleyecek şekilde normalize edilir.
              </li>
              <li>
                <strong className="text-slate-200">Gradient-Boosted Decision Stumps (50 Ağaç, Öğrenme Oranı η = 0.1):</strong> Her iterasyonda bir önceki adımın kalıntıları (residuals) üzerine en yüksek varyans düşüşünü sağlayan tek-düğümlü karar kütüğü eğitilir.
              </li>
            </ul>
            <p className="text-slate-400 text-[11px] italic pt-1 border-t border-slate-800/60">
              * Dürüstlük Notu: Bu mimari tarayıcı içi hafif bir gradient boosting implementasyonudur. Endüstriyel seviyede ağaç derinlikli gerçek XGBoost/LightGBM model eğitimleri çevrimdışı Python ortamında yürütülür.
            </p>
          </div>

          {/* LOYO Doğrulaması */}
          <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800 space-y-2">
            <h4 className="font-semibold text-white text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Leave-One-Year-Out (LOYO) Doğrulama Stratejisi
            </h4>
            <p>
              Zaman serisi hidrolojik modellerinde veri sızıntısını (data leakage) engellemek için seçilen test yılı eğitime <strong>kesinlikle dahil edilmez</strong>. Model kalan 8 yıldan öğrenir.
            </p>
            <p className="text-slate-400">
              Gösterilen LOYO MAE ve R² metrikleri, eğitim yıllarının çapraz doğrulaması ile ampirik olarak hesaplanır. Tahmin olasılık bantları (P10, P50, P90) bu çapraz doğrulamanın log-oran kalıntı kuantillerinden türetilir.
            </p>
          </div>

          {/* Tasarruf Hesaplama Varsayımları */}
          <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800 space-y-2">
            <h4 className="font-semibold text-white text-sm">
              Tasarruf Sayacı ve Senaryo Parametreleri (Counterfactual)
            </h4>
            <p className="text-slate-400">
              Canlı sayaçtaki elektrik, CO₂ ve TL kazançları, takvime dayalı baseline ile dinamik öneri arasındaki farkı temsil eden <strong>senaryo tabanlı tahminlerdir</strong>. Sahada ölçülmüş gerçek tasarruf değildir.
            </p>
            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 pt-1">
              <div>• Aşırı Sulama Payı: %13 (Varsayım)</div>
              <div>• Gece Yük Kaydırma: %60 (Varsayım)</div>
              <div>• Gündüz Tarifesi: 3,200 TL/MWh</div>
              <div>• Gece Tarifesi: 1,900 TL/MWh</div>
              <div>• Emisyon Faktörü: 0.45 tCO₂/MWh (Doğrulama gerekir)</div>
            </div>
          </div>

          {/* Operasyonel Geçiş */}
          <div className="p-3 bg-slate-800/40 rounded-xl border border-slate-800 text-slate-400 text-[11px]">
            <strong className="text-slate-200 block mb-0.5">Operasyonel Kullanım İçin Yol Haritası:</strong>
            DSİ 9. Bölge Müdürlüğü operasyonel entegrasyonu için; Akaryakıt/Keban/Palu AGİ istasyonlarının gerçek telemetrik debi kayıtları, Sentinel-2 / Landsat-8 kar haritaları ve ERA5-Land sıcaklık gridleri ile modellerin yerinde yeniden kalibre edilmesi gerekmektedir.
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium transition"
          >
            Anladım
          </button>
        </div>
      </div>
    </div>
  );
};
