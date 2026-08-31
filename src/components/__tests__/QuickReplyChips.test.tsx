import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { QuickReplyChips } from '../QuickReplyChips';

describe('QuickReplyChips', () => {
  it('renders nothing when prompts is empty', async () => {
    const result = await render(
      <QuickReplyChips prompts={[]} onPick={jest.fn()} />,
    );
    expect(result.toJSON()).toBeNull();
  });

  it('pressing a chip calls onPick with that chip\'s exact text', async () => {
    const onPick = jest.fn();
    await render(
      <QuickReplyChips
        prompts={['Is this still available?', 'Can you hold it for me?']}
        onPick={onPick}
      />,
    );
    await act(async () => {
      fireEvent.press(screen.getByText('Can you hold it for me?'));
    });
    expect(onPick).toHaveBeenCalledWith('Can you hold it for me?');
  });
});
