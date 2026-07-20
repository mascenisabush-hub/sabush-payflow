import React, { useState, useEffect } from 'react';
import { db, storage, handleFirestoreError, OperationType } from '../lib/firebase';
import { ref, uploadBytes, getDownloadURL, uploadBytesResumable, deleteObject } from 'firebase/storage';
import { collection, query, onSnapshot, updateDoc, doc, getDocs, where, deleteDoc, orderBy, limit, addDoc, serverTimestamp, getDoc, setDoc } from 'firebase/firestore';
import imageCompression from 'browser-image-compression';
import { 
  Users, Building2, CreditCard, TrendingUp, AlertTriangle, Eye,
  Search, Filter, MoreVertical, CheckCircle2, XCircle, 
  Clock, Package, ShoppingCart, DollarSign, Activity,
  Globe, Shield, MessageSquare, Ban, UserCheck, UserX,
  History, LayoutDashboard, Bell, Plus, Trash2, Mail, Phone, Calendar,
  Upload, Image as ImageIcon, Loader2, Sparkles, FileText, Laptop, Send, Zap,
  ChevronLeft, ChevronRight, Download, CheckSquare, Square, FileSpreadsheet
} from 'lucide-react';
import { cn, compressLogoImage } from '../lib/utils';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { logAction, ActionType } from '../lib/logger';
import { useAuth } from '../contexts/AuthContext';
import Skeleton from './ui/Skeleton';
import { sendEmailNotification } from '../lib/emailService';
import { sendSubscriptionStatusWhatsApp } from '../lib/whatsappService';


type AdminTab = 'overview' | 'users' | 'businesses' | 'owners' | 'proofs' | 'logs' | 'branding';

export default function SuperAdminPanel() {
  const { user: currentUser, profile } = useAuth();
  const isBrandManager = profile?.superAdmin === true || currentUser?.email === 'mascenisabush@gmail.com';
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [businesses, setBusinesses] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);

  // Background removal states
  const [originalPreviewUrl, setOriginalPreviewUrl] = useState<string | null>(null);
  const [processedPreviewUrl, setProcessedPreviewUrl] = useState<string | null>(null);
  const [bgRemovalStatus, setBgRemovalStatus] = useState<'idle' | 'processing' | 'success' | 'failed'>('idle');
  const [bgRemovalError, setBgRemovalError] = useState<string | null>(null);
  const [lastUploadedFile, setLastUploadedFile] = useState<File | null>(null);
  const [beforeSizeKB, setBeforeSizeKB] = useState<number | null>(null);
  const [afterSizeKB, setAfterSizeKB] = useState<number | null>(null);
  const [brandingPreviewMode, setBrandingPreviewMode] = useState<'login' | 'navbar' | 'invoice'>('login');
  const [previewLogoSource, setPreviewLogoSource] = useState<'active' | 'new'>('active');

  // Subscriptions proof approval states
  const [proofs, setProofs] = useState<any[]>([]);
  const [selectedProofForAction, setSelectedProofForAction] = useState<any | null>(null);
  const [rejectionNotes, setRejectionNotes] = useState<string>('');
  const [isRejecting, setIsRejecting] = useState(false);
  const [enlargedScreenshot, setEnlargedScreenshot] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalBusinesses: 0,
    totalUsers: 0,
    activeUsers: 0,
    suspendedUsers: 0,
    pendingUsers: 0,
    totalMzn: 0,
    registrationsToday: 0
  });
  const [loading, setLoading] = useState(true);
  const [logoLoading, setLogoLoading] = useState(false);
  const [platformLogoUrl, setPlatformLogoUrl] = useState<string | null>(null);
  const [platformName, setPlatformName] = useState('Sabush System');
  const [platformSlogan, setPlatformSlogan] = useState('Sabor & Gestão');
  const [primaryColor, setPrimaryColor] = useState('royal-blue');
  const [loginWelcomeText, setLoginWelcomeText] = useState('Gerencie o seu negócio de forma extremamente profissional, automatizada e segura.');
  const [supportPhone, setSupportPhone] = useState('+244 923 123 456');
  const [customDomain, setCustomDomain] = useState('erp.sabush.com');
  const [autoBgRemoval, setAutoBgRemoval] = useState(false);
  const [isSavingBranding, setIsSavingBranding] = useState(false);
  const [campaignSubject, setCampaignSubject] = useState('Novidades Incríveis no Sabush ERP! 🚀');
  const [campaignBody, setCampaignBody] = useState('Olá Parceiro,\n\nTemos o prazer de anunciar novas funcionalidades que já se encontram ativas no seu painel:\n- Rebranding dinâmico do logotipo e temas visuais\n- Gestão avançada de contas sob aprovação instantânea\n- Otimização de velocidade e segurança nas comunicações por e-mail\n\nQualquer dúvida, fale com a nossa equipe de suporte!');
  const [campaignTarget, setCampaignTarget] = useState<'all' | 'active' | 'developers'>('all');
  const [isSendingCampaign, setIsSendingCampaign] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [bizSearchTerm, setBizSearchTerm] = useState('');
  const [ownerSearchTerm, setOwnerSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Advanced Scalable User Management States (Capacity 1000+ users)
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [userPage, setUserPage] = useState<number>(1);
  const [userPageSize, setUserPageSize] = useState<number>(10);
  const [bulkActionRole, setBulkActionRole] = useState<string>('business_owner');
  const [isApplyingBulkAction, setIsApplyingBulkAction] = useState<boolean>(false);

  const [isCreatingBusiness, setIsCreatingBusiness] = useState(false);
  const [newBizName, setNewBizName] = useState('');
  const [newBizOwnerId, setNewBizOwnerId] = useState('');
  const [newBizPlan, setNewBizPlan] = useState('basico');
  const [newBizCurrency, setNewBizCurrency] = useState('MZN');

  // Deletion Modal States
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteType, setDeleteType] = useState<'user' | 'business' | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteTargetName, setDeleteTargetName] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState<string>('rules_non_compliance');
  const [deleteCustomDetail, setDeleteCustomDetail] = useState<string>('');

  // Suspension Modal States
  const [suspendTargetId, setSuspendTargetId] = useState<string | null>(null);
  const [suspendTargetEmail, setSuspendTargetEmail] = useState<string | null>(null);
  const [suspendTargetName, setSuspendTargetName] = useState<string | null>(null);
  const [suspensionReason, setSuspensionReason] = useState<string>('rules_non_compliance');
  const [suspensionEmailBody, setSuspensionEmailBody] = useState<string>('');
  const [isSuspending, setIsSuspending] = useState(false);

  const handleCreateBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBizName.trim()) {
      toast.error("Por favor, introduza o nome do negócio.");
      return;
    }
    if (!newBizOwnerId.trim()) {
      toast.error("Por favor, introduza o ID do proprietário.");
      return;
    }

    try {
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 14);

      const businessPayload = {
        name: newBizName.trim(),
        ownerId: newBizOwnerId.trim(),
        currency: newBizCurrency,
        subscriptionPlan: newBizPlan,
        subscriptionStatus: 'active',
        trialEndsAt: trialEndsAt.toISOString(),
        subscription: {
          plan: newBizPlan,
          status: 'active',
          startDate: new Date().toISOString(),
          endDate: trialEndsAt.toISOString()
        },
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'businesses'), businessPayload);
      
      await logAction(
        currentUser?.uid || 'admin', 
        currentUser?.email || 'admin@sabush.com', 
        ActionType.UPDATE_SUBSCRIPTION, 
        `Admin manually created new business: ${newBizName.trim()} with plan ${newBizPlan}`
      );

      toast.success(`Empresa "${newBizName.trim()}" criada com sucesso!`);
      
      setNewBizName('');
      setNewBizOwnerId('');
      setNewBizPlan('basico');
      setIsCreatingBusiness(false);
    } catch (err: any) {
      toast.error(`Erro ao criar empresa: ${err.message || err}`);
    }
  };

  const convertImageToPng = (imageFile: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          
          // Downscale to max 400px width/height while keeping aspect ratio
          let width = img.width;
          let height = img.height;
          const maxDimension = 400;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error("Não foi possível obter o contexto 2D do canvas."));
            return;
          }
          
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error("Falha ao converter imagem para Blob."));
            }
          }, 'image/png');
        };
        img.onerror = (err) => reject(new Error("Falha ao carregar a imagem para conversão."));
        img.src = e.target?.result as string;
      };
      reader.onerror = (err) => reject(new Error("Falha ao ler o ficheiro da imagem."));
      reader.readAsDataURL(imageFile);
    });
  };

  const uploadFileToFirebase = async (fileToUpload: File | Blob, mimeType: string): Promise<string> => {
    const fileToBase64 = (file: File | Blob): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            resolve(reader.result);
          } else {
            reject(new Error("Falha ao converter imagem para base64"));
          }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
    };

    try {
      setUploadProgress(15);
      
      // Attempt Firebase Storage write with a 1s timeout to guard against hangs/missing storage configuration
      const storageUploadPromise = (async (): Promise<string> => {
        const storageRef = ref(storage, 'platform/branding/logo');
        setUploadProgress(35);
        const snapshot = await uploadBytes(storageRef, fileToUpload, { contentType: mimeType });
        setUploadProgress(65);
        const downloadURL = await getDownloadURL(snapshot.ref);
        return downloadURL;
      })();

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Search/Connection Timeout")), 15000);
      });

      let finalLogoURL = '';
      try {
        finalLogoURL = await Promise.race([storageUploadPromise, timeoutPromise]);
        console.log("Uploaded successfully to Firebase Storage!");
      } catch (storageErr) {
        console.warn("Storage upload failed or timed out. Storing securely in Firestore as Base64 fallback:", storageErr);
        setUploadProgress(75);
        finalLogoURL = await fileToBase64(fileToUpload);
      }

      setUploadProgress(85);
      await setDoc(doc(db, 'platform', 'branding'), {
        logoURL: finalLogoURL,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      setPlatformLogoUrl(finalLogoURL);
      setUploadProgress(100);
      
      try {
        await logAction(
          currentUser?.uid || 'admin', 
          currentUser?.email || 'admin@sabush.com', 
          ActionType.UPDATE_SUBSCRIPTION, 
          `Super Admin updated platform branding logo`
        );
      } catch (logErr) {
        console.warn("Failed to log logo update:", logErr);
      }

      return finalLogoURL;
    } catch (error: any) {
      console.error("Branding update helper failed:", error);
      throw error;
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const acceptedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'];
    if (!acceptedTypes.includes(file.type)) {
      toast.error("Formato inválido. Apenas PNG, JPG, JPEG, SVG ou WEBP são aceites.");
      return;
    }

    const maxSize = 2 * 1024 * 1024; // 2MB
    if (file.size > maxSize) {
      toast.error("Ficheiro demasiado grande. Máximo permitido: 2MB");
      return;
    }

    setLogoLoading(true);
    setUploadProgress(0);
    setBgRemovalStatus('processing');
    setBgRemovalError(null);
    setLastUploadedFile(file);
    setPreviewLogoSource('new');

    // Create and set original preview URL
    const origUrl = URL.createObjectURL(file);
    setOriginalPreviewUrl(origUrl);
    setProcessedPreviewUrl(null);

    const beforeSize = Math.round(file.size / 1024);
    setBeforeSizeKB(beforeSize);

    // If it's an SVG file, skip background removal/compression entirely
    if (file.type === 'image/svg+xml') {
      try {
        setBgRemovalStatus('success');
        setProcessedPreviewUrl(origUrl);
        setAfterSizeKB(beforeSize);
        await uploadFileToFirebase(file, file.type);
        toast.success("Logo (SVG) carregado com sucesso!");
      } catch (err: any) {
        toast.error(`Falha ao carregar: ${err.message || err}`);
      } finally {
        setLogoLoading(false);
      }
      return;
    }

    try {
      // Compress/resize utilizing the new reusable helper - targeting 80KB/256px maximum for lightning fast Firestore/Storage transfer
      const result = await compressLogoImage(file, 80 * 1024, 256);
      
      setBeforeSizeKB(result.beforeSizeKB);
      setAfterSizeKB(result.afterSizeKB);

      const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || 'logo';
      const fileExt = result.mimeType === 'image/png' ? 'png' : 'jpg';
      const fileToUpload = new File([result.blob], `${nameWithoutExt}.${fileExt}`, { type: result.mimeType });
      
      const processedUrl = URL.createObjectURL(result.blob);
      setProcessedPreviewUrl(processedUrl);

      setBgRemovalStatus('success');
      await uploadFileToFirebase(fileToUpload, result.mimeType);
      toast.success("Logo optimizado e carregado com sucesso!");
    } catch (err: any) {
      console.error("Logo upload/conversion error:", err);
      setBgRemovalStatus('failed');
      setBgRemovalError(err.message || err);
      toast.error(`Falha ao converter ou carregar o logo: ${err.message || err}`);
    } finally {
      setLogoLoading(false);
    }
  };

  const handleRetryBgRemoval = async () => {
    if (!lastUploadedFile) return;

    setLogoLoading(true);
    setUploadProgress(0);
    setBgRemovalStatus('processing');
    setBgRemovalError(null);
    setProcessedPreviewUrl(null);

    const beforeSize = Math.round(lastUploadedFile.size / 1024);
    setBeforeSizeKB(beforeSize);

    if (lastUploadedFile.type === 'image/svg+xml') {
      try {
        setBgRemovalStatus('success');
        setProcessedPreviewUrl(originalPreviewUrl);
        setAfterSizeKB(beforeSize);
        await uploadFileToFirebase(lastUploadedFile, lastUploadedFile.type);
        toast.success("Logo (SVG) recarregado com sucesso!");
      } catch (err: any) {
        toast.error(`Falha ao carregar: ${err.message || err}`);
      } finally {
        setLogoLoading(false);
      }
      return;
    }

    try {
      // Compress/resize utilizing the new reusable helper - targeting 80KB/256px maximum for lightning fast Firestore/Storage transfer
      const result = await compressLogoImage(lastUploadedFile, 80 * 1024, 256);
      
      setBeforeSizeKB(result.beforeSizeKB);
      setAfterSizeKB(result.afterSizeKB);

      const nameWithoutExt = lastUploadedFile.name.substring(0, lastUploadedFile.name.lastIndexOf('.')) || 'logo';
      const fileExt = result.mimeType === 'image/png' ? 'png' : 'jpg';
      const fileToUpload = new File([result.blob], `${nameWithoutExt}.${fileExt}`, { type: result.mimeType });
      
      const processedUrl = URL.createObjectURL(result.blob);
      setProcessedPreviewUrl(processedUrl);

      setBgRemovalStatus('success');
      await uploadFileToFirebase(fileToUpload, result.mimeType);
      toast.success("Logo optimizado e carregado com sucesso!");
    } catch (err: any) {
      console.error("Retry upload/conversion error:", err);
      setBgRemovalStatus('failed');
      setBgRemovalError(err.message || err);
      toast.error(`Falha ao carregar o logo na nova tentativa: ${err.message || err}`);
    } finally {
      setLogoLoading(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!confirm("Tem a certeza que deseja remover o logo personalizado e repor o padrão de fábrica?")) return;
    setLogoLoading(true);
    try {
      const storageRef = ref(storage, 'platform/branding/logo');
      try {
        await deleteObject(storageRef);
      } catch (storageErr) {
        console.warn("File was not found in storage or already deleted:", storageErr);
      }

      await setDoc(doc(db, 'platform', 'branding'), {
        logoURL: null,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      setPlatformLogoUrl(null);
      setOriginalPreviewUrl(null);
      setProcessedPreviewUrl(null);
      setBgRemovalStatus('idle');
      setLastUploadedFile(null);
      setPreviewLogoSource('active');
      toast.success("Logo removido. A imagem padrão está a ser usada.");

      await logAction(
        currentUser?.uid || 'admin', 
        currentUser?.email || 'admin@sabush.com', 
        ActionType.UPDATE_SUBSCRIPTION, 
        `Super Admin reset platform branding logo`
      );
    } catch (err: any) {
      console.error(err);
      toast.error(`Erro ao remover logo: ${err.message || err}`);
    } finally {
      setLogoLoading(false);
    }
  };

  const handleSaveAdvancedBranding = async () => {
    setIsSavingBranding(true);
    try {
      await setDoc(doc(db, 'platform', 'branding'), {
        platformName: platformName.trim(),
        platformSlogan: platformSlogan.trim(),
        primaryColor,
        loginWelcomeText: loginWelcomeText.trim(),
        supportPhone: supportPhone.trim(),
        customDomain: customDomain.trim(),
        autoBgRemoval,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      await logAction(
        currentUser?.uid || 'admin',
        currentUser?.email || 'admin@sabush.com',
        ActionType.UPDATE_SUBSCRIPTION,
        `Super Admin updated advanced platform branding settings (Theme: ${primaryColor}, Name: ${platformName})`
      );

      toast.success("Definições avançadas de branding guardadas com sucesso!");
    } catch (err: any) {
      toast.error(`Erro ao guardar branding: ${err.message || err}`);
    } finally {
      setIsSavingBranding(false);
    }
  };

  const handleSendMarketingCampaign = async () => {
    if (!campaignSubject.trim() || !campaignBody.trim()) {
      toast.error("Por favor, preencha o assunto e o corpo do e-mail.");
      return;
    }
    setIsSendingCampaign(true);
    let targetEmails: string[] = [];

    if (campaignTarget === 'all') {
      targetEmails = users.map(u => u.email).filter(Boolean);
    } else if (campaignTarget === 'active') {
      targetEmails = users.filter(u => u.accountStatus === 'active').map(u => u.email).filter(Boolean);
    } else {
      targetEmails = ['mascenisabush@gmail.com', 'suporte@sabush.com'];
    }

    // Deduplicate emails to avoid double send in test view
    targetEmails = Array.from(new Set(targetEmails));

    if (targetEmails.length === 0) {
      toast.error("Nenhum destinatário encontrado com o filtro selecionado.");
      setIsSendingCampaign(false);
      return;
    }

    try {
      for (const email of targetEmails) {
        await sendEmailNotification(email, campaignSubject.trim(), campaignBody.trim());
      }

      await logAction(
        currentUser?.uid || 'admin',
        currentUser?.email || 'admin@sabush.com',
        ActionType.UPDATE_SUBSCRIPTION,
        `Super Admin sent promotional/update campaign "${campaignSubject}" to ${targetEmails.length} clients (${campaignTarget})`
      );

      toast.success(`Campanha enviada com sucesso para ${targetEmails.length} destinatários! 🎉`);
    } catch (err: any) {
      toast.error(`Erro ao disparar e-mails da campanha: ${err.message || err}`);
    } finally {
      setIsSendingCampaign(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    
    // Listen for platform branding changes in real-time
    const unsubBranding = onSnapshot(doc(db, 'platform', 'branding'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setPlatformLogoUrl(data?.logoURL || null);
        if (data?.platformName) setPlatformName(data.platformName);
        if (data?.platformSlogan) setPlatformSlogan(data.platformSlogan);
        if (data?.primaryColor) setPrimaryColor(data.primaryColor);
        if (data?.loginWelcomeText) setLoginWelcomeText(data.loginWelcomeText);
        if (data?.supportPhone) setSupportPhone(data.supportPhone);
        if (data?.customDomain) setCustomDomain(data.customDomain);
        if (data?.autoBgRemoval !== undefined) setAutoBgRemoval(data.autoBgRemoval);
      } else {
        setPlatformLogoUrl(null);
      }
    }, (error) => {
      console.warn("Error streaming platform branding:", error);
    });

    // Listen for businesses
    const unsubBiz = onSnapshot(collection(db, 'businesses'), (snapshot) => {
      const bizData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setBusinesses(bizData);
      
      const active = bizData.filter((b: any) => b.subscriptionStatus === 'active').length;
      const revenue = active * 1000;
      setStats(prev => ({ ...prev, totalBusinesses: bizData.length, totalMzn: revenue }));
    }, (error) => {
      console.warn("Gracefully handled super admin businesses onSnapshot error:", error);
    });

    // Listen for users
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const userData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUsers(userData);
      
      const active = userData.filter((u: any) => u.accountStatus === 'active').length;
      const suspended = userData.filter((u: any) => u.accountStatus === 'suspended').length;
      const pending = userData.filter((u: any) => u.accountStatus === 'pending').length;
      
      // Calculate registrations today
      const today = new Date().toISOString().split('T')[0];
      const registrationsToday = userData.filter((u: any) => {
        if (!u.createdAt) return false;
        let dateString = '';
        if (typeof u.createdAt.toDate === 'function') {
          dateString = u.createdAt.toDate().toISOString();
        } else if (u.createdAt instanceof Date) {
          dateString = u.createdAt.toISOString();
        } else if (typeof u.createdAt === 'string') {
          dateString = u.createdAt;
        } else if (typeof u.createdAt === 'object' && u.createdAt.seconds) {
          dateString = new Date(u.createdAt.seconds * 1000).toISOString();
        }
        return dateString.startsWith(today);
      }).length;

      setStats(prev => ({ 
         ...prev, 
         totalUsers: userData.length, 
         activeUsers: active, 
         suspendedUsers: suspended, 
         pendingUsers: pending,
         registrationsToday 
      }));
    }, (error) => {
      console.warn("Gracefully handled super admin users onSnapshot error:", error);
    });

    // Listen for logs
    const unsubLogs = onSnapshot(query(collection(db, 'activity_logs'), orderBy('timestamp', 'desc'), limit(100)), (snapshot) => {
      setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      setLoading(false);
      console.warn("Gracefully handled super admin logs onSnapshot error:", error);
    });

    // Listen for subscription proofs in real-time
    const unsubProofs = onSnapshot(collection(db, 'subscription_proofs'), (snapshot) => {
      const proofsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      proofsData.sort((a: any, b: any) => new Date(b.submittedAt || '').getTime() - new Date(a.submittedAt || '').getTime());
      setProofs(proofsData);
    }, (error) => {
      console.warn("Gracefully handled subscription proofs onSnapshot error:", error);
    });

    return () => {
      unsubBiz();
      unsubUsers();
      unsubLogs();
      unsubProofs();
    };
  }, []);

  const handleApproveProof = async (proof: any) => {
    try {
      // 1. Update proof document status at top-level
      await updateDoc(doc(db, 'subscription_proofs', proof.id), {
        status: 'approved',
        resolvedAt: new Date().toISOString()
      });

      // Also try to update proof document status in subcollection under business
      try {
        await updateDoc(doc(db, 'subscription_proofs', proof.businessId, 'proofs', proof.id), {
          status: 'approved',
          resolvedAt: new Date().toISOString()
        });
      } catch (subErr) {
        console.warn("Subcollection proof update skipped or not present:", subErr);
      }

      // 2. Extend business subscription
      const daysToAdd = proof.planType === 'yearly' || proof.plan === 'yearly' ? 365 : 30;
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + daysToAdd);

      const planName = proof.plan || proof.planType || 'basico';

      await updateDoc(doc(db, 'businesses', proof.businessId), {
        subscriptionStatus: 'active',
        subscriptionPlan: planName,
        subscriptionEndsAt: futureDate.toISOString(),
        subscription: {
          plan: planName,
          status: 'active',
          startDate: new Date().toISOString(),
          endDate: futureDate.toISOString()
        }
      });

      // 3. User in-app notification
      if (proof.ownerId) {
        await addDoc(collection(db, `users/${proof.ownerId}/notifications`), {
          title: 'Subscrição Ativada com Sucesso!',
          message: `O seu pagamento no valor de ${proof.amount} MZN foi recebido e validado. Obrigado por utilizar a nossa plataforma!`,
          type: 'success',
          createdAt: serverTimestamp(),
          read: false
        });
      }

      // 4. Send Email Notification to business owner
      const ownerEmail = proof.ownerEmail || 'suporte@sabush.com';
      const emailSubject = `Subscrição ACTIVA - Sabush ERP ERP`;
      const emailBody = `Olá ${proof.businessName || 'Parceiro'}!

O seu comprovativo de pagamento no valor de ${proof.amount} MZN referente ao plano ${planName.toUpperCase()} do Sabush ERP foi verificado e validado com sucesso.

A sua conta está totalmente ativa até: ${futureDate.toLocaleDateString('pt-MZ')}.

Obrigado por confiar no Ecossistema Grupo Sabush!
Atenciosamente,
Equipa Técnica Sabush ERP`;

      await sendEmailNotification(ownerEmail, emailSubject, emailBody).catch(err => {
        console.warn("Silent user email confirmation error:", err);
      });

      // 5. Send WhatsApp Notification to business owner
      const ownerPhone = proof.ownerPhone || 'Não fornecido';
      if (ownerPhone && ownerPhone !== 'Não fornecido') {
        await sendSubscriptionStatusWhatsApp(
          ownerPhone,
          proof.businessName || 'Empresa',
          planName,
          'approved'
        ).catch(err => {
          console.warn("Silent user WhatsApp notification error:", err);
        });
      }

      // 6. Log the activity
      await logAction(
        currentUser?.uid || 'admin',
        currentUser?.email || 'admin@sabush.com',
        ActionType.UPDATE_SUBSCRIPTION,
        `Approved subscription proof for "${proof.businessName}" (${planName}). Extended subscription until ${futureDate.toLocaleDateString()}.`
      );

      toast.success(`Comprovativo aprovado! Subscrição estendida até ${futureDate.toLocaleDateString()}.`);
    } catch (err: any) {
      console.error(err);
      toast.error(`Erro ao aprovar comprovativo: ${err?.message || err}`);
    }
  };

  const handleRejectProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProofForAction) return;
    if (!rejectionNotes.trim()) {
      toast.error('Indique o motivo da rejeição do comprovativo.');
      return;
    }

    try {
      const proof = selectedProofForAction;
      const planName = proof.plan || proof.planType || 'basico';

      // 1. Update proof document status & notes at top-level
      await updateDoc(doc(db, 'subscription_proofs', proof.id), {
        status: 'rejected',
        notes: rejectionNotes.trim(),
        resolvedAt: new Date().toISOString()
      });

      // Also try to update status & notes in subcollection
      try {
        await updateDoc(doc(db, 'subscription_proofs', proof.businessId, 'proofs', proof.id), {
          status: 'rejected',
          notes: rejectionNotes.trim(),
          resolvedAt: new Date().toISOString()
        });
      } catch (subErr) {
        console.warn("Subcollection proof rejection update skipped or not present:", subErr);
      }

      // 2. Add notification for owner
      if (proof.ownerId) {
        await addDoc(collection(db, `users/${proof.ownerId}/notifications`), {
          title: 'Comprovativo de Pagamento Recusado',
          message: `O seu envio de comprovativo foi rejeitado pelo administrador. Motivo: ${rejectionNotes.trim()}`,
          type: 'warning',
          createdAt: serverTimestamp(),
          read: false
        });
      }

      // 3. Send Email Notification to business owner
      const ownerEmail = proof.ownerEmail || 'suporte@sabush.com';
      const emailSubject = `Divergência de Pagamento - Sabush ERP`;
      const emailBody = `Olá ${proof.businessName || 'Parceiro'}!

O seu comprovativo de pagamento no valor de ${proof.amount} MZN referente ao plano ${planName.toUpperCase()} do Sabush ERP foi analisado e recusado pela nossa administração.

Motivo da Recusa:
"${rejectionNotes.trim()}"

Por favor, aceda ao painel de Faturação (Billing) no seu ERP para re-submeter os dados ou anexar o ficheiro correto correspondente à transação bancária.

Atenciosamente,
Equipa Técnica Sabush System`;

      await sendEmailNotification(ownerEmail, emailSubject, emailBody).catch(err => {
        console.warn("Silent user rejection email error:", err);
      });

      // 4. Send WhatsApp Notification to business owner
      const ownerPhone = proof.ownerPhone || 'Não fornecido';
      if (ownerPhone && ownerPhone !== 'Não fornecido') {
        await sendSubscriptionStatusWhatsApp(
          ownerPhone,
          proof.businessName || 'Empresa',
          planName,
          'rejected',
          rejectionNotes.trim()
        ).catch(err => {
          console.warn("Silent user rejection WhatsApp error:", err);
        });
      }

      // 5. Log the activity
      await logAction(
        currentUser?.uid || 'admin',
        currentUser?.email || 'admin@sabush.com',
        ActionType.UPDATE_SUBSCRIPTION,
        `Rejected subscription proof for "${proof.businessName}" (${planName}). Motivo: ${rejectionNotes.trim()}`
      );

      toast.success('Comprovativo rejeitado com sucesso.');
      setSelectedProofForAction(null);
      setRejectionNotes('');
      setIsRejecting(false);
    } catch (err: any) {
      console.error(err);
      toast.error(`Erro ao rejeitar: ${err?.message || err}`);
    }
  };

  const updateUserStatus = async (userId: string, targetUserEmail: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), { accountStatus: newStatus });
      
      // Simulating Notification inside database
      await addDoc(collection(db, `users/${userId}/notifications`), {
        title: `Aviso de Estado da Conta`,
        message: `A sua conta foi alterada para ${newStatus} pelo administrador da plataforma.`,
        type: newStatus === 'active' ? 'success' : 'warning',
        createdAt: serverTimestamp(),
        read: false
      });

      // Send automatic email notification to client
      if (newStatus === 'active') {
        const emailSubject = `Sua Conta Sabush ERP foi Ativada! 🎉`;
        const emailBody = `Olá!\n\nA sua conta no Sabush ERP associada ao e-mail ${targetUserEmail} foi ativada pelo Administrador da Plataforma.\n\nAgora já tem acesso completo a todos os recursos de faturação, fornecedores, clientes e relatórios estratégicos.\n\n👉 Aceda agora: ${window.location.origin}\n\nCumprimentos,\nEquipa Sabush Group & ERP`;
        await sendEmailNotification(targetUserEmail, emailSubject, emailBody).catch(err => {
          console.warn("Silent notification email error:", err);
        });
      } else if (newStatus === 'suspended') {
        const emailSubject = `Sua Conta Sabush ERP foi Suspensa ⚠️`;
        const emailBody = `Olá!\n\nInformamos que a sua conta no Sabush ERP associada ao e-mail ${targetUserEmail} foi desativada/suspensa pelo Administrador do Sistema.\n\nSe acredita que isto é um erro ou pretende regularizar a sua situação de subscrição, por favor entre em contacto com o suporte.\n\nCumprimentos,\nEquipa Sabush ERP`;
        await sendEmailNotification(targetUserEmail, emailSubject, emailBody).catch(err => {
          console.warn("Silent suspension email error:", err);
        });
      }

      await logAction(currentUser?.uid || 'admin', currentUser?.email || 'admin@sabush.com', ActionType.ACCOUNT_STATUS_CHANGE, `Changed user ${targetUserEmail} status to ${newStatus}`);
      
      toast.success(`Utilizador marcado como ${newStatus}`);
    } catch (e) {
      toast.error("Erro ao atualizar estado");
    }
  };

  const handleActivateUser = async (userId: string, targetUserEmail: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        accountStatus: 'active',
        redemptionRequested: false,
        redemptionStatus: 'approved',
        redemptionApprovedAt: new Date().toISOString()
      });

      await addDoc(collection(db, `users/${userId}/notifications`), {
        title: `Conta Reativada com Sucesso!`,
        message: `O seu pedido de redenção foi aprovado pelo administrador. Tem agora acesso completo ao ERP.`,
        type: 'success',
        createdAt: serverTimestamp(),
        read: false
      });

      // Send automatic approval email
      const emailSubject = `Pedido de Ativação Aprovado - Sabush ERP! 🚀`;
      const emailBody = `Olá!\n\nTemos o prazer de informar que o seu pedido de reativação para a conta ${targetUserEmail} foi aprovado com sucesso.\n\nA sua conta está 100% ativa e operacional de imediato.\n\n👉 Aceda aqui: ${window.location.origin}\n\nBons negócios!\nEquipa Sabush ERP`;
      await sendEmailNotification(targetUserEmail, emailSubject, emailBody).catch(err => {
        console.warn("Silent reactivation approval email error:", err);
      });

      await logAction(
        currentUser?.uid || 'admin',
        currentUser?.email || 'admin@sabush.com',
        ActionType.ACCOUNT_STATUS_CHANGE,
        `Reactivated user ${targetUserEmail} and approved redemption if pending.`
      );

      toast.success("Utilizador reativado e redenção aprovada!");
    } catch (e) {
      toast.error("Erro ao ativar utilizador");
    }
  };

  const handleSuspendConfirmation = async () => {
    if (!suspendTargetId) return;
    setIsSuspending(true);
    try {
      await updateDoc(doc(db, 'users', suspendTargetId), {
        accountStatus: 'suspended',
        suspensionReason: suspensionReason,
        warningEmailSent: true,
        warningEmailSubject: "Aviso de Suspensão de Conta - Sabush ERP",
        warningEmailBody: suspensionEmailBody,
        warningSentAt: new Date().toISOString(),
        redemptionRequested: false,
        redemptionAppeal: "",
        redemptionStatus: ""
      });

      await addDoc(collection(db, `users/${suspendTargetId}/notifications`), {
        title: `Aviso Importante: Conta Suspensa`,
        message: `A sua conta foi suspensa por: ${suspensionReason}. Verifique os detalhes no aviso e envie o seu pedido de redenção.`,
        type: 'warning',
        createdAt: serverTimestamp(),
        read: false
      });

      await logAction(
        currentUser?.uid || 'admin',
        currentUser?.email || 'admin@sabush.com',
        ActionType.ACCOUNT_STATUS_CHANGE,
        `Suspended user ${suspendTargetEmail} (${suspendTargetName}) with warning email. Reason: ${suspensionReason}`
      );

      toast.success("Utilizador suspenso com sucesso e aviso enviado!");
      setSuspendTargetId(null);
      setSuspendTargetEmail(null);
      setSuspendTargetName(null);
    } catch (e: any) {
      console.error(e);
      toast.error(`Falha ao suspender: ${e.message || e}`);
    } finally {
      setIsSuspending(false);
    }
  };

  const updateUserRole = async (userId: string, targetUserEmail: string, newRole: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole });
      await logAction(currentUser?.uid || 'admin', currentUser?.email || 'admin@sabush.com', ActionType.ACCOUNT_STATUS_CHANGE, `Changed user ${targetUserEmail} role to ${newRole}`);
      toast.success(`Função atualizada com sucesso para ${newRole}`);
    } catch (e) {
      toast.error("Erro ao atualizar função");
    }
  };

  // Bulk operation handlers for scalable user management (1000+ users capacity)
  const handleBulkActivate = async () => {
    if (selectedUserIds.length === 0) return;
    setIsApplyingBulkAction(true);
    let successCount = 0;
    try {
      for (const userId of selectedUserIds) {
        const u = users.find(user => user.id === userId);
        if (!u) continue;
        await updateDoc(doc(db, 'users', userId), {
          accountStatus: 'active',
          redemptionRequested: false,
          redemptionStatus: 'approved',
          redemptionApprovedAt: new Date().toISOString()
        });
        
        await addDoc(collection(db, `users/${userId}/notifications`), {
          title: `Conta Ativada com Sucesso! 🚀`,
          message: `O seu acesso foi ativado pelo administrador através de uma ação em massa.`,
          type: 'success',
          createdAt: serverTimestamp(),
          read: false
        });

        if (u.email) {
          const emailSubject = `Sua Conta Sabush ERP foi Ativada! 🎉`;
          const emailBody = `Olá!\n\nA sua conta no Sabush ERP associada ao e-mail ${u.email} foi ativada em massa pelo Administrador da Plataforma.\n\nAgora já tem acesso completo a todos os recursos.\n\n👉 Aceda agora: ${window.location.origin}\n\nCumprimentos,\nEquipa Sabush Group & ERP`;
          sendEmailNotification(u.email, emailSubject, emailBody).catch(err => {
            console.warn("Silent notification email error:", err);
          });
        }
        successCount++;
      }
      
      await logAction(
        currentUser?.uid || 'admin',
        currentUser?.email || 'admin@sabush.com',
        ActionType.ACCOUNT_STATUS_CHANGE,
        `Bulk activated ${successCount} users.`
      );
      toast.success(`${successCount} utilizadores foram ativados com sucesso!`);
      setSelectedUserIds([]);
    } catch (err: any) {
      toast.error(`Erro ao ativar em massa: ${err.message || err}`);
    } finally {
      setIsApplyingBulkAction(false);
    }
  };

  const handleBulkSuspend = async () => {
    if (selectedUserIds.length === 0) return;
    setIsApplyingBulkAction(true);
    let successCount = 0;
    try {
      for (const userId of selectedUserIds) {
        const u = users.find(user => user.id === userId);
        if (!u) continue;
        await updateDoc(doc(db, 'users', userId), {
          accountStatus: 'suspended',
          suspensionReason: 'bulk_admin_action',
          warningEmailSent: true,
          warningEmailSubject: "Aviso de Suspensão de Conta - Sabush ERP",
          warningEmailBody: `Olá!\nA sua conta no Sabush ERP foi suspensa pelo Administrador devido a incumprimento das regras ou falta de pagamento.\nSubmeta um pedido de redenção se for necessário.`,
          warningSentAt: new Date().toISOString(),
          redemptionRequested: false,
          redemptionAppeal: "",
          redemptionStatus: ""
        });

        await addDoc(collection(db, `users/${userId}/notifications`), {
          title: `Aviso Importante: Conta Suspensa ⚠️`,
          message: `A sua conta foi desativada temporariamente por ação do Administrador.`,
          type: 'warning',
          createdAt: serverTimestamp(),
          read: false
        });

        if (u.email) {
          const emailSubject = `Sua Conta Sabush ERP foi Suspensa ⚠️`;
          const emailBody = `Olá!\n\nInformamos que a sua conta no Sabush ERP associada ao e-mail ${u.email} foi desativada/suspensa pelo Administrador em massa.\n\nPor favor entre em contacto com o suporte para reaver o seu acesso.\n\nCumprimentos,\nEquipa Sabush ERP`;
          sendEmailNotification(u.email, emailSubject, emailBody).catch(err => {
            console.warn("Silent suspension email error:", err);
          });
        }
        successCount++;
      }

      await logAction(
        currentUser?.uid || 'admin',
        currentUser?.email || 'admin@sabush.com',
        ActionType.ACCOUNT_STATUS_CHANGE,
        `Bulk suspended ${successCount} users.`
      );
      toast.success(`${successCount} utilizadores foram suspensos!`);
      setSelectedUserIds([]);
    } catch (err: any) {
      toast.error(`Erro ao suspender em massa: ${err.message || err}`);
    } finally {
      setIsApplyingBulkAction(false);
    }
  };

  const handleBulkChangeRole = async () => {
    if (selectedUserIds.length === 0) return;
    setIsApplyingBulkAction(true);
    let successCount = 0;
    try {
      for (const userId of selectedUserIds) {
        await updateDoc(doc(db, 'users', userId), {
          role: bulkActionRole
        });
        successCount++;
      }

      await logAction(
        currentUser?.uid || 'admin',
        currentUser?.email || 'admin@sabush.com',
        ActionType.ACCOUNT_STATUS_CHANGE,
        `Bulk changed role to ${bulkActionRole} for ${successCount} users.`
      );
      toast.success(`${successCount} utilizadores atualizados para ${bulkActionRole}!`);
      setSelectedUserIds([]);
    } catch (err: any) {
      toast.error(`Erro ao alterar função em massa: ${err.message || err}`);
    } finally {
      setIsApplyingBulkAction(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedUserIds.length === 0) return;
    if (!window.confirm(`Tem certeza de que deseja eliminar permanentemente estes ${selectedUserIds.length} utilizadores? Esta ação não pode ser desfeita.`)) {
      return;
    }
    setIsApplyingBulkAction(true);
    let successCount = 0;
    try {
      for (const userId of selectedUserIds) {
        await deleteDoc(doc(db, 'users', userId));
        successCount++;
      }

      await logAction(
        currentUser?.uid || 'admin',
        currentUser?.email || 'admin@sabush.com',
        ActionType.ACCOUNT_STATUS_CHANGE,
        `Bulk deleted ${successCount} users.`
      );
      toast.success(`${successCount} utilizadores foram removidos permanentemente!`);
      setSelectedUserIds([]);
    } catch (err: any) {
      toast.error(`Erro ao eliminar em massa: ${err.message || err}`);
    } finally {
      setIsApplyingBulkAction(false);
    }
  };

  const handleExportUsersCSV = (filteredUsers: any[]) => {
    if (filteredUsers.length === 0) {
      toast.error("Nenhum utilizador para exportar com os filtros atuais.");
      return;
    }
    try {
      const headers = ['ID', 'Nome', 'Email', 'Telefone', 'Estado', 'Funcao', 'Negocio ID', 'Pedido Redencao', 'Mensagem Redencao'];
      const rows = filteredUsers.map(u => [
        u.id || '',
        u.displayName || 'Sem Nome',
        u.email || '',
        u.phoneNumber || '',
        u.accountStatus || 'pending',
        u.role || 'business_owner',
        u.businessId || '',
        u.redemptionRequested ? 'SIM' : 'NAO',
        u.redemptionAppeal ? u.redemptionAppeal.replace(/"/g, '""') : ''
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(r => r.map(val => `"${val}"`).join(','))
      ].join('\n');

      const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `sabush_utilizadores_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success(`${filteredUsers.length} utilizadores exportados para CSV!`);
    } catch (err: any) {
      toast.error(`Falha ao exportar CSV: ${err.message || err}`);
    }
  };

  const updateBusinessPlan = async (businessId: string, companyName: string, newPlan: string) => {
    try {
      await updateDoc(doc(db, 'businesses', businessId), { subscriptionPlan: newPlan });
      await logAction(currentUser?.uid || 'admin', currentUser?.email || 'admin@sabush.com', ActionType.UPDATE_SUBSCRIPTION, `Updated plan for "${companyName}" to ${newPlan}`);
      toast.success(`Plano do negócio "${companyName}" foi atualizado para ${newPlan}`);
    } catch (e) {
      toast.error("Erro ao atualizar plano");
    }
  };

  const toggleBusinessStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'suspended' ? 'active' : 'suspended';
    try {
      const updateData: any = { subscriptionStatus: newStatus };
      if (newStatus === 'active') {
        updateData.redemptionRequested = false;
        updateData.redemptionStatus = 'approved';
        updateData.redemptionApprovedAt = new Date().toISOString();
      }
      await updateDoc(doc(db, 'businesses', id), updateData);
      toast.success(`Negócio alterado para ${newStatus}`);
    } catch (e) {
      toast.error("Falha ao atualizar estado do negócio");
    }
  };

  const toggleFlagLog = async (logId: string, currentFlagged: boolean) => {
    try {
      await updateDoc(doc(db, 'activity_logs', logId), { flagged: !currentFlagged });
      toast.success(currentFlagged ? "Sinalização removida" : "Atividade sinalizada como de risco");
    } catch (e) {
      toast.error("Falha ao atualizar log");
    }
  };

  const handleDeleteConfirmation = async () => {
    if (!deleteType || !deleteTargetId) return;
    
    setIsDeleting(true);
    try {
      // Get human readable reason
      let reasonText = '';
      if (deleteReason === 'rules_non_compliance') {
        reasonText = 'Não conformidade com os regulamentos do software (Rules non-compliance)';
      } else if (deleteReason === 'testing_only') {
        reasonText = 'Utilizador/Negócio apenas de teste (User/Business was just for testing)';
      } else if (deleteReason === 'suspended_abandoned') {
        reasonText = 'Suspensão prolongada sem reclamar reuso (Suspended too long without reclaim)';
      } else if (deleteReason === 'inactivity_cleanup') {
        reasonText = 'Inatividade prolongada para poupar recursos (Prolonged inactivity cleanup)';
      } else {
        reasonText = 'Outro motivo razoável (Other reasonable means)';
      }

      if (deleteCustomDetail.trim()) {
        reasonText += ` - Notas: ${deleteCustomDetail.trim()}`;
      }

      const pathForWrite = deleteType === 'user' ? 'users' : 'businesses';
      
      try {
        await deleteDoc(doc(db, pathForWrite, deleteTargetId));
        
        await logAction(
          currentUser?.uid || 'admin',
          currentUser?.email || 'admin@sabush.com',
          ActionType.ACCOUNT_STATUS_CHANGE,
          `Super Admin excluiu definitivamente ${deleteType === 'user' ? 'utilizador' : 'empresa'} [${deleteTargetName}] (ID: ${deleteTargetId}). Motivo: ${reasonText}`
        );

        toast.success(`${deleteType === 'user' ? 'Utilizador' : 'Empresa'} eliminado(a) definitivamente!`);
        
        // Reset states
        setDeleteType(null);
        setDeleteTargetId(null);
        setDeleteTargetName(null);
        setDeleteCustomDetail('');
        setDeleteReason('rules_non_compliance');
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `${pathForWrite}/${deleteTargetId}`);
      }
    } catch (e: any) {
      console.error(e);
      toast.error(`Falha ao eliminar registo: ${e.message || e}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const formatLogTimestamp = (timestamp: any) => {
    if (!timestamp) return 'Sem data';
    if (typeof timestamp.toDate === 'function') {
      return timestamp.toDate().toLocaleString();
    }
    return new Date(timestamp).toLocaleString();
  };

  if (loading) {
    return (
      <div className="p-8 space-y-8 max-w-7xl mx-auto">
        <div className="flex justify-between items-end">
          <Skeleton className="h-20 w-80" />
          <Skeleton className="h-16 w-60 rounded-3xl" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-32 rounded-[40px]" />)}
        </div>
        <Skeleton className="h-[600px] w-full rounded-[40px]" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-10 max-w-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h1 className="text-3xl md:text-5xl font-black text-slate-900 mb-2 tracking-tighter">Sabush <span className="text-blue-600">Platform</span></h1>
          <p className="text-slate-500 font-bold">Control Tower & Master Administration</p>
        </div>
        
        <div className="flex items-center gap-2 p-2 bg-slate-100 rounded-[24px] flex-wrap">
           {(['overview', 'users', 'businesses', 'owners', 'proofs', 'logs', 'branding'] as AdminTab[]).filter(tab => {
             // If they are not super_admin or brand manager, we hide the branding tab button entirely
             if (tab === 'branding' && profile?.role?.toLowerCase() !== 'super_admin' && !isBrandManager) {
               return false;
             }
             return true;
           }).map(tab => {
             const isBranding = tab === 'branding';
             const isLocked = isBranding && !isBrandManager;
             return (
               <div key={tab} className="relative group">
                 {isLocked && (
                   <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider py-2 px-3 rounded-xl whitespace-nowrap z-50 shadow-2xl border border-slate-800">
                     Apenas o Super Admin pode alterar o logo da plataforma
                   </div>
                 )}
                 <button
                   onClick={() => setActiveTab(tab)}
                   className={cn(
                     "px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5",
                     activeTab === tab ? "bg-white text-slate-900 shadow-xl shadow-slate-205/50" : "text-slate-500 hover:text-slate-900",
                     isLocked && "opacity-75"
                   )}
                 >
                   {tab === 'owners' ? 'Owners' : tab === 'branding' ? (isLocked ? 'Branding 🔒' : 'Branding') : tab}
                 </button>
               </div>
             );
           })}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'overview' && (
          <motion.div 
            key="overview"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-10"
          >
            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard title="Total Users" value={stats.totalUsers} icon={Users} color="bg-blue-600" trend={`${stats.registrationsToday} New Today`} />
              <StatCard title="Active Accounts" value={stats.activeUsers} icon={UserCheck} color="bg-emerald-600" trend={`${stats.activeUsers} Approvals`} />
              <StatCard title="Pending Review" value={stats.pendingUsers} icon={Clock} color="bg-orange-500" trend="Action Required" />
              <StatCard title="Est. Revenue" value={`${stats.totalMzn.toLocaleString()} MZN`} icon={DollarSign} color="bg-slate-900" trend="Calculated from Plans" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
               <div className="lg:col-span-2 bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-8">
                     <TrendingUp className="text-slate-100 w-40 h-40" strokeWidth={5} />
                  </div>
                  <div className="relative">
                    <h2 className="text-2xl font-black text-slate-900 mb-8 flex items-center gap-3">
                      <LayoutDashboard className="text-blue-600" /> Platform Growth
                    </h2>
                    <div className="h-[350px]">
                      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <AreaChart data={[10, 15, 8, 20, 25, 21, 35, 42, stats.totalUsers].map((v, i) => ({ v, i }))}>
                          <defs>
                            <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="i" hide />
                          <YAxis hide />
                          <Tooltip 
                            contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', fontWeight: 'bold' }}
                          />
                          <Area type="monotone" dataKey="v" stroke="#3b82f6" strokeWidth={4} fillOpacity={1} fill="url(#colorUsers)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
               </div>

               <div className="bg-slate-900 p-10 rounded-[40px] text-white flex flex-col justify-between shadow-2xl shadow-blue-500/20">
                  <div className="space-y-4">
                    <div className="w-16 h-16 bg-blue-600 rounded-[28px] flex items-center justify-center shadow-lg shadow-blue-600/30">
                      <History size={32} />
                    </div>
                    <h3 className="text-3xl font-black italic tracking-tighter">Live Monitor</h3>
                    <p className="text-white/50 font-bold leading-relaxed">Real-time activity feed from all Sabush ERP nodes globally.</p>
                  </div>
                  
                  <div className="space-y-3 mt-10">
                    {logs.slice(0, 3).map((log: any) => (
                      <div key={log.id} className="p-4 bg-white/5 rounded-2xl border border-white/5 flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-black uppercase text-blue-400 truncate">{log.action}</p>
                          <p className="text-xs font-bold truncate opacity-80">{log.details}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button 
                    onClick={() => setActiveTab('logs')}
                    className="w-full mt-8 py-4 bg-white text-slate-900 rounded-2xl font-black text-sm flex items-center justify-center gap-2"
                  >
                    Watch All Logs
                  </button>
               </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'users' && (
          <motion.div 
            key="users"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            {/* Quick Metrics Multi-Filter Panel */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div 
                onClick={() => { setStatusFilter('all'); setUserPage(1); }}
                className={cn(
                  "p-5 rounded-[28px] border text-left cursor-pointer transition-all hover:scale-[1.02] select-none shadow-sm",
                  statusFilter === 'all' ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-900 border-slate-100 hover:bg-slate-50"
                )}
              >
                <p className={cn("text-[9px] font-black uppercase tracking-widest leading-none", statusFilter === 'all' ? "text-slate-400" : "text-slate-400")}>Total Geral</p>
                <h3 className="text-2xl font-black mt-1 leading-none">{stats.totalUsers || users.length}</h3>
                <p className="text-[10px] font-bold mt-1.5 opacity-70">Todos utilizadores registados</p>
              </div>

              <div 
                onClick={() => { setStatusFilter('active'); setUserPage(1); }}
                className={cn(
                  "p-5 rounded-[28px] border text-left cursor-pointer transition-all hover:scale-[1.02] select-none shadow-sm",
                  statusFilter === 'active' ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-900 border-slate-100 hover:bg-slate-50"
                )}
              >
                <p className="text-[9px] font-black uppercase tracking-widest leading-none text-emerald-500">Ativos</p>
                <h3 className="text-2xl font-black mt-1 leading-none">{stats.activeUsers || users.filter(usr => usr.accountStatus === 'active').length}</h3>
                <p className="text-[10px] font-bold mt-1.5 opacity-70">Contas operacionais/ERPs ativos</p>
              </div>

              <div 
                onClick={() => { setStatusFilter('pending'); setUserPage(1); }}
                className={cn(
                  "p-5 rounded-[28px] border text-left cursor-pointer transition-all hover:scale-[1.02] select-none shadow-sm",
                  statusFilter === 'pending' ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-900 border-slate-100 hover:bg-slate-50"
                )}
              >
                <p className="text-[9px] font-black uppercase tracking-widest leading-none text-blue-500 font-sans">Pendentes</p>
                <h3 className="text-2xl font-black mt-1 leading-none">{stats.pendingUsers || users.filter(usr => (usr.accountStatus || 'pending') === 'pending').length}</h3>
                <p className="text-[10px] font-bold mt-1.5 opacity-70">Aguardando validação/pagamento</p>
              </div>

              <div 
                onClick={() => { setStatusFilter('suspended'); setUserPage(1); }}
                className={cn(
                  "p-5 rounded-[28px] border text-left cursor-pointer transition-all hover:scale-[1.02] select-none shadow-sm",
                  statusFilter === 'suspended' ? "bg-orange-600 text-white border-orange-600" : "bg-white text-slate-900 border-slate-100 hover:bg-slate-50"
                )}
              >
                <p className="text-[9px] font-black uppercase tracking-widest leading-none text-orange-500 font-sans">Suspensos</p>
                <h3 className="text-2xl font-black mt-1 leading-none">{stats.suspendedUsers || users.filter(usr => usr.accountStatus === 'suspended').length}</h3>
                <p className="text-[10px] font-bold mt-1.5 opacity-70">Contas temporariamente bloqueadas</p>
              </div>
            </div>

            {/* Controls Bar */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
               <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                 <Shield className="text-blue-600" /> Controlo de Acesso de Utilizadores
               </h2>
               <div className="flex flex-wrap items-center gap-4">
                 {/* Status Filter selection */}
                 <div className="flex items-center gap-2">
                   <span className="text-[10px] font-black uppercase text-slate-400">Estado:</span>
                   <select
                     value={statusFilter}
                     onChange={e => { setStatusFilter(e.target.value); setUserPage(1); }}
                     className="bg-slate-100 hover:bg-slate-200 text-xs font-black uppercase text-slate-700 px-3 py-2.5 rounded-2xl outline-none cursor-pointer transition-all"
                   >
                     <option value="all">Todos os Estados</option>
                     <option value="active">Active (Ativo)</option>
                     <option value="pending">Pending (Pendente)</option>
                     <option value="suspended">Suspended (Suspenso)</option>
                     <option value="banned">Banned (Banido)</option>
                   </select>
                 </div>

                 {/* Role Filter selection */}
                 <div className="flex items-center gap-2">
                   <span className="text-[10px] font-black uppercase text-slate-400">Função:</span>
                   <select
                     value={roleFilter}
                     onChange={e => { setRoleFilter(e.target.value); setUserPage(1); }}
                     className="bg-slate-100 hover:bg-slate-200 text-xs font-black uppercase text-slate-700 px-3 py-2.5 rounded-2xl outline-none cursor-pointer transition-all"
                   >
                     <option value="all">Todas as Funções</option>
                     <option value="super_admin">Super Admin</option>
                     <option value="business_owner">Business Owner</option>
                     <option value="manager">Manager</option>
                     <option value="cashier">Cashier</option>
                     <option value="staff">Staff</option>
                   </select>
                 </div>

                 {/* Custom search bar */}
                 <div className="relative group">
                   <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                   <input 
                     className="pl-12 pr-6 py-4 bg-white border border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-blue-100 transition-all font-bold text-sm w-full md:w-80 shadow-sm"
                     placeholder="Pesquisar por email ou nome..."
                     value={searchTerm}
                     onChange={e => { setSearchTerm(e.target.value); setUserPage(1); }}
                   />
                 </div>

                 {/* CSV Export Tool */}
                 {(() => {
                   const uList = users.filter(u => {
                     const matchesSearch = (u.email?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || 
                                          (u.displayName?.toLowerCase() || '').includes(searchTerm.toLowerCase());
                     const matchesStatus = statusFilter === 'all' ? true : (u.accountStatus || 'pending') === statusFilter;
                     let normRole = u.role || 'business_owner';
                     if (normRole === 'owner') normRole = 'business_owner';
                     const matchesRole = roleFilter === 'all' ? true : normRole === roleFilter;
                     return matchesSearch && matchesStatus && matchesRole;
                   });
                   return (
                     <button
                       type="button"
                       onClick={() => handleExportUsersCSV(uList)}
                       className="px-5 py-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-2xl outline-none font-bold text-xs flex items-center gap-2 border border-emerald-100 transition-all cursor-pointer whitespace-nowrap shadow-sm active:scale-[0.98]"
                       title="Exportar base filtrada para CSV"
                     >
                       <FileSpreadsheet size={16} />
                       <span>Exportar ({uList.length})</span>
                     </button>
                   );
                 })()}
               </div>
            </div>

            {/* Calculations & Pagings */}
            {(() => {
              const uList = users.filter(u => {
                const matchesSearch = (u.email?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || 
                                     (u.displayName?.toLowerCase() || '').includes(searchTerm.toLowerCase());
                const matchesStatus = statusFilter === 'all' ? true : (u.accountStatus || 'pending') === statusFilter;
                
                let normRole = u.role || 'business_owner';
                if (normRole === 'owner') normRole = 'business_owner';
                
                const matchesRole = roleFilter === 'all' ? true : normRole === roleFilter;
                return matchesSearch && matchesStatus && matchesRole;
              });

              const totalFiltered = uList.length;
              const maxPages = Math.ceil(totalFiltered / userPageSize) || 1;
              const correctedPage = userPage > maxPages ? maxPages : userPage;
              const paginatedList = uList.slice((correctedPage - 1) * userPageSize, correctedPage * userPageSize);
              const isAllVisibleSelected = paginatedList.length > 0 && paginatedList.every(u => selectedUserIds.includes(u.id));

              const handleMasterToggle = () => {
                const visibleIds = paginatedList.map(u => u.id);
                if (isAllVisibleSelected) {
                  setSelectedUserIds(prev => prev.filter(id => !visibleIds.includes(id)));
                } else {
                  setSelectedUserIds(prev => Array.from(new Set([...prev, ...visibleIds])));
                }
              };

              return (
                <div className="bg-white rounded-[40px] shadow-sm border border-slate-100 overflow-hidden relative">
                  
                  {/* Floating Action Bar for Selected items */}
                  <AnimatePresence>
                    {selectedUserIds.length > 0 && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="bg-blue-50 border-b border-blue-100 p-4 px-8 flex flex-wrap items-center justify-between gap-4 font-sans text-left overflow-hidden"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-black text-[10px] flex items-center justify-center">
                            {selectedUserIds.length}
                          </span>
                          <p className="text-xs font-black text-blue-950 uppercase tracking-tight">Utilizadores Selecionados</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                          {/* Bulk Role Selector */}
                          <div className="flex items-center gap-2 bg-white border border-blue-150 rounded-xl px-2.5 py-1.5 shadow-sm">
                            <span className="text-[9px] font-black uppercase text-slate-400">Atribuir Função:</span>
                            <select
                              value={bulkActionRole}
                              onChange={(e) => setBulkActionRole(e.target.value)}
                              className="text-[10px] font-black uppercase text-slate-700 bg-transparent outline-none cursor-pointer"
                            >
                              <option value="super_admin">Super Admin</option>
                              <option value="business_owner">Business Owner</option>
                              <option value="manager">Manager</option>
                              <option value="cashier">Cashier</option>
                              <option value="staff">Staff</option>
                            </select>
                            <button
                              type="button"
                              onClick={handleBulkChangeRole}
                              disabled={isApplyingBulkAction}
                              className="bg-blue-600 hover:bg-blue-700 text-white text-[9px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider transition-all cursor-pointer"
                            >
                              Aplicar
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={handleBulkActivate}
                            disabled={isApplyingBulkAction}
                            className="h-9 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shadow-sm shadow-emerald-600/10 active:scale-[0.98]"
                          >
                            <UserCheck size={13} />
                            <span>Ativar ({selectedUserIds.length})</span>
                          </button>

                          <button
                            type="button"
                            onClick={handleBulkSuspend}
                            disabled={isApplyingBulkAction}
                            className="h-9 px-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shadow-sm shadow-orange-500/10 active:scale-[0.98]"
                          >
                            <UserX size={13} />
                            <span>Suspender ({selectedUserIds.length})</span>
                          </button>

                          <button
                            type="button"
                            onClick={handleBulkDelete}
                            disabled={isApplyingBulkAction}
                            className="h-9 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shadow-sm shadow-rose-600/10 active:scale-[0.98]"
                          >
                            <Trash2 size={13} />
                            <span>Eliminar ({selectedUserIds.length})</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setSelectedUserIds([])}
                            className="h-9 px-3 text-slate-500 hover:text-slate-800 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
                          >
                            Desmarcar
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[800px]">
                      <thead>
                        <tr className="bg-slate-50/50 border-b border-slate-100">
                          <th className="p-8 w-12 text-center select-none">
                            <button
                              type="button"
                              onClick={handleMasterToggle}
                              className="text-slate-400 hover:text-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg p-1"
                            >
                              {isAllVisibleSelected ? (
                                <CheckSquare className="text-blue-600" size={18} />
                              ) : (
                                <Square size={18} />
                              )}
                            </button>
                          </th>
                          <th className="p-8 text-[10px] font-black uppercase tracking-widest text-slate-400">Utilizador / Detalhes</th>
                          <th className="p-8 text-[10px] font-black uppercase tracking-widest text-slate-400">Estado da Conta</th>
                          <th className="p-8 text-[10px] font-black uppercase tracking-widest text-slate-400">Função/Permissões</th>
                          <th className="p-8 text-[10px] font-black uppercase tracking-widest text-slate-400">Associado ao Negócio (ID)</th>
                          <th className="p-8 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Ações Rápidas</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {paginatedList.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-12 text-center text-slate-400 font-bold text-sm">
                              Nenhum utilizador encontrado com os filtros atuais.
                            </td>
                          </tr>
                        ) : (
                          paginatedList.map(u => {
                            const isSelected = selectedUserIds.includes(u.id);
                            return (
                              <tr key={u.id} className={cn("hover:bg-slate-50/50 transition-colors group", isSelected && "bg-blue-50/20")}>
                                <td className="p-8 text-center select-none">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedUserIds(prev => 
                                        prev.includes(u.id) ? prev.filter(id => id !== u.id) : [...prev, u.id]
                                      );
                                    }}
                                    className="text-slate-300 hover:text-blue-600 transition-colors focus:outline-none rounded-lg p-1"
                                  >
                                    {isSelected ? (
                                      <CheckSquare className="text-blue-600" size={18} />
                                    ) : (
                                      <Square size={18} />
                                    )}
                                  </button>
                                </td>
                                <td className="p-8">
                                  <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white font-black text-xs shadow-lg shadow-slate-900/10 shrink-0 mt-0.5">
                                      {u.displayName?.[0] || u.email?.[0] || '?'}
                                    </div>
                                    <div className="space-y-2">
                                       <div>
                                         <p className="font-black text-slate-900 leading-tight">{u.displayName || 'Sem Nome'}</p>
                                         <div className="flex flex-col mt-1">
                                           <span className="text-xs font-bold text-slate-400">{u.email}</span>
                                           {u.phoneNumber && <span className="text-[10px] font-bold text-blue-600 mt-0.5">{u.phoneNumber}</span>}
                                         </div>
                                       </div>
                                       
                                       {u.redemptionRequested && (
                                         <div className="bg-amber-50/70 border border-amber-100 p-3 rounded-2xl max-w-sm">
                                           <p className="text-[10px] font-black text-amber-800 uppercase tracking-widest flex items-center gap-1.5 animate-pulse">
                                             <MessageSquare size={12} /> Pedido de Redenção Recebido!
                                           </p>
                                           <p className="text-xs font-semibold text-amber-900/80 mt-1 leading-relaxed">
                                             "{u.redemptionAppeal}"
                                           </p>
                                           <p className="text-[9px] font-bold text-slate-450 uppercase tracking-widest mt-1.5 block">
                                             {u.redemptionRequestedAt ? new Date(u.redemptionRequestedAt).toLocaleString() : 'Recentemente'}
                                           </p>
                                         </div>
                                       )}
                                    </div>
                                  </div>
                                </td>
                                <td className="p-8">
                                   <span className={cn(
                                     "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-2",
                                     u.accountStatus === 'active' ? "bg-emerald-100 text-emerald-600" :
                                     u.accountStatus === 'pending' ? "bg-blue-100 text-blue-600" :
                                     u.accountStatus === 'suspended' ? "bg-orange-100 text-orange-600" :
                                     "bg-rose-100 text-rose-600"
                                   )}>
                                     <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", 
                                        u.accountStatus === 'active' ? "bg-emerald-500" :
                                        u.accountStatus === 'pending' ? "bg-blue-500" : "bg-orange-500")} 
                                     />
                                     {u.accountStatus || 'PENDING'}
                                   </span>
                                </td>
                                <td className="p-8">
                                   <select
                                     className="text-[11px] font-black uppercase text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer transition-all"
                                     value={u.role || 'business_owner'}
                                     onChange={(e) => updateUserRole(u.id, u.email, e.target.value)}
                                   >
                                     <option value="super_admin">Super Admin</option>
                                     <option value="business_owner">Business Owner</option>
                                     <option value="manager">Manager</option>
                                     <option value="cashier">Cashier</option>
                                     <option value="staff">Staff</option>
                                   </select>
                                </td>
                                <td className="p-8">
                                   <span className="text-xs font-mono font-bold text-slate-500 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100">
                                     {u.businessId || 'Nenhum'}
                                   </span>
                                </td>
                                <td className="p-8 text-right">
                                   <div className="flex justify-end gap-2">
                                     {u.accountStatus !== 'active' && (
                                       <button 
                                         onClick={() => handleActivateUser(u.id, u.email)}
                                         className="p-3 bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-2xl transition-all shadow-sm cursor-pointer"
                                         title="Aprovar/Ativar & Redimir"
                                       >
                                         <UserCheck size={20} />
                                       </button>
                                     )}
                                     {u.accountStatus !== 'suspended' && (
                                       <button 
                                         onClick={() => {
                                           setSuspendTargetId(u.id);
                                           setSuspendTargetEmail(u.email);
                                           setSuspendTargetName(u.displayName || u.email || 'Utilizador');
                                           setSuspensionReason('rules_non_compliance');
                                           setSuspensionEmailBody(`Olá ${u.displayName || 'Utilizador'},\n\nA sua conta no Sabush ERP foi suspensa pelo administrador da plataforma devido a regras em falta ou incumprimento.\n\nCaso pretenda reaver/redimir o seu acesso, por favor aceda ao painel de login e submeta um Pedido de Redenção formal indicando o seu esforço de conformidade.\n\nCumprimentos,\nEquipa de Segurança Sabush`);
                                         }}
                                         className="p-3 bg-orange-50 text-orange-600 hover:bg-orange-600 hover:text-white rounded-2xl transition-all shadow-sm cursor-pointer"
                                         title="Suspender & Enviar Aviso"
                                        >
                                         <UserX size={20} />
                                       </button>
                                     )}
                                     {u.accountStatus !== 'banned' && (
                                       <button 
                                         onClick={() => updateUserStatus(u.id, u.email, 'banned')}
                                         className="p-3 bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white rounded-2xl transition-all shadow-sm cursor-pointer"
                                         title="Banir"
                                       >
                                         <Ban size={20} />
                                       </button>
                                     )}
                                     <button 
                                       onClick={() => {
                                         setDeleteType('user');
                                         setDeleteTargetId(u.id);
                                         setDeleteTargetName(u.displayName || u.email || 'Utilizador Sem Nome');
                                       }}
                                       className="p-3 bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white rounded-2xl transition-all shadow-sm cursor-pointer"
                                       title="Eliminar Permanentemente"
                                     >
                                        <Trash2 size={20} />
                                     </button>
                                   </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Responsive Pagination & Rows Options Footer */}
                  {totalFiltered > 0 && (
                    <div className="p-8 border-t border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4 font-sans text-xs font-bold text-slate-500">
                      <div className="flex items-center gap-3">
                        <span>Mostrar por página:</span>
                        <select
                          value={userPageSize}
                          onChange={(e) => {
                            setUserPageSize(Number(e.target.value));
                            setUserPage(1);
                          }}
                          className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-blue-500 cursor-pointer"
                        >
                          <option value={10}>10 utilizadores</option>
                          <option value={20}>20 utilizadores</option>
                          <option value={50}>50 utilizadores</option>
                          <option value={100}>100 utilizadores</option>
                        </select>
                      </div>

                      <div className="text-slate-400">
                        Mostrando <span className="text-slate-700 font-extrabold">{Math.min(totalFiltered, (correctedPage - 1) * userPageSize + 1)}</span> a <span className="text-slate-700 font-extrabold">{Math.min(totalFiltered, correctedPage * userPageSize)}</span> de <span className="text-slate-700 font-extrabold">{totalFiltered}</span> utilizadores
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={correctedPage === 1}
                          onClick={() => setUserPage(prev => Math.max(1, prev - 1))}
                          className={cn(
                            "p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all cursor-pointer select-none",
                            correctedPage === 1 && "opacity-40 cursor-not-allowed hover:bg-slate-50"
                          )}
                          title="Página Anterior"
                        >
                          <ChevronLeft size={16} />
                        </button>

                        {(() => {
                          const pages = [];
                          const maxVisiblePages = 5;
                          let startPage = Math.max(1, correctedPage - Math.floor(maxVisiblePages / 2));
                          let endPage = startPage + maxVisiblePages - 1;

                          if (endPage > maxPages) {
                            endPage = maxPages;
                            startPage = Math.max(1, endPage - maxVisiblePages + 1);
                          }

                          if (startPage > 1) {
                            pages.push(
                              <button
                                key={1}
                                type="button"
                                onClick={() => setUserPage(1)}
                                className={cn(
                                  "w-9 h-9 flex items-center justify-center rounded-xl transition-all cursor-pointer",
                                  correctedPage === 1 ? "bg-blue-600 text-white shadow-md shadow-blue-600/10" : "bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200"
                                )}
                              >
                                1
                              </button>
                            );
                            if (startPage > 2) {
                              pages.push(<span key="ellIP-start" className="px-1 text-slate-300">...</span>);
                            }
                          }

                          for (let i = startPage; i <= endPage; i++) {
                            pages.push(
                              <button
                                key={i}
                                type="button"
                                onClick={() => setUserPage(i)}
                                className={cn(
                                  "w-9 h-9 flex items-center justify-center rounded-xl transition-all cursor-pointer",
                                  correctedPage === i ? "bg-blue-600 text-white shadow-md shadow-blue-600/10" : "bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200"
                                )}
                              >
                                {i}
                              </button>
                            );
                          }

                          if (endPage < maxPages) {
                            if (endPage < maxPages - 1) {
                              pages.push(<span key="ellIP-end" className="px-1 text-slate-300">...</span>);
                            }
                            pages.push(
                              <button
                                key={maxPages}
                                type="button"
                                onClick={() => setUserPage(maxPages)}
                                className={cn(
                                  "w-9 h-9 flex items-center justify-center rounded-xl transition-all cursor-pointer",
                                  correctedPage === maxPages ? "bg-blue-600 text-white shadow-md shadow-blue-600/10 animate-fade-in" : "bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200"
                                )}
                              >
                                {maxPages}
                              </button>
                            );
                          }

                          return pages;
                        })()}

                        <button
                          type="button"
                          disabled={correctedPage === maxPages}
                          onClick={() => setUserPage(prev => Math.min(maxPages, prev + 1))}
                          className={cn(
                            "p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all cursor-pointer select-none",
                            correctedPage === maxPages && "opacity-40 cursor-not-allowed hover:bg-slate-50"
                          )}
                          title="Próxima Página"
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              );
            })()}

          </motion.div>
        )}

        {activeTab === 'logs' && (
          <motion.div 
            key="logs"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-6"
          >
             <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
               <History className="text-blue-600" /> Logs de Atividade Globais da Plataforma
             </h2>
             <div className="bg-white rounded-[40px] shadow-sm border border-slate-100 overflow-hidden">
               <div className="overflow-x-auto">
                <table className="w-full text-left min-w-[800px]">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100">
                      <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-400">Data e Hora</th>
                      <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-400">Utilizador</th>
                      <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-400">Ação</th>
                      <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-400">Detalhes do Evento</th>
                      <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Moderador/Alerta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 font-mono text-xs">
                    {logs.map(log => (
                      <tr key={log.id} className={cn("hover:bg-slate-50/50 transition-colors", log.flagged && "bg-rose-50/50")}>
                        <td className="p-6 text-slate-400 font-bold">
                          {formatLogTimestamp(log.timestamp)}
                        </td>
                        <td className="p-6 text-slate-600 font-black">
                          {log.email}
                        </td>
                        <td className="p-6">
                           <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded">
                             {log.action}
                           </span>
                        </td>
                        <td className="p-6 text-slate-500">
                          {log.details}
                        </td>
                        <td className="p-6 text-right">
                           <button 
                             onClick={() => toggleFlagLog(log.id, !!log.flagged)}
                             className={cn(
                               "p-2 rounded-xl transition-all",
                               log.flagged ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-400 hover:text-rose-600"
                             )}
                             title={log.flagged ? "Resolver alerta de risco" : "Sinalizar atividade suspeita"}
                           >
                             <AlertTriangle size={16} />
                           </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
               </div>
             </div>
          </motion.div>
        )}

        {activeTab === 'proofs' && (
          <motion.div 
            key="proofs"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-6"
          >
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
              <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                <CreditCard className="text-blue-600" /> Revisão de Comprovativos de Subscrição
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase text-slate-400">Total de Pedidos:</span>
                <span className="px-3 py-1 bg-slate-100 rounded-full text-xs font-black text-slate-700">
                  {proofs.length} comprovativos
                </span>
              </div>
            </div>

            <div className="bg-white rounded-[40px] shadow-sm border border-slate-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left min-w-[1200px] border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100">
                      <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Business Name</th>
                      <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Owner Email</th>
                      <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Plan Requested</th>
                      <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Amount</th>
                      <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Payment Method</th>
                      <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Transaction Reference</th>
                      <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Payment Date</th>
                      <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Submitted At</th>
                      <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">Screenshot</th>
                      <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {proofs.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="p-12 text-center text-slate-400 font-bold">
                          Nenhum comprovativo de pagamento submetido até ao momento.
                        </td>
                      </tr>
                    ) : (
                      proofs.map((proof) => (
                        <tr key={proof.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-4">
                            <span className="font-extrabold text-slate-900">{proof.businessName || 'Sem Nome'}</span>
                          </td>
                          <td className="p-4">
                            <span className="text-xs font-semibold text-slate-600">{proof.ownerEmail || 'Não fornecido'}</span>
                          </td>
                          <td className="p-4">
                            <span className="text-xs font-black uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-1 rounded-xl">
                              {proof.plan || proof.planType || 'Básico'}
                            </span>
                          </td>
                          <td className="p-4">
                            <span className="font-black text-slate-950 text-sm whitespace-nowrap">{proof.amount || '500'} MZN</span>
                          </td>
                          <td className="p-4">
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-700 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg">
                              {proof.paymentMethod === 'bank_transfer' || proof.method === 'bank_transfer' ? 'Millennium BIM' :
                               proof.paymentMethod === 'emola' || proof.method === 'emola' ? 'e-Mola' : 'M-Pesa'}
                            </span>
                          </td>
                          <td className="p-4">
                            <span className="font-mono text-xs bg-slate-50 border border-slate-100 px-2 py-0.5 rounded text-slate-800 break-all select-all">
                              {proof.transactionReference || 'Nenhuma'}
                            </span>
                          </td>
                          <td className="p-4 text-xs font-bold text-slate-600">
                            {proof.paymentDate || 'Não informada'}
                          </td>
                          <td className="p-4 text-slate-500 font-semibold text-xs whitespace-nowrap">
                            {proof.submittedAt ? new Date(proof.submittedAt).toLocaleString('pt-MZ') : 'Desconhecida'}
                          </td>
                          <td className="p-4">
                            <div className="flex justify-center">
                              {proof.screenshot || proof.screenshotURL ? (
                                <button
                                  type="button"
                                  onClick={() => setEnlargedScreenshot(proof.screenshot || proof.screenshotURL)}
                                  className="w-12 h-12 bg-slate-100 rounded-xl overflow-hidden relative group shrink-0 border border-slate-200 hover:brightness-90 transition-all flex items-center justify-center cursor-pointer shadow-sm"
                                  title="Visualizar em tamanho grande"
                                >
                                  <img src={proof.screenshot || proof.screenshotURL} alt="Screenshot proof" className="w-full h-full object-cover" />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                                    <Eye size={14} />
                                  </div>
                                </button>
                              ) : (
                                <span className="text-xs text-slate-400 italic">Sem imagem</span>
                              )}
                            </div>
                          </td>
                          <td className="p-4 text-right">
                            {proof.status === 'pending' ? (
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleApproveProof(proof)}
                                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-widest rounded-lg transition-all shadow-md shadow-emerald-500/10 flex items-center gap-1 cursor-pointer"
                                  title="Aprovar pagamento e estender acesso"
                                >
                                  <CheckCircle2 size={12} /> APROVAR
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedProofForAction(proof);
                                    setIsRejecting(true);
                                  }}
                                  className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-black uppercase tracking-widest rounded-lg transition-all shadow-md shadow-rose-500/10 flex items-center gap-1 cursor-pointer"
                                  title="Recusar comprovativo por divergência"
                                >
                                  <XCircle size={12} /> REJEITAR
                                </button>
                              </div>
                            ) : (
                              <div className="flex justify-end">
                                <span className={cn(
                                  "px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-widest inline-flex items-center gap-1",
                                  proof.status === 'approved' ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                                )}>
                                  {proof.status === 'approved' ? 'APROVADO' : 'REJEITADO'}
                                </span>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'businesses' && (
           <motion.div 
             key="businesses"
             initial={{ opacity: 0, y: 20 }}
             animate={{ opacity: 1, y: 0 }}
             className="space-y-6"
           >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                 <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                    <Building2 className="text-blue-600" /> Diretório de Empresas e Negócios
                 </h2>
                 <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <div className="relative group flex-1 sm:flex-initial">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                      <input 
                        className="pl-12 pr-6 py-4 bg-white border border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-blue-100 transition-all font-bold text-sm w-full md:w-80 shadow-sm"
                        placeholder="Pesquisar por nome ou ID..."
                        value={bizSearchTerm}
                        onChange={e => setBizSearchTerm(e.target.value)}
                      />
                    </div>
                    <button
                      onClick={() => setIsCreatingBusiness(true)}
                      className="px-6 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-blue-500/10 flex items-center justify-center gap-2"
                    >
                      <Plus size={16} /> Criar Empresa
                    </button>
                 </div>
              </div>

              <AnimatePresence>
                 {isCreatingBusiness && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="overflow-hidden"
                    >
                       <form onSubmit={handleCreateBusiness} className="bg-white p-6 md:p-8 rounded-[40px] border border-slate-100 shadow-xl space-y-6">
                          <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                             <div>
                                <h3 className="text-lg font-black text-slate-900">Criar Nova Entrada de Negócio</h3>
                                <p className="text-xs text-slate-400 font-bold">Introduza os dados da empresa e o ID do proprietário administrador</p>
                             </div>
                             <button 
                               type="button"
                               onClick={() => {
                                 setIsCreatingBusiness(false);
                                 setNewBizName('');
                                 setNewBizOwnerId('');
                               }}
                               className="p-2 ml-auto hover:bg-slate-100 rounded-xl text-slate-400 transition-all"
                             >
                                <XCircle size={20} />
                             </button>
                          </div>

                          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                             <div>
                                <label className="block text-xs font-black uppercase text-slate-400 tracking-widest mb-2 leading-none">Nome da Empresa</label>
                                <input 
                                  className="w-full p-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-900 placeholder:text-slate-300 transition-all text-sm"
                                  placeholder="Ex: Sabush Limitada"
                                  value={newBizName}
                                  onChange={e => setNewBizName(e.target.value)}
                                  required
                                />
                             </div>

                             <div>
                                <label className="block text-xs font-black uppercase text-slate-400 tracking-widest mb-2 leading-none">ID do Proprietário (Owner ID)</label>
                                <input 
                                  className="w-full p-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-mono font-bold text-slate-900 placeholder:text-slate-300 transition-all text-sm"
                                  placeholder="Insira o UID do Utilizador"
                                  value={newBizOwnerId}
                                  onChange={e => setNewBizOwnerId(e.target.value)}
                                  required
                                />
                             </div>

                             <div>
                                <label className="block text-xs font-black uppercase text-slate-400 tracking-widest mb-2 leading-none">Plano de Subscrição</label>
                                <select 
                                  className="w-full p-4 bg-slate-50 border-none rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-black uppercase text-slate-700 cursor-pointer transition-all text-sm"
                                  value={newBizPlan}
                                  onChange={e => setNewBizPlan(e.target.value)}
                                >
                                   <option value="free">Free</option>
                                   <option value="starter">Starter</option>
                                   <option value="pro">Pro</option>
                                   <option value="premium">Premium</option>
                                   <option value="enterprise">Enterprise</option>
                                </select>
                             </div>
                          </div>

                          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pt-4 border-t border-slate-100">
                             <div>
                                <label className="block text-xs font-black uppercase text-slate-400 tracking-widest mb-1.5 leading-none">Moeda Comercial</label>
                                <select 
                                  className="p-3 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-black text-slate-700 cursor-pointer text-xs"
                                  value={newBizCurrency}
                                  onChange={e => setNewBizCurrency(e.target.value)}
                                >
                                   <option value="MZN">Metical (MZN)</option>
                                   <option value="USD">Dólar (USD)</option>
                                   <option value="EUR">Euro (EUR)</option>
                                </select>
                             </div>
                             <div className="flex gap-3 w-full sm:w-auto justify-end">
                               <button
                                 type="button"
                                 onClick={() => {
                                   setIsCreatingBusiness(false);
                                   setNewBizName('');
                                   setNewBizOwnerId('');
                                 }}
                                 className="px-6 py-3.5 text-slate-500 font-bold rounded-2xl hover:bg-slate-100 text-xs uppercase tracking-wider transition-colors"
                               >
                                 Cancelar
                               </button>
                               <button 
                                 type="submit"
                                 className="px-8 py-3.5 bg-blue-600 text-white font-black rounded-2xl hover:bg-blue-700 text-xs uppercase tracking-widest transition-all shadow-lg shadow-blue-500/20"
                               >
                                 Registar Negócio
                               </button>
                             </div>
                          </div>
                       </form>
                    </motion.div>
                 )}
              </AnimatePresence>

              <div className="bg-white rounded-[40px] shadow-sm border border-slate-100 overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-50 bg-slate-50/50">
                      <th className="p-8 text-[10px] font-black text-slate-400 uppercase tracking-widest">Empresa / ID do Sistema</th>
                      <th className="p-8 text-[10px] font-black text-slate-400 uppercase tracking-widest">Estado de Assinatura</th>
                      <th className="p-8 text-[10px] font-black text-slate-400 uppercase tracking-widest">Plano do Sistema</th>
                      <th className="p-8 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Controlo de Acesso</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {businesses
                      .filter(biz => biz.name?.toLowerCase().includes(bizSearchTerm.toLowerCase()) || biz.id?.toLowerCase().includes(bizSearchTerm.toLowerCase()))
                      .map(biz => (
                        <tr key={biz.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-8 flex items-center gap-4">
                             <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400">
                                <Building2 size={24} />
                             </div>
                             <div>
                                <p className="font-black text-slate-900">{biz.name}</p>
                                <p className="text-xs font-bold text-slate-400 font-mono">ID: {biz.id}</p>
                                
                                {biz.redemptionRequested && (
                                  <div className="bg-amber-50/70 border border-amber-100 p-3 rounded-2xl max-w-sm mt-2">
                                    <p className="text-[10px] font-black text-amber-850 uppercase tracking-widest flex items-center gap-1.5 animate-pulse">
                                      <MessageSquare size={12} /> Pedido de Redenção do Negócio!
                                    </p>
                                    <p className="text-xs font-semibold text-amber-950 mt-1 leading-relaxed">
                                      "{biz.redemptionAppeal}"
                                    </p>
                                    <p className="text-[9px] font-bold text-slate-450 uppercase tracking-widest mt-1.5 block font-mono">
                                      {biz.redemptionRequestedAt ? new Date(biz.redemptionRequestedAt).toLocaleString() : 'Recentemente'}
                                    </p>
                                  </div>
                                )}
                             </div>
                          </td>
                          <td className="p-8">
                             <span className={cn(
                               "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest",
                               biz.subscriptionStatus === 'active' ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                             )}>
                               {biz.subscriptionStatus || 'INACTIVE'}
                             </span>
                          </td>
                          <td className="p-8">
                             <select
                               className="text-xs font-black text-slate-700 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer transition-colors"
                               value={biz.subscriptionPlan || 'free'}
                               onChange={(e) => updateBusinessPlan(biz.id, biz.name, e.target.value)}
                             >
                               <option value="free">Free</option>
                               <option value="starter">Starter</option>
                               <option value="pro">Pro</option>
                               <option value="premium">Premium</option>
                               <option value="enterprise">Enterprise</option>
                             </select>
                          </td>
                          <td className="p-8 text-right">
                             <div className="flex justify-end items-center gap-2.5">
                               <button 
                                 onClick={() => toggleBusinessStatus(biz.id, biz.subscriptionStatus)}
                                 className={cn(
                                   "px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all text-white cursor-pointer",
                                   biz.subscriptionStatus === 'suspended' ? "bg-emerald-600 shadow-emerald-600/20" : "bg-slate-900 shadow-slate-900/20"
                                 )}
                               >
                                 {biz.subscriptionStatus === 'suspended' ? 'Ativar Negócio' : 'Suspender Negócio'}
                               </button>
                               <button 
                                 onClick={() => {
                                   setDeleteType('business');
                                   setDeleteTargetId(biz.id);
                                   setDeleteTargetName(biz.name);
                                 }}
                                 className="p-3 bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white rounded-2xl transition-all shadow-sm cursor-pointer"
                                 title="Eliminar Negócio"
                                >
                                 <Trash2 size={16} />
                               </button>
                             </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
           </motion.div>
        )}
      </AnimatePresence>

       {/* Deletion Reason Confirmation Modal */}
       {activeTab === 'owners' && (
          <motion.div 
            key="owners"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            {/* Header section with Title and Search */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                  <Users className="text-blue-600" /> Diretório de Proprietários de Negócios
                </h2>
                <p className="text-slate-500 text-xs font-bold mt-1">
                  Registo consolidado de fundadores e gestores de topo (Business Owners) registados na plataforma Sabush.
                </p>
              </div>

              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                <input 
                  className="pl-12 pr-6 py-4 bg-white border border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-blue-100 transition-all font-bold text-sm w-full md:w-96 shadow-sm"
                  placeholder="Pesquisar por nome, empresa, e-mail..."
                  value={ownerSearchTerm}
                  onChange={e => setOwnerSearchTerm(e.target.value)}
                />
              </div>
            </div>

            {/* Bento statistics grid */}
            {(() => {
              const allOwners = users.filter(u => {
                const role = u.role?.toLowerCase() || '';
                return role === 'business_owner' || role === 'owner';
              });
              const activeCount = allOwners.filter(o => o.accountStatus === 'active').length;
              const pendingCount = allOwners.filter(o => o.accountStatus === 'pending' || !o.accountStatus).length;
              const suspendedCount = allOwners.filter(o => o.accountStatus === 'suspended' || o.accountStatus === 'banned').length;

              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                      <Users size={24} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase text-slate-400">Total Donos</p>
                      <p className="text-2xl font-black text-slate-900">{allOwners.length}</p>
                    </div>
                  </div>
                  <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
                      <UserCheck size={24} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase text-slate-400">Ativos</p>
                      <p className="text-2xl font-black text-slate-900">{activeCount}</p>
                    </div>
                  </div>
                  <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600">
                      <Clock size={24} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase text-slate-400">Pendentes</p>
                      <p className="text-2xl font-black text-slate-900">{pendingCount}</p>
                    </div>
                  </div>
                  <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-600">
                      <Ban size={24} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase text-slate-400">Suspensos</p>
                      <p className="text-2xl font-black text-slate-900">{suspendedCount}</p>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* List Table */}
            <div className="bg-white rounded-[40px] shadow-sm border border-slate-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left min-w-[900px]">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100 font-sans">
                      <th className="p-8 text-[10px] font-black uppercase tracking-widest text-slate-400">Proprietário / Titular</th>
                      <th className="p-8 text-[10px] font-black uppercase tracking-widest text-slate-400">Empresa / Negócio Vinculado</th>
                      <th className="p-8 text-[10px] font-black uppercase tracking-widest text-slate-400">Contactos Rápidos</th>
                      <th className="p-8 text-[10px] font-black uppercase tracking-widest text-slate-400">Adesão</th>
                      <th className="p-8 text-[10px] font-black uppercase tracking-widest text-slate-400">Estado</th>
                      <th className="p-8 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Acções</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {(() => {
                      const list = users.filter(u => {
                        const role = u.role?.toLowerCase() || '';
                        const isOwner = role === 'business_owner' || role === 'owner';
                        if (!isOwner) return false;

                        const sTerm = ownerSearchTerm.toLowerCase();
                        const nameMatch = (u.displayName || '').toLowerCase().includes(sTerm);
                        const emailMatch = (u.email || '').toLowerCase().includes(sTerm);
                        const phoneMatch = (u.phoneNumber || '').toLowerCase().includes(sTerm);

                        const biz = businesses.find(b => b.id === u.businessId);
                        const bizNameMatch = (biz?.name || '').toLowerCase().includes(sTerm);

                        return nameMatch || emailMatch || phoneMatch || bizNameMatch;
                      });

                      if (list.length === 0) {
                        return (
                          <tr>
                            <td colSpan={6} className="p-12 text-center">
                              <div className="flex flex-col items-center justify-center space-y-2">
                                <Users className="text-slate-300 w-12 h-12" />
                                <p className="text-sm font-bold text-slate-500">Nenhum proprietário de negócio encontrado.</p>
                                <p className="text-xs text-slate-400">Modifique a sua pesquisa para tentar novamente.</p>
                              </div>
                            </td>
                          </tr>
                        );
                      }

                      return list.map(u => {
                        const biz = businesses.find(b => b.id === u.businessId);
                        
                        const formatRegDate = (timestamp: any) => {
                          if (!timestamp) return 'Sem Data';
                          if (typeof timestamp.toDate === 'function') {
                            return timestamp.toDate().toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
                          }
                          const date = new Date(timestamp);
                          if (isNaN(date.getTime())) return 'Sem Data';
                          return date.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
                        };

                        return (
                          <tr key={u.id} className="hover:bg-slate-50/50 transition-colors group">
                            {/* Proprietor details */}
                            <td className="p-8 font-sans font-medium">
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-slate-100 border border-slate-200 text-slate-800 rounded-2xl flex items-center justify-center font-black text-sm shadow-sm group-hover:bg-slate-900 group-hover:text-white transition-all">
                                  {u.displayName?.[0] || u.email?.[0] || '?'}
                                </div>
                                <div>
                                  <p className="font-black text-slate-900">{u.displayName || 'Proprietário Sem Nome'}</p>
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">UID: {u.uid?.slice(0, 8)}...</span>
                                </div>
                              </div>
                            </td>

                            {/* Business Linked */}
                            <td className="p-8 font-sans font-medium">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center text-slate-400 shrink-0">
                                  <Building2 size={16} />
                                </div>
                                <div className="max-w-[200px] truncate">
                                  <p className="font-bold text-slate-800 text-sm truncate">{biz?.name || 'Sem Empresa Vinculada / Demo'}</p>
                                  {biz?.subscriptionPlan && (
                                    <span className="inline-block mt-0.5 px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-[9px] font-black uppercase tracking-wider">
                                      {biz.subscriptionPlan} • {biz.subscriptionStatus || 'trial'}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* Contact Details */}
                            <td className="p-8 font-sans font-medium">
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
                                  <Mail size={12} className="text-slate-400" />
                                  <a href={`mailto:${u.email}`} className="hover:underline hover:text-blue-600 transition-colors font-bold">{u.email}</a>
                                </div>
                                {u.phoneNumber ? (
                                  <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
                                    <Phone size={12} className="text-slate-400" />
                                    <span className="font-mono text-[11px] font-bold">{u.phoneNumber}</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5 text-xs text-slate-400 italic font-mono">
                                    <Phone size={12} className="text-slate-300" />
                                    <span>Nenhum telefone</span>
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* Onboarding Time */}
                            <td className="p-8 text-xs text-slate-500 font-bold font-sans font-medium">
                              <div className="flex items-center gap-1.5 label-icon">
                                <Calendar size={13} className="text-slate-300" />
                                <span>{formatRegDate(u.createdAt)}</span>
                              </div>
                            </td>

                            {/* Account Status */}
                            <td className="p-8 font-sans font-medium">
                              <span className={cn(
                                "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1.5",
                                u.accountStatus === 'active' ? "bg-emerald-50 text-emerald-600 border border-emerald-100" :
                                u.accountStatus === 'pending' ? "bg-amber-50 text-amber-600 border border-amber-100" :
                                "bg-rose-50 text-rose-600 border border-rose-100"
                              )}>
                                <span className={cn(
                                  "w-1.5 h-1.5 rounded-full",
                                  u.accountStatus === 'active' ? "bg-emerald-500" :
                                  u.accountStatus === 'pending' ? "bg-amber-500" : "bg-rose-500"
                                )} />
                                {u.accountStatus || 'PENDING'}
                              </span>
                            </td>

                            {/* Action Operations */}
                            <td className="p-8 text-right font-sans font-medium">
                              <div className="flex justify-end gap-1.5">
                                {u.accountStatus !== 'active' && (
                                  <button 
                                    onClick={() => handleActivateUser(u.id, u.email)}
                                    className="p-2.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-xl transition-all shadow-sm cursor-pointer"
                                    title="Ativar Proprietário"
                                  >
                                    <UserCheck size={16} />
                                  </button>
                                )}
                                {u.accountStatus !== 'suspended' && (
                                  <button 
                                    onClick={() => {
                                      setSuspendTargetId(u.id);
                                      setSuspendTargetEmail(u.email);
                                      setSuspendTargetName(u.displayName || u.email || 'Proprietário');
                                      setSuspensionReason('rules_non_compliance');
                                      setSuspensionEmailBody(`Olá ${u.displayName || 'Proprietário'},\n\nA sua conta de Proprietário no Sabush ERP foi suspensa pelo administrador da plataforma devido a regras em falta ou incumprimento.\n\nCaso pretenda reaver/redimir o seu acesso, por favor aceda ao painel de login e submeta um Pedido de Redenção formal indicando o seu esforço de conformidade.\n\nCumprimentos,\nEquipa de Segurança Sabush`);
                                    }}
                                    className="p-2.5 bg-orange-50 text-orange-600 hover:bg-orange-600 hover:text-white rounded-xl transition-all shadow-sm cursor-pointer"
                                    title="Suspender Proprietário"
                                  >
                                    <UserX size={16} />
                                  </button>
                                )}
                                <button 
                                  onClick={() => {
                                    setDeleteType('user');
                                    setDeleteTargetId(u.id);
                                    setDeleteTargetName(u.displayName || u.email || 'Proprietário Sem Nome');
                                  }}
                                  className="p-2.5 bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white rounded-xl transition-all shadow-sm cursor-pointer"
                                  title="Eliminar Conta"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'branding' && isBrandManager && (() => {
          const activeLogoToDisplay = previewLogoSource === 'new' && (processedPreviewUrl || originalPreviewUrl)
            ? (processedPreviewUrl || originalPreviewUrl)
            : (platformLogoUrl || '/sabush-logo.png');

          return (
            <motion.div
              key="branding"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div>
                <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                  <ImageIcon className="text-blue-600" /> Branding da Plataforma
                </h2>
                <p className="text-slate-500 text-xs font-bold mt-1">
                  Configure a identidade visual global do Sabush System ERP. As alterações afetam todos os utilizadores na página de início de sessão (Login).
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 font-sans">
                
                {/* Left Side: Real-Time Preview on Dark Glass App Panel / Simulator */}
                <div 
                  className="rounded-[40px] border border-slate-150 shadow-xl overflow-hidden flex flex-col min-h-[480px] bg-slate-900 border-none relative flex-1 text-slate-105"
                >
                  {/* Simulator Header / Tabs */}
                  <div className="p-4 bg-slate-950 border-b border-slate-800/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 z-10 w-full">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-1.5 leading-none">
                        <Sparkles size={11} className="text-blue-400" /> Simulador de Contexto Real
                      </span>
                      <span className="text-[11px] text-slate-400 font-bold mt-1">Veja como a marca se integra no ERP</span>
                    </div>
                    
                    {/* Selectors for Mockup Views */}
                    <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 self-stretch sm:self-auto justify-between sm:justify-start">
                      <button
                        type="button"
                        onClick={() => setBrandingPreviewMode('login')}
                        className={cn(
                          "px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all select-none cursor-pointer flex items-center gap-1",
                          brandingPreviewMode === 'login' 
                            ? "bg-blue-600/90 text-white shadow-md shadow-blue-600/10" 
                            : "text-slate-400 hover:text-white"
                        )}
                      >
                        <Laptop size={12} />
                        <span>Login</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setBrandingPreviewMode('navbar')}
                        className={cn(
                          "px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all select-none cursor-pointer flex items-center gap-1",
                          brandingPreviewMode === 'navbar' 
                            ? "bg-blue-600/90 text-white shadow-md shadow-blue-600/10" 
                            : "text-slate-400 hover:text-white"
                        )}
                      >
                        <LayoutDashboard size={12} />
                        <span>Menu</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setBrandingPreviewMode('invoice')}
                        className={cn(
                          "px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all select-none cursor-pointer flex items-center gap-1",
                          brandingPreviewMode === 'invoice' 
                            ? "bg-blue-600/90 text-white shadow-md shadow-blue-600/10" 
                            : "text-slate-400 hover:text-white"
                        )}
                      >
                        <FileText size={12} />
                        <span>Fatura</span>
                      </button>
                    </div>
                  </div>

                  {/* Sub-header controls: Old vs New compare */}
                  <div className="px-4 py-2 bg-slate-950/60 border-b border-slate-850/50 flex justify-between items-center text-xs text-slate-400 z-10">
                    <span className="text-[10px] font-bold uppercase text-slate-500">Visualizar imagem:</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setPreviewLogoSource('active')}
                        className={cn(
                          "px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer",
                          previewLogoSource === 'active'
                            ? "bg-slate-800 text-white border border-slate-700"
                            : "text-slate-500 hover:text-slate-300"
                        )}
                      >
                        Logo Ativo
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewLogoSource('new')}
                        disabled={!originalPreviewUrl && !processedPreviewUrl}
                        className={cn(
                          "px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed",
                          previewLogoSource === 'new'
                            ? "bg-blue-900/60 text-blue-200 border border-blue-800"
                            : "text-slate-500 hover:text-slate-300"
                        )}
                      >
                        Novo Logo {(!originalPreviewUrl && !processedPreviewUrl) && '(Nenhum)'}
                      </button>
                    </div>
                  </div>

                  {/* Simulated Content Area based on brandingPreviewMode */}
                  <div className="flex-1 flex items-center justify-center p-6 relative overflow-hidden bg-slate-950 min-h-[300px]">
                    {/* Subtle Grid Background */}
                    <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-20 pointer-events-none" />
                    
                    {brandingPreviewMode === 'login' && (
                      <motion.div 
                        key="preview_login"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="w-full max-w-sm p-8 rounded-3xl relative z-10 border border-white/5 shadow-2xl flex flex-col items-center"
                        style={{
                          background: 'rgba(15, 23, 42, 0.75)',
                          backdropFilter: 'blur(16px)',
                          WebkitBackdropFilter: 'blur(16px)',
                          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                        }}
                      >
                        {/* Logo Frame */}
                        <div className="relative mb-5 flex items-center justify-center p-2 rounded-2xl bg-white/5 border border-white/10 w-24 h-24 overflow-hidden">
                          <img 
                            src={activeLogoToDisplay} 
                            alt="Sabush System ERP"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = '/sabush-logo.png';
                            }}
                            className="max-h-full max-w-full object-contain p-1 filter drop-shadow(0px 2px 4px rgba(0,0,0,0.3))"
                          />
                        </div>

                        <h3 className="text-white font-black text-xl tracking-tight leading-none mb-1 uppercase">
                          {platformName}
                        </h3>
                        <p className="text-[9px] text-[#A8BBBF] font-black uppercase tracking-widest mb-6">{platformSlogan}</p>

                        {/* Mock Form Elements */}
                        <div className="w-full space-y-3 font-sans">
                          <div className="space-y-1.5 text-left font-sans">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-sans">E-mail</label>
                            <div className="h-10 rounded-xl bg-slate-900/60 border border-slate-800 px-3 flex items-center text-xs text-slate-500 font-sans font-medium">
                              nome@empresa.com
                            </div>
                          </div>
                          <div className="space-y-1.5 text-left font-sans">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-sans">Palavra-passe</label>
                            <div className="h-10 rounded-xl bg-slate-900/60 border border-slate-800 px-3 flex items-center justify-between text-xs text-slate-500 font-sans font-medium">
                              <span>••••••••</span>
                              <span className={cn(
                                "text-[9px] font-bold uppercase tracking-wider font-sans",
                                primaryColor === 'royal-blue' ? "text-blue-400" :
                                primaryColor === 'classic-orange' ? "text-amber-500" :
                                primaryColor === 'forest-green' ? "text-emerald-400" : "text-slate-400"
                              )}>Ver</span>
                            </div>
                          </div>
                          <button 
                            type="button" 
                            className={cn(
                              "w-full h-11 rounded-xl text-white font-extrabold text-[11px] uppercase tracking-wider shadow-lg transition-colors cursor-default",
                              primaryColor === 'royal-blue' ? "bg-[#0C3A42] shadow-blue-900/20" :
                              primaryColor === 'classic-orange' ? "bg-amber-600 shadow-amber-600/20" :
                              primaryColor === 'forest-green' ? "bg-emerald-600 shadow-emerald-600/20" :
                              "bg-slate-700 shadow-slate-700/20"
                            )}
                          >
                            Entrar na Conta
                          </button>
                        </div>
                      </motion.div>
                    )}

                    {brandingPreviewMode === 'navbar' && (
                      <motion.div 
                        key="preview_navbar"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="w-full max-w-md rounded-2xl border border-slate-850 bg-slate-900 overflow-hidden shadow-2xl relative z-10"
                      >
                        {/* Top Bar Navigation Mockup */}
                        <div className="h-14 bg-slate-950 px-4 flex items-center justify-between border-b border-slate-850">
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-16 flex items-center justify-center rounded-lg bg-white/5 border border-white/5 p-1 overflow-hidden">
                              <img 
                                src={activeLogoToDisplay} 
                                alt="Sabush System" 
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = '/sabush-logo.png';
                                }}
                                className="max-h-full max-w-full object-contain filter drop-shadow(0px 1px 2px rgba(0,0,0,0.2))"
                              />
                            </div>
                            <span className="text-[11px] font-black text-white tracking-widest leading-none">ERP</span>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="h-6 w-12 rounded bg-slate-800" />
                            <div className="h-6 w-6 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold">A</div>
                          </div>
                        </div>

                        {/* Content Area Mockup */}
                        <div className="p-4 bg-slate-900 space-y-3 font-sans">
                          <div className="flex justify-between items-center bg-slate-950/40 p-2.5 rounded-xl border border-slate-850">
                            <div className="flex items-center gap-2.5">
                              <div className="h-8 w-8 rounded-lg bg-slate-850 flex items-center justify-center text-blue-500">
                                <LayoutDashboard size={14} />
                              </div>
                              <div className="flex flex-col text-left">
                                <span className="text-[10px] text-slate-300 font-bold leading-tight">Visão Geral</span>
                                <span className="text-[8px] text-slate-500 font-medium">Painel Administrativo Activo</span>
                              </div>
                            </div>
                            <span className="text-[10px] text-slate-400 font-bold font-mono">1.250,00 MZN</span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 font-sans">
                            <div className="bg-slate-950/20 p-3 rounded-xl border border-slate-850/50 space-y-1 text-left">
                              <span className="text-[8px] text-slate-500 uppercase font-black tracking-wider font-sans">Empresa Activa</span>
                              <p className="text-[10px] text-slate-350 font-bold leading-none font-sans">Sabush Limitada</p>
                            </div>
                            <div className="bg-slate-950/20 p-3 rounded-xl border border-slate-850/50 space-y-1 text-left font-sans">
                              <span className="text-[8px] text-slate-500 uppercase font-black tracking-wider font-sans">Utilizador</span>
                              <p className="text-[10px] text-slate-350 font-bold leading-none font-sans">Administrador Principal</p>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {brandingPreviewMode === 'invoice' && (
                      <motion.div 
                        key="preview_invoice"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="w-full max-w-[325px] bg-white text-slate-800 p-5 rounded-2xl shadow-2xl relative z-10 border border-slate-100 flex flex-col font-sans text-left"
                      >
                        {/* Document Watermark Pattern */}
                        <div className="absolute top-0 right-0 p-1 bg-blue-50 text-[6px] font-black uppercase text-blue-600 rounded-bl-lg">ORIGINAL</div>
                        
                        {/* Logo and company details right aligned */}
                        <div className="flex justify-between items-start border-b border-slate-100 pb-3 mb-3">
                          <div className="flex flex-col text-left">
                            <div className="h-8 w-16 flex items-center justify-start rounded p-0.5 overflow-hidden mb-1">
                              <img 
                                src={activeLogoToDisplay} 
                                alt="Branding" 
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = '/sabush-logo.png';
                                }}
                                className="max-h-full max-w-full object-contain"
                              />
                            </div>
                            <span className="text-[8px] font-bold text-slate-800 uppercase tracking-widest leading-none">Sabush System ERP</span>
                          </div>
                          <div className="text-right text-[7px] text-slate-500 leading-normal font-medium space-y-0.5">
                            <p className="font-extrabold text-[#639922] text-[8px]">SABUSH LIMITADA</p>
                            <p>Luanda, Angola</p>
                            <p className="font-mono">NIF: 5001201995</p>
                          </div>
                        </div>

                        {/* Bill details */}
                        <div className="flex justify-between text-[7px] text-slate-500 mb-3 border-b border-slate-50 pb-2">
                          <div className="text-left space-y-0.5">
                            <p className="text-[8px] text-slate-800 font-black uppercase">Faturar a:</p>
                            <p className="font-bold text-slate-750">Cliente Genérico</p>
                            <p>Consumidor Final</p>
                          </div>
                          <div className="text-right font-medium space-y-0.5">
                            <p className="text-slate-800 font-extrabold text-[8px]">FATURA FT-2026/0129</p>
                            <p>Data: 18/06/2026</p>
                            <p className="font-mono text-[6.5px]">Cód: FT_9921_A</p>
                          </div>
                        </div>

                        {/* Bill Items */}
                        <div className="space-y-1 mb-3">
                          <div className="flex justify-between text-[6.5px] font-black text-slate-400 bg-slate-50 p-1 rounded uppercase tracking-wider">
                            <span className="w-1/2 text-left">Descrição</span>
                            <span className="w-1/4 text-center">Quant.</span>
                            <span className="w-1/4 text-right">Total</span>
                          </div>
                          <div className="flex justify-between text-[7px] p-1 font-medium border-b border-slate-50">
                            <span className="w-1/2 text-left text-slate-800 font-bold truncate">Licença Mensal - Sabush ERP</span>
                            <span className="w-1/4 text-center">1 uni</span>
                            <span className="w-1/4 text-right font-mono">1.250 MZN</span>
                          </div>
                        </div>

                        {/* Total */}
                        <div className="flex justify-end gap-3 text-right">
                          <div className="text-[7px] font-medium text-slate-500 space-y-0.5 pr-2 border-r border-slate-100">
                            <p>Subtotal:</p>
                            <p>Imposto:</p>
                          </div>
                          <div className="text-[7px] text-slate-800 leading-normal">
                            <p className="font-bold font-mono">1.250,0 MZN</p>
                            <p className="font-mono">Isento</p>
                          </div>
                        </div>

                        <div className="mt-3 pt-2 border-t border-slate-100 flex justify-between items-center mr-auto ml-0 w-full">
                          <p className="text-[6px] text-slate-400 font-bold uppercase tracking-wider text-left">Fatura gerada via ERP Sabush</p>
                          <span className="text-[6px] text-emerald-600 bg-emerald-50 px-1 py-0.5 font-bold rounded">PAGO VOID</span>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </div>

                {/* Right Side: Upload controls and guidelines */}
                <div className="bg-white p-8 md:p-10 rounded-[40px] border border-slate-150 shadow-sm flex flex-col justify-between space-y-6">
                  <div className="space-y-4">
                    <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Logo da Página de Login</h3>
                    <p className="text-slate-500 text-xs font-bold font-sans leading-relaxed">
                      Carregue o logotipo oficial para o ecrã principal de autenticação. Este logo será partilhado com todos os clientes, vendedores e parceiros que iniciem sessão no sistema.
                    </p>

                    {/* Before / After Preview Side-by-Side Panel or status panel */}
                    <div className="p-5 bg-slate-50 border border-slate-150 rounded-3xl space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Comparação Antes e Depois</span>
                        {bgRemovalStatus === 'processing' ? (
                          <span className="flex items-center gap-1 text-[10px] text-blue-600 font-extrabold animate-pulse uppercase tracking-wider">
                            <Loader2 className="animate-spin" size={10} /> Processando
                          </span>
                        ) : bgRemovalStatus === 'success' ? (
                          <span className="text-[10px] text-emerald-600 font-extrabold uppercase tracking-wider">✓ Logo Pronto</span>
                        ) : bgRemovalStatus === 'failed' ? (
                          <span className="text-[10px] text-rose-600 font-extrabold uppercase tracking-wider">✕ Falha no Processamento</span>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Pronto a Carregar</span>
                        )}
                      </div>

                      {/* Processing Indicator Message */}
                      {bgRemovalStatus === 'processing' && (
                        <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-2xl text-center space-y-1">
                          <p className="text-blue-700 text-xs font-black">A otimizar e processar o logo... aguarde</p>
                          <p className="text-blue-500 text-[10px] font-bold">Por favor, aguarde enquanto carregamos a imagem</p>
                        </div>
                      )}

                      {/* Fallback Warning and Retry Button */}
                      {bgRemovalStatus === 'failed' && (
                        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-center space-y-2">
                          <p className="text-amber-800 text-xs font-bold leading-normal font-sans">
                            ⚠️ Não foi possível otimizar ou carregar o ficheiro. Por favor, tente novamente com outro ficheiro ou formato.
                          </p>
                          <button
                            type="button"
                            onClick={handleRetryBgRemoval}
                            disabled={logoLoading}
                            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all shadow-sm active:scale-95 inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            {logoLoading ? <Loader2 className="animate-spin" size={10} /> : null}
                            <span>Tentar novamente</span>
                          </button>
                        </div>
                      )}

                      {/* Side-by-side previews */}
                      <div className="grid grid-cols-2 gap-4">
                        {/* Original (Before) Preview Container */}
                        <div className="flex flex-col items-center p-3 bg-white border border-slate-100 rounded-2xl">
                          <div className="flex items-center justify-center bg-slate-50 border border-slate-100 rounded-xl overflow-hidden mb-2 relative w-full" style={{ height: '80px' }}>
                            {originalPreviewUrl ? (
                              <img src={originalPreviewUrl} alt="Original uploaded logo" className="max-h-full max-w-full object-contain p-1" />
                            ) : platformLogoUrl ? (
                              <img src={platformLogoUrl} alt="Logo actual" className="max-h-full max-w-full object-contain p-1" />
                            ) : (
                              <div className="flex flex-col items-center justify-center text-center p-2">
                                <ImageIcon className="text-slate-350 mb-1" size={16} />
                                <span className="text-slate-300 text-[8px] font-black uppercase tracking-wider">Sabush Default</span>
                              </div>
                            )}
                          </div>
                          <span className="text-[9px] uppercase font-black text-slate-500 tracking-wider flex flex-col items-center gap-0.5">
                            <span>{originalPreviewUrl ? 'Antes (Original)' : 'Logo Ativo'}</span>
                            {beforeSizeKB !== null && beforeSizeKB > 0 && (
                              <span className="text-[10px] text-slate-400 normal-case font-bold">{beforeSizeKB} KB</span>
                            )}
                          </span>
                        </div>

                        {/* Processed (After) Preview Container with Checkerboard Background */}
                        <div className="flex flex-col items-center p-3 bg-white border border-slate-100 rounded-2xl">
                          <div 
                            className="flex items-center justify-center rounded-xl overflow-hidden mb-2 border border-slate-100 relative w-full" 
                            style={{ 
                              height: '80px', 
                              backgroundImage: 'conic-gradient(#f8fafc 0.25turn, #cbd5e1 0.25turn 0.5turn, #f8fafc 0.5turn 0.75turn, #cbd5e1 0.75turn)',
                              backgroundSize: '12px 12px',
                            }}
                          >
                            {bgRemovalStatus === 'processing' ? (
                              <div className="flex items-center justify-center">
                                <Loader2 className="animate-spin text-blue-600" size={16} />
                              </div>
                            ) : processedPreviewUrl ? (
                              <img src={processedPreviewUrl} alt="Processed transparent logo" className="max-h-full max-w-full object-contain p-1" />
                            ) : platformLogoUrl ? (
                              <img src={platformLogoUrl} alt="Logo actual" className="max-h-full max-w-full object-contain p-1 opacity-70" />
                            ) : (
                              <div className="flex flex-col items-center justify-center text-center p-2 bg-slate-900/10 backdrop-blur-[1px] w-full h-full">
                                <Sparkles className="text-slate-400 mb-1" size={16} />
                                <span className="text-slate-400 text-[8px] font-black uppercase tracking-wider">Canal Alpha</span>
                              </div>
                            )}
                          </div>
                          <span className="text-[9px] uppercase font-black text-slate-505 tracking-wider flex flex-col items-center gap-0.5">
                            <span>{processedPreviewUrl ? 'Depois (Processado)' : 'Logo Ativo'}</span>
                            {afterSizeKB !== null && afterSizeKB > 0 && (
                              <span className="text-[10px] text-emerald-600 normal-case font-bold">
                                {afterSizeKB} KB
                                {beforeSizeKB !== null && beforeSizeKB > 0 && (
                                  <span className="text-[9px] text-emerald-500 font-medium ml-1">
                                    (-{Math.round(((beforeSizeKB - afterSizeKB) / beforeSizeKB) * 100)}%)
                                  </span>
                                )}
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Upload progress bar */}
                    {logoLoading && (
                      <div className="w-full space-y-1">
                        <div className="flex justify-between items-center text-[10px] text-blue-600 font-extrabold">
                          <span>A processar / Carregar...</span>
                          <span>{uploadProgress}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            style={{ width: `${uploadProgress}%` }} 
                            className="h-full bg-blue-600 transition-all duration-300"
                          />
                        </div>
                      </div>
                    )}

                    {/* Status checklist */}
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-150 space-y-2 text-xs text-slate-600 font-sans">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                        <span>Formatos Aceites: <strong className="text-slate-800">PNG, JPG, JPEG, SVG, WEBP</strong></span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                        <span>Processamento: <strong className="text-slate-800">Logo processado e otimizado mantendo o fundo original ⚡</strong></span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                        <span>Destino: <strong className="text-slate-805 font-mono text-[10.5px]">platform/branding/logo</strong></span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4">
                    {/* Real HTML input file hidden */}
                    <label className="flex-1">
                      <input 
                        type="file" 
                        className="hidden" 
                        accept=".png,.jpg,.jpeg,.svg,.webp"
                        onChange={handleLogoUpload}
                        disabled={logoLoading}
                      />
                      <div className="h-14 px-6 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-blue-500/10 flex items-center justify-center gap-2 cursor-pointer select-none active:scale-[0.98]">
                        {logoLoading ? (
                          <>
                            <Loader2 size={16} className="animate-spin text-white" />
                            <span>A Processar...</span>
                          </>
                        ) : (
                          <>
                            <Upload size={16} />
                            <span>Alterar Logo</span>
                          </>
                        )}
                      </div>
                    </label>

                    {platformLogoUrl && (
                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        disabled={logoLoading}
                        className="px-6 h-14 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] border border-slate-100"
                      >
                        <span>Remover Logo</span>
                      </button>
                    )}
                  </div>

                  {/* Divider */}
                  <div className="h-px bg-slate-100 my-4" />

                  {/* Dynamic Rebranding Setup Panel */}
                  <div className="space-y-4 text-left font-sans">
                    <div className="flex items-center gap-2">
                      <Sparkles className="text-amber-500" size={16} />
                      <h4 className="text-xs font-black text-slate-900 uppercase tracking-tight">Personalização de Identidade Global</h4>
                    </div>

                    <p className="text-slate-500 text-[10px] font-bold leading-relaxed">
                      Personalize as cores, o nome e slogans principais que definem a plataforma para seus clientes e colaboradores em tempo real.
                    </p>

                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[9px] font-black uppercase text-slate-400 font-sans">Nome da Plataforma</label>
                          <input 
                            type="text" 
                            value={platformName}
                            onChange={(e) => setPlatformName(e.target.value)}
                            className="w-full text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-blue-500 font-sans"
                            placeholder="Ex: Sabush System"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] font-black uppercase text-slate-400 font-sans">Slogan da Plataforma</label>
                          <input 
                            type="text" 
                            value={platformSlogan}
                            onChange={(e) => setPlatformSlogan(e.target.value)}
                            className="w-full text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-blue-500 font-sans"
                            placeholder="Ex: Sabor & Gestão"
                          />
                        </div>
                      </div>

                      {/* Select Color Palettes (Responsive cards) */}
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase text-slate-400 font-sans">Palete de Cores Principal (Rebranding)</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setPrimaryColor('royal-blue')}
                            className={cn(
                              "p-2.5 rounded-xl border text-left flex flex-col justify-between h-[68px] transition-all cursor-pointer font-sans select-none",
                              primaryColor === 'royal-blue'
                                ? "border-blue-600 bg-blue-50/40"
                                : "border-slate-150 bg-slate-50 hover:bg-slate-100"
                            )}
                          >
                            <span className="text-[10px] font-extrabold text-blue-900 font-sans leading-none">Azul Professional</span>
                            <span className="text-[7.5px] text-slate-400 font-bold leading-none mt-1">Azul Escuro dominante, detalhes Amber</span>
                            <div className="flex gap-1 mt-1.5">
                              <span className="w-4 h-1.5 rounded-sm bg-[#0C3A42]" />
                              <span className="w-4 h-1.5 rounded-sm bg-[#B8791A]" />
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => setPrimaryColor('classic-orange')}
                            className={cn(
                              "p-2.5 rounded-xl border text-left flex flex-col justify-between h-[68px] transition-all cursor-pointer font-sans select-none",
                              primaryColor === 'classic-orange'
                                ? "border-amber-600 bg-amber-50/40"
                                : "border-slate-150 bg-slate-50 hover:bg-slate-100"
                            )}
                          >
                            <span className="text-[10px] font-extrabold text-amber-900 font-sans leading-none">Laranja Quente</span>
                            <span className="text-[7.5px] text-slate-400 font-bold leading-none mt-1">Laranja dominante, detalhes Azul</span>
                            <div className="flex gap-1 mt-1.5">
                              <span className="w-4 h-1.5 rounded-sm bg-amber-500" />
                              <span className="w-4 h-1.5 rounded-sm bg-[#0C3A42]" />
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => setPrimaryColor('forest-green')}
                            className={cn(
                              "p-2.5 rounded-xl border text-left flex flex-col justify-between h-[68px] transition-all cursor-pointer font-sans select-none",
                              primaryColor === 'forest-green'
                                ? "border-emerald-600 bg-emerald-50/40"
                                : "border-slate-150 bg-slate-50 hover:bg-slate-100"
                            )}
                          >
                            <span className="text-[10px] font-extrabold text-emerald-950 font-sans leading-none">Verde Floresta</span>
                            <span className="text-[7.5px] text-slate-400 font-bold leading-none mt-1">Esmeralda dominante e Mentol</span>
                            <div className="flex gap-1 mt-1.5">
                              <span className="w-4 h-1.5 rounded-sm bg-emerald-700" />
                              <span className="w-4 h-1.5 rounded-sm bg-emerald-400" />
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => setPrimaryColor('midnight-dark')}
                            className={cn(
                              "p-2.5 rounded-xl border text-left flex flex-col justify-between h-[68px] transition-all cursor-pointer font-sans select-none",
                              primaryColor === 'midnight-dark'
                                ? "border-slate-800 bg-slate-100"
                                : "border-slate-150 bg-slate-50 hover:bg-slate-100"
                            )}
                          >
                            <span className="text-[10px] font-extrabold text-slate-900 font-sans leading-none">Aço Brutalista</span>
                            <span className="text-[7.5px] text-slate-400 font-bold leading-none mt-1">Slate Escuro unificado e Marfim</span>
                            <div className="flex gap-1 mt-1.5">
                              <span className="w-4 h-1.5 rounded-sm bg-slate-800" />
                              <span className="w-4 h-1.5 rounded-sm bg-slate-200 border border-slate-300" />
                            </div>
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase text-slate-400 font-sans">Texto de Boas-vindas (Página de Login)</label>
                        <textarea 
                          rows={2}
                          value={loginWelcomeText}
                          onChange={(e) => setLoginWelcomeText(e.target.value)}
                          className="w-full text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500 font-sans"
                          placeholder="Texto de introdução no formulário de login..."
                        />
                      </div>

                      {/* Advanced Whitelabeling Toggles & Webhooks */}
                      <div className="p-3.5 bg-slate-50 border border-slate-150 rounded-2xl space-y-2.5 font-sans">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] uppercase font-black text-slate-600 tracking-wider flex items-center gap-1.5 font-sans">
                            <Globe size={11} className="text-blue-500" /> Mapeamento de Domínio Personalizado
                          </span>
                          <span className="text-[8px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 font-extrabold rounded font-sans">ATIVADO</span>
                        </div>
                        <div className="flex gap-2">
                          <input 
                            type="text"
                            value={customDomain}
                            onChange={(e) => setCustomDomain(e.target.value)}
                            className="flex-1 text-xs font-mono font-bold text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500"
                            placeholder="Ex: erp.meunegocio.com"
                          />
                        </div>
                        <div className="flex items-center justify-between text-[9px] text-slate-400 font-sans leading-none pt-1 font-bold">
                          <span>Status do DNS: <strong className="text-emerald-600 font-sans">✓ Resolvido CNAME</strong></span>
                          <span>IP de Ingress: <strong className="font-mono text-slate-500">104.21.6.14</strong></span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-150 rounded-2xl">
                        <div className="flex flex-col text-left font-sans">
                          <span className="text-[10px] font-black uppercase text-slate-700 tracking-wider">Remoção Automática de Fundo por IA</span>
                          <span className="text-[9px] text-slate-400 font-bold leading-none mt-1">Otimiza os logos removendo o fundo</span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer select-none">
                          <input 
                            type="checkbox" 
                            checked={autoBgRemoval} 
                            onChange={(e) => setAutoBgRemoval(e.target.checked)}
                            className="sr-only peer" 
                          />
                          <div className="w-8 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600" />
                        </label>
                      </div>

                      <button
                        type="button"
                        onClick={handleSaveAdvancedBranding}
                        disabled={isSavingBranding}
                        className={cn(
                          "w-full h-12 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-md active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer select-none mt-2",
                          primaryColor === 'royal-blue' ? "bg-blue-600 hover:bg-blue-700" :
                          primaryColor === 'classic-orange' ? "bg-amber-600 hover:bg-amber-700" :
                          primaryColor === 'forest-green' ? "bg-emerald-600 hover:bg-emerald-700" :
                          "bg-slate-800 hover:bg-slate-900"
                        )}
                      >
                        {isSavingBranding ? <Loader2 size={14} className="animate-spin text-white" /> : null}
                        <span>Salvar Alterações de Identidade</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-slate-100 my-6" />

              {/* Automatic & Mass Communication Dashboard */}
              <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm p-6 md:p-8 font-sans">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 text-left">
                  <div>
                    <span className="text-[10px] bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full font-black uppercase tracking-widest leading-none">
                      Poder Super Admin ⚡
                    </span>
                    <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight mt-2 flex items-center gap-2">
                      <Mail className="text-blue-600" size={18} /> Central de E-mail & Campanhas de Marketing
                    </h3>
                    <p className="text-slate-501 text-xs font-bold leading-relaxed mt-1 text-slate-500">
                      Comunique com todos os parceiros comerciais, clientes de teste ou utilizadores ativos automaticamente em tempo real.
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-150 p-1 rounded-xl self-stretch sm:self-auto justify-between">
                    <button
                      type="button"
                      onClick={() => setCampaignTarget('all')}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap",
                        campaignTarget === 'all' ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-800"
                      )}
                    >
                      Todos ({users.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setCampaignTarget('active')}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap",
                        campaignTarget === 'active' ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-800"
                      )}
                    >
                      Ativos ({users.filter(u => u.accountStatus === 'active').length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setCampaignTarget('developers')}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap",
                        campaignTarget === 'developers' ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-800"
                      )}
                    >
                      Devs de Teste (2)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left font-sans">
                  {/* Form fields */}
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase text-slate-400 font-sans">Assunto do E-mail</label>
                      <input 
                        type="text"
                        value={campaignSubject}
                        onChange={(e) => setCampaignSubject(e.target.value)}
                        className="w-full text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-blue-500 font-sans"
                        placeholder="Ex: Atualização Importante do Sistema..."
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase text-slate-400 font-sans">Corpo da Mensagem (Suporta texto livre e tags de saudação)</label>
                      <textarea 
                        rows={6}
                        value={campaignBody}
                        onChange={(e) => setCampaignBody(e.target.value)}
                        className="w-full text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500 font-sans font-mono"
                        placeholder="Escreva a mensagem aqui..."
                      />
                    </div>
                  </div>

                  {/* Information block of automated trigger points */}
                  <div className="bg-slate-50 border border-slate-150 rounded-[28px] p-5 flex flex-col justify-between font-sans">
                    <div className="space-y-3.5">
                      <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5 leading-none">
                        <Zap size={12} className="text-amber-500" /> Gatilhos de Notificações Automáticas Ativos
                      </span>
                      
                      <div className="space-y-2 text-slate-600 text-[10px] font-bold leading-normal">
                        <div className="flex gap-2.5 items-start">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                          <p>
                            <span className="text-slate-950">Ativação de Contas:</span> Envia um e-mail com link de acesso imediato automaticamente logo que o Admin ativa o utilizador ou aceita a sua subscrição.
                          </p>
                        </div>
                        <div className="flex gap-2.5 items-start">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                          <p>
                            <span className="text-slate-950">Suspensão de Contas:</span> Despacha avisos de suspensão detalhando os motivos de incumprimento técnico/comercial configurados pelo Admin.
                          </p>
                        </div>
                        <div className="flex gap-2.5 items-start">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                          <p>
                            <span className="text-slate-950">Reposição de Stock:</span> Quando um produto recebe stock no painel da PME, os clientes que compraram esse produto recebem um aviso com botão de compra imediata.
                          </p>
                        </div>
                        <div className="flex gap-2.5 items-start">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                          <p>
                            <span className="text-slate-950">Emissão de Orçamentos e Faturas:</span> Clientes de retalho recebem e-mails profissionais com dados de IBAN para pagamento seguro na hora.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-200 mt-4 flex flex-col sm:flex-row gap-3">
                      <button
                        type="button"
                        onClick={handleSendMarketingCampaign}
                        disabled={isSendingCampaign}
                        className={cn(
                          "flex-1 h-11 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-md active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer select-none",
                          primaryColor === 'royal-blue' ? "bg-slate-900 hover:bg-slate-950" :
                          primaryColor === 'classic-orange' ? "bg-amber-600 hover:bg-amber-700" :
                          primaryColor === 'forest-green' ? "bg-emerald-700 hover:bg-emerald-800" :
                          "bg-slate-800 hover:bg-slate-900"
                        )}
                      >
                        {isSendingCampaign ? <Loader2 size={12} className="animate-spin text-white" /> : <Send size={12} />}
                        <span>Enviar Campanhas ({campaignTarget === 'all' ? 'Todos' : campaignTarget === 'active' ? 'Ativos' : 'Teste Devs'})</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })()}

        {activeTab === 'branding' && !isBrandManager && profile?.role?.toLowerCase() === 'super_admin' && (
          <motion.div
            key="branding_locked"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center p-12 bg-white rounded-[40px] border border-slate-100 shadow-sm text-center max-w-lg mx-auto space-y-6"
          >
            <div className="w-16 h-16 bg-rose-50 border border-rose-100 rounded-full flex items-center justify-center text-3xl shadow-sm text-rose-500">
              🔒
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Acesso Restrito ao Super Admin</h3>
              <p className="text-slate-501 text-xs font-bold leading-relaxed text-slate-500">
                Apenas o Super Admin principal pode alterar o logotipo ou as diretrizes visuais da plataforma. Se necessitar de apoio, contacte o programador geral de suporte de sistemas Sabush.
              </p>
            </div>
            
            {/* Tooltip feedback panel */}
            <div className="py-2 px-4 bg-slate-50 border border-slate-150 rounded-xl text-[10px] uppercase font-black tracking-wider text-slate-400">
              Apenas o Super Admin pode alterar o logo da plataforma
            </div>
          </motion.div>
        )}

       {/* Deletion Reason Confirmation Modal */}
       <AnimatePresence>
         {deleteType && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 font-sans overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-white rounded-[40px] max-w-lg w-full max-h-[90vh] overflow-y-auto p-8 md:p-10 border border-slate-100 shadow-2xl space-y-6"
            >
              <div className="flex items-start gap-4 text-rose-600">
                <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center shrink-0">
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-950">Exclusão Permanente</h3>
                  <p className="text-xs text-rose-500 font-bold mt-1">Atenção: Esta ação é irreversível e removerá todos os dados anexados permanentemente.</p>
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-1.5">
                <p className="text-[10px] font-black uppercase text-slate-400">Elemento a Eliminar</p>
                <p className="text-sm font-black text-slate-800">{deleteTargetName}</p>
                <p className="text-[10px] font-mono font-bold text-slate-400">ID: {deleteTargetId} ({deleteType === 'user' ? 'Utilizador' : 'Empresa/Negócio'})</p>
              </div>

              <div className="space-y-4">
                <label className="block text-xs font-black uppercase text-slate-500 tracking-wider">Selecione o Motivo de Exclusão</label>
                <div className="space-y-2">
                  {[
                    { id: 'rules_non_compliance', label: 'Não conformidade com os regulamentos do software' },
                    { id: 'testing_only', label: 'Utilizador apenas para teste / avaliação' },
                    { id: 'suspended_abandoned', label: 'Conta suspensa há muito tempo (Não reclamada)' },
                    { id: 'inactivity_cleanup', label: 'Inatividade prolongada (+90 dias / Prevenção de lixo)' },
                    { id: 'other', label: 'Outro motivo razoável / Justificação personalizada' }
                  ].map((preset) => (
                    <label 
                      key={preset.id} 
                      className={cn(
                        "flex items-center gap-3 p-3.5 border rounded-2xl cursor-pointer transition-all text-xs font-bold text-slate-750 hover:bg-slate-50",
                        deleteReason === preset.id ? "border-rose-200 bg-rose-50/20 text-slate-900 font-black" : "border-slate-100"
                      )}
                    >
                      <input 
                        type="radio" 
                        name="deleteReason" 
                        value={preset.id} 
                        checked={deleteReason === preset.id} 
                        onChange={() => setDeleteReason(preset.id)}
                        className="text-rose-600 focus:ring-rose-500 h-4 w-4 border-slate-300 pointer-events-none"
                      />
                      <span>{preset.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-black uppercase text-slate-500 tracking-wider">Notas Adicionais (Opcional)</label>
                <textarea
                  className="w-full p-4 bg-slate-50 rounded-2xl outline-none border border-slate-100 focus:border-rose-500 focus:ring-2 focus:ring-rose-100 text-xs font-medium text-slate-800 placeholder:text-slate-400 resize-none h-20"
                  placeholder="Escreva notas adicionais explicando esta decisão (estas notas serão guardadas permanentemente nos logs de auditoria)..."
                  value={deleteCustomDetail}
                  onChange={e => setDeleteCustomDetail(e.target.value)}
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => {
                    setDeleteType(null);
                    setDeleteTargetId(null);
                    setDeleteTargetName(null);
                    setDeleteReason('rules_non_compliance');
                    setDeleteCustomDetail('');
                  }}
                  className="px-6 py-3.5 font-bold hover:bg-slate-100 rounded-2xl text-slate-500 text-xs uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleDeleteConfirmation}
                  className="px-8 py-3.5 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-2xl text-xs uppercase tracking-widest transition-all shadow-lg shadow-rose-500/20 flex items-center gap-2 cursor-pointer"
                >
                  {isDeleting ? 'A eliminar...' : 'Eliminar Permanentemente'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {suspendTargetId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 font-sans animate-fade-in overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-white rounded-[40px] max-w-lg w-full max-h-[90vh] overflow-y-auto p-8 md:p-10 border border-slate-100 shadow-2xl space-y-6 text-slate-900"
            >
              <div className="flex items-start gap-4 text-orange-600">
                <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center shrink-0">
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-950">Suspender Conta & Enviar Aviso de Email</h3>
                  <p className="text-xs text-orange-500 font-bold mt-1">Insira o motivo legal ou comercial e personalize o e-mail de aviso antes de suspender.</p>
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-1.5 font-sans">
                <p className="text-[10px] font-black uppercase text-slate-400">Utilizador a Suspender</p>
                <p className="text-sm font-black text-slate-800">{suspendTargetName}</p>
                <p className="text-[10px] font-mono font-bold text-slate-400">Email: {suspendTargetEmail} | ID: {suspendTargetId}</p>
              </div>

              <div className="space-y-4">
                <label className="block text-xs font-black uppercase text-slate-500 tracking-wider">Selecione o Motivo da Suspensão</label>
                <div className="space-y-2">
                  {[
                    { id: 'rules_non_compliance', label: 'Não conformidade com os regulamentos ou termos do software' },
                    { id: 'billing_issue', label: 'Problema de faturamento ou atraso de pagamento' },
                    { id: 'suspicious_activity', label: 'Atividades excessivas ou suspeitas no sistema' },
                    { id: 'other_warning', label: 'Outro motivo de aviso temporário' }
                  ].map((preset) => (
                    <label 
                      key={preset.id} 
                      className={cn(
                        "flex items-center gap-3 p-3.5 border rounded-2xl cursor-pointer transition-all text-xs font-bold text-slate-700 hover:bg-slate-50",
                        suspensionReason === preset.id ? "border-orange-200 bg-orange-50/20 text-slate-900 font-black" : "border-slate-100"
                      )}
                    >
                      <input 
                        type="radio" 
                        name="suspensionReason" 
                        value={preset.id} 
                        checked={suspensionReason === preset.id} 
                        onChange={() => setSuspensionReason(preset.id)}
                        className="text-orange-600 focus:ring-orange-500 h-4 w-4 border-slate-300 pointer-events-none"
                      />
                      <span>{preset.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-black uppercase text-slate-500 tracking-wider">Aviso de Email Personalizado (Mensagem do Aviso)</label>
                <textarea
                  className="w-full p-4 bg-slate-50 rounded-2xl outline-none border border-slate-100 focus:border-orange-500 focus:ring-2 focus:ring-orange-100 text-xs font-medium text-slate-800 placeholder:text-slate-400 resize-none h-28 font-mono"
                  placeholder="Olá..."
                  value={suspensionEmailBody}
                  onChange={e => setSuspensionEmailBody(e.target.value)}
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  disabled={isSuspending}
                  onClick={() => {
                    setSuspendTargetId(null);
                    setSuspendTargetEmail(null);
                    setSuspendTargetName(null);
                  }}
                  className="px-6 py-3.5 font-bold hover:bg-slate-100 rounded-2xl text-slate-500 text-xs uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isSuspending}
                  onClick={handleSuspendConfirmation}
                  className="px-8 py-3.5 bg-orange-600 hover:bg-orange-700 text-white font-black rounded-2xl text-xs uppercase tracking-widest transition-all shadow-lg shadow-orange-500/20 flex items-center gap-2 cursor-pointer"
                >
                  {isSuspending ? 'A suspender...' : 'Suspender & Enviar Aviso'}
                </button>
              </div>
            </motion.div>
          </motion.div>
         )}

        {/* Rejection Note modal */}
        {isRejecting && selectedProofForAction && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[150] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 text-slate-900 overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-md bg-white rounded-[40px] shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <form onSubmit={handleRejectProof}>
                <div className="p-8 md:p-10 space-y-6">
                  <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                    <div>
                      <h3 className="text-xl font-black">Rejeitar Comprovativo</h3>
                      <p className="text-xs text-slate-400 font-bold mt-1">Indique o motivo pelo qual este comprovativo foi rejeitado</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsRejecting(false);
                        setSelectedProofForAction(null);
                        setRejectionNotes('');
                      }}
                      className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl"
                    >
                      <XCircle size={20} />
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider">Selecionar Categoria da Rejeição</label>
                      <select
                        onChange={(e) => {
                          if (e.target.value && e.target.value !== "outro") {
                            setRejectionNotes(e.target.value);
                          } else {
                            setRejectionNotes("");
                          }
                        }}
                        className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-800 text-sm transition-all"
                      >
                        <option value="">-- Escolha um motivo predefinido --</option>
                        <option value="Valor transferido menor que o valor correto do plano selecionado.">Valor incorrecto (menor que o plano)</option>
                        <option value="ID ou número de referência da transação inválido ou não localizado no extrato.">Referência inválida ou não localizada</option>
                        <option value="Fotografia do comprovativo desfocada, corrompida ou ilegível.">Screenshot/Foto ilegível ou cortada</option>
                        <option value="Este comprovativo de depósito já foi carregado e utilizado no sistema.">Comprovativo duplicado ou já usado</option>
                        <option value="outro">Outro motivo (escreva em baixo)</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider">Detalhar Motivo (Mensagem ao Utilizador)</label>
                      <textarea
                        placeholder="Ex: Não foi possível localizar o código de ID de transação nas contas bancárias."
                        value={rejectionNotes}
                        onChange={(e) => setRejectionNotes(e.target.value)}
                        className="w-full min-h-[120px] p-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-800 placeholder:text-slate-350 transition-all text-sm resize-none"
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 p-8 border-t border-slate-50 bg-slate-50/50">
                  <button
                    type="button"
                    onClick={() => {
                      setIsRejecting(false);
                      setSelectedProofForAction(null);
                      setRejectionNotes('');
                    }}
                    className="px-6 py-3 text-slate-500 font-bold rounded-xl hover:bg-slate-100 text-xs uppercase"
                  >
                    Mudar de Ideia
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-3 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl text-xs uppercase tracking-wider transition-colors shadow-md"
                  >
                    Confirmar Rejeição
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}

        {/* Screenshot Image lightbox enlargement */}
        {enlargedScreenshot && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setEnlargedScreenshot(null)}
            className="fixed inset-0 z-[160] bg-black/85 flex items-center justify-center p-6 cursor-pointer"
          >
            <motion.div
              initial={{ scale: 0.92 }}
              animate={{ scale: 1 }}
              className="max-w-4xl max-h-[85vh] overflow-hidden rounded-3xl bg-white border border-slate-700 shadow-2xl relative"
            >
              <img src={enlargedScreenshot} alt="Comprovativo ampliado" className="max-w-full max-h-[80vh] object-contain mx-auto" />
              <div className="p-4 bg-slate-900 text-center text-white text-xs font-black uppercase tracking-widest leading-none">
                Clique fora para regressar ao painel
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, trend }: any) {
  return (
    <div className="bg-white p-8 rounded-[40px] shadow-sm border border-slate-100 space-y-6 relative group hover:scale-[1.02] transition-all duration-300">
      <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-xl", color)}>
        <Icon size={28} />
      </div>
      <div>
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">{title}</h3>
        <p className="text-3xl font-black text-slate-900">{value}</p>
        <div className="mt-2">
          <span className={cn(
            "px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest",
            trend?.includes('New') || trend?.includes('Approvals') ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"
          )}>
            {trend}
          </span>
        </div>
      </div>
    </div>
  );
}
