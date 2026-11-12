// This file was written by `cargo test -p scrb-protocol` from the lists in crates/scrb-protocol/src/lib.rs. Do not edit it by hand.
import type { AppInfo } from "./AppInfo.ts";

export const PROTOCOL_VERSION = 1;

export interface CoreScreenCalls {
  getAppInfo: { request: void; response: AppInfo };
}

export const CORE_SCREEN_CALL_NAMES = ["getAppInfo"] as const;

export type MainOnlyCallName = "hello" | "shutdown";

export type CoreAskName = never;

export interface CoreEvents {
}
