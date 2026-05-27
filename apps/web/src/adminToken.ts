const ADMIN_TOKEN_STORAGE_KEY = "stock-analytics-admin-token";

export function readStoredAdminToken(): string {
  if (typeof window === "undefined") {
    return "";
  }
  return window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY)?.trim() ?? "";
}

export function storeAdminToken(adminToken: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, adminToken.trim());
}
