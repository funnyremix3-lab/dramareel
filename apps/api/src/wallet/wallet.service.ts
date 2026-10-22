import { Global, Injectable, Module } from '@nestjs/common';
import { Prisma, WalletTransaction, WalletTxnType } from '@prisma/client';
import { AppException } from '../common/errors/app-exception';
import { CursorQuery, offsetPage } from '../common/pagination/cursor';
import { PrismaService } from '../common/prisma/prisma.service';

export interface LedgerEntry {
  userId: string;
  /** Signed coin delta: positive credits, negative debits. Never zero. */
  amount: number;
  type: WalletTxnType;
  /** Unique per business event, e.g. `reward:{claimId}`. Replays return the original row. */
  idempotencyKey: string;
  referenceType?: string;
  referenceId?: string;
  actorId?: string;
  note?: string;
  /** For reversals: debit at most the available balance instead of failing. */
  clampToBalance?: boolean;
}

export interface PostResult {
  /** The ledger row; null only when a clamped reversal found nothing to take. */
  transaction: WalletTransaction | null;
  /** False when the idempotency key had already been used, or nothing could be taken. */
  applied: boolean;
  /** Coins a clamped reversal could not recover (the caller records/flags this). */
  shortfall: number;
}

/**
 * The only code path that changes coin balances (docs/database.md "Wallet write algorithm").
 * Must run inside a caller's transaction so the side effect (unlock, claim, payment) commits atomically.
 */
@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async post(tx: Prisma.TransactionClient, entry: LedgerEntry): Promise<PostResult> {
    if (!Number.isSafeInteger(entry.amount) || entry.amount === 0) {
      throw new Error('Ledger amount must be a non-zero integer');
    }

    // Serialise all writes for this wallet; creates the wallet lazily if missing.
    await tx.$executeRaw`INSERT INTO user_wallets (user_id, balance, version, created_at, updated_at)
                         VALUES (${entry.userId}::uuid, 0, 0, now(), now()) ON CONFLICT (user_id) DO NOTHING`;
    const [wallet] = await tx.$queryRaw<{ balance: number }[]>`
      SELECT balance FROM user_wallets WHERE user_id = ${entry.userId}::uuid FOR UPDATE`;

    const existing = await tx.walletTransaction.findUnique({ where: { idempotencyKey: entry.idempotencyKey } });
    if (existing) {
      if (existing.userId !== entry.userId) throw new Error('Idempotency key reused across users');
      return { transaction: existing, applied: false, shortfall: 0 };
    }

    let amount = entry.amount;
    if (wallet.balance + amount < 0) {
      if (!entry.clampToBalance) {
        throw new AppException('INSUFFICIENT_COINS', 'Not enough coins', { balance: wallet.balance, required: -amount });
      }
      amount = -wallet.balance;
    }
    const shortfall = amount - entry.amount; // > 0 only when clamped
    if (amount === 0) return { transaction: null, applied: false, shortfall };

    const balanceAfter = wallet.balance + amount;
    const note = shortfall ? `${entry.note ?? ''} [requested ${entry.amount}, shortfall ${shortfall}]`.trim() : entry.note;
    const transaction = await tx.walletTransaction.create({
      data: {
        userId: entry.userId,
        type: entry.type,
        amount,
        balanceAfter,
        idempotencyKey: entry.idempotencyKey,
        referenceType: entry.referenceType,
        referenceId: entry.referenceId,
        actorId: entry.actorId,
        note,
      },
    });
    await tx.userWallet.update({
      where: { userId: entry.userId },
      data: { balance: balanceAfter, version: { increment: 1 } },
    });
    return { transaction, applied: true, shortfall };
  }

  async balance(userId: string): Promise<number> {
    const wallet = await this.prisma.userWallet.findUnique({ where: { userId } });
    return wallet?.balance ?? 0;
  }

  history(userId: string, query: CursorQuery) {
    return offsetPage(query, async (skip, take) => {
      const rows = await this.prisma.walletTransaction.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      });
      return rows.map((t) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        balanceAfter: t.balanceAfter,
        referenceType: t.referenceType,
        referenceId: t.referenceId,
        note: t.note,
        createdAt: t.createdAt,
      }));
    });
  }

  /** Reconciliation: wallets whose cached balance differs from the ledger sum (should always be empty). */
  findMismatches(): Promise<{ user_id: string; balance: number; ledger: number }[]> {
    return this.prisma.$queryRaw`
      SELECT w.user_id, w.balance, COALESCE(SUM(t.amount), 0)::int AS ledger
      FROM user_wallets w LEFT JOIN wallet_transactions t ON t.user_id = w.user_id
      GROUP BY w.user_id, w.balance
      HAVING w.balance <> COALESCE(SUM(t.amount), 0)`;
  }
}

@Global()
@Module({ providers: [WalletService], exports: [WalletService] })
export class WalletCoreModule {}
