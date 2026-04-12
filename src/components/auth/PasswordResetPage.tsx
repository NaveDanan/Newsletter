import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowLeft01Icon, Loading02Icon, LockIcon, ViewIcon, ViewOffIcon } from '@hugeicons/core-free-icons';
import { useState } from 'react';
import { toast } from 'sonner';
import { LanguageToggleButton } from '@/components/LanguageToggleButton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useLocale } from '@/contexts/LocaleContext';
import { cn } from '@/lib/utils';

interface PasswordResetPageProps {
  token: string;
  onBack: () => void;
  onSuccess: () => void;
}

export function PasswordResetPage({ token, onBack, onSuccess }: PasswordResetPageProps) {
  const { confirmPasswordReset } = useAuth();
  const { isRTL, t } = useLocale();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!password || !confirmPassword) {
      toast.error(t('auth.fillAllFields'));
      return;
    }

    if (password !== confirmPassword) {
      toast.error(t('auth.passwordsMismatch'));
      return;
    }

    if (password.length < 8) {
      toast.error(t('auth.passwordTooShort'));
      return;
    }

    setIsLoading(true);
    const success = await confirmPasswordReset(token, password);
    setIsLoading(false);

    if (success) {
      onSuccess();
    }
  };

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
            <CardTitle className="text-2xl font-bold">{t('auth.resetPageTitle')}</CardTitle>
            <CardDescription>{t('auth.resetPageDescription')}</CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">{t('auth.newPassword')}</Label>
                <div className="relative">
                  <HugeiconsIcon icon={LockIcon} className={cn('absolute top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400', isRTL ? 'right-3' : 'left-3')} />
                  <Input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    dir={isRTL ? 'rtl' : 'ltr'}
                    className={isRTL ? 'pr-10 pl-10' : 'pl-10 pr-10'}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className={cn('absolute top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600', isRTL ? 'left-3' : 'right-3')}
                  >
                    {showPassword ? <HugeiconsIcon icon={ViewOffIcon} className="w-4 h-4" /> : <HugeiconsIcon icon={ViewIcon} className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-new-password">{t('auth.confirmNewPassword')}</Label>
                <div className="relative">
                  <HugeiconsIcon icon={LockIcon} className={cn('absolute top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400', isRTL ? 'right-3' : 'left-3')} />
                  <Input
                    id="confirm-new-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    dir={isRTL ? 'rtl' : 'ltr'}
                    className={isRTL ? 'pr-10' : 'pl-10'}
                    required
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex gap-3">
              <Button type="button" variant="outline" className="w-full" onClick={onBack}>
                {t('auth.backToSignIn')}
              </Button>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <HugeiconsIcon icon={Loading02Icon} className="mr-2 h-4 w-4 animate-spin" />}
                {t('auth.saveNewPassword')}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}