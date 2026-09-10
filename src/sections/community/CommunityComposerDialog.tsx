import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useLocale } from '@/contexts/LocaleContext';
import { CommunityComposer } from './CommunityComposer';
import { CommunityPostCard } from './CommunityPostCard';
import type { UseCommunityEngagementResult } from '@/hooks/useCommunityEngagement';
import type { CommunityPost } from '@/types/community';

// Replying and quoting from a feed card open the composer in a modal rather
// than navigating away, so the reader keeps their scroll position. The post
// being replied to is shown above the box, exactly like X.

interface CommunityComposerDialogProps {
  mode: 'reply' | 'quote' | null;
  target: CommunityPost | null;
  actions: UseCommunityEngagementResult;
  onPosted: (post: CommunityPost) => void;
  onClose: () => void;
}

export function CommunityComposerDialog({
  mode,
  target,
  actions,
  onPosted,
  onClose,
}: CommunityComposerDialogProps) {
  const { t } = useLocale();
  const open = Boolean(mode && target);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) { onClose(); } }}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-y-auto p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-[#E5E5E5] px-4 py-3">
          <DialogTitle className="text-base">
            {t(mode === 'quote' ? 'community.post.quote' : 'community.post.reply')}
          </DialogTitle>
        </DialogHeader>

        {target && mode === 'reply' ? (
          <CommunityPostCard post={target} actions={actions} variant="detail" showThreadLine />
        ) : null}

        {target ? (
          <CommunityComposer
            parent={mode === 'reply' ? target : null}
            quoted={mode === 'quote' ? target : null}
            autoFocus
            onPosted={(post) => {
              onPosted(post);
              onClose();
            }}
            onCancel={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
