import { render, screen } from '@testing-library/react-native';
import { Badge } from '../Badge';

describe('Badge', () => {
  it('renders its children text', async () => {
    await render(<Badge>Live now</Badge>);
    expect(screen.getByText('Live now')).toBeTruthy();
  });

  it('renders with a non-default tone', async () => {
    await render(<Badge tone="live">Active</Badge>);
    expect(screen.getByText('Active')).toBeTruthy();
  });

  it('renders the text when the dot is shown', async () => {
    await render(
      <Badge tone="live" dot>
        Happening
      </Badge>,
    );
    expect(screen.getByText('Happening')).toBeTruthy();
  });

  it('renders the text when the dot is hidden', async () => {
    await render(<Badge dot={false}>No dot</Badge>);
    expect(screen.getByText('No dot')).toBeTruthy();
  });
});
