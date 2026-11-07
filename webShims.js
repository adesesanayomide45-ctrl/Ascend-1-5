import { Platform, Alert } from 'react-native';

// react-native-web's Alert.alert does nothing, so map it to browser dialogs.
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  Alert.alert = (title, message, buttons) => {
    const text = [title, message].filter(Boolean).join('\n\n');
    if (!buttons || buttons.length === 0) {
      window.alert(text);
      return;
    }
    if (buttons.length === 1) {
      window.alert(text);
      if (buttons[0].onPress) buttons[0].onPress();
      return;
    }
    const cancelButton = buttons.find((b) => b.style === 'cancel');
    const actionButton = buttons.find((b) => b.style !== 'cancel') || buttons[buttons.length - 1];
    if (window.confirm(text)) {
      if (actionButton.onPress) actionButton.onPress();
    } else if (cancelButton && cancelButton.onPress) {
      cancelButton.onPress();
    }
  };
}
