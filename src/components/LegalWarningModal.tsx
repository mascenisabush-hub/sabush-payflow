import React, { useState } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface LegalWarningModalProps {
  isOpen: boolean;
  onClose?: () => void;
  readOnly?: boolean;
  businessId?: string;
  userId?: string;
  userName?: string;
}

export default function LegalWarningModal({
  isOpen,
  onClose,
  readOnly = false,
  businessId,
  userId,
  userName
}: LegalWarningModalProps) {
  const [isChecked, setIsChecked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (readOnly || !isChecked || !businessId || !userId) return;

    setIsSubmitting(true);
    try {
      const ackRef = doc(db, 'businesses', businessId, 'settings', 'legalAcknowledgement');
      await setDoc(ackRef, {
        acknowledged: true,
        acknowledgedAt: serverTimestamp(),
        acknowledgedBy: userId,
        acknowledgedByName: userName || 'Utilizador do Sistema'
      });

      toast.success("Aviso legal reconhecido e aceito!", { duration: 4000 });
      toast.success("Bem-vindo ao Sabush System ERP! O seu sistema está pronto a utilizar. 🎉", { duration: 6000 });
      
      if (onClose) {
        onClose();
      }
    } catch (error) {
      console.error("Error saving legal acknowledgement:", error);
      toast.error("Erro ao guardar o aviso legal. Por favor, tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-y-auto"
      style={{ background: 'rgba(15, 23, 42, 0.95)', backdropFilter: 'blur(12px)' }}
    >
      <div 
        className="w-full max-w-[560px] relative text-white animate-in zoom-in-95 duration-200"
        style={{ 
          background: 'rgba(15, 23, 42, 0.85)', 
          border: '1px solid rgba(99, 153, 34, 0.3)', 
          borderRadius: '16px', 
          padding: '32px' 
        }}
      >
        {/* Top — Sabush logo centered, height 56px */}
        <div className="flex justify-center mb-6">
          <img 
            src="/sabush-logo.svg" 
            alt="Sabush System ERP" 
            style={{ height: '56px', width: 'auto', objectFit: 'contain' }}
            referrerPolicy="no-referrer"
          />
        </div>

        {/* Title & Subtitle */}
        <div className="text-center">
          <h2 className="text-[18px] font-semibold tracking-wide uppercase" style={{ color: '#D4AF37' }}>
            ⚠️ AVISO LEGAL IMPORTANTE
          </h2>
          <p className="text-[12px] text-white/50 mt-1">
            Leia atentamente antes de utilizar o sistema
          </p>
        </div>

        {/* Divider line: 1px solid rgba(255,255,255,0.1) */}
        <div className="my-5" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)' }} />

        {/* Body text in Portuguese */}
        <div className="text-left text-[13px] leading-[1.7] text-white/80 space-y-4 font-sans">
          <p>
            O <strong>Sabush System ERP</strong> é uma ferramenta de gestão interna para pequenas e médias empresas.
          </p>
          
          <div>
            <h4 className="font-bold text-white mb-1 uppercase tracking-wide text-xs">CERTIFICAÇÃO FISCAL:</h4>
            <p>
              Este sistema <span className="font-semibold" style={{ color: '#E24B4A' }}>NÃO é certificado</span> pela Autoridade Tributária de Moçambique (AT). Os documentos gerados (faturas, recibos) <span className="font-semibold" style={{ color: '#E24B4A' }}>NÃO substituem</span> documentos fiscais oficiais.
            </p>
          </div>

          <div>
            <h4 className="font-bold text-white mb-1 uppercase tracking-wide text-xs font-sans">OBRIGAÇÃO LEGAL:</h4>
            <ul className="space-y-2 list-none pl-0">
              <li className="relative pl-5">
                <span className="absolute left-0">•</span>
                Empresas com volume de negócios ABAIXO de <span className="font-semibold" style={{ color: '#D4AF37' }}>2.500.000 MZN</span>/ano podem utilizar este sistema livremente para gestão interna.
              </li>
              <li className="relative pl-5">
                <span className="absolute left-0">•</span>
                Empresas com volume de negócios ACIMA de <span className="font-semibold" style={{ color: '#D4AF37' }}>2.500.000 MZN</span>/ano são legalmente obrigadas a utilizar software certificado pela AT para emissão de documentos fiscais oficiais.
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-white mb-1 uppercase tracking-wide text-xs">RESPONSABILIDADE:</h4>
            <p>
              O utilizador aceita total responsabilidade pelo cumprimento das suas obrigações fiscais perante a AT de Moçambique. O Sabush System ERP não se responsabiliza por quaisquer penalizações fiscais resultantes da utilização deste sistema como documento fiscal oficial.
            </p>
          </div>
        </div>

        {/* Divider line below body text */}
        <div className="my-5" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)' }} />

        {/* Checkbox (required before button activates) */}
        {!readOnly && (
          <div className="mt-6 flex items-start gap-3">
            <input
              id="legal-checkbox"
              type="checkbox"
              checked={isChecked}
              onChange={(e) => setIsChecked(e.target.checked)}
              className="mt-1 w-4 h-4 rounded border-slate-500 bg-slate-850 text-[#639922] focus:ring-[#639922] accent-[#639922] cursor-pointer"
            />
            <label htmlFor="legal-checkbox" className="text-[12px] leading-relaxed select-none cursor-pointer text-white/75">
              Li, compreendi e aceito as condições acima. Confirmo que sou responsável pelo cumprimento das obrigações fiscais da minha empresa.
            </label>
          </div>
        )}

        {/* Confirmation or Close Button */}
        {readOnly ? (
          <button
            type="button"
            onClick={onClose}
            className="w-full mt-6 py-3 px-4 rounded-lg font-medium text-[13px] bg-slate-700 hover:bg-slate-650 text-white transition-all cursor-pointer transition-colors"
          >
            Fechar
          </button>
        ) : (
          <button
            type="button"
            disabled={!isChecked || isSubmitting}
            onClick={handleConfirm}
            className="w-full mt-6 py-3 px-4 rounded-lg font-medium text-[13px] transition-all flex items-center justify-center gap-2"
            style={{
              background: isChecked ? '#3B6D11' : 'rgba(255,255,255,0.1)',
              color: isChecked ? '#fff' : 'rgba(255,255,255,0.3)',
              cursor: isChecked ? 'pointer' : 'not-allowed',
            }}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                A processar...
              </>
            ) : (
              "Confirmar e Continuar para o Sistema"
            )}
          </button>
        )}

        {/* Small subtext */}
        {!readOnly && (
          <p className="mt-4 text-[10px] text-white/30 text-center font-sans uppercase tracking-wide">
            Este aviso pode ser consultado novamente em Definições → Informação Legal
          </p>
        )}
      </div>
    </div>
  );
}
