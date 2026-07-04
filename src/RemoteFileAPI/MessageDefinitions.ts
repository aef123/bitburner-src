import type { SaveData } from "../types";
import type { BaseServer } from "../Server/BaseServer";

export class RFAMessage {
  jsonrpc = "2.0"; // Transmits version of JSON-RPC. Compliance maybe allows some funky interaction with external tools?
  public method?: string; // Is defined when it's a request/notification, otherwise undefined
  public result?: ResultType; // Is defined when it's a response, otherwise undefined
  public params?: FileDescription; // Optional parameters to method
  public error?: string; // Only defined on error
  public id?: number; // ID to keep track of request -> response interaction, undefined with notifications, defined with request/response

  constructor(
    obj: { method?: string; result?: ResultType; params?: FileDescription; error?: string; id?: number } = {},
  ) {
    this.method = obj.method;
    this.result = obj.result;
    this.params = obj.params;
    this.error = obj.error;
    this.id = obj.id;
  }
}

type ResultType =
  | string
  | number
  | string[]
  | FileContent[]
  | RFAServerData[]
  | {
      identifier: string;
      binary: boolean;
      save: SaveData;
    }
  | FileMetadata
  | FileMetadata[]
  | Record<string, unknown>;
type FileDescription =
  | FileData
  | FileContent
  | FileLocation
  | FileServer
  | SubscribeParams
  | UnsubscribeParams
  | TerminalCommandParams
  | InvokeActionParams;

export interface FileData {
  filename: string;
  content: string;
  server: string;
}

export interface FileContent {
  filename: string;
  content: string;
}

export interface FileLocation {
  filename: string;
  server: string;
}

export interface FileServer {
  server: string;
}

export interface FileMetadata {
  filename: string;
  atime: number;
  mtime: number;
  btime: number;
}

export type RFAServerData = Pick<BaseServer, "hostname" | "hasAdminRights" | "purchasedByPlayer">;

export function isFileData(p: unknown): p is FileData {
  const pf = p as FileData;
  return typeof pf.server === "string" && typeof pf.filename === "string" && typeof pf.content === "string";
}

export function isFileLocation(p: unknown): p is FileLocation {
  const pf = p as FileLocation;
  return typeof pf.server === "string" && typeof pf.filename === "string";
}

export function isFileContent(p: unknown): p is FileContent {
  const pf = p as FileContent;
  return typeof pf.filename === "string" && typeof pf.content === "string";
}

export function isFileServer(p: unknown): p is FileServer {
  const pf = p as FileServer;
  return typeof pf.server === "string";
}

export interface SubscribeParams {
  topic: string;
  intervalMs?: number;
}

export interface UnsubscribeParams {
  topic: string;
}

export function isSubscribeParams(p: unknown): p is SubscribeParams {
  const pp = p as SubscribeParams;
  return typeof pp.topic === "string";
}

export function isUnsubscribeParams(p: unknown): p is UnsubscribeParams {
  const pp = p as UnsubscribeParams;
  return typeof pp.topic === "string";
}

/** Params for the runTerminalCommand action. */
export interface TerminalCommandParams {
  command: string;
}

export function isTerminalCommandParams(p: unknown): p is TerminalCommandParams {
  const pp = p as TerminalCommandParams;
  return typeof pp.command === "string";
}

/** Params for the invokeAction handler. */
export interface InvokeActionParams {
  action: string;
  args: Record<string, unknown>;
}

export function isInvokeActionParams(p: unknown): p is InvokeActionParams {
  const pp = p as InvokeActionParams;
  return typeof pp.action === "string";
}
