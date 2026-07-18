import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db, handleFirestoreError, OperationType, storage } from '../lib/firebase';
import { subscribeToCollection, useSharedCollection } from '../lib/firestoreCache';
import { offlineDb } from '../lib/offlineDb';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  getDocs, 
  doc, 
  updateDoc, 
  increment, 
  writeBatch,
  runTransaction,
  where,
  orderBy,
  limit
} from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { logAuditEvent } from '../lib/auditLog';
import { useTranslation } from 'react-i18next';
import { 
  Search, 
  ShoppingCart, 
  Trash2, 
  Plus, 
  Minus, 
  CreditCard, 
  ChevronRight, 
  User, 
  Users, 
  Package, 
  Calculator, 
  Printer, 
  Smartphone, 
  X, 
  AlertCircle, 
  Camera, 
  CameraOff, 
  UserPlus, 
  Lock, 
  Loader2, 
  Sparkles, 
  Barcode, 
  Zap, 
  Send, 
  History, 
  ChevronDown, 
  Eye, 
  Check, 
  FileText,
  DollarSign,
  ArrowLeft,
  RefreshCw
} from 'lucide-react';
import { cn, formatDateInTimezone, formatDateTimeInTimezone } from '../lib/utils';
import { toast } from 'sonner';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { formatSystemCurrency, formatCurrencyValue } from '../lib/currencies';
import { getCountryPaymentMethods, PaymentMethodConfig } from '../lib/paymentMethods';
import ManagerPINModal from './ManagerPINModal';
import NumericKeypad from './NumericKeypad';
import { useQuickSaleShortcuts } from '../hooks/useQuickSaleShortcuts';

interface CartQuantityInputProps {
  item: any;
  updateCartQuantity: (id: string, unit: string, qty: number, allowZero?: boolean) => void;
  handleRemoveClick: (id: string, unit: string) => void;
}

const CartQuantityInput: React.FC<CartQuantityInputProps> = ({ item, updateCartQuantity, handleRemoveClick }) => {
  const [localVal, setLocalVal] = useState<string>(item.quantity.toString());

  useEffect(() => {
    setLocalVal(item.quantity.toString());
  }, [item.quantity]);

  const handleCommit = () => {
    const parsed = parseFloat(localVal);
    if (isNaN(parsed) || parsed < 0) {
      setLocalVal(item.quantity.toString());
      toast.error("Quantidade inválida!");
      return;
    }

    if (parsed === 0) {
      handleRemoveClick(item.id, item.selectedUnit);
      return;
    }

    updateCartQuantity(item.id, item.selectedUnit, parsed, true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

  return (
    <input
      type="number"
      step="any"
      value={localVal}
      onChange={e => setLocalVal(e.target.value)}
      onBlur={handleCommit}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      className="w-[44px] h-[24px] text-center text-[10.5px] p-0 font-mono font-bold border border-blue-200 rounded-md bg-blue-50/50 outline-none focus:bg-white focus:border-[#B8791A] focus:ring-1 focus:ring-[#B8791A]/20 text-blue-900 transition-all cursor-text [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
    />
  );
};

interface CartItemRowProps {
  item: any;
  prices: any;
  updateCartQuantity: (id: string, unit: string, qty: number, allowZero?: boolean) => void;
  handleRemoveClick: (id: string, unit: string) => void;
  onPriceClick: (item: any) => void;
}

const CartItemRow = React.memo<CartItemRowProps>(({
  item,
  prices,
  updateCartQuantity,
  handleRemoveClick,
  onPriceClick
}) => {
  return (
    <div 
      className={cn(
        "grid grid-cols-12 gap-2 items-center py-1 px-3 hover:bg-blue-50/40 transition-colors border-t-[0.5px] border-blue-100/50 first:border-t-0",
        item.hasStockConflict ? "bg-rose-50 border-rose-250 hover:bg-rose-50/90" : ""
      )}
    >
      {/* Product Name & Details */}
      <div className="col-span-5 flex flex-col text-left min-w-0 pr-1">
        <span className="text-xs font-black text-blue-950 truncate leading-tight">
          {item.name}
        </span>
        <span className="text-[9px] text-blue-600 font-mono font-bold mt-0.5">
          Unidade: {item.selectedUnit}
        </span>
        {item.hasStockConflict && (
          <span className="text-[9px] font-bold text-rose-600 flex items-center gap-1 mt-0.5 animate-pulse">
            ⚠️ Apenas {item.availableStock} em stock!
          </span>
        )}
      </div>

      {/* Quantity Input Field */}
      <div className="col-span-3 flex items-center justify-center">
        <CartQuantityInput 
          item={item} 
          updateCartQuantity={updateCartQuantity} 
          handleRemoveClick={handleRemoveClick} 
        />
      </div>

      {/* Editable Unit Price */}
      <button
        type="button"
        onClick={() => onPriceClick(item)}
        className="col-span-2 text-right hover:bg-blue-50 p-1 rounded transition-all cursor-pointer group flex flex-col items-end border-none bg-transparent"
        title="Substituir Preço Unitário (Teclado Rápido)"
      >
        <span className="font-mono text-[10.5px] text-blue-900 group-hover:text-[#B8791A] font-extrabold">
          {(prices.finalUnitPrice).toLocaleString()}
        </span>
        {(item.overridePrice !== undefined || (item.manualDiscountValue && item.manualDiscountValue > 0)) && (
          <span className="text-[7.5px] px-1 bg-amber-100 text-amber-850 rounded-sm font-black block mt-0.5 scale-90 origin-right">EDITADO</span>
        )}
      </button>

      {/* Total Price + Delete button */}
      <div className="col-span-2 flex items-center justify-end gap-1 text-right min-w-0">
        <span className="font-mono text-[10.5px] font-black text-blue-950 truncate">
          {(prices.total).toLocaleString()}
        </span>
        <button 
          type="button"
          onClick={() => handleRemoveClick(item.id, item.selectedUnit)}
          className="text-blue-300 hover:text-rose-600 transition-colors p-1 rounded-full cursor-pointer hover:bg-rose-50"
          title="Eliminar"
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.item.quantity === nextProps.item.quantity &&
    prevProps.item.selectedUnit === nextProps.item.selectedUnit &&
    prevProps.item.overridePrice === nextProps.item.overridePrice &&
    prevProps.item.manualDiscountValue === nextProps.item.manualDiscountValue &&
    prevProps.item.hasStockConflict === nextProps.item.hasStockConflict &&
    prevProps.prices.finalUnitPrice === nextProps.prices.finalUnitPrice &&
    prevProps.prices.total === nextProps.prices.total
  );
});

export default function POS() {
  const { profile, businessData } = useAuth();
  const { t } = useTranslation();
  const currency = businessData?.currency || 'MZN';

  // State Management
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [cart, setCart] = useState<any[]>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = window.localStorage.getItem('pos_cart');
        return saved ? JSON.parse(saved) : [];
      }
    } catch (e) {
      console.warn("Could not read pos_cart from localStorage", e);
    }
    return [];
  });

  // UI States
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [activeCartTab, setActiveCartTab] = useState<'items' | 'payment'>('items');
  const [catalogCategory, setCatalogCategory] = useState<string>('all');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('Walk-in');
  const [saleType, setSaleType] = useState<'retail' | 'wholesale'>('retail');
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const [taxRate, setTaxRate] = useState<number>(17);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [expandedTiersKey, setExpandedTiersKey] = useState<string | null>(null);
  const [expandedCalcKey, setExpandedCalcKey] = useState<string | null>(null);
  const [expandedUnitKey, setExpandedUnitKey] = useState<string | null>(null);

  // Shift & Cash Drawer States
  const [currentShift, setCurrentShift] = useState<any>(null);
  const [loadingShift, setLoadingShift] = useState(true);
  const [openingFloat, setOpeningFloat] = useState('');
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [isClosingShiftForm, setIsClosingShiftForm] = useState(false);
  const [shiftNote, setShiftNote] = useState('');
  const [shiftMoveAmount, setShiftMoveAmount] = useState('');
  const [shiftMoveType, setShiftMoveType] = useState<'addition' | 'withdrawal'>('addition');
  const [lastClosedShiftData, setLastClosedShiftData] = useState<any>(null);
  const [selectedTerminal, setSelectedTerminal] = useState('Caixa Geral');
  const [isOpeningCalculatorOpen, setIsOpeningCalculatorOpen] = useState(false);
  const [isClosingCalculatorOpen, setIsClosingCalculatorOpen] = useState(false);
  const [countedCash, setCountedCash] = useState('');
  const [closingNotes, setClosingNotes] = useState('');
  const [isClosedShiftSummaryOpen, setIsClosedShiftSummaryOpen] = useState(false);
  const [openingDenominations, setOpeningDenominations] = useState<Record<string, number>>({
    '1000': 0, '500': 0, '200': 0, '100': 0, '50': 0, '20': 0, '10': 0, '5': 0, '2': 0, '1': 0
  });
  const [closingDenominations, setClosingDenominations] = useState<Record<string, number>>({
    '1000': 0, '500': 0, '200': 0, '100': 0, '50': 0, '20': 0, '10': 0, '5': 0, '2': 0, '1': 0
  });

  // Void & Return/Refund module states
  const [cartSessionId, setCartSessionId] = useState<string>(() => {
    return 'cart_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
  });
  const [voidItem, setVoidItem] = useState<any | null>(null);
  const [isVoidReasonModalOpen, setIsVoidReasonModalOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('Wrong item');
  const [customVoidReason, setCustomVoidReason] = useState('');
  const [voidPinThreshold, setVoidPinThreshold] = useState<number>(1000);

  const [activePINActionType, setActivePINActionType] = useState<'credit_bypass' | 'void_item' | 'refund_sale' | 'price_override' | null>(null);

  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [searchInvoiceTerm, setSearchInvoiceTerm] = useState('');
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [recentInvoices, setRecentInvoices] = useState<any[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>({});
  const [refundMethod, setRefundMethod] = useState<string>('cash');
  const [returnReason, setReturnReason] = useState('Wrong size/item');
  const [customReturnReason, setCustomReturnReason] = useState('');
  const [isProcessingReturn, setIsProcessingReturn] = useState(false);

  // Line-item overrides and Global discounts state
  const [cartDiscountType, setCartDiscountType] = useState<'percent' | 'flat' | 'none'>('none');
  const [cartDiscountValue, setCartDiscountValue] = useState<number>(0);
  const [editCartDiscountType, setEditCartDiscountType] = useState<'percent' | 'flat' | 'none'>('none');
  const [editCartDiscountValue, setEditCartDiscountValue] = useState<string>('0');
  const [isCartDiscountModalOpen, setIsCartDiscountModalOpen] = useState(false);
  const [isItemOverrideModalOpen, setIsItemOverrideModalOpen] = useState(false);
  const [overrideItem, setOverrideItem] = useState<any | null>(null);
  const [overrideItemPrice, setOverrideItemPrice] = useState<string>('');
  const [overrideItemDiscountType, setOverrideItemDiscountType] = useState<'percent' | 'flat' | 'none'>('none');
  const [overrideItemDiscountValue, setOverrideItemDiscountValue] = useState<string>('0');
  const [overrideReason, setOverrideReason] = useState<string>('');

  // States for Numeric Keypad
  const [isNumericKeypadOpen, setIsNumericKeypadOpen] = useState<boolean>(false);
  const [numericKeypadMode, setNumericKeypadMode] = useState<'qty' | 'price'>('qty');
  const [numericKeypadItem, setNumericKeypadItem] = useState<any | null>(null);
  const [pendingPriceOverride, setPendingPriceOverride] = useState<{
    id: string;
    unit: string;
    price: number;
    reason: string;
  } | null>(null);

  // Pending sales for offline sync states
  const [pendingSales, setPendingSales] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);

  // Fetch held orders from Firestore in real-time
  const { data: firestoreHeldOrders } = useSharedCollection<any>(
    profile?.businessId ? `businesses/${profile.businessId}/heldOrders` : null
  );

  // Local fallback state for offline held orders
  const [offlineHeldOrders, setOfflineHeldOrders] = useState<any[]>([]);

  useEffect(() => {
    const loadOfflineCarts = () => {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          const saved = window.localStorage.getItem('pos_suspended_carts_offline');
          setOfflineHeldOrders(saved ? JSON.parse(saved) : []);
        }
      } catch (e) {
        console.warn("Could not read pos_suspended_carts_offline", e);
      }
    };
    loadOfflineCarts();
    window.addEventListener('storage', loadOfflineCarts);
    return () => window.removeEventListener('storage', loadOfflineCarts);
  }, []);

  // Combine real-time Firestore held orders and local offline held orders
  const suspendedCarts = React.useMemo(() => {
    const onlineCarts = firestoreHeldOrders
      ? firestoreHeldOrders.filter(sc => sc.status === 'held')
      : [];
    const combined = [...offlineHeldOrders];
    onlineCarts.forEach(sc => {
      if (!combined.some(item => item.id === sc.id)) {
        combined.push(sc);
      }
    });
    return combined.sort((a, b) => {
      const dateA = new Date(a.heldAt || a.createdAt || 0).getTime();
      const dateB = new Date(b.heldAt || b.createdAt || 0).getTime();
      return dateB - dateA;
    });
  }, [firestoreHeldOrders, offlineHeldOrders]);

  const [isSuspendedModalOpen, setIsSuspendedModalOpen] = useState(false);
  const [suspenseCartLabel, setSuspenseCartLabel] = useState('');
  const [isSuspenseLabelModalOpen, setIsSuspenseLabelModalOpen] = useState(false);

  // Helper function to render a denominations calculator
  const renderDenominationsCalc = (
    denoms: Record<string, number>,
    setDenoms: React.Dispatch<React.SetStateAction<Record<string, number>>>,
    onApply: (total: number) => void
  ) => {
    const values = [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1];
    const total = Object.entries(denoms).reduce((sum, [val, qty]) => sum + (Number(val) * (Number(qty) || 0)), 0);

    return (
      <div className="bg-[#FAF7F2] border border-[#E9E1D2] rounded-2xl p-4 space-y-3 font-sans mt-3">
        <div className="flex justify-between items-center pb-2 border-b border-[#E9E1D2]">
          <span className="text-[10px] font-black text-[#1D1510] uppercase tracking-wider flex items-center gap-1">
            💵 Calculadora de Notas & Moedas
          </span>
          <button
            type="button"
            onClick={() => {
              const cleared = { ...denoms };
              Object.keys(cleared).forEach(k => cleared[k] = 0);
              setDenoms(cleared);
            }}
            className="text-[10px] text-[#8B735F] hover:text-rose-500 font-bold transition-all cursor-pointer"
          >
            Limpar
          </button>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 max-h-[140px] overflow-y-auto pr-1">
          {values.map(val => {
            const qty = denoms[String(val)] || 0;
            return (
              <div key={val} className="flex items-center justify-between gap-1 border-b border-slate-100 pb-1 font-mono text-[11px]">
                <span className="font-bold text-[#8B735F] shrink-0 min-w-[50px]">{val} MT:</span>
                <div className="flex items-center gap-1 justify-end w-full">
                  <input
                    type="number"
                    min="0"
                    value={qty || ''}
                    onChange={(e) => {
                      const newQty = Math.max(0, parseInt(e.target.value) || 0);
                      setDenoms(prev => ({ ...prev, [String(val)]: newQty }));
                    }}
                    placeholder="0"
                    className="w-10 text-center py-0.5 bg-white border border-[#E9E1D2] rounded font-bold text-xs focus:outline-none text-[#1D1510]"
                  />
                  <span className="text-[9px] text-[#8B735F] font-bold w-[35px] text-right">
                    {(qty * val).toFixed(0)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between pt-1.5 border-t border-[#E9E1D2]">
          <div className="text-[10px] font-bold text-[#8B735F]">Total Calculado:</div>
          <div className="text-xs font-black text-[#B8791A] font-mono">{total.toFixed(1)} MT</div>
        </div>

        <button
          type="button"
          onClick={() => onApply(total)}
          className="w-full py-1.5 bg-[#1D1510] text-[#FCFAF6] rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer"
        >
          Confirmar e Aplicar Contagem
        </button>
      </div>
    );
  };

  // Customer Notes & Modals
  const [isQuickCustomerOpen, setIsQuickCustomerOpen] = useState(false);
  const [isBrowseCustomersOpen, setIsBrowseCustomersOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustAddress, setNewCustAddress] = useState('');
  const [newCustNif, setNewCustNif] = useState('');
  const [newCustNotes, setNewCustNotes] = useState('');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [clientPurchases, setClientPurchases] = useState<any[]>([]);

  // Sale Mode variables (for Partial option)
  const [saleMode, setSaleMode] = useState<'dinheiro' | 'credito' | 'parcial'>('dinheiro');
  const [partialAmountPaid, setPartialAmountPaid] = useState<string>('');

  const [preSaleBalance, setPreSaleBalance] = useState<number>(0);

  useEffect(() => {
    if (selectedCust) {
      setPreSaleBalance(selectedCust.outstandingBalance || 0);
    } else {
      setPreSaleBalance(0);
    }
  }, [selectedCustomerId]);

  // Credit Limit & Loyalty states
  const [redeemedPoints, setRedeemedPoints] = useState<number>(0);
  const [isCreditLimitBypassed, setIsCreditLimitBypassed] = useState<boolean>(false);
  const [isCreditLimitModalOpen, setIsCreditLimitModalOpen] = useState<boolean>(false);
  const [isManagerPINOpen, setIsManagerPINOpen] = useState<boolean>(false);
  const [managerPINAction, setManagerPINAction] = useState<string>('Superar Limite de Crédito');

  // Camera settings
  const [cameras, setCameras] = useState<any[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [detectionBanner, setDetectionBanner] = useState<string | null>(null);

  // Success Modal
  const [completedSale, setCompletedSale] = useState<any>(null);

  // Refs
  const searchInputRef = useRef<HTMLInputElement>(null);
  const cameraControlsRef = useRef<any>(null);
  const barcodeBufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);

  // Dynamic Payment Methods list
  const getActivePOSMethods = (): PaymentMethodConfig[] => {
    const country = businessData?.regionalSettings?.country || businessData?.country || 'Moçambique';
    return getCountryPaymentMethods(country);
  };

  const paymentMethodsList = [
    { id: 'cash', label: 'Numerário', icon: '💵' },
    { id: 'mpesa', label: 'M-Pesa', icon: '📱' },
    { id: 'emola', label: 'e-Mola', icon: '📲' },
    { id: 'bank', label: 'Banco/Transf.', icon: '🏦' },
    { id: 'card', label: 'Cartão POS', icon: '💳' },
  ];

  // Reset credit limit bypass and loyalty points when customer, sale mode or cart changes
  useEffect(() => {
    setIsCreditLimitBypassed(false);
  }, [selectedCustomerId, saleMode, cart.length]);

  useEffect(() => {
    setRedeemedPoints(0);
  }, [selectedCustomerId]);

  // System status listeners (Firestore + Network)
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check
    setIsOnline(navigator.onLine);

    // Firestore connection status check
    let unsubConnection: (() => void) | undefined;
    if (profile?.businessId) {
      try {
        unsubConnection = onSnapshot(
          doc(db, `businesses/${profile.businessId}/products`),
          { includeMetadataChanges: true },
          (snapshot) => {
            if (!snapshot.metadata.fromCache && navigator.onLine) {
              setIsOnline(true);
            }
          },
          () => {}
        );
      } catch (err) {
        console.warn("Could not start Firestore connection listener:", err);
      }
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (unsubConnection) unsubConnection();
    };
  }, [profile?.businessId]);

  // Sync / Fetch Collections
  useEffect(() => {
    if (!profile?.businessId) return;

    // Load indexedDb Products cache for offline robustness
    offlineDb.getProducts().then((cached) => {
      if (cached && cached.length > 0 && loading) {
        setProducts(cached);
        setLoading(false);
      }
    }).catch(err => console.warn("Cache load warning:", err));

    // Load indexedDb Pending Sales cache
    offlineDb.getPendingSales().then((cachedSales) => {
      setPendingSales(cachedSales || []);
    }).catch(err => console.warn("Pending sales cache load warning:", err));

    // Products snapshot
    const qProducts = query(collection(db, `businesses/${profile.businessId}/products`));
    const unsubProducts = subscribeToCollection(
      `businesses/${profile.businessId}/products`,
      (items) => {
        setProducts(items);
        setLoading(false);
        offlineDb.saveProducts(items).catch(err => console.warn("Cache save warning:", err));
      },
      qProducts,
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, `businesses/${profile.businessId}/products`);
        } catch (e) {
          console.warn("Gracefully logged POS products query error:", e);
        }
      }
    );

    // Customers snapshot
    const unsubCustomers = subscribeToCollection(
      `businesses/${profile.businessId}/customers`,
      (items) => {
        setCustomers(items);
      },
      undefined,
      (error) => console.warn("Firebase customers warning:", error)
    );

    // Cashier shifts snapshot (matching currently active cashier's open shift)
    const unsubShifts = subscribeToCollection(
      `businesses/${profile.businessId}/pos_shifts`,
      (items) => {
        const activeShift = items.find((s: any) => s.cashierId === profile.uid && !s.closedAt);
        setCurrentShift(activeShift || null);
        setLoadingShift(false);
      },
      undefined,
      (error) => {
        console.warn("Shift retrieval warning:", error);
        setLoadingShift(false);
      }
    );

    return () => {
      unsubProducts();
      unsubCustomers();
      unsubShifts();
    };
  }, [profile?.businessId, profile?.uid]);

  // Trigger sync automatically when online status changes to true
  useEffect(() => {
    if (isOnline && profile?.businessId) {
      syncPendingSales();
      syncHeldOrders();
    }
  }, [isOnline, profile?.businessId]);

  const syncPendingSales = async () => {
    if (isSyncing) return;
    try {
      const sales = await offlineDb.getPendingSales();
      const pendingToSync = sales.filter(s => s.status === 'pending');
      
      if (pendingToSync.length === 0) return;
      
      setIsSyncing(true);
      toast.info(`Sincronizando ${pendingToSync.length} venda(s) pendente(s)...`);
      
      let successCount = 0;
      let failureCount = 0;

      for (const sale of pendingToSync) {
        try {
          // Use the stock-conflict-safe transaction logic
          await runTransaction(db, async (transaction) => {
            const productRefsAndData = [];
            const insufficientProducts = [];

            // 1. Read and validate stock inside transaction
            for (const item of sale.invoiceData.items) {
              const prodRef = doc(db, `businesses/${sale.businessId}/products`, item.id);
              const prodDoc = await transaction.get(prodRef);
              if (!prodDoc.exists()) {
                throw new Error(`Produto não encontrado: ${item.name}`);
              }
              const currentData = prodDoc.data();
              
              let multiplier = 1;
              if (item.selectedUnit === 'un') {
                multiplier = 1;
              } else if (currentData.unitCx === item.selectedUnit || isBoxUnit(currentData, item.selectedUnit)) {
                multiplier = Number(currentData.boxQty || 1);
              } else if (currentData.unitEmb === item.selectedUnit || isPackUnit(currentData, item.selectedUnit)) {
                multiplier = Number(currentData.packQty || 1);
              }

              const qtyToDeduct = item.quantity * multiplier;
              const stockLevel = currentData.stockLevel !== undefined ? currentData.stockLevel : 0;

              if (stockLevel < qtyToDeduct) {
                const availableInSelectedUnit = stockLevel > 0 ? Number((stockLevel / multiplier).toFixed(4)) : 0;
                insufficientProducts.push({
                  id: item.id,
                  name: item.name,
                  requested: item.quantity,
                  available: availableInSelectedUnit,
                  selectedUnit: item.selectedUnit || 'un'
                });
              } else {
                productRefsAndData.push({
                  ref: prodRef,
                  data: currentData,
                  qtyToDeduct,
                  item,
                  multiplier
                });
              }
            }

            if (insufficientProducts.length > 0) {
              throw {
                code: 'insufficient_stock',
                insufficient: insufficientProducts
              };
            }

            // 2. Fetch Shift
            const shiftRef = doc(db, `businesses/${sale.businessId}/pos_shifts`, sale.shiftId);
            const shiftDoc = await transaction.get(shiftRef);
            if (!shiftDoc.exists()) {
              throw new Error("Turno activo não encontrado no servidor.");
            }
            const shiftData = shiftDoc.data();

            // 3. Fetch Customer if applicable
            let custRef = null;
            let customerDoc = null;
            if (sale.invoiceData.customerId && sale.invoiceData.customerId !== 'Walk-in') {
              custRef = doc(db, `businesses/${sale.businessId}/customers`, sale.invoiceData.customerId);
              customerDoc = await transaction.get(custRef);
            }

            // 4. Create invoice document
            const invoiceDocRef = doc(db, `businesses/${sale.businessId}/invoices`, sale.id);
            const { isOffline, paymentBreakdown, redeemedPoints, ...sanitizedInvoiceData } = sale.invoiceData;
            transaction.set(invoiceDocRef, {
              ...sanitizedInvoiceData,
              id: sale.id,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });

            // 5. Update stock levels
            for (const { ref, data, qtyToDeduct, item } of productRefsAndData) {
              const updatedStockLevel = (data.stockLevel || 0) - qtyToDeduct;
              const updates: any = {
                stockLevel: updatedStockLevel,
                salesCount: (data.salesCount || 0) + item.quantity
              };

              if (isBoxUnit(data, item.selectedUnit)) {
                updates.stockCx = (data.stockCx || 0) - item.quantity;
              } else if (isPackUnit(data, item.selectedUnit)) {
                updates.stockEmb = (data.stockEmb || 0) - item.quantity;
              } else {
                updates.stockUn = (data.stockUn || 0) - item.quantity;
              }

              transaction.update(ref, updates);
            }

            // 6. Update shift summaries
            const pb = shiftData.paymentBreakdown || {};
            const finalCash = paymentBreakdown?.cash ?? 0;
            const finalMpesa = paymentBreakdown?.mpesa ?? 0;
            const finalEmola = paymentBreakdown?.emola ?? 0;
            const finalBank = paymentBreakdown?.bank ?? 0;
            const finalCard = paymentBreakdown?.card ?? 0;
            const finalCredit = paymentBreakdown?.credit ?? 0;

            transaction.update(shiftRef, {
              totalSales: (shiftData.totalSales || 0) + sale.invoiceData.total,
              transactionCount: (shiftData.transactionCount || 0) + 1,
              "paymentBreakdown.cash": (pb.cash || 0) + finalCash,
              "paymentBreakdown.mpesa": (pb.mpesa || 0) + finalMpesa,
              "paymentBreakdown.emola": (pb.emola || 0) + finalEmola,
              "paymentBreakdown.bank": (pb.bank || 0) + finalBank,
              "paymentBreakdown.card": (pb.card || 0) + finalCard,
              "paymentBreakdown.credit": (pb.credit || 0) + finalCredit
            });

            // 7. Update customer finances
            if (custRef && customerDoc) {
              const custData = customerDoc.data();
              const pointsEarned = Math.floor((sale.invoiceData.total - finalCredit) / 100);
              const updates: any = {
                outstandingBalance: (custData.outstandingBalance || 0) + finalCredit,
                totalSpent: (custData.totalSpent || 0) + (sale.invoiceData.total - finalCredit),
                lastPurchaseDate: new Date().toISOString()
              };
              const redPoints = redeemedPoints || 0;
              if (redPoints > 0 || pointsEarned > 0) {
                updates.loyaltyPoints = (custData.loyaltyPoints || 0) - redPoints + pointsEarned;
              }
              transaction.update(custRef, updates);
            }
          });

          // Successfully synced: remove from local IndexedDB queue
          await offlineDb.deletePendingSale(sale.id);
          successCount++;
        } catch (err: any) {
          console.error(`Error syncing sale ${sale.id}:`, err);
          failureCount++;
          
          if (err && err.code === 'insufficient_stock') {
            const insufficient = err.insufficient || [];
            const conflictNames = insufficient.map((p: any) => `${p.name}: apenas ${p.available} ${p.selectedUnit} disponíveis`).join(', ');
            
            // Mark as failed and needs review
            const updatedSale = {
              ...sale,
              status: 'failed',
              errorMessage: `Conflito de stock: ${conflictNames}`,
              insufficientStockDetails: insufficient
            };
            await offlineDb.savePendingSale(updatedSale);
          } else {
            // General failure
            const updatedSale = {
              ...sale,
              status: 'failed',
              errorMessage: err.message || String(err)
            };
            await offlineDb.savePendingSale(updatedSale);
          }
        }
      }

      // Refresh the local state queue from IndexedDB
      const refreshedQueue = await offlineDb.getPendingSales();
      setPendingSales(refreshedQueue);

      if (successCount > 0) {
        toast.success(`${successCount} venda(s) sincronizada(s) com sucesso!`);
      }
      if (failureCount > 0) {
        toast.error(`${failureCount} venda(s) falhou/falharam na sincronização. Verifique o painel de revisão.`);
      }
    } catch (e: any) {
      console.error("Sync error:", e);
      toast.error("Erro ao sincronizar: " + e.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const syncHeldOrders = async () => {
    if (!profile?.businessId) return;
    try {
      const savedFallback = window.localStorage.getItem('pos_suspended_carts_offline');
      if (!savedFallback) return;
      const fallbackList = JSON.parse(savedFallback);
      if (fallbackList.length === 0) return;

      toast.info(`A sincronizar ${fallbackList.length} venda(s) em espera...`);
      const { doc, setDoc } = await import('firebase/firestore');

      for (const sc of fallbackList) {
        const orderRef = doc(db, `businesses/${profile.businessId}/heldOrders`, sc.id);
        await setDoc(orderRef, { ...sc, status: "held" });
      }

      window.localStorage.removeItem('pos_suspended_carts_offline');
      setOfflineHeldOrders([]);
      toast.success("Vendas em espera offline sincronizadas com sucesso!");
    } catch (e) {
      console.error("Error syncing held orders:", e);
    }
  };

  // Handle selected customer purchase history & offline loading
  useEffect(() => {
    if (selectedCustomerId && selectedCustomerId !== 'Walk-in' && profile?.businessId) {
      const fetchHistory = async () => {
        try {
          const qPurchases = query(
            collection(db, `businesses/${profile.businessId}/customers/${selectedCustomerId}/purchases`)
          );
          const snap = await getDocs(qPurchases);
          const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          list.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
          setClientPurchases(list.slice(0, 3));
        } catch (e) {
          console.warn("Could not load history details:", e);
        }
      };
      fetchHistory();
    } else {
      setClientPurchases([]);
    }
  }, [selectedCustomerId, profile?.businessId]);

  // Persist cart client-side
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('pos_cart', JSON.stringify(cart));
      }
    } catch (e) {
      console.warn("Local storage write exception:", e);
    }
  }, [cart]);

  // Hardware scanner bluetooth/USB input keyboard listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isShiftModalOpen || isCatalogOpen || isQuickCustomerOpen || isBrowseCustomersOpen) {
        return;
      }
      if (!currentShift) return;

      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTimeRef.current;
      lastKeyTimeRef.current = currentTime;

      if (e.key === 'Enter') {
        if (barcodeBufferRef.current.length >= 3) {
          const matched = matchProductByBarcodeOrSku(barcodeBufferRef.current.trim());
          if (matched) {
            addToCart(matched);
            playSuccessBeep();
            toast.success(`Scaneado: ${matched.name}`);
          } else {
            toast.error(`Código de barras desconhecido: "${barcodeBufferRef.current}"`);
          }
          barcodeBufferRef.current = '';
        }
      } else {
        if (timeDiff > 50) {
          barcodeBufferRef.current = '';
        }
        if (e.key.length === 1) {
          barcodeBufferRef.current += e.key;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [products, currentShift]);

  // Camera devices handling
  useEffect(() => {
    if (!isCameraActive) {
      setCameras([]);
      return;
    }

    const loadCameras = async () => {
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        if (devices && devices.length > 0) {
          setCameras(devices);
          const backCam = devices.find(d => 
            d.label.toLowerCase().includes('back') || 
            d.label.toLowerCase().includes('traseira') || 
            d.label.toLowerCase().includes('rear') || 
            d.label.toLowerCase().includes('environment')
          );
          setSelectedCameraId(backCam ? backCam.deviceId : devices[0].deviceId);
        } else {
          toast.error("Sem câmaras localizadas.");
          setIsCameraActive(false);
        }
      } catch (err) {
        console.warn("Câmara carregamento exceção:", err);
      }
    };
    loadCameras();
  }, [isCameraActive]);

  // Video Frame Scanner active monitoring
  useEffect(() => {
    let active = true;
    if (!isCameraActive) {
      if (cameraControlsRef.current) {
        try { cameraControlsRef.current.stop(); } catch (e) {}
        cameraControlsRef.current = null;
      }
      return;
    }

    const delayTimer = setTimeout(async () => {
      if (!active) return;
      try {
        const formats = [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.QR_CODE,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39
        ];
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, formats);

        const reader = new BrowserMultiFormatReader(hints);
        const video = document.getElementById('scanner-preview') as HTMLVideoElement;

        if (!video) return;

        if (cameraControlsRef.current) {
          try { cameraControlsRef.current.stop(); } catch (e) {}
        }

        const controls = await reader.decodeFromVideoDevice(
          selectedCameraId || undefined,
          video,
          (result) => {
            if (!active) return;
            if (result) {
              const text = result.getText();
              const matched = matchProductByBarcodeOrSku(text);
              if (matched) {
                addToCart(matched);
                playSuccessBeep();
                setDetectionBanner(`Encontrado: ${matched.name}!`);
                setTimeout(() => setDetectionBanner(null), 1500);
                
                // Auto close viewfinder 2s after successful scan
                setTimeout(() => {
                  setIsCameraActive(false);
                }, 2000);
              } else {
                setDetectionBanner(`Lido: ${text} (Não localizado)`);
                setTimeout(() => setDetectionBanner(null), 1800);
              }
            }
          }
        );
        cameraControlsRef.current = controls;
      } catch (err) {
        console.error("Viewfinder start error:", err);
        setIsCameraActive(false);
        toast.error("Erro ao conectar à câmara. Verifique as permissões de multimédia.");
      }
    }, 400);

    return () => {
      active = false;
      clearTimeout(delayTimer);
      if (cameraControlsRef.current) {
        try { cameraControlsRef.current.stop(); } catch (e) {}
        cameraControlsRef.current = null;
      }
    };
  }, [isCameraActive, selectedCameraId]);

  // Audio scanning notifier
  const playSuccessBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // high A tone
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.08);
    } catch (e) {
      console.warn("Audio exception blocked:", e);
    }
  };

  const matchProductByBarcodeOrSku = (code: string) => {
    const term = code.toLowerCase().trim();
    return products.find(p => 
      (p.barcode?.toLowerCase() === term) || 
      (p.sku?.toLowerCase() === term)
    );
  };

  // Dynamic Unit of Measure Helpers to support custom units like 'Saco', 'Kg', etc.
  const isBoxUnit = (item: any, unit: string): boolean => {
    if (!unit) return false;
    const u = unit.toLowerCase().trim();
    const boxLbl = (item.boxUnitLabel || '').toLowerCase().trim();
    return u === 'box' || u === 'cx' || u === 'saco' || u === 'sac' || (boxLbl && u === boxLbl);
  };

  const isPackUnit = (item: any, unit: string): boolean => {
    if (!unit) return false;
    const u = unit.toLowerCase().trim();
    const packLbl = (item.packUnitLabel || '').toLowerCase().trim();
    return u === 'pack' || u === 'emb' || u === 'v' || u === 'volume' || (packLbl && u === packLbl);
  };

  const getUnitMultiplier = (item: any, unit: string): number => {
    if (isBoxUnit(item, unit)) {
      return Number(item.boxUnitQty || 10);
    }
    if (isPackUnit(item, unit)) {
      return Number(item.packUnitQty || 100);
    }
    return 1;
  };

  // Pricing module matching specification
  const getCartItemPricing = (item: any) => {
    let normalUnitRetail = Number(item.basePrice || item.price || 0);

    if (isBoxUnit(item, item.selectedUnit)) {
      const boxQty = Number(item.boxUnitQty || 10);
      normalUnitRetail = Number(item.boxUnitPrice) || (Number(item.basePrice || item.price || 0) * boxQty);
    } else if (isPackUnit(item, item.selectedUnit)) {
      const packQty = Number(item.packUnitQty || 100);
      normalUnitRetail = Number(item.packUnitPrice) || (Number(item.basePrice || item.price || 0) * packQty);
    }

    let finalPrice = normalUnitRetail;
    let savingsType: 'promo' | 'wholesale' | 'tier' | 'none' = 'none';

    // If there is an operator override price on this item for the selected unit, respect it above all!
    if (item.overridePrice !== undefined && item.overridePrice !== null) {
      finalPrice = Number(item.overridePrice);
      normalUnitRetail = Number(item.overridePrice);
      savingsType = 'none';
    } else {
      // Promotion validation
      const today = new Date().toISOString().split('T')[0];
      const isPromoActive = item.promotionActive &&
                            item.promotionPrice &&
                            (!item.promotionValidUntil || today <= item.promotionValidUntil);

      if (isPromoActive) {
        finalPrice = Number(item.promotionPrice);
        savingsType = 'promo';
      } else {
        const isBoxOrPack = isBoxUnit(item, item.selectedUnit) || isPackUnit(item, item.selectedUnit);
        if (isBoxOrPack) {
          if (item.allowWholesale) {
            const tiers = item.tieredPrices || [];
            const matchedTier = tiers
              .filter((t: any) => Number(item.quantity) >= Number(t.minQty))
              .sort((a: any, b: any) => Number(b.minQty) - Number(a.minQty))[0];

            if (matchedTier && Number(matchedTier.price) > 0) {
              finalPrice = Number(matchedTier.price);
              savingsType = 'tier';
            } else if (saleType === 'wholesale') {
              const multi = getUnitMultiplier(item, item.selectedUnit);
              if (item.wholesalePrice && Number(item.wholesalePrice) > 0) {
                finalPrice = Number(item.wholesalePrice) * multi;
                savingsType = 'wholesale';
              }
            }
          }
        } else {
          // unit 'un' gets unitDiscountTiers matching qty
          const unitTiers = item.unitDiscountTiers || [];
          const matchedUTier = unitTiers
            .filter((t: any) => Number(item.quantity) >= Number(t.minQty))
            .sort((a: any, b: any) => Number(b.minQty) - Number(a.minQty))[0];

          if (matchedUTier) {
            const val = Number(matchedUTier.discountVal) || 0;
            if (matchedUTier.discountType === 'percent') {
              finalPrice = normalUnitRetail * (1 - val / 100);
            } else {
              finalPrice = Math.max(0, normalUnitRetail - val);
            }
            savingsType = 'tier';
          }
        }
      }
    }

    // Apply manual item discount if defined
    if (item.manualDiscountType === 'percent' && item.manualDiscountValue > 0) {
      finalPrice = finalPrice * (1 - Number(item.manualDiscountValue) / 100);
      savingsType = 'none';
    } else if (item.manualDiscountType === 'flat' && item.manualDiscountValue > 0) {
      finalPrice = Math.max(0, finalPrice - Number(item.manualDiscountValue));
      savingsType = 'none';
    }

    const discountValue = normalUnitRetail - finalPrice;
    const discountPct = normalUnitRetail > 0 ? Math.round((discountValue / normalUnitRetail) * 100) : 0;

    return {
      normalRetailPrice: normalUnitRetail,
      finalUnitPrice: finalPrice,
      discountValue,
      discountPct,
      savingsType,
      total: finalPrice * (item.quantity || 1)
    };
  };

  // Modify cart channels & force price recomputations instantly
  const handleToggleSaleType = (type: 'retail' | 'wholesale') => {
    setSaleType(type);
    toast.success(`Faturando em Canal: ${type === 'retail' ? 'Retalho' : 'Grosso'}`);
  };

  // Resolve default unit from database properties
  const resolveDefaultUnit = (product: any): string => {
    if (product.baseUnitLabel) {
      const lbl = product.baseUnitLabel.trim().toUpperCase();
      const validUnits = ['CX', 'EMB', 'UN', 'KG', 'G', 'SAC', 'V'];
      if (validUnits.includes(lbl)) {
        if (lbl === 'UN') return 'Un';
        if (lbl === 'CX') return 'Cx';
        if (lbl === 'EMB') return 'Emb';
        if (lbl === 'KG') return 'Kg';
        if (lbl === 'G') return 'G';
        if (lbl === 'SAC') return 'Sac';
        if (lbl === 'V') return 'V';
      }
      if (lbl === 'UNIDADE' || lbl === 'UNIDADES') return 'Un';
      if (lbl === 'QUILOGRAMA' || lbl === 'KILO') return 'Kg';
      if (lbl === 'GRAMA') return 'G';
      if (lbl === 'CAIXA' || lbl === 'BOX') return 'Cx';
      if (lbl === 'EMBALAGEM' || lbl === 'PACK') return 'Emb';
      if (lbl === 'SACO') return 'Sac';
      if (lbl === 'VOLUME') return 'V';
    }
    return 'Un';
  };

  const addToCart = (product: any, unit?: string) => {
    setActiveCartTab('items');
    const resolvedUnit = unit || resolveDefaultUnit(product);
    const resolvedMulti = getUnitMultiplier(product, resolvedUnit);

    setCart(prev => {
      const existingIdx = prev.findIndex(item => item.id === product.id && item.selectedUnit === resolvedUnit);
      const limitStock = Number(product.stockLevel || 0);

      if (existingIdx !== -1) {
        const item = prev[existingIdx];
        const newQty = item.quantity + 1;
        const totalUnits = newQty * resolvedMulti;
        
        if (totalUnits > limitStock) {
          toast.error(`Stock indisponível! Restam apenas ${limitStock} unidades.`);
          return prev;
        }

        const updated = [...prev];
        updated[existingIdx] = { ...item, quantity: newQty };
        return updated;
      } else {
        const totalUnits = 1 * resolvedMulti;
        if (totalUnits > limitStock) {
          toast.error(`Stock indisponível! Restam apenas ${limitStock} unidades.`);
          return prev;
        }
        return [...prev, {
          ...product,
          quantity: 1,
          selectedUnit: resolvedUnit,
          basePrice: product.price,
          unitMultiplier: resolvedMulti
        }];
      }
    });
  };

  const updateCartQuantity = (id: string, unit: string, qty: number, allowZero = false) => {
    if (qty < 0) return;
    if (qty === 0 && !allowZero) {
      handleRemoveClick(id, unit);
      return;
    }
    setCart(prev => {
      const idx = prev.findIndex(item => item.id === id && item.selectedUnit === unit);
      if (idx === -1) return prev;
      const item = prev[idx];
      const multi = getUnitMultiplier(item, unit);
      const totalUnitsNeeded = qty * multi;
      const limitStock = Number(item.stockLevel || 0);

      if (totalUnitsNeeded > limitStock) {
        toast.error(`Stock insuficiente! Restam apenas ${limitStock} unidades.`);
        return prev;
      }

      const updated = [...prev];
      updated[idx] = { 
        ...item, 
        quantity: qty,
        hasStockConflict: false,
        availableStock: undefined
      };
      return updated;
    });
  };

  const updateCartUnit = (id: string, currentUnit: string, targetUnit: string) => {
    setCart(prev => {
      const idx = prev.findIndex(item => item.id === id && item.selectedUnit === currentUnit);
      if (idx === -1) return prev;
      const item = prev[idx];
      const multi = getUnitMultiplier(item, targetUnit);
      const totalUnitsNeeded = item.quantity * multi;
      
      if (totalUnitsNeeded > Number(item.stockLevel || 0)) {
        toast.error(`Erro: Stock insuficiente para trocar o tipo de entrega (${targetUnit.toUpperCase()})`);
        return prev;
      }

      const updated = prev.filter((_, i) => i !== idx);
      const existingMatchIdx = updated.findIndex(u => u.id === id && u.selectedUnit === targetUnit);

      if (existingMatchIdx !== -1) {
        updated[existingMatchIdx] = {
          ...updated[existingMatchIdx],
          quantity: updated[existingMatchIdx].quantity + item.quantity,
          hasStockConflict: false,
          availableStock: undefined
        };
      } else {
        updated.push({
          ...item,
          selectedUnit: targetUnit,
          unitMultiplier: multi,
          hasStockConflict: false,
          availableStock: undefined
        });
      }
      return updated;
    });
  };

  const updateCartItemOverride = (id: string, unit: string, price: number | null, discountType: 'percent' | 'flat' | 'none', discountValue: number, reason: string) => {
    setCart(prev => {
      const idx = prev.findIndex(item => item.id === id && item.selectedUnit === unit);
      if (idx === -1) return prev;
      const updated = [...prev];
      const item = updated[idx];
      
      const oldPrices = getCartItemPricing(item);
      const currentTotalMoney = oldPrices.total;
      
      updated[idx] = { 
        ...updated[idx], 
        overridePrice: price !== null && price >= 0 ? price : undefined,
        manualDiscountType: discountType,
        manualDiscountValue: discountValue
      };
      
      const newPrices = getCartItemPricing(updated[idx]);
      
      // Keep money total conserved if price and totals are defined/active (only if not discounting)
      if (currentTotalMoney > 0 && price !== null && price > 0 && discountType === 'none') {
        updated[idx].quantity = Number((currentTotalMoney / price).toFixed(4));
      }

      // Log Price Override Compliance Event
      if (profile?.businessId && price !== null && price !== oldPrices.normalRetailPrice) {
        logAuditEvent({
          businessId: profile.businessId,
          eventType: 'price_override',
          performedBy: {
            uid: profile.uid || '',
            name: profile.displayName || profile.email || 'Utilizador',
            email: profile.email || '',
          },
          originalValue: oldPrices.normalRetailPrice,
          newValue: price,
          reason: reason || 'Preço alterado manualmente',
          cartSessionId: cartSessionId,
          details: {
            itemId: item.id,
            itemName: item.name,
            unit: unit,
            quantity: item.quantity
          }
        }).catch(e => console.error("Error logging price override event:", e));
      }

      // Log Manual Discount Compliance Event
      if (profile?.businessId && discountType !== 'none' && discountValue > 0) {
        logAuditEvent({
          businessId: profile.businessId,
          eventType: 'discount_applied',
          performedBy: {
            uid: profile.uid || '',
            name: profile.displayName || profile.email || 'Utilizador',
            email: profile.email || '',
          },
          originalValue: oldPrices.finalUnitPrice,
          newValue: newPrices.finalUnitPrice,
          reason: reason || 'Desconto manual aplicado no artigo',
          cartSessionId: cartSessionId,
          details: {
            itemId: item.id,
            itemName: item.name,
            unit: unit,
            discountType,
            discountValue,
            quantity: item.quantity
          }
        }).catch(e => console.error("Error logging discount event:", e));
      }

      return updated;
    });
  };

  const handleNumericKeypadConfirm = (value: number) => {
    if (!numericKeypadItem) return;
    
    if (numericKeypadMode === 'qty') {
      updateCartQuantity(numericKeypadItem.id, numericKeypadItem.selectedUnit, value, true);
      toast.success(`Quantidade atualizada para ${value} ${numericKeypadItem.selectedUnit || ''}`);
      setIsNumericKeypadOpen(false);
      setNumericKeypadItem(null);
    } else if (numericKeypadMode === 'price') {
      const item = numericKeypadItem;
      const prices = getCartItemPricing(item);
      const originalPrice = prices.normalRetailPrice;
      
      // Calculate total discount being given
      const discountAmount = (originalPrice - value) * item.quantity;
      
      // Check if it requires a manager PIN (e.g. if the discount amount is above voidPinThreshold)
      const requiresManagerPin = discountAmount > voidPinThreshold;
      
      if (requiresManagerPin) {
        setManagerPINAction(`Autorizar Desconto (${discountAmount.toFixed(0)} MT)`);
        setActivePINActionType('price_override');
        setPendingPriceOverride({
          id: item.id,
          unit: item.selectedUnit,
          price: value,
          reason: `Desconto de ${discountAmount.toFixed(0)} MT (Preço de ${originalPrice} para ${value})`
        });
        setIsNumericKeypadOpen(false); // Close keypad first
        setIsManagerPINOpen(true);     // Open PIN modal
      } else {
        // Apply directly
        updateCartItemOverride(item.id, item.selectedUnit, value, 'none', 0, 'Ajuste de preço via Teclado');
        toast.success("Preço unitário alterado com sucesso!");
        setIsNumericKeypadOpen(false);
        setNumericKeypadItem(null);
      }
    }
  };

  const updateCartItemTiers = (id: string, unit: string, type: 'tieredPrices' | 'unitDiscountTiers', tiers: any[]) => {
    setCart(prev => {
      const idx = prev.findIndex(item => item.id === id && item.selectedUnit === unit);
      if (idx === -1) return prev;
      const updated = [...prev];
      updated[idx] = {
        ...updated[idx],
        [type]: tiers
      };
      return updated;
    });
  };

  const toggleCartItemWholesale = (id: string, unit: string, value: boolean) => {
    setCart(prev => {
      const idx = prev.findIndex(item => item.id === id && item.selectedUnit === unit);
      if (idx === -1) return prev;
      const updated = [...prev];
      updated[idx] = {
        ...updated[idx],
        allowWholesale: value
      };
      return updated;
    });
  };

  const handleRemoveClick = (id: string, unit: string) => {
    const item = cart.find(i => i.id === id && i.selectedUnit === unit);
    if (!item) return;
    setVoidItem(item);
    setVoidReason('Wrong item');
    setCustomVoidReason('');
    setIsVoidReasonModalOpen(true);
  };

  const removeFromCart = (id: string, unit: string) => {
    setCart(prev => prev.filter(item => !(item.id === id && item.selectedUnit === unit)));
    toast.info("Item removido do carrinho");
  };

  const clearCart = () => {
    setCart([]);
    setSearchTerm('');
    setPartialAmountPaid('');
    setRedeemedPoints(0);
    setCartSessionId('cart_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 7));
    toast.success("Carrinho apagado com sucesso.");
  };

  const handleSuspendCurrentCart = async (label: string) => {
    if (cart.length === 0) {
      toast.error("O carrinho está vazio.");
      return;
    }

    const cleanLabel = label.trim() || `Cliente #${suspendedCarts.length + 1}`;
    const heldOrderId = `sc-${Date.now()}`;
    const newSuspended = {
      id: heldOrderId,
      label: cleanLabel,
      cartSnapshot: cart.map(item => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        selectedUnit: item.selectedUnit,
        basePrice: item.basePrice || item.price,
        unitMultiplier: item.unitMultiplier || 1,
        ...item
      })),
      items: cart, // Keep items for backward compatibility
      heldBy: profile?.uid || auth.currentUser?.uid || 'unknown',
      heldAt: new Date().toISOString(),
      status: "held",
      selectedCustomerId,
      saleType,
      paymentMethod,
      taxRate,
      saleMode,
      partialAmountPaid,
      createdAt: new Date().toISOString()
    };

    let savedLocally = false;

    if (profile?.businessId) {
      if (isOnline) {
        try {
          const { doc, setDoc } = await import('firebase/firestore');
          const orderRef = doc(db, `businesses/${profile.businessId}/heldOrders`, heldOrderId);
          await setDoc(orderRef, newSuspended);
          toast.success(`Carrinho "${cleanLabel}" colocado em espera na nuvem.`);
        } catch (error) {
          console.warn("Firestore write for held order failed, falling back to localStorage", error);
          savedLocally = true;
        }
      } else {
        savedLocally = true;
      }
    } else {
      savedLocally = true;
    }

    if (savedLocally) {
      try {
        const saved = window.localStorage.getItem('pos_suspended_carts_offline') || '[]';
        const fallbackList = JSON.parse(saved);
        fallbackList.push(newSuspended);
        window.localStorage.setItem('pos_suspended_carts_offline', JSON.stringify(fallbackList));
        setOfflineHeldOrders(fallbackList);
        toast.info(`Carrinho "${cleanLabel}" colocado em espera offline.`);
      } catch (e) {
        console.error("Could not save to offline fallback", e);
        toast.error("Erro ao salvar carrinho localmente.");
      }
    }

    // Reset Cart and state
    setCart([]);
    setSearchTerm('');
    setPartialAmountPaid('');
    setIsSuspenseLabelModalOpen(false);
    setSuspenseCartLabel('');
  };

  const handleRetrieveSuspendedCart = async (sc: any) => {
    // If cart has items, prompt the user
    if (cart.length > 0) {
      const confirmReplace = window.confirm("Existem artigos no carrinho atual. Pretende substituí-los pela venda colocada em espera?");
      if (!confirmReplace) return;
    }

    setCart(sc.cartSnapshot || sc.items || []);
    if (sc.selectedCustomerId) setSelectedCustomerId(sc.selectedCustomerId);
    if (sc.saleType) setSaleType(sc.saleType);
    if (sc.paymentMethod) setPaymentMethod(sc.paymentMethod);
    if (sc.taxRate !== undefined) setTaxRate(sc.taxRate);
    if (sc.saleMode) setSaleMode(sc.saleMode);
    if (sc.partialAmountPaid !== undefined) setPartialAmountPaid(sc.partialAmountPaid);

    // Remove from Firestore
    if (profile?.businessId) {
      try {
        const { doc, deleteDoc } = await import('firebase/firestore');
        const orderRef = doc(db, `businesses/${profile.businessId}/heldOrders`, sc.id);
        await deleteDoc(orderRef);
      } catch (err) {
        console.warn("Could not delete held order from Firestore, maybe already deleted or offline:", err);
      }
    }

    // Remove from offline list if present
    try {
      const saved = window.localStorage.getItem('pos_suspended_carts_offline');
      if (saved) {
        const list = JSON.parse(saved);
        const filtered = list.filter((item: any) => item.id !== sc.id);
        window.localStorage.setItem('pos_suspended_carts_offline', JSON.stringify(filtered));
        setOfflineHeldOrders(filtered);
      }
    } catch (e) {
      console.warn("Failed to remove from offline list:", e);
    }

    setIsSuspendedModalOpen(false);
    toast.success(`Venda "${sc.label}" recuperada com sucesso!`);
  };

  const handleDeleteSuspendedCart = async (scId: string, label: string) => {
    if (!window.confirm(`Deseja realmente eliminar a venda em espera "${label}"?`)) return;

    // Delete from Firestore
    if (profile?.businessId) {
      try {
        const { doc, deleteDoc } = await import('firebase/firestore');
        const orderRef = doc(db, `businesses/${profile.businessId}/heldOrders`, scId);
        await deleteDoc(orderRef);
      } catch (err) {
        console.warn("Could not delete held order from Firestore:", err);
      }
    }

    // Remove from offline list if present
    try {
      const saved = window.localStorage.getItem('pos_suspended_carts_offline');
      if (saved) {
        const list = JSON.parse(saved);
        const filtered = list.filter((item: any) => item.id !== scId);
        window.localStorage.setItem('pos_suspended_carts_offline', JSON.stringify(filtered));
        setOfflineHeldOrders(filtered);
      }
    } catch (e) {
      console.warn("Failed to remove from offline list:", e);
    }

    toast.success("Venda em espera eliminada.");
  };

  // Turno Open
  const handleOpenShift = async () => {
    if (!profile?.businessId) return;
    const cashVal = Number(openingFloat) || 0;
    try {
      const { addDoc, collection, serverTimestamp } = await import('firebase/firestore');
      const newShiftDoc = {
        cashierId: profile.uid,
        cashierName: profile.displayName || profile.name || profile.email,
        cashierEmail: profile.email || '',
        openedAt: new Date().toISOString(),
        openingCash: cashVal,
        openingFloat: cashVal,
        terminal: selectedTerminal,
        status: 'open',
        totalSales: 0,
        transactionCount: 0,
        paymentBreakdown: {
          cash: 0,
          mpesa: 0,
          emola: 0,
          bank: 0,
          card: 0,
          credit: 0
        },
        cashMovements: [],
        openingDenominations: openingDenominations
      };
      await addDoc(collection(db, `businesses/${profile.businessId}/pos_shifts`), newShiftDoc);

      // Log opening to activity registers
      await addDoc(collection(db, `businesses/${profile.businessId}/activity_logs`), {
        actionType: 'OPEN_SHIFT',
        details: `Turno aberto no terminal "${selectedTerminal}" por ${profile.displayName || profile.email} com fundo inicial de ${cashVal.toFixed(1)} MT`,
        userEmail: profile.email || 'Utilizador',
        userId: profile.uid,
        timestamp: serverTimestamp()
      });

      toast.success("Turno de Caixa aberto!");
    } catch (e: any) {
      toast.error("Erro abrir turno: " + e.message);
    }
  };

  // Turno Move adjustments (additions / withdrawals)
  const handleShiftMovement = async () => {
    if (!profile?.businessId || !currentShift) return;
    const amt = Number(shiftMoveAmount) || 0;
    if (amt <= 0) {
      toast.error("Introduza um valor válido!");
      return;
    }
    try {
      const list = [...(currentShift.cashMovements || [])];
      list.push({
        type: shiftMoveType,
        amount: amt,
        notes: shiftNote.trim(),
        timestamp: new Date().toISOString()
      });
      await updateDoc(doc(db, `businesses/${profile.businessId}/pos_shifts`, currentShift.id), {
        cashMovements: list
      });
      toast.success("Ajuste de caixa registado!");
      setShiftMoveAmount('');
      setShiftNote('');
    } catch (e: any) {
      toast.error("Falha no registo: " + (e.message || e));
    }
  };

  // Turno Close
  const handleCloseShift = async (counted: number, notes: string) => {
    if (!profile?.businessId || !currentShift) return;
    try {
      const { addDoc, collection, serverTimestamp } = await import('firebase/firestore');
      const additions = (currentShift.cashMovements || []).filter((m:any)=>m.type==='addition').reduce((s:number,m:any)=>s+m.amount, 0);
      const withdrawals = (currentShift.cashMovements || []).filter((m:any)=>m.type==='withdrawal').reduce((s:number,m:any)=>s+m.amount, 0);
      const cashSales = currentShift.paymentBreakdown?.cash || 0;
      const finalExp = currentShift.openingCash + cashSales + additions - withdrawals;
      const discrepancy = counted - finalExp;

      const closedDoc = {
        ...currentShift,
        closedAt: new Date().toISOString(),
        expectedCash: finalExp,
        countedCash: counted,
        closingCash: counted,
        discrepancy: discrepancy,
        additionsValue: additions,
        withdrawalsValue: withdrawals,
        closingNotes: notes,
        status: 'closed',
        reconciled: discrepancy === 0,
        closingFloatExpected: finalExp,
        closingFloatActual: counted,
        overShortAmount: discrepancy
      };

      await updateDoc(doc(db, `businesses/${profile.businessId}/pos_shifts`, currentShift.id), {
        closedAt: closedDoc.closedAt,
        expectedCash: finalExp,
        countedCash: counted,
        closingCash: counted,
        discrepancy: discrepancy,
        closingNotes: notes,
        status: 'closed',
        reconciled: discrepancy === 0,
        closingFloatExpected: finalExp,
        closingFloatActual: counted,
        overShortAmount: discrepancy
      });

      // Log closure to activity logs
      const discText = discrepancy === 0 
        ? "Caixa fechado com saldo correto." 
        : discrepancy > 0 
          ? `Caixa fechado com SOBRA de ${discrepancy.toFixed(1)} MT.` 
          : `Caixa fechado com QUEBRA de ${Math.abs(discrepancy).toFixed(1)} MT.`;

      await addDoc(collection(db, `businesses/${profile.businessId}/activity_logs`), {
        actionType: 'CLOSE_SHIFT',
        details: `Fecho de Turno #${currentShift.id.slice(-6).toUpperCase()} no terminal "${currentShift.terminal || 'Caixa Geral'}" por ${profile.displayName || profile.email}. ${discText}`,
        userEmail: profile.email || 'Utilizador',
        userId: profile.uid,
        timestamp: serverTimestamp()
      });

      setLastClosedShiftData(closedDoc);
      setCurrentShift(null);
      setIsShiftModalOpen(false);
      setIsClosingShiftForm(false);
      setIsClosedShiftSummaryOpen(true); // Open printable summary modal
      setCountedCash('');
      setClosingNotes('');
      toast.success("Turno fechado com sucesso!");
    } catch (e: any) {
      toast.error("Erro concluir fecho: " + e.message);
    }
  };

  // Thermal/Standard Shift Print Summary
  const triggerShiftPrint = (shift: any) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Pop-up bloqueado pelo navegador! Ative os pop-ups para imprimir.");
      return;
    }

    const bizName = businessData?.name || profile?.businessName || 'Sabush System ERP';
    const bizAddress = businessData?.address || "Morada do Estabelecimento";
    const bizPhone = businessData?.phone || "Telemóvel Comercial";
    const bizNif = businessData?.taxId || "NIF Contribuinte";

    const additions = (shift.cashMovements || []).filter((m: any) => m.type === 'addition').reduce((s: number, m: any) => s + m.amount, 0);
    const withdrawals = (shift.cashMovements || []).filter((m: any) => m.type === 'withdrawal').reduce((s: number, m: any) => s + m.amount, 0);
    const cashSales = shift.paymentBreakdown?.cash || 0;
    const finalExp = shift.openingCash + cashSales + additions - withdrawals;
    const discrepancy = (shift.countedCash ?? finalExp) - finalExp;

    let movementsHtml = "";
    if (shift.cashMovements && shift.cashMovements.length > 0) {
      movementsHtml = `
        <div class="section">
          <h3>MOVIMENTACOES DE CAIXA</h3>
          <table>
            <thead>
              <tr>
                <th style="text-align:left;">Hora</th>
                <th style="text-align:left;">Tipo</th>
                <th style="text-align:right;">Valor</th>
                <th style="text-align:right;">Notas</th>
              </tr>
            </thead>
            <tbody>
              ${shift.cashMovements.map((m: any) => `
                <tr>
                  <td>${new Date(m.timestamp).toLocaleTimeString('pt-PT')}</td>
                  <td>${m.type === 'addition' ? 'SUPRIMENTO' : 'SANGRIA'}</td>
                  <td style="text-align:right;">${m.amount.toFixed(1)} MT</td>
                  <td style="text-align:right;">${m.notes || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>Relatorio_Fecho_Caixa_${shift.id}</title>
          <style>
            body {
              font-family: 'Courier New', monospace;
              width: 80mm;
              margin: 0;
              padding: 5mm;
              font-size: 11px;
              line-height: 1.4;
              color: #000;
              background: #fff;
            }
            .center { text-align: center; }
            .right { text-align: right; }
            .bold { font-weight: bold; }
            .header { margin-bottom: 5mm; }
            .header h2 { margin: 0 0 2px 0; font-size: 14px; text-transform: uppercase; }
            .header p { margin: 2px 0; font-size: 10px; }
            .divider { border-top: 1px dashed #000; margin: 4mm 0; }
            .section { margin-bottom: 4mm; }
            .section h3 { margin: 0 0 2px 0; font-size: 11px; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 1px; }
            table { width: 100%; border-collapse: collapse; margin-top: 2px; }
            table th { text-align: left; font-size: 10px; border-bottom: 1px solid #000; }
            table td { font-size: 10px; padding: 2px 0; }
            .row { display: flex; justify-content: space-between; margin: 2px 0; }
            .discrepancy {
              padding: 4px;
              border: 1px dashed #000;
              margin-top: 4px;
            }
            .footer-sig { margin-top: 12mm; display: flex; justify-content: space-between; font-size: 9px; }
            .footer-sig div { width: 45%; text-align: center; border-top: 1px solid #000; padding-top: 2px; }
            @page {
              size: 80mm auto;
              margin: 0;
            }
            @media print {
              body { padding: 0; margin: 0; }
              @page {
                size: 80mm auto;
                margin: 0;
              }
            }
          </style>
        </head>
        <body onload="window.focus(); setTimeout(function() { window.print(); window.close(); }, 500);">
          <div class="center header">
            <h2>${bizName}</h2>
            <p>${bizAddress}</p>
            <p>Tel: ${bizPhone} | NIF: ${bizNif}</p>
            <div class="divider"></div>
            <p class="bold" style="font-size: 11px; margin: 4px 0;">RELATORIO DE FECHO DE CAIXA</p>
            <p>Turno ID: #${shift.id?.slice(-6).toUpperCase()}</p>
          </div>

          <div class="section">
            <div class="row"><span>Operador:</span><span class="bold">${shift.cashierName}</span></div>
            <div class="row"><span>Abertura:</span><span>${new Date(shift.openedAt).toLocaleString('pt-PT')}</span></div>
            <div class="row"><span>Fecho:</span><span>${shift.closedAt ? new Date(shift.closedAt).toLocaleString('pt-PT') : 'ABERTO'}</span></div>
            <div class="row"><span>Terminal:</span><span>${shift.terminal || 'Caixa Geral'}</span></div>
          </div>

          <div class="divider"></div>

          <div class="section">
            <h3>DINHEIRO EM GAVETA</h3>
            <div class="row"><span>Fundo de Maneio Inicial:</span><span>${shift.openingCash.toFixed(1)} MT</span></div>
            <div class="row"><span>Vendas em Dinheiro:</span><span>${cashSales.toFixed(1)} MT</span></div>
            <div class="row"><span>Suprimentos (+):</span><span>${additions.toFixed(1)} MT</span></div>
            <div class="row"><span>Sangrias (-):</span><span>${withdrawals.toFixed(1)} MT</span></div>
            <div class="divider"></div>
            <div class="row bold"><span>Saldo de Caixa Esperado:</span><span>${finalExp.toFixed(1)} MT</span></div>
            <div class="row bold"><span>Saldo de Caixa Contado:</span><span>${(shift.countedCash ?? finalExp).toFixed(1)} MT</span></div>
            <div class="row bold discrepancy">
              <span>Divergencia (Sobra/Falta):</span>
              <span>${discrepancy >= 0 ? '+' : ''}${discrepancy.toFixed(1)} MT</span>
            </div>
            ${shift.closingNotes ? `<div style="margin-top: 6px; font-style: italic;">Notas: ${shift.closingNotes}</div>` : ''}
          </div>

          <div class="divider"></div>

          <div class="section">
            <h3>FATURACAO POR METODO</h3>
            <div class="row"><span>Dinheiro (Fisico):</span><span>${cashSales.toFixed(1)} MT</span></div>
            <div class="row"><span>M-Pesa:</span><span>${(shift.paymentBreakdown?.mpesa || 0).toFixed(1)} MT</span></div>
            <div class="row"><span>E-Mola:</span><span>${(shift.paymentBreakdown?.emola || 0).toFixed(1)} MT</span></div>
            <div class="row"><span>Banco / Transf:</span><span>${(shift.paymentBreakdown?.bank || 0).toFixed(1)} MT</span></div>
            <div class="row"><span>Cartao (POS):</span><span>${(shift.paymentBreakdown?.card || 0).toFixed(1)} MT</span></div>
            <div class="row"><span>Credito (A Prazo):</span><span>${(shift.paymentBreakdown?.credit || 0).toFixed(1)} MT</span></div>
            <div class="divider"></div>
            <div class="row bold"><span>Total Faturado Geral:</span><span>${shift.totalSales.toFixed(1)} MT</span></div>
            <div class="row"><span>Total Transacoes:</span><span>${shift.transactionCount || 0}</span></div>
          </div>

          ${movementsHtml}

          <div class="divider"></div>

          <div class="footer-sig">
            <div>Operador / Caixa</div>
            <div>Supervisor / Gerencia</div>
          </div>

          <div class="center" style="margin-top: 8mm; font-size: 8px;">
            <p>Gerado pelo Sabush System ERP em ${new Date().toLocaleString('pt-PT')}</p>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Quick Customer Creation
  const handleQuickCustomerCreate = async () => {
    if (!profile?.businessId) return;
    if (!newCustName.trim()) {
      toast.error("Nome do cliente obrigatório.");
      return;
    }
    try {
      const payload = {
        name: newCustName.trim(),
        phone: newCustPhone.trim(),
        address: newCustAddress.trim(),
        nif: newCustNif.trim(),
        notes: newCustNotes.trim(),
        outstandingBalance: 0,
        totalSpent: 0,
        loyaltyPoints: 0,
        createdAt: new Date().toISOString()
      };
      const docRef = await addDoc(collection(db, `businesses/${profile.businessId}/customers`), payload);
      const customerId = docRef.id;

      setSelectedCustomerId(customerId);
      setIsQuickCustomerOpen(false);
      setNewCustName('');
      setNewCustPhone('');
      setNewCustAddress('');
      setNewCustNif('');
      setNewCustNotes('');
      toast.success("Cliente criado e selecionado!");
    } catch (e: any) {
      toast.error("Erro criar cliente: " + (e.message || e));
    }
  };

  // Filtered product typing dropdown auto-complete with sales-volume ranking and tiebreaker match relevance
  const filteredSearchProducts = React.useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return [];

    const matches = products.filter(p => 
      p.name?.toLowerCase().includes(q) ||
      p.sku?.toLowerCase().includes(q) ||
      p.barcode?.toLowerCase().includes(q)
    );

    if (q.length <= 2) {
      // 1-2 chars: rank strictly by sales volume (best-sellers first)
      return [...matches].sort((a, b) => {
        const salesA = a.salesCount || 0;
        const salesB = b.salesCount || 0;
        if (salesB !== salesA) return salesB - salesA;
        return (a.name || '').localeCompare(b.name || '');
      });
    } else {
      // 3+ chars: exact/prefix match relevance with sales ranking as a tiebreaker
      const getRelevance = (product: any): number => {
        const name = (product.name || '').toLowerCase();
        const sku = (product.sku || '').toLowerCase();
        const barcode = (product.barcode || '').toLowerCase();
        
        if (sku === q || barcode === q) return 4;
        if (name === q) return 3;
        if (name.startsWith(q) || sku.startsWith(q) || barcode.startsWith(q)) return 2;
        if (name.includes(q) || sku.includes(q) || barcode.includes(q)) return 1;
        return 0;
      };

      return [...matches].sort((a, b) => {
        const relA = getRelevance(a);
        const relB = getRelevance(b);
        if (relB !== relA) return relB - relA;
        
        const salesA = a.salesCount || 0;
        const salesB = b.salesCount || 0;
        if (salesB !== salesA) return salesB - salesA;
        
        return (a.name || '').localeCompare(b.name || '');
      });
    }
  }, [searchTerm, products]);

  // Filtered products for the catalog grid
  const displayedProducts = products.filter(p => {
    const matchesCategory = catalogCategory === 'all' || p.category === catalogCategory;
    const matchesSearch = !searchTerm.trim() || 
      p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.barcode?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Financial aggregation totals
  const subtotal = cart.reduce((sum, item) => {
    const prices = getCartItemPricing(item);
    return sum + prices.total;
  }, 0);

  const userTaxValue = Number(taxRate) || 17;
  const produtosSemIvaValue = subtotal / (1 + userTaxValue / 100);
  const ivaCalculated = subtotal - produtosSemIvaValue;
  
  // Manual discount calculation
  let manualDiscount = 0;
  if (cartDiscountType === 'percent' && cartDiscountValue > 0) {
    manualDiscount = subtotal * (cartDiscountValue / 100);
  } else if (cartDiscountType === 'flat' && cartDiscountValue > 0) {
    manualDiscount = cartDiscountValue;
  }

  // Loyalty points redemption discount (10 points = 1 MT)
  const loyaltyDiscount = redeemedPoints * 0.1;
  const total = Math.max(0, subtotal - loyaltyDiscount - manualDiscount); // tax inclusive is active for calculations

  // Projected Outstanding Debt calculations for registered selections
  const selectedCust = customers.find(c => c.id === selectedCustomerId);
  let finalOutstandingAdd = 0;
  let cashFired = 0;
  let creditFired = 0;
  let statusFired = 'PAGO';

  if (selectedCust) {
    if (saleMode === 'credito') {
      creditFired = total;
      finalOutstandingAdd = total;
      statusFired = 'PENDENTE';
    } else if (saleMode === 'parcial') {
      const activePaid = Number(partialAmountPaid) || 0;
      creditFired = Math.max(0, total - activePaid);
      cashFired = Math.min(total, activePaid);
      finalOutstandingAdd = creditFired;
      statusFired = creditFired > 0 ? 'PARCIAL' : 'PAGO';
    } else {
      cashFired = total;
      statusFired = 'PAGO';
    }
  } else {
    cashFired = total;
  }

  // Multi-Page Paginated receipt printer module matching Section 9 exactly
  const triggerCustomMultiPagePrint = (sale: any) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Pop-up bloqueado pelo navegador! Ative os pop-ups para imprimir.");
      return;
    }

    const docItems = sale.items || [];
    const maxItemsPerPage = 30;
    const totalPages = Math.ceil(docItems.length / maxItemsPerPage) || 1;

    let pagesHtml = "";
    
    // Business attributes matching Firestore configuration
    const bizName = businessData?.name || profile?.businessName || 'Sabush System ERP';
    const bizAddress = businessData?.address || "Morada do Estabelecimento";
    const bizPhone = businessData?.phone || "Telemóvel Comercial";
    const bizNif = businessData?.taxId || "NIF Contribuinte";
    const cashierLabel = sale.createdByName || profile?.displayName || "Operador";
    const formattedDate = formatDateTimeInTimezone(sale.date || new Date().toISOString(), 'Africa/Maputo');

    // Calculate overall discounts if not explicitly saved
    const totalItemsPriceSum = docItems.reduce((sum: number, item: any) => sum + ((item.price || 0) * (item.quantity || 0)), 0);
    const globalDiscountAmount = sale.discount !== undefined ? sale.discount : Math.max(0, totalItemsPriceSum - sale.total);
    const isCreditOrPartial = sale.saleMode === 'credito' || sale.saleMode === 'parcial' || sale.paymentMethod === 'credit' || sale.paymentMethod === 'parcial' || sale.paymentMethod === 'credito';

    for (let p = 1; p <= totalPages; p++) {
      const startIdx = (p - 1) * maxItemsPerPage;
      const pageItems = docItems.slice(startIdx, startIdx + maxItemsPerPage);

      // Sum page subtotal helper
      const pageSubtotal = pageItems.reduce((s: number, item: any) => s + (item.price * item.quantity), 0);
      
      // Cumulative subtotal helpers (pages 1 to p)
      const cumulativeItems = docItems.slice(0, startIdx + pageItems.length);
      const cumulativeSubtotal = cumulativeItems.reduce((s: number, item: any) => s + (item.price * item.quantity), 0);

      pagesHtml += `
        <div class="invoice-page">
          <!-- 1. Business header (name, address, NUIT) -->
          <div style="text-align: center; margin-bottom: 6px;">
            <div style="font-size: 14px; font-weight: bold; text-transform: uppercase;">${bizName}</div>
            <div style="font-size: 10px; margin-top: 2px; color: #111;">${bizAddress} | Tel: ${bizPhone}</div>
            <div style="font-size: 10px; color: #111;">NIF/NUIT: ${bizNif}</div>
          </div>

          <!-- 2. Invoice meta (Fatura #, Pág, Operador, Data, Cliente) -->
          <div style="font-size: 11px; line-height: 1.4; margin-bottom: 6px;">
            <div style="display: flex; justify-content: space-between;">
              <span><strong>Fatura:</strong> #${sale.invoiceNumber}${sale.isOffline ? ' <span style="background: #000; color: #fff; padding: 1px 4px; font-size: 9px; font-weight: bold; border-radius: 3px; margin-left: 4px;">OFFLINE</span>' : ''}</span>
              <span><strong>Pág:</strong> ${p} de ${totalPages}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-top: 2px;">
              <span><strong>Operador:</strong> ${cashierLabel}</span>
              <span><strong>Data:</strong> ${formattedDate}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-top: 2px;">
              <span><strong>Cliente:</strong> ${sale.customerName || 'Cliente Geral'}</span>
            </div>
          </div>

          <!-- 3. Dashed divider -->
          <hr style="border: none; border-top: 1px dashed #000; margin: 6px 0;" />

          <!-- 4. Product line items table with columns: Artigo | Qtd | Preço | Total -->
          <table class="items-table">
            <thead>
              <tr>
                <th align="left" style="width: 45%;">Artigo</th>
                <th align="center" style="width: 15%;">Qtd</th>
                <th align="right" style="width: 20%;">Preço</th>
                <th align="right" style="width: 20%;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${pageItems.map((item: any) => `
                <tr>
                  <td style="word-break: break-all;">${item.name}</td>
                  <td align="center">${item.quantity}</td>
                  <td align="right">${item.price.toFixed(2)}</td>
                  <td align="right">${(item.price * item.quantity).toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <!-- 5. Dashed divider -->
          <hr style="border: none; border-top: 1px dashed #000; margin: 6px 0;" />

          <!-- Page Summary Block -->
          <div style="font-size: 11px; font-family: 'Courier New', Courier, monospace; line-height: 1.4;">
            ${p < totalPages ? `
              <!-- 6. Subtotal da Página (intermediate) -->
              <div style="display: flex; justify-content: space-between; font-weight: bold;">
                <span>Subtotal da Página:</span>
                <span>${pageSubtotal.toFixed(2)} MT</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-top: 2px;">
                <span>Total Acumulado (até pág. ${p}):</span>
                <span>${cumulativeSubtotal.toFixed(2)} MT</span>
              </div>
              <div style="text-align: center; font-style: italic; margin-top: 8px; font-weight: bold; font-size: 10px;">
                Continua na pág. ${p + 1} de ${totalPages}...
              </div>
            ` : `
              <!-- Last Page Totals Breakdown -->
              
              <!-- 6. Subtotal da Página: X MT -->
              <div style="display: flex; justify-content: space-between;">
                <span>Subtotal da Página:</span>
                <span>${pageSubtotal.toFixed(2)} MT</span>
              </div>

              <!-- 7. IVA 17% Incluído: X MT and Líquido: X MT -->
              <div style="display: flex; justify-content: space-between; margin-top: 2px;">
                <span>IVA 17% Incluído:</span>
                <span>${sale.tax.toFixed(2)} MT</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-top: 2px;">
                <span>Líquido:</span>
                <span>${(sale.total - sale.tax).toFixed(2)} MT</span>
              </div>

              <!-- 8. Discount line (only if applied) -->
              ${globalDiscountAmount > 0.01 ? `
                <div style="display: flex; justify-content: space-between; margin-top: 2px; color: #000; font-weight: bold;">
                  <span>Desconto:</span>
                  <span>-${globalDiscountAmount.toFixed(2)} MT</span>
                </div>
              ` : ''}

              <!-- 9. TOTAL GERAL: X MT -->
              <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 13px; margin-top: 6px; border-top: 1px dashed #000; padding-top: 6px;">
                <span>TOTAL GERAL:</span>
                <span>${sale.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT</span>
              </div>

              <!-- Fix 3: Modo de Venda Label / Credit Debt Summary Block -->
              ${!isCreditOrPartial ? `
                <div style="margin-top: 8px; font-size: 11px; line-height: 1.3; background: #eee; padding: 6px; color: #000; border: 1px dashed #000; text-align: center; font-weight: bold;">
                  Modo de Venda: ${sale.paymentMethod === 'cash' ? 'DINHEIRO' : (sale.paymentMethod || 'DINHEIRO').toUpperCase()}
                </div>
              ` : `
                <div style="margin-top: 8px; background: #fffbeb; border: 1px dashed #f59e0b; border-radius: 4px; padding: 6px; font-size: 11px; color: #78350f;">
                  <div style="display: flex; justify-content: space-between;">
                    <span>Saldo anterior:</span>
                    <span>${(sale.previousOutstandingBalance || 0).toFixed(2)} MT</span>
                  </div>
                  <div style="display: flex; justify-content: space-between; color: #b91c1c; font-weight: bold; margin-top: 2px;">
                    <span>Fiado desta venda:</span>
                    <span>+${(sale.creditOutstandingAmount || 0).toFixed(2)} MT</span>
                  </div>
                  <div style="display: flex; justify-content: space-between; font-weight: bold; border-top: 1px dashed #f59e0b; margin-top: 4px; padding-top: 4px; font-size: 11.5px; color: #78350f;">
                    <span>Novo saldo devedor:</span>
                    <span>${((sale.previousOutstandingBalance || 0) + (sale.creditOutstandingAmount || 0)).toFixed(2)} MT</span>
                  </div>
                </div>
              `}

              <div class="thanks-note">
                Obrigado pela preferência e confiança!<br/>
                SABUSH SYSTEM ERP
              </div>
            `}
          </div>
        </div>
        ${p < totalPages ? '<div class="page-break"></div>' : ''}
      `;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Recibo Fatura #${sale.invoiceNumber}</title>
        <style>
          @page {
            size: 80mm auto;
            margin: 2mm 4mm;
          }
          body {
            background: white;
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
          }
          .receipt-container {
            width: 302px;
            max-width: 302px;
            font-family: 'Courier New', Courier, monospace;
            font-size: 11.5px;
            color: #000;
            line-height: 1.4;
            padding: 10px;
            box-sizing: border-box;
          }
          .invoice-page {
            width: 100%;
            background: #fff;
            box-sizing: border-box;
          }
          .items-table {
            width: 100%;
            border-collapse: collapse;
            font-family: 'Courier New', Courier, monospace;
            font-size: 11px;
            margin: 6px 0;
          }
          .items-table th {
            font-weight: bold;
            border-bottom: 1px dashed #000;
            padding: 4px 0;
            font-size: 11px;
          }
          .items-table td {
            padding: 4px 0;
            vertical-align: top;
            font-size: 11px;
          }
          .thanks-note {
            margin-top: 15px;
            text-align: center;
            font-style: italic;
            font-weight: bold;
            font-size: 11.5px;
          }
          @media print {
            body {
              background: white;
              margin: 0;
              padding: 0;
              width: 100% !important;
            }
            @page {
              size: 80mm auto;
              margin: 2mm 4mm;
            }
            .receipt-container {
              width: 100% !important;
              max-width: 100% !important;
              padding: 0 !important;
            }
            .page-break {
              page-break-after: always;
            }
          }
        </style>
      </head>
      <body onload="window.focus(); setTimeout(function() { window.print(); window.close(); }, 500);">
        <div class="receipt-container">
          ${pagesHtml}
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Main checkout submit execution aligning specs 8, 9, 10
  const checkOutTransaction = async () => {
    if (!profile?.businessId || !currentShift) return;
    if (cart.length === 0) {
      toast.error("O carrinho encontra-se vazio!");
      return;
    }

    setIsProcessing(true);
    
    // Credit Limit Verification
    if (selectedCustomerId !== 'Walk-in' && selectedCust && (saleMode === 'credito' || saleMode === 'parcial')) {
      const limitAllowed = selectedCust.creditLimit || 500;
      const currentDebt = selectedCust.outstandingBalance || 0;
      
      // Calculate credit portion of this sale
      let tempCreditOutstanding = 0;
      if (saleMode === 'credito') {
        tempCreditOutstanding = total;
      } else if (saleMode === 'parcial') {
        const actPaid = Number(partialAmountPaid) || 0;
        tempCreditOutstanding = Math.max(0, total - actPaid);
      }
      
      const projectedTotalDebt = currentDebt + tempCreditOutstanding;
      if (projectedTotalDebt > limitAllowed && !isCreditLimitBypassed) {
        setManagerPINAction(`Bypass Limite de Crédito (${selectedCust.name})`);
        setActivePINActionType('credit_bypass');
        setIsCreditLimitModalOpen(true);
        setIsProcessing(false);
        return;
      }
    }

    try {
      const uniqueId = `POS-${Date.now().toString().slice(-8)}-${profile.uid.slice(-4).toUpperCase()}`;

      // Calculate checkout payments parts mapping Firebase collections updates
      let cashPaidAmount = 0;
      let mpesaPaidAmount = 0;
      let emolaPaidAmount = 0;
      let cardPaidAmount = 0;
      let bankPaidAmount = 0;
      let creditOutstandingAmount = 0;

      if (selectedCustomerId === 'Walk-in') {
        creditOutstandingAmount = 0;
        if (paymentMethod === 'cash') cashPaidAmount = total;
        else if (paymentMethod === 'mpesa') mpesaPaidAmount = total;
        else if (paymentMethod === 'emola') emolaPaidAmount = total;
        else if (paymentMethod === 'bank') bankPaidAmount = total;
        else if (paymentMethod === 'card') cardPaidAmount = total;
      } else {
        if (saleMode === 'credito') {
          creditOutstandingAmount = total;
        } else if (saleMode === 'parcial') {
          const actPaid = Number(partialAmountPaid) || 0;
          creditOutstandingAmount = Math.max(0, total - actPaid);
          const fractionValue = Math.min(total, actPaid);

          if (paymentMethod === 'cash') cashPaidAmount = fractionValue;
          else if (paymentMethod === 'mpesa') mpesaPaidAmount = fractionValue;
          else if (paymentMethod === 'emola') emolaPaidAmount = fractionValue;
          else if (paymentMethod === 'bank') bankPaidAmount = fractionValue;
          else if (paymentMethod === 'card') cardPaidAmount = fractionValue;
        } else {
          creditOutstandingAmount = 0;
          if (paymentMethod === 'cash') cashPaidAmount = total;
          else if (paymentMethod === 'mpesa') mpesaPaidAmount = total;
          else if (paymentMethod === 'emola') emolaPaidAmount = total;
          else if (paymentMethod === 'bank') bankPaidAmount = total;
          else if (paymentMethod === 'card') cardPaidAmount = total;
        }
      }

      const invoiceData = {
        invoiceNumber: uniqueId,
        items: cart.map(item => {
          const prices = getCartItemPricing(item);
          return {
            id: item.id,
            name: item.name,
            quantity: item.quantity,
            price: prices.finalUnitPrice,
            selectedUnit: item.selectedUnit || 'un',
            subtotal: prices.total
          };
        }),
        subtotal: total,
        tax: ivaCalculated,
        taxRate: 17,
        total: total,
        amountPaid: cashPaidAmount + mpesaPaidAmount + emolaPaidAmount + cardPaidAmount + bankPaidAmount,
        outstandingBalance: creditOutstandingAmount,
        paymentMethod: selectedCustomerId === 'Walk-in' ? paymentMethod : saleMode,
        status: creditOutstandingAmount <= 0 ? 'pago' : (total - creditOutstandingAmount > 0 ? 'parcialmente_pago' : 'pendente'),
        date: new Date().toISOString(),
        customerId: selectedCustomerId,
        businessId: profile.businessId,
        createdByUid: profile.uid,
        createdByName: profile.displayName || profile.name || profile.email,
        shiftId: currentShift?.id || ''
      };

      if (isOnline) {
        // Perform updates inside atomic write transaction for concurrency safety
        await runTransaction(db, async (transaction) => {
          const productRefsAndData = [];
          const insufficientProducts = [];

          for (const item of cart) {
            const prodRef = doc(db, `businesses/${profile.businessId}/products`, item.id);
            const prodDoc = await transaction.get(prodRef);
            if (!prodDoc.exists()) {
              throw new Error(`Produto não encontrado: ${item.name}`);
            }
            const currentData = prodDoc.data();
            const multiplier = item.unitMultiplier || 1;
            const qtyToDeduct = item.quantity * multiplier;
            const stockLevel = currentData.stockLevel !== undefined ? currentData.stockLevel : 0;

            if (stockLevel < qtyToDeduct) {
              const availableInSelectedUnit = stockLevel > 0 ? Number((stockLevel / multiplier).toFixed(4)) : 0;
              insufficientProducts.push({
                id: item.id,
                name: item.name,
                requested: item.quantity,
                available: availableInSelectedUnit,
                selectedUnit: item.selectedUnit || 'un'
              });
            } else {
              productRefsAndData.push({
                ref: prodRef,
                data: currentData,
                qtyToDeduct,
                item
              });
            }
          }

          if (insufficientProducts.length > 0) {
            throw {
              code: 'insufficient_stock',
              insufficient: insufficientProducts
            };
          }

          // Fetch Shift
          const shiftRef = doc(db, `businesses/${profile.businessId}/pos_shifts`, currentShift.id);
          const shiftDoc = await transaction.get(shiftRef);
          if (!shiftDoc.exists()) {
            throw new Error("Turno activo não encontrado no servidor.");
          }
          const shiftData = shiftDoc.data();

          // Fetch Customer if applicable
          let custRef = null;
          let customerDoc = null;
          if (selectedCustomerId && selectedCustomerId !== 'Walk-in') {
            custRef = doc(db, `businesses/${profile.businessId}/customers`, selectedCustomerId);
            customerDoc = await transaction.get(custRef);
          }

          // Create invoice document
          const invoiceDocRef = doc(db, `businesses/${profile.businessId}/invoices`, uniqueId);
          transaction.set(invoiceDocRef, {
            ...invoiceData,
            id: uniqueId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });

          // Update each product's stock levels
          for (const { ref, data, qtyToDeduct, item } of productRefsAndData) {
            const updatedStockLevel = (data.stockLevel || 0) - qtyToDeduct;
            const updates: any = {
              stockLevel: updatedStockLevel,
              salesCount: (data.salesCount || 0) + item.quantity
            };

            if (isBoxUnit(data, item.selectedUnit)) {
              updates.stockCx = (data.stockCx || 0) - item.quantity;
            } else if (isPackUnit(data, item.selectedUnit)) {
              updates.stockEmb = (data.stockEmb || 0) - item.quantity;
            } else {
              updates.stockUn = (data.stockUn || 0) - item.quantity;
            }

            transaction.update(ref, updates);
          }

          // Update shift summaries
          const pb = shiftData.paymentBreakdown || {};
          transaction.update(shiftRef, {
            totalSales: (shiftData.totalSales || 0) + total,
            transactionCount: (shiftData.transactionCount || 0) + 1,
            "paymentBreakdown.cash": (pb.cash || 0) + cashPaidAmount,
            "paymentBreakdown.mpesa": (pb.mpesa || 0) + mpesaPaidAmount,
            "paymentBreakdown.emola": (pb.emola || 0) + emolaPaidAmount,
            "paymentBreakdown.bank": (pb.bank || 0) + bankPaidAmount,
            "paymentBreakdown.card": (pb.card || 0) + cardPaidAmount,
            "paymentBreakdown.credit": (pb.credit || 0) + creditOutstandingAmount
          });

          // Update customer finances
          if (custRef && customerDoc) {
            const custData = customerDoc.data();
            const pointsEarned = Math.floor((total - creditOutstandingAmount) / 100);
            const updates: any = {
              outstandingBalance: (custData.outstandingBalance || 0) + creditOutstandingAmount,
              totalSpent: (custData.totalSpent || 0) + (total - creditOutstandingAmount),
              lastPurchaseDate: new Date().toISOString()
            };
            if (redeemedPoints > 0 || pointsEarned > 0) {
              updates.loyaltyPoints = (custData.loyaltyPoints || 0) - redeemedPoints + pointsEarned;
            }
            transaction.update(custRef, updates);
          }
        });
      } else {
        // Decrement local cached stock optimistically in state and IndexedDB
        const updatedProductsList = products.map(p => {
          const cartItem = cart.find(c => c.id === p.id);
          if (cartItem) {
            const multiplier = cartItem.unitMultiplier || 1;
            const itemsToDeduct = cartItem.quantity * multiplier;
            const newStockLevel = Math.max(0, (p.stockLevel || 0) - itemsToDeduct);
            
            let stockCx = p.stockCx || 0;
            let stockEmb = p.stockEmb || 0;
            let stockUn = p.stockUn || 0;

            if (isBoxUnit(p, cartItem.selectedUnit)) {
              stockCx = Math.max(0, stockCx - cartItem.quantity);
            } else if (isPackUnit(p, cartItem.selectedUnit)) {
              stockEmb = Math.max(0, stockEmb - cartItem.quantity);
            } else {
              stockUn = Math.max(0, stockUn - cartItem.quantity);
            }

            return {
              ...p,
              stockLevel: newStockLevel,
              stockCx,
              stockEmb,
              stockUn
            };
          }
          return p;
        });

        // Update local React state for products immediately
        setProducts(updatedProductsList);
        
        // Save the updated list to IndexedDB product cache
        await offlineDb.saveProducts(updatedProductsList).catch(err => console.warn("Cache save warning:", err));

        // Create pending sale object
        const pendingSale = {
          id: uniqueId,
          businessId: profile.businessId,
          shiftId: currentShift?.id || '',
          invoiceData: {
            ...invoiceData,
            id: uniqueId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isOffline: true,
            paymentBreakdown: {
              cash: cashPaidAmount,
              mpesa: mpesaPaidAmount,
              emola: emolaPaidAmount,
              bank: bankPaidAmount,
              card: cardPaidAmount,
              credit: creditOutstandingAmount
            },
            redeemedPoints: redeemedPoints
          },
          status: 'pending',
          createdAt: Date.now()
        };

        await offlineDb.savePendingSale(pendingSale);
        
        // Refresh the pendingSales local list state
        const refreshedQueue = await offlineDb.getPendingSales();
        setPendingSales(refreshedQueue);

        toast.success("Venda guardada em modo offline! Aguardando ligação para sincronizar.");
      }

      if (isOnline) {
        // Record stock movements in background
        try {
          const { addDoc, collection } = await import('firebase/firestore');
          for (const item of cart) {
            const itemsToDeduct = item.quantity * (item.unitMultiplier || 1);
            await addDoc(collection(db, `businesses/${profile.businessId}/stock_movements`), {
              productId: item.id,
              productName: item.name,
              qtyChange: -itemsToDeduct,
              type: 'pos',
              reference: uniqueId,
              reportedBy: profile.email || 'Utilizador',
              timestamp: serverTimestamp()
            });
          }
        } catch (errM) {
          console.error("[POS] Error logging stock movements:", errM);
        }

        // Section 10: Log individual purchase record sub-collection histories
        if (selectedCustomerId && selectedCustomerId !== 'Walk-in') {
          const purchaseLog = {
            invoiceId: uniqueId,
            invoiceNumber: uniqueId,
            date: new Date().toISOString(),
            total: total,
            paymentMethod: saleMode,
            status: creditOutstandingAmount <= 0 ? 'PAGO' : (creditOutstandingAmount === total ? 'PENDENTE' : 'PARCIAL'),
            items: cart.map(item => ({
              name: item.name,
              quantity: item.quantity,
              price: getCartItemPricing(item).finalUnitPrice
            }))
          };
          await addDoc(collection(db, `businesses/${profile.businessId}/customers/${selectedCustomerId}/purchases`), purchaseLog);
        }
      }

      // Complete checkout visual modal flow
      const resolvedSale = {
        ...invoiceData,
        customerName: selectedCust ? selectedCust.name : "Cliente Geral",
        customerPhone: selectedCust ? selectedCust.phone : "",
        saleMode: selectedCustomerId === 'Walk-in' ? 'dinheiro' : saleMode,
        creditOutstandingAmount: creditOutstandingAmount,
        previousOutstandingBalance: preSaleBalance
      };
      setCompletedSale(resolvedSale);
      toast.success("Venda Concluída!");
      setCart([]);
      setRedeemedPoints(0);
    } catch (err: any) {
      console.error(err);
      if (err && err.code === 'insufficient_stock') {
        const insufficient = err.insufficient || [];
        setCart(prev => prev.map(item => {
          const conflict = insufficient.find((p: any) => p.id === item.id && p.selectedUnit === item.selectedUnit);
          if (conflict) {
            return {
              ...item,
              hasStockConflict: true,
              availableStock: conflict.available
            };
          }
          return item;
        }));

        insufficient.forEach((p: any) => {
          toast.error(`Stock alterado — apenas ${p.available} ${p.selectedUnit} de [${p.name}] disponíveis. Por favor ajuste a quantidade.`);
        });
      } else {
        toast.error("Checkout falhou: " + (err.message || String(err)));
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const isAnyModalOpen = 
    isShiftModalOpen ||
    isVoidReasonModalOpen ||
    isReturnModalOpen ||
    isCartDiscountModalOpen ||
    isItemOverrideModalOpen ||
    isReviewModalOpen ||
    isSuspendedModalOpen ||
    isSuspenseLabelModalOpen ||
    isCreditLimitModalOpen ||
    isCatalogOpen ||
    isQuickCustomerOpen ||
    isBrowseCustomersOpen ||
    isManagerPINOpen ||
    isHistoryOpen;

  const {
    inputBuffer,
    isCheatSheetOpen,
    setIsCheatSheetOpen,
    lastActionMessage
  } = useQuickSaleShortcuts({
    cart,
    setCart,
    products,
    currentShift,
    addToCart,
    updateCartQuantity,
    checkOutTransaction,
    paymentMethod,
    setPaymentMethod,
    setIsSuspenseLabelModalOpen,
    setIsSuspendedModalOpen,
    handleRemoveClick,
    closeAllModals: () => {
      setIsShiftModalOpen(false);
      setIsVoidReasonModalOpen(false);
      setIsReturnModalOpen(false);
      setIsCartDiscountModalOpen(false);
      setIsItemOverrideModalOpen(false);
      setIsReviewModalOpen(false);
      setIsSuspendedModalOpen(false);
      setIsSuspenseLabelModalOpen(false);
      setIsCreditLimitModalOpen(false);
      setIsCatalogOpen(false);
      setIsQuickCustomerOpen(false);
      setIsBrowseCustomersOpen(false);
      setIsManagerPINOpen(false);
      setIsHistoryOpen(false);
    },
    matchProductByBarcodeOrSku,
    resolveDefaultUnit,
    getUnitMultiplier,
    isModalOpen: isAnyModalOpen
  });

  // ==========================================
  // VOID & RETURN ACTIONS
  // ==========================================

  const executeVoidItem = async (authorizedByManager = false, approvedBy?: string) => {
    if (!voidItem || !profile?.businessId) return;
    
    const prices = getCartItemPricing(voidItem);
    const requiresManagerPin = prices.total > voidPinThreshold;

    if (requiresManagerPin && !authorizedByManager) {
      setManagerPINAction(`Anular Artigo (${prices.total.toFixed(0)} MT)`);
      setActivePINActionType('void_item');
      setIsManagerPINOpen(true);
      return;
    }

    // Execute the removal
    setCart(prev => prev.filter(item => !(item.id === voidItem.id && item.selectedUnit === voidItem.selectedUnit)));
    
    // Log voided item to businesses/{businessId}/auditLogs
    try {
      const finalReason = voidReason === 'Other' ? (customVoidReason || 'Outro motivo') : voidReason;
      
      await logAuditEvent({
        businessId: profile.businessId,
        eventType: 'item_voided',
        performedBy: {
          uid: profile.uid || '',
          name: profile.displayName || profile.email || 'Utilizador',
          email: profile.email || '',
        },
        approvedBy: approvedBy || (requiresManagerPin ? 'Gerente' : undefined),
        originalValue: prices.total,
        newValue: 0,
        reason: finalReason,
        cartSessionId: cartSessionId,
        details: {
          itemId: voidItem.id,
          itemName: voidItem.name,
          itemUnit: voidItem.selectedUnit || 'un',
          itemQty: voidItem.quantity,
          itemTotal: prices.total
        }
      });
      toast.success("Artigo anulado e registado no histórico de auditoria.");
    } catch (e) {
      console.error("[POS] Error logging void audit:", e);
      toast.error("Item removido, mas falhou ao gravar log de auditoria.");
    }

    // Reset states
    setIsVoidReasonModalOpen(false);
    setVoidItem(null);
  };

  const handleSearchInvoice = async () => {
    if (!searchInvoiceTerm.trim() || !profile?.businessId) return;
    setLoadingInvoices(true);
    try {
      const invoicesRef = collection(db, `businesses/${profile.businessId}/invoices`);
      const qNum = query(invoicesRef, where('invoiceNumber', '==', searchInvoiceTerm.trim()));
      const snapNum = await getDocs(qNum);
      if (!snapNum.empty) {
        const list = snapNum.docs.map(d => ({ id: d.id, ...d.data() }));
        setRecentInvoices(list);
        setLoadingInvoices(false);
        return;
      }

      // Fallback query limit 100 and filter in memory
      const { orderBy, limit } = await import('firebase/firestore');
      const snapAll = await getDocs(query(invoicesRef, orderBy('createdAt', 'desc'), limit(100)));
      const filtered = snapAll.docs
        .map(d => ({ id: d.id, ...d.data() as any }))
        .filter(inv => {
          const invIdMatches = inv.id?.toLowerCase().includes(searchInvoiceTerm.trim().toLowerCase()) || 
            inv.invoiceNumber?.toLowerCase().includes(searchInvoiceTerm.trim().toLowerCase());
          const customerNameMatches = inv.createdByName?.toLowerCase().includes(searchInvoiceTerm.trim().toLowerCase()) ||
            inv.customerId?.toLowerCase().includes(searchInvoiceTerm.trim().toLowerCase()) ||
            inv.customerName?.toLowerCase().includes(searchInvoiceTerm.trim().toLowerCase());
          return invIdMatches || customerNameMatches;
        });

      setRecentInvoices(filtered);
    } catch (err) {
      console.error("Error searching invoices:", err);
      toast.error("Erro ao pesquisar faturas.");
    } finally {
      setLoadingInvoices(false);
    }
  };

  const executeRefund = async (authorizedByManager = false, approvedBy?: string) => {
    if (!selectedInvoice || !profile?.businessId) return;

    const returnedItems = selectedInvoice.items.map((item: any) => {
      const qtyToReturn = returnQuantities[`${item.id}-${item.selectedUnit}`] || 0;
      return {
        ...item,
        quantity: qtyToReturn
      };
    }).filter((item: any) => item.quantity > 0);

    if (returnedItems.length === 0) {
      toast.error("Selecione pelo menos um artigo com quantidade a devolver.");
      return;
    }

    const refundAmount = returnedItems.reduce((acc: number, item: any) => acc + (item.price * item.quantity), 0);

    if (!authorizedByManager) {
      setManagerPINAction(`Reembolso (${refundAmount.toFixed(1)} MT)`);
      setActivePINActionType('refund_sale');
      setIsManagerPINOpen(true);
      return;
    }

    setIsProcessingReturn(true);
    try {
      const batch = writeBatch(db);
      const returnId = `RET-${Date.now()}`;
      const finalReason = returnReason === 'Other' ? (customReturnReason || 'Outro motivo') : returnReason;

      const returnRecord = {
        id: returnId,
        invoiceId: selectedInvoice.id,
        returnedItems: returnedItems,
        refundAmount: refundAmount,
        refundMethod: refundMethod,
        reason: finalReason,
        shiftId: currentShift?.id || '',
        returnedBy: profile.email || profile.displayName || 'Utilizador',
        createdAt: new Date().toISOString(),
        businessId: profile.businessId
      };

      const returnDocRef = doc(db, `businesses/${profile.businessId}/returns`, returnId);
      batch.set(returnDocRef, returnRecord);

      // Restock products back to inventory
      for (const returnedItem of returnedItems) {
        const dbProd = products.find(p => p.id === returnedItem.id);
        if (dbProd) {
          const multiplier = getUnitMultiplier(dbProd, returnedItem.selectedUnit);
          const itemsToAdd = returnedItem.quantity * multiplier;
          
          let updateFields: any = {
            stockLevel: increment(itemsToAdd)
          };

          if (isBoxUnit(dbProd, returnedItem.selectedUnit)) {
            updateFields.stockCx = increment(returnedItem.quantity);
          } else if (isPackUnit(dbProd, returnedItem.selectedUnit)) {
            updateFields.stockEmb = increment(returnedItem.quantity);
          } else {
            updateFields.stockUn = increment(returnedItem.quantity);
          }

          batch.update(doc(db, `businesses/${profile.businessId}/products`, returnedItem.id), updateFields);
        }
      }

      // Update Active Shift balance/sales totals
      if (currentShift) {
        const shiftRef = doc(db, `businesses/${profile.businessId}/pos_shifts`, currentShift.id);
        const shiftUpdates: any = {
          totalSales: increment(-refundAmount),
        };
        const methodKey = refundMethod.toLowerCase();
        if (['cash', 'mpesa', 'emola', 'bank', 'card', 'credit'].includes(methodKey)) {
          shiftUpdates[`paymentBreakdown.${methodKey}`] = increment(-refundAmount);
        }
        batch.update(shiftRef, shiftUpdates);
      }

      await batch.commit();

      // Log stock movements in background
      try {
        const { addDoc, collection, serverTimestamp } = await import('firebase/firestore');
        for (const returnedItem of returnedItems) {
          const dbProd = products.find(p => p.id === returnedItem.id);
          const multiplier = dbProd ? getUnitMultiplier(dbProd, returnedItem.selectedUnit) : 1;
          const itemsToAdd = returnedItem.quantity * multiplier;

          await addDoc(collection(db, `businesses/${profile.businessId}/stock_movements`), {
            productId: returnedItem.id,
            productName: returnedItem.name,
            qtyChange: itemsToAdd,
            type: 'devolucao',
            reference: returnId,
            reportedBy: profile.email || 'Utilizador',
            timestamp: serverTimestamp()
          });
        }

        // Adjust customer financials if not walk-in
        if (selectedInvoice.customerId && selectedInvoice.customerId !== 'Walk-in') {
          const custRef = doc(db, `businesses/${profile.businessId}/customers`, selectedInvoice.customerId);
          if (refundMethod === 'credit') {
            await updateDoc(custRef, {
              outstandingBalance: increment(-refundAmount)
            });
          } else {
            await updateDoc(custRef, {
              totalSpent: increment(-refundAmount)
            });
          }
        }
      } catch (errM) {
        console.error("[POS] Error recording return details:", errM);
      }

      // Log compliance audit event
      await logAuditEvent({
        businessId: profile.businessId,
        eventType: 'refund_processed',
        performedBy: {
          uid: profile.uid || '',
          name: profile.displayName || profile.email || 'Utilizador',
          email: profile.email || '',
        },
        approvedBy: approvedBy || 'Gerente',
        originalValue: selectedInvoice.total,
        newValue: Math.max(0, selectedInvoice.total - refundAmount),
        reason: finalReason,
        relatedInvoiceId: selectedInvoice.id,
        details: {
          returnId,
          refundAmount,
          refundMethod,
          returnedItems: returnedItems.map(ri => ({ id: ri.id, name: ri.name, qty: ri.quantity, unit: ri.selectedUnit }))
        }
      });

      toast.success("Devolução e reembolso concluídos com sucesso!");
      triggerRefundPrint(returnRecord, selectedInvoice);

      setIsReturnModalOpen(false);
      setSelectedInvoice(null);
      setReturnQuantities({});
      setReturnReason('Wrong size/item');
      setCustomReturnReason('');
    } catch (e) {
      console.error("[POS] Return execution failed:", e);
      toast.error("Falha ao processar reembolso.");
    } finally {
      setIsProcessingReturn(false);
    }
  };

  const triggerRefundPrint = (returnRecord: any, originalInvoice: any) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Pop-up bloqueado pelo navegador! Ative os pop-ups para imprimir.");
      return;
    }

    const bizName = businessData?.name || profile?.businessName || 'Sabush System ERP';
    const bizAddress = businessData?.address || "Morada do Estabelecimento";
    const bizPhone = businessData?.phone || "Telemóvel Comercial";
    const bizNif = businessData?.taxId || "NIF Contribuinte";
    const cashierLabel = returnRecord.returnedBy || profile?.displayName || "Operador";
    const formattedDate = formatDateTimeInTimezone(returnRecord.createdAt || new Date().toISOString(), 'Africa/Maputo');

    const returnedItems = returnRecord.returnedItems || [];

    const pagesHtml = `
      <div class="invoice-page">
        <div class="invoice-header" style="text-align: center;">
          <div style="font-size: 15px; font-weight: bold; text-transform: uppercase;">${bizName}</div>
          <div style="font-size: 11px; color: #111;">${bizAddress} | Tel: ${bizPhone}</div>
          <div style="font-size: 11px; color: #111;">NIF/NUIT: ${bizNif}</div>
          <hr style="border: none; border-top: 1px dashed #000; margin: 6px 0;" />
          
          <div style="font-size: 13px; font-weight: bold; margin: 8px 0; text-transform: uppercase; background: #eee; padding: 4px;">
            RECIBO DE REEMBOLSO / DEVOLUÇÃO
          </div>

          <div style="display: flex; justify-content: space-between; font-size: 11px;">
            <span><strong>Nº Devolução:</strong> #${returnRecord.id}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 11px; margin-top: 2px;">
            <span><strong>Fatura Original:</strong> #${returnRecord.invoiceId}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 11px; margin-top: 2px;">
            <span><strong>Operador:</strong> ${cashierLabel}</span>
            <span><strong>Data:</strong> ${formattedDate}</span>
          </div>
        </div>
        
        <hr style="border: none; border-top: 1px solid #000; margin: 6px 0;" />

        <table class="items-table">
          <thead>
            <tr style="border-bottom: 1px solid #000;">
              <th align="left">Artigo</th>
              <th align="center">Qtd Dev</th>
              <th align="right">Preço</th>
              <th align="right">Total Dev</th>
            </tr>
          </thead>
          <tbody>
            ${returnedItems.map((item: any) => `
              <tr>
                <td>${item.name}</td>
                <td align="center">${item.quantity}</td>
                <td align="right">${item.price.toFixed(2)}</td>
                <td align="right">${(item.price * item.quantity).toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <hr style="border: none; border-top: 1px dashed #000; margin: 6px 0;" />

        <div style="font-size: 11px; font-family: monospace;">
          <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 13px; margin-top: 4px; border-top: 1px dashed #000; padding-top: 4px;">
            <span>TOTAL DEVOLVIDO:</span>
            <span>${returnRecord.refundAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT</span>
          </div>
          
          <div style="margin-top: 6px; font-size: 10px; line-height: 1.3; background: #eee; padding: 4px; color: #000; border: 1px solid #ccc;">
            <strong>Modo de Reembolso:</strong> ${returnRecord.refundMethod?.toUpperCase()} <br/>
            <strong>Motivo:</strong> ${returnRecord.reason}
          </div>

          <div style="margin-top: 30px; display: flex; justify-content: space-between; font-size: 9px; font-family: sans-serif;">
            <div style="border-top: 1px solid #000; width: 45%; text-align: center; padding-top: 4px; margin-top: 15px;">
              Assinatura do Operador
            </div>
            <div style="border-top: 1px solid #000; width: 45%; text-align: center; padding-top: 4px; margin-top: 15px;">
              Assinatura do Cliente
            </div>
          </div>

          <div class="thanks-note" style="margin-top: 25px; text-align: center; font-style: italic; font-weight: bold; font-size: 11px;">
            Devolução processada com sucesso.<br/>
            SABUSH SYSTEM ERP
          </div>
        </div>
      </div>
    `;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Recibo Devolução #${returnRecord.id}</title>
        <style>
          @page {
            size: 80mm auto;
            margin: 0;
          }
          body {
            font-family: 'JetBrains Mono', Courier, monospace;
            width: 74mm;
            margin: 0 auto;
            padding: 10px;
            background: white;
            color: black;
            box-sizing: border-box;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .invoice-page {
            box-sizing: border-box;
            background: #fff;
            padding: 2px;
            width: 100%;
          }
          .items-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
            font-family: 'JetBrains Mono', Courier, monospace;
          }
          .items-table th {
            font-size: 11px;
            font-weight: bold;
            padding: 4px 0;
            border-bottom: 1px solid #000;
          }
          .items-table td {
            font-size: 11px;
            padding: 4px 0;
            vertical-align: top;
          }
          .thanks-note {
            margin-top: 15px;
            text-align: center;
            font-style: italic;
            font-weight: bold;
            font-size: 12px;
          }
          @media print {
            body {
              width: 74mm !important;
              max-width: 74mm !important;
              margin: 0 auto !important;
              padding: 10px !important;
            }
          }
        </style>
      </head>
      <body onload="window.focus(); setTimeout(function() { window.print(); window.close(); }, 500);">
        ${pagesHtml}
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  useEffect(() => {
    if (isReturnModalOpen && profile?.businessId) {
      setLoadingInvoices(true);
      const invoicesRef = collection(db, `businesses/${profile.businessId}/invoices`);
      const q = query(invoicesRef, orderBy('createdAt', 'desc'), limit(15));
      getDocs(q).then(snapshot => {
        const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setRecentInvoices(list);
        setLoadingInvoices(false);
      }).catch(err => {
        console.error("Error fetching recent invoices:", err);
        setLoadingInvoices(false);
      });
    }
  }, [isReturnModalOpen, profile?.businessId]);

  // If Drawer / Shift not open
  if (!currentShift) {
    return (
      <div className="flex flex-col items-center justify-center p-6 bg-slate-50 min-h-[500px] h-[calc(100vh-140px)] w-full mx-auto md:p-8">
        <div className="w-full max-w-md bg-white border border-[#E9E1D2] p-8 rounded-[40px] shadow-xl flex flex-col items-center">
          <div className="p-4 bg-amber-50 text-amber-600 rounded-full mb-4">
            <Lock size={32} className="stroke-[2]" />
          </div>
          <h2 className="text-xl font-black text-[#1D1510] mb-1 font-sans text-center">Abertura de Turno e Caixa</h2>
          <p className="text-xs text-[#8B735F] text-center mb-6 font-sans leading-relaxed font-semibold">
            Declare o fundo de maneio inicial e selecione o terminal para abrir a gaveta e iniciar o registo de vendas.
          </p>

          <div className="w-full space-y-4 mb-6">
            {/* Terminal Selector */}
            <div className="text-left">
              <label className="block text-[10px] font-black text-[#8B735F] uppercase tracking-wider mb-2 font-sans">Selecione o Terminal / Balcão</label>
              <select
                className="w-full px-4 py-2.5 bg-slate-50 border border-[#E9E1D2] rounded-xl text-xs font-bold text-[#1D1510] outline-none"
                value={selectedTerminal}
                onChange={e => setSelectedTerminal(e.target.value)}
              >
                <option value="Caixa Geral">Caixa Geral - Principal</option>
                <option value="Caixa 01 - Frente">Caixa 01 - Entrada</option>
                <option value="Caixa 02 - Retalho">Caixa 02 - Retalho</option>
                <option value="Terminal Takeaway">Terminal Móvel / Takeaway</option>
                <option value="Esplanada">Esplanada / Mesa</option>
              </select>
            </div>

            {/* Float Cash Input */}
            <div className="text-left">
              <div className="flex justify-between items-center mb-2">
                <label className="block text-[10px] font-black text-[#8B735F] uppercase tracking-wider font-sans">Fundo de Maneio Inicial (Float)</label>
                <button
                  type="button"
                  onClick={() => setIsOpeningCalculatorOpen(!isOpeningCalculatorOpen)}
                  className="text-[9px] text-[#B8791A] font-black uppercase tracking-wider hover:underline cursor-pointer"
                >
                  {isOpeningCalculatorOpen ? "Fechar Calculadora ✖" : "Contar Notas/Moedas 🪙"}
                </button>
              </div>

              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400 font-mono">{currency}</span>
                <input 
                  type="number" 
                  placeholder="Ex: 500.0" 
                  className="w-full pl-14 pr-4 py-3 bg-slate-50 border border-[#E9E1D2] rounded-2xl text-sm font-bold font-mono outline-none focus:border-[#B8791A] transition-all text-[#1D1510]"
                  value={openingFloat}
                  onChange={e => setOpeningFloat(e.target.value)}
                />
              </div>

              {isOpeningCalculatorOpen && (
                <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                  {renderDenominationsCalc(
                    openingDenominations,
                    setOpeningDenominations,
                    (total) => {
                      setOpeningFloat(String(total));
                      setIsOpeningCalculatorOpen(false);
                      toast.success(`Fundo inicial de ${total.toFixed(1)} MT aplicado!`);
                    }
                  )}
                </div>
              )}
            </div>
          </div>

          <button
            onClick={handleOpenShift}
            className="w-full py-4 bg-[#1D1510] hover:bg-[#34261E] text-[#FCFAF6] font-black text-xs uppercase tracking-widest rounded-2xl shadow-md transition-all cursor-pointer active:scale-98"
          >
            Abrir Caixa & Iniciar Vendas
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-full bg-[#F4F8FA] pos-root p-3 select-none overflow-hidden font-sans gap-1.5">
      
      {/* Quick Sale Keyboard Status & Buffer Bar */}
      <div className="bg-[#1D1510] border border-orange-900/35 text-white py-1 px-3.5 rounded-lg flex items-center justify-between gap-3 text-[11px] shadow-sm shrink-0 h-8">
        <div className="flex items-center gap-2">
          <span className="bg-[#B8791A] text-[#4A1B0C] px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider animate-pulse flex items-center gap-1 shrink-0">
            <span className="shrink-0">⚡</span> QUICK
          </span>
          {inputBuffer ? (
            <div className="flex items-center gap-2">
              <span className="text-blue-300 font-medium">Comando:</span>
              <span className="font-mono bg-[#4A1B0C] text-[#FAECE7] px-2 py-0.5 rounded text-xs font-black border border-[#B8791A]/30 select-all tracking-wider">
                {inputBuffer}
              </span>
              <span className="text-[10px] text-blue-300 font-bold uppercase tracking-wide hidden sm:inline">
                [Enter: confirmar • Esc: limpar]
              </span>
            </div>
          ) : lastActionMessage ? (
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
              <span className="text-blue-300 font-medium">Última ação:</span>
              <span className="bg-emerald-950/40 px-2 py-0.5 rounded text-[10.5px]">
                {lastActionMessage}
              </span>
            </div>
          ) : (
            <span className="text-blue-300 text-[10.5px] font-medium hidden md:inline truncate">
              Digite SKU ou QTD (Ex: <code className="text-blue-200 bg-[#4A1B0C]/40 px-1 py-0.5 rounded font-mono">3x</code>). Pressione <strong className="text-orange-400 font-black font-mono">?</strong> para ajuda.
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setIsCheatSheetOpen(true)}
          className="flex items-center gap-1 px-2 py-0.5 bg-[#4A1B0C] hover:bg-[#5C2310] text-[#FAECE7] rounded text-[9px] font-black uppercase tracking-wider transition-all border border-[#B8791A]/20 cursor-pointer h-6"
        >
          <span>⌨️ Atalhos [?]</span>
        </button>
      </div>

      {/* SECTION 1: TOP BAR — SEARCH + SCANNER ICONS (COMPACT ROW 1) */}
      <div className="bg-white border border-blue-200 px-2 py-1 shrink-0 rounded-lg text-blue-900 select-none flex flex-row items-center gap-2 h-8">
        <div className="relative flex-1 flex items-center gap-2 h-full min-w-0">
          {/* Main search field */}
          <div className="relative flex-1 h-full">
            <input 
              ref={searchInputRef}
              type="text"
              placeholder="Pesquisar produto (Nome, SKU, Código de Barras)..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setTimeout(() => setIsSearchFocused(false), 250)}
              className="w-full h-6 pl-3 pr-7 bg-white border border-blue-200 rounded-md text-blue-900 placeholder-blue-400 text-[11px] outline-none focus:border-[#B8791A]/50 transition-all font-sans"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-400 hover:text-blue-600"
              >
                <X size={12} />
              </button>
            )}

            {/* Auto Dropdown listing matching search as types */}
            {isSearchFocused && filteredSearchProducts.length > 0 && (
              <div className="absolute left-0 right-0 top-7 bg-white text-blue-900 border border-blue-200 rounded-lg shadow-2xl z-50 max-h-[300px] overflow-y-auto overflow-x-hidden font-sans">
                {filteredSearchProducts.map(p => (
                  <div 
                    key={p.id}
                    onClick={() => {
                      addToCart(p);
                      setSearchTerm('');
                    }}
                    className="flex justify-between items-center px-3 py-2 hover:bg-blue-50/50 border-b border-blue-50 cursor-pointer transition-colors"
                  >
                    <div className="flex flex-col pr-2 min-w-0 flex-1">
                      <span className="text-[11px] font-black truncate">{p.name}</span>
                      <span className="text-[9px] text-blue-600 truncate">SKU: {p.sku || 'N/A'} | Barcode: {p.barcode || 'N/A'}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[11px] font-bold text-orange-600">{(p.price || 0).toLocaleString()} MT</span>
                      <span className="block text-[8px] text-blue-400 mt-0.5">Stock: {p.stockLevel || 0}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Action Widgets Icons */}
        <div className="flex items-center gap-1.5 shrink-0 h-full">
          {/* Shift Indicator Button */}
          <button
            type="button"
            onClick={() => {
              setIsShiftModalOpen(true);
              setIsClosingShiftForm(false);
            }}
            className={cn(
              "h-6 px-2 rounded-md flex items-center gap-1 transition-all cursor-pointer relative font-sans text-[10px] font-black uppercase tracking-wider shrink-0",
              currentShift 
                ? "bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100/80" 
                : "bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100/80"
            )}
            title="Estado do Turno de Caixa"
          >
            <div className={cn("w-1.5 h-1.5 rounded-full", currentShift ? "bg-emerald-500 animate-pulse" : "bg-rose-500")} />
            <span className="hidden md:inline">
              {currentShift 
                ? `Turno Aberto (${new Date(currentShift.openedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})})` 
                : "Turno Fechado"}
            </span>
            <span className="md:hidden">
              {currentShift ? "Aberto" : "Fechado"}
            </span>
          </button>

          {/* Returns & Refunds button (🔄) */}
          <button 
            type="button"
            onClick={() => setIsReturnModalOpen(true)}
            className="h-6 px-2 bg-rose-950/20 text-rose-400 hover:bg-rose-950/35 border border-rose-900/30 rounded-md flex items-center gap-1 transition-all cursor-pointer font-bold text-[10px] shrink-0"
            title="Processar devolução de uma venda efetuada"
          >
            <RefreshCw size={11} />
            <span className="hidden md:inline">Devoluções</span>
          </button>

          {/* Camera lens selector (📷) */}
          <button 
            type="button"
            onClick={() => setIsCameraActive(!isCameraActive)}
            className={cn(
              "h-6 px-2 rounded-md flex items-center gap-1 transition-all cursor-pointer relative shrink-0",
              isCameraActive 
                ? "bg-[#0C3A42] text-[#E3F4F2]" 
                : "bg-[#0C3A42] text-[#E3F4F2] hover:opacity-90"
            )}
            title="Sincronizar Câmara"
          >
            <Camera size={11} className="text-[#E3F4F2]" />
            <span className="text-[10px] font-bold text-[#E3F4F2] hidden md:inline">Câmara Scanner</span>
            <span className="absolute top-1 right-1 w-1 h-1 rounded-full bg-emerald-400"></span>
          </button>

          {/* Hardware visual active icon (〄) */}
          <div 
            className="h-6 px-2 bg-[#0C3A42] text-[#E3F4F2] rounded-md flex items-center gap-1 pointer-events-none shrink-0"
            title="Modo USB escuta automática ativo"
          >
            <span className="text-[10px] text-amber-300">〄</span>
            <span className="text-[10px] font-bold text-[#E3F4F2] hidden md:inline">USB Ouvinte</span>
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
          </div>

          {/* Categorized Product catalogs overlay modal trigger button (📦) */}
          <button
            type="button"
            onClick={() => setIsCatalogOpen(true)}
            className="h-6 px-2 bg-[#0C3A42] text-[#E3F4F2] hover:opacity-90 rounded-md flex items-center gap-1 transition-all cursor-pointer shrink-0"
          >
            <Package size={11} className="text-[#E3F4F2]" />
            <span className="text-[10px] font-bold text-[#E3F4F2] hidden md:inline">📦 Catálogo</span>
          </button>

          {/* Sync Status Component */}
          <div className="flex items-center gap-1.5 shrink-0">
            {isSyncing ? (
              <div className="h-6 px-2 bg-[#0C3A42] border border-[#E3F4F2]/15 text-[#E3F4F2]/85 rounded-md flex items-center gap-1 font-sans text-[10px] font-bold uppercase tracking-wider">
                <RefreshCw size={10} className="animate-spin text-amber-300" />
                <span className="hidden md:inline">A sincronizar...</span>
              </div>
            ) : !isOnline ? (
              <div className="h-6 px-2 bg-[#2d0f1a] border border-rose-500/35 text-rose-300 rounded-md flex items-center gap-1 font-sans text-[10px] font-bold uppercase tracking-wider relative">
                <div className="w-1 h-1 rounded-full bg-rose-500 animate-pulse" />
                <span>Offline</span>
                {pendingSales.filter(s => s.status === 'pending').length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-rose-600 text-white font-extrabold px-1 py-0.2 rounded-full text-[8px] animate-bounce">
                    {pendingSales.filter(s => s.status === 'pending').length}
                  </span>
                )}
              </div>
            ) : pendingSales.filter(s => s.status === 'pending').length > 0 ? (
              <button
                type="button"
                onClick={syncPendingSales}
                className="h-6 px-2 bg-[#2a1b0c] border border-amber-500/35 text-amber-300 hover:bg-[#3d2712] rounded-md flex items-center gap-1 transition-all cursor-pointer font-sans text-[10px] font-bold uppercase tracking-wider relative"
                title="Sincronizar Vendas Pendentes"
              >
                <RefreshCw size={10} className="text-amber-400 animate-pulse" />
                <span>{pendingSales.filter(s => s.status === 'pending').length} Pendentes</span>
              </button>
            ) : (
              <div className="h-6 px-2 bg-[#0c241b] border border-emerald-500/35 text-emerald-300 rounded-md flex items-center gap-1 font-sans text-[10px] font-bold uppercase tracking-wider">
                <div className="w-1 h-1 rounded-full bg-emerald-500" />
                <span>Online</span>
              </div>
            )}

            {/* Needs Review / Failed Stock Conflicts Section */}
            {pendingSales.filter(s => s.status === 'failed').length > 0 && (
              <button
                type="button"
                onClick={() => setIsReviewModalOpen(true)}
                className="h-6 px-2 bg-[#331c0d] border border-amber-500/60 text-amber-200 hover:bg-[#4d2a13] rounded-md flex items-center gap-1 transition-all cursor-pointer font-sans text-[10px] font-bold uppercase tracking-wider animate-pulse"
                title="Verificar vendas que falharam devido a conflito de stock ou outros erros"
              >
                <span className="text-amber-400 font-bold">⚠️</span>
                <span>Rever ({pendingSales.filter(s => s.status === 'failed').length})</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 2: CAMERA SCANNER PANEL */}
      <AnimatePresence>
        {isCameraActive && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-[#0C3A42] border border-blue-900/50 rounded-lg p-3 flex flex-col items-center relative overflow-hidden text-white shrink-0"
          >
            <button 
              onClick={() => setIsCameraActive(false)}
              className="absolute top-2 right-2 p-1 rounded-full hover:bg-white/10 text-blue-200 hover:text-white transition-colors cursor-pointer"
            >
              <X size={14} />
            </button>

            <h3 className="text-[10px] font-black uppercase tracking-widest text-orange-400 mb-2">Leitor de Câmara Integrado</h3>

            {/* Viewfinder elements layout */}
            <div className="relative w-72 h-36 bg-[#02182E] rounded-lg border border-white/10 overflow-hidden flex items-center justify-center">
              <video id="scanner-preview" className="w-full h-full object-cover" playsInline />
              
              {/* Orange viewfinder corner brackets */}
              <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-orange-500 rounded-tl"></div>
              <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-orange-500 rounded-tr"></div>
              <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-orange-500 rounded-bl"></div>
              <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-orange-500 rounded-br"></div>

              {/* Glowing vertical laser scan animation line */}
              <div className="absolute left-4 right-4 h-0.5 bg-orange-400 rounded opacity-85 shadow-[0_0_6px_3px_rgba(249,115,22,0.5)] animate-bounce select-none pointer-events-none"></div>

              {/* Live Scanner Banner updates */}
              {detectionBanner && (
                <div className="absolute bottom-2 left-2 right-2 bg-amber-500 text-blue-950 text-center text-[9px] font-extrabold uppercase py-0.5 rounded shadow-md animate-pulse">
                  {detectionBanner}
                </div>
              )}
            </div>

            {/* Flash & Inputs controls */}
            <div className="flex items-center gap-3 mt-2 w-72 justify-between">
              {cameras.length > 1 && (
                <select
                  value={selectedCameraId}
                  onChange={(e) => setSelectedCameraId(e.target.value)}
                  className="bg-[#0B3A60] border border-blue-500/30 py-0.5 px-2 rounded text-[10px] font-medium outline-none text-[#E3F4F2] focus:border-orange-500 h-6"
                >
                  {cameras.map((d: any, idx) => (
                    <option key={d.deviceId} value={d.deviceId}>Cam {idx + 1}</option>
                  ))}
                </select>
              )}
              
              <button
                type="button"
                onClick={() => setIsFlashOn(!isFlashOn)}
                className="h-6 px-2 bg-[#0B3A60] hover:bg-[#0E4B7C] border border-blue-500/30 text-[#E3F4F2] rounded text-[9px] font-black flex items-center gap-1 cursor-pointer"
              >
                <Zap size={10} className={cn(isFlashOn ? "text-amber-400 animate-pulse" : "text-white")} />
                {isFlashOn ? 'Lanterna On' : 'Lanterna'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SECTION 2: CLIENT & SALE MODE BAR (COMPACT ROW 2) */}
      <div 
        className="px-2 py-1 bg-white border border-blue-200 rounded-lg flex flex-row items-center justify-between gap-3 text-blue-900 select-none shrink-0 h-8"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest leading-none shrink-0">CLIENTE:</span>
          {selectedCustomerId === 'Walk-in' ? (
            <span className="bg-[#0C3A42]/10 border border-[#0C3A42]/20 text-[#0C3A42] font-black text-[10px] px-2 py-0.5 rounded-md uppercase shadow-xs leading-none shrink-0">
              WALK-IN
            </span>
          ) : (
            <div className="flex items-center gap-1 bg-[#B8791A]/10 border border-[#B8791A]/20 px-2 py-0.5 rounded-md shadow-xs leading-none shrink-0 max-w-[180px] min-w-0">
              <span className="text-[#B8791A] font-extrabold text-[11px] truncate">{selectedCust?.name}</span>
              {selectedCust?.phone && (
                <span className="text-[9px] text-blue-600 font-medium hidden sm:inline">({selectedCust?.phone})</span>
              )}
              {selectedCust?.outstandingBalance > 0 && (
                <span className="bg-amber-500 text-slate-950 font-black text-[8px] uppercase px-1 py-0.5 rounded ml-1 animate-pulse leading-none shrink-0">
                  Dívida: {selectedCust.outstandingBalance.toLocaleString()} MT
                </span>
              )}
              <button 
                onClick={() => {
                  setSelectedCustomerId('Walk-in');
                  setSaleMode('dinheiro');
                }}
                className="text-blue-400 hover:text-[#B8791A] transition-all p-0.5 rounded-full hover:bg-blue-50 shrink-0"
                title="Desvincular Cliente"
              >
                <X size={10} />
              </button>
            </div>
          )}

          {selectedCustomerId !== 'Walk-in' && selectedCust && (
            <button
              type="button"
              onClick={() => setIsHistoryOpen(true)}
              className="h-6 px-1.5 bg-blue-50 hover:bg-blue-100/80 rounded-md font-bold text-[10px] flex items-center gap-1 text-blue-700 transition-colors border border-blue-200 cursor-pointer shrink-0"
            >
              <History size={11} />
              <span className="hidden sm:inline">Histórico</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsBrowseCustomersOpen(true)}
            className="h-6 px-2 bg-white hover:bg-blue-50/40 text-blue-700 font-bold text-[10px] uppercase tracking-wider rounded-md transition-all border border-blue-200 flex items-center gap-1 cursor-pointer shrink-0"
          >
            <Users size={11} className="text-[#0C3A42]" />
            <span className="hidden sm:inline">Lista de Clientes</span>
            <span className="sm:hidden">Lista</span>
          </button>
          
          <button
            type="button"
            onClick={() => setIsQuickCustomerOpen(true)}
            className="h-6 px-2 bg-[#0C3A42] text-[#E3F4F2] hover:opacity-90 font-black text-[10px] uppercase tracking-wider rounded-md transition-all flex items-center gap-0.5 cursor-pointer border-none shrink-0"
          >
            <span>➕</span> <span className="hidden sm:inline">Novo Registo</span><span className="sm:hidden">Novo</span>
          </button>
        </div>

        {/* Right Side: Sale Mode (if eligible) & Retalho/Grosso Channel Toggle */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Sale Mode (Dinheiro / Fiado / Parcial) */}
          <div className="shrink-0">
            {selectedCustomerId === 'Walk-in' ? (
              <span className="text-[10px] text-blue-400 font-bold hidden lg:inline">🔒 Fiado indisponível para Walk-in</span>
            ) : (
              <div className="flex items-center bg-blue-100/50 p-0.5 rounded-md border border-blue-200 h-6">
                <button
                  type="button"
                  onClick={() => setSaleMode('dinheiro')}
                  className={cn(
                    "px-1.5 py-0 h-full rounded text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center",
                    saleMode === 'dinheiro' ? "bg-[#0C3A42] text-[#E3F4F2]" : "text-blue-600 hover:text-blue-800"
                  )}
                >
                  Dinheiro
                </button>
                <button
                  type="button"
                  onClick={() => setSaleMode('credito')}
                  className={cn(
                    "px-1.5 py-0 h-full rounded text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center",
                    saleMode === 'credito' ? "bg-[#B8791A] text-[#FAECE7]" : "text-blue-600 hover:text-blue-800"
                  )}
                >
                  Fiado
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSaleMode('parcial');
                    setPartialAmountPaid('');
                  }}
                  className={cn(
                    "px-1.5 py-0 h-full rounded text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center",
                    saleMode === 'parcial' ? "bg-[#0C3A42] text-[#E3F4F2]" : "text-blue-600 hover:text-blue-800"
                  )}
                >
                  Parcial
                </button>
              </div>
            )}
          </div>

          {/* Channel Selector */}
          <div className="flex items-center bg-blue-100/50 p-0.5 rounded-md border border-blue-200 h-6 shrink-0">
            <button
              type="button"
              onClick={() => handleToggleSaleType('retail')}
              className={cn(
                "px-2 py-0 h-full rounded text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 justify-center",
                saleType === 'retail' ? "bg-[#0C3A42] text-[#E3F4F2]" : "text-blue-600 hover:text-blue-800"
              )}
            >
              <span>📦</span> <span className="hidden sm:inline">Retalho</span>
            </button>
            <button
              type="button"
              onClick={() => handleToggleSaleType('wholesale')}
              className={cn(
                "px-2 py-0 h-full rounded text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 justify-center",
                saleType === 'wholesale' ? "bg-[#0C3A42] text-[#E3F4F2]" : "text-blue-600 hover:text-blue-800"
              )}
            >
              <span>🏭</span> <span className="hidden sm:inline">Grosso</span>
            </button>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT AREA: EXPANDED CART PANEL (Takes full width) */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0 min-w-0 mt-1">
        
        {/* EXPANDED TABBED CART PANEL - Cream themed background */}
        <div className="flex-1 bg-[#FAECE7]/20 rounded-3xl border border-blue-200 flex flex-col overflow-hidden shadow-sm font-sans relative">
          
          {/* PERSISTENT SUMMARY STRIP (Always visible) */}
          <div className="bg-white px-3 py-1.5 flex items-center justify-between shrink-0 border-b border-blue-200 select-none">
            <div className="flex items-center gap-1.5">
              <ShoppingCart size={13} className="text-blue-600" />
              <span className="text-[10px] font-black uppercase tracking-widest text-blue-600">Venda Corrente</span>
              <span className="bg-blue-100 text-black text-[8.5px] font-mono font-black px-1.5 py-0.5 rounded-full">
                {cart.reduce((s, i) => s + i.quantity, 0).toLocaleString(undefined, { maximumFractionDigits: 3 })} Artigos
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-blue-600 font-black uppercase tracking-wider">TOTAL:</span>
              <span className="font-mono text-sm font-black text-black">
                {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT
              </span>
            </div>
          </div>

          {/* TAB HEADERS */}
          <div className="flex border-b border-blue-200 bg-blue-50 shrink-0">
            <button
              type="button"
              onClick={() => setActiveCartTab('items')}
              className={cn(
                "flex-1 py-1.5 text-center text-xs font-black uppercase tracking-widest relative transition-all border-none cursor-pointer",
                activeCartTab === 'items' ? "text-blue-950 bg-white" : "text-blue-700/90 hover:text-blue-950 bg-blue-100/45"
              )}
            >
              Artigos
              {activeCartTab === 'items' && (
                <motion.div layoutId="cartActiveTabLine" className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#B8791A]" />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                if (cart.length === 0) {
                  toast.error("O carrinho está vazio.");
                  return;
                }
                setActiveCartTab('payment');
              }}
              disabled={cart.length === 0}
              className={cn(
                "flex-1 py-1.5 text-center text-xs font-black uppercase tracking-widest relative transition-all border-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed",
                activeCartTab === 'payment' ? "text-blue-950 bg-white" : "text-blue-700/90 hover:text-blue-950 bg-blue-100/45"
              )}
            >
              Pagamento
              {activeCartTab === 'payment' && (
                <motion.div layoutId="cartActiveTabLine" className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#B8791A]" />
              )}
            </button>
          </div>

          {/* TAB CONTENT WITH MOTION */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
            <AnimatePresence mode="wait">
              {activeCartTab === 'items' ? (
                <motion.div
                  key="items-tab"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.15 }}
                  className="flex-1 flex flex-col min-h-0 overflow-hidden"
                >
                  {/* Cart Actions Sub-Header (Suspender, Limpar) */}
                  <div className="px-3 py-1 bg-[#0C3A42]/10 border-b border-blue-200/50 flex items-center justify-between shrink-0">
                    <span className="text-[10px] font-black text-blue-950 uppercase tracking-wider">Gestão do Carrinho</span>
                    <div className="flex items-center gap-1">
                      {/* Suspended carts list button */}
                      <button
                        type="button"
                        onClick={() => setIsSuspendedModalOpen(true)}
                        className="relative px-2 py-1 bg-[#4A1B0C] hover:bg-[#5C2310] text-white rounded-lg text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 transition-all border border-transparent cursor-pointer"
                        title="Ver vendas em espera"
                      >
                        <span>⏳ Em Espera</span>
                        {suspendedCarts.length > 0 && (
                          <span className="bg-amber-400 text-blue-950 text-[8px] font-black px-1 py-0.2 rounded-full leading-none animate-bounce">
                            {suspendedCarts.length}
                          </span>
                        )}
                      </button>

                      {/* Put on hold button */}
                      <button
                        type="button"
                        onClick={() => {
                          if (cart.length === 0) {
                            toast.error("O carrinho está vazio.");
                            return;
                          }
                          setSuspenseCartLabel('');
                          setIsSuspenseLabelModalOpen(true);
                        }}
                        disabled={cart.length === 0}
                        className="px-2 py-1 bg-emerald-700 text-white hover:bg-emerald-850 rounded-lg text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 transition-all disabled:opacity-30 disabled:pointer-events-none cursor-pointer border-none"
                        title="Colocar venda em espera"
                      >
                        <span>➕ Suspender</span>
                      </button>

                      {/* Trash icon (🗑️) at the top right of this header to clear cart */}
                      <button
                        onClick={clearCart}
                        disabled={cart.length === 0}
                        title="Limpar de imediato toda a cesta"
                        className="p-1 hover:bg-rose-100 text-blue-500 hover:text-rose-700 rounded-lg transition-all border border-transparent disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Column headers below cart header */}
                  <div className="grid grid-cols-12 gap-1.5 px-3 py-1 bg-blue-100/60 border-b border-blue-200 select-none text-[10px] font-extrabold text-blue-800 uppercase tracking-wider shrink-0">
                    <div className="col-span-5 text-left">PRODUTO</div>
                    <div className="col-span-3 text-center">QTD</div>
                    <div className="col-span-2 text-right">PREÇO</div>
                    <div className="col-span-2 text-right">TOTAL</div>
                  </div>

                  {/* Scrollable Cart Items List */}
                  <div className="flex-1 overflow-y-auto p-0 min-h-0 cart-scrollbar bg-white divide-y divide-blue-100/40">
                    {cart.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-blue-400 p-4">
                        <ShoppingCart size={32} className="text-[#B8791A] mb-2 opacity-80" />
                        <span className="text-xs font-black tracking-widest text-blue-700 uppercase">CARRINHO VAZIO</span>
                        <span className="text-[10px] text-blue-600 mt-1 max-w-[220px] text-center leading-normal font-medium">
                          Pesquise um produto no campo de pesquisa superior para começar a compor a venda.
                        </span>
                      </div>
                    ) : (
                      cart.map((item) => (
                        <CartItemRow
                          key={`${item.id}-${item.selectedUnit}`}
                          item={item}
                          prices={getCartItemPricing(item)}
                          updateCartQuantity={updateCartQuantity}
                          handleRemoveClick={handleRemoveClick}
                          onPriceClick={(clickedItem) => {
                            setNumericKeypadItem(clickedItem);
                            setNumericKeypadMode('price');
                            setIsNumericKeypadOpen(true);
                          }}
                        />
                      ))
                    )}
                  </div>

                  {/* PROCEED TO PAYMENT CTA BUTTON (Fixed at the bottom of the Items tab if cart has items) */}
                  {cart.length > 0 && (
                    <div className="p-1.5 bg-white border-t border-blue-200/50 shrink-0">
                      <button
                        type="button"
                        onClick={() => setActiveCartTab('payment')}
                        className="w-full py-1.5 bg-[#B8791A] hover:bg-[#E8500A] text-white rounded-xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 cursor-pointer border-none shadow-sm"
                      >
                        <span>Prosseguir para Pagamento</span>
                        <span>➡️</span>
                      </button>
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="payment-tab"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.15 }}
                  className="flex-1 flex flex-col min-h-0 overflow-y-auto p-2 space-y-2 bg-blue-50/20"
                >
                  {/* Back to Items trigger button */}
                  <button
                    type="button"
                    onClick={() => setActiveCartTab('items')}
                    className="flex items-center gap-1.5 text-[9.5px] text-blue-600 font-extrabold uppercase tracking-wider hover:text-blue-800 text-left bg-transparent border-none cursor-pointer self-start"
                  >
                    <span>⬅️</span> Voltar para Artigos
                  </button>

                  {/* Breakdown details list */}
                  <div className="space-y-1 text-[11px] font-bold text-blue-900">
                    <div className="flex justify-between items-center bg-blue-50 px-2.5 py-1.5 rounded-lg border border-blue-100/50 text-blue-950 shadow-xs">
                      <span>Artigos No Carrinho:</span>
                      <span className="font-black text-blue-950 font-mono">
                        {cart.reduce((s, i) => s + i.quantity, 0).toLocaleString(undefined, { maximumFractionDigits: 3 })} un
                      </span>
                    </div>
                    <div className="flex justify-between items-center bg-blue-50 px-2.5 py-1.5 rounded-lg border border-blue-100/50 text-blue-950 shadow-xs">
                      <span>Subtotal (sem IVA):</span>
                      <span className="font-black text-blue-950 font-mono">
                        {produtosSemIvaValue.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MT
                      </span>
                    </div>
                    <div className="flex justify-between items-center bg-blue-50 px-2.5 py-1.5 rounded-lg border border-blue-100/50 text-blue-950 shadow-xs">
                      <span>Subtotal Geral (com IVA):</span>
                      <span className="font-black text-blue-950 font-mono">
                        {subtotal.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MT
                      </span>
                    </div>
                    
                    {/* Manual Global Discount Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setEditCartDiscountType(cartDiscountType);
                        setEditCartDiscountValue(cartDiscountValue.toString());
                        setOverrideReason('');
                        setIsCartDiscountModalOpen(true);
                      }}
                      className="w-full flex justify-between items-center bg-amber-50 hover:bg-amber-100/70 px-2.5 py-1.5 rounded-lg border border-amber-200/60 text-amber-950 text-[11px] font-extrabold transition-all cursor-pointer text-left shadow-xs border-none"
                      title="Clique para gerir descontos globais do carrinho"
                    >
                      <span className="flex items-center gap-1 font-black uppercase tracking-wider text-[9.5px] text-amber-950">
                        🏷️ Desconto Global: 
                        {cartDiscountType !== 'none' && (
                          <span className="font-mono text-[8.5px] px-1 bg-amber-200 text-amber-950 rounded font-black">
                            {cartDiscountType === 'percent' ? `${cartDiscountValue}%` : 'Fixo'}
                          </span>
                        )}
                      </span>
                      <span className="font-black font-mono text-amber-950">
                        {manualDiscount > 0 ? `-${manualDiscount.toLocaleString()} MT` : 'Adicionar Desconto'}
                      </span>
                    </button>

                    <div className="flex justify-between items-center bg-blue-50 px-2.5 py-1.5 rounded-lg border border-blue-100/50 text-blue-950 shadow-xs">
                      <span>IVA Incluído ({userTaxValue}%):</span>
                      <span className="font-black text-blue-950 font-mono">{ivaCalculated.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MT</span>
                    </div>

                    {/* PROMINENT GRAND TOTAL TO BE ULTRA VISIBLE */}
                    <div className="flex justify-between items-center bg-white px-3 py-2.5 rounded-xl border border-blue-200 shadow-sm my-1.5 select-none">
                      <span className="text-[11px] font-black uppercase tracking-wider text-blue-600">TOTAL A PAGAR:</span>
                      <span className="font-mono text-base font-black text-black">
                        {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT
                      </span>
                    </div>
                  </div>

                  {/* Customer Debt details / Partial input elements */}
                  {selectedCustomerId !== 'Walk-in' && selectedCust && saleMode !== 'dinheiro' && (
                    <div className="bg-blue-50/50 border border-blue-150 p-2.5 rounded-lg text-[11px] font-sans space-y-2 text-left text-blue-900">
                      {saleMode === 'credito' && (
                        <div className="space-y-1">
                          <span className="text-blue-600 font-extrabold uppercase text-[8px] tracking-widest block">Dívida provisória:</span>
                          <div className="flex flex-col gap-1 text-[11px] font-mono text-blue-900 bg-blue-100/40 p-1.5 rounded">
                            <div>Acréscimo: <b className="text-rose-600">+{total.toLocaleString()} MT</b></div>
                            <div className="border-t border-blue-200/50 mt-1 pt-1">Futuro saldo total: <b className="text-amber-800">{(preSaleBalance + total).toLocaleString()} MT</b></div>
                          </div>
                        </div>
                      )}

                      {saleMode === 'parcial' && (
                        <div className="space-y-2">
                          <div className="space-y-1">
                            <label className="block text-[8px] font-black tracking-widest text-blue-600 uppercase">Valor Pago Agora (Entrada):</label>
                            <div className="flex gap-1.5">
                              <div className="relative flex-1">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 font-mono font-bold text-[9.5px] text-blue-500">MT</span>
                                <input
                                  type="number"
                                  placeholder="Ex: 500"
                                  value={partialAmountPaid}
                                  onChange={(e) => setPartialAmountPaid(e.target.value)}
                                  className="w-full bg-white border border-blue-200 rounded-lg pl-7 pr-1.5 py-1 font-mono text-xs font-bold text-blue-900 outline-none focus:border-blue-400 h-7 font-sans"
                                />
                              </div>
                              <div className="flex gap-1 shrink-0">
                                {[0.25, 0.5, 0.75].map((percent) => {
                                  const calculatedFraction = Math.round(total * percent);
                                  return (
                                    <button
                                      key={percent}
                                      type="button"
                                      onClick={() => setPartialAmountPaid(calculatedFraction.toString())}
                                      className="bg-blue-50 border border-blue-200 hover:bg-blue-100 text-[9px] font-extrabold h-7 px-1 rounded transition-colors text-blue-800 cursor-pointer"
                                    >
                                      {percent * 100}%
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          <div className="flex justify-between items-center text-[10px] font-mono bg-blue-100/30 border border-blue-200 p-1.5 rounded-lg text-blue-800 leading-none">
                            <div>Pago (Entrada): <span className="font-extrabold text-blue-950">{(Number(partialAmountPaid) || 0).toLocaleString()} MT</span></div>
                            <div>Fiado Pendente: <div className="inline-block font-extrabold text-[#B8791A]">{creditFired.toLocaleString()} MT</div></div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Loyalty Points controls */}
                  {selectedCustomerId !== 'Walk-in' && selectedCust && (
                    <div className="bg-gradient-to-br from-blue-50/60 to-amber-50/10 border border-blue-150 p-2.5 rounded-xl text-[11px] font-sans space-y-2 text-left text-blue-900">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm">🪙</span>
                          <div>
                            <span className="text-blue-500 font-extrabold uppercase text-[8px] tracking-widest block leading-none">Pontos de Fidelização</span>
                            <span className="font-bold text-xs text-amber-800 font-mono mt-0.5 block leading-none">
                              {(selectedCust.loyaltyPoints || 0).toLocaleString()} pts
                              <span className="text-[9px] font-bold text-blue-500 ml-1.5 font-sans">
                                ({(selectedCust.loyaltyPoints || 0) >= 1000 ? "👑 Platina" :
                                  (selectedCust.loyaltyPoints || 0) >= 500 ? "🌟 Ouro" :
                                  (selectedCust.loyaltyPoints || 0) >= 100 ? "Prata ⭐" : "Bronze"}
                                )
                              </span>
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-blue-500 font-extrabold uppercase text-[7.5px] tracking-widest block leading-none">A Acumular</span>
                          <span className="font-bold text-emerald-600 font-mono text-[10px] mt-0.5 block leading-none">
                            +{Math.floor((total - (saleMode === 'credito' ? total : (saleMode === 'parcial' ? Math.max(0, total - (Number(partialAmountPaid) || 0)) : 0))) / 100)} pts
                          </span>
                        </div>
                      </div>

                      {/* Loyalty Redeem option */}
                      {(selectedCust.loyaltyPoints || 0) > 0 && (
                        <div className="pt-1.5 border-t border-blue-100 space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="text-blue-700 font-bold text-[9.5px]">Resgatar para Desconto:</span>
                            {redeemedPoints > 0 && (
                              <span className="text-rose-600 font-black font-mono text-[10px]">
                                -{loyaltyDiscount.toLocaleString()} MT
                              </span>
                            )}
                          </div>
                          <div className="flex gap-1.5">
                            <input
                              type="number"
                              min="0"
                              max={Math.min(selectedCust.loyaltyPoints || 0, Math.floor(subtotal * 10))}
                              placeholder="Quantidade de pontos"
                              value={redeemedPoints || ''}
                              onChange={(e) => {
                                const val = Math.max(0, parseInt(e.target.value) || 0);
                                const maxRedeem = Math.min(selectedCust.loyaltyPoints || 0, Math.floor(subtotal * 10));
                                setRedeemedPoints(Math.min(val, maxRedeem));
                              }}
                              className="w-full bg-white border border-blue-200 rounded-lg px-2 py-1 font-mono text-xs font-bold text-blue-900 outline-none focus:border-blue-400 h-7"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (redeemedPoints > 0) {
                                  setRedeemedPoints(0);
                                } else {
                                  const maxRedeem = Math.min(selectedCust.loyaltyPoints || 0, Math.floor(subtotal * 10));
                                  setRedeemedPoints(maxRedeem);
                                }
                              }}
                              className={cn(
                                "px-2 py-1 text-[8.5px] font-black uppercase tracking-wider rounded-lg border transition-all shrink-0 cursor-pointer h-7 leading-none flex items-center justify-center",
                                redeemedPoints > 0
                                  ? "bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100"
                                  : "bg-amber-500 border-amber-600 text-blue-950 hover:bg-amber-450"
                              )}
                            >
                              {redeemedPoints > 0 ? "Limpar" : "Máximo"}
                            </button>
                          </div>
                          <p className="text-[8.5px] text-blue-500 font-medium leading-tight">
                            Proporção: 10 pontos = 1 MT de desconto. Desconto máximo de 100% da compra.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Payment Methods Grid */}
                  {saleMode !== 'credito' && (
                    <div className="space-y-1 text-left border-t border-blue-200/50 pt-2">
                      <label className="block text-[8px] font-black uppercase tracking-widest text-blue-600">Método de Liquidação:</label>
                      <div className="grid grid-cols-2 gap-1">
                        {paymentMethodsList.filter(m => m.id !== 'card').map(method => {
                          const isSelected = paymentMethod === method.id;
                          return (
                            <button
                              key={method.id}
                              type="button"
                              onClick={() => setPaymentMethod(method.id)}
                              className={cn(
                                "py-1.5 px-2 rounded-lg text-[9px] font-bold uppercase transition-all flex items-center justify-start gap-1.5 cursor-pointer border bg-white",
                                isSelected 
                                  ? "border-[#B8791A] text-[#B8791A] font-black shadow-xs bg-orange-50/25" 
                                  : "border-blue-200 text-blue-700 hover:border-blue-300 hover:bg-blue-50/40"
                              )}
                            >
                              <span className="text-xs select-none shrink-0">{method.icon}</span>
                              <span className="truncate leading-none">{method.label}</span>
                            </button>
                          );
                        })}
                        {/* Cartao POS (multibanco) spanning full-width */}
                        <button
                          type="button"
                          onClick={() => setPaymentMethod('card')}
                          className={cn(
                            "col-span-2 py-1.5 px-2 rounded-lg text-[9px] font-bold uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer border bg-white mt-0.5",
                            paymentMethod === 'card'
                              ? "border-[#B8791A] text-[#B8791A] font-black shadow-xs bg-orange-50/25" 
                              : "border-blue-200 text-blue-700 hover:border-blue-300 hover:bg-blue-50/40"
                          )}
                        >
                          <span className="text-xs select-none">💳</span>
                          <span>Cartão POS (Multibanco)</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Submit checkout CTA button (Cobrar) */}
                  <div className="pt-1.5 border-t border-blue-200/50">
                    <button
                      onClick={checkOutTransaction}
                      disabled={isProcessing || cart.length === 0}
                      className="w-full py-2 bg-[#B8791A] hover:bg-[#E8500A] text-white rounded-xl text-xs font-black uppercase tracking-widest active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-35 disabled:pointer-events-none h-10 border-none shadow-sm"
                    >
                      {isProcessing ? (
                        <Loader2 size={13} className="animate-spin text-white" />
                      ) : (
                        <CreditCard size={13} className="text-white" />
                      )}
                      {isProcessing ? 'A REGISTAR...' : `COBRAR — ${total.toLocaleString(undefined, { maximumFractionDigits: 1 })} MT`}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>

      </div>

      {/* Turno Opening / Closing Modal */}
      {isShiftModalOpen && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl p-6 font-sans text-left text-slate-800 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4 border-b pb-2">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Controle do Turno de Caixa</h3>
              <button onClick={() => setIsShiftModalOpen(false)} className="text-slate-450 hover:text-slate-800">
                <X size={16} />
              </button>
            </div>

            {currentShift ? (
              <div className="space-y-4 text-xs">
                <div className="bg-emerald-50 text-emerald-800 p-3 rounded-xl border border-emerald-250 leading-snug">
                  <div className="font-extrabold uppercase text-[10px]">Turno Registado: #{currentShift.id.slice(-6).toUpperCase()}</div>
                  <div className="mt-1">Iniciado por: <span className="font-bold">{currentShift.cashierName}</span></div>
                  <div>Início: <span>{new Date(currentShift.openedAt).toLocaleTimeString()} {new Date(currentShift.openedAt).toLocaleDateString()}</span></div>
                </div>

                {isClosingShiftForm ? (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    <div className="flex items-center gap-2 mb-2 text-rose-800">
                      <Lock size={18} className="stroke-[2.5]" />
                      <h4 className="font-extrabold text-sm uppercase tracking-wider">Fecho de Turno & Contagem</h4>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-normal font-semibold">
                      Por favor conte os valores físicos em caixa para encerrar o seu turno.
                    </p>

                    {/* Financial Stats Summary */}
                    <div className="space-y-2 bg-slate-50 border border-slate-100 p-4 rounded-2xl text-xs">
                      <div className="flex justify-between items-center py-1 border-b border-slate-100">
                        <span className="text-slate-500 font-bold uppercase text-[9px]">Fundo Inicial:</span>
                        <span className="font-mono font-bold text-slate-800">{(currentShift.openingCash || 0).toFixed(2)} MT</span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-slate-100">
                        <span className="text-emerald-600 font-bold uppercase text-[9px]">Vendas em Dinheiro:</span>
                        <span className="font-mono font-bold text-emerald-600">+{(currentShift.paymentBreakdown?.cash || 0).toFixed(2)} MT</span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-slate-100">
                        <span className="text-slate-500 font-bold uppercase text-[9px]">Ajustes de Suprimento:</span>
                        <span className="font-mono font-bold text-emerald-600">+{((currentShift.cashMovements || []).filter((m:any)=>m.type==='addition').reduce((s:number,m:any)=>s+m.amount, 0)).toFixed(2)} MT</span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-slate-100">
                        <span className="text-slate-500 font-bold uppercase text-[9px]">Ajustes de Sangria:</span>
                        <span className="font-mono font-bold text-rose-600">-{((currentShift.cashMovements || []).filter((m:any)=>m.type==='withdrawal').reduce((s:number,m:any)=>s+m.amount, 0)).toFixed(2)} MT</span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-slate-100 bg-slate-100/60 px-2 rounded-lg -mx-2 font-black">
                        <span className="text-slate-700 uppercase text-[9px]">Dinheiro Esperado:</span>
                        <span className="font-mono text-slate-800">
                          {(() => {
                            const additions = (currentShift.cashMovements || []).filter((m:any)=>m.type==='addition').reduce((s:number,m:any)=>s+m.amount, 0);
                            const withdrawals = (currentShift.cashMovements || []).filter((m:any)=>m.type==='withdrawal').reduce((s:number,m:any)=>s+m.amount, 0);
                            const cashSales = currentShift.paymentBreakdown?.cash || 0;
                            return (currentShift.openingCash + cashSales + additions - withdrawals).toFixed(2);
                          })()} MT
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1 font-semibold text-slate-500">
                        <span className="uppercase text-[9px]">Vendas Não-Dinheiro:</span>
                        <span className="font-mono text-[11px]">
                          {(() => {
                            const nonCash = (currentShift.paymentBreakdown?.mpesa || 0) + 
                              (currentShift.paymentBreakdown?.emola || 0) + 
                              (currentShift.paymentBreakdown?.card || 0) + 
                              (currentShift.paymentBreakdown?.bank || 0) + 
                              (currentShift.paymentBreakdown?.credit || 0);
                            return nonCash.toFixed(2);
                          })()} MT
                        </span>
                      </div>
                    </div>

                    {/* Actual Counted Input */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider">Dinheiro Físico Contado</label>
                        <button
                          type="button"
                          onClick={() => setIsClosingCalculatorOpen(!isClosingCalculatorOpen)}
                          className="text-[9px] text-[#B8791A] font-black uppercase tracking-wider hover:underline"
                        >
                          {isClosingCalculatorOpen ? "Fechar Calculadora ✖" : "Contar Notas 🪙"}
                        </button>
                      </div>

                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400 font-mono">MT</span>
                        <input 
                          type="number" 
                          placeholder="Ex: 1500.0" 
                          className="w-full pl-14 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold font-mono outline-none focus:border-rose-500 transition-all text-slate-800"
                          value={countedCash}
                          onChange={e => setCountedCash(e.target.value)}
                        />
                      </div>

                      {isClosingCalculatorOpen && (
                        <div className="animate-in fade-in duration-200 max-h-[180px] overflow-y-auto border border-slate-100 rounded-xl p-2 bg-slate-50">
                          {renderDenominationsCalc(
                            closingDenominations,
                            setClosingDenominations,
                            (total) => {
                              setCountedCash(String(total));
                              setIsClosingCalculatorOpen(false);
                              toast.success(`Contagem de ${total.toFixed(1)} MT aplicada!`);
                            }
                          )}
                        </div>
                      )}
                    </div>

                    {/* Over / Short Live Calculation */}
                    {countedCash !== '' && (
                      <div className={cn(
                        "p-3 rounded-xl border flex justify-between items-center text-xs font-bold font-sans",
                        (() => {
                          const additions = (currentShift.cashMovements || []).filter((m:any)=>m.type==='addition').reduce((s:number,m:any)=>s+m.amount, 0);
                          const withdrawals = (currentShift.cashMovements || []).filter((m:any)=>m.type==='withdrawal').reduce((s:number,m:any)=>s+m.amount, 0);
                          const cashSales = currentShift.paymentBreakdown?.cash || 0;
                          const expected = currentShift.openingCash + cashSales + additions - withdrawals;
                          const countedVal = Number(countedCash) || 0;
                          const diff = countedVal - expected;
                          if (diff === 0) return "bg-emerald-50 border-emerald-200 text-emerald-800";
                          if (diff > 0) return "bg-blue-50 border-blue-200 text-blue-800";
                          return "bg-rose-50 border-rose-200 text-rose-800";
                        })()
                      )}>
                        <span>Diferença (Sobra/Quebra):</span>
                        <span className="font-mono">
                          {(() => {
                            const additions = (currentShift.cashMovements || []).filter((m:any)=>m.type==='addition').reduce((s:number,m:any)=>s+m.amount, 0);
                            const withdrawals = (currentShift.cashMovements || []).filter((m:any)=>m.type==='withdrawal').reduce((s:number,m:any)=>s+m.amount, 0);
                            const cashSales = currentShift.paymentBreakdown?.cash || 0;
                            const expected = currentShift.openingCash + cashSales + additions - withdrawals;
                            const countedVal = Number(countedCash) || 0;
                            const diff = countedVal - expected;
                            return `${diff > 0 ? '+' : ''}${diff.toFixed(2)} MT`;
                          })()}
                        </span>
                      </div>
                    )}

                    {/* Closing Notes */}
                    <div className="space-y-1">
                      <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wider">Notas de Fecho</label>
                      <textarea
                        placeholder="Ex: Justificação para quebra/sobra ou observações..."
                        value={closingNotes}
                        onChange={e => setClosingNotes(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 py-2 px-3 rounded-xl text-xs font-medium outline-none h-16 resize-none"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setIsClosingShiftForm(false)}
                        className="py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                      >
                        Voltar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (countedCash === '') {
                            toast.error("Por favor insira o montante contado!");
                            return;
                          }
                          handleCloseShift(Number(countedCash) || 0, closingNotes);
                        }}
                        className="py-3 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                      >
                        Confirmar Fecho
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-[10px] uppercase font-bold text-slate-500">
                      <div className="p-2.5 bg-slate-50 rounded-lg">
                        <span>Fundo Inicial</span>
                        <span className="block text-xs font-black text-slate-800 mt-1 font-mono">{(currentShift.openingCash || 0).toFixed(1)} MT</span>
                      </div>
                      <div className="p-2.5 bg-slate-50 rounded-lg">
                        <span>Faturado Geral</span>
                        <span className="block text-xs font-black text-emerald-600 mt-1 font-mono">{(currentShift.totalSales || 0).toFixed(1)} MT</span>
                      </div>
                    </div>

                    {/* Add Shift Movements entries */}
                    <div className="border border-slate-200 p-3 rounded-xl bg-slate-50/70 space-y-2">
                      <label className="block text-[9px] font-black uppercase text-slate-400">Adicionar Suprimento / Sangria</label>
                      <div className="grid grid-cols-2 gap-1">
                        <button
                          type="button"
                          onClick={() => setShiftMoveType('addition')}
                          className={cn("py-1 text-[9px] font-black uppercase rounded", shiftMoveType==='addition' ? "bg-emerald-600 text-white":"bg-slate-200 text-slate-600")}
                        >
                          Suprimento (+)
                        </button>
                        <button
                          type="button"
                          onClick={() => setShiftMoveType('withdrawal')}
                          className={cn("py-1 text-[9px] font-black uppercase rounded", shiftMoveType==='withdrawal' ? "bg-amber-600 text-white":"bg-slate-200 text-slate-600")}
                        >
                          Sangria (-)
                        </button>
                      </div>

                      <input
                        type="number"
                        placeholder="Valor MT"
                        value={shiftMoveAmount}
                        onChange={(e) => setShiftMoveAmount(e.target.value)}
                        className="w-full bg-white border border-slate-300 py-1.5 px-3 rounded-lg font-mono text-xs font-bold"
                      />
                      <input
                        type="text"
                        placeholder="Justificação / Notas"
                        value={shiftNote}
                        onChange={(e) => setShiftNote(e.target.value)}
                        className="w-full bg-white border border-slate-300 py-1.5 px-3 rounded-lg text-xs"
                      />
                      <button
                        onClick={handleShiftMovement}
                        className="w-full py-1.5 bg-slate-800 text-white rounded text-[10px] font-black uppercase tracking-wider"
                      >
                        Aplicar Ajuste
                      </button>
                    </div>

                    <button
                      onClick={() => {
                        setCountedCash('');
                        setClosingNotes('');
                        setIsClosingShiftForm(true);
                      }}
                      className="w-full py-2 bg-slate-100 hover:bg-rose-50 text-rose-700 hover:border-rose-200 font-extrabold text-xs uppercase tracking-widest rounded-xl transition-all border border-slate-300"
                    >
                      Fechar Turno de Caixa
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500 leading-normal text-center py-4">Turno fechado.</p>
            )}
          </div>
        </div>
      )}

      {/* POS Quick Customer Creation Modal */}
      {isQuickCustomerOpen && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl p-6 font-sans text-left text-slate-800 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4 border-b pb-2">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Registar Novo Cliente</h3>
              <button onClick={() => setIsQuickCustomerOpen(false)} className="text-slate-450 hover:text-slate-800">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[8px] font-black uppercase text-slate-400 mb-1">Nome Completo</label>
                <input
                  type="text"
                  placeholder="Ex: Manuel Sabush"
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 py-2.5 px-3 rounded-xl text-xs font-bold"
                />
              </div>
              <div>
                <label className="block text-[8px] font-black uppercase text-slate-400 mb-1">Contacto Telefónico</label>
                <input
                  type="text"
                  placeholder="Ex: +258 84 000 0001"
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 py-2.5 px-3 rounded-xl text-xs font-mono font-medium"
                />
              </div>
              <div>
                <label className="block text-[8px] font-black uppercase text-slate-400 mb-1">NUIT / Identificação Fiscal</label>
                <input
                  type="text"
                  placeholder="Ex: 400123456"
                  value={newCustNif}
                  onChange={(e) => setNewCustNif(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 py-2.5 px-3 rounded-xl text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[8px] font-black uppercase text-slate-400 mb-1">Endereço Residencial/Comercial</label>
                <input
                  type="text"
                  placeholder="Ex: Av. Eduardo Mondlane, Maputo"
                  value={newCustAddress}
                  onChange={(e) => setNewCustAddress(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 py-2.5 px-3 rounded-xl text-xs"
                />
              </div>
              <div>
                <label className="block text-[8px] font-black uppercase text-slate-400 mb-1">Fidelização / Notas</label>
                <input
                  type="text"
                  placeholder="Ex: Revendedor habitual de Maputo"
                  value={newCustNotes}
                  onChange={(e) => setNewCustNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 py-2.5 px-3 rounded-xl text-xs"
                />
              </div>

              <button
                onClick={handleQuickCustomerCreate}
                className="w-full mt-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all cursor-pointer shadow-md"
              >
                Gravar & Selecionar Cliente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POS Customers Search List Modal */}
      {isBrowseCustomersOpen && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl p-6 font-sans text-left text-blue-900 animate-in zoom-in-95 duration-200 flex flex-col max-h-[80vh]">
            <div className="flex justify-between items-center mb-4 border-b border-blue-100 pb-2">
              <h3 className="text-sm font-black uppercase tracking-widest text-blue-950">Lista Geral de Clientes</h3>
              <button onClick={() => setIsBrowseCustomersOpen(false)} className="text-blue-500 hover:text-blue-900">
                <X size={16} />
              </button>
            </div>

            <div className="relative mb-3 flex-shrink-0">
              <input
                type="text"
                placeholder="Pesquisar por nome ou contacto..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-blue-50/40 rounded-xl text-xs font-semibold outline-none border border-blue-200 focus:border-blue-500 transition-all text-blue-900 placeholder-blue-400"
              />
              <Search className="absolute left-3 top-3.5 text-blue-400" size={13} />
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[220px]">
              {customers
                .filter(c => 
                  c.name?.toLowerCase().includes(customerSearch.toLowerCase()) ||
                  c.phone?.toLowerCase().includes(customerSearch.toLowerCase())
                )
                .map(c => (
                  <div
                    key={c.id}
                    onClick={() => {
                      setSelectedCustomerId(c.id);
                      setIsBrowseCustomersOpen(false);
                      setCustomerSearch('');
                    }}
                    className={cn(
                      "flex justify-between items-center p-3 rounded-xl border cursor-pointer transition-colors",
                      selectedCustomerId === c.id 
                        ? "bg-blue-50 border-blue-350 text-blue-950 font-bold" 
                        : "bg-blue-50/25 hover:bg-blue-50/60 border-blue-100/60 text-blue-800"
                    )}
                  >
                    <div>
                      <span className="text-xs font-black block text-blue-950">{c.name}</span>
                      <span className="text-[10px] text-blue-600 block mt-0.5 font-medium">Cel: {c.phone || 'N/A'} | NIF: {c.nif || 'N/A'}</span>
                    </div>
                    <div className="text-right">
                      {c.outstandingBalance > 0 ? (
                        <span className="text-[10px] font-extrabold text-[#E24B4A] bg-red-50 border border-red-200 px-2 py-0.5 rounded-md">
                          Cred: {c.outstandingBalance.toLocaleString()} MT
                        </span>
                      ) : (
                        <span className="text-[9px] text-blue-500 font-semibold">Sem dívida</span>
                      )}
                    </div>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      )}

      {/* POS Section 10: Selected Customer History Tooltip/Overlay */}
      {isHistoryOpen && selectedCust && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-[#02182E]/70 backdrop-blur-xs">
          <div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl p-6 font-sans text-left text-blue-900 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4 border-b border-blue-100 pb-2">
              <h3 className="text-xs font-black uppercase tracking-widest text-[#0C3A42]">Ficha e Histórico do Cliente</h3>
              <button onClick={() => setIsHistoryOpen(false)} className="text-blue-400 hover:text-blue-900">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="bg-blue-50/40 p-3 rounded-xl border border-blue-100 space-y-1">
                <div className="font-extrabold text-sm text-blue-950">{selectedCust.name}</div>
                <div>Telefone: <span className="font-bold text-blue-800">{selectedCust.phone || 'Não registado'}</span></div>
                <div>NIF: <span className="font-mono text-blue-800">{selectedCust.nif || 'Não registado'}</span></div>
                <div>Notas / Observações: <span className="text-blue-600 italic font-medium">{selectedCust.notes || 'Sem anotações'}</span></div>
              </div>

              <div>
                <h4 className="font-black text-[10px] uppercase tracking-wider text-blue-500 mb-2">Últimas 3 Compras (Historial)</h4>
                {clientPurchases.length === 0 ? (
                  <p className="text-[10.5px] text-blue-400 italic">Nenhuma compra anterior localizada nos registos do ERP.</p>
                ) : (
                  <div className="space-y-2">
                    {clientPurchases.map((hist: any, idx) => (
                      <div key={idx} className="p-2.5 bg-blue-50/20 rounded-xl border border-blue-100 flex justify-between items-center">
                        <div>
                          <div className="font-bold text-[10.5px] text-blue-950">Doc: #{hist.invoiceNumber?.slice(-8) || hist.invoiceId?.slice(-8)}</div>
                          <div className="text-[9px] text-blue-500 font-medium">{new Date(hist.date).toLocaleDateString()} &bull; M: {hist.paymentMethod?.toUpperCase()}</div>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-black text-blue-950">{hist.total?.toLocaleString()} MT</span>
                          <span className={cn(
                            "block text-[8px] font-black uppercase mt-0.5",
                            hist.status === 'PAGO' ? "text-emerald-600" : (hist.status === 'PENDENTE' ? 'text-rose-600' : 'text-blue-600')
                          )}>{hist.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
              {/* POS Product Catalog / Browse Modal (📦 Trigger) */}
      {isCatalogOpen && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-[#02182E]/70 backdrop-blur-xs select-none">
          <div className="bg-white w-full max-w-4xl h-[85vh] rounded-3xl overflow-hidden shadow-2xl p-6 font-sans text-left text-blue-900 animate-in zoom-in-95 duration-200 flex flex-col">
            <div className="flex justify-between items-center mb-4 border-b border-blue-100 pb-2 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Package className="text-blue-650" size={18} />
                <h3 className="text-sm font-black uppercase tracking-widest text-blue-950">Catálogo de Artigos do ERP</h3>
              </div>
              <button onClick={() => setIsCatalogOpen(false)} className="text-blue-400 hover:text-blue-900">
                <X size={18} />
              </button>
            </div>

            {/* Catalog content filters */}
            <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1 flex-shrink-0">
              {['all', ...Array.from(new Set(products.map(p => p.category || 'Outros')))].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCatalogCategory(cat)}
                  className={cn(
                    "py-1 px-3.5 rounded-full text-[10px] font-bold uppercase shrink-0 transition-colors uppercase tracking-wider",
                    catalogCategory === cat 
                      ? "bg-blue-600 text-white" 
                      : "bg-blue-50 text-blue-700 hover:bg-blue-100/80"
                  )}
                >
                  {cat === 'all' ? 'Todos' : cat}
                </button>
              ))}
            </div>

            {/* Catalog Grid */}
            <div className="flex-1 overflow-y-auto grid grid-cols-2 md:grid-cols-4 gap-4 p-1 min-h-[220px]">
              {products
                .filter(p => catalogCategory === 'all' || p.category === catalogCategory)
                .map(product => {
                  const limitStock = Number(product.stockLevel || 0);
                  const isLow = limitStock <= 5;
                  return (
                    <div
                      key={product.id}
                      onClick={() => {
                        if (limitStock <= 0) {
                          toast.error("Ausente de stock!");
                          return;
                        }
                        addToCart(product);
                        playSuccessBeep();
                      }}
                      className={cn(
                        "bg-blue-50/20 hover:bg-blue-50/70 border p-3 rounded-2xl cursor-pointer transition-all flex flex-col justify-between self-stretch",
                        limitStock <= 0 ? "opacity-50 hover:bg-blue-50/10 cursor-not-allowed border-blue-100" : "border-blue-100/80 hover:border-blue-400"
                      )}
                    >
                      <div>
                        {/* Stock label status info */}
                        <div className="flex justify-between items-center text-[8px] uppercase font-black text-blue-400 mb-1.5">
                          <span>Stock: {limitStock}</span>
                          {isLow && limitStock > 0 && <span className="text-rose-600 font-extrabold animate-pulse">Esgotar</span>}
                        </div>
                        <h4 className="text-xs font-black text-blue-950 line-clamp-2 leading-tight pr-1">{product.name}</h4>
                        <p className="text-[10px] text-blue-500 font-medium mt-0.5 select-none">{product.category || 'Normal'}</p>
                      </div>

                      <div className="text-right mt-3 pt-2 border-t border-blue-100/50 flex-shrink-0">
                        <span className="text-xs font-mono font-black text-blue-800">{(product.price || 0).toLocaleString()} MT</span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* POS Post-Sale Success & Printable receipt popups matching Section 9 */}
      {completedSale && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-[#02182E]/80 backdrop-blur-md overflow-y-auto select-none">
          <div className="bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl border border-blue-100 my-8 flex flex-col max-h-[90vh]">
            
            <div className="bg-emerald-600 text-white p-6 text-center shrink-0">
              <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <Printer size={28} className="text-white animate-bounce" />
              </div>
              <h3 className="text-lg font-black uppercase tracking-wider">Transação Registada!</h3>
              <p className="text-[10.5px] text-emerald-100 mt-1">O recibo fiscal provisório foi arquivado e encontra-se pronto para emissão física.</p>
            </div>

            {/* Printable summary data visual mockup */}
            <div className="p-6 overflow-y-auto max-h-[300px] border-y font-mono text-xs text-blue-900 bg-blue-50/20 space-y-3 p-4">
              <div className="text-center space-y-1 pb-3 border-b border-dashed border-blue-200">
                <div className="font-sans font-black text-blue-950 text-base">{businessData?.name || profile?.businessName || 'Sabush System ERP'}</div>
                <div className="text-[10px] text-blue-600 font-sans">{businessData?.address || 'Av. de Angola, Maputo'}</div>
                <div className="text-[10px] text-blue-600 font-sans">NUIT: {businessData?.taxId || '400123456'}</div>
              </div>

              <div className="space-y-1 pb-3 border-b border-dashed border-blue-200 text-[10px] leading-relaxed">
                <div className="flex justify-between">
                  <span>Factura:</span>
                  <span className="font-extrabold text-blue-950">#{completedSale.invoiceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span>Data:</span>
                  <span>{new Date(completedSale.date).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Cliente:</span>
                  <span className="font-extrabold text-blue-950">{completedSale.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span>Meio de Pagamento:</span>
                  <span className="font-bold uppercase text-blue-950">{completedSale.paymentMethod?.toUpperCase()}</span>
                </div>
              </div>

              {/* Product Line Items Section */}
              {completedSale.items && completedSale.items.length > 0 && (
                <div className="space-y-1 pb-3 border-b border-dashed border-blue-200 font-mono text-[10px]">
                  {completedSale.items.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center gap-2 text-blue-950">
                      <span className="truncate flex-1 text-left">{item.name}</span>
                      <span className="text-blue-600 shrink-0 text-center">{item.quantity} × {item.selectedUnit}</span>
                      <span className="font-bold text-blue-950 shrink-0 text-right">{(item.subtotal || 0).toLocaleString()} MT</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-1 pt-1">
                <div className="flex justify-between text-blue-600">
                  <span>Subtotal Geral:</span>
                  <span>{completedSale.subtotal.toLocaleString()} MT</span>
                </div>
                <div className="flex justify-between font-extrabold text-blue-950 text-sm border-t border-blue-200/50 pt-2">
                  <span>TOTAL COBRADO:</span>
                  <span>{completedSale.total.toLocaleString()} MT</span>
                </div>
              </div>

              {/* Conditional Credit Debt Summary Block */}
              {(completedSale.saleMode === 'credito' || completedSale.saleMode === 'parcial') && (
                <div className="bg-amber-50 border border-amber-200 rounded p-2 text-[10px] space-y-1 font-mono">
                  <div className="flex justify-between text-blue-700">
                    <span>Saldo anterior:</span>
                    <span className="font-bold">{(completedSale.previousOutstandingBalance || 0).toLocaleString()} MT</span>
                  </div>
                  <div className="flex justify-between text-rose-600 font-bold">
                    <span>Acréscimo c/ esta venda:</span>
                    <span>+{(completedSale.creditOutstandingAmount || 0).toLocaleString()} MT</span>
                  </div>
                  <div className="flex justify-between font-extrabold text-amber-900 border-t border-amber-200/60 pt-1">
                    <span>Novo saldo devedor:</span>
                    <span>{((completedSale.previousOutstandingBalance || 0) + (completedSale.creditOutstandingAmount || 0)).toLocaleString()} MT</span>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-blue-50/20 space-y-2 shrink-0 border-t border-blue-200">
              <button
                onClick={() => triggerCustomMultiPagePrint(completedSale)}
                className="w-full py-4.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 shadow-lg cursor-pointer border-none"
              >
                <Printer size={15} />
                Emitir Recibo Multipage
              </button>

              <button
                onClick={() => setCompletedSale(null)}
                className="w-full py-3 bg-blue-100 hover:bg-blue-200 text-blue-900 font-extrabold text-[10px] uppercase tracking-wider rounded-xl transition-all border border-blue-200 cursor-pointer"
              >
                Voltar ao Terminal POS
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive modal to specify a custom label when suspending a cart */}
      {isSuspenseLabelModalOpen && (
        <div className="fixed inset-0 z-100 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-[32px] max-w-md w-full p-6 sm:p-8 shadow-2xl flex flex-col space-y-6 relative animate-in fade-in zoom-in-95 duration-200">
            <button 
              type="button"
              onClick={() => setIsSuspenseLabelModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-2 hover:bg-slate-800 rounded-xl transition-all"
            >
              <X size={20} />
            </button>

            <div className="space-y-2">
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <span className="text-xl">⏳</span> Suspender Venda Atual
              </h3>
              <p className="text-xs text-slate-400">
                Atribua um nome, identificador ou referência (ex: Nome do Cliente, Número da Mesa) para que possa identificar e recuperar esta venda facilmente mais tarde.
              </p>
            </div>

            <form 
              onSubmit={(e) => {
                e.preventDefault();
                handleSuspendCurrentCart(suspenseCartLabel);
              }}
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Identificador da Venda</label>
                <input 
                  type="text"
                  autoFocus
                  required
                  placeholder={`Ex: Cliente #${suspendedCarts.length + 1}`}
                  className="w-full px-4 py-3 bg-slate-950/60 border border-slate-850 rounded-[20px] text-sm font-semibold text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-[#B8791A] outline-none"
                  value={suspenseCartLabel}
                  onChange={e => setSuspenseCartLabel(e.target.value)}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  type="button"
                  onClick={() => setIsSuspenseLabelModalOpen(false)}
                  className="flex-1 py-3.5 bg-slate-800 hover:bg-slate-750 text-slate-350 rounded-xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer text-center"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-550 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer text-center shadow-lg shadow-emerald-600/10"
                >
                  Confirmar Suspensão
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Interactive modal listing all suspended carts (Vendas em Espera) */}
      {isSuspendedModalOpen && (
        <div className="fixed inset-0 z-100 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-[32px] max-w-2xl w-full p-6 sm:p-8 shadow-2xl flex flex-col space-y-6 relative animate-in fade-in zoom-in-95 duration-200 max-h-[85vh]">
            <button 
              type="button"
              onClick={() => setIsSuspendedModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-2 hover:bg-slate-800 rounded-xl transition-all animate-none"
            >
              <X size={20} />
            </button>

            <div className="space-y-1">
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <span className="text-xl">📋</span> Vendas em Espera
              </h3>
              <p className="text-xs text-slate-400">
                Lista de transações suspensas temporariamente neste terminal de caixa. Clique em recuperar para retomar o atendimento.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 space-y-3.5 pr-1 select-none">
              {suspendedCarts.length === 0 ? (
                <div className="py-12 text-center text-slate-500 space-y-3">
                  <div className="text-4xl">⏳</div>
                  <p className="text-xs font-black uppercase tracking-wider">Sem Vendas Suspensa</p>
                  <p className="text-xs text-slate-400 max-w-xs mx-auto">Coloque vendas em espera para desimpedir a fila quando os clientes precisarem de tempo adicional.</p>
                </div>
              ) : (
                suspendedCarts.map((sc) => {
                  const itemsCount = sc.items?.reduce((acc: number, item: any) => acc + (Number(item.quantity) || 0), 0) || 0;
                  const totalVal = sc.items?.reduce((acc: number, item: any) => acc + (Number(item.price || 0) * (Number(item.quantity) || 1)), 0) || 0;
                  return (
                    <div 
                      key={sc.id} 
                      className="bg-slate-950/40 border border-slate-850 hover:border-slate-800 p-4.5 rounded-[24px] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all"
                    >
                      <div className="text-left space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-white text-sm">{sc.label}</span>
                          <span className="bg-slate-800 text-slate-350 text-[9px] font-mono font-black px-2 py-0.5 rounded-full">
                            {itemsCount} {itemsCount === 1 ? 'item' : 'itens'}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-semibold font-sans">
                          Suspenso em: {new Date(sc.createdAt).toLocaleString()}
                        </p>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto">
                        <div className="text-left sm:text-right">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block leading-none">Total da Venda</span>
                          <span className="text-sm font-mono font-black text-amber-400 leading-none block mt-1">
                            {totalVal.toLocaleString()} MT
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleRetrieveSuspendedCart(sc)}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-550 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-sm shadow-emerald-600/10"
                            title="Recuperar venda ativa"
                          >
                            Recuperar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSuspendedCart(sc.id, sc.label)}
                            className="p-2.5 bg-rose-950/40 hover:bg-rose-900/40 text-rose-400 hover:text-rose-300 rounded-xl transition-all cursor-pointer border border-rose-950/40"
                            title="Descartar venda"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsSuspendedModalOpen(false)}
                className="w-full py-3.5 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer text-center"
              >
                Fechar Painel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Credit Limit Exceeded warning and authorization modal */}
      {isCreditLimitModalOpen && selectedCust && (
        <div className="fixed inset-0 z-100 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-[32px] max-w-md w-full p-6 sm:p-8 shadow-2xl flex flex-col space-y-6 relative animate-in fade-in zoom-in-95 duration-200">
            <button 
              type="button"
              onClick={() => setIsCreditLimitModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-2 hover:bg-slate-800 rounded-xl transition-all"
            >
              <X size={20} />
            </button>

            <div className="space-y-2">
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <span className="text-xl">⚠️</span> Limite de Crédito Excedido
              </h3>
              <p className="text-xs text-rose-400 font-semibold">
                O cliente {selectedCust.name} atingiu ou superará o teto de fiado permitido nesta loja.
              </p>
            </div>

            <div className="bg-slate-950/60 border border-slate-850 p-4.5 rounded-2xl font-sans text-xs text-slate-300 space-y-3 select-none">
              <div className="flex justify-between">
                <span>Limite Autorizado:</span>
                <span className="font-bold text-white font-mono">{(selectedCust.creditLimit || 500).toLocaleString()} MT</span>
              </div>
              <div className="flex justify-between">
                <span>Dívida Acumulada Atual:</span>
                <span className="font-bold text-amber-500 font-mono">{(selectedCust.outstandingBalance || 0).toLocaleString()} MT</span>
              </div>
              <div className="flex justify-between">
                <span>Crédito Desta Venda:</span>
                <span className="font-bold text-rose-500 font-mono">
                  {((saleMode === 'credito' ? total : (saleMode === 'parcial' ? Math.max(0, total - (Number(partialAmountPaid) || 0)) : 0))).toLocaleString()} MT
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-800 text-sm font-bold">
                <span>Dívida Total Projetada:</span>
                <span className="text-rose-400 font-mono">
                  {((selectedCust.outstandingBalance || 0) + (saleMode === 'credito' ? total : (saleMode === 'parcial' ? Math.max(0, total - (Number(partialAmountPaid) || 0)) : 0))).toLocaleString()} MT
                </span>
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>Valor Excedente:</span>
                <span className="font-semibold text-rose-400 font-mono">
                  {(((selectedCust.outstandingBalance || 0) + (saleMode === 'credito' ? total : (saleMode === 'parcial' ? Math.max(0, total - (Number(partialAmountPaid) || 0)) : 0))) - (selectedCust.creditLimit || 500)).toLocaleString()} MT
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => {
                  setIsCreditLimitModalOpen(false);
                  setIsManagerPINOpen(true);
                }}
                className="w-full py-3.5 bg-amber-600 hover:bg-amber-550 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer text-center shadow-lg shadow-amber-600/10 flex items-center justify-center gap-2"
              >
                <Lock size={14} /> Autorizar com PIN do Gerente
              </button>
              <button
                type="button"
                onClick={() => setIsCreditLimitModalOpen(false)}
                className="w-full py-3.5 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer text-center"
              >
                Cancelar Venda a Crédito
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1. VOID REASON & CONFIRMATION MODAL */}
      {isVoidReasonModalOpen && voidItem && (
        <div className="fixed inset-0 z-100 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-[32px] max-w-md w-full p-6 sm:p-8 shadow-2xl flex flex-col space-y-5 relative animate-in fade-in zoom-in-95 duration-200">
            <button 
              type="button"
              onClick={() => {
                setIsVoidReasonModalOpen(false);
                setVoidItem(null);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-2 hover:bg-slate-800 rounded-xl transition-all"
            >
              <X size={20} />
            </button>

            <div className="space-y-1.5 text-left">
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <span className="text-xl">🛑</span> Confirmar Anulação
              </h3>
              <p className="text-xs text-slate-400">
                Selecione o motivo da remoção do artigo do carrinho ativo para o registo de auditoria.
              </p>
            </div>

            {/* Item details card */}
            <div className="bg-slate-950/60 border border-slate-850 p-4 rounded-2xl text-left font-sans text-xs space-y-2 select-none">
              <div className="flex justify-between items-start">
                <span className="text-slate-400">Produto:</span>
                <span className="font-bold text-slate-100 max-w-[200px] text-right truncate">{voidItem.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Quantidade:</span>
                <span className="font-mono font-bold text-slate-200">{voidItem.quantity} {voidItem.selectedUnit}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-850 text-sm">
                <span className="text-slate-450 font-medium">Valor Total:</span>
                <span className="font-mono font-black text-[#B8791A]">
                  {(getCartItemPricing(voidItem).total).toLocaleString()} MT
                </span>
              </div>
            </div>

            {/* Threshold Badge & Info */}
            <div className="text-left">
              {getCartItemPricing(voidItem).total > voidPinThreshold ? (
                <div className="bg-amber-950/30 border border-amber-900/40 text-amber-400 p-3 rounded-xl flex items-start gap-2.5 text-[11px] leading-relaxed">
                  <Lock size={14} className="mt-0.5 shrink-0" />
                  <div>
                    <span className="font-extrabold uppercase block mb-0.5">Autorização Requerida</span>
                    Este artigo excede o limite de {voidPinThreshold} MT. Será necessário o PIN do Gerente para confirmar.
                  </div>
                </div>
              ) : (
                <div className="bg-emerald-950/30 border border-emerald-900/40 text-emerald-400 p-3 rounded-xl flex items-center gap-2.5 text-[11px] font-semibold">
                  <Check size={14} className="shrink-0" />
                  <span>Nenhum PIN de gerente é exigido (Abaixo de {voidPinThreshold} MT)</span>
                </div>
              )}
            </div>

            {/* Reason Code Dropdown & Input */}
            <div className="space-y-4 text-left">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Código de Motivo</label>
                <select 
                  className="w-full px-4 py-3 bg-slate-950/60 border border-slate-850 rounded-xl text-xs font-bold text-slate-200 focus:ring-2 focus:ring-[#B8791A] outline-none cursor-pointer animate-none"
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                >
                  <option value="Wrong item">Artigo Errado / Wrong item</option>
                  <option value="Customer changed mind">Desistência do Cliente / Customer changed mind</option>
                  <option value="Price error">Erro de Preço / Price error</option>
                  <option value="Other">Outro Motivo / Other</option>
                </select>
              </div>

              {voidReason === 'Other' && (
                <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-200">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Especifique o Motivo</label>
                  <input 
                    type="text"
                    required
                    placeholder="Ex: Embalagem danificada pelo cliente"
                    className="w-full px-4 py-3 bg-slate-950/60 border border-slate-850 rounded-xl text-xs font-semibold text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-[#B8791A] outline-none"
                    value={customVoidReason}
                    onChange={(e) => setCustomVoidReason(e.target.value)}
                  />
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 pt-2">
              <button 
                type="button"
                onClick={() => {
                  setIsVoidReasonModalOpen(false);
                  setVoidItem(null);
                }}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-750 text-slate-350 rounded-xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer text-center"
              >
                Cancelar
              </button>
              <button 
                type="button"
                onClick={() => executeVoidItem(false)}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-550 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer text-center shadow-lg shadow-rose-600/10"
              >
                Anular Artigo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. PROCESS RETURN & REFUND SCREEN MODAL */}
      {isReturnModalOpen && (
        <div className="fixed inset-0 z-100 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-[32px] max-w-5xl w-full h-[90vh] p-6 sm:p-8 shadow-2xl flex flex-col space-y-6 relative animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <button 
              type="button"
              onClick={() => {
                setIsReturnModalOpen(false);
                setSelectedInvoice(null);
                setReturnQuantities({});
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-2 hover:bg-slate-800 rounded-xl transition-all"
            >
              <X size={20} />
            </button>

            <div className="space-y-1.5 text-left shrink-0">
              <h3 className="text-xl font-black text-white flex items-center gap-2">
                <span className="text-2xl text-amber-500">🔄</span> Processar Devolução e Reembolso
              </h3>
              <p className="text-xs text-slate-400">
                Selecione uma venda concluída para devolver artigos ao stock e reembolsar o cliente. 
                <span className="text-amber-400 font-semibold ml-1">🔒 Requer PIN do Gerente.</span>
              </p>
            </div>

            {/* Split Panel Body */}
            <div className="flex-1 flex flex-col md:flex-row gap-6 min-h-0 overflow-hidden">
              {/* Left Side: Invoice Finder (40%) */}
              <div className="flex-1 md:flex-[0.4] bg-slate-950/40 border border-slate-850 rounded-2xl p-4 flex flex-col space-y-4 min-h-0">
                <div className="space-y-1.5 text-left shrink-0">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Pesquisar Fatura</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-550" />
                      <input 
                        type="text"
                        placeholder="ID Fatura, Cliente..."
                        className="w-full pl-9 pr-3 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs font-semibold text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-[#B8791A] outline-none"
                        value={searchInvoiceTerm}
                        onChange={(e) => setSearchInvoiceTerm(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSearchInvoice();
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleSearchInvoice}
                      className="px-4 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                    >
                      Pesquisar
                    </button>
                  </div>
                </div>

                {/* List Container */}
                <div className="flex-1 overflow-y-auto space-y-2 pr-1 select-none min-h-0">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 text-left mb-1 shrink-0">
                    {searchInvoiceTerm ? 'Resultados da Pesquisa' : 'Vendas Recentes'}
                  </div>

                  {loadingInvoices ? (
                    <div className="py-12 flex flex-col items-center justify-center space-y-2 text-slate-500">
                      <Loader2 size={24} className="animate-spin text-amber-500" />
                      <span className="text-xs">A carregar faturas...</span>
                    </div>
                  ) : recentInvoices.length === 0 ? (
                    <div className="py-12 text-center text-slate-500 space-y-2">
                      <div className="text-3xl">📭</div>
                      <p className="text-[10px] font-black uppercase tracking-wider">Nenhuma venda encontrada</p>
                      <p className="text-[10px] text-slate-400 max-w-[180px] mx-auto">Verifique a referência da fatura ou o nome do cliente.</p>
                    </div>
                  ) : (
                    recentInvoices.map((inv) => {
                      const isActive = selectedInvoice?.id === inv.id;
                      const itemsCount = inv.items?.reduce((s: number, i: any) => s + (Number(i.quantity) || 0), 0) || 0;
                      return (
                        <div 
                          key={inv.id}
                          onClick={() => {
                            setSelectedInvoice(inv);
                            // Reset returned quantities
                            const qties: Record<string, number> = {};
                            inv.items?.forEach((item: any) => {
                              qties[`${item.id}-${item.selectedUnit}`] = 0;
                            });
                            setReturnQuantities(qties);
                            setRefundMethod(inv.paymentMethod || 'cash');
                          }}
                          className={cn(
                            "p-3.5 rounded-xl text-left border cursor-pointer transition-all flex flex-col space-y-1.5",
                            isActive 
                              ? "bg-[#B8791A]/10 border-[#B8791A] shadow-sm" 
                              : "bg-slate-900/60 border-slate-850 hover:border-slate-800"
                          )}
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-mono font-black text-xs text-slate-200">#{inv.id.slice(-8).toUpperCase()}</span>
                            <span className="font-mono text-xs font-extrabold text-amber-500">{(inv.total || 0).toLocaleString()} MT</span>
                          </div>
                          
                          <div className="flex justify-between text-[10px] text-slate-450 font-medium">
                            <span className="truncate max-w-[120px]">
                              {inv.customerName || inv.customerId || 'Cliente Geral'}
                            </span>
                            <span>{new Date(inv.date).toLocaleDateString()}</span>
                          </div>

                          <div className="flex justify-between items-center pt-1 border-t border-slate-850/60 text-[9px]">
                            <span className="bg-slate-800/80 text-slate-350 px-1.5 py-0.5 rounded-md font-mono">
                              {itemsCount} {itemsCount === 1 ? 'item' : 'itens'}
                            </span>
                            <span className="font-bold text-slate-400 uppercase tracking-widest">{inv.paymentMethod}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right Side: Return Calculator (60%) */}
              <div className="flex-1 md:flex-[0.6] bg-slate-950/20 border border-slate-850 rounded-2xl p-4 flex flex-col min-h-0">
                {selectedInvoice ? (
                  <div className="flex-1 flex flex-col min-h-0">
                    {/* Invoice Meta Summary */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 bg-slate-950/60 border border-slate-850 p-3.5 rounded-xl text-left text-xs mb-4 shrink-0">
                      <div>
                        <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider block leading-none">ID Venda</span>
                        <span className="font-mono font-bold text-slate-200 block mt-1">#{selectedInvoice.id.toUpperCase()}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider block leading-none">Cliente</span>
                        <span className="font-semibold text-slate-200 block mt-1 truncate">{selectedInvoice.customerName || selectedInvoice.customerId || "Cliente Geral"}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider block leading-none">Pago Original</span>
                        <span className="font-mono font-bold text-emerald-500 block mt-1">{(selectedInvoice.total || 0).toLocaleString()} MT</span>
                      </div>
                    </div>

                    {/* Invoice items to return */}
                    <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
                      <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 text-left mb-2 shrink-0">
                        Seleção de Artigos para Devolver
                      </div>

                      {selectedInvoice.items?.map((item: any) => {
                        const itemKey = `${item.id}-${item.selectedUnit}`;
                        const qtyToReturn = returnQuantities[itemKey] || 0;
                        const isSelected = qtyToReturn > 0;

                        return (
                          <div 
                            key={itemKey}
                            className={cn(
                              "p-3.5 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-left transition-all",
                              isSelected 
                                ? "bg-amber-950/10 border-amber-800/80" 
                                : "bg-slate-900/40 border-slate-850"
                            )}
                          >
                            <div className="space-y-1">
                              <span className="text-xs font-bold text-slate-100 block">{item.name}</span>
                              <div className="flex items-center gap-2 text-[10px] text-slate-400 font-medium">
                                <span>Un: <strong className="font-mono">{item.selectedUnit || 'un'}</strong></span>
                                <span>|</span>
                                <span>Preço Un: <strong className="font-mono">{item.price.toFixed(1)} MT</strong></span>
                                <span>|</span>
                                <span>Qtd Vendida: <strong className="font-mono">{item.quantity}</strong></span>
                              </div>
                            </div>

                            {/* Quantity Selector +/- */}
                            <div className="flex items-center gap-3 self-end sm:self-auto shrink-0 select-none">
                              <div className="flex items-center rounded-lg overflow-hidden bg-slate-950 border border-slate-800 h-8">
                                <button 
                                  type="button"
                                  onClick={() => {
                                    setReturnQuantities(prev => ({
                                      ...prev,
                                      [itemKey]: Math.max(0, qtyToReturn - 1)
                                    }));
                                  }}
                                  className="w-8 h-full flex items-center justify-center hover:bg-slate-850 text-slate-400 transition-colors cursor-pointer"
                                >
                                  <Minus size={12} className="stroke-[2.5]" />
                                </button>
                                
                                <input 
                                  type="number"
                                  value={qtyToReturn === 0 ? '' : qtyToReturn}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    if (isNaN(val) || val <= 0) {
                                      setReturnQuantities(prev => ({ ...prev, [itemKey]: 0 }));
                                    } else {
                                      setReturnQuantities(prev => ({ 
                                        ...prev, 
                                        [itemKey]: Math.min(item.quantity, val) 
                                      }));
                                    }
                                  }}
                                  className="w-10 h-full text-center text-xs font-mono font-black border-none bg-transparent outline-none p-0 text-slate-100"
                                />

                                <button 
                                  type="button"
                                  onClick={() => {
                                    setReturnQuantities(prev => ({
                                      ...prev,
                                      [itemKey]: Math.min(item.quantity, qtyToReturn + 1)
                                    }));
                                  }}
                                  className="w-8 h-full flex items-center justify-center hover:bg-slate-850 text-slate-400 transition-colors cursor-pointer"
                                >
                                  <Plus size={12} className="stroke-[2.5]" />
                                </button>
                              </div>
                              
                              <div className="w-16 text-right font-mono text-xs font-bold text-slate-200">
                                {(item.price * qtyToReturn).toLocaleString()} MT
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Refund Parameters Section */}
                    <div className="mt-4 pt-3.5 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-4 text-left shrink-0">
                      {/* Return Reason dropdown */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Motivo da Devolução</label>
                        <select 
                          className="w-full px-3 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-xs font-bold text-slate-200 focus:ring-2 focus:ring-[#B8791A] outline-none cursor-pointer animate-none"
                          value={returnReason}
                          onChange={(e) => setReturnReason(e.target.value)}
                        >
                          <option value="Wrong size/item">Tamanho/Item Incorreto</option>
                          <option value="Defective/Damaged">Artigo Danificado / Defeituoso</option>
                          <option value="Customer Return">Devolução de Cliente</option>
                          <option value="Other">Outro Motivo</option>
                        </select>
                      </div>

                      {/* Refund Payment Method dropdown */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Método de Reembolso</label>
                        <select 
                          className="w-full px-3 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-xs font-bold text-slate-200 focus:ring-2 focus:ring-[#B8791A] outline-none cursor-pointer animate-none"
                          value={refundMethod}
                          onChange={(e) => setRefundMethod(e.target.value)}
                        >
                          <option value="cash">Dinheiro em Caixa (Cash)</option>
                          <option value="mpesa">M-Pesa Moçambique</option>
                          <option value="emola">e-Mola</option>
                          <option value="bank">Transferência Bancária</option>
                          <option value="card">Cartão de Crédito/Débito</option>
                          <option value="credit">Nota de Crédito (Store Credit)</option>
                        </select>
                      </div>

                      {returnReason === 'Other' && (
                        <div className="col-span-1 sm:col-span-2 space-y-1.5 animate-in slide-in-from-top-2 duration-155 text-left">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Especifique o Motivo</label>
                          <input 
                            type="text"
                            required
                            placeholder="Descreva detalhadamente o motivo da devolução..."
                            className="w-full px-3 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-xs font-semibold text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-[#B8791A] outline-none"
                            value={customReturnReason}
                            onChange={(e) => setCustomReturnReason(e.target.value)}
                          />
                        </div>
                      )}
                    </div>

                    {/* Grand Refund Amount Summary and Action button */}
                    <div className="mt-5 pt-3.5 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0">
                      <div className="text-left w-full sm:w-auto">
                        <span className="text-[10px] text-slate-450 uppercase tracking-widest block font-black leading-none">Total Reembolso</span>
                        <span className="text-2xl font-mono font-black text-amber-500 block mt-1.5 leading-none">
                          {selectedInvoice.items.reduce((acc: number, item: any) => acc + (item.price * (returnQuantities[`${item.id}-${item.selectedUnit}`] || 0)), 0).toLocaleString()} MT
                        </span>
                      </div>

                      <button
                        type="button"
                        disabled={isProcessingReturn || selectedInvoice.items.reduce((acc: number, item: any) => acc + (item.price * (returnQuantities[`${item.id}-${item.selectedUnit}`] || 0)), 0) <= 0}
                        onClick={() => executeRefund(false)}
                        className="w-full sm:w-auto px-6 py-3.5 bg-amber-500 hover:bg-amber-450 disabled:bg-slate-800 disabled:text-slate-600 disabled:border-transparent text-slate-950 rounded-xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer text-center flex items-center justify-center gap-2 shadow-lg shadow-amber-500/10"
                      >
                        {isProcessingReturn ? (
                          <>
                            <Loader2 size={14} className="animate-spin text-slate-950" />
                            A Processar...
                          </>
                        ) : (
                          <>
                            <RefreshCw size={13} className="text-slate-950" />
                            Confirmar Devolução
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-8 space-y-3 select-none">
                    <div className="text-5xl">📄</div>
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">Nenhuma Fatura Selecionada</p>
                    <p className="text-xs text-slate-450 max-w-xs text-center leading-normal">
                      Selecione uma fatura a partir da lista à esquerda ou pesquise pelo identificador único para iniciar a devolução de artigos.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Vendas Pendentes / Needs Review Modal */}
      {isReviewModalOpen && (
        <div className="fixed inset-0 z-100 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-[32px] max-w-4xl w-full max-h-[85vh] p-6 sm:p-8 shadow-2xl flex flex-col space-y-6 relative animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
            {/* Modal Header */}
            <button 
              type="button"
              onClick={() => setIsReviewModalOpen(false)}
              className="absolute top-4 right-4 text-slate-450 hover:text-slate-700 p-2 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
            >
              <X size={20} />
            </button>

            <div className="space-y-1 text-left shrink-0">
              <h3 className="text-xl font-black text-slate-800 flex items-center gap-2 font-sans">
                <span className="text-2xl">⚠️</span> Vendas Offline com Falha de Stock
              </h3>
              <p className="text-xs text-slate-500 font-sans">
                Estas vendas foram registadas em modo offline, mas falharam a sincronização devido a conflitos de stock ou outras inconsistências. Revise cada caso para corrigir ou descartar.
              </p>
            </div>

            {/* List of failed pending sales */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 min-h-0">
              {pendingSales.filter(s => s.status === 'failed').map((sale: any) => (
                <div key={sale.id} className="p-4 rounded-2xl border border-rose-200 bg-rose-50/50 text-left flex flex-col space-y-3 font-sans">
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                    <div>
                      <span className="text-xs font-black text-rose-950">Fatura: #{sale.invoiceData?.invoiceNumber || sale.id}</span>
                      <span className="text-[10px] text-slate-505 block">Registada em: {new Date(sale.createdAt).toLocaleString()}</span>
                    </div>
                    <span className="px-2.5 py-1 bg-rose-100 text-rose-850 text-[9px] font-bold rounded-lg uppercase tracking-wider self-start sm:self-auto">
                      Falha de Stock
                    </span>
                  </div>

                  {/* Error Message */}
                  <div className="text-xs text-rose-700 font-bold bg-rose-100/50 p-2.5 rounded-xl border border-rose-200/55">
                    {sale.errorMessage}
                  </div>

                  {/* Sold items inside this invoice */}
                  <div className="bg-white rounded-xl border border-rose-100 p-3 space-y-2">
                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Artigos na Fatura:</span>
                    <div className="divide-y divide-slate-100">
                      {sale.invoiceData?.items?.map((item: any) => (
                        <div key={item.id} className="py-2 flex justify-between items-center text-xs">
                          <span className="font-semibold text-slate-800">{item.name} ({item.selectedUnit})</span>
                          <span className="font-mono text-slate-600 font-bold">{item.quantity} x {item.price.toLocaleString()} MT</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Actions for this specific failed sale */}
                  <div className="flex justify-end gap-3 pt-1">
                    <button
                      type="button"
                      onClick={async () => {
                        if (confirm("Tem a certeza que deseja eliminar esta venda pendente? Esta ação não pode ser desfeita.")) {
                          await offlineDb.deletePendingSale(sale.id);
                          const refreshed = await offlineDb.getPendingSales();
                          setPendingSales(refreshed);
                          toast.success("Venda removida da fila de revisão.");
                        }
                      }}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
                    >
                      Descartar Venda
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        // Mark as pending again to retry syncing
                        const updatedSale = {
                          ...sale,
                          status: 'pending',
                          errorMessage: undefined
                        };
                        await offlineDb.savePendingSale(updatedSale);
                        const refreshed = await offlineDb.getPendingSales();
                        setPendingSales(refreshed);
                        toast.success("Re-tentando sincronização para esta venda...");
                        // Trigger sync
                        setTimeout(() => {
                          syncPendingSales();
                        }, 100);
                      }}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
                    >
                      Tentar Novamente
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setIsReviewModalOpen(false)}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-850 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer"
              >
                Fechar Painel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ITEM OVERRIDE & MANUAL DISCOUNT MODAL */}
      {isItemOverrideModalOpen && overrideItem && (
        <div className="fixed inset-0 z-100 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-blue-200 rounded-[32px] max-w-md w-full p-6 sm:p-8 shadow-2xl flex flex-col space-y-5 relative animate-in fade-in zoom-in-95 duration-200">
            <button 
              type="button"
              onClick={() => setIsItemOverrideModalOpen(false)}
              className="absolute top-4 right-4 text-blue-400 hover:text-blue-600 p-2 hover:bg-blue-50 rounded-xl transition-all cursor-pointer border-none bg-transparent"
            >
              <X size={20} />
            </button>

            <div className="space-y-1 text-left">
              <span className="text-[9px] font-black uppercase tracking-widest text-blue-400 leading-none">Ajuste de Preço & Desconto</span>
              <h3 className="text-base font-black text-blue-950 truncate">
                {overrideItem.name} ({overrideItem.selectedUnit || 'un'})
              </h3>
            </div>

            <div className="space-y-4 text-left">
              {/* PRICE OVERRIDE */}
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-blue-700 uppercase tracking-wider">Substituir Preço Unitário (MT):</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400 font-mono text-xs font-bold">MT</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="Ex: 1500"
                    value={overrideItemPrice}
                    onChange={(e) => setOverrideItemPrice(e.target.value)}
                    className="w-full bg-blue-50/20 border border-blue-200 rounded-xl pl-9 pr-3 py-2.5 font-mono text-xs font-bold text-blue-900 outline-none focus:border-amber-400 focus:bg-white transition-all h-10"
                  />
                </div>
                <p className="text-[9px] text-blue-500">
                  Deixe em branco ou restaure o original para remover a substituição de preço.
                </p>
              </div>

              {/* MANUAL DISCOUNT SECTION */}
              <div className="space-y-2 border-t border-blue-100 pt-3">
                <label className="block text-[10px] font-bold text-blue-700 uppercase tracking-wider">Desconto Manual no Artigo:</label>
                
                {/* Discount type toggle selection buttons */}
                <div className="grid grid-cols-3 gap-2">
                  {(['none', 'percent', 'flat'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setOverrideItemDiscountType(type);
                        if (type === 'none') setOverrideItemDiscountValue('0');
                      }}
                      className={cn(
                        "py-2 px-3 text-[10px] font-bold rounded-lg border uppercase transition-all cursor-pointer text-center",
                        overrideItemDiscountType === type
                          ? "bg-amber-500 border-amber-600 text-blue-950 font-black"
                          : "bg-blue-50/20 border-blue-200 text-blue-800 hover:border-blue-350"
                      )}
                    >
                      {type === 'none' ? 'Sem Desconto' : type === 'percent' ? 'Percentual (%)' : 'Fixo (MT)'}
                    </button>
                  ))}
                </div>

                {overrideItemDiscountType !== 'none' && (
                  <div className="pt-1.5 space-y-1">
                    <label className="block text-[9px] font-semibold text-blue-500">Valor do Desconto:</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400 font-mono text-xs font-bold">
                        {overrideItemDiscountType === 'percent' ? '%' : 'MT'}
                      </span>
                      <input
                        type="number"
                        min="0"
                        placeholder={overrideItemDiscountType === 'percent' ? "Ex: 10" : "Ex: 150"}
                        value={overrideItemDiscountValue}
                        onChange={(e) => setOverrideItemDiscountValue(e.target.value)}
                        className="w-full bg-blue-50/20 border border-blue-200 rounded-xl pl-8 pr-3 py-2 font-mono text-xs font-bold text-blue-900 outline-none focus:border-amber-400 focus:bg-white transition-all h-10"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* OVERRIDE REASON */}
              <div className="space-y-1 border-t border-blue-100 pt-3">
                <label className="block text-[10px] font-bold text-blue-700 uppercase tracking-wider">Motivo do Ajuste (Obrigatório para Auditoria):</label>
                <input
                  type="text"
                  placeholder="Ex: Campanha, Erro etiqueta, Cliente fiel..."
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  className="w-full bg-blue-50/20 border border-blue-200 rounded-xl px-3 py-2.5 text-xs text-blue-900 outline-none focus:border-amber-400 focus:bg-white transition-all h-10"
                />
              </div>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setIsItemOverrideModalOpen(false)}
                className="flex-1 py-3 bg-blue-100 hover:bg-blue-200 text-blue-900 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer border-none"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!overrideReason.trim()) {
                    toast.error("Introduza o motivo da alteração para efeitos de auditoria.");
                    return;
                  }
                  
                  // Restore original if set empty
                  const customPrice = overrideItemPrice.trim() !== '' ? Number(overrideItemPrice) : null;
                  const discountVal = Number(overrideItemDiscountValue) || 0;
                  
                  updateCartItemOverride(
                    overrideItem.id,
                    overrideItem.selectedUnit,
                    customPrice,
                    overrideItemDiscountType,
                    discountVal,
                    overrideReason.trim()
                  );

                  toast.success("Preço / Desconto gravado com sucesso!");
                  setIsItemOverrideModalOpen(false);
                }}
                className="flex-1 py-3 bg-amber-500 hover:bg-amber-450 text-blue-950 rounded-xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer border-none"
              >
                Gravar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GLOBAL CART DISCOUNT MODAL */}
      {isCartDiscountModalOpen && (
        <div className="fixed inset-0 z-100 bg-[#02182E]/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-blue-200 rounded-[32px] max-w-md w-full p-6 sm:p-8 shadow-2xl flex flex-col space-y-5 relative animate-in fade-in zoom-in-95 duration-200">
            <button 
              type="button"
              onClick={() => setIsCartDiscountModalOpen(false)}
              className="absolute top-4 right-4 text-blue-400 hover:text-blue-600 p-2 hover:bg-blue-50 rounded-xl transition-all cursor-pointer border-none bg-transparent"
            >
              <X size={20} />
            </button>

            <div className="space-y-1 text-left">
              <span className="text-[9px] font-black uppercase tracking-widest text-blue-400 leading-none">Ajuste de Desconto</span>
              <h3 className="text-base font-black text-blue-950">
                Desconto Global do Carrinho
              </h3>
            </div>

            <div className="space-y-4 text-left">
              <div className="space-y-2.5">
                <label className="block text-[10px] font-bold text-blue-700 uppercase tracking-wider">Tipo de Desconto:</label>
                
                <div className="grid grid-cols-3 gap-2">
                  {(['none', 'percent', 'flat'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setEditCartDiscountType(type);
                        if (type === 'none') setEditCartDiscountValue('0');
                      }}
                      className={cn(
                        "py-2 px-3 text-[10px] font-bold rounded-lg border uppercase transition-all cursor-pointer text-center",
                        editCartDiscountType === type
                          ? "bg-amber-500 border-amber-600 text-blue-950 font-black"
                          : "bg-blue-50/20 border-blue-200 text-blue-800 hover:border-blue-350"
                      )}
                    >
                      {type === 'none' ? 'Sem Desconto' : type === 'percent' ? 'Percentual (%)' : 'Fixo (MT)'}
                    </button>
                  ))}
                </div>

                {editCartDiscountType !== 'none' && (
                  <div className="pt-1.5 space-y-1">
                    <label className="block text-[9px] font-semibold text-blue-500">Valor do Desconto:</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400 font-mono text-xs font-bold">
                        {editCartDiscountType === 'percent' ? '%' : 'MT'}
                      </span>
                      <input
                        type="number"
                        min="0"
                        placeholder={editCartDiscountType === 'percent' ? "Ex: 5" : "Ex: 200"}
                        value={editCartDiscountValue}
                        onChange={(e) => setEditCartDiscountValue(e.target.value)}
                        className="w-full bg-blue-50/20 border border-blue-200 rounded-xl pl-8 pr-3 py-2 font-mono text-xs font-bold text-blue-900 outline-none focus:border-amber-400 focus:bg-white transition-all h-10"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* OVERRIDE REASON */}
              <div className="space-y-1 border-t border-blue-100 pt-3">
                <label className="block text-[10px] font-bold text-blue-700 uppercase tracking-wider">Motivo do Desconto (Obrigatório para Auditoria):</label>
                <input
                  type="text"
                  placeholder="Ex: Campanha Black Friday, Desconto de Cortesia, Danificado..."
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  className="w-full bg-blue-50/20 border border-blue-200 rounded-xl px-3 py-2.5 text-xs text-blue-900 outline-none focus:border-amber-400 focus:bg-white transition-all h-10"
                />
              </div>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setIsCartDiscountModalOpen(false)}
                className="flex-1 py-3 bg-blue-100 hover:bg-blue-200 text-blue-900 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer border-none"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (editCartDiscountType !== 'none' && !overrideReason.trim()) {
                    toast.error("Introduza o motivo da alteração para efeitos de auditoria.");
                    return;
                  }

                  const val = Number(editCartDiscountValue) || 0;
                  setCartDiscountType(editCartDiscountType);
                  setCartDiscountValue(val);

                  if (editCartDiscountType !== 'none' && val > 0 && profile?.businessId) {
                    logAuditEvent({
                      businessId: profile.businessId,
                      eventType: 'discount_applied',
                      performedBy: {
                        uid: profile.uid || '',
                        name: profile.displayName || profile.email || 'Utilizador',
                        email: profile.email || '',
                      },
                      originalValue: subtotal,
                      newValue: editCartDiscountType === 'percent' ? subtotal * (1 - val / 100) : Math.max(0, subtotal - val),
                      reason: overrideReason.trim() || 'Desconto global no carrinho',
                      cartSessionId: cartSessionId,
                      details: {
                        discountType: editCartDiscountType,
                        discountValue: val,
                        cartSubtotal: subtotal
                      }
                    }).catch(e => console.error("Error logging discount audit:", e));
                    toast.success("Desconto global aplicado ao carrinho!");
                  } else {
                    toast.success("Desconto global limpo.");
                  }

                  setIsCartDiscountModalOpen(false);
                }}
                className="flex-1 py-3 bg-amber-500 hover:bg-amber-450 text-blue-950 rounded-xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer border-none"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manager authorization PIN modal */}
      <ManagerPINModal
        isOpen={isManagerPINOpen}
        onClose={() => setIsManagerPINOpen(false)}
        actionName={managerPINAction}
        onSuccess={(approvedBy) => {
          setIsManagerPINOpen(false);
          if (activePINActionType === 'credit_bypass' || !activePINActionType) {
            setIsCreditLimitBypassed(true);
            toast.success("Bypass de limite de crédito autorizado!");
            
            // Log audit event for manager override
            if (profile?.businessId) {
              logAuditEvent({
                businessId: profile.businessId,
                eventType: 'manager_override_used',
                performedBy: {
                  uid: profile.uid || '',
                  name: profile.displayName || profile.email || 'Utilizador',
                  email: profile.email || '',
                },
                approvedBy: approvedBy || 'Gerente',
                reason: 'Bypass de limite de crédito para ' + (selectedCust?.name || 'Cliente'),
                cartSessionId: cartSessionId,
                details: {
                  customerId: selectedCustomerId,
                  customerName: selectedCust?.name || '',
                  currentDebt: selectedCust?.outstandingBalance || 0,
                  creditLimit: selectedCust?.creditLimit || 500,
                  saleTotal: total
                }
              }).catch(e => console.error("Error logging credit bypass:", e));
            }

            // Automatically re-trigger the checkout now that it's authorized
            setTimeout(() => {
              checkOutTransaction();
            }, 100);
          } else if (activePINActionType === 'void_item') {
            executeVoidItem(true, approvedBy);
          } else if (activePINActionType === 'refund_sale') {
            executeRefund(true, approvedBy);
          } else if (activePINActionType === 'price_override' && pendingPriceOverride) {
            const { id, unit, price, reason } = pendingPriceOverride;
            updateCartItemOverride(id, unit, price, 'none', 0, reason + ` (Autorizado por gerente: ${approvedBy || 'Gerente'})`);
            toast.success(`Preço unitário alterado com autorização de ${approvedBy || 'Gerente'}!`);
            setPendingPriceOverride(null);
            setActivePINActionType(null);
          }
        }}
      />

      {/* Reusable Numeric Keypad Modal for rapid tablet touch entries */}
      <NumericKeypad
        isOpen={isNumericKeypadOpen}
        onClose={() => {
          setIsNumericKeypadOpen(false);
          setNumericKeypadItem(null);
        }}
        initialValue={
          numericKeypadItem
            ? numericKeypadMode === 'qty'
              ? numericKeypadItem.quantity.toString()
              : (numericKeypadItem.overridePrice !== undefined && numericKeypadItem.overridePrice !== null
                  ? numericKeypadItem.overridePrice.toString()
                  : getCartItemPricing(numericKeypadItem).normalRetailPrice.toString())
            : ''
        }
        onConfirm={handleNumericKeypadConfirm}
        title={numericKeypadMode === 'qty' ? 'Quantidade Manual' : 'Substituir Preço Unitário'}
        subtitle={numericKeypadItem?.name}
        unit={numericKeypadMode === 'qty' ? numericKeypadItem?.selectedUnit || 'un' : 'MT'}
        placeholder="0"
      />

      {/* Cheat Sheet Keyboard Shortcuts Overlay Modal */}
      {isCheatSheetOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center z-[100] p-4 font-sans select-none animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-[32px] max-w-lg w-full p-6 shadow-2xl relative space-y-5 text-left animate-in zoom-in-95 duration-200">
            <button
              type="button"
              onClick={() => setIsCheatSheetOpen(false)}
              className="absolute right-4 top-4 p-2 hover:bg-blue-50 text-blue-400 hover:text-blue-900 rounded-full transition-all border-none cursor-pointer bg-transparent"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 border-b border-blue-100 pb-4">
              <div className="p-3 bg-blue-50 text-[#0C3A42] rounded-2xl">
                <Calculator size={24} />
              </div>
              <div>
                <h3 className="text-base font-black text-blue-950 uppercase tracking-tight">Manual de Atalhos — Quick Sale</h3>
                <p className="text-[10px] text-blue-500 font-bold uppercase tracking-widest">Acelere as operações de checkout</p>
              </div>
            </div>

            <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
              <div>
                <h4 className="text-[10px] font-black uppercase text-blue-600 tracking-wider mb-2">Comandos de Entrada Rápida</h4>
                <div className="grid grid-cols-1 gap-2">
                  <div className="flex items-center justify-between p-2.5 bg-blue-50/20 rounded-2xl border border-blue-100">
                    <span className="text-xs text-blue-900 font-bold">Adicionar Produto por SKU/Código</span>
                    <span className="font-mono text-[10px] font-black bg-blue-100 text-blue-950 px-2 py-0.5 rounded-lg border border-blue-200">
                      [SKU] + Enter
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 bg-blue-50/20 rounded-2xl border border-blue-100">
                    <span className="text-xs text-blue-900 font-bold">Adicionar Qtd + Produto numa só vez</span>
                    <span className="font-mono text-[10px] font-black bg-blue-100 text-blue-950 px-2 py-0.5 rounded-lg border border-blue-200">
                      [Qtd]x[SKU] + Enter (Ex: 3x1001)
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 bg-blue-50/20 rounded-2xl border border-blue-100">
                    <span className="text-xs text-blue-900 font-bold">Definir Qtd do Último Artigo adicionado</span>
                    <span className="font-mono text-[10px] font-black bg-blue-100 text-blue-950 px-2 py-0.5 rounded-lg border border-blue-200">
                      [Qtd]x + Enter ou x[Qtd] + Enter
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 bg-blue-50/20 rounded-2xl border border-blue-100">
                    <span className="text-xs text-blue-900 font-bold">Ir para Checkout / Finalizar Venda</span>
                    <span className="font-mono text-[10px] font-black bg-blue-100 text-blue-950 px-2 py-0.5 rounded-lg border border-blue-200">
                      Enter (com buffer vazio)
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-[10px] font-black uppercase text-blue-600 tracking-wider mb-2">Teclas de Função Directa</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1 p-2.5 bg-blue-50/20 rounded-xl border border-blue-100">
                    <span className="text-[10px] font-black text-blue-950">F8</span>
                    <span className="text-[10px] text-blue-600 font-bold">Cobrar / Processar Venda</span>
                  </div>
                  <div className="flex flex-col gap-1 p-2.5 bg-blue-50/20 rounded-xl border border-blue-100">
                    <span className="text-[10px] font-black text-blue-950">F9</span>
                    <span className="text-[10px] text-blue-600 font-bold">Alternar Pagamento</span>
                  </div>
                  <div className="flex flex-col gap-1 p-2.5 bg-blue-50/20 rounded-xl border border-blue-100">
                    <span className="text-[10px] font-black text-blue-950">F3 ou F4</span>
                    <span className="text-[10px] text-blue-600 font-bold">Suspender Carrinho (Hold)</span>
                  </div>
                  <div className="flex flex-col gap-1 p-2.5 bg-blue-50/20 rounded-xl border border-blue-100">
                    <span className="text-[10px] font-black text-blue-950">F7</span>
                    <span className="text-[10px] text-blue-600 font-bold">Listar Vendas em Espera</span>
                  </div>
                  <div className="flex flex-col gap-1 p-2.5 bg-blue-50/20 rounded-xl border border-blue-100 col-span-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-blue-950">Delete / F12 / Backspace</span>
                      <span className="text-[9px] text-orange-600 font-black uppercase tracking-wider">sem buffer ativo</span>
                    </div>
                    <span className="text-[10px] text-blue-600 font-bold">Anular último item do carrinho</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setIsCheatSheetOpen(false)}
                className="w-full py-3 bg-[#0C3A42] text-white font-bold uppercase tracking-widest rounded-2xl text-[10px] hover:bg-[#032240] transition-all cursor-pointer border-none"
              >
                Fechar Manual [Esc]
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
