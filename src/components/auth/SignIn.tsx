import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircleIcon, ArrowLeft01Icon, ChromeIcon, GithubIcon, Loading02Icon, LockIcon, Mail01Icon, ViewIcon, ViewOffIcon } from "@hugeicons/core-free-icons";
import { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

interface SignInProps {
  onBack: () => void;
  onSuccess: () => void;
}

export function SignIn({ onBack, onSuccess }: SignInProps) {
  const { login, register, initiateSSO, requestPasswordReset } = useAuth();
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
        toast.error('Please enter your email');
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
        toast.error('Please fill in all fields');
        return;
      }

      if (password !== confirmPassword) {
        toast.error('Passwords do not match');
        return;
      }

      if (password.length < 8) {
        toast.error('Password must be at least 8 characters');
        return;
      }

      if (!agreeTerms) {
        toast.error('Please agree to the terms and conditions');
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
      toast.error('Please enter email and password');
      return;
    }

    setIsLoading(true);
    const success = await login(email, password);
    setIsLoading(false);
    if (success) {
      onSuccess();
    }
  };

  const handleSSO = async (provider: 'google' | 'github') => {
    setIsLoading(true);
    try {
      await initiateSSO(provider);
    } finally {
      setIsLoading(false);
    }
  };

  if (showForgotPassword) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <div className="flex items-center gap-2 mb-4">
              <button onClick={() => setShowForgotPassword(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <HugeiconsIcon icon={ArrowLeft01Icon} className="w-4 h-4" />
              </button>
            </div>
            <CardTitle className="text-2xl font-bold">Reset Password</CardTitle>
            <CardDescription>Enter your email and we&apos;ll send you reset instructions.</CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email">Email</Label>
                <div className="relative">
                  <HugeiconsIcon icon={Mail01Icon} className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    id="reset-email"
                    type="email"
                    placeholder="name@example.com"
                    value={resetEmail}
                    onChange={(event) => setResetEmail(event.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex gap-3">
              <Button type="button" variant="outline" className="w-full" onClick={onBack}>
                Cancel
              </Button>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <HugeiconsIcon icon={Loading02Icon} className="mr-2 h-4 w-4 animate-spin" />}
                Send Reset
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <button onClick={onBack} className="inline-flex items-center gap-2 hover:opacity-80 transition-opacity">
            <img src="/logo.gif" alt="AI-Break" className="w-24 h-24 object-contain" />
            <span className="font-bold text-2xl text-[#171717] mt-8">AI-Break</span>
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
                Sign In
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
                Sign Up
              </button>
            </div>
            <CardTitle className="text-2xl font-bold">
              {isSignUp ? 'Create an account' : 'Sign in to your account'}
            </CardTitle>
            <CardDescription>
              {isSignUp ? 'Enter your details to create your account' : 'Enter your email and password to sign in'}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={() => handleSSO('google')} disabled={isLoading} className="w-full">
                <HugeiconsIcon icon={ChromeIcon} className="mr-2 h-4 w-4" />
                Google
              </Button>
              <Button variant="outline" onClick={() => handleSSO('github')} disabled={isLoading} className="w-full">
                <HugeiconsIcon icon={GithubIcon} className="mr-2 h-4 w-4" />
                GitHub
              </Button>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator className="w-full" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-gray-500">Or continue with email</span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {isSignUp && (
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="John Doe"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required={isSignUp}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <HugeiconsIcon icon={Mail01Icon} className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <HugeiconsIcon icon={LockIcon} className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="pl-10 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <HugeiconsIcon icon={ViewOffIcon} className="w-4 h-4" /> : <HugeiconsIcon icon={ViewIcon} className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {isSignUp && (
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm Password</Label>
                  <div className="relative">
                    <HugeiconsIcon icon={LockIcon} className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      id="confirm-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      className="pl-10"
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
                  <label htmlFor="terms" className="text-sm text-gray-600 leading-none">
                    I agree to the Terms of Service and Privacy Policy
                  </label>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <HugeiconsIcon icon={Loading02Icon} className="mr-2 h-4 w-4 animate-spin" />}
                {isSignUp ? 'Create Account' : 'Sign In'}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="flex flex-col space-y-4">
            {!isSignUp && (
              <button onClick={() => setShowForgotPassword(true)} className="text-sm text-[#D93A3A] hover:underline">
                Forgot your password?
              </button>
            )}
          </CardFooter>
        </Card>

        {!import.meta.env.VITE_POCKETBASE_URL && (
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-3">
              <HugeiconsIcon icon={AlertCircleIcon} className="w-5 h-5 text-blue-600 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">PocketBase Setup Required</p>
                <p>Add `VITE_POCKETBASE_URL` to your environment before using sign-in or SSO.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
