export interface Currency {
  code: string;
  name: string;
  symbol: string;
  countries: string[];
}

export const SUPPORTED_CURRENCIES: Currency[] = [
  {
    code: 'MZN',
    name: 'Metical Moçambicano',
    symbol: 'MT',
    countries: ['Moçambique', 'Mozambique'],
  },
  {
    code: 'USD',
    name: 'Dólar Americano',
    symbol: '$',
    countries: ['Estados Unidos', 'United States', 'EUA', 'USA'],
  },
  {
    code: 'ZAR',
    name: 'Rand Sul-Africano',
    symbol: 'R',
    countries: ['África do Sul', 'South Africa', 'Namíbia', 'Namibia', 'Lesoto', 'Lesotho', 'Eswatini'],
  },
  {
    code: 'KES',
    name: 'Xelim Queniano',
    symbol: 'KES',
    countries: ['Quénia', 'Kenya'],
  },
  {
    code: 'UGX',
    name: 'Xelim Ugandês',
    symbol: 'UgShs',
    countries: ['Uganda'],
  },
  {
    code: 'TZS',
    name: 'Xelim Tanzaniano',
    symbol: 'TSh',
    countries: ['Tanzânia', 'Tanzania'],
  },
  {
    code: 'BIF',
    name: 'Franco Burundês',
    symbol: 'FrBu',
    countries: ['Burundi'],
  },
  {
    code: 'RWF',
    name: 'Franco Ruandês',
    symbol: 'RwF',
    countries: ['Ruanda', 'Rwanda'],
  },
  {
    code: 'EUR',
    name: 'Euro',
    symbol: '€',
    countries: ['Europa', 'Europe', 'União Europeia', 'Portugal', 'Espanha', 'Alemanha', 'França', 'Itália'],
  },
];

// Fallback rates if API is offline
export const DEFAULT_RATES: Record<string, number> = {
  MZN: 1.0,
  USD: 0.0156,
  ZAR: 0.285,
  KES: 2.05,
  UGX: 58.3,
  TZS: 40.5,
  BIF: 44.5,
  RWF: 20.2,
  EUR: 0.0145,
};

/**
 * Converte um valor da moeda A para a moeda B usando as taxas de câmbio baseadas em MZN.
 */
export function convertCurrency(
  amount: number,
  fromCode: string,
  toCode: string,
  rates: Record<string, number> = DEFAULT_RATES
): number {
  if (!amount || isNaN(amount)) return 0;
  if (fromCode === toCode) return amount;

  const rateFrom = rates[fromCode] || DEFAULT_RATES[fromCode] || 1;
  const rateTo = rates[toCode] || DEFAULT_RATES[toCode] || 1;

  // Convert fromCode -> MZN, then MZN -> toCode
  // Since rates are: 1 MZN = rateUnits of Currency
  // Ex: 1000 MZN = 15.6 USD -> rateUSD = 0.0156
  // To convert 100 USD to MZN: 100 / 0.0156 = 6410.25 MZN
  // To convert 6410.25 MZN to ZAR: 6410.25 * 0.285 = 1826.92 ZAR
  const amountInMzn = amount / rateFrom;
  return amountInMzn * rateTo;
}

/**
 * Formata um valor de acordo com o padrão e símbolo da moeda selecionada.
 */
export function formatCurrencyValue(amount: number, currencyCode: string): string {
  const currency = SUPPORTED_CURRENCIES.find(c => c.code === currencyCode) || { symbol: currencyCode };
  const val = typeof amount === 'number' ? amount : Number(amount) || 0;
  
  // Format based on standard locales or custom formatting
  const formattedNumber = val.toLocaleString('pt-PT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // Decide if symbol goes before or after
  if (currency.symbol === '$' || currency.symbol === '€') {
    return `${currency.symbol} ${formattedNumber}`;
  }
  return `${formattedNumber} ${currency.symbol}`;
}

/**
 * Busca taxas de câmbio atualizadas a partir da api e retorna taxas associadas mais data da atualização.
 */
export async function fetchLiveExchangeRates(): Promise<{ rates: Record<string, number>; timestamp: string }> {
  try {
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/MZN');
    if (!response.ok) {
      throw new Error(`Exchangerate API request failed: ${response.statusText}`);
    }
    const data = await response.json();
    if (data && data.rates) {
      // Ensure we merge defaults for any missing supported currencies
      const mergedRates = { ...DEFAULT_RATES, ...data.rates };
      return {
        rates: mergedRates,
        timestamp: new Date().toISOString(),
      };
    }
    throw new Error('Invalid response structure from Exchangerate API');
  } catch (error) {
    console.warn('Could not fetch live exchange rates, using defaults:', error);
    return {
      rates: DEFAULT_RATES,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Formata um valor numérico usando as moedas primária e secundária configuradas.
 * Se a moeda secundária estiver activa, mostra: "100.00 MT (1.56 USD)"
 */
export function formatSystemCurrency(
  amount: number,
  businessData: any,
  options?: { showSecondary?: boolean }
): string {
  const isNumber = typeof amount === 'number' && !isNaN(amount);
  const val = isNumber ? amount : Number(amount) || 0;

  if (!businessData) {
    return `${val.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT`;
  }

  const primaryCode = businessData.currency || 'MZN';
  const secondaryCode = businessData.secondaryCurrency;

  const primaryStr = formatCurrencyValue(val, primaryCode);

  if (options?.showSecondary !== false && secondaryCode && secondaryCode !== primaryCode) {
    const rates = businessData.exchangeRates || DEFAULT_RATES;
    const converted = convertCurrency(val, primaryCode, secondaryCode, rates);
    const secondaryStr = formatCurrencyValue(converted, secondaryCode);
    return `${primaryStr} (${secondaryStr})`;
  }

  return primaryStr;
}

