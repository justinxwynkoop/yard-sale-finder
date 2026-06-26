import { fireEvent, render, screen } from '@testing-library/react-native';
import { Chip } from '../Chip';
// @expo/vector-icons is stubbed globally via __mocks__/@expo/vector-icons.js
// (the real package pulls in expo-asset, which doesn't resolve under jest).

describe('Chip', () => {
  it('renders its label', async () => {
    await render(<Chip label="Furniture" />);
    expect(screen.getByText('Furniture')).toBeTruthy();
  });

  it('renders the label with an explicit tone', async () => {
    await render(<Chip label="Selected" tone="active" />);
    expect(screen.getByText('Selected')).toBeTruthy();
  });

  it('renders the label when active via the legacy prop', async () => {
    await render(<Chip label="Legacy active" active />);
    expect(screen.getByText('Legacy active')).toBeTruthy();
  });

  it('renders the label with the tonal tone', async () => {
    await render(<Chip label="Tonal" tone="tonal" />);
    expect(screen.getByText('Tonal')).toBeTruthy();
  });

  it('renders the label when an icon is provided', async () => {
    await render(<Chip label="Filter" icon="filter" />);
    expect(screen.getByText('Filter')).toBeTruthy();
  });

  it('calls onPress when pressed', async () => {
    const onPress = jest.fn();
    await render(<Chip label="Tap me" onPress={onPress} />);
    fireEvent.press(screen.getByText('Tap me'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
