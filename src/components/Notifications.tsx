import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, onSnapshot, orderBy, limit, updateDoc, doc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { Bell, Check, X, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function Notifications() {
  const { profile } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!profile?.uid) return;

    const q = query(
      collection(db, `users/${profile.uid}/notifications`),
      orderBy('createdAt', 'desc'),
      limit(10)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setNotifications(data);
      setUnreadCount(data.filter((n: any) => !n.read).length);
    }, (error) => {
      console.warn("Gracefully handled notifications onSnapshot error:", error);
    });

    return unsubscribe;
  }, [profile?.uid]);

  const markAllAsRead = async () => {
    if (!profile?.uid) return;
    notifications.forEach(async (n) => {
      if (!n.read) {
        await updateDoc(doc(db, `users/${profile.uid}/notifications`, n.id), { read: true });
      }
    });
  };

  return (
    <div className="relative">
      <button 
        onClick={() => { setIsOpen(!isOpen); if (!isOpen) markAllAsRead(); }}
        className="p-3 bg-white border border-slate-100 rounded-2xl text-slate-500 hover:text-blue-600 transition-all relative group shadow-sm"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-2 right-2 w-4 h-4 bg-rose-500 text-white text-[10px] font-black flex items-center justify-center rounded-full border-2 border-white animate-bounce">
            {unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute right-0 mt-3 w-80 bg-white rounded-3xl shadow-2xl border border-slate-100 z-50 overflow-hidden"
            >
              <div className="p-5 border-b border-slate-50 flex items-center justify-between">
                <h3 className="font-black text-slate-900 text-sm uppercase tracking-widest">Notifications</h3>
                <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">
                  {unreadCount} New
                </span>
              </div>
              
              <div className="max-h-[350px] overflow-y-auto custom-scrollbar">
                {notifications.length === 0 ? (
                  <div className="p-10 text-center space-y-2">
                    <Info className="mx-auto text-slate-200" size={32} />
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">All clear!</p>
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div 
                      key={n.id} 
                      className={`p-5 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors ${!n.read ? 'bg-blue-50/30' : ''}`}
                    >
                      <div className="flex gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          n.type === 'success' ? 'bg-emerald-50 text-emerald-500' : 
                          n.type === 'warning' ? 'bg-orange-50 text-orange-500' : 'bg-blue-50 text-blue-500'
                        }`}>
                          {n.type === 'success' ? <Check size={18} /> : n.type === 'warning' ? <X size={18} /> : <Info size={18} />}
                        </div>
                        <div className="space-y-1 min-w-0">
                          <p className="font-black text-xs text-slate-900 leading-tight">{n.title}</p>
                          <p className="text-[11px] font-medium text-slate-500 leading-relaxed">{n.message}</p>
                          <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">
                            {(() => {
                              if (!n.createdAt) return '';
                              try {
                                const date = typeof n.createdAt.toDate === 'function' ? n.createdAt.toDate() : new Date(n.createdAt);
                                return isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                              } catch (e) {
                                return '';
                              }
                            })()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="p-4 bg-slate-50 text-center">
                <button className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors">
                  View All Activity
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
