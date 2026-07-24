import React, { useState, useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { collection, query, getDocs, limit } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, X, FileText, Package, User, Loader2, ArrowRight, 
  ExternalLink, DollarSign, Tag, Clipboard, Eye, Calendar,
  TrendingDown, CheckCircle, Clock, AlertTriangle, Printer, Download
} from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { generateInvoicePDF } from '../lib/pdfGenerator';

interface GlobalSearchProps {
  setCurrentTab: (tab: string) => void;
}

type FilterCategory = 'all' | 'invoice' | 'product' | 'customer';

export default function GlobalSearch({ setCurrentTab }: GlobalSearchProps) {
  const { profile, businessData } = useAuth();
  const businessId = profile?.businessId || 'demo_business_123';
  const currency = businessData?.currency || 'MZN';

  const [searchQuery, setSearchQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState<FilterCategory>('all');

  // Datasets
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);

  // Selected item for Quick View modal
  const [quickViewItem, setQuickViewItem] = useState<{
    type: 'invoice' | 'product' | 'customer';
    data: any;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasLoaded = useRef(false);

  // Close search results dropdown on clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Set up Keyboard Shortcut Ctrl+Space / Cmd+Space to focus search bar
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && (e.key === ' ' || e.code === 'Space')) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const loadSearchData = async () => {
    if (hasLoaded.current) return;
    setLoading(true);
    try {
      // safe queries without orderBy to prevent missing indexes failures
      const customersSnap = await getDocs(collection(db, `businesses/${businessId}/customers`));
      const fetchedCustomers = customersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      const productsSnap = await getDocs(collection(db, `businesses/${businessId}/products`));
      const fetchedProducts = productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      const invoicesSnap = await getDocs(
        query(collection(db, `businesses/${businessId}/invoices`), limit(200))
      );
      const fetchedInvoices = invoicesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      setCustomers(fetchedCustomers);
      setProducts(fetchedProducts);
      setInvoices(fetchedInvoices);
      hasLoaded.current = true;
    } catch (err) {
      console.error('[GlobalSearch] Error pre-loading search index:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
    loadSearchData();
  };

  // Searching algorithm (instantaneous client-side filtering)
  const getFilteredResults = () => {
    const qLower = searchQuery.toLowerCase().trim();
    if (qLower === '') return { invoices: [], products: [], customers: [] };

    const filteredInvoices = invoices.filter(inv => {
      const invNum = (inv.invoiceNumber || '').toLowerCase();
      const custName = (inv.customerName || '').toLowerCase();
      const opName = (inv.operatorName || '').toLowerCase();
      const totalAmount = String(inv.total || '');
      const state = (inv.paymentStatus || '').toLowerCase();
      return invNum.includes(qLower) || custName.includes(qLower) || opName.includes(qLower) || totalAmount.includes(qLower) || state.includes(qLower);
    });

    const filteredProducts = products.filter(prod => {
      const name = (prod.name || '').toLowerCase();
      const category = (prod.category || '').toLowerCase();
      const barcode = (prod.barcode || '').toLowerCase();
      const sku = (prod.sku || '').toLowerCase();
      const desc = (prod.description || '').toLowerCase();
      return name.includes(qLower) || category.includes(qLower) || barcode.includes(qLower) || sku.includes(qLower) || desc.includes(qLower);
    });

    const filteredCustomers = customers.filter(cust => {
      const name = (cust.name || '').toLowerCase();
      const phone = (cust.phone || '').toLowerCase();
      const email = (cust.email || '').toLowerCase();
      const tax = (cust.taxId || '').toLowerCase();
      return name.includes(qLower) || phone.includes(qLower) || email.includes(qLower) || tax.includes(qLower);
    });

    return {
      invoices: activeCategory === 'all' || activeCategory === 'invoice' ? filteredInvoices.slice(0, 5) : [],
      products: activeCategory === 'all' || activeCategory === 'product' ? filteredProducts.slice(0, 5) : [],
      customers: activeCategory === 'all' || activeCategory === 'customer' ? filteredCustomers.slice(0, 5) : []
    };
  };

  const results = getFilteredResults();
  const hasResults = results.invoices.length > 0 || results.products.length > 0 || results.customers.length > 0;

  const navigateToModule = (tab: string, itemId?: string) => {
    setIsFocused(false);
    setSearchQuery('');
    
    if (itemId) {
      if (tab === 'invoices') {
        sessionStorage.setItem('highlight_invoice_id', itemId);
      } else if (tab === 'inventory') {
        sessionStorage.setItem('highlight_product_id', itemId);
      } else if (tab === 'customers') {
        sessionStorage.setItem('highlight_customer_id', itemId);
      }
    }
    
    setCurrentTab(tab);
    toast.success(`Navegando para o módulo correspondente`);
  };

  const handleDownloadPDF = (invoice: any) => {
    try {
      const companyInfo = {
        name: businessData?.name || 'Sabush System Client',
        taxId: businessData?.taxId || '',
        phone: businessData?.phone || '',
        address: businessData?.address || '',
        logoUrl: businessData?.logoUrl || '',
        email: businessData?.email || '',
        paymentInstructions: businessData?.paymentInstructions || '',
        paymentTerms: businessData?.paymentTerms || '',
      };
      generateInvoicePDF(invoice, companyInfo, { save: true });
      toast.success('Descarregamento do PDF iniciado');
    } catch (e: any) {
      toast.error('Erro ao gerar PDF: ' + e.message);
    }
  };

  return (
    <div id="global_search_container" className="relative flex-1 max-w-sm md:max-w-md mx-4 lg:mx-8" ref={containerRef}>
      {/* Input Field */}
      <div className="relative group">
        <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-500 transition-colors">
          <Search size={16} />
        </span>
        <input
          ref={inputRef}
          type="text"
          placeholder="Pesquisa rápida (Ctrl+Space)..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={handleFocus}
          className="w-full pl-10 pr-16 py-2.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/80 outline-none text-xs font-semibold text-slate-800 transition-all placeholder:text-slate-450 focus:bg-white shadow-sm"
        />
        {searchQuery ? (
          <button
            onClick={() => {
              setSearchQuery('');
              inputRef.current?.focus();
            }}
            className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={14} />
          </button>
        ) : (
          <span className="hidden md:flex absolute inset-y-0 right-0 pr-3 items-center pointer-events-none">
            <kbd className="px-1.5 py-0.5 bg-slate-200 border border-slate-300 rounded font-mono text-[9px] font-black text-slate-550 select-none shadow-sm capitalize animate-pulse">
              ctrl space
            </kbd>
          </span>
        )}
      </div>

      {/* Floating Dropdown Results */}
      <AnimatePresence>
        {isFocused && (searchQuery.trim() !== '' || loading) && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 right-0 mt-2 bg-white/95 border border-slate-200/90 rounded-[24px] shadow-2xl z-[9999] overflow-hidden backdrop-blur-xl flex flex-col max-h-[80vh]"
          >
            {/* Filter Pills of Search Category */}
            <div className="flex bg-slate-50/80 p-2 border-b border-slate-100 items-center justify-between gap-1.5">
              <div className="flex gap-1">
                {(['all', 'invoice', 'product', 'customer'] as FilterCategory[]).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer",
                      activeCategory === cat 
                        ? "bg-slate-900 text-white shadow-sm" 
                        : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                    )}
                  >
                    {cat === 'all' && 'Todos'}
                    {cat === 'invoice' && 'Faturas'}
                    {cat === 'product' && 'Produtos'}
                    {cat === 'customer' && 'Clientes'}
                  </button>
                ))}
              </div>
              
              {loading && (
                <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400">
                  <Loader2 size={10} className="animate-spin text-blue-500" />
                  Indexando...
                </div>
              )}
            </div>

            {/* Results Grid / List */}
            <div className="p-3 overflow-y-auto space-y-4 flex-1">
              {!loading && !hasResults && (
                <div className="py-8 text-center space-y-2">
                  <span className="text-2xl">🔍</span>
                  <p className="text-xs font-bold text-slate-800">Sem resultados para "{searchQuery}"</p>
                  <p className="text-[10px] text-slate-400 font-medium">Verifique os dados ou tente outra pesquisa.</p>
                </div>
              )}

              {/* GROUP: INVOICES */}
              {results.invoices.length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="px-2 text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                    <FileText size={11} className="text-blue-500" />
                    Faturas ({results.invoices.length})
                  </h4>
                  <div className="space-y-1">
                    {results.invoices.map((inv) => (
                      <div
                        key={inv.id}
                        onClick={() => setQuickViewItem({ type: 'invoice', data: inv })}
                        className="flex items-center justify-between p-2.5 bg-slate-50/50 hover:bg-slate-100/80 rounded-xl border border-slate-100 transition-all cursor-pointer group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 font-bold font-mono text-[9px]">
                            FT
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-extrabold text-slate-800 group-hover:text-blue-600 transition-colors truncate">
                              #{inv.invoiceNumber}
                            </p>
                            <p className="text-[10px] text-slate-500 font-semibold truncate">
                              {inv.customerName || 'Consumidor Final'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-black text-slate-900 font-mono">
                            {(inv.total || 0).toLocaleString()} {currency}
                          </p>
                          <span className={cn(
                            "inline-block text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full mt-0.5",
                            inv.paymentStatus === 'paid' ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-amber-50 text-amber-600 border border-amber-100"
                          )}>
                            {inv.paymentStatus === 'paid' ? 'Pago' : 'Pendente'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* GROUP: PRODUCTS */}
              {results.products.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <h4 className="px-2 text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                    <Package size={11} className="text-amber-500" />
                    Produtos / Inventário ({results.products.length})
                  </h4>
                  <div className="space-y-1">
                    {results.products.map((prod) => {
                      const isLowStock = (prod.stockLevel || 0) <= (prod.lowStockThreshold || 5);
                      return (
                        <div
                          key={prod.id}
                          onClick={() => setQuickViewItem({ type: 'product', data: prod })}
                          className="flex items-center justify-between p-2.5 bg-slate-50/50 hover:bg-slate-100/80 rounded-xl border border-slate-100 transition-all cursor-pointer group"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 font-bold font-mono text-[9px]">
                              PR
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-extrabold text-slate-800 group-hover:text-amber-600 transition-colors truncate">
                                {prod.name}
                              </p>
                              <p className="text-[10px] text-slate-500 font-semibold truncate">
                                {prod.sku || prod.barcode || 'Sem SKU'}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-black text-slate-900 font-mono">
                              {(prod.price || 0).toLocaleString()} {currency}
                            </p>
                            <span className={cn(
                              "inline-block text-[8px] font-black uppercase px-2 py-0.5 rounded-full mt-0.5",
                              isLowStock ? "bg-rose-50 text-rose-600 border border-rose-100" : "bg-emerald-50 text-emerald-600 border border-emerald-100"
                            )}>
                              Stock: {prod.stockLevel || 0} {prod.baseUnitLabel || 'Un'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* GROUP: CUSTOMERS */}
              {results.customers.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <h4 className="px-2 text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                    <User size={11} className="text-indigo-500" />
                    Clientes ({results.customers.length})
                  </h4>
                  <div className="space-y-1">
                    {results.customers.map((cust) => (
                      <div
                        key={cust.id}
                        onClick={() => setQuickViewItem({ type: 'customer', data: cust })}
                        className="flex items-center justify-between p-2.5 bg-slate-50/50 hover:bg-slate-100/80 rounded-xl border border-slate-100 transition-all cursor-pointer group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold font-mono text-[9px]">
                            CL
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-extrabold text-slate-800 group-hover:text-indigo-600 transition-colors truncate">
                              {cust.name}
                            </p>
                            <p className="text-[10px] text-slate-500 font-semibold truncate">
                              📞 {cust.phone || 'Sem telefone'} • {cust.email || 'Sem email'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-tight">Dívida</p>
                          <p className="text-xs font-black text-slate-900 font-mono">
                            {(cust.outstandingBalance || 0).toLocaleString()} {currency}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer tips */}
            <div className="p-2 border-t border-slate-150 bg-slate-50/60 text-center text-[9px] font-black uppercase tracking-wider text-slate-400 font-mono select-none">
              Dica: Clique num item para abrir a Ficha de Vista Rápida
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* QUICK VIEW GLOBAL MODAL SHEET */}
      <AnimatePresence>
        {quickViewItem && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[10000] flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[32px] w-full max-w-lg max-h-[90vh] overflow-y-auto border border-slate-100 shadow-2xl flex flex-col"
            >
              {/* Modal Header */}
              <div className="p-6 pb-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2.5">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow-sm",
                    quickViewItem.type === 'invoice' ? "bg-blue-600" :
                    quickViewItem.type === 'product' ? "bg-amber-500" : "bg-indigo-600"
                  )}>
                    {quickViewItem.type === 'invoice' && <FileText size={20} />}
                    {quickViewItem.type === 'product' && <Package size={20} />}
                    {quickViewItem.type === 'customer' && <User size={20} />}
                  </div>
                  <div>
                    <span className="text-[9px] uppercase font-black tracking-widest text-slate-400 font-mono block">Vista Rápida Global</span>
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">
                      {quickViewItem.type === 'invoice' && `Fatura #${quickViewItem.data.invoiceNumber}`}
                      {quickViewItem.type === 'product' && quickViewItem.data.name}
                      {quickViewItem.type === 'customer' && quickViewItem.data.name}
                    </h3>
                  </div>
                </div>
                <button
                  onClick={() => setQuickViewItem(null)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors hover:text-slate-900 cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-6 space-y-4 overflow-y-auto max-h-[60vh] text-left">
                {/* 1) INVOICE QUICK DETAILS */}
                {quickViewItem.type === 'invoice' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                        <span className="block text-[8px] font-black uppercase text-slate-400 tracking-wider font-mono">Status de Pagamento</span>
                        <div className="mt-1 flex items-center gap-1.5">
                          {quickViewItem.data.paymentStatus === 'paid' ? (
                            <>
                              <CheckCircle size={14} className="text-emerald-500" />
                              <span className="text-xs font-extrabold text-emerald-600 uppercase">Liquidada</span>
                            </>
                          ) : (
                            <>
                              <Clock size={14} className="text-amber-500 animate-pulse" />
                              <span className="text-xs font-extrabold text-amber-600 uppercase">Pendente</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                        <span className="block text-[8px] font-black uppercase text-slate-400 tracking-wider font-mono">Valor Total</span>
                        <p className="mt-0.5 text-sm font-black font-mono text-slate-900">
                          {(quickViewItem.data.total || 0).toLocaleString()} {currency}
                        </p>
                      </div>

                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                        <span className="block text-[8px] font-black uppercase text-slate-400 tracking-wider font-mono">Data Emissão</span>
                        <p className="mt-0.5 text-xs font-extrabold text-slate-800">
                          {quickViewItem.data.createdAt ? new Date(quickViewItem.data.createdAt.seconds * 1000).toLocaleDateString('pt-PT') : 'Sem data'}
                        </p>
                      </div>

                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                        <span className="block text-[8px] font-black uppercase text-slate-400 tracking-wider font-mono">Operador Técnico</span>
                        <p className="mt-0.5 text-xs font-extrabold text-slate-800">
                          {quickViewItem.data.operatorName || 'Administrador'}
                        </p>
                      </div>
                    </div>

                    <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100/50">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Cliente Associado</p>
                      <p className="text-xs font-black text-slate-800 mt-1">{quickViewItem.data.customerName || 'Consumidor Final'}</p>
                      <p className="text-[10px] text-slate-500 font-semibold mt-0.5">📞 {quickViewItem.data.customerPhone || 'Não especificado'}</p>
                    </div>

                    {/* Items on invoice if existing */}
                    {quickViewItem.data.items && quickViewItem.data.items.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[9px] uppercase font-black text-slate-400 tracking-widest font-mono">Artigos Detalhados</p>
                        <div className="bg-slate-50 border border-slate-100 rounded-2xl overflow-hidden divide-y divide-slate-100">
                          {quickViewItem.data.items.map((item: any, i: number) => (
                            <div key={i} className="p-3 flex justify-between items-center text-xs">
                              <div>
                                <p className="font-extrabold text-slate-800">{item.name}</p>
                                <p className="text-[10px] text-slate-500 font-semibold">
                                  {item.quantity} x {item.price?.toLocaleString()} {currency}
                                </p>
                              </div>
                              <p className="font-black text-slate-900 font-mono">
                                {((item.quantity || 1) * (item.price || 0)).toLocaleString()} {currency}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 2) PRODUCT QUICK DETAILS */}
                {quickViewItem.type === 'product' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                        <span className="block text-[8px] font-black uppercase text-slate-400 tracking-wider font-mono">Preço de Venda</span>
                        <p className="mt-0.5 text-sm font-black font-mono text-emerald-600">
                          {(quickViewItem.data.price || 0).toLocaleString()} {currency}
                        </p>
                      </div>

                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                        <span className="block text-[8px] font-black uppercase text-slate-400 tracking-wider font-mono">Preço de Custo</span>
                        <p className="mt-0.5 text-sm font-black font-mono text-slate-600">
                          {(quickViewItem.data.costPrice || 0).toLocaleString()} {currency}
                        </p>
                      </div>

                      <div className="bg-slate-55 p-3 rounded-2xl border border-slate-100 bg-slate-50">
                        <span className="block text-[8px] font-black uppercase text-slate-400 tracking-wider font-mono">Nível de Stock Físico</span>
                        <p className={cn(
                          "mt-0.5 text-sm font-black font-mono",
                          (quickViewItem.data.stockLevel || 0) <= (quickViewItem.data.lowStockThreshold || 5) ? "text-rose-600 animate-pulse" : "text-emerald-600"
                        )}>
                          {quickViewItem.data.stockLevel || 0} {quickViewItem.data.baseUnitLabel || 'Un'}
                        </p>
                      </div>

                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                        <span className="block text-[8px] font-black uppercase text-slate-400 tracking-wider font-mono">Limite Configurado</span>
                        <p className="mt-0.5 text-xs font-extrabold text-slate-800">
                          Aviso {quickViewItem.data.lowStockThreshold || 5} {quickViewItem.data.baseUnitLabel || 'Un'}
                        </p>
                      </div>
                    </div>

                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-1.5">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-slate-400">Categoria:</span>
                        <span className="text-slate-800 font-extrabold">{quickViewItem.data.category || 'Não categorizada'}</span>
                      </div>
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-slate-400">Código de Barras:</span>
                        <span className="text-slate-800 font-mono font-bold">{quickViewItem.data.barcode || 'Sem código'}</span>
                      </div>
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-slate-400">SKU de Identificação:</span>
                        <span className="text-slate-800 font-mono font-bold">{quickViewItem.data.sku || 'Sem SKU'}</span>
                      </div>
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-slate-400">Localização / Gôndola:</span>
                        <span className="text-slate-800 font-bold">{quickViewItem.data.location || 'Não definida'}</span>
                      </div>
                    </div>

                    {quickViewItem.data.description && (
                      <div className="p-3 border border-slate-100 bg-amber-50/20 text-slate-600 rounded-xl text-xs font-semibold leading-relaxed">
                        <span className="block font-black text-[8px] tracking-widest text-[#D4AF37] mb-1 font-mono uppercase">Observações / Descrição</span>
                        {quickViewItem.data.description}
                      </div>
                    )}
                  </div>
                )}

                {/* 3) CUSTOMER QUICK DETAILS */}
                {quickViewItem.type === 'customer' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-rose-50/50 p-3 rounded-2xl border border-rose-100/60">
                        <span className="block text-[8px] font-black uppercase text-rose-600/70 tracking-wider font-mono">Dívida Ativa Atual</span>
                        <p className="mt-0.5 text-sm font-black font-mono text-rose-700">
                          {(quickViewItem.data.outstandingBalance || 0).toLocaleString()} {currency}
                        </p>
                      </div>

                      <div className="bg-emerald-50/50 p-3 rounded-2xl border border-emerald-100/60">
                        <span className="block text-[8px] font-black uppercase text-emerald-600/70 tracking-wider font-mono">Crédito Disponibilizado</span>
                        <p className="mt-0.5 text-sm font-black font-mono text-emerald-700">
                          {(quickViewItem.data.creditLimit || 0).toLocaleString()} {currency}
                        </p>
                      </div>
                    </div>

                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2 text-xs font-semibold">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Nacionalidade / Morada:</span>
                        <span className="text-slate-800 font-bold">{quickViewItem.data.address || 'Não cadastrada'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Contacto Móvel:</span>
                        <span className="text-slate-800 font-bold font-mono">{quickViewItem.data.phone || 'Sem contacto'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Endereço de E-mail:</span>
                        <span className="text-slate-800 font-bold">{quickViewItem.data.email || 'Não associado'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Documento Fiscal (NUIT / Tax ID):</span>
                        <span className="text-slate-800 font-bold font-mono">{quickViewItem.data.taxId || 'Consumidor Geral'}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer (Action Controllers) */}
              <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-3">
                <button
                  type="button"
                  onClick={() => setQuickViewItem(null)}
                  className="flex-1 py-3 text-xs font-extrabold uppercase text-slate-500 bg-white border border-slate-200 rounded-2xl hover:bg-slate-55 transition-all text-center select-none cursor-pointer"
                >
                  Voltar
                </button>

                {/* PDF Download for invoice */}
                {quickViewItem.type === 'invoice' && (
                  <button
                    type="button"
                    onClick={() => handleDownloadPDF(quickViewItem.data)}
                    className="flex justify-center items-center gap-1.5 px-4 py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-200/50 rounded-2xl text-xs font-black uppercase transition-all select-none cursor-pointer"
                    title="Descarregar PDF"
                  >
                    <Download size={14} />
                    <span>PDF</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    const type = quickViewItem.type;
                    const id = quickViewItem.data.id;
                    setQuickViewItem(null);
                    if (type === 'invoice') {
                      navigateToModule('invoices', id);
                    } else if (type === 'product') {
                      navigateToModule('inventory', id);
                    } else {
                      navigateToModule('customers', id);
                    }
                  }}
                  className="flex-1 py-3 text-xs font-extrabold uppercase text-white bg-slate-900 rounded-2xl hover:bg-blue-600 transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95 cursor-pointer select-none"
                >
                  <span>Ir para Detalhes</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
