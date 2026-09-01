import { createClient as createBrowserClient } from "@/lib/supabase/client";
import type {
  ApplicationCreate,
  ApplicationResponse,
  CopilotResponse,
  CustomerCreate,
  CustomerDetailResponse,
  CustomerResponse,
  DashboardMetrics,
  ExplanationResponse,
  FinancialHealthResponse,
  FraudRiskResponse,
  RiskAssessmentResponse,
  UserProfile,
} from "@/types/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

async function getAuthToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;

  try {
    const supabase = createBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) return session.access_token;
  } catch {
    // Supabase not configured; fall through to legacy token.
  }

  return localStorage.getItem("access_token");
}

async function fetchAPI<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const token = await getAuthToken();

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: "include",
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, payload.detail || `API error: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export async function getCurrentUser(): Promise<UserProfile | null> {
  if (typeof window === "undefined") return null;

  try {
    const supabase = createBrowserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      return {
        id: user.id,
        email: user.email || "",
        role: (user.app_metadata?.role as string) || "LOAN_OFFICER",
      };
    }
  } catch {
    // fall through to legacy user
  }

  const raw = localStorage.getItem("user");
  return raw ? (JSON.parse(raw) as UserProfile) : null;
}

// Legacy login path for local development until Supabase Auth is wired end-to-end.
export async function legacyLogin(email: string, password: string) {
  const result = await fetchAPI<{ access_token: string; user: UserProfile }>(
    "/api/v1/auth/login",
    {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }
  );

  if (typeof window !== "undefined") {
    localStorage.setItem("access_token", result.access_token);
    localStorage.setItem("user", JSON.stringify(result.user));
    if (process.env.NODE_ENV !== "production") {
      document.cookie = "legacy_session=1; path=/; max-age=28800; samesite=lax";
    }
  }

  return result;
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  return fetchAPI<DashboardMetrics>("/api/v1/dashboard/metrics");
}

export async function getCustomers(): Promise<CustomerResponse[]> {
  return fetchAPI<CustomerResponse[]>("/api/v1/customers");
}

export async function getCustomer(id: number): Promise<CustomerDetailResponse> {
  return fetchAPI<CustomerDetailResponse>(`/api/v1/customers/${id}`);
}

export async function createCustomer(
  data: CustomerCreate
): Promise<CustomerDetailResponse> {
  return fetchAPI<CustomerDetailResponse>("/api/v1/customers", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getApplications(): Promise<ApplicationResponse[]> {
  return fetchAPI<ApplicationResponse[]>("/api/v1/applications");
}

export async function getApplication(id: number): Promise<ApplicationResponse> {
  return fetchAPI<ApplicationResponse>(`/api/v1/applications/${id}`);
}

export async function createApplication(
  data: ApplicationCreate
): Promise<ApplicationResponse> {
  return fetchAPI<ApplicationResponse>("/api/v1/applications", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function runRiskAssessment(
  applicationId: number
): Promise<RiskAssessmentResponse> {
  return fetchAPI<RiskAssessmentResponse>("/api/v1/risk-assessment", {
    method: "POST",
    body: JSON.stringify({ application_id: applicationId }),
  });
}

export async function getRiskAssessment(
  id: number
): Promise<RiskAssessmentResponse> {
  return fetchAPI<RiskAssessmentResponse>(`/api/v1/risk-assessment/${id}`);
}

export async function getFraudRisk(customerId: number): Promise<FraudRiskResponse> {
  return fetchAPI<FraudRiskResponse>(`/api/v1/customers/${customerId}/fraud-risk`);
}

export async function getExplanation(
  customerId: number
): Promise<ExplanationResponse> {
  return fetchAPI<ExplanationResponse>(`/api/v1/customers/${customerId}/explanation`);
}

export async function getFinancialHealth(
  customerId: number
): Promise<FinancialHealthResponse> {
  return fetchAPI<FinancialHealthResponse>(
    `/api/v1/customers/${customerId}/financial-health`
  );
}

export async function copilotQuery(
  customerId: number,
  question: string
): Promise<CopilotResponse> {
  return fetchAPI<CopilotResponse>("/api/v1/copilot/query", {
    method: "POST",
    body: JSON.stringify({ customer_id: customerId, question }),
  });
}

export async function getModelMetrics(): Promise<Record<string, unknown>> {
  return fetchAPI<Record<string, unknown>>("/api/v1/model/metrics");
}
