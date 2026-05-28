import { ItemCategory } from '../types';

export interface SubCategory {
  value: ItemCategory;
  label: string;
}

export interface CategoryGroup {
  value: ItemCategory;
  label: string;
  subcategories?: SubCategory[];
}

export const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    value: 'furniture',
    label: 'Furniture',
    subcategories: [
      { value: 'furniture_bedroom', label: 'Bedroom' },
      { value: 'furniture_living_room', label: 'Living Room' },
      { value: 'furniture_dining_room', label: 'Dining Room' },
      { value: 'furniture_kitchen', label: 'Kitchen' },
      { value: 'furniture_office', label: 'Office' },
      { value: 'furniture_outdoor', label: 'Outdoor & Patio' },
    ],
  },
  {
    value: 'clothing',
    label: 'Clothing',
    subcategories: [
      { value: 'clothing_womens', label: "Women's" },
      { value: 'clothing_mens', label: "Men's" },
      { value: 'clothing_toddler', label: 'Toddler' },
      { value: 'clothing_teen', label: 'Teen' },
    ],
  },
  {
    value: 'electronics',
    label: 'Electronics',
    subcategories: [
      { value: 'electronics_phones', label: 'Phones & Tablets' },
      { value: 'electronics_audio', label: 'Audio' },
      { value: 'electronics_tv', label: 'TV & Video' },
      { value: 'electronics_cameras', label: 'Cameras' },
      { value: 'electronics_smart_home', label: 'Smart Home' },
      { value: 'electronics_video_games', label: 'Video Games' },
      { value: 'electronics_computers', label: 'Computers' },
    ],
  },
  { value: 'toys', label: 'Toys' },
  { value: 'tools', label: 'Tools' },
  {
    value: 'books',
    label: 'Books',
    subcategories: [
      { value: 'books_fiction', label: 'Fiction' },
      { value: 'books_nonfiction', label: 'Non-Fiction' },
      { value: 'books_childrens', label: "Children's" },
      { value: 'books_comics', label: 'Comics & Manga' },
      { value: 'books_textbooks', label: 'Textbooks' },
      { value: 'books_self_help', label: 'Self-Help' },
    ],
  },
  {
    value: 'kitchen',
    label: 'Kitchen',
    subcategories: [
      { value: 'kitchen_appliances', label: 'Appliances' },
      { value: 'kitchen_cookware', label: 'Cookware' },
      { value: 'kitchen_bakeware', label: 'Bakeware' },
      { value: 'kitchen_dinnerware', label: 'Dinnerware' },
      { value: 'kitchen_storage', label: 'Storage' },
    ],
  },
  {
    value: 'sports',
    label: 'Sports',
    subcategories: [
      { value: 'sports_golf', label: 'Golf' },
      { value: 'sports_cycling', label: 'Cycling' },
      { value: 'sports_fishing', label: 'Fishing' },
      { value: 'sports_camping', label: 'Camping & Hiking' },
      { value: 'sports_fitness', label: 'Fitness & Gym' },
      { value: 'sports_water', label: 'Water Sports' },
    ],
  },
  { value: 'antiques', label: 'Antiques' },
  { value: 'other', label: 'Misc' },
];

// Returns the human-readable label for any ItemCategory value.
// Used wherever raw enum values would otherwise appear in the UI.
export function getCategoryLabel(value: ItemCategory): string {
  for (const group of CATEGORY_GROUPS) {
    if (group.value === value) return group.label;
    const sub = group.subcategories?.find((s) => s.value === value);
    if (sub) return sub.label;
  }
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

// Returns the parent group for a subcategory value, or null if it's a top-level category.
export function getParentGroup(value: ItemCategory): CategoryGroup | null {
  for (const group of CATEGORY_GROUPS) {
    if (group.subcategories?.some((s) => s.value === value)) return group;
  }
  return null;
}

// Given a set of selected categories, add a new one:
// - If adding a subcategory, also ensure the parent is included
// - If adding a parent, just add the parent (subcategories optional)
export function addCategory(selected: ItemCategory[], value: ItemCategory): ItemCategory[] {
  const result = new Set(selected);
  result.add(value);
  const parent = getParentGroup(value);
  if (parent) result.add(parent.value);
  return Array.from(result);
}

// Given a set of selected categories, remove one:
// - If removing a parent, also remove all its subcategories
// - If removing a subcategory, just remove that subcategory (parent stays)
export function removeCategory(selected: ItemCategory[], value: ItemCategory): ItemCategory[] {
  const group = CATEGORY_GROUPS.find((g) => g.value === value);
  const toRemove = new Set<ItemCategory>([value]);
  if (group?.subcategories) {
    group.subcategories.forEach((s) => toRemove.add(s.value));
  }
  return selected.filter((c) => !toRemove.has(c));
}

export function toggleCategory(selected: ItemCategory[], value: ItemCategory): ItemCategory[] {
  return selected.includes(value)
    ? removeCategory(selected, value)
    : addCategory(selected, value);
}
