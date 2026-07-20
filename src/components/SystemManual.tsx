import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Play, ShoppingCart, Box, Users, FileText, DollarSign, Shield, Receipt, 
  Store, BarChart3, Building, Truck, UserCheck, Settings, HelpCircle, 
  BookOpen, Search, Printer, ChevronRight, AlertTriangle, AlertCircle, 
  Check, ArrowUp, Menu, X, CheckSquare, Sparkles, ThumbsUp, Activity, Smartphone,
  Download
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { generateSystemManualPDF } from '../lib/pdfGenerator';

interface ManualStep {
  num: number;
  title: string;
  desc: string;
}

interface ManualBox {
  type: 'tip' | 'warning' | 'danger';
  text: string;
}

interface ManualSection {
  id: string;
  icon: React.ComponentType<any>;
  iconColor: string; // Tailwind text color e.g. 'text-violet-400'
  iconBg: string; // Tailwind background e.g. 'bg-violet-500/10'
  title: string;
  category: string;
  summary: string;
  description: string;
  steps: ManualStep[];
  boxes: ManualBox[];
}

// ==========================================
// INTEGRATED INTERACTIVE DESIGN MOCKUP ENGINE
// ==========================================
interface AnnotationArrowProps {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  label: string;
  direction?: 'left' | 'right' | 'up' | 'down';
  accentColor?: string;
}

function AnnotationArrow({ startX, startY, endX, endY, label, direction = 'down', accentColor = 'border-teal-400 text-teal-300 bg-teal-950/90' }: AnnotationArrowProps) {
  return (
    <div className="absolute inset-0 pointer-events-none select-none z-30">
      {/* SVG drawing the curved dotted arrow path */}
      <svg className="absolute inset-0 w-full h-full overflow-visible" style={{ pointerEvents: 'none' }}>
        <defs>
          <marker id={`arrowhead-${startX}-${startY}`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <polygon points="0 0, 7 3.5, 0 7" className="fill-current text-white/80" />
          </marker>
        </defs>
        <path
          d={`M ${startX} ${startY} Q ${(startX + endX) / 2} ${(startY + endY) / 2 - 20}, ${endX} ${endY}`}
          fill="none"
          stroke="rgba(255, 255, 255, 0.45)"
          strokeWidth="1.5"
          strokeDasharray="4 3"
          markerEnd={`url(#arrowhead-${startX}-${startY})`}
        />
        {/* Blinking target dot */}
        <circle cx={endX} cy={endY} r="4" className="fill-amber-400 animate-ping" />
        <circle cx={endX} cy={endY} r="2" className="fill-amber-300" />
      </svg>
      {/* The floating explanation badging */}
      <div 
        className={`absolute p-2 rounded-xl border text-[10px] font-bold shadow-lg flex items-center gap-1 leading-tight pointer-events-auto backdrop-blur-md transition-all hover:scale-105 ${accentColor}`}
        style={{ left: `${startX}%`, top: `${startY}%`, transform: 'translate(-50%, -50%)' }}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse shrink-0" />
        <p className="whitespace-nowrap">{label}</p>
      </div>
    </div>
  );
}

function FeatureMockup({ sectionId }: { sectionId: string }) {
  switch (sectionId) {
    case 'inicio-rapido':
      return (
        <div className="relative w-full rounded-2xl bg-[#0C2242] border border-blue-500/25 p-4 overflow-hidden min-h-[290px] select-none text-left">
          {/* Eye-friendly strategic colors: Corporate Blue & Warm Orange Theme */}
          <div className="flex items-center justify-between border-b border-blue-500/10 pb-2 mb-4">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#EA5455]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#FFC436]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#28C76F]" />
              <span className="text-[10px] font-mono font-bold text-blue-200/80 ml-2">sabush.co.mz/erp/portal</span>
            </div>
            <span className="px-2 py-0.5 rounded bg-slate-800/60 text-slate-300 text-[8px] font-bold uppercase tracking-wider">MÓDULO CONFIGURAÇÃO</span>
          </div>

          <div className="max-w-[280px] mx-auto bg-slate-950/90 rounded-2xl border border-blue-500/15 p-4 shadow-xl space-y-3.5 relative">
            <div className="text-center">
              <div className="w-8 h-8 rounded-full bg-[#B8791A] text-white flex items-center justify-center mx-auto text-sm font-black border border-[#B8791A]/50">S</div>
              <h4 className="text-xs font-black text-white mt-1.5">Sabush ERP Login</h4>
              <p className="text-[9px] text-slate-400 mt-0.5">Introduza as credenciais seguras</p>
            </div>
            <div className="space-y-1.5">
              <div className="bg-white border border-slate-200 rounded-lg p-2 text-[9px] text-slate-700">admin@empresa.co.mz</div>
              <div className="bg-white border border-slate-200 rounded-lg p-2 text-[9px] text-slate-700 flex justify-between">
                <span>••••••••••••</span>
                <span className="text-[8px] text-[#0A1C38] font-bold">Ver</span>
              </div>
            </div>
            <button className="w-full py-1.5 bg-[#0A1C38] text-white rounded-lg text-[9px] font-black hover:bg-[#0A1C38]/90">ENTRAR</button>
            <div className="flex items-center justify-center gap-1 border-t border-slate-800 pt-2 pb-0.5 text-[8px] text-slate-400">
              <span className="px-2 py-1 bg-slate-900 border border-slate-800 rounded flex items-center gap-1 hover:bg-slate-850 w-full justify-center cursor-pointer">
                <span className="text-[#EA4335] font-bold">G</span> Google Workspace
              </span>
            </div>
          </div>

          {/* Arrows pointing details */}
          <AnnotationArrow startX={15} startY={35} endX={105} endY={120} label="Autenticação Segura Online" accentColor="border-[#0A1C38] text-white bg-[#0A1C38]" />
          <AnnotationArrow startX={82} startY={60} endX={195} endY={182} label="Acesso por E-mail Validado" accentColor="border-[#B8791A] text-white bg-[#B8791A]" />
        </div>
      );

    case 'sistema-pos':
      return (
        <div className="relative w-full rounded-2xl bg-[#091515] border border-emerald-500/25 p-4 overflow-hidden min-h-[300px] select-none text-left flex flex-col md:flex-row gap-4">
          {/* Eye-friendly: Emerald & Seafoam POS Theme */}
          <div className="flex-1 space-y-2">
            <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">🏪 Catálogo Frente de Loja</h4>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-950/90 border border-emerald-500/10 rounded-xl p-2 flex flex-col justify-between h-20 hover:border-emerald-500/30">
                <div>
                  <p className="text-[9px] font-black text-white truncate">Arroz Nacional 5kg</p>
                  <p className="text-[7px] text-slate-450 mt-0.5">FAMÍLIA ALIMENTAR</p>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[9px] font-black text-emerald-400">350.00 MT</span>
                  <span className="text-[7px] bg-emerald-500/10 text-emerald-300 px-1.5 py-0.5 rounded font-mono font-bold">Qtd: 15</span>
                </div>
              </div>
              <div className="bg-slate-950/90 border border-emerald-500/10 rounded-xl p-2 flex flex-col justify-between h-20 hover:border-emerald-500/30">
                <div>
                  <p className="text-[9px] font-black text-white truncate">Óleo Alimentar 1L</p>
                  <p className="text-[7px] text-slate-450 mt-0.5">FAMÍLIA ALIMENTAR</p>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[9px] font-black text-emerald-400">120.00 MT</span>
                  <span className="text-[7px] bg-emerald-500/10 text-emerald-300 px-1.5 py-0.5 rounded font-mono font-bold">Qtd: 84</span>
                </div>
              </div>
            </div>
            <div className="bg-slate-950/40 p-2 rounded-xl flex items-center justify-between border border-emerald-500/5 text-[9px]">
              <span className="text-slate-400 font-bold">Modo de Venda:</span>
              <span className="px-2 py-0.5 bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-[8px] font-black rounded-lg">VAREJO / RETALHO</span>
            </div>
          </div>

          <div className="w-full md:w-56 bg-slate-950 rounded-xl border border-emerald-500/15 p-3 flex flex-col justify-between h-[230px] shadow-lg">
            <div className="space-y-1.5 overflow-hidden flex-1">
              <span className="text-[8px] text-emerald-400 font-black">CARRINHO ACTIVO</span>
              <div className="flex items-center justify-between border-b border-emerald-500/10 pb-1 text-[9px]">
                <span className="truncate text-white">1x Arroz Nacional</span>
                <span className="font-bold text-slate-300 font-mono">350.00 MT</span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-dashed border-emerald-500/20 text-[10px] font-black text-emerald-300">
                <span>TOTAL A PAGAR:</span>
                <span className="font-mono">350.00 MT</span>
              </div>
            </div>
            <div className="space-y-1 pt-2 border-t border-slate-800">
              <button className="w-full py-1 bg-emerald-600 text-white font-black text-[9px] rounded-lg shadow uppercase hover:bg-emerald-500 tracking-wide">PAGAR COM M-PESA</button>
              <div className="flex items-center gap-1">
                <span className="text-[8px] text-slate-400">Fatura p/ WhatsApp:</span>
                <input type="text" readOnly value="+258 84 123 4567" className="bg-[#0C2624] text-[8px] font-bold text-emerald-300 border border-emerald-500/10 rounded px-1 py-0.5 max-w-[90px]" />
              </div>
            </div>
          </div>

          {/* Arrows */}
          <AnnotationArrow startX={25} startY={28} endX={120} endY={125} label="Tabela Mudança Grosso/Retalho" accentColor="border-emerald-500 text-emerald-300 bg-emerald-950/95" />
          <AnnotationArrow startX={75} startY={55} endX={230} endY={190} label="Liquidação M-Pesa Directa" accentColor="border-emerald-500 text-emerald-300 bg-emerald-950/95" />
        </div>
      );

    case 'inventario':
      return (
        <div className="relative w-full rounded-2xl bg-[#09151B] border border-sky-500/25 p-4 overflow-hidden min-h-[290px] select-none text-left">
          {/* Eye-friendly: Cyan & Ice Blue Logistics Theme */}
          <div className="flex items-center justify-between border-b border-sky-500/10 pb-1.5 mb-3">
            <h4 className="text-[10px] font-black text-sky-400 uppercase tracking-widest flex items-center gap-1">📦 Painel Auxiliar de Stock</h4>
            <span className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 text-[8px] font-bold uppercase tracking-wider">Ajuste de Lotes</span>
          </div>

          <div className="overflow-x-auto bg-slate-950 p-2 rounded-xl border border-sky-500/10">
            <table className="w-full text-left text-[9px]">
              <thead>
                <tr className="border-b border-sky-500/15 text-slate-400 font-bold">
                  <th className="p-1 pb-1.5">MERCADORIA / ARTIGO</th>
                  <th className="p-1 pb-1.5">SKU / CÓDIGO</th>
                  <th className="p-1 pb-1.5">STOCK REAL</th>
                  <th className="p-1 pb-1.5">MÍNIMO CRÍTICO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sky-500/5 text-white">
                <tr>
                  <td className="p-2 font-black">Cimento Nacional 50Kg</td>
                  <td className="p-2 font-mono text-sky-305">CIM-50-NAC</td>
                  <td className="p-2 text-sky-300 font-mono">120 Sacas</td>
                  <td className="p-2 text-slate-400">10 Sacas</td>
                </tr>
                <tr className="bg-rose-500/5">
                  <td className="p-2 font-black text-rose-300">Açúcar Branco 1Kg</td>
                  <td className="p-2 font-mono text-slate-400">ACU-BR-1K</td>
                  <td className="p-2 text-rose-450 font-mono font-bold animate-pulse">2 Pacotes ⚠️</td>
                  <td className="p-2 text-sky-300 font-mono">15 Pacotes</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Arrows */}
          <AnnotationArrow startX={38} startY={25} endX={190} endY={125} label="Alerta de Stock Crítico" accentColor="border-sky-500 text-sky-300 bg-sky-950/95" />
          <AnnotationArrow startX={80} startY={28} endX={320} endY={115} label="Limite Configurado" accentColor="border-sky-500 text-sky-300 bg-sky-950/95" />
        </div>
      );

    case 'clientes':
      return (
        <div className="relative w-full rounded-2xl bg-[#08121C] border border-[#3E92B8]/25 p-4 overflow-hidden min-h-[300px] select-none text-left">
          {/* Eye-friendly: Deep Oceanic Teal Theme */}
          <div className="flex items-center justify-between border-b border-[#3E92B8]/10 pb-2 mb-3">
            <h4 className="text-[10px] font-black text-[#5BC0EB] uppercase tracking-widest flex items-center gap-1">👥 Ficha CRM de Conta Corrente</h4>
            <span className="px-2 py-0.5 rounded bg-[#3E92B8]/20 text-[#5BC0EB] text-[8px] font-bold">SILVER CLASS</span>
          </div>

          <div className="max-w-[420px] mx-auto bg-slate-950 border border-[#3E92B8]/15 rounded-2xl p-4 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-full bg-[#3E92B8]/15 border border-[#3E92B8]/30 text-[#5BC0EB] flex items-center justify-center font-black">MS</div>
                <div>
                  <h4 className="text-xs font-black text-white">Masceni Sabush</h4>
                  <p className="text-[8px] text-slate-400 font-mono">NUIT: 247854291 • Maputo</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[8px] text-slate-400 font-bold uppercase tracking-wider">Pontos Fidelidade</p>
                <p className="text-xs font-black text-amber-400">850 Pts 🥈 PRATA</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[9px] text-left pt-1">
              <div className="p-2 rounded-lg bg-[#3E92B8]/5 border border-[#3E92B8]/10">
                <p className="text-slate-400">Saldo por Liquidar:</p>
                <p className="text-xs font-black text-rose-455 font-mono">1,450.00 MT</p>
              </div>
              <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                <p className="text-slate-400">Ações de Resgate:</p>
                <button className="mt-1 w-full text-center py-1 bg-[#3E92B8] hover:bg-[#207AA3] text-white text-[8px] rounded font-bold transition-all">LIGAR WHATSAPP</button>
              </div>
            </div>
          </div>

          <AnnotationArrow startX={20} startY={25} endX={120} endY={81} label="Indicador de Escalão do Cliente" accentColor="border-blue-500 text-blue-300 bg-blue-950/95" />
          <AnnotationArrow startX={82} startY={50} endX={310} endY={148} label="Saldo de Conta Devedora" accentColor="border-blue-500 text-blue-300 bg-blue-950/95" />
        </div>
      );

    case 'faturas':
      return (
        <div className="relative w-full rounded-2xl bg-[#091511] border border-emerald-500/25 p-4 overflow-hidden min-h-[310px] select-none text-left">
          {/* Eye-friendly: Clean Ivory and Emerald Ink layout (Document Feel) */}
          <div className="flex items-center justify-between border-b border-emerald-500/10 pb-1.5 mb-3">
            <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1">📄 Motor de Emissão Documental</h4>
            <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[8px] font-bold uppercase tracking-wider">A4 PDF Impresso</span>
          </div>

          <div className="max-w-[320px] mx-auto bg-[#FDFEFC] text-slate-900 rounded-lg p-5 shadow-inner border border-emerald-500/5 text-[9px] relative font-serif">
            {/* Stamp Logo */}
            <div className="absolute right-4 top-4 border-2 border-emerald-600 border-dashed text-emerald-600 px-2 py-1 transform rotate-12 text-[7px] font-black tracking-widest uppercase">
              SABUSH VERIFIED
            </div>

            <div className="border-b border-slate-200 pb-2 mb-3">
              <h5 className="font-sans font-black text-[11px] leading-tight text-slate-800">SABUSH SISTEMAS LIMITADA</h5>
              <p className="text-[7px] text-slate-500 leading-none mt-1 font-sans">Av. de Moçambique, Cidade de Maputo • NUIT 40488211</p>
            </div>

            <div className="text-[8px] text-slate-600 font-sans space-y-0.5 mb-3">
              <p>Nº DO DOCUMENTO: <span className="font-bold text-slate-900">FT-2026/0488</span></p>
              <p>CLIENTE: <span className="font-bold text-slate-900">MASCENI SABUSH</span></p>
              <p>DATA DE OPERAÇÃO: <span className="font-bold">2026-06-15 11:48</span></p>
            </div>

            <table className="w-full text-left font-sans text-[7px] mt-2 border-t border-slate-200">
              <thead>
                <tr className="border-b border-slate-200 text-slate-550">
                  <th className="py-1">ARTIGO</th>
                  <th className="py-1 text-right">QTD</th>
                  <th className="py-1 text-right">PREÇO</th>
                  <th className="py-1 text-right">SUBTOTAL</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-100">
                  <td className="py-1">Arroz Nacional 5kg</td>
                  <td className="py-1 text-right">1</td>
                  <td className="py-1 text-right">350.00</td>
                  <td className="py-1 text-right">350.00 MT</td>
                </tr>
              </tbody>
            </table>

            <div className="text-right font-sans text-[8px] font-black text-slate-800 pt-2 float-right pb-1">
              TOTAL LIQUIDADO: 350.00 MT
            </div>
            <div className="clear-both"></div>
          </div>

          <AnnotationArrow startX={18} startY={28} endX={110} endY={105} label="Identificador Sequencial Único" accentColor="border-emerald-500 text-emerald-300 bg-emerald-950/95" />
          <AnnotationArrow startX={82} startY={50} endX={265} endY={174} label="Selo Digital Termos Grupo" accentColor="border-emerald-500 text-emerald-300 bg-emerald-950/95" />
        </div>
      );

    case 'registar-pagamento':
      return (
        <div className="relative w-full rounded-2xl bg-[#141208] border border-yellow-500/25 p-4 overflow-hidden min-h-[290px] select-none text-left">
          {/* Eye-friendly: Financial Amber Gold */}
          <div className="flex items-center justify-between border-b border-yellow-500/10 pb-1.5 mb-3">
            <h4 className="text-[10px] font-black text-yellow-400 uppercase tracking-widest flex items-center gap-1">💸 Liquidação de Dívidas / Amortização</h4>
            <span className="px-2 py-0.5 rounded bg-yellow-500/15 text-yellow-300 text-[8px] font-bold uppercase tracking-wider">CAIXA ACTIVO</span>
          </div>

          <div className="max-w-[280px] mx-auto bg-slate-950 border border-yellow-500/15 rounded-xl p-4 shadow-xl space-y-3.5 text-[10px]">
            <div className="p-2 border border-slate-800 bg-slate-900 rounded-lg flex justify-between items-center text-white">
              <span>Valor por Pagar:</span>
              <span className="font-mono font-black text-rose-400">1,450.00 MT</span>
            </div>
            <div className="space-y-1">
              <label className="text-slate-400 text-[8px] uppercase font-bold">Introduzir Amortização:</label>
              <input type="text" readOnly value="1,000.00" className="w-full bg-[#0C2624] font-mono border border-yellow-500/20 text-yellow-300 p-2 rounded-lg text-right font-black" />
            </div>
            <div className="flex items-center justify-between text-[8px] text-slate-400 font-bold bg-[#1C1808] p-1.5 rounded-md border border-yellow-500/10">
              <span>Tipo de Registo:</span>
              <span className="text-yellow-400">AMORTIZAÇÃO PARCIAL</span>
            </div>
            <button className="w-full py-2 bg-yellow-500 hover:bg-yellow-400 text-slate-950 font-black text-[9px] rounded-lg tracking-wider">AUTORIZAR CRÉDITO</button>
          </div>

          <AnnotationArrow startX={15} startY={30} endX={100} endY={115} label="Saldo Restante recalculado" accentColor="border-yellow-500 text-yellow-300 bg-yellow-950/95" />
          <AnnotationArrow startX={82} startY={60} endX={190} endY={130} label="Introduzir Adiantamento" accentColor="border-yellow-500 text-yellow-300 bg-yellow-950/95" />
        </div>
      );

    case 'gestao-dividas':
      return (
        <div className="relative w-full rounded-2xl bg-[#14080F] border border-rose-500/25 p-4 overflow-hidden min-h-[300px] select-none text-left">
          {/* Eye-friendly: Crimson Red & Ruby Warning theme */}
          <div className="flex items-center justify-between border-b border-rose-500/10 pb-1.5 mb-3">
            <h4 className="text-[10px] font-black text-rose-400 uppercase tracking-widest flex items-center gap-1">💳 Painel Integrado de Inadimplência</h4>
            <span className="px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 text-[8px] font-bold">CONTAS EXIGÍVEIS</span>
          </div>

          <div className="bg-slate-950 rounded-xl p-3 border border-rose-500/10 text-[9px] space-y-2 max-w-[420px] mx-auto">
            <div className="flex justify-between items-center bg-[#15090F] p-2.5 rounded-lg border border-rose-500/20">
              <div className="space-y-0.5">
                <p className="font-black text-white">João Maputo • NUIT 101018</p>
                <p className="text-[7px] text-rose-300 font-bold tracking-wider uppercase font-mono">Dívida há 45 Dias</p>
              </div>
              <div className="text-right">
                <p className="font-mono font-black text-rose-400 text-xs">14,500.00 MT</p>
                <button className="mt-1 px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white font-heavy text-[8px] rounded uppercase flex items-center gap-1">
                  ✉️ Cobrar WhatsApp
                </button>
              </div>
            </div>
            <p className="text-[7.5px] text-slate-500 text-center font-mono select-none">Balanço das contas correntes em atraso: 14,500.00 MZN</p>
          </div>

          <AnnotationArrow startX={25} startY={30} endX={120} endY={100} label="Vencimento Crítico" accentColor="border-rose-500 text-rose-300 bg-rose-950/95" />
          <AnnotationArrow startX={82} startY={55} endX={320} endY={105} label="Alerta Directo de Cobrança" accentColor="border-rose-500 text-rose-300 bg-rose-950/95" />
        </div>
      );

    case 'cotacoes':
      return (
        <div className="relative w-full rounded-2xl bg-[#091115] border border-cyan-500/25 p-4 overflow-hidden min-h-[290px] select-none text-left">
          {/* Eye-friendly: Steel Blue Quote sheet */}
          <div className="flex items-center justify-between border-b border-cyan-500/10 pb-1.5 mb-3">
            <h4 className="text-[10px] font-black text-cyan-400 uppercase tracking-widest flex items-center gap-1">📋 Orçamentos e Cotações Proforma</h4>
            <span className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 text-[8px] font-bold uppercase tracking-wider">Pró-Forma</span>
          </div>

          <div className="max-w-[340px] mx-auto bg-slate-950 border border-cyan-500/15 rounded-xl p-4 shadow-xl space-y-3.5 text-[9px]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div>
                <p className="font-black text-white">Cotação Nº QT-992</p>
                <p className="text-[7px] text-slate-450 mt-0.5">Validade: 7 Dias úteis</p>
              </div>
              <div className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 text-[8px] font-mono">Sem Impacto de Stock</div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between font-mono text-slate-300">
                <span>10x Cimento Nacional</span>
                <span>3,500.00 MT</span>
              </div>
            </div>
            <button className="w-full py-1.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-black text-[9px] rounded-lg shadow-md uppercase tracking-wider">CONVERTER PARA FATURA DEFINITIVA</button>
          </div>

          <AnnotationArrow startX={18} startY={28} endX={110} endY={80} label="Design Proforma Isolado" accentColor="border-cyan-500 text-cyan-300 bg-cyan-950/95" />
          <AnnotationArrow startX={82} startY={55} endX={215} endY={152} label="Upgrade Directo de 1-Clique" accentColor="border-cyan-500 text-cyan-300 bg-cyan-950/95" />
        </div>
      );

    case 'encomendas-online':
      return (
        <div className="relative w-full rounded-2xl bg-[#110915] border border-purple-500/25 p-4 overflow-hidden min-h-[300px] select-none text-left">
          {/* Eye-friendly: Royal Purple Web Orders Theme */}
          <div className="flex items-center justify-between border-b border-purple-500/10 pb-1.5 mb-3">
            <h4 className="text-[10px] font-black text-purple-400 uppercase tracking-widest flex items-center gap-1">🛒 Pedidos Entrada Loja Digital</h4>
            <span className="px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 text-[8px] font-bold">WEB INCOMING</span>
          </div>

          <div className="max-w-[420px] mx-auto bg-slate-950 rounded-xl p-3 border border-purple-500/15 text-[9px] space-y-2.5">
            <div className="flex justify-between items-center bg-[#110915]/80 p-2.5 rounded-lg border border-purple-500/20">
              <div className="space-y-0.5">
                <span className="text-[7.5px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded font-bold font-mono">ENCOMENDA #W-1044</span>
                <p className="font-black text-white mt-1">Cliente: Mercado Sabush • Maputo Delivery</p>
                <p className="text-[7px] text-slate-455 font-mono">Liquidado por e-Mola Integrado</p>
              </div>
              <div className="text-right space-y-1.5">
                <p className="font-mono font-black text-purple-300 text-xs">3,500 MT</p>
                <div className="flex gap-1 justify-end">
                  <button className="px-2 py-0.5 bg-emerald-600 text-white font-bold text-[8px] rounded uppercase">✓ APROVAR</button>
                  <button className="px-2 py-0.5 bg-slate-800 text-slate-400 font-bold text-[8px] rounded uppercase">❌</button>
                </div>
              </div>
            </div>
          </div>

          <AnnotationArrow startX={25} startY={28} endX={120} endY={100} label="Canal Irmão Mercado Sabush" accentColor="border-purple-500 text-purple-300 bg-purple-950/95" />
          <AnnotationArrow startX={82} startY={60} endX={355} endY={112} label="Aprovação e Atualização de Stock" accentColor="border-purple-500 text-purple-300 bg-purple-950/95" />
        </div>
      );

    case 'despesas':
      return (
        <div className="relative w-full rounded-2xl bg-[#150909] border border-rose-400/25 p-4 overflow-hidden min-h-[300px] select-none text-left">
          {/* Eye-friendly: Coral Peach Expense log */}
          <div className="flex items-center justify-between border-b border-rose-400/10 pb-1.5 mb-3">
            <h4 className="text-[10px] font-black text-rose-300 uppercase tracking-widest flex items-center gap-1">💸 Livro de Saídas Financeiras</h4>
            <span className="px-2 py-0.5 rounded bg-rose-450/15 text-rose-350 text-[8px] font-bold">DESPESA ATIVA</span>
          </div>

          <div className="max-w-[420px] mx-auto bg-slate-950 border border-rose-400/15 rounded-xl p-3.5 space-y-3 text-[9px]">
            <div className="grid grid-cols-3 gap-2 text-center text-white">
              <div className="p-2 rounded bg-slate-900 border border-slate-800">
                <p className="text-slate-400 text-[7px] uppercase font-bold">Água & Luz</p>
                <p className="font-black text-rose-300 mt-1">4,200 MT</p>
              </div>
              <div className="p-2 rounded bg-[#1C0909] border border-rose-400/15">
                <p className="text-slate-400 text-[7px] uppercase font-bold">Rendas</p>
                <p className="font-black text-rose-300 mt-1">25,000 MT</p>
              </div>
              <div className="p-2 rounded bg-slate-900 border border-slate-800">
                <p className="text-slate-400 text-[7px] uppercase font-bold">Salários</p>
                <p className="font-black text-rose-300 mt-1">45,000 MT</p>
              </div>
            </div>
            <div className="p-2 border border-slate-800 bg-slate-900/60 rounded flex justify-between items-center text-slate-400">
              <span className="font-semibold text-white">📎 Recibo_Renda_Junho.pdf</span>
              <span className="text-[8px] bg-slate-800 px-2 py-0.5 rounded text-slate-300">Carregado ✓</span>
            </div>
          </div>

          <AnnotationArrow startX={18} startY={30} endX={180} endY={100} label="Separação por Categoria de Custo" accentColor="border-rose-450 text-rose-300 bg-rose-950/95" />
          <AnnotationArrow startX={82} startY={60} endX={320} endY={142} label="Comprovativo Anexado Auditável" accentColor="border-rose-450 text-rose-300 bg-rose-950/95" />
        </div>
      );

    case 'fornecedores':
      return (
        <div className="relative w-full rounded-2xl bg-[#0F1115] border border-slate-500/25 p-4 overflow-hidden min-h-[290px] select-none text-left">
          {/* Eye-friendly: Slate Gray Logistics */}
          <div className="flex items-center justify-between border-b border-slate-500/10 pb-1.5 mb-3">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">🏭 Diretório Geral de Parceiros Distribuição</h4>
            <span className="px-2 py-0.5 rounded bg-slate-500/15 text-slate-350 text-[8px] font-bold uppercase tracking-wider font-mono">B2B SUPPLIERS</span>
          </div>

          <div className="max-w-[420px] mx-auto bg-slate-950 border border-slate-500/15 rounded-xl p-3 text-[9px] space-y-2">
            <div className="flex justify-between items-center bg-[#15171B] p-2.5 rounded-lg border border-slate-500/20">
              <div className="space-y-0.5">
                <p className="font-black text-white">Moçambique Distribuidora Limitada</p>
                <p className="text-[7.5px] text-slate-400 font-mono">NUIT: 400921102 • Maputo Armazéns</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-slate-400">Balancete Geral:</p>
                <p className="font-mono font-black text-slate-300 text-xs">25,800.00 MT</p>
              </div>
            </div>
          </div>

          <AnnotationArrow startX={25} startY={28} endX={120} endY={100} label="Informações Empresariais NUIT" accentColor="border-slate-500 text-slate-300 bg-slate-950/95" />
          <AnnotationArrow startX={82} startY={55} endX={350} endY={112} label="Controle de Contas a Pagar" accentColor="border-slate-500 text-slate-300 bg-slate-950/95" />
        </div>
      );

    case 'ordens-compra':
      return (
        <div className="relative w-full rounded-2xl bg-[#140E0A] border border-orange-500/25 p-4 overflow-hidden min-h-[300px] select-none text-left">
          {/* Eye-friendly: Bronze Copper Theme */}
          <div className="flex items-center justify-between border-b border-orange-500/10 pb-1.5 mb-3">
            <h4 className="text-[10px] font-black text-orange-400 uppercase tracking-widest flex items-center gap-1">🛍️ Abastecimento de Armazém (Procurement)</h4>
            <span className="px-2 py-0.5 rounded bg-orange-500/15 text-orange-300 text-[8px] font-bold uppercase tracking-wider">RECEPÇÃO FÍSICAL</span>
          </div>

          <div className="max-w-[360px] mx-auto bg-slate-950 border border-orange-500/15 rounded-xl p-3.5 space-y-3 text-[9px]">
            <div className="flex justify-between items-center font-mono">
              <div>
                <p className="font-black text-white">Ordem PO-0994</p>
                <p className="text-[7.5px] text-orange-400 font-bold">Estado: Aguardando Entrega comercial</p>
              </div>
              <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">Total: 100 Itens</span>
            </div>
            <button className="w-full py-1.5 bg-orange-600 hover:bg-orange-500 text-white font-heavy text-[9.5px] rounded-lg shadow uppercase">Confirmar Entrada de Mercadoria</button>
          </div>

          <AnnotationArrow startX={20} startY={28} endX={110} endY={81} label="Mapeador de Envio PO" accentColor="border-orange-500 text-orange-300 bg-orange-950/95" />
          <AnnotationArrow startX={82} startY={52} endX={220} endY={130} label="Carregamento Stock Automatizado" accentColor="border-orange-500 text-orange-300 bg-orange-950/95" />
        </div>
      );

    case 'reports':
      return (
        <div className="relative w-full rounded-2xl bg-[#091512] border border-[#2EA44F]/25 p-4 overflow-hidden min-h-[310px] select-none text-left">
          {/* Eye-friendly: Vivid Sage and Emerald Analytics */}
          <div className="flex items-center justify-between border-b border-[#2EA44F]/10 pb-1.5 mb-3">
            <h4 className="text-[10px] font-black text-[#2EA44F] uppercase tracking-widest flex items-center gap-1">📊 Consolidação Analítica de Auditoria</h4>
            <span className="px-2 py-0.5 rounded bg-[#2EA44F]/15 text-[#2EA44F] text-[8px] font-bold">BI REALTIME</span>
          </div>

          <div className="max-w-[420px] mx-auto grid grid-cols-2 gap-3 text-[9px]">
            <div className="p-3 rounded-xl bg-slate-950 border border-[#2EA44F]/15 space-y-2">
              <span className="text-slate-400 text-[8px] uppercase font-black">Faturamento Comercial Mensal</span>
              <p className="text-sm font-black text-[#2EA44F] font-mono">151,350 MT</p>
              <span className="text-[7.5px] text-emerald-400 font-bold font-mono">📈 +24.5% versus mês anterior</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
              <span className="text-slate-400 text-[8px] uppercase font-black">Sugestão Automática IA:</span>
              <p className="text-slate-300 leading-normal text-[8.5px]">"Artigo Açúcar Branco está com saída 45% mais rápida. Sugerimos incrementar margens ou ordens PO."</p>
            </div>
          </div>

          <AnnotationArrow startX={18} startY={32} endX={110} endY={120} label="Indicador de Tendência do Volume" accentColor="border-green-500 text-green-300 bg-green-950/95" />
          <AnnotationArrow startX={82} startY={60} endX={315} endY={125} label="Diretivas AI Advisor Moçambique" accentColor="border-green-500 text-green-300 bg-green-950/95" />
        </div>
      );

    case 'equipa':
      return (
        <div className="relative w-full rounded-2xl bg-[#091515] border border-teal-500/25 p-4 overflow-hidden min-h-[305px] select-none text-left">
          {/* Eye-friendly: Deep Teal Security */}
          <div className="flex items-center justify-between border-b border-teal-500/10 pb-1.5 mb-3">
            <h4 className="text-[10px] font-black text-teal-400 uppercase tracking-widest flex items-center gap-1">👨‍👩‍👧 Perfis, Roles e Restrições de Operador</h4>
            <span className="px-2 py-0.5 rounded bg-teal-500/15 text-teal-300 text-[8px] font-bold uppercase tracking-wider">ACL SECURITY</span>
          </div>

          <div className="max-w-[420px] mx-auto bg-slate-950 border border-teal-500/15 rounded-xl p-3.5 space-y-3 text-[9px]">
            <div className="flex justify-between items-center bg-[#091515] p-2 rounded border border-teal-500/20">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-450 animate-pulse" />
                <p className="font-black text-white">Sara Langa • Caixa Balcão</p>
              </div>
              <span className="px-2 py-0.5 rounded bg-[#0C2624] border border-slate-800 text-[7px] text-teal-305 font-bold uppercase">Acesso Bloqueado a Preços</span>
            </div>
            <div className="p-2 border border-slate-800 bg-slate-900 rounded font-mono text-[8px] text-slate-400 leading-normal">
              🔓 PIN De Gestor Exigido para Estornar Artigos No POS.
            </div>
          </div>

          <AnnotationArrow startX={25} startY={28} endX={145} endY={92} label="Nível Funcional Restrito" accentColor="border-teal-500 text-teal-305 bg-teal-950/95" />
          <AnnotationArrow startX={82} startY={55} endX={310} endY={125} label="PIN Verificação Estorno local" accentColor="border-teal-500 text-teal-305 bg-teal-950/95" />
        </div>
      );

    case 'configuracoes':
      return (
        <div className="relative w-full rounded-2xl bg-[#081119] border border-[#2483D0]/25 p-4 overflow-hidden min-h-[300px] select-none text-left">
          {/* Eye-friendly: Electric Carbon Settings */}
          <div className="flex items-center justify-between border-b border-[#2483D0]/10 pb-1.5 mb-3">
            <h4 className="text-[10px] font-black text-[#2483D0] uppercase tracking-widest flex items-center gap-1">⚙️ Definições de Envio WhatsApp e Perfil</h4>
            <span className="px-2 py-0.5 rounded bg-[#2483D0]/15 text-[#2483D0] text-[8px] font-bold">API PANEL</span>
          </div>

          <div className="max-w-[340px] mx-auto bg-slate-950 border border-[#2483D0]/15 rounded-xl p-4 shadow-xl space-y-3 text-[9px] text-white">
            <div className="space-y-1">
              <label className="text-slate-400 text-[8px] uppercase font-bold">Token de Comunicação WhatsApp da Meta:</label>
              <input type="text" readOnly value="EAAG678aZBd90BAKlz8O6R..." className="w-full bg-[#0C2624] font-mono border border-[#2483D0]/20 text-sky-400 p-2 rounded-lg" />
            </div>
            <div className="flex gap-2">
              <button className="flex-1 py-1.5 bg-[#2483D0] hover:bg-[#1C6BAA] text-slate-950 font-black rounded text-[8.5px] uppercase">Testar Envio</button>
              <button className="flex-1 py-1.5 bg-slate-900 hover:bg-slate-850 text-white font-bold border border-slate-800 rounded text-[8.5px] uppercase">Criar Backup ZIP</button>
            </div>
          </div>

          <AnnotationArrow startX={18} startY={28} endX={110} endY={95} label="Configurador WhatsApp Cloud Meta" accentColor="border-blue-500 text-blue-300 bg-blue-950/95" />
          <AnnotationArrow startX={82} startY={58} endX={255} endY={148} label="Isolamento de Base de Dados" accentColor="border-blue-500 text-blue-300 bg-blue-950/95" />
        </div>
      );

    case 'resolucao-problemas':
      return (
        <div className="relative w-full rounded-2xl bg-[#140812] border border-[#DE40B0]/25 p-4 overflow-hidden min-h-[300px] select-none text-left">
          {/* Eye-friendly: Fuchsia Self-Healing check */}
          <div className="flex items-center justify-between border-b border-[#DE40B0]/10 pb-1.5 mb-3">
            <h4 className="text-[10px] font-black text-[#DE40B0] uppercase tracking-widest flex items-center gap-1">❓ Auto-Diagnóstico de Ligação Interna</h4>
            <span className="px-2 py-0.5 rounded bg-[#DE40B0]/15 text-[#DE40B0] text-[8px] font-bold uppercase tracking-wider">SUPPORT BOT</span>
          </div>

          <div className="max-w-[420px] mx-auto bg-slate-950 rounded-xl p-3 border border-[#DE40B0]/15 text-[9px] space-y-2">
            <div className="grid grid-cols-3 gap-2 font-mono text-center text-white">
              <div className="p-2 rounded bg-slate-900 border border-slate-800 flex flex-col justify-between h-14">
                <span className="text-slate-400 text-[6.5px]">FIRESTORE</span>
                <span className="text-[8.5px] text-emerald-450 font-black">ONLINE ●</span>
              </div>
              <div className="p-2 rounded bg-slate-900 border border-slate-800 flex flex-col justify-between h-14">
                <span className="text-slate-400 text-[6.5px]">LOCAL CACHE</span>
                <span className="text-[8.5px] text-emerald-450 font-black">STABLE ●</span>
              </div>
              <div className="p-2 rounded bg-slate-900 border border-slate-800 flex flex-col justify-between h-14">
                <span className="text-slate-400 text-[6.5px]">AUTHENTICATOR</span>
                <span className="text-[8.5px] text-[#DE40B0] font-black">VALID ●</span>
              </div>
            </div>
            <button className="w-full text-center py-1.5 bg-[#DE40B0]/10 hover:bg-[#DE40B0]/20 text-[#DE40B0] rounded border border-[#DE40B0]/30 font-bold uppercase text-[8px]">RESTAURAR SESSÃO DE CONEXÃO</button>
          </div>

          <AnnotationArrow startX={25} startY={28} endX={140} endY={98} label="Diagnóstico de Rede Cloud" accentColor="border-pink-500 text-pink-300 bg-pink-950/95" />
          <AnnotationArrow startX={82} startY={60} endX={215} endY={152} label="Auto-Correção Chaves de Acesso" accentColor="border-pink-500 text-pink-300 bg-pink-950/95" />
        </div>
      );

    case 'boas-praticas':
      return (
        <div className="relative w-full rounded-2xl bg-[#091512] border border-emerald-400/25 p-4 overflow-hidden min-h-[300px] select-none text-left">
          {/* Eye-friendly: Mint Audit layout */}
          <div className="flex items-center justify-between border-b border-emerald-400/10 pb-1.5 mb-3">
            <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1">💡 Rotina de Auditoria de Gaveta Diária</h4>
            <span className="px-2 py-0.5 rounded bg-emerald-400/15 text-emerald-300 text-[8px] font-bold">BEST PRACTICE</span>
          </div>

          <div className="max-w-[420px] mx-auto bg-slate-950 border border-emerald-400/15 rounded-xl p-3.5 space-y-3.5 text-[9px] text-slate-300">
            <span className="text-[7.5px] font-black text-emerald-305 tracking-widest uppercase">CONFERÊNCIA DE FECHO</span>
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-white border-b border-slate-800 pb-1">
                <span>Total Dinheiro Registado al Balcão:</span>
                <span className="font-mono font-bold">14,250.00 MT</span>
              </div>
              <div className="flex justify-between items-center font-mono">
                <span>Contagem Física Declarada:</span>
                <span className="text-emerald-305 font-heavy">14,250.00 MT ✓ MATCH</span>
              </div>
            </div>
            <p className="text-[7.5px] text-slate-500 leading-normal italic text-center">Reconciliação e-Mola / M-Pesa fechada automaticamente pelo servidor do Grupo Sabush.</p>
          </div>

          <AnnotationArrow startX={25} startY={30} endX={145} endY={100} label="Validação de Notas de Caixa" accentColor="border-green-500 text-green-300 bg-green-950/95" />
          <AnnotationArrow startX={82} startY={55} endX={350} endY={112} label="Reconciliação Fechada a 100%" accentColor="border-green-500 text-green-300 bg-green-950/95" />
        </div>
      );

    case 'portal-cliente':
      return (
        <div className="relative w-full rounded-2xl bg-[#0b1622] border border-amber-500/25 p-4 overflow-hidden min-h-[460px] select-none text-left flex flex-col lg:flex-row gap-4">
          {/* Eye-friendly: Cyber Azure Gold & Deep Space Theme */}
          
          {/* left column: Portal do Cliente view */}
          <div className="flex-1 bg-slate-950/90 rounded-2xl border border-amber-500/15 p-4 shadow-xl space-y-3.5 relative flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-2">
                <div>
                  <h5 className="text-[10px] font-black text-amber-400 uppercase tracking-wider">Masceni Sabush Portal</h5>
                  <p className="text-[7px] text-slate-400">Cliente Silver • Conta Corrente Activa</p>
                </div>
                <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[8px] font-bold font-mono">Dívida: 1,450 MT</span>
              </div>

              {/* Upload Form Mockup */}
              <div className="bg-slate-900/60 p-2.5 rounded-xl border border-white/5 space-y-2">
                <span className="text-[7.5px] uppercase tracking-wider font-extrabold text-slate-400 block font-mono">ENVIAR COMPROVATIVO DE LIQUIDAÇÃO</span>
                
                <div className="grid grid-cols-2 gap-1.5 text-[8px]">
                  <div>
                    <label className="text-slate-450 font-bold block mb-0.5">Valor Pago (MZN)</label>
                    <input type="text" readOnly value="1,000.00" className="w-full bg-slate-950 border border-amber-500/20 text-amber-300 px-1.5 py-1 rounded text-[8px] font-mono font-bold" />
                  </div>
                  <div>
                    <label className="text-slate-450 font-bold block mb-0.5">Ref. Transação (M-Pesa/Banco)</label>
                    <input type="text" readOnly value="MPW90823719" className="w-full bg-slate-950 border border-white/10 text-slate-200 px-1.5 py-1 rounded text-[8px] font-mono" />
                  </div>
                </div>

                {/* Drag-and-drop Image Upload Zone Mockup */}
                <div className="border border-dashed border-amber-500/30 bg-amber-500/5 rounded-lg p-3 text-center cursor-pointer hover:border-amber-500/50 transition-colors">
                  <div className="w-6 h-6 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto text-xs mb-1">📸</div>
                  <p className="text-[7.5px] font-black text-slate-200 font-mono">comprovativo_mpesa.png</p>
                  <p className="text-[6.5px] text-slate-450 mt-0.5">Resolução: 1340x820px • 135 KB ✓ Comprimido</p>
                </div>

                <button className="w-full py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-[8px] font-black rounded-lg tracking-wide transition-colors">SUBMETER COMPROVATIVO AUTOMÁTICO</button>
              </div>
            </div>

            <div className="space-y-1.5 border-t border-white/5 pt-2">
              <p className="text-[7px] text-slate-400 font-extrabold uppercase font-mono tracking-wider">Histórico Recente e Estado</p>
              <div className="flex justify-between items-center bg-amber-500/10 p-1.5 rounded-lg border border-amber-500/20 text-[7.5px]">
                <span className="font-bold text-slate-350">Adiantamento Fatura #0488</span>
                <span className="bg-amber-500/20 text-amber-300 font-bold px-1.5 py-0.5 rounded-full text-[6.5px] font-mono animate-pulse">PENDENTE NO GESTOR</span>
              </div>
            </div>
          </div>

          {/* right column: Backoffice Operador View (The validation terminal) */}
          <div className="flex-1 bg-slate-950/70 rounded-2xl border border-blue-500/15 p-4 shadow-xl space-y-3.5 relative flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-2">
                <div>
                  <h5 className="text-[10px] font-black text-blue-400 uppercase tracking-wider">Backoffice de Auditoria</h5>
                  <p className="text-[7px] text-slate-450">Painel do Administrador • Caixa Balcão</p>
                </div>
                <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-300 text-[6.5px] rounded-md font-bold uppercase tracking-wider">1 Comprovativo p/ Validar</span>
              </div>

              {/* Validation Box in Operator Panel */}
              <div className="bg-slate-900 border border-blue-500/10 rounded-xl p-2.5 space-y-2 text-[8px]">
                <p className="font-black text-white flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
                  Pedido de Validação Recebido
                </p>
                
                <div className="bg-slate-950 p-2 rounded-lg border border-white/5 space-y-1">
                  <div className="flex justify-between text-slate-400">
                    <span>Cliente:</span>
                    <span className="font-bold text-white">Masceni Sabush</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Fatura Alvo:</span>
                    <span className="font-bold text-blue-300">Fatura #0488</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Valor Declarado:</span>
                    <span className="font-bold text-emerald-300 font-mono">1,000.00 MT</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Canal Informado:</span>
                    <span className="font-bold text-slate-200">M-PESA PRESTIGE</span>
                  </div>
                </div>

                <div className="flex gap-1.5 pt-1">
                  <button className="flex-1 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded text-[7.5px] uppercase">✓ VALIDAR & LANÇAR</button>
                  <button className="flex-1 py-1 bg-rose-600 hover:bg-rose-500 text-white font-black rounded text-[7.5px] uppercase">✗ RECUSAR</button>
                </div>
              </div>
            </div>

            <div className="p-2 border border-blue-500/10 bg-blue-950/20 rounded text-[7px] text-slate-350 leading-normal">
              💡 <strong>Lançamento Inteligente:</strong> Ao clicar em <strong>Validar</strong>, o Sabush ERP adiciona o crédito, abate o saldo da fatura, emite o recibo digital original e notifica o cliente automaticamente. Nada de processos manuais lentos!
            </div>
          </div>

          {/* Detailed floating indicators */}
          <AnnotationArrow startX={18} startY={35} endX={110} endY={150} label="Introdução de Dados e Anexo" accentColor="border-amber-400 text-amber-300 bg-amber-950/95" />
          <AnnotationArrow startX={52} startY={45} endX={255} endY={120} label="Verificação no Backoffice com 1 Clique" accentColor="border-blue-400 text-blue-350 bg-blue-950/95" />
          <AnnotationArrow startX={82} startY={72} endX={355} endY={380} label="Lançamento Contabilístico Automático" accentColor="border-emerald-500 text-emerald-300 bg-emerald-950/95" />
        </div>
      );

    case 'unidades-medida':
      return (
        <div className="relative w-full rounded-2xl bg-[#091515] border border-cyan-500/25 p-4 overflow-hidden min-h-[310px] select-none text-left">
          {/* Eye-friendly: Cyan & Ivory Logistics layout */}
          <div className="flex items-center justify-between border-b border-cyan-500/10 pb-1.5 mb-3">
            <h4 className="text-[10px] font-black text-cyan-400 uppercase tracking-widest flex items-center gap-1">📐 Unidades Triplas & Conversão Híbrida</h4>
            <span className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 text-[8px] font-bold uppercase font-mono">AUTOMÁTICO & CUSTOMIZADO</span>
          </div>

          <div className="max-w-[420px] mx-auto bg-slate-950 border border-cyan-500/15 rounded-xl p-4 shadow-xl space-y-4">
            <div className="flex justify-between items-center bg-[#0d1e21] p-3 rounded-lg border border-cyan-500/15 text-[9px]">
              <div>
                <p className="text-slate-400 text-[7px] uppercase font-bold tracking-widest">Produto Selecionado</p>
                <p className="text-xs font-black text-white mt-1 font-sans">Cerveja Laurentina Preta (6x Pack/Cx)</p>
              </div>
              <div className="text-right">
                <span className="text-[8.5px] bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded font-black font-mono">Sabor Moçambicano</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-[8.5px] text-slate-300 font-mono">
              <div className="p-2 rounded bg-slate-900 border border-slate-800">
                <p className="text-slate-400 text-[7px] font-bold">CAIXA (Cx)</p>
                <p className="font-bold text-white mt-1 font-sans">1 Caixa</p>
                <p className="text-[7px] text-emerald-450 mt-0.5 font-bold font-mono">= 24 Unidades</p>
              </div>
              <div className="p-2 rounded bg-slate-900 border border-slate-800">
                <p className="text-slate-400 text-[7px] font-bold">EMBALAGEM (Emb)</p>
                <p className="font-bold text-white mt-1 font-sans">1 Pack</p>
                <p className="text-[7px] text-emerald-450 mt-0.5 font-bold font-mono">= 6 Unidades</p>
              </div>
              <div className="p-2 rounded bg-slate-900 border border-slate-800 bg-cyan-950/20 border-cyan-800/30">
                <p className="text-cyan-400 text-[7px] font-bold">UNIDADE (Un)</p>
                <p className="font-bold text-cyan-300 mt-1 font-sans">Unidade Base</p>
                <p className="text-[7px] text-cyan-450 mt-0.5 font-bold font-mono">= 1 Unidade</p>
              </div>
            </div>

            <div className="p-2 border border-slate-800 bg-slate-900/40 rounded text-[7.5px] text-slate-400 leading-relaxed font-sans">
              ⚡ <strong>Deteção Inteligente:</strong> Ao classificar o produto na categoria <strong>&quot;Bebidas&quot;</strong>, o ERP recomendou e configurou automaticamente este esquema de caixas de 24. No entanto, o gestor do estabelecimento tem total liberdade para alterá-lo manualmente!
            </div>
          </div>

          <AnnotationArrow startX={18} startY={28} endX={115} endY={95} label="Unidades Múltiplas Sincronizadas" accentColor="border-cyan-500 text-cyan-300 bg-cyan-950/95" />
          <AnnotationArrow startX={82} startY={62} endX={355} endY={148} label="Multiplicadores de Baixa" accentColor="border-cyan-500 text-cyan-300 bg-cyan-950/95" />
        </div>
      );

    case 'termos-grupo':
      return (
        <div className="relative w-full rounded-2xl bg-[#091515] border border-orange-500/25 p-4 overflow-hidden min-h-[310px] select-none text-left">
          {/* Eye-friendly: Obsidian Corporate Gold */}
          <div className="flex items-center justify-between border-b border-orange-500/10 pb-1.5 mb-4">
            <h4 className="text-[10px] font-black text-orange-400 uppercase tracking-widest flex items-center gap-1">🏢 Sinergias e Marcas do Grupo Sabush Ecosystem</h4>
            <span className="px-2 py-0.5 rounded bg-orange-500/15 text-orange-300 text-[8px] font-bold uppercase font-mono">ESTRUTURA CORPORATIVA</span>
          </div>

          {/* Sinergic visual chart scheme parent to subnodes with arrows */}
          <div className="bg-slate-950 border border-orange-500/15 rounded-xl p-4 max-w-[460px] mx-auto text-[9px] relative space-y-4">
            <div className="text-center">
              <div className="inline-block px-4 py-2 bg-gradient-to-r from-orange-600 to-amber-500 text-slate-950 font-black text-[10px] rounded-lg tracking-wider border border-orange-400">
                SABUSH GROUP (Grupo Sabush)
              </div>
              <p className="text-[7.5px] text-slate-405 mt-1 font-mono uppercase">Holding Master • Maputo, Moçambique</p>
            </div>

            <div className="grid grid-cols-3 gap-2.5 text-center text-white font-heavy pt-3">
              <div className="p-2 rounded bg-[#091515] border border-emerald-500/20 shadow flex flex-col justify-between h-18">
                <span className="text-[7.5px] text-emerald-400 font-bold uppercase tracking-wider font-mono">Plataforma 1</span>
                <span className="text-[9px] text-white">Mercado Sabush</span>
                <span className="text-[6.5px] text-slate-400">Marketplace Digital</span>
              </div>
              <div className="p-2 rounded bg-slate-900 border border-amber-500/20 shadow flex flex-col justify-between h-18">
                <span className="text-[7.5px] text-amber-400 font-bold uppercase tracking-wider font-mono">ERP Oficial</span>
                <span className="text-[9px] text-white">Sabush System ERP</span>
                <span className="text-[6.5px] text-slate-405">Gestão de PMEs</span>
              </div>
              <div className="p-2 rounded bg-[#110915] border-purple-500/20 shadow flex flex-col justify-between h-18">
                <span className="text-[7.5px] text-purple-400 font-bold uppercase tracking-wider font-mono">Ensino Regional</span>
                <span className="text-[9px] text-white">Sabush English</span>
                <span className="text-[6.5px] text-slate-400">Português f/ Inglês</span>
              </div>
            </div>
          </div>

          <AnnotationArrow startX={18} startY={28} endX={110} endY={81} label="Holding Principal Controladora" accentColor="border-orange-500 text-orange-300 bg-orange-950/95" />
          <AnnotationArrow startX={82} startY={62} endX={230} endY={148} label="Sinergias Integradas Directas" accentColor="border-orange-500 text-orange-300 bg-orange-950/95" />
        </div>
      );

    default:
      return null;
  }
}

export default function SystemManual() {
  const { i18n } = useTranslation();
  const activeLang = i18n.language || 'pt';
  const { profile, businessData } = useAuth();
  
  // Real database metadata counts representing the organic system statistics
  const [dbStats, setDbStats] = useState({
    products: 0,
    customers: 0,
    branches: 0,
    backups: 0,
    loading: false
  });

  useEffect(() => {
    if (!profile?.businessId) return;
    let isMounted = true;
    const loadRealCounts = async () => {
      try {
        const [productsSnap, customersSnap, branchesSnap, backupsSnap] = await Promise.all([
          getDocs(collection(db, `businesses/${profile.businessId}/products`)).catch(() => null),
          getDocs(collection(db, `businesses/${profile.businessId}/customers`)).catch(() => null),
          getDocs(collection(db, `businesses/${profile.businessId}/branches`)).catch(() => null),
          getDocs(collection(db, `businesses/${profile.businessId}/backups`)).catch(() => null)
        ]);
        if (isMounted) {
          setDbStats({
            products: productsSnap?.size || 0,
            customers: customersSnap?.size || 0,
            branches: branchesSnap?.size || 0,
            backups: backupsSnap?.size || 0,
            loading: false
          });
        }
      } catch (err) {
        console.error("Error loading interactive manual integration stats:", err);
      }
    };
    loadRealCounts();
    return () => { isMounted = false; };
  }, [profile?.businessId]);

  // Main UI, Theme and Search states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSectionId, setSelectedSectionId] = useState('inicio-rapido');
  const [readSections, setReadSections] = useState<Record<string, boolean>>({});
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [isDownloadOpen, setIsDownloadOpen] = useState(false);
  const [theme, setTheme] = useState<'slate' | 'grey' | 'ivory' | 'sepia'>(
    () => (localStorage.getItem('sabush_manual_theme') as 'slate' | 'grey' | 'ivory' | 'sepia') || 'grey'
  );

  const changeTheme = (newTheme: 'slate' | 'grey' | 'ivory' | 'sepia') => {
    setTheme(newTheme);
    localStorage.setItem('sabush_manual_theme', newTheme);
  };

  const contentAreaRef = useRef<HTMLDivElement>(null);
  const scrollPositions = useRef<Record<string, number>>({});

  // 17 Structured Manual Sections in European/Mozambican Portuguese
  const manualSections: ManualSection[] = [
    {
      id: 'inicio-rapido',
      icon: Play,
      iconColor: 'text-violet-400',
      iconBg: 'bg-violet-500/10',
      title: '1. 🚀 Início Rápido (Quick Start)',
      category: 'Geral',
      summary: 'Visão geral do ecossistema Sabush System ERP, login seguro, criação de contas e setup inicial.',
      description: 'O Sabush System ERP é uma plataforma avançada de gestão integrada, desenhada especialmente para PMEs no mercado moçambicano. Ela centraliza as suas operações diárias de vendas, inventário, despesas, cotações e faturamento fiscal num ambiente cloud rápido e seguro.',
      steps: [
        { num: 1, title: 'O que é o inovador Sabush System ERP', desc: 'Centralizador unificado que comunica todos os passos da loja. Uma transação no terminal (POS) liquida volumes físicos de stock no Armazém, lança histórico de receita no caixa e avisa o gestor via WhatsApp.' },
        { num: 2, title: 'Como criar a sua conta corporativa', desc: 'As contas seguras são originadas diretamente através do portal de administração com chaves encriptadas vinculadas ao seu negócio principal.' },
        { num: 3, title: 'Como efetuar o login no sistema', desc: 'Aceda à página de acesso e introduza as suas credenciais seguras de e-mail e password ou clique no botão de autenticação Google Workspace OAuth.' },
        { num: 4, title: 'Configuração Inicial do Negócio', desc: 'Navegue pelas configurações principais e adicione o Nome da sua marca, carregue o logótipo oficial, defina a moeda padrão (Meticais MZN / MT) e inclua as localizações físicas de filiais.' },
        { num: 5, title: 'Período de Experiência de 14 Dias', desc: 'Novos negócios desfrutam de 14 dias de período experimental inteiramente grátis com acesso total e irrestrito a todas as funcionalidades avançadas, permitindo testar e simular todo o fluxo comercial antes de realizar qualquer pagamento ou subscrição.' },
        { num: 6, title: 'Ambiente Global e Painel Dashboard', desc: 'Compreenda os indicadores do cockpit central: visualizadores de volume faturado líquido, contas globais por cobrar, custos e rasto analítico do dia.' }
      ],
      boxes: [
        { type: 'tip', text: 'DICA: Aproveite os 14 dias de período experimental grátis para cadastrar artigos, testar o faturamento no terminal POS e experimentar o portal autónomo de clientes com os seus compradores de confiança!' },
        { type: 'tip', text: 'DICA: Verifique a precisão do seu NUIT corporativo durante o preenchimento de perfil inicial para que este seja impresso corretamente nos talões e faturas legais.' },
        { type: 'warning', text: 'AVISO: Utilize credenciais de acesso exclusivas e evite partilhar senhas mestras com operadores de frente de caixa.' }
      ]
    },
    {
      id: 'sistema-pos',
      icon: ShoppingCart,
      iconColor: 'text-emerald-400',
      iconBg: 'bg-emerald-500/10',
      title: '2. 🏪 Sistema POS (Balcão de Caixa)',
      category: 'Vendas',
      summary: 'Fecho e abertura de caixa, retalho e grosso, aplicação de descontos, troco automático e mensagens automáticas.',
      description: 'O Módulo de Ponto de Venda (POS / PDV) facilita o registo de ordens de venda ao balcão com enorme rapidez. Opera perfeitamente com ecrãs táteis, mouses e leitores de código de barras USB de forma automática.',
      steps: [
        { num: 1, title: 'Iniciar uma Venda de Caixa', desc: 'Aceda ao menu POS. O terminal apresentará o painel interativo de seleção rápida contendo o catálogo de bens categorizados.' },
        { num: 2, title: 'Selecionar e Adicionar Produtos ao Carrinho', desc: 'Toque nos cartões dos produtos, pesquise pelo nome no campo de busca ou utilize o leitor de código de barras físico. O sistema deteta o SKU sem necessitar de focar manualmente o input.' },
        { num: 3, title: 'Escolher entre Preços de Retalho ou Grosso', desc: 'Alterne a modalidade clicando no seletor de topo do carrinho. O sistema mudará os preços de venda instantaneamente respeitando a ficha do artigo.' },
        { num: 4, title: 'Aplicar Margens de Desconto', desc: 'Reduza a fatura introduzindo percentagens nos itens selecionados diretamente no carrinho de compras.' },
        { num: 5, title: 'Concluir Venda e Métodos de Recebimento', desc: 'Selecione o canal ativo (Dinheiro físico, M-Pesa, e-Mola ou Venda a Crédito). Digite a quantia entregue pelo cliente para que o sistema exiba o valor exato do troco a devolver.' },
        { num: 6, title: 'Criação Automática da Fatura e Atualização de Stock', desc: 'Ao carregar em Confirmar, o ERP emite a fatura e decrementa automaticamente a quantidade correspondente de stock e lotes do inventário.' },
        { num: 7, title: 'Partilhar o Recibo via WhatsApp', desc: 'Digite o telemóvel do cliente com o prefixo (+258) e envie o comprovativo ou o link do talão interativo instantaneamente pelo WhatsApp.' },
        { num: 8, title: 'Anular e Cancelar Vendas correntes', desc: 'Se houver erros no preenchimento de itens, cancele e esvazie o carrinho. Operações fechadas requerem estorno manual pelo gerente.' }
      ],
      boxes: [
        { type: 'danger', text: 'ATENÇÃO: Quaisquer estornos de vendas concluídas ou cancelamento de faturas térmicas requerem a introdução de PIN de segurança do Gestor para auditar fraudes de caixa.' },
        { type: 'tip', text: 'DICA: Caso possua uma impressora de rolo térmico USB ou Bluetooth (58mm/80mm), define a largura correspondente nas configurações de dispositivo.' }
      ]
    },
    {
      id: 'inventario',
      icon: Box,
      iconColor: 'text-sky-400',
      iconBg: 'bg-sky-500/10',
      title: '3. 📦 Inventário e Logística',
      category: 'Logística',
      summary: 'Adição de bens, controlo de markup, preço de atacado e retalho, alerta de stock crítico e histórico de movimentações.',
      description: 'Controle o stock da sua loja com precisão. O módulo de inventário permite gerir itens isolados, calcular a valorização comercial total da loja e configurar notificações inteligentes de rutura.',
      steps: [
        { num: 1, title: 'Registar um Novo Produto', desc: 'Aceda à seção Inventário e clique em Novo Produto. Preencha o nome comercial, código de barras/SKU, categoria de família e selecione uma foto ilustrativa.' },
        { num: 2, title: 'Definir Preços e Controlar Margens', desc: 'Introduza o Preço de Compra (Custo) e as tabelas correspondentes de Preço de Retalho e Preço de Grosso. O Sabush ERP calcula automaticamente as margens comerciais e lucro líquido esperado.' },
        { num: 3, title: 'Configurar Alerta de Stock Mínimo', desc: 'Atribua um número limite para stock crítico. Quando as existências físicas forem idênticas ou inferiores a esse patamar, o sistema enviará avisos visuais no terminal.' },
        { num: 4, title: 'Prevenção Rígida de Stock Negativo', desc: 'Para garantir a integridade das suas contas, o sistema implementa uma validação rigorosa que impede a gravação de produtos com quantidades negativas. Qualquer tentativa de configurar stock abaixo de zero (ao adicionar ou editar produtos) é bloqueada com um aviso sonoro/visual.' },
        { num: 5, title: 'Impressão de Inventário Minimalista para Auditoria Física', desc: 'Precisa de fazer uma contagem física na prateleira? Clique no botão "Imprimir" no topo da tabela. O ERP gera instantaneamente um PDF ultra-limpo, sem cores pesadas ou margens desnecessárias, listando exclusivamente o Nome, Quantidade e Preço de cada artigo para poupar tinta de impressora.' },
        { num: 6, title: 'Exportação para Planilha CSV', desc: 'Clique no botão "Exportar CSV" ao lado da impressão para descarregar um arquivo bruto (.csv) com o inventário completo, ideal para carregar no Microsoft Excel, realizar auditoria profunda ou enviar ao seu contabilista.' },
        { num: 7, title: 'Mapear o Histórico de Ajustes e Movimentos', desc: 'Visualize o rasto completo contendo as entradas, quebras justificadas e saídas por POS de cada produto.' }
      ],
      boxes: [
        { type: 'warning', text: 'AVISO: Tenha especial atenção ao efetuar ajustes manuais absolutos de stock pois isso afetará a exatidão financeira dos relatórios de inventário.' },
        { type: 'tip', text: 'DICA: Utilize o botão "Imprimir" para gerar a sua folha de contagem em PDF rápida e sem desperdício de tinta de rolo ou folha A4. Utilize o botão "Exportar CSV" para analisar o stock completo no Excel.' }
      ]
    },
    {
      id: 'clientes',
      icon: Users,
      iconColor: 'text-indigo-400',
      iconBg: 'bg-indigo-500/10',
      title: '4. 👥 Clientes e CRM',
      category: 'Vendas',
      summary: 'Cadastros com NUIT, histórico individual de compras, conta corrente e programa de pontos de fidelização.',
      description: 'Organize a base de dados dos seus clientes. Acompanhe a conta corrente de cada devedor, o histórico de produtos encomendados e atribua pontos eletrónicos automáticos.',
      steps: [
        { num: 1, title: 'Cadastrar de Novo Cliente no Sistema', desc: 'Clique em Clientes → Adicionar. Preencha as informações importantes: Nome Completo, Número de Telemóvel, NUIT fiscal e morada de referência.' },
        { num: 2, title: 'Consultar Conta Corrente e Histórico', desc: 'Clique no perfil do cliente para ver todas as faturas geradas, faturas abertas, extrato de dívida acumulada e volumes gastos.' },
        { num: 3, title: 'Programa de Fidelização (Loyalty Points)', desc: 'Configure as regras de mérito comercial. O sistema permite atribuir pontuações manuais na ficha do cliente ou acumulá-las de acordo com as compras pagas.' },
        { num: 4, title: 'Monitorizar o Avanço de Escalões', desc: 'Conforme acumulam pontos, os clientes migram de forma dinâmica entre os escalões de atendimento: Bronze, Prata, Ouro e Platina.' },
        { num: 5, title: 'Disparar mensagens rápidas de WhatsApp', desc: 'Clique no ícone de mensageria ao lado do contacto para abrir o assistente de chat pré-carregado no seu terminal de telemóvel.' }
      ],
      boxes: [
        { type: 'tip', text: 'DICA: Formate o telemóvel começando com 84, 85, 87 ou 82 para facilitar o disparo automático nas ferramentas de WhatsApp.' }
      ]
    },
    {
      id: 'faturas',
      icon: FileText,
      iconColor: 'text-emerald-400',
      iconBg: 'bg-emerald-500/10',
      title: '5. 📄 Faturas e Recibos',
      category: 'Faturamento',
      summary: 'Faturação física e digital, adição de itens à fatura aberta, reversão de bens, anulações com motivo auditado.',
      description: 'O motor de faturamento do Sabush ERP gera faturas comerciais limpas, folhas de cobrança e recibos profissionais. Atribui estados sequenciais rígidos para garantir a conformidade operacional.',
      steps: [
        { num: 1, title: 'Criação Automática e Manual de Faturas', desc: 'Ao finalizar no POS ou no formulário manual de faturamento, selecione os produtos, defina o termo para vencimento (Imediato, 15 ou 30 dias) e registre.' },
        { num: 2, title: 'Estados Oficiais da Fatura', desc: 'Compreenda a linha do tempo: Rascunho (rascunho de preparação) → Pendente (emitida e aguardando pagamento) → Pago (valor liquidado) → Cancelada (anulada e sem valor financeiro).' },
        { num: 3, title: 'Adicionar Novos Artigos a uma Fatura Aberta', desc: 'Selecione a fatura pendente, clique no botão de edição rápida de produtos no painel de controlo de fatura, pesquise o produto no stock e junte-o ao corpo documental. O sistema atualiza o saldo e debita o stock na hora.' },
        { num: 4, title: 'Reverter Itens Específicos', desc: 'Abra a fatura e mude para a ficha de itens. Se o cliente devolver apenas um artigo, clique em Reverter. O stock deste artigo regressa ao inventário e o total geral da fatura é recalculado em tempo real no PDF.' },
        { num: 5, title: 'Cancelar a Fatura Completa', desc: 'Se pretender anular, abra os detalhes e carregue no botão correspondente. Introduza o motivo formal da anulação e confirme.' },
        { num: 6, title: 'Exportar Faturas Comerciais em Formato PDF', desc: 'Clique no ícone de PDF para gerar um documento formatado com cabeçalho limpo, dados do cliente, notas bancárias e carimbos de validação prontos para impressão em formato A4.' }
      ],
      boxes: [
        { type: 'danger', text: 'ATENÇÃO: Anular uma fatura reverte as existências físicas de todos os seus produtos de volta ao stock ativo e zera a dívida do cliente associada.' }
      ]
    },
    {
      id: 'registar-pagamento',
      icon: DollarSign,
      iconColor: 'text-yellow-400',
      iconBg: 'bg-yellow-500/10',
      title: '6. 💰 Registar Pagamentos',
      category: 'Financeiro',
      summary: 'Liquidação de faturas, amortizações parciais de clientes e histórico auditado do livro razão de caixa.',
      description: 'Garanta o registo exato de entradas financeiras. O sistema possibilita amortizações cumulativas, reconciliando o saldo devedor até à sua liquidação final.',
      steps: [
        { num: 1, title: 'Registar Pagamento Total', desc: 'Localize a fatura pendente nos registros. Clique no menu de Ações Rápidas → Registar Pagamento. Marque como Pago e defina o canal de recebimento.' },
        { num: 2, title: 'Efetuar uma Amortização Parcial', desc: 'Caso o cliente efetue um depósito fracionado, clique em Registar Pagamento, preencha o valor exato adiantado e salve. O Sabush recalculará a dívida restante e marcará o documento como Parcial.' },
        { num: 3, title: 'Acompanhar Histórico Transacional', desc: 'Todas as entradas alimentam o Livro de Caixa com a data operacional, operador registrador e meio financeiro de suporte.' }
      ],
      boxes: [
        { type: 'tip', text: 'DICA: Atribua sempre os depósitos parciais diretamente na fatura original para manter o rasto e extrato fiscal corretos.' }
      ]
    },
    {
      id: 'gestao-dividas',
      icon: Shield,
      iconColor: 'text-rose-400',
      iconBg: 'bg-rose-500/10',
      title: '7. 💳 Gestão de Dívidas e Créditos',
      category: 'Financeiro',
      summary: 'Monitorização de contas a receber, limites de crédito do cliente e cobrança facilitada através de alertas WhatsApp.',
      description: 'Mitigue o risco de insolvência. Visualize um balanço geral e consolidado de todos os clientes com saldos pendentes e dispare lembretes rápidos de liquidação comercial.',
      steps: [
        { num: 1, title: 'Como as dívidas são iniciadas', desc: 'Sempre que uma venda é finalizada no POS selecionando o canal de Crédito ou quando uma fatura é gerada sem recebimento monetário imediato, a dívida é criada na conta corrente.' },
        { num: 2, title: 'Registrar Amortização de Dívidas de Cliente', desc: 'Toque no menu Gestão de Crédito, selecione o cliente devedor correspondente e liquide os valores adiantados.' },
        { num: 3, title: 'Enviar Lembretes Rápidos de Cobrança', desc: 'Clique no ícone de WhatsApp ao lado do perfil de dívida para formatar e disparar uma mensagem educada de alerta de vencimento contendo o link da fatura.' },
        { num: 4, title: 'Relatórios de Envelhecimento e Saldos Atrasados', desc: 'Gere listagens ordenadas por tempo ou valor para otimizar os seus esforços diários de tesouraria.' }
      ],
      boxes: [
        { type: 'warning', text: 'AVISO: Monitore com frequência o gráfico de cobranças no Painel Principal para impedir o aumento perigoso de contas inadimplentes de longo prazo.' }
      ]
    },
    {
      id: 'cotacoes',
      icon: Receipt,
      iconColor: 'text-cyan-400',
      iconBg: 'bg-cyan-500/10',
      title: '8. 📋 Orçamentos (Cotações)',
      category: 'Vendas',
      summary: 'Emissão de cotações para clientes, download de proformas e upgrade rápido com um clique para fatura definitiva.',
      description: 'Desenhe orçamentos sem implicações fiscais imediatas. Ideal para negociações preliminares antes de faturar bens ou adjudicar serviços comerciais.',
      steps: [
        { num: 1, title: 'Formular uma Cotação para Cliente', desc: 'Selecione Orçamentos → Novo. Insira o cliente de destino, selecione os artigos ou bens negociados e defina a data limite para validade do preço acordado.' },
        { num: 2, title: 'Download de Proformas Profissionais', desc: 'Exporte e partilhe o orçamento detalhado em formato de PDF profissional que não reduz stocks do inventário.' },
        { num: 3, title: 'Upgrade de Orçamento Aceite para Fatura', desc: 'Após a aprovação final do cliente, localize o orçamento cadastrado no sistema e clique no botão **"Converter para Fatura"**.' },
        { num: 4, title: 'Gerir Cotações Expiradas', desc: 'Acompanhe as propostas rejeitadas ou fora do período de vigência e invalide-as para manter as tabelas organizadas.' }
      ],
      boxes: [
        { type: 'tip', text: 'DICA: Converter um orçamento para fatura faz com que o sistema debite imediatamente as quantidades correspondentes de produtos do seu stock geral.' }
      ]
    },
    {
      id: 'encomendas-online',
      icon: Store,
      iconColor: 'text-purple-400',
      iconBg: 'bg-purple-500/10',
      title: '9. 🛒 Encomendas On-line',
      category: 'Vendas',
      summary: 'Integração com a loja virtual pública do Sabush, recepção de pedidos, aprovação física e redução de stock.',
      description: 'O Sabush ERP disponibiliza um catálogo on-line público para os seus clientes fazerem encomendas. Controle as entradas logo após pedidos da web.',
      steps: [
        { num: 1, title: 'Aceder ao Painel de Encomendas Recebidas', desc: 'Sempre que um cliente submeter uma compra no catálogo externo, o pedido cai em tempo real na seção Encomendas On-line em estado Pendente.' },
        { num: 2, title: 'Verificar Lotes e Detalhes de Pedido', desc: 'Abra a encomenda para inspecionar os artigos, contacto direto de entrega e anotações adicionais preenchidas no checkout virtual.' },
        { num: 3, title: 'Aceitar ou Rejeitar a Encomenda', desc: 'Aceite o pedido para iniciar a montagem física do lote ou rejeite justificando rutura.' },
        { num: 4, title: 'Criação da Fatura e Atualização de Stock', desc: 'Ao aprovar e despachar do armazém, o ERP gera a fatura fiscal correspondente e debita com segurança as existências dos bens.' },
        { num: 5, title: 'Notificação do Envio do Encomenda', desc: 'O cliente é automatizado sobre o estado do lote (Em Preparação, A caminho ou Entregue).' }
      ],
      boxes: [
        { type: 'warning', text: 'AVISO: Verifique se houve recebimento de valores móveis (M-Pesa/e-Mola) caso o cliente selecione pagamento on-line antes de colocar a mercadoria na transportadora.' }
      ]
    },
    {
      id: 'despesas',
      icon: BarChart3,
      iconColor: 'text-rose-400',
      iconBg: 'bg-rose-500/10',
      title: '10. 💸 Registo de Despesas',
      category: 'Financeiro',
      summary: 'Lançamento de custos operacionais por categorias, ordenados por filiais e faturamento financeiro completo.',
      description: 'Registe e controle as saídas financeiras do seu negócio de forma rigorosa. Monitore os custos correntes comparativamente para resguardar a margem de rentabilidade líquida.',
      steps: [
        { num: 1, title: 'Registar Nova Saída Monetária', desc: 'Localize Despesas → Adicionar. Defina a descrição clara da compra, indique a data, filial operativa e valor exato despendido.' },
        { num: 2, title: 'Atribuir Categorias e Justificativos', desc: 'Selecione categorias adequadas: Renda, Salários, Serviços (Energia/Eletricidade), Aquisição de Materiais de Escritório ou Custo de Frete.' },
        { num: 3, title: 'Anexar Comprovativos', desc: 'Carregue uma imagem ou PDF do recibo para fins de auditoria contabilística da empresa.' },
        { num: 4, title: 'Relatórios Geométricos Mensais', desc: 'Acompanhe nas tabelas analíticas o volume global consumido de depósitos de caixa para mitigar gastos supérfluos.' }
      ],
      boxes: [
        { type: 'tip', text: 'DICA: Lance todas as pequenas despesas diárias (como táxi, lanche ou recargas de rede) para garantir que o saldo de encerramento do caixa do dia feche a 100%.' }
      ]
    },
    {
      id: 'fornecedores',
      icon: Building,
      iconColor: 'text-slate-400',
      iconBg: 'bg-slate-500/10',
      title: '11. 🏭 Fornecedores cadastrados',
      category: 'Logística',
      summary: 'Gestão de parceiros comerciais fornecedores, prazos de pagamento corporativos e contas gerais.',
      description: 'Tenha o controlo completo de todas as marcas, distribuidores institucionais e parceiros logísticos responsáveis por abastecer as prateleiras das suas lojas.',
      steps: [
        { num: 1, title: 'Cadastrar Fornecedor', desc: 'Navegue até Fornecedores → Criar. Introduza a Razão Social da empresa, NUIT corporativo, contacto telefónico do gestor de conta e morada física do armazém principal.' },
        { num: 2, title: 'Acompanhar Saldos a Pagar', desc: 'Mapeie o montante financeiro pendente por liquidar resultante das aquisições de encomendas faturadas a prazo.' },
        { num: 3, title: 'Avaliar Prazos de Entrega e Fiabilidade', desc: 'Mantenha notas descritivas e registos de entregas na ficha para avaliar a pontualidade e exatidão dos fornecimentos.' }
      ],
      boxes: [
        { type: 'tip', text: 'DICA: Preencha corretamente o NUIT do fornecedor para preencher o rasto correto nos relatórios de despesas fiscais e deduções de IVA.' }
      ]
    },
    {
      id: 'ordens-compra',
      icon: Truck,
      iconColor: 'text-orange-400',
      iconBg: 'bg-orange-500/10',
      title: '12. 🛍️ Ordens de Compra (Procurement)',
      category: 'Logística',
      summary: 'Emissão de ordens de abastecimento, monitorização de recepções físicas e aumento integrado de stock.',
      description: 'Gerencie o planeamento de substituição e compra de mercadoria junto de parceiros cadastrados, garantindo rapidez de entrada no stock.',
      steps: [
        { num: 1, title: 'Criar uma Ordem de Compra (PO)', desc: 'Clique em Ordens de Compra → Criar Ordem. Indique o Fornecedor, selecione os produtos do catálogo operacional e introduza a quantidade alvo desejada.' },
        { num: 2, title: 'Enviar Documentação ao Fornecedor', desc: 'Exporte o rascunho de PO estruturado e dispare via e-mail corporativo ou WhatsApp solicitando envio da mercadoria.' },
        { num: 3, title: 'Confirmar Recepção e Triagem Física', desc: 'No momento de desembarque dos bens no armazém da loja, realize a conferência visual e física dos volumes recebidos e clique em **"Confirmar Recebimento"** no sistema.' },
        { num: 4, title: 'Como o stock aumenta de forma autónoma', desc: 'Ao aprovar a receção da ordem, o ERP atualiza de forma incremental as existências de stock no Inventário e cria automaticamente uma despesa associada.' }
      ],
      boxes: [
        { type: 'warning', text: 'AVISO: Evite confirmar ordens de compra contendo quantidades avariadas sem realizar pré-triagem física, garantindo a fidelidade do seu stock.' }
      ]
    },
    {
      id: 'reports',
      icon: BarChart3,
      iconColor: 'text-yellow-400',
      iconBg: 'bg-yellow-500/10',
      title: '13. 📊 Relatórios e Indicadores (Reports)',
      category: 'Análise',
      summary: 'Mapeamento de faturamento comercial, mais vendidos, lucros operacionais e exportação estruturada para PDF/Excel.',
      description: 'Decisões orientadas por dados. A ferramenta de relatórios fornece representações visuais detalhadas do desempenho por períodos, canais comerciais e filiais ativas.',
      steps: [
        { num: 1, title: 'Análise Diária, Semanal e Mensal', desc: 'Observe a consolidação do faturamento bruto das vendas ocorridas no POS em tempo real.' },
        { num: 2, title: 'Identificar Canais de Maior Foco', desc: 'Filtre as operações fechadas para isolar receitas originadas ao Retalho, por Grosso ou submetidos via Loja On-line pública.' },
        { num: 3, title: 'Top de Produtos Líderes em Saída', desc: 'Gere listas dos bens de consumo mais rápidos para criar estratégias direcionadas de marketing ou descontos.' },
        { num: 4, title: 'Exportações de Auditoria e Documentação', desc: 'Extraia tabelas consolidadas em formato Excel ou gere relatórios corporativos simplificados em PDF prontos a partilhar com contabilistas ou consultores parceiros.' },
        { num: 5, title: 'Bloqueio de Relatórios Avançados por Plano', desc: 'A aba "Insights Gerais" está disponível para todos os utilizadores do ERP. Contudo, as abas avançadas "Resumo de Inventário" e "Relatórios Programados" exigem subscrição ativa do Plano Pro ou Enterprise devido ao processamento analítico denso.' }
      ],
      boxes: [
        { type: 'tip', text: 'DICA: Verifique a segmentação de despesas por filiais para identificar qual localização apresenta maior rácio de custos operacionais residuais.' },
        { type: 'warning', text: 'NOTAS DE PLANO: Se visualizar ícones de Cadeado nas abas "Resumo de Inventário" ou "Relatórios Programados", verifique o seu plano activo no menu Definições -> Faturação. Caso queira usufruir destas análises, realize o upgrade do seu plano para Pro ou Enterprise.' }
      ]
    },
    {
      id: 'equipa',
      icon: UserCheck,
      iconColor: 'text-teal-400',
      iconBg: 'bg-teal-500/10',
      title: '14. 👨‍👩‍👧 Gestão de Equipa e Permissões',
      category: 'Segurança',
      summary: 'Cadastro de membros associados, restrições funcionais (roles) e auditoria de segurança das ações.',
      description: 'Cadastre e monitorize a equipa comercial das suas lojas. Introduza barreiras inteligentes de visualização de acordo com a função e responsabilidade de cada utilizador.',
      steps: [
        { num: 1, title: 'Adicionar Membro', desc: 'Vá a Gestão de Equipa → Novo Utilizador. Insira o endereço de e-mail corporativo ou pessoal e atribua uma password temporária de primeiro acesso.' },
        { num: 2, title: 'Definir Atribuições Funcionais (Roles)', desc: 'Configure um dos papéis padrão de acesso: Admin (gestão master global), Gestor (ajustes administrativos parciais e preços), ou Caixa/Operador de POS (apenas registros de terminal).' },
        { num: 3, title: 'Compreender Permissões e Restrições', desc: 'Contas do tipo Caixa estão bloqueadas de alterar preços de produtos, apagar histórico ou anular faturas fora dos limites básicos.' },
        { num: 4, title: 'Utilizar PIN para Aprovações Físicas', desc: 'Ajustes e exclusões críticas exigem que o gestor se desloque e insira o seu PIN de 4 dígitos no ecrã do funcionário operador.' },
        { num: 5, title: 'Mapear o Registo de Auditoria Global', desc: 'Administradores podem ler o histórico (Audit Trail) para saber quem registou, editou ou reverteu bens operacionais.' }
      ],
      boxes: [
        { type: 'danger', text: 'ATENÇÃO: Nunca partilhe a sua senha ou PIN pessoal de Administrador Master. Se houver desconfiança de fuga, atualize-os de imediato nas definições de perfil.' }
      ]
    },
    {
      id: 'configuracoes',
      icon: Settings,
      iconColor: 'text-sky-400',
      iconBg: 'bg-sky-500/10',
      title: '15. ⚙️ Definições do Sistema',
      category: 'Administração',
      summary: 'Carregar logotipo corporativo, moeda, automações integradas de WhatsApp e configuração de filiais.',
      description: 'Customize o comportamento completo do Sabush ERP adaptando-o ao modelo de cobrança do seu espaço de vendas e à sua rede de distribuição física.',
      steps: [
        { num: 1, title: 'Atualizar Perfil do Estabelecimento', desc: 'Insira a Razão Social corporativa, morada administrativa central, NUIT de faturamento, contactos de atendimento e website.' },
        { num: 2, title: 'Configurar a Moeda e Fuso Horário', desc: 'Confirme Meticais (MZN / MT) ou moedas internacionais de faturação de acordo com a necessidade legal e as horas de Moçambique.' },
        { num: 3, title: 'Configurar a Conexão da API do WhatsApp Cloud', desc: 'Insira a chave do Token temporário ou permanente nos campos mapeados e o ID de Telefone de Envio fornecido pela plataforma Meta Developer.' },
        { num: 4, title: 'Ativar Automações de WhatsApp Disponíveis', desc: 'Selecione e ative as notificações pretendidas: envio automatizado de faturas, alertas visuais de stock esvaziável aos encarregados, relatórios diários de performance e lembrete de amortizações em falta.' },
        { num: 5, title: 'Cópia de Segurança de Informação (Data Backups)', desc: 'Gere arquivos comprimidos contendo todas as tabelas de dados na nuvem para download de segurança.' },
        { num: 6, title: 'Registar Lojas e Filiais', desc: 'Caso possua ramificações ou múltiplas prateleiras de stock, crie as filiais separadas para isolar as contas e inventários.' },
        { num: 7, title: 'Identidade Visual e Conforto Ocular', desc: 'O Sabush System ERP possui uma identidade visual única e moderna, inspirada nos tons ocre e argila africana. Essa paleta de cores quentes e de alto contraste foi especialmente selecionada para evitar a fadiga ocular durante longas jornadas de trabalho à frente do ecrã de vendas, aliando design acolhedor e ergonomia profissional.' }
      ],
      boxes: [
        { type: 'warning', text: 'AVISO: Restaurar um ficheiro de backup antigo de dados substituirá os registros ativos da sua base de dados atual. Proceda com máximo cuidado.' }
      ]
    },
    {
      id: 'resolucao-problemas',
      icon: HelpCircle,
      iconColor: 'text-pink-400',
      iconBg: 'bg-pink-500/10',
      title: '16. ❓ Resolução de Problemas',
      category: 'Suporte',
      summary: 'Perguntas frequentes, erros comuns de login, falhas de disparo de SMS/WhatsApp e canais oficiais de suporte.',
      description: 'Guia de despiste rápido e apoio. Encontre soluções imediatas para as interrupções operacionais mais comuns ao balcão sem parar de faturar.',
      steps: [
        { num: 1, title: 'Não consigo efetuar o login no terminal', desc: 'Verifique se a ligação de internet está ativa. Confirme a ortografia correta do seu e-mail corporativo ou use a autenticação direta Google.' },
        { num: 2, title: 'Os dados não estão a salvar permanentemente', desc: 'Se houver quedas na rede local, o Firebase segura transações localmente até restabelecer a conectividade cloud. Evite atualizar a janela Web do browser caso a internet caia de forma abrupta antes de persistir.' },
        { num: 3, title: 'O WhatsApp não dispara as mensagens automáticas', desc: 'Verifique o estado da chave do Token Meta Cloud nas configurações de WhatsApp. Garanta que o número de destino do cliente possui prefixos adequados.' },
        { num: 4, title: 'O Stock de produtos não atualiza na hora', desc: 'Confirme se o canal do carrinho POS não foi fechado como Cotação ou se as faturas estão marcadas como Rascunhos operacionais.' },
        { num: 5, title: 'Procurar os Canais de Apoio Técnico', desc: 'Se as dúvidas persistirem, entre em contacto com a nossa equipa oficial de suporte em Moçambique através de e-mail dedicado ou WhatsApp de plantão.' }
      ],
      boxes: [
        { type: 'tip', text: 'DICA: Realize um teste simples de envio de WhatsApp nas Configurações para validar se as chaves da Meta estão a responder corretamente.' }
      ]
    },
    {
      id: 'boas-praticas',
      icon: BookOpen,
      iconColor: 'text-teal-400',
      iconBg: 'bg-teal-500/10',
      title: '17. 💡 Dicas e Boas Práticas',
      category: 'Geral',
      summary: 'Rotina operacional diária de fecho de caixa, auditorias periódicas e conselhos de performance.',
      description: 'Conselhos práticos para otimizar os processos mercantis e a estabilidade contabilística da sua empresa ao longo do ano.',
      steps: [
        { num: 1, title: 'Rotina Diária Recomendada de Operação', desc: 'Abertura rápida com limpeza do terminal, conferência preliminar de troco inicial e registo contínuo com leitor de código de barras USB de forma a travar imprecisões de digitação.' },
        { num: 2, title: 'Fecho e Reconciliação do Caixa ao Fim do Turno', desc: 'Proceda ao apuramento fiável cruzando as notas físicas do armário de moedas com o total cumulativo segregado por M-Pesa, e-Mola e Dinheiro no menu Pagamentos.' },
        { num: 3, title: 'Auditorias de Stock Periódicas Semanais', desc: 'Determine turnos rápidos para realizar amostragem presencial de gavetas e corrija contagens físicas usando os sliders dinâmicos de Ajuste Incremental.' },
        { num: 4, title: 'Revisão Financeira Mensal Estruturada', desc: 'No primeiro dia útil de cada mês, consulte o Dashboard analítico juntamente com as sugestões preditivas do AI Advisor para redefinir as margens de lucro dos produtos menos rentáveis.' }
      ],
      boxes: [
        { type: 'tip', text: 'DICA: Configure o Relatório Matinal do WhatsApp nas Definições para que o gestor receba o volume de vendas consolidado do dia anterior às 08h00 no telemóvel de forma autónoma!' }
      ]
    },
    {
      id: 'portal-cliente',
      icon: Smartphone,
      iconColor: 'text-amber-400',
      iconBg: 'bg-amber-500/10',
      title: '18. 📱 Portal Autónomo de Clientes e Validador de Comprovativos',
      category: 'Portal',
      summary: 'Como funciona o envio autónomo de comprovativos por clientes, o carregador inteligente com compressão, e a validação do vendedor com lançamento automático de pagamentos.',
      description: 'O Portal de Autenticação Segura para Clientes trabalha em perfeita harmonia com o Módulo de Pagamentos do Lojista. Juntos, eles eliminam o atendimento telefónico e os lançamentos manuais exaustivos de depósitos: o cliente reporta o pagamento diretamente na cloud e o sistema automatiza o lançamento contabilístico após a sua rápida auditoria visual.',
      steps: [
        { num: 1, title: 'Como o Cliente Acede ao Portal Seguro Autónomo', desc: 'Cada cliente cadastrado recebe um link único de fatura ou pode aceder ao portal da marca. Ele valida o acesso informando o e-mail registado na sua ficha ou autenticando-se por Google Workspace, obtendo acesso instantâneo ao seu balanço.' },
        { num: 2, title: 'Localizando Faturas com Débitos por Liquidar', desc: 'Ao carregar o painel, a pessoa vê o seu saldo total em aberto e o histórico completo de faturas. Qualquer fatura pendente ou paga parcialmente mostrará um botão dourado "Registrar Pagamento" para submeter o comprovativo.' },
        { num: 3, title: 'Preenchimento dos Dados Reais da Transação', desc: 'O cliente clica para pagar e especifica: o valor pago (que pode ser a amortização parcial ou total da fatura), o canal de transação de origem (M-Pesa, e-Mola ou Transferência Bancária) e a referência (ID único).' },
        { num: 4, title: 'Carregamento e Compressão Inteligente de Anexo', desc: 'O cliente anexa o print do telemóvel ou recibo PDF. O portal aplica inteligência local: lê a imagem e compacta o seu tamanho de forma transparente antes de enviar. Isso reduz o consumo de dados móveis e economiza armazenamento sem perder nitidez!' },
        { num: 5, title: 'Submissão e Envio de Pré-Alerta via WhatsApp', desc: 'Após submeter, o anexo e os metadados são registados instantaneamente na base de dados (sendo listados em tempo real na conta). O portal gera um atalho para abrir o WhatsApp do vendedor com um texto pré-formatado reforçando o envio.' },
        { num: 6, title: 'Operador Recebe Alerta de Comprovativo no Backoffice', desc: 'No terminal administrativo do lojista, o menu "Pagamentos" exibe um círculo vermelho indicador pulsante e de aviso de total de comprovativos pendentes, alertando o operador de caixa para realizar a auditoria.' },
        { num: 7, title: 'Auditoria Visual com Visualizador Lightbox', desc: 'O administrador e gestores abrem os detalhes de verificação. O sistema exibe o anexo original em tamanho expansível, confrontando os dados introduzidos (referência e valor informado) com o talão anexado lado a lado.' },
        { num: 8, title: 'Aprovação: Lançamento de Crédito e Recibo Autónomo', desc: 'Se a transação estiver em ordem, o operador clica em "Validar & Aprovar". O ERP automaticamente: aprova o comprovativo, deduz o saldo da fatura correspondente, debita o saldo geral da conta corrente do cliente, lança o valor no fluxo de registo diário de caixa e emite o recibo legal válido.' },
        { num: 9, title: 'Recusa com Declaração Justificada de Motivo', desc: 'Se houver anexo cortado, código duplicado ou ilegível, o operador clica em "Recusar" e insere a objeção (ex: "ID não localizado no extrato bancário"). O estado é redefinido para "Rejeitado" e o utilizador é notificado.' },
        { num: 10, title: 'Sincronização Bidirecional e Extrato em Tempo Real', desc: 'O feedback é atualizado na hora para o cliente no seu portal particular. Ele visualiza a aprovação ou rejeição com o respetivo motivo oficial do gestor, podendo submeter nova revisão sem fricção ou necessidade de deslocação manual.' }
      ],
      boxes: [
        { type: 'tip', text: 'DICA: Incentive o uso do portal para diminuir o fluxo de chamadas telefónicas para o seu suporte financeiro. Os clientes adoram a transparência de ver o seu extrato ser atualizado na hora!' },
        { type: 'warning', text: 'AVISO: Sempre faça a conferência física com a sua conta bancária/M-Pesa antes de carregar no botão Validar & Aprovar, pois o lançamento na contabilidade da loja é automático e definitivo.' }
      ]
    },
    {
      id: 'unidades-medida',
      icon: Sparkles,
      iconColor: 'text-amber-400',
      iconBg: 'bg-amber-500/10',
      title: '19. 📐 Gestão Avançada de Unidades de Medida (UoM) e Versatilidade',
      category: 'Logística',
      summary: 'Como funciona a deteção automática ou manual de unidades de medida, conversões triplas inteligentes (Caixa / Embalagem / Unidade) e suporte a múltiplos ramos de negócios.',
      description: 'O Sabush System ERP possui um sistema inovador e altamente flexível de Unidades de Medida (UoM) tripartido. Isto permite que negócios de qualquer ramo (de armazéns de bebidas a lojas de materiais de construção) registem, comprem por grosso (ex: caixas ou paletes) e vendam de forma fracionada (ex: pacotes ou unidades individuais) mantendo o stock global em perfeita harmonia matemática.',
      steps: [
        { num: 1, title: 'Deteção Automática Híbrida de Esquemas', desc: 'Ao digitar ou selecionar a categoria de um produto (ex: "Construção", "Bebidas", "Alimentar"), o sistema corre algoritmos inteligentes em tempo real e sugere imediatamente o esquema ideal de pacotes e conversões adequado (ex: "Saco - Kg" ou "Caixa - Volume - Unidade") para poupar tempo de configuração.' },
        { num: 2, title: 'Deseja personalizar? Liberdade e Flexibilidade Total', desc: 'A automação é apenas o ponto de partida! O utilizador tem autoridade total para alterar o esquema recomendado na hora, selecionar outros presets operacionais ou escolher "Outro / Personalizado" para definir manualmente as etiquetas e multiplicadores (ex: especificar que 1 Caixa contém 12 Embalagens e cada Embalagem contém 5 Unidades).' },
        { num: 3, title: 'Operações de Entrada de Stock Simplificadas', desc: 'Durante a entrada de stock no Inventário, o ERP sabe exatamente qual é o esquema de unidades do artigo. Ele exibe instantaneamente campos amigáveis e adaptados para cada nível (Ex: "Entrada de Caixas" e "Entrada de Unidades Soltas") convertendo tudo em milésimos de segundo para a unidade base unificada.' },
        { num: 4, title: 'Vendas Fracionadas no POS sem Erros de Inventário', desc: 'No momento da venda ao balcão, o operador pode escolher em qual unidade deseja vender (ex: vender uma Caixa inteira ou apenas de forma fracionada por Unidades). O ERP calcula o preço proporcional com rigor, atualiza o carrinho de compras e dá baixa no stock de forma segura e automatizada!' },
        { num: 5, title: 'Negócios e Ramos de Atividade Suportados', desc: 'Graças a esta flexibilidade, o ecossistema atende com excelência a: 1. Mercearias e Retalho Alimentar (Cx - Emb - Un); 2. Armazéns e Distribuidoras de Bebidas (Cx - Volume - Un); 3. Lojas de Materiais de Construção (Areia, Cimento em Saco - Kg); 4. Agronegócios, Rações, Farmácia e Químicos (Palete - Caixa - Quilograma).' }
      ],
      boxes: [
        { type: 'tip', text: 'DICA: Ao utilizar o esquema de Unidades Triplas, o stock no banco de dados é gerido de forma centralizada. Isto evita divergências onde parece que há produto em falta quando na verdade ele está apenas armazenado dentro de caixas por abrir!' },
        { type: 'warning', text: 'AVISO: Certifique-se de configurar corretamente os multiplicadores de conversão de caixas e embalagens no momento de registar o produto, pois o sistema usará estes rácio para realizar cálculos automáticos de reabastecimento.' }
      ]
    },
    {
      id: 'termos-grupo',
      icon: Shield,
      iconColor: 'text-orange-400',
      iconBg: 'bg-orange-500/10',
      title: '20. ⚖️ Termos de Uso e Grupo Sabush',
      category: 'Eco-sistema',
      summary: 'Diretrizes legais, salvaguarda de dados, SLA operacional e sinergias do Grupo com Mercado Sabush e Sabush English Club.',
      description: 'O Sabush System ERP é operado sob os direitos institucionais e comerciais do Grupo Sabush proprietário oficial do código e das marcas operacionais correlacionadas em Moçambique e região Austral.',
      steps: [
        { num: 1, title: 'Estruturação Jurídica Grupo Sabush', desc: 'O Sabush ERP foi desenhado para formalizar e otimizar PMEs. Ao registar-se, adquire uma licença não transferível de uso operacional.' },
        { num: 2, title: 'Ecossistema Irmão: Mercado Sabush', desc: 'Uma sinergia poderosa do grupo que atua como marketplace B2C/B2B em Moçambique, permitindo aos lojistas expor stock e adquirir suprimentos de forma centralizada.' },
        { num: 3, title: 'Ecossistema de Ensino: Sabush English Club', desc: 'Mais uma iniciativa educacional inovadora focado em quebrar barreiras linguísticas, ensinando inglês profissional para nativos de língua portuguesa na África afora.' },
        { num: 4, title: 'Proteção de Privacidade e Bases de Dados', desc: 'Sendo um aplicativo cloud integrado com Firebase de última geração, todos os registros de caixa, despesas e inventário contam com backups e logs de auditoria fechados.' },
        { num: 5, title: 'Aviso de Não Certificação Fiscal (AT)', desc: 'IMPORTANTE: O Sabush System ERP NÃO é certificado pela Autoridade Tributária (AT) de Moçambique. Nos termos da Lei nº 32/2007 (Regulamento do IVA), faturas, cotações ou recibos emitidos no sistema são exclusivamente para controle interno comercial PMEs. Empresas com faturações superiores a 2.500.000 MZN/ano devem, por lei, utilizar sistemas certificados pela AT para emissão de faturas fiscais originais.' }
      ],
      boxes: [
        { type: 'tip', text: 'DICA: Clientes activos do Sabush ERP têm descontos corporativos exclusivos na subscrição do Sabush English Club e taxas preferenciais no Mercado Sabush!' },
        { type: 'danger', text: 'ATENÇÃO: A violação dos termos mercantis, tentativas de clonagem do sistema ou práticas de faturamento fraudulento resultarão no cancelamento imediato e permanente da conta corporativa.' }
      ]
    },
    {
      id: 'truques-segredos',
      icon: Sparkles,
      iconColor: 'text-violet-400',
      iconBg: 'bg-violet-500/10',
      title: '21. ⚡ Segredos e Truques de Alta Produtividade',
      category: 'Avançado',
      summary: 'Atalhos globais, fusão de contas em duplicado, WhatsApp sem custos, compressão autónoma de fotos e sincronização offline-first.',
      description: 'O Sabush System ERP possui vários mecanismos avançados desenhados especificamente para poupar tempo, cortar custos de internet e simplificar a operação diária das PMEs africanas.',
      steps: [
        { num: 1, title: 'Atalhos Rápidos de Teclado (Command Palette)', desc: 'Use a combinação de teclas Ctrl + K (ou Cmd + K no Mac) a partir de qualquer ecrã do ERP para abrir a Paleta de Comandos Global. Pesquise por clientes, verifique stock, consulte faturas, abra relatórios ou mude de menu instantaneamente sem usar o rato.' },
        { num: 2, title: 'Fusão e De-duplicação de Clientes (Mesclar Contas)', desc: 'Se tiver clientes registados em duplicado (ex: "Mascenis" e "Mascenis Abush"), vá ao menu Clientes e clique em "Gerir & Mesclar". Selecione as duas contas: o sistema transfere todas as faturas históricas, notas de crédito, amortizações e o saldo da conta corrente para a conta principal escolhida, eliminando o registo duplicado sem perda de dados.' },
        { num: 3, title: 'Fusão de Artigos e Ajuste de Stock Coesivo', desc: 'No menu Inventário -> "Gerir & Mesclar", pode fundir dois produtos repetidos. O stock físico e o histórico do produto duplicado são transferidos de imediato para o produto principal. Para evitar fraudes ou desvios de stock por colaboradores, esta ação crítica exige a introdução do PIN de 4 dígitos do Gestor.' },
        { num: 4, title: 'WhatsApp Inteligente Grátis (Modo Click-to-Chat)', desc: 'Caso não possua o Token da API oficial da Meta configurado, o Sabush ERP entra automaticamente em modo de "Fallback" gratuito. Ao clicar em enviar fatura ou recibo, ele gera um link direto para o WhatsApp Web com texto profissional pré-redigido (incluindo o nome do cliente, saldo e o link do portal seguro), bastando pressionar enviar no telemóvel!' },
        { num: 5, title: 'Compressão Local Automática de Ficheiros de Imagem', desc: 'O carregamento de fotos de produtos e o upload de comprovativos pelos clientes contam com compressão inteligente executada localmente no browser. O sistema compacta imagens pesadas para menos de 80KB e 256px antes de as enviar para a nuvem. Isto economiza até 95% do saldo de dados móveis (M-Pesa/e-Mola net) dos utilizadores!' },
        { num: 6, title: 'Funcionamento em Rede Instável (Offline Cache & Sync)', desc: 'Se a internet cair de forma abrupta ao balcão, não interrompa o atendimento! O Sabush ERP retém as vendas e edições localmente em cache offline segura de forma totalmente invisível. Quando a ligação à rede móvel for reestabelecida, os dados sincronizam sozinhos com a nuvem em background.' }
      ],
      boxes: [
        { type: 'tip', text: 'DICA: Treine os seus caixas para usarem o atalho Ctrl + K. Ao dominar a Paleta de Comandos, o tempo de atendimento ao balcão reduz-se drasticamente, permitindo despachar filas de clientes com extrema rapidez.' },
        { type: 'warning', text: 'AVISO: A fusão de contas de clientes e artigos de stock é uma ação definitiva e irreversível no banco de dados. Certifique-se sempre de selecionar o registo que deseja manter como principal antes de confirmar.' }
      ]
    }
  ];

  // Progressive Read Tracking Logic
  useEffect(() => {
    if (profile?.uid) {
      const saved = localStorage.getItem(`sabush_manual_read_${profile.uid}`);
      if (saved) {
        try {
          setReadSections(JSON.parse(saved));
        } catch (e) {
          console.error("Failed to parse read sections:", e);
        }
      }
    }
  }, [profile?.uid]);

  const toggleReadStatus = (sectionId: string) => {
    const updated = {
      ...readSections,
      [sectionId]: !readSections[sectionId]
    };
    setReadSections(updated);
    if (profile?.uid) {
      localStorage.setItem(`sabush_manual_read_${profile.uid}`, JSON.stringify(updated));
    }
    
    if (updated[sectionId]) {
      toast.success("Tópico de manual marcado como lido! 💪");
    }
  };

  // Calculating read percentage progress
  const totalSections = manualSections.length;
  const readCount = Object.values(readSections).filter(Boolean).length;
  const readPercentage = totalSections > 0 ? Math.round((readCount / totalSections) * 100) : 0;

  // Handle switching section with scroll memory retention
  const changeSection = (sectionId: string) => {
    // Save current scroll position
    if (contentAreaRef.current) {
      scrollPositions.current[selectedSectionId] = contentAreaRef.current.scrollTop;
    }
    
    setSelectedSectionId(sectionId);
    setMobileSidebarOpen(false);

    // Restore scroll position or reset to top
    setTimeout(() => {
      if (contentAreaRef.current) {
        contentAreaRef.current.scrollTop = scrollPositions.current[sectionId] || 0;
      }
    }, 50);
  };

  // Scroll to Top mechanism
  useEffect(() => {
    const handleScrollDetect = () => {
      if (contentAreaRef.current) {
        setShowScrollTop(contentAreaRef.current.scrollTop > 400);
      }
    };
    const refCurrent = contentAreaRef.current;
    if (refCurrent) {
      refCurrent.addEventListener('scroll', handleScrollDetect);
    }
    return () => {
      if (refCurrent) {
        refCurrent.removeEventListener('scroll', handleScrollDetect);
      }
    };
  }, []);

  const scrollToTop = () => {
    if (contentAreaRef.current) {
      contentAreaRef.current.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  };

  // Filter sections by search text matching title, description, or individual step contents
  const filteredSections = manualSections.filter(sec => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const matchTitle = sec.title.toLowerCase().includes(term);
    const matchSummary = sec.summary.toLowerCase().includes(term);
    const matchDesc = sec.description.toLowerCase().includes(term);
    const matchSteps = sec.steps.some(st => 
      st.title.toLowerCase().includes(term) || st.desc.toLowerCase().includes(term)
    );
    const matchBoxes = sec.boxes.some(bx => bx.text.toLowerCase().includes(term));
    
    return matchTitle || matchSummary || matchDesc || matchSteps || matchBoxes;
  });

  // Print function
  const triggerPrintManual = () => {
    window.print();
  };

  const businessName = businessData?.name || profile?.businessName || 'Sabush System ERP';

  const triggerDownloadPDF = () => {
    try {
      generateSystemManualPDF(businessName);
      toast.success("Manual PDF descarregado com sucesso! 📥");
    } catch (error) {
      console.error("PDF generator failed:", error);
      toast.error("Ocorreu um erro ao gerar o PDF do manual.");
    }
  };

  const triggerDownloadMarkdown = () => {
    try {
      let mdText = `# Manual de Utilizador - ${businessName}\n\n`;
      mdText += `*Sabush System ERP - Guia Operacional Completo*\n`;
      mdText += `Gerado automaticamente em: ${new Date().toLocaleDateString('pt-PT')} ${new Date().toLocaleTimeString('pt-PT')}\n\n`;
      mdText += `---\n\n`;

      manualSections.forEach((sec) => {
        mdText += `## ${sec.title}\n`;
        mdText += `**Categoria:** ${sec.category}\n\n`;
        mdText += `${sec.description}\n\n`;
        
        if (sec.steps && sec.steps.length > 0) {
          mdText += `### Passo-a-Passo Operacional:\n\n`;
          sec.steps.forEach((step) => {
            mdText += `${step.num}. **${step.title}**\n   ${step.desc}\n\n`;
          });
        }

        if (sec.boxes && sec.boxes.length > 0) {
          mdText += `### Recomendações e Avisos:\n\n`;
          sec.boxes.forEach((box) => {
            const prefix = box.type === 'tip' ? '💡 DICA' : box.type === 'warning' ? '⚠️ AVISO' : '🛑 ATENÇÃO';
            mdText += `> **${prefix}:** ${box.text}\n\n`;
          });
        }
        
        mdText += `---\n\n`;
      });

      const blob = new Blob([mdText], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${businessName.replace(/\s+/g, '_')}_Manual_Utilizador.md`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Manual em Markdown descarregado com sucesso! 📥");
    } catch (error) {
      console.error("Markdown download failed:", error);
      toast.error("Erro ao gerar o manual em Markdown.");
    }
  };

  // Utility to highlight searched keywords inline within content strings
  const highlightWord = (phrase: string, searchQuery: string) => {
    if (!searchQuery) return phrase;
    const parts = phrase.split(new RegExp(`(${escapeRegExp(searchQuery)})`, 'gi'));
    return (
      <>
        {parts.map((p, i) => 
          p.toLowerCase() === searchQuery.toLowerCase() ? (
            <mark key={i} className="bg-amber-400/90 text-slate-900 font-extrabold px-1 rounded-[3px] shadow-sm select-all">
              {p}
            </mark>
          ) : (
            p
          )
        )}
      </>
    );
  };

  function escapeRegExp(str: string) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Eye-friendly, stunning background color theme setups
  const themeStyles = {
    slate: {
      outer: 'bg-[#0E132A] text-[#F1F5F9]', // A softer, beautiful Slate-900 canvas
      progressBar: 'bg-[#0C2624] border-[#16253B]',
      progressBarLeftText: 'text-white',
      progressBarSubText: 'text-slate-400',
      progressBg: 'bg-[#1B2349]',
      controlBar: 'bg-[#0A0E1F]/95 border-[#16253B]',
      searchInputBg: 'bg-[#0C2624] border-[#16253B] text-white',
      sidebarBg: 'bg-[#0A0D1D] border-[#16253B]',
      sidebarHeaderBg: 'bg-[#080B16] border-[#16253B]',
      tabButtonActive: 'bg-[#121835] border-sky-500/50 text-white shadow-lg shadow-sky-500/5',
      tabButtonInactive: 'bg-transparent border-transparent text-slate-300 hover:bg-[#11162C]/50 hover:text-white',
      tabTextTitleActive: 'text-white',
      tabTextTitleInactive: 'text-slate-400',
      mainContentArea: 'bg-[#080B16]',
      headerBlock: 'bg-gradient-to-br from-[#0C2624] to-[#0A0D1D] border-[#16253B] shadow-xl',
      headerTitle: 'text-white',
      headerDesc: 'text-slate-300',
      headerSummary: 'text-slate-400',
      stepBlock: 'bg-[#0E1325]/50 border-[#16253B] hover:bg-[#0E132D] hover:border-[#202E5C]',
      stepTitle: 'text-white',
      stepDesc: 'text-slate-400',
      calloutTip: 'bg-sky-500/5 border border-sky-500/20 text-sky-300',
      calloutWarning: 'bg-amber-500/5 border border-amber-500/20 text-amber-300',
      calloutAlert: 'bg-rose-500/5 border border-rose-500/20 text-rose-300',
      buttonSecondary: 'bg-[#0C2624] border-[#16253B] hover:border-slate-400 hover:text-white hover:bg-[#1D2748] text-slate-300',
      readButtonSelected: 'bg-emerald-500/10 border-emerald-500/35 text-emerald-400 hover:bg-emerald-500/20',
      subHeaderTitle: 'text-slate-400'
    },
    grey: {
      outer: 'bg-[#1F2228] text-[#F1F5F9]', // A modern, pure eye-friendly warm Grey canvas
      progressBar: 'bg-[#2A2E37] border-[#393E4A]',
      progressBarLeftText: 'text-white',
      progressBarSubText: 'text-[#94A3B8]',
      progressBg: 'bg-[#3D4452]',
      controlBar: 'bg-[#1A1D22]/95 border-[#393E4A]',
      searchInputBg: 'bg-[#2A2E37] border-[#393E4A] text-white',
      sidebarBg: 'bg-[#1A1D22] border-[#393E4A]',
      sidebarHeaderBg: 'bg-[#15171C] border-[#393E4A]',
      tabButtonActive: 'bg-[#2A2E37] border-sky-500/50 text-white shadow-lg shadow-sky-500/5',
      tabButtonInactive: 'bg-transparent border-transparent text-[#94A3B8] hover:bg-[#2A2E37]/50 hover:text-white',
      tabTextTitleActive: 'text-white',
      tabTextTitleInactive: 'text-[#94A3B8]',
      mainContentArea: 'bg-[#15171C]',
      headerBlock: 'bg-gradient-to-br from-[#2A2E37] to-[#15171C] border-[#393E4A] shadow-xl',
      headerTitle: 'text-white',
      headerDesc: 'text-slate-300',
      headerSummary: 'text-slate-400',
      stepBlock: 'bg-[#2A2E37]/50 border-[#393E4A] hover:bg-[#2A2E37] hover:border-[#4F5768]',
      stepTitle: 'text-white',
      stepDesc: 'text-[#CBD5E1]',
      calloutTip: 'bg-sky-500/10 border border-sky-500/25 text-sky-300',
      calloutWarning: 'bg-amber-500/10 border border-amber-500/25 text-amber-300',
      calloutAlert: 'bg-rose-500/10 border border-rose-500/25 text-rose-300',
      buttonSecondary: 'bg-[#2A2E37] border-[#393E4A] hover:border-slate-300 hover:text-white hover:bg-[#393E4A] text-[#CBD5E1]',
      readButtonSelected: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/25',
      subHeaderTitle: 'text-[#E2E8F0]'
    },
    ivory: {
      outer: 'bg-[#F1F5F9] text-[#1E293B]', // Crisp eye-friendly light/slate theme
      progressBar: 'bg-white border-[#E2E8F0] shadow-sm',
      progressBarLeftText: 'text-[#0F172A]',
      progressBarSubText: 'text-slate-500',
      progressBg: 'bg-slate-200',
      controlBar: 'bg-[#F8FAFC]/95 border-[#E2E8F0]',
      searchInputBg: 'bg-white border-slate-300 text-slate-800 placeholder-slate-400 hover:border-slate-400',
      sidebarBg: 'bg-[#F8FAFC] border-[#E2E8F0]',
      sidebarHeaderBg: 'bg-[#F1F5F9] border-[#E2E8F0]',
      tabButtonActive: 'bg-white border-sky-400 text-sky-950 shadow-md shadow-sky-500/5',
      tabButtonInactive: 'bg-transparent border-transparent text-slate-600 hover:bg-slate-200/50 hover:text-slate-900',
      tabTextTitleActive: 'text-slate-950',
      tabTextTitleInactive: 'text-slate-700',
      mainContentArea: 'bg-[#FAFBFD]',
      headerBlock: 'bg-gradient-to-br from-[#F1F5F9] to-white border-slate-200 shadow-md shadow-slate-100',
      headerTitle: 'text-[#0F172A]',
      headerDesc: 'text-slate-700',
      headerSummary: 'text-slate-500',
      stepBlock: 'bg-white border-slate-200 hover:bg-[#F1F5F9] hover:border-slate-300',
      stepTitle: 'text-[#0F172A]',
      stepDesc: 'text-slate-600',
      calloutTip: 'bg-sky-50/70 border border-sky-200 text-sky-900',
      calloutWarning: 'bg-amber-50/70 border border-amber-200 text-amber-900',
      calloutAlert: 'bg-rose-50/70 border border-rose-200 text-rose-900',
      buttonSecondary: 'bg-white border-slate-200 hover:border-slate-400 hover:text-slate-950 hover:bg-slate-50 text-slate-700',
      readButtonSelected: 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100/80',
      subHeaderTitle: 'text-slate-500'
    },
    sepia: {
      outer: 'bg-[#F4EFE0] text-[#2D241E]', // Warm paper sepia layout
      progressBar: 'bg-[#EAE1D1] border-[#C3B29D]',
      progressBarLeftText: 'text-[#1E150F]',
      progressBarSubText: 'text-[#6B5A4E]',
      progressBg: 'bg-[#DFCDB4]',
      controlBar: 'bg-[#F1EAD9]/95 border-[#C3B29D]',
      searchInputBg: 'bg-white border-[#CDBBA5] text-[#2D241E] placeholder-[#8C7A67] hover:border-[#8C7A67]',
      sidebarBg: 'bg-[#F1EAD9] border-[#C3B29D]',
      sidebarHeaderBg: 'bg-[#EAE1D1] border-[#C3B29D]',
      tabButtonActive: 'bg-[#FAF6EE] border-[#8C7A67]/50 text-[#1E150F] shadow-sm',
      tabButtonInactive: 'bg-transparent border-transparent text-[#615243] hover:bg-[#EAE2D2] hover:text-[#1E150F]',
      tabTextTitleActive: 'text-[#1E150F]',
      tabTextTitleInactive: 'text-[#3D3025]',
      mainContentArea: 'bg-[#FAF6EE]',
      headerBlock: 'bg-gradient-to-br from-[#F5EEDC] to-white border-[#D5C6AF] shadow-md',
      headerTitle: 'text-[#1E150F]',
      headerDesc: 'text-[#3D3025]',
      headerSummary: 'text-[#6B5A4E]',
      stepBlock: 'bg-white border-[#E8DDCD] hover:bg-[#FAF5E6] hover:border-[#D5C6AF]',
      stepTitle: 'text-[#1E150F]',
      stepDesc: 'text-[#4A3B30]',
      calloutTip: 'bg-[#F1F9FF] border border-[#B6DFFF] text-[#004B8F]',
      calloutWarning: 'bg-[#FFF9E6] border border-[#FFE896] text-[#7A5B00]',
      calloutAlert: 'bg-[#FFF0F2] border border-[#FFCCD4] text-[#9A0025]',
      buttonSecondary: 'bg-[#EAE1D1] border-[#C3B29D] hover:border-[#8C7A67] hover:text-[#1E150F] hover:bg-white text-[#2D241E]',
      readButtonSelected: 'bg-[#E6F4EA] border-[#A8E2B2] text-[#137333] hover:bg-[#D5EED8]',
      subHeaderTitle: 'text-[#6B5A4E]'
    }
  };

  const styles = themeStyles[theme];

  // Get active section content
  const activeSection = manualSections.find(s => s.id === selectedSectionId) || manualSections[0];

  return (
    <div className={`flex flex-col h-full ${styles.outer} manual-root font-sans print:bg-white print:text-black overflow-hidden relative`}>
      
      {/* Dynamic Progress Bar at the top */}
      <div className={`w-full ${styles.progressBar} border-b px-4 py-3 flex items-center justify-between shrink-0 print:hidden z-10 gap-3`}>
        <div className="flex items-center gap-2.5">
          <BookOpen className="text-sky-400" size={20} />
          <div>
            <h1 className={`text-xs font-black uppercase ${styles.progressBarLeftText} tracking-widest leading-none`}>Manual de Sistema Interativo</h1>
            <p className={`text-[10px] ${styles.progressBarSubText} font-medium mt-1`}>Sabush System ERP • Guia Operacional Português</p>
          </div>
        </div>

        {/* Real Live counts summary as banner data */}
        <div className={`hidden lg:flex items-center gap-4 text-[10px] font-mono font-bold ${theme === 'slate' ? 'bg-[#1B2349]/45 border-[#202B59]/60' : theme === 'grey' ? 'bg-[#2A2E37]/50 border-[#393E4A]' : theme === 'ivory' ? 'bg-slate-100 border-slate-250' : 'bg-[#EAE1D1]/60 border-[#C3B29D]'} border px-3 py-1 rounded-xl`}>
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            <span className={`${theme === 'slate' || theme === 'grey' ? 'text-slate-400' : theme === 'ivory' ? 'text-slate-500' : 'text-[#6B5A4E]'}`}>Total Produtos:</span>
            <span className="text-emerald-500 font-black">{dbStats.products}</span>
          </div>
          <div className={`flex items-center gap-1 border-l ${theme === 'slate' ? 'border-[#202B59]/60' : theme === 'grey' ? 'border-[#393E4A]' : theme === 'ivory' ? 'border-slate-200' : 'border-[#C3B29D]'} pl-3`}>
            <span className={`${theme === 'slate' || theme === 'grey' ? 'text-slate-400' : theme === 'ivory' ? 'text-slate-500' : 'text-[#6B5A4E]'}`}>Clientes CRM:</span>
            <span className="text-sky-400 font-black">{dbStats.customers}</span>
          </div>
          <div className={`flex items-center gap-1 border-l ${theme === 'slate' ? 'border-[#202B59]/60' : theme === 'grey' ? 'border-[#393E4A]' : theme === 'ivory' ? 'border-slate-200' : 'border-[#C3B29D]'} pl-3`}>
            <span className={`${theme === 'slate' || theme === 'grey' ? 'text-slate-400' : theme === 'ivory' ? 'text-slate-500' : 'text-[#6B5A4E]'}`}>Filiais Activas:</span>
            <span className="text-violet-500 font-black">{dbStats.branches}</span>
          </div>
          <div className={`flex items-center gap-1 border-l ${theme === 'slate' ? 'border-[#202B59]/60' : theme === 'grey' ? 'border-[#393E4A]' : theme === 'ivory' ? 'border-slate-200' : 'border-[#C3B29D]'} pl-3`}>
            <span className={`${theme === 'slate' || theme === 'grey' ? 'text-slate-400' : theme === 'ivory' ? 'text-slate-500' : 'text-[#6B5A4E]'}`}>Backups de Dados:</span>
            <span className="text-purple-500 font-black">{dbStats.backups}</span>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right hidden sm:block">
            <div className={`text-[10px] ${styles.progressBarSubText} font-black uppercase tracking-wider`}>Leitura Completa</div>
            <div className="text-xs font-black text-sky-400 mt-0.5">{readPercentage}% ({readCount}/{totalSections})</div>
          </div>
          <div className={`w-24 sm:w-32 ${styles.progressBg} h-2.5 rounded-full overflow-hidden border ${theme === 'slate' ? 'border-[#202B59]/60' : theme === 'grey' ? 'border-[#393E4A]' : theme === 'ivory' ? 'border-slate-300' : 'border-[#C3B29D]'} shadow-inner`}>
            <div 
              className="bg-gradient-to-r from-sky-500 to-emerald-400 h-full rounded-full transition-all duration-500"
              style={{ width: `${readPercentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* Control Actions & Mobile Search Trigger */}
      <div className={`${styles.controlBar} border-b px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between shrink-0 gap-3 z-10 print:hidden`}>
        
        {/* Mobile Sidebar Toggle & Search Input Combination */}
        <div className="flex items-center gap-2 w-full sm:max-w-md">
          <button 
            onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
            className={`md:hidden p-2 ${styles.buttonSecondary} rounded-xl transition-all focus:ring-2 focus:ring-sky-500 shrink-0 cursor-pointer`}
            title="Mostrar Lista"
          >
            {mobileSidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
 
          <div className="relative w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text"
              placeholder="Pesquise por qualquer palavra-chave..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full pl-9 pr-8 py-2 ${styles.searchInputBg} rounded-2xl text-xs focus:ring-2 focus:ring-sky-500 outline-none font-medium transition-all`}
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 text-xs cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>
 
        {/* Global actions */}
        <div className="flex items-center justify-end gap-3 shrink-0 flex-wrap sm:flex-nowrap">
          {searchTerm && (
            <span className="text-[10px] bg-amber-500/10 border border-amber-500/25 text-amber-400 px-3 py-1.5 rounded-xl font-bold font-mono">
              🔍 {filteredSections.length} Tópico(s)
            </span>
          )}

          {/* Aesthetic Theme Switcher Group */}
          <div className={`flex items-center gap-0.5 ${theme === 'slate' ? 'bg-[#0C2624] border-[#16253B]' : theme === 'grey' ? 'bg-[#2A2E37] border-[#393E4A]' : theme === 'ivory' ? 'bg-slate-200 border-slate-300' : 'bg-[#EAE1D1] border-[#C3B29D]'} border p-1 rounded-xl shrink-0`}>
            <button 
              onClick={() => changeTheme('slate')}
              className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${theme === 'slate' ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
              title="Tema Original Escuro Suave"
            >
              🌌 Escuro
            </button>
            <button 
              onClick={() => changeTheme('grey')}
              className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${theme === 'grey' ? 'bg-slate-500 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
              title="Tema Cinza Premium Confortável"
            >
              🩶 Cinza
            </button>
            <button 
              onClick={() => changeTheme('ivory')}
              className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${theme === 'ivory' ? 'bg-white text-slate-950 border border-slate-200 shadow' : 'text-slate-500 hover:text-slate-900'}`}
              title="Tema Claro Nítido e Confortável"
            >
              💡 Claro
            </button>
            <button 
              onClick={() => changeTheme('sepia')}
              className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${theme === 'sepia' ? 'bg-[#FAF6EE] text-[#1E150F] border border-[#D5C6AF]/50 shadow' : 'text-slate-400 hover:text-[#1E150F]'}`}
              title="Tema Livro/Sepia Especial de Leitura"
            >
              🪵 Sepia
            </button>
          </div>
 
          {/* Download Dropdown Selection */}
          <div className="relative">
            <button 
              onClick={() => setIsDownloadOpen(!isDownloadOpen)}
              className="px-4 py-2 bg-sky-650 hover:bg-sky-600 border border-sky-500/30 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shadow-md"
              title="Descarregar Manual de Utilizador"
            >
              <Download size={14} />
              <span className="hidden xs:inline">Descarregar</span>
              <ChevronRight size={12} className={`transition-transform duration-200 ${isDownloadOpen ? 'rotate-90' : 'rotate-0'}`} />
            </button>
 
            {isDownloadOpen && (
              <>
                {/* Backdrop overlay for easier click-away */}
                <div 
                  className="fixed inset-0 z-40 bg-transparent" 
                  onClick={() => setIsDownloadOpen(false)}
                />
                <div className={`absolute right-0 mt-2 w-72 ${theme === 'slate' ? 'bg-[#0E132A] border-[#1E274D]' : theme === 'grey' ? 'bg-[#252A34] border-[#393E4A]' : theme === 'ivory' ? 'bg-white border-slate-250 shadow-slate-200' : 'bg-[#FAF6EE] border-[#D5C6AF]'} border rounded-2xl shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150 text-left`}>
                  <div className={`px-3.5 py-2 border-b ${theme === 'slate' ? 'border-[#1E274D]' : theme === 'grey' ? 'border-[#393E4A]' : theme === 'ivory' ? 'border-slate-100' : 'border-[#D5C6AF]/40'} mb-1.5`}>
                    <p className={`text-[9px] font-black ${theme === 'slate' || theme === 'grey' ? 'text-slate-400' : 'text-slate-500'} uppercase tracking-widest leading-none`}>Formatos Disponíveis</p>
                    <p className="text-[10px] m-0 mt-1">Descarregue o guia para ler offline:</p>
                  </div>
 
                  <button
                    onClick={() => {
                      triggerDownloadPDF();
                      setIsDownloadOpen(false);
                    }}
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs ${theme === 'slate' ? 'hover:bg-[#1C234C]' : theme === 'grey' ? 'hover:bg-[#323946]' : theme === 'ivory' ? 'hover:bg-[#F1F5F9]' : 'hover:bg-[#F5EEDC]'} transition-all flex items-start gap-2.5 group cursor-pointer`}
                  >
                    <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-500 shrink-0">
                      <FileText size={15} />
                    </div>
                    <div>
                      <p className={`font-extrabold text-[11px] leading-tight ${theme === 'slate' || theme === 'grey' ? 'text-white' : 'text-slate-900'}`}>Documento PDF Oficial (A4)</p>
                      <p className={`text-[9px] ${theme === 'slate' || theme === 'grey' ? 'text-slate-400' : 'text-slate-500'} m-0 mt-1`}>Manual completo formatado, pronto para ler ou imprimir.</p>
                    </div>
                  </button>
 
                  <button
                    onClick={() => {
                      triggerDownloadMarkdown();
                      setIsDownloadOpen(false);
                    }}
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs ${theme === 'slate' ? 'hover:bg-[#1C234C]' : theme === 'grey' ? 'hover:bg-[#323946]' : theme === 'ivory' ? 'hover:bg-[#F1F5F9]' : 'hover:bg-[#F5EEDC]'} transition-all flex items-start gap-2.5 group cursor-pointer mt-1`}
                  >
                    <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-500 shrink-0">
                      <BookOpen size={15} />
                    </div>
                    <div>
                      <p className={`font-extrabold text-[11px] leading-tight ${theme === 'slate' || theme === 'grey' ? 'text-white' : 'text-slate-900'}`}>Guia Simplificado (Markdown)</p>
                      <p className={`text-[9px] ${theme === 'slate' || theme === 'grey' ? 'text-slate-400' : 'text-slate-500'} m-0 mt-1`}>Ficheiro de texto leve ideal para consulta rápida em qualquer leitor.</p>
                    </div>
                  </button>
                </div>
              </>
            )}
          </div>
 
          <button 
            onClick={triggerPrintManual}
            className={`px-4 py-2 ${styles.buttonSecondary} text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shadow-md`}
          >
            <Printer size={14} />
            <span className="hidden md:inline">Imprimir</span>
          </button>
        </div>
      </div>

      {/* Main Structural Body */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* Left Drawer Navigation Panel - Hidden on Mobile unless triggered */}
        <div className={`
          absolute md:relative inset-y-0 left-0 w-72 md:w-80 ${styles.sidebarBg} border-r flex flex-col z-[100] transition-transform duration-300 ease-out shrink-0 print:hidden
          ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}>
          
          <div className={`p-4 border-b ${styles.sidebarHeaderBg} flex items-center justify-between shrink-0`}>
            <h2 className={`text-xs font-black uppercase ${theme === 'slate' || theme === 'grey' ? 'text-slate-400' : theme === 'ivory' ? 'text-slate-500' : 'text-[#6B5A4E]'} tracking-widest flex items-center gap-2`}>
              <span>📚 Tabela de Conteúdos</span>
            </h2>
            <button 
              onClick={() => setMobileSidebarOpen(false)}
              className="md:hidden p-1.5 hover:bg-slate-500/15 rounded-lg text-slate-400 hover:text-white transition-all cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>
 
          {/* Section Buttons scrollable container */}
          <div className="flex-1 overflow-y-auto p-2.5 space-y-1 custom-scrollbar">
            {filteredSections.map((sec, idx) => {
              const IconComp = sec.icon;
              const isSelected = sec.id === selectedSectionId;
              const isRead = readSections[sec.id];
              return (
                <button
                  key={sec.id}
                  onClick={() => changeSection(sec.id)}
                  className={`
                    w-full text-left p-3 rounded-2xl flex items-center justify-between border transition-all duration-150 cursor-pointer text-xs
                    ${isSelected 
                      ? styles.tabButtonActive 
                      : styles.tabButtonInactive
                    }
                  `}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className={`p-2 rounded-xl shrink-0 ${isSelected ? sec.iconBg : theme === 'slate' ? 'bg-slate-800/40' : theme === 'grey' ? 'bg-[#2A2E37]' : theme === 'ivory' ? 'bg-slate-200' : 'bg-[#EAE1D2]'} ${sec.iconColor}`}>
                      <IconComp size={16} />
                    </span>
                    <div className="truncate min-w-0 flex-1">
                      <p className={`font-black ${isSelected ? styles.tabTextTitleActive : styles.tabTextTitleInactive}`}>
                        {highlightWord(sec.title.split('. ')[1] || sec.title, searchTerm)}
                      </p>
                      <p className={`text-[10px] ${theme === 'slate' || theme === 'grey' ? 'text-slate-400' : theme === 'ivory' ? 'text-slate-500' : 'text-[#6B5A4E]'} truncate mt-0.5 font-medium leading-none`}>
                        {sec.category}
                      </p>
                    </div>
                  </div>
 
                  {/* Indicator icons indicating reading status */}
                  <div className="ml-2 shrink-0 flex items-center gap-1.5">
                    {isRead ? (
                      <span className="w-5 h-5 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center text-emerald-500 shadow-inner" title="Lido">
                        <Check size={11} className="stroke-[3]" />
                      </span>
                    ) : (
                      <span className={`w-2.5 h-2.5 rounded-full ${theme === 'slate' ? 'bg-slate-800 border-slate-700' : theme === 'grey' ? 'bg-neutral-800 border-neutral-700' : theme === 'ivory' ? 'bg-slate-200 border-slate-300' : 'bg-[#EAE2D2] border-[#C3B29D]'} border`} title="Não Lido" />
                    )}
                    <ChevronRight size={13} className={`text-slate-500 transition-transform ${isSelected ? 'transform translate-x-0.5' : ''}`} />
                  </div>
                </button>
              );
            })}
 
            {filteredSections.length === 0 && (
              <div className="p-6 text-center text-slate-500 space-y-2">
                <p className="font-extrabold text-sm text-slate-400">Nenhum resultado</p>
                <p className="text-[10px] leading-relaxed font-semibold">Não encontramos nenhum termo correspondente nas seções do manual.</p>
                <button 
                  onClick={() => setSearchTerm('')}
                  className={`px-3 py-1.5 ${styles.buttonSecondary} text-[10px] font-bold rounded-xl transition-all cursor-pointer`}
                >
                  Limpar pesquisa
                </button>
              </div>
            )}
          </div>
 
          {/* Quick status footer block */}
          <div className={`p-4 ${styles.sidebarHeaderBg} border-t shrink-0 text-[10px] text-slate-400 font-mono text-center select-none`}>
            SABUSH ERP MANUAL • v3.1 PRO
          </div>
        </div>
 
        {/* Overlay for mobile drawer */}
        {mobileSidebarOpen && (
          <div 
            onClick={() => setMobileSidebarOpen(false)}
            className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-[90]"
          />
        )}
 
        {/* Right Content Sheet Pane */}
        <div 
          ref={contentAreaRef}
          className={`flex-1 ${styles.mainContentArea} overflow-y-auto p-4 sm:p-8 custom-scrollbar relative select-text`}
        >
          {/* Scroll wrapper to keep centered layout */}
          <div className="max-w-3xl mx-auto space-y-8 pb-20 print:p-0 print:pb-0">
            
            {/* Elegant Header Block */}
            <div className={`${styles.headerBlock} rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-xl shadow-black/10`}>
              
              {/* Background ambient light */}
              <div className="absolute right-0 top-0 w-48 h-48 bg-sky-500/15 rounded-full blur-3xl pointer-events-none select-none" />
              
              <div className="relative space-y-4 text-left">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <span className={`p-4 rounded-2xl ${activeSection.iconBg} ${activeSection.iconColor} shadow-inner`}>
                      {React.createElement(activeSection.icon, { size: 32, className: "stroke-[1.5]" })}
                    </span>
                    <div>
                      <span className="px-2.5 py-1 bg-sky-500/10 border border-sky-550/20 text-sky-500 text-[9px] font-black uppercase rounded-lg tracking-widest font-mono">
                        {activeSection.category}
                      </span>
                      <h2 className={`text-lg sm:text-xl font-black ${styles.subHeaderTitle} tracking-tight mt-1 ml-0.5 max-w-full`}>
                        {highlightWord(activeSection.title, searchTerm)}
                      </h2>
                    </div>
                  </div>
 
                  {/* Mark as read state */}
                  <button
                    onClick={() => toggleReadStatus(activeSection.id)}
                    className={`
                      px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer select-none active:scale-95 border
                      ${readSections[activeSection.id]
                        ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-450 hover:bg-emerald-500/20'
                        : `${styles.buttonSecondary} focus:ring-2 focus:ring-sky-500`
                      }
                    `}
                  >
                    {readSections[activeSection.id] ? (
                      <>
                        <CheckSquare size={16} />
                        <span>Lido ✓</span>
                      </>
                    ) : (
                      <>
                        <span className={`w-4 h-4 border-2 ${theme === 'slate' || theme === 'grey' ? 'border-slate-500' : theme === 'ivory' ? 'border-slate-400' : 'border-[#9E8B75]'} rounded`} />
                        <span>Marcar Lido</span>
                      </>
                    )}
                  </button>
                </div>
 
                <div className={`h-px ${theme === 'slate' ? 'bg-[#16253B]/70' : theme === 'grey' ? 'bg-[#393E4A]/70' : theme === 'ivory' ? 'bg-slate-200' : 'bg-[#D5C6AF]/40'}`} />
 
                <p className={`${theme === 'slate' || theme === 'grey' ? 'text-slate-300' : theme === 'ivory' ? 'text-slate-700' : 'text-[#4A3E34]'} text-xs sm:text-sm leading-relaxed font-semibold`}>
                  {highlightWord(activeSection.description, searchTerm)}
                </p>
 
                <p className={`text-[10px] ${theme === 'slate' || theme === 'grey' ? 'text-slate-400' : theme === 'ivory' ? 'text-slate-500' : 'text-[#6B5A4E]'} font-bold font-mono`}>
                  ✏️ {activeSection.summary}
                </p>
 
                <div className={`h-px ${theme === 'slate' ? 'bg-[#16253B]/70' : theme === 'grey' ? 'bg-[#393E4A]/70' : theme === 'ivory' ? 'bg-slate-200' : 'bg-[#D5C6AF]/40'} my-3`} />
 
                {/* Interactive Feature Mockup Canvas */}
                <div className="space-y-2 text-left">
                  <div className="text-[9px] font-mono font-black text-sky-500 uppercase tracking-widest flex items-center gap-1.5 select-none">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Maquete Visual e Apontadores de Detalhe • Sabush ERP</span>
                  </div>
                  <FeatureMockup sectionId={activeSection.id} />
                </div>
              </div>
            </div>

            {/* CALLOUT BOXES - TIPS, WARNINGS, DANGERS (Render top of steps) */}
            {activeSection.boxes && activeSection.boxes.length > 0 && (
              <div className="space-y-3">
                {activeSection.boxes.map((box, bIdx) => {
                  if (box.type === 'tip') {
                    return (
                      <div key={bIdx} className={`${styles.calloutTip} p-4 rounded-2xl flex items-start gap-3.5 text-left text-xs animate-in fade-in duration-200`}>
                        <Sparkles size={18} className="shrink-0 mt-0.5 stroke-[2.5]" />
                        <div className="space-y-1">
                          <p className="font-black uppercase tracking-widest text-[9px] opacity-90">DICA DE SISTEMA</p>
                          <p className="leading-relaxed font-semibold">{highlightWord(box.text.replace('DICA: ', ''), searchTerm)}</p>
                        </div>
                      </div>
                    );
                  } else if (box.type === 'warning') {
                    return (
                      <div key={bIdx} className={`${styles.calloutWarning} p-4 rounded-2xl flex items-start gap-3.5 text-left text-xs animate-in fade-in duration-200`}>
                        <AlertTriangle size={18} className="shrink-0 mt-0.5 stroke-[2.5]" />
                        <div className="space-y-1">
                          <p className="font-black uppercase tracking-widest text-[9px] opacity-90">DIRETRIZ IMPORTANTE</p>
                          <p className="leading-relaxed font-semibold">{highlightWord(box.text.replace('AVISO: ', ''), searchTerm)}</p>
                        </div>
                      </div>
                    );
                  } else {
                    return (
                      <div key={bIdx} className={`${styles.calloutAlert} p-4 rounded-2xl flex items-start gap-3.5 text-left text-xs animate-in fade-in duration-200`}>
                        <AlertCircle size={18} className="shrink-0 mt-0.5 stroke-[2.5]" />
                        <div className="space-y-1">
                          <p className="font-black uppercase tracking-widest text-[9px] opacity-90">ALERTA CRÍTICO DE SEGURANÇA</p>
                          <p className="leading-relaxed font-bold">{highlightWord(box.text.replace('ATENÇÃO: ', ''), searchTerm)}</p>
                        </div>
                      </div>
                    );
                  }
                })}
              </div>
            )}

            {/* STEP-BY-STEP NUMERICAL INSTRUCTIONS */}
            <div className="space-y-4">
              <h3 className={`text-xs font-black uppercase ${theme === 'slate' || theme === 'grey' ? 'text-slate-400' : theme === 'ivory' ? 'text-slate-500' : 'text-[#6B5A4E]'} tracking-widest text-left`}>
                ⚙️ Manual Operacional Passo a Passo
              </h3>

              <div className="space-y-3.5 pb-8">
                {activeSection.steps.map((step) => {
                  const stepMatchesText = searchTerm && (
                    step.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    step.desc.toLowerCase().includes(searchTerm.toLowerCase())
                  );

                  return (
                    <div 
                      key={step.num}
                      className={`
                        p-5 rounded-2xl border text-left flex items-start gap-4 transition-all duration-200
                        ${stepMatchesText 
                          ? 'bg-amber-500/5 border-amber-500/30 shadow-md shadow-amber-500/5' 
                          : styles.stepBlock
                        }
                      `}
                    >
                      <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400 text-xs font-black shrink-0 border border-sky-500/20 font-mono shadow-inner select-none">
                        {step.num}
                      </div>
                      
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <h4 className={`text-xs font-black ${styles.stepTitle} tracking-normal font-sans`}>
                          {highlightWord(step.title, searchTerm)}
                        </h4>
                        <p className={`${styles.stepDesc} text-xs leading-relaxed font-medium`}>
                          {highlightWord(step.desc, searchTerm)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Back to Top & Pagination helpers */}
            <div className={`flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t ${theme === 'slate' ? 'border-[#16253B]' : theme === 'grey' ? 'border-[#393E4A]' : theme === 'ivory' ? 'border-slate-200' : 'border-[#D5C6AF]/35'} select-none`}>
              <div className="text-[10px] font-mono text-slate-500">
                SABUSH MANUAL DE UTILIZADOR • LICENÇA OFICIAL
              </div>

              <div className="flex items-center gap-3">
                <button 
                  onClick={() => {
                    const currentIdx = manualSections.findIndex(s => s.id === selectedSectionId);
                    if (currentIdx > 0) {
                      changeSection(manualSections[currentIdx - 1].id);
                    }
                  }}
                  disabled={manualSections.findIndex(s => s.id === selectedSectionId) === 0}
                  className={`px-3.5 py-2 ${styles.buttonSecondary} rounded-xl disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold transition-all cursor-pointer active:scale-95 flex items-center gap-1.5`}
                >
                  ◀ Anterior
                </button>

                <button 
                  onClick={() => {
                    const currentIdx = manualSections.findIndex(s => s.id === selectedSectionId);
                    if (currentIdx < manualSections.length - 1) {
                      changeSection(manualSections[currentIdx + 1].id);
                    }
                  }}
                  disabled={manualSections.findIndex(s => s.id === selectedSectionId) === manualSections.length - 1}
                  className={`px-3.5 py-2 ${styles.buttonSecondary} rounded-xl disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold transition-all cursor-pointer active:scale-95 flex items-center gap-1.5`}
                >
                  Seguinte ▶
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* Floating Scroll to Top Button */}
        {showScrollTop && (
          <button
            onClick={scrollToTop}
            className="absolute bottom-6 right-6 p-3 bg-sky-500 hover:bg-sky-600 border border-sky-400/30 text-white rounded-2xl shadow-xl hover:shadow-sky-500/20 transition-all z-20 cursor-pointer animate-bounce group"
            title="Sobe para o Topo"
          >
            <ArrowUp size={18} className="transform group-hover:scale-110 duration-150" />
          </button>
        )}

      </div>

      {/* COMPREHENSIVE STYLE BLOCKS FOR CHROMIUM PRINT ACTIONS */}
      <style>{`
        @media print {
          body, select-text, .print\\:text-black {
            color: #000000 !important;
            background: #ffffff !important;
          }
          .print\\:hidden, header, footer, aside, nav, button, input {
            display: none !important;
          }
          #preview-print-document {
            display: block !important;
          }
          /* Custom layout for direct PDF outputs */
          @page {
            size: A4;
            margin: 1.5cm;
          }
        }
      `}</style>
    </div>
  );
}
