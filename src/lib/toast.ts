import Toast from 'react-native-toast-message';

/**
 * Small wrapper around react-native-toast-message so call sites don't
 * have to remember the exact config shape. Use these instead of
 * Alert.alert for non-blocking notifications.
 */
export const toast = {
  success(message: string, description?: string) {
    Toast.show({
      type: 'success',
      text1: message,
      text2: description,
      position: 'top',
      visibilityTime: 2500,
      topOffset: 60,
    });
  },
  error(message: string, description?: string) {
    Toast.show({
      type: 'error',
      text1: message,
      text2: description,
      position: 'top',
      visibilityTime: 3500,
      topOffset: 60,
    });
  },
  info(message: string, description?: string) {
    Toast.show({
      type: 'info',
      text1: message,
      text2: description,
      position: 'top',
      visibilityTime: 2500,
      topOffset: 60,
    });
  },
  hide() {
    Toast.hide();
  },
};
