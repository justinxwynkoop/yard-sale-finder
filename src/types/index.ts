export type SaleStatus = 'active' | 'winding_down' | 'ended';

export type ItemCategory =
  | 'furniture'
  | 'furniture_bedroom'
  | 'furniture_living_room'
  | 'furniture_dining_room'
  | 'furniture_kitchen'
  | 'furniture_office'
  | 'furniture_outdoor'
  | 'clothing'
  | 'clothing_womens'
  | 'clothing_mens'
  | 'clothing_toddler'
  | 'clothing_teen'
  | 'electronics'
  | 'electronics_video_games'
  | 'electronics_computers'
  | 'electronics_phones'
  | 'electronics_audio'
  | 'electronics_tv'
  | 'electronics_cameras'
  | 'electronics_smart_home'
  | 'toys'
  | 'tools'
  | 'books'
  | 'books_fiction'
  | 'books_nonfiction'
  | 'books_childrens'
  | 'books_comics'
  | 'books_textbooks'
  | 'books_self_help'
  | 'kitchen'
  | 'kitchen_appliances'
  | 'kitchen_cookware'
  | 'kitchen_bakeware'
  | 'kitchen_dinnerware'
  | 'kitchen_storage'
  | 'sports'
  | 'sports_golf'
  | 'sports_cycling'
  | 'sports_fishing'
  | 'sports_camping'
  | 'sports_fitness'
  | 'sports_water'
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
  bio: string | null;
  phone: string | null;
  // Notification prefs — discrete booleans, mutated directly from the
  // Notifications screen via an `update profiles` call.
  notify_sales_nearby?: boolean;
  notify_saved_reminders?: boolean;
  notify_messages?: boolean;
  notify_offers?: boolean;
  notify_weekly_digest?: boolean;
  notify_tips?: boolean;
  created_at: string;
}

export interface Review {
  id: string;
  subject_user_id: string;
  author_user_id: string;
  sale_id: string | null;
  stars: number;
  body: string | null;
  created_at: string;
  author?: Profile;
}

export interface ReviewSummary {
  avg_stars: number;
  review_count: number;
}

export interface Follow {
  follower_id: string;
  followed_id: string;
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
  /** Host-supplied descriptors ("early_bird", "cash_only", etc). Empty array if unset. */
  vibe_tags: string[];
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
  /** Optional link to a yard sale this listing will be sold at. */
  sale_id: string | null;
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
  // Center "+" tab. Never navigates — the tab button intercepts the
  // press and opens the navigator-level PostMenu sheet.
  Post: undefined;
  Inbox: undefined;
  Profile: undefined;
};

export type MessagesStackParamList = {
  InboxHome: undefined;
  Conversation: { conversationId: string };
  PublicProfile: { userId: string; self?: boolean };
};

export type ListingsStackParamList = {
  ListingsHome: undefined;
  ListingDetail: { listingId: string };
  CreateListing: undefined;
  EditListing: { listingId: string };
  // Saved yard sales are no longer a standalone route — they're
  // accessed via the "Saved · N" chip on the Map. SavedListings
  // (listing favorites) is still a useful pushed route from Profile.
  SavedListings: undefined;
  SaleDetail: { saleId: string };
  ListingsFilter: undefined;
  Search: undefined;
  PublicProfile: { userId: string; self?: boolean };
};

export type MapStackParamList = {
  MapHome: { focusLat?: number; focusLng?: number } | undefined;
  SaleDetail: { saleId: string };
  FilterSheet: undefined;
  RoutePlanner: undefined;
  ActiveRoute: { saleIds: string[] };
  Search: undefined;
  PublicProfile: { userId: string; self?: boolean };
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
  // v3 redesign — Profile expansion
  MySales: undefined;
  MyListings: undefined;
  Saved: undefined;
  Account: undefined;
  Notifications: undefined;
  Blocked: undefined;
  PublicProfile: { userId: string; self?: boolean };
  SaleDetail: { saleId: string };
  ListingDetail: { listingId: string };
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
