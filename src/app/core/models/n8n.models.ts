export interface N8nWorkflow {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface N8nExecution {
  id: string;
  workflowId: string;
  workflowName?: string;
  status: 'success' | 'error' | 'running' | 'waiting' | 'canceled';
  startedAt: string;
  stoppedAt?: string;
  mode: string;
}

export interface N8nWorkflowsResponse {
  data: N8nWorkflow[];
}

export interface N8nExecutionsResponse {
  data: N8nExecution[];
}

export interface WorkflowUseCase {
  id: string;
  title: string;
  trigger: string;
  steps: string[];
  color: string;
  webhookPath: string;
  samplePayload: Record<string, unknown>;
}

export const WORKFLOW_USE_CASES: WorkflowUseCase[] = [
  {
    id: 'customer-support',
    title: 'Customer Support',
    trigger: 'New Support Ticket',
    steps: ['AI Categorize', 'Assign Department', 'Notify Slack'],
    color: 'border-emerald-500/40 bg-emerald-500/10',
    webhookPath: 'support-ticket',
    samplePayload: {
      ticketId: 'TKT-1001',
      subject: 'Payment failed on my subscription',
      body: 'I was charged twice for my monthly plan. Please help with a refund.',
    },
  },
  {
    id: 'ecommerce',
    title: 'E-commerce',
    trigger: 'New Order',
    steps: ['Check Inventory', 'Generate Invoice', 'Send Customer Email'],
    color: 'border-amber-500/40 bg-amber-500/10',
    webhookPath: 'new-order',
    samplePayload: {
      orderId: 'ORD-5001',
      customerName: 'Ali Khan',
      email: 'ali@example.com',
      total: 149.99,
      items: [{ name: 'Wireless Headphones', sku: 'WH-100', qty: 1, price: 149.99 }],
    },
  },
  {
    id: 'ai-content',
    title: 'AI Content Pipeline',
    trigger: 'Topic',
    steps: ['AI Generate Blog', 'SEO Check', 'Approve', 'Publish'],
    color: 'border-violet-500/40 bg-violet-500/10',
    webhookPath: 'content-topic',
    samplePayload: {
      topic: 'Workflow Automation with n8n',
    },
  },
];
