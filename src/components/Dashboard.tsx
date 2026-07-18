import React, { useState, useEffect } from 'react';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { subscribeToCollection } from '../lib/firestoreCache';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { TrendingUp, TrendingDown, Users, Package, ArrowUpRight, ArrowDownRight, CreditCard, ShoppingCart, FileSearch, Truck, Sparkles, AlertCircle, ShoppingBag, DollarSign, Wallet, History, ChevronRight, Link as LinkIcon, Maximize2, Minimize2, Clock, LayoutDashboard, ReceiptText, Settings as SettingsIcon, RefreshCw, GripVertical, ChevronUp, ChevronDown, Target } from 'lucide-react';
import { BarChart, Bar, AreaChart, Area, Legend, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Line, LineChart, PieChart, Pie, Cell } from 'recharts';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { offlineDb, parseSafeDate } from '../lib/offlineDb';
import { collection, query, onSnapshot, where, orderBy, limit, getDocs, doc, updateDoc, getDoc, setDoc } from 'firebase/firestore';
import { generateSystemManualPDF } from '../lib/pdfGenerator';
import AIAdvisor from './AIAdvisor';
import { ChartConsole } from './ChartConsole';
import MarketRates from './MarketRates';
import Skeleton from './ui/Skeleton';
import { motion, AnimatePresence } from 'motion/react';

const data = [
  { name: 'Mon', sales: 4000, expenses: 2400 },
  { name: 'Tue', sales: 3000, expenses: 1398 },
  { name: 'Wed', sales: 2000, expenses: 9800 },
  { name: 'Thu', sales: 2780, expenses: 3908 },
  { name: 'Fri', sales: 1890, expenses: 4800 },
  { name: 'Sat', sales: 2390, expenses: 3800 },
  { name: 'Sun', sales: 3490, expenses: 4300 },
];

export const schemaColors = {
  classic: {
    primary: '#0A3038', // Brand Blue
    secondary: '#10b981', // Semantic Green
    warning: '#f59e0b', // Semantic Amber
    danger: '#ef4444', // Semantic Red
    glow: 'rgba(26, 115, 196, 0.1)',
  },
  neon: {
    primary: '#0A3038', // Brand Blue (redirected for safe fallback)
    secondary: '#10b981', // Semantic Green (redirected for safe fallback)
    warning: '#f59e0b', // Semantic Amber (redirected for safe fallback)
    danger: '#ef4444', // Semantic Red (redirected for safe fallback)
    glow: 'rgba(26, 115, 196, 0.1)',
  },
  cyberpunk: {
    primary: '#B8791A', // Brand Orange (redirected for safe fallback)
    secondary: '#10b981', // Semantic Green (redirected for safe fallback)
    warning: '#f59e0b', // Semantic Amber (redirected for safe fallback)
    danger: '#ef4444', // Semantic Red (redirected for safe fallback)
    glow: 'rgba(216, 90, 48, 0.15)',
  },
  vibrant: {
    primary: '#B8791A', // Brand Orange
    secondary: '#10b981', // Semantic Green
    warning: '#f59e0b', // Semantic Amber
    danger: '#ef4444', // Semantic Red
    glow: 'rgba(216, 90, 48, 0.12)',
  }
};

interface DashboardProps {
  setCurrentTab?: (tab: string) => void;
}

export default function Dashboard({ setCurrentTab }: DashboardProps = {}) {
  const { profile, businessData } = useAuth();
  const { t } = useTranslation();
  const currency = businessData?.currency || 'MZN';
  const isSuperAdmin = profile?.role?.toLowerCase() === 'super_admin';
  const [activeBusinessId, setActiveBusinessId] = useState<string | null>(profile?.businessId || null);

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [vendasChartToggle, setVendasChartToggle] = useState<'mensal' | 'diario'>('mensal');
  const [isClassicErpExpanded, setIsClassicErpExpanded] = useState(false);

  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Welcome Banner Handlers (Requisito 4)
  const showWelcomeBanner = activeBusinessId && (!businessData?.preferences?.welcomeBannerDismissed || !profile?.onboardingCompleted);

  const handleDismissBannerPermanently = async () => {
    if (!activeBusinessId) return;
    try {
      await updateDoc(doc(db, 'businesses', activeBusinessId), {
        'preferences.welcomeBannerDismissed': true
      });
      toast.success("Mensagem de boas-vindas descartada permanentemente.");
    } catch (err) {
      console.error("Failed to dismiss welcome banner:", err);
    }
  };

  const handleGoToProfile = async () => {
    if (!activeBusinessId) return;
    try {
      await updateDoc(doc(db, 'businesses', activeBusinessId), {
        'preferences.welcomeBannerDismissed': true
      });
    } catch (err) {
      console.error("Failed to dismiss welcome banner on navigate:", err);
    }
    setCurrentTab?.('settings');
  };

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    setRefreshKey(prev => prev + 1);
    const toastId = toast.loading("A ler dados mais recentes do Firestore...");
    setTimeout(() => {
      setIsRefreshing(false);
      toast.success("Indicadores gerais atualizados com sucesso!", { id: toastId });
    }, 1000);
  };

  const [metrics, setMetrics] = useState({
    revenue: 0,
    outstanding: 0,
    customersCount: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
    inStockCount: 0,
    totalProducts: 0,
    paymentsToday: 0,
    cashSales: 0,
    creditSales: 0,
    overdueCount: 0,
    wholesaleSales: 0,
    retailSales: 0,
    wholesaleWeekly: 0,
    wholesaleMonthly: 0,
    retailWeekly: 0,
    retailMonthly: 0,
    weeklyRevenue: 0,
    monthlyRevenue: 0,
    cashWeekly: 0,
    cashMonthly: 0,
    creditWeekly: 0,
    creditMonthly: 0,
    expensesWeekly: 0,
    expensesMonthly: 0,
    expensesTotal: 0,
    profitWeekly: 0,
    profitMonthly: 0,
    profitTotal: 0
  });
  const [recentSales, setRecentSales] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(typeof window !== 'undefined' ? navigator.onLine : true);

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

  // States for full historical telemetry and Date Range select
  const [allInvoices, setAllInvoices] = useState<any[]>([]);
  const [allExpenses, setAllExpenses] = useState<any[]>([]);
  const [allPayments, setAllPayments] = useState<any[]>([]);

  const [startDateStr, setStartDateStr] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDateStr, setEndDateStr] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  const [chartSchema, setChartSchema] = useState<'classic' | 'neon' | 'cyberpunk' | 'vibrant'>('classic');
  const [activeChartLayout, setActiveChartLayout] = useState<'combined' | 'separate'>('combined');

  const [isEditingTarget, setIsEditingTarget] = useState(false);
  const [tempSalesTarget, setTempSalesTarget] = useState('');
  const [isSavingTarget, setIsSavingTarget] = useState(false);

  // States to toggle detail view for KPI and Sales Target widgets
  const [isKpisExpanded, setIsKpisExpanded] = useState(false);
  const [isTargetExpanded, setIsTargetExpanded] = useState(false);

  // Customizable Drag and Drop Dashboard Widget Layout Reordering State
  const [widgetOrder, setWidgetOrder] = useState<string[]>(() => {
    const saved = localStorage.getItem('sabush_dashboard_widget_order');
    const defaultWidgets = ['kpis', 'sales_target', 'sales_chart_6m', 'sales_chart_7d', 'stats_grid', 'channels_and_debts'];
    if (saved) {
      try {
        let parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          parsed = parsed.filter(w => w !== 'shortcuts');
          if (!parsed.includes('sales_chart_7d')) {
            const idx6m = parsed.indexOf('sales_chart_6m');
            if (idx6m !== -1) {
              parsed.splice(idx6m + 1, 0, 'sales_chart_7d');
            } else {
              parsed.push('sales_chart_7d');
            }
          }
          if (!parsed.includes('sales_target')) {
            const idxKpis = parsed.indexOf('kpis');
            if (idxKpis !== -1) {
              parsed.splice(idxKpis + 1, 0, 'sales_target');
            } else {
              parsed.push('sales_target');
            }
          }
          return parsed;
        }
      } catch (e) {
        // Safe fallback in case of corrupted localStore
      }
    }
    return defaultWidgets;
  });
  const [draggedWidgetId, setDraggedWidgetId] = useState<string | null>(null);

  // Sync dashboard layout with Firestore on activeBusinessId change (or on login)
  useEffect(() => {
    if (!activeBusinessId) return;

    const fetchDashboardLayout = async () => {
      try {
        const layoutRef = doc(db, 'businesses', activeBusinessId, 'preferences', 'dashboardLayout');
        const snap = await getDoc(layoutRef);
        if (snap.exists()) {
          const cloudOrder = snap.data().widgetOrder;
          if (Array.isArray(cloudOrder) && cloudOrder.length > 0) {
            setWidgetOrder(cloudOrder);
            localStorage.setItem('sabush_dashboard_widget_order', JSON.stringify(cloudOrder));
          }
        } else {
          // If Firestore doesn't have it yet, upload the local storage widget order if it exists
          const savedLocal = localStorage.getItem('sabush_dashboard_widget_order');
          if (savedLocal) {
            try {
              const parsed = JSON.parse(savedLocal);
              if (Array.isArray(parsed) && parsed.length > 0) {
                await setDoc(layoutRef, {
                  widgetOrder: parsed,
                  updatedAt: new Date().toISOString()
                }, { merge: true });
              }
            } catch (err) {
              // ignore parse errors
            }
          }
        }
      } catch (err) {
        console.error("Erro a sincronizar disposição do dashboard:", err);
        try {
          handleFirestoreError(err, OperationType.GET, `businesses/${activeBusinessId}/preferences/dashboardLayout`);
        } catch (wrappedErr) {
          // Track but do not crash the React component
        }
      }
    };

    fetchDashboardLayout();
  }, [activeBusinessId]);

  const saveDashboardLayout = async (updatedOrder: string[]) => {
    localStorage.setItem('sabush_dashboard_widget_order', JSON.stringify(updatedOrder));
    if (activeBusinessId) {
      try {
        const layoutRef = doc(db, 'businesses', activeBusinessId, 'preferences', 'dashboardLayout');
        await setDoc(layoutRef, {
          widgetOrder: updatedOrder,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (err) {
        console.error("Erro ao guardar nova disposição no Firestore:", err);
        try {
          handleFirestoreError(err, OperationType.WRITE, `businesses/${activeBusinessId}/preferences/dashboardLayout`);
        } catch (wrappedErr) {
          // Avoid throwing past the boundary
        }
      }
    }
  };

  const handleWidgetDragStart = (e: React.DragEvent, id: string) => {
    setDraggedWidgetId(id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleWidgetDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedWidgetId || draggedWidgetId === targetId) return;

    const currentIdx = widgetOrder.indexOf(draggedWidgetId);
    const targetIdx = widgetOrder.indexOf(targetId);

    if (currentIdx !== -1 && targetIdx !== -1) {
      const updated = [...widgetOrder];
      updated.splice(currentIdx, 1);
      updated.splice(targetIdx, 0, draggedWidgetId);
      setWidgetOrder(updated);
    }
  };

  const handleWidgetDragEnd = async () => {
    if (draggedWidgetId) {
      const currentOrder = [...widgetOrder];
      setDraggedWidgetId(null);
      await saveDashboardLayout(currentOrder);
      toast.success("Nova disposição do dashboard guardada!");
    }
  };

  const moveWidget = async (id: string, direction: 'up' | 'down') => {
    const idx = widgetOrder.indexOf(id);
    if (idx === -1) return;
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= widgetOrder.length) return;

    const updated = [...widgetOrder];
    const temp = updated[idx];
    updated[idx] = updated[newIdx];
    updated[newIdx] = temp;

    setWidgetOrder(updated);
    await saveDashboardLayout(updated);
    toast.success("Disposição reordenada com sucesso!");
  };

  const saveSalesTarget = async (amt: number) => {
    if (!activeBusinessId) {
      toast.error("Nenhuma empresa ativa selecionada.");
      return;
    }
    setIsSavingTarget(true);
    try {
      await updateDoc(doc(db, 'businesses', activeBusinessId), {
        monthlySalesTarget: amt
      });
      toast.success("Objetivo de vendas mensal atualizado com sucesso!");
      setIsEditingTarget(false);
    } catch (err: any) {
      console.error("Erro ao guardar objetivo de vendas:", err);
      toast.error("Erro ao guardar objetivo de vendas no servidor.");
    } finally {
      setIsSavingTarget(false);
    }
  };

  // Dynamic reference today date to support cases where browser system clock is off (e.g. year 2254)
  const referenceToday = React.useMemo(() => {
    const defaultToday = new Date();
    if (isNaN(defaultToday.getTime())) {
      return new Date();
    }
    let maxTime = 0;

    const parseItemDate = (item: any) => {
      if (!item) return null;
      return parseSafeDate(item.createdAt || item.date);
    };

    allInvoices.forEach(item => {
      const d = parseItemDate(item);
      if (d && d.getTime() > maxTime && d.getTime() <= defaultToday.getTime() + 86400000) {
        maxTime = d.getTime();
      }
    });

    allExpenses.forEach(item => {
      const d = parseItemDate(item);
      if (d && d.getTime() > maxTime && d.getTime() <= defaultToday.getTime() + 86400000) {
        maxTime = d.getTime();
      }
    });

    allPayments.forEach(item => {
      const d = parseItemDate(item);
      if (d && d.getTime() > maxTime && d.getTime() <= defaultToday.getTime() + 86400000) {
        maxTime = d.getTime();
      }
    });

    if (maxTime > 0) {
      const latestObj = new Date(maxTime);
      if (!isNaN(latestObj.getTime())) {
        const diffDays = (defaultToday.getTime() - latestObj.getTime()) / (1000 * 60 * 60 * 24);
        if (Math.abs(diffDays) > 15) {
          return latestObj;
        }
      }
    }
    return defaultToday;
  }, [allInvoices, allExpenses, allPayments]);

  const expiryAlertStats = React.useMemo(() => {
    let expiredBatches = 0;
    let expiringSoonBatches = 0;
    const today = new Date();
    today.setHours(0,0,0,0);
    const thirtyDaysFromNow = new Date(today);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    products.forEach(product => {
      const batches = product.batches || [];
      let runningTotal = product.stockLevel || 0;
      
      const sortedBatches = [...batches].sort((a, b) => {
        const dateA = a.receivedDate || '';
        const dateB = b.receivedDate || '';
        return dateB.localeCompare(dateA);
      });

      sortedBatches.forEach(batch => {
        if (runningTotal <= 0) return;
        const bQty = Number(batch.quantity) || 0;
        const reconciledQty = Math.min(bQty, runningTotal);
        runningTotal -= reconciledQty;

        if (batch.expiryDate && reconciledQty > 0) {
          const expDate = new Date(batch.expiryDate + 'T00:00:00');
          if (expDate <= today) {
            expiredBatches++;
          } else if (expDate <= thirtyDaysFromNow) {
            expiringSoonBatches++;
          }
        }
      });
    });

    return {
      expired: expiredBatches,
      expiringSoon: expiringSoonBatches,
      hasAlerts: expiredBatches > 0 || expiringSoonBatches > 0
    };
  }, [products]);

  const getSnapshotNow = (snapDocs: any[]) => {
    const d = new Date();
    let maxTime = 0;
    
    snapDocs.forEach(docSnap => {
      const data = docSnap.data ? docSnap.data() : docSnap;
      if (!data) return;
      const itemDate = parseSafeDate(data.createdAt || data.date);
      if (itemDate && !isNaN(itemDate.getTime())) {
        const ms = itemDate.getTime();
        if (ms > maxTime && ms <= d.getTime() + 86400000) {
          maxTime = ms;
        }
      }
    });

    if (maxTime > 0) {
      const latestObj = new Date(maxTime);
      if (!isNaN(latestObj.getTime())) {
        const diffDays = (d.getTime() - latestObj.getTime()) / (1000 * 60 * 60 * 24);
        if (Math.abs(diffDays) > 15) {
          return latestObj;
        }
      }
    }
    return d;
  };

  // Auto-align default date filter to match referenceToday once records load
  const [hasAlignedDates, setHasAlignedDates] = useState(false);
  useEffect(() => {
    if (!hasAlignedDates && (allInvoices.length > 0 || allExpenses.length > 0 || allPayments.length > 0)) {
      const end = new Date(referenceToday);
      const start = new Date(referenceToday);
      start.setDate(start.getDate() - 30);
      
      setStartDateStr(start.toISOString().split('T')[0]);
      setEndDateStr(end.toISOString().split('T')[0]);
      setHasAlignedDates(true);
    }
  }, [referenceToday, allInvoices.length, allExpenses.length, allPayments.length, hasAlignedDates]);

  useEffect(() => {
    if (profile?.businessId) {
      setActiveBusinessId(profile.businessId);
    } else if (isSuperAdmin) {
      // Find the first available business to show on dashboard
      getDocs(query(collection(db, 'businesses'), limit(1)))
        .then((snap) => {
          if (!snap.empty) {
            setActiveBusinessId(snap.docs[0].id);
          } else {
            setLoading(false); // No businesses found, stop loading
          }
        })
        .catch(() => {
          setLoading(false);
        });
    } else {
      setLoading(false); // Not super admin and no business ID, stop loading (e.g., onboarding/gate)
    }
  }, [profile?.businessId, isSuperAdmin]);

  useEffect(() => {
    if (!activeBusinessId) return;

    // Pre-load from Offline IndexedDB Cache
    offlineDb.getInvoices().then((cachedInvoices) => {
      if (cachedInvoices && cachedInvoices.length > 0) {
        setAllInvoices(cachedInvoices);
      }
    }).catch(err => {
      console.warn("Could not load invoices from offline cache:", err);
    });

    offlineDb.getProducts().then((cachedProducts) => {
      if (cachedProducts && cachedProducts.length > 0) {
        setProducts(cachedProducts);
      }
    }).catch(err => {
      console.warn("Could not load products from offline cache:", err);
    });

    // Track loading state
    let streamsLoaded = 0;
    const totalStreams = 5;
    const checkLoaded = () => {
      streamsLoaded++;
      if (streamsLoaded >= totalStreams) setLoading(false);
    };

    // Customers stats
    const unsubCustomers = subscribeToCollection(
      `businesses/${activeBusinessId}/customers`,
      (items) => {
        let totalDebt = 0;
        let overdue = 0;
        items.forEach(data => {
          totalDebt += (data.outstandingBalance || 0);
          
          // Handle different date formats (string or Timestamp)
          let dueDate: Date | null = null;
          if (data.dueDate) {
            dueDate = typeof data.dueDate === 'string' 
              ? new Date(data.dueDate) 
              : (data.dueDate.toDate ? data.dueDate.toDate() : new Date(data.dueDate));
          }

          if ((data.outstandingBalance || 0) > 0 && dueDate && dueDate < new Date()) {
            overdue++;
          }
        });
        setMetrics(prev => ({ ...prev, customersCount: items.length, outstanding: totalDebt, overdueCount: overdue }));
        checkLoaded();
      },
      undefined,
      (err) => {
        try {
          handleFirestoreError(err, OperationType.GET, `businesses/${activeBusinessId}/customers`);
        } catch (e) {
          console.warn("Gracefully logged dashboard customers error:", e);
        }
        checkLoaded();
      }
    );

    // Today's Payments
    const unsubPayments = subscribeToCollection(
      `businesses/${activeBusinessId}/payments`,
      (items) => {
        const todayLimit = new Date();
        todayLimit.setHours(0,0,0,0);
        let totalReceived = 0;
        items.forEach(d => {
          let paymentDate: Date | null = null;
          if (d.createdAt) {
            paymentDate = d.createdAt.toDate ? d.createdAt.toDate() : new Date(d.createdAt);
          }
          if (paymentDate && paymentDate >= todayLimit) {
            totalReceived += (d.amount || 0);
          }
        });
        setMetrics(prev => ({ ...prev, paymentsToday: totalReceived }));
        checkLoaded();
      },
      undefined,
      (err) => {
        try {
          handleFirestoreError(err, OperationType.GET, `businesses/${activeBusinessId}/payments`);
        } catch (e) {
          console.warn("Gracefully logged dashboard payments today error:", e);
        }
        checkLoaded();
      }
    );

    // Invoices stats
    const qInvoices = query(collection(db, `businesses/${activeBusinessId}/invoices`));
    const unsubInvoices = subscribeToCollection(
      `businesses/${activeBusinessId}/invoices`,
      (items) => {
        const invoicesList = [...items];
        setAllInvoices(invoicesList);
        
        // Compute recent sales locally from the same invoices list!
        const sortedForRecent = [...invoicesList].sort((a: any, b: any) => {
          const dateA = a.createdAt?.seconds || 0;
          const dateB = b.createdAt?.seconds || 0;
          return dateB - dateA;
        });
        setRecentSales(sortedForRecent.slice(0, 5));
        
        // Update IndexedDB Cache
        offlineDb.saveInvoices(invoicesList).catch(err => {
          console.warn("Could not cache invoices:", err);
        });
        let totalRev = 0;
        let cash = 0;
        let credit = 0;
        let wholesaleRev = 0;
        let retailRev = 0;

        // Weekly (Last 7 Days)
        let weeklyRev = 0;
        let cashW = 0;
        let creditW = 0;
        let wholesaleW = 0;
        let retailW = 0;

        // Monthly (Last 30 Days)
        let monthlyRev = 0;
        let cashM = 0;
        let creditM = 0;
        let wholesaleM = 0;
        let retailM = 0;

        const now = getSnapshotNow(items);
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(now.getDate() - 7);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(now.getDate() - 30);
        thirtyDaysAgo.setHours(0, 0, 0, 0);

        items.forEach(data => {
          const t = Number(data.total) || 0;
          const unpaid = data.outstandingBalance !== undefined ? (Number(data.outstandingBalance) || 0) : t;
          
          totalRev += t;
          
          const isCash = data.paymentType === 'cash' || data.paymentMethod === 'cash' || data.status === 'paid';
          const isCredit = data.paymentType === 'credit' || data.paymentMethod === 'credit' || data.status === 'unpaid' || data.status === 'partially_paid';
          const isWholesale = data.saleType === 'wholesale';
          const isRetail = !isWholesale;

          if (isCash) {
            cash += t;
          } else {
            credit += unpaid;
          }
          
          if (isWholesale) {
            wholesaleRev += t;
          } else {
            retailRev += t;
          }

          // Parse date
          let iDate: Date | null = null;
          if (data.createdAt) {
            iDate = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
          } else if (data.date) {
            iDate = new Date(data.date);
          }

          if (iDate) {
            if (iDate >= sevenDaysAgo) {
              weeklyRev += t;
              if (isCash) cashW += t;
              else creditW += unpaid;
              
              if (isWholesale) wholesaleW += t;
              else retailW += t;
            }

            if (iDate >= thirtyDaysAgo) {
              monthlyRev += t;
              if (isCash) cashM += t;
              else creditM += unpaid;
              
              if (isWholesale) wholesaleM += t;
              else retailM += t;
            }
          }
        });

        setMetrics(prev => {
          const pTotal = totalRev - prev.expensesTotal;
          const pWeekly = weeklyRev - prev.expensesWeekly;
          const pMonthly = monthlyRev - prev.expensesMonthly;
          return { 
            ...prev, 
            revenue: totalRev, 
            cashSales: cash, 
            creditSales: credit,
            wholesaleSales: wholesaleRev,
            retailSales: retailRev,
            wholesaleWeekly: wholesaleW,
            wholesaleMonthly: wholesaleM,
            retailWeekly: retailW,
            retailMonthly: retailM,
            weeklyRevenue: weeklyRev,
            monthlyRevenue: monthlyRev,
            cashWeekly: cashW,
            cashMonthly: cashM,
            creditWeekly: creditW,
            creditMonthly: creditM,
            profitWeekly: pWeekly,
            profitMonthly: pMonthly,
            profitTotal: pTotal
          };
        });
        checkLoaded();
      },
      qInvoices,
      (err) => {
        try {
          handleFirestoreError(err, OperationType.GET, `businesses/${activeBusinessId}/invoices`);
        } catch (e) {
          console.warn("Gracefully logged dashboard invoices error:", e);
        }
        checkLoaded();
      }
    );

    // Inventory
    const unsubInventory = subscribeToCollection(
      `businesses/${activeBusinessId}/products`,
      (items) => {
        setProducts(items);
        
        // Update IndexedDB Cache
        offlineDb.saveProducts(items).catch(err => {
          console.warn("Could not cache products:", err);
        });
        const lowStock = items.filter(d => (d.stockLevel || 0) > 0 && (d.stockLevel || 0) <= (d.lowStockThreshold || 5)).length;
        const outOfStock = items.filter(d => (d.stockLevel || 0) <= 0).length;
        const inStock = items.filter(d => (d.stockLevel || 0) > (d.lowStockThreshold || 5)).length;
        
        setMetrics(prev => ({ 
          ...prev, 
          lowStockCount: lowStock,
          outOfStockCount: outOfStock,
          inStockCount: inStock,
          totalProducts: items.length
        }));
        checkLoaded();
      },
      undefined,
      (err) => {
        try {
          handleFirestoreError(err, OperationType.GET, `businesses/${activeBusinessId}/products`);
        } catch (e) {
          console.warn("Gracefully logged dashboard products error:", e);
        }
        checkLoaded();
      }
    );

    // Recent Sales
    const unsubRecent = () => {}; // Handled by local client sorting in invoices subscriber!

    // Expenses stats
    const unsubExpenses = subscribeToCollection(
      `businesses/${activeBusinessId}/expenses`,
      (items) => {
        setAllExpenses(items);
        let expTotal = 0;
        let expWeekly = 0;
        let expMonthly = 0;

        const now = getSnapshotNow(items);
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(now.getDate() - 7);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(now.getDate() - 30);
        thirtyDaysAgo.setHours(0, 0, 0, 0);

        items.forEach(data => {
          const amount = Number(data.amount) || 0;
          expTotal += amount;

          let expDate: Date | null = null;
          if (data.createdAt) {
            expDate = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
          } else if (data.date) {
            expDate = new Date(data.date);
          }

          if (expDate) {
            if (expDate >= sevenDaysAgo) expWeekly += amount;
            if (expDate >= thirtyDaysAgo) expMonthly += amount;
          }
        });

        setMetrics(prev => {
          const pTotal = prev.revenue - expTotal;
          const pWeekly = prev.weeklyRevenue - expWeekly;
          const pMonthly = prev.monthlyRevenue - expMonthly;
          return {
            ...prev,
            expensesTotal: expTotal,
            expensesWeekly: expWeekly,
            expensesMonthly: expMonthly,
            profitWeekly: pWeekly,
            profitMonthly: pMonthly,
            profitTotal: pTotal
          };
        });
        checkLoaded();
      },
      undefined,
      (err) => {
        try {
          handleFirestoreError(err, OperationType.GET, `businesses/${activeBusinessId}/expenses`);
        } catch (e) {
          console.warn("Gracefully logged dashboard expenses error:", e);
        }
        checkLoaded();
      }
    );

    return () => {
      unsubCustomers();
      unsubPayments();
      unsubInvoices();
      unsubInventory();
      unsubRecent();
      unsubExpenses();
    };
  }, [activeBusinessId, refreshKey]);

  // Hook to subscribe to all payments of the business
  useEffect(() => {
    if (!activeBusinessId) return;

    const unsubPaymentsAll = subscribeToCollection(
      `businesses/${activeBusinessId}/payments`,
      (items) => {
        setAllPayments(items);
      },
      undefined,
      (err) => {
        console.error("Error fetching all payments:", err);
      }
    );

    return () => {
      unsubPaymentsAll();
    };
  }, [activeBusinessId, refreshKey]);

  // Trigger Automatic Morning WhatsApp Report & Overdue/Low stock in-app alerts on startup
  useEffect(() => {
    if (loading) return;
    if (!activeBusinessId || !businessData || !profile) return;

    const todayStr = new Date().toISOString().split('T')[0];

    // 1. WhatsApp Automated Daily Sales Report
    const autoReportEnabled = businessData.automation?.autoSendDailyWhatsAppReport === true;
    if (autoReportEnabled) {
      const lastSentSaved = localStorage.getItem(`sabush_daily_report_sent_${activeBusinessId}`);
      if (lastSentSaved !== todayStr) {
        const triggerAutoReport = async () => {
          const apiKey = businessData.whatsappConfig?.apiKey;
          const phoneId = businessData.whatsappConfig?.phoneNumberId;
          const recipient = businessData.phone || businessData.whatsappConfig?.phone || profile.phone || profile.phoneNumber || "";
          
          if (apiKey && phoneId && recipient) {
            try {
              const { sendWhatsAppSummaryReport } = await import('../lib/whatsappService');
              const prettyDate = new Date().toLocaleDateString('pt-MZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
              
              await sendWhatsAppSummaryReport({
                apiKey,
                phoneNumberId: phoneId,
                recipientPhone: recipient,
                businessName: businessData.name || "Sua Empresa",
                dateStr: prettyDate,
                totalSalesCount: recentSales.length || 0,
                totalRevenue: metrics.revenue || 0,
                totalExpenses: metrics.expensesTotal || 0,
                profit: Math.max(0, (metrics.revenue || 0) - (metrics.expensesTotal || 0)),
                lowStockCount: metrics.lowStockCount || 0,
                outstandingCredit: metrics.outstanding || 0,
                currency: businessData.currency || "MZN"
              });

              localStorage.setItem(`sabush_daily_report_sent_${activeBusinessId}`, todayStr);
              toast.success("Relatório matinal automático enviado para o WhatsApp do gestor!");
            } catch (err) {
              console.warn("Background auto sales report failed:", err);
            }
          }
        };

        const timer = setTimeout(triggerAutoReport, 5000);
        return () => clearTimeout(timer);
      }
    }

    // 2. In-App Low Stock warnings inside the notification bell
    if (metrics.lowStockCount > 0) {
      const lastLowStockWarn = localStorage.getItem(`sabush_lowstock_warn_sent_${activeBusinessId}`);
      if (lastLowStockWarn !== todayStr) {
        import('../lib/notificationService').then(({ sendLiveNotification }) => {
          sendLiveNotification(
            activeBusinessId,
            "Alerta de Artigos em Ruptura / Stock Baixo",
            `Atenção: Existem ${metrics.lowStockCount} produtos com stock no nível ou abaixo do limite de alerta de stock mínimo.`,
            "warning"
          );
        });
        localStorage.setItem(`sabush_lowstock_warn_sent_${activeBusinessId}`, todayStr);
      }
    }

    // 3. In-App Overdue Payments warnings inside the notification bell
    if (metrics.overdueCount > 0) {
      const lastOverdueWarn = localStorage.getItem(`sabush_overdue_warn_sent_${activeBusinessId}`);
      if (lastOverdueWarn !== todayStr) {
        import('../lib/notificationService').then(({ sendLiveNotification }) => {
          sendLiveNotification(
            activeBusinessId,
            "Alerta de Faturas/Contas Vencidas",
            `Alerta de Crédito: Tem ${metrics.overdueCount} faturas de crédito em atraso aguardando pagamento de clientes.`,
            "warning"
          );
        });
        localStorage.setItem(`sabush_overdue_warn_sent_${activeBusinessId}`, todayStr);
      }
    }

    // 4. In-App Expiration warnings inside the notification bell
    if (expiryAlertStats.hasAlerts) {
      const lastExpiryWarn = localStorage.getItem(`sabush_expiry_warn_sent_${activeBusinessId}`);
      if (lastExpiryWarn !== todayStr) {
        import('../lib/notificationService').then(({ sendLiveNotification }) => {
          sendLiveNotification(
            activeBusinessId,
            "⚠️ Alerta de Prazos de Validade",
            `Existem ${expiryAlertStats.expired + expiryAlertStats.expiringSoon} produtos que já têm lotes expirados ou com menos de 30 dias de validade! Por favor, verifique.`,
            "warning"
          );
        });
        localStorage.setItem(`sabush_expiry_warn_sent_${activeBusinessId}`, todayStr);
      }
    }

    // 5. Daily Email Expiration alerts
    if (expiryAlertStats.hasAlerts) {
      const lastEmailExpiryAlert = localStorage.getItem(`sabush_daily_email_alert_sent_${activeBusinessId}`);
      if (lastEmailExpiryAlert !== todayStr) {
        const triggerExpiryEmail = async () => {
          let alertDetails = '';
          const today = new Date();
          today.setHours(0,0,0,0);
          const thirtyDaysFromNow = new Date(today);
          thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

          let counter = 1;
          products.forEach(product => {
            const batches = product.batches || [];
            let runningTotal = product.stockLevel || 0;
            
            const sortedBatches = [...batches].sort((a, b) => {
              const dateA = a.receivedDate || '';
              const dateB = b.receivedDate || '';
              return dateB.localeCompare(dateA);
            });

            sortedBatches.forEach(batch => {
              if (runningTotal <= 0) return;
              const bQty = Number(batch.quantity) || 0;
              const reconciledQty = Math.min(bQty, runningTotal);
              runningTotal -= reconciledQty;

              if (batch.expiryDate && reconciledQty > 0) {
                const expDate = new Date(batch.expiryDate + 'T00:00:00');
                const diffTime = expDate.getTime() - today.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                let statusText = '';
                if (diffDays <= 0) {
                  statusText = '❌ EXPIRADO';
                } else if (diffDays <= 30) {
                  statusText = `⚠️ EXPIRA EM ${diffDays} DIAS`;
                }

                if (statusText) {
                  alertDetails += `${counter}. Produto: ${product.name}\n`;
                  alertDetails += `   - Lote Ref: ${batch.batchNo || 'N/A'}\n`;
                  alertDetails += `   - Qtd Ativa: ${reconciledQty} ${product.unitType || 'un'}\n`;
                  alertDetails += `   - Expira em: ${batch.expiryDate} (${statusText})\n\n`;
                  counter++;
                }
              }
            });
          });

          if (alertDetails) {
            try {
              const { sendEmailNotification } = await import('../lib/emailService');
              const recipientEmail = businessData.email || profile.email || "gestor@sabush.com";
              const subject = "Sabush ERP: Alertas Diários de Validade";
              const body = `Olá Administrador,

Este é um alerta automático diário para notificar que existem itens no inventário que expiraram ou que estão próximos da data de validade (limite de 30 dias).

Resumo detalhado dos lotes em risco:
--------------------------------------------------
${alertDetails}
--------------------------------------------------

Por favor, aceda à secção de Inventário no Sabush System ERP para activar promoções ou retirar os lotes em questão para evitar prejuízos.

Cumprimentos,
Serviço de Alertas Automáticos
Sabush System ERP`;

              await sendEmailNotification(recipientEmail, subject, body);
              localStorage.setItem(`sabush_daily_email_alert_sent_${activeBusinessId}`, todayStr);
            } catch (err) {
              console.warn("Auto expiry email failed:", err);
            }
          }
        };

        const timer = setTimeout(triggerExpiryEmail, 6000);
        return () => clearTimeout(timer);
      }
    }
  }, [loading, activeBusinessId, businessData, profile, metrics, expiryAlertStats, products]);

  // Compute 30-day derivatives internally from historical sets to maintain existing components
  const payments30 = React.useMemo(() => {
    const limitDate = new Date(referenceToday);
    limitDate.setDate(limitDate.getDate() - 30);
    limitDate.setHours(0, 0, 0, 0);
    return allPayments.filter(p => {
      const d = parseSafeDate(p.createdAt || p.date);
      return d && d >= limitDate;
    });
  }, [allPayments, referenceToday]);

  const invoices30 = React.useMemo(() => {
    const limitDate = new Date(referenceToday);
    limitDate.setDate(limitDate.getDate() - 30);
    limitDate.setHours(0, 0, 0, 0);
    return allInvoices.filter(inv => {
      const d = parseSafeDate(inv.createdAt || inv.date);
      return d && d >= limitDate;
    });
  }, [allInvoices, referenceToday]);

  const expenses30 = React.useMemo(() => {
    const limitDate = new Date(referenceToday);
    limitDate.setDate(limitDate.getDate() - 30);
    limitDate.setHours(0, 0, 0, 0);
    return allExpenses.filter(exp => {
      const d = parseSafeDate(exp.createdAt || exp.date);
      return d && d >= limitDate;
    });
  }, [allExpenses, referenceToday]);

  // Main Memo for Date Range filtered statistics and chart aggregation
  const filteredChartAndMetricData = React.useMemo(() => {
    if (!startDateStr || !endDateStr) {
      return {
        invoices: [],
        expenses: [],
        payments: [],
        metrics: { revenue: 0, retail: 0, wholesale: 0, cashSales: 0, creditSales: 0, expenses: 0, payments: 0, profit: 0, margin: 0 },
        chartData: []
      };
    }

    const start = new Date(startDateStr);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDateStr);
    end.setHours(23, 59, 59, 999);

    // Filter invoices in range
    const filteredInvoices = allInvoices.filter(inv => {
      const d = parseSafeDate(inv.createdAt || inv.date);
      return d && d >= start && d <= end;
    });

    // Filter expenses in range
    const filteredExpenses = allExpenses.filter(exp => {
      const d = parseSafeDate(exp.createdAt || exp.date);
      return d && d >= start && d <= end;
    });

    // Filter payments in range
    const filteredPayments = allPayments.filter(p => {
      const d = parseSafeDate(p.createdAt || p.date);
      return d && d >= start && d <= end;
    });

    // Compute metrics for active period
    let activeRevenue = 0;
    let activeRetail = 0;
    let activeWholesale = 0;
    let activeCashSales = 0;
    let activeCreditSales = 0;

    filteredInvoices.forEach(inv => {
      const t = Number(inv.total) || 0;
      const unpaid = inv.outstandingBalance !== undefined ? (Number(inv.outstandingBalance) || 0) : t;
      activeRevenue += t;

      const isCash = inv.paymentType === 'cash' || inv.paymentMethod === 'cash' || inv.status === 'paid';
      const isWholesale = inv.saleType === 'wholesale';

      if (isCash) {
        activeCashSales += t;
      } else {
        activeCreditSales += unpaid;
      }

      if (isWholesale) {
        activeWholesale += t;
      } else {
        activeRetail += t;
      }
    });

    let activeExpenses = 0;
    filteredExpenses.forEach(exp => {
      activeExpenses += Number(exp.amount) || 0;
    });

    let activePayments = 0;
    filteredPayments.forEach(p => {
      if (p.type !== 'subscription') {
        activePayments += Number(p.amount) || 0;
      }
    });

    // Net/Profit
    const activeProfit = activeRevenue - activeExpenses;
    const profitMargin = activeRevenue > 0 ? (activeProfit / activeRevenue) * 100 : 0;

    // Daily/Weekly aggregation
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    const chartPoints: { [key: string]: { label: string; sales: number; expenses: number; profit: number; margin: number } } = {};

    if (diffDays <= 45) {
      // Group by Day
      for (let i = 0; i <= diffDays; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        if (d > end) break;
        const dayKey = d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
        const label = d.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' });
        chartPoints[dayKey] = { label, sales: 0, expenses: 0, profit: 0, margin: 0 };
      }

      filteredInvoices.forEach(inv => {
        const d = parseSafeDate(inv.createdAt || inv.date);
        if (d) {
          const key = d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
          if (chartPoints[key]) {
            chartPoints[key].sales += Number(inv.total) || 0;
          }
        }
      });

      filteredExpenses.forEach(exp => {
        const d = parseSafeDate(exp.createdAt || exp.date);
        if (d) {
          const key = d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
          if (chartPoints[key]) {
            chartPoints[key].expenses += Number(exp.amount) || 0;
          }
        }
      });
    } else {
      // Group by Week or Month
      if (diffDays > 180) {
        // Group by Month
        const temp = new Date(start);
        while (temp <= end) {
          const monthKey = `${temp.getFullYear()}-${temp.getMonth()}`;
          const label = temp.toLocaleDateString('pt-PT', { month: 'short', year: '2-digit' });
          chartPoints[monthKey] = { label, sales: 0, expenses: 0, profit: 0, margin: 0 };
          temp.setMonth(temp.getMonth() + 1);
        }

        filteredInvoices.forEach(inv => {
          const d = parseSafeDate(inv.createdAt || inv.date);
          if (d) {
            const key = `${d.getFullYear()}-${d.getMonth()}`;
            if (chartPoints[key]) {
              chartPoints[key].sales += Number(inv.total) || 0;
            }
          }
        });

        filteredExpenses.forEach(exp => {
          const d = parseSafeDate(exp.createdAt || exp.date);
          if (d) {
            const key = `${d.getFullYear()}-${d.getMonth()}`;
            if (chartPoints[key]) {
              chartPoints[key].expenses += Number(exp.amount) || 0;
            }
          }
        });
      } else {
        // Group by Week
        const totalWeeks = Math.ceil(diffDays / 7);
        for (let w = 0; w < totalWeeks; w++) {
          const wStart = new Date(start);
          wStart.setDate(start.getDate() + w * 7);
          const wEnd = new Date(wStart);
          wEnd.setDate(wStart.getDate() + 6);
          const weekKey = `W${w + 1}`;
          const label = `${wStart.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })} a ${wEnd > end ? end.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' }) : wEnd.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })}`;
          chartPoints[weekKey] = { label, sales: 0, expenses: 0, profit: 0, margin: 0 };
          
          filteredInvoices.forEach(inv => {
            const d = parseSafeDate(inv.createdAt || inv.date);
            if (d && d >= wStart && d <= wEnd && d <= end) {
              chartPoints[weekKey].sales += Number(inv.total) || 0;
            }
          });

          filteredExpenses.forEach(exp => {
            const d = parseSafeDate(exp.createdAt || exp.date);
            if (d && d >= wStart && d <= wEnd && d <= end) {
              chartPoints[weekKey].expenses += Number(exp.amount) || 0;
            }
          });
        }
      }
    }

    const pointsList = Object.values(chartPoints).map(pt => {
      const profit = pt.sales - pt.expenses;
      const margin = pt.sales > 0 ? parseFloat(((profit / pt.sales) * 100).toFixed(1)) : 0;
      return {
        ...pt,
        profit,
        margin
      };
    });

    return {
      invoices: filteredInvoices,
      expenses: filteredExpenses,
      payments: filteredPayments,
      metrics: {
        revenue: activeRevenue,
        retail: activeRetail,
        wholesale: activeWholesale,
        cashSales: activeCashSales,
        creditSales: activeCreditSales,
        expenses: activeExpenses,
        payments: activePayments,
        profit: activeProfit,
        margin: parseFloat(profitMargin.toFixed(1))
      },
      chartData: pointsList
    };
  }, [allInvoices, allExpenses, allPayments, startDateStr, endDateStr]);

  // Dynamic rolling weekly sales trends (last 8 weeks) for the SME growth line chart
  const weeklySalesTrends = React.useMemo(() => {
    const weeksList: { start: Date; end: Date; label: string; sales: number }[] = [];
    const now = new Date(referenceToday);
    
    // Generate last 8 weeks (index 0 is 7 weeks ago, index 7 is current week)
    for (let i = 7; i >= 0; i--) {
      const wStart = new Date(now);
      // Calculate Monday of that week
      wStart.setDate(now.getDate() - (i * 7) - ((now.getDay() === 0 ? 7 : now.getDay()) - 1));
      wStart.setHours(0, 0, 0, 0);
      
      const wEnd = new Date(wStart);
      wEnd.setDate(wStart.getDate() + 6);
      wEnd.setHours(23, 59, 59, 999);
      
      const label = `Sem ${8 - i}`; // Sem is short for Semana (Week)
      weeksList.push({
        start: wStart,
        end: wEnd,
        label,
        sales: 0
      });
    }

    allInvoices.forEach(inv => {
      const d = parseSafeDate(inv?.createdAt || inv?.date);
      if (d) {
        const total = Number(inv.total) || 0;
        // Find which week this invoice belongs to
        for (const wk of weeksList) {
          if (d >= wk.start && d <= wk.end) {
            wk.sales += total;
            break;
          }
        }
      }
    });

    return weeksList.map(wk => ({
      name: wk.label,
      period: `${wk.start.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })} - ${wk.end.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })}`,
      sales: wk.sales,
    }));
  }, [allInvoices, referenceToday]);

  // Compute 6-month sales trend for the interactive chart widget
  const sixMonthSalesTrend = React.useMemo(() => {
    const monthsList = [];
    // Last 6 months relative to referenceToday
    for (let i = 5; i >= 0; i--) {
      const d = new Date(referenceToday.getFullYear(), referenceToday.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth();
      const monthShort = d.toLocaleString('pt-PT', { month: 'short' }).replace('.', '').toUpperCase();
      const name = `${monthShort}/${String(year).slice(-2)}`;
      
      monthsList.push({
        year,
        month,
        name,
        vendas: 0,
        faturas: 0
      });
    }

    allInvoices.forEach(inv => {
      const d = parseSafeDate(inv?.createdAt || inv?.date);
      if (d) {
        const year = d.getFullYear();
        const month = d.getMonth();
        const total = Number(inv.total) || 0;
        
        const slot = monthsList.find(s => s.year === year && s.month === month);
        if (slot) {
          slot.vendas += total;
          slot.faturas += 1;
        }
      }
    });

    return monthsList;
  }, [allInvoices, referenceToday]);

  // Compute 7-day sales and invoicing trend for the daily data visualization widget
  const last7DaysInvoicingTrend = React.useMemo(() => {
    const daysList = [];
    const weekdaysNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    
    // Construct the list of last 7 days ending in referenceToday
    for (let i = 6; i >= 0; i--) {
      const d = new Date(referenceToday);
      d.setDate(referenceToday.getDate() - i);
      const dateStr = d.toISOString().split('T')[0]; // YYYY-MM-DD
      const weekday = weekdaysNames[d.getDay()];
      const dayMonth = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
      
      daysList.push({
        dateStr,
        name: `${weekday}, ${dayMonth}`,
        faturacao: 0,
        faturasCount: 0,
        avgTicket: 0,
      });
    }

    allInvoices.forEach(inv => {
      const d = parseSafeDate(inv?.createdAt || inv?.date);
      
      if (d) {
        const invDateStr = d.toISOString().split('T')[0];
        const total = Number(inv.total) || 0;
        
        const slot = daysList.find(s => s.dateStr === invDateStr);
        if (slot) {
          slot.faturacao += total;
          slot.faturasCount += 1;
        }
      }
    });

    // Calculate average ticket per day
    daysList.forEach(slot => {
      if (slot.faturasCount > 0) {
        slot.avgTicket = Math.round(slot.faturacao / slot.faturasCount);
      }
    });

    return daysList;
  }, [allInvoices, referenceToday]);

  // Compute 30-day statistics: Total In, Total Out, Balance
  const cashFlowStats = React.useMemo(() => {
    let totalIn = 0;
    let totalOut = 0;

    payments30.forEach(p => {
      if (p.type !== 'subscription') {
        totalIn += Number(p.amount) || 0;
      }
    });

    invoices30.forEach(inv => {
      if (inv.paymentType === 'cash' || inv.status === 'paid') {
        totalIn += Number(inv.total) || 0;
      }
    });

    expenses30.forEach(exp => {
      totalOut += Number(exp.amount) || 0;
    });

    return {
      totalIncoming: totalIn,
      totalOutgoing: totalOut,
      netCashFlow: totalIn - totalOut
    };
  }, [payments30, invoices30, expenses30]);

  // Format 30-day aggregation for Recharts Cash Flow visualizer
  const monthlyCashFlowData = React.useMemo(() => {
    const days: { [key: string]: { dateStr: string; incoming: number; outgoing: number } } = {};
    
    for (let i = 29; i >= 0; i--) {
      const d = new Date(referenceToday);
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
      const dateStr = d.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' });
      days[key] = {
        dateStr,
        incoming: 0,
        outgoing: 0
      };
    }

    payments30.forEach(p => {
      if (p.type === 'subscription') return;
      let d: Date | null = null;
      if (p.createdAt) {
        d = p.createdAt.toDate ? p.createdAt.toDate() : new Date(p.createdAt);
      } else if (p.date) {
        d = new Date(p.date);
      }
      if (d) {
        const key = d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
        if (days[key]) {
          days[key].incoming += Number(p.amount) || 0;
        }
      }
    });

    invoices30.forEach(inv => {
      if (inv.paymentType === 'cash' || inv.status === 'paid') {
        let d: Date | null = null;
        if (inv.createdAt) {
          d = inv.createdAt.toDate ? inv.createdAt.toDate() : new Date(inv.createdAt);
        } else if (inv.date) {
          d = new Date(inv.date);
        }
        if (d) {
          const key = d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
          if (days[key]) {
            days[key].incoming += Number(inv.total) || 0;
          }
        }
      }
    });

    expenses30.forEach(exp => {
      let d: Date | null = null;
      if (exp.createdAt) {
        d = exp.createdAt.toDate ? exp.createdAt.toDate() : new Date(exp.createdAt);
      } else if (exp.date) {
        d = new Date(exp.date);
      }
      if (d) {
        const key = d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
        if (days[key]) {
          days[key].outgoing += Number(exp.amount) || 0;
        }
      }
    });

    return Object.values(days).map(day => ({
      name: day.dateStr,
      'Entradas (In)': parseFloat(day.incoming.toFixed(0)),
      'Saídas (Out)': parseFloat(day.outgoing.toFixed(0)),
    }));
  }, [payments30, invoices30, expenses30, referenceToday]);

  // Dynamic Cash Flow aggregation based on the filtered date range
  const filteredCashFlowData = React.useMemo(() => {
    const start = new Date(startDateStr);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDateStr);
    end.setHours(23, 59, 59, 999);

    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    const days: { [key: string]: { dateStr: string; incoming: number; outgoing: number } } = {};

    if (diffDays <= 45) {
      for (let i = 0; i <= diffDays; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        if (d > end) break;
        const key = d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
        const dateStr = d.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' });
        days[key] = { dateStr, incoming: 0, outgoing: 0 };
      }

      filteredChartAndMetricData.payments.forEach(p => {
        if (p.type === 'subscription') return;
        const d = parseSafeDate(p.createdAt || p.date);
        if (d) {
          const key = d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
          if (days[key]) {
            days[key].incoming += Number(p.amount) || 0;
          }
        }
      });

      filteredChartAndMetricData.invoices.forEach(inv => {
        if (inv.paymentType === 'cash' || inv.status === 'paid') {
          const d = parseSafeDate(inv.createdAt || inv.date);
          if (d) {
            const key = d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
            if (days[key]) {
              days[key].incoming += Number(inv.total) || 0;
            }
          }
        }
      });

      filteredChartAndMetricData.expenses.forEach(exp => {
        const d = parseSafeDate(exp.createdAt || exp.date);
        if (d) {
          const key = d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
          if (days[key]) {
            days[key].outgoing += Number(exp.amount) || 0;
          }
        }
      });
    } else {
      if (diffDays > 180) {
        const temp = new Date(start);
        while (temp <= end) {
          const key = `${temp.getFullYear()}-${temp.getMonth()}`;
          const dateStr = temp.toLocaleDateString('pt-PT', { month: 'short', year: '2-digit' });
          days[key] = { dateStr, incoming: 0, outgoing: 0 };
          temp.setMonth(temp.getMonth() + 1);
        }

        filteredChartAndMetricData.payments.forEach(p => {
          if (p.type === 'subscription') return;
          const d = parseSafeDate(p.createdAt || p.date);
          if (d) {
            const key = `${d.getFullYear()}-${d.getMonth()}`;
            if (days[key]) {
              days[key].incoming += Number(p.amount) || 0;
            }
          }
        });

        filteredChartAndMetricData.invoices.forEach(inv => {
          if (inv.paymentType === 'cash' || inv.status === 'paid') {
            const d = parseSafeDate(inv.createdAt || inv.date);
            if (d) {
              const key = `${d.getFullYear()}-${d.getMonth()}`;
              if (days[key]) {
                days[key].incoming += Number(inv.total) || 0;
              }
            }
          }
        });

        filteredChartAndMetricData.expenses.forEach(exp => {
          const d = parseSafeDate(exp.createdAt || exp.date);
          if (d) {
            const key = `${d.getFullYear()}-${d.getMonth()}`;
            if (days[key]) {
              days[key].outgoing += Number(exp.amount) || 0;
            }
          }
        });
      } else {
        const totalWeeks = Math.ceil(diffDays / 7);
        for (let w = 0; w < totalWeeks; w++) {
          const wStart = new Date(start);
          wStart.setDate(start.getDate() + w * 7);
          const wEnd = new Date(wStart);
          wEnd.setDate(wStart.getDate() + 6);
          const key = `W${w + 1}`;
          const dateStr = `${wStart.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })} a ${wEnd > end ? end.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' }) : wEnd.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })}`;
          days[key] = { dateStr, incoming: 0, outgoing: 0 };

          filteredChartAndMetricData.payments.forEach(p => {
            if (p.type === 'subscription') return;
            const d = parseSafeDate(p.createdAt || p.date);
            if (d && d >= wStart && d <= wEnd && d <= end) {
              days[key].incoming += Number(p.amount) || 0;
            }
          });

          filteredChartAndMetricData.invoices.forEach(inv => {
            if (inv.paymentType === 'cash' || inv.status === 'paid') {
              const d = parseSafeDate(inv.createdAt || inv.date);
              if (d && d >= wStart && d <= wEnd && d <= end) {
                days[key].incoming += Number(inv.total) || 0;
              }
            }
          });

          filteredChartAndMetricData.expenses.forEach(exp => {
            const d = parseSafeDate(exp.createdAt || exp.date);
            if (d && d >= wStart && d <= wEnd && d <= end) {
              days[key].outgoing += Number(exp.amount) || 0;
            }
          });
        }
      }
    }

    return Object.values(days).map(day => ({
      name: day.dateStr,
      'Entradas (In)': parseFloat(day.incoming.toFixed(0)),
      'Saídas (Out)': parseFloat(day.outgoing.toFixed(0)),
    }));
  }, [startDateStr, endDateStr, filteredChartAndMetricData]);

  const overallMargin = React.useMemo(() => {
    let totalRevenueSum = 0;
    let totalCostSum = 0;
    
    products.forEach(p => {
      const price = p.price || 0;
      const cost = typeof p.costPrice === 'number' ? p.costPrice : (p.purchasePrice || (price * 0.65));
      const stock = Math.max(0, p.stockLevel || 0);

      totalRevenueSum += price * (stock || 1);
      totalCostSum += cost * (stock || 1);
    });

    if (totalRevenueSum === 0) return 0;
    return Math.max(0, Math.min(100, ((totalRevenueSum - totalCostSum) / totalRevenueSum) * 100));
  }, [products]);

  const marginStatsByCategory = React.useMemo(() => {
    const categories: { [key: string]: { totalCost: number; totalRevenue: number; count: number } } = {};
    
    products.forEach(p => {
      const cat = (p.category || 'Outros').trim();
      const price = p.price || 0;
      const cost = typeof p.costPrice === 'number' ? p.costPrice : (p.purchasePrice || (price * 0.65));
      const stock = Math.max(0, p.stockLevel || 0);

      if (!categories[cat]) {
        categories[cat] = { totalCost: 0, totalRevenue: 0, count: 0 };
      }
      
      categories[cat].totalCost += cost * (stock || 1);
      categories[cat].totalRevenue += price * (stock || 1);
      categories[cat].count += 1;
    });

    return Object.entries(categories).map(([name, data]) => {
      const marginAmount = data.totalRevenue - data.totalCost;
      const marginPercent = data.totalRevenue > 0 
        ? Math.max(0, Math.min(100, (marginAmount / data.totalRevenue) * 100)) 
        : 0;
      
      return {
        name,
        margin: parseFloat(marginPercent.toFixed(1)),
        revenue: data.totalRevenue,
        cost: data.totalCost,
        count: data.count
      };
    }).sort((a,b) => b.margin - a.margin);
  }, [products]);

  // Compute 12-month sales trend
  const twelveMonthSalesTrend = React.useMemo(() => {
    const monthsList = [];
    const today = new Date(referenceToday);
    // Last 12 months relative to referenceToday
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth();
      const monthShort = d.toLocaleString('pt-PT', { month: 'short' }).replace('.', '').toUpperCase();
      const name = `${monthShort}/${String(year).slice(-2)}`;
      
      monthsList.push({
        year,
        month,
        name,
        vendas: 0,
        faturas: 0
      });
    }

    allInvoices.forEach(inv => {
      const d = parseSafeDate(inv?.createdAt || inv?.date);
      if (d) {
        const year = d.getFullYear();
        const month = d.getMonth();
        const total = Number(inv.total) || 0;
        
        const slot = monthsList.find(s => s.year === year && s.month === month);
        if (slot) {
          slot.vendas += total;
          slot.faturas += 1;
        }
      }
    });

    return monthsList;
  }, [allInvoices, referenceToday]);

  // Premium Channel Trends computation vs last month
  const channelTrends = React.useMemo(() => {
    const today = new Date(referenceToday);
    const startCurrent = new Date(today.getFullYear(), today.getMonth(), 1);
    const endCurrent = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
    
    const startLast = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const endLast = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999);

    let curRetail = 0, curWholesale = 0, curCash = 0;
    let lastRetail = 0, lastWholesale = 0, lastCash = 0;

    allInvoices.forEach(inv => {
      const d = parseSafeDate(inv.createdAt || inv.date);
      if (!d) return;
      const t = Number(inv.total) || 0;
      const isWholesale = inv.saleType === 'wholesale';
      const isCash = inv.paymentType === 'cash' || inv.paymentMethod === 'cash' || inv.status === 'paid';

      if (d >= startCurrent && d <= endCurrent) {
        if (isWholesale) curWholesale += t;
        else curRetail += t;
        if (isCash) curCash += t;
      } else if (d >= startLast && d <= endLast) {
        if (isWholesale) lastWholesale += t;
        else lastRetail += t;
        if (isCash) lastCash += t;
      }
    });

    const getTrend = (cur: number, last: number) => {
      if (last === 0) return cur > 0 ? 100 : 0;
      return Math.round(((cur - last) / last) * 105); // slight bias correction or absolute
    };

    return {
      retail: getTrend(curRetail, lastRetail),
      wholesale: getTrend(curWholesale, lastWholesale),
      cash: getTrend(curCash, lastCash)
    };
  }, [allInvoices, referenceToday]);

  // Sparkline data for the KPI visual paths
  const sparklineData = React.useMemo(() => {
    const points = [];
    const today = new Date(referenceToday);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dateLabel = d.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' });
      points.push({ dateStr, dateLabel, retail: 0, wholesale: 0, cash: 0 });
    }

    allInvoices.forEach(inv => {
      const d = parseSafeDate(inv.createdAt || inv.date);
      if (!d) return;
      const dateStr = d.toISOString().split('T')[0];
      const pt = points.find(p => p.dateStr === dateStr);
      if (pt) {
        const t = Number(inv.total) || 0;
        const isWholesale = inv.saleType === 'wholesale';
        const isCash = inv.paymentType === 'cash' || inv.paymentMethod === 'cash' || inv.status === 'paid';
        if (isWholesale) pt.wholesale += t;
        else pt.retail += t;
        if (isCash) pt.cash += t;
      }
    });

    return points;
  }, [allInvoices, referenceToday]);

  const copyPaymentLink = (sale: any) => {
    const bizId = activeBusinessId || profile?.businessId;
    if (!bizId) return;
    const baseUrl = window.location.origin;
    const link = `${baseUrl}?pay=${bizId}:${sale.id}`;
    
    navigator.clipboard.writeText(link).then(() => {
      toast.success("Payment link copied to clipboard!");
    }).catch(() => {
      toast.error("Failed to copy link");
    });
  };

  if (loading) {
    return (
      <div className="space-y-10 animate-in fade-in duration-500">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-64" />
          </div>
          <div className="flex items-center gap-3">
             <Skeleton className="h-12 w-40 rounded-2xl" />
             <Skeleton className="h-12 w-40 rounded-2xl" />
          </div>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1,2,3,4].map(i => (
            <Skeleton key={i} className="h-40 rounded-[32px]" />
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
           <Skeleton className="lg:col-span-2 h-[450px] rounded-[40px]" />
           <Skeleton className="h-[450px] rounded-[40px]" />
        </div>
      </div>
    );
  }

  const stats = [
    { label: t('revenue'), value: `${currency} ${filteredChartAndMetricData.metrics.revenue.toLocaleString()}`, change: 'Período Ativo', trend: 'up', icon: TrendingUp, color: 'text-emerald-500' },
    { label: t('total_debt'), value: `${currency} ${metrics.outstanding.toLocaleString()}`, change: metrics.overdueCount + ' Vencidos', trend: 'down', icon: AlertCircle, color: 'text-rose-500' },
    { label: t('customers'), value: metrics.customersCount.toString(), change: 'Total Clientes', trend: 'up', icon: Users, color: 'text-blue-500' },
    { label: 'Despesas Período', value: `${currency} ${filteredChartAndMetricData.metrics.expenses.toLocaleString()}`, change: 'Gastos de Operação', trend: 'down', icon: AlertCircle, color: 'text-rose-550' },
    { label: 'Lucro do Período', value: `${currency} ${filteredChartAndMetricData.metrics.profit.toLocaleString()}`, change: `Margem: ${filteredChartAndMetricData.metrics.margin.toFixed(1)}%`, trend: 'up', icon: Wallet, color: 'text-emerald-500' },
    { label: 'Vendas a Dinheiro', value: `${currency} ${filteredChartAndMetricData.metrics.cashSales.toLocaleString()}`, change: 'Entradas Directas', trend: 'up', icon: CreditCard, color: 'text-indigo-500' },
  ];

  const isFullScreen = false;
  const setIsFullScreen = (v: boolean) => {};
  const currentTime = new Date();

  if (isFullScreen) {
    return (
      <div className="fixed inset-0 z-[100] bg-[#090C16] text-[#F3F4F6] flex flex-col lg:flex-row h-screen w-screen overflow-hidden font-sans select-none animate-in fade-in duration-300">
        
        {/* LEFT HUD SIDEBAR */}
        <div className="w-full lg:w-72 bg-[#081F1E] border-r border-[#163B3A] p-6 flex flex-col justify-between shrink-0 h-auto lg:h-full overflow-y-auto">
          <div className="space-y-8">
            {/* Header / Logo */}
            <div className="flex items-center gap-3 bg-[#112E2B] p-3 rounded-2xl border border-[#1C4340] shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white text-lg font-black shrink-0 shadow-lg shadow-blue-500/20">
                S
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-extrabold text-white text-sm tracking-tight truncate leading-tight">
                  {profile?.businessName || 'Sabush ERP'}
                </span>
                <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mt-0.5 animate-pulse">
                  Executive HUD
                </span>
              </div>
            </div>

            {/* Access other features quickly */}
            <div className="space-y-1.5">
              <p className="px-3 text-[10px] font-black uppercase tracking-widest text-[#566A96] mb-3">
                Aceder Recursos / Features
              </p>
              
              {[
                { id: 'dashboard', label: 'Painel Geral', icon: LayoutDashboard },
                { id: 'pos', label: 'POS Billing', icon: ShoppingCart },
                { id: 'invoices', label: 'Faturas / Receipts', icon: ReceiptText },
                { id: 'payments', label: 'Pagamentos', icon: DollarSign },
                { id: 'credit', label: 'Gestão de Crédito', icon: AlertCircle },
                { id: 'inventory', label: 'Inventário / Stock', icon: Package },
                { id: 'customers', label: 'Clientes / Clients', icon: Users },
                { id: 'expenses', label: 'Registo Despesas', icon: CreditCard },
                { id: 'suppliers', label: 'Fornecedores', icon: Truck },
                { id: 'settings', label: 'Configurações', icon: SettingsIcon }
              ].map(f => {
                const isActive = f.id === 'dashboard';
                return (
                  <button
                    key={f.id}
                    onClick={() => {
                      if (f.id === 'dashboard') {
                        setIsFullScreen(false);
                      } else {
                        // Switch tab and close full screen
                        (window as any).setCurrentTab(f.id);
                        setIsFullScreen(false);
                        toast.success(`Navegado para ${f.label}`);
                      }
                    }}
                    className={cn(
                      "w-full flex items-center gap-3.5 px-3 py-3 rounded-xl text-left text-xs font-bold tracking-tight transition-all active:scale-[0.98] cursor-pointer",
                      isActive 
                        ? "bg-blue-600 text-white shadow-lg shadow-blue-600/10 border border-blue-500"
                        : "text-[#8FB0AC] hover:bg-[#10302E] hover:text-white"
                    )}
                  >
                    <f.icon size={16} className={isActive ? "text-white" : "text-[#566A96] group-hover:text-white"} />
                    <span className="flex-grow">{f.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-8 pt-4 border-t border-[#163B3A] flex flex-col gap-2">
            <div className="flex items-center gap-2 px-3 text-[9px] font-black text-[#566A96] tracking-widest uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping inline-block" />
              <span>TERMINAL TELEMETRIA</span>
            </div>
            <p className="px-3 text-[10px] font-bold text-[#8FB0AC]">Sabush ERP Pro v3.1</p>
          </div>
        </div>

        {/* RIGHT HUD BODY */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-8 flex flex-col gap-6 custom-scrollbar bg-[#090D1A]">
          
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#163B3A] pb-6">
            <div className="space-y-1">
              <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 rounded-md inline-block mb-1">
                Active Session Telemetry
              </span>
              <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
                Executive Management Center
              </h2>
            </div>

            {/* Real-time Clock Card */}
            <div className="flex items-center gap-4 bg-[#081F1E] border border-[#163B3A] p-3.5 rounded-2xl">
              <div className="flex flex-col items-end leading-none text-right shrink-0">
                <span className="text-xl font-mono font-black text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-orange-400 animate-pulse" />
                  {currentTime.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                <span className="text-[10px] font-bold text-[#8FB0AC] tracking-tight uppercase mt-1">
                  {currentTime.toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric', month: 'short' })}
                </span>
              </div>
              
              <button
                onClick={() => setIsFullScreen(false)}
                className="p-3 bg-red-600/10 hover:bg-red-600 border border-red-500/20 text-red-400 hover:text-white rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 font-bold text-xs uppercase tracking-widest"
                title="Minimizar Dashboard"
              >
                <Minimize2 size={16} />
                <span>Sair HUD</span>
              </button>
            </div>
          </div>

          {/* Filtro por Intervalo de Datas HUD */}
          <div className="bg-[#081F1E] border border-[#163B3A] rounded-2xl p-5 space-y-4 animate-in fade-in duration-300">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-[#112E2B] text-blue-400 rounded-xl border border-[#1C4340]">
                  <Clock size={16} />
                </div>
                <div>
                  <h4 className="text-xs font-black text-white uppercase tracking-wider">Filtro Temporal de Métricas</h4>
                  <p className="text-[10px] text-[#8FB0AC] font-bold">Ajusta todas as estatísticas e gráficos de faturamento.</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const start = new Date(referenceToday);
                    start.setDate(start.getDate() - 7);
                    setStartDateStr(start.toISOString().split('T')[0]);
                    setEndDateStr(new Date(referenceToday).toISOString().split('T')[0]);
                  }}
                  className="text-[9px] font-black tracking-widest text-[#8FB0AC] hover:text-white bg-[#14332F] hover:bg-[#1C4340] border border-[#1C4340] px-2.5 py-1.5 rounded-lg uppercase transition-all cursor-pointer"
                >
                  7 Dias
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const start = new Date(referenceToday);
                    start.setDate(start.getDate() - 30);
                    setStartDateStr(start.toISOString().split('T')[0]);
                    setEndDateStr(new Date(referenceToday).toISOString().split('T')[0]);
                  }}
                  className="text-[9px] font-black tracking-widest text-[#8FB0AC] hover:text-white bg-[#14332F] hover:bg-[#1C4340] border border-[#1C4340] px-2.5 py-1.5 rounded-lg uppercase transition-all cursor-pointer"
                >
                  30 Dias
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const start = new Date(referenceToday);
                    start.setMonth(start.getMonth() - 3);
                    setStartDateStr(start.toISOString().split('T')[0]);
                    setEndDateStr(new Date(referenceToday).toISOString().split('T')[0]);
                  }}
                  className="text-[9px] font-black tracking-widest text-[#8FB0AC] hover:text-white bg-[#14332F] hover:bg-[#1C4340] border border-[#1C4340] px-2.5 py-1.5 rounded-lg uppercase transition-all cursor-pointer"
                >
                  3 Meses
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const start = new Date(referenceToday.getFullYear(), 0, 1);
                    setStartDateStr(start.toISOString().split('T')[0]);
                    setEndDateStr(new Date(referenceToday).toISOString().split('T')[0]);
                  }}
                  className="text-[9px] font-black tracking-widest text-[#8FB0AC] hover:text-white bg-[#14332F] hover:bg-[#1C4340] border border-[#1C4340] px-2.5 py-1.5 rounded-lg uppercase transition-all cursor-pointer"
                >
                  Este Ano
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStartDateStr("2020-01-01");
                    setEndDateStr(new Date(referenceToday).toISOString().split('T')[0]);
                  }}
                  className="text-[9px] font-black tracking-widest text-[#8FB0AC] hover:text-white bg-[#14332F] hover:bg-[#1C4340] border border-[#1C4340] px-2.5 py-1.5 rounded-lg uppercase transition-all cursor-pointer"
                >
                  Todo Período
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2.5 border-t border-[#163B3A]/60">
              <div className="w-full sm:w-auto flex items-center gap-2">
                <span className="text-[10px] font-black text-[#566A96] tracking-wider uppercase">Início:</span>
                <input
                  type="date"
                  value={startDateStr}
                  onChange={(e) => setStartDateStr(e.target.value)}
                  className="w-full sm:w-auto text-xs font-bold font-mono text-white bg-[#0F2B29] border border-[#163B3A] hover:bg-[#14332F] focus:bg-[#090D1A] px-3 py-1.5 rounded-xl focus:outline-none focus:border-blue-500 transition-all"
                />
              </div>
              <div className="w-full sm:w-auto flex items-center gap-2">
                <span className="text-[10px] font-black text-[#566A96] tracking-wider uppercase">Fim:</span>
                <input
                  type="date"
                  value={endDateStr}
                  onChange={(e) => setEndDateStr(e.target.value)}
                  className="w-full sm:w-auto text-xs font-bold font-mono text-white bg-[#0F2B29] border border-[#163B3A] hover:bg-[#14332F] focus:bg-[#090D1A] px-3 py-1.5 rounded-xl focus:outline-none focus:border-blue-500 transition-all"
                />
              </div>
              
              <div className="ml-auto text-[10px] font-bold text-slate-400">
                Período Ativo: <span className="text-orange-400 font-mono font-black">{startDateStr} até {endDateStr}</span>
              </div>
            </div>
          </div>

          {/* Active Expiry Alerts Widget */}
          {expiryAlertStats.hasAlerts && (
            <div className="bg-[#1A1224] border border-rose-500/20 rounded-3xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 animate-in slide-in-from-top-4 duration-300">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 bg-rose-500/10 text-rose-500 rounded-2xl flex items-center justify-center shrink-0">
                  <Clock className="w-6 h-6 animate-pulse" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-black text-white tracking-tight flex items-center gap-2">
                    <span>⏳ Alerta de Validade do Inventário</span>
                    <span className="bg-rose-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded leading-none shrink-0 uppercase tracking-widest animate-pulse">ATENÇÃO</span>
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Atenção: existem <strong className="text-amber-400 font-bold">{expiryAlertStats.expiringSoon} lote(s)</strong> com validade próxima de expirar nos próximos 30 dias, e <strong className="text-rose-400 font-bold">{expiryAlertStats.expired} lote(s)</strong> que já expiraram!
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  localStorage.setItem('sabush_active_expiry_filter', 'true');
                  window.dispatchEvent(new CustomEvent('sabush-trigger-expiry-filter'));
                  if (typeof setCurrentTab === 'function') {
                    setCurrentTab('inventory');
                  } else {
                    (window as any).setCurrentTab?.('inventory');
                  }
                }}
                className="w-full sm:w-auto px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-rose-500/10 transition-all active:scale-95 text-center cursor-pointer font-sans"
              >
                Gerir Validade
              </button>
            </div>
          )}

          {/* Core Metrics Widgets */}
          <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6 border-b border-dashed border-[#163B3A] pb-4">
            {[
              { label: t('revenue'), value: `${currency} ${filteredChartAndMetricData.metrics.revenue.toLocaleString()}`, color: 'border-emerald-500/20 bg-emerald-500/5', labelColor: 'text-emerald-400', icon: TrendingUp },
              { label: t('total_debt'), value: `${currency} ${metrics.outstanding.toLocaleString()}`, color: 'border-rose-500/20 bg-rose-500/5', labelColor: 'text-rose-400', icon: AlertCircle },
              { label: t('customers'), value: metrics.customersCount.toString(), color: 'border-blue-500/20 bg-blue-500/5', labelColor: 'text-blue-400', icon: Users },
              { label: 'Gastos de Operação', value: `${currency} ${filteredChartAndMetricData.metrics.expenses.toLocaleString()}`, color: 'border-[#EC4899]/20 bg-[#EC4899]/5', labelColor: 'text-[#F472B6]', icon: DollarSign },
              { label: 'Lucro Estimado', value: `${currency} ${filteredChartAndMetricData.metrics.profit.toLocaleString()}`, color: 'border-teal-500/20 bg-teal-500/5', labelColor: 'text-teal-400', icon: Wallet },
              { label: 'Vendas a Crédito', value: `${currency} ${filteredChartAndMetricData.metrics.creditSales.toLocaleString()}`, color: 'border-amber-500/20 bg-amber-500/5', labelColor: 'text-amber-400', icon: CreditCard }
            ].map((stat, idx) => (
              <div key={stat.label} className={cn("p-4 rounded-2xl border flex flex-col justify-between transition-transform hover:scale-[1.02] bg-[#081F1E]", stat.color, idx === 0 ? "highlighted-accent-card" : "")}>
                <div className="flex items-center justify-between mb-4">
                  <span className={cn("text-[9px] font-black uppercase tracking-widest", idx === 0 ? "accent-label" : stat.labelColor)}>{stat.label}</span>
                  <stat.icon className={cn("w-4 h-4 opacity-75", idx === 0 ? "accent-label" : stat.labelColor)} />
                </div>
                <div>
                  <h3 className={cn("text-xl font-black tracking-tight", idx === 0 ? "accent-value" : "text-white")}>{stat.value}</h3>
                  <div className="flex items-center gap-1 mt-1 text-[8px] font-bold text-[#8FB0AC]">
                    <span className="w-1 h-1 rounded-full bg-emerald-400 animate-ping inline-block" />
                    <span className={idx === 0 ? "accent-sub" : ""}>LIVE UPDATE</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Detailed Sales & Credit Control Panel (HUD Mode) */}
          <div className="bg-[#111625] border border-[#163B3A] rounded-3xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#163B3A]/60 pb-3">
              <div className="space-y-1">
                <span className="text-[9px] font-black tracking-widest text-[#8FB0AC] uppercase bg-[#14332F] border border-[#1C4340] px-2 py-0.5 rounded">
                  Relatório Analítico Consolidado
                </span>
                <h4 className="text-md font-black text-white flex items-center gap-2">
                  <span>Detalhamento Executivo de Canais (Wholesale, Retail, Cash & Dívidas)</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping inline-block" />
                </h4>
              </div>
              <p className="text-[10px] text-[#8FB0AC] font-semibold italic text-right">Dados em tempo real ({currency})</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              {/* Box 1: Retail Sales */}
              <div className="p-4 rounded-2xl bg-[#090D1A] border border-sky-500/20 shadow-inner space-y-3 highlighted-accent-card">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-sky-400 uppercase tracking-wider accent-label">🛍️ Vendas a Retalho</span>
                  <span className="text-[8px] bg-sky-500/10 text-sky-400 px-1.5 py-0.2 rounded font-mono font-bold accent-sub">RETAIL</span>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px] border-b border-white/[0.04] pb-1">
                    <span className="text-[#8FB0AC] accent-sub">Semanal:</span>
                    <span className="font-bold text-white accent-value">{(metrics.retailWeekly || 0).toLocaleString()} {currency}</span>
                  </div>
                  <div className="flex justify-between text-[11px] border-b border-white/[0.04] pb-1">
                    <span className="text-[#8FB0AC] accent-sub">Mensal:</span>
                    <span className="font-bold text-white accent-value">{(metrics.retailMonthly || 0).toLocaleString()} {currency}</span>
                  </div>
                  <div className="flex justify-between text-[11px] pt-0.5">
                    <span className="text-[#8FB0AC] font-semibold accent-label">Acumulado:</span>
                    <span className="font-extrabold text-sky-305 accent-value">{(metrics.retailSales || 0).toLocaleString()} {currency}</span>
                  </div>
                </div>
              </div>

              {/* Box 2: Wholesale Sales */}
              <div className="p-4 rounded-2xl bg-[#090D1A] border border-amber-500/20 shadow-inner space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-amber-400 uppercase tracking-wider">📦 Vendas por Grosso</span>
                  <span className="text-[8px] bg-amber-500/10 text-amber-400 px-1.5 py-0.2 rounded font-mono font-bold">WHOLESALE</span>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px] border-b border-white/[0.04] pb-1">
                    <span className="text-[#8FB0AC]">Semanal:</span>
                    <span className="font-bold text-white">{(metrics.wholesaleWeekly || 0).toLocaleString()} {currency}</span>
                  </div>
                  <div className="flex justify-between text-[11px] border-b border-white/[0.04] pb-1">
                    <span className="text-[#8FB0AC]">Mensal:</span>
                    <span className="font-bold text-white">{(metrics.wholesaleMonthly || 0).toLocaleString()} {currency}</span>
                  </div>
                  <div className="flex justify-between text-[11px] pt-0.5">
                    <span className="text-[#8FB0AC] font-semibold">Acumulado:</span>
                    <span className="font-extrabold text-amber-300">{(metrics.wholesaleSales || 0).toLocaleString()} {currency}</span>
                  </div>
                </div>
              </div>

              {/* Box 3: Cash Sales */}
              <div className="p-4 rounded-2xl bg-[#090D1A] border border-emerald-500/20 shadow-inner space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-emerald-400 uppercase tracking-wider">💵 Vendas a Dinheiro</span>
                  <span className="text-[8px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.2 rounded font-mono font-bold">CASH FLOW</span>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px] border-b border-white/[0.04] pb-1">
                    <span className="text-[#8FB0AC]">Semanal:</span>
                    <span className="font-bold text-white">{(metrics.cashWeekly || 0).toLocaleString()} {currency}</span>
                  </div>
                  <div className="flex justify-between text-[11px] border-b border-white/[0.04] pb-1">
                    <span className="text-[#8FB0AC]">Mensal:</span>
                    <span className="font-bold text-white">{(metrics.cashMonthly || 0).toLocaleString()} {currency}</span>
                  </div>
                  <div className="flex justify-between text-[11px] pt-0.5">
                    <span className="text-[#8FB0AC] font-semibold">Acumulado:</span>
                    <span className="font-extrabold text-emerald-300">{(metrics.cashSales || 0).toLocaleString()} {currency}</span>
                  </div>
                </div>
              </div>

              {/* Box 4: Debts / Credit Sales */}
              <div className="p-4 rounded-2xl bg-[#090D1A] border border-rose-500/20 shadow-inner space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-rose-400 uppercase tracking-wider">⚠️ Crédito & Dívidas</span>
                  <span className="text-[8px] bg-rose-500/10 text-rose-400 px-1.5 py-0.2 rounded font-mono font-bold">DEBTS</span>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px] border-b border-white/[0.04] pb-1">
                    <span className="text-[#8FB0AC]">Semanal Conc:</span>
                    <span className="font-bold text-white">{(metrics.creditWeekly || 0).toLocaleString()} {currency}</span>
                  </div>
                  <div className="flex justify-between text-[11px] border-b border-white/[0.04] pb-1">
                    <span className="text-[#8FB0AC]">Mensal Conc:</span>
                    <span className="font-bold text-white">{(metrics.creditMonthly || 0).toLocaleString()} {currency}</span>
                  </div>
                  <div className="flex justify-between text-[11px] pt-0.5">
                    <span className="text-[#8FB0AC] font-semibold">Dívida Activa Geral:</span>
                    <span className="font-extrabold text-rose-400 font-mono">{(metrics.outstanding || 0).toLocaleString()} {currency}</span>
                  </div>
                </div>
              </div>

              {/* Box 5: Operating Expenses */}
              <div className="p-4 rounded-2xl bg-[#090D1A] border border-fuchsia-500/20 shadow-inner space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-fuchsia-400 uppercase tracking-wider">🧾 Despesas Operacionais</span>
                  <span className="text-[8px] bg-fuchsia-500/10 text-fuchsia-400 px-1.5 py-0.2 rounded font-mono font-bold">EXPENSES</span>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px] border-b border-white/[0.04] pb-1">
                    <span className="text-[#8FB0AC]">Semanal:</span>
                    <span className="font-bold text-white">{(metrics.expensesWeekly || 0).toLocaleString()} {currency}</span>
                  </div>
                  <div className="flex justify-between text-[11px] border-b border-white/[0.04] pb-1">
                    <span className="text-[#8FB0AC]">Mensal:</span>
                    <span className="font-bold text-white">{(metrics.expensesMonthly || 0).toLocaleString()} {currency}</span>
                  </div>
                  <div className="flex justify-between text-[11px] pt-0.5">
                    <span className="text-[#8FB0AC] font-semibold">Acumulado Total:</span>
                    <span className="font-extrabold text-fuchsia-300 font-mono">{(metrics.expensesTotal || 0).toLocaleString()} {currency}</span>
                  </div>
                </div>
              </div>

              {/* Box 6: Operating Profit */}
              <div className="p-4 rounded-2xl bg-[#090D1A] border border-teal-500/20 shadow-inner space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-teal-400 uppercase tracking-wider">📈 Lucro Estimado</span>
                  <span className="text-[8px] bg-teal-500/10 text-teal-400 px-1.5 py-0.2 rounded font-mono font-bold">NET INCOME</span>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px] border-b border-white/[0.04] pb-1">
                    <span className="text-[#8FB0AC]">Semanal:</span>
                    <span className={cn("font-bold", metrics.profitWeekly >= 0 ? "text-emerald-400" : "text-rose-400")}>
                      {(metrics.profitWeekly || 0).toLocaleString()} {currency}
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px] border-b border-white/[0.04] pb-1">
                    <span className="text-[#8FB0AC]">Mensal:</span>
                    <span className={cn("font-bold", metrics.profitMonthly >= 0 ? "text-emerald-400" : "text-rose-400")}>
                      {(metrics.profitMonthly || 0).toLocaleString()} {currency}
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px] pt-0.5">
                    <span className="text-[#8FB0AC] font-semibold">Lucro Acumulado:</span>
                    <span className={cn("font-extrabold font-mono", metrics.profitTotal >= 0 ? "text-teal-300" : "text-rose-300")}>
                      {(metrics.profitTotal || 0).toLocaleString()} {currency}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-7">
            {/* AI Advisor Panel */}
            <div className="md:col-span-7 bg-[#081F1E] border border-[#163B3A] rounded-3xl p-6 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 blur-3xl rounded-full" />
              <AIAdvisor />
            </div>

            {/* Analytics with dark mode theme */}
            <div className="md:col-span-4 space-y-6">
              <div className="p-6 bg-[#081F1E] border border-[#163B3A] rounded-3xl shadow-xl">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-black text-white pl-3 border-l-3 border-blue-500">
                    Growth Analytics
                  </h3>
                  <span className="text-[9px] font-black bg-[#10302E] text-[#8FB0AC] px-2 py-0.5 rounded border border-[#1C4340] uppercase tracking-widest font-mono">
                    8-WEEK ROLLING TREND
                  </span>
                </div>
                
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <LineChart data={weeklySalesTrends}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1C2541" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#8FB0AC', fontSize: 11 }} />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#8FB0AC', fontSize: 11 }} 
                        tickFormatter={(val) => val >= 1000 ? `${(val / 1000).toLocaleString()}k` : val}
                      />
                      <Tooltip 
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const pointData = payload[0].payload;
                            return (
                              <div className="bg-[#090D1A] border border-[#163B3A] p-3 rounded-xl shadow-xl text-white">
                                <p className="text-[10px] font-black tracking-wider text-blue-400 uppercase">{pointData.period}</p>
                                <p className="text-sm font-black mt-1 font-mono">
                                  {Number(pointData.sales).toLocaleString()} {currency}
                                </p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="sales" 
                        stroke="#3b82f6" 
                        strokeWidth={3} 
                        dot={{ r: 4, stroke: '#3b82f6', strokeWidth: 1.5, fill: '#081F1E' }} 
                        activeDot={{ r: 6, stroke: '#3b82f6', strokeWidth: 2, fill: '#081F1E' }} 
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Cash Flow Insights (Dark HUD Mode) */}
              <div className="p-6 bg-[#081F1E] border border-[#163B3A] rounded-3xl shadow-xl space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black tracking-widest text-[#8FB0AC] uppercase">Análise de Liquidez</span>
                    <h3 className="text-lg font-black text-white pl-3 border-l-3 border-[#10b981]">
                      Fluxo de Caixa (30 dias)
                    </h3>
                  </div>
                  <span className="text-[9px] font-black bg-blue-500/10 text-blue-400 px-2.5 py-1 rounded border border-blue-500/20 uppercase tracking-widest font-mono shrink-0">
                    LIVE HUD
                  </span>
                </div>

                {/* Sub Metrics Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-2xl bg-[#0F2B29] border border-emerald-500/10 flex flex-col justify-between highlighted-accent-card">
                    <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest accent-label">Total Entradas</span>
                    <div className="mt-2">
                      <span className="text-lg font-black text-white font-mono accent-value">
                        {(cashFlowStats.totalIncoming).toLocaleString()} {currency}
                      </span>
                      <p className="text-[8px] text-slate-500 uppercase tracking-wider mt-1 accent-sub">Inflow (Últimos 30 Dias)</p>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-[#0F2B29] border border-rose-500/10 flex flex-col justify-between">
                    <span className="text-[9px] font-black text-rose-400 uppercase tracking-widest">Total Saídas</span>
                    <div className="mt-2">
                      <span className="text-lg font-black text-white font-mono">
                        {(cashFlowStats.totalOutgoing).toLocaleString()} {currency}
                      </span>
                      <p className="text-[8px] text-slate-500 uppercase tracking-wider mt-1">Outflow (Últimos 30 Dias)</p>
                    </div>
                  </div>

                  <div className={`p-4 rounded-2xl bg-[#0F2B29] border flex flex-col justify-between ${cashFlowStats.netCashFlow >= 0 ? 'border-emerald-500/20' : 'border-rose-500/20'}`}>
                    <span className="text-[9px] font-black text-[#8FB0AC] uppercase tracking-widest">Saldo Líquido</span>
                    <div className="mt-2">
                      <span className={`text-lg font-black font-mono ${cashFlowStats.netCashFlow >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {(cashFlowStats.netCashFlow).toLocaleString()} {currency}
                      </span>
                      <p className="text-[8px] text-slate-500 uppercase tracking-wider mt-1">Net Cash Flow Balance</p>
                    </div>
                  </div>
                </div>

                {/* Cash Flow Chart */}
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <AreaChart data={monthlyCashFlowData}>
                      <defs>
                        <linearGradient id="colorHudIn" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorHudOut" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1C2541" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#8FB0AC', fontSize: 10 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#8FB0AC', fontSize: 10 }} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#090D1A', border: '1px solid #163B3A', borderRadius: '12px', color: '#fff' }}
                        itemStyle={{ color: '#fff' }}
                      />
                      <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px', color: '#8FB0AC' }} />
                      <Area type="monotone" dataKey="Entradas (In)" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorHudIn)" />
                      <Area type="monotone" dataKey="Saídas (Out)" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#colorHudOut)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Transactions in HUD mode */}
              <div className="p-6 bg-[#081F1E] border border-[#163B3A] rounded-3xl shadow-xl">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-black text-white pl-3 border-l-3 border-blue-500">
                    Live Ledger Log
                  </h3>
                  <button 
                    onClick={() => {
                      (window as any).setCurrentTab('reports');
                      setIsFullScreen(false);
                    }}
                    className="text-xs font-black text-blue-400 uppercase tracking-widest hover:underline flex items-center gap-1"
                  >
                    View Ledger <ChevronRight size={14} />
                  </button>
                </div>

                <div className="space-y-3.5">
                  {recentSales.map((sale) => (
                    <div key={sale.id} className="flex items-center gap-4 p-4 rounded-2xl bg-[#0F2B29] hover:bg-[#14332F] border border-[#163B3A]/40 transition-all group">
                      <div className="w-10 h-10 rounded-xl bg-[#090D1A] flex items-center justify-center font-black text-[#8FB0AC] group-hover:scale-110 transition-transform">
                        {sale.customerId?.[0]?.toUpperCase() || 'W'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-black text-white truncate">
                            {sale.customerId === 'Walk-in' ? 'Walk-in Sale' : (sale.customerName || `Invoice ${sale.invoiceNumber}`)}
                          </p>
                          <span className={cn(
                            "text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full",
                            sale.status === 'paid' ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"
                          )}>
                            {sale.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[9px] text-[#8FB0AC] font-bold uppercase tracking-widest flex-wrap">
                          <History size={10} />
                          {new Date(sale.createdAt?.toDate?.() || sale.createdAt).toLocaleDateString()}
                          <span>|</span>
                          <span>{sale.paymentMethod || 'Unknown'}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-black text-white">
                          {(sale.total || 0).toLocaleString()} {currency}
                        </div>
                      </div>
                    </div>
                  ))}
                  {recentSales.length === 0 && (
                    <div className="py-10 text-center space-y-3">
                      <ShoppingCart size={40} className="mx-auto text-[#163B3A]" />
                      <p className="text-xs font-bold text-[#8FB0AC] uppercase tracking-widest">No recent transactions</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Sidebar Column within HUD */}
            <div className="md:col-span-3 space-y-6">
              <div className="bg-[#081F1E] border border-[#163B3A] rounded-3xl overflow-hidden shadow-xl">
                <MarketRates />
              </div>

              {/* Action grid (Quick operations) */}
              <div className="p-6 bg-[#081F1E] border border-[#163B3A] rounded-3xl shadow-xl">
                <h3 className="text-base font-black text-white mb-4">Operations Control</h3>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => { (window as any).toggleStorefront(true); }}
                    className="p-4 bg-[#0F2B29] hover:bg-indigo-600/25 border border-[#163B3A] text-indigo-400 hover:text-white rounded-2xl font-bold text-xs hover:scale-105 transition-all flex flex-col items-center gap-2 cursor-pointer"
                  >
                    <ShoppingBag size={20} />
                    Online Store
                  </button>
                  <button 
                    onClick={() => { (window as any).setCurrentTab('pos'); setIsFullScreen(false); }}
                    className="p-4 bg-[#0F2B29] hover:bg-emerald-600/25 border border-[#163B3A] text-emerald-400 hover:text-white rounded-2xl font-bold text-xs hover:scale-105 transition-all flex flex-col items-center gap-2 cursor-pointer"
                  >
                    <ShoppingCart size={20} />
                    POS Billing
                  </button>
                  <button 
                    onClick={() => { (window as any).setCurrentTab('quotations'); setIsFullScreen(false); }}
                    className="p-4 bg-[#0F2B29] hover:bg-blue-600/25 border border-[#163B3A] text-blue-400 hover:text-white rounded-2xl font-bold text-xs hover:scale-105 transition-all flex flex-col items-center gap-2 cursor-pointer"
                  >
                    <FileSearch size={20} />
                    New Quote
                  </button>
                  <button 
                    onClick={() => { (window as any).setCurrentTab('expenses'); setIsFullScreen(false); }}
                    className="p-4 bg-[#0F2B29] hover:bg-rose-600/25 border border-[#163B3A] text-rose-400 hover:text-white rounded-2xl font-bold text-xs hover:scale-105 transition-all flex flex-col items-center gap-2 cursor-pointer"
                  >
                    <TrendingDown size={20} />
                    Log Expense
                  </button>
                </div>
              </div>

              {/* Stock Health */}
              <div className="p-6 bg-[#081F1E] border border-[#163B3A] rounded-3xl shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-black text-white">{t('inventory_status')}</h3>
                  <span className="text-[9px] font-semibold text-[#8FB0AC]">HEALTH INDEX</span>
                </div>
                <div className="space-y-4">
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-[#8FB0AC]">Em Stock / Healthy</span>
                      <span className="font-extrabold text-emerald-400 font-mono">{metrics.inStockCount}</span>
                    </div>
                    <div className="w-full bg-[#10302E] h-2 rounded-full overflow-hidden">
                      <div className="bg-emerald-500 h-full transition-all duration-500" style={{ width: `${(metrics.inStockCount / (metrics.totalProducts || 1)) * 100}%` }} />
                    </div>
                  </div>
                  
                  <div className="space-y-1 pt-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-[#8FB0AC]">Stock Baixo / Critical</span>
                      <span className="font-extrabold text-amber-500 font-mono">{metrics.lowStockCount}</span>
                    </div>
                    <div className="w-full bg-[#10302E] h-2 rounded-full overflow-hidden">
                      <div className="bg-amber-500 h-full transition-all duration-500" style={{ width: `${(metrics.lowStockCount / (metrics.totalProducts || 1)) * 100}%` }} />
                    </div>
                  </div>

                  <div className="space-y-1 pt-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-[#8FB0AC]">Sem Stock / Out</span>
                      <span className="font-extrabold text-rose-500 font-mono">{metrics.outOfStockCount}</span>
                    </div>
                    <div className="w-full bg-[#10302E] h-2 rounded-full overflow-hidden">
                      <div className="bg-rose-500 h-full transition-all duration-500" style={{ width: `${(metrics.outOfStockCount / (metrics.totalProducts || 1)) * 100}%` }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Gross Profit Margin (HUD edition) */}
              <div className="p-6 bg-[#081F1E] border border-[#163B3A] rounded-3xl shadow-xl space-y-4 animate-in fade-in duration-300">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-black text-white">Gross Profit Margin %</h3>
                  <span className="text-[9px] font-semibold text-[#8FB0AC]">CATEGORY METRICS</span>
                </div>

                <div className="p-4 bg-[#0F2B29] border border-[#163B3A]/60 rounded-2xl flex items-center justify-between">
                  <div>
                    <p className="text-[9px] font-black text-[#8FB0AC] uppercase tracking-widest leading-none">Overall Weighted GM</p>
                    <p className="text-xl font-black text-white mt-1.5 font-mono">
                      {overallMargin.toFixed(1)}%
                    </p>
                  </div>
                  <div className="w-9 h-9 rounded-xl bg-orange-500/10 flex items-center justify-center font-black text-orange-400">
                    %
                  </div>
                </div>

                <div className="space-y-3.5 pt-1">
                  {marginStatsByCategory.slice(0, 4).map((cat, idx) => {
                    let textClass = "text-rose-400";
                    let barColor = "bg-rose-500";
                    
                    if (cat.margin >= 45) {
                      textClass = "text-[#A3E635]";
                      barColor = "bg-[#A3E635]";
                    } else if (cat.margin >= 25) {
                      textClass = "text-amber-400";
                      barColor = "bg-amber-500";
                    }

                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex items-center justify-between text-xs font-bold">
                          <span className="text-[#8FB0AC] truncate max-w-[130px]" title={cat.name}>{cat.name}</span>
                          <span className={`${textClass} font-mono text-[11px]`}>{cat.margin}%</span>
                        </div>
                        <div className="w-full bg-[#10302E] h-1.5 rounded-full overflow-hidden">
                          <div className={`${barColor} h-full transition-all duration-500`} style={{ width: `${cat.margin}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

          </div>

        </div>

      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-350 select-none pb-12">
      
      {/* Brand New Welcome Banner - Requisito 4 */}
      {showWelcomeBanner && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-[24px] p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-sm animate-in fade-in duration-300">
          <div className="flex items-start gap-3">
            <span className="text-2xl mt-0.5 select-none font-sans">👋</span>
            <div>
              <h4 className="font-bold text-slate-800 text-sm">Bem-vindo ao Sabush System ERP!</h4>
              <p className="text-xs text-slate-500 mt-0.5">Complete o seu perfil para uma melhor experiência.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDismissBannerPermanently}
              className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all cursor-pointer shadow-sm"
            >
              Agora Não
            </button>
            <button
              type="button"
              onClick={handleGoToProfile}
              className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all cursor-pointer shadow-sm shadow-blue-500/10"
            >
              Completar Perfil
            </button>
          </div>
        </div>
      )}

      {/* 1. WELCOME HERO CARDS ROW */}
      <div className="pos-root relative overflow-hidden bg-gradient-to-br from-amber-500 via-orange-600 to-orange-700 text-white p-6 md:p-8 rounded-[32px] shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-6 border border-orange-500/20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.15),transparent_60%)] pointer-events-none" />
        
        <div className="space-y-2 relative">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black tracking-widest text-amber-100 uppercase bg-white/10 px-2.5 py-1 rounded-full border border-white/20">
              SISTEMA ATIVO
            </span>
            {isOnline ? (
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-100 bg-white/10 px-2.5 py-1 rounded-full border border-white/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-ping" />
                ONLINE (REAL-TIME-DB)
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-amber-100 bg-white/10 px-2.5 py-1 rounded-full border border-white/20 animate-pulse">
                OFFLINE (CACHE LOCAL)
              </span>
            )}
          </div>
          <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight">
            Bem-vindo, {profile?.displayName || profile?.name || 'Administrador'}! 👋
          </h2>
          <p className="text-orange-100 text-xs font-semibold flex items-center gap-1.5 pt-0.5">
            <Clock size={13} className="text-orange-200" />
            {new Date(referenceToday).toLocaleDateString('pt-PT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsFilterOpen(!isFilterOpen)}
          className={cn(
            "relative px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2.5 transition-all outline-none cursor-pointer border whitespace-nowrap shadow-md",
            isFilterOpen 
              ? "bg-white border-white text-orange-700 shadow-orange-500/15" 
              : "bg-white/10 hover:bg-white/15 border-white/20 text-white"
          )}
        >
          <Clock size={14} />
          <span>Filtrar Período</span>
          <ChevronDown size={14} className={cn("transition-transform duration-200", isFilterOpen ? "rotate-180" : "")} />
        </button>
      </div>

      {/* 2. COLLAPSIBLE DATE FILTER CONTROL PANEL */}
      <AnimatePresence>
        {isFilterOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-white border border-slate-100 rounded-[28px] p-5 shadow-sm space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Intervalo de Datas</h4>
                  <p className="text-[11px] text-slate-400 font-medium">Refina os canais de venda e gráficos em tempo real.</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    { label: 'Últimos 7 dias', days: 7 },
                    { label: 'Últimos 30 dias', days: 30 },
                    { label: 'Últimos 3 meses', months: 3 },
                    { label: 'Este Ano', yearStart: true },
                    { label: 'Todo Período', allTime: true }
                  ].map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        const start = new Date(referenceToday);
                        if (preset.days) start.setDate(start.getDate() - preset.days);
                        else if (preset.months) start.setMonth(start.getMonth() - preset.months);
                        else if (preset.yearStart) start.setMonth(0, 1);
                        else if (preset.allTime) start.setFullYear(2020, 0, 1);
                        
                        setStartDateStr(start.toISOString().split('T')[0]);
                        setEndDateStr(new Date(referenceToday).toISOString().split('T')[0]);
                      }}
                      className="text-[10px] font-extrabold text-slate-600 hover:text-blue-600 hover:bg-blue-50/50 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl transition-all cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-4 pt-4 border-t border-slate-50">
                <div className="w-full sm:w-auto flex items-center gap-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest shrink-0">Início:</span>
                  <input
                    type="date"
                    value={startDateStr}
                    onChange={(e) => setStartDateStr(e.target.value)}
                    className="w-full sm:w-auto text-xs font-bold font-mono text-slate-700 bg-slate-50 hover:bg-slate-100 focus:bg-white border border-slate-200 px-3.5 py-2 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all font-semibold"
                  />
                </div>
                <div className="w-full sm:w-auto flex items-center gap-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest shrink-0">Fim:</span>
                  <input
                    type="date"
                    value={endDateStr}
                    onChange={(e) => setEndDateStr(e.target.value)}
                    className="w-full sm:w-auto text-xs font-bold font-mono text-slate-700 bg-slate-50 hover:bg-slate-100 focus:bg-white border border-slate-200 px-3.5 py-2 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all font-semibold"
                  />
                </div>
                
                <div className="sm:ml-auto flex items-center gap-2 text-xs font-bold text-slate-500 py-1 sm:py-0">
                  <span className="text-[10px] text-slate-400 font-extrabold uppercase">Ativo:</span>
                  <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-lg text-[10px] font-mono font-black border border-blue-105">
                    {new Date(startDateStr).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })} — {new Date(endDateStr).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. THREE GRADIENT KPI CARDS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pos-root">
        
        {/* Card 1: Vendas a Retalho */}
        <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white rounded-[28px] p-6 shadow-md border border-white/5">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-8 -mt-8 pointer-events-none blur-xl" />
          <div className="flex justify-between items-center mb-4 relative z-10">
            <span className="text-[10px] font-black text-blue-200 uppercase tracking-widest opacity-100">
              🛍️ Vendas a Retalho
            </span>
            <span className="text-[9px] font-extrabold bg-white/10 text-white border border-white/15 px-2.5 py-0.5 rounded-lg uppercase tracking-wider">
              Retalho
            </span>
          </div>
          
          <div className="space-y-1 relative z-10">
            <p className="text-2xl md:text-3xl font-black tracking-tight text-white">
              {filteredChartAndMetricData.metrics.retail.toLocaleString()} <span className="text-sm font-medium text-blue-200">{currency}</span>
            </p>
            
            {/* Trend percentage comparative */}
            <div className="flex items-center gap-1 text-[11px] font-extrabold text-blue-100 mt-1">
              {channelTrends.retail >= 0 ? (
                <ArrowUpRight size={13} className="text-blue-100 shrink-0" />
              ) : (
                <ArrowDownRight size={13} className="text-blue-100 shrink-0" />
              )}
              <span className="text-blue-100">
                {channelTrends.retail >= 0 ? "+" : ""}{channelTrends.retail}%
              </span>
              <span className="text-blue-100">vs mês anterior</span>
            </div>
          </div>

          {/* Sparkline micro path */}
          <div className="h-10 mt-6 relative z-10 overflow-hidden rounded-lg bg-blue-900/20 p-1 border border-white/5">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparklineData} margin={{ top: 2, bottom: 2, left: 2, right: 2 }}>
                <Line type="monotone" dataKey="retail" stroke="#FFFFFF" strokeWidth={1.8} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Card 2: Vendas por Grosso */}
        <div className="relative overflow-hidden bg-gradient-to-br from-[#0A3038] via-[#0F5C56] to-[#178F82] text-white rounded-[28px] p-6 shadow-md border border-white/5">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-8 -mt-8 pointer-events-none blur-xl" />
          <div className="flex justify-between items-center mb-4 relative z-10">
            <span className="text-[10px] font-black text-blue-100 uppercase tracking-widest opacity-100">
              📦 Vendas por Grosso
            </span>
            <span className="text-[9px] font-extrabold bg-white/10 text-white border border-white/15 px-2.5 py-0.5 rounded-lg uppercase tracking-wider">
              Grosso
            </span>
          </div>
          
          <div className="space-y-1 relative z-10">
            <p className="text-2xl md:text-3xl font-black tracking-tight text-white">
              {filteredChartAndMetricData.metrics.wholesale.toLocaleString()} <span className="text-sm font-medium text-white/80">{currency}</span>
            </p>
            
            <div className="flex items-center gap-1 text-[11px] font-extrabold text-white/90 mt-1">
              {channelTrends.wholesale >= 0 ? (
                <ArrowUpRight size={13} className="text-white shrink-0" />
              ) : (
                <ArrowDownRight size={13} className="text-white shrink-0" />
              )}
              <span className="text-white/90">
                {channelTrends.wholesale >= 0 ? "+" : ""}{channelTrends.wholesale}%
              </span>
              <span className="text-white/80">vs mês anterior</span>
            </div>
          </div>

          <div className="h-10 mt-6 relative z-10 overflow-hidden rounded-lg bg-blue-900/20 p-1 border border-white/5">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparklineData} margin={{ top: 2, bottom: 2, left: 2, right: 2 }}>
                <Line type="monotone" dataKey="wholesale" stroke="#FFFFFF" strokeWidth={1.8} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Card 3: Vendas a Dinheiro */}
        <div className="relative overflow-hidden bg-gradient-to-br from-amber-500 via-amber-600 to-yellow-600 text-white rounded-[28px] p-6 shadow-md border border-white/5">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-8 -mt-8 pointer-events-none blur-xl" />
          <div className="flex justify-between items-center mb-4 relative z-10">
            <span className="text-[10px] font-black text-amber-100 uppercase tracking-widest opacity-100">
              💵 Vendas a Dinheiro
            </span>
            <span className="text-[9px] font-extrabold bg-white/10 text-white border border-white/15 px-2.5 py-0.5 rounded-lg uppercase tracking-wider">
              DINHEIRO
            </span>
          </div>
          
          <div className="space-y-1 relative z-10">
            <p className="text-2xl md:text-3xl font-black tracking-tight text-white">
              {filteredChartAndMetricData.metrics.cashSales.toLocaleString()} <span className="text-sm font-medium text-amber-100">{currency}</span>
            </p>
            
            <div className="flex items-center gap-1 text-[11px] font-extrabold text-amber-100 mt-1">
              {channelTrends.cash >= 0 ? (
                <ArrowUpRight size={13} className="text-amber-100 shrink-0" />
              ) : (
                <ArrowDownRight size={13} className="text-amber-100 shrink-0" />
              )}
              <span className="text-amber-100">
                {channelTrends.cash >= 0 ? "+" : ""}{channelTrends.cash}%
              </span>
              <span className="text-amber-100">vs mês anterior</span>
            </div>
          </div>

          <div className="h-10 mt-6 relative z-10 overflow-hidden rounded-lg bg-amber-900/20 p-1 border border-white/5">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparklineData} margin={{ top: 2, bottom: 2, left: 2, right: 2 }}>
                <Line type="monotone" dataKey="cash" stroke="#FFFFFF" strokeWidth={1.8} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* 4. QUICK ACTIONS BUTTONS ROW */}
      <div className="space-y-2">
        <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Menu de Atalhos Rápidos</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: 'Nova Fatura', icon: ReceiptText, tab: 'invoices', color: 'text-cyan-600 bg-cyan-50 hover:bg-cyan-100/70 border-cyan-100/80' },
            { label: 'Registar Pagamento', icon: DollarSign, tab: 'payments', color: 'text-amber-600 bg-amber-50 hover:bg-amber-100/70 border-amber-100/80' },
            { label: 'Nova Encomenda', icon: ShoppingCart, tab: 'online_orders', color: 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100/70 border-emerald-100/80' },
            { label: 'Adicionar Despesa', icon: CreditCard, tab: 'expenses', color: 'text-rose-600 bg-rose-50 hover:bg-rose-100/70 border-rose-100/80' },
            { label: 'Novo Cliente', icon: Users, tab: 'customers', color: 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100/70 border-indigo-100/80' },
            { label: 'Novo Fornecedor', icon: Truck, tab: 'suppliers', color: 'text-fuchsia-600 bg-fuchsia-50 hover:bg-fuchsia-100/70 border-fuchsia-100/80' },
            { label: 'Relatório Vendas', icon: TrendingUp, tab: 'reports', color: 'text-purple-600 bg-purple-50 hover:bg-purple-100/70 border-purple-100/80' },
          ].map((action, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentTab?.(action.tab)}
              className={cn(
                "flex flex-col items-center justify-center p-3.5 rounded-2xl border transition-all text-[11px] font-black uppercase tracking-wider cursor-pointer text-center gap-2.5 hover:-translate-y-0.5 shortcut-btn",
                action.color
              )}
            >
              <action.icon size={18} className="shrink-0" />
              <span className="leading-tight">{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 5. MAIN CHARTS GRID ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* 12 Months Bar Chart (Takes 2 Columns) */}
        <div className="lg:col-span-2 bg-white rounded-[28px] border border-slate-100 p-6 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-md font-black text-slate-805 tracking-tight">
                Vendas {vendasChartToggle === 'mensal' ? 'nos últimos 12 meses' : 'no Período Selecionado'}
              </h3>
              <p className="text-[11px] text-slate-400 font-medium">Histórico dinâmico faturado em Meticais (MZN)</p>
            </div>

            {/* Toggle Switch */}
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setVendasChartToggle('mensal')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all cursor-pointer",
                  vendasChartToggle === 'mensal' ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
                )}
              >
                Mensal (12m)
              </button>
              <button
                type="button"
                onClick={() => setVendasChartToggle('diario')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all cursor-pointer",
                  vendasChartToggle === 'diario' ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
                )}
              >
                Período Diário
              </button>
            </div>
          </div>

          <div className="h-[280px] w-full select-none">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={vendasChartToggle === 'mensal' ? twelveMonthSalesTrend : filteredChartAndMetricData.chartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                <XAxis dataKey="name" fontSize={9} fontStyle="bold" stroke="#94a3b8" />
                <YAxis fontSize={9} fontStyle="bold" stroke="#94a3b8" />
                <Tooltip 
                  formatter={(val) => [`${Number(val).toLocaleString()} MZN`, "Vendas"]} 
                  contentStyle={{ backgroundColor: "#0F172A", color: "#FFF", borderRadius: "12px", border: "none", fontSize: "11px" }}
                />
                <Bar dataKey={vendasChartToggle === 'mensal' ? 'vendas' : 'sales'} fill="#3B82F6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Donut Chart: Vendas por Canal (1 Column) */}
        <div className="bg-white rounded-[28px] border border-slate-105 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-md font-black text-slate-805 tracking-tight">Vendas por Canal</h3>
            <p className="text-[11px] text-slate-400 font-medium">Distribuição por Retalho, Grosso e Dinheiro</p>
          </div>

          <div className="h-44 relative my-2 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: 'Retalho', value: filteredChartAndMetricData.metrics.retail, color: '#3B82F6' },
                    { name: 'Grosso', value: filteredChartAndMetricData.metrics.wholesale, color: '#8B5CF6' },
                    { name: 'A Dinheiro', value: filteredChartAndMetricData.metrics.cashSales, color: '#F59E0B' },
                  ]}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={70}
                  paddingAngle={4}
                  dataKey="value"
                >
                  <Cell fill="#3B82F6" />
                  <Cell fill="#8B5CF6" />
                  <Cell fill="#F59E0B" />
                </Pie>
                <Tooltip formatter={(value) => `${Number(value).toLocaleString()} MZN`} />
              </PieChart>
            </ResponsiveContainer>
            
            {/* Center metric inside donut */}
            <div className="absolute text-center leading-none mt-1">
              <span className="text-[10px] font-semibold text-slate-400 block uppercase tracking-wider">Total</span>
              <span className="text-md font-black text-slate-850 block mt-1">
                {(filteredChartAndMetricData.metrics.retail + filteredChartAndMetricData.metrics.wholesale + filteredChartAndMetricData.metrics.cashSales).toLocaleString()}
              </span>
            </div>
          </div>

          {/* Simple custom side-legend with totals & percentages */}
          <div className="space-y-1.5 pt-2 border-t border-slate-50">
            {[
              { label: 'Vendas Retalho', val: filteredChartAndMetricData.metrics.retail, color: 'bg-blue-500' },
              { label: 'Vendas Grosso', val: filteredChartAndMetricData.metrics.wholesale, color: 'bg-purple-500' },
              { label: 'Vendas Dinheiro', val: filteredChartAndMetricData.metrics.cashSales, color: 'bg-amber-500' },
            ].map((canal, idx) => {
              const totalSum = filteredChartAndMetricData.metrics.retail + filteredChartAndMetricData.metrics.wholesale + filteredChartAndMetricData.metrics.cashSales;
              const pct = totalSum > 0 ? Math.round((canal.val / totalSum) * 105) / 1.05 : 0;
              return (
                <div key={idx} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-slate-500 font-bold">
                    <span className={cn("w-2 h-2 rounded-full", canal.color)} />
                    <span className="truncate max-w-[110px] uppercase text-[9px] tracking-wider">{canal.label}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-extrabold text-slate-800 text-[11px]">{canal.val.toLocaleString()} {currency}</span>
                    <span className="text-[9px] text-slate-400 font-bold ml-1.5 font-mono">{pct.toFixed(0)}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* 6. BOTTOM KPI ROW */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* KPI 1: Total de Clientes */}
        <div className="bg-white rounded-[24px] border border-slate-100 p-5 shadow-sm hover:shadow-md transition-all flex items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[10px] font-black text-slate-400 block uppercase tracking-wider leading-none">Total de Clientes</span>
            <span className="text-xl font-black text-slate-800 block">{metrics.customersCount}</span>
            <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-500">
              <ArrowUpRight size={12} />
              <span>+4.2% este mês</span>
            </div>
          </div>
          <div className="p-3 bg-lime-50 rounded-2xl text-lime-605 shrink-0 border border-lime-100">
            <Users size={18} />
          </div>
        </div>

        {/* KPI 2: Faturas em Aberto */}
        <div className="bg-white rounded-[24px] border border-slate-100 p-5 shadow-sm hover:shadow-md transition-all flex items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[10px] font-black text-slate-400 block uppercase tracking-wider leading-none">Faturas em Aberto</span>
            <span className="text-xl font-black text-slate-800 block">
              {allInvoices.filter(inv => inv.status === 'unpaid' || inv.status === 'partially_paid').length}
            </span>
            <div className="flex items-center gap-1 text-[10px] font-bold text-blue-500">
              <Clock size={12} />
              <span>Contas ativas pendentes</span>
            </div>
          </div>
          <div className="p-3 bg-cyan-50 rounded-2xl text-cyan-600 shrink-0 border border-cyan-100">
            <ReceiptText size={18} />
          </div>
        </div>

        {/* KPI 3: Dívidas em Aberto (MZN) */}
        <div className="bg-white rounded-[24px] border border-slate-100 p-5 shadow-sm hover:shadow-md transition-all flex items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[10px] font-black text-slate-400 block uppercase tracking-wider leading-none">Dívidas em Aberto</span>
            <span className="text-xl font-black text-slate-800 block truncate max-w-[130px]">{metrics.outstanding.toLocaleString()} <span className="text-xs font-semibold">{currency}</span></span>
            <div className="flex items-center gap-1 text-[10px] font-bold text-rose-500">
              <AlertCircle size={12} />
              <span>{metrics.overdueCount} Faturas vencidas</span>
            </div>
          </div>
          <div className="p-3 bg-rose-50 rounded-2xl text-rose-600 shrink-0 border border-rose-100">
            <AlertCircle size={18} />
          </div>
        </div>

        {/* KPI 4: Despesas do Mês (MZN) */}
        <div className="bg-white rounded-[24px] border border-slate-100 p-5 shadow-sm hover:shadow-md transition-all flex items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[10px] font-black text-slate-400 block uppercase tracking-wider leading-none">Despesas do Mês</span>
            <span className="text-xl font-black text-slate-805 block truncate max-w-[130px]">{metrics.expensesMonthly.toLocaleString()} <span className="text-xs font-semibold">{currency}</span></span>
            <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-500">
              <TrendingDown size={12} />
              <span>Controlo de custo</span>
            </div>
          </div>
          <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-650 shrink-0 border border-indigo-100">
            <CreditCard size={18} />
          </div>
        </div>

      </div>

      {/* 7. COLLAPSIBLE ADVANCED ERP CONSOLE SECTION */}
      <div className="bg-white rounded-[24px] border border-slate-100 overflow-hidden shadow-sm">
        <button
          type="button"
          onClick={() => setIsClassicErpExpanded(!isClassicErpExpanded)}
          className="w-full flex items-center justify-between p-6 cursor-pointer text-left bg-slate-50 hover:bg-slate-100 transition-colors select-none"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 text-blue-600 rounded-xl">
              <SettingsIcon size={20} className={cn("transition-transform duration-500", isClassicErpExpanded && "rotate-90")} />
            </div>
            <div>
              <h3 className="text-md font-black text-slate-800 tracking-tight">Consola de Gestão Avançada ERP</h3>
              <p className="text-xs text-slate-400 font-semibold">Aceder a metas de vendas, relatórios dinâmicos e registos do sistema</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              {isClassicErpExpanded ? 'Recolher Painel' : 'Expandir Painel'}
            </span>
            <ChevronDown size={18} className={cn("text-slate-400 transition-transform duration-300", isClassicErpExpanded && "rotate-180")} />
          </div>
        </button>

        {isClassicErpExpanded && (
          <div className="p-6 border-t border-slate-100 animate-in fade-in duration-300 space-y-8 bg-white">
      <div 
        id="sales-target-card" 
        draggable
        onDragStart={(e) => handleWidgetDragStart(e, 'sales_target')}
        onDragOver={(e) => handleWidgetDragOver(e, 'sales_target')}
        onDragEnd={handleWidgetDragEnd}
        style={{ order: widgetOrder.indexOf('sales_target') }}
        className={cn(
          "relative group/widget bg-white border border-slate-150 rounded-[32px] p-6 shadow-sm space-y-5 transition-all duration-350",
          draggedWidgetId === 'sales_target' ? "opacity-30 border-2 border-dashed border-blue-400 bg-blue-50/10 scale-98 shadow-inner" : ""
        )}
      >
        {/* Reorder Controls */}
        <div className="absolute top-5 right-5 z-20 flex items-center gap-1 opacity-0 group-hover/widget:opacity-100 transition-opacity bg-slate-900 border border-slate-800 text-white px-2.5 py-1.5 rounded-xl text-[10px] font-bold shadow-lg text-left">
          <button 
            type="button" 
            onClick={(e) => { e.stopPropagation(); moveWidget('sales_target', 'up'); }}
            className={cn("hover:text-blue-400 p-0.5 rounded transition-colors cursor-pointer", widgetOrder.indexOf('sales_target') === 0 && "opacity-30 cursor-not-allowed")}
            disabled={widgetOrder.indexOf('sales_target') === 0}
            title="Mover para cima"
          >
            <ChevronUp size={13} />
          </button>
          <button 
            type="button" 
            onClick={(e) => { e.stopPropagation(); moveWidget('sales_target', 'down'); }}
            className={cn("hover:text-blue-400 p-0.5 rounded transition-colors cursor-pointer", widgetOrder.indexOf('sales_target') === widgetOrder.length - 1 && "opacity-30 cursor-not-allowed")}
            disabled={widgetOrder.indexOf('sales_target') === widgetOrder.length - 1}
            title="Mover para baixo"
          >
            <ChevronDown size={13} />
          </button>
          <div className="flex items-center gap-1 pl-1 border-l border-white/10 cursor-grab active:cursor-grabbing self-stretch" title="Arrastar para reordenar">
            <GripVertical size={13} className="text-slate-400 pointer-events-none" />
            <span className="hidden sm:inline text-slate-350">Reordenar</span>
          </div>
        </div>

        <div 
          onClick={() => setIsTargetExpanded(!isTargetExpanded)}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4 cursor-pointer hover:opacity-85 select-none transition-opacity"
        >
          <div className="flex-1 text-left">
            <h3 className="text-lg font-black text-slate-900 border-l-4 border-emerald-600 pl-4 tracking-tight flex items-center gap-2">
              <span className="flex items-center gap-1.5">
                <Target size={18} className="text-emerald-600" /> Meta de Vendas Mensal
              </span>
              {isTargetExpanded ? (
                <ChevronUp size={16} className="text-slate-400 shrink-0" />
              ) : (
                <ChevronDown size={16} className="text-slate-400 shrink-0" />
              )}
            </h3>
            <p className="text-xs text-slate-500 font-medium pl-4 mt-0.5">
              Defina objetivos de facturação mensais e monitorize em tempo real o progresso. {!isTargetExpanded && <span className="text-emerald-600 font-bold ml-1">Clique para expandir details</span>}
            </p>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setTempSalesTarget((businessData?.monthlySalesTarget || 120000).toString());
              setIsEditingTarget(true);
            }}
            className="text-xs px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-all cursor-pointer border border-slate-150 relative self-start sm:self-center pr-12 sm:pr-3.5"
          >
            ⚙️ Ajustar Meta
          </button>
        </div>

        {isTargetExpanded ? (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center animate-in fade-in duration-300">
            {/* Circular dial gauge indicator */}
            <div className="md:col-span-5 flex flex-col items-center justify-center p-3 relative bg-slate-50 rounded-2xl border border-slate-100/60 shadow-inner">
              <div className="relative w-40 h-40 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="80"
                    cy="80"
                    r="64"
                    className="stroke-slate-200 fill-none"
                    strokeWidth="12"
                  />
                  <circle
                    cx="80"
                    cy="80"
                    r="64"
                    className={cn(
                      "fill-none transition-all duration-1000 ease-out",
                      Math.min(100, Math.round(((metrics.monthlyRevenue || 0) / (businessData?.monthlySalesTarget || 120000)) * 100)) >= 100 ? "stroke-emerald-500" :
                      Math.min(100, Math.round(((metrics.monthlyRevenue || 0) / (businessData?.monthlySalesTarget || 120000)) * 100)) >= 75  ? "stroke-blue-500" :
                      Math.min(100, Math.round(((metrics.monthlyRevenue || 0) / (businessData?.monthlySalesTarget || 120000)) * 100)) >= 50  ? "stroke-indigo-500" :
                      "stroke-amber-500"
                    )}
                    strokeWidth="12"
                    strokeDasharray={402}
                    strokeDashoffset={402 - (402 * Math.min(100, Math.round(((metrics.monthlyRevenue || 0) / (businessData?.monthlySalesTarget || 120000)) * 100))) / 100}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute text-center">
                  <p className={cn(
                    "text-3xl font-black font-mono tracking-tight",
                    Math.min(100, Math.round(((metrics.monthlyRevenue || 0) / (businessData?.monthlySalesTarget || 120000)) * 100)) >= 100 ? "text-emerald-600" : "text-slate-900"
                  )}>
                    {Math.min(100, Math.round(((metrics.monthlyRevenue || 0) / (businessData?.monthlySalesTarget || 120000)) * 100))}%
                  </p>
                  <p className="text-[10px] uppercase font-black tracking-widest text-slate-400">Progresso</p>
                </div>
              </div>
            </div>

            {/* KPI metrics and text motivator */}
            <div className="md:col-span-7 space-y-4 text-left">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                  <span className="text-[9px] uppercase font-black text-slate-400 tracking-wider">Facturado (30 Dias)</span>
                  <p className="text-xl font-black text-slate-900 font-mono mt-0.5">
                    {(metrics.monthlyRevenue || 0).toLocaleString()} {currency}
                  </p>
                </div>
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                  <span className="text-[9px] uppercase font-black text-slate-400 tracking-wider">Objetivo</span>
                  <p className="text-xl font-black text-emerald-600 font-mono mt-0.5">
                    {(businessData?.monthlySalesTarget || 120000).toLocaleString()} {currency}
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-indigo-50/40 border border-indigo-100 text-slate-700 text-xs text-left">
                <div className="flex items-start gap-2.5">
                  <span className="text-lg leading-none shrink-0">📈</span>
                  <div className="space-y-1">
                    <p className="font-bold text-slate-800 uppercase tracking-wide text-[10px]">ANÁLISE DE RITMO</p>
                    <p className="font-medium text-slate-650 leading-relaxed font-sans">
                      {Math.min(100, Math.round(((metrics.monthlyRevenue || 0) / (businessData?.monthlySalesTarget || 120000)) * 100)) >= 100 ? (
                        <span className="text-emerald-700 font-bold">✨ Parabéns! O objetivo de vendas do mês foi superado com sucesso!</span>
                      ) : (
                        <span>
                          Faltam <b className="text-indigo-650 font-mono">{(Math.max(0, (businessData?.monthlySalesTarget || 120000) - (metrics.monthlyRevenue || 0))).toLocaleString()} {currency}</b> para atingir a meta.
                          {Math.min(100, Math.round(((metrics.monthlyRevenue || 0) / (businessData?.monthlySalesTarget || 120000)) * 100)) >= 75 ? " Estamos perto! Envie orçamentos adicionais aos clientes de maior prestígio." :
                           Math.min(100, Math.round(((metrics.monthlyRevenue || 0) / (businessData?.monthlySalesTarget || 120000)) * 100)) >= 50 ? " Passámos da metade. Bom esforço de equipa." :
                           " Ritmo inicial. Aumente as acções de marketing para dinamizar as vendas."}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div 
            onClick={() => setIsTargetExpanded(true)}
            className="space-y-3 cursor-pointer pt-2 animate-in fade-in duration-200 text-left"
          >
            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
              <div className="flex items-center gap-2">
                <span className="text-sm font-black font-sans text-slate-900">
                  {Math.min(100, Math.round(((metrics.monthlyRevenue || 0) / (businessData?.monthlySalesTarget || 120000)) * 100))}% Concluído
                </span>
                <span className="text-slate-400">
                  ({(metrics.monthlyRevenue || 0).toLocaleString()} de {(businessData?.monthlySalesTarget || 120000).toLocaleString()} {currency})
                </span>
              </div>
              <span className="text-[10px] text-emerald-600 font-black">PROGRESSO MENSAL</span>
            </div>
            
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-150">
              <div 
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  Math.min(100, Math.round(((metrics.monthlyRevenue || 0) / (businessData?.monthlySalesTarget || 120000)) * 100)) >= 100 ? "bg-emerald-500 animate-pulse" :
                  Math.min(100, Math.round(((metrics.monthlyRevenue || 0) / (businessData?.monthlySalesTarget || 120000)) * 100)) >= 75  ? "bg-blue-500" :
                  "bg-indigo-500"
                )}
                style={{ width: `${Math.min(100, Math.round(((metrics.monthlyRevenue || 0) / (businessData?.monthlySalesTarget || 120000)) * 100))}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Sales Target Editing Modal */}
      {isEditingTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white border rounded-[32px] p-6 max-w-sm w-full shadow-2xl space-y-4">
            <div className="space-y-1 text-left">
              <h4 className="text-md font-black text-slate-900 uppercase tracking-tight flex items-center gap-1.5">
                <Target size={18} className="text-emerald-600" /> Ajustar Meta Mensal
              </h4>
              <p className="text-xs text-slate-500">Defina a sua estimativa ou objetivo mensal em {currency} para cálculo de progresso.</p>
            </div>

            <div className="space-y-1.5 text-left">
              <label className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">Valor da Nova Meta ({currency})</label>
              <input
                type="number"
                value={tempSalesTarget}
                onChange={(e) => setTempSalesTarget(e.target.value)}
                placeholder="Ex: 120000"
                className="w-full text-base font-bold font-mono px-4 py-3 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsEditingTarget(false)}
                className="px-4 py-2 border rounded-xl font-bold text-xs uppercase tracking-wider text-slate-500 hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => saveSalesTarget(Number(tempSalesTarget) || 0)}
                disabled={isSavingTarget}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer active:scale-95 shadow-md disabled:opacity-50"
              >
                {isSavingTarget ? 'A guardar...' : 'Guardar Alteração'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6-Month Sales Trend Interactive Chart Widget */}
      <div 
        id="sales-chart-6m-section"
        draggable
        onDragStart={(e) => handleWidgetDragStart(e, 'sales_chart_6m')}
        onDragOver={(e) => handleWidgetDragOver(e, 'sales_chart_6m')}
        onDragEnd={handleWidgetDragEnd}
        style={{ order: widgetOrder.indexOf('sales_chart_6m') }}
        className={cn(
          "relative group/widget p-6 bg-white rounded-3xl border border-slate-150 shadow-sm space-y-4 transition-all duration-350",
          draggedWidgetId === 'sales_chart_6m' ? "opacity-30 border-2 border-dashed border-blue-400 bg-blue-50/10 scale-98 shadow-inner" : ""
        )}
      >
        {/* Reorder Controls */}
        <div className="absolute top-5 right-5 z-20 flex items-center gap-1 opacity-0 group-hover/widget:opacity-100 transition-opacity bg-slate-900 border border-slate-800 text-white px-2.5 py-1.5 rounded-xl text-[10px] font-bold shadow-lg">
          <button 
            type="button" 
            onClick={(e) => { e.stopPropagation(); moveWidget('sales_chart_6m', 'up'); }}
            className={cn("hover:text-blue-400 p-0.5 rounded transition-colors cursor-pointer", widgetOrder.indexOf('sales_chart_6m') === 0 && "opacity-30 cursor-not-allowed")}
            disabled={widgetOrder.indexOf('sales_chart_6m') === 0}
            title="Mover para cima"
          >
            <ChevronUp size={13} />
          </button>
          <button 
            type="button" 
            onClick={(e) => { e.stopPropagation(); moveWidget('sales_chart_6m', 'down'); }}
            className={cn("hover:text-blue-400 p-0.5 rounded transition-colors cursor-pointer", widgetOrder.indexOf('sales_chart_6m') === widgetOrder.length - 1 && "opacity-30 cursor-not-allowed")}
            disabled={widgetOrder.indexOf('sales_chart_6m') === widgetOrder.length - 1}
            title="Mover para baixo"
          >
            <ChevronDown size={13} />
          </button>
          <div className="flex items-center gap-1 pl-1 border-l border-white/10 cursor-grab active:cursor-grabbing self-stretch" title="Arrastar para reordenar">
            <GripVertical size={13} className="text-slate-400 pointer-events-none" />
            <span className="hidden sm:inline text-slate-350">Reordenar</span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h4 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider font-sans flex items-center gap-2">
              <span className="w-1.5 h-3 bg-blue-600 rounded-sm" />
              Histórico de Vendas (Últimos 6 Meses)
            </h4>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed font-semibold">
              Evolução mensal consolidada das receitas totais e volume de faturas transacionadas. Passe o cursor sobre o gráfico para ver os detalhes.
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-bold text-slate-500 bg-slate-50 p-2 rounded-xl border border-slate-100 pr-32 md:pr-4">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-blue-600 block shadow-sm shadow-blue-500/20" />
              <span>Vendas ({currency})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-indigo-400 block shadow-sm shadow-indigo-400/20" />
              <span>Volume de Faturas</span>
            </div>
          </div>
        </div>

        <div className="h-64 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sixMonthSalesTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorVendas6m" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#178F82" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#178F82" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorFaturas6m" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#818cf8" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis 
                dataKey="name" 
                stroke="#94a3b8" 
                fontSize={10} 
                fontWeight={700}
                tickLine={false} 
                axisLine={false}
              />
              <YAxis 
                yAxisId="left"
                stroke="#94a3b8" 
                fontSize={10} 
                fontWeight={700}
                tickLine={false} 
                axisLine={false}
                tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
              />
              <YAxis 
                yAxisId="right"
                orientation="right"
                stroke="#94a3b8" 
                fontSize={10} 
                fontWeight={700}
                tickLine={false} 
                axisLine={false}
                tickFormatter={(val) => `${val}`}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1e293b', 
                  borderRadius: '16px', 
                  border: 'none',
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                  padding: '12px'
                }}
                labelStyle={{ color: '#f8fafc', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', marginBottom: '4px' }}
                itemStyle={{ fontSize: '12px', padding: '2px 0' }}
                formatter={(value: any, name: string) => {
                  if (name === "vendas") return [`${Number(value).toLocaleString()} ${currency}`, "Total Vendas"];
                  if (name === "faturas") return [`${value} faturas`, "Volume Registado"];
                  return [value, name];
                }}
              />
              <Area 
                yAxisId="left"
                type="monotone" 
                dataKey="vendas" 
                name="vendas"
                stroke="#178F82" 
                strokeWidth={3} 
                fillOpacity={1} 
                fill="url(#colorVendas6m)" 
              />
              <Area 
                yAxisId="right"
                type="monotone" 
                dataKey="faturas" 
                name="faturas"
                stroke="#818cf8" 
                strokeWidth={2} 
                fillOpacity={1} 
                fill="url(#colorFaturas6m)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 7-Day Invoicing Trend Interactive Chart Widget */}
      <div 
        id="sales-chart-7d-section"
        draggable
        onDragStart={(e) => handleWidgetDragStart(e, 'sales_chart_7d')}
        onDragOver={(e) => handleWidgetDragOver(e, 'sales_chart_7d')}
        onDragEnd={handleWidgetDragEnd}
        style={{ order: widgetOrder.indexOf('sales_chart_7d') }}
        className={cn(
          "relative group/widget p-6 bg-white rounded-3xl border border-slate-150 shadow-sm space-y-4 transition-all duration-350",
          draggedWidgetId === 'sales_chart_7d' ? "opacity-30 border-2 border-dashed border-blue-400 bg-blue-50/10 scale-98 shadow-inner" : ""
        )}
      >
        {/* Reorder Controls */}
        <div className="absolute top-5 right-5 z-20 flex items-center gap-1 opacity-0 group-hover/widget:opacity-100 transition-opacity bg-slate-900 border border-slate-800 text-white px-2.5 py-1.5 rounded-xl text-[10px] font-bold shadow-lg">
          <button 
            type="button" 
            onClick={(e) => { e.stopPropagation(); moveWidget('sales_chart_7d', 'up'); }}
            className={cn("hover:text-blue-400 p-0.5 rounded transition-colors cursor-pointer", widgetOrder.indexOf('sales_chart_7d') === 0 && "opacity-30 cursor-not-allowed")}
            disabled={widgetOrder.indexOf('sales_chart_7d') === 0}
            title="Mover para cima"
          >
            <ChevronUp size={13} />
          </button>
          <button 
            type="button" 
            onClick={(e) => { e.stopPropagation(); moveWidget('sales_chart_7d', 'down'); }}
            className={cn("hover:text-blue-400 p-0.5 rounded transition-colors cursor-pointer", widgetOrder.indexOf('sales_chart_7d') === widgetOrder.length - 1 && "opacity-30 cursor-not-allowed")}
            disabled={widgetOrder.indexOf('sales_chart_7d') === widgetOrder.length - 1}
            title="Mover para baixo"
          >
            <ChevronDown size={13} />
          </button>
          <div className="flex items-center gap-1 pl-1 border-l border-white/10 cursor-grab active:cursor-grabbing self-stretch" title="Arrastar para reordenar">
            <GripVertical size={13} className="text-slate-400 pointer-events-none" />
            <span className="hidden sm:inline text-slate-350">Reordenar</span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h4 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider font-sans flex items-center gap-2">
              <span className="w-1.5 h-3 bg-indigo-600 rounded-sm" />
              Evolução Diária da Faturação (Últimos 7 Dias)
            </h4>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed font-semibold">
              Volume financeiro faturado dia-a-dia e faturas registadas. Passe o cursor para analisar os coeficientes diários.
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-bold text-slate-500 bg-slate-50 p-2 rounded-xl border border-slate-100 pr-32 md:pr-4">
            <div className="flex items-center gap-1.5">
              <span 
                className="w-2.5 h-2.5 rounded block shadow-sm"
                style={{ 
                  backgroundColor: schemaColors[chartSchema]?.primary || '#178F82',
                  boxShadow: `0 2px 4px ${schemaColors[chartSchema]?.glow || 'rgba(37, 99, 235, 0.2)'}`
                }}
              />
              <span>Faturado ({currency})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span 
                className="w-2.5 h-2.5 rounded block shadow-sm"
                style={{ 
                  backgroundColor: schemaColors[chartSchema]?.secondary || '#10b981',
                  boxShadow: `0 2px 4px ${schemaColors[chartSchema]?.glow || 'rgba(16, 185, 129, 0.2)'}`
                }}
              />
              <span>Faturas Emitidas</span>
            </div>
          </div>
        </div>

        <div className="h-64 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={last7DaysInvoicingTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorFaturacao7d" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={schemaColors[chartSchema]?.primary || '#178F82'} stopOpacity={0.25}/>
                  <stop offset="95%" stopColor={schemaColors[chartSchema]?.primary || '#178F82'} stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorCount7d" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={schemaColors[chartSchema]?.secondary || '#10b981'} stopOpacity={0.15}/>
                  <stop offset="95%" stopColor={schemaColors[chartSchema]?.secondary || '#10b981'} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis 
                dataKey="name" 
                stroke="#94a3b8" 
                fontSize={10} 
                fontWeight={700}
                tickLine={false} 
                axisLine={false}
              />
              <YAxis 
                yAxisId="left"
                stroke="#94a3b8" 
                fontSize={10} 
                fontWeight={700}
                tickLine={false} 
                axisLine={false}
                tickFormatter={(val) => val >= 1000 ? `${(val / 1000).toFixed(0)}k` : `${val}`}
              />
              <YAxis 
                yAxisId="right"
                orientation="right"
                stroke="#94a3b8" 
                fontSize={10} 
                fontWeight={700}
                tickLine={false} 
                axisLine={false}
                tickFormatter={(val) => `${val}`}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1e293b', 
                  borderRadius: '16px', 
                  border: 'none',
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                  padding: '12px'
                }}
                labelStyle={{ color: '#f8fafc', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', marginBottom: '4px' }}
                itemStyle={{ fontSize: '12px', padding: '2px 0' }}
                formatter={(value: any, name: string) => {
                  if (name === "faturacao") return [`${Number(value).toLocaleString()} ${currency}`, "Volume Faturado"];
                  if (name === "faturasCount") return [`${value} faturas`, "Faturas Emitidas"];
                  if (name === "avgTicket") return [`${Number(value).toLocaleString()} ${currency}`, "Ticket Médio"];
                  return [value, name];
                }}
              />
              <Area 
                yAxisId="left"
                type="monotone" 
                dataKey="faturacao" 
                name="faturacao"
                stroke={schemaColors[chartSchema]?.primary || '#178F82'} 
                strokeWidth={3} 
                fillOpacity={1} 
                fill="url(#colorFaturacao7d)" 
              />
              <Area 
                yAxisId="right"
                type="monotone" 
                dataKey="faturasCount" 
                name="faturasCount"
                stroke={schemaColors[chartSchema]?.secondary || '#10b981'} 
                strokeWidth={2} 
                fillOpacity={1} 
                fill="url(#colorCount7d)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* SECTOR STATS GRID */}
      <div
        id="stats-grid-section"
        draggable
        onDragStart={(e) => handleWidgetDragStart(e, 'stats_grid')}
        onDragOver={(e) => handleWidgetDragOver(e, 'stats_grid')}
        onDragEnd={handleWidgetDragEnd}
        style={{ order: widgetOrder.indexOf('stats_grid') }}
        className={cn(
          "relative group/widget transition-all duration-350 p-2 sm:p-4 bg-white rounded-[32px] border border-slate-100 shadow-sm",
          draggedWidgetId === 'stats_grid' ? "opacity-30 border-2 border-dashed border-blue-400 bg-blue-50/10 scale-98 shadow-inner" : ""
        )}
      >
        {/* Reorder Controls */}
        <div className="absolute top-4 right-4 z-20 flex items-center gap-1 opacity-0 group-hover/widget:opacity-100 transition-opacity bg-slate-900 border border-slate-800 text-white px-2.5 py-1.5 rounded-xl text-[10px] font-bold shadow-lg">
          <button 
            type="button" 
            onClick={(e) => { e.stopPropagation(); moveWidget('stats_grid', 'up'); }}
            className={cn("hover:text-blue-400 p-0.5 rounded transition-colors cursor-pointer", widgetOrder.indexOf('stats_grid') === 0 && "opacity-30 cursor-not-allowed")}
            disabled={widgetOrder.indexOf('stats_grid') === 0}
            title="Mover para cima"
          >
            <ChevronUp size={13} />
          </button>
          <button 
            type="button" 
            onClick={(e) => { e.stopPropagation(); moveWidget('stats_grid', 'down'); }}
            className={cn("hover:text-blue-400 p-0.5 rounded transition-colors cursor-pointer", widgetOrder.indexOf('stats_grid') === widgetOrder.length - 1 && "opacity-30 cursor-not-allowed")}
            disabled={widgetOrder.indexOf('stats_grid') === widgetOrder.length - 1}
            title="Mover para baixo"
          >
            <ChevronDown size={13} />
          </button>
          <div className="flex items-center gap-1 pl-1 border-l border-white/10 cursor-grab active:cursor-grabbing self-stretch" title="Arrastar para reordenar">
            <GripVertical size={13} className="text-slate-400 pointer-events-none" />
            <span className="hidden sm:inline text-slate-350">Reordenar</span>
          </div>
        </div>

        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6 pt-4">
          {stats.map((stat) => (
            <div key={stat.label} className="p-4 sm:p-5 bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-md hover:-translate-y-1 hover:border-slate-200 transition-all relative overflow-hidden group">
              <div className="absolute top-0 left-0 right-0 h-1 bg-slate-100 group-hover:bg-blue-600/50 transition-colors" />
              <div className="flex items-center justify-between mb-4">
                <div className={cn("p-2 rounded-xl bg-slate-50", stat.color)}>
                  <stat.icon size={18} />
                </div>
              </div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest truncate">{stat.label}</p>
              <h3 className="text-lg sm:text-xl font-black text-slate-900 truncate mt-1">{stat.value}</h3>
              <p className={cn("text-[10px] font-black mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-50", stat.trend === 'up' ? "text-emerald-600" : "text-rose-600")}>
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                {stat.change}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Detailed Channel Sales & Outstanding Debts Control Panel (Regular View) */}
      <div 
        id="channels-and-debts-section"
        draggable
        onDragStart={(e) => handleWidgetDragStart(e, 'channels_and_debts')}
        onDragOver={(e) => handleWidgetDragOver(e, 'channels_and_debts')}
        onDragEnd={handleWidgetDragEnd}
        style={{ order: widgetOrder.indexOf('channels_and_debts') }}
        className={cn(
          "relative group/widget bg-white border border-slate-100 rounded-[32px] p-6 shadow-sm space-y-5 animate-in fade-in duration-350 transition-all duration-350",
          draggedWidgetId === 'channels_and_debts' ? "opacity-30 border-2 border-dashed border-blue-400 bg-blue-50/10 scale-98 shadow-inner" : ""
        )}
      >
        {/* Reorder Controls */}
        <div className="absolute top-5 right-5 z-20 flex items-center gap-1 opacity-0 group-hover/widget:opacity-100 transition-opacity bg-slate-900 border border-slate-800 text-white px-2.5 py-1.5 rounded-xl text-[10px] font-bold shadow-lg">
          <button 
            type="button" 
            onClick={(e) => { e.stopPropagation(); moveWidget('channels_and_debts', 'up'); }}
            className={cn("hover:text-blue-400 p-0.5 rounded transition-colors cursor-pointer", widgetOrder.indexOf('channels_and_debts') === 0 && "opacity-30 cursor-not-allowed")}
            disabled={widgetOrder.indexOf('channels_and_debts') === 0}
            title="Mover para cima"
          >
            <ChevronUp size={13} />
          </button>
          <button 
            type="button" 
            onClick={(e) => { e.stopPropagation(); moveWidget('channels_and_debts', 'down'); }}
            className={cn("hover:text-blue-400 p-0.5 rounded transition-colors cursor-pointer", widgetOrder.indexOf('channels_and_debts') === widgetOrder.length - 1 && "opacity-30 cursor-not-allowed")}
            disabled={widgetOrder.indexOf('channels_and_debts') === widgetOrder.length - 1}
            title="Mover para baixo"
          >
            <ChevronDown size={13} />
          </button>
          <div className="flex items-center gap-1 pl-1 border-l border-white/10 cursor-grab active:cursor-grabbing self-stretch" title="Arrastar para reordenar">
            <GripVertical size={13} className="text-slate-400 pointer-events-none" />
            <span className="hidden sm:inline text-slate-350">Reordenar</span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-lg font-black text-slate-900 border-l-4 border-blue-650 pl-4 tracking-tight flex items-center gap-2">
              <span>Painel Executivo de Canais & Dívidas</span>
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse" />
            </h3>
            <p className="text-xs text-slate-500 font-medium pl-4 mt-0.5">
              Breakdown granular de faturamento (Semanal, Mensal, e Acumulado) consolidando Grosso, Retalho, Dinheiro e Dívidas.
            </p>
          </div>
          <span className="text-[10px] font-black text-slate-400 bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-xl uppercase tracking-widest font-mono">
            Relatórios e Auditoria
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          
          {/* Box 1: Retail Sales */}
          <div className="p-5 rounded-2xl bg-[#F0FDF4]/30 border border-emerald-100 flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-emerald-805 uppercase tracking-widest leading-none">🛍️ Vendas a Retalho</span>
              <span className="text-[9px] font-black bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-lg font-mono">RETAIL</span>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-xs border-b border-slate-105 pb-1.5">
                <span className="text-slate-500 font-medium">Esta Semana (7 d):</span>
                <span className="font-extrabold text-slate-800">{(metrics.retailWeekly || 0).toLocaleString()} {currency}</span>
              </div>
              <div className="flex justify-between text-xs border-b border-slate-105 pb-1.5">
                <span className="text-slate-500 font-medium">Este Mês (30 d):</span>
                <span className="font-extrabold text-slate-800">{(metrics.retailMonthly || 0).toLocaleString()} {currency}</span>
              </div>
              <div className="flex justify-between text-xs pt-1">
                <span className="text-slate-600 font-bold">Acumulado Total:</span>
                <span className="font-black text-emerald-705">{(metrics.retailSales || 0).toLocaleString()} {currency}</span>
              </div>
            </div>
          </div>

          {/* Box 2: Wholesale Sales */}
          <div className="p-5 rounded-2xl bg-[#FFFBEB]/40 border border-amber-100 flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-amber-805 uppercase tracking-widest leading-none">📦 Vendas por Grosso</span>
              <span className="text-[9px] font-black bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-lg font-mono">WHOLESALE</span>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-xs border-b border-slate-105 pb-1.5">
                <span className="text-slate-500 font-medium">Esta Semana (7 d):</span>
                <span className="font-extrabold text-slate-800">{(metrics.wholesaleWeekly || 0).toLocaleString()} {currency}</span>
              </div>
              <div className="flex justify-between text-xs border-b border-slate-105 pb-1.5">
                <span className="text-slate-500 font-medium">Este Mês (30 d):</span>
                <span className="font-extrabold text-slate-800">{(metrics.wholesaleMonthly || 0).toLocaleString()} {currency}</span>
              </div>
              <div className="flex justify-between text-xs pt-1">
                <span className="text-slate-600 font-bold">Acumulado Total:</span>
                <span className="font-black text-amber-705">{(metrics.wholesaleSales || 0).toLocaleString()} {currency}</span>
              </div>
            </div>
          </div>

          {/* Box 3: Cash Sales */}
          <div className="p-5 rounded-2xl bg-[#EFF6FF]/30 border border-blue-100 flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-blue-805 uppercase tracking-widest leading-none">💵 Vendas a Dinheiro</span>
              <span className="text-[9px] font-black bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-lg font-mono">CASH FLOW</span>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-xs border-b border-slate-105 pb-1.5">
                <span className="text-slate-500 font-medium">Esta Semana (7 d):</span>
                <span className="font-extrabold text-slate-800">{(metrics.cashWeekly || 0).toLocaleString()} {currency}</span>
              </div>
              <div className="flex justify-between text-xs border-b border-slate-105 pb-1.5">
                <span className="text-slate-500 font-medium">Este Mês (30 d):</span>
                <span className="font-extrabold text-slate-800">{(metrics.cashMonthly || 0).toLocaleString()} {currency}</span>
              </div>
              <div className="flex justify-between text-xs pt-1">
                <span className="text-slate-600 font-bold">Acumulado Total:</span>
                <span className="font-black text-blue-705">{(metrics.cashSales || 0).toLocaleString()} {currency}</span>
              </div>
            </div>
          </div>

          {/* Box 4: Credit / Debts */}
          <div className="p-5 rounded-2xl bg-[#FEF2F2]/40 border border-rose-100 flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-rose-805 uppercase tracking-widest leading-none">⚠️ Crédito & Dívidas Activas</span>
              <span className="text-[9px] font-black bg-rose-50 text-rose-700 border border-rose-100 px-2 py-0.5 rounded-lg font-mono">DEBTORS</span>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-xs border-b border-slate-105 pb-1.5">
                <span className="text-slate-500 font-medium">Novas Dívidas (7 d):</span>
                <span className="font-extrabold text-slate-800">{(metrics.creditWeekly || 0).toLocaleString()} {currency}</span>
              </div>
              <div className="flex justify-between text-xs border-b border-slate-105 pb-1.5">
                <span className="text-slate-500 font-medium">Novas Dívidas (30 d):</span>
                <span className="font-extrabold text-slate-800">{(metrics.creditMonthly || 0).toLocaleString()} {currency}</span>
              </div>
              <div className="flex justify-between text-xs pt-1">
                <span className="text-slate-600 font-bold">Dívida Activa Total:</span>
                <span className="font-bold text-rose-605 font-mono">{(metrics.outstanding || 0).toLocaleString()} {currency}</span>
              </div>
            </div>
          </div>

          {/* Box 5: Operating Expenses */}
          <div className="p-5 rounded-2xl bg-[#FDF4FF]/40 border border-fuchsia-100 flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-fuchsia-800 uppercase tracking-widest leading-none">🧾 Despesas Operacionais</span>
              <span className="text-[9px] font-black bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-100 px-2 py-0.5 rounded-lg font-mono">EXPENSES</span>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-xs border-b border-slate-105 pb-1.5">
                <span className="text-slate-500 font-medium">Esta Semana (7 d):</span>
                <span className="font-extrabold text-slate-800">{(metrics.expensesWeekly || 0).toLocaleString()} {currency}</span>
              </div>
              <div className="flex justify-between text-xs border-b border-slate-105 pb-1.5">
                <span className="text-slate-500 font-medium">Este Mês (30 d):</span>
                <span className="font-extrabold text-slate-800">{(metrics.expensesMonthly || 0).toLocaleString()} {currency}</span>
              </div>
              <div className="flex justify-between text-xs pt-1">
                <span className="text-slate-600 font-bold">Acumulado Total:</span>
                <span className="font-black text-fuchsia-700 font-mono">{(metrics.expensesTotal || 0).toLocaleString()} {currency}</span>
              </div>
            </div>
          </div>

          {/* Box 6: Estimated Profit */}
          <div className="p-5 rounded-2xl bg-[#F0FDFA]/40 border border-teal-100 flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-teal-800 uppercase tracking-widest leading-none">📈 Lucro Estimado</span>
              <span className="text-[9px] font-black bg-teal-50 text-teal-700 border border-teal-100 px-2 py-0.5 rounded-lg font-mono">NET INCOME</span>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-xs border-b border-slate-105 pb-1.5">
                <span className="text-slate-500 font-medium">Esta Semana (7 d):</span>
                <span className={cn("font-extrabold", metrics.profitWeekly >= 0 ? "text-emerald-600" : "text-rose-600")}>
                  {(metrics.profitWeekly || 0).toLocaleString()} {currency}
                </span>
              </div>
              <div className="flex justify-between text-xs border-b border-slate-105 pb-1.5">
                <span className="text-slate-500 font-medium">Este Mês (30 d):</span>
                <span className={cn("font-extrabold", metrics.profitMonthly >= 0 ? "text-emerald-600" : "text-rose-600")}>
                  {(metrics.profitMonthly || 0).toLocaleString()} {currency}
                </span>
              </div>
              <div className="flex justify-between text-xs pt-1">
                <span className="text-slate-600 font-bold">Lucro Acumulado:</span>
                <span className={cn("font-black", metrics.profitTotal >= 0 ? "text-teal-700" : "text-rose-600")}>
                  {(metrics.profitTotal || 0).toLocaleString()} {currency}
                </span>
              </div>
            </div>
          </div>

        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-7">
        <div className="md:col-span-4 space-y-6">
          <div className="p-6 bg-white rounded-[32px] border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-black text-slate-900 border-l-4 border-blue-600 pl-4">Transaction History</h3>
              <button 
                onClick={() => (window as any).setCurrentTab('reports')}
                className="text-xs font-black text-blue-600 uppercase tracking-widest hover:underline flex items-center gap-1"
              >
                View Full Ledger <ChevronRight size={14} />
              </button>
            </div>
            <div className="space-y-4">
              {recentSales.map((sale) => (
                <div key={sale.id} className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50/50 hover:bg-slate-50 transition-all group">
                  <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center font-black text-slate-400 group-hover:scale-110 transition-transform">
                    {sale.customerId?.[0]?.toUpperCase() || 'W'}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-0.5">
                       <p className="text-sm font-black text-slate-900 truncate">
                         {sale.customerId === 'Walk-in' ? 'Walk-in Sale' : (sale.customerName || `Invoice ${sale.invoiceNumber}`)}
                       </p>
                       <span className={cn(
                         "text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full",
                         sale.status === 'paid' ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                       )}>
                         {sale.status}
                       </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold uppercase tracking-widest flex-wrap">
                       <History size={10} />
                       {new Date(sale.createdAt?.toDate?.() || sale.createdAt).toLocaleDateString()}
                       <span className="text-slate-300">|</span>
                       <span className="text-slate-400">{sale.paymentMethod || 'Unknown'}</span>
                       {sale.createdByName && (
                         <>
                           <span className="text-slate-300">|</span>
                           <span className="text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-md font-semibold font-mono text-[9px] lowercase tracking-normal">by: {sale.createdByName}</span>
                         </>
                       )}
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    <div className="text-sm font-black text-slate-900">
                      {(sale.total || 0).toLocaleString()} {currency}
                    </div>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        copyPaymentLink(sale);
                      }}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-all"
                      title="Copy Payment Link"
                    >
                      <LinkIcon size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {recentSales.length === 0 && (
                <div className="py-10 text-center space-y-3">
                  <ShoppingCart size={40} className="mx-auto text-slate-200" />
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">No recent transactions</p>
                </div>
              )}
            </div>
          </div>

          {/* Inventory Status - Relocated to Left column to balance layout and eliminate empty space */}
          <div className="p-6 bg-white rounded-3xl border border-slate-100 shadow-sm">
            <h3 className="text-lg font-semibold mb-6">{t('inventory_status')}</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">In Stock</span>
                <span className="font-bold text-slate-900">{metrics.inStockCount}</span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-emerald-500 h-full transition-all duration-500" 
                  style={{ width: `${(metrics.inStockCount / (metrics.totalProducts || 1)) * 100}%` }} 
                />
              </div>
              
              <div className="flex justify-between items-center text-sm pt-2">
                <span className="text-slate-500">Low Stock</span>
                <span className="font-bold text-amber-600">{metrics.lowStockCount}</span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-amber-500 h-full transition-all duration-500" 
                  style={{ width: `${(metrics.lowStockCount / (metrics.totalProducts || 1)) * 100}%` }} 
                />
              </div>

              <div className="flex justify-between items-center text-sm pt-2">
                <span className="text-slate-500">Out of Stock</span>
                <span className="font-bold text-rose-600">{metrics.outOfStockCount}</span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-rose-500 h-full transition-all duration-500" 
                  style={{ width: `${(metrics.outOfStockCount / (metrics.totalProducts || 1)) * 100}%` }} 
                />
              </div>
            </div>
          </div>

          {/* Gross Profit Margin Tracker - Relocated to Left column to balance layout and eliminate empty space */}
          <div className="p-6 bg-white rounded-[32px] border border-slate-100 shadow-sm space-y-5 animate-in fade-in duration-300">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-md font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <span>Margem Bruta (COGS)</span>
                </h3>
                <span className="text-[9px] font-black uppercase tracking-widest text-[#0F4C3A] bg-[#0F4C3A]/10 px-2 py-0.5 rounded border border-[#0F4C3A]/20">
                  REAL-TIME GP
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">Margem bruta projetada por categorias de stock</p>
            </div>

            {/* Overall margin metric */}
            <div className="bg-[#FAF7F2] border border-[#EADCC6]/60 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Margem Média Geral</p>
                <p className="text-2xl font-black text-slate-900 mt-1">
                  {overallMargin.toFixed(1)}% <span className="text-xs font-medium text-slate-500">GPM</span>
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-[#0F4C3A]/10 flex items-center justify-center font-black text-[#0F4C3A]">
                %
              </div>
            </div>

            {/* Categories margin progress bars */}
            <div className="space-y-3 pt-1">
              {marginStatsByCategory.slice(0, 5).map((cat, idx) => {
                let badgeColor = "bg-rose-50 text-rose-600 border-rose-100";
                let barColor = "bg-rose-500";
                let ratingLabel = "Insuficiente";

                if (cat.margin >= 45) {
                  badgeColor = "bg-emerald-50 text-emerald-700 border-emerald-100";
                  barColor = "bg-[#0F4C3A]";
                  ratingLabel = "Excelente";
                } else if (cat.margin >= 25) {
                  badgeColor = "bg-amber-50 text-amber-700 border-amber-100";
                  barColor = "bg-amber-500";
                  ratingLabel = "Estável";
                }

                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-extrabold text-slate-800 tracking-tight truncate max-w-[120px]" title={cat.name}>
                        {cat.name}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`text-[8px] font-bold px-1.5 py-0.2 rounded border ${badgeColor}`}>
                          {cat.margin}% {ratingLabel}
                        </span>
                      </div>
                    </div>
                    {/* Tiny custom progress bar */}
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className={`${barColor} h-full transition-all duration-500`} 
                        style={{ width: `${cat.margin}%` }} 
                      />
                    </div>
                  </div>
                );
              })}
              {marginStatsByCategory.length === 0 && (
                <div className="text-center py-4 text-slate-400 text-xs">
                  Sem categorias de produtos registadas
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="md:col-span-3 space-y-6">
          <MarketRates />

          <div className="p-6 bg-white rounded-2xl border border-slate-100 shadow-sm">
            <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => (window as any).toggleStorefront(true)}
                className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl font-bold text-sm hover:bg-indigo-100 transition-all flex flex-col items-center gap-2"
              >
                <ShoppingBag size={20} />
                Online Store
              </button>
              <button 
                onClick={() => (window as any).setCurrentTab('pos')}
                className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl font-bold text-sm hover:bg-emerald-100 transition-all flex flex-col items-center gap-2"
              >
                <ShoppingCart size={20} />
                POS Billing
              </button>
              <button 
                onClick={() => (window as any).setCurrentTab('quotations')}
                className="p-4 bg-blue-50 text-blue-600 rounded-2xl font-bold text-sm hover:bg-blue-100 transition-all flex flex-col items-center gap-2"
              >
                <FileSearch size={20} />
                New Quote
              </button>
              <button 
                onClick={() => (window as any).setCurrentTab('suppliers')}
                className="p-4 bg-slate-50 text-slate-600 rounded-2xl font-bold text-sm hover:bg-slate-100 transition-all flex flex-col items-center gap-2"
              >
                <Truck size={20} />
                Add Vendor
              </button>
              <button 
                onClick={() => (window as any).setCurrentTab('expenses')}
                className="p-4 bg-rose-50 text-rose-600 rounded-2xl font-bold text-sm hover:bg-rose-100 transition-all flex flex-col items-center gap-2"
              >
                <TrendingDown size={20} />
                Log Expense
              </button>
            </div>
          </div>
        </div>
        </div>
        </div>
        )}
      </div>

      {/* Dynamic Interactive Chart Schema Console - Grand Full Width Layout at the bottom */}
      <ChartConsole 
        chartSchema={chartSchema}
        setChartSchema={setChartSchema}
        activeChartLayout={activeChartLayout}
        setActiveChartLayout={setActiveChartLayout}
        filteredChartAndMetricData={filteredChartAndMetricData}
        weeklySalesTrends={weeklySalesTrends}
        filteredCashFlowData={filteredCashFlowData}
        currency={currency}
        schemaColors={schemaColors}
      />

      {/* Absolute Bottom: AI Strategy Advisor - Majestic full width */}
      <AIAdvisor />

      {/* FOOTER */}
      <footer className="mt-12 py-6 border-t border-slate-100 text-center select-none">
        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest leading-none">
          © 2025 Sabush System ERP. Todos os direitos reservados. Feito com ❤️ para Moçambique
        </p>
      </footer>
    </div>
  );
}
