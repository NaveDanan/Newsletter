import { cloneElement, useState, type ReactElement, type ComponentProps } from 'react';
import { lazyComponent } from '@/lib/lazy-component';
import { readScope } from '@/lib/pocketbase/read-cache';

const NotificationPopover = lazyComponent(() => import('./NotificationPopover').then(module => ({ default: module.NotificationPopover })), {
  fallback: props => cloneElement(props.trigger, { onClick: () => props.onOpenChange(!props.open) }),
});
interface NotificationDropdownProps {
  trigger: ReactElement<ComponentProps<'button'>>;
  onNavigate?: (action: () => void) => void;
}

/** The popover and its private API load only after interaction with a notification trigger. */
export function NotificationDropdown({ trigger, onNavigate }: NotificationDropdownProps) {
  const [opened, setOpened] = useState(false);
  const [requested, setRequested] = useState(false);
  const enhanced = cloneElement(trigger, { 'aria-haspopup': 'dialog', 'aria-expanded': opened, onClick: undefined, onPointerEnter: event => { trigger.props.onPointerEnter?.(event); NotificationPopover.preload(); }, onFocus: event => { trigger.props.onFocus?.(event); NotificationPopover.preload(); } });
  if (requested) return <NotificationPopover key={readScope()} trigger={enhanced} open={opened} onOpenChange={setOpened} onNavigate={onNavigate} />;
  return cloneElement(enhanced, { onClick: () => { setOpened(true); setRequested(true); } });
}
