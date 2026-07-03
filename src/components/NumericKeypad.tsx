import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, Delete, Check, RotateCcw } from 'lucide-react';

interface NumericKeypadProps {
  isOpen: boolean;
  onClose: () => void;
  initialValue: string;
  onConfirm: (value: number) => void;
  title: string;
  subtitle?: string;
  unit?: string;
  placeholder?: string;
}

export default function NumericKeypad({
  isOpen,
  onClose,
  initialValue,
  onConfirm,
  title,
  subtitle,
  unit = '',
  placeholder = '0'
}: NumericKeypadProps) {
  const [val, setVal] = useState<string>('');

  // Synchronize state when opened
  useEffect(() => {
    if (isOpen) {
      // If initialValue is just 0 or empty, display as empty to let user type easily
      if (initialValue === '0' || initialValue === '0.0' || initialValue === '') {
        setVal('');
      } else {
        setVal(initialValue);
      }
    }
  }, [isOpen, initialValue]);

  // Support physical keyboard bindings
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        handleDigit(e.key);
      } else if (e.key === '.' || e.key === ',') {
        handleDecimal();
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirm();
      } else if (e.key === 'Delete') {
        handleClear();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, val]);

  if (!isOpen) return null;

  const handleDigit = (digit: string) => {
    setVal((prev) => {
      // Avoid multiple leading zeros
      if (prev === '0' && digit === '0') return '0';
      if (prev === '0') return digit;
      
      // Limit to reasonable character length to prevent overflow
      if (prev.length >= 10) return prev;
      
      return prev + digit;
    });
  };

  const handleDecimal = () => {
    setVal((prev) => {
      if (prev.includes('.')) return prev;
      if (prev === '') return '0.';
      return prev + '.';
    });
  };

  const handleBackspace = () => {
    setVal((prev) => {
      if (prev.length <= 1) return '';
      return prev.slice(0, -1);
    });
  };

  const handleClear = () => {
    setVal('');
  };

  const handleConfirm = () => {
    const parsed = parseFloat(val);
    if (isNaN(parsed) || parsed < 0) {
      onConfirm(0);
    } else {
      onConfirm(parsed);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ type: 'spring', duration: 0.3 }}
        className="bg-white border border-slate-200 rounded-[32px] max-w-sm w-full p-6 shadow-2xl flex flex-col space-y-5 relative font-sans"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-100 rounded-xl transition-all cursor-pointer border-none bg-transparent"
        >
          <X size={20} />
        </button>

        {/* Header */}
        <div className="space-y-1 text-left">
          <span className="text-[9px] font-black uppercase tracking-widest text-[#B8791A] leading-none">Teclado Numérico</span>
          <h3 className="text-base font-black text-slate-900 leading-tight">{title}</h3>
          {subtitle && (
            <p className="text-[11px] text-slate-500 font-medium truncate">{subtitle}</p>
          )}
        </div>

        {/* Display screen */}
        <div className="relative">
          <div className="w-full text-right font-mono text-3xl font-black p-4 bg-slate-50 border border-slate-100 rounded-2xl text-slate-800 flex items-center justify-between min-h-[68px]">
            <span className="text-xs text-slate-400 font-sans font-bold uppercase select-none">
              {unit}
            </span>
            <span className="truncate">
              {val === '' ? (
                <span className="text-slate-300 font-sans">{placeholder}</span>
              ) : (
                val
              )}
            </span>
          </div>
          {val !== '' && (
            <button
              type="button"
              onClick={handleClear}
              title="Limpar"
              className="absolute left-14 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 p-1 rounded-md transition-colors border-none bg-transparent cursor-pointer"
            >
              <RotateCcw size={14} />
            </button>
          )}
        </div>

        {/* Keys Grid */}
        <div className="grid grid-cols-3 gap-2">
          {[7, 8, 9, 4, 5, 6, 1, 2, 3].map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => handleDigit(num.toString())}
              className="h-14 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200/40 text-slate-800 text-lg font-bold flex items-center justify-center cursor-pointer active:scale-95 active:bg-slate-200 transition-all select-none"
            >
              {num}
            </button>
          ))}

          {/* Special Keys Row */}
          <button
            type="button"
            onClick={handleDecimal}
            className="h-14 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200/40 text-slate-800 text-lg font-black flex items-center justify-center cursor-pointer active:scale-95 active:bg-slate-200 transition-all select-none"
          >
            .
          </button>
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="h-14 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200/40 text-slate-800 text-lg font-bold flex items-center justify-center cursor-pointer active:scale-95 active:bg-slate-200 transition-all select-none"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleBackspace}
            className="h-14 rounded-2xl bg-slate-100/70 hover:bg-rose-50 hover:text-rose-600 border border-transparent text-slate-500 flex items-center justify-center cursor-pointer active:scale-95 active:bg-rose-100 transition-all select-none"
            title="Retroceder"
          >
            <Delete size={20} />
          </button>
        </div>

        {/* Bottom Actions */}
        <div className="pt-3 border-t border-slate-100 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3.5 border border-slate-200 text-slate-600 rounded-2xl font-bold text-xs hover:bg-slate-50 transition-all cursor-pointer bg-transparent uppercase tracking-wider"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 py-3.5 bg-[#B8791A] text-white rounded-2xl font-black text-xs hover:bg-[#E8500A] transition-all cursor-pointer border-none flex items-center justify-center gap-1.5 uppercase tracking-wider shadow-md hover:shadow-lg"
          >
            Confirmar <Check size={14} className="stroke-[2.5]" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
