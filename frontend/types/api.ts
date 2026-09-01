export interface CustomerCreate {
  name: string;
  employment_type: string;
  monthly_income: number;
  monthly_expenses: number;
  age?: number;
  transaction_count?: number;
  avg_transaction?: number;
  cashflow_volatility?: number;
  digital_payment_ratio?: number;
  account_age_months?: number;
  income_stability?: number;
  repayment_history?: number;
  late_payment_count?: number;
  existing_debt?: number;
  suspicious_transaction_count?: number;
  connected_accounts?: number;
  merchant_count?: number;
  loan_amount?: number;
  loan_term?: number;
  device_fingerprint?: string | null;
  employment_months?: number;
  credit_history_months?: number;
}

export interface CustomerResponse {
  id: number;
  name: string;
  employment_type: string;
  monthly_income: number;
  monthly_expenses: number;
  created_at: string;
}

export interface FinancialProfileResponse {
  id: number;
  customer_id: number;
  transaction_count: number;
  avg_transaction: number;
  cashflow_volatility: number;
  digital_payment_ratio: number;
  account_age_months: number;
  income_stability: number;
  repayment_history: number;
  late_payment_count: number;
  existing_debt: number;
  suspicious_transaction_count: number;
  connected_accounts: number;
  merchant_count: number;
  age: number;
  loan_amount: number;
  loan_term: number;
  device_fingerprint: string | null;
}

export interface CustomerDetailResponse extends CustomerResponse {
  financial_profile: FinancialProfileResponse | null;
}

export interface ApplicationCreate {
  customer_id: number;
  requested_amount: number;
  requested_tenure_months: number;
}

export interface ApplicationResponse {
  id: number;
  customer_id: number;
  requested_amount: number;
  requested_tenure_months: number;
  status: string;
  created_at: string;
}

export interface RiskFactorResponse {
  factor: string;
  direction: string;
  weight: number;
}

export interface RiskAssessmentResponse {
  id: number;
  application_id: number;
  credit_score: number | null;
  repayment_probability: number | null;
  risk_level: string | null;
  decision: string | null;
  recommended_amount: number | null;
  recommended_tenure_months: number | null;
  fraud_flag: boolean;
  fraud_score: number | null;
  top_factors: RiskFactorResponse[];
  created_at: string;
}

export interface FraudAlertResponse {
  id: number;
  alert_type: string;
  severity: string;
  description: string | null;
  created_at: string;
}

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  highlighted: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
  weight: number;
}

export interface FraudRiskResponse {
  customer_id: number;
  fraud_alerts: FraudAlertResponse[];
  graph_data: {
    nodes: GraphNode[];
    edges: GraphEdge[];
  } | null;
  risk_cluster_detected: boolean;
}

export interface ExplanationResponse {
  customer_id: number;
  positive_factors: string[];
  negative_factors: string[];
}

export interface FinancialHealthPoint {
  month: number;
  credit_score: number | null;
  risk_level: string | null;
  income: number | null;
  expenses: number | null;
  distress_flag: boolean;
  note: string | null;
  synthetic: boolean;
}

export interface FinancialHealthResponse {
  customer_id: number;
  timeline: FinancialHealthPoint[];
}

export interface CopilotResponse {
  customer_id: number;
  question: string;
  answer: string;
  sources_referenced: string[];
  grounded_fields: string[];
  decision_source: string;
  disclaimer: string;
  mode: string;
}

export interface DashboardMetrics {
  total_customers: number;
  total_applications: number;
  applications_today: number;
  approval_rate: number;
  high_risk_count: number;
  fraud_alerts_count: number;
  early_warnings: number;
  portfolio_risk_distribution: Record<string, number>;
}

export interface UserProfile {
  id: string;
  email: string;
  role?: string;
}

export interface ApiError {
  status: number;
  detail: string;
}
