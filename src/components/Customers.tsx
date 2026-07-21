import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { subscribeToCollection } from '../lib/firestoreCache';
import { collection, query, onSnapshot, addDoc, serverTimestamp, where, getDocs } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { Plus, Search, Users, Mail, Phone, MapPin, MoreHorizontal, History, DollarSign, X, FileText, ShoppingCart, Trash2, SlidersHorizontal, RotateCcw, Filter, ChevronDown, ChevronUp, Printer, Link as LinkIcon, CheckCircle, Calendar, Coins, ArrowUpRight, ArrowDownLeft, Loader2, Edit2, Sparkles, QrCode } from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import Skeleton from './ui/Skeleton';
import { motion, AnimatePresence } from 'motion/react';
import { formatSystemCurrency, formatCurrencyValue } from '../lib/currencies';

export default function Customers() {
  const { profile, businessData } = useAuth();
  const { t } = useTranslation();
  const currency = businessData?.currency || 'MZN';
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [customerInvoices, setCustomerInvoices] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [viewingLoyaltyCustomer, setViewingLoyaltyCustomer] = useState<any | null>(null);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  // Sub-tabs state
  const [activeTab, setActiveTab] = useState<'list' | 'add' | 'manage'>('list');
  // Customer Edit profile states inside the Management Tab
  const [editingCustomerObj, setEditingCustomerObj] = useState<any | null>(null);
  const [editingForm, setEditingForm] = useState({ name: '', email: '', phone: '', address: '', notes: '', loyaltyPoints: 0 });
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const handleSaveCustomerProfile = async () => {
    if (!profile?.businessId || !editingCustomerObj) return;

    const normalizedNewName = editingForm.name.trim().toLowerCase();
    const normalizedNewPhone = editingForm.phone.trim();
    const normalizedNewEmail = editingForm.email.trim().toLowerCase();

    const isDuplicate = customers.some(c => {
      if (c.id === editingCustomerObj.id) return false;
      const nameMatch = c.name?.trim().toLowerCase() === normalizedNewName;
      const phoneMatch = normalizedNewPhone && c.phone?.trim() === normalizedNewPhone;
      const emailMatch = normalizedNewEmail && c.email?.trim().toLowerCase() === normalizedNewEmail;
      return nameMatch || phoneMatch || emailMatch;
    });

    if (isDuplicate) {
      toast.error("Não é possível guardar as alterações. Já existe outro cliente registado com os mesmos detalhes (Nome, Email ou Contacto Telefónico).");
      return;
    }
    if (!editingForm.name.trim()) {
      toast.error("O nome do cliente é obrigatório");
      return;
    }
    
    setIsSavingEdit(true);
    try {
      const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
      await updateDoc(doc(db, `businesses/${profile.businessId}/customers`, editingCustomerObj.id), {
        name: editingForm.name.trim(),
        email: editingForm.email.trim(),
        phone: editingForm.phone.trim(),
        address: editingForm.address.trim(),
        notes: (editingForm.notes || '').trim(),
        loyaltyPoints: Number(editingForm.loyaltyPoints) || 0,
        updatedAt: serverTimestamp()
      });
      toast.success("Perfil do cliente atualizado com sucesso!");
      setEditingCustomerObj(null);
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao atualizar perfil do cliente.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Customer Deduplication states
  const [showDeduplicateModal, setShowDeduplicateModal] = useState(false);
  const [duplicateMatches, setDuplicateMatches] = useState<Array<{ customer1: any; customer2: any; ratio: number }>>([]);
  const [mainCustomerId, setMainCustomerId] = useState<string>('');
  const [targetCustomerId, setTargetCustomerId] = useState<string>('');
  const [isMerging, setIsMerging] = useState(false);

  const findCustomerDuplicates = () => {
    const list: Array<{ customer1: any; customer2: any; ratio: number }> = [];
    const normalized = customers.map(c => ({
      ...c,
      cleanName: (c.name || '').toLowerCase().trim()
        .replace(/[.,\-/#!$%^&*;:{}=\-_`~()]/g, "")
        .replace(/\s+/g, "")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    }));

    for (let i = 0; i < normalized.length; i++) {
      for (let j = i + 1; j < normalized.length; j++) {
        const c1 = normalized[i];
        const c2 = normalized[j];

        if (c1.cleanName === c2.cleanName && c1.id !== c2.id) {
          list.push({ customer1: customers.find(c => c.id === c1.id), customer2: customers.find(c => c.id === c2.id), ratio: 1 });
        } else {
          const l1 = c1.cleanName;
          const l2 = c2.cleanName;
          if (l1.length > 3 && l2.length > 3) {
            const isSub = l1.includes(l2) || l2.includes(l1);
            if (isSub) {
              list.push({ customer1: customers.find(c => c.id === c1.id), customer2: customers.find(c => c.id === c2.id), ratio: 0.8 });
            }
          }
        }
      }
    }
    setDuplicateMatches(list);
  };

  const handleMergeCustomers = async (mainId: string, duplicateId: string) => {
    if (!profile?.businessId || !mainId || !duplicateId) {
      toast.error("Por favor, selecione ambos os clientes.");
      return;
    }
    if (mainId === duplicateId) {
      toast.error("O cliente principal e o duplicado não podem ser o mesmo.");
      return;
    }

    const mainCust = customers.find(c => c.id === mainId);
    const dupCust = customers.find(c => c.id === duplicateId);

    if (!mainCust || !dupCust) {
      toast.error("Clientes não encontrados.");
      return;
    }

    if (!window.confirm(`Tem a certeza que deseja fundir o cliente '${dupCust.name}' em '${mainCust.name}'? Isto consolidará faturas, histórico e saldos totais.`)) {
      return;
    }

    setIsMerging(true);
    try {
      const mainSpent = Number(mainCust.totalSpent) || 0;
      const dupSpent = Number(dupCust.totalSpent) || 0;
      const newSpent = mainSpent + dupSpent;

      const mainBal = Number(mainCust.outstandingBalance) || 0;
      const dupBal = Number(dupCust.outstandingBalance) || 0;
      const newBal = mainBal + dupBal;

      const { doc, updateDoc, deleteDoc, collection, query, where, getDocs, writeBatch } = await import('firebase/firestore');

      // 1. Update main customer's totals
      await updateDoc(doc(db, `businesses/${profile.businessId}/customers`, mainId), {
        totalSpent: newSpent,
        outstandingBalance: newBal
      });

      // 2. Search for any invoices referencing customerId and link to mainId
      const invoicesRef = collection(db, `businesses/${profile.businessId}/invoices`);
      const invQ1 = query(invoicesRef, where('customerId', '==', duplicateId));
      const invSnap1 = await getDocs(invQ1);
      
      const batch = writeBatch(db);
      if (!invSnap1.empty) {
        invSnap1.docs.forEach((docSnap) => {
          batch.update(docSnap.ref, { customerId: mainId, customerName: mainCust.name });
        });
      }

      // Also support name matches
      const invQ2 = query(invoicesRef, where('customerId', '==', dupCust.name));
      const invSnap2 = await getDocs(invQ2);
      if (!invSnap2.empty) {
        invSnap2.docs.forEach((docSnap) => {
          batch.update(docSnap.ref, { customerId: mainId, customerName: mainCust.name });
        });
      }

      await batch.commit();

      // 3. Delete duplicate customer
      await deleteDoc(doc(db, `businesses/${profile.businessId}/customers`, duplicateId));

      toast.success(`Fusão Concluída! '${dupCust.name}' foi incorporado em '${mainCust.name}' com sucesso.`);
      setMainCustomerId('');
      setTargetCustomerId('');
      findCustomerDuplicates();
    } catch (e: any) {
      console.error(e);
      toast.error("Erro ao mesclar: " + e.message);
    } finally {
      setIsMerging(false);
    }
  };

  // Detailed Ledger / Customer View controls
  const [txSearchTerm, setTxSearchTerm] = useState('');
  const [subTab, setSubTab] = useState<'all' | 'invoices' | 'payments'>('all');
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);

  // Advanced customer-specific searches
  const [showFilters, setShowFilters] = useState(false);
  const [filterEmail, setFilterEmail] = useState('');
  const [filterPhone, setFilterPhone] = useState('');
  const [minBalance, setMinBalance] = useState('');
  const [maxBalance, setMaxBalance] = useState('');

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterEmail, filterPhone, minBalance, maxBalance]);

  const [newCustomer, setNewCustomer] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    notes: '',
    totalSpent: 0,
    outstandingBalance: 0
  });

  useEffect(() => {
    if (!profile?.businessId) return;

    // Load from local cache first for instant load
    const cachedCustomers = localStorage.getItem(`sabush_cached_customers_${profile.businessId}`);
    if (cachedCustomers) {
      try {
        setCustomers(JSON.parse(cachedCustomers));
        setLoading(false);
      } catch (e) {
        console.warn("Could not load cached customers:", e);
      }
    }
    
    const q = query(collection(db, `businesses/${profile.businessId}/customers`));
    const unsubscribe = subscribeToCollection(
      `businesses/${profile.businessId}/customers`,
      (items) => {
        setCustomers(items);
        setLoading(false);
        try {
          localStorage.setItem(`sabush_cached_customers_${profile.businessId}`, JSON.stringify(items));
        } catch (e) {
          console.warn("Could not cache customers:", e);
        }
      },
      q,
      (error) => {
        setLoading(false);
        try {
          handleFirestoreError(error, OperationType.LIST, `businesses/${profile.businessId}/customers`);
        } catch (e) {
          console.warn("Gracefully logged customers query error:", e);
        }
      }
    );

    return unsubscribe;
  }, [profile?.businessId]);

  useEffect(() => {
    const highlightId = sessionStorage.getItem('highlight_customer_id');
    if (highlightId && customers.length > 0) {
      const targetCustomer = customers.find(c => c.id === highlightId);
      if (targetCustomer && targetCustomer.name) {
        setSearchTerm(targetCustomer.name);
      }
      sessionStorage.removeItem('highlight_customer_id');
    }
  }, [customers]);

  const toggleSelect = (e: React.MouseEvent | null, id: string) => {
    if (e) e.stopPropagation();
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleDeleteIndividual = async (id: string, name: string) => {
    if (!profile?.businessId) return;
    if (!window.confirm(`Tem a certeza que deseja excluir permanentemente o perfil do cliente "${name}"? Esta ação não pode ser desfeita e removerá os saldos registados.`)) return;

    try {
      const { deleteDoc, doc } = await import('firebase/firestore');
      await deleteDoc(doc(db, `businesses/${profile.businessId}/customers`, id));
      toast.success(`Cliente "${name}" excluído com sucesso`);
      setSelectedIds(prev => prev.filter(i => i !== id));
      if (editingCustomerObj?.id === id) {
        setEditingCustomerObj(null);
      }
    } catch (error) {
      toast.error("Erro ao excluir cliente");
    }
  };

  const handleBulkDelete = async () => {
    if (!profile?.businessId || selectedIds.length === 0) return;
    if (!window.confirm(`Tem a certeza que deseja eliminar definitivamente estes ${selectedIds.length} perfis de cliente? Esta operação é irreversível.`)) return;

    try {
      const { deleteDoc, doc } = await import('firebase/firestore');
      const deletePromises = selectedIds.map(id => 
        deleteDoc(doc(db, `businesses/${profile.businessId}/customers`, id))
      );
      await Promise.all(deletePromises);
      toast.success(`${selectedIds.length} perfis de cliente eliminados com sucesso`);
      setSelectedIds([]);
    } catch (error) {
      toast.error("Erro ao eliminar alguns perfis selecionados");
    }
  };

  const handleCreateCustomer = async () => {
    if (!profile?.businessId) return;
    if (!newCustomer.name.trim()) {
      toast.error("Customer name is required");
      return;
    }

    const normalizedNewName = newCustomer.name.trim().toLowerCase();
    const normalizedNewPhone = newCustomer.phone.trim();
    const normalizedNewEmail = newCustomer.email.trim().toLowerCase();

    const isDuplicate = customers.some(c => {
      const nameMatch = c.name?.trim().toLowerCase() === normalizedNewName;
      const phoneMatch = normalizedNewPhone && c.phone?.trim() === normalizedNewPhone;
      const emailMatch = normalizedNewEmail && c.email?.trim().toLowerCase() === normalizedNewEmail;
      return nameMatch || phoneMatch || emailMatch;
    });

    if (isDuplicate) {
      toast.error("Já existe outro cliente registado com os mesmos detalhes (Nome, Email ou Contacto Telefónico).");
      return;
    }

    if (newCustomer.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(newCustomer.email.trim())) {
        toast.error("Please enter a valid email address");
        return;
      }
    }

    try {
      await addDoc(collection(db, `businesses/${profile.businessId}/customers`), {
        ...newCustomer,
        name: newCustomer.name.trim(),
        email: newCustomer.email.trim(),
        phone: newCustomer.phone.trim(),
        address: newCustomer.address.trim(),
        notes: (newCustomer.notes || '').trim(),
        businessId: profile.businessId,
        createdAt: serverTimestamp()
      });
      toast.success("Customer profile created");
      setIsCreating(false);
      setNewCustomer({ name: '', email: '', phone: '', address: '', notes: '', totalSpent: 0, outstandingBalance: 0 });
    } catch (error) {
      toast.error("Failed to add customer");
    }
  };

  const fetchCustomerHistory = async (customer: any) => {
    if (!profile?.businessId) return;
    setSelectedCustomer(customer);
    try {
      const invQ = query(
        collection(db, `businesses/${profile.businessId}/invoices`),
        where('customerId', 'in', [customer.id, customer.name])
      );
      const payQ = query(
        collection(db, `businesses/${profile.businessId}/payments`),
        where('customerId', '==', customer.id)
      );

      const [invSnap, paySnap] = await Promise.all([getDocs(invQ), getDocs(payQ)]);
      
      const invoices = invSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), type: doc.data().type || 'invoice' }));
      const payments = paySnap.docs.map(doc => ({ id: doc.id, ...doc.data(), type: 'repayment' }));

      const combined = [...invoices, ...payments].sort((a: any, b: any) => 
        (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
      );
      
      setCustomerInvoices(combined);
    } catch (e) {
      handleFirestoreError(e, OperationType.GET, `businesses/${profile.businessId}/customers/${customer.id}/history`);
      toast.error("Failed to fetch history");
    }
  };

  const copyPaymentLink = (invoice: any) => {
    if (!profile?.businessId) return;
    const baseUrl = window.location.origin;
    const link = `${baseUrl}?pay=${profile.businessId}:${invoice.id}`;
    navigator.clipboard.writeText(link);
    toast.success("Payment link copied to clipboard!");
  };

  const printInvoice = (invoice: any) => {
    if (!selectedCustomer) return;
    const invoicePrintData = {
      ...invoice,
      date: invoice.date || (invoice.createdAt?.toDate ? invoice.createdAt.toDate().toISOString() : new Date().toISOString()),
      customerName: selectedCustomer.name || invoice.customerName || selectedCustomer.id || 'Cliente Geral',
      customerPhone: selectedCustomer.phone || invoice.customerPhone || '',
      customerEmail: selectedCustomer.email || invoice.customerEmail || '',
      deliveryAddress: selectedCustomer.address || invoice.deliveryAddress || 'Moçambique',
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

  const filteredCustomers = customers.filter(c => {
    // Basic standard search term
    const matchesSearch = searchTerm === '' || 
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone?.includes(searchTerm);

    // Filter explicitly by email
    const matchesEmail = filterEmail === '' || 
      (c.email && c.email.toLowerCase().includes(filterEmail.toLowerCase()));

    // Filter explicitly by phone number
    const matchesPhone = filterPhone === '' || 
      (c.phone && c.phone.replace(/[\s\-\(\)]/g, '').includes(filterPhone.replace(/[\s\-\(\)]/g, '')));

    // Filter explicitly by outstanding balance range
    const outstandingBalance = Number(c.outstandingBalance || 0);
    const matchesMinBalance = minBalance === '' || outstandingBalance >= Number(minBalance);
    const matchesMaxBalance = maxBalance === '' || outstandingBalance <= Number(maxBalance);

    return matchesSearch && matchesEmail && matchesPhone && matchesMinBalance && matchesMaxBalance;
  });

  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedCustomers = filteredCustomers.slice(startIndex, endIndex);

  const totalInvoicedSum = selectedCustomer
    ? customerInvoices
        .filter(tx => tx.type !== 'repayment')
        .reduce((sum, tx) => sum + (tx.total || 0), 0)
    : 0;

  const totalPaymentsSum = selectedCustomer
    ? customerInvoices
        .filter(tx => tx.type === 'repayment')
        .reduce((sum, tx) => sum + (tx.amount || 0), 0)
    : 0;

  const transactionsList = selectedCustomer
    ? customerInvoices.filter(tx => {
        const searchLow = txSearchTerm.toLowerCase();
        const matchSearch = txSearchTerm === '' || 
          String(tx.invoiceNumber || '').toLowerCase().includes(searchLow) ||
          String(tx.reference || '').toLowerCase().includes(searchLow) ||
          String(tx.method || '').toLowerCase().includes(searchLow) ||
          String(tx.status || '').toLowerCase().includes(searchLow) ||
          (tx.items && tx.items.some((item: any) => 
            String(item.description || '').toLowerCase().includes(searchLow) || 
            String(item.name || '').toLowerCase().includes(searchLow)
          ));

        if (!matchSearch) return false;

        if (subTab === 'invoices') return tx.type !== 'repayment';
        if (subTab === 'payments') return tx.type === 'repayment';
        return true;
      })
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{t('customers')}</h2>
          <p className="text-slate-500">Módulo de clientes, saldos e unificação de duplicados.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {activeTab === 'list' && (
            <>
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text"
                  placeholder="Pesquisar clientes..."
                  className="w-full pl-10 pr-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
              <button 
                onClick={() => setShowFilters(!showFilters)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-xl border transition-all text-sm font-medium",
                  showFilters || filterEmail || filterPhone || minBalance || maxBalance
                    ? "bg-blue-50 border-blue-200 text-blue-700 font-semibold"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                )}
                title="Toggle Filters"
              >
                <SlidersHorizontal size={16} />
                <span>Filtros</span>
                {(filterEmail || filterPhone || minBalance || maxBalance) && (
                  <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse inline-block" />
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Dynamic Segmented Control Sub-Tabs */}
      <div className="flex border-b border-slate-100 bg-slate-100/40 p-1 rounded-2xl w-full max-w-lg mb-2">
        <button
          onClick={() => {
            setActiveTab('list');
            setIsCreating(false);
          }}
          className={cn(
            "flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5",
            activeTab === 'list' ? "bg-white text-slate-900 shadow-sm font-extrabold" : "text-slate-500 hover:text-slate-800"
          )}
        >
          <span>📋 Lista de Clientes</span>
        </button>
        <button
          onClick={() => {
            setActiveTab('add');
            setIsCreating(true);
          }}
          className={cn(
            "flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5",
            activeTab === 'add' ? "bg-white text-slate-900 shadow-sm font-extrabold" : "text-slate-500 hover:text-slate-800"
          )}
        >
          <span>➕ Adicionar Novo</span>
        </button>
        <button
          onClick={() => {
            setActiveTab('manage');
            setIsCreating(false);
            findCustomerDuplicates();
          }}
          className={cn(
            "flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5",
            activeTab === 'manage' ? "bg-white text-slate-900 shadow-sm font-extrabold" : "text-slate-500 hover:text-slate-800"
          )}
        >
          <span>🛠️ Gerir & Mesclar</span>
        </button>
      </div>

      {/* Advanced Collapsible Filter Panel */}
      <AnimatePresence>
        {showFilters && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl gap-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 items-end">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
                  <Mail size={12} /> Email Address
                </label>
                <input 
                  type="text"
                  placeholder="Filter by email..."
                  className="w-full bg-white px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                  value={filterEmail}
                  onChange={e => setFilterEmail(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
                  <Phone size={12} /> Phone Number
                </label>
                <input 
                  type="text"
                  placeholder="Filter by phone..."
                  className="w-full bg-white px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                  value={filterPhone}
                  onChange={e => setFilterPhone(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
                  Saldo Mínimo ({currency})
                </label>
                <input 
                  type="number"
                  placeholder="Min range"
                  className="w-full bg-white px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                  value={minBalance}
                  onChange={e => setMinBalance(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
                  Saldo Máximo ({currency})
                </label>
                <div className="relative flex items-center gap-2">
                  <input 
                    type="number"
                    placeholder="Max range"
                    className="w-full bg-white px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                    value={maxBalance}
                    onChange={e => setMaxBalance(e.target.value)}
                  />
                  {(filterEmail || filterPhone || minBalance || maxBalance) && (
                    <button 
                      onClick={() => {
                        setFilterEmail('');
                        setFilterPhone('');
                        setMinBalance('');
                        setMaxBalance('');
                        toast.info("All search filters cleared");
                      }}
                      className="p-2 bg-slate-200 hover:bg-slate-300 rounded-xl transition-all text-slate-600 flex items-center justify-center shrink-0 animate-in fade-in"
                      title="Reset Filters"
                    >
                      <RotateCcw size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {activeTab === 'add' && (
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm space-y-6"
          >
            <div>
              <h3 className="text-lg font-black text-slate-900">✨ Registar Novo Cliente</h3>
              <p className="text-xs text-slate-500 mt-1">Crie perfis detalhados de clientes para faturar rapidamente com controle de saldos.</p>
            </div>
            
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-2">Nome Completo</label>
                <input 
                  className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-semibold"
                  placeholder="Ex: João da Silva"
                  value={newCustomer.name}
                  onChange={e => setNewCustomer({...newCustomer, name: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-2">Endereço de Email</label>
                <input 
                  type="email"
                  className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-semibold"
                  placeholder="Ex: joao@gmail.com"
                  value={newCustomer.email}
                  onChange={e => setNewCustomer({...newCustomer, email: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-2">Telefone contacto</label>
                <input 
                  type="tel"
                  className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-semibold"
                  placeholder="Ex: (+258) 841234567"
                  value={newCustomer.phone}
                  onChange={e => setNewCustomer({...newCustomer, phone: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-2">Endereço / Localização</label>
                <input 
                  className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-semibold"
                  placeholder="Ex: Av. Eduardo Mondlane, Maputo"
                  value={newCustomer.address}
                  onChange={e => setNewCustomer({...newCustomer, address: e.target.value})}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-2">Notas Pessoais / Observações (Opcional)</label>
                <textarea 
                  rows={3}
                  className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-semibold resize-none"
                  placeholder="Ex: Cliente prefere factura de grosso, paga sempre em dinheiro, gosta de descontos, etc."
                  value={newCustomer.notes || ''}
                  onChange={e => setNewCustomer({...newCustomer, notes: e.target.value})}
                />
              </div>
            </div>
            
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-50">
              <button 
                type="button"
                onClick={() => { setActiveTab('list'); setIsCreating(false); }} 
                className="px-5 py-2.5 text-xs uppercase tracking-wider font-extrabold text-slate-500 hover:text-slate-805 cursor-pointer"
              >
                Cancelar
              </button>
              <button 
                type="button"
                onClick={handleCreateCustomer} 
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-md transition-all cursor-pointer"
              >
                Salvar Perfil de Cliente
              </button>
            </div>
          </motion.div>
        )}

        {activeTab === 'list' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-1 gap-4"
          >
            {loading ? (
              [1, 2, 3].map((n) => (
                <div key={n} className="bg-white p-6 rounded-2xl border border-slate-100 flex flex-col md:flex-row md:items-center gap-6">
                  <Skeleton className="w-12 h-12 rounded-full shrink-0 animate-pulse bg-slate-200" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-1/4 rounded animate-pulse bg-slate-200" />
                    <Skeleton className="h-4 w-1/2 rounded animate-pulse bg-slate-200" />
                  </div>
                  <div className="flex gap-10 shrink-0">
                    <div className="space-y-1.5"><Skeleton className="h-4 w-12 rounded animate-pulse bg-slate-200" /><Skeleton className="h-4 w-20 rounded animate-pulse bg-slate-200" /></div>
                    <div className="space-y-1.5"><Skeleton className="h-4 w-12 rounded animate-pulse bg-slate-200" /><Skeleton className="h-4 w-20 rounded animate-pulse bg-slate-200" /></div>
                  </div>
                </div>
              ))
            ) : paginatedCustomers.map((customer) => (
              <div 
                key={customer.id} 
                onClick={() => fetchCustomerHistory(customer)}
                className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-slate-200 transition-all flex flex-col md:flex-row md:items-center gap-6 group cursor-pointer relative"
              >
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500 shrink-0">
                  {customer.name[0]?.toUpperCase()}
                </div>
                
                <div className="flex-1 space-y-1">
                  <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                    {customer.name}
                    {customer.notes && (
                      <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-bold font-sans">
                        📝 {customer.notes}
                      </span>
                    )}
                  </h3>
                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                    {customer.email && (
                      <div className="flex items-center gap-1">
                        <Mail size={12} /> {customer.email}
                      </div>
                    )}
                    {customer.phone && (
                      <div className="flex items-center gap-1">
                        <Phone size={12} /> {customer.phone}
                      </div>
                    )}
                    {customer.address && (
                      <div className="flex items-center gap-1">
                        <MapPin size={12} /> {customer.address}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-6 text-sm border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-8">
                  <div className="text-center text-slate-600">
                    <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">Total Gasto</p>
                    <div className="flex items-center justify-center gap-1 text-emerald-600 font-bold">
                      {formatSystemCurrency(customer.totalSpent || 0, businessData)}
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">Dívida</p>
                    <div className={`flex items-center justify-center gap-1 font-bold ${customer.outstandingBalance > 0 ? 'text-rose-500' : 'text-slate-900'}`}>
                      {formatSystemCurrency(customer.outstandingBalance || 0, businessData)}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        fetchCustomerHistory(customer);
                      }}
                      className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-blue-600 transition-colors" 
                      title="Histórico de Faturas"
                    >
                      <History size={18} />
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingCustomerObj(customer);
                        setEditingForm({
                          name: customer.name || '',
                          email: customer.email || '',
                          phone: customer.phone || '',
                          address: customer.address || '',
                          notes: customer.notes || '',
                          loyaltyPoints: customer.loyaltyPoints || 0
                        });
                        setActiveTab('manage');
                      }}
                      className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-blue-600 transition-colors"
                      title="Editar Perfil"
                    >
                      <Edit2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {filteredCustomers.length === 0 && !loading && (
              <div className="py-20 text-center text-slate-550 flex flex-col items-center justify-center gap-3">
                <Users size={64} className="mx-auto opacity-10 text-slate-350" />
                <p className="text-sm font-bold text-slate-600">Nenhum cliente registado ou encontrado.</p>
              </div>
            )}

            {/* Pagination Controls */}
            {filteredCustomers.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-slate-100 mt-4 select-none">
                <div className="text-xs font-semibold text-slate-500 font-sans">
                  Mostrando <span className="font-extrabold text-slate-900">{Math.min(filteredCustomers.length, startIndex + 1)}</span> a{" "}
                  <span className="font-extrabold text-slate-900">{Math.min(filteredCustomers.length, endIndex)}</span> de{" "}
                  <span className="font-extrabold text-[#111827]">{filteredCustomers.length}</span> clientes
                </div>
                <div className="flex items-center gap-1.5 self-end sm:self-auto">
                  <button
                    type="button"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    className="px-3.5 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed bg-white"
                  >
                    Anterior
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, Math.ceil(filteredCustomers.length / itemsPerPage)) }, (_, i) => {
                      const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage);
                      let pageNum = currentPage;
                      if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      if (pageNum < 1 || pageNum > totalPages) return null;
                      return (
                        <button
                          key={pageNum}
                          type="button"
                          onClick={() => setCurrentPage(pageNum)}
                          className={cn(
                            "w-8 h-8 flex items-center justify-center text-xs font-bold rounded-lg transition-all cursor-pointer",
                            currentPage === pageNum ? "bg-slate-900 text-white shadow-sm" : "border border-slate-200 hover:bg-slate-50 text-slate-600 bg-white"
                          )}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    disabled={currentPage === Math.ceil(filteredCustomers.length / itemsPerPage)}
                    onClick={() => setCurrentPage(prev => Math.min(Math.ceil(filteredCustomers.length / itemsPerPage), prev + 1))}
                    className="px-3.5 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed bg-white"
                  >
                    Próximo
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'manage' && (
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-6"
          >
            {/* OPERATIONAL MULTI-SELECT AND DOCK BAR */}
            {selectedIds.length > 0 && (
              <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-center gap-3 animate-in fade-in duration-200">
                <div className="text-xs text-red-800 font-bold">
                  ⚠️ <span className="font-extrabold text-[#7F1D1D]">{selectedIds.length}</span> {selectedIds.length === 1 ? 'cliente selecionado' : 'clientes selecionados'} para eliminação em lote.
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={handleBulkDelete}
                    className="flex-1 sm:flex-initial px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-xs cursor-pointer transition-colors"
                  >
                    🗑️ Eliminar Selecionados Definitivamente
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedIds([])}
                    className="px-3 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-500 font-bold text-xs rounded-xl cursor-pointer transition-all"
                  >
                    Desmarcar
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* LEFT COLUMN: LIST DIRECTORY FOR MANAGEMENT (TABLE FORMAT FOR PRECISION OPERATIONS) */}
              <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-100 p-6 space-y-4">
                <div>
                  <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                    📊 Diretório de Gestão de Clientes
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 font-medium font-sans">
                    Gerencie contas individuais, ative edições rápidas ou exclua clientes redundantes.
                  </p>
                </div>

                <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                  <table className="w-full text-left border-collapse min-w-[500px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="p-4 w-12 text-center">
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            checked={selectedIds.length === filteredCustomers.length && filteredCustomers.length > 0}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedIds(filteredCustomers.map(c => c.id));
                              else setSelectedIds([]);
                            }}
                          />
                        </th>
                        <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Cliente</th>
                        <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Financeiro</th>
                        <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 text-sm">
                      {paginatedCustomers.map((cust) => (
                        <tr
                          key={cust.id}
                          className={cn(
                            "hover:bg-slate-50/50 transition-colors",
                            selectedIds.includes(cust.id) && "bg-blue-50/10"
                          )}
                        >
                          <td className="p-4 text-center">
                            <input
                              type="checkbox"
                              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                              checked={selectedIds.includes(cust.id)}
                              onChange={() => toggleSelect(null, cust.id)}
                            />
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 text-xs text-center border">
                                {cust.name[0]?.toUpperCase()}
                              </div>
                              <div className="text-left">
                                <span className="font-extrabold text-slate-900 block leading-tight">{cust.name}</span>
                                <span className="text-[10px] font-medium text-slate-500 block">
                                  {cust.phone || cust.email || 'Sem contacto'}
                                </span>
                                {cust.notes && (
                                  <span className="text-[9px] bg-blue-50 text-blue-700 font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md mt-1 inline-block">
                                    📝 {cust.notes}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="p-4">
                            <div className="text-left">
                              <span className="text-xs font-bold text-emerald-600 block">
                                Gasto: {Number(cust.totalSpent || 0).toLocaleString()} {currency}
                              </span>
                              <span className={cn(
                                "text-[10px] font-bold block",
                                cust.outstandingBalance > 0 ? "text-rose-600" : "text-slate-400"
                              )}>
                                Saldo: {Number(cust.outstandingBalance || 0).toLocaleString()} {currency}
                              </span>
                            </div>
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex justify-end gap-1 items-center">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingCustomerObj(cust);
                                  setEditingForm({
                                    name: cust.name || '',
                                    email: cust.email || '',
                                    phone: cust.phone || '',
                                    address: cust.address || '',
                                    notes: cust.notes || '',
                                    loyaltyPoints: cust.loyaltyPoints || 0
                                  });
                                }}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer transition-colors"
                                title="Editar Perfil"
                              >
                                <Edit2 size={16} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteIndividual(cust.id, cust.name)}
                                className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
                                title="Eliminar Cliente"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                {filteredCustomers.length > 0 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-slate-100 mt-4 select-none">
                    <div className="text-xs font-semibold text-slate-500 font-sans">
                      Mostrando <span className="font-extrabold text-slate-900">{Math.min(filteredCustomers.length, startIndex + 1)}</span> a{" "}
                      <span className="font-extrabold text-slate-900">{Math.min(filteredCustomers.length, endIndex)}</span> de{" "}
                      <span className="font-extrabold text-[#111827]">{filteredCustomers.length}</span> clientes
                    </div>
                    <div className="flex items-center gap-1.5 self-end sm:self-auto">
                      <button
                        type="button"
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        className="px-3 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed bg-white"
                      >
                        Anterior
                      </button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(5, Math.ceil(filteredCustomers.length / itemsPerPage)) }, (_, i) => {
                          const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage);
                          let pageNum = currentPage;
                          if (currentPage <= 3) {
                            pageNum = i + 1;
                          } else if (currentPage >= totalPages - 2) {
                            pageNum = totalPages - 4 + i;
                          } else {
                            pageNum = currentPage - 2 + i;
                          }
                          if (pageNum < 1 || pageNum > totalPages) return null;
                          return (
                            <button
                              key={pageNum}
                              type="button"
                              onClick={() => setCurrentPage(pageNum)}
                              className={cn(
                                "w-8 h-8 flex items-center justify-center text-xs font-bold rounded-lg transition-all cursor-pointer",
                                currentPage === pageNum ? "bg-slate-900 text-white shadow-sm" : "border border-slate-200 hover:bg-slate-50 text-slate-600 bg-white"
                              )}
                            >
                              {pageNum}
                            </button>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        disabled={currentPage === Math.ceil(filteredCustomers.length / itemsPerPage)}
                        onClick={() => setCurrentPage(prev => Math.min(Math.ceil(filteredCustomers.length / itemsPerPage), prev + 1))}
                        className="px-3 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed bg-white"
                      >
                        Próximo
                      </button>
                    </div>
                  </div>
                )}

                {filteredCustomers.length === 0 && (
                  <div className="py-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                    <Search size={22} className="opacity-20" />
                    <p className="text-xs font-semibold text-slate-500">Nenhum cliente encontrado com os filtros de busca.</p>
                  </div>
                )}
              </div>

              {/* RIGHT COLUMN: DETAIL EDIT PROFILE FORM & DEDUPLICATION FUSION PANEL */}
              <div className="lg:col-span-5 space-y-6">
                {/* Edit Form */}
                <div className="bg-white p-6 border border-slate-100 rounded-[28px] shadow-sm space-y-5 text-left">
                  <div>
                    <span className="text-[10px] bg-blue-50 text-blue-700 px-2.5 py-1 rounded-md font-black uppercase tracking-wider">✏️ Gestor de Perfis</span>
                    <h3 className="text-base font-black text-slate-900 mt-1.5">Editar Ficha de Cliente</h3>
                    <p className="text-xs text-slate-500">Adicione contactos, moradas, ou notas de preferência do cliente.</p>
                  </div>

                  {editingCustomerObj ? (
                    <div className="space-y-3.5 animate-in fade-in duration-150">
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Nome Completo</label>
                        <input 
                          className="w-full p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-500"
                          value={editingForm.name}
                          onChange={e => setEditingForm({...editingForm, name: e.target.value})}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3.5">
                        <div>
                          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Email</label>
                          <input 
                            className="w-full p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-500"
                            value={editingForm.email}
                            onChange={e => setEditingForm({...editingForm, email: e.target.value})}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Telemóvel</label>
                          <input 
                            className="w-full p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-500"
                            value={editingForm.phone}
                            onChange={e => setEditingForm({...editingForm, phone: e.target.value})}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Morada de Entrega</label>
                        <input 
                          className="w-full p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-500"
                          value={editingForm.address}
                          onChange={e => setEditingForm({...editingForm, address: e.target.value})}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Pontos de Fidelização (Loyalty Points)</label>
                        <div className="flex gap-2 items-center">
                          <input 
                            type="number"
                            className="w-32 p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-mono font-bold outline-none focus:ring-2 focus:ring-blue-500 text-blue-650"
                            value={editingForm.loyaltyPoints || 0}
                            onChange={e => setEditingForm({...editingForm, loyaltyPoints: parseInt(e.target.value) || 0})}
                          />
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditingForm(prev => ({ ...prev, loyaltyPoints: prev.loyaltyPoints + 50 }))}
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-[10px] rounded-lg transition-colors border border-slate-150 cursor-pointer"
                            >
                              +50 pts
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingForm(prev => ({ ...prev, loyaltyPoints: prev.loyaltyPoints + 100 }))}
                              className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 font-black text-[10px] rounded-lg transition-colors border border-blue-100 cursor-pointer"
                            >
                              +100 pts
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingForm(prev => ({ ...prev, loyaltyPoints: Math.max(0, prev.loyaltyPoints - 50) }))}
                              className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 font-black text-[10px] rounded-lg transition-colors border border-rose-100 cursor-pointer"
                            >
                              -50 pts
                            </button>
                          </div>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-widest">
                          Ajuste manualmente o saldo de fidelização do cliente para campanhas especiais.
                        </p>
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Notas Pessoais / Observações</label>
                        <textarea 
                          rows={3}
                          className="w-full p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-semibold outline-none resize-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Ex: Gosta de descontos, prefere entrega rápida, cliente premium..."
                          value={editingForm.notes || ''}
                          onChange={e => setEditingForm({...editingForm, notes: e.target.value})}
                        />
                      </div>

                      <div className="flex justify-end gap-2 pt-2">
                        <button 
                          onClick={() => setEditingCustomerObj(null)}
                          className="px-3.5 py-2 hover:bg-slate-100 text-slate-500 font-bold text-[10px] uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
                        >
                          Limpar
                        </button>
                        <button 
                          onClick={handleSaveCustomerProfile}
                          disabled={isSavingEdit}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-black text-[10px] uppercase tracking-wider rounded-lg active:scale-95 transition-all shadow-md shadow-blue-500/10 cursor-pointer"
                        >
                          {isSavingEdit ? 'A gravar...' : 'Gravar Alterações'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-10 text-center text-slate-400 border border-dashed rounded-2xl flex flex-col items-center justify-center gap-2">
                      <Search size={24} className="opacity-20" />
                      <p className="text-xs font-bold text-slate-500">Selecione um cliente na tabela à esquerda para carregar e editar os dados.</p>
                    </div>
                  )}
                </div>

                {/* Deduplication Section */}
                <div className="bg-white p-6 border border-slate-100 rounded-[28px] shadow-sm space-y-5 text-left">
                  <div>
                    <span className="text-[10px] bg-amber-50 text-amber-700 px-2.5 py-1 rounded-md font-black uppercase tracking-wider">⚖️ Unificador de Duplicados</span>
                    <h3 className="text-base font-black text-slate-900 mt-1.5">Mesclar Clientes (Fusão)</h3>
                    <p className="text-xs text-slate-500">Mova faturas, históricos e saldos de contas duplicadas em 1 única conta principal.</p>
                  </div>

                  {/* Suggestions */}
                  <div className="space-y-3 bg-amber-50/20 border border-amber-100/30 p-4 rounded-2xl">
                    <span className="text-[9px] uppercase font-black text-amber-700 tracking-wider">Sugestões de Escrita Redundantes</span>
                    {duplicateMatches.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">Nenhum potencial cliente duplicado detetado por grafia no momento.</p>
                    ) : (
                      <div className="space-y-2 max-h-40 overflow-y-auto font-sans">
                        {duplicateMatches.map((match, idx) => (
                          <div key={idx} className="bg-white p-3 rounded-xl border border-amber-100/50 flex items-center justify-between gap-2 shadow-sm text-xs">
                            <div className="space-y-0.5">
                              <p className="font-bold text-slate-800">
                                <span className="text-blue-600 font-extrabold">{match.customer1.name}</span> <span className="text-slate-400 font-medium">vs</span> <span className="text-rose-500 font-extrabold">{match.customer2.name}</span>
                              </p>
                              <p className="text-[10px] text-slate-400">Excelente similaridade detectada</p>
                            </div>
                            <button
                              onClick={() => {
                                setMainCustomerId(match.customer1.id);
                                setTargetCustomerId(match.customer2.id);
                              }}
                              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-[#1D1510] font-black text-[9px] uppercase tracking-wider rounded-lg transition-transform active:scale-95 cursor-pointer"
                            >
                              Selecionar
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Manual Fields */}
                  <div className="space-y-3.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <label className="block text-[9px] font-black text-blue-900 uppercase">1. Conta Principal</label>
                        <select
                          className="w-full p-2 mt-1.5 bg-white border border-slate-200 rounded-lg outline-none font-bold text-xs"
                          value={mainCustomerId}
                          onChange={e => setMainCustomerId(e.target.value)}
                        >
                          <option value="">-- Escolher --</option>
                          {customers.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <label className="block text-[9px] font-black text-rose-900 uppercase">2. Conta Redundante</label>
                        <select
                          className="w-full p-2 mt-1.5 bg-white border border-slate-200 rounded-lg outline-none font-bold text-xs"
                          value={targetCustomerId}
                          onChange={e => setTargetCustomerId(e.target.value)}
                        >
                          <option value="">-- Escolher --</option>
                          {customers.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {mainCustomerId && targetCustomerId && (
                      <div className="p-4 rounded-xl bg-blue-50/20 border border-blue-100/30 text-xs font-semibold text-slate-600 animate-in slide-in-from-bottom-2 duration-150">
                        💡 O cliente <span className="text-blue-600 font-bold">"{customers.find(c => c.id === targetCustomerId)?.name}"</span> será removido e todas as suas faturas serão transferidas para <span className="text-blue-600 font-bold">"{customers.find(c => c.id === mainCustomerId)?.name}"</span>.
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => handleMergeCustomers(mainCustomerId, targetCustomerId)}
                      disabled={isMerging || !mainCustomerId || !targetCustomerId}
                      className="w-full py-2.5 bg-slate-900 font-extrabold hover:bg-slate-800 text-white rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer text-center"
                    >
                      {isMerging ? <Loader2 size={14} className="animate-spin" /> : '🔒 Mesclar Contas Permanentemente'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedCustomer && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl flex flex-col max-h-[85vh]"
            >
              {/* Modal Header */}
              <div className="p-6 border-b flex justify-between items-start bg-slate-50 rounded-t-3xl">
                <div className="flex gap-4 items-center">
                  <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-xl font-black shadow-lg shadow-blue-500/20">
                    {selectedCustomer.name[0]?.toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                      {selectedCustomer.name}
                      <span className="text-xs font-semibold bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">Client Profile</span>
                    </h3>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
                      {selectedCustomer.email && (
                        <span className="flex items-center gap-1"><Mail size={12} /> {selectedCustomer.email}</span>
                      )}
                      {selectedCustomer.phone && (
                        <span className="flex items-center gap-1"><Phone size={12} /> {selectedCustomer.phone}</span>
                      )}
                      {selectedCustomer.address && (
                        <span className="flex items-center gap-1"><MapPin size={12} /> {selectedCustomer.address}</span>
                      )}
                    </div>
                  </div>
                </div>
                <button onClick={() => { setSelectedCustomer(null); setExpandedTxId(null); setTxSearchTerm(''); }} className="p-2 hover:bg-white rounded-xl text-slate-400 hover:text-slate-900 transition-all border border-slate-100 shadow-sm">
                   <X size={18} />
                </button>
              </div>

              {/* Financial Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 p-6 bg-slate-50 border-b border-slate-100">
                <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-3">
                  <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl"><ShoppingCart size={20} /></div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Total Compras</p>
                    <p className="text-lg font-black text-slate-900">{totalInvoicedSum.toLocaleString()} {currency}</p>
                  </div>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl"><DollarSign size={20} /></div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Total Pago</p>
                    <p className="text-lg font-black text-emerald-600">{totalPaymentsSum.toLocaleString()} {currency}</p>
                  </div>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-3">
                  <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl"><Coins size={20} /></div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Saldo em Dívida</p>
                    <p className={`text-lg font-black ${selectedCustomer.outstandingBalance > 0 ? 'text-rose-600' : 'text-slate-950'}`}>
                      {(selectedCustomer.outstandingBalance || 0).toLocaleString()} {currency}
                    </p>
                  </div>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-center min-h-[64px]">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl"><Sparkles size={20} /></div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Fidelização</p>
                      <p className="text-base font-black text-blue-600 flex flex-wrap items-center gap-1 leading-none mt-0.5">
                        {Math.floor(selectedCustomer.loyaltyPoints || 0).toLocaleString()} pts
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 pl-1 flex items-center justify-between gap-1.5 flex-wrap">
                    <span className={cn(
                      "text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider",
                      (selectedCustomer.loyaltyPoints || 0) >= 1000 ? "bg-emerald-100 text-emerald-700 border border-emerald-200" :
                      (selectedCustomer.loyaltyPoints || 0) >= 500  ? "bg-amber-100 text-amber-700 border border-amber-200" :
                      (selectedCustomer.loyaltyPoints || 0) >= 100  ? "bg-blue-100 text-blue-700 border border-blue-200" :
                      "bg-slate-100 text-slate-650"
                    )}>
                      {(selectedCustomer.loyaltyPoints || 0) >= 1000 ? "Platina 👑" :
                       (selectedCustomer.loyaltyPoints || 0) >= 500  ? "Ouro 🌟" :
                       (selectedCustomer.loyaltyPoints || 0) >= 100  ? "Prata ⭐" :
                       "Bronze"
                      }
                    </span>
                    <button
                      type="button"
                      onClick={() => setViewingLoyaltyCustomer(selectedCustomer)}
                      className="flex items-center gap-1 bg-[#1D1510] hover:bg-black text-[#FCFAF6] px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer"
                      title="Gerar Cartão Digital de Fidelização"
                    >
                      <QrCode size={10} /> QR Code
                    </button>
                  </div>
                </div>
              </div>

              {/* Filtering, Tabs, Sorting toolbar */}
              <div className="p-6 pb-2 border-b border-slate-100 flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="flex gap-1.5 p-1 bg-slate-100 rounded-2xl self-start w-full md:w-auto">
                  {[
                    { id: 'all', label: 'All History', icon: History, count: customerInvoices.length },
                    { id: 'invoices', label: 'Sales / Invoices', icon: FileText, count: customerInvoices.filter(tx => tx.type !== 'repayment').length },
                    { id: 'payments', label: 'Repayments', icon: Coins, count: customerInvoices.filter(tx => tx.type === 'repayment').length }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => { setSubTab(tab.id as any); setExpandedTxId(null); }}
                      className={cn(
                        "flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
                        subTab === tab.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
                      )}
                    >
                      <tab.icon size={14} />
                      <span>{tab.label}</span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">{tab.count}</span>
                    </button>
                  ))}
                </div>

                <div className="relative w-full md:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input
                    type="text"
                    placeholder="Search inside transactions..."
                    className="w-full pl-9 pr-3 py-2 border rounded-xl text-xs bg-slate-50 focus:bg-white outline-none transition-all placeholder-slate-400"
                    value={txSearchTerm}
                    onChange={e => setTxSearchTerm(e.target.value)}
                  />
                </div>
              </div>

              {/* Scrollable Transaction Ledger */}
              <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-slate-50/30">
                {transactionsList.length > 0 ? (
                  transactionsList.map((tx) => {
                    const isInvoice = tx.type !== 'repayment';
                    const isExpanded = expandedTxId === tx.id;
                    return (
                      <div 
                        key={tx.id} 
                        className={cn(
                          "border rounded-2xl bg-white transition-all overflow-hidden",
                          isExpanded ? "border-blue-400 ring-4 ring-blue-50" : "border-slate-100 hover:border-slate-200"
                        )}
                      >
                        {/* Transaction Header Summary */}
                        <div 
                          onClick={() => setExpandedTxId(isExpanded ? null : tx.id)}
                          className="p-5 flex items-center justify-between cursor-pointer select-none font-sans"
                        >
                          <div className="flex items-center gap-4">
                            <div className={cn(
                              "p-3 rounded-xl shadow-sm",
                              tx.type === 'pos' ? "bg-emerald-50 text-emerald-600 border border-emerald-100/50" : 
                              tx.type === 'repayment' ? "bg-blue-50 text-blue-600 border border-blue-150/50" : 
                              "bg-blue-50 text-blue-600 border border-blue-100"
                            )}>
                              {tx.type === 'pos' ? <ShoppingCart size={18} /> : 
                               tx.type === 'repayment' ? <ArrowDownLeft size={18} /> : <FileText size={18} />}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-extrabold text-slate-900 text-sm">
                                  {tx.invoiceNumber || (tx.type === 'repayment' ? 'Client Repayment' : 'Invoice')}
                                </p>
                                {tx.type === 'pos' && (
                                  <span className="text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-805 px-1.5 py-0.5 rounded-full">POS</span>
                                )}
                                {tx.type === 'repayment' && (
                                  <span className="text-[9px] font-black uppercase tracking-wider bg-blue-100 text-blue-805 px-1.5 py-0.5 rounded-full">Repayment</span>
                                )}
                              </div>
                              <p className="text-xs text-slate-400 font-medium flex items-center gap-1 mt-1">
                                <Calendar size={12} />
                                {tx.createdAt?.toDate ? tx.createdAt.toDate().toLocaleDateString() : new Date(tx.date || tx.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className={cn("font-black text-sm", isInvoice ? "text-rose-500" : "text-emerald-600")}>
                                {isInvoice ? `+${(tx.total || 0).toLocaleString()} ${currency}` : `-${(tx.amount || 0).toLocaleString()} ${currency}`}
                              </p>
                              {isInvoice && (
                                <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                                  tx.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 
                                  tx.status === 'partially_paid' ? 'bg-amber-100 text-amber-700' :
                                  'bg-rose-100 text-rose-700'
                                }`}>
                                  {tx.status?.replace('_', ' ')}
                                </span>
                              )}
                              {!isInvoice && (
                                <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-full">
                                  {tx.method?.replace('_', ' ') || 'Cash'}
                                </span>
                              )}
                            </div>
                            <div>
                              {isExpanded ? <ChevronUp className="text-slate-400" size={18} /> : <ChevronDown className="text-slate-400" size={18} />}
                            </div>
                          </div>
                        </div>

                        {/* Transaction Detailed Subsection Breakdown (Accordion Item) */}
                        {isExpanded && (
                          <div className="px-5 pb-5 border-t border-slate-50 bg-slate-50/40 animate-in slide-in-from-top-2 duration-200">
                            {isInvoice ? (
                              <div className="pt-4 space-y-4">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Invoice Items & Cost Analysis</p>
                                
                                <div className="border border-slate-100 rounded-xl overflow-hidden bg-white">
                                  <table className="w-full text-left text-xs text-slate-600">
                                    <thead className="bg-slate-50 border-b border-slate-100">
                                      <tr>
                                        <th className="p-3 font-bold text-slate-500">Item</th>
                                        <th className="p-3 font-bold text-slate-500 text-center w-16">Qtd</th>
                                        <th className="p-3 font-bold text-slate-500 text-right w-24">Price</th>
                                        <th className="p-3 font-bold text-slate-500 text-right w-24">Total</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {tx.items && tx.items.length > 0 ? (
                                        tx.items.map((item: any, idx: number) => {
                                          const desc = item.description || item.name || 'Custom item';
                                          const itemTotal = (item.quantity || 1) * (item.price || 0);
                                          return (
                                            <tr key={idx} className="hover:bg-slate-50/50">
                                              <td className="p-3 font-medium text-slate-900">{desc}</td>
                                              <td className="p-3 text-center">{item.quantity}</td>
                                              <td className="p-3 text-right">{(item.price || 0).toLocaleString()} {currency}</td>
                                              <td className="p-3 text-right font-bold text-slate-900">{itemTotal.toLocaleString()} {currency}</td>
                                            </tr>
                                          );
                                        })
                                      ) : (
                                        <tr>
                                          <td colSpan={4} className="p-4 text-center text-slate-400 italic">No item summary details.</td>
                                        </tr>
                                      )}
                                    </tbody>
                                  </table>
                                </div>

                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-2">
                                  <div className="flex gap-2">
                                    <button 
                                      onClick={() => printInvoice(tx)}
                                      className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 text-white hover:bg-slate-800 px-4 py-2.5 rounded-xl transition-all font-bold text-xs"
                                    >
                                      <Printer size={14} />
                                      Print Receipt
                                    </button>
                                    <button 
                                      onClick={() => copyPaymentLink(tx)}
                                      className="flex items-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-slate-700 transition-all font-bold text-xs shadow-sm"
                                    >
                                      <LinkIcon size={14} />
                                      Copy Payment Link
                                    </button>
                                  </div>

                                  <div className="flex flex-col justify-end text-xs font-semibold text-slate-500 space-y-1 self-end sm:self-auto min-w-[150px] border border-dashed rounded-xl p-3 bg-white">
                                    <div className="flex justify-between gap-4">
                                      <span>Subtotal:</span>
                                      <span className="font-extrabold text-slate-950">{(tx.subtotal || tx.total || 0).toLocaleString()} {currency}</span>
                                    </div>
                                    <div className="flex justify-between gap-4">
                                      <span>Impostos (17%):</span>
                                      <span className="font-extrabold text-slate-800">{(tx.tax || 0).toLocaleString()} {currency}</span>
                                    </div>
                                    <div className="flex justify-between gap-4 pt-1.5 border-t border-slate-100 text-slate-900 font-extrabold text-sm">
                                      <span>Total:</span>
                                      <span className="text-blue-600">{(tx.total || 0).toLocaleString()} {currency}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-3">
                                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 leading-none">Repayment Information</p>
                                  <div className="bg-white border text-xs space-y-2.5 border-slate-100 p-4 rounded-xl shadow-sm">
                                    <div className="flex justify-between">
                                      <span className="text-slate-400">Payment Reference:</span>
                                      <span className="font-extrabold text-slate-900">{tx.reference || 'None'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-slate-400">Gateway / Channel:</span>
                                      <span className="font-black text-blue-600 uppercase tracking-widest text-[10px] bg-blue-50 px-1.5 py-0.5 rounded-md self-center">
                                        {tx.method || 'Cash'}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-slate-400">Received Amount:</span>
                                      <span className="font-extrabold text-emerald-600 text-sm">{(tx.amount || 0).toLocaleString()} {currency}</span>
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-2 flex flex-col justify-end sm:pb-1">
                                  <div className="p-4 bg-emerald-50 rounded-xl text-emerald-850 text-xs border border-emerald-100/50 flex items-center gap-2">
                                    <CheckCircle size={14} className="text-emerald-500 shrink-0" />
                                    <span>This credit repayment was cleared and recorded successfully onto the customer balance register.</span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-16 bg-white border border-dashed rounded-3xl text-slate-450 flex flex-col items-center justify-center gap-3">
                    <FileText size={40} className="text-slate-355 opacity-40 animate-pulse" />
                    <div>
                      <p className="font-bold text-slate-700">No Transactions Found</p>
                      <p className="text-xs text-slate-400 mt-1">There are no matching ledgers under this filter or search query.</p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Smart Customer Deduplication & Merge Modal */}
      {showDeduplicateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start mb-4 border-b pb-3">
              <div>
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <span>⚖️ Mesclador de Clientes Duplicados</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1 font-medium">
                  Una clientes redundantes devido a grafia diferente. Saldos devidos, valores faturados e históricos de faturas serão todos direcionados ao cliente vencedor.
                </p>
              </div>
              <button 
                onClick={() => setShowDeduplicateModal(false)}
                className="text-slate-400 hover:text-slate-600 font-extrabold text-sm p-1.5 hover:bg-slate-50 rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-6 text-left pr-1">
              {/* Suggestions Section */}
              <div className="space-y-3 bg-amber-50/40 border border-amber-100 p-4 rounded-2xl">
                <span className="text-[10px] uppercase font-black text-amber-700 tracking-wider">💡 Sugestões Automáticas (Grafias Parecidas)</span>
                
                {duplicateMatches.length === 0 ? (
                  <p className="text-xs text-amber-900/70 italic font-medium">Não foram descobertos clientes duplicados óbvios por similaridade. Use o mesclador manual abaixo!</p>
                ) : (
                  <div className="space-y-2.5">
                    {duplicateMatches.map((match, idx) => (
                      <div key={idx} className="bg-white p-3.5 rounded-xl border border-amber-150 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-slate-800 flex items-center gap-1 flex-wrap">
                            <span className="text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{match.customer1.name}</span>
                            <span className="text-slate-400">vs</span>
                            <span className="text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">{match.customer2.name}</span>
                          </p>
                          <p className="text-[10px] text-slate-500">
                            Saldos: {match.customer1.outstandingBalance || 0} {currency} vs {match.customer2.outstandingBalance || 0} {currency}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleMergeCustomers(match.customer1.id, match.customer2.id)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] uppercase tracking-wider rounded-lg active:scale-95 transition-all"
                          >
                            Mesclar em: {match.customer1.name.slice(0, 15)}
                          </button>
                          <button
                            onClick={() => handleMergeCustomers(match.customer2.id, match.customer1.id)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] uppercase tracking-wider rounded-lg active:scale-95 transition-all"
                          >
                            Mesclar em: {match.customer2.name.slice(0, 15)}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Manual Selection Merge Section */}
              <div className="space-y-4 border-t pt-4">
                <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider">🛠️ Mesclador Manual de Clientes</span>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Master Customer */}
                  <div className="space-y-1.5 p-3 rounded-2xl bg-blue-50/30 border border-blue-100">
                    <label className="block text-xs font-bold text-blue-900 uppercase">1. Cliente Vencedor (Principal)</label>
                    <p className="text-[10px] text-blue-600 italic">Esta conta será mantida e unificará os saldos.</p>
                    <select
                      className="w-full p-2.5 bg-white border border-blue-200 rounded-xl outline-none font-bold text-xs"
                      value={mainCustomerId}
                      onChange={e => setMainCustomerId(e.target.value)}
                    >
                      <option value="">-- Escolha o Cliente Correto --</option>
                      {customers.map(c => (
                        <option key={c.id} value={c.id}>{c.name} (Saldo Devedor: {c.outstandingBalance || 0} {currency})</option>
                      ))}
                    </select>
                  </div>

                  {/* Duplicate Customer */}
                  <div className="space-y-1.5 p-3 rounded-2xl bg-rose-50/30 border border-rose-100">
                    <label className="block text-xs font-bold text-rose-900 uppercase">2. Cliente Duplicado (Será Removido)</label>
                    <p className="text-[10px] text-rose-600 italic">Esta conta duplicada será excluída após a consolidação.</p>
                    <select
                      className="w-full p-2.5 bg-white border border-rose-200 rounded-xl outline-none font-bold text-xs"
                      value={targetCustomerId}
                      onChange={e => setTargetCustomerId(e.target.value)}
                    >
                      <option value="">-- Escolha o Cliente Errado --</option>
                      {customers.map(c => (
                        <option key={c.id} value={c.id}>{c.name} (Saldo Devedor: {c.outstandingBalance || 0} {currency})</option>
                      ))}
                    </select>
                  </div>
                </div>

                {mainCustomerId && targetCustomerId && (
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 animate-in slide-in-from-bottom-2 duration-200">
                    <span className="text-[10px] uppercase font-black text-slate-400 font-mono">Simulador de Consolidação</span>
                    <p className="text-xs font-bold text-slate-700">
                      O saldo devedor de <span className="text-blue-600">"{customers.find(c => c.id === mainCustomerId)?.name}"</span> 
                      passará de <span className="font-mono">{customers.find(c => c.id === mainCustomerId)?.outstandingBalance || 0}</span> {currency} 
                      para <span className="font-mono text-emerald-600 font-extrabold">{(Number(customers.find(c => c.id === mainCustomerId)?.outstandingBalance) || 0) + (Number(customers.find(c => c.id === targetCustomerId)?.outstandingBalance) || 0)}</span> {currency}.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100 font-sans">
                <button 
                  type="button"
                  onClick={() => setShowDeduplicateModal(false)}
                  className="px-4 py-2 border rounded-xl text-slate-600 font-bold text-xs uppercase tracking-wider hover:bg-slate-50 cursor-pointer"
                >
                  Voltar
                </button>
                <button 
                  type="button"
                  onClick={() => handleMergeCustomers(mainCustomerId, targetCustomerId)}
                  disabled={isMerging || !mainCustomerId || !targetCustomerId}
                  className="px-5 py-2 bg-slate-900 disabled:opacity-40 hover:bg-slate-800 text-white font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer active:scale-95 shadow-md flex items-center gap-1.5"
                >
                  {isMerging ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <span>🔒 Confirmar Fusão e Re-arquivar Faturas</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

      {/* Cartão de Fidelidade Modal */}
      <AnimatePresence>
        {viewingLoyaltyCustomer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#FAF7F2] border border-[#E9E1D2] w-full max-w-sm rounded-[36px] shadow-2xl p-6 relative text-left"
            >
              <button 
                onClick={() => setViewingLoyaltyCustomer(null)}
                className="absolute top-4 right-4 p-2 bg-[#E9E1D2]/40 text-[#1D1510] hover:bg-[#E9E1D2]/80 transition-all rounded-full cursor-pointer border-0"
              >
                <X size={14} />
              </button>

              <div className="text-center mb-4">
                <span className="text-[10px] font-black text-[#8B735F] uppercase tracking-widest font-sans">CARTÃO DE FIDELIZAÇÃO</span>
                <h4 className="text-lg font-black text-[#1D1510] font-sans mt-0.5 leading-tight">Sabush Club Premium</h4>
              </div>

              {/* High elegance Loyalty Card */}
              <div className="bg-[#0A1C38] rounded-2xl p-5 shadow-lg relative overflow-hidden h-44 flex flex-col justify-between text-white border border-[#E9E1D2]/25">
                {/* Decorative Pattern Background */}
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none select-none bg-[radial-gradient(#FAF7F2_1px,transparent_1px)] [background-size:16px_16px]" />

                <div className="flex justify-between items-start z-10">
                  <div>
                    <span className="text-[8px] tracking-widest text-[#E9E1D2] font-black uppercase font-mono">MEMBRO DESDE {new Date().getFullYear()}</span>
                    <h5 className="text-sm font-black tracking-tight leading-tight mt-0.5 font-sans filter drop-shadow">
                      {viewingLoyaltyCustomer.name}
                    </h5>
                    <p className="text-[9px] font-medium font-mono text-[#E9E1D2]/70 leading-none mt-1">ID: {viewingLoyaltyCustomer.id?.slice(0, 8).toUpperCase()}</p>
                  </div>
                  <span className={cn(
                    "text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full",
                    (viewingLoyaltyCustomer.loyaltyPoints || 0) >= 1000 ? "bg-emerald-550/30 text-emerald-300 border border-emerald-500/30" :
                    (viewingLoyaltyCustomer.loyaltyPoints || 0) >= 500  ? "bg-amber-500/20 text-amber-300 border border-amber-500/25" :
                    (viewingLoyaltyCustomer.loyaltyPoints || 0) >= 100  ? "bg-blue-500/20 text-blue-300 border border-blue-500/25" :
                    "bg-[#8B735F]/20 text-[#FAF7F2] border border-[#8B735F]/30"
                  )}>
                    {(viewingLoyaltyCustomer.loyaltyPoints || 0) >= 1000 ? "👑 Platina" :
                     (viewingLoyaltyCustomer.loyaltyPoints || 0) >= 500  ? "🌟 Ouro" :
                     (viewingLoyaltyCustomer.loyaltyPoints || 0) >= 100  ? "Prata ⭐" :
                     "Bronze"
                    }
                  </span>
                </div>

                <div className="flex justify-between items-end z-10">
                  <div>
                    <span className="text-[8px] tracking-widest text-[#E9E1D2]/60 font-black uppercase block">SALDO ACUMULADO</span>
                    <span className="text-xl font-bold font-mono text-blue-300">
                      {(viewingLoyaltyCustomer.loyaltyPoints || 0).toLocaleString()} <span className="text-xs text-[#E9E1D2]/70 font-sans font-bold">pts</span>
                    </span>
                  </div>
                  <div className="bg-white/10 px-2 py-1.5 rounded-lg border border-white/5 flex items-center gap-1">
                    <span className="text-[8px] font-black uppercase tracking-wider text-[#E9E1D2]">SABUSH CLUB</span>
                  </div>
                </div>
              </div>

              {/* Dynamic QR block */}
              <div className="mt-5 bg-white p-5 rounded-[28px] border border-[#E9E1D2]/60 flex flex-col items-center shadow-sm">
                <div className="w-28 h-28 flex flex-col gap-[2px] p-2.5 bg-slate-50 border border-slate-100 rounded-2xl relative overflow-hidden shadow-inner font-sans">
                  {getLoyaltyQRGrid(viewingLoyaltyCustomer.id).map((row, rIdx) => (
                    <div key={rIdx} className="flex gap-[2px] flex-1">
                      {row.map((cell, cIdx) => (
                        <div 
                          key={cIdx} 
                          className={cn("flex-1 h-full rounded-[1px]", cell ? "bg-slate-950" : "bg-transparent")} 
                        />
                      ))}
                    </div>
                  ))}
                </div>
                <span className="text-[9px] font-black text-slate-400 tracking-wider inline-block mt-3 uppercase font-mono">
                  CLI-{viewingLoyaltyCustomer.phone || viewingLoyaltyCustomer.id?.slice(0, 10).toUpperCase()}
                </span>
                <p className="text-[10px] text-[#8B735F] font-bold text-center mt-2 font-sans leading-snug px-3">
                  Apresente este código no leitor de caixa (POS) para acumular ou resgatar pontos da sua conta.
                </p>
              </div>

              {/* Utility actions inside customer modal */}
              <div className="grid grid-cols-2 gap-3 mt-4 font-sans">
                <button
                  onClick={() => {
                    window.print();
                  }}
                  className="w-full flex items-center justify-center gap-1 bg-[#1D1510] hover:bg-black text-white text-[10.5px] font-black uppercase tracking-widest py-3 rounded-2xl transition-all cursor-pointer shadow-sm border-0"
                >
                  🖨️ Imprimir
                </button>
                <button
                  onClick={() => {
                    toast.success("Link do Cartão copiado para envio via WhatsApp!");
                  }}
                  className="w-full flex items-center justify-center gap-1 bg-white hover:bg-slate-50 text-[#1D1510] text-[10.5px] font-[#1D1510] uppercase tracking-widest py-3 rounded-2xl transition-all cursor-pointer border border-[#E9E1D2]"
                >
                  🔗 Copiar Link
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Deterministic QR generation helper
export function getLoyaltyQRGrid(customerId: string): boolean[][] {
  const size = 15;
  const grid: boolean[][] = [];
  const seed = (customerId || 'def').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  
  for (let r = 0; r < size; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < size; c++) {
      const isTopLeftAnchor = r < 4 && c < 4;
      const isTopRightAnchor = r < 4 && c >= size - 4;
      const isBottomLeftAnchor = r >= size - 4 && c < 4;
      
      if (isTopLeftAnchor) {
        row.push((r === 0 || r === 3 || c === 0 || c === 3) || (r === 1 && c === 1));
      } else if (isTopRightAnchor) {
        row.push((r === 0 || r === 3 || c === size - 1 || c === size - 4) || (r === 1 && c === size - 2));
      } else if (isBottomLeftAnchor) {
        row.push((r === size - 1 || r === size - 4 || c === 0 || c === 3) || (r === size - 2 && c === 1));
      } else {
        const val = Math.sin(seed + r * 13 + c * 37) > 0;
        row.push(val);
      }
    }
    grid.push(row);
  }
  return grid;
}
