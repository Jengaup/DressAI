import { Redirect, Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { HapticTab } from '@components/ui/HapticTab';
import { TabBarIcon } from '@components/ui/TabBarIcon';
import { useAuthStore } from '@store/auth.store';
import { COLORS } from '@constants/theme';

export default function TabLayout() {
  const { session, isLoading } = useAuthStore();

  // Wait for session hydration before redirecting
  if (isLoading) return null;
  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          paddingBottom: Platform.OS === 'ios' ? 0 : 8,
          height: Platform.OS === 'ios' ? 88 : 64,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
          marginTop: -2,
        },
        headerShown: false,
        tabBarButton: HapticTab,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Clóset',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? 'shirt' : 'shirt-outline'} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="generate"
        options={{
          title: 'Generar',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? 'sparkles' : 'sparkles-outline'} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="planner"
        options={{
          title: 'Planificador',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? 'grid' : 'grid-outline'} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendario',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? 'calendar' : 'calendar-outline'} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
