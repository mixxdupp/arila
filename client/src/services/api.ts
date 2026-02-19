import { API_BASE } from "../utils/constants";

interface ApiOptions {
  method?: string;
  body?: unknown;
}

interface ApiError {
  error: string;
  details?: Record<string, string[]>;
}

export class ApiRequestError extends Error {
  status: number;
  details?: Record<string, string[]>;

  constructor(message: string, status: number, details?: Record<string, string[]>) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.details = details;
  }
}

async function request<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const { method = "GET", body } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "include",
  });

  if (!response.ok) {
    let errorData: ApiError;
    try {
      errorData = (await response.json()) as ApiError;
    } catch {
      errorData = { error: "Request failed" };
    }
    throw new ApiRequestError(errorData.error, response.status, errorData.details);
  }

  return (await response.json()) as T;
}

export const api = {
  get<T>(endpoint: string): Promise<T> {
    return request<T>(endpoint);
  },

  post<T>(endpoint: string, body: unknown): Promise<T> {
    return request<T>(endpoint, { method: "POST", body });
  },

  delete<T>(endpoint: string): Promise<T> {
    return request<T>(endpoint, { method: "DELETE" });
  },
};
