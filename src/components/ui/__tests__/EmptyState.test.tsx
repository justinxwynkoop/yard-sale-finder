import { render, screen } from '@testing-library/react-native';
import { EmptyState } from '../EmptyState';

describe('EmptyState', () => {
  it('renders the title', async () => {
    await render(<EmptyState title="No sales near you" />);
    expect(screen.getByText('No sales near you')).toBeTruthy();
  });

  it('renders the description when provided', async () => {
    await render(<EmptyState title="No sales" description="Try widening the area." />);
    expect(screen.getByText('Try widening the area.')).toBeTruthy();
  });

  it('omits the description when not provided', async () => {
    await render(<EmptyState title="Only a title" />);
    expect(screen.queryByText('Try widening the area.')).toBeNull();
  });
});
