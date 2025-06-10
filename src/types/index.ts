export interface Profile {
  id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  bio?: string;
  interests?: string[];
  avatar_url?: string;
  photos?: { url: string; order: number }[];
  enable_ai_analysis?: boolean;
  ai_analysis_scores?: {
    communicationStyle?: number;
    activityPreference?: number;
    socialDynamics?: number;
    lastUpdated?: string;
  };
  word_patterns?: {
    unigrams: string[];
    bigrams: string[];
    trigrams: string[];
    topWords: Array<{ word: string; score: number }>;
  };
  spotify_connected?: boolean;
  spotify_top_genres?: string[];
  spotify_refresh_token?: string;
  spotify_access_token?: string;
  spotify_token_expires_at?: string;
  spotify_top_artists?: Array<{
    name: string;
    image: string;
    spotify_url: string;
  }>;
  spotify_selected_playlist?: {
    id: string;
    name: string;
    description: string;
    image: string;
    spotify_url: string;
    owner: string;
    tracks_count: number;
  };
  visibility_settings: {
    spotify: {
      top_artists: boolean;
      top_genres: boolean;
      selected_playlist: boolean;
    };
    photos: boolean;
    interests: boolean;
    ai_analysis: boolean;
  };
}
