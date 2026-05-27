import { View, StyleSheet, Text } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, runOnJS,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@constants/theme';
import type { GarmentPosition, Garment } from '@types/database';

interface CanvasItem {
  garment: Garment;
  position: GarmentPosition;
}

interface Props {
  items: CanvasItem[];
  onPositionChange: (garmentId: string, position: GarmentPosition) => void;
  onRemove: (garmentId: string) => void;
  height: number;
}

export function PlannerCanvas({ items, onPositionChange, onRemove, height }: Props) {
  return (
    <View style={[styles.canvas, { height }]}>
      {items.length === 0 && (
        <View style={styles.emptyHint}>
          <Ionicons name="add-circle-outline" size={40} color={COLORS.border} />
          <Text style={styles.emptyText}>Toca prendas abajo para agregar</Text>
        </View>
      )}
      {items.map((item) => (
        <DraggableGarment
          key={item.garment.id}
          item={item}
          onPositionChange={onPositionChange}
          onRemove={onRemove}
        />
      ))}
    </View>
  );
}

interface DraggableProps {
  item: CanvasItem;
  onPositionChange: (id: string, pos: GarmentPosition) => void;
  onRemove: (id: string) => void;
}

function DraggableGarment({ item, onPositionChange, onRemove }: DraggableProps) {
  const translateX = useSharedValue(item.position.x);
  const translateY = useSharedValue(item.position.y);
  const scale = useSharedValue(item.position.scale);
  const savedTranslateX = useSharedValue(item.position.x);
  const savedTranslateY = useSharedValue(item.position.y);
  const savedScale = useSharedValue(item.position.scale);

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
      runOnJS(onPositionChange)(item.garment.id, {
        x: translateX.value,
        y: translateY.value,
        scale: scale.value,
        rotation: 0,
        zIndex: item.position.zIndex,
      });
    });

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(0.5, Math.min(2.5, savedScale.value * e.scale));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });

  const composed = Gesture.Simultaneous(pan, pinch);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    zIndex: item.position.zIndex,
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[styles.draggable, animatedStyle]}>
        <Image
          source={{ uri: item.garment.processed_url ?? item.garment.original_url }}
          style={styles.garmentImage}
          contentFit="contain"
        />
        <View
          style={styles.removeBtn}
          // @ts-ignore — onTouchEnd works on RN
          onTouchEnd={() => onRemove(item.garment.id)}
        >
          <Ionicons name="close-circle" size={22} color={COLORS.error} />
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  canvas: {
    backgroundColor: COLORS.surface,
    margin: 12,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  emptyHint: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  emptyText: { color: COLORS.textMuted, fontSize: 14 },
  draggable: {
    position: 'absolute',
    width: 120,
    height: 150,
  },
  garmentImage: { width: '100%', height: '100%' },
  removeBtn: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: COLORS.background,
    borderRadius: 11,
  },
});
