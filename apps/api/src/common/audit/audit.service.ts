import { Global, Injectable, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

type Db = Prisma.TransactionClient | PrismaService;

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

/** Append-only record of privileged actions (the table rejects UPDATE/DELETE). */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(req: Request, entry: AuditEntry, db: Db = this.prisma) {
    return db.auditLog.create({
      data: {
        actorId: req.user?.id,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        before: toJson(entry.before),
        after: toJson(entry.after),
        requestId: typeof req.id === 'string' ? req.id : String(req.id ?? ''),
        ipAddress: req.ip?.slice(0, 45),
        userAgent: req.headers['user-agent']?.slice(0, 255),
      },
    });
  }
}

function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) return Prisma.JsonNull;
  return JSON.parse(JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? Number(v) : v)));
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
