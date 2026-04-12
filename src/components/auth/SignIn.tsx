import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, Loading02Icon, LockIcon, Mail01Icon, ViewIcon, ViewOffIcon } from "@hugeicons/core-free-icons";
import { useState } from 'react';
import { toast } from 'sonner';
import { LanguageToggleButton } from '@/components/LanguageToggleButton';
import { useAuth } from '@/contexts/AuthContext';
import { useLocale } from '@/contexts/LocaleContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface SignInProps {
  onBack: () => void;
  onSuccess: () => void;
}

export function SignIn({ onBack, onSuccess }: SignInProps) {
  const { login, register, initiateSSO, requestPasswordReset } = useAuth();
  const { isRTL, t } = useLocale();
  const [isSignUp, setIsSignUp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [resetEmail, setResetEmail] = useState('');

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setName('');
    setConfirmPassword('');
    setResetEmail('');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (showForgotPassword) {
      if (!resetEmail) {
        toast.error(t('auth.pleaseEnterEmail'));
        return;
      }

      setIsLoading(true);
      const success = await requestPasswordReset(resetEmail);
      setIsLoading(false);

      if (success) {
        setShowForgotPassword(false);
        setResetEmail('');
      }
      return;
    }

    if (isSignUp) {
      if (!email || !password || !name) {
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

      if (!agreeTerms) {
        toast.error(t('auth.acceptTerms'));
        return;
      }

      setIsLoading(true);
      const success = await register(email, password, name);
      setIsLoading(false);
      if (success) {
        onSuccess();
      }
      return;
    }

    if (!email || !password) {
      toast.error(t('auth.enterCredentials'));
      return;
    }

    setIsLoading(true);
    const success = await login(email, password);
    setIsLoading(false);
    if (success) {
      onSuccess();
    }
  };

  const handleSSO = async () => {
    setIsLoading(true);
    try {
      await initiateSSO('oidc');
    } finally {
      setIsLoading(false);
    }
  };

  if (showForgotPassword) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-4">
          <div className="flex justify-end">
            <LanguageToggleButton compact />
          </div>
          <Card className="w-full">
          <CardHeader className="space-y-1">
            <div className="flex items-center gap-2 mb-4">
              <button onClick={() => setShowForgotPassword(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <HugeiconsIcon icon={ArrowLeft01Icon} className={cn('w-4 h-4', isRTL && 'rtl-rotate-180')} />
              </button>
            </div>
            <CardTitle className="text-2xl font-bold">{t('auth.resetPassword')}</CardTitle>
            <CardDescription>{t('auth.resetDescription')}</CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email">{t('auth.email')}</Label>
                <div className="relative">
                  <HugeiconsIcon icon={Mail01Icon} className={cn('absolute top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400', isRTL ? 'right-3' : 'left-3')} />
                  <Input
                    id="reset-email"
                    type="email"
                    placeholder={t('auth.emailPlaceholder')}
                    value={resetEmail}
                    onChange={(event) => setResetEmail(event.target.value)}
                    dir={isRTL ? 'rtl' : 'ltr'}
                    className={isRTL ? 'pr-10' : 'pl-10'}
                    required
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex gap-3">
              <Button type="button" variant="outline" className="w-full" onClick={onBack}>
                {t('auth.cancel')}
              </Button>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <HugeiconsIcon icon={Loading02Icon} className="mr-2 h-4 w-4 animate-spin" />}
                {t('auth.sendReset')}
              </Button>
            </CardFooter>
          </form>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-4 flex justify-end">
          <LanguageToggleButton compact />
        </div>
        <div className="text-center mb-8">
          <button onClick={onBack} className="inline-flex items-center gap-2 hover:opacity-80 transition-opacity">
            <img src="/logo.gif" alt="AI-Break" className="w-24 h-24 object-contain" />
            <span className="font-bold text-2xl text-[#171717] mt-8">{t('auth.brandName')}</span>
          </button>
        </div>

        <Card>
          <CardHeader className="space-y-1">
            <div className="inline-flex rounded-xl bg-[#F3F4F6] p-1">
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(false);
                  setShowForgotPassword(false);
                  resetForm();
                }}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  !isSignUp ? 'bg-white text-[#171717] shadow-sm' : 'text-[#737373] hover:text-[#171717]'
                }`}
              >
                {t('auth.signIn')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(true);
                  setShowForgotPassword(false);
                  resetForm();
                }}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  isSignUp ? 'bg-white text-[#171717] shadow-sm' : 'text-[#737373] hover:text-[#171717]'
                }`}
              >
                {t('auth.signUp')}
              </button>
            </div>
            <CardTitle className="text-2xl font-bold">
              {isSignUp ? t('auth.createAccount') : t('auth.signInTitle')}
            </CardTitle>
            <CardDescription>
              {isSignUp ? t('auth.createAccountDescription') : t('auth.signInDescription')}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <Button variant="outline" onClick={handleSSO} disabled={isLoading} className="w-full">
              {isLoading && <HugeiconsIcon icon={Loading02Icon} className="mr-2 h-4 w-4 animate-spin" />}
              {t('auth.signInWithSSO')}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator className="w-full" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-gray-500">{t('auth.continueWithEmail')}</span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {isSignUp && (
                <div className="space-y-2">
                  <Label htmlFor="name">{t('auth.fullName')}</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder={t('auth.fullNamePlaceholder')}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required={isSignUp}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">{t('auth.email')}</Label>
                <div className="relative">
                  <HugeiconsIcon icon={Mail01Icon} className={cn('absolute top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400', isRTL ? 'right-3' : 'left-3')} />
                  <Input
                    id="email"
                    type="email"
                    placeholder={t('auth.emailPlaceholder')}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    dir={isRTL ? 'rtl' : 'ltr'}
                    className={isRTL ? 'pr-10' : 'pl-10'}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">{t('auth.password')}</Label>
                <div className="relative">
                  <HugeiconsIcon icon={LockIcon} className={cn('absolute top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400', isRTL ? 'right-3' : 'left-3')} />
                  <Input
                    id="password"
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

              {isSignUp && (
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">{t('auth.confirmPassword')}</Label>
                  <div className="relative">
                    <HugeiconsIcon icon={LockIcon} className={cn('absolute top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400', isRTL ? 'right-3' : 'left-3')} />
                    <Input
                      id="confirm-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      dir={isRTL ? 'rtl' : 'ltr'}
                      className={isRTL ? 'pr-10' : 'pl-10'}
                      required={isSignUp}
                    />
                  </div>
                </div>
              )}

              {isSignUp && (
                <div className={cn('flex items-start', isRTL ? 'space-x-reverse space-x-2' : 'space-x-2')}>
                  <Checkbox
                    id="terms"
                    checked={agreeTerms}
                    onCheckedChange={(checked) => setAgreeTerms(checked === true)}
                  />
                  <label htmlFor="terms" className="text-sm text-gray-600 leading-none">
                    {t('auth.agreeTerms')}
                  </label>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <HugeiconsIcon icon={Loading02Icon} className="mr-2 h-4 w-4 animate-spin" />}
                {isSignUp ? t('auth.signUpButton') : t('auth.signInButton')}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="flex flex-col space-y-4">
            {!isSignUp && (
              <button onClick={() => setShowForgotPassword(true)} className="text-sm text-[#D93A3A] hover:underline">
                {t('auth.forgotPassword')}
              </button>
            )}
          </CardFooter>
        </Card>

      </div>
    </div>
  );
}
