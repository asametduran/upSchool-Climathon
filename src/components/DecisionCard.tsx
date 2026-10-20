import React, { useState } from 'react';
import {
  CheckCircle,
  XCircle,
  Edit3,
  Calendar,
  Layers,
  Clock,
  Sparkles,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { DecisionCardData } from '../types/hydrology';

interface DecisionCardProps {
  decision: DecisionCardData;
  cutoffDateStr: string;
}

export const DecisionCard: React.FC<DecisionCardProps> = ({ decision, cutoffDateStr }) => {
  const [userDecisionState, setUserDecisionState] = useState<'beklemede' | 'onaylandi' | 'reddedildi' | 'duzenlendi'>('beklemede');
  const [showTable, setShowTable] = useState<boolean>(true);
  const [customNote, setCustomNote] = useState<string>('');
  const [isEditingNote, setIsEditingNote] = useState<boolean>(false);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-cyan-950/80 rounded-xl text-cyan-400 border border-cyan-800/40">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white tracking-tight">
                Dinamik Sulama &amp; Gece Tarifesi Pompa Çalıştırma Önerisi
              </h3>
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                AI Karar Motoru
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Erken uyarı risk seviyesine ve kar erimesi hidrografına göre optimize edilmiş işletme talimatı
            </p>
          </div>
        </div>

        {/* Confidence Badge & Human Decision Badge */}
        <div className="flex items-center gap-2">
          <div className="text-xs flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950/80 border border-slate-800">
            <span className="text-slate-400">Model Güveni:</span>
            <span
              className={`font-semibold ${
                decision.confidence === 'Yüksek'
                  ? 'text-emerald-400'
                  : decision.confidence === 'Orta'
                  ? 'text-amber-400'
                  : 'text-rose-400'
              }`}
            >
              ● {decision.confidence}
            </span>
          </div>

          <div className="text-[11px] px-2.5 py-1 rounded-lg bg-cyan-950/40 text-cyan-300 border border-cyan-800/40 font-medium flex items-center gap-1">
            <Info className="w-3.5 h-3.5" />
            İnsan Karar Verir – Model Önerir
          </div>
        </div>
      </div>

      {/* 3 Summary Points */}
      <div className="space-y-2 bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
        <div className="text-xs font-semibold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
          <Layers className="w-4 h-4" /> Temel İşletme Karar Maddeleri
        </div>
        <ul className="space-y-2 text-xs text-slate-300">
          {decision.summaryPoints.map((point, idx) => (
            <li key={idx} className="flex items-start gap-2.5">
              <span className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-slate-800 text-cyan-400 text-[11px] font-bold">
                {idx + 1}
              </span>
              <span className="leading-relaxed">{point}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Action Buttons: Onayla / Reddet / Düzenle */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-950/40 rounded-xl border border-slate-800/70">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">İşletmeci Onayı:</span>
          {userDecisionState === 'beklemede' && (
            <span className="text-xs font-medium text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md">
              Karar Bekleniyor
            </span>
          )}
          {userDecisionState === 'onaylandi' && (
            <span className="text-xs font-bold text-emerald-400 bg-emerald-950/70 border border-emerald-800 px-2 py-0.5 rounded-md flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" /> Plan Onaylandı
            </span>
          )}
          {userDecisionState === 'reddedildi' && (
            <span className="text-xs font-bold text-rose-400 bg-rose-950/70 border border-rose-800 px-2 py-0.5 rounded-md flex items-center gap-1">
              <XCircle className="w-3.5 h-3.5" /> Plan Reddedildi
            </span>
          )}
          {userDecisionState === 'duzenlendi' && (
            <span className="text-xs font-bold text-amber-400 bg-amber-950/70 border border-amber-800 px-2 py-0.5 rounded-md flex items-center gap-1">
              <Edit3 className="w-3.5 h-3.5" /> Düzenleme Modunda
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setUserDecisionState('onaylandi')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${
              userDecisionState === 'onaylandi'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-emerald-950/50 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/50'
            }`}
          >
            <CheckCircle className="w-3.5 h-3.5" />
            Onayla
          </button>

          <button
            onClick={() => setUserDecisionState('reddedildi')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${
              userDecisionState === 'reddedildi'
                ? 'bg-rose-600 text-white shadow-md'
                : 'bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 border border-rose-800/50'
            }`}
          >
            <XCircle className="w-3.5 h-3.5" />
            Reddet
          </button>

          <button
            onClick={() => {
              setUserDecisionState('duzenlendi');
              setIsEditingNote(!isEditingNote);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${
              isEditingNote
                ? 'bg-amber-600 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            Düzenle / Not Ekle
          </button>
        </div>
      </div>

      {isEditingNote && (
        <div className="p-3 bg-slate-950 rounded-xl border border-amber-900/50 space-y-2">
          <label className="text-xs text-amber-300 font-semibold block">
            İşletmeci Notu &amp; Saha İstisnası:
          </label>
          <textarea
            value={customNote}
            onChange={(e) => setCustomNote(e.target.value)}
            placeholder="Örn: 22 Nisan'da kanal bakım çalışması sebebiyle pompaj 4 saat kısıtlanacaktır."
            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-hidden focus:border-cyan-500"
            rows={2}
          />
          <div className="flex justify-end">
            <button
              onClick={() => setIsEditingNote(false)}
              className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-medium"
            >
              Kaydet
            </button>
          </div>
        </div>
      )}

      {/* 14-Day Planning Schedule Table Collapsible */}
      <div className="border border-slate-800 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowTable(!showTable)}
          className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-950/70 hover:bg-slate-950 transition text-xs font-semibold text-slate-200"
        >
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-cyan-400" />
            <span>Önümüzdeki 14 Günlük Pompaj Saat Dilimi &amp; Su Tahsis Tablosu ({cutoffDateStr}'den itibaren)</span>
          </div>
          {showTable ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showTable && (
          <div className="overflow-x-auto max-h-72">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-950/90 text-[11px] text-slate-400 uppercase tracking-wider sticky top-0 border-b border-slate-800">
                <tr>
                  <th className="py-2 px-3">Tarih</th>
                  <th className="py-2 px-3">Beklenen Debi (P50)</th>
                  <th className="py-2 px-3">Sulama Rejimi</th>
                  <th className="py-2 px-3">Önerilen Çalışma Penceresi</th>
                  <th className="py-2 px-3">Planlanan Enerji</th>
                  <th className="py-2 px-3">Yerçekimi Payı</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                {decision.fourteenDayPlan.map((plan, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/30 transition">
                    <td className="py-2 px-3 font-sans font-medium text-slate-200">{plan.date}</td>
                    <td className="py-2 px-3 text-cyan-300 font-bold">{plan.flowP50} m³/s</td>
                    <td className="py-2 px-3 font-sans">
                      <span className="px-2 py-0.5 rounded-md bg-slate-800/80 text-slate-300 text-[10px]">
                        {plan.irrigationStatus}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-sans text-amber-300/90 flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-amber-400" />
                      {plan.windowNote}
                    </td>
                    <td className="py-2 px-3 text-emerald-300">{plan.plannedMWh} MWh</td>
                    <td className="py-2 px-3 text-slate-300 font-sans">{plan.gravityShare}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
