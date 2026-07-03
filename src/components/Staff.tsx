import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType, firebaseConfig } from '../lib/firebase';
import { subscribeToCollection } from '../lib/firestoreCache';
import { collection, query, onSnapshot, doc, setDoc, serverTimestamp, getDocs, where } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Users, Shield, ShieldCheck, ShieldAlert, Mail, Lock, Trash2, Key, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { logAction, ActionType } from '../lib/logger';

export default function Staff() {
  const { profile, businessData } = useAuth();
  const [staff, setStaff] = useState<any[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const currentPlan = (businessData?.subscription?.plan || businessData?.subscriptionPlan || 'basico').toLowerCase();
  const isTeamLimitReached = () => {
    if (profile?.role?.toLowerCase() === 'super_admin' || profile?.email === 'mascenisabush@gmail.com') {
      return false;
    }
    if (currentPlan === 'basico' && staff.length >= 1) {
      return true;
    }
    return false;
  };
  
  const [newMember, setNewMember] = useState({
    email: '',
    role: 'staff',
    name: '',
    password: ''
  });

  useEffect(() => {
    if (!profile?.businessId) return;
    
    // In a real app, you'd query users by businessId
    const q = query(collection(db, 'users'), where('businessId', '==', profile.businessId));
    const unsubscribe = subscribeToCollection(
      `users-business-${profile.businessId}`,
      (items) => {
        setStaff(items);
      },
      q,
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, 'users');
        } catch (e) {
          console.warn("Gracefully logged users query error:", e);
        }
      }
    );

    return unsubscribe;
  }, [profile?.businessId]);

  const isAdmin = 
    profile?.role === 'owner' || 
    profile?.role === 'business_owner' || 
    profile?.role === 'admin' || 
    profile?.role?.toLowerCase() === 'super_admin';

  const handleAddStaff = async () => {
    if (!isAdmin) {
      toast.error("Sem permissão para registar novos colaboradores.");
      return;
    }

    if (isTeamLimitReached()) {
      toast.error("O Plano Básico suporta no máximo 1 colaborador (si próprio). Faça upgrade para o plano Pro para adicionar colaboradores à sua equipa.");
      return;
    }

    if (!newMember.email || !newMember.name || !newMember.password) {
      toast.error("Por favor, preencha todos os campos obrigatórios (incluindo senha).");
      return;
    }

    if (newMember.password.length < 6) {
      toast.error("A senha deve ter no mínimo 6 caracteres.");
      return;
    }
    
    setIsRegistering(true);
    const toastId = toast.loading("A criar conta do colaborador no sistema de autenticação...");
    
    try {
      // 1. Initialize temporary app to create credentials without signing out current admin
      const tempAppName = `TempApp_${Date.now()}`;
      const tempApp = initializeApp(firebaseConfig, tempAppName);
      const tempAuth = getAuth(tempApp);
      
      // 2. Create the user credential
      const userCredential = await createUserWithEmailAndPassword(
        tempAuth, 
        newMember.email.trim(), 
        newMember.password
      );
      
      const newUid = userCredential.user.uid;
      
      // Delete temporary App
      await deleteApp(tempApp);

      // 3. Store user record in 'users' collection with businessId & parentAdminId
      const userProfile = {
        uid: newUid,
        email: newMember.email.trim(),
        displayName: newMember.name.trim(),
        phoneNumber: '',
        role: newMember.role,
        accountStatus: 'active',
        termsAccepted: true, // Bypass to make co-worker setup streamlined
        preferredLanguage: 'pt',
        businessId: profile.businessId,
        parentAdminId: profile.uid,
        createdAt: new Date().toISOString(),
        lastLogin: ''
      };

      await setDoc(doc(db, 'users', newUid), userProfile);

      // Log the action administratively
      await logAction(
        profile.uid, 
        profile.email, 
        ActionType.CREATE_STAFF, 
        `Registo de colaborador: ${newMember.name.trim()} (${newMember.role})`, 
        profile.businessId
      );

      toast.success(`Colaborador "${newMember.name.trim()}" registado com sucesso!`, { id: toastId });
      setIsAdding(false);
      
      setNewMember({
        email: '',
        role: 'staff',
        name: '',
        password: ''
      });
    } catch (e: any) {
      console.error(e);
      let errMsg = e.message || String(e);
      if (e.code === 'auth/email-already-in-use') {
        errMsg = "Este email já está a ser utilizado por outro utilizador.";
      }
      toast.error(`Falha ao registar colaborador: ${errMsg}`, { id: toastId });
    } finally {
      setIsRegistering(false);
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner': return <ShieldCheck className="text-blue-600" size={18} />;
      case 'manager': return <Shield className="text-emerald-600" size={18} />;
      default: return <Users className="text-slate-400" size={18} />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900">Team & Access</h2>
          <p className="text-slate-500">Manage employee roles and system permissions.</p>
        </div>
        {isAdmin ? (
          <button 
            onClick={() => {
              if (isTeamLimitReached()) {
                toast.error("O Plano Básico suporta no máximo 1 colaborador (si próprio). Faça upgrade para o plano Pro para adicionar colaboradores à sua equipa.");
                return;
              }
              setIsAdding(true);
            }}
            className={cn(
              "flex items-center gap-2 px-6 py-2.5 rounded-2xl font-bold shadow-lg transition-all active:scale-95",
              isTeamLimitReached()
                ? "bg-amber-100 hover:bg-amber-200 text-amber-800 cursor-not-allowed border border-amber-300"
                : "bg-slate-900 text-white hover:bg-slate-800"
            )}
          >
            {isTeamLimitReached() ? <Lock size={16} className="text-amber-600 animate-pulse" /> : <Plus size={20} />}
            Add Member
          </button>
        ) : (
          <div className="flex items-center gap-2 bg-amber-50 text-amber-800 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-amber-100">
            <Lock size={12} className="text-amber-600 shrink-0" />
            Acesso Restrito (Leitura)
          </div>
        )}
      </div>

      {isAdding && isAdmin && (
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-2xl space-y-6 animate-in slide-in-from-top-4">
          <h3 className="text-lg font-bold">Invite New Colleague</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-1">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Nome Completo</label>
              <input 
                className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-850"
                value={newMember.name}
                onChange={e => setNewMember({...newMember, name: e.target.value})}
                placeholder="Ex: João Silva"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Endereço de Email</label>
              <input 
                type="email"
                className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-855"
                value={newMember.email}
                onChange={e => setNewMember({...newMember, email: e.target.value})}
                placeholder="silva@empresa.com"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Função / Cargo</label>
              <select 
                className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-medium cursor-pointer"
                value={newMember.role}
                onChange={e => setNewMember({...newMember, role: e.target.value})}
              >
                <option value="staff">Funcionário Geral (Staff)</option>
                <option value="cashier">Caixa (Cashier)</option>
                <option value="storekeeper">Fiel de Armazém (Storekeeper)</option>
                <option value="manager">Gerente (Manager)</option>
                <option value="accountant">Contabilista (Accountant)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Senha Inicial (Mín. 6 carc.)</label>
              <div className="relative">
                <input 
                  type={showPassword ? "text" : "password"}
                  className="w-full p-4 pr-12 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-850"
                  value={newMember.password}
                  onChange={e => setNewMember({...newMember, password: e.target.value})}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-650 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-6 border-t">
            <button 
              disabled={isRegistering}
              onClick={() => setIsAdding(false)} 
              className="px-6 py-3 text-slate-500 font-bold hover:bg-slate-100 rounded-2xl transition-all disabled:opacity-50"
            >
              Cancelar
            </button>
            <button 
              disabled={isRegistering}
              onClick={handleAddStaff} 
              className="px-10 py-3 bg-blue-600 text-white rounded-2xl font-black shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all disabled:opacity-75 flex items-center gap-2"
            >
              {isRegistering && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>}
              {isRegistering ? "A Registar..." : "Registar Colaborador"}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {staff.map(member => (
          <div key={member.id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center gap-6 group">
            <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center font-black text-slate-400 text-xl">
              {member.name?.[0] || member.email[0].toUpperCase()}
            </div>
            
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <h3 className="text-lg font-black text-slate-900">{member.name || 'Pending User'}</h3>
                <div className={cn(
                  "px-3 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1",
                  member.role === 'owner' ? "bg-blue-50 text-blue-600" : "bg-slate-50 text-slate-500"
                )}>
                  {getRoleIcon(member.role)}
                  {member.role}
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs font-bold text-slate-400">
                <div className="flex items-center gap-1"><Mail size={12} /> {member.email}</div>
              </div>
            </div>

            {isAdmin && (
              <div className="flex items-center gap-2">
                <button className="p-3 bg-slate-50 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-2xl transition-all" title="Manage Permissions">
                  <Key size={18} />
                </button>
                {member.role !== 'owner' && (
                  <button className="p-3 bg-slate-50 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-2xl transition-all" title="Remove Access">
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
