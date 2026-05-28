import { getCategoryLabel } from '../../lib/categories';

describe('getCategoryLabel', () => {
  it('returns the label for top-level categories', () => {
    expect(getCategoryLabel('furniture')).toBe('Furniture');
    expect(getCategoryLabel('clothing')).toBe('Clothing');
    expect(getCategoryLabel('kitchen')).toBe('Kitchen');
    expect(getCategoryLabel('other')).toBe('Misc');
  });

  it('returns human-readable labels for existing subcategories (no underscores)', () => {
    expect(getCategoryLabel('clothing_mens')).toBe("Men's");
    expect(getCategoryLabel('clothing_womens')).toBe("Women's");
    expect(getCategoryLabel('electronics_video_games')).toBe('Video Games');
    expect(getCategoryLabel('electronics_computers')).toBe('Computers');
  });

  it('returns labels for new Furniture subcategories', () => {
    expect(getCategoryLabel('furniture_bedroom')).toBe('Bedroom');
    expect(getCategoryLabel('furniture_living_room')).toBe('Living Room');
    expect(getCategoryLabel('furniture_dining_room')).toBe('Dining Room');
    expect(getCategoryLabel('furniture_kitchen')).toBe('Kitchen');
    expect(getCategoryLabel('furniture_office')).toBe('Office');
    expect(getCategoryLabel('furniture_outdoor')).toBe('Outdoor & Patio');
  });

  it('returns labels for new Electronics subcategories', () => {
    expect(getCategoryLabel('electronics_phones')).toBe('Phones & Tablets');
    expect(getCategoryLabel('electronics_audio')).toBe('Audio');
    expect(getCategoryLabel('electronics_tv')).toBe('TV & Video');
    expect(getCategoryLabel('electronics_cameras')).toBe('Cameras');
    expect(getCategoryLabel('electronics_smart_home')).toBe('Smart Home');
  });

  it('returns labels for new Books subcategories', () => {
    expect(getCategoryLabel('books_fiction')).toBe('Fiction');
    expect(getCategoryLabel('books_nonfiction')).toBe('Non-Fiction');
    expect(getCategoryLabel('books_childrens')).toBe("Children's");
    expect(getCategoryLabel('books_comics')).toBe('Comics & Manga');
    expect(getCategoryLabel('books_textbooks')).toBe('Textbooks');
    expect(getCategoryLabel('books_self_help')).toBe('Self-Help');
  });

  it('returns labels for new Sports subcategories', () => {
    expect(getCategoryLabel('sports_golf')).toBe('Golf');
    expect(getCategoryLabel('sports_cycling')).toBe('Cycling');
    expect(getCategoryLabel('sports_fishing')).toBe('Fishing');
    expect(getCategoryLabel('sports_camping')).toBe('Camping & Hiking');
    expect(getCategoryLabel('sports_fitness')).toBe('Fitness & Gym');
    expect(getCategoryLabel('sports_water')).toBe('Water Sports');
  });

  it('returns labels for new Kitchen subcategories', () => {
    expect(getCategoryLabel('kitchen_appliances')).toBe('Appliances');
    expect(getCategoryLabel('kitchen_cookware')).toBe('Cookware');
    expect(getCategoryLabel('kitchen_bakeware')).toBe('Bakeware');
    expect(getCategoryLabel('kitchen_dinnerware')).toBe('Dinnerware');
    expect(getCategoryLabel('kitchen_storage')).toBe('Storage');
  });
});
