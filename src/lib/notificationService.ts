import { db } from './firebase';
import { collection, addDoc, getDocs, query, where, serverTimestamp, doc, getDoc } from 'firebase/firestore';

/**
 * Service to dispatch real-time in-app alerts across the ERP to active sellers/admins.
 */
export async function sendLiveNotification(
  businessId: string, 
  title: string, 
  message: string, 
  type: 'info' | 'success' | 'warning' = 'info'
) {
  try {
    // 1. Fetch all users belonging to the business
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('businessId', '==', businessId));
    const userSnapshot = await getDocs(q);

    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      console.log(`[NotificationService] Encontrados ${userSnapshot.size} utilizadores para o businessId: ${businessId}`);
    }

    // 2. Dispatch the real-time notification to each user's notifications subcollection
    const promises = userSnapshot.docs.map(userDoc => {
      const userId = userDoc.id;
      const notificationSubRef = collection(db, `users/${userId}/notifications`);
      return addDoc(notificationSubRef, {
        title,
        message,
        type,
        read: false,
        createdAt: serverTimestamp()
      });
    });

    await Promise.all(promises);
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      console.log(`[NotificationService] Alertas emitidos em tempo real com sucesso.`);
    }
    return true;
  } catch (error) {
    console.warn('[NotificationService] Falha ao enviar notificações Firestore em tempo real:', error);
    return false;
  }
}

/**
 * Automatically fetches customer, constructs their portal link with bid & cid, 
 * and dispatches the alert to BOTH Email & WhatsApp.
 */
export async function triggerInvoiceCreatedNotifications(
  businessId: string,
  invoiceData: { 
    invoiceNumber: string; 
    total: number; 
    customerId: string;
    customerEmail?: string;
    customerPhone?: string;
    customerName?: string;
  }
) {
  try {
    if (!invoiceData.customerId || invoiceData.customerId === 'Walk-in') return;
    
    // 1. Fetch business details
    const bizDoc = await getDoc(doc(db, 'businesses', businessId));
    const bizData = bizDoc.exists() ? bizDoc.data() : null;
    
    let customerEmail = invoiceData.customerEmail;
    let customerPhone = invoiceData.customerPhone;
    let customerName = invoiceData.customerName || 'Cliente';
    
    // 2. Fetch customer details if not supplied inline
    if (!customerEmail && !customerPhone) {
      const custDoc = await getDoc(doc(db, `businesses/${businessId}/customers`, invoiceData.customerId));
      if (custDoc.exists()) {
        const custData = custDoc.data();
        customerEmail = custData.email;
        customerPhone = custData.phone;
        customerName = custData.name || customerName;
      } else {
        console.warn(`[NotificationService] Customer ${invoiceData.customerId} not found for business ${businessId}`);
        if (invoiceData.customerId !== 'Online-Customer') {
          return;
        }
      }
    }
    
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://sabush-erp.web.app';
    const portalLink = `${origin}/portal?bid=${businessId}&cid=${invoiceData.customerId}`;
    
    // 3. Trigger Email
    if (customerEmail) {
      const { sendInvoiceClientEmail } = await import('./emailService');
      await sendInvoiceClientEmail(customerEmail, customerName, invoiceData.invoiceNumber, invoiceData.total, portalLink);
    }
    
    // 4. Trigger WhatsApp
    if (customerPhone) {
      const { sendInvoiceClientWhatsApp } = await import('./whatsappService');
      const whatsappApiKey = bizData?.whatsappConfig?.apiKey || '';
      const whatsappPhoneNumberId = bizData?.whatsappConfig?.phoneNumberId || '';
      
      await sendInvoiceClientWhatsApp(
        customerPhone,
        customerName,
        invoiceData.invoiceNumber,
        invoiceData.total,
        portalLink,
        whatsappApiKey,
        whatsappPhoneNumberId
      );
    }
  } catch (err) {
    console.error('[NotificationService] triggerInvoiceCreatedNotifications error:', err);
  }
}

/**
 * Automatically dispatches quotation update alerts to both Email & WhatsApp.
 */
export async function triggerQuotationPriceUpdatedNotifications(
  businessId: string,
  quotationData: {
    quotationNumber: string;
    total: number;
    customerId: string;
    customerEmail?: string;
    customerPhone?: string;
    customerName?: string;
  }
) {
  try {
    if (!quotationData.customerId || quotationData.customerId === 'Walk-in') return;

    // 1. Fetch business details
    const bizDoc = await getDoc(doc(db, 'businesses', businessId));
    const bizData = bizDoc.exists() ? bizDoc.data() : null;

    let customerEmail = quotationData.customerEmail;
    let customerPhone = quotationData.customerPhone;
    let customerName = quotationData.customerName || 'Cliente';

    // 2. Fetch customer details if not supplied inline
    if (!customerEmail && !customerPhone) {
      const custDoc = await getDoc(doc(db, `businesses/${businessId}/customers`, quotationData.customerId));
      if (custDoc.exists()) {
        const custData = custDoc.data();
        customerEmail = custData.email;
        customerPhone = custData.phone;
        customerName = custData.name || customerName;
      }
    }

    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://sabush-erp.web.app';
    const portalLink = `${origin}/portal?bid=${businessId}&cid=${quotationData.customerId}`;

    // 3. Trigger Email
    if (customerEmail) {
      const { sendQuotationUpdatedEmail } = await import('./emailService');
      await sendQuotationUpdatedEmail(customerEmail, customerName, quotationData.quotationNumber, quotationData.total, portalLink);
    }

    // 4. Trigger WhatsApp
    if (customerPhone) {
      const { sendQuotationUpdatedWhatsApp } = await import('./whatsappService');
      const whatsappApiKey = bizData?.whatsappConfig?.apiKey || '';
      const whatsappPhoneNumberId = bizData?.whatsappConfig?.phoneNumberId || '';

      await sendQuotationUpdatedWhatsApp(
        customerPhone,
        customerName,
        quotationData.quotationNumber,
        quotationData.total,
        portalLink,
        whatsappApiKey,
        whatsappPhoneNumberId
      );
    }
  } catch (err) {
    console.error('[NotificationService] triggerQuotationPriceUpdatedNotifications error:', err);
  }
}

/**
 * Notifies all customers of a business whenever a brand new product is created,
 * or an existing product is restocked (stock has gone from <= 0 to > 0).
 */
export async function triggerProductAlertNotifications(
  businessId: string,
  productData: { name: string; onlinePrice: number },
  isNewProduct: boolean
) {
  try {
    // 1. Fetch business details
    const bizDoc = await getDoc(doc(db, 'businesses', businessId));
    const bizData = bizDoc.exists() ? bizDoc.data() : null;
    
    // 2. Fetch all customers
    const customersRef = collection(db, `businesses/${businessId}/customers`);
    const customersSnap = await getDocs(customersRef);
    if (customersSnap.empty) return;
    
    const customersList = customersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://sabush-erp.web.app';
    const { sendProductRestockedEmail } = await import('./emailService');
    const { sendProductRestockedWhatsApp } = await import('./whatsappService');
    
    const whatsappApiKey = bizData?.whatsappConfig?.apiKey || '';
    const whatsappPhoneNumberId = bizData?.whatsappConfig?.phoneNumberId || '';
    
    for (const cust of customersList as any[]) {
      const portalLink = `${origin}/portal?bid=${businessId}&cid=${cust.id}`;
      
      if (cust.email) {
        sendProductRestockedEmail(cust.email, cust.name || 'Cliente', productData.name, !isNewProduct, productData.onlinePrice, portalLink)
          .catch(err => console.error(`[NotificationService] Restock email failed for ${cust.email}:`, err));
      }
      
      if (cust.phone) {
        sendProductRestockedWhatsApp(
          cust.phone,
          cust.name || 'Cliente',
          productData.name,
          !isNewProduct,
          productData.onlinePrice,
          portalLink,
          whatsappApiKey,
          whatsappPhoneNumberId
        ).catch(err => console.error(`[NotificationService] Restock WhatsApp failed for ${cust.phone}:`, err));
      }
    }
  } catch (err) {
    console.error('[NotificationService] triggerProductAlertNotifications error:', err);
  }
}

