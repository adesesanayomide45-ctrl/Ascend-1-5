// Native (Android / iOS): the real Google Mobile Ads library.
import mobileAds from 'react-native-google-mobile-ads';

export {
  RewardedAd,
  RewardedAdEventType,
  AdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';

export const initializeAds = () => {
  try {
    mobileAds()
      .initialize()
      .catch((error) => console.log('Ads init failed:', error));
  } catch (error) {
    console.log('Ads init failed:', error);
  }
};
