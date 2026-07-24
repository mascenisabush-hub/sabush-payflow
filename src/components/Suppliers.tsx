import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { subscribeToCollection } from '../lib/firestoreCache';
import { collection, query, onSnapshot, addDoc, serverTimestamp, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { 
  Plus, Search, Users, Mail, Phone, MapPin, Edit2, Trash2, Truck, PackageCheck, FileText,
  DollarSign, History, Calendar, CheckCircle, Receipt, ArrowUpRight, Wallet, X, AlertTriangle, MessageSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import Skeleton from './ui/Skeleton';

export default function Suppliers() {
  const { profile, businessData } = useAuth();
  const currency = businessData?.currency || 'MZN';
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [supplierPayments, setSupplierPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<any | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(9);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // Supplier Finance Tracker Action states
  const [selectedFinanceSupplier, setSelectedFinanceSupplier] = useState<any | null>(null);
  const [financeTab, setFinanceTab] = useState<'pending' | 'history'>('pending');
  const [selectedPOTarget, setSelectedPOTarget] = useState<string>('all');
  const [payingExpense, setPayingExpense] = useState<any | null>(null);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMethod, setPayMethod] = useState<string>('Dinheiro');
  const [payDate, setPayDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [payNotes, setPayNotes] = useState<string>('');

  const [newSupplier, setNewSupplier] = useState({
    name: '',
    contactPerson: '',
    email: '',
    phone: '',
    category: '',
    address: '',
    notes: '',
    balance: 0
  });

  useEffect(() => {
    if (!profile?.businessId) return;

    // Load from local storage cache first for instant visual feedback
    const cachedSuppliers = localStorage.getItem(`sabush_cached_suppliers_${profile.businessId}`);
    if (cachedSuppliers) {
      try {
        setSuppliers(JSON.parse(cachedSuppliers));
        setLoading(false);
      } catch (e) {
        console.warn("Could not load cached suppliers:", e);
      }
    }
    
    // Suppliers snapshot
    const qSuppliers = query(collection(db, `businesses/${profile.businessId}/suppliers`));
    const unsubscribeSuppliers = subscribeToCollection(
      `businesses/${profile.businessId}/suppliers`,
      (items) => {
        setSuppliers(items);
        setLoading(false);
        try {
          localStorage.setItem(`sabush_cached_suppliers_${profile.businessId}`, JSON.stringify(items));
        } catch (e) {
          console.warn("Could not cache suppliers:", e);
        }
      },
      qSuppliers,
      (error) => {
        setLoading(false);
        try {
          handleFirestoreError(error, OperationType.LIST, 'suppliers');
        } catch (e) {
          console.warn("Gracefully logged suppliers query error:", e);
        }
      }
    );

    // Expenses snapshot to calculate outstanding balances
    const qExpenses = query(collection(db, `businesses/${profile.businessId}/expenses`));
    const unsubscribeExpenses = subscribeToCollection(
      `businesses/${profile.businessId}/expenses`,
      (items) => {
        setExpenses(items);
      },
      qExpenses
    );

    // Purchase Orders snapshot
    const qPOs = query(collection(db, `businesses/${profile.businessId}/purchase_orders`));
    const unsubscribePOs = subscribeToCollection(
      `businesses/${profile.businessId}/purchase_orders`,
      (items) => {
        setPurchaseOrders(items);
      },
      qPOs
    );

    // Supplier payments snapshot for proof-of-payment history ledger
    const qPayments = query(collection(db, `businesses/${profile.businessId}/supplier_payments`));
    const unsubscribePayments = subscribeToCollection(
      `businesses/${profile.businessId}/supplier_payments`,
      (items) => {
        setSupplierPayments(items);
      },
      qPayments
    );

    return () => {
      unsubscribeSuppliers();
      unsubscribeExpenses();
      unsubscribePOs();
      unsubscribePayments();
    };
  }, [profile?.businessId]);

  const getSupplierOutstanding = (supplierId: string) => {
    const expensesOut = expenses
      .filter(exp => exp.supplierId === supplierId)
      .reduce((sum, exp) => sum + (exp.outstandingBalance || 0), 0);
    const posOut = purchaseOrders
      .filter(po => po.supplierId === supplierId && po.paymentType === 'credit')
      .reduce((sum, po) => sum + (po.outstandingBalance || 0), 0);
    return expensesOut + posOut;
  };

  const handleCreateSupplier = async () => {
    if (!profile?.businessId || !newSupplier.name.trim()) {
      toast.error("Por favor, introduza pelo menos o nome da empresa do fornecedor.");
      return;
    }
    
    try {
      await addDoc(collection(db, `businesses/${profile.businessId}/suppliers`), {
        ...newSupplier,
        name: newSupplier.name.trim(),
        contactPerson: newSupplier.contactPerson.trim(),
        email: newSupplier.email.trim(),
        phone: newSupplier.phone.trim(),
        category: newSupplier.category.trim(),
        address: newSupplier.address.trim(),
        notes: newSupplier.notes.trim(),
        businessId: profile.businessId,
        createdAt: serverTimestamp()
      });
      toast.success("Fornecedor criado com sucesso!");
      setIsCreating(false);
      setNewSupplier({ name: '', contactPerson: '', email: '', phone: '', category: '', address: '', notes: '', balance: 0 });
    } catch (e) {
      console.error(e);
      toast.error("Erro ao adicionar fornecedor.");
    }
  };

  const handleUpdateSupplier = async () => {
    if (!profile?.businessId || !editingSupplier || !editingSupplier.name.trim()) {
      toast.error("O nome do fornecedor é obrigatório.");
      return;
    }

    try {
      const supplierDocRef = doc(db, `businesses/${profile.businessId}/suppliers`, editingSupplier.id);
      await updateDoc(supplierDocRef, {
        name: editingSupplier.name.trim(),
        contactPerson: editingSupplier.contactPerson?.trim() || '',
        email: editingSupplier.email?.trim() || '',
        phone: editingSupplier.phone?.trim() || '',
        category: editingSupplier.category?.trim() || '',
        address: editingSupplier.address?.trim() || '',
        notes: editingSupplier.notes?.trim() || '',
        updatedAt: serverTimestamp()
      });
      toast.success("Fornecedor atualizado com sucesso!");
      setEditingSupplier(null);
    } catch (e) {
      console.error(e);
      toast.error("Erro ao atualizar fornecedor.");
    }
  };

  const handleDeleteSupplier = async (supplierId: string, supplierName: string) => {
    if (!profile?.businessId) return;
    
    const confirmDelete = window.confirm(`Tem a certeza que deseja eliminar o fornecedor "${supplierName}"? Esta ação não pode ser desfeita.`);
    if (!confirmDelete) return;

    try {
      await deleteDoc(doc(db, `businesses/${profile.businessId}/suppliers`, supplierId));
      toast.success("Fornecedor eliminado com sucesso!");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao eliminar fornecedor.");
    }
  };

  const handleRecordSubPayment = async () => {
    if (!profile?.businessId || !selectedFinanceSupplier || !payingExpense) return;
    if (payAmount <= 0) {
      toast.error("Por favor, introduza um valor de pagamento superior a zero.");
      return;
    }
    if (payAmount > (payingExpense.outstandingBalance || 0)) {
      toast.error(`O valor do pagamento não pode exceder o saldo devedor restante de ${(payingExpense.outstandingBalance || 0).toLocaleString()} ${currency}.`);
      return;
    }

    try {
      const newAmountPaid = (payingExpense.amountPaid || 0) + payAmount;
      const newOutstanding = (payingExpense.amount || 0) - newAmountPaid;
      
      let nextStatus = 'Partially Paid';
      if (newOutstanding <= 0) {
        nextStatus = 'Paid';
      }

      // 1. Update the expense document
      const expenseRef = doc(db, `businesses/${profile.businessId}/expenses`, payingExpense.id);
      await updateDoc(expenseRef, {
        amountPaid: newAmountPaid,
        outstandingBalance: newOutstanding,
        paymentStatus: nextStatus,
        updatedAt: serverTimestamp()
      });

      // 2. Add ledger entry to double-entry audit supplier_payments
      await addDoc(collection(db, `businesses/${profile.businessId}/supplier_payments`), {
        supplierId: selectedFinanceSupplier.id,
        supplierName: selectedFinanceSupplier.name,
        expenseId: payingExpense.id,
        expenseTitle: payingExpense.title,
        amountPaid: payAmount,
        paymentMethod: payMethod,
        date: payDate,
        notes: payNotes.trim() || 'Pagamento parcial de fatura.',
        createdAt: serverTimestamp()
      });

      toast.success("Pagamento registado!");
      
      setPayingExpense(null);
      setPayAmount(0);
      setPayNotes('');
    } catch (err) {
      console.error("Error writing payment update:", err);
      toast.error("Erro ao registar o pagamento.");
    }
  };

  const filteredSuppliers = suppliers.filter(s => 
    s.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.contactPerson?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedSuppliers = filteredSuppliers.slice(startIndex, endIndex);

  return (
    <div className="space-y-6">
      {/* Header Area */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900">Rede de Fornecedores</h2>
          <p className="text-slate-500">Faça a gestão de fornecedores, categorias e origens de stock.</p>
        </div>
        <button 
          onClick={() => {
            setIsCreating(true);
            setEditingSupplier(null);
          }}
          className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-2xl font-bold shadow-lg shadow-blue-500/10 hover:bg-blue-700 transition-all active:scale-95 self-start md:self-center"
        >
          <Plus size={20} />
          Registar Fornecedor
        </button>
      </div>

      {/* Quick Search & Count Filter */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm">
        <div className="w-full sm:w-80 relative">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search size={16} />
          </span>
          <input
            type="text"
            placeholder="Pesquisar por nome, categoria ou contacto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-xs font-semibold text-slate-800"
          />
        </div>
        <div className="text-xs font-bold text-slate-400">
          Total: <span className="text-slate-900 font-extrabold">{filteredSuppliers.length}</span> fornecedores encontrados
        </div>
      </div>

      {/* Creational Form */}
      {isCreating && (
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-2xl space-y-6 animate-in slide-in-from-top-4">
          <h3 className="text-lg font-bold text-slate-900">Registar Novo Fornecedor</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-1">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Nome da Empresa *</label>
              <input 
                className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-800 text-sm"
                value={newSupplier.name}
                onChange={e => setNewSupplier({...newSupplier, name: e.target.value})}
                placeholder="Ex: Armazéns Aliança Lda"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Pessoa de Contacto</label>
              <input 
                className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-800 text-sm"
                value={newSupplier.contactPerson}
                onChange={e => setNewSupplier({...newSupplier, contactPerson: e.target.value})}
                placeholder="Ex: Carlos Mateus"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Categoria / Sector</label>
              <input 
                className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-800 text-sm"
                value={newSupplier.category}
                placeholder="Ex: Eletrónicos, Bebidas, Alimentação..."
                onChange={e => setNewSupplier({...newSupplier, category: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Telefone</label>
              <input 
                type="tel"
                className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-slate-850 font-mono text-sm"
                value={newSupplier.phone}
                placeholder="Ex: +258 84 000 0000"
                onChange={e => setNewSupplier({...newSupplier, phone: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Email</label>
              <input 
                type="email"
                className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-slate-850 text-sm"
                value={newSupplier.email}
                placeholder="fornecedor@empresa.com"
                onChange={e => setNewSupplier({...newSupplier, email: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Endereço / Localização</label>
              <input 
                className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-800 text-sm"
                value={newSupplier.address}
                placeholder="Ex: Av. Eduardo Mondlane, Maputo"
                onChange={e => setNewSupplier({...newSupplier, address: e.target.value})}
              />
            </div>
            <div className="space-y-1 md:col-span-2 lg:col-span-3">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Notas Internas ou Observações</label>
              <textarea 
                className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-800 text-sm min-h-[80px]"
                value={newSupplier.notes}
                placeholder="Condições de venda, tempos de carregamento, prazos de pagamento aceites..."
                onChange={e => setNewSupplier({...newSupplier, notes: e.target.value})}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-6 border-t">
            <button onClick={() => setIsCreating(false)} className="px-6 py-3 text-slate-500 font-bold hover:bg-slate-100 rounded-2xl transition-all text-xs">Cancelar</button>
            <button onClick={handleCreateSupplier} className="px-10 py-3 bg-blue-600 text-white rounded-2xl font-black shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all text-xs">Confirmar Registo</button>
          </div>
        </div>
      )}

      {/* Editing Form */}
      {editingSupplier && (
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-2xl space-y-6 animate-in slide-in-from-top-4">
          <h3 className="text-lg font-bold text-slate-900">Editar Fornecedor: <span className="text-blue-600">{editingSupplier.name}</span></h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-1">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Nome da Empresa *</label>
              <input 
                className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-800 text-sm"
                value={editingSupplier.name}
                onChange={e => setEditingSupplier({...editingSupplier, name: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Pessoa de Contacto</label>
              <input 
                className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-800 text-sm"
                value={editingSupplier.contactPerson || ''}
                onChange={e => setEditingSupplier({...editingSupplier, contactPerson: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Categoria / Sector</label>
              <input 
                className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-800 text-sm"
                value={editingSupplier.category || ''}
                onChange={e => setEditingSupplier({...editingSupplier, category: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Telefone</label>
              <input 
                type="tel"
                className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-slate-850 font-mono text-sm"
                value={editingSupplier.phone || ''}
                onChange={e => setEditingSupplier({...editingSupplier, phone: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Email</label>
              <input 
                type="email"
                className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-slate-850 text-sm"
                value={editingSupplier.email || ''}
                onChange={e => setEditingSupplier({...editingSupplier, email: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Endereço / Localização</label>
              <input 
                className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-800 text-sm"
                value={editingSupplier.address || ''}
                onChange={e => setEditingSupplier({...editingSupplier, address: e.target.value})}
              />
            </div>
            <div className="space-y-1 md:col-span-2 lg:col-span-3">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Notas Internas ou Observações</label>
              <textarea 
                className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-medium text-slate-800 text-sm min-h-[80px]"
                value={editingSupplier.notes || ''}
                onChange={e => setEditingSupplier({...editingSupplier, notes: e.target.value})}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-6 border-t">
            <button onClick={() => setEditingSupplier(null)} className="px-6 py-3 text-slate-500 font-bold hover:bg-slate-100 rounded-2xl transition-all text-xs">Cancelar</button>
            <button onClick={handleUpdateSupplier} className="px-10 py-3 bg-blue-600 text-white rounded-2xl font-black shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all text-xs">Salvar Alterações</button>
          </div>
        </div>
      )}

      {/* Grid List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {paginatedSuppliers.map((sup) => (
          <div key={sup.id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl transition-all group border-l-4 border-l-blue-600 flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between mb-4">
                <div className="p-3.5 bg-blue-50 text-blue-600 rounded-2xl">
                  <Truck size={22} />
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="px-2.5 py-1 bg-slate-50 rounded-xl text-[9px] font-black uppercase tracking-widest text-slate-400">
                    {sup.category || 'Fornecedor'}
                  </div>
                  <button 
                    onClick={() => {
                      setEditingSupplier(sup);
                      setIsCreating(false);
                    }}
                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                    title="Editar fornecedor"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button 
                    onClick={() => handleDeleteSupplier(sup.id, sup.name)}
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                    title="Eliminar fornecedor"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="space-y-1 mb-5">
                <h3 className="text-lg font-black text-slate-900 truncate" title={sup.name}>{sup.name}</h3>
                <p className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
                  <Users size={12} className="text-blue-500" />
                  {sup.contactPerson || 'Sem Pessoa de Contacto'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 pb-4 border-b border-slate-50 text-xs">
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5 flex items-center gap-1">
                    <Mail size={10} /> Email
                  </p>
                  <p className="font-semibold text-slate-800 truncate" title={sup.email}>{sup.email || '-'}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5 flex items-center gap-1">
                    <Phone size={10} /> Telefone
                  </p>
                  <p className="font-semibold text-slate-800 truncate font-mono">{sup.phone || '-'}</p>
                </div>
              </div>

              {(sup.address || sup.notes) && (
                <div className="pt-3 pb-3 border-b border-slate-50 text-xs space-y-2">
                  {sup.address && (
                    <div className="flex gap-1.5 items-start">
                      <MapPin size={12} className="text-slate-400 shrink-0 mt-0.5" />
                      <p className="font-medium text-slate-600 line-clamp-2" title={sup.address}>{sup.address}</p>
                    </div>
                  )}
                  {sup.notes && (
                    <div className="flex gap-1.5 items-start">
                      <FileText size={12} className="text-slate-400 shrink-0 mt-0.5" />
                      <p className="font-medium text-slate-500 italic line-clamp-2" title={sup.notes}>{sup.notes}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-50 mt-4">
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Saldo Devedor</p>
                {getSupplierOutstanding(sup.id) > 0 ? (
                  <div className="flex items-center gap-1 font-black text-rose-600 text-xs bg-rose-50 px-2 py-0.5 rounded-lg animate-pulse">
                    <AlertTriangle size={12} />
                    <span>{getSupplierOutstanding(sup.id).toLocaleString()} {currency}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 font-black text-emerald-600 text-xs bg-emerald-50 px-2 py-0.5 rounded-lg">
                    <CheckCircle size={12} />
                    <span>Regularizado</span>
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  setSelectedFinanceSupplier(sup);
                  setFinanceTab('pending');
                  setPayingExpense(null);
                  setSelectedPOTarget('all');
                }}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black transition-all shadow-md shadow-blue-500/10 active:scale-95"
              >
                <Wallet size={12} />
                <span>Ver Finanças</span>
              </button>
            </div>
          </div>
        ))}
        
        {filteredSuppliers.length === 0 && !loading && (
          <div className="col-span-full py-20 text-center bg-white rounded-3xl border border-slate-100 shadow-sm flex flex-col items-center justify-center">
            <Truck size={64} className="mb-4 text-slate-100" />
            <p className="text-slate-400 font-bold uppercase tracking-widest text-xs mb-1">Nenhum fornecedor registado</p>
            <p className="text-slate-500 font-medium text-sm">Registe fornecedores para manter a rastreabilidade do seu stock.</p>
          </div>
        )}

        {loading && (
          <>
            {[1, 2, 3].map((n) => (
              <div key={n} className="bg-white rounded-3xl border border-slate-100 p-6 space-y-4">
                <div className="flex justify-between items-start">
                  <div className="space-y-2 w-2/3">
                    <Skeleton className="h-5 w-full rounded" />
                    <Skeleton className="h-4 w-1/2 rounded" />
                  </div>
                  <Skeleton className="w-10 h-10 rounded-full" />
                </div>
                <div className="space-y-2 pt-2 border-t border-slate-50">
                  <Skeleton className="h-4 w-5/6 rounded" />
                  <Skeleton className="h-4 w-3/4 rounded" />
                </div>
                <div className="flex justify-between items-center pt-2">
                  <Skeleton className="h-6 w-1/3 rounded" />
                  <Skeleton className="h-8 w-1/3 rounded-xl" />
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Pagination Controls */}
      {filteredSuppliers.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-slate-100 mt-4 select-none">
          <div className="text-xs font-semibold text-slate-500 font-sans">
            Mostrando <span className="font-extrabold text-slate-900">{Math.min(filteredSuppliers.length, startIndex + 1)}</span> a{" "}
            <span className="font-extrabold text-slate-900">{Math.min(filteredSuppliers.length, endIndex)}</span> de{" "}
            <span className="font-extrabold text-[#111111]">{filteredSuppliers.length}</span> fornecedores
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
              {Array.from({ length: Math.min(5, Math.ceil(filteredSuppliers.length / itemsPerPage)) }, (_, i) => {
                const totalPages = Math.ceil(filteredSuppliers.length / itemsPerPage);
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
              disabled={currentPage === Math.ceil(filteredSuppliers.length / itemsPerPage)}
              onClick={() => setCurrentPage(prev => Math.min(Math.ceil(filteredSuppliers.length / itemsPerPage), prev + 1))}
              className="px-3 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed bg-white"
            >
              Próximo
            </button>
          </div>
        </div>
      )}

      {/* Dynamic Payment Tracking Drawer */}
      <AnimatePresence>
        {selectedFinanceSupplier && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.3 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedFinanceSupplier(null)}
              className="fixed inset-0 bg-slate-950 z-[100]"
            />
            
            {/* Drawer */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-xl bg-slate-50 border-l border-slate-100 shadow-2xl z-[110] flex flex-col overflow-hidden"
            >
              {/* Drawer Header */}
              <div className="p-6 bg-white border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-slate-900">{selectedFinanceSupplier.name}</h3>
                  <p className="text-[10px] text-blue-600 font-extrabold uppercase tracking-widest flex items-center gap-1.5 mt-0.5">
                    <Truck size={12} />
                    <span>Gestão Financeira & Balanços</span>
                  </p>
                </div>
                <button
                  onClick={() => setSelectedFinanceSupplier(null)}
                  className="p-2 text-slate-400 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-xl transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Dynamic Stats Banner */}
              <div className="p-6 grid grid-cols-2 gap-4 bg-white border-b border-slate-100 shrink-0">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider block mb-1">Dívida em Aberto</span>
                  <span className={cn(
                    "text-xl font-black block tracking-tight",
                    getSupplierOutstanding(selectedFinanceSupplier.id) > 0 ? "text-rose-600 animate-pulse" : "text-emerald-600"
                  )}>
                    {getSupplierOutstanding(selectedFinanceSupplier.id).toLocaleString()} {currency}
                  </span>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider block mb-1">Total Transacionado</span>
                  <span className="text-xl font-black text-slate-800 block tracking-tight">
                    {expenses
                      .filter(e => e.supplierId === selectedFinanceSupplier.id)
                      .reduce((sum, e) => sum + e.amount, 0)
                      .toLocaleString()} {currency}
                  </span>
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="flex bg-white px-6 border-b border-slate-100 shrink-0">
                <button
                  onClick={() => { setFinanceTab('pending'); setPayingExpense(null); }}
                  className={cn(
                    "flex-1 py-4 font-black text-xs uppercase tracking-wider border-b-2 text-center transition-all",
                    financeTab === 'pending'
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-slate-400 hover:text-slate-700"
                  )}
                >
                  Contas em Aberto ({expenses.filter(e => e.supplierId === selectedFinanceSupplier.id && e.outstandingBalance > 0).length})
                </button>
                <button
                  onClick={() => { setFinanceTab('history'); setPayingExpense(null); }}
                  className={cn(
                    "flex-1 py-4 font-black text-xs uppercase tracking-wider border-b-2 text-center transition-all",
                    financeTab === 'history'
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-slate-400 hover:text-slate-700"
                  )}
                >
                  Histórico de Pagamentos ({supplierPayments.filter(p => p.supplierId === selectedFinanceSupplier.id).length})
                </button>
              </div>

              {/* Drawer Content Area */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {financeTab === 'pending' ? (
                  <>
                    {/* List of outstanding bills */}
                    {expenses.filter(e => e.supplierId === selectedFinanceSupplier.id && e.outstandingBalance > 0).length === 0 ? (
                      <div className="p-12 text-center flex flex-col items-center justify-center space-y-3">
                        <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center">
                          <CheckCircle size={32} />
                        </div>
                        <div>
                          <p className="font-black text-slate-800 text-sm">Finanças Regularizadas!</p>
                          <p className="text-xs text-slate-400 font-medium max-w-xs mx-auto mt-1 leading-relaxed">Não existem faturas ou despesas em dívida para este fornecedor.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {expenses
                          .filter(e => e.supplierId === selectedFinanceSupplier.id && e.outstandingBalance > 0)
                          .map(exp => {
                            const isSelected = payingExpense?.id === exp.id;
                            return (
                              <div key={exp.id} className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4 shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex items-start justify-between">
                                  <div>
                                    <h4 className="font-extrabold text-slate-800 text-sm text-balance">{exp.title}</h4>
                                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1 mt-1">
                                      <Calendar size={10} />
                                      {exp.date}
                                    </span>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-xs text-slate-400 font-bold block">Falta Pagar</span>
                                    <span className="text-sm font-black text-rose-600">{exp.outstandingBalance?.toLocaleString()} {currency}</span>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3 text-[10px] py-2 bg-slate-50 rounded-xl px-3 border border-slate-100">
                                  <div>
                                    <span className="text-slate-400 block font-bold">Total da Fatura:</span>
                                    <span className="font-black text-slate-700">{exp.amount?.toLocaleString()} {currency}</span>
                                  </div>
                                  <div>
                                    <span className="text-slate-400 block font-bold">Valor Pago Inicial:</span>
                                    <span className="font-black text-slate-700">{(exp.amountPaid || 0).toLocaleString()} {currency}</span>
                                  </div>
                                </div>

                                {!isSelected ? (
                                  <button
                                    onClick={() => {
                                      setPayingExpense(exp);
                                      setPayAmount(exp.outstandingBalance);
                                      setPayNotes('');
                                    }}
                                    className="w-full flex items-center justify-center gap-1.5 py-3 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white rounded-xl text-xs font-black transition-all"
                                  >
                                    <Wallet size={12} />
                                    <span>Efetuar Pagamento</span>
                                  </button>
                                ) : (
                                  <div className="p-4 bg-slate-50 rounded-xl border border-blue-100/50 space-y-4 animate-in slide-in-from-top-2 duration-150">
                                    <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                                      <span className="text-[10px] font-black uppercase tracking-widest text-blue-600">Amortizar Dívida</span>
                                      <button 
                                        onClick={() => setPayingExpense(null)} 
                                        className="text-[10px] font-black text-rose-500 uppercase tracking-widest"
                                      >
                                        Cancelar
                                      </button>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-3">
                                      <div>
                                        <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Valor a Pagar ({currency})</label>
                                        <input 
                                          type="number"
                                          className="w-full p-2.5 bg-white border border-slate-100 rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                                          value={payAmount}
                                          onChange={e => setPayAmount(Number(e.target.value))}
                                          max={exp.outstandingBalance}
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[9px] font-black text-slate-405 uppercase mb-1">Método</label>
                                        <select 
                                          className="w-full p-2.5 bg-white border border-slate-100 rounded-lg text-xs font-bold outline-none cursor-pointer"
                                          value={payMethod}
                                          onChange={e => setPayMethod(e.target.value)}
                                        >
                                          <option value="Dinheiro">Dinheiro</option>
                                          <option value="M-Pesa">M-Pesa</option>
                                          <option value="E-Mola">E-Mola</option>
                                          <option value="Transferência Bancária">Transferência Bancária</option>
                                          <option value="Cheque">Cheque</option>
                                        </select>
                                      </div>
                                    </div>

                                    <div>
                                      <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Data do Pagamento</label>
                                      <input 
                                        type="date"
                                        className="w-full p-2.5 bg-white border border-slate-100 rounded-lg text-xs font-bold outline-none"
                                        value={payDate}
                                        onChange={e => setPayDate(e.target.value)}
                                      />
                                    </div>

                                    <div>
                                      <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Notas (Opcional)</label>
                                      <input 
                                        type="text"
                                        placeholder="Ex: Pagamento parcelado"
                                        className="w-full p-2.5 bg-white border border-slate-100 rounded-lg text-xs font-medium outline-none"
                                        value={payNotes}
                                        onChange={e => setPayNotes(e.target.value)}
                                      />
                                    </div>

                                    <button
                                      onClick={handleRecordSubPayment}
                                      className="w-full py-3 bg-blue-600 text-white rounded-xl text-xs font-black shadow-lg shadow-blue-500/10 active:scale-95 transition-transform"
                                    >
                                      Confirmar Amortização
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="space-y-3">
                      {/* Filter Controls for Purchase Orders and General Expenses */}
                      <div className="bg-slate-50 p-4.5 rounded-2xl border border-slate-150 space-y-2">
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">
                          🔍 Filtrar por Documento ou Ordem de Compra:
                        </label>
                        <select
                          value={selectedPOTarget}
                          onChange={(e) => setSelectedPOTarget(e.target.value)}
                          className="w-full text-xs font-black p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 transition-all cursor-pointer"
                        >
                          <option value="all">Ver Tudo (Todos os Pagamentos)</option>
                          <optgroup label="Ordens de Compra & Stock">
                            {purchaseOrders
                              .filter(po => po.supplierId === selectedFinanceSupplier.id)
                              .map(po => (
                                <option key={po.id} value={po.id}>
                                  {po.orderNumber} - Compra {po.paymentType === 'credit' ? 'a Crédito' : 'a Pronto'} (Compromisso: {(po.totalCost || 0).toLocaleString()} {currency})
                                </option>
                              ))
                            }
                          </optgroup>
                          <optgroup label="Despesas Gerais & Faturas">
                            {expenses
                              .filter(e => e.supplierId === selectedFinanceSupplier.id)
                              .map(e => (
                                <option key={e.id} value={e.id}>
                                  Fatura: {e.title} (Total: {(e.amount || 0).toLocaleString()} {currency})
                                </option>
                              ))
                            }
                          </optgroup>
                        </select>
                      </div>

                      {/* Summary details card if target selected */}
                      {selectedPOTarget !== 'all' && (() => {
                        const matchedPo = purchaseOrders.find(po => po.id === selectedPOTarget);
                        if (matchedPo) {
                          return (
                            <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-2xl space-y-2 animate-in fade-in-50 duration-200">
                              <div className="flex justify-between items-center">
                                <span className="text-xs font-black text-slate-850 uppercase tracking-wide">Resumo da Ordem de Compra: {matchedPo.orderNumber}</span>
                                <span className={cn(
                                  "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest text-white shadow-sm",
                                  matchedPo.paymentStatus === 'paid' ? "bg-emerald-600" :
                                  matchedPo.paymentStatus === 'partially_paid' ? "bg-blue-650" : "bg-rose-600 animate-pulse"
                                )}>
                                  {matchedPo.paymentStatus === 'paid' ? 'Totalmente Pago' :
                                   matchedPo.paymentStatus === 'partially_paid' ? 'Pago Parcial' : 'Por Pagar'}
                                </span>
                              </div>
                              <div className="grid grid-cols-3 gap-2 font-mono text-[10px] text-slate-600 bg-white p-3 rounded-xl border border-blue-50">
                                <div className="text-left">
                                  <span className="block text-slate-400 font-extrabold uppercase text-[7.5px] tracking-wide leading-none mb-1">Custo Total</span>
                                  <span className="font-extrabold text-slate-900">{(matchedPo.totalCost || 0).toLocaleString()} {currency}</span>
                                </div>
                                <div className="text-left">
                                  <span className="block text-slate-400 font-extrabold uppercase text-[7.5px] tracking-wide leading-none mb-1">Total Amortizado</span>
                                  <span className="font-extrabold text-emerald-650">{(matchedPo.paidAmount || 0).toLocaleString()} {currency}</span>
                                </div>
                                <div className="text-left">
                                  <span className="block text-slate-400 font-extrabold uppercase text-[7.5px] tracking-wide leading-none mb-1">Saldo Devedor</span>
                                  <span className="font-extrabold text-rose-600">{(matchedPo.outstandingBalance || 0).toLocaleString()} {currency}</span>
                                </div>
                              </div>
                            </div>
                          );
                        }

                        const matchedExp = expenses.find(e => e.id === selectedPOTarget);
                        if (matchedExp) {
                          return (
                            <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-2 animate-in fade-in-50 duration-200">
                              <div className="flex justify-between items-center">
                                <span className="text-xs font-black text-slate-850 uppercase tracking-wide">Resumo de Fatura/Despesa</span>
                                <span className={cn(
                                  "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest text-white shadow-sm",
                                  matchedExp.outstandingBalance <= 0 ? "bg-emerald-600" : "bg-rose-600 animate-pulse"
                                )}>
                                  {matchedExp.outstandingBalance <= 0 ? 'Liquidada' : 'Em Aberto'}
                                </span>
                              </div>
                              <div className="grid grid-cols-3 gap-2 font-mono text-[10px] text-slate-600 bg-white p-3 rounded-xl border border-slate-100">
                                <div className="text-left">
                                  <span className="block text-slate-400 font-extrabold uppercase text-[7.5px] tracking-wide leading-none mb-1">Valor Total</span>
                                  <span className="font-extrabold text-slate-900">{(matchedExp.amount || 0).toLocaleString()} {currency}</span>
                                </div>
                                <div className="text-left">
                                  <span className="block text-slate-400 font-extrabold uppercase text-[7.5px] tracking-wide leading-none mb-1">Total Pago</span>
                                  <span className="font-extrabold text-emerald-650">{(matchedExp.amountPaid || 0).toLocaleString()} {currency}</span>
                                </div>
                                <div className="text-left">
                                  <span className="block text-slate-400 font-extrabold uppercase text-[7.5px] tracking-wide leading-none mb-1">Saldo Devedor</span>
                                  <span className="font-extrabold text-rose-600">{(matchedExp.outstandingBalance || 0).toLocaleString()} {currency}</span>
                                </div>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>

                    {/* Filtered Payments List */}
                    {supplierPayments
                      .filter(p => p.supplierId === selectedFinanceSupplier.id)
                      .filter(p => {
                        if (selectedPOTarget === 'all') return true;
                        return p.purchaseOrderId === selectedPOTarget || p.expenseId === selectedPOTarget;
                      })
                      .length === 0 ? (
                      <div className="p-12 text-center flex flex-col items-center justify-center space-y-3 bg-slate-50 border border-slate-100 rounded-3xl mt-4">
                        <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center">
                          <History size={28} />
                        </div>
                        <div>
                          <p className="font-extrabold text-slate-800 text-sm">Sem Transações Registadas</p>
                          <p className="text-xs text-slate-400 font-medium max-w-xs mx-auto mt-1 leading-relaxed">Não foi encontrado nenhum registo de transação para a seleção atual.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3 mt-4">
                        {supplierPayments
                          .filter(p => p.supplierId === selectedFinanceSupplier.id)
                          .filter(p => {
                            if (selectedPOTarget === 'all') return true;
                            return p.purchaseOrderId === selectedPOTarget || p.expenseId === selectedPOTarget;
                          })
                          .sort((a,b) => {
                            const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.date || a.createdAt || 0).getTime();
                            const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.date || b.createdAt || 0).getTime();
                            return dateB - dateA;
                          })
                          .map(pay => (
                            <div key={pay.id} className="bg-white p-4.5 rounded-2xl border border-slate-100 shadow-sm flex items-start gap-4 hover:border-slate-200 transition-all">
                              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
                                <Receipt size={18} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <h4 className="font-extrabold text-slate-800 text-xs truncate uppercase tracking-tight" title={pay.expenseTitle || pay.purchaseOrderNumber || pay.notes}>
                                    {pay.purchaseOrderNumber ? `Compra: ${pay.purchaseOrderNumber}` : (pay.expenseTitle || 'Amortização')}
                                  </h4>
                                  <span className="font-black text-emerald-600 text-xs shrink-0 font-mono">+{pay.amountPaid?.toLocaleString()} {currency}</span>
                                </div>
                                <p className="text-[10px] font-bold text-slate-400 mt-0.5 flex items-center gap-1.5 uppercase tracking-wide">
                                  <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 text-[9px] font-black">{pay.paymentMethod}</span>
                                  <span>•</span>
                                  <span className="font-mono">{pay.date}</span>
                                </p>
                                {pay.notes && (
                                  <p className="text-[10px] text-slate-500 italic font-medium bg-slate-50 px-2.5 py-1.5 rounded-lg mt-2 font-serif text-balance">
                                    "{pay.notes}"
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
