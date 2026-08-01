import { useState, type MouseEvent } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/shared/ui/dialog";
import { cn } from "@/shared/utils/cn";

export function profileThumbnailUrl(src: string) {
  try {
    const url = new URL(src);
    if (url.hostname !== "res.cloudinary.com") return src;
    return src.replace("/image/upload/", "/image/upload/f_auto,q_auto,c_fill,g_auto,w_256,h_256/");
  } catch {
    return src;
  }
}

function profileDisplayUrl(src: string) {
  try {
    const url = new URL(src);
    if (url.hostname !== "res.cloudinary.com") return src;
    return src.replace("/image/upload/", "/image/upload/f_auto,q_auto,c_limit,w_1600,h_1600/");
  } catch {
    return src;
  }
}

export function ExpandableProfileImage({
  src,
  name,
  className,
  imageClassName,
}: {
  src: string;
  name: string;
  className?: string;
  imageClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const stopPropagation = (event: MouseEvent) => event.stopPropagation();

  return (
    <>
      <button
        type="button"
        className={cn(
          "block cursor-zoom-in overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          className,
        )}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        onDoubleClick={stopPropagation}
        aria-label={name}
        aria-haspopup="dialog"
      >
        <img
          src={profileThumbnailUrl(src)}
          alt=""
          className={cn("h-full w-full object-cover", imageClassName)}
        />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[min(92vw,56rem)] max-w-[56rem] border-0 bg-black/95 p-3 text-white shadow-2xl">
          <DialogTitle className="sr-only">{name}</DialogTitle>
          <img
            src={profileDisplayUrl(src)}
            alt={name}
            className="max-h-[82vh] w-full rounded-lg object-contain"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
