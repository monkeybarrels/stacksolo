/**
 * Centralized naming utilities for infrastructure resources.
 *
 * All resource naming should go through these functions to ensure
 * consistency across the resolver, plugins, and deploy service.
 */

export interface NamingContext {
  projectName: string;
  networkName?: string;
}

/**
 * Get the load balancer name.
 * Pattern: ${projectName}-lb
 */
export function getLoadBalancerName(ctx: NamingContext): string {
  return `${ctx.projectName}-lb`;
}

/**
 * Get a backend service name for a Cloud Run container or Cloud Function.
 * Pattern: ${lbName}-${projectName}-${backendName}-backend
 */
export function getBackendServiceName(ctx: NamingContext, backendName: string): string {
  const lbName = getLoadBalancerName(ctx);
  return `${lbName}-${ctx.projectName}-${backendName}-backend`;
}

/**
 * Get a serverless NEG name.
 * Pattern: ${serviceName}-neg
 */
export function getNegName(serviceName: string): string {
  return `${serviceName}-neg`;
}

/**
 * Get a Cloud Run service name.
 * Pattern: ${projectName}-${containerName}
 */
export function getCloudRunServiceName(ctx: NamingContext, containerName: string): string {
  return `${ctx.projectName}-${containerName}`;
}

/**
 * Get a Cloud Function name.
 * Pattern: ${projectName}-${functionName}
 */
export function getCloudFunctionName(ctx: NamingContext, functionName: string): string {
  return `${ctx.projectName}-${functionName}`;
}

/**
 * Get a VPC network name.
 * Pattern: ${projectName}-${networkName}
 */
export function getVpcNetworkName(ctx: NamingContext): string {
  return `${ctx.projectName}-${ctx.networkName || 'main'}`;
}

/**
 * Get a VPC connector name.
 * Pattern: ${projectName}-connector
 */
export function getVpcConnectorName(ctx: NamingContext): string {
  return `${ctx.projectName}-connector`;
}

/**
 * Get an artifact registry name.
 * Pattern: ${projectName}-registry
 */
export function getArtifactRegistryName(ctx: NamingContext): string {
  return `${ctx.projectName}-registry`;
}

/**
 * Get a storage bucket name for website/UI.
 * Pattern: ${gcpProjectId}-${projectName}-${uiName}
 */
export function getWebsiteBucketName(gcpProjectId: string, ctx: NamingContext, uiName: string): string {
  return `${gcpProjectId}-${ctx.projectName}-${uiName}`;
}

/**
 * Get a backend bucket name for static content.
 * Pattern: ${projectName}-${uiName}-backend
 */
export function getBackendBucketName(ctx: NamingContext, uiName: string): string {
  return `${ctx.projectName}-${uiName}-backend`;
}

/**
 * Get SSL certificate name.
 * Pattern: ${lbName}-ssl-cert
 */
export function getSslCertificateName(ctx: NamingContext): string {
  const lbName = getLoadBalancerName(ctx);
  return `${lbName}-ssl-cert`;
}

/**
 * Get static IP address name.
 * Pattern: ${lbName}-ip
 */
export function getStaticIpName(ctx: NamingContext): string {
  const lbName = getLoadBalancerName(ctx);
  return `${lbName}-ip`;
}

/**
 * Get HTTP proxy name.
 * Pattern: ${lbName}-http-proxy
 */
export function getHttpProxyName(ctx: NamingContext): string {
  const lbName = getLoadBalancerName(ctx);
  return `${lbName}-http-proxy`;
}

/**
 * Get HTTPS proxy name.
 * Pattern: ${lbName}-https-proxy
 */
export function getHttpsProxyName(ctx: NamingContext): string {
  const lbName = getLoadBalancerName(ctx);
  return `${lbName}-https-proxy`;
}

/**
 * Get URL map name.
 * Pattern: ${lbName}
 */
export function getUrlMapName(ctx: NamingContext): string {
  return getLoadBalancerName(ctx);
}

/**
 * Get HTTP forwarding rule name.
 * Pattern: ${lbName}-http-rule
 */
export function getHttpForwardingRuleName(ctx: NamingContext): string {
  const lbName = getLoadBalancerName(ctx);
  return `${lbName}-http-rule`;
}

/**
 * Get HTTPS forwarding rule name.
 * Pattern: ${lbName}-https-rule
 */
export function getHttpsForwardingRuleName(ctx: NamingContext): string {
  const lbName = getLoadBalancerName(ctx);
  return `${lbName}-https-rule`;
}
