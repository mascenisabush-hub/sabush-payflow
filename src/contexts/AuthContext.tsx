import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  User, 
  onAuthStateChanged, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  signOut, 
  signInWithPhoneNumber, 
  RecaptchaVerifier,
  ConfirmationResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from 'firebase/auth';
import { auth, googleProvider, db } from '../lib/firebase';
import { doc, onSnapshot, setDoc, updateDoc, serverTimestamp, collection, query, getDocs, limit } from 'firebase/firestore';
import { toast } from 'sonner';
import { logAction, ActionType } from '../lib/logger';
import { DEFAULT_RATES, fetchLiveExchangeRates } from '../lib/currencies';
import { sendWelcomeEmail, sendAdminNewUserAlert } from '../lib/emailService';
import { sendWelcomeWhatsApp } from '../lib/whatsappService';

const devLog = (...args: any[]) => {
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    console.log(...args);
  }
};

const devError = (...args: any[]) => {
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    console.error(...args);
  }
};

export interface AuthLog {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'warn' | 'error';
  event: string;
  description: string;
  details?: any;
}

interface AuthContextType {
  user: User | null;
  profile: any | null;
  businessData: any | null;
  loading: boolean;
  isAuthenticating: boolean;
  loginWithGoogle: () => Promise<void>;
  sendOtp: (phoneNumber: string, recaptchaId: string) => Promise<void>;
  confirmOtp: (otp: string) => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (email: string, pass: string) => Promise<void>;
  acceptTerms: () => Promise<void>;
  logout: () => Promise<void>;
  updateProfile?: (updates: Partial<any>) => Promise<void>;
  authLogs: AuthLog[];
  clearAuthLogs: () => void;
  addAuthLog: (type: 'info' | 'success' | 'warn' | 'error', event: string, description: string, details?: any) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [businessData, setBusinessData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);

  const [authLogs, setAuthLogs] = useState<AuthLog[]>([]);

  const addAuthLog = (type: 'info' | 'success' | 'warn' | 'error', event: string, description: string, details?: any) => {
    const newLog: AuthLog = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.' + String(Date.now() % 1000).padStart(3, '0'),
      type,
      event,
      description,
      details
    };
    setAuthLogs(prev => [newLog, ...prev].slice(0, 50));
    if (type === 'error') {
      devError(`[AUTH DIAGNOSTIC] ${event}: ${description}`, details);
    } else {
      devLog(`[AUTH DIAGNOSTIC] ${event}: ${description}`, details);
    }
  };

  const clearAuthLogs = () => {
    setAuthLogs([]);
    addAuthLog('info', 'LOGS_CLEARED', 'Histórico de diagnóstico limpo pelo utilizador.');
  };

  useEffect(() => {
    addAuthLog('info', 'PROVIDER_INIT', 'Inicializando serviço de autenticação Sabush ERP...');
    // Check redirect results on mount
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          addAuthLog('success', 'REDIRECT_LOGIN_SUCCESS', `Sessão iniciada via redirecionamento Google para: ${result.user.email}`, { email: result.user.email });
          toast.success("Sessão iniciada com redirecionamento!");
        } else {
          addAuthLog('info', 'AUTH_MOUNT_CHECK', 'Inicialização concluída. Nenhum redirecionamento pendenete detetado do Google Auth.');
        }
      })
      .catch((error) => {
        addAuthLog('error', 'REDIRECT_LOGIN_ERROR', `Membro falhou a autenticação de redirecionamento: ${error.message || String(error)}`, { code: error.code });
        if (error.code === 'auth/unauthorized-domain') {
          toast.error("Este domínio não está autorizado no console Firebase para pop-ups ou redirecionamento de login.");
        }
      });
  }, []);

  useEffect(() => {
    let demoSession = false;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        demoSession = window.localStorage.getItem('sabush_demo_session') === 'true';
      }
    } catch (e) {
      console.warn("Could not read sabush_demo_session from localStorage", e);
    }

    if (demoSession) {
      const mockUser = {
        uid: 'demo_user_123',
        email: 'mascenisabush@gmail.com',
        displayName: 'Gestor Sabush Demo',
        phoneNumber: '+263777123456',
        emailVerified: true
      } as any;
      
      const mockProfile = {
        uid: 'demo_user_123',
        email: 'mascenisabush@gmail.com',
        displayName: 'Gestor Sabush Demo',
        phoneNumber: '+263777123456',
        role: 'super_admin',
        accountStatus: 'active',
        termsAccepted: true,
        preferredLanguage: 'pt',
        businessId: 'demo_business_123',
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      };

      const mockBusiness = {
        id: 'demo_business_123',
        name: 'Sabush SME Demo',
        address: 'Rua de Luanda, Zimbabwe',
        logoUrl: '',
        brandColor: '#2563EB',
        paymentTerms: 'IMMEDIATE',
        paymentInstructions: 'Transferência Bancária Directa',
        currency: 'USD',
        subscriptionPlan: 'enterprise',
        subscriptionStatus: 'active',
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString()
      };

      setUser(mockUser);
      setProfile(mockProfile);
      setBusinessData(mockBusiness);
      setLoading(false);
      return;
    }

    let unsubProfile: (() => void) | undefined;
    let unsubBiz: (() => void) | undefined;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      // Clear previous listeners
      if (unsubProfile) unsubProfile();
      if (unsubBiz) unsubBiz();

      if (currentUser) {
        addAuthLog('info', 'FIREBASE_AUTH_STATE_CHANGED', `Sessão ativa detetada para o utilizador: ${currentUser.email || currentUser.phoneNumber || currentUser.uid}`, {
          uid: currentUser.uid,
          email: currentUser.email,
          emailVerified: currentUser.emailVerified,
          phoneNumber: currentUser.phoneNumber
        });
        setLoading(true);
        try {
          addAuthLog('info', 'PROFILE_SYNC_START', `Iniciando sincronização automática do perfil no Firestore para o UID: ${currentUser.uid}...`);
          unsubProfile = onSnapshot(doc(db, 'users', currentUser.uid), async (userDoc) => {
            try {
              if (userDoc.exists()) {
                const profileData = { ...userDoc.data() };
                addAuthLog('success', 'PROFILE_SYNC_SUCCESS', `Perfil do utilizador carregado com sucesso do Firestore. Função: ${profileData.role || 'Nenhuma'}.`);
                
                // Auto-assign super_admin if email matches
                if (currentUser.email === 'mascenisabush@gmail.com' && profileData.role !== 'super_admin') {
                  addAuthLog('info', 'ROLE_ELEVATION', `O e-mail coincide com o Super Administrador. Atualizando função de utilizador para "super_admin"...`);
                  await updateDoc(doc(db, 'users', currentUser.uid), { role: 'super_admin' });
                  profileData.role = 'super_admin';
                }

                if (profileData.role === 'super_admin' && !profileData.businessId) {
                  addAuthLog('info', 'SUPER_ADMIN_BUSINESS_LOOKUP', `Super Administrador sem ID de empresa. Procurando empresa ativa no Firestore...`);
                  try {
                    const businessesSnap = await getDocs(query(collection(db, 'businesses'), limit(1)));
                    if (!businessesSnap.empty) {
                      profileData.businessId = businessesSnap.docs[0].id;
                      addAuthLog('info', 'SUPER_ADMIN_BUSINESS_BOUND', `Ligando o Super Administrador à empresa existente: ${profileData.businessId}`);
                    } else {
                      profileData.businessId = 'demo_business_123';
                      addAuthLog('warn', 'SUPER_ADMIN_BUSINESS_EMPTY', `Nenhuma empresa ativa no Firestore para ligar. Utilizando fallback demo_business_123.`);
                    }
                  } catch (bizErr: any) {
                    addAuthLog('warn', 'SUPER_ADMIN_BUSINESS_ERROR', `Falha ao pesquisar empresas para Super Administrador. Utilizando fallback de demonstração.`, { error: bizErr.message || String(bizErr) });
                    profileData.businessId = 'demo_business_123';
                  }
                }
                
                setProfile(profileData);

                // STEP 2: FIX THE ROOT CAUSE - onboardingCompleted automatic correction
                // If they are not super_admin, have a businessId but onboardingCompleted flag is missing or false, auto set to true in Firestore.
                const isUserAdmin = profileData.role?.toLowerCase() === 'super_admin';
                if (!isUserAdmin && profileData.businessId && !profileData.onboardingCompleted) {
                  addAuthLog('info', 'AUTO_COMPLETE_ONBOARDING', `onboardingCompleted flag missing for existing business user. Setting to true automatically...`);
                  try {
                    await updateDoc(doc(db, 'users', currentUser.uid), { onboardingCompleted: true });
                    profileData.onboardingCompleted = true;
                  } catch (updateErr: any) {
                    console.error("Failed to automatically update onboardingCompleted flag:", updateErr);
                  }
                }

                if (profileData.businessId) {
                  addAuthLog('info', 'BUSINESS_SYNC_START', `Iniciando sincronização dos dados da empresa: ${profileData.businessId}...`);
                  unsubBiz = onSnapshot(doc(db, 'businesses', profileData.businessId), (bizDoc) => {
                    if (bizDoc.exists()) {
                      addAuthLog('success', 'BUSINESS_SYNC_SUCCESS', `Dados da empresa sincronizados: ${bizDoc.data().name || 'Sem Nome'}. Moeda: ${bizDoc.data().currency || 'USD'}`);
                      setBusinessData(bizDoc.data());
                    } else {
                      addAuthLog('warn', 'BUSINESS_SYNC_NOT_FOUND', `AVISO: O documento da empresa "${profileData.businessId}" não existe na base de dados Firestore. Isto forçará redirecionamento ao Onboarding.`, { businessId: profileData.businessId });
                    }
                  }, (bizError) => {
                    addAuthLog('error', 'BUSINESS_SYNC_ERROR', `Falha ao subscrever dados da empresa no Firestore: ${bizError.message}`, { code: bizError.code });
                    console.warn("Gracefully handled business profile sync onSnapshot error:", bizError);
                  });
                } else {
                  const isUserAdmin = profileData.role?.toLowerCase() === 'super_admin';
                  if (!isUserAdmin) {
                    addAuthLog('warn', 'MISSING_BUSINESS_ID_REDIRECT', `AVISO DE REDIRECIONAMENTO: O perfil de utilizador existe mas NÃO possui "businessId". Isto indica registo incompleto e causará o redirecionamento imediato para a configuração de empresa / Onboarding.`, { uid: currentUser.uid });
                  }
                }
              } else {
                addAuthLog('warn', 'MISSING_PROFILE_REDIRECT', `AVISO DE REDIRECIONAMENTO: Nenhum perfil de utilizador encontrado no Firestore para o ID: ${currentUser.uid}. Trata-se de uma conta nova ou apagada. O sistema irá redirecionar para a configuração inicial (Onboarding).`);
                
                // Create default profile for first-time login
                const isSuperAdmin = currentUser.email === 'mascenisabush@gmail.com';
                const newProfile: any = {
                  uid: currentUser.uid,
                  email: currentUser.email || '',
                  displayName: currentUser.displayName || '',
                  phoneNumber: currentUser.phoneNumber || '',
                  role: isSuperAdmin ? 'super_admin' : 'business_owner',
                  accountStatus: 'active', // Automatic entry to all users by default
                  termsAccepted: false,
                  preferredLanguage: 'en',
                  createdAt: new Date().toISOString(),
                  lastLogin: new Date().toISOString()
                };

                if (isSuperAdmin) {
                  try {
                    const businessesSnap = await getDocs(query(collection(db, 'businesses'), limit(1)));
                    if (!businessesSnap.empty) {
                      newProfile.businessId = businessesSnap.docs[0].id;
                    } else {
                      newProfile.businessId = 'demo_business_123';
                    }
                  } catch (bizErr) {
                    newProfile.businessId = 'demo_business_123';
                  }
                }

                addAuthLog('info', 'PROFILE_CREATION_START', `Criando novo perfil padrão em "users/${currentUser.uid}"...`);
                await setDoc(doc(db, 'users', currentUser.uid), newProfile);
                addAuthLog('success', 'PROFILE_CREATION_SUCCESS', `Perfil básico de utilizador registado com sucesso para ${currentUser.email || currentUser.uid}.`);
                setProfile(newProfile);

                // Send automatic welcome message and access link
                try {
                  const loginLink = typeof window !== 'undefined' ? window.location.origin : 'https://sabush-erp.web.app';
                  if (currentUser.email) {
                    sendWelcomeEmail(currentUser.email, currentUser.displayName || currentUser.email, loginLink)
                      .catch(e => console.error("Async welcome email error:", e));

                    // Send automatic sign up email alert to Admin
                    const adminEmail = 'mascenisabush@gmail.com';
                    sendAdminNewUserAlert(adminEmail, currentUser.email, currentUser.displayName || '', newProfile.role || 'business_owner')
                      .catch(e => console.warn("Admin sign up email notification failure:", e));
                  }
                  if (currentUser.phoneNumber) {
                    sendWelcomeWhatsApp(currentUser.phoneNumber, currentUser.displayName || currentUser.email || 'Gestor', loginLink)
                      .catch(e => console.error("Async welcome whatsapp error:", e));
                  }
                } catch (errWelcome) {
                  console.error("Welcome notification failed:", errWelcome);
                }

                await logAction(currentUser.uid, currentUser.email || '', ActionType.LOGIN, "First time login / account created");
              }
            } catch (snapError: any) {
              const errMsg = snapError?.message || String(snapError);
              addAuthLog('error', 'PROFILE_SNAPSHOT_PROCESSING_ERROR', `Erro de processamento dos dados lidos: ${errMsg}`, { error: snapError });
              console.error("Error initializing user session documents:", snapError);
              toast.error("Falha ao inicializar a sessão do usuário: " + errMsg);
            } finally {
              setLoading(false);
            }
          }, (error: any) => {
            const errMsg = error?.message || String(error);
            addAuthLog('error', 'PROFILE_SYNC_PERMISSION_ERROR', `Falha na sincronização do perfil. Erro Firestore: ${errMsg}`, { code: error.code });
            console.error("Profile sync error:", error);
            if (errMsg.toLowerCase().includes("permission") || errMsg.toLowerCase().includes("insufficient")) {
              toast.error("Erro de permissões no Firestore: Seu perfil de usuário está restrito ou não pôde ser lido. Se for uma nova conta, prossiga para Criar Empresa (Onboarding).", { duration: 10000 });
            } else {
              toast.error("Falha na sincronização de perfil: " + errMsg);
            }
            setLoading(false);
          });
        } catch (error: any) {
          addAuthLog('error', 'AUTH_OBSERVER_INTERNAL_ERROR', `Falha interna no observador de sessão: ${error.message || String(error)}`);
          console.error("Auth status error:", error);
          setLoading(false);
        }
      } else {
        addAuthLog('info', 'FIREBASE_AUTH_SIGNED_OUT', 'Nenhum utilizador ativo detetado no Firebase Auth. Permitindo acesso à página de entrada.');
        setProfile(null);
        setBusinessData(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      if (unsubProfile) unsubProfile();
      if (unsubBiz) unsubBiz();
    };
  }, []);

  async function withTimeout<T>(promise: Promise<T>, timeoutMs: number = 60000): Promise<T> {
    let timeoutId: any;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        const error = new Error("auth/timeout");
        (error as any).code = "auth/timeout";
        reject(error);
      }, timeoutMs);
    });
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  const getAuthErrorMessagePt = (code: string, fallbackMessage: string): string => {
    switch (code) {
      case 'auth/timeout':
        return "O processo de login expirou ou está demorando muito. Se estiver acessando o app dentro de uma janela integrada (iFrame), o navegador pode estar bloqueando cookies de terceiros. Por favor, clique em 'Problemas ao entrar? Clique aqui para abrir em nova aba' ou entre usando o 'Modo de Teste' verde para bypassar localmente offline.";
      case 'auth/invalid-credential':
        return "E-mail ou senha incorretos. Por favor, revise suas credenciais ou crie uma conta caso seja um novo usuário.";
      case 'auth/operation-not-allowed':
        return "Método de autenticação (ex: Telefone, E-mail ou Google) está desativado no Firebase. Ative o respectivo provedor no console em Authentication > Sign-in method.";
      case 'auth/email-already-in-use':
        return "Este endereço de e-mail já está sendo utilizado por outra conta. Tente fazer login em vez de criar conta.";
      case 'auth/invalid-email':
        return "O endereço de e-mail fornecido é inválido. Verifique o formato do e-mail.";
      case 'auth/user-disabled':
        return "Esta conta de usuário foi desativada temporária ou permanentemente.";
      case 'auth/user-not-found':
        return "Não existe nenhum usuário registrado com este e-mail. Caso ainda não tenha cadastro, mude para 'Criar Conta' abaixo.";
      case 'auth/wrong-password':
        return "Senha incorreta. Por favor, verifique suas credenciais e tente novamente.";
      case 'auth/weak-password':
        return "A senha escolhida é muito fraca. Ela deve possuir no mínimo 6 caracteres.";
      case 'auth/popup-blocked':
        return "O pop-up de login foi bloqueado pelo seu navegador. Por favor, ative pop-ups no seu navegador ou tente o botão de Modo de Teste abaixo.";
      case 'auth/popup-closed-by-user':
        return "A janela de login do Google foi fechada antes de finalizar o processo de autenticação.";
      case 'auth/unauthorized-domain':
        return "Este domínio não está autorizado no console de Autenticação do Firebase. Você precisa adicionar este endereço de website na seção 'Domínios Autorizados' nas configurações de autenticação do seu painel Firebase.";
      case 'auth/network-request-failed':
        return "Falha de conexão com a rede/Firebase. Verifique seu sinal de internet e tente novamente.";
      case 'auth/invalid-verification-code':
        return "Código de verificação de celular inválido. Tente novamente.";
      default:
        return fallbackMessage || "Ocorreu um erro ao processar a solicitação de login.";
    }
  };

  const loginWithGoogle = async () => {
    devLog("AuthContext: loginWithGoogle invoked");
    setIsAuthenticating(true);
    try {
      devLog("AuthContext: Calling signInWithPopup(auth, googleProvider)...");
      const result = await withTimeout(signInWithPopup(auth, googleProvider), 120000);
      devLog("AuthContext: Google sign in direct popup success for user:", result.user.email);
      toast.success("Sessão iniciada com sucesso!");
    } catch (error: any) {
      console.error("AuthContext: Google login failed", error);
      
      if (error.code === 'auth/unauthorized-domain') {
        const message = "Domínio não autorizado para pop-up. Tentando autenticação por redirecionamento de página...";
        toast.info(message);
        devLog("AuthContext: Falling back to signInWithRedirect...");
        try {
          await signInWithRedirect(auth, googleProvider);
        } catch (redirectError: any) {
          console.error("AuthContext: signInWithRedirect also failed", redirectError);
          toast.error("O login por redirecionamento de página também falhou: " + (redirectError.message || String(redirectError)));
        }
        return;
      }

      // If popup blocker blocked the popup, or popup closed, try fallback to redirect
      if (error.code === 'auth/popup-blocked' || error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
        const message = "O pop-up de login foi bloqueado ou fechado pelo navegador. Tentando redirecionamento de página...";
        toast.info(message);
        devLog("AuthContext: Falling back to signInWithRedirect due to blocked/closed popup...");
        try {
          await signInWithRedirect(auth, googleProvider);
        } catch (redirectError: any) {
          console.error("AuthContext: signInWithRedirect fallback failed", redirectError);
          toast.error("O login por redirecionamento também falhou: " + (redirectError.message || String(redirectError)));
        }
        return;
      }

      const message = getAuthErrorMessagePt(error.code, "Falha ao iniciar sessão com Google.");
      toast.error(`${message} (${error.code || error.message})`);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const sendOtp = async (phoneNumber: string, recaptchaId: string) => {
    setIsAuthenticating(true);
    try {
      // Clear previously instantiated RecaptchaVerifier to prevent dual-render errors
      if ((window as any).recaptchaVerifier) {
        try {
          (window as any).recaptchaVerifier.clear();
        } catch (e) {
          console.warn("Cleared existing recaptcha verifier:", e);
        }
        (window as any).recaptchaVerifier = null;
      }

      const container = document.getElementById(recaptchaId);
      if (container) {
        container.innerHTML = '';
      }

      const verifier = new RecaptchaVerifier(auth, recaptchaId, {
        size: 'invisible'
      });
      (window as any).recaptchaVerifier = verifier;

      const result = await signInWithPhoneNumber(auth, phoneNumber, verifier);
      setConfirmationResult(result);
      toast.success("Código enviado com sucesso para o seu telefone!");
    } catch (error: any) {
      console.error("Phone auth failed", error);
      const message = getAuthErrorMessagePt(error.code, "Falha ao enviar o código para o celular.");
      toast.error(message);
      setIsAuthenticating(false);
      throw error;
    } finally {
      setIsAuthenticating(false);
    }
  };

  const confirmOtp = async (otp: string) => {
    if (!confirmationResult) throw new Error("No confirmation result found");
    setIsAuthenticating(true);
    try {
      await confirmationResult.confirm(otp);
      toast.success("Sessão iniciada com sucesso!");
      setConfirmationResult(null);
    } catch (error: any) {
      console.error("OTP verification failed", error);
      const message = getAuthErrorMessagePt(error.code, "Código inválido. Tente novamente.");
      toast.error(message);
      throw error;
    } finally {
      setIsAuthenticating(false);
    }
  };

  const loginWithEmail = async (email: string, pass: string) => {
    setIsAuthenticating(true);
    addAuthLog('info', 'EMAIL_LOGIN_START', `Iniciando tentativa de início de sessão por e-mail para: ${email}...`);
    try {
      await withTimeout(signInWithEmailAndPassword(auth, email, pass), 60000);
      addAuthLog('success', 'EMAIL_LOGIN_FIREBASE_SUCCESS', `Firebase Autenticador aceitou as credenciais para ${email}. Aguardando sincronização de perfil do Firestore.`);
      toast.success("Sessão iniciada com sucesso!");
    } catch (error: any) {
      addAuthLog('error', 'EMAIL_LOGIN_FAILED', `Falha ao iniciar sessão no Firebase: ${error.message || error.code}`, { code: error.code, message: error.message });
      const message = getAuthErrorMessagePt(error.code, "Erro ao fazer login. Verifique seus dados.");
      toast.error(message);
      throw error;
    } finally {
      setIsAuthenticating(false);
    }
  };

  const registerWithEmail = async (email: string, pass: string) => {
    setIsAuthenticating(true);
    addAuthLog('info', 'EMAIL_REGISTER_START', `Iniciando criação de nova conta / registo por e-mail para: ${email}...`);
    try {
      await withTimeout(createUserWithEmailAndPassword(auth, email, pass), 60000);
      addAuthLog('success', 'EMAIL_REGISTER_FIREBASE_SUCCESS', `Utilizador registado com sucesso no Firebase Auth: ${email}`);
      toast.success("Conta criada com sucesso!");
    } catch (error: any) {
      addAuthLog('error', 'EMAIL_REGISTER_FAILED', `Erro ao registar utilizador no Firebase: ${error.message || error.code}`, { code: error.code });
      const message = getAuthErrorMessagePt(error.code, "Erro ao criar conta.");
      toast.error(message);
      throw error;
    } finally {
      setIsAuthenticating(false);
    }
  };

  const acceptTerms = async () => {
    if (!user) return;
    addAuthLog('info', 'TERMS_ACCEPT_START', `A aceitar termos de serviço para o utilizador: ${user.uid}`);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        termsAccepted: true,
        termsAcceptedAt: serverTimestamp()
      });
      addAuthLog('success', 'TERMS_ACCEPTED', `Termos de serviço aceites com sucesso.`);
      await logAction(user.uid, user.email || '', ActionType.TERMS_ACCEPTED, "User accepted platform terms & conditions");
      toast.success("Termos aceites. Bem-vindo à plataforma!");
    } catch (error: any) {
      addAuthLog('error', 'TERMS_ACCEPT_ERROR', `Falha ao aceitar termos no Firestore: ${error.message || String(error)}`);
      toast.error("Erro ao aceitar os termos");
    }
  };

  const updateProfile = async (updates: Partial<any>) => {
    if (!profile) return;
    addAuthLog('info', 'UPDATE_PROFILE_START', `Atualizando perfil de utilizador: ${JSON.stringify(updates)}`);
    const updatedProfile = { ...profile, ...updates };
    setProfile(updatedProfile);

    if (user && user.uid !== 'demo_user_123') {
      try {
        const { doc, updateDoc } = await import('firebase/firestore');
        const { db } = await import('../lib/firebase');
        await updateDoc(doc(db, 'users', user.uid), updates);
        addAuthLog('success', 'UPDATE_PROFILE_SUCCESS', 'Perfil atualizado com sucesso no Firestore.');
      } catch (err: any) {
        addAuthLog('error', 'UPDATE_PROFILE_ERROR', `Falha ao gravar atualização de perfil no Firestore: ${err.message}`);
        console.error("Failed to update profile in firestore:", err);
      }
    }
  };

  const logout = async () => {
    addAuthLog('info', 'LOGOUT_START', 'Iniciando encerramento de sessão...');
    try {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem('sabush_demo_session');
        }
      } catch (e) {
        console.warn("Could not remove sabush_demo_session", e);
      }
      if (user && user.uid !== 'demo_user_123') {
        await logAction(user.uid, user.email || '', ActionType.LOGOUT, "User logged out");
      }
      await signOut(auth);
      setUser(null);
      setProfile(null);
      setBusinessData(null);
      addAuthLog('success', 'LOGOUT_SUCCESS', 'Dispositivo desconectado com sucesso do Firebase Auth. Estado de sessão limpo.');
      toast.success("Sessão encerrada");
    } catch (error: any) {
      addAuthLog('error', 'LOGOUT_ERROR', `Erro durante o logout: ${error.message}`);
      toast.error("Erro ao sair");
    }
  };

  // Auto-fetch exchange rates daily
  useEffect(() => {
    let active = true;
    if (!businessData || !profile?.businessId || profile?.businessId.startsWith('demo_')) return;

    const syncRates = async () => {
      const lastUpdatedStr = businessData.exchangeRatesUpdatedAt;
      const ratesExist = businessData.exchangeRates && Object.keys(businessData.exchangeRates).length > 0;
      
      let isExpired = true;
      if (lastUpdatedStr && ratesExist) {
        const lastUpdated = new Date(lastUpdatedStr);
        // Expired if older than 24 hours
        isExpired = (Date.now() - lastUpdated.getTime()) > 24 * 60 * 60 * 1000;
      }

      if (isExpired) {
        try {
          const fetched = await fetchLiveExchangeRates();
          if (active) {
            await updateDoc(doc(db, 'businesses', profile.businessId), {
              exchangeRates: fetched.rates,
              exchangeRatesUpdatedAt: fetched.timestamp
            });
          }
        } catch (err) {
          console.warn("Could not auto-update exchange rates in Firestore:", err);
        }
      }
    };

    const timer = setTimeout(() => {
      syncRates();
    }, 4000);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [profile?.businessId, businessData?.exchangeRatesUpdatedAt, businessData?.exchangeRates]);

  const resolvedBusinessData = React.useMemo(() => {
    if (!businessData) return null;
    const baseRates = businessData.exchangeRates || DEFAULT_RATES;
    return { 
      ...businessData, 
      currency: businessData.currency || 'MZN',
      secondaryCurrency: businessData.secondaryCurrency || '',
      exchangeRates: baseRates,
      exchangeRatesUpdatedAt: businessData.exchangeRatesUpdatedAt || ''
    };
  }, [businessData]);

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      businessData: resolvedBusinessData, 
      loading, 
      isAuthenticating, 
      loginWithGoogle, 
      sendOtp,
      confirmOtp,
      loginWithEmail,
      registerWithEmail,
      acceptTerms,
      logout,
      updateProfile,
      authLogs,
      clearAuthLogs,
      addAuthLog
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
