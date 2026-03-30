import { HugeiconsIcon } from "@hugeicons/react";
import { CancelCircleIcon, CheckmarkCircle02Icon, Loading02Icon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import type { SSOProvider } from '@/lib/pocketbase/client';

interface SSOCallbackProps {
  onFinish: () => void;
  onRetry: () => void;
}

export function SSOCallback({ onFinish, onRetry }: SSOCallbackProps) {
  const { handleSSOCallback } = useAuth();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const processCallback = async () => {
      const searchParams = new URLSearchParams(window.location.search);
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const error = searchParams.get('error');
      const errorDescription = searchParams.get('error_description');

      if (error) {
        setStatus('error');
        setErrorMessage(errorDescription || error);
        toast.error(`Authentication failed: ${errorDescription || error}`);
        return;
      }

      if (!code) {
        setStatus('error');
        setErrorMessage('Missing authorization code');
        toast.error('Invalid authentication response');
        return;
      }

      const provider = localStorage.getItem('sso_provider') as SSOProvider | null;
      const storedState = localStorage.getItem('sso_state');

      if (state && state !== storedState) {
        setStatus('error');
        setErrorMessage('Invalid state parameter');
        toast.error('Security validation failed');
        return;
      }

      if (!provider) {
        setStatus('error');
        setErrorMessage('No SSO provider found');
        toast.error('Authentication session expired');
        return;
      }

      const success = await handleSSOCallback(code, provider);
      if (success) {
        setStatus('success');
        window.setTimeout(onFinish, 1500);
        return;
      }

      setStatus('error');
      setErrorMessage('Failed to complete authentication');
    };

    void processCallback();
  }, [handleSSOCallback, onFinish]);

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-4">
      <div className="text-center">
        {status === 'processing' && (
          <>
            <HugeiconsIcon icon={Loading02Icon} className="w-16 h-16 animate-spin text-[#D93A3A] mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-[#171717] mb-2">Completing Sign In</h2>
            <p className="text-gray-600">Please wait while we verify your credentials.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <HugeiconsIcon icon={CheckmarkCircle02Icon} className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-[#171717] mb-2">Sign In Successful</h2>
            <p className="text-gray-600">Redirecting you back to the homepage.</p>
          </>
        )}

        {status === 'error' && (
          <>
            <HugeiconsIcon icon={CancelCircleIcon} className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-[#171717] mb-2">Authentication Failed</h2>
            <p className="text-gray-600 mb-6">{errorMessage || 'Something went wrong during authentication.'}</p>
            <button onClick={onRetry} className="text-[#D93A3A] hover:underline font-medium">
              Back to Sign In
            </button>
          </>
        )}
      </div>
    </div>
  );
}
