import { Redirect, Stack } from 'expo-router';
import { useAuthStore } from '@store/auth.store';
import { COLORS } from '@constants/theme';

export default function AuthLayout() {
  const { session, isLoading } = useAuthStore();

  if (isLoading) return null;
  if (session) return <Redirect href="/(tabs)" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLORS.background },
        animation: 'fade',
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
    </Stack>
  );
}
