import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, ViewIcon, ViewOffIcon } from "@hugeicons/core-free-icons";
import { useState } from 'react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (password: string) => boolean;
}

export function LoginModal({ isOpen, onClose, onLogin }: LoginModalProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    setTimeout(() => {
      const success = onLogin(password);
      if (!success) {
        setError('Invalid password. Please try again.');
        setIsLoading(false);
      }
    }, 500);
  };

  const handleClose = () => {
    setPassword('');
    setError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-md rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#E5E5E5]">
          <div className="flex items-center gap-3">
            <img 
              src="/logo.gif" 
              alt="AI Maor Break" 
              className="w-10 h-10 object-contain"
            />
            <div>
              <h3 className="font-bold text-[#171717]">Manager Access</h3>
              <p className="text-sm text-[#737373]">Enter your password to continue</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-[#737373] hover:text-[#171717] transition-colors"
          >
            <HugeiconsIcon icon={Cancel01Icon} className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full pr-12"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A3A3A3] hover:text-[#737373] transition-colors"
            >
              {showPassword ? <HugeiconsIcon icon={ViewOffIcon} className="w-5 h-5" /> : <HugeiconsIcon icon={ViewIcon} className="w-5 h-5" />}
            </button>
          </div>

          {error && (
            <div className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !password}
              className="flex-1 btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Verifying...
                </span>
              ) : (
                'Access Dashboard'
              )}
            </button>
          </div>

          <p className="text-center text-xs text-[#A3A3A3]">
            Hint: Try &quot;manager2024&quot;
          </p>
        </form>
      </div>
    </div>
  );
}
