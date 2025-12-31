/**
 * GCP utilities for StackSolo CLI
 */

export {
  isGcloudInstalled,
  checkGcloudAuth,
  listProjects,
  getCurrentProject,
  setActiveProject,
  createProject,
  linkBillingAccount,
  listBillingAccounts,
  type GcpProject,
  type GcpAuthInfo,
} from './projects';

export {
  REQUIRED_APIS,
  OPTIONAL_APIS,
  listEnabledApis,
  checkApis,
  enableApi,
  enableApis,
  type ApiStatus,
} from './apis';

export { checkOrgPolicy, fixOrgPolicy, type OrgPolicyStatus } from './org-policy';

export {
  checkAndFixCloudBuildPermissions,
  getDefaultComputeServiceAccount,
  checkIamBinding,
  grantIamRole,
  REQUIRED_IAM_BINDINGS,
} from './iam';
