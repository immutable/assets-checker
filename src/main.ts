import { error, getInput, setFailed } from "@actions/core";
import { exec } from "@actions/exec";
import { context } from "@actions/github";
import { Octokit } from "@octokit/rest";
import {
  getAllIgnoredFileString,
  getAssetsIgnoreFiles,
  getIgnoreArray,
  getTableDataString,
  removePreviousBotComments,
  renderCommentBody,
} from "./utils";

async function main() {
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

    const ignoreArray = getIgnoreArray();
    let execOutput = "";
    let execError = "";

    await exec(
      `find ${inputs.target_folder} -type f \( -name "*.jpeg" -o -name "*.png" -o -name "*.svg" -o -name "*.gif" -o -name "*.jpg" -o -name "*.riv" -o -name "*.webp" \) -size +${inputs.thrashold_size}k -exec ls -lh {} \;`,
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
    const successBody = `:green_circle: **Awesome**, all of your image assets are less than \`${inputs.thrashold_size}Kb\`.`;
    const errorBody = `:warning: **Oh Snap!**, You have \`${count}\` image asset(s) with a file-size of more than \`${
      inputs.thrashold_size
    }Kb\`. 
If it's not possible to optimize the below assets, you can add them into a \`.assets-ignore\` file in the root of your repository.

**NOTE:** If you are using Biome [image](https://immutable.atlassian.net/wiki/spaces/DS/pages/2547024003/Optimising+images+for+the+web#How-BIOME-makes-working-with-images-easier) components to display these assets, and you are not opting out of their default functionality, you can safely ignore this warning - as these images will be optimized on-the-fly by our AWS Image Resizer infrastructure. More details [here](https://immutable.atlassian.net/wiki/spaces/DS/pages/2547024003/Optimising+images+for+the+web#How-BIOME-makes-working-with-images-easier).

${getTableDataString(invalidFiles)}
${await getAllIgnoredFileString(ignoreArray)}
`;

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
