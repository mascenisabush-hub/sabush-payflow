import React, { useState, useEffect, useRef } from 'react';
import { db, storage } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { doc, onSnapshot, updateDoc, collection, addDoc, serverTimestamp, query, where } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { sendEmailNotification } from '../lib/emailService';
import { 
  CreditCard, Smartphone, ShieldCheck, Clock, CheckCircle2, 
  AlertCircle, History, Zap, ArrowRight, Download, 
  Wallet, HelpCircle, Package, ReceiptText, Users, MessageSquare, MapPin, Sparkles, XCircle, Info, UploadCloud, FileText, Check, Eye
} from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

export default function Billing() {
  const { profile } = useAuth();
  const [business, setBusiness] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<'mpesa' | 'card' | 'bank' | null>(null);
  
  // Three visual plan tiers defined in the prompt
  // Básico: 500 MZN/month — 1 user, 100 products, basic reports, no WhatsApp
  // Pro: 1,200 MZN/month — 5 users, unlimited products, all reports, WhatsApp enabled
  // Enterprise: 2,500 MZN/month — unlimited users, multi-store, priority support, all features
  const [selectedPlanTier, setSelectedPlanTier] = useState<'basico' | 'pro' | 'enterprise'>('basico');

  // Modal & Flow states
  const [isInstructionModalOpen, setIsInstructionModalOpen] = useState(false);
  const [selectedInstructionMethod, setSelectedInstructionMethod] = useState<'mpesa' | 'emola' | 'bank_transfer'>('mpesa');

  // Proof Form fields
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [payerName, setPayerName] = useState('');
  const [transactionReference, setTransactionReference] = useState('');
  const [payerPaymentMethod, setPayerPaymentMethod] = useState<'mpesa' | 'emola' | 'bank_transfer'>('mpesa');
  const [valorPago, setValorPago] = useState<number>(500);
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Latest verified/pending/rejected proof record
  const [latestProof, setLatestProof] = useState<any | null>(null);
  const [isEnlargingScreenshot, setIsEnlargingScreenshot] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto update amount based on layout tier selection
  useEffect(() => {
    const prices = { basico: 500, pro: 1200, enterprise: 2500 };
    setValorPago(prices[selectedPlanTier]);
  }, [selectedPlanTier]);

  useEffect(() => {
    if (!profile?.businessId) return;

    const unsub = onSnapshot(doc(db, 'businesses', profile.businessId), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setBusiness(data);
        // Set selected tier based on current plan
        const currentPlan = data.subscription?.plan || data.subscriptionPlan || 'basico';
        setSelectedPlanTier(currentPlan as any);
      }
    }, (error) => {
      console.warn("Gracefully handled billing business onSnapshot error:", error);
    });

    const hUnsub = onSnapshot(query(collection(db, `businesses/${profile.businessId}/payments`), where('type', '==', 'subscription')), (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      setHistory(docs.sort((a, b) => {
        const dateA = a.createdAt?.seconds || 0;
        const dateB = b.createdAt?.seconds || 0;
        return dateB - dateA;
      }));
    }, (error) => {
      console.warn("Gracefully handled billing payments onSnapshot error:", error);
    });

    // Real-time proof status listener
    const q = query(
      collection(db, 'subscription_proofs', profile.businessId, 'proofs')
    );

    const unsubProofs = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      if (list.length > 0) {
        list.sort((a: any, b: any) => {
          const dateA = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
          const dateB = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
          return dateB - dateA;
        });
        setLatestProof(list[0]);
      } else {
        setLatestProof(null);
      }
    }, (error) => {
      console.warn("Silent latest proof status onSnapshot error:", error);
    });

    return () => { 
      unsub(); 
      hUnsub(); 
      unsubProofs();
    };
  }, [profile?.businessId]);

  const getTrialDaysRemaining = () => {
    if (!business?.trialEndsAt) return 0;
    const end = new Date(business.trialEndsAt);
    const now = new Date();
    const diff = end.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  const getPlanName = (p?: string) => {
    const term = (p || 'basico').toLowerCase();
    if (term === 'pro') return 'Professional';
    if (term === 'enterprise') return 'Enterprise Ultimate';
    return 'Básico Prime';
  };

  const plansSpecs = {
    basico: {
      name: 'Básico',
      price: 500,
      description: 'Ideal para pequenos retalhistas e negócios individuais.',
      features: [
        { label: '1 Utilizador Ativo', icon: Users, inclusive: true },
        { label: 'Até 100 Produtos no Inventário', icon: Package, inclusive: true },
        { label: 'Relatórios Financeiros Básicos', icon: ReceiptText, inclusive: true },
        { label: 'Sem Automação de WhatsApp (LOCKED)', icon: MessageSquare, inclusive: false },
        { label: 'Sem Suporte Prioritário (LOCKED)', icon: Sparkles, inclusive: false },
        { label: 'Sem Multi-lojas/Filiais (LOCKED)', icon: MapPin, inclusive: false }
      ],
      color: 'from-slate-50 to-slate-100',
      textColor: 'text-slate-900',
      badgeColor: 'bg-slate-200 text-slate-800 border-slate-300'
    },
    pro: {
      name: 'Pro',
      price: 1200,
      description: 'A força motriz para equipas e negócios em franca expansão.',
      features: [
        { label: 'Até 5 Utilizadores Registados', icon: Users, inclusive: true },
        { label: 'Inventário Ilimitado de Produtos', icon: Package, inclusive: true },
        { label: 'Todos os Relatórios Financeiros & Stock', icon: ReceiptText, inclusive: true },
        { label: 'Automações de WhatsApp Desbloqueadas', icon: MessageSquare, inclusive: true },
        { label: 'Suporte Standard Sabush', icon: Sparkles, inclusive: true },
        { label: 'Sem Multi-lojas/Filiais (LOCKED)', icon: MapPin, inclusive: false }
      ],
      color: 'from-slate-800 to-slate-950 text-white',
      textColor: 'text-slate-900',
      badgeColor: 'bg-[#D14D2A] text-white border-none'
    },
    enterprise: {
      name: 'Enterprise',
      price: 2500,
      description: 'Estrutura robusta para corporações e cadeias de lojas.',
      features: [
        { label: 'Utilizadores Ilimitados na Equipa', icon: Users, inclusive: true },
        { label: 'Inventário Ilimitado + Multi-Lojas', icon: Package, inclusive: true },
        { label: 'Relatórios Avançados por Filial', icon: ReceiptText, inclusive: true },
        { label: 'Gama Completa de Automações WhatsApp', icon: MessageSquare, inclusive: true },
        { label: 'Suporte Exclusivo 24/7 com Gestor Dedicado', icon: Sparkles, inclusive: true },
        { label: 'Gestão Inteligente de Lojas & Filiais', icon: MapPin, inclusive: true }
      ],
      color: 'from-amber-900/10 to-amber-950/20 text-amber-950 border border-amber-200',
      textColor: 'text-amber-950',
      badgeColor: 'bg-amber-100 text-amber-800 border-amber-300'
    }
  };

  // Helper to compress image
  const compressImage = async (file: File): Promise<File | Blob> => {
    if (!file.type.startsWith('image/')) return file;
    if (file.size <= 2 * 1024 * 1024) return file; // Skip if <= 2MB

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1920;
          const MAX_HEIGHT = 1080;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          canvas.toBlob((blob) => {
            if (blob) {
              resolve(new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now()
              }));
            } else {
              resolve(file);
            }
          }, 'image/jpeg', 0.7);
        };
      };
      reader.onerror = () => resolve(file);
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleScreenshotSelect(file);
    }
  };

  const handleScreenshotSelect = (file: File) => {
    const validTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      toast.error('Apenas arquivos JPG, PNG ou PDF são aceites.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('O arquivo excede o limite de tamanho de 5MB.');
      return;
    }

    setScreenshotFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setScreenshotPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
    toast.success('Arquivo selecionado com sucesso!');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleScreenshotSelect(file);
    }
  };

  const handleSubmitProof = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!screenshotFile) {
      toast.error('Por favor, carregue o comprovativo da transação (screenshot/foto/pdf).');
      return;
    }
    if (!payerName.trim()) {
      toast.error('Por favor, introduza o nome usado no pagamento.');
      return;
    }

    setIsProcessing(true);
    setUploadProgress(10); // Start progress bar indicator

    try {
      // 1. Process and compress image if needed
      setUploadProgress(20);
      const processedFile = await compressImage(screenshotFile);
      setUploadProgress(40);

      // 2. Upload file to Storage under subscription_proofs/{businessId}/{timestamp}_{filename}
      const filename = `${Date.now()}_${screenshotFile.name}`;
      const storageRef = ref(storage, `subscription_proofs/${profile.businessId}/${filename}`);
      
      const uploadTask = uploadBytesResumable(storageRef, processedFile);

      uploadTask.on('state_changed', 
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 60; // scale to 40% - 100% range
          setUploadProgress(Math.round(40 + progress));
        }, 
        (error) => {
          console.error(error);
          toast.error("Erro ao carregar o arquivo para o servidor de ficheiros.");
          setIsProcessing(false);
          setUploadProgress(null);
        }, 
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          setUploadProgress(100);

          const proofId = `proof_${Date.now()}`;
          const currentPlanPrice = plansSpecs[selectedPlanTier].price;

          const proofData = {
            id: proofId,
            businessId: profile.businessId,
            businessName: business?.name || 'Empresa Sem Nome',
            ownerEmail: profile?.email || 'proprietario@sabush.com',
            ownerPhone: profile?.phone || profile?.phoneNumber || business?.phone || 'Não fornecido',
            plan: selectedPlanTier,
            planType: selectedPlanTier, // both keys for safety
            amount: valorPago || currentPlanPrice,
            paymentMethod: payerPaymentMethod,
            method: payerPaymentMethod, // both keys for safety
            transactionReference: transactionReference.trim() || null,
            payerName: payerName.trim(),
            paymentDate: paymentDate,
            screenshotURL: downloadURL,
            screenshot: downloadURL, // both keys for safety
            status: 'pending',
            submittedAt: new Date().toISOString(),
            reviewedAt: null,
            reviewedBy: null,
            notes: null
          };

          // 3. Save to subcollection (as requested)
          // subscription_proofs/{businessId}/proofs/{proofId}
          const { doc, setDoc } = await import('firebase/firestore');
          await setDoc(doc(db, 'subscription_proofs', profile.businessId, 'proofs', proofId), proofData);

          // 4. Save to top-level collection for admin dashboard compat
          // subscription_proofs/{proofId}
          await setDoc(doc(db, 'subscription_proofs', proofId), proofData);

          // 5. Update business subscription status to pending_verification
          await updateDoc(doc(db, 'businesses', profile.businessId), {
            subscriptionStatus: 'pending_verification',
            pendingSubscriptionPlan: selectedPlanTier,
            updatedAt: serverTimestamp()
          });

          // 6. Send email notification to Super Admin
          const emailSubject = `NOVO PAGAMENTO - ${business?.name || 'Empresa'} - Plano ${selectedPlanTier.toUpperCase()} - ${valorPago} MZN`;
          const emailBody = `Novo comprovativo de pagamento recebido!

Empresa: ${business?.name || 'Empresa Sem Nome'}
Email: ${profile?.email || 'Não fornecido'}
Plano solicitado: ${selectedPlanTier.toUpperCase()}
Valor: ${valorPago} MZN
Método: ${payerPaymentMethod.toUpperCase()}
Referência: ${transactionReference.trim() || 'Nenhuma'}
Data do pagamento: ${paymentDate}

Ver comprovativo: ${downloadURL}

Aceda ao painel Super Admin para aprovar ou rejeitar:
https://sabush-system.web.app/super-admin`;

          await sendEmailNotification('mascenisabush@gmail.com', emailSubject, emailBody).catch(err => {
            console.warn("Silent failure sending admin email alert:", err);
          });

          // Show success toast
          toast.success('Comprovativo enviado! A sua subscrição será ativada em até 24 horas após verificação.');
          
          // Reset form fields and clean up
          setScreenshotFile(null);
          setScreenshotPreview(null);
          setPayerName('');
          setTransactionReference('');
          setUploadProgress(null);
          setIsInstructionModalOpen(false);
          setIsProcessing(false);
        }
      );
    } catch (error: any) {
      console.error(error);
      toast.error("Falha ao submeter comprovativo: " + error.message);
      setIsProcessing(false);
      setUploadProgress(null);
    }
  };

  const handleSubscribe = async () => {
    // Open instruction and upload modal
    setIsInstructionModalOpen(true);
  };

  if (!business) return null;

  const trialDays = getTrialDaysRemaining();
  const isActive = business.subscriptionStatus === 'active' || (business.subscriptionStatus === 'trial' && trialDays > 0);
  const currentActivePlan = business.subscription?.plan || business.subscriptionPlan || 'basico';

  return (
    <div className="p-4 md:p-8 space-y-10 max-w-7xl mx-auto font-sans" id="billing_system_module">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-[#FAF7F2] pb-8">
        <div>
          <span className="text-[10px] font-black uppercase text-emerald-600 tracking-widest bg-emerald-50 px-2.5 py-1 rounded-md">Assinatura Oficial</span>
          <h1 className="text-4xl font-black text-[#1D1510] tracking-tight mt-2 flex items-center gap-2">
            <span>Gestão & Facturação</span>
            <span className="w-2.5 h-2.5 rounded-full bg-[#D14D2A]" />
          </h1>
          <p className="text-slate-500 font-medium text-sm leading-relaxed mt-1">
            Escolha o plano ideal para a dimensão operativa do seu negócio e expanda conforme crescer.
          </p>
        </div>
        <div className={cn(
          "px-6 py-3 rounded-2xl flex items-center gap-3 border font-black text-xs uppercase tracking-widest shadow-sm transition-all animate-in fade-in duration-200",
          isActive ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-red-50 text-red-600 border-red-100"
        )}>
          {isActive ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {isActive ? 'Acesso Regular Ativo' : 'Acesso Restrito / Pendente'}
        </div>
      </div>

      {/* TRIAL REMAINING BANNER */}
      {business.subscriptionStatus === 'trial' && trialDays > 0 && (
        <div className="bg-amber-50 border border-amber-200/50 rounded-[28px] p-6 flex flex-col sm:flex-row items-center justify-between gap-4 animate-in slide-in-from-top-1">
          <div className="flex items-center gap-4 text-left">
            <div className="w-12 h-12 bg-amber-500 text-white rounded-2xl flex items-center justify-center shadow-md shrink-0">
              <Clock size={22} className="animate-pulse" />
            </div>
            <div>
              <p className="text-xs font-black text-amber-800 uppercase tracking-wider">Período de Experiência Ativo ({trialDays} {trialDays === 1 ? 'Dia Restante' : 'Dias Restantes'})</p>
              <p className="text-xs text-amber-700/90 font-bold mt-0.5">Está no período de teste gratuito de 14 dias sem restrições preliminares. Atualize hoje mesmo!</p>
            </div>
          </div>
          <button 
            onClick={() => {
              const el = document.getElementById('payment_form_renew');
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-md transition-all whitespace-nowrap active:scale-95 cursor-pointer"
          >
            Renovar Agora
          </button>
        </div>
      )}

      {/* BUSINESS OWNER DYNAMIC STATUS PAGE (PART 6) */}
      {(business.subscriptionStatus === 'pending_verification' || latestProof) && (
        <div className="bg-white rounded-[40px] p-6 md:p-8 border border-slate-100 shadow-sm space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                <span>Estado da Subscrição Sabush ERP</span>
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              </h2>
              <p className="text-xs text-slate-500 font-bold mt-0.5">Acompanhamento e envio de comprovativo manual para o mercado de Moçambique.</p>
            </div>
            <div className={cn(
              "px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border shrink-0 inline-flex items-center gap-2",
              latestProof?.status === 'approved' ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
              latestProof?.status === 'rejected' ? "bg-rose-50 text-rose-600 border-rose-100" :
              "bg-amber-50 text-amber-600 border-amber-100 animate-pulse"
            )}>
              <span className={cn("w-1.5 h-1.5 rounded-full",
                latestProof?.status === 'approved' ? "bg-emerald-500" :
                latestProof?.status === 'rejected' ? "bg-rose-500" :
                "bg-amber-500 animate-pulse"
              )} />
              {latestProof?.status === 'approved' ? 'Aprovado / Ativo' :
               latestProof?.status === 'rejected' ? 'Rejeitado / Recusado' :
               'Aguardando Verificação'}
            </div>
          </div>

          {/* Dynamic Details block */}
          {latestProof && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50/50 p-6 rounded-3xl border border-slate-100">
              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider">Histórico de Submissão Recente</h3>
                
                <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs font-semibold text-slate-700">
                  <div className="text-slate-400 font-bold uppercase tracking-wide text-[10px]">Plano:</div>
                  <div className="font-extrabold capitalize text-slate-900">{latestProof.plan}</div>

                  <div className="text-slate-400 font-bold uppercase tracking-wide text-[10px]">Valor Pago:</div>
                  <div className="font-extrabold text-[#D14D2A]">{latestProof.amount} MZN</div>

                  <div className="text-slate-400 font-bold uppercase tracking-wide text-[10px]">Método:</div>
                  <div className="font-extrabold capitalize text-slate-700">
                    {latestProof.paymentMethod === 'bank_transfer' ? 'Millennium BIM (Transferência)' :
                     latestProof.paymentMethod === 'emola' ? 'e-Mola' : 'M-Pesa'}
                  </div>

                  <div className="text-slate-400 font-bold uppercase tracking-wide text-[10px]">Titular do Envio:</div>
                  <div className="font-extrabold break-all text-slate-800">{latestProof.payerName}</div>

                  <div className="text-slate-400 font-bold uppercase tracking-wide text-[10px]">Ref. Transação:</div>
                  <div className="font-mono bg-white px-2 py-0.5 rounded border text-slate-800 break-all">{latestProof.transactionReference || 'Nenhuma'}</div>

                  <div className="text-slate-400 font-bold uppercase tracking-wide text-[10px]">Data Envio:</div>
                  <div className="font-medium text-slate-500">{new Date(latestProof.submittedAt).toLocaleString('pt-MZ')}</div>
                </div>
              </div>

              <div className="space-y-3 flex flex-col items-start justify-center">
                <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider">Documento Digitalizado</h3>
                
                {latestProof.screenshotURL ? (
                  <button
                    type="button"
                    onClick={() => setIsEnlargingScreenshot(latestProof.screenshotURL)}
                    className="w-full max-w-[240px] h-32 rounded-2xl overflow-hidden relative group border border-slate-200 hover:brightness-95 transition-all cursor-pointer shadow-sm flex items-center justify-center bg-slate-100 bg-cover bg-center"
                    style={{ backgroundImage: `url(${latestProof.screenshotURL})` }}
                  >
                    <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity gap-1 text-[10px] uppercase font-black tracking-widest">
                      <Eye size={16} /> Ampliar Comprovativo
                    </div>
                  </button>
                ) : (
                  <span className="text-xs text-slate-400 italic">Nenhum anexo encontrado</span>
                )}
              </div>
            </div>
          )}

          {/* Rejection Alert + Resubmit option */}
          {latestProof?.status === 'rejected' && (
            <div className="bg-rose-50 border border-slate-100 rounded-3xl p-6 space-y-4">
              <div className="flex items-start gap-3">
                <XCircle size={20} className="text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-black text-rose-800 uppercase tracking-wide">Comprovativo Recusado por Divergência</p>
                  <p className="text-xs text-rose-700/90 font-bold mt-1 bg-white p-3 rounded-xl border border-rose-100">
                    Motivo indicado pelo Gestor: <span className="text-rose-950 font-black">{latestProof.notes || 'Nenhum comentário adicional.'}</span>
                  </p>
                  <p className="text-xs text-rose-600/80 font-medium mt-1">
                    Por favor, faça uma nova transferência com as credenciais indicadas ou mude as informações e volte a carregar o ficheiro correto.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedPlanTier(latestProof.plan);
                  setIsInstructionModalOpen(true);
                }}
                className="px-6 py-2.5 bg-[#D14D2A] hover:bg-[#b03d1e] text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md active:scale-95 cursor-pointer flex items-center gap-2"
              >
                <UploadCloud size={14} /> Corrigir e Re-submeter
              </button>
            </div>
          )}

          {/* Pending Alert */}
          {latestProof?.status === 'pending' && (
            <div className="bg-amber-50 border border-amber-200/50 rounded-3xl p-6 flex items-start gap-3">
              <AlertCircle size={20} className="text-amber-600 shrink-0 mt-0.5 animate-pulse" />
              <div>
                <p className="text-sm font-black text-amber-800 uppercase tracking-wide animate-pulse">Pagamento em Verificação Manual</p>
                <p className="text-xs text-amber-700/90 font-bold mt-1">
                  O seu comprovativo de pagamento foi enviado com sucesso e encontra-se na fila de validação administrativa.
                </p>
                <p className="text-xs text-amber-600/80 font-medium mt-1">
                  A nossa equipa valida transações M-Pesa, e-Mola e BIM de forma contínua durante o horário laboral (segunda a sábado, 8h às 20h). Se o seu acesso expirar, ele será prontamente desbloqueado assim que finalizada a conferência bancária.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* THREE DISTINCT VISUAL PLAN CARDS */}
      <div className="space-y-6">
        <div className="text-left">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">1. Selecione o Plano de Subscrição</h2>
          <p className="text-xs font-bold text-slate-500 mt-0.5">O preço ajusta-se automaticamente no módulo de checkout seguro abaixo.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {(Object.keys(plansSpecs) as Array<'basico' | 'pro' | 'enterprise'>).map(tier => {
            const spec = plansSpecs[tier];
            const isCurrent = currentActivePlan === tier;
            const isSelected = selectedPlanTier === tier;

            return (
              <div 
                key={tier}
                onClick={() => setSelectedPlanTier(tier)}
                className={cn(
                  "rounded-[40px] p-8 flex flex-col justify-between transition-all duration-300 relative cursor-pointer select-none border-2 min-h-[550px]",
                  tier === 'pro' 
                    ? isSelected 
                      ? "bg-slate-900 text-white border-blue-600 shadow-2xl scale-[1.02]" 
                      : "bg-slate-900/95 text-white border-transparent hover:scale-[1.01] shadow-xl"
                    : isSelected
                      ? "bg-white text-slate-900 border-blue-600 shadow-2xl scale-[1.02]"
                      : "bg-white text-slate-900 border-slate-100 hover:border-slate-200 shadow-sm"
                )}
              >
                {/* Popularity/Current Active Badges */}
                {tier === 'pro' && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#D14D2A] text-white px-4 py-1 rounded-full text-[8px] font-black uppercase tracking-widest">
                    RECOMENDADO / MAIS POPULAR
                  </span>
                )}
                {isCurrent && (
                  <span className="absolute top-4 right-4 bg-emerald-500 text-white px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border border-emerald-400">
                    O SEU PLANO ATUAL
                  </span>
                )}

                <div className="space-y-6">
                  {/* Card Header */}
                  <div>
                    <h3 className="text-2xl font-black tracking-tight uppercase italic">{spec.name}</h3>
                    <p className={cn("text-xs font-semibold leading-relaxed mt-2", tier === 'pro' ? 'text-slate-400' : 'text-slate-500')}>
                      {spec.description}
                    </p>
                  </div>

                  {/* Card Price */}
                  <div className="pt-4 border-t border-slate-100/10">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl md:text-5xl font-black">{spec.price}</span>
                      <span className={cn("text-xs font-black uppercase tracking-widest", tier === 'pro' ? 'text-slate-400' : 'text-slate-400')}>
                        MZN / MÊS
                      </span>
                    </div>
                  </div>

                  {/* Card Features List (Feature limits check) */}
                  <div className="space-y-3.5 pt-4">
                    <p className={cn("text-[9px] font-black uppercase tracking-wider", tier === 'pro' ? 'text-slate-500' : 'text-slate-400')}>
                      Funcionalidades Incluídas:
                    </p>
                    <ul className="space-y-3">
                      {spec.features.map((feat, idx) => (
                        <li key={idx} className="flex items-start gap-2.5 text-xs font-semibold leading-snug">
                          {feat.inclusive ? (
                            <CheckCircle2 size={15} className={cn("shrink-0", tier === 'pro' ? 'text-blue-400' : 'text-blue-600')} />
                          ) : (
                            <XCircle size={15} className="text-slate-400 shrink-0 opacity-50" />
                          )}
                          <span className={cn(
                            feat.inclusive ? '' : 'text-slate-400 line-through decoration-slate-300 opacity-60'
                          )}>
                            {feat.label}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Card Button */}
                <div className="pt-6 mt-auto">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedPlanTier(tier);
                      const el = document.getElementById('payment_form_renew');
                      el?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className={cn(
                      "w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all cursor-pointer shadow-md text-center shrink-0 block",
                      tier === 'pro'
                        ? isSelected 
                          ? "bg-white text-slate-900 hover:bg-slate-100" 
                          : "bg-slate-800 text-white hover:bg-slate-700"
                        : isSelected
                          ? "bg-slate-900 text-white hover:bg-slate-800"
                          : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                    )}
                  >
                    {isCurrent ? 'Manter Assinatura' : isSelected ? 'Selecionado' : 'Escolhido para Renovação'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SUBMIT AND RENEWAL WORKFLOW */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8" id="payment_form_renew">
        {/* SECURE SUBMISSION SECTION */}
        <div className="lg:col-span-8 space-y-8">
          <div className="bg-white p-6 md:p-10 rounded-[48px] shadow-sm border border-slate-100 space-y-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-50 pb-6">
              <div>
                <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                  <span>Renovação Segura de Conta</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                </h3>
                <p className="text-slate-500 font-bold text-xs mt-1">
                  Selecione um método nacional e finalize a transação instantânea.
                </p>
              </div>
              <div className="text-blue-600 bg-blue-50 px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest shrink-0 border border-blue-100">
                Plano: {plansSpecs[selectedPlanTier].name} ({plansSpecs[selectedPlanTier].price} MZN)
              </div>
            </div>

            {/* Simulated Payments Gateway */}
            <div className="space-y-4">
              <label className="block text-xs font-black uppercase tracking-widest text-[#8B735F]">
                2. Selecione o Canal Requerido
              </label>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { id: 'mpesa', label: 'M-Pesa Moçambique', icon: Smartphone, color: 'text-emerald-500', desc: 'Gateway Standard' },
                  { id: 'card', label: 'Cartão de Crédito', icon: CreditCard, color: 'text-blue-500', desc: 'Visa/Mastercard' },
                  { id: 'bank', label: 'Transferência (BIM)', icon: Wallet, color: 'text-slate-900', desc: 'Ativação Manual' }
                ].map(method => (
                  <button
                    key={method.id}
                    onClick={() => setSelectedMethod(method.id as any)}
                    className={cn(
                      "p-6 rounded-3xl border-2 transition-all flex flex-col items-start gap-3 text-left relative cursor-pointer",
                      selectedMethod === method.id 
                        ? "border-blue-600 bg-blue-50/50 shadow-sm" 
                        : "border-slate-100 bg-white hover:border-slate-200"
                    )}
                  >
                    {selectedMethod === method.id && (
                      <span className="absolute top-4 right-4 bg-blue-600 text-white rounded-full p-0.5 shadow-md">
                        <CheckCircle2 size={12} />
                      </span>
                    )}
                    <method.icon size={28} className={method.color} />
                    <div>
                      <p className="font-extrabold text-sm text-slate-900">{method.label}</p>
                      <p className="text-[10px] text-slate-400 font-medium">{method.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* COPAY INSTRUCTION DISPATCH */}
            {selectedMethod === 'mpesa' && (
              <div className="bg-emerald-50/50 border border-emerald-150 p-5 rounded-2xl animate-in slide-in-from-bottom-2 text-left space-y-2">
                <p className="text-xs font-black text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Smartphone size={14} /> Instruções M-Pesa
                </p>
                <p className="text-xs text-slate-600 leading-normal font-medium">
                  Envie o valor exato correspondente de <b>{plansSpecs[selectedPlanTier].price} MZN</b> para o número da conta institucional Sabush ERP: <b className="font-mono bg-white px-2 py-0.5 rounded border border-emerald-200 text-slate-800">8586240860</b>. A simulação ativará sua conta automaticamente.
                </p>
              </div>
            )}
            {selectedMethod === 'bank' && (
              <div className="bg-blue-50/40 border border-blue-150 p-5 rounded-2xl animate-in slide-in-from-bottom-2 text-left space-y-2">
                <p className="text-xs font-black text-blue-850 uppercase tracking-wider flex items-center gap-1.5">
                  <Wallet size={14} /> Dados Bancários Millennium BIM
                </p>
                <p className="text-xs text-slate-600 leading-normal font-medium">
                  Efetue a transferência ou depósito de <b>{plansSpecs[selectedPlanTier].price} MZN</b> na conta: <b className="font-mono bg-white px-2 py-0.5 rounded border border-blue-200 text-slate-800">1176885675</b>. Carregue o comprovativo para liberação imediata.
                </p>
              </div>
            )}

            {/* ACTION PROCESSING TRIGGER */}
            <button 
              onClick={handleSubscribe}
              disabled={isProcessing || !selectedMethod}
              className="w-full py-5 bg-slate-900 hover:bg-slate-800 text-white rounded-3xl font-black text-xs uppercase tracking-widest shadow-xl shadow-slate-900/15 flex items-center justify-center gap-2.5 transition-all active:scale-95 disabled:opacity-50 select-none cursor-pointer"
            >
              {isProcessing ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin shrink-0" />
                  <span>A Processar Pagamento...</span>
                </>
              ) : (
                <>
                  <Zap size={15} /> 
                  <span>Subscrever Plano {plansSpecs[selectedPlanTier].name} ({plansSpecs[selectedPlanTier].price} MZN)</span>
                </>
              )}
            </button>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 text-[9px] font-black text-slate-400 uppercase tracking-widest pt-2">
              <div className="flex items-center gap-1.5"><ShieldCheck size={13} className="text-emerald-500" /> Ativação Homologada</div>
              <div className="hidden sm:block w-1.5 h-1.5 bg-slate-200 rounded-full" />
              <div className="flex items-center gap-1.5"><CheckCircle2 size={13} className="text-emerald-500" /> Transação Segura SSL</div>
            </div>
          </div>
        </div>

        {/* SIDEBAR BILLING INFO */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-slate-50/70 border border-slate-100 p-6 md:p-8 rounded-[40px] space-y-8 text-left">
            <h3 className="text-xs font-black uppercase text-[#8B735F] tracking-widest flex items-center gap-2.5">
              <History size={15} className="text-blue-600" /> Histórico de Transações
            </h3>
            
            <div className="space-y-4">
              {history.length === 0 ? (
                <div className="text-center py-10 space-y-2">
                  <ReceiptText size={28} className="mx-auto text-slate-300" />
                  <p className="text-xs font-bold text-slate-400">Nenhuma faturação guardada</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                  {history.map((p, i) => (
                    <div key={i} className="bg-white p-4 rounded-2xl border border-slate-100/60 flex items-center justify-between shadow-sm">
                      <div>
                        <p className="font-extrabold text-slate-900 text-sm">{p.amount} {p.currency || 'MZN'}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                          {p.createdAt?.seconds 
                            ? new Date(p.createdAt.seconds * 1000).toLocaleDateString('pt-MZ') 
                            : new Date().toLocaleDateString('pt-MZ')}
                        </p>
                      </div>
                      <span className="text-[8px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-600 px-2.2 py-0.5 rounded-full border border-emerald-100">
                        {p.status || 'Sucesso'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-6 border-t border-slate-150">
              <button 
                onClick={() => toast.info("Canal de atendimento: Envie um e-mail com os seus dados corporativos para mascenisabush@gmail.com")}
                className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-[#1D1510] transition-colors cursor-pointer"
              >
                <HelpCircle size={13} /> Precisa de suporte financeiro?
              </button>
            </div>
          </div>

          <div className="bg-[#FAF7F2] border border-[#E9E1D2] p-6 md:p-8 rounded-[40px] space-y-4 text-left relative overflow-hidden">
            <div className="absolute top-0 right-0 -mr-6 -mt-6 opacity-5 pointer-events-none text-[#D14D2A]">
              <Sparkles size={120} />
            </div>
            <h4 className="text-[#D14D2A] font-black text-[10px] uppercase tracking-widest flex items-center gap-1.5">
              <Sparkles size={12} className="animate-pulse" /> Suporte Empresarial África
            </h4>
            <p className="text-[#8B735F] font-bold text-xs leading-normal">
              Possui múltiplos armazéns operacionais em território moçambicano ou necessita de integração API via bancos nacionais Moza ou Standard? Conecte seu ERP em larga escala.
            </p>
            <button 
              onClick={() => toast.success("Notificação enviada! O seu gestor de conta entrará em contacto.")}
              className="text-[#1D1510] text-xs font-black flex items-center gap-1.5 group hover:text-[#D14D2A] transition-colors cursor-pointer"
            >
              <span>Falar com Vendas</span> 
              <ArrowRight size={13} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
