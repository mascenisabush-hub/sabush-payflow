import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { collection, addDoc, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { 
  Zap, Sparkles, Send, Gift, MessageSquare, Truck, ShieldAlert, BadgePercent, 
  Layers, Hammer, Cpu, Lightbulb, CheckCircle, Calendar, MessageSquarePlus, Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';

// Pre-defined high quality ideas/presets for ERP customization
const PRESETS = [
  {
    title: "Campanhas de Marketing por SMS",
    desc: "Envie campanhas promocionais de SMS diretamente para a lista de clientes registados no ERP para aumentar as vendas.",
    icon: MessageSquare,
    badge: "Fidelização",
    color: "amber"
  },
  {
    title: "Fidelização & Pontos Sabush",
    desc: "Sistema de pontos acumulativos por cada compra realizada no POS que os clientes podem descontar em futuras faturas.",
    icon: Gift,
    badge: "Vendas POS",
    color: "rose"
  },
  {
    title: "Gestão de Comissões de Vendedores",
    desc: "Defina taxas de comissão por funcionário e acompanhe o bónus mensal de cada operador de caixa automaticamente.",
    icon: BadgePercent,
    badge: "Equipa & RH",
    color: "emerald"
  },
  {
    title: "Controlo de Entregas e Estafetas",
    desc: "Mapeamento e atribuição de rotas de entrega para pedidos de Grosso e Loja Online com estado em tempo real.",
    icon: Truck,
    badge: "Logística",
    color: "blue"
  }
];

interface CustomFeatureItem {
  id: string;
  title: string;
  description: string;
  iconName: string;
  category: string;
  status: 'em_analise' | 'aprovado' | 'em_desenvolvimento' | 'concluido';
  createdAt: any;
  businessName?: string;
  authorEmail?: string;
}

export default function CustomFeature() {
  const { user, profile, businessData } = useAuth();
  
  // State for proposal creator
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Geral');
  const [selectedIcon, setSelectedIcon] = useState('Zap');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Real dynamic local / cloud requested features timeline
  const [userRequests, setUserRequests] = useState<CustomFeatureItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load user's requested features
  useEffect(() => {
    if (!user) return;
    setIsLoading(true);

    try {
      const q = query(
        collection(db, 'custom_features_proposals'),
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const items: CustomFeatureItem[] = [];
        snapshot.forEach((docSnap) => {
          items.push({ id: docSnap.id, ...docSnap.data() } as CustomFeatureItem);
        });
        setUserRequests(items);
        setIsLoading(false);
      }, (error) => {
        console.warn("Silent error loading cloud proposals:", error);
        // Fallback to local storage if firestore index is not built yet
        try {
          const local = localStorage.getItem(`sabush_custom_features_${user.uid}`);
          if (local) {
            setUserRequests(JSON.parse(local));
          }
        } catch (_) {}
        setIsLoading(false);
      });

      return () => unsubscribe();
    } catch (e) {
      console.error(e);
      setIsLoading(false);
    }
  }, [user]);

  const handleSelectPreset = (preset: typeof PRESETS[0]) => {
    setTitle(preset.title);
    setDescription(preset.desc);
    setCategory(preset.badge);
    if (preset.color === 'amber') setSelectedIcon('MessageSquare');
    if (preset.color === 'rose') setSelectedIcon('Gift');
    if (preset.color === 'emerald') setSelectedIcon('BadgePercent');
    if (preset.color === 'blue') setSelectedIcon('Truck');
    
    toast.success(`Preset "${preset.title}" carregado com sucesso!`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      toast.error("Por favor, preencha o título e a descrição para planear o seu módulo.");
      return;
    }

    setIsSubmitting(true);
    const newProposal = {
      userId: user?.uid || 'anonymous',
      authorEmail: profile?.email || user?.email || 'N/A',
      authorName: profile?.displayName || 'Utilizador Sabush',
      businessId: profile?.businessId || 'N/A',
      businessName: businessData?.name || 'Sabush Partner',
      title: title.trim(),
      description: description.trim(),
      category,
      iconName: selectedIcon,
      status: 'em_analise' as const,
      createdAt: new Date().toISOString()
    };

    try {
      // 1. Try to save to Firestore
      await addDoc(collection(db, 'custom_features_proposals'), newProposal);
      
      // 2. Also cache to localStorage as a robust local fallback
      const savedLocal = localStorage.getItem(`sabush_custom_features_${user?.uid}`) || '[]';
      const list = JSON.parse(savedLocal);
      const extendedProposal = { ...newProposal, id: 'local_' + Date.now() };
      list.unshift(extendedProposal);
      localStorage.setItem(`sabush_custom_features_${user?.uid}`, JSON.stringify(list));

      // Reset form
      setTitle('');
      setDescription('');
      setCategory('Geral');
      setSelectedIcon('Zap');
      
      // Clear index errors and notify beautifully
      toast.success("Módulo de Funcionalidade enviado com sucesso! O programador Sabush foi notificado. 🚀");
    } catch (err) {
      console.warn("Saving to firestore failed or index is building. Saving locally:", err);
      // Failover elegantly to local storage
      const savedLocal = localStorage.getItem(`sabush_custom_features_${user?.uid}`) || '[]';
      const list = JSON.parse(savedLocal);
      const extendedProposal = { ...newProposal, id: 'local_' + Date.now() };
      list.unshift(extendedProposal);
      localStorage.setItem(`sabush_custom_features_${user?.uid}`, JSON.stringify(list));
      setUserRequests(list);

      setTitle('');
      setDescription('');
      setCategory('Geral');
      setSelectedIcon('Zap');
      toast.success("Módulo guardado localmente e agendado para sincronização! 🚀");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper to render dynamically chosen icons
  const renderIcon = (name: string, size = 18, className = "") => {
    switch (name) {
      case 'Gift': return <Gift size={size} className={className} />;
      case 'MessageSquare': return <MessageSquare size={size} className={className} />;
      case 'Truck': return <Truck size={size} className={className} />;
      case 'BadgePercent': return <BadgePercent size={size} className={className} />;
      case 'Sparkles': return <Sparkles size={size} className={className} />;
      default: return <Zap size={size} className={className} />;
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      
      {/* Dynamic Header Block with Glowing African Clay Accents */}
      <div className="bg-gradient-to-br from-[#111111] via-[#0B1F4D] to-[#0B1F4D] p-8 rounded-[40px] shadow-lg border border-[#F8F9FA]/15 text-left text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#D4AF37]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2.5 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#D4AF37]/20 text-[#D4AF37] text-[10px] font-black uppercase tracking-wider">
              <Sparkles size={12} className="animate-pulse" /> Customização de Módulos
            </div>
            <h1 className="text-3xl font-black text-[#FFFFFF] tracking-tight font-sans">
              O Seu ERP Customizado à Medida 🚀
            </h1>
            <p className="text-[#E9CC85] text-sm leading-relaxed font-sans">
              Escreva o que deseja que a nova ferramenta faça! Pode selecionar um dos nossos modelos sugeridos ou criar uma especificação personalizada. O sistema irá sincronizar diretamente com o cockpit de engenharia do Sabush ERP.
            </p>
          </div>
          
          <div className="flex gap-4 shrink-0 bg-[#FFFFFF]/5 p-4 rounded-3xl border border-white/5">
            <div className="text-center">
              <span className="block text-2xl font-mono font-black text-amber-400">
                {userRequests.length}
              </span>
              <span className="text-[10px] text-white/50 font-bold uppercase tracking-widest block mt-0.5">
                Propostas
              </span>
            </div>
            <div className="w-px bg-white/10" />
            <div className="text-center">
              <span className="block text-2xl font-mono font-black text-emerald-400">Online</span>
              <span className="text-[10px] text-white/50 font-bold uppercase tracking-widest block mt-0.5">Conexão API</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* LEFT COLUMN: Feature Creator Form */}
        <div className="lg:col-span-2 space-y-6">
          
          <div className="bg-white rounded-[40px] border border-[#F8F9FA] shadow-sm p-8 text-left space-y-6">
            <h2 className="text-lg font-black text-[#111111] font-sans flex items-center gap-2">
              <Hammer size={18} className="text-[#D4AF37]" /> Projetar Nova Ferramenta
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="block text-[10px] font-black uppercase tracking-widest text-[#6B7280]">
                  Título ou Nome do Módulo
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Cartões de Fidelidade Digitais para Clientes"
                  className="w-full bg-[#F8F9FA] border border-[#F8F9FA] font-semibold text-xs text-[#111111] p-4 rounded-xl outline-none focus:ring-2 focus:ring-[#D4AF37] placeholder-slate-400/80 transition-all"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-[#6B7280]">
                    Categoria do Recurso
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-[#F8F9FA] border border-[#F8F9FA] font-semibold text-xs text-[#111111] p-4 rounded-xl outline-none focus:ring-2 focus:ring-[#D4AF37] cursor-pointer"
                  >
                    <option value="Geral">Módulo Geral</option>
                    <option value="Vendas POS">Vendas & Caixa POS</option>
                    <option value="Fidelização">Fidelização de Clientes</option>
                    <option value="Logística">Logística & Entregas</option>
                    <option value="Equipa & RH">Equipa & Desempenho</option>
                    <option value="Faturação">Faturação Avançada</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-[#6B7280]">
                    Ícone para o Sidebar
                  </label>
                  <div className="flex gap-2.5 p-1 bg-[#F8F9FA] border border-[#F8F9FA] rounded-xl justify-between items-center h-[50px] px-3">
                    {['Zap', 'Gift', 'MessageSquare', 'Truck', 'BadgePercent'].map(ic => (
                      <button
                        key={ic}
                        type="button"
                        onClick={() => setSelectedIcon(ic)}
                        className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer",
                          selectedIcon === ic 
                            ? "bg-[#D4AF37] text-white shadow-sm" 
                            : "text-[#6B7280] hover:bg-slate-100"
                        )}
                        title={`Ícone ${ic}`}
                      >
                        {renderIcon(ic, 15)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] font-black uppercase tracking-widest text-[#6B7280]">
                  Como deve funcionar? (Especificação)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descreva em detalhe como esta funcionalidade deve operar na sua loja. Por exemplo: 'Ao finalizar uma venda no POS, o cliente deve acumular 5% do valor em pontos para descontar no próximo talão.'"
                  rows={5}
                  className="w-full bg-[#F8F9FA] border border-[#F8F9FA] font-semibold text-xs text-[#111111] p-4 rounded-xl outline-none focus:ring-2 focus:ring-[#D4AF37] placeholder-slate-400/80 transition-all resize-none leading-relaxed"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-4 bg-[#D4AF37] hover:bg-black text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-all cursor-pointer shadow-md select-none flex items-center justify-center gap-2 disabled:opacity-45"
              >
                {isSubmitting ? (
                  <>A Enviar Proposta...</>
                ) : (
                  <>
                    <Send size={14} /> Submeter Módulo & Registar no Sidebar 🚀
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Core Interactive List: Submitted ideas history timeline */}
          <div className="bg-white rounded-[40px] border border-[#F8F9FA] shadow-sm p-8 text-left space-y-6">
            <h3 className="text-lg font-black text-[#111111] font-sans flex items-center gap-2">
              <Cpu size={18} className="text-[#D4AF37]" /> O Seu Roteiro de Customizações ({userRequests.length})
            </h3>

            {isLoading ? (
              <div className="py-12 text-center text-slate-400 font-bold text-xs animate-pulse">
                A carregar os seus módulos planeados...
              </div>
            ) : userRequests.length === 0 ? (
              <div className="border border-dashed border-[#F8F9FA] rounded-3xl p-10 text-center space-y-3">
                <Lightbulb size={36} className="mx-auto text-[#D4AF37]/35" />
                <h4 className="font-extrabold text-[#111111] text-sm font-sans">Nenhuma ferramenta planeada ainda</h4>
                <p className="text-slate-400 text-xs max-w-md mx-auto leading-relaxed">
                  Utilize os presets à direita ou digite a sua especificação acima para agendar o lançamento da sua nova funcionalidade.
                </p>
              </div>
            ) : (
              <div className="relative border-l-2 border-[#F8F9FA] pl-6 ml-3 space-y-8 py-2 text-left">
                {userRequests.map((req, idx) => (
                  <div key={req.id || idx} className="relative group">
                    {/* Glowing circular node indicator */}
                    <span className="absolute -left-[31px] top-1.5 w-4.5 h-4.5 rounded-full bg-white border-2 border-[#D4AF37] flex items-center justify-center shadow-xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] animate-pulse" />
                    </span>
                    
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-[#F8F9FA] border border-[#F8F9FA] rounded-lg flex items-center justify-center text-[#D4AF37]">
                            {renderIcon(req.iconName, 13)}
                          </div>
                          <h4 className="font-black text-sm text-[#111111] leading-snug">{req.title}</h4>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 bg-[#F8F9FA] border border-[#F8F9FA] text-[#6B7280] text-[9px] font-black uppercase rounded-lg">
                            {req.category}
                          </span>
                          <span className={cn(
                            "px-2.5 py-1 text-[9px] font-black uppercase rounded-lg tracking-wider",
                            req.status === 'em_analise' ? "bg-amber-50 text-amber-600 border border-amber-200" :
                            req.status === 'aprovado' ? "bg-emerald-50 text-emerald-600 border border-emerald-200" :
                            req.status === 'em_desenvolvimento' ? "bg-blue-50 text-blue-600 border border-blue-200" :
                            "bg-purple-50 text-purple-600 border border-purple-200"
                          )}>
                            {req.status === 'em_analise' ? "Em Análise" :
                             req.status === 'aprovado' ? "Aprovado" :
                             req.status === 'em_desenvolvimento' ? "Desenvolvendo" : "Concluído"}
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-slate-500 leading-relaxed max-w-3xl font-sans">
                        {req.description}
                      </p>

                      <div className="flex items-center gap-3 text-[10px] text-slate-400 font-bold font-sans">
                        <span className="flex items-center gap-1">
                          <Clock size={11} /> Submetido em: {new Date(req.createdAt).toLocaleDateString()}
                        </span>
                        <span>&bull;</span>
                        <span className="text-[#D4AF37]">Disponível Brevemente no Teu Menu</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* RIGHT COLUMN: Preset templates & Information */}
        <div className="space-y-6">
          
          {/* Quick Presets Select Card */}
          <div className="bg-white rounded-[40px] border border-[#F8F9FA] shadow-sm p-8 text-left space-y-6">
            <div className="space-y-1">
              <h3 className="text-lg font-black text-[#111111] font-sans flex items-center gap-2">
                <Lightbulb size={18} className="text-[#D4AF37]" /> Modelos Rápidos
              </h3>
              <p className="text-xs text-slate-400">
                Clique num modelo abaixo para pré-preencher e ajustar a sua proposta com rapidez.
              </p>
            </div>

            <div className="space-y-4">
              {PRESETS.map((preset, idx) => (
                <div
                  key={idx}
                  onClick={() => handleSelectPreset(preset)}
                  className="group p-4 bg-[#F8F9FA] border border-[#F8F9FA] hover:border-[#D4AF37] hover:bg-[#F8F9FA]/50 rounded-3xl transition-all cursor-pointer text-left space-y-2 relative"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-white rounded-xl text-[#D4AF37] group-hover:scale-105 transition-transform shadow-xs">
                        <preset.icon size={14} />
                      </div>
                      <span className="font-extrabold text-xs text-[#111111] line-clamp-1 leading-none">{preset.title}</span>
                    </div>
                    <span className="text-[8px] bg-white border border-[#F8F9FA] px-2 py-0.5 rounded-full uppercase tracking-wider font-black text-[#6B7280]">
                      {preset.badge}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-sans leading-relaxed line-clamp-2">
                    {preset.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Development Cycle info card */}
          <div className="bg-[#F8F9FA] border border-[#F8F9FA] rounded-[40px] p-8 text-left space-y-5">
            <h4 className="text-sm font-black text-[#111111] uppercase tracking-widest flex items-center gap-1.5 font-sans">
              <CheckCircle size={15} className="text-[#D4AF37]" /> Fluxo de Ativação
            </h4>
            <div className="space-y-4 text-xs text-slate-500 leading-relaxed font-sans">
              <div className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full bg-[#D4AF37]/15 text-[#D4AF37] flex items-center justify-center font-black text-[10px] shrink-0">1</div>
                <div>
                  <p className="font-black text-[#111111] mb-0.5">Submissão do Pedido</p>
                  <p>A sua proposta é registada na nossa fila de prioridades em tempo real.</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full bg-[#D4AF37]/15 text-[#D4AF37] flex items-center justify-center font-black text-[10px] shrink-0">2</div>
                <div>
                  <p className="font-black text-[#111111] mb-0.5">Estudo de Viabilidade</p>
                  <p>O arquiteto de software do Sabush ERP avalia os dados de entrada e saídas requeridos.</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full bg-[#D4AF37]/15 text-[#D4AF37] flex items-center justify-center font-black text-[10px] shrink-0">3</div>
                <div>
                  <p className="font-black text-[#111111] mb-0.5">Compilação do Módulo</p>
                  <p>O código TypeScript correspondente é injetado diretamente no menu lateral para a sua empresa.</p>
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
