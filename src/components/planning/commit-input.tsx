"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/**
 * Text input that reports its value on blur (not on every key). With `required`, an empty value is not reported
 * and the field goes back to the last value.
 */
export function CommitInput({
  value,
  onCommit,
  required,
  multiline,
  rows = 3,
  ...props
}: {
  value: string;
  onCommit: (value: string) => void;
  required?: boolean;
  multiline?: boolean;
  rows?: number;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  type?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const [text, setText] = useState(value);
  const [shown, setShown] = useState(value);
  // Follow outside changes without a remount.
  if (shown !== value) {
    setShown(value);
    setText(value);
  }
  const commit = () => {
    const next = props.type === "date" ? text : text.trim() === "" ? "" : text;
    if (required && next.trim() === "") {
      setText(value);
      return;
    }
    if (next !== value) onCommit(next);
  };
  return multiline ? (
    <Textarea {...props} rows={rows} value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} />
  ) : (
    <Input {...props} value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
  );
}
