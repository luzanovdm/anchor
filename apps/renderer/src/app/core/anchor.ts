import type { AnchorBridge } from '@anchor/core';

/** Native helpers exposed by preload that depend on DOM types. */
export interface AnchorNative {
  pathForFile(file: File): string;
}

declare global {
  interface Window {
    readonly anchor: AnchorBridge;
    readonly anchorNative: AnchorNative;
  }
}

/** The single typed handle to the main process exposed by the preload bridge. */
export const anchor: AnchorBridge = window.anchor;
export const anchorNative: AnchorNative = window.anchorNative;
