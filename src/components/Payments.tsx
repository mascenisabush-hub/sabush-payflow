import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { subscribeToCollection } from '../lib/firestoreCache';
import { collection, query, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, increment, getDocs, getDoc, where, writeBatch } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { DollarSign, Search, Calendar, CreditCard, Wallet, Landmark, Phone, ArrowLeft, Plus, Receipt, Printer, Download, CheckCircle, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { printPaymentReceiptHTML, downloadPaymentReceiptHTML } from '../lib/printService';

export default function Payments() {
  const { profile, businessData } = useAuth();
  const { t } = useTranslation();
  const currency = businessData?.currency || 'MZN';
  const [payments, setPayments] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [paymentDirection, setPaymentDirection] = useState<'inbound' | 'outbound'>('inbound');
  const [promptLinkPO, setPromptLinkPO] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [newPayment, setNewPayment] = useState({
    customerId: '',
    amount: 0,
    method: 'cash',
    reference: '',
    date: new Date().toISOString().split('T')[0]
  });
  const [previewPayment, setPreviewPayment] = useState<any | null>(null);

  // Custom client portal payment proofs/screenshots tracking states
  const [paymentProofs, setPaymentProofs] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'history' | 'proofs'>('history');
  const [viewingProof, setViewingProof] = useState<any | null>(null);
  const [rejectionNotes, setRejectionNotes] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [isProcessingProof, setIsProcessingProof] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [quickAddName, setQuickAddName] = useState('');
  const [quickAddPhone, setQuickAddPhone] = useState('');
  const [quickAddEmail, setQuickAddEmail] = useState('');
  const [isSavingQuickAdd, setIsSavingQuickAdd] = useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 250);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!profile?.businessId) return;

    // Fetch Payments
    const q = query(collection(db, `businesses/${profile.businessId}/payments`));
    const unsubscribe = subscribeToCollection(
      `businesses/${profile.businessId}/payments`,
      (items) => {
        setPayments([...items].sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
        setLoading(false);
      },
      q,
      (error) => {
        setLoading(false);
        console.warn("Gracefully handled payments onSnapshot error:", error);
      }
    );

    // Fetch Customers (subscribed & cached)
    const unsubCustomers = subscribeToCollection(
      `businesses/${profile.businessId}/customers`,
      (items) => {
        setCustomers(items);
      }
    );

    // Fetch Suppliers (subscribed & cached)
    const unsubSuppliers = subscribeToCollection(
      `businesses/${profile.businessId}/suppliers`,
      (items) => {
        setSuppliers(items);
      }
    );

    // Fetch Purchase Orders (subscribed & cached)
    const unsubPOs = subscribeToCollection(
      `businesses/${profile.businessId}/purchase_orders`,
      (items) => {
        setPurchaseOrders(items);
      }
    );

    // Fetch Expenses (subscribed & cached)
    const unsubExpenses = subscribeToCollection(
      `businesses/${profile.businessId}/expenses`,
      (items) => {
        setExpenses(items);
      }
    );

    // Fetch Client Payment Proofs (real-time sub)
    const proofsQ = query(collection(db, `businesses/${profile.businessId}/payment_proofs`));
    const unsubscribeProofs = onSnapshot(proofsQ, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPaymentProofs(items.sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
    }, (error) => {
      console.warn("Gracefully handled payment proofs onSnapshot error:", error);
    });

    return () => {
      unsubscribe();
      unsubCustomers();
      unsubSuppliers();
      unsubPOs();
      unsubExpenses();
      unsubscribeProofs();
    };
  }, [profile?.businessId]);

  const getSupplierOutstanding = (suppId: string) => {
    const suppExpenses = expenses.filter(e => e.supplierId === suppId);
    const totalExpOutstanding = suppExpenses.reduce((sum, e) => sum + (e.outstandingBalance || 0), 0);
    const suppPOs = purchaseOrders.filter(o => o.supplierId === suppId && o.paymentType === 'credit');
    const totalPoOutstanding = suppPOs.reduce((sum, o) => sum + (o.outstandingBalance || 0), 0);
    return totalExpOutstanding + totalPoOutstanding;
  };

  const submitSupplierPayment = async (linkedPO: any | null) => {
    if (!profile?.businessId || !newPayment.customerId || newPayment.amount <= 0) return;

    const supplierRefObj = suppliers.find(s => s.id === newPayment.customerId);
    if (!supplierRefObj) {
      toast.error("Fornecedor não encontrado.");
      return;
    }

    try {
      const amountToPay = newPayment.amount;
      const batch = writeBatch(db);

      if (linkedPO) {
        const oBal = linkedPO.outstandingBalance !== undefined ? linkedPO.outstandingBalance : ((linkedPO.totalCost || linkedPO.amount || 0) - (linkedPO.paidAmount || linkedPO.amountPaid || 0));
        
        if (amountToPay > oBal) {
          toast.error(`O valor inserido excede o saldo devedor pendente desta Ordem de Compra (${oBal.toLocaleString()} ${currency}).`);
          return;
        }

        const newPaidAmount = (linkedPO.paidAmount || 0) + amountToPay;
        const newOutstanding = Math.max(0, (linkedPO.totalCost || 0) - newPaidAmount);
        
        let nextPaymentStatus = 'unpaid';
        if (newOutstanding <= 0) {
          nextPaymentStatus = 'paid';
        } else if (newPaidAmount > 0) {
          nextPaymentStatus = 'partially_paid';
        }

        const poDocRef = doc(db, `businesses/${profile.businessId}/purchase_orders`, linkedPO.id);
        batch.update(poDocRef, {
          paidAmount: newPaidAmount,
          outstandingBalance: newOutstanding,
          paymentStatus: nextPaymentStatus,
          updatedAt: serverTimestamp()
        });
      }

      const paymentData = {
        customerId: newPayment.customerId,
        amount: amountToPay,
        method: newPayment.method,
        reference: newPayment.reference,
        date: newPayment.date,
        businessId: profile.businessId,
        createdAt: serverTimestamp(),
        type: 'outbound',
        direction: 'to_supplier',
        supplierId: newPayment.customerId,
        supplierName: supplierRefObj.name,
        purchaseOrderId: linkedPO ? linkedPO.id : null,
        purchaseOrderNumber: linkedPO ? linkedPO.orderNumber : null,
        createdByUid: profile?.uid || '',
        createdByEmail: profile?.email || '',
        createdByName: profile?.displayName || profile?.name || profile?.email || 'N/A'
      };

      const docRef = await addDoc(collection(db, `businesses/${profile.businessId}/payments`), paymentData);

      // Register payment in supplier_payments list for accounting ledger
      await addDoc(collection(db, `businesses/${profile.businessId}/supplier_payments`), {
        supplierId: newPayment.customerId,
        supplierName: supplierRefObj.name,
        purchaseOrderId: linkedPO ? linkedPO.id : null,
        purchaseOrderNumber: linkedPO ? linkedPO.orderNumber : null,
        amountPaid: amountToPay,
        paymentMethod: newPayment.method,
        date: newPayment.date,
        notes: newPayment.reference.trim() || (linkedPO ? `Amortização de PO ${linkedPO.orderNumber} via Pagamentos` : 'Pagamento geral a fornecedor via Pagamentos'),
        createdAt: serverTimestamp()
      });

      await batch.commit();

      toast.success("Pagamento ao fornecedor registado com sucesso!");

      setPreviewPayment({
        payment: { id: docRef.id, ...paymentData },
        customerName: supplierRefObj.name,
        customerBalance: 0,
        isSupplier: true
      });

      setPromptLinkPO(null);
      setIsRecording(false);
      setNewPayment({
        customerId: '',
        amount: 0,
        method: 'cash',
        reference: '',
        date: new Date().toISOString().split('T')[0]
      });
    } catch (e) {
      console.error(e);
      toast.error("Erro ao registar pagamento ao fornecedor");
    }
  };

  const handleQuickAdd = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!profile?.businessId) return;
    if (!quickAddName.trim()) {
      toast.error("O nome é obrigatório.");
      return;
    }

    setIsSavingQuickAdd(true);
    try {
      const collName = paymentDirection === 'outbound' ? 'suppliers' : 'customers';
      const entityData = paymentDirection === 'outbound'
        ? {
            name: quickAddName.trim(),
            phone: quickAddPhone.trim(),
            email: quickAddEmail.trim(),
            contactPerson: '',
            category: '',
            address: '',
            notes: '',
            balance: 0,
            businessId: profile.businessId,
            createdAt: serverTimestamp()
          }
        : {
            name: quickAddName.trim(),
            phone: quickAddPhone.trim(),
            email: quickAddEmail.trim(),
            address: '',
            notes: '',
            totalSpent: 0,
            outstandingBalance: 0,
            businessId: profile.businessId,
            createdAt: serverTimestamp()
          };

      const docRef = await addDoc(collection(db, `businesses/${profile.businessId}/${collName}`), entityData);

      setNewPayment(prev => ({ ...prev, customerId: docRef.id }));
      setSearchQuery('');
      setIsOpen(false);
      setShowAddModal(false);

      setQuickAddName('');
      setQuickAddPhone('');
      setQuickAddEmail('');

      toast.success(paymentDirection === 'outbound' ? "Fornecedor registado e selecionado!" : "Cliente registado e selecionado!");
    } catch (error) {
      console.error("Error in quick add:", error);
      toast.error("Erro ao registar novo perfil.");
    } finally {
      setIsSavingQuickAdd(false);
    }
  };

  const handleRecordPayment = async () => {
    if (!profile?.businessId || !newPayment.customerId || newPayment.amount <= 0) {
      toast.error("Por favor, preencha todos os campos obrigatórios e insira um valor válido.");
      return;
    }

    if (paymentDirection === 'outbound') {
      const supplierRefObj = suppliers.find(s => s.id === newPayment.customerId);
      if (!supplierRefObj) {
        toast.error("Fornecedor não encontrado.");
        return;
      }

      // Check if there are outstanding POs for this supplier
      const suppPOs = purchaseOrders.filter(po => {
        if (po.supplierId !== newPayment.customerId) return false;
        if (po.paymentType !== 'credit') return false;
        const oBal = po.outstandingBalance !== undefined ? po.outstandingBalance : ((po.totalCost || po.amount || 0) - (po.paidAmount || po.amountPaid || 0));
        return oBal > 0;
      });

      if (suppPOs.length > 0) {
        setPromptLinkPO(suppPOs);
      } else {
        await submitSupplierPayment(null);
      }
      return;
    }

    const customerRefObj = customers.find(c => c.id === newPayment.customerId);
    const outstandingDebt = customerRefObj ? Number(customerRefObj.outstandingBalance || 0) : 0;

    if (outstandingDebt <= 0) {
      toast.error("Este cliente de momento não possui nenhum saldo devedor/dívida ativa pendente.");
      return;
    }

    if (newPayment.amount > outstandingDebt) {
      toast.error(`Não é possível registrar um pagamento superior à dívida. O saldo devedor atual deste cliente é de ${outstandingDebt.toLocaleString()} MT.`);
      return;
    }

    try {
      // Fetch customer's unpaid invoices and allocate payment (FIFO)
      const invoicesRef = collection(db, `businesses/${profile.businessId}/invoices`);
      const qInvoices = query(invoicesRef, where('customerId', '==', newPayment.customerId));
      const invoicesSnap = await getDocs(qInvoices);
      const unpaidInvoices = invoicesSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as any))
        .filter(inv => inv.status !== 'paid' && !inv.archived)
        .sort((a, b) => {
          const tA = new Date(a.date || a.createdAt?.toDate?.() || 0).getTime();
          const tB = new Date(b.date || b.createdAt?.toDate?.() || 0).getTime();
          return tA - tB;
        });

      let amountToDistribute = newPayment.amount;
      const allocations: { invoiceId: string; invoiceNumber: string; amount: number }[] = [];
      const batch = writeBatch(db);

      for (const inv of unpaidInvoices) {
        if (amountToDistribute <= 0) break;

        const total = inv.total || 0;
        const currentPaid = inv.amountPaid || 0;
        const currentOutstanding = inv.outstandingBalance !== undefined ? inv.outstandingBalance : (total - currentPaid);

        if (currentOutstanding <= 0) continue;

        const paymentForThisInvoice = Math.min(amountToDistribute, currentOutstanding);
        const newOutstanding = currentOutstanding - paymentForThisInvoice;
        const newPaid = currentPaid + paymentForThisInvoice;
        const newStatus = newOutstanding <= 0 ? 'paid' : 'partially_paid';

        allocations.push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber || '',
          amount: paymentForThisInvoice
        });

        const auditLogEntry = {
          timestamp: new Date().toISOString(),
          userEmail: profile?.email || 'Sistema',
          actionType: 'PAGAMENTO',
          details: `Amortização de ${paymentForThisInvoice.toLocaleString('pt-MZ')} MT registada via ${newPayment.method?.toUpperCase() || 'PAGAMENTO'}.`
        };
        const updatedAuditTrail = Array.isArray(inv.auditTrail) ? [...inv.auditTrail, auditLogEntry] : [auditLogEntry];

        const invDocRef = doc(db, `businesses/${profile.businessId}/invoices`, inv.id);
        batch.update(invDocRef, {
          outstandingBalance: newOutstanding,
          amountPaid: newPaid,
          status: newStatus,
          auditTrail: updatedAuditTrail,
          updatedAt: serverTimestamp()
        });

        amountToDistribute -= paymentForThisInvoice;
      }

      const paymentData = {
        ...newPayment,
        allocations,
        businessId: profile.businessId,
        createdAt: serverTimestamp(),
        type: 'repayment',
        createdByUid: profile?.uid || '',
        createdByEmail: profile?.email || '',
        createdByName: profile?.displayName || profile?.name || profile?.email || 'N/A'
      };

      const docRef = await addDoc(collection(db, `businesses/${profile.businessId}/payments`), paymentData);

      // Update customer balance in batch too!
      const custRef = doc(db, `businesses/${profile.businessId}/customers`, newPayment.customerId);
      batch.update(custRef, {
        outstandingBalance: increment(-newPayment.amount),
        lastPaymentDate: serverTimestamp()
      });

      await batch.commit();

      const customerRefObj = customers.find(c => c.id === newPayment.customerId);
      const calculatedBalance = (customerRefObj ? Number(customerRefObj.outstandingBalance || 0) : 0) - newPayment.amount;

      toast.success(t('record_payment') + " success!");

      const savedPaymentRef = {
        id: docRef.id,
        ...paymentData
      };

      // Set the recorded payment for immediate review & print
      setPreviewPayment({
        payment: savedPaymentRef,
        customerName: customerRefObj?.name || 'Cliente Geral',
        customerBalance: calculatedBalance
      });

      setIsRecording(false);
      setNewPayment({
        customerId: '',
        amount: 0,
        method: 'cash',
        reference: '',
        date: new Date().toISOString().split('T')[0]
      });
    } catch (e) {
      toast.error("Failed to record payment");
    }
  };

  const handleApproveProof = async (proof: any) => {
    if (!profile?.businessId) return;
    setIsProcessingProof(true);
    const pLoading = toast.loading("A aprovar comprovativo e a registar pagamento...");
    try {
      const batch = writeBatch(db);

      // 1. Create native payment document
      const paymentPayload = {
        customerId: proof.customerId,
        amount: proof.amount,
        method: proof.method || 'mobile_money',
        reference: proof.reference || `Comprovativo #${proof.invoiceNumber || ''}`,
        date: new Date().toISOString().split('T')[0],
        createdAt: serverTimestamp(),
        businessId: profile.businessId,
        type: 'repayment',
        invoiceId: proof.invoiceId,
        createdByUid: profile?.uid || '',
        createdByEmail: profile?.email || '',
        createdByName: 'Portal de Comprovativos'
      };
      
      const paymentColRef = collection(db, `businesses/${profile.businessId}/payments`);
      const paymentDocRef = await addDoc(paymentColRef, paymentPayload);

      // 2. Fetch specific invoice
      const invoiceRef = doc(db, `businesses/${profile.businessId}/invoices`, proof.invoiceId);
      const invoiceSnap = await getDoc(invoiceRef);
      if (invoiceSnap.exists()) {
        const invData = invoiceSnap.data();
        const currentPaid = invData.amountPaid || 0;
        const total = invData.total || 0;
        const currentOutstanding = invData.outstandingBalance !== undefined ? invData.outstandingBalance : (total - currentPaid);
        
        const paidForThis = Math.min(proof.amount, currentOutstanding);
        const newOutstanding = Math.max(0, currentOutstanding - paidForThis);
        const newPaid = currentPaid + paidForThis;
        const newStatus = newOutstanding <= 0 ? 'paid' : 'partially_paid';

        const auditLogEntry = {
          timestamp: new Date().toISOString(),
          userEmail: profile?.email || 'Sistema',
          actionType: 'PAGAMENTO',
          details: `Comprovativo de pagamento aprovado no valor de ${proof.amount.toLocaleString('pt-MZ')} MT (via ${proof.method?.toUpperCase() || 'M-PESA'}).`
        };
        const updatedAuditTrail = Array.isArray(invData.auditTrail) ? [...invData.auditTrail, auditLogEntry] : [auditLogEntry];

        batch.update(invoiceRef, {
          outstandingBalance: newOutstanding,
          amountPaid: newPaid,
          status: newStatus,
          auditTrail: updatedAuditTrail,
          updatedAt: serverTimestamp()
        });
      }

      // 3. Update customer outstanding balance
      const custRef = doc(db, `businesses/${profile.businessId}/customers`, proof.customerId);
      batch.update(custRef, {
        outstandingBalance: increment(-proof.amount),
        lastPaymentDate: serverTimestamp()
      });

      // 4. Update proof document status
      const proofDocRef = doc(db, `businesses/${profile.businessId}/payment_proofs`, proof.id);
      batch.update(proofDocRef, {
        status: 'approved',
        approvedAt: serverTimestamp(),
        paymentId: paymentDocRef.id
      });

      await batch.commit();
      toast.dismiss(pLoading);
      toast.success("Comprovativo aprovado com sucesso! O pagamento foi registado e o saldo do cliente atualizado.");
      setViewingProof(null);
    } catch (err) {
      console.error(err);
      toast.dismiss(pLoading);
      toast.error("Erro ao aprovar o comprovativo de pagamento.");
    } finally {
      setIsProcessingProof(false);
    }
  };

  const handleRejectProof = async (proof: any) => {
    if (!profile?.businessId) return;
    if (!rejectionNotes.trim()) {
      toast.error("Por favor, indique o motivo da recusa.");
      return;
    }
    setIsProcessingProof(true);
    try {
      const proofDocRef = doc(db, `businesses/${profile.businessId}/payment_proofs`, proof.id);
      await updateDoc(proofDocRef, {
        status: 'rejected',
        rejectionReason: rejectionNotes.trim(),
        rejectedAt: serverTimestamp()
      });

      // Notify user via database notifications
      try {
        const notiRef = collection(db, `businesses/${profile.businessId}/notifications`);
        await addDoc(notiRef, {
          title: "Comprovativo Recusado",
          message: `O comprovativo enviado para a Fatura #${proof.invoiceNumber} no valor de ${proof.amount.toLocaleString()} MT foi rejeitado. Motivo: ${rejectionNotes.trim()}`,
          type: 'alert',
          read: false,
          createdAt: serverTimestamp()
        });
      } catch (err) {
        console.warn("Failed to post rejection notification:", err);
      }

      toast.success("Comprovativo recusado com sucesso.");
      setViewingProof(null);
      setShowRejectForm(false);
      setRejectionNotes('');
    } catch (err) {
      console.error(err);
      toast.error("Erro ao recusar comprovativo.");
    } finally {
      setIsProcessingProof(false);
    }
  };

  const selectedEntity = paymentDirection === 'outbound'
    ? suppliers.find(s => s.id === newPayment.customerId)
    : customers.find(c => c.id === newPayment.customerId);

  const filteredList = (paymentDirection === 'outbound' ? suppliers : customers).filter(item => {
    if (!debouncedSearchQuery.trim()) return true;
    return item.name?.toLowerCase().includes(debouncedSearchQuery.toLowerCase().trim());
  });

  const paymentMethods = [
    { id: 'cash', label: t('cash'), icon: Wallet },
    { id: 'bank_transfer', label: 'Bank Transfer', icon: Landmark },
    { id: 'mobile_money', label: 'Mobile Money', icon: Phone },
    { id: 'card', label: 'Card', icon: CreditCard }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between animate-in fade-in duration-200">
        <div>
          <h2 className="text-2xl font-black text-slate-900">{t('payment_history')}</h2>
          <p className="text-slate-500">Record and track all customer payments and collections.</p>
        </div>
        {!isRecording && (
          <button 
            type="button"
            onClick={() => setIsRecording(true)}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-2xl transition-all font-bold shadow-lg shadow-slate-900/10 cursor-pointer"
          >
            <Plus size={20} />
            {t('record_payment')}
          </button>
        )}
      </div>

      {!isRecording && (
        <div className="flex border-b border-slate-100 gap-6">
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`pb-3 font-bold text-sm tracking-wide transition-all outline-none border-b-2 cursor-pointer ${
              activeTab === 'history' 
                ? 'border-blue-600 text-blue-600' 
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            📋 {t('payment_history') || 'Histórico de Pagamentos'}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('proofs')}
            className={`pb-3 font-bold text-sm tracking-wide transition-all outline-none border-b-2 cursor-pointer flex items-center gap-2 ${
              activeTab === 'proofs' 
                ? 'border-blue-600 text-blue-600' 
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            📬 Comprovativos de Clientes
            {paymentProofs.filter(p => p.status === 'pending').length > 0 && (
              <span className="bg-rose-500 text-white text-[10px] font-black rounded-full px-1.5 py-0.5 animate-pulse">
                {paymentProofs.filter(p => p.status === 'pending').length}
              </span>
            )}
          </button>
        </div>
      )}

      {isRecording ? (
        <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-xl space-y-8 animate-in slide-in-from-top-4">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsRecording(false)} className="p-2 hover:bg-slate-100 rounded-xl">
              <ArrowLeft size={24} />
            </button>
            <h3 className="text-2xl font-black text-slate-900">{t('record_payment')}</h3>
          </div>

          {/* Payment Direction Toggle/Segmented Control */}
          <div className="bg-slate-100 p-1.5 rounded-2xl flex max-w-md">
            <button
              type="button"
              onClick={() => {
                setPaymentDirection('inbound');
                setNewPayment(prev => ({ ...prev, customerId: '' }));
              }}
              className={cn(
                "flex-1 py-3 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer",
                paymentDirection === 'inbound'
                  ? "bg-white text-blue-600 shadow-sm font-extrabold"
                  : "text-slate-500 hover:text-slate-800"
              )}
            >
              📥 Received — From Customer
            </button>
            <button
              type="button"
              onClick={() => {
                setPaymentDirection('outbound');
                setNewPayment(prev => ({ ...prev, customerId: '' }));
              }}
              className={cn(
                "flex-1 py-3 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer",
                paymentDirection === 'outbound'
                  ? "bg-white text-rose-600 shadow-sm font-extrabold"
                  : "text-slate-500 hover:text-slate-800"
              )}
            >
              📤 Paid — To Supplier
            </button>
          </div>

          <div className="grid gap-8 md:grid-cols-2">
            <div className="space-y-6">
              <div className="relative" ref={dropdownRef}>
                <label className="block text-sm font-black text-slate-400 uppercase tracking-widest mb-2">
                  {paymentDirection === 'outbound' ? 'Fornecedor' : t('customers')}
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                    <Search size={18} />
                  </span>
                  <input
                    type="text"
                    className={cn(
                      "w-full pl-11 pr-10 py-4 bg-slate-50 border-none rounded-2xl outline-none font-bold text-sm",
                      selectedEntity ? "text-slate-900 bg-blue-50/40 ring-2 ring-blue-500/30" : "text-slate-800 focus:ring-2 focus:ring-blue-500"
                    )}
                    placeholder={paymentDirection === 'outbound' ? "Type to search supplier..." : "Type to search customer..."}
                    value={selectedEntity ? selectedEntity.name : searchQuery}
                    onChange={e => {
                      if (!selectedEntity) {
                        setSearchQuery(e.target.value);
                        setIsOpen(true);
                      }
                    }}
                    onFocus={() => {
                      if (!selectedEntity) {
                        setIsOpen(true);
                      }
                    }}
                    readOnly={!!selectedEntity}
                  />
                  {selectedEntity && (
                    <button
                      type="button"
                      onClick={() => {
                        setNewPayment(prev => ({ ...prev, customerId: '' }));
                        setSearchQuery('');
                      }}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X size={18} />
                    </button>
                  )}
                </div>

                {isOpen && !selectedEntity && (
                  <div className="absolute z-50 w-full mt-2 bg-white rounded-2xl border border-slate-100 shadow-xl max-h-60 overflow-y-auto divide-y divide-slate-50">
                    {filteredList.length > 0 ? (
                      filteredList.map(item => {
                        const isSupp = paymentDirection === 'outbound';
                        const outstanding = isSupp ? getSupplierOutstanding(item.id) : Number(item.outstandingBalance || 0);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setNewPayment(prev => ({ ...prev, customerId: item.id }));
                              setIsOpen(false);
                            }}
                            className="w-full text-left p-4 hover:bg-slate-50 transition-colors flex justify-between items-center cursor-pointer"
                          >
                            <span className="font-bold text-slate-900">{item.name}</span>
                            {outstanding > 0 && (
                              <span className={cn(
                                "text-xs font-bold px-2 py-1 rounded-full",
                                isSupp ? "bg-rose-50 text-rose-600" : "bg-blue-50 text-blue-600"
                              )}>
                                Dívida: {outstanding.toLocaleString()} {currency}
                              </span>
                            )}
                          </button>
                        );
                      })
                    ) : (
                      <div className="p-4 text-sm text-slate-500 text-center font-semibold">
                        Nenhum resultado encontrado.
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setQuickAddName(searchQuery);
                        setShowAddModal(true);
                        setIsOpen(false);
                      }}
                      className="w-full text-left p-4 hover:bg-blue-50/50 text-blue-600 hover:text-blue-700 font-bold text-sm transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      <Plus size={16} />
                      {paymentDirection === 'outbound' ? '+ Add new supplier' : '+ Add new customer'}
                      {searchQuery.trim() && <span className="text-slate-400 font-medium">"{searchQuery}"</span>}
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-black text-slate-400 uppercase tracking-widest mb-2">
                  {paymentDirection === 'outbound' ? 'Amount Paid to Supplier' : t('amount_paid')}
                </label>
                <div className="relative">
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">{currency}</span>
                  <input 
                    type="number"
                    className="w-full p-6 pr-14 bg-slate-50 border-none rounded-2xl text-3xl font-black text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="0.00"
                    value={newPayment.amount || ''}
                    onChange={e => setNewPayment({...newPayment, amount: Number(e.target.value)})}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-black text-slate-400 uppercase tracking-widest mb-2">{t('payment_method')}</label>
                <div className="grid grid-cols-2 gap-3">
                  {paymentMethods.map(m => (
                    <button
                      key={m.id}
                      onClick={() => setNewPayment({...newPayment, method: m.id})}
                      className={cn(
                        "flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all",
                        newPayment.method === m.id ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-50 hover:border-blue-100 text-slate-600"
                      )}
                    >
                      <m.icon size={24} />
                      <span className="text-[10px] font-black uppercase tracking-widest">{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-black text-slate-400 uppercase tracking-widest mb-2">Reference / Notes</label>
                <input 
                  className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                  placeholder="e.g. Transaction ID, Check #"
                  value={newPayment.reference}
                  onChange={e => setNewPayment({...newPayment, reference: e.target.value})}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button 
              onClick={handleRecordPayment}
              className={cn(
                "px-12 py-5 text-white rounded-3xl font-black text-lg shadow-xl transition-all active:scale-95",
                paymentDirection === 'outbound' 
                  ? "bg-rose-600 hover:bg-rose-700 shadow-rose-500/20" 
                  : "bg-blue-600 hover:bg-blue-700 shadow-blue-500/20"
              )}
            >
              {paymentDirection === 'outbound' ? 'Record Supplier Payment' : 'Record Customer Payment'}
            </button>
          </div>
        </div>      ) : (
        activeTab === 'history' ? (
        <div className="bg-white rounded-[40px] border border-slate-100 overflow-hidden shadow-sm animate-in fade-in duration-200">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="p-6 text-xs font-black uppercase tracking-widest text-slate-400">{t('date')}</th>
                <th className="p-6 text-xs font-black uppercase tracking-widest text-slate-400">Entidade / Beneficiário</th>
                <th className="p-6 text-xs font-black uppercase tracking-widest text-slate-400">{t('payment_method')}</th>
                <th className="p-6 text-xs font-black uppercase tracking-widest text-slate-400">{t('amount_paid')}</th>
                <th className="p-6 text-xs font-black uppercase tracking-widest text-slate-400">Reference</th>
                <th className="p-6 text-xs font-black uppercase tracking-widest text-slate-400 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {payments.map((p) => {
                const isOutbound = p.direction === 'to_supplier' || p.type === 'outbound';
                const customerObj = !isOutbound ? customers.find(c => c.id === p.customerId) : null;
                const supplierObj = isOutbound ? suppliers.find(s => s.id === (p.supplierId || p.customerId)) : null;
                const entityName = isOutbound ? (supplierObj?.name || p.supplierName || 'Fornecedor') : (customerObj?.name || 'Cliente Geral');
                return (
                  <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-6 font-bold text-slate-500">
                      <div className="flex items-center gap-2">
                        <Calendar size={16} />
                        {p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString('pt-MZ') : p.date ? new Date(p.date).toLocaleDateString('pt-MZ') : 'N/A'}
                      </div>
                    </td>
                    <td className="p-6">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs",
                          isOutbound ? "bg-rose-50 text-rose-500" : "bg-emerald-50 text-emerald-500"
                        )}>
                          {isOutbound ? "OUT" : "IN"}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-black text-slate-900 flex items-center gap-1.5">
                            {entityName}
                            <span className={cn(
                              "text-xs px-2 py-0.5 rounded-full font-bold",
                              isOutbound ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"
                            )}>
                              {isOutbound ? "↘ Fornecedor" : "↗ Cliente"}
                            </span>
                          </span>
                          {isOutbound && p.purchaseOrderNumber && (
                            <span className="text-[10px] text-slate-400 font-bold">
                              Ordem de Compra: #{p.purchaseOrderNumber}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-6">
                      <span className="px-3 py-1.5 bg-slate-100 rounded-lg text-[10px] font-black uppercase tracking-widest text-slate-600">
                        {p.method?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="p-6 mt-1">
                      <span className={cn(
                        "text-xl font-black",
                        isOutbound ? "text-rose-600" : "text-emerald-600"
                      )}>
                        {isOutbound ? "-" : ""}{Number(p.amount || 0).toLocaleString()} {currency}
                      </span>
                    </td>
                    <td className="p-6 font-bold text-slate-400">
                      {p.reference || '-'}
                    </td>
                    <td className="p-6 text-right font-bold flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const businessPrintInfo = {
                            name: businessData?.name || profile?.businessName || 'Sabush System ERP',
                            address: businessData?.address || '',
                            phone: businessData?.phone || '',
                            email: businessData?.email || '',
                            taxId: businessData?.taxId || ''
                          };
                          const printerType = businessData?.printerType || 'standard';
                          const nameToPrint = isOutbound ? (supplierObj?.name || p.supplierName || 'Fornecedor') : (customerObj?.name || 'Cliente Geral');
                          const balanceToPrint = isOutbound ? 0 : (customerObj ? Number(customerObj.outstandingBalance || 0) : 0);
                          printPaymentReceiptHTML(
                            {
                              id: p.id,
                              amount: p.amount,
                              method: p.method,
                              reference: p.reference,
                              date: p.date || (p.createdAt?.toDate ? p.createdAt.toDate().toISOString() : new Date().toISOString())
                            },
                            nameToPrint,
                            balanceToPrint,
                            businessPrintInfo,
                            printerType
                          );
                        }}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-850 text-white rounded-xl transition-all inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-extrabold cursor-pointer active:scale-95 shadow-sm"
                        title="Imprimir Recibo de Pagamento"
                      >
                        <Printer size={12} />
                        <span>Imprimir</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const company = {
                            name: businessData?.name || profile?.businessName || 'Sabush System ERP',
                            address: businessData?.address || '',
                            phone: businessData?.phone || '',
                            email: businessData?.email || '',
                            nuit: businessData?.taxId || ''
                          };
                          const nameToPrint = isOutbound ? (supplierObj?.name || p.supplierName || 'Fornecedor') : (customerObj?.name || 'Cliente Geral');
                          const balanceToPrint = isOutbound ? 0 : (customerObj ? Number(customerObj.outstandingBalance || 0) : 0);
                          import('../lib/pdfGenerator').then(({ generatePaymentReceiptPDF }) => {
                            generatePaymentReceiptPDF(
                              {
                                id: p.id,
                                amount: p.amount,
                                method: p.method,
                                reference: p.reference,
                                date: p.date || (p.createdAt?.toDate ? p.createdAt.toDate().toISOString() : new Date().toISOString())
                              },
                              nameToPrint,
                              balanceToPrint,
                              company
                            );
                          }).catch(err => {
                            console.error("PDF Receipt error", err);
                            toast.error("Erro ao gerar recibo PDF");
                          });
                        }}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-extrabold cursor-pointer active:scale-95 shadow-sm"
                        title="Baixar PDF do Recibo"
                      >
                        <Download size={12} />
                        <span>Comprovativo PDF</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const businessPrintInfo = {
                            name: businessData?.name || profile?.businessName || 'Sabush System ERP',
                            address: businessData?.address || '',
                            phone: businessData?.phone || '',
                            email: businessData?.email || '',
                            taxId: businessData?.taxId || ''
                          };
                          const printerType = businessData?.printerType || 'standard';
                          const nameToPrint = isOutbound ? (supplierObj?.name || p.supplierName || 'Fornecedor') : (customerObj?.name || 'Cliente Geral');
                          const balanceToPrint = isOutbound ? 0 : (customerObj ? Number(customerObj.outstandingBalance || 0) : 0);
                          downloadPaymentReceiptHTML(
                            {
                              id: p.id,
                              amount: p.amount,
                              method: p.method,
                              reference: p.reference,
                              date: p.date || (p.createdAt?.toDate ? p.createdAt.toDate().toISOString() : new Date().toISOString())
                            },
                            nameToPrint,
                            balanceToPrint,
                            businessPrintInfo,
                            printerType
                          );
                        }}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-all inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-extrabold cursor-pointer active:scale-95 shadow-sm"
                        title="Baixar HTML do Recibo de Pagamento"
                      >
                        <Download size={12} />
                        <span>Baixar HTML</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
              {payments.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="p-20 text-center">
                    <div className="flex flex-col items-center gap-4 text-slate-200">
                      <Receipt size={64} className="opacity-10" />
                      <p className="font-black uppercase tracking-widest text-xs">No payments recorded yet</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
        ) : (
          <div className="bg-white rounded-[40px] border border-slate-100 overflow-hidden shadow-sm space-y-4 animate-in fade-in duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider">Comprovativos Submetidos por Clientes</h3>
                <p className="text-xs text-slate-500">Valide os talões/prints de transferência e aprove para lançar o pagamento automaticamente.</p>
              </div>
              <span className="p-2 bg-blue-50 text-blue-700 rounded-xl text-xs font-black">
                {paymentProofs.length} comprovativos no total
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left font-sans text-xs">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100 text-slate-400 font-extrabold uppercase text-[10px]">
                    <th className="p-6">Data Envio</th>
                    <th className="p-6">Cliente</th>
                    <th className="p-6">Fatura Ref</th>
                    <th className="p-6 text-right font-black text-rose-500">Valor Informado</th>
                    <th className="p-6">Método</th>
                    <th className="p-6">Estado</th>
                    <th className="p-4 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {paymentProofs.map((pt) => {
                    const isPendingStatus = pt.status === 'pending';
                    const isApprovedStatus = pt.status === 'approved';
                    return (
                      <tr key={pt.id} className="hover:bg-slate-50/20 transition-colors">
                        <td className="p-6 font-bold text-slate-500">
                          {pt.createdAt?.seconds ? new Date(pt.createdAt.seconds * 1000).toLocaleString('pt-MZ') : 'N/A'}
                        </td>
                        <td className="p-6 font-semibold text-slate-800">{pt.customerName || 'Cliente Geral'}</td>
                        <td className="p-6 font-extrabold text-blue-600">Fatura #{pt.invoiceNumber || 'Geral'}</td>
                        <td className="p-6 text-right font-black text-slate-950 text-sm">
                          {Number(pt.amount || 0).toLocaleString('pt-MZ')} {currency}
                        </td>
                        <td className="p-6 uppercase font-bold text-[10px]">
                          <span className="bg-slate-100 px-2 py-1 rounded text-slate-700">
                            {pt.method}
                          </span>
                        </td>
                        <td className="p-6">
                          <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase ${
                            isApprovedStatus 
                              ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' 
                              : pt.status === 'rejected' 
                                ? 'bg-rose-50 text-rose-600 border border-rose-100'
                                : 'bg-amber-50 text-amber-600 border border-amber-100 animate-pulse'
                          }`}>
                            {pt.status === 'approved' ? 'Aprovado' : pt.status === 'rejected' ? 'Rejeitado' : 'Pendente'}
                          </span>
                          {pt.rejectionReason && (
                            <p className="text-[10px] text-rose-500 italic mt-1 font-medium select-all">Obs: {pt.rejectionReason}</p>
                          )}
                        </td>
                        <td className="p-4 text-center flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setViewingProof(pt);
                              setRejectionNotes('');
                              setShowRejectForm(false);
                            }}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] tracking-wide font-black uppercase transition-all cursor-pointer inline-flex items-center gap-1 shadow-sm border border-slate-200/50"
                          >
                            🔍 Ver Comprovativo
                          </button>
                          {isPendingStatus && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleApproveProof(pt)}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] tracking-wide font-black uppercase transition-all cursor-pointer inline-flex items-center gap-1 shadow-sm"
                              >
                                ✓ Aprovar
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setViewingProof(pt);
                                  setShowRejectForm(true);
                                }}
                                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[10px] tracking-wide font-black uppercase transition-all cursor-pointer inline-flex items-center gap-1 shadow-sm"
                              >
                                ✗ Recusar
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {paymentProofs.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-20 text-center">
                        <div className="flex flex-col items-center gap-3 text-slate-300">
                          <Receipt size={48} className="opacity-20 animate-bounce" />
                          <p className="font-bold uppercase tracking-widest text-xs text-slate-400">Nenhum comprovativo enviado no portal de clientes por enquanto.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Viewing client payment proof details verification lightbox overlay */}
      {viewingProof && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-[32px] max-w-lg w-full p-6 shadow-2xl border border-slate-100 flex flex-col space-y-6 relative animate-in fade-in zoom-in-95 duration-200 my-8">
            <button 
              type="button"
              onClick={() => { setViewingProof(null); setShowRejectForm(false); }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
            >
              <X size={20} />
            </button>

            <div>
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                🔎 Validação de Comprovativo de Cliente
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Cliente: <b className="text-slate-800">{viewingProof.customerName}</b> | Referência: <b className="text-slate-800">Fatura #{viewingProof.invoiceNumber || 'Geral'}</b>
              </p>
            </div>

            {/* Snapshot Box */}
            <div className="bg-slate-50 p-2 rounded-2xl border border-slate-200/50 flex flex-col items-center justify-center overflow-hidden">
              <span className="text-[9px] uppercase tracking-wider font-black text-slate-400 mb-1.5 font-mono">Print / Screenshot Original</span>
              {viewingProof.screenshotUrl ? (
                <img 
                  src={viewingProof.screenshotUrl} 
                  alt="Comprovativo submetido" 
                  className="max-h-[300px] object-contain rounded-xl hover:scale-[1.02] transition-all w-full cursor-zoom-in"
                  referrerPolicy="no-referrer"
                  onClick={() => {
                    const win = window.open();
                    if (win) {
                      win.document.write(`<img src="${viewingProof.screenshotUrl}" style="max-width:100%;" />`);
                    }
                  }}
                />
              ) : (
                <p className="text-xs text-slate-400 italic py-8">Nenhum anexo de imagem anexado pelo cliente.</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs p-4 bg-slate-50 rounded-2xl border border-slate-200/40">
              <div>
                <span className="text-[10px] text-slate-400 font-extrabold uppercase">Valor Pago</span>
                <p className="text-sm font-black text-slate-900">{Number(viewingProof.amount || 0).toLocaleString()} {currency}</p>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-extrabold uppercase">Método de Envio</span>
                <p className="text-sm font-black text-slate-900 uppercase">{viewingProof.method}</p>
              </div>
              {viewingProof.reference && (
                <div className="col-span-2 border-t border-slate-200/40 pt-2">
                  <span className="text-[10px] text-slate-400 font-extrabold uppercase">Ref. da Transação</span>
                  <p className="font-mono text-slate-800 font-bold">{viewingProof.reference}</p>
                </div>
              )}
              {viewingProof.notes && (
                <div className="col-span-2 border-t border-slate-200/40 pt-2">
                  <span className="text-[10px] text-slate-400 font-extrabold uppercase font-sans">Notas do Cliente</span>
                  <p className="text-slate-600 font-medium whitespace-pre-line">{viewingProof.notes}</p>
                </div>
              )}
            </div>

            {showRejectForm ? (
              <div className="space-y-3 bg-rose-50 border border-rose-100 p-4 rounded-2xl animate-in slide-in-from-bottom-2 duration-250">
                <label className="text-xs font-black text-rose-800 block">Indique o motivo da recusa ou divergência:</label>
                <textarea
                  rows={2}
                  className="w-full p-2.5 bg-white border border-rose-200 rounded-xl text-xs outline-none focus:border-rose-500 font-medium"
                  placeholder="Ex: Valor incorreto, screenshot cortado ou ilegível..."
                  value={rejectionNotes}
                  onChange={e => setRejectionNotes(e.target.value)}
                />
                <div className="flex justify-end gap-2 text-xs font-black">
                  <button
                    type="button"
                    onClick={() => setShowRejectForm(false)}
                    className="p-2 text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    Voltar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRejectProof(viewingProof)}
                    disabled={isProcessingProof}
                    className="p-2 px-4 bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-all cursor-pointer"
                  >
                    Confirmar Recusa
                  </button>
                </div>
              </div>
            ) : (
              viewingProof.status === 'pending' && (
                <div className="flex gap-3 justify-end text-xs font-black">
                  <button
                    type="button"
                    onClick={() => setShowRejectForm(true)}
                    className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-xl transition-all font-bold cursor-pointer"
                  >
                    ✗ Recusar Comprovativo
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApproveProof(viewingProof)}
                    disabled={isProcessingProof}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-all shadow-lg shadow-emerald-500/10 flex items-center gap-1 cursor-pointer"
                  >
                    ✓ Validar & Aprovar
                  </button>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* Modern interactive receipt preview overlay modal */}
      {previewPayment && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] max-w-md w-full p-6 shadow-2xl border border-slate-100 flex flex-col space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <span className="text-xl">🧾</span> Recibo Gerado com Sucesso!
              </h3>
              <button 
                onClick={() => setPreviewPayment(null)} 
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-900 text-sm font-extrabold transition-all cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 bg-slate-50/70 border border-slate-100 rounded-2xl space-y-3.5 text-xs text-slate-600">
              <div className="flex justify-between items-center border-b border-dashed border-slate-150 pb-2">
                <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">
                  {previewPayment.isSupplier ? 'Fornecedor:' : 'Cliente:'}
                </span>
                <span className="font-black text-slate-900 text-right">{previewPayment.customerName}</span>
              </div>
              <div className="flex justify-between items-center border-b border-dashed border-slate-150 pb-2">
                <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Data do Pagamento:</span>
                <span className="font-black text-slate-900">{new Date(previewPayment.payment.date).toLocaleDateString('pt-MZ')}</span>
              </div>
              <div className="flex justify-between items-center border-b border-dashed border-slate-150 pb-2">
                <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Meio de Pagamento:</span>
                <span className="font-black text-slate-900 uppercase">
                  {previewPayment.payment.method === 'cash' ? 'Dinheiro' : previewPayment.payment.method === 'card' ? 'Cartão' : previewPayment.payment.method === 'mobile_money' ? 'Mobile Money' : 'Transf. Bancária'}
                </span>
              </div>
              {previewPayment.payment.reference && (
                <div className="flex justify-between items-center border-b border-dashed border-slate-150 pb-2">
                  <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Referência:</span>
                  <span className="font-bold text-slate-800">{previewPayment.payment.reference}</span>
                </div>
              )}
              <div className="pt-2 flex justify-between items-baseline border-b border-dashed border-slate-150 pb-3">
                <span className={cn(
                  "font-black uppercase text-[10px] tracking-wider",
                  previewPayment.isSupplier ? "text-rose-700" : "text-emerald-700"
                )}>
                  {previewPayment.isSupplier ? 'Valor Pago ao Fornecedor:' : 'Valor Pago Efectivado:'}
                </span>
                <span className={cn(
                  "text-xl font-black font-mono",
                  previewPayment.isSupplier ? "text-rose-600" : "text-emerald-600"
                )}>
                  {Number(previewPayment.payment.amount || 0).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} MT
                </span>
              </div>
              {!previewPayment.isSupplier && (
                <div className="flex justify-between items-baseline pt-1">
                  <span className="text-red-500 font-black uppercase text-[10px] tracking-wider">Saldo Devedor Restante:</span>
                  <span className="font-black text-red-650 font-mono text-sm">
                    {Number(previewPayment.customerBalance || 0).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} MT
                  </span>
                </div>
              )}
            </div>

            <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-2xl flex flex-col gap-1 text-[10px] text-blue-850 leading-normal">
              <span className="font-extrabold flex items-center gap-1">💡 Dica de Impressão Sem Bloqueios:</span>
              <p>Os navegadores e visualizadores web às vezes bloqueiam a janela pop-up de impressão direta (erro sandbox). Clique em <strong>Descarregar Recibo</strong> para gerar o arquivo HTML autónomo e imprimir livremente sem qualquer restrição!</p>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <div className="grid grid-cols-3 gap-1.5 w-full">
                <button
                  type="button"
                  onClick={() => {
                    const businessPrintInfo = {
                      name: businessData?.name || profile?.businessName || 'Sabush System ERP',
                      address: businessData?.address || '',
                      phone: businessData?.phone || '',
                      email: businessData?.email || '',
                      taxId: businessData?.taxId || ''
                    };
                    const printerType = businessData?.printerType || 'standard';
                    printPaymentReceiptHTML(
                      previewPayment.payment,
                      previewPayment.customerName,
                      previewPayment.customerBalance,
                      businessPrintInfo,
                      printerType
                    );
                  }}
                  className="py-3 bg-slate-900 hover:bg-slate-800 text-white font-black rounded-xl transition-all text-[10px] uppercase tracking-wider flex flex-col items-center justify-center gap-1 shadow-md cursor-pointer active:scale-95"
                >
                  <Printer size={14} />
                  <span>Imprimir</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const company = {
                      name: businessData?.name || profile?.businessName || 'Sabush System ERP',
                      address: businessData?.address || '',
                      phone: businessData?.phone || '',
                      email: businessData?.email || '',
                      nuit: businessData?.taxId || ''
                    };
                    import('../lib/pdfGenerator').then(({ generatePaymentReceiptPDF }) => {
                      generatePaymentReceiptPDF(
                        previewPayment.payment,
                        previewPayment.customerName,
                        previewPayment.customerBalance,
                        company
                      );
                    }).catch(err => {
                      console.error("PDF Receipt generation failed", err);
                      toast.error("Erro ao gerar PDF");
                    });
                  }}
                  className="py-3 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl transition-all text-[10px] uppercase tracking-wider flex flex-col items-center justify-center gap-1 shadow-md cursor-pointer active:scale-95"
                >
                  <Download size={14} />
                  <span>Gerar PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const businessPrintInfo = {
                      name: businessData?.name || profile?.businessName || 'Sabush System ERP',
                      address: businessData?.address || '',
                      phone: businessData?.phone || '',
                      email: businessData?.email || '',
                      taxId: businessData?.taxId || ''
                    };
                    const printerType = businessData?.printerType || 'standard';
                    downloadPaymentReceiptHTML(
                      previewPayment.payment,
                      previewPayment.customerName,
                      previewPayment.customerBalance,
                      businessPrintInfo,
                      printerType
                    );
                  }}
                  className="py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl transition-all text-[10px] uppercase tracking-wider flex flex-col items-center justify-center gap-1 shadow-md cursor-pointer active:scale-95"
                >
                  <Download size={14} />
                  <span>Baixar HTML</span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => setPreviewPayment(null)}
                className="w-full py-3 text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 transition-all rounded-xl font-black text-xs uppercase tracking-widest active:scale-95 cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* PO Link Prompt Modal */}
      {promptLinkPO && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] max-w-lg w-full p-6 shadow-2xl border border-slate-100 flex flex-col space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <span>🔗</span> Vincular a uma Ordem de Compra?
              </h3>
              <button 
                onClick={() => setPromptLinkPO(null)} 
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-900 text-sm font-extrabold transition-all cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-slate-600 text-sm leading-relaxed font-medium">
              Encontrámos Ordens de Compra pendentes com saldo devedor para este fornecedor. Deseja amortizar a dívida de uma Ordem de Compra específica ou registrar o pagamento como geral?
            </p>

            <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
              {promptLinkPO.map((po) => {
                const outstanding = po.outstandingBalance !== undefined ? po.outstandingBalance : ((po.totalCost || po.amount || 0) - (po.paidAmount || po.amountPaid || 0));
                return (
                  <button
                    key={po.id}
                    onClick={() => submitSupplierPayment(po)}
                    className="w-full text-left p-4 rounded-2xl border-2 border-slate-100 hover:border-blue-500 hover:bg-blue-50/20 transition-all flex justify-between items-center group cursor-pointer"
                  >
                    <div>
                      <div className="font-black text-slate-900 group-hover:text-blue-600">
                        Ordem de Compra #{po.orderNumber}
                      </div>
                      <div className="text-xs text-slate-400 font-bold">
                        Data: {new Date(po.createdAt?.seconds ? po.createdAt.seconds * 1000 : po.date || Date.now()).toLocaleDateString('pt-MZ')}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-extrabold text-slate-800 font-mono">
                        {outstanding.toLocaleString()} {currency}
                      </div>
                      <div className="text-[10px] uppercase font-black tracking-wider text-rose-500">
                        Dívida Pendente
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => submitSupplierPayment(null)}
                className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-sm uppercase tracking-wider cursor-pointer transition-all text-center active:scale-95"
              >
                Continuar como Pagamento Geral (Sem Vincular)
              </button>
              <button
                type="button"
                onClick={() => setPromptLinkPO(null)}
                className="w-full py-4 bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 rounded-2xl font-black text-sm uppercase tracking-wider cursor-pointer transition-all text-center active:scale-95"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Quick Add Customer/Supplier Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] max-w-md w-full p-6 shadow-2xl border border-slate-100 flex flex-col space-y-6 animate-in fade-in zoom-in-95 duration-200 font-sans">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <span>✨</span> {paymentDirection === 'outbound' ? 'Novo Fornecedor Rápido' : 'Novo Cliente Rápido'}
              </h3>
              <button 
                onClick={() => setShowAddModal(false)} 
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-900 text-sm font-extrabold transition-all cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleQuickAdd} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
                  Nome / Razão Social *
                </label>
                <input 
                  type="text"
                  required
                  className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-slate-850 text-sm"
                  value={quickAddName}
                  onChange={e => setQuickAddName(e.target.value)}
                  placeholder="Ex: Nome do Perfil"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
                  Telefone / Contacto
                </label>
                <input 
                  type="tel"
                  className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-slate-850 font-mono text-sm"
                  value={quickAddPhone}
                  onChange={e => setQuickAddPhone(e.target.value)}
                  placeholder="Ex: +258 84 000 0000"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
                  Email
                </label>
                <input 
                  type="email"
                  className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-slate-850 text-sm"
                  value={quickAddEmail}
                  onChange={e => setQuickAddEmail(e.target.value)}
                  placeholder="Ex: contacto@empresa.com"
                />
              </div>

              <div className="flex flex-col gap-2 pt-4 border-t border-slate-100">
                <button
                  type="submit"
                  disabled={isSavingQuickAdd}
                  className={cn(
                    "w-full py-4 text-white rounded-2xl font-black text-sm uppercase tracking-wider cursor-pointer transition-all text-center active:scale-95 flex items-center justify-center gap-2",
                    paymentDirection === 'outbound' ? "bg-rose-600 hover:bg-rose-700" : "bg-blue-600 hover:bg-blue-700",
                    isSavingQuickAdd && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {isSavingQuickAdd ? 'A carregar...' : 'Salvar e Selecionar'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="w-full py-4 bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 rounded-2xl font-black text-sm uppercase tracking-wider cursor-pointer transition-all text-center active:scale-95"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
