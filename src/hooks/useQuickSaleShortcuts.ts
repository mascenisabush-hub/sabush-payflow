import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';

export interface QuickSaleShortcutsProps {
  cart: any[];
  setCart: React.Dispatch<React.SetStateAction<any[]>>;
  products: any[];
  currentShift: any;
  addToCart: (product: any, unit?: string) => void;
  updateCartQuantity: (id: string, unit: string, qty: number, allowZero?: boolean) => void;
  checkOutTransaction: () => void;
  paymentMethod: string;
  setPaymentMethod: (method: string) => void;
  setIsSuspenseLabelModalOpen: (open: boolean) => void;
  setIsSuspendedModalOpen: (open: boolean) => void;
  handleRemoveClick: (id: string, unit: string) => void;
  closeAllModals: () => void;
  matchProductByBarcodeOrSku: (code: string) => any;
  resolveDefaultUnit: (product: any) => string;
  getUnitMultiplier: (product: any, unit: string) => number;
  isModalOpen: boolean; // Flag to check if any popup is open
}

export function useQuickSaleShortcuts({
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
  closeAllModals,
  matchProductByBarcodeOrSku,
  resolveDefaultUnit,
  getUnitMultiplier,
  isModalOpen
}: QuickSaleShortcutsProps) {
  const [inputBuffer, setInputBuffer] = useState<string>('');
  const [isCheatSheetOpen, setIsCheatSheetOpen] = useState<boolean>(false);
  const [lastActionMessage, setLastActionMessage] = useState<string>('');

  const lastKeyTimeRef = useRef<number>(0);
  const isScannerActiveRef = useRef<boolean>(false);
  const scannerTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to add product with specific initial quantity
  const addProductToCartWithQty = (product: any, qty: number, unit?: string) => {
    const resolvedUnit = unit || resolveDefaultUnit(product);
    const resolvedMulti = getUnitMultiplier(product, resolvedUnit);

    setCart(prev => {
      const existingIdx = prev.findIndex(item => item.id === product.id && item.selectedUnit === resolvedUnit);
      const limitStock = Number(product.stockLevel || 0);

      if (existingIdx !== -1) {
        const item = prev[existingIdx];
        const newQty = item.quantity + qty;
        const totalUnits = newQty * resolvedMulti;
        
        if (totalUnits > limitStock) {
          toast.error(`Stock indisponível! Restam apenas ${limitStock} unidades.`);
          return prev;
        }

        const updated = [...prev];
        updated[existingIdx] = { ...item, quantity: newQty };
        return updated;
      } else {
        const totalUnits = qty * resolvedMulti;
        if (totalUnits > limitStock) {
          toast.error(`Stock indisponível! Restam apenas ${limitStock} unidades.`);
          return prev;
        }
        return [...prev, {
          ...product,
          quantity: qty,
          selectedUnit: resolvedUnit,
          basePrice: product.price,
          unitMultiplier: resolvedMulti
        }];
      }
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Ignore if inside normal input/textarea fields
      const activeEl = document.activeElement;
      if (activeEl) {
        const tag = activeEl.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || activeEl.hasAttribute('contenteditable')) {
          // If the user presses Escape inside an input, we can still blur it or close modals
          if (e.key === 'Escape') {
            (activeEl as HTMLElement).blur();
            closeAllModals();
            setInputBuffer('');
          }
          return;
        }
      }

      // 2. Timing-based barcode scanner protection (Rule 3)
      const now = Date.now();
      const diff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      if (diff < 45) {
        isScannerActiveRef.current = true;
        if (scannerTimeoutRef.current) clearTimeout(scannerTimeoutRef.current);
        scannerTimeoutRef.current = setTimeout(() => {
          isScannerActiveRef.current = false;
        }, 120);

        setInputBuffer(''); // clear buffer since it was barcode input
        return;
      }

      if (isScannerActiveRef.current) {
        // Discard any rapid inputs from scanner emulation
        return;
      }

      // 3. Escape key to close all modals and clear buffer
      if (e.key === 'Escape') {
        e.preventDefault();
        closeAllModals();
        setInputBuffer('');
        setIsCheatSheetOpen(false);
        setLastActionMessage('Ação cancelada');
        return;
      }

      // If a modal is open, we do not want to parse normal alphanumeric commands to avoid background typing
      if (isModalOpen) {
        return;
      }

      // 4. Toggle Shortcuts Cheat Sheet with "?" key (Shift + /)
      if (e.key === '?') {
        e.preventDefault();
        setIsCheatSheetOpen(prev => !prev);
        return;
      }

      // 5. Function keys & Dedicated shortcut handlers
      switch (e.key) {
        case 'F8': // Open payment / trigger checkout
          e.preventDefault();
          if (cart.length > 0) {
            checkOutTransaction();
            setLastActionMessage('A processar finalização de venda...');
          } else {
            toast.error("O carrinho está vazio.");
          }
          return;

        case 'F9': // Cycle payment method
          e.preventDefault();
          const paymentMethods = ['cash', 'mpesa', 'emola', 'bank', 'card'];
          const currentIndex = paymentMethods.indexOf(paymentMethod);
          const nextIndex = (currentIndex + 1) % paymentMethods.length;
          setPaymentMethod(paymentMethods[nextIndex]);
          toast.success(`Modo: ${paymentMethods[nextIndex].toUpperCase()}`);
          setLastActionMessage(`Pagamento: ${paymentMethods[nextIndex].toUpperCase()}`);
          return;

        case 'F3':
        case 'F4': // Suspend cart (Hold order)
          e.preventDefault();
          if (cart.length === 0) {
            toast.error("O carrinho está vazio.");
          } else {
            setIsSuspenseLabelModalOpen(true);
            setLastActionMessage('A suspender carrinho...');
          }
          return;

        case 'F7': // Recall held order
          e.preventDefault();
          setIsSuspendedModalOpen(true);
          setLastActionMessage('A abrir lista de suspensos...');
          return;

        case 'F12':
        case 'Delete': // Void last item
          e.preventDefault();
          if (cart.length > 0) {
            const lastItem = cart[cart.length - 1];
            handleRemoveClick(lastItem.id, lastItem.selectedUnit);
            setLastActionMessage(`A anular artigo: ${lastItem.name}`);
          } else {
            toast.error("O carrinho está vazio.");
          }
          return;
      }

      // 6. Alphanumeric Buffer Parsing
      if (e.key === 'Enter') {
        e.preventDefault();
        const trimBuf = inputBuffer.trim();

        if (!trimBuf) {
          // Empty buffer + Enter = Jump to checkout/payment screen (Rule 1)
          if (cart.length > 0) {
            checkOutTransaction();
            setLastActionMessage('A processar finalização...');
          } else {
            toast.error("Adicione artigos ao carrinho primeiro.");
          }
          return;
        }

        // Parse buffer commands
        const lowerBuf = trimBuf.toLowerCase();

        // Regex 1: Quantity update for last item only (e.g. "3x", "3*", "x3", "*3")
        const qtyOnlyRegex = /^([0-9.]+)([x*])\s*$|^([x*])([0-9.]+)\s*$/;
        const qtyOnlyMatch = lowerBuf.match(qtyOnlyRegex);
        if (qtyOnlyMatch) {
          const qtyStr = qtyOnlyMatch[1] || qtyOnlyMatch[4];
          const qty = Number(qtyStr);
          if (qty > 0) {
            const lastItem = cart[cart.length - 1];
            if (lastItem) {
              updateCartQuantity(lastItem.id, lastItem.selectedUnit, qty);
              setLastActionMessage(`Quantidade de "${lastItem.name}" alterada para ${qty}`);
            } else {
              toast.error("Nenhum artigo no carrinho para alterar quantidade.");
            }
          } else {
            toast.error("Quantidade inválida.");
          }
          setInputBuffer('');
          return;
        }

        // Regex 2: Product code + quantity command (e.g. "3x1001", "1001x3", "1001*3")
        const codeAndQtyRegex = /^([0-9.]+)([x*])([a-zA-Z0-9.\-_]+)\s*$|^([a-zA-Z0-9.\-_]+)([x*])([0-9.]+)\s*$/;
        const codeAndQtyMatch = lowerBuf.match(codeAndQtyRegex);
        if (codeAndQtyMatch) {
          let qty = 1;
          let code = '';
          if (codeAndQtyMatch[1]) { // Prefix: e.g. "3x1001"
            qty = Number(codeAndQtyMatch[1]);
            code = codeAndQtyMatch[3];
          } else { // Suffix: e.g. "1001x3"
            qty = Number(codeAndQtyMatch[6]);
            code = codeAndQtyMatch[4];
          }

          if (qty > 0 && code) {
            const matched = matchProductByBarcodeOrSku(code);
            if (matched) {
              addProductToCartWithQty(matched, qty);
              setLastActionMessage(`Adicionado ${qty}x de "${matched.name}"`);
            } else {
              toast.error(`Produto não encontrado com código/SKU: "${code}"`);
            }
          } else {
            toast.error("Comando de quantidade/produto inválido.");
          }
          setInputBuffer('');
          return;
        }

        // Case 3: Just a code (numeric key / quick code / barcode / SKU)
        const matched = matchProductByBarcodeOrSku(lowerBuf);
        if (matched) {
          addToCart(matched);
          setLastActionMessage(`Adicionado: "${matched.name}"`);
        } else {
          toast.error(`Código de barras/SKU desconhecido: "${trimBuf}"`);
        }
        setInputBuffer('');
        return;
      }

      // Handle character addition to the buffer
      if (e.key.length === 1) {
        // Limit characters to digits, letters, *, x, X, and separators
        if (/^[a-zA-Z0-9*.\-_]$/.test(e.key)) {
          e.preventDefault();
          setInputBuffer(prev => {
            const next = prev + e.key;
            // Limit buffer to a reasonable size
            if (next.length > 30) return prev;
            return next;
          });
        }
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        setInputBuffer(prev => prev.slice(0, -1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (scannerTimeoutRef.current) clearTimeout(scannerTimeoutRef.current);
    };
  }, [
    cart,
    products,
    inputBuffer,
    paymentMethod,
    isModalOpen
  ]);

  return {
    inputBuffer,
    setInputBuffer,
    isCheatSheetOpen,
    setIsCheatSheetOpen,
    lastActionMessage,
    setLastActionMessage
  };
}
