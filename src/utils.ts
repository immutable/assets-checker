import fs from "node:fs";
import type { Octokit } from "@octokit/rest";

export function getTableDataString(invalidFiles: string[]) {
  const filteredFiles = [];

  for (const item of invalidFiles) {
    const fileName = item.split(" ").slice(-1).pop();
    const fileSize = item.split(" ")[4];
    if (fileName && fileSize) filteredFiles.push([fileName, fileSize]);
  }

  let res = "**Oversized Assets**\n|File Name|File Size|\n|-----|:-----:|\n";
  for (const item of filteredFiles) {
    res += `|${item[0]}|${item[1]}|\n`;
  }
  return res;
}

export function getAllIgnoredFileString(ignoreArray: string[]) {
  return new Promise((resolve, reject) => {
    let res =
      "**All listed `.assets-ignored` Files**\n|File Name|File Size\n|-----|:-----:|\n";
    for (let index = 0; index < ignoreArray.length; index++) {
      const item = ignoreArray[index];

      fs.stat(item, (err, fileStats) => {
        if (err) {
          res += "|-|-|\n";
        } else {
          const result = convertBytes(fileStats.size);
          res += `|${item}|${result}|\n`;
        }

        if (index === ignoreArray.length - 1) {
          resolve(res);
        }
      });
    }
  });
}

export const GITHUB_COMMENT_BOT_PREFIX = "AssetsCheckBot";
export function convertBytes(bytes: number) {
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  if (bytes === 0) {
    return "n/a";
  }

  const i = Math.floor(Math.log(bytes) / Math.log(1024));

  if (i === 0) {
    return `${bytes} ${sizes[i]}`;
  }

  return `${(bytes / 1024 ** i).toFixed(1)} ${sizes[i]}`;
}

export function renderCommentBody(
  isSuccess: boolean,
  successBody: string,
  errorBody: string,
) {
  return `# ${
    isSuccess ? ":mountain:" : ":warning:"
  } ${GITHUB_COMMENT_BOT_PREFIX}
${isSuccess ? successBody : errorBody}`;
}

export async function removePreviousBotComments(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
) {
  const { data: comments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: issueNumber,
  });
  for (const comment of comments) {
    if (
      comment.user?.login === "github-actions[bot]" &&
      comment?.body?.includes(GITHUB_COMMENT_BOT_PREFIX)
    ) {
      try {
        // @NOTE: looks like there is a bug with octokit.rest.issues.deleteComment
        // :facepalm; so gotta use octokit.request instead.
        // await octokit.rest.issues.deleteComment({
        //   owner,
        //   repo,
        //   comment_id: comment.id,
        // });
        await octokit.request(
          `DELETE /repos/${owner}/${repo}/issues/comments/${comment.id}`,
          {
            owner,
            repo,
            comment_id: comment.id,
            headers: {
              "X-GitHub-Api-Version": "2022-11-28",
            },
          },
        );
      } catch (error) {
        console.error("@@@ Error while deleting comment !!!", error);
      }
    }
  }
}

export function getIgnoreArray() {
  return fs.readFileSync(".assets-ignore").toString().split("\n");
}

export function getAssetsIgnoreFiles(
  sourceArray: string[],
  ignoreArray: string[],
) {
  try {
    if (ignoreArray.length > 0) {
      return sourceArray.filter((v) => {
        const fileName = v.split(" ").slice(-1).pop();
        if (!fileName) return true;
        return ignoreArray.indexOf(fileName) === -1;
      });
    }
  } catch (e) {
    // File not found exception.
  }

  return sourceArray;
}

export const getErrorCommentBody = async (
  count: number,
  thresholdSize: string,
  invalidFiles: string[],
  ignoreArray: string[],
) => `:warning: **Oh Snap!**, You have \`${count}\` image asset(s) with a file-size of more than \`${thresholdSize}Kb\`. 
If it's not possible to optimize the below assets, you can add them into a \`.assets-ignore\` file in the root of your repository.

**NOTE:** If you are using Biome [image](https://immutable.atlassian.net/wiki/spaces/DS/pages/2547024003/Optimising+images+for+the+web#How-BIOME-makes-working-with-images-easier) components to display these assets, and you are not opting out of their default functionality, you can safely ignore this warning - as these images will be optimized on-the-fly by our AWS Image Resizer infrastructure. More details [here](https://immutable.atlassian.net/wiki/spaces/DS/pages/2547024003/Optimising+images+for+the+web#How-BIOME-makes-working-with-images-easier).

${getTableDataString(invalidFiles)}
${await getAllIgnoredFileString(ignoreArray)}`;

export const getSuccessCommentBody = ({
  thresholdSize,
}: { thresholdSize: string }) =>
  `:green_circle: **Awesome**, all of your image assets are less than \`${thresholdSize}Kb\`.`;
