import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import Toast from 'react-native-toast-message';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@lib/supabase/client';
import { COLORS, SPACING } from '@constants/theme';

const schema = z.object({
  fullName: z.string().min(2, 'Mínimo 2 caracteres'),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
});

type FormData = z.infer<typeof schema>;

export default function SignUpScreen() {
  const [isLoading, setIsLoading] = useState(false);

  const { control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: { data: { full_name: data.fullName } },
    });
    setIsLoading(false);

    if (error) {
      Toast.show({ type: 'error', text1: 'Error al registrarse', text2: error.message });
    } else {
      Toast.show({ type: 'success', text1: '¡Cuenta creada!', text2: 'Bienvenida a Armoire' });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inner}
      >
        <Text style={styles.title}>Crear cuenta</Text>
        <Text style={styles.subtitle}>Empieza a organizar tu clóset hoy</Text>

        <View style={styles.form}>
          {(
            [
              { name: 'fullName', placeholder: 'Nombre completo', type: 'default' },
              { name: 'email', placeholder: 'Email', type: 'email-address' },
              { name: 'password', placeholder: 'Contraseña (mín. 8 chars)', type: 'default', secure: true },
            ] as const
          ).map((field) => (
            <Controller
              key={field.name}
              control={control}
              name={field.name}
              render={({ field: { onChange, value } }) => (
                <View style={styles.field}>
                  <TextInput
                    style={[styles.input, errors[field.name] && styles.inputError]}
                    placeholder={field.placeholder}
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType={field.type as any}
                    autoCapitalize={field.name === 'email' ? 'none' : 'words'}
                    secureTextEntry={field.secure}
                    value={value}
                    onChangeText={onChange}
                  />
                  {errors[field.name] && (
                    <Text style={styles.errorText}>{errors[field.name]?.message}</Text>
                  )}
                </View>
              )}
            />
          ))}

          <Pressable
            style={[styles.btn, isLoading && styles.btnDisabled]}
            onPress={handleSubmit(onSubmit)}
            disabled={isLoading}
          >
            {isLoading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>Crear cuenta</Text>
            }
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>¿Ya tienes cuenta? </Text>
          <Link href="/(auth)/login" style={styles.link}>Inicia sesión</Link>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: SPACING.lg },
  title: { fontSize: 32, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  subtitle: { fontSize: 16, color: COLORS.textMuted, marginBottom: SPACING.xl },
  form: { gap: SPACING.sm },
  field: { gap: 4 },
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    fontSize: 16,
    color: COLORS.text,
  },
  inputError: { borderColor: COLORS.error },
  errorText: { fontSize: 12, color: COLORS.error, paddingLeft: 4 },
  btn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: SPACING.xl },
  footerText: { color: COLORS.textMuted },
  link: { color: COLORS.primary, fontWeight: '600' },
});
