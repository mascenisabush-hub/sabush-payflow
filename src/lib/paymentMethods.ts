export interface PaymentMethodConfig {
  id: string;
  name: string;
  emoji: string;
  category: 'cash' | 'mobile_money' | 'bank' | 'credit';
}

export const getCountryPaymentMethods = (countryName: string): PaymentMethodConfig[] => {
  const c = (countryName || '').toLowerCase();
  
  if (c.includes('moçambique') || c.includes('mozambique') || c.includes('mz')) {
    return [
      { id: 'cash', name: 'Dinheiro', emoji: '💸', category: 'cash' },
      { id: 'mpesa', name: 'M-Pesa (Vodacom)', emoji: '📱', category: 'mobile_money' },
      { id: 'emola', name: 'e-Mola (Tmcel)', emoji: '⚡', category: 'mobile_money' },
      { id: 'mkesh', name: 'Mkesh (BCI)', emoji: '🏦', category: 'mobile_money' },
      { id: 'credit', name: 'Crédito', emoji: '🤝', category: 'credit' }
    ];
  }
  
  if (c.includes('quénia') || c.includes('kenya') || c.includes('ke')) {
    return [
      { id: 'cash', name: 'Cash', emoji: '💸', category: 'cash' },
      { id: 'mpesa', name: 'M-Pesa (Safaricom)', emoji: '📱', category: 'mobile_money' },
      { id: 'airtel', name: 'Airtel Money', emoji: '🔴', category: 'mobile_money' },
      { id: 'tkash', name: 'T-Kash', emoji: '⚡', category: 'mobile_money' },
      { id: 'credit', name: 'Credit', emoji: '🤝', category: 'credit' }
    ];
  }
  
  if (c.includes('tanzânia') || c.includes('tanzania') || c.includes('tz')) {
    return [
      { id: 'cash', name: 'Cash', emoji: '💸', category: 'cash' },
      { id: 'mpesa', name: 'M-Pesa', emoji: '📱', category: 'mobile_money' },
      { id: 'tigopesa', name: 'Tigo Pesa', emoji: '🔵', category: 'mobile_money' },
      { id: 'airtel', name: 'Airtel Money', emoji: '🔴', category: 'mobile_money' },
      { id: 'halopesa', name: 'Halopesa', emoji: '🍊', category: 'mobile_money' },
      { id: 'credit', name: 'Credit', emoji: '🤝', category: 'credit' }
    ];
  }
  
  if (c.includes('uganda') || c.includes('ug')) {
    return [
      { id: 'cash', name: 'Cash', emoji: '💸', category: 'cash' },
      { id: 'mtn_momo', name: 'MTN MoMo', emoji: '🟡', category: 'mobile_money' },
      { id: 'airtel', name: 'Airtel Money', emoji: '🔴', category: 'mobile_money' },
      { id: 'credit', name: 'Credit', emoji: '🤝', category: 'credit' }
    ];
  }
  
  if (c.includes('gana') || c.includes('ghana') || c.includes('gh')) {
    return [
      { id: 'cash', name: 'Cash', emoji: '💸', category: 'cash' },
      { id: 'mtn_momo', name: 'MTN MoMo', emoji: '🟡', category: 'mobile_money' },
      { id: 'vodafone_cash', name: 'Vodafone Cash', emoji: '🔴', category: 'mobile_money' },
      { id: 'airteltigo', name: 'AirtelTigo Money', emoji: '🔵', category: 'mobile_money' },
      { id: 'credit', name: 'Credit', emoji: '🤝', category: 'credit' }
    ];
  }
  
  if (c.includes('nigéria') || c.includes('nigeria') || c.includes('ng')) {
    return [
      { id: 'cash', name: 'Cash', emoji: '💸', category: 'cash' },
      { id: 'opay', name: 'OPay', emoji: '🟢', category: 'mobile_money' },
      { id: 'palmpay', name: 'PalmPay', emoji: '🌴', category: 'mobile_money' },
      { id: 'kuda', name: 'Kuda', emoji: '💜', category: 'mobile_money' },
      { id: 'mtn_momo', name: 'MTN MoMo', emoji: '🟡', category: 'mobile_money' },
      { id: 'credit', name: 'Credit', emoji: '🤝', category: 'credit' }
    ];
  }
  
  if (c.includes('senegal') || c.includes('sn')) {
    return [
      { id: 'cash', name: 'Cash', emoji: '💸', category: 'cash' },
      { id: 'orange_money', name: 'Orange Money', emoji: '🍊', category: 'mobile_money' },
      { id: 'wave', name: 'Wave', emoji: '🌊', category: 'mobile_money' },
      { id: 'mtn_momo', name: 'MTN MoMo', emoji: '🟡', category: 'mobile_money' },
      { id: 'credit', name: 'Credit', emoji: '🤝', category: 'credit' }
    ];
  }
  
  if (c.includes('áfrica do sul') || c.includes('south africa') || c.includes('za')) {
    return [
      { id: 'cash', name: 'Cash', emoji: '💸', category: 'cash' },
      { id: 'snapscan', name: 'SnapScan', emoji: '📸', category: 'mobile_money' },
      { id: 'zapper', name: 'Zapper', emoji: '⚡', category: 'mobile_money' },
      { id: 'fnb_pay', name: 'FNB Pay', emoji: '🏦', category: 'mobile_money' },
      { id: 'credit', name: 'Credit', emoji: '🤝', category: 'credit' }
    ];
  }
  
  if (c.includes('ruanda') || c.includes('rwanda') || c.includes('rw')) {
    return [
      { id: 'cash', name: 'Cash', emoji: '💸', category: 'cash' },
      { id: 'mtn_momo', name: 'MTN MoMo', emoji: '🟡', category: 'mobile_money' },
      { id: 'airtel', name: 'Airtel Money', emoji: '🔴', category: 'mobile_money' },
      { id: 'credit', name: 'Credit', emoji: '🤝', category: 'credit' }
    ];
  }
  
  if (c.includes('zimbábue') || c.includes('zimbabwe') || c.includes('zw')) {
    return [
      { id: 'cash', name: 'Cash', emoji: '💸', category: 'cash' },
      { id: 'ecocash', name: 'EcoCash', emoji: '🌳', category: 'mobile_money' },
      { id: 'onemoney', name: 'OneMoney', emoji: '☝️', category: 'mobile_money' },
      { id: 'innbucks', name: 'InnBucks', emoji: '🦌', category: 'mobile_money' },
      { id: 'credit', name: 'Credit', emoji: '🤝', category: 'credit' }
    ];
  }
  
  if (c.includes('zâmbia') || c.includes('zambia') || c.includes('zm')) {
    return [
      { id: 'cash', name: 'Cash', emoji: '💸', category: 'cash' },
      { id: 'mtn_momo', name: 'MTN MoMo', emoji: '🟡', category: 'mobile_money' },
      { id: 'airtel', name: 'Airtel Money', emoji: '🔴', category: 'mobile_money' },
      { id: 'zamtel', name: 'Zamtel Kwacha', emoji: '🟢', category: 'mobile_money' },
      { id: 'credit', name: 'Credit', emoji: '🤝', category: 'credit' }
    ];
  }
  
  if (c.includes('egipto') || c.includes('egypt') || c.includes('eg')) {
    return [
      { id: 'cash', name: 'Cash', emoji: '💸', category: 'cash' },
      { id: 'vodafone_cash', name: 'Vodafone Cash', emoji: '🔴', category: 'mobile_money' },
      { id: 'orange_money', name: 'Orange Money', emoji: '🍊', category: 'mobile_money' },
      { id: 'etisalat', name: 'Etisalat Cash', emoji: '🟢', category: 'mobile_money' },
      { id: 'credit', name: 'Credit', emoji: '🤝', category: 'credit' }
    ];
  }
  
  if (c.includes('marrocos') || c.includes('morocco') || c.includes('ma')) {
    return [
      { id: 'cash', name: 'Cash', emoji: '💸', category: 'cash' },
      { id: 'orange_money', name: 'Orange Money', emoji: '🍊', category: 'mobile_money' },
      { id: 'maroc_telecom', name: 'Maroc Telecom Money', emoji: '🔵', category: 'mobile_money' },
      { id: 'credit', name: 'Credit', emoji: '🤝', category: 'credit' }
    ];
  }
  
  // All other countries
  return [
    { id: 'cash', name: 'Cash', emoji: '💸', category: 'cash' },
    { id: 'mobile_money', name: 'Mobile Money (generic)', emoji: '📱', category: 'mobile_money' },
    { id: 'bank_transfer', name: 'Bank Transfer', emoji: '🏦', category: 'bank' },
    { id: 'credit', name: 'Credit', emoji: '🤝', category: 'credit' }
  ];
};
