const core = require("@actions/core");
const github = require("@actions/github");
const exec = require("@actions/exec");
const { Octokit } = require("@octokit/rest");
const fs = require("node:fs");

const GITHUB_COMMENT_BOT_PREFIX = ":mountain: AssetsCheckerBot";
const convertBytes = (bytes) => {
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];

  if (bytes === 0) {
    return "n/a";
  }

  const i = Number.parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));

  if (i === 0) {
    return `${bytes} ${sizes[i]}`;
  }

  return `${(bytes / 1024 ** i).toFixed(1)} ${sizes[i]}`;
};

const main = async () => {
  try {
    const inputs = {
      token: core.getInput("token"),
      target_folder: core.getInput("target_folder"),
      thrashold_size: core.getInput("thrashold_size"),
    };

    const {
      payload: { pull_request: pullRequest, repository },
    } = github.context;

    if (!pullRequest) {
      core.error("This action only works on pull_request events");
      return;
    }

    const { number: issueNumber } = pullRequest;
    const { full_name: repoFullName } = repository;
    const [owner, repo] = repoFullName.split("/");

    const octokit = new Octokit({
      auth: inputs.token,
    });

    let ignoreArray = [];
    let myOutput = "";
    let myError = "";

    /**
     * Check if array assets file name contains inside .ignore-assets file or not.
     * If its contains then remove those images from sourceArray and return new array.
     *
     * @param {Array} sourceArray Array of all assets files.
     * @returns Array of files.
     */
    function getAssetsIgnoreFiles(sourceArray) {
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

    // @TODO: add webp + riv to this asset list
    await exec.exec(
      `find ${inputs.target_folder} -type f \( -name "*.jpeg" -o -name "*.png" -o -name "*.svg" -o -name "*.gif" -o -name "*.jpg" \) -size +${inputs.thrashold_size}k -exec ls -lh {} \;`,
      undefined,
      {
        listeners: {
          stdout: (data) => {
            myOutput += data.toString();
          },
          stderr: (data) => {
            myError += data.toString();
          },
        }
      }
    );

    const arrayOutput = getAssetsIgnoreFiles(myOutput.split("\n"));

    const count = arrayOutput.length - 1;

    const invalidFiles = [...arrayOutput];

    const successBody = `rocket: **Awesome**, your all assets are less than ${inputs.thrashold_size}Kb.`;
    const errorBody = `:warning: **Oh, Snap**, You have ${count} asset(s) with size more than \`${inputs.thrashold_size}Kb\`. If you unable to optimize these assets, you can use \`.assets-ignore\` file and add these assets in \`.assets-ignore\` file`;

    const getTableDataString = (invalidFiles) => {
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
    const getAllIgnoredFileString = (ignoreArray) => {
      return new Promise((resolve, reject) => {
        let res = "**All listed `.assets-ignored` Files**\n|File Name|File Size\n|-----|:-----:|\n";
        for (let index = 0; index < ignoreArray.length; index++) {
          const item = ignoreArray[index];

          fs.stat(item, (err, fileStats) => {
            if (err) {
              res += `|${item}|None|\n`;
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
          comment.user.login === "github-actions[bot]" &&
          comment.body.includes(GITHUB_COMMENT_BOT_PREFIX)
        ) {
          try {
            // @NOTE: looks like there is a bug with octokit.rest.issues.deleteComment 
            // :facepalm; so gotta use octokit.request instead.
            // await octokit.rest.issues.deleteComment({
            //   owner,
            //   repo,
            //   comment_id: comment.id,
            // });
            await octokit.request(`DELETE /repos/${owner}/${repo}/issues/comments/${comment.id}`, {
              owner,
              repo,
              comment_id: comment.id,
              headers: {
                'X-GitHub-Api-Version': '2022-11-28'
              }
            });
          } catch (error) {
            console.error("@@@ Error while deleting comment !!!", error);
          }
        }
      }
    };

    await removePreviousBotComments();

    const checkSuccess = count === 0;
    const commentBody = `## ${GITHUB_COMMENT_BOT_PREFIX}
${checkSuccess ? successBody : `${errorBody}

${getTableDataString(invalidFiles)}
${await getAllIgnoredFileString(ignoreArray)}`}`;

    octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body: commentBody,
    });

    if (!checkSuccess) core.setFailed("Invalid size assets exists !!!");
  } catch (error) {
    core.setFailed(error.message);
  }
};

main();
