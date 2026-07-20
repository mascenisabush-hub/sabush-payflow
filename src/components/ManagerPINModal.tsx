import React, { useState, useEffect } from 'react';
import { ShieldAlert, X, ChevronRight, Lock, Laptop, Wifi, ArrowLeft, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { collection, addDoc, doc, onSnapshot, serverTimestamp, updateDoc, deleteDoc, query, where, getDocs } from 'firebase/firestore';
import { toast } from 'sonner';

interface ManagerPINModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (approvedBy?: string) => void;
  actionName: string;
}

export default function ManagerPINModal({ isOpen, onClose, onSuccess, actionName }: ManagerPINModalProps) {
  const { businessData, profile, user } = useAuth();
  const [pin, setPin] = useState('');
  const [isRequestingRemote, setIsRequestingRemote] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setIsRequestingRemote(false);
      setRequestId(null);
      setPin('');
    }
  }, [isOpen]);

  // Real-time listener for remote authorization approval
  useEffect(() => {
    if (!isRequestingRemote || !requestId || !profile?.businessId) return;

    const requestRef = doc(db, `businesses/${profile.businessId}/auth_requests`, requestId);
    const unsubscribe = onSnapshot(requestRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.status === 'approved') {
          toast.success(`Aprovado remotamente por ${data.approvedByName || 'Gerente'}!`);
          setIsRequestingRemote(false);
          setRequestId(null);
          onSuccess(data.approvedByName || 'Gerente (Remoto)');
          onClose();
        } else if (data.status === 'rejected') {
          toast.error("O Gerente rejeitou o pedido de autorização remota.");
          setIsRequestingRemote(false);
          setRequestId(null);
        }
      }
    });

    return () => unsubscribe();
  }, [isRequestingRemote, requestId, profile?.businessId, onSuccess, onClose]);

  if (!isOpen) return null;

  // Retrieve authorized pin or default to '1234'
  const correctPin = businessData?.managerPin || '1234';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === correctPin) {
      toast.success("Manager authorization approved!");
      setPin('');
      onSuccess('Gerente (PIN Geral)');
      onClose();
      return;
    }

    if (!profile?.businessId) {
      toast.error("Invalid Manager Authorization PIN. Access Denied.");
      setPin('');
      return;
    }

    try {
      const q = query(
        collection(db, 'users'),
        where('businessId', '==', profile.businessId),
        where('authPin', '==', pin)
      );
      const snapshot = await getDocs(q);
      
      let authorized = false;
      let authorizedName = '';
      
      snapshot.forEach(userDoc => {
        const uData = userDoc.data();
        const role = uData.role;
        const isAuthorizedRole = role === 'owner' || role === 'business_owner' || role === 'manager' || role === 'admin' || role?.toLowerCase() === 'super_admin';
        if (isAuthorizedRole) {
          authorized = true;
          authorizedName = uData.displayName || uData.email || 'Gerente';
        }
      });
      
      if (authorized) {
        toast.success(`Aprovado por ${authorizedName}!`);
        setPin('');
        onSuccess(authorizedName);
        onClose();
      } else {
        toast.error("Invalid Manager Authorization PIN. Access Denied.");
        setPin('');
      }
    } catch (err) {
      console.error("Error verifying individual auth PIN:", err);
      toast.error("Invalid Manager Authorization PIN. Access Denied.");
      setPin('');
    }
  };

  const handleRequestRemote = async () => {
    if (!profile?.businessId) {
      toast.error("Configurações do negócio não encontradas.");
      return;
    }

    try {
      const docRef = await addDoc(collection(db, `businesses/${profile.businessId}/auth_requests`), {
        actionName: actionName,
        requestedByName: profile?.displayName || profile?.email || user?.email || "Colaborador",
        requestedByEmail: profile?.email || user?.email || "colaborador@sabush.com",
        requestedByUid: profile?.uid || "",
        status: 'pending',
        createdAt: serverTimestamp()
      });
      
      setRequestId(docRef.id);
      setIsRequestingRemote(true);
      toast.success("Pedido de autorização enviado ao gerente.");
    } catch (err) {
      toast.error("Erro ao solicitar autorização remota.");
      console.error(err);
    }
  };

  const handleCancelRemote = async () => {
    if (!profile?.businessId || !requestId) return;
    try {
      const requestRef = doc(db, `businesses/${profile.businessId}/auth_requests`, requestId);
      await updateDoc(requestRef, { status: 'cancelled' });
      setIsRequestingRemote(false);
      setRequestId(null);
      toast.info("Pedido de autorização remoto cancelado.");
    } catch (err) {
      // Best effort deletion or update
      setIsRequestingRemote(false);
      setRequestId(null);
    }
  };

  const handleNumberClick = (num: number) => {
    if (pin.length < 6) {
      setPin(prev => prev + num);
    }
  };

  const handleBackspace = () => {
    setPin(prev => prev.slice(0, -1));
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[9999] flex items-center justify-center p-4 min-h-screen select-none overflow-y-auto">
      <div className="bg-white rounded-[32px] border border-slate-100 shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-in fade-in scale-in duration-200">
        
        {/* Header decoration */}
        <div className="bg-slate-50 border-b border-slate-100 p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <ShieldAlert size={20} />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm leading-tight">Autorização Requerida</h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Manager Authorization</p>
            </div>
          </div>
          <button 
            onClick={isRequestingRemote ? handleCancelRemote : onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-200/50 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Remote Waiting View */}
        {isRequestingRemote ? (
          <div className="p-8 text-center space-y-6 animate-in fade-in duration-250">
            <div className="relative w-20 h-20 mx-auto bg-blue-50 text-blue-600 rounded-full flex items-center justify-center">
              <Loader2 size={32} className="animate-spin text-blue-600 duration-1000" />
              <div className="absolute top-2 right-2 w-3.5 h-3.5 bg-green-500 border-2 border-white rounded-full flex items-center justify-center">
                <Wifi size={8} className="text-white shrink-0" />
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-extrabold text-slate-900 text-sm">A aguardar aprovação remota...</h4>
              <p className="text-[11px] text-slate-500 max-w-xs mx-auto leading-relaxed font-semibold uppercase tracking-wide">
                Enviado para o computador do Gerente/Diretor do seu estabelecimento.
              </p>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-[10px] font-mono font-bold text-slate-500 mt-2">
                Ação: {actionName}
              </div>
            </div>

            <button
              onClick={handleCancelRemote}
              className="py-3 px-6 border border-slate-200 text-slate-650 hover:bg-slate-50 rounded-2xl font-black text-xs transition-all w-full select-none"
            >
              Cancelar Pedido e voltar ao PIN
            </button>
          </div>
        ) : (
          /* Keyboard input View */
          <form onSubmit={handleSubmit} className="p-6 space-y-6 animate-in fade-in duration-200">
            <div className="text-center space-y-1">
              <p className="text-xs font-bold text-slate-500 leading-relaxed">
                Operação a autorizar: <span className="text-slate-900 font-extrabold">{actionName}</span>
              </p>
              <p className="text-[11px] text-slate-400">
                Pode digitar o PIN localmente ou pedir autorização remota em tempo real.
              </p>
            </div>

            {/* Remote authorization button */}
            <button
              type="button"
              onClick={handleRequestRemote}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-2xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md shadow-blue-500/10"
            >
              <Laptop size={15} /> Solicitar Remotamente ao Gerente
            </button>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-slate-100"></div>
              <span className="flex-shrink mx-4 text-[9px] text-slate-400 font-extrabold uppercase tracking-widest">OU DIGI-PIN LOCAL</span>
              <div className="flex-grow border-t border-slate-100"></div>
            </div>

            {/* Dots Indicator */}
            <div className="flex justify-center items-center gap-4 py-1">
              {[...Array(4)].map((_, i) => (
                <div 
                  key={i} 
                  className={`w-3.5 h-3.5 rounded-full border transition-all duration-150 ${
                    pin.length > i 
                      ? 'bg-slate-900 border-slate-900 scale-110' 
                      : 'bg-slate-100 border-slate-200'
                  }`}
                />
              ))}
            </div>

            <div className="relative">
              <input 
                type="password"
                maxLength={6}
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                className="w-full text-center tracking-[1.5em] font-mono text-xl font-black p-3.5 bg-slate-50 border border-slate-100 rounded-3xl outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white text-slate-800 transition-all"
                autoFocus
              />
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300">
                <Lock size={15} />
              </div>
            </div>

            {/* Graphical Keypad */}
            <div className="grid grid-cols-3 gap-2 px-4">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleNumberClick(num)}
                  className="h-10 rounded-xl border border-slate-50 hover:bg-slate-50 hover:border-slate-100 text-slate-855 font-bold active:bg-slate-100 active:scale-95 transition-all text-sm"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                onClick={handleBackspace}
                className="h-10 rounded-xl text-slate-500 hover:bg-rose-50 hover:text-rose-600 font-bold font-mono active:scale-95 transition-all text-xs flex items-center justify-center"
              >
                Apagar
              </button>
              <button
                type="button"
                onClick={() => handleNumberClick(0)}
                className="h-10 rounded-xl border border-slate-50 hover:bg-slate-50 hover:border-slate-100 text-slate-855 font-bold active:bg-slate-100 active:scale-95 transition-all text-sm"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => setPin('')}
                className="h-10 rounded-xl text-slate-500 hover:bg-slate-50 font-bold active:scale-95 transition-all text-xs flex items-center justify-center"
              >
                Limpar
              </button>
            </div>

            {/* Action buttons */}
            <div className="pt-4 border-t border-slate-50 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 border border-slate-150 text-slate-600 rounded-2xl font-bold text-xs hover:bg-slate-50 transition-all select-none"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={pin.length < 4}
                className="flex-1 py-3 bg-slate-900 text-white rounded-2xl font-bold text-xs hover:bg-slate-800 transition-all select-none disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                Autorizar <ChevronRight size={14} />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
