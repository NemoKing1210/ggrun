import type { ActionState } from "@/lib/shared/types/action-state";

export type AdminFormState = ActionState;
export type ExternalSearchState = ActionState & {
  results?: Array<{
    title: string;
    genres: string[];
    coverUrl: string | null;
    platform: string | null;
    externalId: string;
    provider: string;
    metacritic: number | null;
    rating: number | null;
    description?: string | null;
    playtimeHours?: number | null;
    stores?: Array<{ store: string; url: string }> | null;
    website?: string | null;
  }>;
};

export type UrlImportState = ActionState & {
  game?: {
    title: string;
    coverUrl: string | null;
    description: string | null;
    platform: string | null;
    genres: string[];
    tags: string[];
    metacritic: number | null;
    rating: number | null;
    website: string | null;
    stores: Array<{ store: string; url: string }>;
    detectedProvider: string;
    sourceUrl: string;
    externalId?: string;
  };
};
