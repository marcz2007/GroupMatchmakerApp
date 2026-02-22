import { useState, useEffect } from "react";
import { Platform, Dimensions } from "react-native";

const DESKTOP_BREAKPOINT = 768;

export function useResponsiveLayout(): { isDesktopWeb: boolean } {
  const [isDesktopWeb, setIsDesktopWeb] = useState(() => {
    if (Platform.OS !== "web") return false;
    return Dimensions.get("window").width >= DESKTOP_BREAKPOINT;
  });

  useEffect(() => {
    if (Platform.OS !== "web") return;

    const onChange = ({ window }: { window: { width: number } }) => {
      setIsDesktopWeb(window.width >= DESKTOP_BREAKPOINT);
    };

    const subscription = Dimensions.addEventListener("change", onChange);
    return () => subscription.remove();
  }, []);

  return { isDesktopWeb };
}
