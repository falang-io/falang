import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { IntegrationVendorData } from './integration-vendor-data.entity.js';

/**
 * CRUD over `integration_vendor_data` — see the entity's own doc comment and
 * ADR 0039 (private) §4. Deliberately knows nothing about any specific
 * vendor or `key` (e.g. `'schema'`) — that's the caller's concern.
 */
@Injectable()
export class IntegrationVendorDataService {
  private readonly vendorData: Repository<IntegrationVendorData>;

  constructor(@InjectRepository(IntegrationVendorData) vendorData: Repository<IntegrationVendorData>) {
    this.vendorData = vendorData;
  }

  async get(projectId: string, instanceId: string, key: string): Promise<Record<string, unknown> | null> {
    const row = await this.vendorData.findOneBy({ projectId, instanceId, key });
    return row?.data ?? null;
  }

  /** Every stored key for one instance, `key -> data`. `{}` if nothing has ever been synced for it. */
  async getAll(projectId: string, instanceId: string): Promise<Record<string, Record<string, unknown>>> {
    const rows = await this.vendorData.find({ where: { projectId, instanceId } });
    const result: Record<string, Record<string, unknown>> = {};
    for (const row of rows) result[row.key] = row.data;
    return result;
  }

  async set(
    projectId: string,
    instanceId: string,
    vendor: string,
    key: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const existing = await this.vendorData.findOneBy({ projectId, instanceId, key });
    const row = this.vendorData.create({ ...existing, projectId, instanceId, key, vendor, data });
    await this.vendorData.save(row);
  }

  async remove(projectId: string, instanceId: string, key: string): Promise<void> {
    await this.vendorData.delete({ projectId, instanceId, key });
  }

  /** All keys for one instance — called when the instance itself is removed from the `integrations` document (or the document is deleted). */
  async removeForInstance(projectId: string, instanceId: string): Promise<void> {
    await this.vendorData.delete({ projectId, instanceId });
  }
}
