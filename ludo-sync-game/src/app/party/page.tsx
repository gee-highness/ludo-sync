import { Suspense } from "react";
import PartyClient from "@/components/party/PartyClient";

export const metadata = { title: "Party · Ludo Sync" };

export default function PartyPage() {
  return <Suspense fallback={null}><PartyClient /></Suspense>;
}
