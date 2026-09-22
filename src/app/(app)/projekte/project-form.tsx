"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { FormMessage, NativeSelect, SubmitButton } from "@/components/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { projectStatuses } from "@/lib/address-options";
import { initialFormState } from "@/lib/form-state";
import type { CostPlanTemplate, Project } from "@/lib/supabase/types";

import { createProject, updateProject } from "./actions";

/** Create form when `project` is undefined (with a suggested number), otherwise edit form. */
export function ProjectForm({
  project,
  suggestedNumber,
  templates,
  editable,
}: {
  project?: Project;
  suggestedNumber?: string;
  templates: CostPlanTemplate[];
  editable: boolean;
}) {
  const t = useTranslations();
  const tf = useTranslations("projects.form");
  const [state, action] = useActionState(project ? updateProject : createProject, initialFormState);

  const text = (name: "number" | "name" | "street" | "zip" | "city", className = "") => (
    <div className={`space-y-2 ${className}`}>
      <Label htmlFor={name}>{tf(`fields.${name}`)}</Label>
      <Input
        id={name}
        name={name}
        defaultValue={project?.[name] ?? (name === "number" ? suggestedNumber : "") ?? ""}
        required={name === "number" || name === "name"}
        autoFocus={!project && name === "name"}
      />
    </div>
  );

  return (
    <form action={action} className="space-y-6">
      {project && <input type="hidden" name="id" value={project.id} />}
      {!editable && <p className="text-sm text-muted-foreground">{tf("readOnly")}</p>}
      <FormMessage state={state} />

      <fieldset disabled={!editable} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{tf("sections.general")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-4">
            {text("number", "sm:col-span-1")}
            {text("name", "sm:col-span-3")}
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="status">{tf("fields.status")}</Label>
              <NativeSelect id="status" name="status" defaultValue={project?.status ?? "active"}>
                {projectStatuses.map((s) => (
                  <option key={s} value={s}>
                    {t(`options.projectStatus.${s}`)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="language">{tf("fields.language")}</Label>
              <NativeSelect id="language" name="language" defaultValue={project?.language ?? "de"}>
                {(["de", "fr", "it"] as const).map((l) => (
                  <option key={l} value={l}>
                    {t(`languages.${l}`)}
                  </option>
                ))}
              </NativeSelect>
              <p className="text-xs text-muted-foreground">{tf("languageHint")}</p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="cost_plan_template_id">{tf("fields.cost_plan_template_id")}</Label>
              <NativeSelect
                id="cost_plan_template_id"
                name="cost_plan_template_id"
                defaultValue={project?.cost_plan_template_id ?? templates.find((tpl) => tpl.key === "bkp")?.id ?? ""}
              >
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-2 sm:col-span-4">
              <Label htmlFor="description">{tf("fields.description")}</Label>
              <Textarea id="description" name="description" defaultValue={project?.description ?? ""} rows={3} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{tf("sections.location")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-4">
            {text("street", "sm:col-span-4")}
            {text("zip", "sm:col-span-1")}
            {text("city", "sm:col-span-3")}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{tf("sections.dates")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {(["start_date", "end_date"] as const).map((name) => (
              <div key={name} className="space-y-2">
                <Label htmlFor={name}>{tf(`fields.${name}`)}</Label>
                <Input id={name} name={name} type="date" defaultValue={project?.[name] ?? ""} />
              </div>
            ))}
          </CardContent>
        </Card>
      </fieldset>

      {editable && <SubmitButton>{project ? t("common.save") : tf("create")}</SubmitButton>}
    </form>
  );
}
