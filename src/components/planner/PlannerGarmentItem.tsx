import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@constants/theme';
import type { Garment } from '@types/database';

interface Props {
  garment: Garment;
  isOnCanvas: boolean;
  onPress: () => void;
}

export function PlannerGarmentItem({ garment, isOnCanvas, onPress }: Props) {
  return (
    <Pressable
      style={[styles.item, isOnCanvas && styles.itemActive]}
      onPress={onPress}
      disabled={isOnCanvas}
    >
      <Image
        source={{ uri: garment.thumbnail_url ?? garment.processed_url ?? garment.original_url }}
        style={styles.image}
        contentFit="cover"
        recyclingKey={garment.id}
      />
      {isOnCanvas && (
        <View style={styles.overlay}>
          <Ionicons name="checkmark-circle" size={24} color={COLORS.primary} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: {
    width: 72,
    height: 90,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
  },
  itemActive: { opacity: 0.5 },
  image: { width: '100%', height: '100%' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
