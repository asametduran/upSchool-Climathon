import React, { useRef, useState } from 'react';
import { X, Upload, FileText, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { parseHydrologyCsv } from '../utils/csvParser';
import { HydrologyRecord } from '../types/hydrology';

interface CustomCsvUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessUpload: (records: HydrologyRecord[]) => void;
  onResetDefault: () => void;
  isCustomLoaded: boolean;
}

export const CustomCsvUploadModal: React.FC<CustomCsvUploadModalProps> = ({
  isOpen,
  onClose,
  onSuccessUpload,
  onResetDefault,
  isCustomLoaded,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg(null);
    setSuccessInfo(null);
    setIsProcessing(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const res = parseHydrologyCsv(text);
        if (res.error) {
          setErrorMsg(res.error);
        } else {
          setSuccessInfo(
            `Başarılı! ${res.records.length} veri satırı ayrıştırıldı (${res.years.join(', ')} yılları, ${res.basins.join(', ')} havzaları).`
          );
          onSuccessUpload(res.records);
        }
      } catch (err: any) {
        setErrorMsg('Dosya okunurken beklenmeyen bir hata oluştu: ' + (err?.message || err));
      } finally {
        setIsProcessing(false);
      }
    };
    reader.onerror = () => {
      setErrorMsg('Dosya yüklenemedi.');
      setIsProcessing(false);
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 text-slate-200 shadow-2xl">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-950/80 rounded-lg text-cyan-400 border border-cyan-800/40">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-lg text-white">Özel Hidrolojik CSV Yükle</h3>
              <p className="text-xs text-slate-400">
                Aynı veri şemasına sahip yerel CSV dosyanızı yükleyin
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

        <div className="mt-5 space-y-4 text-xs">
          {/* Dosya Seçim Alanı */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-700 hover:border-cyan-500 rounded-xl p-6 text-center cursor-pointer bg-slate-950/40 hover:bg-slate-950/70 transition flex flex-col items-center justify-center gap-2"
          >
            <FileText className="w-8 h-8 text-cyan-400 mb-1" />
            <div className="text-sm font-medium text-white">CSV dosyasını seçmek için tıklayın</div>
            <div className="text-[11px] text-slate-400">veya dosyayı buraya sürükleyip bırakın</div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {/* Durum Bildirimleri */}
          {isProcessing && (
            <div className="p-3 bg-slate-800 rounded-lg text-slate-300 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
              <span>Veri ayrıştırılıyor ve modeller yeniden kalibre ediliyor...</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-xl text-rose-300 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed">{errorMsg}</div>
            </div>
          )}

          {successInfo && (
            <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-emerald-300 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed">{successInfo}</div>
            </div>
          )}

          {/* Gerekli Şema Bilgisi */}
          <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 space-y-2">
            <div className="font-semibold text-slate-300 text-[11px] uppercase tracking-wider">
              Gerekli CSV Başlık Şeması:
            </div>
            <div className="text-[10px] font-mono text-cyan-300/90 break-all leading-normal bg-slate-900 p-2 rounded-lg border border-slate-800">
              Tarih, Yil, Ay, Alt_Havza, Kar_Ortusu_km2, Sicaklik_Ort_C, Kar_Su_Esd_SWE_mm, Yagis_mm, Fiziksel_SRM_Akis_m3s, Gozlenen_Girdi_m3s, Uluova_Pompaj_Enerji_MWh
            </div>
          </div>

          {isCustomLoaded && (
            <div className="pt-2 flex items-center justify-between">
              <span className="text-cyan-400">Şu anda özel kullanıcı verisi devrede.</span>
              <button
                onClick={() => {
                  onResetDefault();
                  setSuccessInfo('Varsayılan Keban-Hazar veri setine dönüldü.');
                  setErrorMsg(null);
                }}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs flex items-center gap-1.5 transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Varsayılan Demo Verisine Dön
              </button>
            </div>
          )}
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
