import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  collection, 
  addDoc, 
  getDocs, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  updateDoc, 
  doc, 
  deleteDoc, 
  Timestamp 
} from 'firebase/firestore';
import { 
  MessageSquare, 
  Bug, 
  Sparkles, 
  HelpCircle, 
  Heart, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Filter, 
  Trash2, 
  User, 
  Building, 
  RefreshCw, 
  ChevronRight, 
  Send, 
  ShieldAlert, 
  AlertTriangle,
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';

// Types of feedback
type FeedbackType = 'bug' | 'feature' | 'question' | 'praise';
type FeedbackSeverity = 'low' | 'medium' | 'high' | 'critical';
type FeedbackStatus = 'pending' | 'reviewing' | 'fixing' | 'resolved' | 'deferred';

interface FeedbackItem {
  id: string;
  userId: string;
  userEmail: string;
  userDisplayName: string;
  businessId: string;
  businessName: string;
  title: string;
  description: string;
  type: FeedbackType;
  severity: FeedbackSeverity;
  status: FeedbackStatus;
  createdAt: any;
  deviceInfo: {
    screenSize: string;
    userAgent: string;
    language: string;
  };
  adminResponse?: string;
  adminResponseAt?: any;
}

export default function Feedback() {
  const { user, profile, businessData } = useAuth();
  const [activeSegment, setActiveSegment] = useState<'report' | 'list' | 'admin'>('report');
  
  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<FeedbackType>('bug');
  const [severity, setSeverity] = useState<FeedbackSeverity>('medium');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // List States
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [adminFeedbacks, setAdminFeedbacks] = useState<FeedbackItem[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  
  // Admin Filter States
  const [adminFilterType, setAdminFilterType] = useState<string>('all');
  const [adminFilterSeverity, setAdminFilterSeverity] = useState<string>('all');
  const [adminFilterStatus, setAdminFilterStatus] = useState<string>('all');

  // Selected for View / Slide-over detail modal
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackItem | null>(null);
  const [adminResponseText, setAdminResponseText] = useState('');
  const [adminUpdateStatus, setAdminUpdateStatus] = useState<FeedbackStatus>('pending');
  const [isUpdatingFeedback, setIsUpdatingFeedback] = useState(false);

  const isSuperAdmin = profile?.role?.toLowerCase() === 'super_admin';

  // Listen to user's feedback list
  useEffect(() => {
    if (!user) return;
    setIsLoadingList(true);

    const q = isSuperAdmin 
      ? query(collection(db, 'feedbacks'), orderBy('createdAt', 'desc'))
      : query(
          collection(db, 'feedbacks'), 
          where('userId', '==', user.uid),
          orderBy('createdAt', 'desc')
        );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: FeedbackItem[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as FeedbackItem);
      });
      
      if (isSuperAdmin) {
        setAdminFeedbacks(items);
      } else {
        setFeedbacks(items);
      }
      setIsLoadingList(false);
    }, (error) => {
      console.error("Error hearing feedbacks: ", error);
      setIsLoadingList(false);
    });

    return () => unsubscribe();
  }, [user, isSuperAdmin]);

  // Handle Form Submission
  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      toast.error("Por favor preencha o título e a descrição do seu feedback.");
      return;
    }

    setIsSubmitting(true);
    try {
      const deviceInfo = {
        screenSize: `${window.innerWidth}x${window.innerHeight}`,
        userAgent: navigator.userAgent,
        language: navigator.language
      };

      const newFeedback = {
        userId: user?.uid || 'anonymous',
        userEmail: user?.email || profile?.email || 'N/A',
        userDisplayName: profile?.displayName || user?.displayName || 'Utilizador do Sistema',
        businessId: profile?.businessId || 'N/A',
        businessName: businessData?.name || 'Sem Empresa Vinculada',
        title: title.trim(),
        description: description.trim(),
        type,
        severity,
        status: 'pending' as FeedbackStatus,
        createdAt: Timestamp.now(),
        deviceInfo
      };

      await addDoc(collection(db, 'feedbacks'), newFeedback);
      
      toast.success("Feedback submetido com sucesso! A equipa técnica foi notificada.");
      
      // Reset form options
      setTitle('');
      setDescription('');
      setType('bug');
      setSeverity('medium');
      setActiveSegment('list'); // Redirect to listing
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'feedbacks');
      toast.error("Não foi possível registar o seu feedback. Tente de novo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Admin Update
  const handleAdminUpdate = async () => {
    if (!selectedFeedback) return;
    setIsUpdatingFeedback(true);
    try {
      const updateData: any = {
        status: adminUpdateStatus,
      };

      if (adminResponseText.trim()) {
        updateData.adminResponse = adminResponseText.trim();
        updateData.adminResponseAt = Timestamp.now();
      }

      await updateDoc(doc(db, 'feedbacks', selectedFeedback.id), updateData);
      
      toast.success("Feedback atualizado com sucesso!");
      setSelectedFeedback(null);
      setAdminResponseText('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `feedbacks/${selectedFeedback.id}`);
      toast.error("Erro ao atualizar o estado do feedback.");
    } finally {
      setIsUpdatingFeedback(false);
    }
  };

  // Handle Delete (Only Super Admin)
  const handleDeleteFeedback = async (id: string) => {
    if (!window.confirm("Pretende realmente apagar este feedback permanentemente do sistema?")) return;
    try {
      await deleteDoc(doc(db, 'feedbacks', id));
      toast.success("Feedback eliminado definitivamente.");
      if (selectedFeedback?.id === id) {
        setSelectedFeedback(null);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `feedbacks/${id}`);
      toast.error("Erro ao apagar feedback.");
    }
  };

  const getSeverityBadge = (sev: FeedbackSeverity) => {
    switch (sev) {
      case 'low': return <span className="text-[9px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-black uppercase">Baixo</span>;
      case 'medium': return <span className="text-[9px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-black uppercase">Médio</span>;
      case 'high': return <span className="text-[9px] bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full font-black uppercase font-sans">Alto</span>;
      case 'critical': return <span className="text-[9px] bg-rose-150 text-rose-700 px-2 py-0.5 rounded-full font-black uppercase animate-pulse">Crítico</span>;
    }
  };

  const getStatusBadge = (status: FeedbackStatus) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider bg-amber-50 text-amber-600 px-2.5 py-1 rounded-full border border-amber-100">
            <Clock size={10} /> Pendente
          </span>
        );
      case 'reviewing':
        return (
          <span className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-600 px-2.5 py-1 rounded-full border border-emerald-100">
            <Filter size={10} /> Em Análise
          </span>
        );
      case 'fixing':
        return (
          <span className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full border border-blue-100">
            <RefreshCw size={10} className="animate-spin" /> A Corrigir
          </span>
        );
      case 'resolved':
        return (
          <span className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-600 px-2.5 py-1 rounded-full border border-emerald-100">
            <CheckCircle2 size={10} /> Resolvido
          </span>
        );
      case 'deferred':
        return (
          <span className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full border border-slate-200">
            <FileText size={10} /> Arquivado
          </span>
        );
    }
  };

  const getTypeStyle = (t: FeedbackType) => {
    switch (t) {
      case 'bug':
        return {
          icon: Bug,
          label: 'Anomalia / Mau Funcionamento',
          color: 'text-rose-600',
          bg: 'bg-rose-50 border-rose-100'
        };
      case 'feature':
        return {
          icon: Sparkles,
          label: 'Sugestão / Melhoria',
          color: 'text-emerald-600',
          bg: 'bg-emerald-50 border-emerald-100'
        };
      case 'question':
        return {
          icon: HelpCircle,
          label: 'Dúvida / Apoio',
          color: 'text-blue-600',
          bg: 'bg-blue-50 border-blue-100'
        };
      case 'praise':
        return {
          icon: Heart,
          label: 'Elogio / Crítica Construtiva',
          color: 'text-emerald-500',
          bg: 'bg-emerald-50 border-emerald-100'
        };
    }
  };

  // Filtered views for Admin
  const filteredFeedbacks = adminFeedbacks.filter(item => {
    const matchesType = adminFilterType === 'all' || item.type === adminFilterType;
    const matchesSeverity = adminFilterSeverity === 'all' || item.severity === adminFilterSeverity;
    const matchesStatus = adminFilterStatus === 'all' || item.status === adminFilterStatus;
    
    return matchesType && matchesSeverity && matchesStatus;
  });

  return (
    <div className="space-y-6 font-sans">
      {/* Top Glassmorphic Navigation Banner */}
      <div className="bg-white rounded-3xl p-6 md:p-8 border border-slate-100 shadow-sm relative overflow-hidden flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="absolute top-0 right-0 w-64 h-64 bg-slate-100/50 rounded-full blur-3xl -z-10 pointer-events-none" />
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse" />
            <h1 className="text-2xl font-black text-slate-950 tracking-tight">Canal de Feedback & Suporte</h1>
          </div>
          <p className="text-slate-500 text-xs font-medium">Reporte anomalias no sistema, sugira novas funcionalidades ou envie elogios para nos ajudar a melhorar.</p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center bg-slate-50 p-1.5 rounded-2xl border border-slate-100 select-none self-start md:self-auto shrink-0">
          <button
            onClick={() => setActiveSegment('report')}
            className={cn(
              "px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer",
              activeSegment === 'report' ? "bg-white text-blue-600 shadow-sm font-black" : "text-slate-500 hover:text-slate-900"
            )}
          >
            Submeter Feedback
          </button>
          
          <button
            onClick={() => setActiveSegment('list')}
            className={cn(
              "px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center gap-1.5 relative",
              activeSegment === 'list' ? "bg-white text-blue-600 shadow-sm font-black" : "text-slate-500 hover:text-slate-900"
            )}
          >
            Meus Reportes
            {!isSuperAdmin && feedbacks.length > 0 && (
              <span className="w-4 h-4 bg-blue-600 text-white text-[9px] font-black rounded-full flex items-center justify-center shrink-0">
                {feedbacks.length}
              </span>
            )}
          </button>

          {isSuperAdmin && (
            <button
              onClick={() => setActiveSegment('admin')}
              className={cn(
                "px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ml-1 bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-100 hover:text-rose-700",
                activeSegment === 'admin' ? "bg-rose-600 text-white border-rose-600 border font-black shadow-lg shadow-rose-650/25" : ""
              )}
            >
              Feedbacks Admin
              {adminFeedbacks.length > 0 && (
                <span className={cn(
                  "w-4 h-4 text-[9px] font-black rounded-full flex items-center justify-center shrink-0",
                  activeSegment === 'admin' ? "bg-white text-rose-600" : "bg-rose-600 text-white"
                )}>
                  {adminFeedbacks.length}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {/* segment: INPUT REPORT FORM */}
        {activeSegment === 'report' && (
          <motion.div
            key="feed-report"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ type: 'spring', stiffness: 220, damping: 25 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
          >
            <form onSubmit={handleSubmitFeedback} className="lg:col-span-7 bg-white p-6 md:p-8 rounded-[35px] border border-slate-100 shadow-sm space-y-6">
              <div className="space-y-4">
                <label className="block text-xs font-black uppercase text-slate-400 tracking-wider">Como deseja catalogar este feedback?</label>
                
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { id: 'bug', icon: Bug, label: 'Bug/Falha', color: 'rose', hoverClass: 'hover:border-rose-250 hover:bg-rose-50/15' },
                    { id: 'feature', icon: Sparkles, label: 'Sugestão', color: 'violet', hoverClass: 'hover:border-emerald-250 hover:bg-emerald-50/15' },
                    { id: 'question', icon: HelpCircle, label: 'Apoio/Dúvida', color: 'blue', hoverClass: 'hover:border-blue-250 hover:bg-blue-50/15' },
                    { id: 'praise', icon: Heart, label: 'Elogio', color: 'emerald', hoverClass: 'hover:border-emerald-250 hover:bg-emerald-50/15' },
                  ].map((preset) => {
                    const isSelected = type === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setType(preset.id as FeedbackType)}
                        className={cn(
                          "flex flex-col items-center justify-center p-4 border rounded-2xl cursor-pointer transition-all text-center gap-2 font-sans active:scale-95",
                          isSelected 
                            ? `border-${preset.color}-500 bg-${preset.color}-50/30 text-${preset.color}-600 font-extrabold ring-1 ring-${preset.color}-500/25` 
                            : `border-slate-100 text-slate-500 bg-white ${preset.hoverClass}`
                        )}
                      >
                        <preset.icon size={20} className={cn("transition-transform duration-200", isSelected && "scale-110")} />
                        <span className="text-[10px] uppercase font-black tracking-wide">{preset.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Title Input */}
              <div className="space-y-1.5">
                <label className="block text-xs font-black uppercase text-slate-400 tracking-wider">Título de Destaque</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full px-4 py-3.5 bg-slate-50 rounded-2xl outline-none border border-slate-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 text-xs font-semibold text-slate-800 placeholder:text-slate-400/80 transition-all font-sans"
                  placeholder="Ex: Erro ao imprimir fatura do POS ou Sugestão de relatórios trimestrais"
                />
              </div>

              {/* Description Textarea */}
              <div className="space-y-1.5 col-span-1">
                <label className="block text-xs font-black uppercase text-slate-400 tracking-wider">Descrição Detalhada do Problema / Sugestão</label>
                <textarea
                  required
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full p-4 bg-slate-50 rounded-2xl outline-none border border-slate-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 text-xs font-medium text-slate-800 placeholder:text-slate-400/80 resize-none h-44 transition-all leading-relaxed"
                  placeholder="Por favor, tente descrever os passos que provocaram o problema, ou a alteração que gostaria de ver efetuada. Sejam específicos no detalhe para que possamos replicar o sucedido o mais rapidamente possível..."
                />
              </div>

              {/* Severity Select */}
              <div className="space-y-4">
                <label className="block text-xs font-black uppercase text-slate-400 tracking-wider">Gravidade / Prioridade Recomendada</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { id: 'low', label: 'Baixa', desc: 'Melhoria ou dúvida simples' },
                    { id: 'medium', label: 'Média', desc: 'Inconveniente, mas com alternativa' },
                    { id: 'high', label: 'Alta', desc: 'Funcionalidade bloqueada ou incorreta' },
                    { id: 'critical', label: 'Crítico', desc: 'Sistema paralisado / Perda de dados' },
                  ].map((sevItem) => {
                    const isSelected = severity === sevItem.id;
                    const getSevColor = () => {
                      if (sevItem.id === 'low') return 'border-slate-300 text-slate-700 bg-slate-50';
                      if (sevItem.id === 'medium') return 'border-amber-400 text-amber-700 bg-amber-50/20';
                      if (sevItem.id === 'high') return 'border-orange-500 text-orange-700 bg-orange-50/20';
                      return 'border-rose-500 text-rose-700 bg-rose-50/20';
                    };

                    return (
                      <button
                        key={sevItem.id}
                        type="button"
                        onClick={() => setSeverity(sevItem.id as FeedbackSeverity)}
                        className={cn(
                          "flex flex-col text-left p-3.5 border rounded-2xl cursor-pointer transition-all relative overflow-hidden active:scale-95",
                          isSelected 
                            ? `${getSevColor()} font-black ring-1 ring-offset-0 ring-opacity-10 shadow-sm` 
                            : 'border-slate-100 text-slate-500 hover:bg-slate-50'
                        )}
                      >
                        <span className="text-xs uppercase font-black">{sevItem.label}</span>
                        <span className="text-[9px] font-medium leading-tight mt-1 text-slate-400">{sevItem.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end pt-3">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-8 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-xs font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-blue-500/25 active:scale-95 flex items-center gap-2 cursor-pointer transition-all"
                >
                  {isSubmitting ? (
                    <>A enviar relatório...</>
                  ) : (
                    <>
                      Submeter Cancelamento <Send size={15} />
                    </>
                  ).type === 'react.fragment' ? <><Send size={15} /> Confirmar & Enviar</> : <><Send size={15} /> Confirmar & Enviar</>}
                </button>
              </div>
            </form>

            {/* Information Context panel */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-[#FAF7F2] p-6 md:p-8 rounded-[35px] border border-[#E9E1D2] space-y-4">
                <h3 className="text-sm font-black text-[#5C4D3C] uppercase tracking-wider">Como tratamos o seu reporte?</h3>
                <div className="space-y-4 text-xs font-bold leading-relaxed text-[#7C6C5C]">
                  <p>Todos os relatórios são categorizados e analisados de forma direta pelo nosso serviço de apoio ao cliente e integrados com as nossas auditorias internas de software.</p>
                  <p>Damos prioridade absoluta a problemas críticos que limitem a sua faturação (como dificuldades operacionais no POS ou geração tributária de faturas).</p>
                  <p>Acompanhe o progresso de resolução das suas sugestões diretamente na aba <span className="text-blue-600 font-extrabold cursor-pointer" onClick={() => setActiveSegment('list')}>"Meus Reportes"</span>.</p>
                </div>
                
                <div className="pt-4 border-t border-[#E9E1D2] flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-orange-100/60 text-orange-600 flex items-center justify-center">
                    <AlertTriangle size={18} />
                  </div>
                  <div>
                    <h4 className="text-[10px] font-black uppercase text-[#5C4D3C]">Prevenção de Inatividade</h4>
                    <p className="text-[9px] text-[#8C7C6C] font-semibold">Os relatos obsoletos são arquivados para manter a integridade da plataforma.</p>
                  </div>
                </div>
              </div>

              {/* Rapid summary statistics under the hood */}
              <div className="bg-white p-6 rounded-[30px] border border-slate-100 shadow-sm space-y-4">
                <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Informações Técnicas do Dispositivo</h4>
                <div className="space-y-2 font-mono text-[10px] text-slate-500 font-medium">
                  <div className="flex justify-between border-b border-slate-50 pb-1.5">
                    <span>Dimensão de Janela:</span>
                    <span className="text-slate-800 font-black">{window.innerWidth} x {window.innerHeight}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-50 pb-1.5">
                    <span>Idioma do Sistema:</span>
                    <span className="text-slate-800 font-black">{navigator.language}</span>
                  </div>
                  <div className="flex justify-between pb-1">
                    <span>Identificador Operacional:</span>
                    <span className="text-slate-800 font-black max-w-[150px] truncate block" title={navigator.userAgent}>{navigator.userAgent}</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* segment: USER CREATED FEEDBACK LIST */}
        {activeSegment === 'list' && (
          <motion.div
            key="feed-list"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ type: 'spring', stiffness: 220, damping: 25 }}
            className="space-y-4"
          >
            {isLoadingList ? (
              <div className="bg-white p-20 rounded-[35px] border border-slate-100 shadow-sm flex flex-col items-center justify-center gap-2">
                <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
                <p className="text-xs text-slate-500 font-bold">A carregar histórico de feedbacks...</p>
              </div>
            ) : feedbacks.length === 0 ? (
              <div className="bg-white p-20 rounded-[35px] border border-slate-100 shadow-sm text-center space-y-4">
                <div className="w-16 h-16 rounded-3xl bg-slate-50 text-slate-400 flex items-center justify-center mx-auto mb-2">
                  <MessageSquare size={32} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-black text-slate-900">Ainda não registrou feedback</h3>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">Sempre que encontrar um erro (bug) ou tiver uma sugestão, publique utilizando o nosso formulário para obtermos controlo.</p>
                </div>
                <button
                  onClick={() => setActiveSegment('report')}
                  className="px-6 py-3 bg-blue-600 text-white hover:bg-blue-700 text-xs font-black uppercase tracking-wider rounded-2xl cursor-pointer transition-all"
                >
                  Criar Primeiro Reporte
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {feedbacks.map((item) => {
                  const typeObj = getTypeStyle(item.type);
                  return (
                    <div 
                      key={item.id}
                      className="bg-white border border-slate-100 rounded-[30px] p-6 shadow-sm flex flex-col justify-between hover:border-blue-150 transition-all select-none gap-6"
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2 border-b border-slate-50 pb-3">
                          <span className={cn("px-2.5 py-1 text-[9px] font-black uppercase tracking-wide border rounded-xl flex items-center gap-1.5", typeObj?.bg)}>
                            {typeObj && <typeObj.icon size={12} className={typeObj.color} />} 
                            {typeObj?.label.split(' / ')[0]}
                          </span>
                          {getSeverityBadge(item.severity)}
                        </div>

                        <div className="space-y-1.5">
                          <h3 className="text-sm font-black text-slate-900 leading-snug line-clamp-1">{item.title}</h3>
                          <p className="text-slate-500 text-xs font-medium leading-relaxed line-clamp-3 h-[4.5rem] overflow-hidden">{item.description}</p>
                        </div>
                      </div>

                      <div className="space-y-4 pt-3 border-t border-slate-50">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-mono font-black text-slate-400">
                            {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString('pt-PT') : 'Recém-criado'}
                          </span>
                          {getStatusBadge(item.status)}
                        </div>

                        {/* Admin comment block if resolved */}
                        {item.adminResponse && (
                          <div className="p-3 bg-blue-50/30 border border-blue-50 rounded-2xl text-[10px] space-y-1">
                            <p className="font-black text-blue-600 uppercase tracking-wide">Resposta do Administrador</p>
                            <p className="text-slate-600 font-semibold italic">"{item.adminResponse}"</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

        {/* segment: FULL POWER SUPER ADMIN MANAGEMENT TAB */}
        {activeSegment === 'admin' && isSuperAdmin && (
          <motion.div
            key="feed-admin"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ type: 'spring', stiffness: 220, damping: 25 }}
            className="space-y-6"
          >
            {/* Filters bar */}
            <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Filter size={16} className="text-slate-400" />
                <span className="text-xs font-black uppercase text-slate-400 tracking-wider">Filtros:</span>
              </div>

              {/* Filter Type */}
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-extrabold text-slate-400">Tipo:</span>
                <select
                  value={adminFilterType}
                  onChange={e => setAdminFilterType(e.target.value)}
                  className="bg-slate-50 border border-slate-100 px-2 py-1 rounded-xl text-xs font-bold text-slate-700 outline-none"
                >
                  <option value="all">Todos</option>
                  <option value="bug">Anomalias / Bugs</option>
                  <option value="feature">Sugestões</option>
                  <option value="question">Apoio</option>
                  <option value="praise">Elogios</option>
                </select>
              </div>

              {/* Filter Severity */}
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-extrabold text-slate-400">Gravidade:</span>
                <select
                  value={adminFilterSeverity}
                  onChange={e => setAdminFilterSeverity(e.target.value)}
                  className="bg-slate-50 border border-slate-100 px-2 py-1 rounded-xl text-xs font-bold text-slate-700 outline-none"
                >
                  <option value="all">Todas</option>
                  <option value="low">Baixa</option>
                  <option value="medium">Média</option>
                  <option value="high">Alta</option>
                  <option value="critical">Crítica</option>
                </select>
              </div>

              {/* Filter Status */}
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-extrabold text-slate-400">Estado:</span>
                <select
                  value={adminFilterStatus}
                  onChange={e => setAdminFilterStatus(e.target.value)}
                  className="bg-slate-50 border border-slate-100 px-2 py-1 rounded-xl text-xs font-bold text-slate-700 outline-none"
                >
                  <option value="all">Todos os Estados</option>
                  <option value="pending">Pendentes</option>
                  <option value="reviewing">Em Análise</option>
                  <option value="fixing">Em Correção</option>
                  <option value="resolved">Resolvidos</option>
                  <option value="deferred">Arquivados</option>
                </select>
              </div>

              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs font-black bg-slate-50 border border-slate-100 px-3 py-1 rounded-full text-slate-600">
                  {filteredFeedbacks.length} Resultados
                </span>
              </div>
            </div>

            {/* List Table of Feedbacks */}
            {filteredFeedbacks.length === 0 ? (
              <div className="bg-white p-20 rounded-[35px] border border-slate-100 text-center space-y-2">
                <p className="text-sm font-black text-slate-900">Nenhum feedback corresponde aos filtros selecionados.</p>
                <p className="text-xs text-slate-400">Tente ajustar os seletores acima.</p>
              </div>
            ) : (
              <div className="bg-white rounded-[35px] border border-slate-100 shadow-sm overflow-hidden overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100 select-none">
                      <th className="p-5 text-[10px] font-black uppercase text-slate-400 tracking-wider">Origem / Empresa</th>
                      <th className="p-5 text-[10px] font-black uppercase text-slate-400 tracking-wider">Tipo/Assunto</th>
                      <th className="p-5 text-[10px] font-black uppercase text-slate-400 tracking-wider">Severidade</th>
                      <th className="p-5 text-[10px] font-black uppercase text-slate-400 tracking-wider">Estado</th>
                      <th className="p-5 text-[10px] font-black uppercase text-slate-400 tracking-wider">Data de Criação</th>
                      <th className="p-5 text-[10px] font-black uppercase text-slate-400 tracking-wider text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFeedbacks.map((item) => {
                      const typeObj = getTypeStyle(item.type);
                      return (
                        <tr 
                          key={item.id}
                          className="border-b border-slate-50 hover:bg-slate-50/40 transition-colors"
                        >
                          <td className="p-5">
                            <div className="space-y-1">
                              <p className="text-xs font-black text-slate-950">{item.userDisplayName}</p>
                              <div className="flex items-center gap-1.5 text-[9px] text-slate-400 font-bold">
                                <Building size={10} />
                                <span className="uppercase tracking-wide">{item.businessName}</span>
                              </div>
                              <p className="text-[9px] text-slate-400 font-mono">{item.userEmail}</p>
                            </div>
                          </td>
                          <td className="p-5">
                            <div className="space-y-1 max-w-sm">
                              <div className="flex gap-1">
                                <span className={cn("px-1.5 py-0.5 text-[9px] font-black uppercase border rounded-lg", typeObj?.bg, typeObj?.color)}>
                                  {item.type}
                                </span>
                              </div>
                              <p className="text-xs font-black text-slate-800 line-clamp-1">{item.title}</p>
                              <p className="text-[10px] text-slate-400 line-clamp-1 font-medium">{item.description}</p>
                            </div>
                          </td>
                          <td className="p-5">
                            {getSeverityBadge(item.severity)}
                          </td>
                          <td className="p-5">
                            {getStatusBadge(item.status)}
                          </td>
                          <td className="p-5 text-[10px] font-mono font-bold text-slate-500">
                            {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleString('pt-PT') : 'N/A'}
                          </td>
                          <td className="p-5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => {
                                  setSelectedFeedback(item);
                                  setAdminUpdateStatus(item.status);
                                  setAdminResponseText(item.adminResponse || '');
                                }}
                                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all cursor-pointer"
                              >
                                Responder
                              </button>
                              <button
                                onClick={() => handleDeleteFeedback(item.id)}
                                className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                                title="Eliminar Relatório"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Admin Action Slideover / Detail Modal */}
      <AnimatePresence>
        {selectedFeedback && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 font-sans"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-white rounded-[40px] max-w-xl w-full p-8 md:p-10 border border-slate-100 shadow-2xl space-y-6"
            >
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <h3 className="text-lg font-black text-slate-950">Gerir Relato de Feedback</h3>
                  <p className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">ID: {selectedFeedback.id}</p>
                </div>
                <button
                  onClick={() => setSelectedFeedback(null)}
                  className="p-1 px-3 text-xs bg-slate-50 text-slate-500 hover:bg-slate-150 font-black tracking-wide rounded-xl cursor-pointer"
                >
                  X
                </button>
              </div>

              {/* Feedback Context Detail */}
              <div className="p-5 bg-slate-50 border border-slate-100 rounded-3xl space-y-3 max-h-56 overflow-y-auto custom-scrollbar">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-1.5">
                    <User size={13} className="text-slate-400" />
                    <span className="text-[10px] font-black text-slate-700">{selectedFeedback.userDisplayName}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Building size={13} className="text-slate-400" />
                    <span className="text-[10px] font-black text-slate-700 uppercase">{selectedFeedback.businessName}</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <h4 className="text-xs font-black text-slate-900">{selectedFeedback.title}</h4>
                  <p className="text-slate-600 text-[11px] font-medium leading-relaxed whitespace-pre-line">{selectedFeedback.description}</p>
                </div>

                <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-[9px] font-mono text-slate-400">
                  <span>Janela: {selectedFeedback.deviceInfo?.screenSize || 'N/A'}</span>
                  <span>Lang: {selectedFeedback.deviceInfo?.language || 'N/A'}</span>
                </div>
              </div>

              {/* Admin Updates Options */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-xs font-black uppercase text-slate-500 tracking-wider">Atualizar Estado Interno</label>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    {[
                      { id: 'pending', label: 'Pendente' },
                      { id: 'reviewing', label: 'Análise' },
                      { id: 'fixing', label: 'Correção' },
                      { id: 'resolved', label: 'Resolvido' },
                      { id: 'deferred', label: 'Arquivado' },
                    ].map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setAdminUpdateStatus(st.id as FeedbackStatus)}
                        className={cn(
                          "px-3 py-2 text-[10px] font-black uppercase rounded-xl transition-all cursor-pointer text-center",
                          adminUpdateStatus === st.id 
                            ? "bg-blue-600 text-white shadow-md shadow-blue-500/15" 
                            : "bg-slate-50 text-slate-500 hover:bg-slate-100"
                        )}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-black uppercase text-slate-500 tracking-wider">Resposta ou Nota Explicativa para o Utilizador</label>
                  <textarea
                    value={adminResponseText}
                    onChange={e => setAdminResponseText(e.target.value)}
                    className="w-full p-4 bg-slate-50 rounded-2xl outline-none border border-slate-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-50 text-xs font-medium text-slate-800 placeholder:text-slate-400 resize-none h-24"
                    placeholder="Escreva uma resposta de esclarecimento para o utilizador. Este comentário será vísivel no histórico de feedbacks deles na plataforma..."
                  />
                </div>
              </div>

              {/* Actions Footer */}
              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  disabled={isUpdatingFeedback}
                  onClick={() => setSelectedFeedback(null)}
                  className="px-6 py-3.5 font-bold hover:bg-slate-100 rounded-2xl text-slate-500 text-xs uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isUpdatingFeedback}
                  onClick={handleAdminUpdate}
                  className="px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl text-xs uppercase tracking-widest transition-all shadow-lg shadow-blue-500/20 flex items-center gap-2 cursor-pointer"
                >
                  {isUpdatingFeedback ? 'A guardar...' : 'Salvar Alterações'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
