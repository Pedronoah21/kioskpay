import Constants from 'expo-constants';

/**
 * Endereço da API. Em desenvolvimento, defina EXPO_PUBLIC_API_URL no .env
 * (ex.: http://192.168.0.10:3000 para testar no celular na mesma rede Wi-Fi).
 */
export const API_URL: string = (
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  'http://localhost:3000'
).replace(/\/$/, '');
