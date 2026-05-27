import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '@constants/theme';

interface Props {
  label: string;
}

export function TagChip({ label }: Props) {
  return (
    <View style={styles.chip}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  text: { fontSize: 13, color: COLORS.textSecondary },
});
