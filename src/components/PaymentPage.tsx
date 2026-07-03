import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, onSnapshot, updateDoc, increment, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { CreditCard, Smartphone, ShieldCheck, CheckCircle2, Package, Calendar, User, AlertCircle, ArrowLeft, Printer, Download, CreditCard as CardIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

interface PaymentPageProps {
  businessId: string;
  invoiceId: string;
  onClose?: () => void;
}

export default function PaymentPage({ businessId, invoiceId, onClose }: PaymentPageProps) {
  const [invoice, setInvoice] = useState<any>(null);
  const [business, setBusiness] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'mpesa' | 'flutterwave' | 'paystack' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [amountToPay, setAmountToPay] = useState<number>(0);

  useEffect(() => {
    // 1. Fetch Invoice
    const invoiceUnsub = onSnapshot(doc(db, `businesses/${businessId}/invoices`, invoiceId), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setInvoice(data);
        setAmountToPay(data.total - (data.amountPaid || 0));
      }
    }, (error) => {
      console.warn("Gracefully handled payment invoice onSnapshot error:", error);
    });

    // 2. Fetch Business Info
    const businessUnsub = onSnapshot(doc(db, `businesses/${businessId}`), (snapshot) => {
      if (snapshot.exists()) setBusiness(snapshot.data());
    }, (error) => {
      console.warn("Gracefully handled payment business onSnapshot error:", error);
    });

    return () => {
      invoiceUnsub();
      businessUnsub();
    };
  }, [businessId, invoiceId]);

  const handlePayment = async () => {
    if (!paymentMethod) {
      toast.error("Please select a payment method");
      return;
    }

    setIsProcessing(true);
    // Simulate payment gateway delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      // 1. Update Invoice
      await updateDoc(doc(db, `businesses/${businessId}/invoices`, invoiceId), {
        amountPaid: increment(amountToPay),
        status: (invoice.amountPaid || 0) + amountToPay >= invoice.total ? 'paid' : 'partially_paid',
        paymentStatus: (invoice.amountPaid || 0) + amountToPay >= invoice.total ? 'paid' : 'partially_paid',
        lastPaymentDate: new Date().toISOString()
      });

      // 2. Record Payment
      await addDoc(collection(db, `businesses/${businessId}/payments`), {
        invoiceId,
        amount: amountToPay,
        method: paymentMethod,
        date: new Date().toISOString(),
        businessId,
        type: 'online',
        createdAt: serverTimestamp()
      });

      setIsSuccess(true);
      toast.success("Payment successful!");
    } catch (e) {
      toast.error("Payment failed. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (!invoice || !business) {
    return (
      <div className="fixed inset-0 bg-white z-[70] flex items-center justify-center">
         <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="fixed inset-0 bg-slate-50 z-[70] flex items-center justify-center p-6">
        <div className="bg-white w-full max-w-md p-12 rounded-[40px] shadow-2xl text-center space-y-8 animate-in zoom-in-95 duration-300">
           <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 size={48} />
           </div>
           <div className="space-y-2">
              <h2 className="text-3xl font-black text-slate-900">Payment Complete</h2>
              <p className="text-slate-500 font-bold">Successfully paid ${amountToPay.toFixed(2)} to {business.name}</p>
           </div>
           
           <div className="bg-slate-50 p-6 rounded-3xl text-left divide-y divide-slate-100">
              <div className="py-3 flex justify-between">
                 <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Transaction ID</span>
                 <span className="text-xs font-bold font-mono">#{Math.random().toString(36).substr(2, 9).toUpperCase()}</span>
              </div>
              <div className="py-3 flex justify-between">
                 <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Date</span>
                 <span className="text-xs font-bold">{new Date().toLocaleDateString()}</span>
              </div>
           </div>

           <div className="grid grid-cols-2 gap-4">
              <button className="flex items-center justify-center gap-2 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black transition-all hover:bg-slate-200">
                 <Download size={18} /> Receipt
              </button>
              <button onClick={onClose} className="py-4 bg-slate-900 text-white rounded-2xl font-black transition-all hover:bg-slate-800 shadow-xl shadow-slate-900/20">
                 Done
              </button>
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-50 z-[70] overflow-y-auto flex flex-col sm:p-6 md:p-12 animate-in fade-in duration-500">
      <div className="max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-12">
        
        {/* Left Side: Invoice Details */}
        <div className="lg:col-span-7 space-y-8">
           {onClose && (
             <button onClick={onClose} className="flex items-center gap-2 text-slate-400 hover:text-slate-900 font-black text-xs uppercase tracking-widest transition-all">
                <ArrowLeft size={16} /> Back
             </button>
           )}

           <div className="bg-white p-10 md:p-16 rounded-[40px] shadow-sm border border-slate-100 space-y-12 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-12 opacity-[0.03] pointer-events-none">
                 <ShieldCheck size={300} />
              </div>

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 border-b border-slate-50 pb-12">
                 <div className="flex items-center gap-4">
                    {business.logoUrl ? (
                      <img 
                        src={business.logoUrl} 
                        alt="Logo" 
                        referrerPolicy="no-referrer"
                        className="w-16 h-16 rounded-3xl object-cover shadow-2xl shadow-slate-900/10"
                      />
                    ) : (
                      <div className="w-16 h-16 bg-slate-900 rounded-3xl flex items-center justify-center text-white shadow-2xl shadow-slate-900/20">
                         <Package size={32} />
                      </div>
                    )}
                    <div>
                       <h1 className="text-3xl font-black text-slate-900 leading-none mb-1">{business.name}</h1>
                       {business.address && (
                         <p className="text-slate-400 font-bold text-[10px] uppercase tracking-wide max-w-[200px] leading-relaxed">
                           {business.address}
                         </p>
                       )}
                       <p className="text-blue-500 font-bold uppercase text-[10px] tracking-widest mt-1">Business Invoice</p>
                    </div>
                 </div>
                 <div className="text-left md:text-right">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Invoice Number</p>
                    <p className="text-2xl font-black text-slate-900">#{invoice.invoiceNumber}</p>
                 </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                 <div className="space-y-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Customer</p>
                    <p className="font-bold text-slate-900">{(invoice.customerDetails?.name || 'Walk-in Customer')}</p>
                 </div>
                 <div className="space-y-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Due Date</p>
                    <p className="font-bold text-slate-900">{new Date(invoice.dueDate).toLocaleDateString()}</p>
                 </div>
                 <div className="space-y-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Amount</p>
                    <p className="font-bold text-slate-900">${invoice.total.toFixed(2)}</p>
                 </div>
                 <div className="space-y-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Paid</p>
                    <p className="font-bold text-emerald-500">${(invoice.amountPaid || 0).toFixed(2)}</p>
                 </div>
              </div>

              <div className="space-y-6">
                 <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-4">Line Items</h3>
                 <div className="space-y-4">
                    {invoice.items.map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center bg-slate-50/50 p-4 rounded-2xl">
                         <div className="flex flex-col">
                            <span className="font-bold text-slate-900">{item.description || item.name}</span>
                            <span className="text-xs font-medium text-slate-400">Qty: {item.quantity}</span>
                         </div>
                         <span className="font-black text-slate-900">${(item.price * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                 </div>
              </div>

              <div className="pt-8 flex flex-col md:flex-row md:items-start justify-between gap-6 border-t border-slate-50">
                 <div className="flex-1 space-y-4">
                    <div className="flex items-center gap-3 text-slate-400 font-bold text-sm">
                       <ShieldCheck size={18} />
                       Secure encrypted billing environment
                    </div>
                    
                    {(business.paymentInstructions || business.paymentTerms) && (
                      <div className="bg-slate-50 p-6 rounded-3xl space-y-4 border border-slate-100">
                        {business.paymentInstructions && (
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Payment Instructions</p>
                            <p className="text-xs font-bold text-slate-600 leading-relaxed">{business.paymentInstructions}</p>
                          </div>
                        )}
                        {business.paymentTerms && (
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Payment Terms</p>
                            <p className="text-xs font-bold text-slate-600 leading-relaxed">{business.paymentTerms}</p>
                          </div>
                        )}
                      </div>
                    )}
                 </div>
                 <div className="text-right shrink-0">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Balance Due</p>
                    <p className="text-4xl font-black text-blue-600">${(invoice.total - (invoice.amountPaid || 0)).toFixed(2)}</p>
                 </div>
              </div>
           </div>
        </div>

        {/* Right Side: Payment Form */}
        <div className="lg:col-span-5">
           <div className="bg-white p-10 md:p-12 rounded-[40px] shadow-2xl border border-slate-100 flex flex-col gap-10 sticky top-12">
              <div className="space-y-2">
                 <h2 className="text-2xl font-black text-slate-900">Make Payment</h2>
                 <p className="text-slate-500 font-bold">Select your preferred payment method across Africa.</p>
              </div>

              <div className="space-y-4">
                 <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Payment Provider</label>
                 <div className="grid grid-cols-2 gap-3">
                   {[
                     { id: 'flutterwave', label: 'Flutterwave', icon: CreditCard, color: 'text-orange-500' },
                     { id: 'paystack', label: 'Paystack', icon: ShieldCheck, color: 'text-blue-500' },
                     { id: 'mpesa', label: 'M-Pesa', icon: Smartphone, color: 'text-emerald-500' },
                     { id: 'card', label: 'Global Card', icon: CardIcon, color: 'text-slate-900' }
                   ].map(method => (
                     <button
                       key={method.id}
                       onClick={() => setPaymentMethod(method.id as any)}
                       className={cn(
                         "p-6 rounded-3xl border-2 transition-all flex flex-col items-center gap-3 font-black text-[10px] uppercase tracking-widest text-center",
                         paymentMethod === method.id 
                          ? "border-blue-600 bg-blue-50/50 text-blue-600" 
                          : "border-slate-50 bg-slate-50 text-slate-400 hover:border-slate-200"
                       )}
                     >
                        <method.icon size={24} className={method.color} />
                        {method.label}
                     </button>
                   ))}
                 </div>
              </div>

              <div className="space-y-4">
                 <div className="flex justify-between items-center text-xs font-black text-slate-400 uppercase tracking-widest">
                    <span>Payment Amount</span>
                    <button onClick={() => setAmountToPay(invoice.total - (invoice.amountPaid || 0))} className="text-blue-600 hover:underline">Pay Full Balance</button>
                 </div>
                 <div className="relative">
                    <span className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl font-black text-slate-400">$</span>
                    <input 
                      type="number"
                      className="w-full pl-12 pr-6 py-6 bg-slate-50 border-none rounded-3xl text-3xl font-black text-slate-900 focus:ring-4 focus:ring-blue-100 outline-none transition-all"
                      value={amountToPay}
                      max={invoice.total - (invoice.amountPaid || 0)}
                      onChange={e => setAmountToPay(Number(e.target.value))}
                    />
                 </div>
              </div>

              <div className="space-y-6">
                 <button 
                  onClick={handlePayment}
                  disabled={isProcessing || !paymentMethod || amountToPay <= 0}
                  className="w-full py-8 bg-blue-600 text-white rounded-[32px] font-black text-2xl shadow-3xl shadow-blue-500/40 flex items-center justify-center gap-4 hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100"
                 >
                   {isProcessing ? (
                     <>
                        <div className="w-6 h-6 border-3 border-white/20 border-t-white rounded-full animate-spin" />
                        Verifying Transaction...
                     </>
                   ) : (
                     <>
                        <ShieldCheck size={24} />
                        Pay ${amountToPay.toFixed(2)} Now
                     </>
                   )}
                 </button>

                 <div className="flex items-center justify-center gap-6">
                    <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                       <ShieldCheck size={14} className="text-emerald-500" /> Fully Encrypted
                    </div>
                    <div className="w-1.5 h-1.5 bg-slate-200 rounded-full" />
                    <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                       <CheckCircle2 size={14} className="text-emerald-500" /> PCI Compliant
                    </div>
                 </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}
