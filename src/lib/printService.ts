import { toast } from 'sonner';
import { formatDateInTimezone, convertNumberToWordsPt } from './utils';

export interface PrintBusinessInfo {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  taxId?: string; // NUIT
  timezone?: string;
}

export interface PrintCustomerInfo {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
}

export interface PrintInvoiceItem {
  name?: string;
  description?: string;
  quantity: number;
  price: number;
}

export interface PrintInvoiceData {
  invoiceNumber: string;
  items: PrintInvoiceItem[];
  subtotal: number;
  tax: number;
  total: number;
  amountPaid?: number;
  outstandingBalance?: number;
  paymentMethod?: string;
  status: string;
  date: string | Date;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  deliveryAddress?: string;
  paymentTerms?: string;
  globalAjuste?: number;
  taxRate?: number;
}

/**
 * Helper to physically target the browser print context, automatically bypassing
 * iframe sandboxing when loaded inside the AI Studio preview window.
 */
function triggerPhysicalPrint(styles: string, contentHtml: string, titleStr: string) {
  // If we are inside an iframe (like the AI Studio integrated preview)
  if (typeof window !== 'undefined' && window.self !== window.top) {
    try {
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        toast.info("A abrir página de impressão sem as restrições do editor...");
        printWindow.document.open();
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <title>${titleStr}</title>
            <style>
              ${styles}
              #print-only-container {
                display: block !important;
                position: relative !important;
              }
              @media print {
                #print-only-container {
                  display: block !important;
                  position: absolute !important;
                  left: 0 !important;
                  top: 0 !important;
                }
              }
              body { margin: 0; padding: 20px; }
            </style>
          </head>
          <body onload="window.focus(); setTimeout(function() { window.print(); setTimeout(function() { window.close(); }, 500); }, 500);">
            <div id="print-only-container">
              ${contentHtml}
            </div>
          </body>
          </html>
        `);
        printWindow.document.close();
        return;
      }
    } catch (popupErr) {
      console.warn("Popup block detected or error opening print window:", popupErr);
    }
    
    // Fallback message inside iframe
    toast.warning("Bloqueador de pop-ups ativo!", {
      description: "Por favor, ative os pop-ups ou use o botão 'Baixar PDF'. Dica: para a melhor experiência física com guilhotina e corte, abra a aplicação no seu próprio separador de navegador!",
      duration: 10000
    });
  }

  // Standard in-window printing (outside iframe, or inside iframe but with popups blocked)
  const containerId = 'print-only-container';
  let printContainer = document.getElementById(containerId);
  if (printContainer) {
    printContainer.remove();
  }
  
  printContainer = document.createElement('div');
  printContainer.id = containerId;
  printContainer.innerHTML = `
    <style>${styles}</style>
    ${contentHtml}
  `;
  document.body.appendChild(printContainer);

  const cleanUp = () => {
    if (printContainer) {
      printContainer.remove();
    }
  };

  setTimeout(() => {
    try {
      window.focus();
      window.print();
      setTimeout(cleanUp, 3000);
    } catch (printErr) {
      console.error("Direct print exception inside sandbox:", printErr);
      cleanUp();
      
      // Iframe fallback
      try {
        const iframe = document.createElement('iframe');
        iframe.style.position = 'absolute';
        iframe.style.top = '-9999px';
        iframe.style.left = '-9999px';
        iframe.style.width = '0px';
        iframe.style.height = '0px';
        document.body.appendChild(iframe);
        const iframeDoc = (iframe.contentDocument || iframe.contentWindow?.document);
        if (iframeDoc) {
          iframeDoc.open();
          iframeDoc.write(`
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <title>${titleStr}</title>
              <style>
                ${styles}
                #print-only-container {
                  display: block !important;
                  position: relative !important;
                }
                @media print {
                  #print-only-container {
                    display: block !important;
                    position: absolute !important;
                    left: 0 !important;
                    top: 0 !important;
                  }
                }
              </style>
            </head>
            <body>
              <div id="print-only-container">
                ${contentHtml}
              </div>
            </body>
            </html>
          `);
          iframeDoc.close();
          setTimeout(() => {
            try {
              iframe.contentWindow?.focus();
              iframe.contentWindow?.print();
              setTimeout(() => { iframe.remove(); }, 2000);
            } catch (iframeErr) {
              console.error("Iframe print blocked", iframeErr);
              iframe.remove();
              toast.error(
                "A visualização de testes bloqueou a impressão direta do navegador. Por favor clique em 'Baixar PDF / Download' ou use 'Novo Separador' para imprimir diretamente!",
                { duration: 8000 }
              );
            }
          }, 350);
        }
      } catch (fallbackErr) {
        console.error("Iframe print fallback setup failed", fallbackErr);
        toast.error("Não foi possível iniciar a janela de impressão.");
      }
    }
  }, 150);
}

/**
 * Triggers clean page printing using an isolated hidden iframe
 */
export function printInvoiceHTML(
  invoice: PrintInvoiceData,
  business: PrintBusinessInfo,
  printerType: 'standard' | 'thermal_80mm' | 'thermal_58mm' = 'standard'
) {
  // 1. Prepare data variables
  const storeAddress = business.address && business.address.trim() ? business.address : 'Av. de Angola, Maputo, Moçambique';
  const storePhone = business.phone && business.phone.trim() ? business.phone : '+258 84 000 0000';
  
  const docDate = formatDateInTimezone(invoice.date, business.timezone || 'Africa/Maputo');
  
  const rawTotal = invoice.total || 0;
  const userTaxRate = Number(invoice.taxRate) || 17;
  const rawSemIva = rawTotal / (1 + userTaxRate / 100);
  const rawIvaValue = rawTotal - rawSemIva;

  const formattedSubtotal = (invoice.subtotal || 0).toLocaleString('pt-MZ', { minimumFractionDigits: 2 }) + ' MT';
  const formattedAjusteGlobal = (invoice.globalAjuste || 0).toLocaleString('pt-MZ', { minimumFractionDigits: 2 }) + ' MT';
  const formattedTotal = rawTotal.toLocaleString('pt-MZ', { minimumFractionDigits: 2 }) + ' MT';
  const formattedSemIva = rawSemIva.toLocaleString('pt-MZ', { minimumFractionDigits: 2 }) + ' MT';
  const formattedIvaValue = rawIvaValue.toLocaleString('pt-MZ', { minimumFractionDigits: 2 }) + ' MT';

  // Calculate pricing savings (purely informational summary block)
  let totalHighest = 0;
  let totalCharged = 0;
  let totalSavings = 0;

  (invoice.items || []).forEach(item => {
    const qty = Number(item.quantity || 1);
    const highestPrice = Number(item.price || 0);
    const priceCharged = (item as any).finalUnitPrice !== undefined ? Number((item as any).finalUnitPrice) : Number(item.price);
    
    totalHighest += highestPrice * qty;
    totalCharged += priceCharged * qty;
    totalSavings += (highestPrice - priceCharged) * qty;
  });

  const discountPercent = totalHighest > 0 ? (totalSavings / totalHighest) * 100 : 0;

  // 2. Build template mockup according to printerType (Standard vs Thermal)
  let printContent = '';

  if (printerType === 'thermal_80mm' || printerType === 'thermal_58mm') {
    const isSmall = printerType === 'thermal_58mm';
    
    printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Recibo POS #${invoice.invoiceNumber}</title>
        <style>
          @page {
            margin: 0mm !important;
            size: ${isSmall ? '58mm auto' : '80mm auto'};
          }
          body {
            font-family: 'Courier New', Courier, monospace;
            font-size: ${isSmall ? '11px' : '13px'};
            line-height: 1.35;
            color: #000;
            background-color: #fff;
            margin: 0;
            padding: ${isSmall ? '4px 6px' : '8px 12px'};
            width: ${isSmall ? '54mm' : '76mm'};
          }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .font-bold { font-weight: bold; }
          .divider {
            border-top: 1px dashed #000;
            margin: 6px 0;
          }
          .double-divider {
            border-top: 2px double #000;
            margin: 6px 0;
          }
          .mb-1 { margin-bottom: 2px; }
          .mb-2 { margin-bottom: 4px; }
          .header-title {
            font-size: ${isSmall ? '14px' : '18px'};
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .table {
            width: 100%;
            border-collapse: collapse;
          }
          .table th, .table td {
            padding: 3px 0;
            font-size: ${isSmall ? '10px' : '12px'};
          }
          .details-label {
            display: inline-block;
            width: 60px;
          }
          .total-row td {
            padding-top: 4px;
          }
          .thanks-msg {
            margin-top: 15px;
            font-style: italic;
          }
        </style>
      </head>
      <body>
        <div class="text-center mb-1">
          <div class="header-title">${business.name}</div>
          <div class="mb-1">${storeAddress}</div>
          <div>Cel/Tel: ${storePhone}</div>
          ${business.taxId ? `<div>NUIT: ${business.taxId}</div>` : ''}
        </div>

        <div class="divider"></div>

        <div class="mb-2">
          <div><strong>TICKET:</strong> #${invoice.invoiceNumber}</div>
          <div><strong>DATA:</strong> ${docDate}</div>
          ${invoice.customerName ? `<div><strong>CLIENTE:</strong> ${invoice.customerName}</div>` : '<div><strong>CLIENTE:</strong> Cliente Geral</div>'}
        </div>

        <div class="divider"></div>

        <table class="table">
          <thead>
            <tr>
              <th align="left">ARTIGO</th>
              <th align="center">QTD</th>
              <th align="right">P.UNIT</th>
              <th align="right">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            ${invoice.items.map(item => {
              const name = item.name || item.description || 'Artigo';
              const truncatedName = name.length > 18 ? name.slice(0, 16) + '..' : name;
              const priceCharged = (item as any).finalUnitPrice !== undefined ? Number((item as any).finalUnitPrice) : Number(item.price);
              const totalCost = (item.quantity * priceCharged).toFixed(2);
              return `
                <tr>
                  <td>${truncatedName}</td>
                  <td align="center">${item.quantity}</td>
                  <td align="right">${priceCharged.toFixed(2)}</td>
                  <td align="right">${totalCost}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <div class="divider"></div>

        <table class="table" style="font-weight: bold; font-family: 'Courier New', Courier, monospace;">
          <tr>
            <td>SUBTOTAL:</td>
            <td align="right">${formattedSubtotal}</td>
          </tr>
          ${(invoice.globalAjuste || 0) > 0 ? `
          <tr>
            <td>AJUSTE GLOBAL:</td>
            <td align="right">- ${formattedAjusteGlobal}</td>
          </tr>
          ` : ''}
          <tr class="total-row" style="font-size: ${isSmall ? '11px' : '13px'}; border-top: 1px dashed #000; border-bottom: 2px double #000;">
            <td>TOTAL GERAL:</td>
            <td align="right">${formattedTotal}</td>
          </tr>
        </table>

        <!-- Informational Breakdown Block requested by User -->
        <table class="table" style="font-weight: normal; font-size: ${isSmall ? '9px' : '11px'}; margin-top: 4px; color: #000; font-family: 'Courier New', Courier, monospace;">
          <tr>
            <td>Produtos (sem IVA):</td>
            <td align="right">${formattedSemIva}</td>
          </tr>
          <tr>
            <td>IVA incluído (${userTaxRate}%):</td>
            <td align="right">${formattedIvaValue}</td>
          </tr>
          <tr class="total-row" style="font-weight: bold; font-size: ${isSmall ? '10px' : '11.5px'}; border-top: 1px dashed #000;">
            <td>Total confirmado:</td>
            <td align="right">${formattedTotal}</td>
          </tr>
          ${(invoice.outstandingBalance || 0) <= 0 ? `
          <tr>
            <td colspan="2" style="font-weight: bold; text-align: left; padding-top: 4px;">Cash Sales</td>
          </tr>
          ` : ''}
        </table>

        ${totalSavings > 0 ? `
        <div class="divider"></div>
        <div style="font-family: 'Courier New', Courier, monospace; font-size: ${isSmall ? '10px' : '12px'}; line-height: 1.4;">
          <div class="font-bold" style="text-align: center;">POUPANÇA DO CLIENTE</div>
          <table class="table" style="font-weight: normal;">
            <tr>
              <td>Preço de tabela (máx.):</td>
              <td align="right">${totalHighest.toFixed(2)} MT</td>
            </tr>
            <tr>
              <td>Preço cobrado:</td>
              <td align="right">${totalCharged.toFixed(2)} MT</td>
            </tr>
            <tr style="font-weight: bold;">
              <td>Desconto total:</td>
              <td align="right">- ${totalSavings.toFixed(2)} MT (${discountPercent.toFixed(1)}%)</td>
            </tr>
          </table>
        </div>
        ` : ''}

        <div class="double-divider"></div>

        <div class="text-center thanks-msg">
          Obrigado pela sua visita!<br>
          Sabush System ERP
        </div>
        
        <div style="height: 30px;"></div>
      </body>
      </html>
    `;
  } else {
    const numWords = convertNumberToWordsPt(invoice.total || 0);
    
    printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Factura Comercial #${invoice.invoiceNumber}</title>
        <style>
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .no-print { display: none !important; }
          }
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            font-size: 11px;
            color: #111111;
            line-height: 1.4;
            margin: 0;
            padding: 24px;
            background-color: #fff;
          }
          
          /* Top Document Badge Style */
          .doc-badge-container {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #0B1F4D;
            padding-bottom: 8px;
            margin-bottom: 12px;
          }
          .doc-title {
            font-size: 18px;
            font-weight: 800;
            color: #0B1F4D;
            letter-spacing: 0.5px;
            margin: 0;
          }
          .invoice-origin {
            font-size: 8px;
            text-transform: uppercase;
            color: #6B7280;
            font-weight: bold;
            letter-spacing: 1px;
          }

          /* Header Details */
          .header-grid {
            display: grid;
            grid-template-columns: 1.2fr 0.8fr;
            gap: 16px;
            margin-bottom: 16px;
          }
          .issuer-details h1 {
            color: #111111;
            font-weight: 800;
            font-size: 18px;
            margin: 0 0 4px 0;
            line-height: 1.1;
          }
          .issuer-meta {
            font-size: 10px;
            color: #6B7280;
            line-height: 1.4;
          }
          
          .invoice-meta-box {
            background-color: #F8F9FA;
            border: 1px solid #E5E7EB;
            border-radius: 6px;
            padding: 10px;
          }
          .meta-table {
            width: 100%;
            border-collapse: collapse;
          }
          .meta-table td {
            font-size: 10px;
            padding: 2px 0;
            color: #0B1F4D;
          }
          .meta-table td.label {
            font-weight: bold;
            color: #6B7280;
          }
          .meta-table td.value {
            text-align: right;
            font-weight: 700;
            color: #111111;
          }

          /* Dual Party Grid */
          .parties-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 16px;
            margin-bottom: 16px;
          }
          .party-card {
            border: 1px solid #E5E7EB;
            border-radius: 6px;
            overflow: hidden;
          }
          .party-header {
            background-color: #0B1F4D;
            color: #ffffff;
            font-weight: 800;
            font-size: 8.5px;
            text-transform: uppercase;
            padding: 6px 10px;
            letter-spacing: 0.5px;
          }
          .party-body {
            padding: 10px;
            min-height: 64px;
            font-size: 10px;
            color: #111111;
          }
          .party-body strong {
            display: block;
            font-size: 11px;
            color: #111111;
            margin-bottom: 4px;
          }

          /* Clean Items Table */
          .items-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 16px;
          }
          .items-table th {
            font-size: 9px;
            text-transform: uppercase;
            font-weight: bold;
            color: #ffffff;
            background-color: #0B1F4D;
            border: 1px solid #0B1F4D;
            padding: 6px 8px;
            text-align: left;
          }
          .items-table td {
            border: 1px solid #E5E7EB;
            padding: 6px 8px;
            font-size: 10px;
            color: #111111;
          }
          .items-table tr:nth-child(even) {
            background-color: #F8F9FA;
          }
          .items-table .text-center { text-align: center; }
          .items-table .text-right { text-align: right; }

          /* Under-table Layout */
          .bottom-layout {
            display: grid;
            grid-template-columns: 1.1fr 0.9fr;
            gap: 16px;
            margin-top: 12px;
            page-break-inside: avoid;
          }
          
          .info-block {
            display: flex;
            flex-direction: column;
            gap: 10px;
          }
          .compact-box {
            border: 1px solid #E5E7EB;
            border-radius: 6px;
            padding: 8px;
            background-color: #F8F9FA;
          }
          .compact-box h4 {
            margin: 0 0 4px 0;
            font-size: 9px;
            text-transform: uppercase;
            color: #0B1F4D;
            font-weight: 800;
            border-bottom: 1px solid #E5E7EB;
            padding-bottom: 3px;
          }
          .compact-box p {
            margin: 0;
            font-size: 9.5px;
            color: #0B1F4D;
            line-height: 1.35;
          }
          
          /* Words Box */
          .words-container {
            border: 1px dashed #0B1F4D;
            background-color: #FFFFFF;
            border-radius: 6px;
            padding: 8px;
          }
          .words-title {
            font-size: 9px;
            font-weight: 800;
            color: #0B1F4D;
            text-transform: uppercase;
            margin-bottom: 4px;
          }
          .words-value {
            font-size: 10px;
            font-weight: bold;
            color: #111111;
            font-style: italic;
          }

          /* Financials Box */
          .financials-right {
            display: flex;
            flex-direction: column;
            align-items: stretch;
            gap: 12px;
          }
          .financials-table {
            width: 100%;
            border-collapse: collapse;
            border: 1px solid #E5E7EB;
            border-radius: 6px;
            overflow: hidden;
          }
          .financials-table td {
            font-size: 10px;
            padding: 5px 8px;
            color: #0B1F4D;
          }
          .financials-table tr {
            border-bottom: 1px solid #F8F9FA;
          }
          .financials-table tr.total-row {
            background-color: #0B1F4D;
            color: #ffffff;
            font-weight: bold;
            font-size: 11px;
            border-bottom: none;
          }
          .financials-table tr.total-row td {
            color: #ffffff;
            font-size: 12px;
            padding: 8px;
          }
          
          /* Authorized Signatory Block */
          .signatory-box {
            border: 1px solid #E5E7EB;
            border-radius: 6px;
            padding: 12px;
            text-align: center;
            background-color: #F8F9FA;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            min-height: 100px;
          }
          .signatory-title {
            font-size: 9px;
            font-weight: bold;
            color: #6B7280;
            text-transform: uppercase;
          }
          .signature-line {
            border-top: 1px dashed #9CA3AF;
            margin: 40px auto 4px auto;
            width: 80%;
          }
          .signature-sub {
            font-size: 8px;
            color: #6B7280;
          }

          .footer-note {
            text-align: center;
            font-size: 9px;
            color: #9CA3AF;
            margin-top: 32px;
            border-top: 1px solid #E5E7EB;
            padding-top: 12px;
          }
        </style>
      </head>
      <body>
        
        <!-- Header Ribbon -->
        <div class="doc-badge-container">
          <div>
            <span class="doc-title">FACTURA COMERCIAL</span>
          </div>
          <div class="invoice-origin">
            Original p/ Cliente
          </div>
        </div>

        <!-- Issuer Info & Doc Details -->
        <div class="header-grid">
          <div class="issuer-details">
            <h1>${business.name}</h1>
            <div class="issuer-meta">
              <strong>Morada:</strong> ${storeAddress}<br>
              <strong>Contacto:</strong> ${storePhone} ${business.email ? ` | <strong>Email:</strong> ${business.email}` : ''}<br>
              ${business.taxId ? `<strong>NUIT (Número de Identificação Tributária):</strong> ${business.taxId}<br>` : ''}
              <strong>Moçambique</strong>
            </div>
          </div>
          
          <div class="invoice-meta-box">
            <table class="meta-table">
              <tr>
                <td class="label">Fatura Nº:</td>
                <td class="value">#${invoice.invoiceNumber}</td>
              </tr>
              <tr>
                <td class="label">Data Emissão:</td>
                <td class="value">${docDate}</td>
              </tr>
            </table>
          </div>
        </div>

        <!-- Parties Details -->
        <div class="parties-grid">
          <div class="party-card">
            <div class="party-header">Facturado a (Billed To)</div>
            <div class="party-body">
              <strong>${invoice.customerName || 'Cliente Geral'}</strong>
              ${invoice.customerPhone ? `<div>Tel: ${invoice.customerPhone}</div>` : ''}
              ${invoice.customerEmail ? `<div>Email: ${invoice.customerEmail}</div>` : ''}
              ${invoice.deliveryAddress ? `<div>Endereço: ${invoice.deliveryAddress}</div>` : '<div>Cidade de Maputo, Moçambique</div>'}
            </div>
          </div>
          
          <div class="party-card">
            <div class="party-header">Instruções de Recepção</div>
            <div class="party-body" style="font-size: 9.5px;">
              <strong>Local de Fornecimento / Entrega</strong>
              <div>${invoice.deliveryAddress || 'Mesma do Cliente / Levantamento no Ponto de Venda'}</div>
              <div style="margin-top: 4px; color: #6B7280; font-size: 8.5px">Agradecemos o vosso negócio de imediato. Por favor, conserve esta factura para efeitos de garantia ou devoluções.</div>
            </div>
          </div>
        </div>

        <!-- High-Density Items Grid Table -->
        <table class="items-table">
          <thead>
            <tr>
              <th style="width: 30px;" class="text-center">S.No</th>
              <th>Descrição do Artigo ou Serviço</th>
              <th style="width: 50px;" class="text-center">Qtd</th>
              <th style="width: 100px;" class="text-right">Preço Unitário</th>
              <th style="width: 80px;" class="text-right">Desc.</th>
              <th style="width: 70px;" class="text-center">IVA %</th>
              <th style="width: 120px;" class="text-right">Total Item (MZN)</th>
            </tr>
          </thead>
          <tbody>
            ${invoice.items.map((item, idx) => {
              const serialNo = idx + 1;
              const name = item.name || item.description || 'Artigo';
              const qtyNum = Number(item.quantity || 1);
              const priceCharged = (item as any).finalUnitPrice !== undefined ? Number((item as any).finalUnitPrice) : Number(item.price);
              const highestVal = Number(item.price || 0);
              const discountPerUnit = Math.max(0, highestVal - priceCharged);
              const lineDiscount = discountPerUnit * qtyNum;
              
              const totalCost = (priceCharged * qtyNum).toLocaleString('pt-MZ', { minimumFractionDigits: 2 }) + ' MT';
              const formattedPrice = priceCharged.toLocaleString('pt-MZ', { minimumFractionDigits: 2 }) + ' MT';
              const formattedLineDiscount = lineDiscount > 0 
                ? `&minus; ${lineDiscount.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} MT` 
                : '0.00 MT';
              
              return `
                <tr>
                  <td class="text-center font-bold" style="color: #6B7280;">${serialNo}</td>
                  <td style="font-weight: 500;">${name}</td>
                  <td class="text-center" style="font-weight: bold;">${qtyNum}</td>
                  <td class="text-right">${formattedPrice}</td>
                  <td class="text-right" style="color: ${lineDiscount > 0 ? '#10b981' : '#6B7280'}; font-weight: ${lineDiscount > 0 ? 'bold' : 'normal'};">${formattedLineDiscount}</td>
                  <td class="text-center">17%</td>
                  <td class="text-right" style="font-weight: bold;">${totalCost}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <!-- High-Density Dual Layout Bottom Block -->
        <div class="bottom-layout">
          
          <div class="info-block">
            <!-- Words Container -->
            <div class="words-container">
              <div class="words-title">💳 Total em Extenso (Amount in Words):</div>
              <div class="words-value">${numWords}</div>
            </div>

            <!-- bank metadata card -->
            <div class="compact-box">
              <h4>🏦 Conta Bancária do Emissor</h4>
              <p>
                <strong>Banco:</strong> Millennium BIM | <strong>Titular:</strong> ${business.name || 'Sabush System'}<br>
                <strong>Número de Conta (MZN):</strong> 123456789<br>
                <strong>NIB da Conta:</strong> 0001 0000 1234 5678 9012 3<br>
                <strong>Instrução:</strong> Use a referência <strong>#${invoice.invoiceNumber}</strong> ao efectuar transferência.
              </p>
            </div>
            
            <!-- Terms Card -->
            <div class="compact-box">
              <h4>📋 Termos e Condições</h4>
              <p style="font-size: 8px; line-height: 1.3;">
                1. Os bens continuam a ser propriedade jurídica do Emissor até ao pagamento integral da respectiva liquidação.<br>
                2. Quaisquer divergências físicas ou de garantia sobre as especificações devem ser reportadas no prazo de 48 horas.<br>
                3. juros de mora de 2% poderão ser aplicados em faturas vencidas a mais de 30 dias de atraso.
              </p>
            </div>
          </div>

          <!-- Financial Calculation block and Authorized Signatory -->
          <div class="financials-right">
            <table class="financials-table">
              <tr>
                <td>Subtotal:</td>
                <td align="right" style="font-weight: 500;">${formattedSubtotal}</td>
              </tr>
              ${(invoice.globalAjuste || 0) > 0 ? `
              <tr style="color: #0B1F4D; font-weight: bold;">
                <td>Ajuste / Desconto Global:</td>
                <td align="right">- ${formattedAjusteGlobal}</td>
              </tr>
              ` : ''}
              <tr class="total-row">
                <td>TOTAL GERAL (MZN):</td>
                <td align="right">${formattedTotal}</td>
              </tr>
            </table>

            <!-- Informational Breakdown Block requested by User -->
            <table class="financials-table" style="font-weight: normal; margin-top: 4px; border: 1px dashed #E5E7EB; border-radius: 4px;">
              <tr>
                <td style="font-size: 9.5px; color: #6B7280;">Produtos (sem IVA):</td>
                <td align="right" style="font-size: 9.5px; font-weight: 500;">${formattedSemIva}</td>
              </tr>
              <tr>
                <td style="font-size: 9.5px; color: #6B7280;">IVA incluído (${userTaxRate}%):</td>
                <td align="right" style="font-size: 9.5px; font-weight: 500;">${formattedIvaValue}</td>
              </tr>
              <tr style="font-weight: bold; background-color: #F8F9FA; border-top: 1px solid #E5E7EB;">
                <td style="font-size: 10px; color: #0B1F4D;">Total confirmado:</td>
                <td align="right" style="font-size: 10px; color: #0B1F4D;">${formattedTotal}</td>
              </tr>
              ${(invoice.outstandingBalance || 0) <= 0 ? `
              <tr style="background-color: #FFFFFF;">
                <td colspan="2" style="font-weight: bold; text-align: center; color: #0B1F4D; font-size: 9.5px; padding: 4px;">Cash Sales</td>
              </tr>
              ` : ''}
            </table>

            ${totalSavings > 0 ? `
            <div style="font-family: 'Courier New', Courier, monospace; font-size: 11px; line-height: 1.4; border: 1px solid #10b981; background-color: #FFFFFF; border-radius: 6px; padding: 10px;">
              <div style="font-weight: bold; text-align: center; margin-bottom: 4px; color: #15803d;">POUPANÇA DO CLIENTE</div>
              <div style="display: flex; justify-content: space-between; color: #166534;">
                <span>Preço de tabela (máx.):</span>
                <span>${totalHighest.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} MT</span>
              </div>
              <div style="display: flex; justify-content: space-between; color: #166534;">
                <span>Preço cobrado:</span>
                <span>${totalCharged.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} MT</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-weight: bold; color: #15803d; border-top: 1px dashed #bbf7d0; pt: 4px; mt: 4px;">
                <span>Desconto total:</span>
                <span>&minus; ${totalSavings.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} MT &nbsp;(${discountPercent.toFixed(1)}%)</span>
              </div>
            </div>
            ` : ''}
            
            <!-- Signatory -->
            <div class="signatory-box">
              <div class="signatory-title">Para ${business.name || 'SABUSH SYSTEM'}</div>
              <div>
                <div class="signature-line"></div>
                <div class="signature-sub">Assinatura Autorizada & Carimbo</div>
              </div>
            </div>
          </div>

        </div>

        <div class="footer-note">
          Obrigado pela preferência e confiança! - Gerado de forma segura via Sabush System ERP
        </div>

      </body>
      </html>
    `;
  }

  const isThermal = printerType === 'thermal_80mm' || printerType === 'thermal_58mm';
  const isSmall = printerType === 'thermal_58mm';
  
  let styles = '';
  let contentHtml = '';
  
  if (isThermal) {
    styles = `
      @media screen {
        #print-only-container {
          display: none !important;
        }
      }
      @page {
        size: ${isSmall ? '58mm auto' : '80mm auto'};
        margin: 0mm !important;
      }
      @media print {
        body > :not(#print-only-container) {
          display: none !important;
        }
        #print-only-container {
          display: block !important;
          position: absolute !important;
          left: 0 !important;
          top: 0 !important;
          width: 100% !important;
          max-width: ${isSmall ? '54mm' : '76mm'} !important;
          background: white !important;
          color: #000 !important;
          font-family: 'Courier New', Courier, monospace !important;
          font-size: ${isSmall ? '15px' : '17px'} !important;
          line-height: 1.5 !important;
          padding: ${isSmall ? '4px 6px' : '8px 12px'} !important;
          margin: 0 !important;
        }
        .text-center { text-align: center !important; }
        .text-right { text-align: right !important; }
        .font-bold { font-weight: bold !important; }
        .divider {
          border-top: 1px dashed #000 !important;
          margin: 6px 0 !important;
        }
        .double-divider {
          border-top: 2px double #000 !important;
          margin: 6px 0 !important;
        }
        .mb-1 { margin-bottom: 2px !important; }
        .mb-2 { margin-bottom: 4px !important; }
        .header-title {
          font-size: ${isSmall ? '18px' : '22px'} !important;
          font-weight: bold !important;
          text-transform: uppercase !important;
          letter-spacing: 0.5px !important;
        }
        .table {
          width: 100% !important;
          border-collapse: collapse !important;
        }
        .table th, .table td {
          padding: 5px 0 !important;
          font-size: ${isSmall ? '14px' : '16px'} !important;
        }
        .details-label {
          display: inline-block !important;
          width: 60px !important;
        }
        .total-row td {
          padding-top: 4px !important;
        }
        .thanks-msg {
          margin-top: 15px !important;
          font-style: italic !important;
        }
      }
    `;
    
    contentHtml = `
      <div class="text-center mb-1">
        <div class="header-title">${business.name}</div>
        <div class="mb-1">${storeAddress}</div>
        <div>Cel/Tel: ${storePhone}</div>
        ${business.taxId ? `<div>NUIT: ${business.taxId}</div>` : ''}
      </div>

      <div class="divider"></div>

      <div class="mb-2">
        <div><strong>TICKET:</strong> #${invoice.invoiceNumber}</div>
        <div><strong>DATA:</strong> ${docDate}</div>
        ${invoice.customerName ? `<div><strong>CLIENTE:</strong> ${invoice.customerName}</div>` : '<div><strong>CLIENTE:</strong> Cliente Geral</div>'}
      </div>

      <div class="divider"></div>

      <table class="table">
        <thead>
          <tr>
            <th align="left">ARTIGO</th>
            <th align="center">QTD</th>
            <th align="right">P.UNIT</th>
            <th align="right">TOTAL</th>
          </tr>
        </thead>
        <tbody>
          ${invoice.items.map(item => {
            const name = item.name || item.description || 'Artigo';
            const truncatedName = name.length > 18 ? name.slice(0, 16) + '..' : name;
            const priceCharged = (item as any).finalUnitPrice !== undefined ? Number((item as any).finalUnitPrice) : Number(item.price);
            const totalCost = (item.quantity * priceCharged).toFixed(2);
            return `
              <tr>
                <td>${truncatedName}</td>
                <td align="center">${item.quantity}</td>
                <td align="right">${priceCharged.toFixed(2)}</td>
                <td align="right">${totalCost}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>

      <table class="table" style="font-weight: bold; font-family: 'Courier New', Courier, monospace;">
        <tr>
          <td>SUBTOTAL:</td>
          <td align="right">${formattedSubtotal}</td>
        </tr>
        ${(invoice.globalAjuste || 0) > 0 ? `
        <tr>
          <td>AJUSTE GLOBAL:</td>
          <td align="right">- ${formattedAjusteGlobal}</td>
        </tr>
        ` : ''}
        <tr class="total-row" style="font-size: ${isSmall ? '17px' : '19px'}; border-top: 1px dashed #000; border-bottom: 2px double #000;">
          <td>TOTAL GERAL:</td>
          <td align="right">${formattedTotal}</td>
        </tr>
      </table>

      <!-- Informational Breakdown Block requested by User -->
      <table class="table" style="font-weight: normal; font-size: ${isSmall ? '14px' : '16px'}; margin-top: 4px; color: #000; font-family: 'Courier New', Courier, monospace;">
        <tr>
          <td>Produtos (sem IVA):</td>
          <td align="right">${formattedSemIva}</td>
        </tr>
        <tr>
          <td>IVA incluído (${userTaxRate}%):</td>
          <td align="right">${formattedIvaValue}</td>
        </tr>
        <tr class="total-row" style="font-weight: bold; font-size: ${isSmall ? '15px' : '16.5px'}; border-top: 1px dashed #000;">
          <td>Total confirmed:</td>
          <td align="right">${formattedTotal}</td>
        </tr>
        ${(invoice.outstandingBalance || 0) <= 0 ? `
        <tr>
          <td colspan="2" style="font-weight: bold; text-align: left; padding-top: 4px;">Cash Sales</td>
        </tr>
        ` : ''}
      </table>

      ${totalSavings > 0 ? `
      <div class="divider"></div>
      <div style="font-family: 'Courier New', Courier, monospace; font-size: ${isSmall ? '15px' : '17px'}; line-height: 1.4;">
        <div class="font-bold" style="text-align: center;">POUPANÇA DO CLIENTE</div>
        <table class="table" style="font-weight: normal;">
          <tr>
            <td>Preço de tabela (máx.):</td>
            <td align="right">${totalHighest.toFixed(2)} MT</td>
          </tr>
          <tr>
            <td>Preço cobrado:</td>
            <td align="right">${totalCharged.toFixed(2)} MT</td>
          </tr>
          <tr style="font-weight: bold;">
            <td>Desconto total:</td>
            <td align="right">- ${totalSavings.toFixed(2)} MT (${discountPercent.toFixed(1)}%)</td>
          </tr>
        </table>
      </div>
      ` : ''}

      <div class="double-divider"></div>

      <div class="text-center thanks-msg">
        Obrigado pela sua preferência!<br>
        Sabush System ERP
      </div>

      <div style="height: 30px;"></div>
    `;
  } else {
    // Standard A4 Layout
    styles = `
      @media screen {
        #print-only-container {
          display: none !important;
        }
      }
      @page {
        size: A4;
        margin: 12mm;
      }
      @media print {
        body > :not(#print-only-container) {
          display: none !important;
        }
        #print-only-container {
          display: block !important;
          position: absolute !important;
          left: 0 !important;
          top: 0 !important;
          width: 100% !important;
          background: white !important;
          color: #0B1F4D !important;
          font-family: Arial, sans-serif !important;
          font-size: 13px !important;
          line-height: 1.5 !important;
          padding: 40px !important;
          margin: 0 !important;
        }
        .invoice-header {
          display: flex !important;
          justify-content: space-between !important;
          border-bottom: 2px solid #E5E7EB !important;
          padding-bottom: 20px !important;
          margin-bottom: 30px !important;
        }
        .logo-box h1 {
          color: #111111 !important;
          font-weight: 800 !important;
          font-size: 24px !important;
          margin: 0 0 4px 0 !important;
          letter-spacing: -0.5px !important;
        }
        .title-area {
          text-align: right !important;
        }
        .title-area h2 {
          font-size: 18px !important;
          color: #111111 !important;
          margin: 0 0 6px 0 !important;
          font-weight: 700 !important;
        }
        .meta-info {
          font-size: 12px !important;
          color: #6B7280 !important;
        }
        .columns-grid {
          display: grid !important;
          grid-template-columns: 1fr 1fr !important;
          gap: 40px !important;
          margin-bottom: 40px !important;
        }
        .col-section h3 {
          font-size: 12px !important;
          font-weight: 800 !important;
          text-transform: uppercase !important;
          color: #6B7280 !important;
          margin: 0 0 10px 0 !important;
          border-bottom: 1px solid #E5E7EB !important;
          padding-bottom: 4px !important;
        }
        .col-details {
          font-size: 12px !important;
          color: #111111 !important;
        }
        .col-details strong {
          display: block !important;
          font-size: 13px !important;
          margin-bottom: 4px !important;
        }
        .items-table {
          width: 100% !important;
          border-collapse: collapse !important;
          margin-bottom: 30px !important;
        }
        .items-table th {
          font-size: 11px !important;
          text-transform: uppercase !important;
          font-weight: 800 !important;
          color: #6B7280 !important;
          background-color: #F8F9FA !important;
          border-top: 1px solid #E5E7EB !important;
          border-bottom: 2px solid #E5E7EB !important;
          padding: 10px !important;
          text-align: left !important;
        }
        .items-table td {
          border-bottom: 1px solid #F8F9FA !important;
          padding: 10px !important;
          font-size: 12px !important;
        }
        .financials-box {
          display: flex !important;
          justify-content: flex-end !important;
          margin-bottom: 40px !important;
        }
        .financials-table {
          width: 300px !important;
          border-collapse: collapse !important;
        }
        .financials-table td {
          padding: 6px 10px !important;
          font-size: 12px !important;
        }
        .financials-table .total-row {
          background-color: #111111 !important;
          color: #ffffff !important;
          font-weight: bold !important;
          font-size: 14px !important;
        }
        .financials-table .total-row td {
          padding: 10px !important;
        }
        .bank-instructions {
          background-color: #F8F9FA !important;
          border: 1px dashed #E5E7EB !important;
          border-radius: 8px !important;
          padding: 15px !important;
          font-size: 11px !important;
          margin-top: 50px !important;
        }
        .bank-instructions h4 {
          margin: 0 0 5px 0 !important;
          font-weight: bold !important;
          color: #111111 !important;
        }
        .footer-section {
          margin-top: 60px !important;
          text-align: center !important;
          font-size: 11px !important;
          color: #9CA3AF !important;
          border-top: 1px solid #E5E7EB !important;
          padding-top: 20px !important;
        }
      }
    `;
    
    contentHtml = `
      <div class="invoice-header">
        <div class="logo-box">
          <h1>${business.name}</h1>
          <div class="meta-info">
            <div>${storeAddress}</div>
            <div>Tel: ${storePhone}</div>
            ${business.email ? `<div>Email: ${business.email}</div>` : ''}
            ${business.taxId ? `<div>NUIT: ${business.taxId}</div>` : ''}
          </div>
        </div>
        <div class="title-area">
          <h2>FACTURA COMERCIAL</h2>
          <div class="meta-info">
            <strong>Ref: #${invoice.invoiceNumber}</strong><br>
            Data Emissão: ${docDate}
          </div>
        </div>
      </div>

      <div class="columns-grid">
        <div class="col-section">
          <h3>Facturado a:</h3>
          <div class="col-details">
            <strong>${invoice.customerName || 'Cliente Geral'}</strong>
            ${invoice.customerPhone ? `<div>Tel: ${invoice.customerPhone}</div>` : ''}
            ${invoice.customerEmail ? `<div>Email: ${invoice.customerEmail}</div>` : ''}
            ${invoice.deliveryAddress ? `<div>Endereço: ${invoice.deliveryAddress}</div>` : ''}
          </div>
        </div>
        <div class="col-section">
          <h3>Detalhes de Emissão:</h3>
          <div class="col-details">
            ${invoice.paymentTerms ? `<div><strong>Condições:</strong> ${invoice.paymentTerms}</div>` : ''}
          </div>
        </div>
      </div>

      <table class="items-table">
        <thead>
          <tr>
            <th>Descrição do Artigo / Serviço</th>
            <th style="text-align: center; width: 80px;">Qtd</th>
            <th style="text-align: right; width: 120px;">Preço Unit.</th>
            <th style="text-align: right; width: 140px;">Total (MZN)</th>
          </tr>
        </thead>
        <tbody>
          ${invoice.items.map(item => {
            const name = item.name || item.description || 'Artigo';
            const priceCharged = (item as any).finalUnitPrice !== undefined ? Number((item as any).finalUnitPrice) : Number(item.price);
            const totalCost = (item.quantity * priceCharged).toLocaleString('pt-MZ', { minimumFractionDigits: 2 }) + ' MT';
            const formattedPrice = priceCharged.toLocaleString('pt-MZ', { minimumFractionDigits: 2 }) + ' MT';
            return `
              <tr>
                <td>${name}</td>
                <td align="center">${item.quantity}</td>
                <td align="right">${formattedPrice}</td>
                <td align="right">${totalCost}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>

      <div class="financials-box">
        <table class="financials-table">
          <tr>
            <td>Subtotal:</td>
            <td align="right" style="font-weight: 500;">${formattedSubtotal}</td>
          </tr>
          ${(invoice.globalAjuste || 0) > 0 ? `
          <tr style="color: #0B1F4D; font-weight: bold;">
            <td>Ajuste / Desconto Global:</td>
            <td align="right">- ${formattedAjusteGlobal}</td>
          </tr>
          ` : ''}
          <tr class="total-row">
            <td>TOTAL GERAL:</td>
            <td align="right">${formattedTotal}</td>
          </tr>
        </table>
      </div>

      <!-- Informational Breakdown Block requested by User -->
      <div style="margin-bottom: 20px; max-width: 300px; margin-left: auto;">
        <table class="financials-table" style="font-weight: normal; border: 1px dashed #E5E7EB; border-radius: 4px; width: 100%;">
          <tr>
            <td style="font-size: 11px; padding: 4px 10px; color: #6B7280;">Produtos (sem IVA):</td>
            <td align="right" style="font-size: 11px; padding: 4px 10px; font-weight: 500;">${formattedSemIva}</td>
          </tr>
          <tr>
            <td style="font-size: 11px; padding: 4px 10px; color: #6B7280;">IVA incluído (${userTaxRate}%):</td>
            <td align="right" style="font-size: 11px; padding: 4px 10px; font-weight: 500;">${formattedIvaValue}</td>
          </tr>
          <tr style="font-weight: bold; background-color: #F8F9FA; border-top: 1px solid #E5E7EB;">
            <td style="font-size: 11px; padding: 6px 10px; color: #0B1F4D;">Total confirmado:</td>
            <td align="right" style="font-size: 11px; padding: 6px 10px; color: #0B1F4D;">${formattedTotal}</td>
          </tr>
          ${(invoice.outstandingBalance || 0) <= 0 ? `
          <tr style="background-color: #FFFFFF;">
            <td colspan="2" style="font-weight: bold; text-align: center; color: #0B1F4D; font-size: 10px; padding: 4px;">Cash Sales</td>
          </tr>
          ` : ''}
        </table>
      </div>

      ${totalSavings > 0 ? `
      <div style="font-family: 'Courier New', Courier, monospace; font-size: 11px; line-height: 1.4; margin-top: 15px; margin-bottom: 15px; max-width: 320px; margin-left: auto; border: 1px dashed #E5E7EB; padding: 10px; border-radius: 4px;">
        <div style="font-weight: bold; text-align: center; margin-bottom: 5px;">POUPANÇA DO CLIENTE</div>
        <div style="border-top: 1px dashed #E5E7EB; margin: 4px 0;"></div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
          <span>Preço de tabela (máx.):</span>
          <span>${totalHighest.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} MT</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
          <span>Preço cobrado:</span>
          <span>${totalCharged.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} MT</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-weight: bold; color: #0B1F4D; margin-top: 5px;">
          <span>Desconto total:</span>
          <span>&minus; ${totalSavings.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} MT &nbsp;(${discountPercent.toFixed(1)}%)</span>
        </div>
        <div style="border-top: 1px dashed #E5E7EB; margin: 4px 0;"></div>
      </div>
      ` : ''}

      <div class="bank-instructions">
        <h4>Instruções de Pagamento:</h4>
        <div>Favor efetuar a transferência bancária e enviar o comprovativo indicando a referência #${invoice.invoiceNumber}.</div>
        <div style="margin-top:5px; font-weight:bold;">Mpesa: +258 84 000 0000 | Conta BIM: 123456789</div>
      </div>

      <div class="footer-section">
        Obrigado pela sua preferência! - Sabush System ERP
      </div>

      <div style="margin-top: 25px; background-color: #E9CC85; border: 1.5px solid #D4AF37; border-radius: 8px; padding: 12px; text-align: center; color: #D4AF37; font-family: sans-serif;">
        <strong style="font-size: 11.5px; display: block; margin-bottom: 4px; text-transform: uppercase; font-weight: bold; font-family: Arial, Helvetica, sans-serif;">⚠️ AVISO LEGAL — ESTE DOCUMENTO NÃO SERVE DE RECIBO FISCAL OFICIAL</strong>
        <div style="font-size: 10px; line-height: 1.4; font-family: Arial, Helvetica, sans-serif;">
          Para efeitos fiscais, exija a sua Factura/Recibo nos termos do Regulamento do IVA de Moçambique (Lei nº 32/2007).<br>
          Este documento serve apenas como comprovativo interno de gestão comercial.
        </div>
      </div>
    `;
  }
  
  triggerPhysicalPrint(styles, contentHtml, `Recibo POS #${invoice.invoiceNumber}`);
}

export function printPaymentReceiptHTML(
  payment: {
    id?: string;
    amount: number;
    method: string;
    reference?: string;
    date: string;
  },
  customerName: string,
  customerBalance: number,
  business: PrintBusinessInfo,
  printerType: 'standard' | 'thermal_80mm' | 'thermal_58mm' = 'standard'
) {
  const storeAddress = business.address && business.address.trim() ? business.address : 'Av. de Angola, Maputo, Moçambique';
  const storePhone = business.phone && business.phone.trim() ? business.phone : '+258 84 000 0000';
  
  const docDate = formatDateInTimezone(payment.date, business.timezone || 'Africa/Maputo');
  const receiptNum = payment.id ? payment.id.slice(-6).toUpperCase() : Math.random().toString(36).substring(2, 8).toUpperCase();
  const paymentMethodLabel = payment.method === 'cash' ? 'DINHEIRO' : payment.method === 'card' ? 'CARTÃO' : payment.method === 'mobile_money' ? 'MOBILE MONEY' : payment.method === 'bank_transfer' ? 'TRANSFERÊNCIA BANCÁRIA' : payment.method.toUpperCase();
  
  const formattedAmount = payment.amount.toLocaleString('pt-MZ', { minimumFractionDigits: 2 }) + ' MT';
  const formattedBalance = customerBalance.toLocaleString('pt-MZ', { minimumFractionDigits: 2 }) + ' MT';

  const isThermal = printerType === 'thermal_80mm' || printerType === 'thermal_58mm';
  const isSmall = printerType === 'thermal_58mm';
  
  let styles = '';
  let contentHtml = '';
  
  if (isThermal) {
    styles = `
      @media screen {
        #print-only-container {
          display: none !important;
        }
      }
      @page {
        size: ${isSmall ? '58mm auto' : '80mm auto'};
        margin: 0mm !important;
      }
      @media print {
        body > :not(#print-only-container) {
          display: none !important;
        }
        #print-only-container {
          display: block !important;
          position: absolute !important;
          left: 0 !important;
          top: 0 !important;
          width: 100% !important;
          max-width: ${isSmall ? '54mm' : '76mm'} !important;
          background: white !important;
          color: #000 !important;
          font-family: 'Courier New', Courier, monospace !important;
          font-size: ${isSmall ? '11px' : '13px'} !important;
          line-height: 1.35 !important;
          padding: ${isSmall ? '4px 6px' : '8px 12px'} !important;
          margin: 0 !important;
        }
        .text-center { text-align: center !important; }
        .text-right { text-align: right !important; }
        .font-bold { font-weight: bold !important; }
        .divider {
          border-top: 1px dashed #000 !important;
          margin: 6px 0 !important;
        }
        .double-divider {
          border-top: 2px double #000 !important;
          margin: 6px 0 !important;
        }
        .mb-1 { margin-bottom: 2px !important; }
        .mb-2 { margin-bottom: 4px !important; }
        .header-title {
          font-size: ${isSmall ? '14px' : '18px'} !important;
          font-weight: bold !important;
          text-transform: uppercase !important;
          letter-spacing: 0.5px !important;
        }
        .table {
          width: 100% !important;
          border-collapse: collapse !important;
        }
        .table td {
          padding: 3px 0 !important;
          font-size: ${isSmall ? '11px' : '12px'} !important;
        }
        .legal-disclaimer {
          border-top: 2px solid #000 !important;
          border-bottom: 2px solid #000 !important;
          margin: 8px 0 !important;
          padding: 6px 4px !important;
          text-align: center !important;
          font-weight: 700 !important;
          font-size: 11px !important;
          line-height: 1.5 !important;
          text-transform: uppercase !important;
          letter-spacing: 0.3px !important;
        }
        .legal-disclaimer .title {
          font-size: 12px !important;
          font-weight: 900 !important;
          margin-bottom: 4px !important;
        }
      }
    `;
    
    contentHtml = `
      <div class="text-center mb-1">
        <div class="header-title">${business.name}</div>
        <div class="mb-1">${storeAddress}</div>
        <div>Cel/Tel: ${storePhone}</div>
        ${business.taxId ? `<div>NUIT: ${business.taxId}</div>` : ''}
      </div>

      <div class="divider"></div>

      <div class="text-center mb-2" style="font-weight: bold; font-size: ${isSmall ? '11px' : '13px'};">
        RECIBO DE PAGAMENTO
      </div>

      <div class="mb-2">
        <div><strong>N°. RECIBO:</strong> #${receiptNum}</div>
        <div><strong>DATA PGTO:</strong> ${docDate}</div>
        <div><strong>CLIENTE:</strong> ${customerName}</div>
      </div>

      <div class="divider"></div>

      <table class="table" style="font-weight: bold;">
        <tr>
          <td>VALOR RECEBIDO:</td>
          <td align="right" style="font-size: ${isSmall ? '11px' : '13px'};">${formattedAmount}</td>
        </tr>
        <tr>
          <td>MEIO DE PGTO:</td>
          <td align="right">${paymentMethodLabel}</td>
        </tr>
        ${payment.reference ? `
        <tr>
          <td>REFERÊNCIA:</td>
          <td align="right">${payment.reference}</td>
        </tr>
        ` : ''}
        <tr class="divider-row">
          <td colspan="2"><div class="divider" style="margin: 3px 0 !important;"></div></td>
        </tr>
        <tr style="color: #000;">
          <td>DÍVIDA RESTANTE:</td>
          <td align="right">${formattedBalance}</td>
        </tr>
      </table>

      <div class="double-divider"></div>

      <div class="text-center" style="font-style: italic; margin-top: 10px;">
        Obrigado pelo seu pagamento!<br>
        Sabush System ERP
      </div>

      <div class="legal-disclaimer">
        ================================<br>
        <span class="title">AVISO LEGAL / LEGAL NOTICE</span><br>
        ================================<br>
        ESTE DOCUMENTO NÃO SERVE DE<br>
        RECIBO FISCAL OFICIAL.<br>
        Para efeitos fiscais, exija a<br>
        sua Factura/Recibo nos termos<br>
        do Regulamento do IVA de<br>
        Moçambique (Lei nº 32/2007).<br>
        ================================
      </div>
      
      <div style="height: 30px;"></div>
    `;
  } else {
    // Standard A4 Layout
    styles = `
      @media screen {
        #print-only-container {
          display: none !important;
        }
      }
      @page {
        size: A4;
        margin: 12mm;
      }
      @media print {
        body > :not(#print-only-container) {
          display: none !important;
        }
        #print-only-container {
          display: block !important;
          position: absolute !important;
          left: 0 !important;
          top: 0 !important;
          width: 100% !important;
          background: white !important;
          color: #0B1F4D !important;
          font-family: Arial, sans-serif !important;
          font-size: 13px !important;
          line-height: 1.5 !important;
          padding: 40px !important;
          margin: 0 !important;
        }
        .invoice-header {
          display: flex !important;
          justify-content: space-between !important;
          border-bottom: 2px solid #E5E7EB !important;
          padding-bottom: 20px !important;
          margin-bottom: 30px !important;
        }
        .logo-box h1 {
          color: #111111 !important;
          font-weight: 800 !important;
          font-size: 24px !important;
          margin: 0 0 4px 0 !important;
          letter-spacing: -0.5px !important;
        }
        .title-area {
          text-align: right !important;
        }
        .title-area h2 {
          font-size: 18px !important;
          color: #111111 !important;
          margin: 0 0 6px 0 !important;
          font-weight: 700 !important;
        }
        .meta-info {
          font-size: 12px !important;
          color: #6B7280 !important;
        }
        .rec-card {
          background-color: #F8F9FA !important;
          border: 1px solid #E5E7EB !important;
          border-radius: 16px !important;
          padding: 24px !important;
          margin-bottom: 30px !important;
        }
        .rec-grid {
          display: grid !important;
          grid-template-columns: 1fr 1fr !important;
          gap: 20px !important;
        }
        .rec-item {
          font-size: 13px !important;
          color: #6B7280 !important;
        }
        .rec-item strong {
          color: #111111 !important;
        }
        .amount-highlight {
          grid-column: span 2 !important;
          background-color: #FFFFFF !important;
          border: 1px solid #bbf7d0 !important;
          border-radius: 12px !important;
          padding: 16px !important;
          margin-top: 10px !important;
          display: flex !important;
          justify-content: space-between !important;
          align-items: center !important;
        }
        .amount-big {
          font-size: 24px !important;
          font-weight: 950 !important;
          color: #166534 !important;
          font-family: monospace !important;
        }
        .footer-section {
          margin-top: 80px !important;
          text-align: center !important;
          font-size: 11px !important;
          color: #9CA3AF !important;
          border-top: 1px solid #E5E7EB !important;
          padding-top: 20px !important;
        }
      }
    `;
    
    contentHtml = `
      <div class="invoice-header">
        <div class="logo-box">
          <h1>${business.name}</h1>
          <div class="meta-info">
            <div>${storeAddress}</div>
            <div>Tel: ${storePhone}</div>
            ${business.email ? `<div>Email: ${business.email}</div>` : ''}
            ${business.taxId ? `<div>NUIT: ${business.taxId}</div>` : ''}
          </div>
        </div>
        <div class="title-area">
          <h2>RECIBO DE PAGAMENTO</h2>
          <div class="meta-info">
            <strong>Recibo N°: #${receiptNum}</strong><br>
            Data: ${docDate}<br>
            Operação: Amortização de Dívida / Pagamento
          </div>
        </div>
      </div>

      <div class="rec-card animate-in fade-in">
        <div class="rec-grid">
          <div class="rec-item">
            <strong>Cliente:</strong>
            <div>${customerName}</div>
          </div>
          <div class="rec-item">
            <strong>Meio de Pagamento utilizado:</strong>
            <div>${paymentMethodLabel}</div>
          </div>
          ${payment.reference ? `
          <div class="rec-item" style="grid-column: span 2;">
            <strong>Referência de Transação:</strong>
            <div>${payment.reference}</div>
          </div>
          ` : ''}
          
          <div class="amount-highlight">
            <div>
              <strong style="color: #166534; font-size: 14px; text-transform: uppercase;">Valor Pago Efectivado</strong>
              <div style="font-size: 11px; color: #166534; font-weight: 500;">Obrigado pelo seu pagamento</div>
            </div>
            <div class="amount-big">${formattedAmount}</div>
          </div>
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end; font-size: 14px; font-weight: bold; padding: 10px 24px;">
        <span style="color: #6B7280; margin-right: 20px;">Diferença de Saldo Pendente (Saldo Devedor actual):</span>
        <span style="color: #ef4444; font-family: monospace;">${formattedBalance}</span>
      </div>

      <div class="footer-section">
        Este recibo serve de comprovativo oficial de liquidação de saldo devedor. gerado pelo Sabush System ERP.
      </div>

      <div style="margin-top: 25px; background-color: #E9CC85; border: 1.5px solid #D4AF37; border-radius: 8px; padding: 12px; text-align: center; color: #D4AF37; font-family: sans-serif;">
        <strong style="font-size: 11.5px; display: block; margin-bottom: 4px; text-transform: uppercase; font-weight: bold; font-family: Arial, Helvetica, sans-serif;">⚠️ AVISO LEGAL — ESTE DOCUMENTO NÃO SERVE DE RECIBO FISCAL OFICIAL</strong>
        <div style="font-size: 10px; line-height: 1.4; font-family: Arial, Helvetica, sans-serif;">
          Para efeitos fiscais, exija a sua Factura/Recibo nos termos do Regulamento do IVA de Moçambique (Lei nº 32/2007).<br>
          Este documento serve apenas como comprovativo interno de gestão comercial.
        </div>
      </div>
    `;
  }
  
  triggerPhysicalPrint(styles, contentHtml, `Recibo #${receiptNum}`);
}

export function downloadPaymentReceiptHTML(
  payment: {
    id?: string;
    amount: number;
    method: string;
    reference?: string;
    date: string;
  },
  customerName: string,
  customerBalance: number,
  business: PrintBusinessInfo,
  printerType: 'standard' | 'thermal_80mm' | 'thermal_58mm' = 'standard'
) {
  const storeAddress = business.address && business.address.trim() ? business.address : 'Av. de Angola, Maputo, Moçambique';
  const storePhone = business.phone && business.phone.trim() ? business.phone : '+258 84 000 0000';

  const docDate = formatDateInTimezone(payment.date, business.timezone || 'Africa/Maputo');
  const receiptNum = payment.id ? payment.id.slice(-6).toUpperCase() : Math.random().toString(36).substring(2, 8).toUpperCase();
  const paymentMethodLabel = payment.method === 'cash' ? 'DINHEIRO' : payment.method === 'card' ? 'CARTÃO' : payment.method === 'mobile_money' ? 'MOBILE MONEY' : payment.method === 'bank_transfer' ? 'TRANSFERÊNCIA BANCÁRIA' : payment.method.toUpperCase();
  
  const formattedAmount = payment.amount.toLocaleString('pt-MZ', { minimumFractionDigits: 2 }) + ' MT';
  const formattedBalance = customerBalance.toLocaleString('pt-MZ', { minimumFractionDigits: 2 }) + ' MT';

  const isThermal = printerType === 'thermal_80mm' || printerType === 'thermal_58mm';
  const isSmall = printerType === 'thermal_58mm';
  
  let styles = '';
  let contentHtml = '';
  
  if (isThermal) {
    styles = `
      body {
        font-family: 'Courier New', Courier, monospace;
        font-size: ${isSmall ? '10px' : '12px'};
        line-height: 1.25;
        color: #000;
        background-color: #fff;
        margin: 20px auto;
        padding: ${isSmall ? '4px' : '10px'};
        width: ${isSmall ? '54mm' : '76mm'};
        border: 1px solid #ccc;
      }
      .text-center { text-align: center; }
      .text-right { text-align: right; }
      .font-bold { font-weight: bold; }
      .divider {
        border-top: 1px dashed #000;
        margin: 6px 0;
      }
      .double-divider {
        border-top: 2px double #000;
        margin: 6px 0;
      }
      .mb-1 { margin-bottom: 2px; }
      .mb-2 { margin-bottom: 4px; }
      .header-title {
        font-size: ${isSmall ? '13px' : '16px'};
        font-weight: bold;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .table {
        width: 100%;
        border-collapse: collapse;
      }
      .table td {
        padding: 2px 0;
        font-size: ${isSmall ? '10px' : '11px'};
      }
      .legal-disclaimer {
        border-top: 2px solid #000;
        border-bottom: 2px solid #000;
        margin: 8px 0;
        padding: 6px 4px;
        text-align: center;
        font-weight: 700;
        font-size: 11px;
        line-height: 1.5;
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }
      .legal-disclaimer .title {
        font-size: 12px;
        font-weight: 900;
        margin-bottom: 4px;
      }
      @media print {
        body {
          border: none;
          margin: 0;
        }
      }
    `;
    
    contentHtml = `
      <div class="text-center mb-1">
        <div class="header-title">${business.name}</div>
        <div class="mb-1">${storeAddress}</div>
        <div>Cel: ${storePhone}</div>
        ` + (business.taxId ? `<div>NUIT: ${business.taxId}</div>` : '') + `
      </div>

      <div class="divider"></div>

      <div class="text-center mb-2" style="font-weight: bold; font-size: ${isSmall ? '11px' : '13px'};">
        RECIBO DE PAGAMENTO
      </div>

      <div class="mb-2">
        <div><strong>N°. RECIBO:</strong> #${receiptNum}</div>
        <div><strong>DATA PGTO:</strong> ${docDate}</div>
        <div><strong>CLIENTE:</strong> ${customerName}</div>
      </div>

      <div class="divider"></div>

      <table class="table" style="font-weight: bold;">
        <tr>
          <td>VALOR RECEBIDO:</td>
          <td align="right" style="font-size: ${isSmall ? '11px' : '13px'};">${formattedAmount}</td>
        </tr>
        <tr>
          <td>MEIO DE PGTO:</td>
          <td align="right">${paymentMethodLabel}</td>
        </tr>
        ` + (payment.reference ? `
        <tr>
          <td>REFERÊNCIA:</td>
          <td align="right">${payment.reference}</td>
        </tr>
        ` : '') + `
        <tr class="divider-row">
          <td colspan="2"><div class="divider" style="margin: 3px 0 !important;"></div></td>
        </tr>
        <tr style="color: #000;">
          <td>DÍVIDA RESTANTE:</td>
          <td align="right">${formattedBalance}</td>
        </tr>
      </table>

      <div class="double-divider"></div>

      <div class="text-center" style="font-style: italic; margin-top: 10px;">
        Obrigado pelo seu pagamento!<br>
        Sabush System ERP
      </div>

      <div class="legal-disclaimer">
        ================================<br>
        <span class="title">AVISO LEGAL / LEGAL NOTICE</span><br>
        ================================<br>
        ESTE DOCUMENTO NÃO SERVE DE<br>
        RECIBO FISCAL OFICIAL.<br>
        Para efeitos fiscais, exija a<br>
        sua Factura/Recibo nos termos<br>
        do Regulamento do IVA de<br>
        Moçambique (Lei nº 32/2007).<br>
        ================================
      </div>
    `;
  } else {
    styles = `
      body {
        background-color: #F8F9FA;
        color: #0B1F4D;
        font-family: Arial, sans-serif;
        font-size: 13px;
        line-height: 1.5;
        padding: 40px;
        margin: 40px auto;
        max-width: 800px;
        border: 1px solid #E5E7EB;
        border-radius: 20px;
        box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
      }
      .invoice-header {
        display: flex;
        justify-content: space-between;
        border-bottom: 2px solid #E5E7EB;
        padding-bottom: 20px;
        margin-bottom: 30px;
      }
      .logo-box h1 {
        color: #111111;
        font-weight: 800;
        font-size: 24px;
        margin: 0 0 4px 0;
        letter-spacing: -0.5px;
      }
      .title-area {
        text-align: right;
      }
      .title-area h2 {
        font-size: 18px;
        color: #111111;
        margin: 0 0 6px 0;
        font-weight: 700;
      }
      .meta-info {
        font-size: 12px;
        color: #6B7280;
      }
      .rec-card {
        background-color: #F8F9FA;
        border: 1px solid #E5E7EB;
        border-radius: 16px;
        padding: 24px;
        margin-bottom: 30px;
      }
      .rec-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
      }
      .rec-item {
        font-size: 13px;
        color: #6B7280;
      }
      .rec-item strong {
        color: #111111;
      }
      .amount-highlight {
        grid-column: span 2;
        background-color: #FFFFFF;
        border: 1px solid #bbf7d0;
        border-radius: 12px;
        padding: 16px;
        margin-top: 10px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .amount-big {
        font-size: 24px;
        font-weight: 950;
        color: #166534;
        font-family: monospace;
      }
      .footer-section {
        margin-top: 80px;
        text-align: center;
        font-size: 11px;
        color: #9CA3AF;
        border-top: 1px solid #E5E7EB;
        padding-top: 20px;
      }
      @media print {
        body {
          border: none;
          box-shadow: none;
          margin: 0;
          padding: 20px;
        }
      }
    `;
    
    contentHtml = `
      <div class="invoice-header">
        <div class="logo-box">
          <h1>${business.name}</h1>
          <div class="meta-info">
            <div>${storeAddress}</div>
            <div>Tel: ${storePhone}</div>
            ` + (business.email ? `<div>Email: ${business.email}</div>` : '') + `
            ` + (business.taxId ? `<div>NUIT: ${business.taxId}</div>` : '') + `
          </div>
        </div>
        <div class="title-area">
          <h2>RECIBO DE PAGAMENTO</h2>
          <div class="meta-info">
            <strong>Recibo N°: #${receiptNum}</strong><br>
            Data: ${docDate}<br>
            Operação: Amortização de Dívida / Pagamento
          </div>
        </div>
      </div>

      <div class="rec-card animate-in fade-in">
        <div class="rec-grid">
          <div class="rec-item">
            <strong>Cliente:</strong>
            <div>${customerName}</div>
          </div>
          <div class="rec-item">
            <strong>Meio de Pagamento utilizado:</strong>
            <div>${paymentMethodLabel}</div>
          </div>
          ` + (payment.reference ? `
          <div class="rec-item" style="grid-column: span 2;">
            <strong>Referência de Transação:</strong>
            <div>${payment.reference}</div>
          </div>
          ` : '') + `
          
          <div class="amount-highlight">
            <div>
              <strong style="color: #166534; font-size: 14px; text-transform: uppercase;">Valor Pago Efectivado</strong>
              <div style="font-size: 11px; color: #166534; font-weight: 500;">Obrigado pelo seu pagamento</div>
            </div>
            <div class="amount-big">${formattedAmount}</div>
          </div>
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end; font-size: 14px; font-weight: bold; padding: 10px 24px;">
        <span style="color: #6B7280; margin-right: 20px;">Diferença de Saldo Pendente (Saldo Devedor actual):</span>
        <span style="color: #ef4444; font-family: monospace;">${formattedBalance}</span>
      </div>

      <div class="footer-section">
        Este recibo serve de comprovativo oficial de liquidação de saldo devedor. gerado pelo Sabush System ERP.
      </div>

      <div style="margin-top: 25px; background-color: #E9CC85; border: 1.5px solid #D4AF37; border-radius: 8px; padding: 12px; text-align: center; color: #D4AF37; font-family: sans-serif;">
        <strong style="font-size: 11.5px; display: block; margin-bottom: 4px; text-transform: uppercase; font-weight: bold; font-family: Arial, Helvetica, sans-serif;">⚠️ AVISO LEGAL — ESTE DOCUMENTO NÃO SERVE DE RECIBO FISCAL OFICIAL</strong>
        <div style="font-size: 10px; line-height: 1.4; font-family: Arial, Helvetica, sans-serif;">
          Para efeitos fiscais, exija a sua Factura/Recibo nos termos do Regulamento do IVA de Moçambique (Lei nº 32/2007).<br>
          Este documento serve apenas como comprovativo interno de gestão comercial.
        </div>
      </div>
    `;
  }

  const completeHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Recibo #${receiptNum}</title>
      <style>
        ${styles}
        @page {
          ${isThermal ? `size: ${isSmall ? '58mm auto' : '80mm auto'}; margin: 0mm;` : `size: A4; margin: 12mm;`}
        }
        @media print {
          .no-print { display: none !important; }
        }
      </style>
    </head>
    <body>
      <div class="no-print" style="max-width: 800px; margin: 20px auto; padding: 12px 24px; background-color: #FFFFFF; border: 1px solid #93B4F5; border-radius: 12px; color: #2563EB; font-weight: bold; display: flex; justify-content: space-between; align-items: center; font-family: sans-serif; font-size: 13px;">
        <span>📄 Este é o ficheiro de impressão do seu recibo. Pode salvá-lo ou imprimi-lo sem restrições.</span>
        <button onclick="window.print()" style="background-color: #2563EB; color: white; border: none; padding: 8px 18px; border-radius: 8px; font-weight: bold; cursor: pointer;">Imprimir Agora (Ctrl+P)</button>
      </div>
      ${contentHtml}
    </body>
    </html>
  `;

  const blob = new Blob([completeHtml], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Recibo_Pagamento_${receiptNum}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast.success("Recibo descarregado com sucesso! Abra o ficheiro para visualizar ou imprimir sem restrições.");
}

/**
 * Triggers physical test-print for printer diagnostics of Wi-Fi, Bluetooth or USB-cable receipt/page printers
 */
export function printTestPageHTML(
  printerType: 'standard' | 'thermal_80mm' | 'thermal_58mm',
  printerInterface: 'system' | 'usb_cable' | 'bluetooth' | 'wifi_network' = 'system',
  printerIpAddress: string = '',
  printerPort: string = '9100',
  businessName: string = 'SABUSH SYSTEM ERP'
) {
  const isThermal = printerType === 'thermal_80mm' || printerType === 'thermal_58mm';
  const isSmall = printerType === 'thermal_58mm';

  let styles = '';
  let contentHtml = '';

  if (isThermal) {
    styles = `
      @media screen {
        #print-only-container {
          display: none !important;
        }
      }
      @page {
        size: ${isSmall ? '58mm auto' : '80mm auto'};
        margin: 0mm !important;
      }
      @media print {
        body > :not(#print-only-container) {
          display: none !important;
        }
        #print-only-container {
          display: block !important;
          position: absolute !important;
          left: 0 !important;
          top: 0 !important;
          width: 100% !important;
          max-width: ${isSmall ? '54mm' : '76mm'} !important;
          background: white !important;
          color: #000 !important;
          font-family: 'Courier New', Courier, monospace !important;
          font-size: ${isSmall ? '11px' : '13px'} !important;
          line-height: 1.35 !important;
          padding: ${isSmall ? '4px 6px' : '8px 12px'} !important;
          margin: 0 !important;
        }
        .text-center { text-align: center !important; }
        .text-right { text-align: right !important; }
        .font-bold { font-weight: bold !important; }
        .divider {
          border-top: 1px dashed #000 !important;
          margin: 6px 0 !important;
        }
        .double-divider {
          border-top: 2px double #000 !important;
          margin: 6px 0 !important;
        }
        .mb-1 { margin-bottom: 2px !important; }
        .mb-2 { margin-bottom: 4px !important; }
        .header-title {
          font-size: ${isSmall ? '14px' : '18px'} !important;
          font-weight: bold !important;
          text-transform: uppercase !important;
          letter-spacing: 0.5px !important;
        }
      }
    `;

    contentHtml = `
      <div class="text-center">
        <span class="header-title">${businessName}</span><br/>
        <span class="font-bold">SABUSH SYSTEM ERP</span><br/>
        <span>TESTE DE CONEXÃO DE IMPRESSORA</span><br/>
        <span>================================</span>
      </div>
      <div class="divider"></div>
      <div>
        <span class="font-bold">Interface:</span> ${printerInterface === 'system' ? 'DIALOGO DO SISTEMA' : printerInterface === 'usb_cable' ? 'CABO USB / PORTA LOCAL' : printerInterface === 'bluetooth' ? 'BLUETOOTH SEM FIOS' : 'REDE WI-FI / IP NETWORK'}<br/>
        ${printerInterface === 'wifi_network' ? `<span class="font-bold">IP:</span> ${printerIpAddress || '192.168.1.100'}:${printerPort || '9100'}<br/>` : ''}
        <span class="font-bold">Template:</span> ${printerType === 'thermal_58mm' ? '58mm (Mini)' : '80mm (Padrão PT-MZ)'}<br/>
        <span class="font-bold">Status:</span> OPERACIONAL E CONECTADO<br/>
        <span class="font-bold">Data:</span> ${new Date().toLocaleString('pt-MZ')}<br/>
      </div>
      <div class="divider"></div>
      <div class="text-center font-bold">
        <span>*** SUCESSO ***</span><br/>
        <p style="margin: 4px 0; font-size: ${isSmall ? '9px' : '10px'}; font-weight: normal; line-height: 1.3;">
          A sua impressora física foi configurada com sucesso no Sabush System ERP. Pronto para emitir faturas de POS e talões.
        </p>
      </div>
      <div class="divider"></div>
      <div class="text-center" style="font-size: 8px;">
        <span>Obrigado por usar Sabush System!</span>
      </div>
    `;
  } else {
    // Standard A4 sheet
    styles = `
      @media screen {
        #print-only-container {
          display: none !important;
        }
      }
      @page {
        size: A4;
        margin: 12mm;
      }
      @media print {
        body > :not(#print-only-container) {
          display: none !important;
        }
        #print-only-container {
          display: block !important;
          background: white !important;
          color: #0B1F4D !important;
          font-family: system-ui, -apple-system, sans-serif !important;
          padding: 40px !important;
          margin: 0 !important;
        }
      }
      .test-card {
        border: 2px solid #E5E7EB;
        border-radius: 16px;
        padding: 32px;
        max-width: 650px;
        margin: 40px auto;
        background: #F8F9FA;
      }
      .test-header {
        border-bottom: 2px solid #E5E7EB;
        padding-bottom: 16px;
        margin-bottom: 24px;
        text-align: center;
      }
    `;

    contentHtml = `
      <div class="test-card">
        <div class="test-header">
          <h1 style="margin: 0; font-size: 24px; color: #0B1F4D;">SABUSH SYSTEM ERP</h1>
          <p style="margin: 4px 0 0; color: #6B7280; font-size: 14px;">Página de Teste da Impressora Comercial</p>
        </div>
        <div style="margin-bottom: 24px;">
          <h3 style="color: #0B1F4D; border-bottom: 1px solid #E5E7EB; padding-bottom: 8px;">Detalhes do Equipamento e Conexão</h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="padding: 8px 0; font-weight: bold; width: 180px; color: #6B7280;">Empresa:</td>
              <td style="padding: 8px 0; color: #111111;">${businessName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #6B7280;">Tipo de Template:</td>
              <td style="padding: 8px 0; color: #111111;">Standard A4 Sheet</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #6B7280;">Interface / Canal:</td>
              <td style="padding: 8px 0; color: #111111;">${printerInterface === 'system' ? 'DIALOGO DO SISTEMA' : printerInterface === 'usb_cable' ? 'CABO USB / PORTA LOCAL' : printerInterface === 'bluetooth' ? 'BLUETOOTH SEM FIOS' : 'REDE WI-FI / IP NETWORK'}</td>
            </tr>
            ${printerInterface === 'wifi_network' ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #6B7280;">Endereço de Rede IP:</td>
              <td style="padding: 8px 0; color: #111111; font-family: monospace;">${printerIpAddress || '192.168.1.100'}:${printerPort || '9100'}</td>
            </tr>` : ''}
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #6B7280;">Data do Teste:</td>
              <td style="padding: 8px 0; color: #111111;">${new Date().toLocaleString('pt-MZ')}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #6B7280;">Resultado:</td>
              <td style="padding: 8px 0; color: #10b981; font-weight: bold;">✓ SUCESSO - TOTALMENTE OPERATIVO</td>
            </tr>
          </table>
        </div>
        <div style="background-color: #F8F9FA; padding: 16px; border-radius: 8px; font-size: 13px; color: #6B7280;">
          <p style="margin: 0; font-weight: bold;">Recomendação de Conexão:</p>
          <ul style="margin: 8px 0 0; padding-left: 20px; line-height: 1.5;">
            <li>Para conexões de <strong>Cabo USB ou Bluetooth</strong>: Certifique-se de que a impressora está instalada no sistema operativo e selecionada na lista que aparece a seguir no diálogo de impressão do navegador.</li>
            <li>Para conexões em <strong>Rede Wi-Fi / IP</strong>: Certifique-se de que a impressora de rede está ligada na mesma subrede local e o IP inserido corresponde ao IP fixado nas configurações físicas do equipamento.</li>
          </ul>
        </div>
        <div style="text-align: center; margin-top: 32px; font-size: 11px; color: #9CA3AF;">
          SABUSH SYSTEM ERP • Todos os direitos reservados.
        </div>
      </div>
    `;
  }

  triggerPhysicalPrint(styles, contentHtml, `Página de Teste - ${businessName}`);
}
