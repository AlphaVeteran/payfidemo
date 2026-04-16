declare module "@conflux-dev/conflux-address-js/lib/browser.js" {
  interface BrowserConfluxAddressJs {
    encode(hexAddress: string, netId: number): string;
    decode(address: string): unknown;
  }
  const mod: BrowserConfluxAddressJs;
  export default mod;
}

