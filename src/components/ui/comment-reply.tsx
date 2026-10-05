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
          ? 'border-[var(--primary-accent)] bg-[var(--primary-accent)]/15 text-[var(--primary-accent)]'
          : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:border-[var(--primary-accent)] hover:text-[var(--primary-accent)]',
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
        class: 'ProseMirror min-h-28 rounded-[14px] px-2 py-2 text-[15px] leading-6 text-[var(--text-primary)]',
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
          class: 'ProseMirror min-h-28 rounded-[14px] px-2 py-2 text-[15px] leading-6 text-[var(--text-primary)]',
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
        'rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 shadow-[var(--shadow-card)] sm:p-6',
        className,
      )}
    >
      <span className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--primary-accent)]">
        {title}
      </span>

      <div className="mt-5 grid gap-4 lg:grid-cols-[88px_minmax(0,1fr)]">
        <div className="flex flex-row gap-3 lg:flex-col">
          <div className="flex min-w-[88px] flex-1 items-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card-alt)] p-3 lg:flex-col lg:justify-center lg:gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={handleReactionClick}
                className={cn(
                  'relative flex h-11 w-11 items-center justify-center rounded-full border transition-all',
                  isLiked
                    ? 'border-[var(--primary-accent)] bg-[var(--primary-accent)] text-[var(--accent-contrast)] shadow-md'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:border-[var(--primary-accent)] hover:text-[var(--primary-accent)]',
                )}
                aria-label={t('comment.likeNewsletter')}
              >
                <HugeiconsIcon icon={Heart} className={cn('h-4 w-4', isLiked ? 'fill-current' : '')} />
                {isRippling ? (
                  <span className="pointer-events-none absolute inset-0 rounded-full border border-[var(--primary-accent)]/60 [animation:ripple_0.6s_ease-out_forwards]" />
                ) : null}
              </button>
            </div>

            <div className="hidden h-8 w-px bg-[var(--border-subtle)] lg:block" />
            <div className="h-px flex-1 bg-[var(--border-subtle)] lg:hidden" />

            <span className="text-sm font-bold text-[var(--text-primary)]">{likeCount}</span>
          </div>

          <div className="flex flex-1 items-center gap-3 rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-card-alt)] px-4 py-3 text-[var(--text-secondary)] lg:flex-col lg:justify-center lg:gap-1">
            <HugeiconsIcon icon={Message01Icon} className="h-4 w-4" />
            <span className="text-sm font-bold text-[var(--text-primary)]">{commentCount}</span>
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
                  className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card-alt)] p-4 shadow-sm sm:p-5"
                >
                  <div className="flex items-start gap-4">
                    <Avatar className="h-11 w-11 border border-[var(--border-subtle)] bg-[var(--bg-card)]">
                      <AvatarImage src={comment.authorAvatar} alt={comment.authorName} />
                      <AvatarFallback className="bg-[var(--bg-pill)] text-xs font-semibold text-[var(--text-secondary)]">
                        {comment.authorName ? getInitials(comment.authorName) : <HugeiconsIcon icon={UserCircleIcon} className="h-4 w-4" />}
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <span className="block text-sm font-bold text-[var(--text-primary)]">
                            {comment.authorName}
                          </span>
                          <p className="text-xs text-[var(--text-muted)]">
                            {formatCommentDate(comment.createdAt)}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => onToggleCommentLike(comment.id)}
                          className={cn(
                            'inline-flex items-center gap-2 self-start rounded-full border px-2.5 py-1 text-xs font-semibold transition-all',
                            hasLikedComment
                              ? 'border-[var(--primary-accent)]/30 bg-[var(--primary-accent)]/15 text-[var(--primary-accent)]'
                              : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:border-[var(--primary-accent)]/40 hover:text-[var(--primary-accent)]',
                          )}
                        >
                          <HugeiconsIcon icon={Heart} className={cn('h-3.5 w-3.5', hasLikedComment ? 'fill-current' : '')} />
                          {comment.likes}
                        </button>
                      </div>

                      <div
                        className="text-[15px] leading-7 text-[var(--text-secondary)] mt-2 [&_em]:italic [&_s]:line-through [&_strong]:font-semibold [&_u]:underline"
                        dir="auto"
                        dangerouslySetInnerHTML={{ __html: formatCommentBodyToHtml(comment.body) }}
                      />
                    </div>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-card-alt)] px-6 py-8 text-center">
              <p className="text-base font-bold text-[var(--text-primary)]">{t('comment.noComments')}</p>
              <p className="mt-2 text-xs sm:text-sm text-[var(--text-secondary)]">
                {t('comment.startConversation')}
              </p>
            </div>
          )}

          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card-alt)] p-3 sm:p-4">
            <div className="rounded-2xl bg-[var(--bg-input)] p-3 border border-[var(--border-subtle)]">
              <div
                className={cn(
                  'min-h-28 rounded-xl border-0 bg-transparent text-[var(--text-primary)]',
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
                      <div className={cn('absolute top-11 z-10 grid w-48 grid-cols-5 gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 shadow-xl backdrop-blur-xl', isRTL ? 'right-0' : 'left-0')}>
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
                    className="h-11 w-11 rounded-full bg-[var(--primary-accent)] text-[var(--accent-contrast)] hover:bg-[var(--primary-accent-hover)] disabled:opacity-40"
                    title={t('comment.send')}
                  >
                    <HugeiconsIcon icon={SentIcon} className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onRequireAuth}
                    className="rounded-full border-[var(--border-subtle)] bg-[var(--bg-card)] px-4 text-[var(--text-secondary)] hover:border-[var(--primary-accent)]/30 hover:text-[var(--primary-accent)]"
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
