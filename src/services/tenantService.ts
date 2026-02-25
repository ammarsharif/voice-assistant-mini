import { supabase } from '../db/client';

export interface Tenant {
    id: string;
    name: string;
    system_prompt: string;
    created_at: string;
}

export async function getTenantById(tenantId: string): Promise<Tenant | null> {
    const { data, error } = await supabase
        .from('tenants')
        .select('id, name, system_prompt, created_at')
        .eq('id', tenantId)
        .single();

    if (error) {
        if (error.code === 'PGRST116') return null;
        throw new Error(`Failed to fetch tenant: ${error.message}`);
    }

    return data as Tenant;
}
