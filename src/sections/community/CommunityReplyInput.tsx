import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { SentIcon } from '@hugeicons/core-free-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useLocale } from '@/contexts/LocaleContext';
import { searchCommunityPeople } from '@/lib/pocketbase/community';
import { cn } from '@/lib/utils';
import { CommunityAvatar } from './CommunityAvatar';
import type { CommunityProfile } from '@/types/community';

interface MentionSuggestion {
  handle: string;
  displayName: string;
  avatarUrl: string;
}

interface CommunityReplyInputProps {
  placeholder: string;
  /** Pre-seeded "@handle " prefix and the first suggestion offered for a bare "@". */
  mentionSeed?: MentionSuggestion | null;
  isSubmitting: boolean;
  onSubmit: (body: string) => void;
  onCancel: () => void;
}

// Matches the "@partial" token the caret currently sits in, if any.
const MENTION_TOKEN = /(^|\s)@([a-z0-9_]{0,30})$/i;

function toSuggestion(profile: CommunityProfile): MentionSuggestion {
  return {
    handle: profile.handle,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
  };
}

// The replied-to author is offered first whenever the typed token still prefixes their handle.
function seededFor(query: string | null, mentionSeed: MentionSuggestion | null): MentionSuggestion[] {
  if (query === null || !mentionSeed) {
    return [];
  }
  return mentionSeed.handle.toLowerCase().startsWith(query.toLowerCase()) ? [mentionSeed] : [];
}

export function CommunityReplyInput({
  placeholder,
  mentionSeed = null,
  isSubmitting,
  onSubmit,
  onCancel,
}: CommunityReplyInputProps) {
  const { t } = useLocale();
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState(mentionSeed ? `@${mentionSeed.handle} ` : '');
  const [query, setQuery] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<MentionSuggestion[]>([]);
  const [highlighted, setHighlighted] = useState(0);

  useEffect(() => {
    inputRef.current?.focus();
    const end = inputRef.current?.value.length ?? 0;
    inputRef.current?.setSelectionRange(end, end);
  }, []);

  // A bare "@" offers the replied-to author first; anything longer is searched.
  // The local narrowing is synchronous, so it is applied while rendering the
  // token change; only the debounced remote search needs an effect.
  const [lastToken, setLastToken] = useState<{ query: string | null; seed: MentionSuggestion | null }>({
    query,
    seed: mentionSeed,
  });
  if (lastToken.query !== query || lastToken.seed !== mentionSeed) {
    setLastToken({ query, seed: mentionSeed });
    if (query === null || query.length < 2) {
      setSuggestions(seededFor(query, mentionSeed));
    }
  }

  useEffect(() => {
    if (query === null || query.length < 2) {
      return;
    }

    const seeded = seededFor(query, mentionSeed);

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void searchCommunityPeople(query, { perPage: 6 })
        .then((page) => {
          if (cancelled) {
            return;
          }
          const found = page.items
            .map(toSuggestion)
            .filter((item) => !seeded.some((seed) => seed.handle === item.handle));
          setSuggestions(seeded.concat(found).slice(0, 6));
        })
        .catch(() => {
          if (!cancelled) {
            setSuggestions(seeded);
          }
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [mentionSeed, query]);

  const syncQuery = useCallback((next: string, caret: number) => {
    const match = MENTION_TOKEN.exec(next.slice(0, caret));
    setQuery(match ? match[2] : null);
    setHighlighted(0);
  }, []);

  const applySuggestion = (suggestion: MentionSuggestion) => {
    const input = inputRef.current;
    const caret = input?.selectionStart ?? value.length;
    const before = value.slice(0, caret).replace(MENTION_TOKEN, `$1@${suggestion.handle} `);
    const next = before + value.slice(caret);
    setValue(next);
    setQuery(null);
    setSuggestions([]);
    window.requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(before.length, before.length);
    });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (trimmed && !isSubmitting) {
      onSubmit(trimmed);
    }
  };

  const isOpen = suggestions.length > 0;

  return (
    <form onSubmit={submit} className="flex items-start gap-2">
      <CommunityAvatar
        handle={user?.email?.split('@')[0] || ''}
        displayName={user?.name || ''}
        avatarUrl={user?.avatar || ''}
        size="sm"
        className="z-10 shrink-0 ring-2 ring-[var(--bg-app)]"
      />

      <div className="relative min-w-0 flex-1">
        <div className="flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card)] px-3 py-1.5 shadow-2xs focus-within:border-[var(--primary-accent)] focus-within:ring-1 focus-within:ring-[var(--primary-accent)]">
          <input
            ref={inputRef}
            type="text"
            dir="auto"
            value={value}
            placeholder={placeholder}
            aria-autocomplete="list"
            aria-expanded={isOpen}
            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
            onChange={(event) => {
              setValue(event.target.value);
              syncQuery(event.target.value, event.target.selectionStart ?? event.target.value.length);
            }}
            onKeyDown={(event) => {
              if (!isOpen) {
                if (event.key === 'Escape') {
                  onCancel();
                }
                return;
              }
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setHighlighted((index) => (index + 1) % suggestions.length);
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setHighlighted((index) => (index - 1 + suggestions.length) % suggestions.length);
              } else if (event.key === 'Enter' || event.key === 'Tab') {
                event.preventDefault();
                applySuggestion(suggestions[highlighted]);
              } else if (event.key === 'Escape') {
                event.preventDefault();
                setQuery(null);
              }
            }}
          />
          <button
            type="submit"
            aria-label={t('community.comments.send')}
            disabled={!value.trim() || isSubmitting}
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-full transition-colors',
              value.trim() && !isSubmitting
                ? 'bg-[var(--primary-accent)] text-white hover:opacity-90'
                : 'cursor-not-allowed text-[var(--text-muted)] opacity-40',
            )}
          >
            <HugeiconsIcon icon={SentIcon} className="size-3.5 rtl:rotate-180" />
          </button>
        </div>

        {isOpen ? (
          <ul
            role="listbox"
            className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] py-1 shadow-xl"
          >
            {suggestions.map((suggestion, index) => (
              <li key={suggestion.handle}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === highlighted}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => applySuggestion(suggestion)}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-1.5 text-start transition-colors',
                    index === highlighted ? 'bg-[var(--bg-pill-hover)]' : 'hover:bg-[var(--bg-pill-hover)]',
                  )}
                >
                  <CommunityAvatar
                    handle={suggestion.handle}
                    displayName={suggestion.displayName}
                    avatarUrl={suggestion.avatarUrl}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold text-[var(--text-primary)]">
                      {suggestion.displayName || suggestion.handle}
                    </span>
                    <span className="block truncate text-[11px] text-[var(--text-muted)]">
                      @{suggestion.handle}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <button
          type="button"
          onClick={onCancel}
          className="mt-1 ps-2 text-[11px] font-semibold text-[var(--text-muted)] hover:underline"
        >
          {t('community.comments.cancel')}
        </button>
      </div>
    </form>
  );
}
