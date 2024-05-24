import { error, getInput, setFailed } from "@actions/core";
import { exec } from "@actions/exec";
import { context } from "@actions/github";
import { Octokit } from "@octokit/rest";
import {
  getAssetsIgnoreFiles,
  getErrorCommentBody,
  getIgnoreArray,
  getSuccessCommentBody,
  removePreviousBotComments,
  renderCommentBody,
} from "./utils";

async function main() {
  try {
    const inputs = {
      token: getInput("token"),
      targetFolder: getInput("target_folder"),
      thresholdSize: getInput("threshold_size"),
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

    const ignoreArray = getIgnoreArray();
    let execOutput = "";
    let execError = "";

    await exec(
      `find ${inputs.targetFolder} -type f \( -name "*.jpeg" -o -name "*.png" -o -name "*.svg" -o -name "*.gif" -o -name "*.jpg" -o -name "*.riv" -o -name "*.webp" \) -size +${inputs.thresholdSize}k -exec ls -lh {} \;`,
      undefined,
      {
        listeners: {
          stdout: (data) => {
            execOutput += data.toString();
          },
          stderr: (data) => {
            execError += data.toString();
          },
        },
      },
    );

    const arrayOutput = getAssetsIgnoreFiles(
      execOutput.split("\n"),
      ignoreArray,
    );
    const count = arrayOutput.length - 1;
    const invalidFiles = [...arrayOutput];
    const successBody = getSuccessCommentBody({
      thresholdSize: inputs.thresholdSize,
    });
    const errorBody = await getErrorCommentBody(
      count,
      inputs.thresholdSize,
      invalidFiles,
      ignoreArray,
    );

    await removePreviousBotComments(octokit, owner, repo, issueNumber);

    const checkSuccess = count === 0;

    octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body: renderCommentBody(checkSuccess, successBody, errorBody),
    });

    if (!checkSuccess) setFailed("Invalid size assets exists !!!");
  } catch (error) {
    const errorMessage = (error as { message: string }).message;
    setFailed(errorMessage);
  }
}

main();
