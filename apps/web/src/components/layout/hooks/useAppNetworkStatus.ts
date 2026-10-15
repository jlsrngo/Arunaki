import { useState, useEffect } from "react";
import { toast } from "sonner";

export function useAppNetworkStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== "undefined" ? navigator.onLine : true;
  });

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success("Network connected", {
        description: "Internet connection restored.",
        duration: 3000,
      });
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast.error("Network offline", {
        description: "Computer is disconnected from the network.",
        duration: 5000,
      });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return { isOnline };
}
