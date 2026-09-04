import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

export type TabItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  content?: ReactNode;
  disabled?: boolean;
};

export type TabsProps = {
  items: TabItem[];
  /** Uncontrolled initial selection. Falls back to `items[0].id`. */
  defaultActiveId?: string;
  /** Controlled selection. When set, internal state never overrides it. */
  activeId?: string;
  onChange?: (id: string) => void;
  className?: string;
};

// TailAdmin underline style — copied verbatim, do not edit these strings.
const NAV_CLASS =
  "flex space-x-2 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-600";
const TAB_BASE_CLASS =
  "inline-flex items-center gap-2 border-b-2 px-2.5 py-2 text-sm font-medium transition-colors duration-200";
const TAB_ACTIVE_CLASS =
  "text-brand-500 border-brand-500 dark:text-brand-400 dark:border-brand-400";
const TAB_INACTIVE_CLASS =
  "text-gray-500 border-transparent hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200";
const TAB_DISABLED_CLASS = "opacity-50 cursor-not-allowed";
const TAB_FOCUS_CLASS =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 rounded-t-sm";

export function Tabs({
  items,
  defaultActiveId,
  activeId,
  onChange,
  className,
}: TabsProps) {
  const isControlled = activeId !== undefined;

  const [internalActiveId, setInternalActiveId] = useState<string>(
    () => defaultActiveId ?? items[0]?.id ?? "",
  );

  const resolvedActiveId = isControlled ? activeId : internalActiveId;
  const currentId = items.some((it) => it.id === resolvedActiveId)
    ? resolvedActiveId
    : (items[0]?.id ?? "");

  const baseId = useId();
  const tabId = useCallback((id: string) => `${baseId}-tab-${id}`, [baseId]);
  const panelId = useCallback((id: string) => `${baseId}-panel-${id}`, [baseId]);

  const buttonRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());

  const hasAnyContent = useMemo(
    () => items.some((it) => it.content !== undefined),
    [items],
  );

  const selectTab = useCallback(
    (id: string) => {
      const item = items.find((it) => it.id === id);
      if (!item || item.disabled) return;
      if (!isControlled) setInternalActiveId(id);
      if (id !== currentId) onChange?.(id);
    },
    [items, isControlled, currentId, onChange],
  );

  const focusAndSelect = useCallback(
    (id: string) => {
      selectTab(id);
      buttonRefs.current.get(id)?.focus();
    },
    [selectTab],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const enabled = items.filter((it) => !it.disabled);
      if (enabled.length === 0) return;

      const pos = enabled.findIndex((it) => it.id === currentId);
      let nextId: string | undefined;

      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown":
          nextId = enabled[(pos + 1 + enabled.length) % enabled.length]?.id;
          break;
        case "ArrowLeft":
        case "ArrowUp":
          nextId = enabled[(pos - 1 + enabled.length) % enabled.length]?.id;
          break;
        case "Home":
          nextId = enabled[0]?.id;
          break;
        case "End":
          nextId = enabled[enabled.length - 1]?.id;
          break;
        default:
          return;
      }

      if (nextId !== undefined) {
        event.preventDefault();
        focusAndSelect(nextId);
      }
    },
    [items, currentId, focusAndSelect],
  );

  const activeItem = items.find((it) => it.id === currentId);

  return (
    <div className={className}>
      <nav role="tablist" className={NAV_CLASS} onKeyDown={handleKeyDown}>
        {items.map((item) => {
          const isActive = item.id === currentId;
          return (
            <button
              key={item.id}
              ref={(node) => {
                buttonRefs.current.set(item.id, node);
              }}
              type="button"
              role="tab"
              id={tabId(item.id)}
              aria-selected={isActive}
              aria-controls={panelId(item.id)}
              aria-disabled={item.disabled || undefined}
              disabled={item.disabled}
              tabIndex={isActive ? 0 : -1}
              onClick={() => selectTab(item.id)}
              className={cn(
                TAB_BASE_CLASS,
                isActive ? TAB_ACTIVE_CLASS : TAB_INACTIVE_CLASS,
                item.disabled && TAB_DISABLED_CLASS,
                TAB_FOCUS_CLASS,
              )}
            >
              {item.icon}
              {item.label}
            </button>
          );
        })}
      </nav>

      {hasAnyContent && activeItem ? (
        <div
          role="tabpanel"
          id={panelId(activeItem.id)}
          aria-labelledby={tabId(activeItem.id)}
          tabIndex={0}
          className="pt-4"
        >
          {activeItem.content}
        </div>
      ) : null}
    </div>
  );
}
