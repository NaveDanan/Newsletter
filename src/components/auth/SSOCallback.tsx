import { HugeiconsIcon } from '@hugeicons/react';
import { CancelCircleIcon, CheckmarkCircle02Icon, Loading02Icon } from '@hugeicons/core-free-icons';
import { useEffect, useState } from 'react';
import { LanguageToggleButton } from '@/components/LanguageToggleButton';
import { useAuth } from '@/contexts/AuthContext';
import { useLocale } from '@/contexts/LocaleContext';

interface SSOCallbackProps {
  onFinish: (returnTo: string) => void;
  onRetry: (returnTo: string) => void;
}

export function SSOCallback({ onFinish, onRetry }: SSOCallbackProps) {
  const { handleSSOCallback } = useAuth();
  const { t } = useLocale();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [errorMessage, setErrorMessage] = useState('');
  const [returnTo, setReturnTo] = useState('/');

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void handleSSOCallback().then((result) => {
      if (!active) return;
      if (result.status === 'manual') { onRetry(result.returnTo); return; }
      setReturnTo(result.returnTo);
      if (result.status === 'error') {
        setErrorMessage(t('sso.' + result.error));
        setStatus('error');
        return;
      }
      setStatus('success');
      timer = setTimeout(() => onFinish(result.returnTo), 500);
    });
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [handleSSOCallback, onFinish, onRetry, t]);

  return (
    <div className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] flex items-center justify-center p-4 transition-colors">
      <div className="w-full max-w-md space-y-4 text-center">
        <div className="flex justify-end"><LanguageToggleButton compact /></div>
        <div role="status" aria-live="polite" className="space-y-4">
          {status === 'processing' && <>
            <HugeiconsIcon icon={Loading02Icon} className="w-12 h-12 animate-spin motion-reduce:animate-none text-[var(--primary-accent)] mx-auto" aria-hidden="true" />
            <h2 className="text-2xl font-bold">{t('sso.processingTitle')}</h2>
            <p className="text-[var(--text-secondary)]">{t('sso.processingDescription')}</p>
          </>}
          {status === 'success' && <>
            <HugeiconsIcon icon={CheckmarkCircle02Icon} className="w-12 h-12 text-[var(--primary-accent)] mx-auto" aria-hidden="true" />
            <h2 className="text-2xl font-bold">{t('sso.successTitle')}</h2>
            <p className="text-[var(--text-secondary)]">{t('sso.successDescription')}</p>
          </>}
          {status === 'error' && <>
            <HugeiconsIcon icon={CancelCircleIcon} className="w-12 h-12 text-[var(--primary-accent)] mx-auto" aria-hidden="true" />
            <h2 className="text-2xl font-bold">{t('sso.errorTitle')}</h2>
            <p className="text-[var(--text-secondary)] break-words">{errorMessage || t('sso.errorFallback')}</p>
            <button type="button" onClick={() => onRetry(returnTo)} className="text-[var(--text-primary)] underline underline-offset-4 font-medium focus-visible:outline-2 focus-visible:outline-offset-4">
              {t('sso.backToSignIn')}
            </button>
          </>}
        </div>
      </div>
    </div>
  );
}
