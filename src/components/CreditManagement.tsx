import React, { useState, useEffect, useMemo } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, onSnapshot, where, getDocs, addDoc, serverTimestamp, doc, updateDoc, increment, writeBatch } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { DollarSign, Search, Users, AlertCircle, Calendar, ArrowUpRight, ArrowDownLeft, FileText, Download, Send, MessageCircle, Printer, Briefcase, Truck, Wallet, CheckCircle, Filter, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatSystemCurrency, formatCurrencyValue } from '../lib/currencies';
import { subscribeToCollection } from '../lib/firestoreCache';
import ClientInvoiceDebtSection from './ClientInvoiceDebtSection';
import SupplierDebtSection from './SupplierDebtSection';

export default function CreditManagement() {
  const { profile, businessData } = useAuth();
  const { t, i18n } = useTranslation();
  const currency = businessData?.currency || 'MZN';
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [repaymentAmount, setRepaymentAmount] = useState('');
  const [visibleClientTxCount, setVisibleClientTxCount] = useState(10);
  const [isRepaying, setIsRepaying] = useState(false);

  // Top level section: 'clients' vs 'suppliers'
  const [mainTab, setMainTab] = useState<'clients' | 'suppliers'>('clients');

  // Client sub-tab toggle: 'grouped' (customer summary) vs 'individual' (per-invoice debt tracking)
  const [clientSubTab, setClientSubTab] = useState<'grouped' | 'individual'>('grouped');
  const [allInvoices, setAllInvoices] = useState<any[]>([]);
  const [clientInvoiceSearch, setClientInvoiceSearch] = useState('');
  const [clientInvoiceStatusFilter, setClientInvoiceStatusFilter] = useState<'all' | 'unpaid' | 'overdue' | 'partially_paid'>('all');
  const [selectedClientFilterId, setSelectedClientFilterId] = useState('all');

  // Supplier debt management states
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [supplierPayments, setSupplierPayments] = useState<any[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<any | null>(null);
  const [supplierSearchTerm, setSupplierSearchTerm] = useState('');
  const [supplierFilterType, setSupplierFilterType] = useState<'debtors' | 'all'>('debtors');

  // Supplier paying states
  const [payingSupplierDoc, setPayingSupplierDoc] = useState<any | null>(null);
  const [payingSupplierDocType, setPayingSupplierDocType] = useState<'expense' | 'purchase_order'>('expense');
  const [supplierPayAmount, setSupplierPayAmount] = useState('');
  const [supplierPayMethod, setSupplierPayMethod] = useState('Dinheiro');
  const [supplierPayDate, setSupplierPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [supplierPayNotes, setSupplierPayNotes] = useState('');
  const [isRecordingSupplierPayment, setIsRecordingSupplierPayment] = useState(false);

  // Advanced features state
  const [clientPendingOnly, setClientPendingOnly] = useState<boolean>(() => {
    const saved = localStorage.getItem('credit_client_pending_only');
    return saved !== null ? saved === 'true' : true;
  });
  const [supplierPendingOnly, setSupplierPendingOnly] = useState<boolean>(() => {
    const saved = localStorage.getItem('credit_supplier_pending_only');
    return saved !== null ? saved === 'true' : true;
  });
  const [repaymentMethod, setRepaymentMethod] = useState('cash');
  const [repaymentReference, setRepaymentReference] = useState('');
  const [isAdjustingLimit, setIsAdjustingLimit] = useState(false);
  const [previewPayment, setPreviewPayment] = useState<{
    payment: {
      id?: string;
      amount: number;
      method: string;
      reference?: string;
      date: string;
    };
    customerName: string;
    customerBalance: number;
  } | null>(null);
  const [newCreditLimit, setNewCreditLimit] = useState('');
  const [isUpdatingLimit, setIsUpdatingLimit] = useState(false);

  // Persist toggles on change
  useEffect(() => {
    localStorage.setItem('credit_client_pending_only', String(clientPendingOnly));
  }, [clientPendingOnly]);

  useEffect(() => {
    localStorage.setItem('credit_supplier_pending_only', String(supplierPendingOnly));
  }, [supplierPendingOnly]);

  useEffect(() => {
    if (!profile?.businessId) return;

    // Retrieve all customers for client-side filtering
    const q = query(
      collection(db, `businesses/${profile.businessId}/customers`)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCustomers(list);
      
      // Keep selected customer synchronized reactively
      if (selectedCustomer) {
        const found = list.find(c => c.id === selectedCustomer.id);
        if (found) {
          setSelectedCustomer(found);
        }
      }
      setLoading(false);
    }, error => {
      setLoading(false);
      try {
        handleFirestoreError(error, OperationType.LIST, 'customers_credit');
      } catch (e) {
        console.warn("Gracefully logged customers credit query error:", e);
      }
    });

    return unsubscribe;
  }, [profile?.businessId]);

  // Suppliers subscriptions
  useEffect(() => {
    if (!profile?.businessId) return;

    const qSuppliers = query(collection(db, `businesses/${profile.businessId}/suppliers`));
    const unsubSuppliers = subscribeToCollection(
      `businesses/${profile.businessId}/suppliers`,
      (items) => {
        setSuppliers(items);
        if (selectedSupplier) {
          const found = items.find(s => s.id === selectedSupplier.id);
          if (found) {
            setSelectedSupplier(found);
          }
        }
      },
      qSuppliers
    );

    const qExpenses = query(collection(db, `businesses/${profile.businessId}/expenses`));
    const unsubExpenses = subscribeToCollection(
      `businesses/${profile.businessId}/expenses`,
      (items) => {
        setExpenses(items);
      },
      qExpenses
    );

    const qPOs = query(collection(db, `businesses/${profile.businessId}/purchase_orders`));
    const unsubPOs = subscribeToCollection(
      `businesses/${profile.businessId}/purchase_orders`,
      (items) => {
        setPurchaseOrders(items);
      },
      qPOs
    );

    const qPayments = query(collection(db, `businesses/${profile.businessId}/supplier_payments`));
    const unsubPayments = subscribeToCollection(
      `businesses/${profile.businessId}/supplier_payments`,
      (items) => {
        setSupplierPayments(items);
      },
      qPayments
    );

    const qInvoices = query(collection(db, `businesses/${profile.businessId}/invoices`));
    const unsubInvoices = subscribeToCollection(
      `businesses/${profile.businessId}/invoices`,
      (items) => {
        setAllInvoices(items);
      },
      qInvoices
    );

    return () => {
      unsubSuppliers();
      unsubExpenses();
      unsubPOs();
      unsubPayments();
      unsubInvoices();
    };
  }, [profile?.businessId]);

  // Client calculations and helpers
  const isInvoiceOverdue = (inv: any) => {
    if (inv.status === 'paid' || (inv.outstandingBalance !== undefined ? inv.outstandingBalance : (inv.total - (inv.amountPaid || 0))) <= 0) return false;
    if (!inv.dueDate) return false;
    const due = new Date(inv.dueDate);
    const today = new Date();
    today.setHours(0,0,0,0);
    due.setHours(0,0,0,0);
    return due < today;
  };

  const getCustomerName = (customerId: string) => {
    const cust = customers.find(c => c.id === customerId);
    return cust ? cust.name : 'Cliente Geral';
  };

  const getCustomerObj = (customerId: string) => {
    return customers.find(c => c.id === customerId);
  };

  // Supplier calculations
  const getSupplierOutstanding = (supplierId: string) => {
    const expensesOut = expenses
      .filter(exp => exp.supplierId === supplierId)
      .reduce((sum, exp) => sum + (exp.outstandingBalance || 0), 0);
    const posOut = purchaseOrders
      .filter(po => po.supplierId === supplierId && po.paymentType === 'credit')
      .reduce((sum, po) => sum + (po.outstandingBalance || 0), 0);
    return expensesOut + posOut;
  };

  const getSupplierTotalPaid = (supplierId: string) => {
    const expensesPaid = expenses
      .filter(exp => exp.supplierId === supplierId)
      .reduce((sum, exp) => sum + (exp.amountPaid || 0), 0);
    const posPaid = purchaseOrders
      .filter(po => po.supplierId === supplierId)
      .reduce((sum, po) => sum + (po.paidAmount || 0), 0);
    return expensesPaid + posPaid;
  };

  const getSupplierTotalCommitment = (supplierId: string) => {
    const expensesTotal = expenses
      .filter(exp => exp.supplierId === supplierId)
      .reduce((sum, exp) => sum + (exp.amount || 0), 0);
    const posTotal = purchaseOrders
      .filter(po => po.supplierId === supplierId)
      .reduce((sum, po) => sum + (po.totalCost || 0), 0);
    return expensesTotal + posTotal;
  };

  // Filtered customer list for the client tab
  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      const matchSearch = (c.name || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchPending = !clientPendingOnly || (c.outstandingBalance || 0) > 0;
      return matchSearch && matchPending;
    });
  }, [customers, searchTerm, clientPendingOnly]);

  // Filtered supplier list for the supplier tab
  const filteredSuppliers = useMemo(() => {
    return suppliers.filter(s => {
      const matchSearch = (s.name || '').toLowerCase().includes(supplierSearchTerm.toLowerCase());
      const matchPending = !supplierPendingOnly || getSupplierOutstanding(s.id) > 0;
      return matchSearch && matchPending;
    });
  }, [suppliers, supplierSearchTerm, supplierPendingOnly, expenses, purchaseOrders]);

  // Record a payment made to supplier against an expense or PO
  const handleRecordSupplierPayment = async () => {
    if (!profile?.businessId || !selectedSupplier || !payingSupplierDoc) return;
    const amount = Number(supplierPayAmount);
    if (amount <= 0) {
      toast.error("Por favor, introduza um valor válido maior que zero.");
      return;
    }

    const currentOutstanding = payingSupplierDoc.outstandingBalance || 0;
    if (amount > currentOutstanding) {
      toast.error(`O valor do pagamento não pode ser superior à dívida atual (${currentOutstanding.toLocaleString()} ${currency}).`);
      return;
    }

    try {
      if (payingSupplierDocType === 'expense') {
        const newAmountPaid = (payingSupplierDoc.amountPaid || 0) + amount;
        const newOutstanding = Math.max(0, (payingSupplierDoc.amount || 0) - newAmountPaid);
        let nextStatus = 'Partially Paid';
        if (newOutstanding <= 0) {
          nextStatus = 'Paid';
        }

        const expenseRef = doc(db, `businesses/${profile.businessId}/expenses`, payingSupplierDoc.id);
        await updateDoc(expenseRef, {
          amountPaid: newAmountPaid,
          outstandingBalance: newOutstanding,
          paymentStatus: nextStatus,
          updatedAt: serverTimestamp()
        });

        await addDoc(collection(db, `businesses/${profile.businessId}/supplier_payments`), {
          supplierId: selectedSupplier.id,
          supplierName: selectedSupplier.name,
          expenseId: payingSupplierDoc.id,
          expenseTitle: payingSupplierDoc.title,
          amountPaid: amount,
          paymentMethod: supplierPayMethod,
          date: supplierPayDate,
          notes: supplierPayNotes.trim() || 'Amortização de Fatura/Despesa',
          createdAt: serverTimestamp()
        });

      } else {
        // purchase_order
        const newPaidAmount = (payingSupplierDoc.paidAmount || 0) + amount;
        const newOutstanding = Math.max(0, (payingSupplierDoc.totalCost || 0) - newPaidAmount);
        let nextPaymentStatus = 'unpaid';
        if (newOutstanding <= 0) {
          nextPaymentStatus = 'paid';
        } else if (newPaidAmount > 0) {
          nextPaymentStatus = 'partially_paid';
        }

        const orderRef = doc(db, `businesses/${profile.businessId}/purchase_orders`, payingSupplierDoc.id);
        await updateDoc(orderRef, {
          paidAmount: newPaidAmount,
          outstandingBalance: newOutstanding,
          paymentStatus: nextPaymentStatus,
          updatedAt: serverTimestamp()
        });

        await addDoc(collection(db, `businesses/${profile.businessId}/supplier_payments`), {
          supplierId: selectedSupplier.id,
          supplierName: selectedSupplier.name,
          purchaseOrderId: payingSupplierDoc.id,
          purchaseOrderNumber: payingSupplierDoc.orderNumber,
          amountPaid: amount,
          paymentMethod: supplierPayMethod,
          date: supplierPayDate,
          notes: supplierPayNotes.trim() || 'Amortização de Ordem de Compra',
          createdAt: serverTimestamp()
        });
      }

      toast.success("Pagamento ao fornecedor registado com sucesso!");
      setIsRecordingSupplierPayment(false);
      setPayingSupplierDoc(null);
    } catch (e) {
      console.error("Error saving supplier payment:", e);
      toast.error("Erro ao gravar pagamento.");
    }
  };

  const fetchHistory = async (customer: any) => {
    if (!profile?.businessId) return;
    if (selectedCustomer?.id === customer.id) {
      setSelectedCustomer(null);
      return;
    }
    setSelectedCustomer(customer);
    try {
      // 1. Fetch payments
      const q = query(
        collection(db, `businesses/${profile.businessId}/payments`),
        where('customerId', '==', customer.id)
      );
      const snapshot = await getDocs(q);
      const payments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), type: 'payment' }));
      
      // 2. Fetch invoices by customer.id
      const invQ = query(
        collection(db, `businesses/${profile.businessId}/invoices`),
        where('customerId', '==', customer.id)
      );
      const invSnap = await getDocs(invQ);
      let invoices = invSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), type: 'invoice' }));
      
      // 3. Fallback connection if invoices contain customerName instead of customerId
      const invQFallback = query(
        collection(db, `businesses/${profile.businessId}/invoices`),
        where('customerId', '==', customer.name)
      );
      const invSnapFallback = await getDocs(invQFallback);
      const invoicesFallback = invSnapFallback.docs.map(doc => ({ id: doc.id, ...doc.data(), type: 'invoice' }));
      
      // Deduplicate invoices
      const invoiceMap = new Map();
      invoices.forEach(i => invoiceMap.set(i.id, i));
      invoicesFallback.forEach(i => invoiceMap.set(i.id, i));
      invoices = Array.from(invoiceMap.values());
      
      const combined = [...payments, ...invoices].sort((a: any, b: any) => 
        (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0)
      );
      setTransactions(combined);
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, `businesses/${profile.businessId}/history/${customer.id}`);
      toast.error("Erro ao carregar o histórico financeiro do cliente.");
    }
  };

  const handleRepayment = async () => {
    if (!profile?.businessId || !selectedCustomer || !repaymentAmount) return;
    const amount = Number(repaymentAmount);
    if (amount <= 0) {
      toast.error("Por favor, introduza um valor válido maior que zero.");
      return;
    }

    if (amount > selectedCustomer.outstandingBalance && selectedCustomer.outstandingBalance > 0) {
      toast.error(`O valor do pagamento não pode ser superior à dívida atual (${selectedCustomer.outstandingBalance.toLocaleString()} ${currency}).`);
      return;
    }

    try {
      // 1. Query unpaid invoices (FIFO) and distribute repayment amount across them
      const invoicesRef = collection(db, `businesses/${profile.businessId}/invoices`);
      const qInvoices = query(invoicesRef, where('customerId', '==', selectedCustomer.id));
      const invoicesSnap = await getDocs(qInvoices);
      const unpaidInvoices = invoicesSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as any))
        .filter(inv => inv.status !== 'paid' && !inv.archived)
        .sort((a, b) => {
          const tA = new Date(a.date || a.createdAt?.toDate?.() || 0).getTime();
          const tB = new Date(b.date || b.createdAt?.toDate?.() || 0).getTime();
          return tA - tB;
        });

      let amountToDistribute = amount;
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
          details: `Amortização de ${paymentForThisInvoice.toLocaleString('pt-MZ')} ${currency} recebida e alocada.`
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

      // 2. Create Payment Record with chosen payment mode & custom reference
      const docRef = await addDoc(collection(db, `businesses/${profile.businessId}/payments`), {
        customerId: selectedCustomer.id,
        amount,
        method: repaymentMethod,
        reference: repaymentReference.trim(),
        type: 'repayment',
        allocations,
        businessId: profile.businessId,
        date: new Date().toISOString(),
        createdAt: serverTimestamp()
      });

      // 3. Update Customer Balance
      const custRef = doc(db, `businesses/${profile.businessId}/customers`, selectedCustomer.id);
      batch.update(custRef, {
        outstandingBalance: increment(-amount),
        lastPaymentDate: serverTimestamp(),
        totalSpent: increment(amount)
      });

      await batch.commit();

      const updatedBalance = selectedCustomer.outstandingBalance - amount;

      // Set receipt preview state for modal display
      setPreviewPayment({
        payment: {
          id: docRef.id,
          amount,
          method: repaymentMethod,
          reference: repaymentReference.trim(),
          date: new Date().toISOString()
        },
        customerName: selectedCustomer.name,
        customerBalance: updatedBalance
      });

      toast.success("Amortização registada com sucesso!");
      setIsRepaying(false);
      setRepaymentAmount('');
      setRepaymentReference('');
      setRepaymentMethod('cash');
      fetchHistory(selectedCustomer);
    } catch (e) {
      toast.error("Falha ao registar amortização de dívida.");
    }
  };

  const handleUpdateCreditLimit = async () => {
    if (!profile?.businessId || !selectedCustomer || !newCreditLimit) return;
    const limit = Number(newCreditLimit);
    if (isNaN(limit) || limit < 0) {
      toast.error("Por favor, introduza um limite de crédito válido.");
      return;
    }

    setIsUpdatingLimit(true);
    try {
      await updateDoc(doc(db, `businesses/${profile.businessId}/customers`, selectedCustomer.id), {
        creditLimit: limit
      });
      setSelectedCustomer(prev => ({ ...prev, creditLimit: limit }));
      toast.success("Limite de crédito atualizado com sucesso!");
      setIsAdjustingLimit(false);
    } catch (e) {
      toast.error("Falha ao atualizar o limite de crédito do cliente.");
    } finally {
      setIsUpdatingLimit(false);
    }
  };

  const sendReminder = (customer: any) => {
    const amount = customer.outstandingBalance.toFixed(2);
    const lang = i18n.language === 'pt' ? 'pt' : 'en';
    
    const messages = {
      en: `Dear customer ${customer.name}, your payment of ${amount} ${currency} is overdue. Please pay as soon as possible. Business: ${businessData?.name || profile?.businessName || 'Sabush System ERP'}`,
      pt: `Caro cliente ${customer.name}, o seu pagamento de ${amount} ${currency} está em atraso. Por favor efetue o pagamento o mais rápido possível. Empresa: ${businessData?.name || profile?.businessName || 'Sabush System ERP'}`
    };

    const text = encodeURIComponent(messages[lang]);
    const phone = customer.phone?.replace(/\D/g, '') || '';
    if (!phone) {
      toast.error("O cliente não tem contacto telefónico associado.");
      return;
    }
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
    toast.success("A abrir janela de lembrete no WhatsApp...");
  };

  const generateStatement = (customer: any) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    
    // Header
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, pageWidth, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('Helvetica', 'bold');
    doc.text((businessData?.name || profile?.businessName || 'Sabush System ERP').toUpperCase(), 14, 18);
    
    doc.setFontSize(9);
    doc.setFont('Helvetica', 'normal');
    doc.text('EXTRACTO DE CONTA DE CLIENTE', 14, 26);
    doc.text(`NUIT: ${businessData?.taxId || ''}`, 14, 32);
    
    doc.setFontSize(9);
    doc.text(`Endereço: ${businessData?.address || ''}`, pageWidth - 14, 18, { align: 'right' });
    doc.text(`Tel: ${businessData?.phone || profile?.phone || ''}`, pageWidth - 14, 24, { align: 'right' });
    doc.text(`Email: ${businessData?.email || profile?.email || ''}`, pageWidth - 14, 30, { align: 'right' });
    
    // Customer Info
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(14);
    doc.setFont('Helvetica', 'bold');
    doc.text(`Cliente: ${customer.name}`, 14, 55);
    
    doc.setFontSize(10);
    doc.setFont('Helvetica', 'normal');
    doc.text(`Limite de Crédito: ${(customer.creditLimit || 500).toLocaleString()} ${currency}`, 14, 62);
    doc.text(`Contacto: ${customer.phone || 'N/A'}`, 14, 67);
    doc.text(`Email: ${customer.email || 'N/A'}`, 14, 72);
    
    // Summary Box
    doc.setFillColor(248, 250, 252); // slate-50
    doc.rect(pageWidth - 85, 50, 71, 26, 'F');
    doc.setTextColor(225, 29, 72); // rose-600
    doc.setFontSize(16);
    doc.setFont('Helvetica', 'bold');
    doc.text(`${customer.outstandingBalance.toLocaleString()} ${currency}`, pageWidth - 49, 68, { align: 'center' });
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text('VALOR DE DÍVIDA ATUAL', pageWidth - 49, 58, { align: 'center' });

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(8);
    doc.text(`Gerado em: ${new Date().toLocaleString()}`, 14, 82);

    const tableData = transactions.map(t => [
      t.createdAt?.toDate ? t.createdAt.toDate().toLocaleDateString() : (t.date ? new Date(t.date).toLocaleDateString() : '-'),
      t.type === 'invoice' ? (t.invoiceNumber ? `Fatura #${t.invoiceNumber}` : 'Fatura de Venda') : (t.type === 'repayment' ? 'Amortização' : 'Pagamento'),
      t.method || (t.type === 'invoice' ? 'Venda a Crédito' : 'Dinheiro'),
      t.type === 'invoice' ? `+${(t.total || 0).toLocaleString()} ${currency}` : `-${(t.amount || t.totalPaid || 0).toLocaleString()} ${currency}`,
      t.status || (t.type === 'payment' ? 'Concluído' : 'Processado')
    ]);

    autoTable(doc, {
      startY: 87,
      head: [['Data', 'Documento/Referência', 'Método', 'Valor', 'Estado']],
      body: tableData,
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { top: 87 },
      styles: { fontSize: 9 }
    });

    // Footer
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('Obrigado pela vossa parceria comercial.', pageWidth / 2, finalY + 10, { align: 'center' });

    doc.save(`Extracto_${customer.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success("Histórico de extracto descarregado com sucesso!");
  };

  const generateGlobalReport = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    
    // Header banner
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, pageWidth, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('Helvetica', 'bold');
    doc.text((businessData?.name || profile?.businessName || 'Sabush System ERP').toUpperCase(), 14, 20);
    
    doc.setFontSize(10);
    doc.setFont('Helvetica', 'normal');
    doc.text('RELATÓRIO GERAL DE DÍVIDAS E COBRANÇAS', 14, 28);
    doc.text(`Data: ${new Date().toLocaleString()}`, pageWidth - 14, 28, { align: 'right' });
    
    // Summary info
    const totalDebt = customers.reduce((acc, c) => acc + (c.outstandingBalance || 0), 0);
    
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11);
    doc.setFont('Helvetica', 'bold');
    doc.text(`Resumo Financeiro`, 14, 52);
    
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Total de Clientes Devedores: ${customers.filter(c => (c.outstandingBalance || 0) > 0).length}`, 14, 59);
    doc.text(`Total Acumulado em Dívida: ${totalDebt.toLocaleString()} ${currency}`, 14, 65);
    
    const tableData = customers
      .filter(c => (c.outstandingBalance || 0) > 0)
      .map((c, i) => [
        i + 1,
        c.name,
        c.phone || 'N/A',
        `${(c.outstandingBalance || 0).toLocaleString()} ${currency}`,
        `${(c.creditLimit || 500).toLocaleString()} ${currency}`,
        c.lastPaymentDate ? new Date(c.lastPaymentDate?.toDate ? c.lastPaymentDate.toDate() : c.lastPaymentDate).toLocaleDateString() : 'N/A'
      ]);

    autoTable(doc, {
      startY: 75,
      head: [['#', 'Cliente', 'Contacto', 'Saldo em Dívida', 'Limite de Crédito', 'Último Pagamento']],
      body: tableData,
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { top: 75 },
      styles: { fontSize: 9 }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 15;
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('Fim do Relatório de Crédito - Sabush ERP', pageWidth / 2, finalY, { align: 'center' });

    doc.save(`Relatorio_Dividas_${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success("Relatório geral de cobrança descarregado!");
  };

  const generateSupplierStatement = (supplier: any) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    
    // Header
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, pageWidth, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('Helvetica', 'bold');
    doc.text((businessData?.name || profile?.businessName || 'Sabush System ERP').toUpperCase(), 14, 18);
    
    doc.setFontSize(9);
    doc.setFont('Helvetica', 'normal');
    doc.text('EXTRACTO DE CONTA DE FORNECEDOR', 14, 26);
    doc.text(`NUIT: ${businessData?.taxId || ''}`, 14, 32);
    
    doc.setFontSize(9);
    doc.text(`Endereço: ${businessData?.address || ''}`, pageWidth - 14, 18, { align: 'right' });
    doc.text(`Tel: ${businessData?.phone || profile?.phone || ''}`, pageWidth - 14, 24, { align: 'right' });
    doc.text(`Email: ${businessData?.email || profile?.email || ''}`, pageWidth - 14, 30, { align: 'right' });
    
    // Supplier Info
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(14);
    doc.setFont('Helvetica', 'bold');
    doc.text(`Fornecedor: ${supplier.name}`, 14, 55);
    
    doc.setFontSize(10);
    doc.setFont('Helvetica', 'normal');
    doc.text(`Categoria: ${supplier.category || 'Geral'}`, 14, 62);
    doc.text(`Contacto: ${supplier.phone || supplier.contactPerson || 'N/A'}`, 14, 67);
    doc.text(`Email: ${supplier.email || 'N/A'}`, 14, 72);
    
    // Summary Box
    const outstanding = getSupplierOutstanding(supplier.id);
    doc.setFillColor(248, 250, 252); // slate-50
    doc.rect(pageWidth - 85, 50, 71, 26, 'F');
    doc.setTextColor(225, 29, 72); // rose-600
    doc.setFontSize(16);
    doc.setFont('Helvetica', 'bold');
    doc.text(`${outstanding.toLocaleString()} ${currency}`, pageWidth - 49, 68, { align: 'center' });
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text('VALOR DE DÍVIDA ATUAL (A PAGAR)', pageWidth - 49, 58, { align: 'center' });

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(8);
    doc.text(`Gerado em: ${new Date().toLocaleString()}`, 14, 82);

    // Combine expenses and POs for history
    const supplierExpenses = expenses.filter(e => e.supplierId === supplier.id);
    const supplierPOs = purchaseOrders.filter(po => po.supplierId === supplier.id && po.paymentType === 'credit');
    const pastPayments = supplierPayments.filter(p => p.supplierId === supplier.id);

    const historyItems: any[] = [
      ...supplierExpenses.map(e => ({
        date: e.date || '',
        title: `Despesa/Fatura: ${e.title}`,
        method: 'Compra a Crédito',
        amount: `+${(e.amount || 0).toLocaleString()} ${currency}`,
        status: e.paymentStatus || 'Em Aberto',
        sortDate: new Date(e.date || 0)
      })),
      ...supplierPOs.map(po => ({
        date: po.createdAt?.toDate ? po.createdAt.toDate().toLocaleDateString() : '',
        title: `Ordem de Compra #${po.orderNumber}`,
        method: 'Crédito de Compra',
        amount: `+${(po.totalCost || 0).toLocaleString()} ${currency}`,
        status: po.paymentStatus || 'Em Aberto',
        sortDate: po.createdAt?.toDate ? po.createdAt.toDate() : new Date(0)
      })),
      ...pastPayments.map(p => ({
        date: p.date ? new Date(p.date).toLocaleDateString() : (p.paymentDate ? new Date(p.paymentDate).toLocaleDateString() : (p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString() : '')),
        title: p.purchaseOrderNumber ? `Amortização: PO #${p.purchaseOrderNumber}` : `Amortização: Fatura`,
        method: p.paymentMethod || 'Dinheiro',
        amount: `-${(p.amountPaid || p.amount || 0).toLocaleString()} ${currency}`,
        status: 'Pago',
        sortDate: p.createdAt?.toDate ? p.createdAt.toDate() : new Date(0)
      }))
    ];

    historyItems.sort((a, b) => b.sortDate.getTime() - a.sortDate.getTime());

    const tableData = historyItems.map(item => [
      item.date || '-',
      item.title,
      item.method,
      item.amount,
      item.status
    ]);

    autoTable(doc, {
      startY: 87,
      head: [['Data', 'Descrição / Operação', 'Método / Canal', 'Valor', 'Estado']],
      body: tableData,
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { top: 87 },
      styles: { fontSize: 9 }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 15;
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('Relatório de Conta Corrente de Fornecedor - Sabush ERP', pageWidth / 2, finalY, { align: 'center' });

    doc.save(`Extrato_Fornecedor_${supplier.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success("Extrato de conta do fornecedor descarregado!");
  };

  const generateGlobalSupplierReport = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    
    // Header banner
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, pageWidth, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('Helvetica', 'bold');
    doc.text((businessData?.name || profile?.businessName || 'Sabush System ERP').toUpperCase(), 14, 20);
    
    doc.setFontSize(10);
    doc.setFont('Helvetica', 'normal');
    doc.text('RELATÓRIO GERAL DE DÍVIDAS A FORNECEDORES (PASSIVO)', 14, 28);
    doc.text(`Data: ${new Date().toLocaleString()}`, pageWidth - 14, 28, { align: 'right' });
    
    // Summary info
    const debtorSuppliers = suppliers.filter(s => getSupplierOutstanding(s.id) > 0);
    const totalSupplierDebt = debtorSuppliers.reduce((acc, s) => acc + getSupplierOutstanding(s.id), 0);
    
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11);
    doc.setFont('Helvetica', 'bold');
    doc.text(`Resumo Financeiro de Passivo`, 14, 52);
    
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Total de Fornecedores com Saldos em Aberto: ${debtorSuppliers.length}`, 14, 59);
    doc.text(`Total de Passivo Acumulado: ${totalSupplierDebt.toLocaleString()} ${currency}`, 14, 65);
    
    const tableData = debtorSuppliers.map((s, i) => [
      i + 1,
      s.name,
      s.category || 'Geral',
      s.phone || s.contactPerson || 'N/A',
      `${getSupplierOutstanding(s.id).toLocaleString()} ${currency}`,
      `${getSupplierTotalPaid(s.id).toLocaleString()} ${currency}`,
      `${getSupplierTotalCommitment(s.id).toLocaleString()} ${currency}`
    ]);

    autoTable(doc, {
      startY: 75,
      head: [['#', 'Fornecedor', 'Categoria', 'Contacto', 'Dívida Pendente', 'Total Pago', 'Compromisso']],
      body: tableData,
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { top: 75 },
      styles: { fontSize: 9 }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 15;
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('Fim do Relatório de Dívidas a Fornecedores - Sabush ERP', pageWidth / 2, finalY, { align: 'center' });

    doc.save(`Relatorio_Dividas_Fornecedores_${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success("Relatório geral de passivo descarregado!");
  };

  return (
    <div className="space-y-6">
      {/* Top Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900">{t('debt_management')}</h2>
          <p className="text-slate-500">Acompanhar saldos devedores, limites de crédito acordados e status de cobrança.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {mainTab === 'clients' ? (
            <>
              <button
                onClick={generateGlobalReport}
                className="px-4 py-3 bg-white border border-slate-200 text-slate-700 hover:text-blue-600 rounded-2xl flex items-center gap-2 font-bold text-xs uppercase tracking-wider transition-all shadow-sm cursor-pointer"
              >
                <Download size={16} /> Relatório Geral Clientes
              </button>
              
              <div className="p-4 bg-rose-50 text-rose-600 rounded-2xl flex items-center gap-3 border border-rose-100">
                <AlertCircle size={24} />
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-1">Total em Dívida (Clientes)</p>
                  <p className="text-xl font-black">
                    {formatSystemCurrency(filteredCustomers.reduce((acc, c) => acc + (c.outstandingBalance || 0), 0), businessData)}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              <button
                onClick={generateGlobalSupplierReport}
                className="px-4 py-3 bg-white border border-slate-200 text-slate-700 hover:text-blue-600 rounded-2xl flex items-center gap-2 font-bold text-xs uppercase tracking-wider transition-all shadow-sm cursor-pointer"
              >
                <Download size={16} /> Relatório Geral Fornecedores
              </button>
              
              <div className="p-4 bg-rose-50 text-rose-600 rounded-2xl flex items-center gap-3 border border-rose-100">
                <AlertCircle size={24} />
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-1">Total de Passivo (Fornecedores)</p>
                  <p className="text-xl font-black">
                    {formatSystemCurrency(filteredSuppliers.reduce((acc, s) => acc + getSupplierOutstanding(s.id), 0), businessData)}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Main Tab Switcher */}
      <div className="flex border-b border-slate-100 max-w-md">
        <button
          onClick={() => {
            setMainTab('clients');
            setSelectedCustomer(null);
            setSelectedSupplier(null);
          }}
          className={cn(
            "flex-1 pb-4 text-xs font-black uppercase tracking-wider border-b-4 transition-all text-center cursor-pointer",
            mainTab === 'clients' 
              ? "border-blue-600 text-blue-600" 
              : "border-transparent text-slate-400 hover:text-slate-600"
          )}
        >
          Dívidas de Clientes (Ativo)
        </button>
        <button
          onClick={() => {
            setMainTab('suppliers');
            setSelectedCustomer(null);
            setSelectedSupplier(null);
          }}
          className={cn(
            "flex-1 pb-4 text-xs font-black uppercase tracking-wider border-b-4 transition-all text-center cursor-pointer",
            mainTab === 'suppliers' 
              ? "border-blue-600 text-blue-600" 
              : "border-transparent text-slate-400 hover:text-slate-600"
          )}
        >
          Dívidas a Fornecedores (Passivo)
        </button>
      </div>

      {/* MAIN CLIENT TAB */}
      {mainTab === 'clients' && (
        <div className="space-y-6">
          {/* Sub Tab Selection */}
          <div className="flex items-center gap-4 bg-slate-50 p-1 rounded-2xl w-fit">
            <button
              onClick={() => setClientSubTab('grouped')}
              className={cn(
                "px-5 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer",
                clientSubTab === 'grouped' ? "bg-white text-slate-900 shadow-sm border border-slate-100" : "text-slate-500 hover:text-slate-900"
              )}
            >
              Resumo por Cliente
            </button>
            <button
              onClick={() => setClientSubTab('individual')}
              className={cn(
                "px-5 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer",
                clientSubTab === 'individual' ? "bg-white text-slate-900 shadow-sm border border-slate-100" : "text-slate-500 hover:text-slate-900"
              )}
            >
              Faturas & Dívidas Individuais
            </button>
          </div>

          {clientSubTab === 'grouped' ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Customer List */}
              <div className="lg:col-span-1 space-y-4">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      className="w-full pl-12 pr-4 py-4 bg-white border border-slate-100 rounded-2xl shadow-sm focus:ring-2 focus:ring-blue-500 outline-none font-bold placeholder:text-slate-400 text-sm"
                      placeholder="Pesquisar cliente..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setClientPendingOnly(!clientPendingOnly);
                      setSelectedCustomer(null);
                    }}
                    className={cn(
                      "px-4 rounded-2xl border flex items-center gap-2 font-bold text-xs uppercase tracking-wider transition-all shadow-sm cursor-pointer whitespace-nowrap shrink-0",
                      clientPendingOnly 
                        ? "bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-100/80" 
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    )}
                    title={clientPendingOnly ? "Mostrando apenas saldo pendente" : "Mostrando todos"}
                  >
                    <Filter size={16} />
                    <span className="hidden sm:inline">{clientPendingOnly ? "Com saldo pendente" : "Todos"}</span>
                  </button>
                </div>

                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider pl-2">
                  {clientPendingOnly 
                    ? `${filteredCustomers.length} com saldo pendente`
                    : `${filteredCustomers.length} de ${customers.filter(c => (c.name || '').toLowerCase().includes(searchTerm.toLowerCase())).length} no total`
                  }
                </div>

                <div className="space-y-3 overflow-y-auto max-h-[60vh] pr-2 scrollbar-hide">
                  {filteredCustomers.map(c => {
                    const limitVal = c.creditLimit || 500;
                    const limitRatio = (c.outstandingBalance || 0) > limitVal;
                    const isSelected = selectedCustomer?.id === c.id;
                    
                    return (
                      <button 
                        key={c.id}
                        onClick={() => fetchHistory(c)}
                        className={cn(
                          "w-full p-6 rounded-3xl border-2 transition-all text-left flex items-center gap-4 relative overflow-hidden cursor-pointer",
                          isSelected 
                            ? "bg-blue-600 border-blue-600 shadow-xl shadow-blue-500/30" 
                            : "bg-white border-transparent hover:border-blue-200"
                        )}
                      >
                        <div className={cn(
                          "w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg",
                          isSelected ? "bg-white/20 text-white" : "bg-slate-50 text-slate-400"
                        )}>
                          {(c.name || 'C')[0]?.toUpperCase()}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <p className={cn("font-black truncate", isSelected ? "text-white" : "text-slate-900")}>
                            {c.name}
                          </p>
                          
                          <div className="flex flex-col gap-1 mt-1">
                            <p className={cn("text-xs font-bold", isSelected ? "text-blue-100" : "text-rose-500")}>
                              Dívida: {formatSystemCurrency(c.outstandingBalance || 0, businessData)}
                            </p>
                            
                            {limitRatio && (
                              <span className={cn(
                                "inline-block w-fit px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider",
                                isSelected 
                                  ? "bg-white/20 text-white" 
                                  : "bg-rose-100 text-rose-700 font-extrabold"
                              )}>
                                Limite Excedido
                              </span>
                            )}
                          </div>
                        </div>
                        {isSelected && <ArrowUpRight className="text-white" size={20} />}
                      </button>
                    );
                  })}
                  
                  {filteredCustomers.length === 0 && (
                    <div className="p-8 text-center bg-slate-50 rounded-2xl text-slate-400 text-xs font-bold">
                      {clientPendingOnly 
                        ? "Nenhum devedor pendente encontrado." 
                        : "Nenhum cliente encontrado."}
                    </div>
                  )}
                </div>
              </div>

              {/* Detailed View */}
              <div className="lg:col-span-2">
                {selectedCustomer ? (
                  <div className="space-y-6">
                    <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-8 animate-in slide-in-from-right-4 relative">
                      {/* Close Button */}
                      <button
                        onClick={() => setSelectedCustomer(null)}
                        className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-all cursor-pointer"
                        title="Fechar painel"
                      >
                        <X size={20} />
                      </button>

                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pr-8">
                        <div>
                          <h3 className="text-3xl font-black text-slate-900">{selectedCustomer.name}</h3>
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5 mb-1">ID: {selectedCustomer.id}</p>
                          <p className="text-slate-500 flex items-center gap-2 mt-1">
                            <Calendar size={16} />
                            Último pagamento: {selectedCustomer.lastPaymentDate ? new Date(selectedCustomer.lastPaymentDate?.toDate ? selectedCustomer.lastPaymentDate.toDate() : selectedCustomer.lastPaymentDate).toLocaleDateString() : 'Nenhum registado'}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => generateStatement(selectedCustomer)}
                            className="p-4 bg-slate-50 text-slate-600 rounded-2xl hover:bg-slate-100 transition-all flex items-center gap-2 font-bold text-sm cursor-pointer"
                          >
                            <Download size={20} /> Extrato
                          </button>
                          
                          {selectedCustomer.outstandingBalance > 0 && (
                            <button 
                              onClick={() => sendReminder(selectedCustomer)}
                              className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl hover:bg-emerald-100 transition-all flex items-center gap-2 font-bold text-sm cursor-pointer"
                            >
                              <MessageCircle size={20} /> WhatsApp
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="p-6 bg-slate-50 rounded-[32px]">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Dívida Atual</p>
                          <p className="text-2xl font-black text-rose-500">{formatSystemCurrency(selectedCustomer.outstandingBalance || 0, businessData)}</p>
                        </div>
                        
                        <div className="p-6 bg-slate-50 rounded-[32px]">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Limite do Crédito</p>
                            <button 
                              onClick={() => {
                                setNewCreditLimit((selectedCustomer.creditLimit || 500).toString());
                                setIsAdjustingLimit(true);
                              }}
                              className="text-[10px] text-blue-600 hover:underline font-bold transition-all focus:outline-none cursor-pointer"
                            >
                              Ajustar
                            </button>
                          </div>
                          <p className="text-2xl font-black text-slate-900">{formatSystemCurrency(selectedCustomer.creditLimit || 500, businessData)}</p>
                        </div>
                        
                        <div className="p-6 bg-slate-50 rounded-[32px]">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Total Pago</p>
                          <p className="text-2xl font-black text-emerald-600">{formatSystemCurrency(selectedCustomer.totalSpent || 0, businessData)}</p>
                        </div>
                        
                        <button 
                          onClick={() => {
                            setRepaymentAmount('');
                            setRepaymentReference('');
                            setIsRepaying(true);
                          }}
                          className="p-6 bg-blue-600 text-white rounded-[32px] flex flex-col items-center justify-center hover:bg-blue-700 transition-all shadow-xl shadow-blue-500/20 cursor-pointer"
                        >
                          <DollarSign size={24} className="mb-1" />
                          <span className="font-black text-xs uppercase tracking-widest">Amortizar</span>
                        </button>
                      </div>

                      {/* Authorized Credit Limit Utilization Tracker */}
                      {(() => {
                        const limit = selectedCustomer.creditLimit || 500;
                        const ratioExceeded = selectedCustomer.outstandingBalance >= limit;
                        const limitPercentage = Math.min(100, Math.round((selectedCustomer.outstandingBalance / limit) * 100));

                        return (
                          <div className="p-6 bg-slate-50 rounded-[32px] space-y-3">
                            <div className="flex justify-between items-center text-xs font-bold uppercase tracking-wider text-slate-400">
                              <span>Uso de Crédito Autorizado</span>
                              <span className={cn(ratioExceeded ? "text-rose-600 font-extrabold animate-pulse" : "text-slate-600 font-bold")}>
                                {limitPercentage}% ({selectedCustomer.outstandingBalance.toLocaleString()} / {limit.toLocaleString()} {currency})
                              </span>
                            </div>
                            <div className="w-full bg-slate-200 h-3 rounded-full overflow-hidden">
                              <div 
                                className={cn(
                                  "h-full rounded-full transition-all duration-500",
                                  ratioExceeded ? "bg-gradient-to-r from-rose-500 to-red-600" : limitPercentage > 80 ? "bg-amber-500" : "bg-gradient-to-r from-emerald-500 to-teal-600"
                                )} 
                                style={{ width: `${limitPercentage}%` }}
                              />
                            </div>
                            {ratioExceeded && (
                              <p className="text-[10px] text-rose-500 font-black uppercase tracking-wider flex items-center gap-1.5 pt-1">
                                <AlertCircle size={14} className="animate-bounce" /> Atenção: O cliente excedeu o limite máximo de endividamento!
                              </p>
                            )}
                          </div>
                        );
                      })()}

                      <div className="space-y-4 text-left">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest">{t('account_statement')}</h4>
                          <button 
                            onClick={() => generateStatement(selectedCustomer)}
                            className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-700 transition-all bg-blue-50 px-3 py-1.5 rounded-full cursor-pointer"
                          >
                            <Download size={12} /> Descarregar Extrato (PDF)
                          </button>
                        </div>
                        
                        <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-2">
                          {transactions.slice(0, visibleClientTxCount).map((t, i) => (
                            <div key={i} className="flex items-center gap-4 p-4 hover:bg-slate-50 rounded-2xl transition-all border border-slate-50">
                              <div className={cn(
                                "w-10 h-10 rounded-xl flex items-center justify-center",
                                t.type === 'invoice' ? "bg-rose-50 text-rose-500" : "bg-emerald-50 text-emerald-600"
                              )}>
                                {t.type === 'invoice' ? <ArrowUpRight size={20} /> : <ArrowDownLeft size={20} />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-black text-slate-900 truncate">
                                  {t.type === 'invoice' ? `Fatura #${t.invoiceNumber || 'Venda'}` : 'Amortização Recebida'}
                                </p>
                                <p className="text-xs font-bold text-slate-400 truncate">
                                  {t.createdAt?.toDate ? t.createdAt.toDate().toLocaleDateString() : (t.date ? new Date(t.date).toLocaleDateString() : '-')} • {t.method || (t.type === 'invoice' ? 'Crédito' : 'Dinheiro')} {t.reference ? `(${t.reference})` : ''}
                                </p>
                              </div>
                              {t.type !== 'invoice' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPreviewPayment({
                                      payment: {
                                        id: t.id,
                                        amount: t.amount || 0,
                                        method: t.method || 'cash',
                                        reference: t.reference || '',
                                        date: t.date || (t.createdAt?.toDate ? t.createdAt.toDate().toISOString() : new Date().toISOString())
                                      },
                                      customerName: selectedCustomer?.name || 'Cliente Geral',
                                      customerBalance: selectedCustomer?.outstandingBalance || 0
                                    });
                                  }}
                                  className="p-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-605 rounded-xl transition-all cursor-pointer flex items-center justify-center shrink-0 active:scale-95"
                                  title="Imprimir/Recibo de Repagamento"
                                >
                                  <Printer size={15} />
                                </button>
                              )}
                              <p className={cn("font-black text-right whitespace-nowrap", t.type === 'invoice' ? "text-rose-500" : "text-emerald-600")}>
                                {t.type === 'invoice' ? `+${(t.total || 0).toLocaleString()} ${currency}` : `-${(t.amount || t.totalPaid || 0).toLocaleString()} ${currency}`}
                              </p>
                            </div>
                          ))}

                          {transactions.length === 0 && (
                            <p className="text-slate-400 text-xs italic text-center py-6">Nenhum histórico disponível para este cliente.</p>
                          )}

                          {transactions.length > visibleClientTxCount && (
                            <div className="pt-2 text-center">
                              <button
                                type="button"
                                onClick={() => setVisibleClientTxCount(prev => prev + 10)}
                                className="px-4 py-2 text-xs font-black uppercase tracking-widest text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-full cursor-pointer transition-all"
                              >
                                + Ver Mais ({transactions.length - visibleClientTxCount} restantes)
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
                      <Users size={64} className="opacity-10" />
                    </div>
                    <p className="font-black uppercase tracking-widest text-xs">Selecione um cliente para gerir o crédito</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <ClientInvoiceDebtSection 
              allInvoices={allInvoices}
              customers={customers}
              businessData={businessData}
              isInvoiceOverdue={isInvoiceOverdue}
              getCustomerName={getCustomerName}
              getCustomerObj={getCustomerObj}
              onPayInvoice={(client, amount, reference) => {
                setSelectedCustomer(client);
                setRepaymentAmount(amount.toString());
                setRepaymentReference(reference);
                setIsRepaying(true);
              }}
              onViewClient={(client) => {
                setSelectedCustomer(client);
                setClientSubTab('grouped');
                fetchHistory(client);
              }}
              sendReminder={sendReminder}
              clientPendingOnly={clientPendingOnly}
              setClientPendingOnly={setClientPendingOnly}
            />
          )}
        </div>
      )}

      {/* MAIN SUPPLIER TAB */}
      {mainTab === 'suppliers' && (
        <SupplierDebtSection
          suppliers={suppliers}
          expenses={expenses}
          purchaseOrders={purchaseOrders}
          supplierPayments={supplierPayments}
          selectedSupplier={selectedSupplier}
          setSelectedSupplier={setSelectedSupplier}
          supplierSearchTerm={supplierSearchTerm}
          setSupplierSearchTerm={setSupplierSearchTerm}
          supplierPendingOnly={supplierPendingOnly}
          setSupplierPendingOnly={setSupplierPendingOnly}
          filteredSuppliers={filteredSuppliers}
          getSupplierOutstanding={getSupplierOutstanding}
          getSupplierTotalPaid={getSupplierTotalPaid}
          getSupplierTotalCommitment={getSupplierTotalCommitment}
          onRecordPayment={(doc, docType, oBal, title) => {
            setPayingSupplierDoc(doc);
            setPayingSupplierDocType(docType);
            setSupplierPayAmount(oBal.toString());
            setSupplierPayNotes(`Pagamento para ${docType === 'expense' ? 'Despesa' : 'OC'} - ${title}`);
            setIsRecordingSupplierPayment(true);
          }}
          generateSupplierStatement={generateSupplierStatement}
          businessData={businessData}
        />
      )}

      {/* Advanced Repayment Modal */}
      <AnimatePresence>
        {isRepaying && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white w-full max-w-md rounded-[40px] p-8 shadow-2xl relative overflow-hidden space-y-6 max-h-[90vh] overflow-y-auto my-auto"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-black text-slate-900">Registar Pagamento</h3>
                <button 
                  onClick={() => setIsRepaying(false)} 
                  className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-900 rounded-lg transition-all"
                >
                  <AlertCircle size={18} />
                </button>
              </div>
              
              <div className="space-y-6">
                <div className="text-center p-4 bg-slate-50 rounded-2xl">
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Cliente Selecionado</p>
                  <p className="font-black text-slate-900 text-lg">{selectedCustomer.name}</p>
                </div>
                
                <div className="space-y-2 text-left">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Valor do Pagamento</label>
                  <div className="relative">
                    <span className="absolute right-6 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">{currency}</span>
                    <input 
                      type="number"
                      className="w-full p-6 pr-16 bg-slate-50 border border-slate-200 rounded-[24px] text-3xl font-black text-slate-900 focus:ring-4 focus:ring-emerald-500/20 outline-none placeholder:text-slate-200"
                      placeholder="0.00"
                      value={repaymentAmount}
                      onChange={e => setRepaymentAmount(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button 
                      onClick={() => setRepaymentAmount(selectedCustomer.outstandingBalance.toString())} 
                      className="py-2.5 bg-slate-100 rounded-xl text-[10px] font-black uppercase tracking-wider text-slate-600 border border-transparent hover:border-slate-200 transition-all text-center"
                    >
                      Pagar Total
                    </button>
                    <button 
                      onClick={() => setRepaymentAmount((selectedCustomer.outstandingBalance / 2).toString())} 
                      className="py-2.5 bg-slate-100 rounded-xl text-[10px] font-black uppercase tracking-wider text-slate-600 border border-transparent hover:border-slate-200 transition-all text-center"
                    >
                      Amortizar 50%
                    </button>
                  </div>
                </div>

                <div className="space-y-2 text-left">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Selecionar Canal / Método</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'cash', label: 'Dinheiro' },
                      { id: 'mpesa', label: 'M-Pesa' },
                      { id: 'emola', label: 'eMola' },
                      { id: 'bank_transfer', label: 'Transf. Bancária' }
                    ].map(method => (
                      <button
                        key={method.id}
                        type="button"
                        onClick={() => setRepaymentMethod(method.id)}
                        className={cn(
                          "py-3 rounded-xl text-xs font-bold transition-all border",
                          repaymentMethod === method.id 
                            ? "bg-slate-900 text-white border-slate-900 shadow-sm" 
                            : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                        )}
                      >
                        {method.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1 text-left">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Referência do Pagamento (Opcional)</label>
                  <input 
                    type="text"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-slate-500 outline-none placeholder:text-slate-300"
                    placeholder="Ex: ID Transação, Código M-Pesa..."
                    value={repaymentReference}
                    onChange={e => setRepaymentReference(e.target.value)}
                  />
                </div>

                <div className="w-full pt-4">
                  <button 
                    onClick={handleRepayment}
                    className="w-full py-5 bg-emerald-600 text-white rounded-3xl font-black text-base shadow-xl shadow-emerald-500/10 hover:bg-emerald-700 transition-all active:scale-95"
                  >
                    Confirmar Liquidação
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Adjust Credit Limit Modal */}
      <AnimatePresence>
        {isAdjustingLimit && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white w-full max-w-sm rounded-[40px] p-8 shadow-2xl relative overflow-hidden space-y-6 max-h-[90vh] overflow-y-auto my-auto"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-black text-slate-900 text-left">Ajustar Limite</h3>
                <button 
                  onClick={() => setIsAdjustingLimit(false)} 
                  className="px-2.5 py-1 text-xs font-black text-slate-400 hover:text-slate-950"
                >
                  Fechar
                </button>
              </div>

              <div className="space-y-4 text-left">
                <div className="p-4 bg-slate-50 rounded-2xl">
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Cliente</p>
                  <p className="font-semibold text-slate-800">{selectedCustomer.name}</p>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Novo Limite Máximo ({currency})</label>
                  <input
                    type="number"
                    value={newCreditLimit}
                    onChange={e => setNewCreditLimit(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-base font-black text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="500.00"
                  />
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide">
                    Define o teto máximo de compras autorizadas pendentes de fatura.
                  </p>
                </div>

                <div className="pt-2">
                  <button
                    onClick={handleUpdateCreditLimit}
                    disabled={isUpdatingLimit}
                    className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-wider hover:bg-slate-800 transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    {isUpdatingLimit ? 'A processar...' : 'Salvar Novo Limite'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modern interactive receipt preview overlay modal */}
      {previewPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl border border-slate-100 p-6 flex flex-col space-y-4 max-h-[90vh] overflow-y-auto my-auto">
            
            <div className="text-center p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex flex-col items-center">
              <Printer size={32} className="text-emerald-600 mb-1.5 animate-pulse" />
              <h4 className="text-sm font-black text-emerald-800 uppercase tracking-widest leading-none">Comprovativo Emitido</h4>
              <p className="text-[10px] text-emerald-600 font-bold mt-1">Registado com Sucesso</p>
            </div>

            {/* Micro receipt visual container */}
            <div className="p-5 font-mono text-[11px] text-slate-700 bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-2">
              <div className="text-center pb-2 border-b border-dashed border-slate-200">
                <p className="font-sans font-black text-slate-900 text-xs uppercase">{businessData?.name || profile?.businessName || 'Sabush System ERP'}</p>
                <p className="text-[9px] text-slate-400 font-sans font-semibold mb-0.5">{businessData?.address || 'Moçambique'}</p>
                {businessData?.taxId && <p className="text-[9px] text-slate-400 font-sans font-semibold">NUIT: {businessData.taxId}</p>}
              </div>

              <div className="flex justify-between">
                <span>Cod. Recibo:</span>
                <span className="font-bold text-slate-900">#{previewPayment.payment.id?.slice(-6).toUpperCase()}</span>
              </div>
              <div className="flex justify-between">
                <span>Cliente:</span>
                <span className="font-bold text-slate-900 truncate max-w-[125px]">{previewPayment.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span>Data:</span>
                <span>{new Date(previewPayment.payment.date).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Canal:</span>
                <span className="uppercase font-bold text-slate-900">{previewPayment.payment.method}</span>
              </div>
              {previewPayment.payment.reference && (
                <div className="flex justify-between">
                  <span>Ref:</span>
                  <span className="truncate max-w-[125px]">{previewPayment.payment.reference}</span>
                </div>
              )}

              <div className="flex justify-between font-bold text-slate-900 text-xs border-t border-dashed border-slate-200 pt-2 bg-emerald-50/50 p-1 rounded">
                <span>VALOR PAGO:</span>
                <span>{Number(previewPayment.payment.amount || 0).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} {currency}</span>
              </div>
              <div className="flex justify-between items-baseline pt-1">
                <span className="text-red-500 font-bold uppercase text-[9px] tracking-wider">Dívida Restante:</span>
                <span className="font-extrabold text-red-650 font-mono">
                  {Number(previewPayment.customerBalance || 0).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} {currency}
                </span>
              </div>
            </div>

            <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl flex flex-col gap-0.5 text-[9px] text-blue-800 leading-normal">
              <span className="font-extrabold flex items-center gap-0.5">💡 Impressão Sem Bloqueios:</span>
              <p>Os navegadores às vezes bloqueiam popups de impressão directa. Clique em <strong>Gerar PDF</strong> para salvar e imprimir livremente sem qualquer restrição!</p>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <div className="grid grid-cols-3 gap-1.5 w-full font-sans">
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
                    import('../lib/printService').then(({ printPaymentReceiptHTML }) => {
                      printPaymentReceiptHTML(
                        previewPayment.payment,
                        previewPayment.customerName,
                        previewPayment.customerBalance,
                        businessPrintInfo,
                        printerType
                      );
                    }).catch(err => {
                      console.error("Print receipt module load error", err);
                      toast.error("Erro ao carregar módulo de impressão");
                    });
                  }}
                  className="py-3 bg-slate-950 hover:bg-slate-850 text-white font-black rounded-xl transition-all text-[9px] uppercase tracking-wider flex flex-col items-center justify-center gap-1 shadow-sm cursor-pointer active:scale-95"
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
                  className="py-3 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl transition-all text-[9px] uppercase tracking-wider flex flex-col items-center justify-center gap-1 shadow-sm cursor-pointer active:scale-95"
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
                    import('../lib/printService').then(({ downloadPaymentReceiptHTML }) => {
                      downloadPaymentReceiptHTML(
                        previewPayment.payment,
                        previewPayment.customerName,
                        previewPayment.customerBalance,
                        businessPrintInfo,
                        printerType
                      );
                    }).catch(err => {
                      console.error("Load download receipt error", err);
                      toast.error("Erro ao carregar módulo de download");
                    });
                  }}
                  className="py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl transition-all text-[9px] uppercase tracking-wider flex flex-col items-center justify-center gap-1 shadow-sm cursor-pointer active:scale-95"
                >
                  <Download size={14} />
                  <span>Baixar HTML</span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => setPreviewPayment(null)}
                className="w-full py-2.5 text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 transition-all rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 cursor-pointer mt-1 font-sans"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Supplier Payment Modal */}
      <AnimatePresence>
        {isRecordingSupplierPayment && selectedSupplier && payingSupplierDoc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white w-full max-w-md rounded-[40px] p-8 shadow-2xl relative overflow-hidden space-y-6 text-left max-h-[90vh] overflow-y-auto my-auto"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-black text-slate-900">Registar Pagamento a Fornecedor</h3>
                <button 
                  onClick={() => {
                    setIsRecordingSupplierPayment(false);
                    setPayingSupplierDoc(null);
                  }} 
                  className="px-2.5 py-1 text-xs font-black text-slate-400 hover:text-slate-950 bg-slate-100 rounded-xl cursor-pointer"
                >
                  Fechar
                </button>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-slate-50 rounded-2xl text-xs space-y-1">
                  <p className="text-slate-400 font-bold uppercase tracking-wider">Fornecedor</p>
                  <p className="font-black text-slate-900 text-sm mb-1">{selectedSupplier.name}</p>
                  
                  <p className="text-slate-400 font-bold uppercase tracking-wider">Documento</p>
                  <p className="font-semibold text-slate-700">
                    {payingSupplierDocType === 'expense' ? 'Despesa' : 'Ordem de Compra'}: {payingSupplierDoc.title || `#${payingSupplierDoc.orderNumber}`}
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Valor do Pagamento</label>
                  <div className="relative">
                    <span className="absolute right-6 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">{currency}</span>
                    <input 
                      type="number"
                      className="w-full p-5 pr-16 bg-slate-50 border border-slate-200 rounded-[20px] text-2xl font-black text-slate-900 focus:ring-4 focus:ring-slate-900/10 outline-none"
                      placeholder="0.00"
                      value={supplierPayAmount}
                      onChange={e => setSupplierPayAmount(e.target.value)}
                    />
                  </div>
                  <div className="flex justify-between items-center pt-1 px-1">
                    <button 
                      onClick={() => {
                        const oBal = payingSupplierDoc.outstandingBalance !== undefined ? payingSupplierDoc.outstandingBalance : ((payingSupplierDoc.totalCost || payingSupplierDoc.amount || 0) - (payingSupplierDoc.paidAmount || payingSupplierDoc.amountPaid || 0));
                        setSupplierPayAmount(oBal.toString());
                      }} 
                      className="text-[10px] font-black uppercase tracking-wider text-blue-600 hover:underline cursor-pointer"
                    >
                      Pagar Total Devido
                    </button>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                      Dívida: {formatSystemCurrency(payingSupplierDoc.outstandingBalance !== undefined ? payingSupplierDoc.outstandingBalance : ((payingSupplierDoc.totalCost || payingSupplierDoc.amount || 0) - (payingSupplierDoc.paidAmount || payingSupplierDoc.amountPaid || 0)), businessData)}
                    </p>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Data do Pagamento</label>
                  <input 
                    type="date"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900"
                    value={supplierPayDate}
                    onChange={e => setSupplierPayDate(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Método de Pagamento</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['Dinheiro', 'M-Pesa', 'eMola', 'Transf. Bancária'].map(method => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setSupplierPayMethod(method)}
                        className={cn(
                          "py-3 rounded-xl text-xs font-bold transition-all border cursor-pointer",
                          supplierPayMethod === method 
                            ? "bg-slate-900 text-white border-slate-900 shadow-sm" 
                            : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                        )}
                      >
                        {method}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Notas / Referência (Opcional)</label>
                  <input 
                    type="text"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-slate-500 outline-none"
                    placeholder="Ex: Ref do banco, código M-Pesa..."
                    value={supplierPayNotes}
                    onChange={e => setSupplierPayNotes(e.target.value)}
                  />
                </div>

                <div className="pt-4">
                  <button 
                    onClick={handleRecordSupplierPayment}
                    className="w-full py-4.5 bg-slate-900 text-white rounded-2xl font-black text-sm uppercase tracking-wider hover:bg-slate-800 transition-all active:scale-95 shadow-lg shadow-slate-900/10 cursor-pointer"
                  >
                    Confirmar Pagamento
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
