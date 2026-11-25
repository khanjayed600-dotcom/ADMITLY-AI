declare module 'node:sqlite' {
  export interface StatementResult {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }

  export interface StatementSync {
    run(...params: unknown[]): StatementResult;
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Array<Record<string, unknown>>;
  }

  export class DatabaseSync {
    constructor(location: string, options?: { open?: boolean; readOnly?: boolean });
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
