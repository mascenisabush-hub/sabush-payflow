import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { 
  LayoutDashboard, ReceiptText, Box, Users, CreditCard, Settings, LogOut, 
  Menu, X, Languages, ShoppingCart, FileSearch, Truck, ShoppingBag, 
  ShieldCheck, AlertCircle, Zap, ShieldAlert, DollarSign, Plus, BookOpen, 
  MessageSquare, ClipboardList, BarChart3, ChevronDown, Minimize2, 
  Maximize2, Keyboard, ListChecks, HelpCircle, Share
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import GlobalSearch from './GlobalSearch';
import Notifications from './Notifications';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
}

function DailyTasks() {
  const { t } = useTranslation();
  const INITIAL_TASKS = [
    { id: 'pos_sale', label: t('pos_sale_task') || 'Realizar uma Venda no POS', completed: false },
    { id: 'add_product', label: t('add_product_task') || 'Adicionar Artigo ao Inventário', completed: false },
    { id: 'create_invoice', label: t('create_invoice_task') || 'Criar uma Fatura de Venda', completed: false },
    { id: 'record_payment', label: t('record_payment_task') || 'Registar Pagamento de Conta', completed: false }
  ];
  
  const [tasks, setTasks] = React.useState<any[]>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = window.localStorage.getItem('daily_tasks');
        if (saved) return JSON.parse(saved);
      }
    } catch (e) {
      console.warn("Error reading tasks from storage", e);
    }
    return INITIAL_TASKS;
  });
  
  const [isOpen, setIsOpen] = React.useState(false);
  
  React.useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('daily_tasks', JSON.stringify(tasks));
      }
    } catch (e) {
      console.warn("Error saving tasks to storage", e);
    }
  }, [tasks]);

  const toggleTask = (id: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const completedCount = tasks.filter(t => t.completed).length;
  const progressPercent = Math.round((completedCount / tasks.length) * 100);

  return (
    <div className="relative">
      <button
        onClick={() => {
          setIsOpen(!isOpen);
        }}
        className="relative p-2 rounded-xl bg-[#06142A] hover:bg-[#0A1C38] text-white/80 hover:text-white transition-all flex items-center justify-center focus:outline-none cursor-pointer w-9 h-9 border border-white/10"
        title="Objetivos do Dia"
      >
        <ListChecks size={16} />
        {completedCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#B8791A] text-white rounded-full text-[9px] font-black flex items-center justify-center leading-none shadow-md animate-pulse">
            {completedCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 bottom-12 md:bottom-auto md:top-12 mt-2 w-80 bg-[#06142A] border border-white/15 rounded-2xl shadow-xl overflow-hidden z-50 p-5 text-left text-white"
            >
              <div className="flex justify-between items-center mb-4">
                <span className="text-[10px] font-black uppercase text-white/60 tracking-wider">Objetivos de Hoje</span>
                <span className="text-[9px] font-extrabold bg-[#B8791A]/20 text-[#B8791A] px-2.5 py-1 rounded-full uppercase tracking-widest">
                  {completedCount}/{tasks.length} Concluídos
                </span>
              </div>

              <div className="mb-4">
                <div className="w-full bg-[#041615] h-1.5 rounded-full overflow-hidden">
                  <motion.div
                    className="bg-[#B8791A] h-full rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPercent}%` }}
                    transition={{ type: 'spring', stiffness: 80 }}
                  />
                </div>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                {tasks.map(task => (
                  <label key={task.id} className="flex items-start gap-2.5 p-2 rounded-xl hover:bg-white/10 transition-colors cursor-pointer text-xs select-none">
                    <input
                      type="checkbox"
                      checked={task.completed}
                      onChange={() => toggleTask(task.id)}
                      className="mt-0.5 rounded border-white/20 bg-[#041615] text-[#B8791A] focus:ring-[#B8791A]/20 focus:ring-offset-[#06142A] focus:ring-2 w-4 h-4 cursor-pointer"
                    />
                    <span className={cn(task.completed ? "text-white/40 line-through" : "text-white font-bold")}>
                      {task.label}
                    </span>
                  </label>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Sidebar({ currentTab, setCurrentTab }: SidebarProps) {
  const { logout, profile, businessData, updateProfile } = useAuth();
  const { t, i18n } = useTranslation();
  
  const [isMobileOpen, setIsMobileOpen] = React.useState(false);
  const [isFullscreen, setIsFullscreen] = React.useState(!!document.fullscreenElement);
  const [hasOpenedShortcuts, setHasOpenedShortcuts] = React.useState(() => {
    try {
      return localStorage.getItem('has_opened_shortcuts_guide') === 'true';
    } catch (_) {
      return false;
    }
  });

  React.useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
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
      console.error("Error attempting full screen:", err);
      toast.error("Não foi possível alterar o modo de tela cheia.");
    }
  };

  const handleShortcutsHelpClick = () => {
    window.dispatchEvent(new CustomEvent('toggle-keyboard-shortcuts'));
    if (!hasOpenedShortcuts) {
      try {
        localStorage.setItem('has_opened_shortcuts_guide', 'true');
      } catch (_) {}
      setHasOpenedShortcuts(true);
    }
  };

  const handleShare = async () => {
    const shareData = {
      title: 'Sabush System ERP',
      text: 'Aceda ao Sabush System ERP - Gestão e Facturação para PMEs',
      url: window.location.href
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        toast.success("Link partilhado com sucesso!");
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error("Error sharing:", err);
          toast.error("Falha ao partilhar ligação.");
        }
      }
    } else {
      try {
        await navigator.clipboard.writeText(window.location.href);
        toast.success("Link copiado para a área de transferência!");
      } catch (err) {
        console.error("Copy failed:", err);
        toast.error("Não foi possível copiar o link.");
      }
    }
  };

  const isSuperAdmin = profile?.role?.toLowerCase() === 'super_admin' || profile?.superAdmin === true || profile?.email === 'mascenisabush@gmail.com';

  const [pendingProofsCount, setPendingProofsCount] = useState(0);

  useEffect(() => {
    if (!isSuperAdmin) return;
    const q = query(collection(db, 'subscription_proofs'), where('status', '==', 'pending'));
    const unsub = onSnapshot(q, (snapshot) => {
      setPendingProofsCount(snapshot.size);
    }, (err) => console.log("Silent error in Sidebar pendingProofs onSnapshot:", err));
    return () => unsub();
  }, [isSuperAdmin]);

  // Specific high contrast bright colors for Navy sidebar icons
  const iconColors: Record<string, string> = {
    dashboard: 'text-[#3B82F6]',     // Electric Blue
    reports: 'text-[#8B5CF6]',       // Violet / Purple
    pos: 'text-[#10B981]',           // Green
    online_orders: 'text-[#F59E0B]', // Gold
    invoices: 'text-[#06B6D4]',      // Cyan
    payments: 'text-[#F59E0B]',      // Gold/Amber
    credit: 'text-[#EF4444]',        // Red
    quotations: 'text-[#EC4899]',    // Pink
    inventory: 'text-[#F59E0B]',     // Gold/Amber
    purchase_orders: 'text-[#6366F1]',// Indigo
    customers: 'text-[#84CC16]',     // Lime
    expenses: 'text-[#F43F5E]',      // Rose
    suppliers: 'text-[#D946EF]',     // Fuchsia
    staff: 'text-[#14B8A6]',         // Teal
    feedback: 'text-[#E2E8F0]',      // Slate Light
    manual: 'text-[#38BDF8]',        // Sky
    settings: 'text-[#94A3B8]',      // Slate Medium
    super_admin: 'text-[#A855F7]',   // Purple Light
    audit_logs: 'text-[#F43F5E]',    // Rose
  };

  const badgeStyles: Record<string, { bg: string, text: string }> = {
    dashboard: { bg: 'rgba(26,115,196,0.18)', text: '#0A1C38' },
    reports: { bg: 'rgba(245,158,11,0.18)', text: '#F59E0B' },
    pos: { bg: 'rgba(16,185,129,0.18)', text: '#10B981' },
    online_orders: { bg: 'rgba(16,185,129,0.18)', text: '#10B981' },
    invoices: { bg: 'rgba(59,130,246,0.18)', text: '#3B82F6' },
    payments: { bg: 'rgba(245,158,11,0.18)', text: '#F59E0B' },
    credit: { bg: 'rgba(239,68,68,0.18)', text: '#EF4444' },
    quotations: { bg: 'rgba(245,158,11,0.18)', text: '#F59E0B' },
    inventory: { bg: 'rgba(139,92,246,0.18)', text: '#8B5CF6' },
    purchase_orders: { bg: 'rgba(139,92,246,0.18)', text: '#8B5CF6' },
    customers: { bg: 'rgba(6,182,212,0.18)', text: '#06B6D4' },
    expenses: { bg: 'rgba(239,68,68,0.18)', text: '#EF4444' },
    suppliers: { bg: 'rgba(245,158,11,0.18)', text: '#F59E0B' },
    staff: { bg: 'rgba(6,182,212,0.18)', text: '#06B6D4' },
    settings: { bg: 'rgba(107,143,168,0.18)', text: '#6B8FA8' },
    super_admin: { bg: 'rgba(26,115,196,0.18)', text: '#0A1C38' },
    manual: { bg: 'rgba(107,143,168,0.18)', text: '#6B8FA8' },
    feedback: { bg: 'rgba(239,68,68,0.18)', text: '#EF4444' },
    audit_logs: { bg: 'rgba(239,68,68,0.18)', text: '#EF4444' },
  };

  const menuItems = [
    { id: 'dashboard', label: t('dashboard') || 'Painel', icon: LayoutDashboard },
    { id: 'reports', label: t('reports') || 'Análises e Estatísticas', icon: BarChart3 },
    { id: 'pos', label: t('pos_system') || 'Sistema POS', icon: ShoppingCart },
    { id: 'online_orders', label: t('online_orders') || 'Encomendas Online', icon: ShoppingBag },
    { id: 'invoices', label: t('invoices') || 'Faturas', icon: ReceiptText },
    { id: 'payments', label: t('record_payment') || 'Registar Pagamento', icon: DollarSign },
    { id: 'credit', label: t('debt_management') || 'Gestão de Dívidas', icon: AlertCircle },
    { id: 'quotations', label: t('quotations') || 'Cotações', icon: FileSearch },
    { id: 'inventory', label: t('inventory') || 'Inventário', icon: Box },
    { id: 'purchase_orders', label: t('purchase_orders') || 'Ordens de Compra', icon: ClipboardList },
    { id: 'customers', label: t('customers') || 'Clientes', icon: Users },
    { id: 'expenses', label: t('expenses') || 'Despesas', icon: CreditCard },
    { id: 'suppliers', label: t('suppliers') || 'Fornecedores', icon: Truck },
    { id: 'staff', label: 'Equipa', icon: Users },
    { id: 'audit_logs', label: 'Registo de Auditoria', icon: ShieldAlert },
    { id: 'settings', label: t('settings') || 'Configurações', icon: Settings },
  ];

  const adminItems = isSuperAdmin ? [
    { id: 'super_admin', label: 'Super Admin', icon: ShieldCheck },
  ] : [];

  const languages = [
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'sw', name: 'Swahili', flag: '🇰🇪' },
    { code: 'pt', name: 'Português', flag: '🇲🇿' }
  ];

  const handleTabChange = (tabId: string) => {
    setCurrentTab(tabId);
    setIsMobileOpen(false); // Close sidebar overlay on mobile
  };

  return (
    <>
      {/* MOBILE TOP navbar header (Visible only on small devices) */}
      <header className="flex md:hidden items-center justify-between px-4 py-3 bg-[#0A1C38] border-b border-white/10 text-white w-full shrink-0 z-40 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsMobileOpen(true)}
            className="p-2 -ml-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors focus:outline-none"
            aria-label="Abrir Menu"
          >
            <Menu size={20} />
          </button>
          
          <div 
            onClick={() => handleTabChange('dashboard')}
            className="flex items-center gap-2 cursor-pointer select-none"
          >
            {businessData?.logoUrl ? (
              <img src={businessData.logoUrl} alt="Logo" className="w-8 h-8 rounded-lg object-contain bg-white p-0.5" />
            ) : (
              <img 
                src="/sabush-logo.svg" 
                alt="Sabush Logo" 
                style={{ height: '35px', width: 'auto', objectFit: 'contain' }} 
                className="brightness-200 invert"
                referrerPolicy="no-referrer" 
              />
            )}
            <span className="font-extrabold text-white text-sm tracking-tight">{businessData?.name || 'Sabush System'}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Notifications />
          <div 
            onClick={() => handleTabChange('profile')}
            className="w-8 h-8 rounded-lg bg-[#B8791A] flex items-center justify-center text-white font-black text-xs cursor-pointer shadow-sm hover:bg-amber-600 transition-colors"
            title="Ver Perfil"
          >
            {profile?.displayName?.[0] || 'U'}
          </div>
        </div>
      </header>

      {/* MOBILE SIDEBAR PANEL OVERLAY BLACK BACKGROUND */}
      {isMobileOpen && (
        <div 
          onClick={() => setIsMobileOpen(false)} 
          className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-sm md:hidden transition-opacity border-none"
        />
      )}

      {/* MASTER SIDEBAR: Pinned on Left on Desktop, slide-over from Left on Mobile */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-72 bg-[#0A1C38] border-r border-white/10 flex flex-col justify-between transition-transform duration-300 transform md:relative md:translate-x-0 shrink-0 h-screen select-none",
        isMobileOpen ? "translate-x-0 animate-in slide-in-from-left duration-250" : "-translate-x-full md:translate-x-0"
      )}>
        <div className="flex flex-col h-full overflow-hidden">
          
          {/* Brand/Branding Section (Pristine Header) */}
          <div className="p-5 flex items-center justify-between border-b border-white/10">
            <div 
              onClick={() => handleTabChange(isSuperAdmin ? 'super_admin' : 'dashboard')}
              className="flex items-center gap-3 cursor-pointer hover:opacity-90 transition-opacity"
            >
              {businessData?.logoUrl ? (
                <img src={businessData.logoUrl} alt="Logo" className="w-9 h-9 rounded-lg object-contain bg-white p-0.5" />
              ) : (
                <img 
                  src="/sabush-logo.svg" 
                  alt="Sabush Logo" 
                  style={{ height: '35px', width: 'auto', objectFit: 'contain' }} 
                  className="brightness-200 invert"
                  referrerPolicy="no-referrer" 
                />
              )}
              <div className="flex flex-col leading-none">
                <span className="font-extrabold text-white text-[13px] tracking-tight uppercase">{businessData?.name || 'Sabush System'}</span>
                <span className="text-[9px] text-amber-400 normal-case mt-1 font-bold">Sabor & Gestão</span>
              </div>
            </div>

            {/* Mobile Close Button */}
            <button
              onClick={() => setIsMobileOpen(false)}
              className="md:hidden p-1.5 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-all"
            >
              <X size={16} />
            </button>
          </div>

          {/* Core Search Utility inside sidebar for quick access */}
          <div className="px-4 py-2.5 mt-3 mb-1" id="sidebar-search-container">
            <GlobalSearch setCurrentTab={setCurrentTab} />
          </div>

          {/* Navigation Links list (With dynamic scrollbar) */}
          <nav className="flex-1 overflow-y-auto py-3 custom-scrollbar space-y-1 select-none">
            
            <p className="text-[9px] font-bold tracking-[0.1em] uppercase text-blue-200/65 mt-1" style={{ padding: '12px 14px 6px' }}>Módulos ERP</p>
            
            {(() => {
              const userRole = (profile?.role || '').toLowerCase();
              const filteredMenuItems = menuItems.filter(item => {
                if (userRole === 'caixa' || userRole === 'cashier') {
                  return ['pos'].includes(item.id);
                }
                if (userRole === 'gestor' || userRole === 'manager') {
                  return !['staff', 'settings'].includes(item.id);
                }
                return true;
              });
              return filteredMenuItems.map((item) => {
                const isActive = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleTabChange(item.id)}
                    className={cn(
                      "group w-[calc(100%-24px)] mx-3 flex items-center justify-between px-3 py-2.5 mb-0.5 rounded-lg text-[13px] font-bold leading-none transition-all duration-150 cursor-pointer tracking-normal normal-case",
                      isActive 
                        ? "bg-[#B8791A] text-white shadow-md" 
                        : "text-[#E3F4F2]/90 hover:bg-white/10 hover:text-white"
                    )}
                    id={`sidebar-nav-${item.id}`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-[20px] h-[20px] flex items-center justify-center shrink-0">
                        <item.icon 
                          size={14} 
                          className={cn(
                            "shrink-0 transition-colors",
                            isActive ? "text-white" : "text-[#E3F4F2]/80 group-hover:text-white"
                          )}
                        />
                      </div>
                      <span className="leading-none">{item.label}</span>
                    </div>
                  </button>
                );
              });
            })()}

            {/* Render any premium super admin buttons */}
            {adminItems.length > 0 && (
              <>
                <div className="h-px bg-white/10 mt-5 mb-4 mx-4" />
                <p className="text-[9px] font-bold tracking-[0.1em] uppercase text-blue-200/65" style={{ padding: '12px 14px 6px' }}>Painel de Controlo</p>
                {adminItems.map((item) => {
                  const isActive = currentTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleTabChange(item.id)}
                      className={cn(
                        "group w-[calc(100%-24px)] mx-3 flex items-center justify-between px-3 py-2.5 mb-0.5 rounded-lg text-[13px] font-bold leading-none transition-all duration-150 cursor-pointer tracking-normal normal-case",
                        isActive 
                          ? "bg-[#B8791A] text-white shadow-md" 
                          : "text-[#E3F4F2]/90 hover:bg-white/10 hover:text-white"
                      )}
                      id={`sidebar-nav-${item.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-[20px] h-[20px] flex items-center justify-center shrink-0">
                          <item.icon 
                            size={14} 
                            className={cn(
                              "shrink-0 transition-colors",
                              isActive ? "text-white" : "text-[#E3F4F2]/80 group-hover:text-white"
                            )}
                          />
                        </div>
                        <span className="leading-none">{item.label}</span>
                      </div>
                      {item.id === 'super_admin' && pendingProofsCount > 0 && (
                        <span className="bg-red-600 text-white rounded-full px-2 py-0.5 text-[9px] font-black leading-none animate-pulse">
                          {pendingProofsCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </>
            )}

            {/* Support and Documents Menu */}
            <div className="h-px bg-white/10 mt-5 mb-4 mx-4" />
            <p className="text-[9px] font-bold tracking-[0.1em] uppercase text-blue-200/65" style={{ padding: '12px 14px 6px' }}>Suporte & Guias</p>
            
            {[
              { id: 'manual', label: 'Manual de Sistema', icon: HelpCircle },
              { id: 'feedback', label: 'Relatar Erro / Feedback', icon: MessageSquare }
            ].map((item) => {
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleTabChange(item.id)}
                  className={cn(
                    "group w-[calc(100%-24px)] mx-3 flex items-center px-3 py-2.5 mb-0.5 rounded-lg text-[13px] font-bold leading-none transition-all duration-150 cursor-pointer tracking-normal normal-case",
                    isActive 
                      ? "bg-[#B8791A] text-white shadow-md" 
                      : "text-[#E3F4F2]/90 hover:bg-white/10 hover:text-white"
                  )}
                  id={`sidebar-nav-${item.id}`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-[20px] h-[20px] flex items-center justify-center shrink-0">
                      <item.icon 
                        size={14} 
                        className={cn(
                          "shrink-0 transition-colors",
                          isActive ? "text-white" : "text-[#E3F4F2]/80 group-hover:text-white"
                        )}
                      />
                    </div>
                    <span className="leading-none">{item.label}</span>
                  </div>
                </button>
              );
            })}

          </nav>

          {/* Quick Utility Tools block */}
          <div className="bg-[#031C36]/30 border-t border-white/10 py-3 px-3">
            
            {/* Action Row for Keyboard Shortcuts, Fullscreen, etc */}
            <div className="flex items-center justify-between gap-1.5 px-1 py-1 mb-2">
              <button
                id="btn-global-fullscreen-toggle"
                onClick={toggleFullscreen}
                className="p-1.5 rounded-xl bg-[#0A1C38] hover:bg-[#06142A] text-white transition-all flex items-center justify-center focus:outline-none cursor-pointer border-none h-8 flex-1 animate-none"
                title={isFullscreen ? "Sair da Tela Cheia" : "Modo Tela Cheia"}
              >
                {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              </button>
 
              <button
                id="btn-global-share text-share"
                onClick={handleShare}
                className="p-1.5 rounded-xl bg-[#0A1C38] hover:bg-[#06142A] text-white transition-all flex items-center justify-center focus:outline-none cursor-pointer border-none h-8 flex-1 animate-none"
                title="Partilhar Ligação / URL"
              >
                <Share size={13} />
              </button>
              
              <button
                id="btn-global-shortcuts-help"
                onClick={handleShortcutsHelpClick}
                className="relative p-1.5 rounded-xl bg-[#0A1C38] hover:bg-[#06142A] text-white transition-all flex items-center justify-center focus:outline-none cursor-pointer border-none h-8 flex-1 animate-none"
                title="Atalhos do Teclado (Ctrl+H)"
              >
                <Keyboard size={13} />
                {!hasOpenedShortcuts && (
                  <span className="absolute top-0.5 right-0.5 flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-400"></span>
                  </span>
                )}
              </button>

              <div className="flex-1 flex justify-center">
                <DailyTasks />
              </div>

              <div className="flex-1 flex justify-center">
                <Notifications />
              </div>
            </div>

            {/* Quick Language flags */}
            <div className="flex items-center justify-around gap-1 p-1 bg-white/10 border border-white/5 rounded-xl mb-2">
              {languages.map((lang) => {
                const isSelected = i18n.language === lang.code;
                return (
                  <button
                    key={lang.code}
                    onClick={async () => {
                      i18n.changeLanguage(lang.code);
                      if (updateProfile) {
                        await updateProfile({ preferredLanguage: lang.code });
                      }
                      toast.success(
                        lang.code === 'pt' 
                          ? `Idioma: ${lang.name} ${lang.flag}` 
                          : `Language: ${lang.name} ${lang.flag}`
                      );
                    }}
                    className={cn(
                      "w-7 h-7 flex items-center justify-center rounded-lg text-xs font-black transition-all outline-none cursor-pointer",
                      isSelected 
                        ? "bg-[#B8791A] text-white border border-[#B8791A]/30 shadow-xs" 
                        : "text-blue-100 border border-transparent hover:bg-white/10 hover:text-white"
                    )}
                    title={lang.name}
                  >
                    <span className="text-sm leading-none">{lang.flag}</span>
                  </button>
                );
              })}
            </div>
 
            {/* LOGGED-IN USER FOOTER INFO */}
            <div className="pt-2 pb-1 flex items-center justify-between text-left" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <div 
                onClick={() => handleTabChange('profile')}
                className="flex items-center gap-2 cursor-pointer hover:opacity-85 select-none min-w-0 flex-1 mr-2"
                title="Meu Perfil"
              >
                <div className="w-[26px] h-[26px] rounded-full bg-[#B8791A] text-white font-black text-[10px] flex items-center justify-center shrink-0">
                  {profile?.displayName?.[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex flex-col leading-none min-w-0">
                  <span className="text-[11px] font-bold text-white truncate">{profile?.displayName || 'Usuário Sabush'}</span>
                  <span className="text-[9px] text-amber-400 mt-1 font-bold truncate">{profile?.role?.replace('_', ' ') || 'COLABORADOR'}</span>
                </div>
              </div>

              {/* Logout Action */}
              <button
                onClick={() => {
                  logout();
                  toast.success("Sessão terminada no Sabush ERP.");
                }}
                className="p-2 rounded-xl text-white/80 hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer"
                title="Terminar Sessão (Logout)"
              >
                <LogOut size={15} />
              </button>
            </div>

          </div>

        </div>
      </aside>
    </>
  );
}
