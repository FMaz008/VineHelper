import { jest } from '@jest/globals';

describe('SoundCoordinator', () => {
	let SoundCoordinator;
	let mockSoundPlayer;
	let mockSettings;
	let coordinator;

	beforeEach(() => {
		// Reset modules
		jest.resetModules();
		
		// Mock BroadcastChannel
		global.BroadcastChannel = jest.fn().mockImplementation(() => ({
			postMessage: jest.fn(),
			addEventListener: jest.fn(),
			close: jest.fn()
		}));

		// Mock sound player
		mockSoundPlayer = {
			play: jest.fn()
		};

		// Mock settings
		mockSettings = {
			get: jest.fn().mockImplementation((key) => {
				if (key === 'notification.soundCooldownDelay') {
					return 2000; // 2 second cooldown
				}
				return null;
			})
		};

		// Import after mocks are set up
		const module = require('../../../scripts/notifications-monitor/coordination/SoundCoordinator.js');
		SoundCoordinator = module.SoundCoordinator;
		
		// Create instance
		coordinator = new SoundCoordinator(mockSoundPlayer, mockSettings);
	});

	afterEach(() => {
		// Clean up
		if (coordinator) {
			coordinator.destroy();
		}
		jest.clearAllMocks();
	});

	describe('tryPlaySound', () => {
		it('should play sound for new ASIN', () => {
			const result = coordinator.tryPlaySound('ASIN123', 1, true);
			
			expect(result).toBe(true);
			expect(mockSoundPlayer.play).toHaveBeenCalledWith(1);
		});

		it('should not play duplicate sound for same ASIN within cooldown', () => {
			// First play
			coordinator.tryPlaySound('ASIN123', 1, true);
			expect(mockSoundPlayer.play).toHaveBeenCalledTimes(1);

			// Second play (should be blocked)
			const result = coordinator.tryPlaySound('ASIN123', 1, true);
			
			expect(result).toBe(false);
			expect(mockSoundPlayer.play).toHaveBeenCalledTimes(1);
		});

		it('should play sound for same ASIN after cooldown expires', async () => {
			// First play
			coordinator.tryPlaySound('ASIN123', 1, true);
			expect(mockSoundPlayer.play).toHaveBeenCalledTimes(1);

			// Wait for cooldown to expire
			await new Promise(resolve => setTimeout(resolve, 2100));

			// Second play (should succeed)
			const result = coordinator.tryPlaySound('ASIN123', 1, true);
			
			expect(result).toBe(true);
			expect(mockSoundPlayer.play).toHaveBeenCalledTimes(2);
		});

		it('should broadcast sound-played message', () => {
			const mockChannel = global.BroadcastChannel.mock.results[0].value;
			
			coordinator.tryPlaySound('ASIN123', 1, true);
			
			expect(mockChannel.postMessage).toHaveBeenCalledWith({
				type: 'sound-played',
				asin: 'ASIN123',
				timestamp: expect.any(Number)
			});
		});

		it('should handle different ASINs independently', () => {
			// Play sound for ASIN1
			coordinator.tryPlaySound('ASIN1', 1, true);
			
			// Play sound for ASIN2 (should succeed)
			const result = coordinator.tryPlaySound('ASIN2', 1, true);
			
			expect(result).toBe(true);
			expect(mockSoundPlayer.play).toHaveBeenCalledTimes(2);
		});

		it('should add delay for non-visible items', (done) => {
			const startTime = Date.now();
			
			coordinator.tryPlaySound('ASIN123', 1, false);
			
			// Sound should not be played immediately
			expect(mockSoundPlayer.play).not.toHaveBeenCalled();
			
			// Check after delay
			setTimeout(() => {
				expect(mockSoundPlayer.play).toHaveBeenCalledWith(1);
				const elapsed = Date.now() - startTime;
				expect(elapsed).toBeGreaterThanOrEqual(50);
				done();
			}, 100);
		});
	});

	describe('tryPlayBulkSound', () => {
		it('should play bulk sound for master monitor', async () => {
			const itemTypes = new Set([1, 2]);
			const result = await coordinator.tryPlayBulkSound(itemTypes, 'bulk-fetch', true);
			
			expect(result).toBe(true);
			expect(mockSoundPlayer.play).toHaveBeenCalledWith(2); // Highest priority
		});

		it('should delay and check for slave monitor', async () => {
			const startTime = Date.now();
			const itemTypes = new Set([0, 1]);
			const result = await coordinator.tryPlayBulkSound(itemTypes, 'bulk-fetch', false);
			const elapsed = Date.now() - startTime;
			
			expect(elapsed).toBeGreaterThanOrEqual(495); // Allow small timing variance (500ms delay)
			expect(result).toBe(true);
			expect(mockSoundPlayer.play).toHaveBeenCalledWith(1);
		});

		it('should not play duplicate bulk sounds with same context', async () => {
			const itemTypes1 = new Set([1]); // ZEROETV
			const itemTypes2 = new Set([2]); // HIGHLIGHT
			
			// Master plays first with ZEROETV
			await coordinator.tryPlayBulkSound(itemTypes1, 'bulk-fetch', true);
			expect(mockSoundPlayer.play).toHaveBeenCalledTimes(1);
			expect(mockSoundPlayer.play).toHaveBeenCalledWith(1); // ZEROETV

			// Simulate the broadcast message being received
			const mockChannel = global.BroadcastChannel.mock.results[0].value;
			const messageHandler = mockChannel.addEventListener.mock.calls[0][1];
			
			// The key is now just the context "bulk-fetch"
			messageHandler({
				data: {
					type: 'sound-played',
					asin: 'bulk-fetch',
					timestamp: Date.now()
				}
			});

			// Now slave tries to play with different types but same context (should be blocked)
			const result = await coordinator.tryPlayBulkSound(itemTypes2, 'bulk-fetch', false);
			
			expect(result).toBe(false);
			expect(mockSoundPlayer.play).toHaveBeenCalledTimes(1);
		});

		it('should allow bulk sounds with different contexts', async () => {
			const itemTypes = new Set([1, 2]);
			
			// Play with first context
			await coordinator.tryPlayBulkSound(itemTypes, 'bulk-fetch', true);
			expect(mockSoundPlayer.play).toHaveBeenCalledTimes(1);
			
			// Play with different context (should succeed)
			const result = await coordinator.tryPlayBulkSound(itemTypes, 'bulk-update', true);
			
			expect(result).toBe(true);
			expect(mockSoundPlayer.play).toHaveBeenCalledTimes(2);
		});
	});

	describe('cross-monitor coordination', () => {
		it('should update cache when receiving sound-played message', () => {
			const mockChannel = global.BroadcastChannel.mock.results[0].value;
			const messageHandler = mockChannel.addEventListener.mock.calls[0][1];
			
			// Simulate receiving a message from another monitor
			messageHandler({
				data: {
					type: 'sound-played',
					asin: 'ASIN999',
					timestamp: Date.now()
				}
			});
			
			// Try to play same ASIN (should be blocked)
			const result = coordinator.tryPlaySound('ASIN999', 1, true);
			
			expect(result).toBe(false);
			expect(mockSoundPlayer.play).not.toHaveBeenCalled();
		});
	});

	describe('cleanup', () => {
		it('should clean up old entries periodically', async () => {
			// Play a sound
			coordinator.tryPlaySound('OLD_ASIN', 1, true);
			
			// Wait for cleanup interval (5 seconds)
			await new Promise(resolve => setTimeout(resolve, 5100));
			
			// Old entry should be cleaned up, allowing replay
			const result = coordinator.tryPlaySound('OLD_ASIN', 1, true);
			
			expect(result).toBe(true);
			expect(mockSoundPlayer.play).toHaveBeenCalledTimes(2);
		}, 10000);
	});

	describe('error handling', () => {
		it('should handle BroadcastChannel errors gracefully', () => {
			// Make BroadcastChannel throw an error
			global.BroadcastChannel = jest.fn().mockImplementation(() => {
				throw new Error('BroadcastChannel not supported');
			});
			
			// Create new coordinator
			const errorCoordinator = new SoundCoordinator(mockSoundPlayer, mockSettings);
			
			// Should still work without broadcast
			const result = errorCoordinator.tryPlaySound('ASIN123', 1, true);
			
			expect(result).toBe(true);
			expect(mockSoundPlayer.play).toHaveBeenCalledWith(1);
			
			errorCoordinator.destroy();
		});

		it('should handle missing settings gracefully', () => {
			const noSettingsCoordinator = new SoundCoordinator(mockSoundPlayer, null);
			
			// Should use default cache duration
			const result = noSettingsCoordinator.tryPlaySound('ASIN123', 1, true);
			
			expect(result).toBe(true);
			expect(mockSoundPlayer.play).toHaveBeenCalledWith(1);
			
			noSettingsCoordinator.destroy();
		});
	});

	describe('bulk fetch synchronization', () => {
		it('should handle bulk fetch state synchronization', () => {
			// Initially not in bulk fetch
			expect(coordinator.isBulkFetchActive()).toBe(false);

			// Start bulk fetch
			coordinator.notifyBulkFetchStart();
			expect(coordinator.isBulkFetchActive()).toBe(true);

			// Individual sounds should be suppressed during bulk fetch
			const result = coordinator.tryPlaySound('B001', 1, true);
			expect(result).toBe(false);
			expect(mockSoundPlayer.play).not.toHaveBeenCalled();

			// End bulk fetch
			coordinator.notifyBulkFetchEnd();
			expect(coordinator.isBulkFetchActive()).toBe(false);

			// Now individual sounds should work
			const result2 = coordinator.tryPlaySound('B001', 1, true);
			expect(result2).toBe(true);
			expect(mockSoundPlayer.play).toHaveBeenCalledTimes(1);
		});

		it('should respect cooldown after bulk sound', async () => {
			const itemTypes = new Set([1]); // ZEROETV

			// Play bulk sound
			const result1 = await coordinator.tryPlayBulkSound(itemTypes, 'bulk-fetch', true);
			expect(result1).toBe(true);

			// Try to play individual sound immediately after
			const result2 = coordinator.tryPlaySound('B001', 1, true);
			expect(result2).toBe(true); // Individual sounds use different cache keys

			// But another bulk sound for same context should be blocked
			const result3 = await coordinator.tryPlayBulkSound(itemTypes, 'bulk-fetch', true);
			expect(result3).toBe(false);

			// Sound should play twice - one bulk, one individual
			expect(mockSoundPlayer.play).toHaveBeenCalledTimes(2);
		});

		it('should handle bulk fetch messages via broadcast channel', () => {
			const mockChannel = global.BroadcastChannel.mock.results[0].value;
			let messageHandler;

			// Get the message handler
			expect(mockChannel.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
			messageHandler = mockChannel.addEventListener.mock.calls[0][1];

			// Simulate bulk fetch start from another monitor
			messageHandler({
				data: {
					type: 'bulk-fetch-start',
					timestamp: Date.now()
				}
			});

			expect(coordinator.isBulkFetchActive()).toBe(true);

			// Simulate bulk fetch end from another monitor
			messageHandler({
				data: {
					type: 'bulk-fetch-end',
					timestamp: Date.now()
				}
			});

			expect(coordinator.isBulkFetchActive()).toBe(false);
		});

		it('should suppress sounds in slave monitor during master bulk fetch', (done) => {
			const mockChannel = global.BroadcastChannel.mock.results[0].value;
			const messageHandler = mockChannel.addEventListener.mock.calls[0][1];

			// Simulate master starting bulk fetch
			messageHandler({
				data: {
					type: 'bulk-fetch-start',
					timestamp: Date.now()
				}
			});

			// Slave monitor should suppress individual sounds
			const result1 = coordinator.tryPlaySound('B001', 2, false); // highlight, not visible (slave)
			expect(result1).toBe(false);
			expect(mockSoundPlayer.play).not.toHaveBeenCalled();

			// Try multiple items (simulating large bulk fetch)
			const result2 = coordinator.tryPlaySound('B002', 2, false);
			const result3 = coordinator.tryPlaySound('B003', 2, false);
			const result4 = coordinator.tryPlaySound('B004', 2, false);
			
			expect(result2).toBe(false);
			expect(result3).toBe(false);
			expect(result4).toBe(false);
			expect(mockSoundPlayer.play).not.toHaveBeenCalled();

			// Simulate master ending bulk fetch
			messageHandler({
				data: {
					type: 'bulk-fetch-end',
					timestamp: Date.now()
				}
			});

			// Now slave should be able to play sounds again
			const result5 = coordinator.tryPlaySound('B005', 2, false);
			expect(result5).toBe(true);
			
			// Wait for the delay (50ms for non-visible items)
			setTimeout(() => {
				expect(mockSoundPlayer.play).toHaveBeenCalledTimes(1);
				done();
			}, 60);
		});
	});
});