import React from 'react';
import { 
  Sparkles, 
  LayoutDashboard, 
  History 
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  ComposedChart, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Legend, 
  Bar, 
  Line, 
  AreaChart, 
  Area, 
  LineChart,
  CartesianGrid
} from 'recharts';
import { toast } from 'sonner';

// Tailwind class merger utility
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ChartConsoleProps {
  chartSchema: 'classic' | 'neon' | 'cyberpunk' | 'vibrant';
  setChartSchema: (schema: 'classic' | 'neon' | 'cyberpunk' | 'vibrant') => void;
  activeChartLayout: 'combined' | 'separate';
  setActiveChartLayout: (layout: 'combined' | 'separate') => void;
  filteredChartAndMetricData: {
    chartData: any[];
    metrics: {
      profit: number;
      margin: number;
    };
  };
  weeklySalesTrends: any[];
  filteredCashFlowData: any[];
  currency: string;
  schemaColors: Record<string, { primary: string; secondary: string; warning: string; danger: string }>;
}

export const ChartConsole: React.FC<ChartConsoleProps> = ({
  chartSchema,
  setChartSchema,
  activeChartLayout,
  setActiveChartLayout,
  filteredChartAndMetricData,
  weeklySalesTrends,
  filteredCashFlowData,
  currency,
  schemaColors,
}) => {
  return (
    <div className="p-6 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-[32px] border border-indigo-500/20 shadow-2xl relative overflow-hidden animate-in fade-in duration-300">
      {/* Background absolute glowing accents */}
      <div className="absolute -right-12 -top-12 w-48 h-48 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
      <div className="absolute -left-12 -bottom-12 w-48 h-48 rounded-full bg-pink-500/5 blur-3xl pointer-events-none" />
      
      <div className="relative space-y-6">
        {/* Header with Title & Animated Status */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/5 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-500/10 text-indigo-400 animate-pulse">
                <Sparkles size={15} />
              </span>
              <h3 className="text-lg font-black text-white tracking-tight uppercase">
                Consola de Esquemas de Gráficos
              </h3>
            </div>
            <p className="text-xs text-indigo-200/65 font-medium mt-1">
              Visualize o seu desempenho financeiro com esquemas visuais impressionantes e totalmente personalizáveis.
            </p>
          </div>
          
          {/* Active Schema indicator */}
          <div className="flex items-center gap-2 self-start lg:self-center">
            <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-800 text-slate-300 border border-slate-700">
              Esquema Ativo: <span className="text-[#B8791A] font-extrabold">{chartSchema === 'classic' ? 'CLÁSSICO' : chartSchema === 'vibrant' ? 'VIBRANTE' : chartSchema.toUpperCase()}</span>
            </span>
          </div>
        </div>

        {/* Dynamic Theme Selection Buttons & Layout Switcher */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white/5 p-4 rounded-2xl border border-white/5">
          {/* Selector 1: Color Schema */}
          <div className="space-y-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-300 block">
              🎨 Esquema de Cores (Stunning designs)
            </span>
            <div className="grid grid-cols-2 gap-2">
              {(['classic', 'vibrant'] as const).map((schema) => (
                <button
                  key={schema}
                  type="button"
                  onClick={() => {
                    setChartSchema(schema);
                    toast.success(`Esquema Ajustado para: ${schema === 'classic' ? 'CLÁSSICO (AZUL)' : 'VIBRANTE (LARANJA)'}`, {
                      icon: '🎨',
                    });
                  }}
                  className={cn(
                    "px-3 py-2 rounded-xl text-[11px] font-extrabold uppercase transition-all duration-300 border cursor-pointer flex items-center justify-center gap-1.5",
                    chartSchema === schema
                      ? "bg-white text-slate-950 border-white shadow-xl scale-102"
                      : "bg-transparent text-slate-300 border-white/10 hover:bg-white/5 hover:border-white/20"
                  )}
                >
                  <span 
                    className="w-2.5 h-2.5 rounded-full shrink-0" 
                    style={{ backgroundColor: schemaColors[schema].primary }} 
                  />
                  {schema === 'classic' ? 'Clássico (Azul)' : 'Vibrante (Laranja)'}
                </button>
              ))}
            </div>
          </div>

          {/* Selector 2: Layout Type */}
          <div className="space-y-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-300 block">
              📊 Arquitetura de Exibição
            </span>
            <div className="grid grid-cols-2 gap-2 h-[68px]">
              <button
                type="button"
                onClick={() => setActiveChartLayout('combined')}
                className={cn(
                  "rounded-xl text-[11px] font-extrabold uppercase transition-all duration-300 border cursor-pointer flex flex-col items-center justify-center gap-1",
                  activeChartLayout === 'combined'
                    ? "bg-gradient-to-r from-indigo-500 to-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-500/20"
                    : "bg-transparent text-slate-300 border-white/10 hover:border-white/20"
                )}
              >
                <LayoutDashboard size={14} />
                Combinado
              </button>
              <button
                type="button"
                onClick={() => setActiveChartLayout('separate')}
                className={cn(
                  "rounded-xl text-[11px] font-extrabold uppercase transition-all duration-300 border cursor-pointer flex flex-col items-center justify-center gap-1",
                  activeChartLayout === 'separate'
                    ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white border-pink-400 shadow-md shadow-pink-500/20"
                    : "bg-transparent text-slate-300 border-white/10 hover:border-white/20"
                )}
              >
                <History size={14} />
                Separados (3)
              </button>
            </div>
          </div>
        </div>

        {/* Rendering Interactive Chart Space based on Schema Choices */}
        <div className="space-y-6">
          {activeChartLayout === 'combined' ? (
            /* EXQUISITE UNIFIED MASTER CHART SCHEMA */
            <div className="bg-white/5 rounded-2xl p-5 border border-white/5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/2 p-3.5 rounded-xl border border-white/5">
                <div>
                  <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: schemaColors[chartSchema].primary }} />
                    Análise Agrupada de Receitas, Custos & Margem
                  </h4>
                  <p className="text-[11px] text-indigo-200/50 mt-0.5">Visão consolidada utilizando a paleta {chartSchema.toUpperCase()}.</p>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    Lucro: {filteredChartAndMetricData.metrics.profit.toLocaleString()} {currency}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    Margem: {filteredChartAndMetricData.metrics.margin.toFixed(1)}%
                  </span>
                </div>
              </div>

              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <ComposedChart data={filteredChartAndMetricData.chartData}>
                    <defs>
                      <linearGradient id="schemaPrimaryGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={schemaColors[chartSchema].primary} stopOpacity={0.4}/>
                        <stop offset="95%" stopColor={schemaColors[chartSchema].primary} stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="schemaSecondaryGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={schemaColors[chartSchema].secondary} stopOpacity={0.3}/>
                        <stop offset="95%" stopColor={schemaColors[chartSchema].secondary} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff08" />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                    <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                    <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: schemaColors[chartSchema].warning, fontSize: 10 }} unit="%" domain={[0, 100]} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #ffffff15', borderRadius: '12px', color: '#fff' }}
                      itemStyle={{ color: '#fff' }}
                    />
                    <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '10px', color: '#94a3b8' }} />
                    <Bar yAxisId="left" dataKey="sales" name="Receita Bruta" fill={schemaColors[chartSchema].primary} radius={[4, 4, 0, 0]} barSize={16} />
                    <Bar yAxisId="left" dataKey="expenses" name="Despesa Comercial" fill={schemaColors[chartSchema].danger} radius={[4, 4, 0, 0]} barSize={16} />
                    <Line yAxisId="right" type="monotone" dataKey="margin" name="Margem Real %" stroke={schemaColors[chartSchema].warning} strokeWidth={3} dot={{ r: 4, stroke: schemaColors[chartSchema].warning, fill: '#fff' }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            /* SPLIT SEPARATED STACK PANELS PRECISELY THEMED */
            <div className="space-y-5">
              {/* Weekly Sales Trend */}
              <div className="bg-slate-900 border border-white/5 rounded-2xl p-5 space-y-4">
                <div>
                  <h4 className="text-xs font-black text-slate-200 uppercase tracking-wider pl-3 border-l-2" style={{ borderLeftColor: schemaColors[chartSchema].primary }}>
                    Tendência Ativa de Vendas (Crescimento)
                  </h4>
                </div>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <LineChart data={weeklySalesTrends}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff08" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', color: '#fff' }} />
                      <Line 
                        type="monotone" 
                        dataKey="sales" 
                        name="Vendas" 
                        stroke={schemaColors[chartSchema].primary} 
                        strokeWidth={3} 
                        dot={{ r: 4, stroke: schemaColors[chartSchema].primary, strokeWidth: 2, fill: '#fff' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Receita, Despesas & Margem */}
              <div className="bg-slate-900 border border-white/5 rounded-2xl p-5 space-y-4">
                <div>
                  <h4 className="text-xs font-black text-slate-200 uppercase tracking-wider pl-3 border-l-2" style={{ borderLeftColor: schemaColors[chartSchema].secondary }}>
                    Receita Operacional, Despesas & Margem
                  </h4>
                </div>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <ComposedChart data={filteredChartAndMetricData.chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff08" />
                      <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                      <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', color: '#fff' }} />
                      <Bar yAxisId="left" dataKey="sales" name="Receita" fill={schemaColors[chartSchema].primary} radius={[3, 3, 0, 0]} barSize={12} />
                      <Bar yAxisId="left" dataKey="expenses" name="Despesa" fill={schemaColors[chartSchema].danger} radius={[3, 3, 0, 0]} barSize={12} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Cash Flow */}
              <div className="bg-slate-900 border border-white/5 rounded-2xl p-5 space-y-4">
                <div>
                  <h4 className="text-xs font-black text-slate-200 uppercase tracking-wider pl-3 border-l-2" style={{ borderLeftColor: schemaColors[chartSchema].warning }}>
                    Demonstração de Fluxo de Caixa (Flutuação)
                  </h4>
                </div>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <AreaChart data={filteredCashFlowData}>
                      <defs>
                        <linearGradient id="colorLightIn" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={schemaColors[chartSchema].secondary} stopOpacity={0.4}/>
                          <stop offset="95%" stopColor={schemaColors[chartSchema].secondary} stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff08" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', color: '#fff' }} />
                      <Area type="monotone" dataKey="Entradas (In)" stroke={schemaColors[chartSchema].secondary} strokeWidth={2.5} fillOpacity={1} fill="url(#colorLightIn)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
