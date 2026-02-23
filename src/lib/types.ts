export interface Matter {
  rowIndex: number;
  clioMatter: string;
  matterName: string;
  clientFullName: string;
  responsiblePerson: string;
  statusClio: string;
  currentStatus: string;
  notes: string;
  clioPaid: number;
  clioOutstanding: number;
  clioBillable: number;
  clioNonBillable: number;
  observations: string;
  area: string;
  openDate: string;
  nextStepAndWho: string;
  lastWaSent: string;
  daysSinceLastWa: number | string;
  nextWaDue: string;
  sendWaUpdate: boolean;
  whatsAppPhone: string;
  waMessageSent: string;
}

export interface BillingSummary {
  totalOutstanding: number;
  totalPaid: number;
  clientsOwing: number;
  totalMatters: number;
  owingMatters: OwingMatter[];
}

export interface OwingMatter {
  clioMatter: string;
  clientName: string;
  matterName: string;
  outstanding: number;
  paid: number;
  responsiblePerson: string;
  area: string;
  status: string;
  whatsAppPhone: string;
  daysSinceLastWa: number | string;
}

export interface WorkloadItem {
  person: string;
  matterCount: number;
  totalOutstanding: number;
  totalPaid: number;
  matters: Matter[];
}

export interface WhatsAppRow {
  rowIndex: number;
  clioMatter: string;
  clientFullName: string;
  whatsAppPhone: string;
  lastWaSent: string;
  daysSinceLastWa: number | string;
  nextWaDue: string;
  sendWaUpdate: boolean;
  waMessageSent: string;
  statusClio: string;
  currentStatus: string;
  responsiblePerson: string;
  clioOutstanding: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
