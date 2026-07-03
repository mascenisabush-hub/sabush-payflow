import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { subscribeToCollection } from '../lib/firestoreCache';
import { collection, query, onSnapshot, addDoc, serverTimestamp, getDocs, setDoc, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { Plus, CreditCard, Calendar, Tag, Trash2, PieChart, Info, Settings, BarChart3, FolderMinus, TrendingUp, Edit, Lock, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { ResponsiveContainer, PieChart as ReChartsPieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import ManagerPINModal from './ManagerPINModal';

const DEFAULT_CATEGORIES = ['Operational', 'Salary', 'Supplies', 'Marketing', 'Utilities', 'Rent'];
const COLORS = ['#3b82f6', '#10b981', '#6366f1', '#8b5cf6', '#06b6d4', '#f59e0b', '#ec4899', '#f43f5e'];

export default function Expenses() {
  const { profile, businessData } = useAuth();
  const { t } = useTranslation();
  const currency = businessData?.currency || 'MZN';
  const [expenses, setExpenses] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isManagingCategories, setIsManagingCategories] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  const [newExpense, setNewExpense] = useState({
    title: '',
    amount: 0,
    category: 'Operational',
    date: new Date().toISOString().split('T')[0],
    supplierId: '',
    paymentStatus: 'Paid',
    amountPaid: 0,
    dueDate: ''
  });

  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinSuccessAction, setPinSuccessAction] = useState<() => void>(() => {});
  const [pinActionName, setPinActionName] = useState('');

  const [isEditing, setIsEditing] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.businessId) return;

    // Listen for suppliers to link
    const qSuppliers = query(collection(db, `businesses/${profile.businessId}/suppliers`));
    const unsubSuppliers = subscribeToCollection(
      `businesses/${profile.businessId}/suppliers`,
      (items) => {
        setSuppliers(items);
      },
      qSuppliers
    );

    // Listen for expenses
    const qExpenses = query(collection(db, `businesses/${profile.businessId}/expenses`));
    const unsubExpenses = subscribeToCollection(
      `businesses/${profile.businessId}/expenses`,
      (items) => {
        setExpenses(items);
      },
      qExpenses,
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, 'expenses');
        } catch (e) {
          console.warn("Gracefully logged expenses query error:", e);
        }
      }
    );

    // Listen for categories
    const qCats = query(collection(db, `businesses/${profile.businessId}/expense_categories`));
    const unsubCats = subscribeToCollection(
      `businesses/${profile.businessId}/expense_categories`,
      (items) => {
        if (items.length === 0) {
          // If no categories yet, initialize with defaults
          initializeDefaultCategories();
        } else {
          const loadedCats = items.map((doc: any) => doc.name);
          setCategories(loadedCats);
          setNewExpense(prev => {
            if (!prev.category || !loadedCats.includes(prev.category)) {
              return { ...prev, category: loadedCats[0] || 'Operational' };
            }
            return prev;
          });
        }
      },
      qCats
    );

    return () => {
      unsubExpenses();
      unsubCats();
      unsubSuppliers();
    };
  }, [profile?.businessId]);

  const initializeDefaultCategories = async () => {
    if (!profile?.businessId) return;
    try {
      const batchPromises = DEFAULT_CATEGORIES.map(name => {
        return setDoc(doc(db, `businesses/${profile.businessId}/expense_categories`, name), {
          name,
          createdAt: serverTimestamp()
        });
      });
      await Promise.all(batchPromises);
    } catch (err) {
      console.error("Failed to initialize default categories", err);
    }
  };

  const handleAddCategory = async () => {
    if (!profile?.businessId || !newCategoryName.trim()) return;
    try {
      const catName = newCategoryName.trim();
      if (categories.includes(catName)) {
        toast.error("Category already exists");
        return;
      }
      await setDoc(doc(db, `businesses/${profile.businessId}/expense_categories`, catName), {
        name: catName,
        createdAt: serverTimestamp()
      });
      toast.success("Category added");
      setNewCategoryName('');
    } catch (e) {
      toast.error("Failed to add category");
    }
  };

  const handleAddExpense = async () => {
    if (!profile?.businessId) {
      toast.error("Erro: ID de negócio não encontrado.");
      return;
    }
    const titleVal = (newExpense.title || '').trim();
    if (!titleVal) {
      toast.error("Por favor, introduza o título da despesa.");
      return;
    }
    if (newExpense.amount <= 0) {
      toast.error("Por favor, introduza um valor válido maior que zero.");
      return;
    }
    
    let resolvedSupplierName = '';
    let calculatedAmountPaid = newExpense.amount;
    let calculatedOutstanding = 0;
    let finalPaymentStatus = newExpense.paymentStatus;

    if (newExpense.supplierId) {
      const selectedSup = suppliers.find(s => s.id === newExpense.supplierId);
      resolvedSupplierName = selectedSup ? selectedSup.name : '';
      
      if (newExpense.paymentStatus === 'Paid') {
        calculatedAmountPaid = newExpense.amount;
        calculatedOutstanding = 0;
      } else if (newExpense.paymentStatus === 'Unpaid') {
        calculatedAmountPaid = 0;
        calculatedOutstanding = newExpense.amount;
      } else if (newExpense.paymentStatus === 'Partially Paid') {
        if (newExpense.amountPaid <= 0 || newExpense.amountPaid >= newExpense.amount) {
          toast.error("O valor pago parcialmente deve ser maior que 0 e menor que o valor total.");
          return;
        }
        calculatedAmountPaid = newExpense.amountPaid;
        calculatedOutstanding = newExpense.amount - newExpense.amountPaid;
      }
    } else {
      finalPaymentStatus = 'Paid';
      calculatedAmountPaid = newExpense.amount;
      calculatedOutstanding = 0;
    }

    try {
      if (isEditing && editingExpenseId) {
        await updateDoc(doc(db, `businesses/${profile.businessId}/expenses`, editingExpenseId), {
          title: titleVal,
          amount: newExpense.amount,
          category: newExpense.category || categories[0] || 'Operational',
          date: newExpense.date,
          supplierId: newExpense.supplierId || '',
          supplierName: resolvedSupplierName,
          paymentStatus: finalPaymentStatus,
          amountPaid: calculatedAmountPaid,
          outstandingBalance: calculatedOutstanding,
          dueDate: calculatedOutstanding > 0 ? (newExpense.dueDate || '') : '',
          updatedAt: serverTimestamp()
        });

        toast.success("Despesa atualizada com sucesso!");
        handleCancelEdit();
      } else {
        const expenseRef = await addDoc(collection(db, `businesses/${profile.businessId}/expenses`), {
          title: titleVal,
          amount: newExpense.amount,
          category: newExpense.category || categories[0] || 'Operational',
          date: newExpense.date,
          supplierId: newExpense.supplierId || '',
          supplierName: resolvedSupplierName,
          paymentStatus: finalPaymentStatus,
          amountPaid: calculatedAmountPaid,
          outstandingBalance: calculatedOutstanding,
          dueDate: calculatedOutstanding > 0 ? (newExpense.dueDate || '') : '',
          businessId: profile.businessId,
          createdAt: serverTimestamp()
        });

        if (newExpense.supplierId && calculatedAmountPaid > 0) {
          await addDoc(collection(db, `businesses/${profile.businessId}/supplier_payments`), {
            supplierId: newExpense.supplierId,
            supplierName: resolvedSupplierName,
            expenseId: expenseRef.id,
            expenseTitle: titleVal,
            amountPaid: calculatedAmountPaid,
            paymentMethod: 'Início',
            date: newExpense.date,
            notes: 'Valor pago inicialmente na criação da despesa.',
            createdAt: serverTimestamp()
          });
        }

        toast.success("Despesa registada!");
        setIsCreating(false);
        setNewExpense({ 
          title: '', 
          amount: 0, 
          category: categories[0] || 'Operational', 
          date: new Date().toISOString().split('T')[0],
          supplierId: '',
          paymentStatus: 'Paid',
          amountPaid: 0,
          dueDate: ''
        });
      }
    } catch (e) {
      toast.error(isEditing ? "Falha ao atualizar despesa" : "Falha ao registar despesa");
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const requestAuthorization = (action: 'delete' | 'bulk_delete' | 'edit', payload: any) => {
    let actionLabel = '';
    let successFn: () => void = () => {};

    if (action === 'delete') {
      actionLabel = 'Apagar registo de despesa';
      successFn = () => executeDelete(payload);
    } else if (action === 'bulk_delete') {
      actionLabel = `Apagar ${selectedIds.length} despesas em massa`;
      successFn = () => executeBulkDelete();
    } else if (action === 'edit') {
      actionLabel = `Alterar/Editar despesa [${payload.title}]`;
      successFn = () => executeEditSetup(payload);
    }

    const userRole = profile?.role;
    const hasManagerPrivilege = userRole === 'owner' || userRole === 'business_owner' || userRole === 'manager' || userRole === 'admin' || userRole?.toLowerCase() === 'super_admin';
    const isAuthorizedStaffToTrigger = hasManagerPrivilege || userRole === 'staff' || userRole === 'cashier' || userRole === 'accountant';

    if (!isAuthorizedStaffToTrigger) {
      toast.error("Apenas colaboradores autorizados do negócio podem solicitar esta ação.");
      return;
    }

    if (hasManagerPrivilege) {
      successFn();
    } else {
      setPinActionName(actionLabel);
      setPinSuccessAction(() => successFn);
      setPinModalOpen(true);
    }
  };

  const executeDelete = async (id: string) => {
    if (!profile?.businessId) return;
    try {
      await deleteDoc(doc(db, `businesses/${profile.businessId}/expenses`, id));
      toast.success("Despesa apagada com sucesso!");
      if (editingExpenseId === id) {
        handleCancelEdit();
      }
    } catch (error) {
      toast.error("Erro ao apagar despesa.");
    }
  };

  const executeBulkDelete = async () => {
    if (!profile?.businessId || selectedIds.length === 0) return;
    try {
      const deletePromises = selectedIds.map(id => 
        deleteDoc(doc(db, `businesses/${profile.businessId}/expenses`, id))
      );
      await Promise.all(deletePromises);
      toast.success(`${selectedIds.length} despesas apagadas com sucesso!`);
      if (editingExpenseId && selectedIds.includes(editingExpenseId)) {
        handleCancelEdit();
      }
      setSelectedIds([]);
    } catch (error) {
      toast.error("Erro ao apagar algumas despesas.");
    }
  };

  const executeEditSetup = (exp: any) => {
    setNewExpense({
      title: exp.title || '',
      amount: exp.amount || 0,
      category: exp.category || 'Operational',
      date: exp.date || new Date().toISOString().split('T')[0],
      supplierId: exp.supplierId || '',
      paymentStatus: exp.paymentStatus || 'Paid',
      amountPaid: exp.amountPaid || 0,
      dueDate: exp.dueDate || ''
    });
    setEditingExpenseId(exp.id);
    setIsEditing(true);
    setIsCreating(true); // Open the panel
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditingExpenseId(null);
    setNewExpense({
      title: '',
      amount: 0,
      category: categories[0] || 'Operational',
      date: new Date().toISOString().split('T')[0],
      supplierId: '',
      paymentStatus: 'Paid',
      amountPaid: 0,
      dueDate: ''
    });
    setIsCreating(false);
  };

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    requestAuthorization('bulk_delete', null);
  };

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

  // 1. Category Distribution Dataset
  const categoryChartData = categories.map((cat, index) => {
    const total = expenses.filter(e => e.category === cat).reduce((sum, e) => sum + e.amount, 0);
    return {
      name: cat,
      value: total,
      color: COLORS[index % COLORS.length]
    };
  }).filter(item => item.value > 0);

  // 2. Monthly Spending Trends Dataset
  const monthlyDataMap: { [key: string]: number } = {};
  expenses.forEach(exp => {
    if (!exp.date) return;
    const parts = exp.date.split('-');
    if (parts.length >= 2) {
      const year = parts[0];
      const monthStr = parts[1];
      const key = `${year}-${monthStr}`; // YYYY-MM
      monthlyDataMap[key] = (monthlyDataMap[key] || 0) + exp.amount;
    }
  });

  const sortedMonthKeys = Object.keys(monthlyDataMap).sort();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  const monthlyTrendData = sortedMonthKeys.map(key => {
    const parts = key.split('-');
    const year = parts[0];
    const monthIndex = parseInt(parts[1], 10);
    const label = `${monthNames[monthIndex - 1]} '${year.substring(2)}`;
    return {
      monthKey: key,
      month: label,
      amount: monthlyDataMap[key]
    };
  });

  const sortedExpenses = [...expenses].sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedExpenses = sortedExpenses.slice(startIndex, endIndex);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900">{t('expenses')}</h2>
          <p className="text-slate-500 font-medium">Track company spending across categories.</p>
        </div>
        <div className="flex gap-2">
          {selectedIds.length > 0 && (
            <button 
              onClick={handleBulkDelete}
              className="flex items-center gap-2 bg-rose-50 text-rose-600 px-4 py-2 rounded-2xl border border-rose-100 hover:bg-rose-100 transition-all font-black text-[10px] uppercase tracking-widest animate-in slide-in-from-right-4"
            >
              <Trash2 size={14} />
              Delete ({selectedIds.length})
            </button>
          )}
          <button 
            onClick={() => setIsManagingCategories(true)}
            className="p-3 bg-white border border-slate-200 text-slate-600 rounded-2xl hover:text-slate-900 transition-all flex items-center gap-2"
            title="Manage Categories"
          >
            <Settings size={20} />
          </button>
          <button 
            onClick={() => setIsCreating(true)}
            className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-black hover:bg-slate-800 transition-all flex items-center gap-2 shadow-xl shadow-slate-900/20"
          >
            <Plus size={20} />
            Log Expense
          </button>
        </div>
      </div>

      {/* Visual Analytics Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-4 duration-500">
        {/* Pie Chart Card */}
        <div id="expense-pie-chart-card" className="bg-white p-6 rounded-[28px] border border-slate-100 shadow-sm flex flex-col justify-between min-h-[340px]">
          <div>
            <h3 className="font-black text-slate-900 text-sm flex items-center gap-2">
              <PieChart size={16} className="text-blue-600" />
              Categorias de Despesas
            </h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Distribuição do orçamento</p>
          </div>
          {categoryChartData.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 py-10">
              <FolderMinus size={40} className="text-slate-100 mb-2" />
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Sem dados de despesas</span>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-6 flex-1 mt-4">
              <div className="w-full sm:w-[150px] h-[180px] shrink-0">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <ReChartsPieChart>
                    <Pie
                      data={categoryChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={65}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {categoryChartData.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: any) => [`${Number(value).toLocaleString()} ${currency}`, 'Despesa']}
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '11px', fontWeight: 'bold' }}
                    />
                  </ReChartsPieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 w-full overflow-y-auto max-h-[180px] pr-1 space-y-1.5 scrollbar-thin">
                {categoryChartData.map((item: any) => {
                  const perc = totalExpenses > 0 ? (item.value / totalExpenses) * 100 : 0;
                  return (
                    <div key={item.name} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                        <span className="font-extrabold text-slate-600 truncate uppercase text-[10px] tracking-tight">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-500 text-[10px]">{item.value.toLocaleString()} {currency}</span>
                        <span className="font-black text-blue-600 text-[10px] bg-blue-50 px-1.5 py-0.5 rounded">{perc.toFixed(0)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Bar Chart Card */}
        <div id="expense-bar-chart-card" className="bg-white p-6 rounded-[28px] border border-slate-100 shadow-sm flex flex-col justify-between min-h-[340px]">
          <div>
            <h3 className="font-black text-slate-900 text-sm flex items-center gap-2">
              <BarChart3 size={16} className="text-blue-600" />
              Evolução Mensal de Gastos
            </h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Histórico financeiro</p>
          </div>
          {monthlyTrendData.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 py-10">
              <FolderMinus size={40} className="text-slate-100 mb-2" />
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Sem histórico de despesas</span>
            </div>
          ) : (
            <div className="flex-1 h-[200px] mt-6">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={monthlyTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="month" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 'bold' }} 
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 'bold' }} 
                    tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toLocaleString()}k` : value}
                  />
                  <Tooltip 
                    formatter={(value: any) => [`${Number(value).toLocaleString()} ${currency}`, 'Despesas']}
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '11px', fontWeight: 'bold' }}
                    cursor={{ fill: '#f8fafc' }}
                  />
                  <Bar 
                    dataKey="amount" 
                    fill="#3b82f6" 
                    radius={[6, 6, 0, 0]} 
                    maxBarSize={32}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-6">
          {isCreating && (
            <div id="expense-form-container" className="bg-white p-8 rounded-[32px] border border-blue-100 shadow-2xl space-y-6 animate-in slide-in-from-top-4">
              <div className="flex justify-between items-center pb-2 border-b border-slate-50">
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 uppercase tracking-wider">
                  {isEditing ? "Editar Registo de Despesa" : "Registar Nova Despesa"}
                </h3>
                {isEditing && (
                  <span className="bg-amber-100 text-amber-800 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded">Modo de Edição</span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Expense Title</label>
                  <input 
                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 outline-none font-bold" 
                    placeholder="e.g. Monthly Staff Wages"
                    value={newExpense.title} 
                    onChange={e => setNewExpense({...newExpense, title: e.target.value})} 
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Amount ({currency})</label>
                  <input 
                    type="number" 
                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 outline-none font-bold" 
                    value={newExpense.amount} 
                    onChange={e => setNewExpense({...newExpense, amount: Number(e.target.value)})} 
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Category</label>
                  <select 
                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 outline-none font-bold cursor-pointer" 
                    value={newExpense.category} 
                    onChange={e => setNewExpense({...newExpense, category: e.target.value})}
                  >
                    {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Supplier / Fornecedor (Opcional)</label>
                  <select 
                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 outline-none font-bold cursor-pointer" 
                    value={newExpense.supplierId} 
                    onChange={e => setNewExpense({...newExpense, supplierId: e.target.value})}
                  >
                    <option value="">-- Sem Fornecedor --</option>
                    {suppliers.map(sup => <option key={sup.id} value={sup.id}>{sup.name}</option>)}
                  </select>
                </div>
                {newExpense.supplierId && (
                  <>
                    <div>
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Estado de Pagamento</label>
                      <select 
                        className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 outline-none font-bold cursor-pointer" 
                        value={newExpense.paymentStatus} 
                        onChange={e => setNewExpense({...newExpense, paymentStatus: e.target.value})}
                      >
                        <option value="Paid">Pago (Fully Paid)</option>
                        <option value="Partially Paid">Pago Parcial (Partially Paid)</option>
                        <option value="Unpaid">Não Pago (Unpaid)</option>
                      </select>
                    </div>

                    {newExpense.paymentStatus === 'Partially Paid' && (
                      <div>
                        <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Valor Pago Inicial ({currency})</label>
                        <input 
                          type="number" 
                          className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 outline-none font-bold" 
                          value={newExpense.amountPaid} 
                          onChange={e => setNewExpense({...newExpense, amountPaid: Number(e.target.value)})} 
                          placeholder="Ex: 500"
                        />
                      </div>
                    )}

                    {newExpense.paymentStatus !== 'Paid' && (
                      <div>
                        <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Data de Vencimento</label>
                        <input 
                          type="date" 
                          className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 outline-none font-bold" 
                          value={newExpense.dueDate} 
                          onChange={e => setNewExpense({...newExpense, dueDate: e.target.value})} 
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button 
                  onClick={isEditing ? handleCancelEdit : () => setIsCreating(false)} 
                  className="px-6 py-3 text-slate-500 font-black uppercase text-[10px] tracking-widest hover:text-slate-700"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleAddExpense} 
                  className="px-8 py-3 bg-blue-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-blue-500/30 active:scale-95 transition-all"
                >
                  {isEditing ? "Guardar Alterações" : "Add Expense"}
                </button>
              </div>
            </div>
          )}

          {isManagingCategories && (
            <div className="bg-slate-50 p-8 rounded-[32px] border border-slate-200 space-y-6 animate-in fade-in zoom-in-95 duration-200">
               <div className="flex justify-between items-center">
                 <h3 className="font-black text-slate-900 flex items-center gap-2">
                   <Tag className="text-blue-600" size={18} /> Manage Expense Categories
                 </h3>
                 <button onClick={() => setIsManagingCategories(false)} className="text-slate-400 hover:text-slate-900 font-bold text-xs uppercase">Done</button>
               </div>
               
               <div className="flex gap-2">
                 <input 
                   className="flex-1 p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-sm"
                   placeholder="New category name..."
                   value={newCategoryName}
                   onChange={e => setNewCategoryName(e.target.value)}
                 />
                 <button 
                   onClick={handleAddCategory}
                   className="px-4 py-3 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-colors"
                 >
                   Add
                 </button>
               </div>

               <div className="flex flex-wrap gap-2">
                 {categories.map(cat => (
                   <span key={cat} className="px-4 py-2 bg-white border border-slate-100 rounded-xl text-xs font-bold text-slate-600 flex items-center gap-2 shadow-sm uppercase tracking-tighter">
                     {cat}
                   </span>
                 ))}
               </div>
            </div>
          )}

          <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <tr>
                    <th className="p-6">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        checked={selectedIds.length === expenses.length && expenses.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedIds(expenses.map(exp => exp.id));
                          else setSelectedIds([]);
                        }}
                      />
                    </th>
                    <th className="p-6">Date</th>
                    <th className="p-6">Title / Supplier</th>
                    <th className="p-6">Category</th>
                    <th className="p-6">Payment Status</th>
                    <th className="p-6 text-right">Amount</th>
                    <th className="p-6 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {expenses.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-12 text-center text-slate-400 italic">No expenses recorded yet.</td>
                    </tr>
                  ) : (
                    paginatedExpenses.map(exp => (
                      <tr 
                        key={exp.id} 
                        className={cn(
                          "hover:bg-slate-50/50 transition-colors group",
                          selectedIds.includes(exp.id) && "bg-blue-50/30"
                        )}
                      >
                        <td className="p-6">
                          <input 
                            type="checkbox" 
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            checked={selectedIds.includes(exp.id)}
                            onChange={() => toggleSelect(exp.id)}
                          />
                        </td>
                        <td className="p-6 text-xs font-bold text-slate-400">
                          {exp.date}
                        </td>
                        <td className="p-6">
                           <p className="font-black text-slate-900">{exp.title}</p>
                           {exp.supplierId && (
                             <p className="text-[10px] text-blue-600 font-black mt-0.5 uppercase tracking-wide flex items-center gap-1">
                               <span className="inline-block w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                               Fornecedor: {exp.supplierName || 'Ligado'}
                             </p>
                           )}
                        </td>
                        <td className="p-6">
                          <span className="px-3 py-1 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-black uppercase tracking-widest">{exp.category}</span>
                        </td>
                        <td className="p-6">
                          {exp.supplierId ? (
                            exp.outstandingBalance <= 0 || exp.paymentStatus === 'Paid' ? (
                              <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-black uppercase tracking-wider">Pago</span>
                            ) : exp.paymentStatus === 'Partially Paid' ? (
                              <span className="px-2.5 py-1 bg-amber-50 text-amber-750 rounded-full text-[10px] font-black uppercase tracking-wider flex flex-col items-start w-fit">
                                <span>Parcial</span>
                                <span className="text-[9px] font-bold text-slate-400 normal-case">Falta: {exp.outstandingBalance?.toLocaleString()} {currency}</span>
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 bg-rose-50 text-rose-700 rounded-full text-[10px] font-black uppercase tracking-wider flex flex-col items-start w-fit">
                                <span>Não Pago</span>
                                <span className="text-[9px] font-bold text-rose-450 normal-case">Vence: {exp.dueDate || 'N/A'}</span>
                              </span>
                            )
                          ) : (
                            <span className="px-2 py-0.5 bg-slate-50 text-slate-400 rounded-lg text-[9px] font-bold uppercase tracking-widest">Gasto Direto</span>
                          )}
                        </td>
                        <td className="p-6 text-right font-black">
                          <div className="text-rose-500">-{exp.amount?.toLocaleString()} {currency}</div>
                          {exp.supplierId && exp.outstandingBalance > 0 && (
                            <div className="text-[9px] text-slate-400 font-extrabold mt-0.5">Pago: {exp.amountPaid?.toLocaleString()} {currency}</div>
                          )}
                        </td>
                        <td className="p-6 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => requestAuthorization('edit', exp)}
                              className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                              title="Editar Despesa"
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              onClick={() => requestAuthorization('delete', exp.id)}
                              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                              title="Apagar Despesa"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {expenses.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-slate-100 mt-4 select-none px-6 pb-6">
                <div className="text-xs font-semibold text-slate-500 font-sans">
                  Mostrando <span className="font-extrabold text-slate-900">{Math.min(expenses.length, startIndex + 1)}</span> a{" "}
                  <span className="font-extrabold text-slate-900">{Math.min(expenses.length, endIndex)}</span> de{" "}
                  <span className="font-extrabold text-[#111827]">{expenses.length}</span> despesas
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
                    {Array.from({ length: Math.min(5, Math.ceil(expenses.length / itemsPerPage)) }, (_, i) => {
                      const totalPages = Math.ceil(expenses.length / itemsPerPage);
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
                    disabled={currentPage === Math.ceil(expenses.length / itemsPerPage)}
                    onClick={() => setCurrentPage(prev => Math.min(Math.ceil(expenses.length / itemsPerPage), prev + 1))}
                    className="px-3 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed bg-white"
                  >
                    Próximo
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-8">
          <div className="bg-slate-900 p-10 rounded-[40px] text-white shadow-2xl shadow-slate-900/30 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:rotate-12 transition-transform">
              <CreditCard size={120} />
            </div>
            <div className="relative">
              <div className="flex items-center justify-between mb-8">
                <div className="w-14 h-14 bg-white/10 rounded-[24px] flex items-center justify-center backdrop-blur-md">
                  <PieChart size={28} className="text-blue-400" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-white/50">Monthly Summary</span>
              </div>
              <p className="text-4xl font-black italic tracking-tighter mb-2">{totalExpenses.toLocaleString()} <span className="text-sm font-bold text-blue-400 not-italic">{currency}</span></p>
              <p className="text-xs text-white/40 font-bold leading-relaxed">Total operational spending recorded for your business.</p>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-8">
            <h3 className="font-black text-slate-900 text-lg flex items-center gap-3">
              <Tag className="text-blue-600" /> Spending Breakdown
            </h3>
            <div className="space-y-6">
              {categories.map(cat => {
                const catTotal = expenses.filter(e => e.category === cat).reduce((sum, e) => sum + e.amount, 0);
                const perc = totalExpenses > 0 ? (catTotal / totalExpenses) * 100 : 0;
                if (catTotal === 0 && categories.length > 6) return null; // Hide empty cats if list is long
                
                return (
                  <div key={cat} className="space-y-2">
                    <div className="flex justify-between items-end">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{cat}</p>
                        <p className="text-sm font-black text-slate-900">{catTotal.toLocaleString()} {currency}</p>
                      </div>
                      <span className="text-xs font-black text-blue-600">{perc.toFixed(0)}%</span>
                    </div>
                    <div className="h-3 bg-slate-50 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-600 rounded-full transition-all duration-1000" 
                        style={{ width: `${perc}%` }} 
                      />
                    </div>
                  </div>
                );
              })}
              {totalExpenses === 0 && (
                <div className="p-8 border-2 border-dashed border-slate-100 rounded-3xl text-center">
                  <Info size={24} className="mx-auto text-slate-200 mb-2" />
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">No data to breakdown</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Central Security Manager PIN Modal */}
      <ManagerPINModal 
        isOpen={pinModalOpen}
        onClose={() => setPinModalOpen(false)}
        onSuccess={pinSuccessAction}
        actionName={pinActionName}
      />
    </div>
  );
}
