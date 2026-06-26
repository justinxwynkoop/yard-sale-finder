import { render, screen } from '@testing-library/react-native';
import { StatusBadge } from '../StatusBadge';

describe('StatusBadge', () => {
  it('renders "Live" for an active sale', async () => {
    await render(<StatusBadge status="active" />);
    expect(screen.getByText('Live')).toBeTruthy();
  });

  it('renders "Ending soon" for a winding_down sale', async () => {
    await render(<StatusBadge status="winding_down" />);
    expect(screen.getByText('Ending soon')).toBeTruthy();
  });

  it('renders "Ended" for an ended sale', async () => {
    await render(<StatusBadge status="ended" />);
    expect(screen.getByText('Ended')).toBeTruthy();
  });
});
