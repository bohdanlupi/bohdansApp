import type { ComponentProps } from "react";

import { NativeSelect } from "@/components/form";
import type { CostItemOption } from "@/lib/cost-plan";

/** Native select of cost codes, indented by hierarchy level. */
export function CostItemSelect({
  options,
  emptyLabel,
  ...props
}: ComponentProps<typeof NativeSelect> & { options: CostItemOption[]; emptyLabel: string }) {
  return (
    <NativeSelect {...props}>
      <option value="">{emptyLabel}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {"\u00a0\u00a0".repeat(o.depth)}
          {o.label}
        </option>
      ))}
    </NativeSelect>
  );
}
