import { useState } from "react";
import { Expand, ImageIcon } from "lucide-react";
import type { ToolArtifact } from "../types";
import { Dialog } from "../components/Dialog";
export function ArtifactPreview({ artifact }: { artifact: ToolArtifact }) {
  const [zoom, setZoom] = useState(false);
  return (
    <>
      <figure className="mc-artifact">
        <div>
          <span>
            <ImageIcon size={13} />
            {artifact.tool}
          </span>
          <button
            className="mc-copy"
            aria-label="Zoom browser snapshot"
            onClick={() => setZoom(true)}
          >
            <Expand size={13} />
            Zoom
          </button>
        </div>
        <button
          className="mc-artifact-frame"
          aria-label="Open browser capture"
          onClick={() => setZoom(true)}
        >
          <img
            src={artifact.data}
            alt={`Browser capture from ${artifact.tool}`}
            loading="lazy"
          />
        </button>
        <figcaption>
          {new Date(artifact.createdAt).toLocaleTimeString()} · {artifact.type}
        </figcaption>
      </figure>
      {zoom && (
        <Dialog
          title="Browser capture"
          description={`${artifact.tool} · ${new Date(artifact.createdAt).toLocaleString()}`}
          wide
          onClose={() => setZoom(false)}
        >
          <div className="mc-artifact-zoom">
            <img
              src={artifact.data}
              alt={`Full browser capture from ${artifact.tool}`}
            />
          </div>
        </Dialog>
      )}
    </>
  );
}
