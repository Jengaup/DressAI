import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView,
  TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@store/auth.store';
import { useWardrobeStore } from '@store/wardrobe.store';
import { supabase } from '@lib/supabase/client';
import { uploadGarmentImage } from '@lib/supabase/storage';
import { GARMENT_TYPE_LABELS, COLORS, SPACING } from '@constants/theme';
import type { GarmentType, Garment } from '@types/database';

type UploadStep = 'idle' | 'removing-bg' | 'classifying' | 'saving';

const STEP_LABELS: Record<UploadStep, string> = {
  idle: '',
  'removing-bg': 'Recortando fondo...',
  classifying: 'Clasificando prenda...',
  saving: 'Guardando...',
};

export default function AddGarmentModal() {
  const { user } = useAuthStore();
  const { addGarment } = useWardrobeStore();

  const [originalUri, setOriginalUri] = useState<string | null>(null);
  const [processedUri, setProcessedUri] = useState<string | null>(null);
  const [step, setStep] = useState<UploadStep>('idle');

  // Editable classification fields
  const [type, setType] = useState<GarmentType>('top');
  const [colorLabel, setColorLabel] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#888888');
  const [brand, setBrand] = useState('');
  const [name, setName] = useState('');
  const [aiDone, setAiDone] = useState(false);
  const [aiData, setAiData] = useState<Record<string, unknown> | null>(null);

  const pickImage = useCallback(async (fromCamera: boolean) => {
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.9,
          allowsEditing: true,
          aspect: [3, 4],
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.9,
          allowsEditing: true,
          aspect: [3, 4],
        });

    if (result.canceled) return;
    const uri = result.assets[0].uri;
    setOriginalUri(uri);
    await runAiPipeline(uri);
  }, []);

  const runAiPipeline = useCallback(async (uri: string) => {
    try {
      // 1. Compress for upload (max 1200px, 80% quality)
      const compressed = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1200 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
      );

      const base64 = await FileSystem.readAsStringAsync(compressed.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // 2. Remove background (server-side via Edge Function)
      setStep('removing-bg');
      const { data: processData, error: processError } = await supabase.functions.invoke<{
        processedBase64: string;
        mimeType: string;
      }>('process-image', {
        body: { imageBase64: base64, mimeType: 'image/jpeg' },
      });

      if (processError || !processData) throw new Error('Background removal failed');

      // Save processed image locally for preview
      const processedPath = `${FileSystem.cacheDirectory}processed-${Date.now()}.png`;
      await FileSystem.writeAsStringAsync(processedPath, processData.processedBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      setProcessedUri(processedPath);

      // 3. Classify with Google Vision
      setStep('classifying');
      const { data: classData, error: classError } = await supabase.functions.invoke<{
        type: GarmentType;
        subtype: string | null;
        primary_color: string;
        secondary_color: string | null;
        color_label: string;
        pattern: string;
        occasions: string[];
        season: string[];
        ai_confidence: number;
        vision_raw: Record<string, unknown>;
      }>('classify-garment', {
        body: { imageBase64: base64, mimeType: 'image/jpeg' },
      });

      if (!classError && classData) {
        setType(classData.type);
        setColorLabel(classData.color_label);
        setPrimaryColor(classData.primary_color);
        setAiData(classData as unknown as Record<string, unknown>);
      }

      setAiDone(true);
      setStep('idle');
    } catch (err) {
      setStep('idle');
      setAiDone(true); // Let user fill manually
      Toast.show({
        type: 'info',
        text1: 'Clasificación automática falló',
        text2: 'Puedes completar los datos manualmente',
      });
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!originalUri || !user) return;

    setStep('saving');
    try {
      const garmentId = crypto.randomUUID();

      // Upload original
      const originalUrl = await uploadGarmentImage(
        user.id, garmentId, originalUri, 'original',
      );

      // Upload processed (if available)
      let processedUrl: string | null = null;
      if (processedUri) {
        processedUrl = await uploadGarmentImage(
          user.id, garmentId, processedUri, 'processed',
        );
      }

      // Persist to DB
      const garmentData = {
        id: garmentId,
        user_id: user.id,
        original_url: originalUrl,
        processed_url: processedUrl,
        thumbnail_url: processedUrl ?? originalUrl,
        type,
        subtype: (aiData as any)?.subtype ?? null,
        primary_color: primaryColor,
        secondary_color: (aiData as any)?.secondary_color ?? null,
        color_label: colorLabel || 'color',
        pattern: (aiData as any)?.pattern ?? 'solid',
        season: (aiData as any)?.season ?? ['all'],
        occasions: (aiData as any)?.occasions ?? ['casual'],
        brand: brand || null,
        name: name || null,
        tags: [],
        is_favorite: false,
        times_worn: 0,
        last_worn: null,
        purchase_price: null,
        purchase_date: null,
        notes: null,
        is_active: true,
        vision_raw: (aiData as any)?.vision_raw ?? null,
        ai_confidence: (aiData as any)?.ai_confidence ?? null,
      };

      const { data, error } = await supabase
        .from('garments')
        .insert(garmentData)
        .select()
        .single();

      if (error) throw new Error(error.message);

      addGarment(data as Garment);
      Toast.show({ type: 'success', text1: 'Prenda agregada al clóset' });
      router.back();
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Error al guardar la prenda' });
    } finally {
      setStep('idle');
    }
  }, [originalUri, processedUri, user, type, colorLabel, primaryColor, brand, name, aiData, addGarment]);

  const isProcessing = step !== 'idle';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} disabled={isProcessing}>
          <Ionicons name="close" size={28} color={COLORS.text} />
        </Pressable>
        <Text style={styles.title}>Nueva prenda</Text>
        <Pressable
          onPress={handleSave}
          disabled={!aiDone || isProcessing || !originalUri}
          style={[styles.saveBtn, (!aiDone || isProcessing || !originalUri) && styles.saveBtnDisabled]}
        >
          <Text style={styles.saveBtnText}>Guardar</Text>
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Image area */}
        {!originalUri ? (
          <View style={styles.imagePicker}>
            <Pressable style={styles.imageOption} onPress={() => pickImage(true)}>
              <Ionicons name="camera-outline" size={36} color={COLORS.primary} />
              <Text style={styles.imageOptionText}>Tomar foto</Text>
            </Pressable>
            <View style={styles.divider} />
            <Pressable style={styles.imageOption} onPress={() => pickImage(false)}>
              <Ionicons name="image-outline" size={36} color={COLORS.primary} />
              <Text style={styles.imageOptionText}>Galería</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.imagePreview}>
            <Image
              source={{ uri: processedUri ?? originalUri }}
              style={styles.previewImage}
              contentFit="contain"
            />
            {isProcessing && (
              <View style={styles.processingOverlay}>
                <ActivityIndicator color="#fff" size="large" />
                <Text style={styles.processingText}>{STEP_LABELS[step]}</Text>
              </View>
            )}
          </View>
        )}

        {/* Classification form (shown after AI completes) */}
        {aiDone && (
          <View style={styles.form}>
            <Text style={styles.sectionLabel}>Tipo de prenda</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeScroll}>
              {(Object.keys(GARMENT_TYPE_LABELS) as GarmentType[]).map((t) => (
                <Pressable
                  key={t}
                  style={[styles.typeChip, type === t && styles.typeChipActive]}
                  onPress={() => setType(t)}
                >
                  <Text style={[styles.typeChipText, type === t && styles.typeChipTextActive]}>
                    {GARMENT_TYPE_LABELS[t]}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.row}>
              <View style={[styles.colorDot, { backgroundColor: primaryColor }]} />
              <TextInput
                style={[styles.input, styles.inputFlex]}
                placeholder="Color (ej: azul marino)"
                placeholderTextColor={COLORS.textMuted}
                value={colorLabel}
                onChangeText={setColorLabel}
              />
            </View>

            <TextInput
              style={styles.input}
              placeholder="Marca (opcional)"
              placeholderTextColor={COLORS.textMuted}
              value={brand}
              onChangeText={setBrand}
            />

            <TextInput
              style={styles.input}
              placeholder="Nombre personalizado (opcional)"
              placeholderTextColor={COLORS.textMuted}
              value={name}
              onChangeText={setName}
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: { fontSize: 17, fontWeight: '600', color: COLORS.text },
  saveBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: 20,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: '#fff', fontWeight: '600' },
  scroll: { paddingBottom: 40 },
  imagePicker: {
    flexDirection: 'row',
    height: 240,
    margin: SPACING.md,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  imageOption: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  imageOptionText: { fontSize: 14, color: COLORS.textMuted },
  divider: { width: 1, backgroundColor: COLORS.border },
  imagePreview: { height: 360, margin: SPACING.md, borderRadius: 16, overflow: 'hidden' },
  previewImage: { width: '100%', height: '100%' },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  processingText: { color: '#fff', fontSize: 15, fontWeight: '500' },
  form: { paddingHorizontal: SPACING.md, gap: SPACING.sm },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  typeScroll: { marginHorizontal: -SPACING.md, paddingHorizontal: SPACING.md },
  typeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: 8,
  },
  typeChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  typeChipText: { fontSize: 13, color: COLORS.textMuted },
  typeChipTextActive: { color: '#fff', fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  colorDot: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: COLORS.border },
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.text,
  },
  inputFlex: { flex: 1 },
});
