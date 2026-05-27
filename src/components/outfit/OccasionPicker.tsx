import { View, Text, Pressable, StyleSheet } from 'react-native';
import { COLORS, SPACING } from '@constants/theme';

interface Props {
  occasions: string[];
  selected: string | null;
  onSelect: (occasion: string) => void;
}

const OCCASION_ICONS: Record<string, string> = {
  Casual: '👕',
  Trabajo: '💼',
  Formal: '🎩',
  Deporte: '🏃',
  Cita: '💑',
  Fiesta: '🎉',
};

export function OccasionPicker({ occasions, selected, onSelect }: Props) {
  return (
    <View style={styles.grid}>
      {occasions.map((o) => (
        <Pressable
          key={o}
          style={[styles.option, selected === o && styles.optionActive]}
          onPress={() => onSelect(o)}
        >
          <Text style={styles.emoji}>{OCCASION_ICONS[o] ?? '👗'}</Text>
          <Text style={[styles.label, selected === o && styles.labelActive]}>{o}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  option: {
    flexBasis: '30%',
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2C2C2C',
    backgroundColor: '#1A1A1A',
    gap: 4,
  },
  optionActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '22',
  },
  emoji: { fontSize: 24 },
  label: { fontSize: 13, color: COLORS.textMuted },
  labelActive: { color: COLORS.primary, fontWeight: '600' },
});
