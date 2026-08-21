export type RootStackParamList = {
  Tabs: undefined;
  Scan: undefined;
  Review: { imageUri: string; barcode?: string; capturedAt?: string };
  Result: { rawCode: string; brand?: string; barcode?: string; storePrice?: number; imageUri?: string; capturedAt?: string };
};

export type TabsParamList = { Home: undefined; History: undefined; Favorites: undefined };

export interface Offer {
  provider: 'gmarket' | 'lotteon' | 'hmall' | 'himart';
  providerProductId: string;
  productName: string;
  productCode?: string;
  price: number;
  shippingFee?: number;
  finalPrice: number;
  productUrl: string;
  affiliateUrl?: string;
  imageUrl?: string;
  inStock: boolean;
  matchConfidence: number;
  checkedAt: string;
  source?: 'naver-shopping' | 'retailer-page' | 'api';
}

export interface SearchResponse {
  query: { rawCode: string; normalizedCode: string; variants: string[]; brand?: string };
  offers: Offer[];
  failures: string[];
  discovery?: { source: 'naver-web' | 'retailer-direct' | 'api'; status: 'ok' | 'no_exact_match' | 'failed' | 'partial'; checkedAt: string; candidateCount: number };
  summary: {
    lowestOnlinePrice: number | null;
    lowestProvider: Offer['provider'] | null;
    storePrice: number | null;
    savingAmount: number | null;
    recommendation: 'ONLINE_WIN' | 'STORE_WIN' | 'NO_ONLINE_STOCK' | 'SAME_PRICE' | 'ONLINE_FOUND';
  };
}

export interface ScanHistoryItem {
  id: number;
  scannedAt: string;
  capturedAt: string;
  lastViewedAt: string;
  imageUri?: string;
  brand?: string;
  productName?: string;
  rawProductCode: string;
  normalizedProductCode: string;
  barcode?: string;
  storePrice?: number;
  lowestOnlinePriceAtScan?: number;
  lowestProviderAtScan?: string;
  savingAmountAtScan?: number;
  recommendationAtScan?: string;
  favorite: number;
}
