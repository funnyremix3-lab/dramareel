/* Native modules that have no JS implementation under Jest. */
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);

jest.mock('react-native-video', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Video = React.forwardRef((props: { testID?: string }, ref: unknown) => {
    React.useImperativeHandle(ref, () => ({ seek: jest.fn() }));
    return React.createElement(View, { testID: props.testID ?? 'video', accessibilityLabel: 'video' });
  });
  return {
    __esModule: true,
    default: Video,
    ResizeMode: { COVER: 'cover', CONTAIN: 'contain' },
    SelectedVideoTrackType: { AUTO: 'auto', RESOLUTION: 'resolution' },
    ViewType: { SURFACE: 1 },
  };
});

jest.mock('lottie-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { __esModule: true, default: React.forwardRef(() => React.createElement(View)) };
});

jest.mock('react-native-google-mobile-ads', () => ({
  __esModule: true,
  default: () => ({ initialize: jest.fn(async () => []), setRequestConfiguration: jest.fn(async () => undefined) }),
  AdsConsent: { gatherConsent: jest.fn(async () => ({ canRequestAds: true })), getUserChoices: jest.fn(async () => ({ selectPersonalisedAds: false })) },
  AdEventType: { LOADED: 'loaded', CLOSED: 'closed', ERROR: 'error' },
  RewardedAdEventType: { LOADED: 'rewarded_loaded', EARNED_REWARD: 'rewarded_earned_reward' },
  MaxAdContentRating: { T: 'T' },
  RewardedAd: { createForAdRequest: jest.fn() },
  InterstitialAd: { createForAdRequest: jest.fn() },
}));

jest.mock('react-native-iap', () => ({
  initConnection: jest.fn(async () => true),
  fetchProducts: jest.fn(async () => []),
  requestPurchase: jest.fn(),
  finishTransaction: jest.fn(),
  purchaseUpdatedListener: jest.fn(() => ({ remove: jest.fn() })),
  purchaseErrorListener: jest.fn(() => ({ remove: jest.fn() })),
  ErrorCode: { UserCancelled: 'user-cancelled' },
}));

jest.mock('expo-screen-capture', () => ({ usePreventScreenCapture: jest.fn() }));
jest.mock('@sentry/react-native', () => ({ init: jest.fn(), wrap: (c: unknown) => c }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'light' } }));
