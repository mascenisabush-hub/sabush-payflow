import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { 
  ShieldAlert, Search, Calendar, Filter, User, ArrowUpDown, ChevronDown, 
  ChevronUp, Download, Eye, RefreshCw, AlertCircle, FileText, ShoppingCart, 
  Tag, Percent, RotateCcw, ShieldCheck 
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { useTranslation } from 'react-i18next';

export interface AuditLog {
  id: string;
  eventType: 'price_override' | 'discount_applied' | 'item_voided' | 'manager_override_used' | 'refund_processed';
  performedBy: {
    uid: string;
    name: string;
    email: string;
  };
  approvedBy?: string;
  originalValue?: string | number | null;
  newValue?: string | number | null;
  reason?: string | null;
  relatedInvoiceId?: string | null;
  cartSessionId?: string | null;
  details?: any;
  timestamp?: any;
}

export default function AuditLogViewer() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const isAdmin = 
    profile?.role === 'owner' || 
    profile?.role === 'business_owner' || 
    profile?.role === 'admin' || 
    profile?.role?.toLowerCase() === 'super_admin';

  useEffect(() => {
    if (!profile?.businessId || !isAdmin) {
      setLoading(false);
      return;
    }

    const logsRef = collection(db, `businesses/${profile.businessId}/auditLogs`);
    const q = query(logsRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedLogs: AuditLog[] = [];
      snapshot.forEach((doc) => {
        fetchedLogs.push({ id: doc.id, ...doc.data() } as AuditLog);
      });

      // Sort logs by timestamp descending (client-side to prevent firestore index requirement crashes)
      fetchedLogs.sort((a, b) => {
        const timeA = a.timestamp?.seconds || (a.timestamp ? new Date(a.timestamp).getTime() / 1000 : 0);
        const timeB = b.timestamp?.seconds || (b.timestamp ? new Date(b.timestamp).getTime() / 1000 : 0);
        return timeB - timeA;
      });

      setLogs(fetchedLogs);
      setLoading(false);
    }, (error) => {
      console.error("Error subscribing to audit logs:", error);
      setLoading(false);
      toast.error("Erro ao carregar registo de auditoria.");
    });

    return () => unsubscribe();
  }, [profile?.businessId, isAdmin]);

  if (!isAdmin) {
    return (
      <div className="p-8 text-center max-w-lg mx-auto bg-white border border-slate-200 rounded-[32px] shadow-sm mt-12 space-y-4">
        <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto">
          <ShieldAlert size={32} />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-black text-slate-900 font-sans uppercase tracking-tight">Acesso Restrito</h2>
          <p className="text-xs text-slate-500 font-medium">
            Esta secção é confidencial e destina-se apenas a Administradores, Gerentes e Proprietários do Sabush ERP.
          </p>
        </div>
      </div>
    );
  }

  // Filter logs
  const filteredLogs = logs.filter(log => {
    // Type Filter
    if (selectedType !== 'all' && log.eventType !== selectedType) return false;

    // Date Filters
    if (startDate) {
      const logTime = log.timestamp?.seconds ? new Date(log.timestamp.seconds * 1000) : null;
      if (logTime && logTime < new Date(startDate)) return false;
    }
    if (endDate) {
      const logTime = log.timestamp?.seconds ? new Date(log.timestamp.seconds * 1000) : null;
      if (logTime) {
        // Set end date to end of the day
        const endLimit = new Date(endDate);
        endLimit.setHours(23, 59, 59, 999);
        if (logTime > endLimit) return false;
      }
    }

    // Search Query (name, email, reason, invoice ID, session, details)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const performerName = log.performedBy?.name?.toLowerCase() || '';
      const performerEmail = log.performedBy?.email?.toLowerCase() || '';
      const reason = log.reason?.toLowerCase() || '';
      const invoiceId = log.relatedInvoiceId?.toLowerCase() || '';
      const sessionId = log.cartSessionId?.toLowerCase() || '';
      const detailsStr = log.details ? JSON.stringify(log.details).toLowerCase() : '';

      return (
        performerName.includes(query) ||
        performerEmail.includes(query) ||
        reason.includes(query) ||
        invoiceId.includes(query) ||
        sessionId.includes(query) ||
        detailsStr.includes(query)
      );
    }

    return true;
  });

  const getEventBadge = (type: AuditLog['eventType']) => {
    switch (type) {
      case 'price_override':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
            <Tag size={12} />
            Substituição de Preço
          </span>
        );
      case 'discount_applied':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <Percent size={12} />
            Desconto Aplicado
          </span>
        );
      case 'item_voided':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
            <AlertCircle size={12} />
            Item Anulado
          </span>
        );
      case 'manager_override_used':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
            <ShieldCheck size={12} />
            Autorização Gerente
          </span>
        );
      case 'refund_processed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
            <RotateCcw size={12} />
            Reembolso / Devolução
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800">
            Evento Geral
          </span>
        );
    }
  };

  const formatTimestamp = (timestamp: any) => {
    if (!timestamp) return '---';
    const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
    return date.toLocaleString('pt-PT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const handleExportCSV = () => {
    if (filteredLogs.length === 0) {
      toast.info("Nenhum registo para exportar.");
      return;
    }

    try {
      const headers = ['Data/Hora', 'Tipo de Evento', 'Colaborador', 'Aprovado por', 'Valor Original', 'Valor Novo', 'Motivo', 'Fatura ID', 'ID Sessão'];
      const rows = filteredLogs.map(log => [
        formatTimestamp(log.timestamp),
        log.eventType,
        `${log.performedBy?.name} (${log.performedBy?.email})`,
        log.approvedBy || '',
        log.originalValue !== undefined && log.originalValue !== null ? `${log.originalValue} MT` : '',
        log.newValue !== undefined && log.newValue !== null ? `${log.newValue} MT` : '',
        log.reason || '',
        log.relatedInvoiceId || '',
        log.cartSessionId || ''
      ]);

      const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
        + [headers.join(','), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');
      
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `auditoria_sabush_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Ficheiro CSV descarregado com sucesso!");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao gerar ficheiro de exportação.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="text-left">
          <div className="flex items-center gap-2">
            <div className="p-2.5 bg-rose-50 rounded-2xl text-rose-500">
              <ShieldAlert size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 font-sans uppercase tracking-tight">Registo de Auditoria de Conformidade</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none">Prevenção de Perdas & Histórico de Operações Especiais</p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleExportCSV}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm self-start md:self-auto border-none"
        >
          <Download size={14} />
          Exportar Registo (CSV)
        </button>
      </div>

      {/* Filters Card */}
      <div className="bg-white border border-slate-200 rounded-[28px] p-5 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search Query */}
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
              <Search size={16} />
            </span>
            <input
              type="text"
              placeholder="Pesquisar por colaborador, motivo, fatura..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-800 outline-none focus:border-rose-400 focus:bg-white transition-all h-10"
            />
          </div>

          {/* Event Type Filter */}
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
              <Filter size={16} />
            </span>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-800 outline-none focus:border-rose-400 focus:bg-white transition-all h-10 appearance-none cursor-pointer"
            >
              <option value="all">Todos os Eventos</option>
              <option value="price_override">Substituições de Preço</option>
              <option value="discount_applied">Descontos Aplicados</option>
              <option value="item_voided">Itens Anulados</option>
              <option value="manager_override_used">Autorizações de Gerente</option>
              <option value="refund_processed">Reembolsos & Devoluções</option>
            </select>
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
              <ChevronDown size={14} />
            </span>
          </div>

          {/* Start Date */}
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
              <Calendar size={16} />
            </span>
            <input
              type="date"
              placeholder="Data Inicial"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-800 outline-none focus:border-rose-400 focus:bg-white transition-all h-10 cursor-pointer"
            />
          </div>

          {/* End Date */}
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
              <Calendar size={16} />
            </span>
            <input
              type="date"
              placeholder="Data Final"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-800 outline-none focus:border-rose-400 focus:bg-white transition-all h-10 cursor-pointer"
            />
          </div>
        </div>

        {/* Filters Summary / Clear triggers */}
        {(selectedType !== 'all' || startDate || endDate || searchQuery) && (
          <div className="flex flex-wrap items-center justify-between pt-1 border-t border-slate-100 gap-2">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              Filtros ativos: {filteredLogs.length} resultados encontrados
            </span>
            <button
              onClick={() => {
                setSelectedType('all');
                setStartDate('');
                setEndDate('');
                setSearchQuery('');
              }}
              className="text-[10px] font-bold text-rose-500 hover:text-rose-600 transition-colors uppercase tracking-widest cursor-pointer border-none bg-transparent"
            >
              Limpar Filtros
            </button>
          </div>
        )}
      </div>

      {/* Main logs display table */}
      <div className="bg-white border border-slate-200 rounded-[28px] overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
            <RefreshCw className="w-8 h-8 animate-spin text-slate-300" />
            <p className="text-xs font-semibold uppercase tracking-wider">A carregar registos...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-3">
            <ShieldCheck className="w-10 h-10 text-slate-200" />
            <div className="space-y-0.5">
              <p className="text-sm font-bold text-slate-700">Nenhum evento registado</p>
              <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Tudo em conformidade ou nenhum filtro correspondeu.</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-150 text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                  <th className="py-4 px-5">Data/Hora</th>
                  <th className="py-4 px-4">Tipo</th>
                  <th className="py-4 px-4">Operador</th>
                  <th className="py-4 px-4">Aprovado por</th>
                  <th className="py-4 px-4">Ajustes / Valores</th>
                  <th className="py-4 px-4">Motivo</th>
                  <th className="py-4 px-5 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.map((log) => {
                  const isExpanded = expandedLogId === log.id;
                  return (
                    <React.Fragment key={log.id}>
                      <tr className={cn(
                        "hover:bg-slate-50/50 text-xs transition-colors",
                        isExpanded && "bg-slate-50/50"
                      )}>
                        {/* Timestamp */}
                        <td className="py-3.5 px-5 font-mono text-slate-600 font-medium">
                          {formatTimestamp(log.timestamp)}
                        </td>

                        {/* Event type badge */}
                        <td className="py-3.5 px-4">
                          {getEventBadge(log.eventType)}
                        </td>

                        {/* Performer User details */}
                        <td className="py-3.5 px-4">
                          <div className="flex flex-col text-left">
                            <span className="font-bold text-slate-800">{log.performedBy?.name || '---'}</span>
                            <span className="text-[9px] text-slate-400 font-mono leading-none mt-0.5">{log.performedBy?.email}</span>
                          </div>
                        </td>

                        {/* Auth Approved by */}
                        <td className="py-3.5 px-4 font-semibold text-slate-700">
                          {log.approvedBy ? (
                            <span className="inline-flex items-center gap-1 text-[10px] text-amber-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                              🔐 {log.approvedBy}
                            </span>
                          ) : (
                            <span className="text-slate-400">---</span>
                          )}
                        </td>

                        {/* Price modifications / adjustments summary */}
                        <td className="py-3.5 px-4">
                          {log.originalValue !== undefined && log.originalValue !== null ? (
                            <div className="flex flex-col text-left">
                              <span className="font-mono text-[10px] font-bold text-slate-700">
                                {Number(log.newValue).toLocaleString()} MT
                              </span>
                              <span className="text-[8px] text-slate-400 font-mono line-through leading-none mt-0.5">
                                Antes: {Number(log.originalValue).toLocaleString()} MT
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400">---</span>
                          )}
                        </td>

                        {/* Custom Override Reason */}
                        <td className="py-3.5 px-4 max-w-xs truncate text-slate-600 font-medium" title={log.reason || ''}>
                          {log.reason || <span className="text-slate-300 italic">Nenhum motivo indicado</span>}
                        </td>

                        {/* Expandable options row button */}
                        <td className="py-3.5 px-5 text-right">
                          <button
                            type="button"
                            onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border border-slate-200 cursor-pointer"
                          >
                            <Eye size={11} />
                            {isExpanded ? 'Ocultar' : 'Detalhes'}
                            {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                          </button>
                        </td>
                      </tr>

                      {/* Expandable nested debug row details */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={7} className="p-4 bg-slate-50/70 border-y border-slate-100">
                            <div className="bg-slate-900 text-slate-100 rounded-2xl p-4 font-mono text-[10px] leading-relaxed max-w-4xl mx-auto shadow-inner text-left overflow-x-auto space-y-3">
                              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                                <span className="text-rose-400 font-bold uppercase tracking-widest text-[9px]">DADOS TÉCNICOS DE AUDITORIA</span>
                                <span className="text-slate-400 text-[9px]">ID DO LOG: {log.id}</span>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-sans text-slate-300">
                                <div className="space-y-1 bg-slate-950 p-3 rounded-xl border border-slate-800">
                                  <p className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Sessão e Identificadores</p>
                                  <p><strong className="text-slate-400">ID Fatura Associada:</strong> {log.relatedInvoiceId || 'Sem fatura associada'}</p>
                                  <p><strong className="text-slate-400">ID Sessão Carrinho:</strong> {log.cartSessionId || 'Sem sessão de venda'}</p>
                                  <p><strong className="text-slate-400">ID Operador (UID):</strong> {log.performedBy?.uid || '---'}</p>
                                </div>
                                <div className="space-y-1 bg-slate-950 p-3 rounded-xl border border-slate-800">
                                  <p className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Valores da Transação</p>
                                  <p><strong className="text-slate-400">Valor Inicial:</strong> {log.originalValue !== undefined && log.originalValue !== null ? `${log.originalValue} MT` : '---'}</p>
                                  <p><strong className="text-slate-400">Valor Final:</strong> {log.newValue !== undefined && log.newValue !== null ? `${log.newValue} MT` : '---'}</p>
                                  <p><strong className="text-slate-400">Diferença:</strong> {log.originalValue !== undefined && log.originalValue !== null && log.newValue !== undefined && log.newValue !== null ? `${Number(log.newValue) - Number(log.originalValue)} MT` : '---'}</p>
                                </div>
                              </div>
                              
                              {log.details && (
                                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                                  <p className="text-[9px] font-black uppercase text-slate-500 tracking-wider mb-1.5 font-sans">Metadados e Objetos de Venda</p>
                                  <pre className="text-amber-300 font-mono text-[9px] whitespace-pre-wrap">
                                    {JSON.stringify(log.details, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
