import { Request, Response, NextFunction } from 'express';
import { getTenantById, Tenant } from '../services/tenantService';
import { logger } from '../utils/logger';

declare global {
    namespace Express {
        interface Request {
            tenant?: Tenant;
        }
    }
}

export async function withTenant(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    const tenantId: string | undefined = req.body?.tenantId;

    if (!tenantId) {
        res.status(400).json({ error: 'Missing tenantId in request body' });
        return;
    }

    try {
        const tenant = await getTenantById(tenantId);

        if (!tenant) {
            logger.warn('TenantMiddleware', `Unknown tenant: ${tenantId}`);
            res.status(404).json({ error: `Tenant "${tenantId}" not found` });
            return;
        }

        req.tenant = tenant;
        logger.debug('TenantMiddleware', `Tenant resolved: ${tenant.name} (${tenant.id})`);
        next();
    } catch (err) {
        logger.error('TenantMiddleware', 'Failed to resolve tenant', err);
        next(err);
    }
}
