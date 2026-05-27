export interface SecretFieldLike {
  label: string;
  value?: string;
}

export function summarizeSecretFields(item: { fields?: SecretFieldLike[] }): string[];
export function secretReadinessGate(item: { fields?: SecretFieldLike[] }): { ok: boolean; reasons: string[] };
