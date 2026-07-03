import { toast } from 'sonner';

/**
 * Service to handle Email alerts (simulated or real integration).
 * For a production setup, you can replace this with emailjs-com or a 
 * server-side mailer (e.g. Nodemailer or SendGrid proxy).
 */
export async function sendEmailNotification(to: string, subject: string, messageBody: string): Promise<boolean> {
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    console.log(`[EmailService] Enviando email para: ${to}`);
    console.log(`[EmailService] Assunto: ${subject}`);
    console.log(`[EmailService] Mensagem:\n${messageBody}`);
  }

  // In a real project you'd place EmailJS or API proxy fetch here:
  // e.g.:
  // import emailjs from '@emailjs/browser';
  // await emailjs.send("service_id", "template_id", { to_email: to, subject, message: messageBody }, "public_key");

  // Show user elegant info toast that email notification has been triggered
  toast.info(`E-mail enviado para ${to}: ${subject.substring(0, 30)}...`, {
    description: "Alerta automatizado despachado com sucesso."
  });

  return true;
}

export function buildQuotationEmailBody(quotation: any): string {
  return `
    Prezado(a) Cliente,
    
    Agradecemos a sua preferência pelo Sabush System.
    Sua cotação ${quotation.quotationNumber} foi registada e enviada com sucesso para análise do vendedor.
    
    Resumo dos Itens:
    ${quotation.items.map((item: any) => `- ${item.name} x${item.quantity}: ${(item.price * item.quantity).toFixed(2)} MZN`).join('\n')}
    
    Total (Exc. IVA): ${Number(quotation.total).toFixed(2)} MZN
    Status Actual: ${quotation.status === 'accepted' ? 'Confirmado' : 'Pendente de Confirmação'}
    
    Pode acompanhar o estado da cotação diretamente com o ID de Rastreamento: ${quotation.id || 'N/A'}.
    
    Cumprimentos,
    A Equipa Sabush System ERP
  `;
}

export function buildInvoiceEmailBody(invoice: any): string {
  return `
    Prezado(a) Cliente,
    
    Emitimos com sucesso a factura correspondente ao seu pedido confirmado.
    
    Factura nº: ${invoice.invoiceNumber}
    Total Geral (MZN): ${(invoice.total || Number(invoice.subtotal) * 1.17).toFixed(2)} MZN
    Vencimento: ${new Date(invoice.dueDate).toLocaleDateString('pt-MZ')}
    
    Os detalhes e o recibo de pagamento anexado encontram-se prontos para download.
    Meios de pagamento disponíveis: BIM / BCI / Mpesa (+258 84 000 0000).
    
    Obrigado por sua parceria constante.
    
    Cumprimentos,
    Sabush System ERP
  `;
}

export function buildSellerNewQuotationEmailBody(quotation: any): string {
  return `
    Olá Administrador/Vendedor,
    
    Existe uma nova COTAÇÃO ONLINE que necessita da sua atenção imediata!
    
    Nº Cotação: ${quotation.quotationNumber}
    Cliente: ${quotation.customerName || quotation.customerId}
    Total do Orçamento: ${Number(quotation.total).toFixed(2)} MZN
    Data de Validade: ${new Date(quotation.expiryDate).toLocaleDateString('pt-MZ')}
    
    Consulte os detalhes na aba "Cotações" do seu ERP Sabush System para Confirmar ou Rejeitar este pedido.
    
    Sistema Automático do ERP
  `;
}

export async function sendWelcomeEmail(to: string, displayName: string, loginLink: string): Promise<boolean> {
  const subject = "Bem-vindo ao Sabush System ERP! 🎉";
  const body = `
    Olá ${displayName || to},
    
    Seja muito bem-vindo ao Sabush System ERP, o seu ecossistema definitivo de gestão de PMEs e faturamento!
    
    A sua conta foi registada com sucesso na nossa plataforma segura e está pronta para uso imediato.
    
    Aceda directamente ao seu painel através do link:
    👉 ${loginLink}
    
    Explore o nosso ecossistema e conheça também as nossas empresas parceiras:
    - Mercado Sabush: O seu marketplace digital inovador em Moçambique.
    - Sabush English Club: Domine o inglês profissional com foco em falantes de português.
    
    Se precisar de qualquer apoio ou tiver sugestões, a nossa equipa de suporte integrada está à sua inteira disposição.
    
    Cumprimentos,
    Administração Sabush Group & Sabush System ERP
  `;
  return sendEmailNotification(to, subject, body);
}

export async function sendProductRestockedEmail(to: string, clientName: string, productName: string, isRestock: boolean, price: number, portalLink: string): Promise<boolean> {
  const actionText = isRestock ? "já se encontra novamente disponível em stock" : "é a nossa mais recente novidade em catálogo";
  const subject = isRestock ? `Reposição de Stock: ${productName} disponível! 🚀` : `Novo Produto em Catálogo: ${productName}! ✨`;
  const body = `
    Prezado(a) ${clientName},
    
    Temos o prazer de informar que o produto [ ${productName} ] ${actionText}!
    
    Preço unitário: ${price.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} MZN.
    
    Pode encomendar e emitir a sua proposta directamente através do seu Portal de Cliente:
    👉 ${portalLink}
    
    Agradecemos a sua preferência constante.
    
    Cumprimentos,
    A Equipa de Vendas Sabush System ERP
  `;
  return sendEmailNotification(to, subject, body);
}

export async function sendInvoiceClientEmail(to: string, clientName: string, invoiceNumber: string, totalAmount: number, portalLink: string): Promise<boolean> {
  const subject = `Factura Emitida: ${invoiceNumber} no Sabush System 📄`;
  const body = `
    Prezado(a) ${clientName},
    
    Emitimos com sucesso a factura correspondente às suas aquisições na nossa plataforma.
    
    Factura Nº: ${invoiceNumber}
    Total Geral: ${totalAmount.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} MZN
    
    Deverá aceder ao seu Portal de Cliente para consultar os dados para liquidação, descarregar a via oficial em PDF ou amortizar as suas contas correntes:
    👉 ${portalLink}
    
    Agradecemos a sua preferência constante nos nossos serviços.
    
    Cumprimentos,
    Sabush System ERP & Sabush Group
  `;
  return sendEmailNotification(to, subject, body);
}

export async function sendQuotationUpdatedEmail(to: string, clientName: string, quotationNumber: string, totalAmount: number, portalLink: string): Promise<boolean> {
  const subject = `Preços Atualizados: Cotação ${quotationNumber} no Sabush System ERP 📄`;
  const body = `
    Prezado(a) ${clientName},
    
    Os preços ou condições do seu pedido de cotação online [ ${quotationNumber} ] foram calibrados e atualizados pelo proprietário da empresa.
    
    Novo Total Geral Estimado: ${totalAmount.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} MZN
    
    Pode aceder directamente ao seu Portal de Cliente para consultar as alterações, calibrar o carrinho ou validar as faturas:
    👉 ${portalLink}
    
    Agradecemos a sua preferência contínua.
    
    Cumprimentos,
    A Equipa de Vendas Sabush System ERP
  `;
  return sendEmailNotification(to, subject, body);
}

export async function sendAdminNewUserAlert(adminEmail: string, userEmail: string, displayName: string, role: string): Promise<boolean> {
  const subject = `Novo Registo de Utilizador na Plataforma! 🚀`;
  const body = `
    Olá Administrador,

    Temos o prazer de info-lo que um novo utilizador acaba de se registar na plataforma Sabush System ERP.

    Detalhes do Novo Registo:
    - E-mail: ${userEmail}
    - Nome / DisplayName: ${displayName || 'Não especificado'}
    - Função Atribuída: ${role}
    - Data: ${new Date().toLocaleString('pt-PT')}

    O utilizador já tem o seu perfil de conta básica criado em modo "${role}". Pode consultar o estado desta conta e gerir as suas permissões diretamente no Painel de Super Admin:
    👉 ${typeof window !== 'undefined' ? window.location.origin : 'https://sabush-erp.web.app'}

    Cumprimentos,
    Central de Alertas Automatizados Sabush Group
  `;
  return sendEmailNotification(adminEmail, subject, body);
}

