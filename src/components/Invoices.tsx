import React, { useState, useEffect, useMemo } from 'react';
import { db, storage, handleFirestoreError, OperationType } from '../lib/firebase';
import { subscribeToCollection } from '../lib/firestoreCache';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, getDocs, getDoc, doc, updateDoc, increment, writeBatch } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { Plus, Search, FileText, Download, Send, MoreVertical, Loader2, Sparkles, Link as LinkIcon, Trash2, Printer, Copy, Check, Share2, Eye, ZoomIn, ZoomOut, CheckCircle2, UserPlus, X, Edit2, LayoutGrid, List } from 'lucide-react';
import { cn, formatDateInTimezone, formatDateTimeInTimezone } from '../lib/utils';
import { cascadeStockDeduction } from '../lib/stockDeduction';
import { toast } from 'sonner';
import Skeleton from './ui/Skeleton';
import { offlineDb } from '../lib/offlineDb';
import { logAction, ActionType } from '../lib/logger';
import { generateInvoicePDF, generatePaymentReceiptPDF } from '../lib/pdfGenerator';
import ManagerPINModal from './ManagerPINModal';
import { formatSystemCurrency, formatCurrencyValue } from '../lib/currencies';

interface InvoicesProps {
  initialAction?: string | null;
  onActionHandled?: () => void;
}

export default function Invoices({ initialAction, onActionHandled }: InvoicesProps = {}) {
  const { profile, user, businessData } = useAuth();
  const { t, i18n } = useTranslation();
  const currency = businessData?.currency || 'MZN';
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'list' | 'add' | 'manage'>('list');
  const [isCreating, setIsCreating] = useState(false);
  const [invoiceViewMode, setInvoiceViewMode] = useState<'card' | 'list'>(() => {
    try {
      return (localStorage.getItem('invoice_view_mode') as 'card' | 'list') || 'card';
    } catch {
      return 'card';
    }
  });
  const [activeActionMenuId, setActiveActionMenuId] = useState<string | null>(null);

  useEffect(() => {
    const initTab = sessionStorage.getItem('init_invoice_tab');
    if (initTab === 'add' || initialAction === 'create') {
      setActiveTab('add');
      setIsCreating(true);
      sessionStorage.removeItem('init_invoice_tab');
      if (onActionHandled) {
        onActionHandled();
      }
    } else if (initTab) {
      setActiveTab(initTab as any);
      sessionStorage.removeItem('init_invoice_tab');
    }
  }, [initialAction, onActionHandled]);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [manageStatusFilter, setManageStatusFilter] = useState<'all' | 'unpaid' | 'paid'>('all');
  const [manageSearchQuery, setManageSearchQuery] = useState('');

  // Manager Authorization state
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinSuccessAction, setPinSuccessAction] = useState<() => void>(() => {});
  const [pinActionName, setPinActionName] = useState('');

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

  // Payment Link & Sharing State
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [selectedInvoiceForShare, setSelectedInvoiceForShare] = useState<any>(null);
  const [shareUrl, setShareUrl] = useState('');
  const [whatsappMessage, setWhatsappMessage] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [copied, setCopied] = useState(false);

  // Preview Invoice State
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewInvoiceData, setPreviewInvoiceData] = useState<any>(null);
  const [invoicePayments, setInvoicePayments] = useState<any[]>([]);
  const [previewZoom, setPreviewZoom] = useState<number>(100);
  const [previewFormat, setPreviewFormat] = useState<'A4' | 'thermal_80mm' | 'thermal_58mm'>('A4');
  const [showFormatConfig, setShowFormatConfig] = useState(false);
  const [isSavingPrinter, setIsSavingPrinter] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Cancellation, Reversal, & Invoice Item Management states
  const [cancellingInvoiceId, setCancellingInvoiceId] = useState<string | null>(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('Erro de lançamento');
  const [customCancelReason, setCustomCancelReason] = useState('');
  const [invoiceItemSearch, setInvoiceItemSearch] = useState('');

  const getStatusBadge = (status: string) => {
    const normalized = (status || '').toLowerCase();
    
    let label = 'PENDENTE';
    let classes = 'bg-amber-100 text-amber-700 border-amber-200';
    let dotClass = 'bg-amber-500';

    if (normalized === 'draft' || normalized === 'rascunho') {
      label = 'RASCUNHO';
      classes = 'bg-slate-100 text-slate-600 border-slate-200';
      dotClass = 'bg-slate-400';
    } else if (normalized === 'overdue' || normalized === 'em atraso') {
      label = 'PENDENTE (EM ATRASO)';
      classes = 'bg-rose-100 text-rose-700 border-rose-200';
      dotClass = 'bg-rose-500';
    } else if (normalized === 'partial' || normalized === 'parcial' || normalized === 'parcialmente pago') {
      label = 'PARCIALMENTE PAGO';
      classes = 'bg-blue-100 text-blue-700 border-blue-200';
      dotClass = 'bg-blue-500';
    } else if (normalized === 'paid' || normalized === 'pago') {
      label = 'PAGO';
      classes = 'bg-emerald-100 text-emerald-700 border-emerald-200';
      dotClass = 'bg-emerald-500';
    } else if (normalized === 'cancelled' || normalized === 'cancelada') {
      label = 'CANCELADA';
      classes = 'bg-purple-100 text-purple-700 border-purple-200';
      dotClass = 'bg-purple-500';
    }

    return (
      <span className={cn("px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-1.5 border", classes)}>
        <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", dotClass)} />
        {label}
      </span>
    );
  };

  // Sync format with business preference when loading / preview opens
  useEffect(() => {
    if (isPreviewOpen && businessData?.printerType) {
      if (businessData.printerType === 'standard') {
        setPreviewFormat('A4');
      } else if (businessData.printerType === 'thermal_80mm') {
        setPreviewFormat('thermal_80mm');
      } else if (businessData.printerType === 'thermal_58mm') {
        setPreviewFormat('thermal_58mm');
      }
    }
  }, [isPreviewOpen, businessData?.printerType]);

  const savePrinterPreference = async (format: 'standard' | 'thermal_80mm' | 'thermal_58mm') => {
    if (!profile?.businessId) {
      toast.error("Nenhum ID de empresa associado!");
      return;
    }
    setIsSavingPrinter(true);
    try {
      const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
      await updateDoc(doc(db, `businesses/${profile.businessId}`), {
        printerType: format,
        updatedAt: serverTimestamp()
      });
      toast.success(`Preferência guardada! Formato predefinido alterado para: ${
        format === 'standard' ? 'A4' : format === 'thermal_80mm' ? 'Rolo Térmico 80mm' : 'Rolo Térmico 58mm'
      }`);
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao guardar preferência: " + err.message);
    } finally {
      setIsSavingPrinter(false);
    }
  };

  // Quick Add / Restock stock tool from Invoice Creator
  const [showAddStockModal, setShowAddStockModal] = useState(false);
  const [addStockForm, setAddStockForm] = useState({
    name: '',
    price: 0,
    costPrice: 0,
    stockLevel: 10,
    category: 'Geral',
    existingProductId: ''
  });

  const handleQuickAddStock = async () => {
    if (!profile?.businessId) return;
    if (!addStockForm.name) {
      toast.error("Por favor, introduza o nome do artigo.");
      return;
    }

    try {
      const { collection, addDoc, doc, updateDoc, increment, serverTimestamp } = await import('firebase/firestore');
      let finalProductId = addStockForm.existingProductId;

      if (addStockForm.existingProductId) {
        // Replenish stock level of existing product
        await updateDoc(doc(db, `businesses/${profile.businessId}/products`, addStockForm.existingProductId), {
          stockLevel: increment(Number(addStockForm.stockLevel)),
          updatedAt: serverTimestamp()
        });
        toast.success(`Stock do artigo '${addStockForm.name}' reposto com sucesso (+${addStockForm.stockLevel} unid.)!`);
      } else {
        // Create a completely new product & set its initial stock
        const newProdPayload = {
          name: addStockForm.name,
          sku: `SKU-${Date.now().toString().slice(-6)}`,
          barcode: '',
          price: Number(addStockForm.price) || 0,
          onlinePrice: Number(addStockForm.price) || 0,
          costPrice: Number(addStockForm.costPrice) || 0,
          availableOnline: false,
          description: 'Adicionado via Faturação',
          stockLevel: Number(addStockForm.stockLevel) || 10,
          lowStockThreshold: 2,
          category: addStockForm.category || 'Geral',
          supplier: '',
          tieredPrices: [],
          unitDiscountTiers: [],
          hasMultiUnits: false,
          baseUnitName: 'Unidade',
          hasBoxUnit: false,
          boxUnitQty: 10,
          boxUnitPrice: 0,
          hasPackUnit: false,
          packUnitQty: 100,
          packUnitPrice: 0,
          businessId: profile.businessId,
          updatedAt: serverTimestamp()
        };
        const docRef = await addDoc(collection(db, `businesses/${profile.businessId}/products`), newProdPayload);
        finalProductId = docRef.id;
        toast.success(`Artigo '${addStockForm.name}' gravado no stock com sucesso!`);
      }

      // Automatically add/select this product into the current active invoice items list!
      const isDuplicate = newInvoice.items.some((item: any) => item.productId === finalProductId);
      if (isDuplicate) {
        toast.warning(`O artigo "${addStockForm.name}" já está adicionado/selecionado nesta fatura.`);
        setProductSearch('');
        setShowProductDropdown(false);
        setShowAddStockModal(false);
        return;
      }
      const newItem = {
        description: addStockForm.name,
        quantity: 1,
        price: Number(addStockForm.price) || 0,
        productId: finalProductId
      };

      setNewInvoice(prev => {
        const items = [...prev.items];
        // If the only item is an empty dummy row, replace it. Otherwise, append.
        if (items.length === 1 && items[0].description === '' && items[0].price === 0) {
          return { ...prev, items: [newItem] };
        } else {
          return { ...prev, items: [...items, newItem] };
        }
      });

      // Clear search and close modal safely
      setProductSearch('');
      setShowProductDropdown(false);
      setShowAddStockModal(false);
    } catch (e: any) {
      console.error(e);
      toast.error("Erro ao adicionar artigo ao stock: " + e.message);
    }
  };

  // Form state
  const [newInvoice, setNewInvoice] = useState({
    customerId: '',
    items: [] as any[],
    status: 'paid',
    paymentType: 'cash', // 'cash' or 'credit'
    dueDate: '',
    saleType: 'retail', // 'retail' or 'wholesale'
    taxRate: 0,
    taxInclusive: true,
    discountRate: 0,
    notes: ''
  });

  const [saleTypeFilter, setSaleTypeFilter] = useState<'all' | 'retail' | 'wholesale'>('all');

  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [selectedCustomerBalance, setSelectedCustomerBalance] = useState(0);

  const [invCustomerNotes, setInvCustomerNotes] = useState('');
  const [invSavingNotes, setInvSavingNotes] = useState(false);

  useEffect(() => {
    if (newInvoice.customerId && newInvoice.customerId !== 'Walk-in') {
      const activeCust = customers.find(c => c.id === newInvoice.customerId);
      setInvCustomerNotes(activeCust?.notes || '');
    } else {
      setInvCustomerNotes('');
    }
  }, [newInvoice.customerId, customers]);

  const handleSaveInvoiceCustomerNotes = async () => {
    if (!profile?.businessId || !newInvoice.customerId || newInvoice.customerId === 'Walk-in') return;
    setInvSavingNotes(true);
    try {
      await updateDoc(doc(db, `businesses/${profile.businessId}/customers`, newInvoice.customerId), {
        notes: invCustomerNotes.trim()
      });
      toast.success("Notas pessoais do cliente atualizadas!");
    } catch (e: any) {
      toast.error("Erro ao atualizar notas: " + (e.message || e));
    } finally {
      setInvSavingNotes(false);
    }
  };

  // Assisted Invoice Confirmation Wizard states
  const [isConfirmWizardOpen, setIsConfirmWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(3);
  const [wizardPaymentMethod, setWizardPaymentMethod] = useState<'cash' | 'card' | 'mpesa' | 'credit'>('cash');
  const [wizardAmountPaid, setWizardAmountPaid] = useState<string>('');
  const [wizardDueDate, setWizardDueDate] = useState<string>('');
  const [autoPrintReceipt, setAutoPrintReceipt] = useState(true);
  const [sendWhatsApp, setSendWhatsApp] = useState(true);
  const [sendEmail, setSendEmail] = useState(true);

  // Search states for customer and product matching
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);

  const filteredInvoiceProducts = React.useMemo(() => {
    const q = productSearch.toLowerCase().trim();
    if (!q) return products;
    return products.filter(p => p.name?.toLowerCase().includes(q));
  }, [products, productSearch]);

  const filteredInvoiceItemSearchProducts = React.useMemo(() => {
    const q = invoiceItemSearch.toLowerCase().trim();
    if (!q) return [];
    return products.filter(p => p.name?.toLowerCase().includes(q)).slice(0, 10);
  }, [products, invoiceItemSearch]);

  // Quick Create Customer states & function
  const [quickCustomerModalOpen, setQuickCustomerModalOpen] = useState(false);
  const [quickCustomerName, setQuickCustomerName] = useState('');
  const [quickCustomerPhone, setQuickCustomerPhone] = useState('');
  const [quickCustomerEmail, setQuickCustomerEmail] = useState('');
  const [quickCustomerAddress, setQuickCustomerAddress] = useState('');
  const [savingQuickCustomer, setSavingQuickCustomer] = useState(false);

  const handleCreateQuickCustomer = async () => {
    if (!profile?.businessId) return;
    if (!quickCustomerName.trim()) {
      toast.error("Por favor, preencha o nome do cliente.");
      return;
    }

    const normalizedNewName = quickCustomerName.trim().toLowerCase();
    const normalizedNewPhone = quickCustomerPhone.trim();
    const normalizedNewEmail = quickCustomerEmail.trim().toLowerCase();

    const isDuplicate = customers.some(c => {
      const nameMatch = c.name?.trim().toLowerCase() === normalizedNewName;
      const phoneMatch = normalizedNewPhone && c.phone?.trim() === normalizedNewPhone;
      const emailMatch = normalizedNewEmail && c.email?.trim().toLowerCase() === normalizedNewEmail;
      return nameMatch || phoneMatch || emailMatch;
    });

    if (isDuplicate) {
      toast.error("Já existe um cliente registado com os mesmos detalhes (Nome, Email ou Contacto Telefónico).");
      return;
    }

    setSavingQuickCustomer(true);
    try {
      const { addDoc, collection, serverTimestamp } = await import('firebase/firestore');
      const docRef = await addDoc(collection(db, `businesses/${profile.businessId}/customers`), {
        name: quickCustomerName.trim(),
        phone: quickCustomerPhone.trim(),
        email: quickCustomerEmail.trim(),
        address: quickCustomerAddress.trim(),
        totalSpent: 0,
        outstandingBalance: 0,
        businessId: profile.businessId,
        createdAt: serverTimestamp()
      });

      // Update state and select the newly created customer
      setNewInvoice(prev => ({ ...prev, customerId: docRef.id }));
      setCustomerSearch(quickCustomerName.trim());
      
      // Close and clear modal
      setQuickCustomerModalOpen(false);
      setQuickCustomerName('');
      setQuickCustomerPhone('');
      setQuickCustomerEmail('');
      setQuickCustomerAddress('');

      toast.success("Cliente criado e seleccionado com sucesso!");
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao criar cliente: " + (err.message || err));
    } finally {
      setSavingQuickCustomer(false);
    }
  };

  // States to filter invoice transaction list by employee / computer account
  const [operatorFilter, setOperatorFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination states
  const [currentPageInvoices, setCurrentPageInvoices] = useState(1);
  const [currentPageManage, setCurrentPageManage] = useState(1);
  const [itemsPerPage] = useState(10);

  useEffect(() => {
    setCurrentPageInvoices(1);
  }, [searchQuery, operatorFilter, saleTypeFilter]);

  useEffect(() => {
    setCurrentPageManage(1);
  }, [manageSearchQuery, manageStatusFilter]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (activeActionMenuId) {
        const target = event.target as HTMLElement;
        if (!target.closest('.dots-menu-container')) {
          setActiveActionMenuId(null);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeActionMenuId]);

  useEffect(() => {
    if (!profile?.businessId || !previewInvoiceData) {
      setInvoicePayments([]);
      return;
    }
    const paymentsRef = collection(db, `businesses/${profile.businessId}/payments`);
    const q = query(paymentsRef, where('invoiceId', '==', previewInvoiceData.id));
    const unsubscribeDirect = onSnapshot(q, (snap) => {
      const direct = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      
      // Let's also query allocations or do a single fetch for all customer payments and filter client-side
      const qAll = query(paymentsRef, where('customerId', '==', previewInvoiceData.customerId));
      getDocs(qAll).then(allSnap => {
        const allPayments = allSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        const filtered = allPayments.filter((p: any) => {
          if (p.invoiceId === previewInvoiceData.id) return true;
          if (p.allocations && Array.isArray(p.allocations)) {
            return p.allocations.some((alloc: any) => alloc.invoiceId === previewInvoiceData.id);
          }
          return false;
        });
        
        // Combine and remove duplicates by ID
        const combined: any[] = [...direct];
        filtered.forEach((p: any) => {
          if (!combined.some(c => c.id === p.id)) {
            combined.push(p);
          }
        });
        
        // Sort by date/createdAt
        combined.sort((a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime());
        setInvoicePayments(combined);
      }).catch(err => {
        console.error("Error fetching all customer payments:", err);
        setInvoicePayments(direct);
      });
    });

    return () => unsubscribeDirect();
  }, [previewInvoiceData, profile?.businessId]);

  const isManager = profile?.role === 'owner' || profile?.role === 'business_owner' || profile?.role === 'manager' || profile?.role === 'super_admin';
  const shouldRestrict = !isManager && businessData?.restrictStaffToOwnTransactions !== false;

  const filteredInvoicesList = invoices.filter(inv => {
    // If cashier restriction is active, only show transactions they created
    if (shouldRestrict) {
      if (inv.createdByUid !== profile?.uid && inv.createdByEmail !== profile?.email && inv.createdByEmail !== user?.email) {
        return false;
      }
    }

    const operator = inv.createdByName || 'Admin/Manager';
    const matchesOperator = operatorFilter === 'all' || operator === operatorFilter;
    
    const matchesSaleType = saleTypeFilter === 'all' || 
      (saleTypeFilter === 'retail' && (inv.saleType || 'retail') === 'retail') ||
      (saleTypeFilter === 'wholesale' && inv.saleType === 'wholesale');

    const customerName = customers.find(c => c.id === inv.customerId)?.name || inv.customerId || 'Walk-in';
    const matchesSearch = searchQuery === '' || 
      inv.invoiceNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      operator?.toLowerCase().includes(searchQuery.toLowerCase());
      
    return matchesOperator && matchesSearch && matchesSaleType;
  });

  const startIndexInvoices = (currentPageInvoices - 1) * itemsPerPage;
  const endIndexInvoices = startIndexInvoices + itemsPerPage;
  const paginatedInvoicesList = filteredInvoicesList.slice(startIndexInvoices, endIndexInvoices);

  const filteredMetrics = useMemo(() => {
    let paid = 0;
    let pending = 0;
    filteredInvoicesList.forEach(inv => {
      const status = (inv.status || '').toLowerCase();
      const total = inv.total || 0;
      if (status === 'paid' || status === 'pago') {
        paid += total;
      } else if (status !== 'cancelled' && status !== 'cancelada' && status !== 'draft' && status !== 'rascunho') {
        pending += total;
      }
    });
    return { paid, pending };
  }, [filteredInvoicesList]);

  const uniqueOperators = Array.from(new Set(
    invoices
      .filter(inv => {
        if (shouldRestrict) {
          return inv.createdByUid === profile?.uid || inv.createdByEmail === profile?.email || inv.createdByEmail === user?.email;
        }
        return true;
      })
      .map(inv => inv.createdByName || 'Admin/Manager')
  ));

  useEffect(() => {
    if (!profile?.businessId) return;

    // Load from local IndexedDB cache first for immediate visualization
    offlineDb.getInvoices().then((cachedInvoices) => {
      if (cachedInvoices && cachedInvoices.length > 0) {
        setInvoices(cachedInvoices.sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
        setLoading(false);
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

    const cachedCustomers = localStorage.getItem(`sabush_cached_customers_${profile.businessId}`);
    if (cachedCustomers) {
      try {
        setCustomers(JSON.parse(cachedCustomers));
      } catch (e) {
        console.warn("Could not load customers from offline cache:", e);
      }
    }
    
    // Fetch Invoices
    const q = query(collection(db, `businesses/${profile.businessId}/invoices`));
    const unsubscribe = subscribeToCollection(
      `businesses/${profile.businessId}/invoices`,
      (items) => {
        const sorted = [...items].sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setInvoices(sorted);
        setLoading(false);
        offlineDb.saveInvoices(sorted).catch(err => {
          console.warn("Could not save invoices to offline cache:", err);
        });
      },
      q,
      (error) => {
        setLoading(false);
        try {
          handleFirestoreError(error, OperationType.LIST, `businesses/${profile.businessId}/invoices`);
        } catch (e) {
          console.warn("Gracefully logged invoices query error:", e);
        }
      }
    );

    // Fetch Customers (live updates)
    const unsubCustomers = subscribeToCollection(
      `businesses/${profile.businessId}/customers`,
      (items) => {
        setCustomers(items);
        try {
          localStorage.setItem(`sabush_cached_customers_${profile.businessId}`, JSON.stringify(items));
        } catch (e) {
          console.warn("Could not save customers to local storage:", e);
        }
      },
      undefined,
      (error) => {
        console.warn("Invoices: Customers listener failed, falling back", error);
      }
    );

    // Fetch Products (live updates)
    const unsubProducts = subscribeToCollection(
      `businesses/${profile.businessId}/products`,
      (items) => {
        setProducts(items);
        offlineDb.saveProducts(items).catch(err => {
          console.warn("Could not save products to offline cache:", err);
        });
      },
      undefined,
      (error) => {
        console.warn("Invoices: Products listener failed, falling back", error);
      }
    );

    return () => {
      unsubscribe();
      unsubCustomers();
      unsubProducts();
    };
  }, [profile?.businessId]);

  useEffect(() => {
    if (newInvoice.customerId && newInvoice.customerId !== 'Walk-in') {
      const customer = customers.find(c => c.id === newInvoice.customerId);
      setSelectedCustomerBalance(customer?.outstandingBalance || 0);
    } else {
      setSelectedCustomerBalance(0);
      if (newInvoice.paymentType === 'credit') {
        setNewInvoice(prev => ({ ...prev, paymentType: 'cash' }));
        toast.info("Vendas a crédito não estão disponíveis para clientes Walk-in. Alterado para dinheiro.");
      }
    }
  }, [newInvoice.customerId, customers, newInvoice.paymentType]);

  useEffect(() => {
    const savedQuery = localStorage.getItem('invoice_search_query');
    if (savedQuery) {
      setSearchQuery(savedQuery);
      localStorage.removeItem('invoice_search_query');
    }
  }, []);

  useEffect(() => {
    const highlightId = sessionStorage.getItem('highlight_invoice_id');
    if (highlightId && invoices.length > 0) {
      const targetInvoice = invoices.find(inv => inv.id === highlightId);
      if (targetInvoice && targetInvoice.invoiceNumber) {
        setSearchQuery(targetInvoice.invoiceNumber);
        setActiveTab('list');
      }
      sessionStorage.removeItem('highlight_invoice_id');
    }
  }, [invoices]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleBulkDelete = async () => {
    if (!profile?.businessId || selectedIds.length === 0) return;
    executeWithManagerAuthorization(`eliminar definitivamente ${selectedIds.length} faturas em massa`, async () => {
      const loadingToastId = toast.loading("A eliminar faturas em massa...");
      try {
        const { doc, writeBatch, increment } = await import('firebase/firestore');
        const batch = writeBatch(db);
        
        for (const id of selectedIds) {
          const inv = invoices.find(i => i.id === id);
          if (inv) {
            const invoiceRef = doc(db, `businesses/${profile.businessId}/invoices`, id);
            batch.delete(invoiceRef);
            
            const unpaidBal = inv.outstandingBalance || 0;
            if (unpaidBal > 0 && inv.customerId && inv.customerId !== 'Walk-in') {
              const custRef = doc(db, `businesses/${profile.businessId}/customers`, inv.customerId);
              batch.update(custRef, {
                outstandingBalance: increment(-unpaidBal)
              });
            }
          }
        }
        
        await batch.commit();
        await logAction(profile.uid, profile.email, ActionType.DELETE_INVOICE, `Bulk deleted ${selectedIds.length} invoices`, profile.businessId);
        toast.dismiss(loadingToastId);
        toast.success(`${selectedIds.length} faturas eliminadas com sucesso!`);
        setSelectedIds([]);
      } catch (error: any) {
        toast.dismiss(loadingToastId);
        toast.error("Falha ao eliminar faturas: " + (error.message || error));
      }
    });
  };

  const handleBulkArchive = async () => {
    if (!profile?.businessId || selectedIds.length === 0) return;
    try {
      const { updateDoc, doc } = await import('firebase/firestore');
      const archivePromises = selectedIds.map(id => 
        updateDoc(doc(db, `businesses/${profile.businessId}/invoices`, id), { archived: true, updatedAt: serverTimestamp() })
      );
      await Promise.all(archivePromises);
      await logAction(profile.uid, profile.email, ActionType.UPDATE_INVOICE, `Bulk archived ${selectedIds.length} invoices`, profile.businessId);
      toast.success(`${selectedIds.length} faturas arquivadas.`);
      setSelectedIds([]);
    } catch (error) {
      toast.error("Erro ao arquivar algumas faturas.");
    }
  };

  const handleSettleInvoiceInline = async (invoice: any) => {
    if (!profile?.businessId) return;
    executeWithManagerAuthorization(`liquidar a fatura #${invoice.invoiceNumber}`, async () => {
      const loadingToastId = toast.loading("A liquidar fatura...");
      try {
        const { doc, writeBatch, increment } = await import('firebase/firestore');
        const batch = writeBatch(db);
        
        const invoiceRef = doc(db, `businesses/${profile.businessId}/invoices`, invoice.id);
        const originalUnpaid = invoice.status === 'paid' ? 0 : (invoice.outstandingBalance || invoice.total || 0);
        
        batch.update(invoiceRef, {
          status: 'paid',
          outstandingBalance: 0,
          amountPaid: invoice.total || 0,
          updatedAt: serverTimestamp()
        });
        
        if (invoice.customerId && invoice.customerId !== 'Walk-in') {
          const custRef = doc(db, `businesses/${profile.businessId}/customers`, invoice.customerId);
          batch.update(custRef, {
            outstandingBalance: increment(-originalUnpaid),
            lastInvoiceDate: serverTimestamp()
          });
        }
        
        await batch.commit();
        await logAction(
          profile.uid, 
          profile.email, 
          ActionType.UPDATE_INVOICE, 
          `Settled/Paid invoice ${invoice.invoiceNumber} inline`, 
          profile.businessId
        );
        toast.dismiss(loadingToastId);
        toast.success(`Fatura #${invoice.invoiceNumber} marcada como PAGA!`);
      } catch (error: any) {
        toast.dismiss(loadingToastId);
        toast.error("Erro ao liquidar fatura: " + (error.message || error));
      }
    });
  };

  const handleSendOverdueReminder = async (invoice: any) => {
    if (!profile?.businessId) return;
    
    const customerObj = customers.find(c => c.id === invoice.customerId) || invoice.customerDetails;
    const recipientPhone = customerObj?.phone || invoice.customerPhone || '';
    const customerName = customerObj?.name || invoice.customerName || 'Cliente';
    
    if (!recipientPhone) {
      toast.error(i18n.language === 'pt' ? "O cliente não possui contacto telefónico cadastrado." : "Customer does not have a phone number registered.");
      return;
    }

    const whatsappApiKey = businessData?.whatsappConfig?.apiKey || profile?.whatsappConfig?.apiKey || '';
    const whatsappPhone = businessData?.whatsappConfig?.phone || profile?.whatsappConfig?.phone || '';
    const whatsappPhoneNumberId = businessData?.whatsappConfig?.phoneNumberId || profile?.whatsappConfig?.phoneNumberId || '';
    const webhookUrl = businessData?.makeConfig?.webhookUrl || profile?.makeConfig?.webhookUrl || '';

    const outstandingAmt = invoice.outstandingBalance !== undefined ? invoice.outstandingBalance : (invoice.total - (invoice.amountPaid || 0));

    // Check if WhatsApp API is fully configured
    if (whatsappApiKey && whatsappPhoneNumberId) {
      const loadingToastId = toast.loading(i18n.language === 'pt' ? "A enviar lembrete por WhatsApp..." : "Sending WhatsApp reminder...");
      try {
        const { sendWhatsAppNotification } = await import('../lib/whatsappService');
        const success = await sendWhatsAppNotification({
          apiKey: whatsappApiKey,
          phoneNumberId: whatsappPhoneNumberId,
          businessPhone: whatsappPhone,
          webhookUrl,
          recipientPhone,
          customerName,
          orderNumber: invoice.invoiceNumber,
          totalAmount: outstandingAmt,
          currency: currency || 'MT',
          items: invoice.items || [],
          invoicePdfUrl: invoice.pdfUrl || '',
          reminderTemplate: businessData?.automation?.reminderTemplate || profile?.automation?.reminderTemplate,
          isReminder: true
        });
        
        toast.dismiss(loadingToastId);
        if (success) {
          toast.success(i18n.language === 'pt' ? `Lembrete automático enviado para +${recipientPhone}!` : `Automated reminder sent to +${recipientPhone}!`);
        }
      } catch (err: any) {
        toast.dismiss(loadingToastId);
        toast.error("Error: " + (err.message || err));
      }
    } else {
      // Fallback: Manual WhatsApp web link
      const reminderTemplate = businessData?.automation?.reminderTemplate || profile?.automation?.reminderTemplate || 
        'Olá *{customerName}*!\nRelembramos que a fatura *{orderNumber}* no valor de *{totalAmount} {currency}* encontra-se pendente de pagamento.\n\nAgradecemos a regularização do saldo correspondente.\n\nSempre ao seu dispor,\n_Sabush System ERP_';
      
      const formattedItems = (invoice.items || [])
        .map((item: any) => `- ${item.name || item.description || ''} (x${item.quantity || 1}): ${((item.price || item.onlinePrice || 0) * (item.quantity || 1)).toFixed(2)} ${currency}`)
        .join('\n');

      const textToSend = reminderTemplate
        .replace(/{customerName}/g, customerName)
        .replace(/{orderNumber}/g, invoice.invoiceNumber)
        .replace(/{totalAmount}/g, outstandingAmt.toLocaleString('pt-MZ', { minimumFractionDigits: 2 }))
        .replace(/{currency}/g, currency)
        .replace(/{items}/g, formattedItems)
        .replace(/{invoiceUrl}/g, invoice.pdfUrl || '');

      const cleanPhone = recipientPhone.replace(/\D/g, '');
      const whatsappUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(textToSend)}`;
      window.open(whatsappUrl, '_blank');
      toast.success(i18n.language === 'pt' ? "Redirecionando para o WhatsApp com rascunho de cobrança..." : "Redirecting to WhatsApp with dunning draft...");
    }
  };

  const handleBulkSettle = async () => {
    if (!profile?.businessId || selectedIds.length === 0) return;
    executeWithManagerAuthorization(`liquidar em massa ${selectedIds.length} faturas`, async () => {
      const loadingToastId = toast.loading("A marcar faturas selecionadas como pagas...");
      try {
        const { doc, writeBatch, increment } = await import('firebase/firestore');
        const batch = writeBatch(db);
        
        let settledCount = 0;
        
        for (const id of selectedIds) {
          const inv = invoices.find(i => i.id === id);
          if (inv && inv.status !== 'paid') {
            const invoiceRef = doc(db, `businesses/${profile.businessId}/invoices`, id);
            const unpaidBal = inv.status === 'paid' ? 0 : (inv.outstandingBalance || inv.total || 0);
            
            batch.update(invoiceRef, {
              status: 'paid',
              outstandingBalance: 0,
              amountPaid: inv.total || 0,
              updatedAt: serverTimestamp()
            });
            
            if (inv.customerId && inv.customerId !== 'Walk-in') {
              const custRef = doc(db, `businesses/${profile.businessId}/customers`, inv.customerId);
              batch.update(custRef, {
                outstandingBalance: increment(-unpaidBal),
                lastInvoiceDate: serverTimestamp()
              });
            }
            settledCount++;
          }
        }
        
        if (settledCount > 0) {
          await batch.commit();
          await logAction(
            profile.uid,
            profile.email,
            ActionType.UPDATE_INVOICE,
            `Bulk settled ${settledCount} invoices inline`,
            profile.businessId
          );
          toast.dismiss(loadingToastId);
          toast.success(`${settledCount} faturas marcadas como PAGAS!`);
        } else {
          toast.dismiss(loadingToastId);
          toast.info("Não havia faturas por liquidar na seleção.");
        }
        setSelectedIds([]);
      } catch (error: any) {
        toast.dismiss(loadingToastId);
        toast.error("Erro ao liquidar faturas em massa: " + (error.message || error));
      }
    });
  };

  const suggestItemsWithAI = async () => {
    setAiLoading(true);
    try {
      const selectedCustomer = newInvoice.customerId;
      const history = selectedCustomer && selectedCustomer !== 'Walk-in'
        ? invoices
            .filter((inv: any) => inv.customerId === selectedCustomer)
            .map((inv: any) => ({
              items: (inv.items || []).map((it: any) => ({
                description: it.description || '',
                quantity: it.quantity || 1,
                price: it.price || 0
              })),
              total: inv.total || 0,
              status: inv.status || 'paid'
            }))
        : [];

      const payload = {
        businessContext: {
          name: businessData?.name || profile?.businessName || 'Sabush System ERP',
          type: businessData?.type || 'Retail and Distribution Services',
          description: businessData?.description || 'African Enterprise and Wholesale Merchant ERP'
        },
        customerHistory: history
      };

      const response = await fetch('/api/ai/suggest-invoice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Server returned code ${response.status}`);
      }

      const resData = await response.json();
      const suggestions = resData.suggestion || [];

      if (Array.isArray(suggestions) && suggestions.length > 0) {
        const populatedSuggestions = suggestions.map((item: any) => ({
          description: item.description || item.item || 'Custom Goods / Services',
          quantity: Number(item.quantity) || 1,
          price: Number(item.price) || 0
        }));

        setNewInvoice((prev: any) => {
          const hasFreshFirstItem = prev.items.length === 1 && prev.items[0].description === '' && prev.items[0].price === 0;
          return {
            ...prev,
            items: hasFreshFirstItem ? populatedSuggestions : [...prev.items, ...populatedSuggestions]
          };
        });

        toast.success(`AI suggested ${populatedSuggestions.length} invoice items based on history and type!`);
      } else {
        toast.info("AI generated empty recommendations. Adding defaults.");
        setNewInvoice((prev: any) => ({
          ...prev,
          items: [...prev.items, { description: 'Suggested Standard Inventory Services', quantity: 1, price: 150 }]
        }));
      }
    } catch (error: any) {
      console.error("Failed to fetch AI suggestions:", error);
      toast.error("Failed to retrieve AI suggestions: " + (error?.message || "Internal Service Error"));
    } finally {
      setAiLoading(false);
    }
  };

  const handleCancelInvoiceForm = () => {
    setIsCreating(false);
    setActiveTab('list');
    setEditingInvoiceId(null);
    setNewInvoice({
      customerId: '',
      items: [] as any[],
      status: 'paid',
      paymentType: 'cash',
      dueDate: '',
      saleType: 'retail',
      taxRate: 0,
      taxInclusive: true,
      discountRate: 0,
      notes: ''
    });
    setCustomerSearch('');
  };

  const handleEditInvoiceClick = (invoice: any) => {
    executeWithManagerAuthorization(`editar / retificar a fatura #${invoice.invoiceNumber}`, () => {
      setEditingInvoiceId(invoice.id);
      setIsCreating(true);
      setActiveTab('add');
      setNewInvoice({
        customerId: invoice.customerId || 'Walk-in',
        items: invoice.items || [],
        status: invoice.status || 'paid',
        paymentType: invoice.paymentType || 'cash',
        dueDate: invoice.dueDate || '',
        saleType: invoice.saleType || 'retail',
        taxRate: invoice.taxRate || 0,
        taxInclusive: invoice.taxInclusive !== undefined ? invoice.taxInclusive : true,
        discountRate: invoice.discountRate || 0,
        notes: invoice.notes || ''
      });
      // Match the search text
      const matchedCustomer = customers.find(c => c.id === invoice.customerId);
      setCustomerSearch(matchedCustomer ? matchedCustomer.name : 'Walk-in');
    });
  };

  const handleAttemptSaveInvoice = () => {
    if (!profile?.businessId) {
      toast.error("Nenhum ID de empresa associado!");
      return;
    }

    if (!newInvoice.customerId) {
      toast.error("Por favor, selecione um cliente ou escolha 'Cliente Geral (Walk-in)'.");
      return;
    }

    if (!newInvoice.items || newInvoice.items.length === 0 || (newInvoice.items.length === 1 && newInvoice.items[0].description === '' && newInvoice.items[0].price === 0)) {
      toast.error("Por favor, adicione pelo menos um artigo à fatura antes de guardar.");
      return;
    }

    // Precalculate total
    const itemDiscountSubtotal = newInvoice.items.reduce((sum, item) => {
      const discountVal = item.discount || 0;
      const amount = item.quantity * item.price;
      return sum + (amount - (amount * discountVal / 100));
    }, 0);
    const globalDiscountRate = newInvoice.discountRate || 0;
    const rawSubtotal = itemDiscountSubtotal * (1 - globalDiscountRate / 100);
    const taxRate = newInvoice.taxRate ?? 0;
    const isInclusive = (newInvoice as any).taxInclusive !== false;
    const tax = isInclusive 
      ? rawSubtotal * (taxRate / (100 + taxRate)) 
      : rawSubtotal * (taxRate / 100);
    const total = isInclusive 
      ? rawSubtotal 
      : rawSubtotal + tax;

    // Reset and initialize Wizard states
    setWizardStep(3);
    setWizardPaymentMethod(newInvoice.paymentType as any || 'cash');
    setWizardAmountPaid(newInvoice.paymentType === 'credit' ? '0' : total.toFixed(2));
    
    // Initialize printing/sending configurations based on setting preferences
    setAutoPrintReceipt(businessData?.autoPrintOnCreate ?? true);
    setSendWhatsApp(!!(customers.find(c => c.id === newInvoice.customerId)?.phone) && (businessData?.automation?.autoSendInvoices !== false));
    setSendEmail(!!(customers.find(c => c.id === newInvoice.customerId)?.email));
    
    const calculatedDueDate = newInvoice.dueDate || (newInvoice.paymentType === 'cash'
      ? new Date().toISOString().split('T')[0]
      : new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    setWizardDueDate(calculatedDueDate);

    setIsConfirmWizardOpen(true);
  };

  const handleCreateInvoice = async () => {
    if (isSaving) return;
    if (!profile?.businessId) {
      toast.error("Nenhum ID de empresa associado!");
      return;
    }

    setIsSaving(true);
    // Immediately close modal and show loading spinner to avoid double-clicking or UI freeze
    setIsConfirmWizardOpen(false);
    const loadingToastId = toast.loading(editingInvoiceId ? "A retificar fatura..." : "A gravar fatura no sistema...");

    try {
      const itemDiscountSubtotal = newInvoice.items.reduce((sum, item) => {
        const discountVal = item.discount || 0;
        const amount = item.quantity * item.price;
        return sum + (amount - (amount * discountVal / 100));
      }, 0);
      const globalDiscountRate = newInvoice.discountRate || 0;
      const rawSubtotal = itemDiscountSubtotal * (1 - globalDiscountRate / 100);
      const taxRate = newInvoice.taxRate ?? 0;
      const isInclusive = (newInvoice as any).taxInclusive !== false;
      const tax = isInclusive 
        ? rawSubtotal * (taxRate / (100 + taxRate)) 
        : rawSubtotal * (taxRate / 100);
      const total = isInclusive 
        ? rawSubtotal 
        : rawSubtotal + tax;
      const subtotal = isInclusive 
        ? rawSubtotal - tax 
        : rawSubtotal;

      // Wizard selections mapping
      const paymentType = wizardPaymentMethod === 'credit' ? 'credit' : 'cash';
      const paidValue = wizardPaymentMethod === 'credit' ? 0 : (wizardAmountPaid ? Number(wizardAmountPaid) : total);
      const balance = total - paidValue;
      const status = balance <= 0 ? 'paid' : (paidValue > 0 ? 'partially_paid' : 'unpaid');
      
      const calculatedDueDate = wizardDueDate || (paymentType === 'cash'
        ? new Date().toISOString().split('T')[0]
        : new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

      if (editingInvoiceId) {
        const invoiceRef = doc(db, `businesses/${profile.businessId}/invoices`, editingInvoiceId);
        
        const matchedInvoice = invoices.find(inv => inv.id === editingInvoiceId);
        const originalInvoiceNumber = matchedInvoice?.invoiceNumber || `INV-${Date.now().toString().slice(-6)}`;
        const originalDate = matchedInvoice?.date || new Date().toISOString();
        const originalCreatedAt = matchedInvoice?.createdAt || serverTimestamp();

        const updatedInvoiceData = {
          ...newInvoice,
          status,
          paymentType,
          paymentMethod: wizardPaymentMethod,
          amountPaid: paidValue,
          outstandingBalance: balance,
          dueDate: calculatedDueDate,
          date: originalDate,
          businessId: profile.businessId,
          invoiceNumber: originalInvoiceNumber,
          subtotal,
          tax,
          total,
          previousBalance: selectedCustomerBalance,
          totalDue: selectedCustomerBalance + total,
          createdAt: originalCreatedAt,
          updatedAt: serverTimestamp(),
          createdByUid: matchedInvoice?.createdByUid || profile?.uid || '',
          createdByEmail: matchedInvoice?.createdByEmail || profile?.email || '',
          createdByName: matchedInvoice?.createdByName || profile?.displayName || 'N/A'
        };

        // Batch update to resolve and commit all edits atomically in one transaction
        const batch = writeBatch(db);
        batch.update(invoiceRef, updatedInvoiceData);

        // Adjust customer balance dynamically within the atomic write transaction
        if (newInvoice.customerId && newInvoice.customerId !== 'Walk-in') {
          const oldBalance = (matchedInvoice?.total || 0) - (matchedInvoice?.amountPaid || 0);
          const adjustment = balance - oldBalance;
          if (adjustment !== 0) {
            batch.update(doc(db, `businesses/${profile.businessId}/customers`, newInvoice.customerId), {
              outstandingBalance: increment(adjustment),
              lastInvoiceDate: serverTimestamp()
            });
          }
        }

        await batch.commit();

        const customerData = customers.find(c => c.id === newInvoice.customerId);
        // Log action asynchronously to avoid stalling the UI response
        logAction(profile.uid, profile.email, ActionType.CREATE_INVOICE, `Edited/Rectified invoice ${originalInvoiceNumber} for ${customerData?.name || 'Walk-in'}`, profile.businessId).catch(err => console.error(err));

        toast.dismiss(loadingToastId);
        toast.success("Fatura / Recibo retificado com sucesso!");

        const editPreviewInfo = {
          ...updatedInvoiceData,
          customerName: customerData?.name || 'Cliente Geral (Walk-in)',
          customerPhone: customerData?.phone || '',
          customerEmail: customerData?.email || '',
          deliveryAddress: customerData?.address || ''
        };
        setPreviewInvoiceData(editPreviewInfo);
        setIsPreviewOpen(true);
      } else {
        const invoiceData = {
          ...newInvoice,
          status,
          paymentType,
          paymentMethod: wizardPaymentMethod,
          amountPaid: paidValue,
          outstandingBalance: balance,
          dueDate: calculatedDueDate,
          date: new Date().toISOString(), // Actual invoice date
          businessId: profile.businessId,
          invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
          subtotal,
          tax,
          total,
          previousBalance: selectedCustomerBalance,
          totalDue: selectedCustomerBalance + total,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdByUid: profile?.uid || '',
          createdByEmail: profile?.email || '',
          createdByName: profile?.displayName || profile?.name || profile?.email || 'N/A',
          pdfUrl: ''
        };

        const invoiceColRef = collection(db, `businesses/${profile.businessId}/invoices`);
        const invoiceDocRef = doc(invoiceColRef);
        const invoiceId = invoiceDocRef.id;

        const batch = writeBatch(db);
        batch.set(invoiceDocRef, {
          ...invoiceData,
          id: invoiceId
        });

        // Loop over items and decrement stock!
        for (const item of newInvoice.items) {
          if (item.productId) {
            const prodRef = doc(db, `businesses/${profile.businessId}/products`, item.productId);
            const qtyToDeduct = (Number(item.quantity) || 1) * (Number(item.unitMultiplier) || 1);
            const itemQty = Number(item.quantity) || 1;
            const unit = item.selectedUnit || 'un';

            // Read current bucket levels so we can cascade (break open Emb/Cx into loose
            // units when the specific bucket being sold from is short) instead of blindly
            // decrementing one bucket and letting it go negative — see src/lib/stockDeduction.ts
            const prodSnap = await getDoc(prodRef);
            const prodData = prodSnap.exists() ? prodSnap.data() : {};
            const { stockCx, stockEmb, stockUn } = cascadeStockDeduction(prodData, unit, itemQty);

            let updateFields: any = {
              stockLevel: increment(-qtyToDeduct),
              stockCx,
              stockEmb,
              stockUn
            };

            batch.update(prodRef, updateFields);
          }
        }

        // If Credit or outstanding balance, update customer outstanding balance inside batch
        if (balance > 0 && newInvoice.customerId && newInvoice.customerId !== 'Walk-in') {
          batch.update(doc(db, `businesses/${profile.businessId}/customers`, newInvoice.customerId), {
            outstandingBalance: increment(balance),
            lastInvoiceDate: serverTimestamp()
          });
        }

        await batch.commit();

        // Dismiss loading spinner and show success IMMEDIATELY to user
        toast.dismiss(loadingToastId);
        toast.success("Fatura gravada com sucesso!");

        const customerData = customers.find(c => c.id === newInvoice.customerId);
        const newPreviewInfo = {
          ...invoiceData,
          customerName: customerData?.name || 'Cliente Geral (Walk-in)',
          customerPhone: customerData?.phone || '',
          customerEmail: customerData?.email || '',
          deliveryAddress: customerData?.address || ''
        };
        setPreviewInvoiceData(newPreviewInfo);
        setIsPreviewOpen(true);

        // Run secondary operations asynchronously in the background so they are NON-BLOCKING
        (async () => {
          try {
            // Log stock movements for each sold item
            try {
              const { addDoc, collection } = await import('firebase/firestore');
              for (const item of newInvoice.items) {
                if (item.productId) {
                  const qtyToDeduct = (Number(item.quantity) || 1) * (Number(item.unitMultiplier) || 1);
                  await addDoc(collection(db, `businesses/${profile.businessId}/stock_movements`), {
                    productId: item.productId,
                    productName: item.name || 'Produto',
                    qtyChange: -qtyToDeduct,
                    type: 'sale',
                    reference: invoiceData.invoiceNumber,
                    reportedBy: profile.email || 'Utilizador',
                    timestamp: serverTimestamp()
                  });
                }
              }
            } catch (errM) {
              console.error("[Invoices] Error logging stock movements:", errM);
            }

            let uploadedPdfUrl = '';
            // Generate and upload PDF to Firebase Storage
            try {
              const businessName = businessData?.name || profile?.businessName || 'Sabush System ERP';
              const businessAddress = businessData?.address || '';
              const companyInfo = {
                name: businessName,
                address: businessAddress,
                phone: businessData?.phone || profile?.phone || '',
                email: businessData?.email || profile?.email || '',
                nuit: businessData?.taxId || '400123456'
              };

              const invoicePrintData = {
                ...invoiceData,
                customerName: customerData?.name || 'Cliente Geral (Walk-in)',
                customerPhone: customerData?.phone || '',
                customerEmail: customerData?.email || '',
                deliveryAddress: customerData?.address || 'Moçambique'
              };

              const pdfDoc = generateInvoicePDF(invoicePrintData, companyInfo, { save: false });
              const pdfBlob = pdfDoc.output('blob');

              const storageRef = ref(storage, `businesses/${profile.businessId}/invoices/${invoiceId}.pdf`);
              const snapshot = await uploadBytes(storageRef, pdfBlob, { contentType: 'application/pdf' });
              uploadedPdfUrl = await getDownloadURL(snapshot.ref);

              await updateDoc(doc(db, `businesses/${profile.businessId}/invoices`, invoiceId), {
                pdfUrl: uploadedPdfUrl
              });
              invoiceData.pdfUrl = uploadedPdfUrl;
              if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
                console.log('[Invoices] Successfully uploaded PDF & appended link:', uploadedPdfUrl);
              }

              // Automated invoice trigger to client portal
              try {
                const { triggerInvoiceCreatedNotifications } = await import('../lib/notificationService');
                await triggerInvoiceCreatedNotifications(profile.businessId, {
                  invoiceNumber: invoiceData.invoiceNumber,
                  total: total,
                  customerId: newInvoice.customerId
                });
              } catch (notifErr) {
                console.error("Portal invoice trigger error:", notifErr);
              }

              setPreviewInvoiceData(prev => {
                if (prev && prev.invoiceNumber === invoiceData.invoiceNumber) {
                  return { ...prev, pdfUrl: uploadedPdfUrl };
                }
                return prev;
              });

              // Automated Owner Notification Email dispatch upon invoice creation
              const ownerEmail = businessData?.email || profile?.email || '';
              if (ownerEmail) {
                const subject = `[ERP Alerta] Nova Factura Emitida: ${invoiceData.invoiceNumber}`;
                const emailBody = `
Olá Proprietário / Administrador,

Uma nova factura / recibo foi emitida com sucesso no sistema.

Detalhes da Factura:
- Número: ${invoiceData.invoiceNumber}
- Cliente: ${customerData?.name || 'Cliente Geral (Walk-in)'}
- Total Geral (MZN): ${total.toLocaleString('pt-MZ')} ${currency}
- Tipo de Venda: ${newInvoice.saleType === 'retail' ? 'Retalho' : 'Grosso'}
- Meio de Pagamento: ${wizardPaymentMethod === 'cash' ? 'Dinheiro' : wizardPaymentMethod === 'card' ? 'Cartão' : wizardPaymentMethod === 'mpesa' ? 'M-Pesa' : 'Crédito (A pagar)'} (${status.toUpperCase()})
- Operador: ${profile?.displayName || profile?.name || profile?.email || 'N/A'}
- Data de Emissão: ${new Date().toLocaleString('pt-MZ')}

O arquivo PDF correspondente foi carregado no armazenamento seguro do ERP e está disponível em:
${uploadedPdfUrl || 'Pendente de upload'}

Mensagem gerada de forma automatizada pelo Sabush System ERP.
                `;
                const { sendEmailNotification } = await import('../lib/emailService');
                await sendEmailNotification(ownerEmail, subject, emailBody);
              }

              // Automated Customer Email dispatch
              const customerEmail = customerData?.email || '';
              if (sendEmail && customerEmail) {
                const custSubject = `[Fatura/Recibo] Nova Fatura Emitida: ${invoiceData.invoiceNumber} - ${businessData?.name || 'Sabush System'}`;
                const custBody = `
Exmo(a) Senhor(a) ${customerData?.name || 'Cliente'},

Agradecemos a sua preferência. Seguem os detalhes do documento emitido por ${businessData?.name || 'Sabush System'}:

Detalhes do Documento:
- Número: ${invoiceData.invoiceNumber}
- Data de Emissão: ${new Date().toLocaleDateString('pt-MZ')}
- Total Geral (MZN): ${total.toLocaleString('pt-MZ')} MT
- Meio de Pagamento: ${wizardPaymentMethod === 'cash' ? 'Dinheiro' : wizardPaymentMethod === 'card' ? 'Cartão' : wizardPaymentMethod === 'mpesa' ? 'M-Pesa' : 'Crédito (A pagar)'} (${status.toUpperCase()})

Pode visualizar e descarregar o documento digital faturado em PDF no link abaixo:
${uploadedPdfUrl || 'Pendente de processamento'}

Caso subentenda haver alguma discrepância, por favor sinta-se à vontade para nos contactar de imediato.

Melhores Cumprimentos,
A equipa de ${businessData?.name || 'Sabush System'}
                `;
                const { sendEmailNotification } = await import('../lib/emailService');
                await sendEmailNotification(customerEmail, custSubject, custBody);
              }
            } catch (pdfErr) {
              console.error('[Invoices] Failed to generate or upload PDF invoice:', pdfErr);
            }

            await logAction(profile.uid, profile.email, ActionType.CREATE_INVOICE, `Created invoice ${invoiceData.invoiceNumber} for ${customerData?.name || 'Walk-in'}`, profile.businessId);

            // Trigger automatic printing based on wizard preference checkbox
            if (autoPrintReceipt) {
              const invoicePrintData = {
                ...invoiceData,
                date: new Date(),
                customerName: customerData?.name || (invoiceData as any).customerName || 'Cliente Geral',
                customerPhone: customerData?.phone || (invoiceData as any).customerPhone || '',
                customerEmail: customerData?.email || (invoiceData as any).customerEmail || '',
                deliveryAddress: customerData?.address || (invoiceData as any).deliveryAddress || 'Moçambique',
                paymentTerms: businessData?.paymentTerms || '',
                tax: (invoiceData as any).tax || 0
              };
              const businessPrintData = {
                name: businessData?.name || profile?.businessName || 'Sabush System ERP',
                address: businessData?.address || '',
                phone: businessData?.phone || '',
                email: businessData?.email || '',
                taxId: businessData?.taxId || ''
              };
              const printerType = businessData?.printerType || 'standard';
              import('../lib/printService').then(({ printInvoiceHTML }) => {
                printInvoiceHTML(invoicePrintData, businessPrintData, printerType);
              }).catch(err => {
                console.error("Failed to auto-print invoice", err);
              });
            }



            // Automated WhatsApp dispatch based on preference checkbox
            if (sendWhatsApp && customerData?.phone) {
              const whatsappApiKey = businessData?.whatsappConfig?.apiKey || profile?.whatsappConfig?.apiKey || '';
              const whatsappPhone = businessData?.whatsappConfig?.phone || profile?.whatsappConfig?.phone || '';
              const whatsappPhoneNumberId = businessData?.whatsappConfig?.phoneNumberId || profile?.whatsappConfig?.phoneNumberId || '';
              const webhookUrl = businessData?.makeConfig?.webhookUrl || profile?.makeConfig?.webhookUrl || '';

              if (whatsappApiKey && whatsappPhoneNumberId) {
                let isFirstInvoice = true;
                if (newInvoice.customerId && newInvoice.customerId !== 'Walk-in') {
                  try {
                    const { getDocs, query, collection, where, limit } = await import('firebase/firestore');
                    const checkSnap = await getDocs(query(
                      collection(db, `businesses/${profile.businessId}/invoices`),
                      where('customerId', '==', newInvoice.customerId),
                      limit(2)
                    ));
                    // If checkSnap.size <= 1, it means this was the first or sole transaction
                    isFirstInvoice = checkSnap.size <= 1;
                  } catch (checkErr) {
                    console.error("Failed to query first invoice status:", checkErr);
                  }
                }

                const portalUrl = isFirstInvoice && newInvoice.customerId && newInvoice.customerId !== 'Walk-in'
                  ? `${window.location.origin}/portal?bid=${profile.businessId}&cid=${newInvoice.customerId}`
                  : undefined;

                const { sendWhatsAppNotification } = await import('../lib/whatsappService');
                sendWhatsAppNotification({
                  apiKey: whatsappApiKey,
                  phoneNumberId: whatsappPhoneNumberId,
                  businessPhone: whatsappPhone,
                  webhookUrl,
                  recipientPhone: customerData.phone,
                  customerName: customerData.name || 'Cliente Geral',
                  orderNumber: invoiceData.invoiceNumber,
                  totalAmount: total,
                  currency: currency || 'MT',
                  items: invoiceData.items,
                  invoicePdfUrl: uploadedPdfUrl,
                  portalUrl,
                  invoiceTemplate: businessData?.automation?.invoiceTemplate || profile?.automation?.invoiceTemplate
                });
              }
            }
          } catch (bgError) {
            console.error("[Invoices] Error running background invoice post-processes:", bgError);
          }
        })();
      }

      handleCancelInvoiceForm();
    } catch (error: any) {
      toast.dismiss(loadingToastId);
      setIsConfirmWizardOpen(true); // reopen wizard if save failed so they can retry
      console.error("[Invoices] Error saving/rectifying invoice:", error);
      toast.error(`Falha ao guardar fatura: ${error?.message || error || 'Erro desconhecido'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const printInvoice = (invoice: any) => {
    const customer = customers.find(c => c.id === invoice.customerId);
    const invoicePrintData = {
      ...invoice,
      date: invoice.date || (invoice.createdAt?.toDate ? invoice.createdAt.toDate().toISOString() : new Date().toISOString()),
      customerName: customer?.name || invoice.customerName || invoice.customerId || 'Cliente Geral',
      customerPhone: customer?.phone || invoice.customerPhone || '',
      customerEmail: customer?.email || invoice.customerEmail || '',
      deliveryAddress: customer?.address || invoice.deliveryAddress || 'Moçambique',
      paymentTerms: businessData?.paymentTerms || ''
    };
    
    const businessPrintData = {
      name: businessData?.name || profile?.businessName || 'Sabush System ERP',
      address: businessData?.address || '',
      phone: businessData?.phone || '',
      email: businessData?.email || '',
      taxId: businessData?.taxId || ''
    };

    const printerType = businessData?.printerType || 'standard';

    import('../lib/printService').then(({ printInvoiceHTML }) => {
      printInvoiceHTML(invoicePrintData, businessPrintData, printerType);
    }).catch(err => {
      console.error("Failed to load print engine", err);
      toast.error("Failed to launch print module");
    });
  };

  const copyPaymentLink = (invoice: any) => {
    if (!profile?.businessId) return;
    const baseUrl = window.location.origin;
    const link = `${baseUrl}?pay=${profile.businessId}:${invoice.id}`;
    
    navigator.clipboard.writeText(link).then(() => {
      toast.success("Payment link copied to clipboard!");
    }).catch(() => {
      toast.error("Failed to copy link");
    });
  };

  const openPaymentShareModal = (invoice: any) => {
    if (!profile?.businessId) return;
    const customer = customers.find(c => c.id === invoice.customerId);
    const customerName = customer?.name || invoice.customerName || invoice.customerId || 'General Customer';
    
    const baseUrl = window.location.origin;
    const paymentLink = `${baseUrl}?pay=${profile.businessId}:${invoice.id}`;
    
    setShareUrl(paymentLink);
    setSelectedInvoiceForShare(invoice);
    
    const phone = customer?.phone || invoice.customerPhone || '';
    setClientPhone(phone);
    
    // Check if there is a custom invoice template configured
    const userTemplate = businessData?.automation?.invoiceTemplate || profile?.automation?.invoiceTemplate;
    let customMessage = '';
    
    if (userTemplate) {
      const formattedItems = (invoice.items || [])
        .map((item: any) => `- ${item.name || item.description} (x${item.quantity || 1}): ${((item.price || 0) * (item.quantity || 1)).toLocaleString()} ${currency}`)
        .join('\n');
      
      customMessage = userTemplate
        .replace(/{customerName}/g, customerName)
        .replace(/{orderNumber}/g, invoice.invoiceNumber)
        .replace(/{totalAmount}/g, (invoice.total || 0).toLocaleString('pt-MZ', { minimumFractionDigits: 2 }))
        .replace(/{currency}/g, currency)
        .replace(/{items}/g, formattedItems)
        .replace(/{invoiceUrl}/g, paymentLink);
    } else {
      // Warm and friendly pre-composed messaging
      customMessage = `Olá ${customerName}! 👋\n\nSabush System ERP informa que a sua Fatura #${invoice.invoiceNumber} está pronta no valor de ${(invoice.total || 0).toLocaleString()} ${currency}.\n\nPode efetuar o pagamento online comodamente através do link seguro abaixo via M-Pesa ou Cartão:\n🔗 ${paymentLink}\n\nObrigado pela preferência!`;
    }
    
    setWhatsappMessage(customMessage);
    
    setIsShareModalOpen(true);
    setCopied(false);
  };

  const handleCopyLinkFromModal = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      toast.success("Link copiado com sucesso!");
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      toast.error("Erro ao copiar o link.");
    });
  };

  const handleSendWhatsAppDirect = () => {
    if (!clientPhone) {
      toast.error("Por favor, introduza um número de WhatsApp válido.");
      return;
    }
    const cleanPhone = clientPhone.replace(/\D/g, '');
    const url = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(whatsappMessage)}`;
    window.open(url, '_blank');
    toast.success("Redirecionando para o WhatsApp...");
  };

  const handleCancelClick = (invoiceId: string) => {
    const inv = invoices.find(i => i.id === invoiceId);
    if (!inv) return;
    if (inv.status === 'paid') {
      toast.error("Faturas pagas não podem ser canceladas.");
      return;
    }
    setCancellingInvoiceId(invoiceId);
    setCancelReason('Erro de lançamento');
    setCustomCancelReason('');
    setCancelModalOpen(true);
  };

  const handleCancelInvoice = async (invoiceId: string, reason: string) => {
    const inv = invoices.find(i => i.id === invoiceId);
    if (!inv) return;
    if (inv.status === 'paid') {
      toast.error("Não é possível cancelar uma fatura já paga!");
      return;
    }

    executeWithManagerAuthorization(`cancelar a fatura #${inv.invoiceNumber}`, async () => {
      const loadingToastId = toast.loading("A cancelar fatura...");
      try {
        const batch = writeBatch(db);

        // 1. Return all non-reverted product quantities to stock in Inventário
        if (inv.items && Array.isArray(inv.items)) {
          for (const item of inv.items) {
            if (item.reverted) continue;
            const productId = item.productId || item.id;
            if (productId) {
              const qtyToReturn = Number(item.quantity || 1) * Number(item.unitMultiplier || 1);
              const itemQty = Number(item.quantity) || 1;
              const unit = item.selectedUnit || 'un';
              const prodRef = doc(db, `businesses/${profile.businessId}/products`, productId);
              
              let updateFields: any = {
                stockLevel: increment(qtyToReturn)
              };
              if (unit === 'cx') {
                updateFields.stockCx = increment(itemQty);
              } else if (unit === 'emb') {
                updateFields.stockEmb = increment(itemQty);
              } else {
                updateFields.stockUn = increment(itemQty);
              }
              
              batch.update(prodRef, updateFields);
            }
          }
        }

        // 2. Reverse payments and adjust client debt balance
        const paymentsRef = collection(db, `businesses/${profile.businessId}/payments`);
        const paymentSnap = await getDocs(query(paymentsRef, where('invoiceId', '==', invoiceId)));
        for (const payDoc of paymentSnap.docs) {
          batch.delete(doc(db, `businesses/${profile.businessId}/payments`, payDoc.id));
        }

        const unpaidBal = inv.outstandingBalance ?? inv.total ?? 0;
        if (unpaidBal > 0 && inv.customerId && inv.customerId !== 'Walk-in') {
          const custRef = doc(db, `businesses/${profile.businessId}/customers`, inv.customerId);
          batch.update(custRef, {
            outstandingBalance: increment(-unpaidBal)
          });
        }

        // 3. Fatura status changes to CANCELADA ('cancelled') and audit trail is recorded
        const invoiceRef = doc(db, `businesses/${profile.businessId}/invoices`, invoiceId);
        
        const newAuditLog = {
          timestamp: new Date().toISOString(),
          userEmail: profile.email,
          actionType: 'CANCELLED',
          details: `Fatura cancelada. Motivo: ${reason}`
        };
        const updatedAuditTrail = [...(inv.auditTrail || []), newAuditLog];

        batch.update(invoiceRef, {
          status: 'cancelled',
          outstandingBalance: 0,
          cancelReason: reason,
          cancelledAt: serverTimestamp(),
          cancelledBy: profile.email,
          auditTrail: updatedAuditTrail
        });

        await batch.commit();

        // 4. Log in activity_logs
        await logAction(
          profile.uid,
          profile.email,
          ActionType.DELETE_INVOICE,
          `Cancelled invoice #${inv.invoiceNumber}. Reason: ${reason}`,
          profile.businessId
        );

        toast.dismiss(loadingToastId);
        toast.success("Fatura cancelada com sucesso!");

        // Refresh live detail state
        if (previewInvoiceData?.id === invoiceId) {
          setPreviewInvoiceData(prev => ({
            ...prev,
            status: 'cancelled',
            outstandingBalance: 0,
            cancelReason: reason,
            auditTrail: updatedAuditTrail
          }));
        }
      } catch (err: any) {
        toast.dismiss(loadingToastId);
        console.error(err);
        toast.error("Erro ao cancelar fatura: " + err.message);
      }
    });
  };

  const handleBulkCancel = async () => {
    if (selectedIds.length === 0) return;
    const unpaidSelected = selectedIds.filter(id => {
      const inv = invoices.find(i => i.id === id);
      return inv && inv.status !== 'paid' && inv.status !== 'cancelled';
    });
    if (unpaidSelected.length === 0) {
      toast.warning("Nenhuma das faturas selecionadas está elegível para cancelamento (não podem estar pagas ou canceladas).");
      return;
    }

    executeWithManagerAuthorization(`cancelar em lote ${unpaidSelected.length} faturas`, async () => {
      const loadingToastId = toast.loading("A cancelar faturas em lote...");
      try {
        const batch = writeBatch(db);

        for (const id of unpaidSelected) {
          const inv = invoices.find(i => i.id === id);
          if (!inv) continue;

          if (inv.items && Array.isArray(inv.items)) {
            for (const item of inv.items) {
              if (item.reverted) continue;
              const productId = item.productId || item.id;
              if (productId) {
                const qtyToReturn = Number(item.quantity || 1) * Number(item.unitMultiplier || 1);
                const itemQty = Number(item.quantity) || 1;
                const unit = item.selectedUnit || 'un';
                const prodRef = doc(db, `businesses/${profile.businessId}/products`, productId);
                
                let updateFields: any = {
                  stockLevel: increment(qtyToReturn)
                };
                if (unit === 'cx') {
                  updateFields.stockCx = increment(itemQty);
                } else if (unit === 'emb') {
                  updateFields.stockEmb = increment(itemQty);
                } else {
                  updateFields.stockUn = increment(itemQty);
                }
                
                batch.update(prodRef, updateFields);
              }
            }
          }

          const paymentsRef = collection(db, `businesses/${profile.businessId}/payments`);
          const paymentSnap = await getDocs(query(paymentsRef, where('invoiceId', '==', id)));
          for (const payDoc of paymentSnap.docs) {
            batch.delete(doc(db, `businesses/${profile.businessId}/payments`, payDoc.id));
          }

          const unpaidBal = inv.outstandingBalance ?? inv.total ?? 0;
          if (unpaidBal > 0 && inv.customerId && inv.customerId !== 'Walk-in') {
            const custRef = doc(db, `businesses/${profile.businessId}/customers`, inv.customerId);
            batch.update(custRef, {
              outstandingBalance: increment(-unpaidBal)
            });
          }

          const invoiceRef = doc(db, `businesses/${profile.businessId}/invoices`, id);
          const newAuditLog = {
            timestamp: new Date().toISOString(),
            userEmail: profile.email,
            actionType: 'CANCELLED',
            details: `Fatura cancelada em lote`
          };
          const updatedAuditTrail = [...(inv.auditTrail || []), newAuditLog];

          batch.update(invoiceRef, {
            status: 'cancelled',
            outstandingBalance: 0,
            cancelReason: 'Cancelamento em lote',
            cancelledAt: serverTimestamp(),
            cancelledBy: profile.email,
            auditTrail: updatedAuditTrail
          });

          await logAction(
            profile.uid,
            profile.email,
            ActionType.DELETE_INVOICE,
            `Cancelled invoice #${inv.invoiceNumber} via bulk action`,
            profile.businessId
          );
        }

        await batch.commit();
        setSelectedIds([]);
        toast.dismiss(loadingToastId);
        toast.success("Faturas selecionadas canceladas com sucesso!");
      } catch (err: any) {
        toast.dismiss(loadingToastId);
        console.error(err);
        toast.error("Erro ao cancelar faturas: " + err.message);
      }
    });
  };

  const handleRevertItem = async (itemIndex: number) => {
    const inv = previewInvoiceData;
    if (!inv) return;
    if (inv.status === 'paid') {
      toast.error("Facturas pagas não podem ser alteradas ou revertidas.");
      return;
    }
    executeWithManagerAuthorization(`reverter o artigo ${inv.items[itemIndex].name || inv.items[itemIndex].description}`, async () => {
      const loadingToastId = toast.loading("A reverter artigo...");
      try {
        const updatedItems = [...inv.items];
        const targetItem = updatedItems[itemIndex];
        targetItem.reverted = true;

        // Recalculate invoice totals including taxation structure
        const nonReverted = updatedItems.filter(it => !it.reverted);
        const taxRate = inv.taxRate ?? 17;
        const discountRate = inv.discountRate ?? 0;
        const isInclusive = inv.taxInclusive !== false;

        const rawSubtotal = nonReverted.reduce((sum, it) => {
          const itemDisc = it.discount || 0;
          const amt = it.quantity * it.price;
          return sum + (amt - (amt * itemDisc / 100));
        }, 0);

        const subtotalAfterOverallDiscount = rawSubtotal * (1 - discountRate / 100);
        const tax = isInclusive 
          ? subtotalAfterOverallDiscount * (taxRate / (100 + taxRate)) 
          : subtotalAfterOverallDiscount * (taxRate / 100);
        const total = isInclusive 
          ? subtotalAfterOverallDiscount 
          : subtotalAfterOverallDiscount + tax;
        const subtotal = isInclusive 
          ? subtotalAfterOverallDiscount - tax 
          : subtotalAfterOverallDiscount;

        const oldValue = inv.total || 0;
        const valueDiff = oldValue - total;
        let newOutstanding = Math.max(0, (inv.outstandingBalance || 0) - valueDiff);
        
        // Update product stock in Inventário
        const productId = targetItem.productId || targetItem.id;
        if (productId) {
          const qtyToReturn = Number(targetItem.quantity || 1) * Number(targetItem.unitMultiplier || 1);
          const itemQty = Number(targetItem.quantity) || 1;
          const unit = targetItem.selectedUnit || 'un';
          const prodRef = doc(db, `businesses/${profile.businessId}/products`, productId);
          
          let updateFields: any = {
            stockLevel: increment(qtyToReturn)
          };
          if (unit === 'cx') {
            updateFields.stockCx = increment(itemQty);
          } else if (unit === 'emb') {
            updateFields.stockEmb = increment(itemQty);
          } else {
            updateFields.stockUn = increment(itemQty);
          }
          
          await updateDoc(prodRef, updateFields);
        }

        // Add to audit trail
        const newAuditLog = {
          timestamp: new Date().toISOString(),
          userEmail: profile.email,
          actionType: 'ITEM_REVERTED',
          details: `Revertido o item: ${targetItem.name || targetItem.description} x${targetItem.quantity}`
        };
        const updatedAuditTrail = [...(inv.auditTrail || []), newAuditLog];

        // Update database invoice
        const invoiceRef = doc(db, `businesses/${profile.businessId}/invoices`, inv.id);
        await updateDoc(invoiceRef, {
          items: updatedItems,
          subtotal: subtotal,
          tax: tax,
          total: total,
          outstandingBalance: newOutstanding,
          auditTrail: updatedAuditTrail
        });

        // Update customer outstanding debt
        if (valueDiff > 0 && inv.customerId && inv.customerId !== 'Walk-in') {
          const custRef = doc(db, `businesses/${profile.businessId}/customers`, inv.customerId);
          await updateDoc(custRef, {
            outstandingBalance: increment(-valueDiff)
          });
        }

        // Log global activity
        await logAction(
          profile.uid,
          profile.email,
          ActionType.UPDATE_INVOICE,
          `Reverted item: ${targetItem.name || targetItem.description} x${targetItem.quantity} from invoice #${inv.invoiceNumber}`,
          profile.businessId
        );

        // Update active preview state instantly
        setPreviewInvoiceData(prev => ({
          ...prev,
          items: updatedItems,
          subtotal: subtotal,
          tax: tax,
          total: total,
          outstandingBalance: newOutstanding,
          auditTrail: updatedAuditTrail
        }));

        toast.dismiss(loadingToastId);
        toast.success("Artigo revertido e stock devolvido!");
      } catch (err: any) {
        toast.dismiss(loadingToastId);
        console.error(err);
        toast.error("Erro ao reverter artigo: " + err.message);
      }
    });
  };

  const handleAddProductToExistingInvoice = async (product: any) => {
    const inv = previewInvoiceData;
    if (!inv) return;
    if (inv.status === 'paid' || inv.status === 'cancelled') {
      toast.error("Não é possível adicionar artigos a faturas pagas ou canceladas.");
      return;
    }

    const loadingToastId = toast.loading("A adicionar artigo...");
    try {
      const qtyToAdd = 1;
      const itemPrice = product.price || product.onlinePrice || 0;
      const newItem = {
        name: product.name,
        description: product.name,
        quantity: qtyToAdd,
        price: itemPrice,
        productId: product.id,
        discount: 0,
        selectedUnit: 'un'
      };

      const updatedItems = [...(inv.items || [])];
      updatedItems.push(newItem);

      // Recalculate totals including VAT structure
      const nonReverted = updatedItems.filter(it => !it.reverted);
      const taxRate = inv.taxRate ?? 17;
      const discountRate = inv.discountRate ?? 0;
      const isInclusive = inv.taxInclusive !== false;

      const rawSubtotal = nonReverted.reduce((sum, it) => {
        const itemDisc = it.discount || 0;
        const amt = it.quantity * it.price;
        return sum + (amt - (amt * itemDisc / 100));
      }, 0);

      const subtotalAfterOverallDiscount = rawSubtotal * (1 - discountRate / 100);
      const tax = isInclusive 
        ? subtotalAfterOverallDiscount * (taxRate / (100 + taxRate)) 
        : subtotalAfterOverallDiscount * (taxRate / 100);
      const total = isInclusive 
        ? subtotalAfterOverallDiscount 
        : subtotalAfterOverallDiscount + tax;
      const subtotal = isInclusive 
        ? subtotalAfterOverallDiscount - tax 
        : subtotalAfterOverallDiscount;

      const oldValue = inv.total || 0;
      const valueDiff = total - oldValue;
      let newOutstanding = Math.max(0, (inv.outstandingBalance || 0) + valueDiff);

      // Reduce product stock in Inventário
      const prodRef = doc(db, `businesses/${profile.businessId}/products`, product.id);
      const unit = newItem.selectedUnit || 'un';
      const freshProdSnap = await getDoc(prodRef);
      const freshProdData = freshProdSnap.exists() ? freshProdSnap.data() : product;
      const { stockCx, stockEmb, stockUn } = cascadeStockDeduction(freshProdData, unit, qtyToAdd);
      let updateFields: any = {
        stockLevel: increment(-qtyToAdd),
        stockCx,
        stockEmb,
        stockUn
      };
      await updateDoc(prodRef, updateFields);

      // Update customer outstanding balance
      if (valueDiff > 0 && inv.customerId && inv.customerId !== 'Walk-in') {
        const custRef = doc(db, `businesses/${profile.businessId}/customers`, inv.customerId);
        await updateDoc(custRef, {
          outstandingBalance: increment(valueDiff)
        });
      }

      // Add to audit trail
      const newAuditLog = {
        timestamp: new Date().toISOString(),
        userEmail: profile.email,
        actionType: 'ITEM_ADDED',
        details: `Adicionado o item: ${product.name} x${qtyToAdd}`
      };
      const updatedAuditTrail = [...(inv.auditTrail || []), newAuditLog];

      // Update invoice document
      const invoiceRef = doc(db, `businesses/${profile.businessId}/invoices`, inv.id);
      await updateDoc(invoiceRef, {
        items: updatedItems,
        subtotal: subtotal,
        tax: tax,
        total: total,
        outstandingBalance: newOutstanding,
        auditTrail: updatedAuditTrail
      });

      // Log action
      await logAction(
        profile.uid,
        profile.email,
        ActionType.UPDATE_INVOICE,
        `Added item: ${product.name} x${qtyToAdd} to invoice #${inv.invoiceNumber}`,
        profile.businessId
      );

      // Refresh live preview state
      setPreviewInvoiceData(prev => ({
        ...prev,
        items: updatedItems,
        subtotal: subtotal,
        tax: tax,
        total: total,
        outstandingBalance: newOutstanding,
        auditTrail: updatedAuditTrail
      }));

      toast.dismiss(loadingToastId);
      toast.success("Artigo adicionado com sucesso!");
    } catch (err: any) {
      toast.dismiss(loadingToastId);
      console.error(err);
      toast.error("Erro ao adicionar artigo: " + err.message);
    }
  };

  const downloadPDF = (invoice: any) => {
    const businessName = businessData?.name || profile?.businessName || 'Sabush System ERP';
    const businessAddress = businessData?.address || '';
    
    // Auto-resolve customer full record if nested
    const customer = customers.find(c => c.id === invoice.customerId);
    const invoiceData = {
      ...invoice,
      customerName: customer?.name || invoice.customerName || invoice.customerId || 'Cliente Geral',
      customerPhone: customer?.phone || invoice.customerPhone || '',
      customerEmail: customer?.email || invoice.customerEmail || '',
      deliveryAddress: customer?.address || invoice.deliveryAddress || 'Moçambique'
    };

    generateInvoicePDF(invoiceData, {
      name: businessName,
      address: businessAddress,
      phone: businessData?.phone || profile?.phone || '',
      email: businessData?.email || profile?.email || '',
      nuit: businessData?.taxId || ''
    });
  };

  const getTruncatedOperator = (inv: any) => {
    const email = inv.createdByEmail || '';
    if (email) {
      return email.split('@')[0];
    }
    const name = inv.createdByName || 'Admin/Manager';
    return name.split('@')[0].split(' ')[0];
  };

  const renderViewStatusBadge = (status: string) => {
    const normalized = (status || '').toLowerCase();
    let text = 'PENDENTE';
    let badgeClass = 'bg-amber-50 text-amber-700 border-amber-200/30 bg-warning/10 text-warning';
    
    if (normalized === 'draft' || normalized === 'rascunho') {
      text = 'RASCUNHO';
      badgeClass = 'bg-slate-100 text-slate-600 border-slate-200/50';
    } else if (normalized === 'overdue' || normalized === 'em atraso') {
      text = 'EM ATRASO';
      badgeClass = 'bg-rose-50 text-rose-700 border-rose-200/30 bg-danger/10 text-danger';
    } else if (normalized === 'partial' || normalized === 'parcial' || normalized === 'parcialmente pago') {
      text = 'PARCIAL';
      badgeClass = 'bg-blue-100 text-blue-700 border-blue-200/50';
    } else if (normalized === 'paid' || normalized === 'pago') {
      text = 'PAGO';
      badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200/30 bg-success/10 text-success';
    } else if (normalized === 'cancelled' || normalized === 'cancelada') {
      text = 'CANCELADA';
      badgeClass = 'bg-rose-50 text-rose-700 border-rose-200/30 bg-danger/10 text-danger';
    }

    return (
      <span className={cn("px-2.5 py-0.5 rounded-[20px] text-[10px] font-black uppercase tracking-widest inline-flex items-center justify-center border", badgeClass)}>
        {text}
      </span>
    );
  };

  const renderChannelTag = (saleType: string) => {
    const isWholesale = saleType === 'wholesale';
    return (
      <span className="text-[9px] font-bold text-slate-500 bg-slate-50 border border-slate-200/60 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
        {isWholesale ? '📦 Grosso' : '🛍️ Retalho'}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="text-blue-600" size={24} />
            {t('invoices')}
          </h2>
          <p className="text-sm text-slate-500 font-medium font-sans">Crie, imprima e faça a gestão simplificada das faturas e recibos emitidos.</p>
        </div>

        {/* Cohesive Sub-tabs for Invoices module */}
        <div className="bg-slate-100 p-1.5 rounded-2xl flex max-w-sm gap-1.5 shrink-0 font-sans self-start shadow-inner border border-slate-200">
          <button
            type="button"
            onClick={() => {
              setActiveTab('list');
              setIsCreating(false);
              setEditingInvoiceId(null);
            }}
            className={cn(
              "flex-1 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 cursor-pointer flex items-center justify-center gap-1.5",
              activeTab === 'list' && !isCreating 
                ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20 font-black scale-102" 
                : "text-slate-500 hover:text-slate-850"
            )}
          >
            📋 Lista
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('add');
              setIsCreating(true);
              setEditingInvoiceId(null);
              setNewInvoice({
                customerId: '',
                items: [{ description: '', quantity: 1, price: 0 }] as any[],
                status: 'paid',
                paymentType: 'cash',
                dueDate: '',
                saleType: 'retail',
                taxRate: 0,
                taxInclusive: true,
                discountRate: 0,
                notes: ''
              });
            }}
            className={cn(
              "flex-1 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 cursor-pointer flex items-center justify-center gap-1.5",
              activeTab === 'add' || isCreating 
                ? "bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/20 font-black scale-102" 
                : "text-slate-500 hover:text-slate-850"
            )}
          >
            ➕ Criar
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('manage');
              setIsCreating(false);
            }}
            className={cn(
              "flex-1 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 cursor-pointer flex items-center justify-center gap-1.5",
              activeTab === 'manage' 
                ? "bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-md shadow-amber-500/20 font-black scale-102" 
                : "text-slate-500 hover:text-slate-853"
            )}
          >
            🛠️ Gerir
          </button>
        </div>
      </div>

      {(activeTab === 'add' || isCreating) && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xl space-y-6 animate-in slide-in-from-top-4 duration-300">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold text-slate-900">{editingInvoiceId ? "Retificar Fatura / Recibo" : t('create_invoice')}</h3>
            <button 
              onClick={suggestItemsWithAI}
              disabled={aiLoading}
              className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium px-3 py-1 rounded-lg hover:bg-blue-50 transition-colors"
            >
              {aiLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              AI Suggest
            </button>
          </div>
          
          <div className="flex flex-wrap gap-6 items-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Canal de Pagamento</label>
              <div className="flex bg-[#e2e8f0] p-1 rounded-xl w-fit">
                <button 
                  type="button"
                  onClick={() => setNewInvoice({...newInvoice, paymentType: 'cash'})}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all",
                    newInvoice.paymentType === 'cash' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-705"
                  )}
                >
                  {t('cash')}
                </button>
                <button 
                  type="button"
                  onClick={() => {
                    const isWalkIn = !newInvoice.customerId || newInvoice.customerId === 'Walk-in';
                    if (isWalkIn) {
                      toast.error("Vendas a crédito não são permitidas para clientes finais / Walk-in.");
                      return;
                    }
                    setNewInvoice({...newInvoice, paymentType: 'credit'});
                  }}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all",
                    (!newInvoice.customerId || newInvoice.customerId === 'Walk-in') ? "opacity-40 cursor-not-allowed text-slate-400" : (newInvoice.paymentType === 'credit' ? "bg-blue-600 text-white shadow-sm" : "text-slate-505 hover:text-slate-705")
                  )}
                  title={(!newInvoice.customerId || newInvoice.customerId === 'Walk-in') ? "Sem acesso a crédito para Walk-in" : ""}
                >
                  {t('credit')}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Segmento de Venda</label>
              <div className="flex bg-[#e2e8f0] p-1 rounded-xl w-fit">
                <button 
                  type="button"
                  onClick={() => setNewInvoice({...newInvoice, saleType: 'retail'})}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5",
                    (newInvoice.saleType || 'retail') === 'retail' ? "bg-white text-blue-700 shadow-sm border border-slate-100" : "text-slate-505 hover:text-slate-705"
                  )}
                >
                  🛍️ Retalho (Detail)
                </button>
                <button 
                  type="button"
                  onClick={() => setNewInvoice({...newInvoice, saleType: 'wholesale'})}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5",
                    newInvoice.saleType === 'wholesale' ? "bg-emerald-600 text-white shadow-sm" : "text-slate-505 hover:text-slate-705"
                  )}
                >
                  📦 Grosso (Wholesale)
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="relative">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-slate-700">{t('customers')}</label>
                <button
                  type="button"
                  onClick={() => setQuickCustomerModalOpen(true)}
                  className="text-[10.5px] font-black text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 uppercase tracking-widest flex items-center gap-1 cursor-pointer transition-all px-2.5 py-1 rounded-xl"
                >
                  <UserPlus size={11} />
                  + Novo Cliente
                </button>
              </div>
              <div className="relative">
                <input 
                  type="text"
                  className="w-full p-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium text-sm"
                  placeholder="Pesquisar cliente por nome..."
                  value={customerSearch}
                  onFocus={() => setShowCustomerDropdown(true)}
                  onChange={e => {
                    setCustomerSearch(e.target.value);
                    setShowCustomerDropdown(true);
                  }}
                />
                {showCustomerDropdown && (
                  <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-250 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                    <div 
                      className="p-2.5 hover:bg-slate-50 cursor-pointer font-bold text-xs text-blue-600 border-b"
                      onClick={() => {
                        setNewInvoice({...newInvoice, customerId: 'Walk-in'});
                        setCustomerSearch('Walk-in Customer');
                        setShowCustomerDropdown(false);
                      }}
                    >
                      Walk-in Customer (Geral)
                    </div>
                    {customers
                      .filter(c => c.name?.toLowerCase().includes(customerSearch.toLowerCase()))
                      .map(c => (
                        <div 
                          key={c.id} 
                          className="p-2.5 hover:bg-slate-50 cursor-pointer text-xs font-semibold text-slate-700 active:bg-blue-50"
                          onClick={() => {
                            setNewInvoice({...newInvoice, customerId: c.id});
                            setCustomerSearch(c.name);
                            setShowCustomerDropdown(false);
                          }}
                        >
                          {c.name} {c.phone ? `(${c.phone})` : ''}
                        </div>
                      ))}
                    {customers.filter(c => c.name?.toLowerCase().includes(customerSearch.toLowerCase())).length === 0 && (
                      <div className="p-3 text-center text-xs text-slate-400">Nenhum cliente encontrado</div>
                    )}
                  </div>
                )}
              </div>
             </div>
             <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-150 flex flex-col justify-center">
               <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Agendamento & Prazos (Automático)</span>
               <p className="text-xs font-bold text-slate-800 mt-1 flex items-center gap-1.5">
                 <span>📅 Data de Emissão: Hoje ({formatDateInTimezone(new Date(), businessData?.timezone || profile?.timezone || 'Africa/Maputo')})</span>
               </p>
               <p className="text-[10px] text-slate-500 italic font-medium mt-0.5">
                 Prazos: {newInvoice.paymentType === 'cash' ? 'Pronto Pagamento (Hoje)' : `Crédito - Vence em 15 dias (${formatDateInTimezone(new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), businessData?.timezone || profile?.timezone || 'Africa/Maputo')})`}
               </p>
             </div>
           </div>

           {(() => {
             if (!newInvoice.customerId || newInvoice.customerId === 'Walk-in') return null;
             const selectedCustomerObj = customers.find(c => c.id === newInvoice.customerId);
             if (!selectedCustomerObj) return null;
             return (
               <div className="bg-slate-50/55 p-4 rounded-3xl border border-slate-100 flex flex-col lg:flex-row gap-4 justify-between animate-in slide-in-from-top-1.5 duration-250 mb-4 text-left">
                 <div className="flex-1 space-y-2 font-sans">
                   <div className="flex items-center gap-2">
                     <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                     <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Ficha e Histórico do Cliente</p>
                   </div>
                   <div className="grid grid-cols-2 gap-3 text-xs">
                     <div className="bg-white p-3 rounded-2xl border border-slate-100 flex flex-col justify-center shadow-sm">
                       <span className="text-[9px] uppercase font-black tracking-wider text-slate-400">Total Compras</span>
                       <span className="text-xs font-black text-blue-600 mt-1">{Number(selectedCustomerObj.totalSpent || 0).toLocaleString()} MT</span>
                     </div>
                     <div className="bg-white p-3 rounded-2xl border border-slate-100 flex flex-col justify-center shadow-sm">
                       <span className="text-[9px] uppercase font-black tracking-wider text-slate-400">Saldo/Dívida</span>
                       <span className={`text-xs font-black mt-1 ${selectedCustomerObj.outstandingBalance > 0 ? "text-rose-600 font-extrabold" : "text-slate-700"}`}>
                         {Number(selectedCustomerObj.outstandingBalance || 0).toLocaleString()} MT
                       </span>
                     </div>
                   </div>
                   {selectedCustomerObj.phone && (
                     <p className="text-[10px] text-slate-500 font-bold">
                       📞 Contacto: {selectedCustomerObj.phone} {selectedCustomerObj.email ? `| ✉️ ${selectedCustomerObj.email}` : ''}
                     </p>
                   )}
                 </div>

                 <div className="flex-1 flex flex-col justify-between p-3.5 bg-white rounded-2xl border border-slate-100 min-h-24 shadow-sm text-left">
                   <div className="flex justify-between items-center mb-1">
                     <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Notas Pessoais & Preferências</span>
                   </div>
                   <div className="flex gap-2">
                     <textarea
                       rows={2}
                       className="flex-1 p-2 bg-slate-50 border border-slate-150 rounded-xl text-xs font-bold text-slate-700 placeholder-slate-350 outline-none resize-none focus:ring-2 focus:ring-blue-400 focus:bg-white"
                       placeholder="Adicionar notas pessoais, preferências, descontos especiais..."
                       value={invCustomerNotes}
                       onChange={e => setInvCustomerNotes(e.target.value)}
                     />
                     <button
                       type="button"
                       disabled={invSavingNotes || invCustomerNotes === (selectedCustomerObj.notes || '')}
                       onClick={handleSaveInvoiceCustomerNotes}
                       className="px-3.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[10px] uppercase tracking-wider rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0 flex items-center justify-center cursor-pointer border-none"
                     >
                       {invSavingNotes ? '...' : 'Salvar'}
                     </button>
                   </div>
                 </div>
               </div>
             );
           })()}
 
           {/* Search to Auto-Add Items */}
           <div className="space-y-2 border-t pt-4">
             <label className="block text-sm font-medium text-slate-700 mb-1">🔍 Pesquisar Artigos / Adicionar por Clique</label>
             <div className="relative">
               <input 
                 type="text"
                 className="w-full p-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium text-sm"
                 placeholder="Introduza o nome do artigo para pesquisar e adicionar..."
                 value={productSearch}
                 onFocus={() => setShowProductDropdown(true)}
                 onChange={e => {
                   setProductSearch(e.target.value);
                   setShowProductDropdown(true);
                 }}
               />
               {showProductDropdown && (
                 <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-52 overflow-y-auto">
                   {filteredInvoiceProducts
                     .map(p => (
                       <div 
                         key={p.id}
                         className={cn(
                           "p-3 hover:bg-slate-50 cursor-pointer text-xs font-semibold flex items-center justify-between border-b last:border-none",
                           p.stockLevel <= 0 && "bg-rose-50/20"
                         )}
                         onClick={() => {
                           const itemPrice = p.price || p.onlinePrice || 0;
                           const newItem = { description: p.name, quantity: 1, price: itemPrice, productId: p.id, selectedUnit: 'un', unitLabel: p.baseUnitLabel || 'un', unitMultiplier: 1 };

                            const isDuplicate = newInvoice.items.some((item: any) => item.productId === p.id);
                            if (isDuplicate) {
                              toast.warning(`O artigo "${p.name}" já foi selecionado nesta fatura. Ajuste a quantidade directamente na tabela.`);
                              setProductSearch('');
                              setShowProductDropdown(false);
                              return;
                            }
                            
 
                           setNewInvoice(prev => {
                             const items = [...prev.items];
                             if (items.length === 1 && items[0].description === '' && items[0].price === 0) {
                               return { ...prev, items: [newItem] };
                             } else {
                               return { ...prev, items: [...items, newItem] };
                             }
                           });
                           
                           setProductSearch('');
                           setShowProductDropdown(false);
                           toast.success(`Adicionado: ${p.name}`);
                         }}
                       >
                         <div>
                           <p className="text-slate-900 font-bold flex items-center gap-1.5">
                             <span>{p.name}</span>
                             {p.stockLevel <= 0 && (
                               <span className="px-1.5 py-0.5 bg-rose-100 text-rose-700 text-[8px] font-black uppercase tracking-wider rounded">Sem Stock</span>
                             )}
                           </p>
                           <p className="text-[10px] text-slate-400">Stock atual: {p.stockLevel || 0} unid.</p>
                         </div>
                         <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                           <span className="font-extrabold text-blue-600 mr-2">{Number(p.price || p.onlinePrice || 0).toLocaleString()} MT</span>
                           
                           {/* Add to Stock Button (Replenish target) */}
                           <button
                             type="button"
                             onClick={() => {
                               setAddStockForm({
                                 name: p.name,
                                 price: p.price || 0,
                                 costPrice: p.costPrice || 0,
                                 stockLevel: 10,
                                 category: p.category || 'Geral',
                                 existingProductId: p.id
                               });
                               setShowAddStockModal(true);
                             }}
                             className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-amber-950 font-black text-[9px] uppercase tracking-wider rounded-lg flex items-center gap-1 cursor-pointer transition-transform active:scale-95"
                           >
                             ➕ Repor Stock
                           </button>
                         </div>
                       </div>
                     ))}
                   {filteredInvoiceProducts.length === 0 && (
                     <div className="p-4 text-center space-y-3">
                       <p className="text-xs font-bold text-slate-500">Nenhum artigo registado com este nome "{productSearch}".</p>
                       <button
                         type="button"
                         onClick={() => {
                           setAddStockForm({
                             name: productSearch,
                             price: 0,
                             costPrice: 0,
                             stockLevel: 10,
                             category: 'Geral',
                             existingProductId: ''
                           });
                           setShowAddStockModal(true);
                         }}
                         className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl cursor-pointer active:scale-95 shadow-sm inline-flex items-center gap-1.5"
                       >
                         ⚡ Adicionar ao Stock & Selecionar
                       </button>
                     </div>
                   )}
                   {productSearch && filteredInvoiceProducts.length > 0 && (
                     <div className="p-2.5 bg-slate-50 border-t text-center">
                       <button
                         type="button"
                         onClick={() => {
                           setAddStockForm({
                             name: productSearch,
                             price: 0,
                             costPrice: 0,
                             stockLevel: 10,
                             category: 'Geral',
                             existingProductId: ''
                           });
                           setShowAddStockModal(true);
                         }}
                         className="text-[10px] font-black uppercase text-blue-600 hover:text-blue-800 tracking-wider flex items-center justify-center gap-1.5 mx-auto cursor-pointer"
                       >
                         <span>➕ Registar Como Novo Artigo no Stock</span>
                       </button>
                     </div>
                   )}
                 </div>
               )}
             </div>
           </div>
 
           <div className="space-y-2">
             <div className="flex justify-between items-center">
               <p className="text-sm font-bold text-slate-700">Artigos Adicionados à Fatura</p>
               <span className="text-[10px] text-slate-400 italic">Adicione artigos clicando na pesquisa acima</span>
             </div>
             {newInvoice.items.length === 0 ? (
               <div className="p-6 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50">
                 <p className="text-xs font-semibold text-slate-400">Nenhum artigo adicionado ainda.</p>
                 <p className="text-[11px] text-slate-400 mt-1">Utilize a barra de pesquisa acima para selecionar os artigos da fatura por clique.</p>
               </div>
             ) : (
               <div className="space-y-2.5">
                 {newInvoice.items.map((item: any, idx) => (
                   <div key={idx} className="flex gap-2 items-center bg-white p-2 border border-slate-150 rounded-xl shadow-sm">
                     <input 
                       className="flex-1 p-2 border rounded-xl text-sm bg-slate-50 text-slate-700 font-medium" 
                       placeholder="Nome/Descrição do item" 
                       value={item.description}
                       readOnly
                       title="Adicionado via Pesquisa (Somente Leitura)"
                      />
                      {item.productId && (() => {
                        const p = products.find(prod => prod.id === item.productId);
                        if (!p || !p.hasMultiUnits) return null;
                        return (
                          <select
                            value={item.selectedUnit || 'un'}
                            className="p-2 border rounded-xl text-xs font-bold text-slate-800 bg-white"
                            onChange={e => {
                              const unitVal = e.target.value;
                              const items = [...newInvoice.items];
                              items[idx].selectedUnit = unitVal;
                              
                              if (unitVal === 'un') {
                                items[idx].unitLabel = p.baseUnitLabel || 'un';
                                items[idx].unitMultiplier = 1;
                                items[idx].price = p.price || 0;
                              } else if (unitVal === 'cx') {
                                items[idx].unitLabel = p.boxUnitLabel || 'cx';
                                items[idx].unitMultiplier = p.boxUnitQty || 10;
                                items[idx].price = p.boxUnitPrice || (Number(p.price || 0) * (p.boxUnitQty || 10));
                              } else if (unitVal === 'emb') {
                                items[idx].unitLabel = p.packUnitLabel || 'emb';
                                items[idx].unitMultiplier = p.packUnitQty || 100;
                                items[idx].price = p.packUnitPrice || (Number(p.price || 0) * (p.packUnitQty || 100));
                              }
                              setNewInvoice({ ...newInvoice, items });
                            }}
                          >
                            <option value="un">{p.baseUnitLabel || 'un'}</option>
                            {p.hasBoxUnit && (
                              <option value="cx">{p.boxUnitLabel || 'cx'}</option>
                            )}
                            {p.hasPackUnit && (
                              <option value="emb">{p.packUnitLabel || 'emb'}</option>
                            )}
                          </select>
                        );
                      })()}
                      <span className="hidden" style={{display:'none'}}
                     />
                     <input 
                       type="number" 
                       className="w-20 p-2 border rounded-xl text-sm text-center font-bold text-slate-800" 
                       placeholder="Qtd" 
                       value={item.quantity}
                       onChange={e => {
                         const qtyVal = Math.max(1, Number(e.target.value));
                         const items = [...newInvoice.items];
                         items[idx].quantity = qtyVal;
 
                         // Automatically fetch tiered prices if item links to a stock product!
                         if (item.productId) {
                           const foundProduct = products.find(p => p.id === item.productId);
                           if (foundProduct) {
                              let autoPrice = foundProduct.price || 0;
                              const tiers = foundProduct.tieredPrices || [];
                              // filter tiers where current quantity is greater/equal to threshold, select highest minQty
                              const activeTiers = [...tiers].filter((t: any) => qtyVal >= t.minQty);
                              if (activeTiers.length > 0) {
                                activeTiers.sort((a: any, b: any) => b.minQty - a.minQty);
                                autoPrice = activeTiers[0].price;
                                toast.info(`Ecrã de Preços: Escalão de Quantidade aplicado! Preço: ${autoPrice} ${currency}`);
                              }
                              items[idx].price = autoPrice;
                           }
                         }
 
                         setNewInvoice({...newInvoice, items});
                       }}
                     />
                     <div className="relative">
                       <input 
                         type="number" 
                         className="w-32 p-2 border rounded-xl text-sm pr-6 font-bold text-blue-600" 
                         placeholder="Preço" 
                         value={item.price}
                         onChange={e => {
                           const items = [...newInvoice.items];
                           items[idx].price = Number(e.target.value);
                           setNewInvoice({...newInvoice, items});
                         }}
                       />
                       <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400">MT</span>
                      </div>

                      {/* Item-level discount (%) */}
                      <div className="relative">
                        <input 
                          type="number" 
                          min="0"
                          max="100"
                          className="w-24 p-2 border border-amber-200 rounded-xl text-sm pr-6 font-bold text-amber-600 bg-amber-50/10 focus:bg-white focus:ring-amber-500 font-mono" 
                          placeholder="Desc (%)" 
                          value={item.discount || 0}
                          onChange={e => {
                            const val = Math.max(0, Math.min(100, Number(e.target.value)));
                            const items = [...newInvoice.items];
                            items[idx].discount = isNaN(val) ? 0 : val;
                            setNewInvoice({...newInvoice, items});
                          }}
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-black text-amber-450 font-bold">%</span>
                      </div>
                      <div className="relative hidden">
                     </div>
                     <button 
                       onClick={() => {
                         setNewInvoice(prev => ({
                           ...prev,
                           items: prev.items.filter((_, i) => i !== idx)
                         }));
                       }}
                       className="p-2 hover:bg-rose-50 rounded-xl text-rose-500 transition-colors cursor-pointer"
                     >
                       <Trash2 size={16} />
                     </button>
                   </div>
                 ))}
               </div>
             )}
           </div>
 
           <div className="flex justify-end gap-3 pt-4">
            <button 
              onClick={handleCancelInvoiceForm}
              className="px-4 py-2 text-slate-600 font-medium rounded-xl hover:bg-slate-100"
            >
              Cancel
            </button>
            <button 
              type="button"
              onClick={() => {
                const subtotal = (() => { const itemDiscountSubtotal = newInvoice.items.reduce((sum, item) => sum + ((item.quantity * item.price) * (1 - (item.discount || 0) / 100)), 0); return itemDiscountSubtotal * (1 - (newInvoice.discountRate || 0) / 100); })();
                const taxRate = newInvoice.taxRate ?? 0;
                const tax = subtotal * (taxRate / 100);
                const total = subtotal + tax;
                const selectedCustObj = customers.find(c => c.id === newInvoice.customerId);
                
                const draftInvoice = {
                  invoiceNumber: `INV-DRAFT`, discountRate: newInvoice.discountRate || 0,
                  date: new Date().toISOString(),
                  dueDate: newInvoice.dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                  customerId: newInvoice.customerId || 'Walk-in',
                  customerName: selectedCustObj?.name || (newInvoice.customerId === 'Walk-in' || !newInvoice.customerId ? 'Walk-in Customer (Geral)' : 'Cliente Geral'),
                  customerPhone: selectedCustObj?.phone || '',
                  customerEmail: selectedCustObj?.email || '',
                  deliveryAddress: selectedCustObj?.address || 'Moçambique',
                  items: newInvoice.items.map(it => ({
                    name: it.description || 'Artigo sem descrição', discount: it.discount || 0,
                    quantity: it.quantity || 1,
                    price: it.price || 0
                  })),
                  subtotal,
                  tax,
                  total,
                  status: newInvoice.paymentType === 'cash' ? 'paid' : 'unpaid',
                  isDraft: true
                };
                setPreviewInvoiceData(draftInvoice);
                setIsPreviewOpen(true);
              }}
              className="px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 font-bold rounded-xl transition-all flex items-center gap-2 text-sm"
              title="Preview simulated invoice template"
            >
              <Eye size={16} className="text-slate-500" />
              <span>Visualizar Modelo PDF</span>
            </button>
            <button 
              onClick={handleAttemptSaveInvoice}
              className="px-6 py-2 bg-[#0f172a] text-white font-black hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/10 rounded-xl"
            >
              {editingInvoiceId ? "Guardar Retificação / Alterações" : "Save Invoice"}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'list' && !isCreating && (
        <div className="flex flex-col lg:flex-row gap-4 justify-between items-stretch lg:items-center bg-white p-5 rounded-[28px] border border-slate-100 shadow-sm animate-in fade-in-50 duration-200">
          <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center flex-1">
            <div className="w-full lg:w-80 relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Search size={16} />
              </span>
              <input
                type="text"
                placeholder="Faturas, clientes ou operadores..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-semibold text-slate-800 transition-all placeholder:text-slate-400"
              />
            </div>
            
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full md:w-auto flex-wrap">
              {shouldRestrict ? (
                <span className="px-4 py-2 bg-slate-900/10 text-slate-800 text-[10px] font-black uppercase tracking-widest rounded-full self-start">
                  🔐 Apenas as minhas vendas
                </span>
              ) : (
                <div className="flex items-center gap-2 bg-slate-50/50 p-1.5 rounded-xl border border-slate-100 flex-1 sm:flex-none">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 shrink-0 pl-1.5">Operador:</span>
                  <select
                    value={operatorFilter}
                    onChange={(e) => setOperatorFilter(e.target.value)}
                    className="w-full sm:w-44 p-2 bg-white border border-slate-200/80 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-[10px] font-black uppercase tracking-wider cursor-pointer text-slate-700 shadow-sm"
                  >
                    <option value="all">Todos os Colaboradores</option>
                    {uniqueOperators.map(op => (
                      <option key={op} value={op}>{op}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center gap-2 bg-slate-50/50 p-1.5 rounded-xl border border-slate-100 flex-1 sm:flex-none">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 shrink-0 pl-1.5">Fluxo:</span>
                <select
                  value={saleTypeFilter}
                  onChange={(e) => setSaleTypeFilter(e.target.value as any)}
                  className="w-full sm:w-44 p-2 bg-white border border-slate-200/80 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-[10px] font-black uppercase tracking-wider cursor-pointer text-slate-700 shadow-sm"
                >
                  <option value="all">🌐 Todos os Canais</option>
                  <option value="retail">🛍️ Retalho (Detail)</option>
                  <option value="wholesale">📦 Grosso (Wholesale)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Right side: View toggles */}
          <div className="flex items-center gap-1.5 self-end lg:self-auto bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => {
                setInvoiceViewMode('card');
                localStorage.setItem('invoice_view_mode', 'card');
              }}
              className={cn(
                "p-2 rounded-lg transition-all cursor-pointer flex items-center justify-center",
                invoiceViewMode === 'card'
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-400 hover:text-slate-600"
              )}
              title="Visualização em Cartão"
            >
              <LayoutGrid size={18} />
            </button>
            <button
              type="button"
              onClick={() => {
                setInvoiceViewMode('list');
                localStorage.setItem('invoice_view_mode', 'list');
              }}
              className={cn(
                "p-2 rounded-lg transition-all cursor-pointer flex items-center justify-center",
                invoiceViewMode === 'list'
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-400 hover:text-slate-650"
              )}
              title="Visualização em Lista Compacta"
            >
              <List size={18} />
            </button>
          </div>
        </div>
      )}

      {activeTab === 'list' && !isCreating && (
        <div className="bg-slate-50/50 rounded-2xl border border-slate-100 p-4 flex flex-wrap items-center justify-between gap-4 font-sans text-xs text-slate-500 shadow-sm animate-in fade-in-50 duration-200">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Resumo Filtrado:</span>
            <div className="flex items-center gap-2 bg-emerald-50/60 border border-emerald-100/50 px-3 py-1.5 rounded-xl">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-semibold text-slate-500">Total Pago:</span>
              <span className="font-extrabold text-emerald-700 font-mono">{formatCurrencyValue(filteredMetrics.paid, currency)}</span>
            </div>
            <div className="flex items-center gap-2 bg-amber-50/60 border border-amber-100/50 px-3 py-1.5 rounded-xl">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              <span className="font-semibold text-slate-500">Total Pendente:</span>
              <span className="font-extrabold text-amber-700 font-mono">{formatCurrencyValue(filteredMetrics.pending, currency)}</span>
            </div>
          </div>
          <div className="text-[11px] text-slate-400 font-bold uppercase">
            <span className="font-black text-slate-700">{filteredInvoicesList.length}</span> faturas encontradas
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-[32px] border border-slate-100 overflow-hidden shadow-sm shadow-slate-200/50">
          
          {filteredInvoicesList.length === 0 && (
            <div className="p-20 text-center flex flex-col items-center gap-4">
              <div className="w-20 h-20 bg-slate-50 rounded-[32px] flex items-center justify-center text-slate-200">
                <FileText size={40} />
              </div>
              <div>
                <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mb-1">Sem faturas</p>
                <p className="text-sm font-bold text-slate-900">Nenhuma fatura encontrada com os filtros selecionados.</p>
              </div>
            </div>
          )}

          {filteredInvoicesList.length > 0 && (
            <>
              {invoiceViewMode === 'card' ? (
                /* VIEW 1 — CARD VIEW (grid layout) */
                <div className="p-6 bg-slate-50/20">
                  <div className="grid gap-6 grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
                    {paginatedInvoicesList.map((inv) => (
                      <div 
                        key={inv.id} 
                        className="bg-white border-[0.5px] border-slate-200 rounded-[12px] p-5 flex flex-col justify-between gap-4 font-sans hover:border-slate-300 transition-colors"
                      >
                        {/* Top section: invoice number and customer name on left, status on right */}
                        <div className="flex justify-between items-start gap-3">
                          <div className="flex flex-col min-w-0">
                            <span className="text-[11px] text-slate-400 font-mono font-bold">#{inv.invoiceNumber}</span>
                            <span className="text-[15px] font-medium text-slate-800 line-clamp-1">
                              {customers.find(c => c.id === inv.customerId)?.name || inv.customerId || 'Walk-in'}
                            </span>
                          </div>
                          <div className="shrink-0">
                            {renderViewStatusBadge(inv.status)}
                          </div>
                        </div>

                        {/* Divider line */}
                        <div className="border-t-[0.5px] border-slate-100" />

                        {/* Bottom section: operator on left, date and amount on right */}
                        <div className="flex justify-between items-end gap-3">
                          <div className="flex flex-col min-w-0">
                            <span className="text-[9px] text-slate-400/80 uppercase font-black tracking-widest mb-0.5">Operador</span>
                            <span className="text-xs text-slate-500 font-medium truncate" title={inv.createdByName || 'Admin/Manager'}>
                              {inv.createdByName || 'Admin/Manager'}
                            </span>
                          </div>
                          <div className="flex flex-col items-end text-right shrink-0">
                            <span className="text-[11px] text-slate-400 font-medium mb-0.5">
                              {inv.createdAt?.seconds ? formatDateInTimezone(inv.createdAt, businessData?.timezone || profile?.timezone || 'Africa/Maputo') : 'Just now'}
                            </span>
                            <span className="text-base font-medium text-slate-900 font-mono">
                              {formatCurrencyValue(inv.total || 0, inv.currency || currency || 'MZN')}
                            </span>
                          </div>
                        </div>

                        {/* Divider line before footer */}
                        <div className="border-t-[0.5px] border-slate-100/60" />

                        {/* Footer row: channel tag pill on left, action icons on right */}
                        <div className="flex justify-between items-center pt-1">
                          <div>
                            {renderChannelTag(inv.saleType)}
                          </div>
                          <div className="flex items-center gap-3.5 text-slate-400">
                            <button 
                              onClick={() => openPaymentShareModal(inv)}
                              className="hover:text-indigo-600 transition-colors p-1 cursor-pointer"
                              title="Partilhar Link"
                            >
                              <Share2 size={16} />
                            </button>
                            <button 
                              onClick={() => {
                                setPreviewInvoiceData(inv);
                                setIsPreviewOpen(true);
                              }}
                              className="hover:text-slate-900 transition-colors p-1 cursor-pointer"
                              title="Visualizar PDF"
                            >
                              <Eye size={16} />
                            </button>
                            <button 
                              onClick={() => downloadPDF(inv)}
                              className="hover:text-blue-600 transition-colors p-1 cursor-pointer"
                              title="Descarregar"
                            >
                              <Download size={16} />
                            </button>
                            <button 
                              onClick={() => printInvoice(inv)}
                              className="hover:text-emerald-600 transition-colors p-1 cursor-pointer"
                              title="Imprimir"
                            >
                              <Printer size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                /* VIEW 2 — COMPACT LIST VIEW (table layout) */
                <div className="overflow-x-auto">
                  <div className="min-w-[850px] p-6">
                    {/* Header Row */}
                    <div className="grid grid-cols-[1.4fr_1fr_1fr_0.8fr_0.9fr_0.7fr] pb-4 border-b border-slate-100 text-[11px] font-black uppercase tracking-wider text-slate-400 select-none">
                      <div>Invoice</div>
                      <div>Customer</div>
                      <div>Operator</div>
                      <div>Date</div>
                      <div className="text-right">Amount</div>
                      <div className="text-center">Status</div>
                    </div>

                    {/* Data Rows */}
                    <div className="divide-y divide-slate-100">
                      {paginatedInvoicesList.map((inv) => {
                        const customerName = customers.find(c => c.id === inv.customerId)?.name || inv.customerId || 'Walk-in';
                        const operatorTruncated = getTruncatedOperator(inv);
                        return (
                          <div 
                            key={inv.id}
                            className="grid grid-cols-[1.4fr_1fr_1fr_0.8fr_0.9fr_0.7fr] items-center py-4 border-b border-slate-100 last:border-b-0 hover:bg-slate-50/30 transition-colors relative"
                          >
                            {/* Col 1: Invoice number + channel tag pill below */}
                            <div className="flex flex-col items-start gap-1">
                              <span className="font-bold text-slate-900 text-sm font-mono">#{inv.invoiceNumber}</span>
                              {renderChannelTag(inv.saleType)}
                            </div>

                            {/* Col 2: Customer name */}
                            <div className="font-medium text-slate-700 text-sm truncate pr-2">
                              {customerName}
                            </div>

                            {/* Col 3: Operator (truncated email) */}
                            <div className="text-xs font-semibold text-slate-500 truncate pr-2" title={inv.createdByName || 'Admin/Manager'}>
                              {operatorTruncated}
                            </div>

                            {/* Col 4: Date */}
                            <div className="text-xs text-slate-400 font-bold uppercase">
                              {inv.createdAt?.seconds ? formatDateInTimezone(inv.createdAt, businessData?.timezone || profile?.timezone || 'Africa/Maputo') : 'Just now'}
                            </div>

                            {/* Col 5: Amount right-aligned */}
                            <div className="text-right text-slate-900 font-medium font-mono text-sm pr-4">
                              {formatCurrencyValue(inv.total || 0, inv.currency || currency || 'MZN')}
                            </div>

                            {/* Col 6: Status badge + dots menu */}
                            <div className="flex items-center justify-between pl-2 relative dots-menu-container">
                              <div className="flex-1 flex justify-center">
                                {renderViewStatusBadge(inv.status)}
                              </div>
                              
                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={() => setActiveActionMenuId(activeActionMenuId === inv.id ? null : inv.id)}
                                  className="p-2 text-slate-400 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-all cursor-pointer flex items-center justify-center"
                                  title="Ações"
                                >
                                  <MoreVertical size={16} />
                                </button>

                                {activeActionMenuId === inv.id && (
                                  <div className="absolute right-0 mt-1 w-48 bg-white rounded-xl border border-slate-100 shadow-xl z-50 py-1.5 font-sans divide-y divide-slate-50">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setPreviewInvoiceData(inv);
                                        setIsPreviewOpen(true);
                                        setActiveActionMenuId(null);
                                      }}
                                      className="w-full text-left px-4 py-2 hover:bg-slate-50 text-xs font-bold text-slate-700 hover:text-slate-900 transition-colors flex items-center gap-2 cursor-pointer"
                                    >
                                      <Eye size={14} className="text-slate-400" />
                                      Visualizar PDF
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        downloadPDF(inv);
                                        setActiveActionMenuId(null);
                                      }}
                                      className="w-full text-left px-4 py-2 hover:bg-slate-50 text-xs font-bold text-slate-700 hover:text-slate-900 transition-colors flex items-center gap-2 cursor-pointer"
                                    >
                                      <Download size={14} className="text-slate-400" />
                                      Descarregar PDF
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        printInvoice(inv);
                                        setActiveActionMenuId(null);
                                      }}
                                      className="w-full text-left px-4 py-2 hover:bg-slate-50 text-xs font-bold text-slate-700 hover:text-slate-900 transition-colors flex items-center gap-2 cursor-pointer"
                                    >
                                      <Printer size={14} className="text-slate-400" />
                                      Imprimir
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        openPaymentShareModal(inv);
                                        setActiveActionMenuId(null);
                                      }}
                                      className="w-full text-left px-4 py-2 hover:bg-slate-50 text-xs font-bold text-slate-700 hover:text-slate-900 transition-colors flex items-center gap-2 cursor-pointer"
                                    >
                                      <Share2 size={14} className="text-indigo-400" />
                                      Partilhar Link
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Pagination Controls */}
              <div className="p-6 bg-white border-t border-slate-100 select-none">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="text-xs font-semibold text-slate-500 font-sans">
                    Mostrando <span className="font-extrabold text-slate-900">{Math.min(filteredInvoicesList.length, startIndexInvoices + 1)}</span> a{" "}
                    <span className="font-extrabold text-slate-900">{Math.min(filteredInvoicesList.length, endIndexInvoices)}</span> de{" "}
                    <span className="font-extrabold text-[#111827]">{filteredInvoicesList.length}</span> faturas
                  </div>
                  <div className="flex items-center gap-1.5 self-end sm:self-auto">
                    <button
                      type="button"
                      disabled={currentPageInvoices === 1}
                      onClick={() => setCurrentPageInvoices(prev => Math.max(1, prev - 1))}
                      className="px-3 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed bg-white"
                    >
                      Anterior
                    </button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, Math.ceil(filteredInvoicesList.length / itemsPerPage)) }, (_, i) => {
                        const totalPages = Math.ceil(filteredInvoicesList.length / itemsPerPage);
                        let pageNum = currentPageInvoices;
                        if (currentPageInvoices <= 3) {
                          pageNum = i + 1;
                        } else if (currentPageInvoices >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = currentPageInvoices - 2 + i;
                        }
                        if (pageNum < 1 || pageNum > totalPages) return null;
                        return (
                          <button
                            key={pageNum}
                            type="button"
                            onClick={() => setCurrentPageInvoices(pageNum)}
                            className={cn(
                              "w-8 h-8 flex items-center justify-center text-xs font-bold rounded-lg transition-all cursor-pointer",
                              currentPageInvoices === pageNum ? "bg-slate-900 text-white shadow-sm" : "border border-slate-200 hover:bg-slate-50 text-slate-600 bg-white"
                            )}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      disabled={currentPageInvoices === Math.ceil(filteredInvoicesList.length / itemsPerPage)}
                      onClick={() => setCurrentPageInvoices(prev => Math.min(Math.ceil(filteredInvoicesList.length / itemsPerPage), prev + 1))}
                      className="px-3 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed bg-white"
                    >
                      Próximo
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'manage' && (() => {
        const paidInvoices = invoices.filter(i => i.status === 'paid');
        const unpaidInvoices = invoices.filter(i => i.status === 'unpaid');
        const totalInvoiceVolume = invoices.reduce((acc, curr) => acc + (curr.total || 0), 0);
        const paidInvoiceVolume = paidInvoices.reduce((acc, curr) => acc + (curr.total || 0), 0);
        const unpaidInvoiceVolume = unpaidInvoices.reduce((acc, curr) => acc + (curr.total || 0), 0);

        // Compute the filtered list for management operations
        const filteredInvoicesManageList = invoices.filter(inv => {
          if (shouldRestrict) {
            if (inv.createdByUid !== profile?.uid && inv.createdByEmail !== profile?.email && inv.createdByEmail !== user?.email) {
              return false;
            }
          }

          const matchesStatus = manageStatusFilter === 'all' || inv.status === manageStatusFilter;
          
          const operator = inv.createdByName || 'Admin/Manager';
          const customerName = customers.find(c => c.id === inv.customerId)?.name || inv.customerId || 'Walk-in';
          const matchesSearch = manageSearchQuery === '' || 
            inv.invoiceNumber?.toLowerCase().includes(manageSearchQuery.toLowerCase()) ||
            customerName?.toLowerCase().includes(manageSearchQuery.toLowerCase()) ||
            operator?.toLowerCase().includes(manageSearchQuery.toLowerCase());
            
          return matchesStatus && matchesSearch;
        });

        const startIndexManage = (currentPageManage - 1) * itemsPerPage;
        const endIndexManage = startIndexManage + itemsPerPage;
        const paginatedInvoicesManageList = filteredInvoicesManageList.slice(startIndexManage, endIndexManage);

        // Sum of selected invoice totals for the bulk panel
        const selectedTotalAmount = selectedIds.reduce((acc, id) => {
          const inv = invoices.find(i => i.id === id);
          return acc + (inv?.total || 0);
        }, 0);

        return (
          <div className="space-y-6 animate-in slide-in-from-top-4 duration-300">
            {/* STATS BENTO BANNERS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-2 text-left">
                <span className="text-[10px] uppercase font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded font-mono">💰 Total Faturado & Pago</span>
                <p className="text-2xl font-black text-slate-900">{(paidInvoiceVolume || 0).toLocaleString()} {currency}</p>
                <p className="text-[10px] text-slate-400 font-bold uppercase">{paidInvoices.length} Faturas liquidadas</p>
              </div>
              
              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-2 text-left">
                <span className="text-[10px] uppercase font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded font-mono">⚠️ Crédito Pendente</span>
                <p className="text-2xl font-black text-slate-900">{(unpaidInvoiceVolume || 0).toLocaleString()} {currency}</p>
                <p className="text-[10px] text-slate-400 font-bold uppercase">{unpaidInvoices.length} Faturas a crédito por liquidar</p>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-2 text-left">
                <span className="text-[10px] uppercase font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded font-mono">📊 Volume Total Controlado</span>
                <p className="text-2xl font-black text-slate-900">{(totalInvoiceVolume || 0).toLocaleString()} {currency}</p>
                <p className="text-[10px] text-slate-400 font-bold uppercase">{invoices.length} Transações totais processadas</p>
              </div>
            </div>

            {/* OPERATIONAL MANAGEMENT CENTER */}
            <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm shadow-slate-200/50 space-y-4 p-6 text-left">
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div>
                  <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                    🛠️ Gestão de Faturas & Reconciliação
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 font-medium font-sans">Retifique faturas, mude o status de pagamento de vendas a crédito ou elimine transações erradas.</p>
                </div>

                {/* Search & Filter bar for operations */}
                <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                  <div className="relative flex-1 sm:max-w-xs font-sans">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Search size={14} />
                    </span>
                    <input
                      type="text"
                      placeholder="Pesquisar faturas..."
                      value={manageSearchQuery}
                      onChange={(e) => setManageSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs font-semibold text-slate-800 placeholder-slate-400 cursor-text"
                    />
                  </div>

                  {/* Status Toggle segments */}
                  <div className="bg-slate-150 p-1 rounded-xl flex gap-1 text-[10px] font-black uppercase tracking-wider font-sans">
                    <button
                      type="button"
                      onClick={() => setManageStatusFilter('all')}
                      className={cn(
                        "px-3 py-1.5 rounded-lg transition-all cursor-pointer",
                        manageStatusFilter === 'all' ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
                      )}
                    >
                      Predefinido (Todas)
                    </button>
                    <button
                      type="button"
                      onClick={() => setManageStatusFilter('unpaid')}
                      className={cn(
                        "px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1",
                        manageStatusFilter === 'unpaid' ? "bg-amber-50 text-amber-700 shadow-xs" : "text-slate-500 hover:text-slate-800"
                      )}
                    >
                      A Crédito
                    </button>
                    <button
                      type="button"
                      onClick={() => setManageStatusFilter('paid')}
                      className={cn(
                        "px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1",
                        manageStatusFilter === 'paid' ? "bg-emerald-50 text-emerald-700 shadow-xs" : "text-slate-500 hover:text-slate-800"
                      )}
                    >
                      Líquidas (Pagas)
                    </button>
                  </div>
                </div>
              </div>

              {/* Bulk operations bar */}
              {selectedIds.length > 0 && (
                <div className="bg-blue-50/70 border border-blue-100 rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-center gap-3 animate-in fade-in duration-200">
                  <div className="text-xs text-blue-800 font-bold">
                    🔥 <span className="font-extrabold text-blue-900">{selectedIds.length}</span> {selectedIds.length === 1 ? 'fatura selecionada' : 'faturas selecionadas'} (Total: <span className="font-black text-blue-900">{selectedTotalAmount.toLocaleString()} {currency}</span>)
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={handleBulkSettle}
                      className="flex-1 sm:flex-initial px-4 py-2 bg-emerald-600 hover:bg-emerald-75 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-xs cursor-pointer transition-colors"
                    >
                      ✅ Marcar como Pago(s)
                    </button>
                    <button
                      type="button"
                      onClick={handleBulkCancel}
                      className="flex-1 sm:flex-initial px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-xs cursor-pointer transition-colors"
                    >
                      ❌ Cancelar em Lote
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedIds([])}
                      className="px-3 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-500 font-bold text-xs rounded-xl cursor-pointer transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {/* Manage Table */}
              <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                <table className="w-full text-left border-collapse min-w-[750px]">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100">
                      <th className="p-4 w-12 text-center">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          checked={selectedIds.length === filteredInvoicesManageList.length && filteredInvoicesManageList.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedIds(filteredInvoicesManageList.map(inv => inv.id));
                            else setSelectedIds([]);
                          }}
                        />
                      </th>
                      <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Referência</th>
                      <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Cliente</th>
                      <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Operador</th>
                      <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400 font-mono">Dívida / Valor Geral</th>
                      <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Status</th>
                      <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Ações de Gestão</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-sm">
                    {paginatedInvoicesManageList.map((inv) => {
                      const isUnpaid = inv.status !== 'paid';
                      return (
                        <tr
                          key={inv.id}
                          className={cn(
                            "hover:bg-slate-50/40 transition-colors",
                            selectedIds.includes(inv.id) && "bg-blue-50/10"
                          )}
                        >
                          <td className="p-4 text-center">
                            <input
                              type="checkbox"
                              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                              checked={selectedIds.includes(inv.id)}
                              onChange={() => toggleSelect(inv.id)}
                            />
                          </td>
                          <td className="p-4">
                            <div className="font-extrabold text-slate-900">#{inv.invoiceNumber}</div>
                            <span className="text-[9px] font-bold text-slate-400 block mt-0.5">
                              {inv.saleType === 'wholesale' ? '📦 Grosso' : '🛍️ Retalho'}
                            </span>
                          </td>
                          <td className="p-4">
                            <div className="font-semibold text-slate-700">
                              {customers.find(c => c.id === inv.customerId)?.name || inv.customerId || 'Walk-in'}
                            </div>
                          </td>
                          <td className="p-4 text-xs font-bold text-slate-500">
                            {inv.createdByName || 'Admin/Manager'}
                          </td>
                          <td className="p-4 font-bold text-slate-800">
                            <div className="text-slate-900">{formatCurrencyValue(inv.total || 0, inv.currency || currency || 'MZN')}</div>
                            {isUnpaid && (
                              <div className="text-[10px] text-rose-600 font-extrabold uppercase mt-0.5">
                                Em falta: {formatCurrencyValue(inv.outstandingBalance || inv.total, inv.currency || currency || 'MZN')}
                              </div>
                            )}
                          </td>
                          <td className="p-4">
                            {getStatusBadge(inv.status)}
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex justify-end gap-1 items-center">
                              {isUnpaid ? (
                                <div className="flex gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleSettleInvoiceInline(inv)}
                                    className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg cursor-pointer transition-colors"
                                    title="Quitar / Liquidar Fatura diretamente"
                                  >
                                    <CheckCircle2 size={16} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSendOverdueReminder(inv)}
                                    className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg cursor-pointer transition-colors"
                                    title="Enviar lembrete de cobrança (WhatsApp)"
                                  >
                                    <Send size={15} />
                                  </button>
                                </div>
                              ) : (
                                <span className="p-2 text-slate-200" title="Já liquidada">
                                  <CheckCircle2 size={16} className="text-slate-300 opacity-50" />
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => handleEditInvoiceClick(inv)}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer transition-colors"
                                title="Editar / Retificar Fatura"
                              >
                                <Edit2 size={16} />
                              </button>
                              {inv.status !== 'cancelled' ? (
                                <button
                                  type="button"
                                  onClick={() => handleCancelClick(inv.id)}
                                  className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg cursor-pointer transition-colors"
                                  title="Cancelar Fatura"
                                >
                                  <X size={16} />
                                </button>
                              ) : (
                                <span className="p-2 text-slate-300 pointer-events-none" title="Fatura Cancelada">
                                  <X className="opacity-40" size={16} />
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {filteredInvoicesManageList.length > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-slate-100 mt-4 select-none">
                  <div className="text-xs font-semibold text-slate-500 font-sans">
                    Mostrando <span className="font-extrabold text-slate-900">{Math.min(filteredInvoicesManageList.length, startIndexManage + 1)}</span> a{" "}
                    <span className="font-extrabold text-slate-900">{Math.min(filteredInvoicesManageList.length, endIndexManage)}</span> de{" "}
                    <span className="font-extrabold text-[#111827]">{filteredInvoicesManageList.length}</span> faturas
                  </div>
                  <div className="flex items-center gap-1.5 self-end sm:self-auto">
                    <button
                      type="button"
                      disabled={currentPageManage === 1}
                      onClick={() => setCurrentPageManage(prev => Math.max(1, prev - 1))}
                      className="px-3 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed bg-white"
                    >
                      Anterior
                    </button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, Math.ceil(filteredInvoicesManageList.length / itemsPerPage)) }, (_, i) => {
                        const totalPages = Math.ceil(filteredInvoicesManageList.length / itemsPerPage);
                        let pageNum = currentPageManage;
                        if (currentPageManage <= 3) {
                          pageNum = i + 1;
                        } else if (currentPageManage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = currentPageManage - 2 + i;
                        }
                        if (pageNum < 1 || pageNum > totalPages) return null;
                        return (
                          <button
                            key={pageNum}
                            type="button"
                            onClick={() => setCurrentPageManage(pageNum)}
                            className={cn(
                              "w-8 h-8 flex items-center justify-center text-xs font-bold rounded-lg transition-all cursor-pointer",
                              currentPageManage === pageNum ? "bg-slate-900 text-white shadow-sm" : "border border-slate-200 hover:bg-slate-50 text-slate-600 bg-white"
                            )}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      disabled={currentPageManage === Math.ceil(filteredInvoicesManageList.length / itemsPerPage)}
                      onClick={() => setCurrentPageManage(prev => Math.min(Math.ceil(filteredInvoicesManageList.length / itemsPerPage), prev + 1))}
                      className="px-3 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed bg-white"
                    >
                      Próximo
                    </button>
                  </div>
                </div>
              )}

              {filteredInvoicesManageList.length === 0 && (
                <div className="p-12 text-center flex flex-col items-center gap-3">
                  <div className="w-12 h-12 bg-slate-50 text-slate-300 rounded-[14px] flex items-center justify-center text-sm font-bold">
                    🔍
                  </div>
                  <div className="text-slate-400 text-xs font-bold uppercase tracking-wider">Sem correspondências</div>
                  <p className="text-xs text-slate-550 leading-relaxed max-w-sm mx-auto">Nenhuma fatura encontrada com os filtros e pesquisa definidos nesta seção de gerenciamento.</p>
                </div>
              )}
            </div>

            {/* PRINT FORMAT DEFAULTS CONFIG */}
            <div className="bg-white p-6 rounded-[24px] border border-slate-150 shadow-sm space-y-5 text-left">
              <div>
                <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded font-black uppercase tracking-wider">🖨️ Configuração Padrão do Recibo / Impressora</span>
                <h3 className="text-sm font-black text-slate-900 mt-2">Selecione o Formato Predefinido para Emissão de Faturas</h3>
                <p className="text-xs text-slate-550">O formato selecionado será carregado automaticamente no momento da pré-visualização ou impressão direta.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => savePrinterPreference('standard')}
                  className={cn(
                    "p-4 rounded-xl border font-sans text-left transition-all relative flex flex-col justify-between hover:shadow-md cursor-pointer",
                    businessData?.printerType === 'standard' || !businessData?.printerType ? "border-blue-600 bg-blue-50/20" : "border-slate-200"
                  )}
                >
                  <div className="mb-2">
                    <h4 className="font-extrabold text-xs text-slate-800">📄 Formato Padrão A4</h4>
                    <p className="text-[10.5px] text-slate-500 mt-1 font-medium leading-relaxed">Ideal para faturas formais com cabeçalho de empresa e tabelas completas de impostos.</p>
                  </div>
                  {(businessData?.printerType === 'standard' || !businessData?.printerType) && (
                    <span className="absolute top-3 right-3 text-blue-600 bg-white p-0.5 rounded-full"><Check size={12} className="stroke-[3.5]" /></span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => savePrinterPreference('thermal_80mm')}
                  className={cn(
                    "p-4 rounded-xl border font-sans text-left transition-all relative flex flex-col justify-between hover:shadow-md cursor-pointer",
                    businessData?.printerType === 'thermal_80mm' ? "border-blue-600 bg-blue-50/20" : "border-slate-200"
                  )}
                >
                  <div className="mb-2">
                    <h4 className="font-extrabold text-xs text-slate-800">📟 Rolo Térmico 80mm</h4>
                    <p className="text-[10.5px] text-slate-500 mt-1 font-medium leading-relaxed">Otimizado para impressoras de talões POS de balcão de tamanho clássico.</p>
                  </div>
                  {businessData?.printerType === 'thermal_80mm' && (
                    <span className="absolute top-3 right-3 text-blue-600 bg-white p-0.5 rounded-full"><Check size={12} className="stroke-[3.5]" /></span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => savePrinterPreference('thermal_58mm')}
                  className={cn(
                    "p-4 rounded-xl border font-sans text-left transition-all relative flex flex-col justify-between hover:shadow-md cursor-pointer",
                    businessData?.printerType === 'thermal_58mm' ? "border-blue-600 bg-blue-50/20" : "border-slate-200"
                  )}
                >
                  <div className="mb-2">
                    <h4 className="font-extrabold text-xs text-slate-800">📟 Rolo Térmico 58mm</h4>
                    <p className="text-[10.5px] text-slate-500 mt-1 font-medium leading-relaxed">Otimizado para miniimpressoras térmicas portáteis ou Bluetooth de menor largura.</p>
                  </div>
                  {businessData?.printerType === 'thermal_58mm' && (
                    <span className="absolute top-3 right-3 text-blue-600 bg-white p-0.5 rounded-full"><Check size={12} className="stroke-[3.5]" /></span>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Shareable Payment Link Generation Modal */}
      {isShareModalOpen && selectedInvoiceForShare && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-[32px] border border-slate-100 shadow-2xl max-w-md w-full p-8 relative animate-in zoom-in-95 duration-200">
            {/* Close Button */}
            <button 
              onClick={() => {
                setIsShareModalOpen(false);
                setSelectedInvoiceForShare(null);
                setCopied(false);
              }}
              className="absolute top-6 right-6 text-slate-400 hover:text-slate-700 p-2 hover:bg-slate-50 rounded-full cursor-pointer transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Header */}
            <div className="flex flex-col items-center text-center gap-2 mb-6">
              <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-[20px] flex items-center justify-center mb-1">
                <Share2 size={24} />
              </div>
              <h3 className="text-xl font-bold text-[#1D1510] font-sans">Ecrã de Pagamento Online</h3>
              <p className="text-slate-500 text-xs">Gere e partilha links de faturação segura para os teus clientes.</p>
            </div>

            {/* Quick Invoice Info */}
            <div className="bg-[#FAF7F2] border border-[#E9E1D2] p-5 rounded-[22px] flex flex-col gap-2.5 mb-6">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-[#8B735F] uppercase tracking-wider">Fatura Nº:</span>
                <span className="font-mono font-black text-slate-800">#{selectedInvoiceForShare.invoiceNumber}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-[#8B735F] uppercase tracking-wider">Cliente:</span>
                <span className="font-extrabold text-slate-800">
                  {customers.find(c => c.id === selectedInvoiceForShare.customerId)?.name || selectedInvoiceForShare.customerId || 'Walk-in'}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-[#8B735F] uppercase tracking-wider">Valor total:</span>
                <span className="font-black text-[#0F274C]">{(selectedInvoiceForShare.total || 0).toLocaleString()} {currency}</span>
              </div>
            </div>

            {/* Link Copy form */}
            <div className="space-y-2 mb-6">
              <label className="text-[10px] font-black text-[#8B735F] uppercase tracking-widest block">Link Seguro de Pagamento</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  readOnly 
                  value={shareUrl}
                  className="flex-1 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 text-xs font-mono font-bold text-slate-600 outline-none select-all"
                />
                <button
                  onClick={handleCopyLinkFromModal}
                  className="px-4 py-2 bg-[#1D1510] hover:bg-[#2F231B] text-white text-xs font-black rounded-xl uppercase tracking-wider transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check size={14} className="text-emerald-400" />
                      Copiado!
                    </>
                  ) : (
                    <>
                      <Copy size={13} />
                      Copiar
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Direct WhatsApp Action */}
            <div className="space-y-4 border-t border-slate-100 pt-6">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black text-[#8B735F] uppercase tracking-widest block">Enviar via WhatsApp</label>
                <span className={cn(
                  "text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full",
                  clientPhone ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                )}>
                  {clientPhone ? "Contacto Disponível" : "Sem Contacto Guardado"}
                </span>
              </div>

              <div className="space-y-2.5">
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#8B735F]">Enviar para:</span>
                  <input 
                    type="tel"
                    placeholder="Ex: +258 840000000"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    className="w-full pl-24 pr-3.5 py-3 bg-[#FAF7F2] border border-[#E9E1D2] rounded-2xl outline-none text-xs font-bold text-slate-800 focus:ring-2 focus:ring-[#B8791A]"
                  />
                </div>

                <textarea
                  value={whatsappMessage}
                  onChange={(e) => setWhatsappMessage(e.target.value)}
                  rows={4}
                  className="w-full p-4 bg-[#FAF7F2] border border-[#E9E1D2] rounded-2xl outline-none text-xs text-slate-700 leading-relaxed font-semibold focus:ring-2 focus:ring-[#B8791A]"
                  placeholder="Mensagem rápida do WhatsApp..."
                />
              </div>

              <button
                onClick={handleSendWhatsAppDirect}
                className="w-full py-4 bg-[#0F274C] hover:bg-[#093025] active:bg-[#062018] text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-[#0F274C]/15"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.458 5.704 1.46h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                Mandar no WhatsApp do Cliente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assisted Invoice Confirmation Wizard Modal */}
      {isConfirmWizardOpen && (() => {
        // Calculate raw items subtotal, tax and total
        const itemDiscountSubtotal = newInvoice.items.reduce((sum, item) => {
          const discountVal = item.discount || 0;
          const amount = item.quantity * item.price;
          return sum + (amount - (amount * discountVal / 100));
        }, 0);
        const globalDiscountRate = newInvoice.discountRate || 0;
        const rawSubtotal = itemDiscountSubtotal * (1 - globalDiscountRate / 100);
        const taxRate = newInvoice.taxRate ?? 0;
        const isInclusive = (newInvoice as any).taxInclusive !== false;
        const tax = isInclusive 
          ? rawSubtotal * (taxRate / (100 + taxRate)) 
          : rawSubtotal * (taxRate / 100);
        const total = isInclusive 
          ? rawSubtotal 
          : rawSubtotal + tax;
        const subtotal = isInclusive 
          ? rawSubtotal - tax 
          : rawSubtotal;

        const customerObj = customers.find(c => c.id === newInvoice.customerId);
        const customerName = customerObj?.name || 'Cliente Geral (Walk-in)';

        const paidVal = wizardPaymentMethod === 'credit' ? 0 : Number(wizardAmountPaid || 0);
        const balanceVal = Math.max(0, total - paidVal);
        const changeVal = Math.max(0, paidVal - total);

        let finalStatus = 'unpaid';
        if (wizardPaymentMethod !== 'credit') {
          if (balanceVal <= 0) {
            finalStatus = 'paid';
          } else if (paidVal > 0) {
            finalStatus = 'partially_paid';
          }
        }

        return (
          <div className="fixed inset-0 bg-[#090b11]/80 backdrop-blur-md z-[200] flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-[32px] border border-slate-200 outline-none shadow-2xl w-full max-w-4xl overflow-hidden animate-in zoom-in-95 duration-200">
              
              {/* Header */}
              <div className="bg-blue-900 text-white p-6 flex justify-between items-center border-b-2 border-[#B8791A]/50">
                <div className="flex items-center gap-3 font-sans">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black text-lg">
                    📊
                  </div>
                  <div className="text-left">
                    <h3 className="font-extrabold text-base tracking-tight text-white">Fluxo Assistido de Faturação</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Procedimento obrigatório de validação</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsConfirmWizardOpen(false)}
                  className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition-all cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Step Content */}
              <div className="p-6 max-h-[72vh] overflow-y-auto text-left font-sans">
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start animate-in fade-in duration-205">
                  
                  {/* LEFT COLUMN: RESUMO DO DOCUMENTO E ARTIGOS */}
                  <div className="space-y-4">
                    {/* Summary Header */}
                    <div className="bg-slate-50 border border-slate-150 p-4 rounded-2xl">
                      <p className="text-[10px] font-black uppercase text-slate-500 tracking-wider mb-2">Perfil do Cliente & Destinatário</p>
                      <div className="grid grid-cols-2 gap-4 text-xs font-bold text-slate-700">
                        <div>
                          <p className="text-slate-400 text-[10px] uppercase tracking-wider">Cliente:</p>
                          <p className="text-slate-800 text-sm font-black mt-0.5">{customerName}</p>
                        </div>
                        <div>
                          <p className="text-slate-400 text-[10px] uppercase tracking-wider">Contacto:</p>
                          <p className="text-slate-800 text-sm font-black mt-0.5">{customerObj?.phone || "walk-in / Geral"}</p>
                        </div>
                      </div>
                    </div>

                    {/* Scrollable loaded items list */}
                    <div className="border border-slate-150 rounded-2xl overflow-hidden bg-white shadow-sm">
                      <div className="bg-slate-50 p-3 flex justify-between text-[10px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-150">
                        <span>Itens Carregados</span>
                        <span className="w-24 text-right">Preço Total</span>
                      </div>
                      <div className="divide-y divide-slate-100 max-h-[160px] overflow-y-auto">
                        {newInvoice.items.map((it, idx) => (
                          <div key={idx} className="p-3 flex justify-between items-center text-xs font-bold text-slate-700 hover:bg-slate-50/50 transition-colors">
                            <div className="truncate max-w-[180px]">
                              <p className="text-slate-800 font-extrabold truncate">{it.description || "Sem descrição"}</p>
                              <p className="text-[10px] text-slate-400 font-mono mt-0.5">{it.quantity} {it.unitLabel || 'unidades'} × {it.price.toLocaleString('pt-MZ')} MT</p>
                            </div>
                            <span className="w-24 text-right text-slate-900 font-black font-mono">{(it.price * it.quantity).toLocaleString('pt-MZ')} MT</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Pricing Box */}
                    <div className="p-4 border border-slate-850 rounded-2xl bg-slate-950 text-white space-y-3 shadow-md">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Enquadramento Financeiro</p>
                      <div className="space-y-1.5 text-xs border-b border-slate-800 pb-2.5 font-semibold text-slate-300">
                        <div className="flex justify-between">
                          <span>Subtotal Líquido:</span>
                          <span className="font-mono">{subtotal.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} MT</span>
                        </div>
                        <div className="flex justify-between">
                          <span>IVA Tributável ({taxRate}%):</span>
                          <span className="font-mono">{tax.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} MT</span>
                        </div>
                        <div className="flex justify-between text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                          <span>Tipo de Imposto:</span>
                          <span>{isInclusive ? 'Preços com IVA incluído' : 'IVA adicionado à fatura'}</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-sm font-black pt-1">
                        <span className="text-slate-400 uppercase tracking-wider text-[10px]">Total Líquido do Documento:</span>
                        <span className="text-xl text-emerald-400 font-mono font-black">{total.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} MT</span>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT COLUMN: PAGAMENTO E COMUNICAÇÕES DIRECTAS */}
                  <div className="space-y-4">
                    {/* Select payment group */}
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider">Meio de Recebimento</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setWizardPaymentMethod('cash');
                            setWizardAmountPaid(total.toFixed(2));
                          }}
                          className={cn(
                            "p-3 rounded-xl border font-black text-xs uppercase tracking-wider flex flex-col items-center justify-center gap-1 transition-all text-center cursor-pointer",
                            wizardPaymentMethod === 'cash'
                              ? "bg-slate-900 text-white border-slate-900 shadow-md scale-[1.01]"
                              : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                          )}
                        >
                          <span className="text-lg">💵</span>
                          <span>Dinheiro</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setWizardPaymentMethod('card');
                            setWizardAmountPaid(total.toFixed(2));
                          }}
                          className={cn(
                            "p-3 rounded-xl border font-black text-xs uppercase tracking-wider flex flex-col items-center justify-center gap-1 transition-all text-center cursor-pointer",
                            wizardPaymentMethod === 'card'
                              ? "bg-slate-950 text-white border-slate-950 shadow-md scale-[1.01]"
                              : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                          )}
                        >
                          <span className="text-lg">💳</span>
                          <span>Cartão</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setWizardPaymentMethod('mpesa');
                            setWizardAmountPaid(total.toFixed(2));
                          }}
                          className={cn(
                            "p-3 rounded-xl border font-black text-xs uppercase tracking-wider flex flex-col items-center justify-center gap-1 transition-all text-center cursor-pointer",
                            wizardPaymentMethod === 'mpesa'
                              ? "bg-slate-950 text-white border-slate-950 shadow-md scale-[1.01]"
                              : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                          )}
                        >
                          <span className="text-lg">📱</span>
                          <span>M-Pesa</span>
                        </button>

                        <button
                          type="button"
                          disabled={!newInvoice.customerId || newInvoice.customerId === 'Walk-in'}
                          onClick={() => {
                            const isWalkIn = !newInvoice.customerId || newInvoice.customerId === 'Walk-in';
                            if (isWalkIn) {
                              toast.error("Vendas a crédito não são permitidas para clientes finais / Walk-in.");
                              return;
                            }
                            setWizardPaymentMethod('credit');
                            setWizardAmountPaid('0');
                          }}
                          className={cn(
                            "p-3 rounded-xl border font-black text-xs uppercase tracking-wider flex flex-col items-center justify-center gap-1 transition-all text-center cursor-pointer",
                            (!newInvoice.customerId || newInvoice.customerId === 'Walk-in')
                              ? "opacity-30 cursor-not-allowed bg-slate-50 text-slate-400 border-slate-100"
                              : wizardPaymentMethod === 'credit'
                                ? "bg-blue-600 text-white border-blue-600 shadow-md scale-[1.01]"
                                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                          )}
                          title={(!newInvoice.customerId || newInvoice.customerId === 'Walk-in') ? "Indisponível para Cliente Walk-in" : ""}
                        >
                          <span className="text-lg">⚠️</span>
                          <span>A Crédito</span>
                        </button>
                      </div>
                    </div>

                    {/* Numerical calculation row */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[9px] font-black uppercase text-slate-400 tracking-wider mb-1">Fatura Total</label>
                        <div className="p-3 bg-slate-100 text-slate-800 font-extrabold text-base rounded-xl border border-slate-200 font-mono">
                          {total.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} MT
                        </div>
                      </div>

                      <div>
                        <label className="block text-[9px] font-black uppercase text-slate-400 tracking-wider mb-1">Montante Pago</label>
                        <input
                          type="text"
                          disabled={wizardPaymentMethod === 'credit'}
                          value={wizardAmountPaid}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9.]/g, '');
                            setWizardAmountPaid(val);
                          }}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none text-base font-extrabold text-slate-850 rounded-xl disabled:opacity-50 disabled:bg-slate-100 font-mono"
                          placeholder="0.00"
                        />
                      </div>
                    </div>

                    {/* Live troco calculation */}
                    <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4 grid grid-cols-2 gap-4 font-sans text-xs">
                      <div>
                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Troco correspondente</p>
                        <p className="text-base font-black text-emerald-600 mt-1 font-mono">{changeVal.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} MT</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Saldo Pendente (Dívida)</p>
                        <p className={cn("text-base font-black mt-1 font-mono", balanceVal > 0 ? "text-red-500" : "text-slate-400")}>
                          {balanceVal.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} MT
                        </p>
                      </div>
                    </div>

                    {/* Post save notifications direct check-boxes */}
                    <div className="space-y-2.5 bg-slate-50 border border-slate-150 p-4 rounded-2xl font-semibold text-left text-xs text-slate-700">
                      <p className="text-[9px] font-black uppercase text-slate-555 tracking-wider mb-1.5">Ações Automatizadas pós-emissão</p>
                      
                      {/* Auto Print Toggle */}
                      <label className="flex items-start gap-2.5 cursor-pointer group">
                        <input 
                          type="checkbox" 
                          checked={autoPrintReceipt}
                          onChange={(e) => setAutoPrintReceipt(e.target.checked)}
                          className="w-4 h-4 text-blue-600 border-slate-350 rounded focus:ring-blue-500 cursor-pointer mt-0.5 shrink-0"
                        />
                        <div className="text-left font-sans">
                          <p className="text-xs font-extrabold text-slate-800 group-hover:text-blue-600 transition-colors">🖨️ Imprimir recibo após gravar</p>
                          <p className="text-[9.5px] text-slate-500 font-semibold mt-0.5 font-sans">Disparar impressão térmica ou standard automaticamente</p>
                        </div>
                      </label>

                      {/* WhatsApp Toggle */}
                      <label className={cn("flex items-start gap-2.5 cursor-pointer group pt-2 border-t border-slate-100", !customerObj?.phone && "opacity-50 cursor-not-allowed")}>
                        <input 
                          type="checkbox" 
                          checked={sendWhatsApp}
                          disabled={!customerObj?.phone}
                          onChange={(e) => setSendWhatsApp(e.target.checked)}
                          className="w-4 h-4 text-emerald-600 border-slate-350 rounded focus:ring-emerald-500 cursor-pointer mt-0.5 shrink-0"
                        />
                        <div className="text-left font-sans">
                          <p className="text-xs font-extrabold text-slate-800 group-hover:text-emerald-600 transition-colors">💬 Enviar via WhatsApp do Cliente</p>
                          <p className="text-[9.5px] text-slate-500 font-semibold mt-0.5 font-sans">
                            {customerObj?.phone 
                              ? `WhatsApp configurado para: ${customerObj.phone}` 
                              : "WhatsApp indisponível (Cliente Walk-in ou sem contacto)"}
                          </p>
                        </div>
                      </label>

                      {/* Email Toggle */}
                      <label className={cn("flex items-start gap-2.5 cursor-pointer group pt-2 border-t border-slate-100", !customerObj?.email && "opacity-50 cursor-not-allowed")}>
                        <input 
                          type="checkbox" 
                          checked={sendEmail}
                          disabled={!customerObj?.email}
                          onChange={(e) => setSendEmail(e.target.checked)}
                          className="w-4 h-4 text-purple-650 border-slate-350 rounded focus:ring-purple-500 cursor-pointer mt-0.5 shrink-0"
                        />
                        <div className="text-left font-sans">
                          <p className="text-xs font-extrabold text-slate-800 group-hover:text-purple-600 transition-colors font-sans">✉️ Enviar Comprovativo por E-mail</p>
                          <p className="text-[9.5px] text-slate-500 font-semibold mt-0.5 font-sans">
                            {customerObj?.email 
                              ? `Enviar anexo digital a: ${customerObj.email}` 
                              : "Email indisponível (Cliente sem e-mail cadastrado)"}
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>

                </div>

              </div>

              {/* Footer */}
              <div className="bg-slate-50 border-t border-slate-150 p-6 flex justify-between gap-4 font-sans">
                <button
                  onClick={() => setIsConfirmWizardOpen(false)}
                  className="px-5 py-2.5 bg-white border border-slate-200 text-slate-700 font-extrabold hover:bg-slate-50 rounded-xl transition-all text-xs uppercase tracking-wider cursor-pointer"
                >
                  Anular e Voltar
                </button>

                <button
                  onClick={handleCreateInvoice}
                  className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl transition-all text-xs uppercase tracking-widest cursor-pointer flex items-center gap-1.5 shadow-lg shadow-emerald-500/10 active:scale-[0.98]"
                >
                  💾 Confirmar e Emitir Fatura (1 Clique)
                </button>
              </div>

            </div>
          </div>
        );
      })()}

      {/* Visual Live PDF/Thermal Invoice Preview Modal */}
      {isPreviewOpen && previewInvoiceData && (() => {
        const inv = previewInvoiceData;
        
        // Resolve customer details nicely
        const customerObj = customers.find(c => c.id === inv.customerId);
        const nameOfCustomer = customerObj?.name || inv.customerName || (inv.customerId === 'Walk-in' ? 'Walk-in Customer (Geral)' : inv.customerId) || 'Cliente Geral';
        const phoneOfCustomer = customerObj?.phone || inv.customerPhone || '';
        const emailOfCustomer = customerObj?.email || inv.customerEmail || '';
        const addressOfCustomer = customerObj?.address || inv.deliveryAddress || 'Moçambique';
        
        // Calculations
        const isTaxInclusive = inv.taxInclusive !== false;
        const grandTotalAmount = Number(inv.total || 0);
        const taxAmount = Number(inv.tax !== undefined ? inv.tax : 0);
        const subtotalAmount = isTaxInclusive ? (grandTotalAmount - taxAmount) : Number(inv.subtotal !== undefined ? inv.subtotal : (grandTotalAmount - taxAmount));
        
        // Sender Corporate details
        const companyInfo = {
          name: businessData?.name || profile?.businessName || 'Sabush System ERP',
          address: businessData?.address || 'Av. de Moçambique, Maputo',
          phone: businessData?.phone || profile?.phone || '+258 84 000 0000',
          email: businessData?.email || profile?.email || 'geral@sabush.com',
          nuit: businessData?.taxId || '400123456'
        };

        const invoiceDateFormatted = inv.date 
          ? formatDateInTimezone(new Date(inv.date), businessData?.timezone || profile?.timezone || 'Africa/Maputo') 
          : inv.createdAt?.seconds 
            ? formatDateInTimezone(inv.createdAt, businessData?.timezone || profile?.timezone || 'Africa/Maputo') 
            : formatDateInTimezone(new Date(), businessData?.timezone || profile?.timezone || 'Africa/Maputo');

        const dueDateFormatted = inv.dueDate 
          ? formatDateInTimezone(new Date(inv.dueDate), businessData?.timezone || profile?.timezone || 'Africa/Maputo') 
          : formatDateInTimezone(new Date(), businessData?.timezone || profile?.timezone || 'Africa/Maputo');

        return (
          <div className="fixed inset-0 bg-[#090C16]/80 backdrop-blur-md z-[150] flex flex-col h-screen w-screen overflow-hidden select-none animate-in fade-in duration-200 block" id="invoice-preview-modal">
            
            {/* Control Bar Header */}
            <div className="bg-[#081F1E] border-b border-[#16253B] p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center text-white">
                  <Eye size={18} />
                </div>
                <div>
                  <h3 className="font-extrabold text-white text-sm tracking-tight flex items-center gap-2">
                    <span>Ecrã de Visualização de Factura</span>
                    {inv.isDraft && (
                      <span className="bg-orange-500/15 text-orange-400 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded border border-orange-500/30">
                        Rascunho
                      </span>
                    )}
                  </h3>
                  <p className="text-[10px] font-bold text-[#8FB0AC] tracking-tight uppercase">
                    Layout interactivo da factura em tempo real
                  </p>
                </div>
              </div>

              {/* Layout controls */}
              <div className="flex items-center gap-3 flex-wrap">
                {/* Format config trigger */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowFormatConfig(!showFormatConfig)}
                    className={cn(
                      "px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 bg-[#10302E] border border-[#1C4340] text-white hover:bg-[#1C4340]",
                      showFormatConfig && "border-blue-500 text-blue-400 bg-[#1D2748]"
                    )}
                    title="Configurar Formato de Impressão"
                  >
                    <span>⚙️ Configurar Formato de Impressão</span>
                    <span className="text-[10px] bg-[#163D3B] text-[#8FB0AC] px-1.5 py-0.5 rounded font-mono font-bold lowercase">
                      {previewFormat === 'A4' ? 'a4' : previewFormat === 'thermal_80mm' ? '80mm' : '58mm'}
                    </span>
                  </button>

                  {showFormatConfig && (
                    <div className="absolute top-full mt-2 left-0 md:left-auto md:right-0 bg-[#081F1E] border border-[#16253B] rounded-2xl p-4 w-72 shadow-2xl z-[200] flex flex-col gap-3 font-sans animate-in slide-in-from-top-2 duration-150 text-left">
                      <p className="text-[10px] font-black uppercase tracking-widest text-[#8FB0AC]">Formato de Impressão</p>
                      
                      <div className="flex flex-col gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewFormat('A4');
                            savePrinterPreference('standard');
                            setShowFormatConfig(false);
                          }}
                          className={cn(
                            "w-full px-3 py-2 rounded-xl text-xs font-bold text-left transition-all flex items-center justify-between cursor-pointer",
                            previewFormat === 'A4' ? "bg-blue-600 text-white" : "text-[#8FB0AC] hover:bg-[#10302E] hover:text-white"
                          )}
                        >
                          <span>📄 A4 Padrão (PDF)</span>
                          {previewFormat === 'A4' && <span className="text-[9px] uppercase bg-blue-700 px-1 py-0.5 rounded font-bold text-white">Activo</span>}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setPreviewFormat('thermal_80mm');
                            savePrinterPreference('thermal_80mm');
                            setShowFormatConfig(false);
                          }}
                          className={cn(
                            "w-full px-3 py-2 rounded-xl text-xs font-bold text-left transition-all flex items-center justify-between cursor-pointer",
                            previewFormat === 'thermal_80mm' ? "bg-emerald-600 text-white" : "text-[#8FB0AC] hover:bg-[#10302E] hover:text-white"
                          )}
                        >
                          <span>📠 Rolo Térmico 80mm</span>
                          {previewFormat === 'thermal_80mm' && <span className="text-[9px] uppercase bg-emerald-700 px-1 py-0.5 rounded font-bold text-white">Activo</span>}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setPreviewFormat('thermal_58mm');
                            savePrinterPreference('thermal_58mm');
                            setShowFormatConfig(false);
                          }}
                          className={cn(
                            "w-full px-3 py-2 rounded-xl text-xs font-bold text-left transition-all flex items-center justify-between cursor-pointer",
                            previewFormat === 'thermal_58mm' ? "bg-emerald-600 text-white" : "text-[#8FB0AC] hover:bg-[#10302E] hover:text-white"
                          )}
                        >
                          <span>📠 Rolo Térmico 58mm</span>
                          {previewFormat === 'thermal_58mm' && <span className="text-[9px] uppercase bg-emerald-700 px-1 py-0.5 rounded font-bold text-white">Activo</span>}
                        </button>
                      </div>

                      <div className="border-t border-[#16253B] pt-2 mt-1 text-[9px] text-[#8FB0AC]/80 flex items-start gap-1 leading-snug">
                        <span>💡</span>
                        <p>Selecionar um formato guarda automaticamente a preferência nas configurações da empresa.</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Zoom Controls */}
                <div className="flex items-center gap-2 bg-[#10302E] px-3 py-2 rounded-xl border border-[#1C4340]">
                  <button
                    onClick={() => setPreviewZoom(prev => Math.max(50, prev - 10))}
                    className="p-1 hover:bg-[#1C4340] rounded text-[#8FB0AC] hover:text-white cursor-pointer"
                    title="Diminuir Zoom"
                  >
                    <ZoomOut size={16} />
                  </button>
                  <span className="text-xs font-mono font-black text-white w-12 text-center">
                    {previewZoom}%
                  </span>
                  <button
                    onClick={() => setPreviewZoom(prev => Math.min(150, prev + 10))}
                    className="p-1 hover:bg-[#1C4340] rounded text-[#8FB0AC] hover:text-white cursor-pointer"
                    title="Aumentar Zoom"
                  >
                    <ZoomIn size={16} />
                  </button>
                </div>

                {/* Core Downstream Actions */}
                <button
                  onClick={() => printInvoice(inv)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 transition-all text-white text-xs font-black rounded-xl uppercase tracking-widest flex items-center gap-2 cursor-pointer shadow-md shadow-emerald-600/10"
                  title="Enviar para a Impressora"
                >
                  <Printer size={15} />
                  <span>Imprimir</span>
                </button>

                <button
                  onClick={() => {
                    downloadPDF(inv);
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all text-white text-xs font-black rounded-xl uppercase tracking-widest flex items-center gap-2 cursor-pointer shadow-md shadow-blue-600/10"
                  title="Descarregar PDF"
                >
                  <Download size={15} />
                  <span>Baixar PDF</span>
                </button>

                <button
                  onClick={() => {
                    setIsPreviewOpen(false);
                    setPreviewInvoiceData(null);
                  }}
                  className="p-2.5 bg-[#163D3B] hover:bg-rose-600 text-[#8FB0AC] hover:text-white rounded-xl transition-all cursor-pointer flex items-center justify-center"
                  title="Fechar Visualização"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Central Split Layout Area */}
            <div className="flex-1 overflow-hidden flex flex-col md:flex-row bg-[#080B16]">
              
              {/* Left Side: Document Canvas (Interactive zoom & preview) */}
              <div className="flex-1 overflow-y-auto p-4 md:p-8 flex items-start justify-center custom-scrollbar border-r border-[#16253B]">
                <div 
                  style={{ transform: `scale(${previewZoom / 100})`, transformOrigin: 'top center' }}
                  className="transition-transform duration-100 ease-out"
                >
                  {previewFormat === 'A4' ? (
                    /* ================== STANDARD A4 BLOCK PREVIEW ================== */
                    <div 
                      id="preview-a4-sheet"
                      className="bg-white text-[#1E293B] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.6)] border border-slate-250 w-[800px] min-h-[1130px] p-12 flex flex-col justify-between rounded-sm relative text-[258_device] select-text"
                    >
                      
                      {/* Visual Stamp / Live Indicator */}
                      <div className="absolute top-4 right-4 text-[9px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 border border-emerald-250 px-2 py-0.5 rounded-full flex items-center gap-1.5">
                        <CheckCircle2 size={10} />
                        Pre-Print Verified
                      </div>

                      <div className="space-y-10">
                        
                        {/* MIDNIGHT HEADER BAND */}
                        <div className="bg-[#0f172a] -mx-12 -mt-12 p-8 text-white flex justify-between items-center rounded-t-sm">
                          <div className="space-y-1">
                            <h4 className="text-xl font-black tracking-tight uppercase">{companyInfo.name.toUpperCase()}</h4>
                            <p className="text-[10px] font-bold text-slate-300 tracking-widest">FACTURA COMERCIAL</p>
                          </div>
                          <div className="text-right leading-tight">
                            <h4 className="text-lg font-mono font-extrabold text-[#B8791A]">
                              {inv.invoiceNumber}
                            </h4>
                            <div className="text-[10px] text-slate-300 font-semibold space-y-0.5 mt-1">
                              <div>Data: {invoiceDateFormatted}</div>
                              <div>Vencimento: {dueDateFormatted}</div>
                            </div>
                          </div>
                        </div>

                        {/* ISSUER & CLIENT COLUMNS */}
                        <div className="grid grid-cols-2 gap-8 border-b border-slate-100 pb-8">
                          {/* Company / Issuer Data */}
                          <div className="space-y-3.5">
                            <h5 className="text-[10px] font-black text-slate-400 tracking-widest uppercase">
                              EMISSOR / VENDEDOR:
                            </h5>
                            <div className="text-xs space-y-1 font-semibold text-slate-600">
                              <p className="text-sm font-black text-slate-900">{companyInfo.name}</p>
                              <p>{companyInfo.address}</p>
                              <p>Cel: {companyInfo.phone}</p>
                              <p>Email: {companyInfo.email}</p>
                              <p className="text-slate-900 pt-1 font-bold">NUIT: {companyInfo.nuit}</p>
                            </div>
                          </div>

                          {/* Client details */}
                          <div className="space-y-3.5 pl-4 border-l border-slate-100">
                            <h5 className="text-[10px] font-black text-blue-600 tracking-widest uppercase">
                              FACTURADO A (CLIENTE):
                            </h5>
                            <div className="text-xs space-y-1 font-semibold text-slate-600">
                              <p className="text-sm font-black text-slate-900">{nameOfCustomer}</p>
                              <p>Endereço: {addressOfCustomer || 'Moçambique'}</p>
                              {phoneOfCustomer && <p>Tel: {phoneOfCustomer}</p>}
                              {emailOfCustomer && <p>Email: {emailOfCustomer}</p>}
                            </div>
                          </div>
                        </div>

                        {/* ITEMS TABLE */}
                        <div className="space-y-3">
                          <h5 className="text-[10px] font-black text-slate-400 tracking-widest uppercase">
                            DISCRIMINAÇÃO DOS ARTIGOS E PREÇOS
                          </h5>
                          
                          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                            <table className="w-full text-left border-collapse text-xs">
                              <thead>
                                <tr className="bg-[#0f172a] text-white">
                                  <th className="p-4 font-black">Produto</th>
                                  <th className="p-4 font-black text-center w-20">Qtd</th>
                                  <th className="p-4 font-black text-right w-36">Preço/Unit</th>
                                  <th className="p-4 font-black text-right w-40">Total ({currency})</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                                {(inv.items || []).map((item: any, i: number) => {
                                  const price = Number(item.price || item.onlinePrice || 0);
                                  const qty = Number(item.quantity || 1);
                                  return (
                                    <tr key={i} className={cn(
                                      "even:bg-slate-50/55 hover:bg-slate-100/30 transition-colors",
                                      item.reverted && "bg-rose-50/10 opacity-60 line-through decoration-rose-500"
                                    )}>
                                      <td className="p-4 font-bold text-slate-900">
                                        <span data-no-translate="true" translate="no" className="no-translate notranslate">{item.name || item.description || 'Artigo'}</span>
                                        {item.reverted && <span className="ml-1.5 px-1.5 py-0.5 bg-rose-100 text-rose-700 text-[8px] font-black rounded uppercase tracking-wider">REVERTIDO</span>}
                                        {Number(item.discount || 0) > 0 && !item.reverted && <span className="ml-2 px-1.5 py-0.5 bg-amber-50 text-amber-700 text-[10px] font-black rounded uppercase">Desc. {item.discount}%</span>}
                                      </td>
                                      <td className="p-4 text-center font-mono text-slate-600 font-bold">{qty}</td>
                                      <td className="p-4 text-right font-mono font-bold">{price.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} MT</td>
                                      <td className="p-4 text-right font-mono font-black text-slate-900">
                                        {item.reverted ? '0,00 MT' : ((price * qty) * (1 - Number(item.discount || 0) / 100)).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} MT
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* FINANCIAL CALCULATIONS & BANKING */}
                        <div className="grid grid-cols-2 gap-8 pt-4">
                          {/* Left Info: Payment details */}
                          <div className="space-y-3.5 bg-slate-50/70 p-5 rounded-2xl border border-slate-100">
                            <h6 className="text-[10px] font-black text-slate-650 tracking-widest uppercase">
                              INSTRUÇÕES DE PAGAMENTO:
                            </h6>
                            <div className="text-[11px] text-slate-500 space-y-1 leading-relaxed">
                              <p className="font-bold text-slate-700">Favor efetuar transferência para o Banco: BIM / BCI / Mpesa.</p>
                              <p className="font-semibold">Mpesa: <span className="font-black text-slate-950">+258 84 000 0000</span></p>
                              <p className="font-semibold">Conta BIM: <span className="font-black text-slate-950">123456789</span></p>
                              <p className="text-slate-400 font-mono mt-2 text-[9px]">Ref: Fatura {inv.invoiceNumber}</p>
                            </div>
                          </div>

                          {/* Right Info: Accounting box */}
                          <div className="space-y-3.5 border border-slate-150 p-6 rounded-2xl bg-white max-w-sm ml-auto w-full">
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-400 uppercase font-black tracking-wider text-[10px]">Subtotal:</span>
                              <span className="font-mono font-bold text-slate-800">{subtotalAmount.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} MT</span>
                            </div>
                            
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-400 uppercase font-black tracking-wider text-[10px]">IVA ({inv.taxRate !== undefined ? inv.taxRate : 17}%):</span>
                              <span className="font-mono font-bold text-slate-800">{taxAmount.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} MT</span>
                            </div>

                            {Number(inv.discountRate || 0) > 0 && (
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-amber-600 uppercase font-black tracking-wider text-[10px]">Desconto Geral:</span>
                                <span className="font-mono font-black text-amber-600">-{inv.discountRate}%</span>
                              </div>
                            )}

                            <div className="h-px bg-slate-100 my-2" />

                            <div className="flex justify-between items-center bg-[#0f172a] p-3 -mx-4 rounded-xl text-white">
                              <span className="uppercase font-black tracking-widest text-[11px] text-slate-300">TOTAL FACTURA:</span>
                              <span className="font-mono font-black text-lg text-emerald-400">
                                {grandTotalAmount.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} MT
                              </span>
                            </div>
                          </div>
                        </div>

                      </div>

                      {/* FOOTER SIG & WATERMARK */}
                      <div className="mt-16 pt-8 border-t border-slate-200">
                        <div className="flex justify-between items-end">
                          <div className="flex flex-col items-center gap-1">
                            <div className="w-40 border-b border-dashed border-slate-300 my-1 h-10" />
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Assinatura Cliente</span>
                          </div>
                          
                          <div className="text-right text-[10px] text-slate-400 font-semibold space-y-0.5 max-w-xs leading-tight">
                            <p className="font-extrabold uppercase text-slate-600">{companyInfo.name}</p>
                            <p>Obrigado pela sua preferência!</p>
                            <p className="text-[9px] font-mono text-slate-300">Gerado digitalmente e em conformidade</p>
                          </div>
                        </div>
                      </div>

                    </div>
                  ) : (
                    /* ================== COMPACT THERMAL RECEIPT PREVIEW ================== */
                    <div 
                      id="preview-thermal-ticket"
                      className={cn(
                        "bg-[#FFFFFE] text-[#1E293B] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.6)] border border-slate-350 flex flex-col rounded-md font-mono select-text transition-all",
                        previewFormat === 'thermal_58mm' ? "w-[240px] text-[10px] p-3.5 gap-4" : "w-[320px] text-[11px] p-6 gap-6"
                      )}
                    >
                      
                      {/* Header */}
                      <div className="text-center space-y-1">
                        <h4 className={cn("font-black tracking-widest uppercase", previewFormat === 'thermal_58mm' ? "text-xs" : "text-base")}>{companyInfo.name.toUpperCase()}</h4>
                        <p className={cn("uppercase font-bold text-slate-500", previewFormat === 'thermal_58mm' ? "text-[8px]" : "text-[10px]")}>Talão {previewFormat === 'thermal_58mm' ? 'Térmico 58mm' : 'Térmico 80mm'}</p>
                      </div>

                      {/* Metadata */}
                      <div className={cn("space-y-1 border-b border-dashed border-slate-300 pb-3 font-semibold text-slate-705 leading-none", previewFormat === 'thermal_58mm' ? "text-[9px]" : "text-[11px]")}>
                        <p>Nº Factura: #{inv.invoiceNumber}</p>
                        <p>Data: {invoiceDateFormatted}</p>
                        <p>Vendedor: {inv.createdByName || 'Sabush Admin'}</p>
                        <p>NUIT Emissor: {companyInfo.nuit}</p>
                      </div>

                      {/* Client Info snippet */}
                      <div className={cn("space-y-1 text-slate-705 border-b border-dashed border-slate-300 pb-3 leading-none", previewFormat === 'thermal_58mm' ? "text-[9px]" : "text-[11px]")}>
                        <p className="font-bold text-slate-900">Cliente: {nameOfCustomer.toUpperCase()}</p>
                        {phoneOfCustomer && <p>Tel: {phoneOfCustomer}</p>}
                      </div>

                      {/* Columns headers */}
                      <div className={cn("font-bold text-slate-500 flex justify-between border-b border-slate-200 pb-1 leading-none", previewFormat === 'thermal_58mm' ? "text-[8px]" : "text-[10px]")}>
                        <span>PRODUTO (QTD x UNIT.)</span>
                        <span>TOTAL</span>
                      </div>

                      {/* Items */}
                      <div className={cn("space-y-2.5", previewFormat === 'thermal_58mm' ? "text-[9px] gap-2" : "text-[11px]")}>
                        {(inv.items || []).map((item: any, i: number) => {
                          const price = Number(item.price || item.onlinePrice || 0);
                          const qty = Number(item.quantity || 1);
                          return (
                            <div key={i} className={cn(
                              "leading-tight space-y-0.5 text-left",
                              item.reverted && "opacity-50 line-through"
                            )}>
                              <div data-no-translate="true" translate="no" className="font-extrabold text-[#0f172a] truncate no-translate notranslate">
                                {item.name || item.description || 'Artigo'}
                                {item.reverted && <span className="text-[8px] text-rose-600 ml-1 font-black leading-none">[REVERTIDO]</span>}
                              </div>
                              <div className="flex justify-between text-slate-600 font-semibold font-mono">
                                <span>{qty}x @ {price.toLocaleString('pt-MZ')} MT</span>
                                <span className="font-black text-slate-900">{item.reverted ? '0 MT' : (price * qty).toLocaleString('pt-MZ') + ' MT'}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Calculations */}
                      <div className={cn("border-t border-dashed border-slate-300 pt-3 space-y-1.5 text-slate-705", previewFormat === 'thermal_58mm' ? "text-[9px]" : "text-[11px]")}>
                        <div className="flex justify-between">
                          <span>SUBTOTAL:</span>
                          <span>{subtotalAmount.toLocaleString('pt-MZ')} MT</span>
                        </div>
                        <div className="flex justify-between">
                          <span>IVA ({inv.taxRate !== undefined ? inv.taxRate : 17}%):</span>
                          <span>{taxAmount.toLocaleString('pt-MZ')} MT</span>
                        </div>
                        <div className="flex justify-between font-black text-slate-900 border-t border-slate-200 pt-2.5">
                          <span>TOTAL GERAL:</span>
                          <span className={previewFormat === 'thermal_58mm' ? "text-xs font-black text-emerald-600" : "text-sm text-emerald-600"}>{grandTotalAmount.toLocaleString('pt-MZ')} MT</span>
                        </div>
                      </div>

                      {/* Thank you */}
                      <div className={cn("text-center font-bold text-slate-500 border-t border-slate-250 pt-4 leading-relaxed", previewFormat === 'thermal_58mm' ? "text-[8px]" : "text-[10px]")}>
                        <p>Mpesa: +258 84 000 0000</p>
                        <p className="mt-1 leading-snug">Obrigado pela sua preferência!</p>
                        <p className="text-[7px] tracking-widest text-slate-300 mt-2">SABUSH ERP v3.1</p>
                      </div>

                    </div>
                  )}
                </div>
              </div>

              {/* Right Side: ERP Control Panel / Sidebar */}
              <div className="w-full md:w-[380px] bg-[#0E1325] border-t md:border-t-0 md:border-l border-[#16253B] overflow-y-auto p-5 space-y-6 flex flex-col shrink-0 text-left text-slate-200 custom-scrollbar font-sans">
                
                <div className="space-y-5 flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase text-[#8FB0AC] tracking-widest flex items-center gap-1.5">
                      <span>🛠️ Gestão de Fatura</span>
                    </h4>
                    {getStatusBadge(inv.status)}
                  </div>

                  {/* Summary Box */}
                  <div className="bg-[#0C2624] rounded-xl p-4 border border-[#16253B] space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">Total Fatura:</span>
                      <span className="font-mono font-black text-white">{grandTotalAmount.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} MT</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">Pendente/Dívida:</span>
                      <span className={cn("font-mono font-black", (inv.outstandingBalance || 0) > 0 ? "text-amber-400" : "text-emerald-400")}>
                        {Number(inv.outstandingBalance || 0).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} MT
                      </span>
                    </div>
                    {inv.cancelReason && (
                      <div className="text-[11px] text-rose-400 bg-rose-950/20 border border-rose-900/30 p-2.5 rounded-lg mt-2 font-semibold">
                        ⚠️ Cancelado: {inv.cancelReason}
                      </div>
                    )}
                  </div>

                  {/* RESTORE / CANCEL BUTTONS */}
                  {inv.status !== 'cancelled' && inv.status !== 'paid' && (
                    <button
                      type="button"
                      onClick={() => {
                        setCancellingInvoiceId(inv.id);
                        setCancelReason('Erro de lançamento');
                        setCustomCancelReason('');
                        setCancelModalOpen(true);
                      }}
                      className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 font-black text-xs text-center uppercase tracking-widest text-white rounded-xl cursor-pointer active:scale-98 transition-all flex items-center justify-center gap-2"
                    >
                      ❌ Cancelar Fatura
                    </button>
                  )}

                  {inv.status === 'paid' && (
                    <div className="text-[10px] bg-emerald-950/20 border border-emerald-920/40 text-emerald-400 p-3 rounded-xl font-bold leading-normal">
                      ℹ️ Esta fatura foi PAGA INTEGRALMENTE. Não é permitida nenhuma adição ou reversão de artigos de acordo com as regras comerciais.
                    </div>
                  )}

                  {inv.status === 'cancelled' && (
                    <div className="text-[10px] bg-purple-950/20 border border-purple-920/40 text-purple-400 p-3 rounded-xl font-bold leading-normal">
                      ℹ️ Esta fatura está CANCELADA. Nenhum ajuste de stock ou de valor é elegível.
                    </div>
                  )}

                  {/* ITEM REVERSAL (REVERTER ITEM) */}
                  <div className="space-y-2.5">
                    <h5 className="text-[11px] font-black uppercase text-[#8FB0AC] tracking-widest flex items-center gap-1.5">
                      <span>↩️ Reverter Artigos Individualmente</span>
                    </h5>
                    <p className="text-[10px] text-slate-400 font-medium">Devolve itens selecionados ao inventário, ajustando o valor total e o saldo.</p>
                    
                    <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                      {(inv.items || []).map((item: any, i: number) => {
                        const price = Number(item.price || item.onlinePrice || 0);
                        const qty = Number(item.quantity || 1);
                        return (
                          <div 
                            key={i} 
                            className={cn(
                              "bg-[#131936] p-2.5 rounded-xl border border-[#202951] flex items-center justify-between text-xs transition-opacity duration-250",
                              item.reverted && "opacity-50"
                            )}
                          >
                            <div className="flex-1 min-w-0 pr-2">
                              <p className={cn("font-bold text-slate-100 truncate", item.reverted && "line-through text-slate-500")}>
                                {item.name || item.description || 'Artigo'}
                              </p>
                              <p className="text-[10px] text-slate-400 font-mono font-medium">
                                {qty}x @ {price.toLocaleString('pt-MZ')} MT
                              </p>
                            </div>
                            
                            {item.reverted ? (
                              <span className="text-[9px] font-black uppercase text-rose-500 bg-rose-950/40 border border-rose-900/30 px-1.5 py-0.5 rounded shrink-0 font-sans">
                                Revertido
                              </span>
                            ) : (
                              inv.status !== 'paid' && inv.status !== 'cancelled' ? (
                                <button
                                  type="button"
                                  onClick={() => handleRevertItem(i)}
                                  className="text-[9px] font-black uppercase text-white bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded shrink-0 transition-all cursor-pointer hover:shadow-md font-sans"
                                >
                                  Reverter
                                </button>
                              ) : null
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* ADD PRODUCT TO EXISTING INVOICE (ADICIONAR ITEM) */}
                  {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                    <div className="space-y-3 pt-2 border-t border-[#16253B]">
                      <h5 className="text-[11px] font-black uppercase text-[#8FB0AC] tracking-widest">
                        ➕ Adicionar Artigo à Fatura
                      </h5>
                      <p className="text-[10px] text-slate-400 font-medium leading-tight">Adicione produtos do inventário imediatamente, atualizando o stock e saldo devedor.</p>
                      
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Pesquise por nome do produto..."
                          className="w-full px-3 py-2 bg-[#0C2624] border border-[#16253B] rounded-xl text-xs text-white placeholder-slate-450 focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                          value={invoiceItemSearch}
                          onChange={e => setInvoiceItemSearch(e.target.value)}
                        />
                      </div>

                      {invoiceItemSearch && (
                        <div className="bg-[#0C2624] border border-[#16253B] hover:shadow-2xl rounded-xl divide-y divide-[#16253B]/60 max-h-40 overflow-y-auto custom-scrollbar">
                          {filteredInvoiceItemSearchProducts
                            .map((p, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => {
                                  handleAddProductToExistingInvoice(p);
                                  setInvoiceItemSearch('');
                                }}
                                className="w-full p-2 text-left hover:bg-[#1D2748] transition-colors flex items-center justify-between text-[11px] cursor-pointer"
                              >
                                <div className="min-w-0 flex-1 pr-2">
                                  <p className="font-extrabold text-white truncate">{p.name}</p>
                                  <p className="text-[9px] text-slate-400 font-bold">Stock: {p.stockLevel || 0}</p>
                                </div>
                                <span className="font-mono font-black text-emerald-400 shrink-0">
                                  {Number(p.price || 0).toLocaleString('pt-MZ')} MT
                                </span>
                              </button>
                            ))
                          }
                          {filteredInvoiceItemSearchProducts.length === 0 && (
                            <p className="p-3 text-center text-[10px] text-slate-500 font-bold">Nenhum produto encontrado no Stock.</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* HISTÓRICO DE AMORTIZAÇÕES */}
                  <div className="pt-4 border-t border-[#16253B] space-y-3">
                    <h5 className="text-[11px] font-black uppercase text-[#8FB0AC] tracking-widest flex items-center gap-1.5">
                      <span>💰 Histórico de Amortizações</span>
                    </h5>
                    <p className="text-[10px] text-slate-400 font-medium">Lista de pagamentos e amortizações efetuadas para esta fatura.</p>
                    
                    {invoicePayments.length === 0 ? (
                      <div className="bg-[#0C2624] p-3 rounded-xl border border-[#16253B]/60 text-center text-[10px] text-slate-400 font-bold">
                        Nenhuma amortização efetuada ainda.
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                        {invoicePayments.map((pay: any, idx: number) => {
                          const payDate = pay.date ? formatDateInTimezone(new Date(pay.date), businessData?.timezone || profile?.timezone || 'Africa/Maputo') : 'N/A';
                          return (
                            <div key={pay.id || idx} className="bg-[#0C2624] p-3 rounded-xl border border-[#16253B]/60 space-y-2">
                              <div className="flex justify-between items-center text-xs">
                                <span className="font-extrabold text-white font-mono">
                                  #{pay.id ? pay.id.slice(-6).toUpperCase() : `PAG-${idx}`}
                                </span>
                                <span className="font-bold text-slate-400 font-mono text-[9px]">
                                  {payDate}
                                </span>
                              </div>
                              <div className="flex justify-between items-center">
                                <div>
                                  <span className="text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-bold uppercase">
                                    {pay.method === 'cash' ? 'Dinheiro' : pay.method === 'card' ? 'Cartão' : pay.method === 'mobile_money' ? 'M-Pesa/Emola' : pay.method === 'bank_transfer' ? 'Transf. Bancária' : (pay.method || '').toUpperCase()}
                                  </span>
                                  {pay.reference && (
                                    <p className="text-[9px] text-slate-400 truncate max-w-[150px] mt-1" title={pay.reference}>
                                      Ref: {pay.reference}
                                    </p>
                                  )}
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                  <span className="font-mono font-black text-emerald-400 text-xs">
                                    {pay.amount.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} MT
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      generatePaymentReceiptPDF(
                                        pay,
                                        nameOfCustomer,
                                        (inv.outstandingBalance || 0),
                                        companyInfo
                                      );
                                    }}
                                    className="text-[9px] font-black text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1 uppercase cursor-pointer"
                                  >
                                    <Download size={10} />
                                    <span>Recibo</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* AUDIT TIMELINE (RASTO DE AUDITORIA) */}
                  <div className="pt-4 border-t border-[#16253B] space-y-3">
                    <h5 className="text-[11px] font-black uppercase text-[#8FB0AC] tracking-widest flex items-center gap-1.5">
                      <span>📋 Rasto de Auditoria</span>
                    </h5>
                    
                    <div className="border-l border-[#1C4340] ml-2 pl-3.5 space-y-3 font-mono text-[9px] leading-relaxed max-h-44 overflow-y-auto custom-scrollbar">
                      {[
                        {
                          timestamp: inv.date || (inv.createdAt?.toDate ? inv.createdAt.toDate().toISOString() : new Date().toISOString()),
                          userEmail: inv.createdByName || inv.userEmail || 'Sistema',
                          actionType: 'EMISSÃO',
                          details: `Factura número ${inv.invoiceNumber} emitida para o cliente.`
                        },
                        ...(inv.auditTrail || [])
                      ].map((log: any, idx: number) => (
                        <div key={idx} className="relative">
                          {/* Circle indicator on the line */}
                          <div className={cn(
                            "absolute -left-[19.5px] top-1 w-2.5 h-2.5 rounded-full border-2 border-[#0E1325]",
                            log.actionType === 'EMISSÃO' ? "bg-emerald-500" :
                            log.actionType === 'CANCELLED' ? "bg-rose-500" :
                            log.actionType === 'ITEM_REVERTED' ? "bg-amber-500" : "bg-blue-500"
                          )} />
                          <div className="text-slate-400 font-bold">{new Date(log.timestamp).toLocaleString('pt-MZ')}</div>
                          <div className="text-white font-black uppercase text-[8px] tracking-wider text-blue-400">{log.actionType}</div>
                          <div className="text-slate-350 font-medium leading-tight">{log.details}</div>
                          <div className="text-slate-500 italic text-[7px]">por: {log.userEmail}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="text-[9px] text-[#8FB0AC]/40 font-mono text-center pt-4 select-none">
                  SABUSH ERP PRO • VISUALIZADOR SEGURO
                </div>

              </div>

            </div>

          </div>
        );
      })()}

      {/* Cancel Invoice Confirmation Modal with reasons and audit trail */}
      {cancelModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-[200] animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100 transform scale-100 transition-all">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-150 flex items-center justify-between">
              <div className="flex items-center gap-2 text-rose-600">
                <span className="p-2 bg-rose-55 text-rose-605 rounded-lg">
                  <X size={18} />
                </span>
                <h3 className="font-extrabold text-slate-800 text-sm">Cancelamento de Fatura</h3>
              </div>
              <button 
                type="button" 
                onClick={() => setCancelModalOpen(false)}
                className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 transition-all cursor-pointer font-extrabold text-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 font-sans text-left text-xs text-slate-705">
              <p className="text-slate-500 font-medium leading-relaxed">
                Tem a certeza absoluta de que deseja cancelar esta fatura? Todos os artigos não revertidos serão devolvidos ao stock imediatamente e a dívida do cliente será regularizada.
              </p>

              <div>
                <label className="block text-xs font-black uppercase text-slate-400 tracking-wider mb-1.5">
                  Motivo da Anulação <span className="text-rose-500">*</span>
                </label>
                <select
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none rounded-xl text-xs font-semibold text-slate-700 bg-white"
                >
                  <option value="Erro de lançamento">Erro de lançamento</option>
                  <option value="Fatura Duplicada">Fatura Duplicada</option>
                  <option value="Devolução total do cliente">Devolução total do cliente</option>
                  <option value="Acordo comercial anulado">Acordo comercial anulado</option>
                  <option value="Outro">Outro Motivo (Especificar)</option>
                </select>
              </div>

              {cancelReason === 'Outro' && (
                <div>
                  <label className="block text-xs font-black uppercase text-slate-400 tracking-wider mb-1.5">
                    Especificar Outro Motivo
                  </label>
                  <input 
                    type="text"
                    placeholder="Escreva o motivo detalhado do cancelamento..."
                    className="w-full px-3 py-2.5 border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none rounded-xl text-xs font-medium text-slate-800"
                    value={customCancelReason}
                    onChange={e => setCustomCancelReason(e.target.value)}
                  />
                </div>
              )}
            </div>

            <div className="bg-slate-50 px-6 py-4 border-t border-slate-150 flex items-center justify-end gap-3">
              <button 
                type="button"
                onClick={() => setCancelModalOpen(false)}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-700 bg-white hover:bg-slate-100 rounded-xl border border-slate-200 transition-all cursor-pointer"
              >
                Voltar
              </button>
              <button 
                type="button"
                onClick={() => {
                  const finalReason = cancelReason === 'Outro' ? customCancelReason : cancelReason;
                  if (!finalReason.trim()) {
                    toast.error("Por favor, preencha o motivo de cancelamento");
                    return;
                  }
                  if (cancellingInvoiceId) {
                    handleCancelInvoice(cancellingInvoiceId, finalReason);
                    setCancelModalOpen(false);
                  }
                }}
                className="px-5 py-2 text-xs font-black uppercase tracking-wider text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-lg shadow-rose-500/10"
              >
                <Check size={13} />
                <span>Confirmar Anulação</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Add Stock Modal */}
      {showAddStockModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <span>⚡ {addStockForm.existingProductId ? 'Repor Stock de Artigo' : 'Adicionar Novo Artigo ao Stock'}</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1 font-medium">
                  {addStockForm.existingProductId 
                    ? 'Aumente o inventário existente e selecione o artigo.' 
                    : 'Registe um novo artigo na base de dados de stock e selecione-o para a fatura.'}
                </p>
              </div>
              <button 
                onClick={() => setShowAddStockModal(false)}
                className="text-slate-400 hover:text-slate-600 font-extrabold text-sm p-1 hover:bg-slate-50 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-left">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-1">Nome do Artigo</label>
                <input 
                  type="text"
                  className="w-full p-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-sm bg-slate-50 read-only:opacity-80"
                  value={addStockForm.name}
                  onChange={e => setAddStockForm({...addStockForm, name: e.target.value})}
                  readOnly={!!addStockForm.existingProductId}
                  placeholder="Ex: Cimento 50kg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-1">Preço Consumidor (MT)</label>
                  <input 
                    type="number"
                    className="w-full p-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-sm"
                    value={addStockForm.price || ''}
                    onChange={e => setAddStockForm({...addStockForm, price: Number(e.target.value)})}
                    readOnly={!!addStockForm.existingProductId}
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-1">Preço de Custo (MT)</label>
                  <input 
                    type="number"
                    className="w-full p-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-sm"
                    value={addStockForm.costPrice || ''}
                    onChange={e => setAddStockForm({...addStockForm, costPrice: Number(e.target.value)})}
                    readOnly={!!addStockForm.existingProductId}
                    placeholder="0"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-1">
                  {addStockForm.existingProductId ? 'Quantidade a Adicionar ao Stock' : 'Quantidade Inicial em Stock'}
                </label>
                <input 
                  type="number"
                  className="w-full p-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-black text-sm text-center bg-amber-50 text-amber-950 border-amber-200"
                  value={addStockForm.stockLevel}
                  onChange={e => setAddStockForm({...addStockForm, stockLevel: Math.max(1, Number(e.target.value))})}
                  placeholder="10"
                />
                <p className="text-[10px] text-amber-700 italic mt-1 font-semibold">
                  *{addStockForm.existingProductId ? 'O nível atual será incrementado por este valor' : 'O novo artigo será registado com esta quantidade de entrada'}.
                </p>
              </div>

              {!addStockForm.existingProductId && (
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 tracking-wider mb-1">Categoria</label>
                  <input 
                    type="text"
                    className="w-full p-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-sm"
                    value={addStockForm.category}
                    onChange={e => setAddStockForm({...addStockForm, category: e.target.value})}
                    placeholder="Geral"
                  />
                </div>
              )}
            </div>

            {/* Live Pricing Summary Block */}
            {newInvoice.items.length > 0 && (() => {
              const itemDiscountSubtotal = newInvoice.items.reduce((sum, item) => {
                const discountVal = item.discount || 0;
                const amount = item.quantity * item.price;
                return sum + (amount - (amount * discountVal / 100));
              }, 0);
              const gDiscRate = newInvoice.discountRate || 0;
              const rawSubtotal = itemDiscountSubtotal * (1 - gDiscRate / 100);
              const tRate = newInvoice.taxRate ?? 0;
              const isInclusive = (newInvoice as any).taxInclusive !== false;
              const tax = isInclusive 
                ? rawSubtotal * (tRate / (100 + tRate)) 
                : rawSubtotal * (tRate / 100);
              const total = isInclusive 
                ? rawSubtotal 
                : rawSubtotal + tax;
              const subtotal = isInclusive 
                ? rawSubtotal - tax 
                : rawSubtotal;
              return (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col gap-4">
                  <div className="flex flex-col lg:flex-row justify-between items-center gap-4 w-full">
                    <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600 font-bold items-center flex-1">
                      <div>
                        Subtotal: <span className="text-slate-900 font-black">{subtotal.toLocaleString('pt-MZ')} MT</span>
                      </div>

                      {/* Overall Invoice Discount Input */}
                      <div className="flex items-center gap-1.5 bg-white p-1 rounded-lg border border-slate-100 shadow-xs">
                        <span className="pl-1 text-amber-600 font-black">Desc. Geral (%):</span>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          value={newInvoice.discountRate || 0}
                          onChange={e => {
                            const val = Math.max(0, Math.min(100, Number(e.target.value)));
                            setNewInvoice(prev => ({ ...prev, discountRate: isNaN(val) ? 0 : val }));
                          }}
                          className="w-10 p-0.5 border-0 text-center font-black focus:ring-0 outline-none text-slate-900 font-mono"
                        />
                        <span className="text-slate-400">%</span>
                      </div>

                      <div className="flex items-center gap-1.5 bg-white p-1 rounded-lg border border-slate-100 shadow-xs">
                        <span className="pl-1 text-slate-500">Imp. (%):</span>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          value={newInvoice.taxRate ?? 0}
                          onChange={e => {
                            const val = Number(e.target.value);
                            setNewInvoice(prev => ({ ...prev, taxRate: isNaN(val) ? 0 : val }));
                          }}
                          className="w-12 p-0.5 border-0 text-right font-black focus:ring-0 outline-none text-slate-900"
                        />
                        <span className="text-slate-400">%</span>
                        <button
                          type="button"
                          onClick={() => setNewInvoice(prev => ({ ...prev, taxInclusive: !(prev as any).taxInclusive }))}
                          className={cn(
                            "px-2 py-0.5 text-[11px] font-black rounded-md border transition-all cursor-pointer",
                            isInclusive 
                              ? "bg-emerald-50 text-emerald-600 border-emerald-200" 
                              : "bg-slate-100 text-slate-600 border-slate-200"
                          )}
                        >
                          {isInclusive ? "Incluso" : "Extra"}
                        </button>
                      </div>
                      <div>
                        Valor Imposto: <span className="text-slate-900 font-black">{tax.toLocaleString('pt-MZ')} MT</span>
                      </div>
                    </div>
                    <div className="text-right whitespace-nowrap">
                      <span className="text-xs text-slate-400 font-bold block uppercase tracking-wider">Total Geral</span>
                      <span className="text-2xl font-black text-blue-600">{total.toLocaleString('pt-MZ')} MT</span>
                    </div>
                  </div>

                  {/* INVOICE-WIDE OPTIONAL PRIVATE NOTES */}
                  <div className="w-full pt-3 border-t border-slate-200 flex flex-col md:flex-row items-center gap-3">
                    <span className="text-[11px] font-black uppercase text-slate-450 tracking-wider whitespace-nowrap">✍️ Observações da Fatura (Opcional):</span>
                    <input
                      type="text"
                      className="flex-1 p-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 placeholder-slate-350 outline-none focus:ring-2 focus:ring-blue-450"
                      placeholder="Adicione termos adicionais, acordos de pagamento, detalhes de entrega..."
                      value={newInvoice.notes || ''}
                      onChange={e => setNewInvoice(prev => ({ ...prev, notes: e.target.value }))}
                    />
                  </div>
                </div>
              );
            })()}

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
              <button 
                type="button"
                onClick={() => setShowAddStockModal(false)}
                className="px-4 py-2 border rounded-xl text-slate-600 font-bold text-xs uppercase tracking-wider hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button 
                type="button"
                onClick={handleQuickAddStock}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer active:scale-95 shadow-md flex items-center gap-1.5"
              >
                💾 Gravar e Selecionar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Customer Creation Modal */}
      {quickCustomerModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100 transform scale-100 transition-all">
            {/* Header */}
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                  <UserPlus size={18} />
                </span>
                <h3 className="font-bold text-slate-800 text-sm">🆕 Adicionar Novo Cliente</h3>
              </div>
              <button 
                type="button" 
                onClick={() => setQuickCustomerModalOpen(false)}
                className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 transition-all cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 font-sans">
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                Preencha os dados abaixo para cadastrar um novo cliente. Ele será selecionado automaticamente para a fatura de venda e poderá tomar créditos.
              </p>

              <div>
                <label className="block text-xs font-black uppercase text-slate-400 tracking-wider mb-1.5">
                  Nome Completo / Empresa <span className="text-rose-500">*</span>
                </label>
                <input 
                  type="text"
                  required
                  placeholder="Ex: João dos Santos ou Mercearia Aliança"
                  className="w-full px-3 py-2 border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none rounded-xl text-xs font-medium text-slate-800"
                  value={quickCustomerName}
                  onChange={e => setQuickCustomerName(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black uppercase text-slate-400 tracking-wider mb-1.5">
                    Contacto Telefónico
                  </label>
                  <input 
                    type="tel"
                    placeholder="Ex: 841234567"
                    className="w-full px-3 py-2 border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none rounded-xl text-xs font-medium text-slate-800 col-span-1"
                    value={quickCustomerPhone}
                    onChange={e => setQuickCustomerPhone(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase text-slate-400 tracking-wider mb-1.5">
                    Endereço de Email
                  </label>
                  <input 
                    type="email"
                    placeholder="cliente@exemplo.com"
                    className="w-full px-3 py-2 border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none rounded-xl text-xs font-medium text-slate-800 col-span-1"
                    value={quickCustomerEmail}
                    onChange={e => setQuickCustomerEmail(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-slate-400 tracking-wider mb-1.5">
                  Endereço / Localização
                </label>
                <textarea 
                  rows={2}
                  placeholder="Ex: Av. Eduardo Mondlane, Maputo"
                  className="w-full px-3 py-2 border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none rounded-xl text-xs font-medium text-slate-800 resize-none"
                  value={quickCustomerAddress}
                  onChange={e => setQuickCustomerAddress(e.target.value)}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3">
              <button 
                type="button"
                onClick={() => setQuickCustomerModalOpen(false)}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-700 bg-white hover:bg-slate-100 rounded-xl border border-slate-200 transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button 
                type="button"
                disabled={savingQuickCustomer}
                onClick={handleCreateQuickCustomer}
                className="px-5 py-2 text-xs font-black uppercase tracking-wider text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-lg shadow-blue-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingQuickCustomer ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>A Guardar...</span>
                  </>
                ) : (
                  <>
                    <Check size={13} />
                    <span>Gravar e Selecionar</span>
                  </>
                )}
              </button>
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
    </div>
  );
}
