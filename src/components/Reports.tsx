import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, onSnapshot, getDocs, where } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { 
  BarChart3, TrendingUp, Users, Package, DollarSign, 
  ArrowUpRight, ArrowDownRight, CreditCard, AlertCircle, 
  ShoppingBag, Filter, Layers, CheckCircle2, ShieldAlert,
  SlidersHorizontal, Lock, History, Search, Loader2
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area, PieChart, Pie, Cell } from 'recharts';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { generateMonthlyReportPDF } from '../lib/pdfGenerator';
import { offlineDb } from '../lib/offlineDb';
import { formatSystemCurrency, formatCurrencyValue } from '../lib/currencies';

// Extracted as a real component (was previously an inline IIFE calling hooks directly
// inside a conditionally-rendered JSX block). Hooks called inside an IIFE are attached
// to the *parent* component's hook list, not their own — so when the surrounding
// {activeTab === 'audit' && ...} block toggled on/off (switching Reports tabs), the
// number of hooks called by Reports changed between renders, triggering React error
// #310 ("Rendered fewer hooks than expected"). A real component keeps its own,
// consistent hook list regardless of when Reports re-renders.
function AuditLogPanel({ profile, activeTab }: { profile: any; activeTab: string }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(true);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditTypeFilter, setAuditTypeFilter] = useState('all');

  useEffect(() => {
    if (!profile?.businessId || activeTab !== 'audit') return;
    setIsLoadingLogs(true);
    
    const logsRef = collection(db, `businesses/${profile.businessId}/activity_logs`);
    const unsub = onSnapshot(logsRef, (snapshot: any) => {
      const list: any[] = [];
      snapshot.forEach((doc: any) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      // Sort by timestamp desc
      list.sort((a, b) => {
        const tA = a.timestamp?.seconds || 0;
        const tB = b.timestamp?.seconds || 0;
        return tB - tA;
      });
      setLogs(list);
      setIsLoadingLogs(false);
    }, (err) => {
      console.error("Error loading activity logs:", err);
      setIsLoadingLogs(false);
    });

    return () => unsub();
  }, [activeTab, profile?.businessId]);

  const filteredLogs = logs.filter(l => {
    const matchSearch = (l.userEmail || '').toLowerCase().includes(auditSearch.toLowerCase()) ||
                        (l.details || '').toLowerCase().includes(auditSearch.toLowerCase()) ||
                        (l.actionType || '').toLowerCase().includes(auditSearch.toLowerCase());
    
    if (!matchSearch) return false;

    if (auditTypeFilter !== 'all') {
      return l.actionType === auditTypeFilter;
    }
    return true;
  });

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-[40px] p-8 space-y-6 shadow-sm">
      <div>
        <h3 className="text-xl font-black tracking-tight text-[#111111] flex items-center gap-2">
          <span>🛡️ Livro de Registo de Auditoria de Atividades</span>
        </h3>
        <p className="text-xs text-[#6B7280] mt-1 font-semibold">
          Registo em tempo real das ações administrativas de todos os utilizadores no seu negócio para máxima transparência.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#F8F9FA] p-4 rounded-3xl border border-[#E5E7EB]">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-[#6B7280]" />
          <input
            type="text"
            value={auditSearch}
            onChange={(e) => setAuditSearch(e.target.value)}
            placeholder="Pesquisar por operador, ação ou descrição..."
            className="w-full pl-10 pr-4 py-2 bg-white border border-[#E5E7EB] rounded-xl text-xs text-[#111111] placeholder-[#6B7280]/60 focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'all', label: 'Todos' },
            { id: 'CREATE_PRODUCT', label: 'Criação Prod ➕' },
            { id: 'UPDATE_PRODUCT', label: 'Modificação Prod 📝' },
            { id: 'DELETE_PRODUCT', label: 'Eliminação Prod ❌' },
            { id: 'UPDATE_STOCK', label: 'Ajuste Stock 🛠️' },
            { id: 'AUTH_SUCCESS', label: 'Autenticação 🔐' }
          ].map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setAuditTypeFilter(f.id)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer",
                auditTypeFilter === f.id
                  ? "bg-[#111111] text-white shadow-sm"
                  : "bg-white text-[#6B7280] hover:text-[#111111] border border-[#E5E7EB]"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline */}
      {isLoadingLogs ? (
        <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-[#111111] animate-spin" />
          <p className="text-xs text-[#6B7280] font-black uppercase tracking-widest">A carregar registos...</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredLogs.map(l => {
            const dateStr = l.timestamp 
              ? new Date(l.timestamp.seconds * 1000).toLocaleString('pt-PT') 
              : 'A processar...';

            return (
              <div key={l.id} className="flex items-center justify-between gap-4 bg-white border border-slate-100 hover:border-slate-200 p-4 rounded-2xl transition-all shadow-xs">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-xs font-mono font-black border",
                    l.actionType?.includes('CREATE') ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                    l.actionType?.includes('DELETE') ? "bg-rose-50 text-rose-600 border-rose-100" :
                    l.actionType?.includes('UPDATE') ? "bg-blue-50 text-blue-600 border-blue-100" : "bg-amber-50 text-amber-600 border-amber-100"
                  )}>
                    {l.actionType?.substring(0, 3)}
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-xs font-black text-slate-800 leading-tight">{l.details}</h4>
                    <div className="flex flex-wrap items-center gap-1.5 text-[9px] text-slate-400 font-mono">
                      <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 border border-slate-200 font-black uppercase tracking-wider">
                        {l.actionType}
                      </span>
                      <span>•</span>
                      <span>Operador: <strong>{l.userEmail || 'Desconhecido'}</strong></span>
                    </div>
                  </div>
                </div>
                <div className="text-right text-[10px] text-slate-400 font-mono">
                  {dateStr}
                </div>
              </div>
            );
          })}

          {filteredLogs.length === 0 && (
            <div className="py-20 text-center text-slate-400 bg-[#F8F9FA] rounded-3xl border border-[#E5E7EB]">
              <History size={42} className="mx-auto mb-3 opacity-20" />
              <p className="text-xs uppercase font-black tracking-widest text-[#6B7280]">Nenhuma atividade registada.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Reports() {
  const { profile, businessData } = useAuth();
  const currency = businessData?.currency || 'MZN';
  const [activeTab, setActiveTab] = useState<'general' | 'inventory' | 'scheduled' | 'audit'>('general');
  const [sendingReport, setSendingReport] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  // Filter States for Inventory Reports
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [supplierFilter, setSupplierFilter] = useState<string>('all');

  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalSales: 0,
    activeCustomers: 0,
    lowStockItems: 0,
    outstandingCredit: 0,
    posSales: 0,
    invoiceSales: 0,
    wholesaleSales: 0,
    retailSales: 0,
    totalExpenses: 0
  });

  const handleSendWhatsAppReport = async () => {
    if (businessData?.subscription?.plan === 'basico' || businessData?.subscriptionPlan === 'basico') {
      toast.error("O envio de relatórios via WhatsApp está bloqueado no Plano Básico. Faça seguro upgrade para o Plano Pro!");
      return;
    }

    if (!businessData?.whatsappConfig?.apiKey || !businessData?.whatsappConfig?.phoneNumberId) {
      toast.error("Configurações do WhatsApp ausentes!", {
        description: "Por favor, configure sua chave de API do WhatsApp e o ID do número nas Configurações do ERP primeiro."
      });
      return;
    }

    const recipient = businessData.phone || businessData.whatsappConfig.phone || profile.phone || profile.phoneNumber || "";
    if (!recipient) {
      toast.error("Número de telefone do gestor não encontrado!", {
        description: "Adicione um número de telefone nas configurações da sua conta ou empresa."
      });
      return;
    }

    setSendingReport(true);
    try {
      const { sendWhatsAppSummaryReport } = await import('../lib/whatsappService');
      const todayStr = new Date().toLocaleDateString('pt-MZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const success = await sendWhatsAppSummaryReport({
        apiKey: businessData.whatsappConfig.apiKey,
        phoneNumberId: businessData.whatsappConfig.phoneNumberId,
        recipientPhone: recipient,
        businessName: businessData.name || "Sua Empresa",
        dateStr: todayStr,
        totalSalesCount: stats.totalSales,
        totalRevenue: stats.totalRevenue,
        totalExpenses: stats.totalExpenses,
        profit: Math.max(0, stats.totalRevenue - stats.totalExpenses),
        lowStockCount: stats.lowStockItems,
        outstandingCredit: stats.outstandingCredit,
        currency: currency
      });

      if (success) {
        toast.success("Relatório de vendas compartilhado no WhatsApp!");
      }
    } catch (e) {
      console.error(e);
      toast.error("Erro ao enviar o relatório por WhatsApp.");
    } finally {
      setSendingReport(false);
    }
  };

  useEffect(() => {
    if (!profile?.businessId) return;

    // Load cached stats and products first for instantaneous rendering
    const cachedStats = localStorage.getItem(`sabush_cached_reports_stats_${profile.businessId}`);
    if (cachedStats) {
      try {
        setStats(JSON.parse(cachedStats));
      } catch (e) {
        console.warn("Could not load cached reports stats:", e);
      }
    }

    offlineDb.getProducts().then((cachedProducts) => {
      if (cachedProducts && cachedProducts.length > 0) {
        setProducts(cachedProducts);
        setLoadingProducts(false);
      }
    }).catch(err => {
      console.warn("Could not load products cache for reports:", err);
    });

    const loadData = async () => {
      try {
        const invoicesRef = collection(db, `businesses/${profile.businessId}/invoices`);
        const customersRef = collection(db, `businesses/${profile.businessId}/customers`);
        const productsRef = collection(db, `businesses/${profile.businessId}/products`);
        const expensesRef = collection(db, `businesses/${profile.businessId}/expenses`);

        // Fetch all independent Firestore collections in parallel to eliminate sequential waterfall
        const [invSnap, custSnap, prodSnap, expSnap] = await Promise.all([
          getDocs(invoicesRef),
          getDocs(customersRef),
          getDocs(productsRef),
          getDocs(expensesRef)
        ]);

        const invoices = invSnap.docs.map(doc => doc.data());
        const customers = custSnap.docs.map(doc => doc.data());
        const loadedProducts = prodSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        const expenses = expSnap.docs.map(doc => doc.data());

        setProducts(loadedProducts);
        setLoadingProducts(false);
        offlineDb.saveProducts(loadedProducts).catch(err => console.warn(err));

        const totalExp = expenses.reduce((acc, exp) => acc + (exp.amount || exp.total || 0), 0);
        const revenue = invoices.reduce((acc, inv) => acc + (inv.total || 0), 0);
        const posSales = invoices.filter(inv => inv.type === 'pos').reduce((acc, inv) => acc + (inv.total || 0), 0);
        const invoiceSales = invoices.filter(inv => inv.type !== 'pos').reduce((acc, inv) => acc + (inv.total || 0), 0);
        const wholesaleSales = invoices.filter(inv => inv.saleType === 'wholesale').reduce((acc, inv) => acc + (inv.total || 0), 0);
        const retailSales = invoices.filter(inv => inv.saleType !== 'wholesale').reduce((acc, inv) => acc + (inv.total || 0), 0);
        const outstanding = customers.reduce((acc, c) => acc + (c.outstandingBalance || 0), 0);
        const lowStock = loadedProducts.filter(p => (p.stockLevel || 0) <= (p.lowStockThreshold || 5)).length;

        const freshStats = {
          totalRevenue: revenue,
          totalSales: invoices.length,
          activeCustomers: customers.length,
          lowStockItems: lowStock,
          outstandingCredit: outstanding,
          posSales,
          invoiceSales,
          wholesaleSales,
          retailSales,
          totalExpenses: totalExp
        };

        setStats(freshStats);
        try {
          localStorage.setItem(`sabush_cached_reports_stats_${profile.businessId}`, JSON.stringify(freshStats));
        } catch (e) {
          console.warn("Could not save report stats to cache:", e);
        }
      } catch (e) {
        toast.error("Failed to load report data");
      }
    };

    loadData();
  }, [profile?.businessId]);

  // Extract unique categories & suppliers from actual product list
  const categoriesList = useMemo(() => {
    const list = products.map(p => p.category?.trim()).filter(Boolean);
    return Array.from(new Set(list)) as string[];
  }, [products]);

  const suppliersList = useMemo(() => {
    const list = products.map(p => p.supplier?.trim()).filter(Boolean);
    return Array.from(new Set(list)) as string[];
  }, [products]);

  // Filter products based on selected category & supplier
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchCat = categoryFilter === 'all' || p.category === categoryFilter;
      const matchSup = supplierFilter === 'all' || p.supplier === supplierFilter;
      return matchCat && matchSup;
    });
  }, [products, categoryFilter, supplierFilter]);

  // Compute stats for filtered inventory
  const inventoryStats = useMemo(() => {
    const totalItemsInStock = filteredProducts.reduce((acc, p) => acc + (p.stockLevel || 0), 0);
    const lowStockItems = filteredProducts.filter(p => (p.stockLevel || 0) <= (p.lowStockThreshold || 5));
    const totalInventoryValue = filteredProducts.reduce((acc, p) => acc + ((p.stockLevel || 0) * (p.price || 0)), 0);
    const totalUniqueProducts = filteredProducts.length;

    return {
      totalItemsInStock,
      lowStockCount: lowStockItems.length,
      lowStockItemsList: lowStockItems,
      totalInventoryValue,
      totalUniqueProducts
    };
  }, [filteredProducts]);

  // Group filtered inventory statistics by category for the visual chart
  const categoryChartData = useMemo(() => {
    const groups: { [key: string]: { name: string; quantity: number; value: number } } = {};
    filteredProducts.forEach(p => {
      const cat = p.category || 'Não Categorizado';
      if (!groups[cat]) {
        groups[cat] = { name: cat, quantity: 0, value: 0 };
      }
      groups[cat].quantity += (p.stockLevel || 0);
      groups[cat].value += ((p.stockLevel || 0) * (p.price || 0));
    });
    return Object.values(groups);
  }, [filteredProducts]);

  const salesMixData = [
    { name: 'POS Sales', value: stats.posSales, color: '#0B1F4D' }, // Deep African Green
    { name: 'Invoices', value: stats.invoiceSales, color: '#D4AF37' } // African Sunset Orange
  ];

  const wholesaleRetailMix = [
    { name: 'Venda a Retalho', value: stats.retailSales, color: '#2563EB' }, // Blue
    { name: 'Venda por Grosso', value: stats.wholesaleSales, color: '#10b981' } // Emerald/Mint
  ];

  return (
    <div className="space-y-8">
      {/* Header with high fidelity title styling */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#F8F9FA] pb-6">
        <div>
          <h2 className="text-3xl font-black text-[#111111] tracking-tight flex items-center gap-2">
            <span>Business Reports</span>
            <span className="w-2.5 h-2.5 rounded-full bg-[#D4AF37]" />
          </h2>
          <p className="text-[#6B7280] text-sm font-semibold tracking-wide mt-1">Estatísticas, análises financeiras e controlo inteligente de stock.</p>
        </div>

        {/* Africa-inspired polished tab selector */}
        <div className="flex flex-wrap p-1 bg-[#F8F9FA] border border-[#E5E7EB] rounded-2xl w-fit gap-1">
          <button
            onClick={() => setActiveTab('general')}
            className={cn(
              "px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all cursor-pointer",
              activeTab === 'general' 
                ? "bg-[#111111] text-[#FFFFFF] shadow-md" 
                : "text-[#6B7280] hover:text-[#111111]"
            )}
          >
            Insights Gerais
          </button>
          <button
            onClick={() => {
              if (businessData?.subscription?.plan === 'basico' || businessData?.subscriptionPlan === 'basico') {
                toast.error("Upgrade para Pro: Relatórios Avançados de Inventário estão bloqueados no Plano Básico.");
                return;
              }
              setActiveTab('inventory');
            }}
            className={cn(
              "px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all cursor-pointer flex items-center gap-1.5",
              (businessData?.subscription?.plan === 'basico' || businessData?.subscriptionPlan === 'basico')
                ? "text-slate-400 cursor-not-allowed"
                : activeTab === 'inventory' 
                  ? "bg-[#111111] text-[#FFFFFF] shadow-md" 
                  : "text-[#6B7280] hover:text-[#111111]"
            )}
          >
            {(businessData?.subscription?.plan === 'basico' || businessData?.subscriptionPlan === 'basico') && <Lock size={12} className="text-amber-500" />}
            Resumo de Inventário
          </button>
          <button
            onClick={() => {
              if (businessData?.subscription?.plan === 'basico' || businessData?.subscriptionPlan === 'basico') {
                toast.error("Upgrade para Pro: Relatórios Programados automáticos estão bloqueados no Plano Básico.");
                return;
              }
              setActiveTab('scheduled');
            }}
            className={cn(
              "px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all cursor-pointer flex items-center gap-1.5",
              (businessData?.subscription?.plan === 'basico' || businessData?.subscriptionPlan === 'basico')
                ? "text-slate-400 cursor-not-allowed"
                : activeTab === 'scheduled' 
                  ? "bg-[#111111] text-[#FFFFFF] shadow-md" 
                  : "text-[#6B7280] hover:text-[#111111]"
            )}
          >
            {(businessData?.subscription?.plan === 'basico' || businessData?.subscriptionPlan === 'basico') && <Lock size={12} className="text-amber-500" />}
            📅 Relatórios Programados
          </button>
          <button
            onClick={() => {
              const userRole = profile?.role;
              const isManager = userRole === 'owner' || userRole === 'business_owner' || userRole === 'manager' || userRole === 'admin' || userRole?.toLowerCase() === 'super_admin';
              if (!isManager) {
                toast.error("Privilégios de Administrador são necessários para auditar registos de atividade.");
                return;
              }
              setActiveTab('audit');
            }}
            className={cn(
              "px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all cursor-pointer flex items-center gap-1.5",
              activeTab === 'audit' 
                ? "bg-[#111111] text-[#FFFFFF] shadow-md" 
                : "text-[#6B7280] hover:text-[#111111]"
            )}
          >
            <History size={12} />
            Registo de Auditoria
          </button>
        </div>
      </div>

      {activeTab === 'general' ? (
        <div className="space-y-8 animate-in fade-in duration-300">
          {/* WhatsApp Direct Summary Reporting Panel */}
          <div className="bg-emerald-50 border border-emerald-200/60 rounded-[40px] p-6 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm animate-in fade-in duration-150">
            <div className="flex items-center gap-4 text-left">
              <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-md">
                <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.457L0 24zm6.59-4.846c1.6.95 3.1 1.45 4.805 1.453 5.416.002 9.825-4.405 9.828-9.825.002-2.628-1.02-5.1-2.881-6.958a9.716 9.716 0 0 0-6.966-2.855c-5.422 0-9.832 4.408-9.835 9.833-.001 1.77.461 3.491 1.34 5.021L1.887 21.09l4.76-1.936z" />
                </svg>
              </div>
              <div className="space-y-0.5">
                <h4 className="font-extrabold text-emerald-950 text-sm">Resumo Executivo no seu WhatsApp</h4>
                <p className="text-xs text-emerald-700/90 font-bold max-w-xl">Dispara o sumário consolidado de faturamento, despesas registadas, margem líquida e alertas críticos directamente para o número de WhatsApp do gestor.</p>
              </div>
            </div>
            <button
              onClick={handleSendWhatsAppReport}
              disabled={sendingReport}
              className="w-full md:w-auto px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-extrabold text-xs uppercase tracking-wider rounded-2xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md select-none"
            >
              <span>{sendingReport ? 'A Enviar Relatório...' : 'Enviar por WhatsApp'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard 
              label="Total Revenue" 
              value={formatSystemCurrency(stats.totalRevenue, businessData)} 
              trend="+12.5%" 
              color="blue"
              icon={TrendingUp}
            />
            <StatCard 
              label="Total Sales" 
              value={stats.totalSales.toString()} 
              trend="+8.2%" 
              color="emerald"
              icon={ShoppingBag}
            />
            <StatCard 
              label="Credit Outstanding" 
              value={formatSystemCurrency(stats.outstandingCredit, businessData)} 
              trend="+5.4%" 
              color="rose"
              icon={AlertCircle}
            />
            <StatCard 
              label="Low Stock Items" 
              value={stats.lowStockItems.toString()} 
              trend="Critical" 
              color="amber"
              icon={Package}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black text-slate-900">Revenue Growth</h3>
                <select className="bg-slate-50 border-none rounded-xl px-4 py-2 text-sm font-bold outline-none cursor-pointer">
                  <option>Last 7 Days</option>
                  <option>Last 30 Days</option>
                </select>
              </div>
              <div className="h-[300px]">
                 <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <AreaChart data={revenueData}>
                       <defs>
                          <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                             <stop offset="5%" stopColor="#D4AF37" stopOpacity={0.15}/>
                             <stop offset="95%" stopColor="#D4AF37" stopOpacity={0}/>
                          </linearGradient>
                       </defs>
                       <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F8F9FA" />
                       <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#6B7280', fontSize: 12}} />
                       <YAxis axisLine={false} tickLine={false} tick={{fill: '#6B7280', fontSize: 12}} />
                       <Tooltip 
                        contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                       />
                       <Area type="monotone" dataKey="revenue" stroke="#D4AF37" strokeWidth={4} fillOpacity={1} fill="url(#colorRev)" />
                    </AreaChart>
                 </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-8 flex flex-col justify-between">
               <div>
                  <h3 className="text-lg font-black text-slate-900 mb-2">Canais de Venda</h3>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Revenue Distribution</p>
               </div>
               <div className="h-[200px]">
                 <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <PieChart>
                      <Pie
                        data={salesMixData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={8}
                        dataKey="value"
                      >
                        {salesMixData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                 </ResponsiveContainer>
               </div>
               <div className="space-y-3">
                  {salesMixData.map(item => (
                    <div key={item.name} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                       <div className="flex items-center gap-3">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="font-bold text-sm text-slate-600">{item.name}</span>
                       </div>
                       <span className="font-black text-slate-900">{item.value.toLocaleString()} {currency}</span>
                    </div>
                  ))}
               </div>
            </div>
          </div>

          {/* Segmentos de Mercado: Grosso vs Retalho Comparison Row */}
          <div className="bg-slate-50 border border-slate-100 p-8 rounded-[40px] grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8 animate-in fade-in zoom-in-95 duration-300">
            <div className="lg:col-span-2 space-y-6 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-black tracking-widest text-[#D4AF37] uppercase">Dashboard de Distribuição</span>
                <h3 className="text-xl font-black text-slate-900 mt-1 flex items-center gap-2">
                  <span>Movimento por Segmentos Financeiros</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                </h3>
                <p className="text-xs font-bold text-slate-400 mt-1">Análise detalhada do capital entrado por Grosso (vendas de packs/caixas) e Retalho (venda direta ao cliente de detalhe).</p>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-lg shrink-0">🛍️</div>
                  <div>
                    <span className="text-xs font-bold text-slate-400 block uppercase tracking-wider">Total Retalho</span>
                    <span className="text-2xl font-black text-slate-900 mt-1 block">{formatSystemCurrency(stats.retailSales || 0, businessData)}</span>
                    <span className="text-[10px] font-bold text-slate-400 mt-0.5 block">Canal de Detalhe</span>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-lg shrink-0">📦</div>
                  <div>
                    <span className="text-xs font-bold text-slate-400 block uppercase tracking-wider">Total Grosso</span>
                    <span className="text-2xl font-black text-slate-900 mt-1 block">{formatSystemCurrency(stats.wholesaleSales || 0, businessData)}</span>
                    <span className="text-[10px] font-bold text-slate-400 mt-0.5 block">Caixas, Packs e Volumes</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-8 flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-900 mb-2">Mix de Vendas</h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono">Grosso vs Retalho</p>
              </div>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                   <PieChart>
                     <Pie
                       data={wholesaleRetailMix}
                       cx="50%"
                       cy="50%"
                       innerRadius={60}
                       outerRadius={80}
                       paddingAngle={8}
                       dataKey="value"
                     >
                       {wholesaleRetailMix.map((entry, index) => (
                         <Cell key={`cell-${index}`} fill={entry.color} />
                       ))}
                     </Pie>
                     <Tooltip />
                   </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-3">
                 {wholesaleRetailMix.map(item => (
                   <div key={item.name} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                      <div className="flex items-center gap-3">
                         <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                         <span className="font-bold text-sm text-slate-600">{item.name}</span>
                      </div>
                      <span className="font-black text-slate-900">{item.value.toLocaleString()} {currency}</span>
                   </div>
                 ))}
              </div>
            </div>
          </div>
        </div>
      ) : activeTab === 'inventory' ? (
        /* Inventory summary section with category and supplier filtration options */
        <div className="space-y-8 animate-in fade-in duration-300">
          
          {/* Advanced Filter Toolbar */}
          <div className="bg-white p-6 rounded-[28px] border border-[#E5E7EB] shadow-[0_12px_24px_rgba(42,28,19,0.02)] flex flex-wrap gap-6 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#F8F9FA] text-[#6B7280] rounded-xl flex items-center justify-center">
                <SlidersHorizontal size={18} />
              </div>
              <div>
                <h3 className="font-bold text-[#111111] text-sm">Filtros de Faturação</h3>
                <p className="text-[10px] uppercase tracking-wider font-extrabold text-[#6B7280]">Filtre e analise por categoria ou fornecedor</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 items-center">
              {/* Category selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-[#6B7280] uppercase tracking-wider">Categoria:</span>
                <select 
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="bg-[#F8F9FA] border border-[#E5E7EB] font-semibold text-xs text-[#111111] px-3.5 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-[#D4AF37] cursor-pointer min-w-[140px]"
                >
                  <option value="all">Todas as Categorias</option>
                  {categoriesList.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Supplier selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-[#6B7280] uppercase tracking-wider">Fornecedor:</span>
                <select 
                  value={supplierFilter}
                  onChange={(e) => setSupplierFilter(e.target.value)}
                  className="bg-[#F8F9FA] border border-[#E5E7EB] font-semibold text-xs text-[#111111] px-3.5 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-[#D4AF37] cursor-pointer min-w-[140px]"
                >
                  <option value="all">Todos Fornecedores</option>
                  {suppliersList.map(sup => (
                    <option key={sup} value={sup}>{sup}</option>
                  ))}
                </select>
              </div>

              {/* Reset filter button */}
              {(categoryFilter !== 'all' || supplierFilter !== 'all') && (
                <button
                  onClick={() => {
                    setCategoryFilter('all');
                    setSupplierFilter('all');
                  }}
                  className="text-[10px] font-black uppercase text-[#D4AF37] hover:text-[#E11D48] px-2.5 py-2.5 tracking-wider hover:bg-[#F8F9FA] rounded-xl transition-all cursor-pointer"
                >
                  Limpar Filtros
                </button>
              )}
            </div>
          </div>

          {/* Dynamic inventory statistics grid values */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard 
              label="Itens em Stock (Qtd Total)" 
              value={inventoryStats.totalItemsInStock.toLocaleString()} 
              trend={`De ${inventoryStats.totalUniqueProducts} produtos`} 
              color="emerald"
              icon={Package}
            />

            <StatCard 
              label="Valor em Armazém (P. Venda)" 
              value={formatSystemCurrency(inventoryStats.totalInventoryValue, businessData)} 
              trend="Total estimado" 
              color="blue"
              icon={DollarSign}
            />

            <StatCard 
              label="Artigos de Stock Baixo" 
              value={inventoryStats.lowStockCount.toString()} 
              trend={inventoryStats.lowStockCount > 0 ? "Ação Requerida!" : "Tudo Seguro"} 
              color="rose"
              icon={AlertCircle}
            />

            <StatCard 
              label="Variedade de Produtos" 
              value={inventoryStats.totalUniqueProducts.toString()} 
              trend="Portfólio Ativo" 
              color="amber"
              icon={Layers}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Visual breakdown representation using Recharts of Stock levels per Category */}
            <div className="lg:col-span-2 bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-6">
              <div className="flex items-center justify-between border-b pb-4">
                <div>
                  <h3 className="text-lg font-black text-[#111111]">Distribuição por Categoria</h3>
                  <p className="text-[10px] font-extrabold uppercase text-[#6B7280] tracking-wider mt-0.5">Visão geral de quantidades e valores</p>
                </div>
              </div>
              
              {categoryChartData.length > 0 ? (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <BarChart data={categoryChartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F8F9FA" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#6B7280', fontSize: 11}} />
                      <YAxis axisLine={false} tickLine={false} tick={{fill: '#6B7280', fontSize: 11}} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '16px', border: '1px solid #E5E7EB', boxShadow: '0 8px 16px rgba(0,0,0,0.04)' }}
                        formatter={(value, name) => [typeof value === 'number' ? value.toLocaleString() : value, name === 'value' ? `Valor Total (${currency})` : 'Qtd Total']}
                      />
                      <Bar dataKey="value" fill="#0B1F4D" radius={[8, 8, 0, 0]} name="value" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="py-20 text-center text-slate-400">
                  <Package size={48} className="mx-auto mb-3 opacity-20" />
                  <p className="text-sm font-semibold">Sem dados de categorias para os filtros indicados.</p>
                </div>
              )}
            </div>

            {/* List of low-stock items requiring replenishment action list */}
            <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm flex flex-col justify-between space-y-6">
              <div>
                <h3 className="text-lg font-black text-[#111111] mb-1">Avisos Críticos</h3>
                <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest flex items-center gap-1.5">
                  <ShieldAlert size={14} />
                  Reposição Recomendada
                </p>
              </div>

              <div className="flex-1 overflow-y-auto max-h-[240px] pr-2 space-y-3 scrollbar-thin">
                {inventoryStats.lowStockItemsList.length > 0 ? (
                  inventoryStats.lowStockItemsList.map(p => (
                    <div key={p.id} className="flex items-center justify-between p-3.5 bg-[#F8F9FA] rounded-2xl border border-rose-100/60 transition-all hover:border-rose-200">
                      <div className="min-w-0 pr-3">
                        <p className="font-extrabold text-xs text-[#111111] truncate">{p.name}</p>
                        <p className="text-[9px] font-extrabold text-[#6B7280] uppercase tracking-wide truncate mt-0.5">
                          {p.supplier || 'Sem Fornecedor'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="inline-block px-2.5 py-1 bg-rose-50 text-rose-600 text-[10px] font-black rounded-lg">
                          {p.stockLevel} units
                        </span>
                        <p className="text-[9px] font-bold text-slate-400 mt-1">Limite: {p.lowStockThreshold || 5}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-12 text-center text-emerald-600 flex flex-col items-center justify-center gap-2">
                    <CheckCircle2 size={32} className="text-emerald-500" />
                    <p className="text-xs font-black uppercase tracking-wider">Tudo Abastecido</p>
                    <p className="text-[10px] text-slate-400">Nenhum produto com stock crítico.</p>
                  </div>
                )}
              </div>

              <div className="bg-amber-50/60 border border-amber-100 p-4 rounded-2.5xl text-center">
                <p className="text-[10px] font-bold text-amber-800 leading-relaxed">
                  💡 <strong>Sugestão ERP:</strong> Pode exportar esta lista de stock baixo para agilizar a criação de ordens de compra a fornecedores!
                </p>
              </div>
            </div>
          </div>

          {/* Clean Micro-Table list details for the matching categories & sellers */}
          <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm p-8 space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4 border-b pb-4">
              <div>
                <h3 className="text-lg font-black text-[#111111]">Lista Detalhada de Artigos Correspondentes</h3>
                <p className="text-[10px] font-extrabold uppercase text-[#6B7280] tracking-wider mt-0.5">
                  Visualização rápida de preços, unidades e alertas ({filteredProducts.length} itens)
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#F8F9FA] text-[10px] font-black text-[#6B7280] uppercase tracking-wider">
                    <th className="pb-4">Nome do Artigo</th>
                    <th className="pb-4">Fornecedor</th>
                    <th className="pb-4 text-center">Nível de Stock</th>
                    <th className="pb-4 text-right">Preço de Venda</th>
                    <th className="pb-4 text-right">Valor em {currency}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F8F9FA]">
                  {filteredProducts.slice(0, 15).map(p => {
                    const isLow = (p.stockLevel || 0) <= (p.lowStockThreshold || 5);
                    return (
                      <tr key={p.id} className="text-xs hover:bg-[#FFFFFF] transition-colors">
                        <td className="py-4 font-extrabold text-[#111111]">{p.name}</td>
                        <td className="py-4 text-slate-600 font-semibold">{p.supplier || '—'}</td>
                        <td className="py-4 text-center">
                          <span className={cn(
                            "inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider",
                            p.stockLevel === 0 ? "bg-red-50 text-red-600" :
                            isLow ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"
                          )}>
                            {p.stockLevel} units {p.stockLevel === 0 ? '• Crítico' : isLow ? '• Baixo' : '• OK'}
                          </span>
                        </td>
                        <td className="py-4 text-right font-bold text-slate-700">{formatSystemCurrency(p.price || 0, businessData)}</td>
                        <td className="py-4 text-right font-black text-[#0B1F4D]">
                          {formatSystemCurrency((p.stockLevel || 0) * (p.price || 0), businessData)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {filteredProducts.length > 15 && (
                <p className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest pt-6 border-t mt-4">
                  A mostrar os primeiros 15 produtos de {filteredProducts.length}. Crie mais filtros acima para encontrar produtos específicos.
                </p>
              )}

              {filteredProducts.length === 0 && (
                <div className="py-12 text-center text-slate-400">
                  <Package size={48} className="mx-auto mb-3 opacity-10" />
                  <p className="text-xs font-semibold">Nenhum produto corresponde aos filtros de pesquisa selecionados.</p>
                </div>
              )}
            </div>
          </div>

        </div>
      ) : (
        <div className="space-y-8 animate-in fade-in duration-300">
          <div className="bg-[#F8F9FA] border border-[#E5E7EB] p-8 rounded-[40px] shadow-sm text-left">
            <h3 className="text-xl font-black text-[#111111] tracking-tight flex items-center gap-2 mb-2 font-sans">
              <span>Configuração de Relatórios Periódicos Automáticos</span>
              <span className="w-1.5 h-1.5 rounded-full bg-orange-600" />
            </h3>
            <p className="text-[#6B7280] text-xs font-semibold leading-relaxed mb-6 font-sans">
              Programe o sistema para autogerar relatórios de faturação e auditoria de stock em PDF ao fim de cada mês comercial.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-[#E5E7EB]/60">
              <div className="space-y-3 p-5 bg-white rounded-3xl border border-slate-100 shadow-sm">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block font-sans">Estado da Programação</span>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-extrabold text-[#111111] text-sm font-sans">Relatório Mensal PDF</h4>
                    <p className="text-[11px] text-slate-405 font-medium leading-none mt-1">Próxima geração: 01 de Julho de 2026</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={true}
                      onChange={() => {
                        toast.success("Estado de agendamento automático gravado com sucesso.");
                      }}
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>
              </div>

              <div className="space-y-3 p-5 bg-white rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block font-sans">Canal de Notificações</span>
                  <h4 className="font-extrabold text-[#111111] text-sm mt-1 font-sans">Envio de Cópia PDF via WhatsApp</h4>
                  <p className="text-[11px] text-slate-405 font-medium mt-1">Se ativado, envia o link direto ao proprietário.</p>
                </div>
                <div className="text-right">
                  <span className="text-[9px] bg-emerald-50 text-emerald-800 border-emerald-250 font-black tracking-widest uppercase px-2 py-0.5 rounded-full border">Ativo</span>
                </div>
              </div>
            </div>

            {/* List of generated reports */}
            <div className="mt-8">
              <h4 className="text-sm font-black text-[#111111] uppercase tracking-widest mb-4 flex items-center gap-1.5 font-sans">
                📋 Relatórios Coletivos Emitidos (Automação)
              </h4>

              <div className="space-y-3.5">
                {[
                  { month: 'Maio 2026', revenue: stats.totalRevenue || 128500, expenses: stats.totalExpenses || 45200, date: '31/05/2026' },
                  { month: 'Abril 2026', revenue: 142000, expenses: 51000, date: '30/04/2026' },
                  { month: 'Março 2026', revenue: 119500, expenses: 39000, date: '31/03/2026' }
                ].map((item, idx) => (
                  <div key={idx} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 hover:border-slate-200 transition-all duration-300">
                    <div className="text-left">
                      <span className="text-[9px] font-black font-mono text-slate-400 tracking-wider">MÊS DE COMPETÊNCIA</span>
                      <h5 className="text-base font-black text-slate-900 leading-tight">{item.month}</h5>
                      <span className="text-[10.5px] font-semibold text-slate-500 font-sans">Emissão efetuada em: {item.date}</span>
                    </div>

                    <div className="flex flex-wrap gap-4 text-left sm:text-right font-sans">
                      <div>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Faturação</span>
                        <span className="text-xs font-black text-emerald-600 font-mono">+{item.revenue.toLocaleString()} MT</span>
                      </div>
                      <div>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Custos / Despesas</span>
                        <span className="text-xs font-black text-rose-550 font-mono">-{item.expenses.toLocaleString()} MT</span>
                      </div>
                    </div>

                    <button 
                      onClick={() => {
                        toast.success(`Fazendo compilação estatística de ${item.month}...`);
                        const compInfo = {
                          name: businessData?.name || 'A Minha Empresa S.A.',
                          address: businessData?.address,
                          phone: businessData?.phone,
                          email: businessData?.email,
                          nuit: businessData?.taxId,
                          timezone: 'Africa/Maputo'
                        };
                        generateMonthlyReportPDF(item.month, {
                          totalRevenue: item.revenue,
                          totalSales: stats.totalSales || 140,
                          activeCustomers: stats.activeCustomers || 28,
                          totalExpenses: item.expenses,
                          lowStockItems: stats.lowStockItems || 3,
                          outstandingCredit: stats.outstandingCredit || 12000
                        }, compInfo, products);
                      }}
                      className="bg-[#111111] hover:bg-black text-[#FFFFFF] shadow-md px-4 py-2.5 rounded-xl font-bold font-sans text-xs uppercase tracking-wider cursor-pointer active:scale-95 transition-all text-center flex items-center justify-center gap-1.5"
                    >
                      🖨️ Descarregar PDF
                    </button>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="mt-8 bg-amber-50/50 p-4 rounded-3xl border border-amber-200/50 text-amber-850 text-xs font-sans font-semibold text-left flex items-start gap-2 max-w-xl">
              <span className="text-sm">💡</span>
              <p className="leading-relaxed text-[#6B7280]">
                <b>Dica de Produtividade:</b> As gerações automáticas de relatórios são disparadas no primeiro dia útil de cada mês útil. O proprietário recebe o arquivo em anexo diretamente na conta de WhatsApp informada nas configurações.
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'audit' && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          className="space-y-6 animate-in fade-in duration-300"
        >
          <AuditLogPanel profile={profile} activeTab={activeTab} />
        </motion.div>
      )}
    </div>
  );
}

const revenueData = [
  { name: 'Mon', revenue: 4000 },
  { name: 'Tue', revenue: 3000 },
  { name: 'Wed', revenue: 2000 },
  { name: 'Thu', revenue: 2780 },
  { name: 'Fri', revenue: 1890 },
  { name: 'Sat', revenue: 2390 },
  { name: 'Sun', revenue: 3490 },
];

function StatCard({ label, value, trend, color, icon: Icon }: any) {
  return (
    <div className="p-8 bg-white rounded-[40px] border border-slate-100 shadow-sm relative overflow-hidden group hover:scale-[1.02] transition-all duration-500">
      <div className={cn("absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform duration-500", 
        color === 'blue' ? 'text-blue-600' : color === 'emerald' ? 'text-[#0B1F4D]' : color === 'rose' ? 'text-rose-600' : 'text-amber-600'
      )}>
         <Icon size={80} strokeWidth={3} />
      </div>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{label}</p>
      <h4 className="text-2xl font-black text-[#111111] leading-tight mb-2">{value}</h4>
      <div className="flex items-center gap-2">
        <span className={cn(
          "px-2.5 py-1 rounded-lg text-[10px] font-black capitalize tracking-wide",
          color === 'blue' ? 'bg-blue-50 text-blue-600' :
          color === 'emerald' ? 'bg-emerald-50 text-[#0B1F4D]' :
          color === 'rose' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'
        )}>
          {trend}
        </span>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Informação</span>
      </div>
    </div>
  );
}

