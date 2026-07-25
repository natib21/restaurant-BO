jest.mock('../socket', () => ({
  getIo: jest.fn(),
}));

const { publishOutboxEvent } = require('../src/infrastructure/outbox/outbox-publisher');
const { getIo } = require('../socket');

describe('publishOutboxEvent', () => {
  beforeEach(() => {
    getIo.mockReset();
  });

  test('emits to room target with room name and eventType/data', () => {
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

    expect(getIo).toHaveBeenCalledTimes(1);
    expect(to).toHaveBeenCalledWith('branch:abc:perm:ORDER_VIEW');
    expect(emit).toHaveBeenCalledWith('order:create', {
      orderId: '1',
      orderNumber: '#T1-1',
    });
  });

  test('broadcast target emits event globally via io.emit', () => {
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    getIo.mockReturnValue({ emit, to });

    publishOutboxEvent({
      eventType: 'new-order',
      payload: {
        target: 'broadcast',
        data: { orderId: '1' },
      },
    });

    expect(emit).toHaveBeenCalledWith('new-order', { orderId: '1' });
  });

  test('throws when socket.io is not initialized (getIo falsy)', () => {
    getIo.mockReturnValue(null);
    expect(() =>
      publishOutboxEvent({
        eventType: 'x',
        payload: { target: 'broadcast', data: {} },
      })
    ).toThrow(/Socket\.IO is not initialized/);
  });

  test('throws when room target lacks room field', () => {
    getIo.mockReturnValue({ emit: jest.fn(), to: jest.fn() });
    expect(() =>
      publishOutboxEvent({
        eventType: 'x',
        payload: { target: 'room', data: {} },
      })
    ).toThrow(/room target requires room/);
  });

  test('throws on unknown outbox target', () => {
    getIo.mockReturnValue({ emit: jest.fn(), to: jest.fn() });
    expect(() =>
      publishOutboxEvent({
        eventType: 'x',
        payload: { target: 'unicast', data: {} },
      })
    ).toThrow(/Unknown outbox target/);
  });
});
