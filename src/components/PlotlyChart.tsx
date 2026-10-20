import React, { useEffect, useRef, useState } from 'react';

interface PlotlyChartProps {
  data: any[];
  layout: any;
  config?: any;
  style?: React.CSSProperties;
  className?: string;
}

export const PlotlyChart: React.FC<PlotlyChartProps> = ({
  data,
  layout,
  config = { responsive: true, displayModeBar: true, displaylogo: false },
  style = { width: '100%', height: '100%' },
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [plotlyReady, setPlotlyReady] = useState<boolean>(false);

  useEffect(() => {
    // Check if Plotly is loaded on window
    if ((window as any).Plotly) {
      setPlotlyReady(true);
      return;
    }

    // Otherwise poll briefly for CDN script
    const interval = setInterval(() => {
      if ((window as any).Plotly) {
        setPlotlyReady(true);
        clearInterval(interval);
      }
    }, 150);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!plotlyReady || !containerRef.current) return;
    const Plotly = (window as any).Plotly;
    if (!Plotly) return;

    try {
      Plotly.react(containerRef.current, data, layout, config);
    } catch (err) {
      console.warn('Plotly error:', err);
    }

    const handleResize = () => {
      if (containerRef.current && Plotly) {
        Plotly.Plots.resize(containerRef.current);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [plotlyReady, data, layout, config]);

  return (
    <div className={`relative ${className}`} style={style}>
      <div ref={containerRef} className="w-full h-full min-h-[220px]" />
      {!plotlyReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/40 text-slate-400 text-xs">
          Grafik kütüphanesi yükleniyor...
        </div>
      )}
    </div>
  );
};
