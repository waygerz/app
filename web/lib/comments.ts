import { apiJson } from '@/lib/http';
import { API } from './api-paths';
import type { ReactionKey } from './reactions';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? '';
const COMMENTS_API = API.comments;

export type Comment = {
  id: string;
  post_id: string;
  league_id: string;
  author_id: string;
  parent_id: string | null;
  author_name?: string;
  body: string;
  created_at: string;
  updated_at: string;
  replies?: Comment[];
};

export type PostEngagement = {
  reactions: Partial<Record<ReactionKey, number>>;
  total_reactions: number;
  my_reaction: ReactionKey | null;
  comment_count: number;
  // Back-compat fields the API still returns; unused by the reactions UI.
  like_count?: number;
  liked_by_me?: boolean;
};

export type ReactionSummary = {
  post_id: string;
  reactions: Partial<Record<ReactionKey, number>>;
  total_reactions: number;
  my_reaction: ReactionKey | null;
};

export type Reactor = {
  user_id: string;
  reaction: ReactionKey;
  display_name: string | null;
  avatar_key: string | null;
};

function req<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  return apiJson<T>(`${BASE}${path}`, options);
}

export const commentsApi = {
  engagement: (postIds: string[]) =>
    req<{ posts: Record<string, PostEngagement> }>(`${COMMENTS_API}/posts/engagement`, {
      method: 'POST',
      body: JSON.stringify({ post_ids: postIds }),
    }).then((d) => d.posts ?? {}),

  list: (postId: string) =>
    req<{ comments: Comment[] }>(`${COMMENTS_API}/posts/${postId}/comments`).then((d) => d.comments ?? []),

  create: (postId: string, body: string, parentId?: string) =>
    req<{ comment: Comment }>(`${COMMENTS_API}/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body, parent_id: parentId }),
    }).then((d) => d.comment),

  delete: (commentId: string) =>
    req(`${COMMENTS_API}/comments/${commentId}`, { method: 'DELETE' }),

  setReaction: (postId: string, reaction: ReactionKey) =>
    req<ReactionSummary>(`${COMMENTS_API}/posts/${postId}/reaction`, {
      method: 'PUT',
      body: JSON.stringify({ reaction }),
    }),

  removeReaction: (postId: string) =>
    req<ReactionSummary>(`${COMMENTS_API}/posts/${postId}/reaction`, { method: 'DELETE' }),

  reactors: (postId: string) =>
    req<{ reactors: Reactor[] }>(`${COMMENTS_API}/posts/${postId}/reactions`).then(
      (d) => d.reactors ?? [],
    ),
};