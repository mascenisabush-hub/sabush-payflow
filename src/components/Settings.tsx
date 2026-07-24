import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, updateDoc, setDoc, serverTimestamp, collection, query, orderBy, getDocs, onSnapshot } from 'firebase/firestore';
import { runDatabaseBackup } from '../utils/backupService';
import { useTranslation } from 'react-i18next';
import { Settings as SettingsIcon, Building, MessageSquare, Webhook, Globe, Save, Loader2, ShieldCheck, Bell, Smartphone, AlertCircle, Printer, Wifi, Database, Lock, RefreshCw, Palette, Sun, Moon, Laptop, Type, MapPin, Trash2, Plus, Play, Terminal, CheckCircle2, XCircle, Info, ChevronRight, CreditCard, Scale, ArrowLeft, ChevronDown, ChevronUp, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { cn, getBrandTints } from '../lib/utils';
import { printTestPageHTML } from '../lib/printService';
import { SUPPORTED_CURRENCIES, fetchLiveExchangeRates } from '../lib/currencies';
import { getCountryPaymentMethods } from '../lib/paymentMethods';
import LegalWarningModal from './LegalWarningModal';
import ManagerPINModal from './ManagerPINModal';
import { AFRICAN_COUNTRIES } from '../lib/africanCountries';

const AFRICAN_TIMEZONES = [
  { value: 'Africa/Maputo', label: 'Maputo, Moçambique (CAT, UTC+2)', country: 'Moçambique' },
  { value: 'Africa/Luanda', label: 'Luanda, Angola (WAT, UTC+1)', country: 'Angola' },
  { value: 'Africa/Johannesburg', label: 'Johannesburg, África do Sul (SAST, UTC+2)', country: 'África do Sul' },
  { value: 'Africa/Nairobi', label: 'Nairobi, Quénia (EAT, UTC+3)', country: 'Quénia / Tanzânia / Uganda' },
  { value: 'Africa/Lagos', label: 'Lagos, Nigéria (WAT, UTC+1)', country: 'Nigéria / Camarões' },
  { value: 'Africa/Abidjan', label: 'Abidjan, Costa do Marfim (GMT, UTC+0)', country: 'Costa do Marfim / Gana' },
  { value: 'Africa/Bissau', label: 'Bissau, Guiné-Bissau (GMT, UTC+0)', country: 'Guiné-Bissau' },
  { value: 'Africa/Praia', label: 'Praia, Cabo Verde (CVT, UTC-1)', country: 'Cabo Verde' },
  { value: 'Africa/Sao_Tome', label: 'São Tomé, São Tomé e Príncipe (GMT, UTC+0)', country: 'São Tomé e Príncipe' },
  { value: 'Africa/Harare', label: 'Harare, Zimbábue (CAT, UTC+2)', country: 'Zimbábue' },
  { value: 'Africa/Casablanca', label: 'Casablanca, Marrocos (WET, UTC+0 / +1)', country: 'Marrocos' },
  { value: 'Africa/Cairo', label: 'Cairo, Egipto (EET, UTC+2)', country: 'Egipto' },
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)', country: 'Global' }
];

export default function Settings() {
  const { profile, businessData, user, updateProfile } = useAuth();
  const { t, i18n } = useTranslation();

  const isSystemAdmin = 
    profile?.role === 'owner' || 
    profile?.role === 'business_owner' || 
    profile?.role === 'admin' || 
    profile?.role === 'manager' || 
    profile?.role?.toLowerCase() === 'super_admin';

  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');

  // Legal compliance states
  const [legalAcknowledgement, setLegalAcknowledgement] = useState<any>(null);
  const [isReverOpen, setIsReverOpen] = useState(false);

  useEffect(() => {
    if (profile?.businessId) {
      const ackRef = doc(db, 'businesses', profile.businessId, 'settings', 'legalAcknowledgement');
      const unsubscribe = onSnapshot(ackRef, (snap) => {
        if (snap.exists()) {
          setLegalAcknowledgement(snap.data());
        } else {
          setLegalAcknowledgement(null);
        }
      });
      return () => unsubscribe();
    }
  }, [profile?.businessId]);

  // Backups Management States
  const [backupsList, setBackupsList] = useState<any[]>([]);
  const [fetchingBackups, setFetchingBackups] = useState(false);
  const [manualBackupLoading, setManualBackupLoading] = useState(false);

  // Database Reset and Purging States
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pendingResetAction, setPendingResetAction] = useState<'customers' | 'products' | 'sales' | 'expenses' | 'factory' | null>(null);
  const [selectedResetAction, setSelectedResetAction] = useState<'customers' | 'products' | 'sales' | 'expenses' | 'factory' | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  // Branch Management States
  const [branchesList, setBranchesList] = useState<any[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchLocation, setNewBranchLocation] = useState('');
  const [isAddingBranch, setIsAddingBranch] = useState(false);

  const fetchBranches = async () => {
    if (!profile?.businessId) return;
    setBranchesLoading(true);
    try {
      const snap = await getDocs(collection(db, 'businesses', profile.businessId, 'branches'));
      const list = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));
      setBranchesList(list);
    } catch (err) {
      console.error("Error fetching branches:", err);
    } finally {
      setBranchesLoading(false);
    }
  };

  const handleAddBranch = async () => {
    if (!profile?.businessId) return;
    if (!newBranchName.trim()) {
      toast.error("O nome da filial é obrigatório.");
      return;
    }
    setIsAddingBranch(true);
    try {
      const { collection, addDoc } = await import('firebase/firestore');
      await addDoc(collection(db, 'businesses', profile.businessId, 'branches'), {
        name: newBranchName.trim(),
        location: newBranchLocation.trim() || 'Moçambique',
        createdAt: serverTimestamp()
      });
      toast.success("Filial registada com sucesso!");
      setNewBranchName('');
      setNewBranchLocation('');
      await fetchBranches();
    } catch (err) {
      console.error("Error adding branch:", err);
      toast.error("Erro ao registar filial.");
    } finally {
      setIsAddingBranch(false);
    }
  };

  const handleDeleteBranch = async (branchId: string) => {
    if (!profile?.businessId) return;
    if (!confirm("Tem a certeza que deseja eliminar esta filial? Esta ação é irreversível.")) return;
    try {
      const { doc, deleteDoc } = await import('firebase/firestore');
      await deleteDoc(doc(db, `businesses/${profile.businessId}/branches`, branchId));
      toast.success("Filial eliminada com sucesso!");
      await fetchBranches();
    } catch (err) {
      console.error("Error deleting branch:", err);
      toast.error("Erro ao eliminar filial.");
    }
  };

  const fetchBackups = async () => {
    if (!profile?.businessId) return;
    setFetchingBackups(true);
    try {
      const q = query(
        collection(db, 'businesses', profile.businessId, 'backups'),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));
      setBackupsList(list);
    } catch (err) {
      console.error("Error fetching backups:", err);
    } finally {
      setFetchingBackups(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'backups') {
      fetchBackups();
    }
    if (activeTab === 'branches') {
      fetchBranches();
    }
  }, [activeTab, profile?.businessId]);

  const handleTriggerReset = (action: 'customers' | 'products' | 'sales' | 'expenses' | 'factory') => {
    if (!profile?.businessId) {
      toast.error("Configurações do negócio não encontradas.");
      return;
    }
    setPendingResetAction(action);
    setIsPinModalOpen(true);
  };

  const executeReset = async () => {
    if (!profile?.businessId || !pendingResetAction) return;
    setIsResetting(true);
    const toastId = toast.loading(`A processar a purga de dados (${pendingResetAction === 'factory' ? 'Reposição de Fábrica' : pendingResetAction})...`);
    
    try {
      const { collection, getDocs, deleteDoc, doc, writeBatch } = await import('firebase/firestore');
      
      const purgeCollection = async (subPath: string) => {
        const colRef = collection(db, `businesses/${profile.businessId}/${subPath}`);
        const snap = await getDocs(colRef);
        if (snap.empty) return 0;
        
        let count = 0;
        let batch = writeBatch(db);
        for (const d of snap.docs) {
          batch.delete(doc(db, `businesses/${profile.businessId}/${subPath}`, d.id));
          count++;
          if (count % 400 === 0) {
            await batch.commit();
            batch = writeBatch(db);
          }
        }
        if (count % 400 !== 0) {
          await batch.commit();
        }
        return count;
      };

      let deletedCount = 0;

      if (pendingResetAction === 'customers') {
        deletedCount += await purgeCollection('customers');
        toast.success(`Limpeza concluída! ${deletedCount} clientes removidos.`, { id: toastId });
      } else if (pendingResetAction === 'products') {
        deletedCount += await purgeCollection('products');
        deletedCount += await purgeCollection('quebras');
        toast.success(`Limpeza concluída! ${deletedCount} itens de stock e quebras removidos.`, { id: toastId });
      } else if (pendingResetAction === 'sales') {
        deletedCount += await purgeCollection('invoices');
        deletedCount += await purgeCollection('payments');
        deletedCount += await purgeCollection('payment_proofs');
        deletedCount += await purgeCollection('online_orders');
        deletedCount += await purgeCollection('pos_shifts');
        toast.success(`Limpeza concluída! ${deletedCount} registos de faturamento, pagamentos e turnos removidos.`, { id: toastId });
      } else if (pendingResetAction === 'expenses') {
        deletedCount += await purgeCollection('expenses');
        deletedCount += await purgeCollection('purchase_orders');
        deletedCount += await purgeCollection('supplier_payments');
        deletedCount += await purgeCollection('suppliers');
        toast.success(`Limpeza concluída! ${deletedCount} registos de despesas, fornecedores e compras removidos.`, { id: toastId });
      } else if (pendingResetAction === 'factory') {
        const collectionsToPurge = [
          'customers',
          'products',
          'quebras',
          'invoices',
          'payments',
          'payment_proofs',
          'online_orders',
          'pos_shifts',
          'expenses',
          'purchase_orders',
          'supplier_payments',
          'suppliers',
          'quotations',
          'notifications',
          'auth_requests'
        ];
        
        for (const col of collectionsToPurge) {
          deletedCount += await purgeCollection(col);
        }
        
        toast.success(`Reposição de Fábrica Concluída! ${deletedCount} registos totais eliminados. O seu ERP está limpo.`, { id: toastId });
      }
    } catch (error) {
      console.error("Error during data purging:", error);
      toast.error("Erro durante a limpeza de dados. Por favor, tente novamente.", { id: toastId });
    } finally {
      setIsResetting(false);
      setPendingResetAction(null);
      setSelectedResetAction(null);
    }
  };

  const handleManualBackup = async () => {
    if (!profile?.businessId) return;
    setManualBackupLoading(true);
    const toastId = toast.loading("A iniciar cópia de segurança completa do ERP...");
    try {
      const res = await runDatabaseBackup(profile.businessId, 'manual');
      
      // Trigger client-side browser download for manual backup
      if (res.blob) {
        const url = window.URL.createObjectURL(res.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = res.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }

      if (res.isLocalFallback) {
        toast.info(
          `Cópia de segurança '${res.filename}' gerada com sucesso e descarregada localmente! (Firebase Storage indisponível ou lento)`, 
          { id: toastId, duration: 6000 }
        );
      } else {
        toast.success(
          `Cópia de segurança '${res.filename}' guardada no Firebase Storage e descarregada no seu computador!`, 
          { id: toastId, duration: 6000 }
        );
      }
      fetchBackups();
    } catch (err: any) {
      console.error(err);
      toast.error(`Falha ao realizar a cópia de segurança: ${err.message || err}`, { id: toastId });
    } finally {
      setManualBackupLoading(false);
    }
  };

  const handleManualSyncRates = async () => {
    if (!profile?.businessId) return;
    setIsSyncingRates(true);
    const toastId = toast.loading("Buscando taxas de câmbio actualizadas...");
    try {
      const fetched = await fetchLiveExchangeRates();
      await updateDoc(doc(db, 'businesses', profile.businessId), {
        exchangeRates: fetched.rates,
        exchangeRatesUpdatedAt: fetched.timestamp
      });
      toast.success("Taxas de câmbio actualizadas e guardadas com sucesso!", { id: toastId });
    } catch (err: any) {
      console.error(err);
      toast.error(`Erro ao atualizar taxas: ${err.message || err}`, { id: toastId });
    } finally {
      setIsSyncingRates(false);
    }
  };

  const handleSaveRegionalSettings = async () => {
    if (!profile?.businessId) return;
    setLoading(true);
    try {
      const parsedOptions = regionalMobileMoneyOptions
        .split(',')
        .map(opt => opt.trim())
        .filter(opt => opt.length > 0);

      const matchingCountry = AFRICAN_COUNTRIES.find(c => c.name.toLowerCase() === regionalCountry.toLowerCase());
      const updatedSettings = {
        country: regionalCountry,
        countryCode: matchingCountry?.code || regionalCountryCode || 'MZ',
        language: regionalLanguage,
        currencyCode: regionalCurrency,
        currencySymbol: regionalCurrencySymbol,
        dateFormat: regionalDateFormat,
        numberFormat: regionalNumberFormat,
        taxLabel: regionalTaxLabel,
        taxRate: Number(regionalTaxRate) || 0,
        phoneCountryCode: regionalPhoneCode,
        mobileMoneyOptions: parsedOptions,
        updatedAt: new Date().toISOString()
      };

      // Save to businessDoc: regionalSettings field
      await updateDoc(doc(db, 'businesses', profile.businessId), {
        regionalSettings: updatedSettings
      });

      // Save to subdoc settings
      await setDoc(doc(db, 'businesses', profile.businessId, 'regional_settings', 'settings'), updatedSettings);

      toast.success("Definições regionais guardadas com sucesso!");
      setIsEditingRegional(false);
    } catch (err: any) {
      console.error("Error saving regional settings:", err);
      toast.error("Erro ao guardar definições regionais.");
    } finally {
      setLoading(false);
    }
  };

  const [forceLongPolling, setForceLongPolling] = useState(() => {
    return typeof window !== 'undefined' ? window.localStorage.getItem('sabush_force_long_polling') === 'true' : false;
  });
  const [cacheFirstMode, setCacheFirstMode] = useState(() => {
    return typeof window !== 'undefined' ? window.localStorage.getItem('sabush_cache_first') === 'true' : false;
  });

  const [primaryCurrencySearch, setPrimaryCurrencySearch] = useState('');
  const [secondaryCurrencySearch, setSecondaryCurrencySearch] = useState('');
  const [isSyncingRates, setIsSyncingRates] = useState(false);

  // Regional Settings state (Requisito 5)
  const [isEditingRegional, setIsEditingRegional] = useState(false);
  const [regionalCountry, setRegionalCountry] = useState('');
  const [regionalCountryCode, setRegionalCountryCode] = useState('');
  const [regionalLanguage, setRegionalLanguage] = useState<'pt' | 'en' | 'fr' | 'ar' | 'sw' | 'af'>('pt');
  const [regionalCurrency, setRegionalCurrency] = useState('MZN');
  const [regionalCurrencySymbol, setRegionalCurrencySymbol] = useState('MT');
  const [regionalDateFormat, setRegionalDateFormat] = useState('DD/MM/YYYY');
  const [regionalNumberFormat, setRegionalNumberFormat] = useState<'1,250.00' | '1.250,00' | '1 250,00'>('1.250,00');
  const [regionalTaxLabel, setRegionalTaxLabel] = useState('IVA');
  const [regionalTaxRate, setRegionalTaxRate] = useState(17);
  const [regionalPhoneCode, setRegionalPhoneCode] = useState('+258');
  const [regionalMobileMoneyOptions, setRegionalMobileMoneyOptions] = useState<string>('');

  const [formData, setFormData] = useState({
    businessName: businessData?.name || profile?.name || '',
    businessAddress: businessData?.address || profile?.address || '',
    logoUrl: businessData?.logoUrl || profile?.logoUrl || '',
    brandColor: businessData?.brandColor || profile?.brandColor || '#2563EB',
    paymentTerms: businessData?.paymentTerms || profile?.paymentTerms || '',
    paymentInstructions: businessData?.paymentInstructions || profile?.paymentInstructions || '',
    currency: businessData?.currency || profile?.currency || 'USD',
    secondaryCurrency: businessData?.secondaryCurrency || profile?.secondaryCurrency || '',
    whatsappApiKey: businessData?.whatsappConfig?.apiKey || profile?.whatsappConfig?.apiKey || '',
    whatsappPhone: businessData?.whatsappConfig?.phone || profile?.whatsappConfig?.phone || businessData?.phone || '',
    whatsappPhoneNumberId: businessData?.whatsappConfig?.phoneNumberId || profile?.whatsappConfig?.phoneNumberId || '',
    webhookUrl: businessData?.makeConfig?.webhookUrl || profile?.makeConfig?.webhookUrl || '',
    language: profile?.preferredLanguage || 'en',
    theme: profile?.theme || 'light',
    fontSize: profile?.fontSize || 'normal',
    taxId: businessData?.taxId || profile?.taxId || '',
    taxRate: businessData?.taxRate !== undefined ? businessData?.taxRate : (profile?.taxRate !== undefined ? profile.taxRate : 17),
    autoReminders: businessData?.automation?.autoReminders || profile?.automation?.autoReminders || false,
    autoSendInvoices: businessData?.automation?.autoSendInvoices !== undefined ? businessData.automation.autoSendInvoices : (profile?.automation?.autoSendInvoices !== undefined ? profile.automation.autoSendInvoices : true),
    autoLowStockAlerts: businessData?.automation?.autoLowStockAlerts !== undefined ? businessData.automation.autoLowStockAlerts : (profile?.automation?.autoLowStockAlerts || false),
    autoSendDailyWhatsAppReport: businessData?.automation?.autoSendDailyWhatsAppReport !== undefined ? businessData.automation.autoSendDailyWhatsAppReport : (profile?.automation?.autoSendDailyWhatsAppReport || false),
    invoiceTemplate: businessData?.automation?.invoiceTemplate || profile?.automation?.invoiceTemplate || 'Olá *{customerName}*!\nA sua fatura *{orderNumber}* no valor de *{totalAmount} {currency}* foi emitida e processada com sucesso.\n\n📄 *Descarregar PDF:* {invoiceUrl}\n\nAgradecemos a sua preferência!\n_Sabush System ERP_',
    reminderTemplate: businessData?.automation?.reminderTemplate || profile?.automation?.reminderTemplate || 'Olá *{customerName}*!\nRelembramos que a fatura *{orderNumber}* no valor de *{totalAmount} {currency}* encontra-se pendente de pagamento.\n\nAgradecemos a regularização do saldo correspondente.\n\nSempre ao seu dispor,\n_Sabush System ERP_',
    lowStockTemplate: businessData?.automation?.lowStockTemplate || profile?.automation?.lowStockTemplate || '⚠️ *Alerta de Stock Baixo!*\n\nO artigo *{productName}* atingiu o nível crítico.\nStock Atual: *{currentStock}* {unit}\nLimite Mínimo: *{minStock}* {unit}.\n\nPor favor, providencie o reabastecimento do stock.\n_Sabush System ERP_',
    printerType: businessData?.printerType || profile?.printerType || 'standard',
    printerInterface: businessData?.printerInterface || profile?.printerInterface || 'system',
    printerIpAddress: businessData?.printerIpAddress || profile?.printerIpAddress || '',
    printerPort: businessData?.printerPort || profile?.printerPort || '9100',
    autoPrintOnCreate: businessData?.autoPrintOnCreate || profile?.autoPrintOnCreate || false,
    managerPin: businessData?.managerPin !== undefined ? businessData.managerPin : '1234',
    restrictStaffToOwnTransactions: businessData?.restrictStaffToOwnTransactions !== undefined ? businessData.restrictStaffToOwnTransactions : true,
    timezone: businessData?.timezone || profile?.timezone || 'Africa/Maputo',
    backupSchedule: businessData?.backupSchedule || 'disabled',
    posPaymentMethods: businessData?.posPaymentMethods || []
  });

  // --- PWA / Offline Management States ---
  const [isInstallable, setIsInstallable] = useState(() => typeof window !== 'undefined' ? !!(window as any).deferredPrompt : false);
  const [isInstalled, setIsInstalled] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
  });
  const [pushPermission, setPushPermission] = useState(() => typeof window !== 'undefined' ? Notification.permission : 'default');
  const [cacheFilesCount, setCacheFilesCount] = useState(0);
  const [networkOnline, setNetworkOnline] = useState(() => typeof window !== 'undefined' ? navigator.onLine : true);

  // --- WhatsApp Test State & Diagnostic Terminal ---
  const [testScenario, setTestScenario] = useState<'invoice' | 'stock' | 'overdue' | 'report'>('invoice');
  const [testSandboxMode, setTestSandboxMode] = useState<boolean>(true);
  const [testRecipientPhone, setTestRecipientPhone] = useState('+258841234567');
  const [testCustomerName, setTestCustomerName] = useState('João Pedro');
  const [testInvoiceNumber, setTestInvoiceNumber] = useState('INV-2026-0034');
  const [testProductName, setTestProductName] = useState('Arroz Sabush 10kg');
  const [testCurrentStock, setTestCurrentStock] = useState(5);
  const [testMinStock, setTestMinStock] = useState(15);
  const [testTotalAmount, setTestTotalAmount] = useState(4500);
  const [isTestingWhatsApp, setIsTestingWhatsApp] = useState(false);
  const [isValidatingWhatsApp, setIsValidatingWhatsApp] = useState(false);
  const [whatsAppValidationStatus, setWhatsAppValidationStatus] = useState<'idle' | 'valid' | 'invalid' | 'error' | 'cors_valid'>('idle');
  const [whatsAppValidationError, setWhatsAppValidationError] = useState('');
  const [whatsAppVerifiedName, setWhatsAppVerifiedName] = useState('');
  const [showLogDetailsIdx, setShowLogDetailsIdx] = useState<number | null>(null);
  const [testLogs, setTestLogs] = useState<Array<{
    timestamp: string;
    type: 'info' | 'success' | 'warn' | 'error' | 'request' | 'response';
    message: string;
    details?: any;
  }>>([
    {
      timestamp: new Date().toLocaleTimeString(),
      type: 'info',
      message: 'Consola estéril de teste WhatsApp iniciada. Escolha um cenário e clique em "Disparar para ver o log.'
    }
  ]);

  // Monitor connection and prompt capture
  useEffect(() => {
    if (activeTab !== 'pwa') return;

    const handleInstallable = () => setIsInstallable(true);
    const handleOnline = () => setNetworkOnline(true);
    const handleOffline = () => setNetworkOnline(false);

    window.addEventListener('sabush-pwa-installable', handleInstallable);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial query for cached items count
    if ('caches' in window) {
      caches.open('sabush-erp-cache-v1').then((cache) => {
        cache.keys().then((keys) => {
          setCacheFilesCount(keys.length);
        });
      }).catch(err => console.log('Cache access error:', err));
    }

    return () => {
      window.removeEventListener('sabush-pwa-installable', handleInstallable);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [activeTab]);

  const triggerPWAInstall = async () => {
    const promptEvent = (window as any).deferredPrompt;
    if (!promptEvent) {
      toast.info("O prompt de instalação não está disponível de momento. Para instalar no iOS, toque em Partilhar e logo 'Adicionar ao Ecrã Principal'.");
      return;
    }
    promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    console.log(`[PWA] User response to the install prompt: ${outcome}`);
    (window as any).deferredPrompt = null;
    setIsInstallable(false);
  };

  const requestPushPermission = async () => {
    if (!('Notification' in window)) {
      toast.error("Este navegador não suporta notificações de sistema.");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setPushPermission(permission);
      if (permission === 'granted') {
        toast.success("Notificações Push ativadas com sucesso!");
        sendLocalTestPushNotification('Sistema Ativo 🚀', 'Excelente! As notificações push para faturas, encomendas e stocks estão prontas.');
      } else {
        toast.error("Permissão de notificações recusada. Ative nas definições do seu navegador.");
      }
    } catch (err) {
      toast.error("Erro ao solicitar permissão de notificações.");
    }
  };

  const sendLocalTestPushNotification = async (title: string, body: string, type: 'order' | 'stock' | 'payment' | 'general' = 'general') => {
    const perm = typeof window !== 'undefined' ? Notification.permission : 'default';
    if (perm !== 'granted') {
      toast.error("Por favor, ative primeiro as notificações push nas definições.");
      return;
    }

    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        reg.showNotification(title, {
          body,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          vibrate: [100, 50, 100],
          data: {
            url: type === 'order' ? '/' : type === 'stock' ? '/' : type === 'payment' ? '/' : '/',
            type
          }
        } as any);
        toast.success("Simulação de notificação enviada!");
      } catch (err) {
        console.error("Local notification display failed:", err);
        new Notification(title, { body, icon: '/icon-192.png' });
      }
    } else {
      new Notification(title, { body, icon: '/icon-192.png' });
    }
  };

  useEffect(() => {
    if (profile || businessData) {
      setFormData(prev => ({
        ...prev,
        businessName: businessData?.name || profile?.name || prev.businessName,
        businessAddress: businessData?.address || profile?.address || prev.businessAddress,
        logoUrl: businessData?.logoUrl || profile?.logoUrl || prev.logoUrl,
        brandColor: businessData?.brandColor || profile?.brandColor || prev.brandColor,
        paymentTerms: businessData?.paymentTerms || profile?.paymentTerms || prev.paymentTerms,
        paymentInstructions: businessData?.paymentInstructions || profile?.paymentInstructions || prev.paymentInstructions,
        currency: businessData?.currency || profile?.currency || prev.currency,
        secondaryCurrency: businessData?.secondaryCurrency || profile?.secondaryCurrency || prev.secondaryCurrency || '',
        whatsappApiKey: businessData?.whatsappConfig?.apiKey || profile?.whatsappConfig?.apiKey || prev.whatsappApiKey,
        whatsappPhone: businessData?.whatsappConfig?.phone || profile?.whatsappConfig?.phone || businessData?.phone || prev.whatsappPhone,
        whatsappPhoneNumberId: businessData?.whatsappConfig?.phoneNumberId || profile?.whatsappConfig?.phoneNumberId || prev.whatsappPhoneNumberId,
        webhookUrl: businessData?.makeConfig?.webhookUrl || profile?.makeConfig?.webhookUrl || prev.webhookUrl,
        language: profile?.preferredLanguage || prev.language,
        theme: profile?.theme || prev.theme || 'light',
        fontSize: profile?.fontSize || prev.fontSize || 'normal',
        taxId: businessData?.taxId || profile?.taxId || prev.taxId,
        taxRate: businessData?.taxRate !== undefined ? businessData.taxRate : (profile?.taxRate !== undefined ? profile.taxRate : prev.taxRate),
        autoReminders: businessData?.automation?.autoReminders || profile?.automation?.autoReminders || prev.autoReminders,
        autoSendInvoices: businessData?.automation?.autoSendInvoices !== undefined ? businessData.automation.autoSendInvoices : (profile?.automation?.autoSendInvoices !== undefined ? profile.automation.autoSendInvoices : prev.autoSendInvoices),
        autoLowStockAlerts: businessData?.automation?.autoLowStockAlerts !== undefined ? businessData.automation.autoLowStockAlerts : (profile?.automation?.autoLowStockAlerts !== undefined ? profile.automation.autoLowStockAlerts : prev.autoLowStockAlerts),
        autoSendDailyWhatsAppReport: businessData?.automation?.autoSendDailyWhatsAppReport !== undefined ? businessData.automation.autoSendDailyWhatsAppReport : (profile?.automation?.autoSendDailyWhatsAppReport !== undefined ? profile.automation.autoSendDailyWhatsAppReport : prev.autoSendDailyWhatsAppReport),
        invoiceTemplate: businessData?.automation?.invoiceTemplate || profile?.automation?.invoiceTemplate || prev.invoiceTemplate,
        reminderTemplate: businessData?.automation?.reminderTemplate || profile?.automation?.reminderTemplate || prev.reminderTemplate,
        lowStockTemplate: businessData?.automation?.lowStockTemplate || profile?.automation?.lowStockTemplate || prev.lowStockTemplate,
        printerType: businessData?.printerType || profile?.printerType || prev.printerType,
        printerInterface: businessData?.printerInterface || profile?.printerInterface || prev.printerInterface || 'system',
        printerIpAddress: businessData?.printerIpAddress || profile?.printerIpAddress || prev.printerIpAddress || '',
        printerPort: businessData?.printerPort || profile?.printerPort || prev.printerPort || '9100',
        autoPrintOnCreate: businessData?.autoPrintOnCreate || profile?.autoPrintOnCreate || prev.autoPrintOnCreate,
        managerPin: businessData?.managerPin !== undefined ? businessData.managerPin : prev.managerPin,
        restrictStaffToOwnTransactions: businessData?.restrictStaffToOwnTransactions !== undefined ? businessData.restrictStaffToOwnTransactions : prev.restrictStaffToOwnTransactions,
        timezone: businessData?.timezone || profile?.timezone || prev.timezone || 'Africa/Maputo',
        backupSchedule: businessData?.backupSchedule || prev.backupSchedule || 'disabled',
        posPaymentMethods: businessData?.posPaymentMethods || prev.posPaymentMethods || []
      }));

      // Sync regional settings (Requisito 5)
      if (businessData?.regionalSettings) {
        setRegionalCountry(businessData.regionalSettings.country || '');
        setRegionalCountryCode(businessData.regionalSettings.countryCode || '');
        setRegionalLanguage(businessData.regionalSettings.language || 'pt');
        setRegionalCurrency(businessData.regionalSettings.currencyCode || 'MZN');
        setRegionalCurrencySymbol(businessData.regionalSettings.currencySymbol || 'MT');
        setRegionalDateFormat(businessData.regionalSettings.dateFormat || 'DD/MM/YYYY');
        setRegionalNumberFormat(businessData.regionalSettings.numberFormat || '1.250,00');
        setRegionalTaxLabel(businessData.regionalSettings.taxLabel || 'IVA');
        setRegionalTaxRate(businessData.regionalSettings.taxRate !== undefined ? businessData.regionalSettings.taxRate : 17);
        setRegionalPhoneCode(businessData.regionalSettings.phoneCountryCode || '+258');
        setRegionalMobileMoneyOptions(
          Array.isArray(businessData.regionalSettings.mobileMoneyOptions) 
            ? businessData.regionalSettings.mobileMoneyOptions.join(', ')
            : typeof businessData.regionalSettings.mobileMoneyOptions === 'string'
              ? businessData.regionalSettings.mobileMoneyOptions
              : ''
        );
      }
    }
  }, [profile, businessData]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size <= 1024 * 512) {
        // Under 512KB limit, read directly
        const reader = new FileReader();
        reader.onloadend = () => {
          setFormData(prev => ({ ...prev, logoUrl: reader.result as string }));
          toast.success("Logotipo carregado com sucesso!");
        };
        reader.readAsDataURL(file);
      } else {
        // Over 512KB limit, self-tailor / compress automatically
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              let width = img.width;
              let height = img.height;
              
              // Scale down dimensions to keep representation crisp but small (e.g., max 800px)
              const MAX_WIDTH = 800;
              const MAX_HEIGHT = 800;
              
              if (width > MAX_WIDTH || height > MAX_HEIGHT) {
                if (width > height) {
                  height = Math.round((height * MAX_WIDTH) / width);
                  width = MAX_WIDTH;
                } else {
                  width = Math.round((width * MAX_HEIGHT) / height);
                  height = MAX_HEIGHT;
                }
              }
              
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(img, 0, 0, width, height);
                
                let dataUrl = '';
                const isPng = file.type === 'image/png';
                
                // If PNG, try to preserve transparency
                if (isPng) {
                  dataUrl = canvas.toDataURL('image/png');
                }
                
                const charLimit = 512 * 1024 * 1.34; // Base64 character length target
                
                // If not PNG or PNG output exceeds safe threshold, encode as optimized JPEG
                if (!dataUrl || dataUrl.length > charLimit) {
                  let quality = 0.85;
                  dataUrl = canvas.toDataURL('image/jpeg', quality);
                  
                  let attempts = 0;
                  while (dataUrl.length > charLimit && quality > 0.3 && attempts < 5) {
                    quality -= 0.15;
                    dataUrl = canvas.toDataURL('image/jpeg', quality);
                    attempts++;
                  }
                }
                
                if (dataUrl.length > charLimit) {
                  toast.error("O ficheiro de imagem é excessivamente complexo e pesado. Por favor, utilize uma imagem mais simples.");
                } else {
                  setFormData(prev => ({ ...prev, logoUrl: dataUrl }));
                  toast.success("Imagem grande optimizada e adaptada automaticamente para menos de 512KB!");
                }
              } else {
                toast.error("Não foi possível inicializar o canvas de otimização de imagem.");
              }
            } catch (err) {
              console.error(err);
              toast.error("Erro interno ao otimizar o tamanho do logotipo.");
            }
          };
          img.onerror = () => {
            toast.error("Erro ao interpretar dados do ficheiro de imagem.");
          };
          img.src = event.target?.result as string;
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleUpdateSettings = async () => {
    if (!profile?.businessId || !user) return;
    setLoading(true);

    try {
      if (isSystemAdmin) {
        // Update Business Doc
        await updateDoc(doc(db, 'businesses', profile.businessId), {
          name: formData.businessName,
          address: formData.businessAddress,
          logoUrl: formData.logoUrl,
          brandColor: formData.brandColor,
          paymentTerms: formData.paymentTerms,
          paymentInstructions: formData.paymentInstructions,
          currency: formData.currency,
          secondaryCurrency: formData.secondaryCurrency,
          taxId: formData.taxId,
          taxRate: formData.taxRate,
          automation: { 
            autoReminders: formData.autoReminders,
            autoSendInvoices: formData.autoSendInvoices,
            autoLowStockAlerts: formData.autoLowStockAlerts,
            autoSendDailyWhatsAppReport: formData.autoSendDailyWhatsAppReport,
            invoiceTemplate: formData.invoiceTemplate,
            reminderTemplate: formData.reminderTemplate,
            lowStockTemplate: formData.lowStockTemplate
          },
          whatsappConfig: { 
            apiKey: formData.whatsappApiKey,
            phone: formData.whatsappPhone,
            phoneNumberId: formData.whatsappPhoneNumberId
          },
          makeConfig: { webhookUrl: formData.webhookUrl },
          printerType: formData.printerType,
          printerInterface: formData.printerInterface || 'system',
          printerIpAddress: formData.printerIpAddress || '',
          printerPort: formData.printerPort || '9100',
          autoPrintOnCreate: formData.autoPrintOnCreate,
          managerPin: formData.managerPin,
          restrictStaffToOwnTransactions: formData.restrictStaffToOwnTransactions,
          timezone: formData.timezone || 'Africa/Maputo',
          backupSchedule: formData.backupSchedule,
          posPaymentMethods: formData.posPaymentMethods || [],
          updatedAt: serverTimestamp()
        });
      }

      // Update User Doc (Language Preference & Timezone) - Allowed for everyone
      if (updateProfile) {
        await updateProfile({
          preferredLanguage: formData.language,
          timezone: formData.timezone || 'Africa/Maputo',
          theme: formData.theme || 'light',
          fontSize: formData.fontSize || 'normal'
        });
      }

      if (typeof window !== 'undefined') {
        window.localStorage.setItem('sabush_force_long_polling', forceLongPolling ? 'true' : 'false');
        window.localStorage.setItem('sabush_cache_first', cacheFirstMode ? 'true' : 'false');
      }

      i18n.changeLanguage(formData.language);
      
      if (isSystemAdmin) {
        toast.success("Settings updated successfully");
      } else {
        toast.info("User preferences updated successfully. Business settings represent read-only configuration.");
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings');
      toast.error("Failed to update settings");
    } finally {
      setLoading(false);
    }
  };

  const isAuthorizedToSetPin = isSystemAdmin;

  const tabs = [
    { id: 'profile', label: 'Business Profile', icon: Building, isSensitive: true },
    { id: 'theme', label: 'Theme Customization', icon: Palette, isSensitive: false },
    { id: 'notifications', label: 'Configurações de Notificações', icon: Bell, isSensitive: true },
    { id: 'templates', label: 'Templates de WhatsApp', icon: MessageSquare, isSensitive: true },
    { id: 'branches', label: 'Lojas e Filiais', icon: MapPin, isSensitive: true },
    { id: 'printer', label: 'Printer Setup', icon: Printer, isSensitive: false },
    { id: 'i18n', label: 'Localization', icon: Globe, isSensitive: false },
    { id: 'security', label: 'Security & Connection', icon: ShieldCheck, isSensitive: true },
    { id: 'backups', label: 'Cópia de Segurança', icon: Database, isSensitive: true },
    { id: 'purge_data', label: 'Limpeza de Dados', icon: Trash2, isSensitive: true },
    { id: 'pwa', label: 'PWA & Offline', icon: Smartphone, isSensitive: false },
    { id: 'pos_settings', label: 'POS Settings', icon: CreditCard, isSensitive: false },
    { id: 'legal_info', label: 'Informação Legal', icon: Scale, isSensitive: false },
  ];

  const [activePreviewTab, setActivePreviewTab] = useState<'invoice' | 'reminder' | 'lowStock'>('invoice');

  const tags = activePreviewTab === 'lowStock' ? [
    { code: '{productName}', label: 'Nome do Artigo / Produto' },
    { code: '{currentStock}', label: 'Nível de Stock Atual' },
    { code: '{minStock}', label: 'Limite de Alerta de Stock' },
    { code: '{unit}', label: 'Unidade de Medida (ex: Un, Kg, Sacos)' },
  ] : [
    { code: '{customerName}', label: 'Nome do Cliente' },
    { code: '{orderNumber}', label: 'Número da Fatura / Encomenda' },
    { code: '{totalAmount}', label: 'Valor Total a Pagar' },
    { code: '{currency}', label: 'Moeda' },
    { code: '{items}', label: 'Lista Descritiva dos Itens' },
    { code: '{invoiceUrl}', label: 'Link de Download PDF' },
  ];

  const getMockPreviewText = (template: string) => {
    if (!template) return '';
    if (activePreviewTab === 'lowStock') {
      return template
        .replace(/{productName}/g, 'Arroz Integral Alif 5kg')
        .replace(/{currentStock}/g, '3')
        .replace(/{minStock}/g, '5')
        .replace(/{unit}/g, 'Sacos');
    }
    return template
      .replace(/{customerName}/g, 'Sérgio Mascena')
      .replace(/{orderNumber}/g, 'INV-2026-0841')
      .replace(/{totalAmount}/g, '14.500,00')
      .replace(/{currency}/g, formData.currency || 'MT')
      .replace(/{items}/g, '- Item de Exemplo A (x2): 9.000,00 MT\n- Item de Exemplo B (x1): 5.500,00 MT')
      .replace(/{invoiceUrl}/g, 'https://sabush.app/pdf/INV-2026-0841.pdf');
  };

  const insertPlaceholder = (placeholder: string, field: 'invoiceTemplate' | 'reminderTemplate' | 'lowStockTemplate') => {
    setFormData(prev => ({
      ...prev,
      [field]: (prev[field] || '') + placeholder
    }));
  };

  const validateWhatsAppCredentials = async () => {
    const { whatsappApiKey, whatsappPhoneNumberId, whatsappPhone } = formData;
    if (!whatsappApiKey || !whatsappPhoneNumberId) {
      setWhatsAppValidationStatus('invalid');
      setWhatsAppValidationError('Por favor, preencha o API Token e o Phone Number ID antes de validar.');
      toast.error('Token e Phone Number ID são obrigatórios para validação.');
      return;
    }

    setIsValidatingWhatsApp(true);
    setWhatsAppValidationStatus('idle');
    setWhatsAppValidationError('');
    setWhatsAppVerifiedName('');

    try {
      const endpoint = `https://graph.facebook.com/v17.0/${whatsappPhoneNumberId}`;
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${whatsappApiKey}`,
          'Content-Type': 'application/json'
        }
      });

      const resJson = await response.json();
      if (response.ok) {
        setWhatsAppValidationStatus('valid');
        setWhatsAppVerifiedName(resJson.verified_name || resJson.display_phone_number || 'Conectado');
        toast.success('Credenciais validadas com sucesso pela Meta API!');
      } else {
        setWhatsAppValidationStatus('invalid');
        setWhatsAppValidationError(resJson.error?.message || 'Erro desconhecido na Meta API.');
        toast.error('Credenciais rejeitadas pela Meta API.');
      }
    } catch (err: any) {
      console.warn('Network or CORS error verifying credentials:', err);
      
      const hasTokenPrefix = whatsappApiKey.startsWith('EAA');
      const hasNumericId = /^\d+$/.test(whatsappPhoneNumberId);

      if (hasTokenPrefix && hasNumericId) {
        setWhatsAppValidationStatus('cors_valid');
        setWhatsAppVerifiedName('Formato Válido (CORS Restrito)');
        toast.info('Formato de credenciais bem-formado. Bloqueio CORS de navegador esperado.');
      } else {
        setWhatsAppValidationStatus('error');
        let errorDetails = '';
        if (!hasTokenPrefix) errorDetails += 'O Token Meta geralmente deve começar com "EAA". ';
        if (!hasNumericId) errorDetails += 'O Phone Number ID deve conter apenas números. ';
        setWhatsAppValidationError(errorDetails || 'Erro de conexão/CORS. Verifique as credenciais.');
        toast.error('Credenciais parecem incorretas ou mal-formadas.');
      }
    } finally {
      setIsValidatingWhatsApp(false);
    }
  };

  const runWhatsAppTest = async () => {
    setIsTestingWhatsApp(true);
    const newLogs: Array<{
      timestamp: string;
      type: 'info' | 'success' | 'warn' | 'error' | 'request' | 'response';
      message: string;
      details?: any;
    }> = [];

    const addLog = (type: 'info' | 'success' | 'warn' | 'error' | 'request' | 'response', message: string, details?: any) => {
      newLogs.push({
        timestamp: new Date().toLocaleTimeString(),
        type,
        message,
        details
      });
    };

    addLog('info', `Iniciando teste de automação WhatsApp – Cenário: ${testScenario.toUpperCase()}`);

    const { whatsappApiKey, whatsappPhoneNumberId, whatsappPhone, invoiceTemplate, reminderTemplate, lowStockTemplate } = formData;
    
    addLog('info', `Configuração detetada: Token: ${whatsappApiKey ? 'Preenchido' : 'Em falta'}, Phone ID: ${whatsappPhoneNumberId || 'Não definido'}, Telefone do Negócio: ${whatsappPhone || 'Não definido'}`);

    if (!testSandboxMode && (!whatsappApiKey || !whatsappPhoneNumberId)) {
      addLog('error', `Falha: Credenciais da API Oficial da Meta em falta no formulário.`);
      setTestLogs([...newLogs]);
      setIsTestingWhatsApp(false);
      toast.error("Insira o API Token e Phone Number ID ou ative o Modo Sandbox (Simulado).");
      return;
    }

    const formattedRecipient = testRecipientPhone.replace(/\D/g, '');
    if (!formattedRecipient) {
      addLog('error', `Falha: O número do destinatário ("${testRecipientPhone}") não contém dígitos válidos (ex: +258...).`);
      setTestLogs([...newLogs]);
      setIsTestingWhatsApp(false);
      return;
    }

    let messageText = '';
    const items = [{ name: testProductName, quantity: 2, price: testTotalAmount / 2 }];
    const formattedItems = items.map(item => `- ${item.name} (x${item.quantity}): ${(item.price * item.quantity).toFixed(2)} MZN`).join('\n');

    if (testScenario === 'invoice') {
      messageText = (invoiceTemplate || '')
        .replace(/{customerName}/g, testCustomerName)
        .replace(/{orderNumber}/g, testInvoiceNumber)
        .replace(/{totalAmount}/g, testTotalAmount.toLocaleString('pt-MZ', { minimumFractionDigits: 2 }))
        .replace(/{currency}/g, 'MZN')
        .replace(/{items}/g, formattedItems)
        .replace(/{invoiceUrl}/g, 'https://ais-pre-onc26cco67pd67esqqruzc-315680651610.europe-west1.run.app/placeholder-pdf.pdf');
    } else if (testScenario === 'stock') {
      messageText = (lowStockTemplate || '')
        .replace(/{productName}/g, testProductName)
        .replace(/{currentStock}/g, String(testCurrentStock))
        .replace(/{minStock}/g, String(testMinStock))
        .replace(/{unit}/g, 'unid');
    } else if (testScenario === 'overdue') {
      messageText = (reminderTemplate || '')
        .replace(/{customerName}/g, testCustomerName)
        .replace(/{orderNumber}/g, testInvoiceNumber)
        .replace(/{totalAmount}/g, testTotalAmount.toLocaleString('pt-MZ', { minimumFractionDigits: 2 }))
        .replace(/{currency}/g, 'MZN')
        .replace(/{invoiceUrl}/g, 'https://ais-pre-onc26cco67pd67esqqruzc-315680651610.europe-west1.run.app/placeholder-pdf.pdf')
        .replace(/{items}/g, `- ${testProductName} (x1)`);
    } else if (testScenario === 'report') {
      const todayStr = new Date().toLocaleDateString('pt-MZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
      messageText = `📊 *SABUSH ERP - RELATÓRIO DE VENDAS AUTOMÁTICO* 📊\n*Empresa:* ${formData.businessName || 'Sabush System'}\n*Data do Resumo:* ${todayStr}\n\n----------------------------------\n📈 *Resumo Financeiro:*\n  - *Faturamento Bruto:* ${testTotalAmount.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} MZN\n  - *Despesas Registradas:* 1,200.00 MZN\n  - *Lucro Líquido Estimado:* ${(testTotalAmount - 1200).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} MZN\n  - *Nº de Transações (Vendas):* 14 vds.\n\n----------------------------------\n⚠️ *Alertas Críticos:*\n  - *Crédito Cooperativo Pendente:* 8,500.00 MZN\n  - *Artigos com Alerta de Stock:* ${testCurrentStock <= testMinStock ? 1 : 0} itens\n\nAceda ao painel Sabush ERP para consolidação total: https://sabush-erp.web.app\n_Este é um relatório gerado e disparado de forma automática com segurança no Sabush ERP_`;
    }

    addLog('info', `Mensagem compilada com sucesso:\n------------------\n${messageText}\n------------------`);

    const endpoint = testSandboxMode 
      ? `https://sandbox-graph.facebook.com/v17.0/${whatsappPhoneNumberId || '102938475610293'}/messages`
      : `https://graph.facebook.com/v17.0/${whatsappPhoneNumberId}/messages`;

    // Mask security token for console printing
    const tokenDisplay = whatsappApiKey ? `${whatsappApiKey.substring(0, 8)}...${whatsappApiKey.substring(whatsappApiKey.length - 8)}` : 'MOCK_SANDBOX_META_TOKEN';

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedRecipient,
      type: 'text',
      text: {
        preview_url: false,
        body: messageText
      }
    };

    addLog('request', `Formular Chamada à Meta WhatsApp Cloud API:`, {
      method: 'POST',
      url: endpoint,
      headers: {
        'Authorization': `Bearer ${tokenDisplay}`,
        'Content-Type': 'application/json'
      },
      body: payload
    });

    setTestLogs([...newLogs]);

    // Small delay for rich responsive feedback loop
    await new Promise(resolve => setTimeout(resolve, 850));

    if (testSandboxMode) {
      const fakeMsgId = `wamid.HBgMrNTg4NDEyMzQ1NjcwFQIAERgSRUFBN0NDM0UwQjgxRkUxNUEzOQA=`;
      const fakeResponse = {
        messaging_product: "whatsapp",
        contacts: [{ input: formattedRecipient, wa_id: formattedRecipient }],
        messages: [{ id: fakeMsgId }]
      };
      addLog('response', `Resposta da API: 200 OK (Simulado)`, fakeResponse);
      addLog('success', `Sucesso! Simulador Sandbox disparou a mensagem para +${formattedRecipient}. ID: ${fakeMsgId}`);
      toast.success(`Notificação WhatsApp Simulada enviada com sucesso para +${formattedRecipient}`);
    } else {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${whatsappApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        const statusLabel = `${response.status} ${response.statusText}`;
        let resJson: any = {};
        try {
          resJson = await response.json();
        } catch {
          resJson = { error: "Sem resposta JSON legível recebida da graph.facebook.com" };
        }

        if (response.ok) {
          addLog('response', `Resposta da API: ${statusLabel}`, resJson);
          addLog('success', `Sucesso real na Meta API! Notificação enviada. Ref ID: ${resJson.messages?.[0]?.id || 'N/A'}`);
          toast.success("Mensagem original enviada com êxito!");
        } else {
          addLog('response', `Resposta da API: ${statusLabel} (Erro de Rejeição)`, resJson);
          addLog('error', `A Meta rejeitou a notificação autónoma: ${resJson.error?.message || 'Mensagem sem descrição descrita.'}`);
          toast.error("Processo recusado pela Meta API. Verifique logs.");
        }
      } catch (err: any) {
        addLog('error', `Mensagem Técnica: Erro no transporte de rede/CORS: ${err?.message || err}`);
        addLog('warn', `Dica de Configuração: Os navegadores da web bloqueiam requests diretos entre domínios (CORS). Certifique-se que o Make.com webhook está ativo ou que as chamadas são originárias de servidores confiáveis.`);
        toast.error("Redirecionamento bloqueado por segurança (CORS/Rede).");
      }
    }
    setTestLogs([...newLogs]);
    setIsTestingWhatsApp(false);
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{t('settings')}</h2>
        <p className="text-slate-500">Configure your business environment and external integrations.</p>
      </div>

      {/* WhatsApp Integration Quick Suggestion Banner */}
      {(!formData.whatsappApiKey || !formData.whatsappPhoneNumberId || !formData.whatsappPhone) && (
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50/50 p-6 md:p-8 rounded-[32px] border border-emerald-100 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-6 shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="space-y-2 max-w-xl flex-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 bg-emerald-600/10 text-emerald-700 text-[10px] font-black uppercase tracking-wider rounded-full">Recomendado</span>
              <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                WhatsApp Corporativo
              </span>
            </div>
            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <MessageSquare className="text-emerald-605 shrink-0" size={22} /> Integração Whatsapp Business
            </h3>
            <p className="text-xs font-semibold text-slate-500 leading-relaxed">
              Ative o envio automático de faturas, recibos e lembretes de pagamento em atraso diretamente por WhatsApp aos seus clientes. Introduza os dados de integração da Meta e clique em "Salvar Alterações" no fundo da página.
            </p>
          </div>
          <div className="w-full lg:w-96 shrink-0 bg-white p-5 rounded-2xl border border-emerald-100/70 shadow-sm space-y-4">
            <h4 className="text-xs font-black text-emerald-800 uppercase tracking-widest leading-none mb-1">Configuração Rápida</h4>
            <div className="space-y-3">
              <div>
                <label className="block text-[9px] font-black uppercase text-slate-400 mb-1 leading-none">WhatsApp Cloud API Key</label>
                <input 
                  type="password"
                  className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white text-xs font-bold placeholder:text-slate-300 transition-all text-slate-800"
                  placeholder="Introduza o Token de Acesso (EAAG...)"
                  value={formData.whatsappApiKey}
                  onChange={e => setFormData({...formData, whatsappApiKey: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] font-black uppercase text-slate-400 mb-1 leading-none">Phone Number ID</label>
                  <input 
                    type="text"
                    className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white text-xs font-bold placeholder:text-slate-300 transition-all font-mono text-slate-800"
                    placeholder="Ex: 102938..."
                    value={formData.whatsappPhoneNumberId}
                    onChange={e => setFormData({...formData, whatsappPhoneNumberId: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-black uppercase text-slate-400 mb-1 leading-none">Nº de Telefone</label>
                  <input 
                    type="text"
                    className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white text-xs font-bold placeholder:text-slate-300 transition-all text-slate-800"
                    placeholder="Ex: +258840000000"
                    value={formData.whatsappPhone}
                    onChange={e => setFormData({...formData, whatsappPhone: e.target.value})}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-8">
        <aside className="w-full md:w-64 space-y-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                activeTab === tab.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'hover:bg-white text-slate-500'
              }`}
            >
              <tab.icon size={18} />
              <span className="font-medium text-sm">{tab.label}</span>
            </button>
          ))}
        </aside>

        <div className="flex-1 bg-white p-8 rounded-3xl border border-slate-100 shadow-sm space-y-8">
          {(!isSystemAdmin && tabs.find(t => t.id === activeTab)?.isSensitive) && (
            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100/50 flex items-start gap-4 text-amber-900 text-xs font-semibold leading-relaxed animate-in fade-in duration-300">
              <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-extrabold uppercase text-[9px] tracking-wider text-amber-700 leading-none mb-1">Acesso Restrito (Leitura)</p>
                <span>
                  O seu cargo de <strong>{profile?.role?.toUpperCase() || 'COLABORADOR'}</strong> possui apenas acesso de leitura a esta secção. As alterações estão desativadas.
                </span>
              </div>
            </div>
          )}

          {activeTab === 'profile' && (
            <fieldset disabled={!isSystemAdmin} className="space-y-6 animate-in fade-in duration-300">
              <h3 className="text-lg font-bold">Business Profile</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Company Name</label>
                  <input 
                    className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.businessName}
                    onChange={e => setFormData({...formData, businessName: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Business Address</label>
                  <textarea 
                    className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none min-h-[80px]"
                    placeholder="Physical address, city, country"
                    value={formData.businessAddress}
                    onChange={e => setFormData({...formData, businessAddress: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Business Logo</label>
                  <div className="flex items-center gap-6">
                    <div className="w-24 h-24 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden">
                      {formData.logoUrl ? (
                        <img src={formData.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                      ) : (
                        <Building size={32} className="text-slate-300" />
                      )}
                    </div>
                    <div className="space-y-2">
                       <div className="flex gap-2">
                         <label className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest cursor-pointer hover:bg-slate-800 transition-colors">
                           Upload Logo
                           <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                         </label>
                         {formData.logoUrl && (
                           <button 
                             onClick={() => setFormData({...formData, logoUrl: ''})}
                             className="px-4 py-2 bg-rose-50 text-rose-600 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-rose-100 transition-colors"
                           >
                             Remove
                           </button>
                         )}
                       </div>
                       <p className="text-[10px] text-slate-400 font-bold">Recommended: Square image, max 512KB</p>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Logo URL (Optional)</label>
                  <input 
                    className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="https://..."
                    value={formData.logoUrl}
                    onChange={e => setFormData({...formData, logoUrl: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Primary Brand Color</label>
                  <p className="text-xs text-slate-400 mb-2">Select a theme palette or choose a custom hex color to override buttons, sidebars, and highlight highlights instantly.</p>
                  
                  <div className="flex flex-wrap gap-2 items-center">
                    {[
                      { hex: '#2563EB', label: 'Sabush Green' },
                      { hex: '#10b981', label: 'Emerald' },
                      { hex: '#2563EB', label: 'Teal Dream' },
                      { hex: '#D4AF37', label: 'Ochre Orange' },
                      { hex: '#ef4444', label: 'Crimson' },
                      { hex: '#93B4F5', label: 'Royal' },
                      { hex: '#6B7280', label: 'Slate Carbon' },
                    ].map(preset => (
                      <button
                        key={preset.hex}
                        type="button"
                        onClick={() => {
                          setFormData(prev => ({ ...prev, brandColor: preset.hex }));
                          const root = document.documentElement;
                          const tints = getBrandTints(preset.hex);
                          root.style.setProperty('--brand-color', tints.primary);
                          root.style.setProperty('--brand-color-hover', tints.hover);
                          root.style.setProperty('--brand-color-light', tints.light);
                          root.style.setProperty('--brand-color-glow', tints.glow);
                        }}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[11px] font-bold transition-all hover:scale-105 cursor-pointer",
                          formData.brandColor.toLowerCase() === preset.hex.toLowerCase()
                            ? "border-slate-800 bg-slate-900 text-white shadow-md"
                            : "border-slate-100 bg-white text-slate-700 hover:border-slate-200"
                        )}
                      >
                        <span className="w-4 h-4 rounded-full border border-white/20 shadow-sm shrink-0" style={{ backgroundColor: preset.hex }} />
                        <span>{preset.label}</span>
                      </button>
                    ))}

                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-100 bg-white">
                      <input 
                        type="color" 
                        value={formData.brandColor.startsWith('#') && formData.brandColor.length === 7 ? formData.brandColor : '#2563EB'} 
                        onChange={e => {
                          const hex = e.target.value;
                          setFormData(prev => ({ ...prev, brandColor: hex }));
                          const root = document.documentElement;
                          const tints = getBrandTints(hex);
                          root.style.setProperty('--brand-color', tints.primary);
                          root.style.setProperty('--brand-color-hover', tints.hover);
                          root.style.setProperty('--brand-color-light', tints.light);
                          root.style.setProperty('--brand-color-glow', tints.glow);
                        }}
                        className="w-8 h-6 rounded cursor-pointer border-0 outline-none bg-transparent"
                      />
                      <input 
                        type="text" 
                        value={formData.brandColor}
                        onChange={e => {
                          const hex = e.target.value;
                          setFormData(prev => ({ ...prev, brandColor: hex }));
                          if (hex.match(/^#[0-9A-Fa-f]{6}$/)) {
                            const root = document.documentElement;
                            const tints = getBrandTints(hex);
                            root.style.setProperty('--brand-color', tints.primary);
                            root.style.setProperty('--brand-color-hover', tints.hover);
                            root.style.setProperty('--brand-color-light', tints.light);
                            root.style.setProperty('--brand-color-glow', tints.glow);
                          }
                        }}
                        className="w-16 text-[10px] font-mono font-bold uppercase outline-none rounded p-1 text-slate-800"
                        placeholder="#2563EB"
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Base Currency</label>
                  <select 
                    className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                    value={formData.currency}
                    onChange={e => setFormData({...formData, currency: e.target.value})}
                  >
                    <option value="USD">USD - US Dollar</option>
                    <option value="ZAR">ZAR - SA Rand</option>
                    <option value="KES">KES - Kenyan Shilling</option>
                    <option value="NGN">NGN - Nigerian Naira</option>
                    <option value="MZN">MZN - Mozambican Metical</option>
                  </select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Payment Instructions</label>
                    <textarea 
                      className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none min-h-[100px]"
                      placeholder="e.g. Bank: Standard Bank, Acc: 123456789"
                      value={formData.paymentInstructions}
                      onChange={e => setFormData({...formData, paymentInstructions: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Payment Terms</label>
                    <textarea 
                      className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none min-h-[100px]"
                      placeholder="e.g. Payment due within 15 days"
                      value={formData.paymentTerms}
                      onChange={e => setFormData({...formData, paymentTerms: e.target.value})}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tax ID / VAT Number</label>
                  <input 
                    className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="NUIT / TAX ID"
                    value={formData.taxId}
                    onChange={e => setFormData({...formData, taxId: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Standard Tax Rate (%)</label>
                  <input 
                    type="number"
                    className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    value={formData.taxRate}
                    onChange={e => setFormData({...formData, taxRate: Number(e.target.value)})}
                  />
                </div>
              </div>
            </fieldset>
          )}

          {activeTab === 'theme' && (
            <div className="space-y-8 animate-in fade-in duration-300">
              {/* Theme Mode Selector */}
              <div className="space-y-4 text-left">
                <div>
                  <h3 className="text-xl font-black text-slate-900 font-sans tracking-tight">Esquema de Cores (Interface)</h3>
                  <p className="text-sm text-slate-500 font-sans font-medium">
                    Escolha o seu tema preferido para ajustar dinamicamente o espaço de trabalho entre o modo claro e escuro.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      setFormData(prev => ({ ...prev, theme: 'light' }));
                      document.documentElement.classList.remove('dark');
                    }}
                    className={cn(
                      "flex items-center justify-center gap-3 p-4 rounded-2xl border text-sm font-bold transition-all select-none cursor-pointer active:scale-95",
                      formData.theme === 'light'
                        ? "border-slate-800 bg-slate-900 text-white shadow-md shadow-slate-900/10 dark:border-slate-100"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600"
                    )}
                  >
                    <Sun size={18} className={cn(formData.theme === 'light' ? "text-amber-400" : "text-slate-500 dark:text-slate-400")} />
                    <span>Claro (Light Mode)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setFormData(prev => ({ ...prev, theme: 'dark' }));
                      document.documentElement.classList.add('dark');
                    }}
                    className={cn(
                      "flex items-center justify-center gap-3 p-4 rounded-2xl border text-sm font-bold transition-all select-none cursor-pointer active:scale-95",
                      formData.theme === 'dark'
                        ? "border-slate-800 bg-slate-900 text-white shadow-md shadow-slate-900/10 dark:border-slate-100"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600"
                    )}
                  >
                    <Moon size={18} className={cn(formData.theme === 'dark' ? "text-blue-400" : "text-slate-500 dark:text-slate-400")} />
                    <span>Escuro (Dark Mode)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setFormData(prev => ({ ...prev, theme: 'auto' }));
                      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                        document.documentElement.classList.add('dark');
                      } else {
                        document.documentElement.classList.remove('dark');
                      }
                    }}
                    className={cn(
                      "flex items-center justify-center gap-3 p-4 rounded-2xl border text-sm font-bold transition-all select-none cursor-pointer active:scale-95",
                      formData.theme === 'auto'
                        ? "border-slate-800 bg-slate-900 text-white shadow-md shadow-slate-900/10 dark:border-slate-100"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600"
                    )}
                  >
                    <Laptop size={18} className={cn(formData.theme === 'auto' ? "text-indigo-400" : "text-slate-500 dark:text-slate-400")} />
                    <span>Automático (System)</span>
                  </button>
                </div>
              </div>

              <hr className="border-slate-100 dark:border-slate-800" />

              {/* Font Size Selector */}
              <div className="space-y-4 text-left">
                <div>
                  <h3 className="text-xl font-black text-slate-900 dark:text-white font-sans tracking-tight flex items-center gap-2">
                    <Type size={20} className="text-blue-600 dark:text-blue-400" />
                    Tamanho do Texto (Interface)
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 font-sans font-medium">
                    Ajuste dinamicamente o tamanho das fontes e dos botões em toda a aplicação para melhorar a legibilidade.
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {[
                    { id: 'small', label: 'Pequeno', desc: '14px', sampleStyle: 'text-[11px]' },
                    { id: 'normal', label: 'Padrão / Normal', desc: '16px', sampleStyle: 'text-xs' },
                    { id: 'medium', label: 'Médio', desc: '18px', sampleStyle: 'text-sm' },
                    { id: 'large', label: 'Grande', desc: '20px', sampleStyle: 'text-md font-bold' },
                    { id: 'xlarge', label: 'Muito Grande', desc: '22px', sampleStyle: 'text-base font-black' }
                  ].map(opt => {
                    const isSelected = (formData.fontSize || 'normal') === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setFormData(prev => ({ ...prev, fontSize: opt.id }));
                          const root = document.documentElement;
                          if (opt.id === 'small') {
                            root.style.fontSize = '14px';
                          } else if (opt.id === 'medium') {
                            root.style.fontSize = '18px';
                          } else if (opt.id === 'large') {
                            root.style.fontSize = '20px';
                          } else if (opt.id === 'xlarge') {
                            root.style.fontSize = '22px';
                          } else {
                            root.style.fontSize = '16px';
                          }
                        }}
                        className={cn(
                          "flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border text-center transition-all select-none cursor-pointer active:scale-95 h-24",
                          isSelected
                            ? "border-slate-800 bg-slate-900 text-white shadow-md shadow-slate-900/10 dark:border-white dark:bg-white dark:text-slate-950"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600"
                        )}
                      >
                        <span className={cn("leading-none", opt.sampleStyle)}>Aa</span>
                        <span className="text-xs font-bold font-sans mt-1 leading-none">{opt.label}</span>
                        <span className={cn("text-[10px] font-mono leading-none", isSelected ? "text-slate-400 dark:text-slate-500" : "text-slate-400")}>{opt.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <hr className="border-slate-100 dark:border-slate-800" />

              <fieldset disabled={!isSystemAdmin} className="space-y-6">
                <div>
                  <h3 className="text-xl font-black text-slate-900 font-sans tracking-tight">Visual Theme Customization</h3>
                  <p className="text-sm text-slate-500 font-sans font-medium">
                    Define your primary brand color palette. This color is dynamically integrated across buttons, sidebars, active tabs, and highlights throughout your workspace, overriding the default system fallback theme.
                  </p>
                </div>

              <div className="space-y-6 pt-2">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100/60 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-105 text-blue-600 flex items-center justify-center shrink-0">
                    <Palette size={16} />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-bold text-slate-700">Dynamic Tailwind CSS Mapping</p>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed font-semibold">
                      Our platform layout automatically intercepts standard blue attributes and compiles them into smooth, custom-branded colors using calculated high-definition hover states, shadows, and subtle light highlights.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                  {/* Color Pickers */}
                  <div className="space-y-5">
                    <div className="space-y-2 text-left">
                      <label className="text-[10px] uppercase font-black text-slate-400 tracking-wider font-mono">Predefined Brand Palettes</label>
                      <div className="grid grid-cols-2 gap-2.5">
                        {[
                          { hex: '#2563EB', label: 'Sabush Green' },
                          { hex: '#10b981', label: 'Emerald Green' },
                          { hex: '#2563EB', label: 'Teal Dream' },
                          { hex: '#D4AF37', label: 'Ochre Orange' },
                          { hex: '#ef4444', label: 'Crimson Red' },
                          { hex: '#93B4F5', label: 'Royal Purple' },
                          { hex: '#6B7280', label: 'Slate Carbon' },
                          { hex: '#E9CC85', label: 'Rose Bouquet' },
                        ].map(preset => {
                          const isSelected = formData.brandColor.toLowerCase() === preset.hex.toLowerCase();
                          return (
                            <button
                              key={preset.hex}
                              type="button"
                              onClick={() => {
                                setFormData(prev => ({ ...prev, brandColor: preset.hex }));
                                const root = document.documentElement;
                                const tints = getBrandTints(preset.hex);
                                root.style.setProperty('--brand-color', tints.primary);
                                root.style.setProperty('--brand-color-hover', tints.hover);
                                root.style.setProperty('--brand-color-light', tints.light);
                                root.style.setProperty('--brand-color-glow', tints.glow);
                              }}
                              className={cn(
                                "flex items-center gap-2 p-3 rounded-2xl border text-left text-xs font-bold transition-all relative select-none cursor-pointer active:scale-95",
                                isSelected
                                  ? "border-slate-800 bg-slate-900 text-white shadow-md shadow-slate-900/10"
                                  : "border-slate-100 bg-white text-slate-700 hover:border-slate-200"
                              )}
                            >
                              <span className="w-5 h-5 rounded-full border border-white/20 shadow-sm shrink-0" style={{ backgroundColor: preset.hex }} />
                              <span className="truncate">{preset.label}</span>
                              {isSelected && (
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-3 p-5 bg-slate-50 rounded-3xl border border-slate-100 text-left">
                      <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider font-mono block">Custom Brand Hex Color</span>
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <input 
                            type="color" 
                            value={formData.brandColor.startsWith('#') && formData.brandColor.length === 7 ? formData.brandColor : '#2563EB'} 
                            onChange={e => {
                              const hex = e.target.value;
                              setFormData(prev => ({ ...prev, brandColor: hex }));
                              const root = document.documentElement;
                              const tints = getBrandTints(hex);
                              root.style.setProperty('--brand-color', tints.primary);
                              root.style.setProperty('--brand-color-hover', tints.hover);
                              root.style.setProperty('--brand-color-light', tints.light);
                              root.style.setProperty('--brand-color-glow', tints.glow);
                            }}
                            className="w-12 h-10 rounded-2xl cursor-pointer border-0 outline-none bg-transparent"
                          />
                        </div>
                        <div className="flex-1">
                          <input 
                            type="text" 
                            value={formData.brandColor}
                            onChange={e => {
                              const hex = e.target.value;
                              setFormData(prev => ({ ...prev, brandColor: hex }));
                              if (hex.match(/^#[0-9A-Fa-f]{6}$/)) {
                                const root = document.documentElement;
                                const tints = getBrandTints(hex);
                                root.style.setProperty('--brand-color', tints.primary);
                                root.style.setProperty('--brand-color-hover', tints.hover);
                                root.style.setProperty('--brand-color-light', tints.light);
                                root.style.setProperty('--brand-color-glow', tints.glow);
                              }
                            }}
                            className="w-full px-4 py-2.5 outline-none rounded-xl border border-slate-200 text-sm font-mono font-extrabold uppercase bg-white text-slate-800 focus:ring-2 focus:ring-blue-500"
                            placeholder="#2563EB"
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-400 font-semibold leading-relaxed font-sans">
                        Input any 6-digit hex color format (e.g. #D4AF37). The system compiles high-contrast hover shades and safe overlay tints automatically.
                      </p>
                    </div>
                  </div>

                  {/* Realtime Live Theme Mockup Preview */}
                  <div className="bg-slate-50 border border-slate-200 p-6 rounded-3xl space-y-4 text-left">
                    <span className="text-[10px] uppercase font-black text-slate-450 tracking-widest block font-mono">Live Workspace Mockup Preview</span>
                    
                    {/* Simulated component mockup */}
                    <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                      {/* Interactive mock navigation tab */}
                      <div className="space-y-1">
                        <span className="text-[8px] font-black font-sans uppercase text-slate-400 tracking-wider block">Sidebar Navigation</span>
                        <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-xl border border-slate-100">
                          <div 
                            className="flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-[11px] font-bold text-white transition-all w-3/4 shadow-sm"
                            style={{ 
                              backgroundColor: `var(--brand-color, ${formData.brandColor})`,
                              boxShadow: `0 10px 15px -3px var(--brand-color-glow)`
                            }}
                          >
                            <Building size={12} />
                            <span>Dashboard Ativo</span>
                          </div>
                          <div className="flex items-center gap-2.5 px-3.5 py-2 text-[11px] font-bold text-slate-400">
                            <SettingsIcon size={12} />
                            <span>Vendas</span>
                          </div>
                        </div>
                      </div>

                      {/* Mock Buttons */}
                      <div className="space-y-1">
                        <span className="text-[8px] font-black font-sans uppercase text-slate-400 tracking-wider block">Action Buttons</span>
                        <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-50">
                          <button 
                            type="button"
                            className="px-3.5 py-1.5 rounded-xl text-[10px] text-white font-extrabold uppercase tracking-wider transition-all cursor-default"
                            style={{ backgroundColor: `var(--brand-color, ${formData.brandColor})` }}
                          >
                            Criar Fatura
                          </button>
                          <button 
                            type="button"
                            className="px-3.5 py-1.5 rounded-xl text-[10px] font-extrabold uppercase tracking-wider transition-all border cursor-default"
                            style={{ borderColor: `var(--brand-color, ${formData.brandColor})`, color: `var(--brand-color, ${formData.brandColor})` }}
                          >
                            Exportar PDF
                          </button>
                        </div>
                      </div>

                      {/* Mock alerts, notices or light badges */}
                      <div className="space-y-1">
                        <span className="text-[8px] font-black font-sans uppercase text-slate-400 tracking-wider block">Highlights & Soft Badges</span>
                        <div 
                          className="p-3 rounded-xl border text-[10px] font-bold leading-relaxed text-left flex gap-1.5 items-center"
                          style={{ 
                            backgroundColor: `var(--brand-color-light, ${getBrandTints(formData.brandColor).light})`, 
                            borderColor: `var(--brand-color-light, ${getBrandTints(formData.brandColor).light})`, 
                            color: `var(--brand-color, ${formData.brandColor})` 
                          }}
                        >
                          <div className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0" style={{ backgroundColor: `var(--brand-color, ${formData.brandColor})` }} />
                          <span>Fatura Paga · Enviar para WhatsApp</span>
                        </div>
                      </div>
                    </div>

                    <p className="text-[10px] text-slate-400 leading-normal font-sans font-medium">
                      💡 Clique em <strong className="text-slate-700">"Save All Changes"</strong> abaixo para persistir os valores permanentemente.
                    </p>
                  </div>
                </div>
              </div>
            </fieldset>
          </div>
        )}

          {activeTab === 'notifications' && (
            <fieldset disabled={!isSystemAdmin} className="space-y-6 animate-in fade-in duration-300 text-left">
              <div>
                <h3 className="text-xl font-black text-slate-900 font-sans tracking-tight">Configurações de Notificações</h3>
                <p className="text-sm text-slate-500 font-sans font-medium">
                  Configure o envio automático de faturas e lembretes de pagamento personalizados no WhatsApp por intermédio da API Oficial da Meta / WhatsApp Cloud API.
                </p>
              </div>

              <div className="max-w-3xl space-y-6 pt-2">
                {/* Left Column: Toggles & Connection */}
                <div className="space-y-6">
                  
                  {/* Connection Details Section */}
                  <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-5">
                    <div className="flex items-center gap-2.5 border-b border-slate-50 pb-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                        <MessageSquare size={16} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-800">Conexão WhatsApp Cloud API</h4>
                        <p className="text-[11px] text-slate-400 font-medium">Credenciais oficiais obtidas no painel de desenvolvedores da Meta.</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5">WhatsApp Cloud API Token (Access Token)</label>
                        <input 
                          type="password"
                          className="w-full p-3 text-sm bg-slate-50 border border-slate-200/80 rounded-2xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400 text-slate-800 font-mono"
                          placeholder="Ex: EAAG..."
                          value={formData.whatsappApiKey}
                          onChange={e => setFormData({...formData, whatsappApiKey: e.target.value})}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-600 mb-1.5">WhatsApp Phone Number ID</label>
                          <input 
                            className="w-full p-3 text-sm bg-slate-50 border border-slate-200/80 rounded-2xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400 text-slate-800 font-mono"
                            placeholder="Ex: 102938475610293"
                            value={formData.whatsappPhoneNumberId}
                            onChange={e => setFormData({...formData, whatsappPhoneNumberId: e.target.value})}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-600 mb-1.5">Número de Telefone da Empresa</label>
                          <input 
                            className="w-full p-3 text-sm bg-slate-50 border border-slate-200/80 rounded-2xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400 text-slate-800"
                            placeholder="Ex: +258841234567"
                            value={formData.whatsappPhone}
                            onChange={e => setFormData({...formData, whatsappPhone: e.target.value})}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5">Webhook URL (Make.com ou customizado)</label>
                        <input 
                          className="w-full p-3 text-sm bg-slate-50 border border-slate-200/80 rounded-2xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400 text-slate-800"
                          placeholder="https://hook.us1.make.com/..."
                          value={formData.webhookUrl}
                          onChange={e => setFormData({...formData, webhookUrl: e.target.value})}
                        />
                        <p className="text-[10px] text-slate-400 mt-1.5">URL de destino opcional para replicar eventos de faturamento e recebidos online.</p>
                      </div>

                      {/* Validar Credenciais Meta WhatsApp API */}
                      <div className="pt-3 border-t border-slate-100 flex flex-col gap-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="space-y-0.5">
                            <p className="text-xs font-bold text-slate-700">Verificação de Credenciais</p>
                            <p className="text-[10px] text-slate-400 font-medium">Verifique o Token de Acesso e Phone ID enviando uma solicitação de ping para a API da Meta.</p>
                          </div>
                          <button
                            type="button"
                            disabled={isValidatingWhatsApp}
                            onClick={validateWhatsAppCredentials}
                            className={cn(
                              "px-4 py-2 rounded-xl text-xs font-bold font-sans tracking-wide transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer shrink-0 border select-none active:scale-95",
                              isValidatingWhatsApp 
                                ? "bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                                : "bg-emerald-650 hover:bg-emerald-700 border-emerald-600 text-white shadow-emerald-600/10"
                            )}
                          >
                            {isValidatingWhatsApp ? (
                              <>
                                <Loader2 className="animate-spin" size={13} />
                                A Validar...
                              </>
                            ) : (
                              <>
                                <CheckCircle2 size={13} />
                                Testar Ligação Meta API
                              </>
                            )}
                          </button>
                        </div>

                        {/* Validation Feedback States */}
                        {whatsAppValidationStatus === 'valid' && (
                          <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-start gap-2 text-emerald-800 animate-in fade-in duration-250">
                            <CheckCircle2 className="shrink-0 text-emerald-600 mt-0.5" size={14} />
                            <div className="space-y-0.5">
                              <p className="text-xs font-bold">Credenciais Ativas e Válidas!</p>
                              <p className="text-[10px] text-emerald-600/90 font-medium">Conta conectada com sucesso à Meta. Nome verificado da linha: <strong className="text-emerald-800">{whatsAppVerifiedName}</strong>.</p>
                            </div>
                          </div>
                        )}

                        {whatsAppValidationStatus === 'cors_valid' && (
                          <div className="p-3 bg-blue-50 rounded-2xl border border-blue-100 flex items-start gap-2 text-blue-800 animate-in fade-in duration-250">
                            <Info className="shrink-0 text-blue-600 mt-0.5" size={14} />
                            <div className="space-y-0.5">
                              <p className="text-xs font-bold">Formato Válido (CORS Restrito)</p>
                              <p className="text-[10px] text-blue-600/90 leading-relaxed font-medium">
                                O formato das credenciais está correto! Uma conexão direta pelo navegador é bloqueada pelas políticas de CORS da Meta, mas suas configurações de Token de Acesso e ID numérico estão bem-formadas e prontas para uso seguro em produção.
                              </p>
                            </div>
                          </div>
                        )}

                        {whatsAppValidationStatus === 'invalid' && (
                          <div className="p-3 bg-rose-50 rounded-2xl border border-rose-100 flex items-start gap-2 text-rose-800 animate-in fade-in duration-250">
                            <AlertCircle className="shrink-0 text-rose-600 mt-0.5" size={14} />
                            <div className="space-y-0.5">
                              <p className="text-xs font-bold">Credenciais Rejeitadas pela Meta</p>
                              <p className="text-[10px] text-rose-600/95 leading-relaxed font-semibold">
                                Detalhes do erro: <span className="font-mono text-rose-700 bg-rose-100/50 px-1 py-0.5 rounded text-[9px]">{whatsAppValidationError}</span>. Certifique-se de que o token é válido e o Phone ID está correto.
                              </p>
                            </div>
                          </div>
                        )}

                        {whatsAppValidationStatus === 'error' && (
                          <div className="p-3 bg-amber-50 rounded-2xl border border-amber-100 flex items-start gap-2 text-amber-800 animate-in fade-in duration-250">
                            <AlertCircle className="shrink-0 text-amber-600 mt-0.5" size={14} />
                            <div className="space-y-0.5">
                              <p className="text-xs font-bold">Falha de Validação Estática</p>
                              <p className="text-[10px] text-amber-700 leading-relaxed font-semibold">
                                {whatsAppValidationError}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions / Dispatch Toggles Section */}
                  <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-5">
                    <div className="flex items-center gap-2.5 border-b border-slate-50 pb-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                        <Bell size={16} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-800">Gatilhos de Automação de Disparo</h4>
                        <p className="text-[11px] text-slate-400 font-medium">Defina quando o sistema deve enviar as mensagens WhatsApp de forma automática.</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {/* Toggle: Auto-Send Invoices */}
                      <div className="flex items-start justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl hover:bg-slate-100/60 transition-all">
                        <div className="space-y-0.5 max-w-[85%]">
                          <p className="text-xs font-bold text-slate-800">Envio Automático ao Emitir Faturas</p>
                          <p className="text-[10px] text-slate-500 leading-relaxed font-semibold">
                            Dispara a mensagem de cobrança instantaneamente para o WhatsApp do cliente assim que um novo talão de venda, POS ou fatura manual do ERP for gravado.
                          </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                          <input 
                            type="checkbox" 
                            className="sr-only peer" 
                            checked={formData.autoSendInvoices}
                            onChange={e => setFormData({...formData, autoSendInvoices: e.target.checked})}
                          />
                          <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                        </label>
                      </div>

                      {/* Toggle: Auto Payment Reminders */}
                      <div className="flex items-start justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl hover:bg-slate-100/60 transition-all">
                        <div className="space-y-0.5 max-w-[85%]">
                          <p className="text-xs font-bold text-slate-800">Lembretes Automáticos de Cobrança</p>
                          <p className="text-[10px] text-slate-500 leading-relaxed font-semibold">
                            Envia pings automatizados de cobrança/lembrete de pagamento no WhatsApp para clientes com faturas que se encontrem em atraso ou pendentes de pagamento.
                          </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                          <input 
                            type="checkbox" 
                            className="sr-only peer" 
                            checked={formData.autoReminders}
                            onChange={e => setFormData({...formData, autoReminders: e.target.checked})}
                          />
                          <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                        </label>
                      </div>

                      {/* Toggle: Auto Low Stock Alerts */}
                      <div className="flex items-start justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl hover:bg-slate-100/60 transition-all">
                        <div className="space-y-0.5 max-w-[85%]">
                          <p className="text-xs font-bold text-slate-800">Alertas de Stock Baixo Automáticos (WhatsApp)</p>
                          <p className="text-[10px] text-slate-500 leading-relaxed font-semibold">
                            Dispara alertas imediatos de stock baixo para o número de WhatsApp principal da empresa quando a quantidade física de um artigo for igual ou menor do que o limite de aviso mínimo especificado no Inventário.
                          </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                          <input 
                            type="checkbox" 
                            className="sr-only peer" 
                            checked={formData.autoLowStockAlerts}
                            onChange={e => setFormData({...formData, autoLowStockAlerts: e.target.checked})}
                          />
                          <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                        </label>
                      </div>

                      {/* Toggle: Auto Daily/Weekly WhatsApp summary report */}
                      <div className="flex items-start justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl hover:bg-slate-100/60 transition-all font-sans">
                        <div className="space-y-0.5 max-w-[85%]">
                          <p className="text-xs font-bold text-slate-800">Relatório Diário Automático via WhatsApp (Manhã)</p>
                          <p className="text-[10px] text-slate-500 leading-relaxed font-semibold">
                            Gera e envia de forma automatizada todas as manhãs (no primeiro login diário do gestor) um relatório executivo contendo vendas gerais, totais de despesa, lucros estimados e alertas críticos para seu telemóvel.
                          </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                          <input 
                            type="checkbox" 
                            className="sr-only peer" 
                            checked={formData.autoSendDailyWhatsAppReport || false}
                            onChange={e => setFormData({...formData, autoSendDailyWhatsAppReport: e.target.checked})}
                          />
                          <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* --- WhatsApp Test & Diagnostic End-to-End Console --- */}
                <div className="mt-8 bg-slate-900 text-white rounded-3xl p-6 border border-slate-800 shadow-xl font-sans overflow-hidden">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4 mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/20">
                        <Terminal size={18} />
                      </div>
                      <div>
                        <h4 className="text-base font-bold text-slate-100 flex items-center gap-2">
                          Harness de Teste & Diagnóstico de Automações WhatsApp
                          <span className="px-2 py-0.5 text-[9px] font-mono tracking-widest uppercase rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">End-to-End</span>
                        </h4>
                        <p className="text-[11px] text-slate-400 font-medium">Configure e simule instantaneamente os 4 gatilhos de automação WhatsApp com relatórios em tempo real.</p>
                      </div>
                    </div>
                    
                    {/* Sandbox Toggle Mode Switcher */}
                    <div className="flex items-center gap-3 bg-slate-950/80 px-4 py-2 border border-slate-800 rounded-2xl shrink-0">
                      <span className="text-[11px] font-bold text-slate-400 cursor-help" title="Se ativo, simula as chamadas de API sem requer token Meta ou número real ativo, validando apenas o conteúdo compilado e estrutura de dados.">
                        Modo Sandbox (Simulado da Meta)
                      </span>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0">
                        <input 
                          type="checkbox" 
                          className="sr-only peer" 
                          checked={testSandboxMode}
                          onChange={e => {
                            setTestSandboxMode(e.target.checked);
                            setTestLogs(prev => [
                              ...prev,
                              {
                                timestamp: new Date().toLocaleTimeString(),
                                type: 'info',
                                message: `Modo alterado para ${e.target.checked ? 'SANDBOX SIMULADO' : 'REAL META CLOUD API (Requer credenciais válidas configuradas)'}.`
                              }
                            ]);
                          }}
                        />
                        <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Left Column: Selector & Parameters Form */}
                    <div className="lg:col-span-5 space-y-5 flex flex-col justify-between">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest font-mono">1. Selecionar Gatilho de Automação</label>
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { id: 'invoice', label: 'Criação Fatura', desc: 'Disparo de venda imediato' },
                              { id: 'stock', label: 'Alerta de Stock', desc: 'Aviso crítico de stock' },
                              { id: 'overdue', label: 'Lembrete Cobrança', desc: 'Overdue / Fatura pendente' },
                              { id: 'report', label: 'Relatório Diário', desc: 'Financeiro do Gestor' }
                            ].map(scenario => (
                              <button
                                key={scenario.id}
                                type="button"
                                onClick={() => setTestScenario(scenario.id as any)}
                                className={cn(
                                  "p-3 rounded-2xl border text-left transition-all active:scale-95 cursor-pointer flex flex-col justify-between gap-1",
                                  testScenario === scenario.id
                                    ? "bg-slate-800 border-emerald-500 text-white ring-1 ring-emerald-500/20"
                                    : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                                )}
                              >
                                <span className="text-xs font-bold block">{scenario.label}</span>
                                <span className="text-[9px] opacity-60 leading-tight font-medium block">{scenario.desc}</span>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Overridable Field Overrides */}
                        <div className="bg-slate-950 p-4 rounded-3xl border border-slate-800 space-y-3 text-left">
                          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest font-mono border-b border-slate-800/60 pb-1.5">2. Parâmetros de Teste Dinâmicos</label>
                          
                          <div className="grid grid-cols-1 gap-3">
                            <div>
                              <label className="block text-[10px] text-slate-500 font-extrabold uppercase mb-1">Telemóvel Destinatário</label>
                              <input 
                                type="text"
                                value={testRecipientPhone}
                                onChange={e => setTestRecipientPhone(e.target.value)}
                                className="w-full p-2.5 text-xs bg-slate-900 border border-slate-800 rounded-xl outline-none focus:border-emerald-500 text-slate-200 font-mono"
                                placeholder="Destino com código país. Ex: +258841234567"
                              />
                            </div>

                            {/* Conditional params depending on tab */}
                            {(testScenario === 'invoice' || testScenario === 'overdue') && (
                              <div className="grid grid-cols-2 gap-2 animate-in fade-in duration-200">
                                <div>
                                  <label className="block text-[10px] text-slate-500 font-extrabold uppercase mb-1">Nome Cliente</label>
                                  <input 
                                    type="text"
                                    value={testCustomerName}
                                    onChange={e => setTestCustomerName(e.target.value)}
                                    className="w-full p-2.5 text-xs bg-slate-900 border border-slate-800 rounded-xl outline-none text-slate-200"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] text-slate-500 font-extrabold uppercase mb-1">Nº Fatura</label>
                                  <input 
                                    type="text"
                                    value={testInvoiceNumber}
                                    onChange={e => setTestInvoiceNumber(e.target.value)}
                                    className="w-full p-2.5 text-xs bg-slate-900 border border-slate-800 rounded-xl outline-none text-slate-200 font-mono"
                                  />
                                </div>
                              </div>
                            )}

                            {testScenario === 'stock' && (
                              <div className="grid grid-cols-3 gap-2 animate-in fade-in duration-200">
                                <div className="col-span-3">
                                  <label className="block text-[10px] text-slate-500 font-extrabold uppercase mb-1">Nome do Artigo/Artigos</label>
                                  <input 
                                    type="text"
                                    value={testProductName}
                                    onChange={e => setTestProductName(e.target.value)}
                                    className="w-full p-2.5 text-xs bg-slate-900 border border-slate-800 rounded-xl outline-none text-slate-200"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] text-slate-500 font-extrabold uppercase mb-1">Stock Atual</label>
                                  <input 
                                    type="number"
                                    value={testCurrentStock}
                                    onChange={e => setTestCurrentStock(Number(e.target.value))}
                                    className="w-full p-2.5 text-xs bg-slate-900 border border-slate-800 rounded-xl outline-none text-slate-200 font-mono"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] text-slate-500 font-extrabold uppercase mb-1">Minimo Alerta</label>
                                  <input 
                                    type="number"
                                    value={testMinStock}
                                    onChange={e => setTestMinStock(Number(e.target.value))}
                                    className="w-full p-2.5 text-xs bg-slate-900 border border-slate-800 rounded-xl outline-none text-slate-200 font-mono"
                                  />
                                </div>
                              </div>
                            )}

                            {(testScenario === 'invoice' || testScenario === 'overdue' || testScenario === 'report') && (
                              <div className="animate-in fade-in duration-200">
                                <label className="block text-[10px] text-slate-500 font-extrabold uppercase mb-1">
                                  {testScenario === 'report' ? 'Faturamento Diário Resumo' : 'Valor Total da Fatura (MZN)'}
                                </label>
                                <input 
                                  type="number"
                                  value={testTotalAmount}
                                  onChange={e => setTestTotalAmount(Number(e.target.value))}
                                  className="w-full p-2.5 text-xs bg-slate-900 border border-slate-800 rounded-xl outline-none text-slate-200 font-mono"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Execution Action Button */}
                      <button
                        type="button"
                        disabled={isTestingWhatsApp}
                        onClick={runWhatsAppTest}
                        className={cn(
                          "w-full py-4 px-5 mt-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 select-none cursor-pointer border shadow-lg transition-all",
                          isTestingWhatsApp
                            ? "bg-slate-800 border-slate-700 text-slate-400 cursor-not-allowed"
                            : "bg-emerald-600 hover:bg-emerald-500 border-emerald-500 text-white shadow-emerald-950/20 active:scale-95 hover:shadow-xl hover:shadow-emerald-500/10"
                        )}
                      >
                        {isTestingWhatsApp ? (
                          <>
                            <Loader2 className="animate-spin" size={16} />
                            A Disparar Chamada...
                          </>
                        ) : (
                          <>
                            <Play size={16} fill="currentColor" />
                            Disparar Teste de Automação
                          </>
                        )}
                      </button>
                    </div>

                    {/* Right Column: Interactive Diagnostic Output Logger console */}
                    <div className="lg:col-span-7 flex flex-col h-[420px] border border-slate-800 bg-[#0B1F4D] rounded-3xl overflow-hidden shadow-inner">
                      {/* Terminal header */}
                      <div className="bg-[#0B1F4D] border-b border-slate-800/80 px-4 py-3 flex items-center justify-between shrink-0 font-mono text-[10px]">
                        <div className="flex items-center gap-2">
                          <div className="flex gap-1">
                            <span className="w-2.5 h-2.5 rounded-full bg-red-500/80"></span>
                            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80"></span>
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80"></span>
                          </div>
                          <span className="text-slate-400 font-bold ml-1.5 uppercase tracking-wide">W-LOG TRACER v1.1</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setTestLogs([{ timestamp: new Date().toLocaleTimeString(), type: 'info', message: 'Consola resetada por administrador. Pronto para novo disparo.' }])}
                          className="px-2.5 py-1 text-slate-400 hover:text-white font-bold bg-[#0B1F4D] hover:bg-[#0B1F4D] border border-slate-850 rounded-lg transition-all cursor-pointer text-[9px]"
                        >
                          Limpar Consola
                        </button>
                      </div>

                      {/* Output terminal feed */}
                      <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px] leading-relaxed space-y-3 scrollbar-thin scrollbar-thumb-slate-800">
                        {testLogs.map((log, idx) => {
                          const isRequest = log.type === 'request';
                          const isResponse = log.type === 'response';
                          const isExpanded = showLogDetailsIdx === idx;

                          let textColor = 'text-slate-300';
                          let labelPrefix = '[LOG]';
                          
                          if (log.type === 'info') { labelPrefix = '[INFO]'; textColor = 'text-slate-300'; }
                          else if (log.type === 'success') { labelPrefix = '[✓ SUCESSO]'; textColor = 'text-emerald-400 font-semibold'; }
                          else if (log.type === 'warn') { labelPrefix = '[⚠ ALERTA]'; textColor = 'text-yellow-400'; }
                          else if (log.type === 'error') { labelPrefix = '[✗ ERRO]'; textColor = 'text-red-400 font-bold'; }
                          else if (log.type === 'request') { labelPrefix = '[REQUEST-API]'; textColor = 'text-indigo-300 font-medium'; }
                          else if (log.type === 'response') { labelPrefix = '[RESPONSE-API]'; textColor = 'text-purple-300 font-medium'; }

                          return (
                            <div key={idx} className="space-y-1 bg-slate-950/45 p-2 rounded-xl border border-slate-900 text-left">
                              <div className="flex items-start justify-between gap-2">
                                <div className="space-y-1 overflow-x-auto">
                                  <span className="text-[9px] text-slate-550 select-none mr-2">[{log.timestamp}]</span>
                                  <span className={cn(textColor, "mr-1")}>{labelPrefix}</span>
                                  <span className={cn(textColor, "whitespace-pre-wrap leading-relaxed")}>{log.message}</span>
                                </div>
                                
                                {/* Expander for request/response bodies */}
                                {(isRequest || isResponse) && (
                                  <button
                                    type="button"
                                    onClick={() => setShowLogDetailsIdx(isExpanded ? null : idx)}
                                    className="px-2 py-0.5 text-[9px] text-slate-400 hover:text-white bg-slate-850 hover:bg-slate-800 border border-slate-800 rounded-md shrink-0 cursor-pointer flex items-center gap-1 transition-all uppercase font-semibold"
                                  >
                                    {isExpanded ? 'Ocultar' : 'Detalhes'}
                                    <ChevronRight size={10} className={cn("transition-transform duration-200", isExpanded && "rotate-90")} />
                                  </button>
                                )}
                              </div>

                              {/* Expanded Payload Section */}
                              {(isRequest || isResponse) && isExpanded && log.details && (
                                <div className="mt-2 bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-[10px] text-slate-400 space-y-2 overflow-x-auto overflow-y-hidden transition-all animate-in slide-in-from-top-2 duration-200">
                                  {isRequest && (
                                    <>
                                      <div><span className="text-indigo-400 font-bold">MÉTODO:</span> {log.details.method}</div>
                                      <div><span className="text-indigo-400 font-bold">ENDPOINT URL:</span> <span className="text-slate-350">{log.details.url}</span></div>
                                      <div>
                                        <span className="text-indigo-400 font-bold">HEADERS:</span>
                                        <pre className="text-slate-400 bg-slate-900/50 p-2 rounded-lg mt-1 border border-slate-850">{JSON.stringify(log.details.headers, null, 2)}</pre>
                                      </div>
                                      <div>
                                        <span className="text-indigo-400 font-bold">BODY (PAYLOAD):</span>
                                        <pre className="text-slate-350 bg-slate-900/50 p-2 rounded-lg mt-1 border border-slate-850">{JSON.stringify(log.details.body, null, 2)}</pre>
                                      </div>
                                    </>
                                  )}
                                  {isResponse && (
                                    <>
                                      <div><span className="text-purple-400 font-bold">STATUS HTTP:</span> {log.message}</div>
                                      <div>
                                        <span className="text-purple-400 font-bold">BODY DE RETORNO:</span>
                                        <pre className="text-slate-350 bg-slate-900/50 p-2 rounded-lg mt-1 border border-slate-850">{JSON.stringify(log.details, null, 2)}</pre>
                                      </div>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Footer Info of terminal */}
                      <div className="bg-[#0B1F4D] border-t border-slate-800 px-4 py-2 flex items-center justify-between shrink-0 font-mono text-[9px] text-slate-500">
                        <span>ESTADO: {isTestingWhatsApp ? 'A EXECUTAR...' : 'A GUARDAR COMANDO'}</span>
                        <span>MOCKING PROTOCOL: {testSandboxMode ? 'SANDBOX ACTIVE' : 'LIVE API'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </fieldset>
          )}

          {activeTab === 'templates' && (() => {
            const currentPlan = (businessData?.subscription?.plan || businessData?.subscriptionPlan || 'basico').toLowerCase();
            const isBasico = currentPlan === 'basico';

            if (isBasico) {
              return (
                <div className="p-8 bg-white border border-slate-200 rounded-[32px] text-center max-w-xl mx-auto my-12 space-y-6">
                  <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                    <Lock size={32} />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold text-slate-900 font-sans">Módulo de Automação de WhatsApp Bloqueado</h3>
                    <p className="text-slate-500 text-sm leading-relaxed">
                      O envio automático de faturas, alertas de stock e lembretes de pagamento via WhatsApp é um recurso exclusivo dos planos <strong>Pro</strong> e <strong>Enterprise</strong>. 
                      Faça upgrade na secção de Subscrição para ativar a aceleração por mensagens instantâneas.
                    </p>
                  </div>
                </div>
              );
            }

            return (
              <fieldset disabled={!isSystemAdmin} className="space-y-6 animate-in fade-in duration-300 text-left">
              <div>
                <h3 className="text-xl font-black text-slate-900 font-sans tracking-tight">Templates de WhatsApp</h3>
                <p className="text-sm text-slate-500 font-sans font-medium">
                  Personalize as mensagens automatizadas enviadas via WhatsApp para faturas, lembretes de cobrança e alertas de stock do seu negócio.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start pt-2">
                {/* Left Column: Template Editor UI */}
                <div className="lg:col-span-7 space-y-6">
                  <div className="bg-[#FFFFFF] p-6 rounded-[32px] border border-slate-150 shadow-sm space-y-6">
                    {/* Tab Selection */}
                    <div>
                      <h4 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider font-sans mb-3">Selecionar Tipo de Template</h4>
                      <div className="flex bg-slate-150/40 p-1 rounded-2xl border border-slate-200 gap-1">
                        <button
                          type="button"
                          onClick={() => setActivePreviewTab('invoice')}
                          className={cn(
                            "flex-1 py-3 text-xs font-bold rounded-xl transition-all select-none cursor-pointer",
                            activePreviewTab === 'invoice' 
                              ? "bg-slate-900 text-white shadow-sm"
                              : "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
                          )}
                        >
                          Nova Fatura (Venda)
                        </button>
                        <button
                          type="button"
                          onClick={() => setActivePreviewTab('reminder')}
                          className={cn(
                            "flex-1 py-3 text-xs font-bold rounded-xl transition-all select-none cursor-pointer",
                            activePreviewTab === 'reminder' 
                              ? "bg-slate-900 text-white shadow-sm"
                              : "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
                          )}
                        >
                          Lembrete de Cobrança
                        </button>
                        <button
                          type="button"
                          onClick={() => setActivePreviewTab('lowStock')}
                          className={cn(
                            "flex-1 py-3 text-xs font-bold rounded-xl transition-all select-none cursor-pointer",
                            activePreviewTab === 'lowStock' 
                              ? "bg-slate-900 text-white shadow-sm"
                              : "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
                          )}
                        >
                          Aviso de Stock Baixo
                        </button>
                      </div>
                    </div>

                    {/* Rich editor textarea & dynamic helper insertion tags */}
                    <div className="space-y-4">
                      {activePreviewTab === 'invoice' ? (
                        <div className="space-y-2 text-left animate-in fade-in duration-250">
                          <label className="block text-xs font-extrabold text-slate-700">Template de Envio Automatizado de Fatura</label>
                          <p className="text-[11px] text-slate-500 leading-relaxed font-sans mb-1">
                            Esta mensagem será enviada automaticamente para o telemóvel do cliente imediatamente ao registar uma nova fatura (crédito, pronto pagamento ou POS).
                          </p>
                          <textarea
                            className="w-full h-48 p-4 text-xs bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all resize-y text-slate-800 leading-relaxed font-mono shadow-inner"
                            value={formData.invoiceTemplate}
                            onChange={e => setFormData({...formData, invoiceTemplate: e.target.value})}
                            placeholder="Escreva a mensagem..."
                          />
                        </div>
                      ) : activePreviewTab === 'reminder' ? (
                        <div className="space-y-2 text-left animate-in fade-in duration-250">
                          <label className="block text-xs font-extrabold text-slate-700">Template de Lembrete de Pagamento</label>
                          <p className="text-[11px] text-slate-500 leading-relaxed font-sans mb-1">
                            Disparado para realizar pings e lembretes de faturas pendentes ou vencidas no WhatsApp do cliente.
                          </p>
                          <textarea
                            className="w-full h-48 p-4 text-xs bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all resize-y text-slate-800 leading-relaxed font-mono shadow-inner"
                            value={formData.reminderTemplate}
                            onChange={e => setFormData({...formData, reminderTemplate: e.target.value})}
                            placeholder="Escreva a mensagem..."
                          />
                        </div>
                      ) : (
                        <div className="space-y-2 text-left animate-in fade-in duration-250">
                          <label className="block text-xs font-extrabold text-slate-700">Template de Alerta de Stock Baixo</label>
                          <p className="text-[11px] text-slate-500 leading-relaxed font-sans mb-1">
                            Mensagem disparada para o contacto da empresa quando algum item atinge ou ultrapassa o limite mínimo definido.
                          </p>
                          <textarea
                            className="w-full h-48 p-4 text-xs bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all resize-y text-slate-800 leading-relaxed font-mono shadow-inner"
                            value={formData.lowStockTemplate}
                            onChange={e => setFormData({...formData, lowStockTemplate: e.target.value})}
                            placeholder="Escreva a mensagem..."
                          />
                        </div>
                      )}

                      {/* Info on Quick Tags */}
                      <div className="space-y-3 bg-white p-4 rounded-xl border border-slate-150 text-left">
                        <span className="text-[10px] uppercase font-black text-slate-450 tracking-wider font-mono block">Palavras-chave Suportadas (Clique para Inserir)</span>
                        <p className="text-[10px] text-slate-500 leading-none">Insira os códigos dinâmicos que o sistema substituirá automaticamente pelos dados reais do cliente e da fatura:</p>
                        <div className="flex flex-wrap gap-2 pt-1">
                          {tags.map(tag => (
                            <button
                              key={tag.code}
                              type="button"
                              onClick={() => insertPlaceholder(tag.code, activePreviewTab === 'invoice' ? 'invoiceTemplate' : activePreviewTab === 'reminder' ? 'reminderTemplate' : 'lowStockTemplate')}
                              className="px-3 py-2 bg-slate-50 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 border border-slate-200 rounded-xl text-[10px] font-mono font-semibold text-slate-600 transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
                              title={tag.label}
                            >
                              <span className="text-emerald-600 font-extrabold">{tag.code}</span>
                              <span className="text-slate-400 font-normal ml-1 border-l border-slate-200 pl-1.5 text-[9px]">{tag.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column: WhatsApp Mockup Live Balloon Preview */}
                <div className="lg:col-span-5 space-y-6">
                  <div className="bg-slate-950 p-5 rounded-[32px] border border-slate-800 space-y-4 relative shadow-xl overflow-hidden min-h-[480px] flex flex-col justify-between" style={{ backgroundImage: 'radial-gradient(#111111 1.2px, transparent 0)', backgroundSize: '20px 20px' }}>
                    
                    {/* Phone/WhatsApp Status Bar Header */}
                    <div className="space-y-3 shrink-0">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center font-black text-sm uppercase tracking-wide">
                            {businessData?.name?.slice(0, 1) || 'S'}
                          </div>
                          <div className="text-left leading-none">
                            <span className="text-xs font-black text-white block">
                              {businessData?.name || 'Sabush ERP Alertas'}
                            </span>
                            <span className="text-[9px] text-emerald-400 font-bold block mt-0.5 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                              Online
                            </span>
                          </div>
                        </div>
                        <span className="text-[9px] font-black font-mono text-slate-500 tracking-wider bg-slate-900 border border-slate-800 px-2 py-1 rounded-md uppercase">Previsualização Real</span>
                      </div>
                      
                      {/* Safety Info Badge bubble in Chat */}
                      <div className="flex justify-center">
                        <span className="bg-amber-500/10 text-amber-400 text-[9px] font-semibold py-1 px-3 rounded-xl border border-amber-500/20 text-center leading-relaxed">
                          🔒 As mensagens são encriptadas de ponta a ponta oficial via API da Meta.
                        </span>
                      </div>
                    </div>

                    {/* Chat Bubble Balloon (Takes remaining space) */}
                    <div className="flex-1 flex flex-col justify-start pt-4">
                      <div className="flex justify-start">
                        <div className="bg-[#2563EB] text-white p-4 rounded-3xl rounded-tl-none max-w-[95%] text-left relative shadow-md border border-[#2563EB] space-y-2 transition-all">
                          <div className="text-[11.5px] leading-relaxed whitespace-pre-wrap font-sans">
                            {getMockPreviewText(activePreviewTab === 'invoice' ? formData.invoiceTemplate : activePreviewTab === 'reminder' ? formData.reminderTemplate : formData.lowStockTemplate)}
                          </div>
                          <div className="text-[8px] font-bold text-[#93B4F5] text-right mt-1.5 select-none font-mono flex items-center justify-end gap-1">
                            <span>12:28</span>
                            <span className="text-sky-455 font-bold">✓✓</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Chat Typing Input Footer bar Mock */}
                    <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-2xl flex items-center justify-between gap-2.5 shrink-0">
                      <div className="flex items-center gap-2 text-slate-500">
                        <span className="text-sm">😊</span>
                        <span className="text-xs font-bold font-mono">📎</span>
                      </div>
                      <div className="flex-1 bg-slate-800 py-1.5 px-3 rounded-full text-slate-400 text-[10px] text-left">
                        Mensagem escrita automaticamente...
                      </div>
                      <div className="w-7 h-7 rounded-full bg-[#2563EB] flex items-center justify-center text-white text-xs shadow">
                        🎤
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </fieldset>
          );
        })()}

          {activeTab === 'branches' && (() => {
            const currentPlan = (businessData?.subscription?.plan || businessData?.subscriptionPlan || 'basico').toLowerCase();
            const isEnterprise = currentPlan === 'enterprise';

            if (!isEnterprise) {
              return (
                <div className="p-8 bg-white border border-slate-200 rounded-[32px] text-center max-w-xl mx-auto my-12 space-y-6">
                  <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                    <Lock size={32} />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold text-slate-900">Módulo Multi-loja Bloqueado</h3>
                    <p className="text-slate-500 text-sm leading-relaxed">
                      A gestão de localizações físicas, armazéns e filiais está disponível exclusivamente no plano <strong>Enterprise</strong>. 
                      Faça upgrade na secção de Subscrição para unificar as suas operações em rede.
                    </p>
                  </div>
                </div>
              );
            }

            return (
              <fieldset disabled={!isSystemAdmin} className="space-y-8 animate-in fade-in duration-300 text-left">
                <div>
                  <h3 className="text-xl font-black text-slate-900 font-sans tracking-tight">Gestão de Lojas e Filiais (Branches)</h3>
                  <p className="text-sm text-slate-500 font-sans font-medium">
                    Registe e faça a gestão física das localizações e filiais do seu negócio.
                  </p>
                </div>

                {/* Add Branch Card */}
                <div className="p-6 bg-[#FFFFFF] rounded-[32px] border border-slate-150 shadow-sm space-y-6">
                  <div>
                    <h4 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider font-sans">Registar Nova Filial</h4>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed font-semibold">
                      Adicione um novo armazém ou loja física. O stock de vendas online será automaticamente sincronizado ou rateado para todas as filiais registadas.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1 text-left">
                      <label className="block text-xs font-bold text-slate-600">Nome da Filial / Loja</label>
                      <input
                        type="text"
                        className="w-full p-3 text-xs bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500/25 outline-none transition-all text-slate-850"
                        placeholder="Ex: Sabush Maputo - Matola, Armazém Central"
                        value={newBranchName}
                        onChange={e => setNewBranchName(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1 text-left">
                      <label className="block text-xs font-bold text-slate-600">Localização / Endereço</label>
                      <input
                        type="text"
                        className="w-full p-3 text-xs bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500/25 outline-none transition-all text-slate-850"
                        placeholder="Ex: Av. 24 de Julho, Maputo"
                        value={newBranchLocation}
                        onChange={e => setNewBranchLocation(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={handleAddBranch}
                      disabled={isAddingBranch || !newBranchName.trim()}
                      className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-md shadow-indigo-600/10 text-xs"
                    >
                      {isAddingBranch ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                      Adicionar Nova Loja
                    </button>
                  </div>
                </div>

                {/* Branches List Card */}
                <div className="p-6 bg-white rounded-[32px] border border-slate-150 shadow-sm space-y-6">
                  <div>
                    <h4 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider font-sans">Lojas e Filiais Ativas ({branchesList.length})</h4>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed font-semibold">
                      Lista de localizações onde a sua mercadoria é comercializada.
                    </p>
                  </div>

                  {branchesLoading ? (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
                      <Loader2 size={32} className="animate-spin text-indigo-500" />
                      <p className="text-xs font-bold font-sans uppercase tracking-widest">A carregar lojas...</p>
                    </div>
                  ) : branchesList.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-400 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                      <MapPin size={32} className="text-slate-350 stroke-1" />
                      <p className="text-xs font-bold font-sans uppercase tracking-widest mt-2">Nenhuma filial registada</p>
                      <p className="text-[11px] text-slate-400 mt-1">Registe a sua loja acima para sincronizar stock.</p>
                    </div>
                  ) : (
                    <div className="overflow-hidden border border-slate-150 rounded-2xl bg-slate-50/30">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-100/50 text-slate-500 border-b border-slate-150 uppercase text-[10px] tracking-wider font-extrabold font-sans">
                            <th className="p-4">Identificador único</th>
                            <th className="p-4">Nome da Loja</th>
                            <th className="p-4">Localização / Endereço</th>
                            <th className="p-4 text-right">Ação</th>
                          </tr>
                        </thead>
                        <tbody>
                          {branchesList.map(branch => (
                            <tr key={branch.id} className="hover:bg-slate-50/50 text-slate-650 font-medium border-b border-slate-100 transition animate-in fade-in duration-100">
                              <td className="p-4 font-mono text-[9px] text-slate-400 max-w-[100px] truncate" title={branch.id}>
                                {branch.id}
                              </td>
                              <td className="p-4 font-sans font-bold text-slate-900">
                                {branch.name}
                              </td>
                              <td className="p-4 font-sans text-slate-500">
                                {branch.location}
                              </td>
                              <td className="p-4 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteBranch(branch.id)}
                                  className="p-2 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                                  title="Eliminar Filial"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </fieldset>
            );
          })()}

          {activeTab === 'printer' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div>
                <h3 className="text-lg font-bold">Printer Setup</h3>
                <p className="text-sm text-slate-500">Configure auto-printing settings for your manual and POS transactions.</p>
              </div>

              <div className="space-y-4 pt-4">
                <div className="p-4 bg-blue-50 rounded-2xl flex gap-3 text-blue-700 border border-blue-100">
                  <Printer size={20} className="shrink-0" />
                  <p className="text-xs font-medium">Auto-printing sends the invoice/receipt straight to your connected system or POS printer as soon as you record it.</p>
                </div>

                <div className="flex items-center justify-between p-6 bg-slate-50 rounded-3xl border border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 text-blue-600 rounded-xl"><Printer size={18} /></div>
                    <div>
                        <p className="font-bold text-slate-900">Auto Print on Save</p>
                        <p className="text-xs text-slate-500">Automatically open standard system print dialog when a manual invoice or POS checkout completes.</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={formData.autoPrintOnCreate}
                        onChange={e => setFormData({...formData, autoPrintOnCreate: e.target.checked})}
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700">Printer Template / Size</label>
                  <p className="text-xs text-slate-400">Choose formatting optimized for standard office paper or thermal POS receipt hardware dimensions.</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                    {[
                      { id: 'standard', name: 'Standard A4 Sheet', desc: 'Main full-page commercial invoice format' },
                      { id: 'thermal_80mm', name: '80mm POS Thermal', desc: 'Ideal for standard counter-top thermal receipt printers' },
                      { id: 'thermal_58mm', name: '58mm Mini Thermal', desc: 'Compact layout optimized for narrow/portable bluetooth printers' }
                    ].map(printer => (
                      <button
                        key={printer.id}
                        type="button"
                        onClick={() => setFormData({...formData, printerType: printer.id})}
                        className={`p-4 rounded-3xl border-2 transition-all text-left flex flex-col justify-between h-32 ${
                          formData.printerType === printer.id ? 'border-blue-600 bg-blue-50/50 text-blue-900' : 'border-slate-100 hover:border-slate-200 bg-white text-slate-700'
                        }`}
                      >
                        <p className="font-bold text-xs">{printer.name}</p>
                        <p className="text-[10px] text-slate-500 leading-tight mt-1">{printer.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-slate-100">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700">Printer Connection / Interface (Hardware)</label>
                    <p className="text-xs text-slate-400">Specify how the printer is linked to your system (Wi-Fi, Bluetooth, or Cable/USB).</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2">
                      {[
                        { id: 'system', name: 'System Default', desc: 'Uses standard system print dialog (Recommended for general USB/Drivers)' },
                        { id: 'usb_cable', name: 'Cable USB / Local Driver', desc: 'Connected via USB cable or local COM controller with a printer queue' },
                        { id: 'bluetooth', name: 'Bluetooth Wireless', desc: 'Portable wireless receipt printers (e.g. paired over bluetooth device index)' },
                        { id: 'wifi_network', name: 'Network Wi-Fi / IP', desc: 'Direct network connection via static IP on the local subnetwork' }
                      ].map(conn => (
                        <button
                          key={conn.id}
                          type="button"
                          onClick={() => setFormData({...formData, printerInterface: conn.id})}
                          className={`p-4 rounded-3xl border-2 transition-all text-left flex flex-col justify-between h-32 ${
                            formData.printerInterface === conn.id ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900' : 'border-slate-100 hover:border-slate-200 bg-white text-slate-700'
                          }`}
                        >
                          <p className="font-bold text-xs">{conn.name}</p>
                          <p className="text-[10px] text-slate-500 leading-tight mt-1">{conn.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {formData.printerInterface === 'wifi_network' && (
                    <div className="p-5 bg-indigo-50/50 rounded-3xl border border-indigo-100 grid grid-cols-1 md:grid-cols-2 gap-4 animate-in slide-in-from-top-2 duration-200">
                      <div>
                        <label className="block text-xs font-bold text-indigo-950 uppercase mb-2">Wi-Fi Printer IP Address</label>
                        <input
                          type="text"
                          placeholder="e.g. 192.168.1.100"
                          value={formData.printerIpAddress || ''}
                          onChange={e => setFormData({...formData, printerIpAddress: e.target.value})}
                          className="w-full px-4 py-3 bg-white border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none rounded-2xl text-xs font-mono font-bold text-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-indigo-950 uppercase mb-2">RAW Port</label>
                        <input
                          type="text"
                          placeholder="9100"
                          value={formData.printerPort || '9100'}
                          onChange={e => setFormData({...formData, printerPort: e.target.value})}
                          className="w-full px-4 py-3 bg-white border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none rounded-2xl text-xs font-mono font-bold text-slate-800"
                        />
                      </div>
                    </div>
                  )}

                  {/* Operational Guide Panel */}
                  <div className="p-5 bg-slate-50 rounded-3xl border border-slate-100 space-y-3">
                    <p className="font-bold text-xs text-slate-700">Manual de Ligação Física & Redes:</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[11px] text-slate-500 leading-relaxed">
                      <div className="space-y-1.5">
                        <p className="font-semibold text-slate-800 flex items-center gap-1.5">🔌 Cabo USB & Drivers:</p>
                        <p>Ligue o cabo USB. O Windows, macOS ou Linux irá detectar automaticamente. Seleccione o modo <strong>System Default</strong> para abrir o assistente clássico do navegador e encaminhar o talão directamente para a fila de impressão térmica com controlo de guilhotina.</p>
                      </div>
                      <div className="space-y-1.5">
                        <p className="font-semibold text-slate-800 flex items-center gap-1.5">📱 Bluetooth Portátil:</p>
                        <p>Active o Bluetooth e emparelhe o seu mini-terminal (como "MTP-II" ou "PT-210" usando o PIN 0000 ou 1234). Em dispositivos móveis ou computadores, o driver virtual mapeia os dados para que funcionem fluidamente no POS.</p>
                      </div>
                      <div className="space-y-1.5">
                        <p className="font-semibold text-slate-800 flex items-center gap-1.5">🌐 Wi-Fi & Rede IP:</p>
                        <p>Atribua um endereço IP fixo à impressora na sua interface (ex: 192.168.1.100). Certifique-se de que o computador ou tablet de venda está ligado à mesma subrede Wi-Fi local para comunicar instantaneamente pela porta 9100.</p>
                      </div>
                    </div>
                  </div>

                  {/* Diagnostic Test Button */}
                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        printTestPageHTML(
                          formData.printerType,
                          formData.printerInterface,
                          formData.printerIpAddress,
                          formData.printerPort,
                          formData.businessName || 'SABUSH SYSTEM ERP'
                        );
                      }}
                      className="px-5 py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs flex items-center gap-2 transition-all active:scale-95 shadow-md hover:shadow-lg cursor-pointer"
                    >
                      <Printer size={14} />
                      <span>Diagnóstico: Imprimir Página de Teste</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'i18n' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <h3 className="text-lg font-bold">Localização & Moedas</h3>
              
              <div className="space-y-4">
                <label className="block text-sm font-semibold text-slate-700 font-sans">Idioma da Interface</label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    { id: 'en', label: 'English', desc: 'Main interface in English' },
                    { id: 'pt', label: 'Português', desc: 'Interface em Português (Moçambique/Angola)' },
                    { id: 'sw', label: 'Kiswahili', desc: 'Kiolesura kwa Kiswahili (East Africa)' }
                  ].map(lang => (
                    <button
                      type="button"
                      key={lang.id}
                      onClick={() => setFormData({...formData, language: lang.id})}
                      className={`p-4 rounded-2xl border-2 transition-all text-left flex justify-between items-center ${
                        formData.language === lang.id ? 'border-blue-600 bg-blue-50' : 'border-slate-100 hover:border-slate-200'
                      }`}
                    >
                      <div>
                        <p className="font-bold text-sm text-slate-800">{lang.label}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{lang.desc}</p>
                      </div>
                      {formData.language === lang.id && <div className="w-2 h-2 bg-blue-600 rounded-full" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* MOEDA PRINCIPAL (PRIMARY CURRENCY) WITH COUNTRY SEARCH */}
              <div className="pt-6 border-t border-slate-100 space-y-4">
                <div>
                  <h4 className="text-sm font-semibold text-slate-800">Moeda Principal do Negócio</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Selecione a moeda padrão para as transações, relatórios e preços de stock de toda a empresa.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Pesquise por nome da moeda, país ou sigla (ex: Metical, Quénia, ZAR, KES...)"
                      value={primaryCurrencySearch}
                      onChange={e => setPrimaryCurrencySearch(e.target.value)}
                      className="w-full text-xs font-semibold p-3 pl-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-sans"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                    {SUPPORTED_CURRENCIES.filter(curr => {
                      const s = primaryCurrencySearch.toLowerCase();
                      return curr.code.toLowerCase().includes(s) ||
                             curr.name.toLowerCase().includes(s) ||
                             curr.countries.some(ctr => ctr.toLowerCase().includes(s));
                    }).map(curr => (
                      <button
                        type="button"
                        key={curr.code}
                        onClick={() => setFormData({ ...formData, currency: curr.code })}
                        className={`p-3 text-left rounded-xl border transition-all flex flex-col justify-between ${
                          formData.currency === curr.code
                            ? 'border-blue-600 bg-blue-50/50 shadow-sm'
                            : 'border-slate-100 bg-white hover:border-slate-200'
                        }`}
                      >
                        <div className="flex justify-between items-start w-full">
                          <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded">
                            {curr.code} ({curr.symbol})
                          </span>
                          {formData.currency === curr.code && (
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                          )}
                        </div>
                        <div className="mt-2 text-[11px] font-sans">
                          <span className="font-bold text-slate-700 block truncate">{curr.name}</span>
                          <span className="text-[10px] text-slate-400 block truncate">{curr.countries.join(', ')}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* MOEDA SECUNDÁRIA (SECONDARY CURRENCY) WITH COUNTRY SEARCH */}
              <div className="pt-6 border-t border-slate-100 space-y-4">
                <div>
                  <h4 className="text-sm font-semibold text-slate-800">Moeda de Conversão Secundária (Exibição)</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Opcional. Exibe preços convertidos no POS, Faturas e Relatórios para consulta rápida.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Pesquise para filtrar moedas de exibição secundária..."
                      value={secondaryCurrencySearch}
                      onChange={e => setSecondaryCurrencySearch(e.target.value)}
                      className="w-full text-xs font-semibold p-3 pl-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-sans"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-40 overflow-y-auto pr-1">
                    {/* NONE Option first */}
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, secondaryCurrency: '' })}
                      className={`p-3 text-left rounded-xl border transition-all flex flex-col justify-center items-center h-[76px] ${
                        !formData.secondaryCurrency
                          ? 'border-blue-600 bg-blue-50/50 shadow-sm'
                          : 'border-slate-100 bg-white hover:border-slate-200'
                      }`}
                    >
                      <span className="text-xs font-bold text-slate-600 block">Sem Moeda Secundária</span>
                      <span className="text-[10px] text-slate-400 mt-1 block">Apenas moeda principal</span>
                    </button>

                    {SUPPORTED_CURRENCIES.filter(curr => {
                      if (curr.code === formData.currency) return false; // Hide if same as primary
                      const s = secondaryCurrencySearch.toLowerCase();
                      return curr.code.toLowerCase().includes(s) ||
                             curr.name.toLowerCase().includes(s) ||
                             curr.countries.some(ctr => ctr.toLowerCase().includes(s));
                    }).map(curr => (
                      <button
                        type="button"
                        key={curr.code}
                        onClick={() => setFormData({ ...formData, secondaryCurrency: curr.code })}
                        className={`p-3 text-left rounded-xl border transition-all flex flex-col justify-between h-[76px] ${
                          formData.secondaryCurrency === curr.code
                            ? 'border-blue-600 bg-blue-50/50 shadow-sm'
                            : 'border-slate-100 bg-white hover:border-slate-200'
                        }`}
                      >
                        <div className="flex justify-between items-start w-full">
                          <span className="font-mono text-xs font-bold text-teal-800 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-100">
                            {curr.code} ({curr.symbol})
                          </span>
                          {formData.secondaryCurrency === curr.code && (
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                          )}
                        </div>
                        <div className="mt-1 text-[11px] font-sans">
                          <span className="font-bold text-slate-700 block truncate">{curr.name}</span>
                          <span className="text-[10px] text-slate-400 block truncate">{curr.countries.join(', ')}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* EXCHANGE RATES BLOCK */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">Câmbio e Taxas de Conversão Diárias</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Sincronizado automaticamente da API Exchangerate (Base: MZN).
                    </p>
                  </div>
                  
                  <button
                    type="button"
                    disabled={isSyncingRates}
                    onClick={handleManualSyncRates}
                    className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100/80 px-3 py-1.5 rounded-lg border border-blue-200 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw size={12} className={isSyncingRates ? "animate-spin" : ""} />
                    <span>{isSyncingRates ? "Sincronizando..." : "Sincronizar Câmbio"}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 bg-white border border-slate-100 rounded-xl flex flex-col justify-center">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Atualizado Em</span>
                    <span className="text-xs font-bold font-mono text-slate-800 mt-1">
                      {businessData?.exchangeRatesUpdatedAt 
                        ? new Date(businessData.exchangeRatesUpdatedAt).toLocaleString('pt-PT')
                        : 'Pendente de sincronização'}
                    </span>
                  </div>

                  <div className="p-3 bg-white border border-slate-100 rounded-xl flex flex-col justify-center">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Moeda Selecionada</span>
                    <span className="text-xs font-bold text-slate-800 mt-1">
                      1 MZN = {businessData?.exchangeRates?.[formData.currency] 
                        ? `${Number(businessData?.exchangeRates?.[formData.currency]).toFixed(4)} ${formData.currency}`
                        : `1.00 MZN`}
                    </span>
                  </div>

                  {formData.secondaryCurrency && (
                    <div className="p-3 bg-white border border-slate-100 rounded-xl flex flex-col justify-center">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Moeda Secundária</span>
                      <span className="text-xs font-bold text-teal-700 mt-1">
                        1 MZN = {businessData?.exchangeRates?.[formData.secondaryCurrency] 
                          ? `${Number(businessData?.exchangeRates?.[formData.secondaryCurrency]).toFixed(4)} ${formData.secondaryCurrency}`
                          : `N/A`}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1 font-sans">Fuso Horário do Negócio (Timezone)</label>
                  <p className="text-xs text-slate-500 mb-3">
                    Ajuste os timestamps das faturas, relatórios e fecho de turnos para a hora local correta de seu país.
                  </p>
                </div>

                <div className="relative">
                  <select
                    value={formData.timezone}
                    onChange={e => setFormData({...formData, timezone: e.target.value})}
                    className="w-full p-4 pr-10 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm font-medium text-slate-800 appearance-none shadow-sm transition-all"
                  >
                    {AFRICAN_TIMEZONES.map(tz => (
                      <option key={tz.value} value={tz.value}>
                        {tz.label} ({tz.country})
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                    <Globe size={18} />
                  </div>
                </div>

                <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                    <Globe size={16} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-blue-900">Configuração de Hora Ativa</h4>
                    <p className="text-xs text-blue-700 mt-0.5">
                      Hora atual formatada com o fuso horário selecionado:{' '}
                      <span className="font-mono font-bold">
                        {(() => {
                          try {
                            return new Intl.DateTimeFormat('pt-PT', {
                              day: '2-digit',
                              month: 'long',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                              timeZone: formData.timezone
                            }).format(new Date());
                          } catch {
                            return new Date().toLocaleString();
                          }
                        })()}
                      </span>
                    </p>
                  </div>
                </div>

                {/* COMPONENTE DE DEFINIÇÕES REGIONAIS - REQUISITO 5 */}
                <div className="pt-6 border-t border-slate-100 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-800">Definições Regionais (Localização)</h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Estes parâmetros representam as definições do seu país de operação. Cada campo exibe o selo <span className="text-blue-600 font-bold">Auto-detectado</span>.
                      </p>
                    </div>
                    {!isEditingRegional ? (
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingRegional(true);
                        }}
                        className="px-3 py-1.5 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <SettingsIcon size={13} />
                        <span>Editar Definições</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setIsEditingRegional(false)}
                          className="px-3 py-1.5 text-xs font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveRegionalSettings}
                          className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          <Save size={13} />
                          <span>Guardar</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 space-y-4">
                    {!isEditingRegional ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block flex items-center gap-1.5">
                            País
                            <span className="bg-blue-50 text-blue-700 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full border border-blue-100 uppercase scale-[0.9]">Auto-detectado</span>
                          </span>
                          <span className="text-xs font-bold text-slate-800">{regionalCountry || 'Não configurado'}</span>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block flex items-center gap-1.5">
                            Idioma
                            <span className="bg-blue-50 text-blue-700 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full border border-blue-100 uppercase scale-[0.9]">Auto-detectado</span>
                          </span>
                          <span className="text-xs font-bold text-slate-800 uppercase">{regionalLanguage}</span>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block flex items-center gap-1.5">
                            Moeda Principal
                            <span className="bg-blue-50 text-blue-700 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full border border-blue-100 uppercase scale-[0.9]">Auto-detectado</span>
                          </span>
                          <span className="text-xs font-bold text-slate-800">{regionalCurrency} ({regionalCurrencySymbol})</span>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block flex items-center gap-1.5">
                            Formato de Data
                            <span className="bg-blue-50 text-blue-700 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full border border-blue-100 uppercase scale-[0.9]">Auto-detectado</span>
                          </span>
                          <span className="text-xs font-bold text-slate-800">{regionalDateFormat}</span>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block flex items-center gap-1.5">
                            Formato Numérico
                            <span className="bg-blue-50 text-blue-700 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full border border-blue-100 uppercase scale-[0.9]">Auto-detectado</span>
                          </span>
                          <span className="text-xs font-bold text-slate-800">{regionalNumberFormat}</span>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block flex items-center gap-1.5">
                            Imposto Padrão
                            <span className="bg-blue-50 text-blue-700 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full border border-blue-100 uppercase scale-[0.9]">Auto-detectado</span>
                          </span>
                          <span className="text-xs font-bold text-slate-800">{regionalTaxLabel} ({regionalTaxRate}%)</span>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block flex items-center gap-1.5">
                            Prefixo Telefónico
                            <span className="bg-blue-50 text-blue-700 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full border border-blue-100 uppercase scale-[0.9]">Auto-detectado</span>
                          </span>
                          <span className="text-xs font-bold text-slate-800">{regionalPhoneCode}</span>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block flex items-center gap-1.5">
                            Meios de Pagamento Móvel
                            <span className="bg-blue-50 text-blue-700 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full border border-blue-100 uppercase scale-[0.9]">Auto-detectado</span>
                          </span>
                          <span className="text-xs font-bold text-slate-800">{regionalMobileMoneyOptions || 'Nenhum'}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-slate-400 block">País</label>
                          <input
                            type="text"
                            value={regionalCountry}
                            onChange={e => setRegionalCountry(e.target.value)}
                            className="w-full text-xs font-semibold p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-slate-400 block">Idioma</label>
                          <select
                            value={regionalLanguage}
                            onChange={e => setRegionalLanguage(e.target.value as any)}
                            className="w-full text-xs font-semibold p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                          >
                            <option value="pt">Português</option>
                            <option value="en">English</option>
                            <option value="fr">Français</option>
                            <option value="ar">العربية (Arabic)</option>
                            <option value="sw">Kiswahili</option>
                            <option value="af">Afrikaans</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-slate-400 block">Código da Moeda & Símbolo</label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="MZN"
                              value={regionalCurrency}
                              onChange={e => setRegionalCurrency(e.target.value.toUpperCase())}
                              className="w-1/2 text-xs font-semibold p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                            />
                            <input
                              type="text"
                              placeholder="MT"
                              value={regionalCurrencySymbol}
                              onChange={e => setRegionalCurrencySymbol(e.target.value)}
                              className="w-1/2 text-xs font-semibold p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-slate-400 block">Formato de Data</label>
                          <input
                            type="text"
                            value={regionalDateFormat}
                            onChange={e => setRegionalDateFormat(e.target.value)}
                            className="w-full text-xs font-semibold p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-slate-400 block">Formato Numérico</label>
                          <select
                            value={regionalNumberFormat}
                            onChange={e => setRegionalNumberFormat(e.target.value as any)}
                            className="w-full text-xs font-semibold p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                          >
                            <option value="1.250,00">1.250,00 (Clássico)</option>
                            <option value="1,250.00">1,250.00 (Inglês)</option>
                            <option value="1 250,00">1 250,00 (Social)</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-slate-400 block">Imposto Padrão (Nome e %)</label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="IVA"
                              value={regionalTaxLabel}
                              onChange={e => setRegionalTaxLabel(e.target.value)}
                              className="w-1/2 text-xs font-semibold p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                            />
                            <input
                              type="number"
                              placeholder="17"
                              value={regionalTaxRate}
                              onChange={e => setRegionalTaxRate(Number(e.target.value) || 0)}
                              className="w-1/2 text-xs font-semibold p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-slate-400 block">Prefixo Telefónico</label>
                          <input
                            type="text"
                            placeholder="+258"
                            value={regionalPhoneCode}
                            onChange={e => setRegionalPhoneCode(e.target.value)}
                            className="w-full text-xs font-semibold p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold text-slate-400 block">Pagamentos Móveis (Separados por vírgulas)</label>
                          <input
                            type="text"
                            placeholder="M-Pesa, e-Mola, Mkesh"
                            value={regionalMobileMoneyOptions}
                            onChange={e => setRegionalMobileMoneyOptions(e.target.value)}
                            className="w-full text-xs font-semibold p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/15"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <fieldset disabled={!isSystemAdmin} className="space-y-8 animate-in fade-in duration-300">
              <div>
                <h3 className="text-lg font-bold text-slate-900 font-sans">Segurança & Conectividade de Faturação</h3>
                <p className="text-sm text-[#6B7280] font-semibold">
                  Controle a proteção de dados do negócio, PINs de colaboradores, e configure o desempenho móvel para internet lenta.
                </p>
              </div>

              {/* Data Protection Shield Card */}
              <div className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50/50 rounded-[32px] border border-blue-100/60 shadow-sm space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/10">
                    <Lock size={20} />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight font-sans">Escudo de Isolamento & Proteção de Dados</h4>
                    <p className="text-xs text-slate-500 font-semibold">Integridade de Dados e Isolamento Completo</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div className="p-4 bg-white/85 backdrop-blur-sm rounded-2xl border border-blue-100/40 text-xs space-y-1.5 shadow-xs">
                    <p className="font-extrabold text-slate-400 uppercase tracking-widest text-[9px] font-sans">ID de Acesso Único</p>
                    <p className="font-mono text-slate-705 font-bold break-all lowercase">{user?.uid ? `${user.uid.substring(0, 12)}...` : 'N/A'}</p>
                    <p className="text-[10px] text-emerald-600 font-black flex items-center gap-1 mt-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                      Sessão Criptografada e Ativa
                    </p>
                  </div>

                  <div className="p-4 bg-white/85 backdrop-blur-sm rounded-2xl border border-blue-100/40 text-xs space-y-1.5 shadow-xs">
                    <p className="font-extrabold text-slate-400 uppercase tracking-widest text-[9px] font-sans">Business Tenant ID (Restrito)</p>
                    <p className="font-mono text-slate-705 font-bold break-all lowercase">{profile?.businessId || 'N/A'}</p>
                    <p className="text-[10px] text-blue-700 font-black flex items-center gap-1 mt-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse inline-block" />
                      Tenant Base Rule: isStaffOfBusiness
                    </p>
                  </div>
                </div>

                <div className="p-4 bg-white/60 rounded-2xl border border-blue-100/20 text-xs leading-relaxed text-slate-600 font-semibold">
                  <p>
                    <strong>Garantia de Isolamento de Dados:</strong> O Sabush ERP utiliza chaves de segurança estritas baseadas no seu perfil e no 
                    específico ID de Empresa. Nenhum outro utilizador, mesmo sob credenciais alteradas, pode ler, escrever ou listar os dados do seu 
                    negócio ou faturas no banco de dados centralizado. Todas as requisições herdam as regras certificadas pelo nosso servidor de autenticação.
                  </p>
                </div>
              </div>

              {/* Mobile Optimization & Connectivity Panel */}
              <div className="p-6 bg-[#F8F9FA] rounded-[32px] border border-[#F8F9FA] space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-lg">
                    <Wifi size={20} />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight font-sans">Otimizador de Internet Móvel & Telemóvel</h4>
                    <p className="text-xs text-slate-500 font-semibold">Melhore o desempenho em ligações congestionadas (3G & Dados Móveis)</p>
                  </div>
                </div>

                {/* Connection Protocol Toggle (WebSockets vs Long Polling) */}
                <div className="p-4 bg-white rounded-2xl border border-[#F8F9FA]/50 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="font-extrabold text-slate-800 text-xs uppercase tracking-wider mb-1 font-sans">Protocolo de Ligação Local (Firestore Channel)</p>
                      <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                        {forceLongPolling 
                          ? "Long Polling (Modo de Compatibilidade): Utiliza pedidos HTTPS frequentes. Selecione isto apenas se a sua rede bloquear ligações de streaming." 
                          : "WebSockets (Recomendado): Ativa um canal único persistente de altíssima velocidade. Poupa bateria e consome até 85% menos largura de banda, ideal para telemóveis."}
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={!forceLongPolling} 
                        onChange={e => setForceLongPolling(!e.target.checked)}
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0B1F4D]"></div>
                    </label>
                  </div>
                  
                  {/* Notice about dynamic load status */}
                  <div className="p-2.5 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-between text-[11px] text-blue-700 font-semibold">
                    <span className="flex items-center gap-1.5">
                      <RefreshCw size={12} className="animate-spin shrink-0" />
                      Alterar o protocolo exige reinicializar a base de dados.
                    </span>
                    <button 
                      type="button"
                      onClick={() => window.location.reload()}
                      className="px-3 py-1 bg-blue-600 text-white rounded-lg text-[10px] font-black hover:bg-blue-700 transition"
                    >
                      Aplicar Agora
                    </button>
                  </div>
                </div>

                {/* Cache-First Mode Toggle */}
                <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-[#F8F9FA]/50">
                  <div className="flex-1 pr-6">
                    <p className="font-bold text-slate-800 text-xs uppercase tracking-wider font-sans">Modo Instantâneo (Cache-First Offline Reads)</p>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed font-semibold">
                      Procura produtos, stock e clientes no arquivo cache guardado localmente antes de consultar a nuvem, garantindo velocidade instantânea de carregamento no telemóvel mesmo sem ligação de rede estável.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={cacheFirstMode} 
                      onChange={e => setCacheFirstMode(e.target.checked)}
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0B1F4D]"></div>
                  </label>
                </div>

                {/* IndexedDB database indicators */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  <div className="p-4 bg-white rounded-xl border border-[#F8F9FA]/40 text-xs flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-[#0B1F4D] flex items-center justify-center self-start">
                      <Database size={16} />
                    </div>
                    <div>
                      <p className="font-black text-slate-700 uppercase tracking-tight font-sans">Resiliência Offline</p>
                      <p className="text-[10px] text-slate-400 font-bold leading-none mt-0.5 font-sans">IndexedDB localCache ativo</p>
                      <p className="text-[10px] text-emerald-600 font-black mt-1">✓ Autossuficiente offline (OK)</p>
                    </div>
                  </div>

                  <div className="p-4 bg-white rounded-xl border border-[#F8F9FA]/40 text-xs flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-750 flex items-center justify-center self-start">
                      <Globe size={16} />
                    </div>
                    <div>
                      <p className="font-black text-slate-700 uppercase tracking-tight font-sans">Otimização Móvel</p>
                      <p className="text-[10px] text-slate-400 font-bold leading-none mt-0.5">Compactador de tráfego móvel</p>
                      <p className="text-[10px] text-[#6B7280] font-black mt-1">✓ Compressão Base64 ativada</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Security PIN Field */}
              <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 space-y-4">
                <div>
                  <h4 className="font-extrabold text-slate-800 text-sm font-sans">PIN de Autorização do Gerente</h4>
                  <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                    Este PIN é usado para autorizar a remoção de faturas, alterações de configurações de faturação e outras operações sensíveis nos computadores dos caixas. (Padrão: 1234)
                  </p>
                </div>
                <div className="max-w-xs">
                  <input 
                    type="text"
                    maxLength={6}
                    pattern="\d*"
                    className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono text-center tracking-[0.5em] text-lg font-bold bg-white"
                    placeholder="E.g., 1234"
                    value={formData.managerPin}
                    onChange={e => setFormData({...formData, managerPin: e.target.value.replace(/\D/g, '')})}
                  />
                </div>
              </div>

              {/* Multi-computer sales partitioning toggle */}
              <div className="flex items-center justify-between p-6 bg-slate-50 rounded-3xl border border-slate-100">
                <div className="flex-1 pr-6">
                  <p className="font-bold text-slate-900 text-sm font-sans">Restringir Operações dos Caixas / Colaboradores</p>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed font-semibold">
                    Quando ativo, cada colaborador a partir de computadores secundários só verá as suas próprias faturas e vendas registadas no seu nome. Apenas computadores de gerentes e proprietários terão acesso a todas as vendas detalhadas do negócio.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={formData.restrictStaffToOwnTransactions}
                    onChange={e => setFormData({...formData, restrictStaffToOwnTransactions: e.target.checked})}
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1 font-sans">Assigned Role</p>
                  <p className="text-lg font-black text-slate-900 capitalize font-sans">{profile?.role || 'User'}</p>
                </div>

                <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1 font-sans">Account Status</p>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "w-2 h-2 rounded-full",
                      profile?.accountStatus === 'active' ? "bg-emerald-500" : "bg-orange-500"
                    )} />
                    <p className="text-lg font-black text-slate-900 capitalize font-sans">{profile?.accountStatus || 'Pending'}</p>
                  </div>
                </div>
              </div>

              <div className="p-8 bg-blue-50 rounded-[40px] border border-blue-100 flex flex-col md:flex-row items-center gap-6">
                <div className="w-16 h-16 bg-white rounded-[24px] flex items-center justify-center text-blue-600 shadow-sm">
                  <ShieldCheck size={32} />
                </div>
                <div className="flex-1 text-center md:text-left">
                  <h4 className="font-black text-slate-900 font-sans">Terms & Conditions</h4>
                  <p className="text-sm font-bold text-slate-500 font-sans">
                    {profile?.termsAccepted 
                      ? `Accepted on ${profile.termsAcceptedAt ? new Date(profile.termsAcceptedAt.toDate ? profile.termsAcceptedAt.toDate() : profile.termsAcceptedAt).toLocaleDateString() : 'N/A'}`
                      : 'Not yet accepted'}
                  </p>
                </div>
                <div className="px-6 py-2 bg-blue-600 text-white rounded-full text-[10px] font-black uppercase tracking-widest font-sans">
                  Compliant
                </div>
              </div>

              {/* Purga de Dados & Reposição de Fábrica Shortcut Card */}
              <div className="p-6 bg-rose-50/30 rounded-[32px] border border-rose-150/80 flex flex-col sm:flex-row items-center justify-between gap-6 text-left">
                <div className="flex items-start gap-4 flex-1">
                  <div className="w-12 h-12 bg-rose-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-rose-600/10 shrink-0">
                    <Trash2 size={22} />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-rose-950 uppercase tracking-tight font-sans">Purga de Dados & Reposição de Fábrica</h4>
                    <p className="text-xs text-rose-700/80 mt-1 font-semibold leading-relaxed font-sans max-w-lg">
                      Limpeza segura, total ou parcial, dos registos e tabelas de dados do seu Sabush ERP. Todas as ações requerem validação por PIN.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('purge_data')}
                  className="px-5 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-md shadow-rose-600/10 shrink-0 whitespace-nowrap cursor-pointer"
                >
                  Abrir Painel de Limpeza →
                </button>
              </div>

              <div className="p-6 bg-rose-50 rounded-3xl border border-rose-100 flex items-center gap-4 text-rose-800">
                <AlertCircle size={20} className="shrink-0" />
                <p className="text-xs font-bold font-medium leading-relaxed font-sans">Role management and advanced security logs can also be overviewed from the super admin dashboard.</p>
              </div>
            </fieldset>
          )}

          {activeTab === 'purge_data' && (
            <div className="space-y-6 text-left">
              {/* Header with Dynamic Back Navigation */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-xl font-black text-slate-900 font-sans tracking-tight flex items-center gap-2">
                    <Trash2 className="text-rose-600 animate-pulse" size={24} />
                    Painel de Limpeza & Reposição de Fábrica
                  </h3>
                  <p className="text-xs text-slate-500 font-sans font-semibold mt-0.5">
                    {selectedResetAction !== null ? 'Passo 2 de 2: Confirmação e PIN' : 'Gira a purga seletiva de tabelas ou reponha o estado original do ERP'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedResetAction !== null) {
                      setSelectedResetAction(null);
                    } else {
                      setActiveTab('security');
                    }
                  }}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-sm self-start hover:shadow active:scale-95"
                >
                  <ArrowLeft size={14} /> {selectedResetAction !== null ? 'Voltar ao Menu' : 'Voltar à Segurança'}
                </button>
              </div>

              {/* Scrollable Container Wrapper with Smooth Scroll and Custom Scrollbar Styling */}
              <div className="max-h-[60vh] overflow-y-auto pr-1 pb-4 scroll-smooth focus:outline-none space-y-6">
                {selectedResetAction === null ? (
                  /* MAIN LIST VIEW */
                  <div className="space-y-6">
                    <div className="p-5 bg-amber-50/60 rounded-3xl border border-amber-200/50 flex items-start gap-3.5 text-amber-900">
                      <AlertCircle size={20} className="shrink-0 text-amber-600 mt-0.5 animate-bounce" />
                      <div className="space-y-1">
                        <p className="font-extrabold text-xs uppercase tracking-wider text-amber-800">Instruções de Segurança e Navegação</p>
                        <p className="text-[11px] text-slate-600 font-semibold leading-relaxed">
                          Selecione o módulo de dados que deseja redefinir ou limpar. Cada operação exigirá uma confirmação detalhada onde poderá cancelar a qualquer momento ou avançar introduzindo o PIN de Autorização do Gerente localmente ou via aprovação remota.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Customers Option */}
                      <div className="p-5 bg-white rounded-[24px] border border-slate-100 flex flex-col justify-between space-y-4 hover:border-rose-100 transition-all hover:shadow-md">
                        <div>
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">1</div>
                            <p className="font-black text-slate-800 text-xs uppercase tracking-wider">Limpar Base de Clientes</p>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-2 font-semibold leading-relaxed">
                            Apaga todos os clientes e contactos registados. Mantém as faturas mas desassocia os clientes das mesmas.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedResetAction('customers')}
                          className="w-full py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all cursor-pointer text-center"
                        >
                          Iniciar Limpeza de Clientes
                        </button>
                      </div>

                      {/* Products Option */}
                      <div className="p-5 bg-white rounded-[24px] border border-slate-100 flex flex-col justify-between space-y-4 hover:border-rose-100 transition-all hover:shadow-md">
                        <div>
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">2</div>
                            <p className="font-black text-slate-800 text-xs uppercase tracking-wider">Limpar Inventário & Stock</p>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-2 font-semibold leading-relaxed">
                            Apaga o catálogo completo de artigos, stocks atuais e histórico de perdas/quebras de stock.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedResetAction('products')}
                          className="w-full py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all cursor-pointer text-center"
                        >
                          Iniciar Limpeza de Inventário
                        </button>
                      </div>

                      {/* Sales Option */}
                      <div className="p-5 bg-white rounded-[24px] border border-slate-100 flex flex-col justify-between space-y-4 hover:border-rose-100 transition-all hover:shadow-md">
                        <div>
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">3</div>
                            <p className="font-black text-slate-800 text-xs uppercase tracking-wider">Limpar Faturação & Turnos</p>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-2 font-semibold leading-relaxed">
                            Apaga faturas, fluxos de recebimentos, comprovativos, encomendas online e o histórico de turnos de POS.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedResetAction('sales')}
                          className="w-full py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all cursor-pointer text-center"
                        >
                          Iniciar Limpeza de Faturação
                        </button>
                      </div>

                      {/* Expenses Option */}
                      <div className="p-5 bg-white rounded-[24px] border border-slate-100 flex flex-col justify-between space-y-4 hover:border-rose-100 transition-all hover:shadow-md">
                        <div>
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">4</div>
                            <p className="font-black text-slate-800 text-xs uppercase tracking-wider">Limpar Compras & Fornecedores</p>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-2 font-semibold leading-relaxed">
                            Apaga todas as despesas lançadas, ordens de compra emitidas e a base de fornecedores registados.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedResetAction('expenses')}
                          className="w-full py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all cursor-pointer text-center"
                        >
                          Iniciar Limpeza de Compras
                        </button>
                      </div>
                    </div>

                    {/* Option 5: Factory Reset (Full) */}
                    <div className="p-6 bg-red-650 text-white rounded-[32px] border border-red-700 space-y-4 shadow-xl shadow-red-650/10 bg-red-600 hover:bg-red-700 transition-all">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white shrink-0">
                          <AlertCircle size={22} className="animate-pulse" />
                        </div>
                        <div>
                          <p className="font-black text-xs uppercase tracking-widest text-red-100">Reposição de Fábrica Completa (Factory Reset)</p>
                          <p className="text-[11px] text-red-100/90 mt-1 leading-relaxed font-semibold">
                            Apaga simultaneamente TODOS os clientes, produtos, faturas, despesas, fornecedores, quebras, turnos e alertas de todas as filiais. Redefine o ERP ao estado original.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedResetAction('factory')}
                        className="w-full py-3 bg-white hover:bg-slate-100 text-red-700 rounded-2xl font-black text-xs uppercase tracking-wider transition-all shadow-md cursor-pointer text-center"
                      >
                        ☠ Executar Reposição de Fábrica Integral
                      </button>
                    </div>
                  </div>
                ) : (
                  /* CONTEXTUAL CONFIRMATION SCREEN (STEP 2) */
                  <div className="p-6 bg-slate-50 rounded-[32px] border border-slate-200/60 space-y-6 animate-in slide-in-from-bottom-4 duration-200">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center shadow-inner shrink-0">
                        <ShieldCheck size={24} className="animate-pulse" />
                      </div>
                      <div>
                        <span className="text-[9px] font-black text-red-600 uppercase tracking-widest leading-none">Confirmação de Segurança Requerida</span>
                        <h4 className="text-sm font-black text-slate-950 uppercase tracking-tight font-sans mt-0.5">
                          {selectedResetAction === 'customers' && 'Purga de Clientes'}
                          {selectedResetAction === 'products' && 'Purga de Inventário'}
                          {selectedResetAction === 'sales' && 'Purga de Faturação e POS'}
                          {selectedResetAction === 'expenses' && 'Purga de Compras e Fornecedores'}
                          {selectedResetAction === 'factory' && 'Reposição de Fábrica Completa'}
                        </h4>
                      </div>
                    </div>

                    <div className="p-5 bg-white rounded-2xl border border-slate-200 space-y-3">
                      <p className="text-xs font-black text-slate-850 uppercase tracking-wider">O que acontecerá após confirmar?</p>
                      <p className="text-[11px] text-slate-600 font-semibold leading-relaxed">
                        {selectedResetAction === 'customers' && 'Esta operação irá eliminar permanentemente todos os clientes registados, saldos em conta corrente, históricos de contacto e dados de faturação associados aos clientes. Faturas emitidas serão preservadas, mas perderão a associação ao cliente original (ficarão como Cliente Final).'}
                        {selectedResetAction === 'products' && 'Esta operação irá eliminar todos os produtos e artigos registados no inventário, contagens de stock atual, limites de alerta de stock mínimo, categorias e o histórico completo de quebras e perdas de stock.'}
                        {selectedResetAction === 'sales' && 'Esta operação apagará de forma irreversível todas as faturas emitidas, recibos de pagamentos, comprovativos anexados, registos de encomendas online e o histórico completo de turnos de caixas de todas as filiais.'}
                        {selectedResetAction === 'expenses' && 'Esta operação irá apagar todos os registos de despesas correntes, ordens de compra efetuadas, pagamentos a fornecedores e a base de dados completa de fornecedores e contactos associados.'}
                        {selectedResetAction === 'factory' && 'AÇÃO EXTREMA E TOTALMENTE IRREVERSÍVEL. Irá limpar em simultâneo todos os clientes, produtos, faturas, pagamentos, turnos, despesas, ordens de compra, cotações, notificações e quebras de stock de todas as filiais da sua empresa. Apenas as definições de perfil e contas de utilizadores serão mantidas. O seu ERP começará do zero absoluto.'}
                      </p>
                      <div className="pt-2 flex items-center gap-2 text-[10px] font-black uppercase text-red-650 animate-pulse">
                        <span className="w-2 h-2 rounded-full bg-red-600"></span>
                        Esta ação não pode ser desfeita. Todos os dados indicados serão perdidos para sempre.
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setSelectedResetAction(null)}
                        className="flex-grow py-3 px-4 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-2xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer text-center"
                      >
                        Cancelar e Voltar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTriggerReset(selectedResetAction)}
                        className="flex-grow py-3 px-4 bg-red-650 hover:bg-red-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider transition-all shadow-md shadow-red-600/10 cursor-pointer text-center animate-pulse"
                      >
                        Avançar para PIN do Gerente →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'pwa' && (
            <div className="space-y-8 animate-in fade-in duration-300 text-left">
              <div>
                <h3 className="text-xl font-black text-slate-900 font-sans tracking-tight flex items-center gap-2">
                  <Smartphone className="text-blue-600" size={24} />
                  Progressive Web App (PWA) & Modo Offline
                </h3>
                <p className="text-sm text-slate-500 font-sans font-medium">
                  Converta o Sabush System ERP numa aplicação nativa instalável para o seu telemóvel (Android/iOS) ou computador. Monitorize a sincronização local e teste as notificações automáticas.
                </p>
              </div>

              {/* Status Indicator grid: Connection & Install */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    networkOnline ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'
                  }`}>
                    <Wifi size={20} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase text-slate-400 leading-none">Estado de Rede</p>
                    <p className="text-sm font-black text-slate-800 mt-1">
                      {networkOnline ? 'Ligado à Internet' : 'Modo Offline Ativou'}
                    </p>
                    <p className="text-[10px] text-slate-450 mt-0.5">
                      {networkOnline ? 'Sincronização Cloud Ativa' : 'Transações guardadas em fila local'}
                    </p>
                  </div>
                </div>

                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    isInstalled ? 'bg-indigo-100 text-indigo-600' : 'bg-amber-100 text-amber-600 animate-pulse'
                  }`}>
                    <Smartphone size={20} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase text-slate-400 leading-none">Modo de Ecrã</p>
                    <p className="text-sm font-black text-slate-800 mt-1">
                      {isInstalled ? 'App Standalone Nativa' : 'Sessão do Navegador'}
                    </p>
                    <p className="text-[10px] text-slate-455 mt-0.5">
                      {isInstalled ? 'Barra de estado iOS compatível' : 'Instalação pendente'}
                    </p>
                  </div>
                </div>

                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                    <Database size={20} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase text-slate-400 leading-none">Armazenamento Cache</p>
                    <p className="text-sm font-black text-slate-800 mt-1">
                      {cacheFilesCount} Ficheiros Locais
                    </p>
                    <p className="text-[10px] text-slate-455 mt-0.5">
                      Pronto para arranque 100% offline
                    </p>
                  </div>
                </div>
              </div>

              {/* Install Prompt Showcase CTA Card */}
              <div className="p-6 bg-gradient-to-br from-blue-50/50 to-indigo-50/50 rounded-[32px] border border-blue-100 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-6 shadow-sm">
                <div className="flex-1 space-y-1">
                  <h4 className="font-black text-slate-905 text-sm font-sans flex items-center gap-2">
                    <Smartphone size={16} className="text-blue-600" />
                    {isInstalled ? 'Sabush ERP Instalado com Sucesso' : 'Instalar ERP no Telemóvel ou PC'}
                  </h4>
                  <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                    {isInstalled 
                      ? 'Navegação sem filtros, transições ultrarrapidas e barra de estado nativa adaptada ao seu dispositivo móvel Android ou Apple.'
                      : 'O ERP criará um ícone de arranque rápido diretamente no ecrã inicial do seu telemóvel, funcionando offline em qualquer ponto de Moçambique.'}
                  </p>
                </div>
                
                {!isInstalled && (
                  isInstallable ? (
                    <button
                      type="button"
                      onClick={triggerPWAInstall}
                      className="px-6 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-widest rounded-xl transition shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 shrink-0 self-start md:self-auto cursor-pointer"
                    >
                      <Smartphone size={14} />
                      Instalar PWA Agora
                    </button>
                  ) : (
                    <div className="p-3 bg-white rounded-xl border border-blue-100/50 text-slate-650 text-[11px] font-bold max-w-sm">
                      💡 No <strong className="text-slate-800">iOS (Safari)</strong>: Toque no botão <strong className="text-blue-600">Partilhar</strong> e selecione <strong className="text-slate-800">"Adicionar ao Ecrã Principal"</strong>.
                    </div>
                  )
                )}

                {isInstalled && (
                  <span className="px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-xl font-black text-[10px] uppercase tracking-wider shrink-0 self-start md:self-auto flex items-center gap-1.5 shadow-sm">
                    <ShieldCheck size={14} className="stroke-[3]" />
                    Modo Nativo Ativo
                  </span>
                )}
              </div>

              {/* Push Notifications Configuration Panel */}
              <div className="p-6 bg-white rounded-[32px] border border-slate-150 shadow-sm space-y-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-100 pb-5 gap-4">
                  <div>
                    <h4 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider font-sans">Controlo de Notificações Push</h4>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed font-semibold">
                      Receba faturas emitidas da loja, alertas urgentes de rutura física de stock e faturamentos parciais no seu dispositivo em tempo real sem e-mail.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase text-slate-400">Autorização:</span>
                    <span className={`px-2.5 py-1 rounded-full font-black text-[9px] uppercase tracking-wider border ${
                      pushPermission === 'granted' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                      pushPermission === 'denied' ? 'bg-rose-50 text-rose-700 border-rose-100' :
                      'bg-slate-50 text-slate-600 border-slate-100'
                    }`}>
                      {pushPermission === 'granted' ? 'Autorizado' : pushPermission === 'denied' ? 'Bloqueado' : 'Carregar'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Push Authorization Action */}
                  <div className="space-y-4">
                    <h5 className="text-xs font-black text-slate-700 uppercase tracking-wide">Permissões de Sistema</h5>
                    <p className="text-xs text-slate-500 font-medium leading-relaxed">
                      Para receber alertas no ecrã bloqueado quando a aplicação estiver fechada, os navegadores móveis necessitam de uma autorização de segurança.
                    </p>
                    
                    {pushPermission !== 'granted' ? (
                      <button
                        type="button"
                        onClick={requestPushPermission}
                        className="w-full sm:w-auto px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs uppercase tracking-wider rounded-xl transition flex items-center justify-center gap-2 shadow-md cursor-pointer"
                      >
                        <Bell size={14} />
                        Ativar Notificações de Sistema
                      </button>
                    ) : (
                      <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100/30 font-medium text-emerald-800 text-xs flex items-center gap-2">
                        <ShieldCheck size={16} className="text-emerald-600 shrink-0" />
                        O seu navegador está totalmente configurado para receber notificações Push nativas.
                      </div>
                    )}
                  </div>

                  {/* Dynamic Push Notification Simulation Station */}
                  <div className="space-y-4 border-t md:border-t-0 md:border-l border-slate-100 pt-6 md:pt-0 md:pl-6 text-left">
                    <h5 className="text-xs font-black text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                      <Wifi className="text-indigo-500" size={14} />
                      Simulador de Eventos PWA (Lighthouse Ready)
                    </h5>
                    <p className="text-xs text-slate-505 font-medium leading-relaxed">
                      Selecione um botão abaixo para disparar e testar imediatamente os diferentes tipos de notificações na sua infraestrutura:
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <button
                        type="button"
                        onClick={() => sendLocalTestPushNotification(
                          '📦 Nova Encomenda Recebida',
                          'Venda POS-1029 e faturação efetuada com sucesso por Mário Sabush.',
                          'order'
                        )}
                        disabled={pushPermission !== 'granted'}
                        className="py-2.5 px-3 bg-slate-50 hover:bg-slate-100 disabled:opacity-50 border border-slate-200/60 rounded-xl text-[10px] font-black uppercase tracking-wider text-slate-700 flex items-center justify-center gap-1.5 transition cursor-pointer"
                        title={pushPermission !== 'granted' ? 'Ative primeiro as notificações' : 'Simular faturas'}
                      >
                        📦 Encomenda
                      </button>

                      <button
                        type="button"
                        onClick={() => sendLocalTestPushNotification(
                          '⚠️ Alerta de Stock Baixo',
                          'O artigo "Arroz Sabush Premium 10kg" atingiu o limite crítico de 5 Unidades.',
                          'stock'
                        )}
                        disabled={pushPermission !== 'granted'}
                        className="py-2.5 px-3 bg-slate-50 hover:bg-slate-100 disabled:opacity-50 border border-slate-200/60 rounded-xl text-[10px] font-black uppercase tracking-wider text-slate-700 flex items-center justify-center gap-1.5 transition cursor-pointer"
                        title={pushPermission !== 'granted' ? 'Ative primeiro as notificações' : 'Simular alertas'}
                      >
                        ⚠️ Stock Baixo
                      </button>

                      <button
                        type="button"
                        onClick={() => sendLocalTestPushNotification(
                          '✅ Pagamento Recebido',
                          'Confirmada liquidação de 3,500.00 MT do cliente Sabush Sampaio (M-Pesa).',
                          'payment'
                        )}
                        disabled={pushPermission !== 'granted'}
                        className="py-2.5 px-3 bg-slate-50 hover:bg-slate-100 disabled:opacity-50 border border-slate-200/60 rounded-xl text-[10px] font-black uppercase tracking-wider text-slate-700 flex items-center justify-center gap-1.5 transition cursor-pointer"
                        title={pushPermission !== 'granted' ? 'Ative primeiro as notificações' : 'Simular depósitos'}
                      >
                        ✅ Pagamento
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Lighthouse Compliance & PWA Optimization Checklist */}
              <div className="p-6 bg-[#FFFFFF] rounded-[32px] border border-slate-150 space-y-4">
                <h4 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider font-sans">Certificação Google Lighthouse PWA</h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { title: 'Conexão HTTPS Segura', desc: 'Certificado Cloud Run ativo detetado', checked: true },
                    { title: 'Web App Manifest Registado', desc: 'manifest.json carregado standalone', checked: true },
                    { title: 'Service Worker Registado', desc: 'sw.js escuta eventos fetch & push', checked: true },
                    { title: 'Offline-First Boot (Cache Shell)', desc: 'Controlo de assets circular offline', checked: true },
                    { title: 'Icons Responsive Configurados', desc: 'Presença de 192x192 e 512x512 PNGs', checked: true },
                    { title: 'Dynamic Viewport Friendly', desc: 'Barra de notch/estado flexível (iOS/Android)', checked: true }
                  ].map((item, idx) => (
                    <div key={idx} className="flex gap-2.5 text-left p-2">
                      <span className="text-emerald-500 font-extrabold font-mono text-xs mt-0.5">✔</span>
                      <div>
                        <p className="text-xs font-black text-slate-800 leading-none">{item.title}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'pos_settings' && (
            <div className="space-y-6 animate-in fade-in duration-300 text-left">
              <div>
                <h3 className="text-lg font-bold">POS Settings</h3>
                <p className="text-sm text-slate-500">Configure as opções de pagamento e fluxos do Ponto de Venda do seu negócio.</p>
              </div>

              <div className="space-y-4 pt-4">
                <div className="p-4 bg-blue-50 rounded-2xl flex gap-3 text-blue-750 border border-blue-105">
                  <Smartphone size={20} className="shrink-0 text-blue-600" />
                  <p className="text-xs font-medium">
                    Aqui pode selecionar quais os canais e carteiras móveis que o seu operador de balcão verá disponíveis no checkout do ecrã de venda rápida (POS).
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-150 rounded-3xl p-6 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-205">
                    <div>
                      <p className="font-extrabold text-slate-900 text-sm">Canais de Pagamento Ativos</p>
                      <p className="text-xs text-slate-400">Personalize o checkout de acordo com o seu país de operação ({businessData?.regionalSettings?.country || businessData?.country || 'Moçambique'})</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                    {getCountryPaymentMethods(businessData?.regionalSettings?.country || businessData?.country || '').map(method => {
                      const enabledMethods = formData.posPaymentMethods && formData.posPaymentMethods.length > 0
                        ? formData.posPaymentMethods
                        : getCountryPaymentMethods(businessData?.regionalSettings?.country || businessData?.country || '').map(m => m.id);
                      const isChecked = enabledMethods.includes(method.id);
                      return (
                        <div
                          key={method.id}
                          onClick={() => {
                            let updated = [...enabledMethods];
                            if (isChecked) {
                              if (updated.length > 1) {
                                updated = updated.filter(id => id !== method.id);
                              } else {
                                toast.warning("Deve manter pelo menos um canal de pagamento ativo.");
                                return;
                              }
                            } else {
                              updated.push(method.id);
                            }
                            setFormData({ ...formData, posPaymentMethods: updated });
                          }}
                          className={`p-4 rounded-2xl border-2 transition-all flex items-center justify-between cursor-pointer select-none ${
                            isChecked ? 'border-blue-600 bg-blue-50/20 text-slate-900' : 'border-slate-100 hover:border-slate-200 bg-white text-slate-400'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{method.emoji}</span>
                            <div>
                              <p className="font-bold text-xs text-slate-800">{method.name}</p>
                              <p className="text-[10px] text-slate-400 uppercase font-black tracking-wider mt-0.5">{method.category}</p>
                            </div>
                          </div>
                          
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}}
                            className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer pointer-events-none"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'backups' && (
            <fieldset disabled={!isSystemAdmin} className="space-y-8 animate-in fade-in duration-300 text-left">
              <div>
                <h3 className="text-xl font-black text-slate-900 font-sans tracking-tight">Cópias de Segurança (Backups)</h3>
                <p className="text-sm text-slate-500 font-sans font-medium">
                  Configure cópias de segurança automáticas ou faça o descarregamento completo da base de dados do negócio em formato JSON.
                </p>
              </div>

              {/* Backup Info & Automatic Scheduling Settings Card */}
              <div className="p-6 bg-[#FFFFFF] rounded-[32px] border border-slate-150 shadow-sm space-y-6">
                <div>
                  <h4 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider font-sans">Agendamento de Backups Automáticos</h4>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed font-semibold">
                    Os backups automáticos serão executados de forma segura e transparente em segundo plano para o Firebase Storage do seu negócio.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-extrabold uppercase tracking-wide text-slate-600 mb-2 font-sans">
                      Frequência do Backup
                    </label>
                    <select
                      className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-700 font-medium text-sm bg-white"
                      value={formData.backupSchedule}
                      onChange={e => setFormData({ ...formData, backupSchedule: e.target.value })}
                    >
                      <option value="disabled">Desativado (Manual Apenas)</option>
                      <option value="daily">Diário (A cada 24 horas)</option>
                      <option value="weekly">Semanal (A cada 7 dias)</option>
                    </select>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-2xl flex flex-col justify-center text-xs space-y-1.5 border border-slate-100">
                    <p className="font-bold text-slate-700">Estado de Sincronização:</p>
                    <div className="flex items-center gap-1.5 text-slate-600 font-semibold">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse shrink-0" />
                      Frequência atual: <span className="font-black text-slate-900 capitalize">{formData.backupSchedule === 'disabled' ? 'Desativado' : formData.backupSchedule}</span>
                    </div>
                    {businessData?.lastBackupAt && (
                      <p className="text-[10px] text-slate-400 font-bold mt-1">
                        Último backup: {new Date(businessData.lastBackupAt.toDate ? businessData.lastBackupAt.toDate() : businessData.lastBackupAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Direct Manual Backup Action Card */}
              <div className="p-6 bg-gradient-to-br from-blue-50/50 to-indigo-50/50 rounded-[32px] border border-blue-100/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-sm">
                <div className="flex-1">
                  <h4 className="font-black text-slate-900 text-sm font-sans flex items-center gap-2">
                    <Database size={16} className="text-blue-600" />
                    Cópia de Segurança Manual
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed font-semibold">
                    Pretende um instantâneo imediato dos seus produtos, faturas, fornecedores, clientes e relatórios financeiros? Execute uma cópia de segurança manual agora mesmo.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleManualBackup}
                  disabled={manualBackupLoading}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-wider rounded-xl transition shadow-lg shadow-blue-500/20 flex items-center gap-2 disabled:opacity-50 shrink-0 self-start md:self-auto"
                >
                  {manualBackupLoading ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      A Processar...
                    </>
                  ) : (
                    <>
                      <RefreshCw size={14} />
                      Iniciar Cópia de Segurança
                    </>
                  )}
                </button>
              </div>

              {/* History Backups Table / Logs */}
              <div className="space-y-4">
                <h4 className="font-black text-slate-900 text-sm uppercase tracking-wide font-sans">
                  Histórico de Cópias de Segurança ({backupsList.length})
                </h4>

                {fetchingBackups ? (
                  <div className="p-12 text-center text-slate-400 font-sans font-semibold flex flex-col items-center justify-center gap-3 bg-slate-50 rounded-3xl">
                    <Loader2 size={24} className="animate-spin text-slate-500" />
                    <span>A carregar histórico do Firebase Storage...</span>
                  </div>
                ) : backupsList.length === 0 ? (
                  <div className="p-12 text-center text-slate-400 font-sans font-semibold border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/55 flex flex-col items-center justify-center gap-2 font-semibold">
                    <Database size={32} className="text-slate-350 mb-1" />
                    <p className="text-sm">Nenhuma cópia de segurança encontrada.</p>
                    <p className="text-xs text-slate-500 font-medium font-normal">Realize a sua primeira cópia de segurança manual no botão acima.</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs font-semibold">
                        <thead>
                          <tr className="bg-slate-50 text-slate-450 uppercase tracking-wider text-[10px] font-black border-b border-slate-100">
                            <th className="p-4">Data / Hora</th>
                            <th className="p-4">Tipo</th>
                            <th className="p-4">Nome do Ficheiro</th>
                            <th className="p-4">Tamanho</th>
                            <th className="p-4 text-center">Coleções</th>
                            <th className="p-4 text-right">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {backupsList.map(backup => {
                            const date = backup.createdAt?.toDate 
                              ? backup.createdAt.toDate() 
                              : backup.createdAt 
                                ? new Date(backup.createdAt) 
                                : new Date();

                            const sizeKb = (backup.sizeBytes / 1024).toFixed(2);

                            return (
                              <tr key={backup.id} className="hover:bg-slate-50/50 text-slate-600 transition">
                                <td className="p-4 text-slate-900 font-black whitespace-nowrap">
                                  {date.toLocaleString()}
                                </td>
                                <td className="p-4 whitespace-nowrap">
                                  {backup.triggerType === 'scheduled' ? (
                                    <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-100 rounded-full font-black text-[9px] uppercase tracking-wider">
                                      Agendado (Auto)
                                    </span>
                                  ) : (
                                    <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-full font-black text-[9px] uppercase tracking-wider">
                                      Manual
                                    </span>
                                  )}
                                </td>
                                <td className="p-4 text-slate-500 font-mono text-[11px] max-w-xs truncate" title={backup.filename}>
                                  {backup.filename}
                                </td>
                                <td className="p-4 text-slate-700 font-black whitespace-nowrap">
                                  {sizeKb} KB
                                </td>
                                <td className="p-4 text-center text-slate-500">
                                  {backup.collections?.length || 0} coleções
                                </td>
                                <td className="p-4 text-right whitespace-nowrap">
                                  <a
                                    href={backup.downloadUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    referrerPolicy="no-referrer"
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 text-[10px] uppercase font-black tracking-wider transition"
                                  >
                                    <RefreshCw size={10} className="rotate-180 shrink-0" />
                                    Descarregar JSON
                                  </a>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </fieldset>
          )}

          {activeTab === 'legal_info' && (() => {
            const getAckDateString = () => {
              if (!legalAcknowledgement?.acknowledgedAt) return '';
              const date = legalAcknowledgement.acknowledgedAt.toDate 
                ? legalAcknowledgement.acknowledgedAt.toDate() 
                : new Date(legalAcknowledgement.acknowledgedAt);
              
              const dd = String(date.getDate()).padStart(2, '0');
              const mm = String(date.getMonth() + 1).padStart(2, '0');
              const yyyy = date.getFullYear();
              const hh = String(date.getHours()).padStart(2, '0');
              const min = String(date.getMinutes()).padStart(2, '0');
              return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
            };

            return (
              <div className="space-y-8 animate-in fade-in duration-300 text-left">
                <div>
                  <h3 className="text-xl font-black text-slate-900 font-sans tracking-tight">Informação Legal</h3>
                  <p className="text-sm text-slate-500 font-sans font-medium">
                    Consulte os termos legais de utilização do Sabush System ERP perante a Autoridade Tributária (AT) de Moçambique.
                  </p>
                </div>

                <div className="p-6 bg-[#FFFFFF] rounded-[32px] border border-slate-150 shadow-sm space-y-6">
                  <div>
                    <h4 className="font-extrabold text-[#D4AF37] text-sm uppercase tracking-wider font-sans">Estado do Consentimento</h4>
                    {legalAcknowledgement?.acknowledged ? (
                      <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-emerald-50 border border-emerald-150 rounded-2xl">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                            <CheckCircle2 size={20} />
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-800">Termos Aceites e Ativos</p>
                            <p className="text-xs text-slate-500 font-semibold mt-0.5">
                              Aceite por: <span className="font-extrabold text-slate-800">{legalAcknowledgement.acknowledgedByName || 'Proprietário'}</span> em {getAckDateString()}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsReverOpen(true)}
                          className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl font-bold text-xs transition duration-150 shadow-sm cursor-pointer whitespace-nowrap self-start sm:self-auto text-center"
                        >
                          Rever Aviso Legal
                        </button>
                      </div>
                    ) : (
                      <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-amber-50 border border-amber-150 rounded-2xl">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-amber-100 text-amber-700 rounded-xl">
                            <AlertCircle size={20} />
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-800">Consentimento Pendente</p>
                            <p className="text-xs text-slate-500 font-semibold mt-0.5">
                              O aviso legal ainda não foi aceito para esta empresa.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsReverOpen(true)}
                          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs transition duration-150 shadow-md shadow-blue-500/10 cursor-pointer whitespace-nowrap self-start sm:self-auto text-center"
                        >
                          Visualizar e Aceitar
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-8 bg-slate-950 text-slate-200 rounded-[24px] border border-slate-800 shadow-xl space-y-6">
                  <div className="flex items-center gap-3">
                    <Scale size={24} className="text-amber-500 shrink-0" />
                    <h4 className="text-[14px] font-bold tracking-wide uppercase text-amber-500">
                      AVISO LEGAL INTERNO & CERTIFICAÇÃO FISCAL
                    </h4>
                  </div>
                  
                  <div className="my-4 border-t border-slate-850" />

                  <div className="text-left text-[13px] leading-[1.8] text-slate-350 space-y-6 font-sans">
                    <p>
                      O <strong>Sabush System ERP</strong> é uma ferramenta de gestão interna voltada para pequenas e médias empresas.
                    </p>
                    
                    <div>
                      <h5 className="font-bold text-white mb-1.5 uppercase tracking-wide text-xs">I. CERTIFICAÇÃO FISCAL:</h5>
                      <p className="text-slate-300">
                        Este sistema <span className="font-semibold text-rose-500">NÃO é certificado</span> pela Autoridade Tributária de Moçambique (AT). Os documentos gerados (faturas, recibos) <span className="font-semibold text-rose-500">NÃO substituem</span> documentos fiscais oficiais.
                      </p>
                    </div>

                    <div>
                      <h5 className="font-bold text-white mb-1.5 uppercase tracking-wide text-xs font-sans">II. OBRIGAÇÃO LEGAL TRIBUTÁRIA:</h5>
                      <ul className="space-y-2.5 list-none pl-0">
                        <li className="relative pl-5 text-slate-300">
                          <span className="absolute left-0 text-amber-500">•</span>
                          Empresas com volume de negócios ABAIXO de <span className="font-semibold text-amber-500">2.500.000 MZN</span>/ano podem utilizar este sistema livremente para fins de gestão interna.
                        </li>
                        <li className="relative pl-5 text-slate-300">
                          <span className="absolute left-0 text-amber-500">•</span>
                          Empresas com volume de negócios ACIMA de <span className="font-semibold text-amber-500">2.500.000 MZN</span>/ano são legalmente obrigadas a utilizar software devidamente certificado pela AT para emissão de documentos fiscais oficiais de faturação eletrónica.
                        </li>
                      </ul>
                    </div>

                    <div>
                      <h5 className="font-bold text-white mb-1.5 uppercase tracking-wide text-xs">III. DECLARAÇÃO DE RESPONSABILIDADE:</h5>
                      <p className="text-slate-300 font-medium">
                        O utilizador aceita total responsabilidade pelo cumprimento das suas obrigações fiscais perante a AT de Moçambique. O Sabush System ERP e os seus desenvolvedores não se responsabilizam por quaisquer sanções, coimas ou penalizações fiscais resultantes do uso inadequado de faturas geradas internamente como documentos oficiais.
                      </p>
                    </div>
                  </div>
                </div>

                <LegalWarningModal
                  isOpen={isReverOpen}
                  onClose={() => setIsReverOpen(false)}
                  readOnly={true}
                  businessId={profile?.businessId}
                  userId={user?.uid}
                  userName={profile?.displayName || profile?.name || user?.displayName}
                />
              </div>
            );
          })()}

          {activeTab !== 'legal_info' && (
            <div className="pt-8 border-t flex justify-end">
              {(!isSystemAdmin && tabs.find(t => t.id === activeTab)?.isSensitive) ? (
                <div className="px-6 py-3 bg-amber-50/70 text-amber-800 font-extrabold text-[11px] uppercase tracking-wider rounded-2xl cursor-not-allowed flex items-center gap-2 border border-amber-100/50">
                  <Lock size={14} className="text-amber-600" />
                  Alterações Desativadas para o seu cargo
                </div>
              ) : (
                <button 
                  onClick={handleUpdateSettings}
                  disabled={loading}
                  className="px-8 py-3 bg-slate-900 text-white rounded-2xl font-bold flex items-center gap-2 hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/10 active:scale-95 disabled:opacity-50"
                >
                  {loading ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                  {tabs.find(t => t.id === activeTab)?.isSensitive ? 'Guardar Definições da Empresa' : 'Gravar Preferências'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      
      <ManagerPINModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        onSuccess={executeReset}
        actionName={pendingResetAction === 'factory' ? 'Reposição de Fábrica Completa' : `Limpeza de dados (${pendingResetAction || ''})`}
      />
    </div>
  );
}
