// Shared stock-deduction logic used by every sale path (POS, Invoices/Faturas, Orders, etc.)
//
// BUG THIS FIXES: products could end up showing something like 2 Cx / 0 Emb / -10 Un.
// That happened because each sale path deducted straight from whichever bucket (Cx/Emb/Un)
// matched the unit sold — e.g. `stockUn = stockUn - quantitySold` — even when that specific
// bucket didn't have enough stock, as long as the *overall* stockLevel was sufficient (because
// stock was sitting inside sealed Caixas instead of loose Unidades). The overall-sufficiency
// check passed, the sale went through, and the specific bucket silently went negative while
// the sealed boxes sat untouched.
//
// The fix: when the bucket being sold from runs out, "break open" the next bigger packaging
// (Embalagem, then Caixa) into loose units to cover the shortfall, exactly like a real stock
// clerk would when the shelf runs out of loose units but there's a full case in the back.

export interface StockBuckets {
  stockCx?: number;
  stockEmb?: number;
  stockUn?: number;
  boxUnitQty?: number;
  packUnitQty?: number;
  boxUnitLabel?: string;
  packUnitLabel?: string;
}

export function matchesBoxUnit(data: StockBuckets | any, unit: string): boolean {
  if (!unit) return false;
  const u = String(unit).toLowerCase().trim();
  const boxLbl = (data?.boxUnitLabel || '').toLowerCase().trim();
  return u === 'box' || u === 'cx' || u === 'saco' || u === 'sac' || (!!boxLbl && u === boxLbl);
}

export function matchesPackUnit(data: StockBuckets | any, unit: string): boolean {
  if (!unit) return false;
  const u = String(unit).toLowerCase().trim();
  const packLbl = (data?.packUnitLabel || '').toLowerCase().trim();
  return u === 'pack' || u === 'emb' || u === 'v' || u === 'volume' || (!!packLbl && u === packLbl);
}

/**
 * Computes the new stockCx/stockEmb/stockUn after selling `qtyOfUnit` units of `unitLabel`.
 * Cascades from the smallest missing denomination up (Un <- Emb <- Cx) so a single bucket
 * doesn't go negative purely because stock happens to be packaged differently than it's sold.
 *
 * NOTE: this does not itself validate that TOTAL stock is sufficient — callers should keep
 * doing that overall stockLevel check (and block the sale) before calling this. If total
 * stock genuinely is insufficient, the relevant bucket will still go negative here as a last
 * resort so the shortfall stays visible rather than silently disappearing.
 */
export function cascadeStockDeduction(
  data: StockBuckets | any,
  unitLabel: string,
  qtyOfUnit: number
): { stockCx: number; stockEmb: number; stockUn: number } {
  const boxQty = Number(data?.boxUnitQty || 10) || 10;
  const packQty = Number(data?.packUnitQty || 100) || 100;
  let stockCx = Number(data?.stockCx || 0);
  let stockEmb = Number(data?.stockEmb || 0);
  let stockUn = Number(data?.stockUn || 0);

  if (matchesBoxUnit(data, unitLabel)) {
    // Selling whole Caixas — nothing bigger exists to break open.
    stockCx -= qtyOfUnit;
    return { stockCx, stockEmb, stockUn };
  }

  if (matchesPackUnit(data, unitLabel)) {
    // Selling whole Embalagens — use what's on hand, break open Caixas for the rest.
    let remaining = qtyOfUnit;
    const fromEmb = Math.min(stockEmb, remaining);
    stockEmb -= fromEmb;
    remaining -= fromEmb;
    while (remaining > 0 && stockCx > 0) {
      stockCx -= 1;
      const embFromThisBox = Math.floor(boxQty / packQty) || 1;
      const use = Math.min(embFromThisBox, remaining);
      remaining -= use;
      stockUn += Math.max(0, boxQty - embFromThisBox * packQty);
    }
    if (remaining > 0) stockEmb -= remaining; // genuinely insufficient overall — caller should have blocked the sale
    return { stockCx, stockEmb, stockUn };
  }

  // Selling loose Unidades — use what's on hand, then break Embalagens, then Caixas.
  let remaining = qtyOfUnit;
  const fromUn = Math.min(stockUn, remaining);
  stockUn -= fromUn;
  remaining -= fromUn;

  while (remaining > 0 && stockEmb > 0) {
    stockEmb -= 1;
    stockUn += packQty;
    const covered = Math.min(stockUn, remaining);
    stockUn -= covered;
    remaining -= covered;
  }
  while (remaining > 0 && stockCx > 0) {
    stockCx -= 1;
    stockUn += boxQty;
    const covered = Math.min(stockUn, remaining);
    stockUn -= covered;
    remaining -= covered;
  }
  if (remaining > 0) stockUn -= remaining; // genuinely insufficient overall — caller should have blocked the sale

  return { stockCx, stockEmb, stockUn };
}
