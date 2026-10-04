import { cx } from "@/shared/utils/styles";

type ChipListProps = {
  items: string[];
  /** Accessible name for the list, e.g. "Stack". */
  label?: string;
  className?: string;
};

/** Small rounded tags for skills and tech stacks. */
export function ChipList({ items, label, className }: ChipListProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <ul aria-label={label} className={cx("flex flex-wrap gap-2", className)}>
      {items.map((item, index) => (
        <li
          key={`${index}-${item}`}
          className="rounded-full bg-subtle px-3 py-1 text-xs font-medium text-ink [overflow-wrap:anywhere] print:border print:border-line"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}
