import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, onSnapshot, doc, updateDoc, addDoc, serverTimestamp, increment, deleteDoc, getDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { ShoppingBag, Check, X, Clock, Package, MapPin, Phone, MessageSquare, ArrowRight, CheckCircle2, AlertTriangle, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';
import Skeleton from './ui/Skeleton';

export default function OrderManagement() {
  const { profile, businessData } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(6);

  useEffect(() => {
    if (!profile?.businessId) {
      setLoading(false);
      return;
    }

    const q = query(collection(db, `businesses/${profile.businessId}/online_orders`));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      setOrders(docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
      setLoading(false);
    }, error => {
      setLoading(false);
      try {
        handleFirestoreError(error, OperationType.LIST, 'online_orders');
      } catch (e) {
        console.warn("Gracefully logged online orders query error:", e);
      }
    });

    return unsubscribe;
  }, [profile?.businessId]);

  const handleStatusUpdate = async (order: any, newStatus: string) => {
    if (!profile?.businessId) return;

    try {
      const updatePayload: any = {
        status: newStatus,
        updatedAt: serverTimestamp()
      };

      // If accepting order, generate invoice and deduct stock
      if (newStatus === 'accepted') {
        const invoiceNumber = `INV-ONLINE-${Date.now().toString().slice(-6)}`;
        updatePayload.invoiceNumber = invoiceNumber;
        
        // 1. Create Invoice
        const invoiceData = {
          businessId: profile.businessId,
          customerId: 'Online-Customer',
          customerDetails: {
            name: order.customerName,
            phone: order.customerPhone,
            email: order.customerEmail || ''
          },
          invoiceNumber,
          items: order.items,
          total: order.total,
          status: 'sent',
          type: 'online_order',
          orderId: order.id,
          date: new Date().toISOString(),
          createdAt: serverTimestamp()
        };

        await addDoc(collection(db, `businesses/${profile.businessId}/invoices`), invoiceData);

        // Automated invoice portal notifications
        try {
          const { triggerInvoiceCreatedNotifications } = await import('../lib/notificationService');
          await triggerInvoiceCreatedNotifications(profile.businessId, {
            invoiceNumber,
            total: order.total,
            customerId: 'Online-Customer',
            customerName: order.customerName,
            customerPhone: order.customerPhone,
            customerEmail: order.customerEmail || ''
          });
        } catch (notifErr) {
          console.error("Order Accept portal notification error:", notifErr);
        }

        // 2. Deduct Stock with low stock check
        const lowStockItemsToNotify = [];
        for (const item of order.items) {
          const prodId = item.id || item.productId;
          if (!prodId) continue;

          const prodRef = doc(db, `businesses/${profile.businessId}/products`, prodId);
          const prodSnap = await getDoc(prodRef);

          let currentStock = 0;
          let minStockAlert = 0;
          let productName = item.name || '';
          let unitLabel = item.unitLabel || 'Un';

          if (prodSnap.exists()) {
            const pData = prodSnap.data();
            currentStock = pData.stockLevel || 0;
            minStockAlert = pData.minStockAlert || pData.minStock || 0;
            productName = pData.name || productName;
            unitLabel = pData.baseUnitLabel || pData.unitLabel || unitLabel;
          }

          const newStock = currentStock - item.quantity;

          await updateDoc(prodRef, {
            stockLevel: increment(-item.quantity),
            stockUn: increment(-item.quantity)
          });

          // Check low stock condition
          if (businessData?.automation?.autoLowStockAlerts && newStock <= minStockAlert) {
            lowStockItemsToNotify.push({
              name: productName,
              currentStock: newStock,
              minStock: minStockAlert,
              unit: unitLabel
            });
          }
        }

        toast.success(`Encenda aceitada! Fatura ${invoiceNumber} gerada com sucesso.`);

        // 3. Automated WhatsApp notification to customer
        const whatsappApiKey = businessData?.whatsappConfig?.apiKey || profile?.whatsappConfig?.apiKey || '';
        const whatsappPhone = businessData?.whatsappConfig?.phone || profile?.whatsappConfig?.phone || '';
        const whatsappPhoneNumberId = businessData?.whatsappConfig?.phoneNumberId || profile?.whatsappConfig?.phoneNumberId || '';
        const webhookUrl = businessData?.makeConfig?.webhookUrl || profile?.makeConfig?.webhookUrl || '';

        if (whatsappApiKey && whatsappPhoneNumberId && order.customerPhone) {
          try {
            const { sendWhatsAppNotification } = await import('../lib/whatsappService');
            await sendWhatsAppNotification({
              apiKey: whatsappApiKey,
              phoneNumberId: whatsappPhoneNumberId,
              businessPhone: whatsappPhone,
              webhookUrl,
              recipientPhone: order.customerPhone,
              customerName: order.customerName,
              orderNumber: invoiceNumber,
              totalAmount: order.total,
              currency: businessData?.currency || profile?.currency || 'MT',
              items: order.items,
              invoiceTemplate: businessData?.automation?.invoiceTemplate || `Olá *{customerName}*!\nO seu pedido online *{orderNumber}* foi aceite pelo Sabush System. A fatura correspondente de *{totalAmount} {currency}* já se encontra gerada com sucesso.\n\nAgradecemos a sua preferência!\n_Sabush System ERP_`
            });
          } catch (err) {
            console.warn("Auto WhatsApp notification failed:", err);
          }
        }

        // 4. Automated Low Stock alerts
        if (lowStockItemsToNotify.length > 0 && whatsappApiKey && whatsappPhoneNumberId && whatsappPhone) {
          try {
            const { sendWhatsAppLowStockAlert } = await import('../lib/whatsappService');
            const lowStockTemplate = businessData?.automation?.lowStockTemplate || 
              '⚠️ *Alerta de Stock Baixo!*\n\nO artigo *{productName}* atingiu o nível crítico.\nStock Atual: *{currentStock}* {unit}\nLimite Mínimo: *{minStock}* {unit}.\n\nPor favor, providencie o reabastecimento do stock.\n_Sabush System ERP_';

            for (const lowItem of lowStockItemsToNotify) {
              await sendWhatsAppLowStockAlert({
                apiKey: whatsappApiKey,
                phoneNumberId: whatsappPhoneNumberId,
                recipientPhone: whatsappPhone,
                productName: lowItem.name,
                currentStock: lowItem.currentStock,
                minStock: lowItem.minStock,
                unit: lowItem.unit,
                template: lowStockTemplate
              });
            }
          } catch (err) {
            console.warn("Low stock alert failed:", err);
          }
        }
      }

      await updateDoc(doc(db, `businesses/${profile.businessId}/online_orders`, order.id), updatePayload);

      if (newStatus === 'rejected') toast.error("Order rejected");
      if (newStatus === 'delivered') toast.success("Order marked as delivered");

    } catch (e) {
      toast.error("Failed to update order status");
    }
  };

  const handleWhatsAppShare = (order: any) => {
    if (!order.customerPhone) {
      toast.error("Nenhum contacto de WhatsApp disponível para este cliente.");
      return;
    }
    const cleanPhone = order.customerPhone.replace(/\s+/g, '').replace('+', '');
    
    let text = "";
    if (order.status === 'pending') {
      text = `Olá ${order.customerName},\n\nRecebemos o seu pedido online no valor de ${Number(order.total).toLocaleString('pt-MZ')} MT. O pedido está pendente de aprovação.\n\nObrigado pela preferência!`;
    } else if (order.status === 'accepted') {
      text = `Olá ${order.customerName},\n\nO seu pedido online no valor de ${Number(order.total).toLocaleString('pt-MZ')} MT foi aceito e a fatura correspondente foi gerada com sucesso!\n\nObrigado pela preferência!`;
    } else if (order.status === 'delivered') {
      text = `Olá ${order.customerName},\n\nO seu pedido online no valor de ${Number(order.total).toLocaleString('pt-MZ')} MT foi marcado como entregue. Esperamos que tenha corrido tudo bem!\n\nObrigado pela preferência!`;
    } else {
      text = `Olá ${order.customerName},\n\nAqui estão as actualizações sobre o seu pedido online no valor de ${Number(order.total).toLocaleString('pt-MZ')} MT (Estado actual: ${order.status}).\n\nObrigado!`;
    }
    
    const whatsappUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(text)}`;
    window.open(whatsappUrl, '_blank');
  };

  const handleViewInvoice = (order: any) => {
    if (!order.invoiceNumber) {
      toast.error("Nenhuma fatura associada a esta encomenda.");
      return;
    }
    localStorage.setItem('invoice_search_query', order.invoiceNumber);
    if ((window as any).setCurrentTab) {
      (window as any).setCurrentTab('invoices');
      toast.success(`Navegando para fatura ${order.invoiceNumber}`);
    } else {
      toast.error("Erro de navegação.");
    }
  };

  const deleteOrder = async (id: string) => {
    if (!confirm("Are you sure you want to delete this order record?")) return;
    try {
      await deleteDoc(doc(db, `businesses/${profile.businessId}/online_orders`, id));
      toast.success("Order deleted");
    } catch (e) {
      toast.error("Delete failed");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-amber-100 text-amber-700';
      case 'accepted': return 'bg-blue-100 text-blue-700';
      case 'delivered': return 'bg-emerald-100 text-emerald-700';
      case 'rejected': return 'bg-rose-100 text-rose-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  if (loading) return (
    <div className="space-y-8 animate-pulse">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
        <div className="flex items-center gap-6">
          <Skeleton className="w-16 h-16 rounded-3xl" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48 rounded" />
            <Skeleton className="h-4 w-32 rounded" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
            <div className="flex justify-between items-center pb-4 border-b border-slate-50">
              <Skeleton className="h-5 w-24 rounded" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-full rounded" />
              <Skeleton className="h-4 w-5/6 rounded" />
              <Skeleton className="h-4 w-2/3 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedOrders = orders.slice(startIndex, endIndex);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-blue-600 text-white rounded-3xl flex items-center justify-center shadow-2xl shadow-blue-500/20">
            <ShoppingBag size={32} />
          </div>
          <div>
            <h2 className="text-3xl font-black text-slate-900">Storefront Orders</h2>
            <p className="text-slate-500 font-bold">Manage incoming requests from your online store.</p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-2xl">
           <div className="px-4 py-2 bg-white rounded-xl shadow-sm">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Orders</p>
              <p className="text-lg font-black text-slate-900">{orders.length}</p>
           </div>
           <div className="px-4 py-2 bg-white rounded-xl shadow-sm">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-amber-500">Pending</p>
              <p className="text-lg font-black text-slate-900">{orders.filter(o => o.status === 'pending').length}</p>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {paginatedOrders.map(order => (
          <div key={order.id} className="bg-white rounded-[40px] border border-slate-100 overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300">
             <div className="p-8 border-b border-slate-50 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                   <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400">
                      <Clock size={24} />
                   </div>
                   <div>
                      <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                         {order.createdAt ? format(typeof order.createdAt.toDate === 'function' ? order.createdAt.toDate() : new Date(order.createdAt), 'MMM d, h:mm a') : 'Just now'}
                      </p>
                      <h3 className="text-xl font-black text-slate-900">{order.customerName}</h3>
                   </div>
                </div>
                <div className={cn("px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest", getStatusColor(order.status))}>
                   {order.status}
                </div>
             </div>

             <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-12">
                <div className="space-y-6">
                   <div>
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Ordered Items</h4>
                      <div className="space-y-3">
                         {order.items.map((item: any, idx: number) => (
                           <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl">
                              <span className="font-bold text-slate-700">{item.name} <span className="text-slate-400 ml-1">x{item.quantity}</span></span>
                              <span className="font-black text-slate-900">{(Number(item.onlinePrice || item.price || 0) * item.quantity).toLocaleString('pt-MZ')} MT</span>
                           </div>
                         ))}
                      </div>
                      <div className="mt-4 pt-4 border-t border-dashed flex justify-between items-center px-2">
                         <span className="text-lg font-black text-slate-900">Order Total</span>
                         <span className="text-2xl font-black text-blue-600">{(order.total || 0).toLocaleString('pt-MZ')} MT</span>
                      </div>
                   </div>
                </div>

                <div className="space-y-8">
                   <div className="space-y-4">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Delivery Details</h4>
                      <div className="flex items-start gap-3">
                         <MapPin className="text-slate-300 mt-1" size={18} />
                         <p className="text-sm font-bold text-slate-600">{order.deliveryAddress}</p>
                      </div>
                      <div className="flex items-center gap-3">
                         <Phone className="text-slate-300" size={18} />
                         <p className="text-sm font-bold text-slate-600">{order.customerPhone}</p>
                      </div>
                   </div>

                   <div className="pt-8 border-t border-slate-50">
                      {order.status === 'pending' ? (
                        <div className="flex gap-3">
                           <button 
                            onClick={() => handleStatusUpdate(order, 'accepted')}
                            className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20"
                           >
                             <Check size={20} /> Accept
                           </button>
                           <button 
                            onClick={() => handleStatusUpdate(order, 'rejected')}
                            className="flex-1 py-4 bg-rose-50 text-rose-600 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-rose-100 transition-all"
                           >
                             <X size={20} /> Reject
                           </button>
                        </div>
                      ) : order.status === 'accepted' ? (
                        <button 
                          onClick={() => handleStatusUpdate(order, 'delivered')}
                          className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20"
                        >
                          <CheckCircle2 size={20} /> Mark Delivered
                        </button>
                      ) : (
                        <div className="flex items-center justify-between">
                           <p className="text-xs font-bold text-slate-400 italic">Order {order.status} on {order.updatedAt ? format(typeof order.updatedAt.toDate === 'function' ? order.updatedAt.toDate() : new Date(order.updatedAt), 'MMM d') : ''}</p>
                           <button onClick={() => deleteOrder(order.id)} className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"><Trash2 size={18} /></button>
                        </div>
                      )}
                      
                      <div className="flex gap-2 mt-4">
                         <button 
                           onClick={() => handleWhatsAppShare(order)}
                           className="flex-1 py-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all"
                         >
                            <MessageSquare size={14} /> WhatsApp
                         </button>
                         <button 
                           onClick={() => handleViewInvoice(order)}
                           disabled={!order.invoiceNumber}
                           className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all"
                         >
                            <ArrowRight size={14} /> Ver Fatura
                         </button>
                      </div>
                   </div>
                </div>
             </div>
          </div>
        ))}

        {orders.length === 0 && (
          <div className="col-span-full py-32 bg-white rounded-[40px] border border-slate-100 text-center space-y-6">
             <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-200">
                <ShoppingBag size={48} />
             </div>
             <div>
                <h3 className="text-2xl font-black text-slate-900">No active orders</h3>
                <p className="text-slate-500 font-bold max-w-sm mx-auto">When customers place orders via your storefront, they will appear here for processing.</p>
             </div>
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {orders.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-slate-100 mt-4 select-none">
          <div className="text-xs font-semibold text-slate-500 font-sans">
            Mostrando <span className="font-extrabold text-slate-900">{Math.min(orders.length, startIndex + 1)}</span> a{" "}
            <span className="font-extrabold text-slate-900">{Math.min(orders.length, endIndex)}</span> de{" "}
            <span className="font-extrabold text-[#111827]">{orders.length}</span> encomendas
          </div>
          <div className="flex items-center gap-1.5 self-end sm:self-auto">
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              className="px-3 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed bg-white"
            >
              Anterior
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, Math.ceil(orders.length / itemsPerPage)) }, (_, i) => {
                const totalPages = Math.ceil(orders.length / itemsPerPage);
                let pageNum = currentPage;
                if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                if (pageNum < 1 || pageNum > totalPages) return null;
                return (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => setCurrentPage(pageNum)}
                    className={cn(
                      "w-8 h-8 flex items-center justify-center text-xs font-bold rounded-lg transition-all cursor-pointer",
                      currentPage === pageNum ? "bg-slate-900 text-white shadow-sm" : "border border-slate-200 hover:bg-slate-50 text-slate-600 bg-white"
                    )}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              disabled={currentPage === Math.ceil(orders.length / itemsPerPage)}
              onClick={() => setCurrentPage(prev => Math.min(Math.ceil(orders.length / itemsPerPage), prev + 1))}
              className="px-3 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed bg-white"
            >
              Próximo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
