import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { useLocale } from '@/contexts/LocaleContext';
import { getPocketBaseErrorMessage, reportCommunityContent } from '@/lib/pocketbase/community';
import {
  COMMUNITY_MAX_REPORT_DETAILS_LENGTH,
  COMMUNITY_REPORT_REASONS,
  type CommunityReportReason,
} from '@/types/community';

// One dialog reports either a post or an account: the hook route takes postId
// or handle and refuses both at once, so the caller passes exactly one.

interface CommunityReportDialogProps {
  target: { postId?: string; handle?: string } | null;
  onClose: () => void;
}

export function CommunityReportDialog({ target, onClose }: CommunityReportDialogProps) {
  const { t } = useLocale();
  const [reason, setReason] = useState<CommunityReportReason>('spam');
  const [details, setDetails] = useState('');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (target) {
      setReason('spam');
      setDetails('');
    }
  }, [target]);

  const submit = async () => {
    if (!target) {
      return;
    }

    setIsSending(true);
    try {
      await reportCommunityContent({
        postId: target.postId,
        handle: target.handle,
        reason,
        details: details.trim(),
      });
      toast.success(t('community.report.sent'));
      onClose();
    } catch (caught) {
      toast.error(getPocketBaseErrorMessage(caught, t('community.report.failed')));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => { if (!open) { onClose(); } }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('community.report.title')}</DialogTitle>
          <DialogDescription>{t('community.report.body')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t('community.report.reason')}</Label>
            <RadioGroup
              value={reason}
              onValueChange={(value) => setReason(value as CommunityReportReason)}
              className="gap-2"
            >
              {COMMUNITY_REPORT_REASONS.map((value) => (
                <div key={value} className="flex items-center gap-2">
                  <RadioGroupItem value={value} id={'report-reason-' + value} />
                  <Label htmlFor={'report-reason-' + value} className="font-normal">
                    {t('community.report.reason.' + value)}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="report-details">{t('community.report.details')}</Label>
            <Textarea
              id="report-details"
              value={details}
              maxLength={COMMUNITY_MAX_REPORT_DETAILS_LENGTH}
              onChange={(event) => setDetails(event.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="button" disabled={isSending} onClick={() => void submit()}>
            {t('community.report.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
