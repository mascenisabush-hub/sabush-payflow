import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { ShieldCheck, X, Check, Clock, Laptop, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface AuthRequest {
  id: string;
  actionName: string;
  requestedByName: string;
  requestedByEmail: string;
  requestedByUid: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  createdAt: any;
}

export default function ManagerAuthListener() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<AuthRequest[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Only managers, owners, and super admins can act on requests
  const isManager = profile?.role === 'owner' || profile?.role === 'business_owner' || profile?.role === 'manager' || profile?.role === 'super_admin';

  useEffect(() => {
    if (!isManager || !profile?.businessId) return;

    const q = query(
      collection(db, `businesses/${profile.businessId}/auth_requests`),
      where('status', '==', 'pending')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs: AuthRequest[] = [];
      snapshot.forEach((doc) => {
        docs.push({ id: doc.id, ...doc.data() } as AuthRequest);
      });
      // Sort client-side by createdAt descending to ensure we see newest first or handle without composite index requirement
      docs.sort((a, b) => {
        const aTime = a.createdAt?.seconds || 0;
        const bTime = b.createdAt?.seconds || 0;
        return bTime - aTime;
      });
      setRequests(docs);
      // Ensure index is valid
      if (currentIndex >= docs.length) {
        setCurrentIndex(Math.max(0, docs.length - 1));
      }
    });

    return () => unsubscribe();
  }, [profile?.businessId, isManager, currentIndex]);

  if (!isManager || requests.length === 0) return null;

  const currentRequest = requests[currentIndex];

  const handleApprove = async () => {
    if (!profile?.businessId || !currentRequest) return;
    try {
      const requestRef = doc(db, `businesses/${profile.businessId}/auth_requests`, currentRequest.id);
      await updateDoc(requestRef, {
        status: 'approved',
        approvedByUid: profile.uid,
        approvedByName: profile.displayName || profile.email,
        approvedAt: serverTimestamp()
      });
      toast.success("Autorização remota aprovada com sucesso.");
    } catch (err) {
      toast.error("Erro ao aprovar autorização remota.");
    }
  };

  const handleReject = async () => {
    if (!profile?.businessId || !currentRequest) return;
    try {
      const requestRef = doc(db, `businesses/${profile.businessId}/auth_requests`, currentRequest.id);
      await updateDoc(requestRef, {
        status: 'rejected',
        rejectedByUid: profile.uid,
        rejectedByName: profile.displayName || profile.email,
        rejectedAt: serverTimestamp()
      });
      toast.success("Autorização remota rejeitada.");
    } catch (err) {
      toast.error("Erro ao rejeitar autorização.");
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[9999] w-full max-w-sm overflow-hidden bg-slate-900 border border-slate-800 text-white shadow-[0_20px_50px_rgba(0,0,0,0.4)] rounded-[24px] animate-bounce-short p-5 space-y-4">
      
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-orange-500/10 text-orange-400 flex items-center justify-center animate-pulse">
            <ShieldCheck size={18} />
          </div>
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-100">Autorização Solicitada</h4>
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Controlo Remoto de Acessos</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1 rounded-full text-[10px] font-black">
          <span>{currentIndex + 1} de {requests.length}</span>
        </div>
      </div>

      {/* Details body */}
      <div className="space-y-3">
        <div className="flex items-start gap-2.5">
          <Laptop size={14} className="text-slate-500 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-300 leading-relaxed font-medium">
            <span className="text-slate-100 font-black font-semibold">{currentRequest.requestedByName || currentRequest.requestedByEmail}</span> pede autorização para:
          </p>
        </div>

        <div className="bg-slate-950/40 border border-slate-800 p-3.5 rounded-2xl">
          <p className="text-xs font-bold text-orange-400 font-mono leading-relaxed break-all">
            {currentRequest.actionName}
          </p>
        </div>

        <div className="flex items-center gap-1 text-[10px] text-slate-500 font-bold uppercase">
          <Clock size={11} />
          <span>A aguardar aprovação remota do gerente...</span>
        </div>
      </div>

      {/* Navigation for multiple requests */}
      {requests.length > 1 && (
        <div className="flex justify-between items-center bg-slate-950/50 p-1.5 rounded-xl text-[10px] font-black uppercase text-slate-400">
          <button 
            disabled={currentIndex === 0}
            onClick={() => setCurrentIndex(prev => prev - 1)}
            className="px-3 py-1.5 hover:bg-slate-800 rounded-lg disabled:opacity-30 transition-colors cursor-pointer"
          >
            Anterior
          </button>
          <button 
            disabled={currentIndex === requests.length - 1}
            onClick={() => setCurrentIndex(prev => prev + 1)}
            className="px-3 py-1.5 hover:bg-slate-800 rounded-lg disabled:opacity-30 transition-colors cursor-pointer"
          >
            Próximo
          </button>
        </div>
      )}

      {/* Call Actions */}
      <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-800">
        <button
          onClick={handleReject}
          className="py-3 bg-red-950/30 hover:bg-red-900/30 border border-red-900/40 text-red-400 text-xs font-extrabold rounded-xl transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
        >
          <X size={14} /> Rejeitar
        </button>
        <button
          onClick={handleApprove}
          className="py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold rounded-xl transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer shadow-lg shadow-emerald-950/20"
        >
          <Check size={14} /> Aprovar
        </button>
      </div>

    </div>
  );
}
