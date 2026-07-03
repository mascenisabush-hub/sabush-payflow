import React, { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { AlertTriangle, Lock, CreditCard, ArrowRight, ShieldCheck, Zap } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface SubscriptionGateProps {
  children: ReactNode;
  moduleName?: string;
}

export default function SubscriptionGate({ children, moduleName }: SubscriptionGateProps) {
  const { profile, businessData } = useAuth();

  // Super admins skip gates
  if (profile?.role?.toLowerCase() === 'super_admin' || profile?.email === 'mascenisabush@gmail.com') {
    return <>{children}</>;
  }

  if (!businessData) return <>{children}</>;

  const trialEnds = businessData.trialEndsAt ? new Date(businessData.trialEndsAt) : null;
  const subEnds = businessData.subscriptionEndsAt ? new Date(businessData.subscriptionEndsAt) : null;
  const now = new Date();

  const isTrialActive = businessData.subscriptionStatus === 'trial' && trialEnds && trialEnds > now;
  const isSubscriptionActive = businessData.subscriptionStatus === 'active' && subEnds && subEnds > now;
  const isActive = isTrialActive || isSubscriptionActive;

  if (!isActive) {
    return (
      <div className="relative min-h-[400px] w-full flex items-center justify-center p-6 bg-slate-50/50 rounded-[40px] overflow-hidden border-2 border-dashed border-slate-200">
        <div className="absolute inset-0 bg-white/40 backdrop-blur-sm z-40" />
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-50 max-w-md w-full bg-white p-10 rounded-[48px] shadow-2xl text-center space-y-8 animate-in zoom-in-95"
        >
          <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto shadow-xl shadow-red-100/50">
            <Lock size={32} />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-3xl font-black text-slate-900 leading-tight">Module Restricted</h2>
            <p className="text-slate-500 font-bold">
              {businessData.subscriptionStatus === 'trial' 
                ? "Your 14-day free trial has expired." 
                : "Your subscription has ended or was suspended."}
            </p>
          </div>

          <div className="bg-slate-50 p-6 rounded-3xl text-left space-y-4">
             <div className="flex items-center gap-3">
                <ShieldCheck size={18} className="text-blue-600" />
                <span className="text-xs font-black text-slate-600 uppercase tracking-widest">Premium Features Locked</span>
             </div>
             <p className="text-sm font-bold text-slate-400">
                To continue creating invoices, managing inventory, and processing POS sales, please activate your subscription.
             </p>
          </div>

          <button 
            onClick={() => (window as any).setCurrentTab('billing')}
            className="w-full py-6 bg-blue-600 text-white rounded-3xl font-black text-xl shadow-xl shadow-blue-600/30 flex items-center justify-center gap-3 hover:bg-blue-700 transition-all active:scale-95"
          >
            <Zap size={24} /> Upgrade Now
          </button>

          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] italic">
             Plans starting at: 500 MZN / Month
          </p>
        </motion.div>

        {/* Blurred view of content behind */}
        <div className="absolute inset-0 opacity-10 pointer-events-none select-none filter blur-md">
           {children}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
