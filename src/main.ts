import fs from "node:fs";
import { error, getInput, setFailed } from "@actions/core";
import { exec } from "@actions/exec";
import { context } from "@actions/github";
import { Octokit } from "@octokit/rest";

const GITHUB_COMMENT_BOT_PREFIX = "AssetsCheckBot";
const convertBytes = (bytes: number) => {
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];

  if (bytes === 0) {
    return "n/a";
  }

  const i = Math.floor(Math.log(bytes) / Math.log(1024));

  if (i === 0) {
    return `${bytes} ${sizes[i]}`;
  }

  return `${(bytes / 1024 ** i).toFixed(1)} ${sizes[i]}`;
};

const main = async () => {
  try {
    const inputs = {
      token: getInput("token"),
      target_folder: getInput("target_folder"),
      thrashold_size: getInput("thrashold_size"),
    };

    const {
      payload: { pull_request: pullRequest, repository },
    } = context;

    if (!pullRequest) {
      error("This action only works on pull_request events");
      return;
    }

    const { number: issueNumber } = pullRequest;
    const repoFullName = repository?.full_name || "";
    const [owner, repo] = repoFullName.split("/");

    const octokit = new Octokit({
      auth: inputs.token,
    });

    let ignoreArray: string[] = [];
    let myOutput = "";
    let myError = "";

    /**
     * Check if array assets file name contains inside .ignore-assets file or not.
     * If its contains then remove those images from sourceArray and return new array.
     *
     * @param {Array} sourceArray Array of all assets files.
     * @returns Array of files.
     */
    function getAssetsIgnoreFiles(sourceArray: string[]) {
      const file = ".assets-ignore";
      try {
        ignoreArray = fs.readFileSync(file).toString().split("\n");

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

    await exec(
      `find ${inputs.target_folder} -type f \( -name "*.jpeg" -o -name "*.png" -o -name "*.svg" -o -name "*.gif" -o -name "*.jpg" -o -name "*.riv" -o -name "*.webp" \) -size +${inputs.thrashold_size}k -exec ls -lh {} \;`,
      undefined,
      {
        listeners: {
          stdout: (data) => {
            myOutput += data.toString();
          },
          stderr: (data) => {
            myError += data.toString();
          },
        },
      },
    );

    const arrayOutput = getAssetsIgnoreFiles(myOutput.split("\n"));
    const count = arrayOutput.length - 1;
    const invalidFiles = [...arrayOutput];
    const successBody = `:green_circle: **Awesome**, all of your image assets are less than \`${inputs.thrashold_size}Kb\`.`;
    const errorBody = `:warning: **Oh Snap!**, You have \`${count}\` image asset(s) with a file-size of more than \`${inputs.thrashold_size}Kb\`. 
If it's not possible to optimize the below assets, you can add them into a \`.assets-ignore\` file in the root of your repository.

**\@NOTE:** If you are using Biome [image](https://immutable.atlassian.net/wiki/spaces/DS/pages/2547024003/Optimising+images+for+the+web#How-BIOME-makes-working-with-images-easier) components to display these assets, and you are not opting out of their default functionality, you can safely ignore this warning as the images will be optimized by our AWS Image Resizer infrastructure. More details [here](https://immutable.atlassian.net/wiki/spaces/DS/pages/2547024003/Optimising+images+for+the+web#How-BIOME-makes-working-with-images-easier).
`;

    const getTableDataString = (invalidFiles: string[]) => {
      const filteredFiles = [];

      for (const item of invalidFiles) {
        const fileName = item.split(" ").slice(-1).pop();
        const fileSize = item.split(" ")[4];
        if (fileName && fileSize) filteredFiles.push([fileName, fileSize]);
      }

      let res =
        "**Oversized Assets**\n|File Name|File Size|\n|-----|:-----:|\n";
      for (const item of filteredFiles) {
        res += `|${item[0]}|${item[1]}|\n`;
      }
      return res;
    };

    /**
     * Get all Ignored file data as github comment string format.
     *
     * @param {Array} ignoreArray array of files which is added in .assets-ignore file.
     * @returns Promise of github comment string.
     */
    const getAllIgnoredFileString = (ignoreArray: string[]) => {
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
    };

    /**
     * Delete previously posted github comments.
     */
    const removePreviousBotComments = async () => {
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
    };

    await removePreviousBotComments();

    const checkSuccess = count === 0;
    const commentBody = `# ${
      checkSuccess ? ":mountain:" : ":warning:"
    } ${GITHUB_COMMENT_BOT_PREFIX}
${
  checkSuccess
    ? successBody
    : `${errorBody}

${getTableDataString(invalidFiles)}
${await getAllIgnoredFileString(ignoreArray)}`
}`;

    octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body: commentBody,
    });

    if (!checkSuccess) setFailed("Invalid size assets exists !!!");
  } catch (error) {
    const errorMessage = (error as { message: string }).message;
    setFailed(errorMessage);
  }
};

main();
