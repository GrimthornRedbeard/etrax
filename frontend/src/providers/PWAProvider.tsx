import React, { createContext, useContext, useState, useEffect } from 'react';

interface PWAContextType {
  isOnline: boolean;
  isStandalone: boolean;
  canInstall: boolean;
  installPrompt: any;
  installApp: () => void;
}

const PWAContext = createContext<PWAContextType | undefined>(undefined);

export const usePWA = () => {
  const context = useContext(PWAContext);
  if (!context) {
    throw new Error('usePWA must be used within a PWAProvider');
  }
  return context;
};

interface PWAProviderProps {
  children: React.ReactNode;
}

export const PWAProvider: React.FC<PWAProviderProps> = ({ children }) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isStandalone, setIsStandalone] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<any>(null);

  useEffect(() => {
    // Check if running in standalone mode
    const checkStandalone = () => {
      setIsStandalone(
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true
      );
    };

    checkStandalone();

    // Listen for online/offline events
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Listen for PWA install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
      setCanInstall(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Listen for app installed
    const handleAppInstalled = () => {
      setInstallPrompt(null);
      setCanInstall(false);
      setIsStandalone(true);
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const installApp = async () => {
    if (!installPrompt) return;

    const result = await installPrompt.prompt();
    
    if (result.outcome === 'accepted') {
      setInstallPrompt(null);
      setCanInstall(false);
    }
  };

  const value: PWAContextType = {
    isOnline,
    isStandalone,
    canInstall,
    installPrompt,
    installApp,
  };

  return (
    <PWAContext.Provider value={value}>
      {children}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 bg-warning-500 text-white text-center py-2 z-50">
          You are currently offline. Some features may be limited.
        </div>
      )}
    </PWAContext.Provider>
  );
};