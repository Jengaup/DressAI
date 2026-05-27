import { Ionicons } from '@expo/vector-icons';

interface Props {
  name: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  size?: number;
}

export function TabBarIcon({ name, color, size = 26 }: Props) {
  return <Ionicons name={name} size={size} color={color} />;
}
