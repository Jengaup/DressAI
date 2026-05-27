import {
  useState, useCallback, useRef, useEffect,
} from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, TextInput,
  Animated, Dimensions, Switch, Alert, Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@store/auth.store';
import { useAddGarment } from '@hooks/useGarments';
import {
  uploadToRemoveBg,
  classifyWithVision,
} from '@services/garmentService';
import {
  GARMENT_TYPE_LABELS,
  OCCASION_LABELS,
  PATTERN_LABELS,
  COLORS,
  SPACING,
  RADIUS,
} from '@constants/theme';
import type { GarmentType, GarmentSeason } from '@types/database';
import {
  ClassificationResult,
  GarmentFormData,
  DEFAULT_FORM_DATA,
  UploadStage,
  UPLOAD_STAGE_MESSAGES,
  UPLOAD_STAGE_PERCENT,
  GarmentServiceError,
} from '@types/garment';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Pipeline steps UI ────────────────────────────────────────────────────────

const PIPELINE_STEPS: Array<{ stage: UploadStage; label: string }> = [
  { stage: 'compressing', label: 'Foto' },
  { stage: 'removing-bg', label: 'Recorte' },
  { stage: 'classifying', label: 'Clasificar' },
  { stage: 'done', label: 'Listo' },
];

const STAGE_ORDER: UploadStage[] = [
  'idle', 'compressing', 'removing-bg', 'classifying', 'uploading', 'saving', 'done',
];

function stageIndex(s: UploadStage): number {
  return STAGE_ORDER.indexOf(s);
}

// ─── Multi-select chip sets ───────────────────────────────────────────────────

const OCCASION_OPTIONS = Object.keys(OCCASION_LABELS) as string[];
const SEASON_OPTIONS: GarmentSeason[] = ['spring', 'summer', 'fall', 'winter', 'all'];
const SEASON_LABELS: Record<GarmentSeason, string> = {
  spring: 'Primavera', summer: 'Verano', fall: 'Otoño', winter: 'Invierno', all: 'Todo el año',
};
const PATTERN_OPTIONS = Object.keys(PATTERN_LABELS) as string[];

// ─── Component ────────────────────────────────────────────────────────────────

export default function AddGarmentScreen() {
  const { user } = useAuthStore();
  const { mutateAsync: addGarment, isPending: isSaving } = useAddGarment();

  // ── Image state ─────────────────────────────────────────────────────────────
  const [originalUri, setOriginalUri] = useState<string | null>(null);
  const [processedUri, setProcessedUri] = useState<string | null>(null);
  const [showingProcessed, setShowingProcessed] = useState(true);

  // ── Pipeline state ──────────────────────────────────────────────────────────
  const [stage, setStage] = useState<UploadStage>('idle');
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [classification, setClassification] = useState<ClassificationResult | null>(null);

  // ── Form state ──────────────────────────────────────────────────────────────
  const [form, setForm] = useState<GarmentFormData>(DEFAULT_FORM_DATA);
  const [tagInput, setTagInput] = useState('');

  // ── Progress bar animation ──────────────────────────────────────────────────
  const progressAnim = useRef(new Animated.Value(0)).current;

  const animateToPercent = useCallback((percent: number) => {
    Animated.timing(progressAnim, {
      toValue: percent,
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [progressAnim]);

  useEffect(() => {
    animateToPercent(UPLOAD_STAGE_PERCENT[stage]);
  }, [stage, animateToPercent]);

  // ── Image picker ─────────────────────────────────────────────────────────────
  const pickImage = useCallback(async (fromCamera: boolean) => {
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.92,
          allowsEditing: true,
          aspect: [3, 4],
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.92,
          allowsEditing: true,
          aspect: [3, 4],
        });

    if (result.canceled) return;

    const uri = result.assets[0].uri;
    setOriginalUri(uri);
    setProcessedUri(null);
    setClassification(null);
    setPipelineError(null);
    setForm(DEFAULT_FORM_DATA);
    runPipeline(uri);
  }, []);

  // ── AI Pipeline ──────────────────────────────────────────────────────────────
  const runPipeline = useCallback(async (uri: string) => {
    try {
      // Step 1: background removal
      setStage('compressing');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      setStage('removing-bg');
      let processedLocalUri: string | null = null;

      try {
        processedLocalUri = await uploadToRemoveBg(uri);
        setProcessedUri(processedLocalUri);
        setShowingProcessed(true);
      } catch (err) {
        // Non-fatal: user can proceed without bg removal
        const msg = err instanceof GarmentServiceError ? err.message : 'Error al recortar fondo';
        Toast.show({ type: 'info', text1: 'Recorte no disponible', text2: msg });
      }

      // Step 2: classify (use processed if available, otherwise original)
      setStage('classifying');
      const imageToClassify = processedLocalUri ?? uri;

      try {
        const result = await classifyWithVision(imageToClassify);
        setClassification(result);

        // Pre-fill form with AI results
        setForm((prev) => ({
          ...prev,
          type: result.type,
          color_label: result.color_label,
          primary_color: result.primary_color,
          secondary_color: result.secondary_color ?? '',
          pattern: result.pattern,
          occasions: result.occasions,
          season: result.season,
        }));
      } catch (err) {
        // Non-fatal: user fills form manually
        const msg = err instanceof GarmentServiceError ? err.message : 'Error al clasificar';
        Toast.show({ type: 'info', text1: 'Clasificación manual', text2: msg });
        // Provide fallback classification so saveGarment can still work
        setClassification({
          type: 'top',
          subtype: null,
          primary_color: '#888888',
          secondary_color: null,
          color_label: 'color',
          pattern: 'solid',
          occasions: ['casual'],
          season: ['all'],
          ai_confidence: 0,
          vision_raw: {},
        });
      }

      setStage('done');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      setStage('error');
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setPipelineError(msg);
      // Still allow manual entry
      setClassification({
        type: 'top',
        subtype: null,
        primary_color: '#888888',
        secondary_color: null,
        color_label: 'color',
        pattern: 'solid',
        occasions: ['casual'],
        season: ['all'],
        ai_confidence: 0,
        vision_raw: {},
      });
      setStage('done'); // advance to form so user can fill manually
    }
  }, []);

  // ── Form helpers ─────────────────────────────────────────────────────────────
  const setField = useCallback(<K extends keyof GarmentFormData>(
    key: K,
    value: GarmentFormData[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const toggleArrayItem = useCallback(<T extends string>(
    key: keyof GarmentFormData,
    item: T,
  ) => {
    setForm((prev) => {
      const arr = prev[key] as T[];
      return {
        ...prev,
        [key]: arr.includes(item)
          ? arr.filter((v) => v !== item)
          : [...arr, item],
      };
    });
  }, []);

  const addTag = useCallback(() => {
    const tag = tagInput.trim().toLowerCase();
    if (!tag || form.tags.includes(tag)) return;
    setField('tags', [...form.tags, tag]);
    setTagInput('');
  }, [tagInput, form.tags, setField]);

  const removeTag = useCallback((tag: string) => {
    setField('tags', form.tags.filter((t) => t !== tag));
  }, [form.tags, setField]);

  // ── Save ─────────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!originalUri || !classification || !user) return;

    if (!form.color_label.trim()) {
      Toast.show({ type: 'error', text1: 'Agrega el color de la prenda' });
      return;
    }

    try {
      await addGarment({
        originalUri,
        processedUri,
        classification,
        overrides: form,
      });
      Toast.show({ type: 'success', text1: '¡Prenda agregada!', text2: 'Ya está en tu clóset' });
      router.back();
    } catch (err) {
      const msg = err instanceof GarmentServiceError
        ? err.message
        : 'Error al guardar la prenda';
      Toast.show({ type: 'error', text1: 'No se pudo guardar', text2: msg });
    }
  }, [originalUri, processedUri, classification, form, user, addGarment]);

  const canSave = stage === 'done' && !!classification && !isSaving;
  const isPipelineRunning = !['idle', 'done', 'error'].includes(stage);

  // ─── RENDER ───────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <Pressable
            onPress={() => {
              if (isPipelineRunning) {
                Alert.alert(
                  'Procesando...',
                  '¿Salir ahora? El proceso se cancelará.',
                  [
                    { text: 'Continuar', style: 'cancel' },
                    { text: 'Salir', onPress: () => router.back() },
                  ],
                );
                return;
              }
              router.back();
            }}
          >
            <Ionicons name="close" size={26} color={COLORS.text} />
          </Pressable>

          <Text style={styles.headerTitle}>Nueva prenda</Text>

          <Pressable
            style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!canSave}
          >
            {isSaving
              ? <Ionicons name="hourglass-outline" size={16} color="#fff" />
              : <Text style={styles.saveBtnText}>Guardar</Text>
            }
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scroll}
        >
          {/* ── Step 0: Source picker ────────────────────────────────────────── */}
          {!originalUri && (
            <View style={styles.sourcePicker}>
              <Text style={styles.sourceTitle}>Agregar prenda</Text>
              <Text style={styles.sourceSubtitle}>
                La IA eliminará el fondo y clasificará automáticamente
              </Text>
              <View style={styles.sourceButtons}>
                <Pressable style={styles.sourceBtn} onPress={() => pickImage(true)}>
                  <View style={styles.sourceBtnIcon}>
                    <Ionicons name="camera" size={32} color={COLORS.primary} />
                  </View>
                  <Text style={styles.sourceBtnLabel}>Cámara</Text>
                  <Text style={styles.sourceBtnSub}>Tomar foto ahora</Text>
                </Pressable>

                <Pressable style={styles.sourceBtn} onPress={() => pickImage(false)}>
                  <View style={styles.sourceBtnIcon}>
                    <Ionicons name="images" size={32} color={COLORS.accent} />
                  </View>
                  <Text style={styles.sourceBtnLabel}>Galería</Text>
                  <Text style={styles.sourceBtnSub}>Elegir de fotos</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* ── Step 1: Image preview + pipeline ────────────────────────────── */}
          {originalUri && (
            <>
              {/* Before / After comparison */}
              <View style={styles.previewSection}>
                <View style={styles.previewToggle}>
                  {processedUri && (
                    <>
                      <Pressable
                        style={[styles.toggleBtn, !showingProcessed && styles.toggleBtnActive]}
                        onPress={() => setShowingProcessed(false)}
                      >
                        <Text style={[styles.toggleText, !showingProcessed && styles.toggleTextActive]}>
                          Antes
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[styles.toggleBtn, showingProcessed && styles.toggleBtnActive]}
                        onPress={() => setShowingProcessed(true)}
                      >
                        <Text style={[styles.toggleText, showingProcessed && styles.toggleTextActive]}>
                          Después
                        </Text>
                      </Pressable>
                    </>
                  )}
                  <Pressable
                    style={styles.retakeBtn}
                    onPress={() => {
                      setOriginalUri(null);
                      setProcessedUri(null);
                      setStage('idle');
                      setClassification(null);
                    }}
                    disabled={isPipelineRunning}
                  >
                    <Ionicons name="refresh-outline" size={14} color={COLORS.textMuted} />
                    <Text style={styles.retakeText}>Cambiar foto</Text>
                  </Pressable>
                </View>

                <View style={styles.imageWrapper}>
                  <Image
                    source={{
                      uri: (showingProcessed && processedUri) ? processedUri : originalUri,
                    }}
                    style={styles.previewImage}
                    contentFit="contain"
                    transition={300}
                  />

                  {/* Checkerboard pattern hint when showing processed (transparent bg) */}
                  {showingProcessed && processedUri && (
                    <View style={styles.checkerHint} pointerEvents="none">
                      <Text style={styles.checkerText}>✓ Fondo eliminado</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Pipeline progress */}
              {!['idle'].includes(stage) && (
                <View style={styles.pipelineSection}>
                  {/* Progress bar */}
                  <View style={styles.progressTrack}>
                    <Animated.View
                      style={[
                        styles.progressFill,
                        {
                          width: progressAnim.interpolate({
                            inputRange: [0, 100],
                            outputRange: ['0%', '100%'],
                          }),
                        },
                      ]}
                    />
                  </View>

                  {/* Step dots */}
                  <View style={styles.stepsRow}>
                    {PIPELINE_STEPS.map((step, i) => {
                      const stepIdx = stageIndex(step.stage);
                      const currentIdx = stageIndex(stage);
                      const isDone = currentIdx > stepIdx || stage === 'done';
                      const isActive = currentIdx === stepIdx;

                      return (
                        <View key={step.stage} style={styles.stepItem}>
                          <View style={[
                            styles.stepDot,
                            isDone && styles.stepDotDone,
                            isActive && styles.stepDotActive,
                          ]}>
                            {isDone
                              ? <Ionicons name="checkmark" size={10} color="#fff" />
                              : isActive
                                ? <View style={styles.stepPulse} />
                                : <View style={styles.stepDotInner} />
                            }
                          </View>
                          <Text style={[
                            styles.stepLabel,
                            (isDone || isActive) && styles.stepLabelActive,
                          ]}>
                            {step.label}
                          </Text>
                        </View>
                      );
                    })}
                  </View>

                  {/* Status message */}
                  <Text style={styles.stageMessage}>
                    {UPLOAD_STAGE_MESSAGES[stage]}
                  </Text>
                </View>
              )}
            </>
          )}

          {/* ── Step 2: Form (shown when pipeline done) ───────────────────── */}
          {stage === 'done' && classification && (
            <View style={styles.form}>
              {/* AI confidence badge */}
              {classification.ai_confidence > 0 && (
                <View style={styles.aiBadge}>
                  <Ionicons name="sparkles" size={13} color={COLORS.primary} />
                  <Text style={styles.aiBadgeText}>
                    Clasificado con IA · {Math.round(classification.ai_confidence * 100)}% confianza
                  </Text>
                  <Text style={styles.aiBadgeHint}>Revisa y ajusta si es necesario</Text>
                </View>
              )}

              {/* ── Tipo ──────────────────────────────────────────────────── */}
              <Section label="Tipo de prenda *">
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.chipRow}>
                    {(Object.keys(GARMENT_TYPE_LABELS) as GarmentType[]).map((t) => (
                      <Chip
                        key={t}
                        label={GARMENT_TYPE_LABELS[t]}
                        active={form.type === t}
                        onPress={() => setField('type', t)}
                      />
                    ))}
                  </View>
                </ScrollView>
              </Section>

              {/* ── Nombre & Marca ─────────────────────────────────────────── */}
              <Section label="Información básica">
                <Field
                  placeholder="Nombre personalizado (ej: blazer favorito)"
                  value={form.name}
                  onChangeText={(v) => setField('name', v)}
                  maxLength={50}
                />
                <Field
                  placeholder="Marca (opcional)"
                  value={form.brand}
                  onChangeText={(v) => setField('brand', v)}
                  maxLength={40}
                />
              </Section>

              {/* ── Color ─────────────────────────────────────────────────── */}
              <Section label="Color *">
                <View style={styles.colorRow}>
                  <View style={[styles.colorDot, { backgroundColor: form.primary_color }]} />
                  <Field
                    placeholder="Nombre del color (ej: azul marino)"
                    value={form.color_label}
                    onChangeText={(v) => setField('color_label', v)}
                    style={{ flex: 1 }}
                    maxLength={30}
                  />
                </View>
                {form.secondary_color !== '' && (
                  <View style={styles.colorRow}>
                    <View style={[styles.colorDot, { backgroundColor: form.secondary_color }]} />
                    <Text style={styles.secondaryColorText}>Color secundario detectado</Text>
                  </View>
                )}
              </Section>

              {/* ── Patrón ────────────────────────────────────────────────── */}
              <Section label="Patrón">
                <View style={styles.chipRow}>
                  {PATTERN_OPTIONS.map((p) => (
                    <Chip
                      key={p}
                      label={PATTERN_LABELS[p]}
                      active={form.pattern === p}
                      onPress={() => setField('pattern', p)}
                    />
                  ))}
                </View>
              </Section>

              {/* ── Ocasiones ─────────────────────────────────────────────── */}
              <Section label="Ocasiones (selecciona todas las que apliquen)">
                <View style={styles.chipRow}>
                  {OCCASION_OPTIONS.map((o) => (
                    <Chip
                      key={o}
                      label={OCCASION_LABELS[o]}
                      active={form.occasions.includes(o)}
                      onPress={() => toggleArrayItem('occasions', o)}
                    />
                  ))}
                </View>
              </Section>

              {/* ── Temporada ─────────────────────────────────────────────── */}
              <Section label="Temporada">
                <View style={styles.chipRow}>
                  {SEASON_OPTIONS.map((s) => (
                    <Chip
                      key={s}
                      label={SEASON_LABELS[s]}
                      active={form.season.includes(s)}
                      onPress={() => toggleArrayItem('season', s)}
                    />
                  ))}
                </View>
              </Section>

              {/* ── Tags ──────────────────────────────────────────────────── */}
              <Section label="Etiquetas">
                <View style={styles.tagInputRow}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="Agregar etiqueta..."
                    placeholderTextColor={COLORS.textMuted}
                    value={tagInput}
                    onChangeText={setTagInput}
                    onSubmitEditing={addTag}
                    blurOnSubmit={false}
                    returnKeyType="done"
                    maxLength={20}
                    autoCapitalize="none"
                  />
                  <Pressable
                    style={[styles.tagAddBtn, !tagInput.trim() && styles.tagAddBtnDisabled]}
                    onPress={addTag}
                    disabled={!tagInput.trim()}
                  >
                    <Ionicons name="add" size={20} color="#fff" />
                  </Pressable>
                </View>
                {form.tags.length > 0 && (
                  <View style={styles.tagsList}>
                    {form.tags.map((tag) => (
                      <Pressable
                        key={tag}
                        style={styles.tagPill}
                        onPress={() => removeTag(tag)}
                      >
                        <Text style={styles.tagText}>#{tag}</Text>
                        <Ionicons name="close" size={12} color={COLORS.primary} />
                      </Pressable>
                    ))}
                  </View>
                )}
              </Section>

              {/* ── Notas ─────────────────────────────────────────────────── */}
              <Section label="Notas personales">
                <TextInput
                  style={[styles.input, styles.notesInput]}
                  placeholder="Instrucciones de lavado, talla, recuerdos... (opcional)"
                  placeholderTextColor={COLORS.textMuted}
                  value={form.notes}
                  onChangeText={(v) => setField('notes', v)}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  maxLength={300}
                />
              </Section>

              {/* ── Precio & Fecha de compra (collapsible) ────────────────── */}
              <Section label="Detalles de compra (opcional)">
                <View style={styles.twoCol}>
                  <Field
                    placeholder="Precio"
                    value={form.purchase_price}
                    onChangeText={(v) => setField('purchase_price', v)}
                    keyboardType="decimal-pad"
                    style={{ flex: 1 }}
                  />
                  <Field
                    placeholder="Fecha (YYYY-MM-DD)"
                    value={form.purchase_date}
                    onChangeText={(v) => setField('purchase_date', v)}
                    style={{ flex: 1.4 }}
                    maxLength={10}
                  />
                </View>
              </Section>

              {/* ── Save CTA (duplicate at bottom for thumb reach) ────────── */}
              <Pressable
                style={[styles.saveCta, !canSave && styles.saveCtaDisabled]}
                onPress={handleSave}
                disabled={!canSave}
              >
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={styles.saveCtaText}>
                  {isSaving ? 'Guardando...' : 'Agregar al clóset'}
                </Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Micro-components ─────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={sectionStyles.container}>
      <Text style={sectionStyles.label}>{label}</Text>
      {children}
    </View>
  );
}

function Chip({
  label, active, onPress,
}: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={[chipStyles.chip, active && chipStyles.active]}
      onPress={onPress}
    >
      <Text style={[chipStyles.text, active && chipStyles.textActive]}>{label}</Text>
    </Pressable>
  );
}

function Field({
  placeholder, value, onChangeText, style, maxLength, keyboardType,
}: {
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  style?: object;
  maxLength?: number;
  keyboardType?: 'default' | 'decimal-pad' | 'email-address';
}) {
  return (
    <TextInput
      style={[fieldStyles.input, style]}
      placeholder={placeholder}
      placeholderTextColor={COLORS.textMuted}
      value={value}
      onChangeText={onChangeText}
      maxLength={maxLength}
      keyboardType={keyboardType ?? 'default'}
      autoCapitalize="sentences"
    />
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const sectionStyles = StyleSheet.create({
  container: { marginBottom: SPACING.md },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: SPACING.sm,
  },
});

const chipStyles = StyleSheet.create({
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    marginRight: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  active: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  text: { fontSize: 13, color: COLORS.textMuted },
  textActive: { color: '#fff', fontWeight: '600' },
});

const fieldStyles = StyleSheet.create({
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 11,
    fontSize: 14,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
});

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
  headerTitle: { fontSize: 17, fontWeight: '600', color: COLORS.text },
  saveBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    minWidth: 80,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.35 },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  scroll: { paddingBottom: 48 },

  // Source picker
  sourcePicker: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xl,
    alignItems: 'center',
  },
  sourceTitle: { fontSize: 22, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  sourceSubtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: SPACING.xl,
    lineHeight: 20,
  },
  sourceButtons: { flexDirection: 'row', gap: SPACING.md, width: '100%' },
  sourceBtn: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    alignItems: 'center',
    gap: SPACING.xs,
  },
  sourceBtnIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  sourceBtnLabel: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  sourceBtnSub: { fontSize: 12, color: COLORS.textMuted },

  // Image preview
  previewSection: { marginHorizontal: SPACING.md, marginTop: SPACING.sm },
  previewToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  toggleBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  toggleBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  toggleText: { fontSize: 13, color: COLORS.textMuted },
  toggleTextActive: { color: '#fff', fontWeight: '600' },
  retakeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  retakeText: { fontSize: 12, color: COLORS.textMuted },
  imageWrapper: {
    height: 300,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: COLORS.surfaceAlt,
    position: 'relative',
  },
  previewImage: { width: '100%', height: '100%' },
  checkerHint: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: RADIUS.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  checkerText: { fontSize: 11, color: COLORS.success, fontWeight: '600' },

  // Pipeline progress
  pipelineSection: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  progressTrack: {
    height: 3,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: SPACING.md,
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },
  stepsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  stepItem: { alignItems: 'center', gap: 4 },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepDotDone: { backgroundColor: COLORS.success },
  stepDotActive: { backgroundColor: COLORS.primary },
  stepDotInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.textMuted },
  stepPulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  stepLabel: { fontSize: 10, color: COLORS.textMuted },
  stepLabelActive: { color: COLORS.text, fontWeight: '600' },
  stageMessage: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center' },

  // Form
  form: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md },
  aiBadge: {
    backgroundColor: COLORS.primary + '18',
    borderRadius: RADIUS.sm,
    padding: SPACING.sm,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.primary + '33',
    gap: 3,
  },
  aiBadgeText: { fontSize: 13, color: COLORS.primary, fontWeight: '600' },
  aiBadgeHint: { fontSize: 12, color: COLORS.textMuted },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },

  colorRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.xs },
  colorDot: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: COLORS.border, flexShrink: 0 },
  secondaryColorText: { fontSize: 13, color: COLORS.textMuted },

  twoCol: { flexDirection: 'row', gap: SPACING.sm },

  tagInputRow: { flexDirection: 'row', gap: SPACING.xs, alignItems: 'center', marginBottom: SPACING.xs },
  tagAddBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tagAddBtnDisabled: { opacity: 0.4 },
  tagsList: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  tagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primary + '22',
    borderRadius: RADIUS.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: COLORS.primary + '44',
  },
  tagText: { fontSize: 12, color: COLORS.primary },

  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 11,
    fontSize: 14,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  notesInput: { height: 80, textAlignVertical: 'top' },

  saveCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 16,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xl,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  saveCtaDisabled: { opacity: 0.4 },
  saveCtaText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
