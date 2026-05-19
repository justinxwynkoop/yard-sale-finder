// Tiny module-level emitter used to hand captured photos back from the
// CaptureSale screen to the caller (CreateSale) without putting a
// non-serializable function in navigation params.

type Listener = (uris: string[]) => void;

let listener: Listener | null = null;

export const captureBus = {
  setListener(fn: Listener | null) {
    listener = fn;
  },
  emit(uris: string[]) {
    const current = listener;
    listener = null;
    current?.(uris);
  },
  clear() {
    listener = null;
  },
};
