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
