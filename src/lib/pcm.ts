/** Buffer arbitrary network boundaries into aligned 24kHz mono PCM blocks. */
export class PcmBuffer {
  private pending = new Uint8Array(0);
  constructor(private readonly blockBytes = 9600) {}

  push(value: Uint8Array, flush = false): Int16Array {
    const bytes = new Uint8Array(this.pending.length + value.length);
    bytes.set(this.pending);
    bytes.set(value, this.pending.length);
    const usable = bytes.length - bytes.length % (flush ? 2 : this.blockBytes);
    this.pending = bytes.slice(usable);
    // PCM is little-endian regardless of browser architecture.
    const view = new DataView(bytes.buffer);
    return Int16Array.from({ length: usable / 2 }, (_, i) => view.getInt16(i * 2, true));
  }
}
