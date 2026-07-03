import React, { useState } from 'react';
import { Search, AlertCircle, MessageCircle, Filter } from 'lucide-react';
import { cn } from '../lib/utils';
import { formatSystemCurrency } from '../lib/currencies';
import { toast } from 'sonner';

interface ClientInvoiceDebtSectionProps {
  allInvoices: any[];
  customers: any[];
  businessData: any;
  isInvoiceOverdue: (inv: any) => boolean;
  getCustomerName: (customerId: string) => string;
  getCustomerObj: (customerId: string) => any;
  onPayInvoice: (client: any, amount: number, reference: string) => void;
  onViewClient: (client: any) => void;
  sendReminder: (client: any) => void;
  clientPendingOnly: boolean;
  setClientPendingOnly: (val: boolean) => void;
}

export default function ClientInvoiceDebtSection({
  allInvoices,
  customers,
  businessData,
  isInvoiceOverdue,
  getCustomerName,
  getCustomerObj,
  onPayInvoice,
  onViewClient,
  sendReminder,
  clientPendingOnly,
  setClientPendingOnly
}: ClientInvoiceDebtSectionProps) {
  const [clientInvoiceSearch, setClientInvoiceSearch] = useState('');
  const [clientInvoiceStatusFilter, setClientInvoiceStatusFilter] = useState<'all' | 'unpaid' | 'overdue' | 'partially_paid'>('all');
  const [selectedClientFilterId, setSelectedClientFilterId] = useState('all');

  const unpaidInvoices = allInvoices.filter(inv => inv.status !== 'paid' && !inv.archived);
  const totalOutstanding = unpaidInvoices.reduce((acc, inv) => {
    const oBal = inv.outstandingBalance !== undefined ? inv.outstandingBalance : ((inv.total || 0) - (inv.amountPaid || 0));
    return acc + oBal;
  }, 0);
  const overdueInvoices = unpaidInvoices.filter(inv => isInvoiceOverdue(inv));
  const totalOverdue = overdueInvoices.reduce((acc, inv) => {
    const oBal = inv.outstandingBalance !== undefined ? inv.outstandingBalance : ((inv.total || 0) - (inv.amountPaid || 0));
    return acc + oBal;
  }, 0);

  const filtered = allInvoices
    .filter(inv => {
      if (inv.archived) return false;
      
      // 1. Search Filter
      const numStr = (inv.invoiceNumber || '').toString().toLowerCase();
      const matchSearch = numStr.includes(clientInvoiceSearch.toLowerCase());
      
      // 2. Client Filter
      const matchClient = selectedClientFilterId === 'all' || inv.customerId === selectedClientFilterId;
      
      // 3. Status/Pending balance filter (controlled by parent toggle)
      const oBal = inv.outstandingBalance !== undefined ? inv.outstandingBalance : ((inv.total || 0) - (inv.amountPaid || 0));
      const matchPending = !clientPendingOnly || oBal > 0;

      // 4. Status Filter
      if (oBal <= 0 && clientInvoiceStatusFilter !== 'all') return false;

      let matchStatus = true;
      if (clientInvoiceStatusFilter === 'unpaid') {
        matchStatus = inv.status === 'unpaid';
      } else if (clientInvoiceStatusFilter === 'overdue') {
        matchStatus = isInvoiceOverdue(inv);
      } else if (clientInvoiceStatusFilter === 'partially_paid') {
        matchStatus = inv.status === 'partially_paid';
      }

      return matchSearch && matchClient && matchPending && matchStatus;
    })
    .sort((a, b) => {
      const dateA = new Date(a.dueDate || a.date || 0).getTime();
      const dateB = new Date(b.dueDate || b.date || 0).getTime();
      return dateA - dateB; // Urgency order
    });

  return (
    <div className="space-y-6">
      {/* Metrics block for individual invoices */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Dívida Total de Clientes</p>
          <p className="text-3xl font-black text-slate-900">{formatSystemCurrency(totalOutstanding, businessData)}</p>
          <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-wider">{unpaidInvoices.length} faturas pendentes</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-rose-100 shadow-sm bg-rose-50/20">
          <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-1">Dívida Vencida (Atraso)</p>
          <p className="text-3xl font-black text-rose-600">{formatSystemCurrency(totalOverdue, businessData)}</p>
          <p className="text-[10px] text-rose-500 font-bold mt-1 uppercase tracking-wider">{overdueInvoices.length} faturas em atraso</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Taxa de Liquidação</p>
          {(() => {
            const totalInvoicesSum = allInvoices.filter(i => !i.archived).reduce((acc, i) => acc + (i.total || 0), 0);
            const totalPaidSum = allInvoices.filter(i => !i.archived).reduce((acc, i) => acc + (i.amountPaid || 0), 0);
            const pct = totalInvoicesSum > 0 ? Math.round((totalPaidSum / totalInvoicesSum) * 100) : 100;
            return (
              <>
                <p className="text-3xl font-black text-emerald-600">{pct}%</p>
                <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-wider font-semibold">Do total faturado recebido</p>
              </>
            );
          })()}
        </div>
      </div>

      {/* Advanced Search & Filtering Controls */}
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Search with pending filter next to it */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-sm placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500"
              placeholder="Pesquisar por Nº de Fatura..."
              value={clientInvoiceSearch}
              onChange={e => setClientInvoiceSearch(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={() => setClientPendingOnly(!clientPendingOnly)}
            className={cn(
              "px-4 rounded-2xl border flex items-center gap-2 font-bold text-xs uppercase tracking-wider transition-all shadow-sm cursor-pointer whitespace-nowrap shrink-0",
              clientPendingOnly 
                ? "bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-100/80" 
                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
            )}
            title={clientPendingOnly ? "Mostrando apenas saldo pendente" : "Mostrando todos"}
          >
            <Filter size={16} />
            <span className="hidden sm:inline">{clientPendingOnly ? "Pendentes" : "Todos"}</span>
          </button>
        </div>

        <div>
          <select
            value={selectedClientFilterId}
            onChange={e => setSelectedClientFilterId(e.target.value)}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-sm text-slate-700 focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            <option value="all">Todos os Clientes</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={clientInvoiceStatusFilter}
            onChange={e => setClientInvoiceStatusFilter(e.target.value as any)}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-sm text-slate-700 focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            <option value="all">Todos os Estados de Dívida</option>
            <option value="unpaid">Não Pagas</option>
            <option value="overdue">Vencidas (Atrasadas)</option>
            <option value="partially_paid">Parcialmente Pagas</option>
          </select>
        </div>
      </div>

      {/* Count Line */}
      <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider pl-2">
        {clientPendingOnly 
          ? `${filtered.length} com saldo pendente`
          : `${filtered.length} de ${allInvoices.filter(inv => {
              if (inv.archived) return false;
              const numStr = (inv.invoiceNumber || '').toString().toLowerCase();
              const matchSearch = numStr.includes(clientInvoiceSearch.toLowerCase());
              const matchClient = selectedClientFilterId === 'all' || inv.customerId === selectedClientFilterId;
              return matchSearch && matchClient;
            }).length} no total`
        }
      </div>

      {/* Debt Tracking List Table */}
      <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-wider border-b border-slate-100">
                <th className="py-5 px-6">Fatura / Ref</th>
                <th className="py-5 px-6">Cliente</th>
                <th className="py-5 px-6">Valor Total</th>
                <th className="py-5 px-6">Valor em Dívida</th>
                <th className="py-5 px-6">Data de Vencimento</th>
                <th className="py-5 px-6">Estado</th>
                <th className="py-5 px-6 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-sm font-semibold">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400 font-bold text-xs italic">
                    {clientPendingOnly 
                      ? "Nenhuma fatura com saldo pendente encontrada." 
                      : "Nenhuma fatura encontrada com os filtros selecionados."}
                  </td>
                </tr>
              ) : (
                filtered.map(inv => {
                  const oBal = inv.outstandingBalance !== undefined ? inv.outstandingBalance : ((inv.total || 0) - (inv.amountPaid || 0));
                  const overdue = isInvoiceOverdue(inv);
                  
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-5 px-6">
                        <span className="font-black text-slate-900">#{inv.invoiceNumber || 'Venda'}</span>
                        <p className="text-[10px] text-slate-400 font-semibold">{inv.date ? new Date(inv.date).toLocaleDateString() : 'Sem data'}</p>
                      </td>
                      <td className="py-5 px-6 font-black text-slate-700">
                        {getCustomerName(inv.customerId)}
                      </td>
                      <td className="py-5 px-6 font-bold text-slate-500">
                        {formatSystemCurrency(inv.total || 0, businessData)}
                      </td>
                      <td className="py-5 px-6 font-black text-rose-500">
                        {formatSystemCurrency(oBal, businessData)}
                      </td>
                      <td className="py-5 px-6">
                        <span className={cn("font-bold text-xs", overdue ? "text-rose-600 font-black" : "text-slate-600")}>
                          {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : 'Imediato'}
                        </span>
                        {overdue && (
                          <p className="text-[9px] text-rose-500 font-black uppercase tracking-wider mt-0.5">Vencido / Atrasado</p>
                        )}
                      </td>
                      <td className="py-5 px-6">
                        <span className={cn(
                          "px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider",
                          overdue 
                            ? "bg-rose-100 text-rose-700" 
                            : inv.status === 'partially_paid' 
                            ? "bg-amber-100 text-amber-700" 
                            : "bg-slate-100 text-slate-700"
                        )}>
                          {overdue ? 'Vencida' : inv.status === 'partially_paid' ? 'Parcial' : 'Não Paga'}
                        </span>
                      </td>
                      <td className="py-5 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              const clientObj = getCustomerObj(inv.customerId);
                              if (clientObj) {
                                onPayInvoice(clientObj, oBal, `Amortização Fatura #${inv.invoiceNumber}`);
                              } else {
                                toast.error("Impossível liquidar: dados do cliente não encontrados.");
                              }
                            }}
                            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-150 text-emerald-600 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all cursor-pointer"
                          >
                            Liquidar
                          </button>
                          
                          <button
                            onClick={() => {
                              const clientObj = getCustomerObj(inv.customerId);
                              if (clientObj) {
                                onViewClient(clientObj);
                              }
                            }}
                            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all cursor-pointer"
                          >
                            Extrato
                          </button>
                          
                          <button
                            onClick={() => {
                              const clientObj = getCustomerObj(inv.customerId);
                              if (clientObj) {
                                sendReminder(clientObj);
                              }
                            }}
                            className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-xl transition-all cursor-pointer"
                            title="Enviar lembrete de cobrança WhatsApp"
                          >
                            <MessageCircle size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
