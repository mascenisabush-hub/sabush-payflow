import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { subscribeToCollection } from '../lib/firestoreCache';
import { collection, query, onSnapshot, addDoc, serverTimestamp, updateDoc, doc, increment } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Search, Truck, Box, CheckCircle2, Clock, X, ShoppingBag, Trash2, ArrowUpDown, ShieldAlert, DollarSign, Calendar, Bell, AlertTriangle, Landmark, Receipt, Sparkles, UserPlus, PackagePlus, Percent, ArrowRight, Check, Package } from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { offlineDb } from '../lib/offlineDb';

const getAvailableUnits = (p: any) => {
  if (!p) return [{ value: 'un', label: 'Un', multiplier: 1, name: 'Unidade' }];
  const units = [
    { value: 'un', label: p.baseUnitLabel || p.unit || 'Un', multiplier: 1, name: p.baseUnitName || 'Unidade' }
  ];

  // A box/pack unit only counts as "available" if the product was actually configured
  // with it in Inventory (hasBoxUnit / hasPackUnit). boxUnitQty/packUnitQty alone are NOT
  // reliable signals: several product-creation paths save placeholder values (10 / 100)
  // for these fields even when the unit itself is disabled, which previously caused
  // "Cx" and "Emb" to show up for products that only sell by "Un".
  // hasMultiUnits is kept only as a fallback for older records saved before the
  // hasBoxUnit/hasPackUnit flags existed.
  const boxEnabled = typeof p.hasBoxUnit === 'boolean' ? p.hasBoxUnit : !!p.hasMultiUnits;
  if (boxEnabled && Number(p.boxUnitQty) > 0) {
    const qty = Number(p.boxUnitQty) || 12;
    units.push({ value: 'cx', label: p.boxUnitLabel || 'Cx', multiplier: qty, name: p.boxUnitName || 'Caixa' });
  }

  const packEnabled = !!p.hasPackUnit;
  if (packEnabled && Number(p.packUnitQty) > 0) {
    const qty = Number(p.packUnitQty) || 100;
    units.push({ value: 'emb', label: p.packUnitLabel || 'Emb', multiplier: qty, name: p.packUnitName || 'Embalagem' });
  }

  return units;
};

// Common unit-of-measure suggestions offered when adding a brand new unit from the
// stock-entry modal — mirrors the suggestions used in Inventory's product form.
const NEW_UNIT_SUGGESTIONS = ['Saco', 'Fardo', 'Vol', 'Garrafa', 'Cx', 'Emb', 'Kg', 'Lt', 'Rolo', 'Palete'];

// Tells us which slot (box/Caixa or pack/Embalagem) is free on a product to receive a brand
// new custom unit of measure. Products only have two wholesale slots in the schema, so once
// both are taken the user needs to edit the product in Inventory to free one up.
const getFreeUnitSlot = (p: any): 'cx' | 'emb' | null => {
  if (!p) return 'cx';
  if (!p.hasBoxUnit) return 'cx';
  if (!p.hasPackUnit) return 'emb';
  return null;
};

export default function PurchaseOrders() {
  const { profile, businessData } = useAuth();
  const { t, i18n } = useTranslation();
  const currency = businessData?.currency || 'MZN';
  const isPt = i18n.language === 'pt';
  
  const [orders, setOrders] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Filtering and Searching State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'received'>('all');

  // Quick-Add Modals State
  const [showAddSupplierModal, setShowAddSupplierModal] = useState(false);
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [receivingOrder, setReceivingOrder] = useState<any | null>(null);
  const [receivingBatches, setReceivingBatches] = useState<Record<string, { batchNumber: string, expiryDate: string }>>({});

  // Inline "add a new unit of measure" flow for a cart row — lets the user type a custom
  // unit (e.g. 'Saco', 'Fardo', 'Vol') right here in the purchase, with suggestions, instead
  // of being limited to whatever Un/Cx/Emb slots the product already has configured. When
  // confirmed, it's saved back onto the product record (as its Caixa or Embalagem slot,
  // whichever is free) so it also becomes available next time in Inventory and here.
  const [addingUnitForIndex, setAddingUnitForIndex] = useState<number | null>(null);
  const [newUnitLabel, setNewUnitLabel] = useState('');
  const [newUnitQty, setNewUnitQty] = useState('');
  const [showNewUnitSuggestions, setShowNewUnitSuggestions] = useState(false);

  const [quickSupplier, setQuickSupplier] = useState({
    name: '',
    contactPerson: '',
    email: '',
    phone: '',
    category: '',
    address: '',
    notes: ''
  });

  const [quickProduct, setQuickProduct] = useState({
    name: '',
    sku: '',
    costPrice: '',
    price: '',
    baseUnitName: 'Unidade',
    baseUnitLabel: 'Un',
    hasMultiUnits: false,
    boxUnitName: 'Caixa',
    boxUnitLabel: 'Cx',
    boxUnitQty: '12',
    boxUnitCostPrice: '',
    boxUnitPrice: '',
    hasPackUnit: false,
    packUnitName: 'Embalagem',
    packUnitLabel: 'Emb',
    packUnitQty: '100',
    packUnitCostPrice: '',
    packUnitPrice: ''
  });

  // Purchase Form State
  const [purchaseType, setPurchaseType] = useState<'direct' | 'pending'>('direct');
  const [paymentType, setPaymentType] = useState<'cash' | 'credit'>('cash');
  const [dueDate, setDueDate] = useState<string>(
    new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 14 days default from today
  );
  const [reminder1DayBefore, setReminder1DayBefore] = useState(true);
  const [reminder2DaysBefore, setReminder2DaysBefore] = useState(true);
  const [initialPaidAmount, setInitialPaidAmount] = useState<string>('0');

  // Supplier Register Payment State (Track paid amounts, balance ledger, custom payments)
  const [payingOrder, setPayingOrder] = useState<any | null>(null);
  const [payAmount, setPayAmount] = useState<string>('');
  const [payMethod, setPayMethod] = useState<string>('cash');
  const [payDate, setPayDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [payNotes, setPayNotes] = useState<string>('');

  const [newOrder, setNewOrder] = useState<{
    supplierId: string;
    items: any[];
  }>({
    supplierId: '',
    items: []
  });

  // Searching & Selection assistance states
  const [supplierSearch, setSupplierSearch] = useState('');
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [prodSearchTerms, setProdSearchTerms] = useState<Record<number, string>>({});
  const [activeProdDropdown, setActiveProdDropdown] = useState<number | null>(null);
  const [supplierPayments, setSupplierPayments] = useState<any[]>([]);

  // New product search and addition modal states
  const [showProductSearchModal, setShowProductSearchModal] = useState(false);
  const [searchModalQuery, setSearchModalQuery] = useState('');
  const filteredModalProducts = React.useMemo(() => {
    const q = searchModalQuery.toLowerCase().trim();
    if (!q) return products.slice(0, 10);
    return products.filter(p => 
      p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q)
    ).slice(0, 10);
  }, [products, searchModalQuery]);
  const [searchModalNewName, setSearchModalNewName] = useState('');
  const [searchModalNewCost, setSearchModalNewCost] = useState('');
  const [deletingIndex, setDeletingIndex] = useState<number | null>(null);
  const [searchModalSelectedUnits, setSearchModalSelectedUnits] = useState<Record<string, string>>({});

  const addProductToOrder = (p: any, chosenUnit?: string) => {
    const defaultUnit = chosenUnit || p.unit || 'un';
    const units = getAvailableUnits(p);
    const unitObj = units.find(u => u.value === defaultUnit) || units[0];

    // Determine the cost based on chosen unit
    let cost = p.costPrice || 0;
    if (unitObj.value === 'cx' && p.boxUnitCostPrice) {
      cost = p.boxUnitCostPrice;
    } else if (unitObj.value === 'emb' && p.packUnitCostPrice) {
      cost = p.packUnitCostPrice;
    } else {
      cost = (p.costPrice || 0) * unitObj.multiplier;
    }

    const newItem = {
      productId: p.id,
      selectedUnit: unitObj.value,
      unitLabel: unitObj.label,
      quantity: 1,
      cost: cost,
      salePrice: p.price || 0,
      multiplier: unitObj.multiplier,
      markup: 0,
      updateCostInProduct: false
    };
    const c = Number(cost) || 0;
    const s = Number(p.price) || 0;
    newItem.markup = c > 0 ? parseFloat((((s - c) / c) * 100).toFixed(1)) : 0;

    setNewOrder(prev => {
      const exists = prev.items.some(item => item.productId === p.id);
      if (exists) {
        toast.error(isPt ? "Este produto já está na lista!" : "This product is already in the list!");
        return prev;
      }
      return { ...prev, items: [...prev.items, newItem] };
    });
  };

  const handleCreateAndAddProduct = async (name: string, costPrice: number) => {
    if (!name.trim()) {
      toast.error(isPt ? "Nome do produto é obrigatório." : "Product name is required.");
      return;
    }
    try {
      const payload: any = {
        name: name.trim(),
        sku: '',
        unit: 'un',
        baseUnitName: 'Unidade',
        baseUnitLabel: 'un',
        costPrice: costPrice,
        price: costPrice * 1.25,
        stockLevel: 0,
        hasMultiUnits: false,
        hasBoxUnit: false,
        hasPackUnit: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      const colRef = collection(db, `businesses/${profile.businessId}/products`);
      const res = await addDoc(colRef, payload);
      
      const addedProduct = {
        id: res.id,
        ...payload
      };
      addProductToOrder(addedProduct);
      toast.success(isPt ? "Produto criado e adicionado!" : "Product created and added!");
    } catch (err) {
      console.error(err);
      toast.error(isPt ? "Erro ao criar produto." : "Error creating product.");
    }
  };

  const handleConfirmNewUnit = async (index: number) => {
    const label = newUnitLabel.trim();
    const qty = Number(newUnitQty);
    if (!label) {
      toast.error(isPt ? "Introduza um nome para a nova unidade." : "Enter a name for the new unit.");
      return;
    }
    if (!qty || qty <= 0) {
      toast.error(isPt ? "Introduza quantas Unidades (Un) equivalem a 1 " + label + "." : "Enter how many base Units equal 1 " + label + ".");
      return;
    }

    const list = [...newOrder.items];
    const item = list[index];
    const selectedProd = products.find(p => p.id === item.productId);
    const slot = getFreeUnitSlot(selectedProd);

    if (!slot) {
      toast.error(isPt
        ? `Este produto já tem Caixa e Embalagem configuradas. Edite o produto no Inventário para libertar um espaço antes de adicionar "${label}".`
        : `This product already has both wholesale slots (Box/Pack) configured. Edit it in Inventory to free one up before adding "${label}".`);
      return;
    }

    try {
      if (profile?.businessId && selectedProd?.id) {
        const prodRef = doc(db, `businesses/${profile.businessId}/products`, selectedProd.id);
        const updateFields: any = slot === 'cx'
          ? { hasBoxUnit: true, boxUnitLabel: label, boxUnitName: label, boxUnitQty: qty }
          : { hasPackUnit: true, packUnitLabel: label, packUnitName: label, packUnitQty: qty };
        await updateDoc(prodRef, { ...updateFields, updatedAt: serverTimestamp() });

        // Reflect the change locally so the dropdown immediately offers the new unit
        setProducts(prev => prev.map(p => p.id === selectedProd.id ? { ...p, ...updateFields } : p));
      }

      list[index].selectedUnit = slot;
      list[index].unitLabel = label;
      list[index].multiplier = qty;
      list[index].cost = (selectedProd?.costPrice || 0) * qty;
      setNewOrder({ ...newOrder, items: list });

      toast.success(isPt ? `Unidade "${label}" adicionada e guardada no produto!` : `Unit "${label}" added and saved to the product!`);
      setAddingUnitForIndex(null);
      setNewUnitLabel('');
      setNewUnitQty('');
    } catch (err) {
      console.error(err);
      toast.error(isPt ? "Erro ao guardar a nova unidade." : "Error saving the new unit.");
    }
  };

  const handleDiscard = () => {
    const hasSupplier = !!newOrder.supplierId || !!supplierSearch.trim();
    const hasItemsProgress = newOrder.items.length > 0;
    
    if (hasSupplier || hasItemsProgress) {
      const confirmText = isPt 
        ? "Tem a certeza que deseja descartar esta ordem de compra? Todo o progresso será perdido." 
        : "Are you sure you want to discard this purchase order? All progress will be lost.";
      if (!window.confirm(confirmText)) {
        return;
      }
    }
    
    setNewOrder({
      supplierId: '',
      items: []
    });
    setSupplierSearch('');
    setIsCreating(false);
    setDeletingIndex(null);
  };

  useEffect(() => {
    if (!profile?.businessId) return;

    // Load from local caches first for instant visual rendering
    const cachedOrders = localStorage.getItem(`sabush_cached_purchase_orders_${profile.businessId}`);
    if (cachedOrders) {
      try {
        setOrders(JSON.parse(cachedOrders));
        setLoading(false);
      } catch (e) {
        console.warn("Could not load POs from cache:", e);
      }
    }

    const cachedSuppliers = localStorage.getItem(`sabush_cached_suppliers_${profile.businessId}`);
    if (cachedSuppliers) {
      try {
        setSuppliers(JSON.parse(cachedSuppliers));
      } catch (e) {
        console.warn("Could not load suppliers from cache:", e);
      }
    }

    offlineDb.getProducts().then((cachedProducts) => {
      if (cachedProducts && cachedProducts.length > 0) {
        setProducts(cachedProducts);
      }
    }).catch(err => {
      console.warn("Could not load products from offline cache:", err);
    });

    // Listen to Purchase Orders in real-time
    const q = query(collection(db, `businesses/${profile.businessId}/purchase_orders`));
    const unsubscribe = subscribeToCollection(
      `businesses/${profile.businessId}/purchase_orders`,
      (items) => {
        const loadedOrders = [...items];
        // Sort in-place by date (newest first)
        loadedOrders.sort((a: any, b: any) => {
          const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
          const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
          return dateB.getTime() - dateA.getTime();
        });
        setOrders(loadedOrders);
        setLoading(false);
        try {
          localStorage.setItem(`sabush_cached_purchase_orders_${profile.businessId}`, JSON.stringify(loadedOrders));
        } catch (e) {
          console.warn(e);
        }
      },
      q,
      (error) => {
        setLoading(false);
        try {
          handleFirestoreError(error, OperationType.LIST, 'purchase_orders');
        } catch (e) {
          console.warn("Gracefully logged purchase orders query error:", e);
        }
      }
    );

    // Listen to Suppliers in real-time
    const qSuppliers = query(collection(db, `businesses/${profile.businessId}/suppliers`));
    const unsubSuppliers = subscribeToCollection(
      `businesses/${profile.businessId}/suppliers`,
      (items) => {
        setSuppliers(items);
        try {
          localStorage.setItem(`sabush_cached_suppliers_${profile.businessId}`, JSON.stringify(items));
        } catch (e) {
          console.warn(e);
        }
      },
      qSuppliers
    );

    // Listen to Products (Inventory) in real-time to always ensure fully coherent views
    const qProducts = query(collection(db, `businesses/${profile.businessId}/products`));
    const unsubProducts = subscribeToCollection(
      `businesses/${profile.businessId}/products`,
      (items) => {
        setProducts(items);
        offlineDb.saveProducts(items).catch(err => console.warn(err));
      },
      qProducts
    );

    // Listen to Supplier Payments history in real-time
    const qPayments = query(collection(db, `businesses/${profile.businessId}/supplier_payments`));
    const unsubPayments = subscribeToCollection(
      `businesses/${profile.businessId}/supplier_payments`,
      (items) => {
        const loadedPayments = [...items];
        loadedPayments.sort((a: any, b: any) => {
          const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.date || 0);
          const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.date || 0);
          return dateB.getTime() - dateA.getTime();
        });
        setSupplierPayments(loadedPayments);
      },
      qPayments
    );

    return () => {
      unsubscribe();
      unsubSuppliers();
      unsubProducts();
      unsubPayments();
    };
  }, [profile?.businessId]);

  const getDaysLeft = (dueDateStr: string | null | undefined) => {
    if (!dueDateStr) return null;
    const today = new Date();
    today.setHours(0,0,0,0);
    const due = new Date(dueDateStr);
    due.setHours(0,0,0,0);
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const handleRecordSupplierPayment = async () => {
    if (!profile?.businessId || !payingOrder) return;
    
    const amountToPay = Number(payAmount);
    if (isNaN(amountToPay) || amountToPay <= 0) {
      toast.error(isPt ? "Por favor, introduza um valor de pagamento válido." : "Please enter a valid payment amount.");
      return;
    }

    const currentOutstanding = payingOrder.outstandingBalance || 0;
    if (amountToPay > currentOutstanding) {
      toast.error(isPt 
        ? `Desculpe, o valor inserido excede o saldo devedor pendente (${currentOutstanding.toLocaleString()} ${currency}).`
        : `Sorry, payment amount exceeds current outstanding balance (${currentOutstanding.toLocaleString()} ${currency}).`
      );
      return;
    }

    try {
      const newPaidAmount = (payingOrder.paidAmount || 0) + amountToPay;
      const newOutstanding = Math.max(0, (payingOrder.totalCost || 0) - newPaidAmount);
      
      let nextPaymentStatus = 'unpaid';
      if (newOutstanding <= 0) {
        nextPaymentStatus = 'paid';
      } else if (newPaidAmount > 0) {
        nextPaymentStatus = 'partially_paid';
      }

      // Update the purchase order document
      const orderRef = doc(db, `businesses/${profile.businessId}/purchase_orders`, payingOrder.id);
      await updateDoc(orderRef, {
        paidAmount: newPaidAmount,
        outstandingBalance: newOutstanding,
        paymentStatus: nextPaymentStatus,
        updatedAt: serverTimestamp()
      });

      // Register payment in supplier_payments list
      const suppObj = suppliers.find(s => s.id === payingOrder.supplierId);
      await addDoc(collection(db, `businesses/${profile.businessId}/supplier_payments`), {
        supplierId: payingOrder.supplierId,
        supplierName: suppObj?.name || 'Fornecedor',
        purchaseOrderId: payingOrder.id,
        purchaseOrderNumber: payingOrder.orderNumber,
        amountPaid: amountToPay,
        paymentMethod: payMethod,
        date: payDate,
        notes: payNotes.trim() || (isPt ? 'Pagamento de amortização a fornecedor' : 'Supplier repayment payment'),
        createdAt: serverTimestamp()
      });

      toast.success(isPt ? "Pagamento registado com sucesso!" : "Payment recorded successfully!");
      setPayingOrder(null);
    } catch (e) {
      console.error("Error saving payment update:", e);
      toast.error(isPt ? "Erro ao gravar pagamento." : "Failed to record payment.");
    }
  };

  const handleQuickAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickSupplier.name.trim()) {
      toast.error(isPt ? "O nome do fornecedor é obrigatório." : "Supplier name is required.");
      return;
    }
    
    try {
      const colRef = collection(db, `businesses/${profile.businessId}/suppliers`);
      const res = await addDoc(colRef, {
        name: quickSupplier.name.trim(),
        contactPerson: quickSupplier.contactPerson.trim(),
        email: quickSupplier.email.trim(),
        phone: quickSupplier.phone.trim(),
        category: quickSupplier.category.trim(),
        address: quickSupplier.address.trim(),
        notes: quickSupplier.notes.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      
      setNewOrder(prev => ({ ...prev, supplierId: res.id }));
      setShowAddSupplierModal(false);
      toast.success(isPt ? "Fornecedor criado com sucesso!" : "Supplier created successfully!");
    } catch (err) {
      console.error(err);
      toast.error(isPt ? "Erro ao criar fornecedor." : "Error creating supplier.");
    }
  };

  const handleQuickAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickProduct.name.trim()) {
      toast.error(isPt ? "Nome do produto é obrigatório." : "Product name is required.");
      return;
    }
    
    try {
      const payload: any = {
        name: quickProduct.name.trim(),
        sku: quickProduct.sku.trim(),
        unit: quickProduct.baseUnitLabel.trim() || 'un',
        baseUnitName: quickProduct.baseUnitName.trim() || 'Unidade',
        baseUnitLabel: quickProduct.baseUnitLabel.trim() || 'un',
        costPrice: Number(quickProduct.costPrice) || 0,
        price: Number(quickProduct.price) || 0,
        stockLevel: 0,
        hasMultiUnits: quickProduct.hasMultiUnits,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      payload.hasBoxUnit = quickProduct.hasMultiUnits;
      payload.hasPackUnit = quickProduct.hasMultiUnits && quickProduct.hasPackUnit;

      if (quickProduct.hasMultiUnits) {
        payload.boxUnitName = quickProduct.boxUnitName.trim() || 'Caixa';
        payload.boxUnitLabel = quickProduct.boxUnitLabel.trim() || 'Cx';
        payload.boxUnitQty = Number(quickProduct.boxUnitQty) || 12;
        payload.boxUnitCostPrice = Number(quickProduct.boxUnitCostPrice) || 0;
        payload.boxUnitPrice = Number(quickProduct.boxUnitPrice) || 0;

        if (quickProduct.hasPackUnit) {
          payload.packUnitName = quickProduct.packUnitName.trim() || 'Embalagem';
          payload.packUnitLabel = quickProduct.packUnitLabel.trim() || 'Emb';
          payload.packUnitQty = Number(quickProduct.packUnitQty) || 100;
          payload.packUnitCostPrice = Number(quickProduct.packUnitCostPrice) || 0;
          payload.packUnitPrice = Number(quickProduct.packUnitPrice) || 0;
        }
      }
      
      const colRef = collection(db, `businesses/${profile.businessId}/products`);
      const res = await addDoc(colRef, payload);
      
      const list = [...newOrder.items];
      if (list.length > 0) {
        const lastIndex = list.length - 1;
        list[lastIndex].productId = res.id;
        list[lastIndex].selectedUnit = 'un';
        list[lastIndex].unitLabel = payload.baseUnitLabel;
        list[lastIndex].cost = payload.costPrice;
        list[lastIndex].salePrice = payload.price;
        list[lastIndex].multiplier = 1;
        const c = Number(payload.costPrice) || 0;
        const s = Number(payload.price) || 0;
        list[lastIndex].markup = c > 0 ? parseFloat((((s - c) / c) * 100).toFixed(1)) : 0;
      }
      setNewOrder(prev => ({ ...prev, items: list }));
      
      setShowAddProductModal(false);
      toast.success(isPt ? "Produto criado com sucesso e adicionado!" : "Product created successfully and added to row!");
    } catch (err) {
      console.error(err);
      toast.error(isPt ? "Erro ao criar produto." : "Error creating product.");
    }
  };

  const handleCreateOrder = async () => {
    if (!newOrder.supplierId) {
      toast.error(isPt ? "Por favor escolha um fornecedor." : "Please select a supplier.");
      return;
    }
    if (newOrder.items.length === 0 || newOrder.items.some(i => !i.productId || i.quantity <= 0)) {
      toast.error(isPt ? "Por favor selecione produtos válidos com quantidades maiores que zero." : "Please select valid products with quantities greater than zero.");
      return;
    }

    try {
      const totalCost = newOrder.items.reduce((sum, i) => sum + (i.cost * i.quantity), 0);
      const isDirect = purchaseType === 'direct';
      
      const isCredit = paymentType === 'credit';
      const actualPaid = isCredit ? Number(initialPaidAmount || 0) : totalCost;
      const actualOutstanding = Math.max(0, totalCost - actualPaid);
      
      let paymentStatus = 'paid';
      if (isCredit) {
        if (actualPaid >= totalCost) {
          paymentStatus = 'paid';
        } else if (actualPaid > 0) {
          paymentStatus = 'partially_paid';
        } else {
          paymentStatus = 'unpaid';
        }
      }

      const orderPayload = {
        supplierId: newOrder.supplierId,
        items: newOrder.items,
        status: isDirect ? 'received' : 'pending',
        purchaseType,
        paymentType,
        dueDate: isCredit ? dueDate : null,
        reminder1DayBefore: isCredit ? reminder1DayBefore : false,
        reminder2DaysBefore: isCredit ? reminder2DaysBefore : false,
        totalCost,
        paidAmount: actualPaid,
        outstandingBalance: actualOutstanding,
        paymentStatus,
        orderNumber: `PO-${Date.now().toString().slice(-6)}`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        receivedAt: isDirect ? serverTimestamp() : null
      };

      // If it's a Direct Purchase, automatically increment stock levels in Firestore collection
      if (isDirect) {
        const { getDoc } = await import('firebase/firestore');
        for (const item of newOrder.items) {
          const productRef = doc(db, `businesses/${profile.businessId}/products`, item.productId);
          const prodSnap = await getDoc(productRef);
          if (!prodSnap.exists()) continue;
          const productData = prodSnap.data() || {};
          
          let fieldToIncrement = 'stockUn';
          const multiplier = Number(item.multiplier) || Number(productData.conversaoUnidades) || 1;
          
          if (item.selectedUnit === 'cx') {
            fieldToIncrement = 'stockCx';
          } else if (item.selectedUnit === 'emb') {
            fieldToIncrement = 'stockEmb';
          } else {
            fieldToIncrement = 'stockUn';
          }
          
          const priceUpdates: any = {
            [fieldToIncrement]: increment(item.quantity),
            stockLevel: increment(item.quantity * multiplier),
            updatedAt: serverTimestamp()
          };
          
          if (item.updateCostInProduct && item.cost > 0) {
            priceUpdates.precoCustoUnidadeCompra = item.cost;
            priceUpdates.costPrice = Number((item.cost / multiplier).toFixed(2));
            if (fieldToIncrement === 'stockCx') {
              priceUpdates.boxUnitCostPrice = item.cost;
            } else if (fieldToIncrement === 'stockEmb') {
              priceUpdates.packUnitCostPrice = item.cost;
            }
          }
          
          await updateDoc(productRef, priceUpdates);

          // Record stock movement for direct purchase!
          try {
            const { addDoc, collection } = await import('firebase/firestore');
            await addDoc(collection(db, `businesses/${profile.businessId}/stock_movements`), {
              productId: item.productId,
              productName: productData.name || 'Produto',
              qtyChange: item.quantity * multiplier,
              type: 'purchase',
              reference: `Compra Direta`,
              reportedBy: profile.email || 'Utilizador',
              timestamp: serverTimestamp()
            });
          } catch (movErr) {
            console.error("Error logging direct purchase stock movement:", movErr);
          }
        }
      }

      const orderDocRef = await addDoc(collection(db, `businesses/${profile.businessId}/purchase_orders`), orderPayload);
      
      // If there's an actual payment, record it in supplier_payments
      if (actualPaid > 0) {
        const suppObj = suppliers.find(s => s.id === newOrder.supplierId);
        await addDoc(collection(db, `businesses/${profile.businessId}/supplier_payments`), {
          supplierId: newOrder.supplierId,
          supplierName: suppObj?.name || 'Fornecedor',
          purchaseOrderId: orderDocRef.id,
          purchaseOrderNumber: orderPayload.orderNumber,
          amountPaid: actualPaid,
          paymentMethod: isCredit ? 'M-Pesa/Bank' : 'Dinheiro',
          date: new Date().toISOString().split('T')[0],
          notes: isCredit 
            ? (isPt ? `Pagamento inicial para compra a prazo nº ${orderPayload.orderNumber}` : `Initial downpayment for credit purchase no. ${orderPayload.orderNumber}`)
            : (isPt ? `Pagamento integral de compra a pronto nº ${orderPayload.orderNumber}` : `Full payment for cash purchase no. ${orderPayload.orderNumber}`),
          createdAt: serverTimestamp()
        });
      }

      toast.success(isDirect 
        ? (isPt ? "Compra registada e stock de inventário atualizado automaticamente!" : "Purchase registered and inventory stock incremented automatically!")
        : (isPt ? "Ordem de Compra emitida em estado pendente." : "Purchase Order registered with pending status.")
      );
      
      setIsCreating(false);
      setDeletingIndex(null);
      // Reset form structure
      setNewOrder({
        supplierId: '',
        items: []
      });
      setPurchaseType('direct');
      setPaymentType('cash');
      setInitialPaidAmount('0');
      setDueDate(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
      setReminder1DayBefore(true);
      setReminder2DaysBefore(true);
    } catch (e) {
      console.error(e);
      toast.error(isPt ? "Falha ao registar compra." : "Failed to record purchase.");
    }
  };

  const receiveStock = async (order: any, customBatches?: Record<string, { batchNumber: string, expiryDate: string }>) => {
    try {
      const { getDoc } = await import('firebase/firestore');
      for (const item of order.items) {
        const productRef = doc(db, `businesses/${profile.businessId}/products`, item.productId);
        const prodSnap = await getDoc(productRef);
        if (!prodSnap.exists()) continue;
        const productData = prodSnap.data() || {};
        
        let fieldToIncrement = 'stockUn';
        const multiplier = Number(item.multiplier) || Number(productData.conversaoUnidades) || 1;
        
        if (item.selectedUnit === 'cx') {
          fieldToIncrement = 'stockCx';
        } else if (item.selectedUnit === 'emb') {
          fieldToIncrement = 'stockEmb';
        } else {
          fieldToIncrement = 'stockUn';
        }
        
        const totalBaseUnits = (Number(item.quantity) || 1) * multiplier;
        
        const priceUpdates: any = {
          [fieldToIncrement]: increment(item.quantity),
          stockLevel: increment(totalBaseUnits),
          updatedAt: serverTimestamp()
        };
        
        if (item.updateCostInProduct && item.cost > 0) {
          priceUpdates.precoCustoUnidadeCompra = item.cost;
          priceUpdates.costPrice = Number((item.cost / multiplier).toFixed(2));
          if (fieldToIncrement === 'stockCx') {
            priceUpdates.boxUnitCostPrice = item.cost;
          } else if (fieldToIncrement === 'stockEmb') {
            priceUpdates.packUnitCostPrice = item.cost;
          }
        }

        // Feature 3: Register batch & expiry date if provided!
        const batchInfo = customBatches?.[item.productId];
        if (batchInfo && batchInfo.batchNumber && batchInfo.expiryDate) {
          const currentBatches = productData.batches || [];
          
          const existingIdx = currentBatches.findIndex(
            (b: any) => b.batchNumber === batchInfo.batchNumber && b.expiryDate === batchInfo.expiryDate
          );
          
          let updatedBatches = [...currentBatches];
          if (existingIdx > -1) {
            updatedBatches[existingIdx] = {
              ...updatedBatches[existingIdx],
              qty: (Number(updatedBatches[existingIdx].qty) || 0) + totalBaseUnits
            };
          } else {
            updatedBatches.push({
              batchNumber: batchInfo.batchNumber,
              expiryDate: batchInfo.expiryDate,
              qty: totalBaseUnits
            });
          }
          priceUpdates.batches = updatedBatches;
        }
        
        await updateDoc(productRef, priceUpdates);

        // Record stock movement!
        try {
          const { addDoc, collection } = await import('firebase/firestore');
          await addDoc(collection(db, `businesses/${profile.businessId}/stock_movements`), {
            productId: item.productId,
            productName: item.name || 'Produto',
            qtyChange: totalBaseUnits,
            type: 'purchase',
            reference: order.orderNumber || 'Ordem de Compra',
            reportedBy: profile.email || 'Utilizador',
            timestamp: serverTimestamp()
          });
        } catch (movErr) {
          console.error("Error logging PO receipt stock movement:", movErr);
        }
      }
      await updateDoc(doc(db, `businesses/${profile.businessId}/purchase_orders`, order.id), {
        status: 'received',
        receivedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      toast.success(isPt ? "Stock recebido e inventário atualizado!" : "Stock received and inventory updated!");
    } catch (e) {
      console.error(e);
      toast.error(isPt ? "Falha ao atualizar o stock." : "Failed to update stock");
    }
  };

  // Filter orders dynamically based on search terms and filter buttons
  const filteredOrders = orders.filter(order => {
    const orderNum = order.orderNumber?.toLowerCase() || '';
    const supplier = suppliers.find(s => s.id === order.supplierId);
    const supplierName = supplier?.name?.toLowerCase() || '';
    
    const matchesSearch = orderNum.includes(searchTerm.toLowerCase()) || supplierName.includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header section with Stats & Main Trigger Button */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900">{isPt ? "Entrada de Stock & Compras" : "Stock Purchases & Orders"}</h2>
          <p className="text-slate-500">
            {isPt 
              ? "Registe compras de produtos para aumentar os seus níveis de stock e gerir o seu inventário de forma instantânea." 
              : "Record product purchases to automatically increase your stock levels and manage your inventory instantly."}
          </p>
        </div>
        <button 
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-2xl font-black shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all active:scale-95 text-xs uppercase tracking-wider"
        >
          <Plus size={18} />
          {isPt ? "Registar Nova Compra (Entrada)" : "Add Purchase / PO"}
        </button>
      </div>

      {/* Real-time stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isPt ? "Total de Compras" : "Total Purchases"}</span>
            <h4 className="text-2xl font-black text-slate-900">{orders.length}</h4>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl"><Box size={20} /></div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isPt ? "Pendentes" : "Pending Order List"}</span>
            <h4 className="text-2xl font-black text-amber-600">{orders.filter(o => o.status === 'pending').length}</h4>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl"><Clock size={20} /></div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isPt ? "Investimento de Stock" : "Inventory Repurchase"}</span>
            <h4 className="text-2xl font-black text-emerald-600 font-mono">
              {orders.reduce((sum, o) => sum + (o.totalCost || 0), 0).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} {currency}
            </h4>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl"><Truck size={20} /></div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isPt ? "Contas a Pagar (Dívida)" : "Accounts Payable (Debt)"}</span>
            <h4 className="text-2xl font-black text-rose-600 font-mono">
              {orders.reduce((sum, o) => sum + (o.outstandingBalance || 0), 0).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} {currency}
            </h4>
          </div>
          <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl"><DollarSign size={20} /></div>
        </div>
      </div>

      {/* Filters & Interactive Search Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 p-3 rounded-2xl border border-slate-150">
        <div className="flex items-center gap-2 flex-wrap">
          <button 
            onClick={() => setStatusFilter('all')}
            className={cn(
              "px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
              statusFilter === 'all' ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-100"
            )}
          >
            {isPt ? "Todas" : "All"}
          </button>
          <button 
            onClick={() => setStatusFilter('pending')}
            className={cn(
              "px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
              statusFilter === 'pending' ? "bg-amber-600 text-white" : "bg-white text-slate-600 hover:bg-slate-100"
            )}
          >
            {isPt ? "Pendentes" : "Pending"}
          </button>
          <button 
            onClick={() => setStatusFilter('received')}
            className={cn(
              "px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
              statusFilter === 'received' ? "bg-emerald-600 text-white" : "bg-white text-slate-600 hover:bg-slate-100"
            )}
          >
            {isPt ? "Recebidas" : "Received"}
          </button>
        </div>
        <div className="relative flex-1 md:max-w-md">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            placeholder={isPt ? "Pesquisar por nº ordem ou fornecedor..." : "Search by order no. or supplier..."}
            className="w-full pl-11 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs font-medium"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Add Purchase / PO overlay modal */}
      <AnimatePresence>
        {isCreating && (
          <div className="fixed inset-0 bg-white z-50 flex flex-col h-screen w-screen overflow-hidden">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full h-full flex flex-col bg-slate-50 overflow-hidden"
            >
              {/* Ultra compact Header - the only part that never scrolls */}
              <div className="p-3 bg-blue-900 text-white flex justify-between items-center border-b-2 border-[#B8791A]/50 shrink-0">
                <div>
                  <h3 className="text-sm font-black tracking-tight flex items-center gap-2">
                    <span>🛒</span> {isPt ? "Entrada de Stock & Compra" : "Stock Purchase & Purchase Order"}
                  </h3>
                </div>
                <button 
                  type="button"
                  onClick={handleDiscard} 
                  className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-all cursor-pointer border-none"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Single scrollable body: settings bar + products list scroll together so nothing gets cut off on short screens */}
              <div className="flex-1 min-h-0 overflow-y-auto">
                {/* Settings & Info Body */}
                <div className="bg-slate-900 text-white p-3 space-y-2.5">
                  {/* Compact Top Settings Bar - takes minimum vertical space */}
                  <div className="grid grid-cols-1 md:grid-cols-[1.6fr_1fr_1fr] gap-4 bg-slate-800/80 p-3 rounded-2xl border border-slate-700 text-xs shrink-0 shadow-sm text-slate-200">
                    {/* Fornecedor */}
                    <div className="flex flex-col gap-1 relative">
                      <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">{isPt ? "FORNECEDOR / PARCEIRO" : "SUPPLIER / PARTNER"}</span>
                      <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <input 
                          type="text"
                          placeholder={isPt ? "Procurar fornecedor..." : "Search supplier..."}
                          className="w-full pl-9 pr-7 bg-slate-900 border border-slate-700 rounded-xl focus:ring-1 focus:ring-blue-500 outline-none font-bold text-xs text-slate-100 h-[38px]"
                          value={newOrder.supplierId ? (suppliers.find(s => s.id === newOrder.supplierId)?.name || '') : supplierSearch}
                          onChange={e => {
                            if (newOrder.supplierId) {
                              setNewOrder({ ...newOrder, supplierId: '' });
                            }
                            setSupplierSearch(e.target.value);
                            setShowSupplierDropdown(true);
                          }}
                          onFocus={() => setShowSupplierDropdown(true)}
                        />
                        {newOrder.supplierId ? (
                          <button
                            type="button"
                            onClick={() => {
                              setNewOrder({ ...newOrder, supplierId: '' });
                              setSupplierSearch('');
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 bg-transparent border-none cursor-pointer"
                          >
                            <X size={12} />
                          </button>
                        ) : null}
                      </div>

                      {showSupplierDropdown && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setShowSupplierDropdown(false)} />
                          <div className="absolute top-[100%] left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-xl max-h-48 overflow-y-auto z-50 text-xs divide-y divide-slate-700 shrink-0">
                            {suppliers.filter(s => {
                              const query = supplierSearch.toLowerCase();
                              return s.name?.toLowerCase().includes(query) || s.phone?.includes(query) || s.contactPerson?.toLowerCase().includes(query);
                            }).map(s => (
                              <div
                                key={s.id}
                                className="p-2 hover:bg-slate-700 cursor-pointer font-bold text-slate-100 flex justify-between items-center"
                                onClick={() => {
                                  setNewOrder({ ...newOrder, supplierId: s.id });
                                  setSupplierSearch('');
                                  setShowSupplierDropdown(false);
                                }}
                              >
                                <span>{s.name}</span>
                                {s.phone && <span className="text-[10px] text-slate-400 font-mono font-normal">{s.phone}</span>}
                              </div>
                            ))}
                            {suppliers.filter(s => {
                              const query = supplierSearch.toLowerCase();
                              return s.name?.toLowerCase().includes(query) || s.phone?.includes(query);
                            }).length === 0 && (
                              <div className="p-3 text-center text-slate-400 font-bold bg-slate-800">
                                {isPt ? "Nenhum fornecedor encontrado" : "No suppliers found"}
                                <button
                                  type="button"
                                  onClick={() => setShowAddSupplierModal(true)}
                                  className="block mx-auto mt-1 text-[10px] text-blue-400 hover:underline cursor-pointer border-none bg-transparent font-bold"
                                >
                                  + {isPt ? "Criar Fornecedor" : "Create Supplier"}
                                </button>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                    
                    {/* Tipo de Atualização de Stock */}
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">{isPt ? "TIPO DE ATUALIZAÇÃO DE STOCK" : "STOCK UPDATE TYPE"}</span>
                      <div className="flex w-full rounded-xl border border-slate-700 overflow-hidden h-[38px] divide-x divide-slate-700 bg-slate-900">
                        <button
                          type="button"
                          onClick={() => setPurchaseType('direct')}
                          className={cn(
                            "flex-1 flex items-center justify-center text-[13px] font-semibold transition-all cursor-pointer h-full border-none select-none",
                            purchaseType === 'direct' 
                              ? "bg-blue-600 text-white" 
                              : "bg-slate-900 text-slate-400 hover:text-slate-200"
                          )}
                        >
                          {isPt ? "Direto (Stock)" : "Direct (Stock)"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPurchaseType('pending')}
                          className={cn(
                            "flex-1 flex items-center justify-center text-[13px] font-semibold transition-all cursor-pointer h-full border-none select-none",
                            purchaseType === 'pending' 
                              ? "bg-blue-600 text-white" 
                              : "bg-slate-900 text-slate-400 hover:text-slate-200"
                          )}
                        >
                          {isPt ? "Pendente (PO)" : "Pending (PO)"}
                        </button>
                      </div>
                    </div>

                    {/* Termos de Pagamento */}
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">{isPt ? "CONDIÇÃO DE PAGAMENTO" : "PAYMENT TERMS"}</span>
                      <div className="flex w-full rounded-xl border border-slate-700 overflow-hidden h-[38px] divide-x divide-slate-700 bg-slate-900">
                        <button
                          type="button"
                          onClick={() => setPaymentType('cash')}
                          className={cn(
                            "flex-1 flex items-center justify-center text-[13px] font-semibold transition-all cursor-pointer h-full border-none select-none",
                            paymentType === 'cash'
                              ? "bg-blue-600 text-white"
                              : "bg-slate-900 text-slate-400 hover:text-slate-200"
                          )}
                        >
                          {isPt ? "A Pronto" : "Cash / Paid"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaymentType('credit')}
                          className={cn(
                            "flex-1 flex items-center justify-center text-[13px] font-semibold transition-all cursor-pointer h-full border-none select-none",
                            paymentType === 'credit'
                              ? "bg-blue-600 text-white"
                              : "bg-slate-900 text-slate-400 hover:text-slate-200"
                          )}
                        >
                          {isPt ? "A Crédito" : "Credit / Account"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Conditional Credit Terms secondary compact bar */}
                  {paymentType === 'credit' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs shrink-0 animate-in slide-in-from-top-1 duration-150">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest shrink-0">{isPt ? "Vencimento:" : "Due Date:"}</span>
                        <div className="relative flex-1">
                          <Calendar size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="date"
                            className="w-full pl-7 pr-2 py-1 bg-slate-900 border border-slate-700 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-[11px] font-bold font-mono text-slate-100 h-8"
                            value={dueDate}
                            onChange={e => setDueDate(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest shrink-0">{isPt ? "Sinal (Sinal):" : "Downpayment:"}</span>
                        <div className="relative flex-1">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[9px] font-mono font-bold text-slate-400">{currency}</span>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            placeholder="0.00"
                            className="w-full pl-7 pr-2 py-1 bg-slate-900 border border-slate-700 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-[11px] font-bold font-mono text-slate-100 h-8"
                            value={initialPaidAmount}
                            onChange={e => setInitialPaidAmount(e.target.value || '')}
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-3 justify-between">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest shrink-0">
                          {isPt ? "Lembrar:" : "Remind:"}
                        </span>
                        <div className="flex gap-3 text-slate-300">
                          <label className="flex items-center gap-1.5 text-[10px] font-bold cursor-pointer select-none">
                            <input
                              type="checkbox"
                              className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 shadow-sm cursor-pointer"
                              checked={reminder1DayBefore}
                              onChange={e => setReminder1DayBefore(e.target.checked)}
                            />
                            <span>{isPt ? "1 dia antes" : "1d before"}</span>
                          </label>
                          <label className="flex items-center gap-1.5 text-[10px] font-bold cursor-pointer select-none">
                            <input
                              type="checkbox"
                              className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 shadow-sm cursor-pointer"
                              checked={reminder2DaysBefore}
                              onChange={e => setReminder2DaysBefore(e.target.checked)}
                            />
                            <span>{isPt ? "2 dias antes" : "2d before"}</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Products List & Pricing Header Row */}
                  <div className="flex justify-between items-center shrink-0 border-t border-slate-800 mt-4 pt-3 bg-slate-900 px-3 pb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                        {isPt ? "Produtos" : "Products"}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowProductSearchModal(true)}
                        className="h-9 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white flex items-center gap-2 transition-all cursor-pointer border-none shadow-md"
                        title={isPt ? "Procurar e Adicionar Produto" : "Search and Add Product"}
                      >
                        <Search size={15} className="shrink-0" />
                        <span className="text-xs font-bold tracking-wide">
                          {isPt ? "Adicionar Produto" : "Add Product"}
                        </span>
                      </button>
                    </div>
                    {/* Running count */}
                    <span className="text-[10px] bg-slate-800 text-slate-300 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                      {newOrder.items.length} {newOrder.items.length === 1 ? (isPt ? "linha" : "line") : (isPt ? "linhas" : "lines")}
                    </span>
                  </div>
                </div>

                {/* Products area - no longer its own scroll container, it scrolls together with the settings above */}
                <div className="min-h-full bg-slate-50 p-4 md:p-6 flex flex-col gap-4">
                {newOrder.items.length > 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-150 p-4 md:p-6 shadow-sm">
                    {/* Headers */}
                    <div className="grid grid-cols-[2.2fr_180px_130px_120px_40px] gap-4 pb-2 text-[11px] font-medium text-slate-400 uppercase tracking-wider select-none border-none">
                      <div>{isPt ? "Produto" : "Product"}</div>
                      <div className="text-center">{isPt ? "Qtd & Unidade" : "Qty & Unit"}</div>
                      <div>{isPt ? "Preço de Custo" : "Cost Price"}</div>
                      <div className="text-right">{isPt ? "Subtotal" : "Subtotal"}</div>
                      <div></div>
                    </div>

                    {/* Horizontal rows list */}
                    <div className="space-y-3 mt-2">
                      {newOrder.items.map((item, index) => {
                        const selectedProd = products.find(p => p.id === item.productId);
                        const subtotal = (item.cost || 0) * (item.quantity || 1);

                        return (
                          <div 
                            key={index} 
                            className="grid grid-cols-[2.2fr_180px_130px_120px_40px] gap-4 items-center bg-slate-50/50 hover:bg-slate-50 px-3 py-2 rounded-xl transition-all"
                          >
                            {/* Product Name with package icon and conversion note */}
                            <div className="flex items-center gap-2 min-w-0">
                              <Package size={15} className="text-slate-400 shrink-0" />
                              <div className="truncate">
                                <span className="font-semibold text-slate-800 text-xs truncate block" title={selectedProd?.name || 'Unknown Product'}>
                                  {selectedProd?.name || 'Unknown Product'}
                                </span>
                                {item.selectedUnit !== 'un' && item.multiplier > 1 && (
                                  <span className="text-[10px] font-semibold text-blue-650 block mt-0.5 font-sans">
                                    {item.quantity} {item.unitLabel} = {item.quantity * item.multiplier} {selectedProd?.baseUnitLabel || selectedProd?.unit || 'Un'}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Quantity & UOM (editable number input & select dropdown side by side) */}
                            <div className="flex items-center gap-1.5">
                              <input 
                                type="number"
                                min="1"
                                className="w-14 p-1 bg-white border border-slate-200 rounded-lg text-center font-bold text-xs font-mono text-slate-800 focus:ring-1 focus:ring-blue-500 outline-none h-8"
                                value={item.quantity}
                                onChange={e => {
                                  const list = [...newOrder.items];
                                  list[index].quantity = Number(e.target.value) || 0;
                                  setNewOrder({ ...newOrder, items: list });
                                }}
                              />
                              <div className="relative flex-1 min-w-[70px] max-w-[100px]">
                                <select
                                  className="w-full p-1 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-[10px] font-bold outline-none cursor-pointer h-8"
                                  value={item.selectedUnit || 'un'}
                                  onChange={e => {
                                    const unitVal = e.target.value;

                                    if (unitVal === '__add_new__') {
                                      setAddingUnitForIndex(index);
                                      setNewUnitLabel('');
                                      setNewUnitQty('');
                                      return;
                                    }

                                    const list = [...newOrder.items];
                                    const units = getAvailableUnits(selectedProd);
                                    const unitObj = units.find(u => u.value === unitVal) || units[0];

                                    list[index].selectedUnit = unitVal;
                                    list[index].unitLabel = unitObj.label;
                                    list[index].multiplier = unitObj.multiplier;

                                    // Update cost price based on selected unit
                                    let cost = selectedProd?.costPrice || 0;
                                    if (unitVal === 'cx' && selectedProd?.boxUnitCostPrice) {
                                      cost = selectedProd.boxUnitCostPrice;
                                    } else if (unitVal === 'emb' && selectedProd?.packUnitCostPrice) {
                                      cost = selectedProd.packUnitCostPrice;
                                    } else {
                                      cost = (selectedProd?.costPrice || 0) * unitObj.multiplier;
                                    }
                                    list[index].cost = cost;

                                    const origCost = Number(selectedProd?.precoCustoUnidadeCompra) || 0;
                                    list[index].updateCostInProduct = (cost !== origCost);

                                    setNewOrder({ ...newOrder, items: list });
                                  }}
                                >
                                  {getAvailableUnits(selectedProd).map(u => (
                                    <option key={u.value} value={u.value}>{u.label}</option>
                                  ))}
                                  {getFreeUnitSlot(selectedProd) && (
                                    <option value="__add_new__">➕ {isPt ? "Nova Unidade..." : "New Unit..."}</option>
                                  )}
                                </select>

                                {addingUnitForIndex === index && (
                                  <>
                                    <div className="fixed inset-0 z-40" onClick={() => setAddingUnitForIndex(null)} />
                                    <div className="absolute top-[100%] left-0 mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-3 w-56 space-y-2">
                                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                                        {isPt ? "Nova Unidade de Medida" : "New Unit of Measure"}
                                      </p>
                                      <div className="relative">
                                        <input
                                          type="text"
                                          autoFocus
                                          placeholder={isPt ? "Ex: Saco, Fardo, Vol..." : "e.g. Saco, Fardo, Vol..."}
                                          className="w-full p-1.5 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:ring-1 focus:ring-blue-500"
                                          value={newUnitLabel}
                                          onChange={e => setNewUnitLabel(e.target.value)}
                                          onFocus={() => setShowNewUnitSuggestions(true)}
                                          onBlur={() => setTimeout(() => setShowNewUnitSuggestions(false), 200)}
                                        />
                                        {showNewUnitSuggestions && (
                                          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-32 overflow-y-auto z-50 text-xs">
                                            {NEW_UNIT_SUGGESTIONS.filter(u => u.toLowerCase().includes(newUnitLabel.toLowerCase())).map(u => (
                                              <button
                                                key={u}
                                                type="button"
                                                onMouseDown={() => setNewUnitLabel(u)}
                                                className="w-full text-left px-2.5 py-1.5 hover:bg-slate-50 text-slate-700 font-semibold block"
                                              >
                                                {u}
                                              </button>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                      <div>
                                        <label className="text-[9px] font-bold text-slate-400 uppercase">
                                          {isPt ? `Quantas Un = 1 ${newUnitLabel || 'unidade'}?` : `How many base Units = 1 ${newUnitLabel || 'unit'}?`}
                                        </label>
                                        <input
                                          type="number"
                                          min="1"
                                          placeholder="Ex: 12"
                                          className="w-full p-1.5 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                                          value={newUnitQty}
                                          onChange={e => setNewUnitQty(e.target.value)}
                                        />
                                      </div>
                                      <div className="flex gap-1.5 pt-1">
                                        <button
                                          type="button"
                                          onClick={() => handleConfirmNewUnit(index)}
                                          className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-black text-[10px] uppercase py-1.5 rounded-lg cursor-pointer border-none"
                                        >
                                          {isPt ? "Guardar" : "Save"}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setAddingUnitForIndex(null)}
                                          className="px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold text-[10px] py-1.5 rounded-lg cursor-pointer border-none"
                                        >
                                          {isPt ? "Cancelar" : "Cancel"}
                                        </button>
                                      </div>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Cost Price (editable, currency-prefixed) */}
                            <div className="relative">
                              <div className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[9px] pointer-events-none">{currency}</div>

                              <input 
                                type="number"
                                min="0"
                                step="any"
                                className="w-full pl-7 pr-1.5 py-1 bg-white border border-slate-200 rounded-lg font-bold text-xs font-mono text-slate-800 focus:ring-1 focus:ring-blue-500 outline-none h-8"
                                value={item.cost}
                                onChange={e => {
                                  const list = [...newOrder.items];
                                  const costVal = Number(e.target.value) || 0;
                                  list[index].cost = costVal;
                                  
                                  const origCost = Number(selectedProd?.precoCustoUnidadeCompra) || 0;
                                  if (costVal !== origCost) {
                                    list[index].updateCostInProduct = true;
                                  } else {
                                    list[index].updateCostInProduct = false;
                                  }
                                  
                                  setNewOrder({ ...newOrder, items: list });
                                }}
                              />
                            </div>

                            {/* Subtotal */}
                            <div className="text-right font-mono font-bold text-slate-700 text-xs truncate">
                              {subtotal.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} {currency}
                            </div>

                            {/* Delete button */}
                            <div className="flex justify-end">
                              {deletingIndex === index ? (
                                <div className="flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-150">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const list = newOrder.items.filter((_, i) => i !== index);
                                      setNewOrder({ ...newOrder, items: list });
                                      setDeletingIndex(null);
                                    }}
                                    className="px-2 py-1 text-[10px] font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-all cursor-pointer border-none flex items-center justify-center gap-0.5"
                                    title={isPt ? "Confirmar" : "Confirm"}
                                  >
                                    <Check size={12} />
                                    <span>{isPt ? "Sim" : "Yes"}</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeletingIndex(null)}
                                    className="px-2 py-1 text-[10px] font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all cursor-pointer border-none flex items-center justify-center gap-0.5"
                                    title={isPt ? "Cancelar" : "Cancel"}
                                  >
                                    <X size={12} />
                                    <span>{isPt ? "Não" : "No"}</span>
                                  </button>
                                </div>
                              ) : (
                                <button 
                                  type="button"
                                  onClick={() => setDeletingIndex(index)}
                                  className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all cursor-pointer border-none bg-transparent flex items-center justify-center"
                                  title={isPt ? "Remover" : "Remove"}
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Single thin divider line above the subtotal */}
                    <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
                      <div className="text-right flex items-center gap-2">
                        <span className="text-xs font-medium text-slate-400">
                          {isPt ? "Subtotal:" : "Subtotal:"}
                        </span>
                        <span className="font-mono font-bold text-slate-800 text-sm">
                          {newOrder.items.reduce((sum, item) => sum + ((item.cost || 0) * (item.quantity || 1)), 0).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} {currency}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center py-16 text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200 shadow-sm">
                    <ShoppingBag size={36} className="text-slate-300 mb-3 animate-pulse" />
                    <p className="text-xs font-bold text-slate-500">{isPt ? "Nenhum produto adicionado à lista" : "No products added to the list"}</p>
                    <p className="text-[10px] text-slate-450 mt-1.5 max-w-xs text-center font-semibold">
                      {isPt ? "Clique em 'Adicionar Produto' acima para começar" : "Click 'Add Product' above to get started"}
                    </p>
                  </div>
                )}
                </div>
              </div>

              {/* Part 3: Total Investment & Actions Footer Bar */}
              <div className="py-4 bg-blue-900 text-white px-6 border-t-2 border-[#B8791A]/50 flex items-center justify-between gap-4 shrink-0 shadow-xl">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isPt ? "INVESTIMENTO TOTAL DE COMPRA:" : "TOTAL INVESTMENT:"}</span>
                  <span className="text-xl md:text-2xl font-black text-emerald-400 font-mono">
                    {newOrder.items.reduce((sum, item) => sum + ((item.cost || 0) * (item.quantity || 1)), 0).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} <span className="text-xs text-emerald-500 font-bold">{currency}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button 
                    type="button"
                    onClick={handleDiscard} 
                    className="px-4 py-2.5 font-bold text-slate-400 hover:bg-slate-800 hover:text-slate-100 rounded-xl transition-all text-xs cursor-pointer border-none bg-transparent"
                  >
                    {isPt ? "Cancelar / Descartar" : "Discard"}
                  </button>
                  <button 
                    type="button"
                    onClick={handleCreateOrder} 
                    className="px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-xl shadow-md hover:shadow-lg transition-all text-xs uppercase tracking-wider cursor-pointer border-none flex items-center gap-1.5"
                  >
                    <span>✓</span> {isPt ? "Confirmar Compra & Armazenar" : "CONFIRM PURCHASE ORDER & STORE"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Actual list of orders */}
      <div className="grid grid-cols-1 gap-6">
        {filteredOrders.map(order => {
          const supplier = suppliers.find(s => s.id === order.supplierId);
          const isCredit = order.paymentType === 'credit';
          const pStatus = order.paymentStatus || 'paid';
          const daysLeft = isCredit ? getDaysLeft(order.dueDate) : null;

          return (
            <div key={order.id} className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex flex-col gap-5 hover:border-slate-200 hover:shadow-md transition-all">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 text-xs shadow-inner uppercase font-mono font-bold shrink-0">
                    {order.purchaseType === 'direct' ? "🛒 buy" : "📋 ord"}
                  </div>
                  
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-black text-slate-900">{order.orderNumber}</h3>
                      
                      {/* Delivery Status Badge */}
                      <span className={cn(
                        "px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest",
                        order.status === 'received' ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                      )}>
                        {order.status === 'received' 
                          ? (isPt ? "Recebido" : "Received") 
                          : (isPt ? "Pendente" : "Pending")}
                      </span>

                      {/* Payment Term Badge */}
                      <span className={cn(
                        "px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center gap-1",
                        isCredit 
                          ? "bg-indigo-50 text-indigo-700 border border-indigo-100" 
                          : "bg-teal-50 text-teal-700 border border-teal-100"
                      )}>
                        {isCredit ? (isPt ? "💳 A Crédito" : "💳 Credit") : (isPt ? "💵 Pronto Pagamento" : "💵 Cash")}
                      </span>

                      {/* Payment Status Badge if Credit */}
                      {isCredit && (
                        <span className={cn(
                          "px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest",
                          pStatus === 'paid' ? "bg-emerald-500 text-white" :
                          pStatus === 'partially_paid' ? "bg-blue-600 text-white" : "bg-rose-500 text-white animate-pulse"
                        )}>
                          {pStatus === 'paid' ? (isPt ? "Pago Total" : "Fully Paid") :
                           pStatus === 'partially_paid' ? (isPt ? "Pago Parcial" : "Partial Payment") :
                           (isPt ? "Por Pagar" : "Unpaid")}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                      <div className="flex items-center gap-1"><Truck size={12} /> {supplier?.name || (isPt ? 'Fornecedor Desconhecido' : 'Unknown Supplier')}</div>
                      <div className="flex items-center gap-1"><Box size={12} /> {order.items?.length || 0} {order.items?.length === 1 ? (isPt ? 'produto' : 'product') : (isPt ? 'produtos' : 'products')}</div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-6 justify-between lg:justify-end">
                  {/* Cost Summary on Right */}
                  <div className="text-left lg:text-right font-mono min-w-[120px]">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{isPt ? "Custo Total" : "Total Cost"}</p>
                    <p className="text-xl font-black text-slate-950">{order.totalCost?.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} {currency}</p>
                  </div>

                  {/* If Credit, display Ledger Stats on Right */}
                  {isCredit && (
                    <div className="flex gap-4 border-l border-slate-100 pl-4 font-mono">
                      <div className="text-left col-span-1">
                        <span className="text-[8px] font-black text-emerald-600 uppercase block leading-none mb-1">{isPt ? "Pago" : "Paid"}</span>
                        <span className="text-xs font-extrabold text-slate-800">{(order.paidAmount || 0).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} {currency}</span>
                      </div>
                      <div className="text-left col-span-1">
                        <span className="text-[8px] font-black text-rose-550 uppercase block leading-none mb-1">{isPt ? "Saldo Devedor" : "Balance Due"}</span>
                        <span className="text-xs font-extrabold text-slate-900 border-b border-rose-100 pb-0.5">{(order.outstandingBalance || 0).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} {currency}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Automatic Reminder and alert bars */}
              {isCredit && pStatus !== 'paid' && order.dueDate && (
                <div className="bg-slate-50/70 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs border border-slate-100 select-none">
                  <div className="flex items-center gap-3">
                    {daysLeft !== null && daysLeft <= 0 ? (
                      <div className="p-1 px-2.5 bg-rose-100 text-rose-700 font-extrabold rounded-lg text-[9px] uppercase tracking-wide flex items-center gap-1 animate-pulse shrink-0">
                        <AlertTriangle size={12} /> {isPt ? "Atrasado" : "Overdue"}
                      </div>
                    ) : daysLeft !== null && daysLeft === 1 && order.reminder1DayBefore ? (
                      <div className="p-1 px-2.5 bg-amber-500 text-white font-black rounded-lg text-[9px] uppercase tracking-wide flex items-center gap-1 shrink-0">
                        <Bell size={12} /> {isPt ? "Aviso Crítico" : "1 Day Left"}
                      </div>
                    ) : daysLeft !== null && daysLeft === 2 && order.reminder2DaysBefore ? (
                      <div className="p-1 px-2.5 bg-indigo-500 text-white font-black rounded-lg text-[9px] uppercase tracking-wide flex items-center gap-1 shrink-0">
                        <Bell size={12} /> {isPt ? "Aviso Prévio" : "2 Days Left"}
                      </div>
                    ) : (
                      <div className="p-1 px-2 text-slate-500 font-bold bg-slate-200 rounded-lg text-[9px] uppercase tracking-wider flex items-center gap-1 shrink-0">
                        <Calendar size={12} /> {isPt ? "Prazo" : "Scheduled"}
                      </div>
                    )}

                    <div className="text-slate-700 font-semibold leading-normal">
                      {daysLeft !== null && daysLeft <= 0 ? (
                        <p className="text-rose-700 font-bold">
                          {isPt 
                            ? `🚨 Data vencida! Pagamento devido desde ${order.dueDate} (Há ${Math.abs(daysLeft)} dias de atraso).` 
                            : `🚨 Due date has passed! Overdue from ${order.dueDate} (${Math.abs(daysLeft)} days overdue).`}
                        </p>
                      ) : daysLeft !== null && daysLeft === 1 && order.reminder1DayBefore ? (
                        <p className="text-amber-800 font-extrabold">
                          {isPt 
                            ? `⚠️ APENAS 1 DIA! O prazo limite para pagamento termina amanhã (${order.dueDate}).` 
                            : `⚠️ ONLY 1 DAY LEFT! Payment is due tomorrow (${order.dueDate}).`}
                        </p>
                      ) : daysLeft !== null && daysLeft === 2 && order.reminder2DaysBefore ? (
                        <p className="text-indigo-900 font-bold">
                          {isPt 
                            ? `🔔 ATENÇÃO: Falta 2 dias para o vencimento do pagamento (${order.dueDate}).` 
                            : `🔔 ATTENTION: 2 days remaining until pay limit (${order.dueDate}).`}
                        </p>
                      ) : (
                        <p className="text-slate-600 font-medium">
                          {isPt 
                            ? `Prazo de pagamento vence em ${order.dueDate} (Faltam ${daysLeft} dias).` 
                            : `Payment due on ${order.dueDate} (${daysLeft} days left).`}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Active automatic reminders settings display */}
                  <div className="flex items-center gap-1.5 text-[9px] text-slate-400 font-bold uppercase tracking-wider shrink-0 mt-2 sm:mt-0">
                    <span>{isPt ? "Lembretes:" : "Alerts:"}</span>
                    <span className={cn("px-1.5 py-0.5 rounded", order.reminder1DayBefore ? "bg-blue-50 text-blue-600 border border-blue-100" : "bg-slate-100 text-slate-300")}>
                      1D Antes
                    </span>
                    <span className={cn("px-1.5 py-0.5 rounded", order.reminder2DaysBefore ? "bg-blue-50 text-blue-600 border border-blue-100" : "bg-slate-100 text-slate-300")}>
                      2D Antes
                    </span>
                  </div>
                </div>
              )}

              {/* Actions row: Stock receipt & Payment recording */}
              <div className="flex items-center justify-between border-t border-slate-50 pt-4 flex-wrap gap-3">
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest font-mono">
                  {order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString('pt-MZ') : new Date(order.createdAt || 0).toLocaleDateString('pt-MZ')}
                </div>

                <div className="flex items-center gap-2">
                  {/* Record Payment Button */}
                  {isCredit && pStatus !== 'paid' && (
                    <button
                      onClick={() => {
                        setPayingOrder(order);
                        setPayAmount(String(order.outstandingBalance || 0)); // prefill full amount by default
                        setPayMethod('cash');
                        setPayDate(new Date().toISOString().split('T')[0]);
                        setPayNotes('');
                      }}
                      className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md shadow-blue-500/10 active:scale-95 cursor-pointer"
                    >
                      <DollarSign size={14} />
                      {isPt ? "Registar Pagamento" : "Record Payment"}
                    </button>
                  )}

                  {/* Receive Stock button */}
                  {order.status === 'pending' && (
                    <button 
                      onClick={() => {
                        setReceivingOrder(order);
                        const initialBatches: Record<string, { batchNumber: string, expiryDate: string }> = {};
                        order.items.forEach((item: any) => {
                          initialBatches[item.productId] = { batchNumber: '', expiryDate: '' };
                        });
                        setReceivingBatches(initialBatches);
                      }}
                      className="px-5 py-2.5 bg-emerald-650 text-white rounded-xl font-black text-xs uppercase tracking-widest flex items-center gap-1.5 hover:bg-emerald-700 transition-all shadow-md shadow-emerald-500/10 active:scale-95 cursor-pointer"
                    >
                      <CheckCircle2 size={14} /> {isPt ? "Receber Stock" : "Mark Received"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {filteredOrders.length === 0 && !loading && (
          <div className="py-20 text-center text-slate-350">
            <ShoppingBag size={56} className="mx-auto mb-4 opacity-10" />
            <p className="font-black uppercase tracking-widest text-[11px] text-slate-400">
              {isPt ? "Nenhuma Ordem de Compra ou Compra Direta encontrada." : "No purchase orders or purchases found."}
            </p>
          </div>
        )}
      </div>

      {/* Registar Pagamento (Record Payment to Supplier) Overlay Modal */}
      <AnimatePresence>
        {payingOrder && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white w-full max-w-lg rounded-[32px] shadow-2xl overflow-hidden border border-slate-200"
            >
              <div className="p-6 md:p-8 bg-blue-900 text-white flex justify-between items-center border-b-2 border-[#B8791A]/50">
                <div>
                  <h3 className="text-lg font-black tracking-tight">{isPt ? "💵 Registar Pagamento Fornecedor" : "💵 Record Supplier Payment"}</h3>
                  <p className="text-blue-200 text-xs mt-1">
                    {isPt 
                      ? `Controle de saldo para a ordem de compra ${payingOrder.orderNumber}`
                      : `Manage outstanding balance for order ${payingOrder.orderNumber}`}
                  </p>
                </div>
                <button 
                  onClick={() => setPayingOrder(null)} 
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-6 md:p-8 space-y-5">
                {/* Ledger Current State */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 grid grid-cols-2 gap-4 font-mono select-none">
                  <div>
                    <span className="block text-[10px] uppercase font-black text-slate-400">{isPt ? "Custo Original" : "Original Cost"}</span>
                    <span className="text-base font-bold text-slate-800">{(payingOrder.totalCost || 0).toLocaleString()} {currency}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-black text-slate-400">{isPt ? "Pago Atualmente" : "Paid to Date"}</span>
                    <span className="text-base font-semibold text-emerald-650">{(payingOrder.paidAmount || 0).toLocaleString()} {currency}</span>
                  </div>
                  <div className="col-span-2 pt-2 border-t border-slate-200 flex justify-between items-center">
                    <span className="text-xs font-black text-slate-700 uppercase">{isPt ? "Saldo Devedor Aberto" : "Open Outstanding Balance"}</span>
                    <span className="text-lg font-black text-rose-500">{(payingOrder.outstandingBalance || 0).toLocaleString()} {currency}</span>
                  </div>
                </div>

                {/* Autofill / Selection Choice Shortcuts */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">{isPt ? "Escolher Modalidade de Pagamento:" : "Select Payment Plan:"}</span>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setPayAmount(String(payingOrder.outstandingBalance || 0))}
                      className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-200 text-xs font-bold text-slate-700 text-center transition-all select-none cursor-pointer"
                    >
                      {isPt ? "⚡ Liquidar Total (Full)" : "⚡ Pay Remaining (Full)"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPayAmount(String((payingOrder.outstandingBalance || 0) / 2))}
                      className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-200 text-xs font-bold text-slate-700 text-center transition-all select-none cursor-pointer"
                    >
                      {isPt ? "🌓 Metade (50%)" : "🌓 Half Payment (50%)"}
                    </button>
                  </div>
                </div>

                {/* Main Fields Form */}
                <div className="space-y-4">
                  {/* Payment Amount */}
                  <div className="space-y-1">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">{isPt ? "Valor Pago *" : "Payment Amount *"}</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-slate-400">{currency}</span>
                      <input 
                        type="number"
                        min="0.01"
                        step="any"
                        placeholder="0.00"
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-sm font-mono text-slate-800"
                        value={payAmount}
                        onChange={e => setPayAmount(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Payment Method */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest">{isPt ? "Método" : "Method"}</label>
                      <select
                        className="w-full p-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-xs text-slate-800"
                        value={payMethod}
                        onChange={e => setPayMethod(e.target.value)}
                      >
                        <option value="cash">{isPt ? "Dinheiro" : "Cash"}</option>
                        <option value="bank">{isPt ? "Transferência" : "Bank Transfer"}</option>
                        <option value="mobile_money">{isPt ? "Contas Móveis" : "Mobile Money"}</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest">{isPt ? "Data de Pagamento" : "Payment Date"}</label>
                      <input 
                        type="date"
                        className="w-full p-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-xs font-mono text-slate-850"
                        value={payDate}
                        onChange={e => setPayDate(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="space-y-1">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">{isPt ? "Observações / Notas" : "Internal Notes"}</label>
                    <input 
                      type="text"
                      className="w-full p-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-medium text-xs text-slate-800"
                      placeholder={isPt ? "Ex: Pago com talão de depósito..." : "Ex: Paid via check/transfc..."}
                      value={payNotes}
                      onChange={e => setPayNotes(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Action buttons footer */}
              <div className="p-6 md:p-8 bg-slate-50 border-t border-slate-150 flex justify-end gap-3">
                <button 
                  onClick={() => setPayingOrder(null)} 
                  className="px-5 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  {isPt ? "Fechar" : "Close"}
                </button>
                <button 
                  onClick={handleRecordSupplierPayment} 
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl shadow-lg shadow-blue-600/10 transition-all text-xs uppercase tracking-wider cursor-pointer"
                >
                  {isPt ? "Efetuar Pagamento" : "Confirm Payment"}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Batch Receiving Modal */}
        {receivingOrder && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-55 flex items-center justify-center p-4 overflow-y-auto">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[32px] shadow-2xl border border-slate-150 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="p-6 md:p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="space-y-1">
                  <h3 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                    <span>⏳ Receber Stock & Rastreio de Lotes</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Registe lotes e validades para garantir o controlo do prazo de validade das novas mercadorias.
                  </p>
                </div>
                <button 
                  type="button"
                  onClick={() => setReceivingOrder(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Items List */}
              <div className="p-6 md:p-8 overflow-y-auto space-y-6">
                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex gap-3 text-amber-800 text-xs">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                  <div>
                    <strong className="font-bold block mb-0.5">Nota de Boas Práticas:</strong>
                    Deixar os campos em branco receberá o stock normalmente sem associar lote. Se preenchidos, os lotes serão criados no inventário para alertas e promoções.
                  </div>
                </div>

                <div className="space-y-5">
                  {receivingOrder.items.map((item: any) => {
                    const info = receivingBatches[item.productId] || { batchNumber: '', expiryDate: '' };
                    return (
                      <div key={item.productId} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <h4 className="font-bold text-slate-900 text-sm leading-tight">{item.name}</h4>
                            <span className="text-[10px] text-slate-400 font-mono">ID: {item.productId}</span>
                          </div>
                          <span className="bg-slate-200 text-slate-800 text-[10px] font-mono px-2 py-0.5 rounded-lg font-bold">
                            Qtd: {item.quantity} {item.selectedUnit?.toUpperCase() || 'UN'} ({(Number(item.quantity) * (Number(item.multiplier) || 1))} unid. base)
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Número do Lote</label>
                            <input
                              type="text"
                              value={info.batchNumber}
                              onChange={(e) => {
                                setReceivingBatches({
                                  ...receivingBatches,
                                  [item.productId]: { ...info, batchNumber: e.target.value }
                                });
                              }}
                              placeholder="Ex: LOTE-2026-A"
                              className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Data de Validade</label>
                            <input
                              type="date"
                              value={info.expiryDate}
                              onChange={(e) => {
                                setReceivingBatches({
                                  ...receivingBatches,
                                  [item.productId]: { ...info, expiryDate: e.target.value }
                                });
                              }}
                              className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Footer */}
              <div className="p-6 md:p-8 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setReceivingOrder(null)}
                  className="px-5 py-2.5 bg-white border border-slate-200 text-slate-500 rounded-2xl text-xs font-black uppercase tracking-wider hover:bg-slate-100 cursor-pointer active:scale-95 transition-all"
                >
                  {isPt ? "Cancelar" : "Cancel"}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const currentOrder = receivingOrder;
                    setReceivingOrder(null);
                    await receiveStock(currentOrder, receivingBatches);
                  }}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider shadow-md shadow-emerald-500/10 cursor-pointer active:scale-95 transition-all"
                >
                  {isPt ? "Confirmar e Receber" : "Confirm & Receive"}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showAddSupplierModal && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-55 flex items-center justify-center p-4 overflow-y-auto">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[32px] shadow-2xl border border-slate-150 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="p-6 md:p-8 border-b border-b-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-100 text-blue-600 rounded-xl">
                    <UserPlus size={20} />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-base leading-tight">
                      {isPt ? "Adicionar Novo Fornecedor" : "Add New Supplier"}
                    </h3>
                    <p className="text-[10px] text-slate-450 uppercase font-bold tracking-wider mt-0.5 animate-pulse">
                      {isPt ? "Entidade de compra rápida" : "Quick supplier enrollment"}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowAddSupplierModal(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Form Body */}
              <form onSubmit={handleQuickAddSupplier} className="flex-1 overflow-y-auto p-6 md:p-8 space-y-4">
                {/* Name */}
                <div className="space-y-1">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">{isPt ? "Nome do Fornecedor / Firma *" : "Supplier/Company Name *"}</label>
                  <input 
                    type="text"
                    required
                    className="w-full p-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-xs"
                    placeholder={isPt ? "Ex: Distribuidora de Alimentos, LDA" : "Ex: Food Distributors Inc."}
                    value={quickSupplier.name}
                    onChange={e => setQuickSupplier({...quickSupplier, name: e.target.value})}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Contact Person */}
                  <div className="space-y-1">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">{isPt ? "Pessoa de Contacto" : "Contact Person"}</label>
                    <input 
                      type="text"
                      className="w-full p-3 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-medium text-xs text-slate-800"
                      placeholder={isPt ? "Ex: João Silva" : "Ex: John Doe"}
                      value={quickSupplier.contactPerson}
                      onChange={e => setQuickSupplier({...quickSupplier, contactPerson: e.target.value})}
                    />
                  </div>

                  {/* Phone */}
                  <div className="space-y-1">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">{isPt ? "Contacto / Telefone" : "Contact Phone"}</label>
                    <input 
                      type="text"
                      className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-xs font-mono text-slate-800"
                      placeholder="Ex: 841234567"
                      value={quickSupplier.phone}
                      onChange={e => setQuickSupplier({...quickSupplier, phone: e.target.value})}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Email */}
                  <div className="space-y-1">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">{isPt ? "Correio Eletrónico" : "Email Address"}</label>
                    <input 
                      type="email"
                      className="w-full p-3 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-medium text-xs text-slate-800"
                      placeholder="Ex: info@fornecedor.co.mz"
                      value={quickSupplier.email}
                      onChange={e => setQuickSupplier({...quickSupplier, email: e.target.value})}
                    />
                  </div>

                  {/* Category */}
                  <div className="space-y-1">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">{isPt ? "Categoria" : "Category Sector"}</label>
                    <input 
                      type="text"
                      className="w-full p-3 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-medium text-xs text-slate-800"
                      placeholder={isPt ? "Ex: Bebidas, Mercearia" : "Ex: Beverages, Bakery"}
                      value={quickSupplier.category}
                      onChange={e => setQuickSupplier({...quickSupplier, category: e.target.value})}
                    />
                  </div>
                </div>

                {/* Address */}
                <div className="space-y-1">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">{isPt ? "Endereço Físico" : "Physical Address"}</label>
                  <input 
                    type="text"
                    className="w-full p-3 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-medium text-xs text-slate-800"
                    placeholder={isPt ? "Ex: Av. Eduardo Mondlane, Prédio 10" : "Ex: Av. Eduardo Mondlane, Maputo"}
                    value={quickSupplier.address}
                    onChange={e => setQuickSupplier({...quickSupplier, address: e.target.value})}
                  />
                </div>

                {/* Notes */}
                <div className="space-y-1">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">{isPt ? "Observações Internas" : "Internal Quick Notes"}</label>
                  <textarea 
                    rows={2}
                    className="w-full p-3 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-medium text-xs text-slate-800 resize-none"
                    placeholder="..."
                    value={quickSupplier.notes}
                    onChange={e => setQuickSupplier({...quickSupplier, notes: e.target.value})}
                  />
                </div>

                {/* Footer buttons inside body scroll boundaries */}
                <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                  <button 
                    type="button"
                    onClick={() => setShowAddSupplierModal(false)} 
                    className="px-5 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-150 hover:text-slate-700 rounded-xl transition-all cursor-pointer"
                  >
                    {isPt ? "Cancelar" : "Cancel"}
                  </button>
                  <button 
                    type="submit"
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl shadow-lg shadow-blue-650/10 transition-all text-xs uppercase tracking-wider cursor-pointer font-sans"
                  >
                    {isPt ? "Salvar Fornecedor" : "Save Supplier"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {showProductSearchModal && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-55 flex items-center justify-center p-4 overflow-y-auto">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[24px] shadow-2xl border border-slate-150 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-blue-50 text-blue-650 rounded-lg">
                    <Search size={18} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">
                      {isPt ? "Adicionar Produto" : "Add Product"}
                    </h3>
                    <p className="text-[10px] text-slate-500">
                      {isPt ? "Procure ou registe um novo produto" : "Search or register a new product"}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setShowProductSearchModal(false);
                    setSearchModalQuery('');
                    setSearchModalNewName('');
                    setSearchModalNewCost('');
                  }}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-150 rounded-lg transition-all cursor-pointer border-none bg-transparent"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Body */}
              <div className="p-5 flex-1 overflow-y-auto space-y-4">
                {/* Search Bar */}
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-xs text-slate-800 focus:ring-1 focus:ring-blue-500 focus:bg-white outline-none h-[38px]"
                    placeholder={isPt ? "Digitar nome do produto..." : "Type product name..."}
                    value={searchModalQuery}
                    onChange={e => {
                      setSearchModalQuery(e.target.value);
                      setSearchModalNewName(e.target.value);
                    }}
                    autoFocus
                  />
                </div>

                {/* Existing Products List */}
                <div className="space-y-1.5 max-h-[30vh] overflow-y-auto">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    {isPt ? "PRODUTOS EXISTENTES" : "EXISTING PRODUCTS"}
                  </span>
                  
                  {filteredModalProducts.map(p => {
                    const alreadyInOrder = newOrder.items.some(item => item.productId === p.id);
                    const selectedUnitVal = searchModalSelectedUnits[p.id] || p.unit || 'un';
                    const availUnits = getAvailableUnits(p);

                    return (
                      <div
                        key={p.id}
                        className={cn(
                          "p-2.5 rounded-xl border border-slate-100 flex justify-between items-center transition-all text-xs font-semibold select-none",
                          alreadyInOrder 
                            ? "bg-slate-50 border-slate-200 text-slate-400" 
                            : "bg-white hover:bg-blue-50/50 border-slate-150 cursor-pointer text-slate-850"
                        )}
                        onClick={() => {
                          if (alreadyInOrder) {
                            toast.error(isPt ? "Este produto já está na lista!" : "This product is already in the list!");
                            return;
                          }
                          const chosenUnit = searchModalSelectedUnits[p.id] || p.unit || 'un';
                          addProductToOrder(p, chosenUnit);
                          setShowProductSearchModal(false);
                          setSearchModalQuery('');
                          setSearchModalNewName('');
                          setSearchModalNewCost('');
                        }}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Package size={14} className="text-slate-400 shrink-0" />
                          <div className="truncate">
                            <p className="truncate text-slate-850 font-bold">{p.name}</p>
                            {p.sku && <p className="text-[10px] text-slate-400 font-normal font-mono">SKU: {p.sku}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                          {!alreadyInOrder && availUnits.length > 1 && (
                            <select
                              value={selectedUnitVal}
                              onChange={e => {
                                setSearchModalSelectedUnits(prev => ({
                                  ...prev,
                                  [p.id]: e.target.value
                                }));
                              }}
                              className="p-1 py-0.5 bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 rounded-lg text-[10px] font-bold outline-none cursor-pointer h-7"
                            >
                              {availUnits.map(u => (
                                <option key={u.value} value={u.value}>{u.label}</option>
                              ))}
                            </select>
                          )}
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-1 rounded font-mono font-bold">
                            {(() => {
                              let cost = p.costPrice || 0;
                              if (selectedUnitVal === 'cx' && p.boxUnitCostPrice) {
                                cost = p.boxUnitCostPrice;
                              } else if (selectedUnitVal === 'emb' && p.packUnitCostPrice) {
                                cost = p.packUnitCostPrice;
                              } else if (selectedUnitVal !== 'un') {
                                const unitObj = availUnits.find(u => u.value === selectedUnitVal);
                                if (unitObj) {
                                  cost = (p.costPrice || 0) * unitObj.multiplier;
                                }
                              }
                              return `${cost.toFixed(2)} ${currency}`;
                            })()}
                          </span>
                          {alreadyInOrder && (
                            <span className="text-[9px] bg-emerald-100 text-emerald-700 font-bold px-1.5 py-0.5 rounded uppercase">
                              {isPt ? "Adicionado" : "Added"}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {filteredModalProducts.length === 0 && (
                    <p className="text-xs text-slate-400 italic text-center py-4">
                      {isPt ? "Nenhum produto correspondente" : "No matching products"}
                    </p>
                  )}
                </div>

                {/* Option to add brand new product */}
                <div className="pt-4 border-t border-slate-100 space-y-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    {isPt ? "OU CADASTRAR NOVO PRODUTO" : "OR REGISTER NEW PRODUCT"}
                  </span>

                  <div className="bg-slate-50/50 p-3 rounded-xl border border-slate-150 space-y-2.5">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                          {isPt ? "Nome do Produto *" : "Product Name *"}
                        </label>
                        <input
                          type="text"
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-250 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-blue-500 outline-none"
                          placeholder="Ex: Coca Cola 330ml"
                          value={searchModalNewName}
                          onChange={e => setSearchModalNewName(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                          {isPt ? "Preço de Custo" : "Cost Price"}
                        </label>
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-slate-400">{currency}</span>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            className="w-full pl-7 pr-2 py-1.5 bg-white border border-slate-250 rounded-lg text-xs font-bold font-mono focus:ring-1 focus:ring-blue-500 outline-none"
                            placeholder="0.00"
                            value={searchModalNewCost}
                            onChange={e => setSearchModalNewCost(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={async () => {
                        if (!searchModalNewName.trim()) {
                          toast.error(isPt ? "Nome do produto é obrigatório." : "Product name is required.");
                          return;
                        }
                        const cost = Number(searchModalNewCost) || 0;
                        await handleCreateAndAddProduct(searchModalNewName, cost);
                        setShowProductSearchModal(false);
                        setSearchModalQuery('');
                        setSearchModalNewName('');
                        setSearchModalNewCost('');
                      }}
                      className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-xs uppercase tracking-wider transition-all border-none cursor-pointer flex items-center justify-center gap-1.5 shadow-sm shadow-blue-500/10"
                    >
                      <Plus size={14} />
                      {isPt ? "Cadastrar e Adicionar" : "Register and Add"}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {showAddProductModal && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-55 flex items-center justify-center p-4 overflow-y-auto">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[32px] shadow-2xl border border-slate-150 w-full max-w-xl overflow-hidden flex flex-col max-h-[92vh]"
            >
              {/* Header */}
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-105 text-blue-650 rounded-xl">
                    <PackagePlus size={20} />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-base leading-tight">
                      {isPt ? "Adicionar Produto ao Catálogo" : "Add New Catalog Product"}
                    </h3>
                    <p className="text-[10px] text-slate-450 uppercase font-black tracking-wider mt-0.5 animate-pulse">
                      {isPt ? "Cadastrar com múltiplas unidades de medida" : "Register with multi-units of measure"}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowAddProductModal(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Form Body wrapper */}
              <form onSubmit={handleQuickAddProduct} className="flex-1 overflow-y-auto p-6 space-y-5">
                
                {/* Section: Basic info */}
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">{isPt ? "Nome do Produto *" : "Product Name *"}</label>
                    <input 
                      type="text"
                      required
                      className="w-full p-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-xs"
                      placeholder={isPt ? "Ex: Açúcar de 1kg" : "Ex: Sugar 1kg"}
                      value={quickProduct.name}
                      onChange={e => setQuickProduct({...quickProduct, name: e.target.value})}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest">{isPt ? "Código / SKU" : "Bar code / SKU"}</label>
                      <input 
                        type="text"
                        className="w-full p-3 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-medium text-xs font-mono text-slate-800"
                        placeholder="Ex: 56012356..."
                        value={quickProduct.sku}
                        onChange={e => setQuickProduct({...quickProduct, sku: e.target.value})}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">{isPt ? "Unidade" : "Base Unit"}</label>
                        <input 
                          type="text"
                          className="w-full p-3 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-xs text-center text-slate-705"
                          placeholder="Ex: Unidade"
                          value={quickProduct.baseUnitName}
                          onChange={e => setQuickProduct({...quickProduct, baseUnitName: e.target.value})}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">{isPt ? "Sigla" : "Sigla"}</label>
                        <input 
                          type="text"
                          className="w-full p-3 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-black text-xs text-center text-blue-700"
                          placeholder="Ex: un, kg"
                          value={quickProduct.baseUnitLabel}
                          onChange={e => setQuickProduct({...quickProduct, baseUnitLabel: e.target.value})}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section: Base units pricing */}
                <div className="bg-slate-50/50 p-4 rounded-3xl border border-slate-150 space-y-3">
                  <h4 className="font-extrabold text-xs text-slate-700 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-150/50">
                    <span className="h-2 w-2 rounded-full bg-blue-500"></span>
                    {isPt ? "Tabela de Preço (Unidade Base)" : "Pricing Model (Base Unit)"}
                  </h4>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isPt ? "Custo de Compra *" : "Buying Cost *"}</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">{currency}</span>
                        <input 
                          type="number"
                          step="any"
                          required
                          className="w-full pl-10 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono text-xs font-bold text-slate-800"
                          placeholder="0.00"
                          value={quickProduct.costPrice}
                          onChange={e => setQuickProduct({...quickProduct, costPrice: e.target.value})}
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isPt ? "Preço de Venda *" : "Selling Price *"}</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">{currency}</span>
                        <input 
                          type="number"
                          step="any"
                          required
                          className="w-full pl-10 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono text-xs font-bold text-emerald-700"
                          placeholder="0.00"
                          value={quickProduct.price}
                          onChange={e => setQuickProduct({...quickProduct, price: e.target.value})}
                        />
                      </div>
                    </div>
                  </div>

                  {Number(quickProduct.costPrice) > 0 && Number(quickProduct.price) > 0 && (
                    <div className="flex gap-4 text-[10px] font-bold uppercase tracking-wider text-slate-450 mt-1 select-none font-mono">
                      <span>Margin: <span className="text-teal-650 font-black">{Math.round(((Number(quickProduct.price) - Number(quickProduct.costPrice)) / Number(quickProduct.price)) * 100)}%</span></span>
                      <span>Markup: <span className="text-blue-550 font-black">{Math.round(((Number(quickProduct.price) - Number(quickProduct.costPrice)) / Number(quickProduct.costPrice)) * 100)}%</span></span>
                    </div>
                  )}
                </div>

                {/* Multi Units Activator Selector */}
                <div className="space-y-4 border-t pt-4">
                  <div>
                    <label className="text-xs font-black text-slate-700 uppercase tracking-wider block">
                      {isPt ? "Como será vendido este produto? (Unidade de Medida)" : "How will this product be sold? (UOM)"}
                    </label>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {isPt ? "Selecione se quer definir múltiplos formatos de venda com preços diferentes." : "Configure multiple selling formats with different prices."}
                    </p>
                  </div>

                  {/* Highlight banner in quick add */}
                  <div className="bg-blue-50/70 border border-blue-100 p-3 rounded-2xl flex items-start gap-2.5">
                    <span className="text-sm">💡</span>
                    <p className="text-[10.5px] text-blue-700 leading-normal">
                      {isPt ? (
                        <>Ideal para produtos como <strong>Arroz de 25kg</strong>. Pode vendê-lo como <strong>"Saco"</strong> inteiro (ex: 1500 MZN) E também aberto a retalho por <strong>"Kg"</strong> (ex: 70 MZN), com stock unificado!</>
                      ) : (
                        <>Ideal for products like <strong>25kg Rice</strong>. Sell as whole <strong>"Sack"</strong> (e.g. 1500 MZN) and retail per <strong>"Kg"</strong> (e.g. 70 MZN) from unified stock!</>
                      )}
                    </p>
                  </div>

                  {/* Interactive Cards */}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setQuickProduct({ ...quickProduct, hasMultiUnits: false })}
                      className={cn(
                        "p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between active:scale-95",
                        !quickProduct.hasMultiUnits
                          ? "bg-white border-blue-600 ring-2 ring-blue-100 shadow-sm"
                          : "bg-slate-50 border-slate-150 hover:bg-slate-100"
                      )}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className={cn("text-[10px] font-black uppercase tracking-wider", !quickProduct.hasMultiUnits ? "text-blue-700" : "text-slate-650")}>
                          {isPt ? "Unidade Única" : "Single Unit"}
                        </span>
                        <div className={cn("w-3.5 h-3.5 rounded-full border flex items-center justify-center", !quickProduct.hasMultiUnits ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white")}>
                          {!quickProduct.hasMultiUnits && <Check size={8} className="stroke-[3]" />}
                        </div>
                      </div>
                      <p className="text-[9.5px] text-slate-400 mt-1 leading-tight">
                        {isPt ? "Apenas formato básico e preço único." : "Basic unit and single price only."}
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setQuickProduct({ ...quickProduct, hasMultiUnits: true })}
                      className={cn(
                        "p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between active:scale-95",
                        quickProduct.hasMultiUnits
                          ? "bg-white border-blue-600 ring-2 ring-blue-100 shadow-sm"
                          : "bg-slate-50 border-slate-150 hover:bg-slate-100"
                      )}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className={cn("text-[10px] font-black uppercase tracking-wider", quickProduct.hasMultiUnits ? "text-blue-700" : "text-slate-650")}>
                          {isPt ? "Múltiplas Medidas" : "Multi-Units"}
                        </span>
                        <div className={cn("w-3.5 h-3.5 rounded-full border flex items-center justify-center", quickProduct.hasMultiUnits ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white")}>
                          {quickProduct.hasMultiUnits && <Check size={8} className="stroke-[3]" />}
                        </div>
                      </div>
                      <p className="text-[9.5px] text-slate-400 mt-1 leading-tight">
                        {isPt ? "Definir Saco, Caixa e preços diferentes." : "Define Box, Sack, and custom prices."}
                      </p>
                    </button>
                  </div>
                </div>

                {/* Sub-section: Box Configuration (Venda por Caixa / Fardo) */}
                {quickProduct.hasMultiUnits && (
                  <div className="space-y-4 p-5 bg-slate-50 rounded-3xl border border-slate-150 animate-in fade-in-50 slide-in-from-top-2 duration-300">
                    <h4 className="font-extrabold text-xs text-slate-700 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-150">
                      <span className="h-2 w-2 rounded-full bg-amber-500"></span>
                      {isPt ? "Nível de Caixa (ex: Caixa, Saco de 50kg, Fardo)" : "Box Unit Level (e.g. Sack 50kg, Box)"}
                    </h4>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isPt ? "Nome Unidade" : "Unit Name"}</label>
                        <input 
                          type="text"
                          className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs font-bold text-slate-800"
                          placeholder="Ex: Caixa ou Saco 50kg"
                          value={quickProduct.boxUnitName}
                          onChange={e => setQuickProduct({...quickProduct, boxUnitName: e.target.value})}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isPt ? "Sigla" : "Label"}</label>
                        <input 
                          type="text"
                          className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs font-black text-slate-700 text-center"
                          placeholder="Ex: Cx"
                          value={quickProduct.boxUnitLabel}
                          onChange={e => setQuickProduct({...quickProduct, boxUnitLabel: e.target.value})}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-405 uppercase tracking-widest">{isPt ? "Fator (Equiv. un)" : "Multiplier"}</label>
                        <input 
                          type="number"
                          className="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs font-bold font-mono text-center text-blue-700"
                          placeholder="Ex: 12 ou 50"
                          value={quickProduct.boxUnitQty}
                          onChange={e => setQuickProduct({...quickProduct, boxUnitQty: e.target.value})}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isPt ? "Preço de Compra Caixa" : "Box Cost Price"}</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">{currency}</span>
                          <input 
                            type="number"
                            step="any"
                            className="w-full pl-10 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono text-xs font-semibold text-slate-800"
                            placeholder="0.00"
                            value={quickProduct.boxUnitCostPrice}
                            onChange={e => setQuickProduct({...quickProduct, boxUnitCostPrice: e.target.value})}
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isPt ? "Preço de Venda Caixa" : "Box Retail Price"}</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">{currency}</span>
                          <input 
                            type="number"
                            step="any"
                            className="w-full pl-10 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono text-xs font-bold text-slate-800"
                            placeholder="0.00"
                            value={quickProduct.boxUnitPrice}
                            onChange={e => setQuickProduct({...quickProduct, boxUnitPrice: e.target.value})}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Checkbox nested toggle to enable 3rd Unit (Pack unit) */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{isPt ? "Habilitar uma terceira unidade? (ex: Pacote/Fardo)" : "Enable Third Unit level? (Pack/Bundle)"}</span>
                      <label className="relative inline-flex items-center cursor-pointer select-none">
                        <input 
                          type="checkbox" 
                          className="sr-only peer"
                          checked={quickProduct.hasPackUnit}
                          onChange={e => setQuickProduct({...quickProduct, hasPackUnit: e.target.checked})}
                        />
                        <div className="w-9 h-5 bg-slate-200 rounded-full peer peer-checked:bg-amber-500 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
                      </label>
                    </div>

                    {/* Third Unit Input Form */}
                    {quickProduct.hasPackUnit && (
                      <div className="space-y-3 pt-3 border-t border-dashed border-slate-200 animate-in fade-in-50 duration-200">
                        <div className="grid grid-cols-3 gap-2">
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{isPt ? "Nome Unidade" : "Unit Name"}</label>
                            <input 
                              type="text"
                              className="w-full p-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs font-bold text-slate-800"
                              placeholder="Ex: Embalagem"
                              value={quickProduct.packUnitName}
                              onChange={e => setQuickProduct({...quickProduct, packUnitName: e.target.value})}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{isPt ? "Sigla" : "Label"}</label>
                            <input 
                              type="text"
                              className="w-full p-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs font-black text-slate-700 text-center"
                              placeholder="Ex: Emb"
                              value={quickProduct.packUnitLabel}
                              onChange={e => setQuickProduct({...quickProduct, packUnitLabel: e.target.value})}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{isPt ? "Fator Equivalência" : "Multiplier"}</label>
                            <input 
                              type="number"
                              className="w-full p-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs font-bold font-mono text-center text-amber-700"
                              placeholder="Ex: 10"
                              value={quickProduct.packUnitQty}
                              onChange={e => setQuickProduct({...quickProduct, packUnitQty: e.target.value})}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{isPt ? "Preço de Compra Terceira Unidade" : "Third Cost Price"}</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[9px] font-bold text-slate-400">{currency}</span>
                              <input 
                                type="number"
                                step="any"
                                className="w-full pl-10 pr-3 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono text-xs font-semibold text-slate-800"
                                placeholder="0.00"
                                value={quickProduct.packUnitCostPrice}
                                onChange={e => setQuickProduct({...quickProduct, packUnitCostPrice: e.target.value})}
                              />
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{isPt ? "Preço de Venda Terceira Unidade" : "Third Retail Price"}</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[9px] font-bold text-slate-400">{currency}</span>
                              <input 
                                type="number"
                                step="any"
                                className="w-full pl-10 pr-3 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono text-xs font-bold text-slate-800"
                                placeholder="0.00"
                                value={quickProduct.packUnitPrice}
                                onChange={e => setQuickProduct({...quickProduct, packUnitPrice: e.target.value})}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Footer action buttons */}
                <div className="pt-4 border-t border-slate-100 flex justify-end gap-3 pb-2">
                  <button 
                    type="button"
                    onClick={() => setShowAddProductModal(false)} 
                    className="px-5 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                  >
                    {isPt ? "Cancelar" : "Cancel"}
                  </button>
                  <button 
                    type="submit"
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl shadow-lg shadow-blue-650/10 transition-all text-xs uppercase tracking-wider cursor-pointer font-sans"
                  >
                    {isPt ? "Salvar Produto" : "Create Product"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
