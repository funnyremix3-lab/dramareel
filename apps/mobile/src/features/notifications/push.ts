import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';
import { Api } from '@/lib/api/endpoints';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

let registered = false;

/**
 * Asks for permission (Android 13+/iOS) and registers the native FCM/APNs token with our API.
 * Silently does nothing if the user declines or Firebase isn't configured in this build.
 */
export async function registerForPush(): Promise<void> {
  if (registered || Platform.OS === 'web') return;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', { name: 'New episodes', importance: AndroidImportance.DEFAULT });
    }
    const current = await Notifications.getPermissionsAsync();
    const status = current.granted ? current.status : (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const token = await Notifications.getDevicePushTokenAsync();
    await Api.registerDeviceToken(String(token.data));
    registered = true;
  } catch {
    // No google-services.json in this build, or offline — push simply stays off.
  }
}
