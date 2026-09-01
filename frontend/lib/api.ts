const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("access_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchAPI(path: string, options: RequestInit = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...options.headers,
    },
    credentials: "include",
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `API error: ${res.status}`);
  }

  return res.json();
}

export async function login(email: string, password: string) {
  return fetchAPI("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function getDashboardMetrics() {
  return fetchAPI("/api/v1/dashboard/metrics");
}

export async function getCustomers() {
  return fetchAPI("/api/v1/customers");
}

export async function getCustomer(id: number) {
  return fetchAPI(`/api/v1/customers/${id}`);
}

export async function createCustomer(data: any) {
  return fetchAPI("/api/v1/customers", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function createApplication(customerId: number, amount: number, tenure: number) {
  return fetchAPI("/api/v1/applications", {
    method: "POST",
    body: JSON.stringify({
      customer_id: customerId,
      requested_amount: amount,
      requested_tenure_months: tenure,
    }),
  });
}

export async function runRiskAssessment(applicationId: number) {
  return fetchAPI("/api/v1/risk-assessment", {
    method: "POST",
    body: JSON.stringify({ application_id: applicationId }),
  });
}

export async function getRiskAssessment(id: number) {
  return fetchAPI(`/api/v1/risk-assessment/${id}`);
}

export async function getFraudRisk(customerId: number) {
  return fetchAPI(`/api/v1/customers/${customerId}/fraud-risk`);
}

export async function getExplanation(customerId: number) {
  return fetchAPI(`/api/v1/customers/${customerId}/explanation`);
}

export async function getFinancialHealth(customerId: number) {
  return fetchAPI(`/api/v1/customers/${customerId}/financial-health`);
}

export async function copilotQuery(customerId: number, question: string) {
  return fetchAPI("/api/v1/copilot/query", {
    method: "POST",
    body: JSON.stringify({ customer_id: customerId, question }),
  });
}
