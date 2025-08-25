import { Workbox } from 'workbox-window';

export const registerSW = () => {
  if ('serviceWorker' in navigator) {
    const wb = new Workbox('/sw.js');

    wb.addEventListener('controlling', () => {
      window.location.reload();
    });

    wb.addEventListener('waiting', (event) => {
      // Show update available notification
      if (
        confirm(
          'A new version of ETrax is available. Would you like to update now?'
        )
      ) {
        wb.addEventListener('controlling', () => {
          window.location.reload();
        });

        wb.messageSkipWaiting();
      }
    });

    wb.register();
  }
};

export const isStandalone = () => {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
};

export const canInstall = () => {
  return 'beforeinstallprompt' in window;
};