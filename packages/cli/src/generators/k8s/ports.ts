/**
 * Port assignment utilities
 * Manages predictable port allocation for K8s services
 */

import { DEFAULT_PORTS, type PortAssignment } from './types';

/**
 * Port allocator for local K8s services
 */
export class PortAllocator {
  private functionIndex = 0;
  private uiIndex = 0;
  private ports: PortAssignment;

  constructor(ports: PortAssignment = DEFAULT_PORTS) {
    this.ports = ports;
  }

  /**
   * Get the next available function port
   */
  nextFunctionPort(): number {
    const port = this.ports.functionBasePort + this.functionIndex;
    this.functionIndex++;
    return port;
  }

  /**
   * Get the next available UI port
   */
  nextUiPort(): number {
    const port = this.ports.uiBasePort + this.uiIndex;
    this.uiIndex++;
    return port;
  }

  /**
   * Get ingress port
   */
  get ingressPort(): number {
    return this.ports.ingress;
  }

  /**
   * Get Firestore emulator port
   */
  get firestorePort(): number {
    return this.ports.firestoreEmulator;
  }

  /**
   * Get Firebase Auth emulator port
   */
  get authPort(): number {
    return this.ports.authEmulator;
  }

  /**
   * Get Pub/Sub emulator port
   */
  get pubsubPort(): number {
    return this.ports.pubsubEmulator;
  }

  /**
   * Reset allocator state
   */
  reset(): void {
    this.functionIndex = 0;
    this.uiIndex = 0;
  }
}

/**
 * Create a port allocator with default ports
 */
export function createPortAllocator(ports?: Partial<PortAssignment>): PortAllocator {
  return new PortAllocator({ ...DEFAULT_PORTS, ...ports });
}
