import { CircuitBreaker, CircuitBreakerState, CircuitBreakerError, CircuitBreakerRegistry } from '../../src/utils/circuitBreaker';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker('test-service', {
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 1000,
      resetTimeout: 2000,
      monitoringWindow: 5000,
    });
  });

  describe('State Management', () => {
    it('should start in CLOSED state', () => {
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitBreakerState.CLOSED);
    });

    it('should transition to OPEN after failure threshold is reached', async () => {
      const failingFunction = jest.fn().mockRejectedValue(new Error('Service unavailable'));

      // Execute failing function multiple times
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingFunction);
        } catch (error) {
          // Expected to fail
        }
      }

      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitBreakerState.OPEN);
      expect(stats.failureCount).toBe(3);
    });

    it('should reject requests immediately when OPEN', async () => {
      const failingFunction = jest.fn().mockRejectedValue(new Error('Service unavailable'));

      // Reach failure threshold
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingFunction);
        } catch (error) {
          // Expected to fail
        }
      }

      // Next request should be rejected immediately
      await expect(circuitBreaker.execute(jest.fn())).rejects.toThrow(CircuitBreakerError);
      expect(circuitBreaker.getStats().state).toBe(CircuitBreakerState.OPEN);
    });

    it('should transition to HALF_OPEN after timeout', async () => {
      const failingFunction = jest.fn().mockRejectedValue(new Error('Service unavailable'));

      // Reach failure threshold
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingFunction);
        } catch (error) {
          // Expected to fail
        }
      }

      expect(circuitBreaker.getStats().state).toBe(CircuitBreakerState.OPEN);

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Next request should transition to HALF_OPEN
      const succeedingFunction = jest.fn().mockResolvedValue('success');
      const result = await circuitBreaker.execute(succeedingFunction);

      expect(result).toBe('success');
      expect(circuitBreaker.getStats().state).toBe(CircuitBreakerState.HALF_OPEN);
    });

    it('should transition to CLOSED after success threshold in HALF_OPEN', async () => {
      const failingFunction = jest.fn().mockRejectedValue(new Error('Service unavailable'));
      const succeedingFunction = jest.fn().mockResolvedValue('success');

      // Reach failure threshold
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingFunction);
        } catch (error) {
          // Expected to fail
        }
      }

      // Wait for timeout to transition to HALF_OPEN
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Execute successful requests to reach success threshold
      await circuitBreaker.execute(succeedingFunction);
      expect(circuitBreaker.getStats().state).toBe(CircuitBreakerState.HALF_OPEN);

      await circuitBreaker.execute(succeedingFunction);
      expect(circuitBreaker.getStats().state).toBe(CircuitBreakerState.CLOSED);
    });
  });

  describe('Metrics', () => {
    it('should track request counts correctly', async () => {
      const succeedingFunction = jest.fn().mockResolvedValue('success');
      const failingFunction = jest.fn().mockRejectedValue(new Error('Service unavailable'));

      // Execute successful requests
      await circuitBreaker.execute(succeedingFunction);
      await circuitBreaker.execute(succeedingFunction);

      // Execute failing requests
      try {
        await circuitBreaker.execute(failingFunction);
      } catch (error) {
        // Expected to fail
      }

      const stats = circuitBreaker.getStats();
      expect(stats.totalRequests).toBe(3);
      expect(stats.totalSuccesses).toBe(2);
      expect(stats.totalFailures).toBe(1);
    });

    it('should calculate success and failure rates correctly', async () => {
      const succeedingFunction = jest.fn().mockResolvedValue('success');
      const failingFunction = jest.fn().mockRejectedValue(new Error('Service unavailable'));

      // Execute 7 successful and 3 failing requests
      for (let i = 0; i < 7; i++) {
        await circuitBreaker.execute(succeedingFunction);
      }

      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingFunction);
        } catch (error) {
          // Expected to fail
        }
      }

      expect(circuitBreaker.getSuccessRate()).toBe(70);
      expect(circuitBreaker.getFailureRate()).toBe(30);
    });

    it('should report healthy status when failure rate is low', async () => {
      const succeedingFunction = jest.fn().mockResolvedValue('success');
      
      // Execute successful requests
      for (let i = 0; i < 10; i++) {
        await circuitBreaker.execute(succeedingFunction);
      }

      expect(circuitBreaker.isHealthy()).toBe(true);
    });

    it('should report unhealthy status when circuit is open', async () => {
      const failingFunction = jest.fn().mockRejectedValue(new Error('Service unavailable'));

      // Reach failure threshold
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingFunction);
        } catch (error) {
          // Expected to fail
        }
      }

      expect(circuitBreaker.isHealthy()).toBe(false);
    });
  });

  describe('Force Operations', () => {
    it('should force reset to CLOSED state', async () => {
      const failingFunction = jest.fn().mockRejectedValue(new Error('Service unavailable'));

      // Reach failure threshold
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingFunction);
        } catch (error) {
          // Expected to fail
        }
      }

      expect(circuitBreaker.getStats().state).toBe(CircuitBreakerState.OPEN);

      circuitBreaker.forceReset();
      expect(circuitBreaker.getStats().state).toBe(CircuitBreakerState.CLOSED);
      expect(circuitBreaker.getStats().failureCount).toBe(0);
    });

    it('should force open the circuit', () => {
      expect(circuitBreaker.getStats().state).toBe(CircuitBreakerState.CLOSED);

      circuitBreaker.forceOpen();
      expect(circuitBreaker.getStats().state).toBe(CircuitBreakerState.OPEN);
    });
  });

  describe('Sliding Window', () => {
    it('should only count failures within monitoring window', async () => {
      const circuitBreakerWithShortWindow = new CircuitBreaker('test-service-short', {
        failureThreshold: 5,
        monitoringWindow: 100, // Very short window
      });

      const failingFunction = jest.fn().mockRejectedValue(new Error('Service unavailable'));

      // Execute 2 failing requests
      for (let i = 0; i < 2; i++) {
        try {
          await circuitBreakerWithShortWindow.execute(failingFunction);
        } catch (error) {
          // Expected to fail
        }
      }

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Execute 2 more failing requests (should not trigger circuit open)
      for (let i = 0; i < 2; i++) {
        try {
          await circuitBreakerWithShortWindow.execute(failingFunction);
        } catch (error) {
          // Expected to fail
        }
      }

      // Should still be closed because old failures are outside the window
      expect(circuitBreakerWithShortWindow.getStats().state).toBe(CircuitBreakerState.CLOSED);
    });
  });
});

describe('CircuitBreakerRegistry', () => {
  let registry: CircuitBreakerRegistry;

  beforeEach(() => {
    registry = CircuitBreakerRegistry.getInstance();
    registry.clear(); // Clear any existing circuit breakers
  });

  afterEach(() => {
    registry.clear();
  });

  describe('Service Management', () => {
    it('should create and retrieve circuit breakers', () => {
      const cb1 = registry.getCircuitBreaker('service1');
      const cb2 = registry.getCircuitBreaker('service2');

      expect(cb1).toBeDefined();
      expect(cb2).toBeDefined();
      expect(cb1).not.toBe(cb2);

      // Should return the same instance when called again
      const cb1Again = registry.getCircuitBreaker('service1');
      expect(cb1Again).toBe(cb1);
    });

    it('should get all circuit breakers', () => {
      registry.getCircuitBreaker('service1');
      registry.getCircuitBreaker('service2');
      registry.getCircuitBreaker('service3');

      const allCircuitBreakers = registry.getAllCircuitBreakers();
      expect(allCircuitBreakers.size).toBe(3);
      expect(allCircuitBreakers.has('service1')).toBe(true);
      expect(allCircuitBreakers.has('service2')).toBe(true);
      expect(allCircuitBreakers.has('service3')).toBe(true);
    });

    it('should get health status for all services', async () => {
      const cb1 = registry.getCircuitBreaker('service1');
      const cb2 = registry.getCircuitBreaker('service2');

      // Make service2 unhealthy
      const failingFunction = jest.fn().mockRejectedValue(new Error('Service unavailable'));
      for (let i = 0; i < 5; i++) {
        try {
          await cb2.execute(failingFunction);
        } catch (error) {
          // Expected to fail
        }
      }

      const healthStatus = registry.getHealthStatus();
      
      expect(healthStatus.service1.healthy).toBe(true);
      expect(healthStatus.service2.healthy).toBe(false);
      expect(healthStatus.service1.state).toBe(CircuitBreakerState.CLOSED);
      expect(healthStatus.service2.state).toBe(CircuitBreakerState.OPEN);
    });

    it('should reset all circuit breakers', async () => {
      const cb1 = registry.getCircuitBreaker('service1');
      const cb2 = registry.getCircuitBreaker('service2');

      // Make both services unhealthy
      const failingFunction = jest.fn().mockRejectedValue(new Error('Service unavailable'));
      
      for (let i = 0; i < 5; i++) {
        try {
          await cb1.execute(failingFunction);
          await cb2.execute(failingFunction);
        } catch (error) {
          // Expected to fail
        }
      }

      expect(cb1.getStats().state).toBe(CircuitBreakerState.OPEN);
      expect(cb2.getStats().state).toBe(CircuitBreakerState.OPEN);

      registry.resetAll();

      expect(cb1.getStats().state).toBe(CircuitBreakerState.CLOSED);
      expect(cb2.getStats().state).toBe(CircuitBreakerState.CLOSED);
    });

    it('should remove specific circuit breaker', () => {
      registry.getCircuitBreaker('service1');
      registry.getCircuitBreaker('service2');

      expect(registry.getAllCircuitBreakers().size).toBe(2);

      const removed = registry.remove('service1');
      expect(removed).toBe(true);
      expect(registry.getAllCircuitBreakers().size).toBe(1);
      expect(registry.getAllCircuitBreakers().has('service1')).toBe(false);

      const removedAgain = registry.remove('service1');
      expect(removedAgain).toBe(false);
    });

    it('should clear all circuit breakers', () => {
      registry.getCircuitBreaker('service1');
      registry.getCircuitBreaker('service2');
      registry.getCircuitBreaker('service3');

      expect(registry.getAllCircuitBreakers().size).toBe(3);

      registry.clear();
      expect(registry.getAllCircuitBreakers().size).toBe(0);
    });
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const registry1 = CircuitBreakerRegistry.getInstance();
      const registry2 = CircuitBreakerRegistry.getInstance();

      expect(registry1).toBe(registry2);
    });
  });
});