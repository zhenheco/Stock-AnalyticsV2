export interface CompleteProductionOptions {
  run?: (command: string, args: string[]) => Promise<void>;
}

export function completeProduction(options?: CompleteProductionOptions): Promise<string[]>;
