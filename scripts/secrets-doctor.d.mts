export interface SecretFieldLike {
  label: string;
  value?: string;
}

export function summarizeSecretFields(item: { fields?: SecretFieldLike[] }): string[];
