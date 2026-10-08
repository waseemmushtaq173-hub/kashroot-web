export interface WhatsAppMessagePayload {
  to: string;
  templateId?: string;
  body?: string;
  interactiveOptions?: string[];
}

export const WhatsAppAdapter = {
  sendMessage: async (payload: WhatsAppMessagePayload) => {
    console.log(`[WhatsApp Adapter] Sending message to ${payload.to}`);
    if (payload.templateId) {
      console.log(`[WhatsApp Adapter] Using template: ${payload.templateId}`);
    } else {
      console.log(`[WhatsApp Adapter] Body: ${payload.body}`);
    }
    
    if (payload.interactiveOptions) {
      console.log(`[WhatsApp Adapter] Interactive Options: ${payload.interactiveOptions.join(', ')}`);
    }
    
    return { success: true, messageId: `wa-${Date.now()}` };
  },
  
  sendPriceAlert: async (phone: string, crop: string, price: string) => {
    return WhatsAppAdapter.sendMessage({
      to: phone,
      body: `KashRoot Alert: ${crop} prices are currently at ${price}. Reply with 1 to SELL.`,
      interactiveOptions: ['1. SELL', '2. VIEW MORE']
    });
  }
};
