const fs = require('fs');
const path = 'src/components/POS.tsx';
let txt = fs.readFileSync(path, 'utf8');

// Replacement 1: Dinheiro Vivo (Cash)
const originalCash = '<label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 font-sans">💸 Dinheiro Vivo (Cash)</label>';
const replaceCash = '<div className="flex justify-between items-center mb-1"><label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest font-sans">💸 Dinheiro Vivo (Cash)</label>{(() => { const rem = getUnallocatedSplitRemainder(); return rem > 0.05 ? (<button type="button" onClick={() => { const cur = Number(splitCash) || 0; setSplitCash((cur + rem).toFixed(2)); }} className="text-[9px] font-black text-blue-600 hover:text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded cursor-pointer transition-all font-sans shrink-0 leading-none" title="Preencher com o restante">+ {rem.toFixed(2)} MT</button>) : null; })()}</div>';
txt = txt.replace(originalCash, replaceCash);

// Replacement 2: Carteira M-Pesa
const originalMpesa = '<label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 font-sans">📱 Carteira M-Pesa</label>';
const replaceMpesa = '<div className="flex justify-between items-center mb-1"><label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest font-sans">📱 Carteira M-Pesa</label>{(() => { const rem = getUnallocatedSplitRemainder(); return rem > 0.05 ? (<button type="button" onClick={() => { const cur = Number(splitMpesa) || 0; setSplitMpesa((cur + rem).toFixed(2)); }} className="text-[9px] font-black text-blue-600 hover:text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded cursor-pointer transition-all font-sans shrink-0 leading-none" title="Preencher com o restante">+ {rem.toFixed(2)} MT</button>) : null; })()}</div>';
txt = txt.replace(originalMpesa, replaceMpesa);

// Replacement 3: Carteira e-Mola
const originalEmola = '<label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 font-sans">⚡ Carteira e-Mola</label>';
const replaceEmola = '<div className="flex justify-between items-center mb-1"><label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest font-sans">⚡ Carteira e-Mola</label>{(() => { const rem = getUnallocatedSplitRemainder(); return rem > 0.05 ? (<button type="button" onClick={() => { const cur = Number(splitEmola) || 0; setSplitEmola((cur + rem).toFixed(2)); }} className="text-[9px] font-black text-blue-600 hover:text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded cursor-pointer transition-all font-sans shrink-0 leading-none" title="Preencher com o restante">+ {rem.toFixed(2)} MT</button>) : null; })()}</div>';
txt = txt.replace(originalEmola, replaceEmola);

// Replacement 4: Cartão POS / POS-Card
const originalPOS = '<label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 font-sans">💳 Cartão POS / POS-Card</label>';
const replacePOS = '<div className="flex justify-between items-center mb-1"><label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest font-sans">💳 Cartão POS / POS-Card</label>{(() => { const rem = getUnallocatedSplitRemainder(); return rem > 0.05 ? (<button type="button" onClick={() => { const cur = Number(splitCard) || 0; setSplitCard((cur + rem).toFixed(2)); }} className="text-[9px] font-black text-blue-600 hover:text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded cursor-pointer transition-all font-sans shrink-0 leading-none" title="Preencher com o restante">+ {rem.toFixed(2)} MT</button>) : null; })()}</div>';
txt = txt.replace(originalPOS, replacePOS);

// Replacement 5: Banco (Transferência)
const originalBank = '<label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 font-sans">🏦 Banco (Transferência)</label>';
const replaceBank = '<div className="flex justify-between items-center mb-1"><label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest font-sans">🏦 Banco (Transferência)</label>{(() => { const rem = getUnallocatedSplitRemainder(); return rem > 0.05 ? (<button type="button" onClick={() => { const cur = Number(splitBank) || 0; setSplitBank((cur + rem).toFixed(2)); }} className="text-[9px] font-black text-blue-600 hover:text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded cursor-pointer transition-all font-sans shrink-0 leading-none" title="Preencher com o restante">+ {rem.toFixed(2)} MT</button>) : null; })()}</div>';
txt = txt.replace(originalBank, replaceBank);

// Replacement 6: Crédito / Conta Cliente flex block child
const originalCreditChild = '{!selectedCustomerId && <span className="text-[8px] text-rose-500 font-bold leading-none animate-pulse">Requer Cliente</span>}';
const replaceCreditChild = '{!selectedCustomerId ? <span className="text-[8px] text-rose-500 font-bold leading-none animate-pulse">Requer Cliente</span> : (() => { const rem = getUnallocatedSplitRemainder(); return rem > 0.05 ? (<button type="button" onClick={() => { const cur = Number(splitCredit) || 0; setSplitCredit((cur + rem).toFixed(2)); }} className="text-[9px] font-black text-blue-600 hover:text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded cursor-pointer transition-all font-sans shrink-0 leading-none" title="Preencher com o restante">+ {rem.toFixed(2)} MT</button>) : null; })()}';
txt = txt.replace(originalCreditChild, replaceCreditChild);

fs.writeFileSync(path, txt, 'utf8');
console.log('REPLACEMENT COMPLETED');
