export type AdminWish = {
  id: string;
  title: string;
  description: string;
  productUrl: string;
  imageUrl: string | null;
  priceAmount: number | null;
  currency: string;
  shopName: string;
  sortOrder: number;
  archived: boolean;
  reserved: boolean;
  reservedBy: string | null;
  reservedAt: string | null;
};

export type WishDraft = {
  title: string;
  description: string;
  productUrl: string;
  imageUrl: string | null;
  priceAmount: number | null;
  currency: string;
  shopName: string;
};
