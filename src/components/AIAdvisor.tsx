import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Sparkles, ArrowRight, Brain, AlertCircle, TrendingUp, History, ListChecks } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, getDocs, limit, orderBy } from 'firebase/firestore';

export default function AIAdvisor() {
  const { profile } = useAuth();
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const generateReport = async () => {
    if (!profile?.businessId) return;
    setLoading(true);
    try {
      // Fetch some data to provide context to the AI
      const salesSnap = await getDocs(query(collection(db, `businesses/${profile.businessId}/invoices`), orderBy('createdAt', 'desc'), limit(10)));
      const expenseSnap = await getDocs(query(collection(db, `businesses/${profile.businessId}/expenses`), orderBy('createdAt', 'desc'), limit(10)));
      const productsSnap = await getDocs(query(collection(db, `businesses/${profile.businessId}/products`), limit(20)));

      const sales = salesSnap.docs.map(d => d.data());
      const expenses = expenseSnap.docs.map(d => d.data());
      const inventory = productsSnap.docs.map(d => d.data());

      const res = await fetch('/api/ai/strategy-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sales,
          expenses,
          inventory,
          businessName: profile.businessName || 'Your Business'
        })
      });

      if (res.ok) {
        const data = await res.json();
        setReport(data);
      }
    } catch (error) {
      console.error("Failed to fetch advice", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-900 rounded-[32px] p-8 text-white relative overflow-hidden shadow-2xl">
      <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
        <Brain size={160} />
      </div>

      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-blue-600 rounded-2xl shadow-lg shadow-blue-500/20">
            <Sparkles size={24} className="text-white" />
          </div>
          <div>
            <h3 className="text-xl font-black text-white">AI Strategy Advisor</h3>
            <p className="text-slate-400 text-sm">Automated business intelligence for African SMEs</p>
          </div>
        </div>

        {!report ? (
          <div className="space-y-4">
            <p className="text-slate-300 max-w-lg">
              Get an instant audit of your business performance. 
              Our AI analyzes your sales trends, inventory levels, and expenses to provide 5 actionable steps to grow your profit.
            </p>
            <button 
              onClick={generateReport}
              disabled={loading}
              className="px-8 py-4 bg-white text-slate-900 rounded-2xl font-black flex items-center gap-3 hover:bg-slate-100 transition-all active:scale-95 disabled:opacity-50"
            >
              {loading ? "Analyzing Data..." : "Generate Advice"}
              <ArrowRight size={20} />
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4">
            <div className="space-y-6">
              <div>
                <p className="text-xs font-black text-blue-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                  <TrendingUp size={14} /> Executive Summary
                </p>
                <p className="text-slate-200 leading-relaxed text-sm">{report.summary}</p>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="p-5 bg-white/5 rounded-3xl border border-white/10">
                   <h4 className="text-xs font-black uppercase text-emerald-400 mb-3 flex items-center gap-2">
                     <ListChecks size={14} /> Strengths
                   </h4>
                   <ul className="text-xs space-y-2 text-slate-300">
                     {report.strengths.map((s: string, i: number) => <li key={i} className="flex items-start gap-2">• {s}</li>)}
                   </ul>
                </div>
                <div className="p-5 bg-white/5 rounded-3xl border border-white/10">
                   <h4 className="text-xs font-black uppercase text-rose-400 mb-3 flex items-center gap-2">
                     <AlertCircle size={14} /> Improvements Needed
                   </h4>
                   <ul className="text-xs space-y-2 text-slate-300">
                     {report.weaknesses.map((w: string, i: number) => <li key={i} className="flex items-start gap-2">• {w}</li>)}
                   </ul>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="p-6 bg-blue-600/20 border border-blue-500/20 rounded-[32px]">
                <h4 className="text-sm font-black uppercase text-blue-400 mb-4 flex items-center gap-2">
                  <Sparkles size={16} /> 5 Step Action Plan
                </h4>
                <div className="space-y-4">
                  {report.actionItems.map((item: string, i: number) => (
                    <div key={i} className="flex gap-4">
                      <div className="flex-shrink-0 w-6 h-6 rounded-lg bg-blue-500 flex items-center justify-center font-black text-[10px] text-white">
                        {i + 1}
                      </div>
                      <p className="text-xs text-slate-200">{item}</p>
                    </div>
                  ))}
                </div>
              </div>

              {report.inventoryWarnings?.length > 0 && (
                <div className="p-5 bg-amber-500/10 border border-amber-500/20 rounded-3xl">
                  <h4 className="text-xs font-black uppercase text-amber-400 mb-3">Inventory Alerts</h4>
                  <p className="text-xs text-slate-300 leading-relaxed">{report.inventoryWarnings}</p>
                </div>
              )}

              <button 
                onClick={() => setReport(null)}
                className="text-xs font-black text-slate-500 uppercase tracking-widest hover:text-white transition-colors"
              >
                Refresh Analysis
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
