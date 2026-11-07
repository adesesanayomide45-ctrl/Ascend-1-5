// Web: the ads library has no web support, so use harmless stand-ins.
export const TestIds = { REWARDED: 'web-test-rewarded' };

export const RewardedAdEventType = {
  LOADED: 'loaded',
  EARNED_REWARD: 'earned_reward',
};

export const AdEventType = {
  CLOSED: 'closed',
  ERROR: 'error',
};

export const RewardedAd = {
  createForAdRequest: () => ({
    addAdEventListener: () => () => {},
    load: () => {},
    show: () => {},
  }),
};

export const initializeAds = () => {};
