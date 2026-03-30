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
  likes: number;
  comments: number;
  shares: number;
  tags: string[];
  status: 'draft' | 'published';
  hasAudio?: boolean;
  audioDuration?: string;
  likedByUserIds: string[];
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
