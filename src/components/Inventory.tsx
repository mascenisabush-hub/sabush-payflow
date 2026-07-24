import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'motion/react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { subscribeToCollection } from '../lib/firestoreCache';
import { offlineDb } from '../lib/offlineDb';
import { collection, query, onSnapshot, addDoc, serverTimestamp, updateDoc, doc, deleteDoc, orderBy, limit } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { Plus, Search, Package, AlertTriangle, Edit2, Trash2, Tag, Barcode, DollarSign, Users, ShoppingBag, Sliders, Check, Loader2, ArrowRight, Download, RefreshCw, Grid, List, ShieldAlert, Lock, X, FileText, Camera, Sparkles, Upload, Printer, History, Calendar, Globe, Copy, Filter, ChevronDown, MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { logAction, ActionType } from '../lib/logger';
import ManagerPINModal from './ManagerPINModal';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import JsBarcode from 'jsbarcode';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const getUnidadeDeCompraSuggestions = (name: string = '', category: string = ''): string[] => {
  const nameLower = (name || '').toLowerCase();
  const categoryLower = (category || '').toLowerCase();
  const suggestions: string[] = [];

  if (nameLower.includes('arroz') || nameLower.includes('feijão') || nameLower.includes('feijao') || nameLower.includes('açúcar') || nameLower.includes('acucar') || nameLower.includes('farinha')) {
    suggestions.push('Saco', 'Fardo', 'Cx');
  }
  if (nameLower.includes('água') || nameLower.includes('agua') || nameLower.includes('sumo') || nameLower.includes('refrigerante') || nameLower.includes('cerveja')) {
    suggestions.push('Cx', 'Vol', 'Fardo');
  }
  if (nameLower.includes('bolacha') || nameLower.includes('snack') || nameLower.includes('chocolate')) {
    suggestions.push('Cx', 'Emb', 'Fardo');
  }
  if (categoryLower.includes('bebida')) {
    suggestions.push('Cx', 'Vol', 'Garrafa');
  }
  if (categoryLower.includes('mercearia')) {
    suggestions.push('Saco', 'Cx', 'Fardo', 'Emb');
  }

  const defaults = ['Cx', 'Emb', 'Fardo', 'Saco', 'Vol', 'Un', 'Garrafa', 'Kg', 'Lt'];
  const all = [...suggestions, ...defaults];
  return Array.from(new Set(all));
};

// Base/retail unit of measure suggestions — the unit a product is actually SOLD in at retail
// (e.g. "Un", "Kg", "Litro", "Metro"...). Kept separate from purchase/wholesale unit suggestions
// because a product's base sale unit is very often not "Un" (fabrics, drinks, cereals, etc.),
// and previously this was hardcoded to "Un" everywhere, which is what let some products get
// saved without any real preço de venda when the business didn't sell by the unit at all.
const BASE_UNIT_SUGGESTIONS: string[] = [
  'Un', 'Kg', 'g', 'Litro', 'ml', 'Metro', 'Cm', 'Par', 'Dúzia', 'Caixa', 'Pacote', 'Rolo', 'Folha', 'Peça'
];

const getBaseUnitSuggestions = (name: string = '', category: string = ''): string[] => {
  const nameLower = (name || '').toLowerCase();
  const categoryLower = (category || '').toLowerCase();
  const suggestions: string[] = [];

  if (nameLower.includes('arroz') || nameLower.includes('açúcar') || nameLower.includes('acucar') || nameLower.includes('farinha') || nameLower.includes('cimento') || nameLower.includes('ração') || nameLower.includes('racao')) {
    suggestions.push('Kg', 'g');
  }
  if (nameLower.includes('água') || nameLower.includes('agua') || nameLower.includes('sumo') || nameLower.includes('óleo') || nameLower.includes('oleo') || nameLower.includes('leite') || categoryLower.includes('bebida')) {
    suggestions.push('Litro', 'ml');
  }
  if (nameLower.includes('tecido') || nameLower.includes('capulana') || nameLower.includes('fio') || nameLower.includes('cabo')) {
    suggestions.push('Metro', 'Cm');
  }
  if (nameLower.includes('sapato') || nameLower.includes('bota') || nameLower.includes('sandália') || nameLower.includes('sandalia') || nameLower.includes('meia')) {
    suggestions.push('Par', 'Dúzia');
  }

  const all = [...suggestions, ...BASE_UNIT_SUGGESTIONS];
  return Array.from(new Set(all));
};

const UOM_PRESETS = [
  {
    id: 'cx_emb_un',
    name: 'Cx - Emb - Un (Faturação Clássica)',
    description: 'Caixa, Embalagem, Unidade (Ideal para mercearias, eletrónicos, hotelaria, equipamentosmédicos, etc.)',
    boxUnitName: 'Caixa',
    boxUnitLabel: 'Cx',
    packUnitName: 'Embalagem',
    packUnitLabel: 'Emb',
    baseUnitName: 'Unidade',
    baseUnitLabel: 'Un',
    hasBoxUnit: true,
    hasPackUnit: true,
  },
  {
    id: 'cx_v_un',
    name: 'Cx - Volume - Un (Bebidas & Grossistas)',
    description: 'Caixa, Volume, Unidade (Ideal para distribuidoras de bebidas e armazéns)',
    boxUnitName: 'Caixa',
    boxUnitLabel: 'Cx',
    packUnitName: 'Volume',
    packUnitLabel: 'V',
    baseUnitName: 'Unidade',
    baseUnitLabel: 'Un',
    hasBoxUnit: true,
    hasPackUnit: true,
  },
  {
    id: 'saco_kg',
    name: 'Saco - Kg (Construção & Cereais)',
    description: 'Saco, Quilograma (Ideal para cimento, areia, rações, fuba, arroz em saco, etc.)',
    boxUnitName: 'Saco',
    boxUnitLabel: 'Saco',
    packUnitName: 'Saco Pequeno',
    packUnitLabel: 'Sac. Pq',
    baseUnitName: 'Quilograma',
    baseUnitLabel: 'Kg',
    hasBoxUnit: true,
    hasPackUnit: false,
  },
  {
    id: 'emb_kg',
    name: 'Emb - Kg (Alimentar & Químicos)',
    description: 'Embalagem, Quilograma (Ideal para farinhas empacotadas, rações animais pesadas, fertilizantes)',
    boxUnitName: 'Palete',
    boxUnitLabel: 'Palete',
    packUnitName: 'Embalagem',
    packUnitLabel: 'Emb',
    baseUnitName: 'Quilograma',
    baseUnitLabel: 'Kg',
    hasBoxUnit: false,
    hasPackUnit: true,
  },
  {
    id: 'custom',
    name: 'Outro / Personalizado',
    description: 'Defina as etiquetas de embalagem e conversão manualmente para qualquer ramo de atividade',
    boxUnitName: 'Caixa',
    boxUnitLabel: 'Cx',
    packUnitName: 'Embalagem',
    packUnitLabel: 'Emb',
    baseUnitName: 'Unidade',
    baseUnitLabel: 'Un',
    hasBoxUnit: true,
    hasPackUnit: true,
  }
];

export function getBarcodePattern(code: string): string {
  const charMap: Record<string, string> = {
    '0': '101001101101', '1': '110100101011', '2': '101100101011', '3': '110110010101',
    '4': '101001101011', '5': '110100110101', '6': '101100110101', '7': '101001011011',
    '8': '110100101101', '9': '101100101101', 'A': '110101001011', 'B': '101101001011',
    'C': '110110100101', 'D': '101011001011', 'E': '110101100101', 'F': '101101100101',
    'G': '101010011011', 'H': '110101001101', 'I': '101101001101', 'J': '101011001101',
    'K': '110101010011', 'L': '101101010011', 'M': '110110101001', 'N': '101011010011',
    'O': '110101101001', 'P': '101101101001', 'Q': '101010110011', 'R': '110101011001',
    'S': '101101011001', 'T': '101011011001', 'U': '110010101011', 'V': '100110101011',
    'W': '110011010101', 'X': '100101101011', 'Y': '110010110101', 'Z': '100110110101',
    '-': '100101011011', '.': '110010101101', ' ': '100110101101', '*': '100101101101',
  };
  const cleanCode = '*' + (code || 'SAB-0000').toUpperCase().replace(/[^0-9A-Z.\-\s]/g, '') + '*';
  let result = '';
  for (let i = 0; i < cleanCode.length; i++) {
    const char = cleanCode[i];
    result += (charMap[char] || charMap[' ']) + '0';
  }
  return result;
}

const matchCategoryToScheme = (cat: string) => {
  const c = cat.toLowerCase();
  if (c.includes('constru') || c.includes('cimento') || c.includes('areia') || c.includes('agr') || c.includes('cere') || c.includes('ração') || c.includes('saco') || c.includes('fub') || c.includes('arroz') || c.includes('feijao')) {
    return 'saco_kg';
  }
  if (c.includes('bebida') || c.includes('gross') || c.includes('volume') || c.includes('cerveja') || c.includes('sumo') || c.includes('agua')) {
    return 'cx_v_un';
  }
  if (c.includes('quim') || c.includes('aliment') || c.includes('farin') || c.includes('pet') || c.includes('kg') || c.includes('peso')) {
    return 'emb_kg';
  }
  if (c.includes('med') || c.includes('farm') || c.includes('hospital') || c.includes('equipman') || c.includes('remed') || c.includes('blister')) {
    return 'cx_emb_un';
  }
  return null;
};

const getReasonBadgeClass = (reason: string) => {
  switch (reason) {
    case 'expired':
      return 'bg-red-50 text-red-750 border-red-200/50';
    case 'broken':
      return 'bg-amber-50 text-amber-750 border-amber-200/50';
    case 'uncaped':
      return 'bg-blue-50 text-blue-750 border-blue-200/50';
    case 'half-filled':
      return 'bg-indigo-50 text-indigo-750 border-indigo-200/50';
    case 'defective':
      return 'bg-orange-50 text-orange-755 border-orange-200/50';
    default:
      return 'bg-slate-50 text-slate-755 border-slate-200/50';
  }
};

const getReasonLabel = (reason: string) => {
  switch (reason) {
    case 'expired': return '⏰ Expirado / Fora de Prazo';
    case 'broken': return '💥 Partido / Danificado';
    case 'uncaped': return '🧴 Aberto / Sem Tampa';
    case 'half-filled': return '🥤 Meio Cheio / Incompleto';
    case 'defective': return '🛠️ Defeito de Fabrico';
    case 'other': return '📝 Outro';
    default: return reason;
  }
};

const getReconciledBatches = (batches: any[], stockLevel: number) => {
  if (!batches || batches.length === 0) return [];
  const sorted = [...batches].sort((a, b) => {
    if (!a.expiryDate && !b.expiryDate) return 0;
    if (!a.expiryDate) return 1;
    if (!b.expiryDate) return -1;
    return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
  });
  
  let remainingStock = stockLevel || 0;
  return sorted.map(batch => {
    const qty = batch.quantity || 0;
    if (remainingStock <= 0) {
      return { ...batch, reconciledQty: 0 };
    } else if (remainingStock >= qty) {
      remainingStock -= qty;
      return { ...batch, reconciledQty: qty };
    } else {
      const allocated = remainingStock;
      remainingStock = 0;
      return { ...batch, reconciledQty: allocated };
    }
  });
};

const getProductExpiryStats = (product: any) => {
  const batches = product.batches || [];
  const reconciled = getReconciledBatches(batches, product.stockLevel);
  const activeBatches = reconciled.filter((b: any) => b.expiryDate && b.reconciledQty > 0);
  
  if (activeBatches.length === 0) {
    return { level: 'none', label: '—', nearestDate: null, count: 0, activeBatches: [] };
  }
  
  const sorted = [...activeBatches].sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
  const nearest = sorted[0];
  const nearestDateStr = nearest.expiryDate;
  
  const today = new Date();
  today.setHours(0,0,0,0);
  const expiry = new Date(nearestDateStr);
  expiry.setHours(0,0,0,0);
  
  const diffTime = expiry.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  let level = 'valid';
  let label = '';
  
  if (diffDays <= 0) {
    level = 'expired';
    label = 'EXPIRADO';
  } else if (diffDays <= 7) {
    level = 'critical';
    label = `EXPIRA EM ${diffDays} DIAS`;
  } else if (diffDays <= 30) {
    level = 'warning';
    label = `EXPIRA EM ${diffDays} DIAS`;
  } else {
    level = 'valid';
    label = `Válido (${diffDays} dias)`;
  }
  
  return {
    level,
    label,
    nearestDate: nearestDateStr,
    daysLeft: diffDays,
    count: activeBatches.length,
    activeBatches: sorted
  };
};

const getExpiryDot = (stats: any) => {
  if (stats.level === 'expired') {
    return <span className="inline-block w-2.5 h-2.5 bg-rose-800 rounded-full shrink-0" title="Expirado" style={{ backgroundColor: '#991B1B' }} />;
  }
  if (stats.level === 'critical') {
    return <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0 animate-ping" title="Crítico (Até 7 dias)" style={{ backgroundColor: '#E24B4A' }} />;
  }
  if (stats.level === 'warning') {
    return <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" title="Aviso (Até 30 dias)" style={{ backgroundColor: '#D4AF37' }} />;
  }
  if (stats.level === 'valid') {
    return <span className="inline-block w-2.5 h-2.5 bg-emerald-500 rounded-full shrink-0" title="Válido" />;
  }
  return null;
};

const getExpiryBadge = (level: string, days: number, dateStr: string, count: number) => {
  if (level === 'none') return <span className="text-slate-350">—</span>;
  
  const formattedDate = new Date(dateStr).toLocaleDateString('pt-MZ');
  const plusLotesLabel = count > 1 ? ` +${count - 1} lotes` : '';
  
  if (level === 'expired') {
    return (
      <span className="text-white font-black px-2 py-0.5 rounded font-mono text-[9px] uppercase inline-block leading-normal" style={{ backgroundColor: '#991B1B' }}>
        EXPIRADO ({formattedDate}){plusLotesLabel}
      </span>
    );
  }
  if (level === 'critical') {
    return (
      <span className="text-white font-black px-2 py-0.5 rounded font-mono text-[9px] uppercase inline-block animate-pulse leading-normal" style={{ backgroundColor: '#E24B4A' }}>
        ⚠️ CRÍTICO ({days}d | {formattedDate}){plusLotesLabel}
      </span>
    );
  }
  if (level === 'warning') {
    return (
      <span className="text-white font-black px-2 py-0.5 rounded font-mono text-[9px] uppercase inline-block leading-normal" style={{ backgroundColor: '#D4AF37' }}>
        ⚠️ AVISO ({days}d | {formattedDate}){plusLotesLabel}
      </span>
    );
  }
  if (level === 'valid') {
    return (
      <span className="text-slate-500 font-medium font-mono text-[10px] inline-block leading-normal">
        {formattedDate}{plusLotesLabel}
      </span>
    );
  }
  return <span className="text-slate-350">—</span>;
};

interface InventoryProps {
  initialAction?: string | null;
  onActionHandled?: () => void;
}

// Extracted as a real component (was previously an inline IIFE calling hooks directly
// inside a conditionally-rendered JSX block). Hooks called inside an IIFE are attached
// to the *parent* component's hook list, not their own — so when the surrounding
// {activeTab === 'validade' && ...} block toggled on/off, the number of hooks called
// by Inventory changed between renders, triggering React error #310 ("Rendered fewer
// hooks than expected"). Making this a real component gives it its own, consistent
// hook list regardless of when Inventory re-renders.
function BatchValidityList({ products, profile, addStockMovement, setPromoProd, setShowPromoModal }: {
  products: any[];
  profile: any;
  addStockMovement: (productId: string, productName: string, qtyChange: number, type: string, reference: string) => Promise<void>;
  setPromoProd: (p: any) => void;
  setShowPromoModal: (v: boolean) => void;
}) {
  const [valSearch, setValSearch] = useState('');
  const [valFilter, setValFilter] = useState<'all' | 'expired' | 'critical' | 'warning' | 'safe'>('all');

  const list: any[] = [];
  products.forEach(p => {
    const recBatches = getReconciledBatches(p.batches || [], p.stockLevel || 0);
    recBatches.forEach(b => {
      list.push({ product: p, ...b });
    });
  });

  const today = new Date();
  const date30 = new Date();
  date30.setDate(today.getDate() + 30);
  const date90 = new Date();
  date90.setDate(today.getDate() + 90);

  const filteredBatches = list.filter(b => {
    const matchSearch = b.product.name.toLowerCase().includes(valSearch.toLowerCase()) || 
                        (b.batchNumber || '').toLowerCase().includes(valSearch.toLowerCase());
    
    if (!matchSearch) return false;

    const expDate = new Date(b.expiryDate);
    if (valFilter === 'expired') {
      return expDate < today;
    } else if (valFilter === 'critical') {
      return expDate >= today && expDate <= date30;
    } else if (valFilter === 'warning') {
      return expDate > date30 && expDate <= date90;
    } else if (valFilter === 'safe') {
      return expDate > date90;
    }
    return true;
  });

  filteredBatches.sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());

  const handleDirectBatchQuebra = async (batchItem: any) => {
    if (!profile?.businessId) return;
    const prod = batchItem.product;
    const qtyVal = Number(batchItem.qty) || 0;
    
    const confirmAbate = window.confirm(
      `Deseja abater de imediato todas as ${qtyVal} unidades do lote "${batchItem.batchNumber}" do produto "${prod.name}" como perda por expiração?\n\nEsta operação é irreversível.`
    );
    if (!confirmAbate) return;

    const loadingId = toast.loading("A processar abate de stock...");
    try {
      const { addDoc, collection, doc, updateDoc, serverTimestamp } = await import('firebase/firestore');

      const currentStock = Number(prod.stockLevel) || 0;
      const newStock = Math.max(0, currentStock - qtyVal);
      
      const updatedBatches = (prod.batches || []).map((b: any) => {
        if (b.batchNumber === batchItem.batchNumber && b.expiryDate === batchItem.expiryDate) {
          return { ...b, qty: 0 };
        }
        return b;
      }).filter((b: any) => (Number(b.qty) || 0) > 0);

      const quebraPayload = {
        businessId: profile.businessId,
        productId: prod.id,
        productName: prod.name,
        qty: qtyVal,
        unit: 'un',
        reason: 'expired',
        notes: `Abate automático de lote vencido/próximo do vencimento (${batchItem.batchNumber})`,
        reportedBy: profile.displayName || 'Utilizador',
        reportedByEmail: profile.email || '',
        createdAt: serverTimestamp()
      };
      await addDoc(collection(db, `businesses/${profile.businessId}/quebras`), quebraPayload);

      await updateDoc(doc(db, `businesses/${profile.businessId}/products`, prod.id), {
        stockLevel: newStock,
        stockUn: newStock,
        batches: updatedBatches,
        updatedAt: serverTimestamp()
      });

      await addStockMovement(
        prod.id,
        prod.name,
        -qtyVal,
        'quebra',
        `Lote Vencido (${batchItem.batchNumber})`
      );

      toast.success("Abate de lote registado com sucesso!", { id: loadingId });
    } catch (err: any) {
      console.error(err);
      toast.error(`Falha ao abater lote: ${err.message || err}`, { id: loadingId });
    }
  };

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={valSearch}
            onChange={(e) => setValSearch(e.target.value)}
            placeholder="Pesquisar por produto ou lote..."
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'all', label: 'Todos' },
            { id: 'expired', label: 'Vencidos 🛑' },
            { id: 'critical', label: 'Críticos ⚠️' },
            { id: 'warning', label: 'Alerta ⏳' },
            { id: 'safe', label: 'Seguros ✅' }
          ].map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setValFilter(f.id as any)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer",
                valFilter === f.id
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-white text-slate-500 hover:text-slate-800 border border-slate-200"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Batches Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {filteredBatches.map((b, idx) => {
          const expDate = new Date(b.expiryDate);
          const diffTime = expDate.getTime() - today.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          const isExpired = diffDays < 0;

          let statusBadge = '';
          let statusBg = '';
          if (isExpired) {
            statusBadge = `Vencido há ${Math.abs(diffDays)} d`;
            statusBg = 'bg-rose-50 text-rose-700 border border-rose-100';
          } else if (diffDays <= 30) {
            statusBadge = `Expira em ${diffDays} d`;
            statusBg = 'bg-amber-50 text-amber-700 border border-amber-100';
          } else if (diffDays <= 90) {
            statusBadge = `Expira em ${diffDays} d`;
            statusBg = 'bg-yellow-50 text-yellow-700 border border-yellow-100';
          } else {
            statusBadge = `Seguro (${diffDays} d)`;
            statusBg = 'bg-emerald-50 text-emerald-700 border border-emerald-100';
          }

          return (
            <div key={`${b.product.id}-${b.batchNumber}-${idx}`} className="bg-white border border-slate-100 rounded-2xl p-5 flex flex-col justify-between gap-4 shadow-sm hover:border-slate-200 transition-all">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-black text-slate-900 tracking-tight">{b.product.name}</h4>
                    <span className="text-[10px] text-slate-400 font-mono">SKU: {b.product.sku || 'N/A'}</span>
                  </div>
                  <span className={cn("px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest leading-none", statusBg)}>
                    {statusBadge}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100 font-mono text-xs">
                  <div className="space-y-0.5">
                    <span className="text-[9px] text-slate-400 uppercase">Lote</span>
                    <div className="text-slate-800 font-bold">{b.batchNumber || 'SEM LOTE'}</div>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[9px] text-slate-400 uppercase">Quantidade</span>
                    <div className="text-slate-800 font-bold">{b.qty} Un</div>
                  </div>
                  <div className="space-y-0.5 col-span-2">
                    <span className="text-[9px] text-slate-400 uppercase">Data de Validade</span>
                    <div className="text-slate-800 font-bold">{new Date(b.expiryDate).toLocaleDateString('pt-PT')}</div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2 border-t border-dashed border-slate-100">
                <button
                  type="button"
                  onClick={() => handleDirectBatchQuebra(b)}
                  className="flex-1 py-2 bg-rose-50 hover:bg-rose-600 hover:text-white text-rose-600 rounded-xl font-bold text-xs uppercase tracking-wider transition-all active:scale-95 cursor-pointer text-center"
                >
                  Abater Stock
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPromoProd(b.product);
                    setShowPromoModal(true);
                  }}
                  className="flex-1 py-2 bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-600 rounded-xl font-bold text-xs uppercase tracking-wider transition-all active:scale-95 cursor-pointer text-center"
                >
                  Lançar Promo
                </button>
              </div>
            </div>
          );
        })}

        {filteredBatches.length === 0 && (
          <div className="col-span-2 py-16 text-center text-slate-400 bg-slate-50 rounded-2xl border border-slate-100">
            <Package size={42} className="mx-auto mb-3 opacity-20 text-slate-650" />
            <p className="text-xs uppercase font-black tracking-widest">Nenhum lote correspondente encontrado.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Extracted for the same reason as BatchValidityList above — hooks were previously
// called inside an IIFE inside {activeTab === 'movimentos' && ...}, which changed
// Inventory's hook count between renders and triggered React error #310.
function StockMovementsLedger({ profile, activeTab }: { profile: any; activeTab: string }) {
  const [movs, setMovs] = useState<any[]>([]);
  const [isLoadingMovs, setIsLoadingMovs] = useState(true);
  const [movSearch, setMovSearch] = useState('');
  const [movTypeFilter, setMovTypeFilter] = useState('all');

  useEffect(() => {
    if (!profile?.businessId || activeTab !== 'movimentos') return;
    setIsLoadingMovs(true);
    
    const movRef = collection(db, `businesses/${profile.businessId}/stock_movements`);
    const q = query(movRef, orderBy('timestamp', 'desc'), limit(150));

    const unsub = onSnapshot(q, (snapshot: any) => {
      const list: any[] = [];
      snapshot.forEach((doc: any) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setMovs(list);
      setIsLoadingMovs(false);
    }, (err: any) => {
      console.error("Failed to load movements:", err);
      setIsLoadingMovs(false);
    });

    return () => unsub();
  }, [activeTab, profile?.businessId]);

  const filteredMovs = movs.filter(m => {
    const matchSearch = (m.productName || '').toLowerCase().includes(movSearch.toLowerCase()) ||
                        (m.reference || '').toLowerCase().includes(movSearch.toLowerCase());
    
    if (!matchSearch) return false;

    if (movTypeFilter !== 'all') {
      return m.type === movTypeFilter;
    }
    return true;
  });

  return (
    <div className="bg-white border border-slate-100 rounded-3xl p-6 space-y-6 shadow-sm">
      <div>
        <h3 className="text-lg font-black tracking-tight text-slate-950 flex items-center gap-2">
          <span>📋 Livro de Razão de Movimentos de Stock</span>
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Audite todas as entradas e saídas de stock do inventário com referência, operadores e carimbo de data/hora.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={movSearch}
            onChange={(e) => setMovSearch(e.target.value)}
            placeholder="Pesquisar por produto ou referência..."
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'all', label: 'Todos' },
            { id: 'manual', label: 'Ajuste Manual 🛠️' },
            { id: 'sale', label: 'Venda Fatura 🧾' },
            { id: 'pos', label: 'Venda POS 🛒' },
            { id: 'purchase', label: 'Compra/PO 📦' },
            { id: 'quebra', label: 'Perda/Quebra ⚠️' }
          ].map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setMovTypeFilter(f.id)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer",
                movTypeFilter === f.id
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-white text-slate-500 hover:text-slate-800 border border-slate-200"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline */}
      {isLoadingMovs ? (
        <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">A carregar registos...</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredMovs.map(m => {
            const isPositive = m.qtyChange > 0;
            const dateStr = m.timestamp 
              ? new Date(m.timestamp.seconds * 1000).toLocaleString('pt-PT') 
              : 'A processar...';

            return (
              <div key={m.id} className="flex items-center justify-between gap-4 bg-white border border-slate-100 hover:border-slate-200 p-4 rounded-2xl transition-all shadow-sm">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs font-mono border",
                    isPositive 
                      ? "bg-emerald-50 text-emerald-600 border-emerald-100" 
                      : "bg-rose-50 text-rose-600 border-rose-100"
                  )}>
                    {isPositive ? `+${m.qtyChange}` : m.qtyChange}
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-xs font-black text-slate-800 leading-tight">{m.productName}</h4>
                    <div className="flex flex-wrap items-center gap-1.5 text-[9px] text-slate-400 font-mono">
                      <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 border border-slate-200 font-black uppercase tracking-wider">
                        {m.type === 'manual' ? '🛠️ AJUSTE' : 
                         m.type === 'sale' ? '🧾 VENDA' : 
                         m.type === 'pos' ? '🛒 POS' : 
                         m.type === 'purchase' ? '📦 COMPRA' : 
                         m.type === 'quebra' ? '⚠️ PERDA' : m.type.toUpperCase()}
                      </span>
                      <span>•</span>
                      <span>Ref: <strong>{m.reference}</strong></span>
                      <span>•</span>
                      <span>Operador: <strong>{m.reportedBy}</strong></span>
                    </div>
                  </div>
                </div>
                <div className="text-right text-[10px] text-slate-400 font-mono">
                  {dateStr}
                </div>
              </div>
            );
          })}

          {filteredMovs.length === 0 && (
            <div className="py-20 text-center text-slate-400 bg-slate-50 rounded-2xl border border-slate-100">
              <History size={42} className="mx-auto mb-3 opacity-20" />
              <p className="text-xs uppercase font-black tracking-widest">Nenhuma movimentação de stock registada.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Inventory({ initialAction, onActionHandled }: InventoryProps = {}) {
  const { profile, businessData } = useAuth();
  const { t } = useTranslation();
  const currency = businessData?.currency || 'MZN';
  const [products, setProducts] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'list' | 'add' | 'manage' | 'quebras' | 'etiquetas' | 'validade' | 'movimentos'>('list');
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(typeof window !== 'undefined' ? navigator.onLine : true);

  const isProductLimitReached = () => {
    if (profile?.role?.toLowerCase() === 'super_admin' || profile?.email === 'mascenisabush@gmail.com') {
      return false;
    }
    const currentPlan = (businessData?.subscription?.plan || businessData?.subscriptionPlan || 'basico').toLowerCase();
    if (currentPlan === 'basico' && products.length >= 100) {
      return true;
    }
    return false;
  };

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (initialAction === 'create') {
      setActiveTab('add');
      setIsCreating(true);
      if (onActionHandled) {
        onActionHandled();
      }
    }
  }, [initialAction, onActionHandled]);

  useEffect(() => {
    const checkExpiryFilterTrigger = () => {
      if (localStorage.getItem('sabush_active_expiry_filter') === 'true') {
        setExpiryFilterOnly(true);
        setActiveTab('validade');
        localStorage.removeItem('sabush_active_expiry_filter');
      }
    };
    checkExpiryFilterTrigger();
    
    // Add custom trigger listener as a backup
    const handleCustomTrigger = () => checkExpiryFilterTrigger();
    window.addEventListener('sabush-trigger-expiry-filter', handleCustomTrigger);
    return () => {
      window.removeEventListener('sabush-trigger-expiry-filter', handleCustomTrigger);
    };
  }, []);
  
  // Quebras state variables
  const [quebras, setQuebras] = useState<any[]>([]);
  const [selectedQuebraProduct, setSelectedQuebraProduct] = useState<any | null>(null);
  const [quebraQty, setQuebraQty] = useState<number | string>('');
  const [quebraUnit, setQuebraUnit] = useState<'cx' | 'emb' | 'un'>('un');
  const [quebraReason, setQuebraReason] = useState<string>('broken');
  const [quebraNotes, setQuebraNotes] = useState<string>('');
  const [isRecordingQuebra, setIsRecordingQuebra] = useState(false);
  const [quebrasSearch, setQuebrasSearch] = useState<string>('');
  const [quebrasReasonFilter, setQuebrasReasonFilter] = useState<string>('all');
  const [isCreating, setIsCreating] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showUnidadeDeCompraDropdown, setShowUnidadeDeCompraDropdown] = useState(false);
  const [showBaseUnitDropdown, setShowBaseUnitDropdown] = useState(false);
  const [activeGrossoDropdownIndex, setActiveGrossoDropdownIndex] = useState<number | null>(null);
  const [hasManuallyEditedCategory, setHasManuallyEditedCategory] = useState(false);

  const getWholesaleUnitConversion = (unitLabel: string) => {
    if (!unitLabel) return 1;
    const cleanLabel = unitLabel.trim().toLowerCase();
    
    if (newProduct.unidadeDeCompra && cleanLabel === newProduct.unidadeDeCompra.trim().toLowerCase()) {
      return Number(newProduct.conversaoUnidades) || 1;
    }
    if (newProduct.boxUnitLabel && cleanLabel === newProduct.boxUnitLabel.trim().toLowerCase()) {
      return Number(newProduct.boxUnitQty) || 1;
    }
    if (newProduct.packUnitLabel && cleanLabel === newProduct.packUnitLabel.trim().toLowerCase()) {
      return Number(newProduct.packUnitQty) || 1;
    }
    if (cleanLabel === 'cx' || cleanLabel === 'caixa') {
      return Number(newProduct.boxUnitQty) || Number(newProduct.conversaoUnidades) || 1;
    }
    if (cleanLabel === 'emb' || cleanLabel === 'embalagem') {
      return Number(newProduct.packUnitQty) || Number(newProduct.conversaoUnidades) || 1;
    }
    return Number(newProduct.conversaoUnidades) || 1;
  };
  const [detectedCategoryText, setDetectedCategoryText] = useState('');

  // Purchase Cost Calculator State Variables
  const [showPurchaseCalc, setShowPurchaseCalc] = useState(false);
  const [calcPurchaseUnit, setCalcPurchaseUnit] = useState<'cx' | 'emb' | 'un'>('cx');
  const [calcBulkQty, setCalcBulkQty] = useState('');
  const [calcCostType, setCalcCostType] = useState<'total' | 'unit'>('total');
  const [calcCostVal, setCalcCostVal] = useState('');
  const [calcMarkup, setCalcMarkup] = useState('25');
  const [calcUpdateProductPrices, setCalcUpdateProductPrices] = useState(true);
  const [calcAppliedResults, setCalcAppliedResults] = useState<any | null>(null);

  const getCalcResults = () => {
    if (!selectedStockProduct || !calcBulkQty || !calcCostVal) return null;
    
    const qty = Number(calcBulkQty);
    const cost = Number(calcCostVal);
    if (isNaN(qty) || qty <= 0 || isNaN(cost) || cost < 0) return null;
    
    const boxQty = Number(selectedStockProduct.boxUnitQty || 10);
    const packQty = Number(selectedStockProduct.packUnitQty || 100);
    const markup = Number(calcMarkup || '25');

    let totalUnits = 0;
    let unitCost = 0;
    let totalCost = 0;

    if (calcPurchaseUnit === 'cx') {
      totalUnits = qty * boxQty;
      totalCost = calcCostType === 'total' ? cost : cost * qty;
      unitCost = totalCost / totalUnits;
    } else if (calcPurchaseUnit === 'emb') {
      totalUnits = qty * packQty;
      totalCost = calcCostType === 'total' ? cost : cost * qty;
      unitCost = totalCost / totalUnits;
    } else {
      totalUnits = qty;
      totalCost = calcCostType === 'total' ? cost : cost * qty;
      unitCost = totalCost / totalUnits;
    }

    const unitPrice = Number((unitCost * (1 + markup / 100)).toFixed(2));
    const boxCost = Number((unitCost * boxQty).toFixed(2));
    const boxPrice = Number((boxCost * (1 + Math.max(0, markup - 4) / 100)).toFixed(2));

    const packCost = Number((unitCost * packQty).toFixed(2));
    const packPrice = Number((packCost * (1 + Math.max(0, markup - 2) / 100)).toFixed(2));

    return {
      totalUnits,
      totalCost,
      unitCost: Number(unitCost.toFixed(2)),
      unitPrice,
      boxCost,
      boxPrice,
      packCost,
      packPrice,
      markup
    };
  };

  const getNewProductCalcResults = () => {
    const qty = Number(calcBulkQty);
    const cost = Number(calcCostVal);
    if (isNaN(qty) || qty <= 0 || isNaN(cost) || cost < 0) return null;
    
    const boxQty = Number(newProduct.boxUnitQty || 10);
    const packQty = Number(newProduct.packUnitQty || 100);
    const markup = Number(calcMarkup || '25');

    let totalUnits = 0;
    let unitCost = 0;
    let totalCost = 0;

    if (calcPurchaseUnit === 'cx') {
      totalUnits = qty * boxQty;
      totalCost = calcCostType === 'total' ? cost : cost * qty;
      unitCost = totalCost / totalUnits;
    } else if (calcPurchaseUnit === 'emb') {
      totalUnits = qty * packQty;
      totalCost = calcCostType === 'total' ? cost : cost * qty;
      unitCost = totalCost / totalUnits;
    } else {
      totalUnits = qty;
      totalCost = calcCostType === 'total' ? cost : cost * qty;
      unitCost = totalCost / totalUnits;
    }

    const unitPrice = Number((unitCost * (1 + markup / 100)).toFixed(2));
    const boxCost = Number((unitCost * boxQty).toFixed(2));
    const boxPrice = Number((boxCost * (1 + Math.max(0, markup - 4) / 100)).toFixed(2));

    const packCost = Number((unitCost * packQty).toFixed(2));
    const packPrice = Number((packCost * (1 + Math.max(0, markup - 2) / 100)).toFixed(2));

    return {
      totalUnits,
      totalCost,
      unitCost: Number(unitCost.toFixed(2)),
      unitPrice,
      boxCost,
      boxPrice,
      packCost,
      packPrice,
      markup
    };
  };

  const predictCategoryFromName = (prodName: string) => {
    if (!prodName || !prodName.trim()) return '';
    const nLower = prodName.toLowerCase();

    // 1. Check existing products for similarity
    const stopWords = ['de', 'da', 'do', 'com', 'para', 'em', 'um', 'uma', 'o', 'a', 'os', 'as', 'e', 'kg', 'g', 'ml', 'l', 'un', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
    const words = nLower.split(/\s+/).filter(w => w.length > 1 && !stopWords.includes(w));

    if (words.length > 0) {
      // Find products that contain any of these keywords and return their category
      const similarProduct = products.find(p => {
        if (!p.category) return false;
        const pNameLower = p.name.toLowerCase();
        return words.some(w => pNameLower.includes(w));
      });
      if (similarProduct) {
        return similarProduct.category;
      }
    }

    // 2. Local intelligence mapping (Portuguese / Mozambican)
    const rules = [
      { keywords: ['coca', 'cola', 'fanta', 'sprite', 'sumo', 'bebida', 'cerveja', 'refrigerante', 'agua', 'água', 'vinho', 'suco', 'compal', 'red bull', 'energético', 'licor', 'whisky', 'gin', 'rum', 'tónica', 'tonica', 'chá', 'cha', 'café', 'cafe', 'heineken', '2m', 'laurentina', 'txilar', 'copo', 'gelo'], category: 'Bebidas' },
      { keywords: ['arroz', 'massa', 'feijão', 'feijao', 'óleo', 'oleo', 'açúcar', 'açucar', 'sal', 'farinha', 'leite', 'trigo', 'espaguete', 'esparguete', 'molho', 'azeite', 'vinagre', 'fubá', 'fuba', 'sopa', 'aveia', 'cereal', 'cereais', 'manteiga', 'queijo', 'iogurte', 'salsicha', 'conserva', 'atum', 'sardinha', 'milho', 'canola', 'maionese', 'ketchup', 'mostarda', 'tempero', 'caldo', 'creme'], category: 'Mercearia' },
      { keywords: ['sabão', 'sabao', 'detergente', 'desinfetante', 'lixívia', 'lixivia', 'amaciador', 'papel higiénico', 'papel higienico', 'bucha', 'esponja', 'shampoo', 'champô', 'sabonete', 'pasta de dentes', 'fralda', 'fraldas', 'pasta dentífrica', 'creme', 'loção', 'locao', 'desodorizante', 'colgate', 'protex', 'nivea', 'vaselina', 'fio dental', 'limpeza', 'vassoura', 'rodo', 'esfregão', 'lavar'], category: 'Higiene & Limpeza' },
      { keywords: ['bolacha', 'bolachas', 'biscoito', 'biscoitos', 'chocolate', 'chocolates', 'rebuçado', 'rebuçados', 'rebuçado', 'pastilha', 'doce', 'doces', 'batata frita', 'lays', 'pipocas', 'snack', 'snacks', 'gomas', 'rebuçados', 'chupa', 'chupas', 'pudim', 'gelatina', 'chuinga', 'pastilhas'], category: 'Prendas & Snacks' },
      { keywords: ['pão', 'pao', 'bolo', 'bolos', 'folhado', 'croissant', 'broa', 'carcaça', 'bisnaguinha', 'torrada', 'padaria'], category: 'Padaria & Pastelaria' },
      { keywords: ['carne', 'frango', 'bife', 'peixe', 'chouriço', 'chourico', 'salsicha', 'fiambre', 'presunto', 'porco', 'vaca', 'carapau', 'pescada', 'moela', 'fígado', 'figado', 'costela', 'camarão', 'lula', 'marisco', 'caranguejo'], category: 'Talho & Peixaria' },
      { keywords: ['cebola', 'cebolas', 'batata', 'batatas', 'alho', 'alhos', 'tomate', 'tomates', 'cenoura', 'cenouras', 'alface', 'fruta', 'frutas', 'banana', 'maçã', 'maca', 'laranja', 'limão', 'limao', 'pera', 'pêra', 'uva', 'uvas', 'abacate', 'mamão', 'mamao', 'manga', 'ananas', 'ananás', 'repolho', 'pimento', 'pimentos', 'vegetais', 'legumes'], category: 'Frutas & Vegetais' },
      { keywords: ['caderno', 'caneta', 'lápis', 'lapis', 'borracha', 'mochila', 'papel', 'impressora', 'folder', 'envelope', 'lapiseira', 'marcador', 'estojo', 'tesoura', 'cola', 'fita admissível', 'fita adesiva', 'livro', 'agenda'], category: 'Papelaria & Escritório' },
      { keywords: ['cimento', 'tijolo', 'areia', 'prego', 'martelo', 'parafuso', 'chave', 'tinta', 'pincel', 'tubo', 'cabo', 'fio eléctrico', 'lampada', 'lâmpada', 'tomada', 'interruptor', 'alicate', 'serra', 'disco de corte', 'furadeira', 'ferramenta', 'madeira'], category: 'Construção & Ferragens' },
      { keywords: ['paracetamol', 'ibuprofeno', 'aspirina', 'máscara', 'mascara', 'álcool', 'alcool', 'gaze', 'ligadura', 'soro', 'seringa', 'termómetro', 'termometro', 'remédio', 'remedio', 'comprimido', 'xarope', 'pomada', 'curativo', 'bandaid', 'vacina', 'medicamento'], category: 'Farmácia' }
    ];

    for (const rule of rules) {
      if (rule.keywords.some(kw => nLower.includes(kw))) {
        return rule.category;
      }
    }

    return '';
  };

  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [isRetalhoTiersOpen, setIsRetalhoTiersOpen] = useState(false);
  const [openGrossoTiersIndices, setOpenGrossoTiersIndices] = useState<Record<number, boolean>>({});
  const [viewingProduct, setViewingProduct] = useState<any | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [manageSearch, setManageSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'compact'>('compact');
  const [showBulkMenu, setShowBulkMenu] = useState(false);
  const [openRowMenuId, setOpenRowMenuId] = useState<string | null>(null);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('name-asc');

  // Expiry date, batches & promotion states
  const [expiryInput, setExpiryInput] = useState('');
  const [expiryFilterOnly, setExpiryFilterOnly] = useState(false);
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [promoProd, setPromoProd] = useState<any | null>(null);
  const [promoDescontoSugerido, setPromoDescontoSugerido] = useState<number | string>('');
  const [promoPrecoPromocional, setPromoPrecoPromocional] = useState<number | string>('');
  const [promoValidoAte, setPromoValidoAte] = useState('');
  const [promoAplicarA, setPromoAplicarA] = useState<'retail' | 'wholesale' | 'both'>('retail');
  const [isActivatingPromo, setIsActivatingPromo] = useState(false);

  const addStockMovement = async (productId: string, productName: string, qtyChange: number, type: string, reference: string) => {
    if (!profile?.businessId) return;
    try {
      const { addDoc, collection, serverTimestamp } = await import('firebase/firestore');
      await addDoc(collection(db, `businesses/${profile.businessId}/stock_movements`), {
        productId,
        productName,
        qtyChange,
        type,
        reference,
        reportedBy: profile.email || 'Utilizador',
        timestamp: serverTimestamp()
      });
    } catch (e) {
      console.error("Failed to record stock movement:", e);
    }
  };

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(12);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategory, sortBy]);

  // Camera & AI Image States
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [showAiGenerator, setShowAiGenerator] = useState(false);
  const [aiCountrySelection, setAiCountrySelection] = useState('Moçambique 🇲🇿');
  const [isGeneratingAiImage, setIsGeneratingAiImage] = useState(false);
  const [isSearchingInternetImage, setIsSearchingInternetImage] = useState(false);

  // Start Camera Stream
  const startCamera = async () => {
    try {
      setIsCameraOpen(true);
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment', width: { ideal: 480 }, height: { ideal: 480 } } 
      });
      setCameraStream(stream);
      setTimeout(() => {
        const video = document.getElementById('camera-preview') as HTMLVideoElement;
        if (video) {
          video.srcObject = stream;
        }
      }, 300);
    } catch (err) {
      console.error("Camera access failed", err);
      toast.error("Não foi possível aceder à câmara do dispositivo. Por favor, verifique as permissões.");
      setIsCameraOpen(false);
    }
  };

  // Stop Camera Stream
  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setIsCameraOpen(false);
  };

  // Capture Frame from Video
  const capturePhoto = () => {
    const video = document.getElementById('camera-preview') as HTMLVideoElement;
    if (!video) return;

    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const size = Math.min(video.videoWidth, video.videoHeight);
      const sx = (video.videoWidth - size) / 2;
      const sy = (video.videoHeight - size) / 2;
      ctx.drawImage(video, sx, sy, size, size, 0, 0, 400, 400);
      
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setNewProduct(prev => ({ ...prev, imageUrl: dataUrl }));
      stopCamera();
      toast.success("Foto capturada e associada com sucesso!");
    }
  };

  // Handle local image file uploads and compression
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error("Por favor, selecione um ficheiro de imagem válido.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.src = reader.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 400;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const size = Math.min(img.width, img.height);
          const sx = (img.width - size) / 2;
          const sy = (img.height - size) / 2;
          ctx.drawImage(img, sx, sy, size, size, 0, 0, 400, 400);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          setNewProduct(prev => ({ ...prev, imageUrl: dataUrl }));
          toast.success("Imagem carregada com sucesso!");
        }
      };
    };
    reader.readAsDataURL(file);
  };

  // Generate AI Localized Product Packaging Image
  const generateAiProductImage = async () => {
    if (!newProduct.name || !newProduct.name.trim()) {
      toast.error("Por favor, preencha o Nome do Produto antes de gerar a imagem.");
      return;
    }

    setIsGeneratingAiImage(true);
    try {
      const response = await fetch('/api/ai/generate-local-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          productName: newProduct.name,
          country: aiCountrySelection
        })
      });

      if (!response.ok) {
        throw new Error("Erro na resposta do servidor.");
      }

      const data = await response.json();
      if (data.svg) {
        const svgBase64 = btoa(unescape(encodeURIComponent(data.svg)));
        const dataUrl = `data:image/svg+xml;base64,${svgBase64}`;
        setNewProduct(prev => ({ ...prev, imageUrl: dataUrl }));
        toast.success(`Design do produto gerado com sucesso para ${aiCountrySelection}!`);
        setShowAiGenerator(false);
      } else {
        throw new Error("Design SVG indisponível.");
      }
    } catch (err) {
      console.error("AI Image Generation failed", err);
      toast.error("Incapaz de gerar o design do produto neste momento.");
    } finally {
      setIsGeneratingAiImage(false);
    }
  };

  // Search and automatically upload product image from internet localized to the country
  const searchInternetProductImage = async (pName?: string) => {
    const nameToSearch = pName || newProduct.name;
    if (!nameToSearch || !nameToSearch.trim()) {
      toast.error("Por favor, preencha o Nome do Produto para buscar na internet.");
      return;
    }

    const detectedCountry = businessData?.regionalSettings?.country || businessData?.country || 'Moçambique';
    setIsSearchingInternetImage(true);
    toast.info(`A pesquisar imagem real para "${nameToSearch}" em ${detectedCountry}...`, { duration: 4000 });

    try {
      const response = await fetch('/api/ai/search-product-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: nameToSearch,
          country: detectedCountry
        })
      });

      if (!response.ok) {
        throw new Error("Erro na resposta do servidor.");
      }

      const data = await response.json();
      if (data.imageUrl) {
        setNewProduct(prev => ({ ...prev, imageUrl: data.imageUrl }));
        const sourceText = data.source ? ` (Fonte: ${data.source})` : '';
        toast.success(`Imagem encontrada e associada com sucesso!${sourceText}`);
      } else {
        throw new Error("Nenhuma imagem válida encontrada.");
      }
    } catch (err: any) {
      console.error("Internet Image search failed", err);
      toast.error("Não foi possível encontrar uma imagem para este produto na internet.");
    } finally {
      setIsSearchingInternetImage(false);
    }
  };

  // Quick Stock Adjust states
  const [quickAdjustProduct, setQuickAdjustProduct] = useState<any | null>(null);
  const [adjustType, setAdjustType] = useState<'add' | 'subtract' | 'set'>('add');
  const [adjustValue, setAdjustValue] = useState<number | string>(1);
  const [adjustReason, setAdjustReason] = useState<string>('');

  // Estados para o Gerador de Etiquetas de Preços
  const [printQueue, setPrintQueue] = useState<{ product: any; count: number }[]>([]);
  const [etiquetaSearch, setEtiquetaSearch] = useState('');
  const [tagTemplate, setTagTemplate] = useState<'classic' | 'modern' | 'minimal' | 'promo'>('classic');
  const [showStoreName, setShowStoreName] = useState(true);
  const [showPrice, setShowPrice] = useState(true);
  const [showBarcode, setShowBarcode] = useState(true);
  const [showSku, setShowSku] = useState(true);
  const [showCategory, setShowCategory] = useState(true);
  const [customStoreName, setCustomStoreName] = useState('');
  const [tagBorderColor, setTagBorderColor] = useState('#2563EB'); // Indigo default
  const [tagAccentColor, setTagAccentColor] = useState('#D4AF37'); // Yellow promo default
  const [tagColumns, setTagColumns] = useState<number>(3);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [isUpdatingStock, setIsUpdatingStock] = useState(false);

  // Search & Add Stock states
  const [stockSearchQuery, setStockSearchQuery] = useState('');
  const [selectedStockProduct, setSelectedStockProduct] = useState<any | null>(null);
  const [addQtyCx, setAddQtyCx] = useState<number | string>('');
  const [addQtyEmb, setAddQtyEmb] = useState<number | string>('');
  const [addQtyUn, setAddQtyUn] = useState<number | string>('');
  const [isPerformingQuickAdd, setIsPerformingQuickAdd] = useState(false);

  // Deduplication & Merge States
  const [showDeduplicateModal, setShowDeduplicateModal] = useState(false);
  const [duplicateMatches, setDuplicateMatches] = useState<Array<{ product1: any; product2: any; ratio: number }>>([]);
  const [mainProductId, setMainProductId] = useState<string>('');
  const [targetProductId, setTargetProductId] = useState<string>('');
  const [isMerging, setIsMerging] = useState(false);

  // PDF Import States
  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const [parsedPdfProducts, setParsedPdfProducts] = useState<any[]>([]);
  const [showPdfReviewModal, setShowPdfReviewModal] = useState(false);
  const [pdfFileName, setPdfFileName] = useState('');
  const [isSavingParsed, setIsSavingParsed] = useState(false);

  const handlePdfFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast.error('Por favor, selecione um ficheiro PDF válido.');
      return;
    }

    setPdfFileName(file.name);
    setIsParsingPdf(true);

    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        try {
          const base64String = reader.result as string;
          const rawBase64 = base64String.split(',')[1];

          const response = await fetch('/api/ai/parse-pdf', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ pdfBase64: rawBase64 })
          });

          if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || 'Falha ao analisar o PDF.');
          }

          const data = await response.json();
          if (data.products && Array.isArray(data.products)) {
            const processed = data.products.map((p: any, idx: number) => ({
              id: `temp-${idx}`,
              name: p.name || '',
              sku: p.sku || '',
              barcode: p.barcode || '',
              price: typeof p.price === 'number' ? p.price : 0,
              costPrice: typeof p.costPrice === 'number' ? p.costPrice : 0,
              quantity: typeof p.quantity === 'number' ? p.quantity : 1,
              category: p.category || 'Geral',
              supplier: p.supplier || '',
              description: p.description || '',
              selected: true
            }));
            setParsedPdfProducts(processed);
            setShowPdfReviewModal(true);
            toast.success(`${processed.length} produtos extraídos do PDF.`);
          } else {
            throw new Error('Nenhum produto detetado ou formato inválido.');
          }
        } catch (innerErr: any) {
          toast.error(`Erro ao processar: ${innerErr.message}`);
        } finally {
          setIsParsingPdf(false);
        }
      };
      reader.onerror = () => {
        toast.error('Falha ao ler o ficheiro físico.');
        setIsParsingPdf(false);
      };
    } catch (error: any) {
      console.error(error);
      toast.error(`Erro ao analisar: ${error.message}`);
      setIsParsingPdf(false);
    } finally {
      e.target.value = '';
    }
  };

  const handleConfirmPdfImport = async () => {
    if (!profile?.businessId) return;
    const itemsToImport = parsedPdfProducts.filter(p => p.selected && p.name.trim() !== '');
    if (itemsToImport.length === 0) {
      toast.error("Nenhum produto válido selecionado.");
      return;
    }

    setIsSavingParsed(true);
    let importedCount = 0;
    try {
      const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');
      for (const item of itemsToImport) {
        const schemeId = matchCategoryToScheme(item.category) || 'cx_emb_un';
        
        await addDoc(collection(db, `businesses/${profile.businessId}/products`), {
          name: item.name,
          sku: item.sku || '',
          barcode: item.barcode || '',
          price: Number(item.price) || 0,
          onlinePrice: Number(item.price) || 0,
          costPrice: Number(item.costPrice) || 0,
          availableOnline: false,
          description: item.description || '',
          stockLevel: Number(item.quantity) || 0,
          stockUn: Number(item.quantity) || 0,
          stockCx: 0,
          stockEmb: 0,
          lowStockThreshold: 5,
          category: item.category || 'Geral',
          supplier: item.supplier || '',
          tieredPrices: [],
          hasMultiUnits: false,
          uomScheme: schemeId,
          boxUnitName: 'Caixa',
          boxUnitLabel: 'Cx',
          packUnitName: 'Embalagem',
          packUnitLabel: 'Emb',
          baseUnitName: 'Unidade',
          baseUnitLabel: 'Un',
          hasBoxUnit: false,
          boxUnitQty: 10,
          boxUnitPrice: 0,
          boxUnitCostPrice: 0,
          hasPackUnit: false,
          packUnitQty: 100,
          packUnitPrice: 0,
          packUnitCostPrice: 0,
          businessId: profile.businessId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        importedCount++;
      }
      await logAction(profile.uid, profile.email, ActionType.CREATE_PRODUCT, `Importou ${importedCount} produtos do PDF "${pdfFileName}"`, profile.businessId);
      toast.success(`${importedCount} produtos adicionados ao inventário.`);
      setShowPdfReviewModal(false);
      setParsedPdfProducts([]);
    } catch (error: any) {
      toast.error(`Erro ao salvar: ${error.message}`);
    } finally {
      setIsSavingParsed(false);
    }
  };

  const findDuplicates = () => {
    const list: Array<{ product1: any; product2: any; ratio: number }> = [];
    const normalized = products.map(p => ({
      ...p,
      cleanName: (p.name || '').toLowerCase().trim()
        .replace(/[.,\-/#!$%^&*;:{}=\-_`~()]/g, "")
        .replace(/\s+/g, "")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    }));

    for (let i = 0; i < normalized.length; i++) {
      for (let j = i + 1; j < normalized.length; j++) {
        const p1 = normalized[i];
        const p2 = normalized[j];

        if (p1.cleanName === p2.cleanName && p1.id !== p2.id) {
          const product1 = products.find(p => p.id === p1.id);
          const product2 = products.find(p => p.id === p2.id);
          if (product1 && product2) {
            list.push({ product1, product2, ratio: 1 });
          }
        } else {
          const l1 = p1.cleanName;
          const l2 = p2.cleanName;
          if (l1.length > 3 && l2.length > 3) {
            const isSub = l1.includes(l2) || l2.includes(l1);
            if (isSub) {
              const product1 = products.find(p => p.id === p1.id);
              const product2 = products.find(p => p.id === p2.id);
              if (product1 && product2) {
                list.push({ product1, product2, ratio: 0.8 });
              }
            }
          }
        }
      }
    }
    setDuplicateMatches(list);
  };

  useEffect(() => {
    if (showDeduplicateModal) {
      findDuplicates();
    }
  }, [products, showDeduplicateModal]);

  useEffect(() => {
    if (businessData?.name && !customStoreName) {
      setCustomStoreName(businessData.name);
    }
  }, [businessData, customStoreName]);

  const handleMergeProductsCheck = async (mainId: string, duplicateId: string) => {
    if (!profile?.businessId || !mainId || !duplicateId) {
      toast.error("Por favor, selecione ambos os artigos.");
      return;
    }
    if (mainId === duplicateId) {
      toast.error("O artigo principal e o duplicado não podem ser o mesmo.");
      return;
    }

    const mainProd = products.find(p => p.id === mainId);
    const dupProd = products.find(p => p.id === duplicateId);
    if (!mainProd || !dupProd) {
      toast.error("Artigo não encontrado.");
      return;
    }

    executeWithManagerAuthorization(`mesclar e apagar o artigo duplicado '${dupProd.name}' e transferir o stock para '${mainProd.name}'`, async () => {
      setIsMerging(true);
      try {
        const mainStock = Number(mainProd.stockLevel) || 0;
        const dupStock = Number(dupProd.stockLevel) || 0;
        const newStock = mainStock + dupStock;

        // Sum sub-unit levels for exact physical counts
        const mainCx = Number(mainProd.stockCx) || 0;
        const dupCx = Number(dupProd.stockCx) || 0;
        const newCx = mainCx + dupCx;

        const mainEmb = Number(mainProd.stockEmb) || 0;
        const dupEmb = Number(dupProd.stockEmb) || 0;
        const newEmb = mainEmb + dupEmb;

        const mainUn = Number(mainProd.stockUn) || 0;
        const dupUn = Number(dupProd.stockUn) || 0;
        const newUn = mainUn + dupUn;

        const { doc, updateDoc, deleteDoc, serverTimestamp } = await import('firebase/firestore');

        // Create merge payload including stock levels and missing metadata fields
        const mergePayload: any = {
          stockLevel: newStock,
          stockCx: newCx,
          stockEmb: newEmb,
          stockUn: newUn,
          updatedAt: serverTimestamp()
        };

        // Preserving missing fields from the duplicate to the main product
        if (!mainProd.barcode && dupProd.barcode) mergePayload.barcode = dupProd.barcode;
        if (!mainProd.sku && dupProd.sku) mergePayload.sku = dupProd.sku;
        if (!mainProd.price && dupProd.price) mergePayload.price = dupProd.price;
        if (!mainProd.costPrice && dupProd.costPrice) mergePayload.costPrice = dupProd.costPrice;
        if (!mainProd.onlinePrice && dupProd.onlinePrice) mergePayload.onlinePrice = dupProd.onlinePrice;
        if (!mainProd.description && dupProd.description) mergePayload.description = dupProd.description;
        if (!mainProd.category && dupProd.category) mergePayload.category = dupProd.category;
        if (!mainProd.supplier && dupProd.supplier) mergePayload.supplier = dupProd.supplier;
        if (!mainProd.lowStockThreshold && dupProd.lowStockThreshold) mergePayload.lowStockThreshold = dupProd.lowStockThreshold;
        if (mainProd.hasMultiUnits === undefined && dupProd.hasMultiUnits !== undefined) mergePayload.hasMultiUnits = dupProd.hasMultiUnits;
        if (mainProd.hasBoxUnit === undefined && dupProd.hasBoxUnit !== undefined) {
          mergePayload.hasBoxUnit = dupProd.hasBoxUnit;
          if (dupProd.boxUnitName) mergePayload.boxUnitName = dupProd.boxUnitName;
          if (dupProd.boxUnitQty) mergePayload.boxUnitQty = dupProd.boxUnitQty;
          if (dupProd.boxUnitPrice) mergePayload.boxUnitPrice = dupProd.boxUnitPrice;
          if (dupProd.boxUnitCostPrice) mergePayload.boxUnitCostPrice = dupProd.boxUnitCostPrice;
        }
        if (mainProd.hasPackUnit === undefined && dupProd.hasPackUnit !== undefined) {
          mergePayload.hasPackUnit = dupProd.hasPackUnit;
          if (dupProd.packUnitName) mergePayload.packUnitName = dupProd.packUnitName;
          if (dupProd.packUnitQty) mergePayload.packUnitQty = dupProd.packUnitQty;
          if (dupProd.packUnitPrice) mergePayload.packUnitPrice = dupProd.packUnitPrice;
          if (dupProd.packUnitCostPrice) mergePayload.packUnitCostPrice = dupProd.packUnitCostPrice;
        }
        if (!mainProd.baseUnitLabel && dupProd.baseUnitLabel) mergePayload.baseUnitLabel = dupProd.baseUnitLabel;

        // Update main product details and stock structure
        await updateDoc(doc(db, `businesses/${profile.businessId}/products`, mainId), mergePayload);

        // Delete duplicate product
        await deleteDoc(doc(db, `businesses/${profile.businessId}/products`, duplicateId));

        await logAction(
          profile.uid,
          profile.email,
          ActionType.DELETE_PRODUCT,
          `Produtos Mesclados: '${dupProd.name}' (${dupStock} un.) em '${mainProd.name}' (Novo tot: ${newStock} un.) devido a erro ortográfico`,
          profile.businessId
        );

        toast.success(`Mesclagem efetuada! '${dupProd.name}' incorporado em '${mainProd.name}'. Stock unificado para ${newStock} un.!`);
        setMainProductId('');
        setTargetProductId('');
      } catch (e: any) {
        console.error(e);
        toast.error("Erro na mesclagem: " + e.message);
      } finally {
        setIsMerging(false);
      }
    });
  };

  // Manager Authorization PIN state
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinSuccessAction, setPinSuccessAction] = useState<() => void>(() => {});
  const [pinActionName, setPinActionName] = useState('');
  const [pinSetupModalOpen, setPinSetupModalOpen] = useState(false);

  const executeWithManagerAuthorization = (actionName: string, actionFn: () => void) => {
    const userRole = profile?.role;
    const hasManagerPrivilege = userRole === 'owner' || userRole === 'business_owner' || userRole === 'manager' || userRole === 'admin' || userRole?.toLowerCase() === 'super_admin';
    const isAuthorizedStaffToTrigger = hasManagerPrivilege || userRole === 'staff' || userRole === 'cashier' || userRole === 'accountant';

    if (!isAuthorizedStaffToTrigger) {
      toast.error("Apenas colaboradores autorizados do negócio podem solicitar esta ação.");
      return;
    }

    if (hasManagerPrivilege) {
      actionFn();
    } else {
      setPinActionName(actionName);
      setPinSuccessAction(() => actionFn);
      setPinModalOpen(true);
    }
  };

  const [newProduct, setNewProduct] = useState({
    name: '',
    sku: '',
    barcode: '',
    unidadeDeCompra: '',
    precoCustoUnidadeCompra: '' as string | number,
    conversaoUnidades: '' as string | number,
    precoRetalhoUn: '' as string | number,
    unidadesGrosso: [{ unidade: 'Cx', preco: '', tiers: [] }] as Array<{
      unidade: string;
      preco: string | number;
      tiers?: Array<{ quantidade: string | number; preco: string | number }>;
    }>,
    tiersRetalho: [] as Array<{ quantidade: string | number; preco: string | number }>,
    imageUrl: '',
    price: '' as string | number,
    onlinePrice: '' as string | number,
    costPrice: '' as string | number,
    availableOnline: false,
    description: '',
    stockLevel: '' as string | number,
    stockCx: '' as string | number,
    stockEmb: '' as string | number,
    stockUn: '' as string | number,
    lowStockThreshold: '' as string | number,
    category: '',
    supplier: '',
    managerNotes: '',
    allowWholesale: false,
    wholesalePrice: '' as string | number,
    tieredPrices: [] as Array<{ minQty: number | string; price: number | string }>,
    unitDiscountTiers: [] as Array<{ minQty: number | string; discountType: 'percent' | 'fixed'; discountVal: number | string }>,
    hasMultiUnits: false,
    uomScheme: 'cx_emb_un',
    boxUnitName: 'Caixa',
    boxUnitLabel: 'Cx',
    packUnitName: 'Embalagem',
    packUnitLabel: 'Emb',
    baseUnitName: 'Unidade',
    baseUnitLabel: 'Un',
    hasBoxUnit: false,
    boxUnitQty: '' as string | number,
    boxUnitPrice: '' as string | number,
    boxUnitCostPrice: '' as string | number,
    hasPackUnit: false,
    packUnitQty: '' as string | number,
    packUnitPrice: '' as string | number,
    packUnitCostPrice: '' as string | number
  });

  // --- CAMERA BARCODE SCANNING FOR INVENTÁRIO ---
  const [isInventoryScanning, setIsInventoryScanning] = useState(false);
  const [inventoryCameras, setInventoryCameras] = useState<any[]>([]);
  const [inventorySelectedCam, setInventorySelectedCam] = useState<string>('');
  const inventoryControlsRef = useRef<any>(null);

  const handleInventoryBarcodeScanned = (barcode: string) => {
    const trimmed = barcode.trim();
    if (!trimmed) return;
    
    // Trigger sound beep on scan
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.setValueAtTime(1450, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
      osc.stop(audioCtx.currentTime + 0.12);
    } catch (err) {}

    setNewProduct(prev => ({ ...prev, barcode: trimmed }));
    toast.success(`Código lido e preenchido: ${trimmed}`);
    setIsInventoryScanning(false);
  };

  // Load cameras when inventory scanner opens
  useEffect(() => {
    if (!isInventoryScanning) {
      setInventoryCameras([]);
      return;
    }

    const loadCameras = async () => {
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        if (devices && devices.length > 0) {
          setInventoryCameras(devices);
          const backCam = devices.find(d => 
            d.label.toLowerCase().includes('back') || 
            d.label.toLowerCase().includes('traseira') || 
            d.label.toLowerCase().includes('environment') ||
            d.label.toLowerCase().includes('rear')
          );
          if (backCam) {
            setInventorySelectedCam(backCam.deviceId);
          } else {
            setInventorySelectedCam(devices[0].deviceId);
          }
        } else {
          toast.error("Nenhuma câmara detetada.");
          setIsInventoryScanning(false);
        }
      } catch (err) {
        console.warn("Could not list cameras in Inventory:", err);
      }
    };

    loadCameras();
  }, [isInventoryScanning]);

  // Decode loop for inventory scanner modal
  useEffect(() => {
    let active = true;

    if (!isInventoryScanning) {
      if (inventoryControlsRef.current) {
        try {
          inventoryControlsRef.current.stop();
        } catch (e) {
          console.warn("Error stopping inventory scanner controls:", e);
        }
        inventoryControlsRef.current = null;
      }
      return;
    }

    const timer = setTimeout(async () => {
      if (!active) return;

      try {
        const hints = new Map();
        const formats = [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.QR_CODE,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39
        ];
        hints.set(DecodeHintType.POSSIBLE_FORMATS, formats);

        const codeReader = new BrowserMultiFormatReader(hints);
        const videoElement = document.getElementById('inventory-scanner-preview') as HTMLVideoElement;

        if (!videoElement) {
          console.warn("Video element inventory-scanner-preview not found yet.");
          return;
        }

        if (inventoryControlsRef.current) {
          try {
            inventoryControlsRef.current.stop();
          } catch (e) {}
        }

        const controls = await codeReader.decodeFromVideoDevice(
          inventorySelectedCam || undefined,
          videoElement,
          (result, error) => {
            if (!active) return;
            if (result) {
              const decodedText = result.getText();
              handleInventoryBarcodeScanned(decodedText);
            }
          }
        );

        inventoryControlsRef.current = controls;
      } catch (err) {
        console.error("Inventory camera scan start error:", err);
        if (active) {
          toast.error("Erro ao iniciar a câmara seleccionada. Tente escolher outra câmara ou certique-se de que deu permissões.");
          setIsInventoryScanning(false);
        }
      }
    }, 450);

    return () => {
      active = false;
      clearTimeout(timer);
      if (inventoryControlsRef.current) {
        try {
          inventoryControlsRef.current.stop();
        } catch (e) {
          console.warn("Error on inventory dependency cleanup:", e);
        }
        inventoryControlsRef.current = null;
      }
    };
  }, [isInventoryScanning, inventorySelectedCam]);

  // --- PRINTABLE BARCODE LABEL GENERATION ---
  const [isBarcodeLabelOpen, setIsBarcodeLabelOpen] = useState(false);
  const barcodeSvgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (isBarcodeLabelOpen && viewingProduct && barcodeSvgRef.current) {
      try {
        const rawBarcode = (viewingProduct.barcode || '').trim();
        let valueToEncode = rawBarcode;
        let selectedFormat = "CODE128";

        const cleanDigits = rawBarcode.replace(/\D/g, '');
        if (cleanDigits.length === 12 || cleanDigits.length === 13) {
          valueToEncode = cleanDigits;
          selectedFormat = "EAN13";
        } else if (cleanDigits.length > 0 && /^\d+$/.test(rawBarcode)) {
          valueToEncode = (cleanDigits + "000000000000").slice(0, 12);
          selectedFormat = "EAN13";
        } else {
          valueToEncode = rawBarcode || viewingProduct.sku || '100000201001';
          selectedFormat = "CODE128";
        }

        JsBarcode(barcodeSvgRef.current, valueToEncode, {
          format: selectedFormat as any,
          lineColor: "#000",
          width: 1.8,
          height: 50,
          displayValue: true,
          fontSize: 12,
          margin: 4
        });
      } catch (err) {
        console.error("JsBarcode render error in Inventory modal:", err);
      }
    }
  }, [isBarcodeLabelOpen, viewingProduct]);

  useEffect(() => {
    const precoCusto = Number(newProduct.precoCustoUnidadeCompra);
    const conversao = Number(newProduct.conversaoUnidades);
    if (precoCusto > 0 && conversao > 0) {
      const calculatedCostPrice = Number((precoCusto / conversao).toFixed(2));
      if (Number(newProduct.costPrice) !== calculatedCostPrice) {
        setNewProduct(prev => ({
          ...prev,
          costPrice: calculatedCostPrice
        }));
      }
    }
  }, [newProduct.precoCustoUnidadeCompra, newProduct.conversaoUnidades]);

  useEffect(() => {
    const initTab = sessionStorage.getItem('init_inventory_tab');
    if (initTab) {
      if (initTab === 'add') {
        setActiveTab('add');
        setIsCreating(true);
      } else {
        setActiveTab(initTab as any);
      }
      sessionStorage.removeItem('init_inventory_tab');
    }
  }, []);

  useEffect(() => {
    if (!profile?.businessId) return;
    
    // Load from local IndexedDB cache first for immediate offline visualization
    offlineDb.getProducts().then((cachedProducts) => {
      if (cachedProducts && cachedProducts.length > 0) {
        setProducts(cachedProducts);
        setLoading(false);
      }
    }).catch(err => {
      console.warn("Could not load products from offline cache:", err);
    });

    const q = query(collection(db, `businesses/${profile.businessId}/products`));
    const unsubscribe = subscribeToCollection(
      `businesses/${profile.businessId}/products`,
      (docs) => {
        setProducts(docs);
        setLoading(false);
        // Save to IndexedDB cache
        offlineDb.saveProducts(docs).catch(err => {
          console.warn("Could not save products to offline cache:", err);
        });
      },
      q,
      (error) => {
        setLoading(false);
        try {
          handleFirestoreError(error, OperationType.LIST, `businesses/${profile.businessId}/products`);
        } catch (e) {
          console.warn("Gracefully logged inventory products query error:", e);
        }
      }
    );

    return unsubscribe;
  }, [profile?.businessId]);

  useEffect(() => {
    const highlightId = sessionStorage.getItem('highlight_product_id');
    if (highlightId && products.length > 0) {
      const targetProd = products.find(p => p.id === highlightId);
      if (targetProd && targetProd.name) {
        setSearchTerm(targetProd.name);
        setActiveTab('list');
      }
      sessionStorage.removeItem('highlight_product_id');
    }
  }, [products]);

  useEffect(() => {
    if (!profile?.businessId) return;
    
    const q = query(collection(db, `businesses/${profile.businessId}/quebras`));
    const unsubscribe = subscribeToCollection(
      `businesses/${profile.businessId}/quebras`,
      (docs) => {
        const sortedDocs = [...docs].sort((a, b) => {
          const timeA = (a as any).createdAt?.seconds || 0;
          const timeB = (b as any).createdAt?.seconds || 0;
          return timeB - timeA;
        });
        setQuebras(sortedDocs);
      },
      q,
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, `businesses/${profile.businessId}/quebras`);
        } catch (e) {
          console.warn("Gracefully logged quebras query error:", e);
        }
      }
    );

    return unsubscribe;
  }, [profile?.businessId]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // Reusable "open full edit form" handler — populates newProduct from an
  // existing product and switches to the add/edit tab. Shared by every
  // product table/card in this file so there's a single source of truth for
  // which fields the edit form expects.
  const openProductEditor = (product: any) => {
    // If this product's stock breakdown has a negative bucket (e.g. -10 Un) —
    // a legacy symptom of old sales deducting from one bucket without breaking
    // open a sealed Caixa/Embalagem first — repair it before showing the form,
    // so the person never sees a confusing negative count. Total stock is
    // unchanged; only how it's split across Cx/Emb/Un is corrected.
    const hasNegativeBucket = Number(product.stockCx || 0) < 0 || Number(product.stockEmb || 0) < 0 || Number(product.stockUn || 0) < 0;
    const stockToUse = hasNegativeBucket ? repairNegativeStockBuckets(product) : product;
    if (hasNegativeBucket && profile?.businessId) {
      (async () => {
        try {
          const { updateDoc, doc } = await import('firebase/firestore');
          await updateDoc(doc(db, `businesses/${profile.businessId}/products`, product.id), {
            stockCx: stockToUse.stockCx,
            stockEmb: stockToUse.stockEmb,
            stockUn: stockToUse.stockUn,
            updatedAt: serverTimestamp()
          });
          toast.success('Stock físico reorganizado automaticamente (uma Caixa/Embalagem selada foi aberta) — a quantidade total não mudou.');
        } catch {
          // Non-fatal — the form still shows the corrected numbers even if the background save fails.
        }
      })();
    }

    setEditingProduct(product);
    setActiveTab('add');
    setNewProduct({
      name: product.name || '',
      sku: product.sku || '',
      barcode: product.barcode || '',
      unidadeDeCompra: product.unidadeDeCompra || '',
      precoCustoUnidadeCompra: product.precoCustoUnidadeCompra !== undefined && product.precoCustoUnidadeCompra !== null ? product.precoCustoUnidadeCompra : '',
      conversaoUnidades: product.conversaoUnidades !== undefined && product.conversaoUnidades !== null ? product.conversaoUnidades : '',
      precoRetalhoUn: product.precoRetalhoUn !== undefined && product.precoRetalhoUn !== null ? product.precoRetalhoUn : (product.price || ''),
      unidadesGrosso: (product.unidadesGrosso && product.unidadesGrosso.length > 0
        ? product.unidadesGrosso
        : (product.boxUnitPrice ? [{ unidade: product.boxUnitLabel || 'Cx', preco: product.boxUnitPrice }] : [{ unidade: 'Cx', preco: '' }])
      ).map((u: any) => ({
        unidade: u.unidade || '',
        preco: u.preco !== undefined && u.preco !== null ? u.preco : '',
        tiers: u.tiers || []
      })),
      tiersRetalho: product.tiersRetalho || [],
      imageUrl: product.imageUrl || '',
      price: product.price !== undefined && product.price !== null ? product.price : '',
      onlinePrice: product.onlinePrice !== undefined && product.onlinePrice !== null ? product.onlinePrice : '',
      costPrice: product.costPrice !== undefined && product.costPrice !== null ? product.costPrice : '',
      availableOnline: product.availableOnline || false,
      allowWholesale: product.allowWholesale || false,
      wholesalePrice: product.wholesalePrice !== undefined && product.wholesalePrice !== null ? product.wholesalePrice : '',
      description: product.description || '',
      managerNotes: product.managerNotes || '',
      stockLevel: product.stockLevel !== undefined && product.stockLevel !== null ? product.stockLevel : '',
      stockCx: stockToUse.stockCx !== undefined && stockToUse.stockCx !== null ? stockToUse.stockCx : '',
      stockEmb: stockToUse.stockEmb !== undefined && stockToUse.stockEmb !== null ? stockToUse.stockEmb : '',
      stockUn: stockToUse.stockUn !== undefined && stockToUse.stockUn !== null ? stockToUse.stockUn : '',
      lowStockThreshold: product.lowStockThreshold !== undefined && product.lowStockThreshold !== null ? product.lowStockThreshold : '',
      category: product.category || '',
      supplier: product.supplier || '',
      tieredPrices: product.tieredPrices || [],
      unitDiscountTiers: product.unitDiscountTiers || [],
      hasMultiUnits: product.hasMultiUnits || false,
      uomScheme: product.uomScheme || 'cx_emb_un',
      boxUnitName: product.boxUnitName || 'Caixa',
      boxUnitLabel: product.boxUnitLabel || 'Cx',
      packUnitName: product.packUnitName || 'Embalagem',
      packUnitLabel: product.packUnitLabel || 'Emb',
      baseUnitName: product.baseUnitName || 'Unidade',
      baseUnitLabel: product.baseUnitLabel || 'Un',
      hasBoxUnit: product.hasBoxUnit || false,
      boxUnitQty: product.boxUnitQty !== undefined && product.boxUnitQty !== null ? product.boxUnitQty : '',
      boxUnitPrice: product.boxUnitPrice !== undefined && product.boxUnitPrice !== null ? product.boxUnitPrice : '',
      boxUnitCostPrice: product.boxUnitCostPrice !== undefined && product.boxUnitCostPrice !== null ? product.boxUnitCostPrice : '',
      hasPackUnit: product.hasPackUnit || false,
      packUnitQty: product.packUnitQty !== undefined && product.packUnitQty !== null ? product.packUnitQty : '',
      packUnitPrice: product.packUnitPrice !== undefined && product.packUnitPrice !== null ? product.packUnitPrice : '',
      packUnitCostPrice: product.packUnitCostPrice !== undefined && product.packUnitCostPrice !== null ? product.packUnitCostPrice : ''
    });
  };

  const handleBulkDelete = async () => {
    if (!profile?.businessId || selectedIds.length === 0) return;
    executeWithManagerAuthorization(`remover permanentemente ${selectedIds.length} produtos em massa do inventário`, async () => {
      try {
        const deletePromises = selectedIds.map(id => 
          deleteDoc(doc(db, `businesses/${profile.businessId}/products`, id))
        );
        await Promise.all(deletePromises);
        await logAction(profile.uid, profile.email, ActionType.DELETE_PRODUCT, `Bulk deleted ${selectedIds.length} products`, profile.businessId);
        toast.success(`${selectedIds.length} products deleted`);
        setSelectedIds([]);
      } catch (error) {
        toast.error("Failed to delete some products");
      }
    });
  };

  const handleDuplicateProduct = async (product: any) => {
    if (!profile?.businessId) return;
    try {
      const { id, ...rest } = product;
      await addDoc(collection(db, `businesses/${profile.businessId}/products`), {
        ...rest,
        name: `${product.name || 'Produto'} (Cópia)`,
        sku: '',
        barcode: '',
        stockLevel: 0,
        stockCx: 0,
        stockEmb: 0,
        stockUn: 0,
        createdAt: new Date().toISOString(),
      });
      toast.success('Produto duplicado. Edite o novo artigo para ajustar SKU e stock.');
    } catch (error) {
      toast.error('Erro ao duplicar produto.');
    }
  };

  const handleDeleteProduct = async (id: string, name: string) => {
    if (!profile?.businessId) return;
    executeWithManagerAuthorization(`remover permanentemente o artigo "${name}" do inventário`, async () => {
      try {
        await deleteDoc(doc(db, `businesses/${profile.businessId}/products`, id));
        await logAction(profile.uid, profile.email, ActionType.DELETE_PRODUCT, `Deleted product: ${name}`, profile.businessId);
        toast.success(`Artigo "${name}" removido com sucesso`);
        setSelectedIds(prev => prev.filter(i => i !== id));
      } catch (error) {
        toast.error("Erro ao remover o artigo");
      }
    });
  };

  const handleBulkArchive = async () => {
    if (!profile?.businessId || selectedIds.length === 0) return;
    executeWithManagerAuthorization(`arquivar em massa ${selectedIds.length} produtos do inventário`, async () => {
      try {
        const { updateDoc, doc } = await import('firebase/firestore');
        const archivePromises = selectedIds.map(id => 
          updateDoc(doc(db, `businesses/${profile.businessId}/products`, id), { archived: true, updatedAt: serverTimestamp() })
        );
        await Promise.all(archivePromises);
        await logAction(profile.uid, profile.email, ActionType.UPDATE_PRODUCT, `Bulk archived ${selectedIds.length} products`, profile.businessId);
        toast.success(`${selectedIds.length} products archived`);
        setSelectedIds([]);
      } catch (error) {
        toast.error("Failed to archive some products");
      }
    });
  };

  // Repairs products whose stockCx/stockEmb/stockUn breakdown went negative (e.g. -10 Un) —
  // a legacy symptom of sales deducting straight from one bucket without breaking open a
  // sealed Caixa/Embalagem first. This borrows from the larger packaging into the negative
  // bucket WITHOUT changing the product's true total stockLevel, it only re-distributes how
  // that same total is split across Cx/Emb/Un.
  const repairNegativeStockBuckets = (data: any) => {
    let stockCx = Number(data.stockCx || 0);
    let stockEmb = Number(data.stockEmb || 0);
    let stockUn = Number(data.stockUn || 0);
    const boxQty = Number(data.boxUnitQty || 10) || 10;
    const packQty = Number(data.packUnitQty || 100) || 100;

    while (stockUn < 0 && stockEmb > 0) {
      stockEmb -= 1;
      stockUn += packQty;
    }
    while (stockUn < 0 && stockCx > 0) {
      stockCx -= 1;
      stockUn += boxQty;
    }
    while (stockEmb < 0 && stockCx > 0) {
      stockCx -= 1;
      const embPerBox = Math.floor(boxQty / packQty) || 1;
      stockEmb += embPerBox;
    }

    return { stockCx, stockEmb, stockUn };
  };

  const handleFixNegativeStockBuckets = async () => {
    if (!profile?.businessId) return;
    const broken = products.filter(p =>
      Number(p.stockCx || 0) < 0 || Number(p.stockEmb || 0) < 0 || Number(p.stockUn || 0) < 0
    );
    if (broken.length === 0) {
      toast.success("Nenhum produto com stock negativo por unidade encontrado. Tudo certo! ✅");
      return;
    }
    executeWithManagerAuthorization(`corrigir ${broken.length} produto(s) com stock negativo por unidade`, async () => {
      try {
        const { updateDoc, doc } = await import('firebase/firestore');
        let fixedCount = 0;
        let stillNegativeCount = 0;
        for (const p of broken) {
          const repaired = repairNegativeStockBuckets(p);
          await updateDoc(doc(db, `businesses/${profile.businessId}/products`, p.id), {
            stockCx: repaired.stockCx,
            stockEmb: repaired.stockEmb,
            stockUn: repaired.stockUn,
            updatedAt: serverTimestamp()
          });
          fixedCount++;
          if (repaired.stockCx < 0 || repaired.stockEmb < 0 || repaired.stockUn < 0) stillNegativeCount++;
        }
        await logAction(profile.uid, profile.email, ActionType.UPDATE_PRODUCT, `Corrigido stock negativo por unidade em ${fixedCount} produto(s)`, profile.businessId);
        if (stillNegativeCount > 0) {
          toast.warning(`${fixedCount} produto(s) reorganizados. ${stillNegativeCount} continuam com défice real de stock (contagem física necessária).`);
        } else {
          toast.success(`${fixedCount} produto(s) corrigido(s) com sucesso! Stock reorganizado sem alterar a quantidade total.`);
        }
      } catch (error) {
        toast.error("Erro ao corrigir stock negativo.");
      }
    });
  };

  const handleCreateProduct = async () => {
    if (!profile?.businessId) return;

    const parseDecimalInput = (val: any, fallback = 0): number => {
      if (val === undefined || val === null || val === '') return fallback;
      if (typeof val === 'number') return isNaN(val) ? fallback : val;
      const cleaned = String(val).trim().replace(',', '.');
      const num = Number(cleaned);
      return isNaN(num) ? fallback : num;
    };

    const parsedPrice = parseDecimalInput(newProduct.precoRetalhoUn || newProduct.price);
    if (!newProduct.name || !newProduct.name.trim()) {
      toast.error("Por favor, introduza o nome do produto.");
      return;
    }
    const normalizedNewName = (newProduct.name || '').trim().toLowerCase();
    const barcodeNew = (newProduct.barcode || '').trim();
    const skuNew = (newProduct.sku || '').trim();

    const isDuplicate = products.some(p => {
      if (editingProduct && p.id === editingProduct.id) return false;
      if (p.archived) return false;

      const nameMatch = normalizedNewName && p.name?.trim().toLowerCase() === normalizedNewName;
      const barcodeMatch = barcodeNew && p.barcode?.trim() === barcodeNew;
      const skuMatch = skuNew && p.sku?.trim() === skuNew;
      return nameMatch || barcodeMatch || skuMatch;
    });

    if (isDuplicate) {
      toast.error("Já existe outro produto registado com estes mesmos detalhes (Nome, SKU ou Código de Barras duplicado).");
      return;
    }

    if (!editingProduct && isProductLimitReached()) {
      toast.error("O Plano Básico suporta no máximo 100 produtos. Faça upgrade para o plano Pro para adicionar produtos ilimitados.");
      return;
    }

    if (isNaN(parsedPrice) || parsedPrice < 0) {
      toast.error("Por favor, introduza um preço válido (igual ou superior a zero).");
      return;
    }

    // GUARD AGAINST "PRODUTO SEM PREÇO DE VENDA": previously, if the user left the retail
    // price empty (e.g. a product only sold by Caixa/Embalagem in Grosso), parsedPrice fell
    // back to 0 and passed the check above silently — the product would be saved with no
    // real preço de venda anywhere (retail = 0, no grosso price either), and nothing told
    // the user. We now require at least ONE real price: retail (> 0) or at least one
    // Grosso/Atacado unit price (> 0).
    const hasRetailPrice = parsedPrice > 0;
    const grossoRows = newProduct.unidadesGrosso || [];
    const hasGrossoPrice = grossoRows.some(u => parseDecimalInput(u.preco) > 0 && (u.unidade || '').trim());
    const hasWholesalePriceLegacy = newProduct.allowWholesale && parseDecimalInput(newProduct.wholesalePrice) > 0;

    if (!hasRetailPrice && !hasGrossoPrice && !hasWholesalePriceLegacy) {
      toast.error("Este produto ficaria sem nenhum Preço de Venda definido. Defina o Preço de Venda Retalho (por " + (newProduct.baseUnitLabel || 'Un') + ") ou pelo menos um preço de Venda por Grosso/Atacado.");
      return;
    }

    try {
      const stockCxVal = parseDecimalInput(newProduct.stockCx);
      const stockEmbVal = parseDecimalInput(newProduct.stockEmb);
      const stockUnVal = parseDecimalInput(newProduct.stockUn);
      const boxQtyVal = parseDecimalInput(newProduct.boxUnitQty, 10);
      const packQtyVal = parseDecimalInput(newProduct.packUnitQty, 100);
      const calculatedStockLevel = (stockCxVal * boxQtyVal) + (stockEmbVal * packQtyVal) + stockUnVal;

      if (stockCxVal < 0 || stockEmbVal < 0 || stockUnVal < 0 || calculatedStockLevel < 0) {
        toast.error("A quantidade em stock não pode ser um número negativo.");
        return;
      }

      // VALIDATE RETALHO TIERS
      const tiersRet = newProduct.tiersRetalho || [];
      if (tiersRet.length > 0) {
        for (let i = 1; i < tiersRet.length; i++) {
          if (Number(tiersRet[i].quantidade) <= Number(tiersRet[i - 1].quantidade)) {
            toast.error("As quantidades dos escalões de preço de retalho devem estar em ordem crescente.");
            return;
          }
        }
        const baseRetalhoPrice = parseDecimalInput(newProduct.precoRetalhoUn || newProduct.price);
        for (let i = 0; i < tiersRet.length; i++) {
          if (Number(tiersRet[i].preco) >= baseRetalhoPrice) {
            toast.error(`O preço do escalão de retalho (${tiersRet[i].preco} MZN) deve ser menor que o preço base (${baseRetalhoPrice} MZN).`);
            return;
          }
        }
      }

      // VALIDATE GROSSO TIERS
      const unitsGrosso = newProduct.unidadesGrosso || [];
      for (let j = 0; j < unitsGrosso.length; j++) {
        const u = unitsGrosso[j];
        const uTiers = u.tiers || [];
        if (uTiers.length > 0) {
          for (let i = 1; i < uTiers.length; i++) {
            if (Number(uTiers[i].quantidade) <= Number(uTiers[i - 1].quantidade)) {
              toast.error(`As quantidades dos escalões de preço para a unidade ${u.unidade} devem estar em ordem crescente.`);
              return;
            }
          }
          const baseGrossoPrice = parseDecimalInput(u.preco);
          for (let i = 0; i < uTiers.length; i++) {
            if (Number(uTiers[i].preco) >= baseGrossoPrice) {
              toast.error(`O preço do escalão de ${u.unidade} (${uTiers[i].preco} MZN) deve ser menor que o preço base (${baseGrossoPrice} MZN).`);
              return;
            }
          }
        }
      }

      const productPayload = {
        name: newProduct.name || '',
        sku: newProduct.sku || '',
        barcode: newProduct.barcode || '',
        unidadeDeCompra: newProduct.unidadeDeCompra || '',
        precoCustoUnidadeCompra: parseDecimalInput(newProduct.precoCustoUnidadeCompra),
        conversaoUnidades: parseDecimalInput(newProduct.conversaoUnidades),
        precoRetalhoUn: parseDecimalInput(newProduct.precoRetalhoUn || newProduct.price),
        unidadesGrosso: (newProduct.unidadesGrosso || []).map(u => ({
          unidade: u.unidade || '',
          preco: parseDecimalInput(u.preco),
          tiers: (u.tiers || []).map(t => ({
            quantidade: parseDecimalInput(t.quantidade),
            preco: parseDecimalInput(t.preco)
          }))
        })),
        tiersRetalho: (newProduct.tiersRetalho || []).map(t => ({
          quantidade: parseDecimalInput(t.quantidade),
          preco: parseDecimalInput(t.preco)
        })),
        imageUrl: newProduct.imageUrl || '',
        price: parsedPrice,
        onlinePrice: parsedPrice,
        costPrice: parseDecimalInput(newProduct.costPrice),
        availableOnline: newProduct.availableOnline || false,
        description: newProduct.description || '',
        managerNotes: newProduct.managerNotes || '',
        stockLevel: calculatedStockLevel,
        stockCx: stockCxVal,
        stockEmb: stockEmbVal,
        stockUn: stockUnVal,
        lowStockThreshold: parseDecimalInput(newProduct.lowStockThreshold),
        category: newProduct.category || '',
        supplier: newProduct.supplier || '',
        allowWholesale: newProduct.allowWholesale || false,
        wholesalePrice: parseDecimalInput(newProduct.wholesalePrice),
        tieredPrices: (newProduct.tieredPrices || []).map(t => ({
          minQty: parseDecimalInput(t.minQty),
          price: parseDecimalInput(t.price)
        })),
        unitDiscountTiers: (newProduct.unitDiscountTiers || []).map(t => ({
          minQty: parseDecimalInput(t.minQty),
          discountType: t.discountType || 'percent',
          discountVal: parseDecimalInput(t.discountVal)
        })),
        hasMultiUnits: newProduct.hasMultiUnits || false,
        uomScheme: newProduct.uomScheme || 'cx_emb_un',
        boxUnitName: newProduct.boxUnitName || 'Caixa',
        boxUnitLabel: newProduct.boxUnitLabel || 'Cx',
        packUnitName: newProduct.packUnitName || 'Embalagem',
        packUnitLabel: newProduct.packUnitLabel || 'Emb',
        baseUnitName: newProduct.baseUnitName || 'Unidade',
        baseUnitLabel: newProduct.baseUnitLabel || 'Un',
        hasBoxUnit: newProduct.hasBoxUnit || false,
        boxUnitQty: boxQtyVal,
        boxUnitPrice: parseDecimalInput(newProduct.boxUnitPrice),
        boxUnitCostPrice: parseDecimalInput(newProduct.boxUnitCostPrice),
        hasPackUnit: newProduct.hasPackUnit || false,
        packUnitQty: packQtyVal,
        packUnitPrice: parseDecimalInput(newProduct.packUnitPrice),
        packUnitCostPrice: parseDecimalInput(newProduct.packUnitCostPrice),
        businessId: profile.businessId,
        updatedAt: serverTimestamp()
      };

      const saveOperation = async () => {
        try {
          if (editingProduct) {
            const wasOutOfStock = (editingProduct.stockLevel || 0) <= 0;
            const isNowInStock = (productPayload.stockLevel || 0) > 0;

            await updateDoc(doc(db, `businesses/${profile.businessId}/products`, editingProduct.id), productPayload);
            await logAction(profile.uid, profile.email, ActionType.UPDATE_PRODUCT, `Updated product: ${newProduct.name}`, profile.businessId);
            toast.success("Produto atualizado com sucesso");

            if (wasOutOfStock && isNowInStock) {
              try {
                const { triggerProductAlertNotifications } = await import('../lib/notificationService');
                await triggerProductAlertNotifications(profile.businessId, {
                  name: productPayload.name,
                  onlinePrice: productPayload.onlinePrice || productPayload.price || 0
                }, false);
              } catch (errP) {
                console.error("Restock edit error:", errP);
              }
            }
          } else {
            await addDoc(collection(db, `businesses/${profile.businessId}/products`), {
              ...productPayload,
              createdAt: serverTimestamp()
            });
            await logAction(profile.uid, profile.email, ActionType.CREATE_PRODUCT, `Added product: ${newProduct.name}`, profile.businessId);
            toast.success("Produto adicionado ao inventário");

            try {
              const { triggerProductAlertNotifications } = await import('../lib/notificationService');
              await triggerProductAlertNotifications(profile.businessId, {
                name: productPayload.name,
                onlinePrice: productPayload.onlinePrice || productPayload.price || 0
              }, true);
            } catch (errP) {
              console.error("New product add error:", errP);
            }
          }

          setIsCreating(false);
          setEditingProduct(null);
          setActiveTab('list');
          setNewProduct({
            name: '',
            sku: '',
            barcode: '',
            unidadeDeCompra: '',
            precoCustoUnidadeCompra: '',
            conversaoUnidades: '',
            precoRetalhoUn: '',
            unidadesGrosso: [{ unidade: 'Cx', preco: '', tiers: [] }],
            tiersRetalho: [],
            imageUrl: '',
            price: '',
            onlinePrice: '',
            costPrice: '',
            availableOnline: false,
            description: '',
            stockLevel: '',
            stockCx: '',
            stockEmb: '',
            stockUn: '',
            lowStockThreshold: '',
            category: '',
            supplier: '',
            managerNotes: '',
            allowWholesale: false,
            wholesalePrice: '',
            tieredPrices: [],
            unitDiscountTiers: [],
            hasMultiUnits: false,
            uomScheme: 'cx_emb_un',
            boxUnitName: 'Caixa',
            boxUnitLabel: 'Cx',
            packUnitName: 'Embalagem',
            packUnitLabel: 'Emb',
            baseUnitName: 'Unidade',
            baseUnitLabel: 'Un',
            hasBoxUnit: false,
            boxUnitQty: '',
            boxUnitPrice: '',
            boxUnitCostPrice: '',
            hasPackUnit: false,
            packUnitQty: '',
            packUnitPrice: '',
            packUnitCostPrice: ''
          });
        } catch (saveError: any) {
          console.error("Failed inside saveOperation:", saveError);
          toast.error(`Erro ao guardar o produto: ${saveError.message || saveError}`);
        }
      };

      if (editingProduct) {
        // Checking if price/costs are being updated
        const isPriceChanged = Number(editingProduct.price) !== Number(parsedPrice) ||
          Number(editingProduct.onlinePrice) !== Number(parseDecimalInput(newProduct.onlinePrice, parsedPrice)) ||
          Number(editingProduct.costPrice) !== Number(parseDecimalInput(newProduct.costPrice)) ||
          Number(editingProduct.boxUnitPrice) !== Number(parseDecimalInput(newProduct.boxUnitPrice)) ||
          Number(editingProduct.packUnitPrice) !== Number(parseDecimalInput(newProduct.packUnitPrice));

        const actionDesc = isPriceChanged 
          ? `editar o artigo "${editingProduct.name}" e alterar os seus preços/custos` 
          : `editar as informações do artigo "${editingProduct.name}"`;

        executeWithManagerAuthorization(actionDesc, saveOperation);
      } else {
        // Create product case
        const hasPrice = parsedPrice > 0 || 
          parseDecimalInput(newProduct.boxUnitPrice) > 0 || 
          parseDecimalInput(newProduct.packUnitPrice) > 0 ||
          parseDecimalInput(newProduct.costPrice) > 0;

        const actionDesc = hasPrice
          ? `configurar preços e criar o novo artigo "${newProduct.name}" no inventário`
          : `criar o novo artigo "${newProduct.name}" no inventário`;

        executeWithManagerAuthorization(actionDesc, saveOperation);
      }
    } catch (error: any) {
      console.error("Failed to save product:", error);
      toast.error(`Erro ao guardar o produto: ${error.message || error}`);
    }
  };

  const handleQuickAdjust = async () => {
    if (!profile?.businessId || !quickAdjustProduct) return;
    
    const parsedAdjustVal = adjustValue === '' ? 0 : Number(adjustValue);
    if (parsedAdjustVal < 0) {
      toast.error("O valor de ajuste não pode ser negativo.");
      return;
    }

    setIsUpdatingStock(true);
    try {
      const currentStock = Number(quickAdjustProduct.stockLevel) || 0;
      let newStock = currentStock;

      if (adjustType === 'add') {
        newStock = currentStock + parsedAdjustVal;
      } else if (adjustType === 'subtract') {
        newStock = Math.max(0, currentStock - parsedAdjustVal);
      } else if (adjustType === 'set') {
        newStock = parsedAdjustVal;
      }

      await updateDoc(doc(db, `businesses/${profile.businessId}/products`, quickAdjustProduct.id), {
        stockLevel: newStock,
        updatedAt: serverTimestamp()
      });

      // Log stock movement!
      await addStockMovement(
        quickAdjustProduct.id,
        quickAdjustProduct.name,
        newStock - currentStock,
        'manual',
        adjustReason || 'Ajuste Manual'
      );

      const wasOutOfStock = currentStock <= 0;
      const isNowInStock = newStock > 0;
      if (wasOutOfStock && isNowInStock) {
        try {
          const { triggerProductAlertNotifications } = await import('../lib/notificationService');
          await triggerProductAlertNotifications(profile.businessId, {
            name: quickAdjustProduct.name,
            onlinePrice: quickAdjustProduct.onlinePrice || quickAdjustProduct.price || 0
          }, false);
        } catch (errP) {
          console.error("Restock quick adjust error:", errP);
        }
      }

      const changeStr = adjustType === 'add' ? `+${parsedAdjustVal}` : adjustType === 'subtract' ? `-${parsedAdjustVal}` : `definido para ${parsedAdjustVal}`;
      const reasonDetail = adjustReason ? ` (Motivo: ${adjustReason})` : '';
      const details = `Quick stock adjustment for "${quickAdjustProduct.name}": ${currentStock} -> ${newStock} (${changeStr})${reasonDetail}`;

      await logAction(
        profile.uid,
        profile.email,
        ActionType.UPDATE_STOCK,
        details,
        profile.businessId
      );

      toast.success(`Stock de "${quickAdjustProduct.name}" atualizado para ${newStock}!`);
      setQuickAdjustProduct(null);
      setAdjustValue(1);
      setAdjustReason('');
    } catch (error) {
      console.error(error);
      toast.error("Erro ao atualizar o stock do produto.");
    } finally {
      setIsUpdatingStock(false);
    }
  };

  const handleRecordQuebra = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.businessId || !selectedQuebraProduct) {
      toast.error("Por favor, selecione um produto.");
      return;
    }

    const qtyVal = Number(quebraQty);
    if (!quebraQty || isNaN(qtyVal) || qtyVal <= 0) {
      toast.error("Por favor, insira uma quantidade de quebra válida.");
      return;
    }

    const currentCx = Number(selectedQuebraProduct.stockCx ?? 0);
    const currentEmb = Number(selectedQuebraProduct.stockEmb ?? 0);
    const currentUn = Number(selectedQuebraProduct.stockUn ?? 0);
    const currentStockLevel = Number(selectedQuebraProduct.stockLevel ?? 0);

    const boxQty = Number(selectedQuebraProduct.boxUnitQty ?? 10);
    const packQty = Number(selectedQuebraProduct.packUnitQty ?? 100);

    let newCx = currentCx;
    let newEmb = currentEmb;
    let newUn = currentUn;
    let newStockLevel = currentStockLevel;

    if (selectedQuebraProduct.hasMultiUnits) {
      if (quebraUnit === 'cx') {
        if (currentCx < qtyVal) {
          toast.error(`Quantidade de caixas em stock insuficiente (Stock atual: ${currentCx} ${selectedQuebraProduct.boxUnitLabel || 'Cx'}).`);
          return;
        }
        newCx = currentCx - qtyVal;
      } else if (quebraUnit === 'emb') {
        if (currentEmb < qtyVal) {
          toast.error(`Quantidade de embalagens em stock insuficiente (Stock atual: ${currentEmb} ${selectedQuebraProduct.packUnitLabel || 'Emb'}).`);
          return;
        }
        newEmb = currentEmb - qtyVal;
      } else { // 'un'
        if (currentUn < qtyVal) {
          toast.error(`Quantidade de unidades em stock insuficiente (Stock atual: ${currentUn} ${selectedQuebraProduct.baseUnitLabel || 'Un'}).`);
          return;
        }
        newUn = currentUn - qtyVal;
      }
      newStockLevel = (newCx * boxQty) + (newEmb * packQty) + newUn;
    } else {
      // Single unit product
      if (currentStockLevel < qtyVal) {
        toast.error(`Stock insuficiente para registar esta quebra (Stock atual: ${currentStockLevel} unidades).`);
        return;
      }
      newStockLevel = currentStockLevel - qtyVal;
      newUn = newStockLevel;
    }

    setIsRecordingQuebra(true);
    try {
      const quebraPayload = {
        businessId: profile.businessId,
        productId: selectedQuebraProduct.id,
        productName: selectedQuebraProduct.name,
        qty: qtyVal,
        unit: quebraUnit,
        reason: quebraReason,
        notes: quebraNotes || '',
        reportedBy: profile.displayName || 'Utilizador',
        reportedByEmail: profile.email || '',
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, `businesses/${profile.businessId}/quebras`), quebraPayload);

      await updateDoc(doc(db, `businesses/${profile.businessId}/products`, selectedQuebraProduct.id), {
        stockCx: newCx,
        stockEmb: newEmb,
        stockUn: newUn,
        stockLevel: newStockLevel,
        updatedAt: serverTimestamp()
      });

      // Log stock movement!
      await addStockMovement(
        selectedQuebraProduct.id,
        selectedQuebraProduct.name,
        newStockLevel - currentStockLevel,
        'quebra',
        `Quebra (${quebraReason})`
      );

      const changeStr = `-${qtyVal} ${quebraUnit === 'cx' ? (selectedQuebraProduct.boxUnitLabel || 'Cx') : quebraUnit === 'emb' ? (selectedQuebraProduct.packUnitLabel || 'Emb') : (selectedQuebraProduct.baseUnitLabel || 'Un')}`;
      const logDetails = `Registada quebra de "${selectedQuebraProduct.name}": ${changeStr} por motivo de ${quebraReason}.`;
      await logAction(
        profile.uid,
        profile.email,
        ActionType.UPDATE_STOCK,
        logDetails,
        profile.businessId
      );

      toast.success(`Quebra registada com sucesso! O stock do produto foi atualizado.`);
      
      setSelectedQuebraProduct(null);
      setQuebraQty('');
      setQuebraUnit('un');
      setQuebraReason('broken');
      setQuebraNotes('');
    } catch (error: any) {
      console.error("Error recording quebra:", error);
      toast.error(`Erro ao registar quebra: ${error.message || error}`);
    } finally {
      setIsRecordingQuebra(false);
    }
  };

  const handleDeleteQuebra = async (quebraId: string, quebraItem: any) => {
    if (!profile?.businessId) return;
    
    const confirmUndo = window.confirm(`Deseja mesmo reverter este registo de quebra e repor o stock de ${quebraItem.qty} ${quebraItem.unit} no artigo "${quebraItem.productName}"?`);
    if (!confirmUndo) return;

    try {
      const targetProduct = products.find(p => p.id === quebraItem.productId);
      
      if (targetProduct) {
        const currentCx = Number(targetProduct.stockCx ?? 0);
        const currentEmb = Number(targetProduct.stockEmb ?? 0);
        const currentUn = Number(targetProduct.stockUn ?? 0);
        const currentStockLevel = Number(targetProduct.stockLevel ?? 0);
        const boxQty = Number(targetProduct.boxUnitQty ?? 10);
        const packQty = Number(targetProduct.packUnitQty ?? 100);

        let newCx = currentCx;
        let newEmb = currentEmb;
        let newUn = currentUn;
        let newStockLevel = currentStockLevel;

        if (targetProduct.hasMultiUnits) {
          if (quebraItem.unit === 'cx') {
            newCx = currentCx + quebraItem.qty;
          } else if (quebraItem.unit === 'emb') {
            newEmb = currentEmb + quebraItem.qty;
          } else { // 'un'
            newUn = currentUn + quebraItem.qty;
          }
          newStockLevel = (newCx * boxQty) + (newEmb * packQty) + newUn;
        } else {
          newStockLevel = currentStockLevel + quebraItem.qty;
          newUn = newStockLevel;
        }

        await updateDoc(doc(db, `businesses/${profile.businessId}/products`, quebraItem.productId), {
          stockCx: newCx,
          stockEmb: newEmb,
          stockUn: newUn,
          stockLevel: newStockLevel,
          updatedAt: serverTimestamp()
        });
      }

      await deleteDoc(doc(db, `businesses/${profile.businessId}/quebras`, quebraId));

      const logDetails = `Revertido registo de quebra de "${quebraItem.productName}": reposto +${quebraItem.qty} ${quebraItem.unit} no stock.`;
      await logAction(
        profile.uid,
        profile.email,
        ActionType.UPDATE_STOCK,
        logDetails,
        profile.businessId
      );

      toast.success("Registo de quebra revertido e stock reposto com sucesso!");
    } catch (error: any) {
      console.error("Error reverting quebra:", error);
      toast.error(`Erro ao reverter quebra: ${error.message || error}`);
    }
  };

  const handleDirectAddStock = async () => {
    if (!selectedStockProduct || !profile?.businessId) return;

    const getNumVal = (v: any) => {
      if (v === '' || v === undefined || v === null) return 0;
      const n = Number(String(v).trim().replace(',', '.'));
      return isNaN(n) ? 0 : n;
    };

    const addCxVal = getNumVal(addQtyCx);
    const addEmbVal = getNumVal(addQtyEmb);
    const addUnVal = getNumVal(addQtyUn);

    if (addCxVal === 0 && addEmbVal === 0 && addUnVal === 0) {
      toast.error("Por favor, introduza uma quantidade válida para adicionar.");
      return;
    }

    if (addCxVal < 0 || addEmbVal < 0 || addUnVal < 0) {
      toast.error("Por favor, introduza apenas quantidades positivas.");
      return;
    }

    setIsPerformingQuickAdd(true);

    try {
      const currentCx = Number(selectedStockProduct.stockCx ?? 0);
      const currentEmb = Number(selectedStockProduct.stockEmb ?? 0);
      const currentUn = Number(selectedStockProduct.stockUn ?? 0);

      const newCx = currentCx + addCxVal;
      const newEmb = currentEmb + addEmbVal;
      const newUn = currentUn + addUnVal;

      const boxQty = Number(selectedStockProduct.boxUnitQty ?? 10);
      const packQty = Number(selectedStockProduct.packUnitQty ?? 100);

      const calculatedStock = (newCx * boxQty) + (newEmb * packQty) + newUn;
      const batchQtyAdded = (addCxVal * boxQty) + (addEmbVal * packQty) + addUnVal;

      const existingBatches = selectedStockProduct.batches || [];
      
      // Handle calculator cost updates if applied to the currently selected product
      let batchCost = Number(selectedStockProduct.costPrice) || 0;
      let costUpdatePayload: any = {};
      
      if (calcAppliedResults && calcAppliedResults.productId === selectedStockProduct.id) {
        batchCost = calcAppliedResults.unitCost;
        if (calcUpdateProductPrices) {
          costUpdatePayload = {
            costPrice: calcAppliedResults.unitCost,
            price: calcAppliedResults.unitPrice,
            ...(selectedStockProduct.hasBoxUnit ? {
              boxUnitCostPrice: calcAppliedResults.boxCost,
              boxUnitPrice: calcAppliedResults.boxPrice,
            } : {}),
            ...(selectedStockProduct.hasPackUnit ? {
              packUnitCostPrice: calcAppliedResults.packCost,
              packUnitPrice: calcAppliedResults.packPrice,
            } : {}),
            ...(selectedStockProduct.allowWholesale ? {
              wholesalePrice: Number((calcAppliedResults.unitCost * (1 + Math.max(0, calcAppliedResults.markup - 8) / 100)).toFixed(2))
            } : {})
          };
        }
      }

      const newBatch = {
        productId: selectedStockProduct.id,
        batchId: `LOTE-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
        quantity: batchQtyAdded,
        expiryDate: expiryInput ? expiryInput : null,
        costPrice: batchCost,
        receivedDate: new Date().toISOString().split('T')[0],
        promotionActive: false,
        promotionPrice: null,
        promotionValidUntil: null
      };

      await updateDoc(doc(db, `businesses/${profile.businessId}/products`, selectedStockProduct.id), {
        stockCx: newCx,
        stockEmb: newEmb,
        stockUn: newUn,
        stockLevel: calculatedStock,
        batches: [...existingBatches, newBatch],
        ...costUpdatePayload,
        updatedAt: serverTimestamp()
      });

      const wasOutOfStock = (selectedStockProduct.stockLevel || 0) <= 0;
      const isNowInStock = calculatedStock > 0;
      if (wasOutOfStock && isNowInStock) {
        try {
          const { triggerProductAlertNotifications } = await import('../lib/notificationService');
          await triggerProductAlertNotifications(profile.businessId, {
            name: selectedStockProduct.name,
            onlinePrice: selectedStockProduct.onlinePrice || selectedStockProduct.price || 0
          }, false);
        } catch (errP) {
          console.error("Restock entry error:", errP);
        }
      }

      // Log action in audit logs
      let logMsg = `Added stock to "${selectedStockProduct.name}": `;
      const parts = [];
      if (addCxVal > 0) parts.push(`+${addCxVal} ${selectedStockProduct.boxUnitLabel || 'Cx'}`);
      if (addEmbVal > 0) parts.push(`+${addEmbVal} ${selectedStockProduct.packUnitLabel || 'Emb'}`);
      if (addUnVal > 0) parts.push(`+${addUnVal} ${selectedStockProduct.baseUnitLabel || 'Un'}`);
      logMsg += parts.join(', ') + ` (New stock level: ${calculatedStock} total units)`;

      await logAction(
        profile.uid,
        profile.email,
        ActionType.UPDATE_STOCK,
        logMsg,
        profile.businessId
      );

      toast.success(`Stock para "${selectedStockProduct.name}" adicionado com sucesso!`);
      
      // Reset input states
      setAddQtyCx('');
      setAddQtyEmb('');
      setAddQtyUn('');
      setExpiryInput('');
      setSelectedStockProduct(null);
      setStockSearchQuery('');
      setShowPurchaseCalc(false);
      setCalcBulkQty('');
      setCalcCostVal('');
      setCalcAppliedResults(null);
    } catch (error: any) {
      console.error("Error adding stock:", error);
      toast.error("Erro ao atualizar stock: " + (error.message || error));
    } finally {
      setIsPerformingQuickAdd(false);
    }
  };

  // Eliminate duplicate products by ID ensuring items are never listed more than once
  const uniqueProducts = useMemo(() => {
    return Array.from(
      new Map(products.map(p => [p.id, p])).values()
    );
  }, [products]);

  const filteredProducts = useMemo(() => {
    return uniqueProducts
      .filter(p => {
        const search = searchTerm.toLowerCase();
        const matchesSearch = 
          (p.name || '').toLowerCase().includes(search) || 
          (p.category || '').toLowerCase().includes(search) || 
          (p.sku || '').toLowerCase().includes(search) || 
          (p.barcode || '').toLowerCase().includes(search);
        
        const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
        
        const stats = getProductExpiryStats(p);
        const matchesExpiry = !expiryFilterOnly || (stats.level === 'expired' || stats.level === 'critical' || stats.level === 'warning');
        
        return matchesSearch && matchesCategory && matchesExpiry;
      })
      .sort((a, b) => {
        if (sortBy === 'name-asc') {
          return (a.name || '').localeCompare(b.name || '');
        }
        if (sortBy === 'name-desc') {
          return (b.name || '').localeCompare(a.name || '');
        }
        if (sortBy === 'stock-asc') {
          return (Number(a.stockLevel) || 0) - (Number(b.stockLevel) || 0);
        }
        if (sortBy === 'stock-desc') {
          return (Number(b.stockLevel) || 0) - (Number(a.stockLevel) || 0);
        }
        if (sortBy === 'price-asc') {
          return (Number(a.price) || 0) - (Number(b.price) || 0);
        }
        if (sortBy === 'price-desc') {
          return (Number(b.price) || 0) - (Number(a.price) || 0);
        }
        return 0;
      });
  }, [uniqueProducts, searchTerm, selectedCategory, expiryFilterOnly, sortBy]);

  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedProducts = filteredProducts.slice(startIndex, endIndex);

  // Calcule automaticamente o valor total do stock atual (soma de (quantidade * preço)) para a empresa.
  const totalCompanyStockValue = useMemo(() => {
    return uniqueProducts.reduce((sum, p) => sum + ((Number(p.stockLevel) || 0) * (Number(p.price) || 0)), 0);
  }, [uniqueProducts]);

  const totalCompanyCostValue = useMemo(() => {
    return uniqueProducts.reduce((sum, p) => sum + ((Number(p.stockLevel) || 0) * (Number(p.costPrice) || 0)), 0);
  }, [uniqueProducts]);

  const totalCompanyItems = useMemo(() => {
    return uniqueProducts.reduce((sum, p) => sum + (Number(p.stockLevel) || 0), 0);
  }, [uniqueProducts]);

  const totalCompanyPotentialProfit = useMemo(() => {
    return totalCompanyStockValue - totalCompanyCostValue;
  }, [totalCompanyStockValue, totalCompanyCostValue]);

  // Se houver filtros activos, calculamos também o valor filtrado correspondente
  const hasActiveFilters = searchTerm !== '' || selectedCategory !== 'all' || expiryFilterOnly;
  const totalFilteredStockValue = filteredProducts.reduce((sum, p) => sum + ((Number(p.stockLevel) || 0) * (Number(p.price) || 0)), 0);
  const totalFilteredCostValue = filteredProducts.reduce((sum, p) => sum + ((Number(p.stockLevel) || 0) * (Number(p.costPrice) || 0)), 0);
  const totalFilteredItems = filteredProducts.reduce((sum, p) => sum + (Number(p.stockLevel) || 0), 0);

  const handleExportCSV = () => {
    try {
      const headers = [
        "ID/Ref",
        "SKU",
        "Nome",
        "Categoria",
        "Codigo de Barras",
        "Fornecedor",
        "Stock Unico",
        `Preco de Custo (${currency})`,
        `Preco de Venda (${currency})`,
        `Valor Total Custo (${currency})`,
        `Valor Total Venda (${currency})`
      ];

      const csvRows = [headers.join(",")];

      let sumStock = 0;
      let sumCostValue = 0;
      let sumSaleValue = 0;

      filteredProducts.forEach(product => {
        const id = product.id || '';
        const sku = product.sku || '';
        const name = `"${(product.name || '').replace(/"/g, '""')}"`;
        const category = `"${(product.category || 'Nao categorizado').replace(/"/g, '""')}"`;
        const barcode = `"${(product.barcode || '').replace(/"/g, '""')}"`;
        const supplier = `"${(product.supplier || '').replace(/"/g, '""')}"`;
        const stock = Number(product.stockLevel) || 0;
        const costPrice = Number(product.costPrice) || 0;
        const price = Number(product.price) || 0;

        const totalCostVal = stock * costPrice;
        const totalSaleVal = stock * price;

        sumStock += stock;
        sumCostValue += totalCostVal;
        sumSaleValue += totalSaleVal;

        const row = [
          id,
          sku,
          name,
          category,
          barcode,
          supplier,
          stock,
          costPrice,
          price,
          totalCostVal,
          totalSaleVal
        ];

        csvRows.push(row.join(","));
      });

      // Add simple blank row separator
      csvRows.push("");

      // Add total general row
      const totalRow = [
        "TOTAL GERAL",
        "",
        "",
        "",
        "",
        "",
        sumStock,
        "",
        "",
        sumCostValue,
        sumSaleValue
      ];
      csvRows.push(totalRow.join(","));

      const csvContent = "\uFEFF" + csvRows.join("\n");
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `auditoria_inventario_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("CSV exportado com sucesso!");
    } catch (error: any) {
      console.error(error);
      toast.error("Erro ao exportar CSV: " + error.message);
    }
  };

  const handlePrintPDF = () => {
    try {
      if (filteredProducts.length === 0) {
        toast.error("Nenhum produto encontrado para imprimir.");
        return;
      }

      const doc = new jsPDF();
      
      // Título simples e direto, sem linhas ou banners decorativos
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(0, 0, 0);
      doc.text('INVENTÁRIO', 14, 15);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Data: ${new Date().toLocaleDateString()}`, 14, 21);

      const tableData = filteredProducts.map(p => [
        p.name || '',
        `${p.stockLevel || 0}`,
        `${Number(p.price || 0).toLocaleString()} ${currency}`
      ]);

      autoTable(doc, {
        startY: 28,
        head: [['Produto', 'Quantidade', 'Preço']],
        body: tableData,
        theme: 'plain',
        styles: {
          font: 'helvetica',
          fontSize: 9,
          cellPadding: 4,
          textColor: [0, 0, 0],
        },
        headStyles: {
          fontStyle: 'bold',
          textColor: [0, 0, 0],
          fillColor: false,
        },
        columnStyles: {
          0: { cellWidth: 'auto', halign: 'left' },
          1: { cellWidth: 35, halign: 'right' },
          2: { cellWidth: 40, halign: 'right' }
        },
        didParseCell: (data) => {
          if (data.cell.styles) {
            data.cell.styles.lineWidth = 0;
            data.cell.styles.lineColor = [255, 255, 255];
          }
        },
        margin: { left: 14, right: 14 }
      });

      doc.save(`inventario_${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success("Documento PDF gerado com sucesso!");
    } catch (error: any) {
      console.error(error);
      toast.error("Erro ao gerar PDF: " + error.message);
    }
  };

  const filteredQuebras = quebras.filter(item => {
    const matchesSearch = item.productName.toLowerCase().includes(quebrasSearch.toLowerCase()) || 
                          (item.reportedBy || '').toLowerCase().includes(quebrasSearch.toLowerCase()) ||
                          (item.notes || '').toLowerCase().includes(quebrasSearch.toLowerCase());
    const matchesReason = quebrasReasonFilter === 'all' || item.reason === quebrasReasonFilter;
    return matchesSearch && matchesReason;
  });

  return (
    <div className="space-y-3">
      {/* HEADER PRINCIPAL */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-1.5 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-black text-slate-900 tracking-tight">{t('inventory')}</h2>
            {!isOnline && (
              <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 px-2 py-0.5 rounded-lg font-black border border-amber-200 animate-pulse text-[9px] uppercase tracking-wider">
                ● Offline Mode (Cached)
              </span>
            )}
          </div>
        </div>
        
        {/* Modern Segmented Sub-Tab Control */}
        <div className="flex bg-slate-105 p-1 rounded-xl w-full md:w-auto overflow-x-auto min-w-[325px] border border-slate-205 shadow-inner bg-slate-100/60 gap-1">
          <button
            type="button"
            onClick={() => {
              setActiveTab('list');
              setIsCreating(false);
              setEditingProduct(null);
            }}
            className={cn(
              "flex-1 px-2.5 py-1.5 rounded-lg text-[10.5px] font-black uppercase tracking-wider transition-all duration-300 cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap",
              activeTab === 'list' && !isCreating && !editingProduct 
                ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20 font-black scale-102" 
                : "text-slate-500 hover:text-slate-800"
            )}
          >
            📋 Lista
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('add');
              const autoSku = 'REF-' + Math.floor(100000 + Math.random() * 900000);
              setNewProduct({
                name: '',
                sku: autoSku,
                barcode: '',
                unidadeDeCompra: '',
                precoCustoUnidadeCompra: '',
                conversaoUnidades: '',
                precoRetalhoUn: '',
                unidadesGrosso: [{ unidade: 'Cx', preco: '', tiers: [] }],
                tiersRetalho: [],
                imageUrl: '',
                price: '',
                onlinePrice: '',
                costPrice: '',
                availableOnline: false,
                description: '',
                stockLevel: '',
                stockCx: '',
                stockEmb: '',
                stockUn: '',
                lowStockThreshold: 5,
                category: '',
                supplier: '',
                managerNotes: '',
                allowWholesale: false,
                wholesalePrice: '',
                tieredPrices: [],
                unitDiscountTiers: [],
                hasMultiUnits: false,
                uomScheme: 'cx_emb_un',
                boxUnitName: 'Caixa',
                boxUnitLabel: 'Cx',
                packUnitName: 'Embalagem',
                packUnitLabel: 'Emb',
                baseUnitName: 'Unidade',
                baseUnitLabel: 'Un',
                hasBoxUnit: false,
                boxUnitQty: '',
                boxUnitPrice: '',
                boxUnitCostPrice: '',
                hasPackUnit: false,
                packUnitQty: '',
                packUnitPrice: '',
                packUnitCostPrice: ''
              });
              if (isProductLimitReached()) {
                toast.error("O Plano Básico suporta no máximo 100 produtos. Faça upgrade para o plano Pro para adicionar produtos ilimitados.");
                return;
              }
              setIsCreating(true);
              setEditingProduct(null);
            }}
            className={cn(
              "flex-1 px-2.5 py-1.5 rounded-lg text-[10.5px] font-black uppercase tracking-wider transition-all duration-300 cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap",
              activeTab === 'add' || isCreating || editingProduct 
                ? "bg-gradient-to-r from-emerald-500 to-teal-650 text-white shadow-md shadow-emerald-500/20 font-black scale-102" 
                : "text-slate-500 hover:text-slate-800"
            )}
          >
            {isProductLimitReached() ? <><Lock size={12} className="text-amber-500" /> Novo</> : "➕ Novo"}
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('manage');
              setIsCreating(false);
              setEditingProduct(null);
              findDuplicates();
            }}
            className={cn(
              "flex-1 px-2.5 py-1.5 rounded-lg text-[10.5px] font-black uppercase tracking-wider transition-all duration-300 cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap",
              activeTab === 'manage' && !isCreating && !editingProduct 
                ? "bg-gradient-to-r from-purple-600 to-indigo-650 text-white shadow-md shadow-purple-500/20 font-black scale-102" 
                : "text-slate-500 hover:text-slate-800"
            )}
          >
            🛠️ Gerir & Mesclar
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('quebras');
              setIsCreating(false);
              setEditingProduct(null);
            }}
            className={cn(
              "flex-1 px-2.5 py-1.5 rounded-lg text-[10.5px] font-black uppercase tracking-wider transition-all duration-300 cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap",
              activeTab === 'quebras' && !isCreating && !editingProduct 
                ? "bg-gradient-to-r from-amber-500 to-rose-600 text-white shadow-md shadow-amber-500/20 font-black scale-102" 
                : "text-slate-500 hover:text-slate-800"
            )}
          >
            ⚠️ Quebras
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('etiquetas');
              setIsCreating(false);
              setEditingProduct(null);
            }}
            className={cn(
              "flex-1 px-2.5 py-1.5 rounded-lg text-[10.5px] font-black uppercase tracking-wider transition-all duration-300 cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap",
              activeTab === 'etiquetas' && !isCreating && !editingProduct 
                ? "bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-md shadow-pink-500/20 font-black scale-102" 
                : "text-slate-500 hover:text-slate-800"
            )}
          >
            🏷️ Etiquetas
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('validade');
              setIsCreating(false);
              setEditingProduct(null);
            }}
            className={cn(
              "flex-1 px-2.5 py-1.5 rounded-lg text-[10.5px] font-black uppercase tracking-wider transition-all duration-300 cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap",
              activeTab === 'validade' && !isCreating && !editingProduct 
                ? "bg-gradient-to-r from-red-500 to-amber-600 text-white shadow-md shadow-red-500/20 font-black scale-102" 
                : "text-slate-500 hover:text-slate-800"
            )}
          >
            ⏳ Validades
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('movimentos');
              setIsCreating(false);
              setEditingProduct(null);
            }}
            className={cn(
              "flex-1 px-2.5 py-1.5 rounded-lg text-[10.5px] font-black uppercase tracking-wider transition-all duration-300 cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap",
              activeTab === 'movimentos' && !isCreating && !editingProduct 
                ? "bg-gradient-to-r from-blue-600 to-indigo-650 text-white shadow-md shadow-blue-500/20 font-black scale-102" 
                : "text-slate-500 hover:text-slate-800"
            )}
          >
            📋 Movimentos
          </button>
        </div>
      </div>

      {activeTab === 'manage' && !isCreating && !editingProduct && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          className="space-y-6"
        >
          {/* Quick Import/Export Actions */}
          <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex flex-wrap items-center gap-3">
            <span className="text-[10px] uppercase font-black text-slate-400 tracking-widest font-mono">⚡ OPERAÇÕES DE FICHEIRO:</span>
            <button 
              type="button"
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl transition-all font-black text-xs uppercase tracking-wider active:scale-95"
            >
              <Download size={13} />
              Exportar CSV
            </button>
            <label className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white px-3.5 py-2 rounded-xl transition-all font-black text-xs uppercase tracking-wider cursor-pointer shadow-sm active:scale-95">
              {isParsingPdf ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>Analisando PDF...</span>
                </>
              ) : (
                <>
                  <Plus size={13} />
                  <span>Importar PDF via IA</span>
                </>
              )}
              <input
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                disabled={isParsingPdf}
                onChange={handlePdfFileChange}
              />
            </label>
            <button 
              type="button"
              onClick={() => {
                findDuplicates();
                setShowDeduplicateModal(true);
              }}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-xl transition-all font-black text-xs uppercase tracking-wider active:scale-95 cursor-pointer shadow-sm"
            >
              ⚖️ Deduplicação Inteligente (Modal)
            </button>
          </div>

          {/* PAINEL DE AÇÕES DE ENTRADA RÁPIDA DE STOCK & CRIAÇÃO */}
          <div id="quick-stock-panel" className="bg-slate-950 text-white rounded-2xl p-6 shadow-2xl border border-slate-800 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Package className="text-blue-500 animate-pulse" size={18} />
                  Entrada Rápida de Stock & Novo Item
                </h3>
                <p className="text-xs text-slate-400">Adicione stock físico a um produto existente pesquisando-o abaixo ou crie um novo item.</p>
              </div>
              <button 
                type="button"
                onClick={() => {
                  if (isProductLimitReached()) {
                    toast.error("O Plano Básico suporta no máximo 100 produtos. Faça upgrade para o plano Pro para adicionar produtos ilimitados.");
                    return;
                  }
                  const autoSku = 'REF-' + Math.floor(100000 + Math.random() * 900000);
                  setNewProduct(prev => ({
                    ...prev,
                    sku: autoSku
                  }));
                  setIsCreating(true);
                  setActiveTab('add');
                }}
                className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-3.5 rounded-xl transition-all font-black text-xs uppercase tracking-wider shadow-lg shadow-blue-500/10 hover:shadow-blue-500/20 active:scale-95 mr-0 shrink-0"
              >
                {isProductLimitReached() ? <Lock size={16} /> : <Plus size={18} />}
                + Adicionar Novo Produto (Criar)
              </button>
            </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LADO ESQUERDO: Campo combobox de pesquisa customizado para auto-sugestões */}
          <div className="lg:col-span-7 space-y-2">
            <label className="block text-xs font-black uppercase tracking-wider text-slate-400">
              🔍 PESQUISAR PRODUTO PARA ADICIONAR STOCK:
            </label>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text"
                placeholder="Escreva Nome, SKU ou Código de barras para encontrar o produto..."
                className="w-full pl-11 pr-4 py-3 bg-slate-900 border border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-600 text-white outline-none text-sm font-medium placeholder:text-slate-500"
                value={stockSearchQuery}
                onFocus={() => {
                  if (selectedStockProduct) {
                    setStockSearchQuery('');
                    setSelectedStockProduct(null);
                  }
                }}
                onChange={e => {
                  setStockSearchQuery(e.target.value);
                  if (!e.target.value) setSelectedStockProduct(null);
                }}
              />
              {stockSearchQuery && !selectedStockProduct && (
                <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white border border-slate-200 text-slate-900 rounded-xl shadow-2xl max-h-60 overflow-y-auto">
                  {(() => {
                    const search = stockSearchQuery.toLowerCase();
                    const filtered = products.filter(p => 
                      (p.name || '').toLowerCase().includes(search) || 
                      (p.sku || '').toLowerCase().includes(search) || 
                      (p.barcode || '').toLowerCase().includes(search)
                    );

                    if (filtered.length === 0) {
                      return <div className="p-4 text-xs text-slate-500 text-center">Nenhum produto correspondente.</div>;
                    }

                    return filtered.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setSelectedStockProduct(p);
                          setStockSearchQuery(p.name);
                          setAddQtyCx('');
                          setAddQtyEmb('');
                          setAddQtyUn('');
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-100 last:border-0 flex items-center justify-between transition-colors"
                      >
                        <div>
                          <p data-no-translate="true" translate="no" className="font-bold text-slate-900 text-sm no-translate notranslate">{p.name}</p>
                          <p className="text-xs text-slate-500 font-mono">
                            Ref: {p.sku || 'N/D'} | Categ: {p.category || 'Geral'}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="inline-block px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-black rounded-full font-mono">
                            {p.stockLevel || 0} Unidades em Stock
                          </span>
                        </div>
                      </button>
                    ));
                  })()}
                </div>
              )}
            </div>
          </div>

          {/* LADO DIREITO: Form de Entrada Rápida de Stock com campos adequados ao esquema de unidades do produto */}
          <div className="lg:col-span-5 bg-slate-900/40 border border-slate-800 p-4 rounded-xl">
            {selectedStockProduct ? (
              <div className="space-y-4 animate-in fade-in duration-200">
                <div className="flex items-center justify-between gap-2 border-b border-slate-850 pb-2">
                  <div>
                    <h4 className="font-black text-sm text-blue-400 truncate max-w-[200px]">{selectedStockProduct.name}</h4>
                    <span className="text-[10px] text-slate-400 font-mono uppercase tracking-wider block mt-0.5">
                      Stock Único Atual: <strong className="text-white font-black">{selectedStockProduct.stockLevel || 0} Un</strong>
                    </span>
                  </div>
                  <button 
                    type="button"
                    onClick={() => {
                      setSelectedStockProduct(null);
                      setStockSearchQuery('');
                    }}
                    className="text-xs text-slate-400 hover:text-white transition-colors border border-slate-800 hover:border-slate-750 px-2 py-1 rounded bg-slate-950 font-bold"
                  >
                    Mudar
                  </button>
                </div>

                {selectedStockProduct.hasMultiUnits ? (
                  <div className="space-y-3">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider leading-tight">
                      Insira a quantidade adquirida para cada unidade abaixo:
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {selectedStockProduct.hasBoxUnit && (
                        <div className="space-y-1">
                          <label className="block text-[9px] uppercase font-black text-slate-400 text-center">
                            +{selectedStockProduct.boxUnitLabel || 'Cx'}
                          </label>
                          <input 
                            type="number"
                            placeholder="0"
                            className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono font-bold text-center text-xs outline-none focus:ring-2 focus:ring-emerald-500"
                            value={addQtyCx}
                            onChange={e => setAddQtyCx(e.target.value)}
                          />
                          <span className="block text-[8px] text-slate-500 text-center font-mono leading-none mt-0.5">
                            ({selectedStockProduct.boxUnitQty || 10} un)
                          </span>
                        </div>
                      )}

                      {selectedStockProduct.hasPackUnit && (
                        <div className="space-y-1">
                          <label className="block text-[9px] uppercase font-black text-slate-400 text-center">
                            +{selectedStockProduct.packUnitLabel || 'Emb'}
                          </label>
                          <input 
                            type="number"
                            placeholder="0"
                            className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono font-bold text-center text-xs outline-none focus:ring-2 focus:ring-blue-500"
                            value={addQtyEmb}
                            onChange={e => setAddQtyEmb(e.target.value)}
                          />
                          <span className="block text-[8px] text-slate-500 text-center font-mono leading-none mt-0.5">
                            ({selectedStockProduct.packUnitQty || 100} un)
                          </span>
                        </div>
                      )}

                      <div className="space-y-1">
                        <label className="block text-[9px] uppercase font-black text-slate-400 text-center">
                          +{selectedStockProduct.baseUnitLabel || 'Un'}
                        </label>
                        <input 
                          type="number"
                          placeholder="0"
                          className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono font-bold text-center text-xs outline-none focus:ring-2 focus:ring-purple-500"
                          value={addQtyUn}
                          onChange={e => setAddQtyUn(e.target.value)}
                        />
                        <span className="block text-[8px] text-slate-500 text-center font-mono leading-none mt-0.5">
                          Unidade base
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label className="block text-[10px] uppercase font-black tracking-wider text-slate-400">
                      Adicionar Unidades ao Stock Existente:
                    </label>
                    <input 
                      type="number"
                      placeholder="Introduza ex: 50"
                      className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono font-bold text-xs outline-none focus:ring-2 focus:ring-blue-600"
                      value={addQtyUn}
                      onChange={e => setAddQtyUn(e.target.value)}
                    />
                  </div>
                )}

                {/* 🧮 CALCULADORA DE COMPRA EM ATACADO e CONVERSOR DE CUSTOS (ERP) */}
                <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">🧮</span>
                      <div>
                        <span className="text-xs font-black text-slate-200 block uppercase tracking-wider leading-none">Calculadora de Custos</span>
                        <span className="text-[9px] text-slate-400 font-medium">Fração de Cx, Emb ou Fardo</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPurchaseCalc(!showPurchaseCalc)}
                      className="text-[10px] uppercase font-black text-blue-400 hover:text-blue-300 bg-blue-950/50 hover:bg-blue-900/40 px-2.5 py-1 rounded transition-colors border border-blue-500/10"
                    >
                      {showPurchaseCalc ? 'Ocultar ×' : 'Calcular Compra'}
                    </button>
                  </div>

                  {showPurchaseCalc && (
                    <div className="pt-2.5 border-t border-slate-850 space-y-3 font-sans animate-in fade-in duration-200">
                      {/* Selection of Purchase Unit */}
                      <div className="space-y-1">
                        <label className="block text-[9.5px] uppercase font-black text-slate-400">Unidade de Fornecimento:</label>
                        <div className="grid grid-cols-3 gap-1">
                          {selectedStockProduct.hasBoxUnit && (
                            <button
                              type="button"
                              onClick={() => setCalcPurchaseUnit('cx')}
                              className={`text-[10px] font-bold py-1.5 px-2 rounded border transition-all ${
                                calcPurchaseUnit === 'cx'
                                  ? 'bg-blue-600 text-white border-blue-500 font-black'
                                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-850'
                              }`}
                            >
                              {selectedStockProduct.boxUnitLabel || 'Caixa'}
                            </button>
                          )}
                          {selectedStockProduct.hasPackUnit && (
                            <button
                              type="button"
                              onClick={() => setCalcPurchaseUnit('emb')}
                              className={`text-[10px] font-bold py-1.5 px-2 rounded border transition-all ${
                                calcPurchaseUnit === 'emb'
                                  ? 'bg-blue-600 text-white border-blue-500 font-black'
                                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-850'
                              }`}
                            >
                              {selectedStockProduct.packUnitLabel || 'Embalagem'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setCalcPurchaseUnit('un')}
                            className={`text-[10px] font-bold py-1.5 px-2 rounded border transition-all ${
                              calcPurchaseUnit === 'un'
                                ? 'bg-blue-600 text-white border-blue-500 font-black'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-850'
                            }`}
                          >
                            Unidades ({selectedStockProduct.baseUnitLabel || 'un'})
                          </button>
                        </div>
                      </div>

                      {/* Cost Type input */}
                      <div className="space-y-1">
                        <label className="block text-[9.5px] uppercase font-black text-slate-400">Como inserirá o custo do fornecedor?:</label>
                        <div className="grid grid-cols-2 gap-1 text-[10px] font-bold">
                          <button
                            type="button"
                            onClick={() => setCalcCostType('total')}
                            className={`py-1 rounded border transition-all ${
                              calcCostType === 'total'
                                ? 'bg-indigo-650 text-white border-indigo-500 font-black'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-850'
                            }`}
                          >
                            Investimento Total pago
                          </button>
                          <button
                            type="button"
                            onClick={() => setCalcCostType('unit')}
                            className={`py-1 rounded border transition-all ${
                              calcCostType === 'unit'
                                ? 'bg-indigo-650 text-white border-indigo-500 font-black'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-850'
                            }`}
                          >
                            Custo por {calcPurchaseUnit === 'cx' ? (selectedStockProduct.boxUnitLabel || 'Caixa') : calcPurchaseUnit === 'emb' ? (selectedStockProduct.packUnitLabel || 'Embalagem') : (selectedStockProduct.baseUnitLabel || 'Unidade')}
                          </button>
                        </div>
                      </div>

                      {/* Inputs of Qty and Cost */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="block text-[9.5px] uppercase font-black text-slate-400">Qtd Comprada (Nº):</label>
                          <input
                            type="number"
                            min="1"
                            placeholder="Ex: 200"
                            value={calcBulkQty}
                            onChange={e => setCalcBulkQty(e.target.value)}
                            className="w-full p-2 bg-slate-900 border border-slate-800 rounded-lg text-white font-mono font-bold text-xs outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[9.5px] uppercase font-black text-slate-400">
                            {calcCostType === 'total' ? 'Custo Total Pago (' + currency + '):' : 'Preço por Unidade (' + currency + '):'}
                          </label>
                          <input
                            type="number"
                            min="0"
                            placeholder="Ex: 15000"
                            value={calcCostVal}
                            onChange={e => setCalcCostVal(e.target.value)}
                            className="w-full p-2 bg-slate-900 border border-slate-800 rounded-lg text-white font-mono font-bold text-xs outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                      </div>

                      {/* Markup slider or input */}
                      <div className="space-y-1 bg-slate-900/50 p-2 rounded-lg border border-slate-850">
                        <div className="flex items-center justify-between text-[9.5px] uppercase font-black text-slate-200">
                          <span>Margem de Lucro Desejada:</span>
                          <span className="text-emerald-400 font-bold font-mono">{calcMarkup}% Markup</span>
                        </div>
                        <div className="flex gap-1.5 items-center mt-1">
                          <input
                            type="range"
                            min="5"
                            max="150"
                            step="5"
                            value={calcMarkup}
                            onChange={e => setCalcMarkup(e.target.value)}
                            className="flex-1 accent-blue-650 h-1 bg-slate-800 rounded outline-none"
                          />
                          <input
                            type="number"
                            value={calcMarkup}
                            onChange={e => setCalcMarkup(e.target.value)}
                            className="w-12 p-1 bg-slate-950 border border-slate-800 text-white font-mono font-bold text-[10px] text-center rounded focus:outline-none"
                          />
                        </div>
                        <div className="flex gap-1 justify-between mt-1.5">
                          {['15', '25', '35', '50'].map(m => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setCalcMarkup(m)}
                              className={`text-[9px] font-bold px-2 py-0.5 rounded transition-all ${
                                calcMarkup === m
                                  ? 'bg-blue-650 text-white font-black'
                                  : 'bg-slate-850 text-slate-400 hover:bg-slate-800'
                              }`}
                            >
                              {m}%
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* CALCULATOR DYNAMIC OUTPUT DISPLAY */}
                      {(() => {
                        const results = getCalcResults();
                        if (!results) return (
                          <div className="p-2.5 border border-slate-850 border-dashed text-slate-450 rounded-lg text-center text-[10px] font-medium leading-tight">
                            Introduza a quantidade adquirida e o custo total pago acima para obter os cálculos de conversão instantâneos.
                          </div>
                        );

                        const currentUnitCost = Number(selectedStockProduct.costPrice || 0);

                        return (
                          <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-lg space-y-2.5 animate-in fade-in duration-200">
                            <span className="text-[9px] uppercase font-black tracking-wide text-blue-400 bg-blue-950/40 px-1.5 py-0.5 rounded border border-blue-900/10">Resultados da Conversão:</span>
                            <div className="grid grid-cols-2 gap-2 text-[11px] leading-tight mt-1 border-b border-slate-850 pb-2">
                              <div>
                                <span className="text-slate-450 block text-[9px] font-bold uppercase">Frações em Unidades:</span>
                                <strong className="text-white font-mono text-xs">{results.totalUnits.toLocaleString()} un.</strong>
                              </div>
                              <div>
                                <span className="text-slate-450 block text-[9px] font-bold uppercase">Custo Unitário (Compra):</span>
                                <strong className="text-white font-mono text-xs block">
                                  {results.unitCost.toFixed(2)} {currency} 
                                  {currentUnitCost > 0 && (
                                    <span className={`text-[9.5px] font-bold ml-1 ${results.unitCost > currentUnitCost ? 'text-rose-500' : 'text-emerald-500'}`}>
                                      ({results.unitCost > currentUnitCost ? '↑' : '↓'} {Math.abs(results.unitCost - currentUnitCost).toFixed(2)})
                                    </span>
                                  )}
                                </strong>
                              </div>
                            </div>

                            <div className="space-y-1 text-[11px]">
                              <span className="text-slate-450 block text-[9.5px] font-bold uppercase mb-1">Preços de Venda por Grosso / Retalho Sugeridos:</span>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 mt-1 font-mono text-[10.5px]">
                                <div className="bg-slate-950 p-1.5 rounded border border-purple-900/40">
                                  <span className="text-purple-400 text-[8.5px] uppercase font-bold block">1x {selectedStockProduct.baseUnitLabel || 'Un'}:</span>
                                  <span className="text-white font-black">{results.unitPrice.toFixed(2)} {currency}</span>
                                </div>
                                {selectedStockProduct.hasBoxUnit && (
                                  <div className="bg-slate-950 p-1.5 rounded border border-emerald-900/40">
                                    <span className="text-emerald-400 text-[8.5px] uppercase font-bold block">1x {selectedStockProduct.boxUnitLabel || 'Cx'}:</span>
                                    <span className="text-white font-black">{results.boxPrice.toFixed(2)} {currency}</span>
                                  </div>
                                )}
                                {selectedStockProduct.hasPackUnit && (
                                  <div className="bg-slate-950 p-1.5 rounded border border-blue-900/40">
                                    <span className="text-blue-400 text-[8.5px] uppercase font-bold block">1x {selectedStockProduct.packUnitLabel || 'Emb'}:</span>
                                    <span className="text-white font-black">{results.packPrice.toFixed(2)} {currency}</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Opt-in to write prices to inventory */}
                            <div className="flex items-center gap-2 pt-2 border-t border-slate-850">
                              <input
                                id="calcUpdateProductPrices"
                                type="checkbox"
                                checked={calcUpdateProductPrices}
                                onChange={e => setCalcUpdateProductPrices(e.target.checked)}
                                className="w-4 h-4 rounded bg-slate-950 border-slate-800 text-blue-500 cursor-pointer"
                              />
                              <label htmlFor="calcUpdateProductPrices" className="text-[10px] font-bold text-slate-300 cursor-pointer select-none">
                                Regra: Atualizar preços/custos de venda padrão deste produto ao confirmar
                              </label>
                            </div>

                            {/* Apply Button */}
                            <button
                              type="button"
                              onClick={() => {
                                // 1. Inject the bulk quantity into the correct field
                                if (calcPurchaseUnit === 'cx') {
                                  setAddQtyCx(calcBulkQty);
                                  setAddQtyEmb('');
                                  setAddQtyUn('');
                                } else if (calcPurchaseUnit === 'emb') {
                                  setAddQtyEmb(calcBulkQty);
                                  setAddQtyCx('');
                                  setAddQtyUn('');
                                } else {
                                  setAddQtyUn(calcBulkQty);
                                  setAddQtyCx('');
                                  setAddQtyEmb('');
                                }
                                
                                // 2. Store applied results state
                                setCalcAppliedResults({
                                  productId: selectedStockProduct.id,
                                  ...results
                                });
                                
                                toast.success("🧮 Conversão efetuada! Quantidade adicional definida e custos calculados.");
                              }}
                              className="w-full bg-emerald-600 hover:bg-emerald-550 active:scale-95 text-white font-black text-[10px] uppercase py-2.5 px-3 rounded-lg mt-1 transition-all flex items-center justify-center gap-1 shadow-lg cursor-pointer"
                            >
                              <span>📥 Aplicar Conversão à Entrada de Stock</span>
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {calcAppliedResults && calcAppliedResults.productId === selectedStockProduct.id && (
                    <div className="bg-emerald-950/40 border border-emerald-800/40 p-2.5 rounded-lg text-[10px] text-emerald-400 font-medium leading-tight flex items-center justify-between">
                      <span>
                        ✅ <strong>Conversão de Custos Aplicada</strong>: {calcAppliedResults.unitCost.toFixed(2)} {currency}/unidade.
                        {calcUpdateProductPrices ? " (Os preços padrões de venda serão sincronizados no ato da entrada!)" : " (Apenas quantidades alteradas)"}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCalcAppliedResults(null)}
                        className="text-emerald-400 hover:text-white font-black bg-emerald-900/30 px-1.5 py-0.5 rounded cursor-pointer shrink-0 ml-2"
                      >
                        Reset ×
                      </button>
                    </div>
                  )}
                </div>

                {/* Data de Validade opcional */}
                <div className="space-y-1.5 p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 font-sans">
                  <label className="block text-[10.5px] uppercase font-black tracking-wider text-slate-300">
                    Data de Validade (opcional):
                  </label>
                  <input 
                    type="date"
                    className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white font-mono text-xs outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer"
                    value={expiryInput}
                    onChange={e => setExpiryInput(e.target.value)}
                  />
                  {expiryInput && (() => {
                    const selected = new Date(expiryInput + "T00:00:00");
                    const alertDate = new Date(selected);
                    alertDate.setDate(alertDate.getDate() - 30);
                    const formattedAlert = alertDate.toLocaleDateString("pt-MZ");
                    return (
                      <p className="text-[11px] text-amber-500 font-bold mt-1">
                        ⚠️ Alerta de validade: 30 dias antes ({formattedAlert})
                      </p>
                    );
                  })()}
                </div>

                <button
                  type="button"
                  onClick={handleDirectAddStock}
                  disabled={isPerformingQuickAdd}
                  className="w-full bg-blue-600 hover:bg-blue-500 active:scale-95 disabled:opacity-40 text-white font-extrabold text-xs uppercase tracking-wider py-3 px-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-1.5"
                >
                  {isPerformingQuickAdd ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Processando entrada...</span>
                    </>
                  ) : (
                    <>
                      <Check size={14} />
                      <span>Confirmar Entrada de Stock</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center py-6 text-center text-slate-500">
                <Sliders size={28} className="text-slate-700 mb-2 opacity-60" />
                <p className="text-xs font-semibold max-w-[240px]">
                  Pesquise e selecione um produto à esquerda para registar novos fornecimentos de stock.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* SECURITY CONTROL CARD */}
        <div className={cn(
          "bg-slate-900 border-slate-800 rounded-2xl p-6 shadow-2xl border space-y-4 relative overflow-hidden group hover:rotate-12 transition-transform transition-opacity duration-500 text-white z-10 relative mt-4",
          (!profile?.role || !['owner', 'business_owner', 'manager', 'admin', 'super_admin'].includes(profile.role.toLowerCase())) ? "opacity-10" : "opacity-100"
        )}>
          {/* Decorative rotating lock icon in the background */}
          <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:rotate-12 transition-transform duration-300">
            <ShieldAlert size={80} className="text-blue-500" />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-[10px] font-black tracking-widest text-blue-450 uppercase">🛡️ CONTROLO DE ACESSO</span>
              <h4 className="text-base font-black text-white">Controlo de Segurança do Inventário</h4>
              <p className="text-xs text-slate-400 max-w-xl">
                Apenas o proprietário ou gerente do negócio pode configurar ou alterar o PIN de Segurança. Este PIN é requerido para autorizar colaboradores no controlo de entradas/saídas de stock e mesclagem de itens duplicados.
              </p>
            </div>
            
            <button
              type="button"
              onClick={() => {
                const userRole = profile?.role?.toLowerCase();
                const isOwnerOrManager = ['owner', 'business_owner', 'manager', 'admin', 'super_admin'].includes(userRole);
                if (isOwnerOrManager) {
                  setPinSetupModalOpen(true);
                } else {
                  toast.error("Apenas o Proprietário ou Administrador pode alterar as definições de segurança do inventário.");
                }
              }}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-550 text-white px-5 py-3 rounded-xl transition-all font-black text-xs uppercase tracking-wider shadow-lg active:scale-95 shrink-0"
            >
              🔒 Configurar PIN de Segurança
            </button>
          </div>
        </div>
      </div>

      {/* 💻 PAINEL OPERACIONAL DE ARTIGOS (Inventory Operations Control Center) */}
      <div className="bg-white p-6 border border-slate-105 rounded-[28px] shadow-sm space-y-5 text-left font-sans mt-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <span className="text-[9px] bg-blue-50 text-blue-700 px-2.5 py-1 rounded font-black uppercase tracking-wider">⚙️ Controlo Operacional</span>
            <h3 className="text-base font-black text-slate-900 mt-1.5 flex items-center gap-1.5 font-sans">Centro de Gestão de Artigos & Stocks</h3>
            <p className="text-xs text-slate-500 font-sans">Multiseleção de produtos para remoção, arquivamento permanente, ajustes operacionais rápidos e edição coesa.</p>
          </div>
          
          {/* Quick Filter Search inside Operations manager */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto">
            <button
              onClick={handleFixNegativeStockBuckets}
              title="Reorganiza Caixas/Embalagens/Unidades de produtos com stock negativo por unidade, sem alterar a quantidade total"
              className="flex items-center justify-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 px-3 py-2.5 rounded-xl transition-all font-black text-[10px] uppercase tracking-wider active:scale-95 shrink-0 whitespace-nowrap"
            >
              ⚠️ Corrigir Stock Negativo
            </button>
            <div className="w-full md:w-72 relative">
              <input
                type="text"
                placeholder="Filtrar por SKU, Código ou Nome..."
                value={manageSearch}
                onChange={(e) => setManageSearch(e.target.value)}
                className="w-full p-2.5 pl-9 bg-slate-50 border border-slate-200 rounded-xl outline-none text-xs focus:bg-white focus:ring-1 focus:ring-blue-550 transition-all font-sans font-medium text-slate-800"
              />
              <Search size={14} className="absolute left-3 top-3.5 text-slate-400" />
            </div>
          </div>
        </div>

        {/* Selected Items Bulk Floating Bar */}
        {selectedIds.length > 0 && (
          <div className="bg-blue-50/70 border border-blue-150 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-blue-600 rounded-full animate-ping" />
              <p className="text-xs font-black text-blue-900 font-sans">
                {selectedIds.length} {selectedIds.length === 1 ? 'produto selecionado' : 'produtos selecionados'} para operações em lote
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleBulkArchive}
                className="px-3.5 py-1.5 bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 font-black text-[10px] uppercase tracking-wider rounded-lg transition-all cursor-pointer"
              >
                📥 Arquivar
              </button>
              <button
                type="button"
                onClick={handleBulkDelete}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-black text-[10px] uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center gap-1 shadow-sm"
              >
                🗑️ Remover Lote (PIN)
              </button>
            </div>
          </div>
        )}

        {/* Desktop Operations Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="min-w-full divide-y divide-slate-100 text-left font-sans text-xs">
            <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-wider">
              <tr>
                <th scope="col" className="py-3 px-4 w-12 text-center">
                  <input
                    type="checkbox"
                    checked={products.length > 0 && selectedIds.length === products.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(products.map(p => p.id));
                      } else {
                        setSelectedIds([]);
                      }
                    }}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                  />
                </th>
                <th scope="col" className="py-3 px-4">Artigo Comercial</th>
                <th scope="col" className="py-3 px-4 text-right">Preço de Custo</th>
                <th scope="col" className="py-3 px-4 text-right">Preço de Venda (Retalho / Grosso)</th>
                <th scope="col" className="py-3 px-4 text-center">Stock Físico</th>
                <th scope="col" className="py-3 px-4 text-center">Acções Directas</th>
              </tr>
            </thead>
            <tbody data-no-translate="true" className="divide-y divide-slate-100 bg-white text-slate-900 font-sans no-translate">
              {products
                .filter(p => 
                  p.name.toLowerCase().includes(manageSearch.toLowerCase()) ||
                  (p.sku && p.sku.toLowerCase().includes(manageSearch.toLowerCase())) ||
                  (p.barcode && p.barcode.toLowerCase().includes(manageSearch.toLowerCase()))
                )
                .map((product) => {
                  const isSelected = selectedIds.includes(product.id);
                  const isLowStock = product.stockLevel <= (product.lowStockThreshold || 5);
                  
                  return (
                    <tr key={product.id} className={cn("hover:bg-slate-50/50 transition-colors", isSelected ? "bg-blue-50/15" : "")}>
                      {/* Checkbox */}
                      <td className="py-3 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            setSelectedIds(prev =>
                              prev.includes(product.id) ? prev.filter(id => id !== product.id) : [...prev, product.id]
                            );
                          }}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                        />
                      </td>

                      {/* Info */}
                      <td className="py-3 px-4">
                        <div className="font-sans">
                          <p className="font-bold text-slate-900 font-sans text-sm">{product.name}</p>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono mt-0.5">
                            {product.sku && <span>SKU: {product.sku}</span>}
                            {product.barcode && <span>Bar: {product.barcode}</span>}
                          </div>
                        </div>
                      </td>

                      {/* Pricings */}
                      <td className="py-3 px-4 text-right font-medium">
                        {(product.costPrice || 0).toLocaleString()} {currency}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {(() => {
                          const hasRetail = Number(product.price || 0) > 0;
                          const hasWholesaleLegacy = product.allowWholesale && Number(product.wholesalePrice || 0) > 0;
                          const hasGrosso = (product.unidadesGrosso || []).some((u: any) => Number(u?.preco || 0) > 0);
                          const hasAnyPrice = hasRetail || hasWholesaleLegacy || hasGrosso;

                          if (!hasAnyPrice) {
                            return (
                              <div className="flex flex-col items-end">
                                <span className="text-[11px] font-black text-rose-600 bg-rose-50 px-2 py-1 rounded-lg border border-rose-150" title="Nenhum preço de venda foi definido para este produto — edite o produto para corrigir">
                                  ⚠️ Sem Preço de Venda
                                </span>
                              </div>
                            );
                          }

                          return (
                            <div className="flex flex-col items-end">
                              <span className="font-bold text-blue-600 font-mono">
                                {hasRetail ? `${Number(product.price).toLocaleString()} ${currency}` : '—'}
                              </span>
                              {hasWholesaleLegacy ? (
                                <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md font-black font-sans leading-none mt-1 shadow-sm border border-emerald-100" title="Disponível para venda de grosso">
                                  GROSSO: {Number(product.wholesalePrice).toLocaleString()} {currency}
                                </span>
                              ) : hasGrosso ? (
                                <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md font-black font-sans leading-none mt-1 shadow-sm border border-emerald-100" title="Disponível para venda de grosso">
                                  GROSSO DISPONÍVEL
                                </span>
                              ) : (
                                <span className="text-[9px] text-slate-400 font-bold leading-none mt-1">
                                  Apenas Retalho
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 text-center">
                        <span className={cn(
                          "inline-block px-2 py-0.5 rounded-full text-[10px] font-black font-mono shadow-sm",
                          product.stockLevel <= 0 ? "bg-rose-50 text-rose-700 border border-rose-150" :
                          isLowStock ? "bg-amber-50 text-amber-700 border border-amber-150 animate-pulse" :
                          "bg-emerald-50 text-emerald-800 border border-emerald-150"
                        )}>
                          {product.stockLevel} {product.baseUnitLabel || 'Un'}
                        </span>
                      </td>

                      {/* Quick Operations Actions */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Quick Stocks slider trigger */}
                          <button
                            type="button"
                            onClick={() => {
                              setQuickAdjustProduct(product);
                              setAdjustType('add');
                              setAdjustValue(1);
                              setAdjustReason('');
                            }}
                            className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors cursor-pointer"
                            title="Ajuste Rápido de Stock"
                          >
                            <Sliders size={13} />
                          </button>

                          {/* Full Editing module */}
                          <button
                            type="button"
                            onClick={() => openProductEditor(product)}
                            className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-lg transition-colors cursor-pointer"
                            title="Editar Artigo"
                          >
                            <Edit2 size={13} />
                          </button>

                          {/* Trigger single deletion */}
                          <button
                            type="button"
                            onClick={() => handleDeleteProduct(product.id, product.name)}
                            className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition-colors cursor-pointer"
                            title="Eliminar Artigo"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              {products.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-455 font-medium italic">
                    Nenhum produto cadastrado no seu inventário para ser listado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

          {/* INLINE DEDUPLICATION & MERGE PANEL */}
          <div className="bg-white p-6 border border-slate-100 rounded-[28px] shadow-sm space-y-5 text-left">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-[10px] bg-amber-50 text-amber-700 px-2.5 py-1 rounded font-black uppercase tracking-wider">⚖️ Unificador de Duplicados</span>
                <h3 className="text-base font-black text-slate-900 mt-1.5">Mesclar Artigos em Duplicado (Fusão)</h3>
                <p className="text-xs text-slate-500">Mova stocks, faturas e históricos de artigos que foram registados mais de uma vez para um único registo correto.</p>
              </div>
              <button 
                type="button"
                onClick={() => {
                  findDuplicates();
                  setShowDeduplicateModal(true);
                }}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl transition-all font-black text-xs uppercase tracking-wider active:scale-95 cursor-pointer shadow-md inline-block whitespace-nowrap self-start sm:self-center"
              >
                ⚖️ Abrir Modal de Deduplicação
              </button>
            </div>

            {/* Suggestions */}
            <div className="space-y-3 bg-amber-50/20 border border-amber-100/30 p-4 rounded-2xl">
              <span className="text-[10px] uppercase font-black text-amber-500 tracking-wider">💡 Sugestões Automáticas por Escrita Similar</span>
              {duplicateMatches.length === 0 ? (
                <p className="text-xs text-slate-400 italic font-medium pt-1">Não foram encontradas duplicadas por grafia óbvia. Utilize o mesclador manual abaixo!</p>
              ) : (
                <div className="space-y-2.5 max-h-60 overflow-y-auto pt-1">
                  {duplicateMatches.map((match, idx) => (
                    <div key={idx} className="bg-white p-3.5 rounded-xl border border-amber-150 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm text-slate-950">
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-slate-800 flex items-center gap-1 flex-wrap">
                          <span className="text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{match.product1.name}</span>
                          <span className="text-slate-400">vs</span>
                          <span className="text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">{match.product2.name}</span>
                        </p>
                        <p className="text-[10px] text-slate-500 font-medium">
                          Stocks: {match.product1.stockLevel || 0} un. + {match.product2.stockLevel || 0} un. 
                        </p>
                      </div>
                      <div className="flex gap-2 bg-slate-10">
                        <button
                          type="button"
                          onClick={() => {
                            setMainProductId(match.product1.id);
                            setTargetProductId(match.product2.id);
                          }}
                          className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-amber-950 font-black text-[9px] uppercase tracking-wider rounded-lg transition-transform active:scale-95 whitespace-nowrap cursor-pointer"
                        >
                          Selecionar Match
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Manual Selector */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Main Survivor Product */}
                <div className="space-y-1.5 p-3 rounded-2xl bg-blue-50/25 border border-blue-105">
                  <label className="block text-[10px] font-black uppercase text-blue-900">1. Artigo Correto (Sobrevivente)</label>
                  <select
                    className="w-full p-2.5 bg-white border border-blue-200 rounded-xl outline-none font-bold text-xs text-slate-900"
                    value={mainProductId}
                    onChange={e => setMainProductId(e.target.value)}
                  >
                    <option value="">-- Escolha o artigo principal --</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.stockLevel || 0} un.)</option>
                    ))}
                  </select>
                </div>

                {/* Duplicate Product */}
                <div className="space-y-1.5 p-3 rounded-2xl bg-rose-50/25 border border-rose-105">
                  <label className="block text-[10px] font-black uppercase text-rose-900">2. Artigo Duplicado (Será Apagado)</label>
                  <select
                    className="w-full p-2.5 bg-white border border-rose-200 rounded-xl outline-none font-bold text-xs text-slate-900"
                    value={targetProductId}
                    onChange={e => setTargetProductId(e.target.value)}
                  >
                    <option value="">-- Escolha o artigo para apagar --</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.stockLevel || 0} un.)</option>
                    ))}
                  </select>
                </div>
              </div>

              {mainProductId && targetProductId && (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-150 space-y-1.5 animate-in slide-in-from-bottom-2 duration-200">
                  <span className="text-[9px] uppercase font-black text-slate-400">Simulação de Fusão</span>
                  <p className="text-xs font-bold text-slate-705">
                    O stock de <span className="text-blue-600">"{products.find(p => p.id === mainProductId)?.name}"</span> passará de <span className="font-semibold">{products.find(p => p.id === mainProductId)?.stockLevel || 0}</span> para <span className="font-extrabold text-emerald-600">{(Number(products.find(p => p.id === mainProductId)?.stockLevel) || 0) + (Number(products.find(p => p.id === targetProductId)?.stockLevel) || 0)}</span> unidades.
                  </p>
                  <p className="text-[10px] text-rose-500 font-bold">
                    ⚠️ O artigo "{products.find(p => p.id === targetProductId)?.name}" será removido definitivamente do sistema.
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={() => handleMergeProductsCheck(mainProductId, targetProductId)}
                disabled={isMerging || !mainProductId || !targetProductId}
                className="w-full py-2.5 bg-slate-900 font-black hover:bg-slate-800 text-white rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 disabled:opacity-40 shadow-sm transition-transform active:scale-95 cursor-pointer"
              >
                {isMerging ? <Loader2 size={14} className="animate-spin" /> : '🔒 Mesclar Artigos Permanentemente (PIN Requerido)'}
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {activeTab === 'list' && !isCreating && !editingProduct && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="space-y-2.5"
        >
          {/* RESUMO DO INVENTÁRIO — faixa compacta de estatísticas */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-white px-3 py-2 rounded-xl border border-slate-100 flex items-center justify-between gap-2">
              <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest leading-tight">Valor Venda</span>
              <p className="text-xs font-black text-slate-900 tracking-tight leading-none whitespace-nowrap">
                {(hasActiveFilters ? totalFilteredStockValue : totalCompanyStockValue).toLocaleString()} {currency}
              </p>
            </div>

            <div className="bg-white px-3 py-2 rounded-xl border border-slate-100 flex items-center justify-between gap-2">
              <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest leading-tight">Valor Custo</span>
              <p className="text-xs font-black text-slate-900 tracking-tight leading-none whitespace-nowrap">
                {(hasActiveFilters ? totalFilteredCostValue : totalCompanyCostValue).toLocaleString()} {currency}
              </p>
            </div>

            <div className="bg-white px-3 py-2 rounded-xl border border-slate-100 flex items-center justify-between gap-2">
              <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest leading-tight">Lucro Potencial</span>
              <p className="text-xs font-black text-emerald-600 tracking-tight leading-none whitespace-nowrap">
                {(hasActiveFilters ? (totalFilteredStockValue - totalFilteredCostValue) : totalCompanyPotentialProfit).toLocaleString()} {currency}
              </p>
            </div>

            <div className="bg-white px-3 py-2 rounded-xl border border-slate-100 flex items-center justify-between gap-2">
              <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest leading-tight">Artigos</span>
              <p className="text-xs font-black text-slate-900 tracking-tight leading-none whitespace-nowrap">
                {(hasActiveFilters ? totalFilteredItems : totalCompanyItems).toLocaleString()} <span className="text-[10px] text-slate-400 font-bold">un.</span>
              </p>
            </div>
          </div>

          {/* TOOLBAR ÚNICA — contagem, pesquisa, Ações em Massa, Mais Filtros e alternador de vista, tudo numa só linha */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] font-bold text-slate-500 whitespace-nowrap">
                {filteredProducts.length.toLocaleString()} {filteredProducts.length === 1 ? 'produto' : 'produtos'}
              </span>

              {/* Ações em Massa */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowBulkMenu(v => !v)}
                  className="flex items-center gap-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 px-2.5 py-1.5 rounded-lg transition-all font-bold text-[11px] cursor-pointer"
                >
                  Ações em massa {selectedIds.length > 0 && <span className="text-blue-600">({selectedIds.length})</span>}
                  <ChevronDown size={13} className={cn("transition-transform", showBulkMenu && "rotate-180")} />
                </button>
                {showBulkMenu && (
                  <div className="absolute z-20 top-full mt-1.5 left-0 w-56 bg-white border border-slate-150 rounded-xl shadow-lg py-1.5 text-xs font-bold text-slate-700">
                    <button
                      type="button"
                      onClick={() => { setSelectedIds(filteredProducts.map(p => p.id)); setShowBulkMenu(false); }}
                      className="w-full text-left px-3.5 py-2 hover:bg-slate-50 cursor-pointer"
                    >
                      Selecionar Todos Filtrados
                    </button>
                    {selectedIds.length > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={() => { handleBulkArchive(); setShowBulkMenu(false); }}
                          className="w-full text-left px-3.5 py-2 hover:bg-slate-50 cursor-pointer"
                        >
                          Arquivar Selecionados ({selectedIds.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => { setSelectedIds([]); setShowBulkMenu(false); }}
                          className="w-full text-left px-3.5 py-2 hover:bg-slate-50 cursor-pointer text-rose-600"
                        >
                          Limpar Seleção
                        </button>
                      </>
                    )}
                    <div className="h-px bg-slate-100 my-1" />
                    <button
                      type="button"
                      onClick={() => { handlePrintPDF(); setShowBulkMenu(false); }}
                      className="w-full text-left px-3.5 py-2 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5"
                    >
                      <Printer size={12} /> Imprimir
                    </button>
                    <button
                      type="button"
                      onClick={() => { handleExportCSV(); setShowBulkMenu(false); }}
                      className="w-full text-left px-3.5 py-2 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5"
                    >
                      <Download size={12} /> Exportar CSV
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:w-72 font-sans">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                <input
                  type="text"
                  placeholder="Pesquisar produto, SKU, código de barras..."
                  className="w-full pl-8 pr-3 py-1.5 border border-slate-200 bg-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-[11px] font-bold font-sans text-slate-700"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>

              {/* Mais Filtros */}
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setShowFilterPanel(v => !v)}
                  className={cn(
                    "flex items-center gap-1 border px-2.5 py-1.5 rounded-lg transition-all font-bold text-[11px] cursor-pointer whitespace-nowrap",
                    (selectedCategory !== 'all' || expiryFilterOnly)
                      ? "bg-blue-50 border-blue-200 text-blue-700"
                      : "bg-white border-slate-200 hover:bg-slate-50 text-slate-600"
                  )}
                >
                  <Filter size={13} /> Mais Filtros
                  <ChevronDown size={13} className={cn("transition-transform", showFilterPanel && "rotate-180")} />
                </button>
                {showFilterPanel && (
                  <div className="absolute z-20 top-full mt-1.5 right-0 w-80 bg-white border border-slate-150 rounded-xl shadow-lg p-4 space-y-4 text-left">
                    <div>
                      <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 select-none font-sans">Categorias</span>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <button
                          onClick={() => setSelectedCategory('all')}
                          className={cn(
                            "px-2.5 py-1 rounded-lg text-[11px] font-black transition-all whitespace-nowrap font-sans",
                            selectedCategory === 'all' ? "bg-blue-600 text-white" : "bg-slate-50 hover:bg-slate-100 text-slate-600"
                          )}
                        >
                          Todos ({uniqueProducts.length})
                        </button>
                        {Array.from(new Set(uniqueProducts.map(p => p.category).filter(Boolean))).map((cat: any) => {
                          const count = uniqueProducts.filter(p => p.category === cat).length;
                          return (
                            <button
                              key={cat}
                              onClick={() => setSelectedCategory(cat)}
                              className={cn(
                                "px-2.5 py-1 rounded-lg text-[11px] font-black transition-all whitespace-nowrap font-sans",
                                selectedCategory === cat ? "bg-blue-600 text-white" : "bg-slate-50 hover:bg-slate-100 text-slate-600"
                              )}
                            >
                              {cat} ({count})
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 select-none font-sans">Ordenar por</span>
                      <select
                        value={sortBy}
                        onChange={e => setSortBy(e.target.value)}
                        className="w-full mt-2 px-3 py-1.5 bg-slate-50 border-none rounded-lg text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer font-sans"
                      >
                        <option value="name-asc">Nome (A-Z)</option>
                        <option value="name-desc">Nome (Z-A)</option>
                        <option value="stock-desc">Stock (Maior - Menor)</option>
                        <option value="stock-asc">Stock (Menor - Maior)</option>
                        <option value="price-desc">Preço (Maior - Menor)</option>
                        <option value="price-asc">Preço (Menor - Maior)</option>
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={() => setExpiryFilterOnly(!expiryFilterOnly)}
                      className={cn(
                        "w-full px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1 cursor-pointer font-sans",
                        expiryFilterOnly ? "bg-rose-600 text-white" : "bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200"
                      )}
                    >
                      {expiryFilterOnly ? "Mostrando Perto da Validade" : "Filtrar por Validade"}
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-lg shrink-0">
                <button
                  onClick={() => setViewMode('compact')}
                  className={cn(
                    "p-1 rounded-md transition-all cursor-pointer flex items-center justify-center",
                    viewMode === 'compact' ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                  )}
                  title="Lista Compacta (Melhor para Busca)"
                >
                  <List size={14} />
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={cn(
                    "p-1 rounded-md transition-all cursor-pointer flex items-center justify-center",
                    viewMode === 'grid' ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                  )}
                  title="Cartões Expandidos"
                >
                  <Grid size={14} />
                </button>
              </div>
            </div>
          </div>
      </motion.div>
      )}

      {(activeTab === 'add' || isCreating || editingProduct) && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xl space-y-6 animate-in slide-in-from-top-4 duration-300">
          <h3 className="text-lg font-semibold">{editingProduct ? "Editar Produto" : "Novo Produto"}</h3>
          <div className="grid gap-6 md:grid-cols-3">
            {/* Campo das Imagens, Câmera e IA */}
            <div className="bg-slate-50 p-4 rounded-3xl border border-slate-200/85 flex flex-col justify-between space-y-4 h-full min-h-[300px]">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2 text-left">Imagem de Referência</label>
                <div className="relative aspect-square w-full rounded-2xl bg-white border-2 border-dashed border-slate-200 shadow-inner flex flex-col items-center justify-center overflow-hidden group hover:border-blue-400 transition-colors cursor-pointer">
                  {newProduct.imageUrl ? (
                    <div className="relative w-full h-full">
                      <img 
                        src={newProduct.imageUrl} 
                        alt="Product Preview" 
                        className="w-full h-full object-cover" 
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => setNewProduct(prev => ({ ...prev, imageUrl: '' }))}
                          className="p-2 bg-red-650 hover:bg-red-750 text-white rounded-full transition-all shadow-lg active:scale-90"
                          title="Remover Imagem"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer p-4 text-center">
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-2 group-hover:bg-blue-50 group-hover:text-blue-500 transition-all">
                        <Upload size={24} />
                      </div>
                      <span className="text-xs font-bold text-slate-700">Carregar Foto</span>
                      <span className="text-[10px] text-slate-400 mt-1 font-medium">Arraste ou clique para carregar</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={handleImageUpload} 
                      />
                    </label>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={startCamera}
                    className="py-2.5 px-3 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
                  >
                    <Camera size={14} className="text-blue-600 stroke-[2.5]" />
                    <span>Câmara</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAiGenerator(true)}
                    className="py-2.5 px-3 bg-slate-900 border border-slate-950 rounded-xl hover:bg-slate-800 text-amber-400 text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
                  >
                    <Sparkles size={14} className="stroke-[2.5]" />
                    <span>Gerar IA</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => searchInternetProductImage()}
                  disabled={isSearchingInternetImage}
                  className="w-full py-2.5 px-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl text-blue-700 text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {isSearchingInternetImage ? (
                    <>
                      <Loader2 className="animate-spin text-blue-600" size={14} />
                      <span>A buscar imagem real...</span>
                    </>
                  ) : (
                    <>
                      <Globe size={14} className="text-blue-600 stroke-[2.5]" />
                      <span>Buscar Imagem Real (Net)</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Resto dos Campos em Grid Lateral */}
            <div className="md:col-span-2 grid gap-4 grid-cols-1 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1 text-left">Nome do Produto</label>
                <input 
                  className="w-full p-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Ex: Arroz Tio Lucas 5kg..."
                  value={newProduct.name}
                  onChange={e => {
                    const newName = e.target.value;
                    setNewProduct(prev => {
                      const updated = { ...prev, name: newName };
                      if (!editingProduct && (!hasManuallyEditedCategory || !prev.category)) {
                        const predicted = predictCategoryFromName(newName);
                        if (predicted) {
                          updated.category = predicted;
                          setDetectedCategoryText(predicted);
                        } else {
                          setDetectedCategoryText('');
                        }
                      }
                      return updated;
                    });
                  }}
                />
              </div>
            <div className="relative">
              <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center justify-between">
                <span>Categoria</span>
                {detectedCategoryText && newProduct.category === detectedCategoryText && (
                  <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-bold animate-pulse flex items-center gap-1">
                    ✨ Auto-detectado
                  </span>
                )}
              </label>
              <div className="relative">
                <input 
                  className="w-full p-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Pesquisar ou escrever categoria..."
                  value={newProduct.category}
                  onChange={e => {
                    const val = e.target.value;
                    setNewProduct({...newProduct, category: val});
                    setHasManuallyEditedCategory(!!val);
                    if (!val) setDetectedCategoryText('');
                    setShowCategoryDropdown(true);
                  }}
                  onFocus={() => setShowCategoryDropdown(true)}
                  onBlur={() => setTimeout(() => setShowCategoryDropdown(false), 200)}
                />
                <Search size={16} className="absolute right-3 top-2.5 text-slate-400 pointer-events-none" />
              </div>

              {showCategoryDropdown && (
                <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto font-sans text-sm">
                  {newProduct.category.trim() && !Array.from(new Set(products.map(p => p.category).filter(Boolean))).some(cat => cat.toLowerCase() === newProduct.category.trim().toLowerCase()) && (
                    <button
                      type="button"
                      onMouseDown={() => {
                        setNewProduct({...newProduct, category: newProduct.category.trim()});
                        setHasManuallyEditedCategory(true);
                        setDetectedCategoryText('');
                        setShowCategoryDropdown(false);
                      }}
                      className="w-full text-left px-3 py-2 text-blue-600 hover:bg-blue-50 font-semibold border-b border-slate-100 flex items-center gap-1.5"
                    >
                      <Plus size={14} /> Criar nova: "{newProduct.category}"
                    </button>
                  )}

                  {(() => {
                    const uniqueCats = Array.from(new Set(products.map(p => p.category).filter(Boolean)));
                    const filtered = uniqueCats.filter(cat => 
                      cat.toLowerCase().includes(newProduct.category.toLowerCase())
                    );

                    if (filtered.length === 0) {
                      if (!newProduct.category.trim()) {
                        return <div className="p-3 text-xs text-slate-400 text-center">Nenhuma categoria encontrada. Escreva para criar uma nova.</div>;
                      }
                      return null;
                    }

                    return filtered.map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onMouseDown={() => {
                          setNewProduct({...newProduct, category: cat});
                          setHasManuallyEditedCategory(true);
                          setDetectedCategoryText('');
                          setShowCategoryDropdown(false);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700 block truncate"
                      >
                        {cat}
                      </button>
                    ));
                  })()}
                </div>
              )}

              {/* Quick Click Categories */}
              {(() => {
                const businessCategories = Array.from(new Set(products.map((p: any) => p.category).filter(Boolean)));
                const defaultSystemCategories = ['Bebidas', 'Mercearia', 'Higiene & Limpeza', 'Prendas & Snacks', 'Frutas & Vegetais', 'Padaria & Pastelaria', 'Talho & Peixaria', 'Papelaria & Escritório', 'Construção & Ferragens', 'Farmácia'];
                const allSuggestedCategories = Array.from(new Set([...businessCategories, ...defaultSystemCategories])).slice(0, 8);

                return (
                  <div className="mt-1.5 space-y-1 text-left">
                    <span className="text-[9.5px] text-slate-400 font-extrabold uppercase tracking-wide block">Escolha rápida:</span>
                    <div className="flex flex-wrap gap-1">
                      {allSuggestedCategories.map(cat => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => {
                            setNewProduct(prev => ({ ...prev, category: cat }));
                            setHasManuallyEditedCategory(true);
                            setDetectedCategoryText('');
                          }}
                          className={cn(
                            "text-[10px] px-2 py-0.5 rounded-md font-bold transition-all border",
                            newProduct.category === cat 
                              ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                              : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200"
                          )}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1 flex justify-between items-center">
                <span>Referência SKU</span>
                <button
                  type="button"
                  onClick={() => {
                    const autoSku = 'REF-' + Math.floor(100000 + Math.random() * 900000);
                    setNewProduct(prev => ({ ...prev, sku: autoSku }));
                  }}
                  className="text-xs text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1.5"
                  title="Gerar nova referência automática"
                >
                  <RefreshCw size={12} /> Gerar Auto
                </button>
              </label>
              <input 
                className="w-full p-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                placeholder="Ex: SKU-827374"
                value={newProduct.sku}
                onChange={e => setNewProduct({...newProduct, sku: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center justify-between">
                <span>Código de Barras (Barcode)</span>
                <span className="text-[10px] text-slate-400 font-bold italic">(Opcional)</span>
              </label>
              <div className="flex gap-1.5">
                <div className="relative flex-1">
                  <Barcode className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input 
                    className="w-full pl-9 pr-3 p-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm font-bold"
                    placeholder="Ex: 5901234123457"
                    value={newProduct.barcode}
                    onChange={e => setNewProduct({...newProduct, barcode: e.target.value})}
                  />
                </div>
                {/* Real Device Camera Barcode Scanner Button */}
                <button
                  type="button"
                  onClick={() => setIsInventoryScanning(true)}
                  title="Escanear Código de Barras com a Câmara do Dispositivo"
                  className="px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all flex items-center gap-1.5 cursor-pointer text-xs font-bold active:scale-95 whitespace-nowrap"
                >
                  <Camera size={14} />
                  Escanear Câmara
                </button>
                {/* Simulated Laser Barcode Reader Button */}
                <button
                  type="button"
                  onClick={() => {
                    const fakeBarcode = Math.floor(1000000000000 + Math.random() * 9000000000000).toString();
                    setNewProduct(prev => ({ ...prev, barcode: fakeBarcode }));
                    
                    // Trigger sound beep on scan simulation
                    try {
                      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
                      const osc = audioCtx.createOscillator();
                      const gain = audioCtx.createGain();
                      osc.connect(gain);
                      gain.connect(audioCtx.destination);
                      osc.frequency.setValueAtTime(1450, audioCtx.currentTime);
                      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
                      osc.start();
                      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
                      osc.stop(audioCtx.currentTime + 0.12);
                    } catch (err) {}
                    
                    toast.success(`Código lido: ${fakeBarcode}`);
                  }}
                  title="Simular Leitor de Código de Barras"
                  className="px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 rounded-xl transition-all border border-slate-200 flex items-center gap-1 cursor-pointer text-xs font-bold active:scale-95 whitespace-nowrap"
                >
                  ⚡ Simular
                </button>
              </div>
            </div>

            {/* Unidade de Compra */}
            <div className="md:col-span-2 relative">
              <label className="block text-sm font-medium text-slate-700 mb-0.5 text-left">
                Unidade de Compra
              </label>
              <p className="text-[11px] text-slate-500 mb-1 text-left italic">
                Como este produto é comprado ao fornecedor
              </p>
              <div className="relative">
                <input 
                  className="w-full p-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Ex: Saco, Cx, Fardo, Emb, Kg..."
                  value={newProduct.unidadeDeCompra || ''}
                  onChange={e => {
                    setNewProduct({ ...newProduct, unidadeDeCompra: e.target.value });
                    setShowUnidadeDeCompraDropdown(true);
                  }}
                  onFocus={() => setShowUnidadeDeCompraDropdown(true)}
                  onBlur={() => setTimeout(() => setShowUnidadeDeCompraDropdown(false), 250)}
                />
                <Sliders size={16} className="absolute right-3 top-3 text-slate-400 pointer-events-none" />
              </div>

              {showUnidadeDeCompraDropdown && (
                <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto font-sans text-sm">
                  {newProduct.unidadeDeCompra?.trim() && !getUnidadeDeCompraSuggestions(newProduct.name, newProduct.category).some(u => u.toLowerCase() === newProduct.unidadeDeCompra.trim().toLowerCase()) && (
                    <button
                      type="button"
                      onMouseDown={() => {
                        setNewProduct({ ...newProduct, unidadeDeCompra: newProduct.unidadeDeCompra.trim() });
                        setShowUnidadeDeCompraDropdown(false);
                      }}
                      className="w-full text-left px-3 py-2 text-blue-600 hover:bg-blue-50 font-semibold border-b border-slate-100 flex items-center gap-1.5"
                    >
                      <Plus size={14} /> Usar: "{newProduct.unidadeDeCompra}"
                    </button>
                  )}

                  {(() => {
                    const suggestions = getUnidadeDeCompraSuggestions(newProduct.name, newProduct.category);
                    const userTyped = (newProduct.unidadeDeCompra || '').toLowerCase();
                    const filtered = suggestions.filter(u => 
                      u.toLowerCase().includes(userTyped)
                    );

                    if (filtered.length === 0) {
                      return <div className="p-3 text-xs text-slate-400 text-center">Nenhuma sugestão coincide. Escreva para definir.</div>;
                    }

                    return filtered.map(u => (
                      <button
                        key={u}
                        type="button"
                        onMouseDown={() => {
                          setNewProduct({ ...newProduct, unidadeDeCompra: u });
                          setShowUnidadeDeCompraDropdown(false);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700 block truncate"
                      >
                        {u}
                      </button>
                    ));
                  })()}
                </div>
              )}

              {/* Quick Click Suggestions */}
              {(() => {
                const suggestions = getUnidadeDeCompraSuggestions(newProduct.name, newProduct.category).slice(0, 7);
                return (
                  <div className="mt-1.5 space-y-1 text-left">
                    <span className="text-[9.5px] text-slate-400 font-extrabold uppercase tracking-wide block">Sugestões inteligentes:</span>
                    <div className="flex flex-wrap gap-1">
                      {suggestions.map(u => (
                        <button
                          key={u}
                          type="button"
                          onClick={() => {
                            setNewProduct(prev => ({ ...prev, unidadeDeCompra: u }));
                          }}
                          className={cn(
                            "text-[10px] px-2 py-0.5 rounded-md font-bold transition-all border",
                            newProduct.unidadeDeCompra === u 
                              ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                              : "bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200"
                          )}
                        >
                          {u}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Preço de Custo pela Unidade de Compra */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-0.5 text-left">
                Preço de Custo por {newProduct.unidadeDeCompra || 'Unidade de Compra'}
              </label>
              <p className="text-[11px] text-slate-500 mb-1 text-left italic">
                Valor pago ao fornecedor por cada {newProduct.unidadeDeCompra || 'unidade de compra'}
              </p>
              <div className="flex rounded-xl overflow-hidden border border-slate-200 focus-within:ring-2 focus-within:ring-blue-500">
                <span className="bg-slate-100 px-3 py-2 text-xs font-bold text-slate-500 border-r border-slate-200 flex items-center justify-center select-none min-w-[50px]">
                  {currency}
                </span>
                <input 
                  type="number"
                  className="w-full p-2 outline-none text-xs font-bold font-mono text-slate-800"
                  placeholder="Ex: 1500"
                  value={newProduct.precoCustoUnidadeCompra || ''}
                  onChange={e => setNewProduct({...newProduct, precoCustoUnidadeCompra: e.target.value})}
                />
              </div>
            </div>

            {/* Conversão de Unidades */}
            <div className="md:col-span-2 relative">
              <label className="block text-sm font-medium text-slate-700 mb-0.5 text-left">
                Quantas Unidades ({newProduct.baseUnitLabel || 'Un'}) tem 1 {newProduct.unidadeDeCompra || 'Unidade de Compra'}?
              </label>
              <p className="text-[11px] text-slate-500 mb-1 text-left italic">
                Relação de conversão para o stock retalho
              </p>
              <div className="relative">
                <input 
                  type="number"
                  className="w-full p-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Ex: 25"
                  value={newProduct.conversaoUnidades || ''}
                  onChange={e => setNewProduct({...newProduct, conversaoUnidades: e.target.value})}
                />
              </div>

              {/* Live calculation preview */}
              {Number(newProduct.precoCustoUnidadeCompra) > 0 && Number(newProduct.conversaoUnidades) > 0 && (
                <div className="mt-1.5 text-xs text-blue-600 font-semibold text-left">
                  1 {newProduct.unidadeDeCompra || 'Unidade'} ({Number(newProduct.precoCustoUnidadeCompra).toLocaleString()} {currency}) ÷ {newProduct.conversaoUnidades} {newProduct.baseUnitLabel || 'Un'} = {(Number(newProduct.precoCustoUnidadeCompra) / Number(newProduct.conversaoUnidades)).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} {currency} por {newProduct.baseUnitLabel || 'Un'}
                </div>
              )}
            </div>

            </div> {/* FECHAMENTO DA SUBGRID DA DIREITA */}
            {(() => {
              const uCompra = (newProduct.unidadeDeCompra || '').trim();
              const uCompraLower = uCompra.toLowerCase();

              // Helper for pluralization in Portuguese
              const getPluralPT = (unit: string) => {
                const lower = unit.toLowerCase();
                if (lower === 'vol') return 'Volumes';
                if (lower === 'cx') return 'Caixas';
                if (lower === 'caixa') return 'Caixas';
                if (lower === 'fardo') return 'Fardos';
                if (lower === 'saco') return 'Sacos';
                if (lower === 'emb' || lower === 'embalagem') return 'Embalagens';
                if (lower === 'un' || lower === 'unidade') return 'Unidades';
                if (lower === 'pacote' || lower === 'pct') return 'Pacotes';
                if (lower === 'rolo') return 'Rolos';
                if (lower === 'lata') return 'Latas';
                if (lower === 'garrafa') return 'Garrafas';
                if (lower === 'frasco') return 'Frascos';
                if (lower === 'par') return 'Pares';
                if (lower === 'litro' || lower === 'l') return 'Litros';
                if (lower === 'grama' || lower === 'g') return 'Gramas';
                if (lower === 'quilo' || lower === 'kg') return 'Quilos';
                
                if (lower.endsWith('m')) return unit.slice(0, -1) + 'ns';
                if (lower.endsWith('l')) return unit.slice(0, -1) + 'is';
                if (lower.endsWith('s') || lower.endsWith('z')) return unit + 'es';
                if (lower.endsWith('r') || lower.endsWith('n')) return unit + 'es';
                return unit + 's';
              };

              // Determine labels and placeholders
              let field1Label = 'Caixa (Cx)';
              let field1Placeholder = 'Ex: 3';
              if (uCompra) {
                if (uCompraLower === 'vol') {
                  field1Label = 'Volume (Vol)';
                } else if (uCompraLower === 'cx' || uCompraLower === 'caixa') {
                  field1Label = 'Caixa (Cx)';
                } else if (uCompraLower === 'emb' || uCompraLower === 'embalagem') {
                  field1Label = 'Embalagem (Emb)';
                } else {
                  field1Label = uCompra;
                }
                field1Placeholder = `Ex: 3 ${getPluralPT(uCompra)}`;
              }

              let field2Label = 'Embalagem (Emb)';
              let field2Placeholder = 'Ex: 2';
              if (uCompraLower === 'emb' || uCompraLower === 'embalagem') {
                field2Label = 'Sub-Embalagem (Sub-Emb)';
                field2Placeholder = 'Ex: 2 Emb';
              }

              const titleUnit1 = uCompra ? uCompra.toUpperCase() : 'CX';
              const titleUnit2 = (uCompraLower === 'emb' || uCompraLower === 'embalagem') ? 'SUB-EMB' : 'EMB';
              const sectionTitle = `📦 Quantidade Física Restante por Unidade (${titleUnit1}, ${titleUnit2}, UN)`;

              return (
                <div className="md:col-span-3 border border-slate-200/60 bg-slate-50/40 p-4 rounded-2xl space-y-3">
                  <label className="block text-sm font-black text-slate-800 uppercase tracking-wide">
                    {sectionTitle}
                  </label>
                  <p className="text-xs text-slate-500">Insira a quantidade exata que restou no stock físico de cada embalagem para que o sistema consiga calcular e registar tudo corretamente.</p>
                  
                  {!uCompra && (
                    <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs font-bold flex items-center gap-2">
                      <span>⚠️ Seleciona primeiro a Unidade de Compra acima para activar esta secção</span>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-3">
                    <div className={cn(
                      "border p-3 rounded-xl transition-opacity", 
                      (!uCompra)
                        ? "bg-stone-100/50 border-stone-200/60 opacity-40 cursor-not-allowed"
                        : (!newProduct.hasMultiUnits || newProduct.hasBoxUnit) 
                          ? "bg-emerald-50 border-emerald-100 opacity-100" 
                          : "bg-stone-100/50 border-stone-200/60 opacity-50"
                    )}>
                      <span className="block text-[10px] font-black text-emerald-800 uppercase tracking-wider mb-1">
                        {field1Label}
                      </span>
                      <input 
                        type="number"
                        placeholder={field1Placeholder}
                        className="w-full p-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-xs font-bold bg-white text-center font-mono placeholder:text-stone-300 disabled:bg-slate-100/50 disabled:text-slate-400"
                        disabled={!uCompra || (newProduct.hasMultiUnits && !newProduct.hasBoxUnit)}
                        value={!uCompra ? '' : (newProduct.hasMultiUnits && !newProduct.hasBoxUnit ? '' : newProduct.stockCx)}
                        onChange={e => setNewProduct({...newProduct, stockCx: e.target.value})}
                      />
                    </div>
                    <div className={cn(
                      "border p-3 rounded-xl transition-opacity", 
                      (!uCompra)
                        ? "bg-stone-100/50 border-stone-200/60 opacity-40 cursor-not-allowed"
                        : (!newProduct.hasMultiUnits || newProduct.hasPackUnit) 
                          ? "bg-blue-50/80 border-blue-100 opacity-100" 
                          : "bg-stone-100/50 border-stone-200/60 opacity-50"
                    )}>
                      <span className="block text-[10px] font-black text-blue-800 uppercase tracking-wider mb-1">
                        {field2Label}
                      </span>
                      <input 
                        type="number"
                        placeholder={field2Placeholder}
                        className="w-full p-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs font-bold bg-white text-center font-mono placeholder:text-stone-300 disabled:bg-slate-100/50 disabled:text-slate-400"
                        disabled={!uCompra || (newProduct.hasMultiUnits && !newProduct.hasPackUnit)}
                        value={!uCompra ? '' : (newProduct.hasMultiUnits && !newProduct.hasPackUnit ? '' : newProduct.stockEmb)}
                        onChange={e => setNewProduct({...newProduct, stockEmb: e.target.value})}
                      />
                    </div>
                    <div className={cn(
                      "border p-3 rounded-xl transition-opacity",
                      (!uCompra)
                        ? "bg-stone-100/50 border-stone-200/60 opacity-40 cursor-not-allowed"
                        : "bg-purple-50 border border-purple-100 opacity-100"
                    )}>
                      <span className="block text-[10px] font-black text-purple-800 uppercase tracking-wider mb-1">
                        Unidade (Un)
                      </span>
                      <input 
                        type="number"
                        placeholder="Ex: 3 Un"
                        className="w-full p-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none text-xs font-bold bg-white text-center font-mono disabled:bg-slate-100/50 disabled:text-slate-400"
                        disabled={!uCompra}
                        value={!uCompra ? '' : newProduct.stockUn}
                        onChange={e => setNewProduct({...newProduct, stockUn: e.target.value})}
                      />
                    </div>
                  </div>
                </div>
              );
            })()}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Preço de Custo / Compra (por 1x {newProduct.hasMultiUnits ? `${newProduct.baseUnitName || 'Unidade'} (${newProduct.baseUnitLabel || 'Un'})` : 'Kg/Unidade'})
              </label>
              {(() => {
                const isCostPriceCalculated = Number(newProduct.precoCustoUnidadeCompra) > 0 && Number(newProduct.conversaoUnidades) > 0;
                return (
                  <>
                    <div className={cn(
                      "flex rounded-xl overflow-hidden border transition-all",
                      isCostPriceCalculated 
                        ? "bg-slate-100 border-slate-200 cursor-not-allowed"
                        : "border-slate-200 focus-within:ring-2 focus-within:ring-blue-500"
                    )}>
                      <span className="bg-slate-100 px-3 py-2 text-xs font-bold text-slate-500 border-r border-slate-200 flex items-center justify-center select-none min-w-[50px]">
                        {currency}
                      </span>
                      <input 
                        type="number"
                        className={cn(
                          "w-full p-2 outline-none text-xs font-bold font-mono transition-all text-slate-800",
                          isCostPriceCalculated 
                            ? "bg-slate-100 cursor-not-allowed text-slate-500"
                            : ""
                        )}
                        placeholder="Ex: 100"
                        value={newProduct.costPrice}
                        onChange={e => setNewProduct({...newProduct, costPrice: e.target.value})}
                        readOnly={isCostPriceCalculated}
                      />
                    </div>
                    {isCostPriceCalculated && (
                      <p className="text-[11px] text-emerald-600 font-bold mt-1 text-left">
                        ✨ Calculado automaticamente
                      </p>
                    )}
                  </>
                );
              })()}
              <div className="flex flex-col gap-1 mt-1">
                {newProduct.hasBoxUnit && Number(newProduct.boxUnitCostPrice) > 0 && Number(newProduct.boxUnitQty) > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const calc = Number((Number(newProduct.boxUnitCostPrice) / Number(newProduct.boxUnitQty)).toFixed(2));
                      setNewProduct(prev => ({ ...prev, costPrice: calc }));
                      toast.success(`Custo unitário calculado a partir da Caixa: ${calc} ${currency}`);
                    }}
                    className="text-[10px] text-blue-700 hover:text-blue-800 font-bold bg-blue-50/50 hover:bg-blue-50 border border-blue-100 p-1 px-1.5 rounded-lg flex items-center gap-1 cursor-pointer transition-all self-start"
                  >
                    🧮 Calcular pela Caixa ({newProduct.boxUnitCostPrice} {currency} ÷ {newProduct.boxUnitQty} un = {Number((Number(newProduct.boxUnitCostPrice) / Number(newProduct.boxUnitQty)).toFixed(2))} {currency})
                  </button>
                )}
                {newProduct.hasPackUnit && Number(newProduct.packUnitCostPrice) > 0 && Number(newProduct.packUnitQty) > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const calc = Number((Number(newProduct.packUnitCostPrice) / Number(newProduct.packUnitQty)).toFixed(2));
                      setNewProduct(prev => ({ ...prev, costPrice: calc }));
                      toast.success(`Custo unitário calculado a partir da Embalagem: ${calc} ${currency}`);
                    }}
                    className="text-[10px] text-indigo-700 hover:text-indigo-800 font-bold bg-indigo-50/50 hover:bg-indigo-50 border border-indigo-100 p-1 px-1.5 rounded-lg flex items-center gap-1 cursor-pointer transition-all self-start"
                  >
                    🧮 Calcular pela Embalagem ({newProduct.packUnitCostPrice} {currency} ÷ {newProduct.packUnitQty} un = {Number((Number(newProduct.packUnitCostPrice) / Number(newProduct.packUnitQty)).toFixed(2))} {currency})
                  </button>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-black text-slate-800 mb-1">📊 Stock Total Calculado (Unidades)</label>
              <div className="p-2.5 bg-slate-100 border border-slate-200 rounded-xl text-slate-600 font-extrabold font-mono text-sm">
                {(newProduct.stockCx === '' ? 0 : Number(newProduct.stockCx)) * (newProduct.boxUnitQty === '' ? 10 : Number(newProduct.boxUnitQty)) + (newProduct.stockEmb === '' ? 0 : Number(newProduct.stockEmb)) * (newProduct.packUnitQty === '' ? 100 : Number(newProduct.packUnitQty)) + (newProduct.stockUn === '' ? 0 : Number(newProduct.stockUn))} un.
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Soma de Caixas × conversão + Embalagens × conversão + Unidades.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Alerta de Stock Baixo</label>
              <input 
                type="number"
                className="w-full p-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-slate-800"
                value={newProduct.lowStockThreshold}
                onChange={e => setNewProduct({...newProduct, lowStockThreshold: e.target.value})}
              />
            </div>

            {/* 🧮 CALCULADORA DE PREÇO DE CUSTO COLETIVO (FOR NOVO/EDIT PRODUTO) */}
            <div className="md:col-span-3 bg-blue-50/40 border border-blue-100 p-4 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-xl">🧮</span>
                  <div>
                    <span className="text-sm font-black text-slate-800 uppercase tracking-wide block">Assistente de Conversão de Custo e Margem</span>
                    <span className="text-xs text-slate-505 font-medium">Calcule o custo individual da unidade a partir do preço que pagou pela Caixa/Fardo</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPurchaseCalc(!showPurchaseCalc)}
                  className="text-xs font-black text-blue-600 hover:text-blue-700 bg-white border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-xl transition-all shadow-sm cursor-pointer"
                >
                  {showPurchaseCalc ? 'Fechar Calculadora ×' : 'Abrir Assistente da Caixa'}
                </button>
              </div>

              {showPurchaseCalc && (
                <div className="pt-3 border-t border-slate-200/60 grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in duration-200">
                  <div className="space-y-3 text-left">
                    <div className="space-y-1">
                      <label className="block text-xs font-black text-slate-550 uppercase tracking-wider">Unidade comprada ao fornecedor:</label>
                      <div className="grid grid-cols-3 gap-1">
                        {newProduct.hasMultiUnits && (
                          <button
                            type="button"
                            onClick={() => setCalcPurchaseUnit('cx')}
                            className={`text-xs font-bold py-2 px-2.5 rounded-xl border transition-all ${
                              calcPurchaseUnit === 'cx'
                                ? 'bg-blue-600 text-white border-blue-500 font-bold'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {newProduct.boxUnitLabel || 'Caixa'}
                          </button>
                        )}
                        {newProduct.hasPackUnit && (
                          <button
                            type="button"
                            onClick={() => setCalcPurchaseUnit('emb')}
                            className={`text-xs font-bold py-2 px-2.5 rounded-xl border transition-all ${
                              calcPurchaseUnit === 'emb'
                                ? 'bg-blue-600 text-white border-blue-500 font-bold'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {newProduct.packUnitLabel || 'Embalagem'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setCalcPurchaseUnit('un')}
                          className={`text-xs font-bold py-2 px-2.5 rounded-xl border transition-all ${
                            calcPurchaseUnit === 'un'
                              ? 'bg-blue-600 text-white border-blue-500 font-bold'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          Unidades ({newProduct.baseUnitLabel || 'un'})
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-black text-slate-550 uppercase tracking-wider">Como quer inserir o custo de compra?:</label>
                      <div className="grid grid-cols-2 gap-1.5 text-xs font-semibold">
                        <button
                          type="button"
                          onClick={() => setCalcCostType('total')}
                          className={`py-1.5 rounded-xl border transition-all ${
                            calcCostType === 'total'
                              ? 'bg-indigo-600 text-white border-indigo-500'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          Valor Total Investido
                        </button>
                        <button
                          type="button"
                          onClick={() => setCalcCostType('unit')}
                          className={`py-1.5 rounded-xl border transition-all ${
                            calcCostType === 'unit'
                              ? 'bg-indigo-650 text-white border-indigo-500'
                              : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          Custo Unitário da Caixa
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-slate-600">Qtd Comprada:</label>
                        <input
                          type="number"
                          placeholder="Ex: 50"
                          value={calcBulkQty}
                          onChange={e => setCalcBulkQty(e.target.value)}
                          className="w-full p-2 border rounded-xl text-slate-800 font-mono font-bold text-xs outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-slate-600">
                          {calcCostType === 'total' ? `Custo Total (${currency}):` : `Preço Unitário (${currency}):`}
                        </label>
                        <input
                          type="number"
                          placeholder="Ex: 12000"
                          value={calcCostVal}
                          onChange={e => setCalcCostVal(e.target.value)}
                          className="w-full p-2 border rounded-xl text-slate-800 font-mono font-bold text-xs outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    <div className="space-y-1 bg-white p-3 rounded-xl border border-slate-150">
                      <div className="flex items-center justify-between text-xs font-black text-slate-700">
                        <span>Margem de Lucro:</span>
                        <span className="text-emerald-600 font-extrabold">{calcMarkup}% Markup</span>
                      </div>
                      <div className="flex gap-2 items-center mt-1">
                        <input
                          type="range"
                          min="5"
                          max="150"
                          step="5"
                          value={calcMarkup}
                          onChange={e => setCalcMarkup(e.target.value)}
                          className="flex-1 accent-blue-600 h-1 bg-slate-200 rounded outline-none"
                        />
                        <input
                          type="number"
                          value={calcMarkup}
                          onChange={e => setCalcMarkup(e.target.value)}
                          className="w-12 p-1 border text-slate-800 font-mono font-bold text-xs text-center rounded focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-900 text-slate-50 p-4 rounded-2xl flex flex-col justify-between border border-slate-950 text-left">
                    {(() => {
                      const results = getNewProductCalcResults();
                      if (!results) {
                        return (
                          <div className="h-full flex flex-col items-center justify-center p-4 text-center text-xs text-slate-450 space-y-2">
                            <span>💡 DICA ERGONÓMICA</span>
                            <p className="max-w-[280px]">Introduza os dados ao lado. O sistema calculará no ato as razões de custo e sugerirá os preços ideais para as peças, caixas e packs poupando-lhe trabalho de conversão.</p>
                          </div>
                        );
                      }

                      return (
                        <div className="space-y-4 font-sans text-xs h-full flex flex-col justify-between">
                          <div className="space-y-2.5">
                            <span className="text-[10px] uppercase font-black tracking-widest text-blue-400 block border-b border-slate-850 pb-1.5 font-mono">Resultados Conversão de Atacado</span>
                            <div className="grid grid-cols-2 gap-3 text-xs leading-snug">
                              <div>
                                <span className="text-slate-400 block text-[10px] font-bold uppercase">Total de Unidades Base:</span>
                                <strong className="text-white font-mono text-sm">{results.totalUnits.toLocaleString()} un.</strong>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[10px] font-bold uppercase">Custo Unitário Calculado:</span>
                                <strong className="text-white font-mono text-sm">{results.unitCost.toFixed(2)} {currency}</strong>
                              </div>
                            </div>
                            
                            <div className="space-y-1.5 pt-1.5 border-t border-slate-800">
                              <span className="text-slate-400 block text-[9.5px] font-bold uppercase">Preços Finais de Venda Recomendados:</span>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 text-slate-900 font-bold font-mono">
                                <div className="bg-purple-50 p-2 rounded border border-purple-200">
                                  <span className="text-purple-800 text-[8.5px] uppercase font-black block">1x Unidade ({newProduct.baseUnitLabel || 'un'}):</span>
                                  <span className="text-slate-950 text-sm block font-black">{results.unitPrice.toFixed(2)} {currency}</span>
                                  <span className="text-[8px] text-slate-500 font-medium font-sans">Margem: {calcMarkup}%</span>
                                </div>
                                {newProduct.hasMultiUnits && (
                                  <div className="bg-emerald-50 p-2 rounded border border-emerald-200">
                                    <span className="text-emerald-800 text-[8.5px] uppercase font-black block">1x Caixa ({newProduct.boxUnitLabel || 'cx'}):</span>
                                    <span className="text-slate-950 text-sm block font-black">{results.boxPrice.toFixed(2)} {currency}</span>
                                    <span className="text-[8px] text-slate-500 font-medium font-sans">Sugerido (-4% margem)</span>
                                  </div>
                                )}
                                {newProduct.hasPackUnit && (
                                  <div className="bg-blue-50 p-2 rounded border border-blue-200">
                                    <span className="text-blue-800 text-[8.5px] uppercase font-black block">1x Emb. ({newProduct.packUnitLabel || 'emb'}):</span>
                                    <span className="text-slate-950 text-sm block font-black">{results.packPrice.toFixed(2)} {currency}</span>
                                    <span className="text-[8px] text-slate-500 font-medium font-sans">Sugerido (-2% margem)</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setNewProduct(prev => ({
                                ...prev,
                                costPrice: results.unitCost,
                                price: results.unitPrice,
                                ...(prev.hasBoxUnit ? {
                                  boxUnitCostPrice: results.boxCost,
                                  boxUnitPrice: results.boxPrice,
                                } : {}),
                                ...(prev.hasPackUnit ? {
                                  packUnitCostPrice: results.packCost,
                                  packUnitPrice: results.packPrice,
                                } : {}),
                                ...(prev.allowWholesale ? {
                                  wholesalePrice: Number((results.unitCost * (1 + Math.max(0, results.markup - 8) / 100)).toFixed(2))
                                } : {})
                              }));
                              
                              toast.success("📝 Todos os preços, custos e margens de venda foram preenchidos com sucesso!");
                            }}
                            className="w-full bg-emerald-600 hover:bg-emerald-550 active:scale-95 text-white font-black text-xs uppercase py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <span>📥 Preencher Preços no Formulário</span>
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>

            <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-100 pt-4 mt-2">
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1.5 font-sans">
                  📝 Descrição do Artigo (Pública)
                </label>
                <textarea 
                  rows={2}
                  className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs font-semibold resize-none text-slate-800"
                  placeholder="Descrição visível nas faturas ou catálogo..."
                  value={newProduct.description || ''}
                  onChange={e => setNewProduct({...newProduct, description: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-indigo-700 mb-1.5 flex items-center gap-1.5 font-sans">
                  🔒 Notas Internas de Gestão (Confidencial)
                </label>
                <textarea 
                  rows={2}
                  className="w-full p-3 border border-indigo-150 bg-indigo-50/10 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none text-xs font-semibold text-slate-850 resize-none"
                  placeholder="Regras de desconto raras, contacto alternativo do fornecedor, etc..."
                  value={newProduct.managerNotes || ''}
                  onChange={e => setNewProduct({...newProduct, managerNotes: e.target.value})}
                />
              </div>
            </div>

            {/* ================= NEW COMO SERÁ VENDIDO ESTE PRODUTO? SECTION ================= */}
            <div className="md:col-span-3 border-t pt-6 mt-4 bg-slate-50/60 p-6 rounded-[24px] border border-slate-150 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/60">
                <div>
                  <h4 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <Package size={18} className="text-blue-600" />
                    Como será vendido este produto? (Unidades de Medida & Preços)
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 text-left">Defina como o produto será comercializado no modo Retalho e Grosso/Atacado.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* SECTION A — PREÇOS DE RETALHO */}
                <div className="bg-white p-5 border border-slate-200 rounded-2xl shadow-sm space-y-4 text-left">
                  <div>
                    <h5 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                      <span>💊</span> Venda a Retalho (por Unidade)
                    </h5>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Defina o preço de venda por {newProduct.baseUnitLabel || 'Un'} no modo Retalho
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div className="relative">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Unidade</label>
                      <input
                        type="text"
                        className="w-full p-2 bg-white border border-slate-200 rounded-xl text-slate-800 text-xs font-black text-center outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Un"
                        value={newProduct.baseUnitLabel || ''}
                        onChange={e => {
                          const val = e.target.value;
                          setNewProduct(prev => ({
                            ...prev,
                            baseUnitLabel: val,
                            baseUnitName: val
                          }));
                        }}
                        onFocus={() => setShowBaseUnitDropdown(true)}
                        onBlur={() => setTimeout(() => setShowBaseUnitDropdown(false), 200)}
                      />
                      {showBaseUnitDropdown && (
                        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto font-sans text-xs min-w-[140px]">
                          {newProduct.baseUnitLabel?.trim() && !getBaseUnitSuggestions(newProduct.name, newProduct.category).some(u => u.toLowerCase() === newProduct.baseUnitLabel.trim().toLowerCase()) && (
                            <button
                              type="button"
                              onMouseDown={() => {
                                setNewProduct(prev => ({ ...prev, baseUnitLabel: prev.baseUnitLabel.trim(), baseUnitName: prev.baseUnitLabel.trim() }));
                                setShowBaseUnitDropdown(false);
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-blue-50 text-blue-600 font-bold flex items-center gap-1 border-b border-slate-100"
                            >
                              <Plus size={12} /> Usar: "{newProduct.baseUnitLabel}"
                            </button>
                          )}
                          {getBaseUnitSuggestions(newProduct.name, newProduct.category).map(u => (
                            <button
                              key={u}
                              type="button"
                              onMouseDown={() => {
                                setNewProduct(prev => ({ ...prev, baseUnitLabel: u, baseUnitName: u }));
                                setShowBaseUnitDropdown(false);
                              }}
                              className={cn(
                                "w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700 block truncate font-semibold",
                                newProduct.baseUnitLabel === u && "bg-blue-50 text-blue-700"
                              )}
                            >
                              {u}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Preço de Venda Retalho</label>
                      <div className="flex rounded-xl overflow-hidden border border-slate-200 focus-within:ring-2 focus-within:ring-blue-500">
                        <span className="bg-slate-100 px-3 py-2 text-xs font-bold text-slate-500 border-r border-slate-200 flex items-center justify-center select-none min-w-[50px]">
                          {currency}
                        </span>
                        <input 
                          type="number"
                          className="w-full p-2 outline-none text-xs font-bold font-mono text-slate-800"
                          placeholder="Ex: 50"
                          value={newProduct.precoRetalhoUn || ''}
                          onChange={e => {
                            const val = e.target.value;
                            setNewProduct(prev => ({
                              ...prev,
                              precoRetalhoUn: val,
                              price: val
                            }));
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Auto-calculated Margin for Retail */}
                  {(() => {
                    const precoRetalho = Number(newProduct.precoRetalhoUn || 0);
                    const custoUn = Number(newProduct.costPrice || 0);
                    if (precoRetalho > 0 && custoUn > 0) {
                      const margin = ((precoRetalho - custoUn) / custoUn) * 100;
                      return (
                        <div className="text-xs text-emerald-600 font-semibold bg-emerald-50/50 p-2.5 rounded-xl border border-emerald-100 flex items-center gap-1.5">
                          <span>📈</span> Margem Retalho: <strong className="font-mono">{margin.toFixed(2)}%</strong>
                        </div>
                      );
                    }
                    return (
                      <div className="text-xs text-slate-400 font-medium italic p-2.5 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                        Margem Retalho: --% (defina custo e preço para calcular)
                      </div>
                    );
                  })()}

                  {/* UPGRADE: SECTION A — RETALHO PRICE TIERS */}
                  <div className="border-t border-slate-100 pt-3 mt-2">
                    <button
                      type="button"
                      onClick={() => setIsRetalhoTiersOpen(!isRetalhoTiersOpen)}
                      className="flex items-center justify-between w-full text-xs font-black text-slate-700 hover:text-blue-600 transition-colors uppercase tracking-wider select-none cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5">
                        <span>🏷️</span> Preços por Quantidade (Retalho)
                      </span>
                      <span className="text-slate-400 text-[10px]">
                        {isRetalhoTiersOpen ? '▲ Ocultar' : '▼ Mostrar'}
                      </span>
                    </button>

                    {isRetalhoTiersOpen && (
                      <div className="mt-3 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                        {/* List of tiers */}
                        {(newProduct.tiersRetalho || []).map((tier, idx) => {
                          const precoTier = Number(tier.preco || 0);
                          const custoUn = Number(newProduct.costPrice || 0);
                          const margin = custoUn > 0 && precoTier > 0 ? ((precoTier - custoUn) / custoUn) * 100 : null;
                          const basePrice = Number(newProduct.precoRetalhoUn || 0);
                          const isHigherThanBase = basePrice > 0 && precoTier >= basePrice;

                          return (
                            <div key={idx} className="bg-slate-50 p-2.5 rounded-xl border border-slate-150 space-y-2">
                              <div className="grid grid-cols-12 gap-2 items-center">
                                {/* A partir de */}
                                <div className="col-span-5">
                                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">A partir de</label>
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      min="1"
                                      className="w-full p-1.5 border border-slate-200 rounded-lg text-xs font-bold font-mono outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                                      placeholder="Ex: 6"
                                      value={tier.quantidade}
                                      onChange={e => {
                                        const updated = [...(newProduct.tiersRetalho || [])];
                                        updated[idx] = { ...updated[idx], quantidade: e.target.value };
                                        setNewProduct({ ...newProduct, tiersRetalho: updated });
                                      }}
                                    />
                                    <span className="text-xs font-bold text-slate-500">Un</span>
                                  </div>
                                </div>

                                {/* Preço por Un */}
                                <div className="col-span-5">
                                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Preço por Un</label>
                                  <div className="flex rounded-lg overflow-hidden border border-slate-200 focus-within:ring-1 focus-within:ring-blue-500 bg-white">
                                    <span className="bg-slate-100 px-2.5 py-1.5 text-[10px] font-bold text-slate-500 border-r border-slate-200 flex items-center justify-center select-none min-w-[40px]">
                                      {currency}
                                    </span>
                                    <input
                                      type="number"
                                      className="w-full p-1.5 outline-none text-xs font-bold font-mono text-slate-800 bg-white"
                                      placeholder="Ex: 45"
                                      value={tier.preco}
                                      onChange={e => {
                                        const updated = [...(newProduct.tiersRetalho || [])];
                                        updated[idx] = { ...updated[idx], preco: e.target.value };
                                        setNewProduct({ ...newProduct, tiersRetalho: updated });
                                      }}
                                    />
                                  </div>
                                </div>

                                {/* Delete button (x) */}
                                <div className="col-span-2 text-right pt-4">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = (newProduct.tiersRetalho || []).filter((_, i) => i !== idx);
                                      setNewProduct({ ...newProduct, tiersRetalho: updated });
                                    }}
                                    className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                    title="Remover Escalão"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              </div>

                              {/* Warning or Margin */}
                              <div className="flex items-center justify-between text-[10px] border-t border-slate-200/50 pt-1">
                                <div>
                                  {margin !== null ? (
                                    <span className="text-emerald-600 font-semibold">
                                      📈 Margem: <strong className="font-mono">{margin.toFixed(2)}%</strong>
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 italic">Margem: --%</span>
                                  )}
                                </div>
                                {isHigherThanBase && (
                                  <span className="text-rose-500 font-bold animate-pulse text-[9px]">
                                    ⚠️ Preço deve ser menor que {basePrice} {currency}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}

                        {/* Button to add tier */}
                        <button
                          type="button"
                          onClick={() => {
                            const current = newProduct.tiersRetalho || [];
                            setNewProduct({
                              ...newProduct,
                              tiersRetalho: [...current, { quantidade: '', preco: '' }]
                            });
                          }}
                          className="w-full py-1.5 border border-dashed border-slate-250 hover:border-blue-400 bg-white hover:bg-slate-50 text-slate-600 hover:text-blue-600 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer mt-1"
                        >
                          <Plus size={13} /> Adicionar Escalão de Preço
                        </button>

                        {/* Validation Hints */}
                        {(() => {
                          const tiers = newProduct.tiersRetalho || [];
                          const isAscending = tiers.every((t, i) => i === 0 || Number(t.quantidade) > Number(tiers[i - 1].quantidade));

                          return (
                            <div className="space-y-1">
                              {tiers.length < 2 && (
                                <p className="text-[10px] text-slate-400 font-medium italic">
                                  ℹ️ Adicione pelo menos 2 escalões para activar preços por quantidade
                                </p>
                              )}
                              {!isAscending && tiers.length > 1 && (
                                <p className="text-[10px] text-amber-600 font-bold">
                                  ⚠️ As quantidades devem estar em ordem crescente
                                </p>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                </div>

                {/* SECTION B — PREÇOS DE GROSSO/ATACADO */}
                <div className="bg-white p-5 border border-slate-200 rounded-2xl shadow-sm space-y-4 text-left relative">
                  <div>
                    <h5 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                      <span>📦</span> Venda por Grosso / Atacado (por Embalagem)
                    </h5>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Defina uma ou mais unidades de venda em volume (Cx, Emb, Vol, Saco, Fardo...)
                    </p>
                  </div>

                  <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                    {(newProduct.unidadesGrosso || []).map((row, idx) => {
                      const conversion = getWholesaleUnitConversion(row.unidade);
                      const custoUn = Number(newProduct.costPrice || 0);
                      const costOfUnit = custoUn * conversion;
                      const precoGrosso = Number(row.preco || 0);
                      const calculatedMargin = costOfUnit > 0 && precoGrosso > 0 ? ((precoGrosso - costOfUnit) / costOfUnit) * 100 : null;

                      return (
                        <div key={idx} className="relative bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-2">
                          <div className="grid grid-cols-2 gap-3 items-end">
                            {/* Unidade de Venda */}
                            <div className="relative">
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Unidade de Venda</label>
                              <input 
                                type="text"
                                className="w-full p-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs font-bold"
                                placeholder="Ex: Cx"
                                value={row.unidade}
                                onChange={e => {
                                  const val = e.target.value;
                                  const updated = [...(newProduct.unidadesGrosso || [])];
                                  updated[idx] = { ...updated[idx], unidade: val };
                                  setNewProduct({ ...newProduct, unidadesGrosso: updated });
                                }}
                                onFocus={() => setActiveGrossoDropdownIndex(idx)}
                                onBlur={() => setTimeout(() => {
                                  if (activeGrossoDropdownIndex === idx) {
                                    setActiveGrossoDropdownIndex(null);
                                  }
                                }, 250)}
                              />

                              {/* Suggestion Dropdown */}
                              {activeGrossoDropdownIndex === idx && (
                                <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto font-sans text-xs">
                                  {['Cx', 'Emb', 'Fardo', 'Saco', 'Vol', 'Garrafa', 'Lt', 'Kg'].map(u => (
                                    <button
                                      key={u}
                                      type="button"
                                      onMouseDown={() => {
                                        const updated = [...(newProduct.unidadesGrosso || [])];
                                        updated[idx] = { ...updated[idx], unidade: u };
                                        setNewProduct({ ...newProduct, unidadesGrosso: updated });
                                        setActiveGrossoDropdownIndex(null);
                                      }}
                                      className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700 block truncate font-semibold"
                                    >
                                      {u}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Preço de Venda */}
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Preço de Venda</label>
                              <div className="flex rounded-xl overflow-hidden border border-slate-200 focus-within:ring-2 focus-within:ring-blue-500">
                                <span className="bg-slate-100 px-3 py-2 text-xs font-bold text-slate-500 border-r border-slate-200 flex items-center justify-center select-none min-w-[50px]">
                                  {currency}
                                </span>
                                <input 
                                  type="number"
                                  className="w-full p-2 outline-none text-xs font-bold font-mono text-slate-800"
                                  placeholder="Ex: 1500"
                                  value={row.preco}
                                  onChange={e => {
                                    const val = e.target.value;
                                    const updated = [...(newProduct.unidadesGrosso || [])];
                                    updated[idx] = { ...updated[idx], preco: val };
                                    setNewProduct({ ...newProduct, unidadesGrosso: updated });
                                  }}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Row Actions and Auto-calculated Margin */}
                          <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-[11px]">
                            <div>
                              {calculatedMargin !== null ? (
                                <span className="text-emerald-600 font-bold">
                                  📈 Margem ({row.unidade || 'Grosso'}): <strong className="font-mono">{calculatedMargin.toFixed(2)}%</strong>
                                </span>
                              ) : (
                                <span className="text-slate-400 italic">Margem: --%</span>
                              )}
                            </div>

                            {/* Delete button (x) visible when there is more than one row */}
                            {(newProduct.unidadesGrosso || []).length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = (newProduct.unidadesGrosso || []).filter((_, i) => i !== idx);
                                  setNewProduct({ ...newProduct, unidadesGrosso: updated });
                                }}
                                className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                title="Remover Unidade"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>

                          {/* UPGRADE: SECTION B — GROSSO PRICE TIERS */}
                          <div className="border-t border-slate-200/50 pt-2 mt-1">
                            <button
                              type="button"
                              onClick={() => {
                                setOpenGrossoTiersIndices(prev => ({
                                  ...prev,
                                  [idx]: !prev[idx]
                                }));
                              }}
                              className="flex items-center justify-between w-full text-[10px] font-black text-slate-500 hover:text-blue-600 transition-colors uppercase tracking-wider select-none cursor-pointer"
                            >
                              <span className="flex items-center gap-1">
                                <span>🏷️</span> Preços por Quantidade ({row.unidade || 'Cx'})
                              </span>
                              <span className="text-slate-400 text-[9px]">
                                {openGrossoTiersIndices[idx] ? '▲ Ocultar' : '▼ Mostrar'}
                              </span>
                            </button>

                            {openGrossoTiersIndices[idx] && (
                              <div className="mt-2 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                {(row.tiers || []).map((tier, tIdx) => {
                                  const precoTier = Number(tier.preco || 0);
                                  const margin = costOfUnit > 0 && precoTier > 0 ? ((precoTier - costOfUnit) / costOfUnit) * 100 : null;
                                  const basePrice = Number(row.preco || 0);
                                  const isHigherThanBase = basePrice > 0 && precoTier >= basePrice;

                                  return (
                                    <div key={tIdx} className="bg-white p-2 border border-slate-150 rounded-lg space-y-1.5">
                                      <div className="grid grid-cols-12 gap-1 items-center">
                                        {/* A partir de */}
                                        <div className="col-span-5">
                                          <label className="block text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">A partir de</label>
                                          <div className="flex items-center gap-1">
                                            <input
                                              type="number"
                                              min="1"
                                              className="w-full p-1 border border-slate-200 rounded-md text-xs font-bold font-mono outline-none focus:ring-1 focus:ring-blue-500"
                                              placeholder="Ex: 3"
                                              value={tier.quantidade}
                                              onChange={e => {
                                                const updatedTiers = [...(row.tiers || [])];
                                                updatedTiers[tIdx] = { ...updatedTiers[tIdx], quantidade: e.target.value };
                                                
                                                const updatedGrosso = [...(newProduct.unidadesGrosso || [])];
                                                updatedGrosso[idx] = { ...updatedGrosso[idx], tiers: updatedTiers };
                                                
                                                setNewProduct({ ...newProduct, unidadesGrosso: updatedGrosso });
                                              }}
                                            />
                                            <span className="text-[10px] font-bold text-slate-500">{row.unidade || 'Cx'}</span>
                                          </div>
                                        </div>

                                        {/* Preço por [Unidade] */}
                                        <div className="col-span-5">
                                          <label className="block text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Preço por {row.unidade || 'Cx'}</label>
                                          <div className="flex rounded-md overflow-hidden border border-slate-200 focus-within:ring-1 focus-within:ring-blue-500 bg-white">
                                            <span className="bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500 border-r border-slate-200 flex items-center justify-center select-none min-w-[40px]">
                                              {currency}
                                            </span>
                                            <input
                                              type="number"
                                              className="w-full p-1 outline-none text-xs font-bold font-mono text-slate-800 bg-white"
                                              placeholder="Ex: 1400"
                                              value={tier.preco}
                                              onChange={e => {
                                                const updatedTiers = [...(row.tiers || [])];
                                                updatedTiers[tIdx] = { ...updatedTiers[tIdx], preco: e.target.value };
                                                
                                                const updatedGrosso = [...(newProduct.unidadesGrosso || [])];
                                                updatedGrosso[idx] = { ...updatedGrosso[idx], tiers: updatedTiers };
                                                
                                                setNewProduct({ ...newProduct, unidadesGrosso: updatedGrosso });
                                              }}
                                            />
                                          </div>
                                        </div>

                                        {/* Delete button (x) */}
                                        <div className="col-span-2 text-right pt-3">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const updatedTiers = (row.tiers || []).filter((_, i) => i !== tIdx);
                                              const updatedGrosso = [...(newProduct.unidadesGrosso || [])];
                                              updatedGrosso[idx] = { ...updatedGrosso[idx], tiers: updatedTiers };
                                              setNewProduct({ ...newProduct, unidadesGrosso: updatedGrosso });
                                            }}
                                            className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors cursor-pointer"
                                            title="Remover Escalão"
                                          >
                                            <X size={12} />
                                          </button>
                                        </div>
                                      </div>

                                      {/* Margin or Warning */}
                                      <div className="flex items-center justify-between text-[9px] border-t border-slate-100 pt-1">
                                        <div>
                                          {margin !== null ? (
                                            <span className="text-emerald-600 font-semibold">
                                              📈 Margem: <strong className="font-mono">{margin.toFixed(2)}%</strong>
                                            </span>
                                          ) : (
                                            <span className="text-slate-400 italic">Margem: --%</span>
                                          )}
                                        </div>
                                        {isHigherThanBase && (
                                          <span className="text-rose-500 font-bold animate-pulse text-[8px]">
                                            ⚠️ Preço deve ser menor que {basePrice} {currency}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}

                                {/* Toggle button: "+ Adicionar Escalão" */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updatedTiers = [...(row.tiers || []), { quantidade: '', preco: '' }];
                                    const updatedGrosso = [...(newProduct.unidadesGrosso || [])];
                                    updatedGrosso[idx] = { ...updatedGrosso[idx], tiers: updatedTiers };
                                    setNewProduct({ ...newProduct, unidadesGrosso: updatedGrosso });
                                  }}
                                  className="w-full py-1 border border-dashed border-slate-200 hover:border-blue-400 bg-white hover:bg-slate-50 text-slate-500 hover:text-blue-600 rounded-lg text-[10px] font-bold transition-all flex items-center justify-center gap-0.5 cursor-pointer"
                                >
                                  <Plus size={12} /> Adicionar Escalão
                                </button>

                                {/* Validation Hints */}
                                {(() => {
                                  const tiers = row.tiers || [];
                                  const isAscending = tiers.every((t, i) => i === 0 || Number(t.quantidade) > Number(tiers[i - 1].quantidade));

                                  return (
                                    <div className="space-y-0.5">
                                      {tiers.length < 2 && (
                                        <p className="text-[9px] text-slate-400 font-medium italic">
                                          ℹ️ Adicione pelo menos 2 escalões para activar preços por quantidade
                                        </p>
                                      )}
                                      {!isAscending && tiers.length > 1 && (
                                        <p className="text-[9px] text-amber-600 font-bold">
                                          ⚠️ As quantidades devem estar em ordem crescente
                                        </p>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Button to add unit */}
                  <button
                    type="button"
                    onClick={() => {
                      const current = newProduct.unidadesGrosso || [];
                      setNewProduct({
                        ...newProduct,
                        unidadesGrosso: [...current, { unidade: 'Cx', preco: '', tiers: [] }]
                      });
                    }}
                    className="w-full py-2 border-2 border-dashed border-blue-200 hover:border-blue-400 bg-blue-50/20 hover:bg-blue-50/50 text-blue-600 hover:text-blue-700 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Plus size={14} /> Adicionar Unidade de Grosso
                  </button>
                </div>
              </div>
            </div>

            {/* Multiple Tier Pricing Section */}
            {newProduct.unidadesGrosso && newProduct.unidadesGrosso.length > 0 && (
              <div className="md:col-span-3 border-t pt-4 mt-2">
                <label className="block text-sm font-bold text-slate-900 mb-1">⚖️ Tabela de Preços por Escalão de Quantidade (Wholesale/Qty Tiers)</label>
                <p className="text-xs text-slate-500 mb-3">Defina preços diferentes de acordo com a quantidade que o cliente comprar. O sistema ERP ajustará automaticamente na faturação!</p>
                
                <div className="space-y-2 max-w-xl">
                  {(newProduct.tieredPrices || []).map((tier, tIdx) => (
                    <div key={tIdx} className="flex gap-3 items-center bg-slate-50 p-2 rounded-xl border border-slate-100 animate-in fade-in-30">
                      <div className="flex-1 flex gap-2 items-center">
                        <span className="text-[10px] uppercase font-black text-slate-400 truncate">Qtd Mínima (≥):</span>
                        <input 
                          type="number" 
                          min="0"
                          step="any"
                          placeholder="Ex: 10" 
                          className="w-20 p-1.5 border rounded-lg bg-white text-xs font-bold font-mono outline-none focus:ring-2 focus:ring-blue-500 text-center"
                          value={tier.minQty}
                          onChange={e => {
                            const val = e.target.value;
                            const updated = (newProduct.tieredPrices || []).map((t, idx) => 
                              idx === tIdx ? { ...t, minQty: val === '' ? '' : val } : t
                            );
                            setNewProduct({ ...newProduct, tieredPrices: updated });
                          }}
                        />
                      </div>
                      <div className="flex-1 flex gap-2 items-center">
                        <span className="text-[10px] uppercase font-black text-slate-400 truncate">Preço Especial:</span>
                        <div className="relative flex-1">
                          <input 
                            type="number" 
                            step="any"
                            min="0"
                            placeholder="Ex: 80" 
                            className="w-full p-1.5 pr-8 border rounded-lg bg-white text-xs font-bold font-mono outline-none focus:ring-2 focus:ring-blue-500"
                            value={tier.price}
                            onChange={e => {
                              const val = e.target.value;
                              const updated = (newProduct.tieredPrices || []).map((t, idx) => 
                                idx === tIdx ? { ...t, price: val === '' ? '' : val } : t
                              );
                              setNewProduct({ ...newProduct, tieredPrices: updated });
                            }}
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-slate-400">{currency}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const filtered = (newProduct.tieredPrices || []).filter((_, i) => i !== tIdx);
                          setNewProduct({ ...newProduct, tieredPrices: filtered });
                        }}
                        className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-100 shrink-0"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  
                  <button
                    type="button"
                    onClick={() => {
                      const currentTiers = newProduct.tieredPrices || [];
                      setNewProduct({
                        ...newProduct,
                        tieredPrices: [...currentTiers, { minQty: 10, price: Math.max(0, (newProduct.price === '' ? 0 : Number(newProduct.price)) - 5) }]
                      });
                    }}
                    className="px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 border border-blue-200 border-dashed rounded-xl font-bold transition-all flex items-center gap-1 shrink-0"
                  >
                    <span>+ Adicionar Novo Escalão de Quantidade</span>
                  </button>
                </div>
              </div>
            )}

            {/* Multiple Tier Pricing Section for Retail Units */}
            <div className="md:col-span-3 border-t pt-4 mt-2">
              <label className="block text-sm font-bold text-slate-900 mb-1">⚖️ Tabela de Descontos para Venda a Retalho (Unidades 'un')</label>
              <p className="text-xs text-slate-500 mb-3">Defina descontos adicionais automáticos quando o cliente compra uma certa quantidade de unidades simples (não aplicável a caixas/embalagens).</p>
              
              <div className="space-y-2 max-w-xl">
                {(newProduct.unitDiscountTiers || []).map((tier, tIdx) => (
                  <div key={tIdx} className="flex gap-3 items-center bg-slate-50 p-2 rounded-xl border border-slate-100 animate-in fade-in-30">
                    <div className="flex-1 flex gap-2 items-center">
                      <span className="text-[10px] uppercase font-black text-slate-400 truncate">Qtd ≥:</span>
                      <input 
                        type="number" 
                        min="1"
                        placeholder="Ex: 5" 
                        className="w-16 p-1.5 border rounded-lg bg-white text-xs font-bold font-mono outline-none focus:ring-2 focus:ring-blue-500 text-center"
                        value={tier.minQty}
                        onChange={e => {
                          const val = e.target.value;
                          const updated = (newProduct.unitDiscountTiers || []).map((t, idx) => 
                            idx === tIdx ? { ...t, minQty: val === '' ? '' : Number(val) } : t
                          );
                          setNewProduct({ ...newProduct, unitDiscountTiers: updated });
                        }}
                      />
                    </div>
                    
                    <div className="flex-1 flex gap-1 items-center">
                      <span className="text-[10px] uppercase font-black text-slate-400 truncate">Tipo:</span>
                      <select
                        className="p-1.5 border rounded-lg bg-white text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                        value={tier.discountType}
                        onChange={e => {
                          const val = e.target.value as 'percent' | 'fixed';
                          const updated = (newProduct.unitDiscountTiers || []).map((t, idx) => 
                            idx === tIdx ? { ...t, discountType: val } : t
                          );
                          setNewProduct({ ...newProduct, unitDiscountTiers: updated });
                        }}
                      >
                        <option value="percent">Percentagem (%)</option>
                        <option value="fixed">Valor Fixo ({currency})</option>
                      </select>
                    </div>

                    <div className="flex-1 flex gap-2 items-center">
                      <span className="text-[10px] uppercase font-black text-slate-400 truncate">Desconto:</span>
                      <div className="relative flex-1">
                        <input 
                          type="number" 
                          step="any"
                          min="0"
                          placeholder={tier.discountType === 'percent' ? "Ex: 10" : "Ex: 20"} 
                          className="w-full p-1.5 pr-8 border rounded-lg bg-white text-xs font-bold font-mono outline-none focus:ring-2 focus:ring-blue-500"
                          value={tier.discountVal}
                          onChange={e => {
                            const val = e.target.value;
                            const updated = (newProduct.unitDiscountTiers || []).map((t, idx) => 
                              idx === tIdx ? { ...t, discountVal: val === '' ? '' : val } : t
                            );
                            setNewProduct({ ...newProduct, unitDiscountTiers: updated });
                          }}
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-slate-400">
                          {tier.discountType === 'percent' ? '%' : currency}
                        </span>
                      </div>
                    </div>
                    
                    <button
                      type="button"
                      onClick={() => {
                        const filtered = (newProduct.unitDiscountTiers || []).filter((_, i) => i !== tIdx);
                        setNewProduct({ ...newProduct, unitDiscountTiers: filtered });
                      }}
                      className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-100 shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                
                <button
                  type="button"
                  onClick={() => {
                    const currentTiers = newProduct.unitDiscountTiers || [];
                    setNewProduct({
                      ...newProduct,
                      unitDiscountTiers: [...currentTiers, { minQty: 5, discountType: 'percent', discountVal: 5 }]
                    });
                  }}
                  className="px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 border border-blue-200 border-dashed rounded-xl font-bold transition-all flex items-center gap-1 shrink-0"
                >
                  <span>+ Adicionar Desconto por Qtd de Unidades ('un')</span>
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button 
              onClick={() => {
                setIsCreating(false);
                setEditingProduct(null);
                setActiveTab('list');
                setNewProduct({
                  name: '',
                  sku: '',
                  barcode: '',
                  unidadeDeCompra: '',
                  precoRetalhoUn: '',
                  unidadesGrosso: [{ unidade: 'Cx', preco: '', tiers: [] }],
                  tiersRetalho: [],
                  precoCustoUnidadeCompra: '',
                  conversaoUnidades: '',
                  imageUrl: '',
                  price: '',
                  onlinePrice: '',
                  costPrice: '',
                  availableOnline: false,
                  description: '',
                  stockLevel: '',
                  stockCx: '',
                  stockEmb: '',
                  stockUn: '',
                  lowStockThreshold: '',
                  category: '',
                  supplier: '',
                  managerNotes: '',
                  allowWholesale: false,
                  wholesalePrice: '',
                  tieredPrices: [],
                  unitDiscountTiers: [],
                  hasMultiUnits: false,
                  uomScheme: 'cx_emb_un',
                  boxUnitName: 'Caixa',
                  boxUnitLabel: 'Cx',
                  packUnitName: 'Embalagem',
                  packUnitLabel: 'Emb',
                  baseUnitName: 'Unidade',
                  baseUnitLabel: 'Un',
                  hasBoxUnit: false,
                  boxUnitQty: '',
                  boxUnitPrice: '',
                  boxUnitCostPrice: '',
                  hasPackUnit: false,
                  packUnitQty: '',
                  packUnitPrice: '',
                  packUnitCostPrice: ''
                });
              }}
              className="px-4 py-2 text-slate-600 font-medium rounded-xl hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button 
              onClick={handleCreateProduct}
              className="px-6 py-2 bg-slate-900 text-white font-medium rounded-xl hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/10"
            >
              Guardar Produto
            </button>
          </div>

          {/* MODAIS DE CAPTURA DE IMAGEM & DESIGN INTELIGENTE POR IA */}
          {isCameraOpen && (
            <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full max-h-[90vh] overflow-y-auto shadow-2xl animate-in zoom-in-95 duration-200">
                <div className="p-5 border-b border-slate-800 flex items-center justify-between">
                  <h4 className="text-white font-bold flex items-center gap-2 text-sm">
                    <Camera className="text-blue-500 animate-pulse" size={16} />
                    <span>Capturar Foto do Artigo</span>
                  </h4>
                  <button 
                    type="button" 
                    onClick={stopCamera} 
                    className="p-1.5 text-slate-450 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="p-6 flex flex-col items-center">
                  <div className="relative w-full aspect-square bg-black rounded-2xl overflow-hidden border-2 border-slate-850 shadow-inner">
                    <video 
                      id="camera-preview" 
                      autoPlay 
                      playsInline 
                      className="w-full h-full object-cover scale-x-[-1]"
                    />
                    <div className="absolute inset-0 border-2 border-indigo-500/30 rounded-2xl pointer-events-none flex items-center justify-center">
                      <div className="w-[80%] h-[80%] border border-dashed border-white/20 rounded-xl" />
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 text-center mt-3 font-medium">
                    Centralize o artigo dentro do quadrado guia para melhores resultados
                  </p>
                </div>
                <div className="p-5 bg-slate-950/80 border-t border-slate-800 flex justify-between gap-3">
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="flex-1 py-2.5 px-4 bg-slate-850 hover:bg-slate-850 text-slate-350 hover:text-white text-xs font-bold rounded-xl transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={capturePhoto}
                    className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-blue-900/20 active:scale-95"
                  >
                    <Camera size={14} />
                    <span>Tirar Foto</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {showAiGenerator && (
            <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
              <div className="bg-white rounded-3xl max-w-sm w-full max-h-[90vh] overflow-y-auto shadow-2xl animate-in zoom-in-95 duration-200 border border-slate-100">
                <div className="p-5 bg-blue-900 text-white flex items-center justify-between border-b-2 border-[#D4AF37]/50">
                  <h4 className="font-bold flex items-center gap-2 text-sm">
                    <Sparkles className="text-amber-400 stroke-[2.5]" size={16} />
                    <span>Conceito Visual por IA</span>
                  </h4>
                  <button 
                    type="button" 
                    onClick={() => setShowAiGenerator(false)} 
                    className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  <div className="space-y-1 text-left">
                    <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Artigo Selecionado</label>
                    <p className="text-xs font-bold text-slate-850 bg-slate-50 p-2.5 rounded-xl border border-slate-100 line-clamp-2">
                      {newProduct.name || <span className="text-slate-400 italic">Nenhum nome preenchido...</span>}
                    </p>
                  </div>

                  <div className="space-y-1.5 text-left">
                    <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider">País de Destino / Localização</label>
                    <p className="text-[10px] text-slate-500 mb-1 leading-normal">
                      A IA adaptará o rótulo de embalagem, símbolos de qualidade e design nacional de acordo com o país escolhido.
                    </p>
                    <select
                      value={aiCountrySelection}
                      onChange={e => setAiCountrySelection(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none text-xs font-bold tracking-wide transition-all bg-white text-slate-850"
                    >
                      <option value="Moçambique 🇲🇿">Moçambique 🇲🇿</option>
                      <option value="Angola 🇦🇴">Angola 🇦🇴</option>
                      <option value="Portugal 🇵🇹">Portugal 🇵🇹</option>
                      <option value="Brasil 🇧🇷">Brasil 🇧🇷</option>
                      <option value="África do Sul 🇿🇦">África do Sul 🇿🇦</option>
                      <option value="Cabo Verde 🇨🇻">Cabo Verde 🇨🇻</option>
                      <option value="Guiné-Bissau 🇬🇼">Guiné-Bissau 🇬🇼</option>
                      <option value="São Tomé e Príncipe 🇸🇹">São Tomé e Príncipe 🇸🇹</option>
                      <option value="Geral (Design Neutro) 🌍">Geral (Design Neutro) 🌍</option>
                    </select>
                  </div>
                </div>
                <div className="p-5 bg-slate-50 border-t border-slate-100 flex justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAiGenerator(false)}
                    className="flex-1 py-2 px-4 bg-white border border-slate-250 hover:bg-slate-55 text-slate-600 text-xs font-bold rounded-xl transition-all"
                  >
                    Fechar
                  </button>
                  <button
                    type="button"
                    onClick={generateAiProductImage}
                    disabled={isGeneratingAiImage || !newProduct.name || !newProduct.name.trim()}
                    className="flex-1 py-2 px-4 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-amber-400 disabled:shadow-none text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-md active:scale-95"
                  >
                    {isGeneratingAiImage ? (
                      <>
                        <Loader2 className="animate-spin text-amber-400" size={14} />
                        <span>Gerando...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={14} />
                        <span>Gerar Rótulo</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'list' && !isCreating && !editingProduct && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="space-y-2.5"
        >
          {viewMode === 'compact' ? (
        <div className="bg-white rounded-xl border border-slate-150 overflow-hidden shadow-sm">
          <div className="overflow-x-auto min-w-full">
            <table className="min-w-full font-sans text-left font-sans">
              <thead className="bg-slate-50 text-[9px] font-black text-slate-400 uppercase tracking-wider select-none border-b border-slate-150">
                <tr>
                  <th scope="col" className="py-1.5 px-3 w-9">
                    <input
                      type="checkbox"
                      checked={paginatedProducts.length > 0 && paginatedProducts.every(p => selectedIds.includes(p.id))}
                      onChange={() => {
                        const pageIds = paginatedProducts.map(p => p.id);
                        const allSelected = pageIds.every(id => selectedIds.includes(id));
                        setSelectedIds(prev => allSelected ? prev.filter(id => !pageIds.includes(id)) : Array.from(new Set([...prev, ...pageIds])));
                      }}
                      className="w-3.5 h-3.5 rounded border-slate-300 cursor-pointer"
                    />
                  </th>
                  <th scope="col" className="py-1.5 px-2 w-20">Código</th>
                  <th scope="col" className="py-1.5 px-3 min-w-[200px]">Produto</th>
                  <th scope="col" className="py-1.5 px-2 w-24">Categoria</th>
                  <th scope="col" className="py-1.5 px-2 w-24 text-right">Custo Médio</th>
                  <th scope="col" className="py-1.5 px-2 w-24 text-right">Preço Venda</th>
                  <th scope="col" className="py-1.5 px-2 w-20 text-center">Estoque</th>
                  <th scope="col" className="py-1.5 px-2 w-16 text-center">Est. Mín.</th>
                  <th scope="col" className="py-1.5 px-2 w-28 text-right">Valor Total</th>
                  <th scope="col" className="py-1.5 px-2 w-24 text-center">Status</th>
                  <th scope="col" className="py-1.5 px-3 w-28 text-center">Ações</th>
                </tr>
              </thead>
              <tbody data-no-translate="true" className="bg-white no-translate">
                {paginatedProducts.map((product, idx) => {
                  const isSelected = selectedIds.includes(product.id);
                  const lowThreshold = product.lowStockThreshold || 5;
                  const isLowStock = product.stockLevel > 0 && product.stockLevel <= lowThreshold;
                  const isCritical = product.stockLevel > 0 && product.stockLevel <= Math.max(1, Math.floor(lowThreshold / 2));
                  const isOut = product.stockLevel <= 0;
                  const rowCode = `PROD-${String(startIndex + idx + 1).padStart(3, '0')}`;
                  const rowValorTotal = (product.stockLevel || 0) * (product.costPrice || product.price || 0);

                  return (
                    <tr
                      key={product.id}
                      onClick={() => setViewingProduct(product)}
                      className={cn(
                        "group transition-colors cursor-pointer text-[11px]",
                        isSelected ? "bg-blue-50/60 hover:bg-blue-50" : idx % 2 === 1 ? "bg-slate-50/60 hover:bg-blue-50/40" : "bg-white hover:bg-blue-50/40"
                      )}
                    >
                      {/* Checkbox */}
                      <td className="py-1.5 px-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(product.id)}
                          className="w-3.5 h-3.5 rounded border-slate-300 cursor-pointer"
                        />
                      </td>

                      {/* Código */}
                      <td className="py-1.5 px-2 font-mono text-slate-400 font-bold whitespace-nowrap">{rowCode}</td>

                      {/* Name and SKU */}
                      <td className="py-1.5 px-3">
                        <div className="leading-tight">
                          <p className="font-bold text-slate-950 font-sans group-hover:text-blue-600 transition-colors flex items-center gap-1.5 flex-wrap leading-tight truncate">
                            {product.name}
                            {(() => {
                              const stats = getProductExpiryStats(product);
                              return getExpiryDot(stats);
                            })()}
                            {product.promotionActive && (
                              <span className="bg-amber-500 text-white font-black text-[7.5px] px-1 py-0.5 rounded leading-none shrink-0 uppercase tracking-wider">PROMO</span>
                            )}
                          </p>
                          {product.sku && <span className="text-[9.5px] text-slate-400 font-mono">SKU: {product.sku}</span>}
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-1.5 px-2 text-slate-500 font-semibold whitespace-nowrap">{product.category || '—'}</td>

                      {/* Custo Médio */}
                      <td className="py-1.5 px-2 text-right font-mono text-slate-500 whitespace-nowrap">
                        {product.costPrice > 0 ? `${Number(product.costPrice).toLocaleString()} ${currency}` : '—'}
                      </td>

                      {/* Selling price */}
                      <td className="py-1.5 px-2 text-right font-bold text-blue-600 font-mono whitespace-nowrap">
                        {product.price > 0 ? `${Number(product.price).toLocaleString()} ${currency}` : (
                          <span className="text-rose-600 text-[9.5px] font-black uppercase" title="Nenhum preço de venda definido">Sem preço</span>
                        )}
                      </td>

                      {/* Stock */}
                      <td className="py-1.5 px-2 text-center font-mono font-bold text-slate-700 whitespace-nowrap">
                        {product.stockLevel} <span className="text-slate-400 font-semibold">{product.baseUnitLabel || 'Un'}</span>
                      </td>

                      {/* Estoque Mínimo */}
                      <td className="py-1.5 px-2 text-center font-mono text-slate-400 whitespace-nowrap">{lowThreshold}</td>

                      {/* Valor Total */}
                      <td className="py-1.5 px-2 text-right font-mono font-semibold text-slate-600 whitespace-nowrap">
                        {rowValorTotal.toLocaleString()} {currency}
                      </td>

                      {/* Status */}
                      <td className="py-1.5 px-2 text-center">
                        <span className={cn(
                          "inline-block px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide whitespace-nowrap",
                          isOut ? "bg-rose-50 text-rose-700 border border-rose-150" :
                          isCritical ? "bg-rose-50 text-rose-600 border border-rose-150" :
                          isLowStock ? "bg-amber-50 text-amber-700 border border-amber-150" :
                          "bg-emerald-50 text-emerald-700 border border-emerald-150"
                        )}>
                          {isOut ? 'Sem Stock' : isCritical ? 'Estoque Crítico' : isLowStock ? 'Estoque Baixo' : 'Em Estoque'}
                        </span>
                      </td>

                      {/* Row actions */}
                      <td className="py-1.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setViewingProduct(product)}
                            className="p-1 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-md transition-colors cursor-pointer"
                            title="Ver Ficha de Detalhes"
                          >
                            <FileText size={11} />
                          </button>
                          <button
                            onClick={() => openProductEditor(product)}
                            className="p-1 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-md transition-colors cursor-pointer"
                            title="Editar Artigo"
                          >
                            <Edit2 size={11} />
                          </button>
                          <div className="relative" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => setOpenRowMenuId(openRowMenuId === product.id ? null : product.id)}
                              className="p-1 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-md transition-colors cursor-pointer"
                              title="Mais ações"
                            >
                              <MoreHorizontal size={11} />
                            </button>
                            {openRowMenuId === product.id && (
                              <div className="absolute z-20 top-full mt-1 right-0 w-44 bg-white border border-slate-150 rounded-lg shadow-lg py-1 text-[11px] font-bold text-slate-700">
                                <button
                                  type="button"
                                  onClick={() => { handleDuplicateProduct(product); setOpenRowMenuId(null); }}
                                  className="w-full text-left px-3 py-1.5 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5"
                                >
                                  <Copy size={11} /> Duplicar
                                </button>
                                {!product.barcode && (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const businessId = profile?.businessId;
                                      if (!businessId) {
                                        toast.error("Erro: ID da empresa não detetado.");
                                        return;
                                      }
                                      const generated = 'SAB-' + Math.floor(Math.random() * 9000000000 + 1000000000).toString();
                                      try {
                                        const { updateDoc, doc } = await import('firebase/firestore');
                                        const prodRef = doc(db, `businesses/${businessId}/products`, product.id);
                                        await updateDoc(prodRef, { barcode: generated });
                                        toast.success(`Código de barras ${generated} gerado e salvo!`);
                                      } catch (err) {
                                        toast.error("Erro ao gerar código de barras.");
                                      }
                                      setOpenRowMenuId(null);
                                    }}
                                    className="w-full text-left px-3 py-1.5 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5"
                                  >
                                    <Barcode size={11} /> Gerar Código de Barras
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => { handleDeleteProduct(product.id, product.name); setOpenRowMenuId(null); }}
                                  className="w-full text-left px-3 py-1.5 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5 text-rose-600"
                                >
                                  <Trash2 size={11} /> Eliminar
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredProducts.length === 0 && !loading && (
            <div className="py-20 text-center text-slate-500 bg-white">
              <Package size={64} className="mx-auto mb-4 opacity-5" />
              <p className="text-lg font-medium font-sans text-slate-900">Nenhum produto corresponde à sua pesquisa.</p>
              <p className="text-sm font-sans text-slate-500 mt-1">Tente pesquisar com palavras-chave diferentes ou mude o filtro de categoria.</p>
            </div>
          )}
        </div>
      ) : (
        <div data-no-translate="true" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 no-translate">
          {paginatedProducts.map((product) => (
            <div 
              key={product.id} 
              onClick={() => setViewingProduct(product)}
              className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group cursor-pointer relative"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-14 h-14 bg-slate-50 border border-slate-100 rounded-2xl relative overflow-hidden flex items-center justify-center text-blue-600 shrink-0 shadow-inner">
                  {product.imageUrl ? (
                    <img 
                      src={product.imageUrl} 
                      alt={product.name} 
                      className="w-full h-full object-cover" 
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <Package size={24} className="stroke-[2]" />
                  )}
                  {product.availableOnline && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg animate-in zoom-in-50 duration-300" title="Listed in Online Store">
                      <ShoppingBag size={10} />
                    </div>
                  )}
                </div>
              </div>
              
              <div className="space-y-1.5 mb-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-bold text-slate-900 flex items-center gap-1.5 truncate flex-1" title={product.name}>
                    {product.name}
                    {(() => {
                      const stats = getProductExpiryStats(product);
                      return getExpiryDot(stats);
                    })()}
                    {product.promotionActive && (
                      <span className="bg-amber-500 text-white font-black text-[8px] px-1.5 py-0.5 rounded leading-none shrink-0 uppercase tracking-wider">PROMOÇÃO ACTIVA</span>
                    )}
                  </h3>
                  <span className={cn(
                    "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider whitespace-nowrap shrink-0 shadow-sm border font-mono",
                    product.stockLevel <= 0 ? "bg-rose-50 border-rose-150 text-rose-700" :
                    product.stockLevel <= (product.lowStockThreshold || 5) ? "bg-amber-50 border-amber-150 text-amber-700 animate-pulse" :
                    "bg-emerald-50 border-emerald-150 text-emerald-800"
                  )}>
                    {product.stockLevel} {product.baseUnitLabel || 'Un'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  {product.supplier && (
                    <>
                      <Users size={12} />
                      <span>{product.supplier}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Visual Stock Level Indicator */}
              <div className="mb-4 space-y-1">
                <div className="flex justify-between items-center text-[10px] font-extrabold uppercase tracking-wider">
                  <span className="text-slate-400">Stock Único (Loja & Online)</span>
                  <span className={cn(
                    product.stockLevel <= (product.lowStockThreshold || 5) ? "text-rose-500" : 
                    product.stockLevel <= (product.lowStockThreshold || 5) * 1.5 ? "text-amber-500" : "text-emerald-500"
                  )}>
                    {product.stockLevel === 0 ? "Sem Stock" : 
                     product.stockLevel <= (product.lowStockThreshold || 5) ? "Baixo" : "Adequado"}
                  </span>
                </div>
                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      product.stockLevel === 0 ? "w-0" :
                      product.stockLevel <= (product.lowStockThreshold || 5) ? "bg-rose-500" :
                      product.stockLevel <= (product.lowStockThreshold || 5) * 1.5 ? "bg-amber-500" : "bg-emerald-500"
                    )}
                    style={{ 
                      width: `${Math.min((product.stockLevel / Math.max((product.lowStockThreshold || 5) * 2, 10, product.stockLevel)) * 100, 100)}%` 
                    }}
                  />
                </div>
              </div>

              {/* Detailed Unit Stock Breakdown (Cx, Emb, Un) */}
              <div className="mt-2.5 p-2 bg-slate-50/70 border border-slate-100 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between text-[10px] font-black uppercase text-slate-500 tracking-wider">
                  <span>📦 Stock Físico Gravado:</span>
                  <span className="text-slate-400 font-mono text-[9px]">Breakdown</span>
                </div>
                <div className="flex gap-2 justify-center">
                  <div className="flex-1 bg-emerald-50 border border-emerald-150/40 py-1 px-1.5 rounded-lg text-center">
                    <span className="block text-[8px] font-extrabold text-emerald-700 uppercase">Cx</span>
                    <span className="font-black text-[11px] text-emerald-900">{product.stockCx !== undefined ? product.stockCx : 0}</span>
                  </div>
                  <div className="flex-1 bg-blue-50 border border-blue-150/40 py-1 px-1.5 rounded-lg text-center">
                    <span className="block text-[8px] font-extrabold text-blue-700 uppercase">Emb</span>
                    <span className="font-black text-[11px] text-blue-900">{product.stockEmb !== undefined ? product.stockEmb : 0}</span>
                  </div>
                  <div className="flex-1 bg-purple-50 border border-purple-150/40 py-1 px-1.5 rounded-lg text-center">
                    <span className="block text-[8px] font-extrabold text-purple-700 uppercase">Un</span>
                    <span className="font-black text-[11px] text-purple-900">{product.stockUn !== undefined ? product.stockUn : 0}</span>
                  </div>
                </div>
              </div>

              {product.hasMultiUnits && (
                <div className="mt-2.5 p-2 bg-slate-50 border border-slate-100 rounded-xl space-y-1 text-[10px] font-medium text-slate-600">
                  <p className="font-extrabold text-slate-400 uppercase text-[9px] tracking-wider mb-0.5">🏷️ Tabelas de Preço de Venda / Compra por Embalagem:</p>
                  {product.hasBoxUnit && (
                    <div className="space-y-0.5 border-b pb-1 mb-1 border-slate-100">
                      <div className="flex justify-between font-bold text-slate-800">
                        <span>📦 {product.boxUnitName || 'Caixa'} ({product.boxUnitQty || 10} {product.baseUnitLabel || 'un'}):</span>
                        <span>{(product.boxUnitPrice || 0).toLocaleString()} {currency}</span>
                      </div>
                      {product.boxUnitCostPrice > 0 && (
                        <div className="flex justify-between text-[9px] text-slate-400">
                          <span>Preço de Custo (Compra):</span>
                          <span>{(product.boxUnitCostPrice || 0).toLocaleString()} {currency}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {product.hasPackUnit && (
                    <div className="space-y-0.5">
                      <div className="flex justify-between font-bold text-slate-800">
                        <span>🎁 {product.packUnitName || 'Embalagem'} ({product.packUnitQty || 100} {product.baseUnitLabel || 'un'}):</span>
                        <span>{(product.packUnitPrice || 0).toLocaleString()} {currency}</span>
                      </div>
                      {product.packUnitCostPrice > 0 && (
                        <div className="flex justify-between text-[9px] text-slate-400">
                          <span>Preço de Custo (Compra):</span>
                          <span>{(product.packUnitCostPrice || 0).toLocaleString()} {currency}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 pt-4 border-t border-slate-100 text-xs">
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Stock Coeso (Único)</span>
                  <div className="flex items-center gap-1.5 font-sans">
                    <span className={cn(
                      "text-base font-black",
                      product.stockLevel <= (product.lowStockThreshold || 5) ? "text-rose-500" : "text-slate-950"
                    )}>
                      {product.stockLevel}
                    </span>
                    {product.stockLevel <= (product.lowStockThreshold || 5) && (
                      <AlertTriangle size={14} className="text-rose-500 flex-shrink-0 animate-pulse" />
                    )}
                  </div>
                </div>
                <div className="text-right space-y-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Preço de Venda</span>
                  <p className="text-base font-black text-blue-600">{(product.price || 0).toLocaleString()} {currency}</p>
                  {product.tieredPrices && product.tieredPrices.length > 0 && (
                    <p className="text-[9px] font-extrabold uppercase text-indigo-600 tracking-tighter mt-0.5" title="Preços especiais por escalão de quantidade">
                      🏷️ {product.tieredPrices.length} Escalões
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-dashed border-slate-100 flex items-center justify-between text-[11px] font-semibold text-slate-500">
                <div className="flex items-center gap-1">
                  <span className="text-slate-400 font-medium">Preço de Custo:</span>
                  <span className="font-bold text-slate-700">{(product.costPrice || 0).toLocaleString()} {currency}</span>
                </div>
                {product.price > 0 && product.costPrice > 0 ? (
                  <div className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-black text-[10px] uppercase tracking-wider">
                    Margem: {Math.max(0, Math.round(((product.price - product.costPrice) / product.price) * 100))}%
                  </div>
                ) : (
                  <span className="text-[10px] font-bold text-slate-400 italic">Sem margem</span>
                )}
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setViewingProduct(product);
                }}
                className="w-full mt-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200/50 text-[10.5px] font-black uppercase tracking-wider text-slate-500 hover:text-slate-850 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer font-sans"
              >
                <FileText size={12} />
                Visualizar Ficha de Artigo
              </button>
            </div>
          ))}
          
          {filteredProducts.length === 0 && !loading && (
            <div className="col-span-full py-20 text-center text-slate-500">
              <Package size={64} className="mx-auto mb-4 opacity-5" />
              <p className="text-lg font-medium">No products match your search.</p>
              <p className="text-sm">Try using different keywords or add a new product.</p>
            </div>
          )}
        </div>
      )}

          {/* Pagination Controls */}
          {filteredProducts.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-slate-100 mt-4 select-none">
              <div className="text-xs font-semibold text-slate-500 font-sans">
                Mostrando <span className="font-extrabold text-slate-900">{Math.min(filteredProducts.length, startIndex + 1)}</span> a{" "}
                <span className="font-extrabold text-slate-900">{Math.min(filteredProducts.length, endIndex)}</span> de{" "}
                <span className="font-extrabold text-[#111111]">{filteredProducts.length}</span> artigos
              </div>
              <div className="flex items-center gap-1.5 self-end sm:self-auto">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  className="px-3 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed bg-white"
                >
                  Anterior
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, Math.ceil(filteredProducts.length / itemsPerPage)) }, (_, i) => {
                    const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
                    let pageNum = currentPage;
                    if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    if (pageNum < 1 || pageNum > totalPages) return null;
                    return (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => setCurrentPage(pageNum)}
                        className={cn(
                          "w-8 h-8 flex items-center justify-center text-xs font-bold rounded-lg transition-all cursor-pointer",
                          currentPage === pageNum ? "bg-slate-900 text-white shadow-sm" : "border border-slate-200 hover:bg-slate-50 text-slate-600 bg-white"
                        )}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  disabled={currentPage === Math.ceil(filteredProducts.length / itemsPerPage)}
                  onClick={() => setCurrentPage(prev => Math.min(Math.ceil(filteredProducts.length / itemsPerPage), prev + 1))}
                  className="px-3 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed bg-white"
                >
                  Próximo
                </button>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {activeTab === 'quebras' && !isCreating && !editingProduct && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          className="space-y-6"
        >
          {/* Bento Stats Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-105 shadow-sm flex items-center gap-4 text-left">
              <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
                <AlertTriangle size={24} />
              </div>
              <div>
                <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider font-sans">Ocorrências / Registos</span>
                <p className="text-2xl font-black text-slate-900 leading-none mt-1 font-mono">{quebras.length}</p>
                <p className="text-[10.5px] text-slate-500 mt-1 font-sans">Total de entradas de quebra</p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-105 shadow-sm flex items-center gap-4 text-left">
              <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
                <Package size={24} />
              </div>
              <div>
                <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider font-sans">Perdas Registadas</span>
                <p className="text-xl font-black text-slate-905 leading-none mt-1 font-mono">
                  {quebras.reduce((sum, item) => sum + (item.unit === 'cx' ? item.qty : 0), 0)} Cx / {quebras.reduce((sum, item) => sum + (item.unit === 'un' ? item.qty : 0), 0)} Un
                </p>
                <p className="text-[10.5px] text-slate-500 mt-1 font-sans">Além de {quebras.reduce((sum, item) => sum + (item.unit === 'emb' ? item.qty : 0), 0)} embalagens</p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-105 shadow-sm flex items-center gap-4 text-left font-sans">
              <div className="p-3 bg-red-50 text-red-650 rounded-xl shadow-sm">
                <Sliders size={24} />
              </div>
              <div>
                <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider font-sans">Causa Mais Comum</span>
                <p className="text-[13.5px] font-black text-slate-900 leading-none mt-1.5 line-clamp-1">
                  {(() => {
                    const reasonCounts = quebras.reduce((acc, item) => {
                      acc[item.reason] = (acc[item.reason] || 0) + 1;
                      return acc;
                    }, {} as Record<string, number>);
                    const mostCommonReasonKey = Object.keys(reasonCounts).reduce((a, b) => reasonCounts[a] > reasonCounts[b] ? a : b, '');
                    const reasonNames: Record<string, string> = {
                      expired: "Expirado / Fora Prazo",
                      broken: "Partido / Danificado",
                      uncaped: "Aberto / Sem Tampa",
                      'half-filled': "Meio Cheio / Incompleto",
                      defective: "Defeito de Fabrico",
                      other: "Outro Motivo"
                    };
                    return mostCommonReasonKey ? (reasonNames[mostCommonReasonKey] || mostCommonReasonKey) : 'Lista vazia';
                  })()}
                </p>
                <p className="text-[10.5px] text-slate-500 mt-1">Análise dinâmica em tempo real</p>
              </div>
            </div>
          </div>

          {/* Main Two Column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Form Column */}
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-white p-6 rounded-[24px] border border-slate-200 shadow-md">
                <h3 className="text-base font-black text-slate-900 tracking-tight mb-4 flex items-center gap-2">
                  <span className="p-1 px-2 text-[10.5px] bg-rose-50 text-rose-600 rounded-lg font-black uppercase tracking-wider font-sans">Registo</span>
                  Registar Nova Quebra
                </h3>

                <form onSubmit={handleRecordQuebra} className="space-y-4 text-left font-sans">
                  {/* Step 1: Product Selection */}
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-black tracking-wider text-slate-400">1. Selecionar Artigo</label>
                    
                    {!selectedQuebraProduct ? (
                      <div className="space-y-2">
                        <div className="relative">
                          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            placeholder="Procurar por SKU, barras ou nome do produto..."
                            value={stockSearchQuery}
                            onChange={(e) => setStockSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none text-xs transition-all placeholder:text-slate-400 font-sans font-medium"
                          />
                        </div>

                        {stockSearchQuery.trim() !== '' && (
                          <div className="max-h-48 overflow-y-auto border border-slate-100 rounded-xl bg-slate-50/50 p-1 divide-y divide-slate-100/60 shadow-inner">
                            {products
                              .filter(p => p.name.toLowerCase().includes(stockSearchQuery.toLowerCase()) || (p.sku || '').toLowerCase().includes(stockSearchQuery.toLowerCase()) || (p.barcode || '').toLowerCase().includes(stockSearchQuery.toLowerCase()))
                              .slice(0, 5)
                              .map(p => (
                                <button
                                  type="button"
                                  key={p.id}
                                  onClick={() => {
                                    setSelectedQuebraProduct(p);
                                    setStockSearchQuery('');
                                    setQuebraUnit('un');
                                  }}
                                  className="w-full text-left p-2.5 rounded-lg hover:bg-white hover:shadow-sm text-xs font-semibold text-slate-700 transition-all flex items-center justify-between gap-2 cursor-pointer"
                                >
                                  <div>
                                    <p data-no-translate="true" translate="no" className="font-bold text-slate-800 line-clamp-1 no-translate notranslate">{p.name}</p>
                                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">SKU: {p.sku || 'N/D'}</p>
                                  </div>
                                  <span className="px-2 py-0.5 rounded-md bg-slate-150 text-[10px] font-extrabold text-slate-600 font-mono">
                                    Stock: {p.stockLevel || 0}
                                  </span>
                                </button>
                              ))}
                            {products.filter(p => p.name.toLowerCase().includes(stockSearchQuery.toLowerCase()) || (p.sku || '').toLowerCase().includes(stockSearchQuery.toLowerCase())).length === 0 && (
                              <p className="text-center py-4 text-xs text-slate-400 italic font-medium">Nenhum artigo encontrado</p>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="relative p-3.5 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between gap-3 animate-in fade-in-50">
                        <div className="space-y-0.5">
                          <span className="text-[8px] uppercase font-black text-rose-500 tracking-widest font-mono">Artigo Selecionado</span>
                          <p className="text-xs font-bold text-slate-800 line-clamp-1">{selectedQuebraProduct.name}</p>
                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-slate-500 font-medium whitespace-nowrap pt-1 font-sans">
                            <span>SKU: <strong className="font-bold text-slate-700 font-mono">{selectedQuebraProduct.sku || 'N/D'}</strong></span>
                            <span>Stock Atual: 
                              <strong className="font-extrabold text-rose-600 font-mono ml-1">
                                {selectedQuebraProduct.hasMultiUnits 
                                  ? `${selectedQuebraProduct.stockCx || 0} ${selectedQuebraProduct.boxUnitLabel || 'Cx'}, ${selectedQuebraProduct.stockEmb || 0} ${selectedQuebraProduct.packUnitLabel || 'Emb'}, ${selectedQuebraProduct.stockUn || 0} ${selectedQuebraProduct.baseUnitLabel || 'Un'}`
                                  : `${selectedQuebraProduct.stockLevel || 0} un`
                                }
                              </strong>
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedQuebraProduct(null)}
                          className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-[10px] font-black text-slate-500 hover:text-slate-800 border rounded-lg transition-all cursor-pointer shadow-sm select-none"
                        >
                          Alterar
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Step 2: Spoil Quantity and Unit Selection */}
                  {selectedQuebraProduct && (
                    <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
                      <div className="grid grid-cols-2 gap-3.5">
                        
                        {/* Quantity input */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] uppercase font-black tracking-wider text-slate-400">2. Quantidade</label>
                          <input
                            type="number"
                            min="1"
                            step="any"
                            placeholder="Qtd."
                            value={quebraQty}
                            onChange={(e) => setQuebraQty(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none text-xs transition-all font-mono font-bold"
                            required
                          />
                        </div>

                        {/* Unit selector buttons */}
                        <div className="space-y-1.5 text-left">
                          <label className="text-[10px] uppercase font-black tracking-wider text-slate-400">3. Unidade Física</label>
                          <div className="grid grid-cols-3 gap-1 bg-slate-100 p-0.5 rounded-xl border border-slate-200/50">
                            <button
                              type="button"
                              onClick={() => setQuebraUnit('un')}
                              className={cn(
                                "py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer border-transparent",
                                quebraUnit === 'un' ? "bg-white text-rose-600 shadow-sm" : "text-slate-500 hover:text-slate-800"
                              )}
                            >
                              {selectedQuebraProduct.baseUnitLabel || 'Un'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (!selectedQuebraProduct.hasMultiUnits) {
                                  toast("Este artigo não possui unidades de caixas associadas.");
                                  return;
                                }
                                setQuebraUnit('cx');
                              }}
                              className={cn(
                                "py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer border-transparent",
                                quebraUnit === 'cx' ? "bg-white text-rose-600 shadow-sm" : "text-slate-500 hover:text-slate-850",
                                !selectedQuebraProduct.hasMultiUnits && "opacity-30 cursor-not-allowed"
                              )}
                              title={!selectedQuebraProduct.hasMultiUnits ? "Múltiplas unidades desativadas" : ""}
                            >
                              {selectedQuebraProduct.boxUnitLabel || 'Cx'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (!selectedQuebraProduct.hasMultiUnits || !selectedQuebraProduct.hasPackUnit) {
                                  toast("Este artigo não possui unidades de embalagens associadas.");
                                  return;
                                }
                                setQuebraUnit('emb');
                              }}
                              className={cn(
                                "py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer border-transparent",
                                quebraUnit === 'emb' ? "bg-white text-rose-600 shadow-sm" : "text-slate-500 hover:text-slate-850",
                                (!selectedQuebraProduct.hasMultiUnits || !selectedQuebraProduct.hasPackUnit) && "opacity-30 cursor-not-allowed"
                              )}
                              title={(!selectedQuebraProduct.hasMultiUnits || !selectedQuebraProduct.hasPackUnit) ? "Embalagem desativada" : ""}
                            >
                              {selectedQuebraProduct.packUnitLabel || 'Emb'}
                            </button>
                          </div>
                        </div>

                      </div>

                      {/* Reason choices */}
                      <div className="space-y-1.5 text-left">
                        <label className="text-[10px] uppercase font-black tracking-wider text-slate-400">4. Motivo da Ocorrência</label>
                        <select
                          value={quebraReason}
                          onChange={(e) => setQuebraReason(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none text-xs tracking-wide transition-all bg-white font-black text-slate-850"
                        >
                          <option value="broken">💥 Partido / Quebrado / Danificado</option>
                          <option value="expired">⏰ Fora de Prazo / Expirado</option>
                          <option value="uncaped">🧴 Aberto / Sem Tampa</option>
                          <option value="half-filled">🥤 Meio Cheio / Volume Incompleto</option>
                          <option value="defective">🛠️ Defeito de Fabrico</option>
                          <option value="other">📝 Outro / Outras Razões</option>
                        </select>
                      </div>

                      {/* Notes area */}
                      <div className="space-y-1.5 text-left">
                        <label className="text-[10px] uppercase font-black tracking-wider text-slate-400">5. Notas de Auditoria / Observações</label>
                        <textarea
                          placeholder="Falsa tiragem, quebra espontânea, acidente operacional..."
                          value={quebraNotes}
                          onChange={(e) => setQuebraNotes(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none text-xs transition-all h-20 font-sans"
                        />
                      </div>

                      {/* Submit action */}
                      <button
                        type="submit"
                        disabled={isRecordingQuebra}
                        className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-md shadow-rose-200 active:scale-[0.98] cursor-pointer"
                      >
                        {isRecordingQuebra ? (
                          <>
                            <Loader2 size={13} className="animate-spin" />
                            A Gravar Registo...
                          </>
                        ) : (
                          <>
                            <AlertTriangle size={13} />
                            Gravar Registo de Quebra
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </form>
              </div>
            </div>

            {/* History logs list */}
            <div className="lg:col-span-7 space-y-4">
              <div className="bg-white p-5 rounded-[24px] border border-slate-200">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <h3 className="text-sm font-black text-slate-900 tracking-tight flex items-center gap-1.5">
                    📋 Histórico de Quebras & Perdas
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-[10px] font-bold text-slate-600 font-mono">
                      {filteredQuebras.length}
                    </span>
                  </h3>

                  {/* Filter row */}
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="relative flex-1 sm:flex-initial">
                      <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Pesquisar..."
                        value={quebrasSearch}
                        onChange={(e) => setQuebrasSearch(e.target.value)}
                        className="w-full sm:w-36 pl-8 pr-2.5 py-1.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-500 outline-none text-[10.5px] transition-all font-sans font-medium"
                      />
                    </div>
                    <select
                      value={quebrasReasonFilter}
                      onChange={(e) => setQuebrasReasonFilter(e.target.value)}
                      className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-[10.5px] font-black text-slate-655 bg-white outline-none"
                    >
                      <option value="all">Filtro: Todos</option>
                      <option value="broken">💥 Partido / Quebrado</option>
                      <option value="expired">⏰ Expirado</option>
                      <option value="uncaped">🧴 Aberto / Sem Tampa</option>
                      <option value="half-filled">🥤 Meio Cheio</option>
                      <option value="defective">🛠️ Defeito</option>
                      <option value="other">📝 Outro</option>
                    </select>
                  </div>
                </div>

                <div className="divide-y divide-slate-100/60 max-h-[500px] overflow-y-auto pr-1">
                  {filteredQuebras.map((item) => (
                    <div key={item.id} className="py-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3 group">
                      <div className="space-y-1.5 text-left font-sans">
                        {/* Name and unit loss info */}
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-xs font-black text-slate-900 tracking-tight leading-tight line-clamp-1">{item.productName}</p>
                          <span className={cn(
                            "px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-wider flex items-center gap-0.5",
                            getReasonBadgeClass(item.reason)
                          )}>
                            {getReasonLabel(item.reason)}
                          </span>
                        </div>

                        {/* Reported by & Date information */}
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-slate-400 font-semibold">
                          <span className="flex items-center gap-0.5">
                            <Users size={10} className="text-slate-350" />
                            {item.reportedBy || 'Utilizador'}
                          </span>
                          <span className="text-slate-200">•</span>
                          <span>
                            {item.createdAt 
                              ? new Date((item.createdAt as any).seconds * 1000).toLocaleString('pt-PT', {
                                  day: '2-digit', month: '2-digit', year: 'numeric',
                                  hour: '2-digit', minute: '2-digit'
                                })
                              : 'Agora mesmo'
                            }
                          </span>
                        </div>

                        {/* Internal notes */}
                        {item.notes && (
                          <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 max-w-md">
                            <p className="text-[10px] italic text-slate-600 leading-relaxed font-semibold">
                              💡 OBS: {item.notes}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Right column: count indicator & action to revert */}
                      <div className="flex items-center sm:flex-col sm:items-end justify-between sm:justify-start gap-3.5 self-stretch sm:self-auto select-none">
                        <div className="px-3 py-1 bg-red-50 text-red-650 rounded-full border border-red-105 font-bold font-mono text-[11.5px] uppercase tracking-wide flex items-center gap-1 leading-none shadow-sm h-6">
                          <span>-{item.qty}</span>
                          <span className="text-[8.5px] uppercase font-black tracking-widest">{item.unit}</span>
                        </div>
                        
                        <button
                          type="button"
                          onClick={() => handleDeleteQuebra(item.id, item)}
                          className="p-1 px-2 text-[9.5px] font-black uppercase text-slate-400 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200 border border-transparent rounded-lg transition-all flex items-center gap-1 cursor-pointer select-none"
                          title="Reverter registo de quebra e repor stock original"
                        >
                          <Trash2 size={11} className="text-slate-400 hover:text-rose-600 transition-colors" />
                          <span>Reverter</span>
                        </button>
                      </div>
                    </div>
                  ))}

                  {filteredQuebras.length === 0 && (
                    <div className="py-14 text-center text-slate-400 font-sans">
                      <AlertTriangle size={36} className="mx-auto mb-2.5 opacity-20 text-rose-500" />
                      <p className="text-xs font-black text-slate-800">Sem registos de quebra encontrados.</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">Use o painel ao lado para registar perdas.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        </motion.div>
      )}

      {activeTab === 'etiquetas' && !isCreating && !editingProduct && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          className="space-y-6 animate-fade-in"
        >
          {/* Bento Header Callout */}
          <div className="bg-[#0B1F4D] text-white rounded-3xl p-6 relative overflow-hidden shadow-xl border border-[#0B1F4D]">
            <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 blur-3xl rounded-full translate-x-20 -translate-y-20" />
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1 text-left font-sans">
                <span className="text-[10px] uppercase font-black bg-indigo-600/30 text-indigo-200 border border-indigo-500/20 px-2.5 py-0.5 rounded-full tracking-widest font-mono">
                  Painel de Produtividade do Negócio
                </span>
                <h3 className="text-xl font-black tracking-tight text-white mt-1.5 flex items-center gap-2">
                  <Tag className="text-indigo-400" size={20} />
                  Gerador de Etiquetas de Preços & Código de Barras
                </h3>
                <p className="text-xs text-slate-405 max-w-xl font-medium leading-relaxed text-slate-400">
                  Crie e personalize etiquetas físicas de alta definição para as suas prateleiras, roupas, joias ou mercearia. Escolha o modelo, configure as informações visíveis, defina as cópias e imprima ou descarregue a folha perfeitamente alinhada.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (products.length > 0) {
                      setPrintQueue(products.map(p => ({ product: p, count: 1 })));
                      toast.success("Todos os artigos do inventário foram adicionados à fila!");
                    } else {
                      toast.error("Nenhum artigo encontrado no inventário.");
                    }
                  }}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-xl text-xs font-black uppercase tracking-wider transition-all select-none cursor-pointer active:scale-95"
                >
                  Adicionar Tudo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPrintQueue([]);
                    toast.success("Fila de impressão limpa!");
                  }}
                  className="px-4 py-2.5 bg-rose-950/40 hover:bg-rose-950/75 text-rose-300 border border-rose-900/40 rounded-xl text-xs font-black uppercase tracking-wider transition-all select-none cursor-pointer active:scale-95"
                >
                  Limpar Fila
                </button>
              </div>
            </div>
          </div>

          {/* Main Workspace split */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left section: Product Selection & Print Queue */}
            <div className="lg:col-span-4 space-y-6">
              {/* Product Selector Card */}
              <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm text-left">
                <h4 className="font-extrabold text-xs text-slate-400 uppercase tracking-widest font-mono mb-4 flex items-center gap-1.5 pt-0.5">
                  <Search size={14} className="text-slate-400" />
                  1. Seleção de Artigos
                </h4>
                
                {/* Search Bar */}
                <div className="relative mb-4">
                  <input
                    type="text"
                    placeholder="Pesquisar por nome ou SKU..."
                    value={etiquetaSearch}
                    onChange={(e) => setEtiquetaSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-50 hover:bg-slate-100/50 focus:bg-white text-xs text-slate-800 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-600 transition-all font-sans font-medium"
                  />
                  <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>

                {/* Available Products Quick List */}
                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {products
                    .filter(p => 
                      p.name?.toLowerCase().includes(etiquetaSearch.toLowerCase()) || 
                      p.sku?.toLowerCase().includes(etiquetaSearch.toLowerCase()) ||
                      p.barcode?.toLowerCase().includes(etiquetaSearch.toLowerCase())
                    )
                    .slice(0, 100)
                    .map(p => {
                      const inQueue = printQueue.find(q => q.product.id === p.id);
                      return (
                        <div 
                          key={p.id} 
                          className="p-3 bg-slate-50/50 hover:bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between gap-3 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <p data-no-translate="true" translate="no" className="text-xs font-bold text-slate-800 truncate leading-tight no-translate notranslate">{p.name}</p>
                            <span className="text-[9px] font-mono text-slate-400 block mt-0.5 font-bold">
                              Base: {p.price} {currency} · SKU: {p.sku || 'Sem SKU'}
                            </span>
                          </div>
                          
                          <button
                            type="button"
                            onClick={() => {
                              const existing = printQueue.find(q => q.product.id === p.id);
                              if (existing) {
                                setPrintQueue(printQueue.map(q => q.product.id === p.id ? { ...q, count: q.count + 1 } : q));
                                toast.success(`Adicionada mais +1 cópia de "${p.name}"`);
                              } else {
                                setPrintQueue([...printQueue, { product: p, count: 1 }]);
                                toast.success(`"${p.name}" adicionado à fila!`);
                              }
                            }}
                            className={cn(
                              "px-2.5 py-1.5 rounded-xl border font-black text-[9.5px] uppercase tracking-wider cursor-pointer select-none transition-all",
                              inQueue 
                                ? "bg-indigo-50 border-indigo-200 text-indigo-600" 
                                : "bg-white hover:bg-slate-50 border-slate-200 text-slate-500"
                            )}
                          >
                            {inQueue ? `Adicionado (${inQueue.count})` : "+ Adicionar"}
                          </button>
                        </div>
                      );
                    })}
                  {products.length === 0 && (
                    <p className="text-xs text-slate-400 italic text-center py-4 font-sans">Não há produtos registados no inventário.</p>
                  )}
                </div>
              </div>

              {/* Printing Queue Panel */}
              <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm text-left">
                <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                  <h4 className="font-extrabold text-xs text-slate-400 uppercase tracking-widest font-mono flex items-center gap-1.5">
                    <Barcode size={14} className="text-slate-400" />
                    2. Fila ({printQueue.reduce((acc, q) => acc + q.count, 0)} etiquetas)
                  </h4>
                  {printQueue.length > 0 && (
                    <button 
                      type="button"
                      onClick={() => setPrintQueue([])}
                      className="text-[9.5px] font-black uppercase text-rose-500 hover:bg-rose-50 px-2 py-1 rounded cursor-pointer"
                    >
                      Remover Tudo
                    </button>
                  )}
                </div>

                <div data-no-translate="true" className="space-y-3 max-h-[350px] overflow-y-auto pr-1 font-sans no-translate">
                  {printQueue.map((queueItem, index) => (
                    <div 
                      key={queueItem.product.id} 
                      className="p-3 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-slate-800 truncate leading-tight">{queueItem.product.name}</p>
                        <p className="text-[9.5px] font-mono text-slate-400 mt-1 font-bold">
                          {queueItem.product.price} {currency} · SKU: {queueItem.product.sku || 'N/D'}
                        </p>
                      </div>

                      {/* Quantity Incrementor */}
                      <div className="flex items-center gap-1.5 select-none">
                        <button
                          type="button"
                          onClick={() => {
                            if (queueItem.count > 1) {
                              setPrintQueue(printQueue.map((q, i) => i === index ? { ...q, count: q.count - 1 } : q));
                            } else {
                              setPrintQueue(printQueue.filter((_, i) => i !== index));
                              toast.info(`"${queueItem.product.name}" removido da fila`);
                            }
                          }}
                          className="w-6 h-6 bg-white hover:bg-slate-100 active:bg-slate-200 border border-slate-200 text-slate-600 rounded-lg flex items-center justify-center font-bold text-xs select-none cursor-pointer"
                        >
                          -
                        </button>
                        <span className="w-8 text-center text-xs font-black font-mono text-slate-800">{queueItem.count}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setPrintQueue(printQueue.map((q, i) => i === index ? { ...q, count: q.count + 1 } : q));
                          }}
                          className="w-6 h-6 bg-white hover:bg-slate-100 active:bg-slate-200 border border-slate-200 text-slate-600 rounded-lg flex items-center justify-center font-bold text-xs select-none cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}

                  {printQueue.length === 0 && (
                    <div className="py-12 text-center text-slate-400">
                      <Tag size={28} className="mx-auto mb-2 text-indigo-400 opacity-20" />
                      <p className="text-xs font-extrabold text-slate-700 font-sans">A fila está vazia</p>
                      <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed font-sans">Clique em "+ Adicionar" nos produtos acima para iniciar o design da folha.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Middle & Right section: Design customizer and live sheet preview */}
            <div className="lg:col-span-8 space-y-6">
              {/* Customizer Settings Card */}
              <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm text-left font-sans">
                <h4 className="font-extrabold text-xs text-indigo-600 uppercase tracking-widest font-mono mb-6 pb-2.5 border-b border-slate-100 flex items-center gap-1.5 pt-0.5">
                  <Sliders size={14} />
                  3. Configuração do Modelo Visual & Estilo das Etiquetas
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Select Template Style */}
                  <div className="space-y-3">
                    <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Estilo e Layout da Etiqueta</label>
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setTagTemplate('classic')}
                        className={cn(
                          "p-3 rounded-2xl border text-left select-none cursor-pointer transition-all flex flex-col gap-1.5",
                          tagTemplate === 'classic' 
                            ? "bg-slate-50 border-slate-300 ring-1 ring-slate-300" 
                            : "bg-white hover:bg-slate-50 border-slate-200"
                        )}
                      >
                        <span className="text-xs font-extrabold text-slate-800 leading-none">🏢 Gôndola Tradicional</span>
                        <span className="text-[9.5px] text-slate-400 leading-normal font-sans">Limpo, ideal para prateleiras de supermercado ou lojas.</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setTagTemplate('modern')}
                        className={cn(
                          "p-3 rounded-2xl border text-left select-none cursor-pointer transition-all flex flex-col gap-1.5",
                          tagTemplate === 'modern' 
                            ? "bg-[#0B1F4D] border-slate-800 text-white font-sans" 
                            : "bg-white hover:bg-slate-50 border-slate-200"
                        )}
                      >
                        <span className={cn("text-xs font-extrabold leading-none", tagTemplate === 'modern' ? "text-indigo-400" : "text-slate-800")}>✨ Selo Contemporâneo</span>
                        <span className="text-[9.5px] text-slate-400 leading-normal font-sans">Bordas estilizadas, visual premium para boutiques.</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setTagTemplate('minimal')}
                        className={cn(
                          "p-3 rounded-2xl border text-left select-none cursor-pointer transition-all flex flex-col gap-1.5",
                          tagTemplate === 'minimal' 
                            ? "bg-slate-50 border-slate-300 ring-1 ring-slate-300" 
                            : "bg-white hover:bg-slate-50 border-slate-200"
                        )}
                      >
                        <span className="text-xs font-extrabold text-slate-800 leading-none font-sans">📑 Adesivo Compacto</span>
                        <span className="text-[9.5px] text-slate-400 leading-normal font-sans">Foco em alta densidade para etiquetas pequenas.</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setTagTemplate('promo')}
                        className={cn(
                          "p-3 rounded-2xl border text-left select-none cursor-pointer transition-all flex flex-col gap-1.5",
                          tagTemplate === 'promo' 
                            ? "bg-red-50 border-red-200 ring-1 ring-red-200" 
                            : "bg-white hover:bg-slate-50 border-slate-200"
                        )}
                      >
                        <span className="text-xs font-extrabold text-rose-750 leading-none font-sans">🔥 Alerta Promocional</span>
                        <span className="text-[9.5px] text-rose-500 leading-normal font-sans font-medium">Destaque vermelho/amarelo de alta atenção.</span>
                      </button>
                    </div>
                  </div>

                  {/* Fields Toggles */}
                  <div className="space-y-4">
                    <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider block">Campos a Exibir na Etiqueta</span>
                    
                    <div className="grid grid-cols-2 gap-3 bg-slate-50/40 border border-slate-100 p-4 rounded-2xl font-sans">
                      <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none">
                        <input 
                          type="checkbox" 
                          checked={showStoreName} 
                          onChange={(e) => setShowStoreName(e.target.checked)}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                        />
                        Nome da Loja
                      </label>

                      <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none">
                        <input 
                          type="checkbox" 
                          checked={showPrice} 
                          onChange={(e) => setShowPrice(e.target.checked)}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                        />
                        Preço Unitário
                      </label>

                      <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none">
                        <input 
                          type="checkbox" 
                          checked={showBarcode} 
                          onChange={(e) => setShowBarcode(e.target.checked)}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                        />
                        Código de Barras
                      </label>

                      <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none">
                        <input 
                          type="checkbox" 
                          checked={showSku} 
                          onChange={(e) => setShowSku(e.target.checked)}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                        />
                        Código SKU (Texto)
                      </label>

                      <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none col-span-2">
                        <input 
                          type="checkbox" 
                          checked={showCategory} 
                          onChange={(e) => setShowCategory(e.target.checked)}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                        />
                        Categoria do Artigo
                      </label>
                    </div>
                  </div>
                </div>

                {/* Additional inputs and styling config */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-100 mt-4 leading-normal">
                  <div className="space-y-1.5 font-sans text-left">
                    <label className="text-[9px] uppercase font-black text-slate-400 tracking-wider">Nome da Empresa Impresso</label>
                    <input
                      type="text"
                      placeholder="Ex: Supermercado Maputo"
                      value={customStoreName}
                      onChange={(e) => setCustomStoreName(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-50 hover:bg-slate-100/50 focus:bg-white text-xs text-slate-800 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-600 font-sans font-medium"
                    />
                  </div>

                  <div className="space-y-1.5 text-left leading-none font-sans">
                    <label className="text-[9px] uppercase font-black text-slate-400 tracking-wider block">Tema e Cor do Contorno</label>
                    <div className="flex items-center gap-2 pt-1 select-none">
                      {['#2563EB', '#2563EB', '#10b981', '#ef4444', '#111111'].map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setTagBorderColor(color)}
                          className={cn(
                            "w-6 h-6 rounded-full border border-white filter drop-shadow-sm select-none cursor-pointer transition-transform relative",
                            tagBorderColor === color && "scale-125 ring-2 ring-slate-400"
                          )}
                          style={{ backgroundColor: color }}
                        >
                          {tagBorderColor === color && (
                            <Check size={12} className="text-white absolute inset-0 m-auto" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5 text-left leading-none font-sans">
                    <label className="text-[9px] uppercase font-black text-slate-400 tracking-wider">Colunas por Folha</label>
                    <select
                      value={tagColumns}
                      onChange={(e) => setTagColumns(Number(e.target.value))}
                      className="w-full px-3 py-1.5 bg-slate-50 hover:bg-slate-100/50 focus:bg-white text-xs text-slate-800 rounded-xl border border-slate-205 outline-none focus:ring-2 focus:ring-indigo-600 font-sans"
                    >
                      <option value="2">2 colunas por linha (Grande)</option>
                      <option value="3">3 colunas por linha (Padrão)</option>
                      <option value="4">4 colunas por linha (Compacto)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Real-time Interactive Label Preview */}
              <div className="bg-slate-50 border border-slate-200/60 rounded-3xl p-6 text-left font-sans">
                <div className="flex items-center justify-between mb-4 border-b pb-3 border-slate-200/60 select-none">
                  <div>
                    <h5 className="text-[11px] font-black uppercase text-slate-400 font-mono tracking-widest">Amostra de Demonstração em Tempo Real (1 Elemento de Exemplo)</h5>
                    <p className="text-[10px] text-slate-500 mt-0.5 font-sans font-medium">As alterações nos seletores acima atualizam este protótipo instantaneamente.</p>
                  </div>
                </div>

                <div className="flex items-center justify-center py-6 bg-white rounded-2xl border border-slate-200/50 shadow-inner">
                  {/* Sample Element Container */}
                  <div 
                    className={cn(
                      "w-[245px] p-4 border rounded-xl shadow-sm text-left relative transition-all bg-white font-sans",
                      tagTemplate === 'promo' ? "border-red-500 bg-red-50/5" : ""
                    )}
                    style={{ borderColor: tagTemplate === 'promo' ? undefined : tagBorderColor, borderWidth: '2px' }}
                  >
                    {/* Header: Company Name */}
                    {showStoreName && (
                      <div className="text-[9px] font-black text-slate-400 tracking-widest uppercase mb-1 truncate">
                        {customStoreName || 'A MINHA EMPRESA'}
                      </div>
                    )}

                    {/* Badge template styled title */}
                    <div className="mb-2">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest inline-block mr-1 font-mono">TÍTULO:</span>
                      <h5 className="text-sm font-extrabold text-[#0B1F4D] tracking-tight leading-snug line-clamp-1">Produto de Amostra Premium</h5>
                      {showCategory && (
                        <span className="text-[8px] uppercase font-black font-mono tracking-widest text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded mt-1 inline-block">
                          Bebidas / Mercearia
                        </span>
                      )}
                    </div>

                    {/* Price with promo logic or classic */}
                    {showPrice && (
                      <div className="my-2.5 flex items-baseline justify-between select-none">
                        <div className="text-left">
                          <span className="text-[8px] font-extrabold text-slate-400 block tracking-widest uppercase mb-0.5">PREÇO FIADOR:</span>
                          <span className="text-xl font-black font-mono tracking-tight text-slate-900 leading-none">
                            120,50 <span className="text-xs font-extrabold">{currency}</span>
                          </span>
                        </div>
                        {tagTemplate === 'promo' && (
                          <div className="py-1 px-2.5 bg-red-650 text-white border border-red-500 bg-rose-600 rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center justify-center animate-pulse shadow-sm shadow-red-200">
                            PROMO!
                          </div>
                        )}
                      </div>
                    )}

                    {/* Barcode representation */}
                    {showBarcode && (
                      <div className="mt-3.5 border-t border-slate-100 pt-3 flex flex-col items-center">
                        {/* High fidelity dynamic barcode stripes */}
                        <div className="w-full h-8 flex gap-[1px] select-none opacity-95 px-2 overflow-hidden pointer-events-none bg-white">
                          {getBarcodePattern('SAB-DEMO-LABEL').split('').map((char, index) => (
                            <div 
                              key={index} 
                              className={cn("h-full flex-1", char === '1' ? "bg-slate-950" : "bg-transparent")} 
                            />
                          ))}
                        </div>
                        {showSku && (
                          <span className="text-[9px] font-extrabold font-mono text-slate-500 tracking-widest mt-1 block select-all">
                            REF-DEMO-CODE39
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-5 flex gap-3 text-left leading-normal justify-end select-none">
                  <button
                    type="button"
                    onClick={() => {
                      if (printQueue.length === 0) {
                        toast.error("Adicione pelo menos um produto à fila de impressão para visualizar a folha completa.");
                        return;
                      }
                      setIsPreviewModalOpen(true);
                    }}
                    className="flex-1 sm:flex-initial bg-indigo-600 hover:bg-indigo-700 text-white border border-indigo-500 rounded-2xl px-6 py-3 font-black text-xs uppercase tracking-wider transition-all shadow-md shadow-indigo-150 flex items-center justify-center gap-1.5 select-none hover:shadow-indigo-200 cursor-pointer active:scale-95"
                  >
                    <Download size={14} />
                    Gerar Folha de Etiquetas (.PDF / Impressora)
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Dynamic Printing Sheet Modal Preview */}
      {isPreviewModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in font-sans">
          <div className="bg-white w-full max-w-5xl rounded-[32px] shadow-2xl border border-slate-100 flex flex-col h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header Toolbar */}
            <div className="bg-slate-900 border-b border-slate-800 p-5 px-6 flex items-center justify-between text-left select-none">
              <div className="text-left">
                <span className="text-[9px] font-black tracking-widest uppercase bg-indigo-600 text-indigo-100 border border-indigo-500 px-2 py-0.5 rounded">FOLHA DE ETIQUETAS</span>
                <h4 className="text-md font-black text-white mt-1 leading-none flex items-center gap-2">
                  <Tag className="text-indigo-400" size={16} />
                  Visualização Prévia Alinhada
                </h4>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    window.print();
                  }}
                  className="px-4 py-2.5 bg-indigo-650 hover:bg-indigo-750 text-white bg-indigo-600 rounded-xl text-xs font-black uppercase tracking-wider transition-all select-none cursor-pointer flex items-center gap-1.5 shadow-md shadow-indigo-900/30"
                >
                  <Download size={13} />
                  Imprimir / Gravar PDF
                </button>
                
                <button
                  type="button"
                  onClick={() => setIsPreviewModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-850 rounded-xl transition-all cursor-pointer select-none"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Print Help Banner in Overlay */}
            <div className="bg-amber-50/70 border-b border-amber-100 p-3.5 px-6 text-xs text-amber-900 font-medium text-left flex items-start gap-2 select-none leading-relaxed">
              <span className="text-base leading-none">💡</span>
              <div className="text-left font-sans font-semibold">
                <strong>Orientações de Posicionamento Físico:</strong> No diálogo de impressão de páginas do seu software navegador (Chrome/Safari/Edge), configure a propriedade Margens como <strong>"Nenhuma" (Margins: None)</strong> e defina a Escala para <strong>"Padrão" (Scale: Default)</strong>. Isto assegura o alinhamento central da grelha de etiquetas de stock no PDF de destino.
              </div>
            </div>

            {/* Simulated Label Sheet Body */}
            <div data-no-translate="true" className="flex-1 p-8 bg-slate-100/60 overflow-y-auto font-sans text-slate-900 no-translate" id="print-section-etiquetas">
              <div className="bg-white p-8 max-w-[21cm] mx-auto min-h-[29.7cm] shadow-xl border border-slate-200 rounded-lg text-left relative font-sans">
                
                {/* Visual Label Grid */}
                <div 
                  className="grid gap-4 w-full"
                  style={{
                    gridTemplateColumns: `repeat(${tagColumns}, minmax(0, 1fr))`
                  }}
                >
                  {/* Map over queue items based on count */}
                  {printQueue.flatMap((qi) => 
                    Array.from({ length: qi.count }).map((_, i) => (
                      <div 
                        key={`${qi.product.id}-${i}`}
                        className={cn(
                          "p-3.5 rounded-lg border flex flex-col justify-between relative bg-white break-inside-avoid shadow-sm",
                          tagTemplate === 'promo' ? "border-rose-500 bg-rose-50/5 animate-pulse" : "border-slate-300"
                        )}
                        style={{ borderStyle: 'solid', borderWidth: '1.5px', borderColor: tagTemplate === 'promo' ? undefined : tagBorderColor }}
                      >
                        {/* Company Badge */}
                        {showStoreName && (
                          <span className="text-[8px] font-black text-slate-400 tracking-widest uppercase truncate block mb-1">
                            {customStoreName || 'A MINHA EMPRESA'}
                          </span>
                        )}

                        {/* Heading SKU & Name */}
                        <div className="text-left">
                          <h5 className="text-[11px] font-extrabold text-slate-900 tracking-tight leading-snug line-clamp-2">
                            {qi.product.name}
                          </h5>
                          
                          {showCategory && qi.product.category && (
                            <span className="text-[7.5px] uppercase font-black font-mono tracking-widest text-indigo-700 opacity-80 mt-1 block">
                              {qi.product.category}
                            </span>
                          )}
                        </div>

                        {/* Price Area */}
                        {showPrice && (
                          <div className={cn(
                            "flex items-baseline justify-between mt-2.5 select-none",
                            tagTemplate === 'promo' ? "text-rose-700 font-extrabold" : ""
                          )}>
                            <div className="text-left">
                              <span className="text-[11px] font-black font-mono tracking-tight leading-none text-slate-905">
                                {qi.product.price} <span className="text-[8px] font-extrabold">{currency}</span>
                              </span>
                            </div>
                            
                            {tagTemplate === 'promo' && (
                              <span className="text-[7px] font-black bg-rose-600 text-white px-1 rounded-sm select-none">
                                PROMO
                              </span>
                            )}
                          </div>
                        )}

                        {/* Barcode Representation */}
                        {showBarcode && (
                          <div className="mt-2.5 border-t border-slate-100 pt-2 flex flex-col items-center select-none pointer-events-none">
                            <div className="w-full h-6 flex gap-[0.7px] opacity-100 px-1 overflow-hidden pointer-events-none bg-white">
                              {getBarcodePattern(qi.product.barcode || qi.product.sku || 'SAB-0010').split('').map((char, index) => (
                                <div key={index} className={cn("h-full flex-1", char === '1' ? "bg-slate-950" : "bg-transparent")} />
                              ))}
                            </div>
                            {showSku && qi.product.sku && (
                              <span className="text-[7.5px] font-extrabold font-mono text-slate-450 tracking-wider mt-0.5">
                                {qi.product.sku}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {printQueue.length === 0 && (
                  <p className="text-center text-slate-400 py-24 font-sans italic text-xs font-bold">Adicione produtos na fila para visualizá-los aqui.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {viewingProduct && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white w-full max-w-lg rounded-[28px] border border-slate-100 shadow-2xl p-6 flex flex-col gap-5 overflow-y-auto max-h-[90vh] animate-in zoom-in-95 duration-200 text-left font-sans text-slate-950">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-105 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-slate-50 border border-slate-100 rounded-2xl overflow-hidden flex items-center justify-center text-blue-600 shrink-0 shadow-inner">
                  {viewingProduct.imageUrl ? (
                    <img 
                      src={viewingProduct.imageUrl} 
                      alt={viewingProduct.name} 
                      className="w-full h-full object-cover" 
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <Package size={22} />
                  )}
                </div>
                <div>
                  <span className="text-[9px] uppercase font-black tracking-wider text-slate-400 bg-slate-50 px-2 py-0.5 rounded border">Ficha do Artigo</span>
                  <h3 data-no-translate="true" className="text-lg font-black text-slate-900 tracking-tight mt-0.5 line-clamp-1 no-translate">{viewingProduct.name}</h3>
                </div>
              </div>
              <button 
                onClick={() => setViewingProduct(null)}
                className="text-slate-400 hover:text-slate-650 p-1.5 hover:bg-slate-50 rounded-xl transition-all cursor-pointer"
              >
                <Plus size={18} className="rotate-45" />
              </button>
            </div>

            {/* Content Details */}
            <div className="space-y-4">
              {/* Reference Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 bg-slate-50/80 rounded-2xl border border-slate-100/50">
                  <span className="block text-[8px] uppercase font-black text-slate-400 tracking-wider">SKU de Referência</span>
                  <span data-no-translate="true" className="text-xs font-extrabold text-slate-800 font-mono inline-block mt-0.5 no-translate">{viewingProduct.sku || 'N/D'}</span>
                </div>
                <div className="p-3.5 bg-slate-50/80 rounded-2xl border border-slate-100/50">
                  <span className="block text-[8px] uppercase font-black text-slate-400 tracking-wider">Código de Barras</span>
                  <span data-no-translate="true" className="text-xs font-extrabold text-slate-800 font-mono inline-block mt-0.5 no-translate">{viewingProduct.barcode || 'N/D'}</span>
                </div>
              </div>

              {/* Categorization & Supplier */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 bg-slate-50/80 rounded-2xl border border-slate-100/50">
                  <span className="block text-[8px] uppercase font-black text-slate-400 tracking-wider">Categoria Associada</span>
                  <span data-no-translate="true" className="text-xs font-extrabold text-slate-850 inline-block mt-0.5 no-translate">{viewingProduct.category || 'Geral'}</span>
                </div>
                <div className="p-3.5 bg-slate-50/80 rounded-2xl border border-slate-100/50">
                  <span className="block text-[8px] uppercase font-black text-slate-400 tracking-wider">Fornecedor / Origem</span>
                  <span data-no-translate="true" className="text-xs font-extrabold text-slate-850 inline-block mt-0.5 no-translate">{viewingProduct.supplier || 'N/D'}</span>
                </div>
              </div>

              {/* Financial Profits & Margins Panel */}
              <div className="bg-slate-900 text-white rounded-[24px] p-5 space-y-4 shadow-xl shadow-slate-900/10">
                <span className="text-[9px] uppercase font-extrabold tracking-wider text-slate-400 block border-b border-white/10 pb-2">📊 Lucratividade e Margens de Venda</span>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="block text-[8px] font-black uppercase text-slate-400 tracking-wider">Preço de Venda</span>
                    <span className="text-xl font-black text-blue-400 font-sans mt-0.5 inline-block">{(viewingProduct.price || 0).toLocaleString()} {currency}</span>
                  </div>
                  <div>
                    <span className="block text-[8px] font-black uppercase text-slate-400 tracking-wider">Preço de Custo (Compra)</span>
                    <span className="text-xl font-black text-amber-400 font-sans mt-0.5 inline-block">{(viewingProduct.costPrice || 0).toLocaleString()} {currency}</span>
                  </div>
                </div>

                <div className="bg-white/5 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <span className="block text-[8px] font-black uppercase text-slate-400 tracking-wider">Lucro Operacional Líquido</span>
                    <span className="text-sm font-extrabold text-emerald-400 mt-0.5 inline-block">
                      {viewingProduct.price > 0 && viewingProduct.costPrice > 0 ? (viewingProduct.price - viewingProduct.costPrice).toLocaleString() : 0} {currency}
                    </span>
                  </div>
                  <div className="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl text-xs font-black uppercase tracking-wider">
                    Margem: {viewingProduct.price > 0 && viewingProduct.costPrice > 0 ? Math.max(0, Math.round(((viewingProduct.price - viewingProduct.costPrice) / viewingProduct.price) * 100)) : 0}%
                  </div>
                </div>
              </div>

              {/* Wholesale / Tiered Prices details if any */}
              {viewingProduct.allowWholesale && (
                <div className="bg-gradient-to-br from-emerald-900 to-teal-950 text-white rounded-[24px] p-5 space-y-3.5 shadow-xl shadow-emerald-950/20">
                  <span className="text-[9px] uppercase font-extrabold tracking-wider text-emerald-300 block border-b border-emerald-500/20 pb-2">📦 Valores & Configuração de Grosso (Wholesale)</span>
                  <div className="flex justify-between items-center bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-xl">
                    <span className="text-[10px] uppercase font-black tracking-wider text-emerald-100">Preço de Grosso Base:</span>
                    <span className="text-base font-black text-emerald-300">{(viewingProduct.wholesalePrice || 0).toLocaleString()} {currency}</span>
                  </div>
                  {viewingProduct.tieredPrices && viewingProduct.tieredPrices.length > 0 && (
                    <div className="space-y-1.5 pt-1 border-t border-emerald-500/10">
                      <span className="block text-[8px] font-black uppercase text-emerald-300 tracking-wider">Escalões de Quantidade Cadastrados:</span>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {viewingProduct.tieredPrices.map((t: any, idx: number) => (
                          <div key={idx} className="bg-white/5 px-2.5 py-1.5 rounded-lg flex items-center justify-between border border-white/5 font-mono">
                            <span className="text-emerald-300">Qtd ≥ {t.minQty}</span>
                            <span className="font-bold text-white">{Number(t.price).toLocaleString()} {currency}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Retail / Unit Discounts details if any */}
              {viewingProduct.unitDiscountTiers && viewingProduct.unitDiscountTiers.length > 0 && (
                <div className="bg-gradient-to-br from-blue-900 to-indigo-950 text-white rounded-[24px] p-5 space-y-3.5 shadow-xl shadow-blue-950/20">
                  <span className="text-[9px] uppercase font-extrabold tracking-wider text-blue-300 block border-b border-blue-500/20 pb-2">🛍️ Tabela de Descontos por Volume de Unidades ('un')</span>
                  <div className="space-y-1.5">
                    <span className="block text-[8px] font-black uppercase text-blue-300 tracking-wider font-sans">Descontos de retalho por quantidade comprada:</span>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {viewingProduct.unitDiscountTiers.map((t: any, idx: number) => (
                        <div key={idx} className="bg-white/5 px-2.5 py-1.5 rounded-lg flex items-center justify-between border border-white/5 font-mono">
                          <span className="text-blue-300">Qtd ≥ {t.minQty}</span>
                          <span className="font-bold text-white">
                            {t.discountType === 'percent' ? `-${t.discountVal}%` : `-${Number(t.discountVal).toLocaleString()} ${currency}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Physical Unified Stocks and Breakdown */}
              <div className="p-4 border border-slate-105 rounded-[24px] space-y-3 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b pb-2 border-slate-100">
                  <span className="text-[9px] uppercase font-black text-slate-400 tracking-wider">📦 Nível do Inventário</span>
                  <span className="text-[9px] uppercase font-black text-slate-450 tracking-wider font-mono">Breakdown Físico</span>
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <span className="block text-[8px] font-black uppercase text-slate-400 tracking-wider">Stock Coeso Geral</span>
                    <span className="text-lg font-black text-slate-900 mt-0.5 inline-block">{viewingProduct.stockLevel || 0} <span data-no-translate="true" className="no-translate">{viewingProduct.baseUnitLabel || 'Un'}</span></span>
                  </div>
                  <div className="text-right">
                    <span className="block text-[8px] font-black uppercase text-slate-400 tracking-wider">Limite de Alerta</span>
                    <span className="text-sm font-extrabold text-red-600 mt-0.5 inline-block">{viewingProduct.lowStockThreshold || 5} <span data-no-translate="true" className="no-translate">{viewingProduct.baseUnitLabel || 'Un'}</span></span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div className="bg-slate-50 border border-slate-100 py-2 px-1.5 rounded-xl text-center">
                    <span className="block text-[8px] font-black text-slate-400 uppercase">Caixas (Cx)</span>
                    <span className="font-bold text-slate-750 text-xs">{viewingProduct.stockCx !== undefined ? viewingProduct.stockCx : 0}</span>
                  </div>
                  <div className="bg-slate-50 border border-slate-100 py-2 px-1.5 rounded-xl text-center">
                    <span className="block text-[8px] font-black text-slate-400 uppercase">Embalagens (Emb)</span>
                    <span className="font-bold text-slate-755 text-xs">{viewingProduct.stockEmb !== undefined ? viewingProduct.stockEmb : 0}</span>
                  </div>
                  <div className="bg-slate-50 border border-slate-100 py-2 px-1.5 rounded-xl text-center">
                    <span className="block text-[8px] font-black text-slate-400 uppercase">Unidades (Un)</span>
                    <span className="font-bold text-slate-750 text-xs">{viewingProduct.stockUn !== undefined ? viewingProduct.stockUn : 0}</span>
                  </div>
                </div>
              </div>

              {/* Lotes / Batches Table */}
              {(() => {
                const recBatches = getReconciledBatches(viewingProduct.batches || [], viewingProduct.stockLevel || 0);
                const activeBatchesList = recBatches.filter((b: any) => b.expiryDate && b.reconciledQty > 0);
                
                if (activeBatchesList.length > 0) {
                  return (
                    <div className="p-4 border border-rose-100 bg-rose-50/10 rounded-[24px] space-y-2 text-xs font-sans">
                      <div className="flex items-center justify-between border-b pb-1.5 border-rose-100">
                        <span className="text-[9px] uppercase font-black text-rose-800 tracking-wider flex items-center gap-1">⏰ Lotes e Prazos de Validade Ativos</span>
                        <span className="text-[9px] uppercase font-bold text-rose-500">{activeBatchesList.length} Lote(s)</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left font-sans text-[11px]">
                          <thead>
                            <tr className="text-[8px] uppercase font-black text-slate-400 tracking-wider border-b border-slate-100">
                              <th className="py-1">Código Lote</th>
                              <th className="py-1 text-center">Data Receção</th>
                              <th className="py-1 text-center font-bold">Validade</th>
                              <th className="py-1 text-right">Qtd Disp</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {activeBatchesList.map((batch: any, index: number) => {
                              const expDate = new Date(batch.expiryDate + 'T00:00:00');
                              const formattedExp = expDate.toLocaleDateString('pt-MZ');
                              const formattedRec = batch.receivedDate ? new Date(batch.receivedDate + 'T00:00:00').toLocaleDateString('pt-MZ') : '—';
                              
                              const today = new Date();
                              today.setHours(0,0,0,0);
                              const diffDays = Math.ceil((expDate.getTime() - today.getTime()) / 86400000);
                              
                              let textStyle = "text-slate-600";
                              if (diffDays <= 0) {
                                textStyle = "text-rose-700 font-bold";
                              } else if (diffDays <= 7) {
                                textStyle = "text-rose-500 font-bold animate-pulse";
                              } else if (diffDays <= 30) {
                                textStyle = "text-amber-600 font-bold";
                              }
                              
                              return (
                                <tr key={batch.batchId || index} className="hover:bg-slate-50/50">
                                  <td className="py-1.5 font-mono text-[10px] text-slate-800">{batch.batchId || `LOTE-${index}`}</td>
                                  <td className="py-1.5 text-center text-slate-500">{formattedRec}</td>
                                  <td className={`py-1.5 text-center ${textStyle}`}>{formattedExp} ({diffDays <= 0 ? 'Expirado' : `${diffDays}d`})</td>
                                  <td className="py-1.5 text-right font-bold font-mono text-slate-800">{batch.reconciledQty} {viewingProduct.baseUnitLabel || 'Un'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Units of Measure Schemes prices if any */}
              {viewingProduct.hasMultiUnits && (
                <div className="p-4 border border-slate-105 bg-slate-50/50 rounded-[24px] space-y-2 text-xs">
                  <span className="text-[9px] uppercase font-black text-slate-400 tracking-wider block border-b pb-1.5 border-slate-100">🏷️ Tabelas Adicionais por Sub-unidade</span>
                  {viewingProduct.hasBoxUnit && (
                    <div className="flex justify-between items-center text-slate-800 border-b pb-1.5 border-slate-100/50">
                      <div>
                        <span data-no-translate="true" className="font-bold block text-slate-900 no-translate">{viewingProduct.boxUnitName || 'Caixa'}</span>
                        <span className="text-[10px] text-slate-450">Fator: {viewingProduct.boxUnitQty || 10} <span data-no-translate="true" className="no-translate">{viewingProduct.baseUnitLabel || 'un'}</span></span>
                      </div>
                      <div className="text-right">
                        <span className="font-black text-blue-600 block">{(viewingProduct.boxUnitPrice || 0).toLocaleString()} {currency}</span>
                        {viewingProduct.boxUnitCostPrice > 0 && (
                          <span className="text-[10px] text-slate-400 font-medium">Custo: {viewingProduct.boxUnitCostPrice.toLocaleString()} {currency}</span>
                        )}
                      </div>
                    </div>
                  )}
                  {viewingProduct.hasPackUnit && (
                    <div className="flex justify-between items-center text-slate-800 pt-0.5">
                      <div>
                        <span data-no-translate="true" className="font-bold block text-slate-900 no-translate">{viewingProduct.packUnitName || 'Embalagem'}</span>
                        <span className="text-[10px] text-slate-450">Fator: {viewingProduct.packUnitQty || 100} <span data-no-translate="true" className="no-translate">{viewingProduct.baseUnitLabel || 'un'}</span></span>
                      </div>
                      <div className="text-right">
                        <span className="font-black text-blue-600 block">{(viewingProduct.packUnitPrice || 0).toLocaleString()} {currency}</span>
                        {viewingProduct.packUnitCostPrice > 0 && (
                          <span className="text-[10px] text-slate-400 font-medium">Custo: {viewingProduct.packUnitCostPrice.toLocaleString()} {currency}</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Confidencial notes and Description */}
              <div className="space-y-3">
                {/* Public Description */}
                {viewingProduct.description && (
                  <div className="p-4 bg-slate-50 border border-slate-105 rounded-[24px]">
                    <span className="block text-[9px] uppercase font-black text-slate-400 tracking-wider mb-1 flex items-center gap-1">
                      <FileText size={11} className="text-slate-500" /> Descrição do Artigo
                    </span>
                    <p data-no-translate="true" className="text-xs text-slate-700 leading-relaxed font-sans no-translate">{viewingProduct.description}</p>
                  </div>
                )}

                {/* Secure Manager Notes */}
                <div className="p-4 bg-amber-50/40 border border-amber-105 rounded-[24px] space-y-1.5">
                  <span className="block text-[9px] uppercase font-black text-amber-600 tracking-wider flex items-center gap-1">
                    <Lock size={11} className="text-amber-500" /> Notas Confidenciais do Gestor
                  </span>
                  {viewingProduct.managerNotes ? (
                    <p data-no-translate="true" className="text-xs text-amber-900 leading-relaxed font-sans bg-amber-50/20 p-2.5 rounded-xl border border-amber-100 no-translate">{viewingProduct.managerNotes}</p>
                  ) : (
                    <p className="text-xs text-amber-600/70 italic font-sans">Nenhuma nota ou anotação de controlo de compras foi introduzida neste artigo.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="mt-2 flex flex-col sm:flex-row gap-3 border-t border-slate-105 pt-4">
              <button
                type="button"
                onClick={() => setIsBarcodeLabelOpen(true)}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer text-center flex items-center justify-center gap-2 shadow-md shadow-blue-500/10 active:scale-95"
              >
                <Barcode size={15} />
                Gerar Etiqueta
              </button>
              <button
                onClick={() => setViewingProduct(null)}
                className="flex-1 py-3 border border-slate-205 hover:bg-slate-50 text-slate-600 font-black text-xs uppercase tracking-wider rounded-xl transition-colors cursor-pointer text-center"
              >
                Voltar ao Catálogo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Lançar Promoção */}
      {showPromoModal && promoProd && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60] animate-fade-in font-sans overflow-y-auto">
          <div className="bg-white w-full max-w-sm max-h-[90vh] overflow-y-auto rounded-[28px] border border-slate-100 shadow-2xl p-6 flex flex-col gap-4 animate-in zoom-in-95 duration-200 text-left font-sans text-slate-950">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
                  <Tag size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 tracking-tight">Criar Promoção de Validade</h3>
                  <p className="text-[9px] uppercase font-bold tracking-wider text-slate-400">Launch Expiry Promotion</p>
                </div>
              </div>
              <button 
                onClick={() => setShowPromoModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Product details info card */}
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3.5 space-y-0.5">
              <span className="text-[8px] uppercase font-black text-slate-400 tracking-wider">Artigo Selecionado</span>
              <p className="text-xs font-bold text-slate-800 line-clamp-1">{promoProd.name}</p>
              <div className="flex justify-between items-center text-[10px] text-slate-500 font-medium whitespace-nowrap pt-1">
                <span>Preço Normal: {promoProd.price?.toLocaleString()} {currency}</span>
                {promoProd.wholesalePrice > 0 && <span>Grosso: {promoProd.wholesalePrice?.toLocaleString()} {currency}</span>}
              </div>
            </div>

            {/* Sugestão Informativa */}
            <div className="bg-amber-50/50 border border-amber-200/60 rounded-xl p-3 flex items-start gap-2.5">
              <span className="text-amber-600 text-sm">💡</span>
              <div className="space-y-0.5">
                <p className="text-[10px] font-black uppercase text-amber-800 tracking-wider">Desconto Sugerido pelo Sistema</p>
                <p className="text-[11px] text-amber-700 font-bold">
                  {promoDescontoSugerido}% de desconto recomendado com base nos dias restantes do lote mais próximo.
                </p>
              </div>
            </div>

            <div className="space-y-3.5">
              {/* Preço Promocional */}
              <div className="space-y-1">
                <label className="block text-[10px] uppercase font-black tracking-wider text-slate-400">
                  Preço Promocional (MT):
                </label>
                <input 
                  type="number"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-mono font-bold text-xs outline-none focus:ring-2 focus:ring-blue-600"
                  value={promoPrecoPromocional}
                  onChange={(e) => setPromoPrecoPromocional(Number(e.target.value))}
                />
              </div>

              {/* Data Limite */}
              <div className="space-y-1">
                <label className="block text-[10px] uppercase font-black tracking-wider text-slate-400">
                  Válido Até:
                </label>
                <input 
                  type="date"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 font-mono text-xs outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer"
                  value={promoValidoAte}
                  onChange={(e) => setPromoValidoAte(e.target.value)}
                />
              </div>

              {/* Canal de Venda */}
              <div className="space-y-1">
                <label className="block text-[10px] uppercase font-black tracking-wider text-slate-400">
                  Aplicar ao Canal de Venda:
                </label>
                <select
                  value={promoAplicarA}
                  onChange={(e) => setPromoAplicarA(e.target.value as 'retail' | 'wholesale' | 'both')}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-sans text-xs outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer font-bold"
                >
                  <option value="retail">Apenas Retalho</option>
                  <option value="wholesale">Apenas Grosso</option>
                  <option value="both">Ambos (Retalho &amp; Grosso)</option>
                </select>
              </div>
            </div>

            {/* Confirm Actions */}
            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={async () => {
                  if (!profile?.businessId) return;
                  if (!promoPrecoPromocional || Number(promoPrecoPromocional) <= 0) {
                    toast.error("Por favor, selecione um preço promocional válido.");
                    return;
                  }
                  if (!promoValidoAte) {
                    toast.error("Por favor, selecione uma data de validade da promoção.");
                    return;
                  }

                  try {
                    const docRef = doc(db, `businesses/${profile.businessId}/products`, promoProd.id);
                    await updateDoc(docRef, {
                      promotionActive: true,
                      promotionPrice: promoPrecoPromocional,
                      promotionValidUntil: promoValidoAte,
                      promotionApplyTo: promoAplicarA,
                      updatedAt: serverTimestamp()
                    });

                    // Log action in audit logs
                    await logAction(
                      profile.uid,
                      profile.email,
                      ActionType.UPDATE_PRODUCT,
                      `Lançou promoção de validade para "${promoProd.name}": Preço ${promoPrecoPromocional} MT válido até ${promoValidoAte}`,
                      profile.businessId
                    );

                    toast.success("Promoção de validade lançada com sucesso!");
                    
                    // Close both modals
                    setShowPromoModal(false);
                    setViewingProduct(null);
                  } catch (err: any) {
                    console.error("Promo activation error:", err);
                    toast.error("Erro ao salvar promoção: " + (err.message || err));
                  }
                }}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 font-sans text-white text-[11px] uppercase font-black tracking-wider rounded-xl shadow-md transition-all active:scale-95 text-center cursor-pointer"
              >
                Confirmar Promoção
              </button>
              <button
                type="button"
                onClick={() => setShowPromoModal(false)}
                className="flex-1 py-2.5 border border-slate-205 hover:bg-slate-50 font-sans text-slate-600 text-[11px] uppercase font-black tracking-wider rounded-xl transition-colors text-center cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Adjust Stock Modal */}
      {quickAdjustProduct && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in overflow-y-auto">
          <div className="bg-white w-full max-w-sm max-h-[90vh] overflow-y-auto rounded-[24px] border border-slate-100 shadow-2xl p-6 flex flex-col gap-4 animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                  <Sliders size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 tracking-tight">Ajustar Stock</h3>
                  <p className="text-[9px] uppercase font-bold tracking-wider text-slate-400">Quick Stock Adjustment</p>
                </div>
              </div>
              <button 
                onClick={() => setQuickAdjustProduct(null)}
                className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-50 rounded-lg transition-colors"
              >
                <Plus size={16} className="rotate-45" />
              </button>
            </div>

            {/* Product details info card */}
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3.5 space-y-0.5">
              <span className="text-[8px] uppercase font-black text-slate-400 tracking-wider">Artigo Selecionado</span>
              <p className="text-xs font-bold text-slate-800 line-clamp-1">{quickAdjustProduct.name}</p>
              <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium whitespace-nowrap pt-1">
                <span>SKU: <strong className="font-bold text-slate-700 font-mono">{quickAdjustProduct.sku || 'N/D'}</strong></span>
                <span>Stock Coeso Atual: <strong className="font-extrabold text-blue-600 font-mono">{quickAdjustProduct.stockLevel || 0}</strong></span>
              </div>
            </div>

            {/* Adjustment Type Selector */}
            <div className="space-y-1.5">
              <label className="text-[9px] uppercase font-black tracking-wider text-slate-400">Método de Ajuste</label>
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100/80 rounded-xl border border-slate-200/50">
                <button
                  type="button"
                  onClick={() => {
                    setAdjustType('add');
                    if (adjustValue === 0) setAdjustValue(1);
                  }}
                  className={cn(
                    "py-1.5 text-[10px] font-black rounded-lg transition-all cursor-pointer",
                    adjustType === 'add' 
                      ? "bg-white text-emerald-600 shadow-sm border border-slate-200/20" 
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  Adicionar (+)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdjustType('subtract');
                    if (adjustValue === 0) setAdjustValue(1);
                  }}
                  className={cn(
                    "py-1.5 text-[10px] font-black rounded-lg transition-all cursor-pointer",
                    adjustType === 'subtract' 
                      ? "bg-white text-rose-600 shadow-sm border border-slate-200/20" 
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  Subtrair (-)
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustType('set')}
                  className={cn(
                    "py-1.5 text-[10px] font-black rounded-lg transition-all cursor-pointer",
                    adjustType === 'set' 
                      ? "bg-white text-indigo-600 shadow-sm border border-slate-200/20" 
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  Definir (=)
                </button>
              </div>
            </div>

            {/* Adjustment Value and Controls */}
            <div className="space-y-1.5">
              <label className="text-[9px] uppercase font-black tracking-wider text-slate-400">
                {adjustType === 'set' ? "Nova Quantidade Exatada" : "Quantidade a Ajustar"}
              </label>
              <div className="flex items-center gap-2">
                <button 
                  type="button"
                  onClick={() => setAdjustValue(prev => Math.max(0, (typeof prev === 'number' ? prev : Number(prev) || 0) - 1))}
                  className="w-10 h-10 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl border border-slate-200/50 flex items-center justify-center text-base font-bold transition-all shrink-0 cursor-pointer active:scale-95"
                >
                  -
                </button>
                <div className="relative flex-1">
                  <input 
                    type="number"
                    min="0"
                    placeholder="0"
                    className="w-full text-center h-10 p-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-800 font-mono text-sm leading-none"
                    value={adjustValue}
                    onChange={e => setAdjustValue(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                  />
                </div>
                <button 
                  type="button"
                  onClick={() => setAdjustValue(prev => (typeof prev === 'number' ? prev : Number(prev) || 0) + 1)}
                  className="w-10 h-10 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl border border-slate-200/50 flex items-center justify-center text-base font-bold transition-all shrink-0 cursor-pointer active:scale-95"
                >
                  +
                </button>
              </div>

              {/* Shortcut badges */}
              <div className="flex flex-wrap gap-1">
                {(adjustType === 'set' ? [0, 5, 10, 50, 100] : [1, 5, 10, 25, 50]).map((shortcut) => (
                  <button
                    key={shortcut}
                    type="button"
                    onClick={() => setAdjustValue(shortcut)}
                    className={cn(
                      "px-2 py-0.5 text-[9px] font-black font-mono tracking-wider rounded-lg border transition-all cursor-pointer",
                      Number(adjustValue) === shortcut 
                        ? "bg-blue-600 text-white border-blue-600" 
                        : "bg-white text-slate-500 border-slate-200/70 hover:bg-slate-50 hover:text-slate-800"
                    )}
                  >
                    {adjustType === 'set' ? '' : '+'}{shortcut}
                  </button>
                ))}
              </div>
            </div>

            {/* Calculations Preview Widget */}
            <div className="bg-slate-50/50 border border-slate-100 rounded-2xl p-3 flex items-center justify-between text-center select-none">
              <div className="space-y-0.5">
                <span className="text-[7px] uppercase font-black text-slate-400">Atual</span>
                <p className="text-xs font-black text-slate-700 font-mono">{quickAdjustProduct.stockLevel || 0}</p>
              </div>
              
              <div className="text-slate-400 flex items-center gap-1">
                {adjustType === 'add' && <span className="text-emerald-500 font-black text-xs">+</span>}
                {adjustType === 'subtract' && <span className="text-rose-500 font-black text-xs">-</span>}
                {adjustType === 'set' && <span className="text-indigo-500 font-black text-xs">→</span>}
                <span className="text-[10px] font-bold font-mono text-slate-600">{adjustValue}</span>
              </div>

              <ArrowRight size={12} className="text-slate-300 animate-pulse" />

              <div className="space-y-0.5">
                <span className="text-[7px] uppercase font-black text-slate-400">Novo Stock</span>
                <p className={cn(
                  "text-sm font-black font-mono",
                  adjustType === 'subtract' ? "text-rose-600" : adjustType === 'set' ? "text-indigo-600" : "text-emerald-600"
                )}>
                  {adjustType === 'add' 
                    ? (quickAdjustProduct.stockLevel || 0) + Number(adjustValue) 
                    : adjustType === 'subtract' 
                      ? Math.max(0, (quickAdjustProduct.stockLevel || 0) - Number(adjustValue))
                      : Number(adjustValue)
                  }
                </p>
              </div>
            </div>

            {/* Reason/Notes Input */}
            <div className="space-y-1">
              <label className="text-[9px] uppercase font-black tracking-wider text-slate-400">Motivo do Ajuste (Opcional)</label>
              <input 
                type="text"
                placeholder="Ex: Correção de contagem, Novo lote..."
                className="w-full p-2 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 placeholder-slate-400 font-bold"
                value={adjustReason}
                onChange={e => setAdjustReason(e.target.value)}
              />
            </div>

            {/* Dialog Action Buttons */}
            <div className="flex gap-2.5 pt-2.5 border-t">
              <button
                type="button"
                onClick={() => setQuickAdjustProduct(null)}
                className="flex-1 py-2 text-slate-600 font-bold text-[10px] uppercase tracking-widest rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleQuickAdjust}
                disabled={isUpdatingStock}
                className="flex-1 py-2 bg-slate-900 text-white font-bold text-[10px] uppercase tracking-widest rounded-xl hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/10 flex items-center justify-center gap-1.5 cursor-pointer active:scale-98 disabled:opacity-50"
              >
                {isUpdatingStock ? (
                  <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                ) : (
                  <Check size={14} />
                )}
                <span>Guardar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Smart Deduplication & Merge Modal */}
      {showDeduplicateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start mb-4 border-b pb-3">
              <div>
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <span>⚖️ Mesclador Inteligente de Artigos Duplicados</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1 font-medium">
                  Mescle diferentes grafias do mesmo artigo em um único registo. O stock será somado e o duplicado será removido.
                </p>
              </div>
              <button 
                onClick={() => setShowDeduplicateModal(false)}
                className="text-slate-400 hover:text-slate-600 font-extrabold text-sm p-1.5 hover:bg-slate-50 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-6 text-left pr-1">
              {/* Option A: Automatic Matching Suggestions */}
              <div className="space-y-3 bg-amber-50/40 border border-amber-100 p-4 rounded-2xl">
                <span className="text-[10px] uppercase font-black text-amber-700 tracking-wider">💡 Sugestões Automáticas do Sistema</span>
                
                {duplicateMatches.length === 0 ? (
                  <p className="text-xs text-amber-900/70 italic font-medium">Não foram encontradas duplicadas por grafia óbvia. Utilize o mesclador manual abaixo!</p>
                ) : (
                  <div className="space-y-2.5">
                    {duplicateMatches.map((match, idx) => (
                      <div key={idx} className="bg-white p-3.5 rounded-xl border border-amber-150 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded font-mono">Possível Duplicidade</span>
                          </div>
                          <p className="text-xs font-bold text-slate-800 flex items-center gap-1 flex-wrap">
                            <span className="text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{match.product1.name}</span>
                            <span className="text-slate-400">vs</span>
                            <span className="text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">{match.product2.name}</span>
                          </p>
                          <p className="text-[10px] text-slate-500">
                            Stocks: {match.product1.stockLevel || 0} un. + {match.product2.stockLevel || 0} un. 
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleMergeProductsCheck(match.product1.id, match.product2.id)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] uppercase tracking-wider rounded-lg active:scale-95 transition-transform"
                          >
                            Mesclar em: {match.product1.name.slice(0, 15)}...
                          </button>
                          <button
                            onClick={() => handleMergeProductsCheck(match.product2.id, match.product1.id)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] uppercase tracking-wider rounded-lg active:scale-95 transition-transform"
                          >
                            Mesclar em: {match.product2.name.slice(0, 15)}...
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Option B: Manual Target Merge Selector */}
              <div className="space-y-4 border-t pt-4">
                <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider">🛠️ Fusão de Artigos Manual (Qualquer Escolha)</span>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Main Survivor Product */}
                  <div className="space-y-1.5 p-3 rounded-2xl bg-blue-50/30 border border-blue-100">
                    <label className="block text-xs font-bold text-blue-900 uppercase">1. Artigo Correto (Sobrevivente)</label>
                    <p className="text-[10px] text-blue-600 italic">Este artigo continuará existindo de forma intacta na lista.</p>
                    <select
                      className="w-full p-2.5 bg-white border border-blue-200 rounded-xl outline-none font-bold text-xs"
                      value={mainProductId}
                      onChange={e => setMainProductId(e.target.value)}
                    >
                      <option value="">-- Selecione o Artigo Principal --</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.stockLevel || 0} un.)</option>
                      ))}
                    </select>
                  </div>

                  {/* Duplicate Product */}
                  <div className="space-y-1.5 p-3 rounded-2xl bg-rose-50/30 border border-rose-100">
                    <label className="block text-xs font-bold text-rose-900 uppercase">2. Artigo Errado / Duplicado (Será Apagado)</label>
                    <p className="text-[10px] text-rose-600 italic">Este produto será apagado e o seu stock será doado para o principal.</p>
                    <select
                      className="w-full p-2.5 bg-white border border-rose-200 rounded-xl outline-none font-bold text-xs"
                      value={targetProductId}
                      onChange={e => setTargetProductId(e.target.value)}
                    >
                      <option value="">-- Selecione o Artigo Duplicado --</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.stockLevel || 0} un.)</option>
                      ))}
                    </select>
                  </div>
                </div>

                {mainProductId && targetProductId && (
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 animate-in slide-in-from-bottom-2 duration-200">
                    <span className="text-[10px] uppercase font-black text-slate-400">Simulação de Resultado</span>
                    <p className="text-xs font-bold text-slate-700">
                      O stock do artigo principal <span className="text-blue-600">"{products.find(p => p.id === mainProductId)?.name}"</span> 
                      passará de <span className="font-mono">{products.find(p => p.id === mainProductId)?.stockLevel || 0}</span> un. 
                      para <span className="font-mono text-emerald-600 font-extrabold">{(Number(products.find(p => p.id === mainProductId)?.stockLevel) || 0) + (Number(products.find(p => p.id === targetProductId)?.stockLevel) || 0)}</span> un.
                    </p>
                    <p className="text-[10px] text-rose-600 italic font-bold">
                      *O artigo "{products.find(p => p.id === targetProductId)?.name}" será removido definitivamente do sistema.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
              <button 
                type="button"
                onClick={() => setShowDeduplicateModal(false)}
                className="px-4 py-2 border rounded-xl text-slate-600 font-bold text-xs uppercase tracking-wider hover:bg-slate-50 cursor-pointer"
              >
                Voltar ao Inventário
              </button>
              <button 
                type="button"
                onClick={() => handleMergeProductsCheck(mainProductId, targetProductId)}
                disabled={isMerging || !mainProductId || !targetProductId}
                className="px-5 py-2 bg-slate-900 disabled:opacity-40 hover:bg-slate-800 text-white font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer active:scale-95 shadow-md flex items-center gap-1.5"
              >
                {isMerging ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <span>🔒 Executar Mesclagem (PIN Requerido)</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Review and Import Modal */}
      {showPdfReviewModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-6xl w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start mb-4 border-b pb-3">
              <div>
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <span>📄 Revisão de Artigos Extraídos do PDF</span>
                  <span className="text-xs bg-violet-100 text-violet-800 px-2.5 py-0.5 rounded-full font-bold font-mono">
                    {parsedPdfProducts.filter(p => p.selected).length} de {parsedPdfProducts.length} selecionados
                  </span>
                </h3>
                <p className="text-xs text-slate-500 mt-1 font-medium">
                  Extraímos {parsedPdfProducts.length} produtos do documento <strong className="text-slate-800">{pdfFileName}</strong> via Inteligência Artificial. Verifique e ajuste os dados antes de importar para o inventário.
                </p>
              </div>
              <button 
                onClick={() => {
                  setShowPdfReviewModal(false);
                  setParsedPdfProducts([]);
                }}
                className="text-slate-400 hover:text-slate-600 font-extrabold text-sm p-1.5 hover:bg-slate-50 rounded-lg cursor-pointer animate-in fade-in duration-300"
              >
                ✕
              </button>
            </div>

            {/* Editable spreadsheet-style grid */}
            <div className="flex-1 overflow-auto border border-slate-100 rounded-2xl max-h-[55vh]">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider">
                    <th className="p-3.5 w-12 text-center">
                      <input 
                        type="checkbox"
                        checked={parsedPdfProducts.length > 0 && parsedPdfProducts.every(p => p.selected)}
                        onChange={(e) => {
                          const val = e.target.checked;
                          setParsedPdfProducts(parsedPdfProducts.map(p => ({ ...p, selected: val })));
                        }}
                        className="cursor-pointer accent-blue-600"
                      />
                    </th>
                    <th className="p-3.5 min-w-[200px]">Nome do Artigo</th>
                    <th className="p-3.5 w-32">SKU</th>
                    <th className="p-3.5 w-32">Cód. Barras</th>
                    <th className="p-3.5 w-24 text-right">Qtd. Stock</th>
                    <th className="p-3.5 w-28 text-right">Preço Custo ({currency})</th>
                    <th className="p-3.5 w-28 text-right">Preço Venda ({currency})</th>
                    <th className="p-3.5 w-32">Categoria</th>
                    <th className="p-3.5 w-16 text-center">Remover</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parsedPdfProducts.map((prod) => (
                    <tr key={prod.id} className={`hover:bg-slate-50/70 transition-colors ${!prod.selected ? 'opacity-50' : ''}`}>
                      <td className="p-3.5 text-center">
                        <input 
                          type="checkbox"
                          checked={prod.selected}
                          onChange={(e) => {
                            const val = e.target.checked;
                            setParsedPdfProducts(parsedPdfProducts.map(p => p.id === prod.id ? { ...p, selected: val } : p));
                          }}
                          className="cursor-pointer accent-blue-600"
                        />
                      </td>
                      <td className="p-2">
                        <input 
                          type="text"
                          value={prod.name}
                          onChange={(e) => {
                            const val = e.target.value;
                            setParsedPdfProducts(parsedPdfProducts.map(p => p.id === prod.id ? { ...p, name: val } : p));
                          }}
                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none font-bold text-slate-800"
                          placeholder="Nome obrigatório"
                        />
                      </td>
                      <td className="p-2">
                        <input 
                          type="text"
                          value={prod.sku}
                          onChange={(e) => {
                            const val = e.target.value;
                            setParsedPdfProducts(parsedPdfProducts.map(p => p.id === prod.id ? { ...p, sku: val } : p));
                          }}
                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none uppercase font-mono text-[10px]"
                        />
                      </td>
                      <td className="p-2">
                        <input 
                          type="text"
                          value={prod.barcode}
                          onChange={(e) => {
                            const val = e.target.value;
                            setParsedPdfProducts(parsedPdfProducts.map(p => p.id === prod.id ? { ...p, barcode: val } : p));
                          }}
                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none uppercase font-mono text-[10px]"
                        />
                      </td>
                      <td className="p-2">
                        <input 
                          type="number"
                          value={prod.quantity}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value) || 0);
                            setParsedPdfProducts(parsedPdfProducts.map(p => p.id === prod.id ? { ...p, quantity: val } : p));
                          }}
                          className="w-full px-2 py-1.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-right font-bold text-slate-700"
                        />
                      </td>
                      <td className="p-2">
                        <input 
                          type="number"
                          value={prod.costPrice}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value) || 0);
                            setParsedPdfProducts(parsedPdfProducts.map(p => p.id === prod.id ? { ...p, costPrice: val } : p));
                          }}
                          className="w-full px-2 py-1.5 border border-emerald-200 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-right font-bold text-emerald-700 bg-emerald-50/20"
                        />
                      </td>
                      <td className="p-2">
                        <input 
                          type="number"
                          value={prod.price}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value) || 0);
                            setParsedPdfProducts(parsedPdfProducts.map(p => p.id === prod.id ? { ...p, price: val } : p));
                          }}
                          className="w-full px-2 py-1.5 border border-blue-200 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-right font-bold text-blue-700 bg-blue-50/20"
                        />
                      </td>
                      <td className="p-2">
                        <input 
                          type="text"
                          value={prod.category}
                          onChange={(e) => {
                            const val = e.target.value;
                            setParsedPdfProducts(parsedPdfProducts.map(p => p.id === prod.id ? { ...p, category: val } : p));
                          }}
                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-slate-600"
                        />
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setParsedPdfProducts(parsedPdfProducts.filter(p => p.id !== prod.id));
                          }}
                          className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
                          title="Eliminar Linha"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {parsedPdfProducts.length === 0 && (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-slate-400 font-medium italic">
                        Nenhum produto listado. Adicione produtos ou feche o modal.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center mt-6 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  const tempId = `temp-manual-${Date.now()}`;
                  setParsedPdfProducts([...parsedPdfProducts, {
                    id: tempId,
                    name: 'Novo Produto Manual',
                    sku: '',
                    barcode: '',
                    price: 0,
                    costPrice: 0,
                    quantity: 1,
                    category: 'Geral',
                    supplier: '',
                    description: '',
                    selected: true
                  }]);
                }}
                className="flex items-center gap-1 px-4 py-2 bg-slate-50 border hover:bg-slate-100 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-all duration-200 active:scale-95 shadow-sm"
              >
                <Plus size={14} />
                <span>Adicionar Linha</span>
              </button>

              <div className="flex gap-3">
                <button 
                  type="button"
                  onClick={() => {
                    setShowPdfReviewModal(false);
                    setParsedPdfProducts([]);
                  }}
                  className="px-4 py-2 border rounded-xl text-slate-600 font-bold text-xs uppercase tracking-wider hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="button"
                  onClick={handleConfirmPdfImport}
                  disabled={isSavingParsed || parsedPdfProducts.filter(p => p.selected).length === 0}
                  className="px-5 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 disabled:opacity-40 hover:from-violet-700 hover:to-indigo-700 text-white font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer active:scale-95 shadow-md flex items-center gap-1.5"
                >
                  {isSavingParsed ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Importando Artigos...</span>
                    </>
                  ) : (
                    <>
                      <span>Importar para Inventário ({parsedPdfProducts.filter(p => p.selected).length})</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Security Manager PIN Modal */}
      <ManagerPINModal 
        isOpen={pinModalOpen}
        onClose={() => setPinModalOpen(false)}
        onSuccess={pinSuccessAction}
        actionName={pinActionName}
      />

      {/* Configure Security PIN Modal */}
      {pinSetupModalOpen && (
        <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-md z-[9999] flex items-center justify-center p-4 min-h-screen overflow-y-auto">
          <div className="bg-white rounded-[32px] border border-slate-100 shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-in fade-in scale-in duration-200">
            {/* Header */}
            <div className="bg-slate-50 border-b border-slate-100 p-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
                  <ShieldAlert size={20} />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm leading-tight">Configurar PIN de Segurança</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Definições de Segurança</p>
                </div>
              </div>
              <button 
                onClick={() => setPinSetupModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-200/50 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-all"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <form 
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const pinVal = (form.elements.namedItem('new_pin') as HTMLInputElement).value;
                const pinConfirm = (form.elements.namedItem('confirm_pin') as HTMLInputElement).value;

                if (!/^\d{4,6}$/.test(pinVal)) {
                  toast.error("O PIN deve conter entre 4 e 6 dígitos numéricos.");
                  return;
                }

                if (pinVal !== pinConfirm) {
                  toast.error("Os PINs introduzidos não coincidem.");
                  return;
                }

                if (!profile?.businessId) {
                  toast.error("Configurações do negócio não encontradas.");
                  return;
                }

                try {
                  const businessRef = doc(db, 'businesses', profile.businessId);
                  await updateDoc(businessRef, { managerPin: pinVal });
                  toast.success("PIN de Segurança atualizado com sucesso!");
                  setPinSetupModalOpen(false);
                } catch (err: any) {
                  console.error("Erro ao atualizar PIN:", err);
                  toast.error("Erro ao atualizar o PIN: " + err.message);
                }
              }}
              className="p-6 space-y-4"
            >
              <div className="space-y-1">
                <p className="text-xs text-slate-500 font-medium leading-relaxed">
                  Defina um código numérico de 4 a 6 dígitos. Este código será solicitado aos colaboradores quando tentarem realizar ajustes rápidos de stock ou mesclagens de produtos duplicados.
                </p>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="block text-[10px] uppercase font-black text-slate-500 font-sans tracking-wider">
                    Novo PIN de Segurança
                  </label>
                  <div className="relative">
                    <input 
                      type="password"
                      name="new_pin"
                      required
                      maxLength={6}
                      placeholder="••••"
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-800 transition-all font-mono tracking-widest font-black"
                    />
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                      <Lock size={15} />
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] uppercase font-black text-slate-500 font-sans tracking-wider">
                    Confirmar Novo PIN
                  </label>
                  <div className="relative">
                    <input 
                      type="password"
                      name="confirm_pin"
                      required
                      maxLength={6}
                      placeholder="••••"
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white text-slate-800 transition-all font-mono tracking-widest font-black"
                    />
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                      <Lock size={15} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="pt-4 border-t border-slate-100 flex gap-3">
                <button
                  type="button"
                  onClick={() => setPinSetupModalOpen(false)}
                  className="flex-1 py-3 border border-slate-200 text-slate-650 rounded-2xl font-bold text-xs hover:bg-slate-50 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-blue-500/10"
                >
                  Salvar PIN <Check size={14} />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Device Camera Barcode Scanner Modal for Inventário */}
      {isInventoryScanning && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[10000] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-[32px] border border-slate-100 shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-in fade-in scale-in duration-200">
            {/* Header */}
            <div className="bg-slate-50 border-b border-slate-100 p-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
                  <Camera size={20} />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm leading-tight">Escanear por Câmara</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Aponte o código para ler</p>
                </div>
              </div>
              <button 
                onClick={() => setIsInventoryScanning(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-200/50 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Video Viewport body */}
            <div className="p-6 flex flex-col items-center justify-center bg-slate-900/5">
              <div className="w-full relative aspect-[4/3] rounded-2xl bg-black border-2 border-dashed border-blue-500/40 overflow-hidden flex items-center justify-center">
                {/* Floating laser line scan effect */}
                <div className="absolute left-0 right-0 h-0.5 bg-red-500/80 shadow-[0_0_10px_#ef4444] top-1/2 transform -translate-y-1/2 animate-[bounce_2s_infinite] z-20 pointer-events-none" />
                
                {/* Video element mounted by BrowserMultiFormatReader */}
                <video id="inventory-scanner-preview" className="w-full h-full object-cover" playsInline muted />
              </div>

              {/* Camera selection dropdown */}
              {inventoryCameras.length > 1 && (
                <div className="mt-4 w-full flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                    Selecionar Câmara / Lente:
                  </label>
                  <select
                    value={inventorySelectedCam}
                    onChange={(e) => setInventorySelectedCam(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 text-slate-800 rounded-xl font-bold text-xs outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    {inventoryCameras.map((cam) => (
                      <option key={cam.deviceId || cam.id} value={cam.deviceId || cam.id}>
                        {cam.label || `Câmara #${(cam.deviceId || cam.id).slice(0, 5)}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <p className="mt-4 text-[10px] text-slate-400 font-bold uppercase text-center tracking-widest leading-normal">
                Suporta: EAN-13, EAN-8, QR Code, Code 128, Code 39
              </p>
            </div>

            {/* Footer buttons */}
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
              <button
                type="button"
                onClick={() => setIsInventoryScanning(false)}
                className="w-full py-3 bg-white border border-slate-250 text-slate-700 rounded-2xl font-bold text-xs hover:bg-slate-100 transition-all cursor-pointer text-center"
              >
                Fechar Câmara
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Barcode Label Modal */}
      {isBarcodeLabelOpen && viewingProduct && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[10001] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-[32px] border border-slate-100 shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-in fade-in scale-in duration-200">
            {/* Header */}
            <div className="bg-slate-50 border-b border-slate-100 p-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
                  <Barcode size={20} />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm leading-tight">Etiqueta de Código de Barras</h3>
                  <p className="text-[10px] text-slate-505 font-bold uppercase tracking-wider font-sans">Visualizar e Imprimir Etiqueta</p>
                </div>
              </div>
              <button 
                onClick={() => setIsBarcodeLabelOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-200/50 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Print Preview Container */}
            <div className="p-8 flex flex-col items-center justify-center bg-slate-100/50">
              <div className="text-xs text-slate-400 font-bold mb-3 uppercase tracking-wider">Pré-visualização da Etiqueta (58mm x 40mm)</div>
              
              {/* Outer physical card representing label */}
              <div 
                id="barcode-printable-label-area"
                className="w-[280px] bg-white border border-slate-300 shadow-sm p-4 flex flex-col items-center justify-center text-center text-black rounded-lg"
                style={{ fontFamily: "'Inter', sans-serif" }}
              >
                <div className="text-xs font-black text-slate-950 truncate max-w-full uppercase tracking-tight mb-0.5" data-no-translate="true">
                  {viewingProduct.name}
                </div>
                <div className="text-sm font-black text-blue-600 mb-2">
                  {(viewingProduct.price || 0).toLocaleString()} {currency}
                </div>
                
                {/* SVG rendered by JsBarcode */}
                <div className="bg-white p-1 flex items-center justify-center">
                  <svg ref={barcodeSvgRef} className="max-w-full" />
                </div>
              </div>
            </div>

            {/* Footer / Print Action Button */}
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
              <button
                type="button"
                onClick={() => setIsBarcodeLabelOpen(false)}
                className="flex-1 py-3 bg-white border border-slate-255 text-slate-700 rounded-2xl font-bold text-xs hover:bg-slate-100 transition-all cursor-pointer text-center"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={() => {
                  const printContent = document.getElementById('barcode-printable-label-area')?.innerHTML;
                  if (!printContent) return;
                  
                  const printWindow = window.open('', '_blank');
                  if (!printWindow) {
                    toast.error("O bloqueador de pop-ups impediu a impressão. Por favor, permita pop-ups.");
                    return;
                  }
                  
                  printWindow.document.write(`
                    <html>
                      <head>
                        <title>Imprimir Etiqueta - ${viewingProduct.name}</title>
                        <style>
                          @page {
                            size: 58mm 40mm;
                            margin: 0;
                          }
                          body {
                            font-family: 'Inter', sans-serif;
                            margin: 0;
                            padding: 10px;
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            justify-content: center;
                            text-align: center;
                            background-color: white;
                            color: black;
                          }
                          .title {
                            font-size: 11px;
                            font-weight: 800;
                            margin-bottom: 2px;
                            max-width: 100%;
                            overflow: hidden;
                            white-space: nowrap;
                            text-overflow: ellipsis;
                            text-transform: uppercase;
                          }
                          .price {
                            font-size: 13px;
                            font-weight: 900;
                            color: #2563EB;
                            margin-bottom: 4px;
                          }
                          svg {
                            max-width: 100%;
                            height: auto;
                          }
                        </style>
                      </head>
                      <body onload="window.print(); window.close();">
                        <div class="title">${viewingProduct.name}</div>
                        <div class="price">${(viewingProduct.price || 0).toLocaleString()} ${currency}</div>
                        ${printContent}
                      </body>
                    </html>
                  `);
                  
                  printWindow.document.close();
                }}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-wider rounded-2xl transition-all cursor-pointer text-center flex items-center justify-center gap-2 shadow-lg shadow-blue-500/10 active:scale-95"
              >
                <Printer size={14} />
                Imprimir Etiqueta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB: VALIDADE (Feature 1: Interactive Expiry & Batch Management Control) */}
      {/* ========================================================================= */}
      {activeTab === 'validade' && !isCreating && !editingProduct && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          className="space-y-6"
        >
          <div className="bg-white border border-slate-100 rounded-3xl p-6 space-y-6 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-black tracking-tight text-slate-950 flex items-center gap-2">
                  <span>⏳ Painel de Gestão de Lotes & Validades</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Visualize todos os lotes de inventário reconciliados e realize abatimentos imediatos de stock vencido ou campanhas de promoção.
                </p>
              </div>
            </div>

            {/* Metrics Grid */}
            {(() => {
              const list: any[] = [];
              products.forEach(p => {
                const recBatches = getReconciledBatches(p.batches || [], p.stockLevel || 0);
                recBatches.forEach(b => {
                  list.push({ product: p, ...b });
                });
              });

              const today = new Date();
              const date30 = new Date();
              date30.setDate(today.getDate() + 30);
              const date90 = new Date();
              date90.setDate(today.getDate() + 90);

              let totalLotes = list.length;
              let expired = 0;
              let critical = 0; // <30 days
              let warning = 0; // <90 days
              let safe = 0;

              list.forEach(b => {
                const expDate = new Date(b.expiryDate);
                if (expDate < today) {
                  expired++;
                } else if (expDate <= date30) {
                  critical++;
                } else if (expDate <= date90) {
                  warning++;
                } else {
                  safe++;
                }
              });

              return (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-1">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-mono font-bold">Total de Lotes</span>
                    <div className="text-2xl font-black text-slate-900">{totalLotes}</div>
                  </div>
                  <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 space-y-1">
                    <span className="text-[10px] text-rose-500 uppercase tracking-wider font-mono font-bold">Lotes Vencidos</span>
                    <div className="text-2xl font-black text-rose-600 flex items-center gap-2">
                      {expired}
                      {expired > 0 && <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />}
                    </div>
                  </div>
                  <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 space-y-1">
                    <span className="text-[10px] text-amber-600 uppercase tracking-wider font-mono font-bold">Crítico (&lt;30 dias)</span>
                    <div className="text-2xl font-black text-amber-600">{critical}</div>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 space-y-1">
                    <span className="text-[10px] text-emerald-600 uppercase tracking-wider font-mono font-bold">Seguros (&gt;90 dias)</span>
                    <div className="text-2xl font-black text-emerald-600">{safe}</div>
                  </div>
                </div>
              );
            })()}

            {/* Local Batch List Component */}
            <BatchValidityList
              products={products}
              profile={profile}
              addStockMovement={addStockMovement}
              setPromoProd={setPromoProd}
              setShowPromoModal={setShowPromoModal}
            />
          </div>
        </motion.div>
      )}

      {/* ========================================================================= */}
      {/* TAB: MOVIMENTAÇÕES (Feature 2: Detailed Stock Movement Ledger)            */}
      {/* ========================================================================= */}
      {activeTab === 'movimentos' && !isCreating && !editingProduct && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          className="space-y-6"
        >
          <StockMovementsLedger profile={profile} activeTab={activeTab} />
        </motion.div>
      )}
    </div>
  );
}
