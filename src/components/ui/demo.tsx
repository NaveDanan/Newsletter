import { Component } from '@/components/ui/comment-reply';

export default function DemoOne() {
  return (
    <Component
      likeCount={14}
      commentCount={1}
      isLiked={false}
      comments={[
        {
          id: 'demo-comment',
          authorId: 'demo-user',
          authorName: 'Yassine Zanina',
          body: "I've been using this product for a few days now and I'm really impressed! The interface is intuitive and easy to use, and the features are exactly what I need to streamline my workflow.",
          createdAt: new Date('2026-03-13T14:45:00Z').toISOString(),
          likes: 3,
          likedByUserIds: [],
        },
      ]}
      value=""
      onChange={() => {}}
      onSubmit={() => {}}
      onToggleLike={() => {}}
      onToggleCommentLike={() => {}}
      formatCommentDate={() => 'Wednesday, March 13th at 2:45pm'}
    />
  );
}
