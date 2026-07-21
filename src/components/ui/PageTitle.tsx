import { useEffect } from "react";

export function PageTitle({ title }: { title: string }) {
  useEffect(() => { document.title = `${title} — Politik.my`; }, [title]);
  return null;
}
