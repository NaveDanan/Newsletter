import { LoaderCircle, MailMinus, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useLocale } from '@/contexts/LocaleContext';
import { unsubscribeFromNewsletter } from '@/lib/pocketbase/subscribers';
import { cn } from '@/lib/utils';

interface UnsubscribePageProps {
  onBack: () => void;
}

type UnsubscribeStatus = 'loading' | 'success' | 'already' | 'error';

function isLocale(value: string | null): value is 'en' | 'he' {
  return value === 'en' || value === 'he';
}

export function UnsubscribePage({ onBack }: UnsubscribePageProps) {
  const { setLocale, t } = useLocale();
  const [status, setStatus] = useState<UnsubscribeStatus>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [attempt, setAttempt] = useState(0);
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const subscriberId = params.get('subscriber')?.trim() ?? '';
  const email = params.get('email')?.trim() ?? '';
  const requestedLocale = params.get('locale');

  useEffect(() => {
    if (isLocale(requestedLocale)) {
      setLocale(requestedLocale);
    }
  }, [requestedLocale, setLocale]);

  useEffect(() => {
    let isCancelled = false;

    async function runUnsubscribe() {
      if (!subscriberId) {
        if (!isCancelled) {
          setStatus('error');
          setErrorMessage(t('unsubscribe.errorDescription'));
        }
        return;
      }

      if (!isCancelled) {
        setStatus('loading');
        setErrorMessage('');
      }

      try {
        const result = await unsubscribeFromNewsletter({ subscriberId, email });

        if (isCancelled) {
          return;
        }

        setStatus(result === 'already_unsubscribed' ? 'already' : 'success');
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setStatus('error');
        setErrorMessage(error instanceof Error && error.message ? error.message : t('unsubscribe.errorDescription'));
      }
    }

    void runUnsubscribe();

    return () => {
      isCancelled = true;
    };
  }, [attempt, email, subscriberId, t]);

  const content = (() => {
    if (status === 'loading') {
      return {
        title: t('unsubscribe.loadingTitle'),
        description: t('unsubscribe.loadingDescription'),
        accentClass: 'from-[#FEE2E2] via-white to-[#FFF7ED]',
        icon: <LoaderCircle className="h-8 w-8 animate-spin text-[#D93A3A]" />,
      };
    }

    if (status === 'success') {
      return {
        title: t('unsubscribe.successTitle'),
        description: t('unsubscribe.successDescription'),
        accentClass: 'from-[#FEE2E2] via-white to-[#F9FAFB]',
        icon: <MailMinus className="h-8 w-8 text-[#D93A3A]" />,
      };
    }

    if (status === 'already') {
      return {
        title: t('unsubscribe.alreadyTitle'),
        description: t('unsubscribe.alreadyDescription'),
        accentClass: 'from-[#F3F4F6] via-white to-[#F9FAFB]',
        icon: <MailMinus className="h-8 w-8 text-[#737373]" />,
      };
    }

    return {
      title: t('unsubscribe.errorTitle'),
      description: errorMessage || t('unsubscribe.errorDescription'),
      accentClass: 'from-[#FEE2E2] via-white to-[#F9FAFB]',
      icon: <TriangleAlert className="h-8 w-8 text-[#D93A3A]" />,
    };
  })();

  return (
    <div className="min-h-screen bg-[#F9FAFB] px-4 py-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">

        <Card className="overflow-hidden border-[#E5E5E5] bg-white shadow-[0_24px_80px_rgba(23,23,23,0.08)]">
          <div className={cn('h-3 w-full bg-gradient-to-r', content.accentClass)} />
          <CardHeader className="gap-4 pb-4 pt-8">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-[#e0dcd5] shadow-[0_18px_40px_rgba(23,23,23,0.12)]">
              <img src="/logo.gif" alt="AI-BREAK" className="h-14 w-14 object-contain" />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-extrabold uppercase tracking-[0.24em] text-[#D93A3A]">AI-BREAK</p>
              <CardTitle className="text-3xl font-extrabold tracking-[-0.03em] text-[#171717] sm:text-4xl">{content.title}</CardTitle>
              <CardDescription className="max-w-2xl text-base leading-7 text-[#525252]">{content.description}</CardDescription>
            </div>
          </CardHeader>
          <CardFooter className="flex flex-col gap-3 border-t border-[#E5E5E5] pt-6 sm:flex-row">
            {status === 'error' ? (
              <Button type="button" className="w-full sm:w-auto" onClick={() => setAttempt((value) => value + 1)}>
                {t('unsubscribe.retry')}
              </Button>
            ) : null}
            <Button type="button" variant={status === 'error' ? 'outline' : 'default'} className="w-full sm:w-auto" onClick={onBack}>
              {t('unsubscribe.backHome')}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}