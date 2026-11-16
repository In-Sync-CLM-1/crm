import { useEffect, useState } from "react";
import { FileWarning, Loader2, ExternalLink } from "lucide-react";
import { useSignedFileUrl } from "@/lib/storedFiles";

interface DocumentPreviewProps {
  fileUrl: string;
  className?: string;
}

type Status = "checking" | "ok" | "missing" | "error";

const IMAGE_RE = /\.(jpe?g|png|gif|webp|svg)(\?|$)/i;

export function DocumentPreview({ fileUrl: storedUrl, className = "w-full h-full rounded-md border" }: DocumentPreviewProps) {
  // Customer files open through a link that expires; "" while it is being made, null if refused.
  const fileUrl = useSignedFileUrl(storedUrl);
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    let cancelled = false;
    setStatus("checking");
    if (fileUrl === "") return;
    if (fileUrl === null) {
      setStatus("missing");
      return;
    }

    fetch(fileUrl, { method: "HEAD" })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setStatus("ok");
        else if (res.status === 404) setStatus("missing");
        else setStatus("error");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [fileUrl]);

  if (status === "checking") {
    return (
      <div className={`${className} flex items-center justify-center bg-muted text-muted-foreground`}>
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading preview...
      </div>
    );
  }

  if (status === "missing" || status === "error") {
    return (
      <div className={`${className} flex flex-col items-center justify-center gap-2 bg-muted text-muted-foreground p-6 text-center`}>
        <FileWarning className="h-10 w-10" />
        <p className="font-medium text-foreground">
          {status === "missing" ? "File not available" : "Could not load file"}
        </p>
        <p className="text-sm">
          {status === "missing"
            ? "The original file is missing from storage. It may have been deleted or moved."
            : "There was a problem reaching the file. Please try again."}
        </p>
        <a
          href={fileUrl ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-primary inline-flex items-center gap-1 hover:underline mt-2"
        >
          Open URL directly <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    );
  }

  if (IMAGE_RE.test(storedUrl)) {
    return (
      <img
        src={fileUrl ?? undefined}
        className={`${className} object-contain bg-muted`}
        alt="Document"
      />
    );
  }

  return <iframe src={fileUrl ?? undefined} className={className} title="Document Viewer" />;
}
