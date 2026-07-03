import React, { useState, useMemo } from 'react';
import { Search, Briefcase, Download, ArrowUpRight, ArrowDownLeft, Truck, Filter, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { formatSystemCurrency } from '../lib/currencies';

interface SupplierDebtSectionProps {
  suppliers: any[];
  expenses: any[];
  purchaseOrders: any[];
  supplierPayments: any[];
  selectedSupplier: any;
  setSelectedSupplier: (s: any) => void;
  supplierSearchTerm: string;
  setSupplierSearchTerm: (s: string) => void;
  supplierPendingOnly: boolean;
  setSupplierPendingOnly: (val: boolean) => void;
  filteredSuppliers: any[];
  getSupplierOutstanding: (supplierId: string) => number;
  getSupplierTotalPaid: (supplierId: string) => number;
  getSupplierTotalCommitment: (supplierId: string) => number;
  onRecordPayment: (doc: any, docType: 'expense' | 'purchase_order', oBal: number, title: string) => void;
  generateSupplierStatement: (supplier: any) => void;
  businessData: any;
}

export default function SupplierDebtSection({
  suppliers,
  expenses,
  purchaseOrders,
  supplierPayments,
  selectedSupplier,
  setSelectedSupplier,
  supplierSearchTerm,
  setSupplierSearchTerm,
  supplierPendingOnly,
  setSupplierPendingOnly,
  filteredSuppliers,
  getSupplierOutstanding,
  getSupplierTotalPaid,
  getSupplierTotalCommitment,
  onRecordPayment,
  generateSupplierStatement,
  businessData
}: SupplierDebtSectionProps) {
  const [visibleSupplierTxCount, setVisibleSupplierTxCount] = useState(10);

  // Generate a complete chronological transaction list for the selected supplier (if selected)
  const supplierTransactions = useMemo(() => {
    if (!selectedSupplier) return [];

    const supplierExpenses = expenses
      .filter(e => e.supplierId === selectedSupplier.id)
      .map(e => ({
        id: e.id,
        type: 'purchase',
        title: e.title || 'Compra/Despesa',
        date: e.date || (e.createdAt?.toDate ? e.createdAt.toDate().toISOString() : null),
        amount: e.amount || 0,
        reference: e.reference || '',
        method: e.paymentMethod || 'Crédito'
      }));

    const supplierPOs = purchaseOrders
      .filter(po => po.supplierId === selectedSupplier.id)
      .map(po => ({
        id: po.id,
        type: 'purchase',
        title: `Ordem de Compra #${po.orderNumber}`,
        date: po.date || (po.createdAt?.toDate ? po.createdAt.toDate().toISOString() : null),
        amount: po.totalCost || 0,
        reference: po.orderNumber || '',
        method: po.paymentType === 'credit' ? 'Crédito' : 'Dinheiro'
      }));

    const supplierPaymentsFiltered = supplierPayments
      .filter(p => p.supplierId === selectedSupplier.id)
      .map(p => ({
        id: p.id,
        type: 'payment',
        title: p.notes || 'Amortização Efetuada',
        date: p.date || (p.createdAt?.toDate ? p.createdAt.toDate().toISOString() : null),
        amount: p.amountPaid || p.amount || 0,
        reference: p.purchaseOrderNumber ? `PO #${p.purchaseOrderNumber}` : (p.expenseTitle ? `Despesa: ${p.expenseTitle}` : ''),
        method: p.paymentMethod || 'Dinheiro'
      }));

    return [...supplierExpenses, ...supplierPOs, ...supplierPaymentsFiltered].sort((a, b) => {
      const dateA = a.date ? new Date(a.date).getTime() : 0;
      const dateB = b.date ? new Date(b.date).getTime() : 0;
      return dateB - dateA; // Newest first
    });
  }, [selectedSupplier, expenses, purchaseOrders, supplierPayments]);

  // Reset pagination count when supplier changes
  React.useEffect(() => {
    setVisibleSupplierTxCount(10);
  }, [selectedSupplier]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Supplier List */}
      <div className="lg:col-span-1 space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              className="w-full pl-12 pr-4 py-4 bg-white border border-slate-100 rounded-2xl shadow-sm focus:ring-2 focus:ring-blue-500 outline-none font-bold placeholder:text-slate-400"
              placeholder="Pesquisar fornecedor..."
              value={supplierSearchTerm}
              onChange={e => setSupplierSearchTerm(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setSupplierPendingOnly(!supplierPendingOnly);
              setSelectedSupplier(null);
            }}
            className={cn(
              "px-4 rounded-2xl border flex items-center gap-2 font-bold text-xs uppercase tracking-wider transition-all shadow-sm cursor-pointer whitespace-nowrap shrink-0",
              supplierPendingOnly 
                ? "bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-100/80" 
                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
            )}
            title={supplierPendingOnly ? "Mostrando apenas saldo pendente" : "Mostrando todos"}
          >
            <Filter size={16} />
            <span className="hidden sm:inline">{supplierPendingOnly ? "Com saldo pendente" : "Todos"}</span>
          </button>
        </div>

        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider pl-2">
          {supplierPendingOnly 
            ? `${filteredSuppliers.length} com saldo pendente`
            : `${filteredSuppliers.length} de ${suppliers.filter(s => (s.name || '').toLowerCase().includes(supplierSearchTerm.toLowerCase())).length} no total`
          }
        </div>

        <div className="space-y-3 overflow-y-auto max-h-[60vh] pr-2 scrollbar-hide">
          {filteredSuppliers.map(s => {
            const outstanding = getSupplierOutstanding(s.id);
            const isSelected = selectedSupplier?.id === s.id;

            return (
              <button 
                key={s.id}
                onClick={() => setSelectedSupplier(isSelected ? null : s)}
                className={cn(
                  "w-full p-6 rounded-3xl border-2 transition-all text-left flex items-center gap-4 relative overflow-hidden cursor-pointer",
                  isSelected 
                    ? "bg-slate-900 border-slate-900 shadow-xl shadow-slate-900/10" 
                    : "bg-white border-transparent hover:border-slate-200"
                )}
              >
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg",
                  isSelected ? "bg-white/20 text-white" : "bg-slate-50 text-slate-400"
                )}>
                  {(s.name || 'S')[0]?.toUpperCase()}
                </div>
                
                <div className="flex-1 min-w-0">
                  <p className={cn("font-black truncate", isSelected ? "text-white" : "text-slate-900")}>
                    {s.name}
                  </p>
                  
                  <div className="flex flex-col gap-1 mt-1">
                    <p className={cn("text-xs font-bold", isSelected ? "text-slate-200" : "text-rose-500")}>
                      Passivo: {formatSystemCurrency(outstanding, businessData)}
                    </p>
                    <span className={cn("text-[9px] font-semibold", isSelected ? "text-slate-300" : "text-slate-400")}>
                      {s.category || 'Geral'}
                    </span>
                  </div>
                </div>
                {isSelected && <ArrowUpRight className="text-white" size={20} />}
              </button>
            );
          })}
          
          {filteredSuppliers.length === 0 && (
            <div className="p-8 text-center bg-slate-50 rounded-2xl text-slate-400 text-xs font-bold">
              {supplierPendingOnly 
                ? "Nenhum credor pendente encontrado." 
                : "Nenhum fornecedor encontrado."}
            </div>
          )}
        </div>
      </div>

      {/* Supplier Details View */}
      <div className="lg:col-span-2">
        {selectedSupplier ? (
          <div className="space-y-6">
            <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-8 relative animate-in slide-in-from-right-4">
              {/* Close Button */}
              <button
                onClick={() => setSelectedSupplier(null)}
                className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-all cursor-pointer"
                title="Fechar painel"
              >
                <X size={20} />
              </button>

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pr-8">
                <div>
                  <h3 className="text-3xl font-black text-slate-900">{selectedSupplier.name}</h3>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5 mb-1">ID: {selectedSupplier.id}</p>
                  <p className="text-slate-500 flex items-center gap-2 mt-1 font-bold text-xs uppercase tracking-wider">
                    <Briefcase size={16} />
                    Categoria: {selectedSupplier.category || 'Geral'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => generateSupplierStatement(selectedSupplier)}
                    className="p-4 bg-slate-50 text-slate-600 rounded-2xl hover:bg-slate-100 transition-all flex items-center gap-2 font-bold text-sm cursor-pointer"
                  >
                    <Download size={20} /> Extrato PDF
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-6 bg-slate-50 rounded-[32px]">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Dívida Pendente</p>
                  <p className="text-2xl font-black text-rose-500">{formatSystemCurrency(getSupplierOutstanding(selectedSupplier.id), businessData)}</p>
                </div>
                
                <div className="p-6 bg-slate-50 rounded-[32px]">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Total Pago</p>
                  <p className="text-2xl font-black text-emerald-600">{formatSystemCurrency(getSupplierTotalPaid(selectedSupplier.id), businessData)}</p>
                </div>
                
                <div className="p-6 bg-slate-50 rounded-[32px]">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Limite do Crédito</p>
                  <p className="text-2xl font-black text-slate-900">
                    {selectedSupplier.creditLimit ? formatSystemCurrency(selectedSupplier.creditLimit, businessData) : 'Não Definido'}
                  </p>
                </div>

                <div className="p-6 bg-slate-50 rounded-[32px]">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Compromisso Total</p>
                  <p className="text-2xl font-black text-slate-900">{formatSystemCurrency(getSupplierTotalCommitment(selectedSupplier.id), businessData)}</p>
                </div>
              </div>

              {/* List Expenses & POs with pending balances */}
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest text-left">Faturas e Ordens de Compra Pendentes</h4>
                
                <div className="space-y-3 max-h-[30vh] overflow-y-auto pr-2">
                  {(() => {
                    const supplierExpenses = expenses
                      .filter(e => e.supplierId === selectedSupplier.id)
                      .map(e => ({ ...e, docType: 'expense' }));
                    const supplierPOs = purchaseOrders
                      .filter(po => po.supplierId === selectedSupplier.id && po.paymentType === 'credit')
                      .map(po => ({ ...po, docType: 'purchase_order' }));
                    const combinedDocs = [...supplierExpenses, ...supplierPOs].sort((a, b) => {
                      const dateA = new Date(a.date || a.createdAt?.toDate?.() || 0).getTime();
                      const dateB = new Date(b.date || b.createdAt?.toDate?.() || 0).getTime();
                      return dateB - dateA;
                    });

                    if (combinedDocs.length === 0) {
                      return (
                        <p className="text-slate-400 text-xs italic text-center py-6">
                          Nenhuma despesa ou ordem de compra ativa para este fornecedor.
                        </p>
                      );
                    }

                    return combinedDocs.map((doc, idx) => {
                      const title = doc.docType === 'expense' ? doc.title : `Ordem de Compra #${doc.orderNumber}`;
                      const oBal = doc.outstandingBalance !== undefined ? doc.outstandingBalance : ((doc.totalCost || doc.amount || 0) - (doc.paidAmount || doc.amountPaid || 0));
                      const total = doc.totalCost || doc.amount || 0;
                      const hasDebt = oBal > 0;

                      return (
                        <div key={idx} className="flex items-center justify-between p-5 bg-slate-50 hover:bg-slate-100 rounded-3xl transition-all border border-transparent hover:border-slate-100">
                          <div className="min-w-0 flex-1 pr-4 text-left">
                            <span className={cn(
                              "px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider mb-1.5 inline-block",
                              doc.docType === 'expense' ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                            )}>
                              {doc.docType === 'expense' ? 'Despesa' : 'Ordem Compra'}
                            </span>
                            <h5 className="font-black text-slate-900 truncate text-sm">{title}</h5>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                              {doc.date ? new Date(doc.date).toLocaleDateString() : 'N/A'} • Vence: {doc.dueDate || 'Imediato'}
                            </p>
                          </div>

                          <div className="text-right shrink-0 flex items-center gap-4">
                            <div>
                              <p className="font-black text-rose-500 text-sm">
                                {formatSystemCurrency(oBal, businessData)} em dívida
                              </p>
                              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                                Total: {formatSystemCurrency(total, businessData)}
                              </p>
                            </div>

                            {hasDebt && (
                              <button
                                onClick={() => {
                                  onRecordPayment(doc, doc.docType as any, oBal, title);
                                }}
                                className="px-4 py-2 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-850 transition-all cursor-pointer"
                              >
                                Pagar
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              {/* Complete Chronological Transaction Timeline */}
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest text-left">Histórico de Transações (Extrato Cronológico)</h4>
                
                <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-2">
                  {supplierTransactions.slice(0, visibleSupplierTxCount).map((tx, idx) => {
                    const isPurchase = tx.type === 'purchase';
                    return (
                      <div key={idx} className="flex items-center gap-4 p-4 hover:bg-slate-50 rounded-2xl transition-all border border-slate-50">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                          isPurchase ? "bg-rose-50 text-rose-500" : "bg-emerald-50 text-emerald-600"
                        )}>
                          {isPurchase ? <ArrowUpRight size={20} /> : <ArrowDownLeft size={20} />}
                        </div>
                        
                        <div className="flex-1 min-w-0 text-left">
                          <p className="font-black text-slate-900 truncate">
                            {tx.title}
                          </p>
                          <p className="text-xs font-bold text-slate-400 truncate">
                            {tx.date ? new Date(tx.date).toLocaleDateString() : '-'} • Método: {tx.method} {tx.reference ? `(${tx.reference})` : ''}
                          </p>
                        </div>

                        <p className={cn("font-black text-right whitespace-nowrap text-sm", isPurchase ? "text-rose-500" : "text-emerald-600")}>
                          {isPurchase ? `+${formatSystemCurrency(tx.amount, businessData)}` : `-${formatSystemCurrency(tx.amount, businessData)}`}
                        </p>
                      </div>
                    );
                  })}

                  {supplierTransactions.length === 0 && (
                    <p className="text-slate-400 text-xs italic text-center py-6">Nenhum histórico disponível para este fornecedor.</p>
                  )}

                  {supplierTransactions.length > visibleSupplierTxCount && (
                    <div className="pt-2 text-center">
                      <button
                        type="button"
                        onClick={() => setVisibleSupplierTxCount(prev => prev + 10)}
                        className="px-4 py-2 text-xs font-black uppercase tracking-widest text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-full cursor-pointer transition-all"
                      >
                        + Ver Mais ({supplierTransactions.length - visibleSupplierTxCount} restantes)
                      </button>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center bg-white rounded-[40px] border border-slate-100 py-24 text-slate-300">
            <div className="p-8 bg-slate-50 rounded-full mb-6">
              <Truck size={64} className="opacity-10" />
            </div>
            <p className="font-black uppercase tracking-widest text-xs">Selecione um fornecedor para gerir o passivo</p>
          </div>
        )}
      </div>
    </div>
  );
}
