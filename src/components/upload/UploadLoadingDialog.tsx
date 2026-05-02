import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';

interface UploadLoadingDialogProps {
  open: boolean;
  title: string;
  description: string;
  fileName?: string;
}

export function UploadLoadingDialog({
  open,
  title,
  description,
  fileName,
}: UploadLoadingDialogProps) {
  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
        className="max-w-sm border-[#E5E5E5] bg-white p-0"
      >
        <div className="flex flex-col items-center gap-4 px-6 py-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#D93A3A]/10">
            <Spinner className="h-7 w-7 text-[#D93A3A]" />
          </div>
          <div className="space-y-2">
            <DialogTitle className="text-base font-semibold text-[#171717]">
              {title}
            </DialogTitle>
            <DialogDescription className="text-sm leading-6 text-[#737373]">
              {description}
            </DialogDescription>
          </div>
          {fileName && (
            <div className="max-w-full rounded-md border border-[#E5E5E5] bg-[#FAFAFA] px-3 py-2 text-xs font-medium text-[#525252]">
              <span className="block max-w-[18rem] truncate">{fileName}</span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
