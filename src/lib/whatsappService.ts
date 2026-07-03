import { toast } from 'sonner';

interface SendWhatsAppParams {
  apiKey?: string;
  phoneNumberId?: string;
  businessPhone?: string;
  webhookUrl?: string;
  recipientPhone: string;
  customerName: string;
  orderNumber: string;
  totalAmount: number;
  currency: string;
  items: any[];
  isQuotation?: boolean;
  invoicePdfUrl?: string;
  invoiceTemplate?: string;
  reminderTemplate?: string;
  isReminder?: boolean;
  portalUrl?: string;
}

/**
 * Service to handle automated WhatsApp notifications.
 * It integrates with Meta's official WhatsApp Cloud API and Make.com integrations.
 */
export async function sendWhatsAppNotification(params: SendWhatsAppParams): Promise<boolean> {
  const {
    apiKey,
    phoneNumberId,
    businessPhone,
    webhookUrl,
    recipientPhone,
    customerName,
    orderNumber,
    totalAmount,
    currency,
    items,
    isQuotation = false,
    invoicePdfUrl,
    invoiceTemplate,
    reminderTemplate,
    isReminder = false,
    portalUrl,
  } = params;

  // Clean recipient phone
  const cleanTo = recipientPhone.replace(/\D/g, '');
  if (!cleanTo) {
    console.warn('[WhatsAppService] Invalid recipient phone number:', recipientPhone);
    return false;
  }

  // Format order items list
  const formattedItems = (items || [])
    .map((item: any) => `- ${item.name || item.description || ''} (x${item.quantity || 1}): ${((item.price || item.onlinePrice || 0) * (item.quantity || 1)).toFixed(2)} ${currency}`)
    .join('\n');

  // Build customer confirmation message
  let customerMessageText = '';

  if (isReminder && reminderTemplate) {
    customerMessageText = reminderTemplate
      .replace(/{customerName}/g, customerName)
      .replace(/{orderNumber}/g, orderNumber)
      .replace(/{totalAmount}/g, totalAmount.toLocaleString('pt-MZ', { minimumFractionDigits: 2 }))
      .replace(/{currency}/g, currency)
      .replace(/{items}/g, formattedItems)
      .replace(/{invoiceUrl}/g, invoicePdfUrl || '');
  } else if (!isReminder && invoiceTemplate) {
    customerMessageText = invoiceTemplate
      .replace(/{customerName}/g, customerName)
      .replace(/{orderNumber}/g, orderNumber)
      .replace(/{totalAmount}/g, totalAmount.toLocaleString('pt-MZ', { minimumFractionDigits: 2 }))
      .replace(/{currency}/g, currency)
      .replace(/{items}/g, formattedItems)
      .replace(/{invoiceUrl}/g, invoicePdfUrl || '');
  } else {
    let introMessage = '';
    if (isQuotation) {
      introMessage = `Olá ${customerName}! Recebemos o seu pedido de cotação online *${orderNumber}* no Sabush System.`;
    } else if (orderNumber.startsWith('POS-')) {
      introMessage = `Olá ${customerName}! O seu talão de venda/recibo *${orderNumber}* foi emitido e processado com sucesso no Sabush System.`;
    } else if (orderNumber.startsWith('INV-')) {
      introMessage = `Olá ${customerName}! A sua fatura de venda *${orderNumber}* foi emitida com sucesso no Sabush System.`;
    } else {
      introMessage = `Olá ${customerName}! O seu pedido online *${orderNumber}* foi recebido com sucesso no Sabush System.`;
    }

    customerMessageText = `${introMessage}

*Resumo dos Itens:*
${formattedItems}

*Total Geral:* ${totalAmount.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} ${currency}`;

    if (invoicePdfUrl) {
      customerMessageText += `\n\n📄 *Descarregar Fatura PDF:* ${invoicePdfUrl}`;
    }

    if (portalUrl) {
      customerMessageText += `\n\n🔐 *Acesso ao seu Portal do Cliente:* ${portalUrl}`;
    }

    customerMessageText += `\n\nAgradecemos a sua preferência! Entraremos em contacto para qualquer detalhe adicional.
_Este é um alerta automatizado enviado pelo Sabush System ERP_`;
  }

  // Build administrator alert message
  const adminMessageText = `🔔 *Nova Operação de Venda em Ponto de Venda/Faturação Registada!*
ID/Nº: *${orderNumber}*
Cliente: *${customerName}*
Telefone do Cliente: *${recipientPhone}*

*Itens associados:*
${formattedItems}

*Total Geral:* ${totalAmount.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} ${currency}

Aceda ao seu painel Sabush System ERP para monitoramento.`;

  let apiSuccess = false;
  let webhookSuccess = false;

  // Helper function to send message via Meta's WhatsApp Cloud API
  const sendViaMetaAPI = async (toPhone: string, text: string): Promise<boolean> => {
    if (!apiKey || !phoneNumberId) return false;
    try {
      const response = await fetch(`https://graph.facebook.com/v17.0/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: toPhone,
          type: 'text',
          text: {
            preview_url: false,
            body: text
          }
        })
      });

      if (!response.ok) {
        const errDetails = await response.text();
        console.error(`[WhatsAppService] Meta API error details: ${errDetails}`);
        return false;
      }
      return true;
    } catch (err) {
      console.error('[WhatsAppService] Failed to fetch Meta Cloud API:', err);
      return false;
    }
  };

  // Helper function to send document file via Meta's WhatsApp Cloud API
  const sendViaMetaDocument = async (toPhone: string, fileUrl: string, filename: string, captionText: string): Promise<boolean> => {
    if (!apiKey || !phoneNumberId) return false;
    try {
      const response = await fetch(`https://graph.facebook.com/v17.0/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: toPhone,
          type: 'document',
          document: {
            link: fileUrl,
            filename: filename,
            caption: captionText
          }
        })
      });

      if (!response.ok) {
        const errDetails = await response.text();
        console.error(`[WhatsAppService] Meta API Document error details: ${errDetails}`);
        return false;
      }
      return true;
    } catch (err) {
      console.error('[WhatsAppService] Failed to send document via Meta Cloud API:', err);
      return false;
    }
  };

  // 1. Send to Customer
  if (apiKey && phoneNumberId && cleanTo) {
    const sentText = await sendViaMetaAPI(cleanTo, customerMessageText);
    if (sentText) {
      apiSuccess = true;
      // If we have an PDF URL, send it as document attachment as well!
      if (invoicePdfUrl) {
        const docSent = await sendViaMetaDocument(
          cleanTo, 
          invoicePdfUrl, 
          `Fatura_${orderNumber.replace(/[^a-zA-Z0-9-_]/g, '_')}.pdf`, 
          `Fatura Comercial #${orderNumber}`
        );
        if (docSent) {
          if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
            console.log('[WhatsAppService] Successfully sent PDF document attachment too!');
          }
        }
      }
    }
  }

  // 2. Send to Business Admin Phone (to alert the merchant)
  if (apiKey && phoneNumberId && businessPhone) {
    const cleanBizPhone = businessPhone.replace(/\D/g, '');
    if (cleanBizPhone && cleanBizPhone !== cleanTo) {
      const sentAdmin = await sendViaMetaAPI(cleanBizPhone, adminMessageText);
      if (sentAdmin) {
        if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
          console.log('[WhatsAppService] Sent WhatsApp alert to business phone number:', cleanBizPhone);
        }
        apiSuccess = true;
      }
    }
  }

  // 3. Dispatch to Make.com webhook if configured
  if (webhookUrl) {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          event: isQuotation ? 'online_quotation_received' : 'online_order_received',
          orderNumber,
          customerName,
          customerPhone: recipientPhone,
          businessPhone: businessPhone || '',
          totalAmount,
          currency,
          items,
          customerMessage: customerMessageText,
          adminMessage: adminMessageText,
          timestamp: new Date().toISOString()
        })
      });

      if (response.ok) {
        webhookSuccess = true;
        if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
          console.log('[WhatsAppService] Dispatched webhook event to Make.com');
        }
      }
    } catch (err) {
      console.error('[WhatsAppService] Make.com Webhook trigger error:', err);
    }
  }

  const success = apiSuccess || webhookSuccess;

  if (success) {
    toast.success('Notificação WhatsApp enviada', {
      description: `Disparada mensagem automática para o cliente no terminal (+${cleanTo})`
    });
  } else {
    console.info('[WhatsAppService] Automated notification run skipped or pending credential fill in settings.');
  }

  return success;
}

interface SendWhatsAppLowStockParams {
  apiKey: string;
  phoneNumberId: string;
  recipientPhone: string;
  productName: string;
  currentStock: number;
  minStock: number;
  unit: string;
  template: string;
}

export async function sendWhatsAppLowStockAlert(params: SendWhatsAppLowStockParams): Promise<boolean> {
  const { apiKey, phoneNumberId, recipientPhone, productName, currentStock, minStock, unit, template } = params;
  
  const cleanTo = recipientPhone.replace(/\D/g, '');
  if (!cleanTo) {
    console.warn('[WhatsAppService] Invalid stock alert recipient phone number:', recipientPhone);
    return false;
  }

  const messageText = template
    .replace(/{productName}/g, productName)
    .replace(/{currentStock}/g, String(currentStock))
    .replace(/{minStock}/g, String(minStock))
    .replace(/{unit}/g, unit);

  try {
    const response = await fetch(`https://graph.facebook.com/v17.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanTo,
        type: 'text',
        text: {
          preview_url: false,
          body: messageText
        }
      })
    });

    if (response.ok) {
      toast.warning('Alerta de stock baixo disparado', {
        description: `Notificação automática enviada para o administrador (${productName})`
      });
      return true;
    } else {
      const err = await response.text();
      console.error('[WhatsAppService] Low stock alert API error:', err);
      return false;
    }
  } catch (err) {
    console.error('[WhatsAppService] Low stock alert network error:', err);
    return false;
  }
}

export interface SendWhatsAppSummaryReportParams {
  apiKey: string;
  phoneNumberId: string;
  recipientPhone: string;
  businessName: string;
  dateStr: string;
  totalSalesCount: number;
  totalRevenue: number;
  totalExpenses: number;
  profit: number;
  lowStockCount: number;
  outstandingCredit: number;
  currency: string;
}

export async function sendWhatsAppSummaryReport(params: SendWhatsAppSummaryReportParams): Promise<boolean> {
  const {
    apiKey,
    phoneNumberId,
    recipientPhone,
    businessName,
    dateStr,
    totalSalesCount,
    totalRevenue,
    totalExpenses,
    profit,
    lowStockCount,
    outstandingCredit,
    currency
  } = params;

  const cleanTo = recipientPhone.replace(/\D/g, '');
  if (!cleanTo) {
    console.warn('[WhatsAppService] Invalid recipient phone number:', recipientPhone);
    return false;
  }

  const messageText = `📊 *SABUSH ERP - RELATÓRIO DE VENDAS AUTOMÁTICO* 📊\n*Empresa:* ${businessName}\n*Data do Resumo:* ${dateStr}\n\n----------------------------------\n📈 *Resumo Financeiro:*\n  - *Faturamento Bruto:* ${totalRevenue.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} ${currency}\n  - *Despesas Registradas:* ${totalExpenses.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} ${currency}\n  - *Lucro Líquido Estimado:* ${profit.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} ${currency}\n  - *Nº de Transações (Vendas):* ${totalSalesCount} vds.\n\n----------------------------------\n⚠️ *Alertas Críticos:*\n  - *Crédito Cooperativo Pendente:* ${outstandingCredit.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} ${currency}\n  - *Artigos com Alerta de Stock:* ${lowStockCount} itens\n\nAceda ao painel Sabush ERP para consolidação total: https://sabush-erp.web.app\n_Este é um relatório gerado e disparado de forma automática com segurança no Sabush ERP_`;

  try {
    const response = await fetch(`https://graph.facebook.com/v17.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanTo,
        type: 'text',
        text: {
          preview_url: false,
          body: messageText
        }
      })
    });

    if (response.ok) {
      toast.success('Relatório WhatsApp enviado com sucesso!', {
        description: `Enviado para o número do gestor (+${cleanTo})`
      });
      return true;
    } else {
      const err = await response.text();
      console.error('[WhatsAppService] Summary Report API error:', err);
      toast.error('Erro de API no envio do Relatório WhatsApp.');
      return false;
    }
  } catch (err) {
    console.error('[WhatsAppService] Summary Report network error:', err);
    toast.error('Erro de rede ao enviar o Relatório WhatsApp.');
    return false;
  }
}

interface SendWhatsAppCreditParams {
  apiKey: string;
  phoneNumberId: string;
  recipientPhone: string;
  customerName: string;
  creditAmount: number;
  totalOutstanding: number;
  orderNumber: string;
  currency: string;
}

export async function sendWhatsAppCreditAlert(params: SendWhatsAppCreditParams): Promise<boolean> {
  const { apiKey, phoneNumberId, recipientPhone, customerName, creditAmount, totalOutstanding, orderNumber, currency } = params;

  const cleanTo = recipientPhone.replace(/\D/g, '');
  if (!cleanTo) {
    console.warn('[WhatsAppService] Invalid credit alert recipient phone number:', recipientPhone);
    return false;
  }

  const messageText = `Olá *${customerName}*,\n\nInformamos que uma compra a crédito (Fiado/Conta) de *${creditAmount.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} ${currency}* referente à fatura *${orderNumber}* foi registada com sucesso na sua conta.\n\n*Saldo em Dívida Atual:* *${totalOutstanding.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} ${currency}*.\n\nAgradecemos a sua preferência e solicitamos a regularização oportuna.\n\nCom os melhores cumprimentos,\n_Gestão de Contas_\n_Sabush System ERP_`;

  try {
    const response = await fetch(`https://graph.facebook.com/v17.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanTo,
        type: 'text',
        text: {
          preview_url: false,
          body: messageText
        }
      })
    });

    if (response.ok) {
      toast.success('Alerta de crédito enviado por WhatsApp', {
        description: `Notificado registo de dívida para +${cleanTo}`
      });
      return true;
    } else {
      const err = await response.text();
      console.error('[WhatsAppService] Credit alert API error:', err);
      return false;
    }
  } catch (err) {
    console.error('[WhatsAppService] Credit alert network error:', err);
    return false;
  }
}

export async function sendWelcomeWhatsApp(recipientPhone: string, customerName: string, loginLink: string, apiKey?: string, phoneNumberId?: string): Promise<boolean> {
  const cleanTo = recipientPhone.replace(/\D/g, '');
  if (!cleanTo) return false;

  const messageText = `Olá *${customerName}*! 🎉\n\nSeja muito bem-vindo ao *Sabush System ERP*!\n\nA sua conta foi configurada de forma segura e já se encontra activa. Use o link abaixo para aceder diretamente ao seu painel ERP:\n👉 ${loginLink}\n\nConheça as nossas sinergias do *Grupo Sabush* como o *Mercado Sabush* e o *Sabush English Club*!\n\n_Este é um alerta automático disparado pelo Sabush ERP_`;

  if (!apiKey || !phoneNumberId) {
    console.log(`[WhatsAppService SIMULADO] Envio de Boas-Vindas para +${cleanTo}:\n${messageText}`);
    toast.info(`Controlo WhatsApp simulado enviado para +${cleanTo}: Bem-vindo!`);
    return true;
  }

  try {
    const response = await fetch(`https://graph.facebook.com/v17.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanTo,
        type: 'text',
        text: { preview_url: false, body: messageText }
      })
    });
    return response.ok;
  } catch (err) {
    console.error('[WhatsAppService] Welcome WhatsApp error:', err);
    return false;
  }
}

export async function sendProductRestockedWhatsApp(recipientPhone: string, customerName: string, productName: string, isRestock: boolean, price: number, portalLink: string, apiKey?: string, phoneNumberId?: string): Promise<boolean> {
  const cleanTo = recipientPhone.replace(/\D/g, '');
  if (!cleanTo) return false;

  const actionText = isRestock ? "está novamente em stock! 🚀" : "acaba de ser adicionado ao nosso catálogo principal! ✨";
  const messageText = `Olá *${customerName}*!\n\nTemos novidades para si: o produto *${productName}* ${actionText}\n\n*Preço:* ${price.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} MZN\n\nFaça já o seu pedido ou descarregue cotações directamente no seu *Portal do Cliente*:\n👉 ${portalLink}\n\nAgradecemos a sua preferência!\n_Sabush System ERP_`;

  if (!apiKey || !phoneNumberId) {
    console.log(`[WhatsAppService SIMULADO] Envio de Alerta de Produto para +${cleanTo}:\n${messageText}`);
    toast.info(`Controlo de Stock WhatsApp enviado para +${cleanTo}: ${productName}`);
    return true;
  }

  try {
    const response = await fetch(`https://graph.facebook.com/v17.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanTo,
        type: 'text',
        text: { preview_url: false, body: messageText }
      })
    });
    return response.ok;
  } catch (err) {
    console.error('[WhatsAppService] Restock WhatsApp error:', err);
    return false;
  }
}

export async function sendInvoiceClientWhatsApp(recipientPhone: string, customerName: string, invoiceNumber: string, totalAmount: number, portalLink: string, apiKey?: string, phoneNumberId?: string): Promise<boolean> {
  const cleanTo = recipientPhone.replace(/\D/g, '');
  if (!cleanTo) return false;

  const messageText = `Olá *${customerName}*!\n\nA factura *${invoiceNumber}* foi emitida e já se encontra disponível para si.\n\n*Total Geral:* ${totalAmount.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} MZN\n\nAceda directamente ao seu *Portal do Cliente* para descarregar o PDF, ver amortizações e faturas:\n👉 ${portalLink}\n\nObrigado por escolher o Sabush System ERP!\n_Ecosistema Grupo Sabush_`;

  if (!apiKey || !phoneNumberId) {
    console.log(`[WhatsAppService SIMULADO] Envio de Fatura WhatsApp para +${cleanTo}:\n${messageText}`);
    toast.info(`Notificação de Fatura WhatsApp simulada enviada para +${cleanTo}`);
    return true;
  }

  try {
    const response = await fetch(`https://graph.facebook.com/v17.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanTo,
        type: 'text',
        text: { preview_url: false, body: messageText }
      })
    });
    return response.ok;
  } catch (err) {
    console.error('[WhatsAppService] Invoice WhatsApp error:', err);
    return false;
  }
}

export async function sendQuotationUpdatedWhatsApp(recipientPhone: string, customerName: string, quotationNumber: string, totalAmount: number, portalLink: string, apiKey?: string, phoneNumberId?: string): Promise<boolean> {
  const cleanTo = recipientPhone.replace(/\D/g, '');
  if (!cleanTo) return false;

  const messageText = `Olá *${customerName}*!\n\nOs preços ou condições do seu pedido de cotação *${quotationNumber}* foram calibrados e atualizados pelo proprietário.\n\n*Novo Total Estimado:* ${totalAmount.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} MZN\n\nConsulte os novos preços detalhados no seu *Portal do Cliente*:\n👉 ${portalLink}\n\nObrigado por escolher o Sabush System ERP!`;

  if (!apiKey || !phoneNumberId) {
    console.log(`[WhatsAppService SIMULADO] Envio de Atualização de Cotação WhatsApp para +${cleanTo}:\n${messageText}`);
    toast.info(`Notificação de Cotação Atualizada via WhatsApp simulada enviada para +${cleanTo}`);
    return true;
  }

  try {
    const response = await fetch(`https://graph.facebook.com/v17.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanTo,
        type: 'text',
        text: { preview_url: false, body: messageText }
      })
    });
    return response.ok;
  } catch (err) {
    console.error('[WhatsAppService] Quotation Update WhatsApp error:', err);
    return false;
  }
}

/**
 * Send subscription billing approval or rejection status alerts via WhatsApp Cloud API
 */
export async function sendSubscriptionStatusWhatsApp(
  recipientPhone: string,
  businessName: string,
  planName: string,
  status: 'approved' | 'rejected',
  notes?: string,
  apiKey?: string,
  phoneNumberId?: string
): Promise<boolean> {
  const cleanTo = recipientPhone.replace(/\D/g, '');
  if (!cleanTo) return false;

  let messageText = '';
  if (status === 'approved') {
    messageText = `Olá! O comprovativo de pagamento para *${businessName}* associado ao plano *${planName.toUpperCase()}* do *Sabush System ERP* foi recebido e validado com sucesso! 🎉\n\nA sua subscrição já está ativa. Agradecemos por utilizar o nosso sistema!\n\n_Este é um alerta automático disparado pelo Sabush ERP_`;
  } else {
    messageText = `Olá! O comprovativo de pagamento para *${businessName}* referente ao plano *${planName.toUpperCase()}* do *Sabush System ERP* não pôde ser ativado.\n\n⚠️ *Motivo:* ${notes || 'Informações divergentes ou comprovativo incompleto.'}\n\nPor favor, aceda ao painel de Faturação/Billing do seu ERP para re-submeter o comprovativo com os dados corretos.\n\n_Este é um alerta automático disparado pelo Sabush ERP_`;
  }

  if (!apiKey || !phoneNumberId) {
    console.log(`[WhatsAppService SIMULADO] Envio de Subscrição (${status}) para +${cleanTo}:\n${messageText}`);
    toast.info(`Alerta WhatsApp de subscrição (${status}) enviado para +${cleanTo}`);
    return true;
  }

  try {
    const response = await fetch(`https://graph.facebook.com/v17.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanTo,
        type: 'text',
        text: { preview_url: false, body: messageText }
      })
    });
    return response.ok;
  } catch (err) {
    console.error('[WhatsAppService] Subscription Status WhatsApp error:', err);
    return false;
  }
}



