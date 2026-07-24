import React, { useState, useEffect } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc, 
  onSnapshot, 
  collectionGroup,
  addDoc,
  serverTimestamp,
  updateDoc
} from 'firebase/firestore';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  sendPasswordResetEmail,
  User as FirebaseUser
} from 'firebase/auth';
import { useTranslation } from 'react-i18next';
import { 
  FileText, 
  User, 
  Lock, 
  Mail, 
  Download, 
  ExternalLink, 
  DollarSign, 
  History, 
  CheckCircle, 
  AlertCircle, 
  X, 
  TrendingUp, 
  ShieldCheck, 
  Loader2, 
  Globe, 
  Phone, 
  MapPin, 
  Building,
  ChevronDown,
  ChevronUp,
  Eye,
  Key,
  LogOut,
  Search,
  ShoppingCart,
  Upload,
  MessageSquare,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { generateInvoicePDF, generatePaymentReceiptPDF } from '../lib/pdfGenerator';
import { formatSystemCurrency, formatCurrencyValue } from '../lib/currencies';
import { TermsModal } from './TermsModal';

export default function CustomerPortal() {
  const { t, i18n } = useTranslation();
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [showResets, setShowResets] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [termsModalTab, setTermsModalTab] = useState<'terms' | 'privacy'>('terms');
  const [currentTab, setCurrentTab] = useState<'overview' | 'invoices' | 'purchases' | 'business' | 'quotations'>('overview');

  // Custom Quotations and Shopping Cart requesting state
  const [productsList, setProductsList] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [customerQuotations, setCustomerQuotations] = useState<any[]>([]);
  const [cart, setCart] = useState<{ productId: string; name: string; quantity: number; price: number }[]>([]);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'cash' | 'credit'>('cash');
  const [productSearch, setProductSearch] = useState('');

  // Input states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Portal active association
  const [activeBusinessId, setActiveBusinessId] = useState<string | null>(null);
  const [activeCustomerId, setActiveCustomerId] = useState<string | null>(null);
  const [businessData, setBusinessData] = useState<any | null>(null);
  const [customerProfile, setCustomerProfile] = useState<any | null>(null);
  const [allAssociatedPortals, setAllAssociatedPortals] = useState<any[]>([]); // If found multiple relationships
  const [loadingPortalData, setLoadingPortalData] = useState(false);

  // Ledger state
  const [invoices, setInvoices] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(false);

  // Payment Proof reporting states
  const [showReportPaymentModal, setShowReportPaymentModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);
  const [reportAmount, setReportAmount] = useState('');
  const [reportMethod, setReportMethod] = useState('mpesa');
  const [reportReference, setReportReference] = useState('');
  const [reportNotes, setReportNotes] = useState('');
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [whatsappHref, setWhatsappHref] = useState<string | null>(null);
  const [whatsappMessage, setWhatsappMessage] = useState<string | null>(null);

  // Quotation client action states
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);
  const [isClientDeclineModalOpen, setIsClientDeclineModalOpen] = useState(false);
  const [decliningQuotation, setDecliningQuotation] = useState<any | null>(null);
  const [clientDeclineReason, setClientDeclineReason] = useState('');

  // Read query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const bid = params.get('bid');
    const cid = params.get('cid');

    if (bid) {
      localStorage.setItem('customer_portal_bid', bid);
      setActiveBusinessId(bid);
    } else {
      const storedBid = localStorage.getItem('customer_portal_bid');
      if (storedBid) setActiveBusinessId(storedBid);
    }

    if (cid) {
      localStorage.setItem('customer_portal_cid', cid);
      setActiveCustomerId(cid);
    } else {
      const storedCid = localStorage.getItem('customer_portal_cid');
      if (storedCid) setActiveCustomerId(storedCid);
    }
  }, []);

  // Monitor auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoadingAuth(false);
    });
    return unsubscribe;
  }, []);

  // Fetch business and customer profile when authenticated and bid/cid is present
  useEffect(() => {
    if (!currentUser) {
      setBusinessData(null);
      setCustomerProfile(null);
      return;
    }

    // Step 1: If URL/Local storage contains bid and cid, verify that specific associate portal
    if (activeBusinessId && activeCustomerId) {
      setLoadingPortalData(true);
      const customerRef = doc(db, `businesses/${activeBusinessId}/customers/${activeCustomerId}`);
      
      getDoc(customerRef).then(async (custSnap) => {
        if (custSnap.exists()) {
          const custInfo = custSnap.data();
          const userEmail = currentUser.email?.toLowerCase().trim();
          const custEmail = custInfo.email?.toLowerCase().trim();
          const userPhone = currentUser.phoneNumber?.replace(/\s+/g, '');
          const custPhone = custInfo.phone?.replace(/\s+/g, '');

          // Strict confirmation: Does email match customer email?
          if (userEmail && custEmail === userEmail) {
            setCustomerProfile({ id: custSnap.id, ...custInfo });
            // Fetch business
            const bizRef = doc(db, `businesses/${activeBusinessId}`);
            const bizSnap = await getDoc(bizRef);
            if (bizSnap.exists()) {
              setBusinessData({ id: bizSnap.id, ...bizSnap.data() });
            }
          } else {
            console.warn("Unauthorized access: Email mismatch.", { userEmail, custEmail });
            // Look up alternative portal options for this email since parameters might be for a different account
            await searchPortalsForEmail(userEmail);
          }
        } else {
          console.warn("Customer profile does not exist under this business.");
          await searchPortalsForEmail(currentUser.email?.toLowerCase().trim());
        }
      }).catch(err => {
        console.error("Failed to load custom portal profile:", err);
      }).finally(() => {
        setLoadingPortalData(false);
      });
    } else if (currentUser.email) {
      // Step 2: No active bid/cid but we have logged in email. Look up all customer records matching
      setLoadingPortalData(true);
      searchPortalsForEmail(currentUser.email).finally(() => {
        setLoadingPortalData(false);
      });
    }
  }, [currentUser, activeBusinessId, activeCustomerId]);

  // Helper to query all customer profiles matching logged-in user email
  const searchPortalsForEmail = async (emailToSearch?: string) => {
    if (!emailToSearch) return;
    try {
      const q = query(
        collectionGroup(db, 'customers'), 
        where('email', '==', emailToSearch.trim())
      );
      const snap = await getDocs(q);
      const list: any[] = [];
      
      for (const d of snap.docs) {
        const item = d.data();
        const pathParts = d.ref.path.split('/');
        const bId = pathParts[1]; // businesses/{businessId}/customers/{customerId}
        
        // Load business details
        const bizRef = doc(db, `businesses/${bId}`);
        const bizSnap = await getDoc(bizRef);
        
        list.push({
          customerId: d.id,
          businessId: bId,
          businessName: bizSnap.exists() ? bizSnap.data().name : 'Empresa do ERP',
          customerName: item.name,
          outstandingBalance: item.outstandingBalance || 0,
          totalSpent: item.totalSpent || 0,
          customerData: item
        });
      }
      setAllAssociatedPortals(list);

      // If we found exactly 1 portal, auto-select it!
      if (list.length === 1) {
        const single = list[0];
        setActiveBusinessId(single.businessId);
        setActiveCustomerId(single.customerId);
        setCustomerProfile({ id: single.customerId, ...single.customerData });
        
        const bizRef = doc(db, `businesses/${single.businessId}`);
        const bizSnap = await getDoc(bizRef);
        if (bizSnap.exists()) {
          setBusinessData({ id: bizSnap.id, ...bizSnap.data() });
        }
      }
    } catch (err) {
      console.error("Error finding portals by collectionGroup:", err);
    }
  };

  const handleOpenReportPayment = (invoice: any) => {
    setSelectedInvoice(invoice);
    const balance = invoice.outstandingBalance !== undefined ? invoice.outstandingBalance : (invoice.total || 0);
    setReportAmount(String(balance));
    setReportMethod('mpesa');
    setReportReference('');
    setReportNotes('');
    setScreenshotFile(null);
    setScreenshotPreview(null);
    setWhatsappHref(null);
    setWhatsappMessage(null);
    setShowReportPaymentModal(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 8 * 1024 * 1024) {
        toast.error("O tamanho do arquivo excede o limite máximo de 8MB.");
        return;
      }
      setScreenshotFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setScreenshotPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice || !activeBusinessId) return;
    if (!reportAmount || Number(reportAmount) <= 0) {
      toast.error("Por favor, introduza um valor pago válido.");
      return;
    }
    if (!screenshotPreview) {
      toast.error("É necessário anexar um comprovativo de pagamento (screenshot/foto).");
      return;
    }

    setIsSubmittingReport(true);
    try {
      const proofPayload = {
        invoiceId: selectedInvoice.id,
        invoiceNumber: selectedInvoice.invoiceNumber,
        customerId: activeCustomerId,
        customerName: customerProfile?.name || 'Cliente Geral',
        amount: Number(reportAmount),
        method: reportMethod,
        reference: reportReference.trim(),
        notes: reportNotes.trim(),
        screenshotUrl: screenshotPreview,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await addDoc(collection(db, `businesses/${activeBusinessId}/payment_proofs`), proofPayload);

      // Trigger automatic live in-app notification to the business owner
      try {
        const notificationRef = collection(db, `businesses/${activeBusinessId}/notifications`);
        await addDoc(notificationRef, {
          title: "Novo Comprovativo de Pagamento",
          message: `O cliente "${customerProfile?.name || 'Cliente'}" enviou um comprovativo no valor de ${Number(reportAmount).toLocaleString('pt-MZ')} MT para a Fatura #${selectedInvoice.invoiceNumber} através de ${reportMethod.toUpperCase()}.`,
          type: 'payment',
          read: false,
          createdAt: serverTimestamp()
        });

        // Push real-time live alert notification to sellers
        const { sendLiveNotification } = await import('../lib/notificationService');
        await sendLiveNotification(
          activeBusinessId,
          "Novo Comprovativo de Pagamento",
          `O cliente "${customerProfile?.name || 'Cliente'}" enviou um comprovativo no valor de ${Number(reportAmount).toLocaleString('pt-MZ')} MT (Ref: #${selectedInvoice.invoiceNumber}).`,
          'success'
        );
      } catch (notiErr) {
        console.warn("Live notification creation skipped:", notiErr);
      }

      // Format elegant WhatsApp redirect link
      const waText = `Olá! Realizei o pagamento de *${Number(reportAmount).toLocaleString('pt-MZ')} MT* referente à *Fatura #${selectedInvoice.invoiceNumber}* no portal e enviei o comprovativo em anexo. Pode verificar por favor? Obrigado!`;
      const encodedWaText = encodeURIComponent(waText);
      const sellerPhoneClean = businessData?.phone?.replace(/\+/g, '').replace(/\s+/g, '') || '';
      const waLink = `https://wa.me/${sellerPhoneClean}?text=${encodedWaText}`;

      setWhatsappMessage(waText);
      setWhatsappHref(waLink);

      toast.success("Comprovativo submetido com sucesso! O vendedor foi alertado.");
    } catch (err: any) {
      console.error("Failed to submit payment proof:", err);
      toast.error(`Erro ao submeter comprovativo: ${err.message || err}`);
    } finally {
      setIsSubmittingReport(false);
    }
  };

  // Real-time listener for customer's invoices & payments once confirmed
  useEffect(() => {
    if (!activeBusinessId || !activeCustomerId || !customerProfile) return;

    setLoadingLedger(true);

    const invoicesQuery = query(
      collection(db, `businesses/${activeBusinessId}/invoices`),
      where('customerId', '==', activeCustomerId)
    );

    const unsubscribeInvoices = onSnapshot(invoicesQuery, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Sort newest first
      setInvoices(docs.sort((a: any, b: any) => new Date(b.date || b.createdAt?.seconds * 1000).getTime() - new Date(a.date || a.createdAt?.seconds * 1000).getTime()));
      setLoadingLedger(false);
    }, (err) => {
      console.error("Invoices sub subscription failed:", err);
    });

    const paymentsQuery = query(
      collection(db, `businesses/${activeBusinessId}/payments`),
      where('customerId', '==', activeCustomerId)
    );

    const unsubscribePayments = onSnapshot(paymentsQuery, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setPayments(docs.sort((a: any, b: any) => new Date(b.date || b.createdAt?.seconds * 1000).getTime() - new Date(a.date || a.createdAt?.seconds * 1000).getTime()));
    }, (err) => {
      console.error("Payments sub subscription failed:", err);
    });

    return () => {
      unsubscribeInvoices();
      unsubscribePayments();
    };
  }, [activeBusinessId, activeCustomerId, customerProfile]);

  // Real-time listener for the customer's portal quotations
  useEffect(() => {
    if (!activeBusinessId || !activeCustomerId) return;
    const qQuery = query(
      collection(db, `businesses/${activeBusinessId}/quotations`),
      where('customerId', '==', activeCustomerId)
    );
    const unsubscribeQuotations = onSnapshot(qQuery, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setCustomerQuotations(list.sort((a: any, b: any) => {
        const timeA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.date || 0).getTime();
        const timeB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.date || 0).getTime();
        return timeB - timeA;
      }));
    }, (err) => {
      console.warn("Quotations onSnapshot failed inside CustomerPortal:", err);
    });
    return () => unsubscribeQuotations();
  }, [activeBusinessId, activeCustomerId]);

  // Load available product listings so customer can request quotation/self-bill
  useEffect(() => {
    if (!activeBusinessId) return;
    setLoadingProducts(true);
    const productsRef = collection(db, `businesses/${activeBusinessId}/products`);
    getDocs(productsRef).then(snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setProductsList(list.filter((p: any) => !p.archived));
    }).catch(err => {
      console.error("Failed to fetch business products for portal:", err);
    }).finally(() => {
      setLoadingProducts(false);
    });
  }, [activeBusinessId]);

  const handleSubmitSelfQuotation = async () => {
    if (cart.length === 0) {
      toast.error("Por favor, adicione pelo menos um produto ao seu carrinho.");
      return;
    }
    try {
      setIsSubmitting(true);
      toast.loading("A processar e enviar o seu pedido de faturação...");

      const qNumber = `QT-PORTAL-${Date.now().toString().slice(-4)}`;
      const totalCost = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);

      const quotationPayload = {
        businessId: activeBusinessId,
        customerId: activeCustomerId,
        customerName: customerProfile?.name || 'Cliente Portal',
        customerEmail: customerProfile?.email || currentUser?.email || '',
        customerPhone: customerProfile?.phone || '',
        deliveryAddress: deliveryAddress || customerProfile?.address || 'Moçambique',
        quotationNumber: qNumber,
        items: cart,
        total: totalCost,
        currency: 'MZN',
        paymentMethod: selectedPaymentMethod,
        status: 'pending_seller_approval',
        createdAt: serverTimestamp(),
        date: new Date().toISOString()
      };

      await addDoc(collection(db, `businesses/${activeBusinessId}/quotations`), quotationPayload);

      try {
        const { syncReservedStock } = await import('../lib/stockReservation');
        await syncReservedStock(activeBusinessId);
      } catch (eRes) {
        console.warn("Could not sync reserved stock inside client online request:", eRes);
      }

      // Trigger automatic live in-app notification to the business owner
      try {
        const notificationRef = collection(db, `businesses/${activeBusinessId}/notifications`);
        await addDoc(notificationRef, {
          title: "Novo Pedido de Faturação",
          message: `O cliente "${customerProfile?.name || 'Cliente Portal'}" enviou um novo pedido de cotação autorreclamado (${qNumber}) no valor de ${totalCost.toLocaleString('pt-MZ')} MT para aprovação. Por favor, reveja e confirme o crédito ou pagamento.`,
          type: 'info',
          read: false,
          createdAt: serverTimestamp()
        });

        // Push real-time live alert notification to sellers
        const { sendLiveNotification } = await import('../lib/notificationService');
        await sendLiveNotification(
          activeBusinessId,
          "Novo Pedido de Faturação",
          `O cliente "${customerProfile?.name || 'Cliente Portal'}" enviou um novo pedido de cotação autorreclamado (${qNumber}) no valor de ${totalCost.toLocaleString('pt-MZ')} MT.`,
          'info'
        );
      } catch (eNotif) {
        console.warn("Failed to dispatch in-app notification to owner:", eNotif);
      }

      toast.dismiss();
      toast.success("Pedido de faturação submetido com sucesso! O proprietário foi notificado e irá rever o seu pedido.");
      setCart([]);
      setDeliveryAddress('');
      setCurrentTab('overview');
    } catch (err: any) {
      toast.dismiss();
      console.error("Failed to submit quotation from portal:", err);
      toast.error("Erro ao enviar pedido: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClientApproveQuotation = async (q: any) => {
    if (!activeBusinessId) return;
    try {
      toast.loading("A aceitar a cotação e a notificar o vendedor...");
      await updateDoc(doc(db, `businesses/${activeBusinessId}/quotations`, q.id), {
        status: 'client_accepted'
      });

      try {
        const { syncReservedStock } = await import('../lib/stockReservation');
        await syncReservedStock(activeBusinessId);
      } catch (eRes) {
        console.warn("Could not sync reserved stock inside client approval:", eRes);
      }

      // Notify business owner in-app
      const notificationRef = collection(db, `businesses/${activeBusinessId}/notifications`);
      await addDoc(notificationRef, {
        title: "Cotação Aceite pelo Cliente",
        message: `O cliente "${customerProfile?.name || 'Cliente Portal'}" aceitou a proposta da Cotação (${q.quotationNumber}) no valor de ${Number(q.total || 0).toLocaleString('pt-MZ')} MT. Por favor, proceda com a faturação no painel principal do ERP.`,
        type: 'success',
        read: false,
        createdAt: serverTimestamp()
      });

      // Push real-time live alert notification
      try {
        const { sendLiveNotification } = await import('../lib/notificationService');
        await sendLiveNotification(
          activeBusinessId,
          "Cotação Aceite pelo Cliente",
          `O cliente "${customerProfile?.name || 'Cliente Portal'}" aceitou a proposta da Cotação (${q.quotationNumber}).`,
          'success'
        );
      } catch (eNotif) {
        console.warn("Failed to dispatch live notification:", eNotif);
      }

      toast.dismiss();
      toast.success("Cotação aceite com sucesso! O vendedor foi notificado para proceder com a faturação.");
    } catch (err: any) {
      toast.dismiss();
      console.error("Failed to approve quotation by client:", err);
      toast.error("Erro ao aceitar cotação: " + err.message);
    }
  };

  const handleCancelQuotation = async (q: any) => {
    if (!activeBusinessId) return;
    if (!window.confirm("Deseja realmente cancelar este pedido de cotação?")) return;
    try {
      toast.loading("A cancelar pedido...");
      await updateDoc(doc(db, `businesses/${activeBusinessId}/quotations`, q.id), {
        status: 'client_cancelled'
      });

      try {
        const { syncReservedStock } = await import('../lib/stockReservation');
        await syncReservedStock(activeBusinessId);
      } catch (eRes) {
        console.warn("Could not sync reserved stock inside client cancel:", eRes);
      }

      // Notify business owner in-app
      const notificationRef = collection(db, `businesses/${activeBusinessId}/notifications`);
      await addDoc(notificationRef, {
        title: "Pedido de Cotação Cancelado",
        message: `O cliente "${customerProfile?.name || 'Cliente Portal'}" cancelou o pedido de cotação autorreclamado (${q.quotationNumber}).`,
        type: 'info',
        read: false,
        createdAt: serverTimestamp()
      });

      toast.dismiss();
      toast.success("Pedido de cotação cancelado.");
    } catch (err: any) {
      toast.dismiss();
      console.error("Failed to cancel quotation by client:", err);
      toast.error("Erro ao cancelar pedido: " + err.message);
    }
  };

  const handleOpenDeclineModal = (q: any) => {
    setDecliningQuotation(q);
    setClientDeclineReason('');
    setIsClientDeclineModalOpen(true);
  };

  const handleClientDeclineQuotation = async () => {
    if (!activeBusinessId || !decliningQuotation) return;
    if (!clientDeclineReason.trim()) {
      toast.error("Por favor, indique o motivo da recusa.");
      return;
    }
    try {
      toast.loading("A enviar recusa...");
      await updateDoc(doc(db, `businesses/${activeBusinessId}/quotations`, decliningQuotation.id), {
        status: 'client_rejected',
        clientFeedback: clientDeclineReason
      });

      try {
        const { syncReservedStock } = await import('../lib/stockReservation');
        await syncReservedStock(activeBusinessId);
      } catch (eRes) {
        console.warn("Could not sync reserved stock inside client decline:", eRes);
      }

      // Notify business owner in-app
      const notificationRef = collection(db, `businesses/${activeBusinessId}/notifications`);
      await addDoc(notificationRef, {
        title: "Cotação Recusada pelo Cliente",
        message: `O cliente "${customerProfile?.name || 'Cliente Portal'}" recusou a proposta da Cotação (${decliningQuotation.quotationNumber}). Motivo indicado: "${clientDeclineReason}"`,
        type: 'warning',
        read: false,
        createdAt: serverTimestamp()
      });

      // Push real-time live alert notification
      try {
        const { sendLiveNotification } = await import('../lib/notificationService');
        await sendLiveNotification(
          activeBusinessId,
          "Cotação Recusada pelo Cliente",
          `O cliente "${customerProfile?.name || 'Cliente Portal'}" recusou a proposta da Cotação (${decliningQuotation.quotationNumber}).`,
          'warning'
        );
      } catch (eNotif) {
        console.warn("Failed to dispatch live notification:", eNotif);
      }

      toast.dismiss();
      toast.success("Cotação recusada. Feedback enviado ao vendedor.");
      setIsClientDeclineModalOpen(false);
      setDecliningQuotation(null);
    } catch (err: any) {
      toast.dismiss();
      console.error("Failed to decline quotation by client:", err);
      toast.error("Erro ao recusar cotação: " + err.message);
    }
  };

  // Auth operations
  const handleEmailPasswordAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error("Por favor, preencha todos os campos.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (isSigningUp) {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
        toast.success("Conta criada e sessão iniciada com sucesso!");
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        toast.success("Bem-vindo ao Portal do Cliente!");
      }
    } catch (err: any) {
      console.error('[Portal Auth] Error:', err);
      let errorMsg = err.message || "Ocorreu um erro ao autenticar.";
      if (err.code === 'auth/wrong-password') errorMsg = "Palavra-passe incorreta.";
      if (err.code === 'auth/user-not-found') errorMsg = "Nenhum utilizador encontrado com este e-mail.";
      if (err.code === 'auth/email-already-in-use') errorMsg = "Este endereço de e-mail já está em uso.";
      if (err.code === 'auth/invalid-credential') errorMsg = "Credenciais inválidas fornecidas.";
      toast.error(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsSubmitting(true);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      toast.success("Sessão iniciada via Google!");
    } catch (err: any) {
      console.error('[Portal Google Auth] Error:', err);
      toast.error("Erro na autenticação com Google: " + (err.message || err.code));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!email.trim()) {
      toast.error("Insira o seu e-mail para receber o link de redefinição.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      toast.success("E-mail de redefinição enviado com sucesso!");
      setShowResets(false);
    } catch (err: any) {
      toast.error("Erro: " + (err.message || err.code));
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      // Clear storage
      localStorage.removeItem('customer_portal_bid');
      localStorage.removeItem('customer_portal_cid');
      setActiveBusinessId(null);
      setActiveCustomerId(null);
      setBusinessData(null);
      setCustomerProfile(null);
      setAllAssociatedPortals([]);
      toast.success("Sessão terminada.");
    } catch (err: any) {
      toast.error("Falha ao terminar sessão.");
    }
  };

  // PDF Download Handler
  const handleDownloadPDF = (invoice: any) => {
    const pLoading = toast.loading("A gerar o PDF da Fatura...");
    try {
      const hasTax = invoice.taxInclusive !== undefined;
      const invoiceData = {
        ...invoice,
        customerName: customerProfile?.name || invoice.customerName || 'Cliente',
        customerPhone: customerProfile?.phone || invoice.customerPhone || '',
        customerEmail: customerProfile?.email || invoice.customerEmail || '',
        deliveryAddress: customerProfile?.address || invoice.deliveryAddress || ''
      };

      const companyInfo = {
        name: businessData?.name || 'SABUSH SYSTEM ERP',
        address: businessData?.address || '',
        phone: businessData?.phone || '',
        email: businessData?.email || '',
        nuit: businessData?.taxId || ''
      };

      generateInvoicePDF(invoiceData, companyInfo, { save: true });
      toast.dismiss(pLoading);
      toast.success("Fatura PDF descarregada com sucesso!");
    } catch (err: any) {
      toast.dismiss(pLoading);
      console.error("PDF generation failure:", err);
      toast.error("Incapaz de gerar PDF: " + err.message);
    }
  };

  // Lang selection
  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    toast.success("Language switched: " + lng.toUpperCase());
  };

  // Outstanding Debt
  const currencySymbol = businessData?.currency || 'MZN';
  const outstandingDebt = customerProfile?.outstandingBalance || 0;
  const clientSpent = customerProfile?.totalSpent || 0;

  // Language selectors
  const langKey = i18n.language || 'pt';

  return (
    <div className="min-h-screen w-full bg-[#0B1F4D] bg-gradient-to-br from-[#0B1F4D] via-[#D4AF37]/15 to-[#0B1F4D] text-slate-100 flex flex-col font-sans relative overflow-x-hidden antialiased">
      {/* Background visual accents */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-orange-600/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-amber-600/5 rounded-full blur-2xl pointer-events-none"></div>

      {/* Header Bar */}
      <header id="portal-header" className="w-full max-w-7xl mx-auto px-4 py-4 flex items-center justify-between border-b border-slate-800/80 shrink-0 relative z-10 sm:px-6">
        <div className="flex items-center gap-3">
          <img 
            src="/sabush-logo.svg" 
            alt="Sabush Logo" 
            style={{ height: '44px', width: 'auto', objectFit: 'contain', filter: 'drop-shadow(0px 2px 8px rgba(0,0,0,0.4))' }}
            referrerPolicy="no-referrer"
          />
          <div>
            <h1 className="text-base font-extrabold tracking-tight flex items-center gap-1.5 text-slate-100">
              <span>Sabush System</span>
              <span className="text-blue-500">ERP</span>
            </h1>
            <span className="text-[9px] text-slate-400 font-bold tracking-wide uppercase leading-none block">Portal do Cliente</span>
          </div>
        </div>

        {/* Language & LoggedIn state indicators */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex bg-slate-900/80 rounded-lg p-0.5 border border-slate-800 text-[10px] font-bold select-none">
            <button 
              id="lang-btn-pt"
              onClick={() => changeLanguage('pt')} 
              className={`px-2 py-1 rounded-md transition-all cursor-pointer ${langKey === 'pt' ? 'bg-blue-600/20 text-blue-400' : 'text-slate-400 hover:text-slate-200'}`}
            >
              PT
            </button>
            <button 
              id="lang-btn-en"
              onClick={() => changeLanguage('en')} 
              className={`px-2 py-1 rounded-md transition-all cursor-pointer ${langKey === 'en' ? 'bg-blue-600/20 text-blue-400' : 'text-slate-400 hover:text-slate-200'}`}
            >
              EN
            </button>
          </div>

          {currentUser && (
            <button
              id="logout-btn"
              onClick={handleLogout}
              className="px-3 py-1.5 bg-slate-900/60 border border-slate-800 hover:bg-red-600/10 hover:border-red-600/40 text-slate-400 hover:text-red-400 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-6 flex flex-col items-center justify-center relative z-10 sm:px-6 sm:py-8">
        
        {loadingAuth ? (
          <div className="flex flex-col items-center gap-3 py-12" id="portal-loading">
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
            <p className="text-slate-400 text-sm font-medium animate-pulse">Carregando permissões do portal...</p>
          </div>
        ) : !currentUser ? (
          /* ================= LOGIN FORM SCREEN ================= */
          <motion.div 
            initial={{ opacity: 0, y: 15 }} 
            animate={{ opacity: 1, y: 0 }} 
            className="w-full max-w-md bg-slate-950/80 border border-slate-800/85 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden backdrop-blur-md"
            id="login-card-container"
          >
            {/* Visual shine */}
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600"></div>

            <div className="text-center mb-8">
              <h2 className="text-2xl font-black text-white tracking-tight">
                {isSigningUp ? 'Criar Acesso ao Portal' : 'Aceder ao Portal do Cliente'}
              </h2>
              <p className="text-slate-400 text-xs mt-1.5 leading-relaxed">
                {isSigningUp 
                  ? 'Inscreva-se com o e-mail registado pelo comerciante para gerir e consultar as suas faturas.'
                  : 'Consulte os seus saldos, faturas e acompanhe os seus pagamentos online.'}
              </p>
            </div>

            {showResets ? (
              /* Forgot password flow */
              <div className="space-y-4" id="forgot-password-panel">
                <div>
                  <label className="block text-[11px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">Endereço de E-mail</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input 
                      type="email" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="vendedor@exemplo.com"
                      className="w-full pl-11 pr-4 py-3 bg-slate-900 border border-slate-800/80 rounded-xl text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-600 transition-all font-medium"
                    />
                  </div>
                </div>
                <button
                  id="reset-password-btn"
                  onClick={handlePasswordReset}
                  className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl text-xs transition-all tracking-wide uppercase shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                >
                  Enviar Link de Recuperação
                </button>
                <div className="text-center">
                  <button 
                    id="back-to-login-btn"
                    onClick={() => setShowResets(false)} 
                    className="text-xs text-slate-500 hover:text-slate-400 transition-all cursor-pointer"
                  >
                    Voltar ao login comum
                  </button>
                </div>
              </div>
            ) : (
              /* Normal sign-in / sign-up flow */
              <form onSubmit={handleEmailPasswordAuth} className="space-y-4" id="auth-form">
                <div>
                  <label className="block text-[11px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">Endereço de E-mail</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input 
                      type="email" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="exemplo@e-mail.com"
                      required
                      className="w-full pl-11 pr-4 py-3 bg-slate-900 border border-slate-800/80 rounded-xl text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-600 transition-all font-medium"
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 italic mt-1 block">Use o e-mail que forneceu à empresa ao faturar.</span>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[11px] font-extrabold text-slate-400 uppercase tracking-widest">Palavra-passe</label>
                    {!isSigningUp && (
                      <button 
                        id="toggle-reset-btn"
                        type="button" 
                        onClick={() => setShowResets(true)} 
                        className="text-[10px] text-blue-400 hover:text-blue-300 transition-all cursor-pointer"
                      >
                        Esqueceu?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input 
                      type="password" 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      className="w-full pl-11 pr-4 py-3 bg-slate-900 border border-slate-800/80 rounded-xl text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-600 transition-all font-medium"
                    />
                  </div>
                </div>

                <button
                  id="submit-auth-btn"
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition-all tracking-wide uppercase shadow-lg shadow-blue-950/40 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                  ) : (
                    <span>{isSigningUp ? 'Registar e Aceder' : 'Entrar no Portal'}</span>
                  )}
                </button>

                {/* Google Sign-in proxy */}
                <div className="relative my-6 flex items-center justify-center">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-800/60"></div>
                  </div>
                  <span className="relative px-3 text-[10px] text-slate-500 font-extrabold uppercase bg-slate-950 tracking-wider">Ou aceder com</span>
                </div>

                <button
                  id="google-signin-btn"
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isSubmitting}
                  className="w-full py-3 px-4 bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 hover:text-white font-black text-xs rounded-xl flex items-center justify-center gap-2.5 transition-all cursor-pointer"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#EA4335" d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.131-5.122 4.131-3.411 0-6.182-2.77-6.182-6.18 0-3.412 2.771-6.182 6.182-6.182 1.488 0 2.851.528 3.921 1.401l3.07-3.07C19.16 2.012 15.938 1 12.24 1 6.032 1 .998 6.033.998 12.24s5.034 11.24 11.242 11.24c6.48 0 10.785-4.552 10.785-11.24 0-.765-.07-1.334-.19-1.956H12.24z"/>
                  </svg>
                  <span>Google de forma rápida</span>
                </button>

                <div className="text-center pt-3">
                  <span className="text-slate-500 text-xs">
                    {isSigningUp ? 'Já tem um acesso?' : 'Ainda não tem acesso?'}
                  </span>
                  <button
                    id="toggle-auth-mode-btn"
                    type="button"
                    onClick={() => setIsSigningUp(!isSigningUp)}
                    className="ml-1 text-xs text-blue-400 font-bold hover:text-blue-300 transition-all cursor-pointer hover:underline"
                  >
                    {isSigningUp ? 'Entrar' : 'Crie um acesso gratuito'}
                  </button>
                </div>

                {/* Terms and Privacy disclaimer */}
                <p className="text-center text-[10px] text-slate-500 font-semibold leading-relaxed mt-4 border-t border-slate-900/60 pt-4">
                  Ao usar o portal, aceita expressamente os nossos{" "}
                  <button 
                    type="button" 
                    onClick={() => { setTermsModalTab('terms'); setIsTermsOpen(true); }}
                    className="text-blue-400 font-bold hover:underline cursor-pointer bg-transparent"
                  >
                    Termos de Serviço
                  </button>{" "}
                  e{" "}
                  <button 
                    type="button" 
                    onClick={() => { setTermsModalTab('privacy'); setIsTermsOpen(true); }}
                    className="text-blue-400 font-bold hover:underline cursor-pointer bg-transparent"
                  >
                    Política de Privacidade
                  </button>.
                </p>
              </form>
            )}
          </motion.div>
        ) : loadingPortalData ? (
          /* ================= DISCOVERING PORTAL STATE ================= */
          <div className="flex flex-col items-center gap-3 py-12" id="portal-searching-profiles">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            <p className="text-slate-400 text-sm">Carregando faturas e associações comerciais...</p>
          </div>
        ) : !customerProfile && allAssociatedPortals.length > 0 ? (
          /* ================= MULTIPLE ASSOCIATED PORTALS DETECTED ================= */
          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }} 
            animate={{ opacity: 1, scale: 1 }} 
            className="w-full max-w-xl bg-slate-950/80 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-md"
            id="multi-portal-selector animate-in"
          >
            <div className="text-center mb-6">
              <Building className="w-10 h-10 text-blue-500 mx-auto mb-2" />
              <h2 className="text-lg font-extrabold text-white">Selecione o seu Portal Cliente</h2>
              <p className="text-slate-400 text-xs mt-1">O seu e-mail ({currentUser.email}) encontra-se associado a múltiplas empresas no Sabush System ERP. Escolha a empresa que pretende consultar:</p>
            </div>

            <div className="space-y-3" id="portals-link-list">
              {allAssociatedPortals.map((p, idx) => (
                <div 
                  key={`${p.businessId}-${idx}`}
                  id={`portal-item-${idx}`}
                  onClick={() => {
                    setActiveBusinessId(p.businessId);
                    setActiveCustomerId(p.customerId);
                    setCustomerProfile({ id: p.customerId, ...p.customerData });
                  }}
                  className="p-4 bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-blue-600/30 rounded-2xl cursor-pointer transition-all flex items-center justify-between"
                >
                  <div>
                    <h3 className="text-sm font-black text-slate-100">{p.businessName}</h3>
                    <p className="text-[11px] text-slate-400">Cliente registado como: <span className="text-slate-300 font-bold">{p.customerName}</span></p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 block uppercase font-bold">Saldo em dívida</span>
                    <span className="text-xs font-bold text-rose-400">{formatCurrencyValue(p.outstandingBalance, currencySymbol)}</span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        ) : !customerProfile ? (
          /* ================= NO PROFILE ASSOCIATED WITH EMAIL ================= */
          <motion.div 
            initial={{ opacity: 0, scale: 0.96 }} 
            animate={{ opacity: 1, scale: 1 }} 
            className="w-full max-w-md bg-slate-950/60 border border-red-900/40 rounded-3xl p-6 text-center space-y-4 backdrop-blur-md"
            id="not-found-card"
          >
            <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
            <div>
              <h3 className="text-lg font-black text-white">Permissão ou Acesso não Encontrado</h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Logado como <span className="text-slate-200 font-bold select-all">{currentUser.email}</span>.<br />
                Este endereço de e-mail não coincide com nenhum perfil de cliente nas nossas base de dados.
              </p>
              <div className="bg-slate-900/70 p-3.5 rounded-xl border border-slate-800 mt-4 text-left space-y-2 text-[11px] text-slate-400">
                <span className="font-bold text-amber-500 flex items-center gap-1">💡 Como resolver isso?</span>
                <p>1. Confirme se é o mesmo e-mail que a sua empresa registou na Fatura.</p>
                <p>2. Entre em contacto com a empresa e peça para atualizarem o seu e-mail no seu registo de cliente do Sabush System ERP.</p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                id="retry-search-btn"
                onClick={() => searchPortalsForEmail(currentUser.email?.toLowerCase().trim())}
                className="flex-1 py-2.5 bg-slate-950 hover:bg-slate-900 text-slate-200 border border-slate-800 font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                Tentar Novamente
              </button>
              <button
                id="exit-account-btn"
                onClick={handleLogout}
                className="flex-1 py-2.5 bg-rose-950 hover:bg-rose-900 text-rose-200 border border-rose-900 font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                Inicar com Outro E-mail
              </button>
            </div>
          </motion.div>
        ) : (
          /* ================= CLIENT PORTAL VERIFIED DASHBOARD ================= */
          <div className="w-full flex flex-col gap-6" id="client-dashboard-view">
            
            {/* Top Info Banner */}
            <div className="w-full bg-slate-950/60 border border-slate-800 rounded-3xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 backdrop-blur-md">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="inline-flex px-2 py-0.5 bg-emerald-600/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-extrabold uppercase rounded-lg tracking-wide">
                    Sessão Segura
                  </span>
                  <span className="text-slate-300 font-medium text-xs">Empresa parceira:</span>
                  <span className="text-blue-400 font-extrabold text-sm">{businessData?.name || 'SABUSH SYSTEM ERP'}</span>
                </div>
                <h2 className="text-xl font-black text-slate-100 tracking-tight leading-none sm:text-2xl pt-1">
                  Olá, {customerProfile.name}!
                </h2>
                <p className="text-slate-400 text-xs">
                  Acompanhe a sua conta corrente, histórico de compras e faça download direto das suas faturas em PDF.
                </p>
              </div>

              {/* Business mini card */}
              {businessData && (
                <div className="bg-slate-900/60 p-3.5 border border-slate-800/80 rounded-2xl flex flex-col gap-1.5 min-w-[200px] text-xs">
                  <span className="text-[10px] text-slate-500 uppercase tracking-widest font-extrabold">Informação sobre a Empresa</span>
                  <p className="font-extrabold text-slate-200">{businessData.name}</p>
                  {businessData.phone && (
                    <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
                      <Phone className="w-3 h-3 text-slate-500 shrink-0" />
                      <span>{businessData.phone}</span>
                    </p>
                  )}
                  {businessData.email && (
                    <p className="text-[11px] text-slate-400 flex items-center gap-1.5 truncate">
                      <Mail className="w-3 h-3 text-slate-500 shrink-0" />
                      <span>{businessData.email}</span>
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Scorecard KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" id="scorecard-kpis">
              {/* Current Debt Card */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between min-h-[110px] shadow-lg">
                <div className="flex justify-between items-start text-xs text-slate-400">
                  <span className="font-black uppercase tracking-wide text-[10px] text-amber-400">Dívida / Valor Aberto</span>
                  <DollarSign className="w-4 h-4 text-amber-500 shrink-0" />
                </div>
                <div className="mt-2.5">
                  <h3 className="text-lg font-black text-white shrink-0 sm:text-2xl tracking-tight leading-none">
                    {formatCurrencyValue(outstandingDebt, currencySymbol)}
                  </h3>
                  <span className="text-[10px] text-slate-400 mt-1.5 block">Valor pendente na sua conta corrente</span>
                </div>
                {outstandingDebt > 0 && (
                  <div className="absolute right-0 bottom-0 top-0 w-1 bg-amber-500"></div>
                )}
              </div>

              {/* Total Purchased Volume */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between min-h-[110px] shadow-lg">
                <div className="flex justify-between items-start text-xs text-slate-400">
                  <span className="font-black uppercase tracking-wide text-[10px] text-emerald-400">Total Faturado</span>
                  <TrendingUp className="w-4 h-4 text-emerald-500 shrink-0" />
                </div>
                <div className="mt-2.5">
                  <h3 className="text-lg font-black text-white shrink-0 sm:text-2xl tracking-tight leading-none">
                    {formatCurrencyValue(clientSpent || invoices.reduce((sum, item) => sum + (item.total || 0), 0), currencySymbol)}
                  </h3>
                  <span className="text-[10px] text-slate-400 mt-1.5 block">Histórico acumulado de aquisição</span>
                </div>
                <div className="absolute right-0 bottom-0 top-0 w-1 bg-emerald-500"></div>
              </div>

              {/* Pending Faturas */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between min-h-[110px] shadow-lg">
                <div className="flex justify-between items-start text-xs text-slate-400">
                  <span className="font-black uppercase tracking-wide text-[10px] text-rose-400">Faturas Pendentes</span>
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                </div>
                <div className="mt-2.5">
                  <h3 className="text-xl font-black text-white px-1 shrink-0 sm:text-2xl tracking-tight leading-none">
                    {invoices.filter(item => item.status && item.status !== 'paid' && item.status !== 'cancelled').length}
                  </h3>
                  <span className="text-[10px] text-slate-400 mt-1.5 block">Nº de faturas em cobrança ativa</span>
                </div>
                <div className="absolute right-0 bottom-0 top-0 w-1 bg-rose-500"></div>
              </div>

              {/* Paid Invoices count */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 relative overflow-hidden flex flex-col justify-between min-h-[110px] shadow-lg">
                <div className="flex justify-between items-start text-xs text-slate-400">
                  <span className="font-black uppercase tracking-wide text-[10px] text-blue-400">Faturas Liquidadas</span>
                  <CheckCircle className="w-4 h-4 text-blue-500 shrink-0" />
                </div>
                <div className="mt-2.5">
                  <h3 className="text-xl font-black text-white px-1 shrink-0 sm:text-2xl tracking-tight leading-none">
                    {invoices.filter(item => item.status === 'paid').length}
                  </h3>
                  <span className="text-[10px] text-slate-400 mt-1.5 block">Documentos pagos e fechados</span>
                </div>
                <div className="absolute right-0 bottom-0 top-0 w-1 bg-blue-500"></div>
              </div>
            </div>

            {/* Custom Tab Selection Navigation Row */}
            <div className="w-full flex border-b border-slate-800 overflow-x-auto select-none" id="dashboard-tab-bar">
              <button
                id="tab-btn-overview"
                onClick={() => setCurrentTab('overview')}
                className={`px-5 py-3 text-xs font-extrabold whitespace-nowrap transition-all border-b-2 cursor-pointer ${currentTab === 'overview' ? 'border-blue-600 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
              >
                Início / Visão Geral
              </button>
              <button
                id="tab-btn-invoices"
                onClick={() => setCurrentTab('invoices')}
                className={`px-5 py-3 text-xs font-extrabold whitespace-nowrap transition-all border-b-2 cursor-pointer ${currentTab === 'invoices' ? 'border-blue-600 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
              >
                Minhas Faturas ({invoices.length})
              </button>
              <button
                id="tab-btn-quotations"
                onClick={() => setCurrentTab('quotations')}
                className={`px-5 py-3 text-xs font-extrabold whitespace-nowrap transition-all border-b-2 cursor-pointer ${currentTab === 'quotations' ? 'border-amber-500 text-amber-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
              >
                📝 Solicitar Fatura ({customerQuotations.length})
              </button>
              <button
                id="tab-btn-purchases"
                onClick={() => setCurrentTab('purchases')}
                className={`px-5 py-3 text-xs font-extrabold whitespace-nowrap transition-all border-b-2 cursor-pointer ${currentTab === 'purchases' ? 'border-blue-600 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
              >
                Histórico de Compras / Linhas
              </button>
              <button
                id="tab-btn-business"
                onClick={() => setCurrentTab('business')}
                className={`px-5 py-3 text-xs font-extrabold whitespace-nowrap transition-all border-b-2 cursor-pointer ${currentTab === 'business' ? 'border-blue-600 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
              >
                Contacto Comercial
              </button>
            </div>

            {/* TAB SCREENS ROUTING CONTROL */}
            <div id="tab-content-render-shell" className="w-full min-h-[300px]">
              
              {/* 1. OVERVIEW SCREEN */}
              {currentTab === 'overview' && (
                <div id="overview-tab-view" className="space-y-6">
                  {/* Pending invoices focus alert */}
                  {invoices.some(item => item.status !== 'paid' && item.status !== 'cancelled') && (
                    <div className="bg-amber-600/10 border border-amber-500/20 p-4 rounded-2xl flex items-center gap-3.5 text-xs text-amber-200">
                      <AlertCircle className="w-6 h-6 text-amber-500 shrink-0" />
                      <div className="flex-1">
                        <p className="font-extrabold">Faturas pendentes em cobrança</p>
                        <p className="text-slate-400 text-[11px] mt-0.5">Dispõe de faturas ativas aguardando regularização financeira. Por favor envie o comprovante de pagamento ao comerciante para compensar os valores.</p>
                      </div>
                      <button 
                        id="view-pending-invoice-nav-btn"
                        onClick={() => setCurrentTab('invoices')}
                        className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold rounded-lg transition-all"
                      >
                        Ver Faturas
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Latest 3 faturas listing */}
                    <div className="lg:col-span-2 bg-slate-950/40 p-5 rounded-2xl border border-slate-800/80 space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black uppercase text-slate-300 tracking-wider">Últimas Faturas Recorrentes</span>
                        <button 
                          id="nav-to-all-invoices-btn"
                          onClick={() => setCurrentTab('invoices')} 
                          className="text-xs text-blue-400 hover:text-blue-300 transition-all font-bold cursor-pointer"
                        >
                          Ver todas faturas
                        </button>
                      </div>

                      {loadingLedger ? (
                        <div className="flex justify-center py-6">
                          <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                        </div>
                      ) : invoices.length === 0 ? (
                        <p className="text-xs text-slate-500 italic py-6">Siga faturando! Nenhuma fatura encontrada.</p>
                      ) : (
                        <div className="space-y-3" id="latest-invoices-container">
                          {invoices.slice(0, 3).map((invoice) => {
                            const isPaid = invoice.status === 'paid';
                            return (
                              <div 
                                key={invoice.id} 
                                id={`overview-inv-${invoice.id}`}
                                className="p-3.5 bg-slate-900/40 hover:bg-slate-900 border border-slate-800/85 rounded-xl flex items-center justify-between flex-wrap gap-3 transition-all"
                              >
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-extrabold text-slate-200 uppercase tracking-tight">{invoice.invoiceNumber}</span>
                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${isPaid ? 'bg-emerald-950 text-emerald-400 border border-emerald-900' : 'bg-rose-950 text-rose-400 border border-rose-900'}`}>
                                      {isPaid ? 'Pago' : 'Pendente'}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-slate-400">{new Date(invoice.date || invoice.createdAt?.seconds * 1000).toLocaleDateString()}</p>
                                </div>

                                <div className="flex items-center gap-4">
                                  <div className="text-right">
                                    <span className="text-[10px] text-slate-500 block uppercase font-bold">Total Fatura</span>
                                    <span className="text-xs font-extrabold text-slate-200">{formatCurrencyValue(invoice.total, currencySymbol)}</span>
                                  </div>

                                  <button
                                    id={`pdf-btn-overview-${invoice.id}`}
                                    onClick={() => handleDownloadPDF(invoice)}
                                    className="p-2 bg-slate-800/80 hover:bg-blue-600 hover:text-white border border-slate-800 rounded-lg transition-all text-slate-300 cursor-pointer"
                                    title="Descarregar PDF"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                  </button>
                                  {invoice.status !== 'paid' && (
                                    <button
                                      onClick={() => handleOpenReportPayment(invoice)}
                                      className="p-2 bg-emerald-950 hover:bg-emerald-650 border border-emerald-800 hover:border-emerald-500 hover:text-white rounded-lg transition-all text-emerald-400 cursor-pointer inline-flex items-center gap-1.5 font-black"
                                      title="Pagar / Submeter Comprovativo"
                                    >
                                      <DollarSign className="w-3.5 h-3.5" />
                                      <span className="text-[10px] uppercase tracking-wider">Pagar</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Quick Payments Ledger status */}
                    <div className="bg-slate-950/40 p-5 rounded-2xl border border-slate-800/80 space-y-4">
                      <span className="text-xs font-black uppercase text-slate-300 tracking-wider block">Histórico de Compensações</span>
                      
                      {payments.length === 0 ? (
                        <div className="py-6 text-center space-y-2">
                          <History className="w-8 h-8 text-slate-600 mx-auto" />
                          <p className="text-xs text-slate-500 italic">Sem pagamentos registados na conta corrente.</p>
                        </div>
                      ) : (
                        <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1" id="payments-history-col">
                          {payments.slice(0, 5).map((pay) => (
                            <div 
                              key={pay.id} 
                              id={`overview-pay-${pay.id}`}
                              className="p-3 bg-slate-900/60 border border-slate-850 rounded-xl flex items-center justify-between text-xs"
                            >
                              <div className="space-y-0.5">
                                <span className="font-extrabold text-emerald-400">-{formatCurrencyValue(pay.amount, currencySymbol)}</span>
                                <p className="text-[10px] text-slate-500">Compensações / Recibo</p>
                              </div>
                              <span className="text-[10px] text-slate-400">{new Date(pay.date || pay.createdAt?.seconds * 1000).toLocaleDateString()}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 2. MINHAS FATURAS SCREEN */}
              {currentTab === 'invoices' && (
                <div id="invoices-tab-view" className="bg-slate-950/40 p-5 rounded-3xl border border-slate-800/80 space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h3 className="text-sm font-black text-white uppercase tracking-wider">Histórico de Faturas Disponibilizadas</h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">Filtre e controle as suas faturas. Clique em descarregar para obter o PDF original estruturado.</p>
                    </div>
                  </div>

                  {loadingLedger ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                    </div>
                  ) : invoices.length === 0 ? (
                    <div className="text-center py-12 border border-dashed border-slate-800 rounded-2xl">
                      <FileText className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                      <p className="text-xs text-slate-500 italic">Nenhum registo de faturamento ativo.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto w-full" id="invoices-table-shell">
                      <table className="w-full border-collapse text-left text-xs min-w-[600px]">
                        <thead>
                          <tr className="border-b border-slate-800 text-[#2563EB] font-bold select-none text-[10px] uppercase">
                            <th className="py-3 px-4">Recibo / Fatura Nº</th>
                            <th className="py-3 px-4">Data Emissão</th>
                            <th className="py-3 px-4">Vencimento</th>
                            <th className="py-3 px-4 text-center">Estado</th>
                            <th className="py-3 px-4 text-right">Subtotal</th>
                            <th className="py-3 px-4 text-right">Total Faturado</th>
                            <th className="py-3 px-4 text-right">Saldo em Aberto</th>
                            <th className="py-3 px-4 text-right">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-850">
                          {invoices.map((inv) => {
                            const isPaid = inv.status === 'paid';
                            const docBal = inv.totalDue !== undefined ? inv.totalDue - (inv.amountPaid || 0) : (inv.outstandingBalance || 0);
                            const isExpanded = expandedInvoiceId === inv.id;

                            // Filter payments for this specific invoice
                            const invoicePayments = payments.filter((p: any) => {
                              if (p.invoiceId === inv.id) return true;
                              if (p.allocations && Array.isArray(p.allocations)) {
                                return p.allocations.some((alloc: any) => alloc.invoiceId === inv.id);
                              }
                              return false;
                            });

                            return (
                              <React.Fragment key={inv.id}>
                                <tr id={`row-inv-${inv.id}`} className="hover:bg-slate-900/40 transition-all border-b border-slate-900">
                                  <td className="py-3.5 px-4 font-black text-slate-200">
                                    <button 
                                      onClick={() => setExpandedInvoiceId(isExpanded ? null : inv.id)}
                                      className="hover:text-blue-400 font-black flex items-center gap-1 cursor-pointer focus:outline-none"
                                    >
                                      {isExpanded ? <ChevronUp className="w-4 h-4 text-blue-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                                      <span>{inv.invoiceNumber}</span>
                                    </button>
                                  </td>
                                  <td className="py-3.5 px-4 text-slate-400">{inv.date ? new Date(inv.date).toLocaleDateString() : 'N/A'}</td>
                                  <td className="py-3.5 px-4 text-slate-400">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : 'Imediato'}</td>
                                  <td className="py-3.5 px-4 text-center">
                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide leading-none ${isPaid ? 'bg-emerald-950 text-emerald-400 border border-emerald-900' : 'bg-rose-950 text-rose-400 border border-rose-900'}`}>
                                      {isPaid ? 'Pago' : 'Pendente'}
                                    </span>
                                  </td>
                                  <td className="py-3.5 px-4 text-right text-slate-300">{formatCurrencyValue(inv.subtotal || inv.total, currencySymbol)}</td>
                                  <td className="py-3.5 px-4 text-right font-black text-slate-100">{formatCurrencyValue(inv.total, currencySymbol)}</td>
                                  <td className="py-3.5 px-4 text-right text-rose-400 font-bold">{formatCurrencyValue(inv.outstandingBalance || 0, currencySymbol)}</td>
                                  <td className="py-3.5 px-4 text-right flex justify-end gap-1.5">
                                    <button
                                      onClick={() => setExpandedInvoiceId(isExpanded ? null : inv.id)}
                                      className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-850 rounded-lg transition-all text-slate-400 hover:text-white cursor-pointer"
                                      title="Visualizar Itens e Amortizações"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      id={`pdf-btn-table-${inv.id}`}
                                      onClick={() => handleDownloadPDF(inv)}
                                      className="p-1.5 bg-slate-900 hover:bg-blue-600 hover:text-white border border-slate-800 rounded-lg transition-all text-slate-300 cursor-pointer inline-flex items-center gap-1.5 font-bold text-[10px]"
                                    >
                                      <Download className="w-3 h-3" />
                                      <span>PDF</span>
                                    </button>
                                    {!isPaid && (
                                      <button
                                        onClick={() => handleOpenReportPayment(inv)}
                                        className="p-1.5 bg-emerald-950 hover:bg-emerald-600 border border-emerald-800 hover:border-emerald-500 hover:text-white rounded-lg transition-all text-emerald-400 cursor-pointer inline-flex items-center gap-1.5 font-bold text-[10px]"
                                      >
                                        <DollarSign className="w-3 h-3" />
                                        <span>Enviar Comprovativo</span>
                                      </button>
                                    )}
                                  </td>
                                </tr>

                                {isExpanded && (
                                  <tr className="bg-slate-950/60">
                                    <td colSpan={8} className="p-5">
                                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs text-left">
                                        
                                        {/* Left Side: Invoice Items */}
                                        <div className="space-y-3">
                                          <h4 className="font-extrabold text-[#2563EB] uppercase text-[10px] tracking-wider flex items-center gap-2">
                                            <span>📦 Artigos Discriminados</span>
                                          </h4>
                                          <div className="border border-slate-850 rounded-xl overflow-hidden bg-slate-900/30">
                                            <table className="w-full text-left border-collapse text-[11px]">
                                              <thead>
                                                <tr className="bg-slate-900/80 text-slate-400 text-[10px] uppercase font-bold border-b border-slate-800">
                                                  <th className="p-2.5">Descrição</th>
                                                  <th className="p-2.5 text-center">Qtd</th>
                                                  <th className="p-2.5 text-right">Unitário</th>
                                                  <th className="p-2.5 text-right">Total</th>
                                                </tr>
                                              </thead>
                                              <tbody className="divide-y divide-slate-850 font-medium text-slate-300">
                                                {(inv.items || []).map((item: any, i: number) => {
                                                  const price = Number(item.price || item.onlinePrice || 0);
                                                  const qty = Number(item.quantity || 1);
                                                  return (
                                                    <tr key={i} className="hover:bg-slate-900/25">
                                                      <td className="p-2.5 font-bold text-slate-100">{item.name || item.description || 'Artigo'}</td>
                                                      <td className="p-2.5 text-center font-mono text-slate-400 font-bold">{qty}</td>
                                                      <td className="p-2.5 text-right font-mono">{formatCurrencyValue(price, currencySymbol)}</td>
                                                      <td className="p-2.5 text-right font-mono font-bold text-slate-200">
                                                        {formatCurrencyValue(price * qty, currencySymbol)}
                                                      </td>
                                                    </tr>
                                                  );
                                                })}
                                              </tbody>
                                            </table>
                                          </div>
                                        </div>

                                        {/* Right Side: Amortization History */}
                                        <div className="space-y-3">
                                          <h4 className="font-extrabold text-emerald-400 uppercase text-[10px] tracking-wider flex items-center gap-2">
                                            <span>💰 Histórico de Amortizações</span>
                                          </h4>
                                          
                                          {invoicePayments.length === 0 ? (
                                            <div className="bg-slate-900/30 p-6 rounded-xl border border-slate-850 text-center text-slate-500 italic">
                                              Nenhuma amortização efetuada ainda para esta fatura.
                                            </div>
                                          ) : (
                                            <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                                              {invoicePayments.map((pay: any, idx: number) => {
                                                const payDate = pay.date ? new Date(pay.date).toLocaleDateString() : 'N/A';
                                                return (
                                                  <div key={pay.id || idx} className="bg-slate-900/40 p-3 rounded-xl border border-slate-850 space-y-2">
                                                    <div className="flex justify-between items-center text-[10px]">
                                                      <span className="font-extrabold text-slate-300 font-mono">
                                                        #{pay.id ? pay.id.slice(-6).toUpperCase() : `PAG-${idx}`}
                                                      </span>
                                                      <span className="font-bold text-slate-500 font-mono">
                                                        {payDate}
                                                      </span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                      <div>
                                                        <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/15 px-1.5 py-0.5 rounded font-bold uppercase">
                                                          {pay.method === 'cash' ? 'Dinheiro' : pay.method === 'card' ? 'Cartão' : pay.method === 'mobile_money' ? 'M-Pesa/Emola' : pay.method === 'bank_transfer' ? 'Transf. Bancária' : (pay.method || '').toUpperCase()}
                                                        </span>
                                                        {pay.reference && (
                                                          <p className="text-[10px] text-slate-400 truncate max-w-[150px] mt-1" title={pay.reference}>
                                                            Ref: {pay.reference}
                                                          </p>
                                                        )}
                                                      </div>
                                                      <div className="flex flex-col items-end gap-1">
                                                        <span className="font-mono font-black text-emerald-400">
                                                          {formatCurrencyValue(pay.amount, currencySymbol)}
                                                        </span>
                                                        <button
                                                          type="button"
                                                          onClick={() => {
                                                            const companyInfo = {
                                                              name: businessData?.name || 'SABUSH SYSTEM ERP',
                                                              address: businessData?.address || '',
                                                              phone: businessData?.phone || '',
                                                              email: businessData?.email || '',
                                                              nuit: businessData?.taxId || ''
                                                            };
                                                            generatePaymentReceiptPDF(
                                                              pay,
                                                              customerProfile?.name || 'Cliente',
                                                              (inv.outstandingBalance || 0),
                                                              companyInfo
                                                            );
                                                          }}
                                                          className="text-[9px] font-black text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1 uppercase cursor-pointer"
                                                        >
                                                          <Download className="w-2.5 h-2.5" />
                                                          <span>Recibo Oficial</span>
                                                        </button>
                                                      </div>
                                                    </div>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          )}
                                        </div>

                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* 3. HISTORICO DE COMPRAS (ITEMS BREAKDOWN) STATE */}
              {currentTab === 'purchases' && (
                <div id="purchases-tab-view" className="bg-slate-950/40 p-5 rounded-3xl border border-slate-800/80 space-y-4">
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider">Histórico Detalhado de Artigos Adquiridos</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">Visão analítica de todos os produtos comprados e faturados nas suas transações.</p>
                  </div>

                  {invoices.length === 0 ? (
                    <p className="text-xs text-slate-500 italic py-6">Sem artigos registados para consulta.</p>
                  ) : (
                    <div className="overflow-x-auto w-full" id="purchases-table-shell">
                      <table className="w-full border-collapse text-left text-xs min-w-[500px]">
                        <thead>
                          <tr className="border-b border-slate-800 text-[#2563EB] font-bold select-none text-[10px] uppercase">
                            <th className="py-3 px-4">Artigo / Descrição</th>
                            <th className="py-3 px-4 text-center">Quantidade</th>
                            <th className="py-3 px-4 text-right">Preço Unitário</th>
                            <th className="py-3 px-4 text-right">Valor Total</th>
                            <th className="py-3 px-4 text-center">Do Doc/Fatura Nº</th>
                            <th className="py-3 px-4 text-center">Data Distribuição</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-850">
                          {invoices.flatMap(inv => 
                            (inv.items || []).map((item: any, itemIdx: number) => (
                              <tr key={`${inv.id}-${itemIdx}`} id={`purchase-item-${inv.id}-${itemIdx}`} className="hover:bg-slate-900/30 transition-all">
                                <td className="py-3.5 px-4 font-extrabold text-slate-200">{item.name || item.description || 'Produto ERP'}</td>
                                <td className="py-3.5 px-4 text-center text-slate-300 font-bold">x{item.quantity || 1}</td>
                                <td className="py-3.5 px-4 text-right text-slate-400">{formatCurrencyValue(item.price || item.finalUnitPrice || 0, currencySymbol)}</td>
                                <td className="py-3.5 px-4 text-right font-black text-slate-100">
                                  {formatCurrencyValue((item.price || item.finalUnitPrice || 0) * (item.quantity || 1), currencySymbol)}
                                </td>
                                <td className="py-3.5 px-4 text-center text-[#2563EB] font-black">{inv.invoiceNumber}</td>
                                <td className="py-3.5 px-4 text-center text-slate-400">{inv.date ? new Date(inv.date).toLocaleDateString() : 'N/A'}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* 3. SOLICITAR FATURAÇÃO / AUTORECLAMAÇÃO SCREEN */}
              {currentTab === 'quotations' && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                  id="quotations-portal-view"
                >
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* LEFT PANEL: PRODUCT DIRECTORY */}
                    <div className="lg:col-span-7 bg-slate-950/40 p-5 rounded-3xl border border-slate-800/80 space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider">Diretório de Artigos Disponíveis</h3>
                          <p className="text-[11px] text-slate-400">Adicione os produtos desejados ao seu carrinho para requisitar orçamentos ou faturar.</p>
                        </div>
                      </div>

                      {/* Search Input */}
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                          <Search className="w-4 h-4" />
                        </span>
                        <input
                          type="text"
                          placeholder="Procurar produtos..."
                          value={productSearch}
                          onChange={(e) => setProductSearch(e.target.value)}
                          className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-semibold text-slate-200 outline-none focus:border-blue-500"
                        />
                      </div>

                      {loadingProducts ? (
                        <div className="flex justify-center py-8">
                          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[360px] overflow-y-auto pr-1">
                          {productsList
                            .filter(p => !productSearch || p.name?.toLowerCase().includes(productSearch.toLowerCase()))
                            .map((p) => {
                              const inCart = cart.find(ci => ci.productId === p.id);
                              const isOutOfStock = p.stockLevel <= 0;
                              return (
                                <div key={p.id} className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl flex flex-col justify-between gap-3 text-xs">
                                  <div>
                                    <div className="flex justify-between items-start gap-2">
                                      <span className="font-extrabold text-slate-200 line-clamp-2">{p.name}</span>
                                      {p.category && (
                                        <span className="px-1.5 py-0.5 bg-slate-800 text-slate-400 text-[8px] font-black uppercase rounded">
                                          {p.category}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-blue-400 font-extrabold text-sm mt-1">{Number(p.price || 0).toLocaleString('pt-MZ')} MT</p>
                                    <p className={`text-[9px] font-bold mt-1 ${isOutOfStock ? 'text-rose-400' : 'text-slate-400'}`}>
                                      Stock actual: {isOutOfStock ? 'Esgotado' : `${p.stockLevel} unidades`}
                                    </p>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (isOutOfStock) {
                                        toast.error("Este produto encontra-se sem stock.");
                                        return;
                                      }
                                      setCart(prev => {
                                        const exists = prev.find(item => item.productId === p.id);
                                        if (exists) {
                                          return prev.map(item => item.productId === p.id ? { ...item, quantity: item.quantity + 1 } : item);
                                        }
                                        return [...prev, { productId: p.id, name: p.name, quantity: 1, price: Number(p.price || 0) }];
                                      });
                                      toast.success(`"${p.name}" adicionado ao carrinho!`);
                                    }}
                                    disabled={isOutOfStock}
                                    className={`w-full py-2 text-center rounded-lg font-black text-[10px] uppercase tracking-wider cursor-pointer border transition-all ${
                                      isOutOfStock 
                                        ? 'bg-rose-950/20 text-rose-400/40 border-rose-950/40 cursor-not-allowed'
                                        : inCart
                                            ? 'bg-emerald-950 text-emerald-400 border-emerald-900/50 hover:bg-emerald-900'
                                            : 'bg-blue-600 hover:bg-blue-500 text-white border-transparent'
                                    }`}
                                  >
                                    {isOutOfStock ? 'Esgotado' : inCart ? 'Adicionar Mais (+1)' : 'Adicionar ao Carrinho'}
                                  </button>
                                </div>
                              );
                            })}
                        </div>
                      )}
                    </div>

                    {/* RIGHT PANEL: CART AND BILLING PARAMETERS */}
                    <div className="lg:col-span-5 bg-slate-950/40 p-5 rounded-3xl border border-slate-800/80 space-y-4 flex flex-col justify-between">
                      <div className="space-y-4">
                        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                          <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider">O Meu Pedido</h3>
                          <span className="px-2.5 py-0.5 bg-blue-600/10 border border-blue-500/20 text-blue-400 text-[10px] font-black rounded-full font-sans">
                            {cart.length === 1 ? '1 artigo' : `${cart.length} artigos`}
                          </span>
                        </div>

                        {cart.length === 0 ? (
                          <div className="py-12 text-center space-y-2 text-slate-500">
                            <ShoppingCart className="w-8 h-8 text-slate-700 mx-auto" />
                            <p className="text-xs italic">Carrinho vazio.</p>
                            <p className="text-[10px] text-slate-600 max-w-[200px] mx-auto">Selecione artigos no directório ao lado para começar o pedido.</p>
                          </div>
                        ) : (
                          <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                            {cart.map((item, idx) => (
                              <div key={item.productId} className="p-3 bg-slate-900/40 border border-slate-850 rounded-xl flex justify-between items-center text-xs">
                                <div className="space-y-0.5 pr-2">
                                  <p className="font-bold text-slate-200 line-clamp-1">{item.name}</p>
                                  <p className="text-[10px] text-slate-400">
                                    {item.price.toLocaleString('pt-MZ')} MT × {item.quantity}
                                  </p>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                  <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg p-0.5">
                                    <button
                                      type="button"
                                      onClick={() => setCart(prev => prev.map(c => c.productId === item.productId ? { ...c, quantity: Math.max(1, c.quantity - 1) } : c))}
                                      className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-white"
                                    >
                                      -
                                    </button>
                                    <span className="text-[10px] font-black text-slate-200 min-w-[14px] text-center">{item.quantity}</span>
                                    <button
                                      type="button"
                                      onClick={() => setCart(prev => prev.map(c => c.productId === item.productId ? { ...c, quantity: c.quantity + 1 } : c))}
                                      className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-white"
                                    >
                                      +
                                    </button>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setCart(prev => prev.filter(c => c.productId !== item.productId))}
                                    className="text-rose-500 hover:text-rose-400 font-extrabold uppercase text-[10px]"
                                  >
                                    Remover
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {cart.length > 0 && (
                          <div className="space-y-3 pt-3 border-t border-slate-800">
                            {/* Option selections */}
                            <div className="space-y-1">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Condição Pretendida</label>
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  onClick={() => setSelectedPaymentMethod('cash')}
                                  className={`py-2 px-3 text-center text-[10px] font-black uppercase rounded-lg border transition-all ${selectedPaymentMethod === 'cash' ? 'bg-blue-600 border-blue-600 text-white shadow-sm' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-305'}`}
                                >
                                  Pago a Dinheiro / M-Pesa
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setSelectedPaymentMethod('credit')}
                                  className={`py-2 px-3 text-center text-[10px] font-black uppercase rounded-lg border transition-all ${selectedPaymentMethod === 'credit' ? 'bg-amber-600 border-amber-600 text-white shadow-sm' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-305'}`}
                                >
                                  Pedido a Crédito (Fiado)
                                </button>
                              </div>
                            </div>

                            {/* Address specification */}
                            <div className="space-y-1">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Morada para Entrega</label>
                              <input
                                type="text"
                                placeholder="Indique a sua morada de entrega..."
                                value={deliveryAddress}
                                onChange={(e) => setDeliveryAddress(e.target.value)}
                                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl text-xs font-semibold text-slate-200 outline-none"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {cart.length > 0 && (
                        <div className="space-y-3 pt-4 border-t border-slate-800 mt-4">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-400 font-semibold">Subtotal Previsto:</span>
                            <span className="font-black text-slate-200">
                              {cart.reduce((acc, item) => acc + (item.price * item.quantity), 0).toLocaleString('pt-MZ')} MT
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-400 font-semibold">IVA Incorporado (17%):</span>
                            <span className="font-extrabold text-slate-400">
                              {(cart.reduce((acc, item) => acc + (item.price * item.quantity), 0) * 0.17).toLocaleString('pt-MZ')} MT
                            </span>
                          </div>
                          <div className="flex justify-between items-center border-t border-dashed border-slate-800 pt-2 text-sm font-black text-slate-100">
                            <span>Total Estimado:</span>
                            <span className="text-base text-blue-400">
                              {(cart.reduce((acc, item) => acc + (item.price * item.quantity), 0) * 1.17).toLocaleString('pt-MZ')} MT
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={handleSubmitSelfQuotation}
                            disabled={isSubmitting}
                            className="w-full py-3 bg-[#2563EB] hover:bg-blue-600 disabled:bg-slate-800 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer text-center"
                          >
                            {isSubmitting ? 'A enviar pedido...' : 'Submeter Pedido de Faturação'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* BOTTOM TRACKER: EXISTING PORTAL QUOTATIONS STATUS VIEW */}
                  <div className="bg-slate-950/40 p-5 rounded-3xl border border-slate-800/80 space-y-4">
                    <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider">Histórico de Pedidos Autorreclamados</h3>
                    
                    {customerQuotations.length === 0 ? (
                      <p className="text-xs text-slate-500 italic py-4">Não possui nenhum pedido de faturação registado.</p>
                    ) : (
                      <div className="overflow-x-auto w-full id-history-quotes">
                        <table className="w-full text-left text-xs border-collapse min-w-[700px]">
                          <thead>
                            <tr className="border-b border-slate-800/80 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                              <th className="py-3 px-4">ID do Pedido</th>
                              <th className="py-3 px-4">Artigos Solicitados</th>
                              <th className="py-3 px-4 text-right">Total Solicitado</th>
                              <th className="py-3 px-4">Condição</th>
                              <th className="py-3 px-4 text-center">Estado ERP</th>
                              <th className="py-3 px-4 text-center">Ações</th>
                              <th className="py-3 px-4">Data de Envio</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-900/60 font-sans">
                            {customerQuotations.map((q) => {
                              const isApproved = q.status === 'accepted';
                              const isClientAccepted = q.status === 'client_accepted';
                              const isCancelled = q.status === 'rejected';
                              const isClientRejected = q.status === 'client_rejected';
                              const isClientCancelled = q.status === 'client_cancelled';
                              const isPendingClient = q.status === 'pending_client_approval';
                              
                              return (
                                <tr key={q.id} className="hover:bg-slate-900/20 transition-all text-slate-300">
                                  <td className="py-3.5 px-4 font-extrabold text-blue-400">{q.quotationNumber}</td>
                                  <td className="py-3.5 px-4 font-semibold text-slate-400">
                                    {q.items?.map((item: any) => `${item.name} (${item.quantity}x)`).join(', ') || 'Nenhum artigo'}
                                  </td>
                                  <td className="py-3.5 px-4 text-right font-black text-slate-100">{Number(q.total || 0).toLocaleString('pt-MZ')} MT</td>
                                  <td className="py-3.5 px-4 uppercase font-bold text-[10px] text-slate-400">{q.paymentMethod === 'credit' ? 'A Crédito / Fiado' : 'Dinheiro'}</td>
                                  <td className="py-3.5 px-4 text-center">
                                    <span className={`inline-flex px-2.5 py-1 text-[9px] font-black uppercase rounded-full ${
                                      isApproved 
                                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-900/40'
                                        : isClientAccepted
                                          ? 'bg-teal-950 text-teal-400 border border-teal-900/40 animate-pulse'
                                          : isCancelled
                                            ? 'bg-rose-950 text-rose-400 border border-rose-900/40'
                                            : isClientRejected
                                              ? 'bg-rose-900/30 text-rose-400 border border-rose-900/30'
                                              : isClientCancelled
                                                ? 'bg-slate-900 text-slate-400 border border-slate-800'
                                                : isPendingClient
                                                  ? 'bg-blue-950 text-blue-400 border border-blue-900/40'
                                                  : 'bg-amber-950 text-amber-400 border border-amber-900/40'
                                    }`}>
                                      {isApproved ? 'Faturado' : 
                                       isClientAccepted ? 'Aprovado por Si' :
                                       isCancelled ? 'Rejeitado pelo ERP' :
                                       isClientRejected ? 'Recusado por Si' :
                                       isClientCancelled ? 'Cancelado por Si' :
                                       isPendingClient ? 'Preços Revistos' :
                                       'Pendente Revisão'}
                                    </span>
                                  </td>
                                  <td className="py-3.5 px-4 text-center">
                                    {isPendingClient ? (
                                      <div className="flex justify-center items-center gap-1.5">
                                        <button
                                          onClick={() => handleClientApproveQuotation(q)}
                                          className="px-2.5 py-1 text-[10px] font-black bg-emerald-600 hover:bg-emerald-550 text-white rounded-lg transition-all cursor-pointer flex items-center gap-1 shadow-sm"
                                          title="Aceitar preços propostos"
                                        >
                                          <Check size={10} /> Aceitar
                                        </button>
                                        <button
                                          onClick={() => handleOpenDeclineModal(q)}
                                          className="px-2.5 py-1 text-[10px] font-black bg-rose-600 hover:bg-rose-550 text-white rounded-lg transition-all cursor-pointer flex items-center gap-1 shadow-sm"
                                          title="Recusar proposta"
                                        >
                                          <X size={10} /> Recusar
                                        </button>
                                      </div>
                                    ) : q.status === 'pending_seller_approval' ? (
                                      <button
                                        onClick={() => handleCancelQuotation(q)}
                                        className="px-2 py-1 text-[9px] font-black bg-slate-800 hover:bg-slate-700 text-slate-350 rounded-md transition-all cursor-pointer flex items-center gap-1 mx-auto"
                                        title="Cancelar pedido de cotação"
                                      >
                                        <X size={10} /> Cancelar
                                      </button>
                                    ) : isClientRejected ? (
                                      <div className="text-center text-[10px] text-rose-400/80 font-bold max-w-[130px] mx-auto italic truncate" title={q.clientFeedback}>
                                        Feedback: "{q.clientFeedback}"
                                      </div>
                                    ) : (
                                      <span className="text-slate-600 text-[10px]">-</span>
                                    )}
                                  </td>
                                  <td className="py-3.5 px-4 text-slate-400 font-semibold">{q.date ? new Date(q.date).toLocaleDateString() : 'N/A'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* 4. SOBRE A EMPRESA CONTACT INFO SCREEN */}
              {currentTab === 'business' && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  className="grid grid-cols-1 md:grid-cols-2 gap-6"
                  id="business-tab-view"
                >
                  <div className="bg-slate-950/40 p-5 rounded-3xl border border-slate-800/80 space-y-4">
                    <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider">Compromisso do Sabush ERP</h3>
                    <p className="text-slate-400 text-xs leading-relaxed">
                      Este portal é disponibilizado pela empresa <span className="text-slate-200 font-black">{businessData?.name || 'SABUSH SYSTEM ERP'}</span> através de canais de automatização para garantir transparência na prestação de contas, permitindo que monitorize os seus pagamentos online sem burocracias.
                    </p>

                    <div className="p-4 bg-slate-900/40 border border-slate-800 rounded-2xl text-[11px] text-slate-400 space-y-2">
                      <span className="font-bold text-[#2563EB] uppercase tracking-wider block text-[10px]">Políticas do Portal</span>
                      <p>• O portal funciona estritamente em formato <span className="text-slate-200 font-bold">Apenas Leitura (Read-Only)</span>.</p>
                      <p>• O cliente não pode alterar saldos ou retificar faturas emitidas.</p>
                      <p>• Para qualquer dúvida sobre valores em aberto, entre em contacto direto através dos canais autorizados ao lado.</p>
                    </div>
                  </div>

                  <div className="bg-slate-950/40 p-5 rounded-3xl border border-slate-800/80 space-y-4 flex flex-col justify-between">
                    <div>
                      <h3 className="text-sm font-black text-slate-100 uppercase tracking-wider mb-4">Canais de Atendimento Direto</h3>
                      
                      <div className="space-y-3">
                        {businessData?.address && (
                          <div className="flex items-center gap-3 text-xs text-slate-300">
                            <MapPin className="w-4 h-4 text-[#2563EB]" />
                            <div>
                              <span className="text-[10px] text-slate-500 block uppercase font-bold">Endereço Físico</span>
                              <span>{businessData.address}</span>
                            </div>
                          </div>
                        )}

                        {businessData?.phone && (
                          <div className="flex items-center gap-3 text-xs text-slate-300">
                            <Phone className="w-4 h-4 text-emerald-500" />
                            <div>
                              <span className="text-[10px] text-slate-500 block uppercase font-bold">Contacto Telefónico / WhatsApp</span>
                              <span>{businessData.phone}</span>
                            </div>
                          </div>
                        )}

                        {businessData?.email && (
                          <div className="flex items-center gap-3 text-xs text-slate-300">
                            <Mail className="w-4 h-4 text-[1B73E8]" />
                            <div>
                              <span className="text-[10px] text-slate-500 block uppercase font-bold">E-mail de Suporte</span>
                              <span className="select-all">{businessData.email}</span>
                            </div>
                          </div>
                        )}

                        {businessData?.taxId && (
                          <div className="flex items-center gap-3 text-xs text-slate-300">
                            <Building className="w-4 h-4 text-slate-400" />
                            <div>
                              <span className="text-[10px] text-slate-500 block uppercase font-bold">NUIT / Registo Fiscal</span>
                              <span className="font-mono">{businessData.taxId}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <a 
                      id="contact-whatsapp-direct-btn"
                      href={businessData?.phone ? `https://api.whatsapp.com/send?phone=${businessData.phone.replace(/\D/g, '')}` : '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-xl text-center flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      <Phone className="w-4 h-4" />
                      <span>Iniciar Atendimento Especializado</span>
                    </a>
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer copyright */}
      <footer id="portal-footer" className="w-full text-center py-6 border-t border-slate-900/80 text-[10px] text-slate-500 relative z-10 select-none shrink-0">
        <p>© {new Date().getFullYear()} Sabush System ERP Customer Portal. Todos os direitos reservados.</p>
        <p className="mt-1">Desenvolvido em parceria tecnológica para Pequenas e Médias Empresas Africanas.</p>
        <p className="mt-2 space-x-3">
          <button 
            type="button" 
            onClick={() => { setTermsModalTab('terms'); setIsTermsOpen(true); }}
            className="text-blue-500 hover:underline cursor-pointer font-bold"
          >
            Termos de Serviço
          </button>
          <span>•</span>
          <button 
            type="button" 
            onClick={() => { setTermsModalTab('privacy'); setIsTermsOpen(true); }}
            className="text-blue-500 hover:underline cursor-pointer font-bold"
          >
            Política de Privacidade
          </button>
        </p>
      </footer>
      <TermsModal isOpen={isTermsOpen} onClose={() => setIsTermsOpen(false)} defaultTab={termsModalTab} />

      {/* Modern interactive customer payment report and receipt confirmation portal module */}
      {showReportPaymentModal && selectedInvoice && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-[32px] max-w-lg w-full p-6 sm:p-8 shadow-2xl flex flex-col space-y-6 relative animate-in fade-in zoom-in-95 duration-200 my-8">
            <button 
              onClick={() => setShowReportPaymentModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-2 hover:bg-slate-800 rounded-xl transition-all"
            >
              <X size={20} />
            </button>

            {!whatsappHref ? (
              <form onSubmit={handleSubmitReport} className="space-y-5">
                <div>
                  <h3 className="text-lg font-black text-white flex items-center gap-2">
                    <span className="text-xl">💰</span> Enviar Comprovativo de Pagamento
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Insira os dados do pagamento efetuado para a Fatura <b className="text-blue-400">#{selectedInvoice.invoiceNumber}</b>.
                  </p>
                </div>

                {/* Seller's Payment Instructions Highlight Block */}
                <div className="p-4 bg-slate-950/60 rounded-2xl border border-slate-800/80 space-y-1.5">
                  <span className="text-[10px] uppercase font-black tracking-widest text-blue-400 block">Coordenadas de Pagamento / Bank & Mobile Money</span>
                  {businessData?.paymentInstructions ? (
                    <p className="text-xs text-slate-200 font-medium whitespace-pre-line leading-relaxed">
                      {businessData.paymentInstructions}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-400 italic">
                      Nenhuma coordenada de transferência definida de momento. Por favor, solicite ao vendedor pelo WhatsApp.
                    </p>
                  )}
                </div>

                {/* Submittal Fields */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Valor Pago (MT)</label>
                    <input 
                      type="number"
                      required
                      className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 font-extrabold outline-none focus:border-blue-500"
                      value={reportAmount}
                      onChange={e => setReportAmount(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Método Utilizado</label>
                    <select 
                      className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 font-black outline-none focus:border-blue-500 bg-white dark:bg-slate-950"
                      value={reportMethod}
                      onChange={e => setReportMethod(e.target.value)}
                    >
                      <option value="mpesa">M-Pesa</option>
                      <option value="emola">e-Mola</option>
                      <option value="conta_movel">Conta Móvel</option>
                      <option value="bank_transfer">Transferência Bancária</option>
                      <option value="outro">Outro Sistema</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Código de Referência da Transação</label>
                  <input
                    type="text"
                    placeholder="Ex: Ref do M-Pesa ou número de talão"
                    className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 font-bold outline-none focus:border-blue-500"
                    value={reportReference}
                    onChange={e => setReportReference(e.target.value)}
                  />
                </div>

                {/* Screenshot Upload with base64 compression parser */}
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Fotografia ou Print do Comprovativo (Obrigatório)</label>
                  {!screenshotPreview ? (
                    <label className="border-2 border-dashed border-slate-800 hover:border-blue-500/50 bg-slate-950/40 hover:bg-slate-950/80 rounded-2xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all">
                      <Upload className="w-6 h-6 text-slate-500 hover:text-blue-400" />
                      <span className="text-xs font-black text-slate-400">Selecionar Imagem</span>
                      <span className="text-[10px] text-slate-600">JPG, PNG ou GIF até 8MB</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={handleFileChange} 
                      />
                    </label>
                  ) : (
                    <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 p-2 flex flex-col gap-2">
                      <img 
                        src={screenshotPreview} 
                        alt="Comprovativo de Pagamento" 
                        className="max-h-[160px] object-contain rounded-xl w-full"
                        referrerPolicy="no-referrer"
                      />
                      <button 
                        type="button"
                        onClick={() => { setScreenshotFile(null); setScreenshotPreview(null); }}
                        className="w-full py-1.5 bg-rose-950 hover:bg-rose-900 border border-rose-900/50 text-rose-400 rounded-lg text-[10px] uppercase font-black transition-all"
                      >
                        Remover Imagem
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">Notas Complementares (Opcional)</label>
                  <textarea 
                    rows={2}
                    placeholder="Indique alguma informação adicional, ex: titular da conta bancária de origem"
                    className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-none focus:border-blue-500"
                    value={reportNotes}
                    onChange={e => setReportNotes(e.target.value)}
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button 
                    type="button"
                    onClick={() => setShowReportPaymentModal(false)}
                    className="py-3 px-5 border border-slate-800 hover:bg-slate-850 text-slate-300 text-xs font-bold rounded-xl transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    disabled={isSubmittingReport}
                    className="py-3 px-6 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-lg shadow-blue-500/10 cursor-pointer"
                  >
                    {isSubmittingReport ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>A processar...</span>
                      </>
                    ) : (
                      <span>Submeter Comprovativo</span>
                    )}
                  </button>
                </div>
              </form>
            ) : (
              <div className="text-center space-y-6 py-6 flex flex-col items-center animate-in fade-in duration-200">
                <div className="w-16 h-16 rounded-full bg-emerald-950 flex items-center justify-center text-emerald-400 border border-emerald-900 shadow-lg shadow-emerald-950/20">
                  <CheckCircle size={32} />
                </div>
                <div className="space-y-2">
                  <h4 className="text-lg font-black text-white">Comprovativo Enviado com Sucesso!</h4>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                    O comprovativo de pagamento foi guardado no sistema e o vendedor foi alertado em tempo real no painel administrativo.
                  </p>
                </div>

                <div className="p-4 bg-slate-950/60 rounded-2xl border border-slate-800 max-w-sm w-full text-left font-sans text-xs text-slate-300 space-y-1">
                  <div className="text-slate-500 text-[8px] uppercase font-black tracking-widest mb-1 font-sans">Conteúdo da Mensagem</div>
                  <p className="whitespace-pre-line leading-relaxed font-sans text-xs text-slate-300 font-medium">
                    {whatsappMessage}
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 w-full justify-center">
                  <a 
                    href={whatsappHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-6 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/10"
                  >
                    <MessageSquare size={16} />
                    <span>Avisar via WhatsApp</span>
                  </a>
                  <button 
                    onClick={() => {
                      setShowReportPaymentModal(false);
                      setWhatsappHref(null);
                    }}
                    className="px-6 py-3.5 bg-slate-800 hover:bg-slate-750 text-slate-300 font-black text-xs rounded-xl transition-all border border-slate-800"
                  >
                    Fechar Janela
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Interactive client quotation decline feedback modal */}
      {isClientDeclineModalOpen && decliningQuotation && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-[32px] max-w-md w-full p-6 sm:p-8 shadow-2xl flex flex-col space-y-6 relative animate-in fade-in zoom-in-95 duration-200">
            <button 
              onClick={() => setIsClientDeclineModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-2 hover:bg-slate-800 rounded-xl transition-all"
            >
              <X size={20} />
            </button>

            <div className="space-y-2">
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <span className="text-xl">❌</span> Recusar Proposta de Orçamento
              </h3>
              <p className="text-xs text-slate-400">
                Por favor, explique o motivo pelo qual está a rejeitar esta proposta <b className="text-blue-400">#{decliningQuotation.quotationNumber}</b>. O vendedor será notificado e poderá rever as condições para si.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 font-sans">Motivo da Recusa *</label>
                <textarea 
                  rows={4}
                  className="w-full p-4 bg-slate-950/60 border border-slate-800 rounded-[20px] text-xs font-semibold text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Ex: Preços unitários elevados, alteração de necessidades ou pretendo alterar as quantidades..."
                  value={clientDeclineReason}
                  onChange={e => setClientDeclineReason(e.target.value)}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => setIsClientDeclineModalOpen(false)}
                  className="flex-1 py-3.5 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer text-center"
                >
                  Voltar
                </button>
                <button 
                  onClick={handleClientDeclineQuotation}
                  className="flex-1 py-3.5 bg-rose-600 hover:bg-rose-550 text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer text-center shadow-lg shadow-rose-600/10"
                >
                  Confirmar Recusa
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
