import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, FileText, Shield, Check, FileCheck, HelpCircle } from 'lucide-react';

interface TermsModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'terms' | 'privacy';
}

export const TermsModal: React.FC<TermsModalProps> = ({ isOpen, onClose, defaultTab = 'terms' }) => {
  const [activeTab, setActiveTab] = useState<'terms' | 'privacy'>(defaultTab);

  // Sync active tab with default if opened
  React.useEffect(() => {
    if (isOpen) {
      setActiveTab(defaultTab);
    }
  }, [isOpen, defaultTab]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-md"
          />

          {/* Modal content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', duration: 0.5 }}
            className="relative w-full max-w-4xl bg-white border border-slate-200 rounded-[32px] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col max-h-[85vh]"
          >
            {/* Header */}
            <div className="p-6 md:p-8 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                  {activeTab === 'terms' ? <FileText className="w-6 h-6" /> : <Shield className="w-6 h-6" />}
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900 uppercase tracking-wide">
                    {activeTab === 'terms' ? 'Termos e Condições de Serviço' : 'Política de Privacidade e Proteção'}
                  </h2>
                  <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">
                    Sabush System ERP Moçambique Lda • Atualizado em Junho 2026
                  </p>
                </div>
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={onClose}
                className="absolute top-6 right-6 w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-all cursor-pointer active:scale-90"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-slate-100 px-6 md:px-8 bg-slate-50/50">
              <button
                type="button"
                onClick={() => setActiveTab('terms')}
                className={`py-4 px-6 text-xs font-black uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === 'terms'
                    ? 'border-blue-600 text-blue-650 font-extrabold'
                    : 'border-transparent text-slate-400 hover:text-slate-650'
                }`}
              >
                <FileCheck className="w-4 h-4" />
                Termos de Serviço
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('privacy')}
                className={`py-4 px-6 text-xs font-black uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === 'privacy'
                    ? 'border-blue-600 text-blue-650 font-extrabold'
                    : 'border-transparent text-slate-400 hover:text-slate-650'
                }`}
              >
                <Shield className="w-4 h-4" />
                Política de Privacidade
              </button>
            </div>

            {/* Main scrollable body */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 text-slate-700 text-xs md:text-sm leading-relaxed font-sans">
              <div className="max-w-none prose prose-slate">
                {activeTab === 'terms' ? (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-sm md:text-base font-black text-slate-900 border-l-4 border-blue-600 pl-3 uppercase tracking-wider mb-2">
                        1. Aceitação dos Termos
                      </h3>
                      <p className="text-slate-600 font-semibold">
                        Ao efetuar registo, subscrever ou aceder ao ecossistema do <strong>Sabush System ERP</strong> (incluindo o painel administrativo, POS, faturação, inventário e portal de cliente), a sua entidade comercial e utilizadores autorizados concordam integralmente com as seguintes condições de uso estabelecidas pela Sabush System ERP Moçambique Lda.
                      </p>
                    </div>

                    <div>
                      <h3 className="text-sm md:text-base font-black text-slate-900 border-l-4 border-blue-600 pl-3 uppercase tracking-wider mb-2">
                        2. Licenciamento e Permissão de Uso Commercial
                      </h3>
                      <p className="text-slate-600 font-semibold">
                        A plataforma Sabush System ERP é licenciada em regime de subscrição (SaaS). O utilizador ou entidade usufrui de uma licença não-exclusiva, intransmissível e revogável sob termos de não-pagamento ou violação de integridade do código. É estritamente proibida qualquer tentativa de engenharia reversa, cracking, replicação ilegal de ecrãs de faturamento ou desvio do selo digital tributário.
                      </p>
                    </div>

                    <div>
                      <h3 className="text-sm md:text-base font-black text-slate-900 border-l-4 border-blue-600 pl-3 uppercase tracking-wider mb-2">
                        3. Conformidade Legal e Autoridade Tributária (AT) — AVISO IMPORTANTE
                      </h3>
                      <p className="text-slate-600 font-semibold mb-2">
                        <strong>AVISO LEGAL:</strong> O Sabush System ERP é uma ferramenta digital para gestão interna comercial e de inventário. Este sistema de software <span className="text-red-650 font-bold font-sans">NÃO é dotado de certificação oficial</span> por parte da Autoridade Tributária (AT) de Moçambique.
                      </p>
                      <ul className="list-disc pl-5 my-2 space-y-1 text-slate-600 font-medium">
                        <li><strong>Gestão Comercial Interna:</strong> Todos os documentos processados pelo ecossistema (Faturas, Cotações, Recibos) são estritamente para suporte da gestão comercial interna das PMEs. Eles não servem de substitutos aos documentos fiscais com chancela regulada pela AT.</li>
                        <li><strong>Limite de Faturação de 2.500.000 MZN:</strong> Em conformidade com o Regulamento do IVA de Moçambique (Lei nº 32/2007), os contribuintes registados com faturamento anual superior a 2.500.000 MZN são obrigados à emissão de faturas/recibos através de sistemas eletrónicos centralizados e credenciados/certificados pela Autoridade Tributária.</li>
                        <li><strong>Dever de Exigência:</strong> É obrigação fiscal de cada cliente ou utilizador registar e relatar as suas receitas e faturamento em conformidade com as diretivas fiscais moçambicanas, eximindo o Sabush ERP de qualquer responsabilidade tributária.</li>
                      </ul>
                    </div>

                    <div>
                      <h3 className="text-sm md:text-base font-black text-slate-900 border-l-4 border-blue-600 pl-3 uppercase tracking-wider mb-2">
                        4. Condições de Pagamento, Crédito e Fiado
                      </h3>
                      <p className="text-slate-600 font-semibold">
                        O Sabush System ERP permite a gestão de vendas a crédito ("Fiado"). O contratante assume toda a responsabilidade jurídica e financeira pelos créditos concedidos a clientes terceiros através do portal. O sistema é um intermediador tecnológico e não se responsabiliza pelo incumprimento de pagamento de facturas emitidas.
                      </p>
                    </div>

                    <div>
                      <h3 className="text-sm md:text-base font-black text-slate-900 border-l-4 border-blue-600 pl-3 uppercase tracking-wider mb-2">
                        5. Rescisão e Suspensão de Serviço
                      </h3>
                      <p className="text-slate-600 font-semibold">
                        A Sabush System ERP reserva-se o direito de suspender ou rescindir o acesso do utilizador em caso de:
                      </p>
                      <ul className="list-disc pl-5 mt-2 space-y-1 text-slate-600 font-medium">
                        <li>Falta de pagamento de mensalidades após 5 dias da respectiva data de vencimento;</li>
                        <li>Utilização do software para práticas comerciais de má fé ou fraude tributária comprovada;</li>
                        <li>Saturação criminosa ou tentativas de DDoS contra os nossos servidores cloud alojados no Cloud Run.</li>
                      </ul>
                    </div>

                    <div>
                      <h3 className="text-sm md:text-base font-black text-slate-900 border-l-4 border-blue-600 pl-3 uppercase tracking-wider mb-2">
                        6. Limitação de Responsabilidade
                      </h3>
                      <p className="text-slate-600 font-semibold">
                        O Sabush System ERP é fornecido "como está" e "conforme disponível". Embora façamos todos os esforços para garantir 99.9% de uptime e backups automáticos via Firestore persistente, não seremos passíveis de indemnizações em caso de quebras temporárias de comunicações, falhas em APIs de WhatsApp ou integridade de dados se resultantes de erro do utilizador.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-sm md:text-base font-black text-slate-900 border-l-4 border-blue-600 pl-3 uppercase tracking-wider mb-2">
                        1. Recolha de Informações de Clientes
                      </h3>
                      <p className="text-slate-600 font-semibold">
                        Nós recolhemos informações comerciais cruciais para a operação do ERP e do Portal de Cliente, tais como: nome da empresa, NUIT, endereço eletrónico, número de telemóvel para envios do WhatsApp e dados transacionais relativos a faturas, cotações e compras.
                      </p>
                    </div>

                    <div>
                      <h3 className="text-sm md:text-base font-black text-slate-900 border-l-4 border-blue-600 pl-3 uppercase tracking-wider mb-2">
                        2. Uso e Proteção de Dados Comerciais
                      </h3>
                      <p className="text-slate-600 font-semibold">
                        Os dados registados pelas empresas clientes são mantidos sob rígida segurança com regras estritas de segurança do Firebase Firestore. O acesso aos dados transacionais de um negócio é de posse exclusiva do respetivo proprietário e funcionários devidamente credenciados através de PIN ou correio eletrónico. O Sabush System ERP nunca venderá ou fornecerá bases de dados a operadores de publicidade terceiros.
                      </p>
                    </div>

                    <div>
                      <h3 className="text-sm md:text-base font-black text-slate-900 border-l-4 border-blue-600 pl-3 uppercase tracking-wider mb-2">
                        3. Notificações Automatizadas via WhatsApp e Correio Eletrónico
                      </h3>
                      <p className="text-slate-600 font-semibold">
                        Ao associar um número de telefone com código em Moçambique (+258) ou correio eletrónico ao registo de um cliente no portal, o sistema enviará avisos automáticos de faturas disponíveis, alterações de cotações recalibradas, avisos de recepção de créditos e links diretos para o portal eletrónico de auto-faturamento. O cliente pode requerer a desativação desses alertas contactando diretamente a empresa emissora.
                      </p>
                    </div>

                    <div>
                      <h3 className="text-sm md:text-base font-black text-slate-900 border-l-4 border-blue-600 pl-3 uppercase tracking-wider mb-2">
                        4. Cookies e Armazenamento Local
                      </h3>
                      <p className="text-slate-600 font-semibold">
                        Utilizamos o Armazenamento Local do Navegador (<em>localStorage</em>) e mecanismos internos de estado de sessão apenas para reter as credenciais ativas do utilizador do ERP, carrinhos de compras em modo offline para o POS e preferências linguísticas. Estes ficheiros são temporários e seguros.
                      </p>
                    </div>

                    <div>
                      <h3 className="text-sm md:text-base font-black text-slate-900 border-l-4 border-blue-600 pl-3 uppercase tracking-wider mb-2">
                        5. Segurança Física e de Infraestrutura
                      </h3>
                      <p className="text-slate-600 font-semibold">
                        Toda a infraestrutura Sabush ERP opera sob tecnologia de ponta do Google Cloud Run e bases de dados encriptadas Firestore, garantindo encriptação de ponta a ponta durante a transmissão de dados financeiros e proteção física monitorizada 24 horas por dia.
                      </p>
                    </div>

                    <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100 flex items-start gap-3">
                      <HelpCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-extrabold text-blue-900 uppercase tracking-wide">Precisa de Ajuda ou Suporte Legal?</p>
                        <p className="text-[11px] text-blue-700 leading-normal mt-1">
                          Se tiver quaisquer dúvidas adicionais sobre os nossos termos legais ou política de proteção de dados fiscais sob os regulamentos comerciais vigentes em Moçambique, contacte a nossa equipa de apoio: <strong>suporte@sabushsystem.co.mz</strong>.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-4">
              <span className="text-[10px] text-slate-400 font-black tracking-widest uppercase">
                Sabush System ERP © 2026
              </span>
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-wide rounded-xl transition-all cursor-pointer active:scale-95 flex items-center gap-2 shadow-sm"
              >
                <Check className="w-4 h-4" /> Entendido e Aceito
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
