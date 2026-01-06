import * as core from '@actions/core';
import {createApplication, GitHubApplication} from '../github-application.js';

type Permissions = {
  [key: string]: string;
}

/**
 * Parses and validates a permissions string.
 * 
 * @param permissionInput - Comma-separated permissions in "name:level" format (e.g., "contents:write, pull_requests:read")
 * @returns Parsed permissions object
 * @throws Error if permissions are invalid
 */
export function parsePermissions(permissionInput: string): Permissions {
  const permissions: Permissions = {};
  
  for (const p of permissionInput.split(",")) {
    const trimmed = p.trim();
    if (!trimmed) {
      continue; // Skip empty entries (e.g., trailing comma)
    }
    
    const parts = trimmed.split(":");
    if (parts.length !== 2) {
      throw new Error(
        `Invalid permission entry "${trimmed}". Expected format: "name:level" (e.g., "contents:write", "pull_requests:read").`
      );
    }
    
    const [pName, pLevel] = parts;
    const name = pName.trim();
    const level = pLevel.trim();
    
    if (!name) {
      throw new Error(
        `Invalid permission entry "${trimmed}". Permission name cannot be empty.`
      );
    }
    
    if (!level) {
      throw new Error(
        `Invalid permission entry "${trimmed}". Permission level cannot be empty.`
      );
    }
    
    // Check for dashes in permission names - common mistake from GitHub Actions workflow syntax
    // GitHub Actions workflow permissions use dashes (e.g., "pull-requests: write")
    // but GitHub App installation token permissions use underscores (e.g., "pull_requests")
    if (name.includes('-')) {
      const suggestion = name.replace(/-/g, '_');
      throw new Error(
        `Invalid permission key "${name}". GitHub App permissions use underscores, not dashes. ` +
        `Did you mean "${suggestion}"? ` +
        `(Note: GitHub Actions workflow permissions use dashes like "pull-requests", ` +
        `but GitHub App token permissions use underscores like "pull_requests".)`
      );
    }
    
    // Validate permission level
    const validLevels = ['read', 'write'];
    if (!validLevels.includes(level)) {
      throw new Error(
        `Invalid permission level "${level}" for "${name}". Must be one of: ${validLevels.join(', ')}.`
      );
    }
    
    permissions[name] = level;
  }
  
  return permissions;
}

async function run() {
  let app: GitHubApplication;

  try {
    const privateKey = getRequiredInputValue('application_private_key')
      , applicationId = getRequiredInputValue('application_id')
      , githubApiBaseUrl = core.getInput('github_api_base_url')
      , httpsProxy = core.getInput('https_proxy')
      , ignoreProxy = core.getBooleanInput('ignore_environment_proxy')
      ;
    app = await createApplication({
      privateKey,
      applicationId,
      baseApiUrl: githubApiBaseUrl,
      proxy: httpsProxy,
      ignoreEnvironmentProxy: ignoreProxy
    });
  } catch(err) {
    fail(err, 'Failed to initialize GitHub Application connection using provided id and private key');
    return;
  }

  if (app) {
    core.info(`Found GitHub Application: ${app.name}`);

    try {
      const userSpecifiedOrganization = core.getInput('organization');
      const repository = process.env['GITHUB_REPOSITORY'];

      if (!repository || repository.trim().length === 0) {
        throw new Error(`The repository value was missing from the environment as 'GITHUB_REPOSITORY'`);
      }

      const repoParts = repository.split('/');

      let installationId;

      if (userSpecifiedOrganization) {
        core.info(`Obtaining application installation for organization: ${userSpecifiedOrganization}`);

        // use the organization specified to get the installation
        const installation = await app.getOrganizationInstallation(userSpecifiedOrganization);
        if (installation && installation.id) {
          installationId = installation.id;
        } else {
          fail(undefined, `GitHub Application is not installed on the specified organization: ${userSpecifiedOrganization}`);
        }
      } else {
        core.info(`Obtaining application installation for repository: ${repository}`);

        // fallback to getting a repository installation
        const installation = await app.getRepositoryInstallation(repoParts[0], repoParts[1]);
        if (installation && installation.id) {
          installationId = installation.id;
        } else {
          fail(undefined, `GitHub Application is not installed on repository: ${repository}`);
        }
      }

      if (installationId) {
        // Build up the list of requested permissions with validation
        const permissionInput = core.getInput("permissions");
        const permissions = permissionInput ? parsePermissions(permissionInput) : {};
        
        if (Object.keys(permissions).length > 0) {
          core.info(`Requesting limitation on GitHub Application permissions to only: ${JSON.stringify(permissions)}`);
        }

        const accessToken = await app.getInstallationAccessToken(installationId, permissions);

        // Register the secret to mask it in the output
        core.setSecret(accessToken.token);
        core.setOutput('token', accessToken.token);
        core.info(JSON.stringify(accessToken));
        core.info(`Successfully generated an access token for application.`)

        if (core.getBooleanInput('revoke_token')) {
          // Store the token for post state invalidation of it once the job is complete
          core.saveState('token', accessToken.token);
        }
      } else {
        fail(undefined, 'No installation of the specified GitHub application was able to be retrieved.');
      }
    } catch (err) {
      fail(err);
    }
  }
}
run();

function fail(err: any, message?: string) {
  core.error(err);
  // Provide a debug controllable stack trace
  core.debug(err.stack);

  if (message) {
    core.setFailed(message);
  } else {
    core.setFailed(err.message);
  }
}

function getRequiredInputValue(key: string) {
  return core.getInput(key, {required: true});
}
