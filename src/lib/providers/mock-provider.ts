import type {
  IDNSProvider,
  DNSRecordData,
  DNSRecordType,
  DomainData,
  OperationResult,
} from './base';
import { ok, fail } from './utils';

/**
 * Mock DNS Provider —— 用于单元测试和集成测试。
 *
 * 所有数据存储在内存中，可通过构造参数预设行为：
 * - records: 预置记录
 * - domains: 预置域名
 * - failOn: 指定方法抛出错误（用于测试错误处理）
 * - latencyMs: 模拟调用延迟（用于测试超时）
 *
 * 用法：
 *   const mock = new MockProvider({ records: [...], failOn: 'deleteRecord' });
 *   const result = await mock.deleteRecord('example.com', '123');
 *   expect(result.success).toBe(false);
 */
export interface MockProviderOptions {
  records?: DNSRecordData[];
  domains?: DomainData[];
  /** 指定方法名使其总是返回失败 */
  failOn?: keyof IDNSProvider;
  /** 模拟网络延迟（毫秒） */
  latencyMs?: number;
  /** 自定义 name 属性 */
  name?: string;
}

export class MockProvider implements IDNSProvider {
  readonly name: string;
  private records: Map<string, DNSRecordData>; // key = `${domainName}:${id}`
  private domains: DomainData[];
  private nextId = 1;
  private failOn?: keyof IDNSProvider;
  private latencyMs: number;

  constructor(options: MockProviderOptions = {}) {
    this.name = options.name ?? 'mock';
    this.records = new Map();
    this.domains = options.domains ?? [{ id: 'zone-1', name: 'example.com', status: 'active' }];
    this.failOn = options.failOn;
    this.latencyMs = options.latencyMs ?? 0;

    for (const r of options.records ?? []) {
      this.records.set(`${r.id}`, r);
    }
  }

  private async delay(): Promise<void> {
    if (this.latencyMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.latencyMs));
    }
  }

  private shouldFail(method: keyof IDNSProvider): boolean {
    return this.failOn === method;
  }

  async testConnection(): Promise<OperationResult> {
    await this.delay();
    if (this.shouldFail('testConnection')) {
      return fail(new Error('Mock: testConnection failed'), 'Connection failed');
    }
    return ok();
  }

  async listDomains(): Promise<OperationResult<DomainData[]>> {
    await this.delay();
    if (this.shouldFail('listDomains')) {
      return fail(new Error('Mock: listDomains failed'), 'List domains failed');
    }
    return ok([...this.domains]);
  }

  async listRecords(domainName: string): Promise<OperationResult<DNSRecordData[]>> {
    await this.delay();
    if (this.shouldFail('listRecords')) {
      return fail(new Error('Mock: listRecords failed'), 'List records failed');
    }
    // 返回所有记录（Mock 不严格按域名过滤，测试用）
    const all = Array.from(this.records.values());
    return ok(all);
  }

  async addRecord(
    domainName: string,
    record: Omit<DNSRecordData, 'id'>
  ): Promise<OperationResult<DNSRecordData>> {
    await this.delay();
    if (this.shouldFail('addRecord')) {
      return fail(new Error('Mock: addRecord failed'), 'Add record failed');
    }
    // 冲突检测（同名同类型）
    for (const existing of this.records.values()) {
      if (existing.type === record.type && existing.name === record.name) {
        return fail(new Error('duplicate record'), 'Record already exists');
      }
    }
    const id = `rec-${this.nextId++}`;
    const newRecord: DNSRecordData = { ...record, id };
    this.records.set(id, newRecord);
    return ok(newRecord);
  }

  async updateRecord(
    domainName: string,
    recordId: string,
    changes: Partial<DNSRecordData>
  ): Promise<OperationResult<DNSRecordData>> {
    await this.delay();
    if (this.shouldFail('updateRecord')) {
      return fail(new Error('Mock: updateRecord failed'), 'Update record failed');
    }
    const existing = this.records.get(recordId);
    if (!existing) {
      return fail(new Error('not found'), 'Record not found');
    }
    const updated: DNSRecordData = { ...existing, ...changes, id: recordId };
    this.records.set(recordId, updated);
    return ok(updated);
  }

  async deleteRecord(domainName: string, recordId: string): Promise<OperationResult> {
    await this.delay();
    if (this.shouldFail('deleteRecord')) {
      return fail(new Error('Mock: deleteRecord failed'), 'Delete record failed');
    }
    if (!this.records.has(recordId)) {
      return fail(new Error('not found'), 'Record not found');
    }
    this.records.delete(recordId);
    return ok();
  }

  // ============================================================
  // 测试辅助方法（不属于 IDNSProvider 接口）
  // ============================================================

  /** 获取当前内存中的所有记录（测试断言用） */
  getRecords(): DNSRecordData[] {
    return Array.from(this.records.values());
  }

  /** 按 ID 获取单条记录 */
  getRecord(id: string): DNSRecordData | undefined {
    return this.records.get(id);
  }

  /** 重置 Mock 状态 */
  reset(options: MockProviderOptions = {}): void {
    this.records.clear();
    this.domains = options.domains ?? [{ id: 'zone-1', name: 'example.com', status: 'active' }];
    this.failOn = options.failOn;
    this.latencyMs = options.latencyMs ?? 0;
    this.nextId = 1;
    for (const r of options.records ?? []) {
      this.records.set(r.id, r);
    }
  }
}
