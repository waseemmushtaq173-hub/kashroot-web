export interface SMSPayload {
  phone: string;
  message: string;
}

export const SMSAdapter = {
  sendSMS: async (payload: SMSPayload) => {
    // Mock SMS delivery for basic phones (feature phones without internet)
    console.log(`[SMS Adapter] Sending SMS to ${payload.phone}`);
    console.log(`[SMS Adapter] Content: "${payload.message}"`);
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 300));
    
    return { delivered: true, timestamp: new Date().toISOString() };
  },

  sendWeatherAlert: async (phone: string, alertText: string) => {
    return SMSAdapter.sendSMS({
      phone,
      message: `KashRoot Weather Alert: ${alertText}`
    });
  },

  sendOrderStatus: async (phone: string, orderId: string, status: string) => {
    return SMSAdapter.sendSMS({
      phone,
      message: `Your KashRoot Order ${orderId} is now: ${status}.`
    });
  }
};
