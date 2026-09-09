import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowLeft01Icon, CheckmarkCircle02Icon, Loading02Icon } from '@hugeicons/core-free-icons';
import { useEffect, useRef, useState } from 'react';
import { LanguageToggleButton } from '@/components/LanguageToggleButton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useLocale } from '@/contexts/LocaleContext';
import { cn } from '@/lib/utils';

interface VerifyEmailPageProps {
  token: string;
  onBack: () => void;
  onSuccess: () => void;
}

export function VerifyEmailPage({ token, onBack, onSuccess }: VerifyEmailPageProps) {
  const { confirmEmailVerification } = useAuth();
  const { isRTL } = useLocale();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const hasConfirmedRef = useRef(false);

  useEffect(() => {
    if (hasConfirmedRef.current) {
      return;
    }

    hasConfirmedRef.current = true;
    void confirmEmailVerification(token).then((success) => {
      setStatus(success ? 'success' : 'error');
    });
  }, [confirmEmailVerification, token]);

  const isLoading = status === 'loading';
  const isSuccess = status === 'success';

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="flex justify-end">
          <LanguageToggleButton compact />
        </div>
        <Card className="w-full">
          <CardHeader className="space-y-1">
            <div className="flex items-center gap-2 mb-4">
              <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <HugeiconsIcon icon={ArrowLeft01Icon} className={cn('w-4 h-4', isRTL && 'rtl-rotate-180')} />
              </button>
            </div>
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFF1F1] text-[#D93A3A]">
              {isLoading ? (
                <HugeiconsIcon icon={Loading02Icon} className="h-5 w-5 animate-spin" />
              ) : (
                <HugeiconsIcon icon={CheckmarkCircle02Icon} className="h-5 w-5" />
              )}
            </div>
            <CardTitle className="text-2xl font-bold">
              {isLoading ? 'Verifying your email' : isSuccess ? 'Email verified' : 'Verification failed'}
            </CardTitle>
            <CardDescription>
              {isLoading
                ? 'Please wait while we confirm your account.'
                : isSuccess
                  ? 'Your account is ready. You can continue to AI-BREAK.'
                  : 'This verification link is invalid or has expired.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-[#E5E5E5] bg-white px-4 py-3 text-sm text-[#525252]">
              {isSuccess
                ? 'Thanks for confirming your email address.'
                : 'You can request a fresh verification link from the sign-in screen.'}
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button type="button" className="w-full" onClick={isSuccess ? onSuccess : onBack} disabled={isLoading}>
              {isSuccess ? 'Continue' : 'Back to sign in'}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
