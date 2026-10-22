import { CampaignStatus } from '@prisma/client';
import { canTransition } from './admin-ads.service';

describe('campaign status machine', () => {
  it.each<[CampaignStatus, CampaignStatus]>([
    ['DRAFT', 'SCHEDULED'],
    ['DRAFT', 'ACTIVE'],
    ['SCHEDULED', 'ACTIVE'],
    ['SCHEDULED', 'PAUSED'],
    ['ACTIVE', 'PAUSED'],
    ['PAUSED', 'ACTIVE'],
    ['ACTIVE', 'COMPLETED'],
    ['PAUSED', 'CANCELED'],
  ])('allows %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each<[CampaignStatus, CampaignStatus]>([
    ['COMPLETED', 'ACTIVE'],
    ['CANCELED', 'ACTIVE'],
    ['COMPLETED', 'PAUSED'],
    ['DRAFT', 'PAUSED'],
    ['DRAFT', 'COMPLETED'],
    ['ACTIVE', 'DRAFT'],
  ])('rejects %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });
});
