export type SaleStatus = 'active' | 'winding_down' | 'ended';

export type ItemCategory =
  | 'furniture'
  | 'clothing'
  | 'clothing_womens'
  | 'clothing_mens'
  | 'clothing_toddler'
  | 'clothing_teen'
  | 'electronics'
  | 'electronics_video_games'
  | 'electronics_computers'
  | 'toys'
  | 'tools'
  | 'books'
  | 'kitchen'
  | 'sports'
  | 'antiques'
  | 'other';

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  // Extended onboarding fields
  first_name: string | null;
  last_name: string | null;
  city: string | null;
  state: string | null;       // 2-letter US abbreviation
  zip_code: string | null;
  birthdate: string | null;   // ISO date  YYYY-MM-DD
  terms_accepted_at: string | null;
  terms_version: string | null;
  created_at: string;
}

export interface Sale {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  address: string;
  latitude: number;
  longitude: number;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  status: SaleStatus;
  categories: ItemCategory[];
  pricing_notes: string | null;
  created_at: string;
  updated_at: string;
  profile?: Profile;
  media?: SaleMedia[];
}

export interface SaleMedia {
  id: string;
  sale_id: string;
  url: string;
  type: 'image' | 'video';
  order: number;
  created_at: string;
}

export interface Favorite {
  user_id: string;
  sale_id: string;
  created_at: string;
}

export interface ListingFavorite {
  user_id: string;
  listing_id: string;
  created_at: string;
}

export type ListingStatus = 'available' | 'sold';

export interface Listing {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  price: number;
  categories: ItemCategory[];
  pickup_input: string;
  pickup_display: string;
  pickup_lat: number;
  pickup_lng: number;
  status: ListingStatus;
  created_at: string;
  updated_at: string;
  profile?: Profile;
  media?: ListingMedia[];
}

export interface ListingMedia {
  id: string;
  listing_id: string;
  url: string;
  type: 'image' | 'video';
  order: number;
  created_at: string;
}

export type RootStackParamList = {
  // Boot state
  Loading: undefined;
  // Signed-out flows
  Auth: undefined;
  ForgotPassword: undefined;
  CheckEmail: { email: string };
  ResetPassword: undefined;
  // Post-signin gates
  CompleteProfile: undefined;
  Onboarding: undefined;
  Main: undefined;
};

export type MainTabParamList = {
  Map: undefined;
  Listings: undefined;
  // Slot previously occupied by "Saved" -- saved sales now live as a
  // pushed route inside the Listings stack (accessed via a heart icon
  // in the ListingsScreen header).
  Messages: undefined;
  Profile: undefined;
};

export type MessagesStackParamList = {
  Inbox: undefined;
  Conversation: { conversationId: string };
};

export type ListingsStackParamList = {
  ListingsHome: undefined;
  ListingDetail: { listingId: string };
  CreateListing: undefined;
  EditListing: { listingId: string };
  // SavedHome = favorited yard sales (map + list view)
  // SavedListings = favorited listings (list only)
  SavedHome: undefined;
  SavedListings: undefined;
  SaleDetail: { saleId: string };
};

export type MapStackParamList = {
  MapHome: { focusLat?: number; focusLng?: number } | undefined;
  SaleDetail: { saleId: string };
};

export type SaleStackParamList = {
  MySalesHome: { initialTab?: 'sales' | 'listings' } | undefined;
  CreateSale: undefined;
  EditSale: { saleId: string };
  Capture: { max?: number } | undefined;
  CreateListing: undefined;
  EditListing: { listingId: string };
  // SaleDetail can also be reached from the Inbox in MySales -- not
  // strictly required for v1, but the screen is harmless to register
  // here in case we add deep links from "your sale was messaged".
};

export type ProfileStackParamList = {
  ProfileHome: undefined;
  EditProfile: undefined;
  BlockedUsers: undefined;
  DeleteAccount: undefined;
  // initialTab lets Profile → "Yard Sales" and Profile → "Listings" open
  // MySalesScreen on the right tab without exposing the other tab.
  MySalesHome: { initialTab?: 'sales' | 'listings' } | undefined;
  CreateSale: undefined;
  EditSale: { saleId: string };
  Capture: { max?: number } | undefined;
  CreateListing: undefined;
  EditListing: { listingId: string };
};

export type ReportTargetType = 'sale' | 'listing' | 'profile';
export type ReportReason =
  | 'inappropriate'
  | 'spam_misleading'
  | 'illegal'
  | 'safety'
  | 'off_topic'
  | 'other';

export interface BlockedUser {
  blocker_id: string;
  blocked_id: string;
  created_at: string;
  // Joined: the profile of the blocked user (display_name, avatar, etc.)
  blocked?: Profile;
}

export type ConversationTargetType = 'sale' | 'listing';

export interface Conversation {
  id: string;
  target_type: ConversationTargetType;
  target_id: string;
  seller_id: string;
  buyer_id: string;
  created_at: string;
  last_message_at: string;
  buyer_last_read_at: string | null;
  seller_last_read_at: string | null;
  // Joined helpers (populated by useInbox via select hints):
  other_profile?: Profile;
  // Shallow target preview -- title + first image. Resolved by
  // useInbox with separate lookups since target_type is polymorphic.
  target_title?: string;
  target_image_url?: string;
  last_message_preview?: string;
  has_unread?: boolean;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}
