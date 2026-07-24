import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { useAuth } from '../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, updateDoc, serverTimestamp, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { 
  User as UserIcon, 
  Building, 
  Globe, 
  Save, 
  Loader2, 
  ShieldCheck, 
  Smartphone, 
  Mail, 
  MapPin, 
  DollarSign, 
  Copy, 
  ExternalLink, 
  Download, 
  QrCode, 
  Lock,
  History, 
  Sparkles, 
  Palette, 
  Info,
  Briefcase,
  PhoneCall,
  Laptop
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { logAction, ActionType } from '../lib/logger';

// List of lovely preset emojis for user avatar if they down have one
const AVATAR_PRESETS = [
  { char: '🦊', label: 'Fox', bg: 'bg-orange-100 border-orange-200' },
  { char: '🐼', label: 'Panda', bg: 'bg-slate-100 border-slate-200' },
  { char: '🐯', label: 'Tiger', bg: 'bg-amber-100 border-amber-200' },
  { char: '🦁', label: 'Lion', bg: 'bg-yellow-100 border-yellow-200' },
  { char: '🐨', label: 'Koala', bg: 'bg-neutral-100 border-neutral-200' },
  { char: '🦄', label: 'Unicorn', bg: 'bg-pink-100 border-pink-200' },
  { char: '🧙‍♂️', label: 'Wizard', bg: 'bg-violet-100 border-violet-200' },
  { char: '🚀', label: 'Rocket', bg: 'bg-sky-100 border-sky-200' },
];

const THEME_PRESETS = [
  { id: 'blue', name: 'Sabush Green', color: 'bg-teal-700', text: 'text-teal-700', ring: 'focus:ring-teal-600' },
  { id: 'emerald', name: 'Forest Emerald', color: 'bg-emerald-600', text: 'text-emerald-600', ring: 'focus:ring-emerald-500' },
  { id: 'indigo', name: 'Royal Indigo', color: 'bg-indigo-600', text: 'text-indigo-600', ring: 'focus:ring-indigo-500' },
  { id: 'amber', name: 'Safi Amber', color: 'bg-amber-600', text: 'text-amber-600', ring: 'focus:ring-amber-500' },
  { id: 'rose', name: 'Cosmic Rose', color: 'bg-rose-600', text: 'text-rose-600', ring: 'focus:ring-rose-500' },
];

const THEME_HEX_COLORS: Record<string, string> = {
  blue: '#2563EB',
  emerald: '#059669',
  indigo: '#2563EB',
  amber: '#D4AF37',
  rose: '#e11d48',
};

export default function UserProfile() {
  const { profile, businessData, user } = useAuth();
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');
  const [logs, setLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Profile forms state
  const [formData, setFormData] = useState({
    displayName: profile?.displayName || '',
    phoneNumber: profile?.phoneNumber || '',
    bio: profile?.bio || '',
    title: profile?.title || '',
    preferredContact: profile?.preferredContact || 'email',
    avatarPreset: profile?.avatarPreset || '🦊',
    themeColor: profile?.themeColor || 'blue',
    authPin: profile?.authPin || '',
    twoFactorEnabled: profile?.twoFactorEnabled || false,
    
    // Business Details
    businessName: businessData?.name || '',
    businessAddress: businessData?.address || '',
    logoUrl: businessData?.logoUrl || '',
    currency: businessData?.currency || 'MZN',
    supportEmail: businessData?.supportEmail || '',
    businessPhone: businessData?.phone || '',
    businessTagline: businessData?.tagline || '',
  });

  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [qrColorOption, setQrColorOption] = useState<'brand' | 'black'>('brand');

  // Keep state sync in case profile/business loads asynchronously
  useEffect(() => {
    if (profile || businessData) {
      setFormData(prev => ({
        ...prev,
        displayName: profile?.displayName || prev.displayName,
        phoneNumber: profile?.phoneNumber || prev.phoneNumber,
        bio: profile?.bio || prev.bio,
        title: profile?.title || prev.title,
        preferredContact: profile?.preferredContact || prev.preferredContact,
        avatarPreset: profile?.avatarPreset || prev.avatarPreset,
        themeColor: profile?.themeColor || prev.themeColor,
        authPin: profile?.authPin !== undefined ? profile.authPin : prev.authPin,
        twoFactorEnabled: profile?.twoFactorEnabled !== undefined ? profile.twoFactorEnabled : prev.twoFactorEnabled,
        
        businessName: businessData?.name || prev.businessName,
        businessAddress: businessData?.address || prev.businessAddress,
        logoUrl: businessData?.logoUrl || prev.logoUrl,
        currency: businessData?.currency || prev.currency,
        supportEmail: businessData?.supportEmail || prev.supportEmail,
        businessPhone: businessData?.phone || prev.businessPhone,
        businessTagline: businessData?.tagline || prev.businessTagline,
      }));
    }
  }, [profile, businessData]);

  // Load User Activity Logs
  useEffect(() => {
    if (activeTab === 'logs' && profile?.uid) {
      fetchLogs();
    }
  }, [activeTab, profile?.uid]);

  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      const q = query(
        collection(db, 'activity_logs'),
        where('uid', '==', profile.uid),
        limit(100)
      );
      const snapshot = await getDocs(q);
      const fetchedLogs: any[] = [];
      snapshot.forEach(docSnap => {
        fetchedLogs.push({
          id: docSnap.id,
          ...docSnap.data()
        });
      });
      
      // Sort client-side to bypass Firebase composite index requirement
      fetchedLogs.sort((a, b) => {
        const getMs = (val: any) => {
          if (!val) return 0;
          if (typeof val.toDate === 'function') return val.toDate().getTime();
          if (val.seconds !== undefined) return val.seconds * 1000;
          return new Date(val).getTime() || 0;
        };
        return getMs(b.timestamp) - getMs(a.timestamp);
      });
      
      setLogs(fetchedLogs.slice(0, 15));
    } catch (err) {
      console.error('Error loading profile activity logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size <= 1024 * 512) {
        // Safe size limit natively, read straight away
        const reader = new FileReader();
        reader.onloadend = () => {
          setFormData(prev => ({ ...prev, logoUrl: reader.result as string }));
          toast.success("New business logo loaded into draft");
        };
        reader.readAsDataURL(file);
      } else {
        // Larger file size, auto-resize and compress via canvas
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              let width = img.width;
              let height = img.height;
              
              const MAX_WIDTH = 800;
              const MAX_HEIGHT = 800;
              
              if (width > MAX_WIDTH || height > MAX_HEIGHT) {
                if (width > height) {
                  height = Math.round((height * MAX_WIDTH) / width);
                  width = MAX_WIDTH;
                } else {
                  width = Math.round((width * MAX_HEIGHT) / height);
                  height = MAX_HEIGHT;
                }
              }
              
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(img, 0, 0, width, height);
                
                let dataUrl = '';
                const isPng = file.type === 'image/png';
                
                if (isPng) {
                  dataUrl = canvas.toDataURL('image/png');
                }
                
                const charLimit = 512 * 1024 * 1.34;
                
                if (!dataUrl || dataUrl.length > charLimit) {
                  let quality = 0.85;
                  dataUrl = canvas.toDataURL('image/jpeg', quality);
                  
                  let attempts = 0;
                  while (dataUrl.length > charLimit && quality > 0.3 && attempts < 5) {
                    quality -= 0.15;
                    dataUrl = canvas.toDataURL('image/jpeg', quality);
                    attempts++;
                  }
                }
                
                if (dataUrl.length > charLimit) {
                  toast.error("O logotipo fornecido é excessivamente grande ou complexo.");
                } else {
                  setFormData(prev => ({ ...prev, logoUrl: dataUrl }));
                  toast.success("Logotipo da empresa ajustado e reduzido sob o limite de 512KB!");
                }
              } else {
                toast.error("Não foi possível otimizar o tamanho do logotipo.");
              }
            } catch (err) {
              console.error(err);
              toast.error("Erro interno ao tratar as dimensões do logotipo.");
            }
          };
          img.onerror = () => {
            toast.error("Ficheiro de imagem corrompido ou inválido.");
          };
          img.src = event.target?.result as string;
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile?.uid) return;
    setLoading(true);

    try {
      // 1. Update personal details in users collection
      await updateDoc(doc(db, 'users', profile.uid), {
        displayName: formData.displayName,
        phoneNumber: formData.phoneNumber,
        bio: formData.bio,
        title: formData.title,
        preferredContact: formData.preferredContact,
        avatarPreset: formData.avatarPreset,
        themeColor: formData.themeColor,
        authPin: formData.authPin,
        twoFactorEnabled: formData.twoFactorEnabled,
        updatedAt: serverTimestamp()
      });

      // Log action locally and in firebase (as per standard)
      await logAction(
        profile.uid, 
        profile.email, 
        ActionType.LOGIN, // We can reuse action types or represent updating info
        `Updated personal user profile details for ${formData.displayName}`,
        profile.businessId
      );

      toast.success("Informações pessoais guardadas com sucesso!");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao guardar dados do utilizador");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile?.businessId) {
      toast.error("No active business connected to this profile login");
      return;
    }
    setLoading(true);

    try {
      // 2. Update business details in businesses collection
      await updateDoc(doc(db, 'businesses', profile.businessId), {
        name: formData.businessName,
        address: formData.businessAddress,
        logoUrl: formData.logoUrl,
        currency: formData.currency,
        supportEmail: formData.supportEmail,
        phone: formData.businessPhone,
        tagline: formData.businessTagline,
        updatedAt: serverTimestamp()
      });

      await logAction(
        profile.uid, 
        profile.email, 
        ActionType.LOGIN,
        `Updated business identity information for ${formData.businessName}`,
        profile.businessId
      );

      toast.success("Identidade empresarial atualizada com sucesso!");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao guardar dados da empresa");
    } finally {
      setLoading(false);
    }
  };

  // Build Storefront URLs
  const currentDomain = window.location.origin;
  const storefrontUrl = `${currentDomain}?shop=${profile?.businessId}`;

  useEffect(() => {
    if (!profile?.businessId) return;
    const qrColor = qrColorOption === 'brand' 
      ? (THEME_HEX_COLORS[formData.themeColor] || '#111111')
      : '#0B1F4D';
    QRCode.toDataURL(storefrontUrl, {
      width: 600,
      margin: 2,
      color: {
        dark: qrColor,
        light: '#ffffff'
      }
    }, (err, url) => {
      if (err) {
        console.error('Error generating QR', err);
        return;
      }
      setQrCodeDataUrl(url);
    });
  }, [storefrontUrl, formData.themeColor, qrColorOption, profile?.businessId]);

  const copyStorefrontLink = () => {
    navigator.clipboard.writeText(storefrontUrl);
    toast.success("Link do catálogo online copiado!", {
      description: "Pode partilhar com os seus clientes no WhatsApp e Redes Sociais."
    });
  };

  const openStorefront = () => {
    window.open(storefrontUrl, '_blank');
  };

  // Find active theme configuration style
  const activeColorTheme = THEME_PRESETS.find(t => t.id === formData.themeColor) || THEME_PRESETS[0];

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Dynamic Header Profile Hero banner */}
      <div className="relative bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 rounded-3xl p-6 md:p-8 text-white overflow-hidden shadow-xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />

        <div className="flex flex-col md:flex-row items-center gap-6 relative z-10">
          {/* Preset Avatar Display */}
          <div className="relative">
            <div className="w-24 h-24 rounded-3xl bg-slate-800 border-4 border-slate-700/50 flex items-center justify-center text-4xl shadow-xl">
              {formData.logoUrl ? (
                <img src={formData.logoUrl} alt="Logo" className="w-full h-full object-cover rounded-2xl" />
              ) : (
                <span className="select-none">{formData.avatarPreset || '🦊'}</span>
              )}
            </div>
            <span className="absolute -bottom-1 -right-1 bg-blue-600 text-white p-1.5 rounded-xl text-xs font-black uppercase border-2 border-slate-900 shadow-sm">
              {profile?.role === 'super_admin' ? 'Admin' : (profile?.role?.replace('_', ' ') || 'STAFF')}
            </span>
          </div>

          <div className="text-center md:text-left flex-1 space-y-2">
            <div className="flex flex-col md:flex-row md:items-center gap-2">
              <h2 className="text-2xl md:text-3xl font-black tracking-tight">{formData.displayName || profile?.displayName || 'Sabush Member'}</h2>
              {profile?.role === 'super_admin' && (
                <span className="px-2 py-0.5 self-center text-[10px] font-black tracking-widest bg-blue-500 text-white rounded-full uppercase animate-pulse">
                  System Admin
                </span>
              )}
            </div>
            
            <p className="text-slate-300 font-bold text-sm flex flex-wrap items-center justify-center md:justify-start gap-3">
              <span className="flex items-center gap-1.5 bg-white/10 px-2.5 py-1 rounded-lg">
                <Briefcase size={14} className="text-blue-400" />
                {formData.title || 'Membro ERP'}
              </span>
              <span className="flex items-center gap-1.5 bg-white/10 px-2.5 py-1 rounded-lg">
                <Building size={14} className="text-emerald-400" />
                {formData.businessName || 'Sem Empresa Vinculada'}
              </span>
            </p>

            <p className="text-xs text-slate-400 font-medium">
              Conta ativa como <span className="text-slate-200">{profile?.email}</span> | Último login registado: {profile?.lastLogin ? new Date(profile.lastLogin).toLocaleString() : 'Recent'}
            </p>
          </div>
        </div>
      </div>

      {/* Grid Tabs panel & contents */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar Nav Buttons */}
        <div className="space-y-1.5">
          {[
            { id: 'profile', label: 'Dados Pessoais', desc: 'Edite o seu nome, bio e avatar', icon: UserIcon },
            { id: 'company', label: 'Identidade da Empresa', desc: 'Gerir logotipo, morada e dados', icon: Building },
            { id: 'storefront', label: 'Catálogo Storefront', desc: 'QR Code e partilha online', icon: QrCode },
            { id: 'logs', label: 'Histórico de Atividade', desc: 'Auditar segurança do perfil', icon: History }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "w-full text-left p-4 rounded-2xl border transition-all flex items-start gap-3 select-none",
                activeTab === tab.id 
                  ? "bg-white border-blue-500 shadow-md ring-4 ring-blue-50" 
                  : "bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50/50"
              )}
            >
              <div className={cn(
                "p-2.5 rounded-xl border shrink-0 mt-0.5",
                activeTab === tab.id 
                  ? "bg-blue-600 border-blue-600 text-white" 
                  : "bg-slate-50 border-slate-100 text-slate-500"
              )}>
                <tab.icon size={18} />
              </div>
              <div className="overflow-hidden">
                <p className={cn("text-xs font-black uppercase tracking-wider", activeTab === tab.id ? "text-slate-900" : "text-slate-700")}>
                  {tab.label}
                </p>
                <p className="text-[10px] text-slate-450 mt-0.5 truncate leading-tight">{tab.desc}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Tab content area */}
        <div className="lg:col-span-3">
          <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm min-h-[500px] flex flex-col">
            
            {/* TAB 1: PERSONAL DETAILS */}
            {activeTab === 'profile' && (
              <form onSubmit={handleSaveProfile} className="space-y-6 flex-1 flex flex-col justify-between">
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-black text-slate-900 uppercase tracking-tighter">Dados Pessoais & Configurações</h3>
                    <p className="text-sm text-slate-500">Mantenha as suas informações pessoais atualizadas para uma melhor colaboração institucional.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block px-1">Nome Completo (Display Name)</label>
                      <input 
                        type="text" 
                        required
                        className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-sm bg-slate-50 focus:bg-white transition-colors"
                        value={formData.displayName}
                        onChange={e => setFormData({ ...formData, displayName: e.target.value })}
                        placeholder="Ex: Isaías Abuch Mascenis"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block px-1">Cargo / Função</label>
                      <input 
                        type="text" 
                        className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-sm bg-slate-50 focus:bg-white transition-colors"
                        value={formData.title}
                        onChange={e => setFormData({ ...formData, title: e.target.value })}
                        placeholder="Ex: Diretor Geral / Gestor Financeiro"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block px-1">Telemóvel Pessoal</label>
                      <input 
                        type="tel" 
                        required
                        className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-sm bg-slate-50 focus:bg-white transition-colors"
                        value={formData.phoneNumber}
                        onChange={e => setFormData({ ...formData, phoneNumber: e.target.value })}
                        placeholder="Ex: +258 84 123 4567"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block px-1">Contacto Preferido para Alertas</label>
                      <select 
                        className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-sm bg-slate-50 focus:bg-white"
                        value={formData.preferredContact}
                        onChange={e => setFormData({ ...formData, preferredContact: e.target.value })}
                      >
                        <option value="email">E-mail Corporativo</option>
                        <option value="sms">SMS Clássico</option>
                        <option value="whatsapp">Notificação WhatsApp</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block px-1">Pequena Nota / Bio do Perfil</label>
                    <textarea 
                      rows={3}
                      className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium text-sm bg-slate-50 focus:bg-white transition-colors placeholder:font-normal"
                      value={formData.bio}
                      onChange={e => setFormData({ ...formData, bio: e.target.value })}
                      placeholder="Adicione uma breve nota pessoal ou profissional..."
                    />
                  </div>

                  {/* SUGGESTED OPTION: Profile Presets Avatar */}
                  <div className="space-y-2 border-t border-slate-100 pt-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block px-1">Escolher Emojivatar do Utilizador</label>
                    <p className="text-xs text-slate-500 mb-2">Este emoji será utilizado como o seu símbolo padrão caso não utilize um logotipo corporativo.</p>
                    <div className="flex flex-wrap gap-2.5">
                      {AVATAR_PRESETS.map(preset => (
                        <button
                          key={preset.char}
                          type="button"
                          onClick={() => setFormData({ ...formData, avatarPreset: preset.char })}
                          className={cn(
                            "w-11 h-11 text-2xl rounded-xl flex items-center justify-center border transition-all cursor-pointer active:scale-95",
                            preset.bg,
                            formData.avatarPreset === preset.char 
                              ? "ring-4 ring-blue-500/20 border-blue-500 scale-105" 
                              : "hover:scale-105 opacity-80"
                          )}
                          title={preset.label}
                        >
                          {preset.char}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* SUGGESTED OPTION: Profile Appearance Palette Choice */}
                  <div className="space-y-2 border-t border-slate-100 pt-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block px-1">Palete de Cor Preferida para Interface</label>
                    <div className="flex flex-wrap gap-3">
                      {THEME_PRESETS.map(theme => (
                        <button
                          key={theme.id}
                          type="button"
                          onClick={() => {
                            setFormData({ ...formData, themeColor: theme.id });
                            toast.success(`Paleta ${theme.name} selecionada para o seu utilizador!`);
                          }}
                          className={cn(
                            "flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all active:scale-95",
                            formData.themeColor === theme.id 
                              ? "bg-slate-900 text-white border-slate-900" 
                              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                          )}
                        >
                          <span className={cn("w-3 h-3 rounded-full shrink-0", theme.color)} />
                          <span>{theme.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Individual Authorization PIN for authorized roles */}
                  {(() => {
                    const userRole = profile?.role;
                    const isAuthorizedRole = userRole === 'owner' || userRole === 'business_owner' || userRole === 'manager' || userRole === 'admin' || userRole?.toLowerCase() === 'super_admin';
                    if (!isAuthorizedRole) return null;

                    return (
                      <div className="space-y-4 border-t border-slate-100 pt-6">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                            <ShieldCheck size={20} />
                          </div>
                          <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block font-sans">
                              PIN de Autorização Individual
                            </label>
                            <p className="text-xs text-slate-500 font-medium mt-0.5 leading-relaxed font-sans">
                              Como gerente/proprietário autorizado, este PIN de 4 a 6 dígitos permite-lhe autorizar localmente operações restritas (como remoção de faturas, despesas e estoque) executadas por caixas e outros colaboradores.
                            </p>
                          </div>
                        </div>
                        <div className="max-w-xs">
                          <input 
                            type="password"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={6}
                            className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono text-center tracking-[0.5em] text-lg font-bold bg-white"
                            placeholder="••••"
                            value={formData.authPin || ''}
                            onChange={e => setFormData({ ...formData, authPin: e.target.value.replace(/\D/g, '') })}
                          />
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* 2-Factor Authentication Advanced Settings Card */}
                <div className="bg-[#111111] p-6 rounded-3xl text-white shadow-xl flex flex-col md:flex-row items-center justify-between gap-5 mt-6 border border-amber-900/10">
                  <div className="flex items-start gap-4 text-left">
                    <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center shrink-0 border border-white/10">
                      <Lock className="text-amber-400" size={20} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-wider text-amber-400 font-mono">Segurança Corporativa</p>
                      <h4 className="font-extrabold text-[#FFFFFF] text-sm font-sans">Autenticação de Dois Fatores (2FA)</h4>
                      <p className="text-[10px] text-[#E9CC85] leading-relaxed font-semibold max-w-lg">
                        Proteja sua conta contra acessos não autorizados. Quando ativado, será exigido um código único de segurança para validar novas sessões de login no Sabush ERP.
                      </p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={formData.twoFactorEnabled || false}
                      onChange={e => setFormData({...formData, twoFactorEnabled: e.target.checked})}
                    />
                    <div className="w-9 h-5 bg-[#D4AF37] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                  </label>
                </div>

                <div className="pt-6 border-t border-slate-50 flex justify-end">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex items-center gap-2 bg-slate-900 text-white hover:bg-slate-800 px-6 py-3 rounded-2xl transition-all font-black text-xs uppercase tracking-widest shadow-lg active:scale-98 disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save size={16} />}
                    Guardar Perfil Pessoal
                  </button>
                </div>
              </form>
            )}

            {/* TAB 2: COMPANY ACCOUNT DETAILS */}
            {activeTab === 'company' && (
              <form onSubmit={handleSaveBusiness} className="space-y-6 flex-1 flex flex-col justify-between">
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-black text-slate-900 uppercase tracking-tighter">Identidade da Empresa & Logotipo</h3>
                    <p className="text-sm text-slate-500">Mantenha a imagem corporativa da sua loja sincronizada. Esta informação é impressa diretamente nas suas faturas e cotações.</p>
                  </div>

                  {/* Company Logo uploading widget */}
                  <div className="flex flex-col sm:flex-row items-center gap-4 bg-slate-50/50 p-4 border border-dashed border-slate-200 rounded-2xl">
                    <div className="w-16 h-16 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center overflow-hidden">
                      {formData.logoUrl ? (
                        <img src={formData.logoUrl} alt="Logo" className="w-full h-full object-cover" />
                      ) : (
                        <Building size={24} className="text-slate-400 animate-pulse" />
                      )}
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-xs font-extrabold text-slate-800">Logótipo Oficial da Empresa</p>
                      <p className="text-[10px] text-slate-500">PNG, JPG ou SVG recomendados. Limite de tamanho de 512KB.</p>
                      
                      <div className="flex items-center gap-2 pt-1.5">
                        <label className="px-3 py-1.5 bg-slate-950 hover:bg-slate-800 text-white text-[10px] font-black uppercase tracking-wider rounded-lg cursor-pointer transition-all">
                          Escolher Ficheiro
                          <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                        </label>
                        {formData.logoUrl && (
                          <button
                            type="button"
                            onClick={() => {
                              setFormData({ ...formData, logoUrl: '' });
                              toast.info("Removido logotipo da empresa no rascunho");
                            }}
                            className="px-2.5 py-1.5 text-slate-500 hover:text-red-500 border border-slate-200 hover:border-red-200 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all"
                          >
                            Remover
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block px-1">Nome Comercial do Negócio</label>
                      <input 
                        type="text" 
                        required
                        className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-sm bg-slate-50 focus:bg-white transition-colors"
                        value={formData.businessName}
                        onChange={e => setFormData({ ...formData, businessName: e.target.value })}
                        placeholder="Ex: Sabush Catering & Logística"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block px-1">Slogan / Tagline do Negócio</label>
                      <input 
                        type="text" 
                        className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-sm bg-slate-50 focus:bg-white transition-colors"
                        value={formData.businessTagline}
                        onChange={e => setFormData({ ...formData, businessTagline: e.target.value })}
                        placeholder="Ex: O melhor fornecimento em Moçambique"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block px-1">E-mail de Suporte / Comercial</label>
                      <input 
                        type="email" 
                        required
                        className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-sm bg-slate-50 focus:bg-white transition-colors"
                        value={formData.supportEmail}
                        onChange={e => setFormData({ ...formData, supportEmail: e.target.value })}
                        placeholder="Ex: vendas@empresa.com"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block px-1">Telefone / Hotline de Apoio</label>
                      <input 
                        type="tel" 
                        required
                        className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-sm bg-slate-50 focus:bg-white transition-colors"
                        value={formData.businessPhone}
                        onChange={e => setFormData({ ...formData, businessPhone: e.target.value })}
                        placeholder="Ex: +258 21 000 000"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block px-1">Moeda Corrente do Sistema (Trade Currency)</label>
                      <select 
                        className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-sm bg-slate-50 focus:bg-white"
                        value={formData.currency}
                        onChange={e => setFormData({ ...formData, currency: e.target.value })}
                      >
                        <option value="MZN">MZN - Metical Moçambicano (MT)</option>
                        <option value="USD">USD - United States Dollar ($)</option>
                        <option value="ZAR">ZAR - South African Rand (R)</option>
                        <option value="EUR">EUR - Euro (€)</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block px-1">Morada de Operações / Loja Física</label>
                      <input 
                        type="text" 
                        required
                        className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-blue-505 outline-none font-bold text-sm bg-slate-50 focus:bg-white transition-colors"
                        value={formData.businessAddress}
                        onChange={e => setFormData({ ...formData, businessAddress: e.target.value })}
                        placeholder="Ex: Av. Eduardo Mondlane, Prédio 20, Maputo"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-50 flex justify-end">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex items-center gap-2 bg-slate-900 text-white hover:bg-slate-800 px-6 py-3 rounded-2xl transition-all font-black text-xs uppercase tracking-widest shadow-lg active:scale-98 disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save size={16} />}
                    Guardar Identidade Empresarial
                  </button>
                </div>
              </form>
            )}

            {/* TAB 3: CUSTOMER PORTAL & OFFLINE PRINTABLE QR */}
            {activeTab === 'storefront' && (
              <div className="space-y-6 flex-1 flex flex-col justify-between">
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-black text-slate-900 uppercase tracking-tighter">Portal do Cliente & Catálogo Online Storefront</h3>
                    <p className="text-sm text-slate-500">Cada negócio do Sabush ERP recebe uma montra digital automática para produtos online e geração de orçamentos simples.</p>
                  </div>

                  {/* Gorgeous Live Preview links and Actions */}
                  <div className="p-5 border border-slate-100 rounded-2xl bg-slate-50/50 space-y-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <span className="text-[9px] font-black uppercase tracking-wider bg-blue-105 text-blue-600 px-2 py-0.5 rounded-md border border-blue-200">
                          Catálogo Digital Ativo
                        </span>
                        <p className="text-sm font-bold text-slate-800 break-all select-all font-mono pt-1.5">
                          {storefrontUrl}
                        </p>
                      </div>

                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={copyStorefrontLink}
                          className="p-2.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-slate-700 transition-all flex items-center justify-center shadow-sm"
                          title="Copiar Link"
                        >
                          <Copy size={16} />
                        </button>
                        <button
                          onClick={openStorefront}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-md shadow-blue-500/10"
                        >
                          <span>Visitar Montra</span>
                          <ExternalLink size={14} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Print / Promotional QR generator box */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch pt-4 border-t border-slate-100">
                    <div className="flex items-center justify-center p-6 border rounded-2xl bg-white border-slate-100 text-center shadow-sm">
                      <div className="space-y-3 flex flex-col items-center">
                        <div className="p-3 bg-slate-50 rounded-2xl border">
                          {qrCodeDataUrl ? (
                            <img 
                              src={qrCodeDataUrl} 
                              alt="Storefront QR Code" 
                              className="w-40 h-40 bg-white" 
                            />
                          ) : (
                            <div className="w-40 h-40 flex items-center justify-center bg-slate-50 text-slate-400 text-xs font-bold font-mono">
                              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                            </div>
                          )}
                        </div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                          Código QR do Catálogo Online
                        </p>
                        <div className="flex gap-2 mt-1 justify-center">
                          <button
                            type="button"
                            onClick={() => setQrColorOption('brand')}
                            className={cn(
                              "px-2 py-1 text-[9px] font-black uppercase tracking-wider rounded-lg border transition-all cursor-pointer",
                              qrColorOption === 'brand'
                                ? "bg-slate-900 text-white border-slate-900"
                                : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                            )}
                          >
                            Cor do Tema
                          </button>
                          <button
                            type="button"
                            onClick={() => setQrColorOption('black')}
                            className={cn(
                              "px-2 py-1 text-[9px] font-black uppercase tracking-wider rounded-lg border transition-all cursor-pointer",
                              qrColorOption === 'black'
                                ? "bg-slate-900 text-white border-slate-900"
                                : "bg-white text-slate-550 border-slate-200 hover:bg-slate-50"
                            )}
                          >
                            Preto Clássico
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 flex flex-col justify-center">
                      <h4 className="font-extrabold text-slate-900 flex items-center gap-2">
                        <Sparkles size={16} className="text-blue-500" />
                        Montra Física de Balcão (Promotional Kit)
                      </h4>
                      <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                        Ao imprimir ou expor este Código QR no seu balcão ou caixa registadora, os seus clientes presenciais podem digitalizar o código com os seus telemóveis para ver os artigos, encomendar ou solicitar cotações digitais instantaneamente no WhatsApp!
                      </p>
                      <div className="flex gap-3">
                        {qrCodeDataUrl ? (
                          <a 
                            href={qrCodeDataUrl}
                            download={`${formData.businessName || 'Sabush'}_Storefront_QR.png`}
                            className="flex items-center justify-center gap-1.5 bg-slate-900 border border-slate-800 text-white hover:bg-slate-800 px-4 py-2.5 rounded-xl transition-all font-bold text-xs shadow-md cursor-pointer select-none active:scale-95"
                          >
                            <Download size={14} />
                            Descarregar Imagem QR
                          </a>
                        ) : (
                          <button
                            disabled
                            className="flex items-center justify-center gap-1.5 bg-slate-100 border border-slate-200 text-slate-400 px-4 py-2.5 rounded-xl font-bold text-xs shadow-sm cursor-not-allowed"
                          >
                            <Loader2 className="w-4 h-4 animate-spin" />
                            A gerar QR...
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-emerald-50 rounded-2xl text-emerald-800 text-xs border border-emerald-100 flex items-center gap-2.5 mt-6">
                  <Info size={16} className="text-emerald-500 shrink-0" />
                  <span>Configurações completas para receber pagamentos e faturas digitais a partir deste catálogo podem ser ajustadas na aba de Configurações do Sistema.</span>
                </div>
              </div>
            )}

            {/* TAB 4: AUDIT SECURITY LOGS */}
            {activeTab === 'logs' && (
              <div className="space-y-6 flex-1 flex flex-col justify-between">
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-black text-slate-900 uppercase tracking-tighter">Histórico de Atividade & Segurança de Acesso</h3>
                    <p className="text-sm text-slate-500">Rastreie as suas atividades recentes no sistema. Ajuda a auditar quem realizou modificações de stock e faturamentos com as suas credenciais.</p>
                  </div>

                  {loadingLogs ? (
                    <div className="py-20 text-center space-y-3">
                      <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">A ler registos do Firebase...</p>
                    </div>
                  ) : logs.length > 0 ? (
                    <div className="border border-slate-100 rounded-2xl overflow-hidden bg-white">
                      <div className="divide-y divide-slate-100">
                        {logs.map((log) => (
                          <div key={log.id} className="p-4 flex items-start sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors text-xs font-sans">
                            <div className="flex items-center gap-3">
                              <span className={cn(
                                "px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-md",
                                log.action === 'LOGIN' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                                log.action?.includes('DELETE') ? 'bg-rose-50 text-rose-600 border border-rose-100' :
                                log.action?.includes('CREATE') ? 'bg-blue-50 text-blue-600 border border-blue-105' :
                                'bg-slate-50 text-slate-500 border border-slate-100'
                              )}>
                                {log.action?.replace('_', ' ')}
                              </span>
                              <div>
                                <p className="font-extrabold text-slate-900 text-sm leading-none pt-0.5">{log.details}</p>
                                <p className="text-[10px] text-slate-455 mt-1">{log.email} | ID: {log.id}</p>
                              </div>
                            </div>
                            <span className="text-[10px] text-slate-400 shrink-0 font-medium">
                              {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString() : new Date(log.timestamp).toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-20 border border-dashed rounded-3xl text-slate-400 space-y-2">
                      <History size={40} className="mx-auto opacity-30 animate-pulse" />
                      <div>
                        <p className="font-bold text-slate-700">Sem Registos Recentes</p>
                        <p className="text-xs text-slate-450 mt-1">Este perfil ainda não executou ações que exigissem auditoria restrita.</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-6 border-t border-slate-50 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <ShieldCheck size={14} className="text-emerald-500" />
                    Auditoria conformitária do Sabush System ERP
                  </span>
                  <button 
                    onClick={fetchLogs}
                    className="text-blue-600 hover:text-blue-700 font-bold uppercase tracking-wider"
                  >
                    Recarregar Registos
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
