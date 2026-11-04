import { SplashScreen } from 'expo-router';
import { useSession } from './ctx';

SplashScreen.preventAutoHideAsync();

/** Mantém a splash até descobrir se há sessão salva. */
export function SplashScreenController() {
  const { isLoading } = useSession();
  if (!isLoading) SplashScreen.hide();
  return null;
}
