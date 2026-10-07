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
      <div className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] flex items-center justify-center p-4 transition-colors">
        <div className="w-full max-w-md space-y-4">
          <div className="flex justify-end">
            <LanguageToggleButton compact />
          </div>
          <Card className="w-full bg-[var(--bg-card)] border-[var(--border-subtle)] rounded-3xl shadow-[var(--shadow-card)]">
          <CardHeader className="space-y-1">
            <div className="flex items-center gap-2 mb-5">
              <button onClick={() => setShowForgotPassword(false)} className="p-2 hover:bg-[var(--bg-pill-hover)] rounded-full transition-colors text-[var(--text-secondary)]">
                <HugeiconsIcon icon={ArrowLeft01Icon} className={cn('w-4 h-4', isRTL && 'rtl-rotate-180')} />
              </button>
            </div>
            <CardTitle className="text-2xl font-extrabold text-[var(--text-primary)]">{t('auth.resetPassword')}</CardTitle>
            <CardDescription className="text-[var(--text-secondary)]">{t('auth.resetDescription')}</CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email" className="text-sm font-semibold text-[var(--text-primary)]">{t('auth.email')}</Label>
                <div className="relative">
                  <HugeiconsIcon icon={Mail01Icon} className={cn('absolute top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]', isRTL ? 'right-3' : 'left-3')} />
                  <Input
                    id="reset-email"
                    type="email"
                    placeholder={t('auth.emailPlaceholder')}
                    value={resetEmail}
                    onChange={(event) => setResetEmail(event.target.value)}
                    dir={isRTL ? 'rtl' : 'ltr'}
                    className={cn('bg-[var(--bg-input)] border-[var(--border-subtle)] rounded-full text-[var(--text-primary)]', isRTL ? 'pr-10' : 'pl-10')}
                    required
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <button type="submit" className="btn-hire-me w-full py-2.5 text-sm" disabled={isLoading}>
                {isLoading && <HugeiconsIcon icon={Loading02Icon} className="mr-2 h-4 w-4 animate-spin" />}
                {t('auth.sendReset')}
              </button>
              <Button type="button" variant="outline" className="w-full rounded-full border-[var(--border-subtle)] bg-[var(--bg-card)] hover:bg-[var(--bg-pill-hover)] text-[var(--text-secondary)]" onClick={onBack}>
                {t('auth.cancel')}
              </Button>
            </CardFooter>
          </form>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] flex items-center justify-center p-4 transition-colors">
      <div className="w-full max-w-md">
        <div className="mb-4 flex justify-end">
          <LanguageToggleButton compact />
        </div>
        <div className="text-center mb-8">
          <button onClick={onBack} className="inline-flex items-center gap-3 group">
            <div className="brand-logo w-14 h-14 group-hover:scale-105 transition-transform">
              <img src="/logo.gif" alt="AI-Break" className="w-9 h-9 object-contain rounded-xl" />
            </div>
            <span className="font-extrabold text-2xl text-[var(--text-primary)] tracking-tight">{t('auth.brandName')}</span>
          </button>
        </div>

        <Card className="bg-[var(--bg-card)] border-[var(--border-subtle)] rounded-3xl shadow-[var(--shadow-card)]">
          <CardHeader className="space-y-2">
            <div className="inline-flex rounded-full bg-[var(--bg-pill)] p-1 border border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(false);
                  setShowForgotPassword(false);
                  resetForm();
                }}
                className={`flex-1 rounded-full px-4 py-2 text-xs sm:text-sm font-bold transition-all ${
                  !isSignUp ? 'bg-[var(--primary-accent)] text-[var(--accent-contrast)] shadow-md' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
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
                className={`flex-1 rounded-full px-4 py-2 text-xs sm:text-sm font-bold transition-all ${
                  isSignUp ? 'bg-[var(--primary-accent)] text-[var(--accent-contrast)] shadow-md' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {t('auth.signUp')}
              </button>
            </div>
            <CardTitle className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)]">
              {isSignUp ? t('auth.createAccount') : t('auth.signInTitle')}
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm text-[var(--text-secondary)]">
              {isSignUp ? t('auth.createAccountDescription') : t('auth.signInDescription')}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <Button variant="outline" onClick={handleSSO} disabled={isLoading} className="w-full rounded-full border-[var(--border-subtle)] bg-[var(--bg-card)] hover:bg-[var(--bg-pill-hover)] text-[var(--text-primary)]">
              {isLoading && <HugeiconsIcon icon={Loading02Icon} className="mr-2 h-4 w-4 animate-spin" />}
              {t('auth.signInWithSSO')}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator className="w-full bg-[var(--border-subtle)]" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-[var(--bg-card)] px-3 text-[var(--text-muted)] font-semibold">{t('auth.continueWithEmail')}</span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {isSignUp && (
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-xs font-semibold text-[var(--text-primary)]">{t('auth.fullName')}</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder={t('auth.fullNamePlaceholder')}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required={isSignUp}
                    className="bg-[var(--bg-input)] border-[var(--border-subtle)] rounded-full text-[var(--text-primary)]"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-semibold text-[var(--text-primary)]">{t('auth.email')}</Label>
                <div className="relative">
                  <HugeiconsIcon icon={Mail01Icon} className={cn('absolute top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]', isRTL ? 'right-3' : 'left-3')} />
                  <Input
                    id="email"
                    type="email"
                    placeholder={t('auth.emailPlaceholder')}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    dir={isRTL ? 'rtl' : 'ltr'}
                    className={cn('bg-[var(--bg-input)] border-[var(--border-subtle)] rounded-full text-[var(--text-primary)]', isRTL ? 'pr-10' : 'pl-10')}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-semibold text-[var(--text-primary)]">{t('auth.password')}</Label>
                <div className="relative">
                  <HugeiconsIcon icon={LockIcon} className={cn('absolute top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]', isRTL ? 'right-3' : 'left-3')} />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    dir={isRTL ? 'rtl' : 'ltr'}
                    className={cn('bg-[var(--bg-input)] border-[var(--border-subtle)] rounded-full text-[var(--text-primary)]', isRTL ? 'pr-10 pl-10' : 'pl-10 pr-10')}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className={cn('absolute top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]', isRTL ? 'left-3' : 'right-3')}
                  >
                    {showPassword ? <HugeiconsIcon icon={ViewOffIcon} className="w-4 h-4" /> : <HugeiconsIcon icon={ViewIcon} className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {isSignUp && (
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password" className="text-xs font-semibold text-[var(--text-primary)]">{t('auth.confirmPassword')}</Label>
                  <div className="relative">
                    <HugeiconsIcon icon={LockIcon} className={cn('absolute top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]', isRTL ? 'right-3' : 'left-3')} />
                    <Input
                      id="confirm-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      dir={isRTL ? 'rtl' : 'ltr'}
                      className={cn('bg-[var(--bg-input)] border-[var(--border-subtle)] rounded-full text-[var(--text-primary)]', isRTL ? 'pr-10' : 'pl-10')}
                      required={isSignUp}
                    />
                  </div>
                </div>
              )}

              {isSignUp && (
                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="terms"
                    checked={agreeTerms}
                    onCheckedChange={(checked) => setAgreeTerms(checked === true)}
                  />
                  <label htmlFor="terms" className="text-xs text-[var(--text-secondary)] leading-none">
                    {t('auth.agreeTerms')}
                  </label>
                </div>
              )}

              <button type="submit" className="btn-hire-me w-full py-2.5 text-sm" disabled={isLoading}>
                {isLoading && <HugeiconsIcon icon={Loading02Icon} className="mr-2 h-4 w-4 animate-spin" />}
                {isSignUp ? t('auth.signUpButton') : t('auth.signInButton')}
              </button>
            </form>
          </CardContent>

          <CardFooter className="flex flex-col space-y-4">
            {!isSignUp && (
              <button onClick={() => setShowForgotPassword(true)} className="text-xs font-semibold text-[var(--primary-accent)] hover:underline">
                {t('auth.forgotPassword')}
              </button>
            )}
          </CardFooter>
        </Card>

      </div>
    </div>
  );
}
