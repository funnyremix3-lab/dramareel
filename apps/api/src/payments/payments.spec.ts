import { mapPlaySubscriptionState } from './payments.service';

describe('mapPlaySubscriptionState', () => {
  it.each([
    ['SUBSCRIPTION_STATE_ACTIVE', 'ACTIVE'],
    ['SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'IN_GRACE_PERIOD'],
    ['SUBSCRIPTION_STATE_ON_HOLD', 'ON_HOLD'],
    ['SUBSCRIPTION_STATE_PAUSED', 'ON_HOLD'],
    ['SUBSCRIPTION_STATE_CANCELED', 'CANCELED'],
    ['SUBSCRIPTION_STATE_EXPIRED', 'EXPIRED'],
    ['SUBSCRIPTION_STATE_PENDING', null],
    ['SOMETHING_NEW', null],
  ])('%s → %s', (input, expected) => {
    expect(mapPlaySubscriptionState(input)).toBe(expected);
  });
});
