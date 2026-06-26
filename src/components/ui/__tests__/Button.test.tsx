import { fireEvent, render, screen } from '@testing-library/react-native';
import { Button } from '../Button';

type JsonNode = {
  type?: string;
  children?: (JsonNode | string)[] | null;
};

// Walks the serialized render tree and returns true if any node matches `type`.
function treeHasType(node: JsonNode | JsonNode[] | string | null, type: string): boolean {
  if (node == null || typeof node === 'string') return false;
  if (Array.isArray(node)) return node.some((n) => treeHasType(n, type));
  if (node.type === type) return true;
  return (node.children ?? []).some((child) => treeHasType(child, type));
}

describe('Button', () => {
  it('renders its children label', async () => {
    await render(<Button>Post sale</Button>);
    expect(screen.getByText('Post sale')).toBeTruthy();
  });

  it('fires onPress when pressed', async () => {
    const onPress = jest.fn();
    await render(<Button onPress={onPress}>Tap me</Button>);
    fireEvent.press(screen.getByText('Tap me'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire onPress when disabled', async () => {
    const onPress = jest.fn();
    await render(
      <Button onPress={onPress} disabled>
        Disabled
      </Button>,
    );
    fireEvent.press(screen.getByText('Disabled'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('marks the button disabled via accessibilityState when disabled', async () => {
    await render(<Button disabled>Disabled</Button>);
    // The Pressable is the parent of the label Text; it carries the a11y state.
    const pressable = screen.getByText('Disabled').parent;
    expect(pressable).toBeDisabled();
    expect(pressable?.props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('is enabled by default', async () => {
    await render(<Button>Active</Button>);
    expect(screen.getByText('Active').parent).toBeEnabled();
  });

  it('hides the label and shows a spinner when loading', async () => {
    await render(<Button loading>Loading label</Button>);
    // Label is replaced by the spinner while loading.
    expect(screen.queryByText('Loading label')).toBeNull();
    expect(treeHasType(screen.toJSON() as JsonNode | null, 'ActivityIndicator')).toBe(true);
  });

  it('does not fire onPress when loading', async () => {
    const onPress = jest.fn();
    await render(
      <Button onPress={onPress} loading>
        Loading
      </Button>,
    );
    // No label is rendered while loading, so press the root pressable.
    const root = screen.root!;
    expect(root).toBeDisabled();
    fireEvent.press(root);
    expect(onPress).not.toHaveBeenCalled();
  });
});
