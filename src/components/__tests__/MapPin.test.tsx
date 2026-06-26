import { render, screen } from '@testing-library/react-native';
import { MapPin } from '../MapPin';
// @expo/vector-icons is stubbed globally via __mocks__/@expo/vector-icons.js,
// which renders each icon's `name` as text — so heart/checkmark are queryable.

describe('MapPin', () => {
  describe('the "NEW" tag', () => {
    it('renders "NEW" when the sale is new and not visited or favorited', async () => {
      await render(
        <MapPin status="active" isNew visited={false} favorited={false} />,
      );
      expect(screen.getByText('NEW')).toBeTruthy();
    });

    it('suppresses "NEW" once the sale is marked visited', async () => {
      await render(<MapPin status="active" isNew visited favorited={false} />);
      expect(screen.queryByText('NEW')).toBeNull();
    });

    it('suppresses "NEW" when the sale is favorited (saved heart wins)', async () => {
      await render(<MapPin status="active" isNew favorited visited={false} />);
      expect(screen.queryByText('NEW')).toBeNull();
    });

    it('suppresses "NEW" when the sale is in the route plan', async () => {
      await render(
        <MapPin
          status="active"
          isNew
          inRoute
          visited={false}
          favorited={false}
        />,
      );
      expect(screen.queryByText('NEW')).toBeNull();
    });

    it('does not render "NEW" when the sale is not new', async () => {
      await render(
        <MapPin status="active" isNew={false} visited={false} favorited={false} />,
      );
      expect(screen.queryByText('NEW')).toBeNull();
    });
  });

  describe('icon variants', () => {
    it('renders a heart when favorited', async () => {
      await render(<MapPin status="active" favorited />);
      expect(screen.getAllByText('heart').length).toBeGreaterThan(0);
    });

    it('renders a checkmark when visited (and no heart)', async () => {
      await render(
        <MapPin status="active" visited isNew={false} favorited={false} />,
      );
      expect(screen.getByText('checkmark')).toBeTruthy();
      expect(screen.queryByText('heart')).toBeNull();
    });

    it('renders neither heart nor checkmark for a plain active dot', async () => {
      await render(
        <MapPin
          status="active"
          isNew={false}
          visited={false}
          favorited={false}
        />,
      );
      expect(screen.queryByText('heart')).toBeNull();
      expect(screen.queryByText('checkmark')).toBeNull();
      expect(screen.queryByText('NEW')).toBeNull();
    });
  });
});
