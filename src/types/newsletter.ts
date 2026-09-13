export interface NewsletterComment {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  body: string;
  createdAt: string;
  likes: number;
  likedByUserIds: string[];
}

export type NewsletterTextAlignment = 'left' | 'center' | 'right';

export interface NewsletterPollOption {
  id: string;
  text: string;
  votes: number;
  voterUserIds: string[];
}

export interface NewsletterPoll {
  id: string;
  question: string;
  options: NewsletterPollOption[];
  closed?: boolean;
  createdAt?: string;
}

export interface NewsletterEventAttendee {
  userId: string;
  name: string;
  avatar?: string;
  rsvpAt: string;
}

export interface NewsletterEvent {
  id: string;
  title: string;
  description?: string;
  startDate: string; // ISO string e.g. "2026-09-20T14:00"
  endDate?: string;   // ISO string e.g. "2026-09-20T15:00"
  location?: string;
  attendees: NewsletterEventAttendee[];
}

export interface PresentationPreview {
  sourceFileName: string;
  sourceUrl?: string;
  title?: string;
  status: 'ready' | 'failed';
  slideCount: number;
  previewFiles: string[];
  previewUrls: string[];
  error?: string;
  createdAt?: string;
}

export interface Newsletter {
  id: string;
  title: string;
  subtitle: string;
  content: string;
  excerpt: string;
  author: string;
  authorAvatar?: string;
  createdById?: string;
  publishedAt: string;
  readTime: string;
  coverImage: string;
  textAlignment: NewsletterTextAlignment;
  likes: number;
  comments: number;
  shares: number;
  tags: string[];
  status: 'draft' | 'published';
  hasAudio?: boolean;
  audioDuration?: string;
  presentationFiles?: string[];
  presentationPreviews?: PresentationPreview[];
  likedByUserIds: string[];
  bookmarkedByUserIds: string[];
  commentItems: NewsletterComment[];
  poll?: NewsletterPoll | null;
  event?: NewsletterEvent | null;
}

export interface NewsletterFormData {
  title: string;
  subtitle: string;
  content: string;
  author: string;
  coverImage: string;
  tags: string[];
  status: 'draft' | 'published';
  publishedAt?: string;
  poll?: NewsletterPoll | null;
  event?: NewsletterEvent | null;
}
