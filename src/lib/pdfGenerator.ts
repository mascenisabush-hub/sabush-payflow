import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDateInTimezone, formatDateTimeInTimezone, convertNumberToWordsPt } from './utils';

export interface PDFCompanyInfo {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  nuit?: string; // Tax ID in Mozambique
  timezone?: string;
}

export function generateQuotationPDF(quotation: any, company: PDFCompanyInfo) {
  const doc = new jsPDF() as any;
  const margin = 15;
  
  // Header background accent
  doc.setFillColor(30, 41, 59); // Slate-800
  doc.rect(0, 0, 210, 40, 'F');

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(22);
  doc.text((company.name || 'SABUSH SYSTEM').toUpperCase(), margin, 18);
  doc.setFontSize(11);
  doc.setFont('Helvetica', 'normal');
  doc.text('COTACAO ONLINE', margin, 26);

  // Doc Number info
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(`${quotation.quotationNumber || 'QT-XXXX'}`, 195 - margin, 18, { align: 'right' });
  doc.setFontSize(9);
  doc.setFont('Helvetica', 'normal');
  const tz = company.timezone || 'Africa/Maputo';
  doc.text(`Data: ${formatDateInTimezone(quotation.createdAt, tz)}`, 195 - margin, 26, { align: 'right' });
  doc.text(`Validade: ${formatDateInTimezone(quotation.expiryDate, tz)}`, 195 - margin, 32, { align: 'right' });

  // Reset text color
  doc.setTextColor(51, 65, 85); // Slate-700

  // Company and Client Columns
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('EMISSOR (VENDEDOR):', margin, 52);
  doc.text('CLIENTE (INTERESSADO):', 110, 52);

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(9);
  
  // Sender Details
  const senderLines = [
    company.name || 'Sabush System ERP',
    company.address || 'Av. de Moçambique, Maputo',
    `Cel: ${company.phone || '+258 84 000 0000'}`,
    `Email: ${company.email || 'geral@sabush.com'}`,
    `NUIT: ${company.nuit || '400123456'}`
  ];
  let senderY = 58;
  senderLines.forEach(line => {
    doc.text(line, margin, senderY);
    senderY += 5;
  });

  // Client Details
  const clientLines = [
    quotation.customerName || quotation.customerId || 'Cliente Geral',
    `Email: ${quotation.customerEmail || 'Pendente'}`,
    `Tel: ${quotation.customerPhone || 'Pendente'}`,
    `Morada: ${quotation.deliveryAddress || 'Maputo, Moçambique'}`
  ];
  let clientY = 58;
  clientLines.forEach(line => {
    doc.text(line, 110, clientY);
    clientY += 5;
  });

  // Table Items
  const tableColumn = ["Descricao", "Qtd", "Preco Unit.", "Total (MZN)"];
  const tableRows: any[] = [];

  const items = quotation.items || [];
  items.forEach((item: any) => {
    const unitPrice = Number(item.price || item.onlinePrice || 0);
    const quantity = Number(item.quantity || 1);
    const rowData = [
      item.name || 'Artigo',
      quantity.toString(),
      `${unitPrice.toLocaleString('pt-MZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT`,
      `${(unitPrice * quantity).toLocaleString('pt-MZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT`
    ];
    tableRows.push(rowData);
  });

  // Subtotal, IVA, Total
  const subtotal = Number(quotation.total || 0);
  const iva = quotation.tax !== undefined ? Number(quotation.tax) : 0;
  const totalWithIva = subtotal + iva;

  autoTable(doc, {
    head: [tableColumn],
    body: tableRows,
    startY: Math.max(senderY, clientY) + 12,
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
    styles: { fontSize: 8.5, cellPadding: 3.5 },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 15, halign: 'center' },
      2: { cellWidth: 35, halign: 'right' },
      3: { cellWidth: 40, halign: 'right' }
    }
  });

  // Finance calculations box right aligned
  const finalY = doc.lastAutoTable.finalY + 12;
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(9);
  
  doc.text('Subtotal:', 140, finalY);
  doc.setFont('Helvetica', 'normal');
  doc.text(`${subtotal.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} MT`, 195 - margin, finalY, { align: 'right' });

  doc.setFont('Helvetica', 'bold');
  doc.text('IVA (17%):', 140, finalY + 6);
  doc.setFont('Helvetica', 'normal');
  doc.text(`${iva.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} MT`, 195 - margin, finalY + 6, { align: 'right' });

  doc.setFillColor(241, 245, 249);
  doc.rect(135, finalY + 10, 60, 10, 'F');
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  doc.text('TOTAL:', 140, finalY + 16);
  doc.text(`${totalWithIva.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} MT`, 195 - margin, finalY + 16, { align: 'right' });

  // Disclaimers and Signatures
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(8);
  doc.setFont('Helvetica', 'normal');
  doc.text('Condicoes Gerais: Esta cotacao serve apenas como proposta comercial, valida', margin, finalY + 30);
  doc.text('pelo periodo indicado acima. Sujeito a alteracoes de stock no momento da confirmacao.', margin, finalY + 34);

  doc.setDrawColor(203, 213, 225);
  doc.line(margin, finalY + 55, margin + 50, finalY + 55);
  doc.line(130, finalY + 55, 130 + 50, finalY + 55);

  doc.text('Assinatura Cliente', margin + 25, finalY + 60, { align: 'center' });
  doc.text('Sabush System (Digital)', 130 + 25, finalY + 60, { align: 'center' });

  // Apply legal disclaimer to EVERY page of the Quotation PDF
  const pageCount = doc.getNumberOfPages();
  const pageHeight = 297;
  const pageWidthVal = 210;
  
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const disclaimerY = pageHeight - 30;

    // Background box
    doc.setFillColor(255, 243, 205); // light amber background
    doc.rect(14, disclaimerY - 8, pageWidthVal - 28, 22, 'F');

    // Border
    doc.setDrawColor(239, 159, 39); // amber border
    doc.setLineWidth(0.8);
    doc.rect(14, disclaimerY - 8, pageWidthVal - 28, 22, 'S');

    // Title text
    doc.setFontSize(9);
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(120, 53, 15); // dark amber text
    doc.text(
      '⚠️  AVISO LEGAL — ESTE DOCUMENTO É UMA COTAÇÃO E NÃO SERVE DE RECIBO FISCAL OFICIAL',
      pageWidthVal / 2,
      disclaimerY - 1,
      { align: 'center' }
    );

    // Body text
    doc.setFontSize(7.5);
    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(92, 45, 5);
    doc.text(
      'Para efeitos fiscais, exija a sua Factura/Recibo nos termos do Regulamento do IVA de Moçambique (Lei nº 32/2007).',
      pageWidthVal / 2,
      disclaimerY + 5,
      { align: 'center' }
    );

    doc.text(
      'Este documento serve apenas como comprovativo interno de gestão comercial.',
      pageWidthVal / 2,
      disclaimerY + 10,
      { align: 'center' }
    );
  }

  doc.save(`${quotation.quotationNumber || 'Cotacao'}.pdf`);
}

export function generateInvoicePDF(invoice: any, company: PDFCompanyInfo, options?: { save?: boolean }) {
  const doc = new jsPDF() as any;
  const margin = 15;
  const pageWidth = 210;
  
  // Header background accent (Vyapar Classic Navy Blue)
  doc.setFillColor(10, 48, 56); // Forest Teal / #0A1C38
  doc.rect(0, 0, pageWidth, 42, 'F');
  
  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(20);
  doc.text((company.name || 'SABUSH SYSTEM').toUpperCase(), margin, 18);
  
  doc.setFontSize(9);
  doc.setFont('Helvetica', 'normal');
  doc.setTextColor(229, 231, 235); // Light Gray
  doc.text('SISTEMA DE GESTÃO COMERCIAL (ERP) & POS', margin, 25);
  doc.text('FACTURA COMERCIAL / TAX INVOICE', margin, 31);
  
  // Document Badge Info on the Right Header
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text(`${invoice.invoiceNumber || 'FT-XXXX'}`, pageWidth - margin, 18, { align: 'right' });
  
  doc.setFontSize(9);
  doc.setFont('Helvetica', 'normal');
  doc.setTextColor(243, 244, 246);
  const tz = company.timezone || 'Africa/Maputo';
  doc.text(`Data de Emissão: ${formatDateInTimezone(invoice.date, tz)}`, pageWidth - margin, 26, { align: 'right' });
  doc.text(`Vencimento: ${formatDateInTimezone(invoice.dueDate || invoice.date, tz)}`, pageWidth - margin, 32, { align: 'right' });
  
  // Reset text color to slate
  doc.setTextColor(30, 41, 59); // Slate-800
  
  // 1. Dual Grid Outline: Emissor Box and Customer Box
  // We draw borders for very professional billing boxes
  const sectionY = 50;
  const boxHeight = 28;
  const boxWidth = 86;
  
  // EMISSOR Card (Left)
  doc.setFillColor(248, 250, 252); // Soft Gray bg
  doc.rect(margin, sectionY, boxWidth, boxHeight, 'FD');
  doc.setDrawColor(203, 213, 225); // Slate border
  doc.rect(margin, sectionY, boxWidth, boxHeight);
  
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('DADOS DO EMISSOR / MERCHANT:', margin + 4, sectionY + 5);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(company.name || 'Sabush System ERP', margin + 4, sectionY + 10);
  doc.text(`Morada: ${company.address || 'Maputo, Moçambique'}`, margin + 4, sectionY + 14);
  doc.text(`Cel: ${company.phone || '+258 84 000 0000'}`, margin + 4, sectionY + 18);
  doc.text(`Email: ${company.email || 'geral@sabush.com'}`, margin + 4, sectionY + 22);
  if (company.nuit) {
    doc.text(`NUIT: ${company.nuit}`, margin + 4, sectionY + 26);
  }
  
  // FACTURADO A Card (Right)
  const rightBoxX = pageWidth - margin - boxWidth;
  doc.setFillColor(248, 250, 252);
  doc.rect(rightBoxX, sectionY, boxWidth, boxHeight, 'FD');
  doc.rect(rightBoxX, sectionY, boxWidth, boxHeight);
  
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('FACTURADO A / BILLED TO:', rightBoxX + 4, sectionY + 5);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(invoice.customerName || invoice.customerId || 'Cliente Geral', rightBoxX + 4, sectionY + 10);
  doc.text(`Contacto: ${invoice.customerPhone || 'Pendente'}`, rightBoxX + 4, sectionY + 14);
  doc.text(`Email: ${invoice.customerEmail || 'Pendente'}`, rightBoxX + 4, sectionY + 18);
  doc.text(`Endereço: ${invoice.deliveryAddress || 'Moçambique'}`, rightBoxX + 4, sectionY + 22);
  doc.text(`Meio de Pagamento: ${invoice.paymentMethod || 'Dinheiro Vivo'}`, rightBoxX + 4, sectionY + 26);
  
  // Table columns and Rows
  const tableColumn = ["#", "Descrição do Artigo / Serviço", "Qtd", "Preço Unitário", "Desconto", "Total (MZN)"];
  const tableRows: any[] = [];
  
  const items = invoice.items || [];
  items.forEach((item: any, idx: number) => {
    const unitPrice = Number(item.price || item.onlinePrice || 0);
    const quantity = Number(item.quantity || 1);
    const discountVal = Number(item.discount || 0);
    const lineTotal = item.reverted ? 0 : (unitPrice * quantity) * (1 - discountVal / 100);
    
    const rowData = [
      (idx + 1).toString(),
      item.reverted ? `${item.name || item.description || 'Artigo'} (REVERTIDO)` : (item.name || item.description || 'Artigo'),
      quantity.toString(),
      `${unitPrice.toLocaleString('pt-MZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT`,
      discountVal > 0 && !item.reverted ? `${discountVal}%` : '-',
      item.reverted ? 'Revertido' : `${lineTotal.toLocaleString('pt-MZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT`
    ];
    tableRows.push(rowData);
  });
  
  // Calculations
  const isTaxInclusive = invoice.taxInclusive !== false;
  const total = Number(invoice.total || 0);
  const iva = Number(invoice.tax !== undefined ? invoice.tax : 0);
  const subtotal = isTaxInclusive ? (total - iva) : Number(invoice.subtotal !== undefined ? invoice.subtotal : (total - iva));
  
  autoTable(doc, {
    head: [tableColumn],
    body: tableRows,
    startY: sectionY + boxHeight + 8,
    theme: 'grid',
    headStyles: { fillColor: [10, 48, 56], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 8, cellPadding: 2.5 },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 15, halign: 'center' },
      3: { cellWidth: 35, halign: 'right' },
      4: { cellWidth: 20, halign: 'center' },
      5: { cellWidth: 35, halign: 'right' }
    }
  });
  
  // Financial subtotal and total calculations
  let currentY = doc.lastAutoTable.finalY + 8;
  
  // Check if we are running close to bottom. If so, create page-break to avoid overlap!
  if (currentY > 215) {
    doc.addPage();
    currentY = 20;
  }
  
  // Draw Outline Boxes below table for Bank accounts + Words (Left) and Financial breakdown (Right)
  const leftBlockWidth = 105;
  const rightBlockWidth = 70;
  const blockGap = 5;
  
  // Right Column calculations aligned
  const rightXLabel = pageWidth - margin - rightBlockWidth + 2;
  const rightXValue = pageWidth - margin - 2;
  
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  
  // Row: Subtotal
  doc.text('Subtotal (Sem IVA):', rightXLabel, currentY);
  doc.text(`${subtotal.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} MT`, rightXValue, currentY, { align: 'right' });
  
  // Row: General discount if any
  const globalDisc = Number(invoice.discountRate || 0);
  if (globalDisc > 0) {
    currentY += 5;
    const discountedBase = isTaxInclusive ? (total - iva) : subtotal;
    const discAmount = discountedBase * (globalDisc / 100);
    doc.text(`Desconto Geral (${globalDisc}%):`, rightXLabel, currentY);
    doc.text(`-${discAmount.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} MT`, rightXValue, currentY, { align: 'right' });
  }
  
  // Row: IVA
  currentY += 5;
  doc.text(`IVA (${invoice.taxRate !== undefined ? invoice.taxRate : 17}%):`, rightXLabel, currentY);
  doc.text(`${iva.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} MT`, rightXValue, currentY, { align: 'right' });
  
  // Highlight Box: Total Geral
  currentY += 4;
  doc.setFillColor(10, 48, 56); // Navy box
  doc.rect(pageWidth - margin - rightBlockWidth, currentY, rightBlockWidth, 8, 'F');
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text('TOTAL GERAL (MZN):', rightXLabel, currentY + 5.5);
  doc.text(`${total.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} MT`, rightXValue, currentY + 5.5, { align: 'right' });
  
  // Row: Amount received and pending balance
  doc.setTextColor(30, 41, 59); // reset
  currentY += 13;
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('Valor Recebido:', rightXLabel, currentY);
  doc.setFont('Helvetica', 'normal');
  doc.text(`${Number(invoice.amountPaid || 0).toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} MT`, rightXValue, currentY, { align: 'right' });
  
  const balance = Number(invoice.outstandingBalance || 0);
  if (balance > 0) {
    currentY += 5;
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(185, 28, 28); // Red for balance
    doc.text('Saldo em Dívida:', rightXLabel, currentY);
    doc.text(`${balance.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} MT`, rightXValue, currentY, { align: 'right' });
  }
  
  // Reset texts
  doc.setTextColor(30, 41, 59);
  
  // Left side info (inside currentY limits)
  // Let's draw: 1. Amount in words 2. Bank instructions 3. Brief T&C
  let leftY = doc.lastAutoTable.finalY + 8;
  
  // Words card
  doc.setFillColor(239, 246, 255); // Soft blue
  doc.setDrawColor(10, 48, 56); // Navy
  doc.rect(margin, leftY, leftBlockWidth, 11, 'FD');
  
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(10, 48, 56);
  doc.text('💳 TOTAL EM EXTENSO (AMOUNT IN WORDS):', margin + 3, leftY + 4);
  
  const wordString = convertNumberToWordsPt(total);
  doc.setFont('Helvetica', 'bolditalic');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  const splittedWords = doc.splitTextToSize(wordString, leftBlockWidth - 6);
  doc.text(splittedWords, margin + 3, leftY + 8.2);
  
  // Bank Information Box
  leftY += 14;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.rect(margin, leftY, leftBlockWidth, 18, 'FD');
  doc.rect(margin, leftY, leftBlockWidth, 18);
  
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(10, 48, 56);
  doc.text('🏦 INFORMAÇÕES DE CONTA BANCÁRIA:', margin + 3, leftY + 4);
  
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  doc.text(`Banco: Millennium BIM  |  Titular: ${company.name || 'Sabush System'}`, margin + 3, leftY + 8);
  doc.text('Conta MZN: 123456789  |  NIB: 0001 0000 1234 5678 9012 3', margin + 3, leftY + 12);
  doc.text(`Instrução: Adicione a Referência #${invoice.invoiceNumber} ao transferir.`, margin + 3, leftY + 16);
  
  // Terms and conditions
  leftY += 21;
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text('Termos & Condições:', margin, leftY);
  
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('1. Os bens continuam propriedade jurídica do emissor até integral pagamento da factura.', margin, leftY + 3.5);
  doc.text('2. Divergências físicas ou de garantia sobre as descrições devem ser notificadas em 48 horas.', margin, leftY + 6.5);
  
  // Signature block on the right part of layout, safely calculated
  let signatureY = Math.max(leftY + 15, currentY + 15);
  if (signatureY > 260) {
    doc.addPage();
    signatureY = 30;
  }
  
  doc.setDrawColor(203, 213, 225);
  const sigLineX = pageWidth - margin - 60;
  doc.line(sigLineX, signatureY + 20, pageWidth - margin, signatureY + 20);
  
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Para: ${company.name?.toUpperCase() || 'SABUSH SYSTEM'}`, sigLineX + 30, signatureY + 4, { align: 'center' });
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('Assinatura Autorizada & Carimbo', sigLineX + 30, signatureY + 24, { align: 'center' });
  
  // Footer
  doc.setTextColor(148, 163, 184);
  doc.setFontSize(8);
  doc.text('Agradecemos sinceramente pela sua preferência! - Processado por Sabush Enterprise ERP', pageWidth / 2, 285, { align: 'center' });
  
  // Apply legal disclaimer to EVERY page of the Invoice PDF
  const pageCount = doc.getNumberOfPages();
  const pageHeight = 297;
  
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const disclaimerY = pageHeight - 30; // 30mm from bottom of page

    // Background box
    doc.setFillColor(255, 243, 205); // light amber background
    doc.rect(14, disclaimerY - 8, pageWidth - 28, 22, 'F');

    // Border
    doc.setDrawColor(239, 159, 39); // amber border
    doc.setLineWidth(0.8);
    doc.rect(14, disclaimerY - 8, pageWidth - 28, 22, 'S');

    // Title text
    doc.setFontSize(9);
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(120, 53, 15); // dark amber text
    doc.text(
      '⚠️  AVISO LEGAL — ESTE DOCUMENTO NÃO SERVE DE RECIBO FISCAL OFICIAL',
      pageWidth / 2,
      disclaimerY - 1,
      { align: 'center' }
    );

    // Body text
    doc.setFontSize(7.5);
    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(92, 45, 5);
    doc.text(
      'Para efeitos fiscais, exija a sua Factura/Recibo nos termos do Regulamento do IVA de Moçambique (Lei nº 32/2007).',
      pageWidth / 2,
      disclaimerY + 5,
      { align: 'center' }
    );

    doc.text(
      'Este documento serve apenas como comprovativo interno de gestão comercial.',
      pageWidth / 2,
      disclaimerY + 10,
      { align: 'center' }
    );
  }

  if (options?.save !== false) {
    doc.save(`${invoice.invoiceNumber || 'Factura'}.pdf`);
  }
  return doc;
}

export function generatePaymentReceiptPDF(
  payment: {
    id?: string;
    amount: number;
    method: string;
    reference?: string;
    date: string | Date;
  },
  customerName: string,
  customerBalance: number,
  company: PDFCompanyInfo
) {
  const doc = new jsPDF() as any;
  const margin = 15;

  // Header background accent (Emerald Green to resemble positive cashflow)
  doc.setFillColor(16, 185, 129); // Emerald-500
  doc.rect(0, 0, 210, 40, 'F');

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(22);
  doc.text((company.name || 'SABUSH SYSTEM').toUpperCase(), margin, 18);
  doc.setFontSize(11);
  doc.setFont('Helvetica', 'normal');
  doc.text('RECIBO DE PAGAMENTO / AMORTIZACAO', margin, 26);

  // Recibo Number info
  const receiptNum = payment.id ? payment.id.slice(-6).toUpperCase() : Math.random().toString(36).substring(2, 8).toUpperCase();
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(`RECIBO #${receiptNum}`, 195 - margin, 18, { align: 'right' });
  doc.setFontSize(9);
  doc.setFont('Helvetica', 'normal');
  const dDate = payment.date ? new Date(payment.date) : new Date();
  const tz = company.timezone || 'Africa/Maputo';
  doc.text(`Data: ${formatDateInTimezone(dDate, tz)}`, 195 - margin, 26, { align: 'right' });

  // Reset text color
  doc.setTextColor(51, 65, 85);

  // Emissor and Cliente Columns
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('EMISSOR (RECEBEDOR):', margin, 52);
  doc.text('CLIENTE (DEVEDOR):', 110, 52);

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(9);

  // Sender Details
  const senderLines = [
    company.name || 'Sabush System ERP',
    company.address || 'Av. de Moçambique, Maputo',
    `Cel: ${company.phone || '+258 84 000 0000'}`,
    `Email: ${company.email || 'geral@sabush.com'}`,
    `NUIT: ${company.nuit || '400123456'}`
  ];
  let senderY = 58;
  senderLines.forEach(line => {
    doc.text(line, margin, senderY);
    senderY += 5;
  });

  // Client Details
  const clientLines = [
    customerName || 'Cliente Geral (Walk-in)',
    `Estado actual: Ativo`,
    `Data do Pagamento: ${formatDateInTimezone(dDate, tz)}`
  ];
  let clientY = 58;
  clientLines.forEach(line => {
    doc.text(line, 110, clientY);
    clientY += 5;
  });

  const nextY = Math.max(senderY, clientY) + 10;

  // Draw separator line
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, nextY, 195 - margin, nextY);

  // Draw a big box summarizing the payment transaction details
  const boxY = nextY + 8;
  doc.setFillColor(248, 250, 252); // light slate background
  doc.rect(margin, boxY, 180, 56, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.rect(margin, boxY, 180, 56, 'D');

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text('DETALHES DA AMORTIZACAO DE SALDO', margin + 8, boxY + 10);

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105); // slate-600

  // Left column variables inside the card
  doc.text('Metodo Utilizado:', margin + 12, boxY + 22);
  doc.setFont('Helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  const paymentMethodLabel = payment.method === 'cash' ? 'DINHEIRO' : payment.method === 'card' ? 'CARTAO' : payment.method === 'mobile_money' ? 'MOBILE MONEY' : payment.method === 'bank_transfer' ? 'TRANSFERENCIA BANCARIA' : payment.method.toUpperCase();
  doc.text(paymentMethodLabel, margin + 45, boxY + 22);

  doc.setFont('Helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Referencia / Codigo:', margin + 12, boxY + 30);
  doc.setFont('Helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(payment.reference || 'N/A', margin + 45, boxY + 30);

  doc.setFont('Helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Data Efectiva:', margin + 12, boxY + 38);
  doc.setFont('Helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(dDate.toLocaleString('pt-MZ'), margin + 45, boxY + 38);

  // Right column with big balance box
  doc.setFillColor(236, 253, 245); // light emerald-50 green
  doc.rect(130, boxY + 8, 55, 38, 'F');
  doc.setDrawColor(167, 243, 208); // emerald-200 border
  doc.rect(130, boxY + 8, 55, 38, 'D');

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(6, 95, 70); // emerald-800
  doc.text('VALOR PAGO', 157, boxY + 16, { align: 'center' });

  doc.setFontSize(13);
  doc.setTextColor(5, 150, 105); // emerald-600
  const formattedVal = payment.amount.toLocaleString('pt-MZ') + ' MT';
  doc.text(formattedVal, 157, boxY + 26, { align: 'center' });

  doc.setFontSize(7.5);
  doc.setTextColor(16, 185, 129); // emerald-500
  doc.text('LIQUIDADO', 157, boxY + 34, { align: 'center' });

  // Add outstanding debt remaining
  doc.setFontSize(9.5);
  doc.setFont('Helvetica', 'bold');
  doc.setTextColor(220, 38, 38); // red-600
  doc.text('SALDO DEVEDOR ACTUAL RESTANTE:', margin + 8, boxY + 49);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(11);
  const formattedBalanceStr = customerBalance.toLocaleString('pt-MZ') + ' MT';
  doc.text(formattedBalanceStr, margin + 85, boxY + 49);

  // Signatures spaces
  const sigY = boxY + 70;
  doc.setDrawColor(203, 213, 225);
  doc.line(margin + 5, sigY, margin + 70, sigY);
  doc.line(125, sigY, 195 - margin, sigY);

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Assinatura do Operador / Caixa', margin + 37, sigY + 5, { align: 'center' });
  doc.text('Assinatura / Comprovante do Cliente', 157, sigY + 5, { align: 'center' });

  // Footnote
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, sigY + 16, 195 - margin, sigY + 16);
  doc.text('Comprovante oficial de amortizacao financeira emitido de forma automatizada pelo Sabush System ERP.', 105, sigY + 23, { align: 'center' });

  // Apply legal disclaimer to EVERY page of the Payment Receipt PDF
  const pageCountVal = doc.getNumberOfPages();
  const pageHeightVal = 297;
  const pageWidthVal = 210;
  
  for (let i = 1; i <= pageCountVal; i++) {
    doc.setPage(i);
    const disclaimerY = pageHeightVal - 30; // 30mm from bottom of page

    // Background box
    doc.setFillColor(255, 243, 205); // light amber background
    doc.rect(14, disclaimerY - 8, pageWidthVal - 28, 22, 'F');

    // Border
    doc.setDrawColor(239, 159, 39); // amber border
    doc.setLineWidth(0.8);
    doc.rect(14, disclaimerY - 8, pageWidthVal - 28, 22, 'S');

    // Title text
    doc.setFontSize(9);
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(120, 53, 15); // dark amber text
    doc.text(
      '⚠️  AVISO LEGAL — ESTE DOCUMENTO NÃO SERVE DE RECIBO FISCAL OFICIAL',
      pageWidthVal / 2,
      disclaimerY - 1,
      { align: 'center' }
    );

    // Body text
    doc.setFontSize(7.5);
    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(92, 45, 5);
    doc.text(
      'Para efeitos fiscais, exija a sua Factura/Recibo nos termos do Regulamento do IVA de Moçambique (Lei nº 32/2007).',
      pageWidthVal / 2,
      disclaimerY + 5,
      { align: 'center' }
    );

    doc.text(
      'Este documento serve apenas como comprovativo interno de gestão comercial.',
      pageWidthVal / 2,
      disclaimerY + 10,
      { align: 'center' }
    );
  }

  doc.save(`Recibo_Pagamento_${receiptNum}.pdf`);
  return doc;
}

export function generateSystemManualPDF(businessName: string) {
  const doc = new jsPDF() as any;
  const margin = 15;
  
  // PAGE 1: COVER PAGE
  doc.setFillColor(15, 23, 42); // slate-900 (Deep Charcoal)
  doc.rect(0, 0, 210, 297, 'F');

  // Accent line
  doc.setFillColor(209, 77, 42); // Orange Accent
  doc.rect(margin, 40, 8, 50, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(32);
  doc.text('SABUSH SYSTEM', margin + 15, 55);
  doc.setFontSize(26);
  doc.setTextColor(209, 77, 42);
  doc.text('ERP SYSTEM MANUAL', margin + 15, 70);
  
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(148, 163, 184); // Slate grey
  doc.text('An All-in-One High-Efficiency SME Management Suite', margin + 15, 82);
  
  // Decorative lines
  doc.setDrawColor(51, 65, 85);
  doc.setLineWidth(0.5);
  doc.line(margin, 100, 195, 100);

  // Business Metadata
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text('PREPARED FOR:', margin, 130);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(14);
  doc.setTextColor(226, 232, 240);
  doc.text(`${businessName.toUpperCase()} MERCHANT PIPELINE`, margin, 138);

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(148, 163, 184);
  doc.text('COMPLIANCE REGION:', margin, 155);
  doc.setFont('Helvetica', 'normal');
  doc.setTextColor(255, 255, 255);
  doc.text('Southern Africa Standard / Mozambican Tax Compliant (17% IVA System)', margin, 161);

  doc.setFont('Helvetica', 'bold');
  doc.setTextColor(148, 163, 184);
  doc.text('GENERATION DATE:', margin, 175);
  doc.setFont('Helvetica', 'normal');
  doc.setTextColor(255, 255, 255);
  doc.text(new Date().toLocaleDateString('pt-MZ') + ' (UTC Standard Timeframe)', margin, 181);

  // Core Overview Card
  doc.setFillColor(30, 41, 59); // Slate-800
  doc.rect(margin, 205, 180, 55, 'F');
  
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(209, 77, 42);
  doc.text('EXECUTIVE EXECUTIVE GUIDE', margin + 8, 217);
  
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(241, 245, 249);
  
  const introLines = [
    'Sabush System is a state-of-the-art ERP specifically optimized for African small and medium',
    'enterprises (SMEs). It features an intuitive Point of Sale (POS) system that remains fully operational',
    'offline, dual-currency / regional standard settings, automated invoicing, real-time stock-tracking',
    'replenishment alert modules, client credit ledgers, and a customized Gemini AI Strategic Advisor.'
  ];
  let introY = 224;
  introLines.forEach(line => {
    doc.text(line, margin + 8, introY);
    introY += 5.5;
  });

  // Footer cover
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text('© 2026 Sabush System Inc. All Rights Reserved. Confidential & Proprietary Document.', 105, 282, { align: 'center' });


  // PAGE 2: DETAILED MODULE GUIDE
  doc.addPage();
  
  // Header
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 20, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('SABUSH SYSTEM ERP - MODULE SPECIFIC & USER SYSTEM MANUAL', margin, 13);
  doc.text(`Page 2`, 195 - margin, 13, { align: 'right' });

  // Reset colors for layout
  doc.setTextColor(15, 23, 42);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('SYSTEM FUNCTIONALITY MAP & CORE USER INTERFACES', margin, 32);
  
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text('This matrix outlines the specific sub-modules, functional descriptions, and quick-access pathways.', margin, 38);

  const manualColumns = ["Modulo / Recurso", "Descricao Operacional", "Como Utilizar / Quick Steps"];
  const manualRows = [
    [
      "Painel Principal\n(Dashboard)",
      "Exibe métricas chave de faturação, receitas, valores em dívida do cliente e de caixa. Contém o Alerta de Stock Baixo integrado.",
      "Acesse a página inicial para monitorizar o fluxo de caixa, as vendas do dia e receber alertas de reposição urgentemente."
    ],
    [
      "Point of Sale (POS)\nTerminais Rápidos",
      "Terminal de vendas para balcão, permitindo pesquisa de produto, carrinho dinâmico, verificação instantânea de stock e pagamentos múltiplos.",
      "Pesquise o produto no terminal, adicione ao carrinho, escolha o método de pagamento (M-Pesa/Numerário/Cartão) e imprima o talão."
    ],
    [
      "Gestor de Faturas\n(Invoices)",
      "Emissão, listagem e acompanhamento do estado de pagamento de faturas (pago, pendente, em atraso). Emite PDFs profissionais.",
      "Selecione 'Faturas' no menu, clique em 'Nova Fatura', preencha os itens e o cliente. Faça download ou envie o link de pagamento."
    ],
    [
      "Cotações\n(Quotations)",
      "Cria propostas comerciais para clientes com prazos de validade definidos. Pode ser convertida em fatura ao ser confirmada.",
      "Selecione 'Cotações', configure propostas exclusivas e converta em faturas finais com um único clique após aprovação do cliente."
    ],
    [
      "Gestor de Inventário\n(Inventory Catalog)",
      "Registo de catálogo de artigos, preços normais e de revenda online, controle de stock físico e parametrização de limites mínimos.",
      "Cadastre produtos com códigos, descrições e custos. Defina o 'Limite Mínimo' para receber alertas de reposição automática."
    ],
    [
      "Crédito e Clientes\n(Credit Ledgers)",
      "Controlo de contas correntes de clientes, limites de crédito acordados e histórico detalhado de compras com pagamentos efetuados.",
      "Consulte os perfis individuais dos clientes para gerir limites máximos de divida e registar amortizações na conta corrente."
    ],
    [
      "Loja Virtual Integrada\n(Storefront Link)",
      "Uma montra digital pública vinculada ao stock real da ERP para que clientes enviem propostas de encomendas online diretamente.",
      "Partilhe o link público da sua loja virtual (WhatsApp/Redes Sociais) para que clientes façam pedidos autónomos diretos."
    ],
    [
      "AI Strategy Advisor\n(Assistente IA)",
      "Módulo de Inteligência Artificial que consome dados de vendas e despesas em tempo real para propor estratégias de crescimento de lucros.",
      "Clique em 'Generate Advice' no dashboard. O robô analisará os seus custos e dará 5 diretrizes operacionais de melhoria."
    ]
  ];

  autoTable(doc, {
    head: [manualColumns],
    body: manualRows,
    startY: 44,
    theme: 'striped',
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
    styles: { fontSize: 8, cellPadding: 3.5 },
    columnStyles: {
      0: { cellWidth: 38, fontStyle: 'bold' },
      1: { cellWidth: 72 },
      2: { cellWidth: 'auto' }
    }
  });


  // PAGE 3: OFFLINE AND OFFLINE GUARANTEE & TAX
  doc.addPage();
  
  // Header page 3
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 20, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('SABUSH SYSTEM ERP - MODULE SPECIFIC & USER SYSTEM MANUAL', margin, 13);
  doc.text(`Page 3`, 195 - margin, 13, { align: 'right' });

  // Reset colors
  doc.setTextColor(15, 23, 42);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('GUARANTEES, OFFLINE ENGINE, AND COMPLIANCE RULES', margin, 32);
  
  // Line
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, 36, 195, 36);

  // Section 1: Offline Synchronization Mode
  doc.setFontSize(11);
  doc.setFont('Helvetica', 'bold');
  doc.text('1. INSTANT OFFLINE MODE (SABUSH SYNC)', margin, 46);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  
  const offlineParagraphs = [
    '• Connection Resilience: The Sabush ERP uses intelligent client-side caches (LocalStorage and IndexedDB).',
    '• Queued Actions: If your cellular connection or Wi-Fi experiences downtime in regions with low connectivity,',
    '  frontline cashier operations in POS, product searches, and cart checkout remain fully responsive.',
    '• Automatic Back-sync: Transactions completed offline are queued and synchronized seamlessly once',
    '  Internet access is re-established, fully preserving financial entries and ledger accuracy without gaps.'
  ];
  let pY = 52;
  offlineParagraphs.forEach(line => {
    doc.text(line, margin, pY);
    pY += 5;
  });

  // Section 2: Regional Tax and African SME Localization
  doc.setFontSize(11);
  doc.setFont('Helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('2. MOZAMBICAN IVA & REGIONAL TAX ADAPTABILITY', margin, pY + 8);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  
  const taxParagraphs = [
    '• Flexible Taxation: Fully pre-loaded with localized settings, including the standard 17% IVA (VAT) bracket.',
    '• Tax Identification: Supports business-level NUIT (Tax ID) parameters for official documents and customer registries.',
    '• Dual Currency: Supports simultaneous base pricing displays in Meticais (MZN) alongside regional',
    '  South African Rand (ZAR) or USD, protecting margins against regional inflation swings.',
    '• Receipt Printer Compatibility: Formatted output for standard thermal printers and 58mm/80mm receipt rolls.'
  ];
  pY = pY + 14;
  taxParagraphs.forEach(line => {
    doc.text(line, margin, pY);
    pY += 5;
  });

  // Section 3: Strategic Profit Recommendations
  doc.setFontSize(11);
  doc.setFont('Helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('3. MAXIMIZING PROFIT WITH SABUSH ERP AI', margin, pY + 8);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  
  const profitParagraphs = [
    '• Clear Deadstock: Use the AI Strategic Advisor to scan inventory for items with aging shelf life.',
    '• Enforce Credit Limits: Avoid high default exposure by assigning strict credit bounds to clients.',
    '• Real-time Expense Auditing: Record cash leaks, delivery fees, and office rent in the Expenses module.'
  ];
  pY = pY + 14;
  profitParagraphs.forEach(line => {
    doc.text(line, margin, pY);
    pY += 5;
  });

  // Ending Box
  pY += 10;
  doc.setFillColor(248, 250, 252); // light slate
  doc.rect(margin, pY, 180, 28, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.rect(margin, pY, 180, 28, 'D');
  
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('SABUSH SYSTEM - ASSURANCE & COMPLIANCE GUARANTEE', margin + 6, pY + 8);
  
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('With robust offline recovery engines, automatic local database syncing, localized multi-role control, and', margin + 6, pY + 14);
  doc.text('high-efficiency data rendering, your SME operations are fully secured, verified, and marketplace-ready today.', margin + 6, pY + 18);

  doc.save(`${businessName}_System_Features_Manual.pdf`);
}

export function generateMonthlyReportPDF(monthName: string, stats: any, company: PDFCompanyInfo, products: any[]) {
  const doc = new jsPDF() as any;
  const margin = 15;

  // Header background
  doc.setFillColor(29, 21, 16); // Brand Charcoal/Dark Earth
  doc.rect(0, 0, 210, 42, 'F');

  // Title
  doc.setTextColor(252, 250, 246);
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(22);
  doc.text((company.name || 'SABUSH SYSTEM').toUpperCase(), margin, 18);
  doc.setFontSize(11);
  doc.setFont('Helvetica', 'normal');
  doc.setTextColor(233, 225, 210);
  doc.text(`RELATÓRIO EMPRESARIAL AUTOMÁTICO - ${monthName.toUpperCase()}`, margin, 27);
  doc.setFontSize(8.5);
  doc.setTextColor(139, 115, 95);
  doc.text('GERADO ATRAVÉS DE FECHAMENTO PROGRAMADO - SABUSH ERP', margin, 34);

  // Logo text info
  doc.setFont('Helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.text('SABUSH ERP', 195 - margin, 18, { align: 'right' });
  doc.setFontSize(9);
  doc.setFont('Helvetica', 'normal');
  doc.setTextColor(233, 225, 210);
  doc.text(`Data: ${new Date().toLocaleDateString('pt-MZ')}`, 195 - margin, 27, { align: 'right' });

  // Reset text color
  doc.setTextColor(29, 21, 16);

  // Stats Table
  doc.setFontSize(12);
  doc.setFont('Helvetica', 'bold');
  doc.text('1. RESUMO FINANCEIRO E OPERACIONAL', margin, 54);

  const statsTableData = [
    ['Indicador de Desempenho (KIP)', 'Valor Registado'],
    ['Faturação / Receita Bruta', `${(stats.totalRevenue || 0).toLocaleString('pt-MZ')} MT`],
    ['Total de Transações (Volume)', `${stats.totalSales || 0} vendas`],
    ['Novos Clientes Registados', `${stats.activeCustomers || 0}`],
    ['Gasto Total do Mês (Despesas)', `${(stats.totalExpenses || 0).toLocaleString('pt-MZ')} MT`],
    ['Artigos com Alerta de Stock', `${stats.lowStockItems || 0} referências`],
    ['Crédito Activo (Clientes Devedores)', `${(stats.outstandingCredit || 0).toLocaleString('pt-MZ')} MT`],
  ];

  autoTable(doc, {
    startY: 59,
    head: [statsTableData[0]],
    body: statsTableData.slice(1),
    theme: 'grid',
    headStyles: { fillColor: [29, 21, 16], textColor: [252, 250, 246], fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 3.5 }
  });

  let currentY = (doc as any).lastAutoTable.finalY + 12;

  // Stock table
  doc.setFontSize(12);
  doc.setFont('Helvetica', 'bold');
  doc.text('2. AUDITORIA DE REAPROVISIONAMENTO DE STOCK', margin, currentY);

  const filteredLowStock = products
    .filter(p => p.stockLevel <= (p.lowStockThreshold || 5))
    .slice(0, 10);

  const stockHeaders = ['Artigo de Distribuição', 'Unidade SKU', 'Mínimo Aceitável', 'Stock Atual'];
  const stockRows = filteredLowStock.map(p => [
    p.name,
    p.sku || 'N/D',
    `${p.lowStockThreshold || 5} ${p.baseUnitLabel || 'Un'}`,
    `${p.stockLevel} ${p.baseUnitLabel || 'Un'}`
  ]);

  if (stockRows.length > 0) {
    autoTable(doc, {
      startY: currentY + 5,
      head: [stockHeaders],
      body: stockRows,
      theme: 'grid',
      headStyles: { fillColor: [139, 115, 95], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 8.5, cellPadding: 3 }
    });
    currentY = (doc as any).lastAutoTable.finalY + 14;
  } else {
    doc.setFont('Helvetica', 'italic');
    doc.setFontSize(9.5);
    doc.setTextColor(115, 115, 115);
    doc.text('Excelente! Não foram detetadas ocorrências de rutura de stock no período analítico.', margin, currentY + 6);
    doc.setTextColor(29, 21, 16);
    currentY += 16;
  }

  // Verification Box
  if (currentY > 240) {
    doc.addPage();
    currentY = 20;
  }

  doc.setFillColor(250, 248, 245);
  doc.rect(margin, currentY, 180, 26, 'F');
  doc.setDrawColor(233, 225, 210);
  doc.rect(margin, currentY, 180, 26, 'D');

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(29, 21, 16);
  doc.text('CERTIFICAÇÃO AUTOMÁTICA DE COMPILIALIDADE MENSAL', margin + 6, currentY + 8);
  
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(139, 115, 95);
  doc.text('Este relatório estatístico foi gerado de forma segura e offline pelo Sabush System ERP.', margin + 6, currentY + 14);
  doc.text('Todos os valores e balanços históricos de caixa e stock foram auditados contra o armazenamento da empresa.', margin + 6, currentY + 18);

  doc.save(`Sabush_ERP_Relatorio_Mensal_${monthName.replace(/\s+/g, '_')}.pdf`);
}


