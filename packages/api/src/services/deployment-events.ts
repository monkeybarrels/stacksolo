import { EventEmitter } from 'events';

export interface DeploymentLogEvent {
  deploymentId: string;
  type: 'log' | 'status' | 'error' | 'complete' | 'auth_required';
  message: string;
  timestamp: Date;
  provider?: string; // For auth_required events
}

class DeploymentEventEmitter extends EventEmitter {
  emitLog(deploymentId: string, message: string) {
    this.emit(`deployment:${deploymentId}`, {
      deploymentId,
      type: 'log',
      message,
      timestamp: new Date(),
    } as DeploymentLogEvent);
  }

  emitStatus(deploymentId: string, status: string) {
    this.emit(`deployment:${deploymentId}`, {
      deploymentId,
      type: 'status',
      message: status,
      timestamp: new Date(),
    } as DeploymentLogEvent);
  }

  emitError(deploymentId: string, error: string) {
    this.emit(`deployment:${deploymentId}`, {
      deploymentId,
      type: 'error',
      message: error,
      timestamp: new Date(),
    } as DeploymentLogEvent);
  }

  emitComplete(deploymentId: string, success: boolean) {
    this.emit(`deployment:${deploymentId}`, {
      deploymentId,
      type: 'complete',
      message: success ? 'succeeded' : 'failed',
      timestamp: new Date(),
    } as DeploymentLogEvent);
  }

  emitAuthRequired(deploymentId: string, provider: string) {
    this.emit(`deployment:${deploymentId}`, {
      deploymentId,
      type: 'auth_required',
      message: `Authentication required for ${provider}`,
      provider,
      timestamp: new Date(),
    } as DeploymentLogEvent);
  }

  subscribe(deploymentId: string, callback: (event: DeploymentLogEvent) => void) {
    this.on(`deployment:${deploymentId}`, callback);
    return () => this.off(`deployment:${deploymentId}`, callback);
  }
}

export const deploymentEvents = new DeploymentEventEmitter();
