import { sizeWarning, type Order, type OrderView } from '@cakeshop/shared';
import { currentCheck, todayOf, type Clock } from '../orders/applyChange';

/** The order as the customer may see it: no token, no event log, only the notices. */
export function toView(order: Order, clock: Clock): OrderView {
  const { token: _token, events, ...rest } = order;
  void _token;
  return {
    ...rest,
    notices: events.filter((e) => e.type === 'notice'),
    check: currentCheck(order, clock),
    warning: order.design ? sizeWarning(order.design, order.brief) : null,
    today: todayOf(clock),
  };
}
