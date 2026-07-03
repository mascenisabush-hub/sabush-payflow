import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  Shield, CheckCircle2, AlertCircle, LogOut, FileText, 
  Upload, Image as ImageIcon, Send, Smartphone, Wallet, 
  Check, Copy, HelpCircle, Lock, Loader2, Eye, Calendar, Sparkles, Building
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, addDoc, onSnapshot, query, where, orderBy, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { toast } from 'sonner';
import { TermsModal } from './TermsModal';

export function TermsOfServiceGate() {
  const { acceptTerms, logout } = useAuth();
  const [loading, setLoading] = React.useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [termsModalTab, setTermsModalTab] = useState<'terms' | 'privacy'>('terms');

  const handleAccept = async () => {
    setLoading(true);
    await acceptTerms();
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900 flex items-center justify-center p-6 overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-2xl bg-white rounded-[40px] shadow-2xl overflow-hidden"
      >
        <div className="p-10 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white">
              <FileText size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Termos de Serviço</h2>
              <p className="text-sm font-bold text-slate-500">Por favor, revise e aceite os termos para continuar</p>
            </div>
          </div>
        </div>

        <div className="p-10 max-h-[400px] overflow-y-auto custom-scrollbar prose prose-slate text-xs leading-relaxed text-slate-600">
          <h3 className="font-black text-slate-900 mb-2 text-sm uppercase tracking-wide">1. Bem-vindo ao Sabush System ERP</h3>
          <p className="mb-4">Ao usar os nossos serviços, aceita de forma explícita todas as nossas condições legais e comerciais. Fornecemos uma ferramenta completa de facturação, POS, inventário e gestão financeira para PMEs.</p>
          
          <h3 className="font-black text-slate-900 mb-2 mt-6 text-sm uppercase tracking-wide">2. Privacidade e Dados Fiscais</h3>
          <p className="mb-4">Os dados pertencem inteiramente à sua entidade comercial. Mantemos a informação protegida de acordo com os padrões vigentes e normas tributárias em vigor em Moçambique.</p>

          <div className="mt-8 p-6 bg-blue-50/50 rounded-3xl border border-blue-100 flex flex-col gap-3">
            <p className="text-xs font-semibold text-blue-900 leading-normal">
              Ao aceitar, declara ter lido e concordado com a versão completa do contrato mercantil e regulação de privacidade tecnológica.
            </p>
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => { setTermsModalTab('terms'); setIsTermsOpen(true); }}
                className="text-xs text-blue-600 hover:text-blue-800 font-extrabold hover:underline cursor-pointer"
              >
                ✦ Ver Termos Completos
              </button>
              <button
                type="button"
                onClick={() => { setTermsModalTab('privacy'); setIsTermsOpen(true); }}
                className="text-xs text-blue-600 hover:text-blue-800 font-extrabold hover:underline cursor-pointer"
              >
                ✦ Ver Política de Privacidade
              </button>
            </div>
          </div>
        </div>

        <div className="p-10 bg-slate-50 flex flex-col sm:flex-row gap-4">
          <button 
            onClick={handleAccept}
            disabled={loading}
            className="flex-1 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <CheckCircle2 size={20} />}
            Aceitar e Continuar
          </button>
          <button 
            onClick={logout}
            className="px-8 py-4 bg-white border border-slate-200 text-slate-600 hover:text-slate-900 rounded-2xl font-black transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogOut size={20} />
            Recusar
          </button>
        </div>
      </motion.div>

      <TermsModal isOpen={isTermsOpen} onClose={() => setIsTermsOpen(false)} defaultTab={termsModalTab} />
    </div>
  );
}

export function AccountStatusGate({ status }: { status: 'pending' | 'suspended' | 'banned' }) {
  const { logout, user, profile } = useAuth();
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [appealText, setAppealText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const config = {
    pending: {
      title: 'Account Pending Approval',
      desc: 'Your registration is being reviewed by our team. You will be notified once your account is active.',
      icon: Shield,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50'
    },
    suspended: {
      title: 'Account Suspended',
      desc: 'Your account has been temporarily suspended. Please read the custom warning details below.',
      icon: AlertCircle,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50'
    },
    banned: {
      title: 'Account Banned',
      desc: 'Your access to Sabush ERP has been permanently revoked due to serious policy violations.',
      icon: AlertCircle,
      color: 'text-rose-600',
      bgColor: 'bg-rose-50'
    }
  };

  const c = config[status] || config.pending;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900 flex items-center justify-center p-6 overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white p-10 rounded-[40px] shadow-2xl text-center flex flex-col items-center gap-6 my-8"
      >
        <div className={`w-20 h-20 ${c.bgColor} ${c.color} rounded-[32px] flex items-center justify-center`}>
          <c.icon size={40} />
        </div>
        
        <div>
          <h2 className="text-2xl font-black text-slate-900 mb-2">{c.title}</h2>
          <p className="text-slate-500 font-medium leading-relaxed">{c.desc}</p>
        </div>

        <div className="w-full pt-4 space-y-3 font-sans">
          {status === 'suspended' && (
             <div className="text-left w-full space-y-4">
                {/* Warning details (the "email of warning") */}
                {profile?.warningEmailSent && (
                  <div className="bg-orange-50/70 border border-orange-100 p-4 rounded-3xl space-y-2">
                    <p className="text-[10px] font-black text-orange-600 uppercase tracking-widest flex items-center gap-1.5 leading-none">
                      <AlertCircle size={13} className="animate-pulse" /> Detalhes do Aviso Enviado
                    </p>
                    <p className="text-xs font-black text-slate-850 leading-normal">
                      Motivo: {profile?.suspensionReason === 'rules_non_compliance' ? 'Incumprimento das regras' :
                               profile?.suspensionReason === 'billing_issue' ? 'Questão de faturação/pagamento' :
                               profile?.suspensionReason === 'suspicious_activity' ? 'Atividade suspeita' : 'Aviso geral da administração'}
                    </p>
                    <div className="text-[11px] text-slate-600 bg-white border border-slate-100/60 p-3 rounded-2xl max-h-24 overflow-y-auto font-mono whitespace-pre-wrap leading-relaxed">
                      {profile?.warningEmailBody}
                    </div>
                    {profile?.warningSentAt && (
                      <p className="text-[9px] font-bold text-slate-400 text-right uppercase tracking-wider block">
                        Enviado em: {new Date(profile.warningSentAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}

                {profile?.redemptionRequested ? (
                  <div className="bg-emerald-50 border border-emerald-100 p-5 rounded-3xl text-center space-y-3">
                    <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                      <Check size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-900">Pedido de Redenção em Revisão</p>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed leading-normal">
                        Demonstrou esforço para reaver a conta. O Super Admin foi notificado e responderá em breve.
                      </p>
                    </div>
                    <div className="p-3 bg-white/60 rounded-2xl text-[11px] text-slate-650 italic leading-relaxed text-left border border-slate-100/40">
                      " {profile?.redemptionAppeal} "
                    </div>
                  </div>
                ) : (
                  <>
                    {!isRedeeming ? (
                      <button 
                        onClick={() => setIsRedeeming(true)}
                        className="w-full py-4 bg-orange-600 hover:bg-orange-700 text-white rounded-2xl font-black shadow-lg shadow-orange-500/10 transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Sparkles size={18} />
                        Reaver Minha Conta (Redimir)
                      </button>
                    ) : (
                      <form onSubmit={async (e) => {
                        e.preventDefault();
                        if (!appealText.trim()) {
                          toast.error("Por favor, escreva o seu apelo.");
                          return;
                        }
                        setIsSubmitting(true);
                        try {
                          await updateDoc(doc(db, 'users', user.uid), {
                            redemptionRequested: true,
                            redemptionAppeal: appealText.trim(),
                            redemptionStatus: 'pending',
                            redemptionRequestedAt: new Date().toISOString()
                          });
                          toast.success("Pedido de redenção submetido com sucesso!");
                        } catch (err: any) {
                          toast.error("Ocorreu um erro ao submeter o pedido.");
                        } finally {
                          setIsSubmitting(false);
                        }
                      }} className="space-y-3 text-left">
                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider">
                          Escreva o seu apelo / esforço de redenção
                        </label>
                        <textarea
                          required
                          value={appealText}
                          onChange={(e) => setAppealText(e.target.value)}
                          placeholder="Explique os seus planos de conformidade ou como pretende regularizar o estado do negócio..."
                          className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-100 outline-none focus:ring-2 focus:ring-orange-500 text-xs font-semibold leading-relaxed text-slate-800 h-24 resize-none"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setIsRedeeming(false)}
                            className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl text-xs uppercase cursor-pointer"
                          >
                            Voltar
                          </button>
                          <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex-1 py-3 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-black rounded-xl text-xs uppercase flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
                          >
                            {isSubmitting ? 'A submeter...' : 'Enviar Pedido'}
                          </button>
                        </div>
                      </form>
                    )}
                  </>
                )}
             </div>
          )}
          <button 
            type="button"
            onClick={logout}
            className="w-full py-4 bg-slate-100 text-slate-600 hover:text-slate-900 rounded-2xl font-black transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogOut size={20} />
            Sign Out
          </button>
        </div>

        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-4">Sabush System Security</p>
      </motion.div>
    </div>
  );
}

export function SubscriptionExpiredGate() {
  const { logout, businessData, profile } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<'basico' | 'pro' | 'enterprise'>('basico');
  const [paymentMethod, setPaymentMethod] = useState<'mpesa' | 'emola' | 'bank_transfer'>('mpesa');
  
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [screenshotName, setScreenshotName] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [proofs, setProofs] = useState<any[]>([]);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [selectedProofImage, setSelectedProofImage] = useState<string | null>(null);
  
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [appealText, setAppealText] = useState('');
  const [isSubmittingAppeal, setIsSubmittingAppeal] = useState(false);

  const handleSubmittingAppeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appealText.trim()) {
      toast.error("Por favor, fale um pouco sobre o esforço e planos de conformidade.");
      return;
    }
    setIsSubmittingAppeal(true);
    try {
      // 1. Update business document
      await updateDoc(doc(db, 'businesses', businessData.id), {
        redemptionRequested: true,
        redemptionAppeal: appealText.trim(),
        redemptionStatus: 'pending',
        redemptionRequestedAt: new Date().toISOString()
      });

      // 2. Add an activity log/dispatch to notify the admin
      await addDoc(collection(db, 'activity_logs'), {
        uid: profile?.uid || 'user',
        email: profile?.email || 'user@sabush.com',
        action: 'ACCOUNT_REDEMPTION_REQUEST',
        details: `Business ${businessData.name} requested subscription restoration. Appeal: ${appealText.trim()}`,
        businessId: businessData.id,
        createdAt: new Date().toISOString()
      });

      // 3. Document representing the "email of restoration request" dispatched to Super Admin
      await addDoc(collection(db, `users/mascenisabush@gmail.com/notifications`), {
        title: `Pedido urgente de Redenção: ${businessData.name}`,
        message: `O proprietário solicitou o restauro da conta do negócio. Justificação: "${appealText.trim()}"`,
        type: 'warning',
        createdAt: serverTimestamp(),
        read: false
      }).catch(err => console.log("Silent notification queue handle:", err));

      toast.success("Pedido de redenção submetido! O e-mail foi enviado ao administrador.");
      setAppealText('');
      setIsRedeeming(false);
    } catch (err: any) {
      console.error(err);
      toast.error(`Falha ao submeter pedido: ${err.message || err}`);
    } finally {
      setIsSubmittingAppeal(false);
    }
  };
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const plans = {
    basico: { name: 'Básico', price: 500 },
    pro: { name: 'Pro', price: 1200 },
    enterprise: { name: 'Enterprise', price: 2500 }
  };

  const paymentNumbers = {
    mpesa: '8586240860',
    emola: '870242214',
    bank_transfer: '1176885675'
  };

  const paymentTitles = {
    mpesa: 'M-Pesa Moçambique',
    emola: 'e-Mola Moçambique',
    bank_transfer: 'Millennium BIM (Banco)'
  };

  useEffect(() => {
    if (!businessData?.id) return;

    // Sincronizar logs de comprovativos da subscrição em tempo real
    const q = query(
      collection(db, 'subscription_proofs'),
      where('businessId', '==', businessData.id)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const proofsList = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data()
      }));
      // Sort by submittedAt desc locally
      proofsList.sort((a: any, b: any) => {
        const dateA = new Date(a.submittedAt || '').getTime();
        const dateB = new Date(b.submittedAt || '').getTime();
        return dateB - dateA;
      });
      setProofs(proofsList);
    }, (error) => {
      console.warn("Gracefully handled proofs onSnapshot subscription error:", error);
    });

    return () => unsubscribe();
  }, [businessData?.id]);

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(type);
    toast.success(`${type} copiado para a área de transferência!`);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    processFile(file);
  };

  const processFile = (file?: File) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Por favor carregue apenas imagens (PNG, JPEG, etc.).');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      toast.error('A imagem excede 8MB. Selecione uma menor.');
      return;
    }

    setScreenshotName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setScreenshot(reader.result as string);
      toast.success('Imagem carregada com sucesso!');
    };
    reader.onerror = () => {
      toast.error('Erro ao ler o ficheiro.');
    };
    reader.readAsDataURL(file);
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
    processFile(file);
  };

  const handleSubmitProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!screenshot) {
      toast.error('Por favor, carregue o comprovativo de pagamento (screenshot/fotografia).');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        businessId: businessData.id,
        businessName: businessData.name || 'Empresa Sem Nome',
        ownerId: profile?.uid || 'desconhecido',
        ownerEmail: profile?.email || 'desconhecido@sabush.com',
        amount: plans[selectedPlan].price,
        planType: selectedPlan,
        method: paymentMethod,
        screenshot: screenshot,
        status: 'pending',
        notes: '',
        submittedAt: new Date().toISOString(),
        resolvedAt: null
      };

      await addDoc(collection(db, 'subscription_proofs'), payload);

      // Save selected plan in Firestore under businesses/{businessId}/subscription
      const now = new Date();
      const nextMonth = new Date();
      nextMonth.setDate(now.getDate() + 30);

      await updateDoc(doc(db, 'businesses', businessData.id), {
        subscriptionPlan: selectedPlan,
        subscription: {
          plan: selectedPlan,
          status: 'pending', // Pending validation by admin
          startDate: now.toISOString(),
          endDate: nextMonth.toISOString()
        }
      });

      toast.success('Comprovativo enviado para revisão! O Super-Admin irá validar os seus dados em breve.');
      
      // Reset state
      setScreenshot(null);
      setScreenshotName('');
    } catch (err: any) {
      console.error(err);
      toast.error(`Falha ao submeter comprovativo: ${err.message || err}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleString('pt-MZ');
    } catch {
      return dateStr;
    }
  };

  // Determine standard trial vs subscript expired wording
  const trialEnds = businessData?.trialEndsAt ? new Date(businessData.trialEndsAt) : null;
  const isTrialExpired = businessData?.subscriptionStatus === 'trial' && trialEnds && trialEnds <= new Date();

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900 flex items-center justify-center p-4 md:p-8 overflow-y-auto">
      <div className="w-full max-w-6xl bg-white rounded-[40px] shadow-2xl flex flex-col lg:flex-row overflow-hidden my-auto max-h-[90vh]">
        
        {/* Left column: payment instructions */}
        <div className="flex-1 bg-slate-50 p-6 md:p-10 border-b lg:border-b-0 lg:border-r border-slate-100 overflow-y-auto">
          <div className="space-y-8">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-red-150 text-red-600 rounded-2xl flex items-center justify-center">
                <Lock size={24} />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase text-red-500 tracking-widest bg-red-50 px-2 py-1 rounded">Sistema Suspenso</span>
                <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">Expiração de Acesso</h2>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200/60 p-5 rounded-3xl">
              <p className="text-sm font-bold text-amber-800 leading-relaxed">
                {isTrialExpired 
                  ? "O seu período experimental gratuito de 14 dias terminou. Para continuar a usufruir de todas as funcionalidades, por favor realize o pagamento da sua subscrição."
                  : "A sua subscrição expirou. Faça a renovação efetuando o pagamento numa das contas legítimas listadas abaixo."
                }
              </p>
            </div>

            {/* Redeem account/Subscription restoration panel */}
            {businessData?.redemptionRequested ? (
              <div className="bg-emerald-50 border border-emerald-200/60 p-5 rounded-3xl space-y-3 font-sans">
                <p className="text-xs font-black uppercase text-emerald-600 tracking-wider flex items-center gap-1.5 leading-none">
                  <Sparkles size={14} className="animate-pulse" /> Pedido de Reativação Ativo (Redenção)
                </p>
                <p className="text-xs text-slate-600 leading-normal">
                  Submeteu um pedido de esforço de redenção para reaver e restaurar o acesso à conta do seu negócio. A equipa de administração (mascenisabush@gmail.com) foi notificada via e-mail e está a analisar os dados para o restauro.
                </p>
                {businessData.redemptionAppeal && (
                  <div className="p-3 bg-white/80 rounded-2xl text-[11px] text-slate-700 italic border border-slate-100/40 font-mono">
                    " {businessData.redemptionAppeal} "
                  </div>
                )}
                {businessData.redemptionRequestedAt && (
                  <p className="text-[9px] font-bold text-slate-450 tracking-wider text-right uppercase">
                    Solicitado em: {new Date(businessData.redemptionRequestedAt).toLocaleString()}
                  </p>
                )}
              </div>
            ) : (
              <div className="font-sans">
                {!isRedeeming ? (
                  <div className="bg-orange-50/50 border border-orange-100 p-5 rounded-3xl flex flex-col sm:flex-row gap-4 items-center justify-between">
                    <div className="space-y-1 text-left">
                      <p className="text-[10px] font-black uppercase text-orange-600 tracking-wider">Negócio Suspenso ou Perto de Eliminação?</p>
                      <p className="text-xs font-bold text-slate-500 leading-normal max-w-[280px]">
                        Clique abaixo para submeter um Pedido de Redenção formal e notificar o administrador para restauração.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsRedeeming(true)}
                      className="px-5 py-3 bg-orange-600 hover:bg-orange-700 text-white text-xs font-black uppercase rounded-2xl shadow-md transition-all whitespace-nowrap cursor-pointer hover:shadow-orange-500/15"
                    >
                      Recuperar Conta/Redimir
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmittingAppeal} className="bg-orange-50/50 border border-orange-200 p-5 rounded-3xl space-y-4 text-left">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase text-orange-600 tracking-wider">Formulário de Redenção de Conta</p>
                      <p className="text-xs font-bold text-slate-500 leading-normal">
                        Indique as razões para restauro do acesso ao ERP. O administrador mascenisabush@gmail.com receberá um alerta por e-mail para validar a sua situação comercial.
                      </p>
                    </div>
                    <textarea
                      required
                      value={appealText}
                      onChange={e => setAppealText(e.target.value)}
                      placeholder="Explique os seus planos de conformidade ou razões para restauro imediato do acesso ao negócio..."
                      className="w-full p-4 bg-white rounded-2xl border border-slate-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-150 outline-none text-xs font-semibold leading-relaxed text-slate-800 h-24 resize-none"
                    />
                    <div className="flex gap-2 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          setIsRedeeming(false);
                          setAppealText('');
                        }}
                        className="flex-1 py-3 bg-slate-200 text-slate-600 font-bold rounded-xl text-xs uppercase cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmittingAppeal}
                        className="flex-1 py-3 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-black rounded-xl text-xs uppercase flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-orange-500/10"
                      >
                        {isSubmittingAppeal ? 'A enviar...' : 'Enviar Pedido'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* Choose subscription tier cards */}
            <div className="space-y-4 font-sans">
              <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest">1. Escolha o seu Plano de Acesso</h3>
              <div className="grid grid-cols-1 gap-3.5">
                {[
                  {
                    id: 'basico',
                    name: 'Plano Básico',
                    price: 500,
                    badge: 'Essencial',
                    badgeStyle: 'bg-slate-100 text-slate-700',
                    features: ['1 Utilizador na equipa', 'Até 100 Produtos no inventário', 'Relatórios básicos de faturação', '❌ Sem Automações de WhatsApp']
                  },
                  {
                    id: 'pro',
                    name: 'Plano Profissional (Pro)',
                    price: 1200,
                    badge: 'Recomendado',
                    badgeStyle: 'bg-orange-100 text-orange-700 font-extrabold',
                    features: ['Até 5 Utilizadores ativos', 'Inventário de produtos ilimitado', 'Todos os relatórios financeiros', '✓ Automações de WhatsApp incluídas', '❌ Sem Multi-loja/Filiais']
                  },
                  {
                    id: 'enterprise',
                    name: 'Plano Enterprise',
                    price: 2500,
                    badge: 'Completo',
                    badgeStyle: 'bg-blue-105 text-blue-700 font-extrabold',
                    features: ['Utilizadores equipa ilimitados', 'Inventário ilimitado + Multi-Lojas', 'Relatórios por filial + Analíticas avançadas', '✓ Suporte prioritário Sabush 24/7']
                  }
                ].map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPlan(p.id as any)}
                    className={`p-5 rounded-[22px] border-2 text-left transition-all relative flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 ${
                      selectedPlan === p.id
                        ? 'border-blue-600 bg-white shadow-lg shadow-blue-100/20'
                        : 'border-slate-100 hover:border-slate-150 bg-slate-50/50'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-sm text-slate-900">{p.name}</span>
                        <span className={`px-2 py-0.5 rounded text-[8px] uppercase font-black tracking-widest ${p.badgeStyle}`}>
                          {p.badge}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {p.features.map((feat, fIdx) => (
                          <span key={fIdx} className="text-[10px] text-slate-500 font-medium">✦ {feat}</span>
                        ))}
                      </div>
                    </div>
                    
                    <div className="flex items-baseline gap-1 shrink-0 bg-blue-50/40 px-3.5 py-2.5 rounded-2xl border border-blue-100/20">
                      <span className="text-xl font-black text-slate-900">{p.price}</span>
                      <span className="text-[8px] font-extrabold text-slate-400 uppercase tracking-wider">MZN</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Payment Method instructions */}
            <div className="space-y-4">
              <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest">2. Contas de Pagamento Oficiais</h3>
              
              <div className="space-y-2.5">
                {/* MPESA */}
                <div className={`p-4 rounded-2xl border transition-all ${paymentMethod === 'mpesa' ? 'border-blue-600 bg-white shadow-sm' : 'border-slate-100 bg-white/70'}`}>
                  <div className="flex items-center justify-between">
                    <button 
                      type="button"
                      onClick={() => setPaymentMethod('mpesa')}
                      className="flex items-center gap-3 text-left flex-1"
                    >
                      <div className="w-10 h-10 bg-red-100 text-red-600 rounded-xl flex items-center justify-center font-bold text-sm">MP</div>
                      <div>
                        <p className="text-xs font-black text-slate-900">M-Pesa Moçambique</p>
                        <p className="text-sm font-mono font-black text-slate-700 mt-0.5">8586240860</p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy('8586240860', 'Mpesa')}
                      className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-900 transition-all"
                    >
                      {copiedText === 'Mpesa' ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>

                {/* EMOLA */}
                <div className={`p-4 rounded-2xl border transition-all ${paymentMethod === 'emola' ? 'border-blue-600 bg-white shadow-sm' : 'border-slate-100 bg-white/70'}`}>
                  <div className="flex items-center justify-between">
                    <button 
                      type="button"
                      onClick={() => setPaymentMethod('emola')}
                      className="flex items-center gap-3 text-left flex-1"
                    >
                      <div className="w-10 h-10 bg-orange-100 text-orange-600 rounded-xl flex items-center justify-center font-bold text-sm">EM</div>
                      <div>
                        <p className="text-xs font-black text-slate-900">e-Mola Moçambique</p>
                        <p className="text-sm font-mono font-black text-slate-700 mt-0.5">870242214</p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy('870242214', 'EMOLA')}
                      className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-900 transition-all"
                    >
                      {copiedText === 'EMOLA' ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>

                {/* BANK */}
                <div className={`p-4 rounded-2xl border transition-all ${paymentMethod === 'bank_transfer' ? 'border-blue-600 bg-white shadow-sm' : 'border-slate-100 bg-white/70'}`}>
                  <div className="flex items-center justify-between">
                    <button 
                      type="button"
                      onClick={() => setPaymentMethod('bank_transfer')}
                      className="flex items-center gap-3 text-left flex-1"
                    >
                      <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center font-bold text-sm font-sans">BIM</div>
                      <div>
                        <p className="text-xs font-black text-slate-900">Millennium BIM transferência</p>
                        <p className="text-sm font-mono font-black text-slate-700 mt-0.5">1176885675</p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy('1176885675', 'BIM')}
                      className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-900 transition-all"
                    >
                      {copiedText === 'BIM' ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-4 border-t border-slate-150">
              <button
                type="button"
                onClick={logout}
                className="px-6 py-3.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-600 hover:text-slate-900 rounded-2xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2"
              >
                <LogOut size={16} /> Encerrar Sessão
              </button>
              <div className="text-[10px] text-slate-400 font-bold">
                Empresa: {businessData?.name || 'ID: ' + businessData?.id}
              </div>
            </div>
          </div>
        </div>

        {/* Right column: submission form & history list */}
        <div className="flex-1 p-6 md:p-10 flex flex-col overflow-y-auto">
          <div className="space-y-6 flex-1">
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest">3. Submeter Comprovativo</h3>

            <form onSubmit={handleSubmitProof} className="space-y-4">
              {/* Drag & Drop Area */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-[28px] p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[180px] relative overflow-hidden ${
                  isDragging 
                    ? 'border-blue-600 bg-blue-50/50' 
                    : screenshot 
                      ? 'border-emerald-500 bg-emerald-50/10' 
                      : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*"
                  className="hidden"
                />

                {screenshot ? (
                  <div className="space-y-3">
                    <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-md mx-auto border border-emerald-200">
                      <img src={screenshot} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-900 truncate max-w-[280px] mx-auto">{screenshotName}</p>
                      <p className="text-xs text-emerald-600 font-bold mt-0.5">Imagem pronta para envio! Clique de novo para substituir.</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center text-slate-400 mx-auto">
                      <Upload size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-800">Arraste ou clique para carregar a imagem</p>
                      <p className="text-xs text-slate-400 font-bold mt-1">Carregue um screenshot ou fotografia nítida (PNG, JPG)</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Button */}
              <button
                type="submit"
                disabled={isSubmitting || !screenshot}
                className="w-full py-4 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg shadow-slate-900/15"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Submetendo Comprovativo...
                  </>
                ) : (
                  <>
                    <Send size={16} /> Submeter para Validação ({plans[selectedPlan].price} MZN)
                  </>
                )}
              </button>
            </form>

            {/* Past Uploads History List */}
            <div className="pt-6 border-t border-slate-100 flex-1">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest">Histórico de Comprovativos Enviados</h4>
                <span className="text-[10px] bg-slate-100 text-slate-500 font-black uppercase px-2 py-0.5 rounded-full">{proofs.length} total</span>
              </div>

              {proofs.length === 0 ? (
                <div className="text-center py-6 bg-slate-50 rounded-[24px]">
                  <p className="text-xs text-slate-400 font-bold leading-relaxed">Nenhum comprovativo enviado recentemente.</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[190px] overflow-y-auto custom-scrollbar pr-1">
                  {proofs.map((proof) => (
                    <div key={proof.id} className="p-4 bg-white border border-slate-100 rounded-2xl flex items-center gap-4">
                      
                      {/* Image thumbnail context */}
                      <button 
                        type="button"
                        onClick={() => setSelectedProofImage(proof.screenshot)}
                        className="w-12 h-12 rounded-xl bg-slate-100 overflow-hidden relative group shrink-0 border border-slate-200 hover:brightness-90 transition-all flex items-center justify-center"
                        title="Ampliar comprovativo"
                      >
                        <img src={proof.screenshot} alt="Thumbnail proof" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                          <Eye size={14} />
                        </div>
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-black text-slate-900 uppercase">
                            {proof.planType === 'basico' ? 'Básico' : proof.planType === 'pro' ? 'Pro' : proof.planType === 'enterprise' ? 'Enterprise' : (proof.planType || 'Básico')} ({proof.amount} MZN)
                          </p>
                          <span className={`px-2.5 py-0.5 text-[8px] font-black uppercase tracking-widest rounded-full ${
                            proof.status === 'approved' 
                              ? 'bg-emerald-50 text-emerald-600'
                              : proof.status === 'rejected'
                                ? 'bg-rose-50 text-rose-600'
                                : 'bg-orange-50 text-orange-600'
                          }`}>
                            {proof.status === 'approved' ? 'Aprovado' : proof.status === 'rejected' ? 'Rejeitado' : 'Pendente'}
                          </span>
                        </div>
                        <p className="text-[10px] font-bold text-slate-400 mt-1 flex items-center gap-1.5">
                          <Calendar size={10} /> Enviado em {formatDateTime(proof.submittedAt)}
                        </p>
                        
                        {proof.status === 'rejected' && proof.notes && (
                          <div className="mt-1.5 p-2 bg-rose-50 border border-rose-100 rounded-lg text-[10px] font-bold text-rose-600">
                            Motivo: {proof.notes}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Lightbox Modal for screenshot enlargement */}
      <AnimatePresence>
        {selectedProofImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedProofImage(null)}
            className="fixed inset-0 z-[150] bg-black/80 flex items-center justify-center p-4 cursor-pointer"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="max-w-3xl max-h-[85vh] overflow-hidden rounded-2xl bg-white border border-slate-800"
            >
              <img src={selectedProofImage} alt="Comprovativo ampliado" className="max-w-full max-h-[80vh] object-contain mx-auto" />
              <div className="p-4 bg-slate-900 text-center text-white text-xs font-black uppercase tracking-wider">
                Clique em qualquer lugar para fechar
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

