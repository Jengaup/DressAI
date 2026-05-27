import { Pressable, type PressableProps } from 'react-native';
import * as Haptics from 'expo-haptics';
import { type BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';

export function HapticTab({ onPress, ...props }: BottomTabBarButtonProps) {
  return (
    <Pressable
      {...props}
      onPress={(e) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.(e);
      }}
    />
  );
}
