export type SubscriptionCurrentResponse = {
  plan: string;
  price: number;
  status: string;
  paymentMethod: string;
  renewDate: string;
  renewsInDays: number;
  nextInvoiceAmount: number;
  lastPaymentDate: string;
};

export type SubscriptionInvoice = {
  id: string;
  date: string;
  amount: number;
  status: string;
};

export type SubscriptionInvoicesResponse = {
  page: number;
  pageSize: number;
  total: number;
  hasNextPage: boolean;
  data: SubscriptionInvoice[];
};

export type GetSubscriptionInvoicesQuery = {
  page?: number;
  pageSize?: number;
};

export type RenewSubscriptionPayload = {
  paymentMethodId?: string;
};

export type RenewSubscriptionResponse = {
  success: boolean;
  renewDate: string;
};

export type CancelSubscriptionPayload = {
  password: string;
};

export type CancelSubscriptionResponse = {
  success?: boolean;
  status?: string;
};
