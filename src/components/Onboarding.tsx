import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, setDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { 
  Globe, Check, Sparkles, Zap, LogOut, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { AFRICAN_COUNTRIES, AfricanCountryConfig } from '../lib/africanCountries';
import { useTranslation } from 'react-i18next';
import { TermsModal } from './TermsModal';

const timezoneToCountryCode: Record<string, string> = {
  'Africa/Maputo': 'MZ',
  'Africa/Luanda': 'AO',
  'Africa/Nairobi': 'KE',
  'Africa/Johannesburg': 'ZA',
  'Africa/Harare': 'ZW',
  'Africa/Lagos': 'NG',
  'Africa/Cairo': 'EG',
  'Africa/Casablanca': 'MA',
  'Africa/Tunis': 'TN',
  'Africa/Algiers': 'DZ',
  'Africa/Addis_Ababa': 'ET',
  'Africa/Dar_es_Salaam': 'TZ',
  'Africa/Kampala': 'UG',
  'Africa/Kigali': 'RW',
  'Africa/Bujumbura': 'BI',
  'Africa/Mogadishu': 'SO',
  'Africa/Windhoek': 'NA',
  'Africa/Gaborone': 'BW',
  'Africa/Maseru': 'LS',
  'Africa/Mbabane': 'SZ',
  'Africa/Lusaka': 'ZM',
  'Africa/Lilongwe': 'MW',
  'Africa/Kinshasa': 'CD',
  'Africa/Brazzaville': 'CG',
  'Africa/Libreville': 'GA',
  'Africa/Malabo': 'GQ',
  'Africa/Yaounde': 'CM',
  'Africa/Bangui': 'CF',
  'Africa/N_Djamena': 'TD',
  'Africa/Niamey': 'NE',
  'Africa/Bamako': 'ML',
  'Africa/Ouagadougou': 'BF',
  'Africa/Abidjan': 'CI',
  'Africa/Accra': 'GH',
  'Africa/Lome': 'TG',
  'Africa/Cotonou': 'BJ',
  'Africa/Freetown': 'SL',
  'Africa/Monrovia': 'LR',
  'Africa/Conakry': 'GN',
  'Africa/Bissau': 'GW',
  'Africa/Dakar': 'SN',
  'Africa/Banjul': 'GM',
  'Africa/Nouakchott': 'MR',
  'Africa/Tripoli': 'LY',
  'Indian/Antananarivo': 'MG',
  'Indian/Port_Louis': 'MU',
  'Indian/Mahe': 'SC',
  'Indian/Comoro': 'KM'
};

export default function Onboarding() {
  const { user, logout } = useAuth();
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [termsModalTab, setTermsModalTab] = useState<'terms' | 'privacy'>('terms');
  const [loading, setLoading] = useState(false);
  const { t, i18n } = useTranslation();

  // WECLOME SETUP / REGIONAL SETTINGS STATE
  const [selectedCountry, setSelectedCountry] = useState<AfricanCountryConfig | null>(null);
  const [searchCountryQuery, setSearchCountryQuery] = useState('');
  const [showCountryChoices, setShowCountryChoices] = useState(false);

  const [regionalLanguage, setRegionalLanguage] = useState<'pt' | 'en' | 'fr' | 'ar' | 'sw' | 'af'>('pt');
  const [regionalCurrency, setRegionalCurrency] = useState('MZN');
  const [regionalCurrencySymbol, setRegionalCurrencySymbol] = useState('MT');
  const [regionalDateFormat, setRegionalDateFormat] = useState('DD/MM/YYYY');
  const [regionalNumberFormat, setRegionalNumberFormat] = useState<'1,250.00' | '1.250,00' | '1 250,00'>('1.250,00');
  const [regionalTaxLabel, setRegionalTaxLabel] = useState('IVA');
  const [regionalTaxRate, setRegionalTaxRate] = useState(17);
  const [regionalPhoneCode, setRegionalPhoneCode] = useState('+258');
  const [regionalMobileMoneyOptions, setRegionalMobileMoneyOptions] = useState<string[]>([]);
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Auto-detection of region on mount
  useEffect(() => {
    const navLang = navigator.language || '';
    const parts = navLang.split('-');
    const langCountryCode = parts[1] ? parts[1].toUpperCase() : '';

    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    
    let detectedCC = timezoneToCountryCode[timeZone] || langCountryCode;

    let country = AFRICAN_COUNTRIES.find(c => c.code === detectedCC);

    if (!country) {
      const tzCity = timeZone.split('/').pop()?.replace('_', ' ') || '';
      if (tzCity) {
        country = AFRICAN_COUNTRIES.find(c => 
          c.name.toLowerCase().includes(tzCity.toLowerCase())
        );
      }
    }

    // Default to Mozambique (MZ) if no country detected or found
    if (!country) {
      country = AFRICAN_COUNTRIES.find(c => c.code === 'MZ') || AFRICAN_COUNTRIES[0];
    }

    if (country) {
      setSelectedCountry(country);
      setSearchCountryQuery(country.name);
      
      setRegionalLanguage(country.defaultLanguage);
      setRegionalCurrency(country.currencyCode);
      setRegionalCurrencySymbol(country.currencySymbol);
      setRegionalDateFormat(country.dateFormat);
      setRegionalNumberFormat(country.numberFormat);
      setRegionalTaxLabel(country.taxLabel);
      setRegionalTaxRate(country.taxRate);
      setRegionalPhoneCode(country.phoneCountryCode);
      setRegionalMobileMoneyOptions(country.mobileMoneyOptions);

      i18n.changeLanguage(country.defaultLanguage);
    }
  }, [i18n]);

  const executeCompleteOnboarding = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 14);

      const businessNameDefault = user?.displayName ? `${user.displayName} Estabelecimento` : "Sabush System Comércio";

      const regionalSettingsObj = {
        country: selectedCountry?.name || '',
        countryCode: selectedCountry?.code || '',
        language: regionalLanguage,
        currencyCode: regionalCurrency,
        currencySymbol: regionalCurrencySymbol,
        dateFormat: regionalDateFormat,
        numberFormat: regionalNumberFormat,
        taxLabel: regionalTaxLabel,
        taxRate: Number(regionalTaxRate) || 0,
        phoneCountryCode: regionalPhoneCode,
        mobileMoneyOptions: regionalMobileMoneyOptions,
        updatedAt: new Date().toISOString()
      };

      const businessDataToSave = {
        name: businessNameDefault,
        ownerId: user.uid,
        currency: regionalCurrency,
        nuit: '',
        phone: regionalPhoneCode + ' ',
        address: '',
        subscriptionPlan: 'basico',
        subscriptionStatus: 'trial',
        trialEndsAt: trialEndsAt.toISOString(),
        subscription: {
          plan: 'basico',
          status: 'trial',
          startDate: new Date().toISOString(),
          endDate: trialEndsAt.toISOString()
        },
        whatsappToken: '',
        whatsappPhoneId: '',
        enableAutoInvoicing: true,
        enableAutoDebtReminders: true,
        enableAutoLowStock: true,
        enableDailyReport: true,
        regionalSettings: regionalSettingsObj,
        createdAt: serverTimestamp()
      };

      const businessRef = await addDoc(collection(db, 'businesses'), businessDataToSave);
      const businessId = businessRef.id;

      // Save regional settings in subdocument processes
      await setDoc(doc(db, 'businesses', businessId, 'regional_settings', 'settings'), regionalSettingsObj);

      // Finally save user profile with onboardingCompleted: true
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: user.email || null,
        phoneNumber: user.phoneNumber || null,
        displayName: user.displayName || null,
        role: 'business_owner',
        businessId: businessId,
        preferredLanguage: regionalLanguage,
        termsAccepted: true,
        termsAcceptedAt: serverTimestamp(),
        accountStatus: 'active',
        onboardingCompleted: true,
        createdAt: serverTimestamp()
      });

      toast.success("Excelente! O seu ecossistema Sabush System ERP está totalmente pronto.");
      window.location.reload();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'users/onboarding-wizard');
      toast.error("Falha ao configurar a sua conta. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      style={{ background: '#B8791A', minHeight: '100vh' }}
      className="w-full text-slate-100 flex items-center justify-center p-4 md:p-8 font-sans overflow-y-auto relative antialiased selection:bg-orange-500 selection:text-white"
    >
      {/* Background overlay shapes */}
      <div className="absolute top-1/4 left-10 w-96 h-96 bg-[#178F82]/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-10 w-96 h-96 bg-purple-500/5 rounded-full blur-[100px] pointer-events-none" />

      <div 
        style={{
          background: 'rgba(15, 23, 42, 0.75)',
          border: '1px solid rgba(99, 153, 34, 0.3)',
          borderRadius: '24px',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)'
        }}
        className="w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col md:flex-row relative z-10 my-6 animate-in fade-in duration-300"
      >
        {/* LEFT PANEL */}
        <div className="w-full md:w-80 bg-[#0F172A]/40 border-b md:border-b-0 md:border-r border-white/10 p-6 flex flex-col justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-6 pointer-events-none">
              <Zap className="text-[#639922] animate-pulse" size={24} />
              <span className="font-extrabold text-sm tracking-wider uppercase text-white">Sabush System ERP</span>
            </div>

            <div className="space-y-4">
              <h2 className="text-xl font-black text-white tracking-tight leading-snug">Configuração do Sistema</h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Bem-vindo ao Sabush ERP! O sistema foi desenhado de forma autónoma e inteligente para responder à sua localização regional.
              </p>
            </div>

            <div className="mt-8">
              <div className="flex items-center gap-3.5 p-3 rounded-2xl border bg-[#3B6D11]/20 border-[#639922]/40 text-white shadow-lg shadow-[#3B6D11]/5">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border bg-[#3B6D11]/20 border-[#639922] text-[#639922] animate-pulse">
                  <Globe size={16} />
                </div>
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-mono tracking-widest uppercase text-slate-500 leading-none">Passo Único</span>
                    <span className="text-[8px] bg-blue-500/20 border border-blue-500/30 text-blue-400 px-1.5 py-0.5 rounded font-black uppercase animate-pulse">Ativo</span>
                  </div>
                  <p className="text-xs font-bold text-white mt-1">Regionalização</p>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-[#1f294d]/60 mt-6 md:mt-0 flex items-center justify-between">
            <button 
              onClick={logout}
              className="text-slate-400 hover:text-white text-[10px] font-black uppercase tracking-widest bg-[#151a3a]/40 hover:bg-[#1a214b] p-3 rounded-xl transition-all flex items-center gap-2 cursor-pointer w-full justify-center border border-[#222c54]/60"
            >
              <LogOut size={12} />
              Terminar Sessão
            </button>
          </div>
        </div>

        {/* RIGHT PANEL - REGIONAL STEP */}
        <div className="flex-1 p-6 md:p-10 flex flex-col justify-between">
          <div className="space-y-6 flex-1">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="text-yellow-400" size={18} />
                <h3 className="text-lg font-black text-white">Localização e Setup Regional</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Confirme ou altere as configurações abaixo para calibrar automaticamente a faturação, regras de taxas tributárias, formato de dados, e processadores móveis locais para a sua empresa.
              </p>
            </div>

            {/* Country Selector Dropdown */}
            <div className="space-y-2 relative">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">Selecione o seu País *</label>
              <div className="relative">
                <input 
                  type="text"
                  placeholder="Pesquise por nome do país (Ex: Moçambique, Angola, Quénia...)"
                  value={searchCountryQuery}
                  onChange={(e) => {
                    setSearchCountryQuery(e.target.value);
                    setShowCountryChoices(true);
                  }}
                  onFocus={() => setShowCountryChoices(true)}
                  className="w-full p-4 bg-[#0C2624] border border-[#1f294d] rounded-2xl text-xs text-white outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                />
                <Globe size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>

              {showCountryChoices && (
                <div className="absolute left-0 right-0 mt-2 max-h-56 overflow-y-auto bg-[#0d122b] border border-[#1f294d] rounded-2xl shadow-xl z-50 divide-y divide-[#1f294d]/50 custom-scrollbar">
                  {AFRICAN_COUNTRIES.filter(c => 
                    c.name.toLowerCase().includes(searchCountryQuery.toLowerCase()) ||
                    c.code.toLowerCase().includes(searchCountryQuery.toLowerCase())
                  ).map(c => (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => {
                        setSelectedCountry(c);
                        setSearchCountryQuery(c.name);
                        setShowCountryChoices(false);
                        
                        setRegionalLanguage(c.defaultLanguage);
                        setRegionalCurrency(c.currencyCode);
                        setRegionalCurrencySymbol(c.currencySymbol);
                        setRegionalDateFormat(c.dateFormat);
                        setRegionalNumberFormat(c.numberFormat);
                        setRegionalTaxLabel(c.taxLabel);
                        setRegionalTaxRate(c.taxRate);
                        setRegionalPhoneCode(c.phoneCountryCode);
                        setRegionalMobileMoneyOptions(c.mobileMoneyOptions);

                        i18n.changeLanguage(c.defaultLanguage);
                        toast.success(`Definições de ${c.flag} ${c.name} carregadas! 🌐`);
                      }}
                      className="w-full text-left p-3.5 hover:bg-blue-600/10 text-xs text-slate-200 hover:text-white flex items-center gap-3 transition-colors cursor-pointer"
                    >
                      <span className="text-lg">{c.flag}</span>
                      <span className="font-bold">{c.name}</span>
                      <span className="ml-auto text-[10px] font-mono font-bold text-slate-400 tracking-wider bg-[#1a214b] px-2 py-0.5 rounded uppercase">{c.currencyCode}</span>
                    </button>
                  ))}
                  {AFRICAN_COUNTRIES.filter(c => 
                    c.name.toLowerCase().includes(searchCountryQuery.toLowerCase())
                  ).length === 0 && (
                    <div className="p-4 text-center text-xs text-slate-500 font-medium font-sans">Nenhum país africano encontrado.</div>
                  )}
                </div>
              )}
            </div>

            {/* CONFIRMATION CARD */}
            {selectedCountry && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-5 bg-blue-500/5 border border-blue-500/20 rounded-[24px] space-y-4"
              >
                <h4 className="text-xs font-black uppercase text-blue-400 tracking-widest flex items-center gap-2">
                  <span>{selectedCountry.flag}</span> Parâmetros Localizados Auto-Detetados
                  <span className="bg-blue-500 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-full border border-blue-400 uppercase">Auto-detectado</span>
                </h4>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-[#0d122b] border border-[#1f294d]/60 rounded-xl">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Idioma Principal</p>
                    <p className="text-xs font-extrabold text-white mt-1">
                      {regionalLanguage === 'pt' ? 'Português' :
                       regionalLanguage === 'en' ? 'English' :
                       regionalLanguage === 'fr' ? 'Français' :
                       regionalLanguage === 'ar' ? 'العربية (Arabic)' :
                       regionalLanguage === 'sw' ? 'Kiswahili' : 'Afrikaans'}
                    </p>
                  </div>
                  
                  <div className="p-3 bg-[#0d122b] border border-[#1f294d]/60 rounded-xl">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Moeda & Símbolo</p>
                    <p className="text-xs font-extrabold text-white mt-1">{regionalCurrency} ({regionalCurrencySymbol})</p>
                  </div>

                  <div className="p-3 bg-[#0d122b] border border-[#1f294d]/60 rounded-xl">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Imposto Padrão</p>
                    <p className="text-xs font-extrabold text-white mt-1">{regionalTaxLabel} {regionalTaxRate}%</p>
                  </div>

                  <div className="p-3 bg-[#0d122b] border border-[#1f294d]/60 rounded-xl">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Formato / Prefixo</p>
                    <p className="text-xs font-extrabold text-white mt-1">{regionalPhoneCode} ({regionalDateFormat})</p>
                  </div>
                </div>

                {/* Overrides / Customization */}
                <div className="border-t border-[#1f294d]/50 pt-4 space-y-3">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider leading-none">Ajustar Definições Recomendadas (Opcional)</p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div className="space-y-1">
                      <label className="block text-[10px] text-slate-450 font-bold uppercase">Idioma</label>
                      <select 
                        value={regionalLanguage}
                        onChange={(e) => {
                          const lang = e.target.value as any;
                          setRegionalLanguage(lang);
                          i18n.changeLanguage(lang);
                        }}
                        className="w-full p-2.5 bg-[#0e132e] border border-[#1f294d] rounded-xl text-xs text-white outline-none font-bold focus:ring-2 focus:ring-blue-500/30"
                      >
                        <option value="pt">Português (PT)</option>
                        <option value="en">English (EN)</option>
                        <option value="fr">Français (FR)</option>
                        <option value="ar">العربية (AR)</option>
                        <option value="sw">Kiswahili (SW)</option>
                        <option value="af">Afrikaans (AF)</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[10px] text-slate-450 font-bold uppercase">Moeda Base</label>
                      <input 
                        type="text"
                        value={regionalCurrency}
                        onChange={(e) => setRegionalCurrency(e.target.value.toUpperCase())}
                        className="w-full p-2.5 bg-[#0e132e] border border-[#1f294d] rounded-xl text-xs text-white outline-none font-bold text-center uppercase focus:ring-2 focus:ring-blue-500/30"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[10px] text-slate-450 font-bold uppercase">Símbolo</label>
                      <input 
                        type="text"
                        value={regionalCurrencySymbol}
                        onChange={(e) => setRegionalCurrencySymbol(e.target.value)}
                        className="w-full p-2.5 bg-[#0e132e] border border-[#1f294d] rounded-xl text-xs text-white outline-none font-bold text-center focus:ring-2 focus:ring-blue-500/30"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[10px] text-slate-450 font-bold uppercase">Prefixo Telefónico</label>
                      <input 
                        type="text"
                        value={regionalPhoneCode}
                        onChange={(e) => setRegionalPhoneCode(e.target.value)}
                        className="w-full p-2.5 bg-[#0e132e] border border-[#1f294d] rounded-xl text-xs text-white outline-none font-bold text-center text-blue-400 focus:ring-2 focus:ring-blue-500/30"
                      />
                    </div>
                  </div>

                  <div className="mt-3 space-y-1.5 pt-1">
                    <p className="block text-[10px] text-slate-450 font-extrabold uppercase tracking-widest">Mobile Money Disponíveis</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedCountry.mobileMoneyOptions.map(option => {
                        const isChecked = regionalMobileMoneyOptions.includes(option);
                        return (
                          <button
                            key={option}
                            type="button"
                            onClick={() => {
                              if (isChecked) {
                                setRegionalMobileMoneyOptions(prev => prev.filter(item => item !== option));
                              } else {
                                setRegionalMobileMoneyOptions(prev => [...prev, option]);
                              }
                            }}
                            className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-xl border transition-all cursor-pointer ${
                              isChecked 
                                ? 'bg-blue-600/20 border-blue-500/50 text-blue-400 shadow-lg'
                                : 'bg-[#151a37]/50 border-[#1f294d] text-slate-400 hover:text-white'
                            }`}
                          >
                            {option}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Terms acceptance checkbox */}
            <div className="p-4 bg-white/5 rounded-2xl border border-white/10 flex items-start gap-3 text-left">
              <input 
                type="checkbox" 
                id="termsOnb"
                checked={termsAccepted}
                onChange={e => setTermsAccepted(e.target.checked)}
                className="mt-1 w-5 h-5 rounded bg-white/10 text-[#3B6D11] focus:ring-[#3B6D11] border-white/20"
              />
              <label htmlFor="termsOnb" className="text-xs text-slate-300 font-bold leading-relaxed cursor-pointer select-none">
                Eu aceito os{" "}
                <button 
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setTermsModalTab('terms');
                    setIsTermsOpen(true);
                  }}
                  className="text-blue-400 hover:underline cursor-pointer font-bold bg-transparent border-none p-0 inline align-baseline"
                >
                  Termos e Condições
                </button>{" "}
                de utilização e licença comercial de software do Sabush System ERP Moçambique Lda.
              </label>
            </div>
          </div>

          {/* Navigation Control buttons at the bottom */}
          <div className="border-t border-[#1f294d] pt-6 mt-8 flex flex-row justify-end items-center gap-4 shrink-0">
            <button
              type="button"
              disabled={loading || !termsAccepted || !selectedCountry}
              onClick={executeCompleteOnboarding}
              className="px-6 py-3.5 bg-[#B8791A] text-white text-xs font-black uppercase tracking-widest rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#B8791A]/10 cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed border border-[#B8791A]/20 min-w-[220px]"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={14} />
                  <span>A Ativar Sistema...</span>
                </>
              ) : (
                <>
                  <Check size={14} className="stroke-[3]" />
                  <span>Confirmar e Entrar</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <TermsModal isOpen={isTermsOpen} onClose={() => setIsTermsOpen(false)} defaultTab={termsModalTab} />
    </div>
  );
}
