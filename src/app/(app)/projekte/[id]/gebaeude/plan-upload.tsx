"use client";

import { Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { FormMessageKey } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { imageSize, type LoadedPdf, loadPdf, SNAPSHOT_MAX_SIDE } from "@/lib/building/pdf-render";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

import { createBuildingPlan } from "./actions";

const ACCEPT = "application/pdf,image/png,image/jpeg";
const MAX_BYTES = 50 * 1024 * 1024;

/** «Plan hochladen» for a Geschoss: PDF page (picked from thumbnails, rendered to a PNG snapshot) or an image. */
export function PlanUploadDialog({ projectId, floorKey, floorName, replace }: { projectId: string; floorKey: string; floorName: string; replace: boolean }) {
  const t = useTranslations("building.upload");
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant={replace ? "ghost" : "outline"} />}>
        <Upload />
        {replace ? t("replace") : t("button")}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">{open && <UploadForm projectId={projectId} floorKey={floorKey} floorName={floorName} onDone={() => setOpen(false)} />}</DialogContent>
    </Dialog>
  );
}

type Stage = "pick" | "rendering" | "uploading";

function UploadForm({ projectId, floorKey, floorName, onDone }: { projectId: string; floorKey: string; floorName: string; onDone: () => void }) {
  const t = useTranslations("building.upload");
  const tCommon = useTranslations("common");
  const tForms = useTranslations("forms");
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [thumbs, setThumbs] = useState<(string | null)[]>([]);
  const [page, setPage] = useState(1);
  const [name, setName] = useState(floorName);
  const [stage, setStage] = useState<Stage>("pick");
  const [error, setError] = useState<string | null>(null);
  const pdfRef = useRef<LoadedPdf | null>(null);

  useEffect(() => () => pdfRef.current?.destroy(), []);

  const pick = async (f: File | undefined) => {
    setError(null);
    pdfRef.current?.destroy();
    pdfRef.current = null;
    setPdf(null);
    setThumbs([]);
    setPage(1);
    if (!f) return setFile(null);
    if (!ACCEPT.split(",").includes(f.type)) return setError(t("fileType"));
    if (f.size > MAX_BYTES) return setError(t("fileSize"));
    setFile(f);
    if (f.type !== "application/pdf") return;
    try {
      const loaded = await loadPdf(f);
      pdfRef.current = loaded;
      setPdf(loaded);
      setThumbs(Array.from({ length: loaded.numPages }, () => null));
      // Thumbnails one after the other – heavy vector pages take a few seconds each.
      for (let p = 1; p <= loaded.numPages; p++) {
        if (pdfRef.current !== loaded) return;
        const url = await loaded.thumbnail(p, 220);
        setThumbs((prev) => prev.map((x, i) => (i === p - 1 ? url : x)));
      }
    } catch {
      setError(t("renderFailed"));
    }
  };

  const submit = async () => {
    if (!file) return;
    setError(null);
    const planId = crypto.randomUUID();
    const dir = `${projectId}/${planId}`;
    try {
      let snapshot: { blob: Blob; width: number; height: number; path: string };
      let filePath: string;
      if (pdf) {
        setStage("rendering");
        const rendered = await pdf.render(page, SNAPSHOT_MAX_SIDE);
        filePath = `${dir}/source.pdf`;
        snapshot = { ...rendered, path: `${dir}/page-${page}.png` };
      } else {
        const size = await imageSize(file);
        filePath = `${dir}/source.${file.type === "image/png" ? "png" : "jpg"}`;
        snapshot = { blob: file, ...size, path: filePath };
      }
      setStage("uploading");
      const storage = createClient().storage.from("plans");
      const { error: e1 } = await storage.upload(filePath, file, { contentType: file.type });
      if (e1) throw e1;
      if (snapshot.path !== filePath) {
        const { error: e2 } = await storage.upload(snapshot.path, snapshot.blob, { contentType: "image/png" });
        if (e2) throw e2;
      }
      const result = await createBuildingPlan(projectId, {
        id: planId,
        floor: floorKey,
        name,
        filePath,
        snapshotPath: snapshot.path,
        page: pdf ? page : 1,
        width: snapshot.width,
        height: snapshot.height,
      });
      if (result.error) {
        toast.error(tForms(result.error as FormMessageKey));
        setStage("pick");
        return;
      }
      toast.success(t("done"));
      router.refresh();
      onDone();
    } catch {
      setError(t("uploadFailed"));
      setStage("pick");
    }
  };

  const busy = stage !== "pick";
  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{t("title", { floor: floorName })}</DialogTitle>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="plan-file">{t("file")}</Label>
        <Input id="plan-file" type="file" accept={ACCEPT} disabled={busy} onChange={(e) => void pick(e.target.files?.[0])} />
        <p className="text-xs text-muted-foreground">{t("fileHint")}</p>
      </div>
      {pdf && (
        <div className="space-y-2">
          <Label>{t("page", { count: pdf.numPages })}</Label>
          <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
            {thumbs.map((url, i) => (
              <button
                key={i}
                type="button"
                disabled={busy}
                onClick={() => setPage(i + 1)}
                className={cn("flex flex-col items-center gap-1 rounded-lg border p-1.5 text-xs hover:bg-muted/50", page === i + 1 && "border-brand ring-2 ring-brand/30")}
              >
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt="" className="h-24 w-full rounded object-contain" />
                ) : (
                  <span className="flex h-24 w-full items-center justify-center text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                  </span>
                )}
                {t("pageN", { n: i + 1 })}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="plan-name">{t("name")}</Label>
        <Input id="plan-name" value={name} maxLength={200} disabled={busy} onChange={(e) => setName(e.target.value)} />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {busy && (
        <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {stage === "rendering" ? t("rendering") : t("uploading")}
        </p>
      )}
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" disabled={busy} />}>{tCommon("cancel")}</DialogClose>
        <Button type="button" disabled={!file || busy || (file.type === "application/pdf" && !pdf)} onClick={() => void submit()}>
          <Upload />
          {t("submit")}
        </Button>
      </DialogFooter>
    </div>
  );
}
