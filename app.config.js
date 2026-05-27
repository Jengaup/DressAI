const IS_DEV = process.env.APP_VARIANT === "development";
const IS_PREVIEW = process.env.APP_VARIANT === "preview";

const getAppName = () => {
  if (IS_DEV) return "Armoire (Dev)";
  if (IS_PREVIEW) return "Armoire (Preview)";
  return "Armoire";
};

const getBundleId = () => {
  if (IS_DEV) return "com.armoire.app.dev";
  if (IS_PREVIEW) return "com.armoire.app.preview";
  return "com.armoire.app";
};

export default {
  expo: {
    name: getAppName(),
    slug: "armoire",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "armoire",
    userInterfaceStyle: "automatic",
    splash: {
      image: "./assets/images/splash.png",
      resizeMode: "contain",
      backgroundColor: "#0F0F0F",
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: getBundleId(),
      infoPlist: {
        NSCameraUsageDescription:
          "Armoire necesita acceso a tu cámara para fotografiar tus prendas.",
        NSPhotoLibraryUsageDescription:
          "Armoire necesita acceso a tu galería para agregar prendas existentes.",
        NSPhotoLibraryAddUsageDescription:
          "Armoire guarda los looks que creas en tu galería.",
        NSMicrophoneUsageDescription:
          "Armoire requiere micrófono para grabación de video.",
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/images/adaptive-icon.png",
        backgroundColor: "#0F0F0F",
      },
      package: getBundleId(),
      permissions: [
        "android.permission.CAMERA",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE",
        "android.permission.READ_MEDIA_IMAGES",
        "android.permission.VIBRATE",
      ],
    },
    web: {
      bundler: "metro",
      output: "static",
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
      "expo-router",
      [
        "expo-camera",
        {
          cameraPermission:
            "Armoire necesita acceso a tu cámara para fotografiar prendas.",
          microphonePermission: false,
          recordAudioAndroid: false,
        },
      ],
      [
        "expo-image-picker",
        {
          photosPermission:
            "Armoire necesita acceso a tu galería para agregar prendas.",
        },
      ],
      "expo-secure-store",
      "expo-font",
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      eas: {
        projectId: process.env.EAS_PROJECT_ID,
      },
    },
  },
};
