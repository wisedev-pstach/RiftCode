/// <reference types="vite/client" />

import type { RiftApi } from "../../shared/contracts";

declare global {
  interface Window {
    rift: RiftApi;
  }
}

export {};
