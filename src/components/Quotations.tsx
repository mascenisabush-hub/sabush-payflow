import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, onSnapshot, addDoc, serverTimestamp, updateDoc, doc, deleteDoc, getDocs, getDoc, where, increment } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { 
  Plus, Search, FileText, Download, Send, MoreVertical, Loader2, Sparkles, 
  X, Check, ArrowRight, Clock, AlertTriangle, Eye, ThumbsUp, ThumbsDown, CheckCircle, Copy 
} from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { generateQuotationPDF } from '../lib/pdfGenerator';
import { sendEmailNotification, buildInvoiceEmailBody } from '../lib/emailService';
import { sendLiveNotification } from '../lib/notificationService';
import { offlineDb } from '../lib/offlineDb';
import { syncReservedStock } from '../lib/stockReservation';

export default function Quotations() {
  const { profile, businessData } = useAuth();
  const { t } = useTranslation();
  const currency = businessData?.currency || 'MZN';
  
  const [quotations, setQuotations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);

  // Detailed Modal view
  const [selectedQuotation, setSelectedQuotation] = useState<any | null>(null);
  const [isRejectionOpen, setIsRejectionOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  // Editable states for quotation approval / invoicing
  const [editedItems, setEditedItems] = useState<any[]>([]);
  const [approvalPaymentMethod, setApprovalPaymentMethod] = useState<'cash' | 'credit'>('cash');

  useEffect(() => {
    if (selectedQuotation) {
      setEditedItems(selectedQuotation.items || []);
      setApprovalPaymentMethod(selectedQuotation.paymentMethod || 'cash');
    } else {
      setEditedItems([]);
      setApprovalPaymentMethod('cash');
    }
  }, [selectedQuotation]);

  // Form State
  const [newQuotation, setNewQuotation] = useState({
    customerId: '',
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    deliveryAddress: '',
    quotationNumber: `QT-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`,
    items: [{ productId: '', name: '', quantity: 1, price: 0 }] as any[],
    expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    status: 'draft'
  });

  useEffect(() => {
    if (!profile?.businessId) return;

    // Load from local cache first for instant visual response
    const cachedQuotations = localStorage.getItem(`sabush_cached_quotations_${profile.businessId}`);
    if (cachedQuotations) {
      try {
        setQuotations(JSON.parse(cachedQuotations));
        setLoading(false);
      } catch (e) {
        console.warn("Could not load quotations from cache:", e);
      }
    }

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
        console.warn("Could not load customers from cache:", e);
      }
    }

    const q = query(collection(db, `businesses/${profile.businessId}/quotations`));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setQuotations(data);
      setLoading(false);
      try {
        localStorage.setItem(`sabush_cached_quotations_${profile.businessId}`, JSON.stringify(data));
      } catch (e) {
        console.warn("Could not save quotations to cache:", e);
      }

      // Check for any expired active quotations to trigger release
      const todayStr = new Date().toISOString().split('T')[0];
      const hasExpiredActive = data.some((qt: any) => {
        const isActive = ['pending_client_approval', 'client_accepted', 'pending_seller_approval'].includes(qt.status);
        const isExpired = qt.expiryDate && qt.expiryDate < todayStr;
        return isActive && isExpired;
      });

      if (hasExpiredActive) {
        syncReservedStock(profile.businessId).catch(err => console.error("Auto-expire sync error:", err));
      }
    }, error => {
      setLoading(false);
      try {
        handleFirestoreError(error, OperationType.LIST, 'quotations');
      } catch (e) {
        console.warn("Gracefully logged quotations query error:", e);
      }
    });

    // Fetch Products & Customers in parallel to avoid data waterfalls
    const fetchSelectables = async () => {
      try {
        const [pSnap, cSnap] = await Promise.all([
          getDocs(collection(db, `businesses/${profile.businessId}/products`)),
          getDocs(collection(db, `businesses/${profile.businessId}/customers`))
        ]);

        const fetchedProds = pSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const fetchedCusts = cSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        setProducts(fetchedProds);
        setCustomers(fetchedCusts);

        // Cache the fetched results
        offlineDb.saveProducts(fetchedProds).catch(err => console.warn(err));
        try {
          localStorage.setItem(`sabush_cached_customers_${profile.businessId}`, JSON.stringify(fetchedCusts));
        } catch (e) {
          console.warn(e);
        }
      } catch (e) {
        console.warn("Error fetching selectables in parallel:", e);
      }
    };
    fetchSelectables();

    return unsubscribe;
  }, [profile?.businessId]);

  const calculateTotal = (items: any[]) => items.reduce((acc, item) => acc + (item.price * item.quantity), 0);

  const doesQuotationExceedAvailableStock = (qt: any) => {
    if (!qt.items || !Array.isArray(qt.items)) return false;
    for (const item of qt.items) {
      if (item.productId) {
        const prod = products.find(p => p.id === item.productId);
        if (prod) {
          const isCurrentlyReservedState = ['pending_client_approval', 'client_accepted', 'pending_seller_approval'].includes(qt.status);
          const todayStr = new Date().toISOString().split('T')[0];
          const isExpired = qt.expiryDate && qt.expiryDate < todayStr;
          const isCurrentlyReserving = isCurrentlyReservedState && !isExpired;

          const reservedByOthers = (prod.reservedStock || 0) - (isCurrentlyReserving ? item.quantity : 0);
          const availableToThisQuote = (prod.stockLevel || 0) - Math.max(0, reservedByOthers);
          
          if (item.quantity > availableToThisQuote) {
            return true;
          }
        }
      }
    }
    return false;
  };

  const handleDuplicateQuotation = (qt: any) => {
    setNewQuotation({
      customerId: qt.customerId || '',
      customerName: qt.customerName || '',
      customerEmail: qt.customerEmail || '',
      customerPhone: qt.customerPhone || '',
      deliveryAddress: qt.deliveryAddress || '',
      quotationNumber: `QT-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`,
      items: (qt.items || []).map((item: any) => ({
        productId: item.productId || '',
        name: item.name || '',
        quantity: item.quantity || 1,
        price: item.price || 0,
        selectedUnit: item.selectedUnit || 'un',
        unitLabel: item.unitLabel || 'un',
        unitMultiplier: item.unitMultiplier || 1
      })),
      expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'draft'
    });
    setIsCreating(true);
    setSelectedQuotation(null);
    toast.success("Orçamento duplicado! Verifique os dados e defina a nova data de validade.");
  };

  const handleCreateQuotation = async () => {
    if (!profile?.businessId || !newQuotation.customerId) {
      toast.error("Selecione um cliente para prosseguir.");
      return;
    }

    // Prevent quoting products out of stock / with insufficient stock levels
    for (const item of newQuotation.items) {
      if (!item.productId) {
        toast.error("Por favor, selecione um produto válido para todos os itens.");
        return;
      }
      const prod = products.find(p => p.id === item.productId);
      if (!prod) {
        toast.error(`Produto não encontrado.`);
        return;
      }
      const availableStock = (prod.stockLevel || 0) - (prod.reservedStock || 0);
      if (availableStock <= 0) {
        toast.error(`O produto "${prod.name}" está esgotado (incluindo reservas).`);
        return;
      }
      if (item.quantity > availableStock) {
        toast.error(`A quantidade solicitada (${item.quantity}) do produto "${prod.name}" excede o stock disponível para venda (${availableStock}, com ${(prod.reservedStock || 0)} reservado).`);
        return;
      }
    }

    try {
      const client = customers.find(c => c.id === newQuotation.customerId);
      const total = calculateTotal(newQuotation.items);
      
      const payload = {
        ...newQuotation,
        customerName: client?.name || newQuotation.customerId,
        customerEmail: client?.email || '',
        customerPhone: client?.phone || '',
        deliveryAddress: client?.address || 'Moçambique',
        total,
        businessId: profile.businessId,
        createdAt: new Date(),
        updatedAt: serverTimestamp()
      };

      // Optimistic UI update for immediate response
      const tempId = `temp-quote-${Date.now()}`;
      const localQuote = {
        id: tempId,
        ...payload,
        createdAt: new Date().toISOString()
      };
      setQuotations(prev => [localQuote, ...prev]);
      setIsCreating(false);
      resetForm();
      toast.success("Cotação guardada com sucesso!");

      // Perform background write
      addDoc(collection(db, `businesses/${profile.businessId}/quotations`), payload)
        .then(() => {
          syncReservedStock(profile.businessId).catch(console.error);
        })
        .catch(err => {
          console.error("Failed to save quotation in background:", err);
          // Revert optimistic update on failure
          setQuotations(prev => prev.filter(q => q.id !== tempId));
          toast.error("Erro ao sincronizar cotação com o servidor.");
        });
    } catch (e) {
      toast.error("Erro ao gerar cotação.");
    }
  };

  const resetForm = () => {
    setNewQuotation({
      customerId: '',
      customerName: '',
      customerEmail: '',
      customerPhone: '',
      deliveryAddress: '',
      quotationNumber: `QT-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`,
      items: [{ productId: '', name: '', quantity: 1, price: 0 }] as any[],
      expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'draft'
    });
  };

  // STEP 4 - AUTOMATIC INVOICE GENERATION & STOCK DECREMENT
  const handleApproveQuotation = async (quotation: any) => {
    if (!profile?.businessId) return;

    if (quotation.status === 'expired') {
      toast.error("Este orçamento expirou. Por favor duplique-o com uma nova validade para poder aprovar.");
      return;
    }

    try {
      // 1. Verify stocks first before starting updates to ensure nothing is out of stock!
      const items = editedItems && editedItems.length > 0 ? editedItems : (quotation.items || []);
      for (const item of items) {
        if (item.productId) {
          const productRef = doc(db, `businesses/${profile.businessId}/products`, item.productId);
          const prodDoc = await getDoc(productRef);
          if (prodDoc.exists()) {
            const currentStock = prodDoc.data().stockLevel || 0;
            if (currentStock <= 0) {
              toast.error(`Impossível aprovar: O produto "${item.name}" está esgotado.`);
              return;
            }
            if (item.quantity > currentStock) {
              toast.error(`Impossível aprovar: O produto "${item.name}" possui stock insuficiente (${currentStock} disponível, necessário ${item.quantity}).`);
              return;
            }
          } else {
            toast.error(`Produto "${item.name}" não encontrado na base de dados.`);
            return;
          }
        }
      }

      toast.loading("A aprovar e convertendo para Factura automática...");
      
      // 2. Decrement Product Stock levels (Stock quantity auto-update!)
      for (const item of items) {
        if (item.productId) {
          const productRef = doc(db, `businesses/${profile.businessId}/products`, item.productId);
          const prodDoc = await getDoc(productRef);
          if (prodDoc.exists()) {
            const currentStock = prodDoc.data().stockLevel || 0;
            const newStock = Math.max(0, currentStock - item.quantity);
            await updateDoc(productRef, { stockLevel: newStock });
            if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
              console.log(`[Stock Management] Reduzido stock de ${item.name}: ${currentStock} -> ${newStock}`);
            }
          }
        }
      }

      // 2. Generate Professional Invoice
      const invoiceYear = new Date().getFullYear();
      const invoiceRand = Math.floor(1000 + Math.random() * 9000);
      const invoiceNumber = `INV-${invoiceYear}-${invoiceRand}`;
      
      const subtotal = items.reduce((sum: number, it: any) => sum + (Number(it.price || 0) * Number(it.quantity || 1)), 0);
      const taxRate = 0; // Set to zero by default!
      const calculatedTax = subtotal * taxRate;
      const invoiceTotal = subtotal + calculatedTax;

      // Update customer outstanding balance if sold on credit
      if (approvalPaymentMethod === 'credit' && quotation.customerId && quotation.customerId !== 'Walk-in' && quotation.customerId !== 'Online-Customer') {
        const customerRef = doc(db, `businesses/${profile.businessId}/customers`, quotation.customerId);
        await updateDoc(customerRef, {
          outstandingBalance: increment(invoiceTotal),
          totalSpent: increment(0)
        }).catch(err => console.warn("Failed to update customer balance on credit approval:", err));
      } else if (approvalPaymentMethod === 'cash' && quotation.customerId && quotation.customerId !== 'Walk-in' && quotation.customerId !== 'Online-Customer') {
        const customerRef = doc(db, `businesses/${profile.businessId}/customers`, quotation.customerId);
        await updateDoc(customerRef, {
          totalSpent: increment(invoiceTotal)
        }).catch(err => console.warn("Failed to update customer spent on cash approval:", err));
      }

      const invoicePayload = {
        businessId: profile.businessId,
        customerId: quotation.customerId || 'Cliente Geral',
        customerName: quotation.customerName || quotation.customerId || 'Cliente Geral',
        customerEmail: quotation.customerEmail || '',
        customerPhone: quotation.customerPhone || '',
        deliveryAddress: quotation.deliveryAddress || 'Moçambique',
        invoiceNumber,
        date: new Date().toISOString(),
        dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days due
        status: approvalPaymentMethod === 'credit' ? 'unpaid' : 'paid',
        paymentMethod: approvalPaymentMethod,
        items,
        subtotal,
        tax: calculatedTax,
        taxRate: 0,
        total: invoiceTotal,
        currency: 'MZN',
        quotationReference: quotation.quotationNumber || '',
        createdAt: serverTimestamp()
      };

      const invoiceRef = await addDoc(collection(db, `businesses/${profile.businessId}/invoices`), invoicePayload);

      // Automated invoice trigger to client portal
      try {
        const { triggerInvoiceCreatedNotifications } = await import('../lib/notificationService');
        await triggerInvoiceCreatedNotifications(profile.businessId, {
          invoiceNumber: invoicePayload.invoiceNumber,
          total: invoicePayload.total,
          customerId: invoicePayload.customerId
        });
      } catch (notifErr) {
        console.error("Portal invoice trigger error in Quotations approve:", notifErr);
      }

      // 3. Mark Quotation as accepted
      await updateDoc(doc(db, `businesses/${profile.businessId}/quotations`, quotation.id), {
        status: 'accepted'
      });

      // Sync reserved stock now that quotation status is accepted and stock is permanently decremented
      await syncReservedStock(profile.businessId).catch(console.error);

      // 4. Send Client simulated confirmation email with invoice details
      if (quotation.customerEmail) {
        await sendEmailNotification(
          quotation.customerEmail,
          `Factura Comercial Emitida - Ref: ${invoiceNumber}`,
          buildInvoiceEmailBody({ invoiceNumber, total: invoiceTotal, dueDate: invoicePayload.dueDate })
        );
      }

      // 5. Notify active users/sellers in real-time
      await sendLiveNotification(
        profile.businessId,
        "Cotação Aprovada",
        `A cotação ${quotation.quotationNumber} foi confirmada. Fatura ${invoiceNumber} emitida automaticamente.`,
        'success'
      );

      toast.dismiss();
      toast.success("Cotação Aprovada! Factura gerada e e-mails de notificação disparados.");
      setSelectedQuotation(null);
    } catch (error) {
      toast.dismiss();
      console.error(error);
      toast.error("Falha ao aprovar cotação.");
    }
  };

  const handleUpdateQuotationPrices = async (quotation: any) => {
    if (!profile?.businessId) return;

    if (quotation.status === 'expired') {
      toast.error("Este orçamento expirou. Por favor duplique-o com uma nova validade para alterar preços.");
      return;
    }

    try {
      toast.loading("A atualizar os preços e notificando o cliente...");

      const items = editedItems && editedItems.length > 0 ? editedItems : (quotation.items || []);
      const subtotal = items.reduce((sum: number, it: any) => sum + (Number(it.price || 0) * Number(it.quantity || 1)), 0);

      // Update Firebase document
      const quotationRef = doc(db, `businesses/${profile.businessId}/quotations`, quotation.id);
      await updateDoc(quotationRef, {
        items,
        total: subtotal,
        status: 'pending_client_approval'
      });

      // Sync reserved stock
      await syncReservedStock(profile.businessId).catch(console.error);

      // Trigger automatic live in-app notification & Email/WhatsApp alerts
      try {
        const { triggerQuotationPriceUpdatedNotifications } = await import('../lib/notificationService');
        await triggerQuotationPriceUpdatedNotifications(profile.businessId, {
          quotationNumber: quotation.quotationNumber,
          total: subtotal * 1.17, // Include VAT in summary notify total
          customerId: quotation.customerId,
          customerEmail: quotation.customerEmail,
          customerPhone: quotation.customerPhone,
          customerName: quotation.customerName
        });
      } catch (notifErr) {
        console.error("Portal quotation pricing updated notifications trigger error:", notifErr);
      }

      // Notify active users/sellers in real-time
      await sendLiveNotification(
        profile.businessId,
        "Preços de Cotação Atualizados",
        `Os preços para a cotação ${quotation.quotationNumber} foram revistos. O cliente foi notificado por Email/WhatsApp.`,
        'info'
      );

      toast.dismiss();
      toast.success("Preços guardados com sucesso e cliente notificado!");
      setSelectedQuotation(null);
    } catch (error) {
      toast.dismiss();
      console.error(error);
      toast.error("Falha ao atualizar preços da cotação.");
    }
  };

  const handleRejectQuotation = async () => {
    if (!profile?.businessId || !selectedQuotation) return;
    if (!rejectionReason.trim()) {
      toast.error("Insira o motivo de rejeição.");
      return;
    }

    try {
      await updateDoc(doc(db, `businesses/${profile.businessId}/quotations`, selectedQuotation.id), {
        status: 'rejected',
        rejectionReason: rejectionReason
      });

      // Sync reserved stock
      await syncReservedStock(profile.businessId).catch(console.error);

      // Send rejection notification email
      if (selectedQuotation.customerEmail) {
        await sendEmailNotification(
          selectedQuotation.customerEmail,
          `Orçamento Cancelado - Ref: ${selectedQuotation.quotationNumber}`,
          `Estimado cliente, o seu pedido de cotação online ${selectedQuotation.quotationNumber} foi rejeitado pelo seguinte motivo:\n\n"${rejectionReason}"\n\nPor favor, contacte o suporte para mais informações.`
        );
      }

      await sendLiveNotification(
        profile.businessId,
        "Orçamento Rejeitado",
        `A cotação ${selectedQuotation.quotationNumber} foi rejeitada. Motivo: ${rejectionReason}`,
        'warning'
      );

      toast.success("Cotação marcada como rejeitada.");
      setIsRejectionOpen(false);
      setSelectedQuotation(null);
    } catch (e) {
      toast.error("Falha ao rejeitar orçamento.");
    }
  };

  const handleDownloadPDF = (qt: any) => {
    const companyInfo = {
      name: businessData?.name || profile?.businessName || 'Sabush System ERP',
      address: businessData?.address || '',
      phone: businessData?.phone || profile?.phone || '',
      email: businessData?.email || profile?.email || '',
      nuit: businessData?.taxId || ''
    };
    generateQuotationPDF(qt, companyInfo);
    toast.success("PDF descarregado!");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 font-sans">Gestão de Cotações / Orçamentos</h2>
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Aprovação de propostas para clientes e faturação automática</p>
        </div>
        <button 
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-2 bg-slate-900 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg hover:bg-slate-800 transition-all active:scale-95 text-xs uppercase tracking-wider"
        >
          <Plus size={16} />
          Nova Cotação
        </button>
      </div>

      {isCreating && (
        <div className="bg-white p-6 md:p-8 rounded-[32px] border border-blue-100 shadow-xl space-y-6 animate-in slide-in-from-top-4 duration-300">
          <div className="flex justify-between items-center bg-slate-50 -m-6 mb-4 p-6 md:-m-8 md:mb-4 md:p-8 rounded-t-[32px] border-b">
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <Sparkles className="text-blue-600" size={18} />
              Minuta de Novo Orçamento
            </h3>
            <button onClick={() => setIsCreating(false)} className="p-2 hover:bg-white rounded-xl text-slate-400 hover:text-slate-950 transition-all">
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-1.5 font-sans">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Selecionar Cliente</label>
              <select 
                className="w-full p-3.5 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-xs text-slate-700"
                value={newQuotation.customerId}
                onChange={e => {
                  const client = customers.find(c => c.id === e.target.value);
                  setNewQuotation({
                    ...newQuotation,
                    customerId: e.target.value,
                    customerName: client?.name || '',
                    customerEmail: client?.email || '',
                    customerPhone: client?.phone || '',
                    deliveryAddress: client?.address || ''
                  });
                }}
              >
                <option value="">Escolher Cliente...</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.phone || 'Sem celular'})</option>)}
              </select>
            </div>
            
            <div className="space-y-1.5 font-sans">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Validade do Orçamento</label>
              <input 
                type="date"
                className="w-full p-3.5 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-xs text-slate-700"
                value={newQuotation.expiryDate}
                onChange={e => setNewQuotation({...newQuotation, expiryDate: e.target.value})}
              />
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-slate-100">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Artigos no Orçamento</label>
            {newQuotation.items.map((item, index) => (
              <div key={index} className="grid grid-cols-12 gap-3 items-center">
                <div className="col-span-4">
                  <select 
                    className="w-full p-3.5 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-xs text-slate-700"
                    value={item.productId}
                    onChange={e => {
                      const prod = products.find(p => p.id === e.target.value);
                      const items = [...newQuotation.items];
                      items[index] = { ...item, productId: e.target.value, name: prod?.name || '', price: prod?.price || 0, selectedUnit: 'un', unitLabel: prod?.baseUnitLabel || 'un', unitMultiplier: 1 };
                      setNewQuotation({...newQuotation, items});
                    }}
                  >
                    <option value="">Selecionar Artigo...</option>
                    {products.map(p => {
                      const avail = (p.stockLevel || 0) - (p.reservedStock || 0);
                      return (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.price} {currency}) - Disp: {avail} {p.baseUnitLabel || 'un'} ({p.reservedStock || 0} res.)
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div className="col-span-3">
                  {(() => {
                    const prod = products.find(p => p.id === item.productId);
                    if (!prod || !prod.hasMultiUnits) {
                      return (
                        <div className="p-3.5 bg-slate-50 text-slate-400 font-semibold text-xs text-center rounded-xl">
                          {prod?.baseUnitLabel || 'un'}
                        </div>
                      );
                    }
                    return (
                      <select
                        className="w-full p-3.5 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-xs text-slate-700"
                        value={item.selectedUnit || 'un'}
                        onChange={e => {
                          const val = e.target.value;
                          const items = [...newQuotation.items];
                          items[index].selectedUnit = val;
                          if (val === 'un') {
                            items[index].unitLabel = prod.baseUnitLabel || 'un';
                            items[index].unitMultiplier = 1;
                            items[index].price = prod.price || 0;
                          } else if (val === 'cx') {
                            items[index].unitLabel = prod.boxUnitLabel || 'cx';
                            items[index].unitMultiplier = prod.boxUnitQty || 10;
                            items[index].price = prod.boxUnitPrice || (Number(prod.price || 0) * (prod.boxUnitQty || 10));
                          } else if (val === 'emb') {
                            items[index].unitLabel = prod.packUnitLabel || 'emb';
                            items[index].unitMultiplier = prod.packUnitQty || 100;
                            items[index].price = prod.packUnitPrice || (Number(prod.price || 0) * (prod.packUnitQty || 100));
                          }
                          setNewQuotation({...newQuotation, items});
                        }}
                      >
                        <option value="un">{prod.baseUnitLabel || 'un'}</option>
                        {prod.hasBoxUnit && <option value="cx">{prod.boxUnitLabel || 'cx'}</option>}
                        {prod.hasPackUnit && <option value="emb">{prod.packUnitLabel || 'emb'}</option>}
                      </select>
                    );
                  })()}
                </div>
                <div className="col-span-2">
                  <input 
                    type="number"
                    placeholder="Qtd"
                    className="w-full p-3.5 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-xs text-slate-700 text-center"
                    value={item.quantity}
                    onChange={e => {
                      const items = [...newQuotation.items];
                      items[index].quantity = Number(e.target.value);
                      setNewQuotation({...newQuotation, items});
                    }}
                  />
                  {(() => {
                    if (!item.productId) return null;
                    const prod = products.find(p => p.id === item.productId);
                    if (!prod) return null;
                    const avail = (prod.stockLevel || 0) - (prod.reservedStock || 0);
                    if (item.quantity > avail) {
                      return (
                        <div className="text-[9px] text-rose-500 font-bold mt-1 flex items-center gap-0.5 justify-center">
                          <AlertTriangle size={10} /> Excede Disp ({avail})
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
                <div className="col-span-3 flex gap-2">
                  <div className="flex-1 p-3.5 bg-slate-100 rounded-xl font-bold text-slate-650 text-xs text-right">
                    {((item.price || 0) * (item.quantity || 1)).toLocaleString('pt-MZ')} {currency}
                  </div>
                  <button 
                    onClick={() => {
                      const items = newQuotation.items.filter((_, i) => i !== index);
                      setNewQuotation({...newQuotation, items});
                    }}
                    className="p-3.5 hover:bg-rose-50 text-rose-500 rounded-xl transition-all"
                    title="Remover linha"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            ))}
            <button 
              onClick={() => setNewQuotation({...newQuotation, items: [...newQuotation.items, { productId: '', name: '', quantity: 1, price: 0 }]})}
              className="w-full py-3.5 border border-dashed border-slate-200 rounded-xl text-slate-400 text-xs font-bold hover:border-blue-300 hover:text-blue-500 transition-all flex items-center justify-center gap-2"
            >
              + Adicionar mais um produto
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t">
            <div className="text-xl font-black text-slate-900 font-sans">
              <span className="text-[10px] font-black text-slate-450 uppercase tracking-wider mr-3">Estimativa Bruta:</span>
              {calculateTotal(newQuotation.items).toLocaleString('pt-MZ')} {currency}
            </div>
            <div className="flex gap-3 w-full sm:w-auto">
              <button 
                onClick={() => setIsCreating(false)}
                className="flex-1 sm:flex-initial px-6 py-3 bg-slate-100 text-slate-600 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-slate-200 transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={handleCreateQuotation}
                className="flex-1 sm:flex-initial px-8 py-3 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-blue-500/10 hover:bg-blue-700 transition-all active:scale-95"
              >
                Guardar Orcamento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Grid List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {quotations.map((qt) => {
          const isOnlineRequest = qt.status === 'pending_seller_approval';
          return (
            <div key={qt.id} className="bg-white p-6 rounded-[28px] border border-slate-100 shadow-sm hover:shadow-md transition-all group relative overflow-hidden flex flex-col justify-between">
              
               {/* Badges for status */}
              <div className="flex justify-between items-center mb-4">
                <span className={cn(
                  "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest text-white shadow-sm",
                  qt.status === 'accepted' ? "bg-emerald-500" : 
                  qt.status === 'client_accepted' ? "bg-teal-500 animate-pulse" :
                  qt.status === 'expired' ? "bg-amber-600" :
                  qt.status === 'rejected' ? "bg-rose-500" : 
                  qt.status === 'client_rejected' ? "bg-rose-600 font-black" :
                  qt.status === 'client_cancelled' ? "bg-slate-500" :
                  qt.status === 'pending_client_approval' ? "bg-blue-500" :
                  isOnlineRequest ? "bg-amber-500 animate-pulse" : "bg-slate-400"
                )}>
                  {qt.status === 'accepted' ? 'Faturado / Aprovado' : 
                   qt.status === 'client_accepted' ? 'Aceite p/ Cliente' :
                   qt.status === 'expired' ? 'Expirado ⚠️' :
                   qt.status === 'rejected' ? 'Rejeitado / Cancelado' : 
                   qt.status === 'client_rejected' ? 'Recusado p/ Cliente' :
                   qt.status === 'client_cancelled' ? 'Cancelado p/ Cliente' :
                   qt.status === 'pending_client_approval' ? 'Aguardando Cliente' :
                   isOnlineRequest ? 'Online Pendente' : 'Pendente'}
                </span>

                <span className="font-mono text-[10px] font-black text-slate-400">
                  {qt.quotationNumber || 'QT-XXXX'}
                </span>
              </div>

              {/* Main Info */}
              <div className="space-y-2 mb-6">
                <h3 className="text-base font-black text-slate-900 truncate">{qt.customerName || qt.customerId || 'Cliente Geral'}</h3>
                <div>
                   <span className="text-[10px] font-black text-slate-400 uppercase">Total Estimado</span>
                   <p className="text-xl font-black text-blue-600">{Number(qt.total || 0).toLocaleString('pt-MZ')} {currency} <span className="text-[10px] text-slate-400 font-bold">(IVA Exc.)</span></p>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase">
                  <Clock size={12} />
                  Validade: {new Date(qt.expiryDate).toLocaleDateString()}
                </div>
                {doesQuotationExceedAvailableStock(qt) && (
                  <div className="flex items-center gap-1.5 bg-rose-50 text-rose-700 border border-rose-100 p-2.5 rounded-xl text-[10px] font-extrabold uppercase tracking-wider mt-2">
                    <AlertTriangle size={12} className="text-rose-500 shrink-0" />
                    <span>⚠️ Stock Insuficiente</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-4 border-t border-slate-50 mt-auto w-full">
                <button 
                  onClick={() => handleDownloadPDF(qt)}
                  className="flex-1 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-850 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1"
                >
                  <Download size={12} /> PDF
                </button>
                <button 
                  onClick={() => setSelectedQuotation(qt)}
                  className="flex-1 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1"
                >
                  <Eye size={12} /> Analisar
                </button>
                {qt.status === 'expired' && (
                  <button 
                    onClick={() => handleDuplicateQuotation(qt)}
                    className="px-3 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1 border border-amber-200"
                    title="Renovar Orçamento (Duplicar)"
                  >
                    <Copy size={12} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {quotations.length === 0 && !loading && (
        <div className="py-20 text-center space-y-4">
           <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-300">
              <FileText size={32} />
           </div>
           <h3 className="text-lg font-black text-slate-900 font-sans">Sem cotações ativas</h3>
           <p className="text-xs text-slate-450">Não há orçamentos ou propostas registadas neste negócio.</p>
        </div>
      )}

      {/* DETAILED ADVISING MODAL FOR REVIEWING LIVE QUOTATIONS AND ACCEPTING OR REJECTING COPIES */}
      <AnimatePresence>
        {selectedQuotation && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={() => { setSelectedQuotation(null); setIsRejectionOpen(false); }}
               className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
             />
             <motion.div 
               initial={{ scale: 0.95 }}
               animate={{ scale: 1 }}
               exit={{ scale: 0.95 }}
               className="relative bg-white w-full max-w-lg rounded-[32px] overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
             >
                {/* Modal Header */}
                <div className="bg-slate-900 text-white p-6 flex justify-between items-center">
                   <div>
                     <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Revisão de Pedido de Orçamento</p>
                     <h3 className="text-lg font-black font-sans">{selectedQuotation.quotationNumber}</h3>
                   </div>
                   <button onClick={() => { setSelectedQuotation(null); setIsRejectionOpen(false); }} className="p-2 hover:bg-white/10 rounded-xl"><X /></button>
                </div>

                {/* Modal Body */}
                <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-800">
                   {/* Client specs */}
                   <div className="bg-slate-50 p-4 rounded-2xl space-y-2">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Detalhes do Cliente</p>
                      <h4 className="font-black text-slate-900 text-sm">{selectedQuotation.customerName || selectedQuotation.customerId}</h4>
                      {selectedQuotation.customerPhone && <p className="text-xs font-semibold text-slate-500">Celular: {selectedQuotation.customerPhone}</p>}
                      {selectedQuotation.customerEmail && <p className="text-xs font-semibold text-slate-500">E-mail: {selectedQuotation.customerEmail}</p>}
                      {selectedQuotation.deliveryAddress && <p className="text-xs font-semibold text-slate-500">Morada: {selectedQuotation.deliveryAddress}</p>}
                   </div>

                   {/* Item table list - Custom pricing, billing conditions and automatic invoice controls */}
                   <div className="space-y-4">
                      <div className="flex justify-between items-center bg-amber-50/50 p-4 rounded-2xl border border-amber-100">
                        <div>
                          <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1">Lista de Artigos Solicitados</p>
                          <p className="text-xs text-slate-600 font-semibold">O cliente solicitou estes artigos. Pode calibrar e editar preços unitários abaixo antes de aprovar.</p>
                        </div>
                        {selectedQuotation.status !== 'accepted' && selectedQuotation.status !== 'rejected' && (
                          <span className="text-[9px] font-bold text-amber-600 bg-amber-100 px-2.5 py-1 rounded-full uppercase tracking-wider shrink-0 font-sans">
                            Modo de Edição Ativo
                          </span>
                        )}
                      </div>
                      
                      <div className="border border-slate-100 rounded-2xl overflow-hidden divide-y divide-slate-100 bg-white">
                         {selectedQuotation.status !== 'accepted' && selectedQuotation.status !== 'rejected' ? (
                           // Editable list
                           editedItems.map((it: any, index: number) => (
                             <div key={index} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs bg-slate-50/20">
                                <div className="flex-1">
                                   <p className="font-bold text-slate-800 text-sm">{it.name}</p>
                                   <p className="text-[10px] font-bold text-slate-400">Quantidade solicitada: {it.quantity}</p>
                                   {(() => {
                                     const prod = products.find(p => p.id === it.productId);
                                     if (prod) {
                                       const isCurrentlyReservedState = ['pending_client_approval', 'client_accepted', 'pending_seller_approval'].includes(selectedQuotation.status);
                                        const todayStr = new Date().toISOString().split('T')[0];
                                        const isExpired = selectedQuotation.expiryDate && selectedQuotation.expiryDate < todayStr;
                                        const isCurrentlyReserving = isCurrentlyReservedState && !isExpired;

                                        const reservedByOthers = (prod.reservedStock || 0) - (isCurrentlyReserving ? it.quantity : 0);
                                        const avail = (prod.stockLevel || 0) - Math.max(0, reservedByOthers);
                                       if (it.quantity > avail) {
                                         return (
                                           <p className="text-[10px] text-rose-500 font-extrabold mt-1 flex items-center gap-0.5">
                                             <AlertTriangle size={12} className="shrink-0 text-rose-500" /> Stock Insuficiente (Apenas {avail} {prod.baseUnitLabel || 'un'} disp.)
                                           </p>
                                         );
                                       }
                                     }
                                     return null;
                                   })()}
                                </div>
                                <div className="flex items-center gap-2">
                                   <span className="text-slate-400 text-[10px] font-black uppercase">Preço Unitário ({currency}):</span>
                                   <input 
                                     type="number" 
                                     value={it.price}
                                     onChange={(e) => {
                                       const val = Number(e.target.value) || 0;
                                       setEditedItems(prev => prev.map((item, idx) => idx === index ? { ...item, price: val } : item));
                                     }}
                                     className="w-24 px-3 py-1.5 border border-slate-205 rounded-xl font-bold text-right outline-none focus:ring-2 focus:ring-blue-500 text-xs text-slate-800"
                                   />
                                   <span className="font-extrabold text-slate-900 ml-4 min-w-[70px] text-right">
                                     {(Number(it.price || 0) * Number(it.quantity || 1)).toLocaleString('pt-MZ')} {currency}
                                   </span>
                                </div>
                             </div>
                           ))
                         ) : (
                           // Read-only list
                           selectedQuotation.items?.map((it: any, index: number) => (
                             <div key={index} className="p-3 flex justify-between items-center text-xs">
                                <div>
                                   <p className="font-black text-slate-900">{it.name}</p>
                                   <p className="text-[10px] font-bold text-slate-400">{Number(it.price || 0).toLocaleString('pt-MZ')} {currency} x {it.quantity}</p>
                                   {(() => {
                                     const prod = products.find(p => p.id === it.productId);
                                     if (prod) {
                                       const isCurrentlyReservedState = ['pending_client_approval', 'client_accepted', 'pending_seller_approval'].includes(selectedQuotation.status);
                                       const todayStr = new Date().toISOString().split('T')[0];
                                       const isExpired = selectedQuotation.expiryDate && selectedQuotation.expiryDate < todayStr;
                                       const isCurrentlyReserving = isCurrentlyReservedState && !isExpired;

                                       const reservedByOthers = (prod.reservedStock || 0) - (isCurrentlyReserving ? it.quantity : 0);
                                       const avail = (prod.stockLevel || 0) - Math.max(0, reservedByOthers);
                                       if (it.quantity > avail) {
                                         return (
                                           <p className="text-[10px] text-rose-500 font-extrabold mt-1 flex items-center gap-0.5 font-sans">
                                             <AlertTriangle size={12} className="shrink-0 text-rose-500" /> Stock Insuficiente (Apenas {avail} {prod.baseUnitLabel || 'un'} disp.)
                                           </p>
                                         );
                                       }
                                     }
                                     return null;
                                   })()}
                                </div>
                                <span className="font-black text-slate-950">{((it.price || 0) * (it.quantity || 1)).toLocaleString('pt-MZ')} {currency}</span>
                             </div>
                           ))
                         )}
                      </div>
                   </div>

                   {/* Financial breakdown summary */}
                   {(() => {
                      const finalItems = selectedQuotation.status !== 'accepted' && selectedQuotation.status !== 'rejected' ? editedItems : (selectedQuotation.items || []);
                      const computedSubtotal = finalItems.reduce((acc, current) => acc + (Number(current.price || 0) * Number(current.quantity || 1)), 0);
                      return (
                        <div className="border-t pt-4 space-y-2 text-xs">
                           <div className="flex justify-between font-medium">
                             <span>Subtotal Orçamento</span>
                             <span>{computedSubtotal.toLocaleString('pt-MZ')} {currency}</span>
                           </div>
                           <div className="flex justify-between font-medium">
                             <span>IVA Incorporado (17%)</span>
                             <span>{(computedSubtotal * 0.17).toLocaleString('pt-MZ')} {currency}</span>
                           </div>
                           <div className="flex justify-between items-center text-sm font-black text-slate-950 pt-2 border-t border-dashed">
                             <span>Total Convertido</span>
                             <span className="text-base text-blue-600">{(computedSubtotal * 1.17).toLocaleString('pt-MZ')} {currency}</span>
                           </div>
                        </div>
                      );
                   })()}

                   {/* Credit/Fiado vs Cash terms selector */}
                   {selectedQuotation.status !== 'accepted' && selectedQuotation.status !== 'rejected' && (
                     <div className="p-4 bg-slate-50 rounded-2xl space-y-3 border border-slate-100">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Condição de Pagamento para Factura Automática</p>
                        <div className="grid grid-cols-2 gap-3">
                           <button
                             type="button"
                             onClick={() => setApprovalPaymentMethod('cash')}
                             className={cn(
                               "py-3 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all border",
                               approvalPaymentMethod === 'cash' 
                                 ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                                 : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"
                             )}
                           >
                              Pago a Dinheiro
                           </button>
                           <button
                             type="button"
                             onClick={() => setApprovalPaymentMethod('credit')}
                             className={cn(
                               "py-3 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all border",
                               approvalPaymentMethod === 'credit' 
                                 ? "bg-amber-600 border-amber-600 text-white shadow-sm"
                                 : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"
                             )}
                           >
                              Aprovado a Crédito (Fiado)
                           </button>
                        </div>
                        {approvalPaymentMethod === 'credit' && (
                          <p className="text-[10px] text-amber-600 font-bold">
                            ⚠️ Isto aumentará o saldo devedor do cliente em {((editedItems.reduce((acc, current) => acc + (Number(current.price || 0) * Number(current.quantity || 1)), 0)) * 1.17).toLocaleString('pt-MZ')} {currency} e registará a Factura como Pendente no portal de cliente.
                          </p>
                        )}
                     </div>
                   )}

                   {/* Original list layout hidden to prevent duplicate or out of sync rendering */}
                   <div className="hidden">
                   {/* Item table list */}
                   <div className="space-y-2.5">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Lista de Artigos Solicitados</p>
                      
                      <div className="border border-slate-100 rounded-2xl overflow-hidden divide-y divide-slate-50">
                         {selectedQuotation.items?.map((it: any, index: number) => (
                           <div key={index} className="p-3 flex justify-between items-center text-xs">
                              <div>
                                 <p className="font-black text-slate-900">{it.name}</p>
                                 <p className="text-[10px] font-bold text-slate-400">{Number(it.price || 0).toLocaleString('pt-MZ')} {currency} x {it.quantity}</p>
                              </div>
                              <span className="font-black text-slate-950">{((it.price || 0) * (it.quantity || 1)).toLocaleString('pt-MZ')} {currency}</span>
                           </div>
                         ))}
                      </div>
                   </div>

                   {/* Financial breakdown summary */}
                   <div className="border-t pt-4 space-y-2 text-xs">
                      <div className="flex justify-between font-medium">
                        <span>Subtotal Orçamento</span>
                        <span>{Number(selectedQuotation.total || 0).toLocaleString('pt-MZ')} {currency}</span>
                      </div>
                      <div className="flex justify-between font-medium">
                        <span>IVA Incorporado (17%)</span>
                        <span>{(Number(selectedQuotation.total || 0) * 0.17).toLocaleString('pt-MZ')} {currency}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm font-black text-slate-950 pt-2 border-t border-dashed">
                        <span>Total Convertido</span>
                        <span className="text-base text-blue-600">{(Number(selectedQuotation.total || 0) * 1.17).toLocaleString('pt-MZ')} {currency}</span>
                      </div>
                   </div>

                   </div>

                   {selectedQuotation.status === 'expired' && (
                      <div className="p-4 bg-amber-50 text-amber-900 border border-amber-200 rounded-2xl text-xs space-y-1">
                         <span className="font-black uppercase tracking-wider block text-[10px] text-amber-700 flex items-center gap-1">
                           <AlertTriangle size={12} /> Orçamento Expirado ⚠️
                         </span>
                         <p className="font-bold">Este orçamento ultrapassou a sua data de validade ({selectedQuotation.expiryDate}) sem ser faturado ou aprovado.</p>
                         <p className="text-slate-550 font-semibold mt-1">O stock que estava reservado foi libertado de volta para o inventário disponível. Para prosseguir, por favor duplique ou renove este orçamento.</p>
                      </div>
                    )}

                    {selectedQuotation.status === 'client_accepted' && (
                     <div className="p-4 bg-teal-50 text-teal-900 border border-teal-200 rounded-2xl text-xs space-y-1">
                        <span className="font-black uppercase tracking-wider block text-[10px] text-teal-700">Aprovado pelo Cliente ✅</span>
                        <p className="font-bold">O cliente reviu os preços e aprovou esta proposta! Pode faturar e expedir os artigos agora.</p>
                     </div>
                   )}

                   {selectedQuotation.status === 'client_rejected' && (
                     <div className="p-4 bg-rose-50 text-rose-900 border border-rose-200 rounded-2xl text-xs space-y-1">
                        <span className="font-black uppercase tracking-wider block text-[10px] text-rose-700">Recusado pelo Cliente ❌</span>
                        <p className="font-bold">O cliente rejeitou os valores desta proposta.</p>
                        <p className="text-slate-550 italic mt-1 font-semibold">Feedback do cliente: "{selectedQuotation.clientFeedback || 'Sem feedback adicional'}"</p>
                     </div>
                   )}

                   {selectedQuotation.status === 'client_cancelled' && (
                     <div className="p-4 bg-slate-50 text-slate-700 border border-slate-200 rounded-2xl text-xs space-y-1">
                        <span className="font-black uppercase tracking-wider block text-[10px] text-slate-500">Cancelado pelo Cliente ⚠️</span>
                        <p className="font-semibold">Este pedido de cotação foi cancelado voluntariamente pelo cliente através do portal.</p>
                     </div>
                   )}

                   {selectedQuotation.rejectionReason && (
                     <div className="p-4 bg-rose-50 text-rose-700 border border-rose-100 rounded-2xl text-xs space-y-1">
                        <span className="font-black uppercase tracking-wider block text-[10px]">Motivo de Cancelamento Anterior</span>
                        <p className="font-semibold">"{selectedQuotation.rejectionReason}"</p>
                     </div>
                   )}

                   {/* Rejection input area */}
                   {isRejectionOpen && (
                     <motion.div 
                       initial={{ opacity: 0, height: 0 }}
                       animate={{ opacity: 1, height: 'auto' }}
                       className="p-4 border border-rose-100 bg-rose-50/20 rounded-2xl space-y-3"
                     >
                        <label className="text-[10px] font-black text-rose-600 uppercase tracking-widest block">Explique o Motivo de Rejeição *</label>
                        <textarea 
                          rows={2}
                          className="w-full bg-white border border-rose-205 rounded-xl text-xs font-semibold p-3 outline-none focus:ring-2 focus:ring-rose-500"
                          placeholder="Ex: Rutura imprevista de stock ou dados de morada incorretos."
                          value={rejectionReason}
                          onChange={e => setRejectionReason(e.target.value)}
                        />
                        <div className="flex gap-2 justify-end">
                           <button onClick={() => setIsRejectionOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-black uppercase">Voltar</button>
                           <button onClick={handleRejectQuotation} className="px-4 py-2 bg-rose-600 text-white rounded-lg text-[10px] font-black uppercase">Confirmar Rejeição</button>
                        </div>
                     </motion.div>
                   )}
                </div>

                {/* Modal actions */}
                {!isRejectionOpen && selectedQuotation.status === 'expired' && (
                   <div className="p-6 bg-slate-50 border-t flex flex-col sm:flex-row gap-3">
                      <button 
                        type="button"
                        onClick={() => handleDuplicateQuotation(selectedQuotation)}
                        className="flex-1 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md flex items-center justify-center gap-2"
                      >
                         <Copy size={16} /> Duplicar e Renovar Orçamento
                      </button>
                   </div>
                 )}
                {!isRejectionOpen && selectedQuotation.status !== 'accepted' && selectedQuotation.status !== 'rejected' && selectedQuotation.status !== 'client_rejected' && selectedQuotation.status !== 'client_cancelled' && selectedQuotation.status !== 'expired' && (
                  <div className="p-6 bg-slate-50 border-t flex flex-col sm:flex-row gap-3">
                     <button 
                       onClick={() => setIsRejectionOpen(true)}
                       className="flex-1 py-3 bg-white hover:bg-rose-50 border border-rose-200 text-rose-600 rounded-xl text-xs font-black uppercase tracking-widest transition-all"
                     >
                        Rejeitar Cotação
                     </button>
                     <button 
                       onClick={() => handleUpdateQuotationPrices(selectedQuotation)}
                       className="flex-1 py-3 bg-blue-650 hover:bg-blue-600 bg-[#17A398] text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md flex items-center justify-center gap-1"
                     >
                        <Send size={16} /> Gravar Preços e Notificar
                     </button>
                     <button 
                       onClick={() => handleApproveQuotation(selectedQuotation)}
                       className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md flex items-center justify-center gap-1"
                     >
                        <CheckCircle size={16} /> Aprovar Orçamento
                     </button>
                  </div>
                )}
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
