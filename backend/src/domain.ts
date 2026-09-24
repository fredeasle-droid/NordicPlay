export type OrderStatus =
  | "pending_payment"
  | "payment_review"
  | "paid"
  | "provisioning"
  | "active"
  | "failed"
  | "cancelled";

export type VerificationStatus = "requested" | "number_ready" | "sms_received" | "completed" | "failed" | "expired";

export interface CustomerIdentity {
  telegramUserId: string;
}

export interface Order {
  id: string;
  telegramUserId: string;
  productId: string;
  amountDkk: number;
  status: OrderStatus;
  createdAt: string;
}

export interface EsimProvider {
  provision(input: { productId: string; telegramUserId: string }): Promise<{ externalId: string; phoneNumbers: string[] }>;
  deactivate(externalId: string): Promise<void>;
  getUsage(externalId: string): Promise<{ voiceMinutesRemaining?: number; smsRemaining?: number }>;
  topUp(externalId: string, minutes: number): Promise<void>;
}

export interface VerificationProvider {
  createVerification(input: { service: string; country: string }): Promise<{ externalId: string; phoneNumber: string }>;
  getVerification(externalId: string): Promise<{ status: VerificationStatus; code?: string }>;
  cancelVerification(externalId: string): Promise<void>;
}
