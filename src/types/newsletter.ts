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
}

export interface NewsletterFormData {
  title: string;
  subtitle: string;
  content: string;
  author: string;
  coverImage: string;
  tags: string[];
  status: 'draft' | 'published';
}
