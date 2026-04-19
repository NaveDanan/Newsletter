import { HugeiconsIcon } from "@hugeicons/react";
import { Heart, Message01Icon, SentIcon, SmileIcon, TextBoldIcon, TextItalicIcon, TextStrikethroughIcon, TextUnderlineIcon, UserCircleIcon } from "@hugeicons/core-free-icons";
import { useEffect, useState, type ReactNode } from 'react';
import Placeholder from '@tiptap/extension-placeholder';
import StarterKit from '@tiptap/starter-kit';
import { EditorContent, useEditor } from '@tiptap/react';
import { COMMENT_EMOJIS, formatCommentBodyToHtml, stripCommentFormatting } from '@/lib/comment-formatting';
import { useLocale } from '@/contexts/LocaleContext';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import type { PocketBaseUser } from '@/lib/pocketbase/client';
import type { NewsletterComment } from '@/types/newsletter';

interface CommentReplyProps {
  className?: string;
  title?: string;
  likeCount: number;
  commentCount: number;
  isLiked: boolean;
  comments: NewsletterComment[];
  value: string;
  currentUser?: PocketBaseUser | null;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onToggleLike: () => void;
  onToggleCommentLike: (commentId: string) => void;
  onRequireAuth?: () => void;
  formatCommentDate: (value: string) => string;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function ToolbarButton({
  children,
  label,
  onClick,
  isActive = false,
  disabled = false,
}: {
  children: ReactNode;
  label: string;
  onClick?: () => void;
  isActive?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={isActive}
      disabled={disabled}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-full border transition-all',
        isActive
          ? 'border-[#D93A3A]/25 bg-[#FFF1F1] text-[#D93A3A]'
          : 'border-[#E4E6EB] bg-white text-[#707277] hover:border-[#D93A3A]/35 hover:text-[#D93A3A]',
      )}
    >
      {children}
    </button>
  );
}

export function CommentReply({
  className,
  title = 'Comments',
  likeCount,
  commentCount,
  isLiked,
  comments,
  value,
  currentUser = null,
  onChange,
  onSubmit,
  onToggleLike,
  onToggleCommentLike,
  onRequireAuth,
  formatCommentDate,
}: CommentReplyProps) {
  const { isRTL, t } = useLocale();
  const [isRippling, setIsRippling] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const isAuthenticated = Boolean(currentUser?.id);
  const hasMeaningfulComment = Boolean(stripCommentFormatting(value));
  const editor = useEditor({
    immediatelyRender: false,
    editable: isAuthenticated,
    extensions: [
      StarterKit.configure({
        bulletList: false,
        orderedList: false,
        codeBlock: false,
        blockquote: false,
        heading: false,
        horizontalRule: false,
      }),
      Placeholder.configure({
        placeholder: isAuthenticated ? t('comment.replyPlaceholder') : t('comment.signInToReply'),
      }),
    ],
    content: value || '',
    onUpdate: ({ editor: currentEditor }) => {
      onChange(currentEditor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'ProseMirror min-h-28 rounded-[14px] px-2 py-2 text-[15px] leading-6 text-[#262A33]',
        dir: isRTL ? 'rtl' : 'ltr',
      },
    },
  });
  const isBoldActive = Boolean(editor?.isActive('bold'));
  const isItalicActive = Boolean(editor?.isActive('italic'));
  const isUnderlineActive = Boolean(editor?.isActive('underline'));
  const isStrikethroughActive = Boolean(editor?.isActive('strike'));

  useEffect(() => {
    if (!isRippling) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setIsRippling(false);
    }, 600);

    return () => window.clearTimeout(timeout);
  }, [isRippling]);

  const handleReactionClick = () => {
    setIsRippling(true);
    onToggleLike();
  };

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.setEditable(isAuthenticated);
    editor.setOptions({
      editorProps: {
        attributes: {
          class: 'ProseMirror min-h-28 rounded-[14px] px-2 py-2 text-[15px] leading-6 text-[#262A33]',
          dir: isRTL ? 'rtl' : 'ltr',
        },
      },
    });
  }, [editor, isAuthenticated, isRTL]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const normalizedValue = value || '';
    if (editor.getHTML() === normalizedValue) {
      return;
    }

    editor.commands.setContent(normalizedValue, { emitUpdate: false });
  }, [editor, value]);

  const focusEditor = () => {
    if (!isAuthenticated) {
      onRequireAuth?.();
      return false;
    }

    editor?.chain().focus().run();
    return true;
  };

  const insertEmoji = (emoji: string) => {
    if (!focusEditor()) {
      return;
    }

    editor?.chain().focus().insertContent(emoji).run();
    setIsEmojiPickerOpen(false);
  };

  return (
    <div
      className={cn(
        'rounded-[18px] border border-[#E7E8EC] bg-[#FBFBFD] p-4 shadow-[0_35px_120px_-65px_rgba(20,24,38,0.55)] sm:p-6',
        className,
      )}
    >
      <span className="text-xs uppercase tracking-[0.24em] text-[#D93A3A]">
        {title}
      </span>

      <div className="mt-5 grid gap-4 lg:grid-cols-[88px_minmax(0,1fr)]">
        <div className="flex flex-row gap-3 lg:flex-col">
          <div className="flex min-w-[88px] flex-1 items-center gap-3 rounded-[14px] border border-[#E2E4E9] bg-white p-3 lg:flex-col lg:justify-center lg:gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={handleReactionClick}
                className={cn(
                  'relative flex h-11 w-11 items-center justify-center rounded-full border transition-all',
                  isLiked
                    ? 'border-[#D93A3A]/20 bg-[#D93A3A] text-white shadow-[0_18px_35px_-20px_rgba(217,58,58,0.9)]'
                    : 'border-[#E1E4EA] bg-[#F5F7FA] text-[#707277] hover:border-[#D93A3A]/35 hover:text-[#D93A3A]',
                )}
                aria-label={t('comment.likeNewsletter')}
              >
                <HugeiconsIcon icon={Heart} className={cn('h-4 w-4', isLiked ? 'fill-current' : '')} />
                {isRippling ? (
                  <span className="pointer-events-none absolute inset-0 rounded-full border border-[#D93A3A]/60 [animation:ripple_0.6s_ease-out_forwards]" />
                ) : null}
              </button>
            </div>

            <div className="hidden h-8 w-px bg-[#E7E8EC] lg:block" />
            <div className="h-px flex-1 bg-[#E7E8EC] lg:hidden" />

            <span className="text-sm font-semibold text-[#454851]">{likeCount}</span>
          </div>

          <div className="flex flex-1 items-center gap-3 rounded-[14px] border border-dashed border-[#E2E4E9] bg-white/80 px-4 py-3 text-[#6E7179] lg:flex-col lg:justify-center lg:gap-1">
            <HugeiconsIcon icon={Message01Icon} className="h-4 w-4" />
            <span className="text-sm font-semibold">{commentCount}</span>
          </div>
        </div>

        <div className="space-y-4">
          {comments.length > 0 ? (
            comments.map((comment) => {
              const hasLikedComment = Boolean(
                currentUser?.id && comment.likedByUserIds.includes(currentUser.id),
              );

              return (
                <article
                  key={comment.id}
                  className="rounded-[16px] border border-[#E2E4E9] bg-white p-4 shadow-[0_24px_60px_-48px_rgba(17,24,39,0.4)] sm:p-5"
                >
                  <div className="flex items-start gap-4">
                    <Avatar className="h-11 w-11 border border-[#E2E4E9] bg-[#F4F5F8]">
                      <AvatarImage src={comment.authorAvatar} alt={comment.authorName} />
                      <AvatarFallback className="bg-[#EEF0F4] text-xs font-semibold text-[#707277]">
                        {comment.authorName ? getInitials(comment.authorName) : <HugeiconsIcon icon={UserCircleIcon} className="h-4 w-4" />}
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <span className="block text-sm font-semibold text-[#262A33]">
                            {comment.authorName}
                          </span>
                          <p className="text-xs text-[#7D8088]">
                            {formatCommentDate(comment.createdAt)}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => onToggleCommentLike(comment.id)}
                          className={cn(
                            'inline-flex items-center gap-2 self-start rounded-full border px-2 py-1 text-xs font-semibold transition-all',
                            hasLikedComment
                              ? 'border-[#D93A3A]/20 bg-[#FFF1F1] text-[#D93A3A]'
                              : 'border-[#E2E4E9] bg-[#F8F9FB] text-[#707277] hover:border-[#D93A3A]/30 hover:text-[#D93A3A]',
                          )}
                        >
                          <HugeiconsIcon icon={Heart} className={cn('h-3.5 w-3.5', hasLikedComment ? 'fill-current' : '')} />
                          {comment.likes}
                        </button>
                      </div>

                      <div
                        className="text-[15px] leading-7 text-[#50535B] [&_em]:italic [&_s]:line-through [&_strong]:font-semibold [&_u]:underline"
                        dir="auto"
                        dangerouslySetInnerHTML={{ __html: formatCommentBodyToHtml(comment.body) }}
                      />
                    </div>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="rounded-[14px] border border-dashed border-[#D8DCE5] bg-white px-6 py-8 text-center">
              <p className="text-base font-semibold text-[#262A33]">{t('comment.noComments')}</p>
              <p className="mt-2 text-sm text-[#7D8088]">
                {t('comment.startConversation')}
              </p>
            </div>
          )}

          <div className="rounded-[14px] border border-[#E2E4E9] bg-white p-3 shadow-[0_30px_70px_-55px_rgba(17,24,39,0.8)] sm:p-4">
            <div className="rounded-[14px] bg-[#F7F8FB] p-3">
              <div
                className={cn(
                  'min-h-28 rounded-[14px] border-0 bg-transparent',
                  !isAuthenticated && 'cursor-not-allowed opacity-80',
                )}
                onClick={() => {
                  setIsEmojiPickerOpen(false);
                  focusEditor();
                }}
              >
                <EditorContent editor={editor} />
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <ToolbarButton
                    label={t('comment.bold')}
                    onClick={() => focusEditor() && editor?.chain().focus().toggleBold().run()}
                    isActive={isBoldActive}
                    disabled={!isAuthenticated}
                  >
                    <HugeiconsIcon icon={TextBoldIcon} className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarButton
                    label={t('comment.italic')}
                    onClick={() => focusEditor() && editor?.chain().focus().toggleItalic().run()}
                    isActive={isItalicActive}
                    disabled={!isAuthenticated}
                  >
                    <HugeiconsIcon icon={TextItalicIcon} className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarButton
                    label={t('comment.underline')}
                    onClick={() => focusEditor() && editor?.chain().focus().toggleUnderline().run()}
                    isActive={isUnderlineActive}
                    disabled={!isAuthenticated}
                  >
                    <HugeiconsIcon icon={TextUnderlineIcon} className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarButton
                    label={t('comment.strikethrough')}
                    onClick={() => focusEditor() && editor?.chain().focus().toggleStrike().run()}
                    isActive={isStrikethroughActive}
                    disabled={!isAuthenticated}
                  >
                    <HugeiconsIcon icon={TextStrikethroughIcon} className="h-4 w-4" />
                  </ToolbarButton>
                  <div className="relative">
                    <ToolbarButton
                      label={t('comment.emoji')}
                      onClick={() => {
                        if (!isAuthenticated) {
                          onRequireAuth?.();
                          return;
                        }

                        editor?.chain().focus().run();
                        setIsEmojiPickerOpen((open) => !open);
                      }}
                      isActive={isEmojiPickerOpen}
                      disabled={!isAuthenticated}
                    >
                      <HugeiconsIcon icon={SmileIcon} className="h-4 w-4" />
                    </ToolbarButton>

                    {isEmojiPickerOpen ? (
                      <div className={cn('absolute top-11 z-10 grid w-48 grid-cols-5 gap-2 rounded-[14px] border border-[#E2E4E9] bg-white p-3 shadow-[0_18px_50px_-30px_rgba(17,24,39,0.45)]', isRTL ? 'right-0' : 'left-0')}>
                        {COMMENT_EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => insertEmoji(emoji)}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-lg transition-colors hover:bg-[#FFF1F1]"
                            aria-label={t('comment.insertEmoji', { emoji })}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>

                {isAuthenticated ? (
                  <Button
                    type="button"
                    onClick={onSubmit}
                    disabled={!hasMeaningfulComment}
                    size="icon"
                    className="h-11 w-11 rounded-full bg-[#D93A3A] text-white hover:bg-[#BF3131] disabled:bg-[#F2C9C9] disabled:text-white"
                    title={t('comment.send')}
                  >
                    <HugeiconsIcon icon={SentIcon} className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onRequireAuth}
                    className="rounded-full border-[#E2E4E9] bg-white px-4 text-[#454851] hover:border-[#D93A3A]/30 hover:bg-[#FFF6F6] hover:text-[#D93A3A]"
                  >
                    {t('comment.signIn')}
                  </Button>
                )}
              </div>
            </div>

            {isAuthenticated ? (
              <p className="px-2 pt-3 text-xs text-[#8B8E96]">
                {t('comment.replyingAs', { name: currentUser?.name ?? '' })}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export { CommentReply as Component };
