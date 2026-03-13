"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";

const HIDE_SIDEBAR_ROUTES = ["/auth", "/setup"];

export default function ConditionalSidebar() {
  const pathname = usePathname();
  if (HIDE_SIDEBAR_ROUTES.some((r) => pathname.startsWith(r))) return null;
  return <Sidebar />;
}
