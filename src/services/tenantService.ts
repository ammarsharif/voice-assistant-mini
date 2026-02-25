import { db } from '../config/db';
import { logger } from '../utils/logger';

export interface Tenant {
    id: string;
    name: string;
    system_prompt: string;
    created_at: string;
}

export async function getTenantById(tenantId: string): Promise<Tenant | null> {
    const { data, error } = await db
        .from('tenants')
        .select('id, name, system_prompt, created_at')
        .eq('id', tenantId)
        .single();

    if (error) {
        if (error.code === 'PGRST116') {
            logger.debug('TenantService', `Tenant not found: ${tenantId}`);
            return null;
        }
        throw new Error(`Failed to fetch tenant: ${error.message}`);
    }

    return data as Tenant;
}

export async function requireTenant(tenantId: string): Promise<Tenant> {
    const tenant = await getTenantById(tenantId);
    if (!tenant) {
        throw Object.assign(
            new Error(`Tenant "${tenantId}" not found`),
            { statusCode: 404 }
        );
    }
    return tenant;
}
