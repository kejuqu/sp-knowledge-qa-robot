"use client";

import { CircleAlert } from "lucide-react";
import { Toaster as Sonner, toast } from "sonner";
import { useUIStrings } from "./ui-strings";

export function Toaster() {
  const labels = useUIStrings();
  return (
    <Sonner
      position="top-right"
      icons={{ error: <CircleAlert className="size-5 text-destructive" /> }}
      offset={24}
      closeButton
      duration={6000}
      toastOptions={{
        closeButtonAriaLabel: labels.close,
        unstyled: true,
        classNames: {
          toast: "kqa-toast",
          title: "text-sm font-medium leading-5 text-foreground",
          description: "text-xs leading-5 text-muted-foreground",
          closeButton: "kqa-toast-close",
        },
      }}
    />
  );
}
export { toast };
