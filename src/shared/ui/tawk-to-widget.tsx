import { useEffect } from "react";

declare global {
  interface Window {
    Tawk_API?: Record<string, unknown>;
    Tawk_LoadStart?: Date;
  }
}

export default function TawkToWidget() {
  useEffect(() => {
    // Prevent loading the widget more than once
    if (document.getElementById("tawk-to-script")) {
      return;
    }

    window.Tawk_API = window.Tawk_API || {};
    window.Tawk_LoadStart = new Date();

    const script = document.createElement("script");

    script.id = "tawk-to-script";
    script.async = true;
    script.src = "https://embed.tawk.to/6a7233c32539311d47e45f86/1jv71kd9p";
    script.charset = "UTF-8";
    script.setAttribute("crossorigin", "*");

    document.body.appendChild(script);
  }, []);

  return null;
}
