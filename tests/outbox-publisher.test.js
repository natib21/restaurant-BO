const { publishOutboxEvent } = require('../src/infrastructure/outbox/outbox-publisher');

jest.mock('../socket', () => ({
  getIo: jest.fn(),
}));

const { getIo } = require('../socket');

describe('publishOutboxEvent', () => {
  it('emits to a room with the same event name and payload shape', () => {
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    getIo.mockReturnValue({ emit, to });

    publishOutboxEvent({
      eventType: 'order:create',
      payload: {
        target: 'room',
        room: 'branch:abc:perm:ORDER_VIEW',
        data: { orderId: '1', orderNumber: '#T1-1' },
      },
    });

    expect(to).toHaveBeenCalledWith('branch:abc:perm:ORDER_VIEW');
    expect(emit).toHaveBeenCalledWith('order:create', { orderId: '1', orderNumber: '#T1-1' });
  });

  it('broadcasts global events', () => {
    const emit = jest.fn();
    getIo.mockReturnValue({ emit, to: jest.fn(() => ({ emit })) });

    publishOutboxEvent({
      eventType: 'new-order',
      payload: {
        target: 'broadcast',
        data: { orderId: '1' },
      },
    });

    expect(emit).toHaveBeenCalledWith('new-order', { orderId: '1' });
  });
});
