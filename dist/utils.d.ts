import type { Octokit } from "@octokit/rest";
export declare function getTableDataString(invalidFiles: string[]): string;
export declare function getAllIgnoredFileString(ignoreArray: string[]): Promise<unknown>;
export declare const GITHUB_COMMENT_BOT_PREFIX = "AssetsCheckBot";
export declare function convertBytes(bytes: number): string;
export declare function renderCommentBody(isSuccess: boolean, successBody: string, errorBody: string): string;
export declare function removePreviousBotComments(octokit: Octokit, owner: string, repo: string, issueNumber: number): Promise<void>;
export declare function getIgnoreArray(): string[];
export declare function getAssetsIgnoreFiles(sourceArray: string[], ignoreArray: string[]): string[];
