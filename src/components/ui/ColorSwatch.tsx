import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING } from '@constants/theme';

interface Props {
  color: string;
  label: string;
}

export function ColorSwatch({ color, label }: Props) {
  return (
    <View style={styles.container}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border },
  label: { fontSize: 13, color: COLORS.textSecondary },
});
