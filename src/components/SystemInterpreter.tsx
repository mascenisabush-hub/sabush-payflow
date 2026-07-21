import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { Languages, Sparkles, Globe, X, ChevronUp, BookOpen, Cpu, HelpCircle, RefreshCw, Play, Volume2, Check, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';

// Full UI ERP Dictionary for English and Swahili (Mozambique / Kenya context)
// Product names, SKUs, and category names are not in this dictionary, keeping them native.
const ERP_DICTIONARY: Record<string, Record<string, string>> = {
  en: {
    // Menu & Main Labels
    "Painel": "Dashboard",
    "Faturas": "Invoices",
    "Inventário": "Inventory",
    "Clientes": "Clients",
    "Despesas": "Expenses",
    "Configurações": "Settings",
    "Sair": "Logout",
    "Sistema POS": "POS System",
    "Cotações": "Quotations",
    "Rastreador de Crédito": "Credit Tracker",
    "Gestão de Equipa": "Team Management",
    "Estado do Inventário": "Inventory Status",
    "Vendas por Grosso": "Wholesale Sales",
    "Vendas a Retalho": "Retail Sales",
    "Dívida Total": "Total Debt",
    "Despesas Mensais": "Monthly Expenses",
    "Equipa": "Team",
    "Subscrição": "Subscription",
    "Fornecedores": "Suppliers",
    "Ordens de Compra": "Purchase Orders",
    "Filtros de Faturação": "Invoicing Filters",
    "Canais de Venda": "Sales Channels",
    "Mix de Vendas": "Sales Mix",
    "Grosso vs Retalho": "Wholesale vs Retail",
    "Distribuição por Categoria": "Category Distribution",
    "Avisos Críticos": "Critical Alerts",
    "Lista Detalhada de Artigos Correspondentes": "Detailed List of Matching Items",
    "Gestão de Dívidas": "Debt Management",
    "Dinheiro": "Cash",
    "Crédito": "Credit",
    "Pago": "Paid",
    "Não Pago": "Unpaid",
    "Parcialmente Pago": "Partially Paid",
    "Em Atraso": "Overdue",
    "Histórico de Pagamentos": "Payment History",
    "Lembretes": "Reminders",
    "Enviar Lembrete": "Send Reminder",
    "Registar Pagamento": "Record Payment",
    "Valor Pago": "Amount Paid",
    "Saldo Remanescente": "Remaining Balance",
    "Data de Vencimento": "Due Date",
    "Vendas de hoje": "Today's Sales",
    "Novos Artigos": "New Items",
    "Registrar Venda": "Record Sale",
    "Deduplicar": "Deduplicate",
    "Análise de Duplicados": "Duplicate Analysis",
    "Verificar": "Verify",
    "Confirmar": "Confirm",
    "Cancelar": "Cancel",
    "Salvar": "Save",
    "Gravar": "Save",
    "Editar": "Edit",
    "Remover": "Remove",
    "Voltar": "Back",
    "Filtrar por": "Filter by",
    "Todos": "All",
    "Limpar": "Clear",
    "Visualizar": "View",
    "Detalhes": "Details",
    "Histórico": "History",
    "Pesquisar": "Search",
    "Sucesso": "Success",
    "Erro": "Error",
    "Aviso": "Warning",
    "Informação": "Information",
    "Atualizar": "Update",
    "Subscrição Ativa": "Active Subscription",
    "Definições": "Settings",
    "Perfil de Utilizador": "User Profile",
    "Gestão de Clientes": "Client Management",
    "Gestão de Fornecedores": "Supplier Management",
    "Gestão de Despesas": "Expense Management",
    "Faturação do Mês": "This Month Invoicing",
    "Relatórios": "Reports",
    "Estatísticas": "Statistics",
    "Assistente de Apoio": "Support Assistant",
    "Pergunte ao Assistente": "Ask Assistant",
    "Dúvidas ou Erros": "Questions or Errors",
    "Nome do Artigo": "Article Name",
    "Quantidade": "Quantity",
    "Preço Unitário": "Unit Price",
    "Impostos": "Taxes",
    "Desconto": "Discount",
    "Criar Documento": "Create Document",
    "Pesquisar Faturas": "Search Invoices",
    "Data de Emissão": "Issue Date",
    "Total Faturado": "Total Invoiced",
    "Série de Faturação": "Invoicing Series",
    "Documento Provisório": "Provisional Document",
    "Finalizar Compra": "Complete Purchase",
    "Limpar Tudo": "Clear All",
    "Preço de Referência": "Reference Price",
    "Em Stock": "In Stock",
    "Sem Stock": "Out of Stock",
    "Código de Barras": "Barcode",
    "Tipo de Venda": "Sale Type",
    "Retalho (Unidades)": "Retail (Units)",
    "Grosso (Caixas/Packs)": "Wholesale (Boxes/Packs)",
    "Adicionar ao Carrinho": "Add to Cart",
    "Carrinho de Compras": "Shopping Cart",
    "Nenhum artigo selecionado": "No article selected",
    "Desconto Geral": "General Discount",
    "Finalizar Venda": "Complete Sale",
    "Total a Pagar": "Total to Pay",
    "Troco": "Change",
    "Valor Entregue": "Amount Delivered",
    "Imprimir Talão": "Print Receipt",
    "Nova Venda": "New Sale",
    "Visualizar Fatura": "View Invoice",
    "Descarregar": "Download",
    "Pesquisar por Código de Barras": "Search by Barcode",
    "Fatura Simplificada": "Simplified Invoice",
    "Fatura Recibo": "Invoice Receipt",
    "Guia de Remessa": "Delivery Note",
    "Guia de Transporte": "Transport Note",
    "Número de Fatura": "Invoice Number",
    "Data de Registo": "Registration Date",
    "Weekly Telemetry": "Weekly Telemetry",
    "Growth Analytics": "Growth Analytics",
    "Live Ledger Log": "Live Ledger Log",
    "View Ledger": "View Ledger",
    "Walk-in Sale": "Walk-in Sale",
    "Separado / Detail": "Individual / Detail",
    "Separado / Wholesale": "Bulk / Wholesale",
    "Controle o movimento financeiro entrado por vendas por grosso (volumes/caixas) de forma autónoma.": "Control the financial movement entered through bulk wholesale sales natively and smoothly.",
    "Controle o movimento financeiro entrado por vendas por grosso (volumes/caixas) e retalho (detalhe) de forma autónoma.": "Control the financial movement entered through bulk wholesale and retail sales smoothly.",
    "Rastreador de Crédito & Finanças": "Credit & Finance Tracker",
    "Estado Geral de Contas": "General Account Status",
    "Dívidas de Clientes": "Customer Debts",
    "Controlo de Crédito": "Credit Control",
    "Limites e Alertas": "Limits & Alerts",
    "Lista de Transações": "Transactions List",
    "Nova Transação": "New Transaction",
    "Relatar Erro / Feedback": "Report Bug / Feedback",
    "Exportar": "Export",
    "Filtros": "Filters",
    "Limpar Filtros": "Clear Filters",
    "Valor": "Value / Amount",
    "Descrição": "Description",
    "Categoria": "Category",
    "Estado": "Status",
    "Ações": "Actions",
    "Análise de Desempenho": "Performance Analysis",
    "Manual de Apoio": "Support Manual",
    "Documentação": "Documentation"
  },
  sw: {
    // Swahili Translations
    "Painel": "Dashibodi",
    "Faturas": "Invoisi",
    "Inventário": "Hesabu",
    "Clientes": "Wateja",
    "Despesas": "Gharama",
    "Configurações": "Mipangilio",
    "Sair": "Ondoka",
    "Sistema POS": "Mfumo wa POS",
    "Cotações": "Nukuu za Bei",
    "Rastreador de Crédito": "Kifuatiliaji cha Mikopo",
    "Gestão de Equipa": "Usimamizi wa Timu",
    "Estado do Inventário": "Hali ya Hesabu",
    "Vendas por Grosso": "Mauzo ya Jumla",
    "Vendas a Retalho": "Mauzo ya Rejareja",
    "Dívida Total": "Jumla ya Deni",
    "Despesas Mensais": "Gharama za Kila Mwezi",
    "Equipa": "Timu",
    "Subscrição": "Usajili",
    "Fornecedores": "Wasambazaji",
    "Ordens de Compra": "Agizo la Ununuzi",
    "Filtros de Faturação": "Vichujio vya Ankara",
    "Canais de Venda": "Njia za Mauzo",
    "Mix de Vendas": "Mchanganyiko wa Mauzo",
    "Grosso vs Retalho": "Jumla dhidi ya Rejareja",
    "Distribuição por Categoria": "Usambazaji kwa Jamii",
    "Avisos Críticos": "Arifa Muhimu",
    "Lista Detalhada de Artigos Correspondentes": "Orodha ya Kina ya Bidhaa Zinazolingana",
    "Gestão de Dívidas": "Usimamizi wa Madeni",
    "Dinheiro": "Pesa Taslimu",
    "Crédito": "Mkopo",
    "Pago": "Imelipwa",
    "Não Pago": "Haijalipwa",
    "Parcialmente Pago": "Imelipwa Kidogo",
    "Em Atraso": "Imepitwa na Wakati",
    "Histórico de Pagamentos": "Historia ya Malipo",
    "Lembretes": "Vikumbusho",
    "Enviar Lembrete": "Tuma Kikumbusho",
    "Registar Pagamento": "Rekodi Malipo",
    "Valor Pago": "Kiasi Kilicholipwa",
    "Saldo Remanescente": "Salio Lililosalia",
    "Data de Vencimento": "Tarehe ya Mwisho",
    "Vendas de hoje": "Mauzo ya Leo",
    "Novos Artigos": "Bidhaa Mpya",
    "Registrar Venda": "Rekodi Mauzo",
    "Deduplicar": "Ondoa nakala",
    "Análise de Duplicados": "Uchambuzi wa Nakala",
    "Verificar": "Thibitisha",
    "Confirmar": "Thibitisha",
    "Cancelar": "Ghairi",
    "Salvar": "Hifadhi",
    "Gravar": "Hifadhi",
    "Editar": "Hariri",
    "Remover": "Ondoa",
    "Voltar": "Nyuma",
    "Filtrar por": "Chuja kwa",
    "Todos": "Zote",
    "Limpar": "Futa",
    "Visualizar": "Angalia",
    "Detalhes": "Maelezo",
    "Histórico": "Historia",
    "Pesquisar": "Tafuta",
    "Sucesso": "Mafanikio",
    "Erro": "Hitilafu",
    "Aviso": "Onyo",
    "Informação": "Taarifa",
    "Atualizar": "Sasisha",
    "Subscrição Ativa": "Usajili Ambao Umewashwa",
    "Definições": "Mipangilio",
    "Perfil de Utilizador": "Profaili ya Mtumiaji",
    "Gestão de Clientes": "Usimamizi wa Wateja",
    "Gestão de Fornecedores": "Usimamizi wa Wasambazaji",
    "Gestão de Despesas": "Usimamizi wa Gharama",
    "Faturação do Mês": "Ankara ya Mwezi Huu",
    "Relatórios": "Ripoti",
    "Estatísticas": "Takwimu",
    "Assistente de Apoio": "Msaidizi wa Msaada",
    "Pergunte ao Assistente": "Uliza Msaidizi",
    "Dúvidas ou Erros": "Maswali au Hitilafu",
    "Nome do Artigo": "Jina la Bidhaa",
    "Quantidade": "Kiasi",
    "Preço Unitário": "Bei ya Kitengo",
    "Impostos": "Kodi",
    "Desconto": "Punguzo",
    "Criar Documento": "Unda Ankara",
    "Pesquisar Faturas": "Tafuta Ankara",
    "Data de Emissão": "Tarehe ya Kutolewa",
    "Total Faturado": "Jumla ya Ankara",
    "Série de Faturação": "Mfululizo wa Ankara",
    "Documento Provisório": "Hati ya Mpito",
    "Finalizar Compra": "Kamilisha Ununuzi",
    "Limpar Tudo": "Futa Zote",
    "Preço de Referência": "Bei ya Marejeleo",
    "Em Stock": "Ipo Kwenye Hesabu",
    "Sem Stock": "Haikopo Kwenye Hesabu",
    "Código de Barras": "Msimbo wa Picha",
    "Tipo de Venda": "Aina ya Mauzo",
    "Retalho (Unidades)": "Rejareja (Vitengo)",
    "Grosso (Caixas/Packs)": "Jumla (Maboksi/Vifurushi)",
    "Adicionar ao Carrinho": "Ongeza Kwenye Kikapu",
    "Carrinho de Compras": "Shopping Cart",
    "Nenhum artigo selecionado": "Hakuna bidhaa iliyochaguliwa",
    "Desconto Geral": "Punguzo la Jumla",
    "Finalizar Venda": "Kamilisha Mauzo",
    "Total a Pagar": "Jumla ya Kulipa",
    "Troco": "Chenji",
    "Valor Entregue": "Kiasi Kilichotolewa",
    "Imprimir Talão": "Chapa Risiti",
    "Nova Venda": "Mauzo Mapya",
    "Visualizar Fatura": "Angalia Ankara",
    "Descarregar": "Pakua",
    "Pesquisar por Código de Barras": "Tafuta kwa Msimbo wa Picha",
    "Fatura Simplificada": "Ankara Rahisi",
    "Fatura Recibo": "Risiti ya Ankara",
    "Guia de Remessa": "Hati ya Bidhaa",
    "Guia de Transporte": "Hati ya Usafiri",
    "Número de Fatura": "Nambari ya Ankara",
    "Data de Registo": "Tarehe ya Usajili",
    "Weekly Telemetry": "Vipimo vya Wiki",
    "Growth Analytics": "Uchambuzi wa Ukuaji",
    "Live Ledger Log": "Kumbukumbu ya Moja kwa Moja",
    "View Ledger": "Angalia Daftari",
    "Walk-in Sale": "Mauzo ya Wateja wa Nje",
    "Separado / Detail": "Pekee / Rejareja",
    "Separado / Wholesale": "Wingi / Jumla",
    "Controle o movimento financeiro entrado por vendas por grosso (volumes/caixas) de forma autónoma.": "Dhibiti harakati za kifedha zinazoingia kupitia mauzo ya jumla kwa urahisi.",
    "Controle o movimento financeiro entrado por vendas por grosso (volumes/caixas) e retalho (detalhe) de forma autónoma.": "Dhibiti harakati za kifedha zinazoingia kupitia mauzo ya jumla na ya rejareja kwa urahisi.",
    "Rastreador de Crédito & Finanças": "Kifuatiliaji cha Mikopo na Fedha",
    "Estado Geral de Contas": "Hali ya Jumla ya Akaunti",
    "Dívidas de Clientes": "Madeni ya Wateja",
    "Controlo de Crédito": "Udhibiti wa Mikopo",
    "Limites e Alertas": "Makaa na Arifa",
    "Lista de Transações": "Orodha ya Miamala",
    "Nova Transação": "Muamala Mpya",
    "Relatar Erro / Feedback": "Ripoti Hitilafu",
    "Exportar": "Pakua Data",
    "Filtros": "Vichujio",
    "Limpar Filtros": "Futa Vichujio",
    "Valor": "Kiasi cha Fedha",
    "Descrição": "Maelezo",
    "Categoria": "Jamii",
    "Estado": "Hali",
    "Ações": "Vitendo",
    "Análise de Desempenho": "Uchambuzi wa Utendaji",
    "Manual de Apoio": "Mwongozo wa Msaada",
    "Documentação": "Mwongozo"
  }
};

interface AIInterpretation {
  screenTitle: string;
  explanation: string;
  vocabulary: Array<{
    original: string;
    translated: string;
    description: string;
  }>;
  steps: string[];
}

export default function SystemInterpreter() {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [silentTranslate, setSilentTranslate] = useState(true);
  
  // AI State
  const [aiLoading, setAiLoading] = useState(false);
  const [aiGuide, setAiGuide] = useState<AIInterpretation | null>(null);

  const activeLang = i18n.language || 'pt';

  // Extract visible texts on the active screen to pass as AI context
  const getScreenTextContext = (): string[] => {
    try {
      const mainEl = document.querySelector('main');
      if (!mainEl) return [];
      const texts: string[] = [];
      const walker = document.createTreeWalker(mainEl, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const parent = node.parentElement;
        if (parent && parent.closest('[data-no-translate], .no-translate')) {
          continue; // skip products and custom non-translatable items
        }
        const txt = node.nodeValue?.trim();
        if (txt && txt.length > 2 && txt.length < 50 && isNaN(Number(txt))) {
          // Skip clear numbers, barcodes, or custom product identifiers
          if (!texts.includes(txt)) {
            texts.push(txt);
          }
        }
      }
      return texts.slice(0, 30); // limit to 30 terms to keep API requests efficient
    } catch {
      return [];
    }
  };

  // Run DOM-level static UI text translations
  useEffect(() => {
    if (!silentTranslate) {
      restoreDOM();
      return;
    }

    const runTranslation = () => {
      translateDOM(activeLang);
    };

    // Run initially
    runTranslation();

    // Observe changes in DOM to dynamically translate asynchronously loaded nodes
    const observer = new MutationObserver(() => {
      runTranslation();
    });

    const config = { childList: true, subtree: true };
    const mainEl = document.querySelector('main');
    if (mainEl) {
      observer.observe(mainEl, config);
    } else {
      observer.observe(document.body, config);
    }

    return () => {
      observer.disconnect();
      restoreDOM();
    };
  }, [activeLang, silentTranslate]);

  const translateDOM = (lang: string) => {
    if (lang === 'pt') {
      restoreDOM();
      return;
    }

    const mainElement = document.querySelector('main') || document.body;
    const dictionary = ERP_DICTIONARY[lang];
    if (!dictionary) return;

    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const parent = node.parentElement;
        if (parent && (
          parent.closest('[data-no-translate]') ||
          parent.closest('.no-translate')
        )) {
          return;
        }
        const text = node.nodeValue?.trim() || "";
        if (!text) return;

        // Exact lookup match
        if (dictionary[text]) {
          if ((node as any).__originalText === undefined) {
            (node as any).__originalText = node.nodeValue;
          }
          node.nodeValue = node.nodeValue!.replace(text, dictionary[text]);
        } else {
          // Check if it starts/ends with simple terms
          for (const [key, val] of Object.entries(dictionary)) {
            if (text === key) {
              if ((node as any).__originalText === undefined) {
                (node as any).__originalText = node.nodeValue;
              }
              node.nodeValue = val;
              break;
            }
          }
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;
        const tagName = element.tagName.toLowerCase();
        
        // Skip code, script, style, inputs, charts
        if (
          tagName === 'script' || 
          tagName === 'style' || 
          tagName === 'input' || 
          tagName === 'textarea' ||
          tagName === 'svg'
        ) {
          return;
        }

        // Avoid translating dynamic product catalog items and product list tables
        if (
          element.hasAttribute('data-no-translate') || 
          element.classList.contains('no-translate') ||
          element.closest('[data-no-translate]') ||
          element.closest('.no-translate')
        ) {
          return;
        }

        for (let child = node.firstChild; child; child = child.nextSibling) {
          walk(child);
        }
      }
    };

    walk(mainElement);
  };

  const restoreDOM = () => {
    const mainElement = document.querySelector('main') || document.body;
    const walkAndRestore = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        if ((node as any).__originalText !== undefined) {
          node.nodeValue = (node as any).__originalText;
        }
      } else {
        const element = node as Element;
        if (element.tagName && ['script', 'style', 'input', 'textarea', 'svg'].includes(element.tagName.toLowerCase())) {
          return;
        }
        for (let child = node.firstChild; child; child = child.nextSibling) {
          walkAndRestore(child);
        }
      }
    };
    walkAndRestore(mainElement);
  };

  // Get active screen ID based on current UI layout elements 
  const detectActiveScreenId = (): string => {
    const mainTitle = document.querySelector('h1, h2')?.textContent?.toLowerCase() || '';
    if (mainTitle.includes('painel') || mainTitle.includes('dashboard') || mainTitle.includes('analytics')) return 'dashboard';
    if (mainTitle.includes('fatura') || mainTitle.includes('invoice') || mainTitle.includes('recibo')) return 'invoices';
    if (mainTitle.includes('pos') || mainTitle.includes('venda') || mainTitle.includes('caixa')) return 'pos';
    if (mainTitle.includes('instituição') || mainTitle.includes('configur') || mainTitle.includes('settings')) return 'settings';
    if (mainTitle.includes('despes')) return 'expenses';
    if (mainTitle.includes('invent') || mainTitle.includes('stock') || mainTitle.includes('artigo')) return 'inventory';
    if (mainTitle.includes('cliente') || mainTitle.includes('customer')) return 'customers';
    if (mainTitle.includes('crédito') || mainTitle.includes('outstanding') || mainTitle.includes('dívida')) return 'credit_management';
    if (mainTitle.includes('fornece') || mainTitle.includes('supplier')) return 'suppliers';
    return 'general';
  };

  const handleFetchInterpreterGuide = async () => {
    setAiLoading(true);
    setAiGuide(null);
    try {
      const activeScreen = detectActiveScreenId();
      const detectedTexts = getScreenTextContext();

      const response = await fetch('/api/ai/interpret-screen', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          screenId: activeScreen,
          language: activeLang,
          screenTextContext: detectedTexts,
        }),
      });

      if (!response.ok) {
        throw new Error('Falha ao obter interpretação do servidor.');
      }

      const data = await response.json();
      setAiGuide(data);
    } catch (error: any) {
      console.error(error);
      toast.error(
        activeLang === 'pt' 
          ? 'Não foi possível carregar a interpretação inteligente neste momento.' 
          : 'Could not load smart interpretation guide. Try again later.'
      );
    } finally {
      setAiLoading(false);
    }
  };

  const handleLanguageChange = (code: string) => {
    i18n.changeLanguage(code);
    toast.success(
      code === 'pt' 
        ? 'Sistema redefinido para Português 🇲🇿' 
        : code === 'sw' 
          ? 'Mfumo umebadilishwa kuwa Kiswahili 🇰🇪'
          : 'System language set to English 🇺🇸'
    );
    // Clear AI guide on language toggle so it retrieves fresh translations if requested
    setAiGuide(null);
  };

  return (
    <>
      {/* Dynamic Floating Pill Widget */}
      <div 
        className="fixed bottom-6 right-6 z-55 flex items-center gap-2"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <AnimatePresence>
          {isHovered && !isOpen && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="bg-slate-900 border border-slate-800 text-white rounded-2xl px-4 py-2.5 shadow-2.5xl backdrop-blur-md flex items-center gap-3 text-xs font-black uppercase tracking-wider"
            >
              <div className="flex items-center gap-1.5"><Globe size={13} className="text-blue-400" /> Interpretation: {activeLang.toUpperCase()}</div>
              <span className="text-[10px] bg-slate-800 text-slate-400 py-0.5 px-2 rounded font-mono">OFFLINE / AI</span>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center text-white cursor-pointer shadow-2xl transition-all duration-300 relative border border-white/10 shrink-0",
            isOpen 
              ? "bg-slate-950 scale-95" 
              : "bg-blue-600 hover:bg-blue-700 hover:rotate-12 animate-bounce"
          )}
          style={{ animationDuration: '3s' }}
          id="sabush-system-interpreter-button"
          title="Smooth Interpretation & AI Guide"
        >
          {isOpen ? <X size={20} /> : <Languages size={20} />}
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border border-slate-950 flex items-center justify-center text-[7px] font-black">AI</span>
        </button>
      </div>

      {/* Slide-out Overlay HUD Panel */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex justify-end">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="absolute inset-0 bg-slate-950/40 backdrop-blur-xs"
            />

            {/* Sidebar Controller Drawer */}
            <motion.div 
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="relative w-full max-w-md h-full bg-slate-900 border-l border-slate-800 text-slate-200 flex flex-col shadow-3xl overflow-hidden"
            >
              {/* Stars animation effect */}
              <div className="absolute top-0 left-0 right-0 h-40 bg-linear-to-b from-blue-900/15 to-transparent pointer-events-none" />

              {/* Sidebar Header */}
              <div className="p-6 border-b border-slate-800 flex items-center justify-between relative z-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                    <Globe size={22} className="animate-spin-slow" />
                  </div>
                  <div>
                    <h2 className="text-md font-black tracking-tight text-white flex items-center gap-1.5">
                      Sabush Interpreter <Sparkles size={14} className="text-amber-400" />
                    </h2>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest font-mono">SYSTEM WIDE TRANSLATION</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Sidebar Body scrollable content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 relative z-10">
                {/* Mode Selector */}
                <div className="space-y-3">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block font-mono">1. Select Target Language / Idioma</span>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { code: 'pt', name: 'Português', flag: '🇲🇿' },
                      { code: 'en', name: 'English', flag: '🇺🇸' },
                      { code: 'sw', name: 'Swahili', flag: '🇰🇪' }
                    ].map((lang) => {
                      const isSelected = activeLang === lang.code;
                      return (
                        <button
                          key={lang.code}
                          onClick={() => handleLanguageChange(lang.code)}
                          className={cn(
                            "py-3 px-2 rounded-xl transition-all text-xs font-bold flex flex-col items-center justify-center gap-2.5 border cursor-pointer",
                            isSelected 
                              ? "bg-blue-600/15 text-blue-400 border-blue-500/60" 
                              : "bg-slate-950/40 text-slate-400 hover:bg-slate-800 border-slate-800/80 hover:text-white"
                          )}
                        >
                          <span className="text-xl leading-none">{lang.flag}</span>
                          <span>{lang.name}</span>
                          {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Sub-toggle: Dom Translate Engine */}
                <div className="p-4 rounded-2xl bg-slate-950/40 border border-slate-800/80 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-xs font-black text-white">Silent Screen Translation</span>
                    <p className="text-[10px] text-slate-400">Translates system static buttons & lists on-the-fly</p>
                  </div>
                  <button
                    onClick={() => {
                      setSilentTranslate(!silentTranslate);
                      toast.info(silentTranslate ? "Interface translation disabled." : "Interface translation enabled.");
                    }}
                    className={cn(
                      "w-12 h-6.5 rounded-full p-0.5 transition-colors cursor-pointer flex items-center",
                      silentTranslate ? "bg-blue-600 justify-end" : "bg-slate-700 justify-start"
                    )}
                  >
                    <span className="w-5.5 h-5.5 rounded-full bg-white shadow-sm" />
                  </button>
                </div>

                {/* Protected Notice */}
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/10 text-xs text-amber-200 flex items-start gap-3">
                  <HelpCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-extrabold uppercase tracking-wide block mb-0.5 text-[10px]">Note regarding physical goods</span>
                    Como solicitado, os nomes de artigos ("produtos") e as suas categorias originais do stock permanecem inalterados de forma a manter a integridade fiscal e comercial do inventário local.
                  </div>
                </div>

                {/* AI Interactive Interpreter Section */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block font-mono">2. Smart Screen Interpretation</span>
                    <span className="text-[9px] bg-blue-600/25 text-blue-400 py-0.5 px-2 rounded-full uppercase font-black font-mono">GEMINI AI</span>
                  </div>

                  <button
                    onClick={handleFetchInterpreterGuide}
                    disabled={aiLoading}
                    className="w-full py-3.5 px-4 rounded-xl bg-linear-to-r from-blue-600 to-blue-600 hover:from-blue-700 hover:to-blue-700 text-white font-black text-xs flex items-center justify-center gap-2.5 transition-all shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed uppercase"
                  >
                    {aiLoading ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" />
                        Analyzing active screen terminology...
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} className="text-amber-300 animate-pulse" />
                        Interpret Screen with AI
                      </>
                    )}
                  </button>

                  <AnimatePresence mode="wait">
                    {aiLoading && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="p-5 rounded-2xl bg-slate-950/20 border border-slate-800 flex flex-col items-center justify-center text-center py-10 gap-3"
                      >
                        <LoaderPattern />
                        <span className="text-xs text-slate-400 font-extrabold animate-pulse">Running live semantic interpretation context of {detectActiveScreenId().toUpperCase()} screen...</span>
                      </motion.div>
                    )}

                    {!aiLoading && aiGuide && (
                      <motion.div
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-4"
                      >
                        {/* Interactive UI card */}
                        <div className="p-5 rounded-2xl bg-[#0e1424] border border-blue-500/20 space-y-4 shadow-xl relative overflow-hidden">
                          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 blur-xl rounded-full" />
                          
                          <div>
                            <span className="text-[9px] font-black text-blue-400 uppercase tracking-wider block font-mono">Detected & Translated Title</span>
                            <h3 className="text-md font-black text-white mt-1">{aiGuide.screenTitle}</h3>
                          </div>

                          <div>
                            <span className="text-[9px] font-black text-blue-400 uppercase tracking-wider block font-mono">Context Explanation ({activeLang.toUpperCase()})</span>
                            <p className="text-xs text-slate-300 mt-1 leading-relaxed">{aiGuide.explanation}</p>
                          </div>

                          {/* Terminology glossary */}
                          {aiGuide.vocabulary && aiGuide.vocabulary.length > 0 && (
                            <div className="space-y-2">
                              <span className="text-[9px] font-black text-blue-400 uppercase tracking-wider block font-mono">ERP Key Concept Dictionary</span>
                              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                                {aiGuide.vocabulary.map((vocab, i) => (
                                  <div key={i} className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs">
                                    <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
                                      <span className="font-extrabold text-[#8FB0AC] line-through decoration-red-500/20">{vocab.original}</span>
                                      <span className="font-black text-blue-400 bg-blue-600/10 px-2 py-0.5 rounded flex items-center gap-1.5">
                                        <Volume2 size={10} /> {vocab.translated}
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-slate-400 font-bold leading-normal">{vocab.description}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Action steps */}
                          {aiGuide.steps && aiGuide.steps.length > 0 && (
                            <div className="space-y-2.5">
                              <span className="text-[9px] font-black text-blue-400 uppercase tracking-wider block font-mono">Practical Action Guided Steps</span>
                              <div className="space-y-1.5">
                                {aiGuide.steps.map((step, i) => (
                                  <div key={i} className="flex items-start gap-2.5 text-xs text-slate-300">
                                    <span className="w-5 h-5 rounded-md bg-blue-600/15 text-blue-400 font-black flex items-center justify-center shrink-0 mt-0.5 text-[10px] tracking-tight">{i + 1}</span>
                                    <p className="flex-1 mt-0.5 font-bold">{step}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Sidebar Footer */}
              <div className="p-4 bg-slate-950/60 border-t border-slate-800 text-center relative z-10 text-[10px] text-slate-500 font-bold">
                Sabush System UI Interpreter Module • Powered by Gemini AI
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

// Sparkle loader pattern for professional UX
function LoaderPattern() {
  return (
    <div className="flex justify-center items-center gap-3 py-4">
      <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping" />
      <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping" style={{ animationDelay: '0.2s' }} />
      <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping" style={{ animationDelay: '0.4s' }} />
    </div>
  );
}
