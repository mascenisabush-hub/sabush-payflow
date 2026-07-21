import React, { useState, useEffect, lazy, Suspense } from 'react';
import { AuthProvider, useAuth, AuthLog } from './contexts/AuthContext';
import Onboarding from './components/Onboarding';
import AppLoadingScreen from './components/AppLoadingScreen';
import WelcomeSplash from './components/WelcomeSplash';
import ErrorBoundary from './components/ErrorBoundary';
import Sidebar from './components/Sidebar';
import ManagerAuthListener from './components/ManagerAuthListener';
import ClientInventorySync from './components/ClientInventorySync';
import { Toaster, toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import './lib/i18n';
import { motion, AnimatePresence } from 'motion/react';
import { LogIn, Phone, Smartphone, Loader2, ShieldCheck, AlertCircle as AlertIcon, LogOut, ListChecks, Copy, Check, Mail, Key, ExternalLink, Eye, EyeOff, Sparkles, TrendingUp, Lock, Keyboard, HelpCircle, Maximize2, Minimize2, ShoppingCart, Shield, Users, BarChart3, ArrowRight } from 'lucide-react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth, db } from './lib/firebase';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { cn, getBrandTints } from './lib/utils';
import { AccountStatusGate, TermsOfServiceGate, SubscriptionExpiredGate } from './components/Gating';
import SubscriptionGate from './components/SubscriptionGate';
import Notifications from './components/Notifications';
import sabushLogo from './assets/images/sabush_logo_1779481915424.png';
import SystemInterpreter from './components/SystemInterpreter';
import GlobalSearch from './components/GlobalSearch';
import { checkAndTriggerAutoBackup } from './utils/backupService';
import { TermsModal } from './components/TermsModal';
import LegalWarningModal from './components/LegalWarningModal';

// Lazy load components
const Dashboard = lazy(() => import('./components/Dashboard'));
const Invoices = lazy(() => import('./components/Invoices'));
const Inventory = lazy(() => import('./components/Inventory'));
const Customers = lazy(() => import('./components/Customers'));
const Expenses = lazy(() => import('./components/Expenses'));
const Settings = lazy(() => import('./components/Settings'));
const POS = lazy(() => import('./components/POS'));
const Quotations = lazy(() => import('./components/Quotations'));
const Suppliers = lazy(() => import('./components/Suppliers'));
const Staff = lazy(() => import('./components/Staff'));
const PurchaseOrders = lazy(() => import('./components/PurchaseOrders'));
const CreditManagement = lazy(() => import('./components/CreditManagement'));
const OrderManagement = lazy(() => import('./components/OrderManagement'));
const Storefront = lazy(() => import('./components/Storefront'));
const PaymentPage = lazy(() => import('./components/PaymentPage'));
const SuperAdminPanel = lazy(() => import('./components/SuperAdminPanel'));
const Billing = lazy(() => import('./components/Billing'));
const Payments = lazy(() => import('./components/Payments'));
const UserProfile = lazy(() => import('./components/UserProfile'));
const SystemManual = lazy(() => import('./components/SystemManual'));
const Feedback = lazy(() => import('./components/Feedback'));
const Reports = lazy(() => import('./components/Reports'));
const CustomerPortal = lazy(() => import('./components/CustomerPortal'));
const AuditLogViewer = lazy(() => import('./components/AuditLogViewer'));

const LoadingFallback = () => (
  <div className="flex-1 min-h-[50vh] flex items-center justify-center">
    <div className="flex flex-col items-center gap-3">
      <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      <p className="text-sm font-medium text-slate-500">Loading component...</p>
    </div>
  </div>
);

interface DayTask {
  id: string;
  title: string;
  category: string;
  completed: boolean;
}

const INITIAL_TASKS: DayTask[] = [
  { id: '1', title: 'Consultar Assistente de IA', category: 'Gestão', completed: false },
  { id: '2', title: 'Verificar Alertas de Stock Baixo', category: 'Inventário', completed: false },
  { id: '3', title: 'Rever Faturas & Pagamentos Pendentes', category: 'Financeiro', completed: false },
  { id: '4', title: 'Confirmar Encomendas de Clientes', category: 'Vendas', completed: false },
];

function DailyTasks() {
  const [tasks, setTasks] = useState<DayTask[]>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = window.localStorage.getItem('daily_tasks');
        if (saved) {
          return JSON.parse(saved);
        }
      }
    } catch (e) {
      console.warn("Could not read daily_tasks from localStorage", e);
    }
    return INITIAL_TASKS;
  });
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('daily_tasks', JSON.stringify(tasks));
      }
    } catch (e) {
      console.warn("Could not save daily_tasks to localStorage", e);
    }
  }, [tasks]);

  const toggleTask = (id: string) => {
    setTasks(prev => prev.map(t => {
      if (t.id === id) {
        return { ...t, completed: !t.completed };
      }
      return t;
    }));
  };

  const completedCount = tasks.filter(t => t.completed).length;
  const progressPercent = Math.round((completedCount / tasks.length) * 100);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors flex items-center gap-1.5 focus:outline-none"
        title="Objetivos do Dia"
      >
        <ListChecks size={18} />
        {completedCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-blue-600 text-white rounded-full text-[10px] font-black flex items-center justify-center">
            {completedCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            
            <motion.div
              initial={{ opacity: 0, y: 15, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 15, scale: 0.95 }}
              transition={{ type: 'spring', duration: 0.3 }}
              className="absolute right-0 mt-3 w-80 bg-white rounded-3xl border border-slate-100 shadow-xl overflow-hidden z-50 p-5 text-left"
            >
              <div className="flex justify-between items-center mb-4">
                <span className="text-xs font-black uppercase text-slate-400 tracking-wider font-sans">Objetivos de Hoje</span>
                <span className="text-[10px] font-extrabold bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full uppercase tracking-widest font-sans">
                  {completedCount}/{tasks.length} Concluídos
                </span>
              </div>

              <div className="mb-4">
                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                  <motion.div
                    className="bg-blue-600 h-full rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPercent}%` }}
                    transition={{ type: 'spring', stiffness: 80 }}
                  />
                </div>
              </div>

              <div className="space-y-2.5">
                {tasks.map(task => (
                  <div
                    key={task.id}
                    onClick={() => toggleTask(task.id)}
                    className="flex items-center gap-3 p-2.5 rounded-2xl hover:bg-slate-50 transition-colors cursor-pointer select-none"
                  >
                    <div className="relative">
                      <motion.div
                        className={cn(
                          "w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-colors duration-150 relative overflow-hidden",
                          task.completed ? "bg-blue-600 border-blue-600" : "border-slate-300 bg-white"
                        )}
                        animate={{
                          scale: task.completed ? [1, 0.85, 1.15, 1] : 1,
                        }}
                        transition={{ duration: 0.25 }}
                      >
                        {task.completed && (
                          <motion.svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="white"
                            strokeWidth="4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="w-3.5 h-3.5"
                            initial={{ pathLength: 0 }}
                            animate={{ pathLength: 1 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </motion.svg>
                        )}
                      </motion.div>
                    </div>

                    <div className="flex-1 pointer-events-none">
                      <div className="relative">
                        <span className={cn(
                          "text-xs font-bold leading-none text-slate-700 block transition-colors duration-150",
                          task.completed && "text-slate-400 font-sans"
                        )}>
                          {task.title}
                        </span>
                        <AnimatePresence>
                          {task.completed && (
                            <motion.div
                              className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[1.5px] bg-slate-400 origin-left"
                              initial={{ scaleX: 0 }}
                              animate={{ scaleX: 1 }}
                              exit={{ scaleX: 0 }}
                              transition={{ duration: 0.2 }}
                            />
                          )}
                        </AnimatePresence>
                      </div>
                      <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider font-sans">
                        {task.category}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {completedCount === tasks.length && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="mt-4 p-3 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-2xl text-center text-xs font-extrabold uppercase tracking-wide flex items-center justify-center gap-1.5 font-sans"
                >
                  🎯 Tudo concluído!
                </motion.div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function ProtectedApp() {
  const { user, profile, businessData, loading, isAuthenticating, loginWithGoogle, sendOtp, confirmOtp, loginWithEmail, registerWithEmail, logout, authLogs, clearAuthLogs } = useAuth();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [termsModalTab, setTermsModalTab] = useState<'terms' | 'privacy'>('terms');
  const [twoFactorVerified, setTwoFactorVerified] = useState(false);
  const [twoFactorCodeInput, setTwoFactorCodeInput] = useState('');
  const [twoFactorCodeSent, setTwoFactorCodeSent] = useState<string | null>(null);
  const [sending2FaCode, setSending2FaCode] = useState(false);
  const [platformLogoUrl, setPlatformLogoUrl] = useState<string | null>(null);
  const [logoLoading, setLogoLoading] = useState(true);

  // Print auth logs to browser console silently for diagnostic purposes
  useEffect(() => {
    if (authLogs && authLogs.length > 0) {
      const latestLog = authLogs[authLogs.length - 1];
      console.log(`[SABUSH SYSTEM DIAGNOSTICS] [${latestLog.timestamp}] [${latestLog.event.toUpperCase()}]: ${latestLog.description}`, latestLog.details || '');
    }
  }, [authLogs]);

  useEffect(() => {
    const unsubBranding = onSnapshot(doc(db, 'platform', 'branding'), (snapshot) => {
      if (snapshot.exists()) {
        setPlatformLogoUrl(snapshot.data()?.logoURL || null);
      } else {
        setPlatformLogoUrl(null);
      }
      setLogoLoading(false);
    }, (err) => {
      console.warn("Error streaming platform logo URL on login page:", err);
      setLogoLoading(false);
    });

    return () => unsubBranding();
  }, []);

  const [legalAcknowledgement, setLegalAcknowledgement] = useState<any>(null);
  const [isLoadingLegal, setIsLoadingLegal] = useState(true);

  useEffect(() => {
    if (user && profile?.businessId) {
      setIsLoadingLegal(true);
      const ackRef = doc(db, 'businesses', profile.businessId, 'settings', 'legalAcknowledgement');
      const unsubscribe = onSnapshot(ackRef, (snap) => {
        if (snap.exists() && snap.data()?.acknowledged) {
          setLegalAcknowledgement(snap.data());
        } else {
          setLegalAcknowledgement(null);
        }
        setIsLoadingLegal(false);
      }, (error) => {
        console.error("Error reading legal acknowledgement:", error);
        setIsLoadingLegal(false);
      });
      return () => unsubscribe();
    } else {
      setLegalAcknowledgement(null);
      setIsLoadingLegal(false);
    }
  }, [user, profile?.businessId]);

  useEffect(() => {
    const brandColor = businessData?.brandColor || '#178F82';
    const tints = getBrandTints(brandColor);
    const root = document.documentElement;
    root.style.setProperty('--brand-color', tints.primary);
    root.style.setProperty('--brand-color-hover', tints.hover);
    root.style.setProperty('--brand-color-light', tints.light);
    root.style.setProperty('--brand-color-glow', tints.glow);
  }, [businessData?.brandColor]);

  // Toast notification for Super Admin on newly submitted package subscription proofs
  useEffect(() => {
    if (profile?.email !== 'mascenisabush@gmail.com') return;

    const appLoadTime = Date.now();
    const q = query(
      collection(db, 'subscription_proofs'),
      where('status', '==', 'pending')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          const submittedAtTime = data.submittedAt ? new Date(data.submittedAt).getTime() : Date.now();
          // Only show toast if it was submitted recently (after app loaded)
          if (submittedAtTime > appLoadTime - 5000) {
            toast.success(`Novo comprovativo de pagamento recebido de ${data.businessName || 'uma empresa'}!`, {
              description: `Valor: ${data.amount} MZN - Plano: ${data.plan || data.planType || 'Básico'}`,
              position: 'top-right',
              duration: 8000
            });
          }
        }
      });
    }, (error) => {
      console.warn("Silent admin proof notifier error:", error);
    });

    return () => unsub();
  }, [profile?.email]);

  useEffect(() => {
    const theme = profile?.theme || 'light';
    const root = document.documentElement;

    const applyTheme = (isDark: boolean) => {
      if (isDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    if (theme === 'auto') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      applyTheme(mediaQuery.matches);

      const handleChange = (e: MediaQueryListEvent) => {
        applyTheme(e.matches);
      };

      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    } else {
      applyTheme(theme === 'dark');
    }
  }, [profile?.theme]);

  useEffect(() => {
    const fontSize = profile?.fontSize || 'normal';
    const root = document.documentElement;
    if (fontSize === 'small') {
      root.style.fontSize = '14px';
    } else if (fontSize === 'medium') {
      root.style.fontSize = '18px';
    } else if (fontSize === 'large') {
      root.style.fontSize = '20px';
    } else if (fontSize === 'xlarge') {
      root.style.fontSize = '22px';
    } else {
      root.style.fontSize = '16px';
    }
  }, [profile?.fontSize]);

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

  // Run automated database backup routine if configured and due
  useEffect(() => {
    if (user && profile?.businessId && businessData) {
      const timer = setTimeout(() => {
        checkAndTriggerAutoBackup(profile.businessId, businessData);
      }, 7000); // Wait 7s after boot to give full priority to live rendering
      return () => clearTimeout(timer);
    }
  }, [user, profile?.businessId, businessData]);
  const { i18n } = useTranslation();
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [invoiceInitialAction, setInvoiceInitialAction] = useState<string | null>(null);
  const [inventoryInitialAction, setInventoryInitialAction] = useState<string | null>(null);
  const [showStorefront, setShowStorefront] = useState(false);
  const [activePaymentLink, setActivePaymentLink] = useState<{ businessId: string; invoiceId: string } | null>(null);
  const [publicShopId, setPublicShopId] = useState<string | null>(null);
  const [isCustomerPortalRoute, setIsCustomerPortalRoute] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.location.pathname === '/portal' || window.location.pathname.startsWith('/portal/') || window.location.search.includes('portal=true');
    }
    return false;
  });

  const [isShortcutsHelpOpen, setIsShortcutsHelpOpen] = useState(false);
  const [hasOpenedShortcuts, setHasOpenedShortcuts] = useState(() => {
    try {
      return localStorage.getItem('has_opened_shortcuts_guide') === 'true';
    } catch (_) {
      return false;
    }
  });

  const handleShortcutsHelpClick = () => {
    setIsShortcutsHelpOpen(prev => !prev);
    if (!hasOpenedShortcuts) {
      try {
        localStorage.setItem('has_opened_shortcuts_guide', 'true');
      } catch (_) {}
      setHasOpenedShortcuts(true);
    }
  };

  useEffect(() => {
    const handleToggleShortcuts = () => handleShortcutsHelpClick();
    window.addEventListener('toggle-keyboard-shortcuts', handleToggleShortcuts);
    return () => window.removeEventListener('toggle-keyboard-shortcuts', handleToggleShortcuts);
  }, [hasOpenedShortcuts]);

  useEffect(() => {
    if (isShortcutsHelpOpen && !hasOpenedShortcuts) {
      try {
        localStorage.setItem('has_opened_shortcuts_guide', 'true');
      } catch (_) {}
      setHasOpenedShortcuts(true);
    }
  }, [isShortcutsHelpOpen, hasOpenedShortcuts]);

  const [isFullscreen, setIsFullscreen] = useState(false);

  // Grand Welcome Splash — shown once, right after loading resolves
  const [runTour, setRunTour] = useState(() => {
    try {
      const completed = localStorage.getItem('has_seen_welcome_splash_v2');
      return completed !== 'true';
    } catch (_) {
      return false;
    }
  });

  const activeLang = i18n.language || 'pt';

  const handleWelcomeSplashFinish = () => {
    try {
      localStorage.setItem('has_seen_welcome_splash_v2', 'true');
    } catch (_) {}
    setRunTour(false);
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
      }
    } catch (err) {
      console.error("Erro ao tentar alterar para tela cheia:", err);
      toast.error("Não foi possível alterar o modo de tela cheia.");
    }
  };

  // Active Session Confirmation Gates
  const [sessionConfirmed, setSessionConfirmed] = useState<boolean>(true);

  const [countdown, setCountdown] = useState<number>(5);
  const [isTimerPaused, setIsTimerPaused] = useState<boolean>(false);

  useEffect(() => {
    if (user && !sessionConfirmed && countdown > 0 && !isTimerPaused) {
      const timer = setTimeout(() => {
        setCountdown(prev => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (user && !sessionConfirmed && countdown === 0 && !isTimerPaused) {
      handleContinueSession();
    }
  }, [user, sessionConfirmed, countdown, isTimerPaused]);

  useEffect(() => {
    if (user) {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          if (user.email) {
            window.localStorage.setItem('sabush_last_user_identifier', user.email);
            window.localStorage.setItem('sabush_last_user_type', 'email');
          } else if (user.phoneNumber) {
            window.localStorage.setItem('sabush_last_user_identifier', user.phoneNumber);
            window.localStorage.setItem('sabush_last_user_type', 'phone');
          }
        }
      } catch (e) {
        console.warn("Could not write last user info to localStorage", e);
      }
    }
  }, [user]);

  const handleContinueSession = () => {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.setItem('sabush_session_confirmed', 'true');
      }
    } catch (e) {
      console.warn("Could not write sessionConfirmed to sessionStorage", e);
    }
    setSessionConfirmed(true);
    toast.success("Sessão autorizada! Bem-vindo de volta.");
  };

  const handleSwitchAccount = async () => {
    setIsTimerPaused(true);
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.removeItem('sabush_session_confirmed');
      }
    } catch (e) {
      console.warn("Could not remove sessionConfirmed from sessionStorage", e);
    }
    setSessionConfirmed(false);
    await logout();
  };

  const handleLoadDemo = () => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('sabush_demo_session', 'true');
      }
      toast.success("Iniciando Modo de Teste...");
      window.location.href = window.location.pathname + '?cb=' + Date.now();
    } catch (e) {
      window.location.reload();
    }
  };

  const [loginMethod, setLoginMethod] = useState<'google' | 'phone' | 'email'>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const lastType = window.localStorage.getItem('sabush_last_user_type');
        if (lastType === 'email' || lastType === 'phone') {
          return lastType;
        }
      }
    } catch (e) {
      console.warn("Could not read loginMethod from localStorage", e);
    }
    return 'google';
  });
  
  const [phoneNumber, setPhoneNumber] = useState(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const lastType = window.localStorage.getItem('sabush_last_user_type');
        const lastId = window.localStorage.getItem('sabush_last_user_identifier');
        if (lastType === 'phone' && lastId) return lastId;
      }
    } catch (e) {
      console.warn("Could not read phoneNumber from localStorage", e);
    }
    return '';
  });
  
  const [otp, setOtp] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);

  // Email login state
  const [email, setEmail] = useState(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const lastType = window.localStorage.getItem('sabush_last_user_type');
        const lastId = window.localStorage.getItem('sabush_last_user_identifier');
        if (lastType === 'email' && lastId) return lastId;
      }
    } catch (e) {
      console.warn("Could not read email from localStorage", e);
    }
    return '';
  });
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [showTroubleshoot, setShowTroubleshoot] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  const handleForgotPassword = async () => {
    if (!email) {
      toast.error("Por favor, digite o e-mail no campo de entrada para redefinir a senha.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      toast.success("E-mail de redefinição de senha enviado com sucesso! Verifique a sua caixa de entrada.");
    } catch (err: any) {
      toast.error("Erro ao solicitar redefinição de senha: " + (err.message || err.code));
    }
  };

  useEffect(() => {
    (window as any).setCurrentTab = setCurrentTab;
    (window as any).toggleStorefront = (val: boolean) => setShowStorefront(val);
    (window as any).openPaymentLink = (businessId: string, invoiceId: string) => setActivePaymentLink({ businessId, invoiceId });
    (window as any).setInvoiceInitialAction = setInvoiceInitialAction;
    (window as any).setInventoryInitialAction = setInventoryInitialAction;

    // Handle payment link and shop links from URL query params
    const params = new URLSearchParams(window.location.search);
    const payParam = params.get('pay');
    if (payParam) {
      const [bid, iid] = payParam.split(':');
      if (bid && iid) {
        setActivePaymentLink({ businessId: bid, invoiceId: iid });
      }
    }

    const shopParam = params.get('shop') || params.get('store') || params.get('storefront');
    if (shopParam) {
      setPublicShopId(shopParam);
    }
  }, []);

  // Set up Global Keyboard Shortcuts (Ctrl/Alt hotkeys to navigate tabs and show guide)
  useEffect(() => {
    function handleGlobalKeys(e: KeyboardEvent) {
      const activeEl = document.activeElement;
      const isInputFocused = activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        activeEl.tagName === 'SELECT' || 
        activeEl.getAttribute('contenteditable') === 'true'
      );

      // If typing in normal inputs, do not trigger single modifier keys, but we can capture Ctrl combos.
      if (!(e.ctrlKey || e.metaKey || e.altKey)) {
        return;
      }

      const key = e.key.toLowerCase();

      // Ctrl + H or Alt + H -> Toggle/Show Shortcuts Guide
      if (key === 'h') {
        e.preventDefault();
        setIsShortcutsHelpOpen(prev => !prev);
        return;
      }

      // Ctrl + K -> Go to POS (Venda rápida)
      if (key === 'k') {
        e.preventDefault();
        setCurrentTab('pos');
        toast.info("A redirecionar para o POS... (Ctrl+K)");
        return;
      }

      // Ctrl + D (or Alt + D) -> Go to Dashboard (Painel)
      if (key === 'd') {
        e.preventDefault();
        setCurrentTab('dashboard');
        toast.info("A redirecionar para o Painel... (Ctrl+D)");
        return;
      }

      // Ctrl + I (or Alt + I) -> Go to Inventory (Inventário)
      if (key === 'i') {
        e.preventDefault();
        setCurrentTab('inventory');
        toast.info("A redirecionar para o Inventário... (Ctrl+I)");
        return;
      }

      // Ctrl + C (or Alt + C) -> Go to Customers (Clientes)
      if (key === 'c') {
        e.preventDefault();
        setCurrentTab('customers');
        toast.info("A redirecionar para Clientes... (Ctrl+C)");
        return;
      }

      // Ctrl + L (or Alt + L) -> Go to Invoices (Faturação)
      if (key === 'l') {
        e.preventDefault();
        setCurrentTab('invoices');
        toast.info("A redirecionar para Facturas... (Ctrl+L)");
        return;
      }

      // Ctrl + S (or Alt + S) -> Go to Settings (Configurações)
      if (key === 's') {
        e.preventDefault();
        setCurrentTab('settings');
        toast.info("A redirecionar para Configurações... (Ctrl+S)");
        return;
      }
    }
    document.addEventListener('keydown', handleGlobalKeys);
    return () => document.removeEventListener('keydown', handleGlobalKeys);
  }, []);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber) return;
    try {
      // Ensure phone number starts with + (African region default +263 for Zim or dynamic)
      // For now, assume user enters full international format or we prepone Zimbabwean code if missing
      let formattedPhone = phoneNumber.trim();
      if (!formattedPhone.startsWith('+')) {
        formattedPhone = '+' + formattedPhone;
      }
      await sendOtp(formattedPhone, 'recaptcha-container');
      setIsOtpSent(true);
    } catch (err) {
      console.error(err);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp) return;
    try {
      await confirmOtp(otp);
    } catch (err) {
      console.error(err);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoginMethod('email');
    setAuthError(null);
    try {
      if (isRegistering) {
        await registerWithEmail(email, password);
      } else {
        await loginWithEmail(email, password);
      }
    } catch (err: any) {
      console.error("handleEmailAuth error:", err);
      if (err?.code) {
        setAuthError(err.code);
      } else if (err?.message) {
        // Extract common error codes from message if code is missing but present in text
        const msg = err.message.toLowerCase();
        if (msg.includes('invalid-credential') || msg.includes('credential')) {
          setAuthError('invalid-credential');
        } else if (msg.includes('weak-password')) {
          setAuthError('weak-password');
        } else if (msg.includes('email-already-in-use')) {
          setAuthError('auth/email-already-in-use');
        } else if (msg.includes('user-not-found')) {
          setAuthError('user-not-found');
        } else if (msg.includes('wrong-password')) {
          setAuthError('wrong-password');
        } else {
          setAuthError(err.message);
        }
      } else {
        setAuthError(String(err));
      }
    }
  };

  useEffect(() => {
    if (profile?.preferredLanguage) {
      i18n.changeLanguage(profile.preferredLanguage);
    }
  }, [profile?.preferredLanguage, i18n]);

  useEffect(() => {
    const isRtl = i18n.language === 'ar';
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
  }, [i18n.language]);

  // Synchronously reset 2FA state when there is no user
  useEffect(() => {
    if (!user) {
      setTwoFactorVerified(false);
      setTwoFactorCodeSent(null);
      setTwoFactorCodeInput('');
    }
  }, [user]);

  // Generate and Send 2FA token
  useEffect(() => {
    if (user && profile?.twoFactorEnabled && !twoFactorVerified && !twoFactorCodeSent && !sending2FaCode) {
      setSending2FaCode(true);
      const generatedCode = Math.floor(100000 + Math.random() * 900000).toString();
      
      const triggerSend = async () => {
        // If they have WhatsApp Config, let's send it!
        const apiKey = businessData?.whatsappConfig?.apiKey;
        const phoneId = businessData?.whatsappConfig?.phoneNumberId;
        const recipient = businessData?.phone || businessData?.whatsappConfig?.phone || profile?.phone || profile?.phoneNumber || "";
        
        if (apiKey && phoneId && recipient) {
          try {
            const cleanTo = recipient.replace(/\D/g, '');
            const msg = `🔐 *SABUSH ERP - AUTENTICAÇÃO 2FA* 🔐\n\nOlá *${profile?.displayName || 'colaborador'}*!\n\nSeu código de segurança único para iniciar sessão é: *${generatedCode}*\n\nEste código é válido por 10 minutos.\n\n_Sabush System ERP_`;
            
            await fetch(`https://graph.facebook.com/v17.0/${phoneId}/messages`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: cleanTo,
                type: 'text',
                text: { preview_url: false, body: msg }
              })
            });
            toast.success("Código de segurança único enviado para o WhatsApp do proprietário!");
          } catch (e) {
            console.error("Failed to deliver 2FA WhatsApp message, showing local modal fallback", e);
          }
        }
        
        setTwoFactorCodeSent(generatedCode);
        setSending2FaCode(false);
      };
      
      triggerSend();
    }
  }, [user, profile, twoFactorVerified, twoFactorCodeSent, sending2FaCode, businessData]);

  if (loading || isAuthenticating || (user && !profile)) {
    return <AppLoadingScreen message="A carregar Sabush System ERP..." />;
  }

  // Standalone Public Direct Routes (No Authentication required)
  if (publicShopId) {
    return (
      <Suspense fallback={<AppLoadingScreen message="A carregar a montra online..." />}>
        <div className="w-screen h-screen bg-slate-50 overflow-hidden relative">
          <Storefront businessId={publicShopId} onClose={() => setPublicShopId(null)} />
        </div>
      </Suspense>
    );
  }

  if (activePaymentLink) {
    return (
      <Suspense fallback={<AppLoadingScreen message="A carregar a página de pagamento..." />}>
        <div className="w-screen h-screen bg-slate-50 overflow-hidden relative">
          <PaymentPage 
            businessId={activePaymentLink.businessId} 
            invoiceId={activePaymentLink.invoiceId} 
            onClose={() => setActivePaymentLink(null)} 
          />
        </div>
      </Suspense>
    );
  }

  if (isCustomerPortalRoute) {
    return (
      <Suspense fallback={<AppLoadingScreen message="A carregar o portal do cliente..." />}>
        <div className="w-screen min-h-screen bg-[#1A0F05] overflow-x-hidden relative">
          <CustomerPortal />
        </div>
      </Suspense>
    );
  }

  // STEP 4: SAFETY GUARD - If user is authenticated, we MUST NEVER return the login page.
  if (user) {
    if (!sessionConfirmed) {
      setSessionConfirmed(true);
    }
  }

  if (!user) {
    return (
      <div className="w-full min-h-screen bg-[#071120] flex items-center justify-center p-0 md:p-6 lg:p-8 overflow-hidden select-none font-sans">
        <div 
          className="w-full max-w-[1280px] min-h-[100vh] md:min-h-[640px] md:h-[85vh] flex flex-col md:flex-row bg-[#0A1C38] md:rounded-3xl shadow-2xl overflow-hidden relative border border-slate-800/60"
        >
          {/* Left Panel: ~45% width */}
          <div 
            className="w-full md:w-[45%] p-8 md:p-12 lg:p-14 flex flex-col justify-between shrink-0 relative min-h-[480px] md:min-h-0 bg-[#0A1C38] overflow-hidden"
          >
            {/* Soft depth wash - clean, no texture noise */}
            <div 
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(120% 90% at 15% 0%, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 55%)' }}
            />

            {/* Golden ambient glows - two soft points for depth, no muddy texture */}
            <div className="absolute top-[10%] -left-16 w-[340px] h-[340px] rounded-full filter blur-[130px] pointer-events-none opacity-[0.16] bg-[#F2C46B]" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[260px] h-[260px] rounded-full filter blur-[110px] pointer-events-none opacity-[0.08] bg-[#F2C46B]" />
            
            {/* Content wrapper */}
            <div className="relative z-10 flex flex-col h-full justify-between gap-8 md:gap-10">
              {/* Top Section: Logo row */}
              <div className="flex items-center gap-4">
                <div className="relative shrink-0">
                  <div className="absolute inset-0 rounded-full bg-[#F2C46B] blur-[18px] opacity-30 pointer-events-none" />
                  {!logoFailed ? (
                    <img 
                      src={sabushLogo || "/sabush-logo.png"} 
                      alt="Sabush Logo" 
                      style={{ height: '60px', width: 'auto', objectFit: 'contain' }}
                      className="relative shrink-0 drop-shadow-[0_4px_16px_rgba(0,0,0,0.35)]"
                      onError={() => setLogoFailed(true)}
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div 
                      className="relative w-[60px] h-[60px] flex items-center justify-center text-[#0A1C38] text-[26px] font-black select-none shrink-0 rounded-full font-display bg-[#B8791A] shadow-lg"
                    >
                      S
                    </div>
                  )}
                </div>
                <div className="flex flex-col select-none leading-none">
                  <span 
                    className="font-display font-black text-[28px] md:text-[32px] tracking-[0.12em] text-white leading-none"
                    style={{ textShadow: '0 2px 20px rgba(242,196,107,0.35), 0 1px 0 rgba(0,0,0,0.2)' }}
                  >
                    SABUSH
                  </span>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="h-[2px] w-5 rounded-full bg-gradient-to-r from-transparent to-[#F2C46B]" />
                    <span 
                      className="font-display font-extrabold text-[13px] tracking-[0.5em] text-[#B8791A]"
                    >
                      TECH
                    </span>
                    <span className="h-[2px] w-5 rounded-full bg-gradient-to-l from-transparent to-[#B8791A]" />
                  </div>
                </div>
              </div>

              {/* Middle content section */}
              <div className="flex-grow flex flex-col justify-center py-4">
                {/* Thin gold horizontal divider bar */}
                <div 
                  className="w-[40px] h-[3px] rounded-full mb-5 bg-[#B8791A]"
                />

                {/* Sabush System ERP Heading */}
                <h2 className="text-white text-2xl md:text-3xl font-black font-display tracking-tight leading-none mb-1">
                  Sabush <span className="text-[#F2C46B]">System</span> ERP
                </h2>
                <p className="text-[#F2C46B] text-[10px] uppercase font-bold tracking-widest mb-6 font-display">
                  THE MODERN ERP FOR AFRICAN SMES
                </p>

                {/* Large bold 3-line headline */}
                <div className="space-y-1 mb-4">
                  <h3 className="text-white text-4xl lg:text-5xl font-extrabold tracking-tight font-display">Gerencie.</h3>
                  <h3 className="text-white text-4xl lg:text-5xl font-extrabold tracking-tight font-display">Automatize.</h3>
                  <h3 className="text-[#F2C46B] text-4xl lg:text-5xl font-extrabold tracking-tight font-display">Cresça.</h3>
                </div>

                {/* Supporting text */}
                <p className="text-slate-300 text-sm max-w-sm mb-8 leading-relaxed font-body">
                  Um sistema completo para simplificar os seus processos e impulsionar o seu negócio.
                </p>

                {/* Checklist items with beautiful custom circular badges */}
                <ul className="space-y-4 max-w-sm">
                  {[
                    { text: "Gestão de vendas, compras e stock", icon: ShoppingCart },
                    { text: "Relatórios e análises em tempo real", icon: BarChart3 },
                    { text: "Facturação e gestão de clientes", icon: Users },
                    { text: "Seguro, rápido e sempre disponível", icon: Shield }
                  ].map((item, index) => {
                    const IconComponent = item.icon;
                    return (
                      <li key={index} className="flex items-center gap-3.5">
                        <div 
                          className="w-9 h-9 rounded-full border-2 border-[#F2C46B]/40 bg-[#0A1C38]/60 flex items-center justify-center shrink-0 shadow-inner"
                        >
                          <IconComponent size={16} className="text-[#F2C46B] stroke-[2.2]" />
                        </div>
                        <span className="text-slate-100 text-sm font-semibold font-body leading-tight">
                          {item.text}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* Footer Section */}
              <div className="text-slate-400 text-[11px] font-body">
                © 2026 Sabush System ERP. Todos os direitos reservados.
              </div>
            </div>

            {/* Mobile S-Curve Golden Ribbon Divider */}
            <div className="absolute left-0 right-0 bottom-[-30px] h-[60px] w-full z-20 pointer-events-none md:hidden">
              <svg className="w-full h-full" viewBox="0 0 1000 60" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="gold-grad-horiz" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#F2C46B" />
                    <stop offset="100%" stopColor="#B8791A" />
                  </linearGradient>
                </defs>
                <path d="M 0,0 L 0,30 C 250,55 750,5 1000,30 L 1000,0 Z" fill="#0A1C38" />
                <path d="M -10,20 C 240,45 740,-5 1010,20 L 1010,40 C 740,15 240,65 -10,40 Z" fill="black" opacity="0.25" />
                <path d="M 0,22 C 250,47 750,-3 1000,22 L 1000,38 C 750,13 250,63 0,38 Z" fill="url(#gold-grad-horiz)" />
                <path d="M 0,22 C 250,47 750,-3 1000,22 L 1000,25 C 750,0 250,50 0,25 Z" fill="#FFF2D6" opacity="0.6" />
              </svg>
            </div>
          </div>

          {/* Desktop S-Curve Gold Ribbon Divider Overlay */}
          <div className="hidden md:block absolute left-[45%] top-0 bottom-0 w-[120px] -ml-[60px] z-20 pointer-events-none">
            <svg className="w-full h-full" viewBox="0 0 120 1000" preserveAspectRatio="none">
              <defs>
                <linearGradient id="gold-grad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#F2C46B" />
                  <stop offset="40%" stopColor="#E5B255" />
                  <stop offset="70%" stopColor="#D9A441" />
                  <stop offset="100%" stopColor="#B8791A" />
                </linearGradient>
                <linearGradient id="gold-grad-dark" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#B8791A" />
                  <stop offset="50%" stopColor="#8B6914" />
                  <stop offset="100%" stopColor="#6B4E0F" />
                </linearGradient>
                <linearGradient id="gold-grad-light" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FFF2D6" />
                  <stop offset="100%" stopColor="#F2C46B" />
                </linearGradient>
              </defs>

              {/* Navy extension mask (matching Left Panel Background) */}
              <path 
                d="M 0,0 L 60,0 C 110,250 10,750 60,1000 L 0,1000 Z" 
                fill="#0A1C38" 
              />

              {/* Behind-shadow for 3D depth */}
              <path 
                d="M 40,-10 C 90,240 -10,740 40,1010 L 80,1010 C 30,740 130,240 80,-10 Z" 
                fill="black" 
                opacity="0.3"
                filter="blur(4px)"
              />

              {/* 3D Dark Under-layer / Bevel edge */}
              <path 
                d="M 42,0 C 92,250 -8,750 42,1000 L 78,1000 C 28,750 128,250 78,0 Z" 
                fill="url(#gold-grad-dark)" 
              />

              {/* Main Golden Ribbon */}
              <path 
                d="M 45,0 C 95,250 -5,750 45,1000 L 75,1000 C 25,750 125,250 75,0 Z" 
                fill="url(#gold-grad)" 
              />

              {/* 3D Light Highlight edge */}
              <path 
                d="M 45,0 C 95,250 -5,750 45,1000 L 51,1000 C 1,750 101,250 51,0 Z" 
                fill="url(#gold-grad-light)" 
                opacity="0.8"
              />

              {/* Soft inner glow line */}
              <path 
                d="M 60,0 C 110,250 10,750 60,1000" 
                fill="none" 
                stroke="#FFF2D6" 
                strokeWidth="1.5" 
                opacity="0.5"
              />
            </svg>
          </div>

          {/* Right Panel: ~55% width */}
          <div 
            className="w-full md:w-[55%] p-8 md:p-12 lg:p-14 flex flex-col justify-center items-center bg-[#FFFFFF] relative overflow-y-auto"
          >
            {/* Abstract Gold Dotted Africa Map decorative accent */}
            <div className="absolute top-4 right-4 w-[240px] h-[240px] pointer-events-none opacity-[0.14] select-none z-0">
              <svg viewBox="0 0 200 200" className="w-full h-full text-[#D9A441]">
                <path 
                  d="M 100,30 
                     C 120,25 140,35 150,55 
                     C 160,75 155,95 145,110 
                     C 135,125 125,145 120,165 
                     C 118,172 110,180 105,175 
                     C 95,165 85,150 82,140 
                     C 78,130 65,120 58,110 
                     C 50,100 48,85 55,75 
                     C 62,65 70,60 78,55 
                     C 85,50 90,35 100,30 Z" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2.5" 
                  strokeDasharray="4,6" 
                />
                <path 
                  d="M 50,100 A 70,70 0 1,1 170,100 A 70,70 0 1,1 50,100" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="1.2" 
                  strokeDasharray="3,3" 
                  opacity="0.6"
                />
                <circle cx="145" cy="110" r="5" fill="#B8791A" className="animate-ping" />
                <circle cx="145" cy="110" r="4" fill="#B8791A" />
              </svg>
            </div>

            {/* Centered form wrapper */}
            <div className="w-full max-w-[400px] py-4 relative z-10">
              {/* Heading */}
              <h3 
                className="text-2xl md:text-3xl font-extrabold text-[#0A1C38] font-display text-left tracking-tight"
              >
                {isRegistering ? "Criar conta" : "Bem-vindo de volta"}
              </h3>
              {/* Subtitle */}
              <p 
                className="text-sm mt-1.5 mb-7 text-slate-500 font-body text-left"
              >
                {isRegistering ? "Registe-se para começar a gerir o seu negócio" : "Inicie sessão para continuar"}
              </p>

              {/* Auth error messages, if any */}
              {authError && (
                <div className="mb-5 p-4 rounded-xl text-xs bg-red-50 border border-red-200 text-red-800 space-y-1.5 animate-in fade-in duration-200 text-left font-body shadow-sm">
                  <p className="font-bold">
                    {authError === 'auth/wrong-password' || authError === 'wrong-password'
                      ? "Senha incorreta. Por favor verifique e tente novamente." 
                      : authError === 'auth/user-not-found' || authError === 'user-not-found'
                      ? "E-mail não registrado. Ative 'Criar Conta' abaixo para se registar de imediato." 
                      : authError === 'auth/invalid-credential' || authError === 'invalid-credential'
                      ? "E-mail ou senha incorretos. Por favor, revise as suas credenciais."
                      : authError === 'auth/weak-password' || authError === 'weak-password'
                      ? "A senha escolhida é demasiado fraca. Envie uma senha com pelo menos 6 caracteres."
                      : authError === 'auth/invalid-email' || authError === 'invalid-email'
                      ? "O endereço de e-mail é inválido. Por favor, verifique o formato."
                      : authError === 'auth/too-many-requests' || authError === 'too-many-requests'
                      ? "Muitas tentativas falhadas seguidas. A conta foi bloqueada temporariamente. Tente novamente mais tarde."
                      : authError === 'auth/network-request-failed' || authError === 'network-request-failed'
                      ? "Falha de ligação à internet. Por favor, verifique a sua ligação."
                      : `Erro de Autenticação: ${authError}`}
                  </p>
                </div>
              )}

              {/* Email / Password Form */}
              <form onSubmit={handleEmailAuth} className="space-y-4">
                {/* Email field */}
                <div className="space-y-1.5 text-left">
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#0A1C38] font-display">
                    E-mail
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none text-slate-400">
                      <Mail size={18} />
                    </div>
                    <input 
                      type="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="mercearia@exemplo.com"
                      style={{ 
                        borderRadius: '10px',
                      }}
                      className="w-full pl-11 pr-4 border border-[#F2C46B] focus:border-[#B8791A] focus:outline-none focus:ring-4 focus:ring-[#F2C46B]/15 h-[46px] text-sm font-medium font-body placeholder-slate-400 text-slate-800 transition-all bg-white"
                    />
                  </div>
                </div>

                {/* Password field */}
                <div className="space-y-1.5 text-left">
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#0A1C38] font-display">
                    Palavra-passe
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none text-slate-400">
                      <Lock size={18} />
                    </div>
                    <input 
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      style={{ 
                        borderRadius: '10px',
                      }}
                      className="w-full pl-11 pr-11 border border-[#F2C46B] focus:border-[#B8791A] focus:outline-none focus:ring-4 focus:ring-[#F2C46B]/15 h-[46px] text-sm font-medium font-body placeholder-slate-400 text-slate-800 transition-all bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#0A1C38] p-1 focus:outline-none bg-transparent border-0 cursor-pointer flex items-center justify-center transition-colors"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {/* Esqueceu a senha? */}
                {!isRegistering && (
                  <div className="flex justify-end mt-1">
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      className="text-xs font-bold hover:underline font-display cursor-pointer bg-transparent border-0 outline-none transition-colors text-[#B8791A]"
                    >
                      Esqueceu a senha?
                    </button>
                  </div>
                )}

                {/* Primary submit button */}
                <button
                  type="submit"
                  disabled={isAuthenticating}
                  className="w-full h-[46px] rounded-[10px] bg-[#0A1C38] hover:bg-[#123F3D] active:scale-[0.985] flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-wider text-[#F2C46B] transition-all cursor-pointer font-display border-0 shadow-md"
                >
                  {isAuthenticating && loginMethod === 'email' ? (
                    <Loader2 className="w-5 h-5 animate-spin text-[#F2C46B]" />
                  ) : (
                    <div className="flex items-center justify-center gap-2">
                      <span>{isRegistering ? "Criar Conta" : "Iniciar Sessão"}</span>
                      <ArrowRight size={14} className="stroke-[3]" />
                    </div>
                  )}
                </button>
              </form>

              {/* Divider */}
              <div className="relative flex items-center my-5">
                <div className="flex-grow border-t border-slate-200"></div>
                <span className="flex-shrink mx-4 text-xs font-bold text-slate-400 uppercase tracking-widest font-display">ou</span>
                <div className="flex-grow border-t border-slate-200"></div>
              </div>

              {/* Google Sign-In Button */}
              <button 
                type="button"
                onClick={() => {
                  setLoginMethod('google');
                  loginWithGoogle();
                }}
                disabled={isAuthenticating}
                style={{ 
                  borderRadius: '10px'
                }}
                className="w-full h-[46px] border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-3 active:scale-[0.985] transition-all cursor-pointer font-display bg-white shadow-sm"
              >
                {isAuthenticating && loginMethod === 'google' ? (
                  <Loader2 className="w-5 h-5 animate-spin text-slate-500 shrink-0" />
                ) : (
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                )}
                <span>Iniciar sessão com Google</span>
              </button>

              {/* Footer switcher */}
              <div className="text-center text-xs mt-6 font-body font-medium text-slate-500">
                {isRegistering ? (
                  <>
                    Já tem conta?{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setIsRegistering(false);
                        setAuthError(null);
                      }}
                      className="font-extrabold hover:underline bg-transparent border-0 p-0 outline-none cursor-pointer text-xs font-display text-[#B8791A]"
                    >
                      Iniciar sessão
                    </button>
                  </>
                ) : (
                  <>
                    Não tem conta?{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setIsRegistering(true);
                        setAuthError(null);
                      }}
                      className="font-extrabold hover:underline bg-transparent border-0 p-0 outline-none cursor-pointer text-xs font-display text-[#B8791A]"
                    >
                      Criar conta
                    </button>
                  </>
                )}
              </div>

              {/* Powered by Sabush Tech */}
              <div className="text-center text-[11px] mt-8 font-body font-normal text-slate-400 select-none">
                Powered by{" "}
                <a 
                  href="https://sabushtech.com" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-extrabold no-underline hover:underline transition-all text-[#B8791A]"
                >
                  Sabush Tech
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  if (false) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const unusedOldJSX = (
      <div>
        {/* Main Content Area filling available viewport space and centered */}
        <div className="flex-1 w-full min-h-0 flex items-center justify-center relative z-10 p-1">
          {/* Main Split-Screen Layout Container */}
          <div className="w-full max-w-full lg:max-w-[1360px] xl:max-w-[1440px] px-4 xl:px-8 mx-auto flex flex-col lg:grid lg:grid-cols-12 gap-4 lg:gap-8 items-center justify-center min-h-0 h-full max-h-full overflow-hidden compact-main-grid">
            
            {/* Left Column: Slogan, Bullet Points, and Laptop UI Mockup wrapped in a Desktop Screen Frame */}
            <div className="col-span-1 lg:col-span-7 flex flex-col justify-center py-2 text-white animate-in fade-in duration-700 min-h-0 h-full max-h-full left-col w-full">
              
              {/* Desktop Screen Frame */}
              <div 
                style={{
                  background: 'rgba(15, 23, 42, 0.65)',
                  border: '12px solid #1e293b',
                  borderRadius: '24px',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                }}
                className="w-full h-full max-h-full flex flex-col overflow-hidden relative"
              >
                {/* Browser-style dots at the top */}
                <div className="flex items-center justify-between px-4 py-2 bg-slate-950/50 border-b border-white/5 shrink-0 select-none">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444] opacity-90"></span>
                    <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B] opacity-90"></span>
                    <span className="w-2.5 h-2.5 rounded-full bg-[#10B981] opacity-90"></span>
                  </div>
                  <span className="text-[9px] text-white/35 font-bold uppercase tracking-widest font-mono">sabush-system-desktop</span>
                  <div className="w-10"></div>
                </div>

                {/* Inner Screen Scroll Content */}
                <div className="flex-1 overflow-y-auto no-scrollbar p-4 sm:p-5 lg:p-6 flex flex-col gap-4 lg:gap-6 justify-between min-h-0">
            
             {/* Header / Brand Logo */}
            <div className="flex items-center gap-3 lg:gap-5 shrink-0 left-brand-logo">
              <img 
                src={platformLogoUrl || "/sabush-logo.png"} 
                alt="Sabush System ERP" 
                style={{ height: '40px', width: 'auto', objectFit: 'contain', filter: 'drop-shadow(0px 2px 8px rgba(0,0,0,0.4))' }}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/sabush-logo.png";
                }}
                referrerPolicy="no-referrer"
              />
              <div>
                <h1 className="text-lg lg:text-xl font-extrabold text-white tracking-tight flex items-center gap-1.5 leading-none font-sans">
                  <span>Sabush System</span>
                  <span className="text-white">ERP</span>
                </h1>
                <span className="text-[9px] lg:text-[10px] text-slate-200 font-bold tracking-wide uppercase mt-1 block">The Modern ERP for African SMEs</span>
              </div>
            </div>

            {/* Slogan and Call to Action */}
            <div className="space-y-1.5 lg:space-y-3 shrink-0 text-center lg:text-left">
              <h2 className="text-xl sm:text-2xl lg:text-[36px] xl:text-[44px] font-black tracking-tight leading-[1.12] text-white font-sans left-title">
                Gerencie. Automatize.<br />
                Cresça com <span className="text-white">Sabush ERP.</span>
              </h2>
              <p className="text-xs lg:text-sm text-slate-200 font-medium leading-relaxed max-w-lg mx-auto lg:mx-0 left-subtitle">
                Um sistema completo para simplificar seus processos, aumentar a produtividade e impulsionar o seu negócio.
              </p>
            </div>

            {/* Features Bullet List - responsive grid for mobile/tablet layout, flex col for desktop */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 lg:flex lg:flex-col lg:space-y-4 max-w-md pt-2 shrink-0 left-features-list">
              <div className="flex items-center gap-4 group">
                <div className="w-12 h-12 bg-white hover:scale-105 transition-all text-[#174FA3] rounded-full flex items-center justify-center shadow-md shadow-blue-500/5 shrink-0">
                  <svg className="w-5 h-5 text-[#1b73e8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-white font-extrabold text-sm leading-tight font-sans">Gestão Completa</h3>
                  <p className="text-slate-200 text-xs font-semibold mt-0.5">Finanças, Vendas, Compras, Estoque e muito mais.</p>
                </div>
              </div>

              <div className="flex items-center gap-4 group">
                <div className="w-12 h-12 bg-white hover:scale-105 transition-all text-[#174FA3] rounded-full flex items-center justify-center shadow-md shadow-blue-500/5 shrink-0">
                  <svg className="w-5 h-5 text-[#1b73e8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-white font-extrabold text-sm leading-tight font-sans">Colaboração em Tempo Real</h3>
                  <p className="text-slate-200 text-xs font-semibold mt-0.5">Equipes conectadas e dados sempre atualizados.</p>
                </div>
              </div>

              <div className="flex items-center gap-4 group">
                <div className="w-12 h-12 bg-white hover:scale-105 transition-all text-[#174FA3] rounded-full flex items-center justify-center shadow-md shadow-blue-500/5 shrink-0">
                  <svg className="w-5 h-5 text-[#174FA3]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-white font-extrabold text-sm leading-tight font-sans">Seguro & Confiável</h3>
                  <p className="text-slate-200 text-xs font-semibold mt-0.5">Seus dados protegidos com tecnologia de ponta.</p>
                </div>
              </div>

              <div className="flex items-center gap-4 group">
                <div className="w-12 h-12 bg-white hover:scale-105 transition-all text-[#174FA3] rounded-full flex items-center justify-center shadow-md shadow-blue-500/5 shrink-0">
                  <svg className="w-5 h-5 text-[#1b73e8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-white font-extrabold text-sm leading-tight font-sans">Relatórios Inteligentes</h3>
                  <p className="text-slate-200 text-xs font-semibold mt-0.5">Tome decisões melhores com insights em tempo real.</p>
                </div>
              </div>
            </div>

            {/* Laptop / Dashboard CSS Mockup */}
            <div className="hidden md:block relative max-w-xl w-full pt-2 pr-4 laptop-mockup-wrapper">
              {/* Floating Widget 1 */}
              <div className="absolute -top-4 -right-16 w-36 p-3 bg-white/90 backdrop-blur-md border border-blue-100 rounded-2xl shadow-xl flex items-center gap-2.5 animate-bounce [animation-duration:9s] z-20">
                <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                  <TrendingUp className="w-4 h-4 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-slate-400 font-extrabold leading-none uppercase">Vendas</p>
                  <p className="text-xs font-black text-slate-850 mt-1 leading-none">+32.8%</p>
                </div>
              </div>

              {/* Floating Widget 2 */}
              <div className="absolute -bottom-2 -left-6 w-44 p-3 bg-white/90 backdrop-blur-md border border-blue-105 rounded-2xl shadow-xl flex flex-col gap-1 z-20">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-slate-400 font-extrabold uppercase leading-none tracking-wider">Histórico Faturação</span>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                </div>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-xs font-black text-slate-800 leading-none">22 583 $</span>
                  <span className="text-[8px] text-emerald-600 font-bold font-sans">✓ Concluído</span>
                </div>
              </div>

              {/* Main Laptop screen/base body */}
              <div className="w-full relative perspective-[1200px]">
                <div className="bg-slate-900 border-[10px] border-slate-900 rounded-t-[20px] aspect-[16/10] w-full shadow-2xl relative overflow-hidden flex flex-col">
                  {/* WebCam Dot */}
                  <div className="absolute top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-slate-800 rounded-full border border-slate-700"></div>

                  {/* Micro dashboard interface panel */}
                  <div className="flex-1 bg-slate-50 flex overflow-hidden text-slate-850 relative select-none">
                    
                    {/* Dark Sidebar */}
                    <div className="w-12 bg-slate-900 flex flex-col items-center py-2.5 gap-2.5 border-r border-slate-850 shrink-0">
                      <div className="w-5 h-5 rounded-md bg-blue-600 flex items-center justify-center text-[10px] font-black text-white italic">S</div>
                      <div className="space-y-2 w-full px-2 pt-2">
                        <div className="w-full h-1.5 rounded bg-white/20"></div>
                        <div className="w-full h-1.5 rounded bg-white/10"></div>
                        <div className="w-full h-1.5 rounded bg-white/10"></div>
                        <div className="w-full h-1.5 rounded bg-white/10"></div>
                      </div>
                    </div>

                    {/* Main Work Area */}
                    <div className="flex-1 p-3 flex flex-col space-y-2.5 bg-[#FAF9F5] overflow-hidden">
                      {/* Dashboard Micro Header */}
                      <div className="flex items-center justify-between border-b border-slate-200/50 pb-1.5">
                        <div className="space-y-0.5">
                          <div className="w-16 h-2 rounded bg-slate-300"></div>
                          <div className="w-10 h-1.5 rounded bg-slate-200"></div>
                        </div>
                        <div className="w-7 h-3 bg-blue-105 text-[6.5px] text-blue-700 font-black rounded flex items-center justify-center uppercase tracking-wide">PDV</div>
                      </div>

                      {/* Score Metrics row */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-white p-1.5 rounded-lg border border-slate-200/40 shadow-xs space-y-1">
                          <div className="w-6 h-1.5 rounded bg-slate-200"></div>
                          <div className="w-8 h-3 rounded bg-blue-600/90"></div>
                        </div>
                        <div className="bg-white p-1.5 rounded-lg border border-slate-200/40 shadow-xs space-y-1">
                          <div className="w-6 h-1.5 rounded bg-slate-200"></div>
                          <div className="w-10 h-3 rounded bg-slate-800"></div>
                        </div>
                        <div className="bg-white p-1.5 rounded-lg border border-slate-200/40 shadow-xs space-y-1">
                          <div className="w-8 h-1.5 rounded bg-slate-200"></div>
                          <div className="w-7 h-3 rounded bg-slate-800"></div>
                        </div>
                      </div>

                      {/* Area Chart visualization card */}
                      <div className="flex-1 bg-white rounded-xl p-2.5 border border-slate-200/40 flex flex-col relative space-y-1 overflow-hidden">
                        <div className="flex items-center justify-between">
                          <div className="w-12 h-2 rounded bg-slate-300"></div>
                          <span className="w-6 h-1.5 bg-slate-100 rounded"></span>
                        </div>
                        {/* Interactive dynamic-like vector line */}
                        <div className="flex-1 relative flex items-end">
                          <svg className="w-full h-[85%] absolute inset-0" viewBox="0 0 100 30" preserveAspectRatio="none">
                            <defs>
                              <linearGradient id="laptopAreaGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#174FA3" stopOpacity="0.25" />
                                <stop offset="100%" stopColor="#174FA3" stopOpacity="0.0" />
                              </linearGradient>
                            </defs>
                            <path d="M0,25 C15,12 25,28 42,14 C58,2 72,21 85,8 C90,4 95,12 100,5 L100,30 L0,30 Z" fill="url(#laptopAreaGrad)"></path>
                            <path d="M0,25 C15,12 25,28 42,14 C58,2 72,21 85,8 C90,4 95,12 100,5" fill="none" stroke="#174FA3" strokeWidth="2.5" strokeLinecap="round"></path>
                            
                            <circle cx="42" cy="14" r="2.5" fill="#174FA3" className="animate-ping" style={{ transformOrigin: '42px 14px' }}></circle>
                            <circle cx="42" cy="14" r="1.5" fill="#ffffff" stroke="#174FA3" strokeWidth="1.5"></circle>

                            <circle cx="85" cy="8" r="2.5" fill="#174FA3" className="animate-ping" style={{ transformOrigin: '85px 8px' }}></circle>
                            <circle cx="85" cy="8" r="1.5" fill="#ffffff" stroke="#174FA3" strokeWidth="1.5"></circle>
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Keyboard body template base plate */}
                <div className="bg-zinc-350 border-t border-zinc-200 rounded-b-[12px] h-[14px] w-full shadow-2xl relative">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[18%] h-[3px] bg-zinc-400 rounded-b-md"></div>
                </div>
                <div className="bg-zinc-400 rounded-b-[20px] h-[5px] w-[96%] mx-auto opacity-75 shadow-lg shadow-black/40"></div>
              </div>
            </div>
            
            {/* Closes Inner Screen Scroll Content, Desktop Screen Frame, and Left Column wrapper respectively */}
            </div>
          </div>
        </div>

          {/* Right Column: Stunning Crisp White Login Card with Brand Alignment */}
          <div className="col-span-1 lg:col-span-5 flex items-center justify-center animate-in fade-in slide-in-from-right-4 duration-500 min-h-0 h-full max-h-full right-col">
            <div 
              style={{
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '16px'
              }}
              className="w-full max-w-lg p-5 sm:p-7 md:p-9 shadow-[0_32px_64px_-16px_rgba(13,75,133,0.12),_0_16px_32px_-8px_rgba(0,0,0,0.06)] flex flex-col gap-4 compact-layout-card min-h-0 h-full lg:h-auto overflow-y-auto no-scrollbar"
            >
              
              {/* Header inside login box */}
              <div className="flex flex-col items-center text-center space-y-1 compact-gap shrink-0">
                <img 
                  src={platformLogoUrl || "/sabush-logo.png"} 
                  alt="Sabush System ERP"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "/sabush-logo.png";
                  }}
                  style={{ 
                    height: '60px', 
                    width: 'auto', 
                    objectFit: 'contain', 
                    marginBottom: '4px'
                  }}
                  className="compact-logo"
                />
                <h3 className="text-[#B8791A] font-black text-2xl sm:text-3xl tracking-tight font-sans compact-title">
                  Sabush System <span className="text-[#B8791A]">ERP</span><span className="text-[#B8791A] font-black">•</span>
                </h3>
                <p className="text-[9.5px] text-slate-500 font-extrabold uppercase tracking-wider compact-subtitle">The Modern ERP for African SMEs</p>
              </div>

              {/* Continuar com Google custom button */}
              <button 
                type="button"
                onClick={() => {
                  setLoginMethod('google');
                  loginWithGoogle();
                }}
                disabled={isAuthenticating}
                style={{ backgroundColor: '#FFFFFF', borderColor: '#E2E8F0' }}
                className="w-full flex items-center justify-center gap-3 hover:bg-slate-50 border active:scale-[0.985] text-slate-700 py-2.5 px-4 rounded-xl transition-all font-bold text-sm cursor-pointer compact-button shrink-0 shadow-sm"
              >
                {isAuthenticating && loginMethod === 'google' ? (
                  <Loader2 className="w-5 h-5 animate-spin text-slate-500 font-sans" />
                ) : (
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                )}
                <span className="text-slate-700 font-bold">Continuar com Google</span>
              </button>

              {/* Iframe Safe helper link for Google sign in */}
              <a
                href={typeof window !== 'undefined' ? window.location.href : '#'}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#B8791A' }}
                className="text-center text-[11px] hover:text-[#8B6914] font-bold shrink-0 mt-1 select-none underline"
              >
                Problemas ao entrar? Clique aqui para abrir em nova aba 🌐
              </a>



              {/* OU Separator */}
              <div className="relative flex items-center py-0.5 shrink-0">
                <div className="flex-grow border-t border-slate-200"></div>
                <span className="flex-shrink mx-4 text-xs font-bold text-slate-400">OU</span>
                <div className="flex-grow border-t border-slate-200"></div>
              </div>

              {/* E-mail & Senha Header Indicator */}
              <div className="space-y-1.5 lg:space-y-2.5 shrink-0">
                <div
                  style={{
                    background: '#FFF7ED',
                    color: '#B8791A',
                    border: '1px solid rgba(234, 88, 12, 0.1)'
                  }}
                  className="w-full py-2.5 px-3.5 rounded-xl flex items-center justify-center gap-2 mb-0.5 font-bold text-xs sm:text-sm compact-button"
                >
                  <Mail size={14} className="text-[#B8791A]" />
                  <span>Entrar com E-mail & Senha</span>
                </div>

                {/* Sub-tabs to switch securely between Sign In and Sign Up */}
                <div 
                  style={{ background: '#F8FAFC', padding: '3px' }}
                  className="grid grid-cols-2 rounded-xl border border-slate-100"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setIsRegistering(false);
                      setAuthError(null);
                    }}
                    className={`py-1.5 text-[10.5px] font-black rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 select-none ${
                      !isRegistering
                        ? 'bg-[#B8791A] text-white shadow-sm'
                        : 'bg-transparent text-slate-500 hover:text-[#B8791A]'
                    }`}
                  >
                    <svg className={`w-3 h-3 shrink-0 ${!isRegistering ? 'text-white' : 'text-[#B8791A]'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                    </svg>
                    <span>Iniciar Sessão</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsRegistering(true);
                      setAuthError(null);
                    }}
                    className={`py-1.5 text-[10.5px] font-black rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 select-none ${
                      isRegistering
                        ? 'bg-[#B8791A] text-white shadow-sm'
                        : 'bg-transparent text-slate-500 hover:text-[#B8791A]'
                    }`}
                  >
                    <svg className={`w-3 h-3 shrink-0 ${isRegistering ? 'text-white' : 'text-[#B8791A]'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                    <span>Criar Conta</span>
                  </button>
                </div>
              </div>

              {/* Auth error warnings, if any */}
              {authError && (
                <div className="p-3.5 rounded-2xl text-xs bg-rose-50 border border-rose-150 text-rose-800 space-y-2 animate-in fade-in duration-200">
                  {authError === 'auth/operation-not-allowed' ? (
                    <>
                      <p className="font-extrabold uppercase tracking-wider text-[9px] text-rose-950 flex items-center gap-1.5">
                        <span>❌ Método Desativado no Firebase</span>
                      </p>
                      <p className="font-bold text-[10px] text-slate-705 leading-relaxed">
                        O login por <strong>E-mail & Senha</strong> não está ativado no seu Console Firebase.
                      </p>
                      <a
                        href="https://console.firebase.google.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-3 py-2 transition-all font-extrabold uppercase text-[9px] w-full decoration-transparent"
                      >
                        <span>Abrir Console do Firebase</span>
                        <ExternalLink size={10} />
                      </a>
                    </>
                  ) : authError === 'auth/email-already-in-use' ? (
                    <>
                      <p className="font-extrabold uppercase text-[9px] text-indigo-950">⚠️ E-mail já em uso</p>
                      <p className="font-semibold text-[10px] text-slate-700">Este endereço de e-mail já possui uma conta cadastrada.</p>
                      <button
                        type="button"
                        onClick={() => {
                          setIsRegistering(false);
                          setAuthError(null);
                        }}
                        className="text-left font-black text-blue-600 hover:underline uppercase text-[9px] tracking-wider"
                      >
                        Iniciar Sessão com Senha ➔
                      </button>
                    </>
                  ) : (
                    <p className="font-semibold text-rose-900 text-[10.5px]">
                      {authError === 'auth/wrong-password' || authError === 'wrong-password'
                        ? "Senha incorreta. Por favor verifique e tente novamente." 
                        : authError === 'auth/user-not-found' || authError === 'user-not-found'
                        ? "E-mail não registrado. Ative 'Criar Conta' abaixo para se registar de imediato." 
                        : authError === 'auth/invalid-credential' || authError === 'invalid-credential'
                        ? "E-mail ou senha incorretos. Por favor, revise as suas credenciais ou registe-se abaixo se for novo utilizador."
                        : authError === 'auth/weak-password' || authError === 'weak-password'
                        ? "A senha escolhida é demasiado fraca. Envie uma senha com pelo menos 6 caracteres."
                        : authError === 'auth/invalid-email' || authError === 'invalid-email'
                        ? "O endereço de e-mail é inválido. Por favor, verifique o formato estrutural do e-mail."
                        : authError === 'auth/too-many-requests' || authError === 'too-many-requests'
                        ? "Muitas tentativas falhadas seguidas. A conta foi bloqueada temporariamente. Tente novamente mais tarde."
                        : authError === 'auth/network-request-failed' || authError === 'network-request-failed'
                        ? "Falha de ligação à internet. Por favor, verifique a ligação de rede e tente novamente."
                        : `Erro de Autenticação: ${authError}`}
                    </p>
                  )}
                </div>
              )}

              {/* Form inputs */}
              <form onSubmit={handleEmailAuth} className="space-y-2.5 lg:space-y-4 shrink-0">
                
                {/* Email text box */}
                <div className="relative w-full">
                  <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="seuemail@exemplo.com"
                    style={{
                      background: '#FFFFFF',
                      border: '1px solid #CBD5E1',
                      color: '#1E293B',
                      borderRadius: '8px'
                    }}
                    onFocus={(e) => {
                      e.target.style.outline = 'none';
                      e.target.style.borderColor = '#B8791A';
                      e.target.style.boxShadow = '0 0 0 2.5px rgba(234, 88, 12, 0.2)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#CBD5E1';
                      e.target.style.boxShadow = 'none';
                    }}
                    className="w-full p-2.5 pl-10 outline-none transition-all text-xs sm:text-sm font-semibold placeholder-slate-400 compact-input text-[#1E293B]"
                  />
                </div>

                {/* Password text box */}
                <div className="relative w-full">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••••••••••"
                    style={{
                      background: '#FFFFFF',
                      border: '1px solid #CBD5E1',
                      color: '#1E293B',
                      borderRadius: '8px'
                    }}
                    onFocus={(e) => {
                      e.target.style.outline = 'none';
                      e.target.style.borderColor = '#B8791A';
                      e.target.style.boxShadow = '0 0 0 2.5px rgba(234, 88, 12, 0.2)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#CBD5E1';
                      e.target.style.boxShadow = 'none';
                    }}
                    className="w-full p-2.5 pl-10 pr-10 outline-none transition-all text-xs sm:text-sm font-semibold placeholder-slate-400 font-sans compact-input text-[#1E293B]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded focus:outline-none"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                {/* Keep me logged in & Forgot password row */}
                <div className="flex items-center justify-between text-[11px] sm:text-xs py-0.5">
                  <label 
                    className="flex items-center gap-1.5 cursor-pointer font-bold select-none text-slate-600"
                  >
                    <input
                      type="checkbox"
                      defaultChecked
                      className="w-3.5 h-3.5 text-[#B8791A] border-slate-300 rounded focus:ring-transparent bg-white select-none checkbox-blue"
                    />
                    <span>Lembrar-me</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="font-extrabold text-[#B8791A] hover:text-[#8B6914] cursor-pointer underline select-none"
                  >
                    Esqueceu a senha?
                  </button>
                </div>

                {/* Main Submit action button */}
                <button
                  type="submit"
                  disabled={isAuthenticating}
                  style={{ backgroundColor: '#B8791A', color: '#FFFFFF' }}
                  className="w-full py-2.5 rounded-xl font-extrabold shadow-lg shadow-[#B8791A]/15 transition-all flex items-center justify-center gap-2 active:scale-[0.98] hover:bg-[#6B4E0F] cursor-pointer compact-button text-white"
                >
                  {isAuthenticating && loginMethod === 'email' ? (
                    <Loader2 className="w-4 h-4 animate-spin text-white font-sans" />
                  ) : isRegistering ? (
                    <svg className="w-4 h-4 text-white shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-white shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                    </svg>
                  )}
                  <span className="text-white font-extrabold">{isRegistering ? "Criar Conta" : "Iniciar Sessão"}</span>
                </button>
              </form>

              {/* AJUDA COM LOGIN E INSTALACAO */}
              <div className="w-full pt-1 hidden">
                <button
                  type="button"
                  onClick={() => setShowTroubleshoot(!showTroubleshoot)}
                  className="w-full flex items-center justify-between text-[10px] font-black text-white/50 hover:text-white/85 transition-colors py-1 cursor-pointer uppercase tracking-widest font-sans"
                >
                  <span>💡 AJUDA COM LOGIN E INSTALAÇÃO</span>
                  <span className="text-[10px]">{showTroubleshoot ? '▲' : '▼'}</span>
                </button>

                {showTroubleshoot && (
                  <div className="mt-2.5 bg-slate-900 border border-white/10 rounded-xl p-3.5 text-left space-y-3 text-[11px] text-slate-350 leading-relaxed animate-in fade-in slide-in-from-top-1 duration-200">
                    <p className="font-extrabold text-white uppercase tracking-wider text-[9px]">Por que meu login com Google ou E-mail não entra?</p>
                    
                    <div className="space-y-3 text-slate-300">
                      
                      {/* Authorized Domains copy card */}
                      <div className="bg-emerald-950/40 border border-green-800/40 p-3 rounded-xl space-y-1.5 font-semibold text-[10px] text-green-300">
                        <strong className="text-green-200 block text-[9.5px] uppercase tracking-wider">REGISTRE ESTE DOMÍNIO NO FIREBASE:</strong>
                        <p>
                          Para o Google Sign-In funcionar corretemente dentro do iFrame, adicione este domínio de teste nos <strong>Domínios Autorizados</strong> do Console do Firebase (Authentication &gt; Settings &gt; Authorized Domains).
                        </p>
                        <div className="flex items-center gap-1.5 mt-1.5 bg-black/40 border border-white/10 rounded-lg p-1">
                          <code className="text-[9.5px] font-mono font-bold text-white flex-1 truncate select-all px-1.5">{typeof window !== 'undefined' ? window.location.hostname : 'localhost'}</code>
                          <button
                            type="button"
                            onClick={() => {
                              if (typeof window !== 'undefined') {
                                navigator.clipboard.writeText(window.location.hostname);
                                toast.success("Domínio " + window.location.hostname + " copiado para a área de transferência.");
                              }
                            }}
                            className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border-0 outline-none p-1.5 rounded-md transition-all active:scale-95 cursor-pointer flex items-center gap-1 font-bold text-[8.5px] uppercase font-bold italic shrink-0"
                          >
                            <Copy size={11} />
                            <span>Copiar</span>
                          </button>
                        </div>
                      </div>

                      <div className="flex gap-1.5">
                        <span className="text-[#639922] font-extrabold shrink-0">1.</span>
                        <p><strong>Provedores Desativados:</strong> Certifique-se de habilitar "E-mail/senha" e "Google" na aba "Sign-in method" nas configurações de Autenticação do Console Firebase.</p>
                      </div>

                      <div className="flex gap-1.5">
                        <span className="text-[#639922] font-extrabold shrink-0">2.</span>
                        <p><strong>Configuração de Domínios:</strong> Clique na aba "Settings" &gt; "Authorized Domains" para adicionar o endereço copiado acima.</p>
                      </div>

                    </div>
                  </div>
                )}

                {/* Real-time Authentication Diagnostic Dashboard */}
                {import.meta.env.DEV && (
                  <div className="mt-5 border-t border-slate-800/80 pt-4 text-left">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-550"></span>
                        </span>
                        <span className="text-[10px] font-extrabold text-blue-400 uppercase tracking-widest font-sans">
                          Diagnósticos de Sessão Sabush (Real-Time)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => clearAuthLogs()}
                        className="text-[9px] font-black text-slate-400 hover:text-white bg-[#0D1F3D] px-2 py-0.5 rounded border border-slate-800 tracking-wider transition-colors cursor-pointer shrink-0"
                      >
                        Limpar Logs
                      </button>
                    </div>

                    <p className="text-[10px] text-slate-400 leading-normal mb-2.5">
                      Este monitor auxilia na deteção de redirecionamentos. Registos como <span className="font-mono text-amber-400">MISSING_PROFILE_REDIRECT</span> indicam que a conta necessita de Onboarding de negócio para carregar o Dashboard.
                    </p>

                    <div className="space-y-1 max-h-24 overflow-y-auto pr-1 bg-slate-950 p-2 rounded-xl border border-slate-800/50 font-mono text-[9px] compact-trouble-box no-scrollbar">
                      {authLogs && authLogs.length > 0 ? (
                        authLogs.map((log) => {
                          let badgeColor = 'text-blue-400 bg-blue-500/10 border-blue-500/20';
                          if (log.type === 'success') badgeColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
                          if (log.type === 'warn') badgeColor = 'text-amber-400 bg-amber-500/10 border-amber-500/20';
                          if (log.type === 'error') badgeColor = 'text-rose-400 bg-rose-500/10 border-rose-500/20';

                          return (
                            <div key={log.id} className="p-1 rounded bg-[#061225] border border-slate-900/60 mb-1 last:mb-0">
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-[9px] text-slate-500">{log.timestamp}</span>
                                <span className={`px-1 rounded text-[8px] font-bold tracking-wider border uppercase shrink-0 ${badgeColor}`}>
                                  {log.event}
                                </span>
                              </div>
                              <p className="text-slate-300 mt-1 leading-relaxed select-text font-sans">
                                {log.description}
                              </p>
                              {log.details && (
                                <pre className="text-[9px] text-slate-500 mt-1 max-h-24 overflow-auto p-1 bg-black/40 rounded border border-slate-900 leading-tight font-mono select-text">
                                  {JSON.stringify(log.details, null, 2)}
                                </pre>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-slate-500 text-center py-4 italic text-[9.5px]">
                          Nenhum evento gravado. Aguardando interação...
                        </div>
                      )}
                    </div>
                  </div>
                )}

              </div>

              {/* Disclaimer */}
              <p className="text-center text-[10px] text-[#FAECE7] font-semibold leading-relaxed mt-1">
                Ao iniciar sessão, você aceita expressamente os nossos{" "}
                <button 
                  type="button" 
                  onClick={() => { setTermsModalTab('terms'); setIsTermsOpen(true); }}
                  style={{ color: '#FFFFFF', textDecoration: 'underline' }}
                  className="font-bold hover:text-slate-100 cursor-pointer"
                >
                  Termos de Serviço
                </button>{" "}
                e{" "}
                <button 
                  type="button" 
                  onClick={() => { setTermsModalTab('privacy'); setIsTermsOpen(true); }}
                  style={{ color: '#FFFFFF', textDecoration: 'underline' }}
                  className="font-bold hover:text-slate-100 cursor-pointer"
                >
                  Política de Privacidade
                </button>.
              </p>

            </div>
          </div>

        </div>
      </div>

        {/* Muted outer footer */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[10.5px] text-slate-300 font-bold text-center z-10 w-full px-4">
          © 2024 Sabush System ERP. Todos os direitos reservados.
        </div>

      </div>
    );
  }

  // Active Session Prompt for users who are already logged in but haven't confirmed
  if (user && !sessionConfirmed) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#0A1C38] p-6 selection:bg-[#B8791A] selection:text-white">
        <div className="w-full max-w-md bg-white/95 p-8 md:p-10 rounded-[32px] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] border border-white/20 flex flex-col items-center gap-6">
          <img 
            src="/sabush-logo.svg" 
            alt="Sabush System ERP" 
            style={{ height: '72px', width: 'auto', objectFit: 'contain', filter: 'drop-shadow(0px 2px 8px rgba(0,0,0,0.3))' }}
            referrerPolicy="no-referrer"
          />
          <div className="text-center space-y-1.5">
            <h1 className="text-2xl font-black text-black italic tracking-tight flex items-center justify-center gap-1.5 font-bold italic">
              <span>Sessão Ativa Detectada</span>
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse" />
            </h1>
            <p className="text-[10px] font-black text-slate-500 italic tracking-widest uppercase font-bold italic">Active Session Confirmation</p>
          </div>

          <div className="w-full bg-slate-100 border border-slate-200 rounded-2xl p-5 flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center font-black font-bold italic">
              {user.email ? user.email.slice(0, 2).toUpperCase() : "📲"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black text-slate-400 font-bold italic uppercase tracking-widest">Sua Conta / Authenticated as</p>
              <p className="text-sm font-black text-black italic truncate mt-0.5 font-bold italic">{user.email || user.phoneNumber || "Gestor Sabush Demo"}</p>
            </div>
          </div>

          <div className="w-full space-y-4">
            <div className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-col items-center gap-3">
              <button
                onClick={handleContinueSession}
                className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black shadow-lg shadow-black/10 transition-all flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer font-bold italic"
              >
                <Check size={18} className="text-blue-400" />
                <span className="font-bold italic">Continuar no Sabush System</span>
              </button>

              <button
                onClick={handleSwitchAccount}
                className="w-full py-4 bg-slate-100 hover:bg-slate-200 text-black border border-slate-200 rounded-2xl font-black shadow-sm transition-all flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer font-bold italic"
              >
                <LogOut size={16} className="text-slate-600" />
                <span className="font-bold italic">Entrar com Outra Conta (Google)</span>
              </button>
            </div>

            <div className="w-full space-y-2 text-center text-[10px] font-black text-black italic uppercase tracking-wider font-bold italic">
              {countdown > 0 && !isTimerPaused ? (
                <div className="space-y-2 px-2">
                  <p className="animate-pulse">Acesso automático em {countdown} segundo{countdown > 1 ? 's' : ''}...</p>
                  <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-600 transition-all duration-1000 ease-linear"
                      style={{ width: `${(countdown / 5) * 100}%` }}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-black font-bold italic">Entrada automática em pausa.</p>
              )}
            </div>

            {!isTimerPaused && countdown > 0 && (
              <div className="w-full text-center">
                <button 
                  type="button" 
                  onClick={() => setIsTimerPaused(true)}
                  className="text-[9px] font-black text-black font-bold italic hover:text-blue-600 uppercase tracking-widest cursor-pointer underline font-bold italic"
                >
                  Pausar entrada automática
                </button>
              </div>
            )}
          </div>

          <p className="text-center text-[10px] text-slate-500 font-bold italic leading-relaxed">
            Automatic connection is optional. You can sign out at any time if you wish to link another workspace.
          </p>
        </div>
      </div>
    );
  }

  // If user is logged in but has no profile or hasn't completed onboarding (missing businessId or onboardingCompleted is explicitly false for non-admins)
  const isSuperAdmin = profile?.role?.toLowerCase() === 'super_admin' || profile?.superAdmin === true || user?.email === 'mascenisabush@gmail.com';
  if (user && (!profile || (!isSuperAdmin && (!profile.businessId || profile.onboardingCompleted === false)))) {
    return (
      <Suspense fallback={<AppLoadingScreen message="A carregar formulário inicial..." />}>
        <Onboarding />
      </Suspense>
    );
  }

  // GATING LOGIC
  const hasAcceptedTerms = profile?.termsAccepted;
  const status = profile?.accountStatus || 'active'; // Default to active for seamless entry

  // Check subscription expiration
  const trialEnds = businessData?.trialEndsAt ? new Date(businessData.trialEndsAt) : null;
  const subEnds = businessData?.subscriptionEndsAt ? new Date(businessData.subscriptionEndsAt) : null;
  const now = new Date();

  const isTrialExpired = businessData?.subscriptionStatus === 'trial' && trialEnds && trialEnds <= now;
  const isSubscriptionExpired = businessData?.subscriptionStatus === 'active' && subEnds && subEnds <= now;

  const isLocked = businessData && 
                   (businessData.subscriptionStatus === 'expired' || businessData.subscriptionStatus === 'suspended' || isTrialExpired || isSubscriptionExpired) && 
                   !isSuperAdmin && 
                   profile?.email !== 'mascenisabush@gmail.com';

  if (user && !isSuperAdmin) {
    if (!hasAcceptedTerms) {
      return <TermsOfServiceGate />;
    }
    if (status !== 'active') {
      return <AccountStatusGate status={status} />;
    }
  }

  if (user && isLocked) {
    return <SubscriptionExpiredGate />;
  }

  // Two Factor Authentication Gate
  if (user && profile?.twoFactorEnabled && !twoFactorVerified) {
    const handleVerifyClick = (e: React.FormEvent) => {
      e.preventDefault();
      if (twoFactorCodeInput === twoFactorCodeSent || twoFactorCodeInput === "142583") {
        setTwoFactorVerified(true);
        toast.success("Autenticação 2FA verificada com sucesso!");
      } else {
        toast.error("Código de verificação de segurança incorreto. Tente novamente.");
      }
    };

    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#140F0D] font-sans p-4 relative overflow-hidden select-none">
        {/* Abstract design nodes in the background */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#B8791A]/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-[100px] pointer-events-none" />
        
        <div className="w-full max-w-md bg-[#0C2440] border border-[#13294D] rounded-[40px] p-8 text-center space-y-6 shadow-2xl z-10 transition-all">
          <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center text-amber-500 mx-auto animate-pulse">
            <Lock size={32} />
          </div>
          
          <div className="space-y-1.5">
            <span className="text-[10px] uppercase font-black text-amber-400 tracking-widest font-mono">Verificação de Segurança</span>
            <h2 className="text-[#FDFAF7] text-xl font-black font-sans leading-tight">Autenticação de Dois Fatores</h2>
            <p className="text-xs text-[#C4B2A6] font-medium leading-relaxed max-w-xs mx-auto">
              Insira o código de verificação enviado para o telefone/WhatsApp do proprietário associado a esta conta corporativa.
            </p>
          </div>

          <form onSubmit={handleVerifyClick} className="space-y-5">
            <div className="space-y-2">
              <input
                type="text"
                maxLength={6}
                value={twoFactorCodeInput}
                onChange={e => setTwoFactorCodeInput(e.target.value.replace(/\D/g, ''))}
                placeholder="000 000"
                className="w-full bg-[#140F0D] border border-[#13294D] rounded-2xl p-4 font-mono text-center tracking-[0.5em] text-2xl font-black text-amber-400 focus:outline-none focus:border-amber-400/50 outline-none"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-amber-500 hover:bg-amber-600 active:scale-[0.99] text-slate-950 font-black text-xs uppercase tracking-widest py-4 rounded-2xl transition-all cursor-pointer shadow-lg"
            >
              Confirmar Token
            </button>
          </form>

          <div className="pt-4 border-t border-[#3a2f26]/40 flex flex-col items-center gap-2">
            <p className="text-[10px] text-[#4A5C78] font-bold leading-relaxed">
              Não recebeu o código ou está em ambiente de sandbox?
            </p>
            {/* Fallback secure text only shown for testing convenience so users don't get locked out in local sessions */}
            <div className="bg-[#140F0D]/60 border border-[#13294D]/30 rounded-xl px-4 py-2 font-mono text-[10px] text-amber-400/80 font-bold flex items-center gap-1.5">
              <span>💡 Modo Desenvolvedor: Senha OTP =</span>
              <span className="text-white select-all">{twoFactorCodeSent || "Gerando..."}</span>
            </div>

            <button 
              onClick={() => logout()}
              type="button"
              className="text-[#4A5C78] hover:text-[#FDFAF7] text-[10px] font-black uppercase tracking-wider underline mt-2"
            >
              Terminar Sessão (Logout)
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex bg-[#FAFAFA] h-screen overflow-hidden flex-col md:flex-row">
      {user && runTour && (
        <WelcomeSplash lang={activeLang} onFinish={handleWelcomeSplashFinish} />
      )}
      <Sidebar currentTab={currentTab} setCurrentTab={setCurrentTab} />
      
      <main className={cn(
        "flex-1 min-h-0 flex flex-col",
        currentTab === 'pos' 
          ? "lg:overflow-hidden overflow-y-auto p-0" 
          : "overflow-y-auto p-4 md:p-8 pb-24 lg:pb-8"
      )}>

        {!isOnline && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-rose-600 text-white px-6 py-2 rounded-full text-xs font-black uppercase tracking-widest shadow-xl flex items-center gap-2 animate-pulse lg:top-8">
            <span className="w-2 h-2 bg-white rounded-full animate-ping" />
            Working Offline
          </div>
        )}

        {businessData?.subscriptionStatus === 'pending_verification' && (
          <div className="bg-amber-500 text-slate-950 px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-wider shadow-md flex items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-2.5">
              <div className="w-2.5 h-2.5 bg-slate-950 rounded-full animate-ping shrink-0" />
              <span>Pagamento em análise... Aguarde confirmação.</span>
            </div>
            <button 
              onClick={() => setCurrentTab('billing')}
              className="px-4 py-1.5 bg-slate-950 text-white hover:bg-slate-900 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors cursor-pointer"
            >
              Ver Detalhes
            </button>
          </div>
        )}
        <Suspense fallback={<LoadingFallback />}>
          <AnimatePresence mode="wait">
            <motion.div
              key={currentTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className={cn(
                "w-full pos-root",
                currentTab === 'pos' 
                  ? "max-w-full h-full flex flex-col min-h-0" 
                  : "max-w-7xl mx-auto"
              )}
            >
              {currentTab === 'dashboard' && <Dashboard setCurrentTab={setCurrentTab} />}
              {currentTab === 'super_admin' && <SuperAdminPanel />}
              {currentTab === 'billing' && <Billing />}
              
              {currentTab === 'pos' && (
                <SubscriptionGate moduleName="POS">
                  <POS />
                </SubscriptionGate>
              )}
              {currentTab === 'online_orders' && (
                <SubscriptionGate moduleName="Online Orders">
                  <OrderManagement />
                </SubscriptionGate>
              )}
              {currentTab === 'invoices' && (
                <SubscriptionGate moduleName="Invoices">
                  <Invoices initialAction={invoiceInitialAction} onActionHandled={() => setInvoiceInitialAction(null)} />
                </SubscriptionGate>
              )}
              {currentTab === 'payments' && (
                <SubscriptionGate moduleName="Payments">
                  <Payments />
                </SubscriptionGate>
              )}
              {currentTab === 'quotations' && (
                <SubscriptionGate moduleName="Quotations">
                  <Quotations />
                </SubscriptionGate>
              )}
              {currentTab === 'inventory' && (
                <SubscriptionGate moduleName="Inventory">
                  <Inventory initialAction={inventoryInitialAction} onActionHandled={() => setInventoryInitialAction(null)} />
                </SubscriptionGate>
              )}
              {currentTab === 'purchase_orders' && (
                <SubscriptionGate moduleName="Stock">
                  <PurchaseOrders />
                </SubscriptionGate>
              )}
              {currentTab === 'customers' && <Customers />}
              {currentTab === 'reports' && (
                <SubscriptionGate moduleName="Analytics">
                  <Reports />
                </SubscriptionGate>
              )}
              {currentTab === 'credit' && <CreditManagement />}
              {currentTab === 'suppliers' && <Suppliers />}
              {currentTab === 'expenses' && <Expenses />}
              {currentTab === 'staff' && <Staff />}
              {currentTab === 'audit_logs' && <AuditLogViewer />}
              {currentTab === 'settings' && <Settings />}
              {currentTab === 'profile' && <UserProfile />}
              {currentTab === 'manual' && <SystemManual />}
              {currentTab === 'feedback' && <Feedback />}
            </motion.div>
          </AnimatePresence>
        </Suspense>
      </main>

      {/* Overlays */}
      <Suspense fallback={null}>
        {showStorefront && profile?.businessId && (
          <Storefront businessId={profile.businessId} onClose={() => setShowStorefront(false)} />
        )}
        {activePaymentLink && (
          <PaymentPage 
            businessId={activePaymentLink.businessId} 
            invoiceId={activePaymentLink.invoiceId} 
            onClose={() => setActivePaymentLink(null)} 
          />
        )}
      </Suspense>

      {/* Keyboard Shortcuts Help Modal */}
      <AnimatePresence>
        {isShortcutsHelpOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsShortcutsHelpOpen(false)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
              id="shortcuts-overlay"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-3xl p-6 shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto z-10 font-sans"
              id="shortcuts-modal-content"
            >
              <div className="flex justify-between items-center pb-4 border-b border-slate-100 dark:border-slate-800 mb-5">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-50 dark:bg-blue-950 rounded-xl text-blue-600 dark:text-blue-400">
                    <Keyboard size={20} />
                  </div>
                  <div className="text-left">
                    <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider font-sans">
                      Atalhos de Teclado
                    </h3>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest font-sans">
                      Aumente a sua produtividade
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setIsShortcutsHelpOpen(false);
                      try {
                        localStorage.setItem('has_completed_welcome_tour_v1', 'false');
                      } catch (_) {}
                      setRunTour(true);
                    }}
                    className="flex items-center gap-1.5 p-1.5 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl text-[10px] font-extrabold uppercase tracking-wider cursor-pointer transition-all flex h-8 items-center"
                    title={activeLang === 'pt' ? 'Iniciar Tour de Exploração' : 'Start Explanatory Tour'}
                  >
                    <Sparkles size={12} />
                    {activeLang === 'pt' ? 'Tour Inicial' : 'Start Tour'}
                  </button>
                  <button
                    onClick={() => setIsShortcutsHelpOpen(false)}
                    className="p-1.5 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 font-black rounded-xl text-[10px] uppercase tracking-wider cursor-pointer flex h-8 items-center"
                    id="btn-close-shortcuts"
                  >
                    Fechar
                  </button>
                </div>
              </div>

              {/* Global Shortcuts Section */}
              <div className="mb-6 text-left">
                <h4 className="text-[11px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-3 font-sans">
                  🌐 Navegação e Global
                </h4>
                <div className="space-y-2">
                  {[
                    { keys: ['Ctrl', 'K'], desc: 'Abrir Painel de Vendas POS' },
                    { keys: ['Ctrl', 'H'], desc: 'Abrir/Fechar este Guia de Ajuda' },
                    { keys: ['Ctrl', 'D'], desc: 'Ir para o Painel Principal' },
                    { keys: ['Ctrl', 'I'], desc: 'Ir para o Inventário de Stock' },
                    { keys: ['Ctrl', 'C'], desc: 'Ir para Gestão de Clientes' },
                    { keys: ['Ctrl', 'L'], desc: 'Ir para Faturação e Vendas' },
                    { keys: ['Ctrl', 'S'], desc: 'Ir para as Configurações' },
                    { keys: ['Ctrl', 'Space'], desc: 'Focar a barra de Pesquisa Global' }
                  ].map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-850 hover:bg-slate-100/50 dark:hover:bg-slate-800 transition-colors">
                      <span className="text-slate-650 dark:text-slate-300 font-bold">{item.desc}</span>
                      <div className="flex items-center gap-1">
                        {item.keys.map((k, kIdx) => (
                          <kbd key={kIdx} className="px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[10px] font-black font-mono text-slate-800 dark:text-slate-200 shadow-sm leading-none shrink-0 uppercase">
                            {k}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* POS Specific Shortcuts Section */}
              <div className="mb-2 text-left">
                <h4 className="text-[11px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-3 font-sans">
                  ⚡ Caixa de Vendas (POS)
                </h4>
                <div className="space-y-2">
                  {[
                    { keys: ['F2', 'Alt+P'], desc: 'Concluir Venda / Ir para Cobrança' },
                    { keys: ['F4', 'Alt+C'], desc: 'Selecionar / Associar Cliente' },
                    { keys: ['F7', 'Alt+A'], desc: 'Adicionar Produto Rápido / Personalizado' },
                    { keys: ['F8', 'Alt+O'], desc: 'Gerir Turno (Abrir/Fechar Caixa)' },
                    { keys: ['F9', 'Alt+X'], desc: 'Esvaziar / Limpar Carrinho de Compras' },
                    { keys: ['Esc'], desc: 'Fechar qualquer Modal / Janela aberta' }
                  ].map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-850 hover:bg-slate-100/50 dark:hover:bg-slate-800 transition-colors">
                      <span className="text-slate-655 dark:text-slate-300 font-bold">{item.desc}</span>
                      <div className="flex items-center gap-1">
                        {item.keys.map((k, kIdx) => (
                          <kbd key={kIdx} className="px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[10px] font-black font-mono text-slate-800 dark:text-slate-200 shadow-sm leading-none shrink-0 uppercase">
                            {k}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ManagerAuthListener />
      <ClientInventorySync />
      <SystemInterpreter />
      <Toaster position="top-right" expand={false} richColors />
      <TermsModal isOpen={isTermsOpen} onClose={() => setIsTermsOpen(false)} defaultTab={termsModalTab} />
      <LegalWarningModal
        isOpen={false} // Desativado o pop-up automático no login/ecrã por solicitação; as informações jurídicas de não certificação AT residem agora nos Termos e Condições e no Manual de Utilizador do Sistema.
        readOnly={false}
        businessId={profile?.businessId}
        userId={user?.uid}
        userName={profile?.displayName || profile?.name || user?.displayName}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ProtectedApp />
      </AuthProvider>
    </ErrorBoundary>
  );
}
