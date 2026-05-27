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
  { value: 'furniture', label: 'Furniture' },
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
      { value: 'electronics_video_games', label: 'Video Games' },
      { value: 'electronics_computers', label: 'Computers' },
    ],
  },
  { value: 'toys', label: 'Toys' },
  { value: 'tools', label: 'Tools' },
  { value: 'books', label: 'Books' },
  { value: 'kitchen', label: 'Kitchen' },
  { value: 'sports', label: 'Sports' },
  { value: 'antiques', label: 'Antiques' },
  { value: 'other', label: 'Misc' },
];

// Returns the parent group for a subcategory value, or null if it's a top-level category
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
