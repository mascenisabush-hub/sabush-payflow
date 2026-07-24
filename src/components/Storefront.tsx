import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, getDoc, getDocs } from 'firebase/firestore';
import { 
  ShoppingCart, Search, Package, ArrowRight, Check, X, CreditCard, 
  Smartphone, User, MapPin, Phone, Mail, AlertCircle, Plus, Minus, 
  FileText, Download, CheckCircle, Clock, Trash2, SearchIcon, RefreshCw,
  Filter, MessageCircle
} from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { generateQuotationPDF } from '../lib/pdfGenerator';
import { sendEmailNotification, buildQuotationEmailBody, buildSellerNewQuotationEmailBody } from '../lib/emailService';
import { sendLiveNotification } from '../lib/notificationService';
import { sendWhatsAppNotification } from '../lib/whatsappService';

interface StorefrontProps {
  businessId: string;
  onClose?: () => void;
}

export default function Storefront({ businessId, onClose }: StorefrontProps) {
  const [activeTab, setActiveTab] = useState<'catalog' | 'tracking'>('catalog');
  const [businessData, setBusinessData] = useState<any | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [cart, setCart] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [checkoutMode, setCheckoutMode] = useState<'direct_order' | 'quotation'>('quotation');

  useEffect(() => {
    if (!businessId) return;
    const docRef = doc(db, 'businesses', businessId);
    getDoc(docRef).then(snapshot => {
      if (snapshot.exists()) {
        setBusinessData(snapshot.data());
      }
    }).catch(err => {
      console.warn("Could not load business details in Storefront:", err);
    });
  }, [businessId]);
  
  // Checkout Form
  const [orderData, setOrderData] = useState({ name: '', phone: '', email: '', address: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generatedDoc, setGeneratedDoc] = useState<any | null>(null);

  // Tracking State
  const [trackingId, setTrackingId] = useState('');
  const [trackedOrder, setTrackedOrder] = useState<any | null>(null);
  const [isTrackingLoading, setIsTrackingLoading] = useState(false);

  // Filtering & Sorting State
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [minPrice, setMinPrice] = useState<string>('');
  const [maxPrice, setMaxPrice] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('name');
  const [featuredProductId, setFeaturedProductId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const prodParam = params.get('product') || params.get('item');
      if (prodParam) {
        setFeaturedProductId(prodParam);
      }
    } catch (e) {
      console.warn("Could not read URL parameter in Storefront:", e);
    }
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, `businesses/${businessId}/products`),
      where('availableOnline', '==', true)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, err => {
      try {
        handleFirestoreError(err, OperationType.LIST, 'storefront_products');
      } catch (e) {
        console.warn("Gracefully logged storefront products error:", e);
      }
    });

    return unsubscribe;
  }, [businessId]);

  const addToCart = (product: any) => {
    if (product.stockLevel <= 0) {
      toast.error("Lamento, este artigo está temporariamente sem stock.");
      return;
    }
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
      if (existing.quantity >= product.stockLevel) {
        toast.error("Atingiu o limite do stock disponível.");
        return;
      }
      setCart(cart.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
    } else {
      setCart([...cart, { ...product, quantity: 1 }]);
    }
    toast.success(`${product.name} adicionado ao carrinho!`);
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(cart.map(item => {
      if (item.id === productId) {
        const newQty = Math.max(1, item.quantity + delta);
        const product = products.find(p => p.id === productId);
        if (delta > 0 && product && newQty > product.stockLevel) {
          toast.error("Excede o stock disponível.");
          return item;
        }
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.id !== productId));
    toast.info("Artigo removido.");
  };

  const total = cart.reduce((sum, item) => sum + (item.price || item.onlinePrice || 0) * item.quantity, 0);

  // Client generates the quotation / order workflow
  const handleFinalize = async () => {
    if (!orderData.name || !orderData.phone || !orderData.address) {
      toast.error("Por favor, preencha todos os campos obrigatórios (*).");
      return;
    }
    if (cart.length === 0) {
      toast.error("O carrinho está vazio.");
      return;
    }

    setIsSubmitting(true);
    try {
      // Validate live stock from database first to make sure they aren't quoting or ordering out of stock products
      for (const item of cart) {
        const productRef = doc(db, `businesses/${businessId}/products`, item.id);
        const prodDoc = await getDoc(productRef);
        if (prodDoc.exists()) {
          const actualStock = prodDoc.data().stockLevel || 0;
          if (actualStock <= 0) {
            toast.error(`Infelizmente o produto "${item.name}" está esgotado no momento.`);
            setIsSubmitting(false);
            return;
          }
          if (item.quantity > actualStock) {
            toast.error(`Apenas existem ${actualStock} unidades disponíveis de "${item.name}". Ajuste a quantidade no carrinho.`);
            setIsSubmitting(false);
            return;
          }
        }
      }

      // Fetch Business details for WhatsApp and Webhook notifications
      let whatsappApiKey = '';
      let whatsappPhone = '';
      let whatsappPhoneNumberId = '';
      let webhookUrl = '';
      let currency = 'MZN';

      try {
        const bizSnap = await getDoc(doc(db, 'businesses', businessId));
        if (bizSnap.exists()) {
          const bData = bizSnap.data();
          whatsappApiKey = bData.whatsappConfig?.apiKey || '';
          whatsappPhone = bData.whatsappConfig?.phone || bData.phone || '';
          whatsappPhoneNumberId = bData.whatsappConfig?.phoneNumberId || '';
          webhookUrl = bData.makeConfig?.webhookUrl || '';
          currency = bData.currency || 'MZN';
        }
      } catch (bizErr) {
        console.error('[Storefront] Error fetching business details for WhatsApp:', bizErr);
      }

      if (checkoutMode === 'quotation') {
        // Generate QUOTATION
        const prefix = "QT-" + new Date().getFullYear().toString();
        const rand = Math.floor(1000 + Math.random() * 9000);
        const quotationNumber = `${prefix}-${rand}`;
        
        const quotationPayload = {
          businessId,
          customerName: orderData.name,
          customerPhone: orderData.phone,
          customerEmail: orderData.email,
          deliveryAddress: orderData.address,
          items: cart.map(item => ({
            productId: item.id,
            name: item.name,
            quantity: item.quantity,
            price: item.price || item.onlinePrice || 0
          })),
          total,
          quotationNumber,
          status: 'pending_seller_approval', // special status for client online requests
          expiryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 5 days validity
          createdAt: new Date(),
          isOnlineRequest: true
        };

        const docRef = await addDoc(collection(db, `businesses/${businessId}/quotations`), quotationPayload);
        const savedDoc = { id: docRef.id, ...quotationPayload };

        setGeneratedDoc({
          type: 'quotation',
          ...savedDoc
        });

        // STEP 2: AUTOMATED NOTIFICATIONS
        // Real-time seller notification instantly in dashboard
        await sendLiveNotification(
          businessId,
          `Nova Cotação Online: ${quotationNumber}`,
          `Cliente ${orderData.name} solicitou um orçamento de ${total.toLocaleString('pt-MZ')} MT.`,
          'info'
        );

        // Seller gets email too
        await sendEmailNotification(
          "comercial@sabush.com",
          `[SABUSH SYSTEM] Nova Cotação Solicitada: ${quotationNumber}`,
          buildSellerNewQuotationEmailBody(savedDoc)
        );

        // Client gets confirmation email too
        if (orderData.email) {
          await sendEmailNotification(
            orderData.email,
            `Seu Pedido de Cotacão Recebido - ${quotationNumber}`,
            buildQuotationEmailBody(savedDoc)
          );
        }

        // Automated WhatsApp Notification & Webhook Dispatch
        await sendWhatsAppNotification({
          apiKey: whatsappApiKey,
          phoneNumberId: whatsappPhoneNumberId,
          businessPhone: whatsappPhone,
          webhookUrl,
          recipientPhone: orderData.phone,
          customerName: orderData.name,
          orderNumber: quotationNumber,
          totalAmount: total,
          currency,
          items: cart,
          isQuotation: true
        });

        setCart([]);
        setIsCheckoutOpen(false);
        toast.success("Cotação gerada com sucesso!");

      } else {
        // Place Normal Direct Order
        const orderRef = await addDoc(collection(db, `businesses/${businessId}/online_orders`), {
          businessId,
          customerName: orderData.name,
          customerPhone: orderData.phone,
          customerEmail: orderData.email,
          deliveryAddress: orderData.address,
          items: cart,
          total,
          status: 'pending',
          paymentStatus: 'unpaid',
          createdAt: serverTimestamp()
        });

        setGeneratedDoc({
          type: 'order',
          id: orderRef.id,
          customerName: orderData.name,
          total
        });

        await sendLiveNotification(
          businessId,
          `Nova Encomenda Direta`,
          `Cliente ${orderData.name} colocou um pedido online no valor de ${total.toLocaleString('pt-MZ')} MT.`,
          'success'
        );

        // Automated WhatsApp Notification & Webhook Dispatch
        await sendWhatsAppNotification({
          apiKey: whatsappApiKey,
          phoneNumberId: whatsappPhoneNumberId,
          businessPhone: whatsappPhone,
          webhookUrl,
          recipientPhone: orderData.phone,
          customerName: orderData.name,
          orderNumber: orderRef.id,
          totalAmount: total,
          currency,
          items: cart,
          isQuotation: false
        });

        setCart([]);
        setIsCheckoutOpen(false);
        toast.success("Encomenda enviada com sucesso!");
      }

    } catch (e: any) {
      console.error(e);
      toast.error("Ocorreu um erro ao finalizar o processo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadPDF = () => {
    if (!generatedDoc) return;
    const companyInfo = {
      name: businessData?.name || 'Sabush System ERP',
      address: businessData?.address || '',
      phone: businessData?.phone || '',
      email: businessData?.email || '',
      nuit: businessData?.taxId || ''
    };
    generateQuotationPDF(generatedDoc, companyInfo);
    toast.success("Download do arquivo PDF iniciado!");
  };

  const handleTrack = async (idToSearch?: string) => {
    const searchId = idToSearch || trackingId.trim();
    if (!searchId) {
      toast.error("Introduza um ID de Cotação ou Encomenda.");
      return;
    }

    setIsTrackingLoading(true);
    setTrackedOrder(null);

    try {
      // Look in quotations first
      const quoteRef = doc(db, `businesses/${businessId}/quotations`, searchId);
      const quoteSnap = await getDoc(quoteRef);

      if (quoteSnap.exists()) {
        setTrackedOrder({ id: quoteSnap.id, type: 'quotation', ...quoteSnap.data() });
        toast.success("Documento encontrado!");
        setIsTrackingLoading(false);
        return;
      }

      // Look in online_orders
      const orderRef = doc(db, `businesses/${businessId}/online_orders`, searchId);
      const orderSnap = await getDoc(orderRef);

      if (orderSnap.exists()) {
        setTrackedOrder({ id: orderSnap.id, type: 'order', ...orderSnap.data() });
        toast.success("Documento encontrado!");
        setIsTrackingLoading(false);
        return;
      }

      // Look in invoices
      const invoiceRef = doc(db, `businesses/${businessId}/invoices`, searchId);
      const invoiceSnap = await getDoc(invoiceRef);

      if (invoiceSnap.exists()) {
        setTrackedOrder({ id: invoiceSnap.id, type: 'invoice', ...invoiceSnap.data() });
        toast.success("Documento encontrado!");
        setIsTrackingLoading(false);
        return;
      }

      toast.error("Nenhum pedido ou cotação encontrado com este ID.");
    } catch (err) {
      toast.error("Erro na busca.");
    } finally {
      setIsTrackingLoading(false);
    }
  };

  // Dynamically extract categories from all storefront products
  const categories = Array.from(new Set(products.map(p => p.category || 'Geral'))).filter(Boolean);

  const processedProducts = products
    .filter(p => {
      // If this is the featured product from URL, bypass filters so it is always present
      if (featuredProductId && p.id === featuredProductId) return true;

      // Search matches
      const matchesSearch = p.name?.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Category matches
      const matchesCategory = selectedCategory ? (p.category || 'Geral') === selectedCategory : true;
      
      // Price range matches
      const prodPrice = Number(p.onlinePrice || p.price || 0);
      const matchesMinPrice = minPrice !== '' ? prodPrice >= Number(minPrice) : true;
      const matchesMaxPrice = maxPrice !== '' ? prodPrice <= Number(maxPrice) : true;
      
      return matchesSearch && matchesCategory && matchesMinPrice && matchesMaxPrice;
    })
    .sort((a, b) => {
      if (sortBy === 'name') {
        return (a.name || '').localeCompare(b.name || '');
      }
      if (sortBy === 'price_asc') {
        const pA = Number(a.onlinePrice || a.price || 0);
        const pB = Number(b.onlinePrice || b.price || 0);
        return pA - pB;
      }
      if (sortBy === 'price_desc') {
        const pA = Number(a.onlinePrice || a.price || 0);
        const pB = Number(b.onlinePrice || b.price || 0);
        return pB - pA;
      }
      if (sortBy === 'stock') {
        const sA = Number(a.stockLevel || 0);
        const sB = Number(b.stockLevel || 0);
        return sB - sA; // highest stock availability first
      }
      return 0;
    });

  // Reorder so that the featured product goes first in the layout
  let finalProcessed = [...processedProducts];
  if (featuredProductId) {
    const featIndex = finalProcessed.findIndex(p => p.id === featuredProductId);
    if (featIndex > -1) {
      const [featProduct] = finalProcessed.splice(featIndex, 1);
      finalProcessed = [featProduct, ...finalProcessed];
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-50 z-50 flex flex-col overflow-hidden animate-in fade-in duration-300">
      {/* Header */}
      <header className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl" title="Fechar Portal"><X /></button>
          <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white">
            <Package size={24} />
          </div>
          <div>
            <h1 className="font-black text-slate-900 leading-none">Sabush Store</h1>
            <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Portal Comercial Online</p>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex bg-slate-100 p-1.5 rounded-2xl gap-1">
          <button 
            onClick={() => { setActiveTab('catalog'); setGeneratedDoc(null); }}
            className={cn("px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all", activeTab === 'catalog' ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800")}
          >
            Catálogo de Artigos
          </button>
          <button 
            onClick={() => setActiveTab('tracking')}
            className={cn("px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all", activeTab === 'tracking' ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800")}
          >
            Rastrear Pedido/Cotação
          </button>
        </div>

        <div className="flex items-center gap-4">
           {activeTab === 'catalog' && (
             <div className="relative hidden md:block">
               <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
               <input 
                className="pl-12 pr-4 py-2 bg-slate-50 border-none rounded-xl text-sm font-bold w-64 outline-none focus:ring-2 focus:ring-slate-900/5 transition-all"
                placeholder="Pesquisar produtos..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
               />
             </div>
           )}
           <button 
            onClick={() => setIsCheckoutOpen(true)}
            className="flex items-center gap-3 bg-slate-900 text-white px-6 py-3 rounded-2xl font-black shadow-xl shadow-slate-905/20 hover:bg-slate-800 transition-all active:scale-95 relative"
           >
             <ShoppingCart size={20} />
             <span className="hidden sm:inline">Carrinho</span>
             {cart.length > 0 && (
                <div className="absolute -top-2 -right-2 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs animate-bounce shadow-lg font-bold">
                  {cart.length}
                </div>
             )}
           </button>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 overflow-y-auto p-4 md:p-10">
        <div className="max-w-7xl mx-auto">
          
          <AnimatePresence mode="wait">
            {activeTab === 'catalog' && !generatedDoc ? (
              <motion.div 
                key="catalog-view"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                {/* Hero section */}
                <section className="relative h-48 md:h-64 bg-slate-900 rounded-[32px] overflow-hidden flex items-center px-8 md:px-12 text-white">
                   <div className="absolute inset-0 opacity-20 bg-[url('https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=2074&auto=format&fit=crop')] bg-cover bg-center" />
                   <div className="relative z-10 max-w-xl space-y-2">
                      <h2 className="text-2xl md:text-4xl font-black leading-tight tracking-tight">Cotações e Encomendas Simplificadas.</h2>
                      <p className="text-slate-400 text-sm font-semibold">Selecione produtos, gere uma cotação em PDF oficial, e receba aprovação em minutos!</p>
                      <div className="flex gap-4 pt-2">
                         <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-400">
                            <Check size={14} /> IVA Incorporado (17%)
                         </div>
                         <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-blue-400">
                            <FileText size={14} /> PDF Instantâneo
                         </div>
                      </div>
                   </div>
                </section>

                {/* Mobile Search Input */}
                <div className="block md:hidden">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                    <input 
                      className="pl-12 pr-4 py-3 bg-white w-full border border-slate-200 rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-slate-900/5 transition-all"
                      placeholder="Pesquisar produtos..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>

                {/* Desktop and Mobile Filtering & Sorting Controls */}
                <div className="bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
                    {/* Category Filter */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Filtrar por Categoria</label>
                      <select
                        className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-slate-900/10 transition-all cursor-pointer"
                        value={selectedCategory}
                        onChange={e => setSelectedCategory(e.target.value)}
                      >
                        <option value="">Todas as Categorias</option>
                        {categories.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>

                    {/* Price Range Filter */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Faixa de Preço (MT)</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          placeholder="Min"
                          className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-slate-900/10 transition-all"
                          value={minPrice}
                          onChange={e => setMinPrice(e.target.value)}
                        />
                        <span className="text-slate-400 text-xs font-bold">até</span>
                        <input
                          type="number"
                          placeholder="Max"
                          className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-slate-900/10 transition-all"
                          value={maxPrice}
                          onChange={e => setMaxPrice(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Sort selector */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ordenar por</label>
                      <select
                        className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-slate-900/10 transition-all cursor-pointer"
                        value={sortBy}
                        onChange={e => setSortBy(e.target.value)}
                      >
                        <option value="name">Nome (A-Z)</option>
                        <option value="price_asc">Preço: Baixo para Alto</option>
                        <option value="price_desc">Preço: Alto para Baixo</option>
                        <option value="stock">Disponibilidade de Stock</option>
                      </select>
                    </div>
                  </div>

                  {/* Reset Button */}
                  {(selectedCategory || minPrice || maxPrice || sortBy !== 'name') && (
                    <div className="mt-4 pt-4 border-t border-slate-50 flex justify-end">
                      <button
                        onClick={() => {
                          setSelectedCategory('');
                          setMinPrice('');
                          setMaxPrice('');
                          setSortBy('name');
                        }}
                        className="text-xs font-black uppercase tracking-wider text-rose-600 hover:text-rose-700 transition"
                      >
                        Limpar Filtros e Ordenação
                      </button>
                    </div>
                  )}
                </div>

                {/* Product Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {finalProcessed.map(p => {
                    const isFeatured = p.id === featuredProductId;
                    return (
                      <div 
                        key={p.id}
                        id={`product-${p.id}`}
                        className={cn(
                          "bg-white p-5 rounded-[24px] border transition-all duration-300 flex flex-col group relative overflow-visible",
                          isFeatured ? "border-amber-500 ring-4 ring-amber-500/15 shadow-xl scale-[1.01] sm:scale-[1.03] z-10" : "border-slate-100 shadow-sm hover:shadow-md",
                          p.stockLevel <= 0 && "opacity-60 grayscale"
                        )}
                      >
                         {isFeatured && (
                           <div className="absolute -top-3 left-6 bg-gradient-to-r from-amber-500 to-amber-600 text-white text-[9px] font-black tracking-widest px-3 py-1 rounded-full uppercase shadow-md flex items-center gap-1.5 animate-pulse">
                             <Check size={10} className="stroke-[3]" /> Artigo Selecionado
                           </div>
                         )}

                         <div className="aspect-square bg-slate-50 rounded-2xl mb-4 overflow-hidden relative">
                            {p.imageUrl ? (
                              <img 
                               src={p.imageUrl} 
                               alt={p.name} 
                               loading="lazy"
                               referrerPolicy="no-referrer"
                               className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" 
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-slate-200">
                                 <Package size={48} strokeWidth={1} />
                              </div>
                            )}
                            {p.stockLevel <= 0 && (
                              <div className="absolute inset-0 bg-slate-900/60 flex items-center justify-center">
                                 <span className="bg-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-slate-900">Esgotado</span>
                              </div>
                            )}
                         </div>
                         
                         <div className="space-y-1 mb-4 flex-1">
                           <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{p.category || 'Geral'}</p>
                           <h3 className="text-base font-black text-slate-900 truncate">{p.name}</h3>
                           <p className="text-[11px] text-slate-400 line-clamp-2">{p.description || 'Artigo elegante com stock disponível.'}</p>
                         </div>

                         <div className="flex items-center justify-between pt-2 mt-auto border-t border-slate-50">
                             <div>
                               <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Preço Un.</p>
                               <p className="text-lg font-black text-slate-900">{Number(p.onlinePrice || p.price || 0).toLocaleString('pt-MZ')} MT</p>
                             </div>
                             <button 
                               onClick={() => addToCart(p)}
                               disabled={p.stockLevel <= 0}
                               className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center hover:bg-slate-800 transition-all active:scale-95 shadow-lg shadow-slate-900/10 disabled:opacity-40"
                             >
                               <Plus size={18} />
                             </button>
                         </div>
                      </div>
                    );
                  })}
                </div>

                {products.length === 0 && (
                   <div className="py-20 text-center space-y-4">
                      <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-300">
                         <Package size={32} />
                      </div>
                      <h3 className="text-lg font-black text-slate-900 font-sans">Sem produtos adicionados</h3>
                      <p className="text-xs text-slate-400">Nenhum produto está listado como visível online.</p>
                   </div>
                )}

                {products.length > 0 && processedProducts.length === 0 && (
                   <div className="py-20 text-center space-y-4">
                      <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-300">
                         <Filter size={32} />
                      </div>
                      <h3 className="text-lg font-black text-slate-900 font-sans">Nenhum produto encontrado</h3>
                      <p className="text-xs text-slate-400">Nenhum produto corresponde aos filtros aplicados no momento.</p>
                      <button
                        onClick={() => {
                          setSelectedCategory('');
                          setMinPrice('');
                          setMaxPrice('');
                          setSortBy('name');
                          setSearchTerm('');
                        }}
                        className="mt-4 px-6 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all hover:bg-slate-850"
                      >
                        Limpar Todos os Filtros
                      </button>
                   </div>
                )}
              </motion.div>
            ) : null}

            {/* Generated Success page */}
            {generatedDoc ? (
              <motion.div 
                key="success-doc-view"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="max-w-md mx-auto bg-white p-8 rounded-[32px] border border-slate-100 text-center space-y-6 shadow-xl"
              >
                <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto animate-bounce">
                  <CheckCircle size={36} />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-900 font-sans">Pedido Registado!</h2>
                  <p className="text-xs font-semibold text-slate-400 mt-1 uppercase tracking-wider">
                    {generatedDoc.type === 'quotation' ? 'Cotação Gerada com Sucesso' : 'Encomenda Direta Iniciada'}
                  </p>
                </div>

                <div className="bg-slate-50 p-5 rounded-2xl text-left space-y-3">
                   <div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">ID do Documento (Rastreio)</span>
                      <span className="font-mono text-xs font-bold text-blue-600 break-all">{generatedDoc.id}</span>
                   </div>
                   {generatedDoc.quotationNumber && (
                     <div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Nº da Cotação</span>
                        <span className="font-black text-xs text-slate-800">{generatedDoc.quotationNumber}</span>
                     </div>
                   )}
                   <div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Cliente</span>
                      <span className="font-black text-xs text-slate-800">{generatedDoc.customerName}</span>
                   </div>
                   <div className="border-t pt-2 flex items-center justify-between">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Valor total estimado</span>
                      <span className="font-black text-sm text-slate-900">{generatedDoc.total?.toLocaleString('pt-MZ')} MT</span>
                   </div>
                </div>

                <div className="space-y-3">
                  {generatedDoc.type === 'quotation' && (
                    <button 
                      onClick={handleDownloadPDF}
                      className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-3.5 rounded-xl font-black text-sm transition-all shadow-md active:scale-95"
                    >
                      <Download size={18} />
                      Descarregar Cotação PDF
                    </button>
                  )}
                  <a 
                    href={`https://wa.me/${(businessData?.phone || '258840000000').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                      `Olá! Acabei de submeter um pedido na vossa montra digital.\n\n*Tipo:* ${generatedDoc.type === 'quotation' ? 'Cotação' : 'Encomenda Direta'}\n*ID do Pedido:* ${generatedDoc.id}\n*Cliente:* ${generatedDoc.customerName || 'Cliente Geral'}\n*Valor Total:* ${generatedDoc.total?.toLocaleString('pt-MZ')} MT\n\nPor favor, confirmem a recepção do pedido. Obrigado!`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white py-3.5 rounded-xl font-black text-sm transition-all shadow-md active:scale-95 cursor-pointer hover:shadow-emerald-250/20"
                  >
                    <MessageCircle size={18} />
                    Enviar via WhatsApp (Falar com Vendedor)
                  </a>

                  <button 
                    onClick={() => {
                      setTrackingId(generatedDoc.id);
                      setActiveTab('tracking');
                      handleTrack(generatedDoc.id);
                      setGeneratedDoc(null);
                    }}
                    className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer"
                  >
                    Acompanhar Estado de Entrega
                  </button>
                  <button 
                    onClick={() => { setGeneratedDoc(null); setCart([]); }}
                    className="w-full text-xs font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest pt-2 cursor-pointer"
                  >
                    Voltar para o Catálogo
                  </button>
                </div>
              </motion.div>
            ) : null}

            {/* TRACKING PORTAL */}
            {activeTab === 'tracking' ? (
              <motion.div 
                key="tracking-portal"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="max-w-2xl mx-auto space-y-8"
              >
                <div className="bg-white p-6 md:p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-6">
                  <div className="text-center md:text-left space-y-1">
                     <h3 className="text-xl font-black text-slate-900 font-sans">Rastreio de Pedidos e Cotações</h3>
                     <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Verifique o estado real do seu orçamento ou encomenda</p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                     <div className="relative flex-1">
                       <FileText className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                       <input 
                         className="w-full pl-12 pr-4 py-3.5 bg-slate-50 ring-0 hover:bg-slate-100/50 focus:ring-2 focus:ring-slate-900/5 rounded-2xl text-sm font-bold outline-none border-none transition-all placeholder:text-slate-400"
                         placeholder="Introduza o ID do documento (ex: 7X8ysB...)"
                         value={trackingId}
                         onChange={e => setTrackingId(e.target.value)}
                       />
                     </div>
                     <button 
                       onClick={() => handleTrack()}
                       disabled={isTrackingLoading}
                       className="px-6 py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                     >
                       {isTrackingLoading ? <RefreshCw className="animate-spin" size={18} /> : <SearchIcon size={18} />}
                       Pesquisar
                     </button>
                  </div>
                </div>

                {/* Track result visualizer */}
                {trackedOrder ? (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-white border rounded-[32px] overflow-hidden shadow-md"
                  >
                    {/* Header bar */}
                    <div className="bg-blue-900 p-6 text-white flex justify-between items-center border-b-2 border-[#D4AF37]/50">
                       <div>
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                            {trackedOrder.type === 'quotation' ? 'Cotação Online' : trackedOrder.type === 'invoice' ? 'Factura Oficial' : 'Encomenda Direta'}
                          </p>
                          <h4 className="font-mono text-sm font-bold">{trackedOrder.quotationNumber || trackedOrder.invoiceNumber || trackedOrder.id}</h4>
                       </div>
                       <div className="px-3.5 py-1.5 rounded-xl bg-white/10 border border-white/10 text-xs font-black uppercase tracking-widest">
                          {trackedOrder.status === 'pending_seller_approval' || trackedOrder.status === 'pending' ? 'Sob Revisão' : 
                           trackedOrder.status === 'accepted' || trackedOrder.status === 'confirmed' ? 'Aceite/Confirmado' : 
                           trackedOrder.status === 'rejected' ? 'Rejeitado' : trackedOrder.status}
                       </div>
                    </div>

                    {/* Timeline stepper */}
                    <div className="p-6 md:p-8 space-y-8">
                       <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Progresso de Processamento</h5>
                       
                       <div className="relative pl-8 space-y-8 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
                          {/* Step 1 */}
                          <div className="relative">
                            <span className={cn(
                              "absolute -left-8 top-0.5 w-6.5 h-6.5 rounded-full flex items-center justify-center text-[10px] font-bold border-2",
                              "bg-emerald-500 border-emerald-500 text-white text-xs"
                            )}>
                              ✓
                            </span>
                            <div>
                              <p className="text-xs font-black text-slate-900">Pedido Submetido Online</p>
                              <p className="text-[11px] text-slate-400">Pelo cliente no portal online.</p>
                            </div>
                          </div>

                          {/* Step 2 */}
                          <div className="relative">
                            <span className={cn(
                              "absolute -left-8 top-0.5 w-6.5 h-6.5 rounded-full flex items-center justify-center text-[10px] font-bold border-2",
                              (trackedOrder.status === 'accepted' || trackedOrder.status === 'confirmed' || trackedOrder.status === 'ready_for_pickup' || trackedOrder.status === 'delivered') 
                                ? "bg-emerald-500 border-emerald-500 text-white" 
                                : trackedOrder.status === 'rejected' 
                                ? "bg-red-500 border-red-500 text-white" 
                                : "bg-white border-blue-500 text-blue-500"
                            )}>
                              {trackedOrder.status === 'rejected' ? '✗' : '2'}
                            </span>
                            <div>
                              <p className="text-xs font-black text-slate-900">
                                {trackedOrder.status === 'rejected' ? 'Rejeitado pelo Vendedor' : 'Confirmação Comercial'}
                              </p>
                              <p className="text-[11px] text-slate-400">
                                {trackedOrder.status === 'rejected' 
                                  ? `Motivo: ${trackedOrder.rejectionReason || 'Cancelado pela gerência'}` 
                                  : (trackedOrder.status === 'accepted' || trackedOrder.status === 'confirmed' || trackedOrder.status === 'ready_for_pickup' || trackedOrder.status === 'delivered')
                                  ? 'Aprovado pelo vendedor. Factura correspondente gerada!'
                                  : 'O vendedor está a analisar o orçamento...'}
                              </p>
                            </div>
                          </div>

                          {/* Step 3 */}
                          <div className="relative">
                            <span className={cn(
                              "absolute -left-8 top-0.5 w-6.5 h-6.5 rounded-full flex items-center justify-center text-[10px] font-bold border-2",
                              (trackedOrder.status === 'ready_for_pickup' || trackedOrder.status === 'delivered') 
                                ? "bg-emerald-500 border-emerald-500 text-white" 
                                : "bg-white border-slate-200 text-slate-300"
                            )}>
                              3
                            </span>
                            <div>
                              <p className="text-xs font-black text-slate-900">Pronto para Levantamento / Em Distribuição</p>
                              <p className="text-[11px] text-slate-400">Os produtos foram separados no armazém.</p>
                            </div>
                          </div>

                          {/* Step 4 */}
                          <div className="relative">
                            <span className={cn(
                              "absolute -left-8 top-0.5 w-6.5 h-6.5 rounded-full flex items-center justify-center text-[10px] font-bold border-2",
                              trackedOrder.status === 'delivered' ? "bg-emerald-500 border-emerald-500 text-white" : "bg-white border-slate-200 text-slate-300"
                            )}>
                              4
                            </span>
                            <div>
                              <p className="text-xs font-black text-slate-900">Finalizado / Entregue</p>
                              <p className="text-[11px] text-slate-400">Transação de venda completada com sucesso!</p>
                            </div>
                          </div>
                       </div>

                       {/* Summary detail preview */}
                       <div className="border-t pt-6 mt-6 bg-slate-50 -mx-6 -mb-6 md:-mx-8 md:-mb-8 p-6 space-y-4">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Resumo dos Artigos</p>
                          <div className="space-y-2">
                             {trackedOrder.items?.map((it: any, i: number) => (
                               <div key={i} className="flex justify-between text-xs font-medium text-slate-600">
                                 <span>{it.name} x{it.quantity}</span>
                                 <span className="font-bold">{((it.price || 0) * (it.quantity || 1)).toLocaleString('pt-MZ')} MT</span>
                               </div>
                             ))}
                          </div>
                          
                          <div className="flex justify-between items-center border-t border-slate-200/60 pt-3">
                             <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold uppercase">
                               <MapPin size={12} /> Morada
                             </div>
                             <span className="text-xs font-bold text-slate-700 truncate max-w-[200px]">{trackedOrder.deliveryAddress || 'Central'}</span>
                          </div>

                          <div className="flex justify-between items-center pt-2">
                             <span className="text-xs font-black text-slate-800">Total</span>
                             <span className="text-base font-black text-blue-600">{(trackedOrder.total || 0).toLocaleString('pt-MZ')} MT</span>
                          </div>
                       </div>
                    </div>
                  </motion.div>
                ) : null}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      {/* Checkout Sidebar Modal */}
      <AnimatePresence>
        {isCheckoutOpen && (
          <div className="fixed inset-0 z-[100] flex justify-end">
            <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={() => setIsCheckoutOpen(false)}
               className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
               initial={{ x: '100%' }}
               animate={{ x: 0 }}
               exit={{ x: '100%' }}
               className="relative w-full max-w-xl bg-white h-full shadow-2xl flex flex-col p-6 md:p-10 overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-8">
                 <h2 className="text-2xl font-black text-slate-900 font-sans">Carrinho de Compras</h2>
                 <button onClick={() => setIsCheckoutOpen(false)} className="p-2 hover:bg-slate-100 rounded-xl"><X /></button>
              </div>

              {cart.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
                  <ShoppingCart size={48} className="text-slate-200" />
                  <p className="text-slate-400 font-bold text-sm">O seu carrinho está vazio atualmente.</p>
                </div>
              ) : (
                <div className="flex-1 flex flex-col justify-between space-y-6">
                  {/* Cart Items List */}
                  <div className="space-y-4 max-h-72 overflow-y-auto pr-2">
                     {cart.map(item => (
                       <div key={item.id} className="flex items-center gap-4 bg-slate-50/50 p-3 rounded-2xl border border-slate-100">
                          <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center overflow-hidden shrink-0">
                             {item.imageUrl ? (
                               <img src={item.imageUrl} className="w-full h-full object-cover" alt={item.name} referrerPolicy="no-referrer" />
                             ) : (
                               <Package size={20} className="text-slate-300" />
                             )}
                          </div>
                          <div className="flex-1 min-w-0">
                             <h4 className="font-black text-slate-800 text-sm truncate">{item.name}</h4>
                             <p className="text-xs font-bold text-slate-400">{Number(item.price || item.onlinePrice || 0).toLocaleString('pt-MZ')} MT x {item.quantity}</p>
                          </div>
                          <div className="flex items-center gap-1">
                             <button onClick={() => updateQuantity(item.id, -1)} className="p-1 hover:bg-slate-200 rounded-lg text-slate-500"><Minus size={14} /></button>
                             <span className="text-xs font-black text-slate-800 px-1">{item.quantity}</span>
                             <button onClick={() => updateQuantity(item.id, 1)} className="p-1 hover:bg-slate-200 rounded-lg text-slate-500"><Plus size={14} /></button>
                          </div>
                          <button onClick={() => removeFromCart(item.id)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl"><Trash2 size={16} /></button>
                       </div>
                     ))}
                  </div>

                  {/* Mode Selector - Quotation vs Direct Order */}
                  <div className="bg-blue-50/50 border border-blue-100/60 p-4 rounded-2xl space-y-3">
                     <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest block mb-1 text-center">Tipo de Pedido Pretendido</p>
                     
                     <div className="grid grid-cols-2 gap-2">
                        <button 
                          onClick={() => setCheckoutMode('quotation')}
                          className={cn(
                            "py-3 rounded-xl text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all border",
                            checkoutMode === 'quotation' 
                              ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/10" 
                              : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                          )}
                        >
                           <FileText size={16} />
                           <span>Cotação Online (PDF)</span>
                        </button>
                        <button 
                          onClick={() => setCheckoutMode('direct_order')}
                          className={cn(
                            "py-3 rounded-xl text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all border",
                            checkoutMode === 'direct_order' 
                              ? "bg-slate-900 border-slate-900 text-white shadow-md shadow-slate-900/10" 
                              : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                          )}
                        >
                           <CheckCircle size={16} />
                           <span>Encomenda Direta</span>
                        </button>
                     </div>
                  </div>

                  {/* Client form details */}
                  <div className="space-y-3 border-t pt-4">
                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Informações de Entrega & Facturação</p>
                     
                     <div className="space-y-2">
                        <input 
                          className="w-full bg-slate-50 border-none rounded-xl p-3.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-slate-900/5 transition-all"
                          placeholder="Nome Completo *"
                          value={orderData.name}
                          onChange={e => setOrderData({...orderData, name: e.target.value})}
                        />
                        <input 
                          type="tel"
                          className="w-full bg-slate-50 border-none rounded-xl p-3.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-slate-900/5 transition-all"
                          placeholder="Celular/WhatsApp *  (ex: +258 84...)"
                          value={orderData.phone}
                          onChange={e => setOrderData({...orderData, phone: e.target.value})}
                        />
                        <input 
                          type="email"
                          className="w-full bg-slate-50 border-none rounded-xl p-3.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-slate-900/5 transition-all"
                          placeholder="Endereço de E-mail (Opcional)"
                          value={orderData.email}
                          onChange={e => setOrderData({...orderData, email: e.target.value})}
                        />
                        <textarea 
                          rows={2}
                          className="w-full bg-slate-50 border-none rounded-xl p-3.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-slate-900/5 resize-none transition-all"
                          placeholder="Local de morada / Informações extra *"
                          value={orderData.address}
                          onChange={e => setOrderData({...orderData, address: e.target.value})}
                        />
                     </div>
                  </div>

                  {/* Pricing and Action */}
                  <div className="border-t pt-4 space-y-4">
                     <div className="flex justify-between items-center text-slate-600 text-sm">
                       <span>Total Bruto</span>
                       <span className="font-bold">{total.toLocaleString('pt-MZ')} MT</span>
                     </div>
                     <div className="flex justify-between items-center text-slate-900">
                       <span className="font-bold text-sm">TOTAL GERAL (IVA Incluso)</span>
                       <span className="font-black text-xl text-blue-600">{(total * 1.17).toLocaleString('pt-MZ')} MT</span>
                     </div>

                     <button 
                       onClick={handleFinalize}
                       disabled={isSubmitting}
                       className="w-full flex items-center justify-center gap-2 py-4 bg-slate-950 hover:bg-slate-900 text-white font-black rounded-2xl tracking-wide uppercase text-sm shadow-xl active:scale-95 transition-all"
                     >
                        {isSubmitting ? (
                          <RefreshCw className="animate-spin" size={18} />
                        ) : checkoutMode === 'quotation' ? (
                          <>
                            <FileText size={18} />
                            Gerar e Confirmar Cotação (PDF)
                          </>
                        ) : (
                          <>
                            <ArrowRight size={18} />
                            Finalizar Encomenda Direta
                          </>
                        )}
                     </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
