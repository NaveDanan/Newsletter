import { readStoredValue } from './localStorage';
import type { Newsletter, NewsletterComment } from '../types/newsletter';

export const NEWSLETTER_STORAGE_KEY = 'pulse_ai_newsletters';

function getReadableText(content: string): string {
  return content
    .replace(/<img\b[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractExcerpt(content: string): string {
  const plainText = getReadableText(content);
  return plainText ? `${plainText.slice(0, 200)}...` : '';
}

export function calculateReadTime(content: string): string {
  const plainText = getReadableText(content);
  const wordCount = plainText ? plainText.split(/\s+/).length : 0;
  return `${Math.max(1, Math.ceil(wordCount / 200))} min read`;
}

function normalizeNewsletter(newsletter: Newsletter): Newsletter {
  const commentItems = Array.isArray(newsletter.commentItems)
    ? newsletter.commentItems.map(normalizeComment)
    : [];

  return {
    ...newsletter,
    excerpt: extractExcerpt(newsletter.content),
    readTime: calculateReadTime(newsletter.content),
    likes: Math.max(0, newsletter.likes ?? 0),
    comments: Math.max(0, newsletter.comments ?? commentItems.length),
    shares: Math.max(0, newsletter.shares ?? 0),
    likedByUserIds: Array.isArray(newsletter.likedByUserIds) ? newsletter.likedByUserIds : [],
    commentItems,
  };
}

function normalizeComment(comment: NewsletterComment): NewsletterComment {
  return {
    ...comment,
    likes: Math.max(0, comment.likes ?? 0),
    likedByUserIds: Array.isArray(comment.likedByUserIds) ? comment.likedByUserIds : [],
  };
}

export const initialNewsletters: Newsletter[] = [
  {
    id: '1',
    title: 'How I Set Up My AI Workflow Properly In Less Than 10 Minutes',
    subtitle: 'A step-by-step guide to building an efficient AI-powered workflow that saves hours every week.',
    content: `<h2>The Problem with Most AI Workflows</h2>
<p>Most people approach AI tools the wrong way. They try to use ChatGPT for everything, or they bounce between ten different apps without a clear strategy. The result? Wasted time and disappointing results.</p>
<h2>My 3-Step Framework</h2>
<p>After months of experimentation, I developed a simple framework that works:</p>
<ul>
<li><strong>Step 1:</strong> Identify repetitive tasks that drain your energy</li>
<li><strong>Step 2:</strong> Match each task to the right AI tool</li>
<li><strong>Step 3:</strong> Create templates and shortcuts for instant execution</li>
</ul>
<h2>The Tools I Actually Use</h2>
<p>Here is my current stack:</p>
<ol>
<li><strong>Claude:</strong> For deep research and analysis</li>
<li><strong>ChatGPT:</strong> For quick brainstorming and coding help</li>
<li><strong>Midjourney:</strong> For visual content creation</li>
<li><strong>Notion AI:</strong> For organizing and summarizing notes</li>
</ol>
<blockquote>
<p>The key is not using more tools-it is using the right tools for the right jobs.</p>
</blockquote>
<h2>Results After 30 Days</h2>
<p>By implementing this workflow, I have:</p>
<ul>
<li>Saved 8+ hours per week</li>
<li>Improved content quality by 40%</li>
<li>Reduced decision fatigue significantly</li>
</ul>`,
    excerpt: 'A step-by-step guide to building an efficient AI-powered workflow that saves hours every week.',
    author: 'Alex Chen',
    authorAvatar: '',
    publishedAt: '2025-05-16',
    readTime: '5 min read',
    coverImage: '/feature_lab_image.jpg',
    likes: 141,
    comments: 2238,
    shares: 225,
    tags: ['Workflow', 'Productivity', 'AI Tools'],
    status: 'published',
    likedByUserIds: [],
    commentItems: [],
  },
  {
    id: '2',
    title: "They'll never know AI wrote this (copy my prompt)",
    subtitle: 'The exact prompt template I use to create content that sounds authentically human.',
    content: `<h2>The AI Detection Problem</h2>
<p>Everyone is worried about AI detection. But here is the truth: if your content sounds robotic, the problem is not the AI-it is your prompt.</p>
<h2>The Secret Sauce</h2>
<p>I have tested hundreds of prompts. This one consistently produces human-sounding content:</p>
<pre><code>Write [content type] about [topic] in the style of [specific voice/personality].

Include:
- Personal anecdotes or examples
- Contrarian opinions or hot takes
- Imperfections (slang, casual transitions, occasional humor)
- Specific details that only a human would know

Avoid:
- Generic statements
- Overly formal language
- Lists that feel too structured
- AI-sounding phrases like "In conclusion" or "It is important to note"</code></pre>
<h2>Why This Works</h2>
<p>The key is specificity. Most people give vague instructions like "write a blog post." That is like asking a chef to "make food."</p>
<p>Instead, give the AI a clear voice, specific constraints, and examples to emulate.</p>`,
    excerpt: 'The exact prompt template I use to create content that sounds authentically human.',
    author: 'Sarah Kim',
    authorAvatar: '',
    publishedAt: '2025-05-28',
    readTime: '4 min read',
    coverImage: '/cta_city_bg.jpg',
    likes: 116,
    comments: 1175,
    shares: 113,
    tags: ['Prompts', 'Writing', 'Content'],
    status: 'published',
    likedByUserIds: [],
    commentItems: [],
  },
  {
    id: '3',
    title: 'My Top 10 AI Features That Actually Matter At Work',
    subtitle: 'Forget the hype. These are the AI capabilities that deliver real results in a professional setting.',
    content: `<h2>Cutting Through the Noise</h2>
<p>Every week, there is a new AI feature announcement. Most of them are gimmicks. Here are the 10 that actually make a difference in my daily work.</p>
<h2>The List</h2>
<h3>1. Claude's 200K Context Window</h3>
<p>Being able to paste an entire report, codebase, or dataset and ask questions is game-changing. No more copy-pasting chunks.</p>
<h3>2. ChatGPT's Custom Instructions</h3>
<p>Set your preferences once, and every conversation starts with the right context. Saves 2-3 minutes per chat.</p>
<h3>3. Midjourney's Style Reference</h3>
<p>Upload an image, and MJ will match its style. Perfect for maintaining brand consistency.</p>
<h3>4. Notion AI's Database Queries</h3>
<p>Ask natural language questions about your databases. "Show me overdue tasks assigned to the design team."</p>
<h3>5. Grammarly's Tone Adjustments</h3>
<p>Rewrite the same message for different audiences instantly. Professional for executives, casual for teammates.</p>
<h3>6-10. And More...</h3>
<p>The full list includes features from Zapier, Figma, Google Workspace, and more.</p>`,
    excerpt: 'Forget the hype. These are the AI capabilities that deliver real results in a professional setting.',
    author: 'Marcus Johnson',
    authorAvatar: '',
    publishedAt: '2025-04-30',
    readTime: '7 min read',
    coverImage: '/hero_city_bg.jpg',
    likes: 9,
    comments: 241,
    shares: 34,
    tags: ['Features', 'Work', 'Productivity'],
    status: 'published',
    likedByUserIds: [],
    commentItems: [],
  },
];

export function loadNewsletters(): Newsletter[] {
  return readStoredValue<Newsletter[]>(NEWSLETTER_STORAGE_KEY, initialNewsletters).map(normalizeNewsletter);
}

export function getPublishedNewsletters(newsletters = loadNewsletters()): Newsletter[] {
  return newsletters
    .filter((newsletter) => newsletter.status === 'published')
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

export function getLatestPublishedNewsletter(): Newsletter | null {
  return getPublishedNewsletters()[0] ?? null;
}
