export type SaleStatus = 'active' | 'winding_down' | 'ended';

export type ItemCategory =
  | 'furniture'
  | 'clothing'
  | 'electronics'
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

export type RootStackParamList = {
  // Boot state
  Loading: undefined;
  // Signed-out flows
  Auth: undefined;
  ForgotPassword: undefined;
  CheckEmail: { email: string };
  ResetPassword: undefined;
  // Post-signin gate
  CompleteProfile: undefined;
  Main: undefined;
};

export type MainTabParamList = {
  Map: undefined;
  MySales: undefined;
  Profile: undefined;
};

export type MapStackParamList = {
  MapHome: { focusLat?: number; focusLng?: number } | undefined;
  SaleDetail: { saleId: string };
};

export type SaleStackParamList = {
  MySalesHome: undefined;
  CreateSale: undefined;
  EditSale: { saleId: string };
  Capture: { max?: number } | undefined;
};
