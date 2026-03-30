import { useState } from 'react';
import { toast } from 'sonner';

export function Sidebar() {
  const [email, setEmail] = useState('');

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error('Please enter your email');
      return;
    }
    toast.success('Welcome to AI-BREAK! Check your inbox.');
    setEmail('');
  };

  return (
    <aside className="space-y-8">
      {/* Subscribe Card */}
      <div className="bg-[#F9FAFB] rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <img 
            src="/logo.gif" 
            alt="AI Maor Break" 
            className="w-12 h-12 object-contain"
          />
          <div>
            <h3 className="font-bold text-[#171717]">AI-BREAK</h3>
            <p className="text-xs text-[#737373]">Weekly AI insights</p>
          </div>
        </div>
        <p className="text-sm text-[#737373] mb-4">
          Become the AI expert at your company. Get practical workflows and templates that save time, cut costs, and prove your value.
        </p>
        <form onSubmit={handleSubscribe} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Type your email..."
            className="w-full"
          />
          <button type="submit" className="btn-primary w-full">
            Subscribe
          </button>
        </form>
      </div>

      {/* Stats Card */}
      <div className="border border-[#E5E5E5] rounded-xl p-6">
        <h3 className="font-bold text-[#171717] mb-4">Community</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-[#737373]">Subscribers</span>
            <span className="font-semibold text-[#171717]">12,450</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-[#737373]">Open Rate</span>
            <span className="font-semibold text-[#D93A3A]">38.5%</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-[#737373]">Weekly Growth</span>
            <span className="font-semibold text-green-600">+15%</span>
          </div>
        </div>
      </div>

      {/* Topics */}
      <div className="border border-[#E5E5E5] rounded-xl p-6">
        <h3 className="font-bold text-[#171717] mb-4">Topics</h3>
        <div className="flex flex-wrap gap-2">
          {['Research', 'Products', 'Policy', 'Design', 'Infrastructure'].map((topic) => (
            <span
              key={topic}
              className="px-3 py-1.5 bg-[#F3F4F6] text-[#737373] text-sm rounded-lg hover:bg-[#E5E5E5] cursor-pointer transition-colors"
            >
              {topic}
            </span>
          ))}
        </div>
      </div>
    </aside>
  );
}
