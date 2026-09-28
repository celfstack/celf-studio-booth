import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
export const Route = createFileRoute("/together/")({ component: Together });
function Together() {
  useEffect(() => {
    window.location.replace("/?mode=together");
  }, []);
  return <p className="p-8">Opening the booth…</p>;
}
